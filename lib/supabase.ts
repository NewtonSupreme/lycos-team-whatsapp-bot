import { createClient } from '@supabase/supabase-js'; // test
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { Vehiculo, InventarioItem } from '@/types';
import { getLocalISODate } from '@/lib/utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => !!supabaseUrl && !!supabaseAnonKey;

// ─── Clientes ──────────────────────────────────────────────────────────────
export async function fetchClientes() {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('clientes'))
    .select('*, vehiculos(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCliente(cliente: {
  nombre: string; apellido: string; email: string;
  telefono: string; cedula?: string; direccion?: string; notas?: string;
}) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('clientes')).insert(withSedeInsert(cliente)).select().single();
  if (error) throw error;
  return data;
}

export async function updateCliente(id: string, updates: Record<string, unknown>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('clientes')).update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCliente(id: string) {
  if (!supabase) return null;
  const { error } = await withSedeFilter(supabase.from('clientes')).delete().eq('id', id);
  if (error) throw error;
}

export async function syncClientData(clientId: string, nombre: string, apellido: string, telefono: string) {
  if (!supabase) return;
  const fullName = `${nombre} ${apellido}`.trim();
  try {
    await withSedeFilter(supabase.from('citas')).update({ nombre_cliente: fullName }).eq('cliente_id', clientId);
    await withSedeFilter(supabase.from('servicios')).update({ nombre_cliente: fullName }).eq('cliente_id', clientId);
    const { data: conv } = await withSedeFilter(supabase.from('conversaciones')).select('datos_cliente, memoria').eq('telefono', telefono).single();
    if (conv) {
      await withSedeFilter(supabase.from('conversaciones')).update({
        datos_cliente: { ...(conv.datos_cliente || {}), nombre: fullName },
        memoria: { ...(conv.memoria || {}), nombre: fullName }
      }).eq('telefono', telefono);
    }
  } catch (e) {
    console.error('Error in syncClientData:', e);
  }
}

// ─── Vehículos ─────────────────────────────────────────────────────────────
export async function fetchVehiculos() {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('vehiculos'))
    .select('*, clientes(nombre, apellido, telefono)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createVehiculo(vehiculo: Partial<Vehiculo>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('vehiculos')).insert(withSedeInsert(vehiculo)).select().single();
  if (error) throw error;
  return data;
}

