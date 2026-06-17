'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Car, Wrench, MessageSquare, Bot,
  Calendar, CheckCircle, ArrowRight, Zap, RefreshCw,
  Coins, TrendingUp, DollarSign, MapPin, ShieldCheck,
  X, Play, Maximize2, Minimize2, Banknote
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import StatCard from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import { formatCurrency, formatRelativeTime, tipoServicioLabel } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { withSedeFilter } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';

// ── Types ────────────────────────────────────────────────────
interface DashboardStats {
  totalClientes: number | null;
  totalVehiculos: number | null;
  serviciosActivos: number | null;
  mensajesHoy: number | null;
  conversacionesHoy: number | null;
  conversacionesMes: number | null;
  citasHoy: number | null;
  serviciosCompletados: number | null;
  mensajesIA: number | null;
}

interface RecentServicio {
  id: string;
  descripcion: string | null;
  tipo: string | null;
  estado: string | null;
  costo_estimado: number | null;
  created_at: string;
  nombre_cliente?: string | null;
  placa?: string | null;
  vehiculo_info?: string | null;
  vehiculos?: { marca: string; modelo: string; placa: string; clientes?: { nombre: string; apellido: string } | null } | null;
}

interface RecentConv {
  id: string;
  telefono: string;
  ultimo_mensaje: string | null;
  ultimo_mensaje_at: string | null;
  mensajes_sin_leer: number | null;
  estado: string | null;
  datos_cliente?: { nombre?: string } | null;
}

interface WaChartPoint {
  hora: string;
  mensajes: number;
}

interface RecentVenta {
  id: string;
  cliente: string;
  total_ingresos: number;
  created_at: string;
  estado: string;
}

interface SilenciadoresChartPoint {
  fecha: string;
  vendidos: number;
}

