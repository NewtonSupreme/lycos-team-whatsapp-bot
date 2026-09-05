import { useAppStore } from '@/lib/store';
import { getPermisos, hasPermiso, resolveRol, Permisos } from '@/types';

export function useRolePermissions() {
  const { user, roleDefaults } = useAppStore();
  
  // Administradores tienen acceso total por defecto.
  // `resolveRol` normaliza mayúsculas y rótulos heredados ("Administrador").
  const isAdmin = resolveRol(user?.rol) === 'admin';
  
  // Obtenemos el set de permisos resuelto para el usuario actual
  const permisos = getPermisos(user?.rol || 'empleado', user?.permisos, roleDefaults);

  // Evalúa si el usuario puede realizar una acción en un módulo específico
  const can = (modulo: keyof Permisos, accion: 'leer' | 'crear' | 'editar' | 'eliminar' = 'leer') => {
    if (isAdmin) return true;
    return hasPermiso(permisos[modulo], accion);
  };

  // Retorna todos los permisos CRUD de un módulo en un solo objeto
  const getModulePermissions = (modulo: keyof Permisos) => {
    if (isAdmin) {
      return { leer: true, crear: true, editar: true, eliminar: true };
    }
    return {
      leer: hasPermiso(permisos[modulo], 'leer'),
      crear: hasPermiso(permisos[modulo], 'crear'),
      editar: hasPermiso(permisos[modulo], 'editar'),
      eliminar: hasPermiso(permisos[modulo], 'eliminar'),
    };
  };

  return { can, getModulePermissions, isAdmin, permisos };
}
