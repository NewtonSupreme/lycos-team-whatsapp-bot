'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Send, Bot, User,
  Smile, CheckCheck, Check, X, RefreshCw, UserCheck, Wifi, WifiOff, Search, Clock,
  Image as ImageIcon, Video, Volume2, FileText, ChevronDown, Car, Calendar, Hash, Info,
  Copy, Trash, Zap, Paperclip, Mic, UserPlus, Trash2, RotateCcw
} from 'lucide-react';
import { supabase, syncClientData } from '@/lib/supabase';
import { Vehiculo } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';

const QUICK_REPLIES = [
  '¡Hola! ¿En qué le puedo ayudar? 😊',
  'Su vehículo está listo para retirar. 🔧',
  'Le informamos que su servicio está en proceso.',
  '¿Podría indicarnos su marca/modelo y año?',
  'Tenemos disponibilidad mañana. 📅',
  'Le envío los precios en un momento. 💰',
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
  } | null;
  memoria?: {
    vehiculos?: Array<{ marca?: string; modelo?: string; anio?: string; placa?: string }>;
    nombre?: string;
    placa?: string;
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
    'linear-gradient(135deg, #00a884 0%, #008069 100%)',
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
      className={cn("rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-lg border border-white/10", className)}
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

function MediaBubble({ msg, isOut }: { msg: RawMsg; isOut: boolean }) {
  const { body, media_url, media_type } = msg;
  
  const proxyUrl = media_url ? `/api/whatsapp/media/${media_url}` : null;
  const type = media_type || detectMediaType(body);
  // Detect failed audio transcription using the exact body text saved by the webhook
  const isFailedAudio = type === 'audio' && body?.includes('no se pudo transcribir');
  const isTranscribedAudio = type === 'audio' && body?.includes('(Audio transcrito)');

  if (!type && !proxyUrl) {
    return <p className="text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#e9edef', wordBreak: 'break-word' }}>{body}</p>;
  }

  const icons = {
    image: <ImageIcon className="w-8 h-8" />,
    video: <Video className="w-8 h-8" />,
    audio: <Volume2 className="w-8 h-8" />,
    document: <FileText className="w-8 h-8" />,
    sticker: <ImageIcon className="w-8 h-8 opacity-50" />,
  };
  const labels = { image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento', sticker: 'Sticker' };

  const color = isOut ? '#00a884' : '#2a3942';

  return (
    <div className="flex flex-col gap-1">
      {type === 'image' && proxyUrl ? (
        <img src={proxyUrl} alt="Imagen" className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity" style={{ border: `1px solid ${color}` }} onClick={() => window.open(proxyUrl, '_blank')} />
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
            <p className="text-[12px] italic px-1" style={{ color: '#8696a0' }}>
              🎙️ {body.replace(' (Audio transcrito)', '')}
            </p>
          )}
        </div>
      ) : type === 'sticker' && proxyUrl ? (
        <div className="flex justify-center p-1">
          <img src={proxyUrl} alt="Sticker" className="w-32 h-32 object-contain" />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ color: isOut ? '#25d366' : '#8696a0' }}>{icons[type as keyof typeof icons] || <FileText className="w-8 h-8" />}</div>
          <div className="flex flex-col">
            <span className="text-sm font-medium" style={{ color: '#e9edef' }}>{labels[type as keyof typeof labels] || 'Archivo'}</span>
            {body && !['[image]', '[imagen]', '[audio]', '[video]', '[sticker]'].includes(body.toLowerCase()) && (
              <span className="text-xs opacity-70" style={{ color: '#e9edef' }}>{body}</span>
            )}
          </div>
        </div>
      )}
      {media_url && body && type !== 'audio' && !['[image]', '[imagen]', '[audio]', '[video]', '[sticker]'].includes(body.toLowerCase()) && (
         <p className="text-[13px] mt-1" style={{ color: '#e9edef' }}>{body}</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function WhatsAppPage() {
  const [convs, setConvs] = useState<RawConv[]>([]);
  const [selected, setSelected] = useState<RawConv | null>(null);
  const [msgs, setMsgs] = useState<RawMsg[]>([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
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
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [retranscribing, setRetranscribing] = useState(false);
  const [sendingContact, setSendingContact] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'audit'>('chat');
  const [auditMsgs, setAuditMsgs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  const loadConvs = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('conversaciones')
      .select('*, clientes(id, nombre, apellido, telefono)')
      .order('ultimo_mensaje_at', { ascending: false })
      .limit(1000);
    if (!data) return;
    setConvs(data as unknown as RawConv[]);
    if (selectedRef.current) {
      const fresh = (data as unknown as RawConv[]).find(c => c.id === selectedRef.current!.id);
      if (fresh) setSelected(fresh);
    }
  }, []);

  // ── OPTIMIZED: Load messages newest-first, show immediately ──
  // Loads DESC (newest first), reverses for display → user sees newest right away
  const loadInitialMsgs = useCallback(async (telefono: string) => {
    if (!supabase) return;
    setLoadingMsgs(true);
    setHasMoreAbove(false);

    const { data } = await supabase.from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }) // newest first
      .limit(60);

    setLoadingMsgs(false);

    if (!data) return;

    const sorted = [...data].reverse() as RawMsg[]; // display oldest→newest
    setMsgs(sorted);
    setHasMoreAbove(data.length === 60);

    // Scroll to bottom AFTER paint
    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const deleteMsg = async (msg: RawMsg) => {
    if (!confirm('¿Seguro que deseas eliminar este mensaje? Pasará a la papelera de auditoría.')) return;
    
    // 1. Log to activity_log for traceability
    try {
      await supabase!.from('activity_log').insert({
        usuario: 'Administrador',
        accion: 'delete_message',
        modulo: 'whatsapp',
        detalles: `Eliminado mensaje de ${msg.from_number}: "${msg.body.substring(0, 80)}..."`,
        ip_address: 'CRM_UI'
      });
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
    const { error } = await supabase!.from('mensajes_whatsapp').update({ deleted_at: null }).eq('id', id);
    if (!error) {
      setAuditMsgs(prev => prev.filter(m => m.id !== id));
      if (selected && msgs.some(m => m.id === id)) {
         loadInitialMsgs(selected.telefono);
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
  const fetchNewMsgs = useCallback(async (telefono: string) => {
    if (!supabase) return;
    const latest = msgsRef.current;
    const realMsgs = latest.filter(m => !m.id.startsWith('tmp-'));
    const lastTs = realMsgs.length ? realMsgs[realMsgs.length - 1].created_at : new Date(0).toISOString();

    const { data } = await supabase.from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .is('deleted_at', null)
      .gt('created_at', lastTs)
      .order('created_at', { ascending: true })
      .limit(20);

    if (data && data.length > 0) {
      setMsgs(prev => mergeMessages(prev, data as RawMsg[]));
    }
  }, []);

  const loadVehicles = useCallback(async (clientId: string) => {
    if (!supabase) return;
    setLoadingVehicles(true);
    const { data } = await supabase.from('vehiculos').select('*').eq('cliente_id', clientId).eq('estado', 'activo');
    setSelectedVehicles(data || []);
    setLoadingVehicles(false);
  }, []);

  // ── Initial setup ────────────────────────────────────────────
  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

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
          if (newMsg.from_number === phone || newMsg.to_number === phone) {
            setMsgs(prev => {
              const withoutOptimistic = prev.filter(m => !m.id.startsWith('tmp-'));
              return mergeMessages(withoutOptimistic, [newMsg]);
            });
          }
        }
        loadConvs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, () => {
        loadConvs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        loadConvs();
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

    // Only poll if WS is down; if connected, poll less aggressively
    const poll = setInterval(() => {
      const cur = selectedRef.current;
      // If realtime is live, only do a light conv refresh every 10s
      if (realtimeConnectedRef.current) {
        loadConvs();
      } else {
        // Fallback: aggressive polling when WS is down
        if (cur) fetchNewMsgs(cur.telefono);
        loadConvs();
      }
    }, 10000);

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
    await loadInitialMsgs(conv.telefono);
    
    // Fetch vehicles
    if (conv.cliente_id) {
      await loadVehicles(conv.cliente_id);
    } else {
      setSelectedVehicles([]);
    }

    if (supabase && (conv.mensajes_sin_leer ?? 0) > 0) {
      supabase.from('conversaciones')
        .update({ mensajes_sin_leer: 0 })
        .eq('telefono', conv.telefono)
        .then(() => loadConvs());
    }
  };

  // ── Send message ──────────────────────────────────────────────
  const handleSend = async () => {
    if ((!message.trim() && files.length === 0) || !selected || sending) return;
    const body = message.trim();
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
          
          const optimistic: RawMsg = {
            id: optimisticId,
            from_number: 'system',
            to_number: selected.telefono,
            body: i === 0 ? body : '', // Only first file gets the caption
            tipo: 'saliente',
            estado: 'enviado',
            es_ia: false,
            created_at: new Date().toISOString(),
          };

          if (file.type.startsWith('image/')) {
            optimistic.media_type = 'image';
            if (url) optimistic.body = '[imagen] ' + (optimistic.body || '');
          }
          else if (file.type.startsWith('video/')) optimistic.media_type = 'video';
          else if (file.type.startsWith('audio/')) optimistic.media_type = 'audio';
          else optimistic.media_type = 'document';

          setMsgs(prev => [...prev, optimistic]);

          const fd = new FormData();
          fd.append('to', selected.telefono);
          if (i === 0 && body) fd.append('message', body);
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
          body,
          tipo: 'saliente',
          estado: 'enviado',
          es_ia: false,
          created_at: new Date().toISOString(),
        };
        setMsgs(prev => [...prev, optimistic]);

        const fd = new FormData();
        fd.append('to', selected.telefono);
        fd.append('message', body);
        await fetch('/api/whatsapp/send', { method: 'POST', body: fd });
      }

      // Clear files after success
      files.forEach(f => URL.revokeObjectURL(f.url));
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (e) {
      console.error('Error enviando:', e);
    } finally {
      setSending(false);
      setMsgs(prev => prev.filter(m => !m.id.startsWith('tmp-')));
      await fetchNewMsgs(selected.telefono);
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
    await supabase.from('conversaciones').update({ estado: mode }).eq('telefono', selected.telefono);
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
        await supabase.from('clientes').update({ nombre, apellido }).eq('id', selected.cliente_id);
      }

      // 2. Update conversaciones
      await supabase.from('conversaciones').update({
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
        await fetchNewMsgs(selected!.telefono);
        await loadConvs();
      } else if (res.status === 207) {
        setRetryStatus('⚠️ Imagen descrita pero IA falló al responder');
        await fetchNewMsgs(selected!.telefono);
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
        await fetchNewMsgs(selected!.telefono);
        await loadConvs();
      } else if (res.status === 207) {
        // Partial: transcription OK but AI failed
        setRetryStatus(`⚠️ Transcrito pero IA falló. Transcripción: "${(data.transcript || '').substring(0, 40)}"`);
        await fetchNewMsgs(selected!.telefono);
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
        await fetchNewMsgs(selected!.telefono);
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
      fetchNewMsgs(selected.telefono);
    }
  };

  // ── Send Advisor Contact ──────────────────────────────────────
  const handleSendContact = async () => {
    if (!selected || sendingContact) return;
    if (!confirm(`¿Enviar tarjeta de contacto del Asesor a ${displayName(selected)}?`)) return;
    
    setSendingContact(true);
    try {
      const res = await fetch('/api/whatsapp/send-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selected.telefono }),
      });
      if (res.ok) {
        await fetchNewMsgs(selected.telefono);
        await loadConvs();
        scrollToBottom(true);
      } else {
        alert('Error al enviar la tarjeta de contacto');
      }
    } catch (e) {
      console.error('Error sendContact:', e);
      alert('Error de conexión');
    } finally {
      setSendingContact(false);
    }
  };

  const filtered = convs.filter(c => {
    const q = search.toLowerCase();
    return (displayName(c) + c.telefono + (c.ultimo_mensaje || '')).toLowerCase().includes(q);
  });

  const isHumano = selected?.estado === 'humano';
  const totalUnread = convs.reduce((s, c) => s + (c.mensajes_sin_leer ?? 0), 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="space-y-3">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            WhatsApp CRM
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {isConnected
              ? <><Wifi className="w-3 h-3 text-green-400" />En vivo{totalUnread > 0 ? ` · ${totalUnread} sin leer` : ''}</>
              : <><WifiOff className="w-3 h-3 text-yellow-400 animate-pulse" />Conectando...</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const newMode = viewMode === 'chat' ? 'audit' : 'chat';
              setViewMode(newMode);
              if (newMode === 'audit') loadAuditMsgs();
            }} 
            className={cn(
              "flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all font-bold",
              viewMode === 'audit' 
                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                : "bg-white/5 text-muted-foreground hover:text-foreground border border-transparent hover:border-white/10"
            )}
          >
            {viewMode === 'audit' ? <MessageSquare className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            {viewMode === 'audit' ? 'Volver al Chat' : 'Papelera'}
          </button>
          <button onClick={loadConvs} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* Chat layout */}
      <div
        className="flex rounded-2xl overflow-hidden border border-white/8"
        style={{ height: 'calc(100vh - 180px)', minHeight: '560px', background: '#111b21' }}
      >
        {/* ── Left: conversation list ── */}
        <div
          className={cn(
            'flex flex-col flex-shrink-0 w-full md:w-[340px] border-r border-white/6',
            showMobileChat ? 'hidden md:flex' : 'flex'
          )}
          style={{ background: '#202c33' }}
        >
          <div className="px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#2a3942' }}>
              <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar o empezar un chat"
                className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/35 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                <MessageSquare className="w-8 h-8 mb-2" style={{ color: 'rgba(255,255,255,0.2)' }} />
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Sin conversaciones aún</p>
              </div>
            )}
            {filtered.map(conv => {
              const isActive = selected?.id === conv.id;
              const estado = conv.estado || 'activa';
              const dotColor = estado === 'bot' ? '#a78bfa' : estado === 'humano' ? '#fb923c' : estado === 'activa' ? '#34d399' : '#6b7280';
              return (
                <div
                  key={conv.id}
                  onClick={() => selectConv(conv)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{ background: isActive ? '#2a3942' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#202c33'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div className="relative flex-shrink-0">
                    <UserAvatar conv={conv} className="w-10 h-10" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: dotColor, borderColor: '#202c33' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate" style={{ color: '#e9edef' }}>{displayName(conv)}</span>
                      <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: '#8696a0' }}>
                        {conv.ultimo_mensaje_at ? formatRelativeTime(conv.ultimo_mensaje_at) : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[12px] truncate" style={{ color: '#8696a0' }}>
                        {conv.ultimo_mensaje || '...'}
                      </p>
                      {(conv.mensajes_sin_leer ?? 0) > 0 && (
                        <span className="flex-shrink-0 ml-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: '#00a884', color: '#111b21' }}>
                          {conv.mensajes_sin_leer}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: chat window ── */}
        <div
          className={cn('flex-1 flex flex-col min-h-0', !showMobileChat && 'hidden md:flex')}
          style={{ background: '#0b141a' }}
        >
          {selected ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Chat Main Area */}
              <div 
                className="flex-1 flex flex-col min-w-0 relative" style={{ background: '#0b141a' }}
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
                    <div className="bg-[#202c33] p-8 rounded-2xl border-2 border-dashed border-[#00a884] flex flex-col items-center gap-4 text-center animate-in fade-in zoom-in duration-200">
                      <div className="w-16 h-16 rounded-full bg-[#00a884]/20 flex items-center justify-center">
                        <Paperclip className="w-8 h-8 text-[#00a884]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Suelta para adjuntar</h3>
                        <p className="text-sm text-white/60">Los archivos se agregarán al mensaje</p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Chat header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 px-3 md:px-4 py-3 md:py-2.5 flex-shrink-0" style={{ background: '#202c33', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Identity Row */}
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => setShowMobileChat(false)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
                      <X className="w-5 h-5" style={{ color: '#aebac1' }} />
                    </button>
                    <UserAvatar conv={selected} className="w-10 h-10 md:w-11 md:h-11 flex-shrink-0 shadow-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] md:text-base font-bold text-[#e9edef] leading-tight break-words">{displayName(selected)}</p>
                        <button onClick={startEditingName} className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-white/20 hover:text-green-400 flex-shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[12px] opacity-50 text-[#8696a0] tabular-nums">{selected.telefono}</p>
                    </div>
                  </div>

                  {/* Actions Row (Mobile: New line with space; Desktop: Inline) */}
                  <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto md:border-t-0 border-t border-white/5 pt-3 md:pt-0">
                    {timeLeftStr && (
                      <div className={cn(
                        'flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] md:text-xs font-semibold flex-shrink-0 shadow-sm',
                        isWindowOpen ? 'bg-green-500/5 text-green-400 border border-green-500/10' : 'bg-red-500/5 text-red-400 border border-red-500/10'
                      )}>
                        <Clock className="w-3.5 h-3.5" />
                        <span className="tabular-nums tracking-tight">{timeLeftStr}</span>
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
                          <div className="absolute top-full mt-1 right-0 z-50 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap shadow-xl max-w-[280px] truncate" style={{ background: '#2a3942', color: '#e9edef', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {retryStatus}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setMode('bot')}
                        disabled={togglingMode || selected.estado === 'bot'}
                        className={cn('flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-w-[75px] shadow-sm', selected.estado === 'bot' ? 'bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10')}
                      >
                        <Bot className="w-4 h-4" />
                        <span>Bot</span>
                      </button>
                      <button
                        onClick={() => setMode('humano')}
                        disabled={togglingMode || selected.estado === 'humano'}
                        className={cn('flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-w-[75px] shadow-sm', selected.estado === 'humano' ? 'bg-[#fb923c]/20 text-[#fb923c] border border-[#fb923c]/30' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10')}
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Tú</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mode strip */}
                <div
                  className="flex items-center gap-2 px-4 py-2 text-[10px] md:text-[11px] flex-shrink-0"
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
                  className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-1 w-full"
                  style={{ minHeight: 0, background: '#0b141a' }}
                >
                  {/* Load more above */}
                  {loadingMore && (
                    <div className="flex justify-center py-2">
                      <span className="text-[11px] animate-pulse" style={{ color: '#8696a0' }}>Cargando mensajes anteriores...</span>
                    </div>
                  )}
                  {hasMoreAbove && !loadingMore && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={loadOlderMsgs}
                        className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-full transition-colors hover:opacity-80"
                        style={{ background: '#2a3942', color: '#8696a0' }}
                      >
                        <ChevronDown className="w-3 h-3 rotate-180" /> Ver mensajes anteriores
                      </button>
                    </div>
                  )}

                  {loadingMsgs && (
                    <div className="flex flex-col items-center justify-center h-40 gap-2">
                      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#2a3942', borderTopColor: '#00a884' }} />
                      <span className="text-xs" style={{ color: '#8696a0' }}>Cargando mensajes...</span>
                    </div>
                  )}
                  {!loadingMsgs && msgs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-center">
                      <MessageSquare className="w-8 h-8 mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
                      <p className="text-xs" style={{ color: '#8696a0' }}>Sin mensajes en este chat aún</p>
                    </div>
                  )}

                  {msgs.map((msg, i) => {
                    const isOut = msg.tipo === 'saliente';
                    const prevMsg = msgs[i - 1];
                    const thisDay = new Date(msg.created_at).toLocaleDateString('es-VE');
                    const prevDay = prevMsg ? new Date(prevMsg.created_at).toLocaleDateString('es-VE') : null;
                    const showDivider = thisDay !== prevDay;
                    const isOptimistic = msg.id.startsWith('tmp-');

                    return (
                      <React.Fragment key={msg.id}>
                        {showDivider && (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: '#182229', color: '#8696a0' }}>
                              {thisDay === new Date().toLocaleDateString('es-VE') ? 'Hoy' : thisDay}
                            </span>
                          </div>
                        )}
                        <div className={cn('flex w-full group relative', isOut ? 'justify-end' : 'justify-start')} style={{ marginBottom: '2px' }}>
                          <div
                            className="relative max-w-[88%] md:max-w-[75%] rounded-lg px-3 py-2 shadow-sm flex flex-col min-w-[60px]"
                            style={{ background: isOut ? '#005c4b' : '#202c33', opacity: isOptimistic ? 0.75 : 1, borderRadius: isOut ? '8px 8px 2px 8px' : '8px 8px 8px 2px' }}
                          >
                            {/* Reaction Picker Popover (Responsive Position) */}
                            {!isOptimistic && (
                              <div className={cn(
                                "absolute -top-12 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex items-center gap-1 p-1 rounded-full shadow-2xl border border-white/10 scale-90 group-hover:scale-100 backdrop-blur-md",
                                isOut ? "right-0" : "left-0"
                              )} style={{ background: 'rgba(32, 44, 51, 0.9)' }}>
                                <div className="flex gap-1 pr-2 border-r border-white/10 mr-1">
                                  {['❤️', '👍', '😂', '😮', '🙏'].map(emoji => (
                                    <button key={emoji} onClick={() => handleReact(msg, emoji)} className="hover:scale-125 transition-transform p-0.5">{emoji}</button>
                                  ))}
                                </div>
                                <button onClick={() => copyToClipboard(msg.body)} className="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-white" title="Copiar">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                  <button onClick={() => deleteMsg(msg)} className="p-1.5 hover:bg-red-500/20 rounded-full text-red-500/60 hover:text-red-500" title="Eliminar">
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                              </div>
                            )}
                            {msg.es_ia && (
                              <div className="flex items-center gap-1 mb-1" style={{ color: '#a78bfa' }}>
                                <Bot className="w-3 h-3" />
                                <span className="text-[10px] font-medium">Bot IA</span>
                              </div>
                            )}
                            <MediaBubble msg={msg} isOut={isOut} />
                            <div className="flex items-center gap-1 justify-end mt-1 flex-shrink-0" style={{ marginRight: '-2px' }}>
                              <span className="text-[10px]" style={{ color: 'rgba(233,237,239,0.6)' }}>{formatTime(msg.created_at)}</span>
                              {isOut && (
                                isOptimistic ? <Check className="w-3 h-3" style={{ color: 'rgba(233,237,239,0.5)' }} /> :
                                msg.estado === 'leido' ? <CheckCheck className="w-3.5 h-3.5" style={{ color: '#53bdeb' }} /> :
                                msg.estado === 'entregado' ? <CheckCheck className="w-3.5 h-3.5" style={{ color: 'rgba(233,237,239,0.5)' }} /> :
                                <Check className="w-3 h-3" style={{ color: 'rgba(233,237,239,0.5)' }} />
                              )}
                            </div>
                            {msg.reaccion && (
                              <div className={cn("absolute -bottom-2 px-1.5 py-0.5 rounded-full text-xs shadow-md border border-white/10", isOut ? "left-0" : "right-0")} style={{ background: '#374045' }}>{msg.reaccion}</div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div style={{ height: '4px' }} />
                </div>

                {/* Quick replies */}
                {showQuickReplies && (
                  <div className="flex gap-2 overflow-x-auto px-3 py-2 flex-shrink-0" style={{ background: '#202c33', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {QUICK_REPLIES.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => { setMessage(r); setShowQuickReplies(false); inputRef.current?.focus(); }}
                        className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors hover:opacity-80"
                        style={{ background: '#2a3942', color: '#8696a0', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        {r.length > 38 ? r.slice(0, 38) + '…' : r}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input area */}
                <div className="flex flex-col flex-shrink-0" style={{ background: '#202c33', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  
                  {/* File Preview */}
                  {files.length > 0 && (
                    <div className="p-3 border-b border-white/5 flex gap-3 overflow-x-auto custom-scrollbar">
                      {files.map((f, idx) => (
                        <div key={idx} className="relative inline-block border-2 border-[#00a884] rounded-xl overflow-hidden shadow-lg bg-black/20 flex-shrink-0 group">
                          {f.file.type.startsWith('image/') ? (
                            <img src={f.url} alt="Preview" className="h-20 w-auto object-cover min-w-[80px]" />
                          ) : (
                            <div className="h-20 w-24 flex flex-col items-center justify-center bg-[#111b21]">
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

                  <div className="flex items-center gap-2 px-3 py-3">
                    <button onClick={() => setShowQuickReplies(!showQuickReplies)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors flex-shrink-0">
                      <Smile className="w-5 h-5" style={{ color: '#aebac1' }} />
                    </button>
                    
                    <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors flex-shrink-0 mr-1 relative">
                      <Paperclip className="w-5 h-5" style={{ color: '#aebac1' }} />
                      {files.length > 0 && (
                         <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#00a884] text-black text-[9px] font-bold rounded-full flex items-center justify-center pointer-events-none border border-[#202c33]">
                           {files.length}
                         </span>
                      )}
                    </button>
                    <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,.pdf,.doc,.docx" />

                    <input
                      ref={inputRef} value={message} onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                      placeholder={isWindowOpen ? (files.length > 0 ? (files.length === 1 ? 'Añade un comentario...' : 'El comentario irá con el primer archivo...') : 'Escribe un mensaje') : 'Ventana de 24h cerrada'}
                      className="flex-1 py-2 px-4 rounded-lg text-sm outline-none"
                      style={{ background: '#2a3942', color: '#e9edef', border: 'none' }}
                    />
                    <button onClick={handleSend} disabled={(!message.trim() && files.length === 0) || sending} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all" style={{ background: (message.trim() || files.length > 0) && !sending ? '#00a884' : '#2a3942', opacity: (!message.trim() && files.length === 0) || sending ? 0.5 : 1 }}>
                      <Send className={cn('w-4 h-4', sending && 'animate-pulse')} style={{ color: '#e9edef' }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Right Sidebar: Client Details & Garage ── */}
              <div className="hidden lg:flex flex-col w-72 border-l border-white/6 overflow-y-auto" style={{ background: '#0b141a' }}>
                <div className="p-4" style={{ background: '#202c33', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                   <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#e9edef' }}>
                     <Info className="w-4 h-4 text-green-400" /> Información
                   </h2>
                </div>
                
                <div className="p-4 space-y-6">
                  {/* Garage Section */}
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: '#8696a0' }}>
                      <Car className="w-3.5 h-3.5" /> Garage del Cliente
                    </h3>
                    <div className="space-y-2.5">
                      {loadingVehicles ? (
                        <div className="flex items-center gap-2 py-2 opacity-50">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span className="text-xs">Buscando vehículos...</span>
                        </div>
                      ) : selectedVehicles.length > 0 ? (
                        selectedVehicles.map((v, idx) => (
                          <div key={v.id || idx} className="p-3 rounded-xl border border-white/5 transition-all hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <div className="flex items-start justify-between mb-1">
                              <span className="text-sm font-semibold truncate pr-2" style={{ color: '#e9edef' }}>
                                {v.marca} {v.modelo}
                              </span>
                              {v.anio && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5">
                                  {v.anio}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                               <div className="flex items-center gap-1 text-[11px]" style={{ color: '#8696a0' }}>
                                 <Hash className="w-3 h-3 opacity-50" />
                                 <span className="font-mono text-green-400/80">{v.placa || 'SIN PLACA'}</span>
                               </div>
                               <div className="w-1 h-1 rounded-full bg-white/10" />
                               <div className="flex items-center gap-1 text-[11px]" style={{ color: '#8696a0' }}>
                                 <Calendar className="w-3 h-3 opacity-50" />
                                 <span>{v.created_at ? new Date(v.created_at).getFullYear() : 'N/A'}</span>
                               </div>
                            </div>
                          </div>
                        ))
                      ) : (selected.memoria?.vehiculos && selected.memoria.vehiculos.length > 0) ? (
                        selected.memoria.vehiculos.map((v, idx: number) => (
                          <div key={idx} className="p-3 rounded-xl border border-dashed border-white/10 transition-all hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex items-start justify-between mb-1">
                              <span className="text-sm font-medium truncate pr-2" style={{ color: '#e9edef' }}>
                                {v.marca || 'Marca?'} {v.modelo || 'Modelo?'}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500/80 border border-amber-500/10">
                                Por confirmar
                              </span>
                            </div>
                            <p className="text-[10px] italic" style={{ color: '#8696a0' }}>Detectado en conversación</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-xl border border-dashed border-white/10 text-center">
                          <Car className="w-6 h-6 mx-auto mb-2 opacity-10" />
                          <p className="text-[11px]" style={{ color: '#8696a0' }}>No hay vehículos registrados</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Metadata */}
                  <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between py-1">
                       <span className="text-[11px]" style={{ color: '#8696a0' }}>ID Cliente</span>
                       <span className="text-[10px] font-mono opacity-40">{selected.cliente_id?.slice(0,8) || 'N/A'}</span>
                    </div>
                     <div className="flex items-center justify-between py-1 border-t border-white/5 mt-1 pt-1">
                        <span className="text-[11px]" style={{ color: '#8696a0' }}>Nombre CRM</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px]" style={{ color: '#e9edef' }}>{selected.datos_cliente?.nombre || 'No registrado'}</span>
                          <button onClick={startEditingName} className="p-1 hover:bg-white/5 rounded text-white/30 hover:text-green-400"><User className="w-2.5 h-2.5" /></button>
                        </div>
                     </div>
                    <div className="flex items-center justify-between py-1">
                       <span className="text-[11px]" style={{ color: '#8696a0' }}>Perfil WhatsApp</span>
                       <span className="text-[10px]" style={{ color: '#e9edef' }}>{selected.datos_cliente?.wa_name || 'Desconocido'}</span>
                    </div>

                    {/* Send Contact Button */}
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <button
                        onClick={handleSendContact}
                        disabled={sendingContact}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-sm bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50"
                      >
                        {sendingContact ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        <span>Enviar Contacto Asesor</span>
                      </button>
                      <p className="text-[9px] mt-2 px-1 text-center leading-tight" style={{ color: '#8696a0' }}>
                        Envía la tarjeta VCard del Asesor Lycos para que el cliente guarde el contacto.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(0,168,132,0.1)', border: '2px solid rgba(0,168,132,0.2)' }}>
                <MessageSquare className="w-9 h-9" style={{ color: '#00a884' }} />
              </div>
              <h3 className="font-medium mb-1 text-base" style={{ color: '#e9edef' }}>WhatsApp CRM</h3>
              <p className="text-sm" style={{ color: '#8696a0' }}>Selecciona una conversación para ver los mensajes en tiempo real</p>
            </div>
          )}
        </div>

        {/* ── Audit View Overlay ── */}
        {viewMode === 'audit' && (
          <div className="absolute inset-x-0 bottom-0 top-[110px] z-[60] flex flex-col" style={{ background: '#111b21' }}>
            <div className="p-4 flex items-center justify-between border-b border-white/5 bg-[#202c33]">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-red-400">
                  <Trash2 className="w-5 h-5" /> Papelera de Auditoría
                </h2>
                <p className="text-xs text-muted-foreground">Mensajes eliminados recientemente (Últimos 100)</p>
              </div>
              <button 
                onClick={() => setViewMode('chat')}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cerrar Papelera
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {loadingAudit ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RefreshCw className="w-10 h-10 animate-spin text-white/10" />
                  <p className="text-sm text-white/40">Cargando auditoría...</p>
                </div>
              ) : auditMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                  <Trash2 className="w-16 h-16 mb-4" />
                  <p>La papelera está vacía</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {auditMsgs.map(msg => (
                    <div key={msg.id} className="p-4 rounded-xl border border-white/5 bg-[#202c33] flex flex-col gap-3 relative group">
                       <div className="flex items-center justify-between gap-2">
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-red-400" />
                           <span className="text-[10px] font-bold text-white/40 uppercase">Eliminado en {new Date(msg.deleted_at).toLocaleDateString()}</span>
                         </div>
                         <button 
                           onClick={() => restoreMsg(msg.id)}
                           className="p-2 rounded-lg bg-green-500/10 text-green-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-500/20"
                           title="Restaurar mensaje"
                         >
                           <RotateCcw className="w-4 h-4" />
                         </button>
                       </div>
                       <div className="bg-black/20 p-3 rounded-lg border border-white/5 italic text-sm text-[#e9edef] whitespace-pre-wrap line-clamp-4">
                         {msg.body}
                       </div>
                       <div className="flex items-center justify-between mt-1">
                         <span className="text-[11px] text-white/30 truncate max-w-[150px]">De: {msg.from_number}</span>
                         <span className="text-[10px] text-white/20">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Edit Name Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6" style={{ background: '#202c33' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: '#e9edef' }}>Editar Contacto</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: '#8696a0' }}>Nombre</label>
                <input
                  value={editName.nombre}
                  onChange={e => setEditName(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full py-2 px-3 rounded-lg text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid rgba(255,255,255,0.06)' }}
                  placeholder="Ej: Juan"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: '#8696a0' }}>Apellido</label>
                <input
                  value={editName.apellido}
                  onChange={e => setEditName(prev => ({ ...prev, apellido: e.target.value }))}
                  className="w-full py-2 px-3 rounded-lg text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid rgba(255,255,255,0.06)' }}
                  placeholder="Ej: Perez"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-8">
              <button 
                onClick={() => setIsEditingName(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: '#8696a0' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveName}
                disabled={savingName || !editName.nombre.trim()}
                className="px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2"
                style={{ background: '#00a884', color: '#111b21', opacity: savingName ? 0.7 : 1 }}
              >
                {savingName && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
