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
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`Starting import of ${data.length - 1} records...`);

  // Map to store existing or newly created clients to handle duplicates
  // Key: cedula OR name+lastname
  const clientsMap = new Map();

  // Fetch existing clients to avoid duplicates if script is re-run
  const { data: existingClientes, error: fetchError } = await supabase.from('clientes').select('id, nombre, apellido, cedula');
  if (fetchError) {
    console.error('Error fetching existing clients:', fetchError);
    return;
  }

  existingClientes.forEach(c => {
    if (c.cedula) clientsMap.set(c.cedula.toString().trim(), c.id);
    clientsMap.set(`${c.nombre.trim().toLowerCase()}|${c.apellido.trim().toLowerCase()}`, c.id);
  });

  // Skip row 0 (headers)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const nombre = (row['DATOS DEL CLIENTE '] || '').toString().trim();
    const apellido = (row['__EMPTY'] || '').toString().trim();
    const cedula = (row['__EMPTY_1'] || '').toString().trim();
    const telefono = (row['__EMPTY_2'] || '').toString().trim();
    const marca = (row['VEHICULO'] || '').toString().trim();
    const modelo = (row['__EMPTY_3'] || '').toString().trim();
    const color = (row['__EMPTY_4'] || '').toString().trim();
    let anio = parseInt(row['__EMPTY_5']);
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
          email: '', // Not in excel
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
      console.log(`Adding vehicle to ${nombre}: ${marca} ${modelo}`);
      const { error: vehicleError } = await supabase
        .from('vehiculos')
        .insert({
          cliente_id: clienteId,
          marca: marca || 'Desconocida',
          modelo: modelo || 'Desconocido',
          color: color || '',
          anio: anio,
          estado: 'activo',
          placa: `TEMP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`, // No plate in excel, generating temp
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
