'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Eye, EyeOff, Lock, Mail, ArrowRight, Shield, Bot, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@lycosteam.com');
  const [password, setPassword] = useState('lycos2026');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Simulate auth
    await new Promise(r => setTimeout(r, 1200));
    if (email && password) {
      router.push('/dashboard');
    } else {
      setError('Credenciales inválidas');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dot-pattern flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-blue-500/3 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 items-center justify-center mb-4 shadow-[0_0_30px_rgba(249,115,22,0.15)]">
            <Zap className="w-7 h-7 text-primary" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
            LYCOS TEAM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema de Gestión Automotriz</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6 border border-border/40">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Iniciar Sesión</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Accede a tu panel de control</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                icon={<Mail />}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@lycosteam.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  icon={<Lock />}
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 mt-1 gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  Ingresar al sistema
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Demo hint */}
          <div className="mt-4 p-3 rounded-xl bg-muted/30 border border-border/20">
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Credenciales de demostración:</p>
            <div className="space-y-0.5">
              <p className="text-[11px] text-foreground/80">📧 admin@lycosteam.com</p>
              <p className="text-[11px] text-foreground/80">🔒 lycos2026</p>
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {[
            { icon: Bot, label: 'IA 24/7' },
            { icon: MessageSquare, label: 'WhatsApp' },
            { icon: Shield, label: 'Seguro' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/50 border border-border/30 text-xs text-muted-foreground">
              <Icon className="w-3 h-3" />
              {label}
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-5">
          © 2024 Lycos Team · Desarrollado por Leandro Márquez
        </p>
      </div>
    </div>
  );
}
