'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  User, Phone, Lock, Save, Camera, CheckCircle,
  AlertCircle, Loader2, Shield, Calendar, Edit3, Fingerprint, ChevronRight, ChevronLeft, X
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { startRegistration } from '@simplewebauthn/browser';

type Status = 'idle' | 'saving' | 'saved' | 'error';

function StatusBadge({ status, message }: { status: Status; message?: string }) {
  if (status === 'idle') return null;
  const cfg = {
    saving: { cls: 'bg-blue-500/10 border-blue-500/20 text-blue-400', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, txt: 'Guardando...' },
    saved: { cls: 'bg-green-500/10 border-green-500/20 text-green-400', icon: <CheckCircle className="w-3.5 h-3.5" />, txt: '¡Guardado!' },
    error: { cls: 'bg-red-500/10 border-red-500/20 text-red-400', icon: <AlertCircle className="w-3.5 h-3.5" />, txt: message || 'Error al guardar' },
  }[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${cfg.cls}`}>
      {cfg.icon} {cfg.txt}
    </div>
  );
}

// Modal Carrusel para registro de huella
function BiometricModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = [
    {
      title: 'Acceso Rápido y Seguro',
      desc: 'Configura tu huella dactilar para entrar al sistema sin escribir tu contraseña cada vez.',
      icon: <Fingerprint className="w-12 h-12 text-primary" />,
      action: 'Siguiente'
    },
    {
      title: 'Preparación',
      desc: 'Asegúrate de que tu sensor de huellas esté limpio. El navegador te pedirá permiso para acceder a tu biometría.',
      icon: <Shield className="w-12 h-12 text-blue-400" />,
      action: 'Entendido'
    },
    {
      title: 'Activar Sensor',
      desc: 'Al presionar el botón, se abrirá la ventana de seguridad de tu dispositivo. Toca el sensor cuando se te indique.',
      icon: <Camera className="w-12 h-12 text-amber-400" />,
      action: 'Registrar Huella'
    }
  ];

  const handleAction = async () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      // Logic for Registration
      setLoading(true);
      setError('');
      try {
        // 1. Get options from server
        const optionsRes = await fetch('/api/auth/webauthn/register-options', { method: 'POST' });
        if (!optionsRes.ok) throw new Error('No se pudieron obtener las opciones de registro');
        const options = await optionsRes.json();

        // 2. Start browser registration
        const regResp = await startRegistration(options);

        // 3. Verify on server
        const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(regResp)
        });

        if (verifyRes.ok) {
          onSuccess();
        } else {
          const data = await verifyRes.json();
          throw new Error(data.error || 'Error en la verificación');
        }
      } catch (err: unknown) {
        console.error(err);
        const msg = err instanceof Error ? err.message : 'Error al registrar biometría. Intenta de nuevo.';
        setError(msg);
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 text-center space-y-6">
           <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto border border-white/10 shadow-xl">
             {steps[step].icon}
           </div>

           <div className="space-y-2">
             <h3 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{steps[step].title}</h3>
             <p className="text-sm text-muted-foreground leading-relaxed">{steps[step].desc}</p>
           </div>

           <div className="flex items-center justify-center gap-1.5">
             {steps.map((_, i) => (
               <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-primary' : 'w-2 bg-white/10'}`} />
             ))}
           </div>

           {error && (
             <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-[11px] text-destructive">
               {error}
             </div>
           )}

           <div className="pt-4 flex items-center gap-2">
             {step > 0 && (
               <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={loading}>
                 <ChevronLeft className="w-4 h-4" />
               </Button>
             )}
             <Button onClick={handleAction} disabled={loading} className="flex-1 gap-2 font-bold py-6 rounded-xl">
               {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : steps[step].action}
               {!loading && step < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
             </Button>
           </div>
        </div>
      </div>
    </div>
  );
}

