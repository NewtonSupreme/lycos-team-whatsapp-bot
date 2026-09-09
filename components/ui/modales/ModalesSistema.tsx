'use client';

import { useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, FileText, ImageIcon,
  LogOut, Loader2, Settings, ShieldAlert, Wrench,
} from 'lucide-react';
import ModalPortal from '@/components/ui/modal-portal';
import { cn } from '@/lib/utils';
import ModalBase, { BotonPrincipal, BotonSecundario } from './ModalBase';

/**
 * Modales de sistema: ver una imagen, ver un PDF, cerrar sesión, sesión
 * expirada y modo mantenimiento.
 *
 * Los tres últimos no son diálogos normales: interrumpen lo que se estuviera
 * haciendo, así que van por encima de todo y algunos no se pueden cerrar. Una
 * sesión expirada que se puede descartar deja al usuario tecleando en una
 * pantalla que ya no guarda nada.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 13 · Vista de imagen
// ─────────────────────────────────────────────────────────────────────────────
interface PropsVisor {
  abierto: boolean;
  onCerrar: () => void;
  imagenes: readonly { url: string; pie?: string }[];
  titulo?: string;
  indiceInicial?: number;
}

/**
 * El visor solo monta su contenido mientras está abierto.
 *
 * Así el índice de la imagen nace en el que se pidió, sin tener que
 * sincronizarlo desde un efecto: montar de nuevo es más simple —y más
 * predecible— que corregir el estado después de pintar.
 */
export function VisorImagenes(p: PropsVisor) {
  if (!p.abierto || p.imagenes.length === 0) return null;
  return <VisorAbierto {...p} />;
}

function VisorAbierto({
  abierto, onCerrar, imagenes, titulo, indiceInicial = 0,
}: PropsVisor) {
  const [i, setI] = useState(indiceInicial);

  // Las flechas del teclado pasan de una a otra: es lo que espera cualquiera
  // que abra una galería.
  useEffect(() => {
    if (imagenes.length < 2) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setI(v => (v - 1 + imagenes.length) % imagenes.length);
      if (e.key === 'ArrowRight') setI(v => (v + 1) % imagenes.length);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [imagenes.length]);

  const actual = imagenes[Math.min(i, imagenes.length - 1)];

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo || 'Imagen'}
      subtitulo={imagenes.length > 1 ? `${i + 1} de ${imagenes.length}` : undefined}
      icono={<ImageIcon className="h-[18px] w-[18px]" aria-hidden />}
      ancho="lg"
      pie={
        <>
          <a
            href={actual.url}
            download
            target="_blank"
            rel="noreferrer"
            className="flex h-[40px] items-center gap-2 rounded-lg border border-[#e2e5ea] px-4 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Download className="h-4 w-4" aria-hidden />
            Descargar
          </a>
          <BotonSecundario onClick={onCerrar}>Cerrar</BotonSecundario>
        </>
      }
    >
      <div className="relative overflow-hidden rounded-xl bg-[#16181d]">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario, de dominio arbitrario */}
        <img src={actual.url} alt={actual.pie || ''} className="mx-auto max-h-[58vh] w-auto object-contain" />

        {imagenes.length > 1 && (
          <>
            <BotonGaleria lado="izq" onClick={() => setI(v => (v - 1 + imagenes.length) % imagenes.length)} />
            <BotonGaleria lado="der" onClick={() => setI(v => (v + 1) % imagenes.length)} />
          </>
        )}
      </div>

      {actual.pie && <p className="mt-2.5 text-center text-[12.5px] text-[#5b616e]">{actual.pie}</p>}
    </ModalBase>
  );
}

