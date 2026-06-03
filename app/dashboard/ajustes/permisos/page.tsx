"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { MODULES, normalizePermiso, accesoToCrud, type Permisos, type CrudPermiso, type PermisoValue } from "@/types";
import { Shield, Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react";

interface RoleData {
  id: string;
  nombre: string;
  label: string;
  permisos: Record<string, PermisoValue>;
}

export default function PermisosPage() {
  const { user, setRoleDefaults } = useAppStore();
  const isAdmin = user?.rol === 'admin';

  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Record<string, Permisos>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function fetchRoles() {
    setLoading(true);
    try {
      const res = await fetch('/api/roles');
      const { roles } = await res.json();
      if (roles) setRoles(roles);
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error cargando roles: ' + err.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoles();
  }, []);

  function getEffectivePermisos(role: RoleData): Permisos {
    const stored = role.permisos || {};
    const result: any = {};
    for (const mod of MODULES) {
      const val = stored[mod];
      result[mod] = val !== undefined ? normalizePermiso(val) : accesoToCrud(false);
    }
    return result as Permisos;
  }

  function getCurrentPermisos(role: RoleData): Permisos {
    if (edited[role.id]) return edited[role.id];
    return getEffectivePermisos(role);
  }

  function toggleCrud(roleId: string, module: string, action: keyof CrudPermiso) {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const current = { ...getCurrentPermisos(role) };
    const modPerm = normalizePermiso((current as any)[module]);
    const updated = {
      ...current,
      [module]: { ...modPerm, [action]: !modPerm[action] }
    };
    setEdited(prev => ({ ...prev, [roleId]: updated }));
    setMessage(null);
  }

  function restoreDefaults(roleId: string) {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const defaults = getEffectivePermisos(role);
    setEdited(prev => ({ ...prev, [roleId]: defaults }));
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const entries = Object.entries(edited);
    let successCount = 0;
    let errorCount = 0;

    for (const [roleId, permisos] of entries) {
      try {
        const payload: any = { permisos: {} };
        for (const mod of MODULES) {
          const p = (permisos as any)[mod];
          payload.permisos[mod] = p ? { ...p } : { crear: false, leer: false, editar: false, eliminar: false };
        }
        const res = await fetch(`/api/roles/${roleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Error al guardar');
        }
        successCount++;
      } catch (err: any) {
        errorCount++;
        console.error(`Error saving role ${roleId}:`, err);
      }
    }

    if (errorCount > 0) {
      setMessage({ type: 'error', text: `Se actualizaron ${successCount} roles, pero fallaron ${errorCount}.` });
    } else if (successCount > 0) {
      setMessage({ type: 'success', text: `Permisos actualizados correctamente para ${successCount} rol(es).` });
      setEdited({});
      // Refetch roles from API and update global store
      try {
        const res = await fetch('/api/roles');
        const { roles: freshRoles } = await res.json();
        if (freshRoles) {
          const map: Record<string, any> = {};
          for (const role of freshRoles) {
            if (role.permisos) {
              map[role.nombre] = role.permisos;
            }
          }
          setRoleDefaults(map);
          setRoles(freshRoles);
        }
      } catch { /* ignore */ }
    }
    setSaving(false);
  }

  const hasEdits = Object.keys(edited).length > 0;

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-lg font-medium">Acceso restringido</p>
            <p className="text-sm">Solo administradores pueden gestionar permisos globales.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" />
            Gestión de Permisos por Rol
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configura los permisos CRUD (Crear, Leer, Editar, Eliminar) que cada rol tiene sobre los módulos del sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setEdited({}); setMessage(null); }}
            disabled={!hasEdits || saving}
          >
            Descartar cambios
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasEdits || saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900' 
            : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <p>No se encontraron roles. Crea roles desde la sección de roles.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-xs md:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
              <tr>
                <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wider min-w-[120px]">
                  Módulo
                </th>
                {roles.map(role => (
                  <th key={role.id} className="text-center py-2.5 px-2 font-semibold text-slate-600 dark:text-slate-400 min-w-[90px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs">{role.label}</span>
                      <button
                        type="button"
                        onClick={() => restoreDefaults(role.id)}
                        className="text-[9px] text-blue-500 hover:text-blue-600 font-normal"
                      >
                        Restaurar
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map(mod => {
                const label = mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <tr key={mod} className="border-b border-slate-100 dark:border-slate-800/30 hover:bg-slate-50/30 dark:hover:bg-slate-900/20 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {label}
                    </td>
                    {roles.map(role => {
                      const permisos = getCurrentPermisos(role);
                      const p = normalizePermiso((permisos as any)[mod]);
                      const isEdited = edited[role.id] !== undefined;
                      return (
                        <td key={role.id} className={`text-center py-1.5 px-1 ${isEdited ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}`}>
                          <div className="flex items-center justify-center gap-1.5">
                            {(['crear', 'leer', 'editar', 'eliminar'] as const).map(action => {
                              const active = p[action];
                              const colors: Record<string, string> = {
                                crear: 'checked:accent-green-500',
                                leer: 'checked:accent-blue-500',
                                editar: 'checked:accent-amber-500',
                                eliminar: 'checked:accent-red-500'
                              };
                              return (
                                <label
                                  key={action}
                                  className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors ${
                                    active 
                                      ? 'bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-300 dark:ring-slate-600' 
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                  }`}
                                  title={`${action === 'crear' ? 'Crear' : action === 'leer' ? 'Leer' : action === 'editar' ? 'Editar' : 'Eliminar'} en ${label}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleCrud(role.id, mod, action)}
                                    className={`w-3 h-3 ${colors[action]} rounded-sm`}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 pt-2">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500"></span> C = Crear</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span> R = Leer</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span> U = Editar</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500"></span> D = Eliminar</span>
      </div>
    </div>
  );
}
