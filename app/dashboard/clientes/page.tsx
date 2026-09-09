'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, Mail, Car, Edit, Trash2, Eye, ArrowRightLeft, Wallet, Wrench } from 'lucide-react';
import GastosVehiculoModal from '@/components/egresos/GastosVehiculoModal';
import PerfilCliente from '@/components/clientes/PerfilCliente';
import { SEGMENTOS, textoUltimaVisita, contarSegmentos,
  type DesempenoCliente, type Segmento } from '@/lib/clientes/desempeno';
import { formatearCedula } from '@/lib/clientes/identidad';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fetchClientes, createCliente, updateCliente, deleteCliente, syncClientData } from '@/lib/supabase';
import { Cliente, Vehiculo } from '@/types';
import { formatDate, getInitials, cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { createVehiculo, updateVehiculo, deleteVehiculo } from '@/lib/supabase';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, FilterX, Clock, SortAsc, SortDesc } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import TransferVehiculoModal from '@/components/TransferVehiculoModal';

const COLORS = ['bg-blue-500/20 text-blue-400','bg-purple-500/20 text-purple-400','bg-green-500/20 text-green-400','bg-orange-500/20 text-orange-400','bg-pink-500/20 text-pink-400','bg-cyan-500/20 text-cyan-400'];

export default function ClientesPage() {
  const { user } = useAppStore();
  const { can } = useRolePermissions();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [viewCliente, setViewCliente] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', telefono: '', cedula: '', direccion: '', notas: '' });
  
  // ── Desempeño del cliente ────────────────────────────────────────────────
  // Cuántos servicios lleva, cuánto ha dejado y cuándo vino por última vez. Se
  // pide agregado al servidor: contar aquí obligaría a traerse los 522
  // servicios y los vehículos cada vez que se abre la pantalla.
  const [desempeno, setDesempeno] = useState<DesempenoCliente[]>([]);
  const [segmentoFiltro, setSegmentoFiltro] = useState<Segmento | 'todos'>('todos');

  const desempenoPor = React.useMemo(
    () => Object.fromEntries(desempeno.map(d => [d.cliente_id, d])) as Record<string, DesempenoCliente>,
    [desempeno],
  );
  const conteoSegmentos = React.useMemo(() => contarSegmentos(desempeno), [desempeno]);

  // Filtering & Sorting
  const [sortBy, setSortBy] = useState('recent');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  
  // Vehiculo management
  const [showVehiculoModal, setShowVehiculoModal] = useState(false);
  const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
  const [transferVehiculoTarget, setTransferVehiculoTarget] = useState<Vehiculo | null>(null);
  const [gastosTarget, setGastosTarget] = useState<Vehiculo | null>(null);
  const [vForm, setVForm] = useState({ marca: '', modelo: '', anio: new Date().getFullYear(), color: '', placa: '' });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  if (!mounted) return null;

  async function loadData() {
    setLoading(true);
    try {
      const cData = await fetchClientes();
      if (cData) setClientes(cData);
      // El desempeño va aparte y no bloquea la lista: si falla, los clientes se
      // ven igual, solo sin sus etiquetas.
      try {
        const r = await fetch('/api/clientes/desempeno');
        const d = await r.json();
        if (Array.isArray(d?.clientes)) setDesempeno(d.clientes);
      } catch {
        console.error('No se pudo cargar el desempeño de los clientes');
      }
    } catch {
      console.error('Error loading data');
    } finally {
      setLoading(false);
    }
  }

  const filtered = (clientes || [])
    .filter(c => {
      // Search text
      const matchesSearch = `${c.nombre} ${c.apellido} ${c.email} ${c.telefono} ${c.cedula}`.toLowerCase().includes(search.toLowerCase());
      
      // Date filter
      let matchesDate = true;
      if (dateFilter) {
        const cDate = new Date(c.created_at);
        matchesDate = cDate.toDateString() === dateFilter.toDateString();
      }

      // Month filter
      let matchesMonth = true;
      if (monthFilter !== 'all') {
        const cDate = new Date(c.created_at);
        const mStr = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
        matchesMonth = mStr === monthFilter;
      }

      // Segmento de desempeño: es lo que permite ver de un tirón a los que
      // vinieron una vez y no volvieron, o a los que se están perdiendo.
      const matchesSegmento = segmentoFiltro === 'todos'
        || desempenoPor[c.id]?.segmento === segmentoFiltro;

      return matchesSearch && matchesDate && matchesMonth && matchesSegmento;
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'az') {
        return `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`);
      }
      if (sortBy === 'za') {
        return `${b.nombre} ${b.apellido}`.localeCompare(`${a.nombre} ${a.apellido}`);
      }
      // Ordenaciones por desempeño. Un cliente sin datos cae al final en vez de
      // colarse arriba con un cero.
      const da = desempenoPor[a.id];
      const db = desempenoPor[b.id];
      if (sortBy === 'mejores') return (db?.puntos ?? -1) - (da?.puntos ?? -1);
      if (sortBy === 'mas_servicios') return (db?.servicios ?? -1) - (da?.servicios ?? -1);
      if (sortBy === 'mas_facturado') return (db?.total ?? -1) - (da?.total ?? -1);
      if (sortBy === 'olvidados') {
        // Los que llevan más tiempo sin venir, primero; los que nunca vinieron
        // van al final: ahí no hay nada que recuperar todavía.
        return (db?.diasSinVenir ?? -1) - (da?.diasSinVenir ?? -1);
      }
      return 0;
    });

  const clearFilters = () => {
    setSearch('');
    setDateFilter(undefined);
    setMonthFilter('all');
    setSortBy('recent');
    setSegmentoFiltro('todos');
  };

  const hasActiveFilters = search || dateFilter || monthFilter !== 'all' || sortBy !== 'recent'
    || segmentoFiltro !== 'todos';

  const openNew = () => { 
    if (!can('clientes', 'crear')) return alert('No tienes permisos para crear clientes.');
    setEditCliente(null); setForm({ nombre:'',apellido:'',email:'',telefono:'',cedula:'',direccion:'',notas:'' }); setShowModal(true); 
  };
  const openEdit = (c: Cliente) => { 
    if (!can('clientes', 'editar')) return alert('No tienes permisos para editar clientes.');
    setEditCliente(c); setForm({ nombre:c.nombre,apellido:c.apellido,email:c.email,telefono:c.telefono,cedula:c.cedula||'',direccion:c.direccion||'',notas:c.notas||'' }); setShowModal(true); 
  };

  const handleSave = async () => {
    try {
      const cleanForm = {
        ...form,
        nombre: form.nombre.trim() || 'Desconocido',
        telefono: form.telefono.trim() || '00000000000',
        // La cédula se guarda normalizada («V-16278639») y lo que no es un
        // documento se guarda vacío. Sin esto la base acumula «11464383»,
        // «V-19734521» y dieciocho fichas con la palabra «N/A», y entonces la
        // cédula deja de servir para reconocer a nadie.
        cedula: formatearCedula(form.cedula) ?? '',
      };

      if (editCliente) {
        await updateCliente(editCliente.id, cleanForm);
        await syncClientData(editCliente.id, cleanForm.nombre, cleanForm.apellido, cleanForm.telefono);
        
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Clientes',
          accion: 'Actualizó cliente',
          detalles: `${cleanForm.nombre} ${cleanForm.apellido}`,
          referencia_id: editCliente.id,
          referencia_tabla: 'clientes'
        });
      } else {
        const result = await createCliente(cleanForm);
        if (result) {
          logActivity({
            usuario: user?.nombre || 'Sistema',
            modulo: 'Clientes',
            accion: 'Creó cliente',
            detalles: `${cleanForm.nombre} ${cleanForm.apellido}`,
            referencia_id: (result as any).id,
            referencia_tabla: 'clientes'
          });
        }
      }
      setShowModal(false);
      loadData();
    } catch {
      alert('Error al guardar el cliente');
    }
  };

  const handleDelete = async (id: string) => {
    if (!can('clientes', 'eliminar')) return alert('No tienes permisos para eliminar clientes.');
    if (confirm('¿Estás seguro de eliminar este cliente? Se eliminarán también sus vehículos.')) {
      try {
        const cliente = clientes.find(c => c.id === id);
        await deleteCliente(id);
        
        logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Clientes',
          accion: 'Eliminó cliente',
          detalles: cliente ? `${cliente.nombre} ${cliente.apellido}` : id,
          referencia_id: id,
          referencia_tabla: 'clientes'
        });
        
        loadData();
      } catch {
        alert('Error al eliminar el cliente');
      }
    }
  };

  const openVehiculoNew = () => {
    if (!can('vehiculos', 'crear')) return alert('No tienes permisos para crear vehículos.');
    if (!editCliente) return;
    setEditVehiculo(null);
    setVForm({ marca: '', modelo: '', anio: new Date().getFullYear(), color: '', placa: '' });
    setShowVehiculoModal(true);
  };

  const openVehiculoEdit = (v: Vehiculo) => {
    if (!can('vehiculos', 'editar')) return alert('No tienes permisos para editar vehículos.');
    setEditVehiculo(v);
    setVForm({ marca: v.marca, modelo: v.modelo, anio: v.anio, color: v.color || '', placa: v.placa });
    setShowVehiculoModal(true);
  };

  const handleSaveVehiculo = async () => {
    if (!editCliente) return;
    try {
      if (editVehiculo) {
        await updateVehiculo(editVehiculo.id, {
          ...vForm,
          placa: vForm.placa ? vForm.placa.trim().toUpperCase() : 'SIN-PLACA'
        });
      } else {
        await createVehiculo({ 
          ...vForm, 
          cliente_id: editCliente.id,
          placa: vForm.placa ? vForm.placa.trim().toUpperCase() : 'SIN-PLACA',
          estado: 'en_servicio' 
        });
      }
      setShowVehiculoModal(false);
      loadData();
    } catch {
      alert('Error al guardar el vehículo');
    }
  };

  const handleDeleteVehiculo = async (id: string) => {
    if (!can('vehiculos', 'eliminar')) return alert('No tienes permisos para eliminar vehículos.');
    if (confirm('¿Estás seguro de eliminar este vehículo?')) {
      try {
        await deleteVehiculo(id);
        loadData();
      } catch {
        alert('Error al eliminar el vehículo');
      }
    }
  };

  const getVehiculos = (clienteId: string) => {
    const c = clientes.find(client => client.id === clienteId);
    return c?.vehiculos || [];
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{clientes.length} clientes registrados</p>
        </div>
        {can('clientes', 'crear') && (
          <Button onClick={openNew} className="gap-2 self-start sm:self-auto">
            <Plus className="w-4 h-4" /> Nuevo Cliente
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Clientes', value: clientes.length, color: 'text-blue-400' },
          { label: 'Con Vehículos', value: clientes.filter(c => (c.vehiculos?.length || 0) > 0).length, color: 'text-orange-400' },
          { 
            label: 'Nuevos este mes', 
            value: clientes.filter(c => {
              if (!c.created_at) return false;
              const date = new Date(c.created_at);
              const now = new Date();
              return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            }).length, 
            color: 'text-green-400' 
          },
          { 
            label: 'Activos', 
            value: clientes.filter(c => c.vehiculos?.some(v => v.estado !== 'inactivo')).length, 
            color: 'text-purple-400' 
          },
        ].map((s, i) => (
          <div key={i} className="stat-card border border-border/50">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`} style={{ fontFamily: 'Syne, sans-serif' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1 group">
          <Input
            placeholder="Buscar por nombre, cédula, email, teléfono..."
            icon={<Search />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-10"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-muted-foreground transition-opacity"
            >
              <Plus className="w-3 h-3 rotate-45" />
            </button>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Sorting */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] h-10 border-border/50 bg-background/50">
              <div className="flex items-center gap-2">
                {sortBy === 'recent' ? <Clock className="w-3.5 h-3.5" /> : sortBy === 'az' ? <SortAsc className="w-3.5 h-3.5" /> : <SortDesc className="w-3.5 h-3.5" />}
                <SelectValue placeholder="Ordenar por" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recientes</SelectItem>
              <SelectItem value="mejores">Mejores clientes</SelectItem>
              <SelectItem value="mas_servicios">M&aacute;s servicios</SelectItem>
              <SelectItem value="mas_facturado">M&aacute;s facturado</SelectItem>
              <SelectItem value="olvidados">Sin venir hace m&aacute;s tiempo</SelectItem>
              <SelectItem value="az">A - Z (Nombre)</SelectItem>
              <SelectItem value="za">Z - A (Nombre)</SelectItem>
            </SelectContent>
          </Select>

          {/* Month Filter */}
          <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setDateFilter(undefined); }}>
            <SelectTrigger className="w-[150px] h-10 border-border/50 bg-background/50 text-xs">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {Array.from({ length: 12 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = format(d, 'MMMM yyyy', { locale: es });
                return <SelectItem key={val} value={val} className="capitalize">{label}</SelectItem>;
              })}
            </SelectContent>
          </Select>

          {/* Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className={cn(
                  "w-[160px] h-10 justify-start text-left font-medium border-border/50 bg-background/30 glass hover:border-primary/30 hover:bg-white/5 text-xs transition-all duration-300",
                  !dateFilter && "text-muted-foreground"
                )}
              >
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center mr-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                  <CalendarIcon className="h-3.5 w-3.5" />
                </div>
                {dateFilter ? format(dateFilter, "PPP", { locale: es }) : <span>Filtrar por día</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateFilter}
                onSelect={(d) => { setDateFilter(d); setMonthFilter('all'); }}
                initialFocus
                locale={es}
              />
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={clearFilters}
              className="h-10 w-10 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              title="Limpiar filtros"
            >
              <FilterX className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Segmentos — de un tirón se ve cuántos clientes hay de cada clase y se
          filtra por ellos. Los accionables van primero: son los que dan trabajo
          que hacer hoy, y son justo los que una lista por fecha de alta
          escondía. */}
      {desempeno.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setSegmentoFiltro('todos')}
            className={cn(
              'shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
              segmentoFiltro === 'todos'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/60 hover:border-primary/40',
            )}
          >
            Todos <span className="tabular-nums opacity-60">{desempeno.length}</span>
          </button>
          {(Object.values(SEGMENTOS))
            .filter(s => conteoSegmentos[s.id] > 0)
            .sort((a, b) => Number(b.accionable) - Number(a.accionable)
              || conteoSegmentos[b.id] - conteoSegmentos[a.id])
            .map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSegmentoFiltro(segmentoFiltro === s.id ? 'todos' : s.id)}
                title={s.descripcion}
                className={cn(
                  'shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all',
                  segmentoFiltro === s.id
                    ? `${s.claseChip} ring-2 ring-offset-1 ring-current/30`
                    : 'border-border/60 text-muted-foreground hover:border-primary/40',
                )}
              >
                {s.label} <span className="tabular-nums opacity-60">{conteoSegmentos[s.id]}</span>
              </button>
            ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((cliente, i) => {
          const colorClass = COLORS[i % COLORS.length];
          const d = desempenoPor[cliente.id];
          const seg = d ? SEGMENTOS[d.segmento] : null;
          return (
            <Card key={cliente.id} className="hover:border-primary/20 transition-all duration-200 hover:shadow-[0_0_20px_rgba(249,115,22,0.05)] group">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10 flex-shrink-0">
                    <AvatarFallback className={`text-sm font-semibold ${colorClass}`}>
                      {getInitials(`${cliente.nombre} ${cliente.apellido}`)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm truncate">{cliente.nombre} {cliente.apellido}</h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewCliente(cliente)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        {can('clientes', 'editar') && (
                          <button onClick={() => openEdit(cliente)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors">
                            <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {can('clientes', 'eliminar') && (
                          <button onClick={() => handleDelete(cliente.id)} className="w-6 h-6 rounded-md hover:bg-red-500/10 flex items-center justify-center transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums border',
                        formatearCedula(cliente.cedula)
                          ? 'border-border/60 bg-muted/40 text-foreground/80'
                          : 'border-dashed border-border/50 text-muted-foreground/60 italic',
                      )}>
                        {formatearCedula(cliente.cedula) || 'Sin cédula'}
                      </span>
                      {seg && (
                        <span
                          title={seg.descripcion}
                          className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide border', seg.claseChip)}
                        >
                          {seg.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{cliente.telefono}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{cliente.email}</span>
                      </div>
                    </div>
                     <div className="mt-2.5 pt-2.5 border-t border-border/30 flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs">
                        <Car className="w-3 h-3 text-primary" />
                        <span className="font-medium">{(cliente.vehiculos?.length || 0)}</span>
                        <span className="text-muted-foreground">vehículo{(cliente.vehiculos?.length || 0) !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-muted-foreground/30">·</span>
                      {d ? (
                        <>
                          {/* Cuantos servicios lleva: es el dato que pedia verse
                              de un vistazo en la propia tarjeta. */}
                          <div className="flex items-center gap-1 text-xs" title={`${d.servicios} servicio(s) · ${d.serviciosPorAno}/año`}>
                            <Wrench className="w-3 h-3 text-primary" />
                            <span className="font-medium tabular-nums">{d.servicios}</span>
                            <span className="text-muted-foreground">serv.</span>
                          </div>
                          {d.total > 0 && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-xs font-bold text-emerald-500 tabular-nums" title="Total facturado">
                                ${d.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground" title={d.ultimo || 'Sin servicios'}>
                            {textoUltimaVisita(d.diasSinVenir)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Desde {formatDate(cliente.created_at, { month: 'short', year: 'numeric' })}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      {/* Modal nuevo/editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editCliente ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Edit className="w-3.5 h-3.5 text-primary" />
                  </div>
                  Editar Cliente
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  Nuevo Cliente
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Datos personales */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Datos Personales</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Carlos" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Apellido *</label>
                <Input value={form.apellido} onChange={e => setForm(p => ({ ...p, apellido: e.target.value }))} placeholder="Ej: Rodríguez" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Teléfono *</label>
                <Input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} placeholder="+58412-000-0000" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cédula</label>
                <Input value={form.cedula} onChange={e => setForm(p => ({ ...p, cedula: e.target.value }))} placeholder="V-12345678" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="correo@ejemplo.com" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                <Input value={form.direccion} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} placeholder="Ej: Los Teques, Miranda" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  className="flex w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none min-h-[56px]"
                  value={form.notas}
                  onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                  placeholder="Observaciones del cliente..."
                />
              </div>
            </div>
          </div>

          {/* Vehículos (solo en edición) */}
          {editCliente && (
            <div className="space-y-3 pt-3 border-t border-border/30 mt-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" /> Vehículos ({getVehiculos(editCliente.id).length})
                </p>
                {can('vehiculos', 'crear') && (
                  <Button variant="ghost" size="sm" onClick={openVehiculoNew} className="h-7 text-[10px] gap-1 px-2 text-primary hover:bg-primary/10">
                    <Plus className="w-3 h-3" /> Añadir vehículo
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {getVehiculos(editCliente.id).map(v => {
                  const estadoColor: Record<string, string> = {
                    activo: 'bg-green-500/15 text-green-400 border-green-500/20',
                    en_servicio: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
                    listo: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
                    inactivo: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
                  };
                  const estadoLabel: Record<string, string> = { activo: 'Activo', en_servicio: 'En Servicio', listo: 'Listo', inactivo: 'Inactivo' };
                  return (
                    <div key={v.id} className="flex items-start justify-between p-3 rounded-xl bg-white/4 border border-border/20 group hover:border-border/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Car className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-foreground">{v.marca} {v.modelo} {v.anio && `(${v.anio})`}</p>
                          <p className="text-[10px] font-mono text-primary font-bold mt-0.5">{v.placa}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {v.color && <span className="text-[10px] text-muted-foreground">{v.color}</span>}
                            {v.color && <span className="text-muted-foreground/30 text-[10px]">•</span>}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${estadoColor[v.estado] || estadoColor.activo}`}>
                              {estadoLabel[v.estado] || v.estado}
                            </span>
                          </div>
                          {v.kilometraje && <p className="text-[10px] text-muted-foreground mt-0.5">{Number(v.kilometraje).toLocaleString()} km</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setGastosTarget(v)} title="Gastos y utilidad del vehículo" className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-400 transition-colors">
                          <Wallet className="w-3 h-3" />
                        </button>
                        {can('vehiculos', 'editar') && (
                          <button onClick={() => openVehiculoEdit(v)} className="p-1.5 rounded-md hover:bg-primary/10 hover:text-primary transition-colors">
                            <Edit className="w-3 h-3" />
                          </button>
                        )}
                        {can('vehiculos', 'editar') && (
                          <button onClick={() => setTransferVehiculoTarget(v)} title="Transferir a otro cliente" className="p-1.5 rounded-md hover:bg-primary/10 hover:text-primary transition-colors">
                            <ArrowRightLeft className="w-3 h-3" />
                          </button>
                        )}
                        {can('vehiculos', 'eliminar') && (
                          <button onClick={() => handleDeleteVehiculo(v.id)} className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {getVehiculos(editCliente.id).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-5 text-center border border-dashed border-border/30 rounded-xl">
                    <Car className="w-6 h-6 text-muted-foreground/30 mb-1.5" />
                    <p className="text-[11px] text-muted-foreground/50 italic">Sin vehículos registrados</p>
                    {can('vehiculos', 'crear') && (
                      <button onClick={openVehiculoNew} className="mt-2 text-[10px] text-primary hover:underline">+ Añadir primer vehículo</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2 pt-2 border-t border-border/20">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nombre || !form.apellido || !form.telefono}>
              {editCliente ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver cliente — ahora con ModalBase, para que el detalle de servicio
          que se abre encima se pueda pinchar y desplazar. */}
      <PerfilCliente
        cliente={viewCliente}
        onCerrar={() => setViewCliente(null)}
        vehiculos={viewCliente ? getVehiculos(viewCliente.id) : []}
        desempeno={viewCliente ? (desempenoPor[viewCliente.id] ?? null) : null}
      />

      {/* Modal Vehículo (Sub-modal) */}
      <Dialog open={showVehiculoModal} onOpenChange={setShowVehiculoModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editVehiculo ? 'Editar Vehículo' : 'Añadir Vehículo'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Placa *</label>
              <Input value={vForm.placa} onChange={e => setVForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))} placeholder="Ej: ABC123D" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Marca *</label>
              <Input value={vForm.marca} onChange={e => setVForm(p => ({ ...p, marca: e.target.value }))} placeholder="Ej: Toyota" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Modelo *</label>
              <Input value={vForm.modelo} onChange={e => setVForm(p => ({ ...p, modelo: e.target.value }))} placeholder="Ej: Corolla" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Año</label>
              <Input type="number" value={vForm.anio} onChange={e => setVForm(p => ({ ...p, anio: parseInt(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <Input value={vForm.color} onChange={e => setVForm(p => ({ ...p, color: e.target.value }))} placeholder="Ej: Blanco" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowVehiculoModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveVehiculo} disabled={!vForm.placa || !vForm.marca || !vForm.modelo}>
              Guardar Vehículo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferVehiculoModal
        vehiculo={transferVehiculoTarget}
        clientes={clientes}
        open={!!transferVehiculoTarget}
        onClose={() => setTransferVehiculoTarget(null)}
        onTransferred={loadData}
        usuario={user?.nombre || user?.email || 'Sistema'}
        currentOwnerName={editCliente ? `${editCliente.nombre} ${editCliente.apellido}` : (transferVehiculoTarget?.cliente ? `${transferVehiculoTarget.cliente.nombre} ${transferVehiculoTarget.cliente.apellido}` : '')}
      />

      {/* Gastos y utilidad del vehículo del cliente */}
      {gastosTarget && (
        <GastosVehiculoModal
          canDelete={can('vehiculos', 'eliminar')}
          onClose={() => setGastosTarget(null)}
          target={{
            vehiculo_id: gastosTarget.id,
            cliente_id: gastosTarget.cliente_id || editCliente?.id || null,
            placa: gastosTarget.placa,
            vehiculo_info: `${gastosTarget.marca} ${gastosTarget.modelo}`,
            cliente_nombre: editCliente ? `${editCliente.nombre} ${editCliente.apellido || ''}`.trim() : null,
            sede_id: gastosTarget.sede_id || null,
          }}
        />
      )}
    </div>
  );
}
