'use client';

import { Building2, Clock, Coins, Info, Store, Users } from 'lucide-react';
import type { Ajustes } from './tipos';

/** Las monedas con las que el taller trabaja de verdad. */
const MONEDAS = [
  { v: 'USD', l: 'Dólar estadounidense ($)' },
  { v: 'VES', l: 'Bolívar (Bs.)' },
  { v: 'EUR', l: 'Euro (€)' },
];

const ZONAS = [
  { v: 'America/Caracas', l: 'Caracas (GMT-4)' },
  { v: 'America/Bogota', l: 'Bogotá (GMT-5)' },
  { v: 'America/New_York', l: 'Nueva York (GMT-5/-4)' },
  { v: 'Europe/Madrid', l: 'Madrid (GMT+1/+2)' },
];

/**
 * Los datos del taller. Se guardan con el botón de la cabecera, igual que el
 * resto de la configuración: un formulario con su propio «guardar» al lado de
 * otro botón de guardar es una invitación a perder cambios.
 */
export default function PanelGeneral({
  ajustes, onAjustes, canEdit, ultimoCambio, sedes, usuarios,
}: {
  ajustes: Ajustes;
  onAjustes: (a: Ajustes) => void;
  canEdit: boolean;
  ultimoCambio: string | null;
  sedes: number;
  usuarios: number;
}) {
  const g = ajustes.general;
  const set = (patch: Partial<Ajustes['general']>) =>
    onAjustes({ ...ajustes, general: { ...g, ...patch } });

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
      <section className="rounded-xl border border-[#e8eaed] bg-white p-5 lg:col-span-2">
        <header className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
            <Store className="h-[20px] w-[20px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-[#16181d]">Datos del taller</h2>
            <p className="text-[12.5px] text-[#8a909c]">
              Aparecen en los recibos, las hojas de nómina y los reportes en PDF.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            label="Nombre del taller"
            valor={g.nombreTaller}
            onChange={v => set({ nombreTaller: v })}
            disabled={!canEdit}
            ph="Lycos Team"
            ancho
          />
          <Campo
            label="Lema"
            valor={g.lema}
            onChange={v => set({ lema: v })}
            disabled={!canEdit}
            ph="Taller automotriz"
            ancho
          />

          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[#5b616e]">
              <Coins className="h-3.5 w-3.5" aria-hidden />
              Moneda principal
            </span>
            <select
              value={g.moneda}
              onChange={e => set({ moneda: e.target.value })}
              disabled={!canEdit}
              className="h-[40px] w-full rounded-lg border border-[#e2e5ea] px-3 text-[13px] text-[#16181d] outline-none focus:border-[#f97316] disabled:opacity-60"
            >
              {MONEDAS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[#5b616e]">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Zona horaria
            </span>
            <select
              value={g.zonaHoraria}
              onChange={e => set({ zonaHoraria: e.target.value })}
              disabled={!canEdit}
              className="h-[40px] w-full rounded-lg border border-[#e2e5ea] px-3 text-[13px] text-[#16181d] outline-none focus:border-[#f97316] disabled:opacity-60"
            >
              {ZONAS.map(z => <option key={z.v} value={z.v}>{z.l}</option>)}
            </select>
          </label>
        </div>

        <p className="mt-3.5 flex items-start gap-2 rounded-lg bg-[#fafbfc] px-3 py-2.5 text-[11.5px] leading-snug text-[#8a909c]">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          La moneda principal es la de referencia de los cálculos. El motor de nómina trabaja siempre
          en dólares y convierte a bolívares con la tasa del día; cambiar esto no reescribe lo ya
          registrado.
        </p>
      </section>

      <section className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <h2 className="text-[15px] font-bold text-[#16181d]">Estado del sistema</h2>

        <dl className="mt-3.5 space-y-2.5">
          <Dato
            icono={<Building2 className="h-4 w-4" aria-hidden />}
            k="Sucursales"
            v={`${sedes} registrada${sedes === 1 ? '' : 's'}`}
          />
          <Dato
            icono={<Users className="h-4 w-4" aria-hidden />}
            k="Usuarios"
            v={`${usuarios} en el sistema`}
          />
          <Dato
            icono={<Clock className="h-4 w-4" aria-hidden />}
            k="Última configuración"
            v={ultimoCambio
              ? new Date(ultimoCambio).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
              : 'Nunca se ha guardado'}
          />
        </dl>
      </section>
    </div>
  );
}

function Campo({
  label, valor, onChange, disabled, ph, ancho,
}: {
  label: string; valor: string; onChange: (v: string) => void;
  disabled?: boolean; ph?: string; ancho?: boolean;
}) {
  return (
    <label className={ancho ? 'block sm:col-span-2' : 'block'}>
      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">{label}</span>
      <input
        value={valor}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={ph}
        className="h-[40px] w-full rounded-lg border border-[#e2e5ea] px-3 text-[13px] text-[#16181d] outline-none placeholder:text-[#c3c8d0] focus:border-[#f97316] disabled:opacity-60"
      />
    </label>
  );
}

function Dato({ icono, k, v }: { icono: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f2f3f5] text-[#5b616e]">
        {icono}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <dt className="text-[11px] text-[#8a909c]">{k}</dt>
        <dd className="num truncate text-[12.5px] font-semibold text-[#16181d]">{v}</dd>
      </span>
    </div>
  );
}
