'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Award, Building2, CheckCircle2, ClipboardList, ExternalLink,
  Loader2, Package, Pencil, Phone, Plus, RefreshCw, Search, Star,
  Trash2, Truck, Wallet,
} from 'lucide-react';
import {
  Avisos, Chip, Panel, Pestanas, TarjetaKpi, Vacio,
} from '@/components/panel/Piezas';
import ModalProveedor from '@/components/proveedores/ModalProveedor';
import ModalOrdenCompra from '@/components/proveedores/ModalOrdenCompra';
import ModalEvaluacion from '@/components/proveedores/ModalEvaluacion';
import CuentasPorPagar from '@/components/proveedores/CuentasPorPagar';
import { useModales } from '@/components/ui/modales';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { cn } from '@/lib/utils';
import type {
  CompraFila, OrdenCompraFila, PanelProveedores, ProveedorFila,
} from '@/lib/proveedores/tipos';

/**
 * Proveedores: a quién le compramos, cuánto le debemos y qué está por llegar.
 *
 * Todo sale de una sola llamada a `/api/proveedores/panel`. Es a propósito: la
 * pantalla cruza compras, deudas y órdenes, y pedir cada bloque por su lado
 * dejaba los totales en desacuerdo mientras cargaban —el indicador de arriba
 * decía una cifra y la tabla de abajo otra—.
 *
 * Una compra vive en dos sitios distintos según de dónde venga: el repuesto
 * comprado para un carro concreto está en la ficha de ese carro, y la compra
 * suelta en los egresos. Aquí se juntan por primera vez, que es lo que permite
 * preguntar «¿cuánto le compramos a este señor?» y que la respuesta sea cierta.
 */

type Pestana = 'lista' | 'productos' | 'ordenes' | 'historial' | 'pagos' | 'evaluaciones';

const PESTANAS = [
  { valor: 'lista' as const, label: 'Lista' },
  { valor: 'productos' as const, label: 'Productos' },
  { valor: 'ordenes' as const, label: 'Órdenes de compra' },
  { valor: 'historial' as const, label: 'Historial' },
  { valor: 'pagos' as const, label: 'Cuentas por pagar' },
  { valor: 'evaluaciones' as const, label: 'Evaluaciones' },
] as const;

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaCorta = (s: string | null) => {
  if (!s) return '—';
  const t = String(s);
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
};

/** El montón de compras a las que nadie les puso proveedor. No es un proveedor. */
const ANONIMO = '~SIN PROVEEDOR';
const esAnonimo = (p: ProveedorFila) => p.id === ANONIMO;
/** Un nombre escrito a mano en una compra, que no está en el catálogo. */
const esSuelto = (p: ProveedorFila) => p.id.startsWith('~') && !esAnonimo(p);

const ESTADO_ORDEN: Record<string, { label: string; tono: 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro' }> = {
  borrador: { label: 'Borrador', tono: 'neutro' },
  pendiente: { label: 'Pendiente', tono: 'aviso' },
  parcial: { label: 'Llegó a medias', tono: 'info' },
  recibida: { label: 'Recibida', tono: 'exito' },
  cancelada: { label: 'Cancelada', tono: 'peligro' },
};

