'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, MessageSquare, Calendar, Wrench,
  MoreHorizontal, Users, Car, Bot, FileText, Activity, Settings, X, TrendingUp, LogOut, Package, Calculator, ShoppingCart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';

// Primary items shown in the bottom bar (max 4 + "more")
const PRIMARY_NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/dashboard/whatsapp', icon: MessageSquare, label: 'WhatsApp' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda' },
  { href: '/dashboard/servicios', icon: Wrench, label: 'Servicios' },
];

// Extra items shown in the "more" sheet
const MORE_NAV = [
  { href: '/dashboard/clientes', icon: Users, label: 'Clientes' },
  { href: '/dashboard/vehiculos', icon: Car, label: 'Vehículos' },
  { href: '/dashboard/leads', icon: TrendingUp, label: 'Leads' },
  { href: '/dashboard/taller', icon: Wrench, label: 'Taller' },
  { href: '/dashboard/silenciadores', icon: ShoppingCart, label: 'Ventas' },
  { href: '/dashboard/ia', icon: Bot, label: 'IA Asistente' },
  { href: '/dashboard/reportes', icon: FileText, label: 'Reportes' },
  { href: '/dashboard/actividad', icon: Activity, label: 'Actividad' },
  { href: '/dashboard/calculadora', icon: Calculator, label: 'Calculadora' },
  { href: '/dashboard/configuracion', icon: Settings, label: 'Configuración' },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useAppStore();
  const { currentSede } = useSedeStore();
  const [showMore, setShowMore] = useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const visibleMoreNav = MORE_NAV.filter(item => {
    if (item.label === 'Leads') {
      if (!mounted) return true;
      const sedeName = currentSede?.nombre?.toLowerCase() || '';
      return sedeName.includes('san antonio');
    }
    return true;
  });

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More sheet (bottom sheet) */}
      <div className={cn(
        'fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ease-out',
        showMore ? 'translate-y-0' : 'translate-y-full'
      )}>
        {/* Sheet drag handle + header */}
        <div className="bg-card/95 backdrop-blur-2xl border-t border-border/50 rounded-t-3xl shadow-2xl">
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <div className="w-10 h-1 rounded-full bg-border/50 mx-auto absolute left-1/2 -translate-x-1/2 -translate-y-1 top-2" />
            <p className="text-sm font-semibold">Más opciones</p>
            <button
              onClick={() => setShowMore(false)}
              className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 px-4 pb-6 pt-2" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            {visibleMoreNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl p-4 transition-all duration-200',
                    active
                      ? 'bg-primary/15 border border-primary/30'
                      : 'bg-muted/30 hover:bg-muted/60 border border-transparent'
                  )}
                >
                  <item.icon className={cn(
                    'w-5 h-5 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'text-[11px] font-medium text-center leading-tight',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}

            {/* Logout Button */}
            <button
              onClick={async () => {
                setShowMore(false);
                await fetch('/api/auth/logout', { method: 'POST' });
                // Optional: clear local session cache if any
                sessionStorage.removeItem('lycos_user');
                window.location.href = '/login';
              }}
              className="flex flex-col items-center gap-2 rounded-2xl p-4 transition-all duration-200 bg-red-500/10 hover:bg-red-500/20 border border-transparent group"
            >
              <LogOut className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-medium text-center leading-tight text-red-400">
                Cerrar Sesión
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="bg-card/90 backdrop-blur-2xl border-t border-border/30 shadow-2xl">
          <div className="flex items-center justify-around px-2 pt-1" style={{ paddingBottom: '8px' }}>
            {PRIMARY_NAV.map((item) => {
              const active = isActive(item.href);
              const isWa = item.href === '/dashboard/whatsapp';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[60px]',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {/* Active indicator pill */}
                  {active && (
                    <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                  )}

                  <div className="relative">
                    <item.icon className={cn(
                      'w-5 h-5 transition-all duration-200',
                      active ? 'scale-110' : 'scale-100'
                    )} />
                    {/* WhatsApp unread badge */}
                    {isWa && mounted && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>

                  <span className={cn(
                    'text-[10px] font-medium transition-all duration-200',
                    active ? 'text-primary' : ''
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}

            {/* More button */}
            <button
              onClick={() => setShowMore(true)}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[60px]',
                showMore ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">Más</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
