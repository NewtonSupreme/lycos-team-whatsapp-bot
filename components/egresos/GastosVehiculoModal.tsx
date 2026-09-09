'use client';
/**
 * Gastos asociados a un VEHÍCULO (o cliente).
 *
 * Muestra ingresos (ventas_dia), egresos (egresos) y la UTILIDAD real de ese
 * vehículo, con el detalle de cada gasto: fecha, hora, categoría, a qué servicio
 * pertenece y a quién se le pagó. Permite registrar un gasto nuevo que queda
 * automáticamente asociado al vehículo/cliente y aparece en el panel de Egresos.
 *
 * Se usa desde: Vehículos, Clientes y Servicios.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  X, Plus, Loader2, TrendingUp, TrendingDown, Wallet, Trash2, Car, User, Clock, Wrench, AlertTriangle,
} from 'lucide-react';
import ModalPortal from '@/components/ui/modal-portal';
import { METODOS_PAGO } from '@/lib/categorias';

export interface GastosTarget {
  vehiculo_id?: string | null;
  cliente_id?: string | null;
  servicio_id?: string | null;
  placa?: string | null;
  cliente_nombre?: string | null;
  vehiculo_info?: string | null;
  sede_id?: string | null;
}

const CATEGORIAS_EGRESO = [
  { key: 'repuestos', label: 'Compra de Repuestos' },
  { key: 'insumos', label: 'Insumos / Materiales' },
  { key: 'terceros', label: 'Servicio de Terceros' },
  { key: 'pintura', label: 'Pintura / Latonería' },
  { key: 'herramientas', label: 'Herramientas' },
  { key: 'otro', label: 'Otro gasto' },
];

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GastosVehiculoModal({
  target, onClose, canDelete = false,
}: { target: GastosTarget; onClose: () => void; canDelete?: boolean }) {
  const [egresos, setEgresos] = useState<any[]>([]);
  const [ingresos, setIngresos] = useState(0);
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    categoria: 'repuestos',
    total_egresos: '',
    descripcion: '',
    proveedor: '',
    metodo_pago: 'efectivo_usd',
    servicio_id: target.servicio_id || '',
    fecha: new Date().toISOString().slice(0, 10),
  });

  const qs = new URLSearchParams();
  if (target.vehiculo_id) qs.set('vehiculo', target.vehiculo_id);
  else if (target.cliente_id) qs.set('cliente', target.cliente_id);
  else if (target.placa) qs.set('placa', target.placa);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Egresos del vehículo/cliente
      const r = await fetch(`/api/egresos?${qs.toString()}`);
      const d = await r.json();
      setEgresos(d.egresos || []);

      if (supabase) {
        // Ingresos del vehículo (ventas_dia)
        let vq = supabase.from('ventas_dia').select('total_ingresos');
        if (target.vehiculo_id) vq = vq.eq('vehiculo_id', target.vehiculo_id);
        else if (target.cliente_id) vq = vq.eq('cliente_id', target.cliente_id);
        else if (target.placa) vq = vq.eq('placa', target.placa);
        const { data: vd } = await vq;
        setIngresos((vd || []).reduce((s: number, v: any) => s + (Number(v.total_ingresos) || 0), 0));

        // Servicios del vehículo (para asociar el gasto a una orden concreta)
        let sq = supabase.from('servicios').select('id, fecha, descripcion, tipo, tipo_personalizado, estado');
        if (target.vehiculo_id) sq = sq.eq('vehiculo_id', target.vehiculo_id);
        else if (target.cliente_id) sq = sq.eq('cliente_id', target.cliente_id);
        const { data: sd } = await sq.order('fecha', { ascending: false }).limit(30);
        setServicios(sd || []);
      }
    } catch { /* noop */ }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.vehiculo_id, target.cliente_id, target.placa]);

  useEffect(() => { load(); }, [load]);

  const totalEgresos = egresos.reduce((s, e) => s + (Number(e.total_egresos) || 0), 0);
  const utilidad = ingresos - totalEgresos;

  const guardar = async () => {
    const monto = parseFloat(form.total_egresos);
    if (!monto || monto <= 0) { setErr('Indica el monto del gasto.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/egresos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: form.fecha,
          categoria: form.categoria,
          total_egresos: monto,
          proveedor: form.proveedor || null,
          cliente: form.proveedor || null,      // compat: la columna `cliente` es "pagado a"
          metodo_pago: form.metodo_pago,
          notas: form.descripcion || null,
          desglose: form.descripcion
            ? [{ descripcion: form.descripcion, cantidad: 1, precio_unitario: monto, total: monto }]
            : [],
          servicio_id: form.servicio_id || null,
          vehiculo_id: target.vehiculo_id || null,
          cliente_id: target.cliente_id || null,
          cliente_nombre: target.cliente_nombre || null,
          vehiculo_info: target.vehiculo_info || null,
          placa: target.placa || null,
          sede_id: target.sede_id || null,
          origen: 'panel',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setForm(f => ({ ...f, total_egresos: '', descripcion: '', proveedor: '' }));
      setShowForm(false);
      load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    const r = await fetch(`/api/egresos/${id}`, { method: 'DELETE' });
    if (r.ok) load(); else alert((await r.json()).error);
  };

  const servicioLabel = (id: string | null) => {
    if (!id) return null;
    const s = servicios.find(x => x.id === id);
    if (!s) return 'Servicio';
    return `${s.tipo_personalizado || s.tipo || 'Servicio'} · ${s.fecha || ''}`;
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-rose-500" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-lg leading-tight truncate">Gastos del vehículo</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                {target.placa && <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {target.placa}</span>}
                {target.vehiculo_info && <span className="truncate">{target.vehiculo_info}</span>}
                {target.cliente_nombre && <span className="flex items-center gap-1 truncate"><User className="w-3 h-3" /> {target.cliente_nombre}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {/* Utilidad */}
        <div className="grid grid-cols-3 gap-2 p-4 border-b border-border/30 shrink-0">
          <Stat icon={TrendingUp} label="Ingresos" value={money(ingresos)} color="text-emerald-500" />
          <Stat icon={TrendingDown} label="Egresos" value={money(totalEgresos)} color="text-rose-500" />
          <Stat icon={Wallet} label="Utilidad" value={money(utilidad)} color={utilidad >= 0 ? 'text-blue-500' : 'text-red-500'} highlight />
        </div>

        {/* Contenido */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {egresos.length} gasto(s) registrado(s)
            </span>
            <button onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600">
              <Plus className="w-3.5 h-3.5" /> Agregar gasto
            </button>
          </div>

          {/* Formulario */}
          {showForm && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="h-9 rounded-lg border border-border bg-background/60 px-2 text-sm">
                  {CATEGORIAS_EGRESO.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Monto ($)" value={form.total_egresos}
                  onChange={e => setForm(f => ({ ...f, total_egresos: e.target.value }))}
                  className="h-9 rounded-lg border border-border bg-background/60 px-2 text-sm font-bold text-rose-500" />
              </div>
              <input placeholder="Descripción del gasto (ej: 2 pastillas de freno)" value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                className="w-full h-9 rounded-lg border border-border bg-background/60 px-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Pagado a (proveedor)" value={form.proveedor}
                  onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                  className="h-9 rounded-lg border border-border bg-background/60 px-2 text-sm" />
                <select value={form.metodo_pago} onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))}
                  className="h-9 rounded-lg border border-border bg-background/60 px-2 text-sm">
                  {METODOS_PAGO.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.servicio_id} onChange={e => setForm(f => ({ ...f, servicio_id: e.target.value }))}
                  className="h-9 rounded-lg border border-border bg-background/60 px-2 text-sm">
                  <option value="">— Sin servicio asociado —</option>
                  {servicios.map(s => (
                    <option key={s.id} value={s.id}>
                      {(s.tipo_personalizado || s.tipo || 'Servicio')} · {s.fecha}
                    </option>
                  ))}
                </select>
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  className="h-9 rounded-lg border border-border bg-background/60 px-2 text-sm" />
              </div>
              {err && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {err}</p>}
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 h-9 rounded-lg border border-border text-sm font-medium hover:bg-muted/50">Cancelar</button>
                <button onClick={guardar} disabled={saving}
                  className="flex-1 h-9 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold flex items-center justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar gasto'}
                </button>
              </div>
            </div>
          )}

          {/* Lista de gastos */}
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : egresos.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <Wallet className="w-9 h-9 mx-auto mb-2 opacity-20" />
              Sin gastos asociados a este vehículo todavía.
            </div>
          ) : (
            <div className="space-y-2">
              {egresos.map(e => (
                <div key={e.id} className="rounded-xl border border-border bg-muted/20 p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">
                        {e.notas || e.desglose?.[0]?.descripcion || 'Gasto'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 font-bold uppercase">
                        {CATEGORIAS_EGRESO.find(c => c.key === e.categoria)?.label || e.categoria}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {e.fecha}{e.hora ? ` · ${e.hora}` : ''}
                      </span>
                      {e.servicio_id && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Wrench className="w-3 h-3" /> {servicioLabel(e.servicio_id)}
                        </span>
                      )}
                      {(e.proveedor || e.cliente) && <span>Pagado a: {e.proveedor || e.cliente}</span>}
                      {e.origen === 'bot' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 font-bold">BOT</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-black text-rose-500">-{money(Number(e.total_egresos))}</span>
                    {canDelete && (
                      <button onClick={() => eliminar(e.id)} className="text-muted-foreground hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function Stat({ icon: Icon, label, value, color, highlight }: any) {
  return (
    <div className={`rounded-xl border p-2.5 ${highlight ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`w-3 h-3 ${color}`} /> {label}
      </div>
      <div className={`text-base font-black mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
