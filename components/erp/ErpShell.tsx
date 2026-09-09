'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bell, Calculator, Calendar, Car, ChevronDown, Cog, FileSpreadsheet, FileText,
  Landmark, LayoutDashboard, LogOut, MapPin, Menu, Moon, Package, Search, Settings,
  ShoppingCart, Sun, Truck, UserCircle, Users, UsersRound, Wrench, X,
  type LucideIcon,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { getPermisos, hasPermiso, resolveRol, getRoleMeta, type Permisos } from '@/types';
import LauncherFab from '@/components/launcher/LauncherFab';
import { ModalCerrarSesion } from '@/components/ui/modales/ModalesSistema';
import { USAR_ARMAZON_NUEVO } from '@/lib/ui/armazon';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permKey?: keyof Permisos;
  /** Marca activo también las rutas hijas (p. ej. /dashboard/nomina/recibos). */
  prefijo?: boolean;
}

/**
 * Navegación del armazón, en el orden del diseño de referencia.
 *
 * Tres etiquetas se apartan de la imagen a propósito: el diseño trae "Compras"
 * y "Finanzas", módulos que este sistema no tiene, así que ocupan su lugar los
 * reales más cercanos con su propio nombre. Es preferible una etiqueta distinta
 * a un enlace que promete una pantalla que no existe.
 *
 * Lo que el diseño no lista —Leads, Asistente IA, Actividad, Papelera…— sigue a
 * un clic en el botón flotante de módulos, abajo a la derecha.
 */
const NAV: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permKey: 'dashboard' },
  { label: 'Agenda', href: '/dashboard/agenda', icon: Calendar, permKey: 'agenda' },
  { label: 'Clientes', href: '/dashboard/clientes', icon: Users, permKey: 'clientes' },
  { label: 'Vehículos', href: '/dashboard/vehiculos', icon: Car, permKey: 'vehiculos' },
  { label: 'Taller', href: '/dashboard/taller', icon: Wrench, permKey: 'taller' },
  { label: 'Servicios', href: '/dashboard/servicios', icon: Cog, permKey: 'servicios' },
  { label: 'Inventario', href: '/dashboard/inventario', icon: Package, permKey: 'inventario' },
  { label: 'Distribución', href: '/dashboard/distribuidor', icon: Truck, permKey: 'distribuidor' },
  { label: 'Ventas', href: '/dashboard/silenciadores', icon: ShoppingCart, permKey: 'ventas' },
  { label: 'Facturación', href: '/dashboard/facturas', icon: FileText, permKey: 'ventas' },
  { label: 'Presupuestos', href: '/dashboard/presupuestos', icon: FileSpreadsheet, permKey: 'presupuestos' },
  { label: 'WhatsApp', href: '/dashboard/whatsapp', icon: WhatsAppIcon as unknown as LucideIcon, permKey: 'whatsapp' },
  { label: 'Nómina', href: '/dashboard/nomina', icon: NominaIcon as unknown as LucideIcon, permKey: 'nomina', prefijo: true },
  { label: 'Finanzas', href: '/dashboard/finanzas', icon: Landmark, permKey: 'reportes' },
  { label: 'Reportes', href: '/dashboard/reportes', icon: ChartIcon as unknown as LucideIcon, permKey: 'reportes' },
  { label: 'Calculadora', href: '/dashboard/calculadora', icon: Calculator, permKey: 'calculadora' },
  { label: 'RRHH', href: '/dashboard/ajustes/empleados', icon: UsersRound, permKey: 'empleados' },
  { label: 'Configuración', href: '/dashboard/configuracion', icon: Settings, permKey: 'configuracion' },
];

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.42 1.27 4.86L2 22l5.28-1.24A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm0 18.2c-1.6 0-3.09-.46-4.35-1.26l-.31-.19-3.13.73.75-3.05-.2-.32A8.14 8.14 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2Z" />
    </svg>
  );
}

export function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" fill="currentColor" stroke="none" rx="1" />
      <rect x="12" y="8" width="3" height="10" fill="currentColor" stroke="none" rx="1" />
      <rect x="17" y="5" width="3" height="13" fill="currentColor" stroke="none" rx="1" />
    </svg>
  );
}

