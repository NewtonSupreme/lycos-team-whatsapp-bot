'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet, Plus, Trash2, Search, CheckCircle, AlertCircle, Loader2,
  ArrowRight, ArrowLeft, Printer, UserPlus, Car, DollarSign, Euro,
  Percent, Receipt, History, Clock, Send, X, Edit3, Eye, Ban,
  Check, RefreshCw, Save, FileText, Calendar, Wallet,
  Package, Wrench, MoreHorizontal, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  fetchPresupuestos, fetchPresupuesto, createPresupuesto,
  updatePresupuesto, deletePresupuesto, updatePresupuestoEstado,
  generateNumeroPresupuesto
} from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useAppStore } from '@/lib/store';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generatePresupuestoPDF } from '@/lib/presupuesto-pdf';
import { logActivity } from '@/lib/activity';
import type { Presupuesto, PresupuestoItem, Moneda, EstadoPresupuesto } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type Step = 1 | 2 | 3 | 4;

interface CartItem {
  id: string;
  tipo: 'servicio' | 'repuesto' | 'otro';
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  moneda: Moneda;
  total: number;
  inventario_id?: string;
  categoria?: string;
}

const MONEDA_LABELS: Record<Moneda, string> = { USD: 'USD $', VES: 'VES Bs.', EUR: 'EUR €' };
const MONEDA_SYMBOLS: Record<Moneda, string> = { USD: '$', VES: 'Bs.', EUR: '€' };
const ESTADO_LABELS: Record<EstadoPresupuesto, string> = {
  borrador: 'Borrador', enviado: 'Enviado', aprobado: 'Aprobado',
  rechazado: 'Rechazado', vencido: 'Vencido', convertido: 'Convertido'
};
const ESTADO_COLORS: Record<EstadoPresupuesto, string> = {
  borrador: 'text-gray-400 bg-gray-400/10',
  enviado: 'text-blue-400 bg-blue-400/10',
  aprobado: 'text-green-400 bg-green-400/10',
  rechazado: 'text-red-400 bg-red-400/10',
  vencido: 'text-yellow-400 bg-yellow-400/10',
  convertido: 'text-purple-400 bg-purple-400/10',
};

