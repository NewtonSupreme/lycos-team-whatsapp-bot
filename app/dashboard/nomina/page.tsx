'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Banknote, Loader2, Wallet, TrendingUp, Calendar, RefreshCw, Plus,
  CheckCircle2, FileText, AlertTriangle, Settings2, ChevronLeft, ChevronRight, Download, X, Coins,
  AlertCircle, Bot, Save,
} from 'lucide-react';
import {
  getPermisos, hasPermiso, resolveRol, getRoleMeta, ZONAS_TRABAJO,
  type EmployeeEarnings, type PayrollLedger, type JobAssignment,
} from '@/types';
import { generateReciboNominaPDF } from '@/lib/recibo-nomina-pdf';
import { generateNominaConsolidadaPDF, generateRelacionPagoPDF } from '@/lib/nomina/relacion-pago-pdf';
import PanelReglas from '@/components/nomina/reglas/PanelReglas';
import DetectarTrabajos from '@/components/nomina/DetectarTrabajos';
import PersonalYComisiones, { type AsignacionEmpleado } from '@/components/nomina/PersonalYComisiones';
import { asignacionesValidas, buildJobsDesdeAsignacion } from '@/lib/nomina/asignaciones';
import { categoriaToZona, inferirCategoria } from '@/lib/categorias';
import { cn } from '@/lib/utils';
import ErpShell, { NominaIcon } from '@/components/erp/ErpShell';
import NominaKpis from '@/components/nomina/v2/NominaKpis';
import EmpleadosPanel from '@/components/nomina/v2/EmpleadosPanel';
import DetalleEmpleado from '@/components/nomina/DetalleEmpleado';
import ReconciliarEncargados from '@/components/nomina/ReconciliarEncargados';
import NominaRail, { type AccionRapida, type NominaCerrada } from '@/components/nomina/v2/NominaRail';
import ProcesarNominaModal from '@/components/nomina/v2/ProcesarNominaModal';
import RevisionNomina from '@/components/nomina/RevisionNomina';
import { formatoMonto, iniciales, type FilaEmpleado, type Moneda } from '@/components/nomina/v2/tipos';

type Tab = 'resumen' | 'empleados' | 'trabajos' | 'conceptos' | 'deducciones' | 'reportes' | 'ia' | 'configuracion';

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

/**
 * Los períodos con los que se paga.
 *
 * El taller cierra por semana, pero administración también liquida por
 * quincena y revisa el mes completo. La quincena es 1–15 y 16–fin de mes, como
 * se usa aquí. El sueldo fijo se prorratea solo: `semanasEnPeriodo` divide los
 * días entre 7, así que $40 semanales dan $85,71 en una quincena y $171,43 en
 * un mes de 30 días, sin que haya que configurar nada.
 */
const PRESETS = [
  { key: 'semana', label: 'Esta semana', tipo: 'Semanal' },
  { key: 'semana_pasada', label: 'Semana pasada', tipo: 'Semanal' },
  { key: 'quincena', label: 'Esta quincena', tipo: 'Quincenal' },
  { key: 'quincena_pasada', label: 'Quincena pasada', tipo: 'Quincenal' },
  { key: 'mes', label: 'Este mes', tipo: 'Mensual' },
  { key: 'mes_pasado', label: 'Mes pasado', tipo: 'Mensual' },
  { key: 'custom', label: 'Personalizado', tipo: 'A medida' },
];

export const tipoPeriodo = (key: string) => PRESETS.find(p => p.key === key)?.tipo || 'A medida';

/** La quincena que contiene esa fecha: del 1 al 15, o del 16 al último día. */
function quincenaDe(d: Date): { inicio: string; fin: string } {
  const y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() <= 15) {
    return { inicio: getLocalISODate(new Date(y, m, 1)), fin: getLocalISODate(new Date(y, m, 15)) };
  }
  return { inicio: getLocalISODate(new Date(y, m, 16)), fin: getLocalISODate(new Date(y, m + 1, 0)) };
}

