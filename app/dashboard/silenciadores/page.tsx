'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, TrendingUp, Calendar, AlertCircle, Trash, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { updateInventarioStock } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface VentaSilenciador {
  id: string;
  fecha: string;
  cantidad: number;
  modelo: string | null;
  notas: string | null;
  sede_id: string;
  created_at: string;
  sede?: { nombre: string };
}

interface ProductoInventario {
  id: string;
  nombre: string;
  stock: number;
  categoria: string;
}

export default function SilenciadoresPage() {
  const [ventas, setVentas] = useState<VentaSilenciador[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [selectedProductoId, setSelectedProductoId] = useState('');
  const [selectedSedeId, setSelectedSedeId] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [globalSedeFilter, setGlobalSedeFilter] = useState<string>('all');

  const { currentSede, canViewAll } = useSedeStore();

  // States for delete
  const deleteVenta = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro? (Esto NO devolverá el stock automáticamente)')) return;
    if (!supabase) return;
    const { error } = await withSedeFilter(supabase.from('ventas_silenciadores')).delete().eq('id', id);
    if (!error) {
      setVentas(prev => prev.filter(v => v.id !== id));
      fetchVentas();
    } else {
      alert('Error eliminando la venta.');
    }
  };

  const fetchProductosSedes = async () => {
    if (!supabase) return;
    
    // Fetch products (Silenciadores and Resonadores)
    const { data: prodData } = await withSedeFilter(supabase.from('inventario'))
      .select('id, nombre, stock, categoria')
      .in('categoria', ['silenciador', 'resonador'])
      .eq('activo', true)
      .order('nombre');
    
    if (prodData) setProductos(prodData);

    // Fetch sedes
    const { data: sedeData } = await supabase.from('sedes').select('*').order('nombre');
    if (sedeData) {
      setSedes(sedeData);
      if (!selectedSedeId && currentSede) {
        setSelectedSedeId(currentSede.id);
      }
    }
  };

  // Stats
  const [hoy, setHoy] = useState(0);
  const [semana, setSemana] = useState(0);

  const fetchVentas = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    
    // Traer todos los registros del ultimo mes para metrics rapidas
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const { data: rawData, error } = await supabase
      .from('ventas_silenciadores')
      .select(`
        *,
        sede:sedes(nombre)
      `)
      .gte('fecha', last30Days.toISOString())
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error fetching ventas:', error);
      setLoading(false);
      return;
    }

    const data = rawData as VentaSilenciador[];
    setVentas(data || []);

    const hoyDate = new Date();
    hoyDate.setHours(0,0,0,0);
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    const filteredData = globalSedeFilter === 'all' 
      ? data 
      : data.filter(v => v.sede_id === globalSedeFilter);

    let hoyCount = 0;
    let semanaCount = 0;

    filteredData?.forEach(v => {
      const vDate = new Date(v.fecha);
      if (vDate >= hoyDate) hoyCount += v.cantidad;
      if (vDate >= hace7Dias) semanaCount += v.cantidad;
    });

    setHoy(hoyCount);
    setSemana(semanaCount);
    setLoading(false);
  }, [globalSedeFilter]);

  useEffect(() => {
    fetchVentas();
    fetchProductosSedes();
    
    // Realtime subscription
    if (!supabase) return;
    const channel = supabase.channel('ventas_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas_silenciadores' }, () => {
        fetchVentas();
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [fetchVentas]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (!selectedProductoId) return alert("Por favor selecciona un producto");
    if (cantidad <= 0) return alert("La cantidad debe ser mayor a 0");

    const producto = productos.find(p => p.id === selectedProductoId);
    if (!producto) return alert("Producto no encontrado");

    if (producto.stock < cantidad) {
      if (!confirm(`Stock insuficiente (${producto.stock}). ¿Deseas registrar la venta de todos modos?`)) return;
    }

    setIsAdding(true);
    try {
      // 1. Insert sale
      const { error: saleError } = await supabase.from('ventas_silenciadores').insert({
        cantidad,
        modelo: producto.nombre,
        notas: notas.trim() || null,
        fecha: new Date().toISOString(),
        sede_id: selectedSedeId || currentSede?.id
      });

      if (saleError) throw saleError;

      // 2. Update Inventory Stock
      const newStock = Math.max(0, producto.stock - cantidad);
      await updateInventarioStock(selectedProductoId, newStock);

      // 3. Reset and Refresh
      setCantidad(1);
      setSelectedProductoId('');
      setNotas('');
      await fetchVentas();
      await fetchProductosSedes();
      alert('Venta registrada y stock actualizado.');
    } catch (error: any) {
      console.error('Error in handleAdd:', error);
      alert('Hubo un error: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow">Ventas de Silenciadores</span>
            <Package className="w-8 h-8 text-primary animate-float" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Control de ventas y stock sincronizado por sede.</p>
        </div>

        {canViewAll() && (
          <div className="flex flex-wrap items-center gap-2 bg-secondary/20 p-1 rounded-2xl border border-border/50">
            <button
              onClick={() => setGlobalSedeFilter('all')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all",
                globalSedeFilter === 'all' 
                  ? "bg-primary text-white shadow-lg shadow-primary/30" 
                  : "text-muted-foreground hover:bg-background/50"
              )}
            >
              Todas
            </button>
            {sedes.map(s => (
              <button
                key={s.id}
                onClick={() => setGlobalSedeFilter(s.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2",
                  globalSedeFilter === s.id 
                    ? "bg-primary text-white shadow-lg shadow-primary/30" 
                    : "text-muted-foreground hover:bg-background/50"
                )}
              >
                <MapPin className={cn("w-3 h-3", globalSedeFilter === s.id ? "text-white" : "text-primary")} />
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card stat-card rounded-2xl p-5 border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Vendidos Hoy</p>
              <p className="text-3xl font-bold text-foreground">
                {loading ? '...' : hoy}
              </p>
              {globalSedeFilter !== 'all' && (
                <p className="text-[9px] text-primary font-bold mt-1 uppercase">Solo Sede Seleccionada</p>
              )}
            </div>
          </div>
        </div>
        <div className="glass-card stat-card rounded-2xl p-5 border border-border/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Últimos 7 Días</p>
              <p className="text-3xl font-bold text-foreground">
                {loading ? '...' : semana}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card stat-card rounded-2xl p-5 border border-green-500/20 bg-green-500/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-green-600">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Sedes Activas</p>
              <p className="text-3xl font-bold text-foreground">{sedes.length}</p>
              <p className="text-[9px] text-green-600 font-bold mt-1 uppercase">Reportando ventas</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario ingreso manual */}
        <div className="lg:col-span-1">
          <Card className="glass-panel border-border/50 bg-card/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Package className="w-32 h-32" />
            </div>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Nuevo Registro Manual
              </CardTitle>
              <CardDescription className="text-xs">
                Añade rápidamente silenciadores vendidos. También puedes pedírselo a la IA.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Producto en Inventario</Label>
                  <Select value={selectedProductoId} onValueChange={setSelectedProductoId}>
                    <SelectTrigger className="bg-background/50 border-primary/20 h-11">
                      <SelectValue placeholder="Selecciona un producto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {productos.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex justify-between items-center w-full gap-4">
                            <span>{p.nombre}</span>
                            <Badge variant={p.stock <= 0 ? "destructive" : "outline"} className="ml-auto text-[10px]">
                              Stock: {p.stock}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                      {productos.length === 0 && (
                        <div className="p-2 text-xs text-muted-foreground text-center">No hay silenciadores en inventario</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cantidad</Label>
                    <input
                      type="number"
                      min="1"
                      value={cantidad}
                      onChange={e => setCantidad(parseInt(e.target.value) || 0)}
                      className="w-full rounded-xl bg-background border border-border px-3 py-2 h-11 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-semibold"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sede</Label>
                    <Select value={selectedSedeId} onValueChange={setSelectedSedeId} disabled={!canViewAll()}>
                      <SelectTrigger className="bg-background/50 border-primary/20 h-11">
                        <SelectValue placeholder="Sede" />
                      </SelectTrigger>
                      <SelectContent>
                        {sedes.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas (Opcional)</Label>
                  <input
                    type="text"
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Detalles adicionales"
                    className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAdding}
                  className={cn(
                    "w-full rounded-xl py-2.5 px-4 font-semibold text-sm transition-all text-white relative overflow-hidden group mt-2",
                    isAdding ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90 active:scale-[0.98]"
                  )}
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out rounded-xl" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isAdding ? 'Registrando...' : <><Plus className="w-4 h-4"/> Registrar Venta</>}
                  </span>
                </button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Historial Reciente */}
        <div className="lg:col-span-2">
          <Card className="glass-panel border-border/50 bg-card/40 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Historial Reciente (Últimos 30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-10 text-muted-foreground animate-pulse text-sm">Cargando datos...</div>
              ) : ventas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Aún no hay ventas registradas.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Fecha / Sede</th>
                        <th className="px-4 py-3">Cantidad</th>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Notas</th>
                        <th className="px-4 py-3 rounded-tr-lg w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas
                        .filter(v => globalSedeFilter === 'all' || v.sede_id === globalSedeFilter)
                        .map((v) => (
                        <tr key={v.id} className="border-b border-border/30 hover:bg-white/5 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                {new Date(v.fecha).toLocaleString('es-VE', { 
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                                })}
                              </span>
                              <div className="flex items-center gap-1.5 mt-1">
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 rounded-md bg-primary/10 text-primary border-primary/20 uppercase font-bold">
                                  <MapPin className="w-2.5 h-2.5 mr-1" />
                                  {v.sede?.nombre || 'Sede'}
                                </Badge>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center justify-center bg-primary/20 text-primary font-bold px-2.5 py-0.5 rounded-full">
                              +{v.cantidad}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">{v.modelo || '-'}</td>
                          <td className="px-4 py-3 text-xs opacity-70 truncate max-w-[200px]">{v.notas || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => deleteVenta(v.id)} className="p-1.5 hover:bg-red-500/20 hover:text-red-500 text-muted-foreground rounded-lg transition-colors" title="Eliminar">
                              <Trash className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
