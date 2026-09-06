'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Banknote, Loader2, Wallet, TrendingUp, Users, Calendar, RefreshCw, Plus,
  CheckCircle2, FileText, AlertTriangle, Settings2, ChevronRight, Building2, Download, X, Coins,
  Sparkles, Check, AlertCircle, Bot, Wand2, Save,
} from 'lucide-react';
import {
  getPermisos, hasPermiso, resolveRol, getRoleMeta, ZONAS_TRABAJO,
  type EmployeeEarnings, type CommissionRule, type FlatRate, type PayrollLedger, type JobAssignment,
} from '@/types';
import { generateReciboNominaPDF } from '@/lib/recibo-nomina-pdf';
import AsignacionTecnicos, { type JobSpec } from '@/components/nomina/AsignacionTecnicos';

type Tab = 'resumen' | 'ia' | 'trabajos' | 'reglas' | 'adelantos' | 'historial';

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const zonaLabel = (z: string) => ZONAS_TRABAJO.find(x => x.key === z)?.label || z;

// ── Períodos ────────────────────────────────────────────────────────────────
function getLocalISODate(d: Date = new Date()): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}
function isoWeekStart(d: Date = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Lunes = 0, Domingo = 6
  x.setDate(x.getDate() - day);
  return getLocalISODate(x);
}
function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return getLocalISODate(x);
}
function monthStart(d: Date = new Date()) { return getLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1)); }
function monthEnd(d: Date = new Date()) { return getLocalISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }

const PRESETS = [
  { key: 'semana', label: 'Esta semana' },
  { key: 'semana_pasada', label: 'Semana pasada' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes pasado' },
  { key: 'custom', label: 'Personalizado' },
];

function presetRange(key: string): { inicio: string; fin: string } {
  const hoy = new Date();
  if (key === 'semana') { const i = isoWeekStart(hoy); return { inicio: i, fin: addDays(i, 6) }; }
  if (key === 'semana_pasada') { const i = addDays(isoWeekStart(hoy), -7); return { inicio: i, fin: addDays(i, 6) }; }
  if (key === 'mes') return { inicio: monthStart(hoy), fin: monthEnd(hoy) };
  if (key === 'mes_pasado') { const p = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15); return { inicio: monthStart(p), fin: monthEnd(p) }; }
  const i = isoWeekStart(hoy); return { inicio: i, fin: addDays(i, 6) };
}

