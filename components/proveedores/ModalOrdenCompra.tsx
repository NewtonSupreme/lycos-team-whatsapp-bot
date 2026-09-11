'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import ModalBase, { BotonPrincipal, BotonSecundario, Campo, CLASE_INPUT } from '@/components/ui/modales/ModalBase';
import type { ProveedorFila } from '@/lib/proveedores/tipos';

interface Renglon {
  descripcion: string;
  cantidad: string;
  costo: string;
}

interface Props {
  abierto: boolean;
  proveedores: readonly ProveedorFila[];
  /** El proveedor con el que abrir, si se entró desde su ficha. */
  proveedorInicial?: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Un pedido a un proveedor.
 *
 * No es un gasto todavía: es lo que se pidió y aún no ha llegado. Se registra
 * aparte de los egresos porque mezclarlos haría que el mes cerrara con dinero
 * que no ha salido. El gasto nace al marcar la orden como recibida.
 */
export default function ModalOrdenCompra({
  abierto, proveedores, proveedorInicial, onCerrar, onGuardado,
}: Props) {
  const catalogo = useMemo(
    () => proveedores.filter(p => !p.id.startsWith('~') && p.activo),
    [proveedores],
  );

  const [proveedorId, setProveedorId] = useState(proveedorInicial || '');
  const [nombreLibre, setNombreLibre] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [esperada, setEsperada] = useState('');
  const [estadoPago, setEstadoPago] = useState<'por_pagar' | 'pagado'>('por_pagar');
  const [vence, setVence] = useState('');
  const [notas, setNotas] = useState('');
  const [renglones, setRenglones] = useState<Renglon[]>([
    { descripcion: '', cantidad: '1', costo: '' },
  ]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const elegido = catalogo.find(p => p.id === proveedorId) || null;
  const num = (v: string) => Number(String(v).replace(',', '.')) || 0;
  const total = renglones.reduce((s, r) => s + num(r.cantidad) * num(r.costo), 0);

  const cambiar = (i: number, campo: keyof Renglon, valor: string) =>
    setRenglones(rs => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));

  const guardar = async () => {
    const proveedor = elegido?.nombre || nombreLibre.trim();
    if (!proveedor) { setError('Indica a quién se le está comprando.'); return; }

    const items = renglones
      .filter(r => r.descripcion.trim() && num(r.cantidad) > 0)
      .map(r => ({
        descripcion: r.descripcion.trim(),
        cantidad: num(r.cantidad),
        costo_unitario: num(r.costo),
      }));

    if (items.length === 0) { setError('La orden necesita al menos un renglón.'); return; }

    setGuardando(true);
    setError('');
    try {
      const r = await fetch('/api/proveedores/ordenes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor,
          proveedor_id: elegido?.id || null,
          fecha,
          fecha_esperada: esperada || null,
          estado_pago: estadoPago,
          fecha_vencimiento: vence || null,
          notas: notas.trim() || null,
          items,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar la orden');
      onGuardado();
      onCerrar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      bloqueado={guardando}
      titulo="Nueva orden de compra"
      subtitulo="Lo que se pide y todavía no ha llegado. Se vuelve gasto al recibirla."
      icono={<ClipboardList className="h-5 w-5" aria-hidden />}
      ancho="lg"
      pie={(
        <>
          <span className="mr-auto text-[12.5px] text-[#5b616e]">
            Total del pedido{' '}
            <strong className="text-[15px] font-extrabold text-[#16181d] tabular-nums">{money(total)}</strong>
          </span>
          <BotonSecundario onClick={onCerrar} disabled={guardando}>Cancelar</BotonSecundario>
          <BotonPrincipal onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : 'Registrar orden'}
          </BotonPrincipal>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Proveedor" obligatorio>
          <select
            value={proveedorId}
            onChange={e => setProveedorId(e.target.value)}
            className={CLASE_INPUT}
          >
            <option value="">— Escribirlo a mano —</option>
            {catalogo.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.categoria ? ` · ${p.categoria}` : ''}
              </option>
            ))}
          </select>
        </Campo>

        {!proveedorId && (
          <Campo label="Nombre del proveedor" obligatorio>
            <input
              value={nombreLibre}
              onChange={e => setNombreLibre(e.target.value)}
              placeholder="A quién se le compró"
              className={CLASE_INPUT}
            />
          </Campo>
        )}

        <Campo label="Fecha del pedido">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={CLASE_INPUT} />
        </Campo>

        <Campo label="¿Cuándo debería llegar?">
          <input type="date" value={esperada} onChange={e => setEsperada(e.target.value)} className={CLASE_INPUT} />
        </Campo>

        <Campo label="¿Ya se pagó?">
          <select
            value={estadoPago}
            onChange={e => setEstadoPago(e.target.value as 'por_pagar' | 'pagado')}
            className={CLASE_INPUT}
          >
            <option value="por_pagar">No, se le debe</option>
            <option value="pagado">Sí, pagado</option>
          </select>
        </Campo>

        {estadoPago === 'por_pagar' && (
          <Campo label="Fecha límite de pago">
            <input type="date" value={vence} onChange={e => setVence(e.target.value)} className={CLASE_INPUT} />
            {elegido && elegido.dias_credito > 0 && !vence && (
              <span className="mt-1 block text-[11px] leading-snug text-[#8a909c]">
                Si la dejas vacía se calculará con los {elegido.dias_credito} días de
                crédito de {elegido.nombre}.
              </span>
            )}
          </Campo>
        )}
      </div>

      {/* Renglones */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] font-bold text-[#16181d]">¿Qué se pidió?</span>
          <button
            type="button"
            onClick={() => setRenglones(rs => [...rs, { descripcion: '', cantidad: '1', costo: '' }])}
            className="flex h-[28px] items-center gap-1 rounded-lg border border-[#e2e5ea] px-2.5 text-[11.5px] font-semibold text-[#f97316] hover:bg-[#fff4ec]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Renglón
          </button>
        </div>

        <ul className="space-y-1.5">
          {renglones.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input
                value={r.descripcion}
                onChange={e => cambiar(i, 'descripcion', e.target.value)}
                placeholder="Qué se pidió"
                aria-label={`Renglón ${i + 1}: descripción`}
                className={`${CLASE_INPUT} flex-1`}
              />
              <input
                type="number" min="0" step="0.01"
                value={r.cantidad}
                onChange={e => cambiar(i, 'cantidad', e.target.value)}
                aria-label={`Renglón ${i + 1}: cantidad`}
                className={`${CLASE_INPUT} w-[74px] text-center`}
              />
              <input
                type="number" min="0" step="0.01"
                value={r.costo}
                onChange={e => cambiar(i, 'costo', e.target.value)}
                placeholder="Costo"
                aria-label={`Renglón ${i + 1}: costo por unidad`}
                className={`${CLASE_INPUT} w-[98px] text-right`}
              />
              <span className="w-[86px] shrink-0 text-right text-[12.5px] font-semibold text-[#16181d] tabular-nums">
                {money(num(r.cantidad) * num(r.costo))}
              </span>
              <button
                type="button"
                onClick={() => setRenglones(rs => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}
                disabled={renglones.length === 1}
                aria-label={`Quitar el renglón ${i + 1}`}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#dc2626] hover:bg-[#fdeaea] disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Campo label="Notas">
        <input
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Número de pedido, quién lo recibe…"
          className={`${CLASE_INPUT} mt-3`}
        />
      </Campo>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12.5px] text-[#b91c1c]">
          {error}
        </p>
      )}
    </ModalBase>
  );
}
