'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Send, Bot, User,
  Smile, CheckCheck, Check, X, RefreshCw, UserCheck, Wifi, WifiOff, Search, Clock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
  created_at: string;
}

interface RawConv {
  id: string;
  telefono: string;
  ultimo_mensaje: string | null;
  ultimo_mensaje_at: string | null;
  mensajes_sin_leer: number | null;
  estado: string | null;
  datos_cliente?: { nombre?: string } | null;
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function avatarLetters(conv: RawConv): string {
  const name = conv.datos_cliente?.nombre;
  if (name) {
    const parts = name.trim().split(' ');
    return parts.length >= 2
      ? (`${parts[0]?.charAt(0) || ''}${parts[1]?.charAt(0) || ''}`).toUpperCase()
      : parts[0]?.slice(0, 2).toUpperCase() || '';
  }
  const num = conv.telefono?.replace(/[^0-9]/g, '') || '';
  return num.slice(-2);
}

function displayName(conv: RawConv): string {
  return conv.datos_cliente?.nombre || conv.telefono || 'Desconocido';
}

// Merge two arrays of messages deduplicating by id
function mergeMessages(existing: RawMsg[], incoming: RawMsg[]): RawMsg[] {
  const map = new Map(existing.map(m => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

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
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null);
  const [isWindowOpen, setIsWindowOpen] = useState<boolean>(true);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Stable refs used inside Realtime + polling closures
  const selectedRef = useRef<RawConv | null>(null);
  const msgsRef = useRef<RawMsg[]>([]);

  selectedRef.current = selected;
  msgsRef.current = msgs;

  // Scroll handler to detect if the user is reading upwards
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsScrolledUp(!atBottom);
  }, []);

