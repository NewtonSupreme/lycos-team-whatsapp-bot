const https = require('https');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const urlObj = new URL(SUPABASE_URL + '/rest/v1/roles');

const data = JSON.stringify({
  nombre: 'atencion_cliente',
  label: 'Atención al Cliente',
  descripcion: 'Encargado de atención al público',
  permisos: {
    "dashboard": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "clientes": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "vehiculos": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "servicios": { "crear": false, "leer": true, "editar": false, "eliminar": false },
    "taller": { "crear": false, "leer": true, "editar": false, "eliminar": false },
    "agenda": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "whatsapp": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "leads": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "inventario": { "crear": false, "leer": true, "editar": false, "eliminar": false },
    "papelera": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "ventas": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "ia_asistente": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "reportes": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "actividad": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "calculadora": { "crear": true, "leer": true, "editar": true, "eliminar": true },
    "configuracion": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "empleados": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "distribuidor": { "crear": false, "leer": false, "editar": false, "eliminar": false },
    "presupuestos": { "crear": true, "leer": true, "editar": true, "eliminar": true }
  }
});

const options = {
  hostname: urlObj.hostname,
  path: urlObj.pathname,
  method: 'POST',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    fs.writeFileSync('tmp/result.json', JSON.stringify({
      status: res.statusCode,
      body: body
    }, null, 2));
  });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
