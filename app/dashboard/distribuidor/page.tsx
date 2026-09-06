'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck, Package, Search, Plus, ChevronRight, X, Check,
  AlertTriangle, RefreshCw, MapPin, User, Users, FileText,
  Download, Eye, Clock, CheckCircle2, Loader2, ArrowRight,
  BoxSelect, ShieldAlert, Boxes, BadgeCheck, Filter,
  TrendingUp, DollarSign, Percent, Factory, Wallet
} from 'lucide-react';
import {
  supabase, fetchInventario, createDistribucion, fetchDistribuciones, generateNumeroNota,
  updateDistribucionEstado, registrarFactura,
  fetchGananciasDistribuciones, fetchNotasGanancia, createNotaGanancia,
  generateNumeroNotaGanancia,
} from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { logActivity } from '@/lib/activity';
import { generateNotaEntregaPDF } from '@/lib/distribucion-pdf';
import { generateNotaGananciaPDF } from '@/lib/ganancia-pdf';
import { InventarioItem, Distribucion, DistribucionItem, NotaGanancia, NotaGananciaItem, GananciaRow } from '@/types';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// ─── Constants ──────────────────────────────────────────────────────────────

const ESTADO_CONFIG = {
  completado:  { label: 'Completado',   color: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  icon: CheckCircle2 },
  en_transito: { label: 'En Tránsito',  color: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: Truck },
  pendiente:   { label: 'Pendiente',    color: 'text-slate-400',  bg: 'bg-slate-400/10',  border: 'border-slate-400/30',  icon: Clock },
  anulado:     { label: 'Anulado',      color: 'text-red-500',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    icon: X },
};

