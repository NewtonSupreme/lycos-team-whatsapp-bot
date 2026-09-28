import {
  BANK_BIN_IDS, BANK_METHODS, binsTotalUSD, emptyBins, type BankBin, type Bins,
} from '@/lib/reporte/ventas-mapping';

/**
 * ¿Cuadra el dinero?
 *
 * Una venta dice tres cosas que tienen que coincidir: lo que costó (total, con
 * o sin IVA), lo que entró por cada cuenta y lo que quedó debiendo. Cuando no
 * coinciden, el reporte del día miente sin que nadie lo note: así aparecieron
 * los $130 fantasma, y así seguían apareciendo pagos móviles contados dos veces
 * —el mismo importe en Banesco y en Banco Exterior— porque al corregir una
 * venta la cuenta vieja se quedaba con su dinero.
 *
 * Aquí están las reglas, sin base de datos, para poder probarlas y para que la
 * pantalla de cuadre y la auditoría digan exactamente lo mismo.
 *
 * Solo se propone una corrección automática cuando hay UNA explicación y, al
 * aplicarla, la venta cuadra al céntimo razonable. Todo lo demás se enseña para
 * que lo decida una persona: el sistema no puede saber si el cliente pagó de
 * más o si alguien tecleó mal.
 */

export type TipoHallazgo =
  | 'cuenta_duplicada'
  | 'tasa_sospechosa'
  | 'cobro_de_mas'
  | 'cobro_de_menos'
  | 'estado_incoherente'
  | 'deuda_fuera_de_cobranza'
  | 'pagada_sin_registro'
  | 'saldo_mayor_que_total'
  | 'iva_sin_marcar'
  | 'orden_distinta'
  | 'egreso_no_cuadra'
  | 'egreso_con_cuenta_sin_pagar';

export interface Correccion {
  /** Columnas de `ventas_dia` (o de `egresos`) a escribir. */
  cambios: Record<string, number | string | null>;
  /** Además, copiar el cobro corregido a la orden. */
  aOrden?: Record<string, number>;
  /** Qué se va a hacer, en palabras. */
  explicacion: string;
  /**
   * Hay una sola explicación y con ella la venta cuadra: se puede aplicar en
   * bloque. Si es `false` es una propuesta y la confirma una persona.
   */
  segura: boolean;
  /**
   * Además, registrar un cobro sin método en `abonos`: la venta se dio por
   * pagada ese día pero nadie anotó por dónde entró el dinero.
   */
  cobroSinMetodo?: { monto: number; fecha: string };
}

export interface Hallazgo {
  tipo: TipoHallazgo;
  gravedad: 'alta' | 'media' | 'baja';
  detalle: string;
  /** Cuánto dinero está en juego, en dólares. */
  diferenciaUSD: number;
  correccion?: Correccion;
}

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const usd = (n: number) => `$${r2(n).toFixed(2)}`;
const nombre = (id: string) => BANK_METHODS.find(m => m.id === id)?.label || id;

/** Las diez cuentas de una fila de `ventas_dia`. */
export function binsDeFila(v: Record<string, unknown>): Bins {
  const b = emptyBins();
  for (const id of BANK_BIN_IDS) b[id] = r2(v[id]);
  return b;
}

/** Margen para no llamar descuadre a los decimales de una tasa: $1 o el 2%. */
export const margen = (esperado: number) => Math.max(1, Math.abs(esperado) * 0.02);

/**
 * Lo que la venta dice que debía entrar HOY, en dólares.
 *
 * El total con su IVA menos lo que quedó debiendo. Con Cashea el saldo ya
 * incluye lo financiado, así que la misma cuenta vale. Las filas viejas de
 * Cashea —el importe completo metido en la cuenta, sin porcentaje— no se
 * pueden comprobar así y devuelven `null`.
 */
export function esperadoUSD(v: Record<string, unknown>): number | null {
  const bins = binsDeFila(v);
  const legadoCashea = bins.cashea > 0 && (v.cashea_pct === null || v.cashea_pct === undefined);
  if (legadoCashea) return null;
  const total = r2(v.total_ingresos) * (v.con_iva ? 1.16 : 1);
  return r2(total - r2(v.saldo_pendiente));
}

