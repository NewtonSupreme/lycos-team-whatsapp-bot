'use client';

import {
  ArrowRight, ArrowUpRight, Clock, FileSpreadsheet, FileText, Settings,
  UserPlus, Wrench,
} from 'lucide-react';
import { formatoMonto, type Moneda } from './tipos';

export interface NominaCerrada {
  clave: string;
  titulo: string;
  monto: number;
  fecha: string;
  recibos: number;
  anulada: boolean;
}

export type AccionRapida =
  | 'nuevo-empleado' | 'ajuste-salarial' | 'registrar-trabajo'
  | 'generar-recibos' | 'exportar' | 'configuracion';

interface Props {
  periodoLabel: string;
  empleados: number;
  pendientes: number;
  deducciones: number;
  ultimas: readonly NominaCerrada[];
  canLiquidar: boolean;
  procesando: boolean;
  moneda: Moneda;
  tasa: number;
  onIniciarProceso: () => void;
  onAccion: (a: AccionRapida) => void;
  onVerTodas: () => void;
}

const ACCIONES: readonly { id: AccionRapida; icono: typeof UserPlus; label: string }[] = [
  { id: 'nuevo-empleado', icono: UserPlus, label: 'Nuevo empleado' },
  { id: 'ajuste-salarial', icono: Wrench, label: 'Ajuste salarial' },
  { id: 'registrar-trabajo', icono: Clock, label: 'Registrar trabajo' },
  { id: 'generar-recibos', icono: FileText, label: 'Hoja de nómina (PDF)' },
  { id: 'exportar', icono: FileSpreadsheet, label: 'Exportar a Excel' },
  { id: 'configuracion', icono: Settings, label: 'Configuración de nómina' },
];

export default function NominaRail({
  periodoLabel, empleados, pendientes, deducciones, ultimas,
  canLiquidar, procesando, moneda, tasa, onIniciarProceso, onAccion, onVerTodas,
}: Props) {
  const money = (n: number) => formatoMonto(n, moneda, tasa);

  const pasos = [
    { titulo: 'Seleccionar período', detalle: periodoLabel },
    { titulo: 'Revisar empleados', detalle: `${empleados} empleado${empleados === 1 ? '' : 's'}` },
    { titulo: 'Calcular deducciones', detalle: deducciones > 0 ? `${money(deducciones)} en adelantos` : 'Sin adelantos pendientes' },
    { titulo: 'Generar reportes', detalle: 'Recibos y resumen' },
  ];

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 lg:w-[248px]">
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <h2 className="text-[14.5px] font-bold text-[#16181d]">Procesar nómina</h2>

        <ol className="mt-3 space-y-3">
          {pasos.map((p, i) => (
            <li key={p.titulo} className="flex items-start gap-2.5">
              <span className="num flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[11.5px] font-bold text-[#3d4350]">
                {i + 1}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[12.5px] font-semibold text-[#16181d]">{p.titulo}</span>
                <span className="block text-[11px] text-[#9ba1ab]">{p.detalle}</span>
              </span>
            </li>
          ))}
        </ol>

        <button
          onClick={onIniciarProceso}
          disabled={!canLiquidar || procesando || pendientes === 0}
          title={
            !canLiquidar ? 'Solo administración y supervisión pueden liquidar'
              : pendientes === 0 ? 'No queda nadie por liquidar en este período'
                : undefined
          }
          className="mt-4 flex h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] text-[13px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[#f97316]"
        >
          {procesando ? 'Procesando…' : 'Iniciar proceso'}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </section>

      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <h2 className="text-[14.5px] font-bold text-[#16181d]">Acciones rápidas</h2>
        <ul className="mt-3 space-y-2">
          {ACCIONES.map(({ id, icono: Icono, label }) => (
            <li key={id}>
              <button
                onClick={() => onAccion(id)}
                className="flex h-[34px] w-full items-center gap-2.5 rounded-lg border border-[#eef0f3] px-2.5 text-left text-[12px] text-[#3d4350] transition-colors hover:border-[#e2e5ea] hover:bg-[#f6f7f9]"
              >
                <Icono className="h-[15px] w-[15px] shrink-0 text-[#8a909c]" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Últimas nóminas</h2>
          <button onClick={onVerTodas} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver todas
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        {ultimas.length === 0 ? (
          <p className="py-3 text-[11.5px] leading-snug text-[#9ba1ab]">
            Todavía no hay nóminas liquidadas. Al cerrar la primera aparecerá aquí.
          </p>
        ) : (
          <ul className="mt-1.5">
            {ultimas.map(u => (
              <li key={u.clave} className="flex items-start gap-2 border-b border-[#f2f3f5] py-2.5 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[12.5px] font-semibold text-[#16181d]">{u.titulo}</p>
                  <p className="num truncate text-[11.5px] text-[#8a909c]">
                    {money(u.monto)} · {u.recibos} recibo{u.recibos === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="shrink-0 text-right leading-tight">
                  <span className={`inline-block rounded-md px-2 py-[2px] text-[10.5px] font-medium ${
                    u.anulada ? 'bg-[#f2f3f5] text-[#5b616e]' : 'bg-[#e8f7ee] text-[#15803d]'
                  }`}>
                    {u.anulada ? 'Anulada' : 'Pagada'}
                  </span>
                  <p className="num mt-1 text-[10px] text-[#9ba1ab]">{u.fecha}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
