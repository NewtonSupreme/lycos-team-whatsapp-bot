'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, Download, FileSpreadsheet,
  Landmark, Loader2, Plus, RotateCcw, Scale, ShieldAlert, ShieldCheck, Tag, Trash2, Upload, Wrench, X,
} from 'lucide-react';
import LogoBanco from '@/components/pagos/LogoBanco';
import DescontarCuotasCashea from '@/components/finanzas/DescontarCuotasCashea';
import ModalAccionConciliacion from '@/components/finanzas/ModalAccionConciliacion';
import ModalTraspasoConciliacion from '@/components/finanzas/ModalTraspasoConciliacion';
import ModalSistemaConciliacion, { type CasoSistema } from '@/components/finanzas/ModalSistemaConciliacion';
import HistorialConciliacion from '@/components/finanzas/HistorialConciliacion';
import { Chip, Panel, Pestanas, TarjetaKpi, Vacio } from '@/components/panel/Piezas';
import { cn } from '@/lib/utils';
import type { BankBin } from '@/lib/reporte/ventas-mapping';
import type { BancoConciliable, MovimientoBanco } from '@/lib/conciliacion/leer-estado';
import type { AsientoSistema, ResultadoConciliacion } from '@/lib/conciliacion/motor';
import { CUENTAS_DEL_BANCO } from '@/lib/conciliacion/motor';
import type { MetaConciliacion } from '@/lib/conciliacion-pdf';

/**
 * Conciliación bancaria.
 *
 * Se elige el banco, se suelta el estado de cuenta tal como lo descarga el
 * banco y el servidor lo valida contra la plantilla, comprueba el saldo fila a
 * fila y lo cruza con las ventas, cobros y gastos del sistema. Aquí se enseña
 * el veredicto, la prueba de que cada bolívar está explicado y cada diferencia
 * con nombre y apellido; el PDF lleva lo mismo para el dueño o el contador.
 */

const BANCOS: Array<{ id: BancoConciliable; logo: BankBin; nombre: string; plantilla: string; cuenta: string; cruce?: string }> = [
  { id: 'banesco', logo: 'pago_movil_banesco', nombre: 'Banesco', plantilla: 'Movimientos de Banesco Online exportados a Excel (.xls)', cuenta: 'PM / transferencias y Punto Banesco' },
  { id: 'bnc', logo: 'bnc', nombre: 'BNC 8201 · Iniciales / General', plantilla: 'Reporte «Movimientos entre fechas» cuenta 8201 (.xls)', cuenta: 'Cuenta general / iniciales Cashea y PM', cruce: 'Reporte de Cashea del mismo mes' },
  { id: 'bnc_cuotas', logo: 'bnc', nombre: 'BNC 8215 · Cuotas Cashea', plantilla: 'Reporte «Movimientos entre fechas» cuenta 8215 (.xls)', cuenta: 'Cuenta de cuotas Cashea exclusivamente', cruce: 'Reporte de Cashea del mismo mes' },
  { id: 'exterior', logo: 'pago_movil_exterior', nombre: 'Banco Exterior', plantilla: 'Movimientos de Exterior en Línea exportados a Excel (.xls)', cuenta: 'Pago móvil Exterior' },
  { id: 'cashea', logo: 'cashea', nombre: 'Cashea', plantilla: 'Reporte de cuotas cobradas del portal de comercios (.xlsx)', cuenta: 'Cada orden financiada con su venta', cruce: 'Estado del BNC del mismo mes' },
];

