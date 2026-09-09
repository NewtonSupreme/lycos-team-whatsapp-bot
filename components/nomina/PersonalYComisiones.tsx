'use client';
/**
 * PERSONAL A CARGO Y COMISIONES — sección unificada de la Orden de Servicio.
 *
 * Selecciona EMPLEADOS REGISTRADOS (con id) y calcula EN VIVO la comisión de cada
 * uno aplicando sus reglas de nómina, igual que las relaciones de pago manuales:
 * CADA SERVICIO del desglose se evalúa POR SEPARADO con su propio porcentaje
 * (ej. cauchera: 30% reparación, 40% rotación/revisión, 100% adicional;
 *  Rafael: 25% alineación, 40% revisión/reemplazo; Freddy: 50% por trabajo;
 *  Jim: +7% de supervisión en cascada).
 *
 * Si la regla del empleado está "Por definir" (latonería por presupuesto, casos
 * especiales), se pide la COMISIÓN MANUAL, que prevalece sobre el cálculo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Wrench, Building2, Loader2, Users, Search, TrendingUp, AlertTriangle, Check, PencilLine,
} from 'lucide-react';
import { ZONAS_TRABAJO } from '@/types';

export interface ItemDesglose {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

export interface AsignacionEmpleado {
  empleado_id: string | null;
  es_taller: boolean;
  nombre: string;
  rol: string;
  zona: string;
  /** Índices de los ítems del desglose asignados a este empleado. */
  item_idx: number[];
  /** Mano de obra manual (se usa si no hay ítems asignados). */
  mano_obra_manual: number;
  servicio_key?: string | null;
  cantidad?: number;
  /** Comisión fijada a mano (USD). Prevalece sobre la regla automática. */
  comision_manual?: number | null;
}

interface Tecnico {
  id: string; nombre: string; rol: string; sede_id: string | null;
  especialidad?: string | null; cargo?: string | null; es_tecnico?: boolean;
}

/** Comisión que otra persona cobra por supervisar este trabajo. */
export interface OverridePreview {
  empleado_id: string | null;
  empleado_nombre: string;
  comision_usd: number;
  descripcion?: string | null;
  /** Porcentaje de supervisión aplicado. */
  pct?: number | null;
}

/** Lo que devuelve el motor al simular un trabajo, sin guardar nada. */
export interface FilaPreview {
  ref?: string | null;
  empleado_id: string | null;
  zona: string;
  descripcion?: string | null;
  mano_obra: number;
  ingreso_total: number;
  comision_usd: number;
  tipo_regla: string | null;
  regla_descripcion: string | null;
  pct: number | null;
  proveedor_monto_usd: number;
  proveedor_nombre: string | null;
  sin_regla: boolean;
  por_definir: boolean;
  overrides: OverridePreview[];
}

/** Un trabajo tal como se manda a simular. */
interface JobPreview {
  ref: string;
  empleado_id: string | null;
  es_taller: boolean;
  zona: string;
  servicio_key: string | null;
  cantidad: number;
  moneda: string;
  tipo_trabajo: string | null;
  descripcion: string;
  ingreso_total: number;
  mano_obra: number;
}

interface Props {
  value: AsignacionEmpleado[];
  onChange: (v: AsignacionEmpleado[]) => void;
  sedeId?: string | null;
  defaultZona?: string;
  items?: ItemDesglose[];
  costoTotal?: number;
  /** Tipo de servicio de la orden. Sin esto las reglas por tipo no distinguen. */
  tipoTrabajo?: string | null;
  /** Descripción de la orden, como respaldo cuando el renglón no dice nada. */
  descripcionTrabajo?: string | null;
}

const ESCAPE_SERVICIOS = [
  { key: 'silenciador', label: 'Silenciador' },
  { key: 'resonador', label: 'Resonador' },
  { key: 'flexible', label: 'Flexible' },
  { key: 'gomas', label: 'Gomas' },
  { key: 'soldadura', label: 'Soldadura' },
  { key: 'extra', label: 'Extra' },
  { key: 'revision', label: 'Revisión' },
];

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;

