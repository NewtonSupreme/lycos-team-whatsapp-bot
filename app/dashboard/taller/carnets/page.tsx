'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff, IdCard, Loader2, Printer, RefreshCw, ScrollText, Sparkles, UserX } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ANCHO, ALTO, archivoCarnet, dibujarCarnet, type FuentesCarnet } from '@/lib/taller/carnet';
import type { CuentaTrabajador, PeriodoCuenta } from '@/lib/taller/cuenta';
import { cn } from '@/lib/utils';

/*
 * Carnets del taller (solo Usuario Maestro). Cada trabajador del piso tiene un
 * código de 4 números que abre «Mi cuenta» en la pantalla del taller; aquí se
 * le da, se descarga su carnet en PNG para mandarlo por WhatsApp o se imprime.
 * También se ve qué cargó cada uno hoy y en la semana.
 */

interface Fechas { hoy: string; lunes: string; lunesPasado: string; domingoPasado: string }
type Vista = 'hoy' | 'semana' | 'semanaPasada';

interface Persona {
  id: string; nombre: string; alias: string | null; foto: string | null; cargo: string | null; rol: string;
  cedula: string | null; codigo: string | null; emitido: string | null;
  hoy: { cantidad: number; total: number }; semana: { cantidad: number; total: number };
  dias: Record<string, { cantidad: number; total: number }>;
}

