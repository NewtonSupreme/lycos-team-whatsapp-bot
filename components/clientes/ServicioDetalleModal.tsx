'use client';
/**
 * Detalle COMPLETO de un servicio del cliente.
 *
 * Secciones:
 *   1. Servicio realizado (qué, clasificación, estado, quién lo registró)
 *   2. Tiempos (inicio / finalización / duración)
 *   3. Vehículo asociado
 *   4. Cobro (cuánto se cobró + métodos de pago)
 *   5. Factura emitida
 *   6. Comprobante de pago (¿hubo o no?)
 *   7. Gastos (egresos) de ESE servicio → utilidad real
 *   8. Bitácora / seguimiento
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  X, Loader2, Wrench, Clock, Car, Banknote, Receipt, ShieldCheck, ShieldAlert,
  TrendingDown, Wallet, User, FileText, ExternalLink, Activity, CheckCircle2,
} from 'lucide-react';
import { categoriaLabel, metodoPagoLabel, sumaMetodos } from '@/lib/categorias';

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtFechaHora(iso?: string | null, fallbackFecha?: string | null, fallbackHora?: string | null): string {
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('es-VE', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    }
  }
  if (fallbackFecha) return `${fallbackFecha}${fallbackHora ? ` · ${fallbackHora}` : ''}`;
  return '—';
}

function duracion(desde?: string | null, hasta?: string | null): string {
  if (!desde || !hasta) return '—';
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return '—';
  const min = Math.round((b - a) / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} día${d > 1 ? 's' : ''} ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  en_proceso: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  en_progreso: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  en_revision: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  completada: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  finalizado: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  cancelado: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

const COMPLETED = ['completada', 'completado', 'finalizado', 'finalizada'];

export default function ServicioDetalleModal({ servicio, onClose }: { servicio: any; onClose: () => void }) {
  const [venta, setVenta] = useState<any>(null);
  const [factura, setFactura] = useState<any>(null);
  const [egresos, setEgresos] = useState<any[]>([]);
  const [tasaDia, setTasaDia] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const refTag = `[ServicioID: ${servicio.id}]`;

      const [vNew, vOld, fac, egs, tasaRes] = await Promise.all([
        // Venta vinculada (registros nuevos)
        supabase.from('ventas_dia').select('*').eq('servicio_id', servicio.id).limit(1).maybeSingle(),
        // Venta vinculada por la etiqueta antigua en notas (históricos)
        supabase.from('ventas_dia').select('*').like('notas', `%${refTag}%`).limit(1).maybeSingle(),
        // Factura emitida para este servicio
        supabase.from('facturas').select('*').eq('referencia_id', servicio.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        // Gastos asociados a ESTE servicio
        supabase.from('egresos').select('*').eq('servicio_id', servicio.id).order('fecha', { ascending: false }),
        // Tasa vigente EL DÍA del servicio (no una tasa genérica)
        fetch(`/api/tasas?fecha=${(servicio.fecha || '').slice(0, 10)}`).then(r => r.json()).catch(() => null),
      ]);

      setVenta(vNew.data || vOld.data || null);
      setFactura(fac.data || null);
      setEgresos(egs.data || []);
      setTasaDia(tasaRes && tasaRes.bcv ? tasaRes : null);
    } catch (e) {
      console.error('Error cargando detalle del servicio:', e);
    }
    setLoading(false);
  }, [servicio.id, servicio.fecha]);

  useEffect(() => { load(); }, [load]);

  // ── Cobro ────────────────────────────────────────────────────────────────
  const metodos: Record<string, number> =
    (venta?.metodos_pago && Object.keys(venta.metodos_pago).length ? venta.metodos_pago : servicio.metodos_pago) || {};
  const totalCobrado =
    Number(venta?.total_ingresos) ||
    Number(servicio.costo_final) ||
    Number(servicio.total_pagado) ||
    Number(servicio.costo_estimado) || 0;

  // ── Comprobante ──────────────────────────────────────────────────────────
  const comprobanteUrl = servicio.comprobante_url || venta?.comprobante_url || factura?.comprobante_url || null;
  const comprobanteRef = servicio.comprobante_referencia || venta?.comprobante_referencia || factura?.comprobante_referencia || null;
  const hayComprobante = !!(comprobanteUrl || comprobanteRef);

  // ── Gastos y utilidad ────────────────────────────────────────────────────
  const totalEgresos = egresos.reduce((s, e) => s + (Number(e.total_egresos) || 0), 0);
  const utilidad = totalCobrado - totalEgresos;

  // ── Tiempos ──────────────────────────────────────────────────────────────
  const estaCompletado = COMPLETED.includes(String(servicio.estado || '').toLowerCase());
  const inicio = servicio.fecha_inicio || servicio.created_at;
  // Servicios completados ANTES de que se guardara fecha_fin: se reconstruye de la
  // bitácora (evento de finalización) y, si no, de updated_at.
  const eventoFin = Array.isArray(servicio.seguimiento)
    ? [...servicio.seguimiento].reverse().find((s: any) =>
        /finaliz|complet|entreg/i.test(String(s?.accion || '')))
    : null;
  const fin = servicio.fecha_fin
    || (estaCompletado ? (eventoFin?.fecha || servicio.updated_at || null) : null);

  const nombreServicio = servicio.tipo_personalizado || servicio.descripcion || servicio.tipo || 'Servicio';
  const seguimiento: any[] = Array.isArray(servicio.seguimiento) ? servicio.seguimiento : [];

  // ── Tasa vigente EL DÍA del servicio ─────────────────────────────────────
  const tasaGuardada = Number(venta?.tasa_cambio || servicio.tasa_cambio) || 0;
  const tasaReal = Number(tasaDia?.bcv) || 0;
  // Se prefiere la tasa real del día; la guardada sólo si no hay histórico.
  const tasaMostrar = tasaReal || tasaGuardada;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl h-[92dvh] sm:h-auto sm:max-h-[90vh] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 p-4 sm:p-5 border-b border-border/40 shrink-0 bg-card">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg leading-tight break-words">{nombreServicio}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${ESTADO_COLOR[servicio.estado] || ESTADO_COLOR.pendiente}`}>
                  {(servicio.estado || '').replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground font-medium">
                  {categoriaLabel(servicio.categoria)}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3 sm:space-y-4">

            {/* Resumen financiero */}
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={Banknote} label="Cobrado" value={money(totalCobrado)} color="text-emerald-500" />
              <Stat icon={TrendingDown} label="Gastos" value={money(totalEgresos)} color="text-rose-500" />
              <Stat icon={Wallet} label="Utilidad" value={money(utilidad)} color={utilidad >= 0 ? 'text-blue-500' : 'text-red-500'} highlight />
            </div>

            {/* 1. Servicio realizado */}
            <Section icon={Wrench} title="Servicio realizado">
              <KV label="Trabajo" value={servicio.descripcion || nombreServicio} />
              <KV label="Clasificación" value={categoriaLabel(servicio.categoria)} />
              {servicio.tipo_personalizado && <KV label="Tipo" value={servicio.tipo_personalizado} />}
              {servicio.registrado_por && <KV label="Registrado por" value={servicio.registrado_por} icon={User} />}
              {servicio.notas && <KV label="Notas" value={servicio.notas} />}
            </Section>

            {/* 2. Tiempos */}
            <Section icon={Clock} title="Tiempos" tone={estaCompletado ? 'ok' : undefined}>
              <KV label="Inicio" value={fmtFechaHora(inicio, servicio.fecha, servicio.hora)} />
              <KV
                label="Finalización"
                value={fin ? fmtFechaHora(fin) : (estaCompletado ? 'No registrada' : 'Aún no finalizado')}
              />
              <KV label="Duración" value={duracion(inicio, fin)} strong={!!fin} />
              {estaCompletado && !servicio.fecha_fin && fin && (
                <p className="text-[10px] text-muted-foreground italic pt-0.5">
                  Reconstruida desde la bitácora (servicio anterior al registro de finalización).
                </p>
              )}
            </Section>

            {/* 3. Vehículo asociado */}
            <Section icon={Car} title="Vehículo asociado">
              <KV label="Vehículo" value={servicio.vehiculo_info || `${servicio.vehiculos?.marca || ''} ${servicio.vehiculos?.modelo || ''}`.trim() || '—'} />
              <KV label="Placa" value={(servicio.placa || servicio.vehiculos?.placa || '—').toString().toUpperCase()} mono />
            </Section>

            {/* 4. Cobro y métodos de pago */}
            <Section icon={Banknote} title="Cobro y métodos de pago">
              <KV label="Total cobrado" value={money(totalCobrado)} strong />
              {(servicio.con_iva || venta?.con_iva) && <KV label="IVA" value="Sí (16%)" />}

              {tasaMostrar > 0 && (
                <>
                  <KV
                    label={`Tasa BCV del ${(servicio.fecha || '').slice(0, 10) || 'día'}`}
                    value={`Bs ${tasaMostrar.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $`}
                  />
                  <KV
                    label="Equivalente en Bs"
                    value={`Bs ${(totalCobrado * tasaMostrar).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                  {tasaDia?.aproximada && (
                    <p className="text-[10px] text-amber-500/80 italic">
                      Tasa aproximada: no había registro histórico exacto de ese día.
                    </p>
                  )}
                </>
              )}

              {Object.keys(metodos).length > 0 ? (
                <div className="pt-2 mt-1 border-t border-border/40 space-y-1">
                  {Object.entries(metodos)
                    .filter(([, v]) => Number(v) > 0)
                    .map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground truncate">{metodoPagoLabel(k)}</span>
                        <span className="font-bold shrink-0 text-right">
                          {money(Number(v))}
                          {tasaMostrar > 0 && (
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              Bs {(Number(v) * tasaMostrar).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  {Math.abs(sumaMetodos(metodos) - totalCobrado) > 0.01 && (
                    <p className="text-[10px] text-amber-500 pt-0.5">
                      ⚠ Los métodos suman {money(sumaMetodos(metodos))} y el total es {money(totalCobrado)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic pt-1">No se registraron métodos de pago.</p>
              )}
            </Section>

            {/* 5. Factura */}
            <Section icon={Receipt} title="Factura">
              {factura ? (
                <>
                  <KV label="Correlativo" value={factura.correlativo || '—'} mono strong />
                  <KV label="Estado" value={(factura.estado || '—').toUpperCase()} />
                  <KV label="Total" value={money(Number(factura.total))} />
                  <KV label="Emitida" value={fmtFechaHora(factura.fecha_emision || factura.created_at)} />
                  {factura.emitido_por && <KV label="Emitida por" value={factura.emitido_por} />}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No se ha emitido factura para este servicio.
                </p>
              )}
            </Section>

            {/* 6. Comprobante de pago */}
            <Section
              icon={hayComprobante ? ShieldCheck : ShieldAlert}
              title="Comprobante de pago"
              tone={hayComprobante ? 'ok' : 'warn'}
            >
              {hayComprobante ? (
                <>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sí hubo comprobante
                  </div>
                  {comprobanteRef && <KV label="Referencia" value={comprobanteRef} mono />}
                  {comprobanteUrl && (
                    <a
                      href={comprobanteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-1 text-xs font-bold text-blue-500 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Ver comprobante adjunto
                    </a>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-500 font-medium">
                  ⚠ No se registró comprobante de pago para este servicio.
                </p>
              )}
            </Section>

            {/* 7. Gastos del servicio */}
            <Section icon={TrendingDown} title={`Gastos de este servicio (${egresos.length})`} tone={egresos.length ? 'danger' : undefined}>
              {egresos.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No se registraron gastos para este servicio.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {egresos.map(e => (
                      <div key={e.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted/30 border border-border/30 p-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">
                            {e.notas || e.desglose?.[0]?.descripcion || 'Gasto'}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                            <span>{e.fecha}{e.hora ? ` · ${e.hora}` : ''}</span>
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 font-bold uppercase">
                              {e.categoria || 'otro'}
                            </span>
                            {(e.proveedor || e.cliente) && <span>Pagado a: {e.proveedor || e.cliente}</span>}
                            {e.origen === 'bot' && (
                              <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 font-bold">BOT</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-black text-rose-500 shrink-0">
                          -{money(Number(e.total_egresos))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
                    <span className="text-xs font-bold text-muted-foreground">Total gastos</span>
                    <span className="text-sm font-black text-rose-500">-{money(totalEgresos)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Utilidad del servicio</span>
                    <span className={`text-sm font-black ${utilidad >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {money(utilidad)}
                    </span>
                  </div>
                </>
              )}
            </Section>

            {/* 8. Bitácora */}
            {seguimiento.length > 0 && (
              <Section icon={Activity} title={`Bitácora (${seguimiento.length})`}>
                <div className="space-y-1.5">
                  {seguimiento.slice().reverse().map((s, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.accion}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {fmtFechaHora(s.fecha)}{s.usuario ? ` · ${s.usuario}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Piezas ─────────────────────────────────────────────────────────────────
function Section({
  icon: Icon, title, children, tone,
}: { icon: any; title: string; children: React.ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  const border =
    tone === 'ok' ? 'border-emerald-500/25 bg-emerald-500/5'
    : tone === 'warn' ? 'border-amber-500/25 bg-amber-500/5'
    : tone === 'danger' ? 'border-rose-500/25 bg-rose-500/5'
    : 'border-border bg-muted/20';
  const iconColor =
    tone === 'ok' ? 'text-emerald-500'
    : tone === 'warn' ? 'text-amber-500'
    : tone === 'danger' ? 'text-rose-500'
    : 'text-primary';

  return (
    <div className={`rounded-xl border p-3 ${border}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <h4 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({
  label, value, mono, strong, icon: Icon,
}: { label: string; value: string; mono?: boolean; strong?: boolean; icon?: any }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </span>
      <span className={`text-right break-words ${mono ? 'font-mono' : ''} ${strong ? 'font-black text-sm' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, highlight }: any) {
  return (
    <div className={`rounded-xl border p-2.5 ${highlight ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`w-3 h-3 ${color}`} /> {label}
      </div>
      <div className={`text-base font-black mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
