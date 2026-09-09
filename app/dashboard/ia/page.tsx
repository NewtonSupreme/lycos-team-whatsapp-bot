'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, BookOpen, ChevronRight, History, Loader2,
  MoreVertical, Paperclip, SendHorizontal, Sparkles, Trash2, X,
} from 'lucide-react';
import ErpShell from '@/components/erp/ErpShell';
import RailAsistente from '@/components/ia/RailAsistente';
import Burbuja, { Escribiendo, type Mensaje } from '@/components/ia/Burbujas';
import ModalPortal from '@/components/ui/modal-portal';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import { cn } from '@/lib/utils';
import {
  GUIAS, TEMAS, buscarGuia, guiaComoTexto, guiasDeTema,
  type Guia, type TemaId,
} from '@/lib/ia/guias';

/** Número real de soporte del taller. */
const SOPORTE_WA = '584123343519';
const VIDEO_TUTORIAL = '/Tutorial/tutorial_compressed.mp4';

/** Las cinco preguntas del arranque, las que más se hacen. */
const SUGERENCIAS = [
  '¿Cómo crear un presupuesto?',
  'Registrar una venta',
  'Cómo agendar un servicio',
  'Generar un reporte',
  'Ayuda con facturación',
] as const;

const hora = () =>
  new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

