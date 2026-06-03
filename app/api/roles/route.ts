import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await supabaseAdmin.from('roles').select('*').order('label');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ roles: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { nombre, label, descripcion, permisos } = await req.json();
    if (!nombre || !label) {
      return NextResponse.json({ error: 'nombre y label son requeridos' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('roles').insert({
      nombre: nombre.toLowerCase().replace(/\s+/g, '_'),
      label,
      descripcion: descripcion || '',
      permisos: permisos || {}
    }).select().single();
    if (error) {
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return NextResponse.json({ error: 'Ya existe un rol con ese nombre' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ role: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
