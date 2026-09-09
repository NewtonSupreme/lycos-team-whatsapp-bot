'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EstadoPago, OrigenPartida, PartidaCalculada, TipoPartida } from '@/lib/ficha/vehiculo';

interface Proveedor { id: string; nombre: string; telefono?: string | null; enlace?: string | null }

interface Props {
  /** Renglón existente cuando se edita. */
  partida?: PartidaCalculada | null;
  /**
   * Datos con los que abrir el diálogo ya rellenado.
   *
   * Lo usan los renglones que vienen de una orden de servicio: la
   * descripción y el precio al cliente ya se conocen, así que solo queda
   * poner el costo y de dónde salió la pieza.
   */
  precarga?: {
    descripcion: string;
    cantidad: number;
    precio_venta: number;
    fecha?: string | null;
    servicio_id?: string | null;
    /** Lo que costó la pieza, cuando el renglón salió del almacén. */
    costo_unitario?: number;
    inventario_id?: string | null;
  } | null;
  placa: string;
  vehiculoId: string | null;
  vehiculoInfo?: string | null;
  clienteId?: string | null;
  clienteNombre?: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const TIPOS: { id: TipoPartida; label: string }[] = [
  { id: 'repuesto', label: 'Repuesto' },
  { id: 'mano_obra', label: 'Mano de obra' },
  { id: 'servicio', label: 'Servicio' },
  { id: 'insumo', label: 'Insumo' },
];

const hoy = () => new Date().toISOString().slice(0, 10);

export default function DialogoPartida({
  partida, precarga, placa, vehiculoId, vehiculoInfo, clienteId, clienteNombre,
  onCerrar, onGuardado,
}: Props) {
  const editando = Boolean(partida?.id);

  const [descripcion, setDescripcion] = useState(partida?.descripcion || precarga?.descripcion || '');
  const [tipo, setTipo] = useState<TipoPartida>(partida?.tipo || 'repuesto');
  const [cantidad, setCantidad] = useState(String(partida?.cantidad ?? precarga?.cantidad ?? 1));
  const [precioVenta, setPrecioVenta] = useState(String(partida?.precio_venta ?? precarga?.precio_venta ?? ''));
  // Un renglón que salió del almacén ya sabe lo que costó: se precarga para que
  // la utilidad salga sola en vez de tener que buscar el precio del proveedor.
  const [costo, setCosto] = useState(
    String(partida?.costo ?? (precarga?.costo_unitario ? precarga.costo_unitario : '')),
  );
  // Una pieza salida del almacén propio la puso el taller, no el cliente.
  const [origen, setOrigen] = useState<OrigenPartida>(partida?.origen || 'taller');
  const [proveedor, setProveedor] = useState(partida?.proveedor || '');
  const [proveedorId, setProveedorId] = useState<string | null>(partida?.proveedor_id || null);
  const [enlace, setEnlace] = useState(partida?.enlace || '');
  // Al venir de una orden, el estado arranca en «por pagar»: si el taller
  // compró la pieza, lo normal es que aún se le deba al proveedor.
  const [estadoPago, setEstadoPago] = useState<EstadoPago>(
    partida?.estado_pago || (precarga ? 'por_pagar' : 'pagado'),
  );
  const [montoPagado, setMontoPagado] = useState(String(partida?.monto_pagado ?? ''));
  const [vence, setVence] = useState(partida?.fecha_vencimiento || '');
  const [fecha, setFecha] = useState(partida?.fecha || precarga?.fecha || hoy());
  const [nota, setNota] = useState(partida?.nota || '');

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/proveedores?activos=1')
      .then(r => r.json())
      .then(d => setProveedores(d.proveedores || []))
      .catch(() => setProveedores([]));
  }, []);

  // La pieza que trae el cliente no nos cuesta ni le debemos nada a nadie.
  const laTraeElCliente = origen === 'cliente';
  const sinCosto = laTraeElCliente || tipo === 'mano_obra' || tipo === 'servicio';

  const n = (v: string) => Number(String(v).replace(',', '.')) || 0;
  const totalVenta = n(cantidad) * n(precioVenta);
  const totalCosto = laTraeElCliente ? 0 : n(cantidad) * n(costo);
  const utilidad = totalVenta - totalCosto;

  const saldo = useMemo(() => {
    if (laTraeElCliente || totalCosto === 0) return 0;
    if (estadoPago === 'por_pagar') return totalCosto;
    if (estadoPago === 'parcial') return Math.max(0, totalCosto - n(montoPagado));
    return 0;
  }, [laTraeElCliente, totalCosto, estadoPago, montoPagado]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!descripcion.trim()) { setError('Escribe qué se hizo o qué pieza se puso.'); return; }
    if (n(cantidad) <= 0) { setError('La cantidad tiene que ser mayor que cero.'); return; }
    if (estadoPago === 'parcial' && n(montoPagado) <= 0) {
      setError('Un pago parcial necesita el monto que ya se abonó.'); return;
    }
    if (estadoPago === 'parcial' && n(montoPagado) >= totalCosto) {
      setError('Si ya se pagó todo, marca el renglón como pagado.'); return;
    }

    setGuardando(true);
    try {
      const cuerpo = {
        vehiculo_id: vehiculoId,
        placa,
        vehiculo_info: vehiculoInfo || null,
        cliente_id: clienteId || null,
        cliente_nombre: clienteNombre || null,
        fecha,
        descripcion: descripcion.trim(),
        tipo,
        cantidad: n(cantidad),
        precio_venta: n(precioVenta),
        costo: laTraeElCliente ? 0 : n(costo),
        origen,
        proveedor_id: laTraeElCliente ? null : proveedorId,
        proveedor: laTraeElCliente ? null : (proveedor.trim() || null),
        enlace: enlace.trim() || null,
        estado_pago: sinCosto && totalCosto === 0 ? 'no_aplica' : estadoPago,
        monto_pagado: estadoPago === 'parcial' ? n(montoPagado) : 0,
        fecha_vencimiento: vence || null,
        nota: nota.trim() || null,
      };

      const res = await fetch(editando ? `/api/partidas/${partida!.id}` : '/api/partidas', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar');
      onGuardado();
      onCerrar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  /** Da de alta al proveedor escrito si aún no está en el catálogo. */
  const crearProveedor = async () => {
    const nombre = proveedor.trim();
    if (!nombre) return;
    const res = await fetch('/api/proveedores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    });
    const d = await res.json();
    if (d.proveedor) {
      setProveedores(p => (p.some(x => x.id === d.proveedor.id) ? p : [...p, d.proveedor]));
      setProveedorId(d.proveedor.id);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={guardar} className="flex max-h-[90dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-[#16181d]">
              {editando ? 'Editar renglón' : 'Agregar renglón'}
            </h2>
            <p className="num text-[11.5px] text-[#8a909c]">Placa {placa || '—'}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">¿Qué se hizo o qué pieza se puso? *</span>
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Manguera de purificador, sensor de oxígeno, mano de obra…"
              className={INPUT}
            />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Tipo</span>
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoPartida)} className={INPUT}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Cantidad</span>
              <input type="number" step="0.01" min="0.01" value={cantidad} onChange={e => setCantidad(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Fecha</span>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={INPUT} />
            </label>
          </div>

          {/* Quién puso la pieza */}
          {tipo === 'repuesto' || tipo === 'insumo' ? (
            <div>
              <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">¿Quién puso el repuesto?</span>
              <div className="grid grid-cols-2 gap-2">
                {([['taller', 'Lo compramos nosotros'], ['cliente', 'Lo trajo el cliente']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOrigen(id)}
                    aria-pressed={origen === id}
                    className={cn(
                      'h-[42px] rounded-lg border text-[12.5px] font-medium transition-colors',
                      origen === id ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9]',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {laTraeElCliente && (
                <p className="mt-1.5 text-[11px] leading-snug text-[#9ba1ab]">
                  Al traerlo el cliente, el renglón no lleva costo ni proveedor: solo lo que se le cobra por montarlo.
                </p>
              )}
            </div>
          ) : null}

          {/* Dinero */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Precio al cliente (c/u)</span>
              <input type="number" step="0.01" min="0" value={precioVenta} onChange={e => setPrecioVenta(e.target.value)} placeholder="0.00" className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">
                Costo (c/u){laTraeElCliente && <span className="font-normal text-[#9ba1ab]"> — lo trajo el cliente</span>}
              </span>
              <input
                type="number" step="0.01" min="0"
                value={laTraeElCliente ? '' : costo}
                onChange={e => setCosto(e.target.value)}
                disabled={laTraeElCliente}
                placeholder={laTraeElCliente ? 'No aplica' : '0.00'}
                className={cn(INPUT, laTraeElCliente && 'bg-[#f6f7f9] text-[#9ba1ab]')}
              />
            </label>
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-[#fafbfc] px-3 py-2.5 text-[12px]">
            <div><dt className="text-[#8a909c]">Se cobra</dt><dd className="num font-bold text-[#16181d]">${totalVenta.toFixed(2)}</dd></div>
            <div><dt className="text-[#8a909c]">Cuesta</dt><dd className="num font-bold text-[#16181d]">${totalCosto.toFixed(2)}</dd></div>
            <div>
              <dt className="text-[#8a909c]">Ganancia</dt>
              <dd className={cn('num font-bold', utilidad < 0 ? 'text-[#dc2626]' : 'text-[#16a34a]')}>${utilidad.toFixed(2)}</dd>
            </div>
          </dl>

          {/* Proveedor y deuda */}
          {!laTraeElCliente && totalCosto > 0 && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">¿Quién nos lo vendió?</span>
                  <div className="flex gap-1.5">
                    <input
                      list="lista-proveedores"
                      value={proveedor}
                      onChange={e => {
                        setProveedor(e.target.value);
                        const hit = proveedores.find(x => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
                        setProveedorId(hit?.id || null);
                      }}
                      placeholder="Juan, repuestos El Sol…"
                      className={INPUT}
                    />
                    <datalist id="lista-proveedores">
                      {proveedores.map(x => <option key={x.id} value={x.nombre} />)}
                    </datalist>
                    {proveedor.trim() && !proveedorId && (
                      <button
                        type="button"
                        onClick={crearProveedor}
                        title="Guardar este proveedor en el catálogo"
                        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#f97316] hover:bg-[#fff4ec]"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Enlace o referencia de la compra</span>
                  <input value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="Link, número de factura…" className={INPUT} />
                </label>
              </div>

              <div>
                <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">¿Ya se le pagó al proveedor?</span>
                <div className="grid grid-cols-3 gap-2">
                  {([['pagado', 'Sí, pagado'], ['por_pagar', 'No, se le debe'], ['parcial', 'Abonado a medias']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEstadoPago(id)}
                      aria-pressed={estadoPago === id}
                      className={cn(
                        'h-[42px] rounded-lg border px-2 text-[12px] font-medium transition-colors',
                        estadoPago === id
                          ? id === 'pagado' ? 'border-[#16a34a] bg-[#e8f7ee] text-[#15803d]' : 'border-[#f97316] bg-[#fff4ec] text-[#c2410c]'
                          : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9]',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {estadoPago !== 'pagado' && (
                <div className="grid grid-cols-2 gap-3">
                  {estadoPago === 'parcial' && (
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Ya abonado</span>
                      <input type="number" step="0.01" min="0" value={montoPagado} onChange={e => setMontoPagado(e.target.value)} className={INPUT} />
                    </label>
                  )}
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Fecha límite de pago</span>
                    <input type="date" value={vence} onChange={e => setVence(e.target.value)} className={INPUT} />
                  </label>
                </div>
              )}

              {saldo > 0 && (
                <p className="num rounded-lg border border-[#ffd9bd] bg-[#fff4ec] px-3 py-2 text-[12px] font-medium text-[#c2410c]">
                  Queda debiendo ${saldo.toFixed(2)} {proveedor.trim() ? `a ${proveedor.trim()}` : 'al proveedor'}.
                </p>
              )}
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Nota</span>
            <textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} className="w-full resize-none rounded-lg border border-[#e2e5ea] px-2.5 py-2 text-[13px] outline-none focus:border-[#f97316]" />
          </label>

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
          <button type="submit" disabled={guardando} className="flex h-[38px] items-center gap-2 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c] disabled:opacity-50">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : 'Guardar renglón'}
          </button>
        </footer>
      </form>
    </div>
  );
}

const INPUT = 'h-[40px] w-full rounded-lg border border-[#e2e5ea] px-2.5 text-[13px] outline-none focus:border-[#f97316]';