function presetRange(key: string): { inicio: string; fin: string } {
  const hoy = new Date();
  if (key === 'semana') { const i = isoWeekStart(hoy); return { inicio: i, fin: addDays(i, 6) }; }
  if (key === 'semana_pasada') { const i = addDays(isoWeekStart(hoy), -7); return { inicio: i, fin: addDays(i, 6) }; }
  if (key === 'quincena') return quincenaDe(hoy);
  if (key === 'quincena_pasada') {
    // Un día antes del inicio de la quincena actual cae siempre en la anterior.
    const actual = quincenaDe(hoy);
    const previo = new Date(actual.inicio + 'T00:00:00');
    previo.setDate(previo.getDate() - 1);
    return quincenaDe(previo);
  }
  if (key === 'mes') return { inicio: monthStart(hoy), fin: monthEnd(hoy) };
  if (key === 'mes_pasado') { const p = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15); return { inicio: monthStart(p), fin: monthEnd(p) }; }
  const i = isoWeekStart(hoy); return { inicio: i, fin: addDays(i, 6) };
}

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const;
const MESES_CORTO = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'] as const;

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES_CORTO[m - 1]} ${y}`;
};

/** El título del selector de período: mes con nombre, o el rango exacto. */
function etiquetaPeriodo(preset: string, range: { inicio: string; fin: string }): string {
  if (preset === 'mes' || preset === 'mes_pasado') {
    const [y, m] = range.inicio.split('-').map(Number);
    return `${MESES_LARGO[m - 1]}, ${y}`;
  }
  if (preset === 'quincena' || preset === 'quincena_pasada') {
    const [y, m, d] = range.inicio.split('-').map(Number);
    return `${d === 1 ? '1ª' : '2ª'} quincena · ${MESES_LARGO[m - 1]} ${y}`;
  }
  return `${fechaCorta(range.inicio)} – ${fechaCorta(range.fin)}`;
}

/** Corre el período un paso adelante o atrás, respetando su unidad. */
function correrPeriodo(preset: string, range: { inicio: string; fin: string }, paso: number) {
  if (preset === 'quincena' || preset === 'quincena_pasada') {
    const ref = new Date(range.inicio + 'T00:00:00');
    // Saltar 16 días desde el día 1, o 16 hacia atrás desde el 16, cae siempre
    // en la quincena vecina sin importar si el mes tiene 28, 30 o 31 días.
    ref.setDate(ref.getDate() + paso * 16);
    return quincenaDe(ref);
  }
  if (preset === 'mes' || preset === 'mes_pasado') {
    const [y, m] = range.inicio.split('-').map(Number);
    const base = new Date(y, m - 1 + paso, 1);
    return { inicio: monthStart(base), fin: monthEnd(base) };
  }
  const dias = Math.round(
    (new Date(range.fin + 'T00:00:00').getTime() - new Date(range.inicio + 'T00:00:00').getTime()) / 86400000,
  ) + 1;
  return { inicio: addDays(range.inicio, paso * dias), fin: addDays(range.fin, paso * dias) };
}

interface UsuarioMeta {
  cedula?: string | null;
  especialidad?: string | null;
  foto_url?: string | null;
  rol?: string | null;
  alias?: string | null;
  cargo?: string | null;
  area?: string | null;
}

export default function NominaPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede } = useSedeStore();
  const sedeId = currentSede?.id || null;

  const rol = resolveRol(user?.rol);
  const isAdmin = rol === 'admin';
  const permisos = getPermisos(user?.rol || 'mecanico', user?.permisos, roleDefaults);
  const canEdit = isAdmin || hasPermiso(permisos.nomina, 'editar');
  const canLiquidar = isAdmin || rol === 'administracion' || rol === 'supervisor';
  const esTecnico = !!getRoleMeta(rol)?.esTecnico && !isAdmin;

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>('resumen');
  const [preset, setPreset] = useState('semana');
  const [range, setRange] = useState(presetRange('semana'));
  const [menuPeriodo, setMenuPeriodo] = useState(false);

  const [summary, setSummary] = useState<EmployeeEarnings[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMeta>>({});
  const [ledgers, setLedgers] = useState<PayrollLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [moneda, setMoneda] = useState<Moneda>('usd');
  const [tasa, setTasa] = useState(0);

  const [liquidarTarget, setLiquidarTarget] = useState<EmployeeEarnings | null>(null);
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [detalle, setDetalle] = useState<FilaEmpleado | null>(null);
  const [procesarOpen, setProcesarOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const loadSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const qs = new URLSearchParams({ inicio: range.inicio, fin: range.fin });
      if (sedeId) qs.set('sede', sedeId);
      const r = await fetch(`/api/nomina/summary?${qs}`);
      const d = await r.json();
      setSummary(r.ok ? (d.summary || []) : []);
    } catch { setSummary([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [range, sedeId]);

  /** Ficha del personal: cédula, especialidad y foto para la tabla. */
  const loadUsuarios = useCallback(async () => {
    try {
      const qs = sedeId ? `?sede=${sedeId}` : '';
      const r = await fetch(`/api/nomina/technicians${qs}`);
      const d = await r.json();
      const mapa: Record<string, UsuarioMeta> = {};
      const gente = (d.technicians || []) as (UsuarioMeta & { id: string })[];
      gente.forEach(u => {
        mapa[u.id] = {
          cedula: u.cedula, especialidad: u.especialidad, foto_url: u.foto_url,
          rol: u.rol, alias: u.alias, cargo: u.cargo, area: u.area,
        };
      });
      setUsuarios(mapa);
    } catch { /* la tabla funciona igual sin la ficha */ }
  }, [sedeId]);

  const loadLedgers = useCallback(async () => {
    try {
      const qs = sedeId ? `?sede=${sedeId}` : '';
      const r = await fetch(`/api/nomina/ledger${qs}`);
      const d = await r.json();
      setLedgers(d.ledgers || []);
    } catch { setLedgers([]); }
  }, [sedeId]);

  useEffect(() => { if (mounted) loadSummary(); }, [mounted, loadSummary]);
  useEffect(() => { if (mounted) { loadUsuarios(); loadLedgers(); } }, [mounted, loadUsuarios, loadLedgers]);

  // La tasa solo se pide si se va a mostrar en bolívares.
  useEffect(() => {
    if (moneda !== 'ves' || tasa > 0) return;
    fetch('/api/nomina/rates')
      .then(r => r.json())
      .then(d => setTasa(Number(d?.ves?.bcv ?? d?.bcv ?? d?.ves ?? 0) || 0))
      .catch(() => setTasa(0));
  }, [moneda, tasa]);

  // Tiempo real: cualquier cambio en trabajos o liquidaciones refresca todo.
  useEffect(() => {
    if (!supabase || !mounted) return;
    const refrescar = () => { loadSummary(true); loadLedgers(); };
    const ch = supabase.channel('nomina-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_assignments' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_ledger' }, refrescar)
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [mounted, loadSummary, loadLedgers]);

  const onPreset = (k: string) => {
    setPreset(k);
    setMenuPeriodo(false);
    if (k !== 'custom') setRange(presetRange(k));
  };

  // ── Modelo de vista de la tabla ─────────────────────────────────────────
  const filas: FilaEmpleado[] = useMemo(() => summary.map(e => {
    const u = usuarios[e.empleado_id] || {};
    return {
      id: e.empleado_id,
      nombre: e.empleado_nombre,
      cedula: u.cedula || '',
      cargo: getRoleMeta(e.rol)?.label || e.rol || '—',
      departamento: u.especialidad ? zonaLabel(u.especialidad) : '—',
      fotoUrl: u.foto_url,
      sueldoBase: e.sueldo_base,
      comisiones: e.total_comisiones + e.total_flat,
      overrides: e.total_overrides,
      devengado: e.bruto,
      deducciones: e.deducciones,
      neto: e.total_pagar,
      trabajos: e.jobs?.length || 0,
      liquidado: e.liquidado,
      earnings: e,
    };
  }), [summary, usuarios]);

  const totales = useMemo(() => filas.reduce((a, f) => ({
    bruto: a.bruto + f.devengado,
    deducciones: a.deducciones + f.deducciones,
    neto: a.neto + f.neto,
    pendientes: a.pendientes + (f.liquidado ? 0 : 1),
  }), { bruto: 0, deducciones: 0, neto: 0, pendientes: 0 }), [filas]);

  /** Liquidaciones agrupadas por período: la historia real de la nómina. */
  const periodosCerrados = useMemo(() => {
    const grupos = new Map<string, { inicio: string; fin: string; bruto: number; deducciones: number; neto: number; recibos: number; anulados: number; fecha: string }>();
    ledgers.forEach(l => {
      const clave = `${l.periodo_inicio}|${l.periodo_fin}`;
      const g = grupos.get(clave) || { inicio: l.periodo_inicio, fin: l.periodo_fin, bruto: 0, deducciones: 0, neto: 0, recibos: 0, anulados: 0, fecha: '' };
      const anulado = l.estado === 'anulado';
      if (!anulado) {
        g.bruto += l.bruto || 0;
        g.deducciones += l.deducciones || 0;
        g.neto += l.total_pagar || 0;
        g.recibos += 1;
      } else {
        g.anulados += 1;
      }
      const cuando = (l as PayrollLedger & { created_at?: string }).created_at || l.periodo_fin;
      if (cuando > g.fecha) g.fecha = cuando;
      grupos.set(clave, g);
    });
    return Array.from(grupos.values()).sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [ledgers]);

  const series = useMemo(() => {
    const ultimos = periodosCerrados.slice(-12);
    return {
      empleados: ultimos.map(p => p.recibos),
      bruto: ultimos.map(p => p.bruto),
      deducciones: ultimos.map(p => p.deducciones),
      neto: ultimos.map(p => p.neto),
    };
  }, [periodosCerrados]);

  /** Período cerrado más reciente que no sea el que se está viendo. */
  const anterior = useMemo(
    () => [...periodosCerrados].reverse().find(p => p.inicio !== range.inicio),
    [periodosCerrados, range.inicio],
  );

  const variacionBruto = anterior && anterior.bruto > 0
    ? Math.round(((totales.bruto - anterior.bruto) / anterior.bruto) * 100)
    : null;
  const variacionEmpleados = anterior ? filas.length - anterior.recibos : null;

  const ultimas: NominaCerrada[] = useMemo(
    () => [...periodosCerrados].reverse().slice(0, 3).map(p => ({
      clave: `${p.inicio}|${p.fin}`,
      titulo: etiquetaPeriodo(p.inicio.slice(8) === '01' && p.fin === monthEnd(new Date(p.fin + 'T00:00:00')) ? 'mes' : 'rango', p),
      monto: p.neto,
      fecha: fechaCorta(p.fecha.slice(0, 10)),
      recibos: p.recibos,
      anulada: p.recibos === 0 && p.anulados > 0,
    })),
    [periodosCerrados],
  );

  const periodoLabel = etiquetaPeriodo(preset, range);

  // ── Acciones ────────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const cab = ['Empleado', 'Cedula', 'Cargo', 'Departamento', 'Sueldo base USD', 'Comisiones USD', 'Override USD', 'Devengado USD', 'Deducciones USD', 'Neto USD', 'Trabajos', 'Estado'];
    const filasCsv = filas.map(f => [
      f.nombre, f.cedula, f.cargo, f.departamento,
      f.sueldoBase.toFixed(2), f.comisiones.toFixed(2), f.overrides.toFixed(2),
      f.devengado.toFixed(2), f.deducciones.toFixed(2), f.neto.toFixed(2),
      String(f.trabajos), f.liquidado ? 'Liquidado' : 'Pendiente',
    ]);
    const escapa = (v: string) => `"${v.replace(/"/g, '""')}"`;
    // BOM para que Excel abra los acentos bien.
    const csv = '﻿' + [cab, ...filasCsv].map(r => r.map(escapa).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomina_${range.inicio}_${range.fin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Relación de pago de una persona: la hoja con todos sus trabajos. */
  const descargarHoja = (f: FilaEmpleado) => {
    const e = f.earnings;
    const u = usuarios[f.id] || {};
    generateRelacionPagoPDF({
      empleado_nombre: e.empleado_nombre,
      cedula: u.cedula, alias: u.alias, cargo: f.cargo, area: u.area, rol: e.rol,
      periodo_inicio: range.inicio, periodo_fin: range.fin,
      sede_nombre: currentSede?.nombre,
      sueldo_base: e.sueldo_base, total_comisiones: e.total_comisiones,
      total_overrides: e.total_overrides, total_flat: e.total_flat,
      bruto: e.bruto, deducciones: e.deducciones, total_pagar: e.total_pagar,
      trabajos: (e.jobs || []).map(j => ({
        fecha: j.fecha, zona: j.zona, tipo_trabajo: j.tipo_trabajo, descripcion: j.descripcion,
        ingreso_total: j.ingreso_total, ingreso_usd: (j as { ingreso_usd?: number }).ingreso_usd,
        mano_obra_usd: (j as { mano_obra_usd?: number }).mano_obra_usd,
        comision_usd: j.comision_usd, es_override: j.es_override, moneda: j.moneda,
        desglose: (j as { desglose?: Record<string, unknown> }).desglose as never,
      })),
      adelantos: (e.adelantos || []).map(a => ({
        fecha: a.fecha, motivo: a.motivo, monto_usd: a.monto_usd,
      })),
      tasa_bs: moneda === 'ves' ? tasa : null,
      borrador: !e.liquidado,
    });
  };

  /** La hoja que se firma para pagar: una fila por persona y el total. */
  const descargarNomina = () => {
    if (filas.length === 0) { alert('No hay nómina que imprimir en este período.'); return; }
    generateNominaConsolidadaPDF({
      filas: filas.map(f => ({
        empleado_nombre: f.nombre,
        cedula: f.cedula || usuarios[f.id]?.cedula || null,
        cargo: f.cargo,
        trabajos: f.trabajos,
        sueldo_base: f.sueldoBase,
        comisiones: f.comisiones,
        overrides: f.overrides,
        bruto: f.devengado,
        deducciones: f.deducciones,
        total_pagar: f.neto,
      })),
      periodo_inicio: range.inicio,
      periodo_fin: range.fin,
      sede_nombre: currentSede?.nombre,
      tasa_bs: moneda === 'ves' ? tasa : null,
      borrador: totales.pendientes > 0,
    });
  };

  const onAccionRapida = (a: AccionRapida) => {
    if (a === 'nuevo-empleado') router.push('/dashboard/ajustes/empleados');
    else if (a === 'ajuste-salarial') setTab('conceptos');
    else if (a === 'registrar-trabajo') setRegistrarOpen(true);
    else if (a === 'generar-recibos') descargarNomina();
    else if (a === 'exportar') exportarCSV();
    else setTab('configuracion');
  };

  if (!mounted) return null;

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'resumen', label: esTecnico ? 'Mi resumen' : 'Resumen', show: true },
    { key: 'empleados', label: 'Empleados', show: !esTecnico },
    { key: 'trabajos', label: 'Trabajos', show: true },
    { key: 'conceptos', label: 'Conceptos', show: canEdit },
    { key: 'deducciones', label: 'Deducciones', show: canLiquidar },
    { key: 'reportes', label: 'Reportes', show: true },
    { key: 'ia', label: 'Sin asignar', show: canEdit },
    { key: 'configuracion', label: 'Configuración', show: canEdit },
  ];

  const tasaLista = moneda === 'usd' || tasa > 0;

  return (
    <ErpShell buscador="Buscar empleados, cédula, cargo..." lema={['Nuestro equipo', 'hace que todo', 'avance']}>
      {/* Encabezado y pestañas */}
      <div className="mb-3.5 rounded-xl border border-[#e8eaed] bg-white px-5 pt-4">
        <header className="flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
            <NominaIcon className="h-[24px] w-[24px]" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#16181d]">Nómina</h1>
            <p className="text-[13px] text-[#8a909c]">
              Gestiona sueldos, comisiones, deducciones y pagos de todo el equipo
              {currentSede?.nombre ? ` · ${currentSede.nombre}` : ''}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Moneda: el motor calcula en dólares; los bolívares son conversión. */}
            <div className="flex h-[44px] items-center rounded-lg border border-[#e2e5ea] p-1">
              {(['usd', 'ves'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  aria-pressed={moneda === m}
                  className={cn(
                    'h-[34px] rounded-md px-2.5 text-[12px] font-semibold transition-colors',
                    moneda === m ? 'bg-[#fff4ec] text-[#f97316]' : 'text-[#8a909c] hover:text-[#16181d]',
                  )}
                >
                  {m === 'usd' ? 'USD' : 'Bs.'}
                </button>
              ))}
            </div>

            <div className="relative flex h-[44px] items-center gap-2 rounded-lg border border-[#e2e5ea] py-1 pl-1 pr-1">
              <button
                onClick={() => setMenuPeriodo(v => !v)}
                aria-expanded={menuPeriodo}
                className="flex h-[34px] items-center gap-2 rounded-md px-2.5 hover:bg-[#f6f7f9]"
              >
                <Calendar className="h-[17px] w-[17px] text-[#5b616e]" aria-hidden />
                <span className="num text-[13px] font-medium text-[#16181d]">{periodoLabel}</span>
              </button>
              <button
                onClick={() => setRange(r => correrPeriodo(preset, r, -1))}
                aria-label="Período anterior"
                className="flex h-[34px] w-[30px] items-center justify-center rounded-md border-l border-[#eef0f3] text-[#5b616e] hover:bg-[#f6f7f9]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>

              {menuPeriodo && (
                <div className="absolute right-0 top-[50px] z-30 w-[240px] rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                  {PRESETS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => onPreset(p.key)}
                      className={cn(
                        'block w-full px-3 py-2 text-left text-[12.5px] hover:bg-[#f6f7f9]',
                        preset === p.key ? 'font-semibold text-[#f97316]' : 'text-[#3d4350]',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  {preset === 'custom' && (
                    <div className="flex items-center gap-1.5 border-t border-[#f2f3f5] px-3 py-2">
                      <input type="date" value={range.inicio} onChange={e => setRange(r => ({ ...r, inicio: e.target.value }))}
                        className="num h-8 w-full rounded-md border border-[#e2e5ea] px-1.5 text-[11.5px]" />
                      <span className="text-[#9ba1ab]">→</span>
                      <input type="date" value={range.fin} onChange={e => setRange(r => ({ ...r, fin: e.target.value }))}
                        className="num h-8 w-full rounded-md border border-[#e2e5ea] px-1.5 text-[11.5px]" />
                    </div>
                  )}
                  <p className="num border-t border-[#f2f3f5] px-3 py-2 text-[10.5px] text-[#9ba1ab]">
                    {range.inicio} → {range.fin}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setRange(r => correrPeriodo(preset, r, 1))}
              aria-label="Período siguiente"
              className="flex h-[44px] w-[38px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>

            <button
              onClick={() => loadSummary(true)}
              disabled={refreshing}
              aria-label="Recalcular"
              className="flex h-[44px] w-[38px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9] disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden />
            </button>

            <button
              onClick={() => setProcesarOpen(true)}
              disabled={!canLiquidar || totales.pendientes === 0}
              title={!canLiquidar ? 'Solo administración o supervisión pueden liquidar' : undefined}
              className="flex h-[44px] items-center gap-1.5 rounded-lg bg-[#f97316] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[#f97316]"
            >
              <Plus className="h-[17px] w-[17px]" aria-hidden />
              Procesar nómina
            </button>
          </div>
        </header>

        <div className="-mx-5 mt-3.5 overflow-x-auto border-t border-[#eef0f3] px-5" role="tablist">
          <div className="flex min-w-max gap-6">
            {tabs.filter(t => t.show).map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'relative py-2.5 text-[13px] transition-colors',
                  tab === t.key ? 'font-semibold text-[#f97316]' : 'text-[#8a909c] hover:text-[#16181d]',
                )}
              >
                {t.label}
                {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#f97316]" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'resumen' && (
        esTecnico ? (
          <div className="rounded-xl border border-[#e8eaed] bg-white p-4">
            <MiResumen earnings={summary[0]} />
          </div>
        ) : !tasaLista ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#f97316]" /></div>
        ) : (
          <>
            {/* Lo que haría pagar de más o de menos, antes de liquidar. */}
            {canEdit && (
              <RevisionNomina range={range} sedeId={sedeId} onReconciliar={() => setTab('configuracion')} />
            )}
            <NominaKpis
              empleados={filas.length}
              bruto={totales.bruto}
              deducciones={totales.deducciones}
              neto={totales.neto}
              pendientes={totales.pendientes}
              variacionBruto={variacionBruto}
              variacionEmpleados={variacionEmpleados}
              series={series}
              moneda={moneda}
              tasa={tasa}
            />

            <div className="flex flex-col gap-3.5 lg:flex-row">
              <EmpleadosPanel
                filas={filas}
                moneda={moneda}
                tasa={tasa}
                cargando={loading}
                canLiquidar={canLiquidar}
                onDetalle={setDetalle}
                onLiquidar={f => setLiquidarTarget(f.earnings)}
                onRecibo={descargarHoja}
                onNuevoEmpleado={() => router.push('/dashboard/ajustes/empleados')}
                onExportar={exportarCSV}
                onImportar={() => router.push('/dashboard/ajustes/empleados')}
              />
              <NominaRail
                periodoLabel={periodoLabel}
                empleados={filas.length}
                pendientes={totales.pendientes}
                deducciones={totales.deducciones}
                ultimas={ultimas}
                canLiquidar={canLiquidar}
                procesando={procesarOpen}
                moneda={moneda}
                tasa={tasa}
                onIniciarProceso={() => setProcesarOpen(true)}
                onAccion={onAccionRapida}
                onVerTodas={() => setTab('reportes')}
              />
            </div>
          </>
        )
      )}

      {tab === 'empleados' && !esTecnico && (
        <PlantillaTab usuarios={usuarios} filas={filas} moneda={moneda} tasa={tasa} onIrAEmpleados={() => router.push('/dashboard/ajustes/empleados')} />
      )}
      {tab === 'trabajos' && <TrabajosTab range={range} sedeId={sedeId} canEdit={canEdit} canLiquidar={canLiquidar} esTecnico={esTecnico} userId={user?.id} />}
      {tab === 'conceptos' && canEdit && (
        <PanelReglas
          sedeId={sedeId}
          personas={Object.entries(usuarios).map(([id, u]) => ({
            id,
            nombre: filas.find(f => f.id === id)?.nombre || u.cargo || 'Empleado',
            cargo: u.cargo || (u.especialidad ? zonaLabel(u.especialidad) : null),
            foto_url: u.foto_url,
            cedula: u.cedula,
          }))}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onAbrirPlantillas={() => setSeedOpen(true)}
        />
      )}
      {tab === 'deducciones' && canLiquidar && <AdelantosTab sedeId={sedeId} onChange={() => loadSummary(true)} />}
      {tab === 'reportes' && <HistorialTab sedeId={sedeId} isAdmin={isAdmin} />}
      {tab === 'ia' && canEdit && (
        <DetectarTrabajos range={range} sedeId={sedeId} onListo={() => { loadSummary(true); loadLedgers(); }} />
      )}
      {tab === 'configuracion' && canEdit && (
        <ConfiguracionTab
          sedeId={sedeId}
          onReconciliado={() => loadSummary(true)}
          range={range}
          periodoLabel={periodoLabel}
          sedeNombre={currentSede?.nombre}
          isAdmin={isAdmin}
          onSembrar={() => setSeedOpen(true)}
        />
      )}

      {liquidarTarget && (
        <LiquidarModal target={liquidarTarget} range={range} sedeId={sedeId} sedeNombre={currentSede?.nombre}
          onClose={() => setLiquidarTarget(null)} onDone={() => { setLiquidarTarget(null); loadSummary(true); loadLedgers(); }} />
      )}
      {registrarOpen && (
        <RegistrarTrabajoModal sedeId={sedeId} onClose={() => setRegistrarOpen(false)}
          onDone={() => { setRegistrarOpen(false); loadSummary(true); }} />
      )}
      {detalle && (
        <DetalleEmpleado
          empleadoId={detalle.id}
          sedeId={sedeId}
          range={range}
          periodoLabel={periodoLabel}
          onClose={() => setDetalle(null)}
          onHoja={() => descargarHoja(detalle)}
          onLiquidar={e => { setDetalle(null); setLiquidarTarget(e); }}
        />
      )}
      {seedOpen && (
        <SeedModal sedeId={sedeId} onClose={() => setSeedOpen(false)}
          onDone={() => { setSeedOpen(false); loadSummary(true); loadUsuarios(); }} />
      )}
      {procesarOpen && (
        <ProcesarNominaModal
          filas={filas}
          range={range}
          sedeId={sedeId}
          sedeNombre={currentSede?.nombre}
          periodoLabel={periodoLabel}
          moneda={moneda}
          tasa={tasa}
          onCerrar={() => setProcesarOpen(false)}
          onTerminado={() => { loadSummary(true); loadLedgers(); }}
        />
      )}
    </ErpShell>
  );
}

