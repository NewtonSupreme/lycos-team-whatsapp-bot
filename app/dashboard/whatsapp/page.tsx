'use client';
import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Send, Search, Bot, User, Phone, MoreVertical,
  Paperclip, Smile, CheckCheck, Check, Clock, Zap, RefreshCw,
  UserCheck, AlertCircle, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mockConversaciones, mockMensajes, mockClientes } from '@/lib/mockData';
import { Conversacion, MensajeWhatsApp } from '@/types';
import { formatRelativeTime, formatTime, cn } from '@/lib/utils';
import StatusBadge from '@/components/ui/status-badge';

const QUICK_REPLIES = [
  '¡Hola! ¿En qué le puedo ayudar?',
  'Su vehículo está listo para retirar.',
  'Le informamos que su servicio está en proceso.',
  '¿Podría indicarnos su placa y modelo?',
  'Tenemos disponibilidad para el diagnóstico mañana.',
  'El costo estimado del servicio es de $___.',
];

export default function WhatsAppPage() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>(mockConversaciones);
  const [selected, setSelected] = useState<Conversacion | null>(mockConversaciones[0]);
  const [mensajes, setMensajes] = useState<MensajeWhatsApp[]>(mockMensajes);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [iaEnabled, setIaEnabled] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, selected]);

  const filteredConvs = conversaciones.filter(c => {
    const cliente = mockClientes.find(cl => cl.id === c.cliente_id);
    return `${c.telefono} ${cliente?.nombre} ${cliente?.apellido} ${c.ultimo_mensaje}`.toLowerCase().includes(search.toLowerCase());
  });

  const currentMsgs = selected ? mensajes.filter(m => m.from === selected.telefono || m.to === selected.telefono) : [];

  const handleSend = () => {
    if (!message.trim() || !selected) return;
    const newMsg: MensajeWhatsApp = {
      id: Date.now().toString(),
      from: '+58412-334-3519',
      to: selected.telefono,
      body: message,
      timestamp: new Date().toISOString(),
      tipo: 'saliente',
      estado: 'enviado',
    };
    setMensajes(prev => [...prev, newMsg]);
    setConversaciones(prev => prev.map(c =>
      c.id === selected.id ? { ...c, ultimo_mensaje: message, ultimo_mensaje_at: new Date().toISOString(), estado: 'humano' as any } : c
    ));
    setMessage('');
    inputRef.current?.focus();

    // Simulate auto-reply
    if (iaEnabled) {
      setIsTyping(true);
      setTimeout(() => {
        const resp: MensajeWhatsApp = {
          id: (Date.now() + 1).toString(),
          from: selected.telefono,
          to: '+58412-334-3519',
          body: getSimulatedReply(message),
          timestamp: new Date().toISOString(),
          tipo: 'entrante',
          estado: 'leido',
        };
        setMensajes(prev => [...prev, resp]);
        setIsTyping(false);
      }, 2000 + Math.random() * 1500);
    }
  };

  const handleIaReply = () => {
    if (!selected) return;
    setIsTyping(true);
    setTimeout(() => {
      const iaMsg: MensajeWhatsApp = {
        id: Date.now().toString(),
        from: '+58412-334-3519',
        to: selected.telefono,
        body: '¡Hola! Soy el asistente de Lycos Team 🔧 ¿En qué puedo ayudarle hoy? Nuestros servicios incluyen mecánica general, diagnóstico computarizado, electrónica automotriz y cerrajería. También puede agendar su cita directamente aquí. ¡Estamos disponibles L-V 8am-6pm, Sáb 8am-2pm!',
        timestamp: new Date().toISOString(),
        tipo: 'saliente',
        estado: 'enviado',
        es_ia: true,
      };
      setMensajes(prev => [...prev, iaMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const getSimulatedReply = (msg: string) => {
    const lower = msg.toLowerCase();
    if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuanto')) return '¿Podría indicarme qué tipo de servicio necesita para darle un presupuesto exacto? 🔧';
    if (lower.includes('cita') || lower.includes('agendar') || lower.includes('disponib')) return '¡Con gusto! Tenemos disponibilidad mañana a las 9am, 11am y 2pm. ¿Cuál horario le viene mejor? 📅';
    if (lower.includes('gracias')) return '¡Con gusto! Estamos para servirle. ¿Hay algo más en lo que pueda ayudarle? 😊';
    return '¡Perfecto! Nuestro equipo técnico le atenderá en breve. ¿Tiene alguna otra consulta?';
  };

  const selectConv = (conv: Conversacion) => {
    setSelected(conv);
    setConversaciones(prev => prev.map(c => c.id === conv.id ? { ...c, mensajes_sin_leer: 0 } : c));
    setShowMobileChat(true);
  };

  const getCliente = (conv: Conversacion) => mockClientes.find(c => c.id === conv.cliente_id);
  const estadoBadgeColor: Record<string, string> = { bot: 'text-violet-400', humano: 'text-orange-400', cerrada: 'text-gray-400', activa: 'text-green-400' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Centro de mensajería · {conversaciones.filter(c => c.mensajes_sin_leer > 0).length} sin leer</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIaEnabled(!iaEnabled)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              iaEnabled
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                : 'bg-muted/30 border-border/30 text-muted-foreground'
            )}
          >
            <Bot className="w-3.5 h-3.5" />
            Bot IA {iaEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Chat layout */}
      <div className="flex h-[calc(100vh-200px)] min-h-[500px] rounded-2xl border border-border/50 overflow-hidden bg-card/30">

        {/* Left: Conversations list */}
        <div className={cn(
          'flex flex-col border-r border-border/30 bg-card/50 transition-all',
          'w-full md:w-80 lg:w-72 flex-shrink-0',
          showMobileChat ? 'hidden md:flex' : 'flex'
        )}>
          {/* Header */}
          <div className="p-3 border-b border-border/30">
            <Input placeholder="Buscar conversación..." icon={<Search />} value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs" />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConvs.map(conv => {
              const cliente = getCliente(conv);
              const isActive = selected?.id === conv.id;
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
                      conv.estado === 'bot' ? 'bg-violet-500/20 text-violet-400' :
                      conv.estado === 'humano' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {cliente ? (cliente.nombre[0] + cliente.apellido[0]) : conv.telefono.slice(-2)}
                    </div>
                    <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
                      conv.estado === 'bot' ? 'bg-violet-400' : conv.estado === 'humano' ? 'bg-orange-400' : conv.estado === 'cerrada' ? 'bg-gray-500' : 'bg-green-400'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate">
                        {cliente ? `${cliente.nombre} ${cliente.apellido}` : conv.telefono}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelativeTime(conv.ultimo_mensaje_at)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{conv.ultimo_mensaje}</p>
                  </div>
                  {conv.mensajes_sin_leer > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                      {conv.mensajes_sin_leer}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Chat window */}
        <div className={cn(
          'flex-1 flex flex-col',
          !showMobileChat && 'hidden md:flex'
        )}>
          {selected ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-card/40">
                <button onClick={() => setShowMobileChat(false)} className="md:hidden w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-400">
                    {(() => { const c = getCliente(selected); return c ? c.nombre[0]+c.apellido[0] : '?'; })()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-card" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {(() => { const c = getCliente(selected); return c ? `${c.nombre} ${c.apellido}` : selected.telefono; })()}
                    </p>
                    <StatusBadge status={selected.estado} type="conversacion" size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{selected.telefono}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={handleIaReply} title="Responder con IA">
                    <Zap className="w-3.5 h-3.5 text-violet-400" />
                  </Button>
                  <Button variant="ghost" size="icon-sm">
                    <Phone className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(249,115,22,0.02), transparent 60%)' }}>
                {/* Date divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border/20" />
                  <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-muted/30">Hoy</span>
                  <div className="flex-1 h-px bg-border/20" />
                </div>

                {currentMsgs.map(msg => {
                  const isOut = msg.tipo === 'saliente';
                  return (
                    <div key={msg.id} className={cn('flex gap-2', isOut ? 'justify-end' : 'justify-start')}>
                      {!isOut && (
                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-auto text-[10px] text-green-400 font-bold">
                          {selected.telefono.slice(-2)}
                        </div>
                      )}
                      <div className={cn('max-w-[75%]', isOut ? 'chat-bubble-out' : 'chat-bubble-in')}>
                        {msg.es_ia && (
                          <div className="flex items-center gap-1 mb-1">
                            <Bot className="w-3 h-3 text-violet-400" />
                            <span className="text-[10px] text-violet-400 font-medium">Bot IA</span>
                          </div>
                        )}
                        <p className="text-sm leading-relaxed">{msg.body}</p>
                        <div className={cn('flex items-center gap-1 mt-1', isOut ? 'justify-end' : 'justify-start')}>
                          <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                          {isOut && (
                            msg.estado === 'leido' ? <CheckCheck className="w-3 h-3 text-blue-400" /> :
                            msg.estado === 'entregado' ? <CheckCheck className="w-3 h-3 text-muted-foreground" /> :
                            <Check className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      {isOut && (
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-auto">
                          <User className="w-3 h-3 text-primary" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 text-[10px] text-green-400 font-bold">
                      {selected.telefono.slice(-2)}
                    </div>
                    <div className="chat-bubble-in flex items-center gap-1 py-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

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
                      {r.length > 30 ? r.slice(0, 30) + '...' : r}
                    </button>
                  ))}
                </div>
              )}

              {/* Input area */}
              <div className="px-3 py-3 border-t border-border/30 bg-card/20">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowQuickReplies(!showQuickReplies)} title="Respuestas rápidas">
                    <Smile className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="Adjuntar">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
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
                    disabled={!message.trim()}
                    size="icon-sm"
                    className="rounded-xl w-9 h-9 flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[10px] text-muted-foreground">Enter para enviar · Shift+Enter para salto de línea</span>
                  {iaEnabled && <span className="text-[10px] text-violet-400 flex items-center gap-1"><Bot className="w-2.5 h-2.5" />IA activada</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="font-semibold mb-1">Selecciona una conversación</h3>
              <p className="text-sm text-muted-foreground">Elige un chat de la lista para comenzar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
