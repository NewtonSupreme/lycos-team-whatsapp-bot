'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Shield, Bot, MessageSquare, Fingerprint, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');

  const onSuccess = (data: any) => {
    if (data.nombre) {
      sessionStorage.setItem('lycos_user', JSON.stringify({
        id: data.id,
        username: data.username,
        nombre: data.nombre,
        rol: data.rol || 'usuario',
        sede_id: data.sede_id,
        email: data.email || `${data.username}@lycosteam.com`,
        avatar_url: data.avatar_url,
        permisos: data.permisos,
      }));
    }
    const searchParams = new URLSearchParams(window.location.search);
    const from = searchParams.get('from') || '/dashboard';
    router.push(from);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        onSuccess(await res.json());
      } else {
        const data = await res.json();
        setError(data.error || 'Credenciales inválidas');
        setLoading(false);
      }
    } catch (_err) {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!email) {
      setError('Ingresa tu email o usuario para usar la huella');
      return;
    }

    setBiometricLoading(true);
    setError('');

    try {
      // 1. Get options
      const optionsRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        console.error('Login options error:', err);
        throw new Error(err.error || err.message || 'Error al obtener opciones');
      }

      const options = await optionsRes.json();
      console.log('Login options received:', options);

      // 2. Start browser authentication
      const asseResp = await startAuthentication(options);

      // 3. Verify
      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, responseBody: asseResp }),
      });

      if (verifyRes.ok) {
        onSuccess(await verifyRes.json());
      } else {
        const err = await verifyRes.json();
        console.error('Login verify error:', err);
        throw new Error(err.error || err.message || 'Fallo biometría');
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error en autenticación biométrica');
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dot-pattern flex items-center justify-center p-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-blue-500/3 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-white/5 border border-white/10 items-center justify-center mb-4 shadow-[0_0_30px_rgba(255,255,255,0.05)] overflow-hidden">
            <img 
              src="/logo-icon-white.png"
              alt="Lycos Team Logo" 
              className="w-12 h-12 object-contain truck-anim"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
            LYCOS TEAM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema de Gestión Automotriz</p>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-border/40">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Iniciar Sesión</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Accede a tu panel de control</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email o Usuario</label>
              <Input
                type="text"
                icon={<Mail className="w-4 h-4" />}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email o nombre de usuario"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  icon={<Lock className="w-4 h-4" />}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="w-1 h-1 rounded-full bg-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 mt-2">
              <Button
                type="submit"
                disabled={loading || biometricLoading}
                className="w-full h-10 gap-2 font-bold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    Ingresar al sistema
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <button
                type="button"
                disabled={loading || biometricLoading}
                onClick={handleBiometricLogin}
                className="w-full h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all flex items-center justify-center gap-2 font-bold text-sm"
              >
                {biometricLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Fingerprint className="w-5 h-5" />
                )}
                <span>Usar Huella Dactilar</span>
              </button>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {[
            { icon: Bot, label: 'IA 24/7' },
            { icon: MessageSquare, label: 'WhatsApp' },
            { icon: Shield, label: 'Seguro' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/50 border border-border/30 text-xs text-muted-foreground" title={label}>
              <Icon className="w-3 h-3" />
              {label}
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-5">
          © 2026 Lycos Team · Desarrollado por Leandro Márquez
        </p>
      </div>
    </div>
  );
}
