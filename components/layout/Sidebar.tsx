'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Car, Wrench, Calendar, MessageSquare, Monitor,
  Bot, FileText, Settings, ChevronLeft, ChevronRight,
  Activity, LogOut, TrendingUp, UserCircle, Package, Calculator, ShoppingCart, Trash2, Truck, Shield,
  FileSpreadsheet, Receipt, Info, Banknote, ClipboardList, Landmark, IdCard
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { getPermisos, hasPermiso, resolveRol, type Permisos } from '@/types';

type NavGroup = 'Operacion' | 'Clientes' | 'Ventas' | 'Inventario' | 'Finanzas' | 'Sistema';

interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge: string | null;
  permKey?: keyof Permisos;
  group: NavGroup;
  soloMaestro?: boolean;
}

/** Orden de los grupos en la barra. Refleja el flujo de trabajo del taller. */
const GROUP_ORDER: readonly NavGroup[] = [
  'Operacion', 'Clientes', 'Ventas', 'Inventario', 'Finanzas', 'Sistema',
];

const GROUP_LABEL: Record<NavGroup, string> = {
  Operacion: 'Operación',
  Clientes: 'Clientes',
  Ventas: 'Ventas',
  Inventario: 'Inventario',
  Finanzas: 'Finanzas',
  Sistema: 'Sistema',
};

const navItemsConfig: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Panel', badge: null, permKey: 'dashboard', group: 'Operacion' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda', badge: null, permKey: 'agenda', group: 'Operacion' },
  { href: '/dashboard/taller', icon: Wrench, label: 'Taller', badge: null, permKey: 'taller', group: 'Operacion' },
  { href: '/pantalla-taller', icon: Monitor, label: 'Pantalla del taller', badge: null, permKey: 'taller', group: 'Operacion' },
  { href: '/dashboard/servicios', icon: Wrench, label: 'Servicios', badge: null, permKey: 'servicios', group: 'Operacion' },
  { href: '/dashboard/ficha', icon: ClipboardList, label: 'Ficha del vehículo', badge: null, permKey: 'servicios', group: 'Operacion' },

  { href: '/dashboard/clientes', icon: Users, label: 'Clientes', badge: null, permKey: 'clientes', group: 'Clientes' },
  { href: '/dashboard/vehiculos', icon: Car, label: 'Vehículos', badge: null, permKey: 'vehiculos', group: 'Clientes' },
  { href: '/dashboard/whatsapp', icon: MessageSquare, label: 'WhatsApp', badge: null, permKey: 'whatsapp', group: 'Clientes' },
  { href: '/dashboard/leads', icon: TrendingUp, label: 'Leads', badge: null, permKey: 'leads', group: 'Clientes' },

  { href: '/dashboard/silenciadores', icon: ShoppingCart, label: 'Punto de venta', badge: null, permKey: 'ventas', group: 'Ventas' },
  { href: '/dashboard/facturas', icon: Receipt, label: 'Facturas', badge: null, permKey: 'ventas', group: 'Ventas' },
  { href: '/dashboard/presupuestos', icon: FileSpreadsheet, label: 'Presupuestos', badge: null, permKey: 'presupuestos', group: 'Ventas' },

  { href: '/dashboard/inventario', icon: Package, label: 'Inventario', badge: null, permKey: 'inventario', group: 'Inventario' },
  { href: '/dashboard/distribuidor', icon: Truck, label: 'Distribución', badge: null, permKey: 'distribuidor', group: 'Inventario' },
  { href: '/dashboard/proveedores', icon: Truck, label: 'Proveedores', badge: null, permKey: 'distribuidor', group: 'Inventario' },
  { href: '/dashboard/inventario/papelera', icon: Trash2, label: 'Papelera', badge: null, permKey: 'papelera', group: 'Inventario' },

  { href: '/dashboard/nomina', icon: Banknote, label: 'Nómina', badge: null, permKey: 'nomina', group: 'Finanzas' },
  { href: '/dashboard/taller/carnets', icon: IdCard, label: 'Carnets del taller', badge: null, permKey: 'nomina', group: 'Finanzas', soloMaestro: true },
  { href: '/dashboard/finanzas', icon: Landmark, label: 'Finanzas', badge: null, permKey: 'reportes', group: 'Finanzas' },
  { href: '/dashboard/reportes', icon: FileText, label: 'Reportes', badge: null, permKey: 'reportes', group: 'Finanzas' },
  { href: '/dashboard/calculadora', icon: Calculator, label: 'Calculadora', badge: null, permKey: 'calculadora', group: 'Finanzas' },

  { href: '/dashboard/ia', icon: Bot, label: 'Asistente IA', badge: null, permKey: 'ia_asistente', group: 'Sistema' },
  { href: '/dashboard/actividad', icon: Activity, label: 'Actividad', badge: null, permKey: 'actividad', group: 'Sistema' },
];

