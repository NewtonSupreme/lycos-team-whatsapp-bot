import { createClient } from '@supabase/supabase-js';
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
  const { data, error } = await supabase
    .from('clientes')
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
  const { data, error } = await supabase.from('clientes').insert(cliente).select().single();
  if (error) throw error;
  return data;
}

export async function updateCliente(id: string, updates: Record<string, unknown>) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('clientes').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCliente(id: string) {
  if (!supabase) return null;
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}

export async function syncClientData(clientId: string, nombre: string, apellido: string, telefono: string) {
  if (!supabase) return;
  const fullName = `${nombre} ${apellido}`.trim();
  try {
    await supabase.from('citas').update({ nombre_cliente: fullName }).eq('cliente_id', clientId);
    const { data: conv } = await supabase.from('conversaciones').select('datos_cliente, memoria').eq('telefono', telefono).single();
    if (conv) {
      await supabase.from('conversaciones').update({
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
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*, clientes(nombre, apellido, telefono)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createVehiculo(vehiculo: Partial<Vehiculo>) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('vehiculos').insert(vehiculo).select().single();
  if (error) throw error;
  return data;
}

export async function updateVehiculo(id: string, updates: Partial<Vehiculo>) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vehiculos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVehiculo(id: string) {
  if (!supabase) return null;
  const { error } = await supabase.from('vehiculos').delete().eq('id', id);
  if (error) throw error;
}

// ─── Servicios ─────────────────────────────────────────────────────────────
export async function fetchServicios() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('servicios')
    .select('*, vehiculos(marca, modelo, placa, clientes(nombre, apellido))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateServicioEstado(id: string, estado: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('servicios')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Citas ─────────────────────────────────────────────────────────────────
export async function fetchCitas() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('citas')
    .select('*, cliente:clientes(nombre, apellido), vehiculo:vehiculos(marca, modelo, placa)')
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCita(cita: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('citas').insert(cita).select().single();
  if (error) throw error;
  return data;
}

export async function updateCita(id: string, updates: Record<string, any>) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('citas').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCita(id: string) {
  if (!supabase) return null;
  const { error } = await supabase.from('citas').delete().eq('id', id);
  if (error) throw error;
}

// ─── Mensajes WhatsApp ──────────────────────────────────────────────────────
export async function fetchMensajes(telefono: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('mensajes_whatsapp')
    .select('*')
    .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function checkMensajeDuplicado(wa_message_id: string) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('mensajes_whatsapp')
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
  const { data, error } = await supabase
    .from('mensajes_whatsapp').insert(mensaje).select().single();
  if (error) throw error;
  return data;
}

// ─── Conversaciones ──────────────────────────────────────────────────────────
export async function fetchConversacion(telefono: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('conversaciones')
    .select('*')
    .eq('telefono', telefono)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function fetchConversacionHistory(telefono: string, limit = 20) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('mensajes_whatsapp')
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
  const { data, error } = await supabase
    .from('conversaciones')
    .upsert(conv, { onConflict: 'telefono' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Inventario ─────────────────────────────────────────────────────────────
export async function fetchInventario(categoria?: string) {
  if (!supabase) return null;
  let query = supabase
    .from('inventario')
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
  const { data, error } = await supabase
    .from('inventario')
    .update({ stock, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventarioOrder(items: { id: string, orden: number }[]) {
  if (!supabase) return null;
  
  // Upsert can be used for batch updates if the table has a unique identifier
  const { data, error } = await supabase
    .from('inventario')
    .upsert(items, { onConflict: 'id' });
    
  if (error) throw error;
  return data;
}

export async function createInventarioItem(item: Partial<InventarioItem>) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('inventario')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventarioItem(id: string, updates: Partial<InventarioItem>) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('inventario')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInventarioItem(id: string) {
  if (!supabase) return null;
  // Soft delete by setting activo to false
  const { error } = await supabase
    .from('inventario')
    .update({ activo: false, updated_at: new Date().toISOString() })
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
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('vehiculos').select('*', { count: 'exact', head: true }),
    supabase.from('servicios').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'en_proceso']),
    supabase.from('mensajes_whatsapp').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]),
  ]);
  return { totalClientes, totalVehiculos, serviciosActivos, conversacionesHoy };
}

// ─── Ventas Silenciadores ───────────────────────────────────────────────────
export async function fetchVentasSilenciadores() {
  if (!supabase) return null;
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  
  const { data, error } = await supabase
    .from('ventas_silenciadores')
    .select('*')
    .gte('fecha', last30Days.toISOString())
    .order('fecha', { ascending: false });
  
  if (error) throw error;
  return data;
}
