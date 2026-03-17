'use client';
import React, { useState } from 'react';
import { Wrench, Plus, Search, Filter, Edit, Trash2, Clock, DollarSign, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/ui/status-badge';
import { mockServicios, mockVehiculos, mockClientes } from '@/lib/mockData';
import { Servicio, TipoServicio, EstadoServicio } from '@/types';
import { formatDate, formatCurrency, tipoServicioLabel, estadoServicioLabel } from '@/lib/utils';

const TIPOS: { v: TipoServicio; l: string }[] = [
  { v: 'mecanica', l: 'Mecánica' }, { v: 'electronica', l: 'Electrónica' },
  { v: 'cerrajeria', l: 'Cerrajería' }, { v: 'diagnostico', l: 'Diagnóstico' },
  { v: 'motor', l: 'Motor' }, { v: 'emergencia', l: 'Emergencia' }, { v: 'otro', l: 'Otro' }
];

const ESTADOS: { v: EstadoServicio; l: string }[] = [
  { v: 'pendiente', l: 'Pendiente' }, { v: 'en_proceso', l: 'En Proceso' },
  { v: 'finalizado', l: 'Finalizado' }, { v: 'cancelado', l: 'Cancelado' }
];

const ESTADO_ICONS = { pendiente: AlertCircle, en_proceso: Loader, finalizado: CheckCircle, cancelado: AlertCircle };
const ESTADO_COLORS = { pendiente: 'text-yellow-400', en_proceso: 'text-blue-400', finalizado: 'text-green-400', cancelado: 'text-red-400' };

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>(mockServicios);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editServicio, setEditServicio] = useState<Servicio | null>(null);
  const [form, setForm] = useState({ vehiculo_id: '', tipo: 'mecanica', descripcion: '', estado: 'pendiente', costo_estimado: '', notas: '' });

  const filtered = servicios.filter(s => {
    const v = mockVehiculos.find(v => v.id === s.vehiculo_id);
    const match = `${s.descripcion} ${tipoServicioLabel[s.tipo]} ${v?.marca} ${v?.modelo} ${v?.placa}`.toLowerCase().includes(search.toLowerCase());
    const tipoMatch = filterTipo === 'todos' || s.tipo === filterTipo;
    const estadoMatch = filterEstado === 'todos' || s.estado === filterEstado;
    return match && tipoMatch && estadoMatch;
  });

  const openNew = () => { setEditServicio(null); setForm({ vehiculo_id:'', tipo:'mecanica', descripcion:'', estado:'pendiente', costo_estimado:'', notas:'' }); setShowModal(true); };
  const openEdit = (s: Servicio) => { setEditServicio(s); setForm({ vehiculo_id:s.vehiculo_id, tipo:s.tipo, descripcion:s.descripcion, estado:s.estado, costo_estimado:s.costo_estimado?.toString()||'', notas:s.notas||'' }); setShowModal(true); };

  const handleSave = () => {
    if (editServicio) {
      setServicios(prev => prev.map(s => s.id === editServicio.id ? { ...s, ...form, tipo: form.tipo as TipoServicio, estado: form.estado as EstadoServicio, costo_estimado: Number(form.costo_estimado), updated_at: new Date().toISOString() } : s));
    } else {
      const nuevo: Servicio = { id: Date.now().toString(), ...form, tipo: form.tipo as TipoServicio, estado: form.estado as EstadoServicio, costo_estimado: Number(form.costo_estimado), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setServicios(prev => [nuevo, ...prev]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => setServicios(prev => prev.filter(s => s.id !== id));
  const changeEstado = (id: string, estado: EstadoServicio) => setServicios(prev => prev.map(s => s.id === id ? { ...s, estado, updated_at: new Date().toISOString() } : s));

  const getVehiculo = (id: string) => mockVehiculos.find(v => v.id === id);
  const getCliente = (clienteId: string) => mockClientes.find(c => c.id === clienteId);

  const countByEstado = (e: string) => servicios.filter(s => s.estado === e).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Servicios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{servicios.length} servicios en total</p>
        </div>
        <Button onClick={openNew} className="gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Nuevo Servicio
        </Button>
      </div>

      {/* Kanban-style stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ESTADOS.map(e => {
          const Icon = ESTADO_ICONS[e.v];
          return (
            <button key={e.v} onClick={() => setFilterEstado(filterEstado === e.v ? 'todos' : e.v)} className={`stat-card border text-left transition-all ${filterEstado === e.v ? 'border-primary/30 bg-primary/5' : 'border-border/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{e.l}</p>
                <Icon className={`w-3.5 h-3.5 ${ESTADO_COLORS[e.v]}`} />
              </div>
              <p className={`text-2xl font-bold ${ESTADO_COLORS[e.v]}`} style={{ fontFamily: 'Syne, sans-serif' }}>{countByEstado(e.v)}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Buscar por descripción, vehículo..." icon={<Search />} value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {TIPOS.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map(e => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table / Cards */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Vehículo / Descripción</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">Costo Est.</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">Fecha</th>
                  <th className="text-right p-4 text-xs font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filtered.map(s => {
                  const vehiculo = getVehiculo(s.vehiculo_id);
                  const cliente = vehiculo ? getCliente(vehiculo.cliente_id) : null;
                  return (
                    <tr key={s.id} className="hover:bg-white/2 transition-colors group">
                      <td className="p-4">
                        <div>
                          <p className="text-sm font-medium truncate max-w-[200px] md:max-w-xs">{s.descripcion}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} · ${vehiculo.placa}` : 'Vehículo no encontrado'}
                            {cliente && ` · ${cliente.nombre} ${cliente.apellido}`}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <StatusBadge status={s.tipo} type="tipo" />
                      </td>
                      <td className="p-4">
                        <Select value={s.estado} onValueChange={(v) => changeEstado(s.id, v as EstadoServicio)}>
                          <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 w-28 focus:ring-0">
                            <StatusBadge status={s.estado} />
                          </SelectTrigger>
                          <SelectContent>
                            {ESTADOS.map(e => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-sm font-medium">{s.costo_estimado ? formatCurrency(s.costo_estimado) : '—'}</span>
                        {s.costo_final && <p className="text-[10px] text-green-400 mt-0.5">Final: {formatCurrency(s.costo_final)}</p>}
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{s.fecha_inicio ? formatDate(s.fecha_inicio) : formatDate(s.created_at)}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(s)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(s.id)} className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <Wrench className="w-10 h-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No se encontraron servicios</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editServicio ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Vehículo *</label>
              <Select value={form.vehiculo_id} onValueChange={v => setForm(p => ({ ...p, vehiculo_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vehículo" /></SelectTrigger>
                <SelectContent>
                  {mockVehiculos.map(v => {
                    const c = getCliente(v.cliente_id);
                    return <SelectItem key={v.id} value={v.id}>{v.marca} {v.modelo} {v.anio} · {v.placa}{c ? ` — ${c.nombre} ${c.apellido}` : ''}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
                <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                <Select value={form.estado} onValueChange={v => setForm(p => ({ ...p, estado: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ESTADOS.map(e => <SelectItem key={e.v} value={e.v}>{e.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descripción *</label>
              <textarea
                className="flex w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none min-h-[80px]"
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Describa el servicio a realizar..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Costo Estimado (USD)</label>
              <Input type="number" value={form.costo_estimado} onChange={e => setForm(p => ({ ...p, costo_estimado: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notas internas</label>
              <textarea
                className="flex w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none min-h-[60px]"
                value={form.notas}
                onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                placeholder="Notas para el técnico..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.vehiculo_id || !form.descripcion}>
              {editServicio ? 'Guardar Cambios' : 'Crear Servicio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