export default function NominaPage() {
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede } = useSedeStore();
  const sedeId = currentSede?.id || null;

  const rol = resolveRol(user?.rol);
  const isAdmin = rol === 'admin';
  const permisos = getPermisos(user?.rol || 'mecanico', user?.permisos, roleDefaults);
  const canEdit = isAdmin || hasPermiso(permisos.nomina, 'editar');
  const canLiquidar = isAdmin || rol === 'supervisor';
  const esTecnico = !!getRoleMeta(rol)?.esTecnico && !isAdmin;

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>('resumen');
  const [preset, setPreset] = useState('semana');
  const [range, setRange] = useState(presetRange('semana'));
  const [summary, setSummary] = useState<EmployeeEarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [liquidarTarget, setLiquidarTarget] = useState<EmployeeEarnings | null>(null);
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [detalle, setDetalle] = useState<EmployeeEarnings | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const loadSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const qs = new URLSearchParams({ inicio: range.inicio, fin: range.fin });
      if (sedeId) qs.set('sede', sedeId);
      const r = await fetch(`/api/nomina/summary?${qs}`);
      const d = await r.json();
      if (r.ok) setSummary(d.summary || []);
      else setSummary([]);
    } catch { setSummary([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [range, sedeId]);

  useEffect(() => { if (mounted) loadSummary(); }, [mounted, loadSummary]);

  // Tiempo real: cualquier cambio en trabajos o liquidaciones refresca el resumen.
  useEffect(() => {
    if (!supabase || !mounted) return;
    const ch = supabase.channel('nomina-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_assignments' }, () => loadSummary(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_ledger' }, () => loadSummary(true))
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [mounted, loadSummary]);

  const onPreset = (k: string) => {
    setPreset(k);
    if (k !== 'custom') setRange(presetRange(k));
  };

  const totales = useMemo(() => summary.reduce((a, e) => ({
    base: a.base + e.sueldo_base, com: a.com + e.total_comisiones + e.total_flat,
    over: a.over + e.total_overrides, ded: a.ded + e.deducciones, pagar: a.pagar + e.total_pagar,
  }), { base: 0, com: 0, over: 0, ded: 0, pagar: 0 }), [summary]);

  if (!mounted) return null;

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'resumen', label: esTecnico ? 'Mi Resumen' : 'Resumen', show: true },
    { key: 'ia', label: '✨ Análisis IA', show: canEdit },
    { key: 'trabajos', label: 'Trabajos', show: true },
    { key: 'reglas', label: 'Reglas & Tarifas', show: canEdit },
    { key: 'adelantos', label: 'Adelantos', show: canLiquidar },
    { key: 'historial', label: 'Historial de Pagos', show: true },
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" /> Nómina & Comisiones
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> {currentSede?.nombre || 'Todas las sedes'} · cálculo dinámico en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button onClick={() => setRegistrarOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Registrar trabajo
            </Button>
          )}
          <Button variant="outline" onClick={() => loadSummary(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Período */}
      <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 mr-1">Período:</span>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => onPreset(p.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all shadow-sm ${preset === p.key ? 'bg-emerald-600 text-white shadow-emerald-500/20 scale-105' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'}`}>
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 ml-1">
                <input type="date" value={range.inicio} onChange={e => setRange(r => ({ ...r, inicio: e.target.value }))}
                  className="h-8 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs font-mono" />
                <span className="text-slate-400 font-bold">→</span>
                <input type="date" value={range.fin} onChange={e => setRange(r => ({ ...r, fin: e.target.value }))}
                  className="h-8 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs font-mono" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-3 py-1.5 rounded-xl self-end sm:self-auto shrink-0 animate-in fade-in duration-300">
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">📅 Activo (Lunes a Domingo):</span>
            <span className="text-xs font-mono font-black text-emerald-950 dark:text-emerald-200 tracking-tight">{range.inicio} → {range.fin}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
      ) : (
        <>
          {tab === 'resumen' && (
            esTecnico
              ? <MiResumen earnings={summary[0]} />
              : <ResumenAdmin summary={summary} totales={totales} canLiquidar={canLiquidar}
                  range={range} sedeNombre={currentSede?.nombre}
                  onLiquidar={setLiquidarTarget} onDetalle={setDetalle} />
          )}
          {tab === 'trabajos' && <TrabajosTab range={range} sedeId={sedeId} canEdit={canEdit} canLiquidar={canLiquidar} esTecnico={esTecnico} userId={user?.id} />}
          {tab === 'ia' && canEdit && <AnalisisIATab range={range} sedeId={sedeId} onDone={() => loadSummary(true)} />}
          {tab === 'reglas' && canEdit && <ReglasTab sedeId={sedeId} isAdmin={isAdmin} />}
          {tab === 'adelantos' && canLiquidar && <AdelantosTab sedeId={sedeId} onChange={() => loadSummary(true)} />}
          {tab === 'historial' && <HistorialTab sedeId={sedeId} isAdmin={isAdmin} />}
        </>
      )}

      {liquidarTarget && (
        <LiquidarModal target={liquidarTarget} range={range} sedeId={sedeId} sedeNombre={currentSede?.nombre}
          onClose={() => setLiquidarTarget(null)} onDone={() => { setLiquidarTarget(null); loadSummary(true); }} />
      )}
      {registrarOpen && (
        <RegistrarTrabajoModal sedeId={sedeId} onClose={() => setRegistrarOpen(false)}
          onDone={() => { setRegistrarOpen(false); loadSummary(true); }} />
      )}
      {detalle && <DetalleEmpleadoModal earnings={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

// ════════════════════ RESUMEN ADMIN (tabla maestra) ════════════════════
function ResumenAdmin({ summary, totales, canLiquidar, range, sedeNombre, onLiquidar, onDetalle }: {
  summary: EmployeeEarnings[]; totales: any; canLiquidar: boolean;
  range: { inicio: string; fin: string }; sedeNombre?: string;
  onLiquidar: (e: EmployeeEarnings) => void; onDetalle: (e: EmployeeEarnings) => void;
}) {
  const descargarHojaEmpleado = (e: EmployeeEarnings) => {
    generateReciboNominaPDF({
      recibo_numero: `BORRADOR · ${range.inicio} → ${range.fin}`,
      empleado_nombre: e.empleado_nombre, rol: e.rol,
      periodo_inicio: range.inicio, periodo_fin: range.fin, sede_nombre: sedeNombre,
      sueldo_base: e.sueldo_base, total_comisiones: e.total_comisiones,
      total_overrides: e.total_overrides, total_flat: e.total_flat,
      bruto: e.bruto, deducciones: e.deducciones, total_pagar: e.total_pagar,
      desglose_monedas: e.desglose_monedas,
      jobs: (e.jobs || []).map(j => ({ fecha: j.fecha, zona: j.zona, tipo_trabajo: j.tipo_trabajo, descripcion: j.descripcion, comision_usd: j.comision_usd, es_override: j.es_override, moneda: j.moneda })),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatMini icon={Users} label="Empleados" value={String(summary.length)} color="text-blue-500" />
        <StatMini icon={Coins} label="Comisiones" value={money(totales.com)} color="text-amber-500" />
        <StatMini icon={Wallet} label="Sueldos base" value={money(totales.base)} color="text-violet-500" />
        <StatMini icon={TrendingUp} label="Total a pagar" value={money(totales.pagar)} color="text-emerald-500" highlight />
      </div>

      <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          {summary.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Banknote className="w-10 h-10 mx-auto mb-2 opacity-40" />
              No hay nómina que calcular en este período.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Empleado</th>
                  <th className="text-right px-3 py-3">Sueldo base</th>
                  <th className="text-right px-3 py-3">Comisiones</th>
                  <th className="text-right px-3 py-3">Override</th>
                  <th className="text-right px-3 py-3">Deducciones</th>
                  <th className="text-right px-3 py-3">Total a pagar</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summary.map(e => (
                  <tr key={e.empleado_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer" onClick={() => onDetalle(e)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">{e.empleado_nombre}</div>
                      <div className="text-[11px] text-slate-400">{getRoleMeta(e.rol)?.label || e.rol} · {e.jobs.length} trabajo(s)</div>
                    </td>
                    <td className="text-right px-3 py-3 text-slate-600 dark:text-slate-300">{money(e.sueldo_base)}</td>
                    <td className="text-right px-3 py-3 text-amber-600 font-medium">{money(e.total_comisiones + e.total_flat)}</td>
                    <td className="text-right px-3 py-3 text-violet-600">{money(e.total_overrides)}</td>
                    <td className="text-right px-3 py-3 text-red-500">{e.deducciones ? `- ${money(e.deducciones)}` : '—'}</td>
                    <td className="text-right px-3 py-3 font-bold text-emerald-600">{money(e.total_pagar)}</td>
                    <td className="text-right px-4 py-3" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => descargarHojaEmpleado(e)}
                          title="Descargar hoja de comisiones (borrador)"
                          className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                        {canLiquidar
                          ? <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8" onClick={() => onLiquidar(e)} disabled={e.total_pagar === 0 && e.jobs.length === 0}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Liquidar
                            </Button>
                          : <ChevronRight className="w-4 h-4 text-slate-300 inline" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-900/50 font-bold text-slate-700 dark:text-slate-200">
                <tr>
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="text-right px-3 py-3">{money(totales.base)}</td>
                  <td className="text-right px-3 py-3 text-amber-600">{money(totales.com)}</td>
                  <td className="text-right px-3 py-3 text-violet-600">{money(totales.over)}</td>
                  <td className="text-right px-3 py-3 text-red-500">{money(totales.ded)}</td>
                  <td className="text-right px-3 py-3 text-emerald-600">{money(totales.pagar)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════ MI RESUMEN (técnico) ════════════════════
function MiResumen({ earnings }: { earnings?: EmployeeEarnings }) {
  if (!earnings) return <div className="text-center py-12 text-slate-400">Sin datos en este período.</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatMini icon={Wallet} label="Sueldo base" value={money(earnings.sueldo_base)} color="text-violet-500" />
        <StatMini icon={Coins} label="Comisiones" value={money(earnings.total_comisiones + earnings.total_flat)} color="text-amber-500" />
        <StatMini icon={TrendingUp} label="Override" value={money(earnings.total_overrides)} color="text-blue-500" />
        <StatMini icon={Banknote} label="Pendiente por cobrar" value={money(earnings.total_pagar)} color="text-emerald-500" highlight />
      </div>
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader><CardTitle className="text-base">Mis trabajos del período</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <JobsTable jobs={earnings.jobs} />
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════ DETALLE DE TRABAJO (modal) ════════════════════
function JobDetailModal({ job, onClose }: { job: JobAssignment; onClose: () => void }) {
  const isAlineacion = job.zona === 'alineacion' || /alineaci/i.test(job.descripcion || '');
  const provPct = Number(job.desglose?.proveedor_pct ?? (isAlineacion ? 35 : 0));
  const provMontoBs = (job.proveedor_monto || 0) * (job.moneda === 'VES' ? 1 : (job.tasa_cambio || 1));
  const provMontoUsd = job.proveedor_monto_usd || 0;
  
  const clienteName = String(job.desglose?.cliente || 'Consumidor Final');
  const vehiculoInfo = String(job.desglose?.vehiculo || 'Vehículo de Taller');
  const placaInfo = String(job.desglose?.placa || '');
  const items = Array.isArray(job.desglose?.items) ? job.desglose.items : [];

  const rateBs = job.tasa_cambio && job.tasa_cambio > 1 ? job.tasa_cambio : 1;
  const ingresoBs = job.ingreso_usd * rateBs;
  const manoObraBs = job.mano_obra_usd * rateBs;
  const comisionBs = job.comision_usd * rateBs;
  const lycosBs = (job.lycos_neto || 0) * rateBs;

  return (
    <ModalShell onClose={onClose} title={`Detalle Desglosado del Trabajo · ${job.fecha}`} zIndex={110}>
      <div className="space-y-4 text-sm">
        {/* Encabezado y Estado */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800/80 border border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛠️</span>
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-100 text-base">{job.descripcion || job.tipo_trabajo || 'Servicio Automotriz'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">{zonaLabel(job.zona)}</span>
                <span>• ID Ref: #{String(job.referencia_id || job.id).slice(0, 8)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EstadoBadge estado={job.estado} />
            {job.referencia_tabla === 'servicios' && job.referencia_id && (
              <a href={`/dashboard/servicios?buscar=${job.referencia_id}`} target="_blank" rel="noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 shadow-sm transition-colors">
                🚗 Ver Servicio
              </a>
            )}
            {job.referencia_tabla === 'ventas_dia' && job.referencia_id && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                🧾 Venta en POS
              </span>
            )}
          </div>
        </div>

        {/* Cliente y Vehículo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <span>👤</span> Cliente Atendido
            </div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 text-base truncate">{clienteName}</div>
            <div className="text-xs text-slate-500 mt-0.5">Registrado vía {job.referencia_tabla || 'sistema'}</div>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <span>🚗</span> Vehículo / Placa
            </div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 text-base truncate">{vehiculoInfo}</div>
            {placaInfo && <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded inline-block mt-1">{placaInfo}</div>}
          </div>
        </div>

        {/* Desglose de ítems (si viene de POS o Servicio con items) */}
        {items.length > 0 && (
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="text-xs font-bold uppercase text-slate-500 mb-2">Desglose de Ítems / Repuestos del Encargo</div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {items.map((it: any, idx: number) => (
                <div key={idx} className="py-1.5 flex justify-between items-center">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{it.nombre || it.descripcion || `Ítem #${idx + 1}`} {it.cantidad > 1 ? `(x${it.cantidad})` : ''}</span>
                  <span className="font-mono text-slate-600 dark:text-slate-400">{money(Number(it.total || it.precio || 0))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cuadro de Desglose Financiero Dual (USD - VES) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
          <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Desglose Financiero & Comisión (Lycos Team)</span>
            {rateBs > 1 && <span className="text-[11px] font-mono bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">Tasa BCV: {rateBs.toFixed(2)} Bs/$</span>}
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Ingreso Total Cobrado al Cliente</span>
                <div className="text-xs text-slate-400">Monto bruto facturado en la orden</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-base text-slate-800 dark:text-slate-100">{money(job.ingreso_usd)} USD</div>
                {rateBs > 1 && <div className="text-xs text-slate-500">Bs. {ingresoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
              </div>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Porción Mano de Obra (Base Comisión)</span>
                <div className="text-xs text-slate-400">Monto sobre el cual se calcula el % del técnico</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-semibold text-slate-700 dark:text-slate-200">{money(job.mano_obra_usd)} USD</div>
                {rateBs > 1 && <div className="text-xs text-slate-500">Bs. {manoObraBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
              </div>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-base">Comisión del Técnico ({job.es_taller ? 'Taller' : job.empleado_nombre})</span>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Regla: <span className="text-indigo-600 dark:text-indigo-400">{job.tipo_regla || 'Estándar'}</span> · {job.es_override ? 'Override Jefe de Taller' : `${job.desglose?.valor || job.desglose?.pct || ''}% s/ ${job.desglose?.base || 'mano de obra'}`}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{money(job.comision_usd)} USD</div>
                {rateBs > 1 && <div className="text-xs font-semibold text-emerald-600/80">Bs. {comisionBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
              </div>
            </div>

            {/* Caso especial de Alineación y Balanceo (Puente Proveedor) */}
            {isAlineacion && provMontoUsd > 0 && (
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-lg">
                <div>
                  <span className="font-medium text-amber-800 dark:text-amber-300">Puente / Proveedor de Alineación ({provPct}%)</span>
                  <div className="text-xs text-amber-600 dark:text-amber-400">Pago externo al proveedor de la máquina</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-amber-700 dark:text-amber-300">{money(provMontoUsd)} USD</div>
                  {rateBs > 1 && <div className="text-xs text-amber-600">Bs. {provMontoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100">Retención del Taller (Lycos Neto)</span>
                <div className="text-xs text-slate-400">Margen neto para el taller después de comisiones</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-indigo-600 dark:text-indigo-400">{money(job.lycos_neto || 0)} USD</div>
                {rateBs > 1 && <div className="text-xs text-slate-500">Bs. {lycosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Pie de modal con botón de cierre */}
        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 px-6">
            Cerrar Detalle
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function JobsTable({ jobs, onSelectJob }: { jobs: JobAssignment[]; onSelectJob?: (job: JobAssignment) => void }) {
  const [selectedJob, setSelectedJob] = useState<JobAssignment | null>(null);
  if (!jobs || jobs.length === 0) return <div className="text-center py-8 text-slate-400 text-sm">Sin trabajos registrados.</div>;
  return (
    <>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Zona</th>
              <th className="text-left px-3 py-2">Detalle</th>
              <th className="text-left px-3 py-2">Cliente / Vehículo</th>
              <th className="text-right px-3 py-2">Mano obra</th>
              <th className="text-right px-4 py-2">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.map(j => (
              <tr
                key={j.id}
                onClick={() => onSelectJob ? onSelectJob(j) : setSelectedJob(j)}
                className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${j.es_override ? 'bg-violet-50/40 dark:bg-violet-950/10' : ''}`}
              >
                <td className="px-4 py-2 text-slate-500">{j.fecha}</td>
                <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-medium">{zonaLabel(j.zona)}</span></td>
                <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{j.es_override ? '↳ Override (cascada)' : (j.descripcion || j.tipo_trabajo || '—')}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">{String(j.desglose?.cliente || 'Consumidor Final')}</div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{String(j.desglose?.vehiculo || 'Vehículo de Taller')}</div>
                </td>
                <td className="text-right px-3 py-2 text-slate-500 font-mono">{money(j.mano_obra_usd)}</td>
                <td className="text-right px-4 py-2 font-bold text-emerald-600 font-mono">{money(j.comision_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedJob && <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </>
  );
}

function StatMini({ icon: Icon, label, value, color, highlight }: any) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/10' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30'}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 uppercase tracking-wider"><Icon className={`w-3.5 h-3.5 ${color}`} /> {label}</div>
      <div className={`text-lg font-bold mt-1 ${highlight ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>{value}</div>
    </div>
  );
}

// ════════════════════ DETALLE EMPLEADO (modal) ════════════════════
function DetalleEmpleadoModal({ earnings, onClose }: { earnings: EmployeeEarnings; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} title={`Detalle · ${earnings.empleado_nombre}`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <MiniKV k="Sueldo base" v={money(earnings.sueldo_base)} />
        <MiniKV k="Comisiones" v={money(earnings.total_comisiones + earnings.total_flat)} />
        <MiniKV k="Override" v={money(earnings.total_overrides)} />
        <MiniKV k="Total a pagar" v={money(earnings.total_pagar)} hl />
      </div>
      <JobsTable jobs={earnings.jobs} />
      {earnings.adelantos.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold uppercase text-slate-400 mb-1">Adelantos / deducciones</div>
          {earnings.adelantos.map(a => (
            <div key={a.id} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">{a.fecha} · {a.motivo || 'Adelanto'}</span>
              <span className="text-red-500">- {money(a.monto_usd)}</span>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function MiniKV({ k, v, hl }: { k: string; v: string; hl?: boolean }) {
  return <div className={`rounded-lg border p-2 ${hl ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/10' : 'border-slate-200 dark:border-slate-800'}`}>
    <div className="text-[10px] text-slate-400 uppercase">{k}</div>
    <div className={`text-base font-bold ${hl ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>{v}</div>
  </div>;
}

// ════════════════════ LIQUIDAR (modal) ════════════════════
function LiquidarModal({ target, range, sedeId, sedeNombre, onClose, onDone }: {
  target: EmployeeEarnings; range: { inicio: string; fin: string }; sedeId: string | null; sedeNombre?: string;
  onClose: () => void; onDone: () => void;
}) {
  const [metodo, setMetodo] = useState('Efectivo USD');
  const [nota, setNota] = useState('');
  const [extra, setExtra] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const totalFinal = Math.max(0, target.total_pagar - extra);

  const liquidar = async () => {
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/nomina/liquidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleado_id: target.empleado_id, inicio: range.inicio, fin: range.fin, sede: sedeId, metodo_pago: metodo, nota, deduccionesExtra: extra }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      // Genera recibo PDF
      generateReciboNominaPDF({
        recibo_numero: d.ledger.recibo_numero, empleado_nombre: target.empleado_nombre, rol: target.rol,
        periodo_inicio: range.inicio, periodo_fin: range.fin, sede_nombre: sedeNombre,
        sueldo_base: d.ledger.sueldo_base, total_comisiones: d.ledger.total_comisiones,
        total_overrides: d.ledger.total_overrides, total_flat: d.ledger.total_flat,
        bruto: d.ledger.bruto, deducciones: d.ledger.deducciones, total_pagar: d.ledger.total_pagar,
        metodo_pago: metodo, pagado_por: d.ledger.pagado_por, nota,
        jobs: target.jobs.map(j => ({ fecha: j.fecha, zona: j.zona, tipo_trabajo: j.tipo_trabajo, descripcion: j.descripcion, comision_usd: j.comision_usd, es_override: j.es_override })),
      });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title={`Liquidar nómina · ${target.empleado_nombre}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 space-y-1.5 text-sm">
          <Row k="Sueldo base" v={money(target.sueldo_base)} />
          <Row k="Comisiones" v={money(target.total_comisiones + target.total_flat)} />
          <Row k="Override (cascada)" v={money(target.total_overrides)} />
          <Row k="Adelantos" v={`- ${money(target.deducciones)}`} red />
          <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5"><Row k="Total a pagar" v={money(totalFinal)} bold /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Método de pago</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)} className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1">
              {['Efectivo USD', 'Efectivo Bs', 'Pago Móvil', 'Zelle', 'Binance', 'Transferencia'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Deducción extra ($)</label>
            <input type="number" step="0.01" value={extra || ''} onChange={e => setExtra(parseFloat(e.target.value) || 0)}
              className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Nota (opcional)</label>
          <input value={nota} onChange={e => setNota(e.target.value)} className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1" />
        </div>
        {err && <div className="text-sm text-red-500 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {err}</div>}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={liquidar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileText className="w-4 h-4 mr-1.5" /> Liquidar y generar recibo</>}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function Row({ k, v, red, bold }: { k: string; v: string; red?: boolean; bold?: boolean }) {
  return <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className={`${red ? 'text-red-500' : bold ? 'text-emerald-600 font-bold text-base' : 'text-slate-700 dark:text-slate-200'}`}>{v}</span></div>;
}

// ════════════════════ REGISTRAR TRABAJO (modal) ════════════════════
function RegistrarTrabajoModal({ sedeId, onClose, onDone }: { sedeId: string | null; onClose: () => void; onDone: () => void }) {
  const [specs, setSpecs] = useState<JobSpec[]>([]);
  const [moneda, setMoneda] = useState('USD');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const guardar = async () => {
    setSaving(true); setErr('');
    try {
      const jobs = specs.map(s => ({ ...s, moneda, descripcion: s.descripcion || descripcion, referencia_tabla: 'manual' }));
      const invalid = jobs.find(j => !j.empleado_id && !j.es_taller);
      if (invalid) throw new Error('Cada fila requiere un técnico o marcar "lo hizo el taller".');
      const r = await fetch('/api/nomina/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs, sede: sedeId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title="Registrar trabajo y comisión">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Moneda del cobro</label>
            <select value={moneda} onChange={e => setMoneda(e.target.value)} className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1">
              <option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="VES">Bolívares (Bs)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Descripción general</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Cambio de silenciador"
              className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1" />
          </div>
        </div>
        <AsignacionTecnicos value={specs} onChange={setSpecs} sedeId={sedeId} moneda={moneda} />
        {err && <div className="text-sm text-red-500 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {err}</div>}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={guardar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar y calcular comisión'}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════ TRABAJOS TAB ════════════════════
function TrabajosTab({ range, sedeId, canEdit, canLiquidar, esTecnico, userId }: any) {
  const [jobs, setJobs] = useState<JobAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobAssignment | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ inicio: range.inicio, fin: range.fin });
    if (sedeId) qs.set('sede', sedeId);
    const r = await fetch(`/api/nomina/jobs?${qs}`); const d = await r.json();
    setJobs(d.jobs || []); setLoading(false);
  }, [range, sedeId]);
  useEffect(() => { load(); }, [load]);

  const anular = async (id: string) => {
    if (!confirm('¿Anular este trabajo y sus comisiones asociadas?')) return;
    const r = await fetch(`/api/nomina/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'anulado' }) });
    if (r.ok) load(); else alert((await r.json()).error);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>;
  return (
    <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardContent className="p-0 overflow-x-auto">
        {jobs.length === 0 ? <div className="text-center py-12 text-slate-400">Sin trabajos en este período.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Técnico</th>
                <th className="text-left px-3 py-2">Zona</th>
                <th className="text-left px-3 py-2">Detalle / Encargo</th>
                <th className="text-left px-3 py-2">Cliente / Vehículo</th>
                <th className="text-right px-3 py-2">Ingreso</th>
                <th className="text-right px-3 py-2">Mano obra</th>
                <th className="text-right px-3 py-2">Comisión</th>
                <th className="text-center px-3 py-2">Estado</th>
                {canLiquidar && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.map(j => (
                <tr
                  key={j.id}
                  onClick={() => setSelectedJob(j)}
                  className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${j.estado === 'anulado' ? 'opacity-40' : j.es_override ? 'bg-violet-50/40 dark:bg-violet-950/10' : ''}`}
                >
                  <td className="px-4 py-2 text-slate-500">{j.fecha}</td>
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{j.es_taller ? '🏢 Taller' : j.empleado_nombre}{j.es_override && <span className="text-[10px] text-violet-500 ml-1">override</span>}</td>
                  <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{zonaLabel(j.zona)}</span></td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-medium">{j.es_override ? '↳ Override (cascada)' : (j.descripcion || j.tipo_trabajo || '—')}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{String(j.desglose?.cliente || 'Consumidor Final')}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{String(j.desglose?.vehiculo || 'Vehículo de Taller')}</div>
                  </td>
                  <td className="text-right px-3 py-2 text-slate-500 font-mono">{money(j.ingreso_usd)}</td>
                  <td className="text-right px-3 py-2 text-slate-500 font-mono">{money(j.mano_obra_usd)}</td>
                  <td className="text-right px-3 py-2 font-bold text-emerald-600 font-mono">{money(j.comision_usd)}</td>
                  <td className="text-center px-3 py-2"><EstadoBadge estado={j.estado} /></td>
                  {canLiquidar && (
                    <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                      {j.estado === 'pendiente' && <button onClick={() => anular(j.id)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {selectedJob && <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </Card>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: any = { pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30', liquidado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30', anulado: 'bg-slate-100 text-slate-500 dark:bg-slate-800' };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${map[estado] || ''}`}>{estado}</span>;
}

// ════════════════════ REGLAS TAB ════════════════════
function RuleDetailModal({ rule, onClose }: { rule: CommissionRule; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} title={`Detalle de Regla de Comisión · ${rule.tipo_regla}`} zIndex={9999}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">👤 Empleado Vinculado</div>
            <div className="font-semibold text-base text-slate-800 dark:text-slate-200"><EmpName id={rule.empleado_id} /></div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">ID: {rule.empleado_id || 'Global / Todos'}</div>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">🛠️ Zona y Tipo de Regla</div>
            <div className="font-semibold text-base text-slate-800 dark:text-slate-200">{zonaLabel(rule.zona)}</div>
            <div className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 inline-block mt-1.5 font-bold">
              {rule.tipo_regla}
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Coins className="w-4 h-4" /> Configuración y Porcentajes de Cálculo
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-slate-400 font-medium block">Valor Principal:</span>
              <span className="font-black text-base text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {rule.tipo_regla === 'fijo_semanal' ? money(rule.valor) : `${rule.valor}%`}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-slate-400 font-medium block">Base de Cálculo:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 uppercase mt-0.5 block">{rule.base}</span>
            </div>
            {rule.proveedor_pct != null && (
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-orange-200 dark:border-orange-900/50">
                <span className="text-slate-400 font-medium block">Puente Proveedor:</span>
                <span className="font-black text-base text-orange-600 mt-0.5 block">{rule.proveedor_pct}%</span>
              </div>
            )}
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">📝 Descripción / Notas de Aplicación</div>
          <div className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{rule.descripcion || 'Sin descripción adicional en esta regla.'}</div>
        </div>
      </div>
    </ModalShell>
  );
}

function FlatRateDetailModal({ flat, onClose }: { flat: FlatRate; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} title={`Detalle de Tarifa a Destajo (Flat) · ${flat.label}`} zIndex={9999}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">👤 Empleado Asignado</div>
            <div className="font-semibold text-base text-slate-800 dark:text-slate-200"><EmpName id={flat.empleado_id} /></div>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">🔧 Servicio Específico</div>
            <div className="font-bold text-base text-emerald-600 dark:text-emerald-400">{flat.label}</div>
            <div className="text-xs text-slate-500 mt-0.5 font-medium">Zona: {zonaLabel(flat.zona)}</div>
          </div>
        </div>
        <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center justify-between shadow-sm">
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-200 block text-base">Tarifa fija por servicio</span>
            <span className="text-xs text-slate-500">Monto exacto abonado por cada unidad realizada</span>
          </div>
          <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{money(flat.monto)}</span>
        </div>
      </div>
    </ModalShell>
  );
}

function ReglasTab({ sedeId, isAdmin }: { sedeId: string | null; isAdmin: boolean }) {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [flats, setFlats] = useState<FlatRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedOpen, setSeedOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CommissionRule | null>(null);
  const [selectedFlat, setSelectedFlat] = useState<FlatRate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = sedeId ? `?sede=${sedeId}` : '';
    const [r1, r2] = await Promise.all([fetch(`/api/nomina/rules${qs}`), fetch(`/api/nomina/flat-rates${qs}`)]);
    setRules((await r1.json()).rules || []); setFlats((await r2.json()).flatRates || []);
    setLoading(false);
  }, [sedeId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Reglas dinámicas vinculadas a cada empleado. El cálculo nunca usa nombres fijos. <span className="font-semibold text-slate-700 dark:text-slate-300">Haz clic en cualquier fila para ver los detalles desglosados.</span></p>
        {isAdmin && <Button onClick={() => setSeedOpen(true)} variant="outline"><Settings2 className="w-4 h-4 mr-1.5" /> Aplicar plantillas</Button>}
      </div>
      <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardHeader className="py-3"><CardTitle className="text-base">Reglas de comisión ({rules.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rules.length === 0 ? <div className="text-center py-8 text-slate-400 text-sm">Sin reglas. Aplica las plantillas para empezar.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase">
                <tr><th className="text-left px-4 py-2">Empleado</th><th className="text-left px-3 py-2">Zona</th><th className="text-left px-3 py-2">Tipo</th><th className="text-right px-3 py-2">Valor</th><th className="text-left px-3 py-2">Base</th><th className="text-left px-3 py-2">Descripción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rules.map(r => (
                  <tr key={r.id} onClick={() => setSelectedRule(r)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-4 py-2"><EmpName id={r.empleado_id} /></td>
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{zonaLabel(r.zona)}</td>
                    <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 font-semibold">{r.tipo_regla}</span></td>
                    <td className="text-right px-3 py-2 font-bold text-emerald-600">{r.tipo_regla === 'fijo_semanal' ? money(r.valor) : `${r.valor}%`}{r.proveedor_pct ? <span className="text-[10px] text-orange-500 ml-1">+prov {r.proveedor_pct}%</span> : ''}</td>
                    <td className="px-3 py-2 text-slate-500 uppercase text-xs font-mono">{r.base}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-[200px]">{r.descripcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardHeader className="py-3"><CardTitle className="text-base">Tarifas a destajo ({flats.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {flats.length === 0 ? <div className="text-center py-8 text-slate-400 text-sm">Sin tarifas flat.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase">
                <tr><th className="text-left px-4 py-2">Empleado</th><th className="text-left px-3 py-2">Servicio</th><th className="text-left px-3 py-2">Zona</th><th className="text-right px-4 py-2">Monto</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {flats.map(f => (
                  <tr key={f.id} onClick={() => setSelectedFlat(f)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"><td className="px-4 py-2"><EmpName id={f.empleado_id} /></td><td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{f.label}</td><td className="px-3 py-2 text-slate-500">{zonaLabel(f.zona)}</td><td className="text-right px-4 py-2 font-bold font-mono text-emerald-600">{money(f.monto)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {seedOpen && <SeedModal sedeId={sedeId} onClose={() => setSeedOpen(false)} onDone={() => { setSeedOpen(false); load(); }} />}
      {selectedRule && <RuleDetailModal rule={selectedRule} onClose={() => setSelectedRule(null)} />}
      {selectedFlat && <FlatRateDetailModal flat={selectedFlat} onClose={() => setSelectedFlat(null)} />}
    </div>
  );
}

function EmpName({ id }: { id: string | null }) {
  const [name, setName] = useState<string>('—');
  useEffect(() => {
    if (!id) { setName('— (global)'); return; }
    let active = true;
    fetch(`/api/nomina/technicians`).then(r => r.json()).then(d => {
      const t = (d.technicians || []).find((x: any) => x.id === id);
      if (active) setName(t?.nombre || id.slice(0, 8));
    }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  return <span className="font-medium text-slate-700 dark:text-slate-200">{name}</span>;
}

// ════════════════════ SEED (plantillas) ════════════════════
function SeedModal({ sedeId, onClose, onDone }: { sedeId: string | null; onClose: () => void; onDone: () => void }) {
  const [techs, setTechs] = useState<any[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [proveedor, setProveedor] = useState('Proveedor Puente Alineación');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Plantillas calcadas de las relaciones de pago reales de administración.
  // Al aplicar, también se guarda la cédula, alias y área en el perfil del empleado.
  const plantillas = [
    { key: 'rafael', label: 'Rafael Ramirez (V-16.278.639) — Alineación 25% · Revisión/reemplazo 40% · Bs: puente 35% + Lycos 45% + Rafael 20%' },
    { key: 'roger', label: 'Roger Rodriguez (V-10.279.435) — Fijo $40/sem + Mecánica 40% mano de obra' },
    { key: 'jim', label: 'Jim Rincon (V-11.038.792) — Jefe de taller: 7% supervisión + 40% ejecución propia' },
    { key: 'acevedo', label: 'Antonio Acevedo (V-3.882.980) — Dpto. Inventario: fijo $40/sem' },
    { key: 'freddy', label: 'Freddy Rodriguez (V-11.098.823) — Silenciadores: 50% por cada trabajo' },
    { key: 'nelson', label: 'Margarito Carvajal “NELSON” (V-8.683.914) — Cauchera: 30% reparación · 40% revisión/rotación · 100% adicional' },
    { key: 'angel', label: 'Angel Perez (V-16.888.296) — Latonería y Pintura: Por definir (según presupuesto con el cliente)' },
    { key: 'frank', label: 'Francisco Hernandez (V-9.284.889) — Mecánica 40% mano de obra' },
    { key: 'dyan', label: 'Dyan Anchundia (V-29.622.223) — Autolavado: Por definir (caso especial)' },
  ];
  useEffect(() => { fetch(`/api/nomina/technicians${sedeId ? `?sede=${sedeId}` : ''}`).then(r => r.json()).then(d => setTechs(d.technicians || [])); }, [sedeId]);

  const aplicar = async () => {
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/nomina/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sede_id: sedeId, proveedor_nombre: proveedor, assignments: map }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title="Aplicar plantillas de comisión">
      <p className="text-xs text-slate-500 mb-3">Asigna cada plantilla a un empleado. Esto reemplaza sus reglas previas en esta sede.</p>
      <div className="space-y-2">
        {plantillas.map(p => (
          <div key={p.key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-xs flex-1 text-slate-600 dark:text-slate-300">{p.label}</span>
            <select value={map[p.key] || ''} onChange={e => setMap(m => ({ ...m, [p.key]: e.target.value }))}
              className="h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm sm:w-48">
              <option value="">— No asignar —</option>
              {techs.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <label className="text-xs text-slate-500">Nombre del proveedor del puente (alineación)</label>
        <input value={proveedor} onChange={e => setProveedor(e.target.value)} className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1" />
      </div>
      {err && <div className="text-sm text-red-500 mt-2">{err}</div>}
      <div className="flex gap-2 pt-4">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={aplicar} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar plantillas'}</Button>
      </div>
    </ModalShell>
  );
}

// ════════════════════ ADELANTOS TAB ════════════════════
function AdelantosTab({ sedeId, onChange }: { sedeId: string | null; onChange: () => void }) {
  const [advances, setAdvances] = useState<any[]>([]);
  const [techs, setTechs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ empleado_id: '', monto: '', moneda: 'USD', motivo: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = sedeId ? `?sede=${sedeId}` : '';
    const [r1, r2] = await Promise.all([fetch(`/api/nomina/advances${qs}`), fetch(`/api/nomina/technicians${qs}`)]);
    setAdvances((await r1.json()).advances || []); setTechs((await r2.json()).technicians || []);
    setLoading(false);
  }, [sedeId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.empleado_id || !form.monto) return;
    setSaving(true);
    const r = await fetch('/api/nomina/advances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, monto: parseFloat(form.monto), sede: sedeId }) });
    setSaving(false);
    if (r.ok) { setForm({ empleado_id: '', monto: '', moneda: 'USD', motivo: '' }); load(); onChange(); } else alert((await r.json()).error);
  };
  const anular = async (id: string) => { if (!confirm('¿Anular adelanto?')) return; const r = await fetch(`/api/nomina/advances/${id}`, { method: 'DELETE' }); if (r.ok) { load(); onChange(); } else alert((await r.json()).error); };

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="py-3"><CardTitle className="text-base">Registrar adelanto / deducción</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <select value={form.empleado_id} onChange={e => setForm(f => ({ ...f, empleado_id: e.target.value }))} className="h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm flex-1 min-w-[160px]">
            <option value="">— Empleado —</option>{techs.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Monto" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="h-9 w-28 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm" />
          <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className="h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"><option>USD</option><option>EUR</option><option>VES</option></select>
          <input placeholder="Motivo" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} className="h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm flex-1 min-w-[120px]" />
          <Button onClick={add} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}</Button>
        </CardContent>
      </Card>
      <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> :
            advances.length === 0 ? <div className="text-center py-8 text-slate-400 text-sm">Sin adelantos.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-2">Fecha</th><th className="text-left px-3 py-2">Empleado</th><th className="text-left px-3 py-2">Motivo</th><th className="text-right px-3 py-2">Monto</th><th className="text-center px-3 py-2">Estado</th><th className="px-3 py-2"></th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {advances.map(a => (
                  <tr key={a.id} className={a.estado === 'anulado' ? 'opacity-40' : ''}>
                    <td className="px-4 py-2 text-slate-500">{a.fecha}</td><td className="px-3 py-2 font-medium">{a.empleado_nombre}</td><td className="px-3 py-2 text-slate-500">{a.motivo || '—'}</td>
                    <td className="text-right px-3 py-2 text-red-500">- {money(a.monto_usd)}</td><td className="text-center px-3 py-2"><EstadoBadge estado={a.estado} /></td>
                    <td className="px-3 py-2 text-right">{a.estado === 'pendiente' && <button onClick={() => anular(a.id)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════ HISTORIAL TAB ════════════════════
function HistorialTab({ sedeId, isAdmin }: { sedeId: string | null; isAdmin: boolean }) {
  const [ledgers, setLedgers] = useState<PayrollLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const qs = sedeId ? `?sede=${sedeId}` : '';
    const r = await fetch(`/api/nomina/ledger${qs}`); setLedgers((await r.json()).ledgers || []); setLoading(false);
  }, [sedeId]);
  useEffect(() => { load(); }, [load]);

  const reimprimir = async (l: PayrollLedger) => {
    const r = await fetch(`/api/nomina/ledger/${l.id}`); const d = await r.json();
    if (!r.ok) return alert(d.error);
    generateReciboNominaPDF({
      recibo_numero: l.recibo_numero || '', empleado_nombre: l.empleado_nombre || '', periodo_inicio: l.periodo_inicio, periodo_fin: l.periodo_fin,
      sueldo_base: l.sueldo_base, total_comisiones: l.total_comisiones, total_overrides: l.total_overrides, total_flat: l.total_flat,
      bruto: l.bruto, deducciones: l.deducciones, total_pagar: l.total_pagar, metodo_pago: l.metodo_pago, pagado_por: l.pagado_por, nota: l.nota,
      jobs: (d.jobs || []).map((j: any) => ({ fecha: j.fecha, zona: j.zona, tipo_trabajo: j.tipo_trabajo, descripcion: j.descripcion, comision_usd: j.comision_usd, es_override: j.es_override })),
    });
  };
  const anular = async (id: string) => { if (!confirm('¿Anular esta liquidación? Los trabajos volverán a pendiente.')) return; const r = await fetch(`/api/nomina/ledger/${id}`, { method: 'PATCH' }); if (r.ok) load(); else alert((await r.json()).error); };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>;
  return (
    <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardContent className="p-0 overflow-x-auto">
        {ledgers.length === 0 ? <div className="text-center py-12 text-slate-400">Sin pagos registrados.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase"><tr><th className="text-left px-4 py-2">Recibo</th><th className="text-left px-3 py-2">Empleado</th><th className="text-left px-3 py-2">Período</th><th className="text-right px-3 py-2">Total</th><th className="text-center px-3 py-2">Estado</th><th className="text-right px-4 py-2">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ledgers.map(l => (
                <tr key={l.id} className={l.estado === 'anulado' ? 'opacity-40' : ''}>
                  <td className="px-4 py-2 font-mono text-xs">{l.recibo_numero}</td>
                  <td className="px-3 py-2 font-medium">{l.empleado_nombre}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{l.periodo_inicio} → {l.periodo_fin}</td>
                  <td className="text-right px-3 py-2 font-bold text-emerald-600">{money(l.total_pagar)}</td>
                  <td className="text-center px-3 py-2"><EstadoBadge estado={l.estado} /></td>
                  <td className="text-right px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => reimprimir(l)} className="text-slate-400 hover:text-blue-500 p-1" title="Descargar recibo"><Download className="w-4 h-4" /></button>
                      {isAdmin && l.estado !== 'anulado' && <button onClick={() => anular(l.id)} className="text-slate-400 hover:text-red-500 p-1" title="Anular"><X className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════ SHELL DE MODAL ════════════════════
function ModalShell({ children, onClose, title, zIndex = 9999 }: { children: React.ReactNode; onClose: () => void; title: string; zIndex?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 overflow-y-auto"
      style={{ zIndex }}
      onClick={onClose}
    >
      <Card
        className="w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 opacity-100 !bg-opacity-100 my-auto rounded-2xl overflow-hidden"
        onClick={(e: any) => e.stopPropagation()}
      >
        <CardHeader className="py-4 px-5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between shrink-0">
          <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>🔍</span> {title}
          </CardTitle>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-4 bg-white dark:bg-slate-900">
          {children}
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}

// ════════════════════ DETALLE DE OPERACIÓN IA (modal) ════════════════════
function AIOperationDetailModal({ op, onClose }: { op: any; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} title={`Detalle de Análisis IA · ${op.fecha}`} zIndex={110}>
      <div className="space-y-4 text-sm">
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start gap-3">
          <Bot className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-base">Análisis Inteligente (Gemini / Heurístico)</div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Razonamiento: <span className="font-semibold text-indigo-700 dark:text-indigo-300">{op.razon || 'Clasificado automáticamente'}</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">
                Confianza: {Math.round((op.confianza || 0) * 100)}%
              </span>
              {op.requiere_revision && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Requiere revisión
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">🛠️ Trabajo / Encargo Detectado</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 text-base">{op.descripcion || op.tipo_trabajo || '—'}</div>
            <div className="text-xs text-slate-500 mt-1">Zona asignada: <span className="font-medium text-slate-700 dark:text-slate-300">{zonaLabel(op.zona)}</span></div>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">👤 Técnico / Encargado</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 text-base">{op.es_taller ? '🏢 Taller (sin técnico)' : (op.empleado_nombre || 'Sin asignar')}</div>
            {op.encargado_detectado && (
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">Mención en orden: {op.encargado_detectado}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">👤 Cliente</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 text-base truncate">{op.cliente || 'Consumidor Final'}</div>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">🚗 Vehículo / Placa</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 text-base truncate">{op.vehiculo || 'Vehículo de Taller'}</div>
          </div>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2">
          <div className="text-xs font-bold uppercase text-slate-400">Estimación de Montos</div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 dark:text-slate-400">Monto Total de la Orden:</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{money(op.monto)} USD</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 dark:text-slate-400">Porción Estimada Mano de Obra:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{money(op.mano_obra)} USD</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 px-6">
            Cerrar Detalle
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════ ANÁLISIS CON IA ════════════════════
function AnalisisIATab({ range, sedeId, onDone }: { range: { inicio: string; fin: string }; sedeId: string | null; onDone: () => void }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ops, setOps] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [techs, setTechs] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [selectedAIOp, setSelectedAIOp] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/nomina/technicians${sedeId ? `?sede=${sedeId}` : ''}`).then(r => r.json()).then(d => setTechs(d.technicians || [])).catch(() => {});
  }, [sedeId]);

  const analizar = async () => {
    setAnalyzing(true); setErr(''); setMsg(''); setDone(false); setOps([]); setStats(null);
    try {
      const qs = new URLSearchParams({ inicio: range.inicio, fin: range.fin });
      if (sedeId) qs.set('sede', sedeId);
      const r = await fetch(`/api/nomina/ai-analyze?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al analizar');
      if (d.total === 0 || (d.operaciones || []).length === 0) {
        setMsg(d.mensaje || 'No hay operaciones sin asignar en este período.');
      } else {
        setOps((d.operaciones || []).map((o: any) => ({ ...o, omitir: false })));
        setStats(d.stats);
      }
    } catch (e: any) { setErr(e.message); } finally { setAnalyzing(false); }
  };

  const updateOp = (idx: number, patch: any) => {
    setOps(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o));
  };

  const confirmar = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const r = await fetch('/api/nomina/ai-analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inicio: range.inicio, fin: range.fin, sede: sedeId, operaciones: ops }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al registrar');
      setMsg(`${d.creados} trabajo(s) registrados correctamente.${d.errores?.length ? ` ${d.errores.length} con error.` : ''}`);
      setDone(true);
      setOps([]);
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const incluidas = ops.filter(o => !o.omitir).length;

  return (
    <div className="space-y-4">
      {/* Header / launcher */}
      <div className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Motor de Comisiones con IA</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              La IA (Gemini) analiza las ventas y servicios del período <b>{range.inicio} → {range.fin}</b>, detecta el técnico ejecutor, el tipo de servicio y la mano de obra, y prepara los trabajos para comisión. Revísalos y confirma.
            </p>
            <div className="mt-3">
              <Button onClick={analizar} disabled={analyzing || saving}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white">
                {analyzing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Analizando con IA...</> : <><Wand2 className="w-4 h-4 mr-1.5" /> Analizar período con IA</>}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {err && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg p-3"><AlertCircle className="w-4 h-4" /> {err}</div>}
      {msg && <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3"><CheckCircle2 className="w-4 h-4" /> {msg}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Operaciones', val: stats.total, color: 'text-slate-700 dark:text-slate-200' },
            { label: 'Con técnico', val: stats.con_tecnico, color: 'text-emerald-600' },
            { label: 'Requieren revisión', val: stats.requieren_revision, color: 'text-amber-600' },
            { label: 'Monto total', val: money(stats.monto_total), color: 'text-indigo-600' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla editable de operaciones clasificadas */}
      {ops.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold">Incluir</th>
                  <th className="px-3 py-2 font-semibold">Descripción</th>
                  <th className="px-3 py-2 font-semibold">Zona</th>
                  <th className="px-3 py-2 font-semibold">Técnico</th>
                  <th className="px-3 py-2 font-semibold text-right">Monto</th>
                  <th className="px-3 py-2 font-semibold text-right">Mano obra</th>
                  <th className="px-3 py-2 font-semibold">IA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ops.map((o, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedAIOp(o)}
                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${o.omitir ? 'opacity-40' : ''} ${o.requiere_revision ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}
                  >
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={!o.omitir} onChange={e => updateOp(idx, { omitir: !e.target.checked })} className="rounded" />
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <div className="truncate font-medium text-slate-700 dark:text-slate-200" title={o.descripcion}>{o.descripcion}</div>
                      <div className="text-[10px] text-slate-400">{o.fecha} · {o.cliente || 's/cliente'}</div>
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <select value={o.zona} onChange={e => updateOp(idx, { zona: e.target.value })}
                        className="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-1 text-xs">
                        {ZONAS_TRABAJO.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <select
                        value={o.es_taller ? '__taller__' : (o.empleado_id || '')}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__taller__') updateOp(idx, { es_taller: true, empleado_id: null, empleado_nombre: 'Taller (sin técnico)' });
                          else { const t = techs.find(x => x.id === v); updateOp(idx, { es_taller: false, empleado_id: v || null, empleado_nombre: t?.nombre || null }); }
                        }}
                        className="rounded border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-1 text-xs max-w-[140px]">
                        <option value="">— sin asignar —</option>
                        <option value="__taller__">Taller (sin técnico)</option>
                        {techs.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{o.monto?.toFixed(2)} {o.moneda}</td>
                    <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                      <input type="number" step="0.01" value={o.mano_obra}
                        onChange={e => updateOp(idx, { mano_obra: Number(e.target.value) })}
                        className="w-20 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-1 text-xs text-right" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${o.confianza >= 0.7 ? 'bg-emerald-500' : o.confianza >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`} title={`Confianza: ${Math.round(o.confianza * 100)}%`} />
                        {o.requiere_revision && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      </div>
                      <div className="text-[9px] text-slate-400 max-w-[120px] truncate" title={o.razon}>{o.razon}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500">{incluidas} de {ops.length} operaciones se registrarán como comisión.</p>
            <Button onClick={confirmar} disabled={saving || incluidas === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Registrando...</> : <><Save className="w-4 h-4 mr-1.5" /> Confirmar y registrar comisiones</>}
            </Button>
          </div>
        </div>
      )}
      {selectedAIOp && <AIOperationDetailModal op={selectedAIOp} onClose={() => setSelectedAIOp(null)} />}
    </div>
  );
}
