import { createClient } from '@supabase/supabase-js';

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
    .select('*')
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
    .select('*, clientes(nombre, apellido), vehiculos(marca, modelo, placa)')
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data;
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
  
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is code for 'no rows found'
  return data;
}

export async function upsertConversacion(conv: {
  telefono: string;
  ultimo_mensaje?: string;
  ultimo_mensaje_at?: string;
  estado?: 'activa' | 'cerrada' | 'bot' | 'humano';
  mensajes_sin_leer?: number;
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
