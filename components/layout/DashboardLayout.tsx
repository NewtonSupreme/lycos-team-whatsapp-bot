'use client';
import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, setUser, setRoleDefaults, user } = useAppStore();
  const { setAvailableSedes, setUserRole, setCurrentSede, currentSede } = useSedeStore();
  const [authLoading, setAuthLoading] = React.useState(true);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // En móvil (< 1024px), cerrar sidebar automáticamente al montar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarOpen]);

  // Load real user from session
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      // First try localStorage (set right after login, persists across tabs)
      try {
        const cached = localStorage.getItem('lycos_user');
        if (cached) {
          const u = JSON.parse(cached);
          if (u.sede_id) {
            setUser({ 
              id: u.id || u.username, 
              username: u.username, 
              email: u.email || `${u.username}@lycosteam.com`, 
              nombre: u.nombre, 
              rol: u.rol, 
              avatar_url: u.avatar_url,
              sede_id: u.sede_id,
              permisos: u.permisos,
              created_at: '' 
            });
            setAuthLoading(false);
            return;
          }
        }
      } catch { /* ignore */ }

      // Fallback: fetch from server
      try {
        const res = await fetch('/api/auth/me');
        const { user: serverUser } = await res.json();
        if (!cancelled) {
          if (serverUser) {
            const userData = { 
              id: serverUser.id || serverUser.username, 
              username: serverUser.username, 
              email: serverUser.email || `${serverUser.username}@lycosteam.com`, 
              nombre: serverUser.nombre, 
              rol: serverUser.rol, 
              avatar_url: serverUser.avatar_url,
              sede_id: serverUser.sede_id,
              permisos: serverUser.permisos,
              created_at: '' 
            };
            setUser(userData);
            localStorage.setItem('lycos_user', JSON.stringify(userData));
            setAuthLoading(false);
          } else {
            // No valid session — clear any stale cache and redirect to login
            localStorage.removeItem('lycos_user');
            setUser(null);
            setAuthLoading(false);
            router.replace('/login');
          }
        }
      } catch {
        if (!cancelled) {
          // Network error — if we have cached user, keep it; otherwise redirect
          const cached = localStorage.getItem('lycos_user');
          if (cached) {
            try {
              const u = JSON.parse(cached);
              if (u.sede_id) {
                setUser({ 
                  id: u.id || u.username, username: u.username,
                  email: u.email || `${u.username}@lycosteam.com`, nombre: u.nombre,
                  rol: u.rol, sede_id: u.sede_id, created_at: '' 
                });
                setAuthLoading(false);
                return;
              }
            } catch { /* ignore */ }
          }
          setUser(null);
          setAuthLoading(false);
        }
      }
    }

    loadUser();
    return () => { cancelled = true; };
  }, [setUser, router]);

  // Session keepalive — refresh cookie every 30 min while user is active
  useEffect(() => {
    if (!user) return;
    keepaliveRef.current = setInterval(async () => {
      try {
        // Calling /api/auth/me extends the cookie's maxAge via Set-Cookie
        await fetch('/api/auth/me');
      } catch { /* silent keepalive */ }
    }, 30 * 60 * 1000); // 30 minutes

    return () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
    };
  }, [user]);

  // Load Sede Data
  useEffect(() => {
    async function loadSedes() {
      if (!user?.id || !supabase) return;

      // 1. Set role immediately from user object
      setUserRole(user.rol as any);

      // 2. Get all available sedes
      const { data: sedesData } = await supabase.from('sedes').select('*').order('nombre', { ascending: true });
      if (sedesData) {
        setAvailableSedes(sedesData);
        
        // DEBUG LOGS
        console.log(`[Multi-Sede] Usuario: ${user.username}, Sede asignada (ID): ${user.sede_id}`);
        
        // Auto-select logic: Always prioritize user's assigned sede on FIRST load of the session
        const assignedSede = user.sede_id ? sedesData.find(s => s.id.toLowerCase() === user.sede_id?.toLowerCase()) : null;

        if (assignedSede) {
          // Force assigned sede on every load/refresh to ensure data isolation
          console.log(`📍 Sede inicial sincronizada: ${assignedSede.nombre}`);
          setCurrentSede(assignedSede);
        } else if (!currentSede) {
          // Fallback only if no selection exists and no assignment found
          const fallback = sedesData.find(s => s.es_principal) || sedesData[0];
          if (fallback) setCurrentSede(fallback);
        }
      }
    }
    loadSedes();
  }, [user?.id, user?.sede_id, setAvailableSedes, setUserRole, setCurrentSede]);

  const [mounted, setMounted] = React.useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Load role defaults from DB for permission UI
  useEffect(() => {
    fetch('/api/roles')
      .then(r => r.json())
      .then(({ roles }) => {
        if (roles) {
          const map: Record<string, any> = {};
          for (const role of roles) {
            if (role.permisos) {
              map[role.nombre] = role.permisos;
            }
          }
          setRoleDefaults(map);
        }
      })
      .catch(() => {});
  }, [setRoleDefaults]);

  if (authLoading) {
    return (
      <div suppressHydrationWarning className="min-h-screen bg-background flex items-center justify-center">
        <div suppressHydrationWarning className="flex flex-col items-center gap-4">
          <div suppressHydrationWarning className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Loader2 suppressHydrationWarning className="w-6 h-6 text-primary animate-spin" />
          </div>
          <p suppressHydrationWarning className="text-sm font-bold text-muted-foreground animate-pulse">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning className="min-h-screen bg-background dot-pattern overflow-x-hidden">
      <Sidebar />
      <div className={cn(
        'flex flex-col min-h-screen transition-all duration-300 overflow-x-hidden',
        (mounted && sidebarOpen) ? 'lg:ml-60' : 'lg:ml-16'
      )}>
        <Header />
        {/* pb-20 en móvil para que el bottom nav no tape el contenido */}
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-6">
          <div className="page-enter">
            {children}
          </div>
        </main>
        <footer className="hidden lg:flex px-6 py-3 border-t border-border/20 text-[10px] text-muted-foreground items-center justify-between">
          <span>© 2026 Lycos Team · Desarrollado por Leandro Márquez</span>
          <span className="flex items-center gap-2">
            <a href="/privacidad" className="hover:text-foreground transition-colors">Privacidad</a>
            <span>·</span>
            <a href="/terminos" className="hover:text-foreground transition-colors">Términos</a>
            <span>·</span>
            <span className="text-green-400">● Online</span>
          </span>
        </footer>
      </div>
      {/* Mobile bottom navigation — solo móvil, sidebar untouched */}
      <MobileBottomNav />
    </div>
  );
}
