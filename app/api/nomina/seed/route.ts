import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/**
 * Plantillas de comisión de Lycos Team — calcadas de las RELACIONES DE PAGO
 * reales de administración (semanas 25/26) y del catálogo de empleados:
 *
 *  · Rafael (V-16.278.639, alineación): 25% alineación · 40% revisión/reemplazo.
 *    En Bs por puente: proveedor 35% · Lycos 45% · Rafael 20%.
 *  · Roger (V-10.279.435, mecánica): $40/sem fijo + 40% mano de obra.
 *  · Jim (V-11.038.792, jefe de taller): 7% supervisión sobre la mano de obra
 *    de los carros del taller + 40% si él ejecuta el trabajo.
 *  · Acevedo (V-3.882.980, inventario): $40/sem fijo.
 *  · Freddy (V-11.098.823, silenciadores): 50% de CADA trabajo.
 *  · Nelson/Margarito (V-8.683.914, cauchera): 30% reparación · 40% revisión/
 *    rotación · 100% adicional · resto Por definir.
 *  · Angel (V-16.888.296, latonería): Por definir (según presupuesto del cliente).
 *  · Frank/Francisco (V-9.284.889, mecánica): 40% mano de obra.
 *  · Dyan (V-29.622.223, autolavado): Por definir (caso especial).
 *
 * El admin mapea qué fila de `usuarios` es cada persona (no se hardcodean nombres);
 * al aplicar, también se guarda su cédula, alias y área en el perfil del empleado.
 * Las reglas con condiciones.tipos se evalúan contra el TEXTO del trabajo
 * (descripción/tipo), p. ej. "Rotación" → 40% en la cauchera.
 */

interface TemplateMeta {
  cedula: string;
  alias?: string;
  /** Zona de trabajo del catálogo (`ZONAS_TRABAJO`), no texto libre. */
  especialidad: string;
  nombreCompleto: string;
  /** Rol del panel: define qué puede ver y hacer. */
  rol: string;
  /** Puesto real. El rol da permisos; el cargo describe el trabajo. */
  cargo: string;
  area: string;
  tipo_contrato: string;
  /** Nombres con los que aparece en las hojas de pago, para reconocerlo. */
  alterno?: string[];
}

/**
 * El personal del taller tal como está en las relaciones de pago.
 *
 * `especialidad` usa siempre una zona válida del catálogo: la jefatura y el
 * almacén no son zonas de trabajo, así que van en `cargo`/`area` —que es donde
 * RRHH los muestra— y su zona queda en la que realmente supervisan o atienden.
 */
const META: Record<string, TemplateMeta> = {
  rafael:  { cedula: 'V-16.278.639', especialidad: 'alineacion', nombreCompleto: 'Rafael Antonio Ramirez',
             rol: 'mecanico', cargo: 'Alineación y balanceo', area: 'Taller', tipo_contrato: 'Por comisión' },
  roger:   { cedula: 'V-10.279.435', especialidad: 'mecanica', nombreCompleto: 'Roger Rafael Rodriguez Bello',
             rol: 'mecanico', cargo: 'Mecánico', area: 'Taller', tipo_contrato: 'Tiempo completo',
             alterno: ['MECANICO ROGER', 'ROGER'] },
  jim:     { cedula: 'V-11.038.792', especialidad: 'mecanica', nombreCompleto: 'Jim Carboney Rincon Perez',
             rol: 'jefe_taller', cargo: 'Jefe de taller', area: 'Taller', tipo_contrato: 'Tiempo completo',
             alterno: ['JIM'] },
  acevedo: { cedula: 'V-3.882.980', especialidad: 'general', nombreCompleto: 'Antonio Jose Acevedo Colmenares',
             rol: 'registrador', cargo: 'Almacén e inventario', area: 'Almacén', tipo_contrato: 'Tiempo completo',
             alterno: ['ACEVEDO'] },
  freddy:  { cedula: 'V-11.098.823', especialidad: 'escape', nombreCompleto: 'Freddy Ramón Rodriguez Cordova',
             rol: 'mecanico', cargo: 'Técnico en silenciadores', area: 'Taller', tipo_contrato: 'Por comisión',
             alterno: ['FREDDY'] },
  nelson:  { cedula: 'V-8.683.914', alias: 'NELSON', especialidad: 'cauchera', nombreCompleto: 'Margarito Carvajal',
             rol: 'mecanico', cargo: 'Cauchera', area: 'Taller', tipo_contrato: 'Por comisión',
             alterno: ['NELSON', 'MARGARITO'] },
  angel:   { cedula: 'V-16.888.296', especialidad: 'latoneria', nombreCompleto: 'Angel Luis Perez Espinoza',
             rol: 'mecanico', cargo: 'Latonería y pintura', area: 'Taller', tipo_contrato: 'Por comisión',
             alterno: ['ANGEL'] },
  frank:   { cedula: 'V-9.284.889', especialidad: 'mecanica', nombreCompleto: 'Francisco Antonio Hernandez Ruiz',
             rol: 'mecanico', cargo: 'Mecánico', area: 'Taller', tipo_contrato: 'Por comisión',
             alterno: ['FRANK', 'FRANCISCO'] },
  dyan:    { cedula: 'V-29.622.223', especialidad: 'autolavado', nombreCompleto: 'Dyan Andres Anchundia Mota',
             rol: 'mecanico', cargo: 'Autolavado', area: 'Taller', tipo_contrato: 'Por comisión',
             alterno: ['DYAN'] },
};

