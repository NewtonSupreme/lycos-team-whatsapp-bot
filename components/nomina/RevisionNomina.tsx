'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, ExternalLink, Loader2, ShieldAlert, UserX, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * La revisión de la nómina, arriba del resumen.
 *
 * Una nómina que no avisa paga mal en silencio: comisiones que no le salen a
 * nadie porque el trabajo no está enlazado a un empleado, órdenes entregadas
 * sin mecánico, reglas en 0%, trabajos que valen más que su orden. Aquí se ve
 * todo junto, con lo que hay que hacer en cada caso.
 */

interface Fila {
  id: string; fecha: string; empleado: string; descripcion: string | null;
  ingreso: number; manoObra: number; comision: number;
  orden: { cliente: string | null; placa: string | null; vehiculo: string | null; id: string } | null;
  motivo?: string; totalOrden?: number;
}
interface Salud {
  sinEmpleado: { n: number; usd: number; lista: Fila[] };
  ordenesSinTrabajo: { n: number; usd: number; lista: Array<{ id: string; fecha: string; cliente: string | null; placa: string | null; vehiculo: string | null; total: number; encargados: string[] }> };
  comisionCero: { n: number; lista: Fila[] };
  enCurso: { n: number; usd: number; lista: Fila[] };
  sinRegla: { n: number; lista: Array<{ id: string; nombre: string; motivo: string }> };
  montoImposible: { n: number; lista: Fila[] };
}

type Clave = keyof Salud;
const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const fecha = (f?: string | null) => (f ? String(f).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—');

export default function RevisionNomina({ range, sedeId, onReconciliar }: {
  range: { inicio: string; fin: string };
  sedeId?: string | null;
  /** Lleva a la herramienta de enlazar nombres con empleados. */
  onReconciliar?: () => void;
}) {
  const [datos, setDatos] = useState<Salud | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<Clave | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams({ inicio: range.inicio, fin: range.fin });
      if (sedeId) qs.set('sede', sedeId);
      const r = await fetch(`/api/nomina/salud?${qs}`);
      if (r.ok) setDatos(await r.json());
    } finally { setCargando(false); }
  }, [range.inicio, range.fin, sedeId]);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !datos) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#e8eaed] bg-white px-4 py-3 text-[12.5px] text-[#8a909c]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando la nómina del período…
      </div>
    );
  }
  if (!datos) return null;

  const tarjetas: Array<{ clave: Clave; titulo: string; valor: string; pie: string; icono: React.ReactNode; tono: 'rojo' | 'ambar' | 'gris' }> = [
    { clave: 'sinEmpleado', titulo: 'Comisiones sin dueño', valor: String(datos.sinEmpleado.n), pie: datos.sinEmpleado.n ? `${usd(datos.sinEmpleado.usd)} que no le salen a nadie` : 'Todas tienen empleado', icono: <UserX className="h-4 w-4" aria-hidden />, tono: datos.sinEmpleado.n ? 'rojo' : 'gris' },
    { clave: 'ordenesSinTrabajo', titulo: 'Órdenes sin mecánico', valor: String(datos.ordenesSinTrabajo.n), pie: datos.ordenesSinTrabajo.n ? `${usd(datos.ordenesSinTrabajo.usd)} entregados sin comisión` : 'Todas tienen mecánico', icono: <Wrench className="h-4 w-4" aria-hidden />, tono: datos.ordenesSinTrabajo.n ? 'rojo' : 'gris' },
    { clave: 'comisionCero', titulo: 'Comisión en $0', valor: String(datos.comisionCero.n), pie: datos.comisionCero.n ? 'Regla en 0% o sin regla' : 'Ninguna', icono: <AlertTriangle className="h-4 w-4" aria-hidden />, tono: datos.comisionCero.n ? 'ambar' : 'gris' },
    { clave: 'sinRegla', titulo: 'Mecánicos sin regla', valor: String(datos.sinRegla.n), pie: datos.sinRegla.n ? 'Hay que definir su comisión' : 'Todos tienen regla', icono: <ShieldAlert className="h-4 w-4" aria-hidden />, tono: datos.sinRegla.n ? 'ambar' : 'gris' },
    { clave: 'montoImposible', titulo: 'Montos imposibles', valor: String(datos.montoImposible.n), pie: datos.montoImposible.n ? 'Valen más que su orden' : 'Ninguno', icono: <AlertTriangle className="h-4 w-4" aria-hidden />, tono: datos.montoImposible.n ? 'rojo' : 'gris' },
    { clave: 'enCurso', titulo: 'En curso', valor: usd(datos.enCurso.usd), pie: `${datos.enCurso.n} trabajo(s): se pagan al entregar`, icono: <Clock className="h-4 w-4" aria-hidden />, tono: 'gris' },
  ];
  const problemas = datos.sinEmpleado.n + datos.ordenesSinTrabajo.n + datos.comisionCero.n + datos.sinRegla.n + datos.montoImposible.n;

  return (
    <section className="rounded-xl border border-[#e8eaed] bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {problemas ? <AlertTriangle className="h-4 w-4 text-[#d97706]" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-[#16a34a]" aria-hidden />}
        <h2 className="text-[13.5px] font-bold text-[#16181d]">Revisión de la nómina</h2>
        <span className="text-[11.5px] text-[#8a909c]">
          {problemas ? `${problemas} cosa(s) que revisar antes de liquidar` : 'Todo en orden para liquidar'}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 xl:grid-cols-6">
        {tarjetas.map(t => (
          <button
            key={t.clave}
            type="button"
            onClick={() => setAbierta(abierta === t.clave ? null : t.clave)}
            aria-expanded={abierta === t.clave}
            className={cn(
              'rounded-lg border p-2.5 text-left transition-colors',
              abierta === t.clave ? 'border-[#f97316] bg-[#fff8f2]' : 'border-[#eef0f3] hover:bg-[#fafbfc]',
            )}
          >
            <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold',
              t.tono === 'rojo' ? 'text-[#dc2626]' : t.tono === 'ambar' ? 'text-[#b45309]' : 'text-[#5b616e]')}>
              {t.icono}{t.titulo}
              <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', abierta === t.clave && 'rotate-180')} aria-hidden />
            </span>
            <span className="num mt-1 block text-[18px] font-extrabold text-[#16181d]">{t.valor}</span>
            <span className="block text-[10.5px] leading-tight text-[#9ba1ab]">{t.pie}</span>
          </button>
        ))}
      </div>

      {abierta && (
        <div className="border-t border-[#eef0f3] px-4 py-3">
          {abierta === 'sinEmpleado' && onReconciliar && datos.sinEmpleado.n > 0 && (
            <button type="button" onClick={onReconciliar}
              className="mb-2 rounded-lg bg-[#f97316] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#ea580c]">
              Enlazar nombres con empleados
            </button>
          )}
          <Lista clave={abierta} datos={datos} />
        </div>
      )}
    </section>
  );
}

