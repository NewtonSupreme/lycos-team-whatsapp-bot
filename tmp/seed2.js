const http = require('http');

const data = JSON.stringify({
  nombre: 'atencion_cliente',
  label: 'Atención al Cliente',
  descripcion: 'Encargado de atención al público y recepción',
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
  hostname: 'localhost',
  port: 3000,
  path: '/api/roles',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${responseData}`);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
