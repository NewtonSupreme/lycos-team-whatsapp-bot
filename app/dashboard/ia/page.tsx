'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, RefreshCw, Settings, Zap, MessageSquare, Car, Wrench, Clock, Phone, MapPin, Sparkles, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Message { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date; }


const DEMO_QUESTIONS = [
  '¿Cuántos clientes tenemos registrados?',
  '¿Cuáles son las citas de hoy?',
  'Registrar venta de 1 silenciador CL40',
  'Registra un nuevo trabajo: Cambio de aceite y filtro, tipo mecanica',
  '¿Cuántos silenciadores hemos vendido?',
  '¿Qué productos tenemos en inventario y cuál es el stock?',
];

export default function IAPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente de Lycos Team. Estoy aquí para ayudarte con todo lo relacionado a tu vehículo. ¿En qué puedo ayudarte hoy?\n\nPuedes preguntarme sobre nuestros servicios, precios, horarios, o si necesitas agendar una cita. ¡Estoy disponible 24/7! 🔧',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          // No enviamos systemPrompt — el servidor usa el prompt admin con DB en tiempo real
        }),
      });

      if (!response.ok) throw new Error('API error');
      const data = await response.json();

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Lo siento, no pude procesar tu consulta en este momento.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      // Fallback response
      const fallback = getFallbackResponse(userText);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallback,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const getFallbackResponse = (msg: string): string => {
    const lower = msg.toLowerCase();
    if (lower.includes('servicio') || lower.includes('ofrec')) return 'En Lycos Team ofrecemos los siguientes servicios:\n\n🔧 **Mecánica General** — Cambios de aceite, frenos, suspensión\n⚡ **Electrónica Automotriz** — Diagnóstico de fallas, sensores, ECU\n🔑 **Cerrajería Automotriz** — Llaves con chip, apertura de emergencia\n🖥️ **Diagnóstico Computarizado** — Escaneo OBD2 completo\n🔩 **Reparación de Motores** — Overhaul y reparaciones mayores\n🚨 **Asistencia de Emergencia** — Disponible para situaciones urgentes\n\n¿Le gustaría agendar una cita o tiene alguna consulta específica?';
    if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuanto')) return 'Los precios varían según el servicio:\n\n• Cambio de aceite: $20-40\n• Diagnóstico computarizado: $25-50\n• Revisión de frenos: $30-80\n• Cerrajería (llave con chip): $60-120\n\nPara una cotización exacta necesitamos revisar su vehículo. ¿Desea agendar un diagnóstico gratuito?';
    if (lower.includes('horario') || lower.includes('hora')) return '⏰ Nuestro horario de atención:\n\n📅 Lunes a Viernes: 8:00 AM — 6:00 PM\n📅 Sábado: 8:00 AM — 2:00 PM\n❌ Domingos: Cerrado\n\nPara emergencias fuera de horario, contáctenos al +58 412-334-3519. ¡Siempre hay alguien disponible!';
    if (lower.includes('cita') || lower.includes('agendar')) return '¡Con gusto agendamos su cita! 📅\n\nPara reservar necesito:\n1. Su nombre completo\n2. Marca y modelo del vehículo\n3. Tipo de servicio requerido\n4. Fecha y hora preferida\n\nPuede contactarnos al **+58 412-334-3519** o por WhatsApp. ¡Tenemos disponibilidad esta semana!';
    if (lower.includes('ruido') || lower.includes('frenar') || lower.includes('fren')) return '⚠️ Los ruidos al frenar pueden indicar varios problemas:\n\n• **Chirrido agudo**: Pastillas de freno desgastadas\n• **Golpeteo**: Disco dañado o suelto\n• **Vibración**: Discos deformados por calor\n\n🚨 Le recomendamos revisar sus frenos lo antes posible, ya que es un tema de seguridad. ¿Le agendamos una revisión gratuita?';
    if (lower.includes('emergencia') || lower.includes('urgente')) return '🚨 Sí, contamos con servicio de asistencia de emergencia.\n\nContacto de emergencia: **+58 412-334-3519**\n\nNuestro técnico puede estar con usted aproximadamente en 30-60 minutos dependiendo de la ubicación. Por favor indíquenos:\n• Su ubicación exacta\n• Tipo de problema\n• Marca y modelo del vehículo';
    return '¡Hola! En Lycos Team estamos para ayudarle. 🔧\n\nPuede consultarme sobre:\n• Servicios disponibles\n• Precios y presupuestos\n• Horarios de atención\n• Agendar citas\n• Diagnóstico de fallas\n• Ubicación y contacto\n\n📞 También puede llamarnos: +58 412-334-3519\n📧 lycosteam7@gmail.com';
  };

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const clearChat = () => setMessages([{
    id: '0', role: 'assistant',
    content: '¡Hola de nuevo! 👋 Chat reiniciado. ¿En qué puedo ayudarte?',
    timestamp: new Date()
  }]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient">IA Asistente</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Powered by Gemini · Asistente automotriz 24/7</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="purple" className="gap-1"><Sparkles className="w-3 h-3" />Gemini AI</Badge>
          <Button variant="outline" size="sm" onClick={clearChat} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Nuevo Chat
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Chat */}
        <div className="lg:col-span-3 flex flex-col h-[calc(100vh-220px)] min-h-[500px] rounded-2xl border border-border/50 overflow-hidden bg-card/30">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-card/40">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Asistente Lycos Team</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[11px] text-green-400">En línea · Gemini 1.5</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[80%] group relative',
                  msg.role === 'user'
                    ? 'bg-primary/15 border border-primary/20 rounded-2xl rounded-br-sm px-4 py-2.5'
                    : 'bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-2.5'
                )}>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{msg.content}</p>
                  <div className="flex items-center justify-between mt-1.5 gap-4">
                    <span className="text-[10px] text-muted-foreground">
                      {msg.timestamp.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => copyMessage(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    >
                      {copied === msg.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[10px] font-bold text-primary">Tú</span>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1 text-xs text-muted-foreground">Procesando...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border/30 bg-card/20">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Escribe tu consulta aquí... (Enter para enviar)"
                rows={1}
                className="flex-1 rounded-xl border border-border/50 bg-background/50 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none max-h-32 overflow-y-auto"
                style={{ minHeight: '40px' }}
              />
              <Button onClick={() => sendMessage()} disabled={!input.trim() || loading} className="rounded-xl h-10 px-3 flex-shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-3">
          {/* Quick questions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Preguntas Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {DEMO_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border/30 hover:bg-primary/5 hover:border-primary/20 transition-all text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Company info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Contexto del Bot</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {[
                { icon: Car, label: 'Taller', value: 'Lycos Team' },
                { icon: MapPin, label: 'Ubicación', value: 'Altos Mirandinos, VE' },
                { icon: Clock, label: 'Horario', value: 'Lunes a Sabado 8am a 5pm' },
                { icon: Phone, label: 'Teléfono', value: '+58 412-334-3519' },
                { icon: Wrench, label: 'Servicios', value: '6 especialidades' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">{label}:</span>
                  <span className="font-medium truncate">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Estadísticas IA</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {[
                { label: 'Respuestas hoy', value: '47', color: 'text-primary' },
                { label: 'Citas generadas', value: '8', color: 'text-green-400' },
                { label: 'Escalaciones', value: '3', color: 'text-yellow-400' },
                { label: 'Satisfacción', value: '94%', color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <span className={`text-xs font-bold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
