'use client';

import {
  Banknote, Calendar, Car, ClipboardList, Gauge, MessageSquare, Package,
  PieChart, Receipt, TrendingUp, Users, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { GraficoDona, GraficoSerie, Kpi, Lista, Medidor, SinDatos, type ItemLista, type Punto } from './renders';
import type { WidgetDefinition, WidgetVisual } from './types';

/* ── utilidades de fecha ───────────────────────────────────────────────── */

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hoy(): string {
  return isoDia(new Date());
}

function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDia(d);
}

function inicioDeMes(): string {
  const d = new Date();
  return isoDia(new Date(d.getFullYear(), d.getMonth(), 1));
}

function etiquetaCorta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Rellena los días sin registro con cero: si no, la curva miente saltándoselos. */
function serieDiaria(filas: { fecha: string; valor: number }[], dias: number): Punto[] {
  const mapa = new Map<string, number>();
  for (const f of filas) mapa.set(f.fecha, (mapa.get(f.fecha) ?? 0) + f.valor);
  const out: Punto[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const iso = haceDias(i);
    out.push({ etiqueta: etiquetaCorta(iso), valor: mapa.get(iso) ?? 0 });
  }
  return out;
}

function conSede<T>(q: T, sedeId: string | null): T {
  if (!sedeId) return q;
  return (q as { eq: (c: string, v: string) => T }).eq('sede_id', sedeId);
}

const money = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO_TONO: Record<string, ItemLista['tono']> = {
  pendiente: 'warning',
  en_proceso: 'info',
  finalizado: 'success',
  completado: 'success',
  cancelado: 'danger',
  confirmada: 'info',
  completada: 'success',
};

/* ── catálogo ──────────────────────────────────────────────────────────── */

