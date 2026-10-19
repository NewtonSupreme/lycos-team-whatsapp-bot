'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, autoRegisterSaleFromService } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wrench, Loader2, RefreshCw, Car, Trash, User, Phone, Search, X, ChevronLeft, ChevronRight, Banknote, Package } from 'lucide-react';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { logActivity } from '@/lib/activity';
import { cn } from '@/lib/utils';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import PersonalYComisiones, { type AsignacionEmpleado } from '@/components/nomina/PersonalYComisiones';
import {
  ModalCatalogoInventario, useInventario, precioEfectivoDe, type ProductoInventario,
} from '@/components/inventario/SelectorRepuesto';
import { asignacionesValidas, buildJobsDesdeAsignacion } from '@/lib/nomina/asignaciones';
import { categoriaToZona, inferirCategoria } from '@/lib/categorias';
import { getLocalISODate } from '@/lib/utils';

interface ServicioRow {
  id: string;
  descripcion: string | null;
  tipo: string;
  tipo_personalizado: string | null;
  estado: string;
  costo_estimado: number | null;
  nombre_cliente: string | null;
  vehiculo_info: string | null;
  placa: string | null;
  telefono: string | null;
  cliente_id: string | null;
  vehiculo_id: string | null;
  seguimiento: any[] | null;
  created_at: string;
  registrado_por: string | null;
  sede_id?: string | null;
}

/**
 * Un repuesto del almacén usado en el trabajo.
 *
 * Se guarda dentro de `servicios.items` con la misma forma que los renglones de
 * una orden de servicio, para que el descuento de inventario, la factura y la
 * ficha del vehículo lo entiendan sin casos especiales.
 */
