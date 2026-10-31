'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Send, Bot, User,
  Smile, CheckCheck, Check, X, RefreshCw, UserCheck, Wifi, WifiOff, Search, Clock,
  Image as ImageIcon, Video, Volume2, FileText, ChevronDown, ChevronLeft, Info,
  Copy, Trash, Zap, Paperclip, Mic, Trash2, RotateCcw, MapPin, Globe, Building2,
  Settings, Plus
} from 'lucide-react';
import { supabase, syncClientData } from '@/lib/supabase';
import { Vehiculo } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useAppStore } from '@/lib/store';
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';
import TiraMetricas from '@/components/whatsapp/TiraMetricas';
import PanelCliente from '@/components/whatsapp/PanelCliente';
import { ETIQUETAS, etiquetaDe, indiceVacio, type IndiceEtiquetas } from '@/lib/whatsapp/etiquetas';

/**
 * Las respuestas rápidas, con etiqueta corta y su texto.
 *
 * Antes eran las frases completas recortadas a 38 caracteres, así que en el
 * chip se leía «Le informamos que su servicio está en pr…» y había que
 * adivinar cuál era cuál. La etiqueta dice para qué sirve; el texto es lo que
 * se manda.
 */
const QUICK_REPLIES: { label: string; texto: string }[] = [
  { label: 'Saludo', texto: '¡Hola! ¿En qué le puedo ayudar? 😊' },
  { label: 'Agendar cita', texto: 'Tenemos disponibilidad mañana. ¿A qué hora le queda mejor? 📅' },
  { label: 'Enviar presupuesto', texto: 'Le preparo el presupuesto y se lo envío en un momento. 💰' },
  { label: 'Horarios', texto: 'Atendemos de lunes a viernes de 8:00 a. m. a 5:00 p. m., y sábados de 8:00 a. m. a 1:00 p. m.' },
  { label: 'Datos del vehículo', texto: '¿Podría indicarnos la marca, el modelo y el año del vehículo?' },
  { label: 'En taller', texto: 'Le informamos que su vehículo ya está en el taller. Le avisamos en cuanto esté listo.' },
  { label: 'Listo para retirar', texto: 'Su vehículo está listo para retirar. 🔧' },
  { label: 'Gracias', texto: '¡Gracias por confiar en Lycos Team! 🙌' },
];

const SEDE_LOCATIONS = [
  { id: 'sa', name: 'San Antonio', emoji: '📍', mapUrl: 'https://maps.app.goo.gl/7H6RGrbpXkxeqG2KA', lat: 10.3744153, lng: -66.9721822, address: 'San Antonio de los Altos, Miranda' },
  { id: 'cz', name: 'Carrizal (Principal)', emoji: '🏠', mapUrl: 'https://maps.app.goo.gl/cxLGkqWtsf5qogMB6', lat: 10.3534289, lng: -66.993931, address: 'Carrizal, Miranda' },
  { id: 'ccs', name: 'Caracas (El Cementerio)', emoji: '🏙️', mapUrl: 'https://maps.app.goo.gl/aeHGdzUumhpBep719', lat: 10.4784978, lng: -66.9125422, address: 'E/S PDV Nuevo Prado, Caracas' },
  { id: 'ccs_paraiso', name: 'Caracas El Paraíso', emoji: '🏙️', mapUrl: 'https://maps.app.goo.gl/c3TnUnHYGEJUWodX7', lat: 10.4917489, lng: -66.925809, address: 'Avenida Los Liberales, Caracas 1020, Distrito Capital, Venezuela, Al frente de Puerkos Restaurant' },
];

interface RawMsg {
  id: string;
  from_number: string;
  to_number: string;
  body: string;
  tipo: 'entrante' | 'saliente';
  estado?: string;
  es_ia?: boolean;
  media_url?: string | null;
  media_type?: string | null;
  reaccion?: string | null;
  wa_message_id?: string | null;
  quoted_wa_id?: string | null;
  created_at: string;
}