/** Las cuentas que la venta nombra en su `metodos_pago` con clave exacta. */
function cuentasNombradas(v: Record<string, unknown>): BankBin[] {
  const mp = v.metodos_pago;
  if (!mp || typeof mp !== 'object') return [];
  return Object.entries(mp as Record<string, unknown>)
    .filter(([k, val]) => (BANK_BIN_IDS as string[]).includes(k) && Number(val) > 0)
    .map(([k]) => k as BankBin);
}

export function revisarVenta(v: Record<string, unknown>, tasaDelDia = 0): Hallazgo[] {
  const out: Hallazgo[] = [];
  const bins = binsDeFila(v);
  const conDinero = BANK_BIN_IDS.filter(id => bins[id] > 0);
  // Una venta sin columnas es de antes del desglose por banco: no hay con qué
  // comprobarla, y no es un descuadre.
  if (conDinero.length === 0) return out;

  const tasa = Number(v.tasa_cambio) || Number(v.tasa) || 0;
  const esperado = esperadoUSD(v);
  // Lo cobrado otros días (abonos) también es dinero de esta venta: sin
  // sumarlo, toda venta abonada parecería que le falta dinero.
  const despues = r2(v.cobrado_despues);
  const recibido = r2(binsTotalUSD(bins, tasa) + despues);
  const cuadra = (b: Bins, t: number) => esperado !== null
    && Math.abs(binsTotalUSD(b, t) + despues - esperado) <= margen(esperado);

  // ── 1. El mismo importe en dos cuentas ─────────────────────────────────
  for (let i = 0; i < conDinero.length; i++) {
    for (let j = i + 1; j < conDinero.length; j++) {
      const a = conDinero[i];
      const b = conDinero[j];
      if (Math.abs(bins[a] - bins[b]) > 0.01) continue;
      const nombradas = cuentasNombradas(v);
      // La buena es la que la venta nombra; la otra es el residuo.
      const buena = nombradas.includes(a) && !nombradas.includes(b) ? a
        : nombradas.includes(b) && !nombradas.includes(a) ? b : null;
      const sobra = buena === a ? b : buena === b ? a : null;
      const sin = sobra ? { ...bins, [sobra]: 0 } : null;
      // La venta nombra una sola de las dos: la otra es el residuo de una
      // versión anterior, cuadre o no el resto. Si después sigue habiendo una
      // diferencia, sale aparte en la próxima revisión.
      const seguro = Boolean(sin);
      out.push({
        tipo: 'cuenta_duplicada',
        gravedad: 'alta',
        detalle: `El mismo cobro está en ${nombre(a)} y en ${nombre(b)} `
          + `(${bins[a].toLocaleString('es-VE')} cada una): el reporte lo cuenta dos veces.`,
        diferenciaUSD: binsTotalUSD({ ...emptyBins(), [a]: bins[a] }, tasa),
        correccion: seguro && sobra && sin ? {
          cambios: { [sobra]: 0 },
          aOrden: sin as unknown as Record<string, number>,
          explicacion: `Dejar el cobro solo en ${nombre(buena!)}, que es la cuenta que la venta registró, y poner ${nombre(sobra)} en cero.`,
          segura: true,
        } : undefined,
      });
    }
  }
  if (out.length) return out;   // lo demás se lee mal hasta quitar el duplicado

  // ── 2. La tasa por defecto o una tasa de otro día ──────────────────────
  const hayBs = conDinero.some(id => BANK_METHODS.find(m => m.id === id)?.moneda === 'Bs');
  if (hayBs && tasaDelDia > 0 && tasa > 0 && Math.abs(tasa - tasaDelDia) / tasaDelDia > 0.1) {
    const arregla = cuadra(bins, tasaDelDia) && !cuadra(bins, tasa);
    out.push({
      tipo: 'tasa_sospechosa',
      gravedad: arregla ? 'alta' : 'media',
      detalle: `Los bolívares se convirtieron a ${tasa} Bs/$ y ese día el BCV estaba en ${r2(tasaDelDia)}. `
        + `Con su tasa la venta dice que entraron ${usd(recibido)}; con la del día, ${usd(binsTotalUSD(bins, tasaDelDia))}.`,
      diferenciaUSD: Math.abs(recibido - binsTotalUSD(bins, tasaDelDia)),
      correccion: arregla ? {
        cambios: { tasa_cambio: r2(tasaDelDia) },
        explicacion: `Guardar la tasa del día (${r2(tasaDelDia)} Bs/$); con ella la venta cuadra.`,
        segura: true,
      } : undefined,
    });
    if (arregla) return out;
  }

  const saldoV = r2(v.saldo_pendiente);

  // ── 0. Debe más de lo que costó ────────────────────────────────────────
  // Pasa cuando un abono se registró como si fuera el total de la venta: el
  // trabajo de $1.400 con abono del 50% quedó como venta de $700 debiendo
  // $1.400. No hay forma segura de saber cuál de los dos números es el bueno.
  {
    const totalCI = r2(r2(v.total_ingresos) * (v.con_iva ? 1.16 : 1));
    if (saldoV > totalCI + margen(totalCI)) {
      const mNota = /Total:\s*\$\s*([\d.,]+)/i.exec(String(v.notas || ''));
      out.push({
        tipo: 'saldo_mayor_que_total', gravedad: 'alta',
        detalle: `La venta es de ${usd(totalCI)} y debe ${usd(saldoV)}.`
          + (mNota ? ` La nota dice que el trabajo era de $${mNota[1]}: probablemente se registró el abono como si fuera el total.` : '')
          + ' Corrígela desde la venta: el total, lo abonado y lo que queda.',
        diferenciaUSD: r2(saldoV - totalCI),
      });
      return out;
    }
  }
  const porCobrar = r2(v.por_cobrar);
  const totalSinIva = r2(v.total_ingresos);
  const totalConIva = r2(totalSinIva * (v.con_iva ? 1.16 : 1));

  // ── 3a. Debe, pero no en la lista de cobro ─────────────────────────────
  // Las ventas viejas guardaban lo pendiente en `por_cobrar` y dejaban el
  // saldo en cero. Cuentas por cobrar lee el saldo, así que esa deuda no
  // aparece en ninguna parte: ni se cobra ni se recuerda.
  if (porCobrar > saldoV + 0.01 && esperado !== null
    && Math.abs(recibido - (totalConIva - porCobrar)) <= margen(totalConIva)) {
    // Alguien la marcó «Pagado completo» ese día, pero el cobro no quedó en
    // ninguna cuenta. Puede ser un pago real sin anotar o una limpieza de
    // pendientes viejos: eso solo lo sabe quien la marcó.
    const fp = String(v.fecha_pago || '').slice(0, 10);
    if (fp && v.estado === 'pagado') {
      out.push({
        tipo: 'pagada_sin_registro', gravedad: 'media',
        detalle: `Se dio por pagada el ${fp.split('-').reverse().join('/')}, pero los ${usd(porCobrar)} que debía `
          + 'no entraron a ninguna cuenta. Si el cliente pagó, confírmalo; si no, reábrela desde Pendientes.',
        diferenciaUSD: porCobrar,
        correccion: {
          cambios: { por_cobrar: 0, financiado: 0 },
          cobroSinMetodo: { monto: porCobrar, fecha: fp },
          explicacion: `Confirmar que pagó los ${usd(porCobrar)} el ${fp.split('-').reverse().join('/')} `
            + '(queda como cobro sin método registrado).',
          segura: false,
        },
      });
      return out;
    }
    out.push({
      tipo: 'deuda_fuera_de_cobranza', gravedad: 'alta',
      detalle: `Entraron ${usd(recibido)} de ${usd(totalConIva)}: quedan ${usd(porCobrar)} por cobrar que `
        + 'no aparecen en Cuentas por cobrar.',
      diferenciaUSD: porCobrar - saldoV,
      correccion: {
        cambios: { saldo_pendiente: porCobrar, estado: 'pendiente' },
        explicacion: `Pasar los ${usd(porCobrar)} a Cuentas por cobrar. Si ya los pagó, registra el abono desde la venta.`,
        segura: false,
      },
    });
    return out;
  }

  // ── 3b. Se cobró con IVA y no está marcado ─────────────────────────────
  if (!v.con_iva && esperado !== null && Math.abs(recibido - esperado) > margen(esperado)
    && Math.abs(recibido - (totalSinIva * 1.16 - saldoV)) <= margen(totalSinIva * 1.16)) {
    out.push({
      tipo: 'iva_sin_marcar', gravedad: 'media',
      detalle: `Entraron ${usd(recibido)}: justo el precio con el 16% de IVA, pero la venta no lo tiene marcado.`,
      diferenciaUSD: r2(totalSinIva * 0.16),
      correccion: {
        cambios: { con_iva: 'true', iva: r2(totalSinIva * 0.16) },
        explicacion: 'Marcar la venta con IVA: el dinero que entró es el precio más el 16%.',
        segura: true,
      },
    });
    return out;
  }

  // ── 3c. El dinero entró completo y el saldo sigue puesto ──────────────
  if (saldoV > 0.01 && Math.abs(recibido - totalConIva) <= margen(totalConIva)) {
    out.push({
      tipo: 'estado_incoherente', gravedad: 'alta',
      detalle: `Entraron los ${usd(recibido)} completos, pero la venta sigue debiendo ${usd(saldoV)}: `
        + 'aparece dos veces, como cobrada y como pendiente.',
      diferenciaUSD: saldoV,
      correccion: {
        cambios: { saldo_pendiente: 0, por_cobrar: 0, estado: 'pagado' },
        explicacion: 'Saldar la venta: el dinero ya está en las cuentas.',
        // Unos céntimos de saldo con el cobro completo son redondeo de la tasa.
        segura: saldoV < 1,
      },
    });
    return out;
  }

  // ── 3. Entró más o menos de lo que la venta dice ───────────────────────
  if (esperado !== null && Math.abs(recibido - esperado) > margen(esperado)) {
    const de = recibido > esperado;
    out.push({
      tipo: de ? 'cobro_de_mas' : 'cobro_de_menos',
      gravedad: 'media',
      detalle: de
        ? `Entraron ${usd(recibido)} y la venta solo pedía ${usd(esperado)}: sobran ${usd(recibido - esperado)}. `
          + '¿Precio mal puesto, monto mal tecleado o propina?'
        : `Entraron ${usd(recibido)} de ${usd(esperado)}: faltan ${usd(esperado - recibido)} que no están ni cobrados ni como saldo pendiente.`,
      diferenciaUSD: Math.abs(recibido - esperado),
    });
  }

  // ── 4. «Pagado» debiendo, o «pendiente» sin deber nada ─────────────────
  const saldo = saldoV;
  if (v.estado === 'pagado' && saldo > 0.01) {
    // Si lo cobrado es justo el total menos el saldo, el dinero confirma la
    // deuda: la etiqueta es lo único que está mal. Pasa sobre todo con Cashea,
    // donde el saldo es lo financiado.
    const confirmaDeuda = esperado !== null && Math.abs(recibido - esperado) <= margen(esperado);
    out.push({
      tipo: 'estado_incoherente', gravedad: 'media',
      detalle: `Está marcada como pagada pero conserva un saldo pendiente de ${usd(saldo)}.`
        + (confirmaDeuda ? ` Lo cobrado (${usd(recibido)}) confirma que ese saldo se debe.` : ''),
      diferenciaUSD: saldo,
      correccion: confirmaDeuda ? {
        cambios: { estado: 'pendiente' },
        explicacion: `Marcarla como pendiente: se deben ${usd(saldo)}${r2(v.cashea) > 0 || v.cashea_pct != null ? ' (lo financia Cashea)' : ''}.`,
        segura: true,
      } : undefined,
    });
  } else if (v.estado === 'pendiente' && saldo <= 0.01) {
    out.push({
      tipo: 'estado_incoherente', gravedad: 'baja',
      detalle: 'Está marcada como pendiente pero no debe nada.',
      diferenciaUSD: 0,
      correccion: {
        cambios: { estado: 'pagado' },
        explicacion: 'Marcarla como pagada: no queda saldo.',
        segura: true,
      },
    });
  }

  // ── 5. La orden dice otra cosa ────────────────────────────────────────
  const om = v.orden_metodos as Record<string, unknown> | null | undefined;
  if (om && typeof om === 'object') {
    const ob = emptyBins();
    for (const id of BANK_BIN_IDS) ob[id] = r2(om[id]);
    const distinta = BANK_BIN_IDS.some(id => Math.abs(ob[id] - bins[id]) > 0.01);
    if (distinta && BANK_BIN_IDS.some(id => ob[id] > 0)) {
      out.push({
        tipo: 'orden_distinta', gravedad: 'baja',
        detalle: 'La orden de servicio guarda un cobro distinto al de la venta: al reabrirla se vería otro.',
        diferenciaUSD: Math.abs(binsTotalUSD(ob, tasa) - recibido),
        correccion: {
          cambios: {},
          aOrden: bins as unknown as Record<string, number>,
          explicacion: 'Copiar a la orden el cobro de la venta, que es el que suma el reporte.',
          segura: true,
        },
      });
    }
  }

  return out;
}

