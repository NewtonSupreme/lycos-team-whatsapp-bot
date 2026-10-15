'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeftRight, Banknote, CreditCard, Smartphone, Store, Wallet, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LogoBanco from '@/components/pagos/LogoBanco';
import { metodosConDinero } from '@/lib/pos/metodos-abiertos';
import {
  BANK_METHODS, binToUSD, binsTotalUSD, type BankBin, type Bins,
} from '@/lib/reporte/ventas-mapping';

type Moneda = 'Bs.' | 'USD' | 'EUR';

interface MetodoTile {
  id: string;
  label: string;
  icono: React.ReactNode;
  tinte: string;
  /** Nombre del logo oficial en `public/bancos/`, sin extensión. */
  logo?: string;
  /** Columnas reales de `ventas_dia` a las que cae este método. */
  bins: BankBin[];
}

/**
 * El logo del medio de pago.
 *
 * Prueba el archivo oficial en `public/bancos/` —svg, png y webp, en ese orden—
 * y si no hay ninguno dibuja el símbolo de reserva. Ninguna marca ajena se
 * incluye en el repositorio: el sitio está preparado y el archivo lo pone quien
 * tiene derecho a usarlo.
 */
function LogoMarca({
  archivo, respaldo, onCargado,
}: {
  archivo?: string;
  respaldo: React.ReactNode;
  /** Avisa al mosaico de que hay logo, para que no pinte su fondo debajo. */
  onCargado?: (ok: boolean) => void;
}) {
  const [intento, setIntento] = useState(0);
  const exts = ['svg', 'png', 'webp'];
  if (!archivo || intento >= exts.length) return <>{respaldo}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- el logo es opcional y su carga puede fallar a propósito
    <img
      src={`/bancos/${archivo}.${exts[intento]}`}
      alt=""
      onLoad={() => onCargado?.(true)}
      onError={() => { setIntento(i => i + 1); onCargado?.(false); }}
      // `contain` y no `cover`: los cuadrados —Binance, Cashea— llenan la caja
      // igual, y los redondos —las banderas— conservan su borde en vez de
      // quedar recortados en cuadrado.
      className="h-full w-full object-contain"
    />
  );
}

/**
 * Los nueve métodos del diseño, cada uno apuntando a las columnas reales del
 * reporte diario.
 *
 * Débito, Crédito y Punto de Venta comparten destino porque en el taller las
 * tres cobran por el mismo punto: lo que distingue el dinero es el banco, no el
 * plástico. Por eso al elegir cualquiera de las tres se pide el banco.
 */
