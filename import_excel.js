const XLSX = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importData() {
  const filePath = path.join(__dirname, 'CLIENTE (1).xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  // Use header: 1 to get raw rows
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`Starting clean import. Total rows in Excel: ${rows.length}`);

  // Cleanup: Delete previous imports from today
  console.log('Cleaning up previous imports...');
  const today = '2026-03-25T04:00:00Z';
  await supabase.from('vehiculos').delete().gte('created_at', today);
  await supabase.from('clientes').delete().gte('created_at', today);

  const clientsMap = new Map();

  // Data starts at row 2 (index 2)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const nombre = (row[0] || '').toString().trim();
    const apellido = (row[1] || '').toString().trim();
    const cedula = (row[2] || '').toString().trim();
    const telefono = (row[3] || '').toString().trim();
    const marca = (row[4] || '').toString().trim();
    const modelo = (row[5] || '').toString().trim();
    const color = (row[6] || '').toString().trim();
    let anio = parseInt(row[7]);
    if (isNaN(anio)) anio = null;

    if (!nombre && !apellido) continue;

    const clientKey = cedula ? cedula : `${nombre.toLowerCase()}|${apellido.toLowerCase()}`;
    let clienteId = clientsMap.get(clientKey);

    if (!clienteId) {
      console.log(`Creating client: ${nombre} ${apellido}`);
      const { data: newClient, error: clientError } = await supabase
        .from('clientes')
        .insert({
          nombre,
          apellido,
          cedula: cedula || null,
          telefono: telefono || '',
          email: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (clientError) {
        console.error(`Error creating client ${nombre} ${apellido}:`, clientError);
        continue;
      }
      clienteId = newClient.id;
      clientsMap.set(clientKey, clienteId);
    }

    if (marca || modelo) {
      console.log(`Adding vehicle to ${nombre}: ${marca} ${modelo} (${color})`);
      const { error: vehicleError } = await supabase
        .from('vehiculos')
        .insert({
          cliente_id: clienteId,
          marca: marca || 'Desconocida',
          modelo: modelo || 'Desconocido',
          color: color || '',
          anio: anio,
          estado: 'activo',
          placa: `TEMP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          created_at: new Date().toISOString()
        });

      if (vehicleError) {
        console.error(`Error creating vehicle for ${nombre}:`, vehicleError);
      }
    }
  }

  console.log('Import finished!');
}

importData();
