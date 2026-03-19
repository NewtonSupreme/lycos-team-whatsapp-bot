/* eslint-disable */
/**
 * Script para aplicar la migración de inventario a Supabase
 * Uso: node lib/migrations/apply-migration.js
 */

const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan credenciales de Supabase en .env.local');
  process.exit(1);
}

console.log('Conectando a: ' + SUPABASE_URL);

// All items normalized with IDENTICAL keys (required by PostgREST batch insert)
const inventarioItems = [
  // Liquidos Dr Care
  { nombre: 'Refrigerante Rojo Dr Care - Galon',         codigo: 'REFR-ROJO-GAL',  categoria: 'liquido',         marca: 'Dr Care', descripcion: null, precio_usd: null, precio_bs: null, stock: 4,  stock_minimo: 1, unidad: 'galon',  notas: null, activo: true },
  { nombre: 'Refrigerante Verde Dr Care - Galon',        codigo: 'REFR-VERDE-GAL', categoria: 'liquido',         marca: 'Dr Care', descripcion: null, precio_usd: null, precio_bs: null, stock: 4,  stock_minimo: 1, unidad: 'galon',  notas: null, activo: true },
  { nombre: 'Liquido Limpia Parabrisas Dr Care - Galon', codigo: 'LIMPIA-PAR-GAL', categoria: 'liquido',         marca: 'Dr Care', descripcion: null, precio_usd: null, precio_bs: null, stock: 4,  stock_minimo: 1, unidad: 'galon',  notas: null, activo: true },
  { nombre: 'Liga de Frenos DOT 3 Dr Care - 945ml',      codigo: 'DOT3-945ML',     categoria: 'frenos',          marca: 'Dr Care', descripcion: null, precio_usd: null, precio_bs: null, stock: 6,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  // Filtros de Aceite Cardoc
  { nombre: 'Filtro de Aceite CD 3614 Arauca',   codigo: 'CD-3614',  categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 6, stock_minimo: 1, unidad: 'unidad', notas: 'Arauca',   activo: true },
  { nombre: 'Filtro de Aceite CD 47 Aveo',       codigo: 'CD-47',    categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 6, stock_minimo: 1, unidad: 'unidad', notas: 'Aveo',     activo: true },
  { nombre: 'Filtro de Aceite CD 4967 Corolla',  codigo: 'CD-4967',  categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 6, stock_minimo: 1, unidad: 'unidad', notas: 'Corolla',  activo: true },
  { nombre: 'Filtro de Aceite CD 2C Explorer',   codigo: 'CD-2C',    categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: 'Explorer', activo: true },
  { nombre: 'Filtro de Aceite CD 8 Ford',        codigo: 'CD-8',     categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: 'Ford',     activo: true },
  { nombre: 'Filtro de Aceite CD 5885 Twingo',   codigo: 'CD-5885',  categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: 'Twingo',   activo: true },
  { nombre: 'Filtro de Aceite CD 3682 Nissan',   codigo: 'CD-3682',  categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: 'Nissan',   activo: true },
  { nombre: 'Filtro de Aceite CD 3506 Cavalier', codigo: 'CD-3506',  categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: 'Cavalier', activo: true },
  { nombre: 'Filtro de Aceite CD 96796 Camry',   codigo: 'CD-96796', categoria: 'filtro_aceite', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: 'Camry',    activo: true },
  // Filtros de Gasolina Cardoc
  { nombre: 'Filtro de Gasolina CF 5450 Corolla',     codigo: 'CF-5450', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Corolla',       activo: true },
  { nombre: 'Filtro de Gasolina CF 6020 Macho CA.',   codigo: 'CF-6020', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Macho CA.',     activo: true },
  { nombre: 'Filtro de Gasolina CF 6030 Samuray',     codigo: 'CF-6030', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Samuray',       activo: true },
  { nombre: 'Filtro de Gasolina CF 6040 4.5 Inyec.',  codigo: 'CF-6040', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: '4.5 Inyeccion', activo: true },
  { nombre: 'Filtro de Gasolina CF 831 Trail Blazer', codigo: 'CF-831',  categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Trail Blazer',  activo: true },
  { nombre: 'Filtro de Gasolina CF 580 Blazer',       codigo: 'CF-580',  categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Blazer',        activo: true },
  { nombre: 'Filtro de Gasolina CF 1036 Explorer',    codigo: 'CF-1036', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Explorer',      activo: true },
  { nombre: 'Filtro de Gasolina CF 3442 Lancer CA.',  codigo: 'CF-3442', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Lancer CA.',    activo: true },
  { nombre: 'Filtro de Gasolina CF 1586 Cherokee',    codigo: 'CF-1586', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Cherokee',      activo: true },
  { nombre: 'Filtro de Gasolina CF 5237 Sentra',      codigo: 'CF-5237', categoria: 'filtro_gasolina', marca: 'Cardoc', descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: 'Sentra',        activo: true },
  // Silenciadores
  { nombre: 'Silenciador CL30 (hasta 1.3L)', codigo: 'CL30',  categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 6,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CL60 (3.8L+)',      codigo: 'CL60',  categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 90, precio_bs: null, stock: 11, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CL40 (hasta 1.5L)', codigo: 'CL40',  categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 50, precio_bs: null, stock: 32, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CL27 (hasta 1.3L)', codigo: 'CL27',  categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 5,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CLH40 (1.6-3.7L)',  codigo: 'CLH40', categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 60, precio_bs: null, stock: 5,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CLK60',             codigo: 'CLK60', categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 90, precio_bs: null, stock: 3,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CLP60',             codigo: 'CLP60', categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 90, precio_bs: null, stock: 2,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Silenciador CLC60 (Camion)',     codigo: 'CLC60', categoria: 'silenciador', marca: null, descripcion: null, precio_usd: 90, precio_bs: null, stock: 3,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  // Resonadores
  { nombre: 'Resonador', codigo: 'RESONADOR', categoria: 'resonador', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 7, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  // Colas Cromadas
  { nombre: 'Cola Cromada B55',       codigo: 'COLA-B55',    categoria: 'cola_cromada', marca: null, descripcion: null, precio_usd: null, precio_bs: null, stock: 5, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Cola Cromada Curba',     codigo: 'COLA-CURBA',  categoria: 'cola_cromada', marca: null, descripcion: null, precio_usd: null, precio_bs: null, stock: 2, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Cola Cromada Camioneta', codigo: 'COLA-CAMION', categoria: 'cola_cromada', marca: null, descripcion: null, precio_usd: null, precio_bs: null, stock: 3, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  // Flexibles
  { nombre: 'Flexible 2x4',   codigo: 'FLEX-2X4',   categoria: 'flexible', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 2,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Flexible 2x6',   codigo: 'FLEX-2X6',   categoria: 'flexible', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 19, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Flexible 2x8',   codigo: 'FLEX-2X8',   categoria: 'flexible', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 3,  stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
  { nombre: 'Flexible 1 3/4', codigo: 'FLEX-1-3-4', categoria: 'flexible', marca: null, descripcion: null, precio_usd: 40, precio_bs: null, stock: 10, stock_minimo: 1, unidad: 'unidad', notas: null, activo: true },
];

async function checkTable() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/inventario?limit=1', {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Error verificando tabla inventario:', res.status, body.substring(0, 200));
    console.log('\nDebe ejecutar lib/migrations/001_inventario.sql en el SQL Editor de Supabase:');
    console.log('https://supabase.com/dashboard/project/svazupuylnaxqmtaastz/sql/new');
    return false;
  }
  console.log('Tabla inventario: OK');
  return true;
}

async function insertItems() {
  console.log('Insertando ' + inventarioItems.length + ' items...');

  // Insert one by one to avoid key mismatch issues and handle duplicates gracefully
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of inventarioItems) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/inventario', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(item),
    });

    if (res.status === 201 || res.status === 200) {
      inserted++;
      process.stdout.write('.');
    } else if (res.status === 409) {
      skipped++;
      process.stdout.write('s');
    } else {
      const body = await res.text();
      console.error('\nError en ' + item.codigo + ': ' + res.status + ' ' + body.substring(0, 150));
      errors++;
    }
  }

  console.log('\nInsertados: ' + inserted + ' | Omitidos (ya existian): ' + skipped + ' | Errores: ' + errors);
  return inserted > 0 || skipped > 0;
}

async function verifyItems() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/inventario?select=categoria,nombre,codigo,stock&order=categoria,nombre', {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  });

  if (!res.ok) {
    console.error('Error verificando items');
    return;
  }

  const items = await res.json();
  console.log('\nInventario actual (' + items.length + ' items):');

  const byCategory = {};
  items.forEach(function(item) {
    if (!byCategory[item.categoria]) byCategory[item.categoria] = [];
    byCategory[item.categoria].push('  ' + item.nombre + ' (' + item.codigo + ') — Stock: ' + item.stock);
  });

  Object.keys(byCategory).forEach(function(cat) {
    console.log('\n[' + cat.toUpperCase() + ']');
    byCategory[cat].forEach(function(l) { console.log(l); });
  });
}

async function main() {
  console.log('Aplicando migracion de inventario a Supabase...\n');

  const tableOk = await checkTable();
  if (!tableOk) process.exit(1);

  const ok = await insertItems();
  if (ok) {
    await verifyItems();
    console.log('\nMigracion completada!');
  }
}

main().catch(function(err) {
  console.error('Error fatal:', err);
  process.exit(1);
});
