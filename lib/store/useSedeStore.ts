import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRoleMeta } from '@/types';

export interface Sede {
  id: string;
  nombre: string;
  es_principal: boolean;
}

// Quién puede ver y cambiar de sede: se deriva de `multiSede` del ROLE_CATALOG, la
// MISMA bandera que usa el chatbot para decidir el alcance de datos de cada rol. Así
// el panel y el bot nunca se contradicen.
// Hoy: solo Administración y Dueño. El resto (supervisor, atención al cliente,
// registrador y cualquier rol personalizado) queda fijo en su sede asignada.
function rolPuedeCambiarSede(rol: string | null): boolean {
  return !!rol && !!getRoleMeta(rol)?.multiSede;
}

interface SedeState {
  currentSede: Sede | null;
  availableSedes: Sede[];
  userRole: string | null;
  sedeRefreshKey: number;
  setCurrentSede: (sede: Sede) => void;
  setAvailableSedes: (sedes: Sede[]) => void;
  setUserRole: (role: string | null) => void;
  /** true solo para los roles multi-sede del catálogo (admin y dueño). */
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
      canViewAll: () => rolPuedeCambiarSede(get().userRole)
    }),
    {
      name: 'sede-storage',
    }
  )
);
