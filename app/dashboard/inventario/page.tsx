'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Plus, Search, Filter, Edit, Trash2, 
  AlertTriangle, CheckCircle2, 
  FilterX, RefreshCw, TrendingUp
} from 'lucide-react';
import { supabase, fetchInventario, createInventarioItem, updateInventarioItem, deleteInventarioItem, updateInventarioStock } from '@/lib/supabase';
import { InventarioItem, InventarioCategoria } from '@/types';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const CATEGORIES: { value: InventarioCategoria; label: string }[] = [
  { value: 'silenciador', label: 'Silenciadores' },
  { value: 'resonador', label: 'Resonadores' },
  { value: 'cola_cromada', label: 'Colas Cromadas' },
  { value: 'flexible', label: 'Flexibles' },
  { value: 'filtro_aceite', label: 'Filtros Aceite' },
  { value: 'filtro_gasolina', label: 'Filtros Gasolina' },
  { value: 'liquido', label: 'Líquidos' },
  { value: 'frenos', label: 'Frenos' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'general', label: 'General' },
  { value: 'otro', label: 'Otro' },
];

export default function InventarioPage() {
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventarioItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    nombre: '',
    codigo: '',
    categoria: 'general' as InventarioCategoria,
    marca: '',
    precio_usd: 0,
    precio_bs: 0,
    stock: 0,
    stock_minimo: 1,
    unidad: 'unidad',
    notas: ''
  });

  useEffect(() => {
    loadData();
    
    // Realtime subscription
    if (!supabase) return;
    const channel = supabase!.channel('inventario-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      console.log('📦 Intentando cargar inventario...');
      const data = await fetchInventario();
      console.log('📦 Datos recibidos del inventario:', data?.length || 0, 'ítems');
      if (data) setItems(data as InventarioItem[]);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        item.nombre.toLowerCase().includes(search.toLowerCase()) || 
        (item.codigo?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (item.marca?.toLowerCase() || '').includes(search.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || item.categoria === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [items, search, categoryFilter]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setForm({
      nombre: '',
      codigo: '',
      categoria: 'general',
      marca: '',
      precio_usd: 0,
      precio_bs: 0,
      stock: 0,
      stock_minimo: 1,
      unidad: 'unidad',
      notas: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item: InventarioItem) => {
    setEditingItem(item);
    setForm({
      nombre: item.nombre,
      codigo: item.codigo || '',
      categoria: item.categoria,
      marca: item.marca || '',
      precio_usd: item.precio_usd || 0,
      precio_bs: item.precio_bs || 0,
      stock: item.stock,
      stock_minimo: item.stock_minimo,
      unidad: item.unidad || 'unidad',
      notas: item.notas || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateInventarioItem(editingItem.id, form);
      } else {
        await createInventarioItem(form);
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Error al guardar el producto');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickStockUpdate = async (id: string, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      setItems(prev => prev.map(item => item.id === id ? { ...item, stock: newStock } : item));
      await updateInventarioStock(id, newStock);
    } catch (error) {
      console.error('Error updating stock:', error);
      loadData(); // Revert on error
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (confirm(`¿Estás seguro de desactivar "${nombre}"? El producto ya no aparecerá en las búsquedas activas.`)) {
      try {
        await deleteInventarioItem(id);
        loadData();
      } catch (error) {
        console.error('Error deleting item:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow">Inventario</span>
            <Package className="w-8 h-8 text-primary animate-float" />
          </h1>
          <p className="text-muted-foreground mt-1">Gestión completa de repuestos, accesorios y stock del taller.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Actualizar
          </Button>
          <Button onClick={handleOpenAdd} className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-card bg-primary/5 border-primary/20 transition-all hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary uppercase tracking-wider">Productos Totales</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{items.length}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-inner">
                <Package className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card bg-orange-500/5 border-orange-500/20 transition-all hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-orange-500 uppercase tracking-wider">Bajo Stock</p>
                <p className="text-3xl font-bold mt-1 tracking-tight text-orange-500">
                  {items.filter(i => (i.stock ?? 0) <= (i.stock_minimo ?? 1)).length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-500 shadow-inner">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card bg-green-500/5 border-green-500/20 transition-all hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-500 uppercase tracking-wider">En Stock</p>
                <p className="text-3xl font-bold mt-1 tracking-tight text-green-500">
                  {items.filter(i => (i.stock ?? 0) > (i.stock_minimo ?? 1)).length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center text-green-500 shadow-inner">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card bg-cyan-500/5 border-cyan-500/20 transition-all hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-cyan-500 uppercase tracking-wider">Valor Estimado</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">
                  ${items.reduce((acc, i) => acc + ((i.precio_usd || 0) * (i.stock || 0)), 0).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-500 shadow-inner">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden">
        <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="Buscar por nombre, código o marca..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 focus:border-primary/50 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background/50">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 opacity-70" />
                  <SelectValue placeholder="Categoría" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setCategoryFilter('all'); }} title="Limpiar Filtros">
              <FilterX className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-widest text-muted-foreground">Producto / Código</th>
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-widest text-muted-foreground text-center">Categoría</th>
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-widest text-muted-foreground text-center">Stock</th>
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-widest text-muted-foreground text-center">Precio (USD)</th>
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-widest text-muted-foreground text-center">Estado</th>
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-widest text-muted-foreground text-right w-20">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-10 h-10 text-primary animate-spin opacity-20" />
                      <span className="text-muted-foreground animate-pulse">Cargando inventario...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <Package className="w-12 h-12" />
                      <span>No se encontraron productos.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-border/30 hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground text-base">{item.nombre}</span>
                        <span className="text-xs text-muted-foreground font-mono bg-secondary/50 px-1.5 py-0.5 rounded w-fit mt-0.5">
                          {item.codigo || 'SIN-CÓDIGO'}
                        </span>
                        {item.marca && <span className="text-[10px] text-primary uppercase font-bold mt-1 tracking-tighter">Marca: {item.marca}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-tighter font-bold border-muted-foreground/30">
                        {CATEGORIES.find(c => c.value === item.categoria)?.label || item.categoria}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleQuickStockUpdate(item.id, item.stock, -1)}
                            className="w-6 h-6 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 border border-border/50 text-muted-foreground transition-colors"
                          >
                            -
                          </button>
                          <span className={cn(
                            "text-xl font-bold px-3 py-1 rounded-xl shadow-sm min-w-[50px]",
                            item.stock <= 0 ? "bg-red-500/10 text-red-500" : 
                            item.stock <= item.stock_minimo ? "bg-orange-500/10 text-orange-500" :
                            "bg-green-500/10 text-green-500"
                          )}>
                            {item.stock}
                          </span>
                          <button 
                            onClick={() => handleQuickStockUpdate(item.id, item.stock, 1)}
                            className="w-6 h-6 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[9px] text-muted-foreground uppercase font-bold">Min: {item.stock_minimo} · {item.unidad || 'unidad'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-base font-bold text-primary">
                          ${item.precio_usd?.toFixed(2) || '0.00'}
                        </span>
                        {item.precio_bs && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            Bs. {item.precio_bs.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.stock <= item.stock_minimo ? (
                        <div className="flex items-center justify-center gap-1.5 text-orange-500">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-tighter">Stock Crítico</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 text-green-500">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-tighter">Disponible</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20" 
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20" 
                          onClick={() => handleDelete(item.id, item.nombre)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md glass-panel border-border/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {editingItem ? <Edit className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
              {editingItem ? 'Editar Producto' : 'Nuevo Producto'}
            </DialogTitle>
            <DialogDescription>
              Completa los datos del producto para actualizar el inventario.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="nombre" className="text-xs font-bold uppercase text-muted-foreground">Nombre del Producto</Label>
                <Input 
                  id="nombre"
                  required 
                  value={form.nombre}
                  onChange={e => setForm({...form, nombre: e.target.value})}
                  placeholder="Ej. Silenciador CL40"
                  className="bg-background/50 border-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codigo" className="text-xs font-bold uppercase text-muted-foreground">Código / SKU</Label>
                <Input 
                  id="codigo"
                  value={form.codigo}
                  onChange={e => setForm({...form, codigo: e.target.value})}
                  placeholder="SKU-001"
                  className="bg-background/50 font-mono text-sm border-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="categoria" className="text-xs font-bold uppercase text-muted-foreground">Categoría</Label>
                <Select 
                  value={form.categoria} 
                  onValueChange={val => setForm({...form, categoria: val as InventarioCategoria})}
                >
                  <SelectTrigger id="categoria" className="bg-background/50 border-primary/20">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marca" className="text-xs font-bold uppercase text-muted-foreground">Marca</Label>
                <Input 
                  id="marca"
                  value={form.marca}
                  onChange={e => setForm({...form, marca: e.target.value})}
                  placeholder="Ej. Kardoc"
                  className="bg-background/50 border-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unidad" className="text-xs font-bold uppercase text-muted-foreground">Unidad de Medida</Label>
                <Select 
                  value={form.unidad} 
                  onValueChange={val => setForm({...form, unidad: val})}
                >
                  <SelectTrigger id="unidad" className="bg-background/50 border-primary/20">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidad">Unidad (pza)</SelectItem>
                    <SelectItem value="galon">Galón</SelectItem>
                    <SelectItem value="litro">Litro</SelectItem>
                    <SelectItem value="par">Par</SelectItem>
                    <SelectItem value="set">Set / Juego</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="precio" className="text-xs font-bold uppercase text-muted-foreground">Precio (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                  <Input 
                    id="precio"
                    type="number"
                    step="0.01"
                    required 
                    value={form.precio_usd}
                    onChange={e => setForm({...form, precio_usd: parseFloat(e.target.value) || 0})}
                    className="pl-7 bg-background/50 font-bold text-primary border-primary/20"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="precio_bs" className="text-xs font-bold uppercase text-muted-foreground">Precio (Bs.D)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">Bs</span>
                  <Input 
                    id="precio_bs"
                    type="number"
                    step="0.01"
                    value={form.precio_bs}
                    onChange={e => setForm({...form, precio_bs: parseFloat(e.target.value) || 0})}
                    className="pl-8 bg-background/50 font-bold text-muted-foreground border-primary/20"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock" className="text-xs font-bold uppercase text-muted-foreground">Stock Actual</Label>
                <Input 
                  id="stock"
                  type="number"
                  required 
                  value={form.stock}
                  onChange={e => setForm({...form, stock: parseInt(e.target.value) || 0})}
                  className="bg-background/50 font-bold border-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock_minimo" className="text-xs font-bold uppercase text-muted-foreground">Stock Mínimo</Label>
                <Input 
                  id="stock_minimo"
                  type="number"
                  required 
                  value={form.stock_minimo}
                  onChange={e => setForm({...form, stock_minimo: parseInt(e.target.value) || 0})}
                  className="bg-background/50 border-primary/20"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="notas" className="text-xs font-bold uppercase text-muted-foreground">Notas Internas</Label>
                <Input 
                  id="notas"
                  value={form.notas}
                  onChange={e => setForm({...form, notas: e.target.value})}
                  placeholder="Ej. Ubicación en estante A-1..."
                  className="bg-background/50 border-primary/20"
                />
              </div>
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[100px] bg-primary group relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>Guardar Cambios</>
                )}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