function EnlaceOrden({ id, texto }: { id?: string | null; texto: string }) {
  if (!id) return <span>{texto}</span>;
  return (
    <Link href={`/dashboard/servicios?id=${id}`} className="inline-flex items-center gap-1 font-semibold text-[#2563eb] hover:underline">
      {texto} <ExternalLink className="h-3 w-3" aria-hidden />
    </Link>
  );
}

function Lista({ clave, datos }: { clave: Clave; datos: Salud }) {
  const vacio = <p className="py-2 text-[12px] text-[#8a909c]">Nada en este período.</p>;
  const li = 'flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[12px]';
  if (clave === 'sinRegla') {
    return datos.sinRegla.n ? (
      <ul className="divide-y divide-[#f2f3f5]">
        {datos.sinRegla.lista.map(u => (
          <li key={u.id} className={li}>
            <span className="font-semibold text-[#16181d]">{u.nombre}</span>
            <span className="text-[#b45309]">{u.motivo}</span>
          </li>
        ))}
      </ul>
    ) : vacio;
  }
  if (clave === 'ordenesSinTrabajo') {
    return datos.ordenesSinTrabajo.n ? (
      <ul className="divide-y divide-[#f2f3f5]">
        {datos.ordenesSinTrabajo.lista.map(o => (
          <li key={o.id} className={li}>
            <span className="num w-12 text-[#8a909c]">{fecha(o.fecha)}</span>
            <EnlaceOrden id={o.id} texto={`${o.cliente || 'Cliente'}${o.placa ? ` · ${o.placa}` : ''}`} />
            <span className="truncate text-[#8a909c]">{o.vehiculo || ''}</span>
            <span className="num ml-auto font-bold text-[#16181d]">{usd(o.total)}</span>
            <span className="w-full text-[11px] text-[#b45309]">
              {o.encargados.length ? `Las notas dicen: ${o.encargados.join(', ')} — asígnalo en la orden` : 'Nadie anotado como encargado'}
            </span>
          </li>
        ))}
      </ul>
    ) : vacio;
  }
  const lista = (datos[clave] as { lista: Fila[] }).lista;
  return lista.length ? (
    <ul className="divide-y divide-[#f2f3f5]">
      {lista.map(j => (
        <li key={j.id} className={li}>
          <span className="num w-12 text-[#8a909c]">{fecha(j.fecha)}</span>
          <span className="font-semibold text-[#16181d]">{j.empleado}</span>
          <span className="min-w-0 flex-1 truncate text-[#5b616e]">{j.descripcion || 'Trabajo'}</span>
          {j.orden && <EnlaceOrden id={j.orden.id} texto={`${j.orden.cliente || 'Orden'}${j.orden.placa ? ` · ${j.orden.placa}` : ''}`} />}
          <span className="num text-[#5b616e]">m.o. {usd(j.manoObra)}</span>
          <span className="num font-bold text-[#16181d]">{usd(j.comision)}</span>
          {j.motivo && <span className="w-full text-[11px] text-[#b45309]">{j.motivo}</span>}
          {j.totalOrden != null && <span className="w-full text-[11px] text-[#dc2626]">La orden entera vale {usd(j.totalOrden)}</span>}
        </li>
      ))}
    </ul>
  ) : vacio;
}
