'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Car, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck, Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chip, Panel, Vacio } from '@/components/panel/Piezas';
import { useModales } from '@/components/ui/modales';
import { TITULOS, type Hallazgo, type TipoHallazgo } from '@/lib/finanzas/cuadre';

/**
 * El cuadre de cuentas.
 *
 * Cada venta tiene que decir lo mismo en tres sitios: lo que costó, lo que
 * entró por cada cuenta y lo que quedó debiendo. Esta pestaña enseña las que
 * no, por qué, cuánto dinero está en juego y qué hacer. Las que tienen una
 * sola explicación posible se corrigen de un clic, todas juntas; las demás
 * piden que alguien decida, con la propuesta a la vista.
 */

interface Caso {
  tabla: 'ventas_dia' | 'egresos';
  id: string;
  fecha: string;
  cliente: string;
  placa: string | null;
  vehiculo: string | null;
  total: number;
  servicio_id: string | null;
  hallazgos: Hallazgo[];
}
interface Respuesta {
  casos: Caso[];
  resumen: { revisadas: number; gastosRevisados: number; conProblema: number; seguras: number; enJuegoUSD: number };
}

const usd = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f: string) => f.split('-').reverse().join('/');
const TONO = { alta: 'peligro', media: 'aviso', baja: 'info' } as const;

