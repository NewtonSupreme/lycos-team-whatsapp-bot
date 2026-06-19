'use client';

import React, { useState, useEffect } from 'react';
import { 
  Trash2, RotateCcw, Search, AlertTriangle, 
  RefreshCw, Package, XCircle, Info
} from 'lucide-react';
import { supabase, fetchInventarioPapelera, restaurarInventarioItem, eliminarPermanentePapelera } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';

interface PapeleraItem {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string;
  marca: string | null;
  precio_usd: number | null;
  precio_bs: number | null;
  stock: number;
  stock_minimo: number;
  unidad: string;
  notas: string | null;
  ubicacion: string | null;
  clasificacion: string | null;
  orden: number | null;
  eliminado_por: string | null;
  motivo_eliminacion: string | null;
  fecha_eliminacion: string;
  created_at: string;
}

const CATEGORIES: { value: string; label: string }[] = [
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

export default function InventarioPapeleraPage() {
  const { user } = useAppStore();
  const { isAdmin } = useRolePermissions();
  const [items, setItems] = useState<PapeleraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [mounted, setMounted] = useState(false);

  const [showRestaurarModal, setShowRestaurarModal] = useState(false);
  const [showEliminarModal, setShowEliminarModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PapeleraItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    setMounted(true);
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchInventarioPapelera();
      if (data) setItems(data as PapeleraItem[]);
    } catch (error) {
      console.error('Error loading papelera:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.nombre.toLowerCase().includes(search.toLowerCase()) || 
      (item.codigo?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (item.marca?.toLowerCase() || '').includes(search.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.categoria === categoryFilter;
    
    return matchesSearch && matchesCategory;
  }, [items, search, categoryFilter]);

  const handleRestaurar = async () => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      await restaurarInventarioItem(selectedItem.id);
      
      await logActivity({
        usuario: user?.nombre || 'Sistema',
        modulo: 'Inventario',
        accion: 'Restauró producto',
        detalles: `Restauró "${selectedItem.nombre}" desde la papelera`,
        referencia_tabla: 'inventario'
      });

      setShowRestaurarModal(false);
      setSelectedItem(null);
      loadData();
    } catch (error: any) {
      console.error('Error restaurando item:', error);
      alert(`Error al restaurar: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEliminarPermanente = async () => {
    if (!selectedItem) return;
    if (!isAdmin) return alert('Solo un administrador puede eliminar permanentemente de la papelera.');
    setIsSubmitting(true);
    try {
      await eliminarPermanentePapelera(selectedItem.id);
      
      await logActivity({
        usuario: user?.nombre || 'Sistema',
        modulo: 'Inventario',
        accion: 'Eliminó permanentemente',
        detalles: `Eliminó permanentemente "${selectedItem.nombre}" de la papelera`,
        referencia_tabla: 'inventario_papelera'
      });

      setShowEliminarModal(false);
      setSelectedItem(null);
      loadData();
    } catch (error: any) {
      console.error('Error eliminando permanentemente:', error);
      alert(`Error al eliminar: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRestaurarModal = (item: PapeleraItem) => {
    setSelectedItem(item);
    setShowRestaurarModal(true);
  };

  const openEliminarModal = (item: PapeleraItem) => {
    setSelectedItem(item);
    setShowEliminarModal(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow">Papelera</span>
            <Trash2 className="w-8 h-8 text-red-500 animate-float" />
          </h1>
          <p className="text-muted-foreground mt-1">Productos eliminados del inventario. Solo el administrador puede acceder.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="glass-card bg-red-500/5 border-red-500/20 transition-all hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-500 uppercase tracking-wider">En Papelera</p>
                <p className="text-3xl font-bold mt-1 tracking-tight text-red-500">{items.length}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card bg-orange-500/5 border-orange-500/20 transition-all hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-orange-500 uppercase tracking-wider">Valor Perdido</p>
                <p className="text-3xl font-bold mt-1 tracking-tight text-orange-500">
                  ${items.reduce((acc, i) => acc + ((i.precio_usd || 0) * (i.stock || 0)), 0).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-500 shadow-inner">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden shadow-sm">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Buscar por nombre, código o marca..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-border/50 focus:border-primary/50 transition-all h-11 sm:h-10 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-background/50 border border-border/50 rounded-md px-3 py-2 text-sm h-11 sm:h-10"
              >
                <option value="all">Todas las categorías</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/50 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              <tr>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-center">Stock</th>
                <th className="px-6 py-3 text-center">Precio</th>
                <th className="px-6 py-3 text-center">Eliminado</th>
                <th className="px-6 py-3 text-center">Por</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-10 h-10 text-primary animate-spin opacity-20" />
                      <span className="text-muted-foreground animate-pulse">Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <Trash2 className="w-12 h-12" />
                      <span>La papelera está vacía.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-border/30 hover:bg-white/5 transition-colors">
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
                        {item.motivo_eliminacion && (
                          <span className="text-[10px] text-orange-500 mt-1 flex items-center gap-1">
                            <Info className="w-3 h-3" /> {item.motivo_eliminacion}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={cn(
                          "text-xl font-bold px-3 py-1 rounded-xl shadow-sm min-w-[50px]",
                          item.stock <= 0 ? "bg-red-500/10 text-red-500" : 
                          item.stock <= item.stock_minimo ? "bg-orange-500/10 text-orange-500" :
                          "bg-green-500/10 text-green-500"
                        )}>
                          {item.stock}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase font-bold">Min: {item.stock_minimo} · {item.unidad}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-base font-bold text-primary">
                          ${item.precio_usd?.toFixed(2) || '0.00'}
                        </span>
                        {item.precio_bs && (
                          <span className="text-[10px] text-muted-foreground">
                            Bs. {item.precio_bs.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.fecha_eliminacion)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {item.eliminado_por || 'Sistema'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 border border-transparent hover:border-green-500/20" 
                          onClick={() => openRestaurarModal(item)}
                          title="Restaurar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                            onClick={() => openEliminarModal(item)}
                            title="Eliminar permanentemente (solo admin)"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showRestaurarModal} onOpenChange={setShowRestaurarModal}>
        <DialogContent className="max-w-md glass-panel border-border/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-500" />
              Restaurar Producto
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de restaurar este producto al inventario?
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="font-bold">{selectedItem.nombre}</p>
              <p className="text-sm text-muted-foreground">
                Stock: {selectedItem.stock} {selectedItem.unidad} · ${selectedItem.precio_usd?.toFixed(2)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestaurarModal(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleRestaurar} disabled={isSubmitting} className="bg-green-500 hover:bg-green-500/90">
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Restaurar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEliminarModal} onOpenChange={setShowEliminarModal}>
        <DialogContent className="max-w-md glass-panel border-border/50 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-500">
              <XCircle className="w-5 h-5" />
              Eliminar Permanentemente
            </DialogTitle>
            <DialogDescription className="text-orange-500">
              Esta acción no se puede deshacer. El producto será eliminado de forma permanente.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="font-bold">{selectedItem.nombre}</p>
              <p className="text-sm text-muted-foreground">
                Eliminado el {formatDate(selectedItem.fecha_eliminacion)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEliminarModal(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleEliminarPermanente} disabled={isSubmitting} variant="destructive">
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Eliminar Permanente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}