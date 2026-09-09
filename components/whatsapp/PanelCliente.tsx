'use client';
import React, { useEffect, useState } from 'react';
import {
  Calendar, Car, Clock, History, Mail, MapPin, MessageSquare,
  Navigation, Phone, RefreshCw, StickyNote, User, UserPlus, Wrench, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Vehiculo } from '@/types';
import { SEGMENTOS, textoUltimaVisita, type DesempenoCliente } from '@/lib/clientes/desempeno';
import { formatearCedula } from '@/lib/clientes/identidad';

/**
 * La ficha del cliente, al lado del chat.
 *
 * Antes era una lista de vehículos y poco más. Quien atiende por WhatsApp
 * necesita saber, sin salir de la conversación, si es cliente frecuente, cuánto
 * ha dejado, qué carros tiene y qué se le hizo la última vez. Eso es lo que
 * decide si se le da prioridad o se le ofrece algo.
 *
 * Tres pestañas porque no cabe de otra forma en una columna de 288 px, y
 * porque son tres preguntas distintas: quién es, qué maneja, qué le hemos
 * hecho.
 */

/** Una sede, tal y como la declara la pantalla de WhatsApp. */
export interface Sede {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
  emoji: string;
  lat: number;
  lng: number;
}

export interface ServicioResumen {
  id: string;
  fecha: string | null;
  descripcion: string;
  monto: number;
  estado: string | null;
}

interface Props {
  /** Cómo se llama, para la cabecera. */
  nombre: string;
  telefono: string;
  clienteId?: string | null;
  email?: string | null;
  direccion?: string | null;
  cedula?: string | null;
  clienteDesde?: string | null;
  /** Nota libre del bot sobre este cliente («siempre pide servicio express»). */
  nota?: string | null;

  vehiculos: Vehiculo[];
  cargandoVehiculos: boolean;
  /** Vehículos que el bot recuerda pero que aún no tienen ficha. */
  vehiculosMemoria?: { marca?: string; modelo?: string; placa?: string; anio?: number | string }[];

  /** Edición del nombre, que ya existía y se conserva. */
  editandoNombre: boolean;
  nombreEditado: { nombre: string; apellido: string };
  onCambiarNombre: (v: { nombre: string; apellido: string }) => void;
  onEmpezarEdicion: () => void;
  onGuardarNombre: () => void;
  guardandoNombre: boolean;

  /**
   * Las sedes cuya ubicación se puede enviar. Se piden con la forma que ya
   * tiene la constante de la página —solo hacen falta el nombre y la
   * dirección—, para no obligar a reformarla desde aquí.
   */
  sedes: readonly Sede[];
  onEnviarUbicacion: (s: Sede) => void;
  onEnviarContacto: () => void;
  enviandoContacto: boolean;

  /** Insertar una respuesta rápida en el cuadro de texto. */
  onRespuestaRapida?: (texto: string) => void;
  onCerrarMovil: () => void;
}

type Pestana = 'info' | 'vehiculos' | 'historial';

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaCorta = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Una línea de dato, con su icono. */
function Dato({
  icono: Icono, valor, accion,
}: { icono: typeof Phone; valor?: string | null; accion?: React.ReactNode }) {
  const hay = !!(valor && String(valor).trim());
  return (
    <div className="flex items-center gap-2">
      <Icono className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--wa-texto-suave))]" aria-hidden />
      <span className={cn('min-w-0 flex-1 truncate text-[12px]',
        hay ? 'text-[hsl(var(--wa-texto))]' : 'italic text-[hsl(var(--wa-texto-suave))]')}>
        {hay ? valor : 'No registrado'}
      </span>
      {accion}
    </div>
  );
}

