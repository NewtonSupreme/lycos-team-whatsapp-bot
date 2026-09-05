"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import {
  ROLE_CATALOG, getRoleMeta, getPermisos, getChatbotCapabilities, MODULES, normalizePermiso,
  type Permisos,
} from "@/types";
import {
  Shield, Crown, Eye, DollarSign, Headphones, HardHat, Wrench, Bot, LayoutGrid,
  Check, X, MessageSquareText, Info, MapPin, ClipboardList,
} from "lucide-react";

function RoleIconCmp({ rol, className }: { rol: string; className?: string }) {
  switch (getRoleMeta(rol)?.icon) {
    case 'crown': return <Crown className={className} />;
    case 'eye': return <Eye className={className} />;
    case 'shield': return <Shield className={className} />;
    case 'dollar': return <DollarSign className={className} />;
    case 'headset': return <Headphones className={className} />;
    case 'hardhat': return <HardHat className={className} />;
    case 'wrench': return <Wrench className={className} />;
    case 'clipboard': return <ClipboardList className={className} />;
    default: return <Shield className={className} />;
  }
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', clientes: 'Clientes', vehiculos: 'Vehículos', servicios: 'Servicios',
  taller: 'Taller', agenda: 'Agenda', whatsapp: 'WhatsApp', leads: 'Leads', inventario: 'Inventario',
  papelera: 'Papelera', ventas: 'Ventas', ia_asistente: 'IA Asistente', reportes: 'Reportes',
  actividad: 'Actividad', calculadora: 'Calculadora', configuracion: 'Configuración',
  empleados: 'Empleados', distribuidor: 'Distribuidor', presupuestos: 'Presupuestos',
};

function CrudBadges({ p }: { p: ReturnType<typeof normalizePermiso> }) {
  const items: [string, boolean, string][] = [
    ['C', p.crear, 'text-green-600'],
    ['R', p.leer, 'text-blue-600'],
    ['U', p.editar, 'text-amber-600'],
    ['D', p.eliminar, 'text-red-600'],
  ];
  return (
    <div className="flex gap-1">
      {items.map(([l, on, color]) => (
        <span key={l} className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${on ? `${color} bg-slate-100 dark:bg-slate-800` : 'text-slate-300 dark:text-slate-700'}`}>{l}</span>
      ))}
    </div>
  );
}

export default function InformacionPage() {
  const { user, roleDefaults, setRoleDefaults } = useAppStore();
  const [loaded, setLoaded] = useState(false);

  // Asegura que los defaults de roles estén cargados (refleja la config del admin)
  useEffect(() => {
    if (roleDefaults) { setLoaded(true); return; }
    fetch('/api/roles').then(r => r.json()).then(({ roles }) => {
      if (roles) {
        const map: Record<string, any> = {};
        for (const role of roles) if (role.permisos) map[role.nombre] = role.permisos;
        setRoleDefaults(map);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [roleDefaults, setRoleDefaults]);

  const miRol = user?.rol || '';
  const miMeta = getRoleMeta(miRol);

  const renderRoleCard = (rolNombre: string, esMio: boolean) => {
    const meta = getRoleMeta(rolNombre);
    const permisos: Permisos = getPermisos(rolNombre, undefined, roleDefaults);
    const chat = getChatbotCapabilities(rolNombre, undefined, roleDefaults);
    const visibles = MODULES.filter(m => normalizePermiso(permisos[m]).leer);

    return (
      <Card key={rolNombre} className={`border shadow-sm overflow-hidden ${esMio ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/40' : 'border-slate-200 dark:border-slate-800'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${meta?.color || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                <RoleIconCmp rol={rolNombre} className="w-4.5 h-4.5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {meta?.label || rolNombre}
                  {esMio && <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-500 text-white px-1.5 py-0.5 rounded">Tu rol</span>}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">{meta?.descripcion}</CardDescription>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" /> {meta?.multiSede ? 'Todas las sedes' : 'Solo su sede'}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${chat.puedeUsarModoDios ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
              <Bot className="w-3 h-3" /> {chat.puedeUsarModoDios ? 'Chatbot Modo Dios' : 'Sin Modo Dios'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chatbot */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
              <MessageSquareText className="w-3.5 h-3.5 text-emerald-500" /> Acceso en el Chatbot (WhatsApp)
            </p>
            <ul className="space-y-1.5">
              {chat.capabilities.map(c => (
                <li key={c.key} className="flex items-start gap-2 text-xs">
                  {c.allowed
                    ? <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    : <X className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />}
                  <span className={c.allowed ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 line-through'}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Módulos del sistema */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
              <LayoutGrid className="w-3.5 h-3.5 text-blue-500" /> Módulos del Panel ({visibles.length}/{MODULES.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {MODULES.map(m => {
                const p = normalizePermiso(permisos[m]);
                if (!p.leer) return null;
                return (
                  <div key={m} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-slate-600 dark:text-slate-400">{MODULE_LABELS[m] || m}</span>
                    <CrudBadges p={p} />
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">C = Crear · R = Leer · U = Editar · D = Eliminar (la eliminación definitiva es solo del Administrador).</p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Info className="h-7 w-7 text-blue-600" />
          Información de Roles y Accesos
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Consulta qué puede hacer cada rol en el panel y en el chatbot de WhatsApp (Modo Dios), según la configuración actual.
        </p>
      </div>

      {/* Tu acceso */}
      {miMeta && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Tu acceso</h2>
          <div className="max-w-2xl">{renderRoleCard(getRoleMeta(miRol)?.nombre || miRol, true)}</div>
        </div>
      )}

      {/* Todos los roles */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Todos los roles del sistema</h2>
        {!loaded ? (
          <p className="text-sm text-slate-400">Cargando configuración de roles…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ROLE_CATALOG.map(r => renderRoleCard(r.nombre, getRoleMeta(miRol)?.nombre === r.nombre))}
          </div>
        )}
      </div>
    </div>
  );
}
