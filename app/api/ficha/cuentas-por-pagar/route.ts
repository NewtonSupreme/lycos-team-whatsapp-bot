import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const n2 = (n: unknown) => Number((Number(n) || 0).toFixed(2));

interface Deuda {
  origen: 'partida' | 'egreso';
  id: string;
  fecha: string;
  proveedor: string;
  proveedor_id: string | null;
  concepto: string;
  placa: string | null;
  total: number;
  pagado: number;
  saldo: number;
  estado_pago: string;
  fecha_vencimiento: string | null;
  vencida: boolean;
  enlace: string | null;
}

/**
 * Lo que el taller le debe a sus proveedores.
 *
 * Junta las dos puertas por las que entra una compra a crédito: los renglones
 * de la ficha de un vehículo y los egresos sueltos. Sin esto pasaba lo que
 * contaba administración: se cobraba el carro, el repuesto seguía a crédito y
 * nadie se enteraba de que había una deuda abierta.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('vehiculos', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = new Date().toISOString().slice(0, 10);

  let pq = auth.db.from('vehiculo_partidas')
    .select('id, fecha, descripcion, placa, cantidad, costo, monto_pagado, estado_pago, proveedor, proveedor_id, enlace, fecha_vencimiento')
    .in('estado_pago', ['por_pagar', 'parcial']);
  let eq = auth.db.from('egresos')
    .select('id, fecha, categoria, notas, placa, total_egresos, monto_pagado, estado_pago, proveedor, proveedor_id, enlace, fecha_vencimiento')
    .in('estado_pago', ['por_pagar', 'parcial']);

  if (sede) { pq = pq.eq('sede_id', sede); eq = eq.eq('sede_id', sede); }

  const [{ data: partidas, error: e1 }, { data: egresos, error: e2 }] = await Promise.all([pq, eq]);
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 });

  const deudas: Deuda[] = [];

  for (const p of partidas || []) {
    const total = n2((Number(p.cantidad) || 0) * (Number(p.costo) || 0));
    const pagado = p.estado_pago === 'parcial' ? n2(p.monto_pagado) : 0;
    const saldo = Math.max(0, n2(total - pagado));
    if (saldo <= 0) continue;
    deudas.push({
      origen: 'partida', id: p.id, fecha: p.fecha,
      proveedor: (p.proveedor || '').trim() || 'Sin proveedor',
      proveedor_id: p.proveedor_id,
      concepto: p.descripcion, placa: p.placa,
      total, pagado, saldo, estado_pago: p.estado_pago,
      fecha_vencimiento: p.fecha_vencimiento,
      vencida: Boolean(p.fecha_vencimiento && p.fecha_vencimiento < hoy),
      enlace: p.enlace,
    });
  }

  for (const e of egresos || []) {
    const total = n2(e.total_egresos);
    const pagado = e.estado_pago === 'parcial' ? n2(e.monto_pagado) : 0;
    const saldo = Math.max(0, n2(total - pagado));
    if (saldo <= 0) continue;
    deudas.push({
      origen: 'egreso', id: e.id, fecha: e.fecha,
      proveedor: (e.proveedor || '').trim() || 'Sin proveedor',
      proveedor_id: e.proveedor_id,
      concepto: e.notas || e.categoria || 'Egreso', placa: e.placa,
      total, pagado, saldo, estado_pago: e.estado_pago,
      fecha_vencimiento: e.fecha_vencimiento,
      vencida: Boolean(e.fecha_vencimiento && e.fecha_vencimiento < hoy),
      enlace: e.enlace,
    });
  }

  // Agrupado por proveedor, el que más se le debe primero.
  const porProveedor = new Map<string, { proveedor: string; proveedor_id: string | null; saldo: number; vencido: number; items: Deuda[] }>();
  for (const d of deudas) {
    const clave = d.proveedor_id || d.proveedor.toUpperCase();
    const g = porProveedor.get(clave) || { proveedor: d.proveedor, proveedor_id: d.proveedor_id, saldo: 0, vencido: 0, items: [] };
    g.saldo = n2(g.saldo + d.saldo);
    if (d.vencida) g.vencido = n2(g.vencido + d.saldo);
    g.items.push(d);
    porProveedor.set(clave, g);
  }

  const grupos = [...porProveedor.values()].sort((a, b) => b.saldo - a.saldo);
  grupos.forEach(g => g.items.sort((a, b) => (a.fecha_vencimiento || a.fecha).localeCompare(b.fecha_vencimiento || b.fecha)));

  return NextResponse.json({
    total: n2(deudas.reduce((s, d) => s + d.saldo, 0)),
    vencido: n2(deudas.filter(d => d.vencida).reduce((s, d) => s + d.saldo, 0)),
    nDeudas: deudas.length,
    proveedores: grupos,
  });
}
