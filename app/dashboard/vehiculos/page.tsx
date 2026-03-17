'use client';
import React, { useState } from 'react';
import { Car, Plus, Search, Edit, Trash2, Eye, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import StatusBadge from '@/components/ui/status-badge';
import { mockVehiculos, mockClientes, mockServicios } from '@/lib/mockData';
import { Vehiculo } from '@/types';
import { formatDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MARCAS = ['Toyota','Ford','Chevrolet','Honda','Nissan','Hyundai','Kia','Mazda','Volkswagen','Mercedes','BMW','Audi','Mitsubishi','Jeep','Otro'];
const ESTADOS_V = [{ v:'activo',l:'Activo'},{v:'en_servicio',l:'En Servicio'},{v:'listo',l:'Listo'},{v:'inactivo',l:'Inactivo'}];

export default function VehiculosPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(mockVehiculos);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
  const [viewVehiculo, setViewVehiculo] = useState<Vehiculo | null>(null);
  const [form, setForm] = useState({ cliente_id: '', marca: '', modelo: '', anio: '', placa: '', color: '', kilometraje: '', vin: '', estado: 'activo', notas: '' });

  const filtered = vehiculos.filter(v => {
    const cliente = mockClientes.find(c => c.id === v.cliente_id);
    const match = `${v.marca} ${v.modelo} ${v.placa} ${v.color} ${cliente?.nombre} ${cliente?.apellido}`.toLowerCase().includes(search.toLowerCase());
    const estadoMatch = filterEstado === 'todos' || v.estado === filterEstado;
    return match && estadoMatch;
  });

  const openNew = () => { setEditVehiculo(null); setForm({ cliente_id:'', marca:'', modelo:'', anio:'', placa:'', color:'', kilometraje:'', vin:'', estado:'activo', notas:'' }); setShowModal(true); };
  const openEdit = (v: Vehiculo) => { setEditVehiculo(v); setForm({ cliente_id:v.cliente_id, marca:v.marca, modelo:v.modelo, anio:v.anio.toString(), placa:v.placa, color:v.color||'', kilometraje:v.kilometraje?.toString()||'', vin:v.vin||'', estado:v.estado, notas:v.notas||'' }); setShowModal(true); };

  const handleSave = () => {
    if (editVehiculo) {
      setVehiculos(prev => prev.map(v => v.id === editVehiculo.id ? { ...v, ...form, anio: Number(form.anio), kilometraje: Number(form.kilometraje) } as Vehiculo : v));
    } else {
      const nuevo: Vehiculo = { id: Date.now().toString(), ...form, anio: Number(form.anio), kilometraje: Number(form.kilometraje), estado: form.estado as Vehiculo['estado'], created_at: new Date().toISOString() };
      setVehiculos(prev => [nuevo, ...prev]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => setVehiculos(prev => prev.filter(v => v.id !== id));
  const getCliente = (id: string) => mockClientes.find(c => c.id === id);
  const getServicios = (id: string) => mockServicios.filter(s => s.vehiculo_id === id);

  const estadoBgColor: Record<string, string> = {
    activo: 'border-green-500/20 bg-green-500/5',
    en_servicio: 'border-blue-500/20 bg-blue-500/5',
    listo: 'border-emerald-500/20 bg-emerald-500/5',
    inactivo: 'border-gray-500/20 bg-gray-500/5',
  };

  return (
    <div className="space-y-5">
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Buscar por marca, modelo, placa, cliente..." icon={<Search />} value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS_V.map(e => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((vehiculo) => {
          const cliente = getCliente(vehiculo.cliente_id);
          const servicios = getServicios(vehiculo.id);
          return (
            <Card key={vehiculo.id} className={`hover:border-primary/20 transition-all duration-200 group border ${estadoBgColor[vehiculo.estado] || ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Car className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{vehiculo.marca} {vehiculo.modelo}</h3>
                      <p className="text-xs text-muted-foreground">{vehiculo.anio} · {vehiculo.color}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setViewVehiculo(vehiculo)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(vehiculo)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => handleDelete(vehiculo.id)} className="w-6 h-6 rounded-md hover:bg-red-500/10 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
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
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {cliente ? (cliente.nombre[0] + cliente.apellido[0]) : '?'}
                    </div>
                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                      {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Sin cliente'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wrench className="w-3 h-3" />
                      <span>{servicios.length}</span>
                    </div>
                    <StatusBadge status={vehiculo.estado} type="vehiculo" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Car className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No se encontraron vehículos</p>
        </div>
      )}

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editVehiculo ? 'Editar Vehículo' : 'Nuevo Vehículo'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Cliente *</label>
              <Select value={form.cliente_id} onValueChange={v => setForm(p => ({ ...p, cliente_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  {mockClientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Marca *</label>
              <Select value={form.marca} onValueChange={v => setForm(p => ({ ...p, marca: v }))}>
                <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
                <SelectContent>{MARCAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Modelo *</label>
              <Input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))} placeholder="Ej: Corolla" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Año *</label>
              <Input type="number" value={form.anio} onChange={e => setForm(p => ({ ...p, anio: e.target.value }))} placeholder="2020" min="1990" max="2026" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Placa *</label>
              <Input value={form.placa} onChange={e => setForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))} placeholder="ABC-123" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <Input value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} placeholder="Blanco" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Kilometraje</label>
              <Input type="number" value={form.kilometraje} onChange={e => setForm(p => ({ ...p, kilometraje: e.target.value }))} placeholder="50000" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <Select value={form.estado} onValueChange={v => setForm(p => ({ ...p, estado: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS_V.map(e => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.cliente_id || !form.marca || !form.modelo || !form.placa}>
              {editVehiculo ? 'Guardar Cambios' : 'Registrar Vehículo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View modal */}
      <Dialog open={!!viewVehiculo} onOpenChange={() => setViewVehiculo(null)}>
        <DialogContent className="max-w-md">
          {viewVehiculo && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle del Vehículo</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Car className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{viewVehiculo.marca} {viewVehiculo.modelo} {viewVehiculo.anio}</h3>
                  <p className="text-xs font-bold tracking-wider text-primary mt-0.5">{viewVehiculo.placa}</p>
                  <StatusBadge status={viewVehiculo.estado} type="vehiculo" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Color', value: viewVehiculo.color || 'N/A' },
                  { label: 'Km', value: viewVehiculo.kilometraje?.toLocaleString() + ' km' },
                  { label: 'VIN', value: viewVehiculo.vin || 'N/A' },
                  { label: 'Registrado', value: formatDate(viewVehiculo.created_at) },
                ].map(f => (
                  <div key={f.label} className="p-2.5 rounded-lg border border-border/30 bg-muted/20">
                    <p className="text-[10px] text-muted-foreground">{f.label}</p>
                    <p className="text-xs font-medium mt-0.5">{f.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Historial de Servicios ({getServicios(viewVehiculo.id).length})</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {getServicios(viewVehiculo.id).map(s => (
                    <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/20">
                      <Wrench className="w-3 h-3 text-primary flex-shrink-0" />
                      <span className="text-xs flex-1 truncate">{s.descripcion}</span>
                      <StatusBadge status={s.estado} />
                    </div>
                  ))}
                  {getServicios(viewVehiculo.id).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sin historial de servicios</p>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
