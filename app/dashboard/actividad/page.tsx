'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Search, Download, Bot, User, Wrench, MessageSquare,
  Calendar, Settings, Shield, Car, RefreshCw, FileText, Loader2, Plus
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

interface LogEntry {
  id: string;
  usuario: string;
  accion: string;
  modulo: string;
  detalles: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  created_at: string;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  WhatsApp: MessageSquare,
  Servicios: Wrench,
  Clientes: User,
  Agenda: Calendar,
  'Configuración': Settings,
  Sistema: Shield,
  IA: Bot,
  Vehículos: Car,
  Reportes: FileText,
};

const MODULE_COLORS: Record<string, string> = {
  WhatsApp: 'text-green-400 bg-green-500/10 border-green-500/20',
  Servicios: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  Clientes: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  Agenda: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Configuración': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  Sistema: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  IA: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  Vehículos: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  Reportes: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function ActividadPage() {
  const { user } = useAppStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('todos');
  const [filterUser, setFilterUser] = useState('todos');

  const isAdmin = user?.rol === 'admin';

  const loadLogs = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // Cargamos solo la actividad de la sede seleccionada (Multi-Sede)
      const { data, error } = await withSedeFilter(supabase.from('logs_actividad'))
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (error) console.error('Error loading logs:', error);
      setLogs(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('actividad-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_actividad' }, (payload) => {
        setLogs(prev => [payload.new as LogEntry, ...prev]);
      })
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, []);

  const modules = [...new Set(logs.map(l => l.modulo))].filter(Boolean);
  const users = [...new Set(logs.map(l => l.usuario))].filter(Boolean);

  const filtered = logs.filter(log => {
    const txt = `${log.accion} ${log.usuario} ${log.modulo} ${log.detalles || ''}`.toLowerCase();
    const matchSearch = search === '' || txt.includes(search.toLowerCase());
    const matchModule = filterModule === 'todos' || log.modulo === filterModule;
    const matchUser = filterUser === 'todos' || log.usuario === filterUser;
    return matchSearch && matchModule && matchUser;
  });

  const countByUser = (u: string) => logs.filter(l => l.usuario === u || l.usuario.includes(u)).length;

  const handleExport = () => {
    const csv = [
      ['Fecha', 'Usuario', 'Módulo', 'Acción', 'Detalles'].join(','),
      ...filtered.map(l => [
        formatDateTime(l.created_at),
        l.usuario,
        l.modulo,
        l.accion,
        (l.detalles || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actividad_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-destructive/20 mb-4" />
        <h2 className="text-xl font-bold text-destructive" style={{ fontFamily: 'Syne, sans-serif' }}>
          Acceso Denegado
        </h2>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Solo los administradores tienen permiso para ver el registro de actividad del sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            Registro de Actividad
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Cargando...' : `${logs.length} eventos · tiempo real`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-border/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Eventos', value: logs.length, color: 'text-foreground' },
          { label: 'Acciones IA / Bot', value: countByUser('Bot'), color: 'text-violet-400' },
          { label: 'Acciones Admin', value: countByUser('Admin'), color: 'text-primary' },
          { label: 'Automáticos', value: countByUser('Sistema'), color: 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/30 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`} style={{ fontFamily: 'Syne, sans-serif' }}>
              {loading ? '—' : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar en el registro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none"
        >
          <option value="todos">Todos los módulos</option>
          {modules.map((m, idx) => <option key={m || `mod-${idx}`} value={m}>{m}</option>)}
        </select>
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none"
        >
          <option value="todos">Todos los usuarios</option>
          {users.map((u, idx) => <option key={u || `usr-${idx}`} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Cargando actividad del sistema...</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                {logs.length === 0
                  ? 'No hay actividad registrada aún. Las acciones del sistema aparecerán aquí automáticamente.'
                  : 'No se encontraron eventos con esos filtros.'}
              </p>
            </div>
          )}
          <div className="divide-y divide-border/20">
            {!loading && filtered.map((log, i) => {
              const Icon = MODULE_ICONS[log.modulo] || Activity;
              const colorClass = MODULE_COLORS[log.modulo] || 'text-gray-400 bg-gray-500/10 border-gray-500/20';
              return (
                <div
                  key={log.id || `log-${i}`}
                  className="flex items-start gap-3 p-4 hover:bg-white/2 transition-colors"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border', colorClass)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

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
                          <span className="truncate max-w-xs">{log.detalles}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium border', colorClass)}>
                      {log.modulo}
                    </span>
                    <span className="text-[10px] text-muted-foreground" title={formatDateTime(log.created_at)}>
                      {timeAgo(log.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border/20 bg-muted/5">
              <p className="text-xs text-muted-foreground">
                Mostrando {filtered.length} de {logs.length} eventos · actualización en tiempo real
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
