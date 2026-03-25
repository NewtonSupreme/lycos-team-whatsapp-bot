'use client';
import React from 'react';
import {
  Users, Car, Wrench, MessageSquare, DollarSign, Bot,
  Calendar, CheckCircle, ArrowRight, Zap
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import StatCard from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/ui/status-badge';
import {
  mockDashboardStats, mockServicios, mockConversaciones,
  mockActivityLog, chartDataIngresos, chartDataServicios
} from '@/lib/mockData';
import { formatCurrency, formatRelativeTime, tipoServicioLabel } from '@/lib/utils';

const PIE_COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: unknown[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-xl text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {(payload as { name: string; color: string; value: number | string }[]).map((p) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.name === 'ingresos' ? formatCurrency(p.value) : p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

const pieData = [
  { name: 'Mecánica', value: 35 },
  { name: 'Electrónica', value: 22 },
  { name: 'Cerrajería', value: 15 },
  { name: 'Motor', value: 12 },
  { name: 'Diagnóstico', value: 10 },
  { name: 'Emergencia', value: 6 },
];

export default function DashboardPage() {
  const [mounted, setMounted] = React.useState(false);
  const stats = mockDashboardStats;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            Panel Principal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bienvenido de vuelta · {mounted ? new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '---'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <Zap className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Bot IA Activo</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Clientes" value={stats.totalClientes.toLocaleString()} icon={Users} trend={12} trendLabel="vs mes anterior" color="blue" delay={0} />
        <StatCard title="Vehículos" value={stats.totalVehiculos.toLocaleString()} icon={Car} trend={8} trendLabel="registrados" color="cyan" delay={50} />
        <StatCard title="Servicios Activos" value={stats.serviciosActivos} icon={Wrench} subtitle="en taller ahora" color="orange" delay={100} />
        <StatCard title="Mensajes Hoy" value={stats.conversacionesHoy} icon={MessageSquare} trend={23} trendLabel="vs ayer" color="purple" delay={150} />
        <StatCard title="Ingresos del Mes" value={formatCurrency(stats.ingresosMes)} icon={DollarSign} trend={15} trendLabel="vs mes anterior" color="green" delay={200} />
        <StatCard title="Completados" value={stats.serviciosCompletados} icon={CheckCircle} subtitle="este mes" color="green" delay={250} />
        <StatCard title="Citas Hoy" value={stats.citasHoy} icon={Calendar} subtitle="programadas" color="blue" delay={300} />
        <StatCard title="Respuestas IA" value={stats.mensajesIA.toLocaleString()} icon={Bot} trend={45} trendLabel="automatizadas" color="purple" delay={350} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ingresos chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Ingresos vs Gastos</CardTitle>
                <CardDescription className="text-xs">Últimos 6 meses · USD</CardDescription>
              </div>
              <Badge variant="success" className="text-[10px]">+15% este mes</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartDataIngresos} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} axisLine={false} tickLine={false} className="text-muted-foreground" />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#f97316" strokeWidth={2} fill="url(#colorIngresos)" />
                <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#3b82f6" strokeWidth={2} fill="url(#colorGastos)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Tipos de Servicio</CardTitle>
            <CardDescription className="text-xs">Distribución este mes</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} opacity={0.85} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => [`${val}%`, '']} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: 11, color: 'hsl(var(--foreground))' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-[10px] text-muted-foreground truncate">{d.name}</span>
                  <span className="text-[10px] font-medium ml-auto">{d.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Servicios chart */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Servicios por Tipo</CardTitle>
          <CardDescription className="text-xs">Volumen mensual de cada categoría</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartDataServicios} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} axisLine={false} tickLine={false} className="text-muted-foreground" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: 11, color: 'hsl(var(--foreground))' }} />
              <Bar dataKey="mecanica" name="Mecánica" fill="#f97316" radius={[3,3,0,0]} opacity={0.85} />
              <Bar dataKey="electronica" name="Electrónica" fill="#3b82f6" radius={[3,3,0,0]} opacity={0.85} />
              <Bar dataKey="cerrajeria" name="Cerrajería" fill="#8b5cf6" radius={[3,3,0,0]} opacity={0.85} />
              <Bar dataKey="motor" name="Motor" fill="#ef4444" radius={[3,3,0,0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
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
              {mockServicios.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{s.descripcion}</p>
                    <p className="text-[10px] text-muted-foreground">{tipoServicioLabel[s.tipo]}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={s.estado} />
                    {s.costo_estimado && (
                      <span className="text-[10px] text-muted-foreground">{formatCurrency(s.costo_estimado)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent WhatsApp */}
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
              {mockConversaciones.map((conv) => (
                <div key={conv.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors cursor-pointer">
                  <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                    {conv.mensajes_sin_leer > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold">
                        {conv.mensajes_sin_leer}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{conv.telefono}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{conv.ultimo_mensaje}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={conv.estado} type="conversacion" />
                    <span className="text-[10px] text-muted-foreground">{mounted ? formatRelativeTime(conv.ultimo_mensaje_at) : '---'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Actividad Reciente</CardTitle>
            <a href="/dashboard/actividad" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Ver registro <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-0 divide-y divide-border/20">
            {mockActivityLog.map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-2.5 hover:bg-white/2 transition-colors rounded-lg px-2">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  log.modulo === 'WhatsApp' ? 'bg-green-400' :
                  log.modulo === 'Servicios' ? 'bg-orange-400' :
                  log.modulo === 'Clientes' ? 'bg-blue-400' : 'bg-purple-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground">{log.usuario} · </span>
                  <span className="text-xs font-medium">{log.accion}</span>
                  {log.detalles && <span className="text-xs text-muted-foreground"> · {log.detalles}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{log.modulo}</span>
                  <span className="text-[10px] text-muted-foreground">{mounted ? formatRelativeTime(log.created_at) : '---'}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