interface RepuestoTaller {
  inventario_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  costo_unitario: number;
  total: number;
  stock_descontado: number;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'Pendiente',  color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20' },
  confirmada:  { label: 'Confirmada', color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20' },
  en_revision: { label: 'Revisión',   color: 'text-fuchsia-400',bg: 'bg-fuchsia-400/10 border-fuchsia-400/20' },
  en_proceso:  { label: 'En taller' , color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20' },
  completada:  { label: 'Completada', color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20' },
  cancelada:   { label: 'Cancelada',  color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20' },
};

const STATIC_TIPO_OPTIONS = [
  { value: 'mecanica', label: 'Mecánica' },
  { value: 'electronica', label: 'Electrónica' },
  { value: 'cerrajeria', label: 'Cerrajería' },
  { value: 'diagnostico', label: 'Diagnóstico' },
  { value: 'motor', label: 'Motor' },
  { value: 'emergencia', label: 'Emergencia' },
  { value: 'otro', label: 'General' },
];

const ESTADO_ORDER = ['pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'cancelada'];

const NEXT_ESTADOS: Record<string, string> = {
  pendiente: 'confirmada',
  confirmada: 'en_revision',
  en_revision: 'en_proceso',
  en_proceso: 'completada',
};
const PREV_ESTADOS: Record<string, string> = {
  confirmada: 'pendiente',
  en_revision: 'confirmada',
  en_proceso: 'en_revision',
  completada: 'en_proceso',
};

const DATE_FILTERS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: '7d' },
  { id: 'mes', label: '30d' },
  { id: 'todos', label: 'Todo' },
] as const;
type DateFilterId = (typeof DATE_FILTERS)[number]['id'];

interface ClienteOption {
  id: string;
  nombre_completo: string;
  telefono: string;
}

// Helper para formatear nombre
const getDisplayName = (nombre: string | null) => {
  if (!nombre) return 'NO DEFINIDO';
  const upper = nombre.toUpperCase();
  if (upper.includes('WHATSAPP') || upper.includes('ADMIN IA')) return 'NO DEFINIDO';
  return nombre;
};

export default function TallerPage() {
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();
  const [servicios, setServicios] = useState<ServicioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('todas');
  const [dateFilter, setDateFilter] = useState<DateFilterId>('todos');

  // Form states
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [vehiculoInfo, setVehiculoInfo] = useState('');
  const [placa, setPlaca] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('mecanica');
  const [tipoPersonalizado, setTipoPersonalizado] = useState('');
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [costoEstimado, setCostoEstimado] = useState('');

  // ── Repuestos tomados del almacén ────────────────────────────────────────
  // Antes esta pantalla registraba el trabajo con `items: []`, así que la pieza
  // salía del taller y el inventario se quedaba igual. Enlazar el repuesto es
  // lo único que permite descontarlo.
  const { productos: inventario } = useInventario();
  const [repuestos, setRepuestos] = useState<RepuestoTaller[]>([]);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);

  const agregarRepuesto = (p: ProductoInventario, pedidas = 1) => {
    const suma = Math.max(1, pedidas);
    setRepuestos(prev => {
      // Si ya está en la lista se suma la cantidad en vez de repetir la línea.
      const i = prev.findIndex(r => r.inventario_id === p.id);
      if (i >= 0) {
        const copia = [...prev];
        const cantidad = copia[i].cantidad + suma;
        copia[i] = { ...copia[i], cantidad, total: cantidad * copia[i].precio_unitario };
        return copia;
      }
      const precio = precioEfectivoDe(p);
      return [...prev, {
        inventario_id: p.id,
        descripcion: p.nombre,
        cantidad: suma,
        precio_unitario: precio,
        costo_unitario: Number(p.precio_fabricante) || 0,
        total: suma * precio,
        stock_descontado: 0,
      }];
    });
  };

  const cambiarCantidad = (idx: number, cantidad: number) => {
    setRepuestos(prev => prev.map((r, i) => (
      i === idx ? { ...r, cantidad: Math.max(1, cantidad || 1), total: Math.max(1, cantidad || 1) * r.precio_unitario } : r
    )));
  };

  const quitarRepuesto = (idx: number) => setRepuestos(prev => prev.filter((_, i) => i !== idx));

  const totalRepuestos = repuestos.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const manoDeObra = parseFloat(costoEstimado) || 0;
  const totalTrabajo = manoDeObra + totalRepuestos;

  // Personal a cargo. Antes esto era un buscador de texto libre: el nombre se
  // guardaba dentro de `notas` y no quedaba enlazado a ninguna ficha, así que
  // el trabajo nunca generaba comisión. Peor: si el nombre no existía, creaba
  // en silencio un usuario nuevo e inactivo, y así se llenó la base de fichas
  // duplicadas —incluida una de Freddy a la que apuntaban 95 órdenes—.
  const [asignaciones, setAsignaciones] = useState<AsignacionEmpleado[]>([]);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ClienteOption[]>([]);
  const [showClientResults, setShowClientResults] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const clientSearchRef = useRef<HTMLDivElement>(null);

  // Close client results on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setShowClientResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchClientes = useCallback(async (q: string) => {
    if (!supabase || q.length < 2) { setClientResults([]); return; }
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, apellido, telefono')
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,telefono.ilike.%${q}%`)
      .limit(8);
    if (data) {
      setClientResults(data.map(c => ({
        id: c.id,
        nombre_completo: `${c.nombre} ${c.apellido}`.trim(),
        telefono: c.telefono || '',
      })));
    }
  }, []);

  const selectCliente = async (cliente: ClienteOption) => {
    setNombreCliente(cliente.nombre_completo);
    setTelefono(cliente.telefono);
    setSelectedClienteId(cliente.id);
    setShowClientResults(false);
    setClientSearch(cliente.nombre_completo);

    // Auto-fill vehicle info
    if (!supabase) return;
    const { data: veh } = await supabase
      .from('vehiculos')
      .select('marca, modelo, placa')
      .eq('cliente_id', cliente.id)
      .limit(1)
      .maybeSingle();
    if (veh) {
      setVehiculoInfo(`${veh.marca} ${veh.modelo}`);
      setPlaca(veh.placa || '');
    }
  };

  const handleClientInputChange = (val: string) => {
    setNombreCliente(val);
    setClientSearch(val);
    setSelectedClienteId(null);
    if (val.length >= 2) {
      searchClientes(val);
      setShowClientResults(true);
    } else {
      setClientResults([]);
      setShowClientResults(false);
    }
  };

  const deleteTrabajo = async (id: string) => {
    if (!can('taller', 'eliminar')) return alert('No tienes permisos para eliminar tickets.');
    if (!confirm('¿Seguro que quieres eliminar este ticket? No se puede deshacer.')) return;
    if (!supabase) return;
    const { error } = await withSedeFilter(supabase.from('servicios')).delete().eq('id', id);
    if (!error) {
      setServicios(prev => prev.filter(s => s.id !== id));
      logActivity({
        usuario: user?.nombre || 'Admin',
        modulo: 'Taller',
        accion: 'Eliminó trabajo de taller',
        detalles: `Trabajo #${id.slice(0,5)} eliminado desde Taller.`,
        referencia_id: id,
        referencia_tabla: 'servicios',
      });
    } else {
      alert('Error al eliminar registro');
    }
  };

  const fetchTrabajos = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    // Todas, por tandas: con un tope de 100 los trabajos de meses anteriores
    // no aparecían y parecía que se habían perdido.
    const todas: ServicioRow[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await withSedeFilter(supabase.from('servicios'))
        .select('id, descripcion, tipo, tipo_personalizado, estado, costo_estimado, nombre_cliente, vehiculo_info, placa, telefono, cliente_id, vehiculo_id, seguimiento, created_at, registrado_por, sede_id')
        .order('created_at', { ascending: false })
        .range(desde, desde + 999);
      if (error || !data) break;
      todas.push(...(data as unknown as ServicioRow[]));
      if (data.length < 1000) break;
    }
    setServicios(todas);
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

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente', confirmada: 'Confirmada', en_revision: 'En Revisión',
      en_proceso: 'En taller', completada: 'Completada',
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

  const fetchCustomTypes = useCallback(async () => {
    if (!supabase) return;
    const { data } = await withSedeFilter(supabase.from('servicios'))
      .select('tipo_personalizado')
      .not('tipo_personalizado', 'is', null)
      .neq('tipo_personalizado', '');
    if (data) {
      const unique = [...new Set(data.map((r: any) => r.tipo_personalizado).filter(Boolean) as string[])];
      setCustomTypes(unique);
    }
  }, []);

  useEffect(() => { fetchCustomTypes(); }, [fetchCustomTypes]);

  const updateEstado = async (id: string, nuevoEstado: string) => {
    if (!can('taller', 'editar')) return alert('No tienes permisos para cambiar el estado de los tickets.');
    const servicio = servicios.find(s => s.id === id);
    if (!servicio || servicio.estado === nuevoEstado) return;
    if (!supabase) return;

    const info = getTransicionInfo(servicio.estado, nuevoEstado);
    const newEntry = {
      fecha: new Date().toISOString(),
      accion: info.fmt,
      usuario: user?.nombre || 'Admin',
      tipo: 'sistema',
    };
    const newSeguimiento = [...(servicio.seguimiento || []), newEntry];

    const { error } = await withSedeFilter(supabase.from('servicios'))
      .update({ estado: nuevoEstado, seguimiento: newSeguimiento })
      .eq('id', id);
    if (error) { alert('Error al cambiar estado'); return; }

    logActivity({
      usuario: user?.nombre || 'Admin',
      modulo: 'Taller',
      accion: info.accion,
      detalles: `${info.fmt} - Ticket #${id.slice(0,5)} de ${servicio.nombre_cliente || 'cliente'}`,
      referencia_id: id,
      referencia_tabla: 'servicios',
    });

    if (nuevoEstado === 'completada' || nuevoEstado === 'finalizado') {
      try {
        await autoRegisterSaleFromService({
          ...servicio,
          estado: nuevoEstado,
          seguimiento: newSeguimiento,
          sede_id: servicio.sede_id || currentSede?.id || undefined,
        }, { userName: user?.nombre || 'Admin' });
      } catch (err) {
        console.error('Error registrando venta automática desde Taller:', err);
      }
    }

    if (nuevoEstado === 'en_revision' || nuevoEstado === 'completada') {
      fetch('/api/notificaciones/create', {
        method: 'POST',
        body: JSON.stringify({
          sede_id: currentSede?.id,
          tipo: nuevoEstado === 'completada' ? 'success' : 'info',
          titulo: '🔄 Servicio actualizado',
          mensaje: `${servicio.nombre_cliente || 'Servicio'} cambió a: ${getEstadoLabel(nuevoEstado)}`,
          entidad_tipo: 'servicio',
          entidad_id: id,
          url: '/dashboard/taller'
        })
      });
    }

    setServicios(prev => prev.map(s => s.id === id ? { ...s, estado: nuevoEstado, seguimiento: newSeguimiento } : s));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('taller', 'crear')) return alert('No tienes permisos para crear tickets de taller.');
    if (!supabase) return;
    if (!nombreCliente.trim() || !descripcion.trim()) return;

    setRegistering(true);
    try {
      let finalClienteId = selectedClienteId;
      let finalVehiculoId: string | null = null;

      const standardTypes = STATIC_TIPO_OPTIONS.map(o => o.value);
      const isCustomType = !standardTypes.includes(tipo);
      const finalTipo = isCustomType ? 'otro' : tipo;
      const finalTipoPersonalizado = isCustomType ? (tipo === 'personalizado' ? tipoPersonalizado.trim() : tipo) : null;

      // Quién hizo el trabajo es obligatorio: es el dato del que sale la
      // comisión, y sin él la orden nace ya fuera de nómina.
      const validas = asignacionesValidas(asignaciones);
      if (validas.length === 0) {
        throw new Error('Indica el personal a cargo o marca que lo hizo el taller.');
      }

      // Aquí antes se creaba un usuario nuevo por cada nombre que no existiera:
      // 24 de las 31 fichas de la base salieron de eso, sin acceso y a medias.
      // Ahora solo se elige personal ya registrado, así que no hay nada que crear.

      // 2. Create client if needed
      if (!finalClienteId) {
        const names = nombreCliente.trim().split(' ');
        const nombre = names[0];
        const apellido = names.slice(1).join(' ') || '—';
        const { data: newClient, error: clientErr } = await withSedeFilter(supabase.from('clientes'))
          .insert(withSedeInsert({ nombre, apellido, telefono, notas: 'Registrado desde Taller' }))
          .select()
          .single();
        if (clientErr) throw clientErr;
        finalClienteId = newClient.id;
      }

      // 2. Create vehicle if needed
      if (placa.trim()) {
        const { data: existingVeh } = await supabase.from('vehiculos')
          .select('id')
          .eq('placa', placa.trim())
          .maybeSingle();
        if (existingVeh) {
          finalVehiculoId = existingVeh.id;
        }
      }
      
      if (!finalVehiculoId && finalClienteId && vehiculoInfo.trim()) {
        const vNames = vehiculoInfo.trim().split(' ');
        const marca = vNames[0];
        const modelo = vNames.slice(1).join(' ') || '—';
        const { data: newVeh, error: vehErr } = await withSedeFilter(supabase.from('vehiculos'))
          .insert(withSedeInsert({ cliente_id: finalClienteId, marca, modelo, placa: placa.trim().toUpperCase() || 'SIN-PLACA', estado: 'en_servicio' }))
          .select()
          .single();
        if (vehErr) throw vehErr;
        finalVehiculoId = newVeh.id;
      }

      // 3. Create servicio
      const now = new Date();
      if (finalTipoPersonalizado) {
        setCustomTypes(prev => prev.includes(finalTipoPersonalizado!) ? prev : [...prev, finalTipoPersonalizado!]);
      }
      const payload = {
        cliente_id: finalClienteId,
        vehiculo_id: finalVehiculoId,
        nombre_cliente: nombreCliente.trim(),
        telefono: telefono.trim(),
        vehiculo_info: vehiculoInfo.trim(),
        placa: placa.trim().toUpperCase() || 'SIN-PLACA',
        descripcion: descripcion.trim() || 'Servicio de taller',
        tipo: finalTipo,
        tipo_personalizado: finalTipoPersonalizado,
        estado: 'pendiente',
        // El trabajo cuesta la mano de obra MÁS los repuestos que salieron del
        // almacén. Antes solo se guardaba lo escrito a mano y las piezas no
        // aparecían por ningún lado: ni en el cobro, ni en la factura, ni en el
        // stock.
        costo_estimado: totalTrabajo,
        // Los repuestos viajan como renglones, igual que en la orden de
        // servicio, para que se puedan descontar y facturar.
        items: [
          ...(manoDeObra > 0 ? [{
            descripcion: descripcion.trim() || finalTipoPersonalizado || 'Mano de obra',
            cantidad: 1,
            precio_unitario: manoDeObra,
            total: manoDeObra,
            inventario_id: null,
          }] : []),
          ...repuestos,
        ],
        registrado_por: user?.nombre || 'Admin',
        fecha: now.toISOString().split('T')[0],
        hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        notas: '',
        seguimiento: [
          {
            fecha: now.toISOString(),
            accion: 'Registrado desde Taller',
            usuario: user?.nombre || 'Admin',
            tipo: 'sistema',
            progreso: 0,
          },
          ...validas.map(a => ({
            fecha: now.toISOString(),
            accion: `Encargado asignado: ${a.es_taller ? 'El taller' : a.nombre}`,
            usuario: user?.nombre || 'Admin',
            tipo: 'sistema'
          }))
        ],
      };

      const { data: nuevoServicio, error } = await withSedeFilter(supabase.from('servicios'))
        .insert(withSedeInsert(payload)).select().single();
      if (error) throw error;

      // Almacén: se descuenta contra el trabajo ya grabado, nunca antes. Si el
      // registro hubiera fallado, el stock no se habría movido.
      let avisosStock: string[] = [];
      if (repuestos.length > 0 && nuevoServicio?.id) {
        try {
          const res = await fetch('/api/inventario/descontar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servicio_id: nuevoServicio.id }),
          });
          const d = await res.json().catch(() => null);
          avisosStock = res.ok
            ? (Array.isArray(d?.avisos) ? d.avisos : [])
            : [d?.error || 'No se pudo ajustar el inventario.'];
        } catch {
          avisosStock = ['No se pudo contactar con el servidor para ajustar el inventario.'];
        }
      }

      // El trabajo entra a nómina por el mismo camino que la orden de servicio y
      // el punto de venta. Sin esto el trabajo quedaba cobrado y sin comisión,
      // que es exactamente lo que pasó con cientos de órdenes de esta pantalla.
      try {
        await fetch('/api/nomina/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sede: useSedeStore.getState().currentSede?.id || null,
            referencia_id: nuevoServicio?.id || null,
            jobs: validas.flatMap(a => buildJobsDesdeAsignacion(a, {
              items: [],
              costoTotal: manoDeObra,   // la comisión sale de la mano de obra, no del precio de la pieza
              tipoTrabajo: finalTipoPersonalizado || finalTipo,
              descripcionBase: descripcion.trim() || finalTipoPersonalizado || finalTipo,
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
        modulo: 'Taller',
        accion: 'Nuevo trabajo en taller',
        detalles: `Registrado: ${nombreCliente} — ${vehiculoInfo || placa || 'Sin vehículo'} — ${descripcion.substring(0, 50)}`,
        referencia_tabla: 'servicios',
      });

      fetchTrabajos();

      // Reset form
      setNombreCliente(''); setTelefono(''); setVehiculoInfo(''); setPlaca('');
      setDescripcion(''); setTipo('mecanica'); setTipoPersonalizado(''); setCostoEstimado('');
      setAsignaciones([]); setRepuestos([]);
      setSelectedClienteId(null); setClientSearch(''); setClientResults([]);

      // El trabajo ya quedó registrado; lo del almacén se cuenta al final para
      // que un aviso de stock no parezca que falló el registro.
      if (avisosStock.length > 0) {
        alert(`El trabajo se registró.\n\nSobre el inventario:\n· ${avisosStock.join('\n· ')}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Error registrando el trabajo: ' + (err.message || 'desconocido'));
    }
    setRegistering(false);
  };

  const filtrados = servicios.filter(s => {
    const q = searchQuery.toLowerCase();
    if (q && !s.nombre_cliente?.toLowerCase().includes(q) &&
        !s.vehiculo_info?.toLowerCase().includes(q) &&
        !s.placa?.toLowerCase().includes(q) &&
        !s.descripcion?.toLowerCase().includes(q)) return false;
    if (estadoFilter !== 'todas' && s.estado !== estadoFilter) return false;
    if (dateFilter !== 'todos') {
      const d = new Date(s.created_at);
      const now = new Date();
      if (dateFilter === 'hoy') {
        if (
          d.getDate() !== now.getDate() ||
          d.getMonth() !== now.getMonth() ||
          d.getFullYear() !== now.getFullYear()
        ) {
          return false;
        }
      } else if (dateFilter === 'semana') {
        const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
        if (d < weekAgo) return false;
      } else if (dateFilter === 'mes') {
        const monthAgo = new Date(); monthAgo.setMonth(now.getMonth() - 1);
        if (d < monthAgo) return false;
      }
    }
    return true;
  });

  const ESTADOS_FILTER = ['todas', 'pendiente', 'confirmada', 'en_revision', 'en_proceso', 'completada', 'cancelada'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Trabajos de Taller</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro rápido de servicios con cliente y vehículo</p>
        </div>
        <button
          onClick={fetchTrabajos}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/30 border border-border/30 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Car className="w-5 h-5 text-primary" />
              Nuevo Trabajo
            </CardTitle>
            <CardDescription className="text-xs">Registro con cliente y vehículo</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-3">
              {/* Client search */}
              <div className="space-y-1.5" ref={clientSearchRef}>
                <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center gap-1">
                  <User className="w-3 h-3" /> Cliente <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    placeholder="Buscar o escribir nombre..."
                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pl-8"
                    value={clientSearch}
                    onChange={e => handleClientInputChange(e.target.value)}
                    onFocus={() => { if (clientResults.length > 0) setShowClientResults(true); }}
                  />
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {showClientResults && clientResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                      {clientResults.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCliente(c)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary/5 border-b border-border/10 last:border-0 transition-colors flex items-center gap-2"
                        >
                          <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium truncate block">{c.nombre_completo}</span>
                            {c.telefono && <span className="text-[10px] text-muted-foreground">{c.telefono}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Teléfono
                </label>
                <input
                  type="text"
                  placeholder="0412-..."
                  className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                />
              </div>

              {/* Vehicle info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center min-h-[16px]">Vehículo</label>
                  <input
                    type="text"
                    placeholder="Marca Modelo"
                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all h-[38px]"
                    value={vehiculoInfo}
                    onChange={e => setVehiculoInfo(e.target.value)}
                  />
                </div>
                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center min-h-[16px]">Placa</label>
                  <input
                    type="text"
                    placeholder="ABC123"
                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground uppercase font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all h-[38px]"
                    value={placa}
                    onChange={e => setPlaca(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              {/* Type + Cost */}
              <div className={tipo === 'personalizado' ? 'space-y-2' : 'grid grid-cols-2 gap-2'}>
                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center min-h-[16px]">Tipo</label>
                  <select
                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all h-[38px]"
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                  >
                    <optgroup label="— Estándar —">
                      {STATIC_TIPO_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                    {customTypes.length > 0 && (
                      <optgroup label="— Personalizados —">
                        {customTypes.map(ct => (
                          <option key={ct} value={ct}>{ct}</option>
                        ))}
                      </optgroup>
                    )}
                    <option value="personalizado">✨ Personalizado...</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center gap-1 min-h-[16px]">
                    <Banknote className="w-3 h-3" /> Mano de obra $US
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all h-[38px]"
                    value={costoEstimado}
                    onChange={e => setCostoEstimado(e.target.value)}
                  />
                </div>
                {tipo === 'personalizado' && (
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5">
                      Nombre del servicio personalizado <span className="text-red-400">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Ej: Reparación de A/C, Instalación de turbo..."
                      className="w-full bg-muted/50 border border-primary/50 rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                      value={tipoPersonalizado}
                      onChange={e => setTipoPersonalizado(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5">
                  Descripción <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ej: Cambio de aceite y filtro, revisión de frenos..."
                  className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                />
              </div>

              {/* Repuestos del almacén — lo que hace que la pieza usada aquí
                  deje de salir del taller sin bajar del stock. */}
              <div className="space-y-1.5">
                <div className="ml-1 flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Repuestos del inventario
                  </label>
                  <button
                    type="button"
                    onClick={() => setCatalogoAbierto(true)}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
                  >
                    <Package className="h-3 w-3" /> Buscar en el almacén
                  </button>
                </div>
                <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-2">
                  {repuestos.length === 0 ? (
                    <p className="px-1 py-1 text-[10.5px] leading-snug text-muted-foreground">
                      Sin repuestos. Si el trabajo lleva piezas del almacén, búscalas ahí arriba:
                      se descuentan solas, se suman al cobro y el gasto queda cargado a ese vehículo.
                    </p>
                  ) : (
                    <>
                      {repuestos.map((r, i) => (
                        <div key={r.inventario_id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
                            {r.descripcion}
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={r.cantidad}
                            onChange={e => cambiarCantidad(i, parseInt(e.target.value, 10))}
                            title="Cantidad"
                            className="w-12 rounded-lg border border-border bg-background/60 px-1.5 py-1.5 text-center text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <span className="w-16 text-right text-[11px] font-black tabular-nums text-primary">
                            ${r.total.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => quitarRepuesto(i)}
                            title="Quitar"
                            className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-red-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="mt-1 flex items-center justify-end gap-3 border-t border-border/40 pt-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Mano de obra ${manoDeObra.toFixed(2)} + repuestos ${totalRepuestos.toFixed(2)}
                        </span>
                        <span className="text-sm font-black tabular-nums text-primary">
                          ${totalTrabajo.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Personal a cargo — el mismo selector de la orden de servicio y
                  el punto de venta, para que el trabajo salga de aquí ya con su
                  comisión calculada en vez de un nombre suelto en las notas. */}
              <div className="pt-2 border-t border-border/30">
                <PersonalYComisiones
                  value={asignaciones}
                  onChange={setAsignaciones}
                  sedeId={useSedeStore.getState().currentSede?.id || null}
                  defaultZona={categoriaToZona(inferirCategoria(`${tipo} ${tipoPersonalizado} ${descripcion}`))}
                  costoTotal={parseFloat(costoEstimado) || 0}
                  tipoTrabajo={tipoPersonalizado || tipo}
                  descripcionTrabajo={descripcion || null}
                />
              </div>

              {can('taller', 'crear') && (
                <button
                  type="submit"
                  disabled={registering}
                  className="w-full mt-1 bg-primary/15 text-primary font-semibold py-2.5 rounded-xl border border-primary/25 hover:bg-primary/25 transition-colors flex justify-center items-center gap-2 text-sm disabled:opacity-50"
                >
                  {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                  Registrar Trabajo
                </button>
              )}
            </form>

            {/* El almacén, con buscador y los dos precios. Se queda abierto al
                elegir: en el taller se cargan varias piezas de una vez. */}
            <ModalCatalogoInventario
              abierto={catalogoAbierto}
              onCerrar={() => setCatalogoAbierto(false)}
              productos={inventario}
              onElegir={agregarRepuesto}
            />
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Historial Reciente</CardTitle>
                <CardDescription className="text-xs">Últimos 100 trabajos registrados</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Date filter buttons */}
                <div className="flex items-center bg-muted/20 border border-border/30 rounded-lg p-0.5 gap-0.5">
                  {DATE_FILTERS.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setDateFilter(f.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                        dateFilter === f.id ? "bg-primary/20 text-primary shadow-inner" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="w-28 sm:w-36 bg-background/50 border border-border/50 rounded-lg pl-8 pr-6 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {/* Estado filter */}
                <select
                  className="bg-background/50 border border-border/50 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={estadoFilter}
                  onChange={e => setEstadoFilter(e.target.value)}
                >
                  {ESTADOS_FILTER.map(ef => (
                    <option key={ef} value={ef}>
                      {ef === 'todas' ? 'Todas' : ESTADO_CONFIG[ef]?.label || ef}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                <Car className="w-8 h-8 opacity-20 mb-2" />
                {searchQuery || estadoFilter !== 'todas' ? 'Sin resultados para esta búsqueda' : 'No hay trabajos registrados'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border/30">
                    <tr>
                      <th className="px-3 py-3 font-medium">Fecha</th>
                      <th className="px-3 py-3 font-medium">Cliente / Vehículo</th>
                      <th className="px-3 py-3 font-medium hidden sm:table-cell">Descripción</th>
                      <th className="px-3 py-3 font-medium">Tipo</th>
                      <th className="px-3 py-3 font-medium">Estado</th>
                      <th className="px-3 py-3 font-medium w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(s => (
                      <tr key={s.id} className="border-b border-border/10 hover:bg-muted/5 transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {new Date(s.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-[9px] text-muted-foreground/50 ml-1">
                            {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground text-xs sm:text-sm truncate max-w-[160px] sm:max-w-none">
                              {getDisplayName(s.nombre_cliente)}
                            </span>
                            <span className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[160px] sm:max-w-none">
                              {s.vehiculo_info || ''}{s.vehiculo_info && s.placa ? ' · ' : ''}{s.placa || ''}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {s.costo_estimado ? (
                                <span className="text-[10px] text-primary font-semibold">${s.costo_estimado.toFixed(2)}</span>
                              ) : null}
                              {s.registrado_por && (
                                <span className="text-[9px] text-primary/80 font-bold bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                                  <User className="w-2.5 h-2.5" /> {s.registrado_por}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span className="text-muted-foreground text-xs line-clamp-2 max-w-[200px]">
                            {s.descripcion || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] uppercase font-bold bg-muted/50 text-muted-foreground border border-border/50 whitespace-nowrap">
                            {s.tipo_personalizado || STATIC_TIPO_OPTIONS.find(t => t.value === s.tipo)?.label || s.tipo || 'General'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            {PREV_ESTADOS[s.estado] && (
                              <button
                                onClick={() => updateEstado(s.id, PREV_ESTADOS[s.estado])}
                                className="p-0.5 hover:bg-muted/30 rounded transition-colors text-muted-foreground hover:text-foreground"
                                title="Estado anterior"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                            <span className={cn(
                              'px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold border whitespace-nowrap',
                              ESTADO_CONFIG[s.estado]?.bg || 'bg-muted/50 text-muted-foreground border-border/50',
                              ESTADO_CONFIG[s.estado]?.color || 'text-muted-foreground'
                            )}>
                              {ESTADO_CONFIG[s.estado]?.label || s.estado.replace('_', ' ').toUpperCase()}
                            </span>
                            {NEXT_ESTADOS[s.estado] && (
                              <button
                                onClick={() => updateEstado(s.id, NEXT_ESTADOS[s.estado])}
                                className="p-0.5 hover:bg-muted/30 rounded transition-colors text-muted-foreground hover:text-foreground"
                                title="Estado siguiente"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {can('taller', 'eliminar') && (
                            <button
                              onClick={() => deleteTrabajo(s.id)}
                              className="p-1.5 hover:bg-red-500/20 hover:text-red-500 text-muted-foreground rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          )}
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
