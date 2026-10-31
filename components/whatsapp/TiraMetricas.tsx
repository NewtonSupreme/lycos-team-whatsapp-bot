'use client';
import React, { useEffect, useState } from 'react';
import {
  BadgeCheck, CalendarCheck, ChevronDown, FileText, MessageSquare, TrendingUp, UserPlus,
} from 'lucide-react';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { cn } from '@/lib/utils';

/**
 * El pulso del día sobre las conversaciones.
 *
 * Las cinco cifras son del MISMO día y se comparan con el anterior. Mezclar
 * ventanas —conversaciones de hoy contra ventas del mes— daría cinco tarjetas
 * que parecen comparables y no lo son.
 *
 * Se puede plegar, y eso no es un adorno: el chat vive debajo en una altura
 * fija, y en una pantalla de portátil cinco tarjetas le quitan justo el espacio
 * que hace falta para leer una conversación. La elección se recuerda.
 */

interface Metrica { clave: string; valor: number; variacion: number | null }
interface Respuesta {
  fecha: string; metricas: Metrica[]; sinLeer: number; total: number; avisos: string[];
}

const DEFINICIONES: Record<string, {
  etiqueta: string; icono: React.ReactNode; tinte: string; ayuda: string;
}> = {
  conversaciones: {
    etiqueta: 'Conversaciones hoy',
    icono: <MessageSquare className="h-[17px] w-[17px]" aria-hidden />,
    tinte: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    ayuda: 'Chats con actividad hoy, no el total de chats abiertos.',
  },
  clientes_nuevos: {
    etiqueta: 'Nuevos clientes',
    icono: <UserPlus className="h-[17px] w-[17px]" aria-hidden />,
    tinte: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    ayuda: 'Fichas de cliente creadas hoy, por cualquier vía.',
  },
  citas: {
    etiqueta: 'Citas agendadas',
    icono: <CalendarCheck className="h-[17px] w-[17px]" aria-hidden />,
    tinte: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    ayuda: 'Citas creadas hoy.',
  },
  presupuestos: {
    etiqueta: 'Presupuestos enviados',
    icono: <FileText className="h-[17px] w-[17px]" aria-hidden />,
    tinte: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    ayuda: 'Presupuestos creados hoy.',
  },
  ventas: {
    etiqueta: 'Ventas cerradas',
    icono: <BadgeCheck className="h-[17px] w-[17px]" aria-hidden />,
    tinte: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
    ayuda: 'Ventas registradas hoy, del chat o del mostrador.',
  },
};

const LLAVE_PLEGADO = 'lycos.whatsapp.metricas.plegado';

export default function TiraMetricas() {
  const sedeId = useSedeStore(s => s.currentSede?.id);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  // Arranca desplegada; si el usuario la plegó, se respeta.
  const [plegada, setPlegada] = useState(() => {
    try {
      const g = localStorage.getItem(LLAVE_PLEGADO);
      return g === null ? window.matchMedia('(max-width: 767px)').matches : g === '1';
    } catch { return false; }
  });

  // La petición va dentro del efecto, con guarda de desmontaje: si se cambia
  // de sede o se sale de la pantalla mientras la respuesta viaja, no se escribe
  // en un componente que ya no está.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const p = new URLSearchParams();
        if (sedeId) p.set('sede', sedeId);
        const r = await fetch(`/api/whatsapp/metricas?${p}`);
        if (!r.ok || !vivo) return;
        const d = await r.json() as Respuesta;
        if (vivo) setDatos(d);
      } catch {
        // Sin métricas la pantalla sigue sirviendo: el chat es lo importante.
      }
    })();
    return () => { vivo = false; };
  }, [sedeId]);

  const alternar = () => {
    setPlegada(v => {
      const nuevo = !v;
      try { localStorage.setItem(LLAVE_PLEGADO, nuevo ? '1' : '0'); } catch { /* da igual */ }
      return nuevo;
    });
  };

  if (!datos) return null;

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={!plegada}
        className="mb-1.5 flex items-center gap-1 text-[10.5px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', plegada && '-rotate-90')} aria-hidden />
        Actividad de hoy
        {plegada && datos.sinLeer > 0 && (
          <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
            {datos.sinLeer} sin leer
          </span>
        )}
      </button>

      {!plegada && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {datos.metricas.map(m => {
            const d = DEFINICIONES[m.clave];
            if (!d) return null;
            const sube = (m.variacion ?? 0) > 0;
            return (
              <div
                key={m.clave}
                title={d.ayuda}
                className="rounded-2xl border border-border bg-card px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', d.tinte)}>
                    {d.icono}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-black leading-none tabular-nums text-foreground">
                      {m.valor}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                      {d.etiqueta}
                    </span>
                  </span>
                </div>
                <div className="mt-1 min-h-[14px] text-[10px]">
                  {m.variacion != null ? (
                    <span className={cn('inline-flex items-center gap-0.5 font-semibold',
                      sube ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      <TrendingUp className={cn('h-2.5 w-2.5', !sube && 'rotate-180')} aria-hidden />
                      {sube ? '+' : ''}{m.variacion}%
                      <span className="font-normal text-muted-foreground/70">vs. ayer</span>
                    </span>
                  ) : (
                    // Sin base no se inventa un porcentaje: ayer fue cero y un
                    // «+100%» ahí no dice nada.
                    <span className="text-muted-foreground/60">sin comparación con ayer</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
