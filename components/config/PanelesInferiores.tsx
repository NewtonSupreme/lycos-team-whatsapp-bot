'use client';

import { ArrowRight, Check, ChevronDown, Fingerprint, KeyRound, Lock, ShieldAlert, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import Avatar from '@/components/rrhh/Avatar';
import { cuando, type Ajustes } from './tipos';

export interface EventoActividad {
  id: string;
  usuario: string;
  accion: string;
  modulo: string | null;
  created_at: string;
  foto?: string | null;
}

interface Props {
  actividad: readonly EventoActividad[];
  ajustes: Ajustes;
  onAjustes: (a: Ajustes) => void;
  canEdit: boolean;
  onVerActividad: () => void;
}

/** Minutos que se pueden elegir para que caduque la sesión. */
const EXPIRACIONES = [
  { v: 30, l: '30 minutos' },
  { v: 60, l: '1 hora' },
  { v: 120, l: '2 horas' },
  { v: 480, l: '8 horas' },
  { v: 1440, l: '24 horas' },
  { v: 0, l: 'No caduca' },
];

/**
 * Las tres tarjetas del pie: qué ha pasado, cómo se protege la cuenta y qué
 * exige una contraseña.
 *
 * Los interruptores y la política escriben en el estado del padre, que es quien
 * guarda. Antes vivían solo aquí y al recargar la página volvían a su valor por
 * defecto: se movían, pero no recordaban nada.
 */
export default function PanelesInferiores({
  actividad, ajustes, onAjustes, canEdit, onVerActividad,
}: Props) {
  const seg = ajustes.seguridad;
  const pwd = ajustes.contrasenas;

  const setSeg = (patch: Partial<Ajustes['seguridad']>) =>
    onAjustes({ ...ajustes, seguridad: { ...seg, ...patch } });
  const setPwd = (patch: Partial<Ajustes['contrasenas']>) =>
    onAjustes({ ...ajustes, contrasenas: { ...pwd, ...patch } });

  const reglas = [
    { on: pwd.minimoCaracteres > 0, label: `Mínimo ${pwd.minimoCaracteres} caracteres`, campo: 'min' as const },
    { on: pwd.exigeMayuscula, label: 'Una letra mayúscula (A-Z)', campo: 'may' as const },
    { on: pwd.exigeMinuscula, label: 'Una letra minúscula (a-z)', campo: 'min2' as const },
    { on: pwd.exigeNumero, label: 'Un número (0-9)', campo: 'num' as const },
    { on: pwd.exigeEspecial, label: 'Un carácter especial (!@#$%)', campo: 'esp' as const },
  ];

  const alternarRegla = (campo: string) => {
    if (!canEdit) return;
    if (campo === 'may') setPwd({ exigeMayuscula: !pwd.exigeMayuscula });
    if (campo === 'min2') setPwd({ exigeMinuscula: !pwd.exigeMinuscula });
    if (campo === 'num') setPwd({ exigeNumero: !pwd.exigeNumero });
    if (campo === 'esp') setPwd({ exigeEspecial: !pwd.exigeEspecial });
  };

  return (
    <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
      {/* ── Actividad reciente ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
        <header className="flex items-center gap-2 px-4 pb-2 pt-4">
          <Activity className="h-4 w-4 text-[#f97316]" aria-hidden />
          <h2 className="flex-1 text-[14px] font-bold text-[#16181d]">Actividad reciente</h2>
          <button
            onClick={onVerActividad}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[#f97316] hover:underline"
          >
            Ver toda
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        {actividad.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-[#8a909c]">Sin actividad registrada.</p>
        ) : (
          <ul className="px-2 pb-3">
            {actividad.slice(0, 5).map(e => (
              <li key={e.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <Avatar nombre={e.usuario} url={e.foto} size={30} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{e.usuario}</span>
                  <span className="block truncate text-[11px] text-[#8a909c]">{e.accion}</span>
                </span>
                <span className="num shrink-0 text-[11px] text-[#9ba1ab]">{cuando(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Seguridad de la cuenta ─────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <header className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[#f97316]" aria-hidden />
          <h2 className="text-[14px] font-bold text-[#16181d]">Seguridad de la cuenta</h2>
        </header>

        <ul className="space-y-2.5">
          <Interruptor
            icono={<Fingerprint className="h-[15px] w-[15px]" aria-hidden />}
            titulo="Autenticación en dos pasos (2FA)"
            pie="Añade una capa extra de seguridad"
            on={seg.dosFactores}
            disabled={!canEdit}
            onChange={v => setSeg({ dosFactores: v })}
          />
          <Interruptor
            icono={<KeyRound className="h-[15px] w-[15px]" aria-hidden />}
            titulo="Notificaciones de inicio de sesión"
            pie="Recibe alertas por nuevos accesos"
            on={seg.avisoInicioSesion}
            disabled={!canEdit}
            onChange={v => setSeg({ avisoInicioSesion: v })}
          />
          <Interruptor
            icono={<Lock className="h-[15px] w-[15px]" aria-hidden />}
            titulo="Bloqueo por intentos fallidos"
            pie={`Bloquea automáticamente después de ${seg.intentosMaximos} intentos`}
            on={seg.bloqueoPorIntentos}
            disabled={!canEdit}
            onChange={v => setSeg({ bloqueoPorIntentos: v })}
          />
        </ul>

        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[#eef0f3] bg-[#fafbfc] px-3 py-2.5">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[12.5px] font-medium text-[#16181d]">Sesión expira en</span>
            <span className="block text-[11px] text-[#8a909c]">Tiempo de inactividad</span>
          </span>
          <div className="relative shrink-0">
            <select
              value={seg.expiraEnMinutos}
              onChange={e => setSeg({ expiraEnMinutos: Number(e.target.value) })}
              disabled={!canEdit}
              aria-label="Tiempo de expiración de la sesión"
              className="h-[34px] appearance-none rounded-lg border border-[#e2e5ea] bg-white pl-3 pr-8 text-[12.5px] font-medium text-[#16181d] outline-none focus:border-[#f97316] disabled:opacity-50"
            >
              {EXPIRACIONES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
          </div>
        </div>
      </section>

      {/* ── Política de contraseñas ────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
        <header className="mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#f97316]" aria-hidden />
          <h2 className="flex-1 text-[14px] font-bold text-[#16181d]">Política de contraseñas</h2>
        </header>

        <ul className="space-y-2">
          {reglas.map(r => (
            <li key={r.label}>
              <button
                onClick={() => alternarRegla(r.campo)}
                disabled={!canEdit || r.campo === 'min'}
                aria-pressed={r.on}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors',
                  canEdit && r.campo !== 'min' && 'hover:bg-[#fafbfc]',
                )}
              >
                <span className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                  r.on ? 'bg-[#e8f7ee] text-[#16a34a]' : 'bg-[#f2f3f5] text-[#c3c8d0]',
                )}>
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                <span className={cn('text-[12.5px]', r.on ? 'text-[#3d4350]' : 'text-[#9ba1ab] line-through')}>
                  {r.label}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[#eef0f3] bg-[#fafbfc] px-3 py-2">
          <label htmlFor="min-caracteres" className="min-w-0 flex-1 text-[12.5px] font-medium text-[#16181d]">
            Longitud mínima
          </label>
          <input
            id="min-caracteres"
            type="number" min={4} max={64}
            value={pwd.minimoCaracteres}
            onChange={e => setPwd({ minimoCaracteres: Math.max(4, Math.min(64, Number(e.target.value) || 8)) })}
            disabled={!canEdit}
            className="num h-[32px] w-[72px] rounded-md border border-[#e2e5ea] bg-white px-2 text-right text-[12.5px] font-semibold outline-none focus:border-[#f97316] disabled:opacity-50"
          />
        </div>

        <p className="mt-2 text-[11px] leading-snug text-[#9ba1ab]">
          La política se aplica al crear o cambiar una contraseña. No fuerza a cambiar las que ya existen.
        </p>
      </section>
    </div>
  );
}

function Interruptor({
  icono, titulo, pie, on, onChange, disabled,
}: {
  icono: React.ReactNode; titulo: string; pie: string;
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f2f3f5] text-[#5b616e]">
        {icono}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[12.5px] font-medium text-[#16181d]">{titulo}</span>
        <span className="block truncate text-[11px] text-[#8a909c]">{pie}</span>
      </span>
      <button
        onClick={() => !disabled && onChange(!on)}
        disabled={disabled}
        role="switch"
        aria-checked={on}
        aria-label={titulo}
        className={cn(
          'relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors disabled:opacity-50',
          on ? 'bg-[#16a34a]' : 'bg-[#d4d8de]',
        )}
      >
        <span className={cn(
          'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-[21px]' : 'translate-x-[3px]',
        )} />
      </button>
    </li>
  );
}
