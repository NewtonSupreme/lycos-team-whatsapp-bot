"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSedeStore } from "@/lib/store/useSedeStore";
import { useAppStore } from "@/lib/store";
import {
  Loader2, Plus, Users, Shield, MapPin, Trash2, User, Wrench, Eye, EyeOff,
  Crown, DollarSign, Headphones, HardHat, KeyRound
} from "lucide-react";
import {
  ROLE_CATALOG, getRoleMeta, normalizePermiso, PERMISOS_DEFAULT, MASTER_ADMIN_USERNAME,
  type RoleMeta, type Permisos, type PermisoValue,
} from "@/types";
import PersonalTecnico, { AREAS } from "@/components/empleados/PersonalTecnico";

// Icono lucide por rol del catálogo
function RoleIconCmp({ rol, className }: { rol: string; className?: string }) {
  const icon = getRoleMeta(rol)?.icon;
  switch (icon) {
    case 'crown': return <Crown className={className} />;
    case 'eye': return <Eye className={className} />;
    case 'shield': return <Shield className={className} />;
    case 'dollar': return <DollarSign className={className} />;
    case 'headset': return <Headphones className={className} />;
    case 'hardhat': return <HardHat className={className} />;
    case 'wrench': return <Wrench className={className} />;
    default: return <Shield className={className} />;
  }
}

const DEFAULT_PASSWORD = "lycos2026";

