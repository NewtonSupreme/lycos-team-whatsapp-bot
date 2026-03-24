'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Send, Bot, User, Phone, MoreVertical,
  Smile, CheckCheck, Check, X, RefreshCw, UserCheck, Wifi, WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { cn, formatRelativeTime } from '@/lib/utils';
import StatusBadge from '@/components/ui/status-badge';

const QUICK_REPLIES = [
  '¡Hola! ¿En qué le puedo ayudar? 😊',
  'Su vehículo está listo para retirar. 🔧',
  'Le informamos que su servicio está en proceso.',
  '¿Podría indicarnos su marca/modelo y año del vehículo?',
  'Tenemos disponibilidad para el diagnóstico mañana. 📅',
  'Le envío información de precios en un momento. 💰',
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
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
  }
  const num = conv.telefono?.replace(/[^0-9]/g, '') || '';
  return num.slice(-2);
}

function displayName(conv: RawConv): string {
  const name = conv.datos_cliente?.nombre;
  if (name) return name;
  return conv.telefono || 'Desconocido';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  // Load conversations from Supabase
  const loadConvs = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('conversaciones')
      .select('*')
      .order('ultimo_mensaje_at', { ascending: false })
      .limit(50);
    if (!error && data) setConvs(data as RawConv[]);
  }, []);

  // Load messages for selected conversation
  const loadMsgs = useCallback(async (telefono: string) => {
    if (!supabase) return;
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from('mensajes_whatsapp')
      .select('*')
      .or(`from_number.eq.${telefono},to_number.eq.${telefono}`)
      .order('created_at', { ascending: true })
      .limit(100);
    if (!error && data) setMsgs(data as RawMsg[]);
    setLoadingMsgs(false);
  }, []);

  // Initial load
  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  // Realtime subscriptions
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const convChannel = sb
      .channel('crm-conversaciones')
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

    return () => {
      sb.removeChannel(convChannel);
    };
  }, [loadConvs]);

  // Realtime messages for selected conversation
  useEffect(() => {
    if (!supabase || !selected) return;
    const sb = supabase;

    const msgChannel = sb
      .channel(`crm-msgs-${selected.telefono}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_whatsapp',
        filter: `from_number=eq.${selected.telefono}`,
      }, (payload) => {
        setMsgs(prev => {
          const exists = prev.find(m => m.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new as RawMsg];
        });
        loadConvs();
      })
      .subscribe();

    return () => {
      sb.removeChannel(msgChannel);
    };
  }, [selected, loadConvs]);

  const selectConv = (conv: RawConv) => {
    setSelected(conv);
    setShowMobileChat(true);
    loadMsgs(conv.telefono);

    // Mark as read
    if (supabase && (conv.mensajes_sin_leer ?? 0) > 0) {
      supabase.from('conversaciones')
        .update({ mensajes_sin_leer: 0 })
        .eq('telefono', conv.telefono)
        .then(() => loadConvs());
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !selected || sending) return;
    const body = message.trim();
    setMessage('');
    setSending(true);
    inputRef.current?.focus();

    // Optimistic update
    const optimisticMsg: RawMsg = {
      id: `tmp-${Date.now()}`,
      from_number: 'system',
      to_number: selected.telefono,
      body,
      tipo: 'saliente',
      estado: 'enviado',
      es_ia: false,
      created_at: new Date().toISOString(),
    };
    setMsgs(prev => [...prev, optimisticMsg]);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selected.telefono, message: body }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('Error enviando:', err.error);
      }
    } catch (e) {
      console.error('Error de red:', e);
    } finally {
      setSending(false);
      // Refresh messages to replace optimistic
      loadMsgs(selected.telefono);
      loadConvs();
    }
  };

  const resumeBot = async () => {
    if (!selected || !supabase) return;
    await supabase.from('conversaciones')
      .update({ estado: 'bot' })
      .eq('telefono', selected.telefono);
    loadConvs();
  };

  const filtered = convs.filter(c => {
    const q = search.toLowerCase();
    return (
      (displayName(c) + c.telefono + (c.ultimo_mensaje || '')).toLowerCase().includes(q)
    );
  });

  const estadoColor: Record<string, string> = {
    bot: 'bg-violet-400',
    humano: 'bg-orange-400',
    cerrada: 'bg-gray-500',
    activa: 'bg-green-400',
  };

  const totalUnread = convs.reduce((sum, c) => sum + (c.mensajes_sin_leer ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>WhatsApp CRM</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {isConnected
              ? <><Wifi className="w-3 h-3 text-green-400" /> En vivo · {totalUnread > 0 ? `${totalUnread} sin leer` : 'Todo leído'}</>
              : <><WifiOff className="w-3 h-3 text-red-400" /> Conectando...</>}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadConvs} className="text-xs gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </Button>
      </div>

      <div className="flex h-[calc(100vh-200px)] min-h-[500px] rounded-2xl border border-border/50 overflow-hidden bg-card/30">

        {/* Left: Conversations list */}
        <div className={cn(
          'flex flex-col border-r border-border/30 bg-card/50 transition-all',
          'w-full md:w-80 lg:w-72 flex-shrink-0',
          showMobileChat ? 'hidden md:flex' : 'flex'
        )}>
          <div className="p-3 border-b border-border/30">
            <Input
              placeholder="Buscar conversación..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">Sin conversaciones aún</p>
              </div>
            )}
            {filtered.map(conv => {
              const isActive = selected?.id === conv.id;
              const estado = conv.estado || 'activa';
              return (
                <div
                  key={conv.id}
                  onClick={() => selectConv(conv)}
                  className={cn(
                    'flex items-center gap-2.5 p-3 cursor-pointer transition-colors border-b border-border/10 hover:bg-white/3',
                    isActive && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <div className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold',
                      estado === 'bot' ? 'bg-violet-500/20 text-violet-400' :
                      estado === 'humano' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {avatarLetters(conv)}
                    </div>
                    <div className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
                      estadoColor[estado] || 'bg-gray-500'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate">{displayName(conv)}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {conv.ultimo_mensaje_at ? formatRelativeTime(conv.ultimo_mensaje_at) : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{conv.ultimo_mensaje || '...'}</p>
                  </div>
                  {(conv.mensajes_sin_leer ?? 0) > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                      {conv.mensajes_sin_leer}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Chat */}
        <div className={cn('flex-1 flex flex-col', !showMobileChat && 'hidden md:flex')}>
          {selected ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-card/40">
                <button onClick={() => setShowMobileChat(false)} className="md:hidden w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-400">
                    {avatarLetters(selected)}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-card" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{displayName(selected)}</p>
                    <StatusBadge status={selected.estado || 'activa'} type="conversacion" size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{selected.telefono}</p>
                </div>
                <div className="flex items-center gap-1">
                  {selected.estado === 'humano' && (
                    <button
                      onClick={resumeBot}
                      title="Reactivar bot"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400 hover:bg-violet-500/25 transition-colors"
                    >
                      <Bot className="w-3 h-3" /> Reactivar IA
                    </button>
                  )}
                  <Button variant="ghost" size="icon-sm">
                    <Phone className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(249,115,22,0.02), transparent 60%)' }}
              >
                {loadingMsgs && (
                  <div className="flex justify-center py-6">
                    <span className="text-xs text-muted-foreground animate-pulse">Cargando mensajes...</span>
                  </div>
                )}
                {!loadingMsgs && msgs.length === 0 && (
                  <div className="flex justify-center py-6">
                    <span className="text-xs text-muted-foreground">Sin mensajes en este chat aún</span>
                  </div>
                )}
                {msgs.map((msg, i) => {
                  const isOut = msg.tipo === 'saliente';
                  // Date divider
                  const prevMsg = msgs[i - 1];
                  const thisDay = new Date(msg.created_at).toLocaleDateString('es-VE');
                  const prevDay = prevMsg ? new Date(prevMsg.created_at).toLocaleDateString('es-VE') : null;
                  const showDivider = thisDay !== prevDay;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDivider && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-border/20" />
                          <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-muted/30">
                            {thisDay === new Date().toLocaleDateString('es-VE') ? 'Hoy' : thisDay}
                          </span>
                          <div className="flex-1 h-px bg-border/20" />
                        </div>
                      )}
                      <div className={cn('flex gap-2', isOut ? 'justify-end' : 'justify-start')}>
                        {!isOut && (
                          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-auto text-[10px] text-green-400 font-bold">
                            {avatarLetters(selected)}
                          </div>
                        )}
                        <div className={cn('max-w-[75%]', isOut ? 'chat-bubble-out' : 'chat-bubble-in')}>
                          {msg.es_ia && (
                            <div className="flex items-center gap-1 mb-1">
                              <Bot className="w-3 h-3 text-violet-400" />
                              <span className="text-[10px] text-violet-400 font-medium">Bot IA</span>
                            </div>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                          <div className={cn('flex items-center gap-1 mt-1', isOut ? 'justify-end' : 'justify-start')}>
                            <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                            {isOut && (
                              msg.estado === 'leido' ? <CheckCheck className="w-3 h-3 text-blue-400" /> :
                              msg.estado === 'entregado' ? <CheckCheck className="w-3 h-3 text-muted-foreground" /> :
                              <Check className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        {isOut && (
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-auto">
                            {msg.es_ia ? <Bot className="w-3 h-3 text-violet-400" /> : <User className="w-3 h-3 text-primary" />}
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick replies */}
              {showQuickReplies && (
                <div className="px-3 py-2 border-t border-border/20 flex gap-2 overflow-x-auto">
                  {QUICK_REPLIES.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => { setMessage(r); setShowQuickReplies(false); inputRef.current?.focus(); }}
                      className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/30 hover:bg-primary/10 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground whitespace-nowrap"
                    >
                      {r.length > 35 ? r.slice(0, 35) + '...' : r}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-3 py-3 border-t border-border/30 bg-card/20">
                {selected.estado === 'humano' && (
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <UserCheck className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[11px] text-orange-400">Modo humano activo — el bot está pausado en este chat</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowQuickReplies(!showQuickReplies)} title="Respuestas rápidas">
                    <Smile className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                      placeholder="Escribe un mensaje..."
                      className="w-full h-9 rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50"
                    />
                  </div>
                  <Button
                    onClick={handleSend}
                    disabled={!message.trim() || sending}
                    size="icon-sm"
                    className="rounded-xl w-9 h-9 flex-shrink-0"
                  >
                    <Send className={cn('w-3.5 h-3.5', sending && 'animate-pulse')} />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[10px] text-muted-foreground">Enter para enviar · Shift+Enter para salto de línea</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {selected.estado === 'bot'
                      ? <><Bot className="w-2.5 h-2.5 text-violet-400" /><span className="text-violet-400">IA activa</span></>
                      : <><UserCheck className="w-2.5 h-2.5 text-orange-400" /><span className="text-orange-400">Control humano</span></>}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="font-semibold mb-1">Selecciona una conversación</h3>
              <p className="text-sm text-muted-foreground">Elige un chat de la lista para ver los mensajes en tiempo real</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
