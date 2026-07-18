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

interface TemplateMeta { cedula: string; alias?: string; especialidad: string; nombreCompleto: string; }

const META: Record<string, TemplateMeta> = {
  rafael:  { cedula: 'V-16.278.639', especialidad: 'alineacion', nombreCompleto: 'Rafael Antonio Ramirez' },
  roger:   { cedula: 'V-10.279.435', especialidad: 'mecanica',   nombreCompleto: 'Roger Rafael Rodriguez Bello' },
  jim:     { cedula: 'V-11.038.792', especialidad: 'jefatura',   nombreCompleto: 'Jim Carboney Rincon Perez' },
  acevedo: { cedula: 'V-3.882.980',  especialidad: 'almacen',    nombreCompleto: 'Antonio Jose Acevedo Colmenares' },
  freddy:  { cedula: 'V-11.098.823', especialidad: 'escape',     nombreCompleto: 'Freddy Ramón Rodriguez Cordova' },
  nelson:  { cedula: 'V-8.683.914',  alias: 'NELSON', especialidad: 'cauchera', nombreCompleto: 'Margarito Carvajal' },
  angel:   { cedula: 'V-16.888.296', especialidad: 'latoneria',  nombreCompleto: 'Angel Luis Perez Espinoza' },
  frank:   { cedula: 'V-9.284.889',  especialidad: 'mecanica',   nombreCompleto: 'Francisco Antonio Hernandez Ruiz' },
  dyan:    { cedula: 'V-29.622.223', especialidad: 'autolavado', nombreCompleto: 'Dyan Andres Anchundia Mota' },
};

function buildTemplate(key: string, empleadoId: string, sede: string | null, proveedor: string) {
  const rules: any[] = [];
  const flats: any[] = [];
  const base = { empleado_id: empleadoId, sede_id: sede, activo: true, moneda: 'USD' };

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

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const assignments: Record<string, string> = body.assignments || {};
  const sede = auth.effectiveSede(body.sede_id ?? null);
  const proveedor = body.proveedor_nombre || 'Proveedor Puente Alineación';

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

  const allRules: any[] = [];
  const allFlats: any[] = [];
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
  return NextResponse.json({ success: true, rules: allRules.length, flats: allFlats.length });
}