export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sedeFilter, setSedeFilter] = useState<string>("todas");
  const [showPassword, setShowPassword] = useState(false);

  const { canViewAll, currentSede } = useSedeStore();
  const { user, setUser } = useAppStore();
  const userRole = user?.rol || 'atencion_cliente';
  const isAdmin = userRole === 'admin';
  const canEdit = isAdmin || userRole === 'supervisor';
  const canDelete = isAdmin;
  const isMasterAdmin = user?.username === MASTER_ADMIN_USERNAME;

  // Roles que el usuario actual puede asignar:
  //  - admin: solo el usuario maestro 'administrador'.
  //  - dueño y demás privilegiados: cualquier admin.
  //  - supervisor: solo roles operativos (asignablePorSupervisor).
  const assignableRoles: RoleMeta[] = ROLE_CATALOG.filter(r => {
    if (r.nombre === 'admin') return isMasterAdmin;
    if (!isAdmin) return r.asignablePorSupervisor;
    return true;
  });

  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    username: "",
    rol: "atencion_cliente",
    sede_id: "",
    telefono: "",
    cedula: "",
    especialidad: "",
    password: DEFAULT_PASSWORD,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  /** Sube la foto de la cédula/carnet al bucket público 'avatars' (carpeta personal/). */
  async function handleSubirFoto(file?: File | null) {
    if (!file || !supabase) return;
    setSubiendoFoto(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `personal/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true, contentType: file.type || 'image/jpeg',
      });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (data?.publicUrl) setEditFormData((f: any) => ({ ...f, foto_url: data.publicUrl }));
    } catch (e: any) {
      alert('No se pudo subir la imagen: ' + (e.message || e));
    }
    setSubiendoFoto(false);
  }

  useEffect(() => {
    setMounted(true);
    fetchSedes();
    fetchEmpleados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSede?.id, sedeFilter]);

  async function fetchSedes() {
    if (!supabase) return;
    const { data } = await supabase.from("sedes").select("*").order('nombre');
    if (data) {
      setSedes(data);
      if (data.length > 0 && !formData.sede_id) {
        setFormData(f => ({ ...f, sede_id: isAdmin ? "todas" : (currentSede?.id || data[0].id) }));
      }
    }
  }

  async function fetchEmpleados() {
    if (!supabase) return;
    setLoading(true);
    let query = supabase.from("usuarios").select(`
      id, rol, username, email, nombre, telefono, activo, especialidad, cedula, alias, foto_url,
      sede:sedes(id, nombre)
    `).order('nombre', { ascending: true });

    // Admin: filtra por el selector; el resto siempre ve solo su sede
    if (isAdmin) {
      if (sedeFilter && sedeFilter !== "todas") query = query.eq("sede_id", sedeFilter);
    } else if (currentSede) {
      query = query.eq("sede_id", currentSede.id);
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching empleados:', error);
    if (data) setEmpleados(data);
    setLoading(false);
  }

  function roleLabel(rol: string): string {
    return getRoleMeta(rol)?.label || rol.replace(/_/g, ' ');
  }
  function roleBadge(rol: string): string {
    return getRoleMeta(rol)?.color || 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload: any = { ...formData };
      // Supervisor siempre crea en su propia sede
      if (!isAdmin) payload.sede_id = currentSede?.id || "";
      if (payload.sede_id === "todas" || !payload.sede_id) {
        payload.sede_id = currentSede?.id || sedes[0]?.id || "";
      }
      payload.activo = true;
      payload.password_hash = (formData.password || DEFAULT_PASSWORD).trim();

      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("Personal registrado exitosamente.");
      setFormData({
        nombre: "", apellido: "", email: "", username: "",
        rol: assignableRoles[0]?.nombre || "atencion_cliente",
        sede_id: isAdmin ? "todas" : (currentSede?.id || sedes[0]?.id || ""),
        telefono: "", cedula: "", especialidad: "", password: DEFAULT_PASSWORD,
      });
      fetchEmpleados();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, nombre: string) {
    if (!canDelete) return;
    if (id === user?.id) { alert("No puedes eliminar tu propia cuenta."); return; }
    if (!confirm(`¿Eliminar permanentemente a ${nombre}? Esta acción es irreversible.`)) return;
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmpleados(prev => prev.filter(e => e.id !== id));
      alert("Usuario eliminado correctamente.");
    } catch (error: any) {
      alert("Error eliminando empleado: " + error.message);
    }
  }

  const handleEditClick = async (emp: any) => {
    if (!canEdit) return;
    const defaults = PERMISOS_DEFAULT[emp.rol] || PERMISOS_DEFAULT.atencion_cliente;
    setEditingId(emp.id);

    let permisos: Permisos = JSON.parse(JSON.stringify(defaults));
    if (isAdmin && supabase) {
      const { data: pData } = await supabase
        .from('usuarios').select('permisos').eq('id', emp.id).single();
      if (pData?.permisos) {
        const raw = typeof pData.permisos === 'string' ? JSON.parse(pData.permisos) : pData.permisos;
        const merged: any = JSON.parse(JSON.stringify(defaults));
        for (const [key, val] of Object.entries(raw)) {
          if (key in merged) merged[key] = normalizePermiso(val as PermisoValue);
        }
        permisos = merged;
      }
    }

    setEditFormData({
      id: emp.id,
      nombre: emp.nombre,
      username: emp.username,
      email: emp.email || '',
      rol: emp.rol,
      sede_id: emp.sede?.id || currentSede?.id || "",
      telefono: emp.telefono || "",
      especialidad: emp.especialidad || "",
      cedula: emp.cedula || "",
      alias: emp.alias || "",
      foto_url: emp.foto_url || "",
      activo: emp.activo !== false,
      password: "",
      permisos,
    });
    setShowEditDialog(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...editFormData };
      if (isAdmin) payload.permisos = editFormData.permisos;
      else delete payload.permisos;
      if (!payload.password) delete payload.password; // no cambiar si está vacío

      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("Usuario actualizado correctamente.");
      setShowEditDialog(false);
      fetchEmpleados();

      // Si el admin editó sus propios permisos, refrescar su sesión
      if (isAdmin && editingId === user?.id) {
        fetch('/api/auth/me').then(r => r.json()).then(({ user: freshUser }) => {
          if (freshUser) {
            setUser({
              id: freshUser.id || freshUser.username,
              username: freshUser.username,
              email: freshUser.email || `${freshUser.username}@lycosteam.com`,
              nombre: freshUser.nombre,
              rol: freshUser.rol,
              avatar_url: freshUser.avatar_url,
              sede_id: freshUser.sede_id,
              permisos: freshUser.permisos,
              created_at: ''
            });
          }
        }).catch(() => {});
      }
    } catch (error: any) {
      alert("Error actualizando: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  function toggleVista(key: string) {
    const p = normalizePermiso(editFormData.permisos[key]);
    // Activar = solo lectura por defecto; Desactivar = sin ningún acceso.
    const next = p.leer
      ? { crear: false, leer: false, editar: false, eliminar: false }
      : { crear: false, leer: true, editar: false, eliminar: false };
    setEditFormData({ ...editFormData, permisos: { ...editFormData.permisos, [key]: next } });
  }

  const renderTable = (list: any[], showCredentials: boolean) => {
    if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
    if (list.length === 0) return (
      <div className="text-center py-12 text-slate-500">
        <Users className="w-12 h-12 mx-auto text-slate-200 mb-3" />
        <p>No hay personal registrado en esta sección.</p>
      </div>
    );
    return (
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Rol</th>
              <th className="px-4 py-3 whitespace-nowrap">Nombre</th>
              {showCredentials && <th className="px-4 py-3 whitespace-nowrap">Usuario / Email</th>}
              <th className="px-4 py-3 whitespace-nowrap">Sede</th>
              <th className="px-4 py-3 whitespace-nowrap">Teléfono IA</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {list.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                <td className="px-4 py-3">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${roleBadge(emp.rol)}`}>
                    <RoleIconCmp rol={emp.rol} className="w-3 h-3" />
                    {roleLabel(emp.rol)}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                  {emp.nombre}
                  {emp.activo === false && <span className="ml-2 text-[10px] text-red-500 font-medium">(inactivo)</span>}
                </td>
                {showCredentials && (
                  <td className="px-4 py-3">
                    <div className="flex flex-col min-w-[150px]">
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">@{emp.username}</span>
                      {emp.email && <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{emp.email}</span>}
                    </div>
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 font-medium whitespace-nowrap text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {emp.sede?.nombre || 'Sin sede'}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                  {emp.telefono ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded">
                      <Shield className="w-3 h-3" /> {emp.telefono}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canEdit && (
                      <Button variant="ghost" size="icon"
                        className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                        onClick={() => handleEditClick(emp)}>
                        <User className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon"
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => handleDelete(emp.id, emp.nombre)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!canEdit && <span className="text-[10px] text-slate-400 italic">Solo vista</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!mounted) return null;

  const administrativos = empleados.filter(e => !getRoleMeta(e.rol)?.esTecnico);
  const tecnicos = empleados.filter(e => getRoleMeta(e.rol)?.esTecnico);
  const botAdmins = empleados.filter(e => e.rol === 'admin' && e.telefono);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Users className="h-7 w-7 md:h-8 md:w-8 text-blue-600" />
            Gestión de Empleados
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin ? 'Control total del personal en todas las sedes.' :
             canEdit ? `Administra el personal de ${currentSede?.nombre || 'tu sede'}.` :
             'Visualización del personal del sistema.'}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl px-4 py-3">
          <MapPin className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Filtrar por Sede</span>
          <Select value={sedeFilter} onValueChange={setSedeFilter}>
            <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">
                <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-red-400" /><span className="font-medium">Todas las Sedes</span></div>
              </SelectItem>
              {sedes.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400" /><span>{s.nombre}</span></div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canEdit && (
          <Card className="lg:col-span-1 border-slate-200 dark:border-slate-800 shadow-sm h-fit lg:sticky lg:top-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Nuevo Registro</CardTitle>
              <CardDescription>Añade personal y asígnale un rol.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre <span className="text-red-400">*</span></Label>
                    <Input required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Apellido <span className="text-red-400">*</span></Label>
                    <Input required value={formData.apellido} onChange={e => setFormData({ ...formData, apellido: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nombre de Usuario</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">@</span>
                    <Input placeholder="usuario123" className="pl-7 font-mono" value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} />
                  </div>
                  <p className="text-[10px] text-slate-400">Si se deja vacío, se generará automáticamente.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Correo Electrónico</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="opcional@correo.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono WhatsApp</Label>
                    <Input placeholder="Ej: 584123343519" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                    <p className="text-[10px] text-slate-400">Requerido solo para modo dios IA</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cédula de Identidad</Label>
                    <Input placeholder="Ej: V-16.278.639" className="font-mono" value={formData.cedula}
                      onChange={e => setFormData({ ...formData, cedula: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Área de trabajo</Label>
                    <select
                      value={formData.especialidad}
                      onChange={e => setFormData({ ...formData, especialidad: e.target.value })}
                      className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                    >
                      <option value="">— Sin área —</option>
                      {AREAS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400">Zona del taller donde comisiona (técnicos).</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rol de Acceso</Label>
                  <Select value={formData.rol} onValueChange={v => setFormData({ ...formData, rol: v })}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map(r => (
                        <SelectItem key={r.nombre} value={r.nombre}>
                          <div className="flex items-center gap-2">
                            <RoleIconCmp rol={r.nombre} className="w-4 h-4" />
                            <span>{r.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400">{getRoleMeta(formData.rol)?.descripcion}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sede Asignada</Label>
                  <Select value={isAdmin ? formData.sede_id : (currentSede?.id || "")}
                    onValueChange={v => setFormData({ ...formData, sede_id: v })}
                    disabled={!isAdmin}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Selecciona una sede" /></SelectTrigger>
                    <SelectContent>
                      {isAdmin && <SelectItem value="todas"><span className="font-medium">Sede actual / principal</span></SelectItem>}
                      {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!isAdmin && <p className="text-[10px] text-slate-400">Se asigna a tu sede: {currentSede?.nombre}.</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Contraseña inicial</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input type={showPassword ? "text" : "password"} className="pl-9 pr-9 font-mono"
                      value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Por defecto: {DEFAULT_PASSWORD} · El empleado puede cambiarla luego.</p>
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Registrar Personal
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className={`${canEdit ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-6`}>
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                <div>
                  <CardTitle className="text-lg">Personal Administrativo</CardTitle>
                  <CardDescription>Administración, supervisores, cobranza y atención al cliente</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">{renderTable(administrativos, true)}</CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-500" />
                <div>
                  <CardTitle className="text-lg">Personal Técnico (Taller)</CardTitle>
                  <CardDescription>
                    Organizado por área de trabajo — la misma zona que usa el motor de comisiones
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <PersonalTecnico
                  empleados={tecnicos as any}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={(e: any) => handleEditClick(e)}
                  onDelete={handleDelete}
                  onChanged={fetchEmpleados}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 dark:border-emerald-900/50 shadow-sm overflow-hidden bg-emerald-50/10">
            <CardHeader className="bg-emerald-50/50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/50">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-500" />
                <div>
                  <CardTitle className="text-lg text-emerald-800 dark:text-emerald-400">Administradores del Bot (Modo Dios IA)</CardTitle>
                  <CardDescription className="text-emerald-600/80 dark:text-emerald-400/70">
                    Números de WhatsApp con acceso total al chatbot.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">{renderTable(botAdmins, true)}</CardContent>
          </Card>
        </div>
      </div>

      {/* MODAL DE EDICIÓN */}
      {showEditDialog && editFormData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-6">
          <Card className="w-full max-w-2xl border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b shrink-0 py-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" /> Editar Usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1">
              <form onSubmit={handleUpdate} className="space-y-5">
                <div className="space-y-2">
                  <Label>Nombre Completo <span className="text-red-400">*</span></Label>
                  <Input required value={editFormData.nombre} onChange={e => setEditFormData({ ...editFormData, nombre: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Usuario <span className="text-red-400">*</span></Label>
                    <Input required value={editFormData.username} onChange={e => setEditFormData({ ...editFormData, username: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={editFormData.email} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} placeholder="opcional@correo.com" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Teléfono WhatsApp (Modo Dios IA)</Label>
                    <Input value={editFormData.telefono} onChange={e => setEditFormData({ ...editFormData, telefono: e.target.value })} placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nueva contraseña</Label>
                    <Input type="text" className="font-mono" value={editFormData.password}
                      onChange={e => setEditFormData({ ...editFormData, password: e.target.value })}
                      placeholder="Dejar vacío para no cambiar" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rol</Label>
                    <Select value={editFormData.rol} onValueChange={v => {
                      const updated = { ...editFormData, rol: v };
                      if (isAdmin) updated.permisos = JSON.parse(JSON.stringify(PERMISOS_DEFAULT[v] || PERMISOS_DEFAULT.atencion_cliente));
                      setEditFormData(updated);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(assignableRoles.some(r => r.nombre === editFormData.rol)
                          ? assignableRoles
                          : [...assignableRoles, getRoleMeta(editFormData.rol)].filter(Boolean) as RoleMeta[]
                        ).map(r => (
                          <SelectItem key={r.nombre} value={r.nombre}>
                            <div className="flex items-center gap-2"><RoleIconCmp rol={r.nombre} className="w-4 h-4" />{r.label}</div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sede</Label>
                    <Select value={editFormData.sede_id} onValueChange={v => setEditFormData({ ...editFormData, sede_id: v })} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Área de trabajo + estado (personal técnico) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Área de trabajo</Label>
                    <select
                      value={editFormData.especialidad || ''}
                      onChange={e => setEditFormData({ ...editFormData, especialidad: e.target.value })}
                      className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                    >
                      <option value="">— Sin área asignada —</option>
                      {AREAS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400">Determina en qué zona del taller se agrupa y comisiona.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado</Label>
                    <label className="flex items-center gap-2 h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.activo !== false}
                        onChange={e => setEditFormData({ ...editFormData, activo: e.target.checked })}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="text-sm font-medium">
                        {editFormData.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </label>
                    <p className="text-[10px] text-slate-400">Los inactivos no aparecen en los selectores de la orden.</p>
                  </div>
                </div>

                {/* Identificación: cédula + alias + foto (cédula/carnet) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cédula de identidad</Label>
                    <Input
                      placeholder="Ej: V-16.278.639"
                      className="font-mono"
                      value={editFormData.cedula || ''}
                      onChange={e => setEditFormData({ ...editFormData, cedula: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Alias (hojas de pago)</Label>
                    <Input
                      placeholder='Ej: "NELSON"'
                      value={editFormData.alias || ''}
                      onChange={e => setEditFormData({ ...editFormData, alias: e.target.value })}
                    />
                    <p className="text-[10px] text-slate-400">Nombre con el que aparece en las relaciones de pago.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Foto / Cédula escaneada</Label>
                  <div className="flex items-center gap-3">
                    {editFormData.foto_url ? (
                      <a href={editFormData.foto_url} target="_blank" rel="noopener noreferrer" title="Ver imagen completa" className="shrink-0">
                        {/* La imagen se recorta/adapta automáticamente al recuadro (object-cover) */}
                        <img
                          src={editFormData.foto_url}
                          alt="Documento del empleado"
                          className="w-16 h-16 rounded-xl object-cover border-2 border-blue-200 dark:border-blue-800 shadow-sm"
                        />
                      </a>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
                        <User className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <input
                        type="file"
                        accept="image/*"
                        disabled={subiendoFoto}
                        onChange={e => handleSubirFoto(e.target.files?.[0])}
                        className="block w-full text-xs text-slate-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-600 dark:file:bg-blue-950/40 dark:file:text-blue-400 file:text-xs file:font-bold hover:file:bg-blue-100 file:cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">
                        {subiendoFoto ? 'Subiendo imagen…' : 'Sube la foto de la cédula o carnet; se adapta sola al recuadro.'}
                      </p>
                    </div>
                    {editFormData.foto_url && (
                      <button type="button" onClick={() => setEditFormData({ ...editFormData, foto_url: '' })}
                        className="text-[10px] text-red-400 hover:text-red-500 font-bold shrink-0">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>

                {isAdmin && editFormData.rol !== 'admin' && (
                  <div className="space-y-5 pt-4 border-t border-border/30">
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-blue-500" /> Vistas del Sistema
                        </Label>
                        <span className="text-[10px] text-slate-400">Activar / Desactivar acceso a cada módulo</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {Object.entries(editFormData.permisos || {}).map(([key, crud]) => {
                          const p = normalizePermiso(crud as PermisoValue);
                          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          return (
                            <label key={key}
                              className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                                p.leer ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 shadow-sm'
                                       : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                              <span className={`font-medium truncate mr-2 ${p.leer ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500'}`}>{label}</span>
                              <span role="checkbox" tabIndex={0} aria-checked={p.leer}
                                onClick={(e) => { e.preventDefault(); toggleVista(key); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleVista(key); } }}
                                className={`w-8 h-4 rounded-full transition-colors duration-200 relative inline-block flex-shrink-0 ${p.leer ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                <span className={`absolute w-3 h-3 bg-white rounded-full top-0.5 shadow-sm transition-transform duration-200 ${p.leer ? 'left-[18px]' : 'left-[2px]'}`} />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-border/20 pt-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-amber-500" /> Permisos CRUD del Sistema
                        </Label>
                        <button type="button"
                          onClick={() => setEditFormData({ ...editFormData, permisos: JSON.parse(JSON.stringify(PERMISOS_DEFAULT[editFormData.rol] || PERMISOS_DEFAULT.atencion_cliente)) })}
                          className="text-[10px] text-blue-500 hover:text-blue-600 font-medium">Restaurar por defecto</button>
                      </div>
                      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 custom-scrollbar">
                        <table className="w-full text-xs min-w-[400px]">
                          <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10 shadow-sm">
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                              <th className="text-left py-2 px-3 font-semibold text-slate-500 uppercase tracking-wider">Módulo</th>
                              <th className="text-center py-2 px-1 font-bold text-green-600 text-[10px] w-10" title="Crear">C</th>
                              <th className="text-center py-2 px-1 font-bold text-blue-600 text-[10px] w-10" title="Leer">R</th>
                              <th className="text-center py-2 px-1 font-bold text-amber-600 text-[10px] w-10" title="Editar">U</th>
                              <th className="text-center py-2 px-1 font-bold text-red-600 text-[10px] w-10" title="Eliminar">D</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(editFormData.permisos || {}).map(([key, crud]) => {
                              const p = normalizePermiso(crud as PermisoValue);
                              return (
                                <tr key={key} className="border-b border-slate-100 dark:border-slate-800/30 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                                  <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap text-[11px]">
                                    {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                  </td>
                                  {(['crear', 'leer', 'editar', 'eliminar'] as const).map(action => (
                                    <td key={action} className="text-center py-2 px-1">
                                      <input type="checkbox" checked={p[action]}
                                        onChange={() => setEditFormData({ ...editFormData, permisos: { ...editFormData.permisos, [key]: { ...p, [action]: !p[action] } } })}
                                        className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-400 text-center">C = Crear · R = Leer · U = Editar · D = Eliminar</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-6 mt-4 border-t border-border/10">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1 bg-blue-600 text-white" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Cambios"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
