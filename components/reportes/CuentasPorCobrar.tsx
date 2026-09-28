'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Car, Clock, Download, ExternalLink, FileText, Loader2, MessageCircle, Phone, RefreshCw, Search, Wallet, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DialogoCobroVenta from '@/components/pagos/DialogoCobroVenta';
import type { ClienteDeudor, Cobranza, VentaPendienteCliente } from '@/lib/cobranza/tipos';

/**
 * Cuentas por cobrar, cliente por cliente.
 *
 * Lo pendiente estaba repartido: el saldo en la venta, los abonos en otra
 * tabla, el carro en la orden. Para saber qué debía alguien había que abrir
 * tres pantallas. Aquí está el perfil de cada cliente con cada servicio que
 * debe, su carro, quién lo hizo, cada abono con su día y su método, y lo que
 * queda. Se cobra desde aquí, y su estado de cuenta sale en PDF.
 */

type Filtro = 'todos' | 'cliente' | 'cashea' | 'viejas';
const usd = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f?: string | null) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');
const wa = (tel?: string | null) => {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 && /[1-9]/.test(d) ? `https://wa.me/58${d.slice(-10).replace(/^0/, '')}` : null;
};

export default function CuentasPorCobrar({ sedeId }: { sedeId?: string | null }) {
  const [datos, setDatos] = useState<Cobranza | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [elegido, setElegido] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState<VentaPendienteCliente | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/reportes/cuentas-por-cobrar${sedeId ? `?sede=${sedeId}` : ''}`);
      if (r.ok) setDatos(await r.json());
    } finally { setCargando(false); }
  }, [sedeId]);
  useEffect(() => { cargar(); }, [cargar]);

  const clientes = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (datos?.clientes || []).filter(c => {
      if (filtro === 'cliente' && c.deudaCliente <= 0.009) return false;
      if (filtro === 'cashea' && c.deudaCashea <= 0.009) return false;
      if (filtro === 'viejas' && c.masAntigua <= 30) return false;
      if (!q) return true;
      return [c.nombre, c.cedula, c.telefono, ...c.ventas.flatMap(v => [v.placa, v.vehiculo, v.trabajo])]
        .some(x => String(x || '').toLowerCase().includes(q));
    });
  }, [datos, texto, filtro]);

  const actual: ClienteDeudor | null = clientes.find(c => c.clave === elegido) || clientes[0] || null;

  const pdfTodo = async () => {
    if (!datos) return;
    const { generarReportePendientesPDF } = await import('@/lib/cobranza-pdf');
    generarReportePendientesPDF(datos);
  };
  const pdfCliente = async (c: ClienteDeudor) => {
    const { generarFichaClientePDF } = await import('@/lib/cobranza-pdf');
    generarFichaClientePDF(c, datos?.generado || new Date().toISOString().slice(0, 10));
  };

  if (cargando && !datos) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-[#e8eaed] bg-white py-16 text-[13px] text-[#8a909c]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando cuentas por cobrar…
      </div>
    );
  }
  if (!datos) return null;
  const r = datos.resumen;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-extrabold text-foreground">Cuentas por cobrar</h2>
          <p className="text-[12px] text-muted-foreground">{r.nClientes} clientes deben {r.nVentas} ventas · al {fecha(datos.generado)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} aria-hidden /> Actualizar
          </button>
          <button onClick={pdfTodo} className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]">
            <Download className="h-4 w-4" aria-hidden /> Reporte de pendientes (PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Total por cobrar" valor={usd(r.total)} nota={`${r.nVentas} ventas`} color="text-[#dc2626]" />
        <Cifra titulo="Lo deben los clientes" valor={usd(r.clientesDeben)} nota="Hay que cobrárselo" color="text-[#c2410c]" onClick={() => setFiltro('cliente')} />
        <Cifra titulo="Lo financia Cashea / BNC" valor={usd(r.cashea)} nota="Lo paga Cashea" color="text-[#7c3aed]" onClick={() => setFiltro('cashea')} />
        <Cifra titulo="Más de 30 días" valor={String(r.vencidas30)} nota="clientes con deuda vieja" color={r.vencidas30 ? 'text-[#dc2626]' : 'text-[#16181d]'} onClick={() => setFiltro('viejas')} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e8eaed] bg-white p-2.5">
        <label className="flex h-[36px] min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[#e2e5ea] px-2.5">
          <Search className="h-4 w-4 text-[#9ba1ab]" aria-hidden />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Cliente, cédula, placa, trabajo…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" />
        </label>
        <div className="flex rounded-lg bg-[#f2f3f5] p-0.5" role="tablist">
          {([['todos', 'Todos'], ['cliente', 'Deben ellos'], ['cashea', 'Cashea / BNC'], ['viejas', '+30 días']] as const).map(([id, l]) => (
            <button key={id} role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)}
              className={cn('h-[32px] rounded-md px-2.5 text-[12px] font-medium',
                filtro === id ? 'bg-white text-[#16181d] shadow-sm' : 'text-[#5b616e] hover:text-[#16181d]')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e2e5ea] bg-white py-14 text-center text-[13px] text-[#8a909c]">
          {datos.clientes.length ? 'Ningún cliente coincide con el filtro.' : 'Nadie debe nada. Todo cobrado.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Lista */}
          <ul className="max-h-[70vh] divide-y divide-[#f2f3f5] overflow-y-auto rounded-xl border border-[#e8eaed] bg-white">
            {clientes.map(c => (
              <li key={c.clave}>
                <button onClick={() => setElegido(c.clave)}
                  className={cn('w-full px-3 py-2.5 text-left transition-colors',
                    actual?.clave === c.clave ? 'bg-[#fff4ec]' : 'hover:bg-[#fafbfc]')}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-[#16181d]">{c.nombre}</span>
                      <span className="block truncate text-[11px] text-[#8a909c]">
                        {c.ventas.map(v => v.placa).filter(Boolean).join(', ') || `${c.ventas.length} venta(s)`}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right">
                      <span className="block text-[13px] font-extrabold text-[#dc2626]">{usd(c.deuda)}</span>
                      <span className={cn('block text-[10.5px]', c.masAntigua > 30 ? 'font-bold text-[#dc2626]' : 'text-[#9ba1ab]')}>
                        {c.masAntigua} días
                      </span>
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.deudaCashea > 0.009 && <Chip tono="morado">Cashea {usd(c.deudaCashea)}</Chip>}
                    {c.ultimoAbono
                      ? <Chip tono="verde">Abonó {usd(c.ultimoAbono.monto)} el {fecha(c.ultimoAbono.fecha).slice(0, 5)}</Chip>
                      : <Chip tono="gris">Sin abonos</Chip>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Perfil */}
          {actual && (
            <section className="rounded-xl border border-[#e8eaed] bg-white">
              <header className="flex flex-wrap items-start gap-3 border-b border-[#eef0f3] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-extrabold text-[#16181d]">{actual.nombre}</h3>
                  <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-[#5b616e]">
                    {actual.cedula && <span className="num">{actual.cedula}</span>}
                    {actual.telefono && /[1-9]/.test(actual.telefono) && (
                      <a href={`tel:${actual.telefono}`} className="num flex items-center gap-1 hover:underline">
                        <Phone className="h-3.5 w-3.5" aria-hidden />{actual.telefono}
                      </a>
                    )}
                    {wa(actual.telefono) && (
                      <a href={wa(actual.telefono)!} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-[#16a34a] hover:underline">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden />WhatsApp
                      </a>
                    )}
                  </p>
                </div>
                <button onClick={() => pdfCliente(actual)}
                  className="flex h-[36px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-semibold text-[#3d4350] hover:bg-[#f6f7f9]">
                  <FileText className="h-4 w-4" aria-hidden /> Estado de cuenta (PDF)
                </button>
              </header>

              <dl className="grid grid-cols-3 gap-2 border-b border-[#eef0f3] bg-[#fafbfc] px-4 py-3 text-[12px]">
                <div><dt className="text-[#8a909c]">Debe en total</dt><dd className="num text-[18px] font-extrabold text-[#dc2626]">{usd(actual.deuda)}</dd></div>
                <div><dt className="text-[#8a909c]">Lo debe él</dt><dd className="num text-[15px] font-bold text-[#c2410c]">{usd(actual.deudaCliente)}</dd></div>
                <div><dt className="text-[#8a909c]">Cashea / BNC</dt><dd className="num text-[15px] font-bold text-[#7c3aed]">{usd(actual.deudaCashea)}</dd></div>
              </dl>

              <ul className="divide-y divide-[#eef0f3]">
                {actual.ventas.map(v => (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[12px] text-[#5b616e]">
                          <span className="num font-semibold text-[#16181d]">Venta del {fecha(v.fecha)}</span>
                          <span className={cn('flex items-center gap-1', v.dias > 30 && 'font-bold text-[#dc2626]')}>
                            <Clock className="h-3.5 w-3.5" aria-hidden />{v.dias} días
                          </span>
                          {v.cashea && <Chip tono="morado">Cashea / BNC</Chip>}
                        </p>
                        {(v.placa || v.vehiculo) && (
                          <p className="mt-0.5 flex items-center gap-1 text-[12px]">
                            <Car className="h-3.5 w-3.5 text-[#8a909c]" aria-hidden />
                            {v.placa ? (
                              <Link href={`/dashboard/ficha?placa=${encodeURIComponent(v.placa)}`} className="num font-bold text-[#2563eb] hover:underline">{v.placa}</Link>
                            ) : null}
                            <span className="text-[#5b616e]">{v.vehiculo || ''}</span>
                          </p>
                        )}
                        <p className="mt-1 text-[12.5px] text-[#16181d]">{v.trabajo}</p>
                        {v.mecanico && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#5b616e]">
                            <Wrench className="h-3.5 w-3.5" aria-hidden />{v.mecanico}
                          </p>
                        )}
                      </div>
                      <div className="num text-right text-[12px]">
                        <p className="text-[#5b616e]">Total {usd(v.total)}</p>
                        <p className="text-[#16a34a]">Abonado {usd(Math.max(0, v.abonado))}</p>
                        {v.saldo > v.total + 0.01 && (
                          <p className="text-[10.5px] font-bold text-[#dc2626]">Debe más de lo que costó: revísala</p>
                        )}
                        <p className="text-[15px] font-extrabold text-[#dc2626]">Debe {usd(v.saldo)}</p>
                        {v.cashea && v.porCobrar > 0.009 && <p className="text-[10.5px] text-[#c2410c]">de ellos {usd(v.porCobrar)} el cliente</p>}
                      </div>
                    </div>

                    {/* Los abonos, con su día y su método. */}
                    <div className="mt-2 rounded-lg border border-[#eef0f3]">
                      <p className="flex items-center gap-1.5 border-b border-[#f2f3f5] px-3 py-1.5 text-[11px] font-semibold text-[#5b616e]">
                        <Wallet className="h-3.5 w-3.5" aria-hidden /> Abonos
                      </p>
                      {v.abonos.length === 0 ? (
                        <p className="px-3 py-2 text-[11.5px] text-[#9ba1ab]">Todavía no ha abonado.</p>
                      ) : (
                        <ul>
                          {v.abonos.map((a, i) => (
                            <li key={i} className="num flex items-center justify-between gap-2 px-3 py-1.5 text-[11.5px]">
                              <span className="text-[#5b616e]">{fecha(a.fecha)} · {a.metodo || 'Sin método'}</span>
                              <span className="font-semibold text-[#16a34a]">{usd(a.monto)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => setCobrando(v)}
                        className="h-[32px] rounded-lg bg-[#16a34a] px-3 text-[12px] font-bold text-white hover:bg-[#15803d]">
                        Cobrar
                      </button>
                      {v.servicio_id && (
                        <Link href={`/dashboard/servicios?id=${v.servicio_id}`}
                          className="flex h-[32px] items-center gap-1 rounded-lg border border-[#e2e5ea] px-3 text-[12px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
                          Abrir la orden <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {cobrando && actual && (
        <DialogoCobroVenta
          venta={{
            id: cobrando.id, cliente: actual.nombre, fecha: cobrando.fecha, placa: cobrando.placa,
            vehiculo_info: cobrando.vehiculo, total_ingresos: cobrando.total, abono: cobrando.abonado,
            saldo_pendiente: cobrando.saldo, cashea: cobrando.cashea ? 1 : 0,
          }}
          onCerrar={() => setCobrando(null)}
          onCobrado={() => { setCobrando(null); cargar(); }}
        />
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota, color, onClick }: { titulo: string; valor: string; nota: string; color: string; onClick?: () => void }) {
  const Caja = onClick ? 'button' : 'div';
  return (
    <Caja onClick={onClick} className={cn('rounded-xl border border-[#e8eaed] bg-white p-3.5 text-left', onClick && 'hover:border-[#f97316]')}>
      <p className="text-[11.5px] font-medium text-[#8a909c]">{titulo}</p>
      <p className={cn('num mt-1 text-[20px] font-extrabold leading-none', color)}>{valor}</p>
      <p className="mt-1.5 text-[11px] text-[#9ba1ab]">{nota}</p>
    </Caja>
  );
}

function Chip({ tono, children }: { tono: 'morado' | 'verde' | 'gris'; children: React.ReactNode }) {
  const t = { morado: 'bg-[#f0eafc] text-[#7c3aed]', verde: 'bg-[#e8f7ee] text-[#15803d]', gris: 'bg-[#f2f3f5] text-[#8a909c]' }[tono];
  return <span className={cn('rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold', t)}>{children}</span>;
}
