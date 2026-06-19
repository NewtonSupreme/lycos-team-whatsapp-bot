'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Receipt, Search, Filter, X, FileText, ShoppingCart, Wrench, Truck,
  Calendar, DollarSign, CheckCircle, AlertCircle, XCircle, Loader2,
  ChevronDown, ChevronUp, Hash, TrendingUp, Package, Printer,
  ArrowUpDown, RefreshCw, Ban, Eye, Clock, MapPin, BarChart3,
  ArrowRight, CreditCard, Banknote
} from 'lucide-react';
import { supabase, fetchFacturas, anularFactura, type FiltrosFactura } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ── Types ──────────────────────────────────────────────────────────
interface Factura {
  id: string;
  correlativo: string;
  tipo: string;
  modulo_origen: string;
  referencia_id?: string;
  referencia_tabla?: string;
  cliente: string;
  vehiculo?: string;
  total: number;
  moneda: string;
  tasa_cambio?: number;
  total_bs?: number;
  items: any[];
  metodos_pago?: any;
  con_iva: boolean;
  estado: string;
  notas?: string;
  sede_id?: string;
  emitido_por: string;
  fecha_emision: string;
  created_at: string;
}

// ── Config maps ────────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  venta: { label: 'Venta', icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  servicio: { label: 'Servicio', icon: Wrench, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  nota_entrega: { label: 'Nota de Entrega', icon: Truck, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  presupuesto: { label: 'Presupuesto', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  egreso: { label: 'Egreso', icon: CreditCard, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  cierre: { label: 'Cierre', icon: BarChart3, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
};

const MODULO_CONFIG: Record<string, { label: string; color: string }> = {
  ventas_pos: { label: 'Ventas POS', color: 'text-emerald-400' },
  silenciadores: { label: 'Silenciadores', color: 'text-orange-400' },
  servicios: { label: 'Servicios', color: 'text-blue-400' },
  reportes: { label: 'Reportes', color: 'text-violet-400' },
  presupuestos: { label: 'Presupuestos', color: 'text-amber-400' },
  distribuidor: { label: 'Distribuidor', color: 'text-cyan-400' },
};

