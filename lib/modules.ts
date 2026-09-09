import {
  Activity, Banknote, Bot, Calculator, Calendar, Car, FileSpreadsheet, FileText,
  Info, LayoutDashboard, MessageSquare, Package, Receipt, Settings, Shield,
  ShoppingCart, Trash2, TrendingUp, Truck, UserCircle, Users, Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Permisos } from '@/types';

export type ModuleGroup =
  | 'Operacion' | 'Clientes' | 'Ventas' | 'Inventario' | 'Finanzas' | 'Sistema';

export interface AppModule {
  id: string;
  href: string;
  label: string;
  /** Una línea que explique qué se hace ahí. El lanzador la muestra. */
  description: string;
  icon: LucideIcon;
  group: ModuleGroup;
  permKey?: keyof Permisos;
  /**
   * Identidad cromática del módulo.
   *
   * Acá el color SÍ cumple una función: en una cuadrícula de veintipico
   * destinos, el color es lo que permite encontrar el que buscás sin leer.
   * Es un sistema de identidad, no decoración — por eso cada módulo tiene un
   * tono fijo y estable, y por eso ese tono NO se usa dentro de la pantalla.
   */
  tint: string;
  /** Términos alternativos para que la búsqueda perdone el vocabulario. */
  keywords?: string[];
}

export const GROUP_LABEL: Record<ModuleGroup, string> = {
  Operacion: 'Operación',
  Clientes: 'Clientes',
  Ventas: 'Ventas',
  Inventario: 'Inventario',
  Finanzas: 'Finanzas',
  Sistema: 'Sistema',
};

export const GROUP_ORDER: readonly ModuleGroup[] = [
  'Operacion', 'Clientes', 'Ventas', 'Inventario', 'Finanzas', 'Sistema',
];