// ════════════════════ PLANTILLA (personal registrado) ════════════════════
function PlantillaTab({ usuarios, filas, moneda, tasa, onIrAEmpleados }: {
  usuarios: Record<string, UsuarioMeta>;
  filas: FilaEmpleado[];
  moneda: Moneda;
  tasa: number;
  onIrAEmpleados: () => void;
}) {
  const porId = new Map(filas.map(f => [f.id, f]));
  const gente = Object.entries(usuarios);

  return (
    <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#16181d]">Plantilla</h2>
          <p className="text-[12.5px] text-[#8a909c]">
            Personal registrado en esta sede. El alta, la baja y los permisos se manejan en Empleados.
          </p>
        </div>
        <button
          onClick={onIrAEmpleados}
          className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Gestionar empleados
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
              {['Empleado', 'Cédula', 'Cargo', 'Especialidad', 'Neto del período'].map(h => (
                <th key={h} scope="col" className="px-4 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gente.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-[13px] text-[#8a909c]">Sin personal registrado en esta sede.</td></tr>
            )}
            {gente.map(([id, u]) => {
              const f = porId.get(id);
              return (
                <tr key={id} className="border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {u.foto_url
                        ? <img src={u.foto_url} alt="" className="h-[32px] w-[32px] rounded-full object-cover" />
                        : <span className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-[#eef1f5] text-[11px] font-semibold text-[#9ba1ab]" aria-hidden>{iniciales(f?.nombre || '?')}</span>}
                      <span className="text-[12.5px] font-semibold text-[#16181d]">{f?.nombre || '—'}</span>
                    </div>
                  </td>
                  <td className="num px-4 py-2.5 text-[12px] text-[#5b616e]">{u.cedula || '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-[#3d4350]">{getRoleMeta(u.rol || '')?.label || u.rol || '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-[#3d4350]">{u.especialidad ? zonaLabel(u.especialidad) : '—'}</td>
                  <td className="num px-4 py-2.5 text-[12px] font-semibold text-[#16181d]">
                    {f ? formatoMonto(f.neto, moneda, tasa) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ════════════════════ CONFIGURACIÓN ════════════════════
function ConfiguracionTab({
  range, periodoLabel, sedeNombre, isAdmin, onSembrar, sedeId, onReconciliado,
}: {
  range: { inicio: string; fin: string };
  periodoLabel: string;
  sedeNombre?: string;
  isAdmin: boolean;
  onSembrar: () => void;
  sedeId: string | null;
  onReconciliado: () => void;
}) {
  const [rates, setRates] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch('/api/nomina/rates')
      .then(r => r.json())
      .then(setRates)
      .catch(() => setRates(null))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="space-y-3.5">
    {isAdmin && <ReconciliarEncargados sedeId={sedeId} onListo={onReconciliado} />}
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <section className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <h2 className="text-[15px] font-bold text-[#16181d]">Período activo</h2>
        <dl className="mt-3 space-y-2 text-[12.5px]">
          <div className="flex justify-between gap-3"><dt className="text-[#8a909c]">Rango</dt><dd className="num font-semibold text-[#16181d]">{periodoLabel}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#8a909c]">Fechas</dt><dd className="num font-semibold text-[#16181d]">{range.inicio} → {range.fin}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#8a909c]">Sede</dt><dd className="font-semibold text-[#16181d]">{sedeNombre || 'Todas'}</dd></div>
        </dl>
        <p className="mt-3 text-[11.5px] leading-snug text-[#9ba1ab]">
          El cálculo es en dólares y se convierte a bolívares solo para mostrar.
          Los recibos se emiten con el monto en dólares.
        </p>
      </section>

      <section className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <h2 className="text-[15px] font-bold text-[#16181d]">Tasas en vivo</h2>
        {cargando ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#f97316]" /></div>
        ) : rates ? (
          <dl className="mt-3 space-y-2 text-[12.5px]">
            {Object.entries(flattenRates(rates)).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-[#8a909c]">{k}</dt>
                <dd className="num font-semibold text-[#16181d]">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-[12.5px] text-[#8a909c]">No se pudieron consultar las tasas.</p>
        )}
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-[#e8eaed] bg-white p-5 lg:col-span-2">
          <h2 className="text-[15px] font-bold text-[#16181d]">Reglas base</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-[#8a909c]">
            Vuelve a cargar las reglas de comisión del taller (porcentajes por técnico,
            tarifas y cédulas) desde las plantillas. No borra los trabajos ya registrados.
          </p>
          <button
            onClick={onSembrar}
            className="mt-3 flex h-[38px] items-center gap-2 rounded-lg border border-[#e2e5ea] px-3.5 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Cargar plantillas de reglas
          </button>
        </section>
      )}
    </div>
    </div>
  );
}

/** Aplana la respuesta de tasas para listarla sin asumir su forma exacta. */
function flattenRates(r: any, prefijo = ''): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(r || {}).forEach(([k, v]) => {
    const clave = prefijo ? `${prefijo} · ${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flattenRates(v, clave));
    else if (typeof v === 'number') out[clave] = v.toLocaleString('de-DE', { maximumFractionDigits: 4 });
    else if (typeof v === 'string') out[clave] = v;
  });
  return out;
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
  const [asignaciones, setAsignaciones] = useState<AsignacionEmpleado[]>([]);
  const [moneda, setMoneda] = useState('USD');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const guardar = async () => {
    setSaving(true); setErr('');
    try {
      const validas = asignacionesValidas(asignaciones);
      if (validas.length === 0) throw new Error('Indica quién hizo el trabajo o marca que lo hizo el taller.');
      if (!descripcion.trim()) throw new Error('Escribe qué trabajo fue: de ese texto sale el porcentaje que aplica.');

      const jobs = validas.flatMap(a => buildJobsDesdeAsignacion(a, {
        items: [],
        costoTotal: Number(monto) || 0,
        tipoTrabajo: descripcion.trim(),
        descripcionBase: descripcion.trim(),
        referenciaTabla: 'manual',
        referenciaId: null,
        fecha: getLocalISODate(),
      })).map(j => ({ ...j, moneda }));

      const r = await fetch('/api/nomina/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs, sede: sedeId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error al registrar');
    } finally { setSaving(false); }
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
            <label className="text-xs text-slate-500">Monto del trabajo</label>
            <input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00"
              className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">¿Qué trabajo fue?</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Instalación de silenciador · Rotación de cauchos"
            className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm mt-1" />
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            De este texto sale el porcentaje: no es lo mismo una reparación que una rotación.
          </p>
        </div>
        <PersonalYComisiones
          value={asignaciones}
          onChange={setAsignaciones}
          sedeId={sedeId}
          defaultZona={categoriaToZona(inferirCategoria(descripcion))}
          costoTotal={Number(monto) || 0}
          tipoTrabajo={descripcion || null}
          descripcionTrabajo={descripcion || null}
        />
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- guarda de hidratación del portal
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#16181d]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[#5b616e] transition-colors hover:bg-[#f4f5f7]"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
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
      <div className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
            <Bot className="h-[21px] w-[21px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#16181d]">Rescatar trabajos sin registrar</h3>
            <p className="num mt-0.5 text-[12.5px] leading-snug text-[#8a909c]">
              Revisa las ventas y servicios del {range.inicio} al {range.fin} en busca de trabajos que se
              cobraron pero a los que nunca se les asignó técnico, y propone quién los hizo, de qué tipo
              fueron y cuánta mano de obra llevaron. <strong className="text-[#3d4350]">Nada se guarda hasta
              que revises y confirmes.</strong>
            </p>
            <button
              onClick={analizar}
              disabled={analyzing || saving}
              className="mt-3 flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando el período…</>
                : <>Revisar el período</>}
            </button>
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
