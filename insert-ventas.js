require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

const sede_id = '310595c5-5258-47fa-9b69-5ad9932685a7';
const fecha_iso = '2026-06-16T22:00:00.000Z'; // Explicit date 10 PM
const fecha_short = '2026-06-16';

const records = [
  { nombre: "Milagro Alvare", cedula: "", tlf: "04242531335", vehiculo: "Honda fit", placa: "AG714TG", anio: null, servicio: "la base de amortiguadores", montoStr: "BCV 90$" },
  { nombre: "Franklin Hernandez", cedula: "6250756", tlf: "4241652881", vehiculo: "Toyota Sky", placa: "AG497KM", anio: 1992, servicio: "Silenciador CLK27", montoStr: "Divisa 40$" },
  { nombre: "Abril Diaz", cedula: "20748329", tlf: "0424-1193576", vehiculo: "Ford", placa: "LBB 50E", anio: 2008, servicio: "Revisión", montoStr: "Pago Movil 5$" },
  { nombre: "Erick Delgado", cedula: "13232095", tlf: "0414-3283735", vehiculo: "Blazer", placa: "AB742MB", anio: 1997, servicio: "Intermedio", montoStr: "BCV 30$" },
  { nombre: "Carmelo", cedula: "", tlf: "0414-2565314", vehiculo: "Aveo lt speed", placa: "AE434RV", anio: 2012, servicio: "vaciado catalizador, 2 gomas y un flexible", montoStr: "" },
  { nombre: "Ramon Landez", cedula: "6128711", tlf: "0412-6886436", vehiculo: "Fiat marea", placa: "MDD 30W", anio: 2000, servicio: "Alineación", montoStr: "BCV 15$" },
  { nombre: "Oscar Barreiros", cedula: "6550400", tlf: "0412-2011556", vehiculo: "Chevrolet troper", placa: "AA647FP", anio: 1993, servicio: "Alineación", montoStr: "BCV 25$" },
  { nombre: "Santo Rodriguez", cedula: "6521061", tlf: "0426-5182972", vehiculo: "Ford Ecosport", placa: "MEV19C", anio: 2007, servicio: "1 metro de tuberia", montoStr: "cashea 50 + iva" },
  { nombre: "Robel Solorzano", cedula: "10869381", tlf: "0414-0180805", vehiculo: "Neon", placa: "MEC18H", anio: 2005, servicio: "Soldadura", montoStr: "Divisa 15$" },
  { nombre: "Maria Blanco", cedula: "16741061", tlf: "0414-9041564", vehiculo: "Chevrolet Spark", placa: "AG597IG", anio: 2013, servicio: "Resonador, silenciador, 1 Goma, revision tren delantero", montoStr: "cashea 125 + IVA" },
  { nombre: "Margery Caldera", cedula: "15.715.406", tlf: "0424-1086763", vehiculo: "Aveo Chevrolet", placa: "AA391ZN", anio: 2005, servicio: "Revisión", montoStr: "5$" }
];

function parseMonto(montoStr) {
  if (!montoStr) return { amount: 0, conIva: false, methods: { 'efectivo_usd': 0 } };
  let str = montoStr.toLowerCase();
  let conIva = str.includes('+ iva');
  let amountMatch = str.match(/\d+(\.\d+)?/);
  let amount = amountMatch ? parseFloat(amountMatch[0]) : 0;
  
  let method = 'efectivo_usd';
  if (str.includes('bcv') || str.includes('pago movil') || str.includes('pago_movil')) {
    method = 'pago_movil';
  } else if (str.includes('cashea')) {
    method = 'cashea';
  }
  
  return { amount, conIva, methods: { [method]: amount } };
}