interface RawConv {
  id: string;
  telefono: string;
  cliente_id?: string | null;
  ultimo_mensaje: string | null;
  ultimo_mensaje_at: string | null;
  mensajes_sin_leer: number | null;
  estado: string | null;
  datos_cliente?: { 
    nombre?: string;
    wa_name?: string;
  } | null;
  clientes?: {
    id: string;
    nombre: string;
    apellido?: string;
    telefono?: string;
    // La ficha del cliente que va junto al chat enseña estos datos; el tipo
    // solo declaraba nombre y teléfono y por eso no se podían usar.
    email?: string | null;
    direccion?: string | null;
    cedula?: string | null;
    created_at?: string | null;
  } | null;
  memoria?: {
    vehiculos?: Array<{ marca?: string; modelo?: string; anio?: string; placa?: string }>;
    nombre?: string;
    placa?: string;
    /** Lo que el bot recuerda del cliente, en texto libre. */
    notas?: string | null;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────
function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function avatarLetters(conv: RawConv): string {
  const name = conv.clientes?.nombre || conv.datos_cliente?.nombre || conv.datos_cliente?.wa_name;
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  return '??';
}

function getAvatarColor(id: string) {
  const colors = [
    'linear-gradient(135deg, hsl(var(--wa-marca)) 0%, #008069 100%)',
    'linear-gradient(135deg, #53bdeb 0%, #2094c4 100%)',
    'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
    'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
    'linear-gradient(135deg, #f472b6 0%, #db2777 100%)',
    'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
  ];
  let hash = 0;
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const UserAvatar = ({ conv, className }: { conv: RawConv, className?: string }) => {
  if (!conv) return null;
  return (
    <div 
      className={cn("rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-lg border border-[hsl(var(--wa-borde))]", className)}
      style={{ background: getAvatarColor(conv.id), color: '#fff' }}
    >
      {avatarLetters(conv)}
    </div>
  );
};

function displayName(conv: RawConv): string {
  const c = conv.clientes;
  const fullName = c ? `${c.nombre} ${c.apellido || ''}`.trim() : null;
  return fullName || conv.datos_cliente?.nombre || conv.telefono || 'Desconocido';
}

function mergeMessages(existing: RawMsg[], incoming: RawMsg[]): RawMsg[] {
  const map = new Map(existing.map(m => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

// ── Detect media type in message body ────────────────────────
function detectMediaType(body: string): 'image' | 'video' | 'audio' | 'document' | null {
  if (!body) return null;
  const lower = body.toLowerCase();
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/) || lower.includes('[imagen]') || lower.includes('[image]')) return 'image';
  if (lower.match(/\.(mp4|mov|avi|mkv)(\?|$)/) || lower.includes('[video]')) return 'video';
  if (lower.match(/\.(mp3|ogg|m4a|opus|aac)(\?|$)/) || lower.includes('[audio]') || lower.includes('[voz]')) return 'audio';
  if (lower.match(/\.(pdf|doc|docx|xlsx|csv)(\?|$)/) || lower.includes('[documento]')) return 'document';
  return null;
}

function LocationBubble({ body, isOut }: { body: string; isOut: boolean }) {
  // body format: "📍 Sede [Name]: https://maps.app..."
  const urlMatch = body.match(/(https:\/\/maps\.app\.goo\.gl\/[\w]+)/);
  const url = urlMatch ? urlMatch[1] : null;
  // Extract sede name — everything between first space and the colon before url
  const nameMatch = body.match(/Sede\s([^:]+):/);
  const sedeName = nameMatch ? nameMatch[1].trim() : 'Lycos Team';
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-lg overflow-hidden max-w-[240px] no-underline"
      style={{ border: '1px solid hsl(var(--wa-borde))', background: isOut ? 'rgba(0,88,67,0.5)' : 'rgba(42,57,66,0.7)' }}
    >
      {/* Map thumbnail via static maps API (no key needed for thumbnail) */}
      <div className="relative w-full h-24 bg-[#1a2632] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1c3a2c 0%,#0d2518 100%)' }} />
        <div className="relative flex flex-col items-center gap-1">
          <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#25d366"/>
            <circle cx="12" cy="9" r="2.5" fill="#fff"/>
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#25d366' }}>Ver en Maps</span>
        </div>
        {/* Fake map grid lines */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(hsl(var(--wa-borde)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--wa-borde)) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#25d366' }} />
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] font-semibold truncate" style={{ color: 'hsl(var(--wa-texto))' }}>Lycos Team</span>
          <span className="text-[10px] truncate" style={{ color: 'hsl(var(--wa-texto-suave))' }}>{sedeName}</span>
        </div>
      </div>
    </a>
  );
}

const BOT_SLUG_TO_IMAGE: Record<string, { url: string; nombre: string }> = {
  cl30: { url: '/Silenciadores/CL%2030.jpg', nombre: 'Silenciador CL 30' },
  cl40: { url: '/Silenciadores/CL%2040.jpg', nombre: 'Silenciador CL 40' },
  cl60: { url: '/Silenciadores/CL%2060.jpg', nombre: 'Silenciador CL 60' },
  clc60: { url: '/Silenciadores/CLC%2060.jpg', nombre: 'Silenciador CLC 60' },
  clcp60: { url: '/Silenciadores/CLCP%2060.jpg', nombre: 'Silenciador CLCP 60' },
  clh40: { url: '/Silenciadores/CLH%2040.jpg', nombre: 'Silenciador CLH 40' },
  rc30: { url: '/Silenciadores/RC%2030.jpg', nombre: 'Resonador RC 30' },
  rcv: { url: '/Rcv/RCV.jpg', nombre: 'Póliza RCV' },
};

function parseBotImageTag(body: string): { slug: string; url: string; nombre: string; caption: string } | null {
  if (!body) return null;
  const match = body.match(/\[(?:Imagen|IMAGE|Image):\s*([a-zA-Z0-9_\-\s]+?)\]/i);
  if (!match) return null;
  const rawSlug = match[1].toLowerCase().trim();
  const info = BOT_SLUG_TO_IMAGE[rawSlug];
  const url = info ? info.url : `/Silenciadores/${encodeURIComponent(match[1].trim().toUpperCase())}.jpg`;
  const nombre = info ? info.nombre : `Imagen ${match[1].trim()}`;
  const caption = body.replace(match[0], '').trim();
  return { slug: rawSlug, url, nombre, caption };
}

// Extrae el texto adjunto (caption) real de un mensaje multimedia, descartando los
// marcadores sintéticos que el webhook guarda como `body` (p. ej. "[Video]",
// "[Cliente envió audio]", "[Imagen enviada por el administrador. Descripción...]").
// Para mensajes salientes el `body` YA viene limpio (sólo el caption).
function extractMediaCaption(body?: string | null): string {
  if (!body) return '';
  const raw = body.trim();
  // Caption embebido por el webhook en imágenes entrantes:
  //   ... - Mensaje del administrador adjunto: "texto"
  const adjunto = raw.match(/Mensaje del \w+ adjunto:\s*"([^"]+)"/i);
  if (adjunto) return adjunto[1].trim();
  // Marcadores sintéticos sin texto útil.
  if (/^\[(?:v[ií]deo|imagen|sticker|audio|documento|mensaje de voz|el cliente|el administrador|cliente envi|imagen enviada|imagen:|documento adjunto)/i.test(raw)) {
    return '';
  }
  // Si aún queda un marcador entre corchetes al inicio y nada más, no hay caption.
  if (/^\[[^\]]+\]$/.test(raw)) return '';
  return raw;
}

function MediaBubble({ msg, isOut, onImageClick, quotedMsg }: { msg: RawMsg; isOut: boolean; onImageClick: (url: string) => void; quotedMsg?: RawMsg | null }) {
  const { body, media_url, media_type } = msg;

  // Detect location messages (sent by bot or panel)
  const isLocationMsg = body?.startsWith('📍 Sede') || body?.startsWith('[Ubicación:') || body?.match(/maps\.app\.goo\.gl/);
  if (isLocationMsg) {
    return <LocationBubble body={body} isOut={isOut} />;
  }

  // Detect Bot image tags like [Imagen: cl30]
  const botImg = parseBotImageTag(body);
  if (botImg) {
    return (
      <div className="flex flex-col gap-1.5 max-w-[280px]">
        {quotedMsg && (
          <div className="mb-1 p-2 rounded-md bg-black/20 border-l-4 border-[hsl(var(--wa-marca))] overflow-hidden opacity-80 cursor-pointer hover:bg-black/30 transition-colors"
               onClick={() => document.getElementById(`msg-${quotedMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <div className="text-[10px] font-bold text-[hsl(var(--wa-marca))] mb-0.5">
              {quotedMsg.tipo === 'saliente' ? 'Tú' : 'Cliente'}
            </div>
            <div className="text-[11px] text-[hsl(var(--wa-texto-suave))] line-clamp-2 italic">
              {quotedMsg.body || (quotedMsg.media_type ? `[${quotedMsg.media_type}]` : 'Mensaje')}
            </div>
          </div>
        )}
        <div 
          className="relative group rounded-lg overflow-hidden border border-[hsl(var(--wa-borde))] bg-black/30 cursor-pointer shadow-md"
          onClick={() => onImageClick(botImg.url)}
        >
          <img 
            src={botImg.url} 
            alt={botImg.nombre} 
            className="w-full max-h-64 object-cover hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/Nuevo_Lycos_LOGO.png';
            }}
          />
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between rounded bg-black/75 backdrop-blur-md px-2 py-1">
            <span className="text-[10px] font-semibold text-white/90 truncate">
              🖼️ {botImg.nombre}
            </span>
            <span className="text-[9px] font-mono text-emerald-400 font-bold ml-1 flex-shrink-0">
              [{botImg.slug}]
            </span>
          </div>
        </div>
        {botImg.caption && (
          <p className="text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap break-words mt-1" style={{ color: 'hsl(var(--wa-texto))', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {botImg.caption}
          </p>
        )}
      </div>
    );
  }

  const proxyUrl = media_url ? (media_url.startsWith('blob:') ? media_url : `/api/whatsapp/media/${media_url}`) : null;
  const type = media_type || detectMediaType(body);
  // Detect failed audio transcription using the exact body text saved by the webhook
  const isFailedAudio = type === 'audio' && body?.includes('no se pudo transcribir');
  const isTranscribedAudio = type === 'audio' && body?.includes('(Audio transcrito)');

  if (!type && !proxyUrl) {
    return <p className="text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'hsl(var(--wa-texto))', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{body}</p>;
  }

  const icons = {
    image: <ImageIcon className="w-8 h-8" />,
    video: <Video className="w-8 h-8" />,
    audio: <Volume2 className="w-8 h-8" />,
    document: <FileText className="w-8 h-8" />,
    sticker: <ImageIcon className="w-8 h-8 opacity-50" />,
  };
  const labels = { image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento', sticker: 'Sticker' };

  const color = isOut ? 'hsl(var(--wa-marca))' : 'hsl(var(--wa-hover))';

  return (
    <div className="flex flex-col gap-1">
      {quotedMsg && (
        <div className="mb-1.5 p-2 rounded-md bg-black/20 border-l-4 border-[hsl(var(--wa-marca))] overflow-hidden opacity-80 cursor-pointer hover:bg-black/30 transition-colors"
             onClick={() => document.getElementById(`msg-${quotedMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <div className="text-[10px] font-bold text-[hsl(var(--wa-marca))] mb-0.5">
            {quotedMsg.tipo === 'saliente' ? 'Tú' : 'Cliente'}
          </div>
          <div className="text-[11px] text-[hsl(var(--wa-texto-suave))] line-clamp-2 italic">
            {quotedMsg.body || (quotedMsg.media_type ? `[${quotedMsg.media_type}]` : 'Mensaje')}
          </div>
        </div>
      )}
      {type === 'image' && proxyUrl ? (
        <img src={proxyUrl} alt="Imagen" className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity" style={{ border: `1px solid ${color}` }} onClick={() => onImageClick(proxyUrl)} />
      ) : type === 'video' && proxyUrl ? (
        <video src={proxyUrl} controls className="rounded-lg max-w-full max-h-64" style={{ border: `1px solid ${color}` }} />
      ) : type === 'audio' && proxyUrl ? (
        <div className="flex flex-col gap-1.5">
          <audio src={proxyUrl} controls className="w-full max-w-[240px] h-8 mt-1" />
          {isFailedAudio && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)' }}>
              <Mic className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#fb923c' }} />
              <span className="text-[11px] font-medium" style={{ color: '#fb923c' }}>
                Transcripción fallida — usa &quot;Retranscribir Audio&quot; ↑
              </span>
            </div>
          )}
          {isTranscribedAudio && body && (
            <p className="text-[12px] italic px-1" style={{ color: 'hsl(var(--wa-texto-suave))' }}>
              🎙️ {body.replace(' (Audio transcrito)', '')}
            </p>
          )}
        </div>
      ) : type === 'sticker' && proxyUrl ? (
        <div className="flex justify-center p-1">
          <img src={proxyUrl} alt="Sticker" className="w-32 h-32 object-contain" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-[hsl(var(--wa-borde))] bg-black/30 max-w-[260px] shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
              {icons[type as keyof typeof icons] || <FileText className="w-6 h-6" />}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-bold truncate" style={{ color: 'hsl(var(--wa-texto))' }}>
                {labels[type as keyof typeof labels] || 'Documento adjunto'}
              </span>
              <span className="text-[11px] text-[hsl(var(--wa-texto-suave))]">
                Archivo PDF / Documento
              </span>
            </div>
          </div>

          {proxyUrl ? (
            <a
              href={proxyUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors no-underline"
            >
              <FileText className="w-3.5 h-3.5" /> Abrir / Descargar ↗
            </a>
          ) : (
            <span className="text-[10px] text-[hsl(var(--wa-texto-suave))] italic">
              Documento enviado
            </span>
          )}

          {extractMediaCaption(body) && (
            <p className="text-xs opacity-80 border-t border-[hsl(var(--wa-borde))] pt-1.5 mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'hsl(var(--wa-texto))' }}>
              {extractMediaCaption(body)}
            </p>
          )}
        </div>
      )}
      {(type === 'image' || type === 'video' || type === 'sticker') && extractMediaCaption(body) && (
        <p className="text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap break-words mt-1" style={{ color: 'hsl(var(--wa-texto))', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
          {extractMediaCaption(body)}
        </p>
      )}
    </div>
  );
}

// ── Sede label map ────────────────────────────────────────────
const SEDE_LABEL_MAP: Record<string, { label: string; color: string; bg: string }> = {
  '310595c5-5258-47fa-9b69-5ad9932685a7': { label: 'San Antonio', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  'c5e6f95a-cdb8-4999-9210-ae3f6d4a7d44': { label: 'El Paraíso', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
};
function getSedeLabel(sedeId?: string | null) {
  if (!sedeId) return null;
  return SEDE_LABEL_MAP[sedeId] ?? { label: 'Otra sede', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' };
}

// ── Main Component ────────────────────────────────────────────
export default function WhatsAppPage() {
  const { user } = useAppStore();
  const { can } = useRolePermissions();
  const [convs, setConvs] = useState<RawConv[]>([]);
  const [replyingTo, setReplyingTo] = useState<RawMsg | null>(null);
  const [selected, setSelected] = useState<RawConv | null>(null);
  const [msgs, setMsgs] = useState<RawMsg[]>([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(false);
  const [showInfoDesktop, setShowInfoDesktop] = useState(true);
  const [togglingMode, setTogglingMode] = useState(false);
  const [selectedVehicles, setSelectedVehicles] = useState<Vehiculo[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null);
  const [isWindowOpen, setIsWindowOpen] = useState<boolean>(true);
  const [hasMoreAbove, setHasMoreAbove] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState({ nombre: '', apellido: '' });
  const [savingName, setSavingName] = useState(false);
  const [retryingIA, setRetryingIA] = useState(false);
  // Con qué se filtra la lista. «bot» y «humano» son el estado real de la
  // conversación, que es lo que de verdad hay que poder separar: saber qué
  // chats está atendiendo el bot y cuáles esperan a una persona.
  const [filtroLista, setFiltroLista] = useState<
    'todas' | 'sin_leer' | 'clientes' | 'ventas' | 'bot' | 'humano'
  >('todas');
  // Qué tiene pendiente cada cliente, para etiquetar su chat sin abrirlo.
  // Es UNA petición para toda la lista, no una por conversación.
  const [indiceEtiquetas, setIndiceEtiquetas] = useState<IndiceEtiquetas>(indiceVacio);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [retranscribing, setRetranscribing] = useState(false);
  const [sendingContact, setSendingContact] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'audit'>('chat');
  const [auditMsgs, setAuditMsgs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showAllSedes, setShowAllSedes] = useState(false);
  const showAllSedesRef = useRef(false);
  useEffect(() => { showAllSedesRef.current = showAllSedes; }, [showAllSedes]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isRecordingCancelled, setIsRecordingCancelled] = useState(false);
  const [recordingStartX, setRecordingStartX] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isHoldingRef = useRef(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Al enviar, la caja de texto vuelve a una línea.
  useEffect(() => { if (!message && inputRef.current) inputRef.current.style.height = ''; }, [message]);
  const selectedRef = useRef<RawConv | null>(null);
  const msgsRef = useRef<RawMsg[]>([]);
  const realtimeConnectedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<{file: File, url: string}[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  selectedRef.current = selected;
  msgsRef.current = msgs;

  // ── Scroll detection ──────────────────────────────────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsScrolledUp(!atBottom);
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    const el = chatScrollRef.current;
    if (!el) return;
    if (force || !isScrolledUp) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [isScrolledUp]);

  useEffect(() => {
    scrollToBottom();
  }, [msgs, scrollToBottom]);

  // ── Load conversations ──────────────────────────────────────
  const loadConvs = useCallback(async (allSedes = false) => {
    if (!supabase) return;
    
    let data;
    if (allSedes) {
      // Cargar conversaciones de TODAS las sedes sin filtro
      const { data: allData } = await supabase.from('conversaciones')
        .select('*, clientes(id, nombre, apellido, telefono, email, direccion, cedula, created_at)')
        .order('ultimo_mensaje_at', { ascending: false })
        .limit(1000);
      data = allData;
    } else {
      // 1. Try with sede filter (architecture standard)
      const { data: sedeData } = await withSedeFilter(supabase.from('conversaciones'))
        .select('*, clientes(id, nombre, apellido, telefono, email, direccion, cedula, created_at)')
        .order('ultimo_mensaje_at', { ascending: false })
        .limit(1000);
      data = sedeData;
      
      // 2. Fallback: if no conversations for current branch, try San Antonio (primary branch)
      if (!data || data.length === 0) {
        const { data: fallback } = await supabase.from('conversaciones')
          .select('*, clientes(id, nombre, apellido, telefono, email, direccion, cedula, created_at)')
          .eq('sede_id', '310595c5-5258-47fa-9b69-5ad9932685a7')
          .order('ultimo_mensaje_at', { ascending: false })
          .limit(1000);
        data = fallback;
      }
    }
    
    if (!data) return;
    setConvs(data as unknown as RawConv[]);
    
    if (selectedRef.current) {
      const fresh = (data as unknown as RawConv[]).find(c => c.id === selectedRef.current!.id);
      if (fresh) setSelected(fresh);
    }
  }, []);

  // ── OPTIMIZED: Load messages newest-first, show immediately ──
  // Filtra SOLO por número de teléfono — nunca por sede_id.
  // Los mensajes en BD tienen sede_id inconsistente (el bot los graba con la sede
  // de su configuración, no la de la conversación), así que filtrar por sede
  // corta el historial. El teléfono identifica unívocamente la conversación.
  const loadInitialMsgs = useCallback(async (telefono: string, _convSedeId?: string | null) => {
    if (!supabase) return;
    setLoadingMsgs(true);
    setHasMoreAbove(false);

    const { data } = await supabase.from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(60);

    setLoadingMsgs(false);
    if (!data) return;

    const sorted = [...data].reverse() as RawMsg[];
    setMsgs(sorted);
    setHasMoreAbove(data.length === 60);

    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const deleteMsg = async (msg: RawMsg) => {
    if (!can('whatsapp', 'eliminar')) return alert('No tienes permisos para eliminar mensajes.');
    if (!confirm('¿Seguro que deseas eliminar este mensaje? Pasará a la papelera de auditoría.')) return;
    
    // 1. Log to logs_actividad for traceability
    try {
      await withSedeFilter(supabase!.from('logs_actividad')).insert(withSedeInsert({
        usuario: 'Administrador',
        accion: 'delete_message',
        modulo: 'whatsapp',
        detalles: `Eliminado mensaje de ${msg.from_number}: "${msg.body.substring(0, 80)}..."`,
        ip_address: 'CRM_UI'
      }));
    } catch {}

    // 2. Soft delete
    const { error } = await supabase!
      .from('mensajes_whatsapp')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', msg.id);

    if (!error) {
      setMsgs(prev => prev.filter(m => m.id !== msg.id));
    } else {
      alert('Error al eliminar mensaje (Verifica si ejecutaste el SQL de Soft-Delete)');
    }
  };

  const loadAuditMsgs = async () => {
    if (!supabase) return;
    setLoadingAudit(true);
    const { data, error } = await supabase
      .from('mensajes_whatsapp')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(100);
    
    if (!error) setAuditMsgs(data || []);
    setLoadingAudit(false);
  };

  const restoreMsg = async (id: string) => {
    if (!confirm('¿Deseas restaurar este mensaje al chat original?')) return;
    const { error } = await withSedeFilter(supabase!.from('mensajes_whatsapp')).update({ deleted_at: null }).eq('id', id);
    if (!error) {
      setAuditMsgs(prev => prev.filter(m => m.id !== id));
      if (selected && msgs.some(m => m.id === id)) {
         loadInitialMsgs(selected.telefono, (selected as any).sede_id);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ── Load older messages (scroll up) ──────────────────────────
  const loadOlderMsgs = useCallback(async () => {
    if (!supabase || !selected || loadingMore || !hasMoreAbove || msgs.length === 0) return;
    setLoadingMore(true);

    const oldest = msgs[0].created_at;

    // Sin filtro de sede_id — los mensajes tienen sede inconsistente en BD
    const { data } = await supabase.from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${selected.telefono},to_number.eq.${selected.telefono}`)
      .is('deleted_at', null)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(40);

    setLoadingMore(false);

    if (!data || data.length === 0) {
      setHasMoreAbove(false);
      return;
    }

    const olderSorted = [...data].reverse() as RawMsg[];
    // Remember current scroll height before prepending
    const el = chatScrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    setMsgs(prev => [...olderSorted, ...prev]);
    setHasMoreAbove(data.length === 40);

    // Maintain scroll position after prepend
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop = el.scrollHeight - prevScrollHeight;
      }
    });
  }, [selected, loadingMore, hasMoreAbove, msgs]);

  // ── Scroll up trigger for loading older messages ──────────────
  const handleScrollEvents = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    handleScroll(e);
    const el = e.currentTarget;
    if (el.scrollTop < 100 && hasMoreAbove && !loadingMore) {
      loadOlderMsgs();
    }
  }, [handleScroll, hasMoreAbove, loadingMore, loadOlderMsgs]);

  // ── Incremental: only fetch messages NEWER than last ──────────
  const fetchNewMsgs = useCallback(async (telefono: string, _convSedeId?: string | null) => {
    if (!supabase) return;
    const latest = msgsRef.current;
    const realMsgs = latest.filter(m => !m.id.startsWith('tmp-'));
    const lastTs = realMsgs.length ? realMsgs[realMsgs.length - 1].created_at : new Date(0).toISOString();

    // Sin filtro de sede_id — los mensajes tienen sede inconsistente en BD
    const { data } = await supabase.from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .is('deleted_at', null)
      .gt('created_at', lastTs)
      .order('created_at', { ascending: true })
      .limit(20);

    if (data && data.length > 0) {
      setMsgs(prev => mergeMessages(prev, data as RawMsg[]));
      scrollToBottom();
    }
  }, [scrollToBottom]);

  const loadVehicles = useCallback(async (clientId: string) => {
    if (!supabase) return;
    setLoadingVehicles(true);
    const { data } = await withSedeFilter(supabase.from('vehiculos')).select('*').eq('cliente_id', clientId).eq('estado', 'activo');
    setSelectedVehicles(data || []);
    setLoadingVehicles(false);
  }, []);

  // ── Initial setup ────────────────────────────────────────────
  useEffect(() => {
    loadConvs(showAllSedes);
  }, [loadConvs, showAllSedes]);

  // ── 24h WhatsApp timer ────────────────────────────────────────
  useEffect(() => {
    if (!selected || msgs.length === 0) { setTimeLeftStr(null); return; }
    const lastIncoming = [...msgs].reverse().find(m => m.tipo === 'entrante');
    if (!lastIncoming) { setTimeLeftStr('Vencido'); setIsWindowOpen(false); return; }

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiresAt = new Date(lastIncoming.created_at).getTime() + 24 * 60 * 60 * 1000;
      const diff = expiresAt - now;
      if (diff <= 0) { setTimeLeftStr('Vencido'); setIsWindowOpen(false); }
      else {
        setIsWindowOpen(true);
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeftStr(`${h}h ${m}m ${s}s`);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [selected, msgs]);

  // ── Realtime subscription ─────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel('crm-wa-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_whatsapp' }, (payload) => {
        const newMsg = payload.new as RawMsg;
        const cur = selectedRef.current;
        if (cur) {
          const phone = cur.telefono;
          const convSedeId = (cur as any).sede_id as string | null | undefined;
          // Match incoming (from client) OR outgoing bot reply (to_number = phone, from_number = 'system')
          if (newMsg.from_number === phone || newMsg.to_number === phone) {
            fetchNewMsgs(phone, convSedeId);
          }
        }
        loadConvs(showAllSedesRef.current);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes_whatsapp' }, (payload) => {
        // Handle reactions, transcription updates, etc.
        const updated = payload.new as RawMsg;
        const cur = selectedRef.current;
        if (cur) {
          const phone = cur.telefono;
          if (updated.from_number === phone || updated.to_number === phone) {
            // Update just the affected message in state without full reload
            setMsgs(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, () => {
        loadConvs(showAllSedesRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        loadConvs(showAllSedesRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, (payload) => {
        const cur = selectedRef.current;
        const affected = (payload.new || payload.old) as Vehiculo;
        if (cur?.cliente_id && affected?.cliente_id === cur.cliente_id) {
          loadVehicles(cur.cliente_id);
        }
      })
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        setIsConnected(connected);
        realtimeConnectedRef.current = connected;
      });

    // Poll as fallback for Realtime silence or connection issues (every 5s)
    const poll = setInterval(() => {
      const cur = selectedRef.current;
      if (cur) fetchNewMsgs(cur.telefono, (cur as any).sede_id);
      loadConvs(showAllSedesRef.current);
    }, 5000);

    return () => {
      sb?.removeChannel(channel);
      clearInterval(poll);
    };
  }, [loadConvs, fetchNewMsgs, loadVehicles]);

  // ── Select conversation ───────────────────────────────────────
  const selectConv = async (conv: RawConv) => {
    setSelected(conv);
    setShowMobileChat(true);
    setMsgs([]);
    setIsScrolledUp(false);
    const convSedeId = (conv as any).sede_id as string | null | undefined;
    await loadInitialMsgs(conv.telefono, convSedeId);
    
    // Fetch vehicles
    if (conv.cliente_id) {
      await loadVehicles(conv.cliente_id);
    } else {
      setSelectedVehicles([]);
    }

    if (supabase && (conv.mensajes_sin_leer ?? 0) > 0) {
      withSedeFilter(supabase.from('conversaciones'))
        .update({ mensajes_sin_leer: 0 })
        .eq('telefono', conv.telefono)
        .then(() => loadConvs(showAllSedesRef.current));
    }
  };

  // ── Abrir una conversación desde un enlace (?tel=…): las alertas de atención llevan aquí ──
  const telPedido = useRef<string | null>(null);
  useEffect(() => { telPedido.current = new URLSearchParams(window.location.search).get('tel'); }, []);
  // Si ya se está en esta página, la alerta avisa por evento (el enlace no la recarga).
  useEffect(() => {
    const abrirTel = (ev: Event) => {
      const t = String((ev as CustomEvent<string>).detail || '');
      const c = convs.find(x => x.telefono === t);
      if (c) void selectConv(c); else telPedido.current = t;
    };
    window.addEventListener('lycos:abrir-conversacion', abrirTel);
    return () => window.removeEventListener('lycos:abrir-conversacion', abrirTel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usa la lista vigente
  }, [convs]);
  useEffect(() => {
    const t = telPedido.current;
    if (!t || !convs.length) return;
    const c = convs.find(x => x.telefono === t || x.telefono.replace(/\D/g, '').endsWith(t.replace(/\D/g, '').slice(-10)));
    if (c) { telPedido.current = null; void selectConv(c); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega la lista
  }, [convs]);

  // ── Send message ──────────────────────────────────────────────
  const handleSend = async () => {
    if ((!message.trim() && files.length === 0) || !selected || sending) return;
    const rawBody = message.trim();
    const signature = user?.nombre ? `\n\n_— Asesor: ${user.nombre}_` : '';
    const body = rawBody ? rawBody + signature : (user?.nombre ? `_— Asesor: ${user.nombre}_` : '');
    
    setMessage('');
    setSending(true);
    setIsScrolledUp(false);
    inputRef.current?.focus();
    scrollToBottom(true);

    try {
      if (files.length > 0) {
        // Send files sequentially
        for (let i = 0; i < files.length; i++) {
          const { file, url } = files[i];
          const optimisticId = `tmp-${Date.now()}-${i}`;
          
          let fileBody = i === 0 ? body : '';
          const optimistic: RawMsg = {
            id: optimisticId,
            from_number: 'system',
            to_number: selected.telefono,
            body: fileBody + (user?.nombre ? ` [env:${user.nombre}]` : ''),
            tipo: 'saliente',
            estado: 'enviado',
            es_ia: false,
            quoted_wa_id: replyingTo?.wa_message_id,
            created_at: new Date().toISOString(),
          };

          if (file.type.startsWith('image/')) {
            optimistic.media_type = 'image';
            optimistic.media_url = url || undefined;
          }
          else if (file.type.startsWith('video/')) optimistic.media_type = 'video';
          else if (file.type.startsWith('audio/')) optimistic.media_type = 'audio';
          else optimistic.media_type = 'document';

          setMsgs(prev => [...prev, optimistic]);

          const fd = new FormData();
          fd.append('to', selected.telefono);
          if (i === 0 && body) fd.append('message', body);
          if (user?.nombre) fd.append('operator_name', user.nombre);
          if (replyingTo?.wa_message_id) fd.append('quoted_message_id', replyingTo.wa_message_id);
          fd.append('file', file);
          await fetch('/api/whatsapp/send', { method: 'POST', body: fd });
        }
      } else {
        // Only text
        const optimisticId = `tmp-${Date.now()}`;
        const optimistic: RawMsg = {
          id: optimisticId,
          from_number: 'system',
          to_number: selected.telefono,
          body: body + (user?.nombre ? ` [env:${user.nombre}]` : ''),
          tipo: 'saliente',
          estado: 'enviado',
          es_ia: false,
          quoted_wa_id: replyingTo?.wa_message_id,
          created_at: new Date().toISOString(),
        };
        setMsgs(prev => [...prev, optimistic]);

        const fd = new FormData();
        fd.append('to', selected.telefono);
        fd.append('message', body);
        if (user?.nombre) fd.append('operator_name', user.nombre);
        if (replyingTo?.wa_message_id) fd.append('quoted_message_id', replyingTo.wa_message_id);
        await fetch('/api/whatsapp/send', { method: 'POST', body: fd });
      }

      setReplyingTo(null);
      await fetchNewMsgs(selected.telefono, (selected as any).sede_id);
      // Clear files after success
      files.forEach(f => URL.revokeObjectURL(f.url));
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (e) {
      console.error('Error enviando:', e);
    } finally {
      setSending(false);
      setMsgs(prev => prev.filter(m => !m.id.startsWith('tmp-')));
      await fetchNewMsgs(selected.telefono, (selected as any).sede_id);
      await loadConvs();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      const newFiles = selectedFiles.map(f => ({ file: f, url: URL.createObjectURL(f) }));
      setFiles(prev => [...prev, ...newFiles]);
      inputRef.current?.focus();
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].url);
      newFiles.splice(index, 1);
      return newFiles;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Mode toggle ───────────────────────────────────────────────
  const setMode = async (mode: 'bot' | 'humano') => {
    if (!selected || !supabase || togglingMode) return;
    setTogglingMode(true);
    await withSedeFilter(supabase.from('conversaciones')).update({ estado: mode }).eq('telefono', selected.telefono);
    await loadConvs();
    setTogglingMode(false);
  };
  
  // ── Edit Name ─────────────────────────────────────────────────
  const startEditingName = () => {
    if (!selected) return;
    const c = selected.clientes;
    const nombre = c?.nombre || selected.datos_cliente?.nombre || '';
    const apellido = c?.apellido || '';
    setEditName({ nombre, apellido });
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!selected || !supabase || savingName) return;
    setSavingName(true);
    try {
      const { nombre, apellido } = editName;
      const fullName = `${nombre} ${apellido}`.trim();

      // 1. Update clientes
      if (selected.cliente_id) {
        await withSedeFilter(supabase.from('clientes')).update({ nombre, apellido }).eq('id', selected.cliente_id);
      }

      // 2. Update conversaciones
      await withSedeFilter(supabase.from('conversaciones')).update({
        datos_cliente: {
          ...selected.datos_cliente,
          nombre: fullName
        },
        memoria: {
          ...selected.memoria,
          nombre: fullName
        }
      }).eq('telefono', selected.telefono);

      // 3. Sync redundant data (citas, conversaciones)
      await syncClientData(selected.cliente_id || '', nombre, apellido, selected.telefono);

      // Refresh data
      await loadConvs();
      setIsEditingName(false);
    } catch (e) {
      console.error('Error saving name:', e);
      alert('Error al guardar el nombre');
    } finally {
      setSavingName(false);
    }
  };

  // ── Detect failed-transcription audio messages in current conversation ──────
  const getFailedAudioMsg = (): RawMsg | null => {
    if (!msgs) return null;
    // Find the most recent incoming audio message that failed transcription
    const failed = [...msgs]
      .reverse()
      .find(
        m =>
          m.tipo === 'entrante' &&
          m.media_type === 'audio' &&
          m.body?.includes('no se pudo transcribir')
      );
    return failed || null;
  };

  // ── Detect failed-analysis image messages in current conversation ──────
  const getFailedImageMsg = (): RawMsg | null => {
    if (!msgs) return null;
    const failed = [...msgs]
      .reverse()
      .find(
        m =>
          m.tipo === 'entrante' &&
          m.media_type === 'image' &&
          (m.body === '[Cliente envió imagen]' || m.body?.startsWith('[Cliente envió imagen]'))
      );
    return failed || null;
  };

  // ── Re-describe and re-process a failed image message ────────────────────
  const handleRedescribeImage = async (msg: RawMsg) => {
    if (retranscribing) return;
    setRetranscribing(true);
    setRetryStatus(null);
    try {
      const res = await fetch('/api/whatsapp/redescribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRetryStatus('✅ Imagen analizada y respondida por IA');
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
        await loadConvs();
      } else if (res.status === 207) {
        setRetryStatus('⚠️ Imagen descrita pero IA falló al responder');
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
      } else {
        setRetryStatus(`❌ ${data.error || 'Error al re-analizar imagen'}`);
      }
    } catch {
      setRetryStatus('❌ Error de conexión al re-analizar imagen');
    } finally {
      setRetranscribing(false);
      setTimeout(() => setRetryStatus(null), 6000);
    }
  };

  // ── Re-transcribe and re-process a failed audio message ──────────────────
  const handleRetranscribeAudio = async (msg: RawMsg) => {
    if (retranscribing) return;
    setRetranscribing(true);
    setRetryStatus(null);
    try {
      const res = await fetch('/api/whatsapp/retranscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRetryStatus(`✅ Audio transcrito: "${(data.transcript || '').substring(0, 50)}..."`);
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
        await loadConvs();
      } else if (res.status === 207) {
        // Partial: transcription OK but AI failed
        setRetryStatus(`⚠️ Transcrito pero IA falló. Transcripción: "${(data.transcript || '').substring(0, 40)}"`);
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
      } else {
        setRetryStatus(`❌ ${data.error || 'Error al retranscribir'}`);
      }
    } catch {
      setRetryStatus('❌ Error de conexión al retranscribir');
    } finally {
      setRetranscribing(false);
      setTimeout(() => setRetryStatus(null), 6000);
    }
  };

  // ── Retry IA for pending messages ──────────────────────────
  const handleRetryIA = async () => {
    // Priority 1: re-transcribe failed audio
    const failedAudio = getFailedAudioMsg();
    if (failedAudio) {
      await handleRetranscribeAudio(failedAudio);
      return;
    }
    // Priority 2: re-describe failed image
    const failedImage = getFailedImageMsg();
    if (failedImage) {
      await handleRedescribeImage(failedImage);
      return;
    }

    if (retryingIA) return;
    setRetryingIA(true);
    setRetryStatus(null);
    try {
      const res = await fetch('/api/whatsapp/cron');
      const data = await res.json();
      if (data.succeeded > 0) {
        setRetryStatus(`✅ ${data.succeeded} mensaje${data.succeeded > 1 ? 's' : ''} respondido${data.succeeded > 1 ? 's' : ''}`);
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
        await loadConvs();
      } else if (data.still_pending > 0) {
        setRetryStatus('⏳ IA sigue no disponible, se reintentará');
      } else {
        setRetryStatus('✅ Sin mensajes pendientes');
      }
    } catch {
      setRetryStatus('❌ Error al reintentar');
    } finally {
      setRetryingIA(false);
      setTimeout(() => setRetryStatus(null), 4000);
    }
  };


  // ── Reprocess any specific message (audio/image/video/text) ──────────────
  const handleReprocess = async (msg: RawMsg) => {
    if (retranscribing) return;
    setRetranscribing(true);
    setRetryStatus(null);
    try {
      const res = await fetch('/api/whatsapp/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const label = msg.media_type === 'audio' ? 'Audio reprocesado' : msg.media_type === 'image' ? 'Imagen re-analizada' : msg.media_type === 'video' ? 'Video re-analizado' : 'Mensaje reprocesado';
        setRetryStatus(`✅ ${label} y respondido por IA`);
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
        await loadConvs();
      } else if (res.status === 207) {
        setRetryStatus(`⚠️ ${data.warning || 'Procesado pero IA falló al responder'}`);
        await fetchNewMsgs(selected!.telefono, (selected as any).sede_id);
      } else {
        setRetryStatus(`❌ ${data.error || 'Error al reprocesar'}`);
      }
    } catch {
      setRetryStatus('❌ Error de conexión al reprocesar');
    } finally {
      setRetranscribing(false);
      setTimeout(() => setRetryStatus(null), 6000);
    }
  };

  // ── Reactions ──────────────────────────────────────────────────
  const handleReact = async (msg: RawMsg, emoji: string) => {
    if (!selected || !msg.wa_message_id || sending) return;
    
    // Si es el mismo emoji, lo quitamos (WhatsApp lo soporta enviando emoji vacío)
    const newEmoji = msg.reaccion === emoji ? '' : emoji;

    // Actualización optimista en el UI
    setMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, reaccion: newEmoji || null } : m));

    try {
      const resp = await fetch('/api/whatsapp/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected.telefono,
          messageId: msg.wa_message_id,
          emoji: newEmoji
        }),
      });
      if (!resp.ok) {
        console.error('Error en la API de reacción');
      }
    } catch (e) {
      console.error('Error reaccionando:', e);
      // En caso de error crítico, refrescamos para sincronizar
      fetchNewMsgs(selected.telefono, (selected as any).sede_id);
    }
  };

  // ── Send Advisor Contact ──────────────────────────────────────
  const handleSendLocation = async (sede: typeof SEDE_LOCATIONS[0]) => {
    if (!selected || sending) return;
    setSending(true);
    const label = `📍 Sede ${sede.name}: ${sede.mapUrl}`;
    try {
      // Send the text link with preview
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected.telefono,
          message: label,
          preview_url: true,
          operator_name: user?.nombre || undefined,
        }),
      });

      if (res.ok) {
        // 2. Send Interactive Message with Buttons
        const res2 = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: selected.telefono,
            operator_name: user?.nombre || undefined,
            interactive: {
              type: 'button',
              header: {
                type: 'text',
                text: `Sede ${sede.name}`
              },
              body: {
                text: `Aquí tienes la ubicación exacta de nuestra sede ${sede.name}. Haz clic en el mapa arriba o usa el enlace:\n\n🔗 ${sede.mapUrl}\n\n📍 ${sede.address}`
              },
              footer: {
                text: '¿Deseas agendar una cita?'
              },
              action: {
                buttons: [
                  {
                    type: 'reply',
                    reply: {
                      id: `cita_${sede.id}`,
                      title: 'Agendar Cita 📅'
                    }
                  },
                  {
                    type: 'reply',
                    reply: {
                      id: 'precios',
                      title: 'Ver Precios 💰'
                    }
                  }
                ]
              }
            }
          }),
        });

        if (res2.ok) {
          await fetchNewMsgs(selected.telefono, (selected as any).sede_id);
          await loadConvs();
        } else {
          const errData = await res2.json();
          alert('Error en mensaje interactivo: ' + (errData.error || 'Error desconocido'));
        }
      } else {
        const errData = await res.json();
        alert('Error en mensaje de ubicación: ' + (errData.error || 'Error desconocido'));
      }
    } catch (e) {
      console.error('Error enviando ubicación:', e);
    } finally {
      setSending(false);
    }
  };


  const handleSendContact = async () => {
    if (!selected || sendingContact) return;
    if (!confirm(`¿Enviar tarjeta de contacto del Asesor a ${displayName(selected)}?`)) return;
    
    setSendingContact(true);
    try {
      const res = await fetch('/api/whatsapp/send-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to: selected.telefono,
          operator_name: user?.nombre || undefined,
        }),
      });
      if (res.ok) {
        await fetchNewMsgs(selected.telefono, (selected as any).sede_id);
        await loadConvs();
        scrollToBottom(true);
      } else {
        alert('Error al enviar la tarjeta de contacto');
      }
    } catch (e) {
      console.error('Error enviando contacto:', e);
    } finally {
      setSendingContact(false);
    }
  };

  // ── Audio Recording Logic ────────────────────────────────────
  const getSupportedMimeType = () => {
    const types = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus', 'audio/webm', 'audio/aac', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startRecording = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isHoldingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // If user released before permission/stream was ready
      if (!isHoldingRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const recordedType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
        
        if (!isRecordingCancelled && audioBlob.size > 100) { // Min size check
          // Use .ogg for better Meta API compatibility if it's an opus stream
          const extension = recordedType.includes('ogg') || recordedType.includes('opus') ? 'ogg' : 'webm';
          await sendAudioMessage(audioBlob, extension);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      const startX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      setRecordingStartX(startX);
      setIsRecording(true);
      setRecordingTime(0);
      setIsRecordingCancelled(false);
      setSlideOffset(0);
      
      mediaRecorder.start(200); 
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      alert('Error: No se pudo activar el micrófono. Verifica los permisos de tu navegador.');
      isHoldingRef.current = false;
    }
  };

  // Add global listeners to handle releases outside the button
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (isHoldingRef.current) {
        isHoldingRef.current = false;
        stopRecording(true);
      }
    };
    if (isRecording) {
      window.addEventListener('mouseup', handleGlobalRelease);
      window.addEventListener('touchend', handleGlobalRelease);
    }
    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [isRecording]);

  const handleRecordingMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isRecording || isRecordingCancelled) return;
    const currentX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const offset = Math.max(0, recordingStartX - currentX);
    setSlideOffset(offset);
    
    if (offset > 120) { // Threshold for cancellation
      setIsRecordingCancelled(true);
      stopRecording(false);
    }
  };

  const stopRecording = (shouldSend: boolean) => {
    isHoldingRef.current = false;
    if (!isRecording) return;
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setSlideOffset(0);
  };

  const sendAudioMessage = async (blob: Blob, extension: string) => {
    if (!selected) return;
    setSending(true);

    const blobUrl = URL.createObjectURL(blob);
    const optimisticId = `tmp-audio-${Date.now()}`;
    const optimistic: RawMsg = {
      id: optimisticId,
      from_number: 'system',
      to_number: selected.telefono,
      body: user?.nombre ? `[env:${user.nombre}]` : '',
      tipo: 'saliente',
      estado: 'enviado',
      media_url: blobUrl,
      media_type: 'audio',
      created_at: new Date().toISOString()
    };
    
    setMsgs(prev => [...prev, optimistic]);
    scrollToBottom(true);
    
    const formData = new FormData();
    formData.append('to', selected.telefono);
    if (user?.nombre) formData.append('operator_name', user.nombre);
    // Use audio/ogg for Meta API if we suspect it's opus, otherwise use recorded type
    const sendBlob = new Blob([blob], { type: extension === 'ogg' ? 'audio/ogg' : blob.type });
    formData.append('file', sendBlob, `voice-note-${Date.now()}.${extension}`);
    if (replyingTo?.wa_message_id) formData.append('quoted_message_id', replyingTo.wa_message_id);
    
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        // Refresh to get the real message from DB
        await fetchNewMsgs(selected.telefono, (selected as any).sede_id);
        await loadConvs();
      } else {
        const errData = await res.json();
        console.error('Error de API enviando audio:', errData);
        setMsgs(prev => prev.filter(m => m.id !== optimisticId));
        alert('Error al enviar audio: ' + (errData.error || 'Error desconocido') + (errData.details ? ` (${errData.details})` : ''));
      }
    } catch (err) {
      console.error('Error enviando audio:', err);
      setMsgs(prev => prev.filter(m => m.id !== optimisticId));
    } finally {
      setSending(false);
      setReplyingTo(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filtered = convs.filter(c => {
    const q = search.toLowerCase();
    const coincide = (displayName(c) + c.telefono + (c.ultimo_mensaje || '')).toLowerCase().includes(q);
    if (!coincide) return false;
    if (filtroLista === 'sin_leer') return (c.mensajes_sin_leer ?? 0) > 0;
    // «Clientes» son los que ya tienen ficha; «Ventas», los que compraron hace
    // poco. Salen de la misma etiqueta que se pinta en la fila, así que el
    // filtro y el chip nunca pueden decir cosas distintas.
    if (filtroLista === 'clientes') return !!c.cliente_id;
    if (filtroLista === 'ventas') return etiquetaDe(c.cliente_id, indiceEtiquetas) === 'venta';
    if (filtroLista === 'bot') return c.estado === 'bot';
    if (filtroLista === 'humano') return c.estado === 'humano';
    return true;
  });

  // Los contadores se cuentan sobre TODAS las conversaciones, no sobre las ya
  // filtradas: si contaran lo filtrado, al elegir «No leídas» los demás chips
  // se pondrían a cero y no habría forma de volver.
  const cuentaFiltros = {
    todas: convs.length,
    sin_leer: convs.filter(c => (c.mensajes_sin_leer ?? 0) > 0).length,
    clientes: convs.filter(c => !!c.cliente_id).length,
    ventas: convs.filter(c => etiquetaDe(c.cliente_id, indiceEtiquetas) === 'venta').length,
    bot: convs.filter(c => c.estado === 'bot').length,
    humano: convs.filter(c => c.estado === 'humano').length,
  };

  const isHumano = selected?.estado === 'humano';
  const totalUnread = convs.reduce((s, c) => s + (c.mensajes_sin_leer ?? 0), 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Las etiquetas de la lista. Si fallan, la lista sigue sirviendo: se pierde
  // el chip, no la conversación.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/whatsapp/etiquetas');
        if (!r.ok || !vivo) return;
        const d = await r.json() as {
          enTaller: string[]; conCita: string[]; conPresupuesto: string[]; conVenta: string[];
        };
        if (!vivo) return;
        setIndiceEtiquetas({
          enTaller: new Set(d.enTaller || []),
          conCita: new Set(d.conCita || []),
          conPresupuesto: new Set(d.conPresupuesto || []),
          conVenta: new Set(d.conVenta || []),
        });
      } catch {
        // Sin etiquetas la lista se ve igual, solo sin los chips.
      }
    })();
    return () => { vivo = false; };
  }, []);

  // No bloqueamos por sede — el toggle "Todas las sedes" maneja el acceso
  if (!mounted) return null;

  return (
    <>
    <div className="relative flex flex-col h-[calc(100dvh-12rem)] md:h-[calc(100dvh-7.5rem)] min-h-[480px]">
      <div className="flex flex-col flex-1 min-h-0 gap-3 transition-opacity duration-300">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* El logo oficial. Ya trae su cuadrado verde con esquinas
              redondeadas, así que va sin recuadro detrás: ponerle uno le
              dibujaba un marco alrededor del marco. */}
          <img
            src="/marcas/whatsapp.png" alt="WhatsApp" width={44} height={44}
            className="h-11 w-11 shrink-0 rounded-[13px]"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-none" style={{ fontFamily: 'Syne, sans-serif' }}>
              WhatsApp
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              Gestiona tus conversaciones, automatiza respuestas y convierte más clientes.
            </p>
          </div>
          {/* El estado de la conexión, junto al título: si el enlace se cae,
              los mensajes dejan de llegar y hay que verlo sin buscarlo. */}
          <span
            title={isConnected ? 'Recibiendo mensajes en vivo' : 'Reintentando la conexión'}
            className={cn(
              'hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold lg:flex',
              isConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
            )}
          >
            {isConnected
              ? <><Wifi className="h-3 w-3" aria-hidden /> Conectado</>
              : <><WifiOff className="h-3 w-3 animate-pulse" aria-hidden /> Conectando…</>}
            <span className="font-normal text-muted-foreground/70">WhatsApp Cloud API</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Configuración lleva a los ajustes del bot, que es lo que se
              configura de WhatsApp. «Nueva campaña» todavía no existe: se deja
              a la vista, deshabilitada y dicha, en vez de un botón que no hace
              nada y no lo avisa. */}
          <a
            href="/dashboard/configuracion"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-foreground/80 transition-colors hover:bg-muted/50"
          >
            <Settings className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Configuración</span>
          </a>
          <button
            type="button"
            disabled
            title="Todavía no construido: hace falta el envío masivo con plantillas aprobadas por Meta."
            className="flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[12.5px] font-semibold text-muted-foreground/70"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Nueva campaña</span>
          </button>
          <span className="mx-0.5 hidden h-6 w-px bg-border sm:block" aria-hidden />
          <button 
            onClick={() => {
              const newMode = viewMode === 'chat' ? 'audit' : 'chat';
              setViewMode(newMode);
              if (newMode === 'audit') loadAuditMsgs();
            }} 
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all font-bold",
              viewMode === 'audit' 
                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                : "bg-[hsl(var(--wa-panel-alt))] text-muted-foreground hover:text-foreground border border-transparent hover:border-[hsl(var(--wa-borde))]"
            )}
          >
            {viewMode === 'audit' ? <MessageSquare className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{viewMode === 'audit' ? 'Volver al Chat' : 'Papelera'}</span>
          </button>
          <button onClick={() => loadConvs(showAllSedes)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-[hsl(var(--wa-hover))] border border-transparent hover:border-[hsl(var(--wa-borde))]">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
          {/* Toggle todas las sedes */}
          <button
            onClick={() => setShowAllSedes(v => !v)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all font-semibold border',
              showAllSedes
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-sm shadow-blue-500/10'
                : 'bg-[hsl(var(--wa-panel-alt))] text-muted-foreground border-transparent hover:border-[hsl(var(--wa-borde))] hover:text-foreground'
            )}
            title={showAllSedes ? 'Mostrando todas las sedes · Click para filtrar por sede actual' : 'Ver conversaciones de todas las sedes'}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showAllSedes ? 'Todas las sedes' : 'Mi sede'}</span>
          </button>
        </div>
      </div>

      {/* El pulso del día. Se puede plegar: el chat vive debajo con altura
          fija y en un portátil estas tarjetas le quitan justo el espacio que
          hace falta para leer una conversación. */}
      <TiraMetricas />

      {/* Chat layout */}
      <div
        className="flex flex-1 min-h-0 rounded-2xl overflow-hidden border border-[hsl(var(--wa-borde))]"
        style={{ background: 'hsl(var(--wa-panel))' }}
      >
        {/* ── Left: conversation list ── */}
        <div
          className={cn(
            'flex flex-col flex-shrink-0 w-full md:w-[340px] border-r border-[hsl(var(--wa-borde))]',
            showMobileChat ? 'hidden md:flex' : 'flex'
          )}
          style={{ background: 'hsl(var(--wa-panel-alt))' }}
        >
          <div className="px-3 py-3" style={{ borderBottom: '1px solid hsl(var(--wa-borde))' }}>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'hsl(var(--wa-hover))' }}>
              <Search className="w-4 h-4 text-[hsl(var(--wa-texto-suave))] flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar o empezar un chat"
                className="flex-1 bg-transparent text-sm text-[hsl(var(--wa-texto))] placeholder:text-[hsl(var(--wa-texto-suave))] outline-none"
              />
            </div>
          </div>

          {/* Filtros de la lista */}
          <div
            /* Envuelven en vez de desplazarse: la columna mide 340 px y con
               scroll horizontal el último chip quedaba escondido, que es la
               forma más segura de que nadie lo use. */
            className="flex flex-wrap gap-1.5 px-3 py-2"
            style={{ borderBottom: '1px solid hsl(var(--wa-borde))' }}
          >
            {([
              { id: 'todas', label: 'Todas' },
              { id: 'sin_leer', label: 'No leídas' },
              { id: 'clientes', label: 'Clientes' },
              { id: 'ventas', label: 'Ventas' },
              // Bot y Humano no están en el diseño pero son la distinción que
              // de verdad hace falta aquí: qué chats atiende el bot y cuáles
              // esperan a una persona.
              { id: 'bot', label: 'Bot' },
              { id: 'humano', label: 'Humano' },
            ] as const).map(f => {
              const activo = filtroLista === f.id;
              const n = cuentaFiltros[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroLista(f.id)}
                  className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{
                    background: activo ? '#f97316' : 'hsl(var(--wa-borde))',
                    color: activo ? '#fff' : 'hsl(var(--wa-texto-suave))',
                  }}
                >
                  {f.label}
                  <span className="tabular-nums" style={{ opacity: activo ? 0.85 : 0.5 }}>({n})</span>
                </button>
              );
            })}
          </div>

          {/* Banner todas las sedes */}
          {showAllSedes && (
            <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(96,165,250,0.08)', borderBottom: '1px solid rgba(96,165,250,0.15)' }}>
              <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#60a5fa' }} />
              <span className="text-[11px] font-semibold" style={{ color: '#60a5fa' }}>Todas las sedes · {filtered.length} chats</span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                <MessageSquare className="w-8 h-8 mb-2" style={{ color: 'hsl(var(--wa-texto-suave))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Sin conversaciones aún</p>
              </div>
            )}
            {filtered.map(conv => {
              const isActive = selected?.id === conv.id;
              const estado = conv.estado || 'activa';
              const dotColor = estado === 'bot' ? '#a78bfa' : estado === 'humano' ? '#fb923c' : estado === 'activa' ? '#34d399' : '#6b7280';
              const sedeInfo = showAllSedes ? getSedeLabel((conv as any).sede_id) : null;
              return (
                <div
                  key={conv.id}
                  onClick={() => selectConv(conv)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{ background: isActive ? 'hsl(var(--wa-hover))' : 'transparent', borderBottom: '1px solid hsl(var(--wa-borde))' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--wa-panel-alt))'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div className="relative flex-shrink-0">
                    <UserAvatar conv={conv} className="w-10 h-10" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: dotColor, borderColor: 'hsl(var(--wa-panel-alt))' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--wa-texto))' }}>{displayName(conv)}</span>
                      <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: 'hsl(var(--wa-texto-suave))' }}>
                        {conv.ultimo_mensaje_at ? formatRelativeTime(conv.ultimo_mensaje_at) : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[12px] truncate min-w-0 flex-1" style={{ color: 'hsl(var(--wa-texto-suave))' }}>
                        {conv.ultimo_mensaje ? conv.ultimo_mensaje.replace(/\s*\[env:(.*?)\]$/, '') : '...'}
                      </p>
                      {/* Qué tiene pendiente este cliente, de un vistazo. Una
                          sola etiqueta, la más urgente: tres chips en una fila
                          de lista no se leen y nada destacaría. */}
                      {(() => {
                        const et = ETIQUETAS[etiquetaDe(conv.cliente_id, indiceEtiquetas)];
                        return (
                          <span
                            title={et.ayuda}
                            className={cn(
                              'shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold',
                              et.clase,
                            )}
                          >
                            {et.label}
                          </span>
                        );
                      })()}
                      {(conv.mensajes_sin_leer ?? 0) > 0 && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#f97316' }}>
                          {conv.mensajes_sin_leer}
                        </span>
                      )}
                    </div>
                    {/* Etiqueta de sede cuando se ven todas las sedes */}
                    {sedeInfo && (
                      <div className="mt-1 flex items-center gap-1 w-fit rounded-full px-2 py-0.5" style={{ background: sedeInfo.bg }}>
                        <Building2 className="w-2.5 h-2.5 flex-shrink-0" style={{ color: sedeInfo.color }} />
                        <span className="text-[10px] font-semibold leading-none" style={{ color: sedeInfo.color }}>{sedeInfo.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: chat window ── */}
        <div
          className={cn('flex-1 flex flex-col min-h-0', !showMobileChat ? 'hidden md:flex' : 'fixed inset-0 z-[70] md:static md:z-auto')}
          style={{ background: 'hsl(var(--wa-fondo))', paddingTop: showMobileChat ? 'env(safe-area-inset-top)' : undefined, paddingBottom: showMobileChat ? 'env(safe-area-inset-bottom)' : undefined }}
        >
          {selected ? (
            <div className="flex-1 flex overflow-hidden relative">
              {/* Chat Main Area */}
              <div
                className="flex-1 flex flex-col min-w-0 min-h-0 relative" style={{ background: 'hsl(var(--wa-fondo))' }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const droppedFiles = Array.from(e.dataTransfer.files);
                  if (droppedFiles.length > 0) {
                    const newFiles = droppedFiles.map(f => ({ file: f, url: URL.createObjectURL(f) }));
                    setFiles(prev => [...prev, ...newFiles]);
                    inputRef.current?.focus();
                  }
                }}
              >
                {/* Drag Overlay */}
                {isDragging && (
                  <div className="absolute inset-x-0 bottom-0 top-[72px] z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                    <div className="bg-[hsl(var(--wa-panel-alt))] p-8 rounded-2xl border-2 border-dashed border-[hsl(var(--wa-marca))] flex flex-col items-center gap-4 text-center animate-in fade-in zoom-in duration-200">
                      <div className="w-16 h-16 rounded-full bg-[hsl(var(--wa-marca))]/20 flex items-center justify-center">
                        <Paperclip className="w-8 h-8 text-[hsl(var(--wa-marca))]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Suelta para adjuntar</h3>
                        <p className="text-sm text-[hsl(var(--wa-texto-suave))]">Los archivos se agregarán al mensaje</p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Chat header */}
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 flex-shrink-0 flex-wrap" style={{ background: 'hsl(var(--wa-panel-alt))', borderBottom: '1px solid hsl(var(--wa-borde))', minHeight: '56px' }}>
                  {/* Identity Row */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button onClick={() => setShowMobileChat(false)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--wa-hover))] transition-colors flex-shrink-0">
                      <X className="w-5 h-5" style={{ color: '#aebac1' }} />
                    </button>
                    <button onClick={() => setShowMobileInfo(true)} className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--wa-hover))] transition-colors flex-shrink-0">
                      <Info className="w-4 h-4" style={{ color: '#aebac1' }} />
                    </button>
                    <button
                      onClick={() => setShowInfoDesktop(v => !v)}
                      title={showInfoDesktop ? 'Ocultar panel de información' : 'Mostrar panel de información'}
                      className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg hover:bg-[hsl(var(--wa-hover))] transition-colors flex-shrink-0"
                    >
                      <Info className="w-4 h-4" style={{ color: showInfoDesktop ? 'hsl(var(--wa-marca))' : '#aebac1' }} />
                    </button>
                    <UserAvatar conv={selected} className="w-9 h-9 flex-shrink-0 shadow-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[14px] font-bold text-[hsl(var(--wa-texto))] leading-tight truncate">{displayName(selected)}</p>
                        <button onClick={startEditingName} className="p-1 hover:bg-[hsl(var(--wa-hover))] rounded-full transition-colors text-[hsl(var(--wa-texto-suave))] hover:text-emerald-500 flex-shrink-0">
                          <User className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] opacity-50 text-[hsl(var(--wa-texto-suave))] tabular-nums truncate">{selected.telefono}</p>
                        {showAllSedes && (() => {
                          const si = getSedeLabel((selected as any).sede_id);
                          return si ? (
                            <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: si.bg }}>
                              <Building2 className="w-2 h-2" style={{ color: si.color }} />
                              <span className="text-[9px] font-bold" style={{ color: si.color }}>{si.label}</span>
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Actions Row — always inline, scroll if needed */}
                  <div className="flex w-full items-center gap-1.5 flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] md:w-auto md:flex-shrink-0 md:flex-wrap md:justify-end md:overflow-visible">
                    {timeLeftStr && (
                      <div className={cn(
                        'flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold flex-shrink-0',
                        isWindowOpen ? 'bg-green-500/10 text-green-400 border border-green-500/15' : 'bg-red-500/10 text-red-400 border border-red-500/15'
                      )}>
                        <Clock className="w-3 h-3" />
                        <span className="tabular-nums">{timeLeftStr}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Retry IA / Retranscribe Audio button */}
                      <div className="relative">
                        {(() => {
                          const failedAudio = getFailedAudioMsg();
                          const failedImage = getFailedImageMsg();
                          const isAudioMode = !!failedAudio;
                          const isImageMode = !isAudioMode && !!failedImage;
                          const isLoading = retranscribing || retryingIA;
                          const btnClass = isAudioMode
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25'
                            : isImageMode
                              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/25 hover:bg-purple-500/25'
                              : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20';
                          const btnTitle = isAudioMode
                            ? 'Reintentar transcripción del audio fallido y responder con IA'
                            : isImageMode
                              ? 'Re-analizar imagen y responder con IA'
                              : 'Reintentar respuesta de IA para mensajes pendientes';
                          const btnIcon = isLoading
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : isAudioMode
                              ? <Mic className="w-3.5 h-3.5" />
                              : isImageMode
                                ? <ImageIcon className="w-3.5 h-3.5" />
                                : <Zap className="w-3.5 h-3.5" />;
                          const btnLabel = isLoading
                            ? (isAudioMode ? 'Transcribiendo...' : isImageMode ? 'Analizando...' : 'Reintentando...')
                            : isAudioMode
                              ? 'Retranscribir Audio'
                              : isImageMode
                                ? 'Re-analizar Imagen'
                                : 'Reintentar IA';
                          return (
                            <button
                              id="btn-retry-ia"
                              onClick={handleRetryIA}
                              disabled={isLoading}
                              title={btnTitle}
                              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 shadow-sm disabled:opacity-50 ${btnClass}`}
                            >
                              {btnIcon}
                              <span className="hidden sm:inline">{btnLabel}</span>
                            </button>
                          );
                        })()}
                        {retryStatus && (
                          <div className="absolute top-full mt-1 right-0 z-50 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap shadow-xl max-w-[280px] truncate" style={{ background: 'hsl(var(--wa-hover))', color: 'hsl(var(--wa-texto))', border: '1px solid hsl(var(--wa-borde))' }}>
                            {retryStatus}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setMode('bot')}
                        disabled={togglingMode || selected.estado === 'bot'}
                        className={cn('flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm', selected.estado === 'bot' ? 'bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30' : 'bg-[hsl(var(--wa-panel-alt))] text-[hsl(var(--wa-texto-suave))] border border-[hsl(var(--wa-borde))] hover:bg-[hsl(var(--wa-hover))]')}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Bot</span>
                      </button>
                      <button
                        onClick={() => setMode('humano')}
                        disabled={togglingMode || selected.estado === 'humano'}
                        className={cn('flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm', selected.estado === 'humano' ? 'bg-[#fb923c]/20 text-[#fb923c] border border-[#fb923c]/30' : 'bg-[hsl(var(--wa-panel-alt))] text-[hsl(var(--wa-texto-suave))] border border-[hsl(var(--wa-borde))] hover:bg-[hsl(var(--wa-hover))]')}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Tú</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mode strip */}
                <div
                  className="flex items-center gap-2 px-3 py-1.5 text-[10px] flex-shrink-0"
                  style={{ background: isHumano ? 'rgba(251,146,60,0.06)' : 'rgba(167,139,250,0.06)', color: isHumano ? '#fb923c' : '#a78bfa', borderBottom: `1px solid ${isHumano ? 'rgba(251,146,60,0.1)' : 'rgba(167,139,250,0.1)'}` }}
                >
                  {isHumano ? (
                    <><UserCheck className="w-3.5 h-3.5 flex-shrink-0 opacity-80" /><span>Modo humano activo — respondes tú</span></>
                  ) : (
                    <><Bot className="w-3.5 h-3.5 flex-shrink-0 opacity-80" /><span>Modo Bot IA activo — respondiendo automáticamente</span></>
                  )}
                </div>

                {/* Messages area */}
                <div
                  ref={chatScrollRef}
                  onScroll={handleScrollEvents}
                  className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-1 w-full"
                  style={{ minHeight: 0, background: 'hsl(var(--wa-fondo))' }}
                >
                  {/* Load more above */}
                  {loadingMore && (
                    <div className="flex justify-center py-2">
                      <span className="text-[11px] animate-pulse" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Cargando mensajes anteriores...</span>
                    </div>
                  )}
                  {hasMoreAbove && !loadingMore && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={loadOlderMsgs}
                        className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-full transition-colors hover:opacity-80"
                        style={{ background: 'hsl(var(--wa-hover))', color: 'hsl(var(--wa-texto-suave))' }}
                      >
                        <ChevronDown className="w-3 h-3 rotate-180" /> Ver mensajes anteriores
                      </button>
                    </div>
                  )}

                  {loadingMsgs && (
                    <div className="flex flex-col items-center justify-center h-40 gap-2">
                      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'hsl(var(--wa-hover))', borderTopColor: 'hsl(var(--wa-marca))' }} />
                      <span className="text-xs" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Cargando mensajes...</span>
                    </div>
                  )}
                  {!loadingMsgs && msgs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-center">
                      <MessageSquare className="w-8 h-8 mb-2" style={{ color: 'hsl(var(--wa-borde))' }} />
                      <p className="text-xs" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Sin mensajes en este chat aún</p>
                    </div>
                  )}

                  {msgs.map((msg, i) => {
                    const isOut = msg.tipo === 'saliente';
                    const prevMsg = msgs[i - 1];
                    const thisDay = new Date(msg.created_at).toLocaleDateString('es-VE');
                    const prevDay = prevMsg ? new Date(prevMsg.created_at).toLocaleDateString('es-VE') : null;
                    const showDivider = thisDay !== prevDay;
                    const isOptimistic = msg.id.startsWith('tmp-');

                    // Extract operator name tag from body
                    let cleanBody = msg.body || '';
                    let operatorName = '';
                    const envMatch = cleanBody.match(/\s*\[env:(.*?)\]$/);
                    if (envMatch) {
                      cleanBody = cleanBody.replace(envMatch[0], '');
                      operatorName = envMatch[1];
                    }
                    const cleanMsg = { ...msg, body: cleanBody };

                    return (
                      <React.Fragment key={msg.id}>
                        {showDivider && (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: 'hsl(var(--wa-panel-alt))', color: 'hsl(var(--wa-texto-suave))' }}>
                              {thisDay === new Date().toLocaleDateString('es-VE') ? 'Hoy' : thisDay}
                            </span>
                          </div>
                        )}
                        <div id={`msg-${msg.id}`} className={cn('flex w-full group relative', isOut ? 'justify-end' : 'justify-start')} style={{ marginBottom: '2px' }}>
                          <div
                            className="relative max-w-[88%] md:max-w-[75%] rounded-lg px-3 py-2 shadow-sm flex flex-col min-w-[60px]"
                            style={{ background: isOut ? 'hsl(var(--wa-burbuja-sale))' : 'hsl(var(--wa-panel-alt))', opacity: isOptimistic ? 0.75 : 1, borderRadius: isOut ? '8px 8px 2px 8px' : '8px 8px 8px 2px' }}
                          >
                            {/* Reaction Picker Popover (Responsive Position) */}
                            {!isOptimistic && (
                              <div className={cn(
                                "absolute -top-12 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex items-center gap-1 p-1 rounded-full shadow-2xl border border-[hsl(var(--wa-borde))] scale-90 group-hover:scale-100 backdrop-blur-md",
                                isOut ? "right-0" : "left-0"
                              )} style={{ background: 'rgba(32, 44, 51, 0.9)' }}>
                                <div className="flex gap-1 pr-2 border-r border-[hsl(var(--wa-borde))] mr-1">
                                  {['❤️', '👍', '😂', '😮', '🙏'].map(emoji => (
                                    <button key={emoji} onClick={() => handleReact(msg, emoji)} className="hover:scale-125 transition-transform p-0.5">{emoji}</button>
                                  ))}
                                </div>
                                <button onClick={() => copyToClipboard(cleanBody)} className="p-1.5 hover:bg-[hsl(var(--wa-hover))] rounded-full text-[hsl(var(--wa-texto-suave))] hover:text-white" title="Copiar">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {!isOut && (msg.media_type === 'audio' || msg.media_type === 'image' || msg.media_type === 'video' || msg.body.startsWith('[Cliente envió') || msg.body === '[Video]' || msg.body === '[Cliente envió audio]') && (
                                  <button onClick={() => handleReprocess(msg)} className="p-1.5 hover:bg-blue-500/20 rounded-full text-blue-400/60 hover:text-blue-400" title="Reintentar con Gemini 2.5">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {can('whatsapp', 'eliminar') && (
                                  <button onClick={() => deleteMsg(msg)} className="p-1.5 hover:bg-red-500/20 rounded-full text-red-500/60 hover:text-red-500" title="Eliminar">
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                            {msg.es_ia && (
                              <div className="flex items-center gap-1 mb-1" style={{ color: '#a78bfa' }}>
                                <Bot className="w-3 h-3" />
                                <span className="text-[10px] font-medium">Bot IA</span>
                              </div>
                            )}
                             {(() => {
                               const quoted = msg.quoted_wa_id ? msgs.find(m => m.wa_message_id === msg.quoted_wa_id) : null;
                               let cleanQuoted = null;
                               if (quoted) {
                                 let quotedBody = quoted.body || '';
                                 const quotedEnvMatch = quotedBody.match(/\s*\[env:(.*?)\]$/);
                                 if (quotedEnvMatch) {
                                   quotedBody = quotedBody.replace(quotedEnvMatch[0], '');
                                 }
                                 cleanQuoted = { ...quoted, body: quotedBody };
                               }
                               return <MediaBubble msg={cleanMsg} isOut={isOut} onImageClick={setPreviewImage} quotedMsg={cleanQuoted} />;
                             })()}
                            <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                              {operatorName ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/25 text-emerald-300/80 font-semibold flex items-center gap-0.5 border border-emerald-500/10">
                                  👤 {operatorName}
                                </span>
                              ) : <span />}
                              <div className="flex items-center gap-1 justify-end flex-shrink-0" style={{ marginRight: '-2px' }}>
                                <span className="text-[10px]" style={{ color: 'rgba(233,237,239,0.6)' }}>{formatTime(msg.created_at)}</span>
                                {isOut && (
                                  isOptimistic ? <Check className="w-3 h-3" style={{ color: 'rgba(233,237,239,0.5)' }} /> :
                                  msg.estado === 'leido' ? <CheckCheck className="w-3.5 h-3.5" style={{ color: '#53bdeb' }} /> :
                                  msg.estado === 'entregado' ? <CheckCheck className="w-3.5 h-3.5" style={{ color: 'rgba(233,237,239,0.5)' }} /> :
                                  <Check className="w-3 h-3" style={{ color: 'rgba(233,237,239,0.5)' }} />
                                )}
                              </div>
                            </div>
                            {msg.reaccion && (
                              <div className={cn("absolute -bottom-2 px-1.5 py-0.5 rounded-full text-xs shadow-md border border-[hsl(var(--wa-borde))]", isOut ? "left-0" : "right-0")} style={{ background: '#374045' }}>{msg.reaccion}</div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div style={{ height: '4px' }} />
                </div>

                {/* Respuestas rápidas — a la vista, no escondidas tras un
                    botón: son para escribir menos, y si hay que buscarlas
                    primero dejan de ahorrar nada. El título dice qué son. */}
                <div
                  className="flex-shrink-0 px-3 pt-2 pb-1"
                  style={{ background: 'hsl(var(--wa-panel-alt))', borderTop: '1px solid hsl(var(--wa-borde))' }}
                >
                  <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: 'hsl(var(--wa-texto-suave))' }}>
                    Respuestas rápidas
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {QUICK_REPLIES.map(r => (
                      <button
                        key={r.label}
                        onClick={() => { setMessage(r.texto); inputRef.current?.focus(); }}
                        title={r.texto}
                        className="flex-shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
                        style={{
                          background: 'hsl(var(--wa-panel))',
                          color: 'hsl(var(--wa-texto))',
                          borderColor: 'hsl(var(--wa-borde))',
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input area */}
                <div className="flex flex-col flex-shrink-0" style={{ background: 'hsl(var(--wa-panel-alt))', borderTop: '1px solid hsl(var(--wa-borde))' }}>
                  
                  {/* Reply Preview */}
                  {replyingTo && (
                    <div className="px-3 py-2 border-b border-white/5 bg-[hsl(var(--wa-panel))] flex items-center gap-3 animate-in slide-in-from-bottom-1 duration-200">
                      <div className="w-1 self-stretch rounded-full bg-[hsl(var(--wa-marca))]" />
                      <div className="flex-1 min-w-0 py-1">
                        <div className="text-[11px] font-bold text-[hsl(var(--wa-marca))]">
                          {replyingTo.tipo === 'saliente' ? 'Tú' : (selected?.datos_cliente?.nombre || selected?.telefono || 'Cliente')}
                        </div>
                        <div className="text-xs text-[hsl(var(--wa-texto-suave))] truncate">
                          {replyingTo.body || (replyingTo.media_type ? `[${replyingTo.media_type}]` : 'Mensaje')}
                        </div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-1.5 rounded-full hover:bg-[hsl(var(--wa-hover))] text-[hsl(var(--wa-texto-suave))]">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* File Preview */}
                  {files.length > 0 && (
                    <div className="p-3 border-b border-white/5 flex gap-3 overflow-x-auto custom-scrollbar">
                      {files.map((f, idx) => (
                        <div key={idx} className="relative inline-block border-2 border-[hsl(var(--wa-marca))] rounded-xl overflow-hidden shadow-lg bg-black/20 flex-shrink-0 group">
                          {f.file.type.startsWith('image/') ? (
                            <img src={f.url} alt="Preview" className="h-20 w-auto object-cover min-w-[80px]" />
                          ) : (
                            <div className="h-20 w-24 flex flex-col items-center justify-center bg-[hsl(var(--wa-panel))]">
                              {f.file.type.startsWith('video/') ? <Video className="w-7 h-7 opacity-70 text-white" /> : <FileText className="w-7 h-7 opacity-70 text-white" />}
                              <span className="text-[9px] mt-1 opacity-60 px-2 line-clamp-2 text-center text-ellipsis overflow-hidden text-white">{f.file.name}</span>
                            </div>
                          )}
                          <button onClick={() => removeFile(idx)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-red-500/80 text-white md:opacity-0 md:group-hover:opacity-100 shadow-sm transition-all focus:opacity-100">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                    <div className="flex items-center gap-2 px-2 md:px-3 py-2 md:py-3 relative min-h-[52px]">
                      {isRecording && (
                        <div 
                          className="absolute inset-0 z-30 flex items-center px-4 bg-[hsl(var(--wa-panel-alt))] animate-in fade-in slide-in-from-bottom-2 duration-200"
                          onMouseMove={handleRecordingMove}
                          onTouchMove={handleRecordingMove}
                          onMouseUp={() => stopRecording(true)}
                          onTouchEnd={() => stopRecording(true)}
                        >
                          <div className="flex items-center gap-2 md:gap-4 w-full">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                              <span className="text-sm font-bold text-white font-mono">{formatDuration(recordingTime)}</span>
                            </div>
                            
                            <div className="flex-1 flex justify-center items-center">
                              <div 
                                className="flex items-center gap-2 transition-all duration-75"
                                style={{ 
                                  transform: `translateX(-${slideOffset}px)`, 
                                  opacity: Math.max(0.2, 1 - (slideOffset / 120)) 
                                }}
                              >
                                <ChevronLeft className="w-4 h-4 text-[hsl(var(--wa-texto-suave))] animate-pulse" />
                                <span className="text-xs md:text-sm text-[hsl(var(--wa-texto-suave))] whitespace-nowrap">
                                  {slideOffset > 40 ? 'Suelta para cancelar' : 'Desliza para cancelar'}
                                </span>
                              </div>
                            </div>

                            <button 
                              onClick={(e) => { e.stopPropagation(); setIsRecordingCancelled(true); stopRecording(false); }}
                              className="text-red-500 text-[10px] md:text-xs font-black uppercase hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors"
                            >
                              CANCELAR
                            </button>
                          </div>
                        </div>
                      )}

                      {!isRecording && (
                        <>
                          <button onClick={() => setShowQuickReplies(!showQuickReplies)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[hsl(var(--wa-hover))] transition-colors flex-shrink-0">
                            <Smile className="w-5 h-5" style={{ color: '#aebac1' }} />
                          </button>
                          
                          <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[hsl(var(--wa-hover))] transition-colors flex-shrink-0 mr-1 relative">
                            <Paperclip className="w-5 h-5" style={{ color: '#aebac1' }} />
                            {files.length > 0 && (
                               <span className="absolute -top-1 -right-1 w-4 h-4 bg-[hsl(var(--wa-marca))] text-black text-[9px] font-bold rounded-full flex items-center justify-center pointer-events-none border border-[hsl(var(--wa-panel-alt))]">
                                 {files.length}
                               </span>
                            )}
                          </button>
                        </>
                      )}
                      <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,.pdf,.doc,.docx" />

                      <textarea
                        ref={inputRef} value={message} rows={1}
                        onChange={e => {
                          setMessage(e.target.value);
                          const t = e.target; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
                        }}
                        onKeyDown={e => {
                          // En computadora Enter envía y Shift+Enter hace salto de línea; en el teléfono Enter es salto de línea.
                          const tactil = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
                          if (e.key === 'Enter' && !e.shiftKey && !tactil) { e.preventDefault(); handleSend(); }
                        }}
                        placeholder={isWindowOpen ? (files.length > 0 ? (files.length === 1 ? 'Añade un comentario...' : 'El comentario irá con el primer archivo...') : 'Escribe un mensaje') : 'Ventana de 24h cerrada'}
                        className={cn("flex-1 min-w-0 resize-none py-2 px-4 rounded-lg text-[15px] md:text-sm leading-snug outline-none transition-all max-h-[132px]", isRecording && "opacity-0 pointer-events-none")}
                        style={{ background: 'hsl(var(--wa-hover))', color: 'hsl(var(--wa-texto))', border: 'none' }}
                      />
                      
                      {message.trim() || files.length > 0 ? (
                        <button 
                          onClick={() => { handleSend(); setReplyingTo(null); }} 
                          disabled={sending} 
                          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all shadow-lg" 
                          style={{ background: 'hsl(var(--wa-marca))' }}
                        >
                          <Send className={cn('w-4 h-4', sending && 'animate-pulse')} style={{ color: 'hsl(var(--wa-texto))' }} />
                        </button>
                      ) : (
                        <button 
                          onMouseDown={startRecording}
                          onTouchStart={startRecording}
                          onMouseUp={() => stopRecording(true)}
                          onTouchEnd={() => stopRecording(true)}
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300",
                            isRecording ? "bg-red-500 scale-125 shadow-xl z-30" : "bg-[hsl(var(--wa-panel-alt))] hover:bg-[hsl(var(--wa-hover))]"
                          )}
                        >
                          <Mic className={cn("w-5 h-5", isRecording ? "text-white" : "text-[#aebac1]")} />
                        </button>
                      )}
                    </div>
                </div>
              </div>

              {/* ── Ficha del cliente, junto al chat ──────────────────────
                  El contenido vive en `components/whatsapp/PanelCliente.tsx`.
                  Aquí solo queda la caja y su visibilidad: el panel es lo que
                  más creció con el rediseño y dentro de esta página, que ya
                  tiene 2.400 líneas, habría sido imposible de mantener.
                  Toda la lógica que ya existía —editar el nombre, enviar la
                  ubicación de una sede, mandar la tarjeta del asesor, los
                  vehículos en vivo— se le pasa por props. */}
              <div className={cn(
                showMobileInfo ? 'absolute inset-0 z-30 flex' : 'hidden',
                'flex-col w-full lg:w-72 border-l border-[hsl(var(--wa-borde))]',
                showInfoDesktop ? 'lg:relative lg:flex' : 'lg:hidden'
              )} style={{ background: 'hsl(var(--wa-panel))' }}>
                <PanelCliente
                  nombre={displayName(selected)}
                  telefono={selected.telefono}
                  clienteId={selected.cliente_id ?? selected.clientes?.id ?? null}
                  email={selected.clientes?.email ?? null}
                  direccion={selected.clientes?.direccion ?? null}
                  cedula={selected.clientes?.cedula ?? null}
                  clienteDesde={selected.clientes?.created_at ?? null}
                  nota={selected.memoria?.notas ?? null}
                  vehiculos={selectedVehicles}
                  cargandoVehiculos={loadingVehicles}
                  vehiculosMemoria={selected.memoria?.vehiculos ?? []}
                  editandoNombre={isEditingName}
                  nombreEditado={editName}
                  onCambiarNombre={setEditName}
                  onEmpezarEdicion={startEditingName}
                  onGuardarNombre={handleSaveName}
                  guardandoNombre={savingName}
                  sedes={SEDE_LOCATIONS}
                  onEnviarUbicacion={handleSendLocation}
                  onEnviarContacto={handleSendContact}
                  enviandoContacto={sendingContact}
                  onRespuestaRapida={t => setMessage(m => (m ? `${m} ${t}` : t))}
                  onCerrarMovil={() => setShowMobileInfo(false)}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(0,168,132,0.1)', border: '2px solid rgba(0,168,132,0.2)' }}>
                <MessageSquare className="w-9 h-9" style={{ color: 'hsl(var(--wa-marca))' }} />
              </div>
              <h3 className="font-medium mb-1 text-base" style={{ color: 'hsl(var(--wa-texto))' }}>WhatsApp CRM</h3>
              <p className="text-sm" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Selecciona una conversación para ver los mensajes en tiempo real</p>
            </div>
          )}
        </div>

        {/* ── Audit View Overlay ── */}
        {viewMode === 'audit' && (
          <div className="absolute inset-x-0 bottom-0 top-[110px] z-[60] flex flex-col" style={{ background: 'hsl(var(--wa-panel))' }}>
            <div className="p-4 flex items-center justify-between border-b border-white/5 bg-[hsl(var(--wa-panel-alt))]">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-red-400">
                  <Trash2 className="w-5 h-5" /> Papelera de Auditoría
                </h2>
                <p className="text-xs text-muted-foreground">Mensajes eliminados recientemente (Últimos 100)</p>
              </div>
              <button 
                onClick={() => setViewMode('chat')}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-[hsl(var(--wa-panel-alt))] hover:bg-[hsl(var(--wa-hover))] transition-colors"
              >
                Cerrar Papelera
              </button>
            </div>
            
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {loadingAudit ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RefreshCw className="w-10 h-10 animate-spin text-[hsl(var(--wa-texto-suave))]" />
                  <p className="text-sm text-[hsl(var(--wa-texto-suave))]">Cargando auditoría...</p>
                </div>
              ) : auditMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                  <Trash2 className="w-16 h-16 mb-4" />
                  <p>La papelera está vacía</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {auditMsgs.map(msg => (
                    <div key={msg.id} className="p-4 rounded-xl border border-white/5 bg-[hsl(var(--wa-panel-alt))] flex flex-col gap-3 relative group">
                       <div className="flex items-center justify-between gap-2">
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-red-400" />
                           <span className="text-[10px] font-bold text-[hsl(var(--wa-texto-suave))] uppercase">Eliminado en {new Date(msg.deleted_at).toLocaleDateString()}</span>
                         </div>
                         <button 
                           onClick={() => restoreMsg(msg.id)}
                           className="p-2 rounded-lg bg-green-500/10 text-green-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-500/20"
                           title="Restaurar mensaje"
                         >
                           <RotateCcw className="w-4 h-4" />
                         </button>
                       </div>
                       <div className="bg-black/20 p-3 rounded-lg border border-white/5 italic text-sm text-[hsl(var(--wa-texto))] whitespace-pre-wrap line-clamp-4">
                         {msg.body}
                       </div>
                       <div className="flex items-center justify-between mt-1">
                         <span className="text-[11px] text-[hsl(var(--wa-texto-suave))] truncate max-w-[150px]">De: {msg.from_number}</span>
                         <span className="text-[10px] text-[hsl(var(--wa-texto-suave))]">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
      {/* Edit Name Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--wa-borde))] shadow-2xl p-6" style={{ background: 'hsl(var(--wa-panel-alt))' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'hsl(var(--wa-texto))' }}>Editar Contacto</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Nombre</label>
                <input
                  value={editName.nombre}
                  onChange={e => setEditName(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full py-2 px-3 rounded-lg text-sm outline-none"
                  style={{ background: 'hsl(var(--wa-hover))', color: 'hsl(var(--wa-texto))', border: '1px solid hsl(var(--wa-borde))' }}
                  placeholder="Ej: Juan"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'hsl(var(--wa-texto-suave))' }}>Apellido</label>
                <input
                  value={editName.apellido}
                  onChange={e => setEditName(prev => ({ ...prev, apellido: e.target.value }))}
                  className="w-full py-2 px-3 rounded-lg text-sm outline-none"
                  style={{ background: 'hsl(var(--wa-hover))', color: 'hsl(var(--wa-texto))', border: '1px solid hsl(var(--wa-borde))' }}
                  placeholder="Ej: Perez"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-8">
              <button 
                onClick={() => setIsEditingName(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-[hsl(var(--wa-hover))] transition-colors"
                style={{ color: 'hsl(var(--wa-texto-suave))' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveName}
                disabled={savingName || !editName.nombre.trim()}
                className="px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2"
                style={{ background: 'hsl(var(--wa-marca))', color: 'hsl(var(--wa-panel))', opacity: savingName ? 0.7 : 1 }}
              >
                {savingName && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Native Image Preview Modal */}
    {previewImage && (
      <div 
        className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={() => setPreviewImage(null)}
      >
        <button 
          className="absolute top-6 right-6 p-2 text-[hsl(var(--wa-texto-suave))] hover:text-white hover:bg-[hsl(var(--wa-hover))] rounded-full transition-all z-[210] md:top-10 md:right-10"
          onClick={() => setPreviewImage(null)}
        >
          <X className="w-10 h-10" />
        </button>
        <div className="relative max-w-full max-h-full flex items-center justify-center p-2">
          <img 
            src={previewImage} 
            className="max-w-full max-h-[90vh] object-contain shadow-2xl rounded-lg animate-in zoom-in-95 duration-200 border border-[hsl(var(--wa-borde))]" 
            alt="Preview"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      </div>
    )}
    </>
  );
}
