'use client';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Wrench, Search, Calendar, Clock, CheckCircle, AlertCircle,
  Loader2, RefreshCw, User, Car, Phone, ChevronDown, X,
  Banknote, BadgeCheck, Activity, Plus, Trash2, Edit3,
  ChevronRight, ChevronLeft, MoreHorizontal, MessageSquare, Tag, Info,
  MapPin, Filter, LayoutGrid, List, FileText, MoveHorizontal, Download,
  TrendingUp, Save, CheckCircle2, XCircle, Wallet
} from 'lucide-react';
import GastosVehiculoModal from '@/components/egresos/GastosVehiculoModal';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, registrarFactura, createPresupuesto, generateNumeroPresupuesto, syncClientData, transferVehiculo, autoRegisterSaleFromService } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from "@/lib/store/useSedeStore";
import { Button } from '@/components/ui/button';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { generatePresupuestoPDF } from '@/lib/presupuesto-pdf';
import { ComprobanteInput, emptyComprobante, type ComprobanteValue } from '@/components/ventas/ComprobanteInput';
import { uploadComprobante, comprobanteFields } from '@/lib/comprobante';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { cn, getLocalISODate, parseDescripcionItems } from '@/lib/utils';
import DesglosePagoBancos from '@/components/pos/DesglosePagoBancos';
import { buildVentaDiaFields, emptyBins, binsTotalUSD, deptFromServicioTipo, type Bins } from '@/lib/reporte/ventas-mapping';
import PersonalYComisiones, { type AsignacionEmpleado } from '@/components/nomina/PersonalYComisiones';
import { asignacionesValidas, buildJobsDesdeAsignacion } from '@/lib/nomina/asignaciones';
import { CATEGORIAS_VENTA, inferirCategoria, categoriaToZona, buildCategoriaColumns, buildPagoColumns, sumaMetodos } from '@/lib/categorias';

// ── Types ─────────────────────────────────────────────────────
interface ServicioItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

