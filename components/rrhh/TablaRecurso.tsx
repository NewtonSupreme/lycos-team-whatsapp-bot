'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecursoKey } from '@/lib/rrhh/recursos';
import { COLUMNAS, TINTE_ESTADO, TITULOS } from './campos';
import DialogoRecurso from './DialogoRecurso';
import { fechaCorta, mensajeError, type EmpleadoRRHH, type RegistroRRHH } from './tipos';
import Avatar from './Avatar';

interface Props {
  recurso: RecursoKey;
  empleados: readonly EmpleadoRRHH[];
  sedeId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  /** Empleado preseleccionado al abrir el alta desde una acción rápida. */
  empleadoFoco?: string | null;
  onCambio?: () => void;
}

export default function TablaRecurso({
  recurso, empleados, sedeId, canEdit, canDelete, empleadoFoco, onCambio,
}: Props) {
  const [filas, setFilas] = useState<RegistroRRHH[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [dialogo, setDialogo] = useState<{ abierto: boolean; inicial: RegistroRRHH | null } | null>(null);

  const porEmpleado = recurso !== 'reclutamiento';
  const columnas = COLUMNAS[recurso];
  const titulos = TITULOS[recurso];

  const nombres = useMemo(
    () => new Map(empleados.map(e => [e.id, e])),
    [empleados],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (sedeId) qs.set('sede', sedeId);
      if (filtroEmpleado) qs.set('empleado', filtroEmpleado);
      const r = await fetch(`/api/rrhh/${recurso}?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar');
      setFilas(d[recurso] || []);
    } catch (e: unknown) {
      setError(mensajeError(e, 'Error al cargar'));
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [recurso, sedeId, filtroEmpleado]);

  useEffect(() => { cargar(); }, [cargar]);

  const borrar = async (id: string) => {
    if (!confirm('¿Borrar este registro? No se puede deshacer.')) return;
    const r = await fetch(`/api/rrhh/${recurso}/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json();
      alert(d.error || 'No se pudo borrar');
      return;
    }
    cargar();
    onCambio?.();
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-extrabold tracking-tight text-[#16181d]">{titulos.plural}</h2>
          <p className="text-[12px] text-[#8a909c]">{filas.length} registro{filas.length === 1 ? '' : 's'}</p>
        </div>

        {porEmpleado && (
          <select
            value={filtroEmpleado}
            onChange={e => setFiltroEmpleado(e.target.value)}
            aria-label="Filtrar por empleado"
            className="h-[38px] max-w-[220px] rounded-lg border border-[#e2e5ea] px-2.5 text-[12.5px] text-[#3d4350] outline-none focus:border-[#f97316]"
          >
            <option value="">Todos los empleados</option>
            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        )}

        <button
          onClick={cargar}
          aria-label="Actualizar"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
        >
          <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} aria-hidden />
        </button>

        {canEdit && (
          <button
            onClick={() => setDialogo({ abierto: true, inicial: null })}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo
          </button>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
              {porEmpleado && (
                <th scope="col" className="px-4 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">Empleado</th>
              )}
              {columnas.map(c => (
                <th key={c.id} scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">{c.label}</th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {cargando && (
              <tr>
                <td colSpan={columnas.length + 2} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#f97316]" aria-hidden />
                </td>
              </tr>
            )}

            {!cargando && error && (
              <tr>
                <td colSpan={columnas.length + 2} className="px-4 py-8 text-center text-[12.5px] text-[#dc2626]">{error}</td>
              </tr>
            )}

            {!cargando && !error && filas.length === 0 && (
              <tr>
                <td colSpan={columnas.length + 2} className="px-4 py-10 text-center text-[12.5px] text-[#8a909c]">{titulos.vacio}</td>
              </tr>
            )}

            {!cargando && !error && filas.map(f => {
              const emp = nombres.get(String(f.empleado_id));
              return (
                <tr key={String(f.id)} className="border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]">
                  {porEmpleado && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar nombre={emp?.nombre} url={(emp?.foto_url || emp?.avatar_url) as string | null} size={30} />
                        <span className="truncate text-[12.5px] font-semibold text-[#16181d]">{emp?.nombre || '—'}</span>
                      </div>
                    </td>
                  )}

                  {columnas.map(c => (
                    <td key={c.id} className="px-3 py-2.5 text-[12px] text-[#3d4350]">
                      <Celda tipo={c.tipo} valor={f[c.id]} />
                    </td>
                  ))}

                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {canEdit && (
                        <button
                          onClick={() => setDialogo({ abierto: true, inicial: f })}
                          aria-label="Editar registro"
                          className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => borrar(String(f.id))}
                          aria-label="Borrar registro"
                          className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#dc2626] hover:bg-[#fdeaea]"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialogo?.abierto && (
        <DialogoRecurso
          recurso={recurso}
          empleados={empleados}
          empleadoId={(dialogo.inicial?.empleado_id as string | undefined) || empleadoFoco || filtroEmpleado || null}
          inicial={dialogo.inicial}
          onCerrar={() => setDialogo(null)}
          onGuardado={() => { cargar(); onCambio?.(); }}
        />
      )}
    </section>
  );
}

function Celda({ tipo, valor }: { tipo?: string; valor: RegistroRRHH[string] }) {
  if (valor === null || valor === undefined || valor === '') return <span className="text-[#c2c7d0]">—</span>;

  if (tipo === 'fecha') return <span className="num">{fechaCorta(String(valor))}</span>;
  if (tipo === 'numero') return <span className="num">{valor}</span>;
  if (tipo === 'check') return <span>{valor ? 'Sí' : 'No'}</span>;

  if (tipo === 'estado') {
    return (
      <span className={cn('inline-flex rounded-md px-2 py-[3px] text-[11px] font-medium capitalize', TINTE_ESTADO[String(valor)] || 'bg-[#f2f3f5] text-[#5b616e]')}>
        {String(valor).replace('_', ' ')}
      </span>
    );
  }

  if (tipo === 'enlace') {
    return (
      <a href={String(valor)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#2563eb] hover:underline">
        Abrir
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    );
  }

  return <span className="line-clamp-2 max-w-[220px]">{String(valor)}</span>;
}
