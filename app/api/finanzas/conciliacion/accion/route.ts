import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { registrarCobro } from '@/lib/pagos/registrar-cobro';
import { buildCategoriaColumns, buildPagoColumnsCompletas, inferirCategoria } from '@/lib/categorias';
import type { JustificacionConciliacion } from '@/lib/conciliacion/motor';
import { anotarAccion, cambiarCuenta, corregirMonto, tasaDelDia } from '@/lib/conciliacion/acciones';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';
import { crearFacturaServidor } from '@/lib/facturas/servidor';

const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const sinTildes = (t: unknown) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sumarDias = (f: string, k: number) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authorize('ventas', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { accion } = body;
    // Lo que cada acción deja anotado: de qué banco/corrida viene y a qué movimiento atiende.
    const ctx = {
      banco: typeof body.banco === 'string' ? body.banco : null,
      corridaId: typeof body.corridaId === 'string' ? body.corridaId : null,
      caso: typeof body.caso === 'string' && body.caso ? body.caso : 'otro',
      movimientoHash: typeof body.movimientoHash === 'string' ? body.movimientoHash : null,
      referencia: typeof body.refMovimiento === 'string' ? body.refMovimiento : null,
      usuario: auth.user?.nombre || 'Usuario',
      sedeId: auth.user?.sede_id || null,
    };

    // ── 1. JUSTIFICAR UN MOVIMIENTO O DISCREPANCIA ──────────────────────────
    if (accion === 'justificar') {
      const { movimientoHash, tipo, motivo, monto, fecha } = body;
      if (!movimientoHash || !motivo) {
        return NextResponse.json({ error: 'Debes indicar el motivo de la justificación.' }, { status: 400 });
      }
      const { data: conf } = await auth.db.from('configuracion')
        .select('id, valor')
        .eq('clave', 'conciliacion_justificaciones')
        .is('sede_id', null)
        .maybeSingle();

      const list: JustificacionConciliacion[] = Array.isArray(conf?.valor) ? [...conf.valor] : [];
      const nueva: JustificacionConciliacion = {
        id: crypto.randomUUID(),
        movimientoHash,
        tipo: tipo || 'ingreso',
        motivo: String(motivo).trim(),
        fecha: fecha || new Date().toISOString().slice(0, 10),
        monto: Math.round(Number(monto || 0) * 100) / 100,
        usuario: auth.user?.nombre || 'Usuario',
        createdAt: new Date().toISOString(),
      };
      const idx = list.findIndex(j => j.movimientoHash === movimientoHash);
      if (idx >= 0) list[idx] = nueva;
      else list.push(nueva);

      const ahora = new Date().toISOString();
      if (conf?.id) {
        await auth.db.from('configuracion').update({ valor: list, updated_at: ahora }).eq('id', conf.id);
      } else {
        await auth.db.from('configuracion').insert({ clave: 'conciliacion_justificaciones', valor: list, sede_id: null, updated_at: ahora });
      }

      await logActivityServer(auth.db, {
        usuario: auth.user?.nombre || 'Usuario',
        modulo: 'Finanzas',
        accion: 'Justificó movimiento en conciliación',
        detalles: `${nueva.tipo} ${nueva.monto} · ${nueva.motivo}`,
        referencia_tabla: 'conciliacion',
        sede_id: auth.user?.sede_id || null,
      });

      await anotarAccion(auth.db, { ...ctx, caso: tipo === 'diferencia' ? 'monto_distinto' : ctx.caso, accion: 'justificar', fecha: nueva.fecha, monto: nueva.monto, motivo: nueva.motivo, despues: { motivo: nueva.motivo } });
      return NextResponse.json({ ok: true, justificacion: nueva });
    }

    // ── 2. QUITAR JUSTIFICACIÓN ─────────────────────────────────────────────
    if (accion === 'quitar_justificacion') {
      const { id, movimientoHash } = body;
      const { data: conf } = await auth.db.from('configuracion')
        .select('id, valor')
        .eq('clave', 'conciliacion_justificaciones')
        .is('sede_id', null)
        .maybeSingle();

      if (conf?.id && Array.isArray(conf.valor)) {
        const filtrados = (conf.valor as JustificacionConciliacion[]).filter(j => (id ? j.id !== id : j.movimientoHash !== movimientoHash));
        await auth.db.from('configuracion').update({ valor: filtrados, updated_at: new Date().toISOString() }).eq('id', conf.id);
      }
      await anotarAccion(auth.db, { ...ctx, accion: 'reabrir', resuelto: false, motivo: 'Se quitó la justificación: el caso vuelve a estar pendiente.' });
      return NextResponse.json({ ok: true });
    }

    // ── 3. REGISTRAR SERVICIO / VENTA DIRECTO DESDE CONCILIACIÓN ────────────
    if (accion === 'registrar_servicio') {
      const {
        cliente,
        telefono,
        placa,
        vehiculo_info,
        descripcion,
        monto,
        enDolares,
        fecha,
        referencia,
        cuenta,
        categoria: catUser,
        tasa: tasaUser,
      } = body;

      const numMonto = Math.round(Number(monto || 0) * 100) / 100;
      if (numMonto <= 0) return NextResponse.json({ error: 'El monto debe ser mayor a cero.' }, { status: 400 });

      // La tasa es la del día del movimiento (no la de hoy): un cobro del viernes se convierte a la tasa del viernes.
      let tasa = Number(tasaUser) || 0;
      let tasaInfo: { tasa: number; fecha: string; fuente: string } | null = tasa > 0 ? { tasa, fecha: String(fecha || '').slice(0, 10), fuente: 'Indicada por el usuario' } : null;
      if (!tasa && !enDolares) {
        tasaInfo = await tasaDelDia(auth.db, String(fecha || new Date().toISOString().slice(0, 10)));
        tasa = tasaInfo?.tasa || 0;
        if (!tasa) return NextResponse.json({ error: 'No hay tasa BCV registrada para esa fecha: indícala a mano para no equivocar los dólares.' }, { status: 409 });
      }

      const totalDolares = enDolares ? numMonto : (tasa > 0 ? Math.round((numMonto / tasa) * 100) / 100 : numMonto);
      const categoria = catUser || inferirCategoria(descripcion);
      const sedeId = auth.user?.sede_id || null;
      const descFinal = descripcion || 'Servicio registrado desde conciliación bancaria';
      const clienteNombre = String(cliente || 'Cliente Conciliado').trim();
      const fechaEfectiva = fecha || new Date().toISOString().slice(0, 10);
      const fechaIso = `${fechaEfectiva}T12:00:00Z`;
      const ctaMetodo = cuenta || 'bnc';

      // Lo que entró al banco puede incluir el IVA: el ingreso de la venta es la base (como al cobrar a mano).
      const conIva = Boolean(body.conIva);
      const pagadoUsd = totalDolares;
      const baseUsd = conIva ? Math.round((pagadoUsd / 1.16) * 100) / 100 : pagadoUsd;

      // ¿Ya está registrado? Registrar dos veces el mismo pago (a mano y desde la conciliación) duplicaba el ingreso del día.
      if (!body.forzar) {
        let cq = auth.db.from('ventas_dia')
          .select(`id, fecha, cliente, total_ingresos, con_iva, comprobante_referencia, creado_por, created_at, ${ctaMetodo}`)
          .gte('fecha', sumarDias(fechaEfectiva, -3)).lte('fecha', sumarDias(fechaEfectiva, 3)).limit(500);
        if (sedeId) cq = cq.eq('sede_id', sedeId);
        const { data: cercanas } = await cq;
        const refLimpia = String(referencia || '').replace(/\D/g, '');
        const duplicada = ((cercanas || []) as unknown as Array<Record<string, unknown>>).find(v => {
          const refV = String(v.comprobante_referencia || '').replace(/\D/g, '');
          const mismaRef = refLimpia.length >= 6 && refV.length >= 6 && (refV.endsWith(refLimpia.slice(-8)) || refLimpia.endsWith(refV.slice(-8)));
          const enCuenta = Number(v[ctaMetodo]) || 0;
          const mismoMontoBanco = enCuenta > 0 && Math.abs(enCuenta - numMonto) <= 0.01;
          const mismoCliente = clienteNombre !== 'Cliente Conciliado' && sinTildes(v.cliente) === sinTildes(clienteNombre);
          const baseV = Number(v.total_ingresos) || 0;
          const mismoTotal = Math.abs(baseV - baseUsd) <= Math.max(0.5, baseUsd * 0.01) || Math.abs(baseV * (v.con_iva ? 1.16 : 1) - pagadoUsd) <= Math.max(0.5, pagadoUsd * 0.01);
          return mismaRef || (mismoMontoBanco && v.fecha === fechaEfectiva) || (mismoCliente && mismoTotal);
        });
        // ¿Es la inicial o una cuota de una venta con Cashea anterior? Entonces no es una venta nueva:
        // registrarla como venta contaba ese dinero dos veces (pasó con la inicial de Álvaro Hernández).
        if (!duplicada && clienteNombre !== 'Cliente Conciliado') {
          let qc = auth.db.from('ventas_dia').select('id, fecha, cliente, total_ingresos, inicial, financiado, creado_por')
            .gt('financiado', 0).gte('fecha', sumarDias(fechaEfectiva, -120)).lt('fecha', fechaEfectiva).limit(1000);
          if (sedeId) qc = qc.eq('sede_id', sedeId);
          const { data: conCashea } = await qc;
          const madre = (conCashea || []).find(c => sinTildes(c.cliente) === sinTildes(clienteNombre)
            && (Math.abs(Number(c.inicial) - pagadoUsd) <= 0.5 || Math.abs(Number(c.financiado) / 3 - pagadoUsd) <= 0.5));
          if (madre) {
            const que = Math.abs(Number(madre.inicial) - pagadoUsd) <= 0.5 ? 'la inicial' : 'una cuota';
            return NextResponse.json({
              error: `Este pago es ${que} de Cashea de la venta de ${madre.cliente} del ${String(madre.fecha)} (${Number(madre.total_ingresos).toFixed(2)}): ese dinero ya está en esa venta. No la registres como venta nueva; confírmala en «Conciliados» o aplícala como cobro de esa venta.`,
              duplicada: { id: madre.id, fecha: madre.fecha, cliente: madre.cliente, total: Number(madre.total_ingresos), creadoPor: madre.creado_por },
            }, { status: 409 });
          }
        }
        if (duplicada) {
          return NextResponse.json({
            error: `Ya hay una venta de ${duplicada.cliente} por $${Number(duplicada.total_ingresos).toFixed(2)} (${String(duplicada.fecha)}), registrada por ${duplicada.creado_por || 'otro usuario'}. Si es el mismo pago, no la registres otra vez: aplícalo a esa venta.`,
            duplicada: { id: duplicada.id, fecha: duplicada.fecha, cliente: duplicada.cliente, total: Number(duplicada.total_ingresos), creadoPor: duplicada.creado_por },
          }, { status: 409 });
        }
      }

      let clienteId: string | null = null;
      let vehiculoId: string | null = null;
      if (placa && placa.trim().length >= 5) {
        const placaNorm = placa.trim().toUpperCase();
        const { data: veh } = await auth.db.from('vehiculos').select('id, cliente_id, marca, modelo').eq('placa', placaNorm).maybeSingle();
        if (veh) {
          vehiculoId = veh.id;
          clienteId = veh.cliente_id;
        } else {
          if (clienteNombre && clienteNombre !== 'Cliente Conciliado') {
            const { data: cli } = await auth.db.from('clientes').select('id').ilike('nombre', clienteNombre).maybeSingle();
            if (cli) clienteId = cli.id;
            else {
              const { data: newCli } = await auth.db.from('clientes').insert({
                nombre: clienteNombre,
                telefono: telefono || null,
                sede_id: sedeId,
              }).select('id').maybeSingle();
              if (newCli) clienteId = newCli.id;
            }
          }
          const { data: newVeh } = await auth.db.from('vehiculos').insert({
            placa: placaNorm,
            cliente_id: clienteId,
            marca: vehiculo_info ? vehiculo_info.split(' ')[0] : 'Vehículo',
            modelo: vehiculo_info ? vehiculo_info.split(' ').slice(1).join(' ') : 'Taller',
            sede_id: sedeId,
          }).select('id').maybeSingle();
          if (newVeh) vehiculoId = newVeh.id;
        }
      }

      // Insertar servicio
      const { data: newServ, error: servErr } = await auth.db.from('servicios').insert({
        cliente_id: clienteId,
        vehiculo_id: vehiculoId,
        nombre_cliente: clienteNombre,
        telefono: telefono || null,
        vehiculo_info: vehiculo_info || (placa ? `Placa ${placa}` : null),
        placa: placa || null,
        tipo: categoria,
        tipo_personalizado: descFinal,
        descripcion: descFinal,
        costo_estimado: baseUsd,
        costo_final: baseUsd,
        estado: 'completada',
        fecha: fechaEfectiva,
        fecha_inicio: fechaIso,
        fecha_fin: fechaIso,
        registrado_por: auth.user?.nombre || 'Admin',
        sede_id: sedeId,
        metodos_pago: { [ctaMetodo]: numMonto },
        tasa_cambio: tasa,
        seguimiento: [{
          fecha: new Date().toISOString(),
          accion: `Completado desde Conciliación Bancaria · Ref ${referencia || 'N/A'}`,
          usuario: auth.user?.nombre || 'Admin',
          tipo: 'sistema',
        }],
      }).select().single();

      if (servErr) throw new Error(servErr.message);

      // Insertar venta_dia
      const metodosObj: Record<string, number> = { [ctaMetodo]: numMonto };
      const columnasPago = buildPagoColumnsCompletas(metodosObj);
      const columnasCat = buildCategoriaColumns(categoria, baseUsd);
      const refTag = `[ServicioID: ${newServ.id}]`;
      const notasVenta = `[Conciliado] ${descFinal} [Total: $${totalDolares.toFixed(2)} (${ctaMetodo.replace(/_/g, ' ')})] | Ref: ${referencia || 'S/R'} ${refTag}`;

      const { data: newVenta, error: ventaErr } = await auth.db.from('ventas_dia').insert({
        fecha: fechaEfectiva,
        cliente: clienteNombre,
        cliente_id: clienteId,
        vehiculo_id: vehiculoId,
        servicio_id: newServ.id,
        placa: placa || null,
        vehiculo_info: vehiculo_info || (placa ? `Placa ${placa}` : null),
        categoria,
        ...columnasCat,
        total_ingresos: baseUsd,
        total_servicios: 1,
        total_clientes: 1,
        desglose: [{
          descripcion: descFinal,
          cantidad: 1,
          precio_unitario: baseUsd,
          total: baseUsd,
        }],
        metodos_pago: metodosObj,
        ...columnasPago,
        tasa_cambio: tasa,
        con_iva: conIva,
        comprobante_referencia: referencia || null,
        notas: notasVenta,
        creado_por: auth.user?.nombre || 'Admin',
        sede_id: sedeId,
        fecha_registro: new Date().toISOString(),
        // Estado normal (el resto del sistema solo conoce pagado/pendiente); que vino de la conciliación consta en la nota y en el historial.
        registro_atrasado: fechaEfectiva < hoyCaracas(),
        estado: 'pagado',
      }).select().single();

      if (ventaErr) {
        // Sin venta no debe quedar la orden: antes quedaban órdenes «completadas» sin cobro y el reporte las contaba.
        await auth.db.from('servicios').delete().eq('id', newServ.id);
        throw new Error(ventaErr.message);
      }

      // Si vino movimientoHash, guardar la justificación/enlace
      if (body.movimientoHash) {
        const { data: conf } = await auth.db.from('configuracion').select('id, valor').eq('clave', 'conciliacion_justificaciones').is('sede_id', null).maybeSingle();
        const list = Array.isArray(conf?.valor) ? [...conf.valor] : [];
        list.push({
          id: crypto.randomUUID(),
          movimientoHash: body.movimientoHash,
          tipo: 'ingreso',
          motivo: `Registrado como Servicio (${clienteNombre})`,
          fecha: fechaEfectiva,
          monto: numMonto,
          usuario: auth.user?.nombre || 'Admin',
          createdAt: new Date().toISOString(),
        });
        if (conf?.id) {
          await auth.db.from('configuracion').update({ valor: list, updated_at: new Date().toISOString() }).eq('id', conf.id);
        } else {
          await auth.db.from('configuracion').insert({ clave: 'conciliacion_justificaciones', valor: list, sede_id: null, updated_at: new Date().toISOString() });
        }
      }

      await logActivityServer(auth.db, {
        usuario: auth.user?.nombre || 'Usuario',
        modulo: 'Finanzas',
        accion: 'Registró servicio desde conciliación bancaria',
        detalles: `${clienteNombre} · $${totalDolares.toFixed(2)} (${numMonto} ${enDolares ? 'USD' : 'Bs'}) · Ref ${referencia || 'N/A'}`,
        referencia_tabla: 'servicios',
        referencia_id: newServ.id,
        sede_id: sedeId,
      });

      await anotarAccion(auth.db, { ...ctx, caso: 'sin_registrar', accion: 'registrar_servicio', fecha: fechaEfectiva, monto: numMonto, referencia: referencia || ctx.referencia,
        despues: { cliente: clienteNombre, placa: placa || null, usd: totalDolares, cuenta: ctaMetodo, categoria }, tasa: enDolares ? null : tasaInfo, tabla: 'ventas_dia', registroId: newVenta?.id });
      // La factura, igual que al cobrar a mano: sin ella la venta quedaba fuera de Facturas.
      const factura = await crearFacturaServidor(auth.db, {
        referenciaId: newServ.id, referenciaTabla: 'servicios', moduloOrigen: 'servicios', cliente: clienteNombre,
        vehiculo: vehiculo_info || placa || null, totalBase: baseUsd, tasa: enDolares ? null : tasa, totalBs: enDolares ? null : numMonto,
        items: [{ descripcion: descFinal, cantidad: 1, precio_unitario: baseUsd, total: baseUsd }], metodosPago: metodosObj, conIva,
        notas: `Registrada desde la conciliación bancaria · Ref ${referencia || 'S/R'}`, emitidoPor: auth.user?.nombre || 'Admin', fecha: fechaEfectiva,
        sedeId, comprobanteReferencia: referencia || null,
      });
      return NextResponse.json({
        ok: true, servicio: newServ, venta: newVenta,
        resumen: {
          cliente: clienteNombre, fecha: fechaEfectiva, ingresoUsd: baseUsd, pagadoUsd, conIva, cuenta: ctaMetodo, montoBanco: numMonto,
          factura: factura?.correlativo || null, ventaId: newVenta?.id,
        },
      });
    }

    // ── 4. REGISTRAR ABONO A UNA VENTA PENDIENTE ────────────────────────────
    if (accion === 'registrar_abono') {
      const { ventaId, monto, cuenta, fecha, referencia, tasa, nota } = body;
      if (!ventaId) return NextResponse.json({ error: 'Debes indicar la venta a la cual abonar.' }, { status: 400 });
      const res = await registrarCobro(auth.db, ventaId, {
        cuentas: { [cuenta || 'bnc']: Number(monto) },
        tasa: Number(tasa) || 0,
        fecha,
        nota: `Conciliación ref ${referencia || ''} · ${nota || ''}`,
        usuario: auth.user?.nombre || 'Usuario',
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.estado });

      if (body.movimientoHash) {
        const { data: conf } = await auth.db.from('configuracion').select('id, valor').eq('clave', 'conciliacion_justificaciones').is('sede_id', null).maybeSingle();
        const list = Array.isArray(conf?.valor) ? [...conf.valor] : [];
        list.push({
          id: crypto.randomUUID(),
          movimientoHash: body.movimientoHash,
          tipo: 'ingreso',
          motivo: `Abono aplicado a Venta #${ventaId.slice(0, 8)}`,
          fecha: fecha || new Date().toISOString().slice(0, 10),
          monto: Number(monto),
          usuario: auth.user?.nombre || 'Admin',
          createdAt: new Date().toISOString(),
        });
        if (conf?.id) {
          await auth.db.from('configuracion').update({ valor: list, updated_at: new Date().toISOString() }).eq('id', conf.id);
        } else {
          await auth.db.from('configuracion').insert({ clave: 'conciliacion_justificaciones', valor: list, sede_id: null, updated_at: new Date().toISOString() });
        }
      }

      await logActivityServer(auth.db, {
        usuario: auth.user?.nombre || 'Usuario',
        modulo: 'Finanzas',
        accion: 'Registró abono desde conciliación bancaria',
        detalles: `Venta ${ventaId} · Monto: ${monto} · Ref ${referencia || 'N/A'}`,
        referencia_tabla: 'abonos',
        referencia_id: (res.abono as { id?: string })?.id ?? null,
        sede_id: auth.user?.sede_id || null,
      });

      await anotarAccion(auth.db, { ...ctx, caso: 'sin_registrar', accion: 'registrar_abono', fecha: fecha || null, monto: Number(monto), referencia: referencia || ctx.referencia,
        despues: { ventaId, cuenta: cuenta || 'bnc' }, tasa: Number(tasa) > 0 ? { tasa: Number(tasa), fecha: String(fecha || '').slice(0, 10), fuente: 'Indicada por el usuario' } : null, tabla: 'abonos', registroId: (res.abono as { id?: string })?.id ?? null });
      return NextResponse.json({ ok: true, abono: res.abono });
    }

    // ── 5. REGISTRAR EGRESO / GASTO DIRECTO DESDE CONCILIACIÓN ──────────────
    if (accion === 'registrar_egreso') {
      const { proveedor, categoria, total_egresos, moneda, cuenta, fecha, descripcion, comprobante, tasa: tasaUser } = body;
      const numTotal = Number(total_egresos);
      if (!numTotal || numTotal <= 0) return NextResponse.json({ error: 'El monto del gasto debe ser mayor a cero.' }, { status: 400 });

      // Resolver la tasa si no viene y la moneda es Bs (para poder convertir a USD).
      let tasa = Number(tasaUser) || 0;
      let tasaInfo: { tasa: number; fecha: string; fuente: string } | null = tasa > 0 ? { tasa, fecha: String(fecha || '').slice(0, 10), fuente: 'Indicada por el usuario' } : null;
      // El egreso se guarda como en todo el sistema: el total en DÓLARES y el reparto por cuenta en la moneda de la cuenta.
      // Un pago de Bs 19.600 no es «$19.600»: se divide entre la tasa del día del pago.
      const cuentaEsBs = BANK_METHODS.find(m => m.id === (cuenta || 'bnc'))?.moneda !== 'USD';
      if (!tasa && cuentaEsBs) {
        tasaInfo = await tasaDelDia(auth.db, String(fecha || new Date().toISOString().slice(0, 10)));
        tasa = tasaInfo?.tasa || 0;
        if (!tasa) return NextResponse.json({ error: 'No hay tasa BCV registrada para esa fecha: indícala a mano para no equivocar los dólares.' }, { status: 409 });
      }
      const totalUsd = cuentaEsBs ? Math.round((numTotal / tasa) * 100) / 100 : numTotal;
      const fechaGasto = fecha || new Date().toISOString().slice(0, 10);
      const descGasto = String(descripcion || '').trim() || 'Gasto registrado desde conciliación bancaria';

      const sedeId = auth.user?.sede_id || null;
      const ctaMetodo = cuenta || 'bnc';
      // Mismo comprobante, mismo gasto: no se duplica (a mano y desde la conciliación).
      if (!body.forzar && String(comprobante || '').trim().length >= 4) {
        const { data: previo } = await auth.db.from('egresos').select('id, fecha, proveedor, total_egresos, creado_por').eq('comprobante_referencia', String(comprobante).trim()).limit(1).maybeSingle();
        if (previo) {
          return NextResponse.json({
            error: `Ya hay un gasto con esa referencia: ${previo.proveedor} por $${Number(previo.total_egresos).toFixed(2)} (${String(previo.fecha)}), registrado por ${previo.creado_por || 'otro usuario'}.`,
            duplicada: { id: previo.id, fecha: previo.fecha, cliente: previo.proveedor, total: Number(previo.total_egresos), creadoPor: previo.creado_por },
          }, { status: 409 });
        }
      }
      const { data: egreso, error: egErr } = await auth.db.from('egresos').insert({
        fecha: fechaGasto,
        proveedor: proveedor || 'Gasto Operativo',
        categoria: categoria || 'repuestos',
        total_egresos: totalUsd,
        moneda: 'USD',
        estado_pago: 'pagado',
        monto_pagado: totalUsd,
        fecha_pago: fechaGasto,
        origen: 'conciliacion',
        desglose: [{ descripcion: descGasto, cantidad: 1, precio_unitario: totalUsd, total: totalUsd }],
        metodo_pago: ctaMetodo,
        metodos_pago: { [ctaMetodo]: numTotal },
        tasa_cambio: tasa || null,
        comprobante_referencia: comprobante || null,
        notas: `${descGasto} · Ref ${comprobante || 'S/R'} · Conciliación bancaria`,
        creado_por: auth.user?.nombre || 'Admin',
        sede_id: sedeId,
      }).select().single();

      if (egErr) throw new Error(egErr.message);

      if (body.movimientoHash) {
        const { data: conf } = await auth.db.from('configuracion').select('id, valor').eq('clave', 'conciliacion_justificaciones').is('sede_id', null).maybeSingle();
        const list = Array.isArray(conf?.valor) ? [...conf.valor] : [];
        list.push({
          id: crypto.randomUUID(),
          movimientoHash: body.movimientoHash,
          tipo: 'egreso',
          motivo: `Registrado como Egreso (${proveedor || 'Gasto Operativo'} · ${categoria || 'repuestos'})`,
          fecha: fecha || new Date().toISOString().slice(0, 10),
          monto: numTotal,
          usuario: auth.user?.nombre || 'Admin',
          createdAt: new Date().toISOString(),
        });
        if (conf?.id) {
          await auth.db.from('configuracion').update({ valor: list, updated_at: new Date().toISOString() }).eq('id', conf.id);
        } else {
          await auth.db.from('configuracion').insert({ clave: 'conciliacion_justificaciones', valor: list, sede_id: null, updated_at: new Date().toISOString() });
        }
      }

      await logActivityServer(auth.db, {
        usuario: auth.user?.nombre || 'Usuario',
        modulo: 'Finanzas',
        accion: 'Registró egreso desde conciliación bancaria',
        detalles: `${proveedor || 'Gasto'} · ${numTotal.toFixed(2)} ${cuentaEsBs ? 'Bs' : 'USD'} ($${totalUsd.toFixed(2)}) · ${categoria || 'repuestos'} · Ref ${comprobante || 'N/A'}`,
        referencia_tabla: 'egresos',
        referencia_id: egreso.id,
        sede_id: sedeId,
      });

      await anotarAccion(auth.db, { ...ctx, caso: 'pago_sin_gasto', accion: 'registrar_egreso', fecha: fecha || null, monto: numTotal, referencia: comprobante || ctx.referencia,
        despues: { proveedor: proveedor || 'Gasto Operativo', categoria: categoria || 'repuestos', cuenta: ctaMetodo, bs: cuentaEsBs ? numTotal : null, usd: totalUsd }, tasa: tasaInfo, tabla: 'egresos', registroId: egreso.id });
      return NextResponse.json({ ok: true, egreso });
    }

    // ── 6. CORREGIR EL MONTO DEL SISTEMA AL QUE CONFIRMÓ EL BANCO ───────────
    if (accion === 'corregir_monto') {
      const { tabla, registroId, cuenta, montoNuevo, montoBanco, fecha } = body;
      const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? String(fecha) : null;
      const r = await corregirMonto(auth.db, { tabla: String(tabla || ''), registroId: String(registroId || ''), cuenta: String(cuenta || ''), montoNuevo: Number(montoNuevo), referencia: ctx.referencia });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
      const tasaInfo = fechaOk ? await tasaDelDia(auth.db, fechaOk) : null;
      const motivo = `Monto corregido de ${r.antes.toFixed(2)} a ${r.despues.toFixed(2)} según el estado de cuenta (${r.cliente})`;
      await anotarAccion(auth.db, { ...ctx, caso: 'monto_distinto', accion: 'corregir_monto', fecha: fechaOk, monto: Number(montoBanco ?? montoNuevo), motivo,
        antes: { monto: r.antes, cuenta }, despues: { monto: r.despues, cuenta }, tasa: tasaInfo, tabla, registroId });
      await logActivityServer(auth.db, { usuario: ctx.usuario, modulo: 'Finanzas', accion: 'Corrigió un monto desde la conciliación', detalles: motivo, referencia_tabla: String(tabla), referencia_id: String(registroId), sede_id: ctx.sedeId });
      return NextResponse.json({ ok: true, antes: r.antes, despues: r.despues });
    }

    // ── 7. EL CLIENTE PAGÓ A OTRA CUENTA: CAMBIAR LA CUENTA DE LA VENTA ─────
    if (accion === 'cambiar_cuenta') {
      const { registroId, desde, hacia, fecha, montoBanco } = body;
      const r = await cambiarCuenta(auth.db, { registroId: String(registroId || ''), desde: String(desde || ''), hacia: String(hacia || '') });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
      const motivo = `Cuenta de la venta de ${r.cliente} cambiada de ${desde} a ${hacia} (Bs ${r.monto.toFixed(2)})`;
      await anotarAccion(auth.db, { ...ctx, caso: ctx.caso === 'otro' ? 'no_llego' : ctx.caso, accion: 'cambiar_cuenta', fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? String(fecha) : null, monto: Number(montoBanco ?? r.monto), motivo,
        antes: { cuenta: desde }, despues: { cuenta: hacia }, tabla: 'ventas_dia', registroId });
      await logActivityServer(auth.db, { usuario: ctx.usuario, modulo: 'Finanzas', accion: 'Cambió la cuenta de una venta desde la conciliación', detalles: motivo, referencia_tabla: 'ventas_dia', referencia_id: String(registroId), sede_id: ctx.sedeId });
      return NextResponse.json({ ok: true });
    }

    // ── 9. CONFIRMAR UNA PAREJA QUE EL SISTEMA UNIÓ CON DUDA ────────────────
    if (accion === 'confirmar_pareja') {
      const { registroId, tabla, referencia, monto, fecha, concepto } = body;
      if (!ctx.movimientoHash) return NextResponse.json({ error: 'Falta el movimiento del banco.' }, { status: 400 });
      const motivo = `Confirmado: ${concepto || 'pago'} ← movimiento del banco ref ${referencia || 'S/R'}`;
      const ahora = new Date().toISOString();
      const { data: conf } = await auth.db.from('configuracion').select('id, valor').eq('clave', 'conciliacion_justificaciones').is('sede_id', null).maybeSingle();
      const list = Array.isArray(conf?.valor) ? [...conf.valor] : [];
      list.push({ id: crypto.randomUUID(), movimientoHash: ctx.movimientoHash, tipo: 'ingreso', motivo, fecha: String(fecha || ahora.slice(0, 10)), monto: Math.round(Number(monto || 0) * 100) / 100, usuario: ctx.usuario, createdAt: ahora });
      if (conf?.id) await auth.db.from('configuracion').update({ valor: list, updated_at: ahora }).eq('id', conf.id);
      else await auth.db.from('configuracion').insert({ clave: 'conciliacion_justificaciones', valor: list, sede_id: null, updated_at: ahora });
      // La referencia del banco queda en la venta (si no tenía) para que el próximo cruce la una por referencia.
      if (tabla === 'ventas_dia' && registroId && referencia) {
        const { data: v } = await auth.db.from('ventas_dia').select('comprobante_referencia').eq('id', String(registroId)).maybeSingle();
        if (v && !String(v.comprobante_referencia || '').trim()) await auth.db.from('ventas_dia').update({ comprobante_referencia: String(referencia) }).eq('id', String(registroId));
      }
      await anotarAccion(auth.db, { ...ctx, caso: 'pareja_dudosa', accion: 'confirmar_pareja', fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? String(fecha) : null, monto: Number(monto) || null, motivo, tabla, registroId });
      return NextResponse.json({ ok: true });
    }

    // ── 8. DEJAR EN SEGUIMIENTO (no se resuelve hoy, pero queda anotado quién y por qué) ──
    if (accion === 'seguimiento') {
      const { motivo, monto, fecha } = body;
      if (!String(motivo || '').trim()) return NextResponse.json({ error: 'Anota qué falta para resolverlo.' }, { status: 400 });
      await anotarAccion(auth.db, { ...ctx, accion: 'seguimiento', resuelto: false, fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? String(fecha) : null, monto: Number(monto) || null, motivo: String(motivo).trim() });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
