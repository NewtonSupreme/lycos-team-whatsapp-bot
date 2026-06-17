import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Sede {
  id: string;
  nombre: string;
  es_principal: boolean;
}

// Roles allowed to switch between/view all sedes.
// Only administrators have multi-sede access; every other role (incl. supervisor)
// is locked to their assigned sede for strict data isolation.
const SEDE_SWITCH_ROLES = ['admin'] as const;

interface SedeState {
  currentSede: Sede | null;
  availableSedes: Sede[];
  userRole: string | null;
  sedeRefreshKey: number;
  setCurrentSede: (sede: Sede) => void;
  setAvailableSedes: (sedes: Sede[]) => void;
  setUserRole: (role: string | null) => void;
  // Only admin / gerente (supervisor) can view & switch all sedes
  canViewAll: () => boolean;
}

export const useSedeStore = create<SedeState>()(
  persist(
    (set, get) => ({
      currentSede: null,
      availableSedes: [],
      userRole: null,
      sedeRefreshKey: 0,
      setCurrentSede: (sede) => set((state) => ({ currentSede: sede, sedeRefreshKey: state.sedeRefreshKey + 1 })),
      setAvailableSedes: (sedes) => set({ availableSedes: sedes }),
      setUserRole: (role) => set({ userRole: role }),
      canViewAll: () => {
        const state = get();
        // Strictly role-based: only admin and gerente (supervisor) can switch sedes.
        // A regular employee/técnico stays locked to their assigned sede.
        return SEDE_SWITCH_ROLES.includes(state.userRole as any);
      }
    }),
    {
      name: 'sede-storage',
    }
  )
);
