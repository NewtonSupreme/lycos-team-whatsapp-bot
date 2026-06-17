'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wrench, Search, Calendar, Clock, CheckCircle, AlertCircle, 
  Loader2, RefreshCw, User, Car, Phone, ChevronDown, X, 
  Banknote, BadgeCheck, Activity, Plus, Trash2, Edit3, 
  ChevronRight, ChevronLeft, MoreHorizontal, MessageSquare, Tag, Info,
  MapPin, Filter, LayoutGrid, List, FileText, MoveHorizontal, Download,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, registrarFactura } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from "@/lib/store/useSedeStore";
import { Button } from '@/components/ui/button';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { cn, getLocalISODate } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────
interface CitaServicio {
  id: string;
  fecha: string;
  hora: string;
  tipo: string;
  tipo_personalizado?: string | null;
  descripcion: string | null;
  estado: string;
  nombre_cliente: string | null;
  vehiculo_info: string | null;
  placa: string | null;
  telefono: string | null;
  created_at: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  sede_id?: string | null;
  costo_estimado?: number | null;
  seguimiento?: any[] | null;
  registrado_por?: string | null;
  vehiculos?: { marca: string; modelo: string; placa: string; anio?: number; clientes?: { nombre: string; apellido: string; telefono: string } | null } | null;
}

