'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Download, TrendingUp, DollarSign, Wrench, Users, Plus, Pencil,
  Trash2, CheckCircle, AlertCircle, Loader2, X, Camera, Eye,
  Calendar, FileText, BarChart2, RefreshCw, Package, ChevronDown, Clock,
  ArrowDownCircle, TrendingDown, Receipt
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { generateInvoicePDF, generateEgresoPDF } from '@/lib/invoice-pdf';

// ── Types ──────────────────────────────────────────────────────
interface VentaDia {
  id: string;
  fecha: string;
  cliente: string | null;
  total_ingresos: number;
  total_servicios: number;
  total_clientes: number;
  desglose: DesglosItem[];
  notas: string | null;
  imagen_url: string | null;
  creado_por: string;
  created_at: string;
}

interface DesglosItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

interface Egreso {
  id: string;
  fecha: string;
  cliente: string | null;
  total_egresos: number;
  categoria: string;
  desglose: DesglosItem[];
  notas: string | null;
  imagen_url: string | null;
  creado_por: string;
  created_at: string;
}

interface ScannedData {
  tipo_escaneo?: 'cierre' | 'ticket';
  fecha: string;
  items?: DesglosItem[]; // for cierre
  subtotal?: number;
  descuentos?: number;
  total_ingresos: number;
  moneda?: string;
  notas?: string;
  total_clientes?: number;
  total_servicios?: number;
  rawText?: string;
  
  // Ticket fields
  empresa_nombre?: string;
  empresa_rif?: string;
  hora?: string;
  nro_factura?: string;
  cliente_nombre?: string;
  cliente_vehiculo?: string;
  impuestos?: number;
  metodo_pago?: string;
}

// ── Tooltip ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-xl text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: ${Number(p.value).toFixed(2)}</p>
        ))}
      </div>
    );
  }
  return null;
};