const METODOS: readonly MetodoTile[] = [
  { id: 'efectivo', label: 'Efectivo', icono: <Banknote className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e8f7ee] text-[#16a34a]', bins: ['dolares', 'efectivo_bs'] },
  { id: 'pago_movil', label: 'Pago Móvil', icono: <Smartphone className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]', bins: ['pago_movil_banesco', 'bnc', 'pago_movil_exterior', 'punto_bancamiga'] },
  { id: 'transferencia', label: 'Transferencia', icono: <ArrowLeftRight className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#f0eafc] text-[#7c3aed]', bins: ['pago_movil_banesco', 'bnc', 'pago_movil_exterior'] },
  { id: 'debito', label: 'Tarjeta Débito', icono: <CreditCard className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e7f0fe] text-[#2563eb]', bins: ['punto_banesco', 'punto_bancamiga'] },
  { id: 'credito', label: 'Tarjeta Crédito', icono: <CreditCard className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#fdeaea] text-[#dc2626]', bins: ['punto_banesco', 'punto_bancamiga'] },
  { id: 'zelle', label: 'Zelle', icono: <ZelleGlyph />, tinte: 'bg-[#f0eafc] text-[#7c3aed]', logo: 'zelle', bins: ['zelle'] },
  { id: 'binance', label: 'Binance Pay', icono: <BinanceGlyph />, tinte: 'bg-[#fdf5e2] text-[#eab308]', logo: 'binance', bins: ['binance'] },
  // Lo que se cobra por Cashea cae en la cuenta del BNC: se nombra así en todas
  // partes para que nadie lo busque en un banco que no existe.
  { id: 'cashea', label: 'Cashea / BNC', icono: <CasheaGlyph />, tinte: 'bg-[#fdf5e2] text-[#eab308]', logo: 'cashea', bins: ['cashea'] },
  { id: 'pdv', label: 'Punto de Venta', icono: <Store className="h-[18px] w-[18px]" aria-hidden />, tinte: 'bg-[#e4f6f6] text-[#0d9488]', bins: ['punto_banesco', 'punto_bancamiga'] },
];

// El 0% es un plan real de Cashea: aprueban sin inicial y el taller no cobra
// nada ese dia. Faltaba en la lista.
const PORCENTAJES = [0, 10, 20, 30, 40, 50, 60] as const;

const TASAS = [
  { id: 'bcv' as const, label: 'BCV', ayuda: 'Tasa oficial del Banco Central. Es la que corresponde a lo que va en factura fiscal.' },
  { id: 'binance' as const, label: 'Binance P2P', ayuda: 'Tasa del mercado P2P, la que se usa al cobrar por cripto o al paralelo.' },
  { id: 'euro' as const, label: 'Euro', ayuda: 'Cambio del euro del BCV, en Bs por €. Al elegirlo, el panel pasa a mostrarse en euros.' },
];

interface Props {
  bins: Bins;
  onBinsChange: (b: Bins) => void;
  totalUSD: number;
  subtotalUSD: number;
  tasa: number;
  /** Tasa automática del día, para el marcador del campo de tasa manual. */
  tasaAuto?: number;
  customRate?: number | null;
  onCustomRate?: (v: number | null) => void;
  /**
   * Financiamiento con Cashea. Solo lo trae el punto de venta, que es donde se
   * calcula la inicial y las cuotas. Sin esto, Cashea sigue siendo un método
   * más: se escribe el monto y ya, sin el simulador de cuotas.
   */
  cashea?: {
    pct: number;
    onPct: (p: 0 | 10 | 20 | 30 | 40 | 50 | 60) => void;
    activo: boolean;
    onUsar: () => void;
    inicial: number;
    resto: number;
    cuota: number;
    /** Cuántas cuotas van después de la inicial. Hoy el sistema cobra tres. */
    cuotas: number;
  };
  /** Encabezado propio del panel. El anfitrión puede poner el suyo. */
  conCabecera?: boolean;
  /**
   * Si el panel se desplaza por dentro. En el POS sí, porque ocupa una columna
   * de alto fijo. Dentro de un modal NO: una caja con scroll propio dentro de
   * otra deja media pantalla inalcanzable, que es justo el corte que ya hubo
   * que arreglar en el resto del sistema.
   */
  desplazable?: boolean;
  /**
   * Una orden o un gasto YA guardado sin pago: no se marca ningún método.
   *
   * Sin esto el panel abría siempre con «Efectivo» señalado, y una orden
   * reabierta sin cobro decía que se había pagado en efectivo.
   */
  sinPreseleccion?: boolean;
  /** Métodos que no aplican aquí; a un proveedor no se le paga con Cashea. */
  ocultarMetodos?: readonly string[];
  /**
   * El sentido del dinero. `cobro` es lo que entra (ventas); `pago`, lo que
   * sale (egresos): cambia «Recibido» por «Pagado» y el título de la tasa.
   */
  sentido?: 'cobro' | 'pago';
  className?: string;
}

export default function MetodoPagoPanel({
  bins, onBinsChange, totalUSD, subtotalUSD, tasa, tasaAuto,
  customRate = null, onCustomRate, cashea, conCabecera = true, desplazable = true,
  sinPreseleccion = false, ocultarMetodos = [], sentido = 'cobro', className,
}: Props) {
  const casheaActivo = cashea?.activo ?? false;
  const esPago = sentido === 'pago';
  const metodosVisibles = useMemo(
    () => METODOS.filter(m => !ocultarMetodos.includes(m.id)),
    // La lista llega como literal en cada render; se compara por contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ocultarMetodos.join(',')],
  );
  // Un cobro repartido entre dos métodos se reabre en «mixto»: en «completo»
  // elegir cualquier método borra los demás, y bastaba tocar uno para perder
  // la mitad del pago guardado.
  const [modo, setModo] = useState<'completo' | 'mixto'>(
    () => (metodosConDinero(bins, casheaActivo, []).length > 1 ? 'mixto' : 'completo'),
  );
  const [moneda, setMoneda] = useState<Moneda>('Bs.');
  // Null mientras el usuario no elija: así el panel puede seguir al cobro.
  const [monedaManual, setMonedaManual] = useState<Moneda | null>(null);
  // Se calcula al montar, a partir del cobro que ya traiga la orden. Después
  // manda el usuario: recalcularlo en cada render le cerraría en la cara el
  // grupo que acaba de abrir para escribir.
  const [abiertos, setAbiertos] = useState<readonly string[]>(
    () => metodosConDinero(bins, casheaActivo, sinPreseleccion ? [] : ['efectivo']),
  );

  // El pago puede llegar DESPUÉS de montar el panel —una orden que termina de
  // cargar, la venta que se lee del servidor—. El estado inicial ya se había
  // calculado con las cuentas vacías, así que el método con dinero quedaba sin
  // marcar. Aquí se abre; nunca se cierra nada que el usuario haya abierto.
  const conDinero = metodosConDinero(bins, casheaActivo, []).join(',');
  useEffect(() => {
    if (!conDinero) return;
    const faltan = conDinero.split(',').filter(id => !abiertos.includes(id));
    if (faltan.length === 0) return;
    setAbiertos(a => {
      // Un pago que llega con dinero manda sobre el «Efectivo» que se puso por
      // defecto mientras no había nada.
      const base = a.length === 1 && a[0] === 'efectivo' && !conDinero.split(',').includes('efectivo') ? [] : a;
      return [...new Set([...base, ...faltan])];
    });
    if (conDinero.split(',').length > 1) setModo('mixto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conDinero]);
  // Qué métodos tienen su logo oficial disponible. Se sabe al cargarlo, no antes.
  const [conLogo, setConLogo] = useState<Record<string, boolean>>({});
  const [tasasDia, setTasasDia] = useState({ bcv: 0, binance: 0, euro: 0, eur: 0 });

  // Las tasas del día se piden aquí y no se reciben por props: así el selector
  // muestra lo mismo esté donde esté el panel, sin que cada pantalla tenga que
  // acordarse de pasárselas.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch('/api/rates').then(r => r.json()).catch(() => ({})),
      fetch('/api/nomina/rates').then(r => r.json()).catch(() => ({})),
    ]).then(([m, n]) => {
      if (!vivo) return;
      const bcv = Number(m?.bcv) || 0;
      const eurPorUsd = Number(n?.eur_per_usd) || 0;
      setTasasDia({
        bcv,
        binance: Number(m?.binance) || 0,
        // Bs por euro. Sale del BCV dividido entre los euros que da un dólar.
        euro: eurPorUsd > 0 ? Math.round((bcv / eurPorUsd) * 100) / 100 : 0,
        eur: eurPorUsd,
      });
    });
    return () => { vivo = false; };
  }, []);

  const pagadoUSD = binsTotalUSD(bins, tasa);

  /**
   * La moneda en la que se leen las cifras.
   *
   * Si todo lo cobrado entró en divisa, el resumen se muestra en dólares aunque
   * el panel esté puesto en bolívares: convertir a Bs. un pago que fue en
   * efectivo verde obliga a deshacer la cuenta mentalmente para comprobar el
   * vuelto. El usuario puede cambiarla a mano y entonces manda su elección.
   */
  const hayPago = (Object.keys(bins) as BankBin[]).some(k => (bins[k] || 0) > 0);
  const todoEnDivisa = hayPago && BANK_METHODS
    .filter(m => m.moneda === 'Bs')
    .every(m => (bins[m.id] || 0) === 0);
  const monedaVista: Moneda = monedaManual ?? (todoEnDivisa ? 'USD' : moneda);
  const restanteUSD = Math.round((totalUSD - pagadoUSD) * 100) / 100;

  /** Convierte un monto en dólares a la moneda que se está mostrando. */
  const ver = (usd: number) => {
    const moneda = monedaVista;
    if (moneda === 'Bs.') return `Bs. ${((usd || 0) * tasa).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (moneda === 'EUR') {
      if (tasasDia.eur <= 0) return '—';
      return `€ ${((usd || 0) * tasasDia.eur).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$ ${(usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const setBin = (id: BankBin, valor: number) =>
    onBinsChange({ ...bins, [id]: Math.max(0, Math.round((Number(valor) || 0) * 100) / 100) });

  /**
   * ¿Este monto en dólares son bolívares tecleados por equivocación?
   *
   * Los bins tienen moneda fija: unos guardan bolívares y otros dólares. Nada
   * comprobaba que lo escrito fuera de la moneda del bin, y así entraron tres
   * cobros de Cashea con el monto en bolívares dentro de un bin en dólares
   * ($17.010 en un servicio de $180). El reporte los sumó como dólares e infló
   * las cuentas del mes en más de $44.000.
   *
   * La señal es inequívoca: el importe se parece al total multiplicado por la
   * tasa. No se bloquea el campo —hay ventas grandes legítimas— pero se avisa
   * y se ofrece la corrección en un clic.
   */
  const pareceBolivares = (id: BankBin, monto: number): boolean => {
    const meta = BANK_METHODS.find(m => m.id === id);
    if (!meta || meta.moneda !== 'USD') return false;
    if (!(tasa > 0) || !(totalUSD > 0) || !(monto > 0)) return false;
    // Diez veces el total ya no es un descuadre, es otra moneda.
    if (monto < totalUSD * 10) return false;
    const enDolares = monto / tasa;
    // Y al dividirlo por la tasa vuelve a parecerse al total a cobrar.
    return enDolares <= totalUSD * 1.5;
  };

  const limpiarBins = (ids: readonly BankBin[], base: Bins = bins) => {
    const out = { ...base };
    ids.forEach(id => { out[id] = 0; });
    return out;
  };

  /** Carga en un bin lo que falte por cobrar, en la moneda de ese bin. */
  const saldar = (id: BankBin) => {
    if (restanteUSD <= 0) return;
    const meta = BANK_METHODS.find(m => m.id === id)!;
    const suma = meta.moneda === 'Bs' ? restanteUSD * (tasa || 0) : restanteUSD;
    setBin(id, (bins[id] || 0) + suma);
  };

  const activo = (id: string) => abiertos.includes(id);

  const elegir = (m: MetodoTile) => {
    if (modo === 'completo') {
      // Un solo método cubre todo: se limpia el resto y se carga el total.
      let base = limpiarBins(BANK_METHODS.map(b => b.id));
      const principal = m.bins[0];
      const meta = BANK_METHODS.find(b => b.id === principal)!;
      base = { ...base, [principal]: meta.moneda === 'Bs' ? totalUSD * (tasa || 0) : totalUSD };
      onBinsChange(base);
      setAbiertos([m.id]);
      if (m.id === 'cashea') cashea?.onUsar();
      return;
    }
    // Mixto: se abre o se cierra, y al cerrar se devuelve a cero lo suyo.
    if (activo(m.id)) {
      onBinsChange(limpiarBins(m.bins));
      setAbiertos(a => a.filter(x => x !== m.id));
    } else {
      setAbiertos(a => [...a, m.id]);
      if (m.id === 'cashea') cashea?.onUsar();
    }
  };

  const quitar = (m: MetodoTile) => {
    onBinsChange(limpiarBins(m.bins));
    setAbiertos(a => a.filter(x => x !== m.id));
  };

  // Con el simulador de cuotas, Cashea tiene su propio recuadro. Sin él —al
  // cobrar una deuda, por ejemplo— es una cuenta más y tiene que verse aquí:
  // si no, el monto cobrado por Cashea quedaba cargado pero invisible.
  const casheaAparte = Boolean(cashea);
  const binsVisibles = useMemo(() => {
    const ids = new Set<BankBin>();
    METODOS.filter(m => abiertos.includes(m.id) && (m.id !== 'cashea' || !casheaAparte))
      .forEach(m => m.bins.forEach(b => ids.add(b)));
    // Todo bin con monto se muestra aunque su método esté cerrado: el dinero
    // cargado nunca puede quedar invisible.
    (Object.keys(bins) as BankBin[]).forEach(b => {
      if (bins[b] > 0 && (b !== 'cashea' || !casheaAparte)) ids.add(b);
    });
    return BANK_METHODS.filter(m => ids.has(m.id));
  }, [abiertos, bins, casheaAparte]);

  const cuadra = Math.abs(restanteUSD) < 0.01;

  return (
    <section className={cn(
      'flex w-full flex-col rounded-xl border border-[#e8eaed] bg-white',
      desplazable && 'min-h-0 flex-1 overflow-hidden',
      className,
    )}>
      {conCabecera && (
      <header className="flex items-center gap-2 border-b border-[#e8eaed] px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fff1e7] text-[#f97316]">
          <Wallet className="h-[15px] w-[15px]" aria-hidden />
        </span>
        <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Método de pago</h2>
        <span className={cn('num rounded-md px-2 py-0.5 text-[11.5px] font-bold', cuadra ? 'bg-[#e8f7ee] text-[#15803d]' : 'bg-[#fdeaea] text-[#dc2626]')}>
          {ver(restanteUSD)}
        </span>
      </header>
      )}

      <div className={cn('px-4 py-3', desplazable && 'min-h-0 flex-1 overflow-y-auto')}>
        {/* Completo o mixto */}
        <div className="flex border-b border-[#e8eaed]" role="tablist">
          {([['completo', 'Pago completo'], ['mixto', 'Pago mixto']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={modo === id}
              onClick={() => setModo(id)}
              className={cn(
                'relative flex-1 py-2 text-[12.5px] font-semibold transition-colors',
                modo === id ? 'text-[#f97316]' : 'text-[#8a909c] hover:text-[#16181d]',
              )}
            >
              {label}
              {modo === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#f97316]" />}
            </button>
          ))}
        </div>

        {/* Moneda de visualización */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Moneda principal</p>
        <div className="grid grid-cols-3 gap-2">
          {(['Bs.', 'USD', 'EUR'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMoneda(m); setMonedaManual(m); }}
              aria-pressed={monedaVista === m}
              title={m === 'EUR' ? 'El euro se muestra como referencia; el cobro se registra en Bs. o $' : undefined}
              className={cn(
                'h-[34px] rounded-lg border text-[12.5px] font-semibold transition-colors',
                monedaVista === m ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Con qué tasa se convierte lo que se cobre en bolívares.
            Hasta ahora se daba por hecho el BCV, pero en el taller se cobra
            tanto al oficial —lo que va en factura fiscal— como al de Binance
            P2P. Si la tasa es la que no era, el reporte del día no cuadra y
            nadie sabe por qué, así que se elige aquí y queda a la vista. */}
        {onCustomRate && (
          <div className="mt-2.5 rounded-lg border border-[#e2e5ea] px-3 py-2">
            <p className="text-[11.5px] font-medium text-[#5b616e]">{esPago ? 'Tasa Bs. de este pago' : 'Tasa Bs. de esta venta'}</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {TASAS.map(t => {
                const valor = tasasDia[t.id];
                const elegida = t.id === 'euro'
                  ? monedaVista === 'EUR'
                  : monedaVista !== 'EUR' && valor > 0 && Math.abs(tasa - valor) < 0.01;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (t.id === 'euro') { setMoneda('EUR'); setMonedaManual('EUR'); onCustomRate(tasasDia.bcv || null); return; }
                      setMoneda('Bs.'); setMonedaManual('Bs.');
                      onCustomRate(valor > 0 ? valor : null);
                    }}
                    disabled={!valor}
                    aria-pressed={t.id === 'euro' ? monedaVista === 'EUR' : elegida && monedaVista !== 'EUR'}
                    title={t.ayuda}
                    className={cn(
                      'rounded-md border px-1.5 py-1 text-left transition-colors disabled:opacity-40',
                      elegida ? 'border-[#f97316] bg-[#fff4ec]' : 'border-[#e2e5ea] hover:bg-[#f6f7f9]',
                    )}
                  >
                    <span className={cn('block text-[10.5px] font-semibold', elegida ? 'text-[#f97316]' : 'text-[#5b616e]')}>
                      {t.label}
                    </span>
                    <span className="num block text-[11px] font-bold text-[#16181d]">
                      {valor > 0 ? valor.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '—'}
                    </span>
                    <span className="block text-[9.5px] text-[#9ba1ab]">{t.id === 'euro' ? 'Bs/€' : 'Bs/$'}</span>
                  </button>
                );
              })}
            </div>
            <label className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#8a909c]">O escribe otra</span>
              <input
                type="number" step="0.01" min="0"
                placeholder={tasaAuto ? `Auto: ${tasaAuto}` : 'Bs por $'}
                title="Una tasa distinta, solo para este cobro."
                value={customRate !== null ? customRate : ''}
                onChange={e => onCustomRate(e.target.value ? parseFloat(e.target.value) : null)}
                className="num h-[28px] w-[104px] rounded-md border border-[#e2e5ea] px-2 text-right text-[12px] font-semibold outline-none focus:border-[#f97316]"
              />
            </label>
            {monedaVista === 'EUR' && (
              <p className="mt-1 text-[10.5px] leading-snug text-[#9ba1ab]">
                Se está leyendo en euros. Lo cobrado en bolívares se sigue convirtiendo al
                cambio del BCV: el euro no es una tasa aparte para los bolívares.
              </p>
            )}
          </div>
        )}

        {/* Métodos */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Método de pago</p>
        {abiertos.length === 0 && (
          <p className="mb-2 rounded-lg border border-dashed border-[#e2e5ea] px-2.5 py-1.5 text-[11px] leading-snug text-[#8a909c]">
            {esPago
              ? 'Todavía no consta cómo se pagó. Elige el método y la cuenta de la que salió el dinero.'
              : 'Esta orden no tiene cobro registrado. Elige cómo pagó el cliente.'}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {metodosVisibles.map(m => {
            const act = activo(m.id);
            return (
              <button
                key={m.id}
                onClick={() => elegir(m)}
                aria-pressed={act}
                className={cn(
                  'relative flex h-[62px] flex-col items-center justify-center gap-1 rounded-lg border transition-colors',
                  act ? 'border-[#f97316] bg-[#fffaf6]' : 'border-[#e8eaed] hover:bg-[#fafbfc]',
                )}
              >
                {act && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Quitar ${m.label}`}
                    onClick={e => { e.stopPropagation(); quitar(m); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); quitar(m); } }}
                    className="absolute -right-1.5 -top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#f97316] text-white"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden />
                  </span>
                )}
                <span className={cn(
                  'flex h-[26px] w-[26px] items-center justify-center overflow-hidden rounded-md',
                  // El tinte del sistema solo se pinta si no hay logo propio.
                  // Con logo real manda el blanco: unos traen fondo propio y
                  // otros son transparentes, y el tinte del sistema debajo de
                  // una marca ajena la ensucia.
                  conLogo[m.id] ? 'bg-white' : m.tinte,
                )}>
                  {/* Si el logo oficial está en /bancos/ se usa ese; si no, el
                      símbolo de reserva. Así basta con dejar el archivo para
                      que aparezca la marca real, sin tocar el código. */}
                  <LogoMarca
                    archivo={m.logo}
                    respaldo={m.icono}
                    onCargado={ok => setConLogo(c => (c[m.id] === ok ? c : { ...c, [m.id]: ok }))}
                  />
                </span>
                <span className="px-1 text-center text-[10.5px] font-medium leading-tight text-[#3d4350]">
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Montos por banco: la clasificación exacta que exige el reporte diario. */}
        {binsVisibles.length > 0 && (
          <>
            <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">{esPago ? '¿De qué cuenta salió?' : 'Montos por banco'}</p>
            <ul className="space-y-1.5">
              {binsVisibles.map(meta => {
                const enBs = pareceBolivares(meta.id, bins[meta.id] || 0);
                return (
                <li key={meta.id} className={cn(
                  'rounded-lg border px-2.5 py-1.5',
                  enBs ? 'border-[#f59e0b] bg-[#fffbeb]' : 'border-[#e8eaed]',
                )}>
                <div className="flex items-center gap-2">
                  {/* Seis cuentas distintas y hay que acertar con la correcta:
                      el dinero en la columna equivocada descuadra el día. */}
                  <LogoBanco id={meta.id} size={22} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[11.5px] font-medium text-[#16181d]">{meta.label}</span>
                    <span className="num block text-[10px] text-[#9ba1ab]">
                      {meta.moneda === 'Bs' ? 'en Bs.' : 'en $'} · ≈ ${binToUSD(meta.id, bins[meta.id] || 0, tasa).toFixed(2)}
                    </span>
                  </span>
                  <input
                    type="number" step="0.01" min="0"
                    value={bins[meta.id] || ''}
                    onChange={e => setBin(meta.id, parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    aria-label={`Monto en ${meta.label}`}
                    className="num h-[30px] w-[92px] shrink-0 rounded-md border border-[#e2e5ea] px-2 text-right text-[12px] font-semibold outline-none focus:border-[#f97316]"
                  />
                  <button
                    onClick={() => saldar(meta.id)}
                    disabled={restanteUSD <= 0}
                    title="Cargar aquí lo que falta"
                    className="h-[30px] shrink-0 rounded-md border border-[#e2e5ea] px-2 text-[10.5px] font-semibold text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-40"
                  >
                    Saldar
                  </button>
                </div>

                {/* Aviso de moneda equivocada. Esta cuenta se lleva en dólares y
                    lo escrito parece bolívares: se ofrece la conversión hecha. */}
                {enBs && (
                  <div className="mt-1.5 flex items-center gap-2 border-t border-[#fcd34d] pt-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#b45309]" aria-hidden />
                    <p className="min-w-0 flex-1 text-[10.5px] leading-tight text-[#92400e]">
                      Esta cuenta se lleva <strong>en dólares</strong> y esto parece bolívares.
                      A la tasa de {tasa.toFixed(2)} serían <strong>${(bins[meta.id] / tasa).toFixed(2)}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => setBin(meta.id, bins[meta.id] / tasa)}
                      className="h-[26px] shrink-0 rounded-md bg-[#b45309] px-2 text-[10.5px] font-bold text-white hover:bg-[#92400e]"
                    >
                      Convertir a $
                    </button>
                  </div>
                )}
                </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Cashea */}
        {cashea && activo('cashea') && (
          <div className="mt-3 rounded-lg border border-[#e8eaed] p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#fdf5e2] text-[#eab308]">
                <CasheaGlyph />
              </span>
              <h3 className="flex-1 text-[13.5px] font-bold text-[#16181d]">Cashea</h3>
              <a
                href="https://cashea.app"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-[#2563eb] hover:underline"
              >
                ¿Cómo funciona?
              </a>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[12.5px]">
              <span className="text-[#5b616e]">Monto total</span>
              <span className="num font-bold text-[#16181d]">{ver(totalUSD)}</span>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[12.5px]">
              <span className="text-[#5b616e]">
                Inicial (dinámica) <span className="num ml-1 font-semibold text-[#16181d]">{cashea?.pct ?? 0}%</span>
              </span>
              <span className="num font-bold text-[#16181d]">{ver(cashea?.inicial ?? 0)}</span>
            </div>

            <input
              type="range"
              min={0}
              max={60}
              step={10}
              value={cashea?.pct ?? 30}
              onChange={e => cashea?.onPct(Number(e.target.value) as 0 | 10 | 20 | 30 | 40 | 50 | 60)}
              aria-label="Porcentaje de la cuota inicial"
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#ffe0cb] accent-[#f97316]"
            />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {PORCENTAJES.map(p => (
                <button
                  key={p}
                  onClick={() => cashea?.onPct(p)}
                  aria-pressed={p === cashea?.pct}
                  className={cn(
                    'h-[24px] rounded-md px-2.5 text-[11px] font-medium transition-colors',
                    p === cashea?.pct ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>

            <div className="mt-2.5 flex items-end justify-between gap-2 rounded-lg bg-[#fafbfc] p-2.5">
              <div className="min-w-0">
                <p className="text-[11px] text-[#5b616e]">{cashea?.cuotas ?? 3} cuotas quincenales de</p>
                <p className="num text-[15px] font-extrabold text-[#16181d]">{ver(cashea?.cuota ?? 0)}</p>
              </div>
              <button
                onClick={() => cashea?.onUsar()}
                className="h-[28px] shrink-0 rounded-md border border-[#e2e5ea] px-2.5 text-[11.5px] font-medium text-[#3d4350] hover:bg-white"
              >
                Recalcular
              </button>
            </div>

            <p className="mt-1.5 text-[10.5px] leading-snug text-[#9ba1ab]">
              La inicial se cobra hoy.
              <br />
              Sujeto a aprobación de Cashea.
            </p>

            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#e2e5ea] px-2.5 py-1.5">
              <span className="flex-1 text-[11.5px] font-medium text-[#16181d]">Monto en Cashea ($)</span>
              <input
                type="number" step="0.01" min="0"
                value={bins.cashea || ''}
                onChange={e => setBin('cashea', parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                aria-label="Monto total financiado con Cashea"
                className="num h-[30px] w-[92px] rounded-md border border-[#e2e5ea] px-2 text-right text-[12px] font-semibold outline-none focus:border-[#f97316]"
              />
            </div>
          </div>
        )}

        {/* Resumen */}
        <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Resumen de pago</p>
        <dl className="space-y-1.5">
          {casheaActivo ? (
            <>
              <div className="flex items-center justify-between text-[12px]">
                <dt className="text-[#5b616e]">Inicial (hoy)</dt>
                <dd className="num font-semibold text-[#16181d]">{ver(cashea?.inicial ?? 0)}</dd>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <dt className="text-[#5b616e]">Cuotas ({cashea?.cuotas ?? 3} × {ver(cashea?.cuota ?? 0)})</dt>
                <dd className="num font-semibold text-[#16181d]">{ver(cashea?.resto ?? 0)}</dd>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-[12px]">
                <dt className="text-[#5b616e]">Subtotal</dt>
                <dd className="num font-semibold text-[#16181d]">{ver(subtotalUSD)}</dd>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <dt className="text-[#5b616e]">{esPago ? 'Pagado' : 'Recibido'}</dt>
                <dd className="num font-semibold text-[#16a34a]">{ver(pagadoUSD)}</dd>
              </div>
            </>
          )}
          <div className="flex items-center justify-between border-t border-[#e8eaed] pt-1.5 text-[12.5px]">
            <dt className="font-semibold text-[#16181d]">Total</dt>
            <dd className="num font-bold text-[#16181d]">{ver(totalUSD)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function CasheaGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 8.6 15.06l-3.2-1.9A6.3 6.3 0 1 1 18.3 12h-6.3v3.7h10.2A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function ZelleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
      <path d="M10.6 2h2.8v2.2h3.9v2.6l-6.6 8.4h6.6V18h-3.9v2.2h-2.8V18H6.7v-2.6l6.6-8.4H6.7V4.2h3.9V2Z" />
    </svg>
  );
}

/**
 * La marca de Binance: cuatro rombos y un cuadrado girado en el centro.
 * Al ser geometría exacta se puede reproducir fielmente; el color es el suyo.
 */
function BinanceGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="#F0B90B" aria-hidden>
      <path d="M12 1.6 15.4 5 12 8.4 8.6 5 12 1.6Z" />
      <path d="M5 8.6 8.4 12 5 15.4 1.6 12 5 8.6Z" />
      <path d="M19 8.6 22.4 12 19 15.4 15.6 12 19 8.6Z" />
      <path d="M12 8.6 15.4 12 12 15.4 8.6 12 12 8.6Z" />
      <path d="M12 15.6 15.4 19 12 22.4 8.6 19 12 15.6Z" />
    </svg>
  );
}
