'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDownCircle, Car, Eye, FileDown, Pencil, Plus, ScanLine, Search, Trash2, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LogoBanco from '@/components/pagos/LogoBanco';
import { BANK_METHODS, binToUSD, emptyBins, type BankBin } from '@/lib/reporte/ventas-mapping';
import { montoConMoneda, nombreDeLinea, resumenCorto } from '@/lib/pagos/desglose';
import {
  CATEGORIAS_EGRESO, ORIGENES, conceptoDe, cuentasDe, debeDe, etiquetaCategoria, grupoDe, lineasDeEgreso,
  pagadoDe, type EgresoFila, type GrupoEgreso,
} from '@/components/egresos/tipos';

/**
 * La pestaña de Egresos de Reportes.
 *
 * Era una tabla de fecha, monto, categoría y «pagado a». No decía si el gasto
 * estaba pagado o fiado, ni de qué cuenta salió, ni de qué carro era, ni si
 * venía de la ficha, de una orden de compra o de un registro a mano. Con lo
 * que se ha construido desde entonces —deuda con proveedores, gasto por
 * vehículo, pago por cuenta— la tabla se había quedado contando la mitad.
 *
 * Ahora responde las preguntas del cierre: cuánto se gastó, cuánto salió de
 * verdad y cuánto se debe; de qué cuenta salió cada bolívar y cada dólar; y en
 * qué se fue.
 */

interface Props {
  egresos: EgresoFila[];
  cargando: boolean;
  periodo: string;
  puedeEliminar: boolean;
  onNuevo: () => void;
  onEscanear: () => void;
  onEditar: (e: EgresoFila) => void;
  onVer: (e: EgresoFila) => void;
  onPdf: (e: EgresoFila) => void;
  onEliminar: (e: EgresoFila) => void;
}

type FiltroEstado = 'todos' | 'pagados' | 'deuda' | 'sin_cuenta';

const usd = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) =>
  new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });

/** Sin cuenta: salió dinero y no consta de dónde. Es el hueco que hay que cerrar. */
const sinCuenta = (e: EgresoFila) =>
  pagadoDe(e) > 0 && Object.values(cuentasDe(e)).every(v => v <= 0);

