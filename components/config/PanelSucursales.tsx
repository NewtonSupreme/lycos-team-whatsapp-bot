'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, Check, Loader2, MapPin, Pencil, Plus, Power,
  Star, Trash2, X,
} from 'lucide-react';
import ModalPortal from '@/components/ui/modal-portal';
import { useModales } from '@/components/ui/modales';
import { cn } from '@/lib/utils';

export interface Sede {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  rif: string | null;
  horario: string | null;
  notas: string | null;
  activo: boolean;
  es_principal: boolean;
  dependencias: { label: string; total: number }[];
  totalDependencias: number;
}

type Borrador = Partial<Sede> & { nombre: string };

const VACIA: Borrador = {
  nombre: '', direccion: '', telefono: '', email: '', rif: '', horario: '', notas: '', activo: true,
};

/**
 * Las sucursales del taller: alta, edición, baja y cuál es la principal.
 *
 * Lo importante es lo que NO deja hacer. Una sucursal con historial detrás no
 * se puede borrar: se desactiva. Borrar San Antonio, con 518 órdenes y 1.210
 * clientes colgando, dejaría cientos de registros apuntando a una sede que ya
 * no existe. El servidor lo impide y aquí se explica antes de intentarlo.
 */
export default function PanelSucursales({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const { confirmar, info } = useModales();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const r = await fetch('/api/sedes');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las sucursales');
      setSedes(d.sedes || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    if (!editando) return;
    if (!editando.nombre.trim()) { setError('La sucursal necesita un nombre.'); return; }
    setOcupado(true);
    setError('');
    try {
      const esNueva = !editando.id;
      const r = await fetch('/api/sedes', {
        method: esNueva ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      setEditando(null);
      setAviso(esNueva ? 'Sucursal creada.' : 'Sucursal actualizada.');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setOcupado(false);
    }
  };

  const alternarActivo = async (s: Sede) => {
    const sigue = await confirmar({
      titulo: s.activo ? `¿Desactivar «${s.nombre}»?` : `¿Reactivar «${s.nombre}»?`,
      mensaje: s.activo
        ? 'Deja de aparecer para trabajar, pero conserva todo su historial.'
        : 'Vuelve a estar disponible en el selector de sede.',
      confirmar: s.activo ? 'Desactivar' : 'Reactivar',
    });
    if (!sigue) return;
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/sedes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, activo: !s.activo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar');
      setAviso(s.activo ? 'Sucursal desactivada.' : 'Sucursal reactivada.');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cambiar el estado');
    } finally {
      setOcupado(false);
    }
  };

  const hacerPrincipal = async (s: Sede) => {
    const sigue = await confirmar({
      titulo: '¿Cambiar la sucursal principal?',
      mensaje: `«${s.nombre}» pasará a ser la sede por defecto del sistema.`,
      confirmar: 'Hacer principal',
    });
    if (!sigue) return;
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/sedes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, hacerPrincipal: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar');
      setAviso(`«${s.nombre}» es ahora la sucursal principal.`);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cambiar la principal');
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async (s: Sede) => {
    if (s.totalDependencias > 0) {
      const lista = s.dependencias.map(d => `${d.total} ${d.label}`).join(', ');
      await info(
        `«${s.nombre}» no se puede eliminar porque tiene ${lista}. `
        + 'Desactívala en su lugar: deja de aparecer para trabajar pero conserva su historial, '
        + 'que es lo que pasa de verdad cuando una sucursal cierra.',
        'No se puede eliminar',
      );
      return;
    }
    const sigue = await confirmar({
      tipo: 'peligro',
      titulo: `¿Eliminar «${s.nombre}»?`,
      mensaje: 'Está vacía, así que no se pierde nada.',
      detalle: 'Esta acción no se puede deshacer.',
      confirmar: 'Sí, eliminar',
    });
    if (!sigue) return;

    setOcupado(true);
    setError('');
    try {
      const r = await fetch(`/api/sedes?id=${s.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo eliminar');
      setAviso('Sucursal eliminada.');
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <section className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
            <Building2 className="h-[20px] w-[20px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-[#16181d]">Sucursales</h2>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#8a909c]">
              Cada sucursal tiene sus propios clientes, servicios, ventas e inventario. El selector
              de la barra superior cambia la que estás usando.
            </p>
          </div>
          <button
            onClick={() => setEditando({ ...VACIA })}
            disabled={!canEdit}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-45"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nueva sucursal
          </button>
        </div>

        {(error || aviso) && (
          <p
            role={error ? 'alert' : 'status'}
            className={cn(
              'mt-3.5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]',
              error ? 'border-[#f5c2c2] bg-[#fdeaea] text-[#b91c1c]' : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
            )}
          >
            {error
              ? <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
              : <Check className="mt-px h-4 w-4 shrink-0" aria-hidden />}
            {error || aviso}
          </p>
        )}
      </section>

      {cargando ? (
        <div className="rounded-xl border border-[#e8eaed] bg-white py-14 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
          <p className="mt-2 text-[12.5px] text-[#8a909c]">Cargando sucursales…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sedes.map(s => (
            <article
              key={s.id}
              className={cn(
                'rounded-xl border bg-white p-4',
                s.es_principal ? 'border-[#f97316]' : s.activo ? 'border-[#e8eaed]' : 'border-[#eef0f3] opacity-70',
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  s.es_principal ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#eef1f5] text-[#5b616e]',
                )}>
                  <MapPin className="h-[18px] w-[18px]" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-1.5 text-[14px] font-bold text-[#16181d]">
                    <span className="truncate">{s.nombre}</span>
                    {s.es_principal && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#fff1e7] px-1.5 py-[2px] text-[10px] font-semibold text-[#f97316]">
                        <Star className="h-2.5 w-2.5" aria-hidden />
                        Principal
                      </span>
                    )}
                    {!s.activo && (
                      <span className="rounded-md bg-[#fdeaea] px-1.5 py-[2px] text-[10px] font-semibold text-[#dc2626]">
                        Inactiva
                      </span>
                    )}
                  </h3>

                  <dl className="mt-1.5 space-y-0.5 text-[11.5px] text-[#8a909c]">
                    {s.direccion && <dd className="truncate">{s.direccion}</dd>}
                    {s.telefono && <dd className="num">{s.telefono}</dd>}
                    {s.rif && <dd className="num">RIF {s.rif}</dd>}
                    {s.horario && <dd className="truncate">{s.horario}</dd>}
                    {!s.direccion && !s.telefono && !s.rif && !s.horario && (
                      <dd className="italic">Sin datos de contacto. Edítala para completarlos.</dd>
                    )}
                  </dl>

                  <p className="mt-2 text-[11px] text-[#5b616e]">
                    {s.totalDependencias === 0
                      ? 'Sin registros: se puede eliminar.'
                      : s.dependencias.map(d => `${d.total} ${d.label}`).join(' · ')}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#f2f3f5] pt-3">
                <BotonAccion
                  icono={<Pencil className="h-3.5 w-3.5" aria-hidden />}
                  label="Editar"
                  disabled={!canEdit || ocupado}
                  onClick={() => setEditando({ ...s })}
                />
                {!s.es_principal && (
                  <BotonAccion
                    icono={<Star className="h-3.5 w-3.5" aria-hidden />}
                    label="Hacer principal"
                    disabled={!canEdit || ocupado}
                    onClick={() => hacerPrincipal(s)}
                  />
                )}
                <BotonAccion
                  icono={<Power className="h-3.5 w-3.5" aria-hidden />}
                  label={s.activo ? 'Desactivar' : 'Reactivar'}
                  disabled={!canEdit || ocupado || s.es_principal}
                  titulo={s.es_principal ? 'La principal no se puede desactivar' : undefined}
                  onClick={() => alternarActivo(s)}
                />
                <BotonAccion
                  icono={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  label="Eliminar"
                  peligro
                  disabled={!canDelete || ocupado || s.es_principal || s.totalDependencias > 0}
                  titulo={
                    s.es_principal ? 'La principal no se puede eliminar'
                      : s.totalDependencias > 0 ? 'Tiene registros: desactívala en su lugar'
                        : undefined
                  }
                  onClick={() => eliminar(s)}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {editando && (
        <DialogoSede
          borrador={editando}
          ocupado={ocupado}
          onCambio={setEditando}
          onCerrar={() => { setEditando(null); setError(''); }}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}

function BotonAccion({
  icono, label, onClick, disabled, peligro, titulo,
}: {
  icono: React.ReactNode; label: string; onClick: () => void;
  disabled?: boolean; peligro?: boolean; titulo?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={cn(
        'flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-40',
        peligro
          ? 'border-[#f5c2c2] text-[#dc2626] hover:bg-[#fdeaea] disabled:hover:bg-transparent'
          : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9] disabled:hover:bg-transparent',
      )}
    >
      {icono}
      {label}
    </button>
  );
}

function DialogoSede({
  borrador, ocupado, onCambio, onCerrar, onGuardar,
}: {
  borrador: Borrador;
  ocupado: boolean;
  onCambio: (b: Borrador) => void;
  onCerrar: () => void;
  onGuardar: () => void;
}) {
  const set = (patch: Partial<Borrador>) => onCambio({ ...borrador, ...patch });

  const campos: { k: keyof Borrador; label: string; ph: string; ancho?: boolean }[] = [
    { k: 'nombre', label: 'Nombre de la sucursal', ph: 'Ej: San Antonio de los Altos', ancho: true },
    { k: 'direccion', label: 'Dirección', ph: 'Calle, sector, ciudad', ancho: true },
    { k: 'telefono', label: 'Teléfono', ph: '0212-1234567' },
    { k: 'rif', label: 'RIF', ph: 'J-12345678-9' },
    { k: 'email', label: 'Correo', ph: 'sucursal@lycosteam.com' },
    { k: 'horario', label: 'Horario', ph: 'L-V 8:00 a 17:00' },
  ];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6">
        <div
          className="flex min-h-0 w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          style={{ maxHeight: 'calc(100vh - 48px)' }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[#eef0f3] px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
              <Building2 className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold text-[#16181d]">
              {borrador.id ? 'Editar sucursal' : 'Nueva sucursal'}
            </h2>
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {campos.map(c => (
                <label key={String(c.k)} className={cn('block', c.ancho && 'sm:col-span-2')}>
                  <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
                    {c.label}
                    {c.k === 'nombre' && <span className="text-[#dc2626]"> *</span>}
                  </span>
                  <input
                    value={String(borrador[c.k] ?? '')}
                    onChange={e => set({ [c.k]: e.target.value } as Partial<Borrador>)}
                    placeholder={c.ph}
                    className="h-[40px] w-full rounded-lg border border-[#e2e5ea] px-3 text-[13px] text-[#16181d] outline-none placeholder:text-[#c3c8d0] focus:border-[#f97316]"
                  />
                </label>
              ))}

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Notas</span>
                <textarea
                  value={String(borrador.notas ?? '')}
                  onChange={e => set({ notas: e.target.value })}
                  rows={2}
                  placeholder="Cualquier detalle que convenga recordar de esta sucursal"
                  className="w-full resize-none rounded-lg border border-[#e2e5ea] px-3 py-2 text-[13px] text-[#16181d] outline-none placeholder:text-[#c3c8d0] focus:border-[#f97316]"
                />
              </label>
            </div>

            {borrador.id && borrador.es_principal && (
              <p className="mt-3 rounded-lg bg-[#fff7ed] px-3 py-2 text-[11.5px] leading-snug text-[#9a3412]">
                Es la sucursal principal: no se puede desactivar ni eliminar mientras lo sea.
              </p>
            )}
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-[#eef0f3] px-5 py-3.5">
            <button
              onClick={onCerrar}
              className="h-[40px] rounded-lg border border-[#e2e5ea] px-4 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
            >
              Cancelar
            </button>
            <button
              onClick={onGuardar}
              disabled={ocupado || !borrador.nombre.trim()}
              className="flex h-[40px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[13px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {borrador.id ? 'Guardar cambios' : 'Crear sucursal'}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
