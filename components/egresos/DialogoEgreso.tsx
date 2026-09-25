'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Car, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import DesglosePagoBancos from '@/components/pos/DesglosePagoBancos';
import { binsTotalUSD, emptyBins, type Bins } from '@/lib/reporte/ventas-mapping';
import { cuentaPrincipal, soloConDinero } from '@/lib/pagos/desglose';
import { CATEGORIAS_EGRESO, cuentasDe, type EgresoFila } from '@/components/egresos/tipos';

/**
 * Registrar o corregir un gasto del taller.
 *
 * El formulario de antes guardaba fecha, categoría, a quién y cuánto. No sabía
 * si ya se había pagado, ni de qué cuenta salió el dinero, ni al proveedor del
 * catálogo: el gasto aparecía en el reporte, pero ningún saldo de banco bajaba
 * y una compra fiada no se distinguía de una pagada.
 *
 * Ahora pide lo mismo que el renglón de la ficha —estado del pago y el panel de
 * cuentas del punto de venta, pero para pagar— y así un gasto manual y uno
 * de la ficha se leen igual en el reporte y en Finanzas.
 */

type Estado = 'pagado' | 'por_pagar' | 'parcial';
interface Item { descripcion: string; cantidad: number; precio_unitario: number; total: number }
interface Proveedor { id: string; nombre: string }

