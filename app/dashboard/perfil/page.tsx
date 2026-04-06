'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Phone, Lock, Save, Camera, CheckCircle,
  AlertCircle, Loader2, Shield, Calendar, Edit3
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';

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

      // Update app store
      setUser({ ...user, nombre: profile.nombre });

      // Log activity
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

  // Upload avatar
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
    <div className="space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Mi Perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestiona tu información personal y seguridad</p>
      </div>

      {/* Profile header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary" style={{ fontFamily: 'Syne, sans-serif' }}>
                    {initials}
                  </span>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors"
                title="Cambiar foto"
              >
                {uploadingAvatar
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Camera className="w-3.5 h-3.5" />
                }
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
                {profile.nombre || user?.nombre || 'Sin nombre'}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">{profile.email}</p>
              {profile.bio && <p className="text-xs text-muted-foreground mt-2 max-w-sm">{profile.bio}</p>}
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
        {/* Edit profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-primary" /> Información Personal
            </CardTitle>
            <CardDescription className="text-xs">Actualiza tus datos de perfil</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nombre completo</label>
                <Input
                  icon={<User />}
                  value={profile.nombre}
                  onChange={e => setProfile(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Tu nombre"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Usuario</label>
                <Input
                  icon={<User />}
                  value={profile.username}
                  disabled
                  className="opacity-60 cursor-not-allowed"
                  placeholder="usuario"
                />
                <p className="text-[10px] text-muted-foreground">El nombre de usuario no se puede cambiar</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input
                  icon={<Mail />}
                  value={profile.email}
                  disabled
                  className="opacity-60 cursor-not-allowed"
                  type="email"
                />
                <p className="text-[10px] text-muted-foreground">Contacta al admin para cambiar el email</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                <Input
                  icon={<Phone />}
                  value={profile.telefono}
                  onChange={e => setProfile(p => ({ ...p, telefono: e.target.value }))}
                  placeholder="+58 412-000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Biografía / Cargo</label>
                <textarea
                  value={profile.bio}
                  onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                  placeholder="Ej: Técnico mecánico, Lycos Team"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <StatusBadge status={profileStatus} message={profileError} />
                <Button type="submit" disabled={profileStatus === 'saving'} className="ml-auto gap-2">
                  {profileStatus === 'saving'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                    : <><Save className="w-4 h-4" /> Guardar</>
                  }
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" /> Seguridad y Contraseña
            </CardTitle>
            <CardDescription className="text-xs">Cambia tu contraseña de acceso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePwd} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Contraseña actual</label>
                <Input type="password" required value={pwd.current} onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} placeholder="••••••••" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nueva contraseña</label>
                <Input type="password" required minLength={6} value={pwd.nuevo} onChange={e => setPwd(p => ({ ...p, nuevo: e.target.value }))} placeholder="••••••••" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Confirmar nueva contraseña</label>
                <Input type="password" required value={pwd.confirmar} onChange={e => setPwd(p => ({ ...p, confirmar: e.target.value }))} placeholder="••••••••" />
              </div>

              {/* Password strength */}
              {pwd.nuevo && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                        pwd.nuevo.length >= i * 3
                          ? i <= 1 ? 'bg-red-400' : i === 2 ? 'bg-yellow-400' : i === 3 ? 'bg-blue-400' : 'bg-green-400'
                          : 'bg-muted'
                      }`} />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {pwd.nuevo.length < 6 ? 'Muy corta' : pwd.nuevo.length < 9 ? 'Débil' : pwd.nuevo.length < 12 ? 'Media' : 'Fuerte'}
                  </p>
                </div>
              )}

              {pwdStatus === 'error' && pwdError && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {pwdError}
                </div>
              )}
              {pwdStatus === 'saved' && (
                <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-500 flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> Contraseña actualizada correctamente.
                </div>
              )}

              <Button type="submit" disabled={pwdStatus === 'saving'} className="w-full gap-2">
                {pwdStatus === 'saving'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Cambiando...</>
                  : <><Lock className="w-4 h-4" /> Cambiar contraseña</>
                }
              </Button>
            </form>

            {/* Security info */}
            <div className="mt-4 p-3 rounded-xl bg-muted/20 border border-border/30 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-green-400" /> Recomendaciones de seguridad
              </p>
              <ul className="text-[11px] text-muted-foreground space-y-1">
                <li>• Usa al menos 8 caracteres con letras y números</li>
                <li>• No reutilices contraseñas de otros servicios</li>
                <li>• Cambia tu contraseña periódicamente</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
