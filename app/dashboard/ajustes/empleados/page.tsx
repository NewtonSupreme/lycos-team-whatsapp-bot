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
import { Loader2, Plus, Users, Shield, MapPin, Trash2, Mail, User, Wrench, Search, Eye, EyeOff, Settings2, Lock, Unlock } from "lucide-react";
import { getPermisos, type Permisos, PERMISOS_DEFAULT } from "@/types";

export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sedeFilter, setSedeFilter] = useState<string>("todas");
  const [showPassword, setShowPassword] = useState(false);

  const { canViewAll, currentSede } = useSedeStore();
  const { user } = useAppStore();
  const userRole = user?.rol || 'empleado';
  const isAdmin = userRole === 'admin';
  const canEdit = isAdmin || userRole === 'gerente';
  const canDelete = isAdmin;

  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    username: "",
    rol: "empleado",
    sede_id: "",
    telefono: ""
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    fetchSedes();
    fetchEmpleados();
  }, [currentSede, sedeFilter]);

  async function fetchSedes() {
    if (!supabase) return;
    const { data } = await supabase.from("sedes").select("*");
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
      id, rol, username, email, nombre, telefono,
      sede:sedes(id, nombre)
    `).order('nombre', { ascending: true });

    if (sedeFilter && sedeFilter !== "todas") {
      query = query.eq("sede_id", sedeFilter);
    } else if (!isAdmin && currentSede) {
      query = query.eq("sede_id", currentSede.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching empleados:', error);
    }
    if (data) setEmpleados(data);
    setLoading(false);
  }

  function getPasswordForRole(rol: string): string {
    if (rol === 'mecanico' || rol === 'jefe_taller') return 'NO_ACCESS_STAFF';
    return 'lycos2026';
  }

  function getRoleBadgeColor(rol: string): string {
    switch (rol) {
      case 'admin': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'gerente': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'jefe_taller_acceso': return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
      case 'jefe_taller': return 'bg-primary/10 text-primary border-primary/20';
      case 'mecanico_acceso': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'mecanico': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  }

  function getRoleIcon(rol: string): string {
    return rol === 'mecanico' || rol === 'mecanico_acceso' ? 'wrench' : 'shield';
  }

  function getRoleDisplayName(rol: string): string {
    switch (rol) {
      case 'jefe_taller_acceso': return 'Jefe Taller (Con Acceso)';
      case 'jefe_taller': return 'Jefe Taller (Sin Acceso)';
      case 'mecanico_acceso': return 'Mecánico (Con Acceso)';
      case 'mecanico': return 'Mecánico (Sin Acceso)';
      default: return rol.replace(/_/g, ' ');
    }
  }

  function isNoAccessRole(rol: string): boolean {
    return rol === 'mecanico' || rol === 'jefe_taller';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...formData };
      if (payload.sede_id === "todas" || !payload.sede_id) {
        payload.sede_id = currentSede?.id || sedes[0]?.id || "";
      }
      payload.activo = !isNoAccessRole(formData.rol);
      payload.password_hash = getPasswordForRole(formData.rol);

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
        rol: "empleado", sede_id: isAdmin ? "todas" : (sedes[0]?.id || ""), telefono: ""
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
    if (!confirm(`¿Estás seguro de eliminar permanentemente a ${nombre} de la base de datos? Esta acción es irreversible.`)) return;

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
    const defaults = PERMISOS_DEFAULT[emp.rol] || PERMISOS_DEFAULT.empleado;
    setEditingId(emp.id);

    let permisos = { ...defaults };
    if (isAdmin && supabase) {
      const { data: pData } = await supabase
        .from('usuarios')
        .select('permisos')
        .eq('id', emp.id)
        .single();
      if (pData?.permisos) {
        permisos = { ...defaults, ...(typeof pData.permisos === 'string' ? JSON.parse(pData.permisos) : pData.permisos) };
      }
    }

    setEditFormData({
      id: emp.id,
      nombre: emp.nombre,
      username: emp.username,
      email: emp.email || '',
      rol: emp.rol,
      sede_id: emp.sede?.id || "",
      telefono: emp.telefono || "",
      permisos
    });
    setShowEditDialog(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...editFormData };
      if (isAdmin) {
        payload.permisos = editFormData.permisos;
      } else {
        delete payload.permisos;
      }
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
    } catch (error: any) {
      alert("Error actualizando: " + error.message);
    } finally {
      setSaving(false);
    }
  };

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
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeColor(emp.rol)}`}>
                    {emp.rol === 'mecanico' || emp.rol === 'mecanico_acceso' ? <Wrench className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {getRoleDisplayName(emp.rol)}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">{emp.nombre}</td>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        onClick={() => handleEditClick(emp)}
                      >
                        <User className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        onClick={() => handleDelete(emp.id, emp.nombre)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!canEdit && (
                      <span className="text-[10px] text-slate-400 italic">Solo vista</span>
                    )}
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
             canEdit ? 'Administra los accesos y roles de tu sede.' :
             'Visualización del personal del sistema.'}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl px-4 py-3">
          <MapPin className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Filtrar por Sede</span>
          <Select value={sedeFilter} onValueChange={setSedeFilter}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-400" />
                  <span className="font-medium">Todas las Sedes</span>
                </div>
              </SelectItem>
              {sedes.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{s.nombre}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sedeFilter !== "todas" && (
            <span className="text-xs text-slate-500 ml-1">
              {empleados.length} empleado{empleados.length !== 1 ? 's' : ''} en esta sede
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canEdit && (
          <Card className="lg:col-span-1 border-slate-200 dark:border-slate-800 shadow-sm h-fit sticky top-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Nuevo Registro</CardTitle>
              <CardDescription>Añade personal administrativo o técnico.</CardDescription>
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
                    <Input
                      placeholder="usuario123"
                      className="pl-7 font-mono"
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Si se deja vacío, se generará automáticamente.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Correo Electrónico</Label>
                    <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="opcional@correo.com" />
                    <p className="text-[10px] text-slate-400">Campo opcional</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono WhatsApp</Label>
                    <Input placeholder="Ej: 584123343519" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                    <p className="text-[10px] text-slate-400">Requerido solo para modo dios IA</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rol de Acceso</Label>
                  <Select value={formData.rol} onValueChange={v => setFormData({ ...formData, rol: v })}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empleado">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-slate-400" />
                        <span>Empleado (Acceso Panel)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="gerente">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <span>Gerente de Sede</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="mecanico">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-orange-500" />
                        <span>Mecánico (Sin Acceso)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="mecanico_acceso">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-amber-500" />
                        <span>Mecánico (Con Acceso)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="jefe_taller">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span>Jefe de Taller (Sin Acceso)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="jefe_taller_acceso">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-violet-500" />
                        <span>Jefe de Taller (Con Acceso)</span>
                      </div>
                    </SelectItem>
                    {isAdmin && (
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-red-500" />
                          <span>Administrador</span>
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sede Asignada</Label>
                  <Select
                    value={formData.sede_id}
                    onValueChange={v => setFormData({ ...formData, sede_id: v })}
                    disabled={!isAdmin && !canViewAll()}
                  >
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {isAdmin && (
                        <SelectItem value="todas">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-red-400" />
                            <span className="font-medium">Todas (Sin restricción)</span>
                          </div>
                        </SelectItem>
                      )}
                      {sedes.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && !canViewAll() && (
                    <p className="text-[10px] text-slate-400">La sede se asigna automáticamente según tu acceso.</p>
                  )}
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña generada</Label>
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <code className={`block text-xs font-mono ${showPassword ? 'text-slate-800 dark:text-slate-200' : 'text-transparent dark:text-transparent select-none'} bg-white dark:bg-slate-950 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700`}>
                    {showPassword ? getPasswordForRole(formData.rol) : '••••••••••••'}
                  </code>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {isNoAccessRole(formData.rol)
                      ? 'No genera acceso al panel — solo registro interno.'
                      : 'Contraseña por defecto: lycos2026'}
                  </p>
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
          {/* SECCIÓN 1: PERSONAL CON ACCESO AL SISTEMA */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                <div>
                  <CardTitle className="text-lg">Personal con Acceso al Sistema</CardTitle>
                  <CardDescription>Administradores, gerentes y empleados autorizados para usar el panel</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderTable(empleados.filter(e => ['admin', 'gerente', 'empleado', 'jefe_taller_acceso', 'mecanico_acceso'].includes(e.rol)), true)}
            </CardContent>
          </Card>

          {/* SECCIÓN 2: PERSONAL TÉCNICO (TALLER) */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-500" />
                <div>
                  <CardTitle className="text-lg">Personal Técnico (Taller)</CardTitle>
                  <CardDescription>Mecánicos y Jefes de Taller — No tienen acceso al panel administrativo</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderTable(empleados.filter(e => ['mecanico', 'jefe_taller'].includes(e.rol)), false)}
            </CardContent>
          </Card>

          {/* SECCIÓN 3: ADMINISTRADORES DEL BOT IA */}
          <Card className="border-emerald-200 dark:border-emerald-900/50 shadow-sm overflow-hidden bg-emerald-50/10">
            <CardHeader className="bg-emerald-50/50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/50">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-500" />
                <div>
                  <CardTitle className="text-lg text-emerald-800 dark:text-emerald-400">Administradores del Bot (Modo Dios IA)</CardTitle>
                  <CardDescription className="text-emerald-600/80 dark:text-emerald-400/70">
                    Números de WhatsApp con acceso total a inventario, cajas y servicios desde el Chatbot.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderTable(empleados.filter(e => e.rol === 'admin' && e.telefono), true)}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MODAL DE EDICIÓN */}
      {showEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" />
                Editar Usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre Completo <span className="text-red-400">*</span></Label>
                  <Input required value={editFormData.nombre} onChange={e => setEditFormData({ ...editFormData, nombre: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Usuario <span className="text-red-400">*</span></Label>
                    <Input required value={editFormData.username} onChange={e => setEditFormData({ ...editFormData, username: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={editFormData.email} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                      placeholder="opcional@correo.com" />
                    <p className="text-[10px] text-slate-400">Campo opcional</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono WhatsApp (Modo Dios IA)</Label>
                  <Input value={editFormData.telefono} onChange={e => setEditFormData({ ...editFormData, telefono: e.target.value })}
                    placeholder="Opcional — solo para modo dios" />
                </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Rol</Label>
                      <Select value={editFormData.rol} onValueChange={v => {
                        const updated = { ...editFormData, rol: v };
                        if (isAdmin) {
                          const defaults = PERMISOS_DEFAULT[v] || PERMISOS_DEFAULT.empleado;
                          updated.permisos = { ...defaults };
                        }
                        setEditFormData(updated);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {isAdmin && <SelectItem value="admin">Admin</SelectItem>}
                          <SelectItem value="gerente">Gerente</SelectItem>
                          <SelectItem value="empleado">Empleado</SelectItem>
                          <SelectItem value="mecanico">Mecánico (Sin Acceso)</SelectItem>
                          <SelectItem value="mecanico_acceso">Mecánico (Con Acceso)</SelectItem>
                          <SelectItem value="jefe_taller">Jefe Taller (Sin Acceso)</SelectItem>
                          <SelectItem value="jefe_taller_acceso">Jefe Taller (Con Acceso)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Sede</Label>
                      <Select value={editFormData.sede_id} onValueChange={v => setEditFormData({ ...editFormData, sede_id: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {isAdmin && editFormData.rol !== 'admin' && (
                    <div className="space-y-3 pt-2 border-t border-border/30">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-blue-500" /> Permisos del Sistema
                        </Label>
                        <button
                          type="button"
                          onClick={() => {
                            const defaults = PERMISOS_DEFAULT[editFormData.rol] || PERMISOS_DEFAULT.empleado;
                            setEditFormData({ ...editFormData, permisos: { ...defaults } });
                          }}
                          className="text-[10px] text-blue-500 hover:text-blue-600 font-medium"
                        >
                          Restaurar por defecto
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {Object.entries(editFormData.permisos || {}).map(([key, val]) => (
                          <label
                            key={key}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              val ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={!!val}
                              onChange={() => {
                                setEditFormData({
                                  ...editFormData,
                                  permisos: { ...editFormData.permisos, [key]: !val }
                                });
                              }}
                              className="w-3.5 h-3.5 accent-blue-600 rounded"
                            />
                            <span className={val ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-500'}>
                              {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                <div className="flex gap-3 pt-4">
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