export async function updateVehiculo(id: string, updates: Partial<Vehiculo>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('vehiculos'))
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVehiculo(id: string) {
  if (!supabase) return null;
  const { error } = await withSedeFilter(supabase.from('vehiculos')).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Transfiere un vehículo de su dueño actual a otro cliente.
 * - Cambia el dueño (cliente_id) del vehículo y su sede para que siga al nuevo dueño.
 * - Reasigna los servicios y citas de ESE vehículo al nuevo cliente (cliente_id,
 *   nombre y teléfono) para que el historial se refleje bajo el nuevo dueño en todos lados.
 *   NO altera la sede de servicios/citas: eso preserva los reportes históricos por sede.
 * - Es una transferencia real (UPDATE), nunca crea un vehículo nuevo → no genera duplicados.
 * - Valida que no sea el mismo dueño y que el destino no tenga ya esa placa (anti-duplicado).
 * Opera por IDs explícitos (sin filtro de sede) para soportar transferencias entre sedes.
 */
export async function transferVehiculo(
  vehiculoId: string,
  newClienteId: string,
  opts?: { usuario?: string }
): Promise<{
  vehiculo: { id: string; marca: string; modelo: string; placa: string };
  oldClient: { nombre: string; apellido: string } | null;
  newClient: { id: string; nombre: string; apellido: string };
  serviciosMovidos: number;
  citasMovidas: number;
}> {
  if (!supabase) throw new Error('Supabase no está configurado.');
  if (!vehiculoId || !newClienteId) throw new Error('Faltan datos para la transferencia.');

  // 1. Vehículo actual (por id, sin filtro de sede)
  const { data: veh, error: vErr } = await supabase
    .from('vehiculos')
    .select('id, cliente_id, placa, marca, modelo, anio, sede_id')
    .eq('id', vehiculoId)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!veh) throw new Error('El vehículo no existe.');
  if (veh.cliente_id === newClienteId) throw new Error('El vehículo ya pertenece a este cliente.');

  // 2. Cliente destino
  const { data: newClient, error: cErr } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, telefono, sede_id')
    .eq('id', newClienteId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!newClient) throw new Error('El cliente destino no existe.');

  // 3. Anti-duplicado: el destino no debe tener ya OTRO vehículo con la misma placa
  const placaClean = (veh.placa || '').replace(/[-\s]/g, '').toUpperCase();
  if (placaClean) {
    const { data: existing } = await supabase
      .from('vehiculos')
      .select('id, placa')
      .eq('cliente_id', newClienteId)
      .neq('id', vehiculoId);
    const conflict = (existing || []).find(
      d => (d.placa || '').replace(/[-\s]/g, '').toUpperCase() === placaClean
    );
    if (conflict) throw new Error('El cliente destino ya tiene un vehículo con esa placa.');
  }

  // 4. Dueño anterior (para el registro de actividad)
  let oldClient: { nombre: string; apellido: string } | null = null;
  if (veh.cliente_id) {
    const { data } = await supabase.from('clientes').select('nombre, apellido').eq('id', veh.cliente_id).maybeSingle();
    oldClient = data || null;
  }

  // 5. Transferir el vehículo: nuevo dueño + sede del nuevo dueño
  const newSede = newClient.sede_id || veh.sede_id || null;
  const { error: upErr } = await supabase
    .from('vehiculos')
    .update({ cliente_id: newClienteId, sede_id: newSede, updated_at: new Date().toISOString() })
    .eq('id', vehiculoId);
  if (upErr) throw upErr;

  // 6. Reasignar servicios y citas del vehículo al nuevo dueño (sin tocar su sede histórica)
  const fullName = `${newClient.nombre} ${newClient.apellido}`.trim();
  const newTel = newClient.telefono || null;
  const { data: servData } = await supabase
    .from('servicios')
    .update({ cliente_id: newClienteId, nombre_cliente: fullName, telefono: newTel })
    .eq('vehiculo_id', vehiculoId)
    .select('id');
  const { data: citaData } = await supabase
    .from('citas')
    .update({ cliente_id: newClienteId, nombre_cliente: fullName, telefono: newTel })
    .eq('vehiculo_id', vehiculoId)
    .select('id');

  const serviciosMovidos = servData?.length || 0;
  const citasMovidas = citaData?.length || 0;

  // 7. Log de actividad (no crítico)
  try {
    const { logActivity } = await import('@/lib/activity');
    await logActivity({
      usuario: opts?.usuario || 'Sistema',
      modulo: 'vehiculos',
      accion: 'Transfirió vehículo',
      detalles: `${veh.marca} ${veh.modelo} (${veh.placa}) de ${oldClient ? `${oldClient.nombre} ${oldClient.apellido}` : 'sin dueño'} → ${fullName}. ${serviciosMovidos} servicio(s) y ${citasMovidas} cita(s) reasignados.`,
      referencia_id: vehiculoId,
      referencia_tabla: 'vehiculos',
    });
  } catch { /* log no crítico */ }

  return {
    vehiculo: { id: veh.id, marca: veh.marca, modelo: veh.modelo, placa: veh.placa },
    oldClient,
    newClient: { id: newClient.id, nombre: newClient.nombre, apellido: newClient.apellido },
    serviciosMovidos,
    citasMovidas,
  };
}

