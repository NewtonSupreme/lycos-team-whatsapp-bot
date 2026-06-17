'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Car, Wrench, Calendar, MessageSquare,
  Bot, FileText, Settings, ChevronLeft, ChevronRight,
  Activity, LogOut, TrendingUp, UserCircle, Package, Calculator, ShoppingCart, Trash2, Truck, Shield,
  FileSpreadsheet, Receipt
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { getPermisos, hasPermiso, type Permisos } from '@/types';

interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge: string | null;
  permKey?: keyof Permisos;
}

const navItemsConfig: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', badge: null, permKey: 'dashboard' },
  { href: '/dashboard/clientes', icon: Users, label: 'Clientes', badge: null, permKey: 'clientes' },
  { href: '/dashboard/vehiculos', icon: Car, label: 'Vehículos', badge: null, permKey: 'vehiculos' },
  { href: '/dashboard/servicios', icon: Wrench, label: 'Servicios', badge: null, permKey: 'servicios' },
  { href: '/dashboard/taller', icon: Wrench, label: 'Taller', badge: null, permKey: 'taller' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda', badge: null, permKey: 'agenda' },
  { href: '/dashboard/whatsapp', icon: MessageSquare, label: 'WhatsApp', badge: null, permKey: 'whatsapp' },
  { href: '/dashboard/leads', icon: TrendingUp, label: 'Leads', badge: null, permKey: 'leads' },
  { href: '/dashboard/inventario', icon: Package, label: 'Inventario', badge: null, permKey: 'inventario' },
  { href: '/dashboard/inventario/papelera', icon: Trash2, label: 'Papelera', badge: null, permKey: 'papelera' },
  { href: '/dashboard/distribuidor', icon: Truck, label: 'Distribuidor', badge: null, permKey: 'distribuidor' },
  { href: '/dashboard/silenciadores', icon: ShoppingCart, label: 'Ventas', badge: null, permKey: 'ventas' },
  { href: '/dashboard/facturas', icon: Receipt, label: 'Facturas', badge: null, permKey: 'ventas' },
  { href: '/dashboard/presupuestos', icon: FileSpreadsheet, label: 'Presupuestos', badge: null, permKey: 'presupuestos' },
  { href: '/dashboard/ia', icon: Bot, label: 'IA Asistente', badge: null, permKey: 'ia_asistente' },
  { href: '/dashboard/reportes', icon: FileText, label: 'Reportes', badge: null, permKey: 'reportes' },
  { href: '/dashboard/actividad', icon: Activity, label: 'Actividad', badge: null, permKey: 'actividad' },
  { href: '/dashboard/calculadora', icon: Calculator, label: 'Calculadora', badge: null, permKey: 'calculadora' },
];

const bottomItems: NavItem[] = [
  { href: '/dashboard/configuracion', icon: Settings, label: 'Configuración', badge: null, permKey: 'configuracion' },
  { href: '/dashboard/ajustes/empleados', icon: Users, label: 'Gestión Empleados', badge: null, permKey: 'empleados' },
  { href: '/dashboard/ajustes/permisos', icon: Shield, label: 'Permisos por Rol', badge: null, permKey: 'empleados' },
  { href: '/dashboard/perfil', icon: UserCircle, label: 'Mi Perfil', badge: null },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, user } = useAppStore();
  const [mounted, setMounted] = React.useState(false);
  const [unreadWa, setUnreadWa] = React.useState(0);

  React.useEffect(() => {
    setMounted(true);
    
    const fetchUnread = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('conversaciones').select('mensajes_sin_leer');
      if (data) {
        setUnreadWa(data.reduce((acc, row) => acc + (row.mensajes_sin_leer || 0), 0));
      }
    };
    fetchUnread();

    if (!supabase) return;
    const channel = supabase.channel('sidebar-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, []);

  const roleDefaults = useAppStore(s => s.roleDefaults);
  const permisos = getPermisos(user?.rol || 'empleado', user?.permisos, roleDefaults);
  const isAdmin = user?.rol === 'admin';

  const canAccess = (permKey?: keyof Permisos): boolean => {
    if (isAdmin) return true;
    if (!permKey) return true;
    return hasPermiso(permisos[permKey]);
  };

  const navItems = navItemsConfig
    .filter(item => {
      if (!canAccess(item.permKey)) return false;
      if (item.label === 'Leads' && mounted) {
        const { currentSede } = useSedeStore.getState();
        const sedeName = currentSede?.nombre?.toLowerCase() || '';
        if (!sedeName.includes('san antonio')) return false;
      }
      // Distribuidor: only visible for Carrizal (principal) sede
      if (item.label === 'Distribuidor' && mounted) {
        const { currentSede, availableSedes } = useSedeStore.getState();
        const sedeName = currentSede?.nombre?.toLowerCase() || '';
        if (sedeName.includes('carrizal')) return true;
        const sedeData = availableSedes.find(s => s.id === currentSede?.id);
        if (!sedeData?.es_principal) return false;
      }
      return true;
    })
    .map(item => {
      if (item.label === 'WhatsApp') {
        return { ...item, badge: unreadWa > 0 ? unreadWa.toString() : null };
      }
      return item;
    });

  const visibleBottomItems = bottomItems.filter(item => canAccess(item.permKey));

  return (
    <>
      {mounted && sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-full flex flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl transition-all duration-300 ease-in-out',
          (mounted && sidebarOpen) ? 'w-60' : 'w-16',
          'lg:translate-x-0',
          (mounted && sidebarOpen) ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className={cn('flex items-center gap-3 p-4 border-b border-border/30', (mounted && !sidebarOpen) && 'justify-center px-2')}>
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden",
            (mounted && !sidebarOpen) && "w-9 h-9"
          )}>
            <img 
              src="/Nuevo_Lycos_LOGO copy.png" 
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

        <div className="p-2 border-t border-border/30 space-y-0.5">
          {visibleBottomItems.map(({ href, icon: Icon, label }) => (
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

          <div className={cn('flex items-center gap-2 px-2 py-2 mt-1 rounded-lg', !sidebarOpen && 'justify-center')}>
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarImage src={user?.avatar_url} />
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
