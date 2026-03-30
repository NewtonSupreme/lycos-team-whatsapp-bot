'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Car, Wrench, MessageSquare, Bot,
  Calendar, CheckCircle, ArrowRight, Zap, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import StatCard from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import StatusBadge from '@/components/ui/status-badge';
import { formatCurrency, formatRelativeTime, tipoServicioLabel } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────
interface DashboardStats {
  totalClientes: number | null;
  totalVehiculos: number | null;
  serviciosActivos: number | null;
  mensajesHoy: number | null;
  conversacionesHoy: number | null;
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

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalClientes: null, totalVehiculos: null, serviciosActivos: null,
    mensajesHoy: null, conversacionesHoy: null, citasHoy: null,
    serviciosCompletados: null, mensajesIA: null,
  });
  const [recentServicios, setRecentServicios] = useState<RecentServicio[]>([]);
  const [recentConvs, setRecentConvs] = useState<RecentConv[]>([]);
  const [waChart, setWaChart] = useState<WaChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    const today = getVzlaDateString();

    const [
      { count: clientes },
      { count: vehiculos },
      { count: serviciosActivos },
      { count: mensajesHoy },
      { count: conversacionesHoy },
      { count: citasHoy },
      { count: completados },
      { count: mensajesIA },
      { data: servicios },
      { data: convs },
      { data: waMsgs },
    ] = await Promise.all([
      supabase.from('clientes').select('*', { count: 'exact', head: true }),
      supabase.from('vehiculos').select('*', { count: 'exact', head: true }),
      supabase.from('servicios').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'en_progreso', 'en_proceso']),
      supabase.from('mensajes_whatsapp').select('*', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`).lt('created_at', `${today}T23:59:59`),
      // Conversaciones que tuvieron un mensaje hoy
      supabase.from('conversaciones').select('*', { count: 'exact', head: true }).gte('ultimo_mensaje_at', `${today}T00:00:00`),
      supabase.from('citas').select('*', { count: 'exact', head: true }).eq('fecha', today),
      supabase.from('servicios').select('*', { count: 'exact', head: true }).eq('estado', 'completado'),
      supabase.from('mensajes_whatsapp').select('*', { count: 'exact', head: true }).eq('es_ia', true),
      // Recent services
      supabase.from('servicios').select('id, descripcion, tipo, estado, costo_estimado, created_at').order('created_at', { ascending: false }).limit(5),
      // Recent conversations
      supabase.from('conversaciones').select('id, telefono, ultimo_mensaje, ultimo_mensaje_at, mensajes_sin_leer, estado, datos_cliente').order('ultimo_mensaje_at', { ascending: false }).limit(6),
      // WA messages today per hour
      supabase.from('mensajes_whatsapp').select('created_at').gte('created_at', `${today}T00:00:00`).lt('created_at', `${today}T23:59:59`).eq('tipo', 'entrante'),
    ]);

    setStats({
      totalClientes: clientes,
      totalVehiculos: vehiculos,
      serviciosActivos: serviciosActivos,
      mensajesHoy: mensajesHoy,
      conversacionesHoy: conversacionesHoy,
      citasHoy: citasHoy,
      serviciosCompletados: completados,
      mensajesIA: mensajesIA,
    });

    setRecentServicios((servicios as RecentServicio[]) || []);
    setRecentConvs((convs as RecentConv[]) || []);

    // Build hourly chart for today's WA messages
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

    setLoading(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, [loadData]);

  // Real-time subscriptions
  useEffect(() => {
    if (!supabase) return;
    const tables = ['mensajes_whatsapp', 'conversaciones', 'servicios', 'citas', 'clientes', 'vehiculos'];
    const channels = tables.map(table =>
      supabase!.channel(`dashboard-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => { loadData(); })
        .subscribe()
    );
    return () => { channels.forEach(ch => supabase?.removeChannel(ch)); };
  }, [loadData]);

  const fmt = (val: number | null) => val === null ? 'null' : val.toLocaleString();

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            Panel Principal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bienvenido de vuelta · {new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Clientes" value={fmt(stats.totalClientes)} icon={Users} color="blue" delay={0} />
        <StatCard title="Vehículos" value={fmt(stats.totalVehiculos)} icon={Car} color="cyan" delay={50} />
        <StatCard title="Servicios Activos" value={fmt(stats.serviciosActivos)} icon={Wrench} subtitle="en taller ahora" color="orange" delay={100} />
        <StatCard title="Mensajes Hoy" value={fmt(stats.mensajesHoy)} icon={MessageSquare} subtitle={`${stats.conversacionesHoy ?? 'null'} conversaciones hoy`} color="purple" delay={150} />
        <StatCard title="Citas Hoy" value={fmt(stats.citasHoy)} icon={Calendar} subtitle="programadas" color="blue" delay={200} />
        <StatCard title="Completados" value={fmt(stats.serviciosCompletados)} icon={CheckCircle} subtitle="servicios totales" color="green" delay={250} />
        <StatCard title="Respuestas IA" value={fmt(stats.mensajesIA)} icon={Bot} subtitle="mensajes automáticos" color="purple" delay={300} />
        <StatCard title="Conversations" value={fmt(stats.conversacionesHoy)} icon={MessageSquare} subtitle="activas hoy" color="green" delay={350} />
      </div>

      {/* Chart: mensajes WhatsApp hoy por hora */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Mensajes WhatsApp — Hoy</CardTitle>
              <CardDescription className="text-xs">Mensajes entrantes de clientes por hora (Venezuela)</CardDescription>
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

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                recentServicios.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.descripcion || 'Sin descripción'}</p>
                      <p className="text-[10px] text-muted-foreground">{s.tipo ? tipoServicioLabel[s.tipo] || s.tipo : 'Sin tipo'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={s.estado || 'pendiente'} />
                      {s.costo_estimado && (
                        <span className="text-[10px] text-muted-foreground">{formatCurrency(s.costo_estimado)}</span>
                      )}
                    </div>
                  </div>
                ))
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
      </div>
    </div>
  );
}
