'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, Mail, Car, Edit, Trash2, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fetchClientes, createCliente, updateCliente, deleteCliente, syncClientData } from '@/lib/supabase';
import { Cliente, Vehiculo } from '@/types';
import { formatDate, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { createVehiculo, updateVehiculo, deleteVehiculo } from '@/lib/supabase';

const COLORS = ['bg-blue-500/20 text-blue-400','bg-purple-500/20 text-purple-400','bg-green-500/20 text-green-400','bg-orange-500/20 text-orange-400','bg-pink-500/20 text-pink-400','bg-cyan-500/20 text-cyan-400'];

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [viewCliente, setViewCliente] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', telefono: '', cedula: '', direccion: '', notas: '' });
  
  // Vehiculo management
  const [showVehiculoModal, setShowVehiculoModal] = useState(false);
  const [editVehiculo, setEditVehiculo] = useState<Vehiculo | null>(null);
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
    } catch {
      console.error('Error loading data');
    } finally {
      setLoading(false);
    }
  }

  const filtered = (clientes || []).filter(c =>
    `${c.nombre} ${c.apellido} ${c.email} ${c.telefono} ${c.cedula}`.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditCliente(null); setForm({ nombre:'',apellido:'',email:'',telefono:'',cedula:'',direccion:'',notas:'' }); setShowModal(true); };
  const openEdit = (c: Cliente) => { setEditCliente(c); setForm({ nombre:c.nombre,apellido:c.apellido,email:c.email,telefono:c.telefono,cedula:c.cedula||'',direccion:c.direccion||'',notas:c.notas||'' }); setShowModal(true); };

  const handleSave = async () => {
    try {
      if (editCliente) {
        await updateCliente(editCliente.id, form);
        await syncClientData(editCliente.id, form.nombre, form.apellido, form.telefono);
      } else {
        await createCliente(form);
      }
      setShowModal(false);
      loadData();
    } catch {
      alert('Error al guardar el cliente');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este cliente? Se eliminarán también sus vehículos.')) {
      try {
        await deleteCliente(id);
        loadData();
      } catch {
        alert('Error al eliminar el cliente');
      }
    }
  };

  const openVehiculoNew = () => {
    if (!editCliente) return;
    setEditVehiculo(null);
    setVForm({ marca: '', modelo: '', anio: new Date().getFullYear(), color: '', placa: '' });
    setShowVehiculoModal(true);
  };

  const openVehiculoEdit = (v: Vehiculo) => {
    setEditVehiculo(v);
    setVForm({ marca: v.marca, modelo: v.modelo, anio: v.anio, color: v.color || '', placa: v.placa });
    setShowVehiculoModal(true);
  };

  const handleSaveVehiculo = async () => {
    if (!editCliente) return;
    try {
      if (editVehiculo) {
        await updateVehiculo(editVehiculo.id, vForm);
      } else {
        await createVehiculo({ ...vForm, cliente_id: editCliente.id });
      }
      setShowVehiculoModal(false);
      loadData();
    } catch {
      alert('Error al guardar el vehículo');
    }
  };

  const handleDeleteVehiculo = async (id: string) => {
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
        <Button onClick={openNew} className="gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </Button>
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

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre, cédula, email, teléfono..."
          icon={<Search />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((cliente, i) => {
          const colorClass = COLORS[i % COLORS.length];
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
                        <button onClick={() => openEdit(cliente)} className="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors">
                          <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(cliente.id)} className="w-6 h-6 rounded-md hover:bg-red-500/10 flex items-center justify-center transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                    {cliente.cedula && <p className="text-[10px] text-muted-foreground">{cliente.cedula}</p>}
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
                      <span className="text-[10px] text-muted-foreground">Desde {formatDate(cliente.created_at, { month: 'short', year: 'numeric' })}</span>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCliente ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <Input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Carlos" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Apellido *</label>
              <Input value={form.apellido} onChange={e => setForm(p => ({ ...p, apellido: e.target.value }))} placeholder="Ej: Rodríguez" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Email *</label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="correo@ejemplo.com" />
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
              <label className="text-xs font-medium text-muted-foreground">Dirección</label>
              <Input value={form.direccion} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} placeholder="Ej: Los Teques, Miranda" />
            </div>
             <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notas</label>
              <textarea
                className="flex w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none min-h-[60px]"
                value={form.notas}
                onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                placeholder="Observaciones del cliente..."
              />
            </div>

            {/* Vehiculos en edicion */}
            {editCliente && (
              <div className="col-span-2 mt-2 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-primary uppercase">Vehículos</label>
                  <Button variant="ghost" size="sm" onClick={openVehiculoNew} className="h-7 text-[10px] gap-1 px-2">
                    <Plus className="w-3 h-3" /> Añadir
                  </Button>
                </div>
                <div className="space-y-2">
                  {getVehiculos(editCliente.id).map(v => (
                    <div key={v.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-border/20 group">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium">{v.marca} {v.modelo}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">{v.placa} • {v.color || 'S/C'}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openVehiculoEdit(v)} className="p-1 hover:text-primary transition-colors">
                          <Edit className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeleteVehiculo(v.id)} className="p-1 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {getVehiculos(editCliente.id).length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2 opacity-50 italic">Sin vehículos registrados</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nombre || !form.apellido || !form.telefono}>
              {editCliente ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver cliente */}
      <Dialog open={!!viewCliente} onOpenChange={() => setViewCliente(null)}>
        <DialogContent className="max-w-md">
          {viewCliente && (
            <>
              <DialogHeader>
                <DialogTitle>Perfil del Cliente</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="text-base font-bold bg-primary/20 text-primary">
                    {getInitials(`${viewCliente.nombre} ${viewCliente.apellido}`)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{viewCliente.nombre} {viewCliente.apellido}</h3>
                  <p className="text-xs text-muted-foreground">{viewCliente.cedula || 'Sin cédula'}</p>
                  <p className="text-xs text-muted-foreground">Cliente desde {formatDate(viewCliente.created_at)}</p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Teléfono', value: viewCliente.telefono },
                  { label: 'Email', value: viewCliente.email },
                  { label: 'Dirección', value: viewCliente.direccion || 'No registrada' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg border border-border/30">
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{label}</span>
                    <span className="text-xs font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Vehículos ({getVehiculos(viewCliente.id).length})</p>
                <div className="space-y-1.5">
                   {getVehiculos(viewCliente.id).map(v => (
                    <div key={v.id} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/20 border border-border/20">
                      <div className="flex items-center gap-2">
                        <Car className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs font-bold">{v.marca} {v.modelo} ({v.anio})</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase font-mono ml-auto">
                          {v.placa}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 px-5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color === 'GRIS' ? '#888' : v.color === 'BLANCO' ? '#fff' : v.color === 'NEGRO' ? '#000' : '#444' }} />
                        <span className="text-[10px] text-muted-foreground uppercase">{v.color || 'Sin color'}</span>
                        {v.vin && <span className="text-[10px] text-muted-foreground font-mono">VIN: {v.vin}</span>}
                      </div>
                    </div>
                  ))}
                  {getVehiculos(viewCliente.id).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sin vehículos registrados</p>}
                </div>
              </div>
              {viewCliente.notas && (
                <div className="p-3 rounded-xl bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="text-xs">{viewCliente.notas}</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
