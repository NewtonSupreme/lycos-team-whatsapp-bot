import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { getPayrollService } from '@/lib/payroll/service';
import { avisosRegla, describirRegla } from '@/lib/nomina/reglas';
import { resolveRol, getRoleMeta, type CommissionRule, type JobAssignment } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Todo lo de una persona en nómina, en una sola respuesta.
 *
 * Responde a la pregunta con la que se pide la hoja de pago: "¿por qué le toca
 * esto?". Junta las tres cosas que hacen falta para contestarla —las reglas con
 * las que se le paga, lo que suma el período, y cada trabajo en el que estuvo—
 * de forma que la cifra final se pueda seguir hasta la orden que la originó.
 *
 * El historial NO se limita al período: la pregunta "¿en qué trabajos estuvo?"
 * casi nunca cabe en una semana.
 */

const n2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el empleado.' }, { status: 400 });

  // Un técnico solo puede verse a sí mismo: su hoja lleva lo que gana.
  const rolActual = resolveRol(auth.user!.rol);
  if (getRoleMeta(rolActual)?.esTecnico && rolActual !== 'admin' && auth.user!.id !== id) {
    return NextResponse.json({ error: 'Solo puedes ver tu propia nómina.' }, { status: 403 });
  }

  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const inicio = url.searchParams.get('inicio') || '';
  const fin = url.searchParams.get('fin') || '';
  const limite = Math.min(Number(url.searchParams.get('limite')) || 300, 1000);

  // ── Perfil ────────────────────────────────────────────────────────────────
  const { data: perfil } = await auth.db.from('usuarios')
    .select('id, nombre, alias, cedula, rol, especialidad, cargo, area, tipo_contrato, fecha_ingreso, activo, sede_id')
    .eq('id', id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Ese empleado no existe.' }, { status: 404 });

  // ── Reglas con las que se le paga ─────────────────────────────────────────
  const { data: reglasRaw } = await auth.db.from('commission_rules')
    .select('*').eq('empleado_id', id).order('prioridad');

  const suyas = ((reglasRaw || []) as CommissionRule[])
    .filter(r => !sede || !r.sede_id || r.sede_id === sede);

  const reglas = suyas.map(r => ({
    ...r,
    // La frase es lo que se lee; el resto de campos queda por si se edita.
    explicacion: describirRegla(r, perfil.nombre),
    // Los mismos avisos que da el constructor al crearla. Una regla puede
    // guardarse mal y seguir viéndose normal en la lista: aquí se ve el aviso.
    avisos: avisosRegla(r, suyas),
  }));

  // ── Historial de trabajos ─────────────────────────────────────────────────
  let jq = auth.db.from('job_assignments').select('*')
    .eq('empleado_id', id).neq('estado', 'anulado')
    .order('fecha', { ascending: false }).limit(limite);
  if (sede) jq = jq.eq('sede_id', sede);
  const { data: jobsRaw, error: eJobs } = await jq;
  if (eJobs) return NextResponse.json({ error: eJobs.message }, { status: 500 });

  const svc = getPayrollService(auth.db);
  const trabajos = await svc.enrichJobsWithClientInfo((jobsRaw as JobAssignment[]) || []);

  // ── Lo que suma el período que se está viendo ─────────────────────────────
  const periodo = inicio && fin
    ? await svc.calculateEmployeeWeeklyEarnings(id, { inicio, fin, sedeId: sede }, { includeLiquidated: true })
    : null;

  // ── Pagos ya liquidados ───────────────────────────────────────────────────
  let lq = auth.db.from('payroll_ledger').select('*')
    .eq('empleado_id', id).order('created_at', { ascending: false }).limit(60);
  if (sede) lq = lq.eq('sede_id', sede);
  const { data: pagos } = await lq;

  // ── Resúmenes para leer el historial de un vistazo ────────────────────────
  const porZona = new Map<string, { trabajos: number; comision: number; manoObra: number }>();
  const porMes = new Map<string, { trabajos: number; comision: number }>();
  let pendiente = 0;
  let cobrado = 0;

  for (const j of trabajos) {
    const z = porZona.get(j.zona) || { trabajos: 0, comision: 0, manoObra: 0 };
    z.trabajos += 1;
    z.comision += j.comision_usd || 0;
    z.manoObra += j.mano_obra_usd || 0;
    porZona.set(j.zona, z);

    const mes = String(j.fecha || '').slice(0, 7);
    const m = porMes.get(mes) || { trabajos: 0, comision: 0 };
    m.trabajos += 1;
    m.comision += j.comision_usd || 0;
    porMes.set(mes, m);

    if ((j as JobAssignment & { estado?: string }).estado === 'liquidado') cobrado += j.comision_usd || 0;
    else pendiente += j.comision_usd || 0;
  }

  return NextResponse.json({
    perfil,
    reglas,
    sinReglas: reglas.filter(r => r.activo !== false).length === 0,
    periodo,
    trabajos,
    pagos: pagos || [],
    resumen: {
      trabajos: trabajos.length,
      comisionTotal: n2(trabajos.reduce((s, j) => s + (j.comision_usd || 0), 0)),
      pendiente: n2(pendiente),
      cobrado: n2(cobrado),
      desde: trabajos.length ? trabajos[trabajos.length - 1].fecha : null,
      hasta: trabajos.length ? trabajos[0].fecha : null,
      porZona: [...porZona.entries()]
        .map(([zona, v]) => ({ zona, trabajos: v.trabajos, comision: n2(v.comision), manoObra: n2(v.manoObra) }))
        .sort((a, b) => b.comision - a.comision),
      porMes: [...porMes.entries()]
        .map(([mes, v]) => ({ mes, trabajos: v.trabajos, comision: n2(v.comision) }))
        .sort((a, b) => a.mes.localeCompare(b.mes)),
    },
  });
}
