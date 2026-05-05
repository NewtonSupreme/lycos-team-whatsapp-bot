'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame, Eye, MessageCircle, CheckCircle2, Clock, Users,
  RefreshCw, Search, Phone, Car,
  X, Zap, TrendingUp, ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

// ── Types ─────────────────────────────────────────────────────
interface Lead {
  id: string;
  telefono: string;
  nombre?: string;
  vehiculo?: string;
  ultimo_mensaje: string | null;
  ultimo_mensaje_at: string | null;
  created_at: string;
  mensajes_sin_leer: number;
  estado: string;
  memoria?: {
    nombre?: string;
    vehiculos?: { marca: string; modelo: string; anio?: string }[];
    notas?: string;
  };
  // Derived fields
  clasificacion?: LeadClasificacion;
  tiene_cita?: boolean;
  total_mensajes?: number;
  dias_inactivo?: number;
}

interface MensajeHistorial {
  id: string;
  body: string;
  tipo: 'entrante' | 'saliente';
  created_at: string;
  es_ia?: boolean;
}

type LeadClasificacion =
  | 'convertido'
  | 'potencial'
  | 'activo'
  | 'curioso'
  | 'inactivo';

// ── Clasification config ──────────────────────────────────────
const CLASES: Record<LeadClasificacion, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  desc: string;
}> = {
  convertido: {
    label: 'Convertido',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    desc: 'Tiene cita agendada'
  },
  potencial: {
    label: 'Potencial',
    icon: Flame,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    desc: 'Interés alto, sin cita aún'
  },
  activo: {
    label: 'Activo',
    icon: MessageCircle,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    desc: 'Conversación activa hoy'
  },
  curioso: {
    label: 'Curioso',
    icon: Eye,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    desc: 'Solo consultó precios'
  },
  inactivo: {
    label: 'Inactivo',
    icon: Clock,
    color: 'text-muted-foreground',
    bg: 'bg-muted/10',
    border: 'border-border/30',
    desc: 'Sin actividad +3 días'
  },
};

// ── Helpers ───────────────────────────────────────────────────
function getVzlaDate() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + -4 * 3600000);
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// Keyword-based intent detection
const PRECIO_KW = ['precio', 'cuánto', 'cuanto', 'costo', 'presupuesto', 'vale', 'cobran', 'cobras', '$', 'dolar'];
const INTERES_KW = ['quiero', 'necesito', 'cuando', 'puedo', 'disponible', 'cita', 'agendar', 'mañana', 'hoy', 'semana', 'ir', 'llevar', 'traer', 'venir'];

function classifyLead(lead: Lead, tieneCita: boolean, totalMensajes: number): LeadClasificacion {
  const msg = (lead.ultimo_mensaje || '').toLowerCase();
  const ahora = Date.now();
  const lastAt = lead.ultimo_mensaje_at ? new Date(lead.ultimo_mensaje_at).getTime() : 0;
  const diasInactivo = (ahora - lastAt) / 86400000;

  if (tieneCita) return 'convertido';
  if (diasInactivo > 3) return 'inactivo';

  const vzlaNow = getVzlaDate();
  const vzlaYest = new Date(vzlaNow.getFullYear(), vzlaNow.getMonth(), vzlaNow.getDate());
  const isToday = lastAt >= vzlaYest.getTime();

  const hasPrice = PRECIO_KW.some(k => msg.includes(k));
  const hasIntent = INTERES_KW.some(k => msg.includes(k));

  if (isToday && totalMensajes > 3) return 'activo';
  if (hasPrice && hasIntent) return 'potencial';
  if (hasPrice) return 'curioso';
  if (isToday) return 'activo';
  return 'curioso';
}

