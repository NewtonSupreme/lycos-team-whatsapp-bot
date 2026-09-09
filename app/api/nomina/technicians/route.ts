import { NextRequest, NextResponse } from 'next/server';
import { serverDb, getSessionUser } from '@/lib/auth-server';
import { getRoleMeta } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Lista de personal para los selectores de "técnico encargado" (POS + Nómina).
 * Accesible para cualquier usuario autenticado (sólo expone nombre/rol/sede).
 * Filtra por la sede del usuario salvo admin/dueño (multi-sede).
 */
export async function GET(req: NextRequest) {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Sin BD' }, { status: 500 });
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const url = new URL(req.url);
  const sedeParam = url.searchParams.get('sede');
  const soloTecnicos = url.searchParams.get('tecnicos') === '1';

  let q = db.from('usuarios').select('id, nombre, username, rol, sede_id, activo, especialidad, cedula, alias, foto_url, cargo, area, tipo_contrato').order('nombre');

  // No multi-sede: bloqueado a su sede. Multi-sede: filtra si se pidió una sede concreta.
  const sede = user.multiSede ? sedeParam : user.sede_id;
  if (sede) q = q.eq('sede_id', sede);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface FilaUsuario { id: string; nombre: string; rol: string; activo?: boolean | null }
  const rows = ((data || []) as FilaUsuario[]).filter(u => u.activo !== false);

  // Se marca quién es personal de taller en vez de esconder al resto: en un
  // taller real también trabajan el de almacén o quien atiende, y si no salen
  // en el selector la venta se queda sin encargado —que es justo lo que pasaba.
  const conBandera = rows.map(u => ({ ...u, es_tecnico: !!getRoleMeta(u.rol)?.esTecnico }));

  const finales = soloTecnicos ? conBandera.filter(u => u.es_tecnico) : conBandera;

  return NextResponse.json({ technicians: finales });
}
