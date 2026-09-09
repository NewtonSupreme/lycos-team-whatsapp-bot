import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

/**
 * Los ajustes del taller: seguridad de la cuenta, política de contraseñas y
 * preferencias generales.
 *
 * Antes estos interruptores vivían solo en el estado de React: se movían, se
 * veían mover, y al recargar la página volvían a su valor por defecto. Un panel
 * de seguridad que finge recordar lo que le dijiste es peor que no tenerlo.
 *
 * Se guardan en `configuracion` como clave/valor JSON para no migrar la tabla
 * cada vez que aparece un ajuste nuevo.
 */

/** Los valores con los que arranca un taller que nunca tocó nada. */
export const AJUSTES_POR_DEFECTO = {
  seguridad: {
    dosFactores: false,
    avisoInicioSesion: true,
    bloqueoPorIntentos: true,
    intentosMaximos: 5,
    /** Minutos de inactividad antes de cerrar la sesión. */
    expiraEnMinutos: 120,
  },
  contrasenas: {
    minimoCaracteres: 8,
    exigeMayuscula: true,
    exigeMinuscula: true,
    exigeNumero: true,
    exigeEspecial: true,
    /** 0 = no caducan. */
    caducaEnDias: 0,
  },
  general: {
    nombreTaller: 'Lycos Team',
    lema: 'Taller automotriz',
    moneda: 'USD',
    zonaHoraria: 'America/Caracas',
  },
} as const;

export type Ajustes = {
  seguridad: Record<string, number | boolean>;
  contrasenas: Record<string, number | boolean>;
  general: Record<string, string>;
};

/** Las claves que se pueden guardar. Cualquier otra se ignora. */
const CLAVES = ['seguridad', 'contrasenas', 'general'] as const;

export async function GET() {
  const auth = await authorize('configuracion', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data } = await auth.db.from('configuracion').select('clave, valor, updated_at, actualizado_por');
  const guardado = new Map((data || []).map(r => [r.clave as string, r]));

  // Lo guardado se mezcla ENCIMA de los valores por defecto: así un ajuste
  // nuevo aparece con su valor sensato sin tener que tocar la base.
  const ajustes = Object.fromEntries(CLAVES.map(c => [
    c,
    { ...AJUSTES_POR_DEFECTO[c], ...(guardado.get(c)?.valor as object || {}) },
  ]));

  const ultimo = (data || [])
    .map(r => r.updated_at as string)
    .sort()
    .at(-1) || null;

  return NextResponse.json({
    ajustes,
    ultimoCambio: ultimo,
    actualizadoPor: ultimo
      ? (data || []).find(r => r.updated_at === ultimo)?.actualizado_por ?? null
      : null,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authorize('configuracion', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const guardadas: string[] = [];
  for (const clave of CLAVES) {
    const valor = body[clave];
    if (!valor || typeof valor !== 'object') continue;

    // `onConflict` sobre (clave, sede_id): un ajuste global por clave.
    const { error } = await auth.db.from('configuracion').upsert({
      clave,
      valor,
      sede_id: null,
      actualizado_por: auth.user!.nombre,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clave,sede_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    guardadas.push(clave);
  }

  if (guardadas.length === 0) {
    return NextResponse.json({ error: 'No se envió ningún ajuste válido.' }, { status: 400 });
  }

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre,
    modulo: 'configuracion',
    accion: 'Configuración actualizada',
    detalles: `Secciones: ${guardadas.join(', ')}`,
  });

  return NextResponse.json({ guardadas });
}
