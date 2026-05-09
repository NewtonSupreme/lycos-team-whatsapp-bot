'use client';
import React, { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { useAppStore } from '@/lib/store';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, setUser, user } = useAppStore();
  const { setAvailableSedes, setUserRole, setCurrentSede, currentSede } = useSedeStore();

  // En móvil (< 1024px), cerrar sidebar automáticamente al montar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    // Set on mount
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarOpen]);

  // Load real user from session
  useEffect(() => {
    // First try sessionStorage (set right after login, fastest)
    try {
      const cached = sessionStorage.getItem('lycos_user');
      if (cached) {
        const u = JSON.parse(cached);
        setUser({ 
          id: u.id || u.username, 
          username: u.username, 
          email: u.email || `${u.username}@lycosteam.com`, 
          nombre: u.nombre, 
          rol: u.rol, 
          avatar_url: u.avatar_url,
          created_at: '' 
        });
        return;
      }
    } catch { /* ignore */ }

    // Fallback: fetch from server
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(({ user }) => {
        if (user) {
          setUser({ 
            id: user.id || user.username, 
            username: user.username, 
            email: user.email || `${user.username}@lycosteam.com`, 
            nombre: user.nombre, 
            rol: user.rol, 
            avatar_url: user.avatar_url,
            created_at: '' 
          });
          sessionStorage.setItem('lycos_user', JSON.stringify(user));
        }
      })
      .catch(() => {});
  }, [setUser]);

  // Load Sede Data
  useEffect(() => {
    async function loadSedes() {
      if (!user?.id) return;
      
      if (!supabase) return;
      // 1. Get user role and assigned sede directly from usuarios table
      const { data: userSede } = await supabase
        .from('usuarios')
        .select('sede_id, rol')
        .eq('id', user.id)
        .single();
        
      if (userSede) {
        setUserRole(userSede.rol as any);
      } else {
        // Fallback or Admin default
        setUserRole(user.rol === 'admin' ? 'admin' : 'empleado');
      }

      if (!supabase) return;
      // 2. Get all sedes
      const { data: sedesData } = await supabase.from('sedes').select('*');
      if (sedesData) {
        setAvailableSedes(sedesData);
        
        // Auto-select sede based on user assignment (force once per user session)
        const miSede = userSede?.sede_id ? sedesData.find(s => s.id === userSede.sede_id) : null;
        const sessionKey = `sede_synced_${user.id}`;
        const isSynced = sessionStorage.getItem(sessionKey);

        if (!isSynced && miSede) {
          // If it's a new session for this user, FORCE their assigned sede
          setCurrentSede(miSede);
          sessionStorage.setItem(sessionKey, 'true');
          console.log(`📍 Sede auto-seleccionada por usuario: ${miSede.nombre}`);
        } else if (!currentSede) {
          // Fallback only if nothing is selected and no assignment found
          const principal = miSede || sedesData.find(s => s.es_principal) || sedesData[0];
          if (principal) setCurrentSede(principal);
        }
      }
    }
    loadSedes();
  }, [user?.id]);

  return (
    <div suppressHydrationWarning className="min-h-screen bg-background dot-pattern">
      <Sidebar />
      <div className={cn(
        'flex flex-col min-h-screen transition-all duration-300',
        sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'
      )}>
        <Header />
        {/* pb-20 en móvil para que el bottom nav no tape el contenido */}
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-6">
          <div key={currentSede?.id} className="page-enter">
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