/** Libro de nómina: la ficha con la línea de la persona y el monto. */
export function NominaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9.5" r="1.9" />
      <path d="M6.2 15c.5-1.4 1.6-2.1 2.8-2.1s2.3.7 2.8 2.1" />
      <path d="M14.5 8.5h3.8M14.5 12h3.8M14.5 15.5h2.4" />
    </svg>
  );
}

interface ErpShellProps {
  children: ReactNode;
  /** Claro para nómina, oscuro para el punto de venta. */
  variant?: 'claro' | 'oscuro';
  /** Texto del buscador de la barra superior. */
  buscador?: string;
  /** Frase de la tarjeta de marca al pie de la barra lateral. */
  lema?: readonly string[];
  /** Segunda línea, más pequeña, de esa misma tarjeta. */
  lemaPie?: readonly string[];
  /** Sub-secciones del módulo activo, desplegadas bajo su entrada. */
  subnav?: readonly { id: string; label: string }[];
  subnavActivo?: string;
  onSubnav?: (id: string) => void;
  /**
   * La pantalla ocupa exactamente el alto de la ventana y desplaza por dentro.
   * Lo usan las que son un espacio de trabajo —el chat del asistente, el punto
   * de venta— donde bajar con la rueda para ver el pie no tiene sentido.
   */
  altoFijo?: boolean;
}

/**
 * Armazón del ERP 2.0.
 *
 * Reproduce las medidas del diseño de referencia, pero navega de verdad: los
 * enlaces son reales, se filtran por los permisos del rol, la sede y el usuario
 * salen de sus stores y los contadores de WhatsApp y notificaciones consultan
 * la base. Un armazón bonito que no lleva a ningún lado es peor que el que ya
 * había.
 */