export default function PanelCuadre({ sede }: { sede?: string | null }) {
  const { confirmar, error: avisarError } = useModales();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<TipoHallazgo | 'todos'>('todos');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/finanzas/cuadre${sede ? `?sede=${sede}` : ''}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo revisar el cuadre');
      setDatos(d);
    } catch (e: unknown) {
      await avisarError(e instanceof Error ? e.message : 'No se pudo revisar el cuadre');
    } finally {
      setCargando(false);
    }
  }, [sede, avisarError]);

  useEffect(() => { cargar(); }, [cargar]);

  const porTipo = useMemo(() => {
    const m = new Map<TipoHallazgo, { n: number; usd: number }>();
    for (const c of datos?.casos || []) {
      for (const h of c.hallazgos) {
        const x = m.get(h.tipo) || { n: 0, usd: 0 };
        x.n++; x.usd += Math.abs(h.diferenciaUSD || 0);
        m.set(h.tipo, x);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].usd - a[1].usd);
  }, [datos]);

  const visibles = useMemo(
    () => (datos?.casos || []).filter(c => filtro === 'todos' || c.hallazgos.some(h => h.tipo === filtro)),
    [datos, filtro],
  );

  const corregir = async (body: Record<string, unknown>, clave: string) => {
    setTrabajando(clave);
    try {
      const r = await fetch('/api/finanzas/cuadre', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo corregir');
      if (d.errores?.length) await avisarError(`Algunas no se pudieron corregir: ${d.errores.join(' · ')}`);
      await cargar();
    } catch (e: unknown) {
      await avisarError(e instanceof Error ? e.message : 'No se pudo corregir');
    } finally {
      setTrabajando(null);
    }
  };

  const corregirSeguras = async () => {
    if (!datos) return;
    const ok = await confirmar({
      titulo: `¿Corregir las ${datos.resumen.seguras} seguras?`,
      mensaje: 'Solo se tocan las que tienen una sola explicación y quedan cuadradas al corregirlas: '
        + 'cobros contados dos veces, tasas por defecto, IVA sin marcar y órdenes que dicen otro pago.',
      detalle: 'Cada cambio queda en el registro de actividad.',
      confirmar: 'Sí, corregirlas',
    });
    if (ok) await corregir({ seguras: true }, 'seguras');
  };

  const corregirUna = async (c: Caso, h: Hallazgo) => {
    const ok = await confirmar({
      tipo: h.correccion?.segura ? 'confirmar' : 'peligro',
      titulo: TITULOS[h.tipo],
      mensaje: `${c.cliente} · ${fecha(c.fecha)}`,
      detalle: h.correccion?.explicacion,
      confirmar: 'Aplicar',
    });
    if (ok) await corregir({ tabla: c.tabla, id: c.id, tipo: h.tipo }, `${c.id}:${h.tipo}`);
  };

  if (cargando && !datos) {
    return (
      <Panel titulo="Cuadre de cuentas" subtitulo="Revisando cada venta y cada gasto…">
        <div className="flex items-center justify-center gap-2 py-14 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Revisando…
        </div>
      </Panel>
    );
  }
  if (!datos) return null;
  const r = datos.resumen;

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Cifra titulo="Revisadas" valor={`${r.revisadas}`} pie={`ventas · ${r.gastosRevisados} gastos`} />
        <Cifra titulo="No cuadran" valor={`${r.conProblema}`} pie={r.conProblema ? 'necesitan atención' : 'todo cuadra'}
          tono={r.conProblema ? 'aviso' : 'exito'} />
        <Cifra titulo="Dinero en juego" valor={usd(r.enJuegoUSD)} pie="suma de las diferencias" tono={r.enJuegoUSD ? 'peligro' : 'exito'} />
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5">
          <div>
            <p className="text-[11.5px] font-medium text-muted-foreground">Corrección segura</p>
            <p className="num mt-1 text-[22px] font-extrabold leading-none text-foreground">{r.seguras}</p>
          </div>
          <button
            type="button"
            onClick={corregirSeguras}
            disabled={!r.seguras || trabajando !== null}
            className="mt-2 flex h-[34px] items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {trabajando === 'seguras' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
            Corregir las seguras
          </button>
        </div>
      </div>

      {r.conProblema === 0 ? (
        <Panel titulo="Cuadre de cuentas">
          <Vacio
            icono={<ShieldCheck className="h-8 w-8" aria-hidden />}
            titulo="Todo cuadra"
            detalle="Cada venta dice lo mismo en su total, en sus cuentas y en lo que queda por cobrar."
          />
        </Panel>
      ) : (
        <Panel
          titulo="Lo que no cuadra"
          subtitulo="Cada caso con su explicación. Las propuestas en rojo las confirma una persona."
          accion={(
            <button type="button" onClick={cargar} className="flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:text-primary/70">
              <RefreshCw className={cn('h-3 w-3', cargando && 'animate-spin')} aria-hidden /> Revisar de nuevo
            </button>
          )}
          sinRelleno
        >
          {/* Filtro por tipo */}
          <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
            <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')}>
              Todos · {datos.casos.length}
            </FiltroChip>
            {porTipo.map(([t, x]) => (
              <FiltroChip key={t} activo={filtro === t} onClick={() => setFiltro(t)}>
                {TITULOS[t]} · {x.n} <span className="num opacity-70">({usd(x.usd)})</span>
              </FiltroChip>
            ))}
          </div>

          <ul className="divide-y divide-border border-t border-border">
            {visibles.map(c => (
              <li key={`${c.tabla}:${c.id}`} className="px-3.5 py-3">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground">
                      {c.cliente}
                      <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
                        {c.tabla === 'egresos' ? 'Gasto' : 'Venta'} del {fecha(c.fecha)} · {usd(c.total)}
                      </span>
                    </p>
                    {(c.placa || c.vehiculo) && (
                      <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                        <Car className="h-3.5 w-3.5" aria-hidden />
                        {c.placa && (
                          <Link href={`/dashboard/ficha?placa=${encodeURIComponent(c.placa)}`} className="num font-bold text-blue-600 hover:underline dark:text-blue-400">
                            {c.placa}
                          </Link>
                        )}
                        {c.vehiculo && <span className="truncate">{c.vehiculo}</span>}
                      </p>
                    )}
                  </div>
                  {c.servicio_id && (
                    <Link href={`/dashboard/servicios?id=${c.servicio_id}`} className="flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:text-primary/70">
                      Abrir la orden <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  )}
                </div>

                <ul className="mt-2 space-y-2">
                  {c.hallazgos.map(h => {
                    const clave = `${c.id}:${h.tipo}`;
                    return (
                      <li key={h.tipo} className="rounded-xl border border-border bg-muted/30 p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <AlertTriangle className={cn('h-4 w-4', h.gravedad === 'alta' ? 'text-red-500' : h.gravedad === 'media' ? 'text-amber-500' : 'text-blue-500')} aria-hidden />
                          <span className="text-[12.5px] font-bold text-foreground">{TITULOS[h.tipo]}</span>
                          <Chip tono={TONO[h.gravedad]}>{usd(h.diferenciaUSD)}</Chip>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-foreground/80">{h.detalle}</p>
                        {h.correccion ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className={cn(
                              'min-w-0 flex-1 text-[11.5px] leading-snug',
                              h.correccion.segura ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
                            )}>
                              {h.correccion.segura ? 'Corrección segura: ' : 'Propuesta: '}{h.correccion.explicacion}
                            </p>
                            {c.tabla === 'ventas_dia' && (
                              <button
                                type="button"
                                onClick={() => corregirUna(c, h)}
                                disabled={trabajando !== null}
                                className={cn(
                                  'flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-semibold disabled:opacity-40',
                                  h.correccion.segura
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'border border-border bg-card text-foreground hover:bg-muted',
                                )}
                              >
                                {trabajando === clave ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                                Aplicar
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                            Sin corrección automática: {c.servicio_id ? 'abre la orden' : 'revisa la venta en Reportes'} y corrígela a mano.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, pie, tono }: { titulo: string; valor: string; pie: string; tono?: 'aviso' | 'peligro' | 'exito' }) {
  const color = tono === 'peligro' ? 'text-red-600 dark:text-red-400'
    : tono === 'aviso' ? 'text-amber-600 dark:text-amber-400'
      : tono === 'exito' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground';
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <p className="text-[11.5px] font-medium text-muted-foreground">{titulo}</p>
      <p className={cn('num mt-1 text-[22px] font-extrabold leading-none', color)}>{valor}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground/80">{pie}</p>
    </div>
  );
}

function FiltroChip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
        activo ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
