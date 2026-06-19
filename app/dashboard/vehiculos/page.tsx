'use client';
import React, { useState, useRef } from 'react';
import { Car, Plus, Search, Edit, Trash2, Eye, Wrench, CheckCircle2, XCircle, Loader2, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui/status-badge';
import { fetchVehiculos, createVehiculo, updateVehiculo, deleteVehiculo, fetchClientes, supabase } from '@/lib/supabase';
import { Vehiculo, Cliente, Servicio } from '@/types';
import { formatDate, cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, FilterX, Clock, SortAsc, SortDesc } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import TransferVehiculoModal from '@/components/TransferVehiculoModal';
import { useAppStore } from '@/lib/store';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';

const MARCAS = ['Toyota','Ford','Chevrolet','Honda','Nissan','Hyundai','Kia','Mazda','Volkswagen','Mercedes','BMW','Audi','Mitsubishi','Jeep','Otro'];
const ESTADOS_V = [{ v:'activo',l:'Activo'},{v:'en_servicio',l:'En Servicio'},{v:'listo',l:'Listo'},{v:'inactivo',l:'Inactivo'}];

export default function VehiculosPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
  const [viewVehiculo, setViewVehiculo] = useState<Vehiculo | null>(null);
  const [transferVehiculoTarget, setTransferVehiculoTarget] = useState<Vehiculo | null>(null);
  const { user } = useAppStore();
  const { can } = useRolePermissions();
  const [vehiculoServicios, setVehiculoServicios] = useState<any[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(false);
  const [form, setForm] = useState({ cliente_id: '', marca: '', modelo: '', anio: '', placa: '', color: '', kilometraje: '', vin: '', estado: 'activo', notas: '' });
  const [plateStatus, setPlateStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [plateOwner, setPlateOwner] = useState('');
  const plateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [clientSearch, setClientSearch] = useState('');
  const [filteredClientes, setFilteredClientes] = useState<Cliente[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);
  const [isCustomMarca, setIsCustomMarca] = useState(false);
  const [customMarca, setCustomMarca] = useState('');

  // Filtering & Sorting
  const [sortBy, setSortBy] = useState('recent');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  // Must be before the `if (!mounted) return null` guard — hooks cannot follow conditional returns
  React.useEffect(() => {
    if (!viewVehiculo?.id || !supabase) { setVehiculoServicios([]); return; }
    setLoadingServicios(true);
    (async () => {
      try {
        const { data } = await supabase.from('servicios')
          .select('id, fecha, tipo, tipo_personalizado, descripcion, estado, costo_estimado, costo_final')
          .eq('vehiculo_id', viewVehiculo.id)
          .order('fecha', { ascending: false })
          .limit(50);
        setVehiculoServicios(data || []);
      } catch { setVehiculoServicios([]); }
      setLoadingServicios(false);
    })();
  }, [viewVehiculo?.id]);

  React.useEffect(() => {
    if (clientSearch.length > 1) {
      const results = clientes.filter(c =>
        `${c.nombre} ${c.apellido}`.toLowerCase().includes(clientSearch.toLowerCase())
      );
      setFilteredClientes(results);
      setShowClientResults(results.length > 0);
    } else {
      setShowClientResults(false);
    }
  }, [clientSearch, clientes]);

  if (!mounted) return null;

  async function loadData() {
    setLoading(true);
    try {
      const [vData, cData] = await Promise.all([
        fetchVehiculos(),
        fetchClientes()
      ]);
      if (vData) setVehiculos(vData);
      if (cData) setClientes(cData);
    } catch {
      console.error('Error loading data');
    } finally {
      setLoading(false);
    }
  }

  const filtered = vehiculos
    .filter(v => {
      // Search
      const match = `${v.marca} ${v.modelo} ${v.placa} ${v.color} ${v.cliente?.nombre} ${v.cliente?.apellido}`.toLowerCase().includes(search.toLowerCase());
      
      // Estado
      const estadoMatch = filterEstado === 'todos' || v.estado === filterEstado;
      
      // Date filter
      let matchesDate = true;
      if (dateFilter) {
        const cDate = new Date(v.created_at);
        matchesDate = cDate.toDateString() === dateFilter.toDateString();
      }

      // Month filter
      let matchesMonth = true;
      if (monthFilter !== 'all') {
        const cDate = new Date(v.created_at);
        const mStr = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
        matchesMonth = mStr === monthFilter;
      }

      return match && estadoMatch && matchesDate && matchesMonth;
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'az') {
        return a.marca.localeCompare(b.marca);
      }
      if (sortBy === 'za') {
        return b.marca.localeCompare(a.marca);
      }
      return 0;
    });

  const clearFilters = () => {
    setSearch('');
    setFilterEstado('todos');
    setDateFilter(undefined);
    setMonthFilter('all');
    setSortBy('recent');
  };

  const hasActiveFilters = search || filterEstado !== 'todos' || dateFilter || monthFilter !== 'all' || sortBy !== 'recent';

  const checkPlate = async (placa: string, currentId?: string) => {
    const clean = placa.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length < 3) { setPlateStatus('idle'); setPlateOwner(''); return; }
    setPlateStatus('checking');
    try {
      if (!supabase) { setPlateStatus('idle'); return; }
      const { data } = await supabase.from('vehiculos')
        .select('id, marca, modelo, anio, clientes(nombre, apellido)')
        .ilike('placa', clean)
        .limit(1)
        .maybeSingle();
      if (data && data.id !== currentId) {
        const c = (data as any).clientes;
        setPlateOwner(c ? `${c.nombre} ${c.apellido}` : 'Cliente no asignado');
        setPlateStatus('taken');
      } else {
        setPlateOwner('');
        setPlateStatus('available');
      }
    } catch { setPlateStatus('idle'); }
  };

  const openNew = () => {
    setEditVehiculo(null);
    setForm({ cliente_id:'', marca:'', modelo:'', anio:'', placa:'', color:'', kilometraje:'', vin:'', estado:'activo', notas:'' });
    setPlateStatus('idle'); setPlateOwner('');
    setClientSearch('');
    setIsCustomMarca(false);
    setCustomMarca('');
    setShowModal(true);
  };
  const openEdit = (v: Vehiculo) => {
    setEditVehiculo(v);
    const isCustom = !MARCAS.includes(v.marca);
    setForm({ cliente_id:v.cliente_id, marca: isCustom ? 'Otro' : v.marca, modelo:v.modelo, anio:v.anio.toString(), placa:v.placa, color:v.color||'', kilometraje:v.kilometraje?.toString()||'', vin:v.vin||'', estado:v.estado, notas:v.notas||'' });
    setPlateStatus('available'); setPlateOwner('');
    
    const cliente = clientes.find(c => c.id === v.cliente_id);
    setClientSearch(cliente ? `${cliente.nombre} ${cliente.apellido}` : '');
    setIsCustomMarca(isCustom);
    setCustomMarca(isCustom ? v.marca : '');

    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const finalMarca = isCustomMarca ? customMarca.trim() : form.marca;
      const data = { 
        ...form, 
        marca: finalMarca,
        anio: Number(form.anio), 
        kilometraje: Number(form.kilometraje || 0),
        estado: form.estado as Vehiculo['estado']
      };
      if (editVehiculo) {
        await updateVehiculo(editVehiculo.id, data);
      } else {
        await createVehiculo(data);
      }
      setShowModal(false);
      loadData();
    } catch {
      alert('Error al guardar el vehículo');
    }
  };

  const handleDelete = async (id: string) => {
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

  const getCliente = (id: string) => clientes.find(c => c.id === id);

  const estadoBgColor: Record<string, string> = {
    activo: 'border-green-500/20 bg-green-500/5',
    en_servicio: 'border-blue-500/20 bg-blue-500/5',
    listo: 'border-emerald-500/20 bg-emerald-500/5',
    inactivo: 'border-gray-500/20 bg-gray-500/5',
  };

  return (
    <div suppressHydrationWarning className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Vehículos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{vehiculos.length} vehículos registrados</p>
        </div>
        <Button onClick={openNew} className="gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Nuevo Vehículo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ESTADOS_V.map(e => (
          <div key={e.v} className={`stat-card border ${estadoBgColor[e.v]}`}>
            <p className="text-xs text-muted-foreground">{e.l}</p>
            <p className="text-2xl font-bold mt-1" style={{ fontFamily: 'Syne, sans-serif' }}>
              {vehiculos.filter(v => v.estado === e.v).length}
            </p>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 group">
            <Input 
              placeholder="Buscar por marca, modelo, placa, cliente..." 
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
          
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-full sm:w-44 h-10 border-border/50 bg-background/50">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {ESTADOS_V.map(e => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}
            </SelectContent>
          </Select>
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
              <SelectItem value="az">Marca (A - Z)</SelectItem>
              <SelectItem value="za">Marca (Z - A)</SelectItem>
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

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((vehiculo) => {
            const cliente = vehiculo.cliente || getCliente(vehiculo.cliente_id);
            {/* const servicios = getServicios(); */}
            return (
              <Card key={vehiculo.id} className={`hover:border-primary/20 transition-all duration-200 group border ${estadoBgColor[vehiculo.estado] || ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Car className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm truncate max-w-[150px]">{vehiculo.marca} {vehiculo.modelo}</h3>
                        <p className="text-xs text-muted-foreground">{vehiculo.anio} · {vehiculo.color}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setViewVehiculo(vehiculo)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => openEdit(vehiculo)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => setTransferVehiculoTarget(vehiculo)} title="Transferir a otro cliente" className="w-6 h-6 rounded-md hover:bg-primary/10 flex items-center justify-center"><ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      {can('vehiculos', 'eliminar') && (
                        <button onClick={() => handleDelete(vehiculo.id)} className="w-6 h-6 rounded-md hover:bg-red-500/10 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-muted/30 border border-border/20">
                      <p className="text-[10px] text-muted-foreground">Placa</p>
                      <p className="text-xs font-bold tracking-wider text-primary">{vehiculo.placa}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/30 border border-border/20">
                      <p className="text-[10px] text-muted-foreground">Kilometraje</p>
                      <p className="text-xs font-medium">{vehiculo.kilometraje?.toLocaleString()} km</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                        {cliente ? `${cliente.nombre?.charAt(0) || ''}${cliente.apellido?.charAt(0) || ''}`.toUpperCase() || '?' : '?'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">
                          {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Sin cliente'}
                        </span>
                        {cliente?.cedula && <span className="text-[9px] text-muted-foreground">{cliente.cedula}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <StatusBadge status={vehiculo.estado} type="vehiculo" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Car className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No se encontraron vehículos</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex justify-center items-start sm:items-center bg-black/60 backdrop-blur-xl p-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-xl shadow-2xl flex flex-col my-auto sm:my-0 rounded-[24px] sm:rounded-[32px] overflow-hidden sm:max-h-[90vh]">
            <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent shrink-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                  {editVehiculo ? <Edit className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> : <Car className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />}
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
                    {editVehiculo ? 'Editar Vehículo' : 'Nuevo Vehículo'}
                  </h3>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Gestión de Taller Lycos Team</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-2xl hover:bg-muted/50 flex items-center justify-center transition-all shrink-0"><XCircle className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="p-4 sm:p-8 flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                
                {/* Cliente */}
                <div className="col-span-2 space-y-2 relative">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Cliente Propietario *</label>
                  <div className="relative">
                    <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                    <input 
                      className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl pl-10 pr-4 py-2.5 sm:pl-12 sm:pr-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                      placeholder="Buscar por nombre o apellido..."
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setForm({...form, cliente_id: ''}); // clear selected on type
                      }}
                      onBlur={() => setTimeout(() => setShowClientResults(false), 200)}
                      onFocus={() => clientSearch.length > 1 && setShowClientResults(true)}
                    />
                  </div>
                  {showClientResults && (
                    <div className="absolute top-[65px] left-0 right-0 z-[150] bg-popover border border-border rounded-xl sm:rounded-2xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar py-1">
                      {filteredClientes.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setForm({...form, cliente_id: c.id});
                            setClientSearch(`${c.nombre} ${c.apellido}`);
                            setShowClientResults(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors group flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{c.nombre} {c.apellido}</p>
                            <p className="text-[10px] text-muted-foreground">{c.telefono}</p>
                          </div>
                          <Plus className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Marca & Modelo */}
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Marca *</label>
                  <select 
                    className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none"
                    value={isCustomMarca ? 'Otro' : form.marca}
                    onChange={e => {
                      if (e.target.value === 'Otro') {
                        setIsCustomMarca(true);
                      } else {
                        setIsCustomMarca(false);
                        setForm({...form, marca: e.target.value});
                      }
                    }}
                  >
                    <option value="" disabled>Selecciona...</option>
                    {MARCAS.map(m => <option key={m} value={m} className="bg-card">{m}</option>)}
                  </select>
                  {isCustomMarca && (
                    <input 
                      className="w-full mt-2 bg-muted/50 border border-primary/30 rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all animate-in fade-in slide-in-from-top-2"
                      placeholder="Escribe la marca..."
                      value={customMarca}
                      onChange={e => setCustomMarca(e.target.value)}
                    />
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Modelo *</label>
                  <input 
                    className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="Ej: Corolla"
                    value={form.modelo}
                    onChange={e => setForm({...form, modelo: e.target.value})}
                  />
                </div>

                {/* Placa & Año */}
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Placa *</label>
                  <div className="relative">
                    <input
                      className={cn(
                        "w-full bg-muted/50 border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pr-10 uppercase",
                        plateStatus === 'taken' ? "border-red-500/50 focus:ring-red-500/30" : 
                        plateStatus === 'available' ? "border-green-500/50 focus:ring-green-500/30" : "border-border"
                      )}
                      placeholder="ABC-123"
                      value={form.placa}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        setForm({...form, placa: val});
                        clearTimeout(plateTimerRef.current);
                        plateTimerRef.current = setTimeout(() => checkPlate(val, editVehiculo?.id), 500);
                      }}
                    />
                    <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2">
                      {plateStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      {plateStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      {plateStatus === 'taken' && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                  {plateStatus === 'taken' && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1 animate-in fade-in">
                      Ocupada por: <span className="font-semibold">{plateOwner}</span>
                    </p>
                  )}
                  {plateStatus === 'available' && form.placa.length >= 3 && (
                    <p className="text-[10px] text-green-400 mt-1 animate-in fade-in">Placa disponible</p>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Año *</label>
                  <input 
                    type="number"
                    className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="2020"
                    min="1980" max="2026"
                    value={form.anio}
                    onChange={e => setForm({...form, anio: e.target.value})}
                  />
                </div>

                {/* Color & Km */}
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Color</label>
                  <input 
                    className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="Ej: Blanco"
                    value={form.color}
                    onChange={e => setForm({...form, color: e.target.value})}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Kilometraje</label>
                  <input 
                    type="number"
                    className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="50000"
                    value={form.kilometraje}
                    onChange={e => setForm({...form, kilometraje: e.target.value})}
                  />
                </div>

                {/* Estado dinámico */}
                <div className="col-span-2 space-y-3 mt-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Estado del Vehículo</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ESTADOS_V.map(e => (
                      <button
                        key={e.v}
                        type="button"
                        onClick={() => setForm({...form, estado: e.v})}
                        className={cn(
                          "px-3 py-2.5 rounded-xl sm:rounded-2xl border text-xs font-bold tracking-tight transition-all text-center",
                          form.estado === e.v 
                            ? "border-primary bg-primary/10 text-primary scale-[1.02] shadow-md shadow-primary/5" 
                            : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:border-border"
                        )}
                      >
                        {e.l}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowModal(false)} 
                className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold text-muted-foreground hover:bg-muted/50 transition-all text-center"
              >
                Cancelar
              </button>
              <Button 
                onClick={handleSave} 
                disabled={!form.cliente_id || (!isCustomMarca && !form.marca) || (isCustomMarca && !customMarca.trim()) || !form.modelo || !form.placa || plateStatus === 'taken' || plateStatus === 'checking'}
                className="w-full sm:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 sm:px-10 h-11 sm:h-12 text-xs sm:text-sm shadow-2xl shadow-primary/20 gap-2 flex items-center justify-center"
              >
                {editVehiculo ? 'Guardar Cambios' : 'Registrar Vehículo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View modal */}
      <Dialog open={!!viewVehiculo} onOpenChange={() => setViewVehiculo(null)}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {viewVehiculo && (
            <>
              <DialogHeader className="p-6 pb-2 shrink-0">
                <DialogTitle>Detalle del Vehículo</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 pt-2 space-y-4 custom-scrollbar">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Car className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{viewVehiculo.marca} {viewVehiculo.modelo} {viewVehiculo.anio}</h3>
                    <p className="text-xs font-bold tracking-wider text-primary mt-0.5 truncate">{viewVehiculo.placa}</p>
                    <div className="mt-1"><StatusBadge status={viewVehiculo.estado} type="vehiculo" /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Color', value: viewVehiculo.color || 'N/A' },
                    { label: 'Km', value: viewVehiculo.kilometraje?.toLocaleString() + ' km' },
                    { label: 'VIN', value: viewVehiculo.vin || 'N/A' },
                    { label: 'Registrado', value: formatDate(viewVehiculo.created_at) },
                  ].map(f => (
                    <div key={f.label} className="p-2.5 rounded-lg border border-border/30 bg-muted/20 min-w-0">
                      <p className="text-[10px] text-muted-foreground">{f.label}</p>
                      <p className="text-xs font-medium mt-0.5 truncate" title={f.value}>{f.value}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 rounded-lg border border-border/30 bg-primary/5">
                  <p className="text-xs font-bold text-primary mb-2 uppercase tracking-tight">Propietario</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="text-muted-foreground whitespace-nowrap">Nombre:</span>
                      <span className="font-medium truncate text-right">{(viewVehiculo.cliente || getCliente(viewVehiculo.cliente_id))?.nombre} {(viewVehiculo.cliente || getCliente(viewVehiculo.cliente_id))?.apellido}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="text-muted-foreground whitespace-nowrap">Cédula:</span>
                      <span className="font-medium truncate text-right">{(viewVehiculo.cliente || getCliente(viewVehiculo.cliente_id))?.cedula || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="text-muted-foreground whitespace-nowrap">Teléfono:</span>
                      <span className="font-medium truncate text-right">{(viewVehiculo.cliente || getCliente(viewVehiculo.cliente_id))?.telefono}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 gap-2 text-xs"
                    onClick={() => { setTransferVehiculoTarget(viewVehiculo); setViewVehiculo(null); }}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir a otro cliente
                  </Button>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                    Historial de Servicios ({loadingServicios ? '…' : vehiculoServicios.length})
                  </p>
                  <div className="space-y-2">
                    {loadingServicios && (
                      <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs">Cargando historial…</span>
                      </div>
                    )}
                    {!loadingServicios && vehiculoServicios.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">Sin historial de servicios</p>
                    )}
                    {!loadingServicios && vehiculoServicios.map(s => {
                      const estadoColor: Record<string, string> = {
                        pendiente: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
                        confirmada: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
                        en_revision: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20',
                        en_proceso: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
                        completada: 'text-green-400 bg-green-400/10 border-green-400/20',
                        finalizado: 'text-green-400 bg-green-400/10 border-green-400/20',
                        cancelada: 'text-red-400 bg-red-400/10 border-red-400/20',
                      };
                      const estadoLabel: Record<string, string> = {
                        pendiente: 'Pendiente', confirmada: 'Confirmada', en_revision: 'Revisión',
                        en_proceso: 'En Proceso', completada: 'Completada',
                        finalizado: 'Finalizado', cancelada: 'Cancelada',
                      };
                      const tipoLabel: Record<string, string> = {
                        mecanica: 'Mecánica', electronica: 'Electrónica', cerrajeria: 'Cerrajería',
                        diagnostico: 'Diagnóstico', motor: 'Motor', emergencia: 'Emergencia', otro: 'General',
                      };
                      const costo = s.costo_final ?? s.costo_estimado;
                      return (
                        <div key={s.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/20 border border-border/20 hover:bg-muted/40 transition-all">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                            <Wrench className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black text-primary uppercase tracking-tight truncate max-w-[140px]" title={s.tipo_personalizado || tipoLabel[s.tipo] || s.tipo}>
                                {s.tipo_personalizado || tipoLabel[s.tipo] || s.tipo}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border whitespace-nowrap ${estadoColor[s.estado] || 'text-gray-400 bg-gray-400/10 border-gray-400/20'}`}>
                                {estadoLabel[s.estado] || s.estado}
                              </span>
                            </div>
                            <p className="text-[11px] text-foreground/80 truncate mt-0.5" title={s.descripcion || 'Sin descripción'}>{s.descripcion || 'Sin descripción'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">{s.fecha ? formatDate(s.fecha) : ''}</span>
                              {costo != null && costo > 0 && (
                                <span className="text-[9px] font-bold text-primary whitespace-nowrap">${Number(costo).toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <TransferVehiculoModal
        vehiculo={transferVehiculoTarget}
        clientes={clientes}
        open={!!transferVehiculoTarget}
        onClose={() => setTransferVehiculoTarget(null)}
        onTransferred={loadData}
        usuario={user?.nombre || user?.email || 'Sistema'}
        currentOwnerName={transferVehiculoTarget ? `${(transferVehiculoTarget.cliente || getCliente(transferVehiculoTarget.cliente_id))?.nombre || ''} ${(transferVehiculoTarget.cliente || getCliente(transferVehiculoTarget.cliente_id))?.apellido || ''}`.trim() : ''}
      />
    </div>
  );
}
