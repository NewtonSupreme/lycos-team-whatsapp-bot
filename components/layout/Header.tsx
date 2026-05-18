'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Search, Menu, X, MessageSquare, Calendar, Wrench } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { supabase } from '@/lib/supabase';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function detectMediaType(body: string): 'imagen' | 'video' | 'audio' | 'documento' | 'texto' {
  if (!body) return 'texto';
  const lower = body.toLowerCase();
  if (lower.includes('imagen') || lower.includes('image') || lower.match(/\.(jpg|jpeg|png|gif|webp)/)) return 'imagen';
  if (lower.includes('video') || lower.match(/\.(mp4|mov|avi|mkv)/)) return 'video';
  if (lower.includes('audio') || lower.includes('voz') || lower.match(/\.(mp3|ogg|m4a|opus)/)) return 'audio';
  if (lower.includes('documento') || lower.match(/\.(pdf|doc|xlsx|csv)/)) return 'documento';
  return 'texto';
}

function buildWaNotifBody(body: string, senderName?: string): { title: string; mensaje: string } {
  const sender = senderName ? `${senderName}` : 'Cliente';
  const mediaType = detectMediaType(body);
  const mediaEmojis = { imagen: '🖼️', video: '🎥', audio: '🎤', documento: '📄', texto: '' };
  const mediaLabels = { imagen: 'envió una imagen', video: 'envió un video', audio: 'envió un audio', documento: 'envió un documento', texto: '' };

  if (mediaType !== 'texto') {
    return {
      title: `📱 ${sender} ${mediaLabels[mediaType]}`,
      mensaje: `${mediaEmojis[mediaType]} ${mediaLabels[mediaType].charAt(0).toUpperCase() + mediaLabels[mediaType].slice(1)}`,
    };
  }

  const isContactRequest = body.toLowerCase().includes('asesor') || body.toLowerCase().includes('hablar') || body.toLowerCase().includes('agente') || body.toLowerCase().includes('humano');
  if (isContactRequest) {
    return {
      title: `🆘 ${sender} quiere hablar con un asesor`,
      mensaje: body.slice(0, 80),
    };
  }

  return {
    title: `💬 Nuevo mensaje de ${sender}`,
    mensaje: body.slice(0, 80) + (body.length > 80 ? '...' : ''),
  };
}

// ── Push notification helper ──────────────────────────────────
async function sendPushNotification(payload: {
  title: string;
  body: string;
  type: string;
  url?: string;
  tag?: string;
}) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { /* silent */ }
}

