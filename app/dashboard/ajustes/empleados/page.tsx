"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSedeStore } from "@/lib/store/useSedeStore";
import { Loader2, Plus, Users, Shield, MapPin, Trash2, Mail, User } from "lucide-react";
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';

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
    sede_id: ""
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
        setFormData(f => ({ ...f, sede_id: data[0].id }));
      }
    }
  }

  async function fetchEmpleados() {
    if (!supabase) return;
    setLoading(true);
    // Ideally we query a joined view or custom function.
    // Assuming we have access to usuarios table
    let query = supabase.from("usuarios").select(`
      id, rol, username, email, nombre,
      sede:sedes(id, nombre)
    `);
    
    // If not admin, restrict to current sede
    if (!canViewAll() && currentSede) {
      query = query.eq("sede_id", currentSede.id);
    }

    const { data } = await query;
    // Note: To get names and emails, we might need a joined table or edge function since auth.users is restricted.
    // For now, this lists the assignments.
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
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("Usuario creado exitosamente con contraseña: lycos2026");
      setFormData({ nombre: "", apellido: "", email: "", rol: "empleado", sede_id: sedes[0]?.id || "" });
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
            <CardTitle className="text-lg">Nuevo Empleado</CardTitle>
            <CardDescription>La contraseña temporal será lycos2026</CardDescription>
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
              <div className="space-y-2">
                <Label>Correo Electrónico</Label>
                <Input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rol de Acceso</Label>
                <Select value={formData.rol} onValueChange={v => setFormData({ ...formData, rol: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empleado">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-slate-400" />
                        <span>Empleado (Solo Sede)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="gerente">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <span>Gerente de Sede (Total Sede)</span>
                      </div>
                    </SelectItem>
                    {canViewAll() && (
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-red-500" />
                          <span>Administrador (Multi-Sede)</span>
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
                Crear Usuario
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Empleados Registrados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
            ) : (
              <div className="w-full overflow-x-auto">
                {/* Desktop Table View */}
                <table className="w-full text-sm text-left hidden md:table">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Rol</th>
                      <th className="px-4 py-3 whitespace-nowrap">Sede</th>
                      <th className="px-4 py-3 whitespace-nowrap">Nombre</th>
                      <th className="px-4 py-3 whitespace-nowrap">Usuario / Email</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {empleados.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                            emp.rol === 'admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                            emp.rol === 'gerente' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                            'bg-slate-500/10 text-slate-500 border-slate-500/20'
                          }`}>
                            <Shield className="w-3 h-3" />
                            {emp.rol}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {emp.sede?.nombre || 'Sin sede'}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">{emp.nombre}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col min-w-[150px]">
                            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">@{emp.username}</span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{emp.email}</span>
                          </div>
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

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                  {empleados.map((emp) => (
                    <div key={emp.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                             <h3 className="font-bold text-slate-900 dark:text-white">{emp.nombre}</h3>
                             <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase ${
                              emp.rol === 'admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                              emp.rol === 'gerente' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                              'bg-slate-500/10 text-slate-500 border-slate-500/20'
                            }`}>
                              {emp.rol}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin className="w-3 h-3" />
                            {emp.sede?.nombre || 'Sin sede'}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-400 hover:text-red-500"
                          onClick={() => handleDelete(emp.id, emp.nombre)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-md">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="truncate">@{emp.username}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-md">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="truncate">{emp.email}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {empleados.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                    <p>No hay empleados registrados.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