const ESTADOS = ['pendiente', 'confirmada', 'en_proceso', 'completada', 'cancelada'];

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; glow: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20',  glow: 'shadow-amber-500/20', icon: AlertCircle },
  confirmada:  { label: 'Confirmada',  color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',    glow: 'shadow-blue-500/20',  icon: Calendar },
  en_proceso:  { label: 'En Proceso',  color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20', glow: 'shadow-violet-500/20', icon: RefreshCw },
  completada:  { label: 'Completada',  color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20',  glow: 'shadow-green-500/20', icon: CheckCircle },
  cancelada:   { label: 'Cancelada',   color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',      glow: 'shadow-red-500/20',   icon: X },
};

const SERVICIO_LABELS: Record<string, string> = {
  mecanica: 'Mecánica', electronica: 'Electrónica', cerrajeria: 'Cerrajería',
  diagnostico: 'Diagnóstico', motor: 'Motor', emergencia: 'Emergencia', otro: 'General',
};

// ── Main Component ───────────────────────────────────────────
export default function ServiciosPage() {
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const [citas, setCitas] = useState<CitaServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [dateFilter, setDateFilter] = useState<'hoy' | 'semana' | 'mes' | 'todos'>('hoy');
  
  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [editCita, setEditCita] = useState<CitaServicio | null>(null);
  const [trackingCita, setTrackingCita] = useState<CitaServicio | null>(null);
  const [invoiceCita, setInvoiceCita] = useState<CitaServicio | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedForDual, setSelectedForDual] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [globalBcvRate, setGlobalBcvRate] = useState(0);

  useEffect(() => {
    fetch('/api/rates').then(res => res.json()).then(data => { if (data.bcv) setGlobalBcvRate(data.bcv); }).catch(console.error);
  }, []);

  const loadCitas = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: invData } = await supabase.from('inventario').select('nombre, precio_usd').eq('activo', true);
      setInventory(invData || []);

      const { data, error } = await withSedeFilter(supabase.from('servicios'))
        .select(`
          id, fecha, hora, tipo, tipo_personalizado, descripcion, estado,
          nombre_cliente, vehiculo_info, placa, telefono, created_at,
          cliente_id, vehiculo_id, seguimiento, costo_estimado, registrado_por,
          vehiculos (marca, modelo, placa, anio, clientes (nombre, apellido, telefono))
        `)
        .order('fecha', { ascending: false })
        .limit(200);

      if (error) console.error('Error:', error.message);
      setCitas((data as unknown as CitaServicio[]) || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { 
    loadCitas(); 
    setMounted(true);
  }, [loadCitas]);

  const handleDelete = async (id: string) => {
    if (!can('servicios', 'eliminar')) return alert('No tienes permisos para eliminar servicios.');
    if (!confirm('¿Estás seguro de eliminar este ticket de servicio? Esta acción no se puede deshacer.')) return;
    try {
      const { error } = await withSedeFilter(supabase!.from('servicios')).delete().eq('id', id);
      if (error) throw error;
      setCitas(prev => prev.filter(c => c.id !== id));
      logActivity({
        usuario: user?.nombre || 'Admin',
        modulo: 'Servicios',
        accion: 'Eliminó ticket',
        detalles: `Ticket #${id.slice(0,5)} eliminado.`
      });
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente', confirmada: 'Confirmada',
      en_proceso: 'En Proceso', completada: 'Completada',
      finalizado: 'Finalizado', cancelada: 'Cancelada', cancelado: 'Cancelado'
    };
    return labels[estado] || estado;
  };

  const getTransicionInfo = (viejo: string, nuevo: string) => {
    const trans: Record<string, { accion: string; fmt: string }> = {
      'pendiente->confirmada': { accion: 'Confirmó servicio', fmt: 'Servicio confirmado' },
      'pendiente->en_proceso': { accion: 'Inició servicio', fmt: 'Servicio iniciado' },
      'pendiente->completada': { accion: 'Completó servicio', fmt: 'Servicio completado' },
      'pendiente->cancelada': { accion: 'Canceló servicio', fmt: 'Servicio cancelado' },
      'confirmada->en_proceso': { accion: 'Inició trabajo', fmt: 'Trabajo iniciado' },
      'confirmada->completada': { accion: 'Completó servicio', fmt: 'Servicio completado' },
      'confirmada->cancelada': { accion: 'Canceló servicio', fmt: 'Servicio cancelado' },
      'en_proceso->completada': { accion: 'Finalizó servicio', fmt: 'Servicio finalizado' },
      'en_proceso->cancelada': { accion: 'Canceló servicio', fmt: 'Servicio cancelado' },
    };
    const key = `${viejo}->${nuevo}`;
    if (trans[key]) return trans[key];
    return { accion: `Cambió estado (${getEstadoLabel(viejo)} → ${getEstadoLabel(nuevo)})`, fmt: `Estado cambiado: ${getEstadoLabel(viejo)} → ${getEstadoLabel(nuevo)}` };
  };

  const updateEstado = async (id: string, nuevoEstado: string) => {
    if (!can('servicios', 'editar')) return alert('No tienes permisos para cambiar el estado de los servicios.');
    const cita = citas.find(c => c.id === id);
    if (!cita || cita.estado === nuevoEstado) return;

    try {
      const info = getTransicionInfo(cita.estado, nuevoEstado);
      const newEntry = {
        fecha: new Date().toISOString(),
        accion: info.fmt,
        usuario: user?.nombre || 'Admin',
        tipo: 'sistema'
      };
      const newSeguimiento = [...(cita.seguimiento || []), newEntry];

      const { error } = await withSedeFilter(supabase!.from('servicios'))
        .update({ 
          estado: nuevoEstado, 
          updated_at: new Date().toISOString(),
          seguimiento: newSeguimiento
        })
        .eq('id', id);

      if (error) throw error;
      
      setCitas(prev => prev.map(c => c.id === id ? { ...c, estado: nuevoEstado, seguimiento: newSeguimiento } : c));
      
      const clienteObj = cita.vehiculos?.clientes ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}` : (cita.nombre_cliente || 'Cliente');
      const sedeName = 'Carrizal (Principal)';
      
      logActivity({
        usuario: user?.nombre || 'Admin',
        modulo: 'Servicios',
        accion: info.accion,
        detalles: `${info.fmt}: ${clienteObj} en la sede de ${sedeName}`,
        referencia_id: id,
        referencia_tabla: 'servicios'
      });
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  const filtered = citas.filter(c => {
    // 1. Filtro de Texto
    const cliente = c.vehiculos?.clientes ? `${c.vehiculos?.clientes.nombre} ${c.vehiculos?.clientes.apellido}` : c.nombre_cliente || '';
    const vehiculo = c.vehiculos ? `${c.vehiculos.marca} ${c.vehiculos.modelo}` : c.vehiculo_info || '';
    const txt = `${cliente} ${vehiculo} ${c.placa} ${c.descripcion}`.toLowerCase();
    const matchText = search === '' || txt.includes(search.toLowerCase());

    // 2. Filtro de Fecha
    if (!matchText) return false;
    if (dateFilter === 'todos') return true;

    const citaDate = new Date(c.fecha);
    const now = new Date();
    
    if (dateFilter === 'hoy') {
      return citaDate.toISOString().split('T')[0] === getLocalISODate();
    }
    
    if (dateFilter === 'semana') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return citaDate >= weekAgo;
    }

    if (dateFilter === 'mes') {
      const monthAgo = new Date();
      monthAgo.setMonth(now.getMonth() - 1);
      return citaDate >= monthAgo;
    }

    return true;
  });

  const handleDualPrint = () => {
    if (selectedForDual.length === 0) return;
    
    const selectedCitas = citas.filter(c => selectedForDual.includes(c.id));
    const dataList = selectedCitas.map(cita => {
      const clientName = cita.vehiculos?.clientes ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}` : cita.nombre_cliente || 'CONSUMIDOR FINAL';
      const vehicleStr = cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}` : cita.vehiculo_info || '---';
      
      return {
        id: cita.id,
        fecha: cita.fecha,
        cliente: clientName,
        vehiculo: vehicleStr,
        items: [{
          descripcion: (cita.tipo === 'otro' ? 'Servicio General' : `Servicio de ${cita.tipo}`).toUpperCase(),
          cantidad: 1,
          precio_unitario: cita.costo_estimado || 0,
          total: cita.costo_estimado || 0
        }],
        total: cita.costo_estimado || 0,
        tasa_bcv: globalBcvRate || 518.0, 
        total_ves: (cita.costo_estimado || 0) * (globalBcvRate || 518.0)
      };
    });

    generateInvoicePDF(dataList, { mode: 'dual', currencyMode: 'dual' });
    setSelectedForDual([]);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      
      {/* ── Glass Toolbar ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-lg shadow-primary/10">
            <Wrench className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
              Servicios
            </h1>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {loading ? 'Sincronizando...' : `${filtered.length} tickets activos en esta sede`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              placeholder="Buscar cliente, placa, falla..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
            {[
              { id: 'hoy', label: 'Hoy' },
              { id: 'semana', label: '7d' },
              { id: 'mes', label: '30d' },
              { id: 'todos', label: 'Todo' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setDateFilter(f.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  dateFilter === f.id ? "bg-primary/20 text-primary shadow-inner" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1">
            <button 
              onClick={() => setViewMode('kanban')}
              className={cn("p-2 rounded-xl transition-all", viewMode === 'kanban' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-xl transition-all", viewMode === 'list' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button 
            onClick={() => setShowNewModal(true)}
            className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 px-6 shadow-xl shadow-primary/20 gap-2"
          >
            <Plus className="w-4 h-4" /> Nueva Orden
          </Button>

          <button 
            onClick={loadCitas}
            className="w-11 h-11 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── View Switcher ─────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === 'kanban' ? (
          <motion.div 
            key="kanban"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6"
          >
            {ESTADOS.map(estado => (
              <KanbanColumn 
                key={estado}
                estado={estado}
                items={filtered.filter(c => c.estado === estado)}
                onEdit={setEditCita}
                onDelete={handleDelete}
                onTracking={setTrackingCita}
                onInvoice={setInvoiceCita}
                onMove={updateEstado}
                selectedForDual={selectedForDual}
                setSelectedForDual={setSelectedForDual}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden"
          >
             <ListView 
              items={filtered} 
              onEdit={setEditCita} 
              onDelete={handleDelete} 
              onTracking={setTrackingCita}
              onInvoice={setInvoiceCita}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Dual Print Bar ──────────────────────────── */}
      <AnimatePresence>
        {selectedForDual.length > 0 && (
          <motion.div 
            key="dual-print-bar"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] w-full max-w-xl px-4"
          >
            <div className="bg-black/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-[0_30px_60px_rgba(0,0,0,0.8)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-widest">Impresión Dual</p>
                  <p className="text-[10px] text-muted-foreground font-bold">
                    {selectedForDual.length === 1 
                      ? '1 factura seleccionada (2 copias)' 
                      : '2 facturas seleccionadas (lado a lado)'}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedForDual([])}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-muted-foreground hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <Button 
                  onClick={handleDualPrint}
                  disabled={selectedForDual.length > 2}
                  className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-[10px] uppercase h-10 px-6"
                >
                  Generar PDF {selectedForDual.length === 2 && 'Dual'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ────────────────────────────────────────────── */}
      {showNewModal && <ServiceFormModal onClose={() => { setShowNewModal(false); loadCitas(); }} />}
      {editCita && <ServiceFormModal cita={editCita} onClose={() => { setEditCita(null); loadCitas(); }} />}
      {trackingCita && <TrackingModal cita={trackingCita} onClose={() => { setTrackingCita(null); loadCitas(); }} />}
      {invoiceCita && <InvoiceModal cita={invoiceCita} citas={citas} inventory={inventory} onClose={() => { setInvoiceCita(null); loadCitas(); }} globalBcvRate={globalBcvRate} />}
    </div>
  );
}

// ── Kanban Components ──────────────────────────────────────────
function KanbanColumn({ estado, items, onEdit, onDelete, onTracking, onInvoice, onMove, selectedForDual, setSelectedForDual }: any) {
  const cfg = ESTADO_CONFIG[estado];
  const Icon = cfg.icon;

  return (
    <div 
      id={`kanban-col-${estado}`}
      className="flex flex-col gap-4 min-h-[500px] rounded-[32px] p-2 transition-colors duration-300"
    >
      <div className={cn("flex items-center justify-between p-3 rounded-2xl border bg-black/20", cfg.bg)}>
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", cfg.color)} />
          <span className={cn("text-xs font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
        </div>
        <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-full text-muted-foreground">{items.length}</span>
      </div>

      <div className="flex-1 space-y-4">
        <AnimatePresence mode="popLayout">
          {items.map((cita: CitaServicio, idx: number) => (
            <ServiceCard 
              key={cita.id || idx}
              cita={cita} 
              onEdit={onEdit} 
              onDelete={onDelete} 
              onTracking={onTracking}
              onInvoice={onInvoice}
              onMove={onMove}
              isSelected={selectedForDual.includes(cita.id)}
              onSelect={(selected: boolean) => {
                if (selected) {
                  if (selectedForDual.length < 2) {
                    setSelectedForDual([...selectedForDual, cita.id]);
                  } else {
                    alert('Solo puedes seleccionar máximo 2 facturas para impresión dual.');
                  }
                } else {
                  setSelectedForDual(selectedForDual.filter((id: string) => id !== cita.id));
                }
              }}
            />
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <div className="h-24 border border-dashed border-white/5 rounded-3xl flex items-center justify-center text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
            Sin {cfg.label}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceCard({ cita, onEdit, onDelete, onTracking, onInvoice, onMove, isSelected, onSelect }: any) {
  const lastUpdate = cita.seguimiento?.[cita.seguimiento.length - 1];

  const currentIndex = ESTADOS.indexOf(cita.estado);
  const prevEstado = currentIndex > 0 ? ESTADOS[currentIndex - 1] : null;
  const nextEstado = currentIndex < ESTADOS.length - 1 ? ESTADOS[currentIndex + 1] : null;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') setIsMobile(window.innerWidth < 768);
  }, []);

  const handleDragEnd = (event: any, info: any) => {
    const x = info.point.x;
    const y = info.point.y;
    
    for (const estado of ESTADOS) {
      const col = document.getElementById(`kanban-col-${estado}`);
      if (col) {
        const rect = col.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          if (estado !== cita.estado) {
            onMove(cita.id, estado);
          }
          break;
        }
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      drag={!isMobile}
      dragSnapToOrigin={true}
      dragElastic={0.05}
      onDragEnd={handleDragEnd}
      className="group relative bg-card/50 border border-border/50 rounded-3xl p-5 hover:border-primary/40 hover:bg-card/80 transition-colors shadow-xl select-none"
    >
      {/* Botones de traslado rápido (Izquierda/Derecha) */}
      <AnimatePresence>
        {prevEstado && (
          <motion.button
            key="prev-estado-btn"
            initial={{ opacity: 0, x: 10 }}
            whileHover={{ scale: 1.2, backgroundColor: '#f59e0b', color: '#000' }}
            animate={{ opacity: 1, x: 0 }}
            onClick={(e) => { e.stopPropagation(); onMove(cita.id, prevEstado); }}
            className="absolute left-[-15px] top-1/2 -translate-y-1/2 z-[60] w-8 h-8 rounded-full bg-black/80 border border-[#f59e0b]/50 text-[#f59e0b] hidden group-hover:flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
        )}
        {nextEstado && (
          <motion.button
            key="next-estado-btn"
            initial={{ opacity: 0, x: -10 }}
            whileHover={{ scale: 1.2, backgroundColor: '#f59e0b', color: '#000' }}
            animate={{ opacity: 1, x: 0 }}
            onClick={(e) => { e.stopPropagation(); onMove(cita.id, nextEstado); }}
            className="absolute right-[-15px] top-1/2 -translate-y-1/2 z-[60] w-8 h-8 rounded-full bg-black/80 border border-[#f59e0b]/50 text-[#f59e0b] hidden group-hover:flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Checkbox de Selección Dual */}
      <div className="absolute top-4 left-4 z-[55]">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="w-5 h-5 rounded-lg border-white/10 bg-black/40 text-primary focus:ring-primary/40 transition-all cursor-pointer accent-primary"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex justify-between items-start mb-4 pl-8">
        <div>
          <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors uppercase tracking-tight">
            {cita.vehiculos?.clientes ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}` : cita.nombre_cliente}
          </h4>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5 flex items-center gap-1 uppercase tracking-widest">
            <Car className="w-3 h-3" /> {cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}` : cita.vehiculo_info}
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(cita)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(cita.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 w-fit italic">
              {cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || cita.tipo}
            </span>
            <span className="text-[9px] text-muted-foreground font-bold mt-1 flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" /> {cita.fecha} · {cita.hora}
            </span>
          </div>
          <span className="text-[10px] font-mono font-black text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
            {cita.vehiculos?.placa || cita.placa}
          </span>
        </div>

        {cita.descripcion && (
          <p className="text-[11px] text-muted-foreground/80 line-clamp-2 italic leading-relaxed">
            "{cita.descripcion}"
          </p>
        )}

        {/* Tracking Summary */}
        {lastUpdate && (
          <div className="pt-2 border-t border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              <span className="text-[9px] font-black text-[#f59e0b] uppercase tracking-widest">Último Reporte</span>
            </div>
            <p className="text-[10px] text-foreground/70 font-medium truncate italic">
              {lastUpdate.accion}
            </p>
          </div>
        )}

        {/* Registrado por */}
        {cita.registrado_por && (
          <div className="pt-1">
            <p className="text-[9px] text-muted-foreground/50 font-medium">
              Registrado por: <span className="text-foreground/60">{cita.registrado_por}</span>
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
        <button 
          onClick={() => onTracking(cita)}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-[#f59e0b] transition-all"
        >
          <Activity className="w-3.5 h-3.5" /> Bitácora
        </button>

        <div className="flex gap-2">
           <button 
            onClick={() => onInvoice(cita)}
            className="p-1.5 rounded-lg bg-[#f59e0b]/10 hover:bg-[#f59e0b] text-[#f59e0b] hover:text-black transition-all shadow-lg shadow-[#f59e0b]/5"
           >
             <Banknote className="w-3.5 h-3.5" />
           </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── List View Component ──────────────────────────────────────
function ListView({ items, onEdit, onDelete, onTracking, onInvoice }: any) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-white/5 border-b border-white/5">
          <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            <th className="px-6 py-4">Servicio / Cliente</th>
            <th className="px-6 py-4">Vehículo</th>
            <th className="px-6 py-4">Estado</th>
            <th className="px-6 py-4">Progreso</th>
            <th className="px-6 py-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {items.map((cita: CitaServicio, idx: number) => {
            const cfg = ESTADO_CONFIG[cita.estado] || ESTADO_CONFIG.pendiente;
            const progress = cita.seguimiento?.[cita.seguimiento.length - 1]?.progreso || 0;
            return (
              <tr key={cita.id || idx} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", cfg.bg)}>
                      <Wrench className={cn("w-3.5 h-3.5", cfg.color)} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {cita.vehiculos?.clientes ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}` : cita.nombre_cliente}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || cita.tipo}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs text-foreground/80 font-medium">
                    {cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}` : cita.vehiculo_info}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">{cita.vehiculos?.placa || cita.placa}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-black uppercase border", cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="w-32">
                    <div className="flex justify-between text-[9px] mb-1">
                      <span className="text-primary font-bold">{progress}%</span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onTracking(cita)} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground"><Activity className="w-4 h-4" /></button>
                    <button onClick={() => onEdit(cita)} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => onInvoice(cita)} className="p-2 rounded-xl hover:bg-white/5 text-primary"><Banknote className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Service Form Modal (Create/Edit) ──────────────────────────
function ServiceFormModal({ cita, onClose }: { cita?: CitaServicio; onClose: () => void }) {
  const [formData, setFormData] = useState({
    nombre_cliente: cita?.nombre_cliente || cita?.vehiculos?.clientes?.nombre || '',
    telefono: cita?.telefono || cita?.vehiculos?.clientes?.telefono || '',
    vehiculo_info: cita?.vehiculo_info || (cita?.vehiculos ? `${cita?.vehiculos.marca} ${cita?.vehiculos.modelo}` : ''),
    placa: cita?.placa || cita?.vehiculos?.placa || '',
    tipo: cita?.tipo || 'otro',
    descripcion: cita?.descripcion || '',
    costo_estimado: cita?.costo_estimado?.toString() || '',
  });
  const [encargados, setEncargados] = useState<{ nombre: string; rol: 'mecanico' | 'jefe_taller' }[]>([]);
  const [staffSuggestions, setStaffSuggestions] = useState<{ nombre: string; rol: string }[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [showStaffResults, setShowStaffResults] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(cita?.cliente_id || null);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string | null>(cita?.vehiculo_id || null);
  const [customServicio, setCustomServicio] = useState(cita?.tipo_personalizado || '');
  const [isCustomServicio, setIsCustomServicio] = useState(!!cita?.tipo_personalizado);
  const [allClientes, setAllClientes] = useState<any[]>([]);
  const [filteredClientes, setFilteredClientes] = useState<any[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAppStore();

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;
      // Fetch Clients
      const { data: clients } = await withSedeFilter(supabase.from('clientes'))
        .select('id, nombre, apellido, telefono, vehiculos(id, marca, modelo, placa)');
      if (clients) setAllClientes(clients);

      // Fetch Staff from Users (Filtered by Sede automatically by withSedeFilter)
      const { data: users } = await withSedeFilter(supabase.from('usuarios'))
        .select('nombre, rol')
        .in('rol', ['mecanico', 'mecanico_acceso', 'jefe_taller', 'jefe_taller_acceso', 'admin', 'empleado']);
      
      const suggestions = (users || []).map((u: any) => {
        let encargadoRol: 'mecanico' | 'jefe_taller' = 'mecanico';
        if (u.rol === 'jefe_taller' || u.rol === 'jefe_taller_acceso') encargadoRol = 'jefe_taller';
        else if (u.rol === 'mecanico' || u.rol === 'mecanico_acceso') encargadoRol = 'mecanico';
        return { nombre: u.nombre, rol: encargadoRol };
      });
      
      // Unique by name
      const uniqueSuggestions = suggestions.filter((v: any, i: number, a: any[]) => 
        a.findIndex((t: any) => t.nombre === v.nombre) === i
      );
      setStaffSuggestions(uniqueSuggestions);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (formData.nombre_cliente.length > 1 && !cita) {
      const results = allClientes.filter(c => 
        `${c.nombre} ${c.apellido}`.toLowerCase().includes(formData.nombre_cliente.toLowerCase())
      );
      setFilteredClientes(results);
      setShowClientResults(results.length > 0);
    } else {
      setShowClientResults(false);
    }
  }, [formData.nombre_cliente, allClientes, cita]);

  const selectCliente = (c: any) => {
    const mainVehiculo = c.vehiculos?.[0];
    setSelectedClienteId(c.id);
    setSelectedVehiculoId(mainVehiculo?.id || null);
    setFormData({
      ...formData,
      nombre_cliente: `${c.nombre} ${c.apellido}`,
      telefono: c.telefono || '',
      vehiculo_info: mainVehiculo ? `${mainVehiculo.marca} ${mainVehiculo.modelo}` : '',
      placa: mainVehiculo ? mainVehiculo.placa : ''
    });
    setShowClientResults(false);
  };

  const handleSave = async () => {
    if (!supabase) return;
    if (!formData.nombre_cliente || !formData.vehiculo_info) {
      alert('Campos obligatorios incompletos');
      return;
    }
    setIsSaving(true);
    try {
      let finalClienteId = selectedClienteId;
      let finalVehiculoId = selectedVehiculoId;

      // 1. Register New Staff in DB (explicitly)
      const newEncargadosPromises = encargados.map(async (e) => {
        // Check if this person already exists in staffSuggestions (which includes usuarios)
        const exists = staffSuggestions.some(s => s.nombre.toLowerCase() === e.nombre.toLowerCase());
        if (!exists) {
          const { currentSede } = useSedeStore.getState();
          const timestamp = Date.now();
          const username = `${e.nombre.replace(/\s+/g, '_').toLowerCase()}_${timestamp}`;
          
          const res = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: e.nombre,
              email: `${username}@lycosteam.internal`,
              password_hash: 'NO_ACCESS_STAFF',
              rol: e.rol,
              activo: false,
              sede_id: currentSede?.id || ''
            })
          });
          
          if (!res.ok) {
            const errData = await res.json();
            console.error('Error auto-registering staff via API:', errData.error);
          }
        }
      });
      await Promise.all(newEncargadosPromises);

      if (!cita?.id) {
        // Automatic registration for NEW orders
        // 1. Manage Client
        if (!finalClienteId) {
          const names = formData.nombre_cliente.trim().split(' ');
          const nombre = names[0];
          const apellido = names.slice(1).join(' ') || '—';
          
          const { data: newClient, error: clientErr } = await withSedeFilter(supabase.from('clientes'))
            .insert(withSedeInsert({
              nombre,
              apellido,
              telefono: formData.telefono,
              notas: 'Auto-registrado desde Orden de Servicio'
            }))
            .select()
            .single();
          
          if (clientErr) throw clientErr;
          finalClienteId = newClient.id;
        }

        // 2. Manage Vehicle - check if exists by placa first
        if (!finalVehiculoId && formData.placa) {
          const { data: existingVeh } = await supabase.from('vehiculos')
            .select('id, cliente_id')
            .eq('placa', formData.placa)
            .maybeSingle();

          if (existingVeh) {
            finalVehiculoId = existingVeh.id;
            if (!finalClienteId) finalClienteId = existingVeh.cliente_id;
          } else if (finalClienteId) {
            const names = formData.vehiculo_info.trim().split(' ');
            const marca = names[0];
            const modelo = names.slice(1).join(' ') || '—';
            const yearMatch = formData.vehiculo_info.match(/\b(19\d\d|20\d\d)\b/);
            const anio = yearMatch ? parseInt(yearMatch[0]) : 2025;

            const { data: newVehiculo, error: vehErr } = await withSedeFilter(supabase.from('vehiculos'))
              .insert(withSedeInsert({
                cliente_id: finalClienteId,
                marca,
                modelo,
                placa: formData.placa,
                anio,
                estado: 'en_servicio'
              }))
              .select()
              .single();
            
            if (vehErr) throw vehErr;
            finalVehiculoId = newVehiculo.id;
          }
        }
      }

      // ── Ensure vehicle exists for both CREATE and UPDATE ───────
      if (!finalVehiculoId && formData.placa) {
        const { data: existingVeh } = await supabase.from('vehiculos')
          .select('id, cliente_id')
          .eq('placa', formData.placa)
          .maybeSingle();

        if (existingVeh) {
          finalVehiculoId = existingVeh.id;
          if (!finalClienteId) finalClienteId = existingVeh.cliente_id;
        } else if (finalClienteId || cita?.cliente_id) {
          const ownerId = finalClienteId || cita?.cliente_id;
          const names = formData.vehiculo_info.trim().split(' ');
          const marca = names[0] || 'No especificado';
          const modelo = names.slice(1).join(' ') || '—';
          const yearMatch = formData.vehiculo_info.match(/\b(19\d\d|20\d\d)\b/);
          const anio = yearMatch ? parseInt(yearMatch[0]) : 2025;

          const { data: newVehiculo, error: vehErr } = await withSedeFilter(supabase.from('vehiculos'))
            .insert(withSedeInsert({
              cliente_id: ownerId,
              marca,
              modelo,
              placa: formData.placa || 'SIN-PLACA',
              anio,
              estado: 'en_servicio'
            }))
            .select()
            .single();

          if (vehErr) throw vehErr;
          finalVehiculoId = newVehiculo.id;
        }
      }

      // ── Last-resort fallback: if still null and editing, keep the original ──
      if (!finalVehiculoId && cita?.vehiculo_id) {
        finalVehiculoId = cita.vehiculo_id;
      }

      if (cita?.id) {
        // UPDATE
        const finalTipo = isCustomServicio ? 'otro' : formData.tipo;
        const updatePayload: any = {
          nombre_cliente: formData.nombre_cliente,
          telefono: formData.telefono,
          vehiculo_info: formData.vehiculo_info,
          placa: formData.placa,
          cliente_id: finalClienteId,
          vehiculo_id: finalVehiculoId,
          tipo: finalTipo,
          tipo_personalizado: isCustomServicio ? customServicio.trim() : null,
          descripcion: formData.descripcion || '',
          costo_estimado: parseFloat(formData.costo_estimado) || 0,
          updated_at: new Date().toISOString()
        };
        // Avoid sending empty strings for optional fields
        if (!updatePayload.tipo_personalizado) delete updatePayload.tipo_personalizado;
        if (!updatePayload.placa) delete updatePayload.placa;
        if (!updatePayload.telefono) delete updatePayload.telefono;

        const { error } = await withSedeFilter(supabase!.from('servicios'))
          .update(updatePayload)
          .eq('id', cita.id);
        if (error) throw error;
        
        logActivity({
          usuario: user?.nombre || 'Admin',
          modulo: 'Servicios',
          accion: 'Editó ticket',
          detalles: `Editó datos del ticket #${cita.id.slice(0,5)}`
        });
      } else {
        // CREATE
        const now = new Date();
        if (!finalVehiculoId) {
          throw new Error('No se pudo determinar el vehículo. Asegúrate de escribir la placa o seleccionar un cliente con vehículo registrado.');
        }
        const finalTipoServicio = isCustomServicio ? 'otro' : formData.tipo;
        const payload: any = {
          nombre_cliente: formData.nombre_cliente,
          telefono: formData.telefono,
          vehiculo_info: formData.vehiculo_info,
          placa: formData.placa,
          cliente_id: finalClienteId,
          vehiculo_id: finalVehiculoId,
          tipo: finalTipoServicio,
          tipo_personalizado: isCustomServicio ? customServicio.trim() : null,
          descripcion: formData.descripcion || '',
          registrado_por: user?.nombre || 'Admin',
          fecha: getLocalISODate(),
          hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          estado: 'pendiente',
          costo_estimado: parseFloat(formData.costo_estimado) || 0,
          notas: encargados.length > 0 
            ? `Encargados: ${encargados.map(e => `${e.nombre} (${e.rol === 'jefe_taller' ? 'Jefe' : 'Mecánico'})`).join(', ')}`
            : '',
          seguimiento: [
            {
              fecha: now.toISOString(),
              accion: 'Orden creada manualmente',
              usuario: user?.nombre || 'Admin',
              tipo: 'sistema',
              progreso: 0
            },
            ...encargados.map(e => ({
              fecha: now.toISOString(),
              accion: `Encargado asignado: ${e.nombre} (${e.rol === 'jefe_taller' ? 'Jefe de Taller' : 'Mecánico'})`,
              usuario: user?.nombre || 'Admin',
              tipo: 'sistema'
            }))
          ]
        };
        if (!payload.tipo_personalizado) delete payload.tipo_personalizado;
        if (!payload.placa) delete payload.placa;
        if (!payload.telefono) delete payload.telefono;
        const { error } = await withSedeFilter(supabase!.from('servicios')).insert(withSedeInsert(payload));
        if (error) throw error;

        logActivity({
          usuario: user?.nombre || 'Admin',
          modulo: 'Servicios',
          accion: 'Nueva orden',
          detalles: `Creada orden manual para ${formData.nombre_cliente} (IDs: C:${finalClienteId} V:${finalVehiculoId})`
        });
      }
      onClose();
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-center items-start sm:items-center bg-black/60 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-xl shadow-2xl flex flex-col my-auto sm:my-0 rounded-[24px] sm:rounded-[32px] overflow-hidden sm:max-h-[90vh]">
        <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              {cita ? <Edit3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> : <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />}
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
                {cita ? 'Editar Orden de Servicio' : 'Nueva Orden de Servicio'}
              </h3>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Gesti&oacute;n de Taller Lycos Team</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl hover:bg-muted/50 flex items-center justify-center transition-all shrink-0"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="p-4 sm:p-8 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div className="col-span-2 sm:col-span-1 space-y-2 relative">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Cliente Principal</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="Nombre y Apellido"
                value={formData.nombre_cliente}
                onChange={e => {
                  setFormData({...formData, nombre_cliente: e.target.value});
                  setSelectedClienteId(null);
                  setSelectedVehiculoId(null);
                }}
                onBlur={() => setTimeout(() => setShowClientResults(false), 200)}
                onFocus={() => formData.nombre_cliente.length > 1 && setShowClientResults(true)}
              />
              {showClientResults && (
                <div className="absolute top-full left-0 right-0 z-[150] mt-1 bg-popover border border-border rounded-xl sm:rounded-2xl shadow-2xl max-h-40 overflow-y-auto no-scrollbar py-1">
                  {filteredClientes.map((c, idx) => (
                    <button
                      key={c.id || idx}
                      onClick={() => selectCliente(c)}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors group"
                    >
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{c.nombre} {c.apellido}</p>
                      <p className="text-[10px] text-muted-foreground">{c.telefono}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Tel&eacute;fono Contacto</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="0424 123 4567"
                value={formData.telefono}
                onChange={e => setFormData({...formData, telefono: e.target.value})}
              />
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Veh&iacute;culo / Modelo</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="Ej: Toyota Corolla 2015"
                value={formData.vehiculo_info}
                onChange={e => {
                  setFormData({...formData, vehiculo_info: e.target.value});
                  setSelectedVehiculoId(null);
                }}
              />
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">N&uacute;mero de Placa</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="ABC-123"
                value={formData.placa}
                onChange={e => setFormData({...formData, placa: e.target.value.toUpperCase()})}
              />
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Tipo de Servicio</label>
              <div className="flex gap-2">
                <select 
                  className="flex-1 bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none"
                  value={isCustomServicio ? 'custom' : formData.tipo}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setIsCustomServicio(true);
                    } else {
                      setIsCustomServicio(false);
                      setFormData({...formData, tipo: e.target.value});
                    }
                  }}
                >
                  {Object.entries(SERVICIO_LABELS).map(([k,v]) => <option key={k} value={k} className="bg-card">{v}</option>)}
                  <option value="custom" className="bg-card font-bold text-primary">+ Personalizado...</option>
                </select>
              </div>
              {isCustomServicio && (
                <motion.input 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full mt-2 bg-muted/50 border border-primary/30 rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  placeholder="Escribe el tipo de servicio..."
                  value={customServicio}
                  onChange={e => setCustomServicio(e.target.value)}
                />
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Costo Estimado ($)</label>
              <input 
                type="number"
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="0.00"
                value={formData.costo_estimado}
                onChange={e => setFormData({...formData, costo_estimado: e.target.value})}
              />
            </div>

            <div className="col-span-2 space-y-3">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Personal a Cargo (Jefe / Mec&aacute;nicos)</label>
              
              <div className="flex flex-wrap gap-2 mb-2">
                {encargados.map((e, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/30 border border-border pl-3 pr-1 py-1 rounded-xl group animate-in zoom-in-95 duration-200">
                    <span className="text-[11px] font-bold text-foreground">{e.nombre}</span>
                    <button 
                      type="button"
                      onClick={() => {
                        const next = [...encargados];
                        next[idx].rol = e.rol === 'jefe_taller' ? 'mecanico' : 'jefe_taller';
                        setEncargados(next);
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all",
                        e.rol === 'jefe_taller' ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                      )}
                    >
                      {e.rol === 'jefe_taller' ? 'Jefe' : 'Mec&aacute;nico'}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setEncargados(encargados.filter((_, i) => i !== idx))}
                      className="w-6 h-6 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                <input 
                  className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl pl-10 pr-3 py-2.5 sm:pl-12 sm:pr-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  placeholder="Buscar o agregar encargado..."
                  value={staffSearch}
                  onChange={e => {
                    setStaffSearch(e.target.value);
                    setShowStaffResults(true);
                  }}
                  onFocus={() => setShowStaffResults(true)}
                  onBlur={() => setTimeout(() => setShowStaffResults(false), 200)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && staffSearch.trim()) {
                      e.preventDefault();
                      if (!encargados.some(enc => enc.nombre === staffSearch.trim())) {
                        setEncargados([...encargados, { nombre: staffSearch.trim(), rol: 'mecanico' }]);
                      }
                      setStaffSearch('');
                    }
                  }}
                />
                {showStaffResults && (
                  <div className="absolute top-full left-0 right-0 z-[150] mt-2 bg-popover border border-border rounded-2xl shadow-2xl max-h-48 overflow-y-auto no-scrollbar py-2">
                    {staffSearch && !staffSuggestions.some(s => s.nombre.toLowerCase().includes(staffSearch.toLowerCase())) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEncargados([...encargados, { nombre: staffSearch, rol: 'mecanico' }]);
                          setStaffSearch('');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted transition-colors group flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <Plus className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground uppercase italic">Agregar &quot;{staffSearch}&quot;</p>
                          <p className="text-[10px] text-muted-foreground">Nuevo personal de taller</p>
                        </div>
                      </button>
                    )}
                    {staffSuggestions
                      .filter(s => s.nombre.toLowerCase().includes(staffSearch.toLowerCase()) && !encargados.some(e => e.nombre === s.nombre))
                      .map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setEncargados([...encargados, { nombre: s.nombre, rol: (s.rol === 'jefe_taller' ? 'jefe_taller' : 'mecanico') }]);
                            setStaffSearch('');
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-muted transition-colors group flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{s.nombre}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{s.rol}</p>
                          </div>
                          <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Descripci&oacute;n de la Falla / Trabajo</label>
              <textarea 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all min-h-[80px] sm:min-h-[100px] resize-none"
                placeholder="Escribe aqu&iacute; los detalles t&eacute;cnicos..."
                value={formData.descripcion}
                onChange={e => setFormData({...formData, descripcion: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
          <button onClick={onClose} className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold text-muted-foreground hover:bg-muted/50 transition-all text-center">Cancelar</button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="w-full sm:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 sm:px-10 h-11 sm:h-12 text-xs sm:text-sm shadow-2xl shadow-primary/20 gap-2 flex items-center justify-center"
          >
            {isSaving ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <BadgeCheck className="w-4 h-4 sm:w-5 sm:h-5" />}
            {cita ? 'Actualizar Orden' : 'Crear Orden Ahora'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tracking Modal ──────────────────────────────────────────
function TrackingModal({ cita, onClose }: { cita: CitaServicio; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('nota');
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAppStore();

  const QUICK_ACTIONS = [
    { label: 'Recepción', text: 'Vehículo recibido. Inspección inicial completada.', icon: Car },
    { label: 'Desarmando', text: 'Iniciado proceso de desarmado/inspección interna.', icon: Wrench },
    { label: 'Diagnóstico', text: 'Diagnóstico finalizado. Reporte técnico listo.', icon: Info },
    { label: 'Aprobado', text: 'Cliente aprobó el presupuesto. Iniciando reparación.', icon: BadgeCheck },
    { label: 'Repuestos', text: 'Piezas solicitadas. A la espera de stock.', icon: Tag },
    { label: 'Ensamble', text: 'Finalizando armado del vehículo.', icon: LayoutGrid },
    { label: 'Prueba', text: 'Realizando escaneo final y prueba de ruta.', icon: Activity },
    { label: 'Entrega', text: 'Vehículo impecable. Listo para entregar al cliente.', icon: CheckCircle },
  ];

  const CATEGORIES: Record<string, { icon: React.ElementType, color: string, label: string }> = {
    nota: { icon: MessageSquare, color: 'text-blue-400', label: 'Nota' },
    mecanica: { icon: Wrench, color: 'text-orange-400', label: 'Mecánica' },
    repuesto: { icon: RefreshCw, color: 'text-amber-400', label: 'Repuesto' },
    alerta: { icon: AlertCircle, color: 'text-red-400', label: 'Alerta' },
  };

  const addTrackingEntry = async (customText?: string) => {
    const actionText = customText || comment;
    if (!actionText.trim()) return;
    
    setIsSaving(true);
    try {
      const newEntry = {
        fecha: new Date().toISOString(),
        accion: actionText,
        usuario: user?.nombre || 'Admin',
        tipo: customText ? 'sistema' : category,
      };
      
      const newSeguimiento = [...(cita.seguimiento || []), newEntry];
      
      const { error } = await withSedeFilter(supabase!.from('servicios'))
        .update({ 
          seguimiento: newSeguimiento,
          ...(actionText.toLowerCase().includes('entrega') ? { estado: 'completada' } : {})
        })
        .eq('id', cita.id);
      
      if (error) throw error;
      setComment('');
      const newState = actionText.toLowerCase().includes('entrega') ? 'completada' : cita.estado;
      
      // Update the local state properly to trigger re-renders
      // Ignore typescript error locally by using the setCitas from upper scope or a callback
      cita.seguimiento = newSeguimiento;
      if (newState !== cita.estado) {
        cita.estado = newState;
      }
      
      // Force a refresh from the loadCitas hook indirectly if needed, 
      // but modifying cita object works for now in this context since onClose calls loadCitas.
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/90 backdrop-blur-2xl p-0 sm:p-4">
      <div className="bg-[#0a0a0a] border border-white/5 w-full max-w-5xl h-full sm:h-[85vh] shadow-[0_0_80px_rgba(0,0,0,1)] flex flex-col overflow-hidden sm:rounded-[40px]">
        
        {/* Lycos Premium Header */}
        <div className="p-8 border-b border-white/5 bg-gradient-to-r from-[#f59e0b]/10 via-transparent to-transparent flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[24px] bg-gradient-to-br from-[#f59e0b] to-[#ea580c] flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <Activity className="w-8 h-8 text-black" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic" style={{ fontFamily: 'Syne, sans-serif' }}>
                Bitácora de Servicio
              </h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-md font-mono text-muted-foreground uppercase tracking-widest border border-white/5">
                  ID: {cita.id.slice(0,8)}
                </span>
                <span className="text-[10px] text-[#f59e0b] font-black uppercase tracking-widest">
                  {cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}` : cita.vehiculo_info} · {cita.vehiculos?.placa || cita.placa}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all group">
            <X className="w-6 h-6 text-muted-foreground group-hover:text-white transition-colors" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          
          {/* Timeline Panel - Left */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-white/[0.01]">
             <div className="max-w-2xl mx-auto space-y-8">
                {(cita.seguimiento || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center opacity-20">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-white flex items-center justify-center mb-6">
                      <Clock className="w-10 h-10" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.4em]">Sin registros aún</p>
                  </div>
                ) : (
                  <div className="relative pl-10 space-y-12 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[3px] before:bg-gradient-to-b before:from-[#f59e0b] before:via-white/10 before:to-transparent">
                    {(cita.seguimiento || []).slice().reverse().map((entry, i) => {
                      const cat = CATEGORIES[entry.tipo] || CATEGORIES.nota;
                      const CatIcon = cat.icon;
                      return (
                        <div key={i} className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
                          <div className="absolute -left-[45px] top-1 w-12 h-12 rounded-[18px] bg-[#0a0a0a] border-4 border-white/5 flex items-center justify-center z-10 shadow-2xl transition-transform group-hover:scale-110 group-hover:border-[#f59e0b]/30">
                            <CatIcon className={cn("w-5 h-5", cat.color)} />
                          </div>
                          
                          <div className="bg-white/[0.03] border border-white/5 rounded-[28px] p-6 group-hover:bg-white/[0.05] transition-all relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                              <span className="text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest bg-black/40 border border-white/5 text-muted-foreground">
                                {new Date(entry.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(entry.fecha).toLocaleDateString()}
                              </span>
                              <span className={cn("text-[10px] font-black uppercase tracking-widest italic", cat.color)}>
                                {cat.label}
                              </span>
                            </div>
                            
                            <p className="text-base text-slate-100 font-bold leading-relaxed mb-4">
                              {entry.accion}
                            </p>
                            
                            <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                               <div className="w-6 h-6 rounded-full bg-[#f59e0b] flex items-center justify-center">
                                 <User className="w-3 h-3 text-black" />
                               </div>
                               <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                 Registrado por {entry.usuario}
                               </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
             </div>
          </div>

          {/* Action Panel - Right */}
          <div className="w-full lg:w-96 bg-black/40 p-8 flex flex-col gap-8 border-t lg:border-t-0 lg:border-l border-white/5 overflow-y-auto no-scrollbar">
            
            {/* Quick States */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] mb-6 border-l-2 border-[#f59e0b] pl-3">Estados Rápidos</p>
              <div className="grid grid-cols-1 gap-3">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => addTrackingEntry(action.text)}
                    className="flex items-center gap-4 p-4 rounded-[20px] bg-white/[0.03] border border-white/5 hover:bg-gradient-to-r hover:from-[#f59e0b] hover:to-[#ea580c] hover:text-black group transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-black/10">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest">{action.label}</p>
                      <p className="text-[10px] opacity-60 font-medium group-hover:opacity-100">Click para registrar</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Entry */}
            <div className="space-y-4 pt-8 border-t border-white/5">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] mb-6 border-l-2 border-[#f59e0b] pl-3">Entrada Manual</p>
              
              <div className="flex gap-2">
                {Object.entries(CATEGORIES).map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => setCategory(id)}
                    className={cn(
                      "flex-1 h-12 rounded-2xl flex items-center justify-center border transition-all",
                      category === id ? "bg-[#f59e0b] text-black border-[#f59e0b]" : "bg-white/5 border-white/10 text-muted-foreground"
                    )}
                  >
                    <info.icon className="w-5 h-5" />
                  </button>
                ))}
              </div>

              <textarea 
                className="w-full bg-white/5 border border-white/10 rounded-[24px] px-5 py-4 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/40 min-h-[120px] resize-none transition-all"
                placeholder="Escribe un reporte detallado..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />

              <Button 
                onClick={() => addTrackingEntry()} 
                disabled={isSaving || !comment.trim()} 
                className="w-full h-16 rounded-[24px] bg-[#f59e0b] hover:bg-[#fbbf24] text-black font-black text-sm uppercase tracking-widest shadow-[0_10px_30px_rgba(245,158,11,0.2)] gap-3"
              >
                {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <BadgeCheck className="w-6 h-6" />}
                Registrar Bitácora
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Modal (Keep as is but polish colors) ───────────────
function InvoiceModal({ cita, citas, inventory, onClose, globalBcvRate }: { cita: CitaServicio; citas: CitaServicio[]; inventory: any[]; onClose: () => void; globalBcvRate?: number }) {
  const [clientName, setClientName] = useState(cita.vehiculos?.clientes
    ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}`
    : cita.nombre_cliente || 'Consumidor Final');

  const [vehicleStr, setVehicleStr] = useState(cita.vehiculos
    ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo} (${cita.vehiculos.placa})`
    : cita.vehiculo_info || '—');
  const [secondCita, setSecondCita] = useState<CitaServicio | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);

  const [items, setItems] = useState(() => {
    const match = inventory.find((i: any) => 
      (cita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
      i.nombre.toLowerCase().trim().includes((cita.descripcion || '').toLowerCase().trim()) ||
      (cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
    );
    const price = match?.precio_usd || cita.costo_estimado || 0;
    return [{
      descripcion: cita.descripcion || cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || 'Servicio General',
      cantidad: 1,
      precio_unitario: price,
      total: price
    }];
  });

  const [secondItems, setSecondItems] = useState<any[]>([]);
  const [secondClientName, setSecondClientName] = useState('');
  const [secondVehicleStr, setSecondVehicleStr] = useState('');
  const [secondWithIva, setSecondWithIva] = useState(false);

  useEffect(() => {
    if (secondCita) {
      const match = inventory.find((i: any) => 
        (secondCita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
        i.nombre.toLowerCase().trim().includes((secondCita.descripcion || '').toLowerCase().trim()) ||
        (secondCita.tipo_personalizado || SERVICIO_LABELS[secondCita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
      );
      const price = match?.precio_usd || secondCita.costo_estimado || 0;
      setSecondItems([{
        descripcion: secondCita.descripcion || secondCita.tipo_personalizado || SERVICIO_LABELS[secondCita.tipo] || 'Servicio General',
        cantidad: 1,
        precio_unitario: price,
        total: price
      }]);
      setSecondClientName(secondCita.vehiculos?.clientes ? `${secondCita.vehiculos?.clientes.nombre} ${secondCita.vehiculos?.clientes.apellido}` : secondCita.nombre_cliente || 'Consumidor Final');
      setSecondVehicleStr(secondCita.vehiculos ? `${secondCita.vehiculos.marca} ${secondCita.vehiculos.modelo}` : secondCita.vehiculo_info || '---');
      setSecondWithIva(false);
    } else {
      setSecondItems([]);
    }
  }, [secondCita, inventory]);

  const [isSaving, setIsSaving] = useState(false);
  const [withIva, setWithIva] = useState(false);
  const [rates, setRates] = useState({ bcv: globalBcvRate || 0, binance: 0, fetchedAt: '' });
  const [loadingRates, setLoadingRates] = useState(!globalBcvRate);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const resp = await fetch(`/api/rates?t=${Date.now()}`, { cache: 'no-store' });
        const data = await resp.json();
        if (data.bcv) {
          setRates({ bcv: data.bcv, binance: data.binance, fetchedAt: data.fetchedAt });
        }
      } catch (e) {
        console.error('Rates error:', e);
      } finally {
        setLoadingRates(false);
      }
    };
    loadRates();
  }, []);

  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  const ivaAmount = withIva ? subtotal * 0.16 : 0;
  const total = subtotal + ivaAmount;
  const totalVes = total * (rates.bcv || globalBcvRate || 518.0);

  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, f: string, v: any) => {
    const n = [...items];
    const item = { ...n[i], [f]: v };
    if (f === 'cantidad' || f === 'precio_unitario') item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    n[i] = item;
    setItems(n);
  };

  const [payments, setPayments] = useState<Record<string, number>>({
    efectivo_usd: total
  });

  const togglePaymentMethod = (method: string) => {
    const newPayments = { ...payments };
    if (newPayments[method] !== undefined) {
      delete newPayments[method];
    } else {
      newPayments[method] = 0;
    }
    setPayments(newPayments);
  };

  const updatePaymentAmount = (method: string, amount: number) => {
    setPayments({ ...payments, [method]: amount });
  };

  const [printMode, setPrintMode] = useState<'single' | 'dual' | 'diferente'>('dual');
  const [printSide, setPrintSide] = useState<'left' | 'right'>('left');

  const handleDownload = (correlativo?: string) => {
    const data1 = { 
      id: cita.id, 
      correlativo,
      fecha: cita.fecha, 
      cliente: clientName, 
      vehiculo: vehicleStr, 
      items, 
      total, 
      iva_aplicado: withIva,
      tasa_bcv: rates.bcv || globalBcvRate || 518.0,
      total_ves: totalVes,
      notas: cita.descripcion || undefined,
      metodos_pago: payments
    };

    const dataList: any[] = [data1];

    if (printMode === 'dual') {
      // Duplicado de la misma factura
      dataList.push(data1);
    } else if (printMode === 'diferente' && secondCita) {
      const secondSubtotal = secondItems.reduce((sum, item) => sum + (item.total || 0), 0);
      const secondIva = secondWithIva ? secondSubtotal * 0.16 : 0;
      const secondTotal = secondSubtotal + secondIva;

      dataList.push({
        id: secondCita.id,
        fecha: secondCita.fecha,
        cliente: secondClientName,
        vehiculo: secondVehicleStr,
        items: secondItems,
        total: secondTotal,
        iva_aplicado: secondWithIva,
        tasa_bcv: rates.bcv || globalBcvRate || 518.0,
        total_ves: secondTotal * (rates.bcv || globalBcvRate || 518.0),
        notas: secondCita.descripcion || undefined
      });
    }

    generateInvoicePDF(dataList, { mode: printMode, side: printSide, currencyMode: 'dual' });
  };

  const handleFinalizeSale = async () => {
    if (!supabase) return;
    try {
      setIsSaving(true);
      const { data: ventaDia, error: ventaError } = await withSedeFilter(supabase.from('ventas_dia')).insert(withSedeInsert({
        fecha: getLocalISODate(),
        cliente: clientName,
        total_ingresos: total,
        total_servicios: items.length,
        total_clientes: 1,
        desglose: items,
        metodos_pago: payments,
        tasa_cambio: rates.bcv || globalBcvRate || 518.0,
        con_iva: withIva,
        notas: cita.descripcion || 'Servicio de taller',
        creado_por: 'Admin'
      })).select().single();
      if (ventaError) throw ventaError;

      const { error: citaError } = await withSedeFilter(supabase.from('servicios')).update({ estado: 'completada' }).eq('id', cita.id);
      if (citaError) throw citaError;

      let finalCorrelativo = undefined;
      try {
        const facturaRegistro = await registrarFactura({
          tipo: 'servicio',
          modulo_origen: 'servicios',
          referencia_id: ventaDia?.id || cita.id,
          referencia_tabla: 'ventas_dia',
          cliente: clientName,
          vehiculo: vehicleStr,
          total: total,
          moneda: 'USD',
          tasa_cambio: rates.bcv || globalBcvRate || 518.0,
          total_bs: totalVes,
          items: items,
          metodos_pago: payments,
          con_iva: withIva,
          estado: 'pagado',
          notas: cita.descripcion || undefined,
          emitido_por: useAppStore.getState().user?.nombre || 'Admin',
          fecha_emision: getLocalISODate(),
          sede_id: useSedeStore.getState().currentSede?.id || undefined,
        });
        if (facturaRegistro?.correlativo) finalCorrelativo = facturaRegistro.correlativo;
      } catch (e) {
        console.error('Error registering centralized factura:', e);
      }

      logActivity({ usuario: useAppStore.getState().user?.nombre || 'Admin', modulo: 'Servicios', accion: 'Venta Finalizada', detalles: `Venta para ${clientName} por $${total.toFixed(2)}` });
      handleDownload(finalCorrelativo);
      alert('¡Entrega procesada con éxito!');
      onClose();
      const btn = document.getElementById('refresh-btn');
      if (btn) btn.click();
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  const PAYMENT_METHODS = [
    { id: 'efectivo_usd', label: 'Efectivo USD' },
    { id: 'zelle', label: 'Zelle' },
    { id: 'pago_movil', label: 'Pago Móvil' },
    { id: 'punto_de_venta', label: 'Punto de Venta' },
    { id: 'euros', label: 'Euros (€)' },
    { id: 'otro', label: 'Personalizado' },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div className={cn(
        "bg-white rounded-2xl sm:rounded-[32px] w-full shadow-[0_30px_70px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[98vh] border border-white/10 transition-all duration-500",
        secondCita ? "max-w-6xl" : "max-w-2xl"
      )}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 border-b border-gray-100 bg-white gap-4">
          <h2 className="text-sm sm:text-base font-black flex items-center gap-2 text-slate-900 uppercase tracking-tighter">
            <FileText className="w-5 h-5 text-orange-500" /> {secondCita ? 'Facturación Dual' : 'Gestión de Entrega'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setShowSelector(!showSelector)}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border",
                secondCita ? "bg-primary/20 border-primary/30 text-primary" : "bg-gray-50 border-gray-100 text-slate-500 hover:bg-gray-100"
              )}
            >
              <MoveHorizontal className="w-4 h-4" /> 
              {secondCita ? 'Cambiar' : 'Dual'}
            </button>
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 border border-gray-200">
              <button 
                onClick={() => setPrintMode('single')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'single' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Única
              </button>
              <button 
                onClick={() => setPrintMode('dual')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'dual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
                title="Dos copias de la misma factura"
              >
                Dual
              </button>
              <button 
                onClick={() => {
                  setPrintMode('diferente');
                  if (!secondCita) setShowSelector(true);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'diferente' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
                title="Dos facturas diferentes"
              >
                Diferente
              </button>
            </div>

            {printMode === 'single' && (
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 border border-gray-200">
                <button 
                  onClick={() => setPrintSide('left')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    printSide === 'left' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Izq
                </button>
                <button 
                  onClick={() => setPrintSide('right')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    printSide === 'right' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Der
                </button>
              </div>
            )}

            <button 
              onClick={() => handleDownload()}
              className="p-2 sm:p-3 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 border border-orange-400/20"
              title="Descargar Nota"
            >
              <Download className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-gray-50 flex items-center justify-center transition-colors">
              <X className="w-6 h-6 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Dual Print Selector Overlay */}
        <AnimatePresence>
          {showSelector && (
            <motion.div 
              key="selector-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[130] flex items-center justify-center p-4 sm:p-6"
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowSelector(false)} />
              <motion.div 
                key="selector-modal"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-lg bg-white rounded-[32px] shadow-[0_30px_90px_rgba(0,0,0,0.4)] border border-white flex flex-col overflow-hidden max-h-[85%]"
              >
                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-orange-500" /> Segunda Factura
                  </h3>
                  <button onClick={() => setShowSelector(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <div className="p-6 flex flex-col gap-4 overflow-hidden">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      autoFocus
                      className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-slate-100/50 border-none text-xs font-bold text-slate-900 focus:ring-2 focus:ring-orange-500/20"
                      placeholder="Buscar cliente..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {citas.filter(c => c.id !== cita.id && (searchTerm === '' || `${c.nombre_cliente} ${c.vehiculo_info}`.toLowerCase().includes(searchTerm.toLowerCase()))).map((c, idx) => (
                      <button key={c.id || idx} onClick={() => { setSecondCita(c); setShowSelector(false); }} className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border-2 border-transparent hover:border-slate-100 transition-all">
                        <div className="text-left">
                          <p className="text-xs font-black text-slate-900 uppercase italic">{c.nombre_cliente || c.vehiculos?.clientes?.nombre}</p>
                          <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">{c.vehiculo_info || `${c.vehiculos?.marca} ${c.vehiculos?.modelo}`}</p>
                        </div>
                        <p className="text-[10px] font-black text-orange-500 italic">${c.costo_estimado || 0}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="p-4 sm:p-10 overflow-y-auto custom-scrollbar bg-white text-slate-900 font-sans">
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Factura 1 */}
            <div className="flex-1 border border-gray-200 p-6 sm:p-10 rounded-[40px] shadow-sm bg-white relative transition-all duration-500">
               <InvoiceEditor 
                 cita={cita} 
                 clientName={clientName} setClientName={setClientName}
                 vehicleStr={vehicleStr} setVehicleStr={setVehicleStr}
                 items={items} setItems={setItems}
                 withIva={withIva} setWithIva={setWithIva}
                 rates={rates}
                 subtotal={subtotal} ivaAmount={ivaAmount} total={total} totalVes={totalVes}
               />
            </div>

            {/* Factura 2 */}
            {secondCita && (
              <motion.div 
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 border-2 border-orange-500/20 p-6 sm:p-10 rounded-[40px] shadow-2xl shadow-orange-500/5 bg-white relative"
              >
                <div className="absolute -top-3 left-10 bg-orange-500 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Segunda Factura</div>
                <InvoiceEditor 
                   cita={secondCita} 
                   clientName={secondClientName} setClientName={setSecondClientName}
                   vehicleStr={secondVehicleStr} setVehicleStr={setSecondVehicleStr}
                   items={secondItems} setItems={setSecondItems}
                   withIva={secondWithIva} setWithIva={setSecondWithIva}
                   rates={rates}
                   subtotal={secondItems.reduce((sum, item) => sum + (item.total || 0), 0)}
                   ivaAmount={secondWithIva ? secondItems.reduce((sum, item) => sum + (item.total || 0), 0) * 0.16 : 0}
                   total={secondItems.reduce((sum, item) => sum + (item.total || 0), 0) + (secondWithIva ? secondItems.reduce((sum, item) => sum + (item.total || 0), 0) * 0.16 : 0)}
                   totalVes={(secondItems.reduce((sum, item) => sum + (item.total || 0), 0) + (secondWithIva ? secondItems.reduce((sum, item) => sum + (item.total || 0), 0) * 0.16 : 0)) * (rates.bcv || 36.5)}
                 />
              </motion.div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-8 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="hidden sm:flex items-center gap-4 text-slate-400">
             <Info className="w-5 h-5 text-orange-500" />
             <p className="text-[10px] font-bold uppercase tracking-widest leading-none">
               {secondCita ? 'Estás editando dos facturas simultáneamente.' : 'Puedes añadir una segunda factura arriba.'}
             </p>
           </div>
           <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
              <button onClick={onClose} className="w-full sm:w-auto px-8 py-3.5 sm:py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-slate-900 transition-all border border-transparent hover:border-gray-200">
                Cerrar
              </button>
              {cita.estado === 'completada' ? (
                <button 
                  disabled 
                  className="w-full sm:w-auto rounded-2xl bg-green-500 text-white font-black px-8 sm:px-12 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.2)] text-[10px] sm:text-[11px] uppercase tracking-[0.2em] gap-3 flex items-center justify-center transition-all cursor-not-allowed opacity-90"
                >
                  <BadgeCheck className="w-5 h-5 text-white" />
                  Venta Registrada
                </button>
              ) : (
                <button 
                  onClick={handleFinalizeSale} 
                  disabled={isSaving} 
                  className="w-full sm:w-auto rounded-2xl bg-black hover:bg-neutral-800 text-white font-black px-8 sm:px-12 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] text-[10px] sm:text-[11px] uppercase tracking-[0.2em] gap-3 flex items-center justify-center transition-all"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <BadgeCheck className="w-5 h-5 text-orange-500" />}
                  Finalizar {secondCita ? 'Entregas' : 'Entrega'}
                </button>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponent: Invoice Editor ──────────────────────────────
function InvoiceEditor({ 
  cita, clientName, setClientName, vehicleStr, setVehicleStr, 
  items, setItems, withIva, setWithIva, rates, 
  subtotal, ivaAmount, total, totalVes 
}: any) {
  const updateItem = (i: number, f: string, v: any) => {
    const n = [...items];
    const item = { ...n[i], [f]: v };
    if (f === 'cantidad' || f === 'precio_unitario') item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    n[i] = item;
    setItems(n);
  };
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_: any, idx: number) => idx !== i));
  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-0 mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter italic leading-none">LYCOS TEAM</h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Mecánica Integral</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Nota de Entrega #</p>
          <p className="text-base font-black text-slate-900">{cita.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-[10px] text-gray-500 mt-1 font-bold">{cita.fecha}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10 pb-10 border-b border-gray-100">
        <div className="space-y-1">
          <p className="text-[9px] font-black text-gray-300 uppercase mb-2">Cliente / Titular:</p>
          <input className="w-full text-sm font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent placeholder:text-gray-200" value={clientName} onChange={e => setClientName(e.target.value)} />
        </div>
        <div className="text-left sm:text-right space-y-1">
          <p className="text-[9px] font-black text-gray-300 uppercase mb-2">Datos del Vehículo:</p>
          <input className="w-full text-left sm:text-right text-sm font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent placeholder:text-gray-200" value={vehicleStr} onChange={e => setVehicleStr(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs mb-10 min-w-[400px]">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-4 font-black text-slate-900 uppercase tracking-widest text-[9px]">Servicio</th>
              <th className="text-center py-4 font-black text-slate-900 w-12 uppercase tracking-widest text-[9px]">Cant</th>
              <th className="text-right py-4 font-black text-slate-900 w-24 uppercase tracking-widest text-[9px]">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item: any, i: number) => (
              <tr key={i} className="group/item">
                <td className="py-4">
                  <input className="w-full text-[11px] font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent" value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} />
                </td>
                <td className="py-4">
                  <input type="number" className="w-full text-center text-[11px] font-bold text-slate-600 border-none p-0 focus:ring-0 bg-transparent" value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value))} />
                </td>
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-gray-300 font-bold">$</span>
                    <input type="number" className="w-16 text-right text-[11px] font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent" value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', parseFloat(e.target.value))} />
                  </div>
                </td>
                <td className="py-4 text-center">
                  {items.length > 1 && <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mb-8">
        <button onClick={addItem} className="text-[9px] font-black text-orange-500 uppercase tracking-widest flex items-center gap-2 hover:text-orange-600"><Plus className="w-3.5 h-3.5" /> Añadir Item</button>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={withIva} onChange={e => setWithIva(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-500" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">IVA (16%)</span>
        </label>
      </div>

      <div className="pt-6 border-t border-slate-900">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-gray-400">Total USD</span>
            <span className="text-2xl text-slate-900 font-black tracking-tighter italic">${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Total en Bolívares (BS)</span>
            <span className="text-base text-slate-900 font-black">{totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</span>
          </div>
        </div>
      </div>
    </>
  );
}
