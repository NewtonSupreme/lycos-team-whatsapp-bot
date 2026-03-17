'use client';
import { create } from 'zustand';
import { User, Notification } from '@/types';

interface AppStore {
  user: User | null;
  sidebarOpen: boolean;
  notifications: Notification[];
  unreadCount: number;
  setUser: (user: User | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  addNotification: (notif: Omit<Notification, 'id' | 'created_at'>) => void;
  markAllRead: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: {
    id: '1',
    email: 'admin@lycosteam.com',
    nombre: 'Administrador',
    rol: 'admin',
    created_at: new Date().toISOString(),
  },
  sidebarOpen: true,
  notifications: [
    { id: '1', tipo: 'info', titulo: 'Nuevo mensaje', mensaje: 'Carlos R. pregunta sobre cambio de aceite', leida: false, created_at: new Date().toISOString() },
    { id: '2', tipo: 'success', titulo: 'Servicio completado', mensaje: 'Chevrolet Aveo listo para entrega', leida: false, created_at: new Date().toISOString() },
    { id: '3', tipo: 'warning', titulo: 'Cita pendiente', mensaje: 'Recordatorio: Cita mañana 9:00 AM', leida: true, created_at: new Date().toISOString() },
  ],
  unreadCount: 2,

  setUser: (user) => set({ user }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  addNotification: (notif) =>
    set((state) => ({
      notifications: [
        { ...notif, id: Date.now().toString(), created_at: new Date().toISOString() },
        ...state.notifications,
      ],
      unreadCount: state.unreadCount + (notif.leida ? 0 : 1),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, leida: true })),
      unreadCount: 0,
    })),
}));