export default function ErpShell({
  children,
  variant = 'claro',
  buscador = 'Buscar...',
  lema = ['Nuestro equipo', 'hace que todo', 'avance'],
  lemaPie = ['Personas, procesos', 'y resultados.'],
  subnav,
  subnavActivo,
  onSubnav,
  altoFijo = false,
}: ErpShellProps) {
  const oscuro = variant === 'oscuro';
  const pathname = usePathname();
  const { user } = useAppStore();
  const roleDefaults = useAppStore(s => s.roleDefaults);
  const { currentSede, availableSedes, setCurrentSede, canViewAll } = useSedeStore();
  const { setTheme, resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [cajon, setCajon] = useState(false);
  const [menuSede, setMenuSede] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [sinLeerWa, setSinLeerWa] = useState(0);
  const [notificaciones, setNotificaciones] = useState(0);
  const buscadorRef = useRef<HTMLInputElement>(null);

  // Marca que ya se hidrató. Los contadores, el nombre del usuario y la sede
  // sí dependen del navegador, y pintarlos en el servidor rompe la hidratación.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- guarda de hidratación
  useEffect(() => { setMounted(true); }, []);

  // Contadores en vivo. Si la consulta falla el badge simplemente no aparece:
  // un número de más en la campana no vale romper la pantalla completa.
  useEffect(() => {
    if (!supabase) return;
    let vivo = true;

    const contar = async () => {
      const [wa, notif] = await Promise.all([
        supabase!.from('conversaciones').select('mensajes_sin_leer'),
        supabase!.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false),
      ]);
      if (!vivo) return;
      const filas = (wa.data || []) as { mensajes_sin_leer: number | null }[];
      setSinLeerWa(filas.reduce((t, r) => t + (r.mensajes_sin_leer || 0), 0));
      setNotificaciones(notif.count || 0);
    };
    contar();

    const canal = supabase.channel('erp-shell-contadores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, contar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, contar)
      .subscribe();

    return () => { vivo = false; supabase?.removeChannel(canal); };
  }, []);

  // Ctrl+K enfoca el buscador, como anuncia la tecla de la barra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        buscadorRef.current?.focus();
      }
      if (e.key === 'Escape') { setCajon(false); setMenuSede(false); setMenuUsuario(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // El cajón móvil se cierra al tocar un enlace, no con un efecto sobre la
  // ruta: así no hay un render extra en cada navegación.

  const permisos = getPermisos(user?.rol || 'empleado', user?.permisos, roleDefaults);
  const esAdmin = resolveRol(user?.rol) === 'admin';

  const items = useMemo(() => NAV.filter(i => {
    if (esAdmin || !i.permKey) return true;
    return hasPermiso(permisos[i.permKey]);
  }), [esAdmin, permisos]);

  const activo = (i: NavItem) =>
    i.prefijo ? pathname.startsWith(i.href) : pathname === i.href;

  const rolMeta = getRoleMeta(resolveRol(user?.rol));
  const puedeCambiarSede = canViewAll() && availableSedes.length > 1;

  // Cerrar sesión pregunta antes. Con una orden a medio escribir, un clic por
  // descuido en el menú tiraba todo el trabajo sin avisar.
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const cerrarSesion = async () => {
    setSaliendo(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  // ── Barra lateral ──────────────────────────────────────────────────────
  const lateral = (
    <>
      <div className={cn('flex items-center gap-2.5 px-4 pb-3.5 pt-4', oscuro && 'pb-3')}>
        <img src="/Nuevo_Lycos_LOGO.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0 leading-none">
          <p className={cn('text-[17.5px] font-extrabold tracking-tight', oscuro ? 'text-white' : 'text-[#16181d]')}>
            Lycos <span className="text-[#f97316]">Team</span>
          </p>
          <p className={cn('mt-1 text-[8.5px] font-semibold tracking-[0.16em]', oscuro ? 'text-[#6f7480]' : 'text-[#9ba1ab]')}>
            ERP AUTOMOTRIZ
          </p>
        </div>
        <button
          onClick={() => setCajon(false)}
          aria-label="Cerrar menú"
          className={cn('ml-auto rounded-lg p-1.5 lg:hidden', oscuro ? 'text-[#9ba1ab] hover:bg-white/10' : 'text-[#5b616e] hover:bg-[#f4f5f7]')}
        >
          <X className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {items.map(i => {
          const Icon = i.icon;
          const act = activo(i);
          const badge = i.label === 'WhatsApp' && mounted && sinLeerWa > 0 ? String(sinLeerWa) : null;
          return (
            <div key={i.href}>
            <Link
              href={i.href}
              onClick={() => setCajon(false)}
              aria-current={act ? 'page' : undefined}
              className={cn(
                'flex h-[36px] w-full items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors',
                act
                  ? 'bg-[#f97316] font-semibold text-white'
                  : oscuro
                    ? 'text-[#c9ccd3] hover:bg-white/[0.06] hover:text-white'
                    : 'text-[#5b616e] hover:bg-[#f4f5f7] hover:text-[#16181d]',
              )}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
              <span className="flex-1 truncate text-left">{i.label}</span>
              {badge && (
                <span className={cn(
                  'flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  act ? 'bg-white text-[#f97316]' : 'bg-[#f97316] text-white',
                )}>
                  {badge}
                </span>
              )}
            </Link>

              {/* Sub-secciones del módulo abierto, como en el diseño. */}
              {act && subnav && subnav.length > 0 && (
                <div className="mb-1 mt-0.5 space-y-0.5">
                  {subnav.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => onSubnav?.(sub.id)}
                      aria-current={sub.id === subnavActivo ? 'true' : undefined}
                      className={cn(
                        'flex h-[26px] w-full items-center rounded-md pl-[42px] pr-3 text-left text-[12.5px] transition-colors',
                        sub.id === subnavActivo
                          ? 'font-semibold text-[#f97316]'
                          : oscuro
                            ? 'text-[#9ba0aa] hover:text-white'
                            : 'text-[#8a909c] hover:text-[#16181d]',
                      )}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Tarjeta de marca. Sin la foto del equipo queda el fondo reservado. */}
      <div className="relative mx-3 mb-3 h-[150px] shrink-0 overflow-hidden rounded-xl bg-[#17181c]">
        <div aria-hidden className="absolute inset-y-0 -right-6 w-[92px] -skew-x-[14deg] bg-gradient-to-b from-[#2a2c33] to-[#1b1d22]" />
        <div aria-hidden className="absolute -left-2 top-0 h-[54px] w-[54px] rotate-[38deg] bg-gradient-to-br from-[#f97316]/70 to-transparent" />
        <div className="relative p-3.5">
          <p className="text-[13.5px] font-extrabold leading-[1.2] text-white">
            {lema.map((l, i) => <span key={i} className="block">{l}</span>)}
          </p>
          <p className="mt-2.5 text-[10.5px] leading-snug text-[#9ba1ab]">
            {lemaPie.map((l, i) => <span key={i} className="block">{l}</span>)}
          </p>
        </div>
      </div>

      <div className={cn('flex items-center gap-2.5 border-t px-4 py-3', oscuro ? 'border-white/[0.07]' : 'border-[#eef0f3]')}>
        <span className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          oscuro ? 'bg-white/10 text-white' : 'bg-[#17181c] text-white',
        )}>
          N
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className={cn('truncate text-[12px] font-semibold', oscuro ? 'text-white' : 'text-[#16181d]')}>Lycos Team ERP</p>
          <p className={cn('text-[10.5px]', oscuro ? 'text-[#6f7480]' : 'text-[#9ba1ab]')}>v2.0.0</p>
        </div>
        <button
          onClick={() => setConfirmandoSalida(true)}
          aria-label="Cerrar sesión"
          className={cn('rounded-lg p-1.5 transition-colors', oscuro ? 'text-[#6f7480] hover:bg-white/10 hover:text-[#f87171]' : 'text-[#9ba1ab] hover:bg-[#f4f5f7] hover:text-[#dc2626]')}
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </>
  );

  // ── Mientras manda la barra de siempre, este armazón no dibuja la suya ──
  //
  // Se queda solo con el contenido: la barra lateral y la cabecera las pone
  // `DashboardLayout`, que es quien envuelve todas las pantallas. Así una
  // pantalla ya migrada se ve igual que el resto en lugar de enseñar una
  // navegación distinta —o las dos a la vez—.
  //
  // Nada de lo migrado se pierde: en cuanto `USAR_ARMAZON_NUEVO` valga true,
  // estas pantallas vuelven a montar su armazón sin tocar una línea.
  if (!USAR_ARMAZON_NUEVO) {
    return (
      <>
        <div className={cn(
          'min-w-0',
          // Con alto fijo la pantalla se ajusta a lo que queda de ventana bajo
          // la cabecera del armazón de siempre, para que desplace por dentro
          // igual que hacía con el nuevo.
          altoFijo && 'flex max-h-[calc(100dvh-150px)] min-h-[520px] flex-col overflow-hidden',
        )}>
          {children}
        </div>

        <ModalCerrarSesion
          abierto={confirmandoSalida}
          ocupado={saliendo}
          onCerrar={() => setConfirmandoSalida(false)}
          onConfirmar={cerrarSesion}
        />
      </>
    );
  }

  return (
    <div className={cn('flex min-h-dvh', oscuro ? 'bg-[#f6f7f9] text-[#16181d]' : 'bg-[#f6f7f9] text-[#16181d]')}>
      {/* Escritorio */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 hidden w-[222px] flex-col lg:flex',
        oscuro ? 'bg-[#17181c]' : 'border-r border-[#e8eaed] bg-white',
      )}>
        {lateral}
      </aside>

      {/* Móvil */}
      {cajon && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setCajon(false)} aria-hidden />
          <aside className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col lg:hidden',
            oscuro ? 'bg-[#17181c]' : 'bg-white',
          )}>
            {lateral}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:ml-[222px]">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[#e8eaed] bg-white px-4">
          <button
            onClick={() => setCajon(true)}
            aria-label="Abrir menú"
            className="rounded-lg p-2 text-[#5b616e] hover:bg-[#f4f5f7] lg:hidden"
          >
            <Menu className="h-[18px] w-[18px]" aria-hidden />
          </button>

          <div className="relative w-full max-w-[500px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
            <input
              ref={buscadorRef}
              placeholder={buscador}
              aria-label="Búsqueda"
              className="h-[42px] w-full rounded-lg bg-[#f4f5f7] pl-10 pr-[74px] text-[13px] text-[#16181d] outline-none placeholder:text-[#9ba1ab] focus:ring-2 focus:ring-[#f97316]/30"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[#e2e5ea] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#9ba1ab] sm:block">
              Ctrl + K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Sede */}
            <div className="relative hidden md:block">
              <button
                onClick={() => puedeCambiarSede && setMenuSede(v => !v)}
                disabled={!puedeCambiarSede}
                aria-expanded={puedeCambiarSede ? menuSede : undefined}
                className="flex h-[40px] max-w-[230px] items-center gap-2 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:hover:bg-transparent"
              >
                <MapPin className="h-[15px] w-[15px] shrink-0 text-[#f97316]" aria-hidden />
                <span className="truncate">{mounted ? currentSede?.nombre || 'Sin sede' : 'Sede'}</span>
                {puedeCambiarSede && <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-[#9ba1ab]" aria-hidden />}
              </button>

              {menuSede && puedeCambiarSede && (
                <div className="absolute right-0 top-[46px] z-30 w-[230px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                  {availableSedes.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setCurrentSede(s); setMenuSede(false); }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[#f6f7f9]',
                        s.id === currentSede?.id ? 'font-semibold text-[#f97316]' : 'text-[#3d4350]',
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{s.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/dashboard/actividad"
              className="relative rounded-lg p-2 text-[#5b616e] hover:bg-[#f4f5f7]"
              aria-label={notificaciones > 0 ? `Notificaciones (${notificaciones} sin leer)` : 'Notificaciones'}
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden />
              {mounted && notificaciones > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#ef4444] px-[3px] text-[9.5px] font-bold text-white">
                  {notificaciones > 9 ? '9+' : notificaciones}
                </span>
              )}
            </Link>

            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-[#5b616e] hover:bg-[#f4f5f7]"
              aria-label="Cambiar tema"
            >
              {mounted && resolvedTheme === 'dark'
                ? <Sun className="h-[18px] w-[18px]" aria-hidden />
                : <Moon className="h-[18px] w-[18px]" aria-hidden />}
            </button>

            {/* Usuario */}
            <div className="relative">
              <button
                onClick={() => setMenuUsuario(v => !v)}
                aria-expanded={menuUsuario}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-[#f4f5f7]"
              >
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f97316] text-[14px] font-bold text-white">
                      {mounted ? getInitials(user?.nombre || 'Usuario') : 'U'}
                    </span>
                  )}
                <span className="hidden leading-tight sm:block">
                  <span className="block max-w-[130px] truncate text-[12.5px] font-semibold text-[#16181d]">
                    {mounted ? user?.nombre || 'Usuario' : 'Usuario'}
                  </span>
                  <span className="block text-[10.5px] text-[#9ba1ab]">
                    {mounted ? rolMeta?.label || user?.rol || '' : ''}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[#9ba1ab]" aria-hidden />
              </button>

              {menuUsuario && (
                <div className="absolute right-0 top-[50px] z-30 w-[210px] overflow-hidden rounded-lg border border-[#e8eaed] bg-white py-1 shadow-lg">
                  <Link href="/dashboard/perfil" onClick={() => setMenuUsuario(false)} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]">
                    <UserCircle className="h-4 w-4" aria-hidden />
                    Mi perfil
                  </Link>
                  <Link href="/dashboard/configuracion" onClick={() => setMenuUsuario(false)} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-[#3d4350] hover:bg-[#f6f7f9]">
                    <Settings className="h-4 w-4" aria-hidden />
                    Configuración
                  </Link>
                  <button onClick={() => { setMenuUsuario(false); setConfirmandoSalida(true); }} className="flex w-full items-center gap-2.5 border-t border-[#f2f3f5] px-3 py-2 text-left text-[12.5px] text-[#dc2626] hover:bg-[#fdeaea]">
                    <LogOut className="h-4 w-4" aria-hidden />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* `min-h-0` es lo que permite que una pantalla se ajuste al alto de la
            ventana y desplace por dentro. Sin él, el contenido empuja el
            contenedor y el scroll acaba siendo el de la página entera. */}
        <main className={cn('min-w-0 flex-1 px-4 py-4', altoFijo && 'flex min-h-0 flex-col overflow-hidden')}>
          {children}
        </main>
      </div>

      {/* Todo módulo que el diseño no lista sigue a un clic de aquí. */}
      <LauncherFab />

      <ModalCerrarSesion
        abierto={confirmandoSalida}
        ocupado={saliendo}
        onCerrar={() => setConfirmandoSalida(false)}
        onConfirmar={cerrarSesion}
      />
    </div>
  );
}