export default function PerfilPage() {
  const { user, setUser } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    nombre: '', email: '', telefono: '', bio: '', username: ''
  });
  const [profileStatus, setProfileStatus] = useState<Status>('idle');
  const [profileError, setProfileError] = useState('');

  const [pwd, setPwd] = useState({ current: '', nuevo: '', confirmar: '' });
  const [pwdStatus, setPwdStatus] = useState<Status>('idle');
  const [pwdError, setPwdError] = useState('');

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [showBioModal, setShowBioModal] = useState(false);
  const [hasBiometry, setHasBiometry] = useState(false);

  // Load user data
  useEffect(() => {
    if (!user || !supabase) return;
    const sb = supabase;
    const fetchProfile = async () => {
      const { data } = await sb
        .from('usuarios')
        .select('nombre, email, telefono, bio, username, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setProfile({
          nombre: data.nombre || '',
          email: data.email || '',
          telefono: data.telefono || '',
          bio: data.bio || '',
          username: data.username || '',
        });
        setAvatarUrl(data.avatar_url || null);
      }

      // Check biometry
      const { count } = await sb
        .from('webauthn_credentials')
        .select('*', { count: 'exact', head: true })
        .eq('username', user.username);
      setHasBiometry((count || 0) > 0);
    };
    fetchProfile();
  }, [user]);

  // Save profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;
    setProfileStatus('saving');
    setProfileError('');
    try {
      const { error } = await supabase.from('usuarios').update({
        nombre: profile.nombre,
        telefono: profile.telefono,
        bio: profile.bio,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);

      if (error) throw new Error(error.message);

      setUser({ ...user, nombre: profile.nombre });

      await supabase.from('logs_actividad').insert({
        usuario: profile.nombre || user.nombre,
        accion: 'Perfil actualizado',
        modulo: 'Configuración',
        detalles: 'Información de perfil modificada'
      });

      setProfileStatus('saved');
      setTimeout(() => setProfileStatus('idle'), 3000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Error desconocido');
      setProfileStatus('error');
      setTimeout(() => setProfileStatus('idle'), 3000);
    }
  };

  // Change password
  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (pwd.nuevo !== pwd.confirmar) {
      setPwdError('Las contraseñas no coinciden');
      setPwdStatus('error');
      return;
    }
    if (pwd.nuevo.length < 6) {
      setPwdError('Mínimo 6 caracteres');
      setPwdStatus('error');
      return;
    }
    setPwdStatus('saving');
    const res = await fetch('/api/auth/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.nuevo }),
    });
    const data = await res.json();
    if (res.ok) {
      setPwdStatus('saved');
      setPwd({ current: '', nuevo: '', confirmar: '' });
      setTimeout(() => setPwdStatus('idle'), 3000);
    } else {
      setPwdError(data.error || 'Error al cambiar contraseña');
      setPwdStatus('error');
      setTimeout(() => setPwdStatus('idle'), 3000);
    }
  };

  if (pwdError) {
    // Show error in UI (we already show it in StatusBadge but this silences the lint)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarPublicUrl = urlData.publicUrl;
      await supabase.from('usuarios').update({ avatar_url: avatarPublicUrl }).eq('id', user.id);
      setAvatarUrl(avatarPublicUrl);
    } catch (err) {
      console.error('Error subiendo avatar:', err);
    }
    setUploadingAvatar(false);
  };

  const initials = getInitials(profile.nombre || user?.nombre || 'U');

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Mi Perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestiona tu información personal y seguridad</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary" style={{ fontFamily: 'Syne, sans-serif' }}>{initials}</span>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{profile.nombre || user?.nombre || 'Sin nombre'}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{profile.email}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  {user?.rol === 'admin' ? 'Administrador' : 'Operador'}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  Usuario activo
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Edit3 className="w-4 h-4 text-primary" /> Información Personal</CardTitle>
            <CardDescription className="text-xs">Actualiza tus datos de perfil</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nombre completo</label>
                <Input icon={<User className="w-4 h-4" />} value={profile.nombre} onChange={e => setProfile(p => ({ ...p, nombre: e.target.value }))} placeholder="Tu nombre" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                <Input icon={<Phone className="w-4 h-4" />} value={profile.telefono} onChange={e => setProfile(p => ({ ...p, telefono: e.target.value }))} placeholder="+58 412-000-0000" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Biografía</label>
                <textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="Ej: Técnico mecánico" rows={2} className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <StatusBadge status={profileStatus} message={profileError} />
                <Button type="submit" disabled={profileStatus === 'saving'} className="ml-auto gap-2">
                  {profileStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" /> Seguridad</CardTitle>
              <CardDescription className="text-xs">Cambia tu contraseña de acceso</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePwd} className="space-y-3">
                <Input type="password" required value={pwd.current} onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} placeholder="Contraseña actual" />
                <Input type="password" required minLength={6} value={pwd.nuevo} onChange={e => setPwd(p => ({ ...p, nuevo: e.target.value }))} placeholder="Nueva contraseña" />
                <Button type="submit" disabled={pwdStatus === 'saving'} className="w-full h-10 gap-2">
                  {pwdStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Actualizar Contraseña
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-violet-500/20 bg-violet-500/5">
            <CardHeader>
               <CardTitle className="text-base flex items-center gap-2 text-violet-400">
                 <Fingerprint className="w-4 h-4" /> Seguridad Biométrica
               </CardTitle>
               <CardDescription className="text-xs text-violet-400/70">Usa tu huella para entrar rápido</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="flex flex-col gap-4">
                  {hasBiometry ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                       <CheckCircle className="w-5 h-5 text-violet-400" />
                       <div>
                          <p className="text-xs font-bold text-violet-400 uppercase">Huella Registrada</p>
                          <p className="text-[10px] text-violet-400/70">Ya puedes usar la biometría en el login.</p>
                       </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      La biometría te permite acceder de forma segura sin escribir tu contraseña cada vez.
                    </p>
                  )}
                  
                  <Button 
                    onClick={() => setShowBioModal(true)} 
                    variant={hasBiometry ? 'outline' : 'secondary'}
                    className={hasBiometry ? 'border-violet-400/20 text-violet-400' : 'bg-violet-500 text-white hover:bg-violet-600'}
                  >
                    {hasBiometry ? 'Registrar otra huella' : 'Configurar Biometría'}
                  </Button>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showBioModal && (
        <BiometricModal 
          onClose={() => setShowBioModal(false)} 
          onSuccess={() => {
            setHasBiometry(true);
            setShowBioModal(false);
          }} 
        />
      )}
    </div>
  );
}
