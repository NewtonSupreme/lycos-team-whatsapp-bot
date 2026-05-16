'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Reorder } from 'framer-motion';
import { 
  Package, Plus, Search, Filter, Edit, Trash2, 
  AlertTriangle, CheckCircle2, 
  FilterX, RefreshCw, TrendingUp,
  DollarSign, ArrowUpRight, ArrowDownRight,
  GripVertical, MapPin, Sparkles
} from 'lucide-react';
import { supabase, fetchInventario, createInventarioItem, updateInventarioItem, deleteInventarioItem, updateInventarioStock, updateInventarioOrder } from '@/lib/supabase';
import { InventarioItem, InventarioCategoria } from '@/types';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

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
  { value: 'oficina', label: 'Oficina' },
  { value: 'otro', label: 'Otro' },
];

const LOCATIONS = [
  { value: 'almacen', label: 'Almacén' },
  { value: 'taller', label: 'Taller' },
  { value: 'oficina', label: 'Oficina' },
];

const CLASSIFICATIONS = [
  { value: 'repuesto', label: 'Repuesto' },
  { value: 'accesorio', label: 'Accesorio' },
  { value: 'herramienta', label: 'Herramienta' },
  { value: 'oficina', label: 'Suministros Oficina' },
  { value: 'consumible', label: 'Consumible' },
];