/** Ajustes y cuenta. Van al pie, fuera de los grupos de trabajo. */
const bottomItems: Omit<NavItem, 'group'>[] = [
  { href: '/dashboard/configuracion', icon: Settings, label: 'Configuración', badge: null, permKey: 'configuracion' },
  { href: '/dashboard/ajustes/empleados', icon: Users, label: 'Recursos Humanos', badge: null, permKey: 'empleados' },
  { href: '/dashboard/ajustes/permisos', icon: Shield, label: 'Permisos por Rol', badge: null, permKey: 'empleados' },
  { href: '/dashboard/informacion', icon: Info, label: 'Información', badge: null },
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
  const isAdmin = resolveRol(user?.rol) === 'admin';

  const canAccess = (permKey?: keyof Permisos): boolean => {
    if (isAdmin) return true;
    if (!permKey) return true;
    return hasPermiso(permisos[permKey]);
  };

  const navItems = navItemsConfig
    .filter(item => {
      if (!canAccess(item.permKey)) return false;
      // Los carnets llevan el código de cada trabajador: solo el Usuario Maestro.
      if (item.soloMaestro && !isAdmin) return false;
      if (item.label === 'Leads' && mounted) {
        const { currentSede } = useSedeStore.getState();
        const sedeName = currentSede?.nombre?.toLowerCase() || '';
        if (!sedeName.includes('san antonio')) return false;
      }
      // Distribuidor: el permiso `distribuidor` ya se validó arriba (canAccess).
      // Aquí solo restringimos por sede: la distribución se origina en Carrizal
      // (sede principal) y las ganancias también las ve el dueño/admin/supervisor
      // desde San Antonio. Otras sedes no ven el módulo.
      if (item.label === 'Distribuidor' && mounted) {
        const { currentSede, availableSedes } = useSedeStore.getState();
        const sedeName = currentSede?.nombre?.toLowerCase() || '';
        const sedeData = availableSedes.find(s => s.id === currentSede?.id);
        const sedePermitida = sedeName.includes('carrizal') || sedeName.includes('san antonio') || !!sedeData?.es_principal;
        if (!sedePermitida) return false;
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
              <span className="font-display text-sm font-bold tracking-tight">
                Lycos Team
              </span>
              <span className="text-xs text-muted-foreground">
                Gestión de taller
              </span>
            </div>
          )}
        </div>

        <nav aria-label="Navegación principal" className="flex-1 space-y-4 overflow-y-auto p-2">
          {GROUP_ORDER.map(group => {
            const items = navItems.filter(i => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="space-y-0.5">
                {sidebarOpen ? (
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABEL[group]}
                  </p>
                ) : (
                  <div className="mx-auto my-2 h-px w-6 bg-border" aria-hidden />
                )}
                {items.map(({ href, icon: Icon, label, badge }) => {
                  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={!sidebarOpen ? label : undefined}
                      title={!sidebarOpen ? label : undefined}
                      className={cn(
                        'sidebar-item group relative',
                        isActive && 'active',
                        !sidebarOpen && 'justify-center px-2',
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      />
                      {sidebarOpen && <span className="flex-1 truncate">{label}</span>}
                      {badge && (
                        sidebarOpen ? (
                          <span className="num ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                            {badge}
                          </span>
                        ) : (
                          <span
                            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
                            aria-label={`${badge} sin leer`}
                          />
                        )
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-2 border-t border-border/30 space-y-0.5">
          {visibleBottomItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn('sidebar-item group', pathname === href && 'active', !sidebarOpen && 'justify-center px-2')}
              aria-current={pathname === href ? 'page' : undefined}
              aria-label={!sidebarOpen ? label : undefined}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon aria-hidden className="h-4 w-4 flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </Link>
          ))}

          <div className={cn('flex items-center gap-2 px-2 py-2 mt-1 rounded-lg', !sidebarOpen && 'justify-center')}>
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="text-xs">
                {mounted && user ? getInitials(user.nombre) : 'AD'}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && mounted && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{user?.nombre || 'Admin'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
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