// Desglosa una descripción (incluyendo las registradas por el bot, que pueden venir
// multilínea "Nombre: trabajo" o con " + " / comas) en ítems separados para la factura.
function parseServicioItemsFromText(descripcion: string, totalPrecio = 0): ServicioItem[] {
  const raw = (descripcion || '').trim();
  if (!raw) return [];
  // 1) Multilínea (bot: "Rafael: ...\nJin: ...") → cada línea es un ítem.
  let pedazos = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  // 2) Si es una sola línea, intentar separar por " + " o " , " / ";"
  if (pedazos.length === 1) {
    pedazos = pedazos[0]
      .split(/\s\+\s|\s*;\s*|\s*\|\s*/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (pedazos.length === 0) pedazos = [raw];
  // Un solo ítem → recibe el costo total. VARIOS ítems → cada uno empieza en $0, para que
  // el precio se asigne EXACTAMENTE al servicio que corresponde (no se vuelca al primero).
  if (pedazos.length === 1) {
    return [{ descripcion: pedazos[0], cantidad: 1, precio_unitario: totalPrecio, total: totalPrecio }];
  }
  return pedazos.map(p => ({ descripcion: p, cantidad: 1, precio_unitario: 0, total: 0 }));
}

interface CitaServicio {
  id: string;
  fecha: string;
  hora: string;
  tipo: string;
  tipo_personalizado?: string | null;
  descripcion: string | null;
  estado: string;
  nombre_cliente: string | null;
  vehiculo_info: string | null;
  placa: string | null;
  telefono: string | null;
  created_at: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  sede_id?: string | null;
  costo_estimado?: number | null;
  costo_final?: number | null;
  seguimiento?: any[] | null;
  registrado_por?: string | null;
  notas?: string | null;
  items?: ServicioItem[] | null;
  comprobante_url?: string | null;
  comprobante_referencia?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  // Clasificación y cobro de la orden (alimentan el Reporte de Ventas)
  categoria?: string | null;
  metodos_pago?: Record<string, number> | null;
  con_iva?: boolean | null;
  tasa_cambio?: number | null;
  total_pagado?: number | null;
  vehiculos?: { marca: string; modelo: string; placa: string; anio?: number; clientes?: { nombre: string; apellido: string; telefono: string } | null } | null;
}

const ESTADOS = ['pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'cancelada'];
// Trabajo "vivo" del taller: lo que todavía no se ha completado ni cancelado.
const ESTADOS_ACTIVOS = ['pendiente', 'confirmada', 'en_revision', 'en_proceso', 'en_progreso'];

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; glow: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20',  glow: 'shadow-amber-500/20', icon: AlertCircle },
  confirmada:  { label: 'Confirmada',  color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',    glow: 'shadow-blue-500/20',  icon: Calendar },
  en_revision: { label: 'Revisión',    color: 'text-fuchsia-400',bg: 'bg-fuchsia-400/10 border-fuchsia-400/20',glow: 'shadow-fuchsia-500/20', icon: Search },
  en_proceso:  { label: 'En Proceso',  color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20', glow: 'shadow-violet-500/20', icon: RefreshCw },
  completada:  { label: 'Completada',  color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20',  glow: 'shadow-green-500/20', icon: CheckCircle },
  cancelada:   { label: 'Cancelada',   color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',      glow: 'shadow-red-500/20',   icon: X },
};

const SERVICIO_LABELS: Record<string, string> = {
  mecanica: 'Mecánica', electronica: 'Electrónica', cerrajeria: 'Cerrajería',
  diagnostico: 'Diagnóstico', motor: 'Motor', emergencia: 'Emergencia', otro: 'General',
};

// ── Main Component ───────────────────────────────────────────
// Helper para formatear nombre de cliente y omitir "WHATSAPP" o "ADMIN IA"
const getDisplayName = (cita: any) => {
  const relName = cita.vehiculos?.clientes
    ? `${cita.vehiculos.clientes.nombre} ${cita.vehiculos.clientes.apellido}`.trim()
    : '';

  let raw = relName;
  if (cita.nombre_cliente && cita.nombre_cliente.trim() !== relName && cita.nombre_cliente.trim() !== '') {
     raw = cita.nombre_cliente;
  }

  if (!raw) return 'NO DEFINIDO';
  const upper = raw.toUpperCase();
  // Marcadores de "sin cliente" o registros automáticos
  if (
    upper.includes('WHATSAPP') || upper.includes('ADMIN IA') ||
    upper === 'NO DEFINIDO' || upper === 'SIN DEFINIR' || upper === 'CONSUMIDOR FINAL'
  ) return 'NO DEFINIDO';
  // Si NO hay cliente real vinculado y el "nombre" coincide con quien lo registró
  // (modo dios / admin), entonces no es un cliente: mostrar NO DEFINIDO.
  const reg = (cita.registrado_por || '').trim().toUpperCase();
  if (!cita.cliente_id && !cita.vehiculos?.clientes && reg && upper === reg) {
    return 'NO DEFINIDO';
  }
  return raw;
};

const getDisplayVehicle = (cita: any) => {
  const relVeh = cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}`.trim() : '';
  let raw = relVeh;
  if (cita.vehiculo_info && cita.vehiculo_info.trim() !== relVeh && cita.vehiculo_info.trim() !== '') {
    raw = cita.vehiculo_info;
  }
  return raw || '—';
};

const getDisplayPlaca = (cita: any) => {
  const relPlaca = cita.vehiculos?.placa || '';
  let raw = relPlaca;
  if (cita.placa && cita.placa.trim() !== relPlaca && cita.placa.trim() !== '') {
    raw = cita.placa;
  }
  return raw || 'S/P';
};

export default function ServiciosPage() {
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const [citas, setCitas] = useState<CitaServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [dateFilter, setDateFilter] = useState<'hoy' | 'semana' | 'mes' | 'todos'>('hoy');
  const [specificDateFilter, setSpecificDateFilter] = useState('');
  
  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [editCita, setEditCita] = useState<CitaServicio | null>(null);
  const [trackingCita, setTrackingCita] = useState<CitaServicio | null>(null);
  const [invoiceCita, setInvoiceCita] = useState<CitaServicio | null>(null);
  const [budgetCita, setBudgetCita] = useState<CitaServicio | null>(null);
  const [gastosCita, setGastosCita] = useState<CitaServicio | null>(null);
  // Modo "Pendientes": ignora la fecha y muestra todo el trabajo vivo del taller.
  const [soloPendientes, setSoloPendientes] = useState(false);
  // Cambio de estado pendiente de confirmar (servicio completado que ya es venta).
  const [pendingEstadoChange, setPendingEstadoChange] = useState<{ cita: CitaServicio; nuevoEstado: string } | null>(null);
  // Modal de cobro al finalizar un servicio (captura banco exacto + IVA)
  const [cobroModal, setCobroModal] = useState<{ cita: CitaServicio; nuevoEstado: string } | null>(null);
  const [cobroBins, setCobroBins] = useState<Bins>(emptyBins());
  // Tasa elegida para este cobro. 0 = la del día. Se guarda con la venta, así
  // que un cobro al paralelo deja de convertirse al oficial por descuido.
  const [cobroTasa, setCobroTasa] = useState<number | null>(null);
  const [cobroConIva, setCobroConIva] = useState(false);
  const [cobroProcesando, setCobroProcesando] = useState(false);
  const [inventory, setInventory] = useState<any[]>([]);
  const [selectedForDual, setSelectedForDual] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [globalBcvRate, setGlobalBcvRate] = useState(0);

  useEffect(() => {
    fetch('/api/rates').then(res => res.json()).then(data => { if (data.bcv) setGlobalBcvRate(data.bcv); }).catch(console.error);
  }, []);

  const loadCitas = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: invData } = await supabase.from('inventario').select('nombre, precio_usd').eq('activo', true);
      setInventory(invData || []);

      const { data, error } = await withSedeFilter(supabase.from('servicios'))
        .select(`
          id, fecha, hora, tipo, tipo_personalizado, descripcion, estado,
          nombre_cliente, vehiculo_info, placa, telefono, created_at,
          cliente_id, vehiculo_id, sede_id, seguimiento, notas, items,
          costo_estimado, costo_final, registrado_por, fecha_inicio, fecha_fin,
          categoria, metodos_pago, con_iva, tasa_cambio, total_pagado,
          vehiculos (marca, modelo, placa, anio, clientes (nombre, apellido, telefono))
        `)
        .order('fecha', { ascending: false })
        .limit(200);

      if (error) console.error('Error:', error.message);
      setCitas((data as unknown as CitaServicio[]) || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { 
    loadCitas(); 
    setMounted(true);
  }, [loadCitas]);

  const handleDelete = async (id: string) => {
    if (!can('servicios', 'eliminar')) return alert('No tienes permisos para eliminar servicios.');
    if (!confirm('¿Estás seguro de eliminar este ticket de servicio? Esta acción no se puede deshacer.')) return;
    try {
      const { error } = await withSedeFilter(supabase!.from('servicios')).delete().eq('id', id);
      if (error) throw error;
      setCitas(prev => prev.filter(c => c.id !== id));
      logActivity({
        usuario: user?.nombre || 'Admin',
        modulo: 'Servicios',
        accion: 'Eliminó ticket',
        detalles: `Ticket #${id.slice(0,5)} eliminado.`
      });
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente', confirmada: 'Confirmada', en_revision: 'En Revisión',
      en_proceso: 'En Proceso', completada: 'Completada',
      finalizado: 'Finalizado', cancelada: 'Cancelada', cancelado: 'Cancelado'
    };
    return labels[estado] || estado;
  };

  const getTransicionInfo = (viejo: string, nuevo: string) => {
    const trans: Record<string, { accion: string; fmt: string }> = {
      'pendiente->confirmada': { accion: 'Confirmó servicio', fmt: 'Servicio confirmado' },
      'pendiente->en_proceso': { accion: 'Inició servicio', fmt: 'Servicio iniciado' },
      'pendiente->completada': { accion: 'Completó servicio', fmt: 'Servicio completado' },
      'pendiente->cancelada': { accion: 'Canceló servicio', fmt: 'Servicio cancelado' },
      'confirmada->en_proceso': { accion: 'Inició trabajo', fmt: 'Trabajo iniciado' },
      'confirmada->completada': { accion: 'Completó servicio', fmt: 'Servicio completado' },
      'confirmada->cancelada': { accion: 'Canceló servicio', fmt: 'Servicio cancelado' },
      'en_proceso->completada': { accion: 'Finalizó servicio', fmt: 'Servicio finalizado' },
      'en_proceso->cancelada': { accion: 'Canceló servicio', fmt: 'Servicio cancelado' },
    };
    const key = `${viejo}->${nuevo}`;
    if (trans[key]) return trans[key];
    return { accion: `Cambió estado (${getEstadoLabel(viejo)} → ${getEstadoLabel(nuevo)})`, fmt: `Estado cambiado: ${getEstadoLabel(viejo)} → ${getEstadoLabel(nuevo)}` };
  };

  // Aplica el cambio de estado real (y registra venta si pasa a completado).
  // `cobro` (opcional) trae el desglose por banco exacto capturado en el modal de cobro.
  const applyEstadoChange = async (
    cita: CitaServicio,
    nuevoEstado: string,
    // `tasa` es con la que se convirtió lo cobrado en bolívares. Viaja con el
    // cobro porque no siempre es la del día: en el taller se cobra tanto al
    // BCV como al de Binance P2P, y convertir con la que no era descuadra el
    // reporte sin dejar rastro de por qué.
    cobro?: { bins: Bins; conIva: boolean; saldo: number; tasa?: number }
  ) => {
    const COMPLETED_STATES = ['completada', 'finalizado', 'finalizada', 'completado'];
    const id = cita.id;
    try {
      const info = getTransicionInfo(cita.estado, nuevoEstado);
      const newEntry = {
        fecha: new Date().toISOString(),
        accion: info.fmt,
        usuario: user?.nombre || 'Admin',
        tipo: 'sistema'
      };
      const newSeguimiento = [...(cita.seguimiento || []), newEntry];

      // ── Tiempos reales del servicio ────────────────────────────────────────
      // fecha_inicio: al arrancar el trabajo (o si nunca se registró).
      // fecha_fin: al completarlo. Si se reabre, se limpia para no dejar datos falsos.
      const ahoraISO = new Date().toISOString();
      const IN_PROGRESS_STATES = ['en_proceso', 'en_progreso', 'en_revision', 'confirmada'];
      const updatePayload: any = {
        estado: nuevoEstado,
        updated_at: ahoraISO,
        seguimiento: newSeguimiento,
      };
      if (!cita.fecha_inicio && (IN_PROGRESS_STATES.includes(nuevoEstado) || COMPLETED_STATES.includes(nuevoEstado))) {
        updatePayload.fecha_inicio = ahoraISO;
      }
      if (COMPLETED_STATES.includes(nuevoEstado)) {
        updatePayload.fecha_fin = ahoraISO;
      } else if (COMPLETED_STATES.includes(cita.estado)) {
        // Se reabrió un servicio ya completado → deja de tener finalización.
        updatePayload.fecha_fin = null;
      }

      const { error } = await withSedeFilter(supabase!.from('servicios'))
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      setCitas(prev => prev.map(c => c.id === id ? { ...c, estado: nuevoEstado, seguimiento: newSeguimiento } : c));

      const clienteNombre = getDisplayName(cita) || 'Consumidor Final';
      const vehiculoStr = getDisplayVehicle(cita);
      const sedeName = currentSede?.nombre || 'General';

      // ── Auto-register sale in ventas_dia when marking as completada/finalizado ──
      // Dashboard-originated sales go only to ventas_dia. Bot-originated go to ventas_silenciadores.
      // This ensures each service appears exactly once in the combined ventas view.
      if (COMPLETED_STATES.includes(nuevoEstado) && supabase) {
        const precio = Number(cita.costo_final ?? cita.costo_estimado ?? 0);
        const sedeId = cita.sede_id || currentSede?.id;
        if (precio > 0 && sedeId) {
          const refTag = `[ServicioID: ${id}]`;
          const descStr = cita.descripcion || 'Servicio de taller';
          const notesFinal = `${descStr} | Cliente: ${clienteNombre} | Vehículo: ${vehiculoStr} ${refTag}`.trim();
          const desglose = parseDescripcionItems(descStr, precio);

          // Métodos de pago reales capturados en la orden; si no hay, se asume divisas.
          const svcAny = cita as any;
          const metodos: Record<string, number> =
            (svcAny.metodos_pago && Object.keys(svcAny.metodos_pago).length > 0)
              ? svcAny.metodos_pago
              : { efectivo_usd: precio };
          // Clasificación de la orden (si falta, se infiere de la descripción).
          const cat = svcAny.categoria || inferirCategoria(descStr || cita.tipo_personalizado || cita.tipo);

          // Dedup check — update if already registered (e.g., if invoice modal later replaces this entry)
          const { data: existingVD } = await supabase.from('ventas_dia')
            .select('id').like('notas', `%${refTag}%`).limit(1).maybeSingle();

          // Clasificación precisa por banco (si viene del modal de cobro) o fallback a Divisas.
          let extra: Record<string, any>;
          if (cobro) {
            const mapped = buildVentaDiaFields({
              bins: cobro.bins,
              subtotal: precio,
              conIva: cobro.conIva,
              saldo: cobro.saldo,
              tasa: cobro.tasa || globalBcvRate || 0,
              deptItems: [{ dept: deptFromServicioTipo(cita.tipo), monto: precio }],
            });
            const totalConIva = precio * (cobro.conIva ? 1.16 : 1);
            const hayAbono = cobro.saldo > 0.01;
            extra = {
              ...mapped,
              con_iva: cobro.conIva,
              clientes_atendidos: 1,
              tiene_abono: hayAbono,
              abono: hayAbono ? Math.max(0, Math.round((totalConIva - cobro.saldo) * 100) / 100) : 0,
              saldo_pendiente: cobro.saldo,
              estado: hayAbono ? 'pendiente' : 'pagado',
            };
          } else {
            extra = { metodos_pago: { divisas: precio }, con_iva: false, estado: 'pagado' };
          }

          const vdData = {
            fecha: getLocalISODate(),
            cliente: clienteNombre,
            // Identidad real del cliente/vehículo en el Reporte de Ventas
            cliente_id: cita.cliente_id || null,
            vehiculo_id: cita.vehiculo_id || null,
            servicio_id: id,
            placa: cita.placa || cita.vehiculos?.placa || null,
            vehiculo_info: vehiculoStr || null,
            // Clasificación del servicio + su columna correspondiente
            categoria: cat,
            ...buildCategoriaColumns(cat, precio),
            total_ingresos: precio,
            total_servicios: 1,
            total_clientes: 1,
            desglose,
            metodos_pago: metodos,
            ...buildPagoColumns(metodos),
            tasa_cambio: cobro?.tasa || svcAny.tasa_cambio || globalBcvRate || 0,
            con_iva: !!svcAny.con_iva,
            notas: notesFinal,
            creado_por: user?.nombre || 'Admin',
            sede_id: sedeId,
            fecha_registro: new Date().toISOString(),
            registro_atrasado: false,
            ...extra,
          };

          const vdResult = existingVD
            ? await supabase.from('ventas_dia').update(vdData).eq('id', existingVD.id)
            : await supabase.from('ventas_dia').insert(vdData);

          if (vdResult.error) throw new Error(`Error al registrar venta: ${vdResult.error.message}`);
        }
      }

      logActivity({
        usuario: user?.nombre || 'Admin',
        modulo: 'Servicios',
        accion: info.accion,
        detalles: `${info.fmt}: ${clienteNombre} en la sede de ${sedeName}`,
        referencia_id: id,
        referencia_tabla: 'servicios'
      });
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  // Cambio de estado con verificación: si el servicio sale de "completado" y ya tiene una
  // VENTA asociada, abre un modal de confirmación (en vez de cambiar directo).
  const updateEstado = async (id: string, nuevoEstado: string) => {
    if (!can('servicios', 'editar')) return alert('No tienes permisos para cambiar el estado de los servicios.');
    const cita = citas.find(c => c.id === id);
    if (!cita || cita.estado === nuevoEstado) return;

    const COMPLETED_STATES = ['completada', 'finalizado', 'finalizada', 'completado'];
    if (COMPLETED_STATES.includes(cita.estado) && !COMPLETED_STATES.includes(nuevoEstado) && supabase) {
      try {
        const refTag = `[ServicioID: ${id}]`;
        const [{ data: vd }, { data: vs }] = await Promise.all([
          supabase.from('ventas_dia').select('id').like('notas', `%${refTag}%`).limit(1).maybeSingle(),
          supabase.from('ventas_silenciadores').select('id').like('notas', `%${refTag}%`).limit(1).maybeSingle(),
        ]);
        if (vd || vs) { setPendingEstadoChange({ cita, nuevoEstado }); return; }
      } catch { /* si falla la verificación, continuamos con el cambio normal */ }
    }

    // Al ENTRAR a completado con un precio > 0: abrir modal de cobro para clasificar el pago por banco.
    const entrandoCompletado = COMPLETED_STATES.includes(nuevoEstado) && !COMPLETED_STATES.includes(cita.estado);
    const precioServicio = Number(cita.costo_final ?? cita.costo_estimado ?? 0);
    if (entrandoCompletado && precioServicio > 0 && (cita.sede_id || currentSede?.id)) {
      setCobroBins(emptyBins());
      setCobroConIva(false);
      setCobroTasa(null);
      setCobroModal({ cita, nuevoEstado });
      return;
    }

    await applyEstadoChange(cita, nuevoEstado);
  };

  // Confirma el cobro del modal → finaliza el servicio y registra la venta clasificada por banco.
  const confirmCobroServicio = async () => {
    if (!cobroModal) return;
    const { cita, nuevoEstado } = cobroModal;
    const precio = Number(cita.costo_final ?? cita.costo_estimado ?? 0);
    // Igual que en la vista: con Cashea el IVA va siempre.
    const conIvaEfectivo = cobroConIva || (cobroBins.cashea || 0) > 0;
    const totalConIva = precio * (conIvaEfectivo ? 1.16 : 1);
    const pagado = binsTotalUSD(cobroBins, cobroTasa || globalBcvRate || 0);
    const saldo = Math.max(0, Math.round((totalConIva - pagado) * 100) / 100);
    const tasaDelCobro = cobroTasa || globalBcvRate || 0;
    setCobroProcesando(true);
    try {
      await applyEstadoChange(cita, nuevoEstado, { bins: cobroBins, conIva: conIvaEfectivo, saldo, tasa: tasaDelCobro });
      setCobroModal(null);
      setCobroBins(emptyBins());
      setCobroConIva(false);
    } catch (e: any) {
      alert('Error al registrar el cobro: ' + (e?.message || e));
    } finally {
      setCobroProcesando(false);
    }
  };

  // Confirmado en el modal: elimina la venta asociada y aplica el cambio de estado.
  const confirmEstadoChangeConVenta = async () => {
    if (!pendingEstadoChange || !supabase) return;
    const { cita, nuevoEstado } = pendingEstadoChange;
    setPendingEstadoChange(null);
    try {
      const refTag = `[ServicioID: ${cita.id}]`;
      const [{ data: vd }, { data: vs }] = await Promise.all([
        supabase.from('ventas_dia').select('id').like('notas', `%${refTag}%`).limit(1).maybeSingle(),
        supabase.from('ventas_silenciadores').select('id').like('notas', `%${refTag}%`).limit(1).maybeSingle(),
      ]);
      if (vd) await supabase.from('ventas_dia').delete().eq('id', vd.id);
      if (vs) await supabase.from('ventas_silenciadores').delete().eq('id', vs.id);
      logActivity({
        usuario: user?.nombre || 'Admin', modulo: 'Servicios', accion: 'Eliminó venta por cambio de estado',
        detalles: `Servicio #${cita.id.slice(0, 5)} salió de completado; venta asociada eliminada.`,
      });
    } catch (e: any) {
      alert('No se pudo eliminar la venta asociada: ' + (e?.message || e));
      return;
    }
    await applyEstadoChange(cita, nuevoEstado);
  };

  // Total de servicios activos (para el badge del botón "Pendientes")
  const pendientesCount = citas.filter(c =>
    ESTADOS_ACTIVOS.includes(String(c.estado || '').toLowerCase())
  ).length;

  const filtered = citas.filter(c => {
    // 1. Filtro de Texto
    const cliente = getDisplayName(c);
    const vehiculo = c.vehiculos ? `${c.vehiculos.marca} ${c.vehiculos.modelo}` : c.vehiculo_info || '';
    const txt = `${cliente} ${vehiculo} ${c.placa} ${c.descripcion}`.toLowerCase();
    const matchText = search === '' || txt.includes(search.toLowerCase());

    if (!matchText) return false;

    // 1b. Modo "Pendientes": muestra TODO lo que sigue activo (pendiente, confirmada,
    // en revisión, en proceso) sin importar la fecha — es el trabajo vivo del taller.
    if (soloPendientes) {
      return ESTADOS_ACTIVOS.includes(String(c.estado || '').toLowerCase());
    }

    // 2. Filtro de Fecha
    const rawDateStr = c.fecha || c.created_at;
    if (!rawDateStr) return false;
    
    // Para 'hoy' y fecha específica, usamos substring para no pelear con zonas horarias
    const citaIsoDate = rawDateStr.split('T')[0];

    if (specificDateFilter) {
      return citaIsoDate === specificDateFilter;
    }

    if (dateFilter === 'todos') return true;
    
    // Convert to Date object safely
    const citaDate = new Date(rawDateStr);
    
    if (dateFilter === 'hoy') {
      return citaIsoDate === getLocalISODate();
    }
    
    const now = new Date();
    if (dateFilter === 'semana') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return citaDate >= weekAgo;
    }

    if (dateFilter === 'mes') {
      const monthAgo = new Date();
      monthAgo.setMonth(now.getMonth() - 1);
      return citaDate >= monthAgo;
    }

    return true;
  });

  const handleDualPrint = () => {
    if (selectedForDual.length === 0) return;
    
    const selectedCitas = citas.filter(c => selectedForDual.includes(c.id));
    const dataList = selectedCitas.map(cita => {
      const clientName = getDisplayName(cita) || 'CONSUMIDOR FINAL';
      const vehicleStr = getDisplayVehicle(cita);
      
      return {
        id: cita.id,
        fecha: cita.fecha,
        cliente: clientName,
        vehiculo: vehicleStr,
        items: [{
          descripcion: (cita.tipo === 'otro' ? 'Servicio General' : `Servicio de ${cita.tipo}`).toUpperCase(),
          cantidad: 1,
          precio_unitario: cita.costo_estimado || 0,
          total: cita.costo_estimado || 0
        }],
        total: cita.costo_estimado || 0,
        tasa_bcv: globalBcvRate || 518.0, 
        total_ves: (cita.costo_estimado || 0) * (globalBcvRate || 518.0)
      };
    });

    generateInvoicePDF(dataList, { mode: 'dual', currencyMode: 'dual' });
    setSelectedForDual([]);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      
      {/* ── Glass Toolbar ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-lg shadow-primary/10">
            <Wrench className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
              Servicios
            </h1>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {loading ? 'Sincronizando...' : `${filtered.length} tickets activos en esta sede`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Pendientes: todo el trabajo vivo del taller, sin filtro de fecha */}
          <button
            onClick={() => setSoloPendientes(v => !v)}
            title="Ver todos los servicios pendientes, confirmados, en revisión y en proceso"
            className={cn(
              'relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all shrink-0',
              soloPendientes
                ? 'bg-[#f59e0b] text-black border-[#f59e0b] shadow-lg shadow-[#f59e0b]/20'
                : 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30 hover:bg-[#f59e0b]/20'
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            Pendientes
            {pendientesCount > 0 && (
              <span className={cn(
                'min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center',
                soloPendientes ? 'bg-black/20 text-black' : 'bg-[#f59e0b] text-black'
              )}>
                {pendientesCount}
              </span>
            )}
          </button>

          <div className="relative flex-1 min-w-[180px] lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              placeholder="Buscar cliente, placa, falla..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: '7d' },
                { id: 'mes', label: '30d' },
                { id: 'todos', label: 'Todo' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    setDateFilter(f.id as any);
                    setSpecificDateFilter('');
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    dateFilter === f.id && !specificDateFilter ? "bg-primary/20 text-primary shadow-inner" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative flex items-center">
              <input
                type="date"
                value={specificDateFilter}
                onChange={(e) => {
                  setSpecificDateFilter(e.target.value);
                  if (e.target.value) setDateFilter('todos');
                }}
                className={cn(
                  "pl-3 pr-8 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40",
                  specificDateFilter ? "bg-primary/10 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                )}
                title="Filtrar por fecha específica"
              />
              {specificDateFilter && (
                <button 
                  onClick={() => setSpecificDateFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-foreground/10 hover:bg-foreground/20 rounded-full flex items-center justify-center transition-all"
                  title="Limpiar fecha"
                >
                  <X className="w-3 h-3 text-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1">
            <button 
              onClick={() => setViewMode('kanban')}
              className={cn("p-2 rounded-xl transition-all", viewMode === 'kanban' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-xl transition-all", viewMode === 'list' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button 
            onClick={() => setShowNewModal(true)}
            className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 px-6 shadow-xl shadow-primary/20 gap-2"
          >
            <Plus className="w-4 h-4" /> Nueva Orden
          </Button>

          <button 
            onClick={loadCitas}
            className="w-11 h-11 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── View Switcher ─────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === 'kanban' ? (
          <motion.div 
            key="kanban"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 xl:gap-6"
          >
            {ESTADOS.map(estado => (
              <KanbanColumn 
                key={estado}
                estado={estado}
                items={filtered.filter(c => c.estado === estado)}
                onEdit={setEditCita}
                onDelete={handleDelete}
                onTracking={setTrackingCita}
                onInvoice={setInvoiceCita}
                onBudget={setBudgetCita}
                onGastos={setGastosCita}
                onMove={updateEstado}
                selectedForDual={selectedForDual}
                setSelectedForDual={setSelectedForDual}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden"
          >
             <ListView 
              items={filtered} 
              onEdit={setEditCita} 
              onDelete={handleDelete} 
              onTracking={setTrackingCita}
              onInvoice={setInvoiceCita}
              onBudget={setBudgetCita}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Dual Print Bar ──────────────────────────── */}
      <AnimatePresence>
        {selectedForDual.length > 0 && (
          <motion.div 
            key="dual-print-bar"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] w-full max-w-xl px-4"
          >
            <div className="bg-black/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-[0_30px_60px_rgba(0,0,0,0.8)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-widest">Impresión Dual</p>
                  <p className="text-[10px] text-muted-foreground font-bold">
                    {selectedForDual.length === 1 
                      ? '1 factura seleccionada (2 copias)' 
                      : '2 facturas seleccionadas (lado a lado)'}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedForDual([])}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-muted-foreground hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <Button 
                  onClick={handleDualPrint}
                  disabled={selectedForDual.length > 2}
                  className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-[10px] uppercase h-10 px-6"
                >
                  Generar PDF {selectedForDual.length === 2 && 'Dual'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ────────────────────────────────────────────── */}
      {showNewModal && <ServiceFormModal onClose={() => { setShowNewModal(false); loadCitas(); }} globalBcvRate={globalBcvRate} />}
      {editCita && <ServiceFormModal cita={editCita} onClose={() => { setEditCita(null); loadCitas(); }} globalBcvRate={globalBcvRate} />}
      {trackingCita && <TrackingModal cita={trackingCita} onClose={() => { setTrackingCita(null); loadCitas(); }} />}
      {invoiceCita && <InvoiceModal cita={invoiceCita} citas={citas} inventory={inventory} onClose={() => { setInvoiceCita(null); loadCitas(); }} globalBcvRate={globalBcvRate} />}
      {budgetCita && <BudgetModal cita={budgetCita} inventory={inventory} onClose={() => setBudgetCita(null)} />}
      {gastosCita && (
        <GastosVehiculoModal
          canDelete={can('servicios', 'eliminar')}
          onClose={() => setGastosCita(null)}
          target={{
            vehiculo_id: gastosCita.vehiculo_id,
            cliente_id: gastosCita.cliente_id,
            servicio_id: gastosCita.id,
            placa: gastosCita.placa || gastosCita.vehiculos?.placa || null,
            vehiculo_info: gastosCita.vehiculo_info
              || (gastosCita.vehiculos ? `${gastosCita.vehiculos.marca} ${gastosCita.vehiculos.modelo}` : null),
            cliente_nombre: gastosCita.nombre_cliente
              || (gastosCita.vehiculos?.clientes ? `${gastosCita.vehiculos.clientes.nombre} ${gastosCita.vehiculos.clientes.apellido || ''}`.trim() : null),
            sede_id: gastosCita.sede_id || null,
          }}
        />
      )}

      {/* ⚠️ Confirmación al sacar de "completado" un servicio que ya se convirtió en venta */}
      {pendingEstadoChange && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-card shadow-2xl overflow-hidden">
            <div className="p-5 sm:p-6 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-amber-500">Este servicio ya es una venta</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Vas a cambiarlo de estado completado.</p>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                <p className="font-black text-foreground">
                  🚗 {getDisplayVehicle(pendingEstadoChange.cita)}
                </p>
                <p className="text-muted-foreground">
                  Cambio: <span className="font-bold uppercase">{String(pendingEstadoChange.cita.estado).replace(/_/g, ' ')}</span>
                  {' → '}
                  <span className="font-bold uppercase">{String(pendingEstadoChange.nuevoEstado).replace(/_/g, ' ')}</span>
                </p>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Al salir de <b>completado</b> se <b>eliminará la venta asociada</b> del sistema.
                Podrás volver a marcarlo como <b>Completada</b> más tarde y se <b>registrará como venta de nuevo</b> automáticamente.
              </p>
            </div>
            <div className="p-4 sm:p-5 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
              <button
                onClick={() => setPendingEstadoChange(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold text-muted-foreground hover:bg-muted/50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEstadoChangeConVenta}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white transition-all"
              >
                Cambiar estado y eliminar venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💵 Modal de cobro al finalizar servicio — clasifica el pago por banco exacto */}
      {cobroModal && (() => {
        const precio = Number(cobroModal.cita.costo_final ?? cobroModal.cita.costo_estimado ?? 0);
        // Cashea financia SOBRE el precio con IVA: la inicial y las cuotas se
        // calculan de ese total. Si se cobrara sin IVA, lo que financia Cashea
        // y lo que cobra el taller dejarían de ser la misma cifra.
        const casheaEnJuego = (cobroBins.cashea || 0) > 0;
        const ivaEfectivo = cobroConIva || casheaEnJuego;
        const totalConIva = Math.round(precio * (ivaEfectivo ? 1.16 : 1) * 100) / 100;
        const pagado = binsTotalUSD(cobroBins, cobroTasa || globalBcvRate || 0);
        const saldo = Math.max(0, Math.round((totalConIva - pagado) * 100) / 100);
        const esCredito = saldo > 0.01;
        return (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-green-500/30 bg-card shadow-2xl">
              <div className="p-4 sm:p-5 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-green-500/20 flex items-center justify-center shrink-0">
                    <Banknote className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-green-500">Finalizar y cobrar</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{getDisplayName(cobroModal.cita) || 'Consumidor Final'} · {getDisplayVehicle(cobroModal.cita)}</p>
                  </div>
                </div>
                <button onClick={() => !cobroProcesando && setCobroModal(null)} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" checked={ivaEfectivo} disabled={casheaEnJuego}
                      onChange={e => setCobroConIva(e.target.checked)}
                      title={casheaEnJuego ? 'Con Cashea el IVA del 16% es obligatorio.' : undefined}
                      className="w-4 h-4 rounded border-border text-primary disabled:opacity-60" />
                    <span className="text-xs font-black text-muted-foreground group-hover:text-primary transition-colors uppercase">Aplicar IVA (16%)</span>
                  </label>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total a cobrar</p>
                    <p className="text-2xl font-black text-primary tracking-tight italic">${totalConIva.toFixed(2)}</p>
                  </div>
                </div>

                <DesglosePagoBancos
                  bins={cobroBins}
                  onBinsChange={setCobroBins}
                  totalUSD={totalConIva}
                  tasa={cobroTasa || globalBcvRate || 0}
                  tasaAuto={globalBcvRate}
                  onTasaChange={setCobroTasa}
                />

                {esCredito && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-xs font-bold text-amber-500 uppercase">Queda por cobrar (crédito)</span>
                    <span className="text-sm font-black text-amber-500">${saldo.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-5 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sticky bottom-0 bg-card">
                <button onClick={() => !cobroProcesando && setCobroModal(null)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold text-muted-foreground hover:bg-muted/50 transition-all">
                  Cancelar
                </button>
                <button onClick={confirmCobroServicio} disabled={cobroProcesando}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-green-500 hover:bg-green-600 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                  {cobroProcesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {esCredito ? 'Finalizar (queda saldo)' : 'Finalizar y cobrar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Kanban Components ──────────────────────────────────────────
function KanbanColumn({ estado, items, onEdit, onDelete, onTracking, onInvoice, onBudget, onGastos, onMove, selectedForDual, setSelectedForDual }: any) {
  const cfg = ESTADO_CONFIG[estado];
  const Icon = cfg.icon;

  return (
    <div 
      id={`kanban-col-${estado}`}
      className="flex flex-col gap-4 min-h-[500px] rounded-[32px] p-2 transition-colors duration-300"
    >
      <div className={cn("flex items-center justify-between p-3 rounded-2xl border bg-black/20", cfg.bg)}>
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", cfg.color)} />
          <span className={cn("text-xs font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
        </div>
        <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-full text-muted-foreground">{items.length}</span>
      </div>

      <div className="flex-1 space-y-4">
        <AnimatePresence mode="popLayout">
          {items.map((cita: CitaServicio, idx: number) => (
            <ServiceCard 
              key={cita.id || idx}
              cita={cita} 
              onEdit={onEdit} 
              onDelete={onDelete} 
              onTracking={onTracking}
              onInvoice={onInvoice}
              onBudget={onBudget}
              onGastos={onGastos}
              onMove={onMove}
              isSelected={selectedForDual.includes(cita.id)}
              onSelect={(selected: boolean) => {
                if (selected) {
                  if (selectedForDual.length < 2) {
                    setSelectedForDual([...selectedForDual, cita.id]);
                  } else {
                    alert('Solo puedes seleccionar máximo 2 facturas para impresión dual.');
                  }
                } else {
                  setSelectedForDual(selectedForDual.filter((id: string) => id !== cita.id));
                }
              }}
            />
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <div className="h-24 border border-dashed border-white/5 rounded-3xl flex items-center justify-center text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
            Sin {cfg.label}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceCard({ cita, onEdit, onDelete, onTracking, onInvoice, onBudget, onGastos, onMove, isSelected, onSelect }: any) {
  const { can } = useRolePermissions();
  const lastUpdate = cita.seguimiento?.[cita.seguimiento.length - 1];

  const currentIndex = ESTADOS.indexOf(cita.estado);
  const prevEstado = currentIndex > 0 ? ESTADOS[currentIndex - 1] : null;
  const nextEstado = currentIndex < ESTADOS.length - 1 ? ESTADOS[currentIndex + 1] : null;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') setIsMobile(window.innerWidth < 768);
  }, []);

  const handleDragEnd = (event: any, info: any) => {
    const x = info.point.x;
    const y = info.point.y;
    
    for (const estado of ESTADOS) {
      const col = document.getElementById(`kanban-col-${estado}`);
      if (col) {
        const rect = col.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          if (estado !== cita.estado) {
            onMove(cita.id, estado);
          }
          break;
        }
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      drag={!isMobile}
      dragSnapToOrigin={true}
      dragElastic={0.05}
      onDragEnd={handleDragEnd}
      className="group relative bg-card/50 border border-border/50 rounded-3xl p-5 hover:border-primary/40 hover:bg-card/80 transition-colors shadow-xl select-none"
    >
      {/* Botones de traslado rápido (Izquierda/Derecha) */}
      <AnimatePresence>
        {prevEstado && (
          <motion.button
            key="prev-estado-btn"
            initial={{ opacity: 0, x: 10 }}
            whileHover={{ scale: 1.2, backgroundColor: '#f59e0b', color: '#000' }}
            animate={{ opacity: 1, x: 0 }}
            onClick={(e) => { e.stopPropagation(); onMove(cita.id, prevEstado); }}
            className="absolute left-[-15px] top-1/2 -translate-y-1/2 z-[60] w-8 h-8 rounded-full bg-black/80 border border-[#f59e0b]/50 text-[#f59e0b] hidden group-hover:flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
        )}
        {nextEstado && (
          <motion.button
            key="next-estado-btn"
            initial={{ opacity: 0, x: -10 }}
            whileHover={{ scale: 1.2, backgroundColor: '#f59e0b', color: '#000' }}
            animate={{ opacity: 1, x: 0 }}
            onClick={(e) => { e.stopPropagation(); onMove(cita.id, nextEstado); }}
            className="absolute right-[-15px] top-1/2 -translate-y-1/2 z-[60] w-8 h-8 rounded-full bg-black/80 border border-[#f59e0b]/50 text-[#f59e0b] hidden group-hover:flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Checkbox de Selección Dual */}
      <div className="absolute top-4 left-4 z-[55]">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="w-5 h-5 rounded-lg border-white/10 bg-black/40 text-primary focus:ring-primary/40 transition-all cursor-pointer accent-primary"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex justify-between items-start mb-4 pl-8">
        <div>
          <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors uppercase tracking-tight">
            {getDisplayName(cita)}
          </h4>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5 flex items-center gap-1 uppercase tracking-widest">
            <Car className="w-3 h-3" /> {getDisplayVehicle(cita)}
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(cita)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          {can('servicios', 'eliminar') && (
            <button onClick={() => onDelete(cita.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 w-fit italic">
              {cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || cita.tipo}
            </span>
            <span className="text-[9px] text-muted-foreground font-bold mt-1 flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" /> {cita.fecha} · {cita.hora}
            </span>
          </div>
          <span className="text-[10px] font-mono font-black text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
            {getDisplayPlaca(cita)}
          </span>
        </div>

        {cita.descripcion && (
          <p className="text-[11px] text-muted-foreground/80 line-clamp-2 italic leading-relaxed">
            "{cita.descripcion}"
          </p>
        )}

        {/* Tracking Summary */}
        {lastUpdate && (
          <div className="pt-2 border-t border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              <span className="text-[9px] font-black text-[#f59e0b] uppercase tracking-widest">Último Reporte</span>
            </div>
            <p className="text-[10px] text-foreground/70 font-medium truncate italic">
              {lastUpdate.accion}
            </p>
          </div>
        )}

        {/* Registrado por */}
        {cita.registrado_por && (
          <div className="pt-2 border-t border-white/5 mt-2">
            <div className="flex items-center gap-1.5 p-1.5 bg-primary/10 rounded-md border border-primary/20 w-fit">
              <User className="w-3 h-3 text-primary" />
              <p className="text-[10px] text-primary/80 font-bold uppercase tracking-wider">
                Registrado por: <span className="text-primary font-black ml-1">{cita.registrado_por}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
        <button 
          onClick={() => onTracking(cita)}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-[#f59e0b] transition-all"
        >
          <Activity className="w-3.5 h-3.5" /> Bitácora
        </button>

        <div className="flex gap-2">
           <button
            onClick={() => onGastos?.(cita)}
            title="Gastos y utilidad de este vehículo"
            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-all shadow-lg shadow-rose-500/5"
           >
             <Wallet className="w-3.5 h-3.5" />
           </button>
           <button
            onClick={() => onInvoice(cita)}
            className="p-1.5 rounded-lg bg-[#f59e0b]/10 hover:bg-[#f59e0b] text-[#f59e0b] hover:text-black transition-all shadow-lg shadow-[#f59e0b]/5"
           >
             <Banknote className="w-3.5 h-3.5" />
           </button>
        </div>
      </div>
      
      {/* Convertir en Presupuesto */}
      <div className="px-5 pb-5 pt-1">
        <button
          onClick={() => onBudget(cita)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all font-black text-[10px] uppercase tracking-widest border border-primary/20 shadow-sm"
        >
          Convertir en Presupuesto
        </button>
      </div>
    </motion.div>
  );
}

// ── List View Component ──────────────────────────────────────
function ListView({ items, onEdit, onDelete, onTracking, onInvoice, onBudget }: any) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-white/5 border-b border-white/5">
          <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            <th className="px-6 py-4">Servicio / Cliente</th>
            <th className="px-6 py-4">Vehículo</th>
            <th className="px-6 py-4">Estado</th>
            <th className="px-6 py-4">Progreso</th>
            <th className="px-6 py-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {items.map((cita: CitaServicio, idx: number) => {
            const cfg = ESTADO_CONFIG[cita.estado] || ESTADO_CONFIG.pendiente;
            const progress = cita.seguimiento?.[cita.seguimiento.length - 1]?.progreso || 0;
            return (
              <tr key={cita.id || idx} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", cfg.bg)}>
                      <Wrench className={cn("w-3.5 h-3.5", cfg.color)} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {getDisplayName(cita)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || cita.tipo}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs text-foreground/80 font-medium">
                    {getDisplayVehicle(cita)}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">{getDisplayPlaca(cita)}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-black uppercase border", cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="w-32">
                    <div className="flex justify-between text-[9px] mb-1">
                      <span className="text-primary font-bold">{progress}%</span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onTracking(cita)} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground"><Activity className="w-4 h-4" /></button>
                    <button onClick={() => onEdit(cita)} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => onInvoice(cita)} className="p-2 rounded-xl hover:bg-white/5 text-primary"><Banknote className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Service Form Modal (Create/Edit) ──────────────────────────
function ServiceFormModal({ cita, onClose, globalBcvRate = 0 }: { cita?: CitaServicio; onClose: () => void; globalBcvRate?: number }) {
  const [formData, setFormData] = useState({
    nombre_cliente: cita?.nombre_cliente || cita?.vehiculos?.clientes?.nombre || '',
    // Saneado: solo dígitos/símbolos de teléfono (datos viejos con letras se limpian al abrir).
    telefono: String(cita?.telefono || cita?.vehiculos?.clientes?.telefono || '').replace(/[^\d+()\s-]/g, '').trim(),
    vehiculo_info: cita?.vehiculo_info || (cita?.vehiculos ? `${cita?.vehiculos.marca} ${cita?.vehiculos.modelo}` : ''),
    placa: cita?.placa || cita?.vehiculos?.placa || '',
    tipo: cita?.tipo || 'otro',
    descripcion: cita?.descripcion || '',
    costo_estimado: cita?.costo_estimado?.toString() || '',
  });
  // Clasificación del servicio → determina en qué columna del Reporte de Ventas
  // cae y, a través de la zona, qué regla de comisión se aplica.
  const [categoria, setCategoria] = useState<string>(
    (cita as any)?.categoria || inferirCategoria(cita?.descripcion || cita?.tipo_personalizado || cita?.tipo)
  );
  // Si el usuario la eligió a mano, deja de recalcularse sola.
  const [categoriaManual, setCategoriaManual] = useState<boolean>(!!(cita as any)?.categoria);
  // Métodos de pago de la orden → se vuelcan a las columnas de ventas_dia al completar.
  const [metodosPago, setMetodosPago] = useState<Record<string, number>>(
    ((cita as any)?.metodos_pago && typeof (cita as any).metodos_pago === 'object')
      ? (cita as any).metodos_pago
      : {}
  );
  const [conIva, setConIva] = useState<boolean>(!!(cita as any)?.con_iva);
  // Tasa personalizada (Bs por $) para los métodos de pago que la usen.
  const [tasaCustom, setTasaCustom] = useState<number>(0);
  // Cashea financia SOBRE el precio con IVA: de ese total salen la inicial y
  // las cuotas. Por eso el 16% deja de ser opcional en cuanto se usa, y lo
  // que no se cobre hoy queda como saldo pendiente, no como venta cerrada.
  const hayCashea = Number((metodosPago as Record<string, number>)?.cashea || 0) > 0;
  const ivaObligatorio = conIva || hayCashea;
  // Tasa REAL del día del servicio (se guarda con la orden).
  const [tasaDiaBcv, setTasaDiaBcv] = useState<number>(0);
  useEffect(() => {
    const f = (cita?.fecha || getLocalISODate()).slice(0, 10);
    fetch(`/api/tasas?fecha=${f}`)
      .then(r => r.json())
      .then(d => { if (d?.bcv) setTasaDiaBcv(d.bcv); })
      .catch(() => {});
  }, [cita?.fecha]);
  // Servicios desglosados (ítems con precio para la factura). Se autollenan desde la
  // descripción (incluida la registrada por el bot) si no hay ítems guardados.
  const [items, setItems] = useState<ServicioItem[]>(() => {
    const existing = (cita?.items as ServicioItem[] | undefined) || [];
    if (Array.isArray(existing) && existing.length > 0) {
      return existing.map(i => ({
        descripcion: i.descripcion || '',
        cantidad: Number(i.cantidad) || 1,
        precio_unitario: Number(i.precio_unitario) || 0,
        total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
      }));
    }
    const total = Number(cita?.costo_final ?? cita?.costo_estimado ?? 0);
    return parseServicioItemsFromText(cita?.descripcion || '', total);
  });
  const [staffSuggestions, setStaffSuggestions] = useState<{ nombre: string; rol: string }[]>([]);
  const sedeNomina = useSedeStore(s => s.currentSede);
  const [staffSearch, setStaffSearch] = useState('');
  const [showStaffResults, setShowStaffResults] = useState(false);

  // ── Personal a cargo + comisiones (empleados REGISTRADOS, con id) ──────────
  const [asignaciones, setAsignaciones] = useState<AsignacionEmpleado[]>([]);
  const [cargandoAsign, setCargandoAsign] = useState(!!cita);

  // Al EDITAR, se recupera quién hizo el trabajo.
  //
  // Primero las comisiones ya registradas. Si no hay ninguna —el caso de todas
  // las órdenes anteriores, que guardaban al encargado como texto dentro de las
  // notas— se pide su resolución al servidor. Antes esto solo miraba
  // `job_assignments` y por eso «Personal a cargo» salía vacío en cientos de
  // órdenes que sí decían quién las había hecho.
  useEffect(() => {
    if (!cita?.id) { setCargandoAsign(false); return; }
    let vivo = true;

    (async () => {
      try {
        const d = await fetch(`/api/nomina/jobs?ref=${cita.id}`).then(r => r.json());
        const jobs = (d.jobs || []).filter((j: any) => !j.es_override && j.estado !== 'anulado');
        if (!vivo) return;

        if (jobs.length > 0) {
          setAsignaciones(jobs.map((j: any) => ({
            empleado_id: j.empleado_id,
            es_taller: !!j.es_taller,
            nombre: j.empleado_nombre || 'Taller (sin técnico)',
            rol: j.es_taller ? 'taller' : 'mecanico',
            zona: j.zona || 'mecanica',
            item_idx: [],
            mano_obra_manual: Number(j.mano_obra) || 0,
            servicio_key: j.servicio_key || null,
          })));
          return;
        }

        const e = await fetch(`/api/nomina/encargados?servicio=${cita.id}`).then(r => r.json());
        if (!vivo) return;
        const previos = (e.encargados || []) as { empleado_id: string; nombre: string }[];
        if (previos.length === 0) return;
        setAsignaciones(previos.map(p => ({
          empleado_id: p.empleado_id,
          es_taller: false,
          nombre: p.nombre,
          rol: 'mecanico',
          // Sin comisión previa no hay zona guardada: se toma la del trabajo.
          zona: categoriaToZona(cita.categoria || inferirCategoria(cita.descripcion || cita.tipo || '')),
          item_idx: [],
          mano_obra_manual: 0,
          servicio_key: null,
        })));
      } catch { /* el formulario sigue usable sin esto */ }
      finally { if (vivo) setCargandoAsign(false); }
    })();

    return () => { vivo = false; };
  }, [cita?.id, cita?.categoria, cita?.descripcion, cita?.tipo]);

  // El texto "Encargados:" de las notas se deriva del personal seleccionado.
  const encargados = asignaciones
    .filter(a => !a.es_taller && a.nombre)
    .map(a => ({ nombre: a.nombre, rol: (a.rol === 'jefe_taller' ? 'jefe_taller' : 'mecanico') as 'jefe_taller' | 'mecanico' }));
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(cita?.cliente_id || null);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string | null>(cita?.vehiculo_id || null);
  const [customServicio, setCustomServicio] = useState(cita?.tipo_personalizado || '');
  const [isCustomServicio, setIsCustomServicio] = useState(!!cita?.tipo_personalizado);
  const [allClientes, setAllClientes] = useState<any[]>([]);
  const [filteredClientes, setFilteredClientes] = useState<any[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dupAlert, setDupAlert] = useState<any | null>(null); // servicio existente detectado al crear
  const [vehConflict, setVehConflict] = useState<{ vehiculoId: string; ownerName: string; newClienteId: string; placa: string } | null>(null); // vehículo de otro dueño
  const [overwriteClient, setOverwriteClient] = useState(false); // renombrar (sobreescribir) el cliente vinculado
  const [plateStatus, setPlateStatus] = useState<'idle' | 'checking' | 'found' | 'new'>('idle');
  const [clientVehiculos, setClientVehiculos] = useState<any[]>([]);
  const [showVehiculoSelector, setShowVehiculoSelector] = useState(false);
  const [vehiculoSuggestions, setVehiculoSuggestions] = useState<any[]>([]);
  const [showVehiculoSuggestions, setShowVehiculoSuggestions] = useState(false);
  const plateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const vehiculoSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { user } = useAppStore();

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;
      // Fetch Clients
      const { data: clients } = await withSedeFilter(supabase.from('clientes'))
        .select('id, nombre, apellido, telefono, vehiculos(id, marca, modelo, placa)');
      if (clients) setAllClientes(clients);

      // Fetch Staff from Users (Filtered by Sede automatically by withSedeFilter)
      const { data: users } = await withSedeFilter(supabase.from('usuarios'))
        .select('nombre, rol')
        .in('rol', ['mecanico', 'mecanico_acceso', 'jefe_taller', 'jefe_taller_acceso', 'admin', 'empleado']);
      
      const suggestions = (users || []).map((u: any) => {
        let encargadoRol: 'mecanico' | 'jefe_taller' = 'mecanico';
        if (u.rol === 'jefe_taller' || u.rol === 'jefe_taller_acceso') encargadoRol = 'jefe_taller';
        else if (u.rol === 'mecanico' || u.rol === 'mecanico_acceso') encargadoRol = 'mecanico';
        return { nombre: u.nombre, rol: encargadoRol };
      });
      
      // Unique by name
      const uniqueSuggestions = suggestions.filter((v: any, i: number, a: any[]) => 
        a.findIndex((t: any) => t.nombre === v.nombre) === i
      );
      setStaffSuggestions(uniqueSuggestions);
    };
    fetchData();
  }, []);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (plateTimerRef.current) clearTimeout(plateTimerRef.current);
      if (vehiculoSearchTimer.current) clearTimeout(vehiculoSearchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (formData.nombre_cliente.length > 1) {
      const results = allClientes.filter(c =>
        `${c.nombre} ${c.apellido}`.toLowerCase().includes(formData.nombre_cliente.toLowerCase())
      );
      setFilteredClientes(results);
      setShowClientResults(results.length > 0);
    } else {
      setShowClientResults(false);
    }
  }, [formData.nombre_cliente, allClientes]);

  const selectCliente = (c: any) => {
    const vehs = c.vehiculos || [];
    setClientVehiculos(vehs);
    const mainVehiculo = vehs[0];
    setSelectedClienteId(c.id);
    setSelectedVehiculoId(mainVehiculo?.id || null);
    setFormData({
      ...formData,
      nombre_cliente: `${c.nombre} ${c.apellido}`,
      telefono: c.telefono || '',
      vehiculo_info: mainVehiculo ? `${mainVehiculo.marca} ${mainVehiculo.modelo}` : formData.vehiculo_info,
      placa: mainVehiculo ? mainVehiculo.placa : formData.placa,
    });
    if (mainVehiculo) setPlateStatus('found');
    setShowClientResults(false);
  };

  const checkPlateForService = async (placa: string) => {
    const clean = placa.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length < 3) { setPlateStatus('idle'); return; }
    setPlateStatus('checking');
    try {
      if (!supabase) { setPlateStatus('idle'); return; }
      const { data } = await supabase.from('vehiculos')
        .select('id, marca, modelo, anio, placa, clientes(id, nombre, apellido, telefono, vehiculos(id, marca, modelo, placa))')
        .ilike('placa', clean)
        .limit(1)
        .maybeSingle();
      if (data) {
        const c = (data as any).clientes;
        const vehs: any[] = c?.vehiculos || [data];
        setClientVehiculos(vehs);
        setSelectedVehiculoId(data.id);
        if (c) {
          setSelectedClienteId(c.id);
          setFormData(prev => ({
            ...prev,
            vehiculo_info: `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`,
            nombre_cliente: `${c.nombre} ${c.apellido}`,
            telefono: c.telefono || prev.telefono,
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            vehiculo_info: `${data.marca} ${data.modelo}${data.anio ? ` ${data.anio}` : ''}`,
          }));
        }
        setPlateStatus('found');
      } else {
        setClientVehiculos([]);
        setPlateStatus('new');
      }
    } catch { setPlateStatus('idle'); }
  };

  // ── Ítems desglosados ──
  const itemsTotal = items.reduce((s, i) => s + (Number(i.total) || 0), 0);

  /**
   * La clasificación se detecta sola mientras nadie la toque.
   *
   * Se mira el tipo de servicio, lo escrito a mano y el desglose: así una orden
   * que dice "rotación de cauchos" cae en Cauchera sin que nadie la clasifique,
   * y de ahí sale la zona con la que se calcula la comisión. Antes se calculaba
   * una sola vez al abrir el formulario y quedaba mal en cuanto se escribía la
   * descripción.
   */
  const categoriaDetectada = useMemo(() => inferirCategoria([
    isCustomServicio ? customServicio : formData.tipo,
    formData.descripcion,
    items.map(i => i.descripcion).join(' '),
  ].filter(Boolean).join(' ')), [isCustomServicio, customServicio, formData.tipo, formData.descripcion, items]);

  useEffect(() => {
    if (categoriaManual) return;
    if (categoriaDetectada && categoriaDetectada !== categoria) setCategoria(categoriaDetectada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaDetectada, categoriaManual]);
  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);
  const removeItem = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx);
    setItems(newItems);
    const newTotal = newItems.reduce((s, it) => s + (Number(it.total) || 0), 0);
    setFormData(prev => ({ ...prev, costo_estimado: String(newTotal) }));
  };
  const updateItem = (idx: number, field: keyof ServicioItem, value: string | number) => {
    const newItems = items.map((it, i) => {
      if (i !== idx) return it;
      const next: ServicioItem = { ...it, [field]: field === 'descripcion' ? String(value) : (Number(value) || 0) };
      next.total = (Number(next.cantidad) || 1) * (Number(next.precio_unitario) || 0);
      return next;
    });
    setItems(newItems);
    const newTotal = newItems.reduce((s, it) => s + (Number(it.total) || 0), 0);
    setFormData(prev => ({ ...prev, costo_estimado: String(newTotal) }));
  };
  // Repuebla los ítems desde la descripción actual (botón "Desglosar").
  const autoDesglosar = () => {
    const total = parseFloat(formData.costo_estimado) || itemsTotal || 0;
    setItems(parseServicioItemsFromText(formData.descripcion || '', total));
  };

  // ── Resolver robusto: encuentra o CREA (sin duplicar) cliente + vehículo ──
  // Funciona igual al crear y al EDITAR. Esto evita tener que ir a Clientes y luego a
  // Vehículos por separado: con poner el nombre/teléfono/placa, el sistema lo asocia todo.
  const resolveClienteYVehiculo = async (transferVeh = false): Promise<{
    clienteId: string | null; vehiculoId: string | null;
    conflict?: { vehiculoId: string; ownerName: string; newClienteId: string; placa: string };
  }> => {
    let clienteId = selectedClienteId || cita?.cliente_id || null;
    let vehiculoId = selectedVehiculoId || cita?.vehiculo_id || null;
    const nombreFull = formData.nombre_cliente.trim();
    // Teléfono saneado: solo dígitos/símbolos válidos (nunca letras/nombres).
    const tel = formData.telefono.replace(/[^\d+()\s-]/g, '').trim();
    const placaNorm = formData.placa.trim().toUpperCase().replace(/[-\s]/g, '');
    const placaValida = !!placaNorm && !['SINPLACA', 'SIN', 'NA', 'N/A'].includes(placaNorm);

    // ── CLIENTE ──
    // ⚠️ CLAVE: si el nombre escrito es DISTINTO al del cliente vinculado, NUNCA renombramos
    // ese cliente (eso sobrescribía a Ricardo/otros). Se trata como OTRO cliente: se busca
    // o se crea, y se re-vincula. Solo si es el MISMO cliente actualizamos su teléfono.
    if (nombreFull) {
      const parts = nombreFull.split(/\s+/);
      const nombre = parts[0];
      const apellido = parts.slice(1).join(' ') || '—';

      // 🖊️ SOBREESCRIBIR (botón): el usuario pidió renombrar el cliente vinculado.
      if (overwriteClient && (cita?.cliente_id || selectedClienteId)) {
        const targetId = (cita?.cliente_id || selectedClienteId) as string;
        await supabase!.from('clientes').update({ nombre, apellido, telefono: tel || 'S/N' }).eq('id', targetId);
        await syncClientData(targetId, nombre, apellido, tel || '');
        clienteId = targetId;
      } else {
        // Normal (NUNCA renombrar): mismo cliente → solo teléfono; distinto → buscar/crear.
        if (clienteId) {
          const { data: cur } = await supabase!.from('clientes').select('nombre, apellido').eq('id', clienteId).maybeSingle();
          const curFull = cur ? `${cur.nombre || ''} ${cur.apellido || ''}`.trim().toLowerCase() : '';
          if (curFull !== nombreFull.toLowerCase()) {
            clienteId = null;      // nombre distinto → es otro cliente (no renombrar el actual)
            vehiculoId = null;     // re-resolver el vehículo por placa para el nuevo cliente
          }
        }
        if (clienteId) {
          // Mismo cliente: solo actualizamos su teléfono (NUNCA renombramos aquí).
          await supabase!.from('clientes').update({ telefono: tel || 'S/N' }).eq('id', clienteId);
        } else {
          // Dedup SOLO por nombre+apellido EXACTO. ⚠️ NO buscamos por teléfono: al editar,
          // el teléfono suele ser el del cliente anterior y enlazaría al equivocado en vez
          // de crear el nuevo. Si no existe un cliente con ese nombre exacto → se CREA.
          const { data: existing } = await withSedeFilter(supabase!.from('clientes'))
            .select('id').ilike('nombre', nombre).ilike('apellido', apellido).limit(1).maybeSingle();
          if (existing) {
            clienteId = existing.id;
          } else {
            const { data: created, error } = await withSedeFilter(supabase!.from('clientes'))
              .insert(withSedeInsert({ nombre, apellido, telefono: tel || 'S/N', notas: 'Registrado desde Orden de Servicio' }))
              .select('id').single();
            if (error) throw error;
            clienteId = created.id;
          }
        }
      }
    }

    // ── VEHÍCULO ──
    // Si no tenemos vehículo aún, buscarlo por placa.
    if (!vehiculoId && placaValida) {
      const { data: ev } = await supabase!.from('vehiculos').select('id').ilike('placa', placaNorm).limit(1).maybeSingle();
      if (ev) vehiculoId = ev.id;
    }

    // Verificar la propiedad: si el vehículo pertenece a OTRO cliente, avisar (conflicto)
    // para preguntar si se traslada la propiedad — NO lo movemos en automático.
    if (vehiculoId && clienteId) {
      const { data: vcur } = await supabase!.from('vehiculos').select('cliente_id, placa, clientes(nombre, apellido)').eq('id', vehiculoId).maybeSingle();
      if (vcur && vcur.cliente_id && vcur.cliente_id !== clienteId) {
        if (!transferVeh) {
          const owner: any = (vcur as any).clientes;
          return {
            clienteId, vehiculoId,
            conflict: {
              vehiculoId, newClienteId: clienteId, placa: vcur.placa || placaNorm,
              ownerName: owner ? `${owner.nombre || ''} ${owner.apellido || ''}`.trim() : 'otro cliente',
            },
          };
        }
        // Confirmado por el usuario → trasladar la propiedad (mueve vehículo + su historial).
        try {
          await transferVehiculo(vehiculoId, clienteId, { usuario: user?.nombre });
        } catch {
          // Fallback: al menos re-vincular el vehículo al nuevo cliente.
          await supabase!.from('vehiculos').update({ cliente_id: clienteId }).eq('id', vehiculoId);
        }
      } else if (vcur && !vcur.cliente_id) {
        await supabase!.from('vehiculos').update({ cliente_id: clienteId }).eq('id', vehiculoId);
      }
    }

    // Crear el vehículo si no existe (bajo el cliente resuelto).
    if (!vehiculoId && clienteId && (formData.vehiculo_info.trim() || placaValida)) {
      const vparts = formData.vehiculo_info.trim().split(/\s+/);
      const marca = vparts[0] || 'Desconocida';
      const modelo = vparts.slice(1).join(' ').replace(/\b(19|20)\d{2}\b/, '').trim() || '—';
      const yearMatch = formData.vehiculo_info.match(/\b(19\d\d|20\d\d)\b/);
      let anio = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
      if (anio < 1950 || anio > 2030) anio = new Date().getFullYear();
      const { data: created, error } = await withSedeFilter(supabase!.from('vehiculos'))
        .insert(withSedeInsert({ cliente_id: clienteId, marca, modelo, placa: placaValida ? placaNorm : `SP${String(Date.now()).slice(-7)}`, anio, estado: 'en_servicio' }))
        .select('id').single();
      if (error) throw error;
      vehiculoId = created.id;
    }

    return { clienteId, vehiculoId };
  };

  const handleSave = async (force = false, transferVeh = false) => {
    if (!supabase) return;
    if (!formData.nombre_cliente || !formData.vehiculo_info) {
      alert('Campos obligatorios incompletos');
      return;
    }

    // 🚨 Alerta anti-duplicado (solo al CREAR): si ya existe un servicio ACTIVO o creado
    // en las últimas 24h para la MISMA placa (o el mismo cliente), avisamos con un modal
    // en vez de crear un duplicado. El usuario puede cancelar o registrar de todos modos.
    if (!cita?.id && !force) {
      const placaNorm = formData.placa.trim().toUpperCase().replace(/[-\s]/g, '');
      const nombre = formData.nombre_cliente.trim().toLowerCase();
      if (placaNorm || (nombre && nombre !== 'no definido')) {
        try {
          const recentIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
          const { data: cands } = await withSedeFilter(supabase.from('servicios'))
            .select('id, placa, vehiculo_info, nombre_cliente, estado, descripcion, created_at, registrado_por')
            .or(`estado.in.(pendiente,confirmada,en_revision,en_proceso,en_progreso,en_espera),created_at.gte.${recentIso}`)
            .order('created_at', { ascending: false })
            .limit(300);
          const dup = (cands || []).find((s: any) => {
            const sp = (s.placa || '').toUpperCase().replace(/[-\s]/g, '');
            const sc = (s.nombre_cliente || '').trim().toLowerCase();
            return (placaNorm && sp && sp === placaNorm) ||
              (nombre && nombre !== 'no definido' && sc && sc === nombre);
          });
          if (dup) { setDupAlert(dup); return; }
        } catch { /* si falla el chequeo, continuamos normal */ }
      }
    }

    setIsSaving(true);
    try {
      let finalClienteId = selectedClienteId;
      let finalVehiculoId = selectedVehiculoId;

      // 1. Register New Staff in DB (explicitly)
      const newEncargadosPromises = encargados.map(async (e) => {
        // Check if this person already exists in staffSuggestions (which includes usuarios)
        const exists = staffSuggestions.some(s => s.nombre.toLowerCase() === e.nombre.toLowerCase());
        if (!exists) {
          const { currentSede } = useSedeStore.getState();
          const timestamp = Date.now();
          const username = `${e.nombre.replace(/\s+/g, '_').toLowerCase()}_${timestamp}`;
          
          const res = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: e.nombre,
              email: `${username}@lycosteam.internal`,
              password_hash: 'NO_ACCESS_STAFF',
              rol: e.rol,
              activo: false,
              sede_id: currentSede?.id || ''
            })
          });
          
          if (!res.ok) {
            const errData = await res.json();
            console.error('Error auto-registering staff via API:', errData.error);
          }
        }
      });
      await Promise.all(newEncargadosPromises);

      // ── Cliente + Vehículo: encontrar o crear (SIN duplicar), crear y editar ──
      {
        const resolved = await resolveClienteYVehiculo(transferVeh);
        // Si el vehículo pertenece a OTRO cliente, mostramos el modal de traslado y paramos.
        if (resolved.conflict) {
          setVehConflict(resolved.conflict);
          setIsSaving(false);
          return;
        }
        finalClienteId = resolved.clienteId;
        finalVehiculoId = resolved.vehiculoId;
      }

      // Datos desglosados para guardar (ítems + total).
      const itemsToSave = items
        .filter(i => (i.descripcion || '').trim() !== '')
        .map(i => ({
          descripcion: i.descripcion.trim(),
          cantidad: Number(i.cantidad) || 1,
          precio_unitario: Number(i.precio_unitario) || 0,
          total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
        }));
      // Si los ítems ya tienen precios (suma > 0) el costo = suma de ítems; si aún no
      // se asignaron precios, se conserva el costo del campo manual (no se pone en 0).
      const costoFinalCalc = itemsTotal > 0 ? itemsTotal : (parseFloat(formData.costo_estimado) || 0);

      if (cita?.id) {
        // UPDATE
        const oldNombreCliente = cita.nombre_cliente;
        const finalTipo = isCustomServicio ? 'otro' : formData.tipo;
        const updatePayload: any = {
          nombre_cliente: formData.nombre_cliente,
          telefono: formData.telefono,
          vehiculo_info: formData.vehiculo_info,
          placa: formData.placa,
          cliente_id: finalClienteId,
          vehiculo_id: finalVehiculoId,
          tipo: finalTipo,
          tipo_personalizado: isCustomServicio ? customServicio.trim() : null,
          descripcion: formData.descripcion || '',
          items: itemsToSave,
          costo_estimado: costoFinalCalc,
          // Clasificación + cobro de la orden (alimentan el Reporte de Ventas)
          categoria,
          metodos_pago: metodosPago,
          con_iva: ivaObligatorio,
          tasa_cambio: tasaDiaBcv || globalBcvRate || null,
          total_pagado: sumaMetodos(metodosPago),
          notas: encargados.length > 0
            ? `Encargados: ${encargados.map(e => `${e.nombre} (${e.rol === 'jefe_taller' ? 'Jefe' : 'Mecánico'})`).join(', ')}`
            : (cita?.notas || ''),
          updated_at: new Date().toISOString()
        };
        // Avoid sending empty strings for optional fields
        if (!updatePayload.tipo_personalizado) delete updatePayload.tipo_personalizado;
        if (!updatePayload.placa) delete updatePayload.placa;
        // El teléfono SÍ se guarda aunque quede vacío (para poder corregir/limpiar datos malos).
        // Solo se aceptan dígitos/símbolos de teléfono; si queda vacío → null.
        updatePayload.telefono = (String(updatePayload.telefono || '').replace(/[^\d+()\s-]/g, '').trim()) || null;

        const { error } = await withSedeFilter(supabase!.from('servicios'))
          .update(updatePayload)
          .eq('id', cita.id);
        if (error) throw error;

        // Nómina: re-sincroniza el personal a cargo y sus comisiones.
        // Sólo se reemplazan los trabajos PENDIENTES; lo ya liquidado nunca se toca.
        const asignValidasEdit = asignaciones.filter(a => a.empleado_id || a.es_taller);
        if (asignValidasEdit.length > 0) {
          try {
            await fetch('/api/nomina/jobs', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sede: sedeNomina?.id || null,
                replace: true,
                referencia_id: cita.id,
                jobs: asignValidasEdit.flatMap(a => buildJobsDesdeAsignacion(a, {
                  items,
                  costoTotal: costoFinalCalc,
                  tipoTrabajo: finalTipo,
                  descripcionBase: formData.descripcion || (isCustomServicio ? customServicio.trim() : formData.tipo),
                  referenciaTabla: 'servicios',
                  referenciaId: cita.id,
                  fecha: cita.fecha || getLocalISODate(),
                })),
              }),
            });
          } catch (nominaErr) {
            console.error('No se pudo actualizar la comisión de nómina:', nominaErr);
          }
        }

        // ⛔ NO se renombra el cliente automáticamente al editar la orden (eso sobrescribía
        // clientes existentes). El cliente correcto ya se resolvió/creó en resolveClienteYVehiculo.
        // El renombrado SOLO ocurre si el usuario activó "Sobreescribir cliente" (se hace en el resolver).

        // Sync client name to related factura if changed
        const newNombreCliente = formData.nombre_cliente.trim();
        if (oldNombreCliente && oldNombreCliente !== newNombreCliente) {
          let facturaIdToUpdate: string | null = null;
          // 1st: direct reference (new format: referencia_tabla = 'servicios')
          const { data: facturaDirect } = await supabase!
            .from('facturas')
            .select('id')
            .eq('referencia_id', cita.id)
            .eq('modulo_origen', 'servicios')
            .maybeSingle();
          if (facturaDirect) {
            facturaIdToUpdate = facturaDirect.id;
          } else {
            // 2nd: legacy format (referencia_tabla = 'ventas_dia')
            // Find ventas_dia with matching old client name
            const { data: ventasMatch } = await supabase!
              .from('ventas_dia')
              .select('id')
              .eq('cliente', oldNombreCliente)
              .limit(2);
            if (ventasMatch && ventasMatch.length === 1) {
              const { data: facturaLegacy } = await supabase!
                .from('facturas')
                .select('id')
                .eq('referencia_id', ventasMatch[0].id)
                .eq('modulo_origen', 'servicios')
                .maybeSingle();
              if (facturaLegacy) facturaIdToUpdate = facturaLegacy.id;
            }
          }
          if (facturaIdToUpdate) {
            await supabase!
              .from('facturas')
              .update({ cliente: newNombreCliente, updated_at: new Date().toISOString() })
              .eq('id', facturaIdToUpdate);
          }
        }
        
        if (cita.estado === 'completado' || cita.estado === 'completada' || cita.estado === 'finalizado') {
          try {
            await autoRegisterSaleFromService({
              ...cita,
              ...updatePayload,
              id: cita.id,
              sede_id: cita.sede_id || useSedeStore.getState().currentSede?.id,
            }, { userName: user?.nombre || 'Admin' });
          } catch (err) {
            console.error('Error registrando venta en edición de servicio:', err);
          }
        }

        logActivity({
          usuario: user?.nombre || 'Admin',
          modulo: 'Servicios',
          accion: 'Editó ticket',
          detalles: `Editó datos del ticket #${cita.id.slice(0,5)}`
        });
      } else {
        // CREATE
        const now = new Date();
        if (!finalVehiculoId) {
          throw new Error('No se pudo determinar el vehículo. Asegúrate de escribir la placa o seleccionar un cliente con vehículo registrado.');
        }
        const finalTipoServicio = isCustomServicio ? 'otro' : formData.tipo;
        const payload: any = {
          nombre_cliente: formData.nombre_cliente,
          telefono: formData.telefono,
          vehiculo_info: formData.vehiculo_info,
          placa: formData.placa,
          cliente_id: finalClienteId,
          vehiculo_id: finalVehiculoId,
          tipo: finalTipoServicio,
          tipo_personalizado: isCustomServicio ? customServicio.trim() : null,
          descripcion: formData.descripcion || '',
          items: itemsToSave,
          registrado_por: user?.nombre || 'Admin',
          fecha: getLocalISODate(),
          hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          estado: 'pendiente',
          costo_estimado: costoFinalCalc,
          // Clasificación + cobro de la orden (alimentan el Reporte de Ventas)
          categoria,
          metodos_pago: metodosPago,
          con_iva: ivaObligatorio,
          tasa_cambio: tasaDiaBcv || globalBcvRate || null,
          total_pagado: sumaMetodos(metodosPago),
          notas: encargados.length > 0
            ? `Encargados: ${encargados.map(e => `${e.nombre} (${e.rol === 'jefe_taller' ? 'Jefe' : 'Mecánico'})`).join(', ')}`
            : '',
          seguimiento: [
            {
              fecha: now.toISOString(),
              accion: 'Orden creada manualmente',
              usuario: user?.nombre || 'Admin',
              tipo: 'sistema',
              progreso: 0
            },
            ...encargados.map(e => ({
              fecha: now.toISOString(),
              accion: `Encargado asignado: ${e.nombre} (${e.rol === 'jefe_taller' ? 'Jefe de Taller' : 'Mecánico'})`,
              usuario: user?.nombre || 'Admin',
              tipo: 'sistema'
            }))
          ]
        };
        if (!payload.tipo_personalizado) delete payload.tipo_personalizado;
        if (!payload.placa) delete payload.placa;
        payload.telefono = (String(payload.telefono || '').replace(/[^\d+()\s-]/g, '').trim()) || null;

        // Personal a cargo: obligatorio indicar quién hizo el trabajo (o el taller).
        const asignValidas = asignaciones.filter(a => a.empleado_id || a.es_taller);
        if (asignValidas.length === 0) {
          throw new Error('Indica el personal a cargo o marca "Lo hizo el taller".');
        }

        const { data: nuevoServicio, error } = await withSedeFilter(supabase!.from('servicios')).insert(withSedeInsert(payload)).select().single();
        if (error) throw error;

        // Registra trabajos + comisiones vinculados (no bloquea la creación si falla).
        try {
          await fetch('/api/nomina/jobs', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sede: sedeNomina?.id || null,
              referencia_id: nuevoServicio?.id || null,
              jobs: asignValidas.flatMap(a => buildJobsDesdeAsignacion(a, {
                items,
                costoTotal: costoFinalCalc,
                tipoTrabajo: finalTipoServicio,
                descripcionBase: formData.descripcion || (isCustomServicio ? customServicio.trim() : formData.tipo),
                referenciaTabla: 'servicios',
                referenciaId: nuevoServicio?.id || null,
                fecha: getLocalISODate(),
              })),
            }),
          });
        } catch (nominaErr) {
          console.error('No se pudo registrar la comisión de nómina:', nominaErr);
        }

        logActivity({
          usuario: user?.nombre || 'Admin',
          modulo: 'Servicios',
          accion: 'Nueva orden',
          detalles: `Creada orden manual para ${formData.nombre_cliente} (IDs: C:${finalClienteId} V:${finalVehiculoId})`
        });
      }
      onClose();
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-center items-start sm:items-center bg-black/60 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-xl shadow-2xl flex flex-col my-auto sm:my-0 rounded-[24px] sm:rounded-[32px] overflow-hidden sm:max-h-[90vh]">
        <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              {cita ? <Edit3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> : <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />}
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
                {cita ? 'Editar Orden de Servicio' : 'Nueva Orden de Servicio'}
              </h3>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Gesti&oacute;n de Taller Lycos Team</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl hover:bg-muted/50 flex items-center justify-center transition-all shrink-0"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="min-h-0 p-4 sm:p-8 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div className="col-span-2 sm:col-span-1 space-y-2 relative">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Cliente Principal</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="Nombre y Apellido"
                value={formData.nombre_cliente}
                onChange={e => {
                  setFormData({...formData, nombre_cliente: e.target.value});
                  setSelectedClienteId(null);
                  setSelectedVehiculoId(null);
                }}
                onBlur={() => setTimeout(() => setShowClientResults(false), 200)}
                onFocus={() => formData.nombre_cliente.length > 1 && setShowClientResults(true)}
              />
              {showClientResults && (
                <div className="absolute top-full left-0 right-0 z-[150] mt-1 bg-popover border border-border rounded-xl sm:rounded-2xl shadow-2xl max-h-48 overflow-y-auto no-scrollbar py-1">
                  {filteredClientes.map((c, idx) => (
                    <button
                      key={c.id || idx}
                      onClick={() => selectCliente(c)}
                      className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors group"
                    >
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{c.nombre} {c.apellido}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-muted-foreground">{c.telefono}</p>
                        {c.vehiculos?.length > 0 && (
                          <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                            <Car className="w-2.5 h-2.5" />{c.vehiculos.length} veh.
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* Sobreescribir: renombra el cliente vinculado en vez de crear/asociar otro. */}
              {cita?.cliente_id && (
                <label className="flex items-center gap-2 mt-1 ml-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overwriteClient}
                    onChange={e => setOverwriteClient(e.target.checked)}
                    className="w-3.5 h-3.5 accent-orange-500 rounded"
                  />
                  <span className={cn('text-[10px] font-bold', overwriteClient ? 'text-orange-500' : 'text-muted-foreground')}>
                    Sobreescribir este cliente (renombrarlo)
                  </span>
                </label>
              )}
              {cita?.cliente_id && !overwriteClient && (
                <p className="text-[9px] text-muted-foreground/70 ml-1 leading-tight">
                  Si escribes otro nombre se creará/asociará un cliente distinto (no se modifica el actual).
                </p>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Tel&eacute;fono Contacto</label>
              <input
                type="tel"
                inputMode="numeric"
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="0424 123 4567"
                value={formData.telefono}
                onChange={e => setFormData({...formData, telefono: e.target.value.replace(/[^\d+()\s-]/g, '')})}
              />
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2 relative">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Veh&iacute;culo / Modelo</label>
              <div className="relative">
                <input
                  className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pr-8"
                  placeholder="Ej: Toyota Corolla 2015"
                  value={formData.vehiculo_info}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({...formData, vehiculo_info: val});
                    setSelectedVehiculoId(null);
                    // debounce search only if client not already selected
                    clearTimeout(vehiculoSearchTimer.current);
                    if (val.length >= 2 && !selectedClienteId) {
                      vehiculoSearchTimer.current = setTimeout(async () => {
                        if (!supabase) return;
                        const { data } = await supabase.from('vehiculos')
                          .select('id, marca, modelo, anio, placa, clientes(id, nombre, apellido, telefono)')
                          .or(`marca.ilike.%${val}%,modelo.ilike.%${val}%`)
                          .limit(6);
                        setVehiculoSuggestions(data || []);
                        setShowVehiculoSuggestions((data || []).length > 0);
                      }, 400);
                    } else {
                      setVehiculoSuggestions([]);
                      setShowVehiculoSuggestions(false);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowVehiculoSuggestions(false), 200)}
                />
                {clientVehiculos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowVehiculoSelector(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Suggestions from DB when typing model */}
              {showVehiculoSuggestions && vehiculoSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-popover border border-border rounded-xl shadow-2xl py-1">
                  {vehiculoSuggestions.map((v: any) => {
                    const cliente = (v as any).clientes;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVehiculoId(v.id);
                          setFormData(prev => ({
                            ...prev,
                            vehiculo_info: `${v.marca} ${v.modelo}${v.anio ? ` ${v.anio}` : ''}`,
                            placa: v.placa,
                            nombre_cliente: cliente ? `${cliente.nombre} ${cliente.apellido}` : prev.nombre_cliente,
                            telefono: cliente?.telefono || prev.telefono,
                          }));
                          if (cliente) setSelectedClienteId(cliente.id);
                          setPlateStatus('found');
                          setShowVehiculoSuggestions(false);
                          setVehiculoSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors group flex items-center gap-3"
                      >
                        <Car className="w-4 h-4 text-primary/60 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-foreground group-hover:text-primary">{v.marca} {v.modelo}{v.anio ? ` ${v.anio}` : ''}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-primary/70">{v.placa}</span>
                            {cliente && <span className="text-[10px] text-muted-foreground">{cliente.nombre} {cliente.apellido}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Multi-vehicle selector for the same client */}
              {showVehiculoSelector && clientVehiculos.length > 1 && (
                <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-popover border border-border rounded-xl shadow-2xl py-1">
                  {clientVehiculos.map((v: any) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVehiculoId(v.id);
                        setFormData(prev => ({ ...prev, vehiculo_info: `${v.marca} ${v.modelo}`, placa: v.placa }));
                        setShowVehiculoSelector(false);
                        setPlateStatus('found');
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors"
                    >
                      <p className="text-xs font-bold">{v.marca} {v.modelo}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{v.placa}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">N&uacute;mero de Placa</label>
              <div className="relative">
                <input
                  className={`w-full bg-muted/50 border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pr-9 ${
                    plateStatus === 'found' ? 'border-green-500/60' : plateStatus === 'new' ? 'border-yellow-500/60' : 'border-border'
                  }`}
                  placeholder="ABC-123"
                  value={formData.placa}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setFormData({...formData, placa: val});
                    clearTimeout(plateTimerRef.current);
                    plateTimerRef.current = setTimeout(() => checkPlateForService(val), 600);
                  }}
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {plateStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {plateStatus === 'found' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {plateStatus === 'new' && <XCircle className="w-4 h-4 text-yellow-500" />}
                </div>
              </div>
              {plateStatus === 'found' && <p className="text-[10px] text-green-400 ml-1">Vehículo encontrado en sistema</p>}
              {plateStatus === 'new' && <p className="text-[10px] text-yellow-400 ml-1">Placa no registrada — se vinculará al guardar</p>}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Tipo de Servicio</label>
              <div className="flex gap-2">
                <select 
                  className="flex-1 bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none"
                  value={isCustomServicio ? 'custom' : formData.tipo}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setIsCustomServicio(true);
                    } else {
                      setIsCustomServicio(false);
                      setFormData({...formData, tipo: e.target.value});
                    }
                  }}
                >
                  {Object.entries(SERVICIO_LABELS).map(([k,v]) => <option key={k} value={k} className="bg-card">{v}</option>)}
                  <option value="custom" className="bg-card font-bold text-primary">+ Personalizado...</option>
                </select>
              </div>
              {isCustomServicio && (
                <motion.input 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full mt-2 bg-muted/50 border border-primary/30 rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  placeholder="Escribe el tipo de servicio..."
                  value={customServicio}
                  onChange={e => setCustomServicio(e.target.value)}
                />
              )}
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Costo Estimado ($)</label>
              <input 
                type="number"
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="0.00"
                value={formData.costo_estimado}
                onChange={e => setFormData({...formData, costo_estimado: e.target.value})}
              />
            </div>

            {/* Personal a cargo + comisiones (calculadas automáticamente) */}
            <div className="col-span-2 space-y-2 rounded-2xl border border-border bg-muted/10 p-3">
              {cargandoAsign ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando personal a cargo…
                </div>
              ) : (
                <PersonalYComisiones
                  tipoTrabajo={isCustomServicio ? 'otro' : formData.tipo}
                  descripcionTrabajo={formData.descripcion || (isCustomServicio ? customServicio.trim() : formData.tipo) || null}
                  value={asignaciones}
                  onChange={setAsignaciones}
                  sedeId={sedeNomina?.id || null}
                  defaultZona={categoriaToZona(categoria)}
                  items={items}
                  costoTotal={itemsTotal || parseFloat(formData.costo_estimado) || 0}
                />
              )}
            </div>

            {/* Clasificación del servicio — define la columna del Reporte de Ventas */}
            <div className="col-span-2 sm:col-span-1 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Clasificaci&oacute;n del Servicio</label>
              <select
                value={categoria}
                onChange={e => { setCategoria(e.target.value); setCategoriaManual(true); }}
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              >
                {CATEGORIAS_VENTA.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <p className="text-[9px] text-muted-foreground ml-1">Determina en qu&eacute; columna aparece en el Reporte de Ventas.</p>
            </div>

            {/* Métodos de pago de la orden */}
            <div className="col-span-2 space-y-2 rounded-xl border border-[#e8eaed] bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fff1e7] text-[#f97316]">
                    <Banknote className="h-[15px] w-[15px]" aria-hidden />
                  </span>
                  <span className="text-[13.5px] font-bold text-[#16181d]">M&eacute;todos de pago</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num text-[12.5px] text-[#8a909c]">
                    A cobrar{' '}
                    <strong className="font-bold text-[#16181d]">
                      ${(((parseFloat(formData.costo_estimado) || 0) * (ivaObligatorio ? 1.16 : 1))).toFixed(2)}
                    </strong>
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-[#3d4350]">
                    <input
                      type="checkbox"
                      checked={ivaObligatorio}
                      disabled={hayCashea}
                      onChange={e => setConIva(e.target.checked)}
                      title={hayCashea ? 'Con Cashea el IVA del 16% es obligatorio.' : undefined}
                      className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316] disabled:opacity-60"
                    />
                    IVA 16%
                  </label>
                </div>
              </div>
              {/* El MISMO desglose por banco que usa el punto de venta y el modal
                  de cobro. Antes aquí había un selector propio: dos formas de
                  registrar lo mismo, y la de esta pantalla no la usó ninguna
                  orden. Una sola manera evita que un cobro caiga en una clave
                  que el reporte no conoce. */}
              <DesglosePagoBancos
                bins={{ ...emptyBins(), ...(metodosPago as Bins) }}
                onBinsChange={b => setMetodosPago(b as unknown as Record<string, number>)}
                totalUSD={(parseFloat(formData.costo_estimado) || 0) * (ivaObligatorio ? 1.16 : 1)}
                tasa={tasaCustom || globalBcvRate || 0}
                tasaAuto={globalBcvRate}
                onTasaChange={v => setTasaCustom(v ?? 0)}
              />
              <p className="text-[11px] leading-snug text-[#8a909c]">Cada cobro cae en su banco y de ah&iacute; a su columna del Reporte de Ventas al completar el servicio.</p>
              {hayCashea && (
                <p className="rounded-lg bg-[#fff7ed] px-2.5 py-2 text-[11.5px] leading-snug text-[#9a3412]">
                  <strong className="font-semibold">Cashea:</strong> el IVA del 16% va incluido y el resto
                  queda como <strong className="font-semibold">pendiente por cobrar</strong> hasta que el
                  cliente termine sus cuotas.
                </p>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Descripci&oacute;n de la Falla / Trabajo</label>
              <textarea 
                className="w-full bg-muted/50 border border-border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all min-h-[80px] sm:min-h-[100px] resize-none"
                placeholder="Escribe aqu&iacute; los detalles t&eacute;cnicos..."
                value={formData.descripcion}
                onChange={e => setFormData({...formData, descripcion: e.target.value})}
              />
            </div>

            {/* ── Servicios desglosados (para imprimir la factura por ítems) ── */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                  Servicios desglosados <span className="normal-case opacity-60">(para la factura)</span>
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={autoDesglosar} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                    Auto-desglosar
                  </button>
                  <button type="button" onClick={addItem} className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Agregar
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-2 sm:p-3 space-y-2">
                {items.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic px-1 py-2">
                    Sin ítems. Usa <b>Auto-desglosar</b> para separar la descripción en líneas, o <b>Agregar</b> una manual.
                  </p>
                )}
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      value={it.descripcion}
                      onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                      placeholder="Trabajo / repuesto"
                      className="flex-1 min-w-0 bg-background/60 border border-border rounded-lg px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      type="number" min="1" value={it.cantidad}
                      onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                      title="Cantidad"
                      className="w-12 bg-background/60 border border-border rounded-lg px-1.5 py-2 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                      <input
                        type="number" step="0.01" value={it.precio_unitario}
                        onChange={e => updateItem(idx, 'precio_unitario', e.target.value)}
                        placeholder="0.00" title="Precio unitario"
                        className="w-20 bg-background/60 border border-border rounded-lg pl-5 pr-2 py-2 text-xs text-right font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <span className="w-16 text-right text-xs font-black text-primary tabular-nums">${Number(it.total).toFixed(2)}</span>
                    <button type="button" onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-red-400 transition-colors shrink-0" title="Quitar">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {items.length > 0 && (
                  <div className="flex items-center justify-end gap-3 pt-2 mt-1 border-t border-border/40">
                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Total</span>
                    <span className="text-sm font-black text-primary tabular-nums">${itemsTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
          <button onClick={onClose} className="w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold text-muted-foreground hover:bg-muted/50 transition-all text-center">Cancelar</button>
          <Button 
            onClick={() => handleSave()} 
            disabled={isSaving} 
            className="w-full sm:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 sm:px-10 h-11 sm:h-12 text-xs sm:text-sm shadow-2xl shadow-primary/20 gap-2 flex items-center justify-center"
          >
            {isSaving ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <BadgeCheck className="w-4 h-4 sm:w-5 sm:h-5" />}
            {cita ? 'Actualizar Orden' : 'Crear Orden Ahora'}
          </Button>
        </div>
      </div>

      {/* 🚨 Alerta de servicio duplicado (mismo vehículo/cliente ya registrado) */}
      {dupAlert && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-card shadow-2xl overflow-hidden">
            <div className="p-5 sm:p-6 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-amber-500">Servicio ya registrado</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Este vehículo/cliente ya tiene un servicio en el sistema.</p>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                <p className="font-black text-foreground">
                  🚗 {dupAlert.vehiculo_info || '—'}{dupAlert.placa && dupAlert.placa !== 'SIN-PLACA' ? ` — ${dupAlert.placa}` : ''}
                </p>
                {dupAlert.nombre_cliente && dupAlert.nombre_cliente !== 'No definido' && (
                  <p className="text-muted-foreground">👤 {dupAlert.nombre_cliente}</p>
                )}
                <p className="text-muted-foreground">
                  📌 Estado: <span className="font-bold uppercase">{String(dupAlert.estado || '').replace(/_/g, ' ')}</span>
                </p>
                {dupAlert.descripcion && (
                  <p className="text-muted-foreground whitespace-pre-line">🔧 {dupAlert.descripcion}</p>
                )}
                {dupAlert.registrado_por && (
                  <p className="text-muted-foreground">✍️ Registrado por: {dupAlert.registrado_por}</p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Para no duplicar, edita el servicio existente. Si aun así necesitas crear uno nuevo (visita distinta), puedes registrarlo de todos modos.
              </p>
            </div>
            <div className="p-4 sm:p-5 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
              <button
                onClick={() => setDupAlert(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold text-muted-foreground hover:bg-muted/50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setDupAlert(null); handleSave(true); }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white transition-all"
              >
                Registrar de todos modos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚗 Conflicto: el vehículo pertenece a otro cliente → trasladar propiedad */}
      {vehConflict && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-orange-500/30 bg-card shadow-2xl overflow-hidden">
            <div className="p-5 sm:p-6 bg-orange-500/10 border-b border-orange-500/20 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-orange-500/20 flex items-center justify-center shrink-0">
                <Car className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-orange-500">Vehículo de otro cliente</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Este vehículo ya está registrado a otro cliente.</p>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                <p className="font-black text-foreground">🚗 Placa {vehConflict.placa}</p>
                <p className="text-muted-foreground">Dueño actual: <span className="font-bold text-foreground">{vehConflict.ownerName || '—'}</span></p>
                <p className="text-muted-foreground">Nuevo cliente: <span className="font-bold text-foreground">{formData.nombre_cliente}</span></p>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Si trasladas la propiedad, el vehículo y su historial de servicios pasan a <b>{formData.nombre_cliente}</b>. El dueño anterior deja de tenerlo asociado. ¿Deseas continuar?
              </p>
            </div>
            <div className="p-4 sm:p-5 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
              <button
                onClick={() => setVehConflict(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-bold text-muted-foreground hover:bg-muted/50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setVehConflict(null); handleSave(true, true); }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-orange-500 hover:bg-orange-600 text-white transition-all"
              >
                Trasladar propiedad y actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tracking Modal ──────────────────────────────────────────
function TrackingModal({ cita, onClose }: { cita: CitaServicio; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('nota');
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAppStore();

  const QUICK_ACTIONS = [
    { label: 'Recepción', text: 'Vehículo recibido. Inspección inicial completada.', icon: Car },
    { label: 'Desarmando', text: 'Iniciado proceso de desarmado/inspección interna.', icon: Wrench },
    { label: 'Diagnóstico', text: 'Diagnóstico finalizado. Reporte técnico listo.', icon: Info },
    { label: 'Aprobado', text: 'Cliente aprobó el presupuesto. Iniciando reparación.', icon: BadgeCheck },
    { label: 'Repuestos', text: 'Piezas solicitadas. A la espera de stock.', icon: Tag },
    { label: 'Ensamble', text: 'Finalizando armado del vehículo.', icon: LayoutGrid },
    { label: 'Prueba', text: 'Realizando escaneo final y prueba de ruta.', icon: Activity },
    { label: 'Entrega', text: 'Vehículo impecable. Listo para entregar al cliente.', icon: CheckCircle },
  ];

  const CATEGORIES: Record<string, { icon: React.ElementType, color: string, label: string }> = {
    nota: { icon: MessageSquare, color: 'text-blue-400', label: 'Nota' },
    mecanica: { icon: Wrench, color: 'text-orange-400', label: 'Mecánica' },
    repuesto: { icon: RefreshCw, color: 'text-amber-400', label: 'Repuesto' },
    alerta: { icon: AlertCircle, color: 'text-red-400', label: 'Alerta' },
  };

  const addTrackingEntry = async (customText?: string) => {
    const actionText = customText || comment;
    if (!actionText.trim()) return;
    
    setIsSaving(true);
    try {
      const newEntry = {
        fecha: new Date().toISOString(),
        accion: actionText,
        usuario: user?.nombre || 'Admin',
        tipo: customText ? 'sistema' : category,
      };
      
      const newSeguimiento = [...(cita.seguimiento || []), newEntry];
      
      const { error } = await withSedeFilter(supabase!.from('servicios'))
        .update({ 
          seguimiento: newSeguimiento,
          ...(actionText.toLowerCase().includes('entrega') ? { estado: 'completada' } : {})
        })
        .eq('id', cita.id);
      
      if (error) throw error;
      setComment('');
      const newState = actionText.toLowerCase().includes('entrega') ? 'completada' : cita.estado;
      
      // Update the local state properly to trigger re-renders
      // Ignore typescript error locally by using the setCitas from upper scope or a callback
      cita.seguimiento = newSeguimiento;
      if (newState !== cita.estado) {
        cita.estado = newState;
      }
      
      // Force a refresh from the loadCitas hook indirectly if needed, 
      // but modifying cita object works for now in this context since onClose calls loadCitas.
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 backdrop-blur-md p-0 sm:p-4">
      <div className="bg-card border border-border w-full max-w-5xl h-full sm:h-[90vh] shadow-2xl flex flex-col overflow-hidden sm:rounded-[32px]">
        
        {/* Lycos Premium Header */}
        <div className="p-6 sm:p-8 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[20px] sm:rounded-[24px] bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0 shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tighter uppercase italic" style={{ fontFamily: 'Syne, sans-serif' }}>
                Bitácora de Servicio
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 mt-1">
                <span className="text-[9px] sm:text-[10px] bg-muted/50 px-2 py-0.5 rounded-md font-mono text-muted-foreground uppercase tracking-widest border border-border w-fit">
                  ID: {cita.id.slice(0,8)}
                </span>
                <span className="text-[9px] sm:text-[10px] text-primary font-black uppercase tracking-widest line-clamp-1">
                  {cita.vehiculos ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo}` : cita.vehiculo_info} · {cita.vehiculos?.placa || cita.placa}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-all group shrink-0">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          
          {/* Timeline Panel - Left */}
          <div className="flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-muted/10">
             <div className="max-w-2xl mx-auto space-y-8">
                {(cita.seguimiento || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center opacity-40">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-6">
                      <Clock className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground">Sin registros aún</p>
                  </div>
                ) : (
                  <div className="relative pl-8 sm:pl-10 space-y-8 sm:space-y-12 before:absolute before:left-[15px] sm:before:left-[19px] before:top-2 before:bottom-2 before:w-[3px] before:bg-gradient-to-b before:from-primary before:via-border before:to-transparent">
                    {(cita.seguimiento || []).slice().reverse().map((entry, i) => {
                      const cat = CATEGORIES[entry.tipo] || CATEGORIES.nota;
                      const CatIcon = cat.icon;
                      return (
                        <div key={i} className="relative group animate-in fade-in slide-in-from-bottom-4 duration-700">
                          <div className="absolute -left-[39px] sm:-left-[45px] top-1 w-10 h-10 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] bg-card border-4 border-background flex items-center justify-center z-10 shadow-lg transition-transform group-hover:scale-110 group-hover:border-primary/30">
                            <CatIcon className={cn("w-4 h-4 sm:w-5 sm:h-5", cat.color)} />
                          </div>
                          
                          <div className="bg-muted/30 border border-border rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 group-hover:bg-muted/50 transition-all relative overflow-hidden">
                            <div className="flex flex-col sm:flex-row justify-start sm:justify-between items-start sm:items-center gap-2 mb-4">
                              <span className="text-[9px] sm:text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest bg-background/50 border border-border/50 text-muted-foreground w-fit">
                                {new Date(entry.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(entry.fecha).toLocaleDateString()}
                              </span>
                              <span className={cn("text-[9px] sm:text-[10px] font-black uppercase tracking-widest italic", cat.color)}>
                                {cat.label}
                              </span>
                            </div>
                            
                            <p className="text-sm sm:text-base text-foreground font-bold leading-relaxed mb-4">
                              {entry.accion}
                            </p>
                            
                            <div className="flex items-center gap-3 pt-4 border-t border-border">
                               <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                 <User className="w-3 h-3 text-primary" />
                               </div>
                               <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                 Registrado por {entry.usuario}
                               </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
             </div>
          </div>

          {/* Action Panel - Right */}
          <div className="w-full lg:w-[400px] bg-muted/20 p-4 sm:p-8 flex flex-col gap-8 border-t lg:border-t-0 lg:border-l border-border overflow-y-auto custom-scrollbar shrink-0">
            
            {/* Quick States */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] mb-4 sm:mb-6 border-l-2 border-primary pl-3">Estados Rápidos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => addTrackingEntry(action.text)}
                    className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-[16px] sm:rounded-[20px] bg-card border border-border hover:bg-primary hover:text-primary-foreground group transition-all text-left"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-[12px] bg-muted/50 flex items-center justify-center group-hover:bg-primary-foreground/20 shrink-0">
                      <action.icon className="w-4 h-4 sm:w-5 sm:h-5 group-hover:text-primary-foreground text-muted-foreground transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest truncate">{action.label}</p>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground group-hover:text-primary-foreground/70 font-medium">Click para registrar</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Entry */}
            <div className="space-y-4 pt-6 sm:pt-8 border-t border-border">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.3em] mb-4 sm:mb-6 border-l-2 border-primary pl-3">Entrada Manual</p>
              
              <div className="flex gap-2">
                {Object.entries(CATEGORIES).map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => setCategory(id)}
                    className={cn(
                      "flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border transition-all",
                      category === id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <info.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ))}
              </div>

              <textarea 
                className="w-full bg-muted/50 border border-border rounded-[20px] sm:rounded-[24px] px-4 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[100px] sm:min-h-[120px] resize-none transition-all"
                placeholder="Escribe un reporte detallado..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />

              <Button 
                onClick={() => addTrackingEntry()} 
                disabled={isSaving || !comment.trim()} 
                className="w-full h-14 sm:h-16 rounded-[20px] sm:rounded-[24px] bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg shadow-primary/20 gap-2 sm:gap-3"
              >
                {isSaving ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <BadgeCheck className="w-5 h-5 sm:w-6 sm:h-6" />}
                Registrar Bitácora
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Modal (Keep as is but polish colors) ───────────────
function InvoiceModal({ cita, citas, inventory, onClose, globalBcvRate }: { cita: CitaServicio; citas: CitaServicio[]; inventory: any[]; onClose: () => void; globalBcvRate?: number }) {
  const [clientName, setClientName] = useState(getDisplayName(cita) || 'Consumidor Final');

  const [vehicleStr, setVehicleStr] = useState(cita.vehiculos
    ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo} (${cita.vehiculos.placa})`
    : cita.vehiculo_info || '—');
  const [secondCita, setSecondCita] = useState<CitaServicio | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);

  const [items, setItems] = useState(() => {
    // Preferir los ítems desglosados guardados en la orden (cada uno con su precio).
    const saved = (cita.items as ServicioItem[] | undefined) || [];
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map(i => ({
        descripcion: i.descripcion || 'Servicio',
        cantidad: Number(i.cantidad) || 1,
        precio_unitario: Number(i.precio_unitario) || 0,
        total: Number(i.total) || (Number(i.cantidad) || 1) * (Number(i.precio_unitario) || 0),
      }));
    }
    const match = inventory.find((i: any) =>
      (cita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
      i.nombre.toLowerCase().trim().includes((cita.descripcion || '').toLowerCase().trim()) ||
      (cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
    );
    const price = match?.precio_usd || cita.costo_estimado || 0;
    const rawDesc = cita.descripcion || cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || 'Servicio General';
    // Desglose tolerante (multilínea del bot, " + ", ";", "|").
    const parsed = parseServicioItemsFromText(rawDesc, price);
    return parsed.length > 0 ? parsed : parseDescripcionItems(rawDesc, price);
  });

  const [secondItems, setSecondItems] = useState<any[]>([]);
  const [secondClientName, setSecondClientName] = useState('');
  const [secondVehicleStr, setSecondVehicleStr] = useState('');
  const [secondWithIva, setSecondWithIva] = useState(false);

  useEffect(() => {
    if (secondCita) {
      const match = inventory.find((i: any) => 
        (secondCita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
        i.nombre.toLowerCase().trim().includes((secondCita.descripcion || '').toLowerCase().trim()) ||
        (secondCita.tipo_personalizado || SERVICIO_LABELS[secondCita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
      );
      const price = match?.precio_usd || secondCita.costo_estimado || 0;
      const rawDesc = secondCita.descripcion || secondCita.tipo_personalizado || SERVICIO_LABELS[secondCita.tipo] || 'Servicio General';
      setSecondItems(parseDescripcionItems(rawDesc, price));
      setSecondClientName(secondCita.vehiculos?.clientes ? `${secondCita.vehiculos?.clientes.nombre} ${secondCita.vehiculos?.clientes.apellido}` : secondCita.nombre_cliente || 'Consumidor Final');
      setSecondVehicleStr(secondCita.vehiculos ? `${secondCita.vehiculos.marca} ${secondCita.vehiculos.modelo}` : secondCita.vehiculo_info || '---');
      setSecondWithIva(false);
    } else {
      setSecondItems([]);
    }
  }, [secondCita, inventory]);

  const [isSaving, setIsSaving] = useState(false);
  const [withIva, setWithIva] = useState(false);
  const [rates, setRates] = useState({ bcv: globalBcvRate || 0, binance: 0, fetchedAt: '' });
  const [loadingRates, setLoadingRates] = useState(!globalBcvRate);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const resp = await fetch(`/api/rates?t=${Date.now()}`, { cache: 'no-store' });
        const data = await resp.json();
        if (data.bcv) {
          setRates({ bcv: data.bcv, binance: data.binance, fetchedAt: data.fetchedAt });
        }
      } catch (e) {
        console.error('Rates error:', e);
      } finally {
        setLoadingRates(false);
      }
    };
    loadRates();
  }, []);

  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  const ivaAmount = withIva ? subtotal * 0.16 : 0;
  const total = subtotal + ivaAmount;
  const totalVes = total * (rates.bcv || globalBcvRate || 518.0);

  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, f: string, v: any) => {
    const n = [...items];
    const item = { ...n[i], [f]: v };
    if (f === 'cantidad' || f === 'precio_unitario') item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    n[i] = item;
    setItems(n);
  };

  const [payments, setPayments] = useState<Record<string, number>>({
    efectivo_usd: total
  });

  const togglePaymentMethod = (method: string) => {
    const newPayments = { ...payments };
    if (newPayments[method] !== undefined) {
      delete newPayments[method];
    } else {
      newPayments[method] = 0;
    }
    setPayments(newPayments);
  };

  const updatePaymentAmount = (method: string, amount: number) => {
    setPayments({ ...payments, [method]: amount });
  };

  const [printMode, setPrintMode] = useState<'single' | 'dual' | 'diferente'>('dual');
  const [printSide, setPrintSide] = useState<'left' | 'right'>('left');
  const [existingCorrelativo, setExistingCorrelativo] = useState('');
  // Comprobante de pago (referencia + imagen) al convertir el servicio en venta
  const [comprobante, setComprobante] = useState<ComprobanteValue>(emptyComprobante());
  const [comprobanteSavedUrl, setComprobanteSavedUrl] = useState<string | null>(null);

  // Load correlativo from facturas table for already-registered services
  useEffect(() => {
    if (!supabase || !cita?.id) return;
    supabase.from('facturas').select('correlativo').eq('referencia_id', cita.id).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.correlativo) setExistingCorrelativo(data.correlativo); });
  }, [cita?.id]);

  const handleDownload = (correlativo?: string, comp?: { url?: string | null; ref?: string | null }) => {
    const data1 = {
      id: cita.id,
      correlativo: correlativo || existingCorrelativo || undefined,
      fecha: cita.fecha,
      cliente: clientName,
      vehiculo: vehicleStr,
      items,
      total,
      iva_aplicado: withIva,
      tasa_bcv: rates.bcv || globalBcvRate || 518.0,
      total_ves: totalVes,
      notas: cita.descripcion || undefined,
      metodos_pago: payments,
      comprobante_url: comp?.url || comprobanteSavedUrl || cita.comprobante_url || undefined,
      comprobante_referencia: comp?.ref || comprobante.referencia.trim() || cita.comprobante_referencia || undefined
    };

    const dataList: any[] = [data1];

    if (printMode === 'dual') {
      // Duplicado de la misma factura
      dataList.push(data1);
    } else if (printMode === 'diferente' && secondCita) {
      const secondSubtotal = secondItems.reduce((sum, item) => sum + (item.total || 0), 0);
      const secondIva = secondWithIva ? secondSubtotal * 0.16 : 0;
      const secondTotal = secondSubtotal + secondIva;

      dataList.push({
        id: secondCita.id,
        fecha: secondCita.fecha,
        cliente: secondClientName,
        vehiculo: secondVehicleStr,
        items: secondItems,
        total: secondTotal,
        iva_aplicado: secondWithIva,
        tasa_bcv: rates.bcv || globalBcvRate || 518.0,
        total_ves: secondTotal * (rates.bcv || globalBcvRate || 518.0),
        notas: secondCita.descripcion || undefined
      });
    }

    generateInvoicePDF(dataList, { mode: printMode, side: printSide, currencyMode: 'dual' });
  };

  const handleFinalizeSale = async () => {
    if (!supabase) return;
    try {
      setIsSaving(true);
      // ref tag enables dedup — if Kanban drag already registered this sale, update instead of insert
      const vdRefTag = `[ServicioID: ${cita.id}]`;
      const vdNotas = `${[cita.descripcion, cita.tipo_personalizado].filter(Boolean).join(' | ') || 'Servicio de taller'} ${vdRefTag}`.trim();
      const sedeIdFinal = cita.sede_id || useSedeStore.getState().currentSede?.id;
      if (!sedeIdFinal) throw new Error('No se puede registrar la venta: sede del servicio no encontrada');

      // Subir comprobante de pago (si se adjuntó) → URL pública
      const comprobanteUrl = (await uploadComprobante(comprobante.file)) || cita.comprobante_url || null;
      const comprobanteRef = comprobante.referencia.trim() || cita.comprobante_referencia || null;
      setComprobanteSavedUrl(comprobanteUrl);

      const { data: existingVD } = await supabase.from('ventas_dia')
        .select('id').like('notas', `%${vdRefTag}%`).limit(1).maybeSingle();

      // Clasificación de la orden (guardada al crearla; si falta se infiere).
      const catVenta = (cita as any).categoria
        || inferirCategoria(cita.descripcion || cita.tipo_personalizado || cita.tipo);

      const vdPayload = {
        fecha: getLocalISODate(),
        cliente: clientName,
        // Identidad real del cliente/vehículo en el Reporte de Ventas
        cliente_id: cita.cliente_id || null,
        vehiculo_id: cita.vehiculo_id || null,
        servicio_id: cita.id,
        placa: cita.placa || cita.vehiculos?.placa || null,
        vehiculo_info: vehicleStr || null,
        // Clasificación → su columna correspondiente en el reporte
        categoria: catVenta,
        ...buildCategoriaColumns(catVenta, total),
        total_ingresos: total,
        total_servicios: items.length,
        total_clientes: 1,
        desglose: items,
        metodos_pago: payments,
        ...buildPagoColumns(payments),
        tasa_cambio: rates.bcv || globalBcvRate || 518.0,
        con_iva: withIva,
        notas: vdNotas,
        creado_por: 'Admin',
        sede_id: sedeIdFinal,
        estado: 'pagado',
        ...comprobanteFields(comprobanteUrl, comprobanteRef),
      };

      let ventaDia: any = null;
      if (existingVD) {
        const { data: upd, error: ventaError } = await supabase.from('ventas_dia')
          .update(vdPayload).eq('id', existingVD.id).select().single();
        if (ventaError) throw ventaError;
        ventaDia = upd;
      } else {
        const { data: ins, error: ventaError } = await supabase.from('ventas_dia')
          .insert(vdPayload).select().single();
        if (ventaError) throw ventaError;
        ventaDia = ins;
      }

      const { error: citaError } = await withSedeFilter(supabase.from('servicios')).update({
        estado: 'completada',
        ...comprobanteFields(comprobanteUrl, comprobanteRef),
      }).eq('id', cita.id);
      if (citaError) throw citaError;

      // ventas_dia is the authoritative accounting table for dashboard-originated sales.
      // ventas_silenciadores is reserved for bot/IA registrations to avoid duplicates in the combined view.

      let finalCorrelativo = undefined;
      try {
        const facturaRegistro = await registrarFactura({
          tipo: 'servicio',
          modulo_origen: 'servicios',
          referencia_id: cita.id,
          referencia_tabla: 'servicios',
          cliente: clientName,
          vehiculo: vehicleStr,
          total: total,
          moneda: 'USD',
          tasa_cambio: rates.bcv || globalBcvRate || 518.0,
          total_bs: totalVes,
          items: items,
          metodos_pago: payments,
          con_iva: withIva,
          estado: 'pagado',
          notas: cita.descripcion || undefined,
          emitido_por: useAppStore.getState().user?.nombre || 'Admin',
          fecha_emision: getLocalISODate(),
          sede_id: cita.sede_id || useSedeStore.getState().currentSede?.id,
          comprobante_url: comprobanteUrl || undefined,
          comprobante_referencia: comprobanteRef || undefined,
        });
        if (facturaRegistro?.correlativo) finalCorrelativo = facturaRegistro.correlativo;
      } catch (e) {
        console.error('Error registering centralized factura:', e);
      }

      logActivity({ usuario: useAppStore.getState().user?.nombre || 'Admin', modulo: 'Servicios', accion: 'Venta Finalizada', detalles: `Venta para ${clientName} por $${total.toFixed(2)}` });
      handleDownload(finalCorrelativo, { url: comprobanteUrl, ref: comprobanteRef });
      alert('¡Entrega procesada con éxito!');
      onClose();
      const btn = document.getElementById('refresh-btn');
      if (btn) btn.click();
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setIsSaving(false); }
  };

  const PAYMENT_METHODS = [
    { id: 'efectivo_usd', label: 'Efectivo USD' },
    { id: 'zelle', label: 'Zelle' },
    { id: 'pago_movil', label: 'Pago Móvil' },
    { id: 'punto_de_venta', label: 'Punto de Venta' },
    { id: 'euros', label: 'Euros (€)' },
    { id: 'otro', label: 'Personalizado' },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div className={cn(
        "bg-white rounded-2xl sm:rounded-[32px] w-full shadow-[0_30px_70px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[98vh] border border-white/10 transition-all duration-500",
        secondCita ? "max-w-6xl" : "max-w-2xl"
      )}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 border-b border-gray-100 bg-white gap-4">
          <h2 className="text-sm sm:text-base font-black flex items-center gap-2 text-slate-900 uppercase tracking-tighter">
            <FileText className="w-5 h-5 text-orange-500" /> {secondCita ? 'Facturación Dual' : 'Gestión de Entrega'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setShowSelector(!showSelector)}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border",
                secondCita ? "bg-primary/20 border-primary/30 text-primary" : "bg-gray-50 border-gray-100 text-slate-500 hover:bg-gray-100"
              )}
            >
              <MoveHorizontal className="w-4 h-4" /> 
              {secondCita ? 'Cambiar' : 'Dual'}
            </button>
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 border border-gray-200">
              <button 
                onClick={() => setPrintMode('single')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'single' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Única
              </button>
              <button 
                onClick={() => setPrintMode('dual')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'dual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
                title="Dos copias de la misma factura"
              >
                Dual
              </button>
              <button 
                onClick={() => {
                  setPrintMode('diferente');
                  if (!secondCita) setShowSelector(true);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  printMode === 'diferente' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
                title="Dos facturas diferentes"
              >
                Diferente
              </button>
            </div>

            {printMode === 'single' && (
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 border border-gray-200">
                <button 
                  onClick={() => setPrintSide('left')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    printSide === 'left' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Izq
                </button>
                <button 
                  onClick={() => setPrintSide('right')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    printSide === 'right' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Der
                </button>
              </div>
            )}

            <button 
              onClick={() => handleDownload()}
              className="p-2 sm:p-3 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 border border-orange-400/20"
              title="Descargar Nota"
            >
              <Download className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-gray-50 flex items-center justify-center transition-colors">
              <X className="w-6 h-6 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Dual Print Selector Overlay */}
        <AnimatePresence>
          {showSelector && (
            <motion.div 
              key="selector-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[130] flex items-center justify-center p-4 sm:p-6"
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowSelector(false)} />
              <motion.div 
                key="selector-modal"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-lg bg-white rounded-[32px] shadow-[0_30px_90px_rgba(0,0,0,0.4)] border border-white flex flex-col overflow-hidden max-h-[85%]"
              >
                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-orange-500" /> Segunda Factura
                  </h3>
                  <button onClick={() => setShowSelector(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <div className="p-6 flex flex-col gap-4 overflow-hidden">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      autoFocus
                      className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-slate-100/50 border-none text-xs font-bold text-slate-900 focus:ring-2 focus:ring-orange-500/20"
                      placeholder="Buscar cliente..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {citas.filter(c => c.id !== cita.id && (searchTerm === '' || `${c.nombre_cliente} ${c.vehiculo_info}`.toLowerCase().includes(searchTerm.toLowerCase()))).map((c, idx) => (
                      <button key={c.id || idx} onClick={() => { setSecondCita(c); setShowSelector(false); }} className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border-2 border-transparent hover:border-slate-100 transition-all">
                        <div className="text-left">
                          <p className="text-xs font-black text-slate-900 uppercase italic">{c.nombre_cliente || c.vehiculos?.clientes?.nombre}</p>
                          <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">{c.vehiculo_info || `${c.vehiculos?.marca} ${c.vehiculos?.modelo}`}</p>
                        </div>
                        <p className="text-[10px] font-black text-orange-500 italic">${c.costo_estimado || 0}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="p-4 sm:p-10 overflow-y-auto custom-scrollbar bg-white text-slate-900 font-sans">
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Factura 1 */}
            <div className="flex-1 border border-gray-200 p-6 sm:p-10 rounded-[40px] shadow-sm bg-white relative transition-all duration-500">
               <InvoiceEditor
                 cita={cita}
                 clientName={clientName} setClientName={setClientName}
                 vehicleStr={vehicleStr} setVehicleStr={setVehicleStr}
                 items={items} setItems={setItems}
                 withIva={withIva} setWithIva={setWithIva}
                 correlativo={existingCorrelativo || undefined}
                 rates={rates}
                 subtotal={subtotal} ivaAmount={ivaAmount} total={total} totalVes={totalVes}
               />
            </div>

            {/* Factura 2 */}
            {secondCita && (
              <motion.div 
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 border-2 border-orange-500/20 p-6 sm:p-10 rounded-[40px] shadow-2xl shadow-orange-500/5 bg-white relative"
              >
                <div className="absolute -top-3 left-10 bg-orange-500 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Segunda Factura</div>
                <InvoiceEditor 
                   cita={secondCita} 
                   clientName={secondClientName} setClientName={setSecondClientName}
                   vehicleStr={secondVehicleStr} setVehicleStr={setSecondVehicleStr}
                   items={secondItems} setItems={setSecondItems}
                   withIva={secondWithIva} setWithIva={setSecondWithIva}
                   rates={rates}
                   subtotal={secondItems.reduce((sum, item) => sum + (item.total || 0), 0)}
                   ivaAmount={secondWithIva ? secondItems.reduce((sum, item) => sum + (item.total || 0), 0) * 0.16 : 0}
                   total={secondItems.reduce((sum, item) => sum + (item.total || 0), 0) + (secondWithIva ? secondItems.reduce((sum, item) => sum + (item.total || 0), 0) * 0.16 : 0)}
                   totalVes={(secondItems.reduce((sum, item) => sum + (item.total || 0), 0) + (secondWithIva ? secondItems.reduce((sum, item) => sum + (item.total || 0), 0) * 0.16 : 0)) * (rates.bcv || 36.5)}
                 />
              </motion.div>
            )}
          </div>
        </div>

        {cita.estado !== 'completada' && (
          <div className="px-4 sm:px-8 pt-4">
            <ComprobanteInput value={comprobante} onChange={setComprobante} compact />
          </div>
        )}

        <div className="p-4 sm:p-8 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="hidden sm:flex items-center gap-4 text-slate-400">
             <Info className="w-5 h-5 text-orange-500" />
             <p className="text-[10px] font-bold uppercase tracking-widest leading-none">
               {secondCita ? 'Estás editando dos facturas simultáneamente.' : 'Puedes añadir una segunda factura arriba.'}
             </p>
           </div>
           <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
              <button onClick={onClose} className="w-full sm:w-auto px-8 py-3.5 sm:py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-slate-900 transition-all border border-transparent hover:border-gray-200">
                Cerrar
              </button>
              {cita.estado === 'completada' ? (
                <button 
                  disabled 
                  className="w-full sm:w-auto rounded-2xl bg-green-500 text-white font-black px-8 sm:px-12 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.2)] text-[10px] sm:text-[11px] uppercase tracking-[0.2em] gap-3 flex items-center justify-center transition-all cursor-not-allowed opacity-90"
                >
                  <BadgeCheck className="w-5 h-5 text-white" />
                  Venta Registrada
                </button>
              ) : (
                <button 
                  onClick={handleFinalizeSale} 
                  disabled={isSaving} 
                  className="w-full sm:w-auto rounded-2xl bg-black hover:bg-neutral-800 text-white font-black px-8 sm:px-12 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] text-[10px] sm:text-[11px] uppercase tracking-[0.2em] gap-3 flex items-center justify-center transition-all"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <BadgeCheck className="w-5 h-5 text-orange-500" />}
                  Finalizar {secondCita ? 'Entregas' : 'Entrega'}
                </button>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponent: Invoice Editor ──────────────────────────────
function InvoiceEditor({
  cita, clientName, setClientName, vehicleStr, setVehicleStr,
  items, setItems, withIva, setWithIva, rates,
  subtotal, ivaAmount, total, totalVes, correlativo
}: any) {
  const updateItem = (i: number, f: string, v: any) => {
    const n = [...items];
    const item = { ...n[i], [f]: v };
    if (f === 'cantidad' || f === 'precio_unitario') item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    n[i] = item;
    setItems(n);
  };
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_: any, idx: number) => idx !== i));
  const addItem = () => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, total: 0 }]);

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-0 mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter italic leading-none">LYCOS TEAM</h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Mecánica Integral</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Nota de Entrega</p>
          <p className="text-base font-black text-slate-900">{correlativo || `#${cita.id.slice(0, 8).toUpperCase()}`}</p>
          <p className="text-[10px] text-gray-500 mt-1 font-bold">{cita.fecha}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10 pb-10 border-b border-gray-100">
        <div className="space-y-1">
          <p className="text-[9px] font-black text-gray-300 uppercase mb-2">Cliente / Titular:</p>
          <input className="w-full text-sm font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent placeholder:text-gray-200" value={clientName} onChange={e => setClientName(e.target.value)} />
        </div>
        <div className="text-left sm:text-right space-y-1">
          <p className="text-[9px] font-black text-gray-300 uppercase mb-2">Datos del Vehículo:</p>
          <input className="w-full text-left sm:text-right text-sm font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent placeholder:text-gray-200" value={vehicleStr} onChange={e => setVehicleStr(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs mb-10 min-w-[400px]">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-4 font-black text-slate-900 uppercase tracking-widest text-[9px]">Servicio</th>
              <th className="text-center py-4 font-black text-slate-900 w-12 uppercase tracking-widest text-[9px]">Cant</th>
              <th className="text-right py-4 font-black text-slate-900 w-24 uppercase tracking-widest text-[9px]">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item: any, i: number) => (
              <tr key={i} className="group/item">
                <td className="py-4">
                  <input className="w-full text-[11px] font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent" value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} />
                </td>
                <td className="py-4">
                  <input type="number" className="w-full text-center text-[11px] font-bold text-slate-600 border-none p-0 focus:ring-0 bg-transparent" value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value))} />
                </td>
                <td className="py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-gray-300 font-bold">$</span>
                    <input type="number" className="w-16 text-right text-[11px] font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent" value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', parseFloat(e.target.value))} />
                  </div>
                </td>
                <td className="py-4 text-center">
                  {items.length > 1 && <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mb-8">
        <button onClick={addItem} className="text-[9px] font-black text-orange-500 uppercase tracking-widest flex items-center gap-2 hover:text-orange-600"><Plus className="w-3.5 h-3.5" /> Añadir Item</button>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={withIva} onChange={e => setWithIva(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-500" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">IVA (16%)</span>
        </label>
      </div>

      <div className="pt-6 border-t border-slate-900">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-gray-400">Total USD</span>
            <span className="text-2xl text-slate-900 font-black tracking-tighter italic">${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Total en Bolívares (BS)</span>
            <span className="text-base text-slate-900 font-black">{totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Budget Modal ───────────────────────────────────────────────
function BudgetModal({ cita, inventory, onClose }: { cita: CitaServicio; inventory: any[]; onClose: () => void }) {
  const getDisplayName = (c: CitaServicio) => {
    if (c.vehiculos?.clientes) return `${c.vehiculos.clientes.nombre} ${c.vehiculos.clientes.apellido}`;
    const raw = (c.nombre_cliente || '').trim();
    const upper = raw.toUpperCase();
    const reg = ((c as any).registrado_por || '').trim().toUpperCase();
    // Sin cliente real: marcadores automáticos o coincidencia con quien lo registró (modo dios)
    if (!raw || upper === 'NO DEFINIDO' || upper === 'SIN DEFINIR' ||
        upper.includes('WHATSAPP') || upper.includes('ADMIN IA') ||
        (!(c as any).cliente_id && reg && upper === reg)) {
      return 'Consumidor Final';
    }
    return raw;
  };

  const [clientName, setClientName] = useState(getDisplayName(cita) || 'Consumidor Final');
  const [clientPhone, setClientPhone] = useState(cita.telefono || '');
  
  const [vehicleStr, setVehicleStr] = useState(cita.vehiculos
    ? `${cita.vehiculos.marca} ${cita.vehiculos.modelo} (${cita.vehiculos.placa})`
    : cita.vehiculo_info || '—');

  const SERVICIO_LABELS: Record<string, string> = {
    mantenimiento_preventivo: 'Mantenimiento Preventivo',
    cambio_aceite: 'Cambio de Aceite',
    frenos: 'Frenos',
    motor: 'Motor',
    transmision: 'Transmisión',
    suspension: 'Suspensión',
    electrico: 'Sistema Eléctrico',
    aire_acondicionado: 'Aire Acondicionado',
    diagnostico: 'Diagnóstico por Escáner'
  };

  const [items, setItems] = useState(() => {
    const match = inventory.find((i: any) => 
      (cita.descripcion || '').toLowerCase().includes(i.nombre.toLowerCase().trim()) ||
      i.nombre.toLowerCase().trim().includes((cita.descripcion || '').toLowerCase().trim()) ||
      (cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || '').toLowerCase().includes(i.nombre.toLowerCase().trim())
    );
    const price = match?.precio_usd || cita.costo_estimado || 0;
    return [{
      id: `item-${Date.now()}`,
      tipo: match ? 'repuesto' : 'servicio',
      descripcion: cita.descripcion || cita.tipo_personalizado || SERVICIO_LABELS[cita.tipo] || 'Servicio General',
      cantidad: 1,
      precio_unitario: price,
      moneda: 'USD' as const,
      total: price,
      inventario_id: match ? match.id : null,
    }];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [globalBcvRate, setGlobalBcvRate] = useState(0);
  
  useEffect(() => {
    fetch('/api/rates?t=' + Date.now()).then(r => r.json()).then(d => setGlobalBcvRate(d.bcv || 0)).catch(() => {});
  }, []);

  const [validezDias, setValidezDias] = useState(15);
  const [notas, setNotas] = useState('');
  
  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  const total = subtotal;

  const addItem = () => setItems([...items, { id: `item-${Date.now()}`, tipo: 'servicio', descripcion: '', cantidad: 1, precio_unitario: 0, moneda: 'USD' as const, total: 0, inventario_id: null }]);
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, f: string, v: any) => {
    const n = [...items];
    const item = { ...n[i], [f]: v };
    if (f === 'cantidad' || f === 'precio_unitario') item.total = (item.cantidad || 0) * (item.precio_unitario || 0);
    n[i] = item;
    setItems(n);
  };

  const handleSaveBudget = async () => {
    if (!clientName.trim()) return alert('El nombre del cliente es obligatorio.');
    
    setIsSaving(true);
    try {
      const numero = await generateNumeroPresupuesto();
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + validezDias);
      
      const payload = {
        numero,
        cliente_id: cita.cliente_id || null,
        cliente_nombre: clientName.trim(),
        cliente_telefono: clientPhone.trim() || null,
        vehiculo_id: cita.vehiculo_id || null,
        vehiculo_info: vehicleStr.trim() || null,
        moneda: 'USD',
        tasa_cambio: globalBcvRate,
        items,
        subtotal,
        descuento: 0,
        descuento_tipo: 'porcentaje',
        iva: 0,
        total,
        notas: notas.trim() || null,
        estado: 'borrador',
        validez_dias: validezDias,
        fecha_expiracion: expDate.toISOString(),
      };
      
      const result = await createPresupuesto(payload);
      if (!result) throw new Error('Error al crear presupuesto');
      
      generatePresupuestoPDF({
        numero,
        created_at: new Date().toISOString(),
        fecha_expiracion: expDate.toISOString(),
        cliente_nombre: payload.cliente_nombre,
        cliente_telefono: payload.cliente_telefono,
        vehiculo_info: payload.vehiculo_info,
        moneda: payload.moneda,
        tasa_cambio: payload.tasa_cambio,
        items,
        subtotal: payload.subtotal,
        descuento: 0,
        descuento_tipo: 'porcentaje',
        iva: 0,
        total: payload.total,
        notas: payload.notas,
        estado: 'borrador',
        validez_dias: payload.validez_dias,
      });
      
      alert(`¡Presupuesto #${numero} creado y guardado en la tabla de presupuestos con éxito!`);
      onClose();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-card border border-border w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden rounded-[32px] animate-in zoom-in-95 duration-300">
        
        <div className="p-6 border-b border-border flex items-center justify-between shrink-0 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[20px] bg-primary/20 flex items-center justify-center border border-primary/30">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight italic" style={{ fontFamily: 'Syne, sans-serif' }}>
                Generar Presupuesto
              </h3>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">A partir de Ticket #{cita.id.slice(0,8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-all group shrink-0">
            <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>
        
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nombre del Cliente</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                value={clientName} onChange={e => setClientName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vehículo / Placa</label>
              <input 
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                value={vehicleStr} onChange={e => setVehicleStr(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-border rounded-[24px] bg-muted/10 overflow-hidden overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-12 gap-2 bg-muted/40 p-4 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <div className="col-span-6">Descripción</div>
              <div className="col-span-2 text-center">Cant</div>
              <div className="col-span-2 text-right">Precio $</div>
              <div className="col-span-2 text-right">Total $</div>
            </div>
            <div className="divide-y divide-border/50">
              {items.map((item, i) => (
                <div key={i} className="p-2 flex items-center gap-2">
                   <div className="w-8 flex justify-center shrink-0">
                     <button onClick={() => removeItem(i)} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                   <div className="grid grid-cols-12 gap-2 flex-1 items-center">
                     <div className="col-span-6">
                       <input 
                         className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary/50 focus:bg-background rounded-lg px-2 py-1.5 text-sm text-foreground outline-none transition-all"
                         value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)}
                       />
                     </div>
                     <div className="col-span-2">
                       <input 
                         type="number" min="1" step="1"
                         className="w-full text-center bg-transparent border border-transparent hover:border-border focus:border-primary/50 focus:bg-background rounded-lg px-2 py-1.5 text-sm font-mono text-foreground outline-none transition-all"
                         value={item.cantidad} onChange={e => updateItem(i, 'cantidad', parseFloat(e.target.value) || 0)}
                       />
                     </div>
                     <div className="col-span-2 relative">
                       <input 
                         type="number" min="0" step="0.01"
                         className="w-full text-right bg-transparent border border-transparent hover:border-border focus:border-primary/50 focus:bg-background rounded-lg pl-6 pr-2 py-1.5 text-sm font-mono text-foreground outline-none transition-all"
                         value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', parseFloat(e.target.value) || 0)}
                       />
                       <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">$</span>
                     </div>
                     <div className="col-span-2 text-right px-2 text-sm font-mono font-bold text-primary">
                       $ {item.total.toFixed(2)}
                     </div>
                   </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-muted/20 border-t border-border flex justify-center">
              <button 
                onClick={addItem}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-foreground hover:bg-primary px-4 py-2 rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" /> Agregar Ítem
              </button>
            </div>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Notas (Opcional)</label>
              <textarea 
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/30 outline-none transition-all resize-none h-24 custom-scrollbar"
                placeholder="Notas que aparecerán en el PDF..."
                value={notas} onChange={e => setNotas(e.target.value)}
              />
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-[24px] p-6 space-y-3 relative overflow-hidden">
               <div className="absolute right-0 top-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
               <div className="flex justify-between items-center relative z-10">
                 <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tasa BCV Referencial</span>
                 <span className="text-sm font-mono font-bold text-foreground">{globalBcvRate || 'Cargando...'} Bs</span>
               </div>
               <div className="flex justify-between items-end relative z-10 pt-2 border-t border-primary/10">
                 <span className="text-sm font-black uppercase tracking-[0.3em] text-primary">Total Presupuesto</span>
                 <div className="text-right">
                   <p className="text-3xl font-black text-primary font-mono leading-none">$ {total.toFixed(2)}</p>
                   <p className="text-xs font-bold text-muted-foreground mt-1 tracking-widest">{(total * (globalBcvRate || 1)).toFixed(2)} Bs</p>
                 </div>
               </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-border bg-card shrink-0">
          <Button 
            onClick={handleSaveBudget} 
            disabled={isSaving} 
            className="w-full h-16 rounded-[24px] bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 gap-3"
          >
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
            Guardar Presupuesto y Generar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
