import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { resolveRol } from '@/types';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/**
 * Plantillas de comisión documentadas para Lycos Team. El admin mapea qué
 * fila de `usuarios` corresponde a cada persona (no se hardcodean nombres).
 * Devuelve las reglas/tarifas a insertar para un empleado dado.
 */
function buildTemplate(key: string, empleadoId: string, sede: string | null, proveedor: string) {
  const rules: any[] = [];
  const flats: any[] = [];
  const base = { empleado_id: empleadoId, sede_id: sede, activo: true, moneda: 'USD' };

  switch (key) {
    case 'rafael': // Alineación (25% divisa / 20% + puente 35% en Bs) + Mecánica 40% + revisión $2
      rules.push(
        { ...base, zona: 'alineacion', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 25,
          aplica_monedas: ['USD', 'EUR'], prioridad: 10, descripcion: 'Alineación 25% (divisa)' },
        { ...base, zona: 'alineacion', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 20,
          aplica_monedas: ['VES'], moneda: 'VES', proveedor_pct: 35, proveedor_nombre: proveedor, prioridad: 9,
          descripcion: 'Alineación 20% (Bs, puente proveedor 35% · Lycos 45%)' },
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Mecánica 40% mano de obra' },
      );
      flats.push({ empleado_id: empleadoId, sede_id: sede, activo: true, zona: 'alineacion',
        servicio_key: 'revision', label: 'Revisión', monto: 2, moneda: 'USD' });
      break;

    case 'roger': // Fijo $40/sem + Mecánica 40%
      rules.push(
        { ...base, zona: 'all', tipo_regla: 'fijo_semanal', base: 'ingreso_total', valor: 40,
          prioridad: 1, descripcion: 'Sueldo fijo $40 semanal' },
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Mecánica 40% mano de obra' },
      );
      break;

    case 'jim': // Jefe de taller: override 7% sobre mecánica de otros + 40% propia
      rules.push(
        { ...base, zona: 'mecanica', tipo_regla: 'override_cascada', base: 'mano_obra', valor: 7,
          prioridad: 5, descripcion: 'Override 7% jefe de taller (mecánica de cualquier otro)' },
        { ...base, zona: 'mecanica', tipo_regla: 'porcentaje', base: 'mano_obra', valor: 40,
          prioridad: 20, descripcion: 'Mecánica propia 40% mano de obra' },
      );
      break;

    case 'acevedo': // Almacén: fijo $40/sem
      rules.push(
        { ...base, zona: 'all', tipo_regla: 'fijo_semanal', base: 'ingreso_total', valor: 40,
          prioridad: 1, descripcion: 'Almacén — sueldo fijo $40 semanal' },
      );
      break;

    case 'freddy': // Escapes: tarifas a destajo
      rules.push(
        { ...base, zona: 'escape', tipo_regla: 'tarifa_flat', base: 'ingreso_total', valor: 0,
          prioridad: 10, descripcion: 'Escapes — pago a destajo (tarifas flat)' },
      );
      [
        ['silenciador', 'Instalación silenciador', 5],
        ['resonador', 'Instalación resonador', 5],
        ['flexible', 'Instalación flexible', 5],
        ['gomas', 'Montar gomas', 1],
        ['soldadura', 'Soldadura', 1],
        ['extra', 'Extra pequeño', 1],
      ].forEach(([k, label, monto]) => flats.push({
        empleado_id: empleadoId, sede_id: sede, activo: true, zona: 'escape',
        servicio_key: k, label, monto, moneda: 'USD',
      }));
      break;

    case 'nelson': // Cauchera
      rules.push(
        { ...base, zona: 'cauchera', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 0,
          prioridad: 15, descripcion: 'Cauchera — Variable por servicio (30% rep. / 40% rotación / 100% adic). Si no especifica %, Por definir' },
      );
      break;

    case 'angel': // Latonería
      rules.push(
        { ...base, zona: 'latoneria', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 0,
          prioridad: 15, descripcion: 'Latonería y Pintura — Variable según presupuesto con cliente (Si monto no escrito: Por definir)' },
      );
      break;

    case 'dyan': // Autolavado
      rules.push(
        { ...base, zona: 'lavado', tipo_regla: 'porcentaje', base: 'ingreso_total', valor: 0,
          prioridad: 15, descripcion: 'Autolavado — Por definir (Caso especial pendiente de estructuración por administración)' },
      );
      break;

    case 'frank': // Mecánica
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
    detalles: `${empleadoIds.length} empleado(s) · ${allRules.length} reglas · ${allFlats.length} tarifas`,
    sede_id: sede,
  });
  return NextResponse.json({ success: true, rules: allRules.length, flats: allFlats.length });
}