export default function InventarioPage() {
  const { user } = useAppStore();
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventarioItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rates, setRates] = useState<{ bcv: number; binance: number } | null>(null);
  const [lastRateUpdate, setLastRateUpdate] = useState<string>('');
  const [mounted, setMounted] = useState(false);

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
    notas: '',
    ubicacion: 'almacen',
    clasificacion: 'repuesto'
  });

  const fetchRates = async () => {
    try {
      const res = await fetch(`/api/rates?t=${Date.now()}`);
      const data = await res.json();
      setRates({ 
        bcv: data.bcv || 0, 
        binance: data.binance || data.paralelo || 0 
      });
      setLastRateUpdate(new Date(data.fetchedAt || Date.now()).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      console.error('Error fetching rates:', error);
    }
  };

  useEffect(() => {
    loadData();
    fetchRates();
    
    // Refresh rates every 15 minutes
    const interval = setInterval(fetchRates, 15 * 60 * 1000);

    // Realtime subscription
    if (!supabase) return;
    const channel = supabase!.channel('inventario-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, () => {
        loadData();
      })
      .subscribe();

    setMounted(true);
    return () => {
      clearInterval(interval);
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
      
      // Sincronizar también las tasas al recargar datos
      await fetchRates();
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleReorder = async (newOrder: InventarioItem[]) => {
    // Update local state immediately for smooth UI
    setItems(newOrder);
    
    // Prepare batch update for database
    const updates = newOrder.map((item, index) => ({
      id: item.id,
      orden: index
    }));
    
    try {
      await updateInventarioOrder(updates);
      console.log('✅ Orden guardado');
      
      // Log activity once for the whole reorder
      await logActivity({
        usuario: user?.nombre || 'Sistema',
        modulo: 'Inventario',
        accion: 'Reordenó inventario',
        detalles: `Se cambió el orden manual de ${newOrder.length} productos.`
      });
    } catch (error: any) {
      console.error('Error saving new order:', error);
      alert(`Error al guardar el orden: ${error.message || 'Error desconocido'}`);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        item.nombre.toLowerCase().includes(search.toLowerCase()) || 
        (item.codigo?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (item.marca?.toLowerCase() || '').includes(search.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || item.categoria === categoryFilter;
      const matchesLocation = locationFilter === 'all' || item.ubicacion === locationFilter;
      const matchesClassification = classificationFilter === 'all' || item.clasificacion === classificationFilter;
      
      return matchesSearch && matchesCategory && matchesLocation && matchesClassification;
    });
  }, [items, search, categoryFilter, locationFilter, classificationFilter]);

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
      notas: '',
      ubicacion: 'almacen',
      clasificacion: 'repuesto'
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
      notas: item.notas || '',
      ubicacion: item.ubicacion || 'almacen',
      clasificacion: item.clasificacion || 'repuesto'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Normalizar datos
    const cleanForm = {
      ...form,
      codigo: form.codigo?.trim() || null
    };

    try {
      // Validar duplicados localmente antes de enviar
      if (cleanForm.codigo) {
        const duplicado = items.find(i => 
          i.codigo?.toLowerCase() === cleanForm.codigo?.toLowerCase() && 
          (!editingItem || i.id !== editingItem.id)
        );
        
        if (duplicado) {
          alert(`Error: El código "${cleanForm.codigo}" ya está en uso por el producto "${duplicado.nombre}".`);
          setIsSubmitting(false);
          return;
        }
      }

      if (editingItem) {
        await updateInventarioItem(editingItem.id, cleanForm);
        
        await logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Inventario',
          accion: 'Actualizó producto',
          detalles: `${cleanForm.nombre} (${cleanForm.codigo || 'S/N'})`,
          referencia_id: editingItem.id,
          referencia_tabla: 'inventario'
        });
      } else {
        const newItem = await createInventarioItem({
          ...cleanForm,
          orden: items.length
        });
        
        if (newItem) {
          await logActivity({
            usuario: user?.nombre || 'Sistema',
            modulo: 'Inventario',
            accion: 'Creó producto',
            detalles: `${cleanForm.nombre} (${cleanForm.codigo || 'S/N'})`,
            referencia_id: newItem.id,
            referencia_tabla: 'inventario'
          });
        }
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      console.error('Error saving item:', error);
      const msg = error.message || 'Error desconocido';
      if (msg.includes('unique constraint')) {
        alert(`Error: El código ya existe. Por favor usa un código diferente.`);
      } else {
        alert(`Error al guardar el producto: ${msg}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickStockUpdate = async (id: string, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      await updateInventarioStock(id, newStock);
      
      // Log activity
      const item = items.find(i => i.id === id);
      await logActivity({
        usuario: user?.nombre || 'Sistema',
        modulo: 'Inventario',
        accion: 'Actualizó stock',
        detalles: `${item?.nombre || 'Producto'}: ${currentStock} -> ${newStock}`,
        referencia_id: id,
        referencia_tabla: 'inventario'
      });
      
      loadData();
    } catch (error) {
      console.error('Error updating stock:', error);
      loadData(); // Revert on error
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (confirm(`¿Estás seguro de eliminar "${nombre}"?\n\nEl producto se enviará a la papelera y podrá ser restaurado por el administrador.`)) {
      try {
        await deleteInventarioItem(id, user?.nombre || 'Sistema');
        
        await logActivity({
          usuario: user?.nombre || 'Sistema',
          modulo: 'Inventario',
          accion: 'Eliminó producto',
          detalles: `${nombre} (enviado a papelera)`,
          referencia_id: id,
          referencia_tabla: 'inventario'
        });
        
        loadData();
      } catch (error) {
        console.error('Error deleting item:', error);
      }
    }
  };

  if (!mounted) return null;

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

      {/* Exchange Rates Display */}
      {rates && (
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 shadow-sm animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-500/20">
              <span className="text-[10px] font-bold text-blue-400">BCV</span>
            </div>
            <span className="text-sm font-bold text-blue-400">Bs. {(rates.bcv || 0).toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-orange-500/20">
              <span className="text-[10px] font-bold text-orange-400">P2P</span>
            </div>
            <span className="text-sm font-bold text-orange-400">Bs. {(rates.binance || 0).toFixed(2)}</span>
            <div className="flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded-md bg-orange-500/10 text-[9px] font-bold text-orange-400 uppercase">
              Binance
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin-slow" />
            Actualizado: {lastRateUpdate}
          </div>
        </div>
      )}

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
      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden shadow-sm">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search Bar */}
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Buscar por nombre, código o marca..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-border/50 focus:border-primary/50 transition-all h-11 sm:h-10 text-sm"
              />
            </div>

            {/* Selects Container */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex items-center gap-2">
              <div className="flex-1 min-w-[120px]">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full bg-background/50 h-11 sm:h-10 text-xs">
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
              </div>

              <div className="flex-1 min-w-[120px]">
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="w-full bg-background/50 h-11 sm:h-10 text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 opacity-70" />
                      <SelectValue placeholder="Ubicación" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las ubicaciones</SelectItem>
                    {LOCATIONS.map(loc => (
                      <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[120px]">
                <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                  <SelectTrigger className="w-full bg-background/50 h-11 sm:h-10 text-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 opacity-70" />
                      <SelectValue placeholder="Clasificación" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las clases</SelectItem>
                    {CLASSIFICATIONS.map(cls => (
                      <SelectItem key={cls.value} value={cls.value}>{cls.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => { setSearch(''); setCategoryFilter('all'); setLocationFilter('all'); setClassificationFilter('all'); }} 
                title="Limpiar Filtros"
                className="h-11 w-full lg:w-10 lg:h-10 shrink-0 hover:bg-red-500/10 hover:text-red-500 transition-colors border border-border/30 lg:border-transparent"
              >
                <FilterX className="w-4 h-4 mr-2 lg:mr-0" />
                <span className="lg:hidden text-xs font-bold uppercase">Limpiar Filtros</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                <tr>
                  <th className="px-6 py-3 text-left w-10"></th>
                  <th className="px-6 py-3 text-left">Producto</th>
                  <th className="px-6 py-3 text-center">Stock</th>
                  <th className="px-6 py-3 text-center">Dólares Divisa</th>
                  <th className="px-6 py-3 text-center">Estado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <Reorder.Group 
                as="tbody" 
                axis="y" 
                values={items} 
                onReorder={handleReorder}
                className="divide-y divide-border/50"
              >
                {/* Disable reordering when filtering to avoid data corruption */}
                {(search || categoryFilter !== 'all') && (
                  <tr>
                    <td colSpan={6} className="px-6 py-2 bg-yellow-500/5 text-[10px] text-yellow-500 font-bold text-center border-y border-yellow-500/20 uppercase tracking-widest">
                      Reordenado desactivado mientras haya filtros activos
                    </td>
                  </tr>
                )}
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
                    <Reorder.Item 
                      key={item.id} 
                      value={item} 
                      as="tr"
                      drag={!(search || categoryFilter !== 'all')}
                      className={cn(
                        "group border-b border-border/30 hover:bg-white/5 transition-colors cursor-default",
                        (search || categoryFilter !== 'all') && "opacity-80"
                      )}
                    >
                      <td className="px-3 py-4 w-10">
                        {!(search || categoryFilter !== 'all') ? (
                          <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/50 cursor-grab active:cursor-grabbing" />
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-foreground text-base">{item.nombre}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono bg-secondary/50 px-1.5 py-0.5 rounded uppercase font-bold">
                              {item.categoria}
                            </span>
                            {item.codigo && (
                              <span className="text-xs text-muted-foreground font-mono opacity-60">
                                {item.codigo}
                              </span>
                            )}
                          </div>
                          {item.marca && <span className="text-[10px] text-primary uppercase font-bold mt-1 tracking-tighter">Marca: {item.marca}</span>}
                          <div className="flex items-center gap-2 mt-1">
                            {item.ubicacion && (
                              <span className="text-[9px] text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 uppercase">
                                <MapPin className="w-2.5 h-2.5" /> {item.ubicacion}
                              </span>
                            )}
                            {item.clasificacion && (
                              <span className="text-[9px] text-purple-500 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 uppercase">
                                <Sparkles className="w-2.5 h-2.5" /> {item.clasificacion}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2">
                            <button 
                              type="button"
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
                              type="button"
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
                          
                          {rates && item.precio_usd && (
                            <div className="flex flex-col items-center gap-0.5 mt-1">
                              <div className="flex items-center gap-1 text-[10px] text-blue-400 font-bold bg-blue-500/5 px-1.5 rounded border border-blue-500/10" title="Precio calculado a tasa BCV">
                                <span>BCV: Bs. {(((item.precio_bs || 0) * (rates.bcv || 0)) || 0).toFixed(2)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-orange-400 font-bold bg-orange-500/5 px-1.5 rounded border border-orange-500/10" title="Precio a tasa Binance">
                                <span>P2P: Bs. {(((item.precio_usd || 0) * (rates.binance || 0)) || 0).toFixed(2)}</span>
                              </div>
                            </div>
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
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
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
                    </Reorder.Item>
                  ))
                )}
              </Reorder.Group>
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
                <Label htmlFor="precio" className="text-xs font-bold uppercase text-muted-foreground">Dólares Divisa</Label>
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
                <Label htmlFor="precio_bs" className="text-xs font-bold uppercase text-muted-foreground">Dólares BCV</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                  <Input 
                    id="precio_bs"
                    type="number"
                    step="0.01"
                    value={form.precio_bs}
                    onChange={e => setForm({...form, precio_bs: parseFloat(e.target.value) || 0})}
                    className="pl-7 bg-background/50 font-bold text-muted-foreground border-primary/20"
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

              <div className="space-y-1.5">
                <Label htmlFor="ubicacion" className="text-xs font-bold uppercase text-muted-foreground">Ubicación Física</Label>
                <Select 
                  value={form.ubicacion} 
                  onValueChange={val => setForm({...form, ubicacion: val})}
                >
                  <SelectTrigger id="ubicacion" className="bg-background/50 border-primary/20">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map(loc => (
                      <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clasificacion" className="text-xs font-bold uppercase text-muted-foreground">Clasificación</Label>
                <Select 
                  value={form.clasificacion} 
                  onValueChange={val => setForm({...form, clasificacion: val})}
                >
                  <SelectTrigger id="clasificacion" className="bg-background/50 border-primary/20">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATIONS.map(cls => (
                      <SelectItem key={cls.value} value={cls.value}>{cls.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
