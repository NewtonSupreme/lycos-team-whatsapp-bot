'use client';
import React, { useState } from 'react';
import { Download, TrendingUp, DollarSign, Wrench, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts';
import { mockDashboardStats, chartDataIngresos, chartDataServicios } from '@/lib/mockData';
import { formatCurrency } from '@/lib/utils';

const COLORS = ['#f97316','#3b82f6','#8b5cf6','#10b981','#ef4444','#06b6d4'];

const satisfaccionData = [
  { mes: 'Jul', score: 88 }, { mes: 'Ago', score: 91 }, { mes: 'Sep', score: 87 },
  { mes: 'Oct', score: 93 }, { mes: 'Nov', score: 95 }, { mes: 'Dic', score: 94 },
];

const clientesData = [
  { mes: 'Jul', nuevos: 12, recurrentes: 28 },
  { mes: 'Ago', nuevos: 18, recurrentes: 32 },
  { mes: 'Sep', nuevos: 14, recurrentes: 30 },
  { mes: 'Oct', nuevos: 22, recurrentes: 35 },
  { mes: 'Nov', nuevos: 26, recurrentes: 40 },
  { mes: 'Dic', nuevos: 19, recurrentes: 38 },
];

const tiempoPromedioData = [
  { servicio: 'Aceite', horas: 1.5 }, { servicio: 'Frenos', horas: 3.5 },
  { servicio: 'Motor', horas: 12 }, { servicio: 'Eléctrico', horas: 4 },
  { servicio: 'Diagnóst.', horas: 2 }, { servicio: 'Cerrajería', horas: 1 },
];

const radialData = [
  { name: 'Meta Ingresos', value: 87, fill: '#f97316' },
  { name: 'Citas Cumplidas', value: 92, fill: '#3b82f6' },
  { name: 'Satisfacción', value: 94, fill: '#10b981' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-xl text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {p.name?.includes('ngresos') || p.name?.includes('astos') ? formatCurrency(p.value) : p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function ReportesPage() {
  const stats = mockDashboardStats;
  const [period, setPeriod] = useState('6m');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Reportes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Análisis y métricas del taller</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/50 overflow-hidden">
            {['1m','3m','6m','1a'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/5'}`}>{p}</button>
            ))}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-1.5"
            onClick={() => { window.location.href = '/api/reportes/diario'; }}
          >
            <Download className="w-3.5 h-3.5" /> Exportar Diario
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ingresos del Mes', value: formatCurrency(stats.ingresosMes), sub: '+15% vs mes anterior', icon: DollarSign, color: 'text-green-400 bg-green-500/10' },
          { label: 'Servicios Completados', value: stats.serviciosCompletados, sub: 'Este mes', icon: Wrench, color: 'text-primary bg-primary/10' },
          { label: 'Clientes Atendidos', value: 87, sub: 'Únicos este mes', icon: Users, color: 'text-blue-400 bg-blue-500/10' },
          { label: 'Ticket Promedio', value: formatCurrency(stats.ingresosMes / stats.serviciosCompletados), sub: 'Por servicio', icon: TrendingUp, color: 'text-purple-400 bg-purple-500/10' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="stat-card border border-border/50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold mt-1" style={{ fontFamily: 'Syne, sans-serif' }}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingresos vs Gastos</CardTitle>
            <CardDescription className="text-xs">Evolución financiera mensual</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartDataIngresos} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#f97316" strokeWidth={2} fill="url(#gIngresos)" />
                <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#3b82f6" strokeWidth={2} fill="url(#gGastos)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clientes Nuevos vs Recurrentes</CardTitle>
            <CardDescription className="text-xs">Retención de clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={clientesData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="nuevos" name="Nuevos" fill="#f97316" radius={[3,3,0,0]} opacity={0.85} />
                <Bar dataKey="recurrentes" name="Recurrentes" fill="#3b82f6" radius={[3,3,0,0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Satisfacción del Cliente</CardTitle>
            <CardDescription className="text-xs">Puntuación promedio mensual</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={satisfaccionData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="score" name="Score" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiempo Promedio por Servicio</CardTitle>
            <CardDescription className="text-xs">Horas promedio de atención</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tiempoPromedioData} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="servicio" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="horas" name="Horas" radius={[0,3,3,0]} fill="#8b5cf6" opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Indicadores Clave</CardTitle>
            <CardDescription className="text-xs">Progreso hacia metas del mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              {radialData.map((d, i) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">{d.name}</span>
                    <span className="text-xs font-bold" style={{ color: d.fill }}>{d.value}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${d.value}%`, background: d.fill, opacity: 0.8 }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Servicios breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Servicios por Categoría</CardTitle>
              <CardDescription className="text-xs">Volumen mensual desglosado</CardDescription>
            </div>
            <Badge variant="default">Últimos 6 meses</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartDataServicios} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar dataKey="mecanica" name="Mecánica" fill="#f97316" radius={[2,2,0,0]} opacity={0.85} />
              <Bar dataKey="electronica" name="Electrónica" fill="#3b82f6" radius={[2,2,0,0]} opacity={0.85} />
              <Bar dataKey="cerrajeria" name="Cerrajería" fill="#8b5cf6" radius={[2,2,0,0]} opacity={0.85} />
              <Bar dataKey="motor" name="Motor" fill="#ef4444" radius={[2,2,0,0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
