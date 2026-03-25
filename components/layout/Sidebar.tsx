'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Car, Wrench, Calendar, MessageSquare,
  Bot, FileText, Settings, ChevronLeft, ChevronRight,
  Activity, LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', badge: null },
  { href: '/dashboard/clientes', icon: Users, label: 'Clientes', badge: null },
  { href: '/dashboard/vehiculos', icon: Car, label: 'Vehículos', badge: null },
  { href: '/dashboard/servicios', icon: Wrench, label: 'Servicios', badge: '3' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda', badge: null },
  { href: '/dashboard/whatsapp', icon: MessageSquare, label: 'WhatsApp', badge: '5' },
  { href: '/dashboard/ia', icon: Bot, label: 'IA Asistente', badge: null },
  { href: '/dashboard/reportes', icon: FileText, label: 'Reportes', badge: null },
  { href: '/dashboard/actividad', icon: Activity, label: 'Actividad', badge: null },
];

const bottomItems = [
  { href: '/dashboard/configuracion', icon: Settings, label: 'Configuración' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, user } = useAppStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-full flex flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-60' : 'w-16',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className={cn('flex items-center gap-3 p-4 border-b border-border/30', !sidebarOpen && 'justify-center px-2')}>
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden",
            !sidebarOpen && "w-9 h-9"
          )}>
            <img 
              src="/logo-icon-white.png" 
              alt="Logo" 
              className="w-8 h-8 object-contain truck-anim"
            />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
                LYCOS TEAM
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Taller Pro
              </span>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, icon: Icon, label, badge }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'sidebar-item group relative',
                  isActive && 'active',
                  !sidebarOpen && 'justify-center px-2'
                )}
                title={!sidebarOpen ? label : undefined}
              >
                <Icon className={cn('flex-shrink-0 w-4 h-4', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                {sidebarOpen && (
                  <span className={cn('flex-1 text-sm', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
                    {label}
                  </span>
                )}
                {sidebarOpen && badge && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                    {badge}
                  </span>
                )}
                {!sidebarOpen && badge && (
                  <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground font-bold">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-2 border-t border-border/30 space-y-0.5">
          {bottomItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn('sidebar-item group', pathname === href && 'active', !sidebarOpen && 'justify-center px-2')}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon className="flex-shrink-0 w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              {sidebarOpen && <span className="text-sm text-muted-foreground group-hover:text-foreground">{label}</span>}
            </Link>
          ))}

          {/* User info */}
          <div className={cn('flex items-center gap-2 px-2 py-2 mt-1 rounded-lg', !sidebarOpen && 'justify-center')}>
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarFallback className="text-[10px]">
                {mounted && user ? getInitials(user.nombre) : 'AD'}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && mounted && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user?.nombre || 'Admin'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
            {sidebarOpen && !mounted && (
              <div className="flex-1 min-w-0">
                <div className="h-3 w-16 bg-muted animate-pulse rounded mb-1" />
                <div className="h-2 w-24 bg-muted animate-pulse rounded" />
              </div>
            )}
          </div>

          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
            className={cn(
              'sidebar-item group w-full text-left mt-1 hover:bg-red-500/10 hover:text-red-400 pb-20 lg:pb-2',
              !sidebarOpen && 'justify-center px-2'
            )}
            title={!sidebarOpen ? 'Cerrar Sesión' : undefined}
          >
            <LogOut className="flex-shrink-0 w-4 h-4 text-muted-foreground group-hover:text-red-400" />
            {sidebarOpen && <span className="text-sm text-muted-foreground group-hover:text-red-400">Cerrar Sesión</span>}
          </button>
        </div>

        {/* Toggle button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-md hidden lg:flex"
        >
          {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </aside>
    </>
  );
}
