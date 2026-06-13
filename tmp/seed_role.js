const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const SUPABASE_URL = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const SUPABASE_KEY = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("Connecting to Supabase...");
  const { data, error } = await supabase.from('roles').insert([
    {
      nombre: 'atencion_cliente',
      label: 'Atención al Cliente',
      descripcion: 'Encargado de atención de citas y Whatsapp',
      permisos: {
        "dashboard": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "clientes": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "vehiculos": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "servicios": { "leer": true, "crear": false, "editar": false, "eliminar": false },
        "taller": { "leer": true, "crear": false, "editar": false, "eliminar": false },
        "agenda": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "whatsapp": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "leads": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "inventario": { "leer": true, "crear": false, "editar": false, "eliminar": false },
        "papelera": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "ventas": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "ia_asistente": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "reportes": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "actividad": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "calculadora": { "leer": true, "crear": true, "editar": true, "eliminar": true },
        "configuracion": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "empleados": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "distribuidor": { "leer": false, "crear": false, "editar": false, "eliminar": false },
        "presupuestos": { "leer": true, "crear": true, "editar": true, "eliminar": true }
      }
    }
  ]).select();
  
  if (error) {
    if (error.code === '23505') {
       console.log("Role already exists!");
    } else {
       console.error("Error inserting role:", error);
    }
  } else {
    console.log("Role inserted successfully!", data);
  }
}
run();
