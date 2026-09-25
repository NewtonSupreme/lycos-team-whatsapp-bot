'use client';

import { useCallback, useEffect, useState } from 'react';
import LogoBanco from '@/components/pagos/LogoBanco';
import { BANK_METHODS, type BankBin } from '@/lib/reporte/ventas-mapping';
import {
  AlertTriangle, CalendarX, CheckCircle2, Clock, ExternalLink, Loader2,
  Mail, Phone, Truck, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { getPermisos, hasPermiso, resolveRol } from '@/types';
import type { PagoVencido } from '@/lib/alertas/pagos';

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const bs = (n: number) =>
  `Bs ${(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El teléfono en forma de enlace de WhatsApp venezolano. */
const waLink = (tel: string | null) => {
  if (!tel) return null;
  const d = String(tel).replace(/\D/g, '');
  if (d.length < 10) return null;
  const local = d.slice(-10);
  return `https://wa.me/58${local.replace(/^0/, '')}`;
};

/**
 * El aviso de que hay que pagarle a un proveedor.
 *
 * Ocupa la pantalla entera y es rojo a propósito. Lo que contaba
 * administración: la fecha de pago llegaba, nadie la veía, y el proveedor
 * llamaba a reclamar. Un cartelito en una esquina se ignora; esto no se puede
 * ignorar, y trae ya el monto, la tasa del día y el teléfono para resolverlo
 * en el momento.
 *
 * Dos salidas, y ninguna es cerrar y olvidar:
 *
 *   · «Recordar más tarde» solo lo aparta en esta sesión. Al recargar vuelve, y
 *     seguirá volviendo cada día hasta que se pague. No se guarda en la base a
 *     propósito: un «recordar» que persiste es un aviso apagado.
 *   · «Ya pagué» liquida la deuda y la asienta como gasto del día, así que el
 *     dinero aparece en los reportes. Solo entonces deja de salir.
 */
