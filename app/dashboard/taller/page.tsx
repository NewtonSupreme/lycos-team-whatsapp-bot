'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wrench, Loader2, RefreshCw, Car, Trash } from 'lucide-react';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

interface RowServicio {
  id: string;
  descripcion: string;
  tipo: string;
  estado: string;
  costo_estimado: number | null;
  created_at: string;
}

export default function TallerPage() {
  const [servicios, setServicios] = useState<RowServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  // Form states
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('mecanica');
  const [estado, setEstado] = useState('en_proceso');

  const deleteTrabajo = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro?')) return;
    if (!supabase) return;
    const { error } = await withSedeFilter(supabase.from('servicios')).delete().eq('id', id);
    if (!error) {
      setServicios(prev => prev.filter(s => s.id !== id));
      fetchTrabajos();
    } else {
      alert('Error al eliminar registro');
    }
  };

  const fetchTrabajos = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('servicios')
      .select('id, descripcion, tipo, estado, costo_estimado, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (!error && data) {
      setServicios(data as RowServicio[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrabajos();
  }, [fetchTrabajos]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('taller-servicios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicios' }, () => {
        fetchTrabajos();
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [fetchTrabajos]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (!descripcion.trim()) return;

    setRegistering(true);
    const { error } = await withSedeFilter(supabase.from('servicios')).insert(withSedeInsert({
      descripcion,
      tipo,
      estado,
    }));

    setRegistering(false);
    if (!error) {
      setDescripcion('');
      fetchTrabajos();
    } else {
      console.error(error);
      alert('Error registrando el trabajo en taller.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Trabajos de Taller</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestión de carros que entran y salen / Servicios</p>
        </div>
        <button
          onClick={fetchTrabajos}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-border/30 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulario Manual */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Car className="w-5 h-5 text-blue-400" />
              Nuevo Trabajo
            </CardTitle>
            <CardDescription className="text-xs">Registro manual de servicio</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Descripción del trabajo</label>
                <input
                  required
                  type="text"
                  placeholder="Ej: Cambio de aceite, Reparación de frenos..."
                  className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo</label>
                  <select
                    className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                  >
                    <option value="mecanica">Mecánica</option>
                    <option value="electronica">Electrónica</option>
                    <option value="diagnostico">Diagnóstico</option>
                    <option value="cerrajeria">Cerrajería</option>
                    <option value="motor">Motor</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Estado</label>
                  <select
                    className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={estado}
                    onChange={e => setEstado(e.target.value)}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en_proceso">En Proceso</option>
                    <option value="completado">Completado</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full mt-2 bg-blue-500/20 text-blue-400 font-semibold py-2 rounded-lg border border-blue-400/30 hover:bg-blue-500/30 transition-colors flex justify-center items-center gap-2 text-sm disabled:opacity-50"
              >
                {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                Registrar Trabajo
              </button>
            </form>
          </CardContent>
        </Card>

        {/* Historial Reciente */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Historial Reciente</CardTitle>
            <CardDescription className="text-xs">Últimos trabajos registrados en taller</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : servicios.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                <Car className="w-8 h-8 opacity-20 mb-2" />
                No hay servicios registrados recientemente
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border/30">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicios.map((s) => (
                      <tr key={s.id} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{s.descripcion}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-muted/50 text-muted-foreground border border-border/50">
                            {s.tipo || 'General'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm border
                            ${s.estado === 'completado' ? 'bg-green-500/20 text-green-400 border-green-500/20' : 
                              s.estado === 'en_proceso' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 
                              'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
                            {s.estado.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => deleteTrabajo(s.id)} className="p-1.5 hover:bg-red-500/20 hover:text-red-500 text-muted-foreground rounded-lg transition-colors" title="Eliminar">
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
  );
}
