'use client';

import {
  ArrowRight, BadgeCheck, BookOpen, CalendarClock, ClipboardCheck, FileSignature,
  FileText, Mail, MapPin, Phone, Plane, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRoleMeta } from '@/types';
import {
  ESTADO_LABEL, ESTADO_TINTE, antiguedadTexto, fechaCorta, type EmpleadoRRHH, type ResumenRRHH,
} from './tipos';
import Avatar from './Avatar';

export type AccionRRHH = 'asistencia' | 'vacaciones' | 'contrato' | 'evaluacion';

interface Props {
  empleado: EmpleadoRRHH | null;
  resumen: ResumenRRHH;
  sedeNombre?: string;
  canEdit: boolean;
  onIrA: (tab: string) => void;
  onFicha: () => void;
  onAccion: (a: AccionRRHH) => void;
}

const ESTADO_CAPACITACION: Record<string, string> = {
  completado: 'bg-[#e8f7ee] text-[#15803d]',
  en_curso: 'bg-[#e7f0fe] text-[#1d4ed8]',
  pendiente: 'bg-[#f2f3f5] text-[#5b616e]',
};

export default function PerfilEmpleado({
  empleado, resumen, sedeNombre, canEdit, onIrA, onFicha, onAccion,
}: Props) {
  // Última evaluación y capacitaciones del empleado seleccionado.
  const evaluacion = empleado
    ? resumen.evaluaciones.find(e => e.empleado_id === empleado.id)
    : null;
  const capacitaciones = empleado
    ? resumen.capacitaciones.filter(c => c.empleado_id === empleado.id).slice(0, 3)
    : [];

  const puntaje = evaluacion ? Number(evaluacion.puntaje) : null;
  const juicio = puntaje === null ? ''
    : puntaje >= 4.5 ? 'Excelente'
      : puntaje >= 3.5 ? 'Bueno'
        : puntaje >= 2.5 ? 'Regular' : 'A mejorar';

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 xl:w-[360px]">
      {/* Ficha */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Perfil del empleado</h2>
          {empleado && (
            <button onClick={onFicha} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
              Ver perfil completo
              <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          )}
        </header>

        {!empleado ? (
          <p className="py-8 text-center text-[12.5px] leading-snug text-[#8a909c]">
            Elige a alguien del listado
            <br />
            para ver su ficha.
          </p>
        ) : (
          <>
            <div className="mt-3 flex gap-3.5">
              {/* Hueco del retrato, del tamaño de la foto definitiva. */}
              <Avatar
                nombre={empleado.nombre}
                url={(empleado.foto_url || empleado.avatar_url) as string | null}
                size={100}
                className="!rounded-xl"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate text-[16px] font-extrabold text-[#16181d]">{empleado.nombre}</h3>
                  <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-[2px] text-[10.5px] font-medium', ESTADO_TINTE[empleado.estado])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {ESTADO_LABEL[empleado.estado]}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#8a909c]">
                  {empleado.cargo || getRoleMeta(empleado.rol)?.label || empleado.rol}
                </p>

                <dl className="mt-2.5 space-y-1.5 text-[11.5px] text-[#3d4350]">
                  <Dato icono={<BadgeCheck className="h-[13px] w-[13px]" aria-hidden />} valor={empleado.cedula ? `C.I. ${empleado.cedula}` : 'Sin cédula cargada'} />
                  <Dato icono={<Phone className="h-[13px] w-[13px]" aria-hidden />} valor={empleado.telefono || 'Sin teléfono'} />
                  <Dato icono={<Mail className="h-[13px] w-[13px]" aria-hidden />} valor={empleado.email || 'Sin correo'} />
                  <Dato icono={<MapPin className="h-[13px] w-[13px]" aria-hidden />} valor={sedeNombre || 'Sin sede'} />
                  <Dato
                    icono={<CalendarClock className="h-[13px] w-[13px]" aria-hidden />}
                    valor={empleado.fecha_ingreso
                      ? `Ingreso: ${fechaCorta(empleado.fecha_ingreso)} (${antiguedadTexto(empleado.fecha_ingreso)})`
                      : 'Sin fecha de ingreso'}
                  />
                </dl>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {[
                { label: 'Ficha', tab: 'personal' },
                { label: 'Contratos', tab: 'documentos' },
                { label: 'Documentos', tab: 'documentos' },
                { label: 'Historial', tab: 'asistencia' },
              ].map(b => (
                <button
                  key={b.label}
                  onClick={() => (b.label === 'Ficha' ? onFicha() : onIrA(b.tab))}
                  className="h-[32px] rounded-lg border border-[#e2e5ea] text-[11.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  {b.label}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Desempeño */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Desempeño (última evaluación)</h2>
          <button onClick={() => onIrA('evaluaciones')} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver evaluaciones
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        {!empleado || !evaluacion || puntaje === null ? (
          <p className="py-4 text-[11.5px] leading-snug text-[#9ba1ab]">
            {empleado ? `${empleado.nombre} aún no tiene evaluaciones registradas.` : 'Elige a alguien para ver su desempeño.'}
          </p>
        ) : (
          <div className="mt-2.5 flex gap-4">
            <div className="shrink-0">
              <p className="num text-[34px] font-extrabold leading-none text-[#16181d]">
                {puntaje.toFixed(1)}
                <span className="text-[15px] font-bold text-[#9ba1ab]"> / 5</span>
              </p>
              <div className="mt-1 flex gap-0.5" role="img" aria-label={`${puntaje} de 5`}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    className={cn('h-[15px] w-[15px]', n <= Math.round(puntaje) ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-[#d5d9e0]')}
                    aria-hidden
                  />
                ))}
              </div>
              <p className="mt-1 text-[12px] font-semibold text-[#16a34a]">{juicio}</p>
            </div>

            <blockquote className="min-w-0 flex-1 rounded-lg border border-[#eef0f3] bg-[#fafbfc] p-2.5">
              <p className="text-[11.5px] leading-snug text-[#3d4350]">
                {evaluacion.comentario ? `“${evaluacion.comentario}”` : 'Sin comentario.'}
              </p>
              <footer className="num mt-1.5 text-[10.5px] text-[#9ba1ab]">
                Evaluación: {fechaCorta(evaluacion.fecha)}
                {evaluacion.evaluador ? ` · ${evaluacion.evaluador}` : ''}
              </footer>
            </blockquote>
          </div>
        )}
      </section>

      {/* Capacitación */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Capacitación reciente</h2>
          <button onClick={() => onIrA('capacitaciones')} className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#f97316] hover:underline">
            Ver todas
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </header>

        {capacitaciones.length === 0 ? (
          <p className="py-4 text-[11.5px] leading-snug text-[#9ba1ab]">
            {empleado ? 'Sin capacitaciones registradas.' : 'Elige a alguien para ver su capacitación.'}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {capacitaciones.map(c => (
              <li key={c.id} className="flex items-center gap-2.5">
                <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md bg-[#e7f0fe] text-[#2563eb]">
                  <BookOpen className="h-[14px] w-[14px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12px] font-medium text-[#16181d]">{c.titulo}</span>
                  <span className="num block text-[10.5px] text-[#9ba1ab]">{fechaCorta(c.fecha)}</span>
                </span>
                <span className={cn('shrink-0 rounded-md px-2 py-[2px] text-[10.5px] font-medium capitalize', ESTADO_CAPACITACION[c.estado] || ESTADO_CAPACITACION.pendiente)}>
                  {String(c.estado).replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Acciones rápidas */}
      <section className="rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
        <h2 className="text-[14.5px] font-bold text-[#16181d]">Acciones rápidas</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {([
            { id: 'asistencia', label: 'Registrar asistencia', icono: ClipboardCheck, tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
            { id: 'vacaciones', label: 'Asignar vacaciones', icono: Plane, tinte: 'bg-[#fff1e7] text-[#f97316]' },
            { id: 'contrato', label: 'Generar contrato', icono: FileSignature, tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
            { id: 'evaluacion', label: 'Evaluar desempeño', icono: FileText, tinte: 'bg-[#f0eafc] text-[#7c3aed]' },
          ] as const).map(a => (
            <button
              key={a.id}
              onClick={() => onAccion(a.id)}
              disabled={!canEdit}
              title={!canEdit ? 'No tienes permiso para editar personal' : undefined}
              className="flex h-[52px] items-center gap-2 rounded-lg border border-[#eef0f3] px-2.5 text-left text-[11.5px] font-medium text-[#3d4350] transition-colors hover:border-[#e2e5ea] hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md ${a.tinte}`}>
                <a.icono className="h-[14px] w-[14px]" aria-hidden />
              </span>
              <span className="min-w-0 leading-tight">{a.label}</span>
            </button>
          ))}
        </div>

        {!empleado && (
          <p className="mt-2 text-[10.5px] leading-snug text-[#9ba1ab]">
            Elige primero a un empleado del listado: las acciones se registran a su nombre.
          </p>
        )}
      </section>
    </div>
  );
}

function Dato({ icono, valor }: { icono: React.ReactNode; valor: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[#9ba1ab]">{icono}</span>
      <span className="num min-w-0 truncate">{valor}</span>
    </div>
  );
}