export default function ProveedoresPage() {
  const { can } = useRolePermissions();
  const sedeId = useSedeStore(s => s.currentSede?.id);
  const { confirmar, error: avisarError } = useModales();

  const [datos, setDatos] = useState<PanelProveedores | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pestana, setPestana] = useState<Pestana>('lista');
  const [busqueda, setBusqueda] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [categoria, setCategoria] = useState('');

  const [editando, setEditando] = useState<{ abierto: boolean; proveedor: ProveedorFila | null } | null>(null);
  const [ordenNueva, setOrdenNueva] = useState<{ abierto: boolean; proveedor: string | null } | null>(null);
  const [evaluando, setEvaluando] = useState<ProveedorFila | null>(null);

  const puedeEditar = can('vehiculos', 'editar');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (sedeId) p.set('sede', sedeId);
      const r = await fetch(`/api/proveedores/panel?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'No se pudo cargar Proveedores.');
      setDatos(d as PanelProveedores);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setCargando(false);
    }
  }, [sedeId]);

  useEffect(() => { cargar(); }, [cargar]);

  const categorias = useMemo(() => {
    const s = new Set<string>();
    (datos?.proveedores || []).forEach(p => { if (p.categoria) s.add(p.categoria); });
    return [...s].sort();
  }, [datos]);

  const proveedores = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos?.proveedores || []).filter(p => {
      if (soloActivos && !p.activo) return false;
      if (categoria && p.categoria !== categoria) return false;
      if (!q) return true;
      return [p.nombre, p.rif, p.categoria, p.contacto, p.telefono]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [datos, busqueda, soloActivos, categoria]);

  /**
   * Qué le compramos a cada proveedor.
   *
   * No sale de un catálogo —el inventario no guarda de quién vino cada pieza—
   * sino de lo que de verdad se le ha comprado. Es más fiable que una lista
   * mantenida a mano: aquí no puede aparecer nada que no se haya comprado.
   */
  const productos = useMemo(() => {
    const m = new Map<string, {
      clave: string; concepto: string; proveedor: string; proveedor_id: string | null;
      veces: number; total: number; ultimoCosto: number; ultimaFecha: string;
    }>();
    for (const c of datos?.compras || []) {
      const clave = `${c.proveedor_id || c.proveedor}|${c.concepto.trim().toLowerCase()}`;
      const x = m.get(clave) || {
        clave, concepto: c.concepto, proveedor: c.proveedor, proveedor_id: c.proveedor_id,
        veces: 0, total: 0, ultimoCosto: 0, ultimaFecha: '',
      };
      x.veces += 1;
      x.total = Math.round((x.total + c.total) * 100) / 100;
      if (c.fecha >= x.ultimaFecha) {
        x.ultimaFecha = c.fecha;
        x.ultimoCosto = Math.round((c.total / Math.max(1, c.cantidad)) * 100) / 100;
      }
      m.set(clave, x);
    }
    const q = busqueda.trim().toLowerCase();
    return [...m.values()]
      .filter(x => !q || x.concepto.toLowerCase().includes(q) || x.proveedor.toLowerCase().includes(q))
      .sort((a, b) => b.total - a.total);
  }, [datos, busqueda]);


  /** Las cinco barras de «compras por proveedor». */
  const barras = useMemo(() => {
    const top = (datos?.proveedores || [])
      .filter(p => p.compradoMes > 0).slice(0, 5);
    const mayor = top[0]?.compradoMes || 1;
    return top.map(p => ({ ...p, pct: Math.round((p.compradoMes / mayor) * 100) }));
  }, [datos]);

  const recibirOrden = async (o: OrdenCompraFila) => {
    const ok = await confirmar({
      titulo: '¿Ya llegó este pedido?',
      mensaje: `${o.correlativo || 'Orden'} · ${o.proveedor} — ${money(o.total)}`,
      detalle: 'Al recibirlo se registra el gasto de la empresa por ese monto, con su '
        + 'fecha y su proveedor, y aparecerá en los reportes del día.',
      confirmar: 'Sí, ya llegó',
    });
    if (!ok) return;

    const r = await fetch(`/api/proveedores/ordenes/${o.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'recibida' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { await avisarError(d.error || 'No se pudo recibir la orden'); return; }
    if (d.avisos?.length) await avisarError(d.avisos.join(' '));
    cargar();
  };

  const cancelarOrden = async (o: OrdenCompraFila) => {
    const ok = await confirmar({
      tipo: 'peligro',
      titulo: '¿Cancelar este pedido?',
      mensaje: `${o.correlativo || 'Orden'} · ${o.proveedor} — ${money(o.total)}`,
      detalle: 'Si ya había generado un gasto, se retira: sería un costo por algo que '
        + 'nunca llegó.',
      confirmar: 'Sí, cancelar',
    });
    if (!ok) return;

    const r = await fetch(`/api/proveedores/ordenes/${o.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'cancelada' }),
    });
    if (!r.ok) { await avisarError((await r.json()).error || 'No se pudo cancelar'); return; }
    cargar();
  };

  const darDeBaja = async (p: ProveedorFila) => {
    const ok = await confirmar({
      tipo: 'peligro',
      titulo: `¿Dar de baja a ${p.nombre}?`,
      mensaje: 'Dejará de salir en las listas y no se podrá elegir en compras nuevas.',
      detalle: 'No se borra: sus compras y deudas siguen en el historial, porque '
        + 'borrarlo dejaría gastos ya registrados sin decir a quién se le compraron.',
      confirmar: 'Sí, dar de baja',
    });
    if (!ok) return;

    const r = await fetch(`/api/proveedores/${p.id}`, { method: 'DELETE' });
    if (!r.ok) { await avisarError((await r.json()).error || 'No se pudo dar de baja'); return; }
    cargar();
  };

  if (!can('vehiculos', 'leer')) {
    return (
      <div className="mx-auto max-w-[1600px] p-4">
        <Vacio
          icono={<Truck className="h-8 w-8" aria-hidden />}
          titulo="Sin acceso a Proveedores"
          detalle="Este módulo lo ve quien tiene permiso de Vehículos. Pídelo a administración."
        />
      </div>
    );
  }

  const k = datos?.kpis;

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 pb-10">
      {/* ── Cabecera ───────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-white">
            <Truck className="h-[22px] w-[22px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-[26px] font-black leading-none tracking-tight text-foreground">Proveedores</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              A quién le compras, cuánto le debes y qué está por llegar.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={cargar}
            aria-label="Actualizar"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} aria-hidden />
          </button>
          {puedeEditar && (
            <>
              <button
                onClick={() => setOrdenNueva({ abierto: true, proveedor: null })}
                className="flex h-[38px] items-center gap-1.5 rounded-xl border border-border px-3.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                Nueva orden
              </button>
              <button
                onClick={() => setEditando({ abierto: true, proveedor: null })}
                className="flex h-[38px] items-center gap-1.5 rounded-xl bg-[#f97316] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c]"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nuevo proveedor
              </button>
            </>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {cargando && !datos && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#f97316]" aria-hidden />
        </div>
      )}

      {datos && (
        <>
          {/* ── Indicadores ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <TarjetaKpi
              icono={<Building2 className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              etiqueta="Total de proveedores"
              valor={String(k!.total)}
              pie={`${k!.activos} con compras registradas`}
            />
            <TarjetaKpi
              icono={<Wallet className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              etiqueta="Compras del mes"
              valor={money(k!.compradoMes)}
              pie={`${k!.comprasMes} compra(s) en ${datos.mes}`}
            />
            <TarjetaKpi
              icono={<ClipboardList className="h-[18px] w-[18px]" aria-hidden />}
              tinte="bg-amber-400/15 text-amber-700 dark:text-amber-300"
              etiqueta="Órdenes pendientes"
              valor={String(k!.ordenesPendientes)}
              pie={k!.ordenesAtrasadas > 0
                ? `${k!.ordenesAtrasadas} pasaron su fecha de entrega`
                : 'Ninguna atrasada'}
            />
            <TarjetaKpi
              icono={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden />}
              tinte={k!.vencido > 0
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : 'bg-muted text-muted-foreground'}
              etiqueta="Se les debe"
              valor={money(k!.porPagar)}
              pie={k!.vencido > 0 ? `${money(k!.vencido)} ya vencidos` : 'Nada vencido'}
            />
          </div>

          <Avisos avisos={datos.avisos} />

          <Pestanas valor={pestana} onCambio={setPestana} opciones={PESTANAS} />

          {/* ── Buscador ─────────────────────────────────────────────────── */}
          {(pestana === 'lista' || pestana === 'productos' || pestana === 'historial') && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, RIF, categoría o teléfono…"
                  aria-label="Buscar proveedor"
                  className="h-[38px] w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[#f97316]"
                />
              </span>

              {pestana === 'lista' && (
                <>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    aria-label="Filtrar por categoría"
                    className="h-[38px] rounded-xl border border-border bg-card px-2.5 text-[12.5px] text-foreground outline-none focus:border-[#f97316]"
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <label className="flex h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[12.5px] text-foreground">
                    <input
                      type="checkbox"
                      checked={soloActivos}
                      onChange={e => setSoloActivos(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#f97316]"
                    />
                    Solo activos
                  </label>
                </>
              )}
            </div>
          )}

          {/* ── Lista ────────────────────────────────────────────────────── */}
          {pestana === 'lista' && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Panel
                titulo={`Proveedores (${proveedores.length})`}
                subtitulo="Ordenados por lo que se les ha comprado este mes."
                sinRelleno
              >
                {proveedores.length === 0 ? (
                  <Vacio
                    icono={<Truck className="h-8 w-8" aria-hidden />}
                    titulo="Ningún proveedor con estos filtros"
                    detalle={datos.proveedores.length === 0
                      ? 'Todavía no hay nadie en el catálogo. Al anotar el costo de un '
                        + 'repuesto en la ficha de un carro puedes darlo de alta desde ahí.'
                      : 'Prueba a quitar el filtro de categoría o el de «solo activos».'}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] border-collapse">
                      <thead>
                        <tr className="border-y border-border bg-muted/40">
                          <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Proveedor</th>
                          <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Categoría</th>
                          <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Contacto</th>
                          <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Condiciones</th>
                          <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Mes</th>
                          <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Se le debe</th>
                          <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">Nota</th>
                          {puedeEditar && <th scope="col" className="px-3.5 py-2 text-right text-[11px] font-semibold text-muted-foreground">Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {proveedores.map(p => (
                          <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                            <td className="px-3.5 py-2.5">
                              <span className="flex items-center gap-1.5">
                                <span className={cn(
                                  'truncate text-[12.5px] font-semibold',
                                  esAnonimo(p) ? 'italic text-muted-foreground' : 'text-foreground',
                                )}>
                                  {esAnonimo(p) ? 'Compras sin proveedor anotado' : p.nombre}
                                </span>
                                {esAnonimo(p) && <Chip tono="peligro">Falta el dato</Chip>}
                                {esSuelto(p) && <Chip tono="aviso">Sin dar de alta</Chip>}
                                {!p.activo && <Chip tono="neutro">De baja</Chip>}
                              </span>
                              <span className="block text-[10.5px] text-muted-foreground tabular-nums">
                                {esAnonimo(p)
                                  ? 'Sin saber a quién se le compró no hay garantía que reclamar'
                                  : `${p.rif || 'sin RIF'} · ${p.compras} compra(s)`}
                                {!esAnonimo(p) && p.ultimaCompra && ` · última ${fechaCorta(p.ultimaCompra)}`}
                              </span>
                            </td>

                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                              {p.categoria || <span className="text-muted-foreground/50">—</span>}
                            </td>

                            <td className="px-3 py-2.5">
                              {p.telefono ? (
                                <a href={`tel:${p.telefono}`} className="flex items-center gap-1 text-[12px] text-foreground hover:underline tabular-nums">
                                  <Phone className="h-3 w-3 text-muted-foreground" aria-hidden />
                                  {p.telefono}
                                </a>
                              ) : (
                                <span className="text-[11.5px] text-amber-700 dark:text-amber-400">Sin teléfono</span>
                              )}
                              {p.contacto && (
                                <span className="block text-[10.5px] text-muted-foreground">{p.contacto}</span>
                              )}
                            </td>

                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                              {p.condiciones_pago || (p.dias_credito > 0 ? `Crédito ${p.dias_credito} días` : 'Contado')}
                            </td>

                            <td className="px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground tabular-nums">
                              {p.compradoMes > 0 ? money(p.compradoMes) : <span className="text-muted-foreground/50">—</span>}
                            </td>

                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {p.saldo > 0 ? (
                                <>
                                  <span className="text-[12.5px] font-bold text-red-600 dark:text-red-400">{money(p.saldo)}</span>
                                  {p.vencido > 0 && (
                                    <span className="block text-[10px] font-semibold text-red-600 dark:text-red-400">
                                      {money(p.vencido)} vencido
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[12px] text-emerald-600 dark:text-emerald-400">Al día</span>
                              )}
                            </td>

                            <td className="px-3 py-2.5 text-center">
                              {p.calificacion != null ? (
                                <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                  <Star className="h-3 w-3 fill-current" aria-hidden />
                                  {p.calificacion}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground/50">sin evaluar</span>
                              )}
                            </td>

                            {puedeEditar && (
                              <td className="px-3.5 py-2.5">
                                {/* El montón «sin proveedor» no se pide, ni se
                                    evalúa, ni se da de alta: no es nadie. Se
                                    arregla anotando el proveedor en cada compra. */}
                                {esAnonimo(p) ? (
                                  <p className="text-right text-[11px] text-muted-foreground">
                                    Anótalo en cada compra
                                  </p>
                                ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setOrdenNueva({ abierto: true, proveedor: esSuelto(p) ? null : p.id })}
                                    title="Registrar un pedido a este proveedor"
                                    aria-label={`Nueva orden para ${p.nombre}`}
                                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                                  >
                                    <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                  {!p.id.startsWith('~') && (
                                    <button
                                      onClick={() => setEvaluando(p)}
                                      title="Evaluar a este proveedor"
                                      aria-label={`Evaluar a ${p.nombre}`}
                                      className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border text-amber-600 hover:bg-amber-400/10"
                                    >
                                      <Star className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setEditando({ abierto: true, proveedor: p })}
                                    title={p.id.startsWith('~') ? 'Darlo de alta en el catálogo' : 'Editar'}
                                    aria-label={`Editar ${p.nombre}`}
                                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                  {!p.id.startsWith('~') && p.activo && (
                                    <button
                                      onClick={() => darDeBaja(p)}
                                      title="Dar de baja"
                                      aria-label={`Dar de baja a ${p.nombre}`}
                                      className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border text-red-600 hover:bg-red-500/10"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                  )}
                                </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Columna lateral */}
              <div className="space-y-3">
                <Panel titulo="Proveedor destacado" subtitulo="El que más volumen mueve este mes.">
                  {datos.destacado ? (
                    <div>
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-400">
                          <Award className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-bold text-foreground">{datos.destacado.nombre}</p>
                          <p className="text-[11.5px] text-muted-foreground">
                            {datos.destacado.categoria || 'Sin categoría'} · {datos.destacado.compras} compra(s)
                          </p>
                        </div>
                      </div>
                      <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[12px]">
                        <div className="rounded-xl bg-muted/50 px-2.5 py-2">
                          <dt className="text-[10.5px] text-muted-foreground">Este mes</dt>
                          <dd className="text-[15px] font-extrabold text-foreground tabular-nums">
                            {money(datos.destacado.compradoMes)}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-muted/50 px-2.5 py-2">
                          <dt className="text-[10.5px] text-muted-foreground">Histórico</dt>
                          <dd className="text-[15px] font-extrabold text-foreground tabular-nums">
                            {money(datos.destacado.comprado)}
                          </dd>
                        </div>
                      </dl>
                      {datos.destacado.telefono && (
                        <a
                          href={`tel:${datos.destacado.telefono}`}
                          className="mt-2 flex h-[34px] items-center justify-center gap-1.5 rounded-lg border border-border text-[12px] font-semibold text-foreground hover:bg-muted"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          {datos.destacado.telefono}
                        </a>
                      )}
                    </div>
                  ) : (
                    <Vacio
                      titulo="Aún no hay compras este mes"
                      detalle="En cuanto se anote el costo de un repuesto, el proveedor aparecerá aquí."
                    />
                  )}
                </Panel>

                <Panel titulo="Compras por proveedor" subtitulo={`Del mes ${datos.mes}.`}>
                  {barras.length === 0 ? (
                    <Vacio titulo="Sin compras en el mes" />
                  ) : (
                    <ul className="space-y-2">
                      {barras.map(b => (
                        <li key={b.id}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-[11.5px] font-medium text-foreground">{b.nombre}</span>
                            <span className="shrink-0 text-[11.5px] font-bold text-foreground tabular-nums">
                              {money(b.compradoMes)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[#f97316]"
                              style={{ width: `${b.pct}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel titulo="Acciones rápidas">
                  <div className="space-y-1.5">
                    {[
                      { icono: <Plus className="h-4 w-4" aria-hidden />, label: 'Registrar un proveedor', al: () => setEditando({ abierto: true, proveedor: null }) },
                      { icono: <ClipboardList className="h-4 w-4" aria-hidden />, label: 'Nueva orden de compra', al: () => setOrdenNueva({ abierto: true, proveedor: null }) },
                      { icono: <Wallet className="h-4 w-4" aria-hidden />, label: 'Pagar o abonar a un proveedor', al: () => setPestana('pagos') },
                      { icono: <Package className="h-4 w-4" aria-hidden />, label: 'Qué le compramos a cada uno', al: () => setPestana('productos') },
                    ].map(a => (
                      <button
                        key={a.label}
                        onClick={a.al}
                        disabled={!puedeEditar && a.label.startsWith('Registrar')}
                        className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        <span className="text-[#f97316]">{a.icono}</span>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* ── Productos ────────────────────────────────────────────────── */}
          {pestana === 'productos' && (
            <Panel
              titulo={`Qué le compramos a cada proveedor (${productos.length})`}
              subtitulo="Sale de las compras registradas, no de una lista a mano: aquí no puede aparecer nada que no se haya comprado de verdad."
              sinRelleno
            >
              {productos.length === 0 ? (
                <Vacio
                  icono={<Package className="h-8 w-8" aria-hidden />}
                  titulo="Todavía no hay compras registradas"
                  detalle="Cada repuesto que se anote con su costo en la ficha de un carro aparecerá aquí."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse">
                    <thead>
                      <tr className="border-y border-border bg-muted/40">
                        <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Artículo o servicio</th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Proveedor</th>
                        <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">Veces</th>
                        <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Último costo</th>
                        <th scope="col" className="px-3.5 py-2 text-right text-[11px] font-semibold text-muted-foreground">Total comprado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.slice(0, 200).map(x => (
                        <tr key={x.clave} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                          <td className="px-3.5 py-2.5 text-[12.5px] font-medium text-foreground">{x.concepto}</td>
                          <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{x.proveedor}</td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-muted-foreground tabular-nums">{x.veces}</td>
                          <td className="px-3 py-2.5 text-right text-[12px] text-foreground tabular-nums">
                            {money(x.ultimoCosto)}
                            <span className="block text-[10px] text-muted-foreground">{fechaCorta(x.ultimaFecha)}</span>
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-[12.5px] font-bold text-foreground tabular-nums">{money(x.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* ── Órdenes de compra ────────────────────────────────────────── */}
          {pestana === 'ordenes' && (
            <Panel
              titulo={`Órdenes de compra (${datos.ordenes.length})`}
              subtitulo="Lo pedido no es un gasto hasta que llega. Al marcarla recibida se registra el egreso."
              sinRelleno
            >
              {datos.ordenes.length === 0 ? (
                <Vacio
                  icono={<ClipboardList className="h-8 w-8" aria-hidden />}
                  titulo="No hay órdenes de compra"
                  detalle="Registra lo que se le pide a un proveedor para saber qué está por llegar y qué se va a deber."
                  accion={puedeEditar ? (
                    <button
                      onClick={() => setOrdenNueva({ abierto: true, proveedor: null })}
                      className="mt-2 flex h-[34px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Nueva orden
                    </button>
                  ) : undefined}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse">
                    <thead>
                      <tr className="border-y border-border bg-muted/40">
                        <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Orden</th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Proveedor</th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Pedida</th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Debe llegar</th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Estado</th>
                        <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Total</th>
                        {puedeEditar && <th scope="col" className="px-3.5 py-2 text-right text-[11px] font-semibold text-muted-foreground">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.ordenes.map(o => {
                        const est = ESTADO_ORDEN[o.estado] || { label: o.estado, tono: 'neutro' as const };
                        return (
                          <tr key={o.id} className={cn(
                            'border-b border-border/60 last:border-0 hover:bg-muted/30',
                            o.atrasada && 'bg-red-500/[0.04]',
                          )}>
                            <td className="px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground tabular-nums">
                              {o.correlativo || '—'}
                              <span className="block text-[10.5px] font-normal text-muted-foreground">
                                {o.nItems} renglón(es)
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-foreground">{o.proveedor}</td>
                            <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{fechaCorta(o.fecha)}</td>
                            <td className="px-3 py-2.5 text-[12px] tabular-nums">
                              <span className={o.atrasada ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                                {fechaCorta(o.fecha_esperada)}
                              </span>
                              {o.atrasada && <span className="block text-[10px] text-red-600 dark:text-red-400">atrasada</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <Chip tono={est.tono}>{est.label}</Chip>
                              {o.estado_pago !== 'pagado' && (
                                <span className="mt-0.5 block text-[10px] text-amber-700 dark:text-amber-400">sin pagar</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-[12.5px] font-bold text-foreground tabular-nums">
                              {money(o.total)}
                            </td>
                            {puedeEditar && (
                              <td className="px-3.5 py-2.5">
                                <div className="flex items-center justify-end gap-1.5">
                                  {o.estado !== 'recibida' && o.estado !== 'cancelada' && (
                                    <>
                                      <button
                                        onClick={() => recibirOrden(o)}
                                        className="flex h-[26px] items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 text-[10.5px] font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                                      >
                                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                                        Ya llegó
                                      </button>
                                      <button
                                        onClick={() => cancelarOrden(o)}
                                        aria-label={`Cancelar la orden ${o.correlativo || ''}`}
                                        className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border text-red-600 hover:bg-red-500/10"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                      </button>
                                    </>
                                  )}
                                  {o.estado === 'recibida' && (
                                    <span className="text-[11px] text-muted-foreground tabular-nums">
                                      llegó {fechaCorta(o.fecha_recibida)}
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* ── Historial ────────────────────────────────────────────────── */}
          {pestana === 'historial' && (
            <TablaCompras
              compras={(datos.compras || []).filter(c => {
                const q = busqueda.trim().toLowerCase();
                return !q || c.proveedor.toLowerCase().includes(q) || c.concepto.toLowerCase().includes(q);
              })}
              titulo="Historial de compras"
              subtitulo="Los repuestos comprados para un carro y las compras sueltas, juntos por primera vez."
            />
          )}

          {/* ── Pagos ────────────────────────────────────────────────────── */}
          {pestana === 'pagos' && (
            <CuentasPorPagar busqueda={busqueda} puedePagar={can('reportes', 'editar')} sedeId={sedeId} onCambio={cargar} />
          )}

          {/* ── Evaluaciones ─────────────────────────────────────────────── */}
          {pestana === 'evaluaciones' && (
            <Panel
              titulo={`Evaluaciones (${datos.evaluaciones.length})`}
              subtitulo="Un proveedor barato que entrega tarde sale caro. Las tres notas van aparte porque no dicen lo mismo."
              sinRelleno
            >
              {datos.evaluaciones.length === 0 ? (
                <Vacio
                  icono={<Star className="h-8 w-8" aria-hidden />}
                  titulo="Todavía nadie ha sido evaluado"
                  detalle="Desde la lista de proveedores, la estrella de cada fila abre la evaluación."
                  accion={(
                    <button
                      onClick={() => setPestana('lista')}
                      className="mt-2 text-[12px] font-semibold text-[#f97316] hover:underline"
                    >
                      Ir a la lista
                    </button>
                  )}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="border-y border-border bg-muted/40">
                        <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Proveedor</th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Fecha</th>
                        <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">Calidad</th>
                        <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">Puntualidad</th>
                        <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">Precio</th>
                        <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Comentario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.evaluaciones.map(e => (
                        <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                          <td className="px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
                            {e.proveedor}
                            <span className="block text-[10.5px] font-normal text-muted-foreground">
                              por {e.evaluado_por || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">{fechaCorta(e.fecha)}</td>
                          {([e.calidad, e.puntualidad, e.precio]).map((n, i) => (
                            <td key={i} className="px-3 py-2.5 text-center">
                              {n != null ? (
                                <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                  <Star className="h-3 w-3 fill-current" aria-hidden />{n}
                                </span>
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          ))}
                          <td className="px-3.5 py-2.5 text-[12px] text-muted-foreground">
                            {e.comentario || <span className="text-muted-foreground/40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </>
      )}

      {editando?.abierto && (
        <ModalProveedor
          abierto
          proveedor={editando.proveedor}
          onCerrar={() => setEditando(null)}
          onGuardado={cargar}
        />
      )}

      {ordenNueva?.abierto && datos && (
        <ModalOrdenCompra
          abierto
          proveedores={datos.proveedores}
          proveedorInicial={ordenNueva.proveedor}
          onCerrar={() => setOrdenNueva(null)}
          onGuardado={cargar}
        />
      )}

      {evaluando && (
        <ModalEvaluacion
          abierto
          proveedor={evaluando}
          onCerrar={() => setEvaluando(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}

// ════════════════════ TABLA DE COMPRAS ════════════════════

/**
 * El historial y los pagos comparten tabla.
 *
 * Son la misma lista mirada desde dos sitios —todo lo comprado, o solo lo que
 * queda a deber—, y dibujarlas por separado acababa con dos tablas que
 * enseñaban el mismo dato con columnas distintas.
 */
function TablaCompras({ compras, titulo, subtitulo, vacio }: {
  compras: readonly CompraFila[];
  titulo: string;
  subtitulo: string;
  vacio?: string;
}) {
  const total = compras.reduce((s, c) => s + c.total, 0);
  const saldo = compras.reduce((s, c) => s + c.saldo, 0);

  return (
    <Panel titulo={titulo} subtitulo={subtitulo} sinRelleno>
      {compras.length === 0 ? (
        <Vacio
          icono={<CheckCircle2 className="h-8 w-8" aria-hidden />}
          titulo={vacio || 'No hay compras que mostrar'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-y border-border bg-muted/40">
                <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Fecha</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Concepto</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Proveedor</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Vehículo</th>
                <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Total</th>
                <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Se debe</th>
                <th scope="col" className="px-3.5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Vence</th>
              </tr>
            </thead>
            <tbody>
              {compras.slice(0, 300).map(c => (
                <tr key={`${c.origen}-${c.id}`} className={cn(
                  'border-b border-border/60 last:border-0 hover:bg-muted/30',
                  c.vencida && 'bg-red-500/[0.04]',
                )}>
                  <td className="px-3.5 py-2.5 text-[12px] text-muted-foreground tabular-nums">{fechaCorta(c.fecha)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-foreground">{c.concepto}</span>
                      {c.enlace && (
                        <a href={c.enlace} target="_blank" rel="noreferrer" aria-label="Abrir el enlace de la compra" className="text-blue-600 dark:text-blue-400">
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {c.origen === 'partida' ? 'de la ficha del vehículo' : 'compra suelta'}
                      {c.cantidad > 1 && ` · ${c.cantidad} uds.`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-foreground">{c.proveedor}</td>
                  <td className="px-3 py-2.5">
                    {c.placa
                      ? <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background tabular-nums">{c.placa}</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12.5px] font-semibold text-foreground tabular-nums">{money(c.total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {c.saldo > 0
                      ? <span className="text-[12.5px] font-bold text-red-600 dark:text-red-400">{money(c.saldo)}</span>
                      : <span className="text-[12px] text-emerald-600 dark:text-emerald-400">pagado</span>}
                  </td>
                  <td className="px-3.5 py-2.5 text-[12px] tabular-nums">
                    {c.fecha_vencimiento ? (
                      <span className={c.vencida ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                        {fechaCorta(c.fecha_vencimiento)}
                        {c.vencida && <span className="block text-[10px]">vencido</span>}
                      </span>
                    ) : c.saldo > 0 ? (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">sin fecha</span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td colSpan={4} className="px-3.5 py-2.5 text-[11.5px] font-semibold text-muted-foreground">
                  {compras.length > 300 ? `Se muestran 300 de ${compras.length}` : `${compras.length} compra(s)`}
                </td>
                <td className="px-3 py-2.5 text-right text-[13px] font-extrabold text-foreground tabular-nums">{money(total)}</td>
                <td className="px-3 py-2.5 text-right text-[13px] font-extrabold text-red-600 dark:text-red-400 tabular-nums">
                  {saldo > 0 ? money(saldo) : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}
