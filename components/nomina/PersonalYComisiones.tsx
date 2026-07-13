'use client';
/**
 * PERSONAL A CARGO Y COMISIONES — sección unificada de la Orden de Servicio.
 *
 * Reemplaza el antiguo "Personal a cargo" (que guardaba sólo NOMBRES sueltos y por
 * eso no se podía calcular nada) por una selección de EMPLEADOS REGISTRADOS (con id).
 * Debajo de cada empleado, el sistema calcula EN VIVO su comisión aplicando sus
 * reglas de nómina (25% alineación, 40% mano de obra, override 7% del jefe de taller,
 * tarifas a destajo, etc.) — sin que nadie tenga que hacer cuentas a mano.
 *
 * Si la orden tiene desglose de servicios con precio, cada ítem puede asignarse al
 * empleado que lo ejecutó, para que la comisión salga EXACTA.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Wrench, Building2, Loader2, Users, Search, X, TrendingUp, AlertTriangle, Check,
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
}

interface Tecnico { id: string; nombre: string; rol: string; sede_id: string | null; }

interface Props {
  value: AsignacionEmpleado[];
  onChange: (v: AsignacionEmpleado[]) => void;
  sedeId?: string | null;
  /** Zona por defecto, derivada de la clasificación del servicio. */
  defaultZona?: string;
  /** Desglose de la orden (ítems con precio) para asignar por servicio. */
  items?: ItemDesglose[];
  /** Costo total de la orden (si no hay desglose). */
  costoTotal?: number;
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

export default function PersonalYComisiones({
  value, onChange, sedeId, defaultZona = 'mecanica', items = [], costoTotal = 0,
}: Props) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [abrirBuscador, setAbrirBuscador] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [calculando, setCalculando] = useState(false);

  const itemsValidos = useMemo(
    () => items.filter(i => i.descripcion?.trim() && Number(i.total) > 0),
    [items]
  );

  // ── Personal registrado ───────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fetch(`/api/nomina/technicians?tecnicos=1${sedeId ? `&sede=${sedeId}` : ''}`)
      .then(r => r.json())
      .then(d => { if (vivo) setTecnicos(d.technicians || []); })
      .catch(() => {})
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [sedeId]);

  /** Mano de obra efectiva de una asignación (ítems asignados o monto manual). */
  const manoObraDe = useCallback((a: AsignacionEmpleado): number => {
    if (a.item_idx.length > 0) {
      return a.item_idx.reduce((s, idx) => s + (Number(items[idx]?.total) || 0), 0);
    }
    return Number(a.mano_obra_manual) || 0;
  }, [items]);

  // ── Cálculo en vivo de comisiones ─────────────────────────────────────────
  const asignacionesKey = JSON.stringify(
    value.map(a => [a.empleado_id, a.es_taller, a.zona, manoObraDe(a), a.servicio_key, a.cantidad])
  );

  useEffect(() => {
    const validas = value.filter(a => a.empleado_id || a.es_taller);
    if (validas.length === 0) { setPreview([]); return; }

    let vivo = true;
    setCalculando(true);
    const t = setTimeout(() => {
      fetch('/api/nomina/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sede: sedeId,
          jobs: validas.map(a => {
            const mo = manoObraDe(a);
            return {
              empleado_id: a.empleado_id,
              es_taller: a.es_taller,
              zona: a.zona,
              ingreso_total: mo || costoTotal,
              mano_obra: mo,
              servicio_key: a.servicio_key || null,
              cantidad: a.cantidad || 1,
              moneda: 'USD',
            };
          }),
        }),
      })
        .then(r => r.json())
        .then(d => { if (vivo) setPreview(d.preview || []); })
        .catch(() => {})
        .finally(() => vivo && setCalculando(false));
    }, 350); // debounce

    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignacionesKey, sedeId, costoTotal]);

  // ── Mutaciones ────────────────────────────────────────────────────────────
  const agregar = (t: Tecnico | null) => {
    const nueva: AsignacionEmpleado = t
      ? { empleado_id: t.id, es_taller: false, nombre: t.nombre, rol: t.rol, zona: defaultZona, item_idx: [], mano_obra_manual: 0 }
      : { empleado_id: null, es_taller: true, nombre: 'Taller (sin técnico)', rol: 'taller', zona: defaultZona, item_idx: [], mano_obra_manual: 0 };
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
    actualizar(i, {
      item_idx: ya ? a.item_idx.filter(x => x !== itemIdx) : [...a.item_idx, itemIdx],
    });
  };

  /** Un ítem sólo puede estar asignado a un empleado a la vez. */
  const itemTomadoPor = (itemIdx: number, exceptoI: number): string | null => {
    const i = value.findIndex((a, idx) => idx !== exceptoI && a.item_idx.includes(itemIdx));
    return i >= 0 ? value[i].nombre : null;
  };

  const disponibles = tecnicos.filter(
    t => !value.some(a => a.empleado_id === t.id) &&
      t.nombre.toLowerCase().includes(buscar.toLowerCase())
  );

  const totalComisiones = preview.reduce(
    (s, p) => s + (Number(p.comision_usd) || 0) + (p.overrides || []).reduce((so: number, o: any) => so + (Number(o.comision_usd) || 0), 0),
    0
  );
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
                    <p className="text-[10px] text-muted-foreground uppercase">{t.rol.replace(/_/g, ' ')}</p>
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
          const p = preview.find(
            x => (a.empleado_id && x.empleado_id === a.empleado_id) || (a.es_taller && x.es_taller)
          );
          const mo = manoObraDe(a);
          const esEscape = a.zona === 'escape';

          return (
            <div
              key={i}
              className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2.5"
            >
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

                <button
                  type="button"
                  onClick={() => quitar(i)}
                  className="text-muted-foreground hover:text-red-500 p-1 shrink-0"
                >
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

              {/* Fila 3: mano de obra + comisión calculada */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">
                    Mano de obra
                  </p>
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

                {/* Comisión calculada automáticamente */}
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5 flex items-center gap-1">
                    Comisión {calculando && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  </p>
                  {p ? (
                    p.sin_regla ? (
                      <p className="text-[11px] text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Sin regla de comisión configurada
                      </p>
                    ) : (
                      <div>
                        <span className="text-base font-black text-emerald-500">
                          {money(Number(p.comision_usd))}
                        </span>
                        {p.regla_descripcion && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            {p.regla_descripcion}
                          </span>
                        )}
                        {Number(p.proveedor_monto_usd) > 0 && (
                          <p className="text-[10px] text-orange-500">
                            Proveedor ({p.proveedor_nombre || 'puente'}): {money(Number(p.proveedor_monto_usd))}
                          </p>
                        )}
                      </div>
                    )
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {mo > 0 ? 'Calculando…' : 'Indica la mano de obra'}
                    </span>
                  )}
                </div>
              </div>

              {/* Overrides en cascada (jefe de taller) */}
              {p?.overrides?.length > 0 && (
                <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 px-2.5 py-1.5 space-y-0.5">
                  {p.overrides.map((o: any, oi: number) => (
                    <div key={oi} className="flex items-center justify-between text-[11px]">
                      <span className="text-violet-400 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {o.empleado_nombre} · override {o.pct}%
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
      {preview.length > 0 && (
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
              <span className={`font-black ${lycosNeto >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                {money(lycosNeto)}
              </span>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Las comisiones se calculan solas con las reglas de cada empleado (Nómina → Reglas & Tarifas).
        Si alguien aparece “sin regla”, configúralo ahí.
      </p>
    </div>
  );
}
