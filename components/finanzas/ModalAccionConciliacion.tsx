'use client';

import React, { useEffect, useState } from 'react';
import { Check, FilePlus2, FileSpreadsheet, Loader2, Receipt, ShieldAlert, Sparkles, Tag, Wrench } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import type { MovimientoBanco, BancoConciliable } from '@/lib/conciliacion/leer-estado';
import { CATEGORIAS_VENTA } from '@/lib/categorias';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  movimiento: MovimientoBanco | null;
  tipo: 'ingreso' | 'egreso' | 'diferencia';
  banco: BancoConciliable;
  onCompletado: () => void;
}

export default function ModalAccionConciliacion({
  abierto,
  onCerrar,
  movimiento,
  tipo,
  banco,
  onCompletado,
}: Props) {
  const [modo, setModo] = useState<'servicio' | 'abono' | 'egreso' | 'justificar'>('justificar');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos para Servicio / Venta
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [placa, setPlaca] = useState('');
  const [vehiculoInfo, setVehiculoInfo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('mecanica');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cuenta, setCuenta] = useState('bnc');

  // Campos para Abono
  const [ventaId, setVentaId] = useState('');
  const [notaAbono, setNotaAbono] = useState('');

  // Campos para Egreso
  const [proveedor, setProveedor] = useState('');
  const [categoriaEgreso, setCategoriaEgreso] = useState('repuestos');

  // Campos para Justificación
  const [motivoJustificacion, setMotivoJustificacion] = useState('');

  useEffect(() => {
    if (!abierto || !movimiento) return;
    setError(null);

    // Cuenta predeterminada
    let ctaDefault = 'bnc';
    if (banco === 'banesco') ctaDefault = 'pago_movil_banesco';
    else if (banco === 'exterior') ctaDefault = 'pago_movil_exterior';
    else if (banco === 'cashea') ctaDefault = 'cashea';
    else if (banco === 'bnc_cuotas') ctaDefault = 'bnc';
    setCuenta(ctaDefault);

    const absMonto = Math.abs(movimiento.monto);
    setMonto(absMonto.toFixed(2));
    setFecha(movimiento.fecha);
    setReferencia(movimiento.referencia || '');

    const descTotal = `${movimiento.descripcion} ${movimiento.detalle}`.trim();
    setDescripcion(descTotal);

    // Extraer cédula / cliente si está presente
    const doc = movimiento.documento;
    if (doc) setCliente(`Cliente ${doc}`);
    else setCliente('');

    // Extraer posible placa si existe patrón tipo AAA11A o similar
    const mPlaca = /\b([A-Z]{3}\d{2}[A-Z]|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3})\b/i.exec(descTotal);
    if (mPlaca) setPlaca(mPlaca[1].toUpperCase());
    else setPlaca('');

    setProveedor(descTotal.slice(0, 40));
    setMotivoJustificacion('');

    // Modo inicial
    if (tipo === 'ingreso') setModo('servicio');
    else if (tipo === 'egreso') setModo('egreso');
    else setModo('justificar');
  }, [abierto, movimiento, tipo, banco]);

  if (!movimiento) return null;

  const movimientoHash = `${movimiento.fecha}_${movimiento.referencia}_${movimiento.monto}`;

  const ejecutarAccion = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      let body: Record<string, unknown> = {};

      if (modo === 'justificar') {
        if (!motivoJustificacion.trim()) {
          setError('Escribe el motivo de la justificación.');
          setGuardando(false);
          return;
        }
        body = {
          accion: 'justificar',
          movimientoHash,
          tipo: tipo === 'diferencia' ? 'diferencia' : tipo,
          motivo: motivoJustificacion.trim(),
          monto: Number(monto) || Math.abs(movimiento.monto),
          fecha,
        };
      } else if (modo === 'servicio') {
        body = {
          accion: 'registrar_servicio',
          movimientoHash,
          cliente: cliente || 'Cliente Conciliado',
          telefono,
          placa,
          vehiculo_info: vehiculoInfo,
          descripcion: descripcion || 'Servicio registrado desde conciliación',
          monto: Number(monto),
          enDolares: banco === 'cashea',
          fecha,
          referencia,
          cuenta,
          categoria,
        };
      } else if (modo === 'abono') {
        if (!ventaId.trim()) {
          setError('Ingresa el ID de la venta pendiente a la cual aplicar el abono.');
          setGuardando(false);
          return;
        }
        body = {
          accion: 'registrar_abono',
          movimientoHash,
          ventaId: ventaId.trim(),
          monto: Number(monto),
          cuenta,
          fecha,
          referencia,
          nota: notaAbono,
        };
      } else if (modo === 'egreso') {
        body = {
          accion: 'registrar_egreso',
          movimientoHash,
          proveedor: proveedor || 'Gasto Operativo',
          categoria: categoriaEgreso,
          total_egresos: Number(monto),
          moneda: 'VES',
          cuenta,
          fecha,
          descripcion,
          comprobante: referencia,
        };
      }

      const res = await fetch('/api/finanzas/conciliacion/accion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar la acción');

      onCompletado();
      onCerrar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const chipsSugeridos = tipo === 'ingreso'
    ? [
        'Aporte de capital / caja',
        'Pago de cliente de días previos no enlazado',
        'Comisión bancaria devuelta',
        'Ingreso extraordinario / otro',
      ]
    : tipo === 'egreso'
    ? [
        'Gasto menor de taller con soporte físico',
        'Retiro autorizado de fondos',
        'Pago directo de nómina / adelanto',
        'Comisión bancaria especial',
      ]
    : [
        'Diferencia por redondeo de céntimos',
        'Diferencia por fluctuación de tasa de cambio',
        'Descuento comercial autorizado al cliente',
      ];

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={tipo === 'ingreso' ? 'Registrar o Justificar Cobro' : tipo === 'egreso' ? 'Registrar o Justificar Gasto' : 'Justificar Diferencia'}
      subtitulo="Aplica una corrección directa o justificación contable para conciliar este movimiento"
      icono={tipo === 'ingreso' ? <Wrench className="h-5 w-5" /> : tipo === 'egreso' ? <Receipt className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
      tinteIcono="bg-primary/10 text-primary"
      ancho="lg"
    >
      <div className="space-y-4 text-[13px]">
        {/* Info del movimiento */}
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-[12px] space-y-1">
          <div className="flex justify-between font-bold text-foreground">
            <span>{movimiento.fecha} · Ref: {movimiento.referencia || 'N/A'}</span>
            <span className="tabular-nums font-mono text-[13px]">{Math.abs(movimiento.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
          </div>
          <p className="text-muted-foreground truncate">{movimiento.descripcion} {movimiento.detalle}</p>
        </div>

        {/* Selector de modo */}
        <div className="flex flex-wrap gap-1.5 border-b border-border pb-2.5">
          {tipo === 'ingreso' && (
            <>
              <button
                type="button"
                onClick={() => setModo('servicio')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === 'servicio' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                <Wrench className="h-3.5 w-3.5" /> Registrar Servicio / Venta
              </button>
              <button
                type="button"
                onClick={() => setModo('abono')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === 'abono' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                <Receipt className="h-3.5 w-3.5" /> Abonar a Venta Pendiente
              </button>
            </>
          )}

          {tipo === 'egreso' && (
            <button
              type="button"
              onClick={() => setModo('egreso')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === 'egreso' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              <Receipt className="h-3.5 w-3.5" /> Registrar Gasto / Egreso
            </button>
          )}

          <button
            type="button"
            onClick={() => setModo('justificar')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === 'justificar' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            <Tag className="h-3.5 w-3.5" /> Justificar con Motivo
          </button>
        </div>

        <form onSubmit={ejecutarAccion} className="space-y-4">
          {/* MODO 1: REGISTRAR SERVICIO */}
          {modo === 'servicio' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Crea la orden de servicio y su asiento contable completo en el sistema, etiquetado como <strong>Conciliado</strong> y disponible en el módulo de servicios.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Nombre del Cliente</label>
                  <input
                    type="text"
                    value={cliente}
                    onChange={e => setCliente(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    placeholder="Ej. Juan Pérez"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Teléfono (opcional)</label>
                  <input
                    type="text"
                    value={telefono}
                    onChange={e => setTelefono(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    placeholder="0414-1234567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Placa (opcional)</label>
                  <input
                    type="text"
                    value={placa}
                    onChange={e => setPlaca(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none uppercase"
                    placeholder="AB123CD"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Vehículo (Marca / Modelo)</label>
                  <input
                    type="text"
                    value={vehiculoInfo}
                    onChange={e => setVehiculoInfo(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    placeholder="Ej. Toyota Corolla"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Categoría del Servicio</label>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none"
                  >
                    {CATEGORIAS_VENTA.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Cuenta de Cobro</label>
                  <select
                    value={cuenta}
                    onChange={e => setCuenta(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none"
                  >
                    <option value="bnc">BNC (Bs)</option>
                    <option value="pago_movil_banesco">Pago Móvil Banesco</option>
                    <option value="punto_banesco">Punto Banesco</option>
                    <option value="pago_movil_exterior">Exterior (Bs)</option>
                    <option value="punto_bancamiga">Bancamiga (Bs)</option>
                    <option value="cashea">Cashea ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Descripción del Trabajo</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="Detalle del servicio realizado"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Monto ({banco === 'cashea' ? 'USD' : 'Bs'})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-bold tabular-nums text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Fecha</label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Comprobante / Ref</label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={e => setReferencia(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* MODO 2: ABONO A VENTA PENDIENTE */}
          {modo === 'abono' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Aplica este cobro bancario como abono que reduce el saldo pendiente de una venta existente en el sistema.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">ID de la Venta (UUID)</label>
                <input
                  type="text"
                  value={ventaId}
                  onChange={e => setVentaId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
                  placeholder="Pega el ID de la venta (ej. f24a7b9c-...)"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Monto a Abonar</label>
                  <input
                    type="number"
                    step="0.01"
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-bold tabular-nums text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Fecha</label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Nota del Abono</label>
                <input
                  type="text"
                  value={notaAbono}
                  onChange={e => setNotaAbono(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="Ej. Cobro verificado por conciliación bancaria"
                />
              </div>
            </div>
          )}

          {/* MODO 3: REGISTRAR EGRESO / GASTO */}
          {modo === 'egreso' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Registra este pago bancario en el módulo contable de egresos del taller.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Proveedor / Beneficiario</label>
                  <input
                    type="text"
                    value={proveedor}
                    onChange={e => setProveedor(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    placeholder="Ej. Repuestos El Rey"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Categoría del Gasto</label>
                  <select
                    value={categoriaEgreso}
                    onChange={e => setCategoriaEgreso(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground font-medium focus:border-primary focus:outline-none"
                  >
                    <option value="repuestos">Repuestos y Materiales</option>
                    <option value="nomina">Nómina y Personal</option>
                    <option value="servicios_publicos">Servicios Públicos (Luz/Agua/Net)</option>
                    <option value="mantenimiento">Mantenimiento de Taller</option>
                    <option value="alquiler">Alquiler</option>
                    <option value="otros">Otros Gastos Operativos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Descripción / Motivo</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="Detalle del gasto"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Monto (Bs)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-bold tabular-nums text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Fecha</label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Comprobante / Ref</label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={e => setReferencia(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* MODO 4: JUSTIFICAR */}
          {modo === 'justificar' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Marca este movimiento con una <strong>justificación contable autorizada</strong> para que conste en el informe y sume a la conciliación sin requerir un asiento contable directo.
              </p>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">Motivo de la Justificación</label>
                <textarea
                  value={motivoJustificacion}
                  onChange={e => setMotivoJustificacion(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  placeholder="Escribe el motivo detallado de esta justificación..."
                  required
                />
              </div>

              <div>
                <span className="block text-[11px] font-bold text-muted-foreground uppercase mb-1.5">Sugerencias rápidas:</span>
                <div className="flex flex-wrap gap-1.5">
                  {chipsSugeridos.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setMotivoJustificacion(chip)}
                      className="rounded-lg border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground/80 hover:border-primary hover:text-foreground"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {guardando ? 'Guardando...' : modo === 'justificar' ? 'Guardar Justificación' : 'Guardar y Trasladar'}
            </button>
          </div>
        </form>
      </div>
    </ModalBase>
  );
}