interface Props {
  inicial?: EgresoFila | null;
  onCerrar: () => void;
  onGuardar: (datos: Partial<EgresoFila>) => Promise<void>;
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const INPUT = 'h-[40px] w-full rounded-lg border border-[#e2e5ea] bg-white px-2.5 text-[13px] text-[#16181d] outline-none focus:border-[#f97316]';
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export default function DialogoEgreso({ inicial, onCerrar, onGuardar }: Props) {
  const editando = Boolean(inicial?.id);

  const [fecha, setFecha] = useState(inicial?.fecha || hoy());
  const [categoria, setCategoria] = useState(inicial?.categoria || 'repuestos');
  const [proveedor, setProveedor] = useState(inicial?.proveedor || inicial?.cliente || '');
  const [proveedorId, setProveedorId] = useState<string | null>(inicial?.proveedor_id || null);
  const [items, setItems] = useState<Item[]>(
    inicial?.desglose?.length
      ? inicial.desglose.map(d => ({
        descripcion: d.descripcion || '', cantidad: Number(d.cantidad) || 1,
        precio_unitario: Number(d.precio_unitario) || 0, total: Number(d.total) || 0,
      }))
      : [{ descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }],
  );
  const [nota, setNota] = useState(inicial?.notas || '');
  const [enlace, setEnlace] = useState(inicial?.enlace || '');

  const [estado, setEstado] = useState<Estado>(
    (['pagado', 'por_pagar', 'parcial'] as const).includes(inicial?.estado_pago as Estado)
      ? inicial!.estado_pago as Estado
      : 'pagado',
  );
  const [vence, setVence] = useState(inicial?.fecha_vencimiento || '');
  const [pagoBins, setPagoBins] = useState<Bins>(() => (inicial ? cuentasDe(inicial) : emptyBins()));
  const [tasaPago, setTasaPago] = useState<number | null>(Number(inicial?.tasa_cambio) || null);
  const [tasaDia, setTasaDia] = useState(0);

  // El vehículo, si el gasto es por un carro concreto: alimenta su utilidad.
  const [placa, setPlaca] = useState(inicial?.placa || '');
  const [vinculo, setVinculo] = useState<{
    vehiculo_id: string; cliente_id: string | null; placa: string;
    vehiculo_info: string; cliente_nombre: string;
  } | null>(inicial?.vehiculo_id ? {
    vehiculo_id: inicial.vehiculo_id, cliente_id: inicial.cliente_id || null,
    placa: inicial.placa || '', vehiculo_info: inicial.vehiculo_info || '',
    cliente_nombre: inicial.cliente_nombre || '',
  } : null);
  const [buscando, setBuscando] = useState(false);
  const [avisoPlaca, setAvisoPlaca] = useState('');

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/rates').then(r => r.json()).then(d => setTasaDia(Number(d?.bcv) || 0)).catch(() => {});
    fetch('/api/proveedores?activos=1').then(r => r.json())
      .then(d => setProveedores(d.proveedores || [])).catch(() => {});
  }, []);

  const total = useMemo(() => r2(items.reduce((s, i) => s + (Number(i.total) || 0), 0)), [items]);
  const tasa = tasaPago || tasaDia || 0;
  const pagadoUSD = binsTotalUSD(pagoBins, tasa);
  const hayPago = Object.values(pagoBins).some(v => v > 0);
  const saldo = estado === 'por_pagar' ? total : estado === 'parcial' ? Math.max(0, r2(total - pagadoUSD)) : 0;

  const cambiarItem = (i: number, campo: keyof Item, valor: string) => {
    setItems(prev => {
      const next = [...prev];
      const it = { ...next[i], [campo]: campo === 'descripcion' ? valor : Number(valor) || 0 } as Item;
      if (campo === 'cantidad' || campo === 'precio_unitario') it.total = r2(it.cantidad * it.precio_unitario);
      next[i] = it;
      return next;
    });
  };

  const buscarPlaca = async () => {
    const pl = placa.trim().toUpperCase();
    if (!pl || !supabase) return;
    setBuscando(true); setAvisoPlaca('');
    const { data } = await supabase.from('vehiculos')
      .select('id, marca, modelo, placa, cliente_id, clientes(nombre, apellido)')
      .ilike('placa', pl).limit(1).maybeSingle();
    setBuscando(false);
    if (!data) { setVinculo(null); setAvisoPlaca(`No hay ningún vehículo con la placa ${pl}.`); return; }
    const c = data.clientes as unknown as { nombre?: string; apellido?: string } | null;
    setVinculo({
      vehiculo_id: data.id, cliente_id: data.cliente_id, placa: data.placa,
      vehiculo_info: `${data.marca || ''} ${data.modelo || ''}`.trim(),
      cliente_nombre: c ? `${c.nombre || ''} ${c.apellido || ''}`.trim() : '',
    });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const conTexto = items.filter(i => i.descripcion.trim());
    if (!fecha) { setError('Falta la fecha del gasto.'); return; }
    if (conTexto.length === 0) { setError('Escribe en qué se gastó.'); return; }
    if (total <= 0) { setError('El gasto tiene que tener un monto.'); return; }
    const margen = Math.max(0.05, total * 0.01);
    if ((estado === 'pagado' || estado === 'parcial') && !hayPago) {
      setError('Indica de qué cuenta salió el dinero.'); return;
    }
    if (estado === 'pagado' && Math.abs(pagadoUSD - total) > margen) {
      setError(`Lo pagado ($${pagadoUSD.toFixed(2)}) no cuadra con el gasto ($${total.toFixed(2)}). `
        + 'Corrige el monto o marca «Abonado a medias».');
      return;
    }
    if (estado === 'parcial' && pagadoUSD >= total - margen) {
      setError('Si ya se pagó todo, márcalo como pagado.'); return;
    }

    const salio = estado === 'pagado' || estado === 'parcial';
    const reparto = salio ? soloConDinero(pagoBins) : null;
    setGuardando(true);
    try {
      await onGuardar({
        fecha,
        categoria,
        cliente: proveedor.trim() || null,
        proveedor: proveedor.trim() || null,
        proveedor_id: proveedorId,
        total_egresos: total,
        moneda: 'USD',
        desglose: conTexto,
        notas: nota.trim() || null,
        enlace: enlace.trim() || null,
        estado_pago: estado,
        monto_pagado: estado === 'pagado' ? total : estado === 'parcial' ? r2(pagadoUSD) : 0,
        fecha_pago: salio ? (inicial?.fecha_pago || fecha) : null,
        fecha_vencimiento: estado === 'pagado' ? null : (vence || null),
        metodos_pago: reparto as Record<string, number> | null,
        metodo_pago: reparto ? cuentaPrincipal(pagoBins, tasa) : null,
        tasa_cambio: salio ? (tasa || null) : null,
        vehiculo_id: vinculo?.vehiculo_id || null,
        cliente_id: vinculo?.cliente_id || null,
        placa: vinculo?.placa || null,
        vehiculo_info: vinculo?.vehiculo_info || null,
        cliente_nombre: vinculo?.cliente_nombre || null,
        origen: inicial?.origen || 'panel',
      });
      onCerrar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={guardar} className="flex max-h-[92dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[#e8eaed] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-[#16181d]">{editando ? 'Corregir gasto' : 'Registrar gasto'}</h2>
            <p className="text-[11.5px] text-[#8a909c]">Compras, pagos y gastos del taller, con la cuenta de la que salió el dinero.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Fecha</span>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Categoría</span>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} className={INPUT}>
                {CATEGORIAS_EGRESO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">¿A quién se le pagó?</span>
              <input
                list="egreso-proveedores"
                value={proveedor}
                onChange={e => {
                  setProveedor(e.target.value);
                  const hit = proveedores.find(p => p.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
                  setProveedorId(hit?.id || null);
                }}
                placeholder="Proveedor o persona"
                className={INPUT}
              />
              <datalist id="egreso-proveedores">
                {proveedores.map(p => <option key={p.id} value={p.nombre} />)}
              </datalist>
            </label>
          </div>

          {/* En qué se gastó */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-[#5b616e]">¿En qué se gastó?</span>
              <button
                type="button"
                onClick={() => setItems(p => [...p, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }])}
                className="flex items-center gap-1 text-[11.5px] font-semibold text-[#f97316] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Otro concepto
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="hidden grid-cols-[1fr_64px_92px_80px_28px] gap-1.5 px-0.5 text-[10.5px] text-[#9ba1ab] sm:grid">
                <span>Concepto</span><span>Cant.</span><span>Precio $</span><span className="text-right">Total</span><span />
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_92px_80px_28px] items-center gap-1.5">
                  <input
                    value={it.descripcion}
                    onChange={e => cambiarItem(i, 'descripcion', e.target.value)}
                    placeholder="Filtro de aceite, luz del mes…"
                    aria-label={`Concepto ${i + 1}`}
                    className={cn(INPUT, 'h-[36px]')}
                  />
                  <input type="number" step="0.01" min="0" value={it.cantidad} aria-label={`Cantidad ${i + 1}`}
                    onChange={e => cambiarItem(i, 'cantidad', e.target.value)} className={cn(INPUT, 'num h-[36px] text-right')} />
                  <input type="number" step="0.01" min="0" value={it.precio_unitario || ''} placeholder="0.00" aria-label={`Precio ${i + 1}`}
                    onChange={e => cambiarItem(i, 'precio_unitario', e.target.value)} className={cn(INPUT, 'num h-[36px] text-right')} />
                  <span className="num text-right text-[12.5px] font-semibold text-[#16181d]">${it.total.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => setItems(p => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                    disabled={items.length === 1}
                    aria-label={`Quitar concepto ${i + 1}`}
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-md text-[#9ba1ab] hover:bg-[#fdeaea] hover:text-[#dc2626] disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <p className="num mt-2 flex items-center justify-between rounded-lg bg-[#fafbfc] px-3 py-2 text-[12.5px]">
              <span className="text-[#5b616e]">Total del gasto</span>
              <strong className="text-[15px] text-[#dc2626]">${total.toFixed(2)}</strong>
            </p>
          </div>

          {/* Pago */}
          <div>
            <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">¿Ya se pagó?</span>
            <div className="grid grid-cols-3 gap-2">
              {([['pagado', 'Sí, pagado'], ['por_pagar', 'No, se debe'], ['parcial', 'Abonado a medias']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEstado(id)}
                  aria-pressed={estado === id}
                  className={cn(
                    'h-[40px] rounded-lg border px-2 text-[12px] font-medium transition-colors',
                    estado === id
                      ? id === 'pagado' ? 'border-[#16a34a] bg-[#e8f7ee] text-[#15803d]' : 'border-[#f97316] bg-[#fff4ec] text-[#c2410c]'
                      : 'border-[#e2e5ea] text-[#3d4350] hover:bg-[#f6f7f9]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(estado === 'pagado' || estado === 'parcial') && (
            <div className="rounded-lg border border-[#e8eaed]">
              <p className="px-4 pt-3 text-[11.5px] font-semibold text-[#16181d]">
                {estado === 'parcial' ? '¿Cuánto se abonó y de qué cuenta?' : '¿De qué cuenta salió el dinero?'}
              </p>
              <DesglosePagoBancos
                bins={pagoBins}
                onBinsChange={setPagoBins}
                totalUSD={total}
                tasa={tasa}
                tasaAuto={tasaDia}
                onTasaChange={setTasaPago}
                sentido="pago"
                ocultarMetodos={['cashea']}
                sinPreseleccion={editando}
              />
            </div>
          )}

          {estado !== 'pagado' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Fecha límite de pago</span>
                <input type="date" value={vence} onChange={e => setVence(e.target.value)} className={INPUT} />
              </label>
              {saldo > 0 && (
                <p className="num self-end rounded-lg border border-[#ffd9bd] bg-[#fff4ec] px-3 py-2.5 text-[12px] font-medium text-[#c2410c]">
                  Queda debiendo ${saldo.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Vehículo */}
          <div className="rounded-lg border border-[#e8eaed] p-3">
            <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">¿Es por un vehículo? (opcional)</span>
            <p className="mb-2 text-[11px] leading-snug text-[#9ba1ab]">
              Con la placa, el gasto se descuenta de lo que se ganó con ese carro.
            </p>
            {vinculo ? (
              <div className="flex items-center gap-2 rounded-lg bg-[#eff6ff] px-3 py-2">
                <Car className="h-4 w-4 text-[#2563eb]" aria-hidden />
                <span className="min-w-0 flex-1 text-[12.5px] text-[#1d4ed8]">
                  <strong className="num font-bold">{vinculo.placa}</strong> · {vinculo.vehiculo_info || 'Vehículo'}
                  {vinculo.cliente_nombre && <span className="text-[#5b616e]"> · {vinculo.cliente_nombre}</span>}
                </span>
                <button type="button" onClick={() => { setVinculo(null); setPlaca(''); }} className="text-[11.5px] font-medium text-[#5b616e] hover:underline">
                  Quitar
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={placa}
                  onChange={e => setPlaca(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarPlaca(); } }}
                  placeholder="Placa, ej. AG714TG"
                  className={cn(INPUT, 'num uppercase')}
                />
                <button
                  type="button"
                  onClick={buscarPlaca}
                  disabled={buscando || !placa.trim()}
                  className="flex h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-40"
                >
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                  Buscar
                </button>
              </div>
            )}
            {avisoPlaca && <p className="mt-1.5 text-[11.5px] text-[#b45309]">{avisoPlaca}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Referencia o enlace</span>
              <input value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="Nº de factura, referencia del pago…" className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Nota</span>
              <input value={nota} onChange={e => setNota(e.target.value)} className={INPUT} />
            </label>
          </div>

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
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar gasto'}
          </button>
        </footer>
      </form>
    </div>
  );
}
