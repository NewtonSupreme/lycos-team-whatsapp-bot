-- ============================================================================
--  ROL "REGISTRADOR" — Logística de registro del taller
--  Copia y pega este contenido en el SQL Editor de tu Dashboard de Supabase.
--
--  NOTA: no es estrictamente obligatorio. GET /api/roles sincroniza solo los roles
--  del catálogo que falten en la tabla `roles`. Este script hace lo mismo de forma
--  explícita e inmediata, y es idempotente (puedes correrlo las veces que quieras).
--
--  El Registrador:
--    · Ingresa vehículos al taller (placa, marca, modelo, año).
--    · Define el servicio y COLOCA EL PRECIO (costo_estimado).
--    · Da de alta clientes, agenda citas y crea presupuestos.
--    · Consulta taller, inventario y ventas, pero NO los modifica.
--    · Usa el chatbot de WhatsApp (Modo Dios) confinado a SU sede.
--    · NO elimina nada: la eliminación definitiva es exclusiva del Administrador.
--
--  Todo esto es 100% reconfigurable desde el panel: Ajustes → Permisos por Rol.
--  El chatbot lee esos permisos en vivo (caché de 60 s), así que cualquier cambio
--  que hagas ahí se refleja en WhatsApp sin tocar código ni redeployar.
-- ============================================================================

INSERT INTO public.roles (nombre, label, descripcion, permisos)
VALUES (
  'registrador',
  'Registrador',
  'Logística de registro: ingresa vehículos al taller, define el servicio y coloca los precios.',
  jsonb_build_object(
    -- Núcleo del rol: registrar vehículo + servicio + precio, y su cliente.
    'vehiculos',    jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', false),
    'servicios',    jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', false),
    'clientes',     jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', false),
    'agenda',       jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', false),
    'presupuestos', jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', false),
    -- Acceso al asistente de WhatsApp (Modo Dios).
    'ia_asistente', jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', false),
    -- Herramientas.
    'calculadora',  jsonb_build_object('crear', true,  'leer', true,  'editar', true,  'eliminar', true),
    -- Solo consulta: necesita ver precios y estado del taller para registrar bien.
    'dashboard',    jsonb_build_object('crear', false, 'leer', true,  'editar', false, 'eliminar', false),
    'taller',       jsonb_build_object('crear', false, 'leer', true,  'editar', false, 'eliminar', false),
    'inventario',   jsonb_build_object('crear', false, 'leer', true,  'editar', false, 'eliminar', false),
    'ventas',       jsonb_build_object('crear', false, 'leer', true,  'editar', false, 'eliminar', false),
    'whatsapp',     jsonb_build_object('crear', false, 'leer', true,  'editar', false, 'eliminar', false),
    -- Sin acceso.
    'leads',        jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false),
    'papelera',     jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false),
    'reportes',     jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false),
    'actividad',    jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false),
    'configuracion',jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false),
    'empleados',    jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false),
    'distribuidor', jsonb_build_object('crear', false, 'leer', false, 'editar', false, 'eliminar', false)
  )
)
ON CONFLICT (nombre) DO NOTHING;   -- No pisa una configuración que ya hayas ajustado.

-- Limpiar caché de esquema de Supabase.
NOTIFY pgrst, 'reload schema';

-- Verificación:
-- SELECT nombre, label, permisos FROM public.roles WHERE nombre = 'registrador';
