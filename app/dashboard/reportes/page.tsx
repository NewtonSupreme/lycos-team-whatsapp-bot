'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Download, TrendingUp, DollarSign, Wrench, Users, Plus, Pencil,
  Trash2, CheckCircle, AlertCircle, Loader2, X, Camera, Eye,
  Calendar, FileText, BarChart2, RefreshCw, Package, ChevronDown, Clock,
  ArrowDownCircle, TrendingDown, Receipt, ShoppingCart, Bot, ChevronRight,
  Truck, MapPin, Boxes, CheckCircle2
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase, registrarFactura } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { cn } from '@/lib/utils';
import { generateInvoicePDF, generateEgresoPDF } from '@/lib/invoice-pdf';
import { generateCierrePDF, type CierreData } from '@/lib/cierre-pdf';
import { generateNotaEntregaPDF } from '@/lib/distribucion-pdf';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useAppStore } from '@/lib/store';
import { Distribucion } from '@/types';

// ── Types ──────────────────────────────────────────────────────
interface VentaDia {
  id: string;
  fecha: string;
  cliente: string | null;
  total_ingresos: number;
  total_servicios: number;
  total_clientes: number;
  desglose: DesglosItem[];
  notas: string | null;
  imagen_url: string | null;
  creado_por: string;
  created_at: string;
  source?: string;
  isCashea?: boolean;
  isBinance?: boolean;
  pago_usd?: number;
  pago_ves?: number;
  tasa_cambio?: number;
  con_iva?: boolean;
  metodos_pago?: {
    pago_movil?: number;
    zelle?: number;
    efectivo_usd?: number;
    efectivo_ves?: number;
    cashea?: number;
    cashea_usd?: number;
    cashea_ves?: number;
    transferencia?: number;
    punto_de_venta?: number;
    punto_de_venta_usd?: number;
    punto_de_venta_ves?: number;
    otro?: number;
    [key: string]: number | undefined;
  };
}

interface DesglosItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

interface Egreso {
  id: string;
  fecha: string;
  cliente: string | null;
  total_egresos: number;
  categoria: string;
  desglose: DesglosItem[];
  notas: string | null;
  imagen_url: string | null;
  creado_por: string;
  created_at: string;
}

interface CierreOficial {
  id: string;
  fecha: string;
  periodo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  total_ingresos_usd: number;
  total_bs: number;
  tasa_bcv: number;
  total_clientes: number;
  total_ventas: number;
  desglose_pagos: any;
  notas: string | null;
  generado_por: string;
  sede_nombre?: string;
  ventas_snapshot?: any[];
  servicios_snapshot?: any[];
  inventario_snapshot?: any[];
  created_at: string;
}

interface ScannedData {
  tipo_escaneo?: 'cierre' | 'ticket';
  fecha: string;
  total_ingresos: number;
  notas?: string;
  total_clientes?: number;
  total_servicios?: number;
  rawText?: string;
  
  // From Gemini Cierre Mode
  clientes_atendidos?: number;
  formas_de_pago?: {
    dolares?: number;
    efectivo_bs?: number;
    tasa?: number;
    [key: string]: any;
  };
  clientes?: Array<{
    nombre: string;
    carro?: string;
    servicio?: string;
    total: number;
  }>;

  // From Gemini Ticket Mode
  cliente_nombre?: string;
  cliente_vehiculo?: string;
  items?: DesglosItem[];
  metodo_pago?: string;
  empresa_nombre?: string;
  empresa_rif?: string;
  nro_factura?: string;
  hora?: string;
  subtotal?: number;
  impuestos?: number;
}

// ── Tooltip ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-xl text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: ${Number(p.value).toFixed(2)}</p>
        ))}
      </div>
    );
  }
  return null;
};