const WIZARD_STEPS = [
  { id: 1, title: 'Destino', desc: 'Seleccionar sede y responsables' },
  { id: 2, title: 'Productos', desc: 'Agregar ítems a distribuir' },
  { id: 3, title: 'Confirmar', desc: 'Revisar y ejecutar distribución' },
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface DistribucionFormItem {
  inventario_id: string;
  nombre: string;
  codigo: string | null;
  categoria: string;
  marca: string | null;
  stock_disponible: number;
  stock_minimo: number;
  precio_usd: number;
  precio_fabricante: number;
  unidad: string;
  cantidad: number;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function getVzlaDate() {
  const now = new Date();
  const vzla = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
  return vzla.toISOString().split('T')[0];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card className={cn('glass-card border transition-all hover:shadow-lg', color)}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-3xl font-black mt-1 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner opacity-80', color.replace('border-', 'bg-').replace('/30', '/20'))}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Wizard Component ────────────────────────────────────────────────────────

function NuevaDistribucionWizard({
  inventario, sedes, onClose, onSuccess, currentSede, userName,
}: {
  inventario: InventarioItem[];
  sedes: Array<{ id: string; nombre: string; es_principal: boolean }>;
  onClose: () => void;
  onSuccess: (dist: Distribucion) => void;
  currentSede: { id: string; nombre: string } | null;
  userName: string;
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: destination + responsables
  const [sedeDestino, setSedeDestino] = useState<{ id: string; nombre: string } | null>(null);
  const [responsable, setResponsable] = useState(userName);
  const [recibe, setRecibe] = useState('');
  const [fecha, setFecha] = useState(getVzlaDate());

  // Step 2: products
  const [searchProd, setSearchProd] = useState('');
  const [selectedItems, setSelectedItems] = useState<DistribucionFormItem[]>([]);

  // Step 3: observations
  const [observaciones, setObservaciones] = useState('');

  const sedesDestino = sedes.filter(s => s.id !== currentSede?.id);

  const filteredInventario = useMemo(() => {
    const q = searchProd.toLowerCase();
    return inventario
      .filter(i => i.stock > 0)
      .filter(i =>
        i.nombre.toLowerCase().includes(q) ||
        (i.codigo?.toLowerCase() || '').includes(q) ||
        (i.categoria.toLowerCase() || '').includes(q) ||
        (i.marca?.toLowerCase() || '').includes(q)
      );
  }, [inventario, searchProd]);

  const isInSelected = (id: string) => selectedItems.some(s => s.inventario_id === id);

  const addItem = (item: InventarioItem) => {
    if (isInSelected(item.id)) return;
    setSelectedItems(prev => [...prev, {
      inventario_id: item.id,
      nombre: item.nombre,
      codigo: item.codigo,
      categoria: item.categoria,
      marca: item.marca,
      stock_disponible: item.stock,
      stock_minimo: item.stock_minimo,
      precio_usd: item.precio_usd || 0,
      precio_fabricante: item.precio_fabricante || 0,
      unidad: item.unidad || 'unidad',
      cantidad: 1,
    }]);
  };

  const removeItem = (id: string) => setSelectedItems(prev => prev.filter(i => i.inventario_id !== id));

  const updateCantidad = (id: string, val: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.inventario_id !== id) return i;
      const clamped = Math.max(1, Math.min(i.stock_disponible, val));
      return { ...i, cantidad: clamped };
    }));
  };

  const totalUnidades = selectedItems.reduce((s, i) => s + i.cantidad, 0);
  const valorTotal = selectedItems.reduce((s, i) => s + (i.cantidad * i.precio_usd), 0);

  const canNext1 = !!sedeDestino && !!responsable.trim();
  const canNext2 = selectedItems.length > 0 && selectedItems.every(i => i.cantidad >= 1 && i.cantidad <= i.stock_disponible);

  const handleConfirm = async () => {
    if (!currentSede || !sedeDestino) return;
    setLoading(true);
    setError('');
    try {
      const numeroNota = await generateNumeroNota();
      const distItems: DistribucionItem[] = selectedItems.map(i => ({
        inventario_id: i.inventario_id,
        nombre: i.nombre,
        codigo: i.codigo,
        categoria: i.categoria,
        marca: i.marca,
        cantidad: i.cantidad,
        stock_antes: i.stock_disponible,
        stock_despues: i.stock_disponible - i.cantidad,
        precio_usd: i.precio_usd,
        precio_fabricante: i.precio_fabricante,
        unidad: i.unidad,
      }));

      const result = await createDistribucion({
        numero_nota: numeroNota,
        fecha,
        sede_origen_id: currentSede.id,
        sede_origen_nombre: currentSede.nombre,
        sede_destino_id: sedeDestino.id,
        sede_destino_nombre: sedeDestino.nombre,
        responsable,
        recibe: recibe || null,
        observaciones: observaciones || null,
        items: distItems,
        total_items: selectedItems.length,
        total_unidades: totalUnidades,
        valor_total_usd: valorTotal,
        sede_id: currentSede.id,
      });

      if (!result) throw new Error('No se pudo crear la distribución');

      try {
        await registrarFactura({
          tipo: 'nota_entrega',
          modulo_origen: 'distribuidor',
          referencia_id: (result as any).id,
          referencia_tabla: 'distribuciones',
          cliente: sedeDestino.nombre,
          total: valorTotal,
          moneda: 'USD',
          items: selectedItems.map(i => ({
            descripcion: i.nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_usd,
            total: i.cantidad * i.precio_usd
          })),
          con_iva: false,
          estado: 'pagado',
          notas: observaciones || undefined,
          emitido_por: responsable,
          fecha_emision: fecha,
          sede_id: currentSede.id,
        });
      } catch (err) {
        console.error('Error registering centralized factura from distribuidor:', err);
      }

      await logActivity({
        usuario: userName,
        modulo: 'Distribuidor',
        accion: 'Distribución de inventario',
        detalles: `${numeroNota} → ${sedeDestino.nombre} | ${selectedItems.length} productos, ${totalUnidades} uds., $${valorTotal.toFixed(2)}`,
        referencia_id: result.id,
        referencia_tabla: 'distribuciones',
      });

      onSuccess(result as unknown as Distribucion);
    } catch (e: any) {
      setError(e.message || 'Error al crear distribución');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-indigo-600/10 to-purple-600/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-indigo-400 uppercase tracking-wider">Nueva Distribución</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {currentSede?.nombre} → {sedeDestino?.nombre || '...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 sm:gap-0 px-3 sm:px-5 py-3 border-b border-border/20 bg-muted/10 flex-shrink-0 overflow-x-auto no-scrollbar">
          {WIZARD_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => step > s.id && setStep(s.id)}
                className={cn(
                  'flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-xl transition-all text-xs font-bold whitespace-nowrap',
                  step === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' :
                  step > s.id ? 'bg-green-500/15 text-green-400 cursor-pointer hover:bg-green-500/25' :
                  'text-muted-foreground cursor-default'
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0',
                  step === s.id ? 'bg-white/20' :
                  step > s.id ? 'bg-green-500/30' :
                  'bg-muted'
                )}>
                  {step > s.id ? <Check className="w-3 h-3" /> : s.id}
                </span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 mx-1 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
          <div className="ml-auto text-[10px] text-muted-foreground font-medium whitespace-nowrap pl-2">
            Paso {step} de {WIZARD_STEPS.length}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ─── STEP 1: Destino ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 block">
                  Sede de Destino *
                </Label>
                {sedesDestino.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border/40 text-center text-sm text-muted-foreground">
                    No hay otras sedes registradas
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sedesDestino.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSedeDestino(s)}
                        className={cn(
                          'flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all',
                          sedeDestino?.id === s.id
                            ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                            : 'border-border/40 hover:border-indigo-500/40 hover:bg-white/3'
                        )}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                          sedeDestino?.id === s.id ? 'bg-indigo-500/20' : 'bg-muted/50'
                        )}>
                          <MapPin className={cn('w-5 h-5', sedeDestino?.id === s.id ? 'text-indigo-400' : 'text-muted-foreground')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-bold text-sm', sedeDestino?.id === s.id ? 'text-indigo-300' : 'text-foreground')}>
                            {s.nombre}
                          </p>
                          {s.es_principal && (
                            <span className="text-[9px] text-amber-500 font-black uppercase tracking-wider">Sede Principal</span>
                          )}
                        </div>
                        {sedeDestino?.id === s.id && (
                          <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsable" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Responsable / Elaborado por *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="responsable"
                      value={responsable}
                      onChange={e => setResponsable(e.target.value)}
                      className="pl-9 bg-background/50"
                      placeholder="Nombre del responsable"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recibe" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Quién Recibe (destino)
                  </Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="recibe"
                      value={recibe}
                      onChange={e => setRecibe(e.target.value)}
                      className="pl-9 bg-background/50"
                      placeholder="Nombre de quien recibe"
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fecha-dist" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Fecha de Distribución
                  </Label>
                  <Input
                    id="fecha-dist"
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="bg-background/50 w-48"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 2: Productos ───────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col lg:grid lg:grid-cols-5 gap-4 lg:h-[450px]">

                {/* Inventario Browser */}
                <div className="lg:col-span-3 flex flex-col border border-border/30 rounded-xl overflow-hidden bg-background/20 h-[350px] lg:h-full">
                  <div className="p-3 border-b border-border/20 bg-muted/10">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={searchProd}
                        onChange={e => setSearchProd(e.target.value)}
                        placeholder="Buscar producto por nombre, código, categoría..."
                        className="pl-9 bg-background/50 h-9 text-xs"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">
                      {filteredInventario.length} productos con stock disponible
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {filteredInventario.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 gap-2">
                        <Package className="w-10 h-10" />
                        <p className="text-sm">Sin productos disponibles</p>
                      </div>
                    ) : (
                      filteredInventario.map(item => {
                        const inList = isInSelected(item.id);
                        const stockLow = item.stock <= item.stock_minimo;
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 border-b border-border/10 hover:bg-white/4 transition-colors cursor-pointer',
                              inList && 'opacity-50 cursor-not-allowed bg-green-500/5'
                            )}
                            onClick={() => !inList && addItem(item)}
                          >
                            <div className={cn(
                              'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-black',
                              stockLow ? 'bg-orange-500/10 text-orange-400' : 'bg-primary/10 text-primary'
                            )}>
                              {item.stock}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">{item.nombre}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] text-muted-foreground font-mono bg-muted/50 px-1 rounded uppercase">
                                  {item.categoria}
                                </span>
                                {item.codigo && (
                                  <span className="text-[9px] text-muted-foreground/60 font-mono">
                                    {item.codigo}
                                  </span>
                                )}
                                {stockLow && (
                                  <span className="text-[9px] text-orange-400 font-black flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Bajo stock
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-bold text-primary">${item.precio_usd?.toFixed(2) || '0.00'}</p>
                              <p className="text-[9px] text-muted-foreground">{item.unidad}</p>
                            </div>
                            {inList ? (
                              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                            ) : (
                              <Plus className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Selected Items */}
                <div className="lg:col-span-2 flex flex-col border border-indigo-500/20 rounded-xl overflow-hidden bg-indigo-500/3 h-[320px] lg:h-full">
                  <div className="p-3 border-b border-indigo-500/20 bg-indigo-500/5 flex items-center justify-between">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <BoxSelect className="w-3.5 h-3.5" /> Seleccionados
                    </p>
                    <span className="text-xs font-black text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full">
                      {selectedItems.length} productos
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {selectedItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 gap-2 p-4">
                        <Boxes className="w-8 h-8" />
                        <p className="text-xs text-center">Haz clic en un producto para agregarlo</p>
                      </div>
                    ) : (
                      <div className="space-y-0 divide-y divide-border/10">
                        {selectedItems.map(item => {
                          const exceedsStock = item.cantidad > item.stock_disponible;
                          return (
                            <div key={item.inventario_id} className="px-3 py-2.5">
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate">{item.nombre}</p>
                                  <p className="text-[9px] text-muted-foreground">
                                    Disponible: <strong>{item.stock_disponible}</strong> {item.unidad}
                                  </p>
                                </div>
                                <button
                                  onClick={() => removeItem(item.inventario_id)}
                                  className="w-5 h-5 rounded-full hover:bg-red-500/20 flex items-center justify-center flex-shrink-0 transition-colors"
                                >
                                  <X className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                                </button>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => updateCantidad(item.inventario_id, item.cantidad - 1)}
                                  disabled={item.cantidad <= 1}
                                  className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm font-bold hover:bg-muted/80 disabled:opacity-30"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.stock_disponible}
                                  value={item.cantidad}
                                  onChange={e => updateCantidad(item.inventario_id, parseInt(e.target.value) || 1)}
                                  className={cn(
                                    'w-14 text-center text-sm font-black bg-background/50 border rounded-lg h-6 focus:outline-none focus:ring-1',
                                    exceedsStock ? 'border-red-500 text-red-500 focus:ring-red-500' : 'border-border/50 text-indigo-300 focus:ring-indigo-500'
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateCantidad(item.inventario_id, item.cantidad + 1)}
                                  disabled={item.cantidad >= item.stock_disponible}
                                  className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-30"
                                >
                                  +
                                </button>
                                <span className="text-[9px] text-muted-foreground ml-1">{item.unidad}</span>
                                {exceedsStock && (
                                  <AlertTriangle className="w-3 h-3 text-red-500" />
                                )}
                              </div>
                              {exceedsStock && (
                                <p className="text-[9px] text-red-500 font-bold mt-1">
                                  ⚠ Supera el stock disponible ({item.stock_disponible})
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedItems.length > 0 && (
                    <div className="p-3 border-t border-indigo-500/20 bg-indigo-500/5 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Total unidades:</span>
                        <span className="font-black text-indigo-300">{totalUnidades}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Valor estimado:</span>
                        <span className="font-black text-green-400">${valorTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Confirmar ───────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Summary header */}
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-black text-sm">{currentSede?.nombre} → {sedeDestino?.nombre}</p>
                    <p className="text-xs text-muted-foreground">Distribución {fecha}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { label: 'Productos', value: selectedItems.length, color: 'text-indigo-400' },
                    { label: 'Unidades', value: totalUnidades, color: 'text-orange-400' },
                    { label: 'Valor USD', value: `$${valorTotal.toFixed(2)}`, color: 'text-green-400' },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 sm:p-3 rounded-xl bg-background/40 border border-border/20">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{s.label}</p>
                      <p className={cn('text-sm sm:text-lg font-black mt-0.5 truncate', s.color)}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Products detail */}
              <div className="rounded-xl border border-border/30 overflow-hidden">
                <div className="bg-muted/20 px-4 py-2 border-b border-border/20">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Detalle de productos</p>
                </div>
                <div className="divide-y divide-border/10 max-h-48 overflow-y-auto">
                  {selectedItems.map(item => (
                    <div key={item.inventario_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold">{item.nombre}</p>
                        <p className="text-[9px] text-muted-foreground">
                          Stock: {item.stock_disponible} → <strong className="text-orange-400">{item.stock_disponible - item.cantidad}</strong>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-black text-indigo-300">{item.cantidad} {item.unidad}</p>
                        <p className="text-[9px] text-green-400 font-bold">${(item.cantidad * item.precio_usd).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Responsables */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-background/40 border border-border/20">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase mb-1">Elaborado por</p>
                  <p className="font-bold">{responsable}</p>
                </div>
                <div className="p-3 rounded-xl bg-background/40 border border-border/20">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase mb-1">Recibe en destino</p>
                  <p className="font-bold">{recibe || '—'}</p>
                </div>
              </div>

              {/* Observaciones */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Observaciones (opcional)
                </Label>
                <textarea
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  rows={3}
                  placeholder="Notas adicionales sobre esta distribución..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border/40 bg-background/50 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-muted-foreground"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-amber-500 font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Al confirmar, se descontará automáticamente el stock del inventario de {currentSede?.nombre}.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Nav */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border/20 bg-muted/10 flex-shrink-0">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30"
          >
            {step === 1 ? 'Cancelar' : '← Atrás'}
          </button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canNext1 : step === 2 ? !canNext2 : false}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 shadow-lg shadow-indigo-500/20"
            >
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={loading}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white font-black h-10 px-6 shadow-lg shadow-green-500/20"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirmar Distribución</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────────────────

function DetailModal({ dist, onClose, tasaBCV }: {
  dist: Distribucion; onClose: () => void; tasaBCV: number;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-indigo-400" />
            {dist.numero_nota}
          </DialogTitle>
          <DialogDescription>
            {new Date(dist.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}{dist.sede_origen_nombre} → {dist.sede_destino_nombre}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Route & Responsables */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-background/50 border border-border/20 space-y-1">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Origen</p>
              <p className="font-bold text-sm">{dist.sede_origen_nombre}</p>
              <p className="text-xs text-muted-foreground">Elaborado por: {dist.responsable}</p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-1">
              <p className="text-[9px] text-indigo-400 font-bold uppercase">Destino</p>
              <p className="font-bold text-sm text-indigo-300">{dist.sede_destino_nombre}</p>
              {dist.recibe && <p className="text-xs text-muted-foreground">Recibe: {dist.recibe}</p>}
            </div>
          </div>

          {/* Products table */}
          <div className="rounded-xl border border-border/30 overflow-hidden">
            <div className="bg-muted/20 px-4 py-2">
              <p className="text-xs font-bold text-muted-foreground uppercase">Productos distribuidos</p>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/10 border-b border-border/20">
                    <th className="px-3 py-2 text-left font-bold text-muted-foreground">Producto</th>
                    <th className="px-3 py-2 text-center font-bold text-muted-foreground">Cant.</th>
                    <th className="px-3 py-2 text-right font-bold text-muted-foreground">P. Unit.</th>
                    <th className="px-3 py-2 text-right font-bold text-muted-foreground">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {dist.items.map((item, i) => (
                    <tr key={i} className="hover:bg-white/2">
                      <td className="px-3 py-2">
                        <p className="font-bold">{item.nombre}</p>
                        <p className="text-[9px] text-muted-foreground">{item.codigo || item.categoria}</p>
                      </td>
                      <td className="px-3 py-2 text-center font-black text-indigo-300">{item.cantidad}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">${item.precio_usd.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-400">
                        ${(item.cantidad * item.precio_usd).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/10 border-t border-border/20">
                    <td colSpan={3} className="px-3 py-2 text-right font-black text-xs text-muted-foreground">TOTAL:</td>
                    <td className="px-3 py-2 text-right font-black text-green-400 text-sm">
                      ${dist.valor_total_usd.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {dist.observaciones && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <p className="text-[9px] text-amber-500 font-bold uppercase mb-1">Observaciones</p>
              <p className="text-xs text-muted-foreground">{dist.observaciones}</p>
            </div>
          )}

          <Button
            onClick={() => generateNotaEntregaPDF(dist, tasaBCV)}
            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            <Download className="w-4 h-4" /> Descargar Nota de Entrega PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── GANANCIAS: helpers ──────────────────────────────────────────────────────

/**
 * Construye filas de ganancia unificadas a partir de distribuciones (automático)
 * y notas de ganancia manuales. `costMap` permite el fallback al costo actual del
 * inventario cuando una distribución antigua no tiene snapshot de costo.
 */
function buildGananciaRows(
  distribuciones: Distribucion[],
  notas: NotaGanancia[],
  costMap: Record<string, number>,
): GananciaRow[] {
  const rows: GananciaRow[] = [];

  for (const d of distribuciones) {
    if (d.estado === 'anulado') continue;
    let totalCosto = 0;
    let totalVenta = 0;
    for (const it of d.items || []) {
      const costoUnit = (it.precio_fabricante && it.precio_fabricante > 0)
        ? it.precio_fabricante
        : (costMap[it.inventario_id] || 0);
      totalCosto += costoUnit * it.cantidad;
      totalVenta += (it.precio_usd || 0) * it.cantidad;
    }
    const ganancia = totalVenta - totalCosto;
    rows.push({
      id: `dist-${d.id}`,
      origen: 'distribucion',
      numero_nota: d.numero_nota,
      fecha: d.fecha,
      cliente: d.sede_destino_nombre,
      responsable: d.responsable,
      total_costo: totalCosto,
      total_venta: totalVenta,
      total_ganancia: ganancia,
      margen_pct: totalVenta > 0 ? (ganancia / totalVenta) * 100 : 0,
      distribucion: d,
    });
  }

  for (const n of notas) {
    rows.push({
      id: `nota-${n.id}`,
      origen: 'manual',
      numero_nota: n.numero_nota,
      fecha: n.fecha,
      cliente: n.cliente,
      responsable: n.responsable,
      total_costo: n.total_costo,
      total_venta: n.total_venta,
      total_ganancia: n.total_ganancia,
      margen_pct: n.total_venta > 0 ? (n.total_ganancia / n.total_venta) * 100 : 0,
      nota: n,
    });
  }

  // Orden por fecha desc
  rows.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return rows;
}

// ─── GANANCIAS: Nueva Nota Manual ────────────────────────────────────────────

interface NotaGananciaFormItem {
  inventario_id: string | null;
  nombre: string;
  codigo: string | null;
  cantidad: number;
  precio_fabricante: number;
  precio_venta: number;
}

function NuevaNotaGananciaWizard({
  inventario, onClose, onSuccess, currentSede, userName, tasaBCV,
}: {
  inventario: InventarioItem[];
  onClose: () => void;
  onSuccess: (nota: NotaGanancia) => void;
  currentSede: { id: string; nombre: string } | null;
  userName: string;
  tasaBCV: number;
}) {
  const [cliente, setCliente] = useState('');
  const [responsable, setResponsable] = useState(userName);
  const [fecha, setFecha] = useState(getVzlaDate());
  const [observaciones, setObservaciones] = useState('');
  const [searchProd, setSearchProd] = useState('');
  const [items, setItems] = useState<NotaGananciaFormItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredInventario = useMemo(() => {
    const q = searchProd.toLowerCase();
    if (!q) return [] as InventarioItem[];
    return inventario.filter(i =>
      i.nombre.toLowerCase().includes(q) ||
      (i.codigo?.toLowerCase() || '').includes(q) ||
      (i.marca?.toLowerCase() || '').includes(q)
    ).slice(0, 8);
  }, [inventario, searchProd]);

  const addFromInventario = (item: InventarioItem) => {
    if (items.some(i => i.inventario_id === item.id)) return;
    setItems(prev => [...prev, {
      inventario_id: item.id,
      nombre: item.nombre,
      codigo: item.codigo,
      cantidad: 1,
      precio_fabricante: item.precio_fabricante || 0,
      precio_venta: item.precio_usd || 0,
    }]);
    setSearchProd('');
  };

  const addBlank = () => setItems(prev => [...prev, {
    inventario_id: null, nombre: '', codigo: null, cantidad: 1, precio_fabricante: 0, precio_venta: 0,
  }]);

  const updateItem = (idx: number, patch: Partial<NotaGananciaFormItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalCosto = items.reduce((s, i) => s + i.precio_fabricante * i.cantidad, 0);
  const totalVenta = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0);
  const totalGanancia = totalVenta - totalCosto;
  const margenPct = totalVenta > 0 ? (totalGanancia / totalVenta) * 100 : 0;

  const canSave = cliente.trim() && responsable.trim() && items.length > 0 &&
    items.every(i => i.nombre.trim() && i.cantidad > 0);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const numero = await generateNumeroNotaGanancia();
      const notaItems: NotaGananciaItem[] = items.map(i => ({
        nombre: i.nombre,
        codigo: i.codigo,
        cantidad: i.cantidad,
        precio_fabricante: i.precio_fabricante,
        precio_venta: i.precio_venta,
        ganancia_unit: i.precio_venta - i.precio_fabricante,
        ganancia_total: (i.precio_venta - i.precio_fabricante) * i.cantidad,
      }));

      const result = await createNotaGanancia({
        numero_nota: numero,
        fecha,
        cliente,
        responsable,
        items: notaItems,
        total_costo: totalCosto,
        total_venta: totalVenta,
        total_ganancia: totalGanancia,
        observaciones: observaciones || null,
        sede_id: currentSede?.id || null,
      });

      if (!result) throw new Error('No se pudo crear la nota de ganancia');

      try {
        await registrarFactura({
          tipo: 'nota_ganancia',
          modulo_origen: 'ganancias',
          referencia_id: (result as any).id,
          referencia_tabla: 'notas_ganancia',
          cliente,
          total: totalGanancia,
          moneda: 'USD',
          items: notaItems.map(i => ({
            descripcion: i.nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_venta,
            total: i.precio_venta * i.cantidad,
          })),
          con_iva: false,
          estado: 'pagado',
          notas: observaciones || undefined,
          emitido_por: responsable,
          fecha_emision: fecha,
          sede_id: currentSede?.id || null,
        });
      } catch (err) {
        console.error('Error registering factura from ganancia:', err);
      }

      await logActivity({
        usuario: userName,
        modulo: 'Ganancias',
        accion: 'Nota de ganancia manual',
        detalles: `${numero} · ${cliente} · Ganancia $${totalGanancia.toFixed(2)}`,
        referencia_id: (result as any).id,
        referencia_tabla: 'notas_ganancia',
      });

      onSuccess(result as unknown as NotaGanancia);
    } catch (e: any) {
      setError(e.message || 'Error al guardar la nota');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-green-600/10 to-emerald-600/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-green-400 uppercase tracking-wider">Nueva Nota de Ganancia</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Costo fabricante vs reventa</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cliente / Reventa a *</Label>
              <Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Lycos San Antonio, Taller X..." className="bg-background/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Responsable *</Label>
              <Input value={responsable} onChange={e => setResponsable(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-background/50" />
            </div>
          </div>

          {/* Buscar producto */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchProd}
              onChange={e => setSearchProd(e.target.value)}
              placeholder="Buscar producto del inventario para autocompletar costo/precio..."
              className="pl-9 bg-background/50 h-9 text-xs"
            />
            {filteredInventario.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border/40 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                {filteredInventario.map(it => (
                  <button
                    key={it.id}
                    onClick={() => addFromInventario(it)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-left border-b border-border/10 last:border-0"
                  >
                    <span className="text-xs font-bold truncate">{it.nombre}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                      Costo ${(it.precio_fabricante || 0).toFixed(2)} · Venta ${(it.precio_usd || 0).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="rounded-xl border border-border/30 overflow-hidden">
            <div className="bg-muted/20 px-3 py-2 flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Productos</p>
              <button onClick={addBlank} className="text-[10px] font-bold text-green-400 hover:text-green-300 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Agregar fila manual
              </button>
            </div>
            {items.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground/40 text-xs">
                Busca un producto arriba o agrega una fila manual
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/10 text-[9px] uppercase text-muted-foreground font-bold">
                      <th className="px-2 py-2 text-left">Producto</th>
                      <th className="px-2 py-2 text-center w-16">Cant.</th>
                      <th className="px-2 py-2 text-right w-24">Costo Fab.</th>
                      <th className="px-2 py-2 text-right w-24">Reventa</th>
                      <th className="px-2 py-2 text-right w-24">Ganancia</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          <input
                            value={it.nombre}
                            onChange={e => updateItem(idx, { nombre: e.target.value })}
                            placeholder="Nombre del producto"
                            className="w-full bg-background/50 border border-border/40 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" min={1} value={it.cantidad}
                            onChange={e => updateItem(idx, { cantidad: parseInt(e.target.value) || 1 })}
                            className="w-full text-center bg-background/50 border border-border/40 rounded px-1 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" step="0.01" min={0} value={it.precio_fabricante}
                            onChange={e => updateItem(idx, { precio_fabricante: parseFloat(e.target.value) || 0 })}
                            className="w-full text-right bg-background/50 border border-amber-500/30 rounded px-1 py-1 text-xs font-bold text-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" step="0.01" min={0} value={it.precio_venta}
                            onChange={e => updateItem(idx, { precio_venta: parseFloat(e.target.value) || 0 })}
                            className="w-full text-right bg-background/50 border border-border/40 rounded px-1 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-black text-green-400">
                          ${((it.precio_venta - it.precio_fabricante) * it.cantidad).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totales */}
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Costo total', value: `$${totalCosto.toFixed(2)}`, color: 'text-amber-400' },
                { label: 'Total reventa', value: `$${totalVenta.toFixed(2)}`, color: 'text-foreground' },
                { label: 'Ganancia', value: `$${totalGanancia.toFixed(2)}`, color: 'text-green-400' },
                { label: 'Margen', value: `${margenPct.toFixed(1)}%`, color: 'text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="text-center p-2 rounded-xl bg-background/40 border border-border/20">
                  <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{s.label}</p>
                  <p className={cn('text-sm font-black mt-0.5', s.color)}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Observaciones (opcional)</Label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border/40 bg-background/50 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border/20 bg-muted/10 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30">
            Cancelar
          </button>
          <Button
            onClick={handleSave}
            disabled={!canSave || loading}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white font-black h-10 px-6 shadow-lg shadow-green-500/20"
          >
            {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>) : (<><CheckCircle2 className="w-4 h-4" /> Guardar Nota</>)}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── GANANCIAS: Detalle ──────────────────────────────────────────────────────

function GananciaDetailModal({ row, onClose, tasaBCV }: {
  row: GananciaRow; onClose: () => void; tasaBCV: number;
}) {
  const items = row.origen === 'manual'
    ? (row.nota?.items || []).map(i => ({
        nombre: i.nombre, codigo: i.codigo, cantidad: i.cantidad,
        costo: i.precio_fabricante, venta: i.precio_venta,
      }))
    : (row.distribucion?.items || []).map(i => ({
        nombre: i.nombre, codigo: i.codigo, cantidad: i.cantidad,
        costo: i.precio_fabricante || 0, venta: i.precio_usd || 0,
      }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wallet className="w-5 h-5 text-green-400" />
            {row.numero_nota}
            <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded-full border',
              row.origen === 'manual' ? 'text-green-400 bg-green-500/10 border-green-500/30' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30')}>
              {row.origen === 'manual' ? 'Manual' : 'Distribución'}
            </span>
          </DialogTitle>
          <DialogDescription>
            {new Date(row.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}{row.cliente}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Costo Fab.', value: `$${row.total_costo.toFixed(2)}`, color: 'text-amber-400' },
              { label: 'Reventa', value: `$${row.total_venta.toFixed(2)}`, color: 'text-foreground' },
              { label: 'Ganancia', value: `$${row.total_ganancia.toFixed(2)}`, color: 'text-green-400' },
              { label: 'Margen', value: `${row.margen_pct.toFixed(1)}%`, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="text-center p-2 rounded-xl bg-background/40 border border-border/20">
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{s.label}</p>
                <p className={cn('text-sm font-black mt-0.5', s.color)}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border/30 overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/10 border-b border-border/20 text-[9px] uppercase text-muted-foreground font-bold">
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-center">Cant.</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Reventa</th>
                    <th className="px-3 py-2 text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <p className="font-bold">{it.nombre}</p>
                        {it.codigo && <p className="text-[9px] text-muted-foreground">{it.codigo}</p>}
                      </td>
                      <td className="px-3 py-2 text-center font-black">{it.cantidad}</td>
                      <td className="px-3 py-2 text-right text-amber-400">${it.costo.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${it.venta.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-400">${((it.venta - it.costo) * it.cantidad).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {row.origen === 'manual' && row.nota && (
            <Button
              onClick={() => generateNotaGananciaPDF(row.nota!, tasaBCV)}
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              <Download className="w-4 h-4" /> Descargar Nota de Ganancia PDF
            </Button>
          )}
          {row.origen === 'distribucion' && row.distribucion && (
            <Button
              onClick={() => generateNotaEntregaPDF(row.distribucion!, tasaBCV)}
              variant="outline"
              className="w-full gap-2 font-bold"
            >
              <Download className="w-4 h-4" /> Descargar Nota de Entrega (distribución)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── GANANCIAS: Tab ──────────────────────────────────────────────────────────

function GananciasTab({ inventario, currentSede, userName, tasaBCV }: {
  inventario: InventarioItem[];
  currentSede: { id: string; nombre: string } | null;
  userName: string;
  tasaBCV: number;
}) {
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [notas, setNotas] = useState<NotaGanancia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [selected, setSelected] = useState<GananciaRow | null>(null);

  const [filterSearch, setFilterSearch] = useState('');
  const [filterFecha, setFilterFecha] = useState('');
  const [filterOrigen, setFilterOrigen] = useState<'all' | 'distribucion' | 'manual'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dist, ng] = await Promise.all([
        fetchGananciasDistribuciones(),
        fetchNotasGanancia(),
      ]);
      if (dist) setDistribuciones(dist as Distribucion[]);
      if (ng) setNotas(ng as NotaGanancia[]);
    } catch (e) {
      console.error('Error loading ganancias:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const costMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of inventario) m[i.id] = i.precio_fabricante || 0;
    return m;
  }, [inventario]);

  const rows = useMemo(
    () => buildGananciaRows(distribuciones, notas, costMap),
    [distribuciones, notas, costMap]
  );

  const today = getVzlaDate();
  const mesPrefix = today.slice(0, 7); // YYYY-MM

  const rowsHoy = rows.filter(r => r.fecha === today);
  const rowsMes = rows.filter(r => r.fecha.startsWith(mesPrefix));
  const gananciaHoy = rowsHoy.reduce((s, r) => s + r.total_ganancia, 0);
  const gananciaMes = rowsMes.reduce((s, r) => s + r.total_ganancia, 0);
  const ventaMes = rowsMes.reduce((s, r) => s + r.total_venta, 0);
  const costoMes = rowsMes.reduce((s, r) => s + r.total_costo, 0);
  const margenMes = ventaMes > 0 ? (gananciaMes / ventaMes) * 100 : 0;

  const filtered = useMemo(() => rows.filter(r => {
    const mOrigen = filterOrigen === 'all' || r.origen === filterOrigen;
    const mFecha = !filterFecha || r.fecha === filterFecha;
    const q = filterSearch.toLowerCase();
    const mSearch = !q || r.numero_nota.toLowerCase().includes(q) ||
      r.cliente.toLowerCase().includes(q) || r.responsable.toLowerCase().includes(q);
    return mOrigen && mFecha && mSearch;
  }), [rows, filterOrigen, filterFecha, filterSearch]);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <Wallet className="w-6 h-6 text-green-400" /> Ganancias
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fabricante (costo) vs reventa a Lycos y otros talleres. Información confidencial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Actualizar
          </Button>
          <Button onClick={() => setShowWizard(true)} className="gap-2 bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg shadow-green-500/20">
            <Plus className="w-4 h-4" /> Nueva Nota de Ganancia
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Ganancia Hoy" value={`$${gananciaHoy.toFixed(2)}`} sub={`${rowsHoy.length} registros`} icon={DollarSign} color="bg-green-500/5 border-green-500/20 text-green-400" />
        <StatCard label="Ganancia del Mes" value={`$${gananciaMes.toFixed(2)}`} sub={`${rowsMes.length} registros`} icon={TrendingUp} color="bg-emerald-500/5 border-emerald-500/20 text-emerald-400" />
        <StatCard label="Costo Fabricante (mes)" value={`$${costoMes.toFixed(2)}`} sub={`Reventa $${ventaMes.toFixed(2)}`} icon={Factory} color="bg-amber-500/5 border-amber-500/20 text-amber-400" />
        <StatCard label="Margen del Mes" value={`${margenMes.toFixed(1)}%`} sub="ganancia / reventa" icon={Percent} color="bg-purple-500/5 border-purple-500/20 text-purple-400" />
      </div>

      {/* Filters */}
      <Card className="glass-panel border-border/50 bg-card/40">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nota, cliente o responsable..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="pl-9 bg-background/50 h-9 text-sm" />
            </div>
            <select value={filterOrigen} onChange={e => setFilterOrigen(e.target.value as any)} className="h-9 px-3 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-green-500">
              <option value="all">Todos los orígenes</option>
              <option value="distribucion">Distribuciones (auto)</option>
              <option value="manual">Notas manuales</option>
            </select>
            <input type="date" value={filterFecha} onChange={e => setFilterFecha(e.target.value)} className="h-9 px-3 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            {(filterSearch || filterFecha || filterOrigen !== 'all') && (
              <button onClick={() => { setFilterSearch(''); setFilterFecha(''); setFilterOrigen('all'); }} className="h-9 px-3 rounded-lg border border-border/30 text-xs text-muted-foreground hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Limpiar
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden">
        <CardHeader className="pb-2 px-5 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-green-400" /> Registro de Ganancias
            </CardTitle>
            <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-10 h-10 text-primary/20 animate-spin" />
              <span className="text-sm text-muted-foreground animate-pulse">Cargando ganancias...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
              <Wallet className="w-12 h-12" />
              <p className="text-sm font-medium">{rows.length === 0 ? 'Aún no hay datos de ganancia' : 'Sin coincidencias con los filtros'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  <tr>
                    <th className="px-5 py-3 text-left">N° Nota</th>
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Cliente / Destino</th>
                    <th className="px-5 py-3 text-center">Origen</th>
                    <th className="px-5 py-3 text-right">Costo Fab.</th>
                    <th className="px-5 py-3 text-right">Reventa</th>
                    <th className="px-5 py-3 text-right">Ganancia</th>
                    <th className="px-5 py-3 text-center">Margen</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filtered.map(r => (
                    <tr key={r.id} className="group hover:bg-white/3 transition-colors">
                      <td className="px-5 py-3 font-mono font-black text-sm text-green-300">{r.numero_nota}</td>
                      <td className="px-5 py-3 text-sm">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-5 py-3 font-bold text-sm">{r.cliente}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border',
                          r.origen === 'manual' ? 'text-green-400 bg-green-500/10 border-green-500/30' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30')}>
                          {r.origen === 'manual' ? 'Manual' : 'Auto'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-amber-400 font-bold">${r.total_costo.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right">${r.total_venta.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-black text-green-400">${r.total_ganancia.toFixed(2)}</td>
                      <td className="px-5 py-3 text-center font-bold text-emerald-400">{r.margen_pct.toFixed(0)}%</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setSelected(r)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-green-400 hover:bg-green-500/10 border border-transparent hover:border-green-500/20 transition-all" title="Ver detalle">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {r.origen === 'manual' && r.nota && (
                            <button onClick={() => generateNotaGananciaPDF(r.nota!, tasaBCV)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-green-400 hover:bg-green-500/10 border border-transparent hover:border-green-500/20 transition-all" title="Descargar PDF">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showWizard && (
        <NuevaNotaGananciaWizard
          inventario={inventario}
          currentSede={currentSede}
          userName={userName}
          tasaBCV={tasaBCV}
          onClose={() => setShowWizard(false)}
          onSuccess={() => { setShowWizard(false); load(); }}
        />
      )}
      {selected && (
        <GananciaDetailModal row={selected} onClose={() => setSelected(null)} tasaBCV={tasaBCV} />
      )}
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function DistribuidorPage() {
  const { user } = useAppStore();
  const { currentSede, availableSedes } = useSedeStore();
  const { getModulePermissions } = useRolePermissions();
  const [mounted, setMounted] = useState(false);

  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasaBCV, setTasaBCV] = useState(0);

  const [showWizard, setShowWizard] = useState(false);
  const [selectedDist, setSelectedDist] = useState<Distribucion | null>(null);

  // Filters
  const [filterSede, setFilterSede] = useState('all');
  const [filterFecha, setFilterFecha] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Check if current sede is Carrizal (principal / allowed to distribute)
  const isCarrizal = useMemo(() => {
    if (!currentSede) return false;
    const name = currentSede.nombre.toLowerCase();
    if (name.includes('carrizal')) return true;
    // Also check if it's the principal sede
    const sedeData = availableSedes.find(s => s.id === currentSede.id);
    return sedeData?.es_principal === true;
  }, [currentSede, availableSedes]);

  // Acceso por PERMISO `distribuidor` (admin/dueño/supervisor lo traen por defecto)
  // combinado con la sede: la distribución se origina en Carrizal; las ganancias
  // también las ve el dueño/admin desde San Antonio.
  const distPerms = getModulePermissions('distribuidor');
  const isSanAntonio = useMemo(
    () => (currentSede?.nombre || '').toLowerCase().includes('san antonio'),
    [currentSede]
  );
  const canDistribute = distPerms.crear && isCarrizal;           // crear distribuciones (solo Carrizal)
  const canAccess = distPerms.leer && (isCarrizal || isSanAntonio); // acceso al módulo
  const [activeTab, setActiveTab] = useState<'distribucion' | 'ganancias'>('distribucion');

  // El dueño en San Antonio entra directo a Ganancias
  useEffect(() => {
    if (!canDistribute && canAccess) setActiveTab('ganancias');
  }, [canDistribute, canAccess]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, dist, ratesRes] = await Promise.all([
        fetchInventario(),
        fetchDistribuciones(),
        fetch('/api/rates').then(r => r.json()).catch(() => ({ bcv: 0 })),
      ]);
      if (inv) setInventario(inv as InventarioItem[]);
      if (dist) setDistribuciones(dist as Distribucion[]);
      setTasaBCV(ratesRes?.bcv || 0);
    } catch (e) {
      console.error('Error loading distribuidor data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) loadData();
  }, [mounted, loadData]);

  // Realtime updates
  useEffect(() => {
    if (!supabase || !mounted) return;
    const ch = supabase.channel('distribuidor-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribuciones' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, loadData)
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [mounted, loadData]);

  const today = getVzlaDate();

  // Stats
  const distHoy = distribuciones.filter(d => d.fecha === today);
  const unidadesHoy = distHoy.reduce((s, d) => s + d.total_unidades, 0);
  const valorHoy = distHoy.reduce((s, d) => s + d.valor_total_usd, 0);
  const sedesAbastecidas = new Set(distribuciones.map(d => d.sede_destino_nombre)).size;

  // Filtered list
  const filtered = useMemo(() => {
    return distribuciones.filter(d => {
      const matchSede = filterSede === 'all' || d.sede_destino_nombre === filterSede;
      const matchFecha = !filterFecha || d.fecha === filterFecha;
      const matchSearch = !filterSearch ||
        d.numero_nota.toLowerCase().includes(filterSearch.toLowerCase()) ||
        d.sede_destino_nombre.toLowerCase().includes(filterSearch.toLowerCase()) ||
        d.responsable.toLowerCase().includes(filterSearch.toLowerCase());
      return matchSede && matchFecha && matchSearch;
    });
  }, [distribuciones, filterSede, filterFecha, filterSearch]);

  // Unique destinations for filter
  const destinos = [...new Set(distribuciones.map(d => d.sede_destino_nombre))];

  if (!mounted) return null;

  // ─── ACCESO RESTRINGIDO ────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6">
        <div className="w-24 h-24 rounded-3xl bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center animate-pulse">
          <ShieldAlert className="w-12 h-12 text-red-500/60" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-2xl font-black" style={{ fontFamily: 'Syne, sans-serif' }}>
            Módulo Restringido
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            El módulo <strong>Distribuidor</strong> está disponible para la sede{' '}
            <strong className="text-indigo-400">Carrizal</strong> (sede principal). Las{' '}
            <strong className="text-green-400">Ganancias</strong> también puede verlas el dueño/administrador
            desde <strong>San Antonio</strong>.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 px-4 py-2 rounded-xl bg-muted/30 border border-border/30 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sede actual:</span>
            <strong>{currentSede?.nombre || 'No seleccionada'}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow">Distribuidor</span>
            <Truck className="w-8 h-8 text-indigo-400 animate-float" />
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">Distribución de inventario desde</p>
            <span className="flex items-center gap-1 text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" /> {currentSede?.nombre}
            </span>
          </div>
        </div>
        {activeTab === 'distribucion' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Actualizar
            </Button>
            {canDistribute && (
              <Button
                onClick={() => setShowWizard(true)}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 font-bold"
              >
                <Plus className="w-4 h-4" /> Nueva Distribución
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/30">
        <button
          onClick={() => setActiveTab('distribucion')}
          className={cn(
            'px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-all flex items-center gap-2',
            activeTab === 'distribucion'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Truck className="w-4 h-4" /> Distribución
        </button>
        <button
          onClick={() => setActiveTab('ganancias')}
          className={cn(
            'px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-all flex items-center gap-2',
            activeTab === 'ganancias'
              ? 'border-green-500 text-green-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Wallet className="w-4 h-4" /> Ganancias
        </button>
      </div>

      {activeTab === 'ganancias' && (
        <GananciasTab
          inventario={inventario}
          currentSede={currentSede}
          userName={user?.nombre || 'Sistema'}
          tasaBCV={tasaBCV}
        />
      )}

      {activeTab === 'distribucion' && (
      <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Distribuciones Hoy"
          value={distHoy.length}
          sub={`${distribuciones.length} total histórico`}
          icon={Truck}
          color="bg-indigo-500/5 border-indigo-500/20 text-indigo-400"
        />
        <StatCard
          label="Unidades Hoy"
          value={unidadesHoy}
          sub="unidades distribuidas"
          icon={Boxes}
          color="bg-orange-500/5 border-orange-500/20 text-orange-400"
        />
        <StatCard
          label="Valor Distribuido"
          value={`$${valorHoy.toFixed(2)}`}
          sub="hoy en USD"
          icon={BadgeCheck}
          color="bg-green-500/5 border-green-500/20 text-green-400"
        />
        <StatCard
          label="Sedes Abastecidas"
          value={sedesAbastecidas}
          sub="sedes en total"
          icon={MapPin}
          color="bg-purple-500/5 border-purple-500/20 text-purple-400"
        />
      </div>

      {/* Filters */}
      <Card className="glass-panel border-border/50 bg-card/40">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nota, sede destino o responsable..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="pl-9 bg-background/50 h-9 text-sm"
              />
            </div>
            <select
              value={filterSede}
              onChange={e => setFilterSede(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas las sedes destino</option>
              {destinos.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterFecha}
              onChange={e => setFilterFecha(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {(filterSearch || filterSede !== 'all' || filterFecha) && (
              <button
                onClick={() => { setFilterSearch(''); setFilterSede('all'); setFilterFecha(''); }}
                className="h-9 px-3 rounded-lg border border-border/30 text-xs text-muted-foreground hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Limpiar
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden">
        <CardHeader className="pb-2 px-5 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Historial de Distribuciones
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {filtered.length} registros
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-10 h-10 text-primary/20 animate-spin" />
              <span className="text-sm text-muted-foreground animate-pulse">Cargando distribuciones...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
              <Truck className="w-12 h-12" />
              <p className="text-sm font-medium">
                {distribuciones.length === 0 ? 'Aún no hay distribuciones registradas' : 'Sin coincidencias con los filtros'}
              </p>
              {distribuciones.length === 0 && (
                <Button onClick={() => setShowWizard(true)} size="sm" className="mt-2 opacity-100 bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Plus className="w-4 h-4 mr-1" /> Crear primera distribución
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  <tr>
                    <th className="px-5 py-3 text-left">N° Nota</th>
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Destino</th>
                    <th className="px-5 py-3 text-center">Productos</th>
                    <th className="px-5 py-3 text-center">Unidades</th>
                    <th className="px-5 py-3 text-right">Valor USD</th>
                    <th className="px-5 py-3 text-center">Estado</th>
                    <th className="px-5 py-3 text-center">Responsable</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filtered.map(dist => {
                    const cfg = ESTADO_CONFIG[dist.estado] || ESTADO_CONFIG.completado;
                    const EstadoIcon = cfg.icon;
                    const esHoy = dist.fecha === today;
                    return (
                      <tr key={dist.id} className={cn('group hover:bg-white/3 transition-colors', esHoy && 'bg-indigo-500/2')}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {esHoy && (
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                            )}
                            <span className="font-mono font-black text-sm text-indigo-300">
                              {dist.numero_nota}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div>
                            <p className="font-medium text-sm">
                              {new Date(dist.fecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              {new Date(dist.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-bold text-sm">{dist.sede_destino_nombre}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="font-black text-indigo-300">{dist.total_items}</span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="font-black text-orange-400">{dist.total_unidades}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="font-black text-green-400">${dist.valor_total_usd.toFixed(2)}</span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border', cfg.bg, cfg.color, cfg.border)}>
                            <EstadoIcon className="w-2.5 h-2.5" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="text-xs text-muted-foreground">{dist.responsable}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedDist(dist)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all"
                              title="Ver detalles"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => generateNotaEntregaPDF(dist, tasaBCV)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-green-400 hover:bg-green-500/10 border border-transparent hover:border-green-500/20 transition-all"
                              title="Descargar Nota de Entrega PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wizard Modal */}
      {showWizard && (
        <NuevaDistribucionWizard
          inventario={inventario}
          sedes={availableSedes}
          onClose={() => setShowWizard(false)}
          onSuccess={(dist) => {
            setShowWizard(false);
            setSelectedDist(dist);
            loadData();
          }}
          currentSede={currentSede}
          userName={user?.nombre || 'Sistema'}
        />
      )}

      {/* Detail Modal */}
      {selectedDist && (
        <DetailModal
          dist={selectedDist}
          onClose={() => setSelectedDist(null)}
          tasaBCV={tasaBCV}
        />
      )}
      </>
      )}
    </div>
  );
}