interface ServiciosChartPoint {
  fecha: string;
  trabajos: number;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: unknown[]; label?: string }) => {
  if (active && payload && (payload as { value: number }[]).length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-xl text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {(payload as { name: string; color: string; value: number }[]).map((p) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

function getVzlaDateString() {
  const now = new Date();
  const vzla = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
  return vzla.toISOString().split('T')[0];
}

function getVzlaFirstDayString() {
  const now = new Date();
  const vzla = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
  vzla.setDate(1);
  return vzla.toISOString().split('T')[0];
}

export default function DashboardPage() {
  const { currentSede, userRole, sedeRefreshKey } = useSedeStore();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalClientes: null, totalVehiculos: null, serviciosActivos: null,
    mensajesHoy: null, conversacionesHoy: null, conversacionesMes: null, 
    citasHoy: null, serviciosCompletados: null, mensajesIA: null,
  });
  const [recentServicios, setRecentServicios] = useState<RecentServicio[]>([]);
  const [recentConvs, setRecentConvs] = useState<RecentConv[]>([]);
  const [recentVentas, setRecentVentas] = useState<RecentVenta[]>([]);
  const [waChart, setWaChart] = useState<WaChartPoint[]>([]);
  const [silenciadoresChart, setSilenciadoresChart] = useState<SilenciadoresChartPoint[]>([]);
  const [serviciosChart, setServiciosChart] = useState<ServiciosChartPoint[]>([]);
  const [rates, setRates] = useState<{ bcv: number; binance: number; fetchedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRates = useCallback(async () => {
    try {
      const resp = await fetch(`/api/rates?t=${Date.now()}`);
      const data = await resp.json();
      if (!data.error) setRates(data);
    } catch (e) {
      console.error('Error loading rates:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    await loadRates();
    const today = getVzlaDateString();
    const firstDay = getVzlaFirstDayString();

    try {
      const [
        { count: clientes },
        { count: vehiculos },
        { count: serviciosActivos },
        { count: mensajesHoy },
        { count: conversacionesHoy },
        { count: conversacionesMes },
        { count: citasHoy },
        { count: completados },
        { count: mensajesIA },
        { data: servicios },
        { data: convs },
        { data: waMsgs },
        { data: ventas },
      ] = await Promise.all([
        withSedeFilter(supabase.from('clientes')).select('*', { count: 'exact', head: true }),
        withSedeFilter(supabase.from('vehiculos')).select('*', { count: 'exact', head: true }),
        withSedeFilter(supabase.from('servicios')).select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'confirmada', 'en_revision', 'en_progreso', 'en_proceso']),
        withSedeFilter(supabase.from('mensajes_whatsapp')).select('*', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`).lt('created_at', `${today}T23:59:59`),
        withSedeFilter(supabase.from('conversaciones')).select('*', { count: 'exact', head: true }).gte('ultimo_mensaje_at', `${today}T00:00:00`),
        withSedeFilter(supabase.from('conversaciones')).select('*', { count: 'exact', head: true }).gte('ultimo_mensaje_at', `${firstDay}T00:00:00`),
        withSedeFilter(supabase.from('citas')).select('*', { count: 'exact', head: true }).eq('fecha', today),
        withSedeFilter(supabase.from('servicios')).select('*', { count: 'exact', head: true }).eq('estado', 'completado'),
        withSedeFilter(supabase.from('mensajes_whatsapp')).select('*', { count: 'exact', head: true }).eq('es_ia', true),
        withSedeFilter(supabase.from('servicios')).select('id, descripcion, tipo, estado, costo_estimado, created_at, nombre_cliente, placa, vehiculo_info, vehiculos (marca, modelo, placa, clientes (nombre, apellido))').order('created_at', { ascending: false }).limit(5),
        withSedeFilter(supabase.from('conversaciones')).select('id, telefono, ultimo_mensaje, ultimo_mensaje_at, mensajes_sin_leer, estado, datos_cliente').order('ultimo_mensaje_at', { ascending: false }).limit(6),
        withSedeFilter(supabase.from('mensajes_whatsapp')).select('created_at').gte('created_at', `${today}T00:00:00`).lt('created_at', `${today}T23:59:59`).eq('tipo', 'entrante'),
        withSedeFilter(supabase.from('ventas_dia')).select('id, cliente, total_ingresos, created_at, estado').order('created_at', { ascending: false }).limit(6),
      ]);

      setStats({
        totalClientes: clientes,
        totalVehiculos: vehiculos,
        serviciosActivos: serviciosActivos,
        mensajesHoy: mensajesHoy,
        conversacionesHoy: conversacionesHoy,
        conversacionesMes: conversacionesMes,
        citasHoy: citasHoy,
        serviciosCompletados: completados,
        mensajesIA: mensajesIA,
      });

      setRecentServicios((servicios as RecentServicio[]) || []);
      setRecentConvs((convs as RecentConv[]) || []);
      setRecentVentas((ventas as RecentVenta[]) || []);

      if (waMsgs) {
        const hourMap: Record<string, number> = {};
        for (let h = 8; h <= 18; h++) hourMap[`${h}:00`] = 0;
        waMsgs.forEach((m: { created_at: string }) => {
          const d = new Date(m.created_at);
          const vzlaH = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
          const hKey = `${vzlaH.getHours()}:00`;
          hourMap[hKey] = (hourMap[hKey] || 0) + 1;
        });
        setWaChart(Object.entries(hourMap).map(([hora, mensajes]) => ({ hora, mensajes })));
      }

      // Build daily chart for Silenciadores and Servicios
      const silMap: Record<string, number> = {};
      const servMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const dateKey = d.toISOString().split('T')[0];
        silMap[dateKey] = 0;
        servMap[dateKey] = 0;
      }
      
      const dataSilenciadores = await withSedeFilter(supabase.from('ventas_silenciadores')).select('fecha, cantidad').gte('fecha', new Date(Date.now() - 7 * 86400000).toISOString());
      if (dataSilenciadores.data) {
        dataSilenciadores.data.forEach((v: { fecha: string; cantidad: number }) => {
          const dateKey = v.fecha.split('T')[0];
          if (silMap[dateKey] !== undefined) silMap[dateKey] += v.cantidad;
        });
      }
      
      const dataServiciosChart = await withSedeFilter(supabase.from('servicios')).select('created_at').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
      if (dataServiciosChart.data) {
        dataServiciosChart.data.forEach((s: { created_at: string }) => {
          const dateKey = s.created_at.split('T')[0];
          if (servMap[dateKey] !== undefined) servMap[dateKey] += 1;
        });
      }

      setSilenciadoresChart(Object.entries(silMap).map(([fecha, vendidos]) => ({
        fecha: new Date(fecha).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }),
        vendidos,
      })));
      setServiciosChart(Object.entries(servMap).map(([fecha, trabajos]) => ({
        fecha: new Date(fecha).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }),
        trabajos,
      })));

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadRates]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && currentSede) loadData();
  }, [mounted, loadData, currentSede, sedeRefreshKey]);

  useEffect(() => {
    if (!supabase || !mounted || !currentSede) return;
    const tables = ['mensajes_whatsapp', 'conversaciones', 'servicios', 'citas', 'clientes', 'vehiculos', 'ventas_silenciadores', 'ventas_dia'];
    const channels = tables.map(table =>
      supabase!.channel(`dashboard-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => { loadData(); })
        .subscribe()
    );
    return () => { channels.forEach(ch => supabase?.removeChannel(ch)); };
  }, [mounted, loadData]);

  const fmt = (val: number | null) => val === null ? '...' : val.toLocaleString();

  const [showTutorial, setShowTutorial] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoReady = useRef(false);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const timeout = setTimeout(() => {
      if (!cancelled && !videoReady.current) {
        videoReady.current = true;
        setVideoUrl('/api/tutorial-video');
      }
    }, 2000);

    fetch('/api/tutorial-video?format=json')
      .then(r => r.json())
      .then(data => {
        if (cancelled || videoReady.current || !data.signedUrl) return;
        clearTimeout(timeout);
        videoReady.current = true;
        setVideoUrl(data.signedUrl);

        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'fetch';
        link.href = data.signedUrl;
        document.head.appendChild(link);
      })
      .catch(() => {});

    return () => { clearTimeout(timeout); cancelled = true; };
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      const timer = setTimeout(() => setShowTutorial(true), 500);
      return () => clearTimeout(timer);
    }
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-3">
            <div className="h-8 w-48 bg-muted rounded-lg" />
            <div className="h-4 w-72 bg-muted rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-28 bg-muted rounded-lg" />
            <div className="h-8 w-24 bg-muted rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-24 bg-muted rounded-xl" />
          <div className="h-24 bg-muted rounded-xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-56 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tutorial Video Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
          <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-blue-600/10 to-purple-600/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Play className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">🎬 Tutorial Lycos Team</h2>
                  <p className="text-[10px] text-muted-foreground">Aprende a usar el sistema paso a paso</p>
                </div>
              </div>
              <button
                onClick={() => setShowTutorial(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Video Player */}
            <div className="relative bg-black">
              {videoUrl ? (
                <video
                  className="w-full aspect-video"
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  preload="auto"
                >
                  <source src={videoUrl} type="video/mp4" />
                  Tu navegador no soporta el elemento de video.
                </video>
              ) : (
                <div className="w-full aspect-video flex items-center justify-center bg-muted/10 min-h-[200px]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    <p className="text-xs text-muted-foreground">Cargando video...</p>
                  </div>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground">📌 Puedes volver a verlo recargando la página</p>
              <button
                onClick={() => setShowTutorial(false)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            Panel Principal
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
            Bienvenido de vuelta · {new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[11px] font-semibold">
                <MapPin className="w-3 h-3" />
                {currentSede?.nombre || 'Sede no seleccionada'}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-500 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                {userRole}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <Zap className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Bot IA Activo</span>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Exchange Rates Bar */}
      {rates && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/5 to-transparent border-blue-500/10 shadow-sm overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign className="w-12 h-12 text-blue-500" />
            </div>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mb-0.5">Tasa Oficial BCV</p>
                  <span className="text-[9px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                    {new Date(rates.fetchedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
                    Bs. {rates.bcv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/5 to-transparent border-orange-500/10 shadow-sm overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Coins className="w-12 h-12 text-orange-500" />
            </div>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-orange-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest mb-0.5">Binance P2P (USDT)</p>
                  <span className="text-[9px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                    {new Date(rates.fetchedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
                    Bs. {rates.binance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Clientes" value={fmt(stats.totalClientes)} icon={Users} color="blue" delay={0} />
        <StatCard title="Vehículos" value={fmt(stats.totalVehiculos)} icon={Car} color="cyan" delay={50} />
        <StatCard title="Servicios Activos" value={fmt(stats.serviciosActivos)} icon={Wrench} subtitle="en taller ahora" color="orange" delay={100} />
        <StatCard title="Mensajes Hoy" value={fmt(stats.mensajesHoy)} icon={MessageSquare} subtitle={`${stats.conversacionesHoy ?? '...'} chats activos hoy`} color="purple" delay={150} />
        <StatCard title="Citas Hoy" value={fmt(stats.citasHoy)} icon={Calendar} subtitle="programadas" color="blue" delay={200} />
        <StatCard title="Completados" value={fmt(stats.serviciosCompletados)} icon={CheckCircle} subtitle="servicios totales" color="green" delay={250} />
        <StatCard title="Respuestas IA" value={fmt(stats.mensajesIA)} icon={Bot} subtitle="mensajes automáticos" color="purple" delay={300} />
        <StatCard title="Cuota WA (Mes)" value={`${stats.conversacionesMes ?? 0}/1000`} icon={MessageSquare} subtitle="conversaciones gratis" color="green" delay={350} />
      </div>

      {/* Charts Array */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart: mensajes WhatsApp hoy por hora */}
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Mensajes WhatsApp — Hoy</CardTitle>
                <CardDescription className="text-xs">Mensajes entrantes de clientes por hora</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {waChart.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sin mensajes hoy aún
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={waChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMsgs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25d366" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#25d366" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="hora" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} className="text-muted-foreground" allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="mensajes" name="Mensajes" stroke="#25d366" strokeWidth={2} fill="url(#colorMsgs)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart: Ventas de Silenciadores */}
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Silenciadores (7 días)</CardTitle>
                <CardDescription className="text-xs">Distribución de ventas</CardDescription>
              </div>
              <a href="/dashboard/silenciadores" className="text-xs text-primary flex items-center gap-1 hover:underline">
                Ir <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {silenciadoresChart.every(item => item.vendidos === 0) ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sin ventas en los últimos 7 días
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={silenciadoresChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} className="text-muted-foreground" allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="vendidos" name="Silenciadores" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorSil)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart: Registro de Taller (Servicios) */}
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Taller (7 días)</CardTitle>
                <CardDescription className="text-xs">Servicios / Trabajos Registrados</CardDescription>
              </div>
              <a href="/dashboard/servicios" className="text-xs text-blue-400 flex items-center gap-1 hover:underline">
                Ir <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {serviciosChart.every(item => item.trabajos === 0) ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sin trabajos en los últimos 7 días
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={serviciosChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorServ" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} className="text-muted-foreground" allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="trabajos" name="Trabajos" stroke="#60a5fa" strokeWidth={2} fill="url(#colorServ)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent services */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Servicios Recientes</CardTitle>
              <a href="/dashboard/servicios" className="text-xs text-primary flex items-center gap-1 hover:underline">
                Ver todos <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {recentServicios.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Sin servicios registrados</p>
              ) : (
                recentServicios.map((s) => {
                  const relName = s.vehiculos?.clientes ? `${s.vehiculos.clientes.nombre} ${s.vehiculos.clientes.apellido || ''}`.trim() : '';
                  let rawName = relName;
                  if (s.nombre_cliente && s.nombre_cliente.trim() !== relName && s.nombre_cliente.trim() !== '') {
                    rawName = s.nombre_cliente;
                  }
                  if (!rawName) {
                    rawName = 'No definido';
                  } else {
                    // Remove "(WhatsApp)" and "ADMIN IA" but keep the rest of the name
                    rawName = rawName.replace(/\(WhatsApp\)/gi, '').replace(/ADMIN IA/gi, '').trim();
                    if (!rawName) rawName = 'No definido';
                  }
                  const clientName = rawName;
                  const vehicleStr = s.vehiculo_info || (s.vehiculos ? `${s.vehiculos.marca} ${s.vehiculos.modelo}` : '');
                  const plate = s.placa || s.vehiculos?.placa || '';
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{clientName || s.descripcion || 'Sin cliente'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {vehicleStr}{plate ? ` · ${plate}` : ''}{s.descripcion ? ` · "${s.descripcion}"` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{s.tipo ? tipoServicioLabel[s.tipo] || s.tipo : 'Sin tipo'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <StatusBadge status={s.estado || 'pendiente'} />
                        {s.costo_estimado ? (
                          <span className="text-[10px] font-bold text-foreground">{formatCurrency(s.costo_estimado)}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent WhatsApp conversations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Conversaciones WhatsApp</CardTitle>
              <a href="/dashboard/whatsapp" className="text-xs text-primary flex items-center gap-1 hover:underline">
                Ver chat <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {recentConvs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Sin conversaciones</p>
              ) : (
                recentConvs.map((conv) => (
                  <div key={conv.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors cursor-pointer">
                    <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                      {(conv.mensajes_sin_leer ?? 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold">
                          {conv.mensajes_sin_leer}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">
                        {(conv.datos_cliente as { nombre?: string } | null)?.nombre || conv.telefono}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{conv.ultimo_mensaje || '...'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={conv.estado || 'activa'} type="conversacion" />
                      <span className="text-[10px] text-muted-foreground">
                        {conv.ultimo_mensaje_at ? formatRelativeTime(conv.ultimo_mensaje_at) : '---'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Ventas Recientes</CardTitle>
              <a href="/dashboard/ventas" className="text-xs text-primary flex items-center gap-1 hover:underline">
                Ir a caja <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {recentVentas.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Sin ventas registradas</p>
              ) : (
                recentVentas.map((venta) => (
                  <div key={venta.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors">
                    <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {venta.cliente 
                          ? venta.cliente.replace(/\(WhatsApp\)/gi, '').replace(/ADMIN IA/gi, '').trim() || 'No definido'
                          : 'Consumidor Final'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(venta.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={venta.estado || 'pagado'} />
                      <span className="text-xs font-bold text-foreground">
                        {formatCurrency(venta.total_ingresos)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
