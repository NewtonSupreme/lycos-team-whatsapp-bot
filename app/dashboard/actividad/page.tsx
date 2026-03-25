'use client';
import React, { useState } from 'react';
import { Activity, Search, Download, Bot, User, Wrench, MessageSquare, Calendar, Settings, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mockActivityLog } from '@/lib/mockData';
import { formatRelativeTime, cn } from '@/lib/utils';

const MODULE_ICONS: Record<string, React.ElementType> = {
  WhatsApp: MessageSquare, Servicios: Wrench, Clientes: User, Agenda: Calendar,
  Configuración: Settings, Sistema: Shield, IA: Bot,
};
const MODULE_COLORS: Record<string, string> = {
  WhatsApp: 'text-green-400 bg-green-500/10', Servicios: 'text-orange-400 bg-orange-500/10',
  Clientes: 'text-blue-400 bg-blue-500/10', Agenda: 'text-purple-400 bg-purple-500/10',
  Sistema: 'text-gray-400 bg-gray-500/10', IA: 'text-violet-400 bg-violet-500/10',
};

const EXTENDED_LOGS = [
  ...mockActivityLog,
  { id: '6', usuario: 'Admin', accion: 'Vehículo registrado', modulo: 'Clientes', detalles: 'Hyundai Tucson 2022 · MNO-987', created_at: '2024-12-12T08:00:00Z' },
  { id: '7', usuario: 'Bot IA', accion: 'Cita agendada automáticamente', modulo: 'IA', detalles: 'Carlos R. · Viernes 9AM', created_at: '2024-12-12T10:16:30Z' },
  { id: '8', usuario: 'Admin', accion: 'Factura generada', modulo: 'Servicios', detalles: 'Chevrolet Aveo · $95.00', created_at: '2024-12-12T07:30:00Z' },
  { id: '9', usuario: 'Sistema', accion: 'Backup automático completado', modulo: 'Sistema', detalles: 'Base de datos respaldada', created_at: '2024-12-12T06:00:00Z' },
  { id: '10', usuario: 'Admin', accion: 'Configuración actualizada', modulo: 'Configuración', detalles: 'Horario de atención', created_at: '2024-12-11T17:00:00Z' },
  { id: '11', usuario: 'Bot IA', accion: '23 respuestas automáticas enviadas', modulo: 'WhatsApp', detalles: 'Tasa éxito: 96%', created_at: '2024-12-11T16:00:00Z' },
  { id: '12', usuario: 'Admin', accion: 'Nuevo empleado agregado', modulo: 'Configuración', detalles: 'José Martínez · Técnico', created_at: '2024-12-11T09:00:00Z' },
];

export default function ActividadPage() {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    setMounted(true);
  }, []);
  const [filterModule, setFilterModule] = useState('todos');
  const [filterUser, setFilterUser] = useState('todos');

  const filtered = EXTENDED_LOGS.filter(log => {
    const matchSearch = `${log.accion} ${log.usuario} ${log.modulo} ${log.detalles}`.toLowerCase().includes(search.toLowerCase());
    const matchModule = filterModule === 'todos' || log.modulo === filterModule;
    const matchUser = filterUser === 'todos' || log.usuario === filterUser;
    return matchSearch && matchModule && matchUser;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const modules = [...new Set(EXTENDED_LOGS.map(l => l.modulo))];
  const users = [...new Set(EXTENDED_LOGS.map(l => l.usuario))];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Registro de Actividad</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Auditoría completa del sistema</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 self-start sm:self-auto">
          <Download className="w-3.5 h-3.5" /> Exportar Log
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Eventos', value: EXTENDED_LOGS.length, color: 'text-foreground' },
          { label: 'Acciones IA', value: EXTENDED_LOGS.filter(l => l.usuario === 'Bot IA').length, color: 'text-violet-400' },
          { label: 'Admin', value: EXTENDED_LOGS.filter(l => l.usuario === 'Admin').length, color: 'text-primary' },
          { label: 'Sistema', value: EXTENDED_LOGS.filter(l => l.usuario === 'Sistema').length, color: 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="stat-card border border-border/50">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`} style={{ fontFamily: 'Syne, sans-serif' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Buscar en el registro..." icon={<Search />} value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los módulos</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Usuario" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border/20">
            {filtered.map((log, i) => {
              const Icon = MODULE_ICONS[log.modulo] || Activity;
              const colorClass = MODULE_COLORS[log.modulo] || 'text-gray-400 bg-gray-500/10';
              return (
                <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-white/2 transition-colors" style={{ animationDelay: `${i * 30}ms` }}>
                  {/* Icon */}
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', colorClass)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium">{log.accion}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.usuario}
                      </span>
                      {log.detalles && (
                        <>
                          <span className="text-border">·</span>
                          <span>{log.detalles}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', colorClass)}>{log.modulo}</span>
                    <span className="text-[10px] text-muted-foreground">{mounted ? formatRelativeTime(log.created_at) : '---'}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Activity className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No se encontraron eventos</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
