import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { registrarCobro } from '@/lib/pagos/registrar-cobro';
import { buildCategoriaColumns, buildPagoColumnsCompletas, inferirCategoria } from '@/lib/categorias';
import type { JustificacionConciliacion } from '@/lib/conciliacion/motor';
import { anotarAccion, cambiarCuenta, corregirMonto, tasaDelDia } from '@/lib/conciliacion/acciones';

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
        costo_estimado: totalDolares,
        costo_final: totalDolares,
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
      const columnasCat = buildCategoriaColumns(categoria, totalDolares);
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
        total_ingresos: totalDolares,
        total_servicios: 1,
        total_clientes: 1,
        desglose: [{
          descripcion: descFinal,
          cantidad: 1,
          precio_unitario: totalDolares,
          total: totalDolares,
        }],
        metodos_pago: metodosObj,
        ...columnasPago,
        tasa_cambio: tasa,
        con_iva: false,
        comprobante_referencia: referencia || null,
        notas: notasVenta,
        creado_por: auth.user?.nombre || 'Admin',
        sede_id: sedeId,
        fecha_registro: new Date().toISOString(),
        registro_atrasado: false,
        estado: 'conciliado',
      }).select().single();

      if (ventaErr) throw new Error(ventaErr.message);

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
      return NextResponse.json({ ok: true, servicio: newServ, venta: newVenta });
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
      if (!tasa && (moneda === 'VES' || moneda === 'Bs' || !moneda)) {
        tasaInfo = await tasaDelDia(auth.db, String(fecha || new Date().toISOString().slice(0, 10)));
        tasa = tasaInfo?.tasa || 0;
      }

      const sedeId = auth.user?.sede_id || null;
      const ctaMetodo = cuenta || 'bnc';
      const { data: egreso, error: egErr } = await auth.db.from('egresos').insert({
        fecha: fecha || new Date().toISOString().slice(0, 10),
        proveedor: proveedor || 'Gasto Operativo',
        categoria: categoria || 'repuestos',
        total_egresos: numTotal,
        moneda: moneda || 'VES',
        metodo_pago: ctaMetodo,
        metodos_pago: { [ctaMetodo]: numTotal },
        tasa_cambio: tasa || null,
        comprobante_referencia: comprobante || null,
        notas: `Egreso registrado desde Conciliación Bancaria · Ref ${comprobante || ''} · ${descripcion || ''}`.trim(),
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
        detalles: `${proveedor || 'Gasto'} · ${numTotal.toFixed(2)} ${moneda || 'VES'} · ${categoria || 'repuestos'} · Ref ${comprobante || 'N/A'}`,
        referencia_tabla: 'egresos',
        referencia_id: egreso.id,
        sede_id: sedeId,
      });

      await anotarAccion(auth.db, { ...ctx, caso: 'pago_sin_gasto', accion: 'registrar_egreso', fecha: fecha || null, monto: numTotal, referencia: comprobante || ctx.referencia,
        despues: { proveedor: proveedor || 'Gasto Operativo', categoria: categoria || 'repuestos', cuenta: ctaMetodo }, tasa: tasaInfo, tabla: 'egresos', registroId: egreso.id });
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
