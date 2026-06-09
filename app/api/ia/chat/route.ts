import { NextRequest, NextResponse } from 'next/server';
import {
  fetchInventario,
  fetchVentasSilenciadores,
  supabase as client
} from '@/lib/supabase';
import { withSedeFilterServer, withSedeInsertServer } from '@/lib/db-filters';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite'
] as const;

async function fetchExchangeRates(): Promise<{ bcv: number; binance: number }> {
  let bcvRate = 0;
  let binanceRate = 0;
  
  // 1. FETCH BCV (Oficial)
  try {
    const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (respBcv.ok) {
      const data = await respBcv.json();
      bcvRate = data.promedio || data.precio || 0;
    }
    
    if (!bcvRate) {
      const respPy = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (respPy.ok) {
        const dataPy = await respPy.json();
        bcvRate = dataPy.monitors?.bcv?.price || 0;
      }
    }
  } catch (e) {
    console.error('Error fetching BCV in IA chat:', e);
  }

  // 2. FETCH BINANCE (P2P)
  try {
    const respBin = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        fiat: "VES", page: 1, rows: 15, tradeType: "BUY", asset: "USDT",
        countries: [], proMerchantAds: false, shieldMerchantAds: false,
        publisherType: null, payTypes: ["PagoMovil"], classifies: ["mass", "profession", "user"]
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000)
    });
    
    if (respBin.ok) {
      const binData = await respBin.json();
      if (binData.data && binData.data.length > 3) {
        const marketAds = binData.data.slice(2, 7);
        binanceRate = marketAds.reduce((acc: number, ad: any) => acc + parseFloat(ad.adv.price), 0) / marketAds.length;
      } else if (binData.data && binData.data.length > 0) {
        binanceRate = parseFloat(binData.data[0].adv.price);
      }
    }
  } catch (e) {
    console.error('Error fetching Binance in IA chat:', e);
  }

  // 3. FALLBACK PARALELO (if Binance fails)
  if (!binanceRate) {
    try {
      const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (tempResp.ok) {
        const tempData = await tempResp.json();
        const parEntry = tempData.find((d: any) => 
          d.nombre?.toLowerCase().includes('paralelo') || 
          d.nombre?.toLowerCase().includes('binance') ||
          d.fuente === 'enparalelovzla'
        );
        if (parEntry) binanceRate = parEntry.promedio || parEntry.precio;
      }
    } catch (e) {}
  }

  // Hard fallbacks if both are 0
  if (!bcvRate) bcvRate = 518.0; // reasonable fallback
  if (!binanceRate) binanceRate = bcvRate * 1.15; // standard spread fallback

  return { bcv: bcvRate, binance: binanceRate };
}