/**
 * Widgets disponibles para el panel.
 *
 * Cada uno trae su propia consulta: el panel solo le pide a la base lo que el
 * usuario puso en pantalla, y sumar uno nuevo no obliga a tocar un cargador
 * central. El precio es una consulta por widget, que a esta escala es más
 * barato que traer todo por si acaso.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WIDGETS: readonly WidgetDefinition<any>[] = [
  {
    id: 'servicios-activos',
    title: 'Servicios activos',
    description: 'Órdenes abiertas en el taller ahora mismo',
    module: 'Taller',
    icon: Wrench,
    permKey: 'servicios',
    defaultSpan: 3, defaultHeight: 'sm', visuals: ['kpi'],
    load: async ({ sedeId }) => {
      if (!supabase) return { total: 0, serie: [] as number[] };
      const q = conSede(
        supabase.from('servicios').select('id', { count: 'exact', head: true })
          .in('estado', ['pendiente', 'en_proceso']),
        sedeId,
      );
      const { count } = await q;
      const { data } = await conSede(
        supabase.from('servicios').select('fecha').gte('fecha', haceDias(13)),
        sedeId,
      );
      const serie = serieDiaria((data ?? []).map(r => ({ fecha: String(r.fecha), valor: 1 })), 14);
      return { total: count ?? 0, serie: serie.map(p => p.valor) };
    },
    render: (d: { total: number; serie: number[] }) => (
      <Kpi valor={d.total.toLocaleString('es-VE')} detalle="en taller ahora" serie={d.serie} tono="brand" />
    ),
  },

  {
    id: 'servicios-categoria',
    title: 'Servicios por categoría',
    description: 'Reparto del trabajo del mes por tipo',
    module: 'Taller',
    icon: PieChart,
    permKey: 'servicios',
    defaultSpan: 4, defaultHeight: 'md', visuals: ['dona', 'barras'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as Punto[];
      const { data } = await conSede(
        supabase.from('servicios').select('tipo').gte('fecha', inicioDeMes()),
        sedeId,
      );
      const cuenta = new Map<string, number>();
      for (const r of data ?? []) {
        const k = (r.tipo as string) || 'Sin clasificar';
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
      }
      return [...cuenta.entries()]
        .map(([etiqueta, valor]) => ({ etiqueta, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 7);
    },
    render: (d: Punto[], v: WidgetVisual) =>
      v === 'barras' ? <GraficoSerie datos={d} visual="barras" /> : <GraficoDona datos={d} />,
  },

  {
    id: 'servicios-serie',
    title: 'Trabajos por día',
    description: 'Órdenes registradas en los últimos 14 días',
    module: 'Taller',
    icon: TrendingUp,
    permKey: 'servicios',
    defaultSpan: 6, defaultHeight: 'md', visuals: ['area', 'linea', 'barras'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as Punto[];
      const { data } = await conSede(
        supabase.from('servicios').select('fecha').gte('fecha', haceDias(13)),
        sedeId,
      );
      return serieDiaria((data ?? []).map(r => ({ fecha: String(r.fecha), valor: 1 })), 14);
    },
    render: (d: Punto[], v: WidgetVisual) => <GraficoSerie datos={d} visual={v} />,
  },

  {
    id: 'ordenes-recientes',
    title: 'Órdenes recientes',
    description: 'Últimos servicios registrados',
    module: 'Taller',
    icon: ClipboardList,
    permKey: 'servicios',
    defaultSpan: 5, defaultHeight: 'md', visuals: ['lista'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as ItemLista[];
      const { data } = await conSede(
        supabase.from('servicios')
          .select('id, tipo, estado, nombre_cliente, placa, costo_final')
          .order('created_at', { ascending: false }).limit(8),
        sedeId,
      );
      return (data ?? []).map(r => ({
        id: String(r.id),
        titulo: (r.nombre_cliente as string) || 'Sin cliente',
        detalle: [r.placa, r.tipo].filter(Boolean).join(' · ') || undefined,
        valor: r.costo_final ? money(Number(r.costo_final)) : String(r.estado ?? ''),
        tono: ESTADO_TONO[String(r.estado)] ?? 'neutral',
      }));
    },
    render: (d: ItemLista[]) => <Lista items={d} />,
  },

  {
    id: 'facturacion-mes',
    title: 'Facturación del mes',
    description: 'Total facturado desde el día 1',
    module: 'Ventas',
    icon: Receipt,
    permKey: 'ventas',
    defaultSpan: 3, defaultHeight: 'sm', visuals: ['kpi'],
    load: async ({ sedeId }) => {
      if (!supabase) return { total: 0, serie: [] as number[] };
      const { data } = await conSede(
        supabase.from('facturas').select('total, fecha_emision').gte('fecha_emision', inicioDeMes()),
        sedeId,
      );
      const filas = (data ?? []).map(r => ({
        fecha: String(r.fecha_emision ?? '').slice(0, 10),
        valor: Number(r.total ?? 0),
      }));
      const total = filas.reduce((s, f) => s + f.valor, 0);
      return { total, serie: serieDiaria(filas, 14).map(p => p.valor) };
    },
    render: (d: { total: number; serie: number[] }) => (
      <Kpi valor={money(d.total)} detalle="facturado este mes" serie={d.serie} tono="success" />
    ),
  },

  {
    id: 'ingresos-serie',
    title: 'Ingresos por día',
    description: 'Cierre diario de los últimos 14 días',
    module: 'Ventas',
    icon: TrendingUp,
    permKey: 'ventas',
    defaultSpan: 8, defaultHeight: 'md', visuals: ['area', 'barras', 'linea'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as Punto[];
      const { data } = await conSede(
        supabase.from('ventas_dia').select('fecha, total_ingresos').gte('fecha', haceDias(13)),
        sedeId,
      );
      return serieDiaria(
        (data ?? []).map(r => ({ fecha: String(r.fecha), valor: Number(r.total_ingresos ?? 0) })),
        14,
      );
    },
    render: (d: Punto[], v: WidgetVisual) => <GraficoSerie datos={d} visual={v} />,
  },

  {
    id: 'ventas-departamento',
    title: 'Ventas por departamento',
    description: 'Reparto del mes entre áreas del taller',
    module: 'Ventas',
    icon: PieChart,
    permKey: 'ventas',
    defaultSpan: 4, defaultHeight: 'md', visuals: ['dona', 'barras'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as Punto[];
      const cols = ['silenciador', 'cauchera', 'alineacion', 'electronica', 'mecanica', 'frenos', 'lavado', 'repuestos'] as const;
      const { data } = await conSede(
        supabase.from('ventas_dia').select(cols.join(',')).gte('fecha', inicioDeMes()),
        sedeId,
      );
      const sumas = new Map<string, number>();
      for (const fila of (data ?? []) as unknown as Record<string, number>[]) {
        for (const c of cols) sumas.set(c, (sumas.get(c) ?? 0) + Number(fila[c] ?? 0));
      }
      return [...sumas.entries()]
        .map(([k, v]) => ({ etiqueta: k.charAt(0).toUpperCase() + k.slice(1), valor: Math.round(v) }))
        .filter(p => p.valor > 0)
        .sort((a, b) => b.valor - a.valor);
    },
    render: (d: Punto[], v: WidgetVisual) =>
      v === 'barras' ? <GraficoSerie datos={d} visual="barras" /> : <GraficoDona datos={d} />,
  },

  {
    id: 'facturas-recientes',
    title: 'Últimas facturas',
    description: 'Emisiones más recientes',
    module: 'Ventas',
    icon: Receipt,
    permKey: 'ventas',
    defaultSpan: 4, defaultHeight: 'md', visuals: ['lista'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as ItemLista[];
      const { data } = await conSede(
        supabase.from('facturas').select('id, correlativo, cliente, total, estado')
          .order('created_at', { ascending: false }).limit(8),
        sedeId,
      );
      return (data ?? []).map(r => ({
        id: String(r.id),
        titulo: (r.cliente as string) || 'Sin cliente',
        detalle: String(r.correlativo ?? ''),
        valor: money(Number(r.total ?? 0)),
        tono: String(r.estado).toLowerCase().includes('pend') ? 'warning' : 'success',
      } as ItemLista));
    },
    render: (d: ItemLista[]) => <Lista items={d} />,
  },

  {
    id: 'clientes-total',
    title: 'Clientes',
    description: 'Total registrado en el sistema',
    module: 'Clientes',
    icon: Users,
    permKey: 'clientes',
    defaultSpan: 3, defaultHeight: 'sm', visuals: ['kpi'],
    load: async () => {
      if (!supabase) return { total: 0, nuevos: 0 };
      const { count } = await supabase.from('clientes').select('id', { count: 'exact', head: true });
      const { count: nuevos } = await supabase.from('clientes')
        .select('id', { count: 'exact', head: true }).gte('created_at', inicioDeMes());
      return { total: count ?? 0, nuevos: nuevos ?? 0 };
    },
    render: (d: { total: number; nuevos: number }) => (
      <Kpi valor={d.total.toLocaleString('es-VE')} detalle={`${d.nuevos} nuevos este mes`} />
    ),
  },

  {
    id: 'vehiculos-total',
    title: 'Vehículos',
    description: 'Carros registrados en el sistema',
    module: 'Clientes',
    icon: Car,
    permKey: 'vehiculos',
    defaultSpan: 3, defaultHeight: 'sm', visuals: ['kpi'],
    load: async () => {
      if (!supabase) return { total: 0 };
      const { count } = await supabase.from('vehiculos').select('id', { count: 'exact', head: true });
      return { total: count ?? 0 };
    },
    render: (d: { total: number }) => (
      <Kpi valor={d.total.toLocaleString('es-VE')} detalle="en el sistema" tono="info" />
    ),
  },

  {
    id: 'citas-hoy',
    title: 'Citas de hoy',
    description: 'Turnos programados para la fecha',
    module: 'Agenda',
    icon: Calendar,
    permKey: 'agenda',
    defaultSpan: 3, defaultHeight: 'sm', visuals: ['kpi'],
    load: async ({ sedeId }) => {
      if (!supabase) return { total: 0 };
      const { count } = await conSede(
        supabase.from('citas').select('id', { count: 'exact', head: true }).eq('fecha', hoy()),
        sedeId,
      );
      return { total: count ?? 0 };
    },
    render: (d: { total: number }) => (
      <Kpi valor={d.total.toLocaleString('es-VE')} detalle="programadas para hoy" tono="info" />
    ),
  },

  {
    id: 'proximas-citas',
    title: 'Próximas citas',
    description: 'Lo que viene en los próximos días',
    module: 'Agenda',
    icon: Calendar,
    permKey: 'agenda',
    defaultSpan: 4, defaultHeight: 'md', visuals: ['lista'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as ItemLista[];
      const { data } = await conSede(
        supabase.from('citas').select('id, fecha, hora, nombre_cliente, vehiculo_info, estado')
          .gte('fecha', hoy()).order('fecha').order('hora').limit(8),
        sedeId,
      );
      return (data ?? []).map(r => ({
        id: String(r.id),
        titulo: (r.nombre_cliente as string) || 'Sin cliente',
        detalle: (r.vehiculo_info as string) || undefined,
        valor: `${String(r.hora ?? '').slice(0, 5)}`,
        tono: ESTADO_TONO[String(r.estado)] ?? 'info',
      } as ItemLista));
    },
    render: (d: ItemLista[]) => <Lista items={d} />,
  },

  {
    id: 'stock-bajo',
    title: 'Stock bajo',
    description: 'Artículos en o por debajo del mínimo',
    module: 'Inventario',
    icon: Package,
    permKey: 'inventario',
    defaultSpan: 4, defaultHeight: 'md', visuals: ['lista'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as ItemLista[];
      const { data } = await conSede(
        supabase.from('inventario').select('id, nombre, stock, stock_minimo, categoria')
          .eq('activo', true).order('stock').limit(40),
        sedeId,
      );
      return (data ?? [])
        .filter(r => Number(r.stock ?? 0) <= Number(r.stock_minimo ?? 0))
        .slice(0, 8)
        .map(r => ({
          id: String(r.id),
          titulo: String(r.nombre ?? ''),
          detalle: (r.categoria as string) || undefined,
          valor: `${Number(r.stock ?? 0)} / ${Number(r.stock_minimo ?? 0)}`,
          tono: Number(r.stock ?? 0) === 0 ? 'danger' : 'warning',
        } as ItemLista));
    },
    render: (d: ItemLista[]) => <Lista items={d} />,
  },

  {
    id: 'inventario-valor',
    title: 'Valor del inventario',
    description: 'Stock por precio de venta',
    module: 'Inventario',
    icon: Banknote,
    permKey: 'inventario',
    defaultSpan: 3, defaultHeight: 'sm', visuals: ['kpi'],
    load: async ({ sedeId }) => {
      if (!supabase) return { total: 0, articulos: 0 };
      const { data } = await conSede(
        supabase.from('inventario').select('stock, precio_usd').eq('activo', true),
        sedeId,
      );
      const total = (data ?? []).reduce((s, r) => s + Number(r.stock ?? 0) * Number(r.precio_usd ?? 0), 0);
      return { total, articulos: (data ?? []).length };
    },
    render: (d: { total: number; articulos: number }) => (
      <Kpi valor={money(d.total)} detalle={`${d.articulos} artículos activos`} tono="success" />
    ),
  },

  {
    id: 'mensajes-hoy',
    title: 'Mensajes de hoy',
    description: 'Entrantes de clientes por hora',
    module: 'WhatsApp',
    icon: MessageSquare,
    permKey: 'whatsapp',
    defaultSpan: 6, defaultHeight: 'md', visuals: ['area', 'barras', 'linea', 'kpi'],
    load: async () => {
      if (!supabase) return { total: 0, serie: [] as Punto[] };
      const desde = `${hoy()}T00:00:00`;
      const { data } = await supabase.from('mensajes_whatsapp')
        .select('created_at').gte('created_at', desde).limit(5000);
      const porHora = new Array(24).fill(0) as number[];
      for (const r of data ?? []) {
        const h = new Date(String(r.created_at)).getHours();
        if (h >= 0 && h < 24) porHora[h] = (porHora[h] ?? 0) + 1;
      }
      return {
        total: (data ?? []).length,
        serie: porHora.map((valor, h) => ({ etiqueta: `${String(h).padStart(2, '0')}h`, valor })),
      };
    },
    render: (d: { total: number; serie: Punto[] }, v: WidgetVisual) =>
      v === 'kpi'
        ? <Kpi valor={d.total.toLocaleString('es-VE')} detalle="mensajes hoy" serie={d.serie.map(p => p.valor)} />
        : <GraficoSerie datos={d.serie} visual={v} />,
  },

  {
    id: 'cuota-whatsapp',
    title: 'Cuota de WhatsApp',
    description: 'Conversaciones gratuitas del mes',
    module: 'WhatsApp',
    icon: Gauge,
    permKey: 'whatsapp',
    defaultSpan: 3, defaultHeight: 'md', visuals: ['medidor', 'kpi'],
    load: async () => {
      if (!supabase) return { usadas: 0 };
      const { count } = await supabase.from('conversaciones')
        .select('id', { count: 'exact', head: true }).gte('created_at', inicioDeMes());
      return { usadas: count ?? 0 };
    },
    render: (d: { usadas: number }, v: WidgetVisual) =>
      v === 'kpi'
        ? <Kpi valor={`${d.usadas}/1000`} detalle="conversaciones del mes" />
        : <Medidor valor={d.usadas} limite={1000} unidad="gratis" />,
  },

  {
    id: 'nomina-semana',
    title: 'Nómina de la semana',
    description: 'Trabajos asignados a técnicos',
    module: 'Nómina',
    icon: Banknote,
    permKey: 'nomina',
    defaultSpan: 4, defaultHeight: 'md', visuals: ['lista'],
    load: async ({ sedeId }) => {
      if (!supabase) return [] as ItemLista[];
      // `comision_usd` es lo que se le paga al tecnico; `monto` no existe en
      // esta tabla y devolvia siempre cero.
      const { data } = await conSede(
        supabase.from('job_assignments')
          .select('id, empleado_nombre, tipo_trabajo, comision_usd, fecha')
          .gte('fecha', haceDias(6)).order('fecha', { ascending: false }).limit(8),
        sedeId,
      );
      return (data ?? []).map(r => ({
        id: String(r.id),
        titulo: (r.empleado_nombre as string) || 'Sin asignar',
        detalle: [r.tipo_trabajo, r.fecha].filter(Boolean).join(' · ') || undefined,
        valor: money(Number(r.comision_usd ?? 0)),
        tono: 'success',
      } as ItemLista));
    },
    render: (d: ItemLista[]) => <Lista items={d} />,
  },
];

export function widgetById(id: string) {
  return WIDGETS.find(w => w.id === id);
}

export { SinDatos };
