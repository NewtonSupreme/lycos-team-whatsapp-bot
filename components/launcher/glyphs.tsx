import type { ComponentType } from 'react';

/**
 * Glifos de los módulos.
 *
 * Se dibujan a mano en vez de usar lucide porque el lenguaje es otro: formas
 * geométricas macizas de dos o tres colores planos, sin trazo, que se leen de
 * un vistazo a 40px. Un icono de línea monocromo se pierde en una cuadrícula
 * de veintipico y obliga a leer la etiqueta — que es justo lo que la
 * cuadrícula existe para evitar.
 *
 * Cada glifo mantiene un peso visual parecido para que ninguno grite más que
 * el resto, y usa el mismo radio de esquina que las baldosas.
 */

type Glyph = ComponentType<{ className?: string }>;

const S = { className: undefined as string | undefined };
void S;

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/* ── Operación ─────────────────────────────────────────────────────────── */

export const GlyphPanel: Glyph = ({ className }) => (
  <Svg className={className}>
    <rect x="7" y="24" width="9" height="17" rx="3" fill="#F97316" />
    <rect x="19.5" y="14" width="9" height="27" rx="3" fill="#FB923C" />
    <rect x="32" y="7" width="9" height="34" rx="3" fill="#1F2937" />
  </Svg>
);

export const GlyphAgenda: Glyph = ({ className }) => (
  <Svg className={className}>
    <rect x="6" y="10" width="36" height="32" rx="7" fill="#E0E7FF" />
    <rect x="6" y="10" width="36" height="10" rx="5" fill="#4F46E5" />
    <rect x="14" y="5" width="4.5" height="9" rx="2.25" fill="#312E81" />
    <rect x="29.5" y="5" width="4.5" height="9" rx="2.25" fill="#312E81" />
    <rect x="12" y="26" width="8" height="8" rx="2.5" fill="#4F46E5" />
    <rect x="24" y="26" width="12" height="4" rx="2" fill="#A5B4FC" />
    <rect x="24" y="33" width="8" height="4" rx="2" fill="#A5B4FC" />
  </Svg>
);

export const GlyphTaller: Glyph = ({ className }) => (
  <Svg className={className}>
    <path
      d="M30.5 6a11 11 0 0 0-9.9 15.8L7.6 34.7a4.6 4.6 0 1 0 6.5 6.5l12.9-13a11 11 0 0 0 14-14.6l-6.2 6.2-5.3-1-1-5.3 6.2-6.2A11 11 0 0 0 30.5 6Z"
      fill="#2563EB"
    />
    <circle cx="11" cy="38" r="2.4" fill="#DBEAFE" />
  </Svg>
);

export const GlyphServicios: Glyph = ({ className }) => (
  <Svg className={className}>
    <path
      d="M24 5.5 30 9h7v7l3.5 6-3.5 6v7h-7l-6 3.5L18 35h-7v-7l-3.5-6L11 16V9h7l6-3.5Z"
      fill="#7C3AED"
    />
    <path d="m17.5 23.5 4.5 4.5 9-9.5" stroke="#EDE9FE" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/* ── Clientes ──────────────────────────────────────────────────────────── */

export const GlyphClientes: Glyph = ({ className }) => (
  <Svg className={className}>
    <circle cx="19" cy="17" r="8.5" fill="#C026D3" />
    <path d="M5 41c0-7.7 6.3-14 14-14s14 6.3 14 14H5Z" fill="#F0ABFC" />
    <circle cx="34" cy="20" r="6.5" fill="#86198F" />
    <path d="M28 41c0-5.5 4.5-10 10-10s10 4.5 10 10H28Z" fill="#C026D3" opacity=".55" />
  </Svg>
);

export const GlyphVehiculos: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M6 30c0-1.6.9-3 2.3-3.7l3.4-8.5A6 6 0 0 1 17.3 14h13.4a6 6 0 0 1 5.6 3.8l3.4 8.5A4.2 4.2 0 0 1 42 30v6a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3v-1H14v1a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-6Z" fill="#DB2777" />
    <path d="M14.6 18.7A2 2 0 0 1 16.5 17h15a2 2 0 0 1 1.9 1.7l1.6 6.3H13l1.6-6.3Z" fill="#FBCFE8" />
    <circle cx="14" cy="31" r="2.6" fill="#FBCFE8" />
    <circle cx="34" cy="31" r="2.6" fill="#FBCFE8" />
  </Svg>
);

export const GlyphWhatsapp: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M24 6c-9.9 0-18 7.2-18 16.1 0 5 2.6 9.5 6.7 12.5V43l6.4-3.6c1.6.4 3.2.6 4.9.6 9.9 0 18-7.2 18-16.1S33.9 6 24 6Z" fill="#16A34A" />
    <circle cx="16.5" cy="22" r="2.6" fill="#DCFCE7" />
    <circle cx="24" cy="22" r="2.6" fill="#DCFCE7" />
    <circle cx="31.5" cy="22" r="2.6" fill="#DCFCE7" />
  </Svg>
);