export const MODULES: readonly AppModule[] = [
  { id: 'panel', href: '/dashboard', label: 'Panel', description: 'Resumen del día y métricas del taller', icon: LayoutDashboard, group: 'Operacion', permKey: 'dashboard', tint: '25 95% 53%', keywords: ['inicio', 'home', 'dashboard'] },
  { id: 'agenda', href: '/dashboard/agenda', label: 'Agenda', description: 'Citas y calendario de trabajo', icon: Calendar, group: 'Operacion', permKey: 'agenda', tint: '199 89% 48%', keywords: ['citas', 'calendario'] },
  { id: 'taller', href: '/dashboard/taller', label: 'Taller', description: 'Órdenes de servicio en curso', icon: Wrench, group: 'Operacion', permKey: 'taller', tint: '221 83% 53%', keywords: ['ordenes', 'trabajo'] },
  { id: 'servicios', href: '/dashboard/servicios', label: 'Servicios', description: 'Registro y cobro de servicios', icon: Wrench, group: 'Operacion', permKey: 'servicios', tint: '262 83% 58%', keywords: ['trabajos', 'reparaciones'] },

  { id: 'clientes', href: '/dashboard/clientes', label: 'Clientes', description: 'Ficha, historial y contacto', icon: Users, group: 'Clientes', permKey: 'clientes', tint: '291 64% 52%', keywords: ['personas', 'crm'] },
  { id: 'vehiculos', href: '/dashboard/vehiculos', label: 'Vehículos', description: 'Placas, modelos e historial por carro', icon: Car, group: 'Clientes', permKey: 'vehiculos', tint: '330 81% 55%', keywords: ['carros', 'placas', 'autos'] },
  { id: 'ficha-vehiculo', href: '/dashboard/ficha', label: 'Ficha del vehículo', description: 'Qué se cobra, qué cuesta y qué se gana por carro', icon: Car, group: 'Clientes', permKey: 'vehiculos', tint: '24 95% 48%', keywords: ['utilidad', 'ganancia', 'costos', 'proveedor', 'deuda', 'repuestos', 'placa'] },
  { id: 'whatsapp', href: '/dashboard/whatsapp', label: 'WhatsApp', description: 'Conversaciones y bot de atención', icon: MessageSquare, group: 'Clientes', permKey: 'whatsapp', tint: '142 71% 40%', keywords: ['chat', 'mensajes', 'bot'] },
  { id: 'leads', href: '/dashboard/leads', label: 'Leads', description: 'Prospectos y seguimiento comercial', icon: TrendingUp, group: 'Clientes', permKey: 'leads', tint: '168 76% 36%', keywords: ['prospectos'] },

  { id: 'pos', href: '/dashboard/silenciadores', label: 'Punto de venta', description: 'Cobro rápido en mostrador', icon: ShoppingCart, group: 'Ventas', permKey: 'ventas', tint: '24 95% 48%', keywords: ['pos', 'caja', 'silenciadores', 'cobrar'] },
  { id: 'facturas', href: '/dashboard/facturas', label: 'Facturas', description: 'Emisión y control de facturación', icon: Receipt, group: 'Ventas', permKey: 'ventas', tint: '43 96% 46%', keywords: ['facturacion', 'cobros'] },
  { id: 'presupuestos', href: '/dashboard/presupuestos', label: 'Presupuestos', description: 'Cotizaciones y conversión a venta', icon: FileSpreadsheet, group: 'Ventas', permKey: 'presupuestos', tint: '84 70% 38%', keywords: ['cotizaciones'] },

  { id: 'inventario', href: '/dashboard/inventario', label: 'Inventario', description: 'Stock, precios y movimientos', icon: Package, group: 'Inventario', permKey: 'inventario', tint: '188 86% 38%', keywords: ['stock', 'repuestos', 'almacen'] },
  { id: 'distribucion', href: '/dashboard/distribuidor', label: 'Distribución', description: 'Traslados entre sedes y ganancia', icon: Truck, group: 'Inventario', permKey: 'distribuidor', tint: '217 91% 50%', keywords: ['traslados', 'sedes', 'reparto'] },
  { id: 'papelera', href: '/dashboard/inventario/papelera', label: 'Papelera', description: 'Artículos eliminados recuperables', icon: Trash2, group: 'Inventario', permKey: 'papelera', tint: '215 16% 47%', keywords: ['borrados', 'eliminados'] },

  { id: 'nomina', href: '/dashboard/nomina', label: 'Nómina', description: 'Sueldos, comisiones y adelantos', icon: Banknote, group: 'Finanzas', permKey: 'nomina', tint: '142 60% 32%', keywords: ['sueldos', 'pagos', 'comisiones'] },
  { id: 'reportes', href: '/dashboard/reportes', label: 'Reportes', description: 'Cierre diario, utilidad y exportables', icon: FileText, group: 'Finanzas', permKey: 'reportes', tint: '271 81% 56%', keywords: ['informes', 'cierre', 'pdf'] },
  { id: 'calculadora', href: '/dashboard/calculadora', label: 'Calculadora', description: 'Conversión de moneda y tasas', icon: Calculator, group: 'Finanzas', permKey: 'calculadora', tint: '199 89% 40%', keywords: ['tasa', 'dolar', 'bcv', 'cambio'] },

  { id: 'ia', href: '/dashboard/ia', label: 'Asistente IA', description: 'Consultas en lenguaje natural', icon: Bot, group: 'Sistema', permKey: 'ia_asistente', tint: '250 84% 60%', keywords: ['gemini', 'chat'] },
  { id: 'actividad', href: '/dashboard/actividad', label: 'Actividad', description: 'Auditoría de quién hizo qué', icon: Activity, group: 'Sistema', permKey: 'actividad', tint: '215 20% 45%', keywords: ['logs', 'auditoria', 'historial'] },
  { id: 'configuracion', href: '/dashboard/configuracion', label: 'Configuración', description: 'Ajustes generales del sistema', icon: Settings, group: 'Sistema', permKey: 'configuracion', tint: '215 16% 40%', keywords: ['ajustes'] },
  { id: 'empleados', href: '/dashboard/ajustes/empleados', label: 'Empleados', description: 'Alta, roles y datos del personal', icon: Users, group: 'Sistema', permKey: 'empleados', tint: '27 87% 45%', keywords: ['personal', 'usuarios', 'tecnicos'] },
  { id: 'permisos', href: '/dashboard/ajustes/permisos', label: 'Permisos', description: 'Qué puede hacer cada rol', icon: Shield, group: 'Sistema', permKey: 'empleados', tint: '0 72% 46%', keywords: ['roles', 'accesos', 'seguridad'] },
  { id: 'perfil', href: '/dashboard/perfil', label: 'Mi perfil', description: 'Tus datos y preferencias', icon: UserCircle, group: 'Sistema', tint: '215 20% 50%', keywords: ['cuenta'] },
  { id: 'informacion', href: '/dashboard/informacion', label: 'Información', description: 'Guía de uso del sistema', icon: Info, group: 'Sistema', tint: '215 16% 55%', keywords: ['ayuda', 'manual', 'tutorial'] },
];

/** Quita acentos para que "vehiculos" encuentre "Vehículos". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchModules(modules: readonly AppModule[], query: string): AppModule[] {
  const q = normalize(query);
  if (!q) return [...modules];
  return modules.filter(m => {
    const haystack = [m.label, m.description, GROUP_LABEL[m.group], ...(m.keywords ?? [])]
      .map(normalize)
      .join(' ');
    return q.split(/\s+/).every(term => haystack.includes(term));
  });
}