function getVzlaDateTime(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', year: 'numeric', 
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

function getVzlaDateString(): string {
  const now = new Date();
  const options = { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const [{ value: month },,{ value: day },,{ value: year }] = formatter.formatToParts(now);
  return `${year}-${month}-${day}`;
}

// ─── Duplicate-sale protection ─────────────────────────────────────────────────
// Window in minutes during which two identical sales are considered the same one.
// Used both to block accidental duplicates from the AI and to gate the
// "modificar / eliminar venta reciente" actions.
const RECENT_SALE_WINDOW_MIN = 10;

function normalizeStr(v: any): string {
  return (v ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeName(v: any): string {
  return normalizeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '');
}

function fingerprintFromDesglose(desglose: any): string {
  if (!Array.isArray(desglose)) return '';
  return desglose
    .map((it: any) => {
      const desc = normalizeName(it?.descripcion || '');
      const cant = Number(it?.cantidad || 1);
      const price = Number(it?.precio_unitario ?? it?.total ?? 0);
      return `${desc}|${cant}|${price.toFixed(2)}`;
    })
    .sort()
    .join('||');
}

function fingerprintFromItemsString(itemsStr: string): string {
  if (!itemsStr || !itemsStr.includes(':')) return '';
  return itemsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => {
      const [desc, priceStr] = item.split(':');
      const price = parseFloat((priceStr || '0').replace(/[^\d.]/g, '')) || 0;
      return `${normalizeName(desc)}|1|${price.toFixed(2)}`;
    })
    .sort()
    .join('||');
}

function extractMetodoFromMetodosPago(metodos_pago: any): string {
  if (!metodos_pago) return '';
  if (typeof metodos_pago === 'string') {
    try { metodos_pago = JSON.parse(metodos_pago); } catch { return ''; }
  }
  for (const [k, v] of Object.entries(metodos_pago)) {
    if (v && Number(v) > 0) return normalizeStr(k);
  }
  return '';
}

function extractMetodoFromNotas(notas: string): string {
  if (!notas) return '';
  // Legacy silenciador format: "... [Total: $XX (metodo)] | Cliente: ..."
  const m = notas.match(/\(([^)]+)\)/);
  return m ? normalizeStr(m[1]) : '';
}

function minutesSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function getRecentWindowIso(): string {
  return new Date(Date.now() - RECENT_SALE_WINDOW_MIN * 60 * 1000).toISOString();
}

// Look for an identical sale in ventas_dia within the recent window.
// Match criteria: same client (normalized), same total (±$0.01), same items
// (sorted desc|cantidad|precio fingerprint), same payment method.
async function findDuplicateVentaCompleta(
  db: any,
  sedeId: string | null,
  cliente: string,
  total: number,
  itemsStr: string,
  metodo_pago: string
): Promise<any | null> {
  const targetFP = fingerprintFromItemsString(itemsStr);
  const tCliente = normalizeName(cliente || 'consumidor final');
  const tMetodo = normalizeStr(metodo_pago || '');

  const q = withSedeFilterServer(db.from('ventas_dia'), sedeId)
    .select('id, cliente, total_ingresos, desglose, metodos_pago, created_at')
    .gte('created_at', getRecentWindowIso())
    .order('created_at', { ascending: false })
    .limit(30);

  const { data, error } = await q;
  if (error || !data) return null;

  for (const v of data) {
    if (normalizeName(v.cliente) !== tCliente) continue;
    if (Math.abs(Number(v.total_ingresos || 0) - Number(total || 0)) > 0.01) continue;
    if (fingerprintFromDesglose(v.desglose) !== targetFP) continue;
    if (extractMetodoFromMetodosPago(v.metodos_pago) !== tMetodo) continue;
    return v;
  }
  return null;
}

// Look for an identical single-item sale in ventas_silenciadores within the
// recent window. Match criteria: same product, same qty, same price, same
// payment method, same client (when provided).
async function findDuplicateVentaItem(
  db: any,
  sedeId: string | null,
  cliente: string,
  producto: string,
  cantidad: number,
  precio: number,
  metodo_pago: string
): Promise<any | null> {
  const tCliente = normalizeName(cliente || '');
  const tProducto = normalizeName(producto || '');
  const tMetodo = normalizeStr(metodo_pago || '');

  const q = withSedeFilterServer(db.from('ventas_silenciadores'), sedeId)
    .select('id, modelo, cantidad, precio_registrado, notas, created_at, fecha')
    .gte('created_at', getRecentWindowIso())
    .order('created_at', { ascending: false })
    .limit(50);

  const { data, error } = await q;
  if (error || !data) return null;

  for (const v of data) {
    if (normalizeName(v.modelo) !== tProducto) continue;
    if (Number(v.cantidad || 0) !== Number(cantidad || 0)) continue;
    if (Math.abs(Number(v.precio_registrado || 0) - Number(precio || 0)) > 0.01) continue;
    if (extractMetodoFromNotas(v.notas || '') !== tMetodo) continue;
    if (tCliente) {
      // notas contains " | Cliente: X" — make sure it matches.
      if (!normalizeName(v.notas || '').includes(tCliente)) continue;
    }
    return v;
  }
  return null;
}

// Resolve a venta_dia by id, ensuring it belongs to the current sede and is
// still within the "recent" window (so modify/delete can be safely gated).
async function getRecentVentaById(
  db: any,
  sedeId: string | null,
  id: string
): Promise<{ venta: any; ageMin: number } | null> {
  if (!id) return null;
  const q = withSedeFilterServer(db.from('ventas_dia'), sedeId)
    .select('id, cliente, total_ingresos, desglose, metodos_pago, created_at, notas, notes')
    .eq('id', id)
    .maybeSingle();
  const { data, error } = await q;
  if (error || !data) return null;
  const ageMin = minutesSince(data.created_at);
  if (ageMin > RECENT_SALE_WINDOW_MIN) return null;
  return { venta: data, ageMin };
}

// ─── Load Full DB Context using proven lib functions ───────────────────────────
async function loadDbContext(sedeId: string | null): Promise<string> {
  const sections: string[] = [];

  if (!client) return "Error: Supabase no configurado";

  // Helper for server-side queries
  const db = (table: string) => withSedeFilterServer(client!.from(table), sedeId);

  // Fetch Exchange Rates in real-time
  let bcvRate = 0;
  let binanceRate = 0;
  try {
    const rates = await fetchExchangeRates();
    bcvRate = rates.bcv;
    binanceRate = rates.binance;
    sections.push(
      `=== TASAS DE CAMBIO EN TIEMPO REAL ===\n` +
      `• Tasa Oficial BCV: Bs. ${bcvRate.toFixed(2)} / USD\n` +
      `• Tasa Paralela / Binance P2P: Bs. ${binanceRate.toFixed(2)} / USD\n` +
      `• Ratio de Conversión (Binance/BCV): ${(binanceRate / bcvRate).toFixed(4)}`
    );
  } catch (e) {
    sections.push(`=== TASAS DE CAMBIO: Error al cargar (${e}) ===`);
  }

  // Clientes
  try {
    const { data: clientes } = await db('clientes').select('*, vehiculos(*)').order('created_at', { ascending: false });
    if (clientes && clientes.length > 0) {
      sections.push(
        `=== CLIENTES REGISTRADOS (${clientes.length}) ===\n` +
        clientes.map((c: any) =>
          `• ID:${c.id} | ${c.nombre} ${c.apellido} | Teléfono: ${c.telefono} | Email: ${c.email || 'N/A'} | CI: ${c.cedula || 'N/A'} | Dirección: ${c.direccion || 'N/A'} | Vehículos: ${c.vehiculos?.length ?? 0}`
        ).join('\n')
      );
    } else {
      sections.push('=== CLIENTES: Sin registros ===');
    }
  } catch (e) {
    sections.push(`=== CLIENTES: Error al cargar (${e}) ===`);
  }

  // Vehículos
  try {
    const { data: vehiculos } = await db('vehiculos').select('*, clientes(nombre, apellido, telefono)').order('created_at', { ascending: false });
    if (vehiculos && vehiculos.length > 0) {
      sections.push(
        `=== VEHÍCULOS REGISTRADOS (${vehiculos.length}) ===\n` +
        vehiculos.map((v: any) =>
          `• ID:${v.id} | ${v.marca} ${v.modelo} ${v.anio} | Placa: ${v.placa} | Color: ${v.color || '-'} | KM: ${v.kilometraje || '-'} | Estado: ${v.estado} | Dueño: ${v.clientes?.nombre || '-'} ${v.clientes?.apellido || ''} | Tel dueño: ${v.clientes?.telefono || '-'}`
        ).join('\n')
      );
    } else {
      sections.push('=== VEHÍCULOS: Sin registros ===');
    }
  } catch (e) {
    sections.push(`=== VEHÍCULOS: Error al cargar (${e}) ===`);
  }

  // Citas
  try {
    const { data: citas } = await db('citas').select('*, cliente:clientes(nombre, apellido), vehiculo:vehiculos(marca, modelo, placa)').order('fecha', { ascending: true });
    if (citas && citas.length > 0) {
      sections.push(
        `=== CITAS REGISTRADAS (${citas.length}) ===\n` +
        citas.map((c: any) =>
          `• ID:${c.id} | Fecha: ${c.fecha} | Hora: ${c.hora} | Estado: ${c.estado.toUpperCase()} | Cliente: ${c.cliente?.nombre || '-'} ${c.cliente?.apellido || ''} | Teléfono: ${c.telefono || '-'} | Servicio: ${c.descripcion || c.tipo_servicio} | Vehículo: ${c.vehiculo?.marca || '-'} ${c.vehiculo?.modelo || ''} (${c.vehiculo?.placa || '-'})`
        ).join('\n')
      );
    } else {
      sections.push('=== CITAS: Sin citas registradas ===');
    }
  } catch (e) {
    sections.push(`=== CITAS: Error al cargar (${e}) ===`);
  }

  // Servicios
  try {
    const { data: servicios } = await db('servicios').select('*, vehiculos(marca, modelo, placa, clientes(nombre, apellido))').order('created_at', { ascending: false });
    if (servicios && servicios.length > 0) {
      sections.push(
        `=== ÓRDENES DE SERVICIO (${servicios.length}) ===\n` +
        servicios.map((s: any) =>
          `• ID:${s.id} | Fecha: ${s.fecha || s.created_at.split('T')[0]} ${s.hora || ''} | Estado: ${s.estado} | Tipo: ${s.tipo}${s.tipo_personalizado ? ` (${s.tipo_personalizado})` : ''} | ${s.descripcion || '—'} | Cliente: ${s.nombre_cliente || s.vehiculos?.clientes?.nombre || '—'} ${s.vehiculos?.clientes?.apellido || ''}${s.telefono ? ' | Tel: ' + s.telefono : ''} | Vehículo: ${s.vehiculos?.marca || ''} ${s.vehiculos?.modelo || ''}${s.vehiculos?.placa ? ' (' + s.vehiculos?.placa + ')' : ''}${s.vehiculo_info ? ' [' + s.vehiculo_info + ']' : ''} | Costo estimado: $${s.costo_estimado ?? '-'}${s.costo_final ? ` | Costo final: $${s.costo_final}` : ''}${s.seguimiento?.length ? ` | Seguimiento: ${s.seguimiento.map((e: any) => `${e.accion} (${e.fecha.split('T')[0]})`).join(', ')}` : ''}`
        ).join('\n')
      );
    } else {
      sections.push('=== SERVICIOS: Sin órdenes ===');
    }
  } catch (e) {
    sections.push(`=== SERVICIOS: Error al cargar (${e}) ===`);
  }

  // Inventario
  try {
    const { data: inventario } = await db('inventario').select('*').eq('activo', true).order('orden', { ascending: true });
    if (inventario && inventario.length > 0) {
      sections.push(
        `=== INVENTARIO (${inventario.length} productos) — Tasa BCV actual: ${bcvRate > 0 ? `Bs.${bcvRate.toFixed(2)}/$` : 'N/D'} | Tasa Binance P2P: ${binanceRate > 0 ? `Bs.${binanceRate.toFixed(2)}/$` : 'N/D'} ===\n` +
        inventario.map((i: any) =>
          `• INV_ID:${i.id} | ${i.nombre} | Stock: ${i.stock} | Precio Divisas: $${i.precio_usd ?? '-'} | Precio BCV: Bs.${i.precio_bs ?? '-'}${bcvRate > 0 && i.precio_bs ? ` (~$${(i.precio_bs / bcvRate).toFixed(2)})` : ''} | ${i.unidad || 'unidad'}${i.notas ? ' | ' + i.notas : ''}`
        ).join('\n')
      );
    } else {
      sections.push('=== INVENTARIO: Sin productos activos ===');
    }
  } catch (e) {
    sections.push(`=== INVENTARIO: Error al cargar (${e}) ===`);
  }

  // Ventas de Silenciadores (Últimos 30 días)
  try {
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const { data: ventas } = await db('ventas_silenciadores').select('*').gte('fecha', last30.toISOString()).order('fecha', { ascending: false });
    if (ventas && ventas.length > 0) {
      const ventasHoy = ventas.filter((v: any) => {
        const vFecha = v.fecha?.split('T')[0];
        const hoy = new Date().toISOString().split('T')[0];
        return vFecha === hoy;
      });
      const ventasAyer = ventas.filter((v: any) => {
        const vFecha = v.fecha?.split('T')[0];
        const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        return vFecha === ayer;
      });
      sections.push(
        `=== VENTAS SILENCIADORES (Últimos 30 días, ${ventas.length} totales) ===\n` +
        `📊 HOY: ${ventasHoy.length} ventas | AYER: ${ventasAyer.length} ventas\n` +
        ventas.slice(0, 50).map((v: any) => {
          const notas = v.notas || '';
          return `• ${new Date(v.fecha).toLocaleDateString('es-VE')} | ${v.modelo || 'Sin modelo'} x${v.cantidad} | $${v.precio_registrado || 0} | ${notas || 'Sin notas'}`;
        }).join('\n')
      );
    } else {
      sections.push('=== VENTAS SILENCIADORES: Sin registros en los últimos 30 días ===');
    }
  } catch (e) {
    console.error('Error loading sales:', e);
  }

  // Ventas del Día (POS) — ventas_dia
  try {
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const { data: ventasDia } = await db('ventas_dia').select('*').gte('created_at', last30.toISOString()).order('created_at', { ascending: false });
    if (ventasDia && ventasDia.length > 0) {
      const ventasHoy = ventasDia.filter((v: any) => v.created_at?.split('T')[0] === new Date().toISOString().split('T')[0]);
      const totalHoyUSD = ventasHoy.reduce((sum: number, v: any) => sum + Number(v.total_ingresos || 0), 0);
      sections.push(
        `=== VENTAS POS (Últimos 30 días, ${ventasDia.length} totales) ===\n` +
        `📊 HOY: ${ventasHoy.length} ventas | Total HOY: $${totalHoyUSD.toFixed(2)}\n` +
        ventasDia.slice(0, 30).map((v: any) => {
          const items = v.desglose?.items?.map((i: any) => `${i.nombre || i.producto || ''} x${i.cantidad || 1}`).join(', ') || v.notas || '';
          const pago = v.metodos_pago ? Object.entries(v.metodos_pago).filter(([_, val]) => val).map(([k]) => k).join(', ') : '';
          return `• ${new Date(v.created_at).toLocaleDateString('es-VE')} | Cliente: ${v.nombre_cliente || 'Consumidor Final'} | Items: ${items} | Total: $${v.total_ingresos || 0} | Pago: ${pago || 'N/E'}`;
        }).join('\n')
      );
    }
  } catch (e) {
    console.error('Error loading POS sales:', e);
  }

  // Cierres de Caja
  try {
    const last90 = new Date();
    last90.setDate(last90.getDate() - 90);
    const { data: cierres } = await db('cierres_caja').select('*').gte('created_at', last90.toISOString()).order('created_at', { ascending: false }).limit(10);
    if (cierres && cierres.length > 0) {
      sections.push(
        `=== CIERRES DE CAJA RECIENTES (${cierres.length}) ===\n` +
        cierres.map((c: any) =>
          `• ${c.fecha?.split('T')[0] || c.created_at?.split('T')[0]} | Período: ${c.periodo || 'N/E'} | Total USD: $${c.total_ingresos_usd || 0} | Total Bs: Bs.${c.total_bs || 0} | Tasa: ${c.tasa_bcv || 'N/A'} | Ventas: ${c.total_ventas || 0} | Notas: ${c.notas || '—'}`
        ).join('\n')
      );
    }
  } catch (e) {
    // Silently fail — cierres_caja table may not exist
  }

  // Tracking de Vehículos en Taller (servicios activos)
  try {
    const { data: enTaller } = await db('servicios')
      .select('*, vehiculos(marca, modelo, placa, clientes(nombre, apellido, telefono))')
      .in('estado', ['en_proceso', 'pendiente', 'en_revision'])
      .order('created_at', { ascending: false });
    if (enTaller && enTaller.length > 0) {
      sections.push(
        `=== VEHÍCULOS ACTUALMENTE EN TALLER (${enTaller.length}) ===\n` +
        enTaller.map((s: any) =>
          `• ${s.vehiculos?.marca || 'S/M'} ${s.vehiculos?.modelo || ''} (${s.vehiculos?.placa || 'S/P'}) — Cliente: ${s.vehiculos?.clientes?.nombre || 'Consumidor Final'} ${s.vehiculos?.clientes?.apellido || ''} | Servicio: ${s.descripcion} | Estado: ${s.estado} | Costo: $${s.costo_final ?? s.costo_estimado ?? '-'}`
        ).join('\n')
      );
    } else {
      sections.push('=== VEHÍCULOS EN TALLER: Ninguno actualmente ===');
    }
  } catch (e) {
    console.error('Error loading taller tracking:', e);
  }

  // Empleados / Usuarios de la sede
  try {
    const { data: emps } = await db('usuarios').select('username, nombre, rol');
    if (emps && emps.length > 0) {
      sections.push(
        `=== EQUIPO / EMPLEADOS DE LA SEDE ===\n` +
        emps.map((e: any) => `• ${e.nombre || e.username} (${e.rol})`).join('\n')
      );
    }
  } catch (e) {
    console.error('Error loading employees:', e);
  }

  // Actividad de WhatsApp (Hoy)
  try {
    const today = new Date().toISOString().split('T')[0];
    const { count: msgsHoy } = await db('mensajes_whatsapp').select('*', { count: 'exact', head: true }).gte('created_at', today);
    const { count: convsActivas } = await db('conversaciones').select('*', { count: 'exact', head: true }).eq('estado', 'activa');
    
    sections.push(
      `=== ACTIVIDAD BOT WHATSAPP HOY ===\n` +
      `• Mensajes procesados hoy: ${msgsHoy || 0}\n` +
      `• Conversaciones activas en este momento: ${convsActivas || 0}`
    );
  } catch (e) {
    console.error('Error loading wa activity:', e);
  }

  return sections.join('\n\n');
}

// ─── Execute Write Actions ─────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

async function executeActions(text: string, sedeId: string | null): Promise<{ clean: string; results: string[] }> {
  const db = getAdminDb();
  const results: string[] = [];
  let clean = text;

  // Track newly created IDs so subsequent actions can reference them
  const createdIds: Record<string, string> = {};

  // Track fingerprints of ventas created earlier in THIS batch, so a
  // second identical [ACTION: registrar_venta_*] in the same AI response
  // is also blocked (in addition to the DB-level duplicate check).
  const justCreatedVentaCompleta = new Set<string>();
  const justCreatedVentaItem = new Set<string>();

  const table = (name: string) => withSedeFilterServer(db!.from(name), sedeId);
  const insert = async (name: string, data: any) => db!.from(name).insert(withSedeInsertServer(data, sedeId)).select();

  for (const match of [...text.matchAll(/\[ACTION:\s*([^\]]+)\]/g)]) {
    clean = clean.replace(match[0], '').trim();
    if (!db) continue;
    const parts = match[1].split('|').map((s: string) => s.trim());
    const tipo = parts[0];
    const p: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
      const idx = parts[i].indexOf('=');
      if (idx > 0) p[parts[i].slice(0, idx).trim()] = parts[i].slice(idx + 1).trim();
    }
    try {
      // ── Appointments ────────────────────────────────────────────────────────
      if (tipo === 'crear_cita') {
        const { data: citaData, error: citaError } = await insert('citas', {
          fecha: p.fecha, hora: p.hora || '09:00', telefono: p.telefono || '',
          descripcion: p.descripcion || 'Cita por asistente IA',
          tipo_servicio: p.tipo_servicio || 'otro', estado: 'pendiente', duracion_minutos: 60,
          nombre_cliente: p.nombre_cliente || '',
          vehiculo_info: p.vehiculo || '',
          placa: p.placa || '',
        });
        if (citaError) throw citaError;
        results.push(`✅ Cita creada: ${p.fecha} a las ${p.hora || '09:00'} para ${p.nombre_cliente || 'sin nombre'} (${p.vehiculo || 'sin vehículo'})`);

      } else if (tipo === 'actualizar_cita') {
        const updates: Record<string, any> = {};
        if (p.estado) updates.estado = p.estado;
        if (p.hora) updates.hora = p.hora;
        if (p.descripcion) updates.descripcion = p.descripcion;
        await table('citas').update(updates).eq('id', p.id);
        results.push(`✅ Cita actualizada (ID: ${p.id})`);

      // ── Inventory ───────────────────────────────────────────────────────────
      } else if (tipo === 'actualizar_stock') {
        const { data: inv } = await table('inventario')
          .update({ stock: Number(p.stock), updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Stock de "${inv?.nombre}" → ${p.stock} unidades`);

      } else if (tipo === 'descontar_stock') {
        // Safely decrement stock by cantidad, never below 0
        const { data: invItem } = await table('inventario').select('stock, nombre').eq('id', p.id).single();
        if (invItem) {
          const qty = parseInt(p.cantidad) || 1;
          const newStock = Math.max(0, (invItem.stock || 0) - qty);
          await table('inventario').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', p.id);
          results.push(`✅ Stock de "${invItem.nombre}" descontado: ${invItem.stock} → ${newStock}`);
        } else {
          results.push(`⚠️ Producto ID ${p.id} no encontrado para descontar stock`);
        }

      } else if (tipo === 'eliminar_producto') {
        const { data: inv } = await table('inventario')
          .update({ activo: false, updated_at: new Date().toISOString() })
          .eq('id', p.id).select('nombre').single();
        results.push(`✅ Producto "${inv?.nombre}" eliminado del inventario activo`);

      // ── Clients ─────────────────────────────────────────────────────────────
      } else if (tipo === 'crear_cliente') {
        // Check if client already exists to avoid duplicates
        const { data: existing } = await table('clientes')
          .select('id, nombre, apellido')
          .ilike('nombre', p.nombre || '')
          .ilike('apellido', p.apellido || '')
          .maybeSingle();
        
        if (existing) {
          createdIds['last_cliente_id'] = existing.id;
          results.push(`ℹ️ Cliente "${existing.nombre} ${existing.apellido}" ya existía (ID: ${existing.id})`);
        } else {
          const { data: newCliente } = await insert('clientes', {
            nombre: p.nombre, apellido: p.apellido || '', telefono: p.telefono || '',
            email: p.email || '', cedula: p.cedula || '',
            updated_at: new Date().toISOString(),
          });
          if (newCliente?.[0]) {
            createdIds['last_cliente_id'] = newCliente[0].id;
            results.push(`✅ Cliente "${p.nombre} ${p.apellido || ''}" registrado (ID: ${newCliente[0].id})`);
          }
        }

      // ── Vehicles ────────────────────────────────────────────────────────────
      } else if (tipo === 'crear_vehiculo') {
        const clienteId = p.cliente_id || createdIds['last_cliente_id'] || null;
        if (!clienteId) {
          results.push(`⚠️ crear_vehiculo: cliente_id requerido. Usa crear_cliente primero.`);
        } else {
          // Check if vehicle already exists by placa
          let existingVeh = null;
          if (p.placa) {
            const { data: ev } = await table('vehiculos').select('id').ilike('placa', p.placa).maybeSingle();
            existingVeh = ev;
          }
          if (existingVeh) {
            createdIds['last_vehiculo_id'] = existingVeh.id;
            results.push(`ℹ️ Vehículo placa ${p.placa} ya existe (ID: ${existingVeh.id})`);
          } else {
            const { data: newVeh } = await insert('vehiculos', {
              cliente_id: clienteId,
              marca: p.marca || 'No especificado',
              modelo: p.modelo_vehiculo || p.modelo || 'No especificado',
              placa: p.placa || null,
              anio: parseInt(p.anio) || 2000,
              color: p.color || null,
              estado: 'activo',
            });
            if (newVeh?.[0]) {
              createdIds['last_vehiculo_id'] = newVeh[0].id;
              results.push(`✅ Vehículo ${p.marca || ''} placa ${p.placa || 'S/P'} registrado para el cliente`);
            }
          }
        }

      // ── Services (servicios table) ────────────────────────────────────────
      } else if (tipo === 'actualizar_servicio') {
        const now = new Date().toISOString();
        const updates: any = { estado: p.estado, updated_at: now };
        const seguimientoEntry = {
          fecha: now, accion: `Estado actualizado a: ${p.estado}`,
          usuario: 'Admin IA', tipo: 'sistema',
        };
        if (p.nota) seguimientoEntry.accion += ` — ${p.nota}`;
        const { data: existing } = await table('servicios').select('seguimiento').eq('id', p.id).single();
        const seguimiento = existing?.seguimiento ? [...existing.seguimiento, seguimientoEntry] : [seguimientoEntry];
        updates.seguimiento = seguimiento;
        await table('servicios').update(updates).eq('id', p.id);
        results.push(`✅ Servicio #${p.id} actualizado → ${p.estado}`);

      } else if (tipo === 'registrar_servicio') {
        const now = new Date();
        const insertData: any = {
          descripcion: p.descripcion || 'Servicio registrado por IA',
          tipo: p.tipo || 'otro',
          estado: p.estado || 'pendiente',
          fecha: p.fecha || now.toISOString().split('T')[0],
          hora: p.hora || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          seguimiento: [{
            fecha: now.toISOString(),
            accion: 'Registrado por asistente IA',
            usuario: 'Admin IA',
            tipo: 'sistema',
            progreso: 0,
          }],
        };
        if (p.cliente_id) insertData.cliente_id = p.cliente_id;
        if (p.vehiculo_id) insertData.vehiculo_id = p.vehiculo_id;
        if (p.nombre_cliente) insertData.nombre_cliente = p.nombre_cliente;
        if (p.telefono) insertData.telefono = p.telefono;
        if (p.vehiculo_info) insertData.vehiculo_info = p.vehiculo_info;
        if (p.placa) insertData.placa = p.placa.toUpperCase();
        if (p.costo_estimado) insertData.costo_estimado = parseFloat(p.costo_estimado);
        if (p.tipo_personalizado) insertData.tipo_personalizado = p.tipo_personalizado;
        await insert('servicios', insertData);
        results.push(`✅ Trabajo en taller creado: ${insertData.descripcion}`);

      // ── Sales ───────────────────────────────────────────────────────────────
      } else if (tipo === 'registrar_venta_item') {
        // Register one item. Also decrements stock automatically if inv_id is provided.
        const metodo = p.metodo_pago || p.context || '';
        const contextStr = metodo ? ` (${metodo})` : '';
        const clienteNombre = p.cliente || null;
        const vehiculoInfo = p.vehiculo ? ` | Vehículo: ${p.vehiculo}` : '';
        const clienteStr = clienteNombre ? ` | Cliente: ${clienteNombre}` : '';
        const notasFinales = (
          `${p.notas || ''} [Total: $${p.precio || '0'}${contextStr}]${clienteStr}${vehiculoInfo}`.trim()
        );

        const precioNum = parseFloat(p.precio || '0');
        const producto = p.producto || p.modelo || '';
        const cantidad = parseInt(p.cantidad) || 1;

        // ── Duplicate protection ────────────────────────────────────────────
        const fpKey = [
          normalizeName(clienteNombre || ''),
          normalizeName(producto),
          cantidad,
          precioNum.toFixed(2),
          normalizeStr(metodo || ''),
        ].join('::');
        if (justCreatedVentaItem.has(fpKey)) {
          results.push(`⚠️ Venta duplicada omitida en este mismo mensaje: ${cantidad}x ${producto} → $${precioNum}${contextStr}${clienteStr} (ya la ibas a registrar).`);
        } else {
          const dup = await findDuplicateVentaItem(db, sedeId, clienteNombre || '', producto, cantidad, precioNum, metodo);
          if (dup) {
            const ageMin = minutesSince(dup.created_at || dup.fecha);
            results.push(`⚠️ Venta duplicada omitida — ya registraste ${cantidad}x ${producto} por $${precioNum}${contextStr}${clienteStr} hace ${ageMin} min. Si fue un error, dime "modifica esa venta" o "elimina esa venta" y lo corrijo (solo es posible dentro de los próximos ${RECENT_SALE_WINDOW_MIN} min).`);
            justCreatedVentaItem.add(fpKey);
          } else {
            justCreatedVentaItem.add(fpKey);

            const ventaFechaItem = p.fecha || new Date().toISOString();
            const hoyStrItem = new Date().toISOString().split('T')[0];
            const esRegistroAtrasadoItem = ventaFechaItem.split('T')[0] !== hoyStrItem;

            await insert('ventas_silenciadores', {
              cantidad,
              modelo: producto || null,
              notas: notasFinales,
              fecha: ventaFechaItem,
              precio_registrado: precioNum,
              fecha_registro: new Date().toISOString(),
              registro_atrasado: esRegistroAtrasadoItem,
            });

            // Auto-decrement stock if inventory ID provided
            if (p.inv_id) {
              const { data: invItem } = await table('inventario').select('stock, nombre').eq('id', p.inv_id).single();
              if (invItem) {
                const newStock = Math.max(0, (invItem.stock || 0) - cantidad);
                await table('inventario').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', p.inv_id);
                results.push(`✅ Venta: ${cantidad}x ${producto} → $${p.precio || '0'}${contextStr}${clienteStr}. Stock "${invItem.nombre}": ${invItem.stock} → ${newStock}`);
              } else {
                results.push(`✅ Venta: ${producto} → $${p.precio || '0'}${contextStr}${clienteStr} (stock no actualizado — ID no encontrado)`);
              }
            } else {
              results.push(`✅ Venta registrada: ${cantidad}x ${producto} → $${p.precio || '0'}${contextStr}${clienteStr}`);
            }
          }
        }

      } else if (tipo === 'registrar_venta_completa') {
        // NEW: Register ALL items of a sale in ONE consolidated record
        // items format: "Producto1:precio1,Producto2:precio2"
        const metodo = p.metodo_pago || '';
        const contextStr = metodo ? ` (${metodo})` : '';
        const clienteNombre = p.cliente || 'Consumidor Final';
        const clienteStr = p.cliente ? ` | Cliente: ${p.cliente}` : '';
        const vehiculoStr = p.vehiculo ? ` | Vehículo: ${p.vehiculo}` : '';
        const pagoMixtoStr = p.pago_mixto ? ` | Pagos: ${p.pago_mixto}` : '';

        // Build items string from p.items ("CL40:50,Tubería:20")
        let itemsDisplay = p.items || p.producto || 'Varios';
        const totalStr = p.total ? ` | Total: $${p.total}${contextStr}` : '';
        const ivaStr = p.iva ? ` | IVA 16%: $${p.iva}` : '';
        const inicialStr = p.inicial ? ` | Inicial Cashea: $${p.inicial}` : '';

        const notasFinales = `Items: ${itemsDisplay}${totalStr}${ivaStr}${inicialStr}${clienteStr}${vehiculoStr}${pagoMixtoStr}`.trim();

        const totalNum = parseFloat(p.total || '0');

        // ── Duplicate protection ────────────────────────────────────────────
        const fpKey = [
          fingerprintFromItemsString(p.items || ''),
          totalNum.toFixed(2),
          normalizeName(clienteNombre),
          normalizeStr(metodo),
        ].join('::');
        let skipInsertion = false;
        if (justCreatedVentaCompleta.has(fpKey)) {
          results.push(`⚠️ Venta duplicada omitida en este mismo mensaje: ${itemsDisplay} → $${p.total || '0'}${contextStr}${clienteStr} (ya la ibas a registrar).`);
          skipInsertion = true;
        } else {
          const dup = await findDuplicateVentaCompleta(db, sedeId, clienteNombre, totalNum, p.items || '', metodo);
          if (dup) {
            const ageMin = minutesSince(dup.created_at);
            results.push(`⚠️ Venta duplicada omitida — ya registraste ${itemsDisplay} por $${totalNum.toFixed(2)}${contextStr}${clienteStr} hace ${ageMin} min. Si fue un error, dime "modifica esa venta" o "elimina esa venta" y lo corrijo (solo es posible dentro de los próximos ${RECENT_SALE_WINDOW_MIN} min).`);
            skipInsertion = true;
          }
        }

        if (!skipInsertion) {
          justCreatedVentaCompleta.add(fpKey);

          const rates = await fetchExchangeRates().catch(() => ({ bcv: 518.0, binance: 595.0 }));
          const bcvRate = rates?.bcv || 518.0;

          // Parse fecha — if provided by user, use it; otherwise default to today
          const ventaFecha = p.fecha || getVzlaDateString();
          const hoyStr = new Date().toISOString().split('T')[0];
          const esRegistroAtrasado = ventaFecha !== hoyStr;
          const nowIso = new Date().toISOString();

          // 1. Insert into ventas_dia (Accounting)
          let desglose = [{
            descripcion: p.titulo || itemsDisplay.split(',')[0]?.split(':')[0] || 'Varios',
            highlight: false,
            cantidad: parseInt(p.cantidad) || 1,
            precio_unitario: totalNum,
            total: totalNum
          }];

          if (p.items && p.items.includes(':')) {
            desglose = p.items.split(',').map((item: string) => {
              const parts = item.trim().split(':');
              const desc = parts[0]?.trim() || item.trim();
              const priceStr = parts[1]?.replace(/[^\d.]/g, '') || '0';
              const price = parseFloat(priceStr) || 0;
              return { descripcion: desc, highlight: false, cantidad: 1, precio_unitario: price, total: price };
            });
          }

          const { data: newVentaDia, error: errDia } = await db.from('ventas_dia').insert(withSedeInsertServer({
            fecha: ventaFecha,
            cliente: clienteNombre,
            total_ingresos: totalNum,
            desglose,
            con_iva: !!p.iva,
            tasa_cambio: bcvRate,
            notes: notasFinales,
            notas: notasFinales,
            creado_por: 'Admin IA',
            fecha_registro: nowIso,
            registro_atrasado: esRegistroAtrasado,
            metodos_pago: {
              otro: metodo === 'otro' ? totalNum : 0,
              zelle: metodo === 'zelle' ? totalNum : 0,
              cashea: metodo === 'cashea_bcv' ? totalNum : 0,
              binance: metodo === 'binance' ? totalNum : 0,
              pago_movil: metodo === 'pago_movil' ? totalNum : 0,
              efectivo_usd: (metodo === 'divisas' || metodo === 'efectivo_usd') ? totalNum : 0,
              efectivo_ves: metodo === 'efectivo_ves' ? totalNum : 0,
              transferencia: metodo === 'transferencia' ? totalNum : 0,
              punto_de_venta: metodo === 'punto_venta' ? totalNum : 0,
              euros: (metodo === 'euros' || metodo === 'efectivo_eur') ? totalNum : 0
            }
          }, sedeId)).select('id').single();

          if (errDia) {
            console.error('Error inserting ventas_dia in IA Chat:', errDia);
          }

          // 2. Insert into ventas_silenciadores (Compatibility)
          await db.from('ventas_silenciadores').insert(withSedeInsertServer({
            cantidad: parseInt(p.cantidad) || 1,
            modelo: p.titulo || itemsDisplay.split(',')[0]?.split(':')[0] || 'Venta múltiple',
            notas: newVentaDia?.id ? `Venta POS #${newVentaDia.id.slice(0, 8)} | ${notasFinales}` : notasFinales,
            fecha: ventaFecha,
            precio_registrado: totalNum,
            fecha_registro: nowIso,
            registro_atrasado: esRegistroAtrasado,
          }, sedeId));

          // Auto-decrement stock for each item if inv_ids provided (comma-separated, optional ID:qty format)
          if (p.inv_ids) {
            const idList = p.inv_ids.split(',').map((x: string) => x.trim());
            for (const itemStr of idList) {
              let invId = itemStr;
              let qty = 1;
              if (itemStr.includes(':')) {
                const [idPart, qtyPart] = itemStr.split(':');
                invId = idPart.trim();
                qty = parseInt(qtyPart) || 1;
              }
              const { data: invItem } = await table('inventario').select('stock, nombre').eq('id', invId).single();
              if (invItem) {
                const newStock = Math.max(0, (invItem.stock || 0) - qty);
                await table('inventario').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', invId);
              }
            }
          }

          // Also restore stock that may have been erroneously decremented earlier
          // in this same batch by a duplicate registrar_venta_item of the same
          // product: nothing to do here because the duplicate was already blocked
          // by the check above.

          if (newVentaDia?.id) {
            createdIds['last_venta_dia_id'] = newVentaDia.id;
            const ageStr = 'recién';
            results.push(`✅ Venta registrada: ${itemsDisplay}${totalStr}${clienteStr} (ID: ${newVentaDia.id.slice(0, 8)} · ${ageStr}). Si necesitas ajustar algo, dime "modifica esa venta" o "elimina esa venta" — podré hacerlo durante los próximos ${RECENT_SALE_WINDOW_MIN} min.`);
          } else {
            results.push(`✅ Venta registrada: ${itemsDisplay}${totalStr}${clienteStr}. Si necesitas ajustar algo, dime "modifica esa venta" o "elimina esa venta" — podré hacerlo durante los próximos ${RECENT_SALE_WINDOW_MIN} min.`);
          }
        }

      } else if (tipo === 'registrar_venta_silenciador') {
        // LEGACY: keep for backwards compat
        const metodo = p.metodo_pago || p.context || '';
        const contextStr = metodo ? ` (${metodo})` : '';
        const clienteNombre = p.cliente || null;
        const clienteStr = p.cliente ? ` | Cliente: ${p.cliente}` : '';
        const notasFinales = p.precio ? `${p.notas || ''} [Total: $${p.precio}${contextStr}]${clienteStr}`.trim() : `${p.notas || ''}${clienteStr}`.trim();
        const precioNum = parseFloat(p.precio || '0');
        const cantidad = parseInt(p.cantidad) || 1;
        const producto = p.modelo || '';

        // ── Duplicate protection ────────────────────────────────────────────
        const fpKey = [
          normalizeName(clienteNombre || ''),
          normalizeName(producto),
          cantidad,
          precioNum.toFixed(2),
          normalizeStr(metodo),
        ].join('::');
        if (justCreatedVentaItem.has(fpKey)) {
          results.push(`⚠️ Venta duplicada omitida en este mismo mensaje: ${cantidad}x ${producto || 'Producto'}${p.precio ? ` → $${p.precio}${contextStr}` : ''}${p.cliente ? ` (${p.cliente})` : ''}.`);
        } else {
          const dup = await findDuplicateVentaItem(db, sedeId, clienteNombre || '', producto, cantidad, precioNum, metodo);
          if (dup) {
            const ageMin = minutesSince(dup.created_at || dup.fecha);
            results.push(`⚠️ Venta duplicada omitida — ya registraste ${cantidad}x ${producto || 'Producto'} por $${precioNum}${contextStr}${clienteStr} hace ${ageMin} min. Si fue un error, dime "modifica esa venta" o "elimina esa venta" y lo corrijo (solo posible dentro de los próximos ${RECENT_SALE_WINDOW_MIN} min).`);
            justCreatedVentaItem.add(fpKey);
          } else {
            justCreatedVentaItem.add(fpKey);
            const ventaFechaSil = p.fecha || new Date().toISOString();
            const hoyStrSil = new Date().toISOString().split('T')[0];
            const esRegistroAtrasadoSil = ventaFechaSil.split('T')[0] !== hoyStrSil;

            await insert('ventas_silenciadores', {
              cantidad,
              modelo: producto || null,
              notas: notasFinales,
              fecha: ventaFechaSil,
              precio_registrado: precioNum,
              fecha_registro: new Date().toISOString(),
              registro_atrasado: esRegistroAtrasadoSil,
            });
            results.push(`✅ Venta registrada: ${cantidad}x ${producto || 'Producto'}${p.precio ? ` → $${p.precio}${contextStr}` : ''}${p.cliente ? ` (${p.cliente})` : ''}. Si necesitas ajustar, dime "modifica esa venta" — podré hacerlo durante los próximos ${RECENT_SALE_WINDOW_MIN} min.`);
          }
        }

      // ── Sales — modify or delete a recent venta ────────────────────────────
      } else if (tipo === 'modificar_venta_reciente') {
        // Look up by id (preferred) or by client (most recent venta for that client).
        let targetId = p.id;
        let target: { venta: any; ageMin: number } | null = null;
        if (targetId) {
          target = await getRecentVentaById(db, sedeId, targetId);
        } else if (p.cliente) {
          const tCliente = normalizeName(p.cliente);
          const q = withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .select('id, cliente, total_ingresos, desglose, metodos_pago, created_at, notas, notes')
            .gte('created_at', getRecentWindowIso())
            .order('created_at', { ascending: false })
            .limit(10);
          const { data, error } = await q;
          if (!error && data) {
            const match = data.find((v: any) => normalizeName(v.cliente) === tCliente) || data[0];
            if (match) target = { venta: match, ageMin: minutesSince(match.created_at) };
          }
        }
        if (!target) {
          if (targetId) {
            // Was a specific id requested? Check if it just expired.
            const probe = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
              .select('id, created_at')
              .eq('id', targetId)
              .maybeSingle();
            if (probe?.data) {
              const age = minutesSince(probe.data.created_at);
              results.push(`⛔ No puedo modificar esa venta: fue registrada hace ${age} min y la ventana de edición es de ${RECENT_SALE_WINDOW_MIN} min. Para corregirla, hazlo manualmente desde el panel de Ventas.`);
            } else {
              results.push(`⚠️ No encontré la venta indicada (id: ${targetId}) en esta sede.`);
            }
          } else {
            results.push(`⚠️ No hay ventas recientes que coincidan con "${p.cliente || 'ese criterio'}" para modificar (ventana de ${RECENT_SALE_WINDOW_MIN} min).`);
          }
        } else {
          const updates: any = { updated_at: new Date().toISOString() };
          if (p.total) updates.total_ingresos = parseFloat(p.total);
          if (p.cliente) updates.cliente = p.cliente;
          if (p.items) {
            if (p.items.includes(':')) {
              updates.desglose = p.items.split(',').map((item: string) => {
                const parts = item.trim().split(':');
                const desc = parts[0]?.trim() || item.trim();
                const price = parseFloat((parts[1] || '0').replace(/[^\d.]/g, '')) || 0;
                return { descripcion: desc, highlight: false, cantidad: 1, precio_unitario: price, total: price };
              });
            }
          }
          if (p.metodo_pago) {
            const totalNum = updates.total_ingresos ?? Number(target.venta.total_ingresos || 0);
            const metodo = p.metodo_pago;
            updates.metodos_pago = {
              otro: metodo === 'otro' ? totalNum : 0,
              zelle: metodo === 'zelle' ? totalNum : 0,
              cashea: metodo === 'cashea_bcv' ? totalNum : 0,
              binance: metodo === 'binance' ? totalNum : 0,
              pago_movil: metodo === 'pago_movil' ? totalNum : 0,
              efectivo_usd: (metodo === 'divisas' || metodo === 'efectivo_usd') ? totalNum : 0,
              efectivo_ves: metodo === 'efectivo_ves' ? totalNum : 0,
              transferencia: metodo === 'transferencia' ? totalNum : 0,
              punto_de_venta: metodo === 'punto_venta' ? totalNum : 0,
              euros: (metodo === 'euros' || metodo === 'efectivo_eur') ? totalNum : 0,
            };
          }

          const { error: upErr } = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .update(updates)
            .eq('id', target.venta.id);
          if (upErr) {
            results.push(`❌ Error al modificar la venta: ${upErr.message}`);
          } else {
            // Also update the linked silenciadores record (if any) for consistency
            const itemsStr = p.items || '';
            const titulo = itemsStr.split(',')[0]?.split(':')[0] || target.venta.desglose?.[0]?.descripcion || 'Venta múltiple';
            const notaUpdate: any = { updated_at: new Date().toISOString() };
            if (p.items) {
              notaUpdate.modelo = titulo;
              if (p.total) notaUpdate.precio_registrado = parseFloat(p.total);
            }
            await db.from('ventas_silenciadores')
              .update(notaUpdate)
              .ilike('notas', `%Venta POS #${target.venta.id.slice(0, 8)}%`);

            const changed = Object.keys(updates).filter(k => k !== 'updated_at');
            results.push(`✅ Venta modificada (ID: ${target.venta.id.slice(0, 8)} · hace ${target.ageMin} min). Campos actualizados: ${changed.join(', ')}. Si necesitas más cambios aún estás a tiempo (ventana de ${RECENT_SALE_WINDOW_MIN} min).`);
          }
        }

      } else if (tipo === 'eliminar_venta_reciente') {
        // Delete only if the venta is still within the recent window.
        let target: { venta: any; ageMin: number } | null = null;
        if (p.id) {
          target = await getRecentVentaById(db, sedeId, p.id);
        } else if (p.cliente) {
          const tCliente = normalizeName(p.cliente);
          const q = withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .select('id, cliente, total_ingresos, created_at')
            .gte('created_at', getRecentWindowIso())
            .order('created_at', { ascending: false })
            .limit(10);
          const { data, error } = await q;
          if (!error && data) {
            const match = data.find((v: any) => normalizeName(v.cliente) === tCliente) || data[0];
            if (match) target = { venta: match, ageMin: minutesSince(match.created_at) };
          }
        }
        if (!target) {
          if (p.id) {
            const probe = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
              .select('id, created_at')
              .eq('id', p.id)
              .maybeSingle();
            if (probe?.data) {
              const age = minutesSince(probe.data.created_at);
              results.push(`⛔ No puedo eliminar esa venta: fue registrada hace ${age} min y la ventana permitida es de ${RECENT_SALE_WINDOW_MIN} min. Para revertirla, hazlo manualmente desde el panel de Ventas (anular / devolver).`);
            } else {
              results.push(`⚠️ No encontré la venta indicada (id: ${p.id}) en esta sede.`);
            }
          } else {
            results.push(`⚠️ No hay ventas recientes que coincidan con "${p.cliente || 'ese criterio'}" para eliminar (ventana de ${RECENT_SALE_WINDOW_MIN} min).`);
          }
        } else {
          const ventaId = target.venta.id;
          const shortId = ventaId.slice(0, 8);
          // Delete linked silenciadores record first (if any)
          await db.from('ventas_silenciadores')
            .delete()
            .ilike('notas', `%Venta POS #${shortId}%`);
          const { error: delErr } = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .delete()
            .eq('id', ventaId);
          if (delErr) {
            results.push(`❌ Error al eliminar la venta: ${delErr.message}`);
          } else {
            results.push(`🗑️ Venta eliminada (ID: ${shortId} · cliente: ${target.venta.cliente || 'Consumidor Final'} · $${Number(target.venta.total_ingresos || 0).toFixed(2)} · hace ${target.ageMin} min). Stock y totales ya no la incluyen.`);
          }
        }

      // ── Pending Sales — mark as paid, register payment, reopen ───────────
      } else if (tipo === 'modificar_venta_pendiente') {
        // Actions on pending sales: pagar, abonar, reabrir
        const targetId = p.id;
        let targetVenta: any = null;
        if (targetId) {
          const { data } = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .select('id, cliente, total_ingresos, desglose, metodos_pago, notas, saldo_pendiente, abono, estado')
            .eq('id', targetId)
            .maybeSingle();
          targetVenta = data;
        } else if (p.cliente) {
          const tCliente = normalizeName(p.cliente);
          const { data } = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .select('id, cliente, total_ingresos, desglose, metodos_pago, notas, saldo_pendiente, abono, estado')
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: false })
            .limit(5);
          if (data) {
            targetVenta = data.find((v: any) => normalizeName(v.cliente) === tCliente) || data[0];
          }
        }
        if (!targetVenta) {
          results.push(`⚠️ No encontré una venta pendiente con ese criterio.`);
        } else {
          const updateObj: any = { updated_at: new Date().toISOString() };
          let actionDesc = '';

          if (p.accion === 'pagar' || p.estado === 'pagado') {
            updateObj.estado = 'pagado';
            updateObj.saldo_pendiente = 0;
            const abonoPrev = Number(targetVenta.abono || 0);
            const totalVenta = Number(targetVenta.total_ingresos || 0);
            if (abonoPrev < totalVenta) {
              updateObj.abono = totalVenta;
            }
            updateObj.notas = `${targetVenta.notas || ''} | Pagado por IA el ${new Date().toLocaleDateString('es-VE')}`;
            actionDesc = `marcada como PAGADA`;
          } else if (p.accion === 'abonar' && p.monto) {
            const montoAbono = parseFloat(p.monto);
            if (montoAbono <= 0) {
              results.push(`⚠️ El monto del abono debe ser mayor a 0.`);
              continue;
            }
            const nuevoAbono = (Number(targetVenta.abono) || 0) + montoAbono;
            const nuevoSaldo = Math.max(0, (Number(targetVenta.total_ingresos) || 0) - nuevoAbono);
            updateObj.abono = nuevoAbono;
            updateObj.saldo_pendiente = nuevoSaldo;
            updateObj.estado = nuevoSaldo <= 0 ? 'pagado' : 'pendiente';
            updateObj.notas = `${targetVenta.notas || ''} | Abono $${montoAbono.toFixed(2)} por IA el ${new Date().toLocaleDateString('es-VE')}`;
            actionDesc = `abono de $${montoAbono.toFixed(2)} registrado. Saldo: $${nuevoSaldo.toFixed(2)}`;
          } else if (p.accion === 'reabrir') {
            if (targetVenta.estado === 'pendiente') {
              results.push(`ℹ️ La venta ya está en estado pendiente.`);
              continue;
            }
            const saldo = Number(targetVenta.total_ingresos || 0) - (Number(targetVenta.abono) || 0);
            updateObj.estado = 'pendiente';
            updateObj.saldo_pendiente = Math.max(0, saldo);
            updateObj.notas = `${targetVenta.notas || ''} | Reabierto por IA el ${new Date().toLocaleDateString('es-VE')}`;
            actionDesc = `reabierta como PENDIENTE. Saldo: $${Math.max(0, saldo).toFixed(2)}`;
          } else {
            results.push(`⚠️ Acción no reconocida. Usa accion=pagar, accion=abonar|monto=X, o accion=reabrir`);
            continue;
          }

          const { error: upErr } = await withSedeFilterServer(db.from('ventas_dia'), sedeId)
            .update(updateObj)
            .eq('id', targetVenta.id);
          if (upErr) {
            results.push(`❌ Error: ${upErr.message}`);
          } else {
            results.push(`✅ Venta de ${targetVenta.cliente} ${actionDesc}.`);
          }
        }
      }
    } catch (e) {
      results.push(`❌ Error en ${tipo}: ${e}`);
    }
  }

  return { clean: clean.trim(), results };
}