export default function AlertaPagoProveedor() {
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede } = useSedeStore();
  const sedeId = currentSede?.id || null;

  const permisos = getPermisos(user?.rol || 'empleado', user?.permisos, roleDefaults);
  const puedeVer = resolveRol(user?.rol) === 'admin' || hasPermiso(permisos.reportes, 'leer');
  const puedePagar = resolveRol(user?.rol) === 'admin' || hasPermiso(permisos.reportes, 'editar');

  const [pagos, setPagos] = useState<PagoVencido[] | null>(null);
  const [tasa, setTasa] = useState(0);
  /**
   * Los que se han aparcado en esta sesión.
   *
   * Vive en memoria a propósito: «recordar más tarde» tiene que volver a salir
   * al recargar. Guardarlo en la base o en el navegador lo convertiría en un
   * «no me avises más», que es justo lo que administración quería evitar.
   */
  const [aparcados, setAparcados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // De qué cuenta salió el pago. Sin esto el gasto quedaba asentado, pero
  // ningún saldo de banco bajaba: Finanzas no sabía de dónde descontarlo.
  const [cuenta, setCuenta] = useState<BankBin | null>(null);

  const cargar = useCallback(async () => {
    try {
      const qs = sedeId ? `?sede=${sedeId}` : '';
      const r = await fetch(`/api/alertas/pagos${qs}`);
      if (!r.ok) { setPagos([]); return; }
      const d = await r.json();
      setPagos(d.pagos || []);
      setTasa(Number(d.tasa) || 0);
    } catch {
      // Un fallo al consultar no debe tapar la pantalla con un aviso roto.
      setPagos([]);
    }
  }, [sedeId]);

  useEffect(() => {
    if (!user || !puedeVer) return;
    cargar();
  }, [user, puedeVer, cargar]);

  // Se atiende de una en una, la más atrasada primero: la lista llega ya
  // ordenada por el servidor. Enseñar cinco deudas a la vez es pedir que se
  // cierren todas sin leer ninguna.
  const pendientes = (pagos || []).filter(p => !aparcados.has(`${p.origen}:${p.id}`));
  const pago = pendientes[0] ?? null;

  if (!pago) return null;

  const clave = `${pago.origen}:${pago.id}`;

  const aparcar = () => {
    setAparcados(s => new Set(s).add(clave));
    setCuenta(null);
    setError('');
  };

  const yaPague = async () => {
    if (!cuenta) { setError('Elige de qué cuenta salió el pago.'); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await fetch('/api/alertas/pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origen: pago.origen, id: pago.id, cuenta, tasa }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo registrar el pago');
      // Se quita de la lista y se vuelve a consultar: si quedaban más deudas
      // vencidas, la siguiente sale sola.
      setAparcados(s => new Set(s).add(clave));
      setCuenta(null);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const wa = waLink(pago.telefono);
  const enBs = tasa > 0 ? pago.saldo * tasa : 0;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alerta-pago-titulo"
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-[#7f1d1d]/95 p-4 backdrop-blur-sm"
    >
      <div className="my-auto w-full max-w-[680px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Cabecera */}
        <header className="bg-[#dc2626] px-6 py-5 text-white">
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <AlertTriangle className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-white/80">
                {pago.diasVencido === 0 ? 'Vence hoy' : `Vencido hace ${pago.diasVencido} día(s)`}
              </p>
              <h2 id="alerta-pago-titulo" className="text-[22px] font-extrabold leading-tight">
                Hay que pagarle a {pago.proveedor}
              </h2>
              <p className="mt-0.5 text-[13px] leading-snug text-white/90">{pago.descripcion}</p>
            </div>
            {pendientes.length > 1 && (
              <span className="num shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-[12px] font-bold">
                1 de {pendientes.length}
              </span>
            )}
          </div>
        </header>

        {/* El dinero */}
        <div className="grid grid-cols-1 gap-px bg-[#eef0f3] sm:grid-cols-3">
          <div className="bg-white px-5 py-4">
            <p className="text-[11px] font-medium text-[#8a909c]">Se le debe</p>
            <p className="num text-[26px] font-extrabold leading-tight text-[#dc2626]">
              {money(pago.saldo)}
            </p>
            {pago.pagado > 0 && (
              <p className="num text-[11px] text-[#8a909c]">
                de {money(pago.total)} · abonado {money(pago.pagado)}
              </p>
            )}
          </div>
          <div className="bg-white px-5 py-4">
            <p className="text-[11px] font-medium text-[#8a909c]">En bolívares hoy</p>
            <p className="num text-[20px] font-extrabold leading-tight text-[#16181d]">
              {tasa > 0 ? bs(enBs) : '—'}
            </p>
            <p className="num text-[11px] text-[#8a909c]">
              {tasa > 0 ? `tasa BCV ${tasa.toLocaleString('es-VE', { maximumFractionDigits: 2 })}` : 'sin tasa del día'}
            </p>
          </div>
          <div className="bg-white px-5 py-4">
            <p className="text-[11px] font-medium text-[#8a909c]">Fecha límite</p>
            <p className="num flex items-center gap-1.5 text-[17px] font-extrabold leading-tight text-[#16181d]">
              <CalendarX className="h-4 w-4 text-[#dc2626]" aria-hidden />
              {pago.fecha_vencimiento}
            </p>
            <p className="num text-[11px] text-[#8a909c]">comprado el {pago.fecha}</p>
          </div>
        </div>

        {/* De qué es y a quién */}
        <div className="space-y-3 border-t border-[#eef0f3] px-6 py-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Truck className="mt-px h-4 w-4 shrink-0 text-[#8a909c]" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] text-[#8a909c]">Concepto</dt>
                <dd className="font-semibold text-[#16181d]">{pago.concepto}</dd>
              </div>
            </div>

            {pago.placa && (
              <div className="flex items-start gap-2">
                <span className="num mt-px rounded bg-[#16181d] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pago.placa}
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] text-[#8a909c]">Vehículo</dt>
                  <dd className="truncate font-semibold text-[#16181d]">
                    {pago.vehiculo_info || pago.placa}
                    {pago.cliente_nombre && <span className="font-normal text-[#5b616e]"> · {pago.cliente_nombre}</span>}
                  </dd>
                </div>
              </div>
            )}

            {pago.contacto && (
              <div className="flex items-start gap-2">
                <User className="mt-px h-4 w-4 shrink-0 text-[#8a909c]" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-[11px] text-[#8a909c]">Contacto</dt>
                  <dd className="truncate font-semibold text-[#16181d]">{pago.contacto}</dd>
                </div>
              </div>
            )}

            {pago.email && (
              <div className="flex items-start gap-2">
                <Mail className="mt-px h-4 w-4 shrink-0 text-[#8a909c]" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-[11px] text-[#8a909c]">Correo</dt>
                  <dd className="truncate">
                    <a href={`mailto:${pago.email}`} className="font-semibold text-[#2563eb] hover:underline">
                      {pago.email}
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>

          {/* Cómo contactarlo, a un clic */}
          <div className="flex flex-wrap gap-2">
            {pago.telefono ? (
              <>
                <a
                  href={`tel:${pago.telefono}`}
                  className="num flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3.5 text-[12.5px] font-semibold text-[#16181d] hover:bg-[#f6f7f9]"
                >
                  <Phone className="h-4 w-4 text-[#5b616e]" aria-hidden />
                  {pago.telefono}
                </a>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#25d366] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#1fb855]"
                  >
                    Escribirle por WhatsApp
                  </a>
                )}
              </>
            ) : (
              <p className="flex items-center gap-1.5 rounded-lg bg-[#fdf5e2] px-3 py-2 text-[11.5px] text-[#a16207]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Este proveedor no tiene teléfono guardado. Añádelo en Proveedores para
                poder contactarlo desde aquí.
              </p>
            )}
            {pago.enlace && (
              <a
                href={pago.enlace}
                target="_blank"
                rel="noreferrer"
                className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3.5 text-[12.5px] font-semibold text-[#2563eb] hover:bg-[#f6f7f9]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Ver la compra
              </a>
            )}
          </div>

          {/* De qué cuenta sale. Una sola: para repartir un pago entre dos
              cuentas está el renglón de la ficha, con el panel completo. */}
          {puedePagar && (
            <div>
              <p className="mb-1.5 text-[11.5px] font-semibold text-[#3d4350]">¿De qué cuenta salió el pago?</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {BANK_METHODS.filter(m => m.id !== 'cashea').map(m => {
                  const monto = m.moneda === 'Bs'
                    ? (tasa > 0 ? bs(pago.saldo * tasa) : '—')
                    : money(pago.saldo);
                  const elegida = cuenta === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setCuenta(m.id); setError(''); }}
                      disabled={m.moneda === 'Bs' && !(tasa > 0)}
                      aria-pressed={elegida}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-40',
                        elegida ? 'border-[#16a34a] bg-[#e8f7ee]' : 'border-[#e2e5ea] hover:bg-[#f6f7f9]',
                      )}
                    >
                      <LogoBanco id={m.id} size={20} />
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[11px] font-medium text-[#16181d]">{m.label}</span>
                        <span className="num block text-[10.5px] text-[#8a909c]">{monto}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12.5px] text-[#b91c1c]">
              {error}
            </p>
          )}
        </div>

        {/* Qué hacer */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-[#eef0f3] bg-[#fafbfc] px-6 py-4">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-[#8a909c]">
            {puedePagar
              ? '«Ya pagué» lo registra como gasto de hoy y deja de avisar. «Recordar más '
                + 'tarde» solo lo aparta: al recargar la pantalla volverá a salir.'
              : 'No tienes permiso para registrar pagos. Avísale a administración.'}
          </p>

          <button
            onClick={aparcar}
            disabled={guardando}
            className="flex h-[42px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-4 text-[12.5px] font-semibold text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-50"
          >
            <Clock className="h-4 w-4" aria-hidden />
            Recordar más tarde
          </button>

          {puedePagar && (
            <button
              onClick={yaPague}
              disabled={guardando || !cuenta}
              title={cuenta ? undefined : 'Elige primero de qué cuenta salió'}
              className={cn(
                'flex h-[42px] items-center gap-2 rounded-lg bg-[#16a34a] px-5 text-[13px] font-bold text-white',
                'hover:bg-[#15803d] disabled:opacity-50',
              )}
            >
              {guardando
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              {guardando ? 'Registrando…' : 'Ya pagué'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
