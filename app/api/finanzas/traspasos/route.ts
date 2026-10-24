import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authorize('ventas', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  try {
    let q = auth.db.from('traspasos_cuenta')
      .select('id, fecha, origen_id, destino_id, monto, monto_destino, tasa, motivo, registrado_por, created_at')
      .order('fecha', { ascending: false })
      .limit(200);

    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);

    const [traspasosRes, cuentasRes] = await Promise.all([
      q,
      auth.db.from('cuentas_financieras').select('id, nombre, tipo, moneda, banco, bin').eq('activo', true).order('orden'),
    ]);

    if (traspasosRes.error) throw new Error(traspasosRes.error.message);

    const ctasMap = new Map((cuentasRes.data || []).map(c => [c.id, c.nombre]));

    const traspasos = (traspasosRes.data || []).map(t => ({
      ...t,
      origen_nombre: ctasMap.get(t.origen_id) || 'Cuenta Origen',
      destino_nombre: ctasMap.get(t.destino_id) || 'Cuenta Destino',
    }));

    return NextResponse.json({
      traspasos,
      cuentas: cuentasRes.data || [],
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize('ventas', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { origen_id, destino_id, monto, monto_destino, tasa, motivo, fecha } = body;

    if (!origen_id || !destino_id) {
      return NextResponse.json({ error: 'Debes seleccionar la cuenta de origen y de destino.' }, { status: 400 });
    }
    if (origen_id === destino_id) {
      return NextResponse.json({ error: 'La cuenta de origen y destino no pueden ser la misma.' }, { status: 400 });
    }
    const numMonto = Number(monto);
    if (!numMonto || numMonto <= 0) {
      return NextResponse.json({ error: 'El monto a transferir debe ser mayor a cero.' }, { status: 400 });
    }
    const numMontoDestino = Number(monto_destino) || numMonto;
    const fechaEfectiva = fecha || new Date().toISOString().slice(0, 10);
    const usuarioNombre = auth.user?.nombre || 'Usuario';
    const sede = auth.user?.sede_id || null;

    const { data, error } = await auth.db.from('traspasos_cuenta').insert({
      origen_id,
      destino_id,
      monto: Math.round(numMonto * 100) / 100,
      monto_destino: Math.round(numMontoDestino * 100) / 100,
      tasa: tasa ? Number(tasa) : null,
      motivo: motivo || 'Traspaso entre cuentas',
      fecha: fechaEfectiva,
      registrado_por: usuarioNombre,
      sede_id: sede,
    }).select().single();

    if (error) throw new Error(error.message);

    // Obtener nombres para la bitácora
    const { data: ctas } = await auth.db.from('cuentas_financieras').select('id, nombre').in('id', [origen_id, destino_id]);
    const map = new Map((ctas || []).map(c => [c.id, c.nombre]));
    const origenNombre = map.get(origen_id) || 'Origen';
    const destinoNombre = map.get(destino_id) || 'Destino';

    await logActivityServer(auth.db, {
      usuario: usuarioNombre,
      modulo: 'Finanzas',
      accion: 'Registró traspaso entre cuentas',
      detalles: `${origenNombre} → ${destinoNombre} por ${numMonto.toFixed(2)} (${fechaEfectiva})${motivo ? ` · ${motivo}` : ''}`,
      referencia_tabla: 'traspasos_cuenta',
      referencia_id: data.id,
      sede_id: sede,
    });

    return NextResponse.json({ ok: true, traspaso: { ...data, origen_nombre: origenNombre, destino_nombre: destinoNombre } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
