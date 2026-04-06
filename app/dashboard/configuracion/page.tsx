'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  User, Bell, Bot, Shield, Save, Phone, Mail,
  MapPin, Clock, Globe, Lock, Trash2, Smartphone, Monitor, Zap,
  CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ── Toggle Component ──────────────────────────────────────────
function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void;
  label: string; description?: string; disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between p-3 rounded-xl border border-border/30 transition-colors',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-border/50'
    )}>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
          checked ? 'bg-primary' : 'bg-muted',
          disabled && 'cursor-not-allowed'
        )}
      >
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  );
}

// ── Status indicator ─────────────────────────────────────────
function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  return (
    <div className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border', {
      'bg-blue-500/10 border-blue-500/20 text-blue-400': status === 'saving',
      'bg-green-500/10 border-green-500/20 text-green-400': status === 'saved',
      'bg-red-500/10 border-red-500/20 text-red-400': status === 'error',
    })}>
      {status === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {status === 'saved' && <CheckCircle className="w-3.5 h-3.5" />}
      {status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
      {status === 'saving' ? 'Guardando...' : status === 'saved' ? '¡Guardado!' : 'Error al guardar'}
    </div>
  );
}

type SaveStatusType = 'idle' | 'saving' | 'saved' | 'error';

export default function ConfiguracionPage() {
  const { user } = useAppStore();
  const isAdmin = user?.rol === 'admin';

  const [saveStatus, setSaveStatus] = useState<SaveStatusType>('idle');
  const [activeTab, setActiveTab] = useState('empresa');

  // Config state
  const [empresa, setEmpresa] = useState({
    nombre: 'Lycos Team', telefono: '+58 412-334-3519',
    email: 'lycosteam7@gmail.com', direccion: 'Altos Mirandinos, Miranda, Venezuela',
    web: 'www.lycosteam.com', horario_semana: '8:00 AM - 5:00 PM', horario_sabado: '8:00 AM - 3:00 PM'
  });
  const [notifs, setNotifs] = useState({
    nuevos_mensajes: true, nuevas_citas: true,
    servicios_completos: true, emergencias: true, reportes_diarios: false
  });
  const [ia, setIa] = useState({
    activo: true, respuesta_automatica: true,
    escalar_humano: true, aprendizaje: false,
    respuestas_nocturnas: true, max_intentos: 3
  });

  // Password change
  const [pwdForm, setPwdForm] = useState({ current: '', nuevo: '', confirmar: '' });
  const [pwdStatus, setPwdStatus] = useState<{ loading: boolean; success: boolean; error: string }>({ loading: false, success: false, error: '' });

  // Sessions
  interface Session { id: string; username: string; ip_address: string; browser: string; os: string; device_type: string; expires_at: string; created_at: string; }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // ── Load config from Supabase ─────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('configuracion_sistema').select('clave, valor');
    if (!data) return;
    data.forEach(row => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (row.clave === 'empresa') setEmpresa(row.valor as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (row.clave === 'notificaciones') setNotifs(row.valor as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (row.clave === 'ia_bot') setIa(row.valor as any);
    });
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (isAdmin) {
      const fetchSessions = async () => {
        setLoadingSessions(true);
        try {
          const res = await fetch('/api/auth/sessions');
          const data = await res.json();
          setSessions(data.sessions || []);
        } catch { /* silent */ }
        setLoadingSessions(false);
      };
      fetchSessions();
    }
  }, [isAdmin]);

  // ── Save config to Supabase ───────────────────────────────
  const handleSave = async () => {
    if (!supabase) return;
    setSaveStatus('saving');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Array<{ clave: string; valor: any; updated_by: string }> = [
        { clave: 'empresa', valor: empresa, updated_by: user?.nombre || 'Admin' },
        { clave: 'notificaciones', valor: notifs, updated_by: user?.nombre || 'Admin' },
      ];
      // Only admin can save IA config
      if (isAdmin) {
        updates.push({ clave: 'ia_bot', valor: ia as unknown as Record<string, unknown>, updated_by: user?.nombre || 'Admin' });
      }

      for (const update of updates) {
        await supabase.from('configuracion_sistema')
          .upsert({ ...update, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
      }

      // Log the action
      await supabase.from('logs_actividad').insert({
        usuario: user?.nombre || 'Admin',
        accion: 'Configuración actualizada',
        modulo: 'Configuración',
        detalles: `Pestaña: ${activeTab}`
      });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // ── Password Change ───────────────────────────────────────
  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.nuevo !== pwdForm.confirmar) {
      setPwdStatus({ loading: false, success: false, error: 'Las contraseñas nuevas no coinciden' });
      return;
    }
    if (pwdForm.nuevo.length < 6) {
      setPwdStatus({ loading: false, success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    setPwdStatus({ loading: true, success: false, error: '' });
    const res = await fetch('/api/auth/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwdForm.current, newPassword: pwdForm.nuevo }),
    });
    const data = await res.json();
    if (res.ok) {
      setPwdStatus({ loading: false, success: true, error: '' });
      setPwdForm({ current: '', nuevo: '', confirmar: '' });
      setTimeout(() => setPwdStatus(p => ({ ...p, success: false })), 4000);
    } else {
      setPwdStatus({ loading: false, success: false, error: data.error || 'Error al cambiar contraseña' });
    }
  };

  const handleRevokeSession = async (id: string) => {
    await fetch('/api/auth/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Configuración</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ajustes del sistema — todos los cambios se guardan en la base de datos</p>
        </div>
        <div className="flex items-center gap-2">
          <SaveStatus status={saveStatus} />
          <Button onClick={handleSave} className="gap-2 self-start sm:self-auto" disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              : <><Save className="w-4 h-4" /> Guardar Cambios</>
            }
          </Button>
        </div>
      </div>

      <Tabs defaultValue="empresa" onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto flex overflow-x-auto">
          <TabsTrigger value="empresa" className="gap-1.5 flex-shrink-0"><User className="w-3.5 h-3.5" />Empresa</TabsTrigger>
          <TabsTrigger value="notificaciones" className="gap-1.5 flex-shrink-0"><Bell className="w-3.5 h-3.5" />Notificaciones</TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5 flex-shrink-0"><Bot className="w-3.5 h-3.5" />IA &amp; Bot</TabsTrigger>
          <TabsTrigger value="seguridad" className="gap-1.5 flex-shrink-0"><Shield className="w-3.5 h-3.5" />Seguridad</TabsTrigger>
        </TabsList>

        {/* ── Empresa ─────────────────────────────────────────── */}
        <TabsContent value="empresa">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información del Taller</CardTitle>
                <CardDescription className="text-xs">Datos que aparecen en reportes y comunicaciones</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Nombre del taller', key: 'nombre', icon: User, placeholder: 'Lycos Team' },
                  { label: 'Teléfono principal', key: 'telefono', icon: Phone, placeholder: '+58 412-334-3519' },
                  { label: 'Email de contacto', key: 'email', icon: Mail, placeholder: 'lycosteam7@gmail.com', type: 'email' },
                  { label: 'Sitio web', key: 'web', icon: Globe, placeholder: 'www.lycosteam.com' },
                ].map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                    <Input
                      icon={<f.icon />}
                      value={(empresa as Record<string, string>)[f.key]}
                      onChange={e => setEmpresa(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      type={(f as { type?: string }).type}
                    />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                  <Input icon={<MapPin />} value={empresa.direccion} onChange={e => setEmpresa(p => ({ ...p, direccion: e.target.value }))} placeholder="Dirección completa" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horario de Atención</CardTitle>
                <CardDescription className="text-xs">Usado por el bot al responder preguntas de horario</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Lunes a Viernes</label>
                  <Input icon={<Clock />} value={empresa.horario_semana} onChange={e => setEmpresa(p => ({ ...p, horario_semana: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sábado</label>
                  <Input icon={<Clock />} value={empresa.horario_sabado} onChange={e => setEmpresa(p => ({ ...p, horario_sabado: e.target.value }))} />
                </div>
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 mt-2">
                  <p className="text-xs font-medium text-primary mb-1">Vista previa del bot</p>
                  <p className="text-xs text-muted-foreground">
                    &ldquo;Nuestro horario es: L-V de {empresa.horario_semana} y Sábados de {empresa.horario_sabado}. Domingos cerrado.&rdquo;
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Notificaciones ──────────────────────────────────── */}
        <TabsContent value="notificaciones">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preferencias de Notificaciones</CardTitle>
              <CardDescription className="text-xs">Configura qué alertas quieres recibir</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Toggle checked={notifs.nuevos_mensajes} onChange={v => setNotifs(p => ({ ...p, nuevos_mensajes: v }))} label="Nuevos mensajes de WhatsApp" description="Notificar cuando llegue un mensaje nuevo" />
              <Toggle checked={notifs.nuevas_citas} onChange={v => setNotifs(p => ({ ...p, nuevas_citas: v }))} label="Nuevas citas agendadas" description="Alertar cuando se agenda una cita nueva" />
              <Toggle checked={notifs.servicios_completos} onChange={v => setNotifs(p => ({ ...p, servicios_completos: v }))} label="Servicios completados" description="Notificar cuando un técnico finaliza un servicio" />
              <Toggle checked={notifs.emergencias} onChange={v => setNotifs(p => ({ ...p, emergencias: v }))} label="Alertas de emergencia" description="Alta prioridad — nunca perderse una emergencia" />
              <Toggle checked={notifs.reportes_diarios} onChange={v => setNotifs(p => ({ ...p, reportes_diarios: v }))} label="Reporte diario automático" description="Recibir resumen por email cada día a las 8PM" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── IA & Bot ─────────────────────────────────────────── */}
        <TabsContent value="ia">
          {!isAdmin ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Lock className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-semibold">Acceso restringido</p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
                  Solo el administrador principal puede modificar la configuración del bot IA.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="w-4 h-4 text-violet-400" /> Configuración del Bot IA
                  </CardTitle>
                  <CardDescription className="text-xs">Comportamiento del asistente Gemini (solo Admin)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Toggle checked={ia.activo} onChange={v => setIa(p => ({ ...p, activo: v }))} label="Bot IA activo" description="Habilitar asistente de inteligencia artificial" />
                  <Toggle checked={ia.respuesta_automatica} onChange={v => setIa(p => ({ ...p, respuesta_automatica: v }))} label="Respuesta automática" description="Responder mensajes sin intervención humana" />
                  <Toggle checked={ia.escalar_humano} onChange={v => setIa(p => ({ ...p, escalar_humano: v }))} label="Escalar a humano" description="Transferir cuando el bot no puede resolver" />
                  <Toggle checked={ia.respuestas_nocturnas} onChange={v => setIa(p => ({ ...p, respuestas_nocturnas: v }))} label="Respuestas nocturnas" description="Responder automáticamente fuera de horario" />
                  <Toggle checked={ia.aprendizaje} onChange={v => setIa(p => ({ ...p, aprendizaje: v }))} label="Aprendizaje continuo (Beta)" description="Mejorar respuestas según interacciones" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Parámetros del Bot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Máximo de intentos antes de escalar</label>
                    <Input
                      type="number"
                      value={ia.max_intentos}
                      onChange={e => setIa(p => ({ ...p, max_intentos: parseInt(e.target.value) || 3 }))}
                      min="1" max="10"
                    />
                  </div>
                  <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-xs font-medium text-violet-400">Estado actual</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        ['Bot activo', ia.activo ? '✅ Sí' : '❌ No'],
                        ['Auto respuesta', ia.respuesta_automatica ? '✅ Sí' : '❌ No'],
                        ['Escalado', ia.escalar_humano ? '✅ Sí' : '❌ No'],
                        ['Nocturnas', ia.respuestas_nocturnas ? '✅ Sí' : '❌ No'],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between">
                          <span className="text-muted-foreground">{l}</span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── Seguridad ────────────────────────────────────────── */}
        <TabsContent value="seguridad">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" /> Cambiar Contraseña
                </CardTitle>
                <CardDescription className="text-xs">Actualiza la contraseña de tu cuenta</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePwd} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Contraseña actual</label>
                    <Input type="password" required value={pwdForm.current} onChange={e => setPwdForm(p => ({ ...p, current: e.target.value }))} placeholder="••••••••" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Nueva contraseña</label>
                    <Input type="password" required minLength={6} value={pwdForm.nuevo} onChange={e => setPwdForm(p => ({ ...p, nuevo: e.target.value }))} placeholder="••••••••" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Confirmar nueva contraseña</label>
                    <Input type="password" required value={pwdForm.confirmar} onChange={e => setPwdForm(p => ({ ...p, confirmar: e.target.value }))} placeholder="••••••••" />
                  </div>
                  {pwdStatus.error && (
                    <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {pwdStatus.error}
                    </div>
                  )}
                  {pwdStatus.success && (
                    <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-500 flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> Contraseña actualizada exitosamente.
                    </div>
                  )}
                  <Button type="submit" disabled={pwdStatus.loading} className="w-full">
                    {pwdStatus.loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando...</> : 'Actualizar contraseña'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-blue-400" /> Dispositivos Conectados
                  </CardTitle>
                  <CardDescription className="text-xs">Sesiones activas. Revoca accesos sospechosos.</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingSessions ? (
                    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando sesiones...
                    </div>
                  ) : sessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No hay sesiones activas registradas.</p>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-border/30 divide-y divide-border/20 overflow-hidden">
                      {sessions.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-3 bg-card/50 gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">
                              {s.device_type === 'Móvil' ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-none mb-1">{s.username}</p>
                              <p className="text-[11px] text-muted-foreground font-mono">{s.ip_address} · {s.browser}</p>
                              <p className="text-[10px] text-muted-foreground/60 mt-1">
                                {new Date(s.created_at).toLocaleString('es-VE')}
                              </p>
                            </div>
                          </div>
                          <button
                            className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors flex items-center justify-center"
                            onClick={() => handleRevokeSession(s.id)}
                            title="Desconectar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
