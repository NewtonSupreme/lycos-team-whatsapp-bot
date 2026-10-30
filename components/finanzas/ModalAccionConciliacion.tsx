'use client';

import React, { useEffect, useState } from 'react';
import { Check, Clock, Loader2, Receipt, Scale, Tag, Wrench } from 'lucide-react';
import ModalBase from '@/components/ui/modales/ModalBase';
import type { MovimientoBanco, BancoConciliable } from '@/lib/conciliacion/leer-estado';
import type { AsientoSistema } from '@/lib/conciliacion/motor';
import { CATEGORIAS_VENTA } from '@/lib/categorias';
import { CATEGORIAS_EGRESO } from '@/components/egresos/tipos';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  movimiento: MovimientoBanco | null;
  tipo: 'ingreso' | 'egreso' | 'diferencia';
  banco: BancoConciliable;
  onCompletado: () => void;
  /** El registro del sistema con el que el banco habla del mismo pago (montos distintos). */
  sistema?: AsientoSistema | null;
  /** Para dejar rastro: la corrida de la que sale este caso. */
  corridaId?: string | null;
}

export default function ModalAccionConciliacion({
  abierto,
  onCerrar,
  movimiento,
  tipo,
  banco,
  onCompletado,
  sistema = null,
  corridaId = null,
}: Props) {
  const [modo, setModo] = useState<'servicio' | 'abono' | 'egreso' | 'justificar' | 'corregir' | 'seguimiento'>('justificar');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que se registró (para que nadie lo vuelva a registrar a mano) y el aviso si ya existía.
  const [conIva, setConIva] = useState(false);
  const [duplicada, setDuplicada] = useState<{ id: string; fecha: string; cliente: string; total: number; creadoPor?: string } | null>(null);
  const [exito, setExito] = useState<null | { cliente: string; fecha: string; ingresoUsd: number; pagadoUsd: number; conIva: boolean; montoBanco: number; factura: string | null }>(null);

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

  // Campos para Justificación y seguimiento
  const [motivoJustificacion, setMotivoJustificacion] = useState('');
  const [motivoSeguimiento, setMotivoSeguimiento] = useState('');
  const [confirmaDolares, setConfirmaDolares] = useState(false);

  const puedeCorregir = tipo === 'diferencia' && !!sistema && (sistema.tabla === 'ventas_dia' || sistema.tabla === 'egresos') && !sistema.enDolares;

  useEffect(() => {
    if (!abierto || !movimiento) return;
    setError(null);
    setDuplicada(null); setExito(null); setConIva(false);

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
    setMotivoSeguimiento('');
    setConfirmaDolares(false);

    // Modo inicial
    if (tipo === 'ingreso') setModo('servicio');
    else if (tipo === 'egreso') setModo('egreso');
    else if (sistema && (sistema.tabla === 'ventas_dia' || sistema.tabla === 'egresos') && !sistema.enDolares) setModo('corregir');
    else setModo('justificar');
  }, [abierto, movimiento, tipo, banco, sistema]);

  if (!movimiento) return null;

  const movimientoHash = `${movimiento.fecha}_${movimiento.referencia}_${movimiento.monto}`;
  const casoActual = tipo === 'ingreso' ? 'sin_registrar' : tipo === 'egreso' ? 'pago_sin_gasto' : 'monto_distinto';
  const montoBanco = Math.abs(movimiento.monto);
  // Qué pasa si el sistema toma el monto del banco: los dólares de la venta NO cambian, así que se avisa si el monto nuevo ya no cuadra con ellos.
  const tasaVenta = sistema?.tasa || 0;
  const usdVenta = sistema?.usd || 0;
  const usdNuevo = tasaVenta > 0 ? montoBanco / tasaVenta : 0;
  const desvioUsd = usdVenta > 0 && usdNuevo > 0 ? Math.abs(usdNuevo - usdVenta) / usdVenta : 0;
  const cambiaDolares = desvioUsd > 0.02;

  const ejecutarAccion = async (e: React.FormEvent, forzar = false) => {
    e.preventDefault();
    setDuplicada(null);
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
          conIva,
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

      if (modo === 'corregir') {
        if (!sistema) throw new Error('No hay registro del sistema que corregir.');
        if (cambiaDolares && !confirmaDolares) {
          setError('El monto del banco cambia el valor en dólares de la venta. Marca la confirmación si el banco es el correcto.');
          setGuardando(false);
          return;
        }
        body = { accion: 'corregir_monto', movimientoHash, tabla: sistema.tabla, registroId: sistema.registroId, cuenta: sistema.cuenta, montoNuevo: montoBanco, montoBanco, fecha: movimiento.fecha };
      } else if (modo === 'seguimiento') {
        if (!motivoSeguimiento.trim()) {
          setError('Anota qué falta para resolverlo.');
          setGuardando(false);
          return;
        }
        body = { accion: 'seguimiento', movimientoHash, motivo: motivoSeguimiento.trim(), monto: montoBanco, fecha: movimiento.fecha };
      }

      const res = await fetch('/api/finanzas/conciliacion/accion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, banco, corridaId, caso: casoActual, refMovimiento: movimiento.referencia || null, forzar }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.duplicada) setDuplicada(data.duplicada);
        throw new Error(data.error || 'Error al procesar la acción');
      }

      // Una venta registrada se confirma con lo que quedó: quien la hizo ve que ya está y no la repite a mano.
      if (modo === 'servicio' && data.resumen) { setExito(data.resumen); return; }
      onCompletado();
      onCerrar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = () => { if (exito) onCompletado(); onCerrar(); };

  if (exito) {
    return (
      <ModalBase abierto={abierto} onCerrar={cerrar} titulo="Venta registrada" subtitulo="Ya está en el sistema: no hace falta registrarla otra vez" icono={<Check className="h-5 w-5" />} tinteIcono="bg-emerald-500/10 text-emerald-600" ancho="md">
        <div className="space-y-3 text-[13px]">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="text-[14px] font-black text-foreground">{exito.cliente}</p>
            <p className="mt-1 text-foreground/85">Con fecha <strong>{exito.fecha.split('-').reverse().join('/')}</strong> · ingreso <strong>${exito.ingresoUsd.toFixed(2)}</strong>{exito.conIva ? ` (+ IVA = $${exito.pagadoUsd.toFixed(2)} cobrados)` : ''}</p>
            <p className="text-foreground/85">Entró por {exito.montoBanco.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {banco === 'cashea' ? 'USD' : 'Bs'}{exito.factura ? ` · factura ${exito.factura}` : ''}</p>
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-muted-foreground">
            <li>Suma a los <strong>ingresos del reporte diario de ese día</strong> y a la cuenta del banco.</li>
            <li>Quedó en Ventas, Servicios y Facturas, marcada como registrada desde la conciliación.</li>
            <li>Si el cliente se registra a mano otra vez, el sistema avisará del duplicado.</li>
          </ul>
          <div className="flex justify-end"><button type="button" onClick={cerrar} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90">Listo</button></div>
        </div>
      </ModalBase>
    );
  }

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
      titulo={tipo === 'ingreso' ? 'Registrar o Justificar Cobro' : tipo === 'egreso' ? 'Registrar o Justificar Gasto' : 'Resolver monto distinto'}
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

          {puedeCorregir && (
            <button
              type="button"
              onClick={() => setModo('corregir')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === 'corregir' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              <Scale className="h-3.5 w-3.5" /> Corregir el monto del sistema
            </button>
          )}
          <button
            type="button"
            onClick={() => setModo('seguimiento')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-[12px] transition-colors ${modo === 'seguimiento' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            <Clock className="h-3.5 w-3.5" /> Dejar en seguimiento
          </button>
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

              <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-2.5 text-[12px] text-foreground/85">
                <input type="checkbox" checked={conIva} onChange={e => setConIva(e.target.checked)} className="mt-0.5" />
                <span>El pago <strong>incluye el IVA (16%)</strong>: el ingreso de la venta será la base sin IVA y la factura saldrá con IVA, como al cobrar a mano.</span>
              </label>

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
                    {/* Las mismas categorías de todo el sistema: con otras, el gasto no salía en su rubro ni en la utilidad del carro. */}
                    {CATEGORIAS_EGRESO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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

          {/* MODO 5: CORREGIR EL MONTO DEL SISTEMA */}
          {modo === 'corregir' && sistema && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                El banco confirma el pago de <strong>{sistema.concepto}</strong>. El sistema tomará el monto del banco en la cuenta <strong>{sistema.cuenta.replace(/_/g, ' ')}</strong>;
                el total en dólares, la tasa y los demás datos no se tocan, y queda anotado el valor anterior.
              </p>
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-center">
                <div><span className="block text-[10.5px] font-bold uppercase text-muted-foreground">Sistema ahora</span><span className="font-mono text-[14px] font-bold tabular-nums">{sistema.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
                <div><span className="block text-[10.5px] font-bold uppercase text-muted-foreground">Quedará (banco)</span><span className="font-mono text-[14px] font-bold tabular-nums text-primary">{montoBanco.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
                <div><span className="block text-[10.5px] font-bold uppercase text-muted-foreground">Cambio</span><span className="font-mono text-[14px] font-bold tabular-nums">{(montoBanco - sistema.monto).toLocaleString('es-VE', { minimumFractionDigits: 2, signDisplay: 'always' })}</span></div>
              </div>
              {tasaVenta > 0 && (
                <p className="text-[11.5px] text-muted-foreground">
                  A la tasa de la venta ({tasaVenta.toLocaleString('es-VE', { minimumFractionDigits: 4 })}): ${usdNuevo.toFixed(2)} con el monto del banco; la venta vale ${usdVenta.toFixed(2)}.
                </p>
              )}
              {cambiaDolares && (
                <label className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12px] text-amber-800 dark:text-amber-300">
                  <input type="checkbox" checked={confirmaDolares} onChange={e => setConfirmaDolares(e.target.checked)} className="mt-0.5" />
                  <span>El monto del banco equivale a ${usdNuevo.toFixed(2)}, no a ${usdVenta.toFixed(2)}: la diferencia es grande. Confirmo que el banco es el correcto y el sistema tenía el monto mal digitado.</span>
                </label>
              )}
            </div>
          )}

          {/* MODO 6: SEGUIMIENTO */}
          {modo === 'seguimiento' && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                No se resuelve hoy, pero queda anotado quién lo vio, qué falta y cuándo. Aparece en el historial de conciliaciones y marcado en este movimiento.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">¿Qué falta para resolverlo?</label>
                <textarea
                  value={motivoSeguimiento}
                  onChange={e => setMotivoSeguimiento(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  placeholder="Ej. Esperando el comprobante del cliente / preguntar a Cesar quién cobró"
                />
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
          {duplicada && (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12px] text-amber-900 dark:text-amber-200">
              <p><strong>Posible duplicado.</strong> {duplicada.cliente} · ${duplicada.total.toFixed(2)} · {duplicada.fecha}{duplicada.creadoPor ? ` · ${duplicada.creadoPor}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setDuplicada(null); setError(null); }} className="rounded-lg border border-amber-500/50 px-2.5 py-1 font-bold hover:bg-amber-500/20">Es el mismo pago: no registrar</button>
                <button type="button" onClick={e => void ejecutarAccion(e as unknown as React.FormEvent, true)} className="rounded-lg bg-amber-600 px-2.5 py-1 font-bold text-white hover:opacity-90">Es otro pago: registrar de todos modos</button>
              </div>
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
              {guardando ? 'Guardando...' : modo === 'justificar' ? 'Guardar Justificación' : modo === 'seguimiento' ? 'Dejar en seguimiento' : modo === 'corregir' ? 'Corregir el monto' : 'Guardar y Trasladar'}
            </button>
          </div>
        </form>
      </div>
    </ModalBase>
  );
}
