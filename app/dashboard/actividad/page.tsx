'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, Search, Download, Bot, User, Wrench, MessageSquare,
  Calendar, Settings, Shield, Car, RefreshCw, FileText, Loader2,
  Banknote, ShoppingCart, Package, Truck, Receipt, TrendingUp, Users,
  X, Copy, Clock, Hash, Layers, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { withSedeFilter } from '@/lib/db-filters';
import { getPermisos, hasPermiso, resolveRol } from '@/types';

interface LogEntry {
  id: string;
  usuario: string;
  accion: string;
  modulo: string;
  detalles: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  sede_id?: string | null;
  created_at: string;
}

// Normaliza el módulo a una clave canónica (acepta minúsculas y variantes).
function modKey(m: string): string {
  const s = (m || '').toLowerCase();
  if (s.includes('nómin') || s.includes('nomin')) return 'nomina';
  if (s.includes('whats')) return 'whatsapp';
  if (s.includes('servic')) return 'servicios';
  if (s.includes('client')) return 'clientes';
  if (s.includes('agenda') || s.includes('cita')) return 'agenda';
  if (s.includes('config')) return 'configuracion';
  if (s.includes('vehic') || s.includes('vehíc')) return 'vehiculos';
  if (s.includes('report')) return 'reportes';
  if (s.includes('venta')) return 'ventas';
  if (s.includes('inventar')) return 'inventario';
  if (s.includes('distrib')) return 'distribuidor';
  if (s.includes('factur')) return 'facturas';
  if (s.includes('presupuest')) return 'presupuestos';
  if (s.includes('lead')) return 'leads';
  if (s.includes('emplead') || s.includes('permis') || s.includes('usuario')) return 'empleados';
  if (s.includes('ia') || s.includes('bot')) return 'ia';
  if (s.includes('sistema')) return 'sistema';
  return 'sistema';
}

