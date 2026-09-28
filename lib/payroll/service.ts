/**
 * PayrollCalculationService — capa de servicio AISLADA del motor de nómina.
 *
 * Expone métodos limpios y reutilizables que consumen:
 *   · los API routes del panel (con RBAC),
 *   · el webhook del chatbot (Gemini) para responder al administrador por WhatsApp.
 *
 * SOLO SERVIDOR: usa la Service Role Key. No importar desde componentes cliente.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  CommissionRule, FlatRate, JobAssignment, PayrollLedger, PayrollAdvance,
  EmployeeEarnings, MonedaNomina,
} from '@/types';
import {
  NominaRates, fetchNominaRates, rateForMoneda, toUsd, round2, DEFAULT_RATES,
} from './currency';
import {
  JobInput, pickExecutorRule, computeExecutorCommission, computeOverrides,
  computeLycosNeto, aggregateEarnings,
} from './calc';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface PeriodoInput { inicio: string; fin: string; sedeId?: string | null; }

export interface CreateJobInput {
  empleado_id: string | null;
  es_taller?: boolean;
  zona: string;
  tipo_trabajo?: string | null;
  descripcion?: string | null;
  servicio_key?: string | null;
  cantidad?: number;
  ingreso_total: number;
  mano_obra?: number;          // si no se envía, se asume = ingreso_total (trabajo 100% mano de obra)
  moneda?: MonedaNomina;
  tasa_cambio?: number;        // unidades por USD; si no, se toma de las tasas vivas
  fecha?: string;
  referencia_tabla?: string | null;
  referencia_id?: string | null;
  cliente?: string | null;
  vehiculo?: string | null;
  placa?: string | null;
  sede_id?: string | null;
  created_by?: string | null;
  /**
   * Comisión fijada A MANO (USD). Se usa cuando la regla es "por definir"
   * (latonería por presupuesto, casos especiales) o el admin quiere ajustar.
   * Si viene, tiene prioridad sobre el cálculo automático.
   */
  comision_manual?: number | null;
  /** Identificador de ida y vuelta para el preview (no se persiste). */
  ref?: string;
}

/** Texto del trabajo contra el que se evalúan las reglas por tipo de servicio. */
function textoDe(input: CreateJobInput): string {
  return [input.servicio_key, input.tipo_trabajo, input.descripcion].filter(Boolean).join(' ');
}

export class PayrollCalculationService {
  db: SupabaseClient;
  private _rates: NominaRates | null = null;

  constructor(db?: SupabaseClient) {
    const c = db ?? adminClient();
    if (!c) throw new Error('Supabase no configurado (Service Role Key requerida).');
    this.db = c;
  }

  async rates(): Promise<NominaRates> {
    if (this._rates) return this._rates;
    try { this._rates = await fetchNominaRates(); } catch { this._rates = DEFAULT_RATES; }
    return this._rates;
  }

  // ── Catálogos ─────────────────────────────────────────────────────────────
  async getRules(sedeId?: string | null): Promise<CommissionRule[]> {
    let q = this.db.from('commission_rules').select('*');
    const { data } = await q;
    let rows = (data as CommissionRule[]) || [];
    if (sedeId) rows = rows.filter(r => !r.sede_id || r.sede_id === sedeId);
    return rows;
  }

  async getFlatRates(sedeId?: string | null): Promise<FlatRate[]> {
    const { data } = await this.db.from('flat_rate_catalog').select('*');
    let rows = (data as FlatRate[]) || [];
    if (sedeId) rows = rows.filter(r => !r.sede_id || r.sede_id === sedeId);
    return rows;
  }

  async getTechnicians(sedeId?: string | null): Promise<any[]> {
    let q = this.db.from('usuarios').select('id, nombre, username, rol, sede_id, activo').order('nombre');
    if (sedeId) q = q.eq('sede_id', sedeId);
    const { data } = await q;
    return data || [];
  }

