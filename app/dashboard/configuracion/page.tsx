'use client';
import React, { useState } from 'react';
import { Settings, User, Bell, Bot, MessageSquare, Shield, Zap, Save, Eye, EyeOff, Phone, Mail, MapPin, Clock, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; }
function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-border/30 hover:border-border/50 transition-colors">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export default function ConfiguracionPage() {
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [empresa, setEmpresa] = useState({ nombre: 'Lycos Team', telefono: '+58 412-334-3519', email: 'lycosteam7@gmail.com', direccion: 'Altos Mirandinos, Miranda, Venezuela', web: 'www.lycosteam.com', horario_semana: '8:00 AM - 6:00 PM', horario_sabado: '8:00 AM - 2:00 PM' });
  const [notifs, setNotifs] = useState({ nuevos_mensajes: true, nuevas_citas: true, servicios_completos: true, emergencias: true, reportes_diarios: false });
  const [ia, setIa] = useState({ activo: true, respuesta_automatica: true, escalar_humano: true, aprendizaje: false, respuestas_nocturnas: true, max_intentos: '3' });
  const [apiKeys, setApiKeys] = useState({ gemini: 'AIza••••••••••••••••••••••••', whatsapp_token: 'EAAxxxxxxx••••••••', whatsapp_phone_id: '123456789', supabase_url: 'https://xxx.supabase.co', supabase_anon: 'eyJhbGci••••••••' });
  const [seguridad, setSeguridad] = useState({ dos_factores: false, sesiones_activas: true, logs_auditoria: true, backups_automaticos: true });

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Configuración</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ajustes del sistema y preferencias</p>
        </div>
        <Button onClick={handleSave} className="gap-2 self-start sm:self-auto">
          {saved ? <><Zap className="w-4 h-4" /> ¡Guardado!</> : <><Save className="w-4 h-4" /> Guardar Cambios</>}
        </Button>
      </div>

      <Tabs defaultValue="empresa">
        <TabsList className="w-full sm:w-auto flex overflow-x-auto">
          <TabsTrigger value="empresa" className="gap-1.5 flex-shrink-0"><User className="w-3.5 h-3.5" />Empresa</TabsTrigger>
          <TabsTrigger value="notificaciones" className="gap-1.5 flex-shrink-0"><Bell className="w-3.5 h-3.5" />Notificaciones</TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5 flex-shrink-0"><Bot className="w-3.5 h-3.5" />IA & Bot</TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5 flex-shrink-0"><Globe className="w-3.5 h-3.5" />APIs</TabsTrigger>
          <TabsTrigger value="seguridad" className="gap-1.5 flex-shrink-0"><Shield className="w-3.5 h-3.5" />Seguridad</TabsTrigger>
        </TabsList>

        {/* Empresa */}
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
                    <Input icon={<f.icon />} value={(empresa as any)[f.key]} onChange={e => setEmpresa(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type={(f as any).type} />
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
                <CardDescription className="text-xs">Horarios que el bot IA utiliza para respuestas</CardDescription>
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
                    "Nuestro horario es: L-V de {empresa.horario_semana} y Sábados de {empresa.horario_sabado}. Domingos cerrado."
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted/20 border border-border/30 mt-2">
                  <p className="text-xs font-medium mb-2">Sistema activo</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Bot IA', status: true, color: 'text-green-400' },
                      { label: 'WhatsApp', status: true, color: 'text-green-400' },
                      { label: 'Supabase DB', status: true, color: 'text-green-400' },
                      { label: 'Gemini API', status: true, color: 'text-green-400' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className={cn('flex items-center gap-1 font-medium', s.color)}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          Online
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notificaciones */}
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

        {/* IA */}
        <TabsContent value="ia">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-400" /> Configuración del Bot IA
                </CardTitle>
                <CardDescription className="text-xs">Comportamiento del asistente Gemini</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Toggle checked={ia.activo} onChange={v => setIa(p => ({ ...p, activo: v }))} label="Bot IA activo" description="Habilitar asistente de inteligencia artificial" />
                <Toggle checked={ia.respuesta_automatica} onChange={v => setIa(p => ({ ...p, respuesta_automatica: v }))} label="Respuesta automática" description="Responder mensajes sin intervención humana" />
                <Toggle checked={ia.escalar_humano} onChange={v => setIa(p => ({ ...p, escalar_humano: v }))} label="Escalar a humano" description="Transferir conversación cuando el bot no puede responder" />
                <Toggle checked={ia.respuestas_nocturnas} onChange={v => setIa(p => ({ ...p, respuestas_nocturnas: v }))} label="Respuestas nocturnas" description="Responder automáticamente fuera de horario" />
                <Toggle checked={ia.aprendizaje} onChange={v => setIa(p => ({ ...p, aprendizaje: v }))} label="Aprendizaje continuo" description="Mejorar respuestas basado en interacciones (Beta)" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parámetros del Bot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Máximo de intentos antes de escalar</label>
                  <Input type="number" value={ia.max_intentos} onChange={e => setIa(p => ({ ...p, max_intentos: e.target.value }))} min="1" max="10" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Prompt del sistema (System Prompt)</label>
                  <textarea
                    className="flex w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[120px] font-mono"
                    defaultValue="Eres el asistente virtual de Lycos Team, especialista automotriz. Responde de manera profesional, amigable y orientada a agendar citas. Siempre en español."
                  />
                </div>
                <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs font-medium text-violet-400">Estadísticas IA hoy</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[['Respuestas', '47'],['Citas generadas', '8'],['Escalaciones', '3'],['Tasa éxito', '94%']].map(([l,v]) => (
                      <div key={l} className="flex justify-between">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="font-semibold text-violet-400">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* API Keys */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variables de Entorno y API Keys</CardTitle>
              <CardDescription className="text-xs">Claves de integración — mantén estas en secreto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'GEMINI_API_KEY', key: 'gemini', description: 'Google Gemini AI API' },
                { label: 'WHATSAPP_TOKEN', key: 'whatsapp_token', description: 'Meta WhatsApp Business Cloud API' },
                { label: 'WHATSAPP_PHONE_ID', key: 'whatsapp_phone_id', description: 'ID del número de WhatsApp Business' },
                { label: 'SUPABASE_URL', key: 'supabase_url', description: 'URL del proyecto Supabase' },
                { label: 'SUPABASE_ANON_KEY', key: 'supabase_anon', description: 'Clave anónima pública de Supabase' },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-medium text-primary">{f.label}</label>
                    <span className="text-[10px] text-muted-foreground">{f.description}</span>
                  </div>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={(apiKeys as any)[f.key]}
                      onChange={e => setApiKeys(p => ({ ...p, [f.key]: e.target.value }))}
                      className="font-mono text-xs pr-10"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <p className="text-xs text-yellow-400 font-medium mb-1">⚠️ Seguridad</p>
                <p className="text-xs text-muted-foreground">Estas claves se guardan encriptadas. Nunca las compartas. En producción usa variables de entorno en Vercel.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seguridad */}
        <TabsContent value="seguridad">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" />Seguridad de la Cuenta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Toggle checked={seguridad.dos_factores} onChange={v => setSeguridad(p => ({ ...p, dos_factores: v }))} label="Autenticación 2 Factores" description="Requiere código OTP al iniciar sesión" />
                <Toggle checked={seguridad.sesiones_activas} onChange={v => setSeguridad(p => ({ ...p, sesiones_activas: v }))} label="Sesiones activas" description="Monitorear dispositivos conectados" />
                <Toggle checked={seguridad.logs_auditoria} onChange={v => setSeguridad(p => ({ ...p, logs_auditoria: v }))} label="Log de auditoría" description="Registrar todas las acciones del sistema" />
                <Toggle checked={seguridad.backups_automaticos} onChange={v => setSeguridad(p => ({ ...p, backups_automaticos: v }))} label="Backups automáticos" description="Respaldo de base de datos cada 24h" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información del Sistema</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { label: 'Versión', value: 'v1.0.0', color: 'text-foreground' },
                    { label: 'Autor', value: 'Leandro Márquez', color: 'text-primary' },
                    { label: 'Framework', value: 'Next.js 14 + Supabase', color: 'text-blue-400' },
                    { label: 'IA', value: 'Google Gemini 1.5', color: 'text-violet-400' },
                    { label: 'Hosting', value: 'Vercel + Supabase', color: 'text-green-400' },
                    { label: 'Último backup', value: 'Hoy 06:00 AM', color: 'text-muted-foreground' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className={`text-xs font-medium ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