// ─── POST Handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt, sede_id, sede_nombre, user } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    // Load database context filtered by sede
    const dbContext = await loadDbContext(sede_id);
    const finalSystemPrompt = systemPrompt || buildSystemPrompt(dbContext, sede_nombre, user);

    const geminiMessages = messages.map((m: { role: string; content: string; image?: { mimeType: string; data: string } }) => {
      const parts: any[] = [];
      
      if (m.image && m.image.data) {
        parts.push({
          inlineData: {
            mimeType: m.image.mimeType || 'image/jpeg',
            data: m.image.data
          }
        });
      }
      
      parts.push({ text: m.content || '' });
      
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    let rawText = '';

    // ── Multi-MODEL strategy (Single API Key) ──────────────────────────────────────
    for (const model of GEMINI_MODELS) {
      console.log(`🧠 [IA Chat] Intentando con Modelo: ${model}`);
      try {
        const apiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: finalSystemPrompt }] },
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.4,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
              },
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
              ],
            }),
          }
        );

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawText = parts.map((p: any) => p.text).join('') || '';
          if (rawText) break;
        } else {
          const errText = await apiResponse.text();
          console.error(`[IA Chat] Error ${apiResponse.status} Modelo ${model}:`, errText.slice(0, 200));
          if (apiResponse.status === 429 || apiResponse.status === 503) continue;
          break; // Try next loop or stop
        }
      } catch (e) {
        console.error('[IA Chat] Exception:', e);
      }
    }

    if (!rawText) {
      return NextResponse.json({
        response: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    const { clean, results } = await executeActions(rawText, sede_id);
    // Strip any raw UUIDs from results before showing to user
    const cleanResults = results.map(r => r.replace(/\s*\(ID: [0-9a-f-]{36}\)/gi, '').replace(/ID: [0-9a-f-]{36}/gi, ''));
    const finalResponse = cleanResults.length > 0 ? `${clean}\n\n---\n${cleanResults.join('\n')}` : clean;

    return NextResponse.json({ response: finalResponse });
  } catch (error) {
    console.error('[IA] Fatal error:', error);
    return NextResponse.json({ response: '🔧 Error interno. Intenta de nuevo.' }, { status: 200 });
  }
}

// ─── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(dbContext: string, sedeNombre?: string, user?: any): string {
  const now = new Date();
  const vzlaDate = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(now);

  return `IDENTIDAD:
Eres el ASISTENTE ADMINISTRADOR INTELIGENTE de Lycos Team con control total sobre la sede: "${sedeNombre || 'General'}".
Hola ${user?.nombre || 'Administrador'}, estoy a tu servicio. Mi objetivo es ayudarte a gestionar esta sede de manera impecable.

FECHA/HORA ACTUAL: ${vzlaDate}

ACCESO A DATOS:
Tienes acceso en TIEMPO REAL a la base de datos FILTRADA por esta sede.
Lo que ves abajo es EXCLUSIVO de la sede "${sedeNombre || 'General'}". No menciones datos de otras sedes a menos que se te pregunte explícitamente y los tengas disponibles.

═══ GUÍA COMPLETA DE INTERPRETACIÓN DE IMÁGENES ═══
El usuario PUEDE enviarte imágenes junto con su mensaje. Analiza el contenido de la imagen según esta clasificación:

1️⃣ [FACTURA / TICKET / RECIBO]:
   - Extrae TODOS los items: productos, cantidades, precios unitarios, subtotal, IVA, total.
   - Identifica método de pago, fecha, nombre del cliente si visible.
   - PREGUNTA al usuario: "¿Registramos esta venta en el sistema?" antes de hacer cualquier acción.
   - Si confirma, usa [ACTION: registrar_venta_completa] con todos los items extraídos.

2️⃣ [VEHÍCULO]:
   - Identifica: MARCA, MODELO, PLACA, COLOR, año aprox., daños visibles.
   - Pregunta: "¿Qué deseas hacer? 1) Registrar servicio técnico 2) Ver historial 3) Agendar cita"
   - Si especifica servicio + precio, usa [ACTION: registrar_servicio]

3️⃣ [PRODUCTO / SILENCIADOR / PIEZA]:
   - Identifica tipo, modelo, cantidad, código.
   - Pregunta: "¿Registrarlo en inventario o actualizar stock?"
   - Usa [ACTION: actualizar_stock] si corresponde.

4️⃣ [REPORTE / EXCEL / CAPTURA DE PANTALLA]:
   - Extrae los datos tabulares visibles.
   - Ofrece: comparar con sistema, registrar datos, o generar análisis.
   - Si son datos de inventario, sugiere actualizar el sistema.

5️⃣ [OTRO]:
   - Describe qué ves y pregunta qué acción desea realizar.

REGLAS DE ORO PARA IMÁGENES:
- NUNCA generes [ACTION:...] sin confirmación del usuario, A MENOS QUE el usuario ya haya dado una orden directa en el texto.
- Si la imagen + texto ya contienen "registra esto", "crea esto", procede directamente.
- Si solo hay imagen sin texto, describe y espera instrucciones.

═══ VENTAS — REGLAS DE CONSULTA ═══
- Ventas RECIENTES = Últimos 30 días (mostradas en sección VENTAS SILENCIADORES y VENTAS POS).
- Ventas de HOY son las que tienen fecha de hoy — dales prioridad cuando pregunten.
- Ventas de AYER — muéstralas solo si pregunta específicamente por ayer.
- Ventas ANTIGUAS (>30 días): Si pregunta por ellas, responde: "Las ventas anteriores a 30 días no están disponibles en el asistente. Puedes revisarlas en el panel de reportes del dashboard."
- Excepción: Si una venta antigua fue registrada recientemente (created_at reciente aunque fecha sea antigua), SÍ se muestra porque está en los últimos 30 días de created_at.

═══ SERVICIOS — REGLAS ═══
- Muestra servicios activos PRIMERO (pendiente, en_proceso).
- Para cada servicio, incluye: cliente, vehículo, tipo, descripción, costo, estado, seguimiento.
- Si preguntan por un servicio específico (por ID o cliente), muestra todo su seguimiento histórico.

═══ INVENTARIO — REGLAS ═══
- Productos con stock bajo (stock ≤ stock_minimo): resáltalos con ⚠️.
- Si preguntan "qué hay en inventario", muestra categorías agrupadas.
- Los precios están en USD (precio_usd) y Bs (precio_bs). Muestra SIEMPRE ambos.

═══ REPORTES Y CIERRES DE CAJA ═══
- [CIERRES DE CAJA RECIENTES] contiene los últimos cierres registrados.
- Si preguntan por cierre del día, compara con ventas de HOY.
- Puedes mostrar: total USD, total Bs, tasa BCV, cantidad de ventas, métodos de pago.

FORMATO DE RESPUESTA (ESTILO DASHBOARD PREMIUM):
- USA TABLAS MARKDOWN ESTÁNDAR: Usa el formato | Header | Header |. Es vital para el renderizado profesional.
- NUNCA uses bordes de caracteres Unicode (como ┌ ─ ┐) ya que se ven mal.
- NUNCA uses negritas (**) dentro de las celdas de una tabla.
- DISEÑO LIMPIO: Usa negritas solo para títulos o totales fuera de las tablas.
- EMOJIS: Úsalos para identificar secciones (📦 Inventario, 💰 Ventas, 🔧 Servicios, 📊 Reportes).
- RESPUESTA EJECUTIVA: Sé breve, directo y ofrece soluciones.

INSTRUCCIONES DE DISEÑO:
- Inventario → Tabla Markdown. Columnas: PRODUCTO | CATEGORÍA | STOCK | PRECIO USD | PRECIO BS.
- Servicios → Tabla Markdown. Columnas: VEHÍCULO | TRABAJO | ESTADO | COSTO | FECHA.
- Ventas → Tabla Markdown. Columnas: FECHA | PRODUCTO | CANT | TOTAL | PAGO | CLIENTE.
- Reportes → Tabla Markdown con KPIs y comparativas.
- Si no hay datos, responde: "No se encontraron registros para esta sede actualmente."

CAPACIDAD DE GRÁFICOS (INTERACTIVOS):
Puedes generar gráficos profesionales insertando un bloque de código con el lenguaje "chart" y un JSON.
\`\`\`chart
{
  "type": "bar", // O "pie" o "line"
  "title": "Ventas de la Semana",
  "data": [
    {"name": "Lun", "value": 150},
    {"name": "Mar", "value": 230}
  ]
}
\`\`\`
Úsalos para análisis, comparativas o reportes visuales de ventas, stock o actividad.

INSTRUCCIONES CRÍTICAS:
- Cuando te pregunten por clientes → lístalos TODOS con datos completos.
- Cuando te pregunten por citas → muéstralas TODAS agrupadas por fecha y hora.
- Cuando te pregunten por inventario → tabla con categorías, stock y precios.
- Cuando te pregunten por vehículos → por marca, modelo y placa.
- Cuando te pregunten por servicios → tabla con CLIENTE | VEHÍCULO | TRABAJO | ESTADO | COSTO | FECHA y seguimiento.
- Cuando te pregunten cuántos servicios hay por estado → agrupa y cuenta cada estado.
- Cuando te pregunten por ventas → muestra HOY primero, luego últimos 30 días.
Revisa el campo "registro_atrasado" — si es true, muestra una etiqueta ⚠️ ATRASADO junto a la venta.
- Cuando te pregunten por reportes o cierres → usa CIERRES DE CAJA y KPIs de ventas.

ACCIONES DE ESCRITURA (REGLAS CRÍTICAS):

⚠️ REGLA DE PRECIOS PERSONALIZADOS:
- Si el usuario pide registrar venta con precio DIFERENTE al del inventario:
  1. PREGUNTA para confirmar antes de registrar.
  2. Si confirma, procede con el precio personalizado.
- Si el usuario ya dio una orden directa y confirmada, procede sin preguntar.

REGLA CASHEA:
- Cashea usa PRECIO BCV (precio_bs) como base, NO precio divisas.
- Total Cashea = Precio_BCV ÷ Tasa_BCV_actual × 1.16 (16% IVA).
- metodo_pago = cashea_bcv. En 'total' el monto en USD al cambio BCV.

PAGOS MIXTOS:
- Usa 'pago_mixto' con formato: "$20 Divisas + $30 BCV"

ID DE INVENTARIO (INV_ID):
- Para descontar stock, usa el INV_ID exacto.
- NUNCA muestres IDs UUID crudos al usuario. Usa el NOMBRE del producto.

TRACKING DE TALLER:
- Cuando pregunten por vehículos en taller:
  1. Servicios activos (en_proceso, pendiente).
  2. Ventas del día como referencia.
  3. Citas pendientes.

⚠️ PROTECCIÓN ANTIDUPLICADOS (VENTAS):
- El sistema detecta AUTOMÁTICAMENTE si intentas registrar una venta que ya existe:
  - Mismo cliente, mismo total, mismos items y mismo método de pago en los últimos 10 minutos.
  - Si detecta una coincidencia, la rechaza con un mensaje claro y te sugiere usar [ACTION: modificar_venta_reciente] para corregirla.
- NUNCA generes dos [ACTION: registrar_venta_*] idénticos en la misma respuesta.
- Si el usuario dice "repite la venta de hace un rato" → PRIMERO consulta si quiere modificarla o si es una nueva venta diferente.
- Ventana de modificación/eliminación: 10 minutos desde la creación. Después de eso, deben usar el panel de Ventas manualmente.

⚠️ REGLA DE ORO — REGISTRO DE VENTAS CON MÚLTIPLES PRODUCTOS:
1. Si el cliente NO existe → usa [ACTION: crear_cliente] PRIMERO.
2. Si se menciona un vehículo → usa [ACTION: crear_vehiculo] DESPUÉS del cliente.
3. Para múltiples productos de un mismo cliente, usa [ACTION: registrar_venta_completa] con 'items' = "Prod1:Pre1, Prod2:Pre2".
4. 'inv_ids' debe listar los IDs de inventario separados por comas (ID1:qty1, ID2:qty2).
5. Suma los precios en 'total'.

⚠️ REGLA CRÍTICA — TAGS DE ACCIÓN: Cuando confirmes, crees o actualices cualquier registro (cita, servicio, venta, cliente, vehículo, inventario), DEBES incluir el [ACTION: ...] correspondiente en tu respuesta. Sin el action tag, NO se guarda nada en la base de datos — solo texto. NUNCA digas "he registrado" o "he creado" si no incluiste el action tag.

TAGS DE ACCIÓN DISPONIBLES:
• Crear cita: [ACTION: crear_cita | fecha=AAAA-MM-DD | hora=HH:MM | telefono=NUM | descripcion=SERVICIO | tipo_servicio=otro | nombre_cliente=NOMBRE | vehiculo=MARCA_MODELO | placa=PLACA] — OBLIGATORIO: incluye nombre_cliente y vehiculo si están disponibles. Sin el action tag NO se guarda nada en BD.
• Actualizar cita: [ACTION: actualizar_cita | id=ID | estado=confirmada|cancelada]
• Actualizar stock: [ACTION: actualizar_stock | id=INV_ID | stock=NUMERO]
• Descontar stock: [ACTION: descontar_stock | id=INV_ID | cantidad=N]
• Eliminar producto: [ACTION: eliminar_producto | id=INV_ID]
• Crear cliente: [ACTION: crear_cliente | nombre=N | apellido=A | telefono=T | email=E | cedula=CI]
• Crear vehículo: [ACTION: crear_vehiculo | marca=MARCA | modelo_vehiculo=MODELO | placa=PLACA | anio=ANO | color=COLOR | cliente_id=UUID]
• Actualizar servicio: [ACTION: actualizar_servicio | id=ID | estado=finalizado|cancelado | nota=Texto]
• Registrar servicio taller: [ACTION: registrar_servicio | descripcion=Texto | tipo=mecanica|electronica|cerrajeria|diagnostico|motor|emergencia|otro | estado=pendiente|en_proceso | costo_estimado=Numero | nombre_cliente=Nombre | telefono=Numero | vehiculo_info=Marca Modelo | placa=PLACA | cliente_id=UUID | vehiculo_id=UUID | tipo_personalizado=Texto]
• Registrar venta COMPLETA: [ACTION: registrar_venta_completa | titulo=X | items=Prod1:Pre1,Prod2:Pre2 | total=TOTAL | iva=MONTO | inicial=INICIAL_CASHEA | metodo_pago=cashea_bcv/divisas/euros/bcv/binance/zelle/pago_movil/efectivo_ves/punto_venta/transferencia/otro | pago_mixto=DESC | cliente=NOMBRE | vehiculo=MARCA_PLACA | inv_ids=ID1:qty1,ID2:qty2 | fecha=AAAA-MM-DD] — Parámetro OPCIONAL: si la venta fue de un día anterior, usa fecha= para indicar la fecha real. El sistema marcará automáticamente como "⚠️ REGISTRO ATRASADO".
• Modificar venta RECIENTE (<10 min): [ACTION: modificar_venta_reciente | id=ID | total=NUEVO_TOTAL | cliente=NUEVO_CLIENTE | items=Prod1:Pre1,Prod2:Pre2 | metodo_pago=...]  — Si no sabes el ID, usa cliente=NOMBRE para buscar la última venta de ese cliente.
• Eliminar venta RECIENTE (<10 min): [ACTION: eliminar_venta_reciente | id=ID]  — Igual, si no sabes el ID usa cliente=NOMBRE.
• Gestionar venta PENDIENTE: [ACTION: modificar_venta_pendiente | id=ID | accion=pagar|abonar|reabrir | monto=X] — Para marcar como pagada, registrar abono extra, o reabrir una venta que ya estaba pagada. Si no sabes el ID usa cliente=NOMBRE.
• Registrar venta item individual: [ACTION: registrar_venta_item | producto=PROD | cantidad=N | precio=MONTO | metodo_pago=... | cliente=NOMBRE | fecha=AAAA-MM-DD] — fecha es OPCIONAL, para registrar ventas de días anteriores.
• Registrar venta silenciador (legacy): [ACTION: registrar_venta_silenciador | modelo=MODELO | cantidad=N | precio=MONTO | cliente=NOMBRE | fecha=AAAA-MM-DD] — fecha es OPCIONAL, para registrar ventas de días anteriores.

TONO: Profesional, ejecutivo y eficiente. Español venezolano amable.
HORARIO: L–Sáb 8AM–5PM | Dom: Cerrado | +58 412-334-3519 | lycosteam7@gmail.com

PRECIOS PRINCIPALES: Silenciadores $40–$140 | Amortiguadores $40 | Alineación $15–$25 | Balanceo $5–$10 | Elevavidrios $40 | OBD I $20 | Catalizador $30 | Flowmaster $140.

CASHEA — REGLA DE PRECIOS:
- Cashea usa PRECIO BCV como base.
- Total Cashea = (precio_bs / tasa_bcv_actual) × 1.16.
- Inicial = cuota 1, resto en 3 cuotas.

CATEGORIZACIÓN DE SILENCIADORES:
- CL27/CL30 ($40): Motores hasta 1.3L.
- CL40 ($50): Motores hasta 1.5L.
- CLH40 ($60): Motores 1.6L a 2.0L.
- CL60 ($90): Motores grandes, Camionetas.
- CLK60 ($100): Fabricación Especial.
- TUBERÍA: $25-$35/metro según lo discutido con cliente.

REGLA DE CITAS: HOY es ${getVzlaDateTime()}. Si agendan para mañana siendo sábado, recuerda que domingo cerramos y ofrece lunes.

━━━━━━━━━━━━━━ BASE DE DATOS EN TIEMPO REAL ━━━━━━━━━━━━━━
${dbContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE DATOS. Responde basándote EXCLUSIVAMENTE en los datos anteriores.`;
}

// ─── Fallback ──────────────────────────────────────────────────────────────────
function generateFallbackResponse(_userMsg: string): string {
  return '🔧 API no configurada. Contacta al administrador del sistema.';
}