  // ── Creación de trabajo con SNAPSHOT (ejecutor + overrides en cascada) ──────
  /**
   * Calcula la comisión de uno o varios trabajos SIN guardarlos.
   * Lo usa el formulario de la orden para mostrar en vivo cuánto le toca a
   * cada técnico según sus reglas, antes de guardar.
   */
  async previewJobs(inputs: CreateJobInput[]): Promise<any[]> {
    const rates = await this.rates();
    const sedeId = inputs[0]?.sede_id ?? null;
    const rules = await this.getRules(sedeId);
    const flats = await this.getFlatRates(sedeId);

    const out: any[] = [];
    for (const input of inputs) {
      const moneda: MonedaNomina = input.moneda || 'USD';
      const tasa = input.tasa_cambio && input.tasa_cambio > 0 ? input.tasa_cambio : rateForMoneda(moneda, rates);
      const ingreso = round2(input.ingreso_total || 0);
      const manoObra = round2(input.mano_obra != null ? input.mano_obra : ingreso);

      const job: JobInput = {
        empleado_id: input.empleado_id,
        es_taller: !!input.es_taller,
        zona: input.zona || 'general',
        moneda, tasa_cambio: tasa,
        ingreso_total: ingreso, mano_obra: manoObra,
        servicio_key: input.servicio_key, cantidad: input.cantidad,
        sede_id: input.sede_id,
        texto: textoDe(input),
      };

      const execRule = pickExecutorRule(rules, job);
      const exec = computeExecutorCommission(execRule, job, flats, rates);
      const overrides = computeOverrides(rules, job, rates);

      // Nombres de los beneficiarios del override (p. ej. el jefe de taller)
      const overridesDetalle = [];
      for (const o of overrides) {
        const { data: u } = await this.db.from('usuarios').select('nombre').eq('id', o.empleado_id).maybeSingle();
        overridesDetalle.push({ ...o, empleado_nombre: u?.nombre || 'Empleado' });
      }

      // Regla "Por definir": existe pero no tiene % fijado (latonería por presupuesto,
      // caso especial del autolavado…). La UI pedirá la comisión manual.
      const porDefinir = !!execRule && execRule.tipo_regla === 'porcentaje'
        && Number(execRule.valor) === 0 && exec.comision_usd === 0;

      out.push({
        ref: input.ref ?? null,
        empleado_id: input.empleado_id,
        es_taller: !!input.es_taller,
        zona: job.zona,
        descripcion: input.descripcion ?? null,
        mano_obra: manoObra,
        ingreso_total: ingreso,
        comision: exec.comision,
        comision_usd: exec.comision_usd,
        tipo_regla: exec.tipo_regla,
        regla_descripcion: (exec.desglose as any)?.regla || execRule?.descripcion || null,
        pct: (exec.desglose as any)?.pct ?? null,
        base: (exec.desglose as any)?.base ?? null,
        proveedor_monto_usd: exec.proveedor_monto_usd,
        proveedor_nombre: exec.proveedor_nombre,
        sin_regla: !execRule && exec.comision_usd === 0,
        por_definir: porDefinir,
        desglose: exec.desglose,
        overrides: overridesDetalle,
      });
    }
    return out;
  }

