import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getPayrollService } from '@/lib/payroll/service';
import { categoriaToZona, inferirCategoria } from '@/lib/categorias';
import { getRoleMeta } from '@/types';
import { encargadosDeNotas, resolverEncargado } from '@/lib/nomina/encargados';

export const dynamic = 'force-dynamic';

/**
 * Encuentra el trabajo que se cobró pero nunca entró a nómina.
 *
 * Nace de un problema real: de 517 órdenes de servicio solo 17 tenían comisión,
 * y de 604 ventas, ninguna. El trabajo estaba hecho y cobrado, pero como nadie
 * asignó técnico —el selector salía casi vacío— nunca se generó la comisión.
 *
 * No usa IA: lee el texto que ya escribió la gente y aplica el MISMO
 * clasificador que usa la orden de servicio, la misma zona y las mismas reglas
 * del motor. Lo que propone es exactamente lo que se va a guardar, y cada
 * propuesta viene con el motivo para poder discutirla.
 */

interface Propuesta {
  origen: 'servicio' | 'venta';
  id: string;
  fecha: string;
  titulo: string;
  descripcion: string;
  cliente: string | null;
  placa: string | null;
  monto: number;
  manoObra: number;
  categoria: string;
  zona: string;
  categoriaOrigen: 'guardada' | 'detectada';
  empleado_id: string | null;
  empleado_nombre: string | null;
  motivoTecnico: string;
  /** De dónde sale la propuesta: el dato lo dice, o se dedujo por la zona. */
  confianza: 'confirmada' | 'supuesta' | 'ninguna';
  comision: number;
  regla: string | null;
  sinRegla: boolean;
  porDefinir: boolean;
}

