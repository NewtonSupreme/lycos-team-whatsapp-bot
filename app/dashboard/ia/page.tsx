'use client';
import React, { useState, useRef, useEffect } from 'react';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { supabase } from '@/lib/supabase';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { 
  Bot, Send, RefreshCw, Settings, Zap, MessageSquare, Car, 
  Wrench, Clock, Phone, MapPin, Sparkles, Copy, Check, 
  Plus, Trash2, Loader2, Camera, Paperclip, X, Image
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '@/lib/store';
import { logActivity } from '@/lib/activity';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line
} from 'recharts';

interface Message { 
  id: string; 
  role: 'user' | 'assistant'; 
  content: string; 
  user_name?: string;
  created_at: string; 
}

interface Conversation {
  id: string;
  titulo: string;
  created_at: string;
}


const DEMO_QUESTIONS = [
  '¿Cuántos clientes tenemos registrados?',
  '¿Cuáles son las citas de hoy?',
  'Registrar venta de 1 silenciador CL40',
  'Registra un nuevo trabajo: Cambio de aceite y filtro, tipo mecanica',
  '¿Cuántos silenciadores hemos vendido?',
  '¿Qué productos tenemos en inventario y cuál es el stock?',
];

export default function IAPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const { user } = useAppStore();
  const { currentSede } = useSedeStore();
  
  const allowedSedes = ['San Antonio de los Altos', 'El cementerio (Caracas)'];
  const isAllowedSede = currentSede && allowedSedes.includes(currentSede.nombre);

  // Load conversations on mount
  useEffect(() => {
    if (isAllowedSede) {
      loadConversations();
    }
  }, [isAllowedSede]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  const loadConversations = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await withSedeFilter(supabase.from('ai_conversations'))
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === '42P01') {
          setNeedsMigration(true);
          return;
        }
        throw error;
      }
      setConversations(data || []);
    } catch (err: any) {
      console.error('Error loading conversations:', err.message || err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadMessages = async (convId: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const createConversation = async (firstMessage: string): Promise<string | null> => {
    if (!supabase) return null;
    try {
      // Auto-generate title from first 30 chars
      const titulo = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
      
      const { data, error } = await withSedeFilter(supabase.from('ai_conversations'))
        .insert(withSedeInsert({ titulo }))
        .select()
        .single();
      
      if (error) throw error;
      setConversations([data, ...conversations]);
      return data.id;
    } catch (err) {
      console.error('Error creating conversation:', err);
      return null;
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase || !confirm('¿Eliminar esta conversación?')) return;
    try {
      await supabase.from('ai_conversations').delete().eq('id', id);
      setConversations(conversations.filter(c => c.id !== id));
      if (activeConversationId === id) setActiveConversationId(null);
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  const sendMessage = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || loading || !supabase) return;

    let convId = activeConversationId;
    
    // If no active conversation, create one first
    if (!convId) {
      convId = await createConversation(userText);
      if (!convId) return;
      setActiveConversationId(convId);
    }

    const userMsg: any = { 
      conversation_id: convId,
      role: 'user', 
      content: userText,
      user_name: user?.nombre || user?.username || 'Usuario'
    };
    
    setMessages(prev => [...prev, { ...userMsg, id: 'temp-' + Date.now(), created_at: new Date().toISOString() }]);
    setInput('');
    setLoading(true);

    try {
      // 1. Save user message to DB
      await supabase.from('ai_messages').insert(userMsg);

      // 2. Call IA API
      const response = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userText }].map(m => ({ role: m.role, content: m.content })),
          sede_id: currentSede?.id,
          sede_nombre: currentSede?.nombre,
          user: {
            nombre: user?.nombre || user?.username || 'Usuario',
            rol: user?.rol || 'empleado'
          }
        }),
      });

      // 3. Log Activity
      logActivity({
        usuario: user?.nombre || user?.username || 'Usuario',
        modulo: 'IA Asistente',
        accion: 'Consulta al Asistente IA',
        detalles: `El usuario realizó una consulta a la IA en la sede ${currentSede?.nombre || 'desconocida'}: "${userText.substring(0, 50)}..."`
      });

      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      const aiContent = data.response || 'Lo siento, no pude procesar tu consulta en este momento.';

      // 3. Save assistant response to DB
      const aiMsg: any = { 
        conversation_id: convId,
        role: 'assistant', 
        content: aiContent 
      };
      
      const { data: savedAiMsg } = await supabase.from('ai_messages').insert(aiMsg).select().single();
      setMessages(prev => [...prev, savedAiMsg || { ...aiMsg, id: Date.now().toString(), created_at: new Date().toISOString() }]);
      
    } catch (err) {
      console.error('Chat error:', err);
      // Fallback response (local only if API fails)
      const fallback = getFallbackResponse(userText);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallback,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido.');
      return;
    }
    
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCaptionInput('');
  };

  const handleCancelPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaptionInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const sendImageMessage = async () => {
    if (!selectedFile || !supabase || loading) return;

    const file = selectedFile;
    const captionText = captionInput.trim();
    
    // Revoke preview URL and reset states immediately to close the preview modal
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaptionInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setLoading(true);

    try {
      // 1. Get base64 string
      const base64Data = await fileToBase64(file);

      // 2. Resolve conversation ID
      let convId = activeConversationId;
      if (!convId) {
        const firstMsgText = captionText || 'Foto adjuntada';
        convId = await createConversation(firstMsgText);
        if (!convId) {
          setLoading(false);
          return;
        }
        setActiveConversationId(convId);
      }

      // 3. Upload to Supabase Storage
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `chat/${convId}-${Date.now()}.${fileExt}`;
      
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
        
      if (uploadErr) throw uploadErr;
      
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      
      const publicUrl = urlData.publicUrl;

      // 4. Format user message text for database (Standard Markdown)
      const formattedContent = `![Foto](${publicUrl})\n\n${captionText}`;

      const userMsg: any = { 
        conversation_id: convId,
        role: 'user', 
        content: formattedContent,
        user_name: user?.nombre || user?.username || 'Usuario'
      };

      // 5. Update UI with the new message
      setMessages(prev => [...prev, { ...userMsg, id: 'temp-' + Date.now(), created_at: new Date().toISOString() }]);

      // 6. Save message to DB
      await supabase.from('ai_messages').insert(userMsg);

      // 7. Call Multimodal IA API
      const response = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { 
              role: 'user', 
              content: captionText || 'Analiza esta imagen y describe qué contiene o procesa el registro correspondiente.', 
              image: { mimeType: file.type, data: base64Data } 
            }
          ],
          sede_id: currentSede?.id,
          sede_nombre: currentSede?.nombre,
          user: {
            nombre: user?.nombre || user?.username || 'Usuario',
            rol: user?.rol || 'empleado'
          }
        }),
      });

      // 8. Log Activity
      logActivity({
        usuario: user?.nombre || user?.username || 'Usuario',
        modulo: 'IA Asistente',
        accion: 'Consulta de Imagen al Asistente IA',
        detalles: `El usuario subió una foto y realizó una consulta multimodal: "${captionText.substring(0, 50)}..."`
      });

      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      const aiContent = data.response || 'Lo siento, no pude procesar la imagen en este momento.';

      // 9. Save assistant response to DB
      const aiMsg: any = { 
        conversation_id: convId,
        role: 'assistant', 
        content: aiContent 
      };
      
      const { data: savedAiMsg } = await supabase.from('ai_messages').insert(aiMsg).select().single();
      setMessages(prev => [...prev, savedAiMsg || { ...aiMsg, id: Date.now().toString(), created_at: new Date().toISOString() }]);

    } catch (err) {
      console.error('Chat image error:', err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Ocurrió un error al cargar o procesar la imagen con la IA. Asegúrate de tener conexión y de que los servicios estén activos.',
        created_at: new Date().toISOString(),
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

  const clearChat = () => {
    setActiveConversationId(null);
    setMessages([]);
  };


  return (
    <div className="space-y-5 relative">
      {!isAllowedSede && (
        <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-background/50 rounded-2xl">
          <div className="bg-card border border-border shadow-2xl rounded-2xl p-8 max-w-md text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Módulo No Disponible</h2>
              <p className="text-muted-foreground text-sm">El asistente de Inteligencia Artificial (Chatbot) está configurado exclusivamente para las sedes de <strong>San Antonio</strong> y <strong>El Cementerio</strong> en este momento.</p>
            </div>
          </div>
        </div>
      )}
      <div className={cn("space-y-5 transition-opacity duration-300", !isAllowedSede && "opacity-30 pointer-events-none")}>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar History - Order 2 on mobile, 1 on desktop */}
        <div className="order-2 lg:order-1 lg:col-span-3 flex flex-col h-[400px] lg:h-[calc(100vh-220px)] lg:min-h-[500px] rounded-2xl border border-border/50 bg-card/20 overflow-hidden">
          <div className="p-4 border-b border-border/30">
            <Button onClick={clearChat} className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
              <Plus className="w-4 h-4" /> Nuevo Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {needsMigration ? (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl m-2">
                <p className="text-[10px] text-yellow-500 font-bold uppercase mb-1">Requiere Base de Datos</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Debes ejecutar el archivo <strong>supabase_ai_history.sql</strong> en tu dashboard de Supabase para activar el historial.
                </p>
              </div>
            ) : loadingHistory ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 opacity-50">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[10px] uppercase font-bold tracking-widest">Cargando historial...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Sin conversaciones</p>
              </div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={cn(
                    "group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all border border-transparent",
                    activeConversationId === conv.id 
                      ? "bg-primary/10 border-primary/20 text-primary font-medium" 
                      : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare className={cn("w-3.5 h-3.5 flex-shrink-0", activeConversationId === conv.id ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs truncate">{conv.titulo}</span>
                  </div>
                  <button 
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 hover:text-red-400 rounded-md transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area - Order 1 on mobile, 2 on desktop */}
        <div className="order-1 lg:order-2 lg:col-span-6 flex flex-col h-[500px] lg:h-[calc(100vh-220px)] lg:min-h-[500px] rounded-2xl border border-border/50 overflow-hidden bg-card/30">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {activeConversationId 
                    ? conversations.find(c => c.id === activeConversationId)?.titulo 
                    : 'Nuevo Chat'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[11px] text-green-400">En línea · Gemini 1.5</span>
                </div>
              </div>
            </div>
            
            {activeConversationId && (
              <button onClick={clearChat} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Plus className="w-3 h-3" /> Nuevo
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-3xl bg-primary/5 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">Asistente Inteligente</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Hola, soy la IA de Lycos Team. Puedo ayudarte con el inventario, citas, ventas y más. ¡Pregúntame lo que necesites!
                </p>
              </div>
            )}
            
            {messages.map(msg => {
              const imgMatch = msg.content.match(/^!\[Foto\]\((https?:\/\/[^\s)]+)\)\n*(.*)/s);
              const imageUrl = imgMatch ? imgMatch[1] : null;
              const textContent = imgMatch ? imgMatch[2] : msg.content;
              
              return (
                <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[92%] sm:max-w-[85%] group relative',
                    msg.role === 'user'
                      ? 'bg-primary/15 border border-primary/20 rounded-2xl rounded-br-sm px-4 py-2.5'
                      : 'bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm'
                  )}>
                    <div className="text-sm leading-relaxed markdown-content">
                      {msg.role === 'user' && (
                        <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-primary" />
                          {msg.user_name || (msg.id.startsWith('temp-') ? (user?.nombre || user?.username) : 'Usuario')}
                        </p>
                      )}
                      {msg.role === 'assistant' && (
                        <p className="text-[10px] font-bold text-violet-400 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                          <Bot className="w-2.5 h-2.5" />
                          Asistente IA
                        </p>
                      )}
                      
                      {imageUrl && (
                        <div 
                          onClick={() => window.open(imageUrl, '_blank')}
                          className="relative rounded-xl overflow-hidden border border-border/30 mb-2 cursor-pointer hover:opacity-90 transition-all max-w-[280px] bg-muted/20 aspect-video flex items-center justify-center group/img"
                        >
                          <img src={imageUrl} alt="Adjunto" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300" />
                        </div>
                      )}
                      
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              if (!inline && match && match[1] === 'chart') {
                                try {
                                  const chartData = JSON.parse(String(children).replace(/\n/g, ""));
                                  return (
                                    <div className="my-4 w-full h-[250px] bg-card/50 p-4 rounded-xl border border-border/50">
                                      <p className="text-[10px] font-bold uppercase mb-2 text-primary">{chartData.title || 'Análisis de Datos'}</p>
                                      <ResponsiveContainer width="100%" height="100%">
                                        {chartData.type === 'bar' ? (
                                          <BarChart data={chartData.data}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="name" fontSize={10} stroke="rgba(255,255,255,0.4)" />
                                            <YAxis fontSize={10} stroke="rgba(255,255,255,0.4)" />
                                            <Tooltip 
                                              contentStyle={{ backgroundColor: '#1e1b4b', border: 'none', borderRadius: '8px', fontSize: '10px' }}
                                              itemStyle={{ color: '#f97316' }}
                                            />
                                            <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
                                          </BarChart>
                                        ) : chartData.type === 'pie' ? (
                                          <PieChart>
                                            <Pie
                                              data={chartData.data}
                                              dataKey="value"
                                              nameKey="name"
                                              cx="50%"
                                              cy="50%"
                                              outerRadius={60}
                                              label={{ fontSize: 10, fill: 'rgba(255,255,255,0.6)' }}
                                            >
                                              {chartData.data.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={['#f97316', '#fb923c', '#fdba74', '#fed7aa'][index % 4]} />
                                              ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#1e1b4b', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                          </PieChart>
                                        ) : (
                                          <LineChart data={chartData.data}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="name" fontSize={10} stroke="rgba(255,255,255,0.4)" />
                                            <YAxis fontSize={10} stroke="rgba(255,255,255,0.4)" />
                                            <Tooltip contentStyle={{ backgroundColor: '#1e1b4b', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                                            <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: '#f97316' }} />
                                          </LineChart>
                                        )}
                                      </ResponsiveContainer>
                                    </div>
                                  );
                                } catch (e) {
                                  return <pre {...props} className={className}>{children}</pre>;
                                }
                              }
                              return <code {...props} className={className}>{children}</code>;
                            }
                          }}
                        >
                          {textContent}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-line">{textContent}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 gap-4">
                      <span className="text-[10px] text-muted-foreground/50">
                        {new Date(msg.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
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
              );
            })}

            {loading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1 text-[10px] text-muted-foreground uppercase font-black tracking-widest">Generando...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border/30 bg-card/20">
            <div className="flex gap-2 items-end max-w-3xl mx-auto w-full">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={loading}
                variant="outline"
                className="rounded-2xl h-12 w-12 flex-shrink-0 border-border/50 bg-background/50 hover:bg-white/5 p-0"
              >
                <Camera className="w-5 h-5 text-muted-foreground" />
              </Button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Escribe tu consulta aquí... (Enter para enviar)"
                rows={1}
                className="flex-1 rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none max-h-32 overflow-y-auto transition-all"
                style={{ minHeight: '48px' }}
              />
              <Button onClick={() => sendMessage()} disabled={!input.trim() || loading} className="rounded-2xl h-12 w-12 flex-shrink-0 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 p-0">
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right sidebar Stats - Order 3 on mobile */}
        <div className="order-3 lg:col-span-3 space-y-4">
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

      {/* WhatsApp Style Image Preview Overlay Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
          {/* Top Bar */}
          <div className="flex items-center justify-between p-4 text-white">
            <button 
              onClick={handleCancelPreview}
              className="p-2 hover:bg-white/10 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            <span className="text-sm font-semibold tracking-wide uppercase font-bold text-zinc-300">Vista previa de foto</span>
            <div className="w-10 h-10" />
          </div>

          {/* Centered Image Preview */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="relative max-w-full max-h-full aspect-auto rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-black/40">
              <img 
                src={previewUrl} 
                alt="Vista previa" 
                className="max-h-[60vh] max-w-full md:max-w-2xl object-contain" 
              />
            </div>
          </div>

          {/* Bottom Caption Input Bar */}
          <div className="p-4 bg-slate-900/60 border-t border-white/5 backdrop-blur-lg">
            <div className="flex gap-3 items-center max-w-3xl mx-auto w-full">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={captionInput}
                  onChange={e => setCaptionInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendImageMessage(); } }}
                  placeholder="Añade un comentario sobre esta foto..."
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 pr-10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
              <Button 
                onClick={sendImageMessage} 
                disabled={loading}
                className="rounded-full h-12 w-12 flex-shrink-0 bg-primary hover:bg-primary/95 shadow-lg shadow-primary/30 p-0"
              >
                <Send className="w-5 h-5 text-white" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