export default function PresupuestosPage() {
  const { currentSede } = useSedeStore();
  const { user } = useAppStore();
  const { can } = useRolePermissions();

  // Wizard step
  const [step, setStep] = useState<Step>(1);

  // Data
  const [clientes, setClientes] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [inventario, setInventario] = useState<any[]>([]);
  const [presupuestos, setPresupuestos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState({ bcv: 55 });

  // Step 1: Client & Vehicle
  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [selectedVehiculo, setSelectedVehiculo] = useState<any>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteCedula, setClienteCedula] = useState('');
  const [clienteDireccion, setClienteDireccion] = useState('');
  const [vehiculoInfo, setVehiculoInfo] = useState('');

  // Step 2: Items
  const [items, setItems] = useState<CartItem[]>([]);
  const [monedaGlobal, setMonedaGlobal] = useState<Moneda>('USD');
  const [serviceSearch, setServiceSearch] = useState('');
  const [partsSearch, setPartsSearch] = useState('');

  // Step 3: Review & Adjust
  const [descuento, setDescuento] = useState(0);
  const [descuentoTipo, setDescuentoTipo] = useState<'porcentaje' | 'monto'>('porcentaje');
  const [conIva, setConIva] = useState(false);
  const [notas, setNotas] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [validezDias, setValidezDias] = useState(15);

  // History
  const [view, setView] = useState<'nuevo' | 'historial'>('nuevo');
  const [searchHistory, setSearchHistory] = useState('');
  const [viewingPresupuesto, setViewingPresupuesto] = useState<any>(null);
  const [filterEstado, setFilterEstado] = useState<string>('todos');

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [cliRes, vehRes, invRes] = await Promise.all([
        withSedeFilter(supabase.from('clientes')).select('*').order('nombre'),
        withSedeFilter(supabase.from('vehiculos')).select('*, clientes(nombre, apellido)').order('created_at', { ascending: false }),
        withSedeFilter(supabase.from('inventario')).select('*').eq('activo', true).order('nombre'),
      ]);
      const presData = await fetchPresupuestos(100);
      setClientes(cliRes?.data || []);
      setVehiculos(vehRes?.data || []);
      setInventario(invRes?.data || []);
      setPresupuestos(presData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentSede]);

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/rates');
      const data = await res.json();
      setRates({ bcv: data.bcv || 55 });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchData();
    fetchRates();
  }, [fetchData]);

  // ── Computed values ───────────────────────────────────────────
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const descMonto = descuentoTipo === 'porcentaje' ? subtotal * (descuento / 100) : descuento;
  const afterDiscount = Math.max(0, subtotal - descMonto);
  const ivaMonto = conIva ? afterDiscount * 0.16 : 0;
  const total = afterDiscount + ivaMonto;
  const tasaCambio = rates.bcv;

  const filteredClientes = clientes.filter(c =>
    `${c.nombre} ${c.apellido} ${c.telefono} ${c.cedula || ''}`
      .toLowerCase().includes(clienteSearch.toLowerCase())
  );

  const filteredPresupuestos = presupuestos.filter((p: any) => {
    const matchSearch = !searchHistory || 
      p.numero.toLowerCase().includes(searchHistory.toLowerCase()) ||
      (p.cliente_nombre || '').toLowerCase().includes(searchHistory.toLowerCase()) ||
      (p.vehiculo_info || '').toLowerCase().includes(searchHistory.toLowerCase());
    const matchEstado = filterEstado === 'todos' || p.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  // ── Step 1: Select/Create Client ──────────────────────────────
  const selectCliente = (cliente: any) => {
    setSelectedCliente(cliente);
    setClienteNombre(`${cliente.nombre} ${cliente.apellido}`);
    setClienteTelefono(cliente.telefono || '');
    setClienteCedula(cliente.cedula || '');
    setClienteDireccion(cliente.direccion || '');

    const vehics = vehiculos.filter(v => v.cliente_id === cliente.id);
    if (vehics.length > 0) {
      const v = vehics[0];
      setSelectedVehiculo(v);
      setVehiculoInfo(`${v.marca} ${v.modelo} ${v.placa ? '- ' + v.placa : ''}`.trim());
    } else {
      setSelectedVehiculo(null);
    }
  };

  const selectVehiculo = (v: any) => {
    setSelectedVehiculo(v);
    setVehiculoInfo(`${v.marca} ${v.modelo} ${v.placa ? '- ' + v.placa : ''}`.trim());
  };

  // ── Step 2: Add Items ─────────────────────────────────────────
  const addServicio = () => {
    const desc = prompt('Describa el servicio:');
    if (!desc) return;
    const price = parseFloat(prompt('Precio unitario (USD):', '0') || '0');
    if (price <= 0) return;
    const newItem: CartItem = {
      id: `svc-${Date.now()}`,
      tipo: 'servicio',
      descripcion: desc,
      cantidad: 1,
      precio_unitario: price,
      moneda: monedaGlobal,
      total: price,
    };
    setItems([...items, newItem]);
  };

  const addServicioCustom = (desc: string, price: number, moneda: Moneda) => {
    const newItem: CartItem = {
      id: `svc-${Date.now()}`,
      tipo: 'servicio',
      descripcion: desc,
      cantidad: 1,
      precio_unitario: price,
      moneda,
      total: price,
    };
    setItems([...items, newItem]);
  };

  const addCustomItem = (desc: string, qty: number, price: number, moneda: Moneda) => {
    setItems([...items, {
      id: `custom-${Date.now()}`,
      tipo: 'otro',
      descripcion: desc,
      cantidad: qty,
      precio_unitario: price,
      moneda,
      total: price * qty,
    }]);
  };

  const addRepuesto = (prod: any) => {
    const qty = 1;
    const unitPrice = prod.precio_usd || 0;
    const existing = items.find(i => i.inventario_id === prod.id);
    if (existing) {
      setItems(items.map(i =>
        i.id === existing.id
          ? { ...i, cantidad: i.cantidad + 1, total: (i.cantidad + 1) * i.precio_unitario }
          : i
      ));
    } else {
      setItems([...items, {
        id: `rep-${Date.now()}`,
        tipo: 'repuesto',
        descripcion: prod.nombre,
        cantidad: qty,
        precio_unitario: unitPrice,
        moneda: 'USD',
        total: unitPrice * qty,
        inventario_id: prod.id,
        categoria: prod.categoria,
      }]);
    }
  };

  const updateItemQty = (id: string, delta: number) => {
    setItems(items.map(i =>
      i.id === id
        ? { ...i, cantidad: Math.max(1, i.cantidad + delta), total: Math.max(1, i.cantidad + delta) * i.precio_unitario }
        : i
    ));
  };

  const updateItemPrice = (id: string, price: number) => {
    setItems(items.map(i =>
      i.id === id
        ? { ...i, precio_unitario: price, total: i.cantidad * price }
        : i
    ));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  // ── Step 4: Save & PDF ────────────────────────────────────────
  const handleSave = async () => {
    if (items.length === 0) {
      alert('Agrega al menos un servicio o repuesto al presupuesto.');
      return;
    }
    if (!clienteNombre.trim()) {
      alert('Indica el nombre del cliente.');
      return;
    }
    if (!supabase) return;

    setSaving(true);
    try {
      const isEdit = !!editingPresupuesto;

      // En edición conservamos el número y la fecha de creación originales;
      // recalculamos la expiración sobre la fecha de creación real.
      const numero = isEdit ? editingPresupuesto.numero : await generateNumeroPresupuesto();
      const estadoActual: EstadoPresupuesto = isEdit ? (editingPresupuesto.estado || 'borrador') : 'borrador';
      const createdAt = isEdit && editingPresupuesto.created_at ? editingPresupuesto.created_at : new Date().toISOString();
      const expDate = new Date(createdAt);
      expDate.setDate(expDate.getDate() + validezDias);

      const itemsPayload = items.map(i => ({
        id: i.id,
        tipo: i.tipo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        moneda: i.moneda,
        total: i.total,
        inventario_id: i.inventario_id || null,
        categoria: i.categoria || null,
      }));

      // Campos comunes (lo editable). En edición NO tocamos numero/estado/creado_por.
      const commonPayload = {
        cliente_id: selectedCliente?.id || null,
        cliente_nombre: clienteNombre.trim(),
        cliente_telefono: clienteTelefono.trim() || null,
        cliente_cedula: clienteCedula.trim() || null,
        cliente_direccion: clienteDireccion.trim() || null,
        vehiculo_id: selectedVehiculo?.id || null,
        vehiculo_info: vehiculoInfo.trim() || null,
        moneda: monedaGlobal,
        tasa_cambio: monedaGlobal !== 'VES' ? tasaCambio : null,
        items: itemsPayload,
        subtotal,
        descuento,
        descuento_tipo: descuentoTipo,
        iva: ivaMonto,
        total,
        notas: notas.trim() || null,
        condiciones: condiciones.trim() || null,
        validez_dias: validezDias,
        fecha_expiracion: expDate.toISOString(),
      };

      if (isEdit) {
        const result = await updatePresupuesto(editingPresupuesto.id, commonPayload);
        if (!result) throw new Error('Error al actualizar presupuesto');

        await logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'presupuestos',
          accion: 'Editar presupuesto',
          detalles: `Presupuesto #${numero} - ${clienteNombre.trim()} - Total: ${MONEDA_SYMBOLS[monedaGlobal]}${total.toFixed(2)}`,
          referencia_id: editingPresupuesto.id,
          referencia_tabla: 'presupuestos',
        });
      } else {
        const payload = {
          numero,
          ...commonPayload,
          estado: 'borrador',
          creado_por: user?.nombre || 'Sistema',
          creado_por_id: user?.id || null,
        };

        const result = await createPresupuesto(payload);
        if (!result) throw new Error('Error al crear presupuesto');

        await logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'presupuestos',
          accion: 'Crear presupuesto',
          detalles: `Presupuesto #${numero} - ${clienteNombre.trim()} - Total: ${MONEDA_SYMBOLS[monedaGlobal]}${total.toFixed(2)}`,
          referencia_id: result.id,
          referencia_tabla: 'presupuestos',
        });
      }

      generatePresupuestoPDF({
        numero,
        created_at: createdAt,
        fecha_expiracion: expDate.toISOString(),
        cliente_nombre: clienteNombre.trim(),
        cliente_telefono: clienteTelefono.trim() || null,
        cliente_cedula: clienteCedula.trim() || null,
        cliente_direccion: clienteDireccion.trim() || null,
        vehiculo_info: vehiculoInfo.trim() || null,
        moneda: monedaGlobal,
        tasa_cambio: monedaGlobal !== 'VES' ? tasaCambio : null,
        items: items.map(i => ({
          tipo: i.tipo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          moneda: i.moneda,
          total: i.total,
        })),
        subtotal,
        descuento,
        descuento_tipo: descuentoTipo,
        iva: ivaMonto,
        total,
        notas: notas.trim() || null,
        condiciones: condiciones.trim() || null,
        estado: estadoActual,
        validez_dias: validezDias,
      });

      alert(isEdit ? `¡Presupuesto #${numero} actualizado con éxito!` : `¡Presupuesto #${numero} creado con éxito!`);
      resetForm();
      setView('historial');
      fetchData();
    } catch (err: any) {
      console.error('Error saving presupuesto:', err);
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEstadoChange = async (id: string, nuevoEstado: EstadoPresupuesto) => {
    if (!supabase) return;
    try {
      await updatePresupuestoEstado(id, nuevoEstado);
      await logActivity({
        usuario: user?.nombre || 'Sistema',
        modulo: 'presupuestos',
        accion: `Cambiar estado a ${nuevoEstado}`,
        detalles: `Presupuesto ID: ${id}`,
        referencia_id: id,
        referencia_tabla: 'presupuestos',
      });
      fetchData();
      if (viewingPresupuesto?.id === id) {
        setViewingPresupuesto({ ...viewingPresupuesto, estado: nuevoEstado });
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!can('presupuestos', 'eliminar')) return alert('No tienes permisos para eliminar presupuestos.');
    if (!confirm('¿Eliminar este presupuesto permanentemente?')) return;
    try {
      await deletePresupuesto(id);
      await logActivity({
        usuario: user?.nombre || 'Sistema',
        modulo: 'presupuestos',
        accion: 'Eliminar presupuesto',
        detalles: `Presupuesto ID: ${id}`,
        referencia_id: id,
        referencia_tabla: 'presupuestos',
      });
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // ── Editar presupuesto ────────────────────────────────────────
  // editingPresupuesto = registro en edición (null => modo creación).
  // loadingEditId = id de la card que está cargando para editar (spinner).
  const [editingPresupuesto, setEditingPresupuesto] = useState<any>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  const handleEdit = async (p: any) => {
    if (!supabase) return;
    if (!can('presupuestos', 'editar')) {
      alert('No tienes permisos para editar presupuestos.');
      return;
    }
    setLoadingEditId(p.id);
    try {
      const full = await fetchPresupuesto(p.id);
      if (!full) {
        alert('No se pudo cargar el presupuesto a editar.');
        return;
      }

      // Limpiar el formulario antes de precargar los datos existentes
      resetForm();

      // Datos del cliente
      setSelectedCliente(full.cliente_id ? (clientes.find(c => c.id === full.cliente_id) || null) : null);
      setClienteNombre(full.cliente_nombre || '');
      setClienteTelefono(full.cliente_telefono || '');
      setClienteCedula(full.cliente_cedula || '');
      setClienteDireccion(full.cliente_direccion || '');
      setSelectedVehiculo(full.vehiculo_id ? (vehiculos.find(v => v.id === full.vehiculo_id) || null) : null);
      setVehiculoInfo(full.vehiculo_info || '');

      // Moneda
      setMonedaGlobal((full.moneda as Moneda) || 'USD');

      // Items (regeneramos ids internos para el carrito; los datos son los reales)
      const rawItems: any[] = typeof full.items === 'string' ? JSON.parse(full.items) : (full.items || []);
      const loadedItems: CartItem[] = rawItems.map((i: any, idx: number) => ({
        id: i.id || `edit-${Date.now()}-${idx}`,
        tipo: (i.tipo as CartItem['tipo']) || 'otro',
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad) || 1,
        precio_unitario: Number(i.precio_unitario) || 0,
        moneda: (i.moneda as Moneda) || (full.moneda as Moneda) || 'USD',
        total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
        inventario_id: i.inventario_id || undefined,
        categoria: i.categoria || undefined,
      }));
      setItems(loadedItems);

      // Ajustes (descuento, IVA, notas, condiciones, validez)
      setDescuento(Number(full.descuento) || 0);
      setDescuentoTipo((full.descuento_tipo as 'porcentaje' | 'monto') || 'porcentaje');
      setConIva(Number(full.iva) > 0);
      setNotas(full.notas || '');
      setCondiciones(full.condiciones || '');
      setValidezDias(Number(full.validez_dias) || 15);

      // Activar modo edición y abrir el asistente en el paso de revisión
      setEditingPresupuesto(full);
      setViewingPresupuesto(null);
      setView('nuevo');
      setStep(3);
    } catch (err: any) {
      console.error('Error al cargar presupuesto para editar:', err);
      alert('Error al editar: ' + err.message);
    } finally {
      setLoadingEditId(null);
    }
  };

  const resetForm = () => {
    setEditingPresupuesto(null);
    setStep(1);
    setSelectedCliente(null);
    setSelectedVehiculo(null);
    setClienteNombre('');
    setClienteTelefono('');
    setClienteCedula('');
    setClienteDireccion('');
    setVehiculoInfo('');
    setItems([]);
    setDescuento(0);
    setDescuentoTipo('porcentaje');
    setConIva(false);
    setNotas('');
    setCondiciones('');
    setValidezDias(15);
  };

  // ── Service modal ────────────────────────────────────────────
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceMoneda, setNewServiceMoneda] = useState<Moneda>('USD');

  // ── Custom Item modal ────────────────────────────────────────
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [newCustomDesc, setNewCustomDesc] = useState('');
  const [newCustomQty, setNewCustomQty] = useState('1');
  const [newCustomPrice, setNewCustomPrice] = useState('');
  const [newCustomMoneda, setNewCustomMoneda] = useState<Moneda>('USD');

  // ── Render helpers ────────────────────────────────────────────
  const ProgressBar = () => (
    <div className="flex items-center gap-2 mb-8">
      {([1, 2, 3, 4] as Step[]).map((s) => (
        <React.Fragment key={s}>
          <button
            onClick={() => s < step && setStep(s)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all',
              step === s ? 'bg-primary text-white shadow-lg shadow-primary/30' :
              s < step ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30' :
              'bg-muted text-muted-foreground'
            )}
          >
            <span className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black',
              step === s ? 'bg-white text-primary' :
              s < step ? 'bg-primary text-white' :
              'bg-muted-foreground/20 text-muted-foreground'
            )}>
              {s < step ? <Check className="w-3 h-3" /> : s}
            </span>
            <span className="hidden sm:inline">
              {s === 1 ? 'Cliente' : s === 2 ? 'Servicios' : s === 3 ? 'Revisar' : 'Finalizar'}
            </span>
          </button>
          {s < 4 && <div className={cn('flex-1 h-px', s < step ? 'bg-primary' : 'bg-border')} />}
        </React.Fragment>
      ))}
    </div>
  );

  const renderMonedaSelector = () => (
    <div className="flex items-center gap-2 bg-card/40 rounded-xl p-1 border border-border/50">
      {(['USD', 'VES', 'EUR'] as Moneda[]).map(m => (
        <button
          key={m}
          onClick={() => setMonedaGlobal(m)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5',
            monedaGlobal === m ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {m === 'USD' ? <DollarSign className="w-3 h-3" /> : m === 'EUR' ? <Euro className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
          {MONEDA_LABELS[m]}
        </button>
      ))}
    </div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────
  if (loading && presupuestos.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow italic">Presupuestos</span>
            <FileSpreadsheet className="w-8 h-8 text-primary animate-float" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {view === 'nuevo' && editingPresupuesto
              ? `Editando presupuesto ${editingPresupuesto.numero}`
              : 'Crea presupuestos profesionales paso a paso.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-card/40 rounded-xl p-1 border border-border/50">
            <button
              onClick={() => { setView('nuevo'); resetForm(); }}
              className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2',
                view === 'nuevo' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground'
              )}
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo
            </button>
            <button
              onClick={() => { setView('historial'); setViewingPresupuesto(null); }}
              className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2',
                view === 'historial' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground'
              )}
            >
              <History className="w-3.5 h-3.5" /> Historial
            </button>
          </div>
          <div className="flex items-center gap-2 bg-card/40 backdrop-blur-xl p-2 rounded-xl border border-border/50">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold">Tasa: {rates.bcv} Bs/$</span>
          </div>
        </div>
      </div>

      {view === 'nuevo' ? (
        <>
          <ProgressBar />

          {/* ════════════════════════════════════════════════════════════
             STEP 1: CLIENTE Y VEHÍCULO
          ════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Client List */}
              <Card className="lg:col-span-3 glass-panel border-border/50 bg-card/40">
                <CardHeader className="pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente por nombre, teléfono o cédula..."
                      className="pl-10 h-11 bg-background/50"
                      value={clienteSearch}
                      onChange={e => setClienteSearch(e.target.value)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="max-h-[400px] overflow-y-auto custom-scrollbar">
                  {filteredClientes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <UserPlus className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm font-bold">No hay clientes</p>
                      <p className="text-xs">Crea un cliente desde la sección Clientes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredClientes.map(cliente => (
                        <button
                          key={cliente.id}
                          onClick={() => selectCliente(cliente)}
                          className={cn(
                            'w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3',
                            selectedCliente?.id === cliente.id
                              ? 'border-primary bg-primary/10 shadow-sm'
                              : 'border-border/30 bg-background/40 hover:bg-background hover:border-primary/30'
                          )}
                        >
                          <div className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center text-sm font-black',
                            selectedCliente?.id === cliente.id ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                          )}>
                            {cliente.nombre[0]}{cliente.apellido[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{cliente.nombre} {cliente.apellido}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {cliente.telefono} {cliente.cedula ? `| ${cliente.cedula}` : ''}
                            </p>
                          </div>
                          {selectedCliente?.id === cliente.id && (
                            <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Selected Client + Vehicle Form */}
              <Card className="lg:col-span-2 glass-panel border-border/50 bg-card/40">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" /> Datos del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Nombre del Cliente <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Nombre completo"
                      value={clienteNombre}
                      onChange={e => setClienteNombre(e.target.value)}
                      className="bg-background/50 h-10"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teléfono</Label>
                      <Input placeholder="+58 412..." value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)} className="bg-background/50 h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cédula</Label>
                      <Input placeholder="V-12345678" value={clienteCedula} onChange={e => setClienteCedula(e.target.value)} className="bg-background/50 h-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dirección</Label>
                    <Input placeholder="Dirección del cliente" value={clienteDireccion} onChange={e => setClienteDireccion(e.target.value)} className="bg-background/50 h-10" />
                  </div>

                  {/* Vehicle */}
                  <div className="border-t border-border/30 pt-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
                      <Car className="w-3 h-3 text-primary" /> Vehículo (opcional)
                    </Label>
                    {selectedCliente && (
                      <div className="mb-3">
                        <Select
                          value={selectedVehiculo?.id || ''}
                          onValueChange={(val) => {
                            const v = vehiculos.find(v => v.id === val);
                            if (v) selectVehiculo(v);
                          }}
                        >
                          <SelectTrigger className="bg-background/50 h-10 text-xs">
                            <SelectValue placeholder="Seleccionar vehículo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {vehiculos.filter(v => v.cliente_id === selectedCliente.id).map(v => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.marca} {v.modelo} - {v.placa}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Input
                      placeholder="Ej: Toyota Corolla - ABC-123"
                      value={vehiculoInfo}
                      onChange={e => setVehiculoInfo(e.target.value)}
                      className="bg-background/50 h-10"
                    />
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-end pt-4">
                    <Button
                      disabled={!clienteNombre.trim()}
                      onClick={() => setStep(2)}
                      className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold gap-2 px-6"
                    >
                      Siguiente <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
             STEP 2: SERVICIOS Y REPUESTOS
          ════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Add Services & Parts */}
              <div className="lg:col-span-7 space-y-4">
                {/* Servicios */}
                <Card className="glass-panel border-border/50 bg-card/40">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-primary" /> Servicios (Mano de Obra)
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-[10px] font-bold gap-1.5 border-primary/30 text-primary"
                      onClick={() => {
                        setNewServiceDesc('');
                        setNewServicePrice('');
                        setNewServiceMoneda(monedaGlobal);
                        setShowServiceModal(true);
                      }}
                    >
                      <Plus className="w-3 h-3" /> Agregar
                    </Button>
                  </CardHeader>
                </Card>

                {/* Items Personalizados */}
                <Card className="glass-panel border-border/50 bg-card/40">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="w-4 h-4 text-purple-400" /> Items Personalizados
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-[10px] font-bold gap-1.5 border-purple-400/30 text-purple-400"
                      onClick={() => {
                        setNewCustomDesc('');
                        setNewCustomQty('1');
                        setNewCustomPrice('');
                        setNewCustomMoneda(monedaGlobal);
                        setShowCustomModal(true);
                      }}
                    >
                      <Plus className="w-3 h-3" /> Agregar
                    </Button>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <p className="text-[10px] text-muted-foreground">
                      Agrega cualquier repuesto que no esté en el inventario: amortiguadores, cauchos, correas, piezas especiales, etc.
                    </p>
                  </CardContent>
                </Card>

                {/* Repuestos del Inventario */}
                <Card className="glass-panel border-border/50 bg-card/40">
                  <CardHeader className="pb-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar repuestos en inventario..."
                        className="pl-10 h-11 bg-background/50"
                        value={partsSearch}
                        onChange={e => setPartsSearch(e.target.value)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(partsSearch
                        ? inventario.filter(p => p.nombre.toLowerCase().includes(partsSearch.toLowerCase()))
                        : inventario.slice(0, 20)
                      ).map(prod => (
                        <button
                          key={prod.id}
                          onClick={() => addRepuesto(prod)}
                          className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-background/40 hover:bg-background hover:border-primary/30 transition-all text-left group"
                        >
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                            <Package className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold truncate">{prod.nombre}</p>
                            <p className="text-[10px] text-primary font-black">
                              ${prod.precio_usd || '0.00'} <span className="text-muted-foreground font-normal">| Stock: {prod.stock}</span>
                            </p>
                          </div>
                          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                        </button>
                      ))}
                      {inventario.length === 0 && (
                        <div className="col-span-full py-8 text-center text-muted-foreground text-xs">
                          No hay productos en inventario
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Cart / Items List */}
              <div className="lg:col-span-5">
                <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl flex flex-col h-full">
                  <CardHeader className="border-b border-border/30 bg-primary/5 pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-black flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-primary" /> Items
                        <Badge className="bg-primary text-white border-none text-[10px]">{items.length}</Badge>
                      </CardTitle>
                      <button onClick={() => setItems([])} className="text-[10px] font-bold text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="mt-3">{renderMonedaSelector()}</div>
                  </CardHeader>

                  <CardContent className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                    {items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 opacity-30">
                        <Receipt className="w-12 h-12 mb-3" />
                        <p className="text-xs font-bold uppercase">Sin Items</p>
                        <p className="text-[10px]">Agrega servicios o repuestos</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/20">
                        {items.map(item => (
                          <div key={item.id} className="p-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0',
                              item.tipo === 'servicio' ? 'bg-blue-400/10 text-blue-400' :
                              item.tipo === 'repuesto' ? 'bg-green-400/10 text-green-400' :
                              'bg-purple-400/10 text-purple-400'
                            )}>
                              {item.tipo === 'servicio' ? 'S' : item.tipo === 'repuesto' ? 'R' : 'P'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold truncate">{item.descripcion}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center bg-background rounded-lg border border-border shadow-sm">
                                  <button onClick={() => updateItemQty(item.id, -1)} className="px-1.5 py-0.5 text-muted-foreground hover:text-primary transition-colors text-[10px]">-</button>
                                  <span className="w-6 text-center text-[10px] font-black">{item.cantidad}</span>
                                  <button onClick={() => updateItemQty(item.id, 1)} className="px-1.5 py-0.5 text-muted-foreground hover:text-primary transition-colors text-[10px]">+</button>
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.precio_unitario}
                                  onChange={e => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-background/50 border border-border rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-right"
                                />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-black text-primary">
                                {MONEDA_SYMBOLS[item.moneda]}{Number(item.total).toFixed(2)}
                              </p>
                            </div>
                            <button onClick={() => removeItem(item.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>

                  <div className="p-4 border-t border-border/30 bg-secondary/10">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Subtotal</span>
                      <span className="text-sm font-black text-primary">
                        {MONEDA_SYMBOLS[monedaGlobal]}{Number(subtotal).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStep(1)}
                        className="h-9 rounded-lg text-[10px] font-bold gap-1.5"
                      >
                        <ArrowLeft className="w-3 h-3" /> Atrás
                      </Button>
                      <Button
                        disabled={items.length === 0}
                        size="sm"
                        onClick={() => setStep(3)}
                        className="flex-1 h-9 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-[10px] gap-1.5"
                      >
                        Revisar <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
             STEP 3: REVISIÓN Y AJUSTES
          ════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Item Review */}
              <Card className="lg:col-span-3 glass-panel border-border/50 bg-card/40">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" /> Resumen de Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left py-2 font-bold text-muted-foreground">#</th>
                          <th className="text-left py-2 font-bold text-muted-foreground">Descripción</th>
                          <th className="text-center py-2 font-bold text-muted-foreground">Tipo</th>
                          <th className="text-center py-2 font-bold text-muted-foreground">Cant</th>
                          <th className="text-right py-2 font-bold text-muted-foreground">P.Unit</th>
                          <th className="text-right py-2 font-bold text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/10">
                        {items.map((item, i) => (
                          <tr key={item.id} className="hover:bg-white/5">
                            <td className="py-2 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 font-bold">{item.descripcion}</td>
                            <td className="py-2 text-center">
                              <Badge variant="outline" className={cn(
                                'text-[9px] px-1.5 py-0 h-4 font-bold',
                                item.tipo === 'servicio' ? 'border-blue-400/30 text-blue-400' :
                                item.tipo === 'repuesto' ? 'border-green-400/30 text-green-400' :
                                'border-purple-400/30 text-purple-400'
                              )}>
                                {item.tipo === 'servicio' ? 'SERV' : item.tipo === 'repuesto' ? 'REP' : 'PERS'}
                              </Badge>
                            </td>
                            <td className="py-2 text-center">{item.cantidad}</td>
                            <td className="py-2 text-right">{MONEDA_SYMBOLS[item.moneda]}{item.precio_unitario.toFixed(2)}</td>
                            <td className="py-2 text-right font-bold">{MONEDA_SYMBOLS[item.moneda]}{item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Ajustes y Totales */}
              <Card className="lg:col-span-2 glass-panel border-border/50 bg-card/40">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Percent className="w-4 h-4 text-primary" /> Ajustes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Descuento */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descuento</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-card rounded-lg p-0.5 border border-border/50">
                        <button
                          onClick={() => setDescuentoTipo('porcentaje')}
                          className={cn('px-2 py-1 rounded-md text-[10px] font-bold transition-all',
                            descuentoTipo === 'porcentaje' ? 'bg-primary text-white' : 'text-muted-foreground'
                          )}
                        >
                          %
                        </button>
                        <button
                          onClick={() => setDescuentoTipo('monto')}
                          className={cn('px-2 py-1 rounded-md text-[10px] font-bold transition-all',
                            descuentoTipo === 'monto' ? 'bg-primary text-white' : 'text-muted-foreground'
                          )}
                        >
                          {MONEDA_SYMBOLS[monedaGlobal]}
                        </button>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={descuento}
                        onChange={e => setDescuento(parseFloat(e.target.value) || 0)}
                        className="bg-background/50 h-9 w-24 text-right text-xs font-bold"
                      />
                    </div>
                  </div>

                  {/* IVA */}
                  <label className="flex items-center gap-2 cursor-pointer group py-2">
                    <input
                      type="checkbox"
                      checked={conIva}
                      onChange={e => setConIva(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary"
                    />
                    <span className="text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
                      Aplicar IVA (16%)
                    </span>
                  </label>

                  {/* Validez */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Validez (días)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={validezDias}
                      onChange={e => setValidezDias(parseInt(e.target.value) || 15)}
                      className="bg-background/50 h-9 w-20"
                    />
                  </div>

                  {/* Notas */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notas</Label>
                    <Textarea
                      placeholder="Notas adicionales..."
                      value={notas}
                      onChange={e => setNotas(e.target.value)}
                      className="bg-background/50 text-xs min-h-[60px]"
                    />
                  </div>

                  {/* Condiciones */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Términos y Condiciones</Label>
                    <Textarea
                      placeholder="Ej: Presupuesto válido por 15 días. Incluye mano de obra y repuestos."
                      value={condiciones}
                      onChange={e => setCondiciones(e.target.value)}
                      className="bg-background/50 text-xs min-h-[60px]"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Totals Section */}
              <div className="lg:col-span-5">
                <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subtotal</p>
                        <p className="text-lg font-black mt-1">{MONEDA_SYMBOLS[monedaGlobal]}{subtotal.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descuento</p>
                        <p className="text-lg font-black mt-1 text-red-400">
                          -{MONEDA_SYMBOLS[monedaGlobal]}{descMonto.toFixed(2)}
                          {descuentoTipo === 'porcentaje' && <span className="text-xs text-muted-foreground"> ({descuento}%)</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">IVA (16%)</p>
                        <p className="text-lg font-black mt-1 text-orange-400">
                          {conIva ? `+${MONEDA_SYMBOLS[monedaGlobal]}${ivaMonto.toFixed(2)}` : '-'
                          + (monedaGlobal !== 'VES' && tasaCambio
                            ? <span className="block text-xs text-muted-foreground">{(ivaMonto * tasaCambio).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</span>
                            : null
                          )}
                        </p>
                      </div>
                      <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total</p>
                        <p className="text-2xl font-black text-primary mt-1 italic">
                          {MONEDA_SYMBOLS[monedaGlobal]}{total.toFixed(2)}
                        </p>
                        {monedaGlobal !== 'VES' && tasaCambio && (
                          <p className="text-xs font-bold text-muted-foreground mt-1">
                            {(total * tasaCambio).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6 pt-4 border-t border-border/30">
                      <Button
                        variant="outline"
                        onClick={() => setStep(2)}
                        className="h-11 rounded-xl gap-2 text-xs font-bold"
                      >
                        <ArrowLeft className="w-4 h-4" /> Atrás
                      </Button>
                      <Button
                        onClick={() => setStep(4)}
                        className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold gap-2 text-xs"
                      >
                        {editingPresupuesto ? 'Revisar Cambios' : 'Generar Presupuesto'} <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
             STEP 4: FINALIZAR
          ════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="max-w-2xl mx-auto">
              <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl text-center">
                <CardContent className="p-10 space-y-6">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <FileSpreadsheet className="w-10 h-10 text-primary" />
                  </div>

                  <div>
                    <h2 className="text-xl font-black mb-2">
                      {editingPresupuesto ? `Editar ${editingPresupuesto.numero}` : 'Resumen Final'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {editingPresupuesto
                        ? 'Revisa los cambios antes de actualizar el presupuesto.'
                        : 'Revisa los datos antes de generar el presupuesto.'}
                    </p>
                  </div>

                  <div className="bg-background/50 rounded-xl p-6 space-y-3 text-left border border-border/30">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Cliente</span>
                        <p className="font-bold">{clienteNombre}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Teléfono</span>
                        <p className="font-bold">{clienteTelefono || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Vehículo</span>
                        <p className="font-bold">{vehiculoInfo || '-'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Moneda</span>
                        <p className="font-bold">{MONEDA_LABELS[monedaGlobal]}</p>
                      </div>
                    </div>

                    <div className="border-t border-border/30 pt-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Items</span>
                        <span className="font-bold">{items.length}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-bold">{MONEDA_SYMBOLS[monedaGlobal]}{subtotal.toFixed(2)}</span>
                      </div>
                      {descuento > 0 && (
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Descuento</span>
                          <span className="font-bold text-red-400">-{MONEDA_SYMBOLS[monedaGlobal]}{descMonto.toFixed(2)}</span>
                        </div>
                      )}
                      {conIva && (
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-muted-foreground">IVA</span>
                          <span className="font-bold text-orange-400">+{MONEDA_SYMBOLS[monedaGlobal]}{ivaMonto.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-black mt-3 pt-3 border-t border-primary/20">
                        <span className="text-primary">TOTAL</span>
                        <span className="text-primary italic">{MONEDA_SYMBOLS[monedaGlobal]}{total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setStep(3)}
                      className="flex-1 h-12 rounded-xl gap-2 text-xs font-bold"
                    >
                      <ArrowLeft className="w-4 h-4" /> Atrás
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={handleSave}
                      className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold gap-2 text-xs shadow-lg shadow-primary/30"
                    >
                      {saving ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                      ) : editingPresupuesto ? (
                        <><Save className="w-4 h-4" /> Guardar Cambios y PDF</>
                      ) : (
                        <><Save className="w-4 h-4" /> Guardar y Generar PDF</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      ) : (
        /* ════════════════════════════════════════════════════════════
           VIEW: HISTORIAL
        ════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Filters */}
          <Card className="glass-panel border-border/50 bg-card/40">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por #, cliente o vehículo..."
                    className="pl-10 h-10 bg-background/50"
                    value={searchHistory}
                    onChange={e => setSearchHistory(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {['todos', 'borrador', 'enviado', 'aprobado', 'rechazado', 'vencido', 'convertido'].map(est => (
                    <button
                      key={est}
                      onClick={() => setFilterEstado(est)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all',
                        filterEstado === est ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {est === 'todos' ? 'Todos' : ESTADO_LABELS[est as EstadoPresupuesto]}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* List */}
          {filteredPresupuestos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileSpreadsheet className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-sm font-bold">No hay presupuestos</p>
              <p className="text-xs">Crea tu primer presupuesto</p>
              <Button
                onClick={() => { setView('nuevo'); resetForm(); }}
                className="mt-4 h-10 rounded-xl bg-primary text-white font-bold text-xs gap-2"
              >
                <Plus className="w-4 h-4" /> Nuevo Presupuesto
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredPresupuestos.map((p: any) => {
                const itemsData: PresupuestoItem[] = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
                const sym = p.moneda === 'EUR' ? '€' : p.moneda === 'VES' ? 'Bs.' : '$';
                return (
                  <Card
                    key={p.id}
                    className={cn(
                      'glass-panel border-border/50 bg-card/40 hover:shadow-lg transition-all cursor-pointer group',
                      viewingPresupuesto?.id === p.id && 'ring-2 ring-primary'
                    )}
                    onClick={() => setViewingPresupuesto(viewingPresupuesto?.id === p.id ? null : p)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{p.numero}</p>
                          <p className="text-sm font-bold mt-1">{p.cliente_nombre}</p>
                        </div>
                        <Badge className={cn('text-[9px] px-2 py-0.5 font-black border-none', ESTADO_COLORS[p.estado as EstadoPresupuesto] || '')}>
                          {ESTADO_LABELS[p.estado as EstadoPresupuesto] || p.estado}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-[10px] text-muted-foreground">
                        {p.vehiculo_info && (
                          <p className="flex items-center gap-1">
                            <Car className="w-3 h-3" /> {p.vehiculo_info}
                          </p>
                        )}
                        <p className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {format(new Date(p.created_at), 'dd/MM/yyyy', { locale: es })}
                        </p>
                        <p className="flex items-center gap-1">
                          <Package className="w-3 h-3" /> {itemsData.length} items
                        </p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-bold uppercase">Total</span>
                        <span className="text-base font-black text-primary italic">
                          {sym}{Number(p.total).toFixed(2)}
                        </span>
                      </div>

                      {/* Actions */}
                      {viewingPresupuesto?.id === p.id && (
                        <div className="mt-4 pt-3 border-t border-border/30 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-[9px] font-bold gap-1"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const full = await fetchPresupuesto(p.id);
                              if (full) {
                                generatePresupuestoPDF({
                                  numero: full.numero,
                                  created_at: full.created_at,
                                  fecha_expiracion: full.fecha_expiracion,
                                  cliente_nombre: full.cliente_nombre,
                                  cliente_telefono: full.cliente_telefono,
                                  cliente_cedula: full.cliente_cedula,
                                  cliente_direccion: full.cliente_direccion,
                                  vehiculo_info: full.vehiculo_info,
                                  moneda: full.moneda,
                                  tasa_cambio: full.tasa_cambio,
                                  items: (typeof full.items === 'string' ? JSON.parse(full.items) : full.items).map((i: PresupuestoItem) => ({
                                    tipo: i.tipo,
                                    descripcion: i.descripcion,
                                    cantidad: i.cantidad,
                                    precio_unitario: i.precio_unitario,
                                    moneda: i.moneda,
                                    total: i.total,
                                  })),
                                  subtotal: full.subtotal,
                                  descuento: full.descuento,
                                  descuento_tipo: full.descuento_tipo,
                                  iva: full.iva,
                                  total: full.total,
                                  notas: full.notas,
                                  condiciones: full.condiciones,
                                  estado: full.estado,
                                  validez_dias: full.validez_dias,
                                });
                              }
                            }}
                          >
                            <Download className="w-3 h-3" /> PDF
                          </Button>

                          {/* Editar: precarga este presupuesto en el asistente y al guardar ACTUALIZA el mismo registro.
                             Requiere permiso 'editar' (respeta panel de Permisos por Rol y de Empleados). */}
                          {can('presupuestos', 'editar') && (p.estado === 'borrador' || p.estado === 'enviado') && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={loadingEditId === p.id}
                              className="h-7 rounded-lg text-[9px] font-bold gap-1 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                              onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
                            >
                              {loadingEditId === p.id ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</>
                              ) : (
                                <><Edit3 className="w-3 h-3" /> Editar</>
                              )}
                            </Button>
                          )}

                          {p.estado === 'borrador' && (
                            <Button
                              size="sm"
                              className="h-7 rounded-lg text-[9px] font-bold gap-1 bg-blue-500 hover:bg-blue-600 text-white"
                              onClick={(e) => { e.stopPropagation(); handleEstadoChange(p.id, 'enviado'); }}
                            >
                              <Send className="w-3 h-3" /> Enviar
                            </Button>
                          )}

                          {p.estado === 'enviado' && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 rounded-lg text-[9px] font-bold gap-1 bg-green-500 hover:bg-green-600 text-white"
                                onClick={(e) => { e.stopPropagation(); handleEstadoChange(p.id, 'aprobado'); }}
                              >
                                <Check className="w-3 h-3" /> Aprobar
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 rounded-lg text-[9px] font-bold gap-1 bg-red-500 hover:bg-red-600 text-white"
                                onClick={(e) => { e.stopPropagation(); handleEstadoChange(p.id, 'rechazado'); }}
                              >
                                <Ban className="w-3 h-3" /> Rechazar
                              </Button>
                            </>
                          )}

                          {can('presupuestos', 'eliminar') && (p.estado === 'borrador' || p.estado === 'enviado') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg text-[9px] font-bold gap-1 text-red-400 border-red-400/30 hover:bg-red-500/10"
                              onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            >
                              <Trash2 className="w-3 h-3" /> Eliminar
                            </Button>
                          )}

                          {/* Ver detalles */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 rounded-lg text-[9px] font-bold gap-1 text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Show a simple detail view
                              const itemsData = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
                              const details = itemsData.map((i: PresupuestoItem, idx: number) =>
                                `${idx + 1}. ${i.descripcion} (${i.cantidad}x ${MONEDA_SYMBOLS[i.moneda]}${i.precio_unitario.toFixed(2)})`
                              ).join('\n');
                              alert(
                                `Presupuesto: ${p.numero}\nCliente: ${p.cliente_nombre}\nVehículo: ${p.vehiculo_info || '-'}\nEstado: ${ESTADO_LABELS[p.estado as EstadoPresupuesto]}\nMoneda: ${p.moneda}\n\nItems:\n${details}\n\nSubtotal: ${sym}${Number(p.subtotal).toFixed(2)}\nTotal: ${sym}${Number(p.total).toFixed(2)}`
                              );
                            }}
                          >
                            <Eye className="w-3 h-3" /> Ver
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Custom Item Modal ──────────────────────────────────── */}
      {showCustomModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background rounded-3xl w-full max-w-md shadow-2xl border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border/30">
              <h3 className="text-sm font-black flex items-center gap-2 italic uppercase tracking-widest">
                <Package className="w-4 h-4 text-purple-400" /> Agregar Item Personalizado
              </h3>
              <button onClick={() => setShowCustomModal(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Descripción del Producto <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="Ej: Amortiguador delantero KYB, Caucho 205/55R16, Correa de distribución..."
                  value={newCustomDesc}
                  onChange={e => setNewCustomDesc(e.target.value)}
                  className="bg-muted/50 min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cantidad</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={newCustomQty}
                    onChange={e => setNewCustomQty(e.target.value)}
                    className="bg-muted/50 h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Precio Unit.</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newCustomPrice}
                    onChange={e => setNewCustomPrice(e.target.value)}
                    className="bg-muted/50 h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Moneda</Label>
                  <Select value={newCustomMoneda} onValueChange={(v) => setNewCustomMoneda(v as Moneda)}>
                    <SelectTrigger className="bg-muted/50 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD $</SelectItem>
                      <SelectItem value="VES">VES Bs.</SelectItem>
                      <SelectItem value="EUR">EUR €</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="bg-purple-400/10 rounded-xl p-3 border border-purple-400/20">
                <p className="text-[10px] font-bold text-purple-400">
                  Total: {newCustomMoneda === 'USD' ? '$' : newCustomMoneda === 'EUR' ? '€' : 'Bs.'}
                  {(parseFloat(newCustomQty || '0') * parseFloat(newCustomPrice || '0')).toFixed(2)}
                </p>
              </div>
              <Button
                disabled={!newCustomDesc.trim() || !newCustomPrice || parseFloat(newCustomPrice) <= 0}
                onClick={() => {
                  addCustomItem(
                    newCustomDesc.trim(),
                    parseInt(newCustomQty) || 1,
                    parseFloat(newCustomPrice),
                    newCustomMoneda
                  );
                  setShowCustomModal(false);
                }}
                className="w-full h-11 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-bold gap-2 text-xs"
              >
                <Plus className="w-4 h-4" /> Agregar Item
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Modal ──────────────────────────────────────── */}
      {showServiceModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background rounded-3xl w-full max-w-md shadow-2xl border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border/30">
              <h3 className="text-sm font-black flex items-center gap-2 italic uppercase tracking-widest">
                <Wrench className="w-4 h-4 text-primary" /> Agregar Servicio
              </h3>
              <button onClick={() => setShowServiceModal(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descripción del Servicio</Label>
                <Textarea
                  placeholder="Ej: Cambio de aceite y filtro"
                  value={newServiceDesc}
                  onChange={e => setNewServiceDesc(e.target.value)}
                  className="bg-muted/50 min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Precio</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newServicePrice}
                    onChange={e => setNewServicePrice(e.target.value)}
                    className="bg-muted/50 h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Moneda</Label>
                  <Select value={newServiceMoneda} onValueChange={(v) => setNewServiceMoneda(v as Moneda)}>
                    <SelectTrigger className="bg-muted/50 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD $</SelectItem>
                      <SelectItem value="VES">VES Bs.</SelectItem>
                      <SelectItem value="EUR">EUR €</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                disabled={!newServiceDesc.trim() || !newServicePrice || parseFloat(newServicePrice) <= 0}
                onClick={() => {
                  addServicioCustom(newServiceDesc.trim(), parseFloat(newServicePrice), newServiceMoneda);
                  setShowServiceModal(false);
                }}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold gap-2 text-xs"
              >
                <Plus className="w-4 h-4" /> Agregar Servicio
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
