'use client';
import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="min-h-screen bg-background dot-pattern">
      <Sidebar />
      <div className={cn(
        'flex flex-col min-h-screen transition-all duration-300',
        sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'
      )}>
        <Header />
        <main className="flex-1 p-4 md:p-6">
          <div className="page-enter">
            {children}
          </div>
        </main>
        <footer className="px-6 py-3 border-t border-border/20 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>© 2024 Lycos Team · Desarrollado por Leandro Márquez</span>
          <span className="flex items-center gap-1">Sistema v1.0 · <span className="text-green-400">● Online</span></span>
        </footer>
      </div>
    </div>
  );
}
