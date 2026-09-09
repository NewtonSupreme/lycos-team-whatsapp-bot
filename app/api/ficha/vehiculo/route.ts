import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { buildFichaVehiculo } from '@/lib/ficha/vehiculo';

export const dynamic = 'force-dynamic';

/**
 * Ficha económica de un vehículo.
 * Query: ?placa=AB123CD | ?vehiculo=<id> [&desde&hasta&sede]
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('vehiculos', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const placa = url.searchParams.get('placa');
  const vehiculoId = url.searchParams.get('vehiculo');
  if (!placa && !vehiculoId) {
    return NextResponse.json({ error: 'Indica una placa o un vehículo.' }, { status: 400 });
  }

  try {
    const ficha = await buildFichaVehiculo(auth.db, {
      placa,
      vehiculoId,
      sedeId: auth.effectiveSede(url.searchParams.get('sede')),
      desde: url.searchParams.get('desde'),
      hasta: url.searchParams.get('hasta'),
    });
    return NextResponse.json(ficha);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'No se pudo armar la ficha';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
