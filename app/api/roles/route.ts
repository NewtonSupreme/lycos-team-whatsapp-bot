import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { PERMISOS_DEFAULT, ROLE_CATALOG } from '@/types';

export async function GET() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    let { data, error } = await supabaseAdmin.from('roles').select('*').order('label');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-sync: crea en la BD cualquier rol canónico del catálogo que falte,
    // con sus permisos por defecto. No sobreescribe roles ya existentes
    // (el admin puede haberlos personalizado desde /ajustes/permisos).
    if (data) {
      const existingNames = new Set(data.map(r => r.nombre));
      const missingRoles = ROLE_CATALOG
        .filter(meta => !existingNames.has(meta.nombre))
        .map(meta => ({
          nombre: meta.nombre,
          label: meta.label,
          descripcion: meta.descripcion,
          permisos: PERMISOS_DEFAULT[meta.nombre] || {}
        }));

      if (missingRoles.length > 0) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('roles')
          .insert(missingRoles)
          .select();

        if (!insertError && inserted) {
          data = [...data, ...inserted].sort((a, b) => a.label.localeCompare(b.label));
        }
      }

      // Sanar roles existentes agregando módulos que no existían cuando el rol se guardó en BD
      for (const r of data) {
        const defaults = PERMISOS_DEFAULT[r.nombre] || {};
        let modified = false;
        const currentPerms = typeof r.permisos === 'string' ? JSON.parse(r.permisos) : (r.permisos || {});
        
        for (const mod of Object.keys(defaults)) {
          if (currentPerms[mod] === undefined || currentPerms[mod] === null) {
            currentPerms[mod] = defaults[mod];
            modified = true;
          }
        }
        
        if (modified) {
          r.permisos = currentPerms;
          await supabaseAdmin.from('roles').update({ permisos: currentPerms }).eq('id', r.id);
        }
      }
    }

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
