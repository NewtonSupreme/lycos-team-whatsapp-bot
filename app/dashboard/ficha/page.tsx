'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, Car, CheckCircle2, ChevronRight, ExternalLink, FileDown,
  Loader2, Phone, Plus, RefreshCw, Search, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { getPermisos, hasPermiso, resolveRol } from '@/types';
import { useModales } from '@/components/ui/modales';
import ErpShell from '@/components/erp/ErpShell';
import TablaPartidas from '@/components/ficha/TablaPartidas';
import DialogoPartida from '@/components/ficha/DialogoPartida';
import OrdenDeTrabajo from '@/components/ficha/OrdenDeTrabajo';
import SelectorServicio from '@/components/ficha/SelectorServicio';
import type {
  FichaVehiculo, ItemOrden, PartidaCalculada, ServicioFicha,
} from '@/lib/ficha/vehiculo';

interface VehiculoBusqueda {
  id: string; placa: string; marca: string | null; modelo: string | null;
  anio: number | null; cliente_id: string | null;
}

interface DeudaProveedor {
  proveedor: string;
  proveedor_id: string | null;
  saldo: number;
  vencido: number;
  items: {
    id: string; origen: string; fecha: string; concepto: string; placa: string | null;
    total: number; pagado: number; saldo: number; fecha_vencimiento: string | null;
    vencida: boolean; enlace: string | null;
  }[];
}

const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Cómo nombrar una orden en un mensaje. */
const etiquetaServicio = (s: ServicioFicha | null) => {
  if (!s) return null;
  const fecha = s.fecha ? String(s.fecha).slice(0, 10) : 'sin fecha';
  const que = s.descripcion || s.tipo_personalizado || s.tipo || 'servicio';
  return `${fecha} · ${que}`;
};

/**
 * Ficha del vehículo.
 *
 * Lo que pidió administración: abrir un carro y ver de una lo que se le cobra,
 * lo que costó y lo que se ganó, renglón por renglón; y por cada repuesto, si
 * lo trajo el cliente o lo compramos, a quién, y si ya se pagó.
 *
 * Está organizada por TRABAJO, no por vehículo. Antes todo caía en un montón
 * común: los renglones no pertenecían a ninguna orden, así que la ficha «se
 * editaba en tiempo real» sin actualizar el precio al cliente ni registrar el
 * gasto en ninguna parte. Ahora se elige primero el servicio y desde ahí se ven
 * las dos mitades juntas —lo que se cobra y lo que costó—, cada una editable.
 */