export const GlyphLeads: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M7 34.5 18 23l7 7 12-13.5" stroke="#0D9488" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 14h13v13" stroke="#5EEAD4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/* ── Ventas ────────────────────────────────────────────────────────────── */

export const GlyphPos: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M7 12h5.5l4 20.5A4 4 0 0 0 20.4 36H36" stroke="#EA580C" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.5 17H41l-3.4 13.2a3 3 0 0 1-2.9 2.3H17.6" fill="#FDBA74" />
    <circle cx="20" cy="41" r="3.2" fill="#EA580C" />
    <circle cx="34" cy="41" r="3.2" fill="#EA580C" />
  </Svg>
);

export const GlyphFacturas: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M10 6h28v34.5l-4.7-3.2-4.6 3.2-4.7-3.2-4.7 3.2-4.6-3.2L10 40.5V6Z" fill="#CA8A04" />
    <rect x="16" y="15" width="16" height="3.6" rx="1.8" fill="#FEF9C3" />
    <rect x="16" y="23" width="16" height="3.6" rx="1.8" fill="#FEF9C3" />
    <rect x="16" y="31" width="9" height="3.6" rx="1.8" fill="#FEF9C3" />
  </Svg>
);

export const GlyphPresupuestos: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M9 8a3 3 0 0 1 3-3h15l10 10v25a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V8Z" fill="#65A30D" />
    <path d="M27 5l10 10H30a3 3 0 0 1-3-3V5Z" fill="#D9F99D" />
    <path d="m19 30 4 4 9-10" stroke="#F7FEE7" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/* ── Inventario ────────────────────────────────────────────────────────── */

export const GlyphInventario: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M24 5 42 14v20l-18 9-18-9V14L24 5Z" fill="#0891B2" />
    <path d="M6 14l18 9 18-9" stroke="#CFFAFE" strokeWidth="3.6" strokeLinejoin="round" />
    <path d="M24 23v20" stroke="#CFFAFE" strokeWidth="3.6" />
  </Svg>
);

export const GlyphDistribucion: Glyph = ({ className }) => (
  <Svg className={className}>
    <rect x="4" y="13" width="21" height="19" rx="3" fill="#2563EB" />
    <path d="M25 19h8.5l7.5 7.5V32H25V19Z" fill="#93C5FD" />
    <circle cx="13" cy="35.5" r="4" fill="#1E3A8A" />
    <circle cx="34" cy="35.5" r="4" fill="#1E3A8A" />
  </Svg>
);

export const GlyphPapelera: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M11 14h26l-2.2 25.4A4 4 0 0 1 30.8 43H17.2a4 4 0 0 1-4-3.6L11 14Z" fill="#64748B" />
    <rect x="7" y="8" width="34" height="6" rx="3" fill="#334155" />
    <rect x="19" y="4" width="10" height="5" rx="2.5" fill="#334155" />
    <rect x="18.5" y="21" width="3.4" height="14" rx="1.7" fill="#E2E8F0" />
    <rect x="26" y="21" width="3.4" height="14" rx="1.7" fill="#E2E8F0" />
  </Svg>
);

/* ── Finanzas ──────────────────────────────────────────────────────────── */

export const GlyphNomina: Glyph = ({ className }) => (
  <Svg className={className}>
    <rect x="4" y="11" width="40" height="26" rx="5" fill="#15803D" />
    <circle cx="24" cy="24" r="7.5" fill="#BBF7D0" />
    <path d="M24 19.5v9M21.4 21.6h4a2 2 0 0 1 0 4h-2.8a2 2 0 0 0 0 4h4.2" stroke="#15803D" strokeWidth="2" strokeLinecap="round" />
    <circle cx="11" cy="24" r="2.6" fill="#4ADE80" />
    <circle cx="37" cy="24" r="2.6" fill="#4ADE80" />
  </Svg>
);

export const GlyphReportes: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M24 5a19 19 0 1 0 19 19H24V5Z" fill="#9333EA" />
    <path d="M28 4a19 19 0 0 1 16 16H28V4Z" fill="#E9D5FF" />
  </Svg>
);

