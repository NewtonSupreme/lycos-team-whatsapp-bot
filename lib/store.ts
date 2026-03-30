'use client';
import { create } from 'zustand';
import { User, Notification } from '@/types';

interface AppStore {
  user: User | null;
  sidebarOpen: boolean;
  notifications: Notification[];
  unreadCount: number;
  pushRegistered: boolean;
  setUser: (user: User | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  addNotification: (notif: Omit<Notification, 'id' | 'created_at'>) => void;
  markAllRead: () => void;
  setPushRegistered: (val: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: {
    id: '1',
    email: 'admin@lycosteam.com',
    nombre: 'Administrador',
    rol: 'admin',
    created_at: new Date().toISOString(),
  },
  // En móvil (< 1024px) iniciamos cerrado; en desktop abierto
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  notifications: [],
  unreadCount: 0,
  pushRegistered: false,

  setUser: (user) => set({ user }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setPushRegistered: (val) => set({ pushRegistered: val }),

  addNotification: (notif) =>
    set((state) => ({
      notifications: [
        { ...notif, id: Date.now().toString(), created_at: new Date().toISOString() },
        ...state.notifications,
      ].slice(0, 50), // max 50 notificaciones
      unreadCount: state.unreadCount + (notif.leida ? 0 : 1),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, leida: true })),
      unreadCount: 0,
    })),
}));