const usd = (x: number) => `$${(Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CarnetsTaller() {
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [fechas, setFechas] = useState<Fechas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imagenes, setImagenes] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [verCodigos, setVerCodigos] = useState(false);
  const [detalle, setDetalle] = useState<{ persona: Persona; vista: Vista; dia?: string } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch('/api/taller/codigos', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || 'No se pudo cargar.'); return; }
      setPersonal(j.personal); setFechas(j.fechas);
    } catch { setError('Sin conexión.'); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  // Las letras del carnet son las de la pantalla del taller (las carga el layout).
  const fuentes = useCallback((): FuentesCarnet => {
    const s = getComputedStyle(raiz.current || document.body);
    return { display: s.getPropertyValue('--font-display').trim() || 'sans-serif', texto: s.getPropertyValue('--font-texto').trim() || 'sans-serif' };
  }, []);

  // Cada carnet se dibuja una vez por código: la vista previa ES el PNG.
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const p of personal) {
        if (!p.codigo) continue;
        const cv = await dibujarCarnet({ nombre: p.nombre, cargo: p.cargo, codigo: p.codigo, foto: p.foto, cedula: p.cedula, emitido: p.emitido }, fuentes());
        let url = '';
        try { url = cv.toDataURL('image/png'); } catch { /* foto de otro dominio sin permiso: se queda sin vista */ }
        if (!vivo) return;
        setImagenes(m => ({ ...m, [`${p.id}:${p.codigo}`]: url }));
      }
    })();
    return () => { vivo = false; };
  }, [personal, fuentes]);

  const imagenDe = (p: Persona) => (p.codigo ? imagenes[`${p.id}:${p.codigo}`] : undefined);
  const faltan = personal.filter(p => !p.codigo);
  const conCarnet = personal.filter(p => p.codigo);
  const hoy = useMemo(() => personal.reduce((a, p) => ({ n: a.n + p.hoy.cantidad, t: a.t + p.hoy.total }), { n: 0, t: 0 }), [personal]);

  const darCodigo = async (ids: string[] | 'faltantes') => {
    setTrabajando(ids === 'faltantes' ? 'faltantes' : ids[0]);
    try {
      const r = await fetch('/api/taller/codigos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids === 'faltantes' ? { faltantes: true } : { empleados: ids }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setError(j?.error || 'No se pudo dar el código.'); return; }
      await cargar();
    } finally { setTrabajando(null); }
  };

  const descargar = (p: Persona) => {
    const url = imagenDe(p);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = archivoCarnet(p.nombre); a.click();
  };
  const descargarTodos = async () => {
    for (const p of conCarnet) { descargar(p); await new Promise(r => setTimeout(r, 350)); }
  };

  return (
    <div ref={raiz} className="space-y-6">
      {/* Al imprimir: solo los carnets, a tamaño real (CR80). */}
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden !important; }
          .zona-impresion, .zona-impresion * { visibility: visible !important; }
          .zona-impresion { position: absolute; inset: 0 auto auto 0; display: grid !important; grid-template-columns: repeat(3, 54mm); gap: 6mm; }
          .zona-impresion img { width: 54mm; height: 85.6mm; break-inside: avoid; }
        }
      `}</style>
      <div className="zona-impresion hidden">
        {conCarnet.map(p => {
          const url = imagenDe(p);
          // eslint-disable-next-line @next/next/no-img-element
          return url ? <img key={p.id} src={url} alt="" /> : null;
        })}
      </div>

      <PageHeader
        title="Carnets del taller"
        description="Cada trabajador entra a «Mi cuenta» en la pantalla del taller con el código de su carnet, y ve lo que cargó y lo que se cobró. Sin el código no ve nada, ni lo de los demás."
        actions={<>
          <Button variant="outline" onClick={() => setVerCodigos(v => !v)}>{verCodigos ? <EyeOff /> : <Eye />}{verCodigos ? 'Ocultar códigos' : 'Ver códigos'}</Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!conCarnet.length}><Printer />Imprimir</Button>
          <Button variant="outline" onClick={descargarTodos} disabled={!conCarnet.length}><Download />Descargar todos</Button>
          {faltan.length > 0 && (
            <Button onClick={() => darCodigo('faltantes')} disabled={!!trabajando}>
              {trabajando === 'faltantes' ? <Loader2 className="animate-spin" /> : <Sparkles />}Dar carnet a {faltan.length} sin código
            </Button>
          )}
        </>}
      />

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Personal del taller" value={personal.length} icon={IdCard} />
        <StatCard label="Con carnet" value={`${conCarnet.length} / ${personal.length}`} hint={faltan.length ? `${faltan.length} sin código` : 'Todos tienen'} />
        <StatCard label="Trabajos cargados hoy" value={hoy.n} />
        <StatCard label="Cobrado hoy" value={usd(hoy.t)} hint="Lo que cargó el taller" />
      </div>

      {fechas && personal.length > 0 && (
        <SemanaPorPersona personal={personal} fechas={fechas} onVer={(persona, vista, dia) => setDetalle({ persona, vista, dia })} />
      )}

      {cargando && !personal.length ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {personal.map(p => (
            <article key={p.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
              <div className="w-[118px] shrink-0">
                {p.codigo ? (
                  imagenDe(p)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={imagenDe(p)} alt={`Carnet de ${p.nombre}`} width={ANCHO} height={ALTO} className={cn('h-auto w-full rounded-lg shadow-md ring-1 ring-black/10 transition', !verCodigos && 'blur-[3px]')} />
                    : <div className="flex aspect-[1080/1712] items-center justify-center rounded-lg bg-muted"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="flex aspect-[1080/1712] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-xs text-muted-foreground">
                    <UserX className="h-6 w-6" />Sin carnet
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="truncate font-semibold text-foreground">{p.nombre}</h2>
                <p className="truncate text-xs text-muted-foreground">{p.cargo || '—'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Código</span>
                  <span className="num rounded-md bg-muted px-2 py-0.5 font-mono text-base font-bold tracking-[0.3em]">
                    {p.codigo ? (verCodigos ? p.codigo : '••••') : '—'}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/60 px-2.5 py-1.5"><dt className="text-muted-foreground">Hoy</dt><dd className="num font-semibold">{p.hoy.cantidad} · {usd(p.hoy.total)}</dd></div>
                  <div className="rounded-lg bg-muted/60 px-2.5 py-1.5"><dt className="text-muted-foreground">Semana</dt><dd className="num font-semibold">{p.semana.cantidad} · {usd(p.semana.total)}</dd></div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setDetalle({ persona: p, vista: 'hoy' })}><ScrollText />Trabajos</Button>
                  {p.codigo && <Button size="sm" variant="outline" onClick={() => descargar(p)} disabled={!imagenDe(p)}><Download />PNG</Button>}
                  <Button size="sm" variant="ghost" disabled={!!trabajando}
                    onClick={() => { if (!p.codigo || confirm(`¿Código nuevo para ${p.nombre}? El de su carnet actual deja de servir.`)) void darCodigo([p.id]); }}>
                    {trabajando === p.id ? <Loader2 className="animate-spin" /> : p.codigo ? <RefreshCw /> : <Sparkles />}{p.codigo ? 'Cambiar' : 'Dar código'}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Detalle key={detalle ? `${detalle.persona.id}:${detalle.vista}:${detalle.dia || ''}` : 'nadie'} persona={detalle?.persona || null}
        vistaInicial={detalle?.vista || 'hoy'} dia={detalle?.dia} onCerrar={() => setDetalle(null)} />
    </div>
  );
}

/** Lo mismo que el trabajador ve en la TV, para revisarlo desde la oficina. Se monta de nuevo por persona (key). */
function Detalle({ persona, vistaInicial, dia: diaInicial, onCerrar }: { persona: Persona | null; vistaInicial: Vista; dia?: string; onCerrar: () => void }) {
  const [cuenta, setCuenta] = useState<CuentaTrabajador | null>(null);
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [dia, setDia] = useState<string | undefined>(diaInicial);
  useEffect(() => {
    if (!persona) return;
    fetch(`/api/taller/codigos?cuenta=${persona.id}`, { cache: 'no-store' }).then(r => r.json()).then(j => setCuenta(j?.persona ? j : null)).catch(() => null);
  }, [persona]);
  const periodo: PeriodoCuenta | null = cuenta ? cuenta[vista] : null;
  // Con un día elegido (desde la tabla de la semana), solo ese día.
  const p: PeriodoCuenta | null = periodo && dia ? (() => {
    const t = periodo.trabajos.filter(x => x.fecha === dia);
    return { ...periodo, trabajos: t, cantidad: t.length, total: Math.round(t.reduce((a, x) => a + x.monto, 0) * 100) / 100 };
  })() : periodo;

  return (
    <Dialog open={!!persona} onOpenChange={o => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{persona?.nombre}</DialogTitle>
          <DialogDescription>Lo que cargó en la pantalla del taller y en las órdenes, con lo cobrado.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['semanaPasada', 'Semana pasada']] as const).map(([id, t]) => (
            <button key={id} type="button" onClick={() => { setVista(id); setDia(undefined); }}
              className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium', vista === id ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
              {t}{cuenta ? <span className="num ml-1.5 text-xs text-muted-foreground">{cuenta[id].cantidad}</span> : null}
            </button>
          ))}
        </div>
        {!p ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {dia && <button type="button" onClick={() => setDia(undefined)} className="mr-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Solo el {new Date(`${dia}T12:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric' })} · ver toda la semana
                </button>}
                {p.cantidad} trabajo{p.cantidad === 1 ? '' : 's'}
              </span>
              <span className="num text-2xl font-bold">{usd(p.total)}</span>
            </div>
            <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {p.trabajos.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nada cargado en este período.</li>}
              {p.trabajos.map(t => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="num w-20 shrink-0 text-xs text-muted-foreground">{t.fecha.slice(8, 10)}/{t.fecha.slice(5, 7)} {t.hora || ''}</span>
                  {t.placa && <span className="shrink-0 rounded bg-muted px-1.5 font-mono text-xs font-bold">{t.placa}</span>}
                  <span className="min-w-0 flex-1 truncate">{t.descripcion}</span>
                  <span className={cn('shrink-0 text-xs', t.estado === 'liquidado' ? 'text-success' : 'text-muted-foreground')}>{t.estado === 'liquidado' ? 'Liquidado' : 'Por liquidar'}</span>
                  <span className={cn('num w-20 shrink-0 text-right', t.monto ? 'font-semibold' : 'text-xs text-muted-foreground')}>{t.monto ? usd(t.monto) : 'Sin precio'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * La semana de cada uno, día por día: una fila por trabajador, una columna por
 * día. Tocar una casilla abre lo que hizo ese día.
 */
function SemanaPorPersona({ personal, fechas, onVer }: {
  personal: Persona[]; fechas: Fechas; onVer: (p: Persona, vista: Vista, dia?: string) => void;
}) {
  const [cual, setCual] = useState<'semana' | 'semanaPasada'>('semana');
  const lunes = cual === 'semana' ? fechas.lunes : fechas.lunesPasado;
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${lunes}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { iso, nombre: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][i], num: d.getUTCDate(), futuro: iso > fechas.hoy, hoy: iso === fechas.hoy };
  });
  const filas = personal
    .map(p => {
      const celdas = dias.map(d => p.dias?.[d.iso] || { cantidad: 0, total: 0 });
      return { p, celdas, n: celdas.reduce((a, c) => a + c.cantidad, 0), total: celdas.reduce((a, c) => a + c.total, 0) };
    })
    .sort((a, b) => b.total - a.total || b.n - a.n || a.p.nombre.localeCompare(b.p.nombre));
  const porDia = dias.map((_, i) => filas.reduce((a, x) => ({ n: a.n + x.celdas[i].cantidad, t: a.t + x.celdas[i].total }), { n: 0, t: 0 }));
  const totalN = filas.reduce((a, x) => a + x.n, 0), totalT = filas.reduce((a, x) => a + x.total, 0);
  // La casilla más alta marca la intensidad del color del resto.
  const max = Math.max(1, ...filas.flatMap(x => x.celdas.map(c => c.total)));
  const corta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">Cada uno, día por día</h2>
          <p className="text-xs text-muted-foreground">{corta(dias[0].iso)} – {corta(dias[6].iso)} · toca una casilla para ver los trabajos de ese día</p>
        </div>
        <div className="ml-auto flex gap-1 rounded-xl bg-muted p-1">
          {([['semana', 'Esta semana'], ['semanaPasada', 'Semana pasada']] as const).map(([id, t]) => (
            <button key={id} type="button" onClick={() => setCual(id)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', cual === id ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{t}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 w-[220px] bg-card px-4 py-2 text-left font-medium">Trabajador</th>
              {dias.map(d => (
                <th key={d.iso} className={cn('px-1 py-2 text-center font-medium', d.hoy && 'text-primary', d.futuro && 'opacity-40')}>
                  {d.nombre} <span className="num">{d.num}</span>{d.hoy && <span className="ml-1 rounded bg-primary/10 px-1 text-[10px] font-semibold">HOY</span>}
                </th>
              ))}
              <th className="w-[120px] px-4 py-2 text-right font-medium">Semana</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ p, celdas, n, total }) => (
              <tr key={p.id} className="border-t border-border">
                <td className="sticky left-0 z-10 max-w-[200px] truncate bg-card px-4 py-1.5 font-medium" title={p.nombre}>{p.nombre}</td>
                {celdas.map((c, i) => (
                  <td key={dias[i].iso} className="p-1">
                    {c.cantidad ? (
                      <button type="button" onClick={() => onVer(p, cual, dias[i].iso)}
                        className="flex h-12 w-full flex-col items-center justify-center rounded-lg ring-primary/50 transition hover:ring-2"
                        style={{ background: `rgba(249,115,22,${0.08 + 0.32 * (c.total / max)})` }}
                        title={`${p.nombre} · ${dias[i].nombre} ${dias[i].num}: ${c.cantidad} trabajo(s), ${usd(c.total)}`}>
                        <span className="num font-semibold leading-tight">{c.total ? usd(c.total) : 'Sin precio'}</span>
                        <span className="text-[11px] leading-tight text-muted-foreground">{c.cantidad} trab.</span>
                      </button>
                    ) : (
                      <span className={cn('flex h-12 items-center justify-center rounded-lg text-muted-foreground/50', dias[i].hoy && 'bg-primary/5')}>{dias[i].futuro ? '' : '—'}</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-1.5 text-right">
                  <button type="button" onClick={() => onVer(p, cual)} className="text-right hover:underline disabled:no-underline" disabled={!n}>
                    <span className="num block font-bold">{usd(total)}</span>
                    <span className="block text-[11px] text-muted-foreground">{n} trabajo{n === 1 ? '' : 's'}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-xs">
              <td className="sticky left-0 z-10 bg-muted px-4 py-2 font-semibold">Todo el taller</td>
              {porDia.map((d, i) => (
                <td key={dias[i].iso} className="bg-muted/40 px-1 py-2 text-center">
                  {d.n ? <><span className="num block font-semibold">{usd(d.t)}</span><span className="text-muted-foreground">{d.n} trab.</span></> : <span className="text-muted-foreground/50">{dias[i].futuro ? '' : '—'}</span>}
                </td>
              ))}
              <td className="bg-muted/40 px-4 py-2 text-right"><span className="num block text-sm font-bold">{usd(totalT)}</span><span className="text-muted-foreground">{totalN} trabajos</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