/** Un gasto: lo pagado según su estado contra lo que dicen sus cuentas. */
export function revisarEgreso(e: Record<string, unknown>): Hallazgo[] {
  const out: Hallazgo[] = [];
  const mp = e.metodos_pago;
  if (!mp || typeof mp !== 'object') return out;
  const bins = emptyBins();
  for (const id of BANK_BIN_IDS) bins[id] = r2((mp as Record<string, unknown>)[id]);
  if (!BANK_BIN_IDS.some(id => bins[id] > 0)) return out;

  const total = r2(e.total_egresos);
  const estado = String(e.estado_pago || 'pagado');
  if (estado === 'por_pagar') {
    out.push({
      tipo: 'egreso_con_cuenta_sin_pagar', gravedad: 'media',
      detalle: 'Dice que se debe, pero tiene cuentas de pago: el saldo de esos bancos baja por algo no pagado.',
      diferenciaUSD: binsTotalUSD(bins, Number(e.tasa_cambio) || 0),
    });
    return out;
  }
  const pagado = estado === 'parcial' ? r2(e.monto_pagado) : total;
  const salio = binsTotalUSD(bins, Number(e.tasa_cambio) || 0);
  if (Math.abs(salio - pagado) > margen(pagado)) {
    out.push({
      tipo: 'egreso_no_cuadra', gravedad: 'media',
      detalle: `Según sus cuentas salieron ${usd(salio)} y el gasto dice ${usd(pagado)} pagados.`,
      diferenciaUSD: Math.abs(salio - pagado),
    });
  }
  return out;
}

export const TITULOS: Record<TipoHallazgo, string> = {
  cuenta_duplicada: 'Cobro contado dos veces',
  tasa_sospechosa: 'Tasa de cambio equivocada',
  cobro_de_mas: 'Entró más de lo que se cobró',
  cobro_de_menos: 'Falta dinero',
  estado_incoherente: 'Estado que no cuadra',
  deuda_fuera_de_cobranza: 'Deuda que nadie está cobrando',
  pagada_sin_registro: 'Dada por pagada sin registrar el cobro',
  saldo_mayor_que_total: 'Debe más de lo que costó',
  iva_sin_marcar: 'IVA cobrado sin marcar',
  orden_distinta: 'La orden dice otro pago',
  egreso_no_cuadra: 'Gasto que no cuadra',
  egreso_con_cuenta_sin_pagar: 'Gasto sin pagar con cuenta',
};