/**
 * Zona con la que entra una asignación nueva.
 *
 * Manda la del TRABAJO, no la del técnico. Antes ganaba la especialidad de la
 * persona, así que asignar a Freddy —silenciadores— una alineación mandaba el
 * trabajo a la zona 'escape' y le aplicaba su 50 % a un servicio que no era
 * suyo. La especialidad solo se usa si la orden no está clasificada.
 */
function zonaDeAsignacion(t: Tecnico | null, zonaDelTrabajo: string): string {
  if (zonaDelTrabajo && zonaDelTrabajo !== 'general') return zonaDelTrabajo;
  const e = t?.especialidad || '';
  if (!e) return zonaDelTrabajo || 'general';
  if (e === 'lavado') return 'autolavado';
  return e;
}

export default function PersonalYComisiones({
  value, onChange, sedeId, defaultZona = 'mecanica', items = [], costoTotal = 0,
  tipoTrabajo = null, descripcionTrabajo = null,
}: Props) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [abrirBuscador, setAbrirBuscador] = useState(false);
  const [preview, setPreview] = useState<FilaPreview[]>([]);
  const [calculando, setCalculando] = useState(false);

  const itemsValidos = useMemo(
    () => items.filter(i => i.descripcion?.trim() && Number(i.total) > 0),
    [items]
  );

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    // Todo el personal activo: el de almacén o atención al cliente también
    // puede quedar a cargo de un trabajo, y antes no aparecían.
    fetch(`/api/nomina/technicians${sedeId ? `?sede=${sedeId}` : ''}`)
      .then(r => r.json())
      .then(d => {
        if (!vivo) return;
        const lista: Tecnico[] = d.technicians || [];
        // El personal de taller primero: es quien se asigna casi siempre.
        lista.sort((a, b) =>
          Number(!!b.es_tecnico) - Number(!!a.es_tecnico) || a.nombre.localeCompare(b.nombre));
        setTecnicos(lista);
      })
      .catch(() => {})
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [sedeId]);

  const manoObraDe = useCallback((a: AsignacionEmpleado): number => {
    if (a.item_idx.length > 0) {
      return a.item_idx.reduce((s, idx) => s + (Number(items[idx]?.total) || 0), 0);
    }
    return Number(a.mano_obra_manual) || 0;
  }, [items]);

  /**
   * Jobs de preview: UNO POR ÍTEM asignado (así cada servicio recibe su propio %,
   * exactamente como las hojas de pago manuales). ref = `${asignación}:${ítem}`.
   */
  const buildPreviewJobs = useCallback(() => {
    const jobs: JobPreview[] = [];
    value.forEach((a, i) => {
      if (!a.empleado_id && !a.es_taller) return;
      const base = {
        empleado_id: a.empleado_id,
        es_taller: a.es_taller,
        zona: a.zona,
        servicio_key: a.servicio_key || null,
        cantidad: a.cantidad || 1,
        moneda: 'USD',
        // Sin esto las reglas por tipo de servicio nunca coinciden: el motor
        // evalúa contra servicio_key + tipo_trabajo + descripción, y la
        // simulación mostraba un porcentaje distinto al que se iba a guardar.
        tipo_trabajo: tipoTrabajo,
      };
      if (a.item_idx.length > 0) {
        for (const idx of a.item_idx) {
          const it = items[idx];
          if (!it) continue;
          jobs.push({
            ...base,
            ref: `${i}:${idx}`,
            descripcion: it.descripcion,
            ingreso_total: Number(it.total) || 0,
            mano_obra: Number(it.total) || 0,
          });
        }
      } else {
        const mo = Number(a.mano_obra_manual) || 0;
        jobs.push({
          ...base,
          ref: `${i}:m`,
          // Sin renglones asignados se usa la descripción de la orden: es lo
          // único que puede decirle a la regla si fue una rotación o una
          // reparación, y de eso depende el porcentaje.
          descripcion: descripcionTrabajo || '',
          ingreso_total: mo || costoTotal,
          mano_obra: mo,
        });
      }
    });
    return jobs;
  }, [value, items, costoTotal, tipoTrabajo, descripcionTrabajo]);

  const asignacionesKey = JSON.stringify(
    value.map(a => [a.empleado_id, a.es_taller, a.zona, a.item_idx, a.mano_obra_manual, a.servicio_key, a.cantidad])
  ) + JSON.stringify(itemsValidos.map(i => [i.descripcion, i.total])) + `|${tipoTrabajo}|${descripcionTrabajo}`;

  useEffect(() => {
    const jobs = buildPreviewJobs();
    if (jobs.length === 0) { setPreview([]); return; }

    let vivo = true;
    setCalculando(true);
    const t = setTimeout(() => {
      fetch('/api/nomina/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sede: sedeId, jobs }),
      })
        .then(r => r.json())
        .then(d => { if (vivo) setPreview(d.preview || []); })
        .catch(() => {})
        .finally(() => vivo && setCalculando(false));
    }, 350);

    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignacionesKey, sedeId, costoTotal]);

  /**
   * Al reclasificar la orden, las asignaciones siguen a la nueva zona.
   *
   * Solo se mueven las que quedaron con la zona anterior: si alguien la cambió
   * a mano, se respeta. Sin esto la comisión se calculaba con la clasificación
   * vieja y nadie se enteraba.
   */
  const zonaPrevia = useRef(defaultZona);
  useEffect(() => {
    const antes = zonaPrevia.current;
    zonaPrevia.current = defaultZona;
    if (antes === defaultZona || value.length === 0) return;
    const siguen = value.some(a => a.zona === antes);
    if (siguen) onChange(value.map(a => (a.zona === antes ? { ...a, zona: defaultZona } : a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultZona]);

  /** Filas del preview que pertenecen a la asignación i. */
  const previewDe = (i: number) => preview.filter(p => String(p.ref || '').startsWith(`${i}:`));

  // ── Mutaciones ────────────────────────────────────────────────────────────
  const agregar = (t: Tecnico | null) => {
    const nueva: AsignacionEmpleado = t
      ? { empleado_id: t.id, es_taller: false, nombre: t.nombre, rol: t.rol, zona: zonaDeAsignacion(t, defaultZona), item_idx: [], mano_obra_manual: 0, comision_manual: null }
      : { empleado_id: null, es_taller: true, nombre: 'Taller (sin técnico)', rol: 'taller', zona: defaultZona, item_idx: [], mano_obra_manual: 0, comision_manual: null };
    onChange([...value, nueva]);
    setBuscar('');
    setAbrirBuscador(false);
  };

  const actualizar = (i: number, patch: Partial<AsignacionEmpleado>) =>
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const quitar = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const toggleItem = (i: number, itemIdx: number) => {
    const a = value[i];
    const ya = a.item_idx.includes(itemIdx);
    actualizar(i, { item_idx: ya ? a.item_idx.filter(x => x !== itemIdx) : [...a.item_idx, itemIdx] });
  };

  const itemTomadoPor = (itemIdx: number, exceptoI: number): string | null => {
    const i = value.findIndex((a, idx) => idx !== exceptoI && a.item_idx.includes(itemIdx));
    return i >= 0 ? value[i].nombre : null;
  };

  const disponibles = tecnicos.filter(
    t => !value.some(a => a.empleado_id === t.id) &&
      t.nombre.toLowerCase().includes(buscar.toLowerCase())
  );

  /** Comisión efectiva de la asignación i (manual si está fijada; si no, la automática). */
  const comisionDe = (i: number): number => {
    const a = value[i];
    if (a.comision_manual != null && a.comision_manual > 0) return Number(a.comision_manual);
    return previewDe(i).reduce((s, p) => s + (Number(p.comision_usd) || 0), 0);
  };

  const totalComisiones = value.reduce((s, _, i) => s + comisionDe(i), 0)
    + preview.reduce((s, p) => s + (p.overrides || []).reduce((so, o) => so + (Number(o.comision_usd) || 0), 0), 0);
  const totalProveedor = preview.reduce((s, p) => s + (Number(p.proveedor_monto_usd) || 0), 0);
  const lycosNeto = costoTotal - totalComisiones - totalProveedor;

  return (
    <div className="space-y-3">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-primary" />
          Personal a cargo <span className="text-red-400">*</span>
        </label>
        {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Buscador de personal */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Buscar mecánico, jefe de taller…"
            value={buscar}
            onChange={e => { setBuscar(e.target.value); setAbrirBuscador(true); }}
            onFocus={() => setAbrirBuscador(true)}
            onBlur={() => setTimeout(() => setAbrirBuscador(false), 200)}
          />
          {abrirBuscador && disponibles.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-[160] mt-1 bg-popover border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto py-1">
              {disponibles.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => agregar(t)}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{t.nombre}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {(t.especialidad || t.rol).replace(/_/g, ' ')}
                    </p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => agregar(null)}
          disabled={value.some(a => a.es_taller)}
          className="px-3 py-2 rounded-xl border border-border bg-muted/40 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all flex items-center gap-1.5 disabled:opacity-40 shrink-0"
        >
          <Building2 className="w-3.5 h-3.5" /> Lo hizo el taller
        </button>
      </div>

      {value.length === 0 && (
        <p className="text-[11px] text-amber-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Selecciona quién hizo el trabajo, o marca “Lo hizo el taller”.
        </p>
      )}

      {/* Tarjetas por empleado */}
      <div className="space-y-2">
        {value.map((a, i) => {
          const filas = previewDe(i);
          const mo = manoObraDe(a);
          const esEscape = a.zona === 'escape';
          const autoTotal = filas.reduce((s, p) => s + (Number(p.comision_usd) || 0), 0);
          const hayPorDefinir = filas.some(p => p.por_definir);
          const sinRegla = filas.length > 0 && filas.every(p => p.sin_regla);
          const manualActiva = a.comision_manual != null && a.comision_manual > 0;
          const overridesAsign = filas.flatMap(p => p.overrides || []);

          return (
            <div key={i} className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2.5">
              {/* Fila 1: quién + zona + quitar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {a.es_taller
                    ? <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <Wrench className="w-4 h-4 text-amber-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">{a.nombre}</p>
                    {!a.es_taller && (
                      <p className="text-[10px] text-muted-foreground uppercase">{a.rol.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                </div>

                <select
                  value={a.zona}
                  onChange={e => actualizar(i, { zona: e.target.value })}
                  className="h-8 rounded-lg border border-border bg-background/60 px-2 text-xs"
                >
                  {ZONAS_TRABAJO.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
                </select>

                {esEscape && (
                  <select
                    value={a.servicio_key || ''}
                    onChange={e => actualizar(i, { servicio_key: e.target.value || null })}
                    className="h-8 rounded-lg border border-border bg-background/60 px-2 text-xs"
                  >
                    <option value="">Tarifa flat…</option>
                    {ESCAPE_SERVICIOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                )}

                <button type="button" onClick={() => quitar(i)} className="text-muted-foreground hover:text-red-500 p-1 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Fila 2: asignar servicios del desglose */}
              {itemsValidos.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Servicios que ejecutó
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((it, idx) => {
                      if (!it.descripcion?.trim() || Number(it.total) <= 0) return null;
                      const activo = a.item_idx.includes(idx);
                      const tomado = itemTomadoPor(idx, i);
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={!!tomado && !activo}
                          onClick={() => toggleItem(i, idx)}
                          title={tomado && !activo ? `Ya asignado a ${tomado}` : undefined}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 ${
                            activo
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                              : tomado
                                ? 'bg-muted/30 border-border text-muted-foreground/40 cursor-not-allowed line-through'
                                : 'bg-background/50 border-border text-muted-foreground hover:border-primary/40'
                          }`}
                        >
                          {activo && <Check className="w-2.5 h-2.5" />}
                          {it.descripcion.slice(0, 26)} · {money(Number(it.total))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fila 3: mano de obra */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Mano de obra</p>
                  {a.item_idx.length > 0 ? (
                    <div className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center text-sm font-black text-emerald-500">
                      {money(mo)}
                      <span className="ml-1.5 text-[9px] font-normal text-muted-foreground">
                        ({a.item_idx.length} servicio{a.item_idx.length > 1 ? 's' : ''})
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <input
                        type="number" step="0.01" placeholder="0.00"
                        value={a.mano_obra_manual || ''}
                        onChange={e => actualizar(i, { mano_obra_manual: parseFloat(e.target.value) || 0 })}
                        className="w-28 h-8 rounded-lg border border-amber-500/30 bg-amber-500/5 pl-6 pr-2 text-sm font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* Comisión total de la asignación */}
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5 flex items-center gap-1">
                    Comisión {calculando && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  </p>
                  {manualActiva ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-black text-blue-500">{money(Number(a.comision_manual))}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-bold">MANUAL</span>
                    </div>
                  ) : sinRegla ? (
                    <p className="text-[11px] text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Sin regla configurada — usa la comisión manual o configúrala en Nómina.
                    </p>
                  ) : hayPorDefinir ? (
                    <p className="text-[11px] text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> <b>Por definir</b> — indica la comisión manual (según presupuesto/acuerdo).
                    </p>
                  ) : filas.length > 0 ? (
                    <span className="text-base font-black text-emerald-500">{money(autoTotal)}</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{mo > 0 ? 'Calculando…' : 'Indica la mano de obra'}</span>
                  )}
                </div>

                {/* Comisión manual */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5 flex items-center gap-1">
                    <PencilLine className="w-2.5 h-2.5" /> Manual
                  </p>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 font-bold">$</span>
                    <input
                      type="number" step="0.01" placeholder="auto"
                      value={a.comision_manual ?? ''}
                      onChange={e => actualizar(i, { comision_manual: e.target.value === '' ? null : (parseFloat(e.target.value) || 0) })}
                      className={`w-24 h-8 rounded-lg border pl-6 pr-2 text-sm font-bold ${
                        manualActiva || hayPorDefinir
                          ? 'border-blue-500/50 bg-blue-500/5 text-blue-600 dark:text-blue-400'
                          : 'border-border bg-background/40 text-muted-foreground'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Desglose por servicio (cada uno con SU porcentaje, como la hoja manual) */}
              {!manualActiva && filas.length > 1 && (
                <div className="rounded-lg bg-background/40 border border-border/50 px-2.5 py-1.5 space-y-0.5">
                  {filas.map((p, fi) => (
                    <div key={fi} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground truncate">
                        {p.descripcion || 'Trabajo'} · {money(Number(p.mano_obra))}
                      </span>
                      <span className="shrink-0 font-bold text-emerald-500">
                        {p.pct != null ? `${p.pct}% → ` : ''}{money(Number(p.comision_usd))}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Regla aplicada (una sola fila) */}
              {!manualActiva && filas.length === 1 && filas[0].regla_descripcion && !filas[0].por_definir && !filas[0].sin_regla && (
                <p className="text-[10px] text-muted-foreground">{filas[0].regla_descripcion}</p>
              )}

              {/* Proveedor (puente) */}
              {filas.some(p => Number(p.proveedor_monto_usd) > 0) && (
                <p className="text-[10px] text-orange-500">
                  Proveedor ({filas.find(p => p.proveedor_nombre)?.proveedor_nombre || 'puente'}):{' '}
                  {money(filas.reduce((s, p) => s + (Number(p.proveedor_monto_usd) || 0), 0))}
                </p>
              )}

              {/* Overrides en cascada (jefe de taller) */}
              {overridesAsign.length > 0 && (
                <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 px-2.5 py-1.5 space-y-0.5">
                  {overridesAsign.map((o, oi) => (
                    <div key={oi} className="flex items-center justify-between text-[11px]">
                      <span className="text-violet-400 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> {o.empleado_nombre} · override {o.pct}%
                      </span>
                      <span className="font-bold text-violet-400">{money(Number(o.comision_usd))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totales */}
      {(preview.length > 0 || value.some(a => (a.comision_manual ?? 0) > 0)) && (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total comisiones</span>
            <span className="font-black text-emerald-500">{money(totalComisiones)}</span>
          </div>
          {totalProveedor > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Proveedor (puente)</span>
              <span className="font-bold text-orange-500">{money(totalProveedor)}</span>
            </div>
          )}
          {costoTotal > 0 && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
              <span className="text-muted-foreground font-bold">Le queda a Lycos</span>
              <span className={`font-black ${lycosNeto >= 0 ? 'text-blue-500' : 'text-red-500'}`}>{money(lycosNeto)}</span>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Cada servicio del desglose se comisiona por separado con la regla del empleado
        (Nómina → Reglas &amp; Tarifas). “Por definir” = escribe la comisión manual.
      </p>
    </div>
  );
}
