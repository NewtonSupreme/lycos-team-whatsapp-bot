'use client';
import React, { useState } from 'react';
import { Bell, Search, Menu, X, Zap } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeTime, getInitials } from '@/lib/utils';

export default function Header() {
  const { user, sidebarOpen, toggleSidebar, notifications, unreadCount, markAllRead } = useAppStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-border/30 bg-card/40 backdrop-blur-xl sticky top-0 z-20">
      {/* Mobile menu */}
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={toggleSidebar}>
        {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </Button>

      {/* Search */}
      <div className={cn('flex-1 max-w-md transition-all duration-200', showSearch ? 'flex' : 'hidden md:flex')}>
        <Input
          placeholder="Buscar clientes, vehículos, servicios..."
          icon={<Search className="w-4 h-4" />}
          className="h-8 text-xs"
        />
      </div>

      <button className="md:hidden" onClick={() => setShowSearch(!showSearch)}>
        <Search className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="flex-1" />

      {/* Status pill */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400 font-medium">Bot activo</span>
      </div>

      {/* Notifications */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markAllRead(); }}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
              {unreadCount}
            </span>
          )}
        </Button>

        {showNotifs && (
          <div className="absolute right-0 top-10 w-80 rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <span className="text-sm font-semibold">Notificaciones</span>
              <span className="text-[10px] text-muted-foreground">{notifications.length} total</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'px-4 py-3 border-b border-border/20 hover:bg-white/3 transition-colors',
                    !n.leida && 'bg-primary/3'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      'mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                      n.tipo === 'success' ? 'bg-green-400' :
                      n.tipo === 'warning' ? 'bg-yellow-400' :
                      n.tipo === 'error' ? 'bg-red-400' : 'bg-blue-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{n.titulo}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{n.mensaje}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User */}
      <div className="flex items-center gap-2 pl-2 border-l border-border/30">
        <Avatar className="w-7 h-7">
          <AvatarFallback className="text-[10px]">
            {user ? getInitials(user.nombre) : 'AD'}
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:flex flex-col">
          <span className="text-xs font-medium leading-none">{user?.nombre || 'Admin'}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5">Administrador</span>
        </div>
      </div>
    </header>
  );
}
