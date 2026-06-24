'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wrench, Search, Calendar, Clock, CheckCircle, AlertCircle,
  Loader2, RefreshCw, User, Car, Phone, ChevronDown, X,
  Banknote, BadgeCheck, Activity, Plus, Trash2, Edit3,
  ChevronRight, ChevronLeft, MoreHorizontal, MessageSquare, Tag, Info,
  MapPin, Filter, LayoutGrid, List, FileText, MoveHorizontal, Download,
  TrendingUp, Save, CheckCircle2, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, registrarFactura, createPresupuesto, generateNumeroPresupuesto, syncClientData } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from "@/lib/store/useSedeStore";
import { Button } from '@/components/ui/button';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { generatePresupuestoPDF } from '@/lib/presupuesto-pdf';
import { ComprobanteInput, emptyComprobante, type ComprobanteValue } from '@/components/ventas/ComprobanteInput';
import { uploadComprobante, comprobanteFields } from '@/lib/comprobante';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { cn, getLocalISODate, parseDescripcionItems } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────
interface ServicioItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

// Desglosa una descripción (incluyendo las registradas por el bot, que pueden venir
// multilínea "Nombre: trabajo" o con " + " / comas) en ítems separados para la factura.
function parseServicioItemsFromText(descripcion: string, totalPrecio = 0): ServicioItem[] {
  const raw = (descripcion || '').trim();
  if (!raw) return [];
  // 1) Multilínea (bot: "Rafael: ...\nJin: ...") → cada línea es un ítem.
  let pedazos = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  // 2) Si es una sola línea, intentar separar por " + " o " , " / ";"
  if (pedazos.length === 1) {
    pedazos = pedazos[0]
      .split(/\s\+\s|\s*;\s*|\s*\|\s*/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (pedazos.length === 0) pedazos = [raw];
  // Quitar prefijo "Nombre: " de cada pedazo dejando el trabajo legible (conservando el nombre).
  return pedazos.map((p, i) => {
    const precio = i === 0 ? totalPrecio : 0; // el costo total se asigna al primero por defecto
    return { descripcion: p, cantidad: 1, precio_unitario: precio, total: precio };
  });
}

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
  costo_final?: number | null;
  seguimiento?: any[] | null;
  registrado_por?: string | null;
  notas?: string | null;
  items?: ServicioItem[] | null;
  comprobante_url?: string | null;
  comprobante_referencia?: string | null;
  vehiculos?: { marca: string; modelo: string; placa: string; anio?: number; clientes?: { nombre: string; apellido: string; telefono: string } | null } | null;
}

const ESTADOS = ['pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'cancelada'];

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; glow: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20',  glow: 'shadow-amber-500/20', icon: AlertCircle },
  confirmada:  { label: 'Confirmada',  color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',    glow: 'shadow-blue-500/20',  icon: Calendar },
  en_revision: { label: 'Revisión',    color: 'text-fuchsia-400',bg: 'bg-fuchsia-400/10 border-fuchsia-400/20',glow: 'shadow-fuchsia-500/20', icon: Search },
  en_proceso:  { label: 'En Proceso',  color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20', glow: 'shadow-violet-500/20', icon: RefreshCw },
  completada:  { label: 'Completada',  color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20',  glow: 'shadow-green-500/20', icon: CheckCircle },
  cancelada:   { label: 'Cancelada',   color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',      glow: 'shadow-red-500/20',   icon: X },
};

const SERVICIO_LABELS: Record<string, string> = {
  mecanica: 'Mecánica', electronica: 'Electrónica', cerrajeria: 'Cerrajería',
  diagnostico: 'Diagnóstico', motor: 'Motor', emergencia: 'Emergencia', otro: 'General',
};

// ── Main Component ───────────────────────────────────────────
// Helper para formatear nombre de cliente y omitir "WHATSAPP" o "ADMIN IA"
const getDisplayName = (cita: any) => {
  const relName = cita.vehiculos?.clientes
    ? `${cita.vehiculos.clientes.nombre} ${cita.vehiculos.clientes.apellido}`.trim()
    : '';

  let raw = relName;
  if (cita.nombre_cliente && cita.nombre_cliente.trim() !== relName && cita.nombre_cliente.trim() !== '') {
     raw = cita.nombre_cliente;
  }

  if (!raw) return 'NO DEFINIDO';
  const upper = raw.toUpperCase();
  // Marcadores de "sin cliente" o registros automáticos
  if (
    upper.includes('WHATSAPP') || upper.includes('ADMIN IA') ||
    upper === 'NO DEFINIDO' || upper === 'SIN DEFINIR' || upper === 'CONSUMIDOR FINAL'
  ) return 'NO DEFINIDO';
  // Si NO hay cliente real vinculado y el "nombre" coincide con quien lo registró
  // (modo dios / admin), entonces no es un cliente: mostrar NO DEFINIDO.
  const reg = (cita.registrado_por || '').trim().toUpperCase();
  if (!cita.cliente_id && !cita.vehiculos?.clientes && reg && upper === reg) {
    return 'NO DEFINIDO';
  }
  return raw;
};

const getDisplayVehicle = (cita: any) => {
  const relVeh = cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}`.trim() : '';
  let raw = relVeh;
  if (cita.vehiculo_info && cita.vehiculo_info.trim() !== relVeh && cita.vehiculo_info.trim() !== '') {
    raw = cita.vehiculo_info;
  }
  return raw || '—';
};

const getDisplayPlaca = (cita: any) => {
  const relPlaca = cita.vehiculos?.placa || '';
  let raw = relPlaca;
  if (cita.placa && cita.placa.trim() !== relPlaca && cita.placa.trim() !== '') {
    raw = cita.placa;
  }
  return raw || 'S/P';
};

export default function ServiciosPage() {
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const [citas, setCitas] = useState<CitaServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [dateFilter, setDateFilter] = useState<'hoy' | 'semana' | 'mes' | 'todos'>('hoy');
  const [specificDateFilter, setSpecificDateFilter] = useState('');
  
  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [editCita, setEditCita] = useState<CitaServicio | null>(null);
  const [trackingCita, setTrackingCita] = useState<CitaServicio | null>(null);
  const [invoiceCita, setInvoiceCita] = useState<CitaServicio | null>(null);
  const [budgetCita, setBudgetCita] = useState<CitaServicio | null>(null);
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
          cliente_id, vehiculo_id, sede_id, seguimiento, notas, items,
          costo_estimado, costo_final, registrado_por,
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
      pendiente: 'Pendiente', confirmada: 'Confirmada', en_revision: 'En Revisión',
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

      const clienteNombre = getDisplayName(cita) || 'Consumidor Final';
      const vehiculoStr = getDisplayVehicle(cita);
      const sedeName = currentSede?.nombre || 'General';

      // ── Auto-register sale in ventas_dia when marking as completada/finalizado ──
      // Dashboard-originated sales go only to ventas_dia. Bot-originated go to ventas_silenciadores.
      // This ensures each service appears exactly once in the combined ventas view.
      const COMPLETED_STATES = ['completada', 'finalizado', 'finalizada', 'completado'];
      if (COMPLETED_STATES.includes(nuevoEstado) && supabase) {
        const precio = Number(cita.costo_final ?? cita.costo_estimado ?? 0);
        const sedeId = cita.sede_id || currentSede?.id;
        if (precio > 0 && sedeId) {
          const refTag = `[ServicioID: ${id}]`;
          const descStr = cita.descripcion || 'Servicio de taller';
          const notesFinal = `${descStr} [Total: $${precio} (Divisas)] | Cliente: ${clienteNombre} | Vehículo: ${vehiculoStr} ${refTag}`.trim();
          const desglose = parseDescripcionItems(descStr, precio);

          // Dedup check — update if already registered (e.g., if invoice modal later replaces this entry)
          const { data: existingVD } = await supabase.from('ventas_dia')
            .select('id').like('notas', `%${refTag}%`).limit(1).maybeSingle();

          const vdData = {
            fecha: getLocalISODate(),
            cliente: clienteNombre,
            total_ingresos: precio,
            total_servicios: 1,
            total_clientes: 1,
            desglose,
            metodos_pago: { divisas: precio },
            tasa_cambio: globalBcvRate || 0,
            con_iva: false,
            notas: notesFinal,
            creado_por: user?.nombre || 'Admin',
            sede_id: sedeId,
            fecha_registro: new Date().toISOString(),
            registro_atrasado: false,
            estado: 'pagado',
          };

          const vdResult = existingVD
            ? await supabase.from('ventas_dia').update(vdData).eq('id', existingVD.id)
            : await supabase.from('ventas_dia').insert(vdData);

          if (vdResult.error) throw new Error(`Error al registrar venta: ${vdResult.error.message}`);
        }
      }

      logActivity({
        usuario: user?.nombre || 'Admin',
        modulo: 'Servicios',
        accion: info.accion,
        detalles: `${info.fmt}: ${clienteNombre} en la sede de ${sedeName}`,
        referencia_id: id,
        referencia_tabla: 'servicios'
      });
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  const filtered = citas.filter(c => {
    // 1. Filtro de Texto
    const cliente = getDisplayName(c);
    const vehiculo = c.vehiculos ? `${c.vehiculos.marca} ${c.vehiculos.modelo}` : c.vehiculo_info || '';
    const txt = `${cliente} ${vehiculo} ${c.placa} ${c.descripcion}`.toLowerCase();
    const matchText = search === '' || txt.includes(search.toLowerCase());

    // 2. Filtro de Fecha
    if (!matchText) return false;

    const rawDateStr = c.fecha || c.created_at;
    if (!rawDateStr) return false;
    
    // Para 'hoy' y fecha específica, usamos substring para no pelear con zonas horarias
    const citaIsoDate = rawDateStr.split('T')[0];

    if (specificDateFilter) {
      return citaIsoDate === specificDateFilter;
    }

    if (dateFilter === 'todos') return true;
    
    // Convert to Date object safely
    const citaDate = new Date(rawDateStr);
    
    if (dateFilter === 'hoy') {
      return citaIsoDate === getLocalISODate();
    }
    
    const now = new Date();
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
      const clientName = getDisplayName(cita) || 'CONSUMIDOR FINAL';
      const vehicleStr = getDisplayVehicle(cita);
      
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

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: '7d' },
                { id: 'mes', label: '30d' },
                { id: 'todos', label: 'Todo' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    setDateFilter(f.id as any);
                    setSpecificDateFilter('');
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    dateFilter === f.id && !specificDateFilter ? "bg-primary/20 text-primary shadow-inner" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative flex items-center">
              <input
                type="date"
                value={specificDateFilter}
                onChange={(e) => {
                  setSpecificDateFilter(e.target.value);
                  if (e.target.value) setDateFilter('todos');
                }}
                className={cn(
                  "pl-3 pr-8 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40",
                  specificDateFilter ? "bg-primary/10 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                )}
                title="Filtrar por fecha específica"
              />
              {specificDateFilter && (
                <button 
                  onClick={() => setSpecificDateFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-foreground/10 hover:bg-foreground/20 rounded-full flex items-center justify-center transition-all"
                  title="Limpiar fecha"
                >
                  <X className="w-3 h-3 text-foreground" />
                </button>
              )}
            </div>
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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 xl:gap-6"
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
                onBudget={setBudgetCita}
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
              onBudget={setBudgetCita}
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
      {budgetCita && <BudgetModal cita={budgetCita} inventory={inventory} onClose={() => setBudgetCita(null)} />}
    </div>
  );
}

// ── Kanban Components ──────────────────────────────────────────
function KanbanColumn({ estado, items, onEdit, onDelete, onTracking, onInvoice, onBudget, onMove, selectedForDual, setSelectedForDual }: any) {
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
              onBudget={onBudget}
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

function ServiceCard({ cita, onEdit, onDelete, onTracking, onInvoice, onBudget, onMove, isSelected, onSelect }: any) {
  const { can } = useRolePermissions();
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
            {getDisplayName(cita)}
          </h4>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5 flex items-center gap-1 uppercase tracking-widest">
            <Car className="w-3 h-3" /> {getDisplayVehicle(cita)}
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(cita)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          {can('servicios', 'eliminar') && (
            <button onClick={() => onDelete(cita.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
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
            {getDisplayPlaca(cita)}
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
          <div className="pt-2 border-t border-white/5 mt-2">
            <div className="flex items-center gap-1.5 p-1.5 bg-primary/10 rounded-md border border-primary/20 w-fit">
              <User className="w-3 h-3 text-primary" />
              <p className="text-[10px] text-primary/80 font-bold uppercase tracking-wider">
                Registrado por: <span className="text-primary font-black ml-1">{cita.registrado_por}</span>
              </p>
            </div>
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
      
      {/* Convertir en Presupuesto */}
      <div className="px-5 pb-5 pt-1">
        <button
          onClick={() => onBudget(cita)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all font-black text-[10px] uppercase tracking-widest border border-primary/20 shadow-sm"
        >
          Convertir en Presupuesto
        </button>
      </div>
    </motion.div>
  );
}

// ── List View Component ──────────────────────────────────────
function ListView({ items, onEdit, onDelete, onTracking, onInvoice, onBudget }: any) {
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
                        {getDisplayName(cita)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || cita.tipo}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs text-foreground/80 font-medium">
                    {getDisplayVehicle(cita)}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">{getDisplayPlaca(cita)}</p>
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
  // Servicios desglosados (ítems con precio para la factura). Se autollenan desde la
  // descripción (incluida la registrada por el bot) si no hay ítems guardados.
  const [items, setItems] = useState<ServicioItem[]>(() => {
    const existing = (cita?.items as ServicioItem[] | undefined) || [];
    if (Array.isArray(existing) && existing.length > 0) {
      return existing.map(i => ({
        descripcion: i.descripcion || '',
        cantidad: Number(i.cantidad) || 1,
        precio_unitario: Number(i.precio_unitario) || 0,
        total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
      }));
    }
    const total = Number(cita?.costo_final ?? cita?.costo_estimado ?? 0);
    return parseServicioItemsFromText(cita?.descripcion || '', total);
  });
  const [encargados, setEncargados] = useState<{ nombre: string; rol: 'mecanico' | 'jefe_taller' }[]>(() => {
    if (!cita?.notas) return [];
    const match = cita.notas.match(/^Encargados?: (.+)/);
    if (!match) return [];
    return match[1].split(', ').reduce<{ nombre: string; rol: 'mecanico' | 'jefe_taller' }[]>((acc, entry) => {
      const m = entry.match(/^(.+) \((Jefe|Mecánico)\)$/);
      if (m) acc.push({ nombre: m[1].trim(), rol: m[2] === 'Jefe' ? 'jefe_taller' : 'mecanico' });
      return acc;
    }, []);
  });
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
  const [plateStatus, setPlateStatus] = useState<'idle' | 'checking' | 'found' | 'new'>('idle');
  const [clientVehiculos, setClientVehiculos] = useState<any[]>([]);
  const [showVehiculoSelector, setShowVehiculoSelector] = useState(false);
  const [vehiculoSuggestions, setVehiculoSuggestions] = useState<any[]>([]);
  const [showVehiculoSuggestions, setShowVehiculoSuggestions] = useState(false);
  const plateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const vehiculoSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (plateTimerRef.current) clearTimeout(plateTimerRef.current);
      if (vehiculoSearchTimer.current) clearTimeout(vehiculoSearchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (formData.nombre_cliente.length > 1) {
      const results = allClientes.filter(c =>
        `${c.nombre} ${c.apellido}`.toLowerCase().includes(formData.nombre_cliente.toLowerCase())
      );
      setFilteredClientes(results);
      setShowClientResults(results.length > 0);
    } else {
      setShowClientResults(false);
    }
  }, [formData.nombre_cliente, allClientes]);

  const selectCliente = (c: any) => {
    const vehs = c.vehiculos || [];
    setClientVehiculos(vehs);
    const mainVehiculo = vehs[0];
    setSelectedClienteId(c.id);
    setSelectedVehiculoId(mainVehiculo?.id || null);
    setFormData({
      ...formData,
      nombre_cliente: `${c.nombre} ${c.apellido}`,
      telefono: c.telefono || '',
      vehiculo_info: mainVehiculo ? `${mainVehiculo.marca} ${mainVehiculo.modelo}` : formData.vehiculo_info,
      placa: mainVehiculo ? mainVehiculo.placa : formData.placa,
    });
    if (mainVehiculo) setPlateStatus('found');
    setShowClientResults(false);
  };

  const checkPlateForService = async (placa: string) => {
    const clean = placa.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length < 3) { setPlateStatus('idle'); return; }
    setPlateStatus('checking');
    try {
      if (!supabase) { setPlateStatus('idle'); return; }
      const { data } = await supabase.from('vehiculos')
        .select('id, marca, modelo, anio, placa, clientes(id, nombre, apellido, telefono, vehiculos(id, marca, modelo, placa))')
        .ilike('placa', clean)
        .limit(1)
        .maybeSingle();
      if (data) {
        const c = (data as any).clientes;
        const vehs: any[] = c?.vehiculos || [data];
        setClientVehiculos(vehs);
        setSelectedVehiculoId(data.id);
        if (c) {
          setSelectedClienteId(c.id);
          setFormData(prev => ({
            ...prev,
            vehiculo_info: `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`,
            nombre_cliente: `${c.nombre} ${c.apellido}`,
            telefono: c.telefono || prev.telefono,
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            vehiculo_info: `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`,
          }));
        }
        setPlateStatus('found');
      } else {
        setClientVehiculos([]);
        setPlateStatus('new');
      }
    } catch { setPlateStatus('idle'); }
  };

  // ── Ítems desglosados ──
  const itemsTotal = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ServicioItem, value: string | number) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it;
      const next: ServicioItem = { ...it, [field]: field === 'descripcion' ? String(value) : (Number(value) || 0) };
      next.total = (Number(next.cantidad) || 1) * (Number(next.precio_unitario) || 0);
      return next;
    }));
  };
  // Repuebla los ítems desde la descripción actual (botón "Desglosar").
  const autoDesglosar = () => {
    const total = parseFloat(formData.costo_estimado) || itemsTotal || 0;
    setItems(parseServicioItemsFromText(formData.descripcion || '', total));
  };

  // ── Resolver robusto: encuentra o CREA (sin duplicar) cliente + vehículo ──
  // Funciona igual al crear y al EDITAR. Esto evita tener que ir a Clientes y luego a
  // Vehículos por separado: con poner el nombre/teléfono/placa, el sistema lo asocia todo.
  const resolveClienteYVehiculo = async (): Promise<{ clienteId: string | null; vehiculoId: string | null }> => {
    let clienteId = selectedClienteId || cita?.cliente_id || null;
    let vehiculoId = selectedVehiculoId || null;
    const nombreFull = formData.nombre_cliente.trim();
    const tel = formData.telefono.trim();
    const placaNorm = formData.placa.trim().toUpperCase().replace(/[-\s]/g, '');
    const placaValida = !!placaNorm && !['SINPLACA', 'SIN', 'NA', 'N/A'].includes(placaNorm);

    // CLIENTE: actualizar el existente, o buscar duplicado (tel → nombre), o crear.
    if (nombreFull) {
      const parts = nombreFull.split(/\s+/);
      const nombre = parts[0];
      const apellido = parts.slice(1).join(' ') || '—';
      // Si el cliente actual es el GENÉRICO de taller (compartido), no lo renombramos:
      // tratamos como "sin cliente" para crear/asociar el cliente REAL y re-vincular.
      if (clienteId) {
        const { data: cur } = await supabase!.from('clientes').select('nombre, apellido').eq('id', clienteId).maybeSingle();
        const esGenerico = !!cur && String(cur.nombre || '').trim().toLowerCase() === 'consumidor final';
        const mismoNombre = !!cur && `${cur.nombre || ''} ${cur.apellido || ''}`.trim().toLowerCase() === nombreFull.toLowerCase();
        if (esGenerico && !mismoNombre) {
          clienteId = null;
        }
      }
      if (clienteId) {
        await supabase!.from('clientes').update({ nombre, apellido, ...(tel ? { telefono: tel } : {}) }).eq('id', clienteId);
      } else {
        let existing: any = null;
        if (tel) {
          const { data } = await withSedeFilter(supabase!.from('clientes')).select('id').eq('telefono', tel).limit(1).maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await withSedeFilter(supabase!.from('clientes')).select('id').ilike('nombre', nombre).ilike('apellido', apellido).limit(1).maybeSingle();
          existing = data;
        }
        if (existing) clienteId = existing.id;
        else {
          const { data: created, error } = await withSedeFilter(supabase!.from('clientes'))
            .insert(withSedeInsert({ nombre, apellido, telefono: tel || 'S/N', notas: 'Registrado desde Orden de Servicio' }))
            .select('id').single();
          if (error) throw error;
          clienteId = created.id;
        }
      }
    }

    // VEHÍCULO: por placa (sin duplicar) → si no existe, crear bajo el cliente.
    if (!vehiculoId && placaValida) {
      const { data: existingVeh } = await supabase!.from('vehiculos').select('id, cliente_id').ilike('placa', placaNorm).limit(1).maybeSingle();
      if (existingVeh) {
        vehiculoId = existingVeh.id;
        if (clienteId && existingVeh.cliente_id !== clienteId) {
          await supabase!.from('vehiculos').update({ cliente_id: clienteId }).eq('id', existingVeh.id);
        } else if (!clienteId) clienteId = existingVeh.cliente_id;
      }
    }
    if (!vehiculoId && clienteId && (formData.vehiculo_info.trim() || placaValida)) {
      const vparts = formData.vehiculo_info.trim().split(/\s+/);
      const marca = vparts[0] || 'Desconocida';
      const modelo = vparts.slice(1).join(' ').replace(/\b(19|20)\d{2}\b/, '').trim() || '—';
      const yearMatch = formData.vehiculo_info.match(/\b(19\d\d|20\d\d)\b/);
      let anio = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
      if (anio < 1950 || anio > 2030) anio = new Date().getFullYear();
      const { data: created, error } = await withSedeFilter(supabase!.from('vehiculos'))
        .insert(withSedeInsert({ cliente_id: clienteId, marca, modelo, placa: placaValida ? placaNorm : `SP${String(Date.now()).slice(-7)}`, anio, estado: 'en_servicio' }))
        .select('id').single();
      if (error) throw error;
      vehiculoId = created.id;
    }
    if (!vehiculoId && cita?.vehiculo_id) vehiculoId = cita.vehiculo_id;

    // Asegurar que el vehículo quede vinculado al cliente resuelto (p.ej. al pasar del
    // cliente genérico al real). Solo si difiere, para no tocar de más.
    if (vehiculoId && clienteId) {
      const { data: vcur } = await supabase!.from('vehiculos').select('cliente_id').eq('id', vehiculoId).maybeSingle();
      if (vcur && vcur.cliente_id !== clienteId) {
        await supabase!.from('vehiculos').update({ cliente_id: clienteId }).eq('id', vehiculoId);
      }
    }
    return { clienteId, vehiculoId };
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

      // ── Cliente + Vehículo: encontrar o crear (SIN duplicar), crear y editar ──
      {
        const resolved = await resolveClienteYVehiculo();
        finalClienteId = resolved.clienteId;
        finalVehiculoId = resolved.vehiculoId;
      }

      // Datos desglosados para guardar (ítems + total).
      const itemsToSave = items
        .filter(i => (i.descripcion || '').trim() !== '')
        .map(i => ({
          descripcion: i.descripcion.trim(),
          cantidad: Number(i.cantidad) || 1,
          precio_unitario: Number(i.precio_unitario) || 0,
          total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
        }));
      const costoFinalCalc = itemsToSave.length > 0 ? itemsTotal : (parseFloat(formData.costo_estimado) || 0);

      if (cita?.id) {
        // UPDATE
        const oldNombreCliente = cita.nombre_cliente;
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
          items: itemsToSave,
          costo_estimado: costoFinalCalc,
          notas: encargados.length > 0
            ? `Encargados: ${encargados.map(e => `${e.nombre} (${e.rol === 'jefe_taller' ? 'Jefe' : 'Mecánico'})`).join(', ')}`
            : (cita?.notas || ''),
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
        
        // Sync client name to CRM if edited
        if (finalClienteId && formData.nombre_cliente.trim() !== '') {
          const names = formData.nombre_cliente.trim().split(' ');
          const cNombre = names[0];
          const cApellido = names.slice(1).join(' ');
          await supabase!.from('clientes').update({ nombre: cNombre, apellido: cApellido }).eq('id', finalClienteId);
          await syncClientData(finalClienteId, cNombre, cApellido, formData.telefono || '');
        }
        
        // Sync client name to related factura if changed
        const newNombreCliente = formData.nombre_cliente.trim();
        if (oldNombreCliente && oldNombreCliente !== newNombreCliente) {
          let facturaIdToUpdate: string | null = null;
          // 1st: direct reference (new format: referencia_tabla = 'servicios')
          const { data: facturaDirect } = await supabase!
            .from('facturas')
            .select('id')
            .eq('referencia_id', cita.id)
            .eq('modulo_origen', 'servicios')
            .maybeSingle();
          if (facturaDirect) {
            facturaIdToUpdate = facturaDirect.id;
          } else {
            // 2nd: legacy format (referencia_tabla = 'ventas_dia')
            // Find ventas_dia with matching old client name
            const { data: ventasMatch } = await supabase!
              .from('ventas_dia')
              .select('id')
              .eq('cliente', oldNombreCliente)
              .limit(2);
            if (ventasMatch && ventasMatch.length === 1) {
              const { data: facturaLegacy } = await supabase!
                .from('facturas')
                .select('id')
                .eq('referencia_id', ventasMatch[0].id)
                .eq('modulo_origen', 'servicios')
                .maybeSingle();
              if (facturaLegacy) facturaIdToUpdate = facturaLegacy.id;
            }
          }
          if (facturaIdToUpdate) {
            await supabase!
              .from('facturas')
              .update({ cliente: newNombreCliente, updated_at: new Date().toISOString() })
              .eq('id', facturaIdToUpdate);
          }
        }
        
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
          items: itemsToSave,
          registrado_por: user?.nombre || 'Admin',
          fecha: getLocalISODate(),
          hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          estado: 'pendiente',
          costo_estimado: costoFinalCalc,
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

        // Sync client name to CRM if edited
        if (finalClienteId && formData.nombre_cliente.trim() !== '') {
          const names = formData.nombre_cliente.trim().split(' ');
          const cNombre = names[0];
          const cApellido = names.slice(1).join(' ');
          await supabase!.from('clientes').update({ nombre: cNombre, apellido: cApellido }).eq('id', finalClienteId);
          await syncClientData(finalClienteId, cNombre, cApellido, formData.telefono || '');
        }

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
                <div className="absolute top-full left-0 right-0 z-[150] mt-1 bg-popover border border-border rounded-xl sm:rounded-2xl shadow-2xl max-h-48 overflow-y-auto no-scrollbar py-1">
                  {filteredClientes.map((c, idx) => (
                    <button
                      key={c.id || idx}
                      onClick={() => selectCliente(c)}
                      className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors group"
                    >
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{c.nombre} {c.apellido}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-muted-foreground">{c.telefono}</p>
                        {c.vehiculos?.length > 0 && (
                          <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                            <Car className="w-2.5 h-2.5" />{c.vehiculos.length} veh.
                          </span>
                        )}
                      </div>
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
            <div className="col-span-2 sm:col-span-1 space-y-2 relative">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Veh&iacute;culo / Modelo</label>
              <div className="relative">
                <input
                  className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pr-8"
                  placeholder="Ej: Toyota Corolla 2015"
                  value={formData.vehiculo_info}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({...formData, vehiculo_info: val});
                    setSelectedVehiculoId(null);
                    // debounce search only if client not already selected
                    clearTimeout(vehiculoSearchTimer.current);
                    if (val.length >= 2 && !selectedClienteId) {
                      vehiculoSearchTimer.current = setTimeout(async () => {
                        if (!supabase) return;
                        const { data } = await supabase.from('vehiculos')
                          .select('id, marca, modelo, anio, placa, clientes(id, nombre, apellido, telefono)')
                          .or(`marca.ilike.%${val}%,modelo.ilike.%${val}%`)
                          .limit(6);
                        setVehiculoSuggestions(data || []);
                        setShowVehiculoSuggestions((data || []).length > 0);
                      }, 400);
                    } else {
                      setVehiculoSuggestions([]);
                      setShowVehiculoSuggestions(false);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowVehiculoSuggestions(false), 200)}
                />
                {clientVehiculos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowVehiculoSelector(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Suggestions from DB when typing model */}
              {showVehiculoSuggestions && vehiculoSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-popover border border-border rounded-xl shadow-2xl py-1">
                  {vehiculoSuggestions.map((v: any) => {
                    const cliente = (v as any).clientes;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVehiculoId(v.id);
                          setFormData(prev => ({
                            ...prev,
                            vehiculo_info: `${v.marca} ${v.modelo}${v.anio ? ` ${v.anio}` : ''}`,
                            placa: v.placa,
                            nombre_cliente: cliente ? `${cliente.nombre} ${cliente.apellido}` : prev.nombre_cliente,
                            telefono: cliente?.telefono || prev.telefono,
                          }));
                          if (cliente) setSelectedClienteId(cliente.id);
                          setPlateStatus('found');
                          setShowVehiculoSuggestions(false);
                          setVehiculoSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors group flex items-center gap-3"
                      >
                        <Car className="w-4 h-4 text-primary/60 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-foreground group-hover:text-primary">{v.marca} {v.modelo}{v.anio ? ` ${v.anio}` : ''}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-primary/70">{v.placa}</span>
                            {cliente && <span className="text-[10px] text-muted-foreground">{cliente.nombre} {cliente.apellido}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Multi-vehicle selector for the same client */}
              {showVehiculoSelector && clientVehiculos.length > 1 && (
                <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-popover border border-border rounded-xl shadow-2xl py-1">
                  {clientVehiculos.map((v: any) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVehiculoId(v.id);
                        setFormData(prev => ({ ...prev, vehiculo_info: `${v.marca} ${v.modelo}`, placa: v.placa }));
                        setShowVehiculoSelector(false);
                        setPlateStatus('found');
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors"
                    >
                      <p className="text-xs font-bold">{v.marca} {v.modelo}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{v.placa}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">N&uacute;mero de Placa</label>
              <div className="relative">
                <input
                  className={`w-full bg-muted/50 border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pr-9 ${
                    plateStatus === 'found' ? 'border-green-500/60' : plateStatus === 'new' ? 'border-yellow-500/60' : 'border-border'
                  }`}
                  placeholder="ABC-123"
                  value={formData.placa}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setFormData({...formData, placa: val});
                    clearTimeout(plateTimerRef.current);
                    plateTimerRef.current = setTimeout(() => checkPlateForService(val), 600);
                  }}
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {plateStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {plateStatus === 'found' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {plateStatus === 'new' && <XCircle className="w-4 h-4 text-yellow-500" />}
                </div>
              </div>
              {plateStatus === 'found' && <p className="text-[10px] text-green-400 ml-1">Vehículo encontrado en sistema</p>}
              {plateStatus === 'new' && <p className="text-[10px] text-yellow-400 ml-1">Placa no registrada — se vinculará al guardar</p>}
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

            {/* ── Servicios desglosados (para imprimir la factura por ítems) ── */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                  Servicios desglosados <span className="normal-case opacity-60">(para la factura)</span>
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={autoDesglosar} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                    Auto-desglosar
                  </button>
                  <button type="button" onClick={addItem} className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Agregar
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-2 sm:p-3 space-y-2">
                {items.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic px-1 py-2">
                    Sin ítems. Usa <b>Auto-desglosar</b> para separar la descripción en líneas, o <b>Agregar</b> una manual.
                  </p>
                )}
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      value={it.descripcion}
                      onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                      placeholder="Trabajo / repuesto"
                      className="flex-1 min-w-0 bg-background/60 border border-border rounded-lg px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      type="number" min="1" value={it.cantidad}
                      onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                      title="Cantidad"
                      className="w-12 bg-background/60 border border-border rounded-lg px-1.5 py-2 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                      <input
                        type="number" step="0.01" value={it.precio_unitario}
                        onChange={e => updateItem(idx, 'precio_unitario', e.target.value)}
                        placeholder="0.00" title="Precio unitario"
                        className="w-20 bg-background/60 border border-border rounded-lg pl-5 pr-2 py-2 text-xs text-right font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <span className="w-16 text-right text-xs font-black text-primary tabular-nums">${Number(it.total).toFixed(2)}</span>
                    <button type="button" onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-red-400 transition-colors shrink-0" title="Quitar">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {items.length > 0 && (
                  <div className="flex items-center justify-end gap-3 pt-2 mt-1 border-t border-border/40">
                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Total</span>
                    <span className="text-sm font-black text-primary tabular-nums">${itemsTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
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
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 backdrop-blur-md p-0 sm:p-4">
      <div className="bg-card border border-border w-full max-w-5xl h-full sm:h-[90vh] shadow-2xl flex flex-col overflow-hidden sm:rounded-[32px]">
        
        {/* Lycos Premium Header */}
        <div className="p-6 sm:p-8 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[20px] sm:rounded-[24px] bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0 shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tighter uppercase italic" style={{ fontFamily: 'Syne, sans-serif' }}>
                Bitácora de Servicio
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 mt-1">
                <span className="text-[9px] sm:text-[10px] bg-muted/50 px-2 py-0.5 rounded-md font-mono text-muted-foreground uppercase tracking-widest border border-border w-fit">
                  ID: {cita.id.slice(0,8)}
                </span>
                <span className="text-[9px] sm:text-[10px] text-primary font-black uppercase tracking-widest line-clamp-1">
                  {cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}` : cita.vehiculo_info} · {cita.vehiculos?.placa || cita.placa}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-all group shrink-0">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          
          {/* Timeline Panel - Left */}
          <div className="flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-muted/10">
             <div className="max-w-2xl mx-auto space-y-8">
                {(cita.seguimiento || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center opacity-40">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-6">
                      <Clock className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground">Sin registros aún</p>
                  </div>
                ) : (
                  <div className="relative pl-8 sm:pl-10 space-y-8 sm:space-y-12 before:absolute before:left-[15px] sm:before:left-[19px] before:top-2 before:bottom-2 before:w-[3px] before:bg-gradient-to-b before:from-primary before:via-border before:to-transparent">
                    {(cita.seguimiento || []).slice().reverse().map((entry, i) => {
                      const cat = CATEGORIES[entry.tipo] || CATEGORIES.nota;
                      const CatIcon = cat.icon;
                      return (
                        <div key={i} className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
                          <div className="absolute -left-[39px] sm:-left-[45px] top-1 w-10 h-10 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] bg-card border-4 border-background flex items-center justify-center z-10 shadow-lg transition-transform group-hover:scale-110 group-hover:border-primary/30">
                            <CatIcon className={cn("w-4 h-4 sm:w-5 sm:h-5", cat.color)} />
                          </div>
                          
                          <div className="bg-muted/30 border border-border rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 group-hover:bg-muted/50 transition-all relative overflow-hidden">
                            <div className="flex flex-col sm:flex-row justify-start sm:justify-between items-start sm:items-center gap-2 mb-4">
                              <span className="text-[9px] sm:text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest bg-background/50 border border-border/50 text-muted-foreground w-fit">
                                {new Date(entry.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(entry.fecha).toLocaleDateString()}
                              </span>
                              <span className={cn("text-[9px] sm:text-[10px] font-black uppercase tracking-widest italic", cat.color)}>
                                {cat.label}
                              </span>
                            </div>
                            
                            <p className="text-sm sm:text-base text-foreground font-bold leading-relaxed mb-4">
                              {entry.accion}
                            </p>
                            
                            <div className="flex items-center gap-3 pt-4 border-t border-border">
                               <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                 <User className="w-3 h-3 text-primary" />
                               </div>
                               <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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
          <div className="w-full lg:w-[400px] bg-muted/20 p-4 sm:p-8 flex flex-col gap-8 border-t lg:border-t-0 lg:border-l border-border overflow-y-auto custom-scrollbar shrink-0">
            
            {/* Quick States */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] mb-4 sm:mb-6 border-l-2 border-primary pl-3">Estados Rápidos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => addTrackingEntry(action.text)}
                    className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-[16px] sm:rounded-[20px] bg-card border border-border hover:bg-primary hover:text-primary-foreground group transition-all text-left"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-[12px] bg-muted/50 flex items-center justify-center group-hover:bg-primary-foreground/20 shrink-0">
                      <action.icon className="w-4 h-4 sm:w-5 sm:h-5 group-hover:text-primary-foreground text-muted-foreground transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest truncate">{action.label}</p>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground group-hover:text-primary-foreground/70 font-medium">Click para registrar</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Entry */}
            <div className="space-y-4 pt-6 sm:pt-8 border-t border-border">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] mb-4 sm:mb-6 border-l-2 border-primary pl-3">Entrada Manual</p>
              
              <div className="flex gap-2">
                {Object.entries(CATEGORIES).map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => setCategory(id)}
                    className={cn(
                      "flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border transition-all",
                      category === id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <info.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ))}
              </div>

              <textarea 
                className="w-full bg-muted/50 border border-border rounded-[20px] sm:rounded-[24px] px-4 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[100px] sm:min-h-[120px] resize-none transition-all"
                placeholder="Escribe un reporte detallado..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />

              <Button 
                onClick={() => addTrackingEntry()} 
                disabled={isSaving || !comment.trim()} 
                className="w-full h-14 sm:h-16 rounded-[20px] sm:rounded-[24px] bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg shadow-primary/20 gap-2 sm:gap-3"
              >
                {isSaving ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <BadgeCheck className="w-5 h-5 sm:w-6 sm:h-6" />}
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
  const [clientName, setClientName] = useState(getDisplayName(cita) || 'Consumidor Final');

  const [vehicleStr, setVehicleStr] = useState(cita.vehiculos
    ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo} (${cita.vehiculos.placa})`
    : cita.vehiculo_info || '—');
  const [secondCita, setSecondCita] = useState<CitaServicio | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);

  const [items, setItems] = useState(() => {
    // Preferir los ítems desglosados guardados en la orden (cada uno con su precio).
    const saved = (cita.items as ServicioItem[] | undefined) || [];
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map(i => ({
        descripcion: i.descripcion || 'Servicio',
        cantidad: Number(i.cantidad) || 1,
        precio_unitario: Number(i.precio_unitario) || 0,
        total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
      }));
    }
    const match = inventory.find((i: any) =>
      (cita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
      i.nombre.toLowerCase().trim().includes((cita.descripcion || '').toLowerCase().trim()) ||
      (cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
    );
    const price = match?.precio_usd || cita.costo_estimado || 0;
    const rawDesc = cita.descripcion || cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || 'Servicio General';
    // Desglose tolerante (multilínea del bot, " + ", ";", "|").
    const parsed = parseServicioItemsFromText(rawDesc, price);
    return parsed.length > 0 ? parsed : parseDescripcionItems(rawDesc, price);
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
      const rawDesc = secondCita.descripcion || secondCita.tipo_personalizado || SERVICIO_LABELS[secondCita.tipo] || 'Servicio General';
      setSecondItems(parseDescripcionItems(rawDesc, price));
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
  const [existingCorrelativo, setExistingCorrelativo] = useState('');
  // Comprobante de pago (referencia + imagen) al convertir el servicio en venta
  const [comprobante, setComprobante] = useState<ComprobanteValue>(emptyComprobante());
  const [comprobanteSavedUrl, setComprobanteSavedUrl] = useState<string | null>(null);

  // Load correlativo from facturas table for already-registered services
  useEffect(() => {
    if (!supabase || !cita?.id) return;
    supabase.from('facturas').select('correlativo').eq('referencia_id', cita.id).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.correlativo) setExistingCorrelativo(data.correlativo); });
  }, [cita?.id]);

  const handleDownload = (correlativo?: string, comp?: { url?: string | null; ref?: string | null }) => {
    const data1 = {
      id: cita.id,
      correlativo: correlativo || existingCorrelativo || undefined,
      fecha: cita.fecha,
      cliente: clientName,
      vehiculo: vehicleStr,
      items,
      total,
      iva_aplicado: withIva,
      tasa_bcv: rates.bcv || globalBcvRate || 518.0,
      total_ves: totalVes,
      notas: cita.descripcion || undefined,
      metodos_pago: payments,
      comprobante_url: comp?.url || comprobanteSavedUrl || cita.comprobante_url || undefined,
      comprobante_referencia: comp?.ref || comprobante.referencia.trim() || cita.comprobante_referencia || undefined
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
      // ref tag enables dedup — if Kanban drag already registered this sale, update instead of insert
      const vdRefTag = `[ServicioID: ${cita.id}]`;
      const vdNotas = `${[cita.descripcion, cita.tipo_personalizado].filter(Boolean).join(' | ') || 'Servicio de taller'} ${vdRefTag}`.trim();
      const sedeIdFinal = cita.sede_id || useSedeStore.getState().currentSede?.id;
      if (!sedeIdFinal) throw new Error('No se puede registrar la venta: sede del servicio no encontrada');

      // Subir comprobante de pago (si se adjuntó) → URL pública
      const comprobanteUrl = (await uploadComprobante(comprobante.file)) || cita.comprobante_url || null;
      const comprobanteRef = comprobante.referencia.trim() || cita.comprobante_referencia || null;
      setComprobanteSavedUrl(comprobanteUrl);

      const { data: existingVD } = await supabase.from('ventas_dia')
        .select('id').like('notas', `%${vdRefTag}%`).limit(1).maybeSingle();

      const vdPayload = {
        fecha: getLocalISODate(),
        cliente: clientName,
        total_ingresos: total,
        total_servicios: items.length,
        total_clientes: 1,
        desglose: items,
        metodos_pago: payments,
        tasa_cambio: rates.bcv || globalBcvRate || 518.0,
        con_iva: withIva,
        notas: vdNotas,
        creado_por: 'Admin',
        sede_id: sedeIdFinal,
        estado: 'pagado',
        ...comprobanteFields(comprobanteUrl, comprobanteRef),
      };

      let ventaDia: any = null;
      if (existingVD) {
        const { data: upd, error: ventaError } = await supabase.from('ventas_dia')
          .update(vdPayload).eq('id', existingVD.id).select().single();
        if (ventaError) throw ventaError;
        ventaDia = upd;
      } else {
        const { data: ins, error: ventaError } = await supabase.from('ventas_dia')
          .insert(vdPayload).select().single();
        if (ventaError) throw ventaError;
        ventaDia = ins;
      }

      const { error: citaError } = await withSedeFilter(supabase.from('servicios')).update({
        estado: 'completada',
        ...comprobanteFields(comprobanteUrl, comprobanteRef),
      }).eq('id', cita.id);
      if (citaError) throw citaError;

      // ventas_dia is the authoritative accounting table for dashboard-originated sales.
      // ventas_silenciadores is reserved for bot/IA registrations to avoid duplicates in the combined view.

      let finalCorrelativo = undefined;
      try {
        const facturaRegistro = await registrarFactura({
          tipo: 'servicio',
          modulo_origen: 'servicios',
          referencia_id: cita.id,
          referencia_tabla: 'servicios',
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
          sede_id: cita.sede_id || useSedeStore.getState().currentSede?.id,
          comprobante_url: comprobanteUrl || undefined,
          comprobante_referencia: comprobanteRef || undefined,
        });
        if (facturaRegistro?.correlativo) finalCorrelativo = facturaRegistro.correlativo;
      } catch (e) {
        console.error('Error registering centralized factura:', e);
      }

      logActivity({ usuario: useAppStore.getState().user?.nombre || 'Admin', modulo: 'Servicios', accion: 'Venta Finalizada', detalles: `Venta para ${clientName} por $${total.toFixed(2)}` });
      handleDownload(finalCorrelativo, { url: comprobanteUrl, ref: comprobanteRef });
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
                 correlativo={existingCorrelativo || undefined}
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

        {cita.estado !== 'completada' && (
          <div className="px-4 sm:px-8 pt-4">
            <ComprobanteInput value={comprobante} onChange={setComprobante} compact />
          </div>
        )}

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
  subtotal, ivaAmount, total, totalVes, correlativo
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
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Nota de Entrega</p>
          <p className="text-base font-black text-slate-900">{correlativo || `#${cita.id.slice(0, 8).toUpperCase()}`}</p>
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

// ── Budget Modal ───────────────────────────────────────────────
function BudgetModal({ cita, inventory, onClose }: { cita: CitaServicio; inventory: any[]; onClose: () => void }) {
  const getDisplayName = (c: CitaServicio) => {
    if (c.vehiculos?.clientes) return `${c.vehiculos.clientes.nombre} ${c.vehiculos.clientes.apellido}`;
    const raw = (c.nombre_cliente || '').trim();
    const upper = raw.toUpperCase();
    const reg = ((c as any).registrado_por || '').trim().toUpperCase();
    // Sin cliente real: marcadores automáticos o coincidencia con quien lo registró (modo dios)
    if (!raw || upper === 'NO DEFINIDO' || upper === 'SIN DEFINIR' ||
        upper.includes('WHATSAPP') || upper.includes('ADMIN IA') ||
        (!(c as any).cliente_id && reg && upper === reg)) {
      return 'Consumidor Final';
    }
    return raw;
  };

  const [clientName, setClientName] = useState(getDisplayName(cita) || 'Consumidor Final');
  const [clientPhone, setClientPhone] = useState(cita.telefono || '');
  
  const [vehicleStr, setVehicleStr] = useState(cita.vehiculos
    ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo} (${cita.vehiculos.placa})`
    : cita.vehiculo_info || '—');

  const SERVICIO_LABELS: Record<string, string> = {
    mantenimiento_preventivo: 'Mantenimiento Preventivo',
    cambio_aceite: 'Cambio de Aceite',
    frenos: 'Frenos',
    motor: 'Motor',
    transmision: 'Transmisión',
    suspension: 'Suspensión',
    electrico: 'Sistema Eléctrico',
    aire_acondicionado: 'Aire Acondicionado',
    diagnostico: 'Diagnóstico por Escáner'
  };

  const [items, setItems] = useState(() => {
    const match = inventory.find((i: any) => 
      (cita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
      i.nombre.toLowerCase().trim().includes((cita.descripcion || '').toLowerCase().trim()) ||
      (cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
    );
    const price = match?.precio_usd || cita.costo_estimado || 0;
    return [{
      id: `item-${Date.now()}`,
      tipo: match ? 'repuesto' : 'servicio',
      descripcion: cita.descripcion || cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || 'Servicio General',
      cantidad: 1,
      precio_unitario: price,
      moneda: 'USD' as const,
      total: price,
      inventario_id: match ? match.id : null,
    }];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [globalBcvRate, setGlobalBcvRate] = useState(0);
  
  useEffect(() => {
    fetch('/api/rates?t=' + Date.now()).then(r => r.json()).then(d => setGlobalBcvRate(d.bcv || 0)).catch(() => {});
  }, []);

  const [validezDias, setValidezDias] = useState(15);
  const [notas, setNotas] = useState('');
  
  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  const total = subtotal;

  const addItem = () => setItems([...items, { id: `item-${Date.now()}`, tipo: 'servicio', descripcion: '', cantidad: 1, precio_unitario: 0, moneda: 'USD' as const, total: 0, inventario_id: null }]);
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, f: string, v: any) => {
    const n = [...items];
    const item = { ...n[i], [f]: v };
    if (f === 'cantidad' || f === 'precio_unitario') item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    n[i] = item;
    setItems(n);
  };

  const handleSaveBudget = async () => {
    if (!clientName.trim()) return alert('El nombre del cliente es obligatorio.');
    
    setIsSaving(true);
    try {
      const numero = await generateNumeroPresupuesto();
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + validezDias);
      
      const payload = {
        numero,
        cliente_id: cita.cliente_id || null,
        cliente_nombre: clientName.trim(),
        cliente_telefono: clientPhone.trim() || null,
        vehiculo_id: cita.vehiculo_id || null,
        vehiculo_info: vehicleStr.trim() || null,
        moneda: 'USD',
        tasa_cambio: globalBcvRate,
        items,
        subtotal,
        descuento: 0,
        descuento_tipo: 'porcentaje',
        iva: 0,
        total,
        notas: notas.trim() || null,
        estado: 'borrador',
        validez_dias: validezDias,
        fecha_expiracion: expDate.toISOString(),
      };
      
      const result = await createPresupuesto(payload);
      if (!result) throw new Error('Error al crear presupuesto');
      
      generatePresupuestoPDF({
        numero,
        created_at: new Date().toISOString(),
        fecha_expiracion: expDate.toISOString(),
        cliente_nombre: payload.cliente_nombre,
        cliente_telefono: payload.cliente_telefono,
        vehiculo_info: payload.vehiculo_info,
        moneda: payload.moneda,
        tasa_cambio: payload.tasa_cambio,
        items,
        subtotal: payload.subtotal,
        descuento: 0,
        descuento_tipo: 'porcentaje',
        iva: 0,
        total: payload.total,
        notas: payload.notas,
        estado: 'borrador',
        validez_dias: payload.validez_dias,
      });
      
      alert(`¡Presupuesto #${numero} creado y guardado en la tabla de presupuestos con éxito!`);
      onClose();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-card border border-border w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden rounded-[32px] animate-in zoom-in-95 duration-300">
        
        <div className="p-6 border-b border-border flex items-center justify-between shrink-0 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[20px] bg-primary/20 flex items-center justify-center border border-primary/30">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight italic" style={{ fontFamily: 'Syne, sans-serif' }}>
                Generar Presupuesto
              </h3>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">A partir de Ticket #{cita.id.slice(0,8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-all group shrink-0">
            <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nombre del Cliente</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                value={clientName} onChange={e => setClientName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vehículo / Placa</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                value={vehicleStr} onChange={e => setVehicleStr(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-border rounded-[24px] bg-muted/10 overflow-hidden overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-12 gap-2 bg-muted/40 p-4 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <div className="col-span-6">Descripción</div>
              <div className="col-span-2 text-center">Cant</div>
              <div className="col-span-2 text-right">Precio $</div>
              <div className="col-span-2 text-right">Total $</div>
            </div>
            <div className="divide-y divide-border/50">
              {items.map((item, i) => (
                <div key={i} className="p-2 flex items-center gap-2">
                   <div className="w-8 flex justify-center shrink-0">
                     <button onClick={() => removeItem(i)} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                   <div className="grid grid-cols-12 gap-2 flex-1 items-center">
                     <div className="col-span-6">
                       <input 
                         className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary/50 focus:bg-background rounded-lg px-2 py-1.5 text-sm text-foreground outline-none transition-all"
                         value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)}
                       />
                     </div>
                     <div className="col-span-2">
                       <input 
                         type="number" min="1" step="1"
                         className="w-full text-center bg-transparent border border-transparent hover:border-border focus:border-primary/50 focus:bg-background rounded-lg px-2 py-1.5 text-sm font-mono text-foreground outline-none transition-all"
                         value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseFloat(e.target.value) || 0)}
                       />
                     </div>
                     <div className="col-span-2 relative">
                       <input 
                         type="number" min="0" step="0.01"
                         className="w-full text-right bg-transparent border border-transparent hover:border-border focus:border-primary/50 focus:bg-background rounded-lg pl-6 pr-2 py-1.5 text-sm font-mono text-foreground outline-none transition-all"
                         value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', parseFloat(e.target.value) || 0)}
                       />
                       <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">$</span>
                     </div>
                     <div className="col-span-2 text-right px-2 text-sm font-mono font-bold text-primary">
                       $ {item.total.toFixed(2)}
                     </div>
                   </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-muted/20 border-t border-border flex justify-center">
              <button 
                onClick={addItem}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-foreground hover:bg-primary px-4 py-2 rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" /> Agregar Ítem
              </button>
            </div>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Notas (Opcional)</label>
              <textarea 
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 outline-none transition-all resize-none h-24 custom-scrollbar"
                placeholder="Notas que aparecerán en el PDF..."
                value={notas} onChange={e => setNotas(e.target.value)}
              />
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-[24px] p-6 space-y-3 relative overflow-hidden">
               <div className="absolute right-0 top-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
               <div className="flex justify-between items-center relative z-10">
                 <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tasa BCV Referencial</span>
                 <span className="text-sm font-mono font-bold text-foreground">{globalBcvRate || 'Cargando...'} Bs</span>
               </div>
               <div className="flex justify-between items-end relative z-10 pt-2 border-t border-primary/10">
                 <span className="text-sm font-black uppercase tracking-[0.3em] text-primary">Total Presupuesto</span>
                 <div className="text-right">
                   <p className="text-3xl font-black text-primary font-mono leading-none">$ {total.toFixed(2)}</p>
                   <p className="text-xs font-bold text-muted-foreground mt-1 tracking-widest">{(total * (globalBcvRate || 1)).toFixed(2)} Bs</p>
                 </div>
               </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-border bg-card shrink-0">
          <Button 
            onClick={handleSaveBudget} 
            disabled={isSaving} 
            className="w-full h-16 rounded-[24px] bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 gap-3"
          >
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
            Guardar Presupuesto y Generar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
