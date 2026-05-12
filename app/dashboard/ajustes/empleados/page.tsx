"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSedeStore } from "@/lib/store/useSedeStore";
import { Loader2, Plus, Users, Shield, MapPin, Trash2, Mail, User, Wrench } from "lucide-react";

export default function EmpleadosPage() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    rol: "empleado",
    sede_id: "",
    telefono: ""
  });

  const { canViewAll, currentSede } = useSedeStore();

  useEffect(() => {
    setMounted(true);
    fetchSedes();
    fetchEmpleados();
  }, [currentSede]);

  async function fetchSedes() {
    if (!supabase) return;
    const { data } = await supabase.from("sedes").select("*");
    if (data) {
      setSedes(data);
      if (data.length > 0 && !formData.sede_id) {
        setFormData(f => ({ ...f, sede_id: currentSede?.id || data[0].id }));
      }
    }
  }

  async function fetchEmpleados() {
    if (!supabase) return;
    setLoading(true);
    let query = supabase.from("usuarios").select(`
      id, rol, username, email, nombre, telefono,
      sede:sedes(id, nombre)
    `);
    
    if (currentSede) {
      query = query.eq("sede_id", currentSede.id);
    }

    const { data } = await query;
    if (data) setEmpleados(data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          activo: !(formData.rol === 'mecanico' || formData.rol === 'jefe_taller'),
          password_hash: (formData.rol === 'mecanico' || formData.rol === 'jefe_taller') ? 'NO_ACCESS_STAFF' : 'lycos2026'
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("Personal registrado exitosamente.");
      setFormData({ nombre: "", apellido: "", email: "", rol: "empleado", sede_id: sedes[0]?.id || "", telefono: "" });
      fetchEmpleados();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Estás seguro de eliminar a ${nombre}?`)) return;
    
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchEmpleados();
    } catch (error: any) {
      alert("Error eliminando empleado: " + error.message);
    }
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
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                    emp.rol === 'admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                    emp.rol === 'gerente' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                    emp.rol === 'jefe_taller' ? 'bg-primary/10 text-primary border-primary/20' :
                    emp.rol === 'mecanico' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                    'bg-slate-500/10 text-slate-500 border-slate-500/20'
                  }`}>
                    {emp.rol === 'mecanico' ? <Wrench className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {emp.rol.replace('_', ' ')}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">{emp.nombre}</td>
                {showCredentials && (
                  <td className="px-4 py-3">
                    <div className="flex flex-col min-w-[150px]">
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">@{emp.username}</span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{emp.email}</span>
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
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    onClick={() => handleDelete(emp.id, emp.nombre)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
          <p className="text-sm text-slate-500 mt-1">Administra los accesos y roles por sede.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-slate-200 dark:border-slate-800 shadow-sm h-fit sticky top-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Nuevo Registro</CardTitle>
            <CardDescription>Añade personal administrativo o técnico.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input required value={formData.apellido} onChange={e => setFormData({ ...formData, apellido: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Correo Electrónico</Label>
                  <Input type="email" required={formData.rol !== 'mecanico' && formData.rol !== 'jefe_taller'} value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono WhatsApp (Para IA Admins)</Label>
                  <Input placeholder="Ej: 584123343519" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
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
                    <SelectItem value="jefe_taller">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span>Jefe de Taller (Sin Acceso)</span>
                      </div>
                    </SelectItem>
                    {canViewAll() && (
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
                <Select value={formData.sede_id} onValueChange={v => setFormData({ ...formData, sede_id: v })} disabled={!canViewAll()}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sedes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Registrar Personal
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
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
              {renderTable(empleados.filter(e => ['admin', 'gerente', 'empleado'].includes(e.rol)), true)}
            </CardContent>
          </Card>

          {/* SECCIÓN 2: PERSONAL TÉCNICO (TALLER) - SIN ACCESO */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-500" />
                <div>
                  <CardTitle className="text-lg">Personal Técnico (Taller)</CardTitle>
                  <CardDescription>Mecánicos y Jefes de Taller (No tienen acceso al panel administrativo)</CardDescription>
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
    </div>
  );
}