const MODULE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  nomina: { icon: Banknote, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Nómina' },
  whatsapp: { icon: MessageSquare, color: 'text-green-400 bg-green-500/10 border-green-500/20', label: 'WhatsApp' },
  servicios: { icon: Wrench, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', label: 'Servicios' },
  clientes: { icon: User, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', label: 'Clientes' },
  agenda: { icon: Calendar, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', label: 'Agenda' },
  configuracion: { icon: Settings, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', label: 'Configuración' },
  vehiculos: { icon: Car, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', label: 'Vehículos' },
  reportes: { icon: FileText, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20', label: 'Reportes' },
  ventas: { icon: ShoppingCart, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Ventas' },
  inventario: { icon: Package, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', label: 'Inventario' },
  distribuidor: { icon: Truck, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', label: 'Distribuidor' },
  facturas: { icon: Receipt, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', label: 'Facturas' },
  presupuestos: { icon: FileText, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', label: 'Presupuestos' },
  leads: { icon: TrendingUp, color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20', label: 'Leads' },
  empleados: { icon: Users, color: 'text-red-400 bg-red-500/10 border-red-500/20', label: 'Personal' },
  ia: { icon: Bot, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', label: 'IA / Bot' },
  sistema: { icon: Shield, color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', label: 'Sistema' },
};
const metaFor = (m: string) => MODULE_META[modKey(m)] || MODULE_META.sistema;

const REF_LABELS: Record<string, string> = {
  payroll_ledger: 'Liquidación de nómina', job_assignments: 'Trabajo / comisión',
  commission_rules: 'Regla de comisión', payroll_advances: 'Adelanto',
  ventas_dia: 'Venta', servicios: 'Servicio', facturas: 'Factura',
  presupuestos: 'Presupuesto', clientes: 'Cliente', vehiculos: 'Vehículo', citas: 'Cita',
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
  return new Date(ts).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function dayBucket(ts: string): string {
  const d = new Date(ts); const today = new Date(); const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function ActividadPage() {
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede, sedeRefreshKey } = useSedeStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('todos');
  const [filterUser, setFilterUser] = useState('todos');
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const permisos = getPermisos(user?.rol, user?.permisos, roleDefaults);
  const isAdmin = resolveRol(user?.rol) === 'admin';
  const canView = isAdmin || hasPermiso(permisos.actividad, 'leer');

  const loadLogs = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await withSedeFilter(supabase.from('logs_actividad'))
        .select('*').order('created_at', { ascending: false }).limit(500);
      if (error) console.error('Error loading logs:', error);
      setLogs(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [sedeRefreshKey]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('actividad-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs_actividad' }, (payload) => {
        const row = payload.new as LogEntry;
        if (currentSede && row.sede_id && row.sede_id !== currentSede.id) return;
        setLogs(prev => [row, ...prev]);
      })
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [currentSede]);

  const modules = useMemo(() => [...new Set(logs.map(l => l.modulo))].filter(Boolean), [logs]);
  const users = useMemo(() => [...new Set(logs.map(l => l.usuario))].filter(Boolean), [logs]);

  const filtered = useMemo(() => logs.filter(log => {
    const txt = `${log.accion} ${log.usuario} ${log.modulo} ${log.detalles || ''}`.toLowerCase();
    const matchSearch = search === '' || txt.includes(search.toLowerCase());
    const matchModule = filterModule === 'todos' || log.modulo === filterModule;
    const matchUser = filterUser === 'todos' || log.usuario === filterUser;
    return matchSearch && matchModule && matchUser;
  }), [logs, search, filterModule, filterUser]);

  // Agrupa por día para un timeline más claro.
  const grouped = useMemo(() => {
    const g: { bucket: string; items: LogEntry[] }[] = [];
    for (const log of filtered) {
      const b = dayBucket(log.created_at);
      const last = g[g.length - 1];
      if (last && last.bucket === b) last.items.push(log);
      else g.push({ bucket: b, items: [log] });
    }
    return g;
  }, [filtered]);

  const handleExport = () => {
    const csv = [
      ['Fecha', 'Usuario', 'Módulo', 'Acción', 'Detalles', 'Referencia'].join(','),
      ...filtered.map(l => [formatDateTime(l.created_at), l.usuario, l.modulo, l.accion,
        (l.detalles || '').replace(/[,\n]/g, ';'), `${l.referencia_tabla || ''}:${l.referencia_id || ''}`].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `actividad_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-destructive/20 mb-4" />
        <h2 className="text-xl font-bold text-destructive" style={{ fontFamily: 'Syne, sans-serif' }}>Acceso Denegado</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">No tienes permiso para ver el registro de actividad del sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <Activity className="w-6 h-6 text-primary" /> Registro de Actividad
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Cargando...' : `${logs.length} eventos · ${currentSede?.nombre || 'todas las sedes'} · tiempo real`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadLogs} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-border/30">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats por módulo (top 4) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Eventos', value: logs.length, color: 'text-foreground', icon: Layers },
          { label: 'Nómina', value: logs.filter(l => modKey(l.modulo) === 'nomina').length, color: 'text-emerald-400', icon: Banknote },
          { label: 'Ventas / Servicios', value: logs.filter(l => ['ventas', 'servicios'].includes(modKey(l.modulo))).length, color: 'text-amber-400', icon: ShoppingCart },
          { label: 'IA / Bot', value: logs.filter(l => modKey(l.modulo) === 'ia').length, color: 'text-violet-400', icon: Bot },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/30 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5" /> {s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`} style={{ fontFamily: 'Syne, sans-serif' }}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar acción, usuario o detalle…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none">
          <option value="todos">Todos los módulos</option>
          {modules.map((m, idx) => <option key={m || `mod-${idx}`} value={m}>{m}</option>)}
        </select>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none">
          <option value="todos">Todos los usuarios</option>
          {users.map((u, idx) => <option key={u || `usr-${idx}`} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Timeline agrupado por día */}
      <Card>
        <CardContent className="p-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Cargando actividad…</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{logs.length === 0 ? 'No hay actividad registrada aún.' : 'No se encontraron eventos con esos filtros.'}</p>
            </div>
          )}
          {!loading && grouped.map(group => (
            <div key={group.bucket}>
              <div className="sticky top-0 z-10 px-4 py-1.5 bg-muted/40 backdrop-blur text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-y border-border/20">
                {group.bucket} · {group.items.length}
              </div>
              <div className="divide-y divide-border/20">
                {group.items.map((log, i) => {
                  const meta = metaFor(log.modulo);
                  const Icon = meta.icon;
                  return (
                    <button key={log.id || `log-${i}`} onClick={() => setSelected(log)}
                      className="w-full text-left flex items-start gap-3 p-4 hover:bg-white/[0.03] transition-colors group">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border', meta.color)}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{log.accion}</span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> {log.usuario}</span>
                          {log.detalles && (<><span className="text-border">·</span><span className="truncate max-w-[40ch]">{log.detalles}</span></>)}
                          {log.referencia_tabla && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border/30">{REF_LABELS[log.referencia_tabla] || log.referencia_tabla}</span>)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium border', meta.color)}>{meta.label}</span>
                        <span className="text-[10px] text-muted-foreground" title={formatDateTime(log.created_at)}>{timeAgo(log.created_at)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground self-center flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border/20 bg-muted/5">
              <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {logs.length} eventos · actualización en tiempo real</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && <DetalleModal log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetalleModal({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const meta = metaFor(log.modulo);
  const Icon = meta.icon;
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch {} };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center border', meta.color)}><Icon className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{log.accion}</h3>
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium border inline-block mt-1', meta.color)}>{meta.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <KV icon={User} label="Usuario" value={log.usuario} />
          <KV icon={Clock} label="Fecha y hora" value={`${formatDateTime(log.created_at)} · ${timeAgo(log.created_at)}`} />
          {log.detalles && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Detalles</div>
              <div className="rounded-lg bg-muted/40 border border-border/30 p-3 whitespace-pre-wrap text-foreground/90">{log.detalles}</div>
            </div>
          )}
          {log.referencia_tabla && (
            <div className="rounded-lg bg-muted/40 border border-border/30 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Referencia</div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{REF_LABELS[log.referencia_tabla] || log.referencia_tabla}</p>
                  {log.referencia_id && <p className="text-xs text-muted-foreground font-mono break-all">{log.referencia_id}</p>}
                </div>
                {log.referencia_id && (
                  <button onClick={() => copy(log.referencia_id!)} className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted" title="Copiar ID"><Copy className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KV({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground flex items-center gap-1.5 text-[13px]"><Icon className="w-3.5 h-3.5" /> {label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
