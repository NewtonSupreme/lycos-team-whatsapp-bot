'use client';

import { useState } from 'react';
import { AlertCircle, Camera, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ZONAS_TRABAJO, type RoleMeta } from '@/types';
import { AREAS, CONTRATOS, mensajeError, type EmpleadoRRHH } from './tipos';
import Avatar from './Avatar';

interface Props {
  /** Sin empleado, el diálogo da de alta a alguien nuevo. */
  empleado: EmpleadoRRHH | null;
  sedes: readonly { id: string; nombre: string }[];
  sedeActual: string | null;
  rolesAsignables: readonly RoleMeta[];
  onCerrar: () => void;
  onGuardado: () => void;
}

const CLAVE_POR_DEFECTO = 'lycos2026';

/** Los campos del formulario, tipados: `activo` es lo único que no es texto. */
interface FormEmpleado {
  nombre: string; username: string; email: string; telefono: string; cedula: string;
  rol: string; sede_id: string; cargo: string; area: string; tipo_contrato: string;
  fecha_ingreso: string; fecha_nacimiento: string; especialidad: string;
  foto_url: string; password: string; activo: boolean;
}

export default function DialogoEmpleado({
  empleado, sedes, sedeActual, rolesAsignables, onCerrar, onGuardado,
}: Props) {
  const editando = Boolean(empleado);

  const [f, setF] = useState<FormEmpleado>({
    nombre: empleado?.nombre || '',
    username: empleado?.username || '',
    email: empleado?.email || '',
    telefono: empleado?.telefono || '',
    cedula: empleado?.cedula || '',
    rol: empleado?.rol || rolesAsignables[0]?.nombre || 'atencion_cliente',
    sede_id: empleado?.sede_id || sedeActual || sedes[0]?.id || '',
    cargo: empleado?.cargo || '',
    area: empleado?.area || '',
    tipo_contrato: empleado?.tipo_contrato || '',
    fecha_ingreso: empleado?.fecha_ingreso || '',
    fecha_nacimiento: empleado?.fecha_nacimiento || '',
    especialidad: empleado?.especialidad || '',
    foto_url: empleado?.foto_url || '',
    activo: empleado?.activo !== false,
    password: '',
  });

  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof FormEmpleado>(k: K, v: FormEmpleado[K]) =>
    setF(p => ({ ...p, [k]: v }));

  /** Sube el retrato al bucket público `avatars`, carpeta personal/. */
  const subirFoto = async (file?: File | null) => {
    if (!file || !supabase) return;
    setSubiendo(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `personal/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: e } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true, contentType: file.type || 'image/jpeg',
      });
      if (e) throw e;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (data?.publicUrl) set('foto_url', data.publicUrl);
    } catch (e: unknown) {
      setError('No se pudo subir la imagen: ' + mensajeError(e));
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!f.rol) { setError('Elige un rol.'); return; }

    setGuardando(true);
    try {
      const cuerpo: Record<string, unknown> = {
        nombre: f.nombre.trim(),
        email: f.email.trim() || undefined,
        telefono: f.telefono.trim(),
        cedula: f.cedula.trim(),
        rol: f.rol,
        sede_id: f.sede_id,
        cargo: f.cargo.trim(),
        area: f.area,
        tipo_contrato: f.tipo_contrato,
        fecha_ingreso: f.fecha_ingreso,
        fecha_nacimiento: f.fecha_nacimiento,
        especialidad: f.especialidad,
        foto_url: f.foto_url,
        activo: f.activo,
      };

      if (editando) {
        cuerpo.id = empleado!.id;
        cuerpo.username = f.username.trim() || undefined;
        // La contraseña solo viaja si se escribió una nueva.
        if (f.password.trim()) cuerpo.password = f.password.trim();
      } else {
        cuerpo.username = f.username.trim() || undefined;
        cuerpo.password_hash = (f.password.trim() || CLAVE_POR_DEFECTO);
      }

      const res = await fetch(editando ? '/api/admin/update-user' : '/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar');

      onGuardado();
      onCerrar();
    } catch (err: unknown) {
      setError(mensajeError(err, 'Error al guardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={guardar} className="flex max-h-[90dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <h2 className="min-w-0 flex-1 text-[15px] font-extrabold text-[#16181d]">
            {editando ? `Ficha de ${empleado!.nombre}` : 'Nuevo empleado'}
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Retrato */}
          <div className="flex items-center gap-4">
            <Avatar nombre={f.nombre} url={f.foto_url} size={80} className="!rounded-xl" />

            <div>
              <label className="flex h-[36px] cursor-pointer items-center gap-2 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                {subiendo ? 'Subiendo…' : 'Subir foto'}
                <input type="file" accept="image/*" className="hidden" onChange={e => subirFoto(e.target.files?.[0])} />
              </label>
              {f.foto_url && (
                <button type="button" onClick={() => set('foto_url', '')} className="mt-1.5 text-[11.5px] text-[#dc2626] hover:underline">
                  Quitar foto
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nombre completo" requerido>
              <input value={f.nombre} onChange={e => set('nombre', e.target.value)} className={INPUT} />
            </Campo>
            <Campo label="Cédula">
              <input value={f.cedula} onChange={e => set('cedula', e.target.value)} placeholder="V-12.345.678" className={INPUT} />
            </Campo>

            <Campo label="Cargo" ayuda="El puesto real. El rol define los permisos.">
              <input value={f.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Mecánico, Recepción…" className={INPUT} />
            </Campo>
            <Campo label="Área">
              <select value={f.area} onChange={e => set('area', e.target.value)} className={INPUT}>
                <option value="">Sin área</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Campo>

            <Campo label="Fecha de ingreso" ayuda="Alimenta antigüedad y el gráfico del personal.">
              <input type="date" value={f.fecha_ingreso || ''} onChange={e => set('fecha_ingreso', e.target.value)} className={INPUT} />
            </Campo>
            <Campo label="Fecha de nacimiento" ayuda="Alimenta el aviso de cumpleaños.">
              <input type="date" value={f.fecha_nacimiento || ''} onChange={e => set('fecha_nacimiento', e.target.value)} className={INPUT} />
            </Campo>

            <Campo label="Tipo de contrato">
              <select value={f.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} className={INPUT}>
                <option value="">Sin definir</option>
                {CONTRATOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
            <Campo label="Especialidad" ayuda="Zona de trabajo para nómina y comisiones.">
              <select value={f.especialidad} onChange={e => set('especialidad', e.target.value)} className={INPUT}>
                <option value="">Sin especialidad</option>
                {ZONAS_TRABAJO.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>
            </Campo>

            <Campo label="Teléfono">
              <input value={f.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+58 412 123 4567" className={INPUT} />
            </Campo>
            <Campo label="Correo">
              <input type="email" value={f.email} onChange={e => set('email', e.target.value)} className={INPUT} />
            </Campo>

            <Campo label="Rol del sistema" requerido ayuda="Define qué puede ver y hacer en el panel.">
              <select value={f.rol} onChange={e => set('rol', e.target.value)} className={INPUT}>
                {rolesAsignables.map(r => <option key={r.nombre} value={r.nombre}>{r.label}</option>)}
              </select>
            </Campo>
            <Campo label="Sede">
              <select value={f.sede_id} onChange={e => set('sede_id', e.target.value)} className={INPUT}>
                {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>

            <Campo label="Usuario" ayuda={editando ? 'Con el que inicia sesión.' : 'Si lo dejas vacío se genera solo.'}>
              <input value={f.username} onChange={e => set('username', e.target.value)} className={INPUT} />
            </Campo>
            <Campo label={editando ? 'Nueva contraseña' : 'Contraseña'} ayuda={editando ? 'Déjala vacía para no cambiarla.' : `Por defecto: ${CLAVE_POR_DEFECTO}`}>
              <input type="text" value={f.password} onChange={e => set('password', e.target.value)} className={INPUT} />
            </Campo>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#3d4350]">
            <input type="checkbox" checked={f.activo} onChange={e => set('activo', e.target.checked)} className="h-[16px] w-[16px] rounded border-[#cfd4dc] accent-[#f97316]" />
            Empleado activo
          </label>

          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2.5 text-[12.5px] text-[#b91c1c]">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#e8eaed] px-5 py-3.5">
          <button type="button" onClick={onCerrar} className="h-[38px] rounded-lg border border-[#e2e5ea] px-4 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            Cancelar
          </button>
          <button type="submit" disabled={guardando || subiendo} className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar empleado'}
          </button>
        </footer>
      </form>
    </div>
  );
}

const INPUT = 'h-[40px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316]';

function Campo({ label, requerido, ayuda, children }: {
  label: string; requerido?: boolean; ayuda?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
        {label}{requerido && <span className="text-[#dc2626]"> *</span>}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-[10.5px] leading-snug text-[#9ba1ab]">{ayuda}</span>}
    </label>
  );
}
