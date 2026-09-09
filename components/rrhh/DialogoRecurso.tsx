'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecursoKey } from '@/lib/rrhh/recursos';
import { CAMPOS, TITULOS, type Campo } from './campos';
import { diasEntre, hoyISO, mensajeError, type EmpleadoRRHH, type RegistroRRHH } from './tipos';

interface Props {
  recurso: RecursoKey;
  empleados: readonly EmpleadoRRHH[];
  /** Empleado preseleccionado; solo se pide si el recurso cuelga de alguien. */
  empleadoId?: string | null;
  /** Registro existente cuando se está editando. */
  inicial?: RegistroRRHH | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const VALORES_INICIALES: Partial<Record<RecursoKey, RegistroRRHH>> = {
  asistencia: { estado: 'presente' },
  vacaciones: { estado: 'solicitada' },
  permisos: { estado: 'solicitado', tipo: 'personal', remunerado: true },
  evaluaciones: { puntaje: 4 },
  capacitaciones: { estado: 'pendiente' },
  documentos: { tipo: 'contrato' },
  reclutamiento: { estado: 'recibido' },
};

export default function DialogoRecurso({
  recurso, empleados, empleadoId, inicial, onCerrar, onGuardado,
}: Props) {
  const campos = CAMPOS[recurso];
  const pideEmpleado = recurso !== 'reclutamiento';

  const [valores, setValores] = useState<RegistroRRHH>(() => {
    const base: RegistroRRHH = { ...(VALORES_INICIALES[recurso] || {}) };
    // Las fechas arrancan en hoy: es el caso de todos los días.
    campos.forEach(c => { if (c.tipo === 'fecha' && !base[c.id]) base[c.id] = hoyISO(); });
    return { ...base, ...(inicial || {}) };
  });
  const [empleado, setEmpleado] = useState(String(inicial?.empleado_id || empleadoId || ''));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (id: string, v: string | number | boolean) => setValores(p => ({ ...p, [id]: v }));

  const dias = recurso === 'vacaciones' && valores.fecha_inicio && valores.fecha_fin
    ? diasEntre(String(valores.fecha_inicio), String(valores.fecha_fin))
    : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pideEmpleado && !empleado) { setError('Elige a un empleado.'); return; }
    for (const c of campos) {
      if (c.requerido && !valores[c.id] && valores[c.id] !== 0) {
        setError(`Falta ${c.label.toLowerCase()}.`);
        return;
      }
    }
    // Un rango al revés guardaría vacaciones de días negativos.
    if (valores.fecha_inicio && valores.fecha_fin && valores.fecha_fin < valores.fecha_inicio) {
      setError('La fecha final no puede ser anterior a la inicial.');
      return;
    }

    setGuardando(true);
    try {
      const cuerpo: RegistroRRHH = { ...valores };
      if (pideEmpleado) cuerpo.empleado_id = empleado;

      const editando = Boolean(inicial?.id);
      const res = await fetch(editando ? `/api/rrhh/${recurso}/${inicial!.id}` : `/api/rrhh/${recurso}`, {
        method: editando ? 'PATCH' : 'POST',
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
      <form
        onSubmit={guardar}
        className="flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <h2 className="min-w-0 flex-1 text-[15px] font-extrabold text-[#16181d]">
            {inicial?.id ? 'Editar' : 'Nuevo'} · {TITULOS[recurso].singular}
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {pideEmpleado && (
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Empleado</span>
              <select
                value={empleado}
                onChange={e => setEmpleado(e.target.value)}
                className="h-[40px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316]"
              >
                <option value="">Elige a un empleado…</option>
                {empleados.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}{e.cargo ? ` — ${e.cargo}` : ''}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            {campos.map(c => <CampoForm key={c.id} campo={c} valor={valores[c.id]} onChange={v => set(c.id, v)} />)}
          </div>

          {dias !== null && (
            <p className="num rounded-lg bg-[#fff4ec] px-3 py-2 text-[12px] font-medium text-[#c2410c]">
              {dias} día{dias === 1 ? '' : 's'} de vacaciones.
            </p>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2.5 text-[12.5px] text-[#b91c1c]">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#e8eaed] px-5 py-3.5">
          <button type="button" onClick={onCerrar} className="h-[38px] rounded-lg border border-[#e2e5ea] px-4 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CampoForm({ campo, valor, onChange }: {
  campo: Campo;
  valor: string | number | boolean | null | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  const base = 'h-[40px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316]';

  if (campo.tipo === 'check') {
    return (
      <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#3d4350] sm:col-span-1">
        <input type="checkbox" checked={valor === true} onChange={e => onChange(e.target.checked)} className="h-[16px] w-[16px] rounded border-[#cfd4dc] accent-[#f97316]" />
        {campo.label}
      </label>
    );
  }

  return (
    <label className={cn('block', campo.completo && 'col-span-2')}>
      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
        {campo.label}{campo.requerido && <span className="text-[#dc2626]"> *</span>}
      </span>

      {campo.tipo === 'textarea' ? (
        <textarea
          rows={2}
          value={valor === null || valor === undefined ? '' : String(valor)}
          onChange={e => onChange(e.target.value)}
          className="w-full resize-none rounded-lg border border-[#e2e5ea] px-2.5 py-2 text-[13px] outline-none focus:border-[#f97316]"
        />
      ) : campo.tipo === 'select' ? (
        <select value={valor === null || valor === undefined ? '' : String(valor)} onChange={e => onChange(e.target.value)} className={base}>
          {campo.opciones?.map(o => (
            <option key={o} value={o}>{o.replace('_', ' ')}</option>
          ))}
        </select>
      ) : (
        <input
          type={campo.tipo === 'fecha' ? 'date' : campo.tipo === 'hora' ? 'time' : campo.tipo === 'numero' ? 'number' : 'text'}
          step={campo.paso}
          min={campo.min}
          max={campo.max}
          value={valor === null || valor === undefined ? '' : String(valor)}
          onChange={e => onChange(campo.tipo === 'numero' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          className={base}
        />
      )}

      {campo.ayuda && <span className="mt-1 block text-[10.5px] text-[#9ba1ab]">{campo.ayuda}</span>}
    </label>
  );
}