  // Smart scroll to bottom
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

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('conversaciones')
      .select('*')
      .order('ultimo_mensaje_at', { ascending: false })
      .limit(50);
    if (!data) return;
    setConvs(data as RawConv[]);
    // Keep selected in sync with fresh estado/datos
    if (selectedRef.current) {
      const fresh = (data as RawConv[]).find(c => c.id === selectedRef.current!.id);
      if (fresh) setSelected(fresh);
    }
  }, []);

  // ── Full load: replaces all messages (only called when switching chats) ─────
  const loadAllMsgs = useCallback(async (telefono: string) => {
    if (!supabase) return;
    setLoadingMsgs(true);
    const { data } = await supabase
      .from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .order('created_at', { ascending: true })
      .limit(150);
    setLoadingMsgs(false);
    if (data) setMsgs(data as RawMsg[]);
  }, []);

  // ── Incremental load: only fetch messages NEWER than what we have ──────────
  // This never wipes existing messages — it only adds new ones.
  const fetchNewMsgs = useCallback(async (telefono: string) => {
    if (!supabase) return;
    const latest = msgsRef.current;
    const lastTs = latest.length
      ? latest[latest.length - 1].created_at
      : new Date(0).toISOString();
    const { data } = await supabase
      .from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .gt('created_at', lastTs)
      .order('created_at', { ascending: true })
      .limit(50);
    if (data && data.length > 0) {
      setMsgs(prev => mergeMessages(prev, data as RawMsg[]));
    }
  }, []);

  // ── Initial load & Permissions ─────────────────────────────────────────────
  useEffect(() => {
    loadConvs();
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, [loadConvs]);

  // ── Timer Logic (24h WhatsApp Window) ──────────────────────────────────────
  useEffect(() => {
    if (!selected || msgs.length === 0) {
      setTimeLeftStr(null);
      return;
    }
    const lastIncoming = [...msgs].reverse().find(m => m.tipo === 'entrante');
    if (!lastIncoming) {
      setTimeLeftStr('Vencido');
      setIsWindowOpen(false);
      return;
    }
    const updateTimer = () => {
      const now = new Date().getTime();
      const lastTime = new Date(lastIncoming.created_at).getTime();
      const expiresAt = lastTime + 24 * 60 * 60 * 1000;
      const diff = expiresAt - now;
      if (diff <= 0) {
        setTimeLeftStr('Vencido');
        setIsWindowOpen(false);
      } else {
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

  // ── Realtime + incremental polling ─────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel('crm-wa-live')
      // New message arrives → append it (no full reload)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_whatsapp',
      }, (payload) => {
        const newMsg = payload.new as RawMsg;
        const cur = selectedRef.current;
        if (cur) {
          const phone = cur.telefono;
          if (newMsg.from_number === phone || newMsg.to_number === phone) {
            // Remove any optimistic placeholder that matches this body+tipo
            setMsgs(prev => {
              const withoutOptimistic = prev.filter(m =>
                !(m.id.startsWith('tmp-') && m.body === newMsg.body && m.tipo === newMsg.tipo)
              );
              return mergeMessages(withoutOptimistic, [newMsg]);
            });
          }
        }
        // Native browser notification for incoming messages
        if (newMsg.tipo === 'entrante') {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Lycos Team - Nuevo Mensaje', {
              body: newMsg.body,
              icon: '/favicon.ico',
            });
          }
        }
        // Always refresh conv list
        loadConvs();
      })
      // Conversation updated → refresh sidebar + selected header
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversaciones',
      }, () => {
        loadConvs();
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Incremental poll every 3s — guarantees we catch messages even if WS drops.
    // Uses fetchNewMsgs so it NEVER overwrites existing messages.
    const poll = setInterval(() => {
      const cur = selectedRef.current;
      if (cur) fetchNewMsgs(cur.telefono);
      loadConvs();
    }, 3000);

    return () => {
      sb.removeChannel(channel);
      clearInterval(poll);
    };
  }, [loadConvs, fetchNewMsgs]);

  // ── Select a conversation ──────────────────────────────────────────────────
  const selectConv = async (conv: RawConv) => {
    setSelected(conv);
    setShowMobileChat(true);
    setMsgs([]); // clear old chat first
    setIsScrolledUp(false);
    await loadAllMsgs(conv.telefono);
    // Mark as read
    if (supabase && (conv.mensajes_sin_leer ?? 0) > 0) {
      supabase.from('conversaciones')
        .update({ mensajes_sin_leer: 0 })
        .eq('telefono', conv.telefono)
        .then(() => loadConvs());
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!message.trim() || !selected || sending) return;
    const body = message.trim();
    setMessage('');
    setSending(true);
    setIsScrolledUp(false);
    inputRef.current?.focus();
    scrollToBottom(true);

    // Optimistic message — shown immediately
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

    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selected.telefono, message: body }),
      });
    } catch (e) {
      console.error('Error enviando:', e);
    } finally {
      setSending(false);
      // Remove optimistic + fetch actual from DB (incremental)
      await fetchNewMsgs(selected.telefono);
      await loadConvs();
    }
  };

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const setMode = async (mode: 'bot' | 'humano') => {
    if (!selected || !supabase || togglingMode) return;
    setTogglingMode(true);
    await supabase.from('conversaciones')
      .update({ estado: mode })
      .eq('telefono', selected.telefono);
    await loadConvs();
    setTogglingMode(false);
  };

  const filtered = convs.filter(c => {
    const q = search.toLowerCase();
    return (displayName(c) + c.telefono + (c.ultimo_mensaje || '')).toLowerCase().includes(q);
  });

  const isHumano = selected?.estado === 'humano';
  const totalUnread = convs.reduce((s, c) => s + (c.mensajes_sin_leer ?? 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────
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
              ? <><Wifi className="w-3 h-3 text-green-400" /> En vivo{totalUnread > 0 ? ` · ${totalUnread} sin leer` : ''}</>
              : <><WifiOff className="w-3 h-3 text-yellow-400 animate-pulse" /> Conectando...</>}
          </p>
        </div>
        <button onClick={loadConvs} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* ── Chat layout — mimics WhatsApp Web ── */}
      <div
        className="flex rounded-2xl overflow-hidden border border-white/8"
        style={{
          height: 'calc(100vh - 180px)',
          minHeight: '560px',
          background: '#111b21',
        }}
      >
        {/* ── Left panel: conversation list ── */}
        <div
          className={cn(
            'flex flex-col flex-shrink-0 w-full md:w-[340px] border-r border-white/6',
            showMobileChat ? 'hidden md:flex' : 'flex'
          )}
          style={{ background: '#202c33' }}
        >
          {/* Search bar */}
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

          {/* Conversation items */}
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
                  style={{
                    background: isActive ? '#2a3942' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#202c33'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: '#2a3942', color: '#e9edef' }}
                    >
                      {avatarLetters(conv)}
                    </div>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                      style={{ background: dotColor, borderColor: '#202c33' }}
                    />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate" style={{ color: '#e9edef' }}>
                        {displayName(conv)}
                      </span>
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

        {/* ── Right panel: chat window ── */}
        <div
          className={cn('flex-1 flex flex-col min-h-0', !showMobileChat && 'hidden md:flex')}
          style={{ background: '#0b141a' }}
        >
          {selected ? (
            <>
              {/* Chat header */}
              <div
                className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
                style={{ background: '#202c33', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5"
                >
                  <X className="w-4 h-4" style={{ color: '#aebac1' }} />
                </button>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: '#2a3942', color: '#e9edef' }}>
                  {avatarLetters(selected)}
                </div>
                {/* Name + phone */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#e9edef' }}>{displayName(selected)}</p>
                  <p className="text-[11px]" style={{ color: '#8696a0' }}>{selected.telefono}</p>
                </div>
                {/* Mode buttons & Timer */}
                <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap justify-end">
                  {/* Timer UI */}
                  {timeLeftStr && (
                    <div className={cn(
                      'flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium mr-1',
                      isWindowOpen ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                    )}>
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="whitespace-nowrap tabular-nums">{timeLeftStr}</span>
                    </div>
                  )}

                  <button
                    onClick={() => setMode('bot')}
                    disabled={togglingMode || selected.estado === 'bot'}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                      selected.estado === 'bot'
                        ? 'cursor-default'
                        : 'hover:opacity-80'
                    )}
                    style={{
                      background: selected.estado === 'bot' ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.06)',
                      color: selected.estado === 'bot' ? '#a78bfa' : '#8696a0',
                      border: `1px solid ${selected.estado === 'bot' ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Bot IA</span>
                  </button>
                  <button
                    onClick={() => setMode('humano')}
                    disabled={togglingMode || selected.estado === 'humano'}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                      selected.estado === 'humano' ? 'cursor-default' : 'hover:opacity-80'
                    )}
                    style={{
                      background: selected.estado === 'humano' ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.06)',
                      color: selected.estado === 'humano' ? '#fb923c' : '#8696a0',
                      border: `1px solid ${selected.estado === 'humano' ? 'rgba(251,146,60,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Humano</span>
                  </button>
                </div>
              </div>

              {/* Mode status strip */}
              <div
                className="flex items-center gap-2 px-4 py-1.5 text-[11px] flex-shrink-0"
                style={{
                  background: isHumano ? 'rgba(251,146,60,0.08)' : 'rgba(167,139,250,0.08)',
                  color: isHumano ? '#fb923c' : '#a78bfa',
                  borderBottom: `1px solid ${isHumano ? 'rgba(251,146,60,0.15)' : 'rgba(167,139,250,0.15)'}`,
                }}
              >
                {isHumano
                  ? <><UserCheck className="w-3 h-3" /> Modo humano — bot pausado, respondes tú</>
                  : <><Bot className="w-3 h-3" /> Modo Bot IA — respondiendo automáticamente</>}
              </div>

              {/* Messages area */}
              <div
                ref={chatScrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1 w-full"
                style={{
                  minHeight: 0,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%230b141a'/%3E%3C/svg%3E")`,
                }}
              >
                {loadingMsgs && (
                  <div className="flex justify-center py-8">
                    <span className="text-xs animate-pulse" style={{ color: '#8696a0' }}>Cargando mensajes...</span>
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

                      <div className={cn('flex w-full', isOut ? 'justify-end' : 'justify-start')} style={{ marginBottom: '2px' }}>
                        <div
                          className="relative max-w-[88%] md:max-w-[75%] rounded-lg px-3 py-2 shadow-sm flex flex-col min-w-0"
                          style={{
                            background: isOut ? '#005c4b' : '#202c33',
                            opacity: isOptimistic ? 0.75 : 1,
                            borderRadius: isOut ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                          }}
                        >
                          {/* Bot badge */}
                          {msg.es_ia && (
                            <div className="flex items-center gap-1 mb-1" style={{ color: '#a78bfa' }}>
                              <Bot className="w-3 h-3" />
                              <span className="text-[10px] font-medium">Bot IA</span>
                            </div>
                          )}
                          {/* Message text */}
                          <p className="text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#e9edef', wordBreak: 'break-word' }}>
                            {msg.body}
                          </p>
                          {/* Time + status */}
                          <div className="flex items-center gap-1 justify-end mt-1 flex-shrink-0" style={{ marginRight: '-2px' }}>
                            <span className="text-[10px]" style={{ color: 'rgba(233,237,239,0.6)' }}>
                              {formatTime(msg.created_at)}
                            </span>
                            {isOut && (
                              isOptimistic ? <Check className="w-3 h-3" style={{ color: 'rgba(233,237,239,0.5)' }} /> :
                              msg.estado === 'leido' ? <CheckCheck className="w-3.5 h-3.5" style={{ color: '#53bdeb' }} /> :
                              msg.estado === 'entregado' ? <CheckCheck className="w-3.5 h-3.5" style={{ color: 'rgba(233,237,239,0.5)' }} /> :
                              <Check className="w-3 h-3" style={{ color: 'rgba(233,237,239,0.5)' }} />
                            )}
                            {!isOut && msg.es_ia && (
                              <Bot className="w-3 h-3 ml-0.5" style={{ color: 'rgba(167,139,250,0.6)' }} />
                            )}
                            {isOut && !msg.es_ia && !isOptimistic && (
                              <User className="w-2.5 h-2.5" style={{ color: 'rgba(233,237,239,0.4)' }} />
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div style={{ height: '4px' }} />
              </div>

              {/* Quick replies */}
              {showQuickReplies && (
                <div
                  className="flex gap-2 overflow-x-auto px-3 py-2 flex-shrink-0"
                  style={{ background: '#202c33', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
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
              <div
                className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
                style={{ background: '#202c33', borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <button
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors flex-shrink-0"
                >
                  <Smile className="w-5 h-5" style={{ color: '#aebac1' }} />
                </button>
                <input
                  ref={inputRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Escribe un mensaje"
                  className="flex-1 py-2 px-4 rounded-lg text-sm outline-none"
                  style={{
                    background: '#2a3942',
                    color: '#e9edef',
                    border: 'none',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || sending}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: message.trim() && !sending ? '#00a884' : '#2a3942',
                    opacity: !message.trim() || sending ? 0.5 : 1,
                  }}
                >
                  <Send className={cn('w-4 h-4', sending && 'animate-pulse')} style={{ color: '#e9edef' }} />
                </button>
              </div>
            </>
          ) : (
            /* No conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'rgba(0,168,132,0.1)', border: '2px solid rgba(0,168,132,0.2)' }}
              >
                <MessageSquare className="w-9 h-9" style={{ color: '#00a884' }} />
              </div>
              <h3 className="font-medium mb-1 text-base" style={{ color: '#e9edef' }}>WhatsApp CRM</h3>
              <p className="text-sm" style={{ color: '#8696a0' }}>
                Selecciona una conversación para ver los mensajes en tiempo real
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