const ESTADO_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  pagado: { label: 'Pagado', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  pendiente: { label: 'Pendiente', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  anulado: { label: 'Anulado', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

const MONEDA_SYM: Record<string, string> = { USD: '$', VES: 'Bs.', EUR: '€' };

export default function FacturasPage() {
  const { can } = useRolePermissions();
  const { currentSede } = useSedeStore();

  // ── State ──
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);

  // ── Filters ──
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState<Date | undefined>(undefined);
  const [filtroFechaHasta, setFiltroFechaHasta] = useState<Date | undefined>(undefined);
  const [filtroMontoMin, setFiltroMontoMin] = useState('');
  const [filtroMontoMax, setFiltroMontoMax] = useState('');

  // ── Stats ──
  const [stats, setStats] = useState({ total: 0, totalUsd: 0, pendientes: 0, pagadas: 0 });

  // ── Debounce search ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── Active filters count ──
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroTipo) count++;
    if (filtroModulo) count++;
    if (filtroEstado) count++;
    if (filtroFechaDesde) count++;
    if (filtroFechaHasta) count++;
    if (filtroMontoMin) count++;
    if (filtroMontoMax) count++;
    return count;
  }, [filtroTipo, filtroModulo, filtroEstado, filtroFechaDesde, filtroFechaHasta, filtroMontoMin, filtroMontoMax]);

  // ── Load data ──
  const loadData = useCallback(async (isRefresh = false) => {
    if (!supabase) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const filtros: FiltrosFactura = {
        busqueda: debouncedSearch || undefined,
        tipo: filtroTipo || undefined,
        modulo_origen: filtroModulo || undefined,
        estado: filtroEstado || undefined,
        fecha_desde: filtroFechaDesde ? format(filtroFechaDesde, 'yyyy-MM-dd') : undefined,
        fecha_hasta: filtroFechaHasta ? format(filtroFechaHasta, 'yyyy-MM-dd') : undefined,
        monto_min: filtroMontoMin ? parseFloat(filtroMontoMin) : undefined,
        monto_max: filtroMontoMax ? parseFloat(filtroMontoMax) : undefined,
        sede_id: currentSede?.id || undefined,
        limit: 100,
      };

      const result = await fetchFacturas(filtros);
      
      if ((result as any).missingTable) {
        setIsTableMissing(true);
        setFacturas([]);
        setStats({ total: 0, totalUsd: 0, pendientes: 0, pagadas: 0 });
        return;
      }
      
      setIsTableMissing(false);
      
      const cleanedData = (result.data as Factura[]).map(f => ({
        ...f,
        cliente: f.cliente ? f.cliente.replace(/\(WhatsApp\)/gi, '').replace(/ADMIN IA/gi, '').trim() || 'No definido' : 'Consumidor Final'
      }));

      setFacturas(cleanedData);
      setTotalCount(result.count);

      // Calculate stats from all results
      setStats({
        total: result.count,
        totalUsd: cleanedData.reduce((s, f) => s + (f.moneda === 'USD' ? Number(f.total) : 0), 0),
        pendientes: cleanedData.filter(f => f.estado === 'pendiente').length,
        pagadas: cleanedData.filter(f => f.estado === 'pagado').length,
      });
    } catch (err: any) {
      console.error('Error loading facturas Details:', err?.message || err, err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, filtroTipo, filtroModulo, filtroEstado, filtroFechaDesde, filtroFechaHasta, filtroMontoMin, filtroMontoMax, currentSede]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('facturas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, () => loadData(true))
      .subscribe();
    return () => { supabase?.removeChannel(channel); };
  }, [loadData]);

  // ── Clear all filters ──
  const clearFilters = () => {
    setFiltroTipo('');
    setFiltroModulo('');
    setFiltroEstado('');
    setFiltroFechaDesde(undefined);
    setFiltroFechaHasta(undefined);
    setFiltroMontoMin('');
    setFiltroMontoMax('');
    setSearchTerm('');
  };

  // ── Handle anular ──
  const handleAnular = async (factura: Factura) => {
    if (!can('ventas', 'eliminar')) return alert('No tienes permisos para anular facturas.');
    if (!confirm(`¿Seguro que deseas ANULAR la factura ${factura.correlativo}? Esta acción no se puede deshacer.`)) return;
    setAnulando(factura.id);
    try {
      await anularFactura(factura.id);
      loadData(true);
      if (selectedFactura?.id === factura.id) {
        setSelectedFactura(prev => prev ? { ...prev, estado: 'anulado' } : null);
      }
    } catch (err) {
      console.error('Error anulando:', err);
      alert('Error al anular la factura');
    } finally {
      setAnulando(null);
    }
  };

  // ── Handle reimprimir ──
  const handleReimprimir = (factura: Factura) => {
    const sym = MONEDA_SYM[factura.moneda] || '$';
    generateInvoicePDF([{
      id: factura.referencia_id || factura.id,
      correlativo: factura.correlativo,
      fecha: new Date(factura.fecha_emision + 'T12:00:00').toLocaleDateString('es-VE'),
      cliente: factura.cliente,
      vehiculo: factura.vehiculo,
      items: (factura.items || []).map((item: any) => ({
        descripcion: item.descripcion || item.nombre || '',
        cantidad: item.cantidad || 1,
        precio_unitario: item.precio_unitario || item.total || 0,
        total: item.total || 0,
      })),
      total: factura.total,
      tasa_bcv: factura.tasa_cambio,
      iva_aplicado: factura.con_iva,
      notas: factura.notas,
      metodos_pago: factura.metodos_pago,
      estado: factura.estado as any,
    }], { mode: 'dual', currencyMode: 'dual' });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {isTableMissing && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 mb-6">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div>
            <h2 className="text-xl font-bold">¡Atención! La tabla de facturas no existe en tu base de datos</h2>
            <p className="mt-2 opacity-90 max-w-lg mx-auto">
              Para usar este módulo debes ir a tu panel de Supabase y ejecutar el script de migración que se encuentra en <code>lib/migrations/003_facturas.sql</code> en el SQL Editor.
            </p>
          </div>
          <Button variant="outline" className="border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={() => loadData()}>
            Ya lo ejecuté, reintentar
          </Button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow italic">Centro de Facturación</span>
            <Receipt className="w-8 h-8 text-primary animate-float" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro centralizado de todas las facturas del sistema.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-card/40 backdrop-blur-xl p-2 rounded-2xl border border-border/50">
            <div className="flex flex-col items-end pr-3 border-r border-border/30">
              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Sede</span>
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3 text-primary" />
                {currentSede?.nombre || 'General'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="h-8 w-8 p-0 rounded-xl"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm('¿Sincronizar nombres de clientes desde servicios a facturas?')) return;
                setRefreshing(true);
                try {
                  const res = await fetch('/api/facturas/sync-clientes');
                  const data = await res.json();
                  alert(`Sincronización: ${data.updated} actualizadas, ${data.skipped} sin cambios, ${data.errors} errores.`);
                  loadData(true);
                } catch (e) {
                  alert('Error al sincronizar');
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing}
              className="h-8 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest gap-1"
              title="Sincronizar clientes desde servicios"
            >
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
              Sync
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Facturas', value: stats.total.toString(), icon: Receipt, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
          { label: 'Total USD', value: `$${stats.totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Pagadas', value: stats.pagadas.toString(), icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
          { label: 'Pendientes', value: stats.pendientes.toString(), icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
        ].map((kpi, i) => (
          <div key={i} className={cn("relative overflow-hidden rounded-2xl border p-4 transition-all hover:scale-[1.02]", kpi.bg)}>
            <div className="absolute -top-2 -right-2 opacity-[0.06]">
              <kpi.icon className="w-20 h-20" />
            </div>
            <p className={cn("text-[10px] font-black uppercase tracking-widest", kpi.color)}>{kpi.label}</p>
            <p className="text-2xl font-black mt-1 tracking-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Search + Filters ─────────────────────────────────── */}
      <Card className="glass-panel border-border/50 bg-card/40">
        <CardContent className="p-4 space-y-4">
          {/* Main search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="facturas-search-input"
                placeholder="Buscar por correlativo, cliente, notas..."
                className="pl-12 h-12 bg-background/50 text-base rounded-2xl border-border/50 focus:border-primary/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button
              id="facturas-toggle-filters"
              variant={showFilters ? 'default' : 'outline'}
              className={cn(
                "h-12 rounded-2xl px-5 gap-2 font-black text-xs uppercase tracking-widest transition-all",
                showFilters ? "bg-primary text-white shadow-lg shadow-primary/30" : "border-border/50"
              )}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="ml-1 bg-white/20 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </div>

          {/* Active filter chips */}
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Filtros activos:</span>
              {filtroTipo && (
                <Badge variant="secondary" className="gap-1 rounded-full text-[10px] font-bold pl-2.5 pr-1.5 h-6">
                  {TIPO_CONFIG[filtroTipo]?.label || filtroTipo}
                  <button onClick={() => setFiltroTipo('')} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              )}
              {filtroModulo && (
                <Badge variant="secondary" className="gap-1 rounded-full text-[10px] font-bold pl-2.5 pr-1.5 h-6">
                  {MODULO_CONFIG[filtroModulo]?.label || filtroModulo}
                  <button onClick={() => setFiltroModulo('')} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              )}
              {filtroEstado && (
                <Badge variant="secondary" className="gap-1 rounded-full text-[10px] font-bold pl-2.5 pr-1.5 h-6">
                  {ESTADO_CONFIG[filtroEstado]?.label || filtroEstado}
                  <button onClick={() => setFiltroEstado('')} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              )}
              {filtroFechaDesde && (
                <Badge variant="secondary" className="gap-1 rounded-full text-[10px] font-bold pl-2.5 pr-1.5 h-6">
                  Desde: {format(filtroFechaDesde, 'dd/MM/yy')}
                  <button onClick={() => setFiltroFechaDesde(undefined)} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              )}
              {filtroFechaHasta && (
                <Badge variant="secondary" className="gap-1 rounded-full text-[10px] font-bold pl-2.5 pr-1.5 h-6">
                  Hasta: {format(filtroFechaHasta, 'dd/MM/yy')}
                  <button onClick={() => setFiltroFechaHasta(undefined)} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              )}
              {(filtroMontoMin || filtroMontoMax) && (
                <Badge variant="secondary" className="gap-1 rounded-full text-[10px] font-bold pl-2.5 pr-1.5 h-6">
                  ${filtroMontoMin || '0'} - ${filtroMontoMax || '∞'}
                  <button onClick={() => { setFiltroMontoMin(''); setFiltroMontoMax(''); }} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"><X className="w-2.5 h-2.5" /></button>
                </Badge>
              )}
              <button onClick={clearFilters} className="text-[10px] font-bold text-destructive hover:underline ml-2">
                Limpiar todo
              </button>
            </div>
          )}

          {/* Expanded filters */}
          <div className={cn("overflow-hidden transition-all duration-300", showFilters ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border/30">
              {/* Tipo */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo</Label>
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="h-10 rounded-xl bg-background/50 text-xs">
                    <SelectValue placeholder="Todos los tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Módulo */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Módulo</Label>
                <Select value={filtroModulo} onValueChange={setFiltroModulo}>
                  <SelectTrigger className="h-10 rounded-xl bg-background/50 text-xs">
                    <SelectValue placeholder="Todos los módulos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(MODULO_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Estado */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</Label>
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                  <SelectTrigger className="h-10 rounded-xl bg-background/50 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Monto rango */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rango de Monto</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filtroMontoMin}
                    onChange={e => setFiltroMontoMin(e.target.value)}
                    className="h-10 rounded-xl bg-background/50 text-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filtroMontoMax}
                    onChange={e => setFiltroMontoMax(e.target.value)}
                    className="h-10 rounded-xl bg-background/50 text-xs"
                  />
                </div>
              </div>

              {/* Fecha desde */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desde</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-10 rounded-xl bg-background/50 text-xs justify-start gap-2 font-normal">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {filtroFechaDesde ? format(filtroFechaDesde, 'dd/MM/yyyy') : 'Seleccionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
                    <CalendarUI mode="single" selected={filtroFechaDesde} onSelect={setFiltroFechaDesde} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Fecha hasta */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hasta</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-10 rounded-xl bg-background/50 text-xs justify-start gap-2 font-normal">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {filtroFechaHasta ? format(filtroFechaHasta, 'dd/MM/yyyy') : 'Seleccionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
                    <CalendarUI mode="single" selected={filtroFechaHasta} onSelect={setFiltroFechaHasta} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main list */}
        <div className={cn("space-y-3", selectedFactura ? "lg:col-span-7" : "lg:col-span-12")}>
          {/* Results header */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground font-bold">
              {loading ? 'Cargando...' : `${totalCount} factura${totalCount !== 1 ? 's' : ''} encontrada${totalCount !== 1 ? 's' : ''}`}
            </p>
          </div>

          {loading ? (
            <Card className="glass-panel border-border/50 bg-card/40">
              <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground animate-pulse">Buscando facturas...</p>
              </CardContent>
            </Card>
          ) : facturas.length === 0 ? (
            <Card className="glass-panel border-border/50 bg-card/40">
              <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
                <Receipt className="w-16 h-16 text-muted-foreground/20" />
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No se encontraron facturas</p>
                <p className="text-xs text-muted-foreground">Intenta con otros términos de búsqueda o ajusta los filtros.</p>
                {activeFiltersCount > 0 && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 gap-2 rounded-xl text-xs">
                    <X className="w-3 h-3" /> Limpiar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {facturas.map((factura) => {
                const tipoConf = TIPO_CONFIG[factura.tipo] || TIPO_CONFIG.venta;
                const estadoConf = ESTADO_CONFIG[factura.estado] || ESTADO_CONFIG.pagado;
                const moduloConf = MODULO_CONFIG[factura.modulo_origen] || MODULO_CONFIG.ventas_pos;
                const TipoIcon = tipoConf.icon;
                const EstadoIcon = estadoConf.icon;
                const sym = MONEDA_SYM[factura.moneda] || '$';
                const isSelected = selectedFactura?.id === factura.id;

                return (
                  <button
                    key={factura.id}
                    id={`factura-row-${factura.correlativo}`}
                    onClick={() => setSelectedFactura(isSelected ? null : factura)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all duration-200 group",
                      isSelected
                        ? "bg-primary/5 border-primary/30 shadow-lg shadow-primary/5"
                        : "bg-card/40 border-border/30 hover:bg-card/80 hover:border-border/60 hover:shadow-md"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Tipo icon */}
                      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all", tipoConf.bg, isSelected && "scale-110")}>
                        <TipoIcon className={cn("w-5 h-5", tipoConf.color)} />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-black text-primary tracking-wider">{factura.correlativo}</span>
                          <Badge variant="outline" className={cn("text-[8px] font-black px-1.5 h-4 border rounded-full", estadoConf.bg, estadoConf.color)}>
                            {estadoConf.label.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm font-bold truncate">{factura.cliente}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-bold">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(factura.fecha_emision + 'T12:00:00').toLocaleDateString('es-VE')}
                          </span>
                          <span className={cn("flex items-center gap-1", moduloConf.color)}>
                            {moduloConf.label}
                          </span>
                          <span className="uppercase">{tipoConf.label}</span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-black tracking-tight italic">
                          {sym}{Number(factura.total).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </p>
                        {factura.total_bs && (
                          <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                            {Number(factura.total_bs).toLocaleString('es-VE', { minimumFractionDigits: 0 })} Bs
                          </p>
                        )}
                      </div>

                      {/* Arrow */}
                      <ArrowRight className={cn(
                        "w-4 h-4 text-muted-foreground transition-all flex-shrink-0",
                        isSelected ? "rotate-90 text-primary" : "group-hover:translate-x-0.5"
                      )} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Detail Panel ─────────────────────────────────── */}
        {selectedFactura && (
          <div className="lg:col-span-5 relative">
            <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl sticky top-24 overflow-hidden">
              {/* Detail Header */}
              <CardHeader className="bg-primary/5 border-b border-border/30 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Detalle de Factura</p>
                    <p className="text-xl font-black tracking-wider">{selectedFactura.correlativo}</p>
                  </div>
                  <button
                    onClick={() => setSelectedFactura(null)}
                    className="p-2 rounded-xl hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {(() => {
                    const tc = TIPO_CONFIG[selectedFactura.tipo];
                    const ec = ESTADO_CONFIG[selectedFactura.estado];
                    return (
                      <>
                        <Badge className={cn("text-[9px] font-black rounded-full border", tc?.bg, tc?.color)}>
                          {tc?.label || selectedFactura.tipo}
                        </Badge>
                        <Badge className={cn("text-[9px] font-black rounded-full border", ec?.bg, ec?.color)}>
                          {ec?.label || selectedFactura.estado}
                        </Badge>
                      </>
                    );
                  })()}
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {/* Client & Vehicle */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cliente</p>
                      <p className="text-sm font-bold">{selectedFactura.cliente}</p>
                    </div>
                    {selectedFactura.vehiculo && (
                      <div className="text-right">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Vehículo</p>
                        <p className="text-sm font-bold">{selectedFactura.vehiculo}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-background/40 rounded-xl border border-border/30">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Fecha Emisión</p>
                      <p className="text-xs font-bold mt-0.5">{new Date(selectedFactura.fecha_emision + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div className="p-3 bg-background/40 rounded-xl border border-border/30">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Módulo Origen</p>
                      <p className={cn("text-xs font-bold mt-0.5", MODULO_CONFIG[selectedFactura.modulo_origen]?.color)}>
                        {MODULO_CONFIG[selectedFactura.modulo_origen]?.label || selectedFactura.modulo_origen}
                      </p>
                    </div>
                    <div className="p-3 bg-background/40 rounded-xl border border-border/30">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Emitido Por</p>
                      <p className="text-xs font-bold mt-0.5">{selectedFactura.emitido_por}</p>
                    </div>
                    <div className="p-3 bg-background/40 rounded-xl border border-border/30">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">IVA</p>
                      <p className="text-xs font-bold mt-0.5">{selectedFactura.con_iva ? 'Sí (16%)' : 'No'}</p>
                    </div>
                  </div>
                </div>

                {/* Items */}
                {selectedFactura.items && selectedFactura.items.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Items / Servicios</p>
                    <div className="space-y-1.5">
                      {selectedFactura.items.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2.5 bg-background/30 rounded-xl border border-border/20">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">{item.descripcion || item.nombre || `Item ${i + 1}`}</p>
                            <p className="text-[10px] text-muted-foreground">x{item.cantidad || 1}</p>
                          </div>
                          <p className="text-xs font-black">
                            {MONEDA_SYM[selectedFactura.moneda] || '$'}{Number(item.total || 0).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="p-4 bg-slate-900 rounded-2xl">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total {selectedFactura.moneda}</p>
                    <p className="text-xl font-black text-primary italic tracking-tight">
                      {MONEDA_SYM[selectedFactura.moneda] || '$'}{Number(selectedFactura.total).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  {selectedFactura.total_bs && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <p className="text-[10px] font-bold text-slate-500">En Bolívares</p>
                      <p className="text-sm font-bold text-slate-300">
                        {Number(selectedFactura.total_bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                      </p>
                    </div>
                  )}
                  {selectedFactura.tasa_cambio && (
                    <p className="text-[9px] text-slate-500 mt-1">
                      Tasa: {Number(selectedFactura.tasa_cambio).toFixed(2)} Bs/$
                    </p>
                  )}
                </div>

                {/* Payment methods */}
                {selectedFactura.metodos_pago && Object.entries(selectedFactura.metodos_pago).some(([, v]) => Number(v) > 0) && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Métodos de Pago</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(selectedFactura.metodos_pago)
                        .filter(([, v]) => Number(v) > 0)
                        .map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between p-2 bg-background/30 rounded-lg border border-border/20">
                            <span className="text-[10px] font-bold text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] font-black">${Number(val).toFixed(2)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedFactura.notas && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Notas</p>
                    <p className="text-xs text-muted-foreground bg-background/30 rounded-xl p-3 border border-border/20">
                      {selectedFactura.notas}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-border/30">
                  <Button
                    id="factura-reimprimir-btn"
                    variant="outline"
                    className="flex-1 h-11 rounded-xl gap-2 font-black text-xs uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => handleReimprimir(selectedFactura)}
                  >
                    <Printer className="w-4 h-4" /> Reimprimir
                  </Button>
                  {can('ventas', 'eliminar') && selectedFactura.estado !== 'anulado' && (
                    <Button
                      id="factura-anular-btn"
                      variant="outline"
                      className="h-11 rounded-xl gap-2 font-black text-xs uppercase tracking-widest border-destructive/30 text-destructive hover:bg-destructive/5"
                      onClick={() => handleAnular(selectedFactura)}
                      disabled={anulando === selectedFactura.id}
                    >
                      {anulando === selectedFactura.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Ban className="w-4 h-4" />
                      )}
                      Anular
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
