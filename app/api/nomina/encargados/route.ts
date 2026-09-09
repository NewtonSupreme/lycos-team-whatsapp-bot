import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { encargadosDeNotas, limpiarNombre, resolverEncargado } from '@/lib/nomina/encargados';

export const dynamic = 'force-dynamic';

/**
 * Reconcilia los encargados escritos a mano con las fichas del personal.
 *
 * Durante mucho tiempo la orden guardó a quien hizo el trabajo como texto
 * dentro de `notas` ("Encargados: TECNICO ALINEACION. RAFAEL"). Nadie quedaba
 * enlazado, así que el trabajo no llegaba a nómina y el mismo nombre aparecía
 * escrito de seis formas distintas.
 *
 * `GET` dice qué haría, sin tocar nada. `POST` lo hace: crea las fichas del
 * personal que trabajó y no está registrado, y escribe el enlace en
 * `servicios.encargados`.
 *
 * Lo que NO hace, a propósito:
 *
 *  · No genera comisiones. Enlazar a la persona es un hecho; cuánto le toca es
 *    una decisión con dinero de por medio, y esa se revisa en «Sin asignar».
 *  · No inventa gente. Un texto que no parece un nombre —"otro", "Mecánica" o
 *    una placa escrita en el campo equivocado— se reporta y se deja quieto.
 */

const NO_ES_NOMBRE = /^(mec[aá]nic[ao]|otro|externo|taller|general|n\/a|ninguno|sin\s*asignar)$/i;
/** Una placa venezolana metida en el campo del encargado. Pasa. */
const ES_PLACA = /^[A-Z]{1,3}\d{2,4}[A-Z]{0,3}$/;

interface Persona { id: string; nombre: string; alias: string | null; activo: boolean | null; sede_id: string | null }

interface Analisis {
  vincular: { texto: string; veces: number; empleado_id: string; nombre: string; certeza: string; inactivo: boolean }[];
  crear: { texto: string; veces: number; propuesto: string; sede_id: string | null; ejemplo: string | null }[];
  descartar: { texto: string; veces: number; razon: string; ejemplo: string | null }[];
  ordenes: number;
  menciones: number;
}

/** Recorre las órdenes y clasifica cada nombre escrito a mano. */
async function analizar(
  db: Awaited<ReturnType<typeof authorize>> extends { db: infer D } ? D : never,
  sede: string | null,
): Promise<{ analisis: Analisis; personal: Persona[]; servicios: { id: string; notas: string | null; sede_id: string | null; fecha: string; placa: string | null }[] }> {
  // Todas las fichas, también las inactivas: son las que permiten distinguir a
  // la persona real de su duplicado. Al resolver siempre gana la activa.
  let uq = db.from('usuarios').select('id, nombre, alias, activo, sede_id');
  if (sede) uq = uq.eq('sede_id', sede);
  const { data: gente } = await uq;
  const personal = (gente || []) as Persona[];

  let sq = db.from('servicios').select('id, notas, sede_id, fecha, placa').not('notas', 'is', null);
  if (sede) sq = sq.eq('sede_id', sede);
  const { data: servs } = await sq;
  const servicios = (servs || []) as { id: string; notas: string | null; sede_id: string | null; fecha: string; placa: string | null }[];

  const vincular = new Map<string, Analisis['vincular'][number]>();
  const crear = new Map<string, Analisis['crear'][number]>();
  const descartar = new Map<string, Analisis['descartar'][number]>();
  let ordenes = 0;
  let menciones = 0;

  for (const s of servicios) {
    const nombres = encargadosDeNotas(s.notas);
    if (nombres.length === 0) continue;
    ordenes += 1;

    for (const raw of nombres) {
      menciones += 1;
      const texto = raw.trim();

      const hit = resolverEncargado(texto, personal);
      if (hit) {
        const previo = vincular.get(texto);
        if (previo) { previo.veces += 1; continue; }
        vincular.set(texto, {
          texto, veces: 1,
          empleado_id: hit.persona.id, nombre: hit.persona.nombre,
          certeza: hit.certeza, inactivo: hit.persona.activo === false,
        });
        continue;
      }

      const limpio = limpiarNombre(texto);
      const bruto = texto.replace(/\(.*?\)/g, '').trim();
      const esPlaca = ES_PLACA.test(bruto.toUpperCase().replace(/\s/g, ''));

      if (!limpio || NO_ES_NOMBRE.test(limpio) || NO_ES_NOMBRE.test(bruto) || esPlaca) {
        const previo = descartar.get(texto);
        if (previo) { previo.veces += 1; continue; }
        descartar.set(texto, {
          texto, veces: 1,
          razon: esPlaca ? 'Es una placa escrita en el campo del encargado' : 'No es el nombre de una persona',
          ejemplo: s.placa,
        });
        continue;
      }

      const propuesto = limpio.toUpperCase();
      const previo = crear.get(propuesto);
      if (previo) { previo.veces += 1; continue; }
      crear.set(propuesto, { texto, veces: 1, propuesto, sede_id: s.sede_id, ejemplo: s.placa });
    }
  }

  const porVeces = <T extends { veces: number }>(a: T, b: T) => b.veces - a.veces;

  return {
    analisis: {
      vincular: [...vincular.values()].sort(porVeces),
      crear: [...crear.values()].sort(porVeces),
      descartar: [...descartar.values()].sort(porVeces),
      ordenes, menciones,
    },
    personal, servicios,
  };
}