// ─── Servicios ─────────────────────────────────────────────────────────────
export async function fetchServicios() {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('servicios'))
    .select('*, registrado_por, vehiculos(marca, modelo, placa, clientes(nombre, apellido))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateServicioEstado(id: string, estado: string) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('servicios'))
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/**
 * Sincroniza automáticamente una orden de servicio completada hacia la tabla de ventas contables (ventas_dia).
 * Previene pérdidas o desajustes contables sin importar desde qué módulo (Taller, Servicios o Edición) se complete el trabajo.
 */
export async function autoRegisterSaleFromService(
  service: any,
  opts?: { userName?: string; bcvRate?: number; customDate?: string }
) {
  if (!supabase || !service) return null;
  const precio = Number(service.costo_final ?? service.costo_estimado ?? 0);
  if (precio <= 0) return null; // No generar ventas con costo 0

  const id = service.id;
  const clienteNombre = service.nombre_cliente || 'Consumidor Final';
  const vehiculoStr = service.vehiculo_info || service.placa || 'Vehículo de Taller';
  const sedeId = service.sede_id;
  if (!sedeId) return null;

  const refTag = `[ServicioID: ${id}]`;
  const descStr = service.descripcion || service.tipo || 'Servicio de taller';

  let desglose = service.items;
  if (!desglose || !Array.isArray(desglose) || desglose.length === 0) {
    const { parseDescripcionItems } = await import('@/lib/utils');
    desglose = parseDescripcionItems(descStr, precio);
  }

  const { data: existingVD } = await supabase.from('ventas_dia')
    .select('id, metodos_pago, tasa_cambio, categoria').like('notas', `%${refTag}%`).limit(1).maybeSingle();

  // ── El cobro real de la orden ────────────────────────────────────────────
  //
  // Esto antes escribía `{ divisas: precio }` a secas, así que TODA venta de
  // servicio quedaba registrada como efectivo en dólares aunque se hubiera
  // cobrado por Banesco, punto de venta o Cashea. Peor: al editar una orden ya
  // completada, este escritor pisaba el desglose por banco que había capturado
  // el modal de cobro. El dinero seguía ahí, pero en la cuenta equivocada.
  //
  // El orden de preferencia es: lo que trae la orden → lo que ya tenía la venta
  // registrada → y solo si no hay ninguna de las dos, efectivo en divisas.
  const { normalizeMetodo, buildPagoColumns, buildCategoriaColumns, inferirCategoria } =
    await import('@/lib/categorias');

  const deLaOrden = (service.metodos_pago && typeof service.metodos_pago === 'object')
    ? Object.entries(service.metodos_pago as Record<string, unknown>)
      .filter(([, v]) => Number(v) > 0)
    : [];
  const yaRegistrado = (existingVD?.metodos_pago && typeof existingVD.metodos_pago === 'object')
    ? Object.entries(existingVD.metodos_pago as Record<string, unknown>)
      .filter(([, v]) => Number(v) > 0)
    : [];

  const fuente = deLaOrden.length > 0 ? deLaOrden : yaRegistrado;
  const metodos: Record<string, number> = fuente.length > 0
    ? Object.fromEntries(fuente.map(([k, v]) => [normalizeMetodo(k), Number(v)]))
    : { efectivo_usd: precio };

  // Etiqueta honesta para la nota: antes decía «(Divisas)» siempre.
  const comoSePago = fuente.length > 0
    ? Object.keys(metodos).map(k => k.replace(/_/g, ' ')).join(' + ')
    : 'efectivo $';
  const notesFinal = `${descStr} [Total: $${precio} (${comoSePago})] `
    + `| Cliente: ${clienteNombre} | Vehículo: ${vehiculoStr} ${refTag}`.trim();

  // La tasa NUNCA se inventa. El 518 fijo que había aquí llevaba meses obsoleto
  // —hoy el BCV va por 814— y convertía mal todo lo cobrado en bolívares.
  const tasa = Number(opts?.bcvRate) || Number(service.tasa_cambio)
    || Number(existingVD?.tasa_cambio) || 0;

  // Clasificación del servicio: sin esto la venta no cae en ninguna columna de
  // departamento y desaparece del reporte por área.
  const categoria = service.categoria
    || existingVD?.categoria
    || inferirCategoria(descStr || service.tipo_personalizado || service.tipo);

  const vdData = {
    fecha: opts?.customDate || (service.fecha ? service.fecha.split('T')[0] : getLocalISODate()),
    cliente: clienteNombre,
    // Identidad real, no solo un nombre suelto en una nota de texto.
    cliente_id: service.cliente_id || null,
    vehiculo_id: service.vehiculo_id || null,
    servicio_id: id,
    placa: service.placa || service.vehiculos?.placa || null,
    vehiculo_info: vehiculoStr || null,
    categoria,
    ...buildCategoriaColumns(categoria, precio),
    total_ingresos: precio,
    total_servicios: 1,
    total_clientes: 1,
    desglose,
    metodos_pago: metodos,
    ...buildPagoColumns(metodos),
    tasa_cambio: tasa,
    con_iva: !!service.con_iva,
    notas: notesFinal,
    creado_por: opts?.userName || service.registrado_por || 'Admin',
    sede_id: sedeId,
    fecha_registro: new Date().toISOString(),
    registro_atrasado: false,
    estado: 'pagado',
  };

  if (existingVD) {
    const { data: upd, error } = await supabase.from('ventas_dia').update(vdData).eq('id', existingVD.id).select().single();
    if (error) console.error('Error actualizando venta_dia:', error);
    return upd;
  } else {
    const { data: ins, error } = await supabase.from('ventas_dia').insert(vdData).select().single();
    if (error) console.error('Error insertando venta_dia:', error);
    return ins;
  }
}

// ─── Citas ─────────────────────────────────────────────────────────────────
export async function fetchCitas() {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('citas'))
    .select('*, cliente:clientes(nombre, apellido), vehiculo:vehiculos(marca, modelo, placa)')
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCita(cita: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('citas')).insert(withSedeInsert(cita)).select().single();
  if (error) throw error;
  return data;
}

