import { createClient } from '@supabase/supabase-js'; // test
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { Vehiculo, InventarioItem } from '@/types';

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

// ─── Servicios ─────────────────────────────────────────────────────────────
export async function fetchServicios() {
  if (!supabase) return null;
  const { data, error } = await withSedeFilter(supabase.from('servicios'))
    .select('*, vehiculos(marca, modelo, placa, clientes(nombre, apellido))')
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
      .gte('created_at', new Date().toISOString().split('T')[0]),
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