export default function FichaVehiculoPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede } = useSedeStore();
  const sedeId = currentSede?.id || null;
  const { confirmar, error: avisarError } = useModales();

  const permisos = getPermisos(user?.rol || 'empleado', user?.permisos, roleDefaults);
  const esAdmin = resolveRol(user?.rol) === 'admin';
  const canEdit = esAdmin || hasPermiso(permisos.vehiculos, 'editar');

  const [mounted, setMounted] = useState(false);
  const [vista, setVista] = useState<'ficha' | 'deudas'>('ficha');

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<VehiculoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [ficha, setFicha] = useState<FichaVehiculo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  /**
   * El trabajo elegido. `undefined` = todavía no se ha tocado, así que manda el
   * que trae la ficha; `null` = el usuario pidió ver todo el historial.
   *
   * Se guarda así para no arrancar con un efecto que ponga el valor por defecto:
   * un `setState` dentro de un efecto sobre datos recién llegados provoca un
   * render de más y en esta pantalla hacía parpadear la tabla.
   */
  const [servicioSel, setServicioSel] = useState<string | null | undefined>(undefined);

  const [dialogo, setDialogo] = useState<{
    abierto: boolean;
    partida: PartidaCalculada | null;
    /** Renglón de una orden con el que abrir el diálogo ya rellenado. */
    precarga?: FichaVehiculo['sugeridas'][number] | null;
  } | null>(null);

  /** Lo que la sincronización no pudo hacer, o el precio nuevo de la orden. */
  const [novedad, setNovedad] = useState<{ texto: string; avisos: string[] } | null>(null);

  const [deudas, setDeudas] = useState<{ total: number; vencido: number; nDeudas: number; proveedores: DeudaProveedor[] } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // ── Búsqueda de vehículos ────────────────────────────────────────────────
  useEffect(() => {
    const q = busqueda.trim();
    if (!supabase || q.length < 2) { setResultados([]); return; }

    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      let sel = supabase!.from('vehiculos')
        .select('id, placa, marca, modelo, anio, cliente_id')
        .or(`placa.ilike.%${q}%,marca.ilike.%${q}%,modelo.ilike.%${q}%`)
        .order('placa').limit(12);
      if (sedeId) sel = sel.eq('sede_id', sedeId);
      const { data } = await sel;
      if (vivo) { setResultados((data || []) as VehiculoBusqueda[]); setBuscando(false); }
    }, 280);

    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda, sedeId]);

  // ── Ficha ────────────────────────────────────────────────────────────────
  const abrir = useCallback(async (placa: string, vehiculoId?: string | null, mantener = false) => {
    setCargando(true);
    setError('');
    // Al abrir otro carro se vuelve al trabajo que la ficha proponga; al
    // recargar el mismo se respeta el que el usuario tenía elegido.
    if (!mantener) setServicioSel(undefined);
    try {
      const qs = new URLSearchParams();
      if (vehiculoId) qs.set('vehiculo', vehiculoId); else qs.set('placa', placa);
      if (sedeId) qs.set('sede', sedeId);
      const r = await fetch(`/api/ficha/vehiculo?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo abrir la ficha');
      setFicha(d);
      setResultados([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al abrir la ficha');
      setFicha(null);
    } finally {
      setCargando(false);
    }
  }, [sedeId]);

  const recargar = useCallback(() => {
    if (ficha?.vehiculo) abrir(ficha.vehiculo.placa, ficha.vehiculo.id, true);
  }, [ficha, abrir]);

  const cargarDeudas = useCallback(async () => {
    const qs = sedeId ? `?sede=${sedeId}` : '';
    const r = await fetch(`/api/ficha/cuentas-por-pagar${qs}`);
    const d = await r.json();
    if (r.ok) setDeudas(d);
  }, [sedeId]);

  useEffect(() => { if (mounted && vista === 'deudas') cargarDeudas(); }, [mounted, vista, cargarDeudas]);

  /**
   * Se puede llegar con la placa puesta: `/dashboard/ficha?placa=AB123CD`.
   *
   * Sin esto, para ver la ficha de un carro había que venir a esta pantalla y
   * volver a buscarlo, sabiendo ya cuál era. Ahora Servicios, Vehículos o
   * Clientes pueden enlazarla directamente.
   */
  const placaAbierta = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted) return;
    const p = (params.get('placa') || '').trim().toUpperCase();
    // Solo la primera vez por placa: si no, volver de la búsqueda la reabriría.
    if (!p || placaAbierta.current === p) return;
    placaAbierta.current = p;
    abrir(p, params.get('vehiculo'));
  }, [mounted, params, abrir]);

  // ── El trabajo en el que se está trabajando ──────────────────────────────
  const servicioId = servicioSel === undefined ? (ficha?.servicioActivo ?? null) : servicioSel;
  const servicio = useMemo(
    () => ficha?.servicios.find(s => s.id === servicioId) ?? null,
    [ficha, servicioId],
  );

  /**
   * Los renglones de la ficha que se muestran.
   *
   * Con un trabajo elegido se ven los suyos y también los que quedaron sin
   * trabajo asignado: son los de antes de que la ficha se enlazara a servicios,
   * y esconderlos haría creer que se perdieron.
   */
  const partidasVista = useMemo(() => {
    if (!ficha) return [] as PartidaCalculada[];
    if (!servicioId) return ficha.partidas;
    return ficha.partidas.filter(p => p.servicio_id === servicioId || !p.servicio_id);
  }, [ficha, servicioId]);

  const sueltas = useMemo(
    () => (ficha?.partidas || []).filter(p => !p.servicio_id).length,
    [ficha],
  );

  // ── Acciones ─────────────────────────────────────────────────────────────
  const borrar = async (p: PartidaCalculada) => {
    const ok = await confirmar({
      tipo: 'peligro',
      titulo: '¿Quitar este renglón de la ficha?',
      mensaje: `«${p.descripcion}»`,
      detalle: p.servicio_id
        ? 'Se quita también de la orden, así que baja lo que se le cobra al cliente, '
          + 'y se retira el gasto que generó en los egresos de la empresa.'
        : 'Este renglón no está enlazado a ninguna orden: solo desaparece de la ficha '
          + 'y de los egresos.',
      confirmar: 'Sí, quitar',
    });
    if (!ok) return;

    const r = await fetch(`/api/partidas/${p.id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { await avisarError(d.error || 'No se pudo borrar'); return; }
    if (typeof d.totalOrden === 'number') {
      setNovedad({ texto: `La orden quedó en ${money(d.totalOrden)}.`, avisos: d.avisos || [] });
    }
    recargar();
  };

  const marcarPagado = async (p: PartidaCalculada) => {
    const ok = await confirmar({
      titulo: '¿Marcar como pagado?',
      mensaje: `Se registrará que ya se le pagó a ${p.proveedor || 'el proveedor'} por «${p.descripcion}».`,
      detalle: `Son ${money(p.saldo_proveedor)} que dejarán de aparecer en cuentas por pagar.`,
      confirmar: 'Sí, ya se pagó',
    });
    if (!ok) return;

    const r = await fetch(`/api/partidas/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_pago: 'pagado', monto_pagado: 0 }),
    });
    if (!r.ok) { await avisarError((await r.json()).error || 'No se pudo actualizar'); return; }
    recargar();
  };

  /**
   * Saca un renglón de la orden: deja de cobrársele al cliente.
   *
   * Es el botón que faltaba. Lo que la orden traía del registro original era
   * intocable desde aquí, así que un trabajo anotado por error se cobraba igual.
   */
  const quitarDeOrden = async (it: ItemOrden) => {
    if (!servicio) return;
    const cantidad = Number(it.cantidad) || 1;
    const total = Number(it.total) || cantidad * (Number(it.precio_unitario) || 0);

    const ok = await confirmar({
      tipo: 'peligro',
      titulo: '¿Quitar este renglón de la orden?',
      mensaje: `«${it.descripcion}» — ${money(total)}`,
      detalle: `Deja de cobrársele al cliente: la orden bajará de `
        + `${money(servicio.totalItems)} a ${money(servicio.totalItems - total)}.`
        + (it.enFicha ? ' Su costo y su gasto en egresos también se retiran.' : '')
        + (Number(it.stock_descontado) > 0
          ? ` Ojo: ya se descontaron ${it.stock_descontado} unidad(es) del almacén; `
            + 'eso se corrige en la orden, en Servicios.'
          : ''),
      confirmar: 'Sí, quitar de la orden',
    });
    if (!ok) return;

    const r = await fetch('/api/servicios/renglon', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servicio: servicio.id, descripcion: it.descripcion }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { await avisarError(d.error || 'No se pudo quitar el renglón'); return; }
    setNovedad({
      texto: `Se quitó «${it.descripcion}». La orden quedó en ${money(d.total || 0)}.`,
      avisos: [],
    });
    recargar();
  };

  /** Anota en la ficha lo que costó un renglón que la orden ya cobra. */
  const costear = (it: ItemOrden) => {
    if (!servicio) return;
    setDialogo({
      abierto: true,
      partida: null,
      precarga: {
        servicio_id: servicio.id,
        fecha: servicio.fecha,
        descripcion: it.descripcion || '',
        cantidad: Number(it.cantidad) || 1,
        precio_venta: Number(it.precio_unitario) || Number(it.total) || 0,
        costo_unitario: Number(it.costo_unitario) || 0,
        inventario_id: it.inventario_id ?? null,
      },
    });
  };

  const kpis = useMemo(() => {
    if (!ficha) return [];
    // Con un trabajo elegido los indicadores son de ESE trabajo: sumar todo el
    // historial del carro respondía a una pregunta que nadie hizo.
    const venta = partidasVista.reduce((s, p) => s + p.total_venta, 0);
    const costo = partidasVista.reduce((s, p) => s + p.total_costo, 0);
    const porPagar = partidasVista.reduce((s, p) => s + p.saldo_proveedor, 0);
    const utilidad = venta - costo;
    const margen = venta > 0 ? Number(((utilidad / venta) * 100).toFixed(1)) : 0;
    // Lo que se le cobra sale de la orden cuando hay una elegida: es el precio
    // de verdad, incluidos los renglones que aún no tienen costo anotado.
    const cobrado = servicio ? (servicio.totalItems || servicio.monto) : venta;

    return [
      {
        label: servicio ? 'Se le cobra en este trabajo' : 'Se le cobra al cliente',
        valor: money(cobrado),
        // Lo que se cobra no es lo mismo que lo que ya tiene costo anotado: la
        // diferencia es justo lo que falta por costear, y decirlo así evita el
        // «$0,00 con costo anotado» que parecía un error de cálculo.
        pie: servicio && Math.abs(cobrado - venta) >= 0.5
          ? (venta > 0
            ? `${money(venta)} ya costeado · falta ${money(cobrado - venta)}`
            : 'ningún renglón tiene su costo todavía')
          : undefined,
        tinte: 'bg-[#e7f0fe] text-[#2563eb]',
        icono: <Wallet className="h-[19px] w-[19px]" aria-hidden />,
      },
      {
        label: 'Nos costó', valor: money(costo),
        tinte: 'bg-[#fdf5e2] text-[#a16207]',
        icono: <TrendingDown className="h-[19px] w-[19px]" aria-hidden />,
      },
      {
        label: 'Ganancia', valor: money(utilidad), pie: `${margen}% de margen`,
        tinte: utilidad >= 0 ? 'bg-[#e8f7ee] text-[#16a34a]' : 'bg-[#fdeaea] text-[#dc2626]',
        icono: <TrendingUp className="h-[19px] w-[19px]" aria-hidden />,
      },
      {
        label: 'Se le debe a proveedores', valor: money(porPagar),
        tinte: porPagar > 0 ? 'bg-[#fdeaea] text-[#dc2626]' : 'bg-[#f2f3f5] text-[#5b616e]',
        icono: <AlertTriangle className="h-[19px] w-[19px]" aria-hidden />,
      },
    ];
  }, [ficha, partidasVista, servicio]);

  if (!mounted) return null;

  return (
    <ErpShell
      buscador="Buscar vehículo por placa, marca o modelo..."
      lema={['Cada carro', 'con su cuenta', 'clara']}
      lemaPie={['Lo que entra', 'y lo que sale.']}
    >
      <header className="mb-3.5 flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
          <Car className="h-[24px] w-[24px]" aria-hidden />
        </span>
        {/* El título va sobre el fondo del armazón, no sobre una tarjeta
            blanca, así que necesita los colores del tema: con el hex claro de
            las tarjetas quedaba texto oscuro sobre fondo oscuro, invisible. */}
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-foreground">Ficha del vehículo</h1>
          <p className="text-[13px] text-muted-foreground">
            Qué se le cobra, qué costó y qué se ganó — trabajo por trabajo, con su proveedor.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-1" role="tablist">
          {([['ficha', 'Ficha'], ['deudas', 'Cuentas por pagar']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={vista === id}
              onClick={() => setVista(id)}
              className={cn(
                'h-[36px] rounded-lg px-3.5 text-[12.5px] font-semibold transition-colors',
                vista === id ? 'bg-[#f97316] text-white' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {vista === 'deudas' ? (
        <CuentasPorPagar deudas={deudas} onRecargar={cargarDeudas} onVerVehiculo={p => { setVista('ficha'); abrir(p); }} />
      ) : (
        <>
          {/* Buscador */}
          <section className="relative mb-3.5 rounded-xl border border-[#e8eaed] bg-white p-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[#5b616e]">Busca el vehículo</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && busqueda.trim()) abrir(busqueda.trim().toUpperCase()); }}
                  placeholder="Placa, marca o modelo — y Enter para abrir la placa tal cual"
                  aria-label="Buscar vehículo"
                  className="h-[46px] w-full rounded-lg border border-[#e2e5ea] pl-11 pr-3 text-[14px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                />
                {buscando && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#f97316]" aria-hidden />}
              </span>
            </label>

            {resultados.length > 0 && (
              <ul className="mt-2 max-h-[280px] overflow-y-auto rounded-lg border border-[#e8eaed]">
                {resultados.map(v => (
                  <li key={v.id}>
                    <button
                      onClick={() => { setBusqueda(''); abrir(v.placa, v.id); }}
                      className="flex w-full items-center gap-3 border-b border-[#f2f3f5] px-3 py-2.5 text-left last:border-0 hover:bg-[#fafbfc]"
                    >
                      <span className="num rounded-md bg-[#16181d] px-2 py-1 text-[12px] font-bold text-white">{v.placa}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#3d4350]">
                        {[v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Sin datos'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error && (
            <p role="alert" className="mb-3.5 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">{error}</p>
          )}

          {cargando && (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#f97316]" aria-hidden /></div>
          )}

          {!cargando && !ficha && !error && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d5d9e0] bg-white py-16 text-center">
              <Car className="mb-3 h-10 w-10 text-[#d5d9e0]" aria-hidden />
              <p className="text-[14px] font-semibold text-[#16181d]">Busca un vehículo para abrir su ficha</p>
              <p className="mt-1 max-w-sm text-[12.5px] text-[#8a909c]">
                Verás lo que se le cobró, lo que costó cada repuesto, quién lo vendió y si ya se pagó.
              </p>
            </div>
          )}

          {!cargando && ficha && (
            <div className="space-y-3.5">
              {/* Cabecera del vehículo */}
              <section className="flex flex-wrap items-center gap-3.5 rounded-xl border border-[#e8eaed] bg-white px-5 py-4">
                <button
                  onClick={() => { setFicha(null); setBusqueda(''); setServicioSel(undefined); setNovedad(null); }}
                  aria-label="Volver a la búsqueda"
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>

                <span className="num rounded-lg bg-[#16181d] px-3 py-2 text-[18px] font-extrabold tracking-wider text-white">
                  {ficha.vehiculo?.placa || '—'}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-[#16181d]">{ficha.vehiculo?.info || 'Vehículo no registrado'}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-[#8a909c]">
                    {ficha.cliente?.nombre && <span>{ficha.cliente.nombre}</span>}
                    {ficha.cliente?.telefono && (
                      <span className="num flex items-center gap-1">
                        <Phone className="h-3 w-3" aria-hidden />{ficha.cliente.telefono}
                      </span>
                    )}
                    {ficha.vehiculo?.color && <span>{ficha.vehiculo.color}</span>}
                    {ficha.vehiculo?.vin && <span className="num">VIN {ficha.vehiculo.vin}</span>}
                  </p>
                </div>

                <button
                  onClick={recargar}
                  aria-label="Actualizar"
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>

                {/* La ficha en papel, con costos: es un documento interno. */}
                <button
                  onClick={async () => {
                    const { generarFichaPDF } = await import('@/lib/ficha-pdf');
                    generarFichaPDF(ficha, { generadoPor: useAppStore.getState().user?.nombre });
                  }}
                  className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-semibold text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  <FileDown className="h-4 w-4" aria-hidden />
                  PDF
                </button>

                {canEdit && (
                  <button
                    onClick={() => setDialogo({ abierto: true, partida: null })}
                    className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white hover:bg-[#ea580c]"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar renglón
                  </button>
                )}
              </section>

              {/* El trabajo sobre el que se edita */}
              <SelectorServicio
                servicios={ficha.servicios}
                elegido={servicioId}
                onElegir={id => { setServicioSel(id); setNovedad(null); }}
                sueltas={sueltas}
              />

              {/* Lo que acaba de pasar al guardar */}
              {novedad && (
                <section
                  role="status"
                  className={cn(
                    'flex flex-wrap items-start gap-2 rounded-xl border px-4 py-3',
                    novedad.avisos.length > 0
                      ? 'border-[#fde68a] bg-[#fffbeb]'
                      : 'border-[#bbf7d0] bg-[#f0fdf4]',
                  )}
                >
                  {novedad.avisos.length > 0
                    ? <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[#a16207]" aria-hidden />
                    : <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-[#16a34a]" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-[12.5px] font-semibold',
                      novedad.avisos.length > 0 ? 'text-[#92400e]' : 'text-[#15803d]',
                    )}>
                      {novedad.texto}
                    </p>
                    {novedad.avisos.map((a, i) => (
                      <p key={i} className="mt-0.5 text-[11.5px] leading-snug text-[#92400e]">{a}</p>
                    ))}
                  </div>
                  <button
                    onClick={() => setNovedad(null)}
                    className="shrink-0 text-[11.5px] font-semibold text-[#5b616e] hover:underline"
                  >
                    Entendido
                  </button>
                </section>
              )}

              {/* Indicadores */}
              <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
                {kpis.map(k => (
                  <article key={k.label} className="flex items-start gap-3 rounded-xl border border-[#e8eaed] bg-white p-4">
                    <span className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl ${k.tinte}`}>{k.icono}</span>
                    <div className="min-w-0">
                      <p className="text-[11.5px] leading-tight text-[#8a909c]">{k.label}</p>
                      <p className="num mt-0.5 truncate text-[21px] font-extrabold leading-tight text-[#16181d]">{k.valor}</p>
                      {k.pie && <p className="num text-[10.5px] text-[#8a909c]">{k.pie}</p>}
                    </div>
                  </article>
                ))}
              </div>

              {/* La orden del trabajo elegido: lo que se le cobra al cliente */}
              {servicio && (
                <OrdenDeTrabajo
                  servicio={servicio}
                  partidas={ficha.partidas}
                  canEdit={canEdit}
                  onCostear={costear}
                  onEditarPartida={p => setDialogo({ abierto: true, partida: p })}
                  onQuitar={quitarDeOrden}
                  onAgregar={() => setDialogo({ abierto: true, partida: null })}
                />
              )}

              {/* Lo que se está escapando */}
              {ficha.alertas.length > 0 && (
                <section className="rounded-xl border border-[#ffd9bd] bg-[#fff8f3] px-4 py-3.5">
                  <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-[#c2410c]">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    Revisa esto
                  </h2>
                  <ul className="mt-2 space-y-1.5">
                    {ficha.alertas.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-[#7c2d12]">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c2410c]" aria-hidden />
                        {a}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Renglones de la ficha: lo que costó al taller */}
              <section className="rounded-xl border border-[#e8eaed] bg-white p-4">
                <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
                  <h2 className="text-[15px] font-extrabold text-[#16181d]">
                    Costos del taller ({partidasVista.length})
                  </h2>
                  <p className="text-[11.5px] text-[#8a909c]">
                    {servicio
                      ? 'Lo que costó cada pieza de este trabajo, con su proveedor.'
                      : 'Todos los renglones del vehículo, de cualquier trabajo.'}
                  </p>
                </div>
                <TablaPartidas
                  partidas={partidasVista}
                  canEdit={canEdit}
                  onEditar={p => setDialogo({ abierto: true, partida: p })}
                  onBorrar={borrar}
                  onMarcarPagado={marcarPagado}
                  vacio={servicio ? {
                    titulo: 'Este trabajo todavía no tiene costos anotados',
                    detalle: 'Usa el botón «Costear» de cada renglón de la orden de arriba para '
                      + 'poner lo que costó la pieza y quién la vendió. El gasto se registrará solo.',
                  } : undefined}
                />
              </section>

              {/* Contraste con la caja */}
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
                  <h2 className="text-[14px] font-bold text-[#16181d]">Ficha contra caja</h2>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-[#8a909c]">
                    A la izquierda lo que dice esta hoja —todo el vehículo, no solo el trabajo
                    elegido—; a la derecha lo que quedó asentado en ventas y egresos.
                    Si no coinciden, algo se registró en un lado y no en el otro.
                  </p>
                  <table className="mt-3 w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[#eef0f3] text-[11px] text-[#8a909c]">
                        <th scope="col" className="py-1.5 text-left font-semibold" />
                        <th scope="col" className="py-1.5 text-right font-semibold">Ficha</th>
                        <th scope="col" className="py-1.5 text-right font-semibold">Registrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Cobrado', ficha.totales.venta, ficha.registrado.ingresos],
                        ['Costos', ficha.totales.costo, ficha.registrado.egresos],
                        ['Ganancia', ficha.totales.utilidad, ficha.registrado.utilidad],
                      ].map(([label, a, b]) => {
                        const difiere = Math.abs(Number(a) - Number(b)) >= 1;
                        return (
                          <tr key={String(label)} className="border-b border-[#f5f6f8] last:border-0">
                            <td className="py-2 text-[#3d4350]">{label}</td>
                            <td className="num py-2 text-right font-semibold text-[#16181d]">{money(Number(a))}</td>
                            <td className={cn('num py-2 text-right font-semibold', difiere ? 'text-[#dc2626]' : 'text-[#16a34a]')}>
                              {money(Number(b))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="num mt-2 text-[11px] text-[#9ba1ab]">
                    {ficha.registrado.nVentas} venta(s) y {ficha.registrado.nEgresos} egreso(s) registrados para esta placa.
                  </p>
                </section>

                {/* Renglones que las órdenes ya cobran y aún no tienen costo.

                    Con un trabajo elegido esto ya se ve en su tabla, así que el
                    panel solo aparece en el historial completo: sirve de lista
                    de pendientes para saber a qué trabajo entrar. */}
                {canEdit && !servicio && ficha.sugeridas.length > 0 && (
                  <section className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3.5">
                    <h2 className="text-[14px] font-bold text-[#9a3412]">
                      Renglones sin costo anotado ({ficha.sugeridas.length})
                    </h2>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-[#9a5b2c]">
                      Ya se sabe qué se le cobró, pero no qué costó. Entra al trabajo
                      para registrar el costo, de dónde salió la pieza y si al proveedor
                      se le pagó.
                    </p>
                    <ul className="mt-2.5 max-h-[260px] space-y-1.5 overflow-y-auto">
                      {ficha.sugeridas.map(x => (
                        <li key={`${x.servicio_id}-${x.descripcion}`}>
                          <button
                            onClick={() => { setServicioSel(x.servicio_id); setNovedad(null); }}
                            className="flex w-full items-center gap-2.5 rounded-lg border border-[#fed7aa] bg-white px-3 py-2 text-left transition-colors hover:border-[#f97316]"
                          >
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#f97316]" aria-hidden />
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block truncate text-[12.5px] font-medium text-[#16181d]">
                                {x.descripcion}
                              </span>
                              <span className="num block text-[11px] text-[#8a909c]">
                                {x.fecha ? String(x.fecha).slice(0, 10) : '—'} · cantidad {x.cantidad}
                              </span>
                            </span>
                            <span className="num shrink-0 text-[12.5px] font-semibold text-[#16181d]">
                              {money(x.precio_venta)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
                  <h2 className="text-[14px] font-bold text-[#16181d]">Servicios del vehículo</h2>
                  {ficha.servicios.length === 0 ? (
                    <p className="py-4 text-[12.5px] text-[#8a909c]">Sin órdenes de servicio registradas.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-[#f2f3f5]">
                      {ficha.servicios.slice(0, 6).map(s => (
                        <li key={s.id}>
                          {/* La fila lleva a su orden: antes era texto muerto y
                              no había forma de ir a ver el trabajo. */}
                          <button
                            onClick={() => router.push(`/dashboard/servicios?id=${s.id}`)}
                            className="flex w-full items-center gap-2.5 rounded-lg py-2 text-left transition-colors hover:bg-[#fafbfc]"
                          >
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block truncate text-[12.5px] font-medium text-[#16181d]">
                                {s.descripcion || s.tipo || 'Servicio'}
                              </span>
                              <span className="num block text-[11px] text-[#9ba1ab]">
                                {s.fecha ? String(s.fecha).slice(0, 10) : '—'} · {s.estado || 'sin estado'}
                                {s.items.length > 0 && ` · ${s.items.length} renglón(es)`}
                              </span>
                            </span>
                            <span className="shrink-0 text-right leading-tight">
                              <span className="num block text-[12.5px] font-semibold text-[#16181d]">
                                {money(s.monto)}
                              </span>
                              {/* Un importe estimado y uno cobrado no significan lo
                                  mismo, así que se dice cuál es. */}
                              <span className={cn(
                                'block text-[10px]',
                                s.montoOrigen === 'estimado' ? 'text-[#c2410c]' : 'text-[#9ba1ab]',
                              )}>
                                {s.montoOrigen === 'final' ? 'cobrado'
                                  : s.montoOrigen === 'pagado' ? 'pagado'
                                    : s.montoOrigen === 'estimado' ? 'presupuestado'
                                      : 'sin monto'}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#c3c8d0]" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}

      {dialogo?.abierto && ficha && (
        <DialogoPartida
          precarga={dialogo.precarga ?? null}
          partida={dialogo.partida}
          placa={ficha.vehiculo?.placa || ''}
          vehiculoId={ficha.vehiculo?.id || null}
          vehiculoInfo={ficha.vehiculo?.info}
          clienteId={ficha.cliente?.id}
          clienteNombre={ficha.cliente?.nombre}
          servicioId={servicioId}
          servicioEtiqueta={etiquetaServicio(servicio)}
          onCerrar={() => setDialogo(null)}
          onGuardado={r => {
            setNovedad({
              texto: typeof r.totalOrden === 'number'
                ? `Renglón guardado. La orden quedó en ${money(r.totalOrden)}.`
                : 'Renglón guardado.',
              avisos: r.avisos || [],
            });
            recargar();
          }}
        />
      )}
    </ErpShell>
  );
}

// ════════════════════ CUENTAS POR PAGAR ════════════════════
function CuentasPorPagar({ deudas, onRecargar, onVerVehiculo }: {
  deudas: { total: number; vencido: number; nDeudas: number; proveedores: DeudaProveedor[] } | null;
  onRecargar: () => void;
  onVerVehiculo: (placa: string) => void;
}) {
  if (!deudas) {
    return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#f97316]" aria-hidden /></div>;
  }

  if (deudas.nDeudas === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[#e8eaed] bg-white py-16 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-[#16a34a]" aria-hidden />
        <p className="text-[14px] font-semibold text-[#16181d]">No se le debe nada a ningún proveedor</p>
        <p className="mt-1 text-[12.5px] text-[#8a909c]">Todas las compras están pagadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {[
          { label: 'Total que se debe', valor: money(deudas.total), tinte: 'bg-[#fdeaea] text-[#dc2626]' },
          { label: 'Ya vencido', valor: money(deudas.vencido), tinte: deudas.vencido > 0 ? 'bg-[#fdeaea] text-[#dc2626]' : 'bg-[#f2f3f5] text-[#5b616e]' },
          { label: 'Compras a crédito', valor: String(deudas.nDeudas), tinte: 'bg-[#fdf5e2] text-[#a16207]' },
        ].map(k => (
          <article key={k.label} className="flex items-center gap-3 rounded-xl border border-[#e8eaed] bg-white p-4">
            <span className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl ${k.tinte}`}>
              <Wallet className="h-[19px] w-[19px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] text-[#8a909c]">{k.label}</p>
              <p className="num text-[21px] font-extrabold leading-tight text-[#16181d]">{k.valor}</p>
            </div>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
        <header className="flex items-center gap-2 px-4 py-3.5">
          <h2 className="flex-1 text-[15px] font-extrabold text-[#16181d]">A quién le debemos</h2>
          <button onClick={onRecargar} aria-label="Actualizar" className="rounded-md p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <ul className="divide-y divide-[#f2f3f5]">
          {deudas.proveedores.map(g => (
            <li key={g.proveedor_id || g.proveedor} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[#16181d]">{g.proveedor}</span>
                {g.vencido > 0 && (
                  <span className="num rounded-md bg-[#fdeaea] px-2 py-0.5 text-[11px] font-semibold text-[#dc2626]">
                    {money(g.vencido)} vencido
                  </span>
                )}
                <span className="num text-[15px] font-extrabold text-[#16181d]">{money(g.saldo)}</span>
              </div>

              <ul className="mt-2 space-y-1">
                {g.items.map(it => (
                  <li key={`${it.origen}-${it.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#fafbfc] px-2.5 py-1.5 text-[11.5px]">
                    <span className="min-w-0 flex-1 truncate text-[#3d4350]">{it.concepto}</span>
                    {it.placa && (
                      <button
                        onClick={() => onVerVehiculo(it.placa!)}
                        className="num rounded bg-[#16181d] px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-[#2a2c33]"
                      >
                        {it.placa}
                      </button>
                    )}
                    {it.enlace && (
                      <a href={it.enlace} target="_blank" rel="noreferrer" aria-label="Abrir enlace" className="text-[#2563eb]">
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    {it.fecha_vencimiento && (
                      <span className={cn('num text-[10.5px]', it.vencida ? 'font-semibold text-[#dc2626]' : 'text-[#9ba1ab]')}>
                        {it.vencida ? 'venció ' : 'vence '}{String(it.fecha_vencimiento).slice(8, 10)}/{String(it.fecha_vencimiento).slice(5, 7)}
                      </span>
                    )}
                    <span className="num shrink-0 font-bold text-[#16181d]">{money(it.saldo)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
