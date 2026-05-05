import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Sede {
  id: string;
  nombre: string;
  es_principal: boolean;
}

interface SedeState {
  currentSede: Sede | null;
  availableSedes: Sede[];
  userRole: 'admin' | 'gerente' | 'empleado' | null;
  setCurrentSede: (sede: Sede) => void;
  setAvailableSedes: (sedes: Sede[]) => void;
  setUserRole: (role: 'admin' | 'gerente' | 'empleado' | null) => void;
  // Admin and Principal can view all
  canViewAll: () => boolean;
}

export const useSedeStore = create<SedeState>()(
  persist(
    (set, get) => ({
      currentSede: null,
      availableSedes: [],
      userRole: null,
      setCurrentSede: (sede) => set({ currentSede: sede }),
      setAvailableSedes: (sedes) => set({ availableSedes: sedes }),
      setUserRole: (role) => set({ userRole: role }),
      canViewAll: () => {
        const state = get();
        if (state.userRole === 'admin') return true;
        // If they have access to a 'principal' sede, they might view all (optional logic)
        if (state.availableSedes.some(s => s.es_principal)) return true;
        return false;
      }
    }),
    {
      name: 'sede-storage',
    }
  )
);