const n2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const inicio = String(body.inicio || '');
  const fin = String(body.fin || '');
  if (!inicio || !fin) return NextResponse.json({ error: 'Indica el período.' }, { status: 400 });

  const sede = auth.effectiveSede((body.sede as string) ?? null);
  const incluirVentas = body.incluirVentas !== false;
  const limite = Math.min(Number(body.limite) || 120, 300);

  // ── Personal disponible ───────────────────────────────────────────────────
  // Se traen también los inactivos: cientos de órdenes viejas nombran a gente
  // cuya ficha se desactivó o quedó duplicada, y sin tenerlas todas el
  // resolvedor no puede saber a cuál de las dos apunta el texto. Al elegir
  // siempre prefiere la activa; tenerlas delante es lo que le deja descartar.
  let uq = auth.db.from('usuarios').select('id, nombre, alias, rol, especialidad, activo');
  if (sede) uq = uq.eq('sede_id', sede);
  const { data: gente } = await uq;
  const personal = (gente || []) as {
    id: string; nombre: string; alias: string | null; rol: string;
    especialidad: string | null; activo: boolean | null;
  }[];

  const tecnicosPorZona = new Map<string, typeof personal>();
  for (const p of personal) {
    if (p.activo === false) continue;   // la zona solo la cubre quien sigue trabajando
    if (!getRoleMeta(p.rol)?.esTecnico) continue;
    const z = p.especialidad === 'lavado' ? 'autolavado' : (p.especialidad || '');
    if (!z) continue;
    tecnicosPorZona.set(z, [...(tecnicosPorZona.get(z) || []), p]);
  }

  // ── Lo que ya tiene comisión no se vuelve a proponer ─────────────────────
  const { data: yaHechos } = await auth.db
    .from('job_assignments').select('referencia_id').not('referencia_id', 'is', null);
  const conComision = new Set((yaHechos || []).map(j => j.referencia_id as string));

  const candidatos: Propuesta[] = [];

  // ── Órdenes de servicio ───────────────────────────────────────────────────
  let sq = auth.db.from('servicios')
    .select('id, fecha, tipo, tipo_personalizado, descripcion, categoria, costo_final, total_pagado, costo_estimado, items, notas, nombre_cliente, placa, estado')
    .gte('fecha', inicio).lte('fecha', fin)
    .order('fecha', { ascending: false }).limit(limite * 2);
  if (sede) sq = sq.eq('sede_id', sede);
  const { data: servicios, error: e1 } = await sq;
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  for (const s of servicios || []) {
    if (conComision.has(s.id)) continue;

    const items = Array.isArray(s.items) ? s.items as { descripcion?: string; total?: number }[] : [];
    const texto = [
      s.tipo_personalizado, s.tipo, s.descripcion,
      items.map(i => i.descripcion).join(' '),
    ].filter(Boolean).join(' ');

    const monto = n2(s.costo_final ?? s.total_pagado ?? s.costo_estimado ?? 0);
    if (monto <= 0) continue;   // sin monto no hay comisión que calcular

    const categoria = s.categoria || inferirCategoria(texto);
    const zona = categoriaToZona(categoria);

    // Quién lo hizo: primero lo que digan las notas, luego el único técnico de esa zona.
    let empleado = null as typeof personal[number] | null;
    let motivo = 'Nadie asignado: elígelo tú';
    let confianza: Propuesta['confianza'] = 'ninguna';

    // Lo que dice la orden vale más que cualquier deducción.
    for (const nombre of encargadosDeNotas(s.notas)) {
      const hit = resolverEncargado(nombre, personal);
      if (!hit) continue;
      empleado = hit.persona;
      motivo = hit.motivo;
      // Una coincidencia aproximada ("RAFEL" → Rafael) no se da por hecha: se
      // propone, pero pidiendo confirmación como cualquier otra suposición.
      confianza = hit.certeza === 'exacta' ? 'confirmada' : 'supuesta';
      break;
    }
    if (!empleado) {
      const deZona = tecnicosPorZona.get(zona) || [];
      if (deZona.length === 1) {
        empleado = deZona[0];
        motivo = `Supuesto: es el único de ${zona}`;
        confianza = 'supuesta';
      } else if (deZona.length > 1) {
        motivo = `${deZona.length} técnicos en ${zona}: elige`;
      }
    }

    candidatos.push({
      origen: 'servicio', id: s.id, fecha: s.fecha,
      titulo: s.tipo_personalizado || s.tipo || 'Servicio',
      descripcion: (s.descripcion || items.map(i => i.descripcion).join(' + ') || '').slice(0, 160),
      cliente: s.nombre_cliente, placa: s.placa,
      monto, manoObra: monto,
      categoria, zona,
      categoriaOrigen: s.categoria ? 'guardada' : 'detectada',
      empleado_id: empleado?.id ?? null,
      empleado_nombre: empleado?.nombre ?? null,
      motivoTecnico: motivo, confianza,
      comision: 0, regla: null, sinRegla: false, porDefinir: false,
    });
  }

  // ── Ventas del mostrador ──────────────────────────────────────────────────
  if (incluirVentas) {
    let vq = auth.db.from('ventas_dia')
      .select('id, fecha, cliente, placa, vehiculo_info, categoria, total_ingresos, desglose, notas')
      .gte('fecha', inicio).lte('fecha', fin)
      .order('fecha', { ascending: false }).limit(limite * 2);
    if (sede) vq = vq.eq('sede_id', sede);
    const { data: ventas } = await vq;

    for (const v of ventas || []) {
      if (conComision.has(v.id)) continue;
      const monto = n2(v.total_ingresos);
      if (monto <= 0) continue;

      const desglose = Array.isArray(v.desglose) ? v.desglose as { descripcion?: string }[] : [];
      const texto = [v.categoria, desglose.map(d => d.descripcion).join(' '), v.notas].filter(Boolean).join(' ');
      const categoria = v.categoria || inferirCategoria(texto);
      const zona = categoriaToZona(categoria);

      // En el mostrador no hay notas de encargado, así que como mucho se supone.
      let empleado = null as typeof personal[number] | null;
      let motivo = 'Nadie asignado: elígelo tú';
      let confianza: Propuesta['confianza'] = 'ninguna';
      const deZona = tecnicosPorZona.get(zona) || [];
      if (deZona.length === 1) {
        empleado = deZona[0];
        motivo = `Supuesto: es el único de ${zona}`;
        confianza = 'supuesta';
      } else if (deZona.length > 1) {
        motivo = `${deZona.length} técnicos en ${zona}: elige`;
      }

      candidatos.push({
        origen: 'venta', id: v.id, fecha: v.fecha,
        titulo: 'Venta de mostrador',
        descripcion: (desglose.map(d => d.descripcion).filter(Boolean).join(' + ') || v.notas || '').slice(0, 160),
        cliente: v.cliente, placa: v.placa,
        monto, manoObra: monto,
        categoria, zona,
        categoriaOrigen: v.categoria ? 'guardada' : 'detectada',
        empleado_id: empleado?.id ?? null,
        empleado_nombre: empleado?.nombre ?? null,
        motivoTecnico: motivo, confianza,
        comision: 0, regla: null, sinRegla: false, porDefinir: false,
      });
    }
  }

  candidatos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const propuestas = candidatos.slice(0, limite);

  // ── Comisión real de cada propuesta, con las reglas de verdad ────────────
  const conTecnico = propuestas.filter(p => p.empleado_id);
  if (conTecnico.length > 0) {
    const svc = getPayrollService(auth.db);
    const preview = await svc.previewJobs(conTecnico.map((p, i) => ({
      ref: String(i),
      empleado_id: p.empleado_id,
      es_taller: false,
      zona: p.zona,
      tipo_trabajo: p.titulo,
      descripcion: p.descripcion,
      ingreso_total: p.monto,
      mano_obra: p.manoObra,
      cantidad: 1,
      moneda: 'USD',
      sede_id: sede,
    })));

    preview.forEach((r: Record<string, unknown>, i: number) => {
      const p = conTecnico[Number(r.ref ?? i)];
      if (!p) return;
      p.comision = n2(r.comision_usd);
      p.regla = (r.regla_descripcion as string) ?? null;
      p.sinRegla = !!r.sin_regla;
      p.porDefinir = !!r.por_definir;
    });
  }

  return NextResponse.json({
    periodo: { inicio, fin },
    total: candidatos.length,
    mostradas: propuestas.length,
    conTecnico: propuestas.filter(p => p.empleado_id).length,
    sinTecnico: propuestas.filter(p => !p.empleado_id).length,
    confirmadas: propuestas.filter(p => p.confianza === 'confirmada').length,
    supuestas: propuestas.filter(p => p.confianza === 'supuesta').length,
    comisionTotal: n2(propuestas.reduce((s, p) => s + p.comision, 0)),
    propuestas,
  });
}