// ── Modal: Formulario Manual ────────────────────────────────────
function ManualModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (data: Partial<VentaDia>) => Promise<void>;
  initial?: VentaDia | null;
}) {
  const [form, setForm] = useState({
    fecha: initial?.fecha || new Date().toISOString().split('T')[0],
    cliente: initial?.cliente || '',
    total_ingresos: initial?.total_ingresos || 0,
    total_servicios: initial?.total_servicios || 0,
    total_clientes: initial?.total_clientes || 0,
    notas: initial?.notas || '',
  });
  const [items, setItems] = useState<DesglosItem[]>(
    initial?.desglose?.length ? initial.desglose : [{ descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i: number, key: keyof DesglosItem, val: string | number) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val };
      if (key === 'cantidad' || key === 'precio_unitario') {
        next[i].total = Number(next[i].cantidad) * Number(next[i].precio_unitario);
      }
      return next;
    });
  };

  const totalFromItems = items.reduce((s, it) => s + Number(it.total), 0);

  useEffect(() => {
    setForm(f => ({ ...f, total_ingresos: totalFromItems }));
  }, [totalFromItems]);

  const handleSave = async () => {
    if (!form.fecha) { setError('La fecha es requerida'); return; }
    setSaving(true);
    try {
      await onSave({
        fecha: form.fecha,
        cliente: form.cliente || null,
        total_ingresos: Number(form.total_ingresos),
        total_servicios: Number(form.total_servicios) || items.filter(i => i.descripcion).length,
        total_clientes: Number(form.total_clientes),
        notas: form.notas || null,
        desglose: items.filter(i => i.descripcion.trim()),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div>
            <h2 className="text-base font-bold">{initial ? 'Editar cierre' : 'Nuevo cierre de caja'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ingresa los datos del día manualmente</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Fecha del cierre</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nombre del Cliente (Opcional)</label>
              <input
                type="text"
                placeholder="Ej: Juan Pérez o Empresa X"
                value={form.cliente}
                onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total ingresos ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.total_ingresos}
                onChange={e => setForm(f => ({ ...f, total_ingresos: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Clientes atendidos</label>
              <input
                type="number"
                value={form.total_clientes}
                onChange={e => setForm(f => ({ ...f, total_clientes: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Servicios realizados</label>
              <input
                type="number"
                value={form.total_servicios}
                onChange={e => setForm(f => ({ ...f, total_servicios: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Desglose de servicios</label>
              <button
                onClick={() => setItems(p => [...p, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }])}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar ítem
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-5 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Descripción del servicio"
                    value={item.descripcion}
                    onChange={e => updateItem(i, 'descripcion', e.target.value)}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    type="number" placeholder="Cant." min="1"
                    value={item.cantidad}
                    onChange={e => updateItem(i, 'cantidad', Number(e.target.value))}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    type="number" placeholder="$P/U" step="0.01"
                    value={item.precio_unitario}
                    onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))}
                  />
                  <div className="col-span-2 text-xs font-medium text-primary text-right pr-1">
                    ${Number(item.total).toFixed(2)}
                  </div>
                  <button
                    onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                    className="col-span-1 w-6 h-6 rounded hover:bg-destructive/20 text-destructive flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {items.some(i => i.descripcion) && (
              <div className="mt-2 pt-2 border-t border-border/20 flex justify-between text-xs">
                <span className="text-muted-foreground">Total calculado</span>
                <span className="font-bold text-primary">${totalFromItems.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notas adicionales</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones del día, pagos pendientes, etc."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><CheckCircle className="w-4 h-4" /> Guardar cierre</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EgresoModal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (data: Partial<Egreso>) => Promise<void>;
  initial?: Egreso | null;
}) {
  const [form, setForm] = useState({
    fecha: initial?.fecha || new Date().toISOString().split('T')[0],
    cliente: initial?.cliente || '',
    categoria: initial?.categoria || 'otro',
    total_egresos: initial?.total_egresos || 0,
    notas: initial?.notas || '',
  });
  const [items, setItems] = useState<DesglosItem[]>(
    initial?.desglose?.length ? initial.desglose : [{ descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i: number, key: keyof DesglosItem, val: string | number) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val };
      if (key === 'cantidad' || key === 'precio_unitario') {
        next[i].total = Number(next[i].cantidad) * Number(next[i].precio_unitario);
      }
      return next;
    });
  };

  const totalFromItems = items.reduce((s, it) => s + Number(it.total), 0);
  useEffect(() => { setForm(f => ({ ...f, total_egresos: totalFromItems })); }, [totalFromItems]);

  const handleSave = async () => {
    if (!form.fecha) { setError('La fecha es requerida'); return; }
    setSaving(true);
    try {
      await onSave({
        fecha: form.fecha,
        cliente: form.cliente || null,
        categoria: form.categoria,
        total_egresos: Number(form.total_egresos),
        notas: form.notas || null,
        desglose: items.filter(i => i.descripcion.trim()),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div>
            <h2 className="text-base font-bold text-rose-400">{initial ? 'Editar egreso' : 'Nuevo registro de egreso'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Registra pagos, compras o gastos del taller</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Fecha del egreso</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Categoría</label>
              <select
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm"
              >
                <option value="repuestos">Compra de Repuestos</option>
                <option value="servicios">Pago de Servicios (Luz, Agua, etc)</option>
                <option value="nomina">Nómina / Personal</option>
                <option value="herramientas">Herramientas</option>
                <option value="local">Alquiler / Local</option>
                <option value="otro">Otro gasto</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Pagado a (Proveedor / Nombre)</label>
              <input
                type="text"
                placeholder="Ej: Repuestos El Chamo"
                value={form.cliente}
                onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Total egreso ($)</label>
              <input
                type="number" step="0.01"
                value={form.total_egresos}
                onChange={e => setForm(f => ({ ...f, total_egresos: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm font-bold text-rose-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Desglose de egreso</label>
              <button
                onClick={() => setItems(p => [...p, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }])}
                className="text-xs text-rose-400 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar ítem
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-5 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs"
                    placeholder="¿En qué se gastó?"
                    value={item.descripcion}
                    onChange={e => updateItem(i, 'descripcion', e.target.value)}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs"
                    type="number" placeholder="Cant." value={item.cantidad}
                    onChange={e => updateItem(i, 'cantidad', Number(e.target.value))}
                  />
                  <input
                    className="col-span-2 px-2 py-1.5 rounded-lg border border-border/40 bg-background/50 text-xs"
                    type="number" placeholder="$" value={item.precio_unitario}
                    onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))}
                  />
                  <div className="col-span-2 text-xs font-medium text-rose-400 text-right">
                    ${Number(item.total).toFixed(2)}
                  </div>
                  <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="col-span-1 text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Detalles adicionales..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-xs resize-none"
            />
          </div>

          {error && <div className="text-xs text-destructive p-2.5 rounded-lg bg-destructive/10">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm">Cancelar</button>
          <Button onClick={handleSave} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
            {saving ? 'Guardando...' : 'Guardar Egreso'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Scan IA + Confirmación ──────────────────────────────
function ScanModal({ onClose, onConfirm, modo }: {
  onClose: () => void;
  onConfirm: (data: ScannedData) => void;
  modo: 'cierre' | 'ticket' | 'egreso';
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<ScannedData | null>(null);
  const [scanError, setScanError] = useState('');
  const [step, setStep] = useState<'upload' | 'preview' | 'confirm'>('upload');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file);
  };

  const processFile = (file: File | undefined | null) => {
    if (!file) return;
    setMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      const base64 = result.split(',')[1];
      setImageBase64(base64);
      setStep('preview');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  };

  const handleScan = async () => {
    if (!imageBase64) return;
    setScanning(true);
    setScanError('');
    try {
      const res = await fetch('/api/reportes/scan-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, modo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al escanear');
      setScanned(data.data);
      setStep('confirm');
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Error desconocido');
    }
    setScanning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header con steps */}
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Camera className="w-4 h-4 text-violet-400" /> {modo === 'ticket' ? 'Escanear Factura/Ticket' : 'Escanear Cierre con IA'}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {['Subir imagen', 'Vista previa', 'Confirmar datos'].map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={cn(
                    'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center',
                    (step === 'upload' && i === 0) || (step === 'preview' && i === 1) || (step === 'confirm' && i === 2)
                      ? 'bg-violet-500 text-white'
                      : (step === 'preview' && i === 0) || (step === 'confirm' && i <= 1)
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                  )}>
                    {((step === 'preview' && i === 0) || (step === 'confirm' && i <= 1)) ? '✓' : i + 1}
                  </div>
                  <span className="text-[10px] text-muted-foreground hidden sm:block">{s}</span>
                  {i < 2 && <span className="text-border text-xs">›</span>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-border/40 hover:border-violet-500/50 rounded-2xl p-10 text-center cursor-pointer transition-colors group"
              >
                <Camera className="w-12 h-12 text-muted-foreground/30 group-hover:text-violet-400 mx-auto mb-3 transition-colors" />
                <p className="text-sm font-medium">Haz clic o arrastra una imagen aquí</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Foto de caja, recibo, ticket de venta, resumen manual
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP · Máx. 10MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                <p className="text-xs text-violet-400 font-medium mb-1">¿Cómo funciona?</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Sube la foto del cierre de caja o ticket</li>
                  <li>• Gemini IA extrae automáticamente los datos</li>
                  <li>• Revisas y confirmas antes de guardar</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && imagePreview && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-border/30 bg-muted/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Vista previa" className="w-full max-h-64 object-contain bg-black/20" />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Imagen cargada correctamente. Presiona &quot;Escanear con IA&quot; para extraer los datos.
              </p>
              {scanError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {scanError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('upload'); setImagePreview(null); setImageBase64(null); }}
                  className="flex-1 py-2 rounded-lg border border-border/50 text-sm hover:bg-white/5 transition-colors"
                >
                  Cambiar imagen
                </button>
                <Button onClick={handleScan} disabled={scanning} className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700">
                  {scanning
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
                    : <><Camera className="w-4 h-4" /> Escanear con IA</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && scanned && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-400">Datos extraídos correctamente. Revisa antes de confirmar.</p>
              </div>

              {/* Datos extraídos editables - Dinámico según modo */}
              {modo === 'cierre' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Fecha</label><input type="date" value={scanned.fecha} onChange={e => setScanned({...scanned, fecha: e.target.value})} className="w-full px-3 py-2 rounded border border-border/50 bg-background text-sm font-semibold" /></div>
                    <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Cliente</label><input type="text" placeholder="Nombre del cliente" value={scanned.cliente_nombre || ''} onChange={e => setScanned({...scanned, cliente_nombre: e.target.value})} className="w-full px-3 py-2 rounded border border-border/50 bg-background text-sm" /></div>
                    <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Total Ingresos ($)</label><input type="number" step="0.01" value={scanned.total_ingresos} onChange={e => setScanned({...scanned, total_ingresos: Number(e.target.value)})} className="w-full px-3 py-2 rounded border border-border/50 bg-background text-sm font-bold text-green-400" /></div>
                    <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Servicios</label><input type="number" value={scanned.total_servicios} onChange={e => setScanned({...scanned, total_servicios: Number(e.target.value)})} className="w-full px-3 py-2 rounded border border-border/50 bg-background text-sm" /></div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground flex justify-between">
                      <span>Desglose Resumido ({scanned.items?.length || 0})</span>
                    </label>
                    <div className="p-3 bg-background border border-border/50 rounded-lg text-xs space-y-1 max-h-[150px] overflow-y-auto">
                      {scanned.items?.map((it, i) => (
                        <div key={i} className="flex justify-between border-b border-border/30 pb-1 last:border-0 last:pb-0">
                          <span className="text-muted-foreground">{it.cantidad}x {it.descripcion}</span>
                          <span className="font-semibold">${it.total}</span>
                        </div>
                      ))}
                      {!scanned.items?.length && <span className="text-muted-foreground italic">No se detectaron items individuales</span>}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white text-black p-4 rounded shadow font-mono text-xs border border-gray-200">
                  <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
                    <h3 className="font-bold text-sm">{scanned.empresa_nombre || 'LYCOS TEAM CA'}</h3>
                    <p>RIF: {scanned.empresa_rif}</p>
                    <p>Factura N° {scanned.nro_factura}</p>
                    <p>{scanned.fecha} {scanned.hora}</p>
                  </div>
                  <div className="mb-2">
                    <p>Cliente: {scanned.cliente_nombre}</p>
                    <p>Vehículo: {scanned.cliente_vehiculo}</p>
                  </div>
                  <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
                    <div className="grid grid-cols-12 font-bold mb-1">
                      <span className="col-span-2">CANT</span>
                      <span className="col-span-6">DESCRIPCIÓN</span>
                      <span className="col-span-2 text-right">P.U</span>
                      <span className="col-span-2 text-right">TOT</span>
                    </div>
                    {scanned.items?.map((it, i) => (
                      <div key={i} className="grid grid-cols-12 mb-1">
                        <span className="col-span-2">{it.cantidad}</span>
                        <span className="col-span-6 line-clamp-1">{it.descripcion}</span>
                        <span className="col-span-2 text-right">{it.precio_unitario}</span>
                        <span className="col-span-2 text-right">{it.total}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-right font-bold space-y-1">
                    <p>SUBTOTAL: ${scanned.subtotal}</p>
                    <p>IMPUESTOS: ${scanned.impuestos}</p>
                    <p className="text-sm">TOTAL: ${scanned.total_ingresos}</p>
                  </div>
                  <div className="mt-2 text-center border-t border-dashed border-gray-400 pt-2">
                    <p>MÉTODO DE PAGO: {scanned.metodo_pago}</p>
                  </div>
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Notas Adicionales (Opcional)</label>
                <textarea 
                  value={scanned.notas || ''} 
                  onChange={e => setScanned({...scanned, notas: e.target.value})} 
                  rows={2} 
                  className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-xs placeholder:text-muted-foreground" 
                />
              </div>
            </div>
          )}

          {scanError && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-4 bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5" /> {scanError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          {step === 'confirm' && scanned && (
            <>
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
              >
                ← Atrás
              </button>
              <Button
                onClick={() => { onConfirm(scanned); onClose(); }}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4" /> Confirmar y guardar
              </Button>
            </>
          )}
          {step !== 'confirm' && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors">
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ venta, onClose }: { venta: VentaDia; onClose: () => void }) {
  const handleDownload = () => {
    try {
      generateInvoicePDF({
        id: venta.id,
        fecha: venta.fecha,
        cliente: venta.cliente || undefined,
        items: venta.desglose || [],
        total: venta.total_ingresos,
        notas: venta.notas || undefined
      });
    } catch (err) {
      alert('Error al generar PDF');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-muted/20">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Vista Previa de Factura
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
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
                <p className="text-xs font-bold text-slate-400 uppercase">Factura</p>
                <p className="text-sm font-bold text-slate-900">#{venta.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 mt-1">{venta.fecha}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Facturado a:</p>
                <p className="text-xs font-bold text-slate-900">{venta.cliente || 'Consumidor Final'}</p>
                <p className="text-[10px] text-slate-500 mt-1">Control de Cierre de Caja</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Resumen:</p>
                <p className="text-xs text-slate-600">{venta.total_servicios} Servicios realizados</p>
                <p className="text-xs text-slate-600">{venta.total_clientes} Clientes atendidos</p>
              </div>
            </div>

            <table className="w-full text-xs mb-8">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-bold text-slate-900">Descripción</th>
                  <th className="text-center py-2 font-bold text-slate-900 w-16">Cant.</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Precio</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(venta.desglose || []).map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 text-slate-700">{item.descripcion}</td>
                    <td className="py-3 text-center text-slate-600">{item.cantidad}</td>
                    <td className="py-3 text-right text-slate-600">${item.precio_unitario.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium text-slate-900">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-4">
              <div className="w-48 space-y-2">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>SUBTOTAL</span>
                  <span>${venta.total_ingresos.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>TOTAL</span>
                  <span className="text-primary">${venta.total_ingresos.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {venta.notas && (
              <div className="mt-12 pt-4 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notas:</p>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  {venta.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim()}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border/30 bg-muted/20 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors">Cerrar</button>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" /> Descargar PDF Profesional
          </Button>
        </div>
      </div>
    </div>
  );
}

function EgresoPreviewModal({ egreso, onClose }: { egreso: Egreso; onClose: () => void }) {
  const handleDownload = () => {
    try {
      generateEgresoPDF({
        id: egreso.id,
        fecha: egreso.fecha,
        cliente: egreso.cliente || undefined,
        categoria: egreso.categoria,
        items: egreso.desglose || [],
        total: egreso.total_egresos,
        notas: egreso.notas || undefined
      });
    } catch (err) {
      alert('Error al generar PDF');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-muted/20">
          <h2 className="text-sm font-bold flex items-center gap-2 text-rose-400">
            <Receipt className="w-4 h-4" /> Vista Previa de Egreso
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-white text-slate-900 font-sans">
          <div className="border border-slate-200 p-8 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">LYCOS TEAM</h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Comprobante de Egreso / Pago</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase">Egreso</p>
                <p className="text-sm font-bold text-slate-900">#{egreso.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-[10px] text-slate-500 mt-1">{egreso.fecha}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Pagado a:</p>
                <p className="text-xs font-bold text-slate-900">{egreso.cliente || 'Proveedor / Otros'}</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">Categoría: {egreso.categoria}</p>
              </div>
            </div>

            <table className="w-full text-xs mb-8">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-bold text-slate-900">Concepto</th>
                  <th className="text-center py-2 font-bold text-slate-900 w-16">Cant.</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Precio</th>
                  <th className="text-right py-2 font-bold text-slate-900 w-24">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {egreso.desglose.map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 text-slate-700">{item.descripcion}</td>
                    <td className="py-3 text-center text-slate-600">{item.cantidad}</td>
                    <td className="py-3 text-right text-slate-600">${item.precio_unitario.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium text-slate-900">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-4">
              <div className="w-48 space-y-2">
                <div className="flex justify-between text-xs font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>TOTAL PAGADO</span>
                  <span className="text-rose-600">${egreso.total_egresos.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {egreso.notas && (
              <div className="mt-12 pt-4 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Notas:</p>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">{egreso.notas}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border/30 bg-muted/20 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm">Cerrar</button>
          <Button onClick={handleDownload} className="gap-2 bg-rose-600 hover:bg-rose-700">
            <Download className="w-4 h-4" /> Descargar PDF Egreso
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function ReportesPage() {
  const [ventas, setVentas] = useState<VentaDia[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'graficos' | 'cierres' | 'egresos' | 'historial'>('graficos');
  const [period, setPeriod] = useState('30d');
  const [showManual, setShowManual] = useState(false);
  const [showManualEgreso, setShowManualEgreso] = useState(false);
  const [scanMode, setScanMode] = useState<'cierre' | 'ticket' | 'egreso' | null>(null);
  const [editando, setEditando] = useState<VentaDia | null>(null);
  const [editandoEgreso, setEditandoEgreso] = useState<Egreso | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<string | null>(null);
  const [selectedVenta, setSelectedVenta] = useState<VentaDia | null>(null);
  const [selectedEgreso, setSelectedEgreso] = useState<Egreso | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calendar State
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);

  // Stats from ventas
  const totalIngresos = ventas.reduce((s, v) => s + Number(v.total_ingresos), 0);
  const totalEgresos = egresos.reduce((s, e) => s + Number(e.total_egresos), 0);
  const balanceNeto = totalIngresos - totalEgresos;
  const totalServicios = ventas.reduce((s, v) => s + Number(v.total_servicios), 0);
  const totalClientes = ventas.reduce((s, v) => s + Number(v.total_clientes), 0);
  const ticketPromedio = totalServicios > 0 ? totalIngresos / totalServicios : 0;

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '3m' ? 90 : 365;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    
    const [vRes, eRes] = await Promise.all([
      supabase.from('ventas_dia').select('*').gte('fecha', from).order('fecha', { ascending: false }),
      supabase.from('egresos').select('*').gte('fecha', from).order('fecha', { ascending: false })
    ]);
    
    setVentas((vRes.data as VentaDia[]) || []);
    setEgresos((eRes.data as Egreso[]) || []);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel('financial-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas_dia' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos' }, () => loadData())
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [loadData]);

  // Chart data grouping by week
  const chartData = React.useMemo(() => {
    const byWeek: Record<string, { semana: string; ingresos: number; egresos: number; servicios: number }> = {};
    
    [...ventas].reverse().forEach(v => {
      const d = new Date(v.fecha + 'T12:00:00');
      const weekNum = Math.floor(d.getDate() / 7) + 1;
      const key = `${d.toLocaleString('es', { month: 'short' })} S${weekNum}`;
      if (!byWeek[key]) byWeek[key] = { semana: key, ingresos: 0, egresos: 0, servicios: 0 };
      byWeek[key].ingresos += Number(v.total_ingresos);
      byWeek[key].servicios += Number(v.total_servicios);
    });

    [...egresos].reverse().forEach(e => {
      const d = new Date(e.fecha + 'T12:00:00');
      const weekNum = Math.floor(d.getDate() / 7) + 1;
      const key = `${d.toLocaleString('es', { month: 'short' })} S${weekNum}`;
      if (!byWeek[key]) byWeek[key] = { semana: key, ingresos: 0, egresos: 0, servicios: 0 };
      byWeek[key].egresos += Number(e.total_egresos);
    });

    return Object.values(byWeek).slice(-12);
  }, [ventas, egresos]);

  const handleSaveEgreso = async (data: Partial<Egreso>) => {
    if (!supabase) return;
    const payload = { ...data, updated_at: new Date().toISOString() };
    if (editandoEgreso) {
      await supabase.from('egresos').update(payload).eq('id', editandoEgreso.id);
    } else {
      await supabase.from('egresos').insert({ ...payload, creado_por: 'Admin' });
    }
    setEditandoEgreso(null);
    loadData();
  };

  const handleScanConfirm = async (scanned: ScannedData) => {
    if (scanMode === 'egreso') {
      await handleSaveEgreso({
        fecha: scanned.fecha,
        cliente: scanned.cliente_nombre || null,
        total_egresos: scanned.total_ingresos,
        desglose: scanned.items || [],
        categoria: 'otro',
        notas: scanned.notas || null
      });
      return;
    }
    let finalNotas = scanned.notas || '';
    if (scanned.rawText) {
      finalNotas = finalNotas ? `${finalNotas}\n\n[FACTURA_IA_START]\n${scanned.rawText}\n[FACTURA_IA_END]` : `[FACTURA_IA_START]\n${scanned.rawText}\n[FACTURA_IA_END]`;
    }
    await handleSaveVenta({
      fecha: scanned.fecha,
      cliente: scanned.cliente_nombre || null,
      total_ingresos: scanned.total_ingresos,
      total_servicios: scanned.total_servicios || scanned.items?.length || 1,
      total_clientes: scanned.total_clientes || 1,
      desglose: scanned.items || [],
      notas: finalNotas || null,
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar cierre?')) {
      setDeleting(id);
      await supabase?.from('ventas_dia').delete().eq('id', id);
      setDeleting(null);
      loadVentas();
    }
  };

  const exportCSV = () => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '3m' ? 90 : 365;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    window.location.href = `/api/reportes/export?tipo=ventas&from=${from}&to=${to}`;
  };

  const exportCitas = () => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '3m' ? 90 : 365;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    window.location.href = `/api/reportes/export?tipo=citas&from=${from}&to=${to}`;
  };

  // Calendar utils
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };
  
  const getVentasForDate = (dateStr: string) => ventas.filter(v => v.fecha === dateStr);
  
  const exportDay = (type: 'ventas'|'citas') => {
    if (!selectedDate) return;
    window.location.href = `/api/reportes/export?tipo=${type}&from=${selectedDate}&to=${selectedDate}`;
  };

  const exportMonth = (type: 'ventas'|'citas') => {
    const from = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-01`;
    const to = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(getDaysInMonth(currentYear, currentMonth)).padStart(2,'0')}`;
    window.location.href = `/api/reportes/export?tipo=${type}&from=${from}&to=${to}`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between w-full">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
            <p className="text-muted-foreground mt-1">Control definitivo de ingresos, métricas y facturación con IA</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => setShowManual(true)} variant="outline" className="gap-2 flex-1 sm:flex-none border-border">
              <Plus className="w-4 h-4" /> Manual
            </Button>
            <div className="relative group">
              <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white flex-1 sm:flex-none">
                <Camera className="w-4 h-4" /> Escanear... <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border/50 rounded-xl shadow-xl flex-col p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-50">
                <div className="absolute -top-3 left-0 right-0 h-4 bg-transparent" />
                <button
                  onClick={() => setScanMode('cierre')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5 rounded-lg text-left"
                >
                  <Package className="w-4 h-4 text-violet-400" /> Cierre de Caja
                </button>
                <button
                  onClick={() => setScanMode('egreso')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5 rounded-lg text-left"
                >
                  <ArrowDownCircle className="w-4 h-4 text-rose-400" /> Egreso / Gasto
                </button>
                <button
                  onClick={() => setScanMode('ticket')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-white/5 rounded-lg text-left"
                >
                  <FileText className="w-4 h-4 text-green-400" /> Factura / Ticket
                </button>
              </div>
            </div>
            
            {/* Export Dropdown */}
            <div className="relative group">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Exportar <ChevronDown className="w-3 h-3" />
              </Button>
              <div className="absolute right-0 top-full pt-1 w-48 bg-transparent opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-20">
                <div className="bg-card border border-border rounded-xl shadow-xl py-1 overflow-hidden">
                  <button onClick={exportCSV} className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition-colors">
                    <FileText className="w-3.5 h-3.5 text-primary" /> Ventas (Excel/CSV)
                  </button>
                  <button onClick={exportCitas} className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 flex items-center gap-2 transition-colors">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" /> Citas (Excel/CSV)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('graficos')}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'graficos' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <BarChart2 className="w-4 h-4" /> Gráficos
        </button>
        <button
          onClick={() => setTab('cierres')}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'cierres' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Package className="w-4 h-4" /> Cierres de Caja
        </button>
        <button
          onClick={() => setTab('egresos')}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'egresos' ? 'bg-card shadow-sm text-rose-400 font-bold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ArrowDownCircle className="w-4 h-4 text-rose-400" /> Egresos
          {egresos.length > 0 && (
            <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full font-semibold">
              {egresos.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('historial')}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'historial' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Calendar className="w-4 h-4" /> Historial
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ingresos Totales', value: `$${totalIngresos.toFixed(2)}`, sub: 'Dinero recibido', icon: DollarSign, color: 'text-green-400 bg-green-500/10' },
          { label: 'Egresos Totales', value: `$${totalEgresos.toFixed(2)}`, sub: 'Gastos y pagos', icon: ArrowDownCircle, color: 'text-rose-400 bg-rose-500/10' },
          { label: 'Balance Neto', value: `$${balanceNeto.toFixed(2)}`, sub: 'Utilidad bruta', icon: TrendingUp, color: balanceNeto >= 0 ? 'text-blue-400 bg-blue-500/10' : 'text-rose-400 bg-rose-500/10' },
          { label: 'Ticket Promedio', value: `$${ticketPromedio.toFixed(2)}`, sub: 'Venta por servicio', icon: Receipt, color: 'text-purple-400 bg-purple-500/10' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold mt-1" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {loading ? '—' : value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab: Gráficos ─────────────────────────────────────── */}
      {tab === 'graficos' && (
        <div className="space-y-4">
          {chartData.length === 0 && !loading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <BarChart2 className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin datos para mostrar</p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
                  Registra cierres de caja para ver los gráficos de ingresos y tendencias.
                </p>
                <Button onClick={() => setShowManual(true)} className="mt-4 gap-2" size="sm">
                  <Plus className="w-4 h-4" /> Registrar primer cierre
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">Evolución Financiera</CardTitle>
                    <CardDescription className="text-xs">Comparativa semanal de ingresos vs egresos</CardDescription>
                  </div>
                  <div className="flex gap-4 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-400" /> INGRESOS</span>
                    <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-400" /> EGRESOS</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gIngresos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gEgresos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#e11d48" stopOpacity={0.3} /><stop offset="95%" stopColor="#e11d48" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#f97316" strokeWidth={2} fill="url(#gIngresos)" />
                      <Area type="monotone" dataKey="egresos" name="Egresos" stroke="#e11d48" strokeWidth={2} fill="url(#gEgresos)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Actividad Semanal</CardTitle>
                  <CardDescription className="text-xs">Servicios y volumen de trabajo</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="servicios" name="Servicios realizados" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Cierres de Caja ──────────────────────────────── */}
      {tab === 'cierres' && (
        <div className="space-y-3">
          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Cargando cierres...</span>
            </div>
          ) : ventas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Package className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin cierres de caja registrados</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Registra el cierre del día manualmente o escaneando una imagen
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setShowManual(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> Manual
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setScanMode('cierre')} className="gap-2 border-violet-500/30 text-violet-400">
                    <Camera className="w-4 h-4" /> Escanear IA
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20">
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Fecha</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Ingresos</th>
                        <th className="text-center text-xs text-muted-foreground font-medium px-4 py-3">Servicios</th>
                        <th className="text-center text-xs text-muted-foreground font-medium px-4 py-3">Clientes</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Notas</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Fuente</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map(v => (
                        <tr key={v.id} className="border-b border-border/10 hover:bg-white/2 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Calendar className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(v.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-green-400">${Number(v.total_ingresos).toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              {v.total_servicios}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm">{v.total_clientes}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                            {v.notas ? v.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim() || '—' : '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {v.imagen_url ? (
                              <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full inline-flex w-fit">
                                <Camera className="w-3 h-3" /> IA
                              </span>
                            ) : v.notas && v.notas.includes('[FACTURA_IA_START]') ? (
                               <button 
                                onClick={() => {
                                  const text = v.notas?.match(/\[FACTURA_IA_START\]\n([\s\S]*?)\n\[FACTURA_IA_END\]/)?.[1];
                                  if (text) setPreviewInvoice(text);
                                }}
                                className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full hover:bg-violet-500/20 transition-colors w-fit"
                               >
                                 <FileText className="w-3 h-3" /> Ver Factura
                               </button>
                            ) : (
                               <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full inline-flex w-fit">
                                 <Eye className="w-3 h-3" /> Manual
                               </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => {
                                  window.location.href = `/api/reportes/diario?fecha=${v.fecha}`;
                                }}
                                className="w-7 h-7 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-500 flex items-center justify-center transition-colors"
                                title="Descargar Reporte Diario"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setSelectedVenta(v)}
                                className="w-7 h-7 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors"
                                title="Ver Factura Profesional"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditando(v); setShowManual(true); }}
                                className="w-7 h-7 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(v.id)}
                                disabled={deleting === v.id}
                                className="w-7 h-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                                title="Eliminar"
                              >
                                {deleting === v.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/30 bg-muted/10">
                        <td className="px-4 py-3 text-xs font-medium text-muted-foreground">Total período</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-green-400">
                          ${totalIngresos.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold">{totalServicios}</td>
                        <td className="px-4 py-3 text-center text-sm font-bold">{totalClientes}</td>
                        <td className="hidden md:table-cell" />
                        <td className="hidden md:table-cell" />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Egresos ────────────────────────────────────── */}
      {tab === 'egresos' && (
        <div className="space-y-3">
          {loading ? (
             <div className="flex items-center justify-center py-12">
               <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
               <span className="text-sm text-muted-foreground">Cargando egresos...</span>
             </div>
          ) : egresos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ArrowDownCircle className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">Sin egresos registrados</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Registra un gasto o pago manualmente
                </p>
                <Button size="sm" onClick={() => setShowManualEgreso(true)} className="gap-2 bg-rose-600">
                  <Plus className="w-4 h-4" /> Nuevo Egreso
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/20">
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Fecha</th>
                        <th className="text-right text-xs text-muted-foreground font-medium px-4 py-3">Monto</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Categoría</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3">Pagado a</th>
                        <th className="text-left text-xs text-muted-foreground font-medium px-4 py-3 hidden md:table-cell">Notas</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {egresos.map(e => (
                        <tr key={e.id} className="border-b border-border/10 hover:bg-rose-500/5 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                <ArrowDownCircle className="w-3.5 h-3.5 text-rose-400" />
                              </div>
                              <p className="text-sm font-medium">
                                {new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-rose-400">-${Number(e.total_egresos).toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                              {e.categoria}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-200">{e.cliente || 'Otros'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                            {e.notas || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setSelectedEgreso(e)}
                                className="w-7 h-7 rounded-lg hover:bg-rose-500/10 text-rose-400 flex items-center justify-center"
                                title="Ver Comprobante"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditandoEgreso(e); setShowManualEgreso(true); }}
                                className="w-7 h-7 rounded-lg hover:bg-white/5 text-muted-foreground flex items-center justify-center"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async () => { if(confirm('¿Eliminar egreso?')) { await supabase?.from('egresos').delete().eq('id', e.id); loadData(); } }}
                                className="w-7 h-7 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/30 bg-muted/10">
                        <td className="px-4 py-3 text-xs font-medium text-muted-foreground">Total período</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-rose-400">
                          -${totalEgresos.toFixed(2)}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setShowManualEgreso(true)} className="gap-2 bg-rose-600 hover:bg-rose-700">
              <Plus className="w-4 h-4" /> Registrar Egreso
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab: Historial y Calendario ──────────────────────── */}
      {tab === 'historial' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-border/30">
              <CardTitle className="text-base flex items-center justify-between w-full">
                <span>{MONTHS[currentMonth]} {currentYear}</span>
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportMonth('ventas')} className="gap-2 text-xs border-primary/20">
                  <Download className="w-3.5 h-3.5" /> Mes (Ventas)
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportMonth('citas')} className="gap-2 text-xs border-blue-500/30 text-blue-400">
                  <Download className="w-3.5 h-3.5" /> Mes (Citas)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" onClick={prevMonth} className="px-2">← Anterior</Button>
                <Button variant="ghost" size="sm" onClick={() => { const now = new Date(); setCurrentMonth(now.getMonth()); setCurrentYear(now.getFullYear()); setSelectedDate(now.toISOString().split('T')[0]); }} className="font-bold">Hoy</Button>
                <Button variant="ghost" size="sm" onClick={nextMonth} className="px-2">Siguiente →</Button>
              </div>
              
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              
              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: getFirstDayOfMonth(currentYear, currentMonth) }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: getDaysInMonth(currentYear, currentMonth) }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const vCount = getVentasForDate(dateStr).length;
                  const isToday = dateStr === new Date().toISOString().split('T')[0];
                  const isSelected = dateStr === selectedDate;
                  
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(dateStr)}
                      className={cn(
                        'min-h-[60px] flex flex-col items-center justify-start p-1.5 rounded-xl border transition-all text-sm group hover:border-primary/50',
                        isSelected ? 'bg-primary/20 border-primary text-foreground' :
                        isToday ? 'bg-muted/50 border-border font-bold' :
                        'bg-card/50 border-border/20 text-muted-foreground hover:bg-white/5 hover:text-foreground'
                      )}
                    >
                      <span className={cn("text-xs mb-1", isSelected && "text-primary font-bold")}>{day}</span>
                      {vCount > 0 && (
                        <div className="flex gap-0.5 mt-auto bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          {vCount} cierre{vCount > 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Resumen del Día
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Selecciona un día'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-3">
              {!selectedDate ? (
                <div className="text-center py-10 text-muted-foreground text-xs">Ningún día seleccionado</div>
              ) : (
                <>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acciones Rápidas</p>
                    <Button onClick={() => exportDay('ventas')} className="w-full justify-start gap-2 text-xs" variant="secondary">
                      <Download className="w-3.5 h-3.5" /> Descargar Día (Ventas)
                    </Button>
                    <Button onClick={() => exportDay('citas')} className="w-full justify-start gap-2 text-xs text-blue-400" variant="outline">
                      <Download className="w-3.5 h-3.5" /> Descargar Día (Citas)
                    </Button>
                  </div>

                  {getVentasForDate(selectedDate).length === 0 ? (
                     <div className="text-center py-6 text-muted-foreground text-xs bg-card border border-border/30 rounded-xl">Sin reportes registrados ese día.</div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {getVentasForDate(selectedDate).map(v => (
                         <div key={v.id} className="p-3 bg-card border border-border/50 rounded-xl space-y-1.5">
                           <div className="flex justify-between items-center">
                             <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                               <Clock className="w-3 h-3" /> {new Date(v.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                             </p>
                             <span className="text-xs font-bold text-green-400">${Number(v.total_ingresos).toFixed(2)}</span>
                           </div>
                           <div className="flex gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{v.total_servicios} serv.</span>
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-medium">{v.total_clientes} clientes</span>
                           </div>
                           {v.notas && (
                             <p className="text-[10px] text-muted-foreground line-clamp-2 italic pt-1 border-t border-border/30">
                               &quot;{v.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim()}&quot;
                             </p>
                           )}
                         </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals con Portals */}
      {mounted && showManual && createPortal(
        <ManualModal
          onClose={() => { setShowManual(false); setEditando(null); }}
          onSave={handleSaveVenta}
          initial={editando}
        />,
        document.body
      )}

      {mounted && showManualEgreso && createPortal(
        <EgresoModal
          onClose={() => { setShowManualEgreso(false); setEditandoEgreso(null); }}
          onSave={handleSaveEgreso}
          initial={editandoEgreso}
        />,
        document.body
      )}

      {mounted && scanMode && createPortal(
        <ScanModal
          modo={scanMode}
          onClose={() => setScanMode(null)}
          onConfirm={handleScanConfirm}
        />,
        document.body
      )}

      {mounted && selectedVenta && createPortal(
        <InvoiceModal
          venta={selectedVenta}
          onClose={() => setSelectedVenta(null)}
        />,
        document.body
      )}

      {mounted && selectedEgreso && createPortal(
        <EgresoPreviewModal
          egreso={selectedEgreso}
          onClose={() => setSelectedEgreso(null)}
        />,
        document.body
      )}

      {mounted && previewInvoice && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" /> Texto Extraído por IA
              </h3>
              <button onClick={() => setPreviewInvoice(null)} className="p-2 hover:bg-white/5 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap bg-black/20 m-4 rounded-xl border border-border/20">
              {previewInvoice}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
