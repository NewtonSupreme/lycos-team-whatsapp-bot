'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Clock, Image as ImageIcon, Loader2, MessageSquareText, Siren, Sparkles, Tag, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { dentroDeHorario, SALUDO_DEFECTO, type ConfigBot } from '@/lib/bot/config';
import { TIPOS_ATENCION } from '@/lib/whatsapp/alertas-atencion';

/**
 * Configuración › Bot de WhatsApp.
 *
 * Cada interruptor está conectado al bot de verdad (lib/bot/config.ts dice dónde) y se guarda
 * al tocarlo; el bot lo aplica en el siguiente mensaje que llegue (como mucho ~20 s).
 */

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function PanelBot({ puedeEditar }: { puedeEditar: boolean }) {
  const [c, setC] = useState<ConfigBot | null>(null);
  const [meta, setMeta] = useState<{ actualizado: string | null; por: string | null; vista: string }>({ actualizado: null, por: null, vista: '' });
  const [guardando, setGuardando] = useState<string | null>(null);
  const [bienvenida, setBienvenida] = useState('');
  const [msgHorario, setMsgHorario] = useState('');

  const cargar = useCallback(async () => {
    const r = await fetch('/api/configuracion/bot', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || 'No se pudo cargar la configuración del bot.'); return; }
    setC(d.config); setBienvenida(d.config.bienvenida.texto); setMsgHorario(d.config.horario.mensaje);
    setMeta({ actualizado: d.actualizado, por: d.por, vista: d.vistaBienvenida });
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async (clave: string, cambios: Partial<ConfigBot>) => {
    if (!c) return;
    const antes = c;
    setC({ ...c, ...cambios } as ConfigBot); setGuardando(clave);
    try {
      const r = await fetch('/api/configuracion/bot', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      setC(d.config); setMeta({ actualizado: d.actualizado, por: d.por, vista: d.vistaBienvenida });
      toast.success('Guardado. El bot lo aplica desde el próximo mensaje.');
    } catch (e) { setC(antes); toast.error((e as Error).message); } finally { setGuardando(null); }
  };

  const estadoAhora = useMemo(() => {
    if (!c) return null;
    if (!c.bot_whatsapp_global_activo) return { tono: 'rojo', texto: 'El bot está APAGADO: no le contesta a nadie. Los mensajes llegan al CRM y avisan para responder a mano.' };
    if (!c.responder_clientes) return { tono: 'ambar', texto: 'El bot NO le contesta a los clientes: los registra y avisa a los asesores para que respondan ellos.' };
    if (!dentroDeHorario(c.horario)) return { tono: 'ambar', texto: c.horario.fuera === 'responder' ? 'Fuera de horario, pero el bot sigue contestando normal.' : c.horario.fuera === 'mensaje' ? 'Fuera de horario: el bot manda el mensaje de «cerrado» (una vez al día por cliente) y avisa a los asesores.' : 'Fuera de horario: el bot no contesta; los mensajes avisan a los asesores.' };
    return { tono: 'verde', texto: 'El bot está contestando a los clientes ahora mismo.' };
  }, [c]);

  if (!c) return <p className="flex items-center gap-2 py-10 text-[13px] text-[#5b616e]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando la configuración del bot…</p>;
  const des = !puedeEditar || !!guardando;

  return (
    <div className="space-y-4">
      {estadoAhora && (
        <div className={cn('flex items-start gap-3 rounded-xl border p-3.5',
          estadoAhora.tono === 'verde' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : estadoAhora.tono === 'ambar' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-900')}>
          <Bot className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold">{estadoAhora.texto}</p>
            {meta.actualizado && <p className="mt-0.5 text-[11.5px] opacity-75">Último cambio: {new Date(meta.actualizado).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' })}{meta.por ? ` · ${meta.por}` : ''}</p>}
          </div>
        </div>
      )}

      <Seccion icono={<Bot className="h-4 w-4" />} titulo="General">
        <Interruptor t="Bot encendido" d="Interruptor general. Apagado, el bot no le contesta a nadie; los mensajes llegan al CRM y avisan." v={c.bot_whatsapp_global_activo} des={des} on={v => guardar('global', { bot_whatsapp_global_activo: v })} cargando={guardando === 'global'} />
        <Interruptor t="Contestar a los clientes" d="Apagado, el bot solo registra los mensajes de clientes y avisa a los asesores para que respondan ellos." v={c.responder_clientes} des={des} on={v => guardar('clientes', { responder_clientes: v })} cargando={guardando === 'clientes'} />
        <Interruptor t="Modo Dios para el personal" d="El personal puede usar el bot para registrar servicios, consultar inventario, reportes, etc. Apagado, el bot no le contesta al personal." v={c.modo_dios} des={des} on={v => guardar('dios', { modo_dios: v })} cargando={guardando === 'dios'} />
      </Seccion>

      <Seccion icono={<Clock className="h-4 w-4" />} titulo="Horario de atención">
        <Interruptor t="Usar horario de atención" d="Fuera del horario el bot hace lo que elijas abajo. Apagado, contesta las 24 horas." v={c.horario.activo} des={des} on={v => guardar('horario', { horario: { ...c.horario, activo: v } })} cargando={guardando === 'horario'} />
        {c.horario.activo && (
          <div className="space-y-3 border-t border-[#f0f1f4] px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {DIAS.map((d, i) => {
                const on = c.horario.dias.includes(i);
                return <button key={d} type="button" disabled={des} onClick={() => guardar('horario', { horario: { ...c.horario, dias: on ? c.horario.dias.filter(x => x !== i) : [...c.horario.dias, i].sort() } })}
                  className={cn('h-8 w-12 rounded-lg text-[12px] font-semibold', on ? 'bg-[#f97316] text-white' : 'bg-[#f2f3f5] text-[#5b616e]')}>{d}</button>;
              })}
              <span className="ml-2 flex items-center gap-1.5 text-[12.5px] text-[#5b616e]">
                de <input type="time" value={c.horario.desde} disabled={des} onChange={e => guardar('horario', { horario: { ...c.horario, desde: e.target.value } })} className="h-8 rounded-lg border border-[#e2e5ea] px-2" />
                a <input type="time" value={c.horario.hasta} disabled={des} onChange={e => guardar('horario', { horario: { ...c.horario, hasta: e.target.value } })} className="h-8 rounded-lg border border-[#e2e5ea] px-2" />
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {([['responder', 'Contestar igual', 'El bot atiende normal.'], ['mensaje', 'Mensaje de cerrado', 'Una vez al día por cliente, y avisa.'], ['silencio', 'No contestar', 'Solo avisa a los asesores.']] as const).map(([k, t, d]) => (
                <button key={k} type="button" disabled={des} onClick={() => guardar('horario', { horario: { ...c.horario, fuera: k } })}
                  className={cn('rounded-xl border px-3 py-2 text-left', c.horario.fuera === k ? 'border-[#f97316] bg-[#fff7f0]' : 'border-[#e2e5ea]')}>
                  <span className="block text-[12.5px] font-bold text-[#16181d]">{t}</span><span className="block text-[11px] text-[#5b616e]">{d}</span>
                </button>
              ))}
            </div>
            {c.horario.fuera === 'mensaje' && (
              <div>
                <textarea value={msgHorario} disabled={!puedeEditar} onChange={e => setMsgHorario(e.target.value)} rows={3} className="w-full rounded-lg border border-[#e2e5ea] p-2.5 text-[13px]" />
                <button type="button" disabled={des || msgHorario === c.horario.mensaje} onClick={() => guardar('horario', { horario: { ...c.horario, mensaje: msgHorario } })} className="mt-1 h-8 rounded-lg bg-[#16181d] px-3 text-[12px] font-bold text-white disabled:opacity-40">Guardar mensaje</button>
              </div>
            )}
          </div>
        )}
      </Seccion>

      <Seccion icono={<MessageSquareText className="h-4 w-4" />} titulo="Mensaje de bienvenida">
        <Interruptor t="Bienvenida fija al iniciar el día" d="La primera vez que un cliente escribe en el día, el bot empieza con este mensaje exacto. Apagado, saluda corto y va al grano." v={c.bienvenida.activa} des={des} on={v => guardar('bienv', { bienvenida: { ...c.bienvenida, activa: v } })} cargando={guardando === 'bienv'} />
        {c.bienvenida.activa && (
          <div className="space-y-2 border-t border-[#f0f1f4] px-4 py-3">
            <p className="text-[11.5px] text-[#5b616e]">Puedes usar <code className="rounded bg-[#f2f3f5] px-1">{'{saludo}'}</code> (Buenos días / tardes / noches según la hora) y <code className="rounded bg-[#f2f3f5] px-1">{'{nombre}'}</code> (el nombre del cliente si se sabe).</p>
            <textarea value={bienvenida} disabled={!puedeEditar} onChange={e => setBienvenida(e.target.value)} rows={4} maxLength={700} className="w-full rounded-lg border border-[#e2e5ea] p-2.5 text-[13px]" />
            <div className="rounded-xl bg-[#e7fbe9] p-3 text-[13px] text-[#14532d]">
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[#15803d]">Así lo verá el cliente</p>
              {bienvenida.replace(/\{saludo\}/g, 'Buenos días').replace(/\{nombre\}/g, ', María').replace(/\s+([,.!?])/g, '$1')}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={des || bienvenida === c.bienvenida.texto || !bienvenida.trim()} onClick={() => guardar('bienv', { bienvenida: { ...c.bienvenida, texto: bienvenida } })} className="h-8 rounded-lg bg-[#16181d] px-3 text-[12px] font-bold text-white disabled:opacity-40">Guardar bienvenida</button>
              <button type="button" disabled={!puedeEditar} onClick={() => setBienvenida(SALUDO_DEFECTO)} className="h-8 rounded-lg border border-[#e2e5ea] px-3 text-[12px] font-semibold text-[#3d4350]">Usar la recomendada</button>
            </div>
          </div>
        )}
      </Seccion>

      <Seccion icono={<Tag className="h-4 w-4" />} titulo="Precios">
        <Interruptor t="Dar precios" d="El bot da los precios de la lista del inventario (divisa, contado en Bs y Cashea). Apagado, pasa al asesor cuando preguntan precio." v={c.dar_precios} des={des} on={v => guardar('precios', { dar_precios: v })} cargando={guardando === 'precios'} />
        <Interruptor t="Ofrecer Cashea" d="Explica y calcula Cashea por nivel (1 = 60 %, 2 = 50 %, 3 al 6 = 40 %). Apagado, dice que lo consulten con el asesor." v={c.ofrecer_cashea} des={des} on={v => guardar('cashea', { ofrecer_cashea: v })} cargando={guardando === 'cashea'} />
      </Seccion>

      <Seccion icono={<Workflow className="h-4 w-4" />} titulo="Respuestas automáticas">
        <Interruptor t="Ubicación del taller" d="Cuando preguntan cómo llegar: mapa, video, beneficios y tarjeta de la sede." v={c.flujo_ubicacion} des={des} on={v => guardar('ubic', { flujo_ubicacion: v })} cargando={guardando === 'ubic'} />
        <Interruptor t="Redes sociales" d="Cuando piden las redes: enlaces de Instagram y TikTok." v={c.flujo_redes} des={des} on={v => guardar('redes', { flujo_redes: v })} cargando={guardando === 'redes'} />
        <Interruptor t="Tarjeta del asesor" d="Cuando hace falta una persona, el bot comparte el contacto del asesor." v={c.tarjeta_asesor} des={des} on={v => guardar('tarjeta', { tarjeta_asesor: v })} cargando={guardando === 'tarjeta'} />
        <Interruptor t="Fotos de silenciadores" d="Envía la foto del modelo que recomienda (CL30, CLH40, CL60…)." v={c.imagenes_silenciadores} des={des} on={v => guardar('fotos', { imagenes_silenciadores: v })} cargando={guardando === 'fotos'} />
      </Seccion>

      <Seccion icono={<ImageIcon className="h-4 w-4" />} titulo="Lo que el bot entiende">
        <Interruptor t="Notas de voz" d="Transcribe los audios y los contesta." v={c.multimedia.audio} des={des} on={v => guardar('m-audio', { multimedia: { ...c.multimedia, audio: v } })} cargando={guardando === 'm-audio'} />
        <Interruptor t="Fotos" d="Mira las fotos (carro, pieza, comprobante) y responde según lo que ve." v={c.multimedia.imagen} des={des} on={v => guardar('m-img', { multimedia: { ...c.multimedia, imagen: v } })} cargando={guardando === 'm-img'} />
        <Interruptor t="Videos" d="Mira y escucha los videos (ruidos del motor o del escape, humo, testigos)." v={c.multimedia.video} des={des} on={v => guardar('m-vid', { multimedia: { ...c.multimedia, video: v } })} cargando={guardando === 'm-vid'} />
        <Interruptor t="Stickers" d="Entiende qué quiere decir el sticker (gracias, ok, risa…) y contesta acorde." v={c.multimedia.sticker} des={des} on={v => guardar('m-stk', { multimedia: { ...c.multimedia, sticker: v } })} cargando={guardando === 'm-stk'} />
      </Seccion>

      <Seccion icono={<Siren className="h-4 w-4" />} titulo="Avisos a los asesores">
        <Interruptor t="Notificación por cada mensaje" d="Push a quien atiende WhatsApp con cada mensaje de cliente (una por conversación, suena con cada mensaje nuevo)." v={c.push_mensajes} des={des} on={v => guardar('push', { push_mensajes: v })} cargando={guardando === 'push'} />
        <Interruptor t="Alertas a pantalla completa" d="Cuando un cliente necesita a una persona, salta la alerta con el motivo y qué hacer." v={c.alertas.activas} des={des} on={v => guardar('alertas', { alertas: { ...c.alertas, activas: v } })} cargando={guardando === 'alertas'} />
        {c.alertas.activas && (
          <div className="grid gap-1.5 border-t border-[#f0f1f4] px-4 py-3 sm:grid-cols-2">
            {Object.entries(TIPOS_ATENCION).map(([k, t]) => {
              const on = c.alertas.tipos[k] !== false;
              return (
                <label key={k} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#3d4350]">
                  <input type="checkbox" checked={on} disabled={des} onChange={() => guardar(`al-${k}`, { alertas: { ...c.alertas, tipos: { ...c.alertas.tipos, [k]: !on } } })} className="h-4 w-4 accent-[#f97316]" />
                  {t.titulo}
                </label>
              );
            })}
          </div>
        )}
      </Seccion>

      {!puedeEditar && <p className="flex items-center gap-1.5 text-[12px] text-[#5b616e]"><Sparkles className="h-3.5 w-3.5" /> Solo puedes ver esta configuración; pídele a un administrador que la cambie.</p>}
    </div>
  );
}

function Seccion({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <h3 className="flex items-center gap-2 border-b border-[#f0f1f4] px-4 py-2.5 text-[13.5px] font-bold text-[#16181d]"><span className="text-[#f97316]">{icono}</span>{titulo}</h3>
      <div className="divide-y divide-[#f5f6f8]">{children}</div>
    </section>
  );
}

function Interruptor({ t, d, v, on, des, cargando }: { t: string; d: string; v: boolean; on: (v: boolean) => void; des?: boolean; cargando?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#16181d]">{t}</p>
        <p className="text-[11.5px] leading-snug text-[#5b616e]">{d}</p>
      </div>
      {cargando && <Loader2 className="h-4 w-4 animate-spin text-[#9ba1ab]" />}
      <button type="button" role="switch" aria-checked={v} aria-label={t} disabled={des} onClick={() => on(!v)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', v ? 'bg-[#16a34a]' : 'bg-[#d1d5db]')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', v ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}
