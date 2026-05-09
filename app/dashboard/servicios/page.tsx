'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench, Search, Calendar, Clock,
  CheckCircle, AlertCircle, Loader2, RefreshCw, User, Car,
  Phone, ChevronDown, X, Banknote, BadgeCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Eye, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

// ── Types ─────────────────────────────────────────────────────
interface CitaServicio {
  id: string;
  fecha: string;
  hora: string;
  tipo_servicio: string;
  descripcion: string | null;
  estado: string;
  nombre_cliente: string | null;
  vehiculo_info: string | null;
  placa: string | null;
  telefono: string | null;
  created_at: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  costo_estimado?: number | null;
  // Joined
  clientes?: { nombre: string; apellido: string; telefono: string } | null;
  vehiculos?: { marca: string; modelo: string; placa: string; anio?: number } | null;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20',  icon: AlertCircle },
  confirmada:  { label: 'Confirmada',  color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',    icon: Calendar },
  completada:  { label: 'Completada',  color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20',  icon: CheckCircle },
  cancelada:   { label: 'Cancelada',   color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',      icon: X },
  en_proceso:  { label: 'En Proceso',  color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20', icon: Loader2 },
};

const SERVICIO_LABELS: Record<string, string> = {
  mecanica: 'Mecánica', electronica: 'Electrónica', cerrajeria: 'Cerrajería',
  diagnostico: 'Diagnóstico', motor: 'Motor', emergencia: 'Emergencia', otro: 'Servicio General',
};

function formatDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${day} ${months[parseInt(m) - 1]} ${y}`;
}
function formatHora(h: string) {
  if (!h) return '—';
  const [hh, mm] = h.split(':');
  const hour = parseInt(hh);
  return `${hour > 12 ? hour - 12 : hour || 12}:${mm} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function InvoiceModal({ cita, inventory, onClose }: { cita: CitaServicio; inventory: any[]; onClose: () => void }) {
  const [clientName, setClientName] = useState(cita.clientes
    ? `${cita.clientes.nombre} ${cita.clientes.apellido}`
    : cita.nombre_cliente || 'Consumidor Final');

  const [vehicleStr, setVehicleStr] = useState(cita.vehiculos
    ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo} (${cita.vehiculos.placa})`
    : cita.vehiculo_info || '—');

  // Initialize items with matching logic
  const [items, setItems] = useState(() => {
    // Attempt matching
    const match = inventory.find((i: any) => 
      (cita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
      i.nombre.toLowerCase().trim().includes((cita.descripcion || '').toLowerCase().trim()) ||
      (SERVICIO_LABELS[cita.tipo_servicio] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
    );

    const price = match?.precio_usd || cita.costo_estimado || 0;
    return [{
      descripcion: cita.descripcion || SERVICIO_LABELS[cita.tipo_servicio] || 'Servicio General',
      cantidad: 1,
      precio_unitario: price,
      total: price
    }];
  });

  const addItem = () => {
    setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    
    if (field === 'cantidad' || field === 'precio_unitario') {
      item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    }
    
    newItems[index] = item;
    setItems(newItems);
  };

  const total = items.reduce((sum, item) => sum + (item.total || 0), 0);

  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'efectivo_usd' | 'zelle' | 'pago_movil' | 'punto_de_venta' | 'efectivo_ves'>('efectivo_usd');

  const handleDownload = () => {
    generateInvoicePDF({
      id: cita.id,
      fecha: cita.fecha,
      cliente: clientName,
      vehiculo: vehicleStr,
      items: items,
      total: total,
      notas: cita.descripcion || undefined
    });
  };

  const handleFinalizeSale = async () => {
    if (!supabase) return;
    try {
      setIsSaving(true);
      
      // 1. Prepare breakdown JSON for "ventas_dia" compatibility
      const itemsJson = JSON.stringify(items, null, 2);
      const finalNotas = `[FACTURA_IA_START]\n${itemsJson}\n[FACTURA_IA_END]\n\nNotas adicionales: ${cita.descripcion || 'Sin notas'}`;

      // 2. Insert into ventas_dia (Cierre de Caja)
      const { error: ventaError } = await withSedeFilter(supabase.from('ventas_dia')).insert(withSedeInsert({
        fecha: new Date().toISOString().split('T')[0],
        cliente: clientName,
        total_ingresos: total,
        total_servicios: items.length,
        total_clientes: 1,
        desglose: items,
        metodos_pago: { [paymentMethod]: total },
        notas: finalNotas,
        creado_por: 'Admin'
      }));

      if (ventaError) throw ventaError;

      // 3. Update Cita status to completed
      const { error: citaError } = await withSedeFilter(supabase.from('citas'))
        .update({ estado: 'completada' })
        .eq('id', cita.id);

      if (citaError) throw citaError;

      // 4. Log Activity
      logActivity({
        usuario: 'Admin',
        modulo: 'Servicios',
        accion: 'Venta Finalizada',
        detalles: `Venta registrada para ${clientName} por $${total.toFixed(2)}`,
        referencia_id: cita.id,
        referencia_tabla: 'citas'
      });

      // 5. Trigger PDF Download
      handleDownload();

      // 6. Close and Success
      alert('¡Venta registrada con éxito en el cierre de caja!');
      onClose();
      window.location.reload(); // Refresh to show updated status
    } catch (err: any) {
      console.error(err);
      alert('Error al registrar la venta: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-muted/20">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Editor de Factura en Tiempo Real
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={addItem}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors uppercase tracking-wider"
            >
              <Plus className="w-3 h-3" /> Añadir Item
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto bg-white text-slate-900 font-sans">
          <div className="border border-slate-200 p-8 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">LYCOS TEAM</h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Taller Automotriz Profesional</p>
                <p className="text-[9px] text-slate-400 mt-2">San Antonio de los Altos, Miranda</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase">Factura de Servicio</p>
                <p className="text-sm font-bold text-slate-900">#{cita.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 mt-1">{cita.fecha}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Cliente:</p>
                <input 
                  className="w-full text-xs font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none transition-colors"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
                <p className="text-[10px] text-slate-500 mt-1">{cita.telefono || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Vehículo:</p>
                <input 
                  className="w-full text-right text-xs text-slate-600 font-bold bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none transition-colors"
                  value={vehicleStr}
                  onChange={(e) => setVehicleStr(e.target.value)}
                />
              </div>
            </div>

            <table className="w-full text-xs mb-8">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-bold text-slate-900">Descripción del Trabajo / Repuesto</th>
                  <th className="text-center py-2 font-bold text-slate-900 w-16">Cant.</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Precio</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, i) => (
                  <tr key={i} className="group">
                    <td className="py-3">
                      <input 
                        className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none transition-colors py-1"
                        value={item.descripcion}
                        placeholder="Descripción del item..."
                        onChange={(e) => updateItem(i, 'descripcion', e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <input 
                        type="number"
                        className="w-full text-center bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none transition-colors py-1"
                        value={item.cantidad}
                        onChange={(e) => updateItem(i, 'cantidad', parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end">
                        <span className="text-slate-400 mr-1">$</span>
                        <input 
                          type="number"
                          className="w-20 text-right bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none transition-colors py-1"
                          value={item.precio_unitario}
                          onChange={(e) => updateItem(i, 'precio_unitario', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900">
                      ${(item.total || 0).toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      {items.length > 1 && (
                        <button 
                          onClick={() => removeItem(i)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-4">
              <div className="w-48 space-y-2">
                <div className="flex justify-between text-xs font-black text-slate-900 pt-2 border-t-2 border-slate-900">
                  <span>TOTAL FACTURA</span>
                  <span className="text-primary text-sm">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-4 border-t border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notas / Garantía:</p>
              <textarea 
                className="w-full text-[10px] text-slate-500 leading-relaxed italic bg-transparent border-none focus:ring-0 resize-none min-h-[60px]"
                defaultValue={cita.descripcion || 'Servicio realizado bajo estándares de calidad Lycos Team.'}
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/30 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Cobrar por:</span>
            <select 
              value={paymentMethod}
              onChange={(e: any) => setPaymentMethod(e.target.value)}
              className="bg-background border border-border rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="efectivo_usd">Efectivo USD</option>
              <option value="zelle">Zelle</option>
              <option value="pago_movil">Pago Móvil</option>
              <option value="punto_de_venta">Punto de Venta</option>
              <option value="efectivo_ves">Efectivo VES</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <Button 
              onClick={() => {
                if(confirm(`¿Confirmar registro de venta por $${total.toFixed(2)} a ${clientName}?`)) {
                  handleFinalizeSale();
                }
              }} 
              disabled={isSaving}
              className="gap-2 px-6 bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
              Registrar Venta y Cobrar
            </Button>
            <Button variant="outline" onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" /> Solo PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServiciosPage() {
  const { user } = useAppStore();
  const [citas, setCitas] = useState<CitaServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedCita, setSelectedCita] = useState<CitaServicio | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);

  const loadCitas = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // Load inventory for price matching
      const { data: invData } = await supabase.from('inventario').select('nombre, precio_usd').eq('activo', true);
      setInventory(invData || []);

      // Load citas with joined client and vehicle data
      const { data, error } = await supabase
        .from('citas')
        .select(`
          id, fecha, hora, tipo_servicio, descripcion, estado,
          nombre_cliente, vehiculo_info, placa, telefono, created_at,
          cliente_id, vehiculo_id,
          clientes (nombre, apellido, telefono),
          vehiculos (marca, modelo, placa, anio)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) { console.error('Error loading citas:', error.message); }
      setCitas((data as unknown as CitaServicio[]) || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadCitas(); }, [loadCitas]);

  // Realtime subscription
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('servicios-citas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => loadCitas())
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [loadCitas]);

  const updateEstado = async (id: string, estado: string) => {
    if (!supabase) return;
    setUpdatingId(id);
    await withSedeFilter(supabase.from('citas')).update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
    
    // Log activity
    const cita = citas.find(c => c.id === id);
    logActivity({
      usuario: user?.nombre || 'Sistema',
      modulo: 'Servicios',
      accion: 'Cambió estado',
      detalles: `Ticket #${id.slice(0,5)}: ${cita?.estado || '?'} -> ${estado}`,
      referencia_id: id,
      referencia_tabla: 'citas'
    });
    
    setCitas(prev => prev.map(c => c.id === id ? { ...c, estado } : c));
    setUpdatingId(null);
  };

  const filtered = citas.filter(c => {
    const clienteName = c.clientes
      ? `${c.clientes.nombre} ${c.clientes.apellido}`
      : c.nombre_cliente || '';
    const vehicleStr = c.vehiculos
      ? `${c.vehiculos.marca} ${c.vehiculos.modelo}`
      : c.vehiculo_info || '';
    const txt = `${c.descripcion} ${clienteName} ${vehicleStr} ${c.placa} ${c.telefono}`.toLowerCase();
    const matchSearch = search === '' || txt.includes(search.toLowerCase());
    const matchEstado = filterEstado === 'todos' || c.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const countByEstado = (e: string) => citas.filter(c => c.estado === e).length;
  const total = citas.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            Servicios
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Cargando...' : `${total} tickets en total · datos en tiempo real`}
          </p>
        </div>
        <button
          onClick={loadCitas}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-border/30 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Estado Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = countByEstado(key);
          return (
            <button
              key={key}
              onClick={() => setFilterEstado(filterEstado === key ? 'todos' : key)}
              className={`relative p-3 rounded-xl border text-left transition-all duration-200 ${
                filterEstado === key
                  ? `${cfg.bg} border-opacity-60`
                  : 'bg-card/50 border-border/30 hover:bg-card/80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium">{cfg.label}</span>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              <p className={`text-2xl font-bold ${cfg.color}`} style={{ fontFamily: 'Syne, sans-serif' }}>
                {count}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, vehículo, placa, descripción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={filterEstado}
          onChange={e => setFilterEstado(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30 bg-muted/10">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Servicio / Descripción
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Cliente
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Vehículo
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Estado
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Fecha Cita
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                  Creado
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Cargando tickets de servicio...</p>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <Wrench className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No se encontraron servicios</p>
                    {search && (
                      <button onClick={() => setSearch('')} className="mt-2 text-xs text-primary hover:underline">
                        Limpiar búsqueda
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {!loading && filtered.map(cita => {
                const cfg = ESTADO_CONFIG[cita.estado] || ESTADO_CONFIG.pendiente;
                const Icon = cfg.icon;
                const clienteName = cita.clientes
                  ? `${cita.clientes.nombre} ${cita.clientes.apellido}`
                  : cita.nombre_cliente || '—';
                const clientePhone = cita.clientes?.telefono || cita.telefono || '';
                const vehicleStr = cita.vehiculos
                  ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}`
                  : cita.vehiculo_info || '—';
                const placaStr = cita.vehiculos?.placa || cita.placa || '';
                const tipoLabel = SERVICIO_LABELS[cita.tipo_servicio] || cita.tipo_servicio;

                return (
                  <tr 
                    key={cita.id} 
                    className="border-b border-border/10 hover:bg-white/2 transition-colors cursor-pointer group"
                    onClick={() => setSelectedCita(cita)}
                  >
                  {/* Servicio/Descripción */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Wrench className="w-3.5 h-3.5 text-primary" />
                      </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[200px] md:max-w-xs">
                            {cita.descripcion || tipoLabel}
                          </p>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary mt-0.5">
                            {tipoLabel}
                          </span>
                          {/* Mobile: show cliente */}
                          <p className="text-xs text-muted-foreground mt-0.5 md:hidden flex items-center gap-1">
                            <User className="w-3 h-3" /> {clienteName}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Cliente */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div>
                        <p className="text-sm font-medium">{clienteName}</p>
                        {clientePhone && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">+{clientePhone.replace(/^\+/, '')}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Vehículo */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Car className="w-3 h-3 text-muted-foreground" />
                          <p className="text-sm">{vehicleStr}</p>
                        </div>
                        {placaStr && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-muted/50 text-muted-foreground mt-0.5">
                            {placaStr}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3">
                      <div className="relative">
                        <select
                          value={cita.estado}
                          onChange={e => updateEstado(cita.id, e.target.value)}
                          disabled={updatingId === cita.id}
                          className={`appearance-none text-xs font-semibold px-2.5 py-1 pr-6 rounded-lg border cursor-pointer transition-all focus:outline-none ${cfg.bg} ${cfg.color}`}
                        >
                          {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                        {updatingId === cita.id
                          ? <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />
                          : <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        }
                      </div>
                    </td>

                    {/* Fecha Cita */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span>{formatDate(cita.fecha)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatHora(cita.hora)}</span>
                        </div>
                      </div>
                    </td>

                    {/* Creado */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground">{timeAgo(cita.created_at)}</span>
                    </td>
                    
                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <button 
                        onClick={() => setSelectedCita(cita)}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        Ver Factura
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border/20 bg-muted/5">
            <p className="text-xs text-muted-foreground">
              Mostrando {filtered.length} de {total} tickets · {
                Object.entries(ESTADO_CONFIG)
                  .filter(([k]) => countByEstado(k) > 0)
                  .map(([k, v]) => `${countByEstado(k)} ${v.label.toLowerCase()}`)
                  .join(' · ')
              }
            </p>
          </div>
        )}
      </div>

      {selectedCita && (
        <InvoiceModal
          cita={selectedCita}
          inventory={inventory}
          onClose={() => setSelectedCita(null)}
        />
      )}
    </div>
  );
}
