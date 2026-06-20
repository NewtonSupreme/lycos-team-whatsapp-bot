'use client';
/**
 * Selector reutilizable de técnico(s) encargado(s) de un trabajo.
 * Lo usan: la captura manual de Nómina y el POS (servicios / ventas).
 *
 * Regla del sistema: SIEMPRE debe haber un técnico encargado o marcarse
 * "lo hizo el taller". El componente garantiza al menos una asignación válida.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Wrench, Building2, Loader2 } from 'lucide-react';
import { ZONAS_TRABAJO } from '@/types';

export interface JobSpec {
  empleado_id: string | null;
  es_taller: boolean;
  zona: string;
  ingreso_total: number;
  mano_obra: number;
  servicio_key?: string | null;
  cantidad?: number;
  descripcion?: string | null;
}

interface Tecnico { id: string; nombre: string; rol: string; sede_id: string | null; }

interface Props {
  value: JobSpec[];
  onChange: (specs: JobSpec[]) => void;
  sedeId?: string | null;
  defaultZona?: string;
  /** Ingreso total de la venta/servicio, para sugerir mano de obra. */
  ingresoTotal?: number;
  moneda?: string;
  /** Modo compacto para incrustar en formularios del POS. */
  compact?: boolean;
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

export default function AsignacionTecnicos({
  value, onChange, sedeId, defaultZona = 'general', ingresoTotal = 0, moneda = 'USD', compact,
}: Props) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const url = `/api/nomina/technicians?tecnicos=1${sedeId ? `&sede=${sedeId}` : ''}`;
    fetch(url).then(r => r.json()).then(d => {
      if (active) setTecnicos(d.technicians || []);
    }).catch(() => {}).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [sedeId]);

  // Garantiza al menos una fila.
  useEffect(() => {
    if (value.length === 0) {
      onChange([{ empleado_id: null, es_taller: false, zona: defaultZona, ingreso_total: ingresoTotal, mano_obra: ingresoTotal }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (i: number, patch: Partial<JobSpec>) => {
    const next = value.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onChange(next);
  };
  const add = () => onChange([...value, { empleado_id: null, es_taller: false, zona: defaultZona, ingreso_total: 0, mano_obra: 0 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const sym = moneda === 'VES' ? 'Bs' : moneda === 'EUR' ? '€' : '$';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-amber-500" /> Técnico encargado del trabajo <span className="text-red-400">*</span>
        </label>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {value.map((spec, i) => {
        const esEscape = spec.zona === 'escape';
        return (
          <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Técnico o Taller */}
              <select
                value={spec.es_taller ? '__taller__' : (spec.empleado_id || '')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__taller__') update(i, { es_taller: true, empleado_id: null });
                  else update(i, { es_taller: false, empleado_id: v || null });
                }}
                className="flex-1 min-w-[160px] h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
              >
                <option value="">— Selecciona técnico —</option>
                <option value="__taller__">🏢 Lo hizo el taller (sin técnico)</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>

              {/* Zona */}
              <select
                value={spec.zona}
                onChange={(e) => update(i, { zona: e.target.value })}
                className="h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
              >
                {ZONAS_TRABAJO.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>

              {value.length > 1 && (
                <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500 p-1.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!compact && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 uppercase">Ingreso</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{sym}</span>
                    <input type="number" step="0.01" value={spec.ingreso_total || ''}
                      onChange={(e) => update(i, { ingreso_total: parseFloat(e.target.value) || 0 })}
                      className="w-24 h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-6 pr-2 text-sm" />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400 uppercase">Mano de obra</span>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{sym}</span>
                  <input type="number" step="0.01" value={spec.mano_obra || ''}
                    onChange={(e) => update(i, { mano_obra: parseFloat(e.target.value) || 0 })}
                    className="w-24 h-8 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10 pl-6 pr-2 text-sm font-semibold" />
                </div>
              </div>

              {esEscape && (
                <select
                  multiple={false}
                  value={spec.servicio_key || ''}
                  onChange={(e) => update(i, { servicio_key: e.target.value || null })}
                  className="h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs"
                >
                  <option value="">Tarifa flat…</option>
                  {ESCAPE_SERVICIOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" onClick={add}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
        <Plus className="w-3.5 h-3.5" /> Agregar otro técnico (trabajo combinado)
      </button>
      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Building2 className="w-3 h-3" /> Si ningún técnico participó, marca "Lo hizo el taller" para que la venta quede registrada.
      </p>
    </div>
  );
}
