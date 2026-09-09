'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowRight, BarChart3, CalendarDays, Eye, EyeOff, Fingerprint,
  Globe, Loader2, Lock, Mail, Package, PiggyBank, ShieldCheck, ShoppingCart,
  UsersRound, Zap, type LucideIcon,
} from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { cn } from '@/lib/utils';

/**
 * La foto del taller va de fondo en el panel izquierdo.
 *
 * El hueco está reservado con su degradado: cuando el archivo exista en
 * /public la imagen aparece sola, sin tocar el maquetado ni cambiar medidas.
 */
const FOTO_TALLER = '/login-hero.jpg';

const BENEFICIOS: readonly { icon: LucideIcon; titulo: string; detalle: string }[] = [
  { icon: UsersRound, titulo: 'Clientes y Vehículos', detalle: 'Historial completo' },
  { icon: ShoppingCart, titulo: 'Servicios y Ventas', detalle: 'De orden a factura' },
  { icon: Package, titulo: 'Inventario', detalle: 'Control total' },
  { icon: CalendarDays, titulo: 'Agenda', detalle: 'Organiza tu taller' },
  { icon: PiggyBank, titulo: 'Finanzas', detalle: 'Conoce tu rentabilidad' },
  { icon: BarChart3, titulo: 'Reportes', detalle: 'Decisiones inteligentes' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [recordarme, setRecordarme] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const onSuccess = (data: any) => {
    if (data.nombre) {
      localStorage.setItem('lycos_user', JSON.stringify({
        id: data.id || data.username,
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
    const from = searchParams.get('from') || '/dashboard/apps';
    router.push(from);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAviso('');

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
    } catch {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!email) {
      setError('Ingresa tu correo o usuario para entrar con huella');
      return;
    }
    setBiometricLoading(true);
    setError('');
    setAviso('');

    try {
      const optionsRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(err.error || err.message || 'No se pudieron obtener las opciones');
      }

      const asseResp = await startAuthentication(await optionsRes.json());

      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, responseBody: asseResp }),
      });
      if (verifyRes.ok) {
        onSuccess(await verifyRes.json());
      } else {
        const err = await verifyRes.json();
        throw new Error(err.error || err.message || 'Falló la huella');
      }
    } catch (err: any) {
      setError(err?.message || 'Error en la autenticación por huella');
    } finally {
      setBiometricLoading(false);
    }
  };

  /** Las cuentas las crea el administrador; no hay alta pública. */
  const avisarRegistro = () =>
    setAviso('Las cuentas las crea el administrador desde Empleados. Pedile acceso a quien administra el sistema.');

  return (
    <main className="flex min-h-dvh bg-[#f4f5f7]">
      {/* ── Panel izquierdo ───────────────────────────────────────────── */}
      <section
        className="relative hidden w-[53%] shrink-0 flex-col overflow-hidden bg-[#0d0e11] lg:flex"
        style={{ backgroundImage: `url(${FOTO_TALLER})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        {/* Velo: sostiene el contraste del texto tanto con foto como sin ella. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(115deg,rgba(10,11,13,0.95)_0%,rgba(10,11,13,0.82)_45%,rgba(10,11,13,0.62)_100%)]"
        />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
          <div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div className="flex items-center gap-3">
                <img src="/Nuevo_Lycos_LOGO.png" alt="" className="h-[52px] w-[52px] object-contain" />
                <div className="leading-none">
                  <p className="text-[27px] font-extrabold tracking-tight text-white">
                    Lycos <span className="text-[#f97316]">Team</span>
                  </p>
                  <p className="mt-1.5 text-[10.5px] font-medium tracking-[0.22em] text-white/70">
                    TALLER AUTOMOTRIZ
                  </p>
                </div>
              </div>
              <p className="flex items-center gap-3 text-[13.5px] text-white/85">
                <span className="h-[2px] w-8 rounded-full bg-[#f97316]" aria-hidden />
                Tecnología que impulsa tu taller
              </p>
            </div>

            <h1 className="mt-12 text-[46px] font-extrabold leading-[1.06] tracking-[-0.02em] text-white xl:text-[52px]">
              Gestiona tu taller
              <br />
              <span className="text-[#f97316]">sin límites</span>
            </h1>

            <p className="mt-5 max-w-[30rem] text-[15px] leading-relaxed text-white/75">
              Una plataforma completa para administrar clientes, vehículos,
              servicios, ventas, inventario y más. Todo en un solo lugar.
            </p>

            <ul className="mt-8 grid max-w-[36rem] grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-3">
              {BENEFICIOS.map(({ icon: Icon, titulo, detalle }) => (
                <li key={titulo} className="flex items-start gap-3">
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316]">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[13.5px] font-semibold text-white">{titulo}</span>
                    <span className="block text-[12px] text-white/60">{detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <blockquote className="flex gap-3">
              <span aria-hidden className="font-serif text-[46px] leading-[0.7] text-[#f97316]">“</span>
              <p className="self-end text-[15px] leading-snug text-white/85">
                Más que un taller,
                <br />
                un aliado en el camino.
              </p>
            </blockquote>
            <span className="mt-4 block h-[3px] w-16 rounded-full bg-[#f97316]" aria-hidden />

            <ul className="mt-6 flex items-center justify-end gap-8 text-[13px] text-white/75">
              {[
                { icon: ShieldCheck, label: 'Seguro' },
                { icon: Zap, label: 'Rápido' },
                { icon: BarChart3, label: 'Confiable' },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon className="h-[17px] w-[17px] text-white/60" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Panel derecho ─────────────────────────────────────────────── */}
      <section className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-5 sm:p-8">
        {/* Acentos geométricos de las esquinas */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-16 h-56 w-56 rotate-45 bg-gradient-to-br from-[#f97316]/20 to-transparent" />
          <div className="absolute -bottom-20 -left-10 h-48 w-48 rotate-12 bg-gradient-to-tr from-[#f97316]/12 to-transparent" />
          <div className="absolute bottom-16 right-0 h-28 w-28 -rotate-12 bg-gradient-to-tl from-[#f97316]/15 to-transparent" />
        </div>

        <div className="relative w-full max-w-[610px] rounded-[26px] bg-white p-7 shadow-[0_20px_60px_-24px_rgba(16,18,22,0.22)] sm:p-10">
          <div className="flex justify-end">
            <button
              type="button"
              className="flex h-[38px] items-center gap-2 rounded-lg border border-[#e2e5ea] px-3 text-[13px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
            >
              <Globe className="h-4 w-4 text-[#5b616e]" aria-hidden />
              Español
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#9ba1ab]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          <div className="mt-1 flex items-center justify-center gap-3">
            <img src="/Nuevo_Lycos_LOGO.png" alt="" className="h-[52px] w-[52px] object-contain" />
            <div className="leading-none">
              <p className="text-[28px] font-extrabold tracking-tight text-[#16181d]">
                Lycos <span className="text-[#f97316]">Team</span>
              </p>
              <p className="mt-1.5 text-[10.5px] font-medium tracking-[0.22em] text-[#8a909c]">
                TALLER AUTOMOTRIZ
              </p>
            </div>
          </div>

          <h2 className="mt-6 text-center text-[27px] font-extrabold tracking-tight text-[#16181d]">
            ¡Bienvenido de nuevo!
          </h2>
          <p className="mt-1.5 text-center text-[13.5px] text-[#8a909c]">
            Inicia sesión para continuar gestionando tu taller.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              aria-pressed="true"
              className="flex h-[46px] items-center justify-center gap-2 rounded-lg bg-[#f97316] text-[14px] font-semibold text-white"
            >
              <UsersRound className="h-[18px] w-[18px]" aria-hidden />
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={avisarRegistro}
              className="flex h-[46px] items-center justify-center gap-2 rounded-lg bg-[#f2f3f5] text-[14px] font-semibold text-[#3d4350] hover:bg-[#e8eaed]"
            >
              <UsersRound className="h-[18px] w-[18px]" aria-hidden />
              Crear cuenta
            </button>
          </div>

          <form onSubmit={handleLogin} className="mt-5">
            <label htmlFor="correo" className="block text-[13.5px] font-semibold text-[#16181d]">
              Correo electrónico
            </label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
              <input
                id="correo"
                type="text"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className="h-[50px] w-full rounded-lg border border-[#e2e5ea] bg-[#fbfbfc] pl-11 pr-3.5 text-[14px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
              />
            </div>

            <label htmlFor="clave" className="mt-4 block text-[13.5px] font-semibold text-[#16181d]">
              Contraseña
            </label>
            <div className="relative mt-2">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
              <input
                id="clave"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="h-[50px] w-full rounded-lg border border-[#e2e5ea] bg-[#fbfbfc] pl-11 pr-11 text-[14px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[#9ba1ab] hover:text-[#3d4350]"
              >
                {showPwd ? <Eye className="h-[18px] w-[18px]" aria-hidden /> : <EyeOff className="h-[18px] w-[18px]" aria-hidden />}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#3d4350]">
                <input
                  type="checkbox"
                  checked={recordarme}
                  onChange={e => setRecordarme(e.target.checked)}
                  className="h-[17px] w-[17px] rounded border-[#cfd4dc] accent-[#f97316]"
                />
                Recordarme
              </label>
              <button
                type="button"
                onClick={() => setAviso('Pedile a quien administra el sistema que restablezca tu contraseña desde Empleados.')}
                className="text-[13px] font-medium text-[#f97316] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-3 py-2.5 text-[13px] text-[#b91c1c]">
                <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            {aviso && (
              <p role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-[#cfe0fb] bg-[#eef4fe] px-3 py-2.5 text-[13px] text-[#1d4ed8]">
                <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                {aviso}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || biometricLoading}
              className="mt-5 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-[#f97316] text-[15px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:opacity-60"
            >
              {loading
                ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
                : <ArrowRight className="h-[18px] w-[18px]" aria-hidden />}
              {loading ? 'Entrando…' : 'Iniciar sesión'}
            </button>

            {/* La huella no está en el diseño pero sí funciona, y quitarla sería
                sacarle a la gente un acceso que ya usa. */}
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={loading || biometricLoading}
              className="mt-2.5 flex h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-[#e2e5ea] text-[13.5px] font-medium text-[#3d4350] transition-colors hover:bg-[#f6f7f9] disabled:opacity-60"
            >
              {biometricLoading
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <Fingerprint className="h-[18px] w-[18px] text-[#f97316]" aria-hidden />}
              {biometricLoading ? 'Verificando…' : 'Entrar con huella'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-4">
            <span className="h-px flex-1 bg-[#e8eaed]" aria-hidden />
            <span className="text-[13px] text-[#9ba1ab]">o continúa con</span>
            <span className="h-px flex-1 bg-[#e8eaed]" aria-hidden />
          </div>

          {/* Aún sin configurar en el servidor: se muestran, pero deshabilitados
              en vez de fingir que funcionan. */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Google', glyph: <GoogleGlyph /> },
              { label: 'Microsoft', glyph: <MicrosoftGlyph /> },
              { label: 'Apple', glyph: <AppleGlyph /> },
            ].map(({ label, glyph }) => (
              <button
                key={label}
                type="button"
                disabled
                title={`El acceso con ${label} todavía no está configurado`}
                className="flex h-[50px] items-center justify-center gap-2 rounded-lg border border-[#e2e5ea] bg-[#fbfbfc] text-[14px] font-medium text-[#3d4350] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {glyph}
                {label}
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-[13.5px] text-[#5b616e]">
            ¿No tienes una cuenta?{' '}
            <button type="button" onClick={avisarRegistro} className="font-semibold text-[#f97316] hover:underline">
              Regístrate aquí
            </button>
          </p>

          <nav className="mt-6 flex items-center justify-center gap-3 text-[12.5px] text-[#9ba1ab]">
            <a href="/terminos" className="hover:text-[#3d4350]">Términos de uso</a>
            <span aria-hidden className="opacity-50">|</span>
            <a href="/privacidad" className="hover:text-[#3d4350]">Política de privacidad</a>
            <span aria-hidden className="opacity-50">|</span>
            <a href="https://wa.me/584265903033" target="_blank" rel="noreferrer" className="hover:text-[#3d4350]">Soporte</a>
          </nav>
        </div>
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72C21.78 18.68 23 15.76 23 12.27Z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.62-2.8l-3.72-2.9c-1.03.7-2.35 1.1-3.9 1.1-3 0-5.53-2.02-6.44-4.74H1.72v2.98A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.56 14.16a6.9 6.9 0 0 1 0-4.32V6.86H1.72a11.5 11.5 0 0 0 0 10.28l3.84-2.98Z" />
      <path fill="#EA4335" d="M12 5.14c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.72 15.1.5 12 .5A11.5 11.5 0 0 0 1.72 6.86l3.84 2.98C6.47 7.16 9 5.14 12 5.14Z" />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="#16181d" aria-hidden>
      <path d="M16.36 12.72c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3-.79-1.55.02-2.97.9-3.77 2.29-1.6 2.79-.41 6.91 1.15 9.17.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.23-.02 2.02-1.12 2.78-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65ZM14.1 5.98c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.09 1.77-.95 2.81 1.02.08 2.05-.52 2.68-1.28Z" />
    </svg>
  );
}