export const PLANTILLAS_PERSONAL = META;

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Contraseña larga y aleatoria: la cuenta nace sin que nadie pueda entrar. */
function claveAleatoria(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 20; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

/** Fila lista para insertar en `commission_rules` / `flat_rate_catalog`. */
type FilaRegla = Record<string, unknown>;

function buildTemplate(key: string, empleadoId: string, sede: string | null, proveedor: string) {
  const rules: FilaRegla[] = [];
  const flats: FilaRegla[] = [];
  // Todas las claves opcionales van aquí con su valor neutro. Al insertar el
  // lote, PostgREST iguala las columnas entre filas y manda NULL explícito en
  // las que falten: sin esto, una sola regla con `proveedor_pct` hacía que el
  // resto llegara con NULL y el insert entero se caía.
  const base = {
    empleado_id: empleadoId,
    sede_id: sede,
    activo: true,
    moneda: 'USD',
    aplica_monedas: null as string[] | null,
    proveedor_pct: 0,
    proveedor_nombre: null as string | null,
    condiciones: {} as Record<string, unknown>,
    vigencia_hasta: null as string | null,
  };

  switch (key) {
    case 'rafael':
      rules.push(
        // Revisión / reemplazo de piezas → 40% (hoja real: Revisión $5 → $2 = 40%)
        { ...base, zona: 'alineacion', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 40,
          prioridad: 5, condiciones: { tipos: ['revision', 'reemplazo', 'amortiguador', 'base', 'tren'] },
          descripcion: 'Revisión / reemplazo de piezas 40%' },
        { ...base, zona: 'alineacion', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 25,
          aplica_monedas: ['USD', 'EUR'], prioridad: 10, descripcion: 'Alineación 25% (divisa)' },
        { ...base, zona: 'alineacion', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 20,
          aplica_monedas: ['VES'], moneda: 'VES', proveedor_pct: 35, proveedor_nombre: proveedor, prioridad: 9,
          descripcion: 'Alineación 20% (Bs, puente proveedor 35% · Lycos 45%)' },
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Mecánica 40% mano de obra' },
      );
      break;

    case 'roger':
      rules.push(
        { ...base, zona: 'all', tipo_regla: 'fijo_semanal', base: 'ingreso_total', valor: 40,
          prioridad: 1, descripcion: 'Sueldo fijo $40 semanal' },
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Mecánica 40% mano de obra (Lycos 60%)' },
      );
      break;

    case 'jim':
      rules.push(
        { ...base, zona: 'mecanica', tipo_regla: 'override_cascada', base: 'mano_obra', valor: 7,
          prioridad: 5, descripcion: 'Supervisión 7% s/ mano de obra de los carros del taller' },
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Ejecución propia 40% mano de obra' },
      );
      break;

    case 'acevedo':
      rules.push(
        { ...base, zona: 'all', tipo_regla: 'fijo_semanal', base: 'ingreso_total', valor: 40,
          prioridad: 1, descripcion: 'Dpto. Inventario — sueldo fijo $40 semanal' },
      );
      break;

    case 'freddy':
      // Hoja real "Técnico en silenciadores": 50% de CADA trabajo (soldadura,
      // silenciador, revisión, empacadura…). Los $5/$1 de antes eran 50% de $10/$2.
      rules.push(
        { ...base, zona: 'escape', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 50,
          prioridad: 10, descripcion: 'Silenciadores — 50% por cada trabajo' },
      );
      break;

    case 'nelson':
      // Hoja "NELSON SEM 25" (Margarito Carvajal): % según el tipo de servicio.
      rules.push(
        { ...base, zona: 'cauchera', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 30,
          prioridad: 5, condiciones: { tipos: ['reparacion'] }, descripcion: 'Reparación de caucho 30%' },
        { ...base, zona: 'cauchera', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 40,
          prioridad: 6, condiciones: { tipos: ['revision', 'rotacion'] }, descripcion: 'Revisión / rotación 40%' },
        { ...base, zona: 'cauchera', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 100,
          prioridad: 7, condiciones: { tipos: ['adicional'] }, descripcion: 'Adicional (aprobado) 100%' },
        { ...base, zona: 'cauchera', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 0,
          prioridad: 15, descripcion: 'Cauchera — otros servicios: Por definir' },
      );
      break;

    case 'angel':
      rules.push(
        { ...base, zona: 'latoneria', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 0,
          prioridad: 15, descripcion: 'Latonería y Pintura — Por definir (según presupuesto con el cliente)' },
      );
      break;

    case 'dyan':
      rules.push(
        { ...base, zona: 'autolavado', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 0,
          prioridad: 15, descripcion: 'Autolavado — Por definir (caso especial pendiente por administración)' },
      );
      break;

    case 'frank':
      rules.push(
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Mecánica 40% mano de obra' },
      );
      break;
  }
  return { rules, flats };
}

export async function POST(req: NextRequest) {
  const auth = await authorize('nomina', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (resolveRol(auth.user!.rol) !== 'admin') {
    return NextResponse.json({ error: 'Sólo el Administrador puede aplicar plantillas de comisión.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const assignments: Record<string, string> = (body.assignments as Record<string, string>) || {};
  const sede = auth.effectiveSede((body.sede_id as string) ?? null);
  const proveedor = (body.proveedor_nombre as string) || 'Proveedor Puente Alineación';

  // ── Alta o reconocimiento del personal ───────────────────────────────────
  // Con `crearFaltantes` el sembrado deja de necesitar que alguien mapee a mano
  // cada plantilla: reconoce a quien ya está —aunque lo hayan dado de baja o
  // guardado con apodo— y da de alta al que falta con su ficha completa.
  const creados: { key: string; nombre: string; id: string }[] = [];
  const reactivados: { key: string; nombre: string; id: string }[] = [];

  if (body.crearFaltantes) {
    const { data: existentes } = await auth.db
      .from('usuarios').select('id, nombre, username, cedula, rol, activo, sede_id');
    const gente = existentes || [];

    for (const [key, meta] of Object.entries(META)) {
      if (assignments[key]) continue;   // ya viene mapeado a mano

      // 1º por cédula (identidad dura), 2º por nombre o apodo de las hojas.
      const nombres = [meta.nombreCompleto, ...(meta.alterno || [])].map(sinAcentos);
      const hallado = gente.find(u => u.cedula && u.cedula === meta.cedula)
        || gente.find(u => {
          const n = sinAcentos(u.nombre || '');
          return nombres.some(x => n === x || n.startsWith(x + ' ') || x.startsWith(n));
        });

      const ficha = {
        nombre: meta.nombreCompleto,
        cedula: meta.cedula,
        alias: meta.alias ?? null,
        especialidad: meta.especialidad,
        rol: meta.rol,
        cargo: meta.cargo,
        area: meta.area,
        tipo_contrato: meta.tipo_contrato,
        sede_id: sede ?? auth.user!.sede_id ?? null,
        activo: true,
        updated_at: new Date().toISOString(),
      };

      if (hallado) {
        // Estaban dados de baja con el nombre a medias. Se completan y se
        // reactivan, en vez de crear un duplicado al lado.
        await auth.db.from('usuarios').update({ ...ficha, fecha_egreso: null }).eq('id', hallado.id);
        assignments[key] = hallado.id;
        if (hallado.activo === false) reactivados.push({ key, nombre: meta.nombreCompleto, id: hallado.id });
      } else {
        const usuario = sinAcentos(meta.nombreCompleto).split(' ').slice(0, 2).join('.').replace(/[^a-z.]/g, '');
        const { data: nuevo, error } = await auth.db.from('usuarios').insert({
          ...ficha,
          username: `${usuario}.${Date.now().toString(36)}`,
          email: `${usuario}@lycosteam.internal`,
          // Nace sin clave utilizable: se le pone una desde su ficha de RRHH
          // cuando de verdad necesite entrar al panel.
          password_hash: claveAleatoria(),
        }).select('id').single();
        if (error) return NextResponse.json({ error: `No se pudo crear a ${meta.nombreCompleto}: ${error.message}` }, { status: 500 });
        assignments[key] = nuevo!.id;
        creados.push({ key, nombre: meta.nombreCompleto, id: nuevo!.id });
      }
    }
  }

  const empleadoIds = Object.values(assignments).filter(Boolean);
  if (empleadoIds.length === 0) {
    return NextResponse.json({ error: 'Debes asignar al menos un empleado a una plantilla.' }, { status: 400 });
  }

  // Re-seed determinista: limpia reglas/tarifas previas (de ESTA sede) de los empleados mapeados.
  for (const empId of empleadoIds) {
    let dr = auth.db.from('commission_rules').delete().eq('empleado_id', empId);
    let df = auth.db.from('flat_rate_catalog').delete().eq('empleado_id', empId);
    if (sede) { dr = dr.eq('sede_id', sede); df = df.eq('sede_id', sede); }
    else { dr = dr.is('sede_id', null); df = df.is('sede_id', null); }
    await dr; await df;
  }

  const allRules: FilaRegla[] = [];
  const allFlats: FilaRegla[] = [];
  for (const [key, empId] of Object.entries(assignments)) {
    if (!empId) continue;
    const { rules, flats } = buildTemplate(key, empId, sede, proveedor);
    allRules.push(...rules); allFlats.push(...flats);

    // Completa el perfil del empleado con su identidad del catálogo:
    // cédula, alias de las hojas de pago y área de trabajo.
    const meta = META[key];
    if (meta) {
      await auth.db.from('usuarios').update({
        cedula: meta.cedula,
        alias: meta.alias ?? null,
        especialidad: meta.especialidad,
        cargo: meta.cargo,
        area: meta.area,
        tipo_contrato: meta.tipo_contrato,
        updated_at: new Date().toISOString(),
      }).eq('id', empId);
    }
  }

  if (allRules.length) {
    const { error } = await auth.db.from('commission_rules').insert(allRules);
    if (error) return NextResponse.json({ error: 'Error insertando reglas: ' + error.message }, { status: 500 });
  }
  if (allFlats.length) {
    const { error } = await auth.db.from('flat_rate_catalog').insert(allFlats);
    if (error) return NextResponse.json({ error: 'Error insertando tarifas: ' + error.message }, { status: 500 });
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'nomina', accion: 'Plantillas de comisión aplicadas',
    detalles: `${empleadoIds.length} empleado(s) · ${allRules.length} reglas · cédulas/áreas actualizadas`,
    sede_id: sede,
  });
  return NextResponse.json({
    success: true,
    rules: allRules.length,
    flats: allFlats.length,
    empleados: empleadoIds.length,
    creados,
    reactivados,
  });
}
