'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, TrendingUp, Calendar, AlertCircle, Trash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

interface VentaSilenciador {
  id: string;
  fecha: string;
  cantidad: number;
  modelo: string | null;
  notas: string | null;
  created_at: string;
}

export default function SilenciadoresPage() {
  const [ventas, setVentas] = useState<VentaSilenciador[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [modelo, setModelo] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(true);

  // States for delete
  const deleteVenta = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro?')) return;
    if (!supabase) return;
    const { error } = await withSedeFilter(supabase.from('ventas_silenciadores')).delete().eq('id', id);
    if (!error) {
      setVentas(prev => prev.filter(v => v.id !== id));
      fetchVentas();
    } else {
      alert('Error eliminando la venta.');
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
      .select('*')
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

    let hoyCount = 0;
    let semanaCount = 0;

    data?.forEach(v => {
      const vDate = new Date(v.fecha);
      if (vDate >= hoyDate) hoyCount += v.cantidad;
      if (vDate >= hace7Dias) semanaCount += v.cantidad;
    });

    setHoy(hoyCount);
    setSemana(semanaCount);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVentas();
    
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
    if (cantidad <= 0) return alert("La cantidad debe ser mayor a 0");

    setIsAdding(true);
    const { error } = await withSedeFilter(supabase.from('ventas_silenciadores')).insert(withSedeInsert({
      cantidad,
      modelo: modelo.trim() || null,
      notas: notas.trim() || null,
      fecha: new Date().toISOString()
    }));

    if (error) {
      console.error('Error adding:', error);
      alert('Hubo un error al registrar la venta.');
    } else {
      setCantidad(1);
      setModelo('');
      setNotas('');
      await fetchVentas();
    }
    setIsAdding(false);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow">Ventas de Silenciadores</span>
            <Package className="w-6 h-6 text-primary animate-float" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Registra y monitorea las ventas de escapes y silenciadores</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card stat-card rounded-2xl p-5 border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Vendidos Hoy</p>
              <p className="text-3xl font-bold text-foreground">
                {loading ? '...' : hoy}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card stat-card rounded-2xl p-5 border border-border/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Últimos 7 Días</p>
              <p className="text-3xl font-bold text-foreground">
                {loading ? '...' : semana}
              </p>
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
                  <label className="text-xs font-semibold text-muted-foreground">Cantidad Vendida</label>
                  <input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={e => setCantidad(parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-semibold"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Modelo (Opcional)</label>
                  <input
                    type="text"
                    value={modelo}
                    onChange={e => setModelo(e.target.value)}
                    placeholder="Ej. CL40, Flowmaster"
                    className="w-full rounded-xl bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Notas (Opcional)</label>
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
                    "w-full rounded-xl py-2.5 px-4 font-semibold text-sm transition-all text-white relative overflow-hidden group",
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
                        <th className="px-4 py-3 rounded-tl-lg">Fecha</th>
                        <th className="px-4 py-3">Cantidad</th>
                        <th className="px-4 py-3">Modelo</th>
                        <th className="px-4 py-3">Notas</th>
                        <th className="px-4 py-3 rounded-tr-lg w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((v) => (
                        <tr key={v.id} className="border-b border-border/30 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(v.fecha).toLocaleString('es-VE', { 
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                            })}
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