export default function VistaEgresos({
  egresos, cargando, periodo, puedeEliminar,
  onNuevo, onEscanear, onEditar, onVer, onPdf, onEliminar,
}: Props) {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState<string>('todas');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  // Costos de los carros o gastos del taller: no se leen igual y no se suman juntos.
  const [grupo, setGrupo] = useState<GrupoEgreso | 'todos'>('todos');

  const resumen = useMemo(() => {
    const total = egresos.reduce((s, e) => s + (Number(e.total_egresos) || 0), 0);
    const pagado = egresos.reduce((s, e) => s + pagadoDe(e), 0);
    const debe = egresos.reduce((s, e) => s + debeDe(e), 0);
    const huecos = egresos.filter(sinCuenta);

    // Lo que salió de cada cuenta, en su moneda y en dólares.
    const porCuenta = emptyBins();
    const porCuentaUSD: Record<string, number> = {};
    for (const e of egresos) {
      const b = cuentasDe(e);
      const t = Number(e.tasa_cambio) || 0;
      for (const m of BANK_METHODS) {
        if (b[m.id] > 0) {
          porCuenta[m.id] += b[m.id];
          porCuentaUSD[m.id] = (porCuentaUSD[m.id] || 0) + binToUSD(m.id, b[m.id], t);
        }
      }
    }
    const cuentas = BANK_METHODS
      .filter(m => porCuenta[m.id] > 0)
      .map(m => ({ meta: m, monto: porCuenta[m.id], usd: porCuentaUSD[m.id] || 0 }))
      .sort((a, b) => b.usd - a.usd);

    const porCategoria = new Map<string, number>();
    for (const e of egresos) {
      porCategoria.set(e.categoria || 'otro', (porCategoria.get(e.categoria || 'otro') || 0) + (Number(e.total_egresos) || 0));
    }
    const categorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
    const enGrupo = (g: GrupoEgreso) => egresos.filter(e => grupoDe(e) === g)
      .reduce((s, e) => s + (Number(e.total_egresos) || 0), 0);
    const carros = enGrupo('carros');
    const taller = enGrupo('taller');
    // Las categorías de cada grupo, con lo que suman.
    const catGrupo = (g: GrupoEgreso) => {
      const m = new Map<string, number>();
      for (const e of egresos.filter(x => grupoDe(x) === g)) {
        const k = e.categoria || 'otro';
        m.set(k, (m.get(k) || 0) + (Number(e.total_egresos) || 0));
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    return { total, pagado, debe, huecos, cuentas, categorias, carros, taller, catCarros: catGrupo('carros'), catTaller: catGrupo('taller') };
  }, [egresos]);

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return egresos.filter(e => {
      if (grupo !== 'todos' && grupoDe(e) !== grupo) return false;
      if (categoria !== 'todas' && (e.categoria || 'otro') !== categoria) return false;
      if (estado === 'pagados' && debeDe(e) > 0) return false;
      if (estado === 'deuda' && debeDe(e) <= 0) return false;
      if (estado === 'sin_cuenta' && !sinCuenta(e)) return false;
      if (!q) return true;
      return [conceptoDe(e), e.proveedor, e.cliente, e.placa, e.vehiculo_info, e.cliente_nombre, e.notas]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [egresos, texto, categoria, estado, grupo]);

  const totalFiltrado = filtrados.reduce((s, e) => s + (Number(e.total_egresos) || 0), 0);
  const maxCuenta = Math.max(1, ...resumen.cuentas.map(c => c.usd));
  const maxCategoria = Math.max(1, ...resumen.categorias.map(([, v]) => v));

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-[#e8eaed] bg-white py-16 text-[13px] text-[#8a909c]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" aria-hidden />
        Cargando gastos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold text-foreground">Egresos</h2>
          <p className="text-[12px] text-muted-foreground">{periodo} · {egresos.length} gastos registrados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onEscanear} className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            <ScanLine className="h-4 w-4" aria-hidden /> Escanear factura
          </button>
          <button onClick={onNuevo} className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]">
            <Plus className="h-4 w-4" aria-hidden /> Registrar gasto
          </button>
        </div>
      </div>

      {/* Cifras del período */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Gastado en el período" valor={usd(resumen.total)} tono="rojo"
          nota={`Carros ${usd(resumen.carros)} · Taller ${usd(resumen.taller)}`} />
        <Cifra titulo="Salió de caja" valor={usd(resumen.pagado)} tono="verde"
          nota="Lo pagado de verdad" />
        <Cifra titulo="Se les debe a proveedores" valor={usd(resumen.debe)} tono="ambar"
          nota={resumen.debe > 0 ? 'Fiado o abonado a medias' : 'Nada pendiente'}
          onClick={resumen.debe > 0 ? () => setEstado('deuda') : undefined} />
        <Cifra titulo="Pagos sin cuenta" valor={String(resumen.huecos.length)} tono={resumen.huecos.length ? 'ambar' : 'gris'}
          nota={resumen.huecos.length ? 'No consta de qué banco salió' : 'Todo con su cuenta'}
          onClick={resumen.huecos.length ? () => setEstado('sin_cuenta') : undefined} />
      </div>

      {/* De dónde salió y en qué se fue */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
          <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-[#16181d]">
            <Wallet className="h-4 w-4 text-[#f97316]" aria-hidden /> Salidas por cuenta
          </h3>
          <p className="mb-3 text-[11.5px] text-[#8a909c]">Cada cuenta en su moneda, con su equivalente en dólares.</p>
          {resumen.cuentas.length === 0 ? (
            <p className="rounded-lg bg-[#fafbfc] px-3 py-4 text-center text-[12px] text-[#8a909c]">
              Ningún gasto del período dice todavía de qué cuenta salió.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {resumen.cuentas.map(c => (
                <li key={c.meta.id}>
                  <div className="flex items-center gap-2">
                    <LogoBanco id={c.meta.id as BankBin} size={22} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#16181d]">{c.meta.label}</span>
                    <span className="num text-right text-[12.5px] font-bold text-[#16181d]">
                      {montoConMoneda(c.monto, c.meta.moneda)}
                      {c.meta.moneda === 'Bs' && <span className="ml-1.5 font-normal text-[#8a909c]">{usd(c.usd)}</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f2f3f5]">
                    <div className="h-full rounded-full bg-[#f97316]" style={{ width: `${Math.max(3, (c.usd / maxCuenta) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
          <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-[#16181d]">
            <ArrowDownCircle className="h-4 w-4 text-[#dc2626]" aria-hidden /> En qué se fue
          </h3>
          <p className="mb-3 text-[11.5px] text-[#8a909c]">Toca una categoría para ver solo esos gastos.</p>
          {resumen.categorias.length === 0 ? (
            <p className="rounded-lg bg-[#fafbfc] px-3 py-4 text-center text-[12px] text-[#8a909c]">Sin gastos en el período.</p>
          ) : (
            <div className="space-y-3">
              {([
                ['carros', 'Costos de los carros', 'Piezas, insumos y trabajos de terceros de cada vehículo', resumen.carros, resumen.catCarros],
                ['taller', 'Gastos del taller', 'Luz, agua, alquiler, nómina, herramientas, transporte', resumen.taller, resumen.catTaller],
              ] as const).map(([g, titulo, ayuda, suma, cats]) => (
                <div key={g}>
                  <button
                    type="button"
                    onClick={() => { setGrupo(grupo === g ? 'todos' : g); setCategoria('todas'); }}
                    aria-pressed={grupo === g}
                    className={cn('mb-1 flex w-full items-baseline justify-between rounded-md px-2 py-1 text-left',
                      grupo === g ? 'bg-[#fff4ec]' : 'hover:bg-[#fafbfc]')}
                  >
                    <span>
                      <span className="text-[12px] font-bold text-[#16181d]">{titulo}</span>
                      <span className="ml-1.5 text-[10.5px] text-[#9ba1ab]">{ayuda}</span>
                    </span>
                    <span className="num text-[12.5px] font-extrabold text-[#16181d]">{usd(suma)}</span>
                  </button>
                  {cats.length === 0 ? (
                    <p className="px-2 text-[11px] text-[#9ba1ab]">Nada en el período.</p>
                  ) : (
                    <ul className="space-y-1">
                      {cats.map(([cat, monto]) => (
                        <li key={cat}>
                          <button
                            onClick={() => setCategoria(categoria === cat ? 'todas' : cat)}
                            aria-pressed={categoria === cat}
                            className={cn('w-full rounded-lg px-2 py-1 text-left transition-colors',
                              categoria === cat ? 'bg-[#fff4ec]' : 'hover:bg-[#fafbfc]')}
                          >
                            <span className="flex items-center justify-between text-[12px]">
                              <span className="text-[#3d4350]">{etiquetaCategoria(cat)}</span>
                              <span className="num font-semibold text-[#16181d]">
                                {usd(monto)}
                                <span className="ml-1.5 font-normal text-[#8a909c]">{Math.round((monto / (resumen.total || 1)) * 100)}%</span>
                              </span>
                            </span>
                            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-[#f2f3f5]">
                              <span className={cn('block h-full rounded-full', g === 'carros' ? 'bg-[#f97316]/70' : 'bg-[#2563eb]/60')}
                                style={{ width: `${Math.max(3, (monto / maxCategoria) * 100)}%` }} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e8eaed] bg-white p-2.5">
        <label className="flex h-[36px] min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#e2e5ea] px-2.5">
          <Search className="h-4 w-4 text-[#9ba1ab]" aria-hidden />
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar concepto, proveedor, placa…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
          />
        </label>
        <select
          value={grupo}
          onChange={e => { setGrupo(e.target.value as GrupoEgreso | 'todos'); setCategoria('todas'); }}
          aria-label="Grupo"
          className="h-[36px] rounded-lg border border-[#e2e5ea] bg-white px-2 text-[12.5px] text-[#3d4350]"
        >
          <option value="todos">Carros y taller</option>
          <option value="carros">Costos de los carros</option>
          <option value="taller">Gastos del taller</option>
        </select>
        <select
          value={categoria}
          onChange={e => setCategoria(e.target.value)}
          aria-label="Categoría"
          className="h-[36px] rounded-lg border border-[#e2e5ea] bg-white px-2 text-[12.5px] text-[#3d4350]"
        >
          <option value="todas">Todas las categorías</option>
          {CATEGORIAS_EGRESO.filter(c => grupo === 'todos' || c.grupo === grupo)
            .map(c => <option key={c.id} value={c.id}>{etiquetaCategoria(c.id)}</option>)}
        </select>
        <div className="flex rounded-lg bg-[#f2f3f5] p-0.5" role="tablist">
          {([['todos', 'Todos'], ['pagados', 'Pagados'], ['deuda', 'Se deben'], ['sin_cuenta', 'Sin cuenta']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={estado === id}
              onClick={() => setEstado(id)}
              className={cn(
                'h-[32px] rounded-md px-2.5 text-[12px] font-medium transition-colors',
                estado === id ? 'bg-white text-[#16181d] shadow-sm' : 'text-[#5b616e] hover:text-[#16181d]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-[#e2e5ea] bg-white py-14 text-center">
          <ArrowDownCircle className="mb-2 h-9 w-9 text-[#d4d7dd]" aria-hidden />
          <p className="text-[13px] font-semibold text-[#16181d]">
            {egresos.length ? 'Ningún gasto coincide con el filtro' : 'Sin gastos en el período'}
          </p>
          <p className="mt-1 text-[12px] text-[#8a909c]">
            {egresos.length ? 'Prueba con otro texto o quita los filtros.' : 'Registra el primero con «Registrar gasto».'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
          {/* Tabla en pantallas anchas */}
          <table className="hidden w-full text-[12.5px] md:table">
            <thead>
              <tr className="border-b border-[#eef0f3] bg-[#fafbfc] text-left text-[11px] font-semibold uppercase tracking-wide text-[#8a909c]">
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Concepto</th>
                <th className="px-3 py-2.5">Proveedor</th>
                <th className="px-3 py-2.5">Vehículo</th>
                <th className="px-3 py-2.5">Pagado desde</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5 text-right">Monto</th>
                <th className="px-3 py-2.5" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(e => (
                <FilaTabla key={e.id} e={e} puedeEliminar={puedeEliminar}
                  onEditar={onEditar} onVer={onVer} onPdf={onPdf} onEliminar={onEliminar} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#eef0f3] bg-[#fafbfc]">
                <td colSpan={6} className="px-3 py-2.5 text-[12px] font-medium text-[#5b616e]">
                  {filtrados.length === egresos.length ? 'Total del período' : `Total de ${filtrados.length} gastos filtrados`}
                </td>
                <td className="num px-3 py-2.5 text-right text-[13px] font-extrabold text-[#dc2626]">{usd(totalFiltrado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          {/* Tarjetas en el teléfono */}
          <ul className="divide-y divide-[#eef0f3] md:hidden">
            {filtrados.map(e => (
              <TarjetaEgreso key={e.id} e={e} puedeEliminar={puedeEliminar}
                onEditar={onEditar} onVer={onVer} onPdf={onPdf} onEliminar={onEliminar} />
            ))}
            <li className="flex items-center justify-between bg-[#fafbfc] px-3 py-2.5 text-[12.5px]">
              <span className="font-medium text-[#5b616e]">Total</span>
              <strong className="num text-[#dc2626]">{usd(totalFiltrado)}</strong>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota, tono, onClick }: {
  titulo: string; valor: string; nota: string;
  tono: 'rojo' | 'verde' | 'ambar' | 'gris';
  onClick?: () => void;
}) {
  const color = { rojo: 'text-[#dc2626]', verde: 'text-[#15803d]', ambar: 'text-[#b45309]', gris: 'text-[#16181d]' }[tono];
  const Cuerpo = onClick ? 'button' : 'div';
  return (
    <Cuerpo
      onClick={onClick}
      className={cn(
        'rounded-xl border border-[#e8eaed] bg-white p-3.5 text-left',
        onClick && 'transition-colors hover:border-[#f97316]',
      )}
    >
      <p className="text-[11.5px] font-medium text-[#8a909c]">{titulo}</p>
      <p className={cn('num mt-1 text-[20px] font-extrabold leading-none', color)}>{valor}</p>
      <p className="mt-1.5 text-[11px] text-[#9ba1ab]">{nota}</p>
    </Cuerpo>
  );
}

interface FilaProps {
  e: EgresoFila;
  puedeEliminar: boolean;
  onEditar: (e: EgresoFila) => void;
  onVer: (e: EgresoFila) => void;
  onPdf: (e: EgresoFila) => void;
  onEliminar: (e: EgresoFila) => void;
}

/** Un gasto de la ficha se corrige en la ficha: aquí se le cambiaría solo la mitad. */
const deLaFicha = (e: EgresoFila) => e.origen === 'ficha_vehiculo' || Boolean(e.partida_id);
const deOrdenCompra = (e: EgresoFila) => e.origen === 'orden_compra' || Boolean(e.orden_compra_id);

function Estado({ e }: { e: EgresoFila }) {
  const debe = debeDe(e);
  if (debe <= 0) {
    return <span className="rounded-md bg-[#e8f7ee] px-1.5 py-0.5 text-[11px] font-semibold text-[#15803d]">Pagado</span>;
  }
  const vencido = e.fecha_vencimiento && e.fecha_vencimiento < new Date().toISOString().slice(0, 10);
  return (
    <span className="flex flex-col">
      <span className={cn(
        'w-fit rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        vencido ? 'bg-[#fdeaea] text-[#b91c1c]' : 'bg-[#fff4ec] text-[#c2410c]',
      )}>
        {e.estado_pago === 'parcial' ? 'Abonado' : 'Se debe'} {usd(debe)}
      </span>
      {e.fecha_vencimiento && (
        <span className={cn('mt-0.5 text-[10.5px]', vencido ? 'font-semibold text-[#b91c1c]' : 'text-[#9ba1ab]')}>
          {vencido ? 'Venció' : 'Vence'} {fechaCorta(e.fecha_vencimiento)}
        </span>
      )}
    </span>
  );
}

function PagadoDesde({ e }: { e: EgresoFila }) {
  const lineas = lineasDeEgreso(e);
  if (lineas.length === 0) {
    if (pagadoDe(e) <= 0) return <span className="text-[#c4c8cf]">—</span>;
    return (
      <span className="flex items-center gap-1 text-[11.5px] font-medium text-[#b45309]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Sin cuenta
      </span>
    );
  }
  const detalle = lineas.map(l => `${nombreDeLinea(l)}: ${montoConMoneda(l.monto, l.moneda)}`).join('\n');
  return (
    <span className="flex items-center gap-1.5" title={detalle}>
      <span className="flex -space-x-1">
        {lineas.slice(0, 3).map(l => (
          <LogoBanco key={String(l.cuenta)} id={l.cuenta as BankBin} size={18} />
        ))}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block max-w-[170px] truncate text-[11.5px] font-medium text-[#16181d]">{resumenCorto(lineas)}</span>
        {lineas.length === 1 && lineas[0].moneda === 'Bs' && (
          <span className="num block text-[10.5px] text-[#8a909c]">{montoConMoneda(lineas[0].monto, 'Bs')}</span>
        )}
      </span>
    </span>
  );
}

function Acciones({ e, puedeEliminar, onEditar, onVer, onPdf, onEliminar }: FilaProps) {
  const ficha = deLaFicha(e);
  const btn = 'flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#5b616e] hover:bg-[#f2f3f5]';
  return (
    <span className="flex items-center justify-end gap-0.5">
      <button onClick={() => onVer(e)} className={btn} title="Ver el gasto" aria-label="Ver el gasto">
        <Eye className="h-4 w-4" aria-hidden />
      </button>
      <button onClick={() => onPdf(e)} className={btn} title="Descargar comprobante" aria-label="Descargar comprobante">
        <FileDown className="h-4 w-4" aria-hidden />
      </button>
      {ficha && e.placa ? (
        <Link
          href={`/dashboard/ficha?placa=${encodeURIComponent(e.placa)}`}
          className={btn}
          title="Se corrige desde la ficha del vehículo"
          aria-label="Abrir en la ficha del vehículo"
        >
          <Car className="h-4 w-4" aria-hidden />
        </Link>
      ) : !deOrdenCompra(e) && (
        <button onClick={() => onEditar(e)} className={btn} title="Corregir" aria-label="Corregir el gasto">
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      )}
      {puedeEliminar && !ficha && !deOrdenCompra(e) && (
        <button onClick={() => onEliminar(e)} className={cn(btn, 'hover:bg-[#fdeaea] hover:text-[#dc2626]')} title="Eliminar" aria-label="Eliminar el gasto">
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      )}
    </span>
  );
}

function Origen({ e }: { e: EgresoFila }) {
  const o = e.origen || 'panel';
  return <span className="text-[10.5px] text-[#9ba1ab]">{ORIGENES[o] || o}</span>;
}

function FilaTabla(p: FilaProps) {
  const { e } = p;
  return (
    <tr className="border-b border-[#f2f3f5] align-top hover:bg-[#fafbfc]">
      <td className="num whitespace-nowrap px-3 py-2.5 text-[#5b616e]">{fechaCorta(e.fecha)}</td>
      <td className="max-w-[260px] px-3 py-2.5">
        <p className="truncate font-medium text-[#16181d]" title={conceptoDe(e)}>{conceptoDe(e)}</p>
        <p className="flex gap-1.5"><span className="text-[10.5px] text-[#8a909c]">{etiquetaCategoria(e.categoria)}</span>·<Origen e={e} /></p>
      </td>
      <td className="max-w-[160px] truncate px-3 py-2.5 text-[#3d4350]">{e.proveedor || e.cliente || '—'}</td>
      <td className="px-3 py-2.5">
        {e.placa ? (
          <Link href={`/dashboard/ficha?placa=${encodeURIComponent(e.placa)}`} className="group block leading-tight">
            <span className="num block text-[12px] font-bold text-[#2563eb] group-hover:underline">{e.placa}</span>
            <span className="block max-w-[140px] truncate text-[10.5px] text-[#8a909c]">{e.vehiculo_info || e.cliente_nombre || ''}</span>
          </Link>
        ) : <span className="text-[#c4c8cf]">—</span>}
      </td>
      <td className="px-3 py-2.5"><PagadoDesde e={e} /></td>
      <td className="px-3 py-2.5"><Estado e={e} /></td>
      <td className="num whitespace-nowrap px-3 py-2.5 text-right font-bold text-[#dc2626]">-{usd(Number(e.total_egresos) || 0)}</td>
      <td className="px-2 py-1.5"><Acciones {...p} /></td>
    </tr>
  );
}

function TarjetaEgreso(p: FilaProps) {
  const { e } = p;
  return (
    <li className="px-3 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[#16181d]">{conceptoDe(e)}</p>
          <p className="text-[11px] text-[#8a909c]">
            {fechaCorta(e.fecha)} · {e.proveedor || e.cliente || 'Sin proveedor'}
            {e.placa && <> · <span className="num font-semibold text-[#2563eb]">{e.placa}</span></>}
          </p>
        </div>
        <span className="num text-[14px] font-extrabold text-[#dc2626]">-{usd(Number(e.total_egresos) || 0)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Estado e={e} />
          <PagadoDesde e={e} />
        </div>
        <Acciones {...p} />
      </div>
    </li>
  );
}
