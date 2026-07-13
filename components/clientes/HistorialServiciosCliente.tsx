'use client';
/**
 * Historial de servicios de un cliente (sección del perfil).
 * Al hacer clic en un servicio se abre el detalle completo:
 * trabajo, tiempos, vehículo, cobro, factura, comprobante y gastos asociados.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Wrench, Loader2, ChevronRight, Car, Clock, Banknote } from 'lucide-react';
import { categoriaLabel } from '@/lib/categorias';
import ServicioDetalleModal from './ServicioDetalleModal';

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  en_proceso: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  en_progreso: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  en_revision: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  completada: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  finalizado: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  cancelado: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

export default function HistorialServiciosCliente({ clienteId }: { clienteId: string }) {
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    if (!supabase || !clienteId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Los servicios viejos (o los creados por el bot) pueden no tener cliente_id.
      // Por eso también se buscan por los vehículos del cliente y se fusionan sin duplicar.
      const { data: vehs } = await supabase
        .from('vehiculos').select('id').eq('cliente_id', clienteId);
      const vehIds = (vehs || []).map((v: any) => v.id);

      const porCliente = supabase
        .from('servicios')
        .select('*, vehiculos(marca, modelo, placa)')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .limit(50);

      const porVehiculo = vehIds.length
        ? supabase
            .from('servicios')
            .select('*, vehiculos(marca, modelo, placa)')
            .in('vehiculo_id', vehIds)
            .order('fecha', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as any[] });

      const [rc, rv] = await Promise.all([porCliente, porVehiculo]);

      const mapa = new Map<string, any>();
      for (const s of [...(rc.data || []), ...((rv as any).data || [])]) {
        if (s?.id) mapa.set(s.id, s);
      }
      const lista = [...mapa.values()].sort(
        (a, b) => String(b.fecha || b.created_at || '').localeCompare(String(a.fecha || a.created_at || ''))
      );
      setServicios(lista);
    } catch (e) {
      console.error('Error cargando historial de servicios:', e);
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { load(); }, [load]);

  const totalFacturado = servicios.reduce(
    (s, x) => s + (Number(x.costo_final) || Number(x.total_pagado) || Number(x.costo_estimado) || 0),
    0
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5" /> Historial de servicios ({servicios.length})
        </p>
        {servicios.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            Total: <b className="text-emerald-500">{money(totalFacturado)}</b>
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : servicios.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Este cliente aún no tiene servicios registrados.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
          {servicios.map(s => {
            const monto = Number(s.costo_final) || Number(s.total_pagado) || Number(s.costo_estimado) || 0;
            const veh = s.vehiculo_info || (s.vehiculos ? `${s.vehiculos.marca} ${s.vehiculos.modelo}` : '');
            const placa = s.placa || s.vehiculos?.placa || '';
            const titulo = s.tipo_personalizado || s.descripcion || s.tipo || 'Servicio';

            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="w-full text-left p-2.5 rounded-lg bg-muted/20 border border-border/20 hover:border-primary/40 hover:bg-muted/40 transition-all group flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold truncate">{titulo}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase shrink-0 ${ESTADO_COLOR[s.estado] || ESTADO_COLOR.pendiente}`}>
                      {(s.estado || '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {s.fecha}{s.hora ? ` · ${s.hora}` : ''}
                    </span>
                    {veh && (
                      <span className="flex items-center gap-0.5 truncate">
                        <Car className="w-2.5 h-2.5" /> {veh}
                        {placa && <span className="font-mono uppercase ml-0.5">({placa})</span>}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {categoriaLabel(s.categoria)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {monto > 0 && (
                    <span className="text-xs font-black text-emerald-500 flex items-center gap-0.5">
                      <Banknote className="w-3 h-3" /> {money(monto)}
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ServicioDetalleModal servicio={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