export default function Header() {
  const { user, sidebarOpen, toggleSidebar, notifications, unreadCount, markAllRead, addNotification, pushRegistered, setPushRegistered } = useAppStore();
  const { currentSede, availableSedes, canViewAll, setCurrentSede, userRole } = useSedeStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Registrar Service Worker + Push ──────────────────────────
  const registerPush = useCallback(async () => {
    if (pushRegistered || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      console.log('🔄 Intentando registrar Push Notifications...');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        console.warn('⚠️ Permiso de notificaciones denegado por el usuario.');
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error('❌ Error: NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurado en el entorno.');
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      console.log('✅ Push Notifications registradas correctamente.');
      setPushRegistered(true);
    } catch (err) {
      console.error('❌ Falló el registro de Push Notifications:', err);
    }
  }, [pushRegistered, setPushRegistered]);

  useEffect(() => {
    registerPush();
  }, [registerPush]);

  // ── Realtime: mensajes WhatsApp entrantes ────────────────────
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('header-wa-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_whatsapp' }, async (payload) => {
        const msg = payload.new as { tipo: string; body: string; from_number: string };
        if (msg.tipo !== 'entrante') return;

        // Lookup sender name from conversaciones
        let senderName: string | undefined;
        try {
          const { data } = await supabase!
            .from('conversaciones')
            .select('datos_cliente')
            .eq('telefono', msg.from_number)
            .single();
          senderName = (data?.datos_cliente as { nombre?: string } | null)?.nombre;
        } catch { /* ignore */ }

        const { title, mensaje } = buildWaNotifBody(msg.body, senderName || msg.from_number);
        const mediaType = detectMediaType(msg.body);

        addNotification({
          tipo: 'info',
          titulo: title,
          mensaje,
          leida: false,
        });

        // Notificación nativa del browser
        if (Notification.permission === 'granted') {
          new Notification(title, { body: mensaje, icon: '/logo-icon-white.png', tag: 'wa-msg' });
        }

        // Push background (para cuando el teléfono no tiene la app abierta)
        sendPushNotification({
          title,
          body: mensaje,
          type: mediaType !== 'texto' ? `whatsapp-${mediaType}` : 'whatsapp-message',
          url: '/dashboard/whatsapp',
          tag: 'whatsapp',
        });
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [addNotification]);

  // ── Realtime: nuevas citas ────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('header-citas-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citas' }, (payload) => {
        const cita = payload.new as { fecha?: string; hora?: string; telefono?: string; descripcion?: string; nombre_cliente?: string };
        const titulo = '📅 Nueva cita agendada';
        const mensaje = `${cita.nombre_cliente || cita.telefono || 'Cliente'} — ${cita.fecha ?? ''} a las ${cita.hora ?? ''}${cita.descripcion ? ` · ${cita.descripcion}` : ''}`;

        addNotification({ tipo: 'success', titulo, mensaje, leida: false });

        if (Notification.permission === 'granted') {
          new Notification(titulo, { body: mensaje, icon: '/logo-icon-white.png', tag: 'cita' });
        }

        sendPushNotification({ title: titulo, body: mensaje, type: 'cita', url: '/dashboard/agenda', tag: 'cita' });
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [addNotification]);

  // ── Realtime: servicios asignados o actualizados ─────────────
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('header-servicios-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'servicios' }, (payload) => {
        const srv = payload.new as { nombre?: string; descripcion?: string; estado?: string; tecnico?: string };
        const titulo = '🔧 Nuevo servicio asignado';
        const mensaje = `${srv.nombre || srv.descripcion || 'Servicio'}${srv.tecnico ? ` → ${srv.tecnico}` : ''} · Estado: ${srv.estado || 'pendiente'}`;

        addNotification({ tipo: 'warning', titulo, mensaje, leida: false });

        if (Notification.permission === 'granted') {
          new Notification(titulo, { body: mensaje, icon: '/logo-icon-white.png', tag: 'servicio' });
        }

        sendPushNotification({ title: titulo, body: mensaje, type: 'servicio', url: '/dashboard/servicios', tag: 'servicio' });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servicios' }, (payload) => {
        const srv = payload.new as { nombre?: string; estado?: string };
        const old = payload.old as { estado?: string };
        if (srv.estado === old.estado) return; // solo notificar si cambia estado
        const titulo = '🔄 Servicio actualizado';
        const mensaje = `${srv.nombre || 'Servicio'} cambió a: ${srv.estado}`;
        addNotification({ tipo: 'info', titulo, mensaje, leida: false });
        if (Notification.permission === 'granted') {
          new Notification(titulo, { body: mensaje, icon: '/logo-icon-white.png', tag: 'servicio-update' });
        }
        sendPushNotification({ title: titulo, body: mensaje, type: 'servicio', url: '/dashboard/servicios', tag: 'servicio' });
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [addNotification]);

  const notifIcons: Record<string, React.ReactNode> = {
    'whatsapp': <MessageSquare className="w-3.5 h-3.5 text-green-400" />,
    'cita': <Calendar className="w-3.5 h-3.5 text-blue-400" />,
    'servicio': <Wrench className="w-3.5 h-3.5 text-orange-400" />,
  };

  return (
    <header suppressHydrationWarning className="h-14 flex items-center gap-3 px-4 border-b border-border/30 bg-card/40 backdrop-blur-xl sticky top-0 z-20">
      {/* Mobile menu */}
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={toggleSidebar}>
        {mounted && sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </Button>

      {/* Search */}
      <div className={cn('flex-1 max-w-md transition-all duration-200', showSearch ? 'flex' : 'hidden md:flex')}>
        <Input
          placeholder="Buscar clientes, vehículos, servicios..."
          icon={<Search className="w-4 h-4" />}
          className="h-8 text-xs"
        />
      </div>

      <button className="md:hidden" onClick={() => setShowSearch(!showSearch)}>
        <Search className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="flex-1" />

      {/* Status pill - Solo en pantallas medianas o si hay espacio */}
      <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400 font-medium">Bot activo</span>
      </div>

      {/* Sede Selector - Ahora visible en móvil */}
      {canViewAll() && availableSedes.length > 0 && (
        <div className="flex items-center gap-1 sm:gap-2 mr-1 sm:mr-2">
          <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
          <Select
            value={currentSede?.id}
            onValueChange={(id) => {
              const s = availableSedes.find(s => s.id === id);
              if (s) setCurrentSede(s);
            }}
          >
            <SelectTrigger className="h-8 w-[130px] sm:w-[200px] text-[10px] sm:text-xs">
              <SelectValue placeholder="Sede" />
            </SelectTrigger>
            <SelectContent>
              {availableSedes.map((sede, idx) => (
                <SelectItem key={sede.id || idx} value={sede.id}>{sede.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Theme Toggle & Notifications */}
      <div className="flex items-center gap-1">
        <ThemeToggle />

        <div className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markAllRead(); }}
          >
            <Bell className={cn('w-4 h-4', mounted && unreadCount > 0 && 'animate-[bell_0.5s_ease-in-out]')} />
            {mounted && unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>

          {showNotifs && (
            <div className="absolute right-0 top-10 w-80 rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <span className="text-sm font-semibold">Notificaciones</span>
                <div className="flex items-center gap-2">
                  {pushRegistered && (
                    <span className="text-[9px] text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />Push activo
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{notifications.length} total</span>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Bell className="w-6 h-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Sin notificaciones</p>
                  </div>
                )}
                {notifications.map((n, idx) => {
                  const typeKey = n.titulo.includes('💬') || n.titulo.includes('📱') || n.titulo.includes('🆘') ? 'whatsapp'
                    : n.titulo.includes('📅') ? 'cita'
                    : n.titulo.includes('🔧') || n.titulo.includes('🔄') ? 'servicio'
                    : 'general';
                  return (
                    <div
                      key={n.id || idx}
                      className={cn(
                        'px-4 py-3 border-b border-border/20 hover:bg-white/3 transition-colors',
                        !n.leida && 'bg-primary/5'
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex-shrink-0">
                          {notifIcons[typeKey] || (
                            <div className={cn(
                              'w-2 h-2 rounded-full mt-1',
                              n.tipo === 'success' ? 'bg-green-400' :
                              n.tipo === 'warning' ? 'bg-yellow-400' :
                              n.tipo === 'error' ? 'bg-red-400' : 'bg-blue-400'
                            )} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-snug">{n.titulo}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.mensaje}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {new Date(n.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {!n.leida && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
                      </div>
                    </div>
                  );
                })}
              </div>
              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-border/30 text-center">
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Marcar todas como leídas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User */}
      <div className="flex items-center gap-2 pl-2 border-l border-border/30">
        <Avatar className="w-7 h-7">
          <AvatarImage src={user?.avatar_url} />
          <AvatarFallback className="text-[10px]">
            {user ? getInitials(user.nombre) : 'AD'}
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:flex flex-col">
          <span className="text-xs font-medium leading-none">{user?.nombre || 'Admin'}</span>
          <div className="flex items-center gap-1 mt-1">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              userRole === 'admin' ? "bg-red-500" : userRole === 'gerente' ? "bg-blue-500" : "bg-slate-400"
            )} />
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
              {userRole || 'Admin'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
