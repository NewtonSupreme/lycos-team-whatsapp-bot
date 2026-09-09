'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Loader2, Plus, Save, ShieldCheck,
  Trash2, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULOS_LABEL, type CrudPermiso, type Permisos } from '@/types';
import { useModales } from '@/components/ui/modales';

interface Rol {
  id: string;
  nombre: string;
  label: string;
  descripcion: string | null;
  permisos: Partial<Permisos>;
}

const ACCIONES: { k: keyof CrudPermiso; label: string; ayuda: string }[] = [
  { k: 'leer', label: 'Ver', ayuda: 'Puede abrir el módulo y consultarlo' },
  { k: 'crear', label: 'Crear', ayuda: 'Puede añadir registros nuevos' },
  { k: 'editar', label: 'Editar', ayuda: 'Puede modificar lo que ya existe' },
  { k: 'eliminar', label: 'Eliminar', ayuda: 'Puede borrar registros' },
];

const VACIO: CrudPermiso = { crear: false, leer: false, editar: false, eliminar: false };

/**
 * Los roles y lo que puede hacer cada uno, módulo por módulo.
 *
 * Vive dentro de Configuración en lugar de mandar a otra pantalla: mover al
 * usuario fuera del panel para cambiar un permiso y traerlo de vuelta rompe la
 * idea de tener un sitio donde se configura el sistema.
 *
 * «Ver» manda sobre el resto: sin poder abrir un módulo, crear o editar en él no
 * significa nada. Por eso al quitar «Ver» se apagan los demás, y al marcar
 * cualquier otro se enciende «Ver».
 */
