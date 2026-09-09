'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Link2, Loader2, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vinculo { texto: string; veces: number; empleado_id: string; nombre: string; certeza: string; inactivo: boolean }
interface Alta { texto: string; veces: number; propuesto: string; ejemplo: string | null }
interface Descarte { texto: string; veces: number; razon: string; ejemplo: string | null }

interface Analisis {
  vincular: Vinculo[];
  crear: Alta[];
  descartar: Descarte[];
  ordenes: number;
  menciones: number;
}

interface Resultado {
  creados: { id: string; nombre: string; veces: number }[];
  enlazadas: number;
  menciones: number;
  sinEnlace: number;
  pendientes: { texto: string; veces: number }[];
}

/**
 * Pone en orden a los encargados que quedaron escritos a mano.
 *
 * Enseña primero lo que va a pasar y solo después lo hace. En una base con
 * cientos de órdenes, dar de alta gente y reescribir enlaces sin ver antes la
 * lista es la clase de operación de la que no se vuelve: si un nombre se enlaza
 * a la persona equivocada, alguien cobra lo que no le toca.
 */
export default function ReconciliarEncargados({ sedeId, onListo }: { sedeId: string | null; onListo?: () => void }) {
  const [datos, setDatos] = useState<Analisis | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [crearFaltantes, setCrearFaltantes] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const r = await fetch(`/api/nomina/encargados${sedeId ? `?sede=${sedeId}` : ''}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo revisar');
      setDatos(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al revisar');
    } finally {
      setCargando(false);
    }
  }, [sedeId]);

  useEffect(() => { cargar(); }, [cargar]);

  const aplicar = async () => {
    if (!datos) return;
    const alta = crearFaltantes ? datos.crear.length : 0;
    if (!confirm(
      `Se van a enlazar ${datos.ordenes} orden(es) con su personal.\n` +
      (alta > 0 ? `Se darán de alta ${alta} ficha(s) nueva(s): ${datos.crear.map(c => c.propuesto).join(', ')}.\n` : '') +
      '\nNo se genera ninguna comisión: eso se revisa aparte en «Sin asignar».',
    )) return;

    setAplicando(true);
    setError('');
    try {
      const r = await fetch('/api/nomina/encargados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sede: sedeId, crearFaltantes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo aplicar');
      setResultado(d);
      onListo?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al aplicar');
    } finally {
      setAplicando(false);
    }
  };

  if (cargando) {
    return (
      <div className="rounded-xl border border-[#e8eaed] bg-white py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" aria-hidden />
        <p className="mt-2 text-[12.5px] text-[#8a909c]">Revisando quién aparece en las órdenes…</p>
      </div>
    );
  }

  if (error && !datos) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[13px] text-[#b91c1c]">
        <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>{error}</span>
      </div>
    );
  }

  if (!datos) return null;

  const nada = datos.vincular.length === 0 && datos.crear.length === 0;

  return (
    <div className="space-y-3.5">
      <section className="rounded-xl border border-[#e8eaed] bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
            <Link2 className="h-[20px] w-[20px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#16181d]">Encargados escritos a mano</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#8a909c]">
              Durante mucho tiempo la orden guardó a quien hizo el trabajo como texto suelto, sin
              enlazarlo a ninguna ficha. Aquí se ve a quién corresponde cada nombre antes de tocar nada.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Cifra k="Órdenes" v={String(datos.ordenes)} />
          <Cifra k="Ya tienen ficha" v={String(datos.vincular.reduce((s, v) => s + v.veces, 0))} bien />
          <Cifra k="Hay que crearlos" v={String(datos.crear.reduce((s, v) => s + v.veces, 0))} aviso={datos.crear.length > 0} />
          <Cifra k="No son nombres" v={String(datos.descartar.reduce((s, v) => s + v.veces, 0))} />
        </div>

        {!resultado && !nada && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#3d4350]">
              <input
                type="checkbox"
                checked={crearFaltantes}
                onChange={e => setCrearFaltantes(e.target.checked)}
                className="h-[15px] w-[15px] rounded border-[#cfd4dc] accent-[#f97316]"
              />
              Dar de alta a quien trabajó y no está registrado
            </label>
            <button
              onClick={aplicar}
              disabled={aplicando}
              className="flex h-[36px] items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:opacity-50"
            >
              {aplicando
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enlazando…</>
                : <><Link2 className="h-4 w-4" aria-hidden /> Enlazar todo</>}
            </button>
          </div>
        )}

        <p className="mt-2.5 text-[11.5px] leading-snug text-[#9ba1ab]">
          Esto no genera ninguna comisión: solo deja claro quién hizo cada trabajo. Lo que se le paga
          a cada uno se revisa en «Sin asignar».
        </p>

        {error && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-[#b91c1c]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {error}
          </p>
        )}
      </section>

      {resultado && (
        <section className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
          <h4 className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#15803d]">
            <Check className="h-4 w-4" aria-hidden /> Listo
          </h4>
          <p className="mt-1 text-[12.5px] leading-snug text-[#166534]">
            {resultado.enlazadas} orden(es) quedaron enlazadas con su personal
            {resultado.creados.length > 0 && `, y se dieron de alta ${resultado.creados.length} ficha(s): ${resultado.creados.map(c => c.nombre).join(', ')}`}.
            {resultado.sinEnlace > 0 && ` Quedan ${resultado.sinEnlace} mención(es) sin enlazar porque no son nombres de persona.`}
          </p>
          {resultado.creados.length > 0 && (
            <p className="mt-2 text-[11.5px] leading-snug text-[#15803d]">
              A las fichas nuevas les falta cédula, zona y reglas de pago: sin reglas sus trabajos
              entran a nómina en $0.00. Complétalas en Recursos Humanos.
            </p>
          )}
        </section>
      )}

      <Lista
        titulo="Ya existen — se enlazan a su ficha"
        vacia="Ningún nombre coincide con el personal registrado."
        filas={datos.vincular.map(v => ({
          clave: v.texto,
          izq: v.texto,
          der: v.nombre,
          veces: v.veces,
          aviso: v.inactivo ? 'Su ficha está inactiva' : v.certeza !== 'exacta' ? 'Parecido, no idéntico: confírmalo' : null,
        }))}
      />

      {datos.crear.length > 0 && (
        <Lista
          titulo="No existen — se les crea la ficha"
          icono={<UserPlus className="h-3.5 w-3.5" aria-hidden />}
          vacia=""
          filas={datos.crear.map(c => ({
            clave: c.propuesto,
            izq: c.texto,
            der: c.propuesto,
            veces: c.veces,
            aviso: c.ejemplo ? `p. ej. la orden de la placa ${c.ejemplo}` : null,
          }))}
        />
      )}

      {datos.descartar.length > 0 && (
        <Lista
          titulo="No es el nombre de una persona — no se crea nadie"
          icono={<X className="h-3.5 w-3.5" aria-hidden />}
          vacia=""
          filas={datos.descartar.map(d => ({
            clave: d.texto,
            izq: d.texto,
            der: '—',
            veces: d.veces,
            aviso: d.razon,
          }))}
        />
      )}
    </div>
  );
}

function Lista({
  titulo, icono, vacia, filas,
}: {
  titulo: string;
  icono?: React.ReactNode;
  vacia: string;
  filas: { clave: string; izq: string; der: string; veces: number; aviso: string | null }[];
}) {
  if (filas.length === 0 && !vacia) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <h4 className="flex items-center gap-1.5 border-b border-[#eef0f3] bg-[#fafbfc] px-4 py-2.5 text-[12px] font-semibold text-[#3d4350]">
        {icono}
        {titulo}
        <span className="num ml-auto rounded bg-[#f2f3f5] px-1.5 py-px text-[10.5px] text-[#8a909c]">{filas.length}</span>
      </h4>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-[#8a909c]">{vacia}</p>
      ) : (
        <ul>
          {filas.map(f => (
            <li key={f.clave} className="flex items-center gap-3 border-b border-[#f2f3f5] px-4 py-2 last:border-0">
              <span className="num w-[42px] shrink-0 text-[11.5px] text-[#9ba1ab]">{f.veces}×</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#5b616e]">
                «{f.izq}»
              </span>
              <span className="shrink-0 text-[#c3c8d0]" aria-hidden>→</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12.5px] font-medium text-[#16181d]">{f.der}</span>
                {f.aviso && (
                  <span className={cn(
                    'block truncate text-[10.5px]',
                    f.aviso.includes('inactiva') || f.aviso.includes('confírmalo') ? 'text-[#c2410c]' : 'text-[#9ba1ab]',
                  )}>
                    {f.aviso}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Cifra({ k, v, bien, aviso }: { k: string; v: string; bien?: boolean; aviso?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2',
      bien ? 'border-[#bbf7d0] bg-[#f0fdf4]' : aviso ? 'border-[#fed7aa] bg-[#fff7ed]' : 'border-[#eef0f3] bg-[#fafbfc]',
    )}>
      <div className="text-[10.5px] uppercase tracking-wide text-[#9ba1ab]">{k}</div>
      <div className={cn('num mt-0.5 text-[15px] font-bold', bien ? 'text-[#15803d]' : aviso ? 'text-[#c2410c]' : 'text-[#16181d]')}>
        {v}
      </div>
    </div>
  );
}