export default function PanelCliente(p: Props) {
  const [pestana, setPestana] = useState<Pestana>('info');
  // Se guarda DE QUIÉN es el desempeño, no solo el desempeño. Así al cambiar de
  // conversación el dato del cliente anterior deja de usarse sin tener que
  // borrarlo desde dentro del efecto —que es un render de más y deja un
  // parpadeo con las cifras del cliente equivocado—.
  const [cache, setCache] = useState<{ id: string; datos: DesempenoCliente | null } | null>(null);
  const desempeno = cache && cache.id === p.clienteId ? cache.datos : null;
  const [histo, setHisto] = useState<{ id: string; lista: ServicioResumen[] } | null>(null);
  const servicios = histo && histo.id === p.clienteId ? histo.lista : null;

  // El desempeño del cliente: cuántos servicios lleva, cuánto ha dejado y
  // cuándo vino por última vez. Es lo que convierte la ficha en algo útil para
  // quien está respondiendo.
  useEffect(() => {
    const id = p.clienteId;
    if (!id) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/clientes/desempeno');
        if (!r.ok || !vivo) return;
        const d = await r.json() as { clientes: DesempenoCliente[] };
        if (!vivo) return;
        setCache({ id, datos: d.clientes?.find(x => x.cliente_id === id) ?? null });
      } catch { /* la ficha sigue sirviendo sin esto */ }
    })();
    return () => { vivo = false; };
  }, [p.clienteId]);

  // Los últimos servicios, solo cuando se abre esa pestaña: en una columna que
  // se ve todo el rato, pedirlos siempre sería una consulta por cada chat.
  useEffect(() => {
    const id = p.clienteId;
    if (pestana !== 'historial' || !id || (histo && histo.id === id)) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/whatsapp/historial-cliente?cliente=${id}`);
        if (!vivo) return;
        if (!r.ok) { setHisto({ id, lista: [] }); return; }
        const d = await r.json() as { servicios: ServicioResumen[] };
        if (vivo) setHisto({ id, lista: d.servicios || [] });
      } catch {
        if (vivo) setHisto({ id, lista: [] });
      }
    })();
    return () => { vivo = false; };
  }, [pestana, p.clienteId, histo]);

  const seg = desempeno ? SEGMENTOS[desempeno.segmento] : null;
  const cedula = formatearCedula(p.cedula);
  const nVehiculos = p.vehiculos.length + (p.vehiculosMemoria?.length || 0);

  const PESTANAS: { id: Pestana; label: string }[] = [
    { id: 'info', label: 'Información' },
    { id: 'vehiculos', label: `Vehículos (${nVehiculos})` },
    { id: 'historial', label: desempeno ? `Historial (${desempeno.servicios})` : 'Historial' },
  ];

  return (
    <>
      {/* Pestañas */}
      <div
        className="flex shrink-0 items-center justify-between gap-1 px-2"
        style={{ background: 'hsl(var(--wa-panel-alt))', borderBottom: '1px solid hsl(var(--wa-borde))' }}
      >
        <div className="flex min-w-0 flex-1" role="tablist">
          {PESTANAS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={pestana === t.id}
              onClick={() => setPestana(t.id)}
              className={cn(
                'shrink-0 border-b-2 px-2 py-2.5 text-[11.5px] font-semibold transition-colors',
                pestana === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[hsl(var(--wa-texto-suave))] hover:text-[hsl(var(--wa-texto))]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={p.onCerrarMovil}
          aria-label="Cerrar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[hsl(var(--wa-hover))] lg:hidden"
        >
          <X className="h-4 w-4 text-[hsl(var(--wa-texto-suave))]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {pestana === 'info' && (
          <div className="space-y-3">
            {/* Identidad */}
            <div className="flex items-start gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[14px] font-black text-primary">
                {p.nombre.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                {p.editandoNombre ? (
                  <div className="flex flex-col gap-1">
                    <input
                      value={p.nombreEditado.nombre}
                      onChange={e => p.onCambiarNombre({ ...p.nombreEditado, nombre: e.target.value })}
                      placeholder="Nombre"
                      className="w-full rounded-md border border-[hsl(var(--wa-borde))] bg-[hsl(var(--wa-panel))] px-2 py-1 text-[12px] text-[hsl(var(--wa-texto))] outline-none"
                    />
                    <input
                      value={p.nombreEditado.apellido}
                      onChange={e => p.onCambiarNombre({ ...p.nombreEditado, apellido: e.target.value })}
                      placeholder="Apellido"
                      className="w-full rounded-md border border-[hsl(var(--wa-borde))] bg-[hsl(var(--wa-panel))] px-2 py-1 text-[12px] text-[hsl(var(--wa-texto))] outline-none"
                    />
                    <button
                      onClick={p.onGuardarNombre}
                      disabled={p.guardandoNombre}
                      className="mt-0.5 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      {p.guardandoNombre ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-[13.5px] font-bold text-[hsl(var(--wa-texto))]">
                        {p.nombre}
                      </span>
                      <button
                        onClick={p.onEmpezarEdicion}
                        title="Editar el nombre"
                        className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                    {seg && (
                      <span
                        title={seg.descripcion}
                        className={cn('mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold', seg.claseChip)}
                      >
                        {seg.label}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Contacto */}
            <div className="space-y-2 rounded-xl border border-[hsl(var(--wa-borde))] p-2.5">
              <Dato
                icono={Phone}
                valor={p.telefono}
                accion={
                  <a
                    href={`https://wa.me/${String(p.telefono).replace(/\D/g, '')}`}
                    target="_blank" rel="noreferrer"
                    title="Abrir en WhatsApp"
                    className="shrink-0"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                  </a>
                }
              />
              <Dato icono={Mail} valor={p.email} />
              <Dato icono={MapPin} valor={p.direccion} />
              <Dato icono={User} valor={cedula} />
              <Dato icono={Calendar} valor={p.clienteDesde ? `Cliente desde ${fechaCorta(p.clienteDesde)}` : null} />
              {p.nota && (
                <div className="flex items-start gap-2 border-t border-[hsl(var(--wa-borde))] pt-2">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--wa-texto-suave))]" aria-hidden />
                  <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-[hsl(var(--wa-texto-suave))]">
                    {p.nota}
                  </span>
                </div>
              )}
            </div>

            {/* Las tres cifras */}
            {desempeno ? (
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { v: String(desempeno.servicios), l: 'Servicios' },
                  { v: String(nVehiculos), l: 'Vehículos' },
                  { v: money(desempeno.total), l: 'Total gastado' },
                ].map(x => (
                  <div key={x.l} className="rounded-xl border border-[hsl(var(--wa-borde))] px-1.5 py-2 text-center">
                    <span className="block truncate text-[13px] font-black tabular-nums text-[hsl(var(--wa-texto))]">
                      {x.v}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] text-[hsl(var(--wa-texto-suave))]">{x.l}</span>
                  </div>
                ))}
              </div>
            ) : p.clienteId ? (
              <div className="rounded-xl border border-[hsl(var(--wa-borde))] px-2.5 py-2 text-center text-[11px] text-[hsl(var(--wa-texto-suave))]">
                Calculando su historial…
              </div>
            ) : (
              // Sin ficha no hay historial que enseñar, y decirlo es más útil
              // que tres ceros que parecen un cliente que nunca compró.
              <div className="rounded-xl border border-dashed border-[hsl(var(--wa-borde))] px-2.5 py-2 text-center text-[11px] text-[hsl(var(--wa-texto-suave))]">
                Este número aún no tiene ficha de cliente.
              </div>
            )}

            {desempeno && (
              <p className="flex items-center gap-1.5 px-0.5 text-[11px] text-[hsl(var(--wa-texto-suave))]">
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                Última visita: {textoUltimaVisita(desempeno.diasSinVenir)}
              </p>
            )}

            {/* Acciones rápidas */}
            <div>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-[hsl(var(--wa-texto-suave))]">
                Acciones rápidas
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <Accion
                  icono={<Calendar className="h-4 w-4" aria-hidden />} label="Agendar cita"
                  href="/dashboard/agenda"
                />
                <Accion
                  icono={<Wrench className="h-4 w-4" aria-hidden />} label="Presupuesto"
                  href="/dashboard/presupuestos"
                />
                <Accion
                  icono={<Phone className="h-4 w-4" aria-hidden />} label="Llamar"
                  href={`tel:${String(p.telefono).replace(/\D/g, '')}`}
                />
                <Accion
                  icono={<History className="h-4 w-4" aria-hidden />} label="Ver historial"
                  onClick={() => setPestana('historial')}
                />
                <Accion
                  icono={<UserPlus className="h-4 w-4" aria-hidden />} label="Contacto"
                  onClick={p.onEnviarContacto} cargando={p.enviandoContacto}
                />
                <Accion
                  icono={<Navigation className="h-4 w-4" aria-hidden />} label="Ubicación"
                  onClick={() => p.sedes[0] && p.onEnviarUbicacion(p.sedes[0])}
                />
              </div>
            </div>

            {/* Ubicaciones — se conserva el envío por sede, que ya existía. */}
            {p.sedes.length > 1 && (
              <div>
                <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-[hsl(var(--wa-texto-suave))]">
                  Enviar ubicación
                </p>
                <div className="space-y-1">
                  {p.sedes.map(s => (
                    <button
                      key={s.name}
                      onClick={() => p.onEnviarUbicacion(s)}
                      className="flex w-full items-center gap-2 rounded-lg border border-[hsl(var(--wa-borde))] px-2 py-1.5 text-left transition-colors hover:border-primary"
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[hsl(var(--wa-texto))]">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {pestana === 'vehiculos' && (
          <div className="space-y-2">
            {p.cargandoVehiculos && (
              <div className="flex items-center gap-2 py-2 text-[12px] text-[hsl(var(--wa-texto-suave))]">
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> Buscando vehículos…
              </div>
            )}

            {p.vehiculos.map((v, i) => (
              <div key={v.id} className="rounded-xl border border-[hsl(var(--wa-borde))] p-2.5">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[hsl(var(--wa-texto))]">
                    {v.marca} {v.modelo} {v.anio ? `${v.anio}` : ''}
                  </span>
                  {/* El primero es el que más usa: se marca para no confundir
                      cuál es «su carro» cuando tiene varios. */}
                  {i === 0 && p.vehiculos.length > 1 && (
                    <span className="shrink-0 rounded-md bg-blue-500/12 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-600 dark:text-blue-400">
                      Principal
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 pl-6">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase text-primary">
                    {v.placa}
                  </span>
                  {v.color && (
                    <span className="text-[10.5px] uppercase text-[hsl(var(--wa-texto-suave))]">{v.color}</span>
                  )}
                </div>
              </div>
            ))}

            {/* Lo que el bot recuerda pero aún no tiene ficha. Se enseña
                aparte y dicho: es información menos fiable. */}
            {(p.vehiculosMemoria?.length || 0) > 0 && (
              <div className="space-y-1.5 rounded-xl border border-dashed border-[hsl(var(--wa-borde))] p-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--wa-texto-suave))]">
                  Mencionados en el chat, sin ficha
                </p>
                {p.vehiculosMemoria!.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Car className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--wa-texto-suave))]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[hsl(var(--wa-texto-suave))]">
                      {[v.marca, v.modelo, v.anio].filter(Boolean).join(' ')}
                      {v.placa ? ` · ${v.placa}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!p.cargandoVehiculos && nVehiculos === 0 && (
              <p className="py-6 text-center text-[11.5px] text-[hsl(var(--wa-texto-suave))]">
                Sin vehículos registrados para este contacto.
              </p>
            )}
          </div>
        )}

        {pestana === 'historial' && (
          <div className="space-y-2">
            {servicios === null ? (
              <div className="flex items-center gap-2 py-2 text-[12px] text-[hsl(var(--wa-texto-suave))]">
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> Buscando servicios…
              </div>
            ) : servicios.length === 0 ? (
              <p className="py-6 text-center text-[11.5px] text-[hsl(var(--wa-texto-suave))]">
                {p.clienteId
                  ? 'Este cliente aún no tiene servicios registrados.'
                  : 'Este número no tiene ficha, así que no hay historial que mostrar.'}
              </p>
            ) : (
              servicios.map(s => (
                <div key={s.id} className="rounded-xl border border-[hsl(var(--wa-borde))] p-2.5">
                  <div className="flex items-start gap-2">
                    <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-[hsl(var(--wa-texto))]">
                        {s.descripcion}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] text-[hsl(var(--wa-texto-suave))]">
                        {fechaCorta(s.fecha)}{s.estado ? ` · ${s.estado.replace(/_/g, ' ')}` : ''}
                      </span>
                    </span>
                    {s.monto > 0 && (
                      <span className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {money(s.monto)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Un botón de la rejilla de acciones. */
function Accion({
  icono, label, href, onClick, cargando,
}: {
  icono: React.ReactNode; label: string;
  href?: string; onClick?: () => void; cargando?: boolean;
}) {
  const clases = 'flex flex-col items-center gap-1 rounded-xl border border-[hsl(var(--wa-borde))] px-1 py-2 text-[9.5px] font-semibold leading-tight text-[hsl(var(--wa-texto-suave))] transition-colors hover:border-primary hover:text-primary disabled:opacity-50';
  const cuerpo = (
    <>
      {cargando ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : icono}
      <span className="text-center">{label}</span>
    </>
  );
  if (href) return <a href={href} className={clases}>{cuerpo}</a>;
  return <button type="button" onClick={onClick} disabled={cargando} className={clases}>{cuerpo}</button>;
}