  async createJobAssignment(input: CreateJobInput): Promise<{ executor: JobAssignment; overrides: JobAssignment[] }> {
    const rates = await this.rates();
    const moneda: MonedaNomina = input.moneda || 'USD';
    const tasa = input.tasa_cambio && input.tasa_cambio > 0 ? input.tasa_cambio : rateForMoneda(moneda, rates);
    const ingreso = round2(input.ingreso_total || 0);
    const manoObra = round2(input.mano_obra != null ? input.mano_obra : ingreso);

    // Nombre snapshot del empleado
    let empleadoNombre: string | null = null;
    if (input.empleado_id) {
      const { data: u } = await this.db.from('usuarios').select('nombre').eq('id', input.empleado_id).maybeSingle();
      empleadoNombre = u?.nombre ?? null;
    } else if (input.es_taller) {
      empleadoNombre = 'Taller (sin técnico)';
    }

    const job: JobInput = {
      empleado_id: input.empleado_id,
      es_taller: !!input.es_taller,
      zona: input.zona || 'general',
      moneda, tasa_cambio: tasa,
      ingreso_total: ingreso, mano_obra: manoObra,
      servicio_key: input.servicio_key, cantidad: input.cantidad,
      sede_id: input.sede_id,
      texto: textoDe(input),
    };

    const rules = await this.getRules(input.sede_id);
    const flats = await this.getFlatRates(input.sede_id);

    const execRule = pickExecutorRule(rules, job);
    const exec = computeExecutorCommission(execRule, job, flats, rates);

    // Comisión fijada A MANO: prevalece sobre la regla automática (casos "por definir":
    // latonería por presupuesto, adicionales 100%, ajustes puntuales del admin).
    if (input.comision_manual != null && Number(input.comision_manual) >= 0 && Number.isFinite(Number(input.comision_manual))) {
      const manualUsd = round2(Number(input.comision_manual));
      exec.comision = manualUsd;
      exec.comision_moneda = 'USD';
      exec.comision_usd = manualUsd;
      exec.tipo_regla = null;
      exec.desglose = { ...exec.desglose, regla: 'Comisión manual (fijada por administración)', manual: true };
    }

    const overrides = computeOverrides(rules, job, rates);
    const overridesUsd = round2(overrides.reduce((s, o) => s + o.comision_usd, 0));

    const ingreso_usd = toUsd(ingreso, tasa);
    const mano_obra_usd = toUsd(manoObra, tasa);
    const lycos_neto = computeLycosNeto(ingreso_usd, exec, overridesUsd);

    const fecha = input.fecha || new Date().toISOString().slice(0, 10);

    // Inserta fila del ejecutor
    const execRow = {
      fecha,
      empleado_id: input.empleado_id,
      es_taller: !!input.es_taller,
      empleado_nombre: empleadoNombre,
      zona: job.zona,
      tipo_trabajo: input.tipo_trabajo ?? job.zona,
      servicio_key: input.servicio_key ?? null,
      descripcion: input.descripcion ?? null,
      referencia_tabla: input.referencia_tabla ?? 'manual',
      referencia_id: input.referencia_id ?? null,
      ingreso_total: ingreso, mano_obra: manoObra, cantidad: input.cantidad ?? 1,
      moneda, tasa_cambio: tasa, ingreso_usd, mano_obra_usd,
      regla_id: exec.regla_id, tipo_regla: exec.tipo_regla,
      comision: exec.comision, comision_moneda: exec.comision_moneda, comision_usd: exec.comision_usd,
      es_override: false, override_de: null,
      proveedor_monto: exec.proveedor_monto, proveedor_monto_usd: exec.proveedor_monto_usd,
      proveedor_nombre: exec.proveedor_nombre,
      lycos_neto, desglose: {
        ...exec.desglose,
        cliente: input.cliente || null,
        vehiculo: input.vehiculo || null,
        placa: input.placa || null,
      }, estado: 'pendiente',
      sede_id: input.sede_id ?? null, created_by: input.created_by ?? null,
    };

    const { data: inserted, error } = await this.db.from('job_assignments').insert(execRow).select().single();
    if (error) throw new Error('Error registrando trabajo: ' + error.message);
    const executor = inserted as JobAssignment;

    // Inserta overrides (Jim 7%, etc.) referenciando al ejecutor
    const overrideRows: JobAssignment[] = [];
    for (const o of overrides) {
      const { data: ou } = await this.db.from('usuarios').select('nombre').eq('id', o.empleado_id).maybeSingle();
      const row = {
        fecha,
        empleado_id: o.empleado_id, es_taller: false, empleado_nombre: ou?.nombre ?? null,
        zona: o.zona, tipo_trabajo: input.tipo_trabajo ?? job.zona, servicio_key: null,
        descripcion: `Override ${o.pct}% s/ mano de obra de ${empleadoNombre || 'taller'}`,
        referencia_tabla: input.referencia_tabla ?? 'manual', referencia_id: input.referencia_id ?? null,
        ingreso_total: ingreso, mano_obra: manoObra, cantidad: 1,
        moneda, tasa_cambio: tasa, ingreso_usd, mano_obra_usd,
        regla_id: o.regla_id, tipo_regla: 'override_cascada',
        comision: o.comision, comision_moneda: o.comision_moneda, comision_usd: o.comision_usd,
        es_override: true, override_de: executor.id,
        proveedor_monto: 0, proveedor_monto_usd: 0, proveedor_nombre: null,
        lycos_neto: 0, desglose: {
          tipo: 'override', pct: o.pct, base: o.base_aplicada, sobre: empleadoNombre,
          cliente: input.cliente || null, vehiculo: input.vehiculo || null, placa: input.placa || null,
        },
        estado: 'pendiente', sede_id: input.sede_id ?? null, created_by: input.created_by ?? null,
      };
      const { data: oi } = await this.db.from('job_assignments').insert(row).select().single();
      if (oi) overrideRows.push(oi as JobAssignment);
    }

    return { executor, overrides: overrideRows };
  }