// ── CierreWizard Component ─────────────────────────────────────
function CierreWizard({ ventas, onClose, onSaved }: {
  ventas: VentaDia[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentSede } = useSedeStore();
  const [step, setStep] = React.useState(1);
  const [periodo, setPeriodo] = React.useState<'dia' | 'mes'>('dia');
  const [fechaDia, setFechaDia] = React.useState(new Date().toISOString().split('T')[0]);
  const [fechaInicio, setFechaInicio] = React.useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = React.useState(new Date().toISOString().split('T')[0]);
  const [notasCierre, setNotasCierre] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [tasaBCV, setTasaBCV] = React.useState(0);
  const [inventario, setInventario] = React.useState<any[]>([]);
  const [servicios, setServicios] = React.useState<any[]>([]);
  const [userName, setUserName] = React.useState(useAppStore.getState().user?.nombre || 'Admin');

  React.useEffect(() => {
    fetch('/api/rates').then(r => r.json()).then(d => setTasaBCV(d.bcv || 0)).catch(() => {});
    if (supabase) {
      withSedeFilter(supabase.from('inventario')).select('*').eq('activo', true)
        .then((res: any) => setInventario(res.data || []));
      
      withSedeFilter(supabase.from('servicios')).select('*')
        .then((res: any) => setServicios(res.data || []));
    }
  }, []);

  const ventasFiltradas = React.useMemo(() => {
    if (periodo === 'dia') return ventas.filter(v => v.fecha === fechaDia);
    return ventas.filter(v => v.fecha >= fechaInicio && v.fecha <= fechaFin);
  }, [ventas, periodo, fechaDia, fechaInicio, fechaFin]);

  const serviciosFiltrados = React.useMemo(() => {
    const start = periodo === 'dia' ? `${fechaDia}T00:00:00` : `${fechaInicio}T00:00:00`;
    const end = periodo === 'dia' ? `${fechaDia}T23:59:59` : `${fechaFin}T23:59:59`;
    return servicios.filter(s => s.created_at >= start && s.created_at <= end);
  }, [servicios, periodo, fechaDia, fechaInicio, fechaFin]);

  const totalUSD = ventasFiltradas.reduce((s, v) => s + Number(v.total_ingresos), 0);
  const totalBS = totalUSD * (tasaBCV || 1);
  const totalClientes = ventasFiltradas.reduce((s, v) => s + Number(v.total_clientes || 0), 0);

  const desglosePagos = React.useMemo(() => {
    const agg: Record<string, number> = {};
    ventasFiltradas.forEach(v => {
      const mp = (v as any).metodos_pago || {};
      Object.entries(mp).forEach(([k, val]) => {
        if (typeof val === 'number' && val > 0) agg[k] = (agg[k] || 0) + val;
      });
    });
    return {
      efectivo_usd: agg.efectivo_usd,
      zelle: agg.zelle,
      pago_movil_bs: agg.pago_movil,
      efectivo_bs: agg.efectivo_ves,
      transferencia_bs: agg.transferencia,
      cashea_usd: agg.cashea_usd || agg.cashea,
      cashea_bs: agg.cashea_ves,
      binance_usdt: agg.binance,
      punto_venta_usd: agg.punto_de_venta_usd,
      punto_venta_bs: agg.punto_de_venta_ves || agg.punto_de_venta,
      euros: agg.euros,
      otro: agg.otro,
    };
  }, [ventasFiltradas]);

  const handleGenerate = async () => {
    if (!supabase) return;
    setSaving(true);
    try {
      const cierreData: CierreData = {
        sede_nombre: currentSede?.nombre || 'Lycos Team',
        periodo,
        fecha: periodo === 'dia'
          ? new Date(fechaDia + 'T12:00:00').toLocaleDateString('es-VE')
          : new Date(fechaInicio + 'T12:00:00').toLocaleDateString('es-VE'),
        fecha_inicio: periodo === 'mes' ? fechaInicio.split('-').reverse().join('/') : undefined,
        fecha_fin: periodo === 'mes' ? fechaFin.split('-').reverse().join('/') : undefined,
        total_ingresos_usd: totalUSD,
        total_bs: totalBS,
        tasa_bcv: tasaBCV,
        total_clientes: totalClientes,
        total_ventas: ventasFiltradas.length,
        desglose_pagos: desglosePagos,
        ventas: ventasFiltradas.map(v => ({
          fecha: new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-VE'),
          cliente: v.cliente || 'Cons. Final',
          descripcion: (v.desglose || []).map((d: any) => d.descripcion).join(', ') || (v.notas || '').slice(0, 40) || 'Servicio',
          metodo_pago: (v as any).metodo_pago || 'Varios',
          total_usd: Number(v.total_ingresos),
          total_bs: Number(v.total_ingresos) * (tasaBCV || 1),
          fuente: (v.creado_por || '').toLowerCase().includes('ia') ? 'ia' as const : 'pos' as const,
        })),
        inventario: inventario.map(p => ({
          nombre: p.nombre,
          stock: p.stock,
          precio_usd: p.precio_usd || p.precio_promo || 0,
          precio_bs: p.precio_bs || 0,
        })),
        notas: notasCierre,
        generado_por: userName,
        generado_en: new Date().toLocaleString('es-VE'),
        servicios_detalle: serviciosFiltrados.map(s => ({
          id: s.id,
          vehiculo: s.vehiculo_info || s.cliente_nombre || '---',
          descripcion: s.descripcion,
          estado: s.estado,
          created_at: s.created_at
        }))
      };

        // Create a hidden JSON snapshot in the 'notas' field since columns are missing
        const hiddenSnapshot = JSON.stringify({
          v: ventasFiltradas.map(v => ({ id: v.id, f: v.fecha, c: v.cliente, t: v.total_ingresos, ts: v.total_servicios, d: v.desglose, n: v.notas, cp: v.creado_por, ca: v.created_at, tc: v.tasa_cambio })),
          s: serviciosFiltrados.map(s => ({ id: s.id, vi: s.vehiculo_info, cn: s.cliente_nombre, d: s.descripcion, e: s.estado, ca: s.created_at })),
          i: inventario.map(p => ({ n: p.nombre, s: p.stock, pu: p.precio_usd, pb: p.precio_bs }))
        });

        const { error } = await supabase.from('cierres_caja').insert(withSedeInsert({
          fecha: fechaDia || fechaInicio,
          periodo,
          fecha_inicio: periodo === 'mes' ? fechaInicio : null,
          fecha_fin: periodo === 'mes' ? fechaFin : null,
          total_ingresos_usd: totalUSD,
          total_bs: totalBS,
          tasa_bcv: tasaBCV,
          total_clientes: totalClientes,
          total_ventas: ventasFiltradas.length,
          desglose_pagos: desglosePagos,
          notas: (notasCierre ? notasCierre + "\n" : "") + `[SNAPSHOT_DATA]${hiddenSnapshot}[/SNAPSHOT_DATA]`,
          generado_por: userName,
        }));
        if (error) throw error;

        // Log Activity
        await logActivity({
          usuario: userName,
          modulo: 'Reportes',
          accion: `Generó cierre de caja ${periodo === 'dia' ? 'diario' : 'mensual'}`,
          detalles: `Fecha: ${fechaDia || fechaInicio}, Total: $${totalUSD.toFixed(2)}`,
          referencia_tabla: 'cierres_caja'
        });

      generateCierrePDF(cierreData);
      onSaved();
    } catch (e: any) {
      console.error(e);
      alert('Error al generar cierre: ' + (e.message || 'Error desconocido'));
    }
    setSaving(false);
  };

  const stepLabels = ['Período', 'Ventas', 'Métricas', 'Opciones', 'Exportar'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-gradient-to-r from-orange-600/10 to-transparent">
          <div>
            <h2 className="text-sm font-black text-orange-500 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-4 h-4" /> Cierre de Caja — Lycos Team
            </h2>
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {stepLabels.map((s, i) => (
                <React.Fragment key={i}>
                  <button
                    onClick={() => i < step - 1 && setStep(i + 1)}
                    className={cn(
                      "flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full transition-all",
                      step === i + 1 ? "bg-orange-600 text-white" :
                      step > i + 1 ? "bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30" :
                      "bg-muted/30 text-muted-foreground"
                    )}
                  >
                    {step > i + 1 ? '✓' : (i + 1) + '.'} {s}
                  </button>
                  {i < 4 && <span className="text-muted-foreground/40 text-[8px]">›</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Step 1: Período */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Selecciona el tipo de cierre y el período a reportar.</p>
              <div className="flex gap-3">
                {(['dia', 'mes'] as const).map(p => (
                  <button key={p} onClick={() => setPeriodo(p)}
                    className={cn("flex-1 p-4 rounded-2xl border-2 text-sm font-black uppercase transition-all",
                      periodo === p ? "border-orange-500 bg-orange-600/10 text-orange-500" :
                      "border-border text-muted-foreground hover:border-orange-500/40")}>
                    {p === 'dia' ? '📅 Por Día' : '📆 Por Mes'}
                  </button>
                ))}
              </div>

              {periodo === 'dia' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fecha del cierre</label>
                  <input type="date" value={fechaDia} onChange={e => setFechaDia(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fecha inicio</label>
                    <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fecha fin</label>
                    <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Elaborado por</label>
                <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
                  placeholder="Nombre del responsable"
                  className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
              </div>
            </div>
          )}

          {/* Step 2: Ventas incluidas */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-600/5 border border-orange-600/20">
                <p className="text-xs text-muted-foreground">
                  Ventas en el período: <strong className="text-foreground">{ventasFiltradas.length}</strong>
                </p>
                <span className="text-xs font-black text-orange-500">${totalUSD.toFixed(2)} USD</span>
              </div>

              {ventasFiltradas.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border border-dashed border-border/40">
                  <p className="text-sm text-muted-foreground">No hay ventas para el período seleccionado</p>
                  <button onClick={() => setStep(1)} className="text-xs text-orange-500 mt-2 underline">← Cambiar período</button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                  {ventasFiltradas.map((v, i) => (
                    <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-border/20 hover:border-border/40 transition-all">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-orange-600/10 text-orange-500 text-[9px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{v.cliente || 'Cons. Final'}</p>
                          <p className="text-[9px] text-muted-foreground">{v.fecha} · {v.total_servicios || 1} serv. · {v.total_clientes || 1} cliente(s)</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-green-400">${Number(v.total_ingresos).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Métricas */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total USD', value: '$' + Number(totalUSD).toFixed(2), color: 'text-green-400', bg: 'bg-green-500/10' },
                  { label: 'Total Bs.', value: Number(totalBS).toLocaleString('es-VE', {maximumFractionDigits: 0}) + ' Bs', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Clientes', value: String(totalClientes), color: 'text-purple-400', bg: 'bg-purple-500/10' },
                  { label: 'Ventas', value: String(ventasFiltradas.length), color: 'text-orange-400', bg: 'bg-orange-500/10' },
                ].map(k => (
                  <div key={k.label} className={cn('p-4 rounded-2xl border border-border/30', k.bg)}>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{k.label}</p>
                    <p className={cn('text-xl font-black mt-1', k.color)}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-background/50 border border-border/30 space-y-2">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Métodos de pago detectados</p>
                {Object.entries(desglosePagos).filter(([, v]) => v && Number(v) > 0).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="font-black">
                      {k === 'euros'
                        ? '€' + Number(v).toFixed(2)
                        : (k.includes('bs') || k === 'pago_movil_bs')
                          ? Number(v).toLocaleString('es-VE', {maximumFractionDigits: 0}) + ' Bs'
                          : '$' + Number(v).toFixed(2)}
                    </span>
                  </div>
                ))}
                {Object.values(desglosePagos).every(v => !v || Number(v) === 0) && (
                  <p className="text-xs text-muted-foreground italic">Sin desglose de pagos en los cierres del período</p>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-600/10 border border-orange-600/20">
                <span className="text-xs font-black text-orange-500 uppercase tracking-widest">Tasa BCV</span>
                <span className="text-sm font-black text-orange-500">{Number(tasaBCV).toFixed(2)} Bs/$</span>
              </div>
            </div>
          )}

          {/* Step 4: Opciones */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Notas / Observaciones del cierre</label>
                <textarea value={notasCierre} onChange={e => setNotasCierre(e.target.value)} rows={4}
                  placeholder="Ej: Caja cuadrada. Efectivo verificado. Sin pendientes..."
                  className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background/50 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-muted-foreground" />
              </div>

              <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/20 space-y-1.5">
                <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-1">El cierre PDF incluirá:</p>
                {[
                  '📊 KPIs: Ingresos USD y Bs., Clientes, Ventas',
                  '💳 Desglose detallado por método de pago',
                  '🧾 Tabla completa de ventas del período',
                  '📦 Snapshot actual del inventario de silenciadores',
                  '✍️ Líneas de firma: Elaborado / Autorizado',
                ].map((item, i) => (
                  <p key={i} className="text-[9px] text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Exportar */}
          {step === 5 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-20 h-20 rounded-3xl bg-orange-600/10 border-2 border-orange-600/30 flex items-center justify-center mx-auto">
                <FileText className="w-10 h-10 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-black">¡Todo listo!</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Se generará el PDF y se guardará en el historial de cierres de la base de datos.
                </p>
              </div>
              <div className="text-left p-4 rounded-2xl bg-background/60 border border-border/30 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Tipo</span><span className="font-bold capitalize">{periodo === 'dia' ? 'Cierre Diario' : 'Cierre Mensual'}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Período</span><span className="font-bold">{periodo === 'dia' ? fechaDia : fechaInicio + ' → ' + fechaFin}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Ventas incluidas</span><span className="font-bold">{ventasFiltradas.length}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total USD</span><span className="font-black text-orange-500">${Number(totalUSD).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Bs.</span><span className="font-black text-blue-400">{Number(totalBS).toLocaleString('es-VE', {maximumFractionDigits: 0})} Bs</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Elaborado por</span><span className="font-bold">{userName}</span></div>
              </div>
              <Button onClick={handleGenerate} disabled={saving}
                className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white font-black h-12 text-sm">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF...</>
                  : <><Download className="w-4 h-4" /> Generar y Descargar PDF</>}
              </Button>
              <p className="text-[9px] text-muted-foreground">El cierre queda registrado en la BD para tu historial.</p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between p-4 border-t border-border/30 bg-muted/10">
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30">
            {step === 1 ? 'Cancelar' : '← Atrás'}
          </button>
          <div className="text-[9px] text-muted-foreground font-bold">Paso {step} de 5</div>
          {step < 5 && (
            <Button onClick={() => setStep(step + 1)}
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white font-black px-6">
              Siguiente →
            </Button>
          )}
          {step === 5 && (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal: Formulario Manual ────────────────────────────────────
function ManualModal({ onClose, onSave, initial, inventario = [] }: {
  onClose: () => void;
  onSave: (data: Partial<VentaDia>) => Promise<void>;
  initial?: VentaDia | null;
  inventario?: any[];
}) {
  const [form, setForm] = useState({
    fecha: initial?.fecha || new Date().toISOString().split('T')[0],
    cliente: initial?.cliente || '',
    total_ingresos: initial?.total_ingresos || 0,
    total_servicios: initial?.total_servicios || 0,
    total_clientes: initial?.total_clientes || 0,
    notas: initial?.notas || '',
    pago_usd: initial?.pago_usd || 0,
    pago_ves: initial?.pago_ves || 0,
    tasa_cambio: initial?.tasa_cambio || 0,
    con_iva: initial?.con_iva || false,
    metodos_pago: initial?.metodos_pago || {
      pago_movil: 0,
      zelle: 0,
      efectivo_usd: 0,
      efectivo_ves: 0,
      cashea: 0,
      transferencia: 0,
      punto_de_venta: 0,
      euros: 0,
      otro: 0,
    },
  });
  const [items, setItems] = useState<DesglosItem[]>(
    initial?.desglose?.length ? initial.desglose : [{ descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]
  );
  const [rates, setRates] = useState({ bcv: 0, binance: 0 });
  const [rateType, setRateType] = useState<'bcv' | 'binance'>('bcv');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchActive, setSearchActive] = useState<number | null>(null);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch('/api/rates');
        const data = await res.json();
        setRates({ bcv: data.bcv, binance: data.binance });
        if (!initial?.tasa_cambio) {
          setForm(f => ({ ...f, tasa_cambio: data.bcv }));
        }
      } catch (e) { console.error('Error fetching rates:', e); }
    };
    fetchRates();
  }, [initial]);

  useEffect(() => {
    if (rates.bcv > 0) {
      setForm(f => ({ ...f, tasa_cambio: rateType === 'bcv' ? rates.bcv : rates.binance }));
    }
  }, [rateType, rates]);

  const updateItem = (i: number, key: keyof DesglosItem, val: string | number) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val };
      if (key === 'cantidad' || key === 'precio_unitario') {
        next[i].total = Number(next[i].cantidad) * Number(next[i].precio_unitario);
      }
      return next;
    });
  };

  const totalFromItems = items.reduce((s, it) => s + Number(it.total), 0);

  useEffect(() => {
    setForm(f => ({ ...f, total_ingresos: totalFromItems }));
  }, [totalFromItems]);

  const handlePaymentCalc = (field: string, val: number, isMetodo = false) => {
    setForm(f => {
      if (isMetodo) {
        return {
          ...f,
          metodos_pago: {
            ...f.metodos_pago,
            [field]: val
          }
        };
      }
      return { ...f, [field]: val };
    });
  };

  // Helper to get total paid in USD
  const getPaidTotalUSD = () => {
    const mp = form.metodos_pago as any;
    const tasa = form.tasa_cambio || 1;
    
    let total = 0;
    // USD/EUR fields
    total += Number(mp.efectivo_usd || 0);
    total += Number(mp.zelle || 0);
    total += Number(mp.otro || 0);
    total += Number(mp.punto_de_venta_usd || 0);
    total += Number(mp.cashea_usd || 0);
    total += Number(mp.euros || 0);
    
    // Compatibility check for old data
    if (!mp.punto_de_venta_usd && !mp.punto_de_venta_ves) total += Number(mp.punto_de_venta || 0);
    if (!mp.cashea_usd && !mp.cashea_ves) total += Number(mp.cashea || 0);

    // VES fields (converted)
    total += Number(mp.pago_movil || 0) / tasa;
    total += Number(mp.efectivo_ves || 0) / tasa;
    total += Number(mp.transferencia || 0) / tasa;
    total += Number(mp.punto_de_venta_ves || 0) / tasa;
    total += Number(mp.cashea_ves || 0) / tasa;

    return total;
  };

  const totalFinal = form.total_ingresos * (form.con_iva ? 1.16 : 1);
  const totalPagadoUSD = getPaidTotalUSD();
  const restante = totalFinal - totalPagadoUSD;

  const handleSave = async () => {
    if (!form.fecha) { setError('La fecha es requerida'); return; }
    setSaving(true);
    const mp = form.metodos_pago as any;
    const tasa = form.tasa_cambio || 1;
    
    const pago_usd = Number(mp.efectivo_usd || 0) + Number(mp.zelle || 0) + Number(mp.otro || 0) + Number(mp.punto_de_venta_usd || 0) + Number(mp.cashea_usd || 0);
    const pago_ves = Number(mp.pago_movil || 0) + Number(mp.efectivo_ves || 0) + Number(mp.transferencia || 0) + Number(mp.punto_de_venta_ves || 0) + Number(mp.cashea_ves || 0);

    try {
      await onSave({
        fecha: form.fecha,
        cliente: form.cliente || null,
        total_ingresos: Number(form.total_ingresos),
        total_servicios: Number(form.total_servicios) || items.filter(i => i.descripcion).length,
        total_clientes: Number(form.total_clientes),
        notas: form.notas || null,
        desglose: items.filter(i => i.descripcion.trim()),
        pago_usd: pago_usd,
        pago_ves: pago_ves,
        tasa_cambio: Number(form.tasa_cambio),
        con_iva: form.con_iva,
        metodos_pago: form.metodos_pago,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div>
            <h2 className="text-base font-bold text-primary">{initial ? 'Editar Venta' : 'Nueva Venta Manual'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Registra una venta individual en el sistema</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Fecha del cierre</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre del Cliente (Opcional)</label>
              <input
                type="text"
                placeholder="Ej: Juan Pérez o Empresa X"
                value={form.cliente || ''}
                onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total ingresos ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.total_ingresos}
                onChange={e => setForm(f => ({ ...f, total_ingresos: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-bold text-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Clientes atendidos</label>
              <input
                type="number"
                value={form.total_clientes}
                onChange={e => setForm(f => ({ ...f, total_clientes: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Servicios realizados</label>
              <input
                type="number"
                value={form.total_servicios}
                onChange={e => setForm(f => ({ ...f, total_servicios: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Desglose de Pago (Detallado)</p>
                <p className="text-[9px] text-muted-foreground font-bold mt-1 uppercase">Selecciona los métodos y montos</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50">
                  <button 
                    onClick={() => setRateType('bcv')}
                    className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all", rateType === 'bcv' ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}
                  >BCV</button>
                  <button 
                    onClick={() => setRateType('binance')}
                    className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all", rateType === 'binance' ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}
                  >Binance</button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer group bg-white px-3 py-1.5 rounded-xl border border-border/50 shadow-sm">
                  <input
                    type="checkbox"
                    checked={form.con_iva}
                    onChange={e => setForm(f => ({ ...f, con_iva: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/20"
                  />
                  <span className="text-[10px] font-black text-slate-500 group-hover:text-primary transition-colors uppercase">IVA (+16%)</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'efectivo_usd', label: 'Efectivo USD', color: 'text-green-500', currency: '$' },
                { id: 'zelle', label: 'Zelle', color: 'text-violet-500', currency: '$' },
                { id: 'pago_movil', label: 'Pago Móvil', color: 'text-blue-500', currency: 'Bs' },
                { id: 'punto_de_venta', label: 'Punto de Venta', color: 'text-orange-500', mixed: true },
                { id: 'efectivo_ves', label: 'Efectivo Bs.', color: 'text-slate-500', currency: 'Bs' },
                { id: 'euros', label: 'Euros (€)', color: 'text-amber-500', currency: '€' },
                { id: 'cashea', label: 'Cashea', color: 'text-purple-400', mixed: true },
                { id: 'transferencia', label: 'Transferencia', color: 'text-sky-500', currency: 'Bs' },
                { id: 'otro', label: 'Otro / Especial', color: 'text-slate-400', currency: '$' },
              ].map(method => (
                <div key={method.id} className={cn(
                  "flex items-center justify-between p-3 rounded-2xl border transition-all",
                  (method.mixed ? ((form.metodos_pago as any)[`${method.id}_usd`] > 0 || (form.metodos_pago as any)[`${method.id}_ves`] > 0) : (form.metodos_pago as any)[method.id] > 0)
                    ? "bg-card border-primary/30 shadow-md" 
                    : "bg-muted/30 border-border/20 opacity-70"
                )}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={method.mixed ? ((form.metodos_pago as any)[`${method.id}_usd`] > 0 || (form.metodos_pago as any)[`${method.id}_ves`] > 0) : (form.metodos_pago as any)[method.id] > 0}
                      onChange={(e) => {
                        if (method.mixed) {
                          handlePaymentCalc(`${method.id}_usd`, e.target.checked ? 0.01 : 0, true);
                        } else {
                          handlePaymentCalc(method.id, e.target.checked ? 0.01 : 0, true);
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-primary"
                    />
                    <span className={cn("text-[10px] font-black uppercase tracking-tight", method.color)}>{method.label}</span>
                  </label>
                  
                  {method.mixed ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-lg border border-border/50">
                        <span className="text-[9px] font-bold text-slate-400">$</span>
                        <input 
                          type="number" step="0.01" className="w-12 text-right text-[10px] font-black bg-transparent border-none p-0 focus:ring-0 text-foreground"
                          value={(form.metodos_pago as any)[`${method.id}_usd`] || 0}
                          onChange={(e) => handlePaymentCalc(`${method.id}_usd`, parseFloat(e.target.value) || 0, true)}
                        />
                      </div>
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-lg border border-border/50">
                        <span className="text-[9px] font-bold text-slate-400">Bs</span>
                        <input 
                          type="number" step="0.01" className="w-12 text-right text-[10px] font-black bg-transparent border-none p-0 focus:ring-0 text-foreground"
                          value={(form.metodos_pago as any)[`${method.id}_ves`] || 0}
                          onChange={(e) => handlePaymentCalc(`${method.id}_ves`, parseFloat(e.target.value) || 0, true)}
                        />
                      </div>
                    </div>
                  ) : (
                    (form.metodos_pago as any)[method.id] !== undefined && (
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-xl border border-border/50">
                        <span className="text-[10px] font-bold text-slate-400">{method.currency}</span>
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-16 text-right text-xs font-black bg-transparent border-none p-0 focus:ring-0 text-foreground"
                          value={(form.metodos_pago as any)[method.id]}
                          onChange={(e) => handlePaymentCalc(method.id, parseFloat(e.target.value) || 0, true)}
                        />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-primary/10">
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Tasa ${rateType.toUpperCase()}</span>
                  <span className="text-sm font-black text-slate-900">${form.tasa_cambio.toFixed(2)} Bs.</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Subtotal</span>
                  <span className="text-sm font-black text-slate-900">${(form.total_ingresos || 0).toFixed(2)}</span>
                </div>
                {form.con_iva && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-orange-500 font-black uppercase tracking-widest">IVA (16%)</span>
                    <span className="text-sm font-black text-orange-500">+${((form.total_ingresos * 0.16) || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Total Final</span>
                <span className="text-2xl font-black text-primary tracking-tighter italic">${(totalFinal || 0).toFixed(2)}</span>
                {Math.abs(restante) > 0.01 && (
                  <div className="flex flex-col items-end mt-1">
                    <span className={cn("text-[9px] font-black uppercase tracking-widest", restante > 0 ? "text-orange-500" : "text-green-500")}>
                      {restante > 0 ? 'Restante por pagar' : 'Cambio / Excedente'}
                    </span>
                    <span className={cn("text-sm font-black", restante > 0 ? "text-orange-500" : "text-green-500")}>
                      ${(Math.abs(restante) || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Desglose de servicios</label>
              <button
                onClick={() => setItems(p => [...p, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }])}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar ítem
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 mb-1 px-1 text-muted-foreground/70">
                <div className="col-span-1 text-[9px] font-black uppercase text-center">#</div>
                <div className="col-span-4 text-[9px] font-black uppercase">Descripción del Servicio</div>
                <div className="col-span-2 text-[9px] font-black uppercase text-center">Cant.</div>
                <div className="col-span-2 text-[9px] font-black uppercase text-right">P. Unit.</div>
                <div className="col-span-2 text-[9px] font-black uppercase text-right pr-2">Total</div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center group bg-slate-50/30 p-1.5 rounded-xl border border-transparent hover:border-slate-100 transition-all">
                  <div className="col-span-1 text-[10px] font-bold text-muted-foreground text-center bg-white h-7 flex items-center justify-center rounded-lg shadow-sm border border-slate-100">
                    {i + 1}
                  </div>
                  <div className="col-span-4 relative">
                    <input
                      className="w-full px-2 py-1.5 rounded-lg border-none bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-0"
                      placeholder="Descripción o buscar producto..."
                      value={item.descripcion || ''}
                      onChange={e => {
                        updateItem(i, 'descripcion', e.target.value);
                        setSearchActive(i);
                      }}
                      onFocus={() => setSearchActive(i)}
                      onBlur={() => setTimeout(() => setSearchActive(null), 200)}
                    />
                    {searchActive === i && item.descripcion.length > 0 && (
                      <div className="absolute z-50 top-full left-0 w-64 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-lg max-h-48 overflow-y-auto mt-1">
                        {inventario.filter(p => p.nombre.toLowerCase().includes(item.descripcion.toLowerCase())).map(p => (
                          <div key={p.id} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-xs flex flex-col gap-0.5 border-b border-border/50 last:border-0" onClick={() => {
                            updateItem(i, 'descripcion', p.nombre);
                            updateItem(i, 'precio_unitario', p.precio || p.precio_usd || 0);
                            setSearchActive(null);
                          }}>
                            <div className="font-bold text-slate-700 dark:text-slate-200">{p.nombre}</div>
                            <div className="text-[9px] text-slate-500 dark:text-slate-400">Stock: {p.stock} | Precio: ${p.precio || p.precio_usd || 0}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border-none bg-transparent text-xs font-black text-slate-600 text-center focus:ring-0"
                    type="number" placeholder="0" min="1"
                    value={item.cantidad}
                    onChange={e => updateItem(i, 'cantidad', Number(e.target.value))}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border-none bg-transparent text-xs font-black text-slate-600 text-right focus:ring-0"
                    type="number" placeholder="0.00" step="0.01"
                    value={item.precio_unitario}
                    onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))}
                  />
                  <div className="col-span-2 text-xs font-black text-primary text-right pr-2 italic">
                    ${Number(item.total).toFixed(2)}
                  </div>
                  <button
                    onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                    className="col-span-1 w-7 h-7 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {items.some(i => i.descripcion) && (
              <div className="mt-2 pt-2 border-t border-border/20 flex justify-between text-xs">
                <span className="text-muted-foreground">Total calculado</span>
                <span className="font-bold text-primary">${(totalFromItems || 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notas adicionales</label>
            <textarea
              value={form.notas || ''}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones del día, pagos pendientes, etc."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><CheckCircle className="w-4 h-4" /> Guardar Venta Manual</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EgresoModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (data: Partial<Egreso>) => Promise<void>;
  initial?: Egreso | null;
}) {
  const [form, setForm] = useState({
    fecha: initial?.fecha || new Date().toISOString().split('T')[0],
    cliente: initial?.cliente || '',
    categoria: initial?.categoria || 'otro',
    total_egresos: initial?.total_egresos || 0,
    notas: initial?.notas || '',
  });
  const [items, setItems] = useState<DesglosItem[]>(
    initial?.desglose?.length ? initial.desglose : [{ descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  

  


  const updateItem = (i: number, key: keyof DesglosItem, val: string | number) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val };
      if (key === 'cantidad' || key === 'precio_unitario') {
        next[i].total = Number(next[i].cantidad) * Number(next[i].precio_unitario);
      }
      return next;
    });
  };

  const totalFromItems = items.reduce((s, it) => s + Number(it.total), 0);
  useEffect(() => { setForm(f => ({ ...f, total_egresos: totalFromItems })); }, [totalFromItems]);

  const handleSave = async () => {
    if (!form.fecha) { setError('La fecha es requerida'); return; }
    setSaving(true);
    try {
      await onSave({
        fecha: form.fecha,
        cliente: form.cliente || null,
        categoria: form.categoria,
        total_egresos: Number(form.total_egresos),
        notas: form.notas || null,
        desglose: items.filter(i => i.descripcion.trim()),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div>
            <h2 className="text-base font-bold text-rose-400">{initial ? 'Editar egreso' : 'Nuevo registro de egreso'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Registra pagos, compras o gastos del taller</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Fecha del egreso</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Categoría</label>
              <select
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm"
              >
                <option value="repuestos">Compra de Repuestos</option>
                <option value="servicios">Pago de Servicios (Luz, Agua, etc)</option>
                <option value="nomina">Nómina / Personal</option>
                <option value="herramientas">Herramientas</option>
                <option value="local">Alquiler / Local</option>
                <option value="otro">Otro gasto</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pagado a (Proveedor / Nombre)</label>
              <input
                type="text"
                placeholder="Ej: Repuestos El Chamo"
                value={form.cliente || ''}
                onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total egreso ($)</label>
              <input
                type="number" step="0.01"
                value={form.total_egresos}
                onChange={e => setForm(f => ({ ...f, total_egresos: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm font-bold text-rose-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Desglose de egreso</label>
              <button
                onClick={() => setItems(p => [...p, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }])}
                className="text-xs text-rose-400 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar ítem
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center group">
                  <div className="col-span-1 text-[10px] font-bold text-muted-foreground text-center bg-muted/30 h-7 flex items-center justify-center rounded">
                    {i + 1}
                  </div>
                  <input
                    className="col-span-4 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs"
                    placeholder="¿En qué se gastó?"
                    value={item.descripcion || ''}
                    onChange={e => updateItem(i, 'descripcion', e.target.value)}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs"
                    type="number" placeholder="Cant." value={item.cantidad}
                    onChange={e => updateItem(i, 'cantidad', Number(e.target.value))}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs"
                    type="number" placeholder="$" value={item.precio_unitario}
                    onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))}
                  />
                  <div className="col-span-2 text-xs font-medium text-rose-400 text-right">
                    ${Number(item.total).toFixed(2)}
                  </div>
                  <button
                    onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                    className="col-span-1 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              value={form.notas || ''}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Detalles adicionales..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-xs resize-none"
            />
          </div>

          {error && <div className="text-xs text-destructive p-2.5 rounded-lg bg-destructive/10">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm">Cancelar</button>
          <Button onClick={handleSave} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
            {saving ? 'Guardando...' : 'Guardar Egreso'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Scan IA + Confirmación ──────────────────────────────
function ScanModal({ onClose, onConfirm, modo }: {
  onClose: () => void;
  onConfirm: (data: ScannedData) => void;
  modo: 'cierre' | 'ticket' | 'egreso';
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<ScannedData | null>(null);
  const [scanError, setScanError] = useState('');
  const [step, setStep] = useState<'upload' | 'preview' | 'confirm'>('upload');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file);
  };

  const processFile = (file: File | undefined | null) => {
    if (!file) return;
    setMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      const base64 = result.split(',')[1];
      setImageBase64(base64);
      setStep('preview');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  };

  const handleScan = async () => {
    if (!imageBase64) return;
    setScanning(true);
    setScanError('');
    try {
      const res = await fetch('/api/reportes/scan-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, modo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al escanear');
      setScanned(data.data);
      setStep('confirm');
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Error desconocido');
    }
    setScanning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header con steps */}
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Camera className="w-4 h-4 text-violet-400" /> {modo === 'ticket' ? 'Escanear Factura/Ticket' : 'Escanear Cierre con IA'}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {['Subir imagen', 'Vista previa', 'Confirmar datos'].map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={cn(
                    'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center',
                    (step === 'upload' && i === 0) || (step === 'preview' && i === 1) || (step === 'confirm' && i === 2)
                      ? 'bg-violet-500 text-white'
                      : (step === 'preview' && i === 0) || (step === 'confirm' && i <= 1)
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                  )}>
                    {((step === 'preview' && i === 0) || (step === 'confirm' && i <= 1)) ? '✓' : i + 1}
                  </div>
                  <span className="text-[10px] text-muted-foreground hidden sm:block">{s}</span>
                  {i < 2 && <span className="text-border text-xs">›</span>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-border/40 hover:border-violet-500/50 rounded-2xl p-10 text-center cursor-pointer transition-colors group"
              >
                <Camera className="w-12 h-12 text-muted-foreground/30 group-hover:text-violet-400 mx-auto mb-3 transition-colors" />
                <p className="text-sm font-medium">Haz clic o arrastra una imagen aquí</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Foto de caja, recibo, ticket de venta, resumen manual
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP · Máx. 10MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                <p className="text-xs text-violet-400 font-medium mb-1">¿Cómo funciona?</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Sube la foto del cierre de caja o ticket</li>
                  <li>• Gemini IA extrae automáticamente los datos</li>
                  <li>• Revisas y confirmas antes de guardar</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && imagePreview && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-border/30 bg-muted/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Vista previa" className="w-full max-h-64 object-contain bg-black/20" />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Imagen cargada correctamente. Presiona &quot;Escanear con IA&quot; para extraer los datos.
              </p>
              {scanError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {scanError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('upload'); setImagePreview(null); setImageBase64(null); }}
                  className="flex-1 py-2 rounded-lg border border-border/50 text-sm hover:bg-white/5 transition-colors"
                >
                  Cambiar imagen
                </button>
                <Button onClick={handleScan} disabled={scanning} className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700">
                  {scanning
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
                    : <><Camera className="w-4 h-4" /> Escanear con IA</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && scanned && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-400">Datos extraídos correctamente. Revisa antes de confirmar.</p>
              </div>

              {/* Datos extraídos editables - Dinámico según modo */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Fecha</label>
                    <input
                      type="date"
                      value={scanned.fecha || ''}
                      onChange={e => setScanned({ ...scanned, fecha: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-semibold focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Cliente</label>
                    <input
                      type="text"
                      placeholder="Nombre del cliente"
                      value={scanned.cliente_nombre || ''}
                      onChange={e => setScanned({ ...scanned, cliente_nombre: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  {modo === 'ticket' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Vehículo del Cliente</label>
                      <input
                        type="text"
                        placeholder="Ej: Toyota Corolla"
                        value={scanned.cliente_vehiculo || ''}
                        onChange={e => setScanned({ ...scanned, cliente_vehiculo: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Ingresos ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={scanned.total_ingresos || 0}
                      onChange={e => setScanned({ ...scanned, total_ingresos: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-green-400 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  {modo === 'cierre' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Servicios Realizados</label>
                      <input
                        type="number"
                        value={scanned.total_servicios || 0}
                        onChange={e => setScanned({ ...scanned, total_servicios: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                  )}
                  {modo === 'ticket' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Método de Pago</label>
                      <input
                        type="text"
                        placeholder="Zelle, Efectivo, Pago Móvil..."
                        value={scanned.metodo_pago || ''}
                        onChange={e => setScanned({ ...scanned, metodo_pago: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-border/30 pt-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                    <span>Líneas de Detalle / Desglose</span>
                    <span className="text-[10px] text-muted-foreground">({(scanned.items?.length || scanned.clientes?.length || 0)} ítems)</span>
                  </label>
                  
                  <div className="p-3 bg-muted/20 border border-border/50 rounded-xl text-xs space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                    {scanned.items && scanned.items.length > 0 ? (
                      scanned.items.map((it, i) => (
                        <div key={i} className="flex gap-2 items-center bg-background/50 p-2 rounded-lg border border-border/30 hover:border-violet-500/20 transition-all">
                          <div className="w-12">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Cant</label>
                            <input
                              type="number"
                              value={it.cantidad}
                              onChange={e => {
                                const newItems = [...(scanned.items || [])];
                                const cant = Number(e.target.value);
                                newItems[i] = {
                                  ...newItems[i],
                                  cantidad: cant,
                                  total: cant * newItems[i].precio_unitario
                                };
                                const newTotal = newItems.reduce((acc, curr) => acc + curr.total, 0);
                                setScanned({ ...scanned, items: newItems, total_ingresos: newTotal });
                              }}
                              className="w-full px-1.5 py-1 bg-background border border-border rounded text-center text-foreground font-semibold"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Descripción del Servicio / Producto</label>
                            <input
                              type="text"
                              value={it.descripcion}
                              onChange={e => {
                                const newItems = [...(scanned.items || [])];
                                newItems[i] = { ...newItems[i], descripcion: e.target.value };
                                setScanned({ ...scanned, items: newItems });
                              }}
                              className="w-full px-2 py-1 bg-background border border-border rounded text-foreground text-[11px]"
                              placeholder="Ej: Silenciador de Aveo"
                            />
                          </div>
                          <div className="w-20">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5 text-right">P. Unitario</label>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground text-[9px]">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={it.precio_unitario}
                                onChange={e => {
                                  const newItems = [...(scanned.items || [])];
                                  const pu = Number(e.target.value);
                                  newItems[i] = {
                                    ...newItems[i],
                                    precio_unitario: pu,
                                    total: newItems[i].cantidad * pu
                                  };
                                  const newTotal = newItems.reduce((acc, curr) => acc + curr.total, 0);
                                  setScanned({ ...scanned, items: newItems, total_ingresos: newTotal });
                                }}
                                className="w-full px-1.5 py-1 bg-background border border-border rounded text-right text-foreground font-semibold"
                              />
                            </div>
                          </div>
                          <div className="w-20 text-right pr-1">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Subtotal</label>
                            <span className="text-sm font-bold text-green-400">${(it.total || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      ))
                    ) : scanned.clientes && scanned.clientes.length > 0 ? (
                      scanned.clientes.map((c, i) => (
                        <div key={i} className="flex gap-2 items-center bg-background/50 p-2 rounded-lg border border-border/30 hover:border-violet-500/20 transition-all">
                          <div className="flex-1">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Nombre Cliente</label>
                            <input
                              type="text"
                              value={c.nombre}
                              onChange={e => {
                                const newClientes = [...(scanned.clientes || [])];
                                newClientes[i] = { ...newClientes[i], nombre: e.target.value };
                                setScanned({ ...scanned, clientes: newClientes });
                              }}
                              className="w-full px-2 py-1 bg-background border border-border rounded text-foreground font-semibold text-[11px]"
                              placeholder="Nombre Cliente"
                            />
                          </div>
                          <div className="w-32">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Vehículo</label>
                            <input
                              type="text"
                              value={c.carro || ''}
                              onChange={e => {
                                const newClientes = [...(scanned.clientes || [])];
                                newClientes[i] = { ...newClientes[i], carro: e.target.value };
                                setScanned({ ...scanned, clientes: newClientes });
                              }}
                              className="w-full px-2 py-1 bg-background border border-border rounded text-foreground text-[11px]"
                              placeholder="Vehículo"
                            />
                          </div>
                          <div className="w-32">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Servicio</label>
                            <input
                              type="text"
                              value={c.servicio || ''}
                              onChange={e => {
                                const newClientes = [...(scanned.clientes || [])];
                                newClientes[i] = { ...newClientes[i], servicio: e.target.value };
                                setScanned({ ...scanned, clientes: newClientes });
                              }}
                              className="w-full px-2 py-1 bg-background border border-border rounded text-foreground text-[11px]"
                              placeholder="Servicio"
                            />
                          </div>
                          <div className="w-24">
                            <label className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5 text-right">Monto Total</label>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground text-[9px]">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={c.total}
                                onChange={e => {
                                  const newClientes = [...(scanned.clientes || [])];
                                  newClientes[i] = { ...newClientes[i], total: Number(e.target.value) };
                                  const newTotal = newClientes.reduce((acc, curr) => acc + curr.total, 0);
                                  setScanned({ ...scanned, clientes: newClientes, total_ingresos: newTotal });
                                }}
                                className="w-full px-1.5 py-1 bg-background border border-border rounded text-right text-foreground font-semibold text-green-400"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground italic block text-center py-2">No se detectaron líneas de desglose en la imagen</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Notas Adicionales (Opcional)</label>
                <textarea 
                  value={scanned.notas || ''} 
                  onChange={e => setScanned({...scanned, notas: e.target.value})} 
                  rows={2} 
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs placeholder:text-muted-foreground focus:ring-1 focus:ring-primary outline-none" 
                />
              </div>
            </div>
          )}

          {scanError && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-4 bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5" /> {scanError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          {step === 'confirm' && scanned && (
            <>
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
              >
                ← Atrás
              </button>
              <Button
                onClick={() => { onConfirm(scanned); onClose(); }}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" /> Confirmar y guardar
              </Button>
            </>
          )}
          {step !== 'confirm' && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors">
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ venta, ventas, onClose }: { venta: any; ventas: any[]; onClose: () => void }) {
  const { currentSede } = useSedeStore();
  const [printMode, setPrintMode] = useState<'single' | 'dual' | 'diferente'>('dual');
  const [printSide, setPrintSide] = useState<'left' | 'right'>('left');
  const [printCurrencyMode, setPrintCurrencyMode] = useState<'auto' | 'usd' | 'dual'>('auto');
  const [secondVenta, setSecondVenta] = useState<any | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const cleanCliente = venta.cliente ? venta.cliente.replace(/\(WhatsApp\)/gi, '').replace(/ADMIN IA/gi, '').trim() || 'No definido' : 'Consumidor Final';

  const handleDownload = () => {
    try {
      const dataList = [{
        id: venta.id,
        fecha: venta.fecha,
        cliente: cleanCliente === 'Consumidor Final' ? undefined : cleanCliente,
        items: venta.desglose || [],
        total: venta.total_ingresos,
        notas: venta.notas || undefined,
        pago_usd: venta.pago_usd,
        pago_ves: venta.pago_ves,
        tasa_cambio: venta.tasa_cambio,
        iva_aplicado: venta.con_iva,
        metodos_pago: venta.metodos_pago
      }];

      if (printMode === 'dual') {
        dataList.push(dataList[0]);
      } else if (printMode === 'diferente' && secondVenta) {
        const cleanSecondCliente = secondVenta.cliente ? secondVenta.cliente.replace(/\(WhatsApp\)/gi, '').replace(/ADMIN IA/gi, '').trim() || 'No definido' : 'Consumidor Final';
        dataList.push({
          id: secondVenta.id,
          fecha: secondVenta.fecha,
          cliente: cleanSecondCliente === 'Consumidor Final' ? undefined : cleanSecondCliente,
          items: secondVenta.desglose || [],
          total: secondVenta.total_ingresos,
          notas: secondVenta.notas || undefined,
          pago_usd: secondVenta.pago_usd,
          pago_ves: secondVenta.pago_ves,
          tasa_cambio: secondVenta.tasa_cambio,
          iva_aplicado: secondVenta.con_iva,
          metodos_pago: secondVenta.metodos_pago
        });
      }

      const mp = venta.metodos_pago || {};
      const resolvedCurrencyMode = printCurrencyMode === 'auto'
        ? ((mp.pago_movil > 0 || mp.efectivo_ves > 0 || venta.isCashea) ? 'dual' : 'usd')
        : printCurrencyMode;

      generateInvoicePDF(dataList, { mode: printMode, side: printSide, currencyMode: resolvedCurrencyMode as any });
    } catch (err) {
      alert('Error al generar PDF');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-muted/20">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Vista Previa de Factura
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-white text-slate-900 font-sans">
          <div className="border border-slate-200 p-8 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight italic">LYCOS TEAM</h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Servicios Automotrices de Alto Nivel</p>
                <p className="text-[9px] text-slate-400 mt-2">Sede Activa: {currentSede?.nombre || 'General'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase">Factura</p>
                <p className="text-sm font-bold text-slate-900">#{venta.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 mt-1">{venta.fecha}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Facturado a:</p>
                <p className="text-xs font-bold text-slate-900">{cleanCliente}</p>
                <p className="text-[10px] text-slate-500 mt-1">Control de Cierre de Caja</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Resumen:</p>
                <p className="text-xs text-slate-600">{venta.total_servicios} Servicios realizados</p>
                <p className="text-xs text-slate-600">{venta.total_clientes} Clientes atendidos</p>
              </div>
            </div>

            <table className="w-full text-xs mb-8">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-bold text-slate-900">Descripción</th>
                  <th className="text-center py-2 font-bold text-slate-900 w-16">Cant.</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Precio</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(venta.desglose || []).map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="py-3 text-slate-700">{item.descripcion}</td>
                    <td className="py-3 text-center text-slate-600">{item.cantidad}</td>
                    <td className="py-3 text-right text-slate-600">${item.precio_unitario.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium text-slate-900">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-4">
              <div className="w-48 space-y-2">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>SUBTOTAL</span>
                  <span>${Number(venta.total_ingresos).toFixed(2)}</span>
                </div>
                
                {(venta.con_iva || (venta.metodos_pago && Object.values(venta.metodos_pago).some((v: any) => (v ?? 0) > 0))) && (
                  <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Métodos de Pago:</p>
                    {venta.metodos_pago?.pago_movil ? (
                      <div className="flex justify-between text-[9px] text-slate-500 bg-slate-50 p-1 rounded">
                        <span>PAGO MÓVIL</span>
                        <span className="font-bold text-slate-900">Bs. {Number(venta.metodos_pago.pago_movil).toLocaleString('es-VE')}</span>
                      </div>
                    ) : null}
                    {venta.metodos_pago?.zelle ? (
                      <div className="flex justify-between text-[9px] text-slate-500 bg-slate-50 p-1 rounded">
                        <span>ZELLE</span>
                        <span className="font-bold text-slate-900">${Number(venta.metodos_pago.zelle).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {venta.metodos_pago?.efectivo_usd ? (
                      <div className="flex justify-between text-[9px] text-slate-500 bg-slate-50 p-1 rounded">
                        <span>EFECTIVO USD</span>
                        <span className="font-bold text-slate-900">${Number(venta.metodos_pago.efectivo_usd).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {venta.metodos_pago?.euros ? (
                      <div className="flex justify-between text-[9px] text-slate-500 bg-slate-50 p-1 rounded">
                        <span>EUROS (€)</span>
                        <span className="font-bold text-slate-900">€{Number(venta.metodos_pago.euros).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {venta.metodos_pago?.cashea_usd ? (
                      <div className="flex justify-between text-[9px] text-slate-500 bg-slate-50 p-1 rounded">
                        <span>CASHEA</span>
                        <span className="font-bold text-slate-900">${Number(venta.metodos_pago.cashea_usd).toFixed(2)}</span>
                      </div>
                    ) : null}
                  </div>
                )}
                
                {(() => {
                  const isEuroSale = venta.metodos_pago?.euros > 0 || (venta.notas && /euro/i.test(venta.notas));
                  const symbol = isEuroSale ? '€' : '$';
                  return (
                    <div className="flex justify-between text-sm font-black text-slate-900 border-t-2 border-slate-900 pt-2 mt-2">
                      <span>TOTAL</span>
                      <span>{symbol}{Number(venta.total_ingresos).toFixed(2)}</span>
                    </div>
                  );
                })()}
                {venta.tasa_cambio && (
                  <div className="text-right mt-1">
                    <p className="text-[10px] font-bold text-green-600">
                      Total Bs. {(Number(venta.total_ingresos) * venta.tasa_cambio).toLocaleString('es-VE')}
                    </p>
                    <p className="text-[8px] text-slate-400">Tasa: {venta.tasa_cambio} Bs/$</p>
                  </div>
                )}
              </div>
            </div>

            {venta.notas && (
              <div className="mt-8 pt-4 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notas:</p>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  {venta.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim()}
                </p>
              </div>
            )}

            <div className="mt-12 pt-8 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic tracking-[0.2em]">¡Gracias por confiar en Lycos Team!</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/30 bg-muted/20 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setShowSelector(!showSelector)}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border",
                secondVenta ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-border/50 text-muted-foreground hover:bg-white/10"
              )}
            >
              <Receipt className="w-4 h-4" /> 
              {secondVenta ? 'Cambiar' : 'Dual'}
            </button>
            
            <div className="flex items-center bg-white/5 rounded-xl p-1 gap-1 border border-border/30">
              <button 
                onClick={() => setPrintMode('single')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'single' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"
                )}
              >
                Única
              </button>
              <button 
                onClick={() => setPrintMode('dual')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'dual' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"
                )}
                title="Dos copias de la misma factura"
              >
                Dual
              </button>
              <button 
                onClick={() => {
                  setPrintMode('diferente');
                  if (!secondVenta) setShowSelector(true);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'diferente' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"
                )}
                title="Dos facturas diferentes"
              >
                Diferente
              </button>
            </div>

            <div className="flex items-center bg-white/5 rounded-xl p-1 gap-1 border border-border/30">
              <button 
                onClick={() => setPrintCurrencyMode('auto')}
                className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", printCurrencyMode === 'auto' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white")}
                title="Auto detecta si pagó en Bs para imprimir Dual, sino Solo USD"
              >
                Auto
              </button>
              <button 
                onClick={() => setPrintCurrencyMode('usd')}
                className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", printCurrencyMode === 'usd' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white")}
                title="Imprimir solo columnas en USD"
              >
                Solo USD
              </button>
              <button 
                onClick={() => setPrintCurrencyMode('dual')}
                className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", printCurrencyMode === 'dual' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white")}
                title="Imprimir columnas en Bs y USD"
              >
                Bs+USD
              </button>
            </div>

            {printMode === 'single' && (
              <div className="flex items-center bg-white/5 rounded-xl p-1 gap-1 border border-border/30">
                <button 
                  onClick={() => setPrintSide('left')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    printSide === 'left' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"
                  )}
                >
                  Izq
                </button>
                <button 
                  onClick={() => setPrintSide('right')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    printSide === 'right' ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"
                  )}
                >
                  Der
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <Button onClick={handleDownload} className="flex-1 sm:flex-none gap-2 bg-primary hover:bg-primary/90 text-white font-bold h-11 text-xs">
              <Download className="w-4 h-4" /> PDF
            </Button>
            <button onClick={onClose} className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30 sm:border-transparent">Cerrar</button>
          </div>
        </div>

        {/* Selector de Segunda Factura */}
        {showSelector && (
          <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80%]">
              <div className="flex items-center justify-between p-4 border-b border-border/30">
                <h3 className="text-sm font-bold flex items-center gap-2 italic uppercase tracking-tighter">
                  <Receipt className="w-4 h-4 text-primary" /> Seleccionar Otra Factura
                </h3>
                <button onClick={() => setShowSelector(false)} className="p-2 hover:bg-white/5 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-4 overflow-hidden">
                <input 
                  autoFocus
                  className="w-full bg-white/5 border border-border/50 rounded-xl px-4 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Buscar por cliente..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {ventas.filter(v => v.id !== venta.id && (searchTerm === '' || (v.cliente || '').toLowerCase().includes(searchTerm.toLowerCase()))).map(v => (
                    <button 
                      key={v.id} 
                      onClick={() => { setSecondVenta(v); setShowSelector(false); }}
                      className="w-full text-left p-3 rounded-xl border border-border/30 hover:bg-white/5 transition-all flex justify-between items-center"
                    >
                      <div>
                        <p className="text-xs font-bold text-foreground">{v.cliente || 'Consumidor Final'}</p>
                        <p className="text-[10px] text-muted-foreground italic">{v.fecha}</p>
                      </div>
                      <p className="text-xs font-bold text-primary">${v.total_ingresos.toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EgresoPreviewModal({ egreso, onClose }: { egreso: Egreso; onClose: () => void }) {
  const handleDownload = () => {
    try {
      generateEgresoPDF({
        id: egreso.id,
        fecha: egreso.fecha,
        cliente: egreso.cliente || undefined,
        categoria: egreso.categoria,
        items: egreso.desglose || [],
        total: egreso.total_egresos,
        notas: egreso.notas || undefined
      });
    } catch (err) {
      alert('Error al generar PDF');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-muted/20">
          <h2 className="text-sm font-bold flex items-center gap-2 text-rose-400">
            <Receipt className="w-4 h-4" /> Vista Previa de Egreso
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-white text-slate-900 font-sans">
          <div className="border border-slate-200 p-8 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">LYCOS TEAM</h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Comprobante de Egreso / Pago</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase">Egreso</p>
                <p className="text-sm font-bold text-slate-900">#{egreso.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 mt-1">{egreso.fecha}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Pagado a:</p>
                <p className="text-xs font-bold text-slate-900">{egreso.cliente || 'Proveedor / Otros'}</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">Categoría: {egreso.categoria}</p>
              </div>
            </div>

            <table className="w-full text-xs mb-8">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-bold text-slate-900">Concepto</th>
                  <th className="text-center py-2 font-bold text-slate-900 w-16">Cant.</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Precio</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {egreso.desglose.map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 text-slate-700">{item.descripcion}</td>
                    <td className="py-3 text-center text-slate-600">{item.cantidad}</td>
                    <td className="py-3 text-right text-slate-600">${item.precio_unitario.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium text-slate-900">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-4">
              <div className="w-48 space-y-2">
                <div className="flex justify-between text-xs font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>TOTAL PAGADO</span>
                  <span className="text-rose-600">${egreso.total_egresos.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {egreso.notas && (
              <div className="mt-12 pt-4 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notas:</p>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">{egreso.notas}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border/30 bg-muted/20 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm">Cerrar</button>
          <Button onClick={handleDownload} className="gap-2 bg-rose-600 hover:bg-rose-700">
            <Download className="w-4 h-4" /> Descargar PDF Egreso
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function ReportesPage() {
  const [ventas, setVentas] = useState<VentaDia[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [cierresOficiales, setCierresOficiales] = useState<CierreOficial[]>([]);
  const [serviciosHistory, setServiciosHistory] = useState<any[]>([]);
  const [inventarioHistory, setInventarioHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'graficos' | 'ventas' | 'cierres' | 'egresos' | 'historial' | 'papelera' | 'distribuciones'>('graficos');
  const [papeleraVentas, setPapeleraVentas] = useState<any[]>([]);
  const [loadingPapelera, setLoadingPapelera] = useState(false);
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [loadingDistribuciones, setLoadingDistribuciones] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');
  const [chartGranularity, setChartGranularity] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [showManual, setShowManual] = useState(false);
  const [showManualEgreso, setShowManualEgreso] = useState(false);
  const [showCierreWizard, setShowCierreWizard] = useState(false);
  const [scanMode, setScanMode] = useState<'cierre' | 'ticket' | 'egreso' | null>(null);
  const [editando, setEditando] = useState<VentaDia | null>(null);
  const [editandoEgreso, setEditandoEgreso] = useState<Egreso | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<string | null>(null);
  const [selectedVenta, setSelectedVenta] = useState<VentaDia | null>(null);
  const [selectedEgreso, setSelectedEgreso] = useState<Egreso | null>(null);
  const [mounted, setMounted] = useState(false);
  const [currentTasa, setCurrentTasa] = useState(518.0);
  const { currentSede } = useSedeStore();
  const { user } = useAppStore();
  const isAdmin = user?.rol === 'admin';

  useEffect(() => {
    setMounted(true);
    fetch('/api/rates').then(r => r.json()).then(d => setCurrentTasa(d.bcv || 0)).catch(() => {});
  }, []);

  // Load distribuciones when tab changes to distribuciones
  useEffect(() => {
    if (tab !== 'distribuciones' || !supabase) return;
    setLoadingDistribuciones(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('distribuciones')
          .select('*')
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200);
        setDistribuciones((data || []) as Distribucion[]);
      } catch (err) {
        console.error('Error fetching distribuciones:', err);
      } finally {
        setLoadingDistribuciones(false);
      }
    })();
  }, [tab]);

  // Calendar State
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);

  // Stats from ventas
  const totalIngresos = ventas.reduce((s, v) => s + Number(v.total_ingresos), 0);
  const totalEgresos = egresos.reduce((s, e) => s + Number(e.total_egresos), 0);
  const balanceNeto = totalIngresos - totalEgresos;
  const totalServicios = ventas.reduce((s, v) => s + Number(v.total_servicios), 0);
  const totalClientes = ventas.reduce((s, v) => s + Number(v.total_clientes), 0);
  const ticketPromedio = totalServicios > 0 ? totalIngresos / totalServicios : 0;

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '3m' ? 90 : 365;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    
    const [vRes, sRes, eRes, cRes, invRes, serRes, papRes] = await Promise.all([
      withSedeFilter(supabase.from('ventas_dia')).select('*').gte('fecha', from).order('fecha', { ascending: false }),
      withSedeFilter(supabase.from('ventas_silenciadores')).select('*').gte('fecha', from).order('created_at', { ascending: false }),
      withSedeFilter(supabase.from('egresos')).select('*').gte('fecha', from).order('fecha', { ascending: false }),
      withSedeFilter(supabase.from('cierres_caja')).select('*').gte('fecha', from).order('fecha', { ascending: false }),
      withSedeFilter(supabase.from('inventario')).select('*'),
      withSedeFilter(supabase.from('servicios')).select('*').gte('created_at', from),
      withSedeFilter(supabase.from('logs_actividad')).select('*').eq('accion', 'Eliminó venta (Papelera)').order('created_at', { ascending: false })
    ]);

    const invData = invRes.data || [];
    setInventarioHistory(invData);
    setServiciosHistory(serRes.data || []);

    // Normalize ventas_silenciadores (IA or direct POS logs)
    const normalizedSil = (sRes.data || []).map((v: any, idx: number) => {
      const notes = v.notas || '';
      
      // Robust multi-format price extraction (EXACTLY from silenciadores/page.tsx)
      const totalMatch =
        notes.match(/[Tt]otal(?:\s+a\s+pagar)?\s*(?:[Cc]ashea|USD|BCV)?\s*[:=]?\s*(?:USD\s*)?\$?\s*([\d]+(?:[.,][\d]+)?)/i) ||
        notes.match(/\[[Tt]otal\s+[^\]]+\]\s*[:=]?\s*\$?\s*([\d]+(?:[.,][\d]+)?)/i) ||
        notes.match(/\| [Tt]otal:\s*\$([\d]+(?:[.,][\d]+)?)/i) ||
        notes.match(/USD\s+([\d]+(?:[.,][\d]+)?)/i) ||
        notes.match(/\[Total:\s*\$([\d]+(?:[.,][\d]+)?)/i);

      const rawPrice = totalMatch ? totalMatch[1].replace(',', '.') : null;
      const extractedPrice = rawPrice ? parseFloat(rawPrice) : null;
      
      const isCashea = /cashea/i.test(notes);
      const isBinance = /binance|usdt/i.test(notes);
      
      let unitPrice = v.precio_registrado || extractedPrice;
      let usedExtracted = !!(v.precio_registrado || extractedPrice);
      
      if (!unitPrice) {
        const modelLower = (v.modelo || '').toLowerCase().trim();
        const matchedProduct = invData.find((p: any) => {
          const nameLower = (p.nombre || '').toLowerCase();
          return nameLower === modelLower || nameLower.includes(modelLower) || (modelLower.length > 2 && modelLower.includes(nameLower));
        });
        if (matchedProduct) {
          unitPrice = isCashea
            ? (matchedProduct.precio_bs || matchedProduct.precio_usd || 0)
            : (matchedProduct.precio_promo || matchedProduct.precio_usd || matchedProduct.precio || 0);
          usedExtracted = false; // Came from inventory, so it's a unit price
        } else {
          unitPrice = 0;
        }
      }

      // If we got the price from "Total" lines, it's already the total.
      // If we got it from inventory, we multiply by quantity.
      const finalTotal = usedExtracted ? Number(unitPrice) : Number(unitPrice) * (v.cantidad || 1);
      
      const clienteMatch = notes.match(/[Cc]liente[:\s]+([^|\n,]+)/i) || notes.match(/\| [Cc]liente:\s*([^|]+)/i);
      const cliente = clienteMatch ? clienteMatch[1].trim() : 'Consumidor Final (IA)';

      const metodos_pago: any = {};
      if (isCashea) metodos_pago.cashea_usd = finalTotal;
      else if (isBinance) metodos_pago.binance = finalTotal;
      else if (/zelle/i.test(notes)) metodos_pago.zelle = finalTotal;
      else if (/efectivo/i.test(notes)) metodos_pago.efectivo_usd = finalTotal;
      else if (/pago movil|bs/i.test(notes)) metodos_pago.pago_movil = finalTotal * (v.tasa_cambio || currentTasa || 518.0);
      else metodos_pago.otro = finalTotal;

      let parsedItems: any[] = [];
      const itemsMatch = notes.match(/Items?:\s*([^|\n]+)/i);
      if (itemsMatch) {
        itemsMatch[1].split(',').forEach((item: string) => {
          const raw = item.trim();
          // Improved regex to catch "Product: Price", "Product = Price", "Product $Price" or "Product USD Price"
          const priceMatch = raw.match(/[:=$]\s*([\d]+(?:[.,][\d]+)?)/) || 
                             raw.match(/USD\s*([\d]+(?:[.,][\d]+)?)/i) ||
                             raw.match(/\$([\d]+(?:[.,][\d]+)?)/);
          
          const p = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
          
          let desc = raw;
          if (priceMatch) {
            desc = raw.replace(priceMatch[0], '').trim().replace(/[:=]\s*$/, '').trim();
          }
          if (desc) {
            parsedItems.push({
              cantidad: 1, 
              descripcion: desc,
              precio_unitario: p,
              total: p
            });
          }
        });
      }

      if (parsedItems.length === 0) {
        const invoiceBlock = notes.match(/\[FACTURA_IA_START\]\n([\s\S]*?)\n\[FACTURA_IA_END\]/);
        if (invoiceBlock) {
          const lines = invoiceBlock[1].split('\n').filter((l: string) => l.includes('|') && !l.includes('CANT |'));
          parsedItems = lines.map((line: string) => {
            const parts = line.split('|').map((p: string) => p.trim());
            if (parts.length >= 4) {
              return {
                cantidad: parseFloat(parts[0]) || 1,
                descripcion: parts[1],
                precio_unitario: parseFloat(parts[2].replace(',', '.')) || 0,
                total: parseFloat(parts[3].replace(',', '.')) || 0
              };
            }
            return null;
          }).filter(Boolean);
        }
      }
      return {
        id: v.id || `sil-${idx}-${Date.now()}`,
        fecha: (v.fecha || v.created_at || new Date().toISOString()).split('T')[0],
        cliente: cliente,
        total_ingresos: finalTotal,
        total_servicios: v.cantidad || 1,
        total_clientes: 1,
        desglose: parsedItems.length > 0 ? parsedItems : [{
          descripcion: v.modelo || 'Venta Silenciador',
          cantidad: v.cantidad || 1,
          precio_unitario: finalTotal / (v.cantidad || 1),
          total: finalTotal
        }],
        notas: v.notas,
        imagen_url: null,
        creado_por: 'Asistente IA',
        created_at: v.created_at,
        tasa_cambio: v.tasa_cambio || currentTasa || 518.0,
        metodos_pago,
        source: 'ia',
        isCashea,
        isBinance
      } as unknown as VentaDia;
    });
    const normalizedManual = (vRes.data || []).map((v: any, idx: number) => ({
      ...v,
      id: v.id || `pos-${idx}-${Date.now()}`,
      source: 'pos',
      isCashea: (v.notas || '').toLowerCase().includes('cashea') || (v.metodos_pago && Number(v.metodos_pago.cashea) > 0),
      isBinance: (v.notas || '').toLowerCase().includes('binance') || (v.metodos_pago && Number(v.metodos_pago.binance) > 0)
    }));

    const allVentas = [...normalizedManual, ...normalizedSil].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setVentas(allVentas);
    setEgresos((eRes.data as Egreso[]) || []);
    setCierresOficiales((cRes.data as CierreOficial[])?.map((c, i) => ({ ...c, id: c.id || `c-${i}-${Date.now()}` })) || []);
    setPapeleraVentas(papRes.data || []);
    setLoading(false);
  }, [period, currentSede]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('financial-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas_dia' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres_caja' }, () => loadData())
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [loadData]);

  // Chart data grouping by granularity
  const chartData = React.useMemo(() => {
    const dataObj: Record<string, { semana: string; ingresos: number; egresos: number; servicios: number }> = {};
    
    const getKey = (d: Date) => {
      if (chartGranularity === 'days') return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      if (chartGranularity === 'months') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
      const weekNum = Math.floor(d.getDate() / 7) + 1;
      return `${d.toLocaleString('es-ES', { month: 'short' })} S${weekNum}`;
    };

    // Generate timeline deterministically
    const numPoints = chartGranularity === 'days' ? 14 : (chartGranularity === 'months' ? 6 : 12);
    for (let i = numPoints - 1; i >= 0; i--) {
      const d = new Date();
      if (chartGranularity === 'days') d.setDate(d.getDate() - i);
      else if (chartGranularity === 'months') d.setMonth(d.getMonth() - i);
      else d.setDate(d.getDate() - (i * 7));
      
      const key = getKey(d);
      dataObj[key] = { semana: key, ingresos: 0, egresos: 0, servicios: 0 };
    }
    
    ventas.forEach(v => {
      const d = new Date((v.fecha || v.created_at).split('T')[0] + 'T12:00:00');
      const key = getKey(d);
      if (dataObj[key]) {
        dataObj[key].ingresos += Number(v.total_ingresos) || 0;
        dataObj[key].servicios += Number(v.total_servicios) || 0;
      }
    });

    egresos.forEach(e => {
      const d = new Date(e.fecha + 'T12:00:00');
      const key = getKey(d);
      if (dataObj[key]) {
        dataObj[key].egresos += Number(e.total_egresos) || 0;
      }
    });

    return Object.values(dataObj);
  }, [ventas, egresos, chartGranularity]);

  const handleSaveVenta = async (data: Partial<VentaDia>) => {
    if (!supabase) return;
    const payload = { ...data, updated_at: new Date().toISOString() };
    if (editando) {
      // Intentar actualizar en ambas tablas — una de ellas tendrá el id real
      const descLines = (data.desglose || [])
        .filter(i => i.descripcion?.trim())
        .map(i => `${i.descripcion}:$${Number(i.total).toFixed(2)}`)
        .join(', ');

      const notasSil = [
        `[Editado desde Reportes]`,
        `Cliente: ${data.cliente || 'Consumidor Final'}`,
        `Total: $${Number(data.total_ingresos).toFixed(2)}`,
        descLines ? `Items: ${descLines}` : '',
        `Datos: ${JSON.stringify({
          cliente: data.cliente,
          total: Number(data.total_ingresos),
          servicios: Number(data.total_servicios),
          clientes: Number(data.total_clientes),
          desglose: data.desglose,
          metodos_pago: data.metodos_pago,
          notas: data.notas,
          con_iva: data.con_iva,
          pago_usd: data.pago_usd,
          pago_ves: data.pago_ves,
          tasa_cambio: data.tasa_cambio
        })}`
      ].filter(Boolean).join(' | ');

      const [resDia, resSil] = await Promise.all([
        withSedeFilter(supabase.from('ventas_dia'))
          .update(payload)
          .eq('id', editando.id),
        withSedeFilter(supabase.from('ventas_silenciadores'))
          .update({
            cantidad: Number(data.total_servicios) || 1,
            modelo: data.cliente || 'Venta',
            notas: notasSil,
            fecha: data.fecha || new Date().toISOString().split('T')[0],
            precio_registrado: Number(data.total_ingresos) || 0,
          })
          .eq('id', editando.id)
      ]);

      const errFinal = resDia.error && resSil.error ? resDia.error : null;
      if (errFinal) throw errFinal;

      // Log Activity
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Reportes',
        accion: 'Editó venta',
        detalles: `Cliente: ${data.cliente}, Total: $${Number(data.total_ingresos).toFixed(2)}`,
        referencia_id: editando.id,
        referencia_tabla: editando.source === 'ia' ? 'ventas_silenciadores' : 'ventas_dia'
      });
    } else {
      const { data: nuevaVenta } = await withSedeFilter(supabase.from('ventas_dia'))
        .insert(withSedeInsert({ ...payload, creado_por: 'Admin' }))
        .select()
        .single();
      
      try {
        if (nuevaVenta) {
          await registrarFactura({
            tipo: 'venta',
            modulo_origen: 'reportes',
            referencia_id: nuevaVenta.id,
            referencia_tabla: 'ventas_dia',
            cliente: data.cliente || 'Consumidor Final',
            total: Number(data.total_ingresos),
            moneda: 'USD',
            tasa_cambio: data.tasa_cambio,
            total_bs: Number(data.total_ingresos) * (data.tasa_cambio || 518),
            items: data.desglose || [],
            metodos_pago: data.metodos_pago,
            con_iva: data.con_iva || false,
            estado: 'pagado',
            notas: data.notas || undefined,
            emitido_por: useAppStore.getState().user?.nombre || 'Admin',
            fecha_emision: data.fecha || new Date().toISOString().split('T')[0],
            sede_id: useSedeStore.getState().currentSede?.id || undefined,
          });
        }
      } catch (err) {
        console.error('Error registering centralized factura from reportes:', err);
      }

      // Log Activity
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Reportes',
        accion: 'Registró venta manual',
        detalles: `Cliente: ${data.cliente}, Total: $${Number(data.total_ingresos).toFixed(2)}`,
        referencia_tabla: 'ventas_dia'
      });
    }
    setEditando(null);
    loadData();
  };

  const handleSaveEgreso = async (data: Partial<Egreso>) => {
    if (!supabase) return;
    const payload = { ...data, updated_at: new Date().toISOString() };
    if (editandoEgreso) {
      await withSedeFilter(supabase.from('egresos')).update(payload).eq('id', editandoEgreso.id);
    } else {
      await withSedeFilter(supabase.from('egresos')).insert(withSedeInsert({ ...payload, creado_por: 'Admin' }));

      // Log Activity
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Reportes',
        accion: 'Registró egreso manual',
        detalles: `Categoría: ${data.categoria}, Total: $${Number(data.total_egresos).toFixed(2)}`,
        referencia_tabla: 'egresos'
      });
    }
    setEditandoEgreso(null);
    loadData();
  };

  const handleScanConfirm = async (scanned: ScannedData) => {
    if (scanMode === 'egreso') {
      await handleSaveEgreso({
        fecha: scanned.fecha,
        cliente: scanned.cliente_nombre || null,
        total_egresos: scanned.total_ingresos,
        desglose: scanned.items || [],
        categoria: 'otro',
        notas: scanned.notas || null
      });
      return;
    }

    let finalNotas = scanned.notas || '';
    if (scanned.rawText) {
      finalNotas = finalNotas ? `${finalNotas}\n\n[FACTURA_IA_START]\n${scanned.rawText}\n[FACTURA_IA_END]` : `[FACTURA_IA_START]\n${scanned.rawText}\n[FACTURA_IA_END]`;
    }

    // Map items and client details based on scan mode
    let finalCliente = 'Cierre de Caja';
    let finalItems: DesglosItem[] = [];

    if (scanMode === 'ticket') {
      finalCliente = scanned.cliente_nombre || '';
      if (scanned.cliente_vehiculo) {
        finalCliente = finalCliente ? `${finalCliente} (${scanned.cliente_vehiculo})` : scanned.cliente_vehiculo;
      }
      finalItems = scanned.items || [];
    } else {
      // Cierre mode
      finalCliente = scanned.cliente_nombre || (scanned.clientes?.[0]?.nombre) || 'Cierre de Caja';
      if (scanned.clientes && scanned.clientes.length > 0) {
        finalItems = scanned.clientes.map(c => ({
          descripcion: `${c.nombre}${c.carro ? ' - ' + c.carro : ''}${c.servicio ? ' (' + c.servicio + ')' : ''}`,
          cantidad: 1,
          precio_unitario: c.total,
          total: c.total
        }));
      } else {
        finalItems = scanned.items || [];
      }
    }

    await handleSaveVenta({
      fecha: scanned.fecha,
      cliente: finalCliente || null,
      total_ingresos: scanned.total_ingresos,
      total_servicios: scanned.total_servicios || finalItems.length || 1,
      total_clientes: scanned.total_clientes || scanned.clientes_atendidos || (scanMode === 'ticket' ? 1 : (scanned.clientes?.length || 1)),
      desglose: finalItems,
      notas: finalNotas || null,
      pago_usd: scanned.formas_de_pago?.dolares || 0,
      pago_ves: scanned.formas_de_pago?.efectivo_bs || 0,
      tasa_cambio: scanned.formas_de_pago?.tasa || 0
    });
  };

  const handleDelete = async (id: string) => {
    const sale = ventas.find(v => v.id === id);
    if (!sale) return;

    if (confirm('¿Estás seguro de eliminar esta venta? Se enviará a la papelera y podrá ser restaurada.')) {
      setDeleting(id);
      
      // Guardar respaldo en logs_actividad como papelera
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Reportes',
        accion: 'Eliminó venta (Papelera)',
        detalles: JSON.stringify({
          originalRecord: sale,
          source: sale.source,
          deletedAt: new Date().toISOString()
        }),
        referencia_id: String(id),
        referencia_tabla: sale.source === 'ia' ? 'ventas_silenciadores' : 'ventas_dia'
      });

      // Eliminar de la tabla correspondiente
      try {
        if (!supabase) throw new Error('Supabase client not initialized');
        if (sale.source === 'ia') {
          const { error } = await supabase.from('ventas_silenciadores').delete().eq('id', id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('ventas_dia').delete().eq('id', id);
          if (error) throw error;
        }
        alert('Venta eliminada con éxito y trasladada a la papelera.');
      } catch (err: any) {
        console.error('Error deleting sale:', err);
        alert('No se pudo eliminar la venta: ' + (err.message || err.details || JSON.stringify(err)));
      }

      setDeleting(null);
      loadData();
    }
  };

  const handleRestoreVenta = async (logRecord: any) => {
    if (!supabase) return;
    try {
      const payload = JSON.parse(logRecord.detalles);
      const originalRecord = payload.originalRecord;
      const source = payload.source;

      if (!originalRecord) {
        alert('No se encontraron los datos originales para restaurar.');
        return;
      }

      if (confirm('¿Restaurar esta venta eliminada?')) {
        setActioningId(logRecord.id);
        
        // Reconstruir registro para inserción
        if (source === 'ia') {
          const { error: insError } = await supabase.from('ventas_silenciadores').insert({
            id: originalRecord.id,
            fecha: originalRecord.fecha,
            total_ingresos: originalRecord.total_ingresos,
            total_servicios: originalRecord.total_servicios,
            total_clientes: originalRecord.total_clientes,
            notas: originalRecord.notas,
            creado_por: originalRecord.creado_por || 'Chatbot',
            created_at: originalRecord.created_at,
            metodos_pago: originalRecord.metodos_pago,
            desglose: originalRecord.desglose,
            sede_id: logRecord.sede_id
          });
          if (insError) throw insError;
        } else {
          const { error: insError } = await supabase.from('ventas_dia').insert({
            id: originalRecord.id,
            fecha: originalRecord.fecha,
            cliente: originalRecord.cliente,
            total_ingresos: originalRecord.total_ingresos,
            total_servicios: originalRecord.total_servicios,
            total_clientes: originalRecord.total_clientes,
            desglose: originalRecord.desglose,
            notas: originalRecord.notas,
            creado_por: originalRecord.creado_por,
            created_at: originalRecord.created_at,
            sede_id: logRecord.sede_id,
            pago_usd: originalRecord.pago_usd || 0,
            pago_ves: originalRecord.pago_ves || 0,
            tasa_cambio: originalRecord.tasa_cambio || 0
          });
          if (insError) throw insError;
        }

        // Registrar auditoría de restauración
        await logActivity({
          usuario: useAppStore.getState().user?.nombre || 'Admin',
          modulo: 'Reportes',
          accion: 'Restauró venta (Papelera)',
          detalles: `Restauró venta de ${originalRecord.cliente || 'Cons. Final'} por $${originalRecord.total_ingresos}`,
          referencia_id: originalRecord.id,
          referencia_tabla: source === 'ia' ? 'ventas_silenciadores' : 'ventas_dia'
        });

        // Eliminar log de eliminación
        await supabase.from('logs_actividad').delete().eq('id', logRecord.id);

        alert('Venta restaurada exitosamente.');
        loadData();
      }
    } catch (err: any) {
      console.error('Error restaurando venta:', err);
      alert(`Error al restaurar venta: ${err.message || 'Error desconocido'}`);
    } finally {
      setActioningId(null);
    }
  };

  const handlePurgeVenta = async (logId: string) => {
    if (!supabase) return;
    if (confirm('¿Estás seguro de eliminar PERMANENTEMENTE esta venta de la papelera? Esta acción no se puede deshacer.')) {
      try {
        setActioningId(logId);
        const { error } = await supabase.from('logs_actividad').delete().eq('id', logId);
        if (error) throw error;
        
        alert('Venta eliminada permanentemente de la papelera.');
        loadData();
      } catch (err: any) {
        console.error('Error purgando venta:', err);
        alert(`Error al purgar venta: ${err.message || 'Error desconocido'}`);
      } finally {
        setActioningId(null);
      }
    }
  };

  const exportCSV = () => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '3m' ? 90 : 365;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    window.location.href = `/api/reportes/export?tipo=ventas&from=${from}&to=${to}`;
  };

  const exportCitas = () => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '3m' ? 90 : 365;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    window.location.href = `/api/reportes/export?tipo=citas&from=${from}&to=${to}`;
  };

  // Calendar utils
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };
  
  const getVentasForDate = (dateStr: string) => ventas.filter(v => v.fecha === dateStr);
  
  const exportDay = (type: 'ventas'|'citas') => {
    if (!selectedDate) return;
    window.location.href = `/api/reportes/export?tipo=${type}&from=${selectedDate}&to=${selectedDate}`;
  };

  const exportMonth = (type: 'ventas'|'citas') => {
    const from = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-01`;
    const to = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(getDaysInMonth(currentYear, currentMonth)).padStart(2,'0')}`;
    window.location.href = `/api/reportes/export?tipo=${type}&from=${from}&to=${to}`;
  };

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between w-full">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
            <p className="text-muted-foreground mt-1">Control definitivo de ingresos, métricas y facturación con IA</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => setShowManual(true)} variant="outline" className="gap-2 flex-1 sm:flex-none border-border">
              <Plus className="w-4 h-4" /> Manual
            </Button>
            <Button onClick={() => setShowCierreWizard(true)} className="gap-2 flex-1 sm:flex-none bg-orange-600 hover:bg-orange-700 text-white font-bold">
              <FileText className="w-4 h-4" /> Cierre PDF
            </Button>
            <div className="relative group">
              <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white flex-1 sm:flex-none">
                <Camera className="w-4 h-4" /> Escanear... <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border/50 rounded-xl shadow-xl flex-col p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-50">
                <div className="absolute -top-3 left-0 right-0 h-4 bg-transparent" />
                <button
                  onClick={() => setScanMode('cierre')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5 rounded-lg text-left"
                >
                  <Package className="w-4 h-4 text-violet-400" /> Cierre de Caja
                </button>
                <button
                  onClick={() => setScanMode('egreso')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5 rounded-lg text-left"
                >
                  <ArrowDownCircle className="w-4 h-4 text-rose-400" /> Egreso / Gasto
                </button>
                <button
                  onClick={() => setScanMode('ticket')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5 rounded-lg text-left"
                >
                  <FileText className="w-4 h-4 text-green-400" /> Factura / Ticket
                </button>
              </div>
            </div>
            
            {/* Export Dropdown */}
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[100px] sm:w-[120px] h-9 text-[10px] sm:text-xs font-bold border-border bg-card shadow-sm text-foreground">
                  <Clock className="w-3.5 h-3.5 mr-1 text-primary" />
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 días</SelectItem>
                  <SelectItem value="30d">Últimos 30 días</SelectItem>
                  <SelectItem value="3m">Últimos 3 meses</SelectItem>
                  <SelectItem value="1y">Último año</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative group">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border">
                  <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span> <ChevronDown className="w-3 h-3" />
                </Button>
                <div className="absolute right-0 top-full pt-1 w-48 bg-transparent opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-20">
                  <div className="bg-card border border-border rounded-xl shadow-xl py-1 overflow-hidden">
                    <button onClick={exportCSV} className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition-colors">
                      <FileText className="w-3.5 h-3.5 text-primary" /> Ventas (Excel/CSV)
                    </button>
                    <button onClick={exportCitas} className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition-colors">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" /> Citas (Excel/CSV)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl w-full sm:w-fit overflow-x-auto custom-scrollbar whitespace-nowrap">
        <button
          onClick={() => setTab('graficos')}
          className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
            tab === 'graficos' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <BarChart2 className="w-4 h-4" /> Gráficos
        </button>
        <button
          onClick={() => setTab('ventas')}
          className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
            tab === 'ventas' ? 'bg-card shadow-sm text-green-400 font-bold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ShoppingCart className="w-4 h-4 text-green-400" /> Ventas
        </button>
        <button
          onClick={() => setTab('cierres')}
          className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
            tab === 'cierres' ? 'bg-card shadow-sm text-orange-400 font-bold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Package className="w-4 h-4 text-orange-400" /> Cierres
        </button>
        <button
          onClick={() => setTab('egresos')}
          className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
            tab === 'egresos' ? 'bg-card shadow-sm text-rose-400 font-bold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ArrowDownCircle className="w-4 h-4 text-rose-400" /> Egresos
          {egresos.length > 0 && (
            <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full font-semibold">
              {egresos.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('historial')}
          className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
            tab === 'historial' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Calendar className="w-4 h-4" /> Historial
        </button>
        <button
          onClick={() => setTab('distribuciones')}
          className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
            tab === 'distribuciones' ? 'bg-card shadow-sm text-indigo-400 font-bold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Truck className="w-4 h-4 text-indigo-400" /> Distribuciones
          {distribuciones.length > 0 && (
            <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-semibold">
              {distribuciones.length}
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('papelera')}
            className={cn('flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0',
              tab === 'papelera' ? 'bg-card shadow-sm text-red-500 font-bold border border-red-500/20' : 'text-muted-foreground hover:text-foreground hover:text-red-400'
            )}
          >
            <Trash2 className="w-4 h-4 text-red-500 animate-pulse" /> Papelera
            {papeleraVentas.length > 0 && (
              <span className="text-[10px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded-full font-semibold ml-1">
                {papeleraVentas.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Ingresos', value: `${(totalIngresos || 0).toFixed(2)}`, sub: 'Recibido', icon: DollarSign, color: 'text-green-400 bg-green-500/10' },
          { label: 'Egresos', value: `${(totalEgresos || 0).toFixed(2)}`, sub: 'Gastos', icon: ArrowDownCircle, color: 'text-rose-400 bg-rose-500/10' },
          { label: 'Balance', value: `${(balanceNeto || 0).toFixed(2)}`, sub: 'Neto', icon: TrendingUp, color: balanceNeto >= 0 ? 'text-blue-400 bg-blue-500/10' : 'text-rose-400 bg-rose-500/10' },
          { label: 'Promedio', value: `${(ticketPromedio || 0).toFixed(2)}`, sub: 'Ticket', icon: Receipt, color: 'text-purple-400 bg-purple-500/10' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border/50 bg-card/50 p-3 sm:p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold mt-1" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {loading ? '—' : value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab: Gráficos ─────────────────────────────────────── */}
      {tab === 'graficos' && (
        <div className="space-y-4">
          {chartData.length === 0 && !loading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <BarChart2 className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin datos para mostrar</p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
                  Registra cierres de caja para ver los gráficos de ingresos y tendencias.
                </p>
                <Button onClick={() => setShowManual(true)} className="mt-4 gap-2" size="sm">
                  <Plus className="w-4 h-4" /> Registrar primer cierre
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-4">
                  <div>
                    <CardTitle className="text-base">Evolución Financiera</CardTitle>
                    <CardDescription className="text-xs">Comparativa de ingresos vs egresos</CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50">
                      <button 
                        onClick={() => setChartGranularity('days')}
                        className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all", chartGranularity === 'days' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-muted-foreground hover:text-slate-700")}
                      >Días</button>
                      <button 
                        onClick={() => setChartGranularity('weeks')}
                        className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all", chartGranularity === 'weeks' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-muted-foreground hover:text-slate-700")}
                      >Semanas</button>
                      <button 
                        onClick={() => setChartGranularity('months')}
                        className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all", chartGranularity === 'months' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-muted-foreground hover:text-slate-700")}
                      >Meses</button>
                    </div>
                    <div className="flex gap-4 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-400" /> INGRESOS</span>
                      <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-400" /> EGRESOS</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gIngresos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gEgresos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e11d48" stopOpacity={0.3} /><stop offset="95%" stopColor="#e11d48" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#f97316" strokeWidth={2} fill="url(#gIngresos)" />
                      <Area type="monotone" dataKey="egresos" name="Egresos" stroke="#e11d48" strokeWidth={2} fill="url(#gEgresos)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Actividad Semanal</CardTitle>
                  <CardDescription className="text-xs">Servicios y volumen de trabajo</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="servicios" name="Servicios realizados" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

        {/* ── Tab: Ventas (Historical logs) ───────────────────────── */}
      {tab === 'ventas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Registros de Ventas</h3>
            <Button onClick={() => { setEditando(null); setShowManual(true); }} className="gap-2 bg-green-600 hover:bg-green-700 h-9 text-xs shadow-lg shadow-green-500/20">
              <Plus className="w-4 h-4" /> Nueva Venta Manual
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Cargando ventas...</span>
            </div>
          ) : ventas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ShoppingCart className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin ventas registradas</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4 text-center max-w-xs">
                  Las ventas del POS Silenciadores y las capturadas por la IA aparecerán aquí automáticamente.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/40 shadow-xl overflow-hidden bg-card/30 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20 bg-muted/5">
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Fecha</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Ingresos</th>
                        <th className="text-center text-xs text-muted-foreground font-medium px-4 py-3">Servicios</th>
                        <th className="text-center text-xs text-muted-foreground font-medium px-4 py-3">Clientes</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Notas</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Método</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Origen</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map(v => (
                        <tr key={v.id} className="border-b border-border/10 hover:bg-white/2 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Calendar className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(v.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-green-400">${Number(v.total_ingresos).toFixed(2)}</span>
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                {(Number(v.total_ingresos) * (v.tasa_cambio || currentTasa || 518.0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} Bs.
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              {v.total_servicios}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm">{v.total_clientes}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                            {v.notas ? v.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim() || '—' : '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {v.source === 'ia' ? (
                                <span className="flex items-center gap-1 text-[8px] font-black text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full border border-violet-500/20 uppercase tracking-tighter">
                                  <Bot className="w-2.5 h-2.5" /> IA
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20 uppercase tracking-tighter">
                                  <Receipt className="w-2.5 h-2.5" /> POS
                                </span>
                              )}
                              
                              {(v.isCashea || (v.notas && /cashea/i.test(v.notas))) && (
                                <span className="text-[8px] font-black text-white bg-[#3366FF] px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                                  CASHEA
                                </span>
                              )}
                              
                              {(v.isBinance || (v.notas && /binance|usdt/i.test(v.notas))) && (
                                <span className="text-[8px] font-black text-black bg-yellow-500 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                                  BINANCE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex flex-col">
                              {v.imagen_url ? (
                                <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full inline-flex w-fit">
                                  <Camera className="w-3 h-3" /> IA
                                </span>
                              ) : v.notas && v.notas.includes('[FACTURA_IA_START]') ? (
                                 <button 
                                  onClick={() => {
                                    const text = v.notas?.match(/\[FACTURA_IA_START\]\n([\s\S]*?)\n\[FACTURA_IA_END\]/)?.[1];
                                    if (text) setPreviewInvoice(text);
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full hover:bg-violet-500/20 transition-colors w-fit"
                                 >
                                   <Bot className="w-3 h-3" /> Factura IA
                                 </button>
                              ) : (
                                <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full inline-flex w-fit">
                                  <Eye className="w-3 h-3" /> Manual
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => {
                                  window.location.href = `/api/reportes/diario?fecha=${v.fecha}`;
                                  
                                  // Log Activity
                                  logActivity({
                                    usuario: useAppStore.getState().user?.nombre || 'Admin',
                                    modulo: 'Reportes',
                                    accion: 'Descargó reporte diario',
                                    detalles: `Fecha: ${v.fecha}`,
                                    referencia_id: v.id,
                                    referencia_tabla: 'ventas_dia'
                                  });
                                }}
                                className="w-7 h-7 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-500 flex items-center justify-center transition-colors"
                                title="Descargar Reporte Diario"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setSelectedVenta(v)}
                                className="w-7 h-7 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors"
                                title="Ver Factura Profesional"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditando(v); setShowManual(true); }}
                                className="w-7 h-7 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(v.id)}
                                disabled={deleting === v.id}
                                className="w-7 h-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                                title="Eliminar"
                              >
                                {deleting === v.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Cierres (Official Generated Reports) ─────────────── */}
      {tab === 'cierres' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Cargando cierres...</span>
            </div>
          ) : cierresOficiales.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Package className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin cierres de caja oficiales</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4 text-center max-w-xs">
                  Genera un reporte de cierre formal en PDF usando el botón "Cierre PDF".
                </p>
                <Button onClick={() => setShowCierreWizard(true)} className="gap-2 bg-orange-600">
                  <Plus className="w-4 h-4" /> Generar Cierre Ahora
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/40 shadow-xl overflow-hidden bg-card/30 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20 bg-muted/5">
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Fecha Reporte</th>
                        <th className="text-center text-xs text-muted-foreground font-medium px-4 py-3">Periodo</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Ingresos (USD)</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Ingresos (Bs)</th>
                        <th className="text-center text-xs text-muted-foreground font-medium px-4 py-3">Ventas</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Generado por</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cierresOficiales.map(c => (
                        <tr key={c.id} className="border-b border-border/10 hover:bg-white/2 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-3.5 h-3.5 text-orange-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[9px] text-muted-foreground">
                                  ID: {c.id.slice(0, 8)}...
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className={cn("text-[10px] uppercase font-black", 
                              c.periodo === 'dia' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            )}>
                              {c.periodo === 'dia' ? 'Diario' : 'Mensual'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-400">
                            ${Number(c.total_ingresos_usd).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                            {Number(c.total_bs).toLocaleString('es-VE')} Bs.
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-muted/50 text-xs text-foreground font-medium">
                              {c.total_ventas}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                            {c.generado_por || 'Sistema'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-orange-500/10 text-orange-500"
                                title="Descargar PDF Oficial"
                                onClick={() => {
                                  // Try to recover from hidden snapshot in 'notas'
                                  let recoveredData: any = null;
                                  if (c.notas && c.notas.includes('[SNAPSHOT_DATA]')) {
                                    try {
                                      const match = c.notas.match(/\[SNAPSHOT_DATA\]([\s\S]*?)\[\/SNAPSHOT_DATA\]/);
                                      if (match) {
                                        const parsed = JSON.parse(match[1]);
                                        recoveredData = {
                                          ventas: parsed.v.map((v: any) => ({ ...v, total_ingresos: v.t, total_servicios: v.ts, creado_por: v.cp, created_at: v.ca, tasa_cambio: v.tc, cliente: v.c, fecha: v.f, desglose: v.d, notas: v.n })),
                                          servicios: parsed.s.map((s: any) => ({ ...s, vehiculo_info: s.vi, cliente_nombre: s.cn, created_at: s.ca, descripcion: s.d, estado: s.e })),
                                          inventario: parsed.i.map((i: any) => ({ nombre: i.n, stock: i.s, precio_usd: i.pu, precio_bs: i.pb }))
                                        };
                                      }
                                    } catch (err) { console.error("Error recovering snapshot", err); }
                                  }

                                  const downloadVentas = recoveredData ? recoveredData.ventas : ventas.filter(v => {
                                    if (c.periodo === 'dia') return v.fecha === c.fecha;
                                    return v.fecha >= (c.fecha_inicio || '') && v.fecha <= (c.fecha_fin || '');
                                  });

                                  const downloadServicios = recoveredData ? recoveredData.servicios : serviciosHistory.filter(s => {
                                    const sDate = s.created_at?.split('T')[0];
                                    if (c.periodo === 'dia') return sDate === c.fecha;
                                    return sDate >= (c.fecha_inicio || '') && sDate <= (c.fecha_fin || '');
                                  });

                                  const downloadInventario = recoveredData ? recoveredData.inventario : inventarioHistory;

                                  const data: CierreData = {
                                    sede_nombre: c.sede_nombre || currentSede?.nombre || 'Lycos Team',
                                    periodo: c.periodo as any,
                                    fecha: c.fecha,
                                    fecha_inicio: c.fecha_inicio || undefined,
                                    fecha_fin: c.fecha_fin || undefined,
                                    total_ingresos_usd: c.total_ingresos_usd,
                                    total_bs: c.total_bs,
                                    tasa_bcv: c.tasa_bcv,
                                    total_clientes: c.total_clientes,
                                    total_ventas: c.total_ventas,
                                    desglose_pagos: c.desglose_pagos,
                                    ventas: downloadVentas.map((v: any) => ({
                                      fecha: v.fecha,
                                      cliente: v.cliente || 'Cons. Final',
                                      descripcion: (v.desglose || []).map((d: any) => d.descripcion).join(', ') || 'Servicio',
                                      total_usd: Number(v.total_ingresos),
                                      total_bs: Number(v.total_ingresos) * (c.tasa_bcv || 1),
                                      fuente: (v.creado_por || '').toLowerCase().includes('ia') ? 'ia' : 'pos'
                                    })) || [],
                                    inventario: downloadInventario.map((p: any) => ({
                                      nombre: p.nombre,
                                      stock: p.stock,
                                      precio_usd: p.precio_usd || 0,
                                      precio_bs: p.precio_bs || 0,
                                    })),
                                    notas: c.notas ? c.notas.replace(/\[SNAPSHOT_DATA\][\s\S]*?\[\/SNAPSHOT_DATA\]/, '').trim() : undefined,
                                    generado_por: c.generado_por,
                                    generado_en: new Date().toLocaleString('es-VE'),
                                    servicios_detalle: downloadServicios.map((s: any) => ({
                                      id: s.id,
                                      vehiculo: s.vehiculo_info || s.cliente_nombre || '---',
                                      descripcion: s.descripcion,
                                      estado: s.estado,
                                      created_at: s.created_at
                                    }))
                                  };
                                  generateCierrePDF(data);

                                  // Log Activity
                                  logActivity({
                                    usuario: useAppStore.getState().user?.nombre || 'Admin',
                                    modulo: 'Reportes',
                                    accion: 'Descargó cierre oficial',
                                    detalles: `Fecha: ${c.fecha}, Período: ${c.periodo}`,
                                    referencia_id: c.id,
                                    referencia_tabla: 'cierres_caja'
                                  });
                                }}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Egresos ────────────────────────────────────── */}
      {tab === 'egresos' && (
        <div className="space-y-3">
          {loading ? (
             <div className="flex items-center justify-center py-12">
               <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
               <span className="text-sm text-muted-foreground">Cargando egresos...</span>
             </div>
          ) : egresos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ArrowDownCircle className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin egresos registrados</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Registra un gasto o pago manualmente
                </p>
                <Button size="sm" onClick={() => setShowManualEgreso(true)} className="gap-2 bg-rose-600">
                  <Plus className="w-4 h-4" /> Nuevo Egreso
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20">
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Fecha</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Monto</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Categoría</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Pagado a</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Notas</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {egresos.map(e => (
                        <tr key={e.id} className="border-b border-border/10 hover:bg-rose-500/5 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                <ArrowDownCircle className="w-3.5 h-3.5 text-rose-400" />
                              </div>
                              <p className="text-sm font-medium">
                                {new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-rose-400">-${Number(e.total_egresos).toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                              {e.categoria}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{e.cliente || 'Otros'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                            {e.notas || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setSelectedEgreso(e)}
                                className="w-7 h-7 rounded-lg hover:bg-rose-500/10 text-rose-400 flex items-center justify-center"
                                title="Ver Comprobante"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditandoEgreso(e); setShowManualEgreso(true); }}
                                className="w-7 h-7 rounded-lg hover:bg-white/5 text-muted-foreground flex items-center justify-center"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async () => { if(confirm('¿Eliminar egreso?')) { await withSedeFilter(supabase?.from('egresos')).delete().eq('id', e.id); loadData(); } }}
                                className="w-7 h-7 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/30 bg-muted/10">
                        <td className="px-4 py-3 text-xs font-medium text-muted-foreground">Total período</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-rose-400">
                          -${(totalEgresos || 0).toFixed(2)}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setShowManualEgreso(true)} className="gap-2 bg-rose-600 hover:bg-rose-700">
              <Plus className="w-4 h-4" /> Registrar Egreso
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab: Historial y Calendario ──────────────────────── */}
      {tab === 'historial' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-border/30">
              <CardTitle className="text-base flex items-center justify-between w-full">
                <span>{MONTHS[currentMonth]} {currentYear}</span>
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportMonth('ventas')} className="gap-2 text-xs border-primary/20">
                  <Download className="w-3.5 h-3.5" /> Mes (Ventas)
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportMonth('citas')} className="gap-2 text-xs border-blue-500/30 text-blue-400">
                  <Download className="w-3.5 h-3.5" /> Mes (Citas)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" onClick={prevMonth} className="px-2">← Anterior</Button>
                <Button variant="ghost" size="sm" onClick={() => { const now = new Date(); setCurrentMonth(now.getMonth()); setCurrentYear(now.getFullYear()); setSelectedDate(now.toISOString().split('T')[0]); }} className="font-bold text-foreground">Hoy</Button>
                <Button variant="ghost" size="sm" onClick={nextMonth} className="px-2">Siguiente →</Button>
              </div>
              
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              
              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: getFirstDayOfMonth(currentYear, currentMonth) }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: getDaysInMonth(currentYear, currentMonth) }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const vCount = getVentasForDate(dateStr).length;
                  const isToday = dateStr === new Date().toISOString().split('T')[0];
                  const isSelected = dateStr === selectedDate;
                  
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(dateStr)}
                      className={cn(
                        'min-h-[60px] flex flex-col items-center justify-start p-1.5 rounded-xl border transition-all text-sm group hover:border-primary/50',
                        isSelected ? 'bg-primary/20 border-primary text-foreground' :
                        isToday ? 'bg-muted/50 border-border font-bold' :
                        'bg-card/50 border-border/20 text-muted-foreground hover:bg-white/5 hover:text-foreground'
                      )}
                    >
                      <span className={cn("text-xs mb-1", isSelected && "text-primary font-bold")}>{day}</span>
                      {vCount > 0 && (
                        <div className="flex gap-0.5 mt-auto bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          {vCount} cierre{vCount > 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Resumen del Día
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Selecciona un día'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-3">
              {!selectedDate ? (
                <div className="text-center py-10 text-muted-foreground text-xs">Ningún día seleccionado</div>
              ) : (
                <>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acciones Rápidas</p>
                    <Button onClick={() => exportDay('ventas')} className="w-full justify-start gap-2 text-xs" variant="secondary">
                      <Download className="w-3.5 h-3.5" /> Descargar Día (Ventas)
                    </Button>
                    <Button onClick={() => exportDay('citas')} className="w-full justify-start gap-2 text-xs text-blue-400" variant="outline">
                      <Download className="w-3.5 h-3.5" /> Descargar Día (Citas)
                    </Button>
                  </div>

                  {getVentasForDate(selectedDate).length === 0 ? (
                     <div className="text-center py-6 text-muted-foreground text-xs bg-card border border-border/30 rounded-xl">Sin reportes registrados ese día.</div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {getVentasForDate(selectedDate).map(v => (
                          <div key={v.id} className="p-3 bg-card border border-border/50 rounded-xl space-y-1.5">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-xs font-bold text-foreground">{v.cliente || 'Cons. Final'}</p>
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {new Date(v.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <span className="text-xs font-bold text-green-400">${Number(v.total_ingresos).toFixed(2)}</span>
                            </div>
                           <div className="flex gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{v.total_servicios} serv.</span>
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-medium">{v.total_clientes} clientes</span>
                           </div>
                           {v.notas && (
                             <p className="text-[10px] text-muted-foreground line-clamp-2 italic pt-1 border-t border-border/30">
                               &quot;{v.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim()}&quot;
                             </p>
                           )}
                         </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Papelera de Ventas ──────────────────────── */}
      {tab === 'papelera' && isAdmin && (
        <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden shadow-xl">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-red-500">
              <Trash2 className="w-5 h-5 text-red-500 animate-float" />
              Papelera de Ventas
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Ventas eliminadas en la sede actual. Las ventas pueden ser restauradas a su estado original o ser eliminadas de forma permanente.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <Loader2 className="w-8 h-8 text-primary animate-spin opacity-40" />
                <span className="text-muted-foreground animate-pulse text-xs">Cargando papelera...</span>
              </div>
            ) : papeleraVentas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                <Trash2 className="w-12 h-12" />
                <span className="text-xs font-medium">La papelera está vacía.</span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    <tr>
                      <th className="px-4 py-3 text-left">Eliminado</th>
                      <th className="px-4 py-3 text-center">Por</th>
                      <th className="px-4 py-3 text-left">Original</th>
                      <th className="px-4 py-3 text-left">Cliente / Notas</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 text-xs">
                    {papeleraVentas.map((item) => {
                      let original = null;
                      let source = 'pos';
                      let deletedAt = item.created_at;
                      try {
                        const parsed = JSON.parse(item.detalles);
                        original = parsed.originalRecord;
                        source = parsed.source || 'pos';
                        if (parsed.deletedAt) deletedAt = parsed.deletedAt;
                      } catch (e) {
                        console.error('Error parsing details of log:', item.id, e);
                      }

                      if (!original) return null;

                      return (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors text-xs text-foreground/80 border-b border-border/20">
                          <td className="px-4 py-4 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                            {new Date(deletedAt).toLocaleString('es-VE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold uppercase text-[9px] border border-red-500/10">
                              {item.usuario}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold">{original.fecha}</span>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded w-fit font-bold uppercase",
                                source === 'ia' ? "bg-primary/20 text-primary border border-primary/20" : "bg-green-500/20 text-green-400 border border-green-500/20"
                              )}>
                                {source === 'ia' ? 'IA / Bot' : 'Manual / POS'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 max-w-[280px]">
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground text-sm">
                                {original.cliente || 'Consumidor Final'}
                              </span>
                              <span className="text-muted-foreground text-[10px] truncate max-w-[240px] italic">
                                {original.notas || 'Sin observaciones'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-green-400 text-sm font-mono">
                            ${Number(original.total_ingresos).toFixed(2)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={actioningId === item.id}
                                onClick={() => handleRestoreVenta(item)}
                                className="h-8 text-xs text-green-500 hover:text-green-400 hover:bg-green-500/10 border border-green-500/20 flex items-center gap-1 px-2.5 rounded-lg"
                              >
                                {actioningId === item.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                                Restaurar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={actioningId === item.id}
                                onClick={() => handlePurgeVenta(item.id)}
                                className="h-8 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 flex items-center gap-1 px-2.5 rounded-lg"
                              >
                                <X className="w-3.5 h-3.5" />
                                Borrar Permanente
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* ── Tab: Distribuciones ─────────────────────────────────── */}
      {tab === 'distribuciones' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-400" /> Distribuciones de Inventario
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Historial de distribuciones desde Carrizal hacia otras sedes
              </p>
            </div>
          </div>

          {/* Stats */}
          {distribuciones.length > 0 && (() => {
            const totalUnids = distribuciones.reduce((s, d) => s + (d.total_unidades || 0), 0);
            const totalValor = distribuciones.reduce((s, d) => s + (d.valor_total_usd || 0), 0);
            const sedesUnicas = new Set(distribuciones.map(d => d.sede_destino_nombre)).size;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Distribuciones', value: distribuciones.length, color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: Truck },
                  { label: 'Unidades Enviadas', value: totalUnids, color: 'text-orange-400', bg: 'bg-orange-500/10', icon: Boxes },
                  { label: 'Valor Total USD', value: `$${totalValor.toFixed(2)}`, color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
                  { label: 'Sedes Abastecidas', value: sedesUnicas, color: 'text-purple-400', bg: 'bg-purple-500/10', icon: MapPin },
                ].map(s => (
                  <Card key={s.label} className={cn('border', s.bg.replace('/10', '/20'))}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', s.bg)}>
                          <s.icon className={cn('w-4 h-4', s.color)} />
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase font-bold">{s.label}</p>
                          <p className={cn('text-xl font-black', s.color)}>{s.value}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}

          {/* Table */}
          <Card className="border-border/40 shadow-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardContent className="p-0">
              {loadingDistribuciones ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  <span className="text-sm text-muted-foreground">Cargando distribuciones...</span>
                </div>
              ) : distribuciones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-40">
                  <Truck className="w-12 h-12" />
                  <p className="text-sm font-medium">Sin distribuciones registradas</p>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Las distribuciones se crean desde el módulo <strong>Distribuidor</strong> (solo accesible en Carrizal)
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20 bg-muted/10">
                        <th className="text-left text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">N° Nota</th>
                        <th className="text-left text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Fecha</th>
                        <th className="text-left text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Destino</th>
                        <th className="text-center text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Productos</th>
                        <th className="text-center text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Unidades</th>
                        <th className="text-right text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Valor USD</th>
                        <th className="text-center text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Estado</th>
                        <th className="text-center text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Responsable</th>
                        <th className="text-right text-[10px] text-muted-foreground font-bold uppercase px-4 py-3 tracking-wider">Nota PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distribuciones.map(dist => {
                        const estadoColors: Record<string, string> = {
                          completado: 'text-green-400 bg-green-500/10',
                          en_transito: 'text-amber-400 bg-amber-500/10',
                          pendiente: 'text-slate-400 bg-slate-500/10',
                          anulado: 'text-red-400 bg-red-500/10',
                        };
                        const estadoLabels: Record<string, string> = {
                          completado: 'Completado', en_transito: 'En tránsito',
                          pendiente: 'Pendiente', anulado: 'Anulado',
                        };
                        return (
                          <tr key={dist.id} className="border-b border-border/10 hover:bg-white/2 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono font-black text-sm text-indigo-300">{dist.numero_nota}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="text-sm font-medium">
                                  {new Date(dist.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[9px] text-muted-foreground">
                                  {new Date(dist.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="font-bold">{dist.sede_destino_nombre}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-black text-indigo-300">{dist.total_items}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-black text-orange-400">{dist.total_unidades}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-black text-green-400">${(dist.valor_total_usd || 0).toFixed(2)}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-black uppercase', estadoColors[dist.estado] || estadoColors.completado)}>
                                {estadoLabels[dist.estado] || dist.estado}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                              {dist.responsable}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => generateNotaEntregaPDF(dist, currentTasa)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all text-xs font-bold"
                                title="Descargar Nota de Entrega"
                              >
                                <Download className="w-3 h-3" /> PDF
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals con Portals */}
      {mounted && showManual && createPortal(
        <ManualModal
          inventario={inventarioHistory}
          onClose={() => { setShowManual(false); setEditando(null); }}
          onSave={handleSaveVenta}
          initial={editando}
        />,
        document.body
      )}

      {mounted && showManualEgreso && createPortal(
        <EgresoModal
          onClose={() => { setShowManualEgreso(false); setEditandoEgreso(null); }}
          onSave={handleSaveEgreso}
          initial={editandoEgreso}
        />,
        document.body
      )}

      {showCierreWizard && (
        <CierreWizard
          ventas={ventas}
          onClose={() => setShowCierreWizard(false)}
          onSaved={() => { setShowCierreWizard(false); setTimeout(loadData, 800); }}
        />
      )}

      {mounted && scanMode && createPortal(
        <ScanModal
          modo={scanMode}
          onClose={() => setScanMode(null)}
          onConfirm={handleScanConfirm}
        />,
        document.body
      )}

      {mounted && selectedVenta && createPortal(
        <InvoiceModal
          venta={selectedVenta}
          ventas={ventas}
          onClose={() => setSelectedVenta(null)}
        />,
        document.body
      )}

      {mounted && selectedEgreso && createPortal(
        <EgresoPreviewModal
          egreso={selectedEgreso}
          onClose={() => setSelectedEgreso(null)}
        />,
        document.body
      )}

      {mounted && previewInvoice && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" /> Texto Extraído por IA
              </h3>
              <button onClick={() => setPreviewInvoice(null)} className="p-2 hover:bg-white/5 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap bg-black/20 m-4 rounded-xl border border-border/20">
              {previewInvoice}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