export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const servicioId = url.searchParams.get('servicio');

  // ── Una sola orden: quién la hizo ────────────────────────────────────────
  //
  // Lo pide el formulario al abrir una orden vieja. Su «Personal a cargo»
  // salía vacío porque solo miraba `job_assignments`, y las órdenes de antes
  // no tienen ninguno: su encargado quedó escrito dentro de `notas`. Aquí se
  // devuelve enlazado, sea que ya esté reconciliado o haya que resolverlo.
  if (servicioId) {
    const { data: s } = await auth.db.from('servicios')
      .select('id, notas, encargados').eq('id', servicioId).maybeSingle();
    if (!s) return NextResponse.json({ error: 'Esa orden no existe.' }, { status: 404 });

    const guardados = Array.isArray(s.encargados) ? s.encargados : [];
    if (guardados.length > 0) {
      return NextResponse.json({ encargados: guardados, origen: 'enlazado' });
    }

    const nombres = encargadosDeNotas(s.notas);
    if (nombres.length === 0) return NextResponse.json({ encargados: [], origen: 'ninguno' });

    const { data: gente } = await auth.db.from('usuarios').select('id, nombre, alias, activo, sede_id');
    const personal = (gente || []) as Persona[];

    const encargados: { empleado_id: string; nombre: string; texto_original: string; certeza: string }[] = [];
    for (const raw of nombres) {
      const hit = resolverEncargado(raw, personal);
      if (!hit || encargados.some(e => e.empleado_id === hit.persona.id)) continue;
      encargados.push({
        empleado_id: hit.persona.id, nombre: hit.persona.nombre,
        texto_original: raw.trim(), certeza: hit.certeza,
      });
    }
    return NextResponse.json({ encargados, origen: 'notas', textos: nombres });
  }

  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const { analisis } = await analizar(auth.db, sede);
  return NextResponse.json({ ...analisis, aplicado: false });
}

export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo opcional */ }

  const sede = auth.effectiveSede((body.sede as string) ?? null);
  // Sin `crearFaltantes` solo se enlaza contra lo que ya existe: se puede
  // arreglar el enlace sin dar de alta a nadie.
  const crearFaltantes = body.crearFaltantes !== false;

  const { analisis, servicios } = await analizar(auth.db, sede);

  // ── 1 · Alta del personal que trabajó y no estaba registrado ─────────────
  const creados: { id: string; nombre: string; veces: number }[] = [];
  if (crearFaltantes) {
    for (const c of analisis.crear) {
      const slug = c.propuesto.toLowerCase().replace(/\s+/g, '_');
      const { data, error } = await auth.db.from('usuarios').insert({
        username: `${slug}_${Date.now()}`,
        nombre: c.propuesto,
        email: `${slug}@lycosteam.internal`,
        // Es personal de taller, no alguien que entra al sistema.
        password_hash: 'NO_ACCESS_STAFF',
        rol: 'mecanico',
        activo: true,
        sede_id: c.sede_id ?? sede,
        cargo: 'Mecánico',
        area: 'Taller',
        bio: 'Ficha creada al reconciliar los encargados escritos a mano. Falta completar cédula, zona y reglas de pago.',
      }).select('id, nombre').single();
      if (error || !data) continue;
      creados.push({ id: data.id, nombre: data.nombre, veces: c.veces });
    }
  }

  // ── 2 · Enlace de cada orden con su persona ──────────────────────────────
  let uq = auth.db.from('usuarios').select('id, nombre, alias, activo, sede_id');
  if (sede) uq = uq.eq('sede_id', sede);
  const { data: gente } = await uq;
  const personal = (gente || []) as Persona[];

  let enlazadas = 0;
  let sinEnlace = 0;
  const pendientes = new Map<string, number>();

  for (const s of servicios) {
    const nombres = encargadosDeNotas(s.notas);
    if (nombres.length === 0) continue;

    const encargados: { empleado_id: string; nombre: string; texto_original: string }[] = [];
    for (const raw of nombres) {
      const hit = resolverEncargado(raw, personal);
      if (!hit) {
        sinEnlace += 1;
        pendientes.set(raw.trim(), (pendientes.get(raw.trim()) || 0) + 1);
        continue;
      }
      // Dos formas del mismo nombre en una orden son una sola persona.
      if (encargados.some(e => e.empleado_id === hit.persona.id)) continue;
      encargados.push({ empleado_id: hit.persona.id, nombre: hit.persona.nombre, texto_original: raw.trim() });
    }
    if (encargados.length === 0) continue;

    const { error } = await auth.db.from('servicios').update({ encargados }).eq('id', s.id);
    if (!error) enlazadas += 1;
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre,
    modulo: 'nomina',
    accion: 'Encargados reconciliados',
    detalles: `${enlazadas} orden(es) enlazadas · ${creados.length} ficha(s) creada(s) · ${sinEnlace} mención(es) sin enlazar`,
    sede_id: sede,
  });

  return NextResponse.json({
    aplicado: true,
    creados,
    enlazadas,
    menciones: analisis.menciones,
    sinEnlace,
    pendientes: [...pendientes.entries()].map(([texto, veces]) => ({ texto, veces })),
    descartadas: analisis.descartar,
  });
}