  // ── Cálculo de ganancias de un empleado en un período (método LIMPIO) ───────
  async calculateEmployeeWeeklyEarnings(
    employeeId: string,
    periodo: PeriodoInput,
    opts: { includeLiquidated?: boolean } = {}
  ): Promise<EmployeeEarnings> {
    const rates = await this.rates();
    const { data: emp } = await this.db.from('usuarios').select('id, nombre, rol').eq('id', employeeId).maybeSingle();

    let jq = this.db.from('job_assignments').select('*')
      .eq('empleado_id', employeeId)
      .gte('fecha', periodo.inicio).lte('fecha', periodo.fin)
      .neq('estado', 'anulado');
    if (!opts.includeLiquidated) jq = jq.eq('estado', 'pendiente');
    if (periodo.sedeId) jq = jq.eq('sede_id', periodo.sedeId);
    const { data: jobsData } = await jq;
    const todos = (jobsData as JobAssignment[]) || [];

    /*
     * Solo se paga lo terminado.
     *
     * Los trabajos se registran al abrir o editar la orden, y la nómina los
     * sumaba aunque el carro siguiera en el taller: se podía liquidar una
     * comisión de un trabajo que después se cancelaba o cambiaba de precio.
     * Los de órdenes abiertas quedan aparte, «en curso»; los de órdenes
     * canceladas no cuentan.
     */
    const servIdsJobs = Array.from(new Set(todos
      .filter(j => j.referencia_tabla === 'servicios' && j.referencia_id)
      .map(j => String(j.referencia_id))));
    const estadoServ = new Map<string, string>();
    for (let i = 0; i < servIdsJobs.length; i += 200) {
      const { data: ss } = await this.db.from('servicios').select('id, estado').in('id', servIdsJobs.slice(i, i + 200));
      (ss || []).forEach((s: any) => estadoServ.set(String(s.id), String(s.estado || '')));
    }
    const CERRADAS = ['completada', 'completado', 'finalizado', 'finalizada'];
    const estadoDe = (j: JobAssignment) => (j.referencia_tabla === 'servicios' && j.referencia_id
      ? estadoServ.get(String(j.referencia_id)) ?? 'desconocido' : 'cerrada');
    // Lo ya liquidado se enseña siempre: el histórico es el que es.
    const pagable = (j: JobAssignment) => j.estado !== 'pendiente'
      || estadoDe(j) === 'cerrada' || CERRADAS.includes(estadoDe(j)) || estadoDe(j) === 'desconocido';
    const cancelado = (j: JobAssignment) => /^cancel|anulad/.test(estadoDe(j));
    const rawJobs = todos.filter(j => pagable(j) && !cancelado(j));
    const jobs = await this.enrichJobsWithClientInfo(rawJobs);
    const jobsEnCurso = await this.enrichJobsWithClientInfo(todos.filter(j => !pagable(j) && !cancelado(j)));

    let aq = this.db.from('payroll_advances').select('*')
      .eq('empleado_id', employeeId).eq('estado', 'pendiente')
      .gte('fecha', periodo.inicio).lte('fecha', periodo.fin);
    if (periodo.sedeId) aq = aq.eq('sede_id', periodo.sedeId);
    const { data: advData } = await aq;
    const adelantos = (advData as PayrollAdvance[]) || [];
    const advancesUsd = round2(adelantos.reduce((s, a) => s + (a.monto_usd || 0), 0));

    const rules = await this.getRules(periodo.sedeId);
    const fijoRules = rules.filter(r => r.empleado_id === employeeId && r.tipo_regla === 'fijo_semanal');

    const agg = aggregateEarnings({
      jobs: jobs.map(j => ({
        comision_usd: j.comision_usd, es_override: j.es_override, tipo_regla: j.tipo_regla,
        moneda: j.moneda, comision: j.comision,
      })),
      fijoRules, advancesUsd,
      periodoInicio: periodo.inicio, periodoFin: periodo.fin, rates,
    });

    return {
      empleado_id: employeeId,
      empleado_nombre: emp?.nombre || 'Empleado',
      rol: emp?.rol || '',
      periodo_inicio: periodo.inicio, periodo_fin: periodo.fin,
      sueldo_base: agg.sueldo_base,
      total_comisiones: agg.total_comisiones,
      total_overrides: agg.total_overrides,
      total_flat: agg.total_flat,
      bruto: agg.bruto,
      deducciones: agg.deducciones,
      total_pagar: agg.total_pagar,
      desglose_monedas: agg.desglose_monedas,
      jobs, adelantos,
      jobs_en_curso: jobsEnCurso,
      en_curso_usd: round2(jobsEnCurso.reduce((s, j) => s + (Number(j.comision_usd) || 0), 0)),
      liquidado: false,
    };
  }

