-- Crear tabla de roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  permisos JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar roles por defecto con sus permisos CRUD
INSERT INTO roles (nombre, label, descripcion, permisos) VALUES
  ('admin', 'Administrador', 'Acceso total al sistema', '{
    "dashboard": true, "clientes": true, "vehiculos": true, "servicios": true,
    "taller": true, "agenda": true, "whatsapp": true, "leads": true,
    "inventario": true, "papelera": true, "ventas": true, "ia_asistente": true,
    "reportes": true, "actividad": true, "calculadora": true,
    "configuracion": true, "empleados": true, "distribuidor": true, "presupuestos": true
  }'),
  ('gerente', 'Gerente de Sede', 'Gestiona su sede con permisos amplios', '{
    "dashboard": true, "clientes": true, "vehiculos": true, "servicios": true,
    "taller": true, "agenda": true, "whatsapp": true, "leads": true,
    "inventario": true, "papelera": false, "ventas": true, "ia_asistente": true,
    "reportes": true, "actividad": false, "calculadora": true,
    "configuracion": false, "empleados": false, "distribuidor": true, "presupuestos": true
  }'),
  ('empleado', 'Empleado', 'Acceso básico al panel', '{
    "dashboard": true, "clientes": true, "vehiculos": true, "servicios": true,
    "taller": true, "agenda": true, "whatsapp": true, "leads": false,
    "inventario": true, "papelera": false, "ventas": true, "ia_asistente": false,
    "reportes": false, "actividad": false, "calculadora": true,
    "configuracion": false, "empleados": false, "distribuidor": false, "presupuestos": true
  }'),
  ('mecanico_acceso', 'Mecánico (Con Acceso)', 'Técnico con acceso limitado al panel', '{
    "dashboard": true, "clientes": false, "vehiculos": false, "servicios": true,
    "taller": true, "agenda": false, "whatsapp": false, "leads": false,
    "inventario": false, "papelera": false, "ventas": false, "ia_asistente": false,
    "reportes": false, "actividad": false, "calculadora": true,
    "configuracion": false, "empleados": false, "distribuidor": false, "presupuestos": true
  }'),
  ('jefe_taller_acceso', 'Jefe de Taller (Con Acceso)', 'Supervisa taller con acceso al panel', '{
    "dashboard": true, "clientes": true, "vehiculos": true, "servicios": true,
    "taller": true, "agenda": false, "whatsapp": false, "leads": false,
    "inventario": true, "papelera": false, "ventas": true, "ia_asistente": false,
    "reportes": false, "actividad": false, "calculadora": true,
    "configuracion": false, "empleados": false, "distribuidor": false, "presupuestos": true
  }'),
  ('mecanico', 'Mecánico (Sin Acceso)', 'Registro técnico sin acceso al panel', '{
    "dashboard": false, "clientes": false, "vehiculos": false, "servicios": false,
    "taller": false, "agenda": false, "whatsapp": false, "leads": false,
    "inventario": false, "papelera": false, "ventas": false, "ia_asistente": false,
    "reportes": false, "actividad": false, "calculadora": false,
    "configuracion": false, "empleados": false, "distribuidor": false, "presupuestos": false
  }'),
  ('jefe_taller', 'Jefe de Taller (Sin Acceso)', 'Supervisor técnico sin acceso al panel', '{
    "dashboard": false, "clientes": false, "vehiculos": false, "servicios": false,
    "taller": false, "agenda": false, "whatsapp": false, "leads": false,
    "inventario": false, "papelera": false, "ventas": false, "ia_asistente": false,
    "reportes": false, "actividad": false, "calculadora": false,
    "configuracion": false, "empleados": false, "distribuidor": false, "presupuestos": false
  }')
ON CONFLICT (nombre) DO UPDATE SET
  permisos = EXCLUDED.permisos,
  label = EXCLUDED.label,
  descripcion = EXCLUDED.descripcion;

-- Relajar el CHECK constraint de roles para permitir roles personalizados
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

-- Trigger para actualizar updated_at en usuarios
CREATE OR REPLACE FUNCTION update_usuarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS usuarios_updated_at ON usuarios;
CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_usuarios_updated_at();