function BotonGaleria({ lado, onClick }: { lado: 'izq' | 'der'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={lado === 'izq' ? 'Anterior' : 'Siguiente'}
      className={cn(
        'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#16181d] transition-colors hover:bg-white',
        lado === 'izq' ? 'left-2' : 'right-2',
      )}
    >
      {lado === 'izq'
        ? <ChevronLeft className="h-5 w-5" aria-hidden />
        : <ChevronRight className="h-5 w-5" aria-hidden />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 14 · Vista de PDF / documento
// ─────────────────────────────────────────────────────────────────────────────
export function VisorDocumento({
  abierto, onCerrar, url, titulo,
}: {
  abierto: boolean; onCerrar: () => void; url: string; titulo: string;
}) {
  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      icono={<FileText className="h-[18px] w-[18px]" aria-hidden />}
      ancho="xl"
      pie={
        <>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex h-[40px] items-center gap-2 rounded-lg border border-[#e2e5ea] px-4 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Abrir en otra pestaña
          </a>
          <BotonSecundario onClick={onCerrar}>Cerrar</BotonSecundario>
        </>
      }
    >
      {/* El visor del navegador ya trae zoom, paginación e impresión: montar
          uno propio sería reimplementar peor lo que ya funciona. */}
      <iframe src={url} title={titulo} className="h-[62vh] w-full rounded-xl border border-[#e8eaed]" />
    </ModalBase>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 22 · Cerrar sesión
// ─────────────────────────────────────────────────────────────────────────────
export function ModalCerrarSesion({
  abierto, onCerrar, onConfirmar, ocupado,
}: {
  abierto: boolean; onCerrar: () => void; onConfirmar: () => void; ocupado?: boolean;
}) {
  if (!abierto) return null;
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/45 p-4"
        onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}
      >
        <div role="alertdialog" aria-modal="true" aria-label="Cerrar sesión"
          className="w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="px-6 pb-2 pt-7 text-center">
            <span className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#fdeaea] text-[#dc2626]">
              <LogOut className="h-[28px] w-[28px]" aria-hidden />
            </span>
            <h2 className="mt-4 text-[18px] font-extrabold tracking-tight text-[#16181d]">¿Cerrar sesión?</h2>
            <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-[#5b616e]">
              ¿Estás seguro de que deseas cerrar sesión?
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 p-5 sm:flex-row">
            <button
              onClick={onCerrar}
              disabled={ocupado}
              className="h-[42px] flex-1 rounded-lg border border-[#e2e5ea] text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-45"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirmar}
              disabled={ocupado}
              autoFocus
              className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#dc2626] text-[13px] font-semibold text-white hover:bg-[#b91c1c] disabled:opacity-45"
            >
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 23 · Sesión expirada
// ─────────────────────────────────────────────────────────────────────────────
export function ModalSesionExpirada({ abierto, onIniciar }: { abierto: boolean; onIniciar: () => void }) {
  if (!abierto) return null;
  return (
    <ModalPortal>
      {/* Sin forma de cerrarlo: la sesión ya no vale, y descartarlo dejaría a
          alguien tecleando en una pantalla que no guarda nada. */}
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4">
        <div role="alertdialog" aria-modal="true" aria-label="Sesión expirada"
          className="w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start gap-3.5 p-6">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#fdeaea] text-[#dc2626]">
              <ShieldAlert className="h-[24px] w-[24px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-extrabold tracking-tight text-[#16181d]">Sesión expirada</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#5b616e]">
                Tu sesión ha expirado por seguridad. Por favor, inicia sesión nuevamente.
              </p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <button
              onClick={onIniciar}
              autoFocus
              className="h-[42px] w-full rounded-lg bg-[#f97316] text-[13px] font-semibold text-white hover:bg-[#ea580c]"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 24 · Modo mantenimiento
// ─────────────────────────────────────────────────────────────────────────────
export function ModalMantenimiento({ abierto, mensaje }: { abierto: boolean; mensaje?: string }) {
  if (!abierto) return null;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4">
        <div role="alertdialog" aria-modal="true" aria-label="En mantenimiento"
          className="w-full max-w-[400px] overflow-hidden rounded-2xl bg-white p-6 text-center shadow-2xl">
          <span className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#f4f5f7] text-[#5b616e]">
            <Settings className="h-[30px] w-[30px] animate-spin" style={{ animationDuration: '4s' }} aria-hidden />
          </span>
          <h2 className="mt-4 text-[18px] font-extrabold tracking-tight text-[#16181d]">En mantenimiento</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-[#5b616e]">
            {mensaje || 'Estamos realizando mejoras en el sistema. Volveremos pronto.'}
          </p>
        </div>
      </div>
    </ModalPortal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 18 · Cambio de estado
// ─────────────────────────────────────────────────────────────────────────────
export interface OpcionEstado {
  id: string;
  label: string;
  color: string;
}

interface PropsEstado {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (estado: string, nota: string) => void;
  estadoActual: string;
  opciones: readonly OpcionEstado[];
  titulo?: string;
  ocupado?: boolean;
}

/**
 * Se monta solo mientras está abierto, así cada vez empieza en blanco.
 *
 * Heredar la elección anterior invita a confirmar sin mirar, que en un cambio
 * de estado es exactamente lo que no debe pasar.
 */
export function ModalCambiarEstado(p: PropsEstado) {
  if (!p.abierto) return null;
  return <CambiarEstadoAbierto {...p} />;
}

function CambiarEstadoAbierto({
  abierto, onCerrar, onConfirmar, estadoActual, opciones, titulo = 'Cambiar estado', ocupado,
}: PropsEstado) {
  const [elegido, setElegido] = useState('');
  const [nota, setNota] = useState('');

  const actual = opciones.find(o => o.id === estadoActual);

  return (
    <ModalBase
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      icono={<Wrench className="h-[18px] w-[18px]" aria-hidden />}
      ancho="sm"
      bloqueado={ocupado}
      pie={
        <>
          <BotonSecundario onClick={onCerrar} disabled={ocupado}>Cancelar</BotonSecundario>
          <BotonPrincipal
            onClick={() => onConfirmar(elegido, nota)}
            disabled={ocupado || !elegido || elegido === estadoActual}
          >
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Actualizar
          </BotonPrincipal>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[12px] text-[#8a909c]">Estado actual</span>
        <span
          className="rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
          style={{ background: `${actual?.color || '#8a909c'}1a`, color: actual?.color || '#8a909c' }}
        >
          {actual?.label || estadoActual}
        </span>
      </div>

      <p className="mb-1.5 text-[11.5px] font-medium text-[#5b616e]">Nuevo estado</p>
      <ul className="space-y-1">
        {opciones.map(o => {
          const esActual = o.id === estadoActual;
          return (
            <li key={o.id}>
              <button
                onClick={() => setElegido(o.id)}
                disabled={esActual}
                aria-pressed={elegido === o.id}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40',
                  elegido === o.id ? 'border-[#f97316] bg-[#fff4ec]' : 'border-[#e8eaed] hover:bg-[#fafbfc]',
                )}
              >
                <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />
                <span className="flex-1 text-[12.5px] font-medium text-[#16181d]">{o.label}</span>
                {esActual && <span className="text-[10.5px] text-[#9ba1ab]">actual</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11.5px] font-medium text-[#5b616e]">Nota (opcional)</span>
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          rows={2}
          placeholder="Por qué cambia de estado"
          className="w-full resize-none rounded-lg border border-[#e2e5ea] px-3 py-2 text-[13px] outline-none placeholder:text-[#c3c8d0] focus:border-[#f97316]"
        />
      </label>
    </ModalBase>
  );
}