  /**
   * Resumen consolidado del período para TODA la plantilla activa de la sede.
   *
   * Antes solo entraban quienes tuvieran trabajos, una regla de comisión o el
   * rol `mecanico`/`jefe_taller`. Con la plantilla real eso dejaba la nómina en
   * una sola persona: el resto del personal —administración, atención al
   * cliente, cobranza, supervisión— simplemente no existía en la pantalla, y no
   * había forma de ver ni de liquidar a nadie más. Ahora aparecen todos; quien
   * no tuvo movimientos sale en cero, que también es información.
   */
  async getPayrollSummary(periodo: PeriodoInput): Promise<EmployeeEarnings[]> {
    const rules = await this.getRules(periodo.sedeId);

    // Empleados con trabajos en el período (pueden ser de otra sede si el
    // trabajo se registró allí, por eso se suman aparte de la plantilla).
    let jq = this.db.from('job_assignments').select('empleado_id')
      .gte('fecha', periodo.inicio).lte('fecha', periodo.fin)
      .neq('estado', 'anulado').not('empleado_id', 'is', null);
    if (periodo.sedeId) jq = jq.eq('sede_id', periodo.sedeId);
    const { data: jobEmps } = await jq;

    let uq = this.db.from('usuarios').select('id, nombre, rol, activo').neq('activo', false);
    if (periodo.sedeId) uq = uq.eq('sede_id', periodo.sedeId);
    const { data: activeUsers } = await uq;

    const ids = new Set<string>();
    (activeUsers || []).forEach((u: any) => { if (u.id) ids.add(u.id); });
    (jobEmps || []).forEach((r: any) => r.empleado_id && ids.add(r.empleado_id));
    // Reglas con sueldo fijo aunque su titular ya no esté en la plantilla activa.
    rules.forEach(r => { if (r.empleado_id) ids.add(r.empleado_id); });

    // En tandas: una consulta por empleado en serie hacía esperar de más con la
    // plantilla completa, y todas a la vez saturan el pool de conexiones.
    const lista = Array.from(ids);
    const results: EmployeeEarnings[] = [];
    const TANDA = 6;
    for (let i = 0; i < lista.length; i += TANDA) {
      const tanda = await Promise.all(
        lista.slice(i, i + TANDA).map(id => this.calculateEmployeeWeeklyEarnings(id, periodo)),
      );
      results.push(...tanda);
    }

    // Primero quien tiene algo que cobrar; el resto, por nombre, para que la
    // lista no baile de posición entre recargas.
    results.sort((a, b) =>
      b.total_pagar - a.total_pagar ||
      b.jobs.length - a.jobs.length ||
      (a.empleado_nombre || '').localeCompare(b.empleado_nombre || ''),
    );
    return results;
  }