export default function PanelRoles({
  canEdit, canDelete, usuariosPorRol,
}: {
  canEdit: boolean;
  canDelete: boolean;
  /** Cuánta gente tiene cada rol; un rol con gente no se borra. */
  usuariosPorRol: Record<string, number>;
}) {
  const { confirmar, info } = useModales();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [activo, setActivo] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Partial<Permisos>>({});
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [creando, setCreando] = useState<{ label: string; descripcion: string } | null>(null);

  const modulos = useMemo(() => Object.entries(MODULOS_LABEL) as [keyof Permisos, string][], []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const r = await fetch('/api/roles');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los roles');
      const lista: Rol[] = (d.roles || d.data || []) as Rol[];
      setRoles(lista);
      setActivo(prev => prev && lista.some(x => x.id === prev) ? prev : (lista[0]?.id ?? null));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const rolActivo = roles.find(r => r.id === activo) || null;

  // El borrador se rehace al cambiar de rol: es lo que se compara para saber si
  // hay algo sin guardar.
  useEffect(() => {
    setBorrador(rolActivo ? { ...(rolActivo.permisos || {}) } : {});
  }, [rolActivo]);

  const hayCambios = useMemo(
    () => !!rolActivo && JSON.stringify(borrador) !== JSON.stringify(rolActivo.permisos || {}),
    [borrador, rolActivo],
  );

  const permisoDe = (m: keyof Permisos): CrudPermiso => {
    const v = borrador[m];
    if (typeof v === 'boolean') return { crear: v, leer: v, editar: v, eliminar: v };
    return { ...VACIO, ...(v || {}) };
  };

  const alternar = (m: keyof Permisos, k: keyof CrudPermiso) => {
    if (!canEdit) return;
    const actual = permisoDe(m);
    const nuevo = { ...actual, [k]: !actual[k] };

    // Sin «Ver» el resto no puede hacer nada; y cualquier otro permiso implica ver.
    if (k === 'leer' && !nuevo.leer) {
      nuevo.crear = false; nuevo.editar = false; nuevo.eliminar = false;
    } else if (k !== 'leer' && nuevo[k]) {
      nuevo.leer = true;
    }
    setBorrador(b => ({ ...b, [m]: nuevo }));
  };

  const todoElModulo = (m: keyof Permisos, on: boolean) => {
    if (!canEdit) return;
    setBorrador(b => ({ ...b, [m]: on ? { crear: true, leer: true, editar: true, eliminar: true } : { ...VACIO } }));
  };

  const guardar = async () => {
    if (!rolActivo) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const r = await fetch(`/api/roles/${rolActivo.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permisos: borrador }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      setAviso(`Permisos de «${rolActivo.label}» guardados.`);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setOcupado(false);
    }
  };

  const crear = async () => {
    if (!creando?.label.trim()) { setError('El rol necesita un nombre.'); return; }
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: creando.label.toLowerCase().trim().replace(/\s+/g, '_'),
          label: creando.label.trim(),
          descripcion: creando.descripcion.trim(),
          // Nace solo con lectura del panel: se le va abriendo lo que necesite.
          permisos: { dashboard: { crear: false, leer: true, editar: false, eliminar: false } },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear el rol');
      setCreando(null);
      setAviso('Rol creado. Ahora márcale lo que puede hacer.');
      await cargar();
      if (d.role?.id) setActivo(d.role.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear');
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async (r: Rol) => {
    const cuantos = usuariosPorRol[r.nombre] || 0;
    if (cuantos > 0) {
      await info(
        `«${r.label}» no se puede eliminar porque lo tienen ${cuantos} usuario(s). `
        + 'Cámbiales el rol primero; si no, se quedarían sin permisos de golpe.',
        'No se puede eliminar',
      );
      return;
    }
    const sigue = await confirmar({
      tipo: 'peligro',
      titulo: `¿Eliminar el rol «${r.label}»?`,
      mensaje: 'Nadie lo tiene asignado.',
      detalle: 'Esta acción no se puede deshacer.',
      confirmar: 'Sí, eliminar',
    });
    if (!sigue) return;

    setOcupado(true);
    setError('');
    try {
      const res = await fetch(`/api/roles/${r.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo eliminar');
      setAviso('Rol eliminado.');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setOcupado(false);
    }
  };

  if (cargando) {
    return (
      <div className="rounded-xl border border-[#e8eaed] bg-white py-14 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
        <p className="mt-2 text-[12.5px] text-[#8a909c]">Cargando roles…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {(error || aviso) && (
        <p
          role={error ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px]',
            error ? 'border-[#f5c2c2] bg-[#fdeaea] text-[#b91c1c]' : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
          )}
        >
          {error
            ? <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
            : <Check className="mt-px h-4 w-4 shrink-0" aria-hidden />}
          {error || aviso}
        </p>
      )}

      <div className="flex flex-col gap-3.5 lg:flex-row">
        {/* ── Los roles ────────────────────────────────────────────────── */}
        <section className="w-full shrink-0 overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:w-[290px]">
          <header className="flex items-center gap-2 px-4 pb-2 pt-4">
            <h2 className="flex-1 text-[15px] font-bold text-[#16181d]">Roles</h2>
            <button
              onClick={() => setCreando({ label: '', descripcion: '' })}
              disabled={!canEdit}
              aria-label="Nuevo rol"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-45"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <ul className="px-2 pb-3">
            {roles.map(r => {
              const cuantos = usuariosPorRol[r.nombre] || 0;
              return (
                <li key={r.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActivo(r.id)}
                    aria-current={activo === r.id ? 'true' : undefined}
                    className={cn(
                      'min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors',
                      activo === r.id ? 'bg-[#fff4ec]' : 'hover:bg-[#fafbfc]',
                    )}
                  >
                    <span className={cn(
                      'block truncate text-[12.5px] font-semibold',
                      activo === r.id ? 'text-[#f97316]' : 'text-[#16181d]',
                    )}>
                      {r.label}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[#8a909c]">
                      <Users className="h-2.5 w-2.5" aria-hidden />
                      {cuantos} usuario{cuantos === 1 ? '' : 's'}
                    </span>
                  </button>
                  <button
                    onClick={() => eliminar(r)}
                    disabled={!canDelete || ocupado || cuantos > 0}
                    title={cuantos > 0 ? `Lo tienen ${cuantos} usuario(s)` : 'Eliminar rol'}
                    aria-label={`Eliminar ${r.label}`}
                    className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md text-[#c3c8d0] transition-colors hover:bg-[#fdeaea] hover:text-[#dc2626] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#c3c8d0]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Los permisos del rol elegido ─────────────────────────────── */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
          {!rolActivo ? (
            <p className="px-4 py-14 text-center text-[13px] text-[#8a909c]">Elige un rol para ver sus permisos.</p>
          ) : (
            <>
              <header className="flex flex-wrap items-start gap-3 border-b border-[#eef0f3] px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
                  <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-bold text-[#16181d]">{rolActivo.label}</h2>
                  <p className="text-[12px] text-[#8a909c]">
                    {rolActivo.descripcion || 'Sin descripción'}
                  </p>
                </div>
                <button
                  onClick={guardar}
                  disabled={!canEdit || ocupado || !hayCambios}
                  title={!hayCambios ? 'No hay cambios pendientes' : undefined}
                  className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-45"
                >
                  {ocupado
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    : <Save className="h-4 w-4" aria-hidden />}
                  Guardar permisos
                </button>
              </header>

              {hayCambios && (
                <p className="flex items-center gap-2 border-b border-[#fed7aa] bg-[#fff7ed] px-5 py-2 text-[12px] text-[#9a3412]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Cambios sin guardar en este rol.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#eef0f3] bg-[#fafbfc]">
                      <th scope="col" className="px-5 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">
                        Módulo
                      </th>
                      {ACCIONES.map(a => (
                        <th key={a.k} scope="col" title={a.ayuda}
                          className="w-[86px] px-2 py-2.5 text-center text-[11.5px] font-semibold text-[#5b616e]">
                          {a.label}
                        </th>
                      ))}
                      <th scope="col" className="w-[70px] px-3 py-2.5 text-center text-[11.5px] font-semibold text-[#5b616e]">
                        Todo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulos.map(([m, label]) => {
                      const p = permisoDe(m);
                      const todo = p.crear && p.leer && p.editar && p.eliminar;
                      return (
                        <tr key={m} className="border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]">
                          <td className="px-5 py-2 text-[12.5px] font-medium text-[#16181d]">{label}</td>
                          {ACCIONES.map(a => (
                            <td key={a.k} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={p[a.k]}
                                onChange={() => alternar(m, a.k)}
                                disabled={!canEdit}
                                aria-label={`${a.label} en ${label}`}
                                className="h-[16px] w-[16px] rounded border-[#cfd4dc] accent-[#f97316] disabled:opacity-50"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => todoElModulo(m, !todo)}
                              disabled={!canEdit}
                              className={cn(
                                'h-[24px] rounded-md px-2 text-[10.5px] font-semibold transition-colors disabled:opacity-45',
                                todo ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
                              )}
                            >
                              {todo ? 'Quitar' : 'Dar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="border-t border-[#f2f3f5] px-5 py-3 text-[11px] leading-snug text-[#9ba1ab]">
                «Ver» manda sobre el resto: al quitarlo se apagan los demás, porque crear o editar en un
                módulo que no se puede abrir no significa nada. Los cambios afectan a todos los usuarios
                con este rol la próxima vez que carguen el sistema.
              </p>
            </>
          )}
        </section>
      </div>

      {creando && (
        <div className="rounded-xl border border-[#f97316] bg-[#fffaf6] p-4">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-[14px] font-bold text-[#16181d]">Nuevo rol</h3>
            <button
              onClick={() => setCreando(null)}
              aria-label="Cancelar"
              className="flex h-[28px] w-[28px] items-center justify-center rounded-md text-[#8a909c] hover:bg-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              value={creando.label}
              onChange={e => setCreando({ ...creando, label: e.target.value })}
              placeholder="Nombre del rol (ej: Almacenista)"
              className="h-[40px] rounded-lg border border-[#e2e5ea] bg-white px-3 text-[13px] outline-none focus:border-[#f97316]"
            />
            <input
              value={creando.descripcion}
              onChange={e => setCreando({ ...creando, descripcion: e.target.value })}
              placeholder="Qué hace esta persona"
              className="h-[40px] rounded-lg border border-[#e2e5ea] bg-white px-3 text-[13px] outline-none focus:border-[#f97316]"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={crear}
              disabled={ocupado || !creando.label.trim()}
              className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Crear rol
            </button>
            <p className="text-[11px] leading-snug text-[#9a5b2c]">
              Nace solo con permiso de ver el panel. Después le marcas lo que necesite.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