(async () => {
  let seq = 1000;
  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    const { amount, conIva, methods } = parseMonto(r.montoStr);
    console.log(`Procesando: ${r.nombre} | ${r.servicio} | $${amount}`);

    // Cliente
    let clienteId = null;
    let query = sb.from('clientes').select('id, nombre').eq('sede_id', sede_id);
    if (r.cedula) query = query.eq('cedula', r.cedula);
    else query = query.ilike('nombre', `%${r.nombre}%`);
    
    const { data: clients } = await query;
    if (clients && clients.length > 0) {
      clienteId = clients[0].id;
    } else {
      const { data: nc } = await sb.from('clientes').insert({
        nombre: r.nombre,
        apellido: '',
        cedula: r.cedula || null,
        telefono: r.tlf || '',
        activo: true,
        sede_id: sede_id,
        created_at: fecha_iso,
        updated_at: fecha_iso
      }).select().single();
      clienteId = nc ? nc.id : null;
    }

    // Vehiculo
    let vehiculoId = null;
    let vehiculoInfo = r.vehiculo;
    if (r.placa) {
      const { data: vehs } = await sb.from('vehiculos').select('id, marca, modelo').eq('placa', r.placa).eq('sede_id', sede_id);
      if (vehs && vehs.length > 0) {
        vehiculoId = vehs[0].id;
        vehiculoInfo = `${vehs[0].marca} ${vehs[0].modelo}`;
      } else if (clienteId) {
        const { data: nv } = await sb.from('vehiculos').insert({
          cliente_id: clienteId,
          marca: r.vehiculo,
          modelo: '',
          anio: r.anio,
          placa: r.placa,
          estado: 'activo',
          sede_id: sede_id,
          created_at: fecha_iso,
          updated_at: fecha_iso
        }).select().single();
        vehiculoId = nv ? nv.id : null;
      }
    }

    // Servicio
    const { data: newServ, error: errServ } = await sb.from('servicios').insert({
      cliente_id: clienteId,
      vehiculo_id: vehiculoId,
      nombre_cliente: r.nombre,
      telefono: r.tlf || null,
      vehiculo_info: vehiculoInfo,
      placa: r.placa || null,
      tipo: 'mecanica',
      tipo_personalizado: r.servicio,
      descripcion: r.servicio,
      costo_estimado: amount,
      costo_final: amount,
      estado: 'completada',
      fecha: fecha_short,
      fecha_inicio: fecha_iso,
      fecha_fin: fecha_iso,
      registrado_por: 'Admin',
      sede_id: sede_id,
      created_at: fecha_iso,
      updated_at: fecha_iso,
      seguimiento: [{
        fecha: fecha_iso,
        accion: 'Servicio registrado y completado directamente',
        usuario: 'Admin',
        tipo: 'sistema'
      }]
    }).select().single();
    if (errServ) console.error("Error inserting servicio:", errServ);

    // Ventas Dia
    let total_venta = amount;
    if (conIva) total_venta += amount * 0.16;

    const { error: errVD } = await sb.from('ventas_dia').insert({
      fecha: fecha_short,
      cliente: r.nombre,
      total_ingresos: total_venta,
      total_servicios: 1,
      total_clientes: 1,
      desglose: [{
        descripcion: r.servicio,
        cantidad: 1,
        precio_unitario: amount,
        total: amount
      }],
      metodos_pago: methods,
      tasa_cambio: 36.5,
      con_iva: conIva,
      notas: r.servicio,
      creado_por: 'Admin',
      sede_id: sede_id,
      created_at: fecha_iso,
      updated_at: fecha_iso
      // NO estado column here to avoid check constraint failure
    });
    if (errVD) console.error("Error inserting ventas_dia:", errVD);

    // Facturas
    const { error: errFact } = await sb.from('facturas').insert({
      correlativo: `M-FAC-160626-${seq++}`,
      tipo: 'servicio',
      modulo_origen: 'servicios',
      referencia_id: newServ ? newServ.id : null,
      referencia_tabla: 'servicios',
      cliente: r.nombre,
      vehiculo: `${vehiculoInfo} (${r.placa})`,
      total: total_venta,
      moneda: 'USD',
      tasa_cambio: 36.5,
      total_bs: total_venta * 36.5,
      items: [{
        descripcion: r.servicio,
        cantidad: 1,
        precio_unitario: amount,
        total: amount
      }],
      metodos_pago: methods,
      con_iva: conIva,
      estado: 'pagado',
      notas: r.servicio,
      emitido_por: 'Admin',
      fecha_emision: fecha_iso,
      sede_id: sede_id,
      created_at: fecha_iso,
      updated_at: fecha_iso
    });
    if (errFact) console.error("Error inserting facturas:", errFact);
  }

  console.log("Completado");
})();
