import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import type {
  CompraFila, EvaluacionFila, OrdenCompraFila, PanelProveedores, ProveedorFila,
} from '@/lib/proveedores/tipos';

export const dynamic = 'force-dynamic';

const n2 = (n: unknown) => Number((Number(n) || 0).toFixed(2));
const hoyISO = () => new Date().toISOString().slice(0, 10);

/** La clave con la que se agrupa un proveedor que no está en el catálogo. */
const claveSuelta = (nombre: string) => `~${nombre.trim().toUpperCase()}`;

/**
 * Todo lo que la pantalla de Proveedores necesita, en una sola llamada.
 *
 * Cruza cuatro sitios donde vive una compra:
 *
 *   · `vehiculo_partidas` — el repuesto comprado para un carro concreto
 *   · `egresos`           — la compra suelta, sin carro
 *   · `ordenes_compra`    — lo pedido que aún no ha llegado
 *   · `proveedores`       — el catálogo
 *
 * Están separados porque significan cosas distintas, y sumarlos a ciegas
 * contaría dos veces la misma pieza: un egreso nacido de un renglón de la ficha
 * lleva `partida_id`, y se descarta aquí.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = hoyISO();
  const mes = (url.searchParams.get('mes') || hoy.slice(0, 7)).slice(0, 7);
  const desdeMes = `${mes}-01`;
  // El primer día del mes siguiente, sin pelearse con los días de cada mes.
  const hastaMes = new Date(Date.UTC(
    Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1,
  )).toISOString().slice(0, 10);

  let qProv = auth.db.from('proveedores').select('*').order('nombre');
  // La sede nula es el catálogo compartido: un proveedor sirve a todo el taller.
  if (sede) qProv = qProv.or(`sede_id.eq.${sede},sede_id.is.null`);

  let qPart = auth.db.from('vehiculo_partidas')
    .select('id, fecha, descripcion, placa, cantidad, costo, monto_pagado, estado_pago, '
      + 'proveedor, proveedor_id, enlace, fecha_vencimiento, origen, tipo')
    .gt('costo', 0).order('fecha', { ascending: false }).limit(2000);

  let qEgr = auth.db.from('egresos')
    .select('id, fecha, categoria, notas, placa, total_egresos, monto_pagado, estado_pago, '
      + 'proveedor, proveedor_id, enlace, fecha_vencimiento, partida_id')
    .order('fecha', { ascending: false }).limit(2000);

  let qOrd = auth.db.from('ordenes_compra').select('*')
    .order('fecha', { ascending: false }).limit(500);

  let qEva = auth.db.from('proveedor_evaluaciones').select('*')
    .order('fecha', { ascending: false }).limit(500);

  if (sede) {
    qPart = qPart.eq('sede_id', sede);
    qEgr = qEgr.eq('sede_id', sede);
    qOrd = qOrd.or(`sede_id.eq.${sede},sede_id.is.null`);
    qEva = qEva.or(`sede_id.eq.${sede},sede_id.is.null`);
  }

  const [rProv, rPart, rEgr, rOrd, rEva] = await Promise.all([qProv, qPart, qEgr, qOrd, qEva]);

  // Un cero silencioso es peor que un error: si una consulta falla, que se vea.
  const fallo = rProv.error || rPart.error || rEgr.error || rOrd.error || rEva.error;
  if (fallo) return NextResponse.json({ error: fallo.message }, { status: 500 });

  // Los `select` multilínea dejan a PostgREST sin inferir la forma de la fila.
  type Prov = {
    id: string; nombre: string; rif: string | null; categoria: string | null;
    contacto: string | null; telefono: string | null; email: string | null;
    direccion: string | null; enlace: string | null; notas: string | null;
    condiciones_pago: string | null; dias_credito: number | null; activo: boolean | null;
  };
  type Part = {
    id: string; fecha: string; descripcion: string; placa: string | null;
    cantidad: number | null; costo: number | null; monto_pagado: number | null;
    estado_pago: string; proveedor: string | null; proveedor_id: string | null;
    enlace: string | null; fecha_vencimiento: string | null; origen: string | null; tipo: string | null;
  };
  type Egr = {
    id: string; fecha: string; categoria: string | null; notas: string | null;
    placa: string | null; total_egresos: number | null; monto_pagado: number | null;
    estado_pago: string; proveedor: string | null; proveedor_id: string | null;
    enlace: string | null; fecha_vencimiento: string | null; partida_id: string | null;
  };
  type Ord = {
    id: string; correlativo: string | null; proveedor: string; proveedor_id: string | null;
    fecha: string; fecha_esperada: string | null; fecha_recibida: string | null;
    estado: string; estado_pago: string; total: number | null; monto_pagado: number | null;
    moneda: string | null; fecha_vencimiento: string | null; notas: string | null;
  };
  type Eva = {
    id: string; proveedor_id: string; fecha: string;
    calidad: number | null; puntualidad: number | null; precio: number | null;
    comentario: string | null; evaluado_por: string | null;
  };

  const provs = (rProv.data || []) as unknown as Prov[];
  const partidas = (rPart.data || []) as unknown as Part[];
  const egresos = (rEgr.data || []) as unknown as Egr[];
  const ordenes = (rOrd.data || []) as unknown as Ord[];
  const evals = (rEva.data || []) as unknown as Eva[];

  // ── Las compras, de las dos puertas por las que entran ────────────────────
  const compras: CompraFila[] = [];

  for (const p of partidas) {
    // Lo que trae el cliente no es una compra nuestra, ni la mano de obra propia (se paga por nómina).
    if (p.origen === 'cliente' || p.tipo === 'mano_obra') continue;
    const cantidad = Number(p.cantidad) || 1;
    const total = n2(cantidad * (Number(p.costo) || 0));
    if (total <= 0) continue;
    const pagado = p.estado_pago === 'parcial' ? n2(p.monto_pagado)
      : p.estado_pago === 'pagado' || p.estado_pago === 'no_aplica' ? total : 0;
    compras.push({
      origen: 'partida', id: p.id, fecha: String(p.fecha).slice(0, 10),
      proveedor: (p.proveedor || '').trim() || 'Sin proveedor',
      proveedor_id: p.proveedor_id,
      concepto: p.descripcion, placa: p.placa,
      cantidad, total, pagado, saldo: Math.max(0, n2(total - pagado)),
      estado_pago: p.estado_pago,
      fecha_vencimiento: p.fecha_vencimiento,
      vencida: Boolean(p.fecha_vencimiento && p.fecha_vencimiento < hoy
        && p.estado_pago !== 'pagado' && p.estado_pago !== 'no_aplica'),
      enlace: p.enlace,
    });
  }

  for (const e of egresos) {
    // El egreso que nació de un renglón de la ficha ya está contado arriba.
    if (e.partida_id) continue;
    const total = n2(e.total_egresos);
    if (total <= 0) continue;
    // Un gasto sin proveedor no es una compra a nadie: sueldos, alquiler, luz.
    if (!(e.proveedor || '').trim() && !e.proveedor_id) continue;
    const pagado = e.estado_pago === 'parcial' ? n2(e.monto_pagado)
      : e.estado_pago === 'pagado' ? total : 0;
    compras.push({
      origen: 'egreso', id: e.id, fecha: String(e.fecha).slice(0, 10),
      proveedor: (e.proveedor || '').trim() || 'Sin proveedor',
      proveedor_id: e.proveedor_id,
      concepto: e.notas || e.categoria || 'Compra', placa: e.placa,
      cantidad: 1, total, pagado, saldo: Math.max(0, n2(total - pagado)),
      estado_pago: e.estado_pago,
      fecha_vencimiento: e.fecha_vencimiento,
      vencida: Boolean(e.fecha_vencimiento && e.fecha_vencimiento < hoy
        && e.estado_pago !== 'pagado'),
      enlace: e.enlace,
    });
  }

  compras.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ── Las evaluaciones, agrupadas por proveedor ─────────────────────────────
  const nombrePorId = new Map(provs.map(p => [p.id, p.nombre]));
  const evaluaciones: EvaluacionFila[] = evals.map(e => {
    const notas = [e.calidad, e.puntualidad, e.precio].filter(x => x != null) as number[];
    return {
      id: e.id, proveedor_id: e.proveedor_id,
      proveedor: nombrePorId.get(e.proveedor_id) || 'Proveedor',
      fecha: String(e.fecha).slice(0, 10),
      calidad: e.calidad, puntualidad: e.puntualidad, precio: e.precio,
      promedio: notas.length
        ? Number((notas.reduce((s, x) => s + x, 0) / notas.length).toFixed(1)) : null,
      comentario: e.comentario, evaluado_por: e.evaluado_por,
    };
  });

  // ── Las órdenes de compra ─────────────────────────────────────────────────
  const itemsPorOrden = new Map<string, number>();
  if (ordenes.length > 0) {
    const { data: items } = await auth.db.from('ordenes_compra_items')
      .select('orden_id').in('orden_id', ordenes.map(o => o.id)).limit(5000);
    for (const it of ((items as { orden_id: string }[]) || [])) {
      itemsPorOrden.set(it.orden_id, (itemsPorOrden.get(it.orden_id) || 0) + 1);
    }
  }

  const ABIERTAS = new Set(['borrador', 'pendiente', 'parcial']);
  const ordenesFila: OrdenCompraFila[] = ordenes.map(o => ({
    id: o.id, correlativo: o.correlativo,
    proveedor: o.proveedor, proveedor_id: o.proveedor_id,
    fecha: String(o.fecha).slice(0, 10),
    fecha_esperada: o.fecha_esperada, fecha_recibida: o.fecha_recibida,
    estado: o.estado, estado_pago: o.estado_pago,
    total: n2(o.total), monto_pagado: n2(o.monto_pagado),
    moneda: o.moneda || 'USD',
    fecha_vencimiento: o.fecha_vencimiento, notas: o.notas,
    nItems: itemsPorOrden.get(o.id) || 0,
    atrasada: Boolean(o.fecha_esperada && o.fecha_esperada < hoy && ABIERTAS.has(o.estado)),
  }));

  // ── Los totales por proveedor ─────────────────────────────────────────────
  //
  // El catálogo manda, pero una compra puede tener el proveedor escrito a mano
  // sin estar dado de alta. Esos también salen, marcados como sueltos: dejarlos
  // fuera escondería a quién se le está comprando de verdad.
  const filas = new Map<string, ProveedorFila>();

  const base = (id: string, nombre: string): ProveedorFila => ({
    id, nombre,
    rif: null, categoria: null, contacto: null, telefono: null, email: null,
    direccion: null, enlace: null, condiciones_pago: null, dias_credito: 0,
    activo: true, notas: null,
    comprado: 0, compradoMes: 0, compras: 0, saldo: 0, vencido: 0,
    ultimaCompra: null, ordenesAbiertas: 0, calificacion: null, nEvaluaciones: 0,
  });

  for (const p of provs) {
    filas.set(p.id, {
      ...base(p.id, p.nombre),
      rif: p.rif, categoria: p.categoria, contacto: p.contacto,
      telefono: p.telefono, email: p.email, direccion: p.direccion,
      enlace: p.enlace, notas: p.notas,
      condiciones_pago: p.condiciones_pago,
      dias_credito: Number(p.dias_credito) || 0,
      activo: p.activo !== false,
    });
  }

  const claveDe = (c: { proveedor_id: string | null; proveedor: string }) =>
    (c.proveedor_id && filas.has(c.proveedor_id)) ? c.proveedor_id : claveSuelta(c.proveedor);

  for (const c of compras) {
    const k = claveDe(c);
    const f = filas.get(k) || base(k, c.proveedor);
    f.comprado = n2(f.comprado + c.total);
    f.compras += 1;
    f.saldo = n2(f.saldo + c.saldo);
    if (c.vencida) f.vencido = n2(f.vencido + c.saldo);
    if (c.fecha >= desdeMes && c.fecha < hastaMes) f.compradoMes = n2(f.compradoMes + c.total);
    if (!f.ultimaCompra || c.fecha > f.ultimaCompra) f.ultimaCompra = c.fecha;
    filas.set(k, f);
  }

  for (const o of ordenesFila) {
    if (!ABIERTAS.has(o.estado)) continue;
    const k = claveDe(o);
    const f = filas.get(k) || base(k, o.proveedor);
    f.ordenesAbiertas += 1;
    filas.set(k, f);
  }

  for (const e of evaluaciones) {
    const f = filas.get(e.proveedor_id);
    if (!f || e.promedio == null) continue;
    // Media corrida: se acumula sobre lo que ya había sin guardar la lista.
    f.calificacion = Number((
      ((f.calificacion ?? 0) * f.nEvaluaciones + e.promedio) / (f.nEvaluaciones + 1)
    ).toFixed(1));
    f.nEvaluaciones += 1;
  }

  const listaProv = [...filas.values()].sort((a, b) =>
    b.compradoMes - a.compradoMes || b.comprado - a.comprado || a.nombre.localeCompare(b.nombre));

  // ── Los indicadores de arriba ─────────────────────────────────────────────
  const delMes = compras.filter(c => c.fecha >= desdeMes && c.fecha < hastaMes);
  const kpis = {
    total: listaProv.length,
    // «Activo» no es una casilla: es a quién se le ha comprado alguna vez y no
    // está dado de baja. Un catálogo lleno de nombres que nadie usa no dice nada.
    activos: listaProv.filter(p => p.activo && p.compras > 0).length,
    compradoMes: n2(delMes.reduce((s, c) => s + c.total, 0)),
    comprasMes: delMes.length,
    ordenesPendientes: ordenesFila.filter(o => ABIERTAS.has(o.estado)).length,
    ordenesAtrasadas: ordenesFila.filter(o => o.atrasada).length,
    porPagar: n2(compras.reduce((s, c) => s + c.saldo, 0)),
    vencido: n2(compras.filter(c => c.vencida).reduce((s, c) => s + c.saldo, 0)),
  };

  // ── Lo que hay que mirar hoy ──────────────────────────────────────────────
  const avisos: string[] = [];
  if (kpis.vencido > 0) {
    const n = compras.filter(c => c.vencida).length;
    avisos.push(`Hay $${kpis.vencido.toFixed(2)} vencidos en ${n} compra(s). `
      + 'La alerta de pago saltará al entrar al sistema.');
  }
  if (kpis.ordenesAtrasadas > 0) {
    avisos.push(`${kpis.ordenesAtrasadas} orden(es) de compra pasaron su fecha de `
      + 'entrega y todavía no han llegado.');
  }
  const anonimo = listaProv.find(p => p.id === claveSuelta('Sin proveedor'));
  if (anonimo && anonimo.compras > 0) {
    avisos.push(`Hay ${anonimo.compras} compra(s) por $${anonimo.comprado.toFixed(2)} sin `
      + 'anotar a quién se le compraron. Sin el proveedor no se puede reclamar una '
      + 'garantía ni saber a quién volver a pedirle.');
  }

  const sueltos = listaProv.filter(p =>
    p.id.startsWith('~') && p.compras > 0 && p.id !== claveSuelta('Sin proveedor'));
  if (sueltos.length > 0) {
    avisos.push(`A ${sueltos.length} proveedor(es) se les compra sin estar en el `
      + `catálogo (${sueltos.slice(0, 3).map(p => p.nombre).join(', ')}`
      + `${sueltos.length > 3 ? '…' : ''}). Dalos de alta para guardar su contacto `
      + 'y sus condiciones.');
  }
  const sinContacto = listaProv.filter(p => !p.id.startsWith('~') && !p.telefono && p.compras > 0);
  if (sinContacto.length > 0) {
    avisos.push(`${sinContacto.length} proveedor(es) con compras no tienen teléfono `
      + 'guardado: la alerta de pago no podrá ofrecer cómo contactarlos.');
  }

  // «Sin proveedor» no es nadie: destacarlo sería premiar la falta de dato.
  const real = (p: ProveedorFila) => p.id !== claveSuelta('Sin proveedor');
  const destacado = listaProv.find(p => real(p) && p.compradoMes > 0)
    ?? listaProv.find(p => real(p) && p.comprado > 0)
    ?? null;

  const panel: PanelProveedores = {
    proveedores: listaProv,
    compras: compras.slice(0, 300),
    ordenes: ordenesFila,
    evaluaciones,
    kpis,
    destacado,
    avisos,
    mes,
  };

  return NextResponse.json(panel);
}