  /** Liquida (paga) la nómina de un empleado en un período: crea el ledger + recibo. */
  async liquidate(params: {
    employeeId: string; periodo: PeriodoInput; metodo_pago?: string;
    nota?: string; createdBy?: string; deduccionesExtra?: number;
  }): Promise<PayrollLedger> {
    const e = await this.calculateEmployeeWeeklyEarnings(params.employeeId, params.periodo);
    if (e.jobs.length === 0 && e.sueldo_base === 0 && e.deducciones === 0) {
      throw new Error('No hay nada que liquidar para este empleado en el período.');
    }

    const recibo = await this.nextReciboNumero(params.periodo.sedeId);
    const detalle = e.jobs.map(j => ({
      id: j.id, fecha: j.fecha, zona: j.zona, tipo: j.tipo_trabajo,
      es_override: j.es_override, comision_usd: j.comision_usd, moneda: j.moneda, comision: j.comision,
    }));

    const deducciones = round2(e.deducciones + (params.deduccionesExtra || 0));
    const total_pagar = round2(e.bruto - deducciones);

    const ledgerRow = {
      empleado_id: params.employeeId, empleado_nombre: e.empleado_nombre,
      periodo_inicio: params.periodo.inicio, periodo_fin: params.periodo.fin,
      moneda: 'USD',
      sueldo_base: e.sueldo_base, total_comisiones: e.total_comisiones,
      total_overrides: e.total_overrides, total_flat: e.total_flat,
      bruto: e.bruto, deducciones, total_pagar,
      desglose_monedas: e.desglose_monedas, detalle,
      recibo_numero: recibo, nota: params.nota ?? null,
      estado: 'pagado', pagado_at: new Date().toISOString(), pagado_por: params.createdBy ?? null,
      metodo_pago: params.metodo_pago ?? null,
      sede_id: params.periodo.sedeId ?? null, created_by: params.createdBy ?? null,
    };

    const { data: ledger, error } = await this.db.from('payroll_ledger').insert(ledgerRow).select().single();
    if (error) throw new Error('Error creando liquidación: ' + error.message);
    const L = ledger as PayrollLedger;

    // Marca trabajos como liquidados y enlázalos
    const jobIds = e.jobs.map(j => j.id);
    if (jobIds.length) {
      await this.db.from('job_assignments')
        .update({ estado: 'liquidado', payroll_ledger_id: L.id, updated_at: new Date().toISOString() })
        .in('id', jobIds);
    }
    // Marca adelantos como aplicados
    const advIds = e.adelantos.map(a => a.id);
    if (advIds.length) {
      await this.db.from('payroll_advances')
        .update({ estado: 'aplicado', payroll_ledger_id: L.id }).in('id', advIds);
    }

    return L;
  }

