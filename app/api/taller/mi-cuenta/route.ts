import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { verificarCodigo } from '@/lib/taller/codigos';
import { cuentaDelTrabajador } from '@/lib/taller/cuenta';

export const dynamic = 'force-dynamic';

/**
 * «Mi cuenta» en la pantalla del taller: el trabajador se elige y pone su
 * código; si es el suyo, ve lo que cargó y lo que se cobró. Sin el código no
 * sale ningún monto.
 *   Body: { empleado_id, codigo }
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('taller', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const b = await req.json().catch(() => ({}));
  const empleadoId = String(b.empleado_id || '');
  const codigo = String(b.codigo || '').replace(/\D/g, '');
  if (!empleadoId || codigo.length !== 4) return NextResponse.json({ error: 'Escribe tus 4 números.' }, { status: 400 });

  const r = await verificarCodigo(auth.db, empleadoId, codigo);
  if (!r.ok) {
    const error = r.motivo === 'sin_codigo' ? 'Todavía no tienes carnet. Pídeselo a la oficina.'
      : r.motivo === 'bloqueado' ? `Demasiados intentos. Espera ${r.minutos} min.`
      : `Código incorrecto. Te quedan ${r.quedan} intento${r.quedan === 1 ? '' : 's'}.`;
    return NextResponse.json({ error, motivo: r.motivo }, { status: r.motivo === 'sin_codigo' ? 404 : 401 });
  }

  const cuenta = await cuentaDelTrabajador(auth.db, empleadoId);
  if (!cuenta) return NextResponse.json({ error: 'No encontramos a esa persona.' }, { status: 404 });
  return NextResponse.json(cuenta, { headers: { 'Cache-Control': 'no-store' } });
}