// ── Main Component ────────────────────────────────────────────
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClase, setFilterClase] = useState<LeadClasificacion | 'todos'>('todos');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [historial, setHistorial] = useState<MensajeHistorial[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const loadLeads = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // 1. Load all conversations
      const { data: convs } = await supabase
        .from('conversaciones')
        .select('id, telefono, ultimo_mensaje, ultimo_mensaje_at, mensajes_sin_leer, estado, memoria, created_at')
        .order('ultimo_mensaje_at', { ascending: false })
        .limit(500);

      if (!convs) { setLoading(false); return; }

      // 2. Load existing citas (to detect 'convertido')
      const phones = convs.map(c => c.telefono);
      const { data: citas } = await supabase
        .from('citas')
        .select('telefono')
        .in('telefono', phones)
        .neq('estado', 'cancelada');

      const citasSet = new Set((citas || []).map(c => c.telefono));

      // 3. Message counts per phone (batch)
      const { data: msgCounts } = await supabase
        .from('mensajes_whatsapp')
        .select('from_number')
        .in('from_number', phones)
        .eq('tipo', 'entrante');

      const countMap: Record<string, number> = {};
      (msgCounts || []).forEach(m => {
        countMap[m.from_number] = (countMap[m.from_number] || 0) + 1;
      });

      // 4. Build leads array with classification
      const enriched: Lead[] = convs.map(c => {
        const mem = (c.memoria as Lead['memoria']) || {};
        const tieneCita = citasSet.has(c.telefono);
        const totalMsgs = countMap[c.telefono] || 0;
        const nombre = mem.nombre || '';
        const vehiculo = mem.vehiculos?.map(v => `${v.marca} ${v.modelo}`).join(', ') || '';
        const lead: Lead = {
          id: c.id,
          telefono: c.telefono,
          nombre,
          vehiculo,
          ultimo_mensaje: c.ultimo_mensaje,
          ultimo_mensaje_at: c.ultimo_mensaje_at,
          created_at: c.created_at,
          mensajes_sin_leer: c.mensajes_sin_leer || 0,
          estado: c.estado || 'bot',
          memoria: mem,
          tiene_cita: tieneCita,
          total_mensajes: totalMsgs,
        };
        lead.clasificacion = classifyLead(lead, tieneCita, totalMsgs);
        return lead;
      });

      setLeads(enriched);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('leads-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, () => loadLeads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => loadLeads())
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [loadLeads]);

  const openLead = async (lead: Lead) => {
    setSelectedLead(lead);
    setHistorial([]);
    setLoadingHistorial(true);
    if (!supabase) return;
    const { data } = await supabase
      .from('mensajes_whatsapp')
      .select('id, body, tipo, created_at, es_ia')
      .or(`from_number.eq.${lead.telefono},to_number.eq.${lead.telefono}`)
      .order('created_at', { ascending: false })
      .limit(40);
    setHistorial(((data || []).reverse()) as MensajeHistorial[]);
    setLoadingHistorial(false);
  };

  const filtered = leads.filter(l => {
    const txt = `${l.nombre} ${l.telefono} ${l.vehiculo} ${l.ultimo_mensaje}`.toLowerCase();
    const matchSearch = search === '' || txt.includes(search.toLowerCase());
    const matchClase = filterClase === 'todos' || l.clasificacion === filterClase;
    return matchSearch && matchClase;
  });

  const countByClase = (c: LeadClasificacion) => leads.filter(l => l.clasificacion === c).length;

  // Stats
  const totalConvertidos = countByClase('convertido');
  const totalPotenciales = countByClase('potencial') + countByClase('activo');
  const tasaConversion = leads.length > 0 ? ((totalConvertidos / leads.length) * 100).toFixed(1) : '0';

  return (
    <div className="flex h-full gap-4">
      {/* Left panel */}
      <div className="flex-1 min-w-0 space-y-4 overflow-auto pb-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
              Leads & Prospectos
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Cargando...' : `${leads.length} contactos · tiempo real`}
            </p>
          </div>
          <button
            onClick={loadLeads}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-border/30 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Contactos</span>
            </div>
            <p className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{leads.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Convertidos</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'Syne, sans-serif' }}>{totalConvertidos}</p>
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Potenciales</span>
            </div>
            <p className="text-2xl font-bold text-orange-400" style={{ fontFamily: 'Syne, sans-serif' }}>{totalPotenciales}</p>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Tasa Conversión</span>
            </div>
            <p className="text-2xl font-bold text-blue-400" style={{ fontFamily: 'Syne, sans-serif' }}>{tasaConversion}%</p>
          </div>
        </div>

        {/* Classification filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterClase('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filterClase === 'todos'
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-card/50 border-border/30 text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos ({leads.length})
          </button>
          {(Object.keys(CLASES) as LeadClasificacion[]).map(clase => {
            const cfg = CLASES[clase];
            const Icon = cfg.icon;
            const count = countByClase(clase);
            return (
              <button
                key={clase}
                onClick={() => setFilterClase(filterClase === clase ? 'todos' : clase)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  filterClase === clase
                    ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                    : 'bg-card/50 border-border/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, vehículo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Leads List */}
        <div className="space-y-2">
          {loading && (
            <div className="text-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Clasificando prospectos...</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 rounded-xl border border-border/20 bg-card/30">
              <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No se encontraron prospectos</p>
            </div>
          )}
          {!loading && filtered.map(lead => {
            const clase = lead.clasificacion || 'curioso';
            const cfg = CLASES[clase];
            const Icon = cfg.icon;
            const isSelected = selectedLead?.id === lead.id;

            return (
              <button
                key={lead.id}
                onClick={() => openLead(lead)}
                className={`w-full text-left rounded-xl border p-4 transition-all duration-200 hover:bg-white/3 ${
                  isSelected
                    ? `${cfg.border} ${cfg.bg}`
                    : 'border-border/20 bg-card/30 hover:border-border/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar / classification */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
                    <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {lead.nombre || lead.telefono}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                          <Icon className="w-2.5 h-2.5" />
                          {cfg.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {timeAgo(lead.ultimo_mensaje_at)}
                      </span>
                    </div>

                    {/* Vehicle */}
                    {lead.vehiculo && (
                      <div className="flex items-center gap-1 mb-1">
                        <Car className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">{lead.vehiculo}</span>
                      </div>
                    )}

                    {/* Last message */}
                    <p className="text-xs text-muted-foreground truncate max-w-sm">
                      {lead.ultimo_mensaje || 'Sin mensajes'}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MessageCircle className="w-2.5 h-2.5" />
                        {lead.total_mensajes} msgs
                      </span>
                      {lead.nombre && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Phone className="w-2.5 h-2.5" />
                          +{lead.telefono}
                        </span>
                      )}
                      {lead.tiene_cita && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Tiene cita
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel: Chat historial */}
      {selectedLead && (
        <div className="w-80 xl:w-96 flex-shrink-0 rounded-xl border border-border/30 bg-card/50 flex flex-col h-[calc(100vh-8rem)] sticky top-0 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border/30 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {selectedLead.nombre || selectedLead.telefono}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {(() => {
                  const cfg = CLASES[selectedLead.clasificacion || 'curioso'];
                  const Icon = cfg.icon;
                  return (
                    <span className={`flex items-center gap-1 text-[10px] font-semibold ${cfg.color}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">+{selectedLead.telefono}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedLead(null)}
              className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center flex-shrink-0"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Vehicle / Notas info */}
          {(selectedLead.vehiculo || selectedLead.memoria?.notas) && (
            <div className="px-4 py-2.5 border-b border-border/20 bg-muted/5 space-y-1">
              {selectedLead.vehiculo && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Car className="w-3 h-3" />
                  <span>{selectedLead.vehiculo}</span>
                </div>
              )}
              {selectedLead.memoria?.notas && (
                <p className="text-xs text-muted-foreground italic">{selectedLead.memoria.notas}</p>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingHistorial && (
              <div className="text-center py-8">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
              </div>
            )}
            {!loadingHistorial && historial.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Sin mensajes</p>
            )}
            {!loadingHistorial && historial.map(msg => {
              const isIncoming = msg.tipo === 'entrante';
              if (isIncoming) {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted/40 border border-border/20 px-3 py-2">
                      <p className="text-xs leading-relaxed">{msg.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(msg.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/20 border border-primary/20 px-3 py-2">
                      <p className="text-xs leading-relaxed">{msg.body}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        {msg.es_ia && <Zap className="w-2.5 h-2.5 text-primary/70" />}
                        <p className="text-[10px] text-primary/70">
                          {new Date(msg.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>

          {/* Actions footer */}
          <div className="p-3 border-t border-border/20 space-y-2">
            <a
              href={`/dashboard/whatsapp`}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400 font-medium hover:bg-green-500/20 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Abrir en WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