  /** Enrriquece de forma eficiente los trabajos con información de cliente, vehículo y placa del servicio o venta original. */
  async enrichJobsWithClientInfo(jobs: JobAssignment[]): Promise<JobAssignment[]> {
    if (!jobs || jobs.length === 0) return jobs;

    const servIds = Array.from(new Set(jobs.filter(j => j.referencia_tabla === 'servicios' && j.referencia_id).map(j => String(j.referencia_id))));
    const ventaIds = Array.from(new Set(jobs.filter(j => j.referencia_tabla === 'ventas_dia' && j.referencia_id).map(j => String(j.referencia_id).split('#')[0])));

    const servMap = new Map<string, any>();
    if (servIds.length > 0) {
      const { data: servs } = await this.db.from('servicios').select(`
        id, fecha, descripcion, tipo, nombre_cliente, vehiculo_info, placa, costo_final, costo_estimado, items, notas,
        vehiculos (marca, modelo, placa, clientes (nombre, apellido))
      `).in('id', servIds);
      (servs || []).forEach((s: any) => servMap.set(String(s.id), s));
    }

    const ventaMap = new Map<string, any>();
    if (ventaIds.length > 0) {
      const { data: ventas } = await this.db.from('ventas_dia').select(`
        id, fecha, cliente, desglose, notas, total_ingresos, moneda, tasa_cambio
      `).in('id', ventaIds);
      (ventas || []).forEach((v: any) => ventaMap.set(String(v.id), v));
    }

    return jobs.map(job => {
      let cliente = job.desglose?.cliente || null;
      let vehiculo = job.desglose?.vehiculo || null;
      let placa = job.desglose?.placa || null;
      let items = job.desglose?.items || null;

      if (!cliente || !vehiculo || !items) {
        if (job.referencia_tabla === 'servicios' && job.referencia_id) {
          const s = servMap.get(String(job.referencia_id));
          if (s) {
            const relName = s.vehiculos?.clientes ? `${s.vehiculos.clientes.nombre} ${s.vehiculos.clientes.apellido}`.trim() : '';
            cliente = cliente || relName || s.nombre_cliente || 'Cliente de Taller';
            const relVeh = s.vehiculos ? `${s.vehiculos.marca} ${s.vehiculos.modelo}`.trim() : '';
            vehiculo = vehiculo || relVeh || s.vehiculo_info || 'Vehículo de Taller';
            placa = placa || s.vehiculos?.placa || s.placa || '';
            items = items || s.items || null;
          }
        } else if (job.referencia_tabla === 'ventas_dia' && job.referencia_id) {
          const v = ventaMap.get(String(job.referencia_id).split('#')[0]);
          if (v) {
            cliente = cliente || v.cliente || 'Consumidor Final';
            items = items || v.desglose || null;
          }
        }
      }

      const desc = job.descripcion || (job.referencia_tabla === 'servicios' ? 'Servicio de taller' : job.referencia_tabla === 'ventas_dia' ? 'Venta en mostrador' : 'Trabajo asignado');

      return {
        ...job,
        descripcion: desc,
        desglose: {
          ...job.desglose,
          cliente: cliente || 'Consumidor Final',
          vehiculo: vehiculo || (placa ? `Placa: ${placa}` : 'No especificado'),
          placa: placa || null,
          items: items || [],
        }
      };
    });
  }

  private async nextReciboNumero(sedeId?: string | null): Promise<string> {
    const year = new Date().getFullYear();
    const { count } = await this.db.from('payroll_ledger')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`);
    const seq = String((count || 0) + 1).padStart(4, '0');
    return `NOM-${year}-${seq}`;
  }
}

export function getPayrollService(db?: SupabaseClient): PayrollCalculationService {
  return new PayrollCalculationService(db);
}
