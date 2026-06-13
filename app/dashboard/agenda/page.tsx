'use client';
import React, { useEffect } from 'react';
import { MessageSquare, Calendar, Clock, User, Car, Filter, ChevronLeft, ChevronRight, Plus, X, Check, Search, UserCheck, RefreshCw, Lock, Edit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui/status-badge';
import { supabase, fetchCitas, createCita, updateCita, deleteCita, fetchClientes, fetchVehiculos, createCliente, createVehiculo } from '@/lib/supabase';
import { Cita, TipoServicio, Cliente, Vehiculo } from '@/types';
import { cn, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';

const HORAS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
const TIPOS: { v: TipoServicio; l: string }[] = [
  { v: 'mecanica', l: 'Mecánica' }, { v: 'electronica', l: 'Electrónica' },
  { v: 'cerrajeria', l: 'Cerrajería' }, { v: 'diagnostico', l: 'Diagnóstico' },
  { v: 'motor', l: 'Motor' }, { v: 'emergencia', l: 'Emergencia' }
];
const ESTADOS_CITA = ['confirmada','pendiente','cancelada','completada', 'ocupado'];

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const estadoColorMap: Record<string, string> = {
  confirmada: 'bg-green-500/20 border-green-500/30 text-green-400',
  pendiente: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
  cancelada: 'bg-red-500/20 border-red-500/30 text-red-400',
  completada: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
  ocupado: 'bg-rose-600/30 border-rose-500/40 text-rose-600 dark:text-rose-200'
};

export default function AgendaPage() {
  const { user } = useAppStore();
  const { can } = useRolePermissions();
  const [mounted, setMounted] = React.useState(false);
  const [citas, setCitas] = React.useState<Cita[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [vehiculos, setVehiculos] = React.useState<Vehiculo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentYear, setCurrentYear] = React.useState(2026);
  const [currentMonth, setCurrentMonth] = React.useState(0);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [showModal, setShowModal] = React.useState(false);
  const [editCita, setEditCita] = React.useState<Cita | null>(null);
  const [isNewClient, setIsNewClient] = React.useState(false);
  const [isBlockedMode, setIsBlockedMode] = React.useState(false);
  const [isTemporalClient, setIsTemporalClient] = React.useState(false);
  const [selectedFilter, setSelectedFilter] = React.useState<{ label: string, type: string } | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ 
    cliente_id: '', 
    vehiculo_id: '', 
    fecha: '', 
    hora: '09:00', 
    tipo_servicio: 'mecanica', 
    descripcion: '', 
    estado: 'pendiente', 
    notas: '',
    costo_estimado: 0,
    // Campos para nuevo cliente
    nuevo_cliente: {
      nombre: '',
      apellido: '',
      telefono: '',
      marca: '',
      modelo: '',
      placa: ''
    }
  });

  useEffect(() => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    const dateStr = today.toISOString().split('T')[0];
    setSelectedDate(dateStr);
    setMounted(true);
  }, []);

  // Cargar datos sólo después de que el componente esté montado en cliente
  useEffect(() => {
    if (mounted) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  async function loadData() {
    setLoading(true);
    try {
      const [cData, clData, vData] = await Promise.all([
        fetchCitas(),
        fetchClientes(),
        fetchVehiculos()
      ]);
      if (cData) setCitas(cData);
      if (clData) setClientes(clData);
      if (vData) setVehiculos(vData);
    } catch {
      console.error('Error cargando agenda');
    } finally {
      setLoading(false);
    }
  }

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const getCitasForDate = (dateStr: string) => (citas || []).filter(c => c.fecha === dateStr);
  const citasDelDia = selectedDate ? getCitasForDate(selectedDate) : [];

  const openNew = () => {
    if (!can('agenda', 'crear')) return alert('No tienes permisos para agendar citas.');
    setEditCita(null);
    setIsNewClient(false);
    setIsBlockedMode(false);
    setIsTemporalClient(false);
    const dateStr = selectedDate || new Date().toISOString().split('T')[0];
    setForm({ 
      cliente_id:'', 
      vehiculo_id:'', 
      fecha: dateStr, 
      hora:'09:00', 
      tipo_servicio:'mecanica', 
      descripcion:'', 
      estado:'pendiente', 
      notas:'',
      costo_estimado: 0,
      nuevo_cliente: { nombre: '', apellido: '', telefono: '', marca: '', modelo: '', placa: '' }
    });
    setShowModal(true);
  };

  const handleOpenBlock = () => {
    setEditCita(null);
    setIsNewClient(false);
    setIsBlockedMode(true);
    setIsTemporalClient(false);
    const dateStr = selectedDate || new Date().toISOString().split('T')[0];
    setForm({ 
      cliente_id:'', 
      vehiculo_id:'', 
      fecha: dateStr, 
      hora:'09:00', 
      tipo_servicio:'mecanica', 
      descripcion:'HORARIO OCUPADO', 
      estado:'ocupado', 
      notas:'',
      costo_estimado: 0,
      nuevo_cliente: { nombre: '', apellido: '', telefono: '', marca: '', modelo: '', placa: '' }
    });
    setShowModal(true);
  };

  const openEdit = (c: Cita) => {
    if (!can('agenda', 'editar')) return alert('No tienes permisos para editar citas.');
    setEditCita(c);
    setIsNewClient(false);
    setIsBlockedMode(c.estado === 'ocupado');
    setIsTemporalClient(false);
    setForm({ 
      cliente_id:c.cliente_id || '', 
      vehiculo_id:c.vehiculo_id || '', 
      fecha:c.fecha, 
      hora:c.hora, 
      tipo_servicio:c.tipo_servicio, 
      descripcion:c.descripcion||'', 
      estado:c.estado, 
      notas:c.notas||'',
      costo_estimado: c.costo_estimado || 0,
      nuevo_cliente: { nombre: '', apellido: '', telefono: '', marca: '', modelo: '', placa: '' }
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      if (editCita) {
        await updateCita(editCita.id, {
          cliente_id: form.cliente_id,
          vehiculo_id: form.vehiculo_id,
          fecha: form.fecha,
          hora: form.hora,
          tipo_servicio: form.tipo_servicio,
          descripcion: form.descripcion,
          estado: form.estado,
          notas: form.notas,
          costo_estimado: form.costo_estimado
        });
        logActivity({
          usuario: user?.nombre || 'Admin', modulo: 'Agenda', accion: 'Actualizó cita',
          detalles: `Actualizó cita de ${editCita.nombre_cliente || 'cliente'} en agenda`,
          referencia_id: editCita.id, referencia_tabla: 'citas'
        });
      } else if (isBlockedMode) {
        const result = await createCita({
          fecha: form.fecha,
          hora: form.hora,
          tipo_servicio: 'otro',
          descripcion: form.descripcion || 'HORARIO OCUPADO',
          estado: 'ocupado'
        });
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Agenda',
          accion: 'Bloqueó horario',
          detalles: `${form.fecha} ${form.hora}: ${form.descripcion || 'OCUPADO'}`
        });
      } else if (isTemporalClient) {
        const result = await createCita({
          fecha: form.fecha,
          hora: form.hora,
          tipo_servicio: form.tipo_servicio,
          descripcion: form.descripcion,
          nombre_cliente: form.nuevo_cliente.nombre,
          telefono: form.nuevo_cliente.telefono,
          estado: 'pendiente'
        });
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Agenda',
          accion: 'Agendó cita (Temporal)',
          detalles: `${form.nuevo_cliente.nombre} - ${form.fecha} ${form.hora}`,
          referencia_id: (result as any)?.id,
          referencia_tabla: 'citas'
        });
      } else if (isNewClient) {
        const newClient = await createCliente({
          nombre: form.nuevo_cliente.nombre,
          apellido: form.nuevo_cliente.apellido,
          telefono: form.nuevo_cliente.telefono,
          email: ''
        });
        if (!newClient) throw new Error('Error al crear cliente');
        const newVehiculo = await createVehiculo({
          cliente_id: newClient.id,
          marca: form.nuevo_cliente.marca,
          modelo: form.nuevo_cliente.modelo,
          placa: form.nuevo_cliente.placa,
          anio: 2025,
          estado: 'activo'
        });
        if (!newVehiculo) throw new Error('Error al crear vehículo');
        const result = await createCita({
          cliente_id: newClient.id,
          vehiculo_id: newVehiculo.id,
          fecha: form.fecha,
          hora: form.hora,
          tipo_servicio: form.tipo_servicio,
          descripcion: form.descripcion,
          estado: form.estado,
          notas: form.notas,
          costo_estimado: form.costo_estimado
        });
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Agenda',
          accion: 'Agendó cita (Nuevo Cliente)',
          detalles: `${form.nuevo_cliente.nombre} ${form.nuevo_cliente.apellido} - ${form.fecha} ${form.hora}`,
          referencia_id: (result as any)?.id,
          referencia_tabla: 'citas'
        });
      } else {
        const result = await createCita({
          cliente_id: form.cliente_id || null,
          vehiculo_id: form.vehiculo_id || null,
          fecha: form.fecha,
          hora: form.hora,
          tipo_servicio: form.tipo_servicio,
          descripcion: form.descripcion,
          estado: form.estado,
          notas: form.notas || null,
          costo_estimado: form.costo_estimado || 0
        });
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Agenda',
          accion: 'Agendó cita',
          detalles: `${form.fecha} ${form.hora}`,
          referencia_id: (result as any)?.id,
          referencia_tabla: 'citas'
        });
      }
      setShowModal(false);
      await loadData();
    } catch (error) {
      console.error(error);
      alert('Error al guardar la cita');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!can('agenda', 'eliminar')) return alert('No tienes permisos para cancelar o eliminar citas.');
    if (confirm('¿Estás seguro de cancelar esta cita?')) {
      try {
        const cita = citas.find(c => c.id === id);
        await deleteCita(id);
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Agenda',
          accion: 'Eliminó cita',
          detalles: cita ? `${cita.fecha} ${cita.hora}` : id,
          referencia_id: id,
          referencia_tabla: 'citas'
        });
        loadData();
      } catch (_err) {
        console.error('Error deleting appointment');
        alert('Error al eliminar la cita');
      }
    }
  };

  const convertToServicio = async (cita: Cita) => {
    try {
      setLoading(true);
      const now = new Date();
      const vehiculo = getVehiculo(cita.vehiculo_id);
      const cliente = getCliente(cita.cliente_id);
      const payload = {
        cliente_id: cita.cliente_id,
        vehiculo_id: cita.vehiculo_id,
        nombre_cliente: cita.nombre_cliente || (cliente ? `${cliente.nombre} ${cliente.apellido}` : ''),
        telefono: cita.telefono || cliente?.telefono || '',
        vehiculo_info: vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : (cita.vehiculo_info || 'SIN-VEHICULO'),
        placa: vehiculo?.placa || 'SIN-PLACA',
        descripcion: cita.descripcion || 'Servicio desde agenda',
        tipo: cita.tipo_servicio,
        tipo_personalizado: null,
        estado: 'pendiente',
        costo_estimado: cita.costo_estimado || 0,
        registrado_por: user?.nombre || 'Admin',
        fecha: cita.fecha,
        hora: cita.hora,
        seguimiento: [{
          fecha: now.toISOString(),
          accion: 'Convertido desde cita en agenda',
          usuario: user?.nombre || 'Admin',
          tipo: 'sistema',
          progreso: 0,
        }],
      };
      const { error } = await withSedeFilter(supabase!.from('servicios')).insert(withSedeInsert(payload));
      if (error) throw error;
      await updateCita(cita.id, { estado: 'completada' });
      logActivity({
        usuario: user?.nombre || 'Admin', modulo: 'Agenda', accion: 'Convirtió cita a servicio',
        detalles: `Cita de ${cita.nombre_cliente || cita.cliente_id || ''} convertida a servicio`,
        referencia_id: cita.id, referencia_tabla: 'citas'
      });
      setShowModal(false);
      loadData();
    } catch (_err) {
      console.error('Error converting cita to servicio');
      alert('Error al convertir la cita a servicio');
    } finally {
      setLoading(false);
    }
  };

  const changeEstado = async (id: string, estado: string, cita?: Cita) => {
    try {
      await updateCita(id, { estado });

      if (estado === 'confirmada') {
        const cliente = getCliente(cita?.cliente_id || '');
        const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : (cita?.nombre_cliente || 'Cliente');
        const sedeName = (cita?.sede_id === '310595c5-5258-47fa-9b69-5ad9932685a7') ? 'Carrizal (Principal)' : 'Sede desconocida';
        
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Agenda',
          accion: 'Confirmó cita',
          detalles: `Cita confirmada: ${nombreCliente} en la sede de ${sedeName}`,
          referencia_id: id,
          referencia_tabla: 'citas'
        });
        console.log(`🔔 SISTEMA: Cita confirmada de ${nombreCliente} en ${sedeName}`);
        // Opcional: Podríamos añadir un setStatusMessage si existiera el estado, 
        // pero el logActivity ya cumple con la notificación al sistema.
      }

      // Auto-enviar WhatsApp si se confirma la cita
      if (estado === 'confirmada' && cita) {
        const cliente = getCliente(cita.cliente_id);
        const telefono = cita.telefono || cliente?.telefono;
        if (telefono) {
          const fechaLegible = new Date(cita.fecha + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
          const nombreCliente = cliente ? `${cliente.nombre}` : 'Cliente';
          const mensaje = `¡Hola ${nombreCliente}! Te confirmamos tu cita en Lycos Team 🔧

📅 Fecha: ${fechaLegible}
⏰ Hora: ${cita.hora}
🚗 Servicio: ${cita.descripcion || 'Servicio automotriz'}

Te esperamos puntual. Cualquier cambio avísanos con tiempo. 😊

— Lycos Team, San Antonio de los Altos`;
          try {
            await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: telefono, message: mensaje }),
            });
          } catch (sendErr) {
            console.error('Error enviando confirmación WhatsApp:', sendErr);
          }
        }
      }

      loadData();
    } catch {
      alert('Error al actualizar el estado');
    }
  };

  const getCliente = (id?: string | null) => id ? clientes.find(c => c.id === id) : null;
  const getVehiculo = (id?: string | null) => id ? vehiculos.find(v => v.id === id) : null;

  const getVehiculosByCliente = (clienteId: string) => vehiculos.filter(v => v.cliente_id === clienteId);

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const countConfirmadas = (citas || []).filter(c => c.estado === 'confirmada').length;
  const countPendientes = (citas || []).filter(c => c.estado === 'pendiente' && !c.descripcion?.includes('PROSPECTO:')).length;
  const countCompletadas = (citas || []).filter(c => c.estado === 'completada').length;
  const countProspectos = (citas || []).filter(c => c.descripcion?.includes('PROSPECTO:')).length;
  const citasHoyCount = getCitasForDate(getTodayStr()).length;

  // Calculo semanal (próximos 7 días)
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const citasSemanaCount = (citas || []).filter(c => {
    const d = new Date(c.fecha + 'T12:00:00');
    return d >= today && d <= nextWeek;
  }).length;

  // Calculo mensual (mes actual)
  const citasMesCount = (citas || []).filter(c => {
    const d = new Date(c.fecha + 'T12:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const getRangeStr = (filteredCitas: any[]) => {
    if (!filteredCitas || filteredCitas.length === 0) return 'Sin registros';
    const dates = filteredCitas.map(c => new Date(c.fecha + 'T12:00:00').getTime());
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
    return `${fmt(min)} al ${fmt(max)}`;
  };

  const handleStatClick = (label: string, type: string) => {
    setSelectedFilter({ label, type });
    setFilterDialogOpen(true);
  };

  const getFilteredCitas = (type: string) => {
    const todayStr = getTodayStr();
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    switch (type) {
      case 'hoy': return getCitasForDate(todayStr);
      case 'semana': return (citas || []).filter(c => {
        const d = new Date(c.fecha + 'T12:00:00');
        return d >= today && d <= nextWeek;
      });
      case 'mes': return (citas || []).filter(c => {
        const d = new Date(c.fecha + 'T12:00:00');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      case 'pendientes': return (citas || []).filter(c => c.estado === 'pendiente' && !c.descripcion?.includes('PROSPECTO:'));
      case 'prospectos': return (citas || []).filter(c => c.descripcion?.includes('PROSPECTO:'));
      case 'confirmadas': return (citas || []).filter(c => c.estado === 'confirmada');
      case 'completadas': return (citas || []).filter(c => c.estado === 'completada');
      default: return [];
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      {loading && !showModal ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Agenda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{citasHoyCount} citas para hoy · {citasSemanaCount} esta semana</p>
        </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={handleOpenBlock} variant="outline" className="glass-card border-rose-500/30 text-rose-400 hover:bg-rose-500/10">
              <Lock className="w-4 h-4 mr-2" />
              Bloquear Horario
            </Button>
            <Button onClick={openNew} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Cita
            </Button>
          </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Hoy', value: citasHoyCount, color: 'text-primary', type: 'hoy', range: getTodayStr().split('-').reverse().slice(0,2).join('/') },
          { label: 'Esta Semana', value: citasSemanaCount, color: 'text-blue-400', type: 'semana', range: getRangeStr(getFilteredCitas('semana')) },
          { label: 'Mes Actual', value: citasMesCount, color: 'text-purple-400', type: 'mes', range: getRangeStr(getFilteredCitas('mes')) },
          { label: 'Prospectos', value: countProspectos, color: 'text-cyan-400', type: 'prospectos', range: 'Por llamar / Interés' },
          { label: 'Pendientes', value: countPendientes, color: 'text-yellow-400', type: 'pendientes', range: getRangeStr(getFilteredCitas('pendientes')) },
          { label: 'Confirmadas', value: countConfirmadas, color: 'text-green-400', type: 'confirmadas', range: getRangeStr(getFilteredCitas('confirmadas')) },
          { label: 'Completadas', value: countCompletadas, color: 'text-emerald-400', type: 'completadas', range: getRangeStr(getFilteredCitas('completadas')) },
        ].map(s => (
          <button 
            key={s.label} 
            onClick={() => handleStatClick(s.label, s.type)}
            className="stat-card border border-border/50 p-3 cursor-pointer text-left group"
          >
            <div className="flex justify-between items-start">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{s.label}</p>
              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className={`text-2xl font-bold mt-1 ${s.color}`} style={{ fontFamily: 'Syne, sans-serif' }}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground/60 mt-1.5 font-medium">{s.range}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{MONTHS[currentMonth]} {currentYear}</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => { const now = new Date(); setCurrentMonth(now.getMonth()); setCurrentYear(now.getFullYear()); setSelectedDate(now.toISOString().split('T')[0]); }}>Hoy</Button>
                <Button variant="ghost" size="icon-sm" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const citasCount = getCitasForDate(dateStr).length;
                const isToday = mounted && dateStr === getTodayStr();
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={cn(
                      'relative flex flex-col items-center py-1.5 rounded-lg transition-all text-sm',
                      isSelected ? 'bg-primary text-primary-foreground' :
                      isToday ? 'bg-primary/10 text-primary border border-primary/20' :
                      'hover:bg-muted/50 text-foreground'
                    )}
                  >
                    <span className="font-medium text-xs">{day}</span>
                    {citasCount > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {Array.from({ length: Math.min(citasCount, 3) }).map((_, j) => (
                          <span key={j} className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-primary-foreground/70' : 'bg-primary')} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Citas del día seleccionado */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {selectedDate ? formatDate(selectedDate + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Selecciona un día'}
              </CardTitle>
              {citasDelDia.length > 0 && (
                <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">{citasDelDia.length}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {citasDelDia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Sin citas este día</p>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={openNew}>+ Agendar cita</Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {citasDelDia.sort((a,b) => a.hora.localeCompare(b.hora)).map((cita, idx) => {
                  const cliente = getCliente(cita.cliente_id);
                  const vehiculo = getVehiculo(cita.vehiculo_id);
                  return (
                    <div key={cita.id || `cita-dia-${idx}`} className={cn('p-3 rounded-xl border transition-all hover:opacity-90 cursor-pointer group', estadoColorMap[cita.estado] || 'bg-muted/30 border-border/30')} onClick={() => openEdit(cita)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span className="text-xs font-bold">{cita.hora}</span>
                        </div>
                        <StatusBadge status={cita.estado} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs mb-1">
                        <User className="w-3 h-3 opacity-60" />
                        <span className="font-medium truncate">
                          {cliente ? `${cliente.nombre} ${cliente.apellido}` : (cita.nombre_cliente || cita.telefono || '—')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs opacity-80">
                        <Car className="w-3 h-3 opacity-60" />
                        <span>{vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} · ${vehiculo.placa}` : '—'}</span>
                      </div>
                      {cita.descripcion && <p className="text-[10px] opacity-70 mt-1 truncate">{cita.descripcion}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming appointments list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas Citas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  {['Fecha / Hora','Cliente','Vehículo','Servicio','Estado','Acciones'].map(h => (
                    <th key={h} className="text-left p-3 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {citas
                  .filter(c => c.fecha >= new Date().toISOString().split('T')[0])
                  .sort((a,b) => (a.fecha+a.hora).localeCompare(b.fecha+b.hora))
                  .slice(0,8).map((cita, idx) => {
                  const cliente = getCliente(cita.cliente_id);
                  const vehiculo = getVehiculo(cita.vehiculo_id);
                  return (
                    <tr key={cita.id || idx} className="hover:bg-muted/30 transition-colors group">
                      <td className="p-3">
                        <div>
                          <p className="text-xs font-medium">{formatDate(cita.fecha + 'T12:00:00', { day: '2-digit', month: 'short' })}</p>
                          <p className="text-[11px] text-muted-foreground">{cita.hora}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="text-xs font-medium">
                          {cliente ? `${cliente.nombre} ${cliente.apellido}` : (cita.nombre_cliente || cita.telefono || '—')}
                        </p>
                      </td>
                      <td className="p-3">
                        <p className="text-xs">{vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : '—'}</p>
                        <p className="text-[10px] text-muted-foreground">{vehiculo?.placa}</p>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={cita.tipo_servicio} type="tipo" />
                      </td>
                      <td className="p-3">
                          <Select value={cita.estado} onValueChange={v => changeEstado(cita.id, v, cita)}>
                          <SelectTrigger className="h-7 border-0 bg-transparent p-0 w-28 focus:ring-0">
                            <StatusBadge status={cita.estado} />
                          </SelectTrigger>
                          <SelectContent>
                            {ESTADOS_CITA.map(e => <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(cita)} className="w-7 h-7 rounded-lg hover:bg-muted/50 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleDelete(cita.id)} className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center">
                            <X className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className={cn(
          "max-h-[90vh] overflow-y-auto",
          editCita && editCita.estado !== 'ocupado' && editCita.estado !== 'completada' && editCita.estado !== 'cancelada'
            ? "sm:max-w-2xl"
            : "sm:max-w-lg"
        )}>
          <DialogHeader>
            <DialogTitle>{editCita ? 'Editar Cita' : 'Nueva Cita'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editCita && !isBlockedMode && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                  <input 
                    type="checkbox" 
                    id="isNewClient" 
                    checked={isNewClient} 
                    onChange={(e) => {
                      setIsNewClient(e.target.checked);
                      if (e.target.checked) setIsTemporalClient(false);
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="isNewClient" className="text-xs font-bold text-primary cursor-pointer">Registrar como Nuevo Cliente</label>
                </div>

                <div className="flex items-center gap-2 mb-2 p-2 bg-orange-500/5 rounded-lg border border-orange-500/20">
                  <input 
                    type="checkbox" 
                    id="isTemporalClient" 
                    checked={isTemporalClient} 
                    onChange={(e) => {
                      setIsTemporalClient(e.target.checked);
                      if (e.target.checked) setIsNewClient(false);
                    }}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <label htmlFor="isTemporalClient" className="text-xs font-bold text-orange-500 cursor-pointer">Cliente Temporal (Solo Nombre/Telf)</label>
                </div>
              </div>
            )}

            {isBlockedMode ? (
              <div className="space-y-4 p-4 bg-rose-500/5 rounded-xl border border-rose-500/20 animate-in fade-in zoom-in-95">
                <div className="flex items-center gap-2 text-rose-400 mb-2">
                  <Lock className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Bloqueo de Horario</span>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Motivo del Bloqueo *</label>
                  <Input 
                    placeholder="Ej: Almuerzo, Mantenimiento, Taller Lleno" 
                    value={form.descripcion} 
                    onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                  />
                </div>
              </div>
            ) : isTemporalClient ? (
              <div className="space-y-3 p-3 bg-orange-500/5 rounded-xl border border-orange-500/20 animate-in fade-in slide-in-from-top-2">
                <p className="text-[10px] font-bold uppercase text-orange-500 tracking-widest">Datos Cliente Temporal</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Nombre / Identificación *</label>
                    <Input className="h-8 text-xs font-medium" value={form.nuevo_cliente.nombre} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, nombre: e.target.value } }))} placeholder="Ej: Cliente de paso / Consulta" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Teléfono (WhatsApp)</label>
                    <Input className="h-8 text-xs" value={form.nuevo_cliente.telefono} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, telefono: e.target.value } }))} placeholder="Ej: 584120000000" />
                  </div>
                </div>
              </div>
            ) : isNewClient && !editCita ? (
              <div className="space-y-3 p-3 bg-primary/5 rounded-xl border border-primary/20 animate-in fade-in slide-in-from-top-2">
                <p className="text-[10px] font-bold uppercase text-primary tracking-widest">Datos del Nuevo Cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Nombre *</label>
                    <Input className="h-8 text-xs" value={form.nuevo_cliente.nombre} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, nombre: e.target.value } }))} placeholder="Ej: Juan" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Apellido *</label>
                    <Input className="h-8 text-xs" value={form.nuevo_cliente.apellido} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, apellido: e.target.value } }))} placeholder="Ej: Perez" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">WhatsApp (Sin +) *</label>
                  <Input className="h-8 text-xs" value={form.nuevo_cliente.telefono} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, telefono: e.target.value } }))} placeholder="Ej: 584120000000" />
                </div>
                <p className="text-[10px] font-bold uppercase text-primary tracking-widest mt-2">Datos del Vehículo</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Marca *</label>
                    <Input className="h-8 text-xs" value={form.nuevo_cliente.marca} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, marca: e.target.value } }))} placeholder="Ej: Toyota" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Modelo *</label>
                    <Input className="h-8 text-xs" value={form.nuevo_cliente.modelo} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, modelo: e.target.value } }))} placeholder="Ej: Corolla" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Placa *</label>
                  <Input className="h-8 text-xs" value={form.nuevo_cliente.placa} onChange={e => setForm(p => ({ ...p, nuevo_cliente: { ...p.nuevo_cliente, placa: e.target.value } }))} placeholder="Ej: ABC-123" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Cliente *</label>
                  <Select value={form.cliente_id} onValueChange={v => { setForm(p => ({ ...p, cliente_id: v, vehiculo_id: '' })); }}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>{(clientes || []).map((c, idx) => <SelectItem key={c.id || idx} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Vehículo *</label>
                  <Select 
                    value={form.vehiculo_id} 
                    onValueChange={v => setForm(p => ({ ...p, vehiculo_id: v }))}
                    disabled={!form.cliente_id}
                  >
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder={form.cliente_id ? "Seleccionar vehículo" : "Primero selecciona un cliente"} /></SelectTrigger>
                    <SelectContent>
                      {(vehiculos || []).filter(v => v.cliente_id === form.cliente_id).map((v, idx) => (
                        <SelectItem key={v.id || idx} value={v.id}>{v.marca} {v.modelo} ({v.placa})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Fecha *</label>
                <Input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Hora *</label>
                <Select value={form.hora} onValueChange={v => setForm(p => ({ ...p, hora: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HORAS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipo Servicio</label>
                <Select value={form.tipo_servicio} onValueChange={v => setForm(p => ({ ...p, tipo_servicio: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Costo Estimado ($)</label>
                <Input type="number" value={form.costo_estimado} onChange={e => setForm(p => ({ ...p, costo_estimado: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <Select value={form.estado} onValueChange={v => setForm(p => ({ ...p, estado: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS_CITA.map(e => <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase()+e.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descripción / Motivo</label>
              <textarea
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="¿Qué le hace falta al carro?"
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 mt-4">
            {editCita && editCita.estado !== 'ocupado' && editCita.estado !== 'completada' && editCita.estado !== 'cancelada' && (
              <Button
                variant="outline"
                className="w-full gap-1.5 text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                onClick={() => convertToServicio(editCita)}
                disabled={loading}
              >
                <Check className="w-3.5 h-3.5" /> Convertir a Servicio
              </Button>
            )}
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button 
                onClick={handleSave}
                disabled={loading || (!isBlockedMode && !isTemporalClient && !isNewClient && (!form.cliente_id || !form.vehiculo_id)) || (isNewClient && (!form.nuevo_cliente.nombre || !form.nuevo_cliente.telefono || !form.nuevo_cliente.placa)) || (isTemporalClient && !form.nuevo_cliente.nombre) || !form.fecha}
                className="flex-1 gap-2"
              >
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                {editCita ? 'Guardar Cambios' : 'Agendar Cita'}
              </Button>
            </div>
            {editCita && (
              <div className="flex justify-center pt-1 border-t border-border/20">
                <Button variant="ghost" className="gap-2 text-xs h-8" asChild>
                  <Link href={`/dashboard/whatsapp?chat=${(editCita.cliente_id ? getCliente(editCita.cliente_id)?.telefono : null) || editCita.telefono || ''}`}>
                    <UserCheck className="w-3.5 h-3.5" /> Ver Perfil / Chat
                  </Link>
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
    )}
      {/* Dialog para ver lista filtrada de citas */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col glass-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
              Citas: {selectedFilter?.label}
            </DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto mt-4 pr-1">
            {selectedFilter && getFilteredCitas(selectedFilter.type).length > 0 ? (
              <div className="space-y-3">
                {getFilteredCitas(selectedFilter.type).map((cita: any, idx: number) => {
                  const cliente = getCliente(cita.cliente_id);
                  const vehiculo = getVehiculo(cita.vehiculo_id);
                  return (
                    <div 
                      key={cita.id || `cita-filter-${idx}`} 
                      className="p-3 border border-border/50 bg-muted/30 rounded-lg flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            cita.estado === 'confirmada' ? 'bg-green-500' : 
                            cita.estado === 'pendiente' ? 'bg-yellow-500' : 
                            cita.estado === 'completada' ? 'bg-emerald-500' : 'bg-gray-500'
                          }`} />
                          <p className="font-bold text-sm">
                            {cliente ? `${cliente.nombre} ${cliente.apellido}` : (cita.nombre_cliente || cita.telefono)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          📅 {cita.fecha} | 🕒 {cita.hora}
                        </p>
                        {vehiculo && (
                          <p className="text-[10px] text-primary mt-0.5">
                            🚗 {vehiculo.marca} {vehiculo.modelo} {cita.placa ? `[${cita.placa}]` : ''}
                          </p>
                        )}
                        <p className="text-xs mt-1.5 italic line-clamp-1">{cita.descripcion}</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setFilterDialogOpen(false);
                          openEdit(cita);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground">
                No hay citas registradas en esta categoría.
              </div>
            )}
          </div>
          
          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={() => setFilterDialogOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