export const GlyphCalculadora: Glyph = ({ className }) => (
  <Svg className={className}>
    <rect x="8" y="4" width="32" height="40" rx="6" fill="#0369A1" />
    <rect x="13" y="9" width="22" height="8" rx="2.5" fill="#E0F2FE" />
    <g fill="#7DD3FC">
      <rect x="13" y="21" width="6.5" height="6" rx="2" />
      <rect x="20.8" y="21" width="6.5" height="6" rx="2" />
      <rect x="28.5" y="21" width="6.5" height="6" rx="2" />
      <rect x="13" y="30" width="6.5" height="6" rx="2" />
      <rect x="20.8" y="30" width="6.5" height="6" rx="2" />
    </g>
    <rect x="28.5" y="30" width="6.5" height="6" rx="2" fill="#F97316" />
  </Svg>
);

/* ── Sistema ───────────────────────────────────────────────────────────── */

export const GlyphIa: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M24 4l4.4 11.6L40 20l-11.6 4.4L24 36l-4.4-11.6L8 20l11.6-4.4L24 4Z" fill="#6366F1" />
    <path d="M37 30l1.9 5.1L44 37l-5.1 1.9L37 44l-1.9-5.1L30 37l5.1-1.9L37 30Z" fill="#C7D2FE" />
  </Svg>
);

export const GlyphActividad: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M5 24h8l5-12 8 24 5-12h12" stroke="#475569" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="38" cy="12" r="5" fill="#F97316" />
  </Svg>
);

export const GlyphConfiguracion: Glyph = ({ className }) => (
  <Svg className={className}>
    <path
      d="M24 4.5 29 8h6v6l4 5-4 5v6h-6l-5 3.5L19 30h-6v-6l-4-5 4-5V8h6l5-3.5Z"
      fill="#475569"
      transform="translate(0 5)"
    />
    <circle cx="24" cy="24" r="6.5" fill="#E2E8F0" />
  </Svg>
);

export const GlyphEmpleados: Glyph = ({ className }) => (
  <Svg className={className}>
    <circle cx="24" cy="15" r="8" fill="#C2410C" />
    <path d="M9 42c0-8.3 6.7-15 15-15s15 6.7 15 15H9Z" fill="#FDBA74" />
    <path d="M18 27h12l-2 15h-8l-2-15Z" fill="#C2410C" opacity=".45" />
  </Svg>
);

export const GlyphPermisos: Glyph = ({ className }) => (
  <Svg className={className}>
    <path d="M24 4 40 10v13c0 10-6.8 17.9-16 21-9.2-3.1-16-11-16-21V10l16-6Z" fill="#B91C1C" />
    <path d="m17 24 5 5 10-11" stroke="#FEE2E2" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const GlyphPerfil: Glyph = ({ className }) => (
  <Svg className={className}>
    <circle cx="24" cy="24" r="19" fill="#CBD5E1" />
    <circle cx="24" cy="19" r="7" fill="#475569" />
    <path d="M11.5 38.5a13.5 13.5 0 0 1 25 0 19 19 0 0 1-25 0Z" fill="#475569" />
  </Svg>
);

export const GlyphInformacion: Glyph = ({ className }) => (
  <Svg className={className}>
    <circle cx="24" cy="24" r="19" fill="#0EA5E9" />
    <circle cx="24" cy="14.5" r="3.2" fill="#E0F2FE" />
    <rect x="21" y="20" width="6" height="15" rx="3" fill="#E0F2FE" />
  </Svg>
);

/** Reserva: si un módulo nuevo no trae glifo, no se rompe la cuadrícula. */
export const GlyphDefault: Glyph = ({ className }) => (
  <Svg className={className}>
    <rect x="7" y="7" width="15" height="15" rx="4.5" fill="#94A3B8" />
    <rect x="26" y="7" width="15" height="15" rx="4.5" fill="#CBD5E1" />
    <rect x="7" y="26" width="15" height="15" rx="4.5" fill="#CBD5E1" />
    <rect x="26" y="26" width="15" height="15" rx="4.5" fill="#94A3B8" />
  </Svg>
);

export const GLYPHS: Record<string, Glyph> = {
  panel: GlyphPanel,
  agenda: GlyphAgenda,
  taller: GlyphTaller,
  servicios: GlyphServicios,
  clientes: GlyphClientes,
  vehiculos: GlyphVehiculos,
  whatsapp: GlyphWhatsapp,
  leads: GlyphLeads,
  pos: GlyphPos,
  facturas: GlyphFacturas,
  presupuestos: GlyphPresupuestos,
  inventario: GlyphInventario,
  distribucion: GlyphDistribucion,
  papelera: GlyphPapelera,
  nomina: GlyphNomina,
  reportes: GlyphReportes,
  calculadora: GlyphCalculadora,
  ia: GlyphIa,
  actividad: GlyphActividad,
  configuracion: GlyphConfiguracion,
  empleados: GlyphEmpleados,
  permisos: GlyphPermisos,
  perfil: GlyphPerfil,
  informacion: GlyphInformacion,
};

export function glyphFor(id: string): Glyph {
  return GLYPHS[id] ?? GlyphDefault;
}