const num = (x: number, d = 2) => (Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const bs = (x: number) => `Bs ${num(x)}`;
const usd = (x: number) => `$${num(x)}`;
const fecha = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const NOMBRE_CUENTA: Record<string, string> = {
  pago_movil_banesco: 'PM / Transf. Banesco', punto_banesco: 'Punto Banesco', bnc: 'PM / Transf. BNC',
  punto_bancamiga: 'Punto Bancamiga', pago_movil_exterior: 'PM Exterior', efectivo_bs: 'Efectivo Bs',
  dolares: 'Efectivo $', zelle: 'Zelle', binance: 'Binance', cashea: 'Cashea / BNC',
};
const REGLA: Record<string, string> = {
  referencia: 'Referencia y monto', mismo_dia: 'Monto exacto, mismo día', fecha_cercana: 'Monto exacto, fecha cercana',
  fecha_lejana: 'Monto exacto, fecha lejana', agrupado_banco: 'Un pago, varios registros', agrupado_sistema: 'Varios pagos, un registro',
  tasa_dolar: 'Dólares a la tasa del día', cashea_usd: 'Cuota en dólares', inicial_tardia: 'Inicial pagada días después (revisar)', redondeo: 'Mismo día, redondeo de la tasa',
};

type Pestana = 'sin_registrar' | 'no_llegaron' | 'iniciales' | 'otra_cuenta' | 'diferencias' | 'traspasos' | 'justificados' | 'ordenes' | 'pagos' | 'gastos' | 'banco' | 'conciliados';

export default function ConciliacionBancaria({ sede }: { sede?: string | null }) {
  const [banco, setBanco] = useState<BancoConciliable | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cruce, setCruce] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<{ resultado: ResultadoConciliacion; meta: MetaConciliacion } | null>(null);
  const [pestana, setPestana] = useState<Pestana>('sin_registrar');
  const [historialInicio, setHistorialInicio] = useState(false);

  const elegido = BANCOS.find(b => b.id === banco) || null;

  const conciliar = useCallback(async () => {
    if (!banco || !archivo) return;
    setCargando(true); setError(null);
    try {
      const fd = new FormData();
      fd.set('banco', banco);
      fd.set('archivo', archivo);
      if (cruce) fd.set('cruce', cruce);
      if (sede) fd.set('sede', sede);
      const r = await fetch('/api/finanzas/conciliacion', { method: 'POST', body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const sugerido = j?.detectado ? BANCOS.find(b => b.id === j.detectado) : null;
        setError(`${j?.error || 'No se pudo conciliar.'}${sugerido ? ` Puedes cambiar a «${sugerido.nombre}» y volver a intentarlo.` : ''}`);
        return;
      }
      setDatos(j);
      const r0 = j.resultado as ResultadoConciliacion;
      // Abre la primera pestaña que tenga algo que atender.
      const orden: Array<[Pestana, number]> = [
        ['sin_registrar', r0.ingresos.sinRegistrar.length], ['no_llegaron', r0.ingresos.noLlegaron.length],
        ['iniciales', r0.ingresos.inicialesSinCuenta.length], ['otra_cuenta', r0.ingresos.enOtraCuenta.length],
        ['diferencias', r0.ingresos.diferencias.length + r0.egresos.diferencias.length],
        ['traspasos', (r0.traspasosInternos?.banco || []).length],
        ['ordenes', r0.ordenesCashea.length], ['pagos', r0.egresos.sinRegistrar.length], ['gastos', r0.egresos.noSalieron.length],
      ];
      setPestana(orden.find(([, n]) => n > 0)?.[0] || 'conciliados');
    } catch {
      setError('No se pudo contactar con el servidor. Revisa la conexión e inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }, [banco, archivo, cruce, sede]);

  const descargarPdf = useCallback(async () => {
    if (!datos) return;
    const { generarConciliacionPDF } = await import('@/lib/conciliacion-pdf');
    generarConciliacionPDF(datos.resultado, datos.meta);
  }, [datos]);

  const reiniciar = () => { setDatos(null); setArchivo(null); setCruce(null); setError(null); };

  if (datos) {
    return <Resultado datos={datos} pestana={pestana} setPestana={setPestana} onPdf={descargarPdf} onNueva={reiniciar} onRecargar={conciliar} archivo={archivo} sede={sede} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setHistorialInicio(v => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-[12.5px] font-semibold text-foreground hover:border-primary">
          {historialInicio ? 'Ocultar historial' : 'Historial y seguimiento'}
        </button>
      </div>
      {historialInicio && <HistorialConciliacion banco={null} sede={sede} />}
      <Panel
        titulo="Conciliación bancaria"
        subtitulo="Sube el estado de cuenta tal como lo descarga el banco: se valida, se verifica y se cruza con el sistema"
      >
        <p className="mb-2 text-[11.5px] font-semibold text-muted-foreground">1 · ¿De qué cuenta es el estado?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {BANCOS.map(b => {
            const activo = banco === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => { setBanco(b.id); setError(null); if (!b.cruce) setCruce(null); }}
                aria-pressed={activo}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                  activo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50',
                )}
              >
                <LogoBanco id={b.logo} size={34} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-foreground">{b.nombre}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{b.cuenta}</span>
                </span>
                {activo && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>

        <p className="mb-2 mt-4 text-[11.5px] font-semibold text-muted-foreground">2 · El archivo</p>
        <ZonaArchivo
          archivo={archivo}
          onArchivo={f => { setArchivo(f); setError(null); }}
          titulo={elegido ? `Estado de cuenta de ${elegido.nombre}` : 'Estado de cuenta'}
          detalle={elegido ? `Se espera: ${elegido.plantilla}. Sin abrirlo ni modificarlo.` : 'Primero elige el banco.'}
          deshabilitada={!banco}
        />
        {elegido?.cruce && (
          <div className="mt-2">
            <ZonaArchivo
              compacta
              archivo={cruce}
              onArchivo={setCruce}
              titulo={`${elegido.cruce} (recomendado)`}
              detalle={banco === 'bnc'
                ? 'Explica cada pago móvil del BNC con su cuota de Cashea y los concilia en dólares, al céntimo.'
                : 'Comprueba que cada cuota del reporte entró de verdad al BNC, con su referencia.'}
            />
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={conciliar}
            disabled={!banco || !archivo || cargando}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Scale className="h-4 w-4" aria-hidden />}
            {cargando ? 'Conciliando…' : 'Conciliar'}
          </button>
          {cargando && (
            <span className="text-[11.5px] text-muted-foreground">
              Validando la plantilla, verificando el saldo fila a fila y cruzando con ventas, cobros y gastos…
            </span>
          )}
        </div>
      </Panel>

      <Panel titulo="Cómo concilia" subtitulo="Para que cada resultado se pueda discutir">
        <ol className="grid grid-cols-1 gap-2 text-[11.5px] leading-snug text-foreground/80 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Plantilla', 'Reconoce el banco por la estructura del archivo, no por el nombre. Si subes el de otro banco, lo dice y no sigue.'],
            ['Integridad', 'Cada saldo tiene que ser el anterior más el movimiento, al céntimo. Si falta o sobra una fila, se ve antes de conciliar.'],
            ['Cruce', 'Monto exacto al céntimo y fecha. Se prueba también un pago contra varios registros, y los dólares a la tasa del día.'],
            ['Prueba', 'Cada bolívar del estado queda en una sola categoría. Si la suma no da el total del banco, se avisa.'],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-xl border border-border bg-muted/30 p-3">
              <span className="text-[10.5px] font-black uppercase tracking-wider text-primary">{i + 1} · {t}</span>
              <p className="mt-1">{d}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

// ── Zona para soltar el archivo ─────────────────────────────────────────────

function ZonaArchivo({ archivo, onArchivo, titulo, detalle, compacta, deshabilitada }: {
  archivo: File | null; onArchivo: (f: File | null) => void; titulo: string; detalle: string; compacta?: boolean; deshabilitada?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const soltar = (e: React.DragEvent) => {
    e.preventDefault(); setEncima(false);
    if (deshabilitada) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onArchivo(f);
  };
  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!deshabilitada) setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      className={cn(
        'flex items-center gap-3 rounded-xl border-2 border-dashed transition-colors',
        compacta ? 'px-3 py-2.5' : 'px-4 py-5',
        deshabilitada ? 'border-border/60 opacity-60' : encima ? 'border-primary bg-primary/5' : archivo ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border hover:border-primary/50',
      )}
    >
      <span className={cn('flex shrink-0 items-center justify-center rounded-xl', compacta ? 'h-9 w-9' : 'h-11 w-11',
        archivo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
        {archivo ? <FileSpreadsheet className="h-5 w-5" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-foreground">{archivo ? archivo.name : titulo}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          {archivo ? `${(archivo.size / 1024).toFixed(0)} KB · listo para conciliar` : detalle}
        </span>
      </span>
      {archivo ? (
        <button type="button" onClick={() => onArchivo(null)} aria-label="Quitar archivo"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button type="button" disabled={deshabilitada} onClick={() => input.current?.click()}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground hover:border-primary disabled:cursor-not-allowed">
          Elegir archivo
        </button>
      )}
      <input
        ref={input} type="file" className="hidden" accept=".xls,.xlsx,.html,.htm"
        onChange={e => { const f = e.target.files?.[0]; if (f) onArchivo(f); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Resultado ───────────────────────────────────────────────────────────────

function Resultado({ datos, pestana, setPestana, onPdf, onNueva, onRecargar, archivo, sede }: {
  datos: { resultado: ResultadoConciliacion; meta: MetaConciliacion };
  pestana: Pestana; setPestana: (p: Pestana) => void; onPdf: () => void; onNueva: () => void;
  onRecargar: () => void;
  /** El reporte subido: con el de Cashea se descuentan las cuotas a cada cliente. */
  archivo?: File | null; sede?: string | null;
}) {
  const r = datos.resultado;
  const e = r.estado;
  const esCashea = r.banco === 'cashea';
  const b = BANCOS.find(x => x.id === r.banco) || BANCOS[1];
  const v = r.veredicto;
  const montoMov = (m: MovimientoBanco): React.ReactNode => {
    if (esCashea || m.clase === 'cuota_cashea') {
      return <>{usd(m.usd || 0)} <span className="text-muted-foreground">· {bs(Math.abs(m.monto))}</span></>;
    }
    // Bancos en Bs: mostrar Bs + equivalente en $ si hay tasa
    const usdEquiv = m.tasa && m.tasa > 0 ? Math.abs(m.monto) / m.tasa : null;
    return (
      <>
        {bs(Math.abs(m.monto))}
        {usdEquiv != null && (
          <span className="ml-1 text-muted-foreground">· {usd(usdEquiv)}</span>
        )}
      </>
    );
  };
  const pendientesAhora = r.ingresos.sinRegistrar.length + r.ingresos.noLlegaron.length + r.ingresos.diferencias.length + r.ingresos.enOtraCuenta.length + r.ingresos.inicialesSinCuenta.length
    + r.egresos.sinRegistrar.length + r.egresos.noSalieron.length + r.egresos.diferencias.length;
  const montoSis = (s: AsientoSistema): string => {
    if (s.enDolares) {
      // En dólares → mostrar $ y equivalente Bs si hay tasa
      const bsEquiv = s.tasa && s.tasa > 0 ? s.monto * s.tasa : null;
      return bsEquiv ? `${usd(s.monto)}  (${bs(bsEquiv)})` : usd(s.monto);
    }
    // En Bs → mostrar Bs y equivalente $ si hay tasa o campo usd
    const usdEquiv = s.usd && s.usd > 0 ? s.usd : (s.tasa && s.tasa > 0 ? s.monto / s.tasa : null);
    return usdEquiv ? `${bs(s.monto)}  (${usd(usdEquiv)})` : bs(s.monto);
  };

  const [modalAccion, setModalAccion] = useState<{
    abierto: boolean;
    movimiento: MovimientoBanco | null;
    tipo: 'ingreso' | 'egreso' | 'diferencia';
    sistema?: AsientoSistema | null;
  }>({ abierto: false, movimiento: null, tipo: 'ingreso' });

  const [modalSistema, setModalSistema] = useState<{
    abierto: boolean; sistema: AsientoSistema | null; caso: CasoSistema; movimiento: MovimientoBanco | null;
  }>({ abierto: false, sistema: null, caso: 'no_llego', movimiento: null });
  const [verHistorial, setVerHistorial] = useState(false);

  /** Botón «Resolver» de un registro del sistema que el banco no confirma. */
  const botonSis = (s: AsientoSistema, caso: CasoSistema, movimiento: MovimientoBanco | null = null) => (
    <button type="button" onClick={() => setModalSistema({ abierto: true, sistema: s, caso, movimiento })}
      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20">
      Resolver
    </button>
  );
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const confirmarPareja = async (p: { banco: MovimientoBanco[]; sistema: AsientoSistema[] }) => {
    const m = p.banco[0]; const s = p.sistema[0];
    const hash = `${m.fecha}_${m.referencia}_${m.monto}`;
    setConfirmando(hash);
    try {
      await fetch('/api/finanzas/conciliacion/accion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'confirmar_pareja', movimientoHash: hash, registroId: s.registroId, tabla: s.tabla, referencia: m.referencia, refMovimiento: m.referencia, monto: Math.abs(m.monto), fecha: m.fecha, concepto: s.concepto, banco: r.banco, corridaId: datos.meta.corridaId ?? null }),
      });
      onRecargar();
    } finally { setConfirmando(null); }
  };
  /** Lo último que se hizo con un movimiento del banco: queda visible en la lista aunque siga pendiente. */
  const seg = (m: MovimientoBanco) => {
    const x = datos.meta.seguimientos?.[`${m.fecha}_${m.referencia}_${m.monto}`];
    if (!x) return null;
    const etiqueta = x.accion === 'seguimiento' ? 'En seguimiento' : x.accion === 'reabrir' ? 'Reabierto' : 'Atendido';
    return <span title={`${x.motivo || ''} · ${x.usuario || ''}`} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', x.resuelto ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-400/20 text-amber-800')}>{etiqueta}{x.usuario ? ` · ${x.usuario.split(' ')[0]}` : ''}</span>;
  };


  const [modalTraspaso, setModalTraspaso] = useState<{
    abierto: boolean;
    movimiento: MovimientoBanco | null;
  }>({ abierto: false, movimiento: null });

  const [quitandoJustificacion, setQuitandoJustificacion] = useState<string | null>(null);

  const quitarJustificacion = async (hash: string) => {
    setQuitandoJustificacion(hash);
    try {
      await fetch('/api/finanzas/conciliacion/accion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'quitar_justificacion', movimientoHash: hash }),
      });
      onRecargar();
    } catch {
      /* ignore */
    } finally {
      setQuitandoJustificacion(null);
    }
  };

  const pestanas = useMemo(() => {
    const p: Array<{ valor: Pestana; n: number; label: string }> = [
      { valor: 'sin_registrar', n: r.ingresos.sinRegistrar.length, label: 'Cobros sin registrar' },
      { valor: 'no_llegaron', n: r.ingresos.noLlegaron.length, label: 'No llegaron al banco' },
      { valor: 'iniciales', n: r.ingresos.inicialesSinCuenta.length, label: 'Iniciales Cashea' },
      { valor: 'otra_cuenta', n: r.ingresos.enOtraCuenta.length, label: 'En otra cuenta' },
      { valor: 'diferencias', n: r.ingresos.diferencias.length + r.egresos.diferencias.length, label: 'Montos distintos' },
      { valor: 'traspasos', n: (r.traspasosInternos?.banco || []).length, label: 'Traspasos entre cuentas' },
      { valor: 'justificados', n: (r.ingresos.justificados || []).length + (r.egresos.justificados || []).length + (r.ingresos.sistemaJustificados || []).length + (r.egresos.sistemaJustificados || []).length, label: 'Justificados' },
      { valor: 'ordenes', n: r.ordenesCashea.length, label: 'Órdenes Cashea' },
      { valor: 'pagos', n: r.egresos.sinRegistrar.length, label: 'Pagos sin gasto' },
      { valor: 'gastos', n: r.egresos.noSalieron.length, label: 'Gastos sin salida' },
      { valor: 'banco', n: r.propiosDelBanco.reduce((a, g) => a + g.movimientos.length, 0) + r.reversos.length, label: 'Propios del banco' },
      { valor: 'conciliados', n: r.ingresos.conciliados.length + r.egresos.conciliados.length, label: 'Conciliados' },
    ];
    return p.filter(x => x.n > 0 || x.valor === 'conciliados' || x.valor === 'traspasos' || x.valor === 'justificados');
  }, [r]);

  return (
    <div className="space-y-4">
      {/* Veredicto */}
      <section className={cn(
        'relative overflow-hidden rounded-2xl border p-4 sm:p-5',
        v.cuadra ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-red-500/40 bg-red-500/[0.06]',
      )}>
        <span className={cn('absolute inset-y-0 left-0 w-1.5', v.cuadra ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <Anillo porcentaje={v.porcentaje} bien={v.cuadra} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <LogoBanco id={b.logo} size={22} />
              <span className="text-[12px] font-semibold text-muted-foreground">
                {b.nombre}{e.cuenta ? ` · ${e.cuenta}` : ''} · del {fecha(e.desde)} al {fecha(e.hasta)}
              </span>
            </div>
            <h2 className={cn('mt-1 text-[24px] font-black leading-tight tracking-tight sm:text-[28px]',
              v.cuadra ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
              {v.cuadra ? 'Cuadra al céntimo' : 'No cuadra'}
            </h2>
            <ul className="mt-1.5 space-y-0.5">
              {v.titulares.map((t, i) => (
                <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-foreground/85">
                  <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', v.cuadra ? 'bg-emerald-500' : 'bg-red-500')} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
            {!v.cuadra && (
              <div className="lg:text-right">
                <span className="block text-[11px] text-muted-foreground">Por aclarar</span>
                <span className="block text-[20px] font-black tabular-nums text-red-700 dark:text-red-400">
                  {esCashea ? usd(v.enJuego) : bs(v.enJuego)}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onPdf}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[12.5px] font-bold text-primary-foreground hover:opacity-90">
                <Download className="h-4 w-4" aria-hidden /> PDF
              </button>
              <button type="button" onClick={onNueva}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-[12.5px] font-semibold text-foreground hover:border-primary">
                <RotateCcw className="h-4 w-4" aria-hidden /> Otro estado
              </button>
            </div>
          </div>
        </div>
      </section>

      {esCashea && archivo && <DescontarCuotasCashea archivo={archivo} sede={sede} />}

      {/* Cifras */}
      <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {esCashea ? (
          <>
            <TarjetaKpi icono={<Landmark className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-violet-500/15 text-violet-600" etiqueta="Pagos en el reporte" valor={String(r.totalMovimientos)} pie={`${r.ordenesCashea.length} órdenes`} />
            <TarjetaKpi icono={<ArrowDownLeft className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-emerald-500/15 text-emerald-600" etiqueta="Cobrado por Cashea" valor={usd(r.ingresos.totalBanco)} pie={bs(e.totalCreditos)} />
            <TarjetaKpi icono={<Scale className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-sky-500/15 text-sky-600" etiqueta="Registrado en sistema" valor={usd(r.ingresos.totalSistema)} pie="Cobros de cuotas e iniciales" />
            <TarjetaKpi icono={<CheckCircle2 className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-emerald-500/15 text-emerald-600" etiqueta="Órdenes al día" valor={String(r.ordenesCashea.filter(o => o.estado === 'al_dia').length)} pie={`de ${r.ordenesCashea.length}`} />
            <TarjetaKpi icono={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-amber-400/20 text-amber-700" etiqueta="Ventas sin identificar" valor={String(r.ordenesCashea.filter(o => o.estado === 'venta_no_encontrada').length)} pie="Registradas sin Cashea" />
            <TarjetaKpi icono={<ShieldCheck className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-emerald-500/15 text-emerald-600" etiqueta="Cruce con el BNC" valor={r.cruceCashea ? `${r.cruceCashea.encontradas.length}/${r.cruceCashea.encontradas.length + r.cruceCashea.faltanEnBnc.length}` : 'Sin cruce'} pie={r.cruceCashea ? 'cuotas encontradas' : 'Sube el estado del BNC'} />
          </>
        ) : (
          <>
            <TarjetaKpi icono={<Landmark className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-muted text-foreground" etiqueta="Saldo inicial" valor={bs(e.saldoInicial ?? 0)} pie={fecha(e.desde)} />
            <TarjetaKpi icono={<ArrowDownLeft className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-emerald-500/15 text-emerald-600" etiqueta="Entradas" valor={bs(e.totalCreditos)} pie={`${bs(r.ingresos.totalBanco)} de clientes`} />
            <TarjetaKpi icono={<ArrowUpRight className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-red-500/15 text-red-600" etiqueta="Salidas" valor={bs(e.totalDebitos)} pie={`${bs(r.egresos.totalBanco)} a terceros`} />
            <TarjetaKpi icono={<Landmark className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-muted text-foreground" etiqueta="Saldo final" valor={bs(e.saldoFinal ?? 0)} pie={fecha(e.hasta)} />
            <TarjetaKpi icono={<Scale className="h-[18px] w-[18px]" aria-hidden />} tinte="bg-sky-500/15 text-sky-600" etiqueta="Cobros en sistema" valor={bs(r.ingresos.totalSistema)} pie={`registrados a ${b.nombre}`} />
            <TarjetaKpi
              icono={e.saltosDeSaldo.length ? <ShieldAlert className="h-[18px] w-[18px]" aria-hidden /> : <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />}
              tinte={e.saltosDeSaldo.length ? 'bg-red-500/15 text-red-600' : 'bg-emerald-500/15 text-emerald-600'}
              etiqueta="Integridad del archivo" valor={e.saltosDeSaldo.length ? `${e.saltosDeSaldo.length} saltos` : 'Verificado'}
              pie={e.saltosDeSaldo.length ? 'Falta o sobra una fila' : `${r.totalMovimientos} saldos al céntimo`}
            />
          </>
        )}
      </div>

      {/* Prueba: cada bolívar explicado */}
      {!esCashea && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Desglose titulo="Entradas al banco" total={e.totalCreditos} filas={r.explicacion.entradas} cuadra={r.explicacion.cuadraEntradas} />
          <Desglose titulo="Salidas del banco" total={e.totalDebitos} filas={r.explicacion.salidas} cuadra={r.explicacion.cuadraSalidas} />
        </div>
      )}

      {/* Hallazgos */}
      <Panel titulo="Detalle" subtitulo="Cada movimiento con su explicación y qué hacer" sinRelleno>
        <div className="px-3.5">
          <Pestanas valor={pestana} onCambio={setPestana} opciones={pestanas.map(p => ({ valor: p.valor, label: `${p.label} (${p.n})` }))} />
        </div>
        <div className="p-3.5">
          {pestana === 'sin_registrar' && (
            <Seccion ayuda="El dinero entró al banco, pero ninguna venta ni cobro del sistema lo explica. Puedes registrarlo como servicio/venta directamente, aplicarlo como abono o justificarlo con un motivo contable.">
              <Tabla filas={r.ingresos.sinRegistrar} vacio="Todo lo que entró está registrado." columnas={[
                { t: 'Fecha', c: m => fecha(m.fecha), w: 'w-24' },
                { t: 'Referencia', c: m => <span className="font-mono text-[11px]">{m.referencia}</span> },
                { t: 'Descripción del banco', c: m => <span className="line-clamp-2">{`${m.descripcion} ${m.detalle}`.trim()}</span> },
                { t: 'Monto', c: m => montoMov(m), d: true },
                { t: 'Pista', c: m => m.pista ? <span className="text-muted-foreground">{m.pista}</span> : '—' },
                {
                  t: 'Acción',
                  c: m => (
                    <span className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => setModalAccion({ abierto: true, movimiento: m, tipo: 'ingreso' })}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                    >
                      Registrar / Justificar
                    </button>
                    {seg(m)}
                    </span>
                  ),
                },
              ]} />
            </Seccion>
          )}
          {pestana === 'no_llegaron' && (
            <Seccion ayuda={`El sistema dice que estos clientes pagaron a ${b.nombre}, pero el dinero no aparece en el estado. O pagaron a otra cuenta (corrige la cuenta de la venta) o el pago no se hizo (cóbralo).`}>
              <TablaSistema filas={r.ingresos.noLlegaron} monto={montoSis} accion={s => botonSis(s, 'no_llego')} />
            </Seccion>
          )}
          {pestana === 'iniciales' && (
            <Seccion ayuda="La venta anota la inicial en «Cashea / BNC», pero no entró por ahí (no está en el BNC ni como inicial en el reporte de Cashea). El cliente la pagó por otra vía: corrige la cuenta de la inicial en la venta.">
              <TablaSistema filas={r.ingresos.inicialesSinCuenta} monto={montoSis} accion={s => botonSis(s, 'inicial_sin_cuenta')} />
            </Seccion>
          )}
          {pestana === 'otra_cuenta' && (
            <Seccion ayuda={`El monto exacto entró a ${b.nombre}, pero en el sistema la venta dice otra cuenta. Corrige la cuenta de la venta para que los saldos de los bancos cuadren.`}>
              <Tabla filas={r.ingresos.enOtraCuenta} vacio="" columnas={[
                { t: 'Fecha banco', c: x => fecha(x.banco.fecha) },
                { t: 'Monto', c: x => bs(Math.abs(x.banco.monto)), d: true },
                { t: 'Registrado como', c: x => <Chip tono="aviso">{NOMBRE_CUENTA[x.sistema.cuenta] || x.sistema.cuenta}</Chip> },
                { t: 'Cliente', c: x => <Cliente s={x.sistema} /> },
                { t: 'Fecha sistema', c: x => fecha(x.sistema.fecha) },
                { t: 'Acción', c: x => botonSis(x.sistema, 'otra_cuenta', x.banco) },
              ]} />
            </Seccion>
          )}
          {pestana === 'diferencias' && (
            <Seccion ayuda="Banco y sistema hablan del mismo pago, pero el monto difiere (aunque sea un céntimo). Con «Resolver» puedes poner en el sistema el monto que confirmó el banco (queda anotado el valor anterior), justificarlo o dejarlo en seguimiento.">
              <Tabla filas={[...r.ingresos.diferencias.map(d => ({ ...d, tipo: 'Cobro' })), ...r.egresos.diferencias.map(d => ({ ...d, tipo: 'Pago' }))]} vacio="" columnas={[
                { t: 'Tipo', c: d => d.tipo },
                { t: 'Fecha', c: d => fecha(d.banco.fecha) },
                { t: 'Banco', c: d => montoMov(d.banco), d: true },
                { t: 'Sistema', c: d => montoSis(d.sistema), d: true },
                { t: 'Diferencia', c: d => <span className="font-bold text-red-600 dark:text-red-400">{d.diferencia > 0 ? '+' : ''}{num(d.diferencia)}</span>, d: true },
                { t: 'Cliente / proveedor', c: d => <Cliente s={d.sistema} /> },
                {
                  t: 'Acción',
                  c: d => (
                    <span className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => setModalAccion({ abierto: true, movimiento: d.banco, tipo: 'diferencia', sistema: d.sistema })}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                    >
                      Resolver
                    </button>
                    {seg(d.banco)}
                    </span>
                  ),
                },
              ]} />
            </Seccion>
          )}
          {pestana === 'traspasos' && (
            <Seccion ayuda="Movimientos entre cuentas propias del taller (por ejemplo, BNC 8215 a BNC 8201 o a Banesco). No constituyen ventas ni egresos operacionales.">
              <div className="mb-2.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setModalTraspaso({ abierto: true, movimiento: null })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-4 w-4" /> Registrar Traspaso
                </button>
              </div>
              <Tabla
                filas={r.traspasosInternos.banco}
                vacio="No se detectaron traspasos entre cuentas propias en este período."
                columnas={[
                  { t: 'Fecha', c: m => fecha(m.fecha), w: 'w-24' },
                  { t: 'Referencia', c: m => <span className="font-mono text-[11px]">{m.referencia}</span> },
                  { t: 'Descripción del banco', c: m => <span className="line-clamp-2">{`${m.descripcion} ${m.detalle}`.trim()}</span> },
                  { t: 'Monto', c: m => <span className={cn('font-bold', m.monto > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{bs(m.monto)}</span>, d: true },
                  {
                    t: 'Estado',
                    c: m => {
                      const conc = r.traspasosInternos.conciliados.find(c => c.banco.fila === m.fila);
                      return conc ? (
                        <Chip tono="exito">Conciliado · {conc.traspaso.origen_nombre} → {conc.traspaso.destino_nombre}</Chip>
                      ) : (
                        <Chip tono="aviso">Sin registrar en sistema</Chip>
                      );
                    },
                  },
                  {
                    t: 'Acción',
                    c: m => {
                      const conc = r.traspasosInternos.conciliados.find(c => c.banco.fila === m.fila);
                      return conc ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setModalTraspaso({ abierto: true, movimiento: m })}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                        >
                          Registrar
                        </button>
                      );
                    },
                  },
                ]}
              />
            </Seccion>
          )}
          {pestana === 'justificados' && (
            <Seccion ayuda="Movimientos bancarios que no tienen asiento contable pero cuentan con una justificación autorizada. Suman al porcentaje de conciliación y aparecen en el informe.">
              <Tabla
                filas={[
                  ...r.ingresos.justificados.map(m => ({ m, tipo: 'Ingreso / Cobro' })),
                  ...r.egresos.justificados.map(m => ({ m, tipo: 'Egreso / Pago' })),
                ]}
                vacio="No hay movimientos con justificación contable."
                columnas={[
                  { t: 'Tipo', c: x => <Chip tono={x.tipo.includes('Ingreso') ? 'exito' : 'peligro'}>{x.tipo}</Chip> },
                  { t: 'Fecha', c: x => fecha(x.m.fecha), w: 'w-24' },
                  { t: 'Referencia', c: x => <span className="font-mono text-[11px]">{x.m.referencia}</span> },
                  { t: 'Motivo de Justificación', c: x => (
                    <span className="font-medium text-foreground">
                      {typeof x.m.justificacion === 'object' && x.m.justificacion ? x.m.justificacion.motivo : String(x.m.justificacion || 'Justificado')}
                    </span>
                  ) },
                  {
                    t: 'Acción',
                    c: x => {
                      const hash = `${x.m.fecha}_${x.m.referencia}_${x.m.monto}`;
                      return (
                        <button
                          type="button"
                          onClick={() => quitarJustificacion(hash)}
                          disabled={quitandoJustificacion === hash}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-500/15"
                        >
                          <Trash2 className="h-3 w-3" /> Quitar
                        </button>
                      );
                    },
                  },
                ]}
              />
              {(r.ingresos.sistemaJustificados.length + r.egresos.sistemaJustificados.length) > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[12px] font-bold text-foreground">Registros del sistema que el banco no muestra, justificados</p>
                  <Tabla
                    filas={[...r.ingresos.sistemaJustificados, ...r.egresos.sistemaJustificados]}
                    vacio=""
                    columnas={[
                      { t: 'Fecha', c: x => fecha(x.sistema.fecha), w: 'w-24' },
                      { t: 'Cliente / proveedor', c: x => <Cliente s={x.sistema} /> },
                      { t: 'Monto', c: x => montoSis(x.sistema), d: true },
                      { t: 'Motivo', c: x => <span className="font-medium text-foreground">{x.justificacion.motivo}<span className="block text-[10.5px] font-normal text-muted-foreground">{x.justificacion.usuario}</span></span> },
                      { t: 'Acción', c: x => (
                        <button type="button" onClick={() => quitarJustificacion(`sis:${x.sistema.id}`)} disabled={quitandoJustificacion === `sis:${x.sistema.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-500/15">
                          <Trash2 className="h-3 w-3" /> Quitar
                        </button>
                      ) },
                    ]}
                  />
                </div>
              )}
            </Seccion>
          )}
          {pestana === 'ordenes' && <OrdenesCashea r={r} />}
          {pestana === 'pagos' && (
            <Seccion ayuda="Dinero que salió a terceros (proveedores, personal, servicios) sin gasto en el sistema. Puedes registrarlo como egreso contable o justificarlo.">
              <Tabla filas={r.egresos.sinRegistrar} vacio="" columnas={[
                { t: 'Fecha', c: m => fecha(m.fecha), w: 'w-24' },
                { t: 'Referencia', c: m => <span className="font-mono text-[11px]">{m.referencia}</span> },
                { t: 'Descripción del banco', c: m => <span className="line-clamp-2">{`${m.descripcion} ${m.detalle}`.trim()}</span> },
                { t: 'Monto', c: m => bs(Math.abs(m.monto)), d: true },
                { t: 'Pista', c: m => m.pista ? <span className="text-muted-foreground">{m.pista}</span> : '—' },
                {
                  t: 'Acción',
                  c: m => (
                    <span className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => setModalAccion({ abierto: true, movimiento: m, tipo: 'egreso' })}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                    >
                      Registrar / Justificar
                    </button>
                    {seg(m)}
                    </span>
                  ),
                },
              ]} />
            </Seccion>
          )}
          {pestana === 'gastos' && (
            <Seccion ayuda={`El sistema dice que estos gastos se pagaron desde ${b.nombre}, pero el banco no muestra la salida. Revisa si se pagaron desde otra cuenta o en efectivo.`}>
              <TablaSistema filas={r.egresos.noSalieron} monto={montoSis} proveedor accion={s => botonSis(s, 'gasto_no_salio')} />
            </Seccion>
          )}
          {pestana === 'banco' && (
            <Seccion ayuda="No son ventas ni gastos del taller: comisiones, impuestos, intereses, traspasos entre cuentas propias, liquidaciones de Cashea y reversos (que se anulan con su original).">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {r.propiosDelBanco.map(g => (
                  <div key={g.clase} className="rounded-xl border border-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-bold">{g.titulo}</span>
                      <span className={cn('text-[13px] font-black tabular-nums', g.total < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>{bs(g.total)}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{g.movimientos.length} movimiento(s)</span>
                  </div>
                ))}
                {r.reversos.length > 0 && (
                  <div className="rounded-xl border border-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-bold">Reversos emparejados</span>
                      <span className="text-[13px] font-black tabular-nums">{r.reversos.length}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Cada uno con su movimiento original: se anulan.</span>
                  </div>
                )}
              </div>
            </Seccion>
          )}
          {pestana === 'conciliados' && (
            <Seccion ayuda="Cada pareja dice con qué regla se casó. «Fecha lejana» se marca para revisar.">
              <Tabla filas={[...r.ingresos.conciliados.map(p => ({ p, tipo: 'Cobro' })), ...r.egresos.conciliados.map(p => ({ p, tipo: 'Pago' }))]} vacio="Todavía no hay movimientos conciliados." columnas={[
                { t: 'Tipo', c: x => x.tipo },
                { t: 'Fecha banco', c: x => fecha(x.p.banco[0].fecha) },
                { t: 'Banco', c: x => <span className="flex flex-col">{x.p.banco.map(m => <span key={m.fila}>{montoMov(m)}</span>)}</span>, d: true },
                { t: 'Sistema', c: x => <span className="flex flex-col gap-0.5">{x.p.sistema.map(s => <Cliente key={s.id} s={s} monto={montoSis(s)} />)}</span> },
                { t: 'Regla', c: x => <Chip tono={x.p.confianza === 'alta' ? 'exito' : x.p.confianza === 'media' ? 'info' : 'aviso'}>{REGLA[x.p.regla] || x.p.regla}</Chip> },
                { t: 'Acción', c: x => x.p.confianza === 'revisar' && x.p.banco.length === 1 && x.p.sistema.length === 1 ? (
                  <button type="button" disabled={confirmando === `${x.p.banco[0].fecha}_${x.p.banco[0].referencia}_${x.p.banco[0].monto}`} onClick={() => confirmarPareja(x.p)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-500/20">Confirmar</button>
                ) : <span className="text-muted-foreground">—</span> },
              ]} />
            </Seccion>
          )}
        </div>
      </Panel>

      {/* Modales de acción */}
      <ModalAccionConciliacion
        abierto={modalAccion.abierto}
        onCerrar={() => setModalAccion({ abierto: false, movimiento: null, tipo: 'ingreso' })}
        movimiento={modalAccion.movimiento}
        tipo={modalAccion.tipo}
        banco={r.banco}
        sistema={modalAccion.sistema ?? null}
        corridaId={datos.meta.corridaId ?? null}
        onCompletado={onRecargar}
      />

      <ModalSistemaConciliacion
        abierto={modalSistema.abierto}
        onCerrar={() => setModalSistema(m => ({ ...m, abierto: false }))}
        sistema={modalSistema.sistema}
        caso={modalSistema.caso}
        movimientoBanco={modalSistema.movimiento}
        banco={r.banco}
        corridaId={datos.meta.corridaId ?? null}
        cuentaDelBanco={(CUENTAS_DEL_BANCO[r.banco] || [])[0]}
        onCompletado={onRecargar}
      />

      <ModalTraspasoConciliacion
        abierto={modalTraspaso.abierto}
        onCerrar={() => setModalTraspaso({ abierto: false, movimiento: null })}
        movimiento={modalTraspaso.movimiento}
        banco={r.banco}
        onCompletado={onRecargar}
      />

      <p className="text-[11px] text-muted-foreground">
        Archivo: {datos.meta.archivo}{datos.meta.cruce ? ` · cruzado con ${BANCOS.find(x => x.id === datos.meta.cruce!.banco)?.nombre || datos.meta.cruce.banco}` : ''} · el archivo no se guarda: se leyó en memoria y se descartó.
      </p>
      {datos.meta.anterior && datos.meta.anterior.pendientes != null && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-foreground/85">
          Avance de este período: antes había <strong>{datos.meta.anterior.pendientes}</strong> pendiente(s), ahora <strong>{pendientesAhora}</strong>
          {pendientesAhora < datos.meta.anterior.pendientes ? ` (${datos.meta.anterior.pendientes - pendientesAhora} resuelto(s) desde la conciliación anterior).` : pendientesAhora > datos.meta.anterior.pendientes ? ' (aparecieron nuevos).' : ' (sin cambios).'}
        </p>
      )}
      <div>
        <button type="button" onClick={() => setVerHistorial(v => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-[12.5px] font-semibold text-foreground hover:border-primary">
          {verHistorial ? 'Ocultar historial y seguimiento' : 'Ver historial y seguimiento'}
        </button>
      </div>
      {verHistorial && <HistorialConciliacion banco={r.banco} sede={sede} />}
      {datos.meta.autoCuotas && (datos.meta.autoCuotas.aplicados.length > 0 || datos.meta.autoCuotas.pendientes > 0) && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-400">
          Cuotas de Cashea descontadas automáticamente: <strong>{datos.meta.autoCuotas.aplicados.length}</strong> (${datos.meta.autoCuotas.totalUSD.toFixed(2)})
          {datos.meta.autoCuotas.pendientes > 0 && <> · {datos.meta.autoCuotas.pendientes} orden(es) por asignar a una venta en «Por cobrar»</>}
          {datos.meta.autoCuotas.rechazados.length > 0 && <> · {datos.meta.autoCuotas.rechazados.length} no se pudieron aplicar</>}.
        </p>
      )}
    </div>
  );
}

// ── Piezas del resultado ────────────────────────────────────────────────────

function Anillo({ porcentaje, bien }: { porcentaje: number; bien: boolean }) {
  const R = 30; const L = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, porcentaje));
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="8" className="stroke-border" />
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(p / 100) * L} ${L}`} className={bien ? 'stroke-emerald-500' : p >= 80 ? 'stroke-amber-500' : 'stroke-red-500'} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[17px] font-black tabular-nums leading-none">{num(p, p >= 99.95 || p === 0 ? 0 : 1)}%</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">conciliado</span>
      </span>
    </div>
  );
}

const TONO_BARRA = { ok: 'bg-emerald-500', aviso: 'bg-amber-500', mal: 'bg-red-500', neutro: 'bg-slate-400 dark:bg-slate-500' } as const;

function Desglose({ titulo, total, filas, cuadra }: {
  titulo: string; total: number; cuadra: boolean;
  filas: Array<{ concepto: string; monto: number; tono: keyof typeof TONO_BARRA }>;
}) {
  const suma = filas.reduce((a, x) => a + x.monto, 0) || 1;
  return (
    <Panel
      titulo={titulo}
      subtitulo={`${bs(total)} · cada bolívar en una sola categoría`}
      accion={cuadra ? <Chip tono="exito">Explicado al céntimo</Chip> : <Chip tono="peligro">No suma el total</Chip>}
    >
      <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {filas.map(f => <span key={f.concepto} className={TONO_BARRA[f.tono]} style={{ width: `${(f.monto / suma) * 100}%` }} />)}
      </div>
      <ul className="space-y-1.5">
        {filas.map(f => (
          <li key={f.concepto} className="flex items-center gap-2 text-[12px]">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', TONO_BARRA[f.tono])} />
            <span className="min-w-0 flex-1 leading-snug text-foreground/85 sm:truncate">{f.concepto}</span>
            <span className="shrink-0 font-semibold tabular-nums">{bs(f.monto)}</span>
            <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{num((f.monto / suma) * 100, 0)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Seccion({ ayuda, children }: { ayuda: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11.5px] leading-snug text-foreground/75">{ayuda}</p>
      {children}
    </div>
  );
}

function Tabla<T>({ filas, columnas, vacio }: {
  filas: T[]; vacio: string;
  columnas: Array<{ t: string; c: (x: T) => React.ReactNode; d?: boolean; w?: string }>;
}) {
  if (!filas.length) return <Vacio titulo={vacio || 'Nada aquí'} />;
  return (
    <div className="-mx-3.5 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-border bg-muted/40 text-left text-[10.5px] font-black uppercase tracking-wider text-muted-foreground">
            {columnas.map(c => <th key={c.t} className={cn('px-3.5 py-2', c.d && 'text-right', c.w)}>{c.t}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {filas.map((x, i) => (
            <tr key={i} className="align-top hover:bg-muted/30">
              {columnas.map(c => <td key={c.t} className={cn('px-3.5 py-2', c.d && 'whitespace-nowrap text-right font-semibold tabular-nums')}>{c.c(x)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cliente({ s, monto }: { s: AsientoSistema; monto?: string }) {
  return (
    <span className="block">
      <span className="font-semibold">{s.concepto}</span>
      {s.placa && (
        <Link href={`/dashboard/ficha?placa=${encodeURIComponent(s.placa)}`} className="ml-1.5 font-mono text-[11px] text-primary hover:underline">{s.placa}</Link>
      )}
      {monto && <span className="ml-1.5 tabular-nums text-muted-foreground">{monto}</span>}
      {s.detalle && <span className="block truncate text-[11px] text-muted-foreground">{s.detalle}</span>}
    </span>
  );
}

function TablaSistema({ filas, monto, proveedor, accion }: { filas: AsientoSistema[]; monto: (s: AsientoSistema) => string; proveedor?: boolean; accion?: (s: AsientoSistema) => React.ReactNode }) {
  return (
    <Tabla filas={filas} vacio="Nada aquí." columnas={[
      { t: 'Fecha', c: s => fecha(s.fecha), w: 'w-24' },
      { t: proveedor ? 'Proveedor' : 'Cliente', c: s => <Cliente s={s} /> },
      { t: 'Cuenta', c: s => <Chip>{NOMBRE_CUENTA[s.cuenta] || s.cuenta}</Chip> },
      { t: 'Origen', c: s => (s.tabla === 'abonos' ? 'Cobro de deuda' : s.tabla === 'egresos' ? 'Gasto' : 'Venta') },
      { t: 'Monto', c: s => monto(s), d: true },
      ...(accion ? [{ t: 'Acción', c: (s: AsientoSistema) => accion(s) }] : []),
    ]} />
  );
}

const ESTADO_ORDEN = {
  al_dia: { t: 'Al día', tono: 'exito' as const },
  cuotas_sin_registrar: { t: 'Cuotas sin registrar', tono: 'peligro' as const },
  venta_no_encontrada: { t: 'Venta no identificada', tono: 'aviso' as const },
  registrado_de_mas: { t: 'Registrado de más', tono: 'aviso' as const },
};

function OrdenesCashea({ r }: { r: ResultadoConciliacion }) {
  const [filtro, setFiltro] = useState<'todas' | keyof typeof ESTADO_ORDEN>('todas');
  const filas = r.ordenesCashea.filter(o => filtro === 'todas' || o.estado === filtro);
  return (
    <Seccion ayuda="Cashea cobra cada 14 días (la cuota 0 es la inicial; un pago puede cubrir varias cuotas). Cada orden se casa con su venta por la cuota (lo financiado ÷ 3) y la fecha. Si ninguna venta con Cashea encaja, se muestran candidatas: probablemente se registraron con otro método de pago.">
      <div className="flex flex-wrap gap-1.5">
        {(['todas', 'cuotas_sin_registrar', 'venta_no_encontrada', 'registrado_de_mas', 'al_dia'] as const).map(k => {
          const n = k === 'todas' ? r.ordenesCashea.length : r.ordenesCashea.filter(o => o.estado === k).length;
          if (!n && k !== 'todas') return null;
          return (
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={cn('rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold',
                filtro === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {k === 'todas' ? 'Todas' : ESTADO_ORDEN[k].t} ({n})
            </button>
          );
        })}
      </div>
      <Tabla filas={filas} vacio="No hay órdenes en este filtro." columnas={[
        { t: 'Orden', c: o => <span className="block"><span className="font-mono text-[11px] font-bold">{o.orden}</span><span className="block text-[11px] text-muted-foreground">Fact. {o.factura || '—'}</span></span> },
        { t: 'Pagos', c: o => (
          <span className="flex flex-wrap gap-1">
            {o.cuotas.map(c => <Chip key={c.fila} tono="info">{c.descripcion.split(' · ')[0]} · {fecha(c.fecha).slice(0, 5)} · {usd(c.usd || 0)}</Chip>)}
          </span>
        ) },
        { t: 'Cuota', c: o => (o.cuotaUSD ? usd(o.cuotaUSD) : '—'), d: true },
        { t: 'Cobrado', c: o => usd(o.cobradoUSD), d: true },
        { t: 'Venta en el sistema', c: o => o.venta ? (
          <span className="block">
            <span className="font-semibold">{o.venta.cliente}</span>
            {o.venta.placa && <Link href={`/dashboard/ficha?placa=${encodeURIComponent(o.venta.placa)}`} className="ml-1.5 font-mono text-[11px] text-primary hover:underline">{o.venta.placa}</Link>}
            <span className="block text-[11px] text-muted-foreground">{fecha(o.venta.fecha)}{o.candidatos > 1 ? ` · 1 de ${o.candidatos} posibles` : ''}</span>
          </span>
        ) : o.posibles.length ? (
          <span className="block text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/80">Candidatas (sin confirmar):</span>
            {o.posibles.map((p, i) => <span key={i} className="block">{fecha(p.fecha).slice(0, 5)} · {p.cliente} · ${num(p.total, 0)} · {p.plan} · {p.metodo}</span>)}
          </span>
        ) : <span className="text-[11px] text-muted-foreground">Sin candidatas (venta hacia el {fecha(o.fechaEstimadaVenta)})</span> },
        { t: 'En sistema', c: o => (o.venta ? usd(o.registradoUSD) : '—'), d: true },
        { t: 'Estado', c: o => <span className="block"><Chip tono={ESTADO_ORDEN[o.estado].tono}>{ESTADO_ORDEN[o.estado].t}</Chip><span className="mt-1 block max-w-[220px] text-[11px] leading-snug text-muted-foreground">{o.nota}</span></span> },
      ]} />
    </Seccion>
  );
}