export async function updateCita(id: string, updates: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('citas')).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCita(id: string) {
  if (!supabase) return null;
  const { error } = await withSedeFilter(supabase.from('citas')).delete().eq('id', id);
  if (error) throw error;
}

// ─── Mensajes WhatsApp ──────────────────────────────────────────────────────
export async function fetchMensajes(telefono: string) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('mensajes_whatsapp'))
    .select('*')
    .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function checkMensajeDuplicado(wa_message_id: string) {
  if (!supabase) return false;
  const { data, error } = await withSedeFilter(supabase.from('mensajes_whatsapp'))
    .select('id')
    .eq('wa_message_id', wa_message_id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

export async function saveMensaje(mensaje: {
  from_number: string; to_number: string; body: string;
  tipo: 'entrante' | 'saliente'; es_ia?: boolean;
  wa_message_id?: string; cliente_id?: string;
}) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('mensajes_whatsapp')).insert(withSedeInsert(mensaje)).select().single();
  if (error) throw error;
  return data;
}

// ─── Conversaciones ──────────────────────────────────────────────────────────
export async function fetchConversacion(telefono: string) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('conversaciones'))
    .select('*')
    .eq('telefono', telefono)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function fetchConversacionHistory(telefono: string, limit = 20) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('mensajes_whatsapp'))
    .select('*')
    .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function upsertConversacion(conv: {
  telefono: string;
  ultimo_mensaje?: string;
  ultimo_mensaje_at?: string;
  estado?: 'activa' | 'cerrada' | 'bot' | 'humano';
  mensajes_sin_leer?: number;
  datos_cliente?: Record<string, string>;
}) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('conversaciones'))
    .upsert(withSedeInsert(conv), { onConflict: 'telefono' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Inventario ─────────────────────────────────────────────────────────────
export async function fetchInventario(categoria?: string) {
  if (!supabase) return null;
  let query = withSedeFilter(supabase.from('inventario'))
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (categoria) query = query.eq('categoria', categoria);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateInventarioStock(id: string, stock: number) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('inventario')
    .update({ stock, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventarioOrder(items: { id: string, orden: number }[]) {
  if (!supabase) return null;
  
  // Use RPC to avoid NOT NULL constraint issues with upsert
  const { data, error } = await supabase
    .rpc('reorder_inventario', { updates: items });
    
  if (error) throw error;
  return data;
}

export async function createInventarioItem(item: Partial<InventarioItem>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('inventario'))
    .insert(withSedeInsert(item))
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventarioItem(id: string, updates: Partial<InventarioItem>) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('inventario')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInventarioItem(id: string, eliminadoPor?: string, motivo?: string) {
  if (!supabase) return null;
  
  // 1. Obtener el producto antes de eliminarlo
  const { data: producto } = await supabase.from('inventario')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!producto) {
    throw new Error('Producto no encontrado');
  }

  // 2. Copiar a la papelera
  const papeleraData = {
    nombre: producto.nombre,
    codigo: producto.codigo,
    categoria: producto.categoria,
    marca: producto.marca,
    descripcion: producto.descripcion,
    precio_usd: producto.precio_usd,
    precio_bs: producto.precio_bs,
    stock: producto.stock,
    stock_minimo: producto.stock_minimo,
    unidad: producto.unidad,
    notas: producto.notas,
    ubicacion: producto.ubicacion,
    clasificacion: producto.clasificacion,
    orden: producto.orden,
    eliminado_por: eliminadoPor || 'Sistema',
    motivo_eliminacion: motivo || null,
    fecha_eliminacion: new Date().toISOString(),
    sede_id: producto.sede_id
  };

  const { error: errorPapelera } = await supabase
    .from('inventario_papelera')
    .insert(papeleraData);

  if (errorPapelera) {
    console.error('Error guardando en papelera:', errorPapelera);
  }

  // 3. Eliminar completamente de la tabla inventario
  const { error } = await supabase.from('inventario')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Inventario Papelera ───────────────────────────────────────
export async function fetchInventarioPapelera() {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('inventario_papelera'))
    .select('*')
    .order('fecha_eliminacion', { ascending: false });
  if (error) throw error;
  return data;
}

export async function restaurarInventarioItem(id: string) {
  if (!supabase) return null;
  
  // 1. Obtener el producto de la papelera
  const { data: papeleraItem } = await supabase.from('inventario_papelera')
    .select('*')
    .eq('id', id)
    .single();

  if (!papeleraItem) {
    throw new Error('Producto en papelera no encontrado');
  }

  // 2. Restaurar a inventario (crear nuevo o actualizar existente)
  const inventarioData = {
    nombre: papeleraItem.nombre,
    codigo: papeleraItem.codigo,
    categoria: papeleraItem.categoria,
    marca: papeleraItem.marca,
    descripcion: papeleraItem.descripcion,
    precio_usd: papeleraItem.precio_usd,
    precio_bs: papeleraItem.precio_bs,
    stock: papeleraItem.stock,
    stock_minimo: papeleraItem.stock_minimo,
    unidad: papeleraItem.unidad,
    notas: papeleraItem.notas,
    ubicacion: papeleraItem.ubicacion,
    clasificacion: papeleraItem.clasificacion,
    orden: papeleraItem.orden,
    activo: true
  };

  const { error: errorInsert } = await supabase
    .from('inventario')
    .insert(inventarioData);

  if (errorInsert) throw errorInsert;

  // 3. Eliminar de la papelera
  const { error: errorDelete } = await supabase.from('inventario_papelera')
    .delete()
    .eq('id', id);

  if (errorDelete) throw errorDelete;
}

export async function eliminarPermanentePapelera(id: string) {
  if (!supabase) return null;
  const { error } = await supabase.from('inventario_papelera')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────
export async function fetchDashboardStats() {
  if (!supabase) return null;
  const [
    { count: totalClientes },
    { count: totalVehiculos },
    { count: serviciosActivos },
    { count: conversacionesHoy },
  ] = await Promise.all([
    withSedeFilter(supabase.from('clientes')).select('*', { count: 'exact', head: true }),
    withSedeFilter(supabase.from('vehiculos')).select('*', { count: 'exact', head: true }),
    withSedeFilter(supabase.from('servicios')).select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'en_proceso']),
    withSedeFilter(supabase.from('mensajes_whatsapp')).select('*', { count: 'exact', head: true })
      .gte('created_at', getLocalISODate()),
  ]);
  return { totalClientes, totalVehiculos, serviciosActivos, conversacionesHoy };
}

// ─── Ventas Silenciadores ───────────────────────────────────────────────────
export async function fetchVentasSilenciadores() {
  if (!supabase) return null;
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  
  const { data, error } = await withSedeFilter(supabase.from('ventas_silenciadores'))
    .select('*')
    .gte('fecha', last30Days.toISOString())
    .order('fecha', { ascending: false });
  
  if (error) throw error;
  return data;
}

// ─── Distribuciones ─────────────────────────────────────────────────────────

/**
 * Genera el siguiente número correlativo de nota de distribución
 * en formato ND-YYYY-XXXX
 */
export async function generateNumeroNota(): Promise<string> {
  if (!supabase) {
    const anio = new Date().getFullYear();
    return `ND-${anio}-${String(Date.now()).slice(-4)}`;
  }
  try {
    const { data, error } = await supabase.rpc('generar_numero_nota_distribucion');
    if (error || !data) {
      // Fallback: count existing + 1
      const anio = new Date().getFullYear();
      const { count } = await supabase
        .from('distribuciones')
        .select('*', { count: 'exact', head: true });
      const correlativo = ((count || 0) + 1);
      return `ND-${anio}-${String(correlativo).padStart(4, '0')}`;
    }
    return data as string;
  } catch {
    const anio = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `ND-${anio}-${rand}`;
  }
}

/**
 * Crea una distribución y descuenta el stock de cada producto en el inventario.
 * Operación atómica: si falla el descuento de stock, lanza error.
 */
export async function createDistribucion(payload: {
  numero_nota: string;
  fecha: string;
  sede_origen_id?: string | null;
  sede_origen_nombre: string;
  sede_destino_id?: string | null;
  sede_destino_nombre: string;
  responsable: string;
  recibe?: string | null;
  observaciones?: string | null;
  items: Array<{
    inventario_id: string;
    nombre: string;
    codigo?: string | null;
    categoria: string;
    marca?: string | null;
    cantidad: number;
    stock_antes: number;
    stock_despues: number;
    precio_usd: number;
    precio_fabricante?: number;
    unidad: string;
  }>;
  total_items: number;
  total_unidades: number;
  valor_total_usd: number;
  sede_id?: string | null;
}) {
  if (!supabase) return null;

  // 1. Descontar stock de origen y cargar stock en destino
  for (const item of payload.items) {
    // A. Descontar stock en el origen (Carrizal)
    const { error: stockError } = await supabase
      .from('inventario')
      .update({
        stock: item.stock_despues,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.inventario_id);

    if (stockError) {
      throw new Error(`Error al descontar stock de "${item.nombre}": ${stockError.message}`);
    }

    // B. Cargar stock en el destino
    if (payload.sede_destino_id) {
      // Buscar si el producto ya existe en la sede de destino
      const { data: destItems, error: searchErr } = await supabase
        .from('inventario')
        .select('id, stock')
        .eq('nombre', item.nombre)
        .eq('sede_id', payload.sede_destino_id);

      if (searchErr) {
        throw new Error(`Error al buscar producto en destino: ${searchErr.message}`);
      }

      if (destItems && destItems.length > 0) {
        // Existe -> Sumar cantidad
        const destItem = destItems[0];
        const { error: updateDestErr } = await supabase
          .from('inventario')
          .update({
            stock: destItem.stock + item.cantidad,
            updated_at: new Date().toISOString(),
          })
          .eq('id', destItem.id);
          
        if (updateDestErr) throw new Error(`Error al actualizar stock en destino: ${updateDestErr.message}`);
      } else {
        // No existe -> Clonar el producto original pero con el stock enviado y sede_id destino
        const { data: origItem } = await supabase
          .from('inventario')
          .select('*')
          .eq('id', item.inventario_id)
          .single();

        if (origItem) {
          const { id, created_at, updated_at, ...itemData } = origItem;
          const { error: insertDestErr } = await supabase
            .from('inventario')
            .insert({
              ...itemData,
              stock: item.cantidad,
              sede_id: payload.sede_destino_id
            });
            
          if (insertDestErr) throw new Error(`Error al crear producto en destino: ${insertDestErr.message}`);
        }
      }
    }
  }

  // 2. Registrar la distribución
  const insertPayload = {
    ...payload,
    estado: 'completado',
  };

  const { data, error } = await supabase
    .from('distribuciones')
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Obtiene lista de distribuciones — filtrada por sede si aplica
 */
export async function fetchDistribuciones(limit = 100) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('distribuciones'))
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Actualiza el estado de una distribución
 */
// ─── Presupuestos ──────────────────────────────────────────────────────────
export async function fetchPresupuestos(limit = 50) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('presupuestos'))
    .select('*, cliente:clientes(nombre, apellido, telefono), vehiculo:vehiculos(marca, modelo, placa)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchPresupuesto(id: string) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('presupuestos'))
    .select('*, cliente:clientes(nombre, apellido, telefono), vehiculo:vehiculos(marca, modelo, placa)')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function generateNumeroPresupuesto(): Promise<string> {
  if (!supabase) {
    const anio = new Date().getFullYear();
    return `PRE-${anio}-${String(Date.now()).slice(-4)}`;
  }
  try {
    const { data, error } = await supabase.rpc('generar_numero_presupuesto');
    if (error || !data) {
      const anio = new Date().getFullYear();
      const { count } = await supabase
        .from('presupuestos')
        .select('*', { count: 'exact', head: true });
      const correlativo = ((count || 0) + 1);
      return `PRE-${anio}-${String(correlativo).padStart(4, '0')}`;
    }
    return data as string;
  } catch {
    const anio = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `PRE-${anio}-${rand}`;
  }
}

export async function createPresupuesto(presupuesto: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('presupuestos'))
    .insert(withSedeInsert(presupuesto))
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePresupuesto(id: string, updates: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('presupuestos'))
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePresupuesto(id: string) {
  if (!supabase) return null;
  const { error } = await withSedeFilter(supabase.from('presupuestos'))
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function updatePresupuestoEstado(id: string, estado: string) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('presupuestos'))
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDistribucionEstado(
  id: string,
  estado: 'pendiente' | 'en_transito' | 'completado' | 'anulado'
) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('distribuciones')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Ganancias (Fabricante → Distribuidor → Reventa) ────────────────────────

/**
 * Trae TODAS las distribuciones con origen Carrizal (sede principal), SIN filtro de sede,
 * para que el dueño pueda ver las ganancias desde San Antonio.
 * Uso restringido a admin/dueño (el gating se hace en la UI).
 */
export async function fetchGananciasDistribuciones(limit = 300) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('distribuciones')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Genera el siguiente número de nota de ganancia en formato NG-YYYY-XXXX
 */
export async function generateNumeroNotaGanancia(): Promise<string> {
  if (!supabase) {
    const anio = new Date().getFullYear();
    return `NG-${anio}-${String(Date.now()).slice(-4)}`;
  }
  try {
    const { data, error } = await supabase.rpc('generar_numero_nota_ganancia');
    if (error || !data) {
      const anio = new Date().getFullYear();
      const { count } = await supabase
        .from('notas_ganancia')
        .select('*', { count: 'exact', head: true });
      const correlativo = ((count || 0) + 1);
      return `NG-${anio}-${String(correlativo).padStart(4, '0')}`;
    }
    return data as string;
  } catch {
    const anio = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `NG-${anio}-${rand}`;
  }
}

/**
 * Crea una nota de ganancia manual.
 */
export async function createNotaGanancia(nota: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('notas_ganancia'))
    .insert(withSedeInsert(nota))
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lista las notas de ganancia manuales. SIN filtro de sede para que el dueño las vea
 * desde San Antonio (el gating se hace en la UI).
 */
export async function fetchNotasGanancia(limit = 300) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('notas_ganancia')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function deleteNotaGanancia(id: string) {
  if (!supabase) return null;
  const { error } = await supabase.from('notas_ganancia').delete().eq('id', id);
  if (error) throw error;
}

// ─── Facturas (Sistema Centralizado) ────────────────────────────────────────

/**
 * Genera el siguiente número correlativo de factura
 * en formato FAC-YYYY-XXXX
 */
export async function generateCorrelativoFactura(): Promise<string> {
  if (!supabase) {
    const anio = new Date().getFullYear();
    return `FAC-${anio}-${String(Date.now()).slice(-4)}`;
  }
  try {
    const { data, error } = await supabase.rpc('generar_correlativo_factura');
    if (error || !data) {
      // Fallback: count existing + 1
      const anio = new Date().getFullYear();
      const { count } = await supabase
        .from('facturas')
        .select('*', { count: 'exact', head: true })
        .like('correlativo', `FAC-${anio}-%`);
      const correlativo = ((count || 0) + 1);
      return `FAC-${anio}-${String(correlativo).padStart(4, '0')}`;
    }
    return data as string;
  } catch {
    const anio = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `FAC-${anio}-${rand}`;
  }
}

/**
 * Registra una factura en la tabla centralizada con correlativo auto-generado
 */
export async function registrarFactura(factura: {
  tipo: 'venta' | 'servicio' | 'nota_entrega' | 'presupuesto' | 'egreso' | 'cierre' | 'nota_ganancia';
  modulo_origen: 'ventas_pos' | 'silenciadores' | 'servicios' | 'reportes' | 'presupuestos' | 'distribuidor' | 'bot' | 'ganancias';
  referencia_id?: string;
  referencia_tabla?: string;
  cliente: string;
  vehiculo?: string;
  total: number;
  moneda?: string;
  tasa_cambio?: number;
  total_bs?: number;
  items?: any[];
  metodos_pago?: any;
  con_iva?: boolean;
  estado?: 'pagado' | 'pendiente' | 'anulado';
  notas?: string;
  emitido_por?: string;
  fecha_emision?: string;
  sede_id?: string | null;
  comprobante_url?: string;
  comprobante_referencia?: string;
}) {
  if (!supabase) return null;

  // Guard against duplicate facturas for the same referencia_id
  if (factura.referencia_id) {
    const { data: existing } = await supabase
      .from('facturas')
      .select('id, correlativo')
      .eq('referencia_id', factura.referencia_id)
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
  }

  const correlativo = await generateCorrelativoFactura();

  const insertData = {
    correlativo,
    tipo: factura.tipo,
    modulo_origen: factura.modulo_origen,
    referencia_id: factura.referencia_id || null,
    referencia_tabla: factura.referencia_tabla || null,
    cliente: factura.cliente || 'Consumidor Final',
    vehiculo: factura.vehiculo || null,
    total: factura.total,
    moneda: factura.moneda || 'USD',
    tasa_cambio: factura.tasa_cambio || null,
    total_bs: factura.total_bs || null,
    items: factura.items || [],
    metodos_pago: factura.metodos_pago || null,
    con_iva: factura.con_iva || false,
    estado: factura.estado || 'pagado',
    notas: factura.notas || null,
    emitido_por: factura.emitido_por || 'Admin',
    fecha_emision: factura.fecha_emision || getLocalISODate(),
    sede_id: factura.sede_id || null,
    comprobante_url: factura.comprobante_url || null,
    comprobante_referencia: factura.comprobante_referencia || null,
  };

  let { data, error } = await supabase
    .from('facturas')
    .insert(insertData)
    .select()
    .single();

  // Auto-recuperación: si las columnas de comprobante aún no existen (migración
  // no aplicada), reintenta sin ellas para no romper el registro de la factura.
  if (error && (error.code === 'PGRST204' || /comprobante/i.test(`${error.message || ''} ${(error as any).details || ''}`))) {
    const fallback: any = { ...insertData };
    delete fallback.comprobante_url;
    delete fallback.comprobante_referencia;
    ({ data, error } = await supabase.from('facturas').insert(fallback).select().single());
  }

  if (error) {
    console.error('Error registrando factura:', error);
    throw error;
  }
  return data;
}

export interface FiltrosFactura {
  correlativo?: string;
  tipo?: string;
  modulo_origen?: string;
  cliente?: string;
  estado?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  monto_min?: number;
  monto_max?: number;
  sede_id?: string;
  busqueda?: string;
  limit?: number;
  offset?: number;
}

/**
 * Consulta facturas con filtros dinámicos
 */
export async function fetchFacturas(filtros: FiltrosFactura = {}) {
  if (!supabase) return { data: [], count: 0 };

  let query = supabase
    .from('facturas')
    .select('*', { count: 'exact' });

  // Filtro por sede
  if (filtros.sede_id) {
    query = query.eq('sede_id', filtros.sede_id);
  }

  // Filtro por correlativo (búsqueda parcial)
  if (filtros.correlativo) {
    query = query.ilike('correlativo', `%${filtros.correlativo}%`);
  }

  // Filtro por tipo
  if (filtros.tipo) {
    query = query.eq('tipo', filtros.tipo);
  }

  // Filtro por módulo origen
  if (filtros.modulo_origen) {
    query = query.eq('modulo_origen', filtros.modulo_origen);
  }

  // Filtro por cliente (búsqueda parcial)
  if (filtros.cliente) {
    query = query.ilike('cliente', `%${filtros.cliente}%`);
  }

  // Filtro por estado
  if (filtros.estado) {
    query = query.eq('estado', filtros.estado);
  }

  // Filtro por rango de fecha
  if (filtros.fecha_desde) {
    query = query.gte('fecha_emision', filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    query = query.lte('fecha_emision', filtros.fecha_hasta);
  }

  // Filtro por rango de monto
  if (filtros.monto_min !== undefined) {
    query = query.gte('total', filtros.monto_min);
  }
  if (filtros.monto_max !== undefined) {
    query = query.lte('total', filtros.monto_max);
  }

  // Búsqueda general (correlativo, cliente, notas)
  if (filtros.busqueda) {
    query = query.or(
      `correlativo.ilike.%${filtros.busqueda}%,cliente.ilike.%${filtros.busqueda}%,notas.ilike.%${filtros.busqueda}%`
    );
  }

  // Ordenar por fecha más reciente
  query = query.order('created_at', { ascending: false });

  // Paginación
  const limit = filtros.limit || 50;
  const offset = filtros.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    if (error.code === '42P01' || error.message?.includes('Could not find the table')) {
      console.warn('La tabla facturas no existe aún. Debes ejecutar la migración 003_facturas.sql');
      return { data: [], count: 0, missingTable: true };
    }
    console.error('Error fetching facturas Details:', error.message, error.details, error.hint, error);
    throw error;
  }

  return { data: data || [], count: count || 0, missingTable: false };
}

/**
 * Anula una factura (marca como anulado)
 */
export async function anularFactura(id: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('facturas')
    .update({ estado: 'anulado', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