const nuevoId = () => `m${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

type Vista = 'chat' | 'indice' | 'tema';

/**
 * El Asistente IA.
 *
 * Responde de dos maneras y la diferencia importa: si la pregunta coincide con
 * una guía del catálogo, contesta con sus pasos —verificados contra el código,
 * con los nombres reales de los botones—; si no, la manda al modelo, que tiene
 * acceso a los datos del taller pero puede equivocarse.
 *
 * Por eso las guías van primero. Un asistente que improvisa los pasos de una
 * pantalla que no conoce manda a buscar botones que no existen.
 */
export default function AsistenteIAPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  const { can } = useRolePermissions();

  const [montado, setMontado] = useState(false);
  const [vista, setVista] = useState<Vista>('chat');
  const [temaAbierto, setTemaAbierto] = useState<TemaId | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [verVideo, setVerVideo] = useState(false);
  const [guiaVisual, setGuiaVisual] = useState<Guia | null>(null);

  const finDelChat = useRef<HTMLDivElement>(null);

  useEffect(() => { setMontado(true); }, []);

  // Se baja al último mensaje, que es lo que se acaba de escribir.
  useEffect(() => {
    finDelChat.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, pensando]);

  /** ¿Se puede ver el módulo de esta guía? Sin permiso no se ofrece. */
  const puedeVer = useCallback(
    (permiso?: string) => !permiso || can(permiso as never, 'leer'),
    [can],
  );

  const guiasVisibles = useMemo(() => GUIAS.filter(g => puedeVer(g.permiso)), [puedeVer]);

  const responder = useCallback(async (pregunta: string) => {
    const texto = pregunta.trim();
    if (!texto || pensando) return;

    setVista('chat');
    setError('');
    setEntrada('');
    setMensajes(m => [...m, { id: nuevoId(), quien: 'yo', texto, hora: hora() }]);

    // ── Primero el catálogo de guías ────────────────────────────────────────
    const guia = buscarGuia(texto);
    if (guia) {
      if (!puedeVer(guia.permiso)) {
        setMensajes(m => [...m, {
          id: nuevoId(), quien: 'ia', hora: hora(),
          texto: `Esa función está en un módulo al que tu rol no tiene acceso. `
            + 'Pídele a un administrador que te lo habilite en Configuración → Roles y permisos.',
        }]);
        return;
      }
      // Una pausa mínima: la respuesta instantánea se lee como si no hubiera
      // pasado nada, y no se llega a ver que el mensaje se envió.
      setPensando(true);
      await new Promise(r => setTimeout(r, 420));
      setPensando(false);
      setMensajes(m => [...m, {
        id: nuevoId(), quien: 'ia', hora: hora(), guia, texto: guiaComoTexto(guia),
      }]);
      return;
    }

    // ── Si no hay guía, va al modelo, que sí conoce los datos del taller ────
    setPensando(true);
    try {
      // El contrato de `/api/ia/chat` es una conversación completa, no un
      // mensaje suelto: se le mandan los últimos turnos para que la respuesta
      // tenga contexto de lo que ya se preguntó.
      const r = await fetch('/api/ia/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...mensajes.slice(-6).map(x => ({
              role: x.quien === 'yo' ? 'user' : 'assistant',
              content: x.texto,
            })),
            { role: 'user', content: texto },
          ],
          sede_id: currentSede?.id || null,
          sede_nombre: currentSede?.nombre || null,
          user: user?.nombre || 'Administrador',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'El asistente no pudo responder');

      const respuesta = String(d.reply ?? d.response ?? d.message ?? '').trim();
      setMensajes(m => [...m, {
        id: nuevoId(), quien: 'ia', hora: hora(),
        texto: respuesta || 'No encontré respuesta para eso. Prueba con la Guía de la plataforma.',
      }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al consultar';
      setError(msg);
      setMensajes(m => [...m, {
        id: nuevoId(), quien: 'ia', hora: hora(),
        texto: `No pude consultar los datos del taller (${msg}). `
          + 'Las guías de la plataforma sí funcionan sin conexión al modelo: mira «Temas sugeridos».',
      }]);
    } finally {
      setPensando(false);
    }
  }, [pensando, puedeVer, currentSede?.id, currentSede?.nombre, user?.nombre, mensajes]);

  /** Muestra una guía en el chat sin pasar por el buscador. */
  const mostrarGuia = (g: Guia) => {
    setVista('chat');
    setMensajes(m => [
      ...m,
      { id: nuevoId(), quien: 'yo', texto: g.pregunta, hora: hora() },
      { id: nuevoId(), quien: 'ia', hora: hora(), guia: g, texto: guiaComoTexto(g) },
    ]);
  };

  const abrirSoporte = () => {
    const texto = encodeURIComponent(
      `Hola, soy ${user?.nombre || 'un usuario'} del sistema Lycos Team. Necesito ayuda con: `,
    );
    window.open(`https://wa.me/${SOPORTE_WA}?text=${texto}`, '_blank', 'noopener,noreferrer');
  };

  if (!montado) return null;

  const hayChat = mensajes.length > 0;

  return (
    <ErpShell buscador="Buscar clientes, vehículos, facturas, servicios..." altoFijo>
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <header className="mb-3.5 flex shrink-0 flex-wrap items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#fff1e7]">
          {/* eslint-disable-next-line @next/next/no-img-element -- retrato local del asistente */}
          <img src="/asistente/robot.png" alt="" className="h-full w-full object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-extrabold leading-tight tracking-tight text-[#16181d]">
            Asistente IA
            <span className="rounded-md bg-[#e7f0fe] px-2 py-[3px] text-[11px] font-semibold text-[#2563eb]">
              Beta
            </span>
          </h1>
          <p className="text-[13px] text-[#8a909c]">
            Tu aliado inteligente en la gestión del taller. Pregunta, aprende y haz más en menos tiempo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setVista('indice')}
            className="flex h-[42px] items-center gap-2 rounded-lg border border-[#e2e5ea] bg-white px-3.5 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <History className="h-4 w-4" aria-hidden />
            Ver historial
          </button>

          <div className="relative">
            <button
              onClick={() => setMenu(v => !v)}
              aria-label="Más opciones"
              aria-expanded={menu}
              className={cn(
                'flex h-[42px] w-[42px] items-center justify-center rounded-lg border transition-colors',
                menu ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] bg-white text-[#5b616e] hover:bg-[#f6f7f9]',
              )}
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>

            {menu && (
              <div className="absolute right-0 top-[48px] z-30 w-[236px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                <button
                  onClick={() => { setMenu(false); setVista('indice'); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  Guía de la plataforma
                </button>
                <button
                  onClick={() => { setMenu(false); setVerVideo(true); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Ver video tutorial
                </button>
                <button
                  onClick={() => { setMenu(false); setMensajes([]); setError(''); }}
                  disabled={!hayChat}
                  className="flex w-full items-center gap-2.5 border-t border-[#f2f3f5] px-3 py-2 text-left text-[12.5px] text-[#dc2626] hover:bg-[#fdeaea] disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Limpiar la conversación
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 xl:flex-row">
        {/* ── Columna del chat ───────────────────────────────────────── */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
          {vista === 'chat' ? (
            <>
              {/* Bienvenida: solo mientras no se haya preguntado nada */}
              {!hayChat && (
                <div className="flex shrink-0 flex-wrap items-center gap-5 border-b border-[#eef0f3] p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- retrato local del asistente */}
                  <img
                    src="/asistente/robot.png"
                    alt="Asistente IA de Lycos Team"
                    className="h-[104px] w-[104px] shrink-0 object-contain xl:h-[136px] xl:w-[136px]"
                  />

                  <div className="min-w-[260px] flex-1">
                    <h2 className="text-[21px] font-extrabold tracking-tight text-[#16181d]">
                      ¡Hola! Soy tu Asistente IA 👋
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#5b616e]">
                      Estoy aquí para ayudarte a usar la plataforma, resolver tus dudas y hacer tu
                      trabajo más fácil.
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#f97316]">
                      Puedes preguntarme sobre cualquier módulo, proceso o funcionalidad.
                    </p>

                    <div className="mt-3.5 flex flex-wrap gap-2">
                      {SUGERENCIAS.map(s => (
                        <button
                          key={s}
                          onClick={() => responder(s)}
                          className="h-[34px] rounded-full border border-[#e2e5ea] px-3.5 text-[12px] font-medium text-[#3d4350] transition-colors hover:border-[#f97316] hover:bg-[#fffaf6] hover:text-[#f97316]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <figure className="hidden w-[210px] shrink-0 rounded-xl bg-[#f4f5f7] p-4 lg:block">
                    <span className="text-[22px] leading-none text-[#c3c8d0]" aria-hidden>&ldquo;</span>
                    <blockquote className="text-center text-[13px] italic leading-relaxed text-[#5b616e]">
                      Pregúntame lo que necesites, estoy para ayudarte.
                    </blockquote>
                    <figcaption className="mt-2 text-right text-[11.5px] text-[#8a909c]">
                      — Asistente IA
                    </figcaption>
                  </figure>
                </div>
              )}

              {/* Conversación */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {mensajes.map(m => (
                  <Burbuja
                    key={m.id}
                    m={m}
                    onGuiaVisual={setGuiaVisual}
                    onVideo={() => setVerVideo(true)}
                    onIrAlModulo={ruta => router.push(ruta)}
                  />
                ))}
                {pensando && <Escribiendo />}
                <div ref={finDelChat} />
              </div>
            </>
          ) : vista === 'indice' ? (
            <IndiceGuias
              guias={guiasVisibles}
              onAbrir={mostrarGuia}
              onTema={t => { setTemaAbierto(t); setVista('tema'); }}
              onVolver={() => setVista('chat')}
              puedeVer={puedeVer}
            />
          ) : (
            <TemaGuias
              tema={temaAbierto}
              onAbrir={mostrarGuia}
              onVolver={() => setVista('indice')}
            />
          )}

          {/* ── Escribir ──────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-[#eef0f3] p-4">
            {error && (
              <p role="alert" className="mb-2.5 flex items-center gap-2 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2 text-[12px] text-[#b91c1c]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <form
              onSubmit={e => { e.preventDefault(); responder(entrada); }}
              className="flex items-center gap-2.5"
            >
              <button
                type="button"
                onClick={() => setVista('indice')}
                aria-label="Ver las guías de la plataforma"
                title="Ver las guías de la plataforma"
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#8a909c] hover:bg-[#f6f7f9]"
              >
                <Paperclip className="h-[18px] w-[18px]" aria-hidden />
              </button>

              <input
                value={entrada}
                onChange={e => setEntrada(e.target.value)}
                placeholder="Escribe tu pregunta aquí..."
                aria-label="Tu pregunta"
                disabled={pensando}
                className="h-[46px] min-w-0 flex-1 rounded-lg border border-[#e2e5ea] px-3.5 text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={pensando || !entrada.trim()}
                aria-label="Enviar"
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg bg-[#f97316] text-white transition-colors hover:bg-[#ea580c] disabled:opacity-40"
              >
                {pensando
                  ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
                  : <SendHorizontal className="h-[18px] w-[18px]" aria-hidden />}
              </button>
            </form>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-center text-[11px] text-[#9ba1ab] sm:text-left">
                Las guías de la plataforma están verificadas. Para el resto, el Asistente puede
                cometer errores: verifica la información importante.
              </p>
              <span className="flex items-center gap-1.5 text-[11px] text-[#9ba1ab]">
                <Sparkles className="h-3 w-3 text-[#2563eb]" aria-hidden />
                Con Gemini
              </span>
            </div>
          </div>
        </section>

        {/* ── Columna derecha ───────────────────────────────────────── */}
        <RailAsistente
          onTema={t => { setTemaAbierto(t); setVista('tema'); }}
          onGuiaPlataforma={() => setVista('indice')}
          onVideo={() => setVerVideo(true)}
          onFaq={() => setVista('indice')}
          onSoporte={abrirSoporte}
          puedeVer={t => puedeVer(t)}
        />
      </div>

      {/* ── El vídeo tutorial ────────────────────────────────────────── */}
      {verVideo && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-[900px] overflow-hidden rounded-2xl bg-[#16181d] shadow-2xl">
              <header className="flex items-center gap-3 px-4 py-3">
                <h2 className="flex-1 text-[14px] font-bold text-white">Video tutorial de la plataforma</h2>
                <button
                  onClick={() => setVerVideo(false)}
                  aria-label="Cerrar"
                  className="flex h-[32px] w-[32px] items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>
              <video src={VIDEO_TUTORIAL} controls autoPlay className="max-h-[75vh] w-full bg-black" />
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── La guía visual ───────────────────────────────────────────── */}
      {guiaVisual && (
        <ModalPortal>
          <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6">
            <div
              className="flex min-h-0 w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 48px)' }}
            >
              <header className="flex shrink-0 items-start gap-3 border-b border-[#eef0f3] px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
                  <BookOpen className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[16px] font-bold text-[#16181d]">{guiaVisual.titulo}</h2>
                  <p className="text-[12px] text-[#8a909c]">Guía visual, paso a paso</p>
                </div>
                <button
                  onClick={() => setGuiaVisual(null)}
                  aria-label="Cerrar"
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc] px-5 py-4">
                <ol className="space-y-2.5">
                  {guiaVisual.pasos.map((p, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-[#e8eaed] bg-white p-3.5">
                      <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f97316] text-[13px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] leading-snug text-[#16181d]">
                          {p.texto.replace(/\*\*/g, '')}
                        </span>
                        {p.nota && (
                          <span className="mt-1 block rounded-md bg-[#fff7ed] px-2 py-1.5 text-[11.5px] leading-snug text-[#9a3412]">
                            {p.nota}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>

                {guiaVisual.cierre && (
                  <p className="mt-3.5 rounded-xl border border-[#e8eaed] bg-white p-3.5 text-[12.5px] leading-relaxed text-[#5b616e]">
                    {guiaVisual.cierre.replace(/\*\*/g, '')}
                  </p>
                )}
              </div>

              <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[#eef0f3] px-5 py-3.5">
                <button
                  onClick={() => setVerVideo(true)}
                  className="h-[40px] rounded-lg border border-[#e2e5ea] px-4 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
                >
                  Ver video tutorial
                </button>
                {guiaVisual.ruta && (
                  <button
                    onClick={() => router.push(guiaVisual.ruta!)}
                    className="h-[40px] rounded-lg bg-[#f97316] px-4 text-[13px] font-semibold text-white hover:bg-[#ea580c]"
                  >
                    Ir al módulo
                  </button>
                )}
              </footer>
            </div>
          </div>
        </ModalPortal>
      )}
    </ErpShell>
  );
}

/** El índice completo: todas las guías agrupadas por módulo. */
function IndiceGuias({
  guias, onAbrir, onTema, onVolver, puedeVer,
}: {
  guias: readonly Guia[];
  onAbrir: (g: Guia) => void;
  onTema: (t: TemaId) => void;
  onVolver: () => void;
  puedeVer: (p?: string) => boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <header className="mb-4 flex items-center gap-2.5">
        <button
          onClick={onVolver}
          aria-label="Volver al chat"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#16181d]">Guía de la plataforma</h2>
          <p className="text-[12.5px] text-[#8a909c]">
            {guias.length} guías, escritas contra el sistema real. Toca una para verla en el chat.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {TEMAS.filter(t => puedeVer(t.id)).map(t => {
          const suyas = guiasDeTema(t.id).filter(g => guias.includes(g));
          if (suyas.length === 0) return null;
          return (
            <section key={t.id}>
              <button
                onClick={() => onTema(t.id)}
                className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#9ba1ab] hover:text-[#f97316]"
              >
                {t.titulo}
                <ChevronRight className="h-3 w-3" aria-hidden />
              </button>
              <ul className="overflow-hidden rounded-xl border border-[#e8eaed]">
                {suyas.map(g => (
                  <li key={g.id} className="border-b border-[#f2f3f5] last:border-0">
                    <button
                      onClick={() => onAbrir(g)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#fafbfc]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[#16181d]">{g.titulo}</span>
                        <span className="block truncate text-[11.5px] text-[#8a909c]">{g.pregunta}</span>
                      </span>
                      <span className="num shrink-0 rounded-md bg-[#f2f3f5] px-1.5 py-px text-[10.5px] text-[#8a909c]">
                        {g.pasos.length} pasos
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#c3c8d0]" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Las guías de un solo módulo. */
function TemaGuias({
  tema, onAbrir, onVolver,
}: {
  tema: TemaId | null;
  onAbrir: (g: Guia) => void;
  onVolver: () => void;
}) {
  const t = TEMAS.find(x => x.id === tema);
  const suyas = tema ? guiasDeTema(tema) : [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <header className="mb-4 flex items-center gap-2.5">
        <button
          onClick={onVolver}
          aria-label="Volver al índice"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#16181d]">{t?.titulo || 'Tema'}</h2>
          <p className="text-[12.5px] text-[#8a909c]">{t?.resumen}</p>
        </div>
      </header>

      {suyas.length === 0 ? (
        <p className="rounded-xl border border-[#e8eaed] px-4 py-10 text-center text-[13px] text-[#8a909c]">
          Todavía no hay guías escritas para este módulo.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {suyas.map(g => (
            <li key={g.id}>
              <button
                onClick={() => onAbrir(g)}
                className="w-full rounded-xl border border-[#e8eaed] p-4 text-left transition-colors hover:border-[#f97316] hover:bg-[#fffaf6]"
              >
                <span className="block text-[13.5px] font-semibold text-[#16181d]">{g.titulo}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[#8a909c]">{g.intro}</span>
                <span className="num mt-1.5 block text-[11px] text-[#f97316]">
                  {g.pasos.length} pasos · ver en el chat
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
