'use client';
import React, { useState } from 'react';
import { Users, Plus, Search, Phone, Mail, Car, MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { mockClientes, mockVehiculos } from '@/lib/mockData';
import { Cliente } from '@/types';
import { formatDate, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const COLORS = ['bg-blue-500/20 text-blue-400','bg-purple-500/20 text-purple-400','bg-green-500/20 text-green-400','bg-orange-500/20 text-orange-400','bg-pink-500/20 text-pink-400','bg-cyan-500/20 text-cyan-400'];

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>(mockClientes);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [viewCliente, setViewCliente] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', telefono: '', cedula: '', direccion: '', notas: '' });

  const filtered = clientes.filter(c =>
    `${c.nombre} ${c.apellido} ${c.email} ${c.telefono} ${c.cedula}`.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditCliente(null); setForm({ nombre:'',apellido:'',email:'',telefono:'',cedula:'',direccion:'',notas:'' }); setShowModal(true); };
  const openEdit = (c: Cliente) => { setEditCliente(c); setForm({ nombre:c.nombre,apellido:c.apellido,email:c.email,telefono:c.telefono,cedula:c.cedula||'',direccion:c.direccion||'',notas:c.notas||'' }); setShowModal(true); };

  const handleSave = () => {
    if (editCliente) {
      setClientes(prev => prev.map(c => c.id === editCliente.id ? { ...c, ...form, updated_at: new Date().toISOString() } : c));
    } else {
      const nuevo: Cliente = { id: Date.now().toString(), ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setClientes(prev => [nuevo, ...prev]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => setClientes(prev => prev.filter(c => c.id !== id));

  const getVehiculos = (clienteId: string) => mockVehiculos.filter(v => v.cliente_id === clienteId);

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
          { label: 'Con Vehículos', value: clientes.filter(c => getVehiculos(c.id).length > 0).length, color: 'text-orange-400' },
          { label: 'Nuevos este mes', value: 14, color: 'text-green-400' },
          { label: 'Activos', value: 48, color: 'text-purple-400' },
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((cliente, i) => {
          const vehiculos = getVehiculos(cliente.id);
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
                        <span className="font-medium">{vehiculos.length}</span>
                        <span className="text-muted-foreground">vehículo{vehiculos.length !== 1 ? 's' : ''}</span>
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

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No se encontraron clientes</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Intenta con otra búsqueda o agrega un nuevo cliente</p>
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
                  { label: 'Teléfono', value: viewCliente.telefono, icon: Phone },
                  { label: 'Email', value: viewCliente.email, icon: Mail },
                  { label: 'Dirección', value: viewCliente.direccion || 'No registrada', icon: null },
                ].map(({ label, value, icon: Icon }) => (
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
                    <div key={v.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/20">
                      <Car className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-xs font-medium">{v.marca} {v.modelo} {v.anio}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{v.placa}</span>
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
    </div>
  );
}
