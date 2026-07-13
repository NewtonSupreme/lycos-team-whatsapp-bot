'use client';
/**
 * PERSONAL TÉCNICO (TALLER)
 *
 * Sustituye la tabla plana anterior, donde los mecánicos aparecían repetidos,
 * inactivos y sin área. Ahora el personal se agrupa por ÁREA DE TRABAJO
 * (la misma zona que usa el motor de nómina), detecta posibles duplicados y
 * permite activar/desactivar y reasignar el área sin salir de la pantalla.
 */
import { useMemo, useState } from 'react';
import {
  Wrench, Search, AlertTriangle, Users, Power, PowerOff, Pencil, Trash2,
  Loader2, EyeOff, Eye, Copy, MapPin,
} from 'lucide-react';
import { getRoleMeta } from '@/types';

export interface EmpleadoTecnico {
  id: string;
  nombre: string;
  username: string;
  rol: string;
  email?: string | null;
  telefono?: string | null;
  activo?: boolean | null;
  especialidad?: string | null;
  sede?: { id: string; nombre: string } | null;
}

/** Áreas del taller. Coinciden con las zonas del motor de nómina. */
export const AREAS = [
  { key: 'jefatura',    label: 'Jefatura de Taller',    color: 'text-violet-500 bg-violet-500/10 border-violet-500/20' },
  { key: 'alineacion',  label: 'Alineación y Balanceo', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  { key: 'mecanica',    label: 'Mecánica',              color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  { key: 'escape',      label: 'Escapes / Silenciadores', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { key: 'frenos',      label: 'Frenos',                color: 'text-red-500 bg-red-500/10 border-red-500/20' },
  { key: 'cauchera',    label: 'Cauchera',              color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' },
  { key: 'autolavado',  label: 'Autolavado',            color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' },
  { key: 'latoneria',   label: 'Latonería y Pintura',   color: 'text-pink-500 bg-pink-500/10 border-pink-500/20' },
  { key: 'electronica', label: 'Electrónica',           color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
  { key: 'almacen',     label: 'Almacén',               color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
];

const areaMeta = (k?: string | null) =>
  AREAS.find(a => a.key === k) || { key: '', label: 'Sin área asignada', color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' };

/**
 * Normaliza el nombre para detectar duplicados reales:
 * "TECNICO: FREDDY", "TECNICO FREDDY" y "Freddy" son la misma persona.
 */
const DIACRITICOS = /[̀-ͯ]/g;

function normalizarNombre(n: string): string {
  return (n || '')
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICOS, '')          // quita acentos
    .replace(/\b(tecnico|técnico|mecanico|mecánico|sr\.?|jefe|de|del|taller)\b/g, '')
    .replace(/[^a-z0-9]/g, '')                          // quita ":", ".", espacios
    .trim();
}

interface Props {
  empleados: EmpleadoTecnico[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (e: EmpleadoTecnico) => void;
  onDelete: (id: string, nombre: string) => void;
  onChanged: () => void;
}

export default function PersonalTecnico({ empleados, canEdit, canDelete, onEdit, onDelete, onChanged }: Props) {
  const [buscar, setBuscar] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  // ── Duplicados: mismo nombre normalizado en más de un registro ────────────
  const duplicados = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const e of empleados) {
      const k = normalizarNombre(e.nombre);
      if (!k) continue;
      conteo.set(k, (conteo.get(k) || 0) + 1);
    }
    return new Set([...conteo.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [empleados]);

  const esDuplicado = (e: EmpleadoTecnico) => duplicados.has(normalizarNombre(e.nombre));

  const visibles = useMemo(() => {
    return empleados.filter(e => {
      if (!verInactivos && e.activo === false) return false;
      if (buscar && !e.nombre.toLowerCase().includes(buscar.toLowerCase())) return false;
      return true;
    });
  }, [empleados, verInactivos, buscar]);

  const inactivosCount = empleados.filter(e => e.activo === false).length;
  const duplicadosCount = empleados.filter(esDuplicado).length;

  // Agrupación por área
  const grupos = useMemo(() => {
    const g = new Map<string, EmpleadoTecnico[]>();
    for (const e of visibles) {
      const k = e.especialidad || '';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(e);
    }
    // Orden: áreas del catálogo primero, "sin área" al final
    const orden = [...AREAS.map(a => a.key), ''];
    return orden
      .filter(k => g.has(k))
      .map(k => ({ area: k, lista: g.get(k)!.sort((a, b) => a.nombre.localeCompare(b.nombre)) }));
  }, [visibles]);

  // ── Acciones ──────────────────────────────────────────────────────────────
  const patch = async (id: string, body: any) => {
    setGuardando(id);
    try {
      const r = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onChanged();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
    setGuardando(null);
  };

  return (
    <div className="space-y-4">
      {/* Barra de control */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar técnico…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <button
          onClick={() => setVerInactivos(v => !v)}
          className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 ${
            verInactivos
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-400'
          }`}
        >
          {verInactivos ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          Inactivos ({inactivosCount})
        </button>
      </div>

      {/* Aviso de duplicados */}
      {duplicadosCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <b>{duplicadosCount} registros parecen duplicados</b> (el mismo técnico registrado varias veces,
            p. ej. “TECNICO: FREDDY” y “TECNICO FREDDY”).
            <p className="mt-0.5 text-amber-700/80 dark:text-amber-400/80">
              Deja <b>uno activo</b> con su área asignada y <b>desactiva</b> los demás con el botón de encendido.
              Así dejan de aparecer en los selectores de la orden de servicio, sin perder su historial.
            </p>
          </div>
        </div>
      )}

      {/* Grupos por área */}
      {grupos.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Users className="w-12 h-12 mx-auto text-slate-200 dark:text-slate-700 mb-3" />
          <p className="text-sm">No hay personal técnico que coincida.</p>
        </div>
      ) : (
        grupos.map(({ area, lista }) => {
          const meta = areaMeta(area);
          return (
            <div key={area || 'sin-area'} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${meta.color}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] text-slate-400">{lista.length}</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {lista.map(e => {
                  const inactivo = e.activo === false;
                  const dup = esDuplicado(e);
                  const rolMeta = getRoleMeta(e.rol);

                  return (
                    <div
                      key={e.id}
                      className={`rounded-xl border p-3 transition-all ${
                        inactivo
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 opacity-60'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-blue-300 dark:hover:border-blue-800'
                      }`}
                    >
                      {/* Cabecera */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Wrench className={`w-3.5 h-3.5 shrink-0 ${inactivo ? 'text-slate-400' : 'text-amber-500'}`} />
                            <p className="text-sm font-bold truncate text-slate-800 dark:text-slate-100">{e.nombre}</p>
                            {dup && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                <Copy className="w-2.5 h-2.5" /> Duplicado
                              </span>
                            )}
                            {inactivo && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-500 border border-slate-500/30">
                                Inactivo
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className={`px-1.5 py-0.5 rounded border font-bold uppercase ${rolMeta?.color || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                              {rolMeta?.label || e.rol}
                            </span>
                            {e.sede?.nombre && (
                              <span className="flex items-center gap-0.5 truncate">
                                <MapPin className="w-2.5 h-2.5" /> {e.sede.nombre}
                              </span>
                            )}
                          </div>
                        </div>

                        {guardando === e.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />}
                      </div>

                      {/* Área + acciones */}
                      <div className="flex items-center gap-1.5">
                        <select
                          value={e.especialidad || ''}
                          disabled={!canEdit}
                          onChange={ev => patch(e.id, { especialidad: ev.target.value })}
                          className="flex-1 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-[11px] disabled:opacity-50"
                        >
                          <option value="">— Sin área —</option>
                          {AREAS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                        </select>

                        {canEdit && (
                          <button
                            onClick={() => patch(e.id, { activo: inactivo })}
                            title={inactivo ? 'Activar' : 'Desactivar'}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                              inactivo
                                ? 'text-emerald-500 hover:bg-emerald-500/10'
                                : 'text-slate-400 hover:bg-slate-500/10 hover:text-slate-600'
                            }`}
                          >
                            {inactivo ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                          </button>
                        )}

                        {canEdit && (
                          <button
                            onClick={() => onEdit(e)}
                            title="Editar"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => onDelete(e.id, e.nombre)}
                            title="Eliminar"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
