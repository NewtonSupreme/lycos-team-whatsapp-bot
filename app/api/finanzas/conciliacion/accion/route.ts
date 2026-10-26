import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { registrarCobro } from '@/lib/pagos/registrar-cobro';
import { buildCategoriaColumns, buildPagoColumnsCompletas, inferirCategoria } from '@/lib/categorias';
import type { JustificacionConciliacion } from '@/lib/conciliacion/motor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authorize('ventas', 'crear');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { accion } = body;

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

      let tasa = Number(tasaUser) || 0;
      if (!tasa && !enDolares) {
        const { data: tData } = await auth.db.from('tasas_bcv').select('bcv').order('fecha', { ascending: false }).limit(1).maybeSingle();
        tasa = Number(tData?.bcv) || 1;
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

      return NextResponse.json({ ok: true, abono: res.abono });
    }

    // ── 5. REGISTRAR EGRESO / GASTO DIRECTO DESDE CONCILIACIÓN ──────────────
    if (accion === 'registrar_egreso') {
      const { proveedor, categoria, total_egresos, moneda, cuenta, fecha, descripcion, comprobante, tasa: tasaUser } = body;
      const numTotal = Number(total_egresos);
      if (!numTotal || numTotal <= 0) return NextResponse.json({ error: 'El monto del gasto debe ser mayor a cero.' }, { status: 400 });

      // Resolver la tasa si no viene y la moneda es Bs (para poder convertir a USD).
      let tasa = Number(tasaUser) || 0;
      if (!tasa && (moneda === 'VES' || moneda === 'Bs' || !moneda)) {
        const { data: tData } = await auth.db.from('tasas_bcv').select('bcv').order('fecha', { ascending: false }).limit(1).maybeSingle();
        tasa = Number(tData?.bcv) || 0;
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

      return NextResponse.json({ ok: true, egreso });
    }

    return NextResponse.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
