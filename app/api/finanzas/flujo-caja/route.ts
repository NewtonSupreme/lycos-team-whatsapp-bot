import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { cargarDatosCaja, construirFlujo, leerCuentas, saldoAl, type CuentaCaja } from '@/lib/caja/flujo';

export const dynamic = 'force-dynamic';

/*
 * Flujo de caja por cuenta (Binance, Zelle, efectivo, bancos).
 *
 *   GET  ?cuenta=<id>&desde=&hasta=   → el día a día de esa cuenta + el saldo de todas
 *   POST { accion: 'configurar_saldo' | 'movimiento' | 'anular_movimiento' | 'arqueo', … }
 *
 * El saldo se calcula (saldo inicial + entradas − salidas, día a día); lo que se guarda es
 * el punto de partida, los movimientos que no son venta ni gasto, y las verificaciones del
 * saldo real. Nada se borra: un movimiento se anula con motivo, y cada cambio del saldo
 * inicial queda con el valor de antes.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
const masDias = (f: string, k: number) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

const BIN_DEL_BANCO: Record<string, string> = { banesco: 'pago_movil_banesco', bnc: 'bnc', bnc_cuotas: 'bnc', exterior: 'pago_movil_exterior' };

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.can('ventas', 'leer')) return NextResponse.json({ error: 'Sin permiso para ver las finanzas.' }, { status: 403 });

  const u = new URL(req.url);
  const sede = auth.effectiveSede(u.searchParams.get('sede'));
  const hasta = FECHA.test(u.searchParams.get('hasta') || '') ? u.searchParams.get('hasta')! : hoyCaracas();
  const desdeP = u.searchParams.get('desde') || '';
  const desde = FECHA.test(desdeP) ? desdeP : masDias(hasta, -30);
  const cuentaId = u.searchParams.get('cuenta');

  try {
    const cuentas = await leerCuentas(auth.db, sede);
    if (!cuentas.length) return NextResponse.json({ cuentas: [], flujo: null });
    const arranque = cuentas.reduce((m, c) => (c.desde < m ? c.desde : m), cuentas[0].desde);
    const datos = await cargarDatosCaja(auth.db, { sede, desde: arranque, hasta, cuentas });

    // El saldo de todas las cuentas al final del período (para elegir y comparar).
    const resumen = cuentas.map(c => {
      const f = construirFlujo(c, datos, { desde: hasta, hasta });
      return { id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, bin: c.bin, saldoInicial: c.saldo_inicial, desde: c.desde, saldo: f.saldoFinal, configurada: c.saldo_inicial !== 0 };
    });

    let flujo = null as ReturnType<typeof construirFlujo> | null;
    let historial: unknown[] = []; let estadoBanco: unknown = null; let arqueos: unknown[] = [];
    const cuenta = cuentaId ? cuentas.find(c => c.id === cuentaId) : null;
    if (cuenta) {
      flujo = construirFlujo(cuenta, datos, { desde, hasta });
      const [h, a] = await Promise.all([
        auth.db.from('cuentas_saldo_historial').select('*').eq('cuenta_id', cuenta.id).order('created_at', { ascending: false }).limit(30),
        auth.db.from('arqueos_caja').select('*').eq('cuenta_id', cuenta.id).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(60),
      ]);
      historial = h.data || []; arqueos = a.data || [];

      // Si es un banco con estado de cuenta conciliado: su saldo según el banco, contra el del sistema ese día.
      const bancos = Object.entries(BIN_DEL_BANCO).filter(([, b]) => b === cuenta.bin).map(([k]) => k);
      if (bancos.length) {
        const { data: corridas } = await auth.db.from('conciliacion_corridas').select('banco, desde, hasta, created_at, resumen, archivo')
          .in('banco', bancos).order('hasta', { ascending: false }).order('created_at', { ascending: false }).limit(1);
        const c = corridas?.[0];
        const s = c?.resumen?.saldos as { inicial?: number | null; final?: number | null; desde?: string; hasta?: string } | undefined;
        if (c && s && s.final != null && s.hasta) {
          const sistema = saldoAl(cuenta, datos, s.hasta);
          estadoBanco = { banco: c.banco, archivo: c.archivo, desde: s.desde, hasta: s.hasta, saldoInicialBanco: s.inicial ?? null, saldoFinalBanco: s.final, saldoSistema: sistema, diferencia: r2(Number(s.final) - sistema), conciliada: c.created_at };
        }
      }
    }
    return NextResponse.json({ desde, hasta, cuentas: resumen, flujo, historial, arqueos, estadoBanco }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo calcular el flujo de caja: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize('ventas', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const usuario = auth.user?.nombre || 'Usuario';
  const sede = auth.user?.sede_id || null;
  const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

  const cuentas: CuentaCaja[] = await leerCuentas(auth.db, auth.effectiveSede(null)).catch(() => []);
  const cuenta = cuentas.find(c => c.id === String(b.cuenta_id || ''));
  if (!cuenta && b.accion !== 'anular_movimiento') return err('Elige la cuenta.');

  try {
    // ── Saldo inicial: el punto de partida de la cuenta ─────────────────────
    if (b.accion === 'configurar_saldo' && cuenta) {
      const nuevo = r2(Number(b.saldo_inicial));
      const desde = String(b.desde || '');
      if (!Number.isFinite(nuevo)) return err('El saldo inicial debe ser un número.');
      if (!FECHA.test(desde)) return err('Indica desde qué día cuenta ese saldo.');
      if (desde > hoyCaracas()) return err('La fecha de arranque no puede ser futura.');
      const { error } = await auth.db.from('cuentas_financieras').update({ saldo_inicial: nuevo, desde, updated_at: new Date().toISOString() }).eq('id', cuenta.id);
      if (error) return err(error.message, 500);
      await auth.db.from('cuentas_saldo_historial').insert({
        cuenta_id: cuenta.id, saldo_anterior: cuenta.saldo_inicial, saldo_nuevo: nuevo, desde_anterior: cuenta.desde, desde_nuevo: desde,
        motivo: String(b.motivo || '').trim() || null, usuario,
      });
      await logActivityServer(auth.db, { usuario, modulo: 'Finanzas', accion: 'Configuró el saldo inicial de una cuenta', detalles: `${cuenta.nombre}: ${cuenta.saldo_inicial} (${cuenta.desde}) → ${nuevo} (${desde})`, referencia_tabla: 'cuentas_financieras', referencia_id: cuenta.id, sede_id: sede });
      return NextResponse.json({ ok: true });
    }

    // ── Movimiento manual ───────────────────────────────────────────────────
    if (b.accion === 'movimiento' && cuenta) {
      const monto = r2(Number(b.monto));
      const fecha = String(b.fecha || hoyCaracas());
      const concepto = String(b.concepto || '').trim();
      if (!(monto > 0)) return err('El monto debe ser mayor a cero.');
      if (!FECHA.test(fecha)) return err('Fecha inválida.');
      if (fecha < cuenta.desde) return err(`La cuenta arranca el ${cuenta.desde}: un movimiento anterior no se sumaría al saldo.`);
      if (b.sentido !== 'entrada' && b.sentido !== 'salida') return err('Indica si es entrada o salida.');
      if (!concepto) return err('Escribe el concepto.');
      const { data, error } = await auth.db.from('movimientos_caja').insert({
        fecha, cuenta_id: cuenta.id, sentido: b.sentido, monto, concepto,
        categoria: String(b.categoria || '').trim() || null, contraparte: String(b.contraparte || '').trim() || null,
        referencia: String(b.referencia || '').trim() || null, tasa: Number(b.tasa) > 0 ? Number(b.tasa) : null,
        notas: String(b.notas || '').trim() || null, usuario, sede_id: sede,
      }).select('id').single();
      if (error) return err(error.message, 500);
      await logActivityServer(auth.db, { usuario, modulo: 'Finanzas', accion: `Registró ${b.sentido} de caja`, detalles: `${cuenta.nombre} · ${monto} ${cuenta.moneda} · ${concepto}`, referencia_tabla: 'movimientos_caja', referencia_id: data.id, sede_id: sede });
      return NextResponse.json({ ok: true, id: data.id });
    }

    // ── Anular un movimiento manual (nada se borra) ─────────────────────────
    if (b.accion === 'anular_movimiento') {
      const motivo = String(b.motivo || '').trim();
      if (!motivo) return err('Escribe por qué se anula.');
      const { data: m } = await auth.db.from('movimientos_caja').select('id, anulado, concepto, monto').eq('id', String(b.id || '')).maybeSingle();
      if (!m) return err('Ese movimiento no existe.', 404);
      if (m.anulado) return err('Ese movimiento ya estaba anulado.', 409);
      const { error } = await auth.db.from('movimientos_caja').update({ anulado: true, anulado_por: usuario, anulado_motivo: motivo, anulado_en: new Date().toISOString() }).eq('id', m.id);
      if (error) return err(error.message, 500);
      await logActivityServer(auth.db, { usuario, modulo: 'Finanzas', accion: 'Anuló un movimiento de caja', detalles: `${m.concepto} · ${m.monto} · ${motivo}`, referencia_tabla: 'movimientos_caja', referencia_id: m.id, sede_id: sede });
      return NextResponse.json({ ok: true });
    }

    // ── Arqueo: el saldo REAL que alguien verificó ──────────────────────────
    if (b.accion === 'arqueo' && cuenta) {
      const real = r2(Number(b.saldo_real));
      const fecha = String(b.fecha || hoyCaracas());
      if (!Number.isFinite(real)) return err('El saldo real debe ser un número.');
      if (!FECHA.test(fecha)) return err('Fecha inválida.');
      const datos = await cargarDatosCaja(auth.db, { sede: auth.effectiveSede(null), desde: cuenta.desde, hasta: fecha, cuentas: [cuenta] });
      const sistema = saldoAl(cuenta, datos, fecha);
      const { data, error } = await auth.db.from('arqueos_caja').insert({
        fecha, cuenta_id: cuenta.id, saldo_real: real, saldo_sistema: sistema, diferencia: r2(real - sistema),
        origen: String(b.origen || 'manual'), nota: String(b.nota || '').trim() || null, usuario, sede_id: sede,
      }).select('id').single();
      if (error) return err(error.message, 500);
      await logActivityServer(auth.db, { usuario, modulo: 'Finanzas', accion: 'Verificó el saldo de una cuenta', detalles: `${cuenta.nombre} al ${fecha}: real ${real} · sistema ${sistema} · dif ${r2(real - sistema)}`, referencia_tabla: 'arqueos_caja', referencia_id: data.id, sede_id: sede });
      return NextResponse.json({ ok: true, saldoSistema: sistema, diferencia: r2(real - sistema) });
    }

    return err(`Acción desconocida: ${String(b.accion)}`);
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
