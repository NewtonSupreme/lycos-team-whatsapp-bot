'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingCart, Plus, Trash2, Receipt, Package, 
  Search, MapPin, CheckCircle, AlertCircle, Loader2,
  TrendingUp, Calendar, ArrowRight, Printer, UserPlus, X,
  ChevronDown, DollarSign, CreditCard, Clock, FileText
} from 'lucide-react';
import { supabase, updateInventarioStock, registrarFactura } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import { ComprobanteInput, emptyComprobante, type ComprobanteValue } from '@/components/ventas/ComprobanteInput';
import { uploadComprobante, comprobanteFields } from '@/lib/comprobante';
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRolePermissions } from '@/lib/hooks/useRolePermissions';

interface CartItem {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  stock: number;
}

export default function VentasPage() {
  const { can } = useRolePermissions();
  const [productos, setProductos] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [vehiculoInfo, setVehiculoInfo] = useState('');
  const [notas, setNotas] = useState('');
  const [conIva, setConIva] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Collapsible sections
  const [showAbonoSection, setShowAbonoSection] = useState(false);
  const [showNotasSection, setShowNotasSection] = useState(false);
  const [abono, setAbono] = useState(0);
  const [comprobante, setComprobante] = useState<ComprobanteValue>(emptyComprobante());
  const [tabVenta, setTabVenta] = useState<'nueva' | 'pendientes'>('nueva');
  const [ventasPendientes, setVentasPendientes] = useState<any[]>([]);
  const [loadingPendientes, setLoadingPendientes] = useState(false);

  // Abonos sobre ventas pendientes existentes
  const [abonoModalVenta, setAbonoModalVenta] = useState<any | null>(null);
  const [abonoMonto, setAbonoMonto] = useState(0);
  const [abonoMetodo, setAbonoMetodo] = useState('efectivo');
  const [abonoNota, setAbonoNota] = useState('');
  const [abonosHistorial, setAbonosHistorial] = useState<any[]>([]);
  const [loadingAbonos, setLoadingAbonos] = useState(false);
  const [procesandoAbono, setProcesandoAbono] = useState(false);

  // Payment methods
  const [metodosPago, setMetodosPago] = useState({
    efectivo_usd: 0,
    zelle: 0,
    pago_movil: 0,
    efectivo_ves: 0,
    punto_de_venta: 0,
    transferencia: 0,
    cashea: 0,
    otro: 0
  });

  const [printMode, setPrintMode] = useState<'single' | 'dual' | 'diferente'>('dual');
  const [printSide, setPrintSide] = useState<'left' | 'right'>('left');
  const [ventasRecientes, setVentasRecientes] = useState<any[]>([]);
  const [showSelector, setShowSelector] = useState(false);
  const [secondVenta, setSecondVenta] = useState<any | null>(null);
  const [searchTermVenta, setSearchTermVenta] = useState('');

  const { currentSede, sedeRefreshKey } = useSedeStore();
  const [rates, setRates] = useState({ bcv: 0 });

  useEffect(() => {
    fetchData();
    fetchRates();
  }, [currentSede, sedeRefreshKey]);

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/rates');
      const data = await res.json();
      setRates({ bcv: data.bcv });
    } catch (e) { console.error('Error fetching rates:', e); }
  };

  const fetchData = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: invData } = await withSedeFilter(supabase.from('inventario'))
        .select('*')
        .eq('activo', true)
        .order('nombre');
      setProductos(invData || []);
      const { data: vData } = await withSedeFilter(supabase.from('ventas_dia'))
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setVentasRecientes(vData || []);
      // Fetch pending sales (con abono / saldo pendiente)
      const { data: pData } = await withSedeFilter(supabase.from('ventas_dia'))
        .select('*')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(50);
      setVentasPendientes(pData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Cargar historial de abonos de una venta ──────────────────
  const cargarAbonos = async (ventaId: string) => {
    if (!supabase) return;
    setLoadingAbonos(true);
    try {
      const { data } = await supabase.from('abonos')
        .select('*')
        .eq('venta_id', ventaId)
        .order('created_at', { ascending: true });
      setAbonosHistorial(data || []);
    } catch {
      setAbonosHistorial([]);
    } finally {
      setLoadingAbonos(false);
    }
  };

  const abrirModalAbono = async (venta: any) => {
    setAbonoModalVenta(venta);
    setAbonoMonto(0);
    setAbonoMetodo('efectivo');
    setAbonoNota('');
    await cargarAbonos(venta.id);
  };

  // ── Registrar un abono parcial sobre una venta pendiente ─────
  const registrarAbono = async () => {
    if (!supabase || !abonoModalVenta) return;
    const venta = abonoModalVenta;
    const saldoActual = Number(venta.saldo_pendiente) || 0;
    const monto = Number(abonoMonto) || 0;

    if (monto <= 0) { alert('Ingresa un monto de abono válido.'); return; }
    if (monto > saldoActual + 0.001) { alert(`El abono ($${monto.toFixed(2)}) no puede ser mayor al saldo pendiente ($${saldoActual.toFixed(2)}).`); return; }

    setProcesandoAbono(true);
    try {
      const saldoDespues = Math.max(0, saldoActual - monto);
      const totalAbonadoNuevo = (Number(venta.total_abonado) || 0) + monto;
      const quedaPagado = saldoDespues <= 0.001;
      const tasa = Number(venta.tasa_cambio) || 0;
      const fechaHoy = new Date().toISOString().split('T')[0];

      // 1. Registrar el abono en la tabla dedicada
      const { data: abonoRow, error: abonoErr } = await withSedeFilter(supabase.from('abonos'))
        .insert(withSedeInsert({
          venta_id: venta.id,
          monto,
          monto_bs: tasa > 0 ? monto * tasa : 0,
          tasa_cambio: tasa,
          metodo_pago: abonoMetodo,
          moneda: venta.moneda || 'USD',
          saldo_antes: saldoActual,
          saldo_despues: saldoDespues,
          nota: abonoNota || null,
          registrado_por: 'Admin',
        }))
        .select()
        .single();
      if (abonoErr) throw abonoErr;

      // 2. Actualizar la venta pendiente
      const { error: updErr } = await supabase.from('ventas_dia')
        .update({
          total_abonado: totalAbonadoNuevo,
          abono: totalAbonadoNuevo,
          saldo_pendiente: saldoDespues,
          tiene_abono: true,
          estado: quedaPagado ? 'pagado' : 'pendiente',
          fecha_pago_completo: quedaPagado ? new Date().toISOString() : null,
        })
        .eq('id', venta.id);
      if (updErr) throw updErr;

      // 3. Registrar el abono como INGRESO del día (factura tipo venta con etiqueta abono)
      await registrarFactura({
        tipo: 'venta',
        modulo_origen: 'ventas_pos',
        referencia_id: abonoRow.id, // único por abono → no choca con el guard de duplicados
        referencia_tabla: 'abonos',
        cliente: venta.cliente || 'Consumidor Final',
        vehiculo: venta.notas?.match(/Veh[ií]culo:\s*([^|]+)/i)?.[1]?.trim() || undefined,
        total: monto,
        moneda: venta.moneda || 'USD',
        tasa_cambio: tasa || undefined,
        total_bs: tasa > 0 ? monto * tasa : undefined,
        items: [{
          descripcion: `Abono${venta.presupuesto_numero ? ` - Presupuesto ${venta.presupuesto_numero}` : ''} (Saldo restante: $${saldoDespues.toFixed(2)})`,
          cantidad: 1,
          precio: monto,
          total: monto,
        }],
        metodos_pago: { [abonoMetodo]: monto },
        estado: 'pagado',
        notas: `ABONO sobre venta de ${venta.cliente}. Total venta: $${Number(venta.total_ingresos).toFixed(2)} | Abonado acumulado: $${totalAbonadoNuevo.toFixed(2)} | Saldo: $${saldoDespues.toFixed(2)}${quedaPagado ? ' | VENTA SALDADA' : ''}`,
        emitido_por: 'Admin',
        fecha_emision: fechaHoy,
      });

      // 4. Log
      try {
        const { logActivity } = await import('@/lib/activity');
        await logActivity({
          usuario: 'Admin',
          modulo: 'ventas',
          accion: quedaPagado ? 'Abono final (venta saldada)' : 'Registrar abono',
          detalles: `Abono de $${monto.toFixed(2)} sobre venta de ${venta.cliente}. Saldo: $${saldoDespues.toFixed(2)}`,
          referencia_id: venta.id,
          referencia_tabla: 'ventas_dia',
        });
      } catch {}

      alert(quedaPagado
        ? `¡Abono registrado! La venta quedó SALDADA por completo. Se generó la factura del abono final.`
        : `¡Abono de $${monto.toFixed(2)} registrado! Saldo pendiente: $${saldoDespues.toFixed(2)}. Aparece en ventas recientes y reportes con etiqueta ABONO.`);

      setAbonoModalVenta(null);
      await fetchData();
    } catch (err: any) {
      alert('Error al registrar abono: ' + err.message);
    } finally {
      setProcesandoAbono(false);
    }
  };

  // ── Marcar venta pendiente como PAGADA por completo ──────────
  const marcarPagadoCompleto = async (venta: any) => {
    if (!supabase) return;
    const saldo = Number(venta.saldo_pendiente) || 0;
    if (!confirm(`¿Marcar como PAGADA la venta de ${venta.cliente}?\n\nSe registrará el saldo restante de $${saldo.toFixed(2)} como pago final y se generará la factura total con el historial de abonos.`)) return;

    setProcesandoAbono(true);
    try {
      const tasa = Number(venta.tasa_cambio) || 0;
      const totalVenta = Number(venta.total_ingresos) || 0;
      const fechaHoy = new Date().toISOString().split('T')[0];

      // Si queda saldo, registrarlo como abono final
      if (saldo > 0.001) {
        const totalAbonadoNuevo = (Number(venta.total_abonado) || 0) + saldo;
        const { data: abonoRow, error: abonoErr } = await withSedeFilter(supabase.from('abonos'))
          .insert(withSedeInsert({
            venta_id: venta.id,
            monto: saldo,
            monto_bs: tasa > 0 ? saldo * tasa : 0,
            tasa_cambio: tasa,
            metodo_pago: 'efectivo',
            moneda: venta.moneda || 'USD',
            saldo_antes: saldo,
            saldo_despues: 0,
            nota: 'Pago final (liquidación)',
            registrado_por: 'Admin',
          }))
          .select()
          .single();
        if (abonoErr) throw abonoErr;

        await supabase.from('ventas_dia')
          .update({
            total_abonado: totalAbonadoNuevo,
            abono: totalAbonadoNuevo,
            saldo_pendiente: 0,
            tiene_abono: true,
            estado: 'pagado',
            fecha_pago_completo: new Date().toISOString(),
          })
          .eq('id', venta.id);

        // Factura del pago final (ingreso del día)
        await registrarFactura({
          tipo: 'venta',
          modulo_origen: 'ventas_pos',
          referencia_id: abonoRow.id,
          referencia_tabla: 'abonos',
          cliente: venta.cliente || 'Consumidor Final',
          total: saldo,
          moneda: venta.moneda || 'USD',
          tasa_cambio: tasa || undefined,
          total_bs: tasa > 0 ? saldo * tasa : undefined,
          items: [{ descripcion: `Pago final - liquidación${venta.presupuesto_numero ? ` Presupuesto ${venta.presupuesto_numero}` : ''}`, cantidad: 1, precio: saldo, total: saldo }],
          metodos_pago: { efectivo: saldo },
          estado: 'pagado',
          notas: `PAGO FINAL. Venta saldada. Total: $${totalVenta.toFixed(2)}`,
          emitido_por: 'Admin',
          fecha_emision: fechaHoy,
        });
      } else {
        await supabase.from('ventas_dia')
          .update({ estado: 'pagado', fecha_pago_completo: new Date().toISOString() })
          .eq('id', venta.id);
      }

      // Factura TOTAL de cierre con historial de abonos
      const { data: todosAbonos } = await supabase.from('abonos')
        .select('*').eq('venta_id', venta.id).order('created_at', { ascending: true });

      const itemsFactura = (venta.desglose && venta.desglose.length > 0)
        ? venta.desglose.map((d: any) => ({ descripcion: d.nombre, cantidad: d.cantidad, precio: d.precio, total: d.total }))
        : [{ descripcion: venta.notas || 'Venta', cantidad: 1, precio: totalVenta, total: totalVenta }];

      const historialTexto = (todosAbonos || []).map((a: any, i: number) =>
        `Abono ${i + 1}: $${Number(a.monto).toFixed(2)} (${new Date(a.created_at).toLocaleDateString('es-VE')}, ${a.metodo_pago})`
      ).join(' | ');

      await registrarFactura({
        tipo: 'venta',
        modulo_origen: 'ventas_pos',
        referencia_id: venta.id,
        referencia_tabla: 'ventas_dia',
        cliente: venta.cliente || 'Consumidor Final',
        total: totalVenta,
        moneda: venta.moneda || 'USD',
        tasa_cambio: tasa || undefined,
        total_bs: tasa > 0 ? totalVenta * tasa : undefined,
        items: itemsFactura,
        con_iva: !!venta.con_iva,
        estado: 'pagado',
        notas: `VENTA SALDADA${venta.presupuesto_numero ? ` (Presupuesto ${venta.presupuesto_numero})` : ''}. ${historialTexto ? 'Historial de abonos: ' + historialTexto : ''}`,
        emitido_por: 'Admin',
        fecha_emision: fechaHoy,
      });

      try {
        const { logActivity } = await import('@/lib/activity');
        await logActivity({
          usuario: 'Admin', modulo: 'ventas', accion: 'Venta saldada (pago completo)',
          detalles: `Venta de ${venta.cliente} marcada como pagada. Total: $${totalVenta.toFixed(2)}`,
          referencia_id: venta.id, referencia_tabla: 'ventas_dia',
        });
      } catch {}

      alert(`¡Venta saldada! Se generó la factura total ($${totalVenta.toFixed(2)}) con el historial completo de abonos.`);
      await fetchData();
    } catch (err: any) {
      alert('Error al marcar como pagado: ' + err.message);
    } finally {
      setProcesandoAbono(false);
    }
  };

  const addToCart = (prod: any) => {
    const existing = cart.find(item => item.id === prod.id);
    if (existing) {
      setCart(cart.map(item => 
        item.id === prod.id 
          ? { ...item, cantidad: item.cantidad + 1, total: (item.cantidad + 1) * item.precio_unitario }
          : item
      ));
    } else {
      setCart([...cart, {
        id: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        precio_unitario: prod.precio_usd || 0,
        total: prod.precio_usd || 0,
        stock: prod.stock
      }]);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.cantidad + delta);
        return { ...item, cantidad: newQty, total: newQty * item.precio_unitario };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal * (conIva ? 1.16 : 1);

  const handleFinalize = async () => {
    if (!can('ventas', 'crear')) return alert('No tienes permisos para registrar ventas.');
    if (cart.length === 0) return alert("El carrito está vacío");
    if (!supabase) return;

    if (!confirm(`¿Finalizar venta por $${Number(total).toFixed(2)}?`)) return;

    setProcessing(true);
    try {
      // Abono / Pending logic
      const totalConIva = subtotal * (conIva ? 1.16 : 1);
      
      let abonoAmount = 0;
      let saldoRestante = 0;
      
      if (showAbonoSection) {
        abonoAmount = abono;
        saldoRestante = Math.max(0, totalConIva - abonoAmount);
      } else {
        abonoAmount = 0;
        saldoRestante = 0;
      }

      const tieneAbono = showAbonoSection && abonoAmount > 0 && saldoRestante > 0;
      const estadoVenta = saldoRestante > 0 ? 'pendiente' : 'pagado';

      // Subir comprobante de pago (si se adjuntó imagen) → URL pública
      const comprobanteUrl = await uploadComprobante(comprobante.file);
      const comprobanteRef = comprobante.referencia.trim() || null;

      // 1. Register in ventas_dia (Accounting)
      const { data: ventaDia, error: ventaError } = await withSedeFilter(supabase.from('ventas_dia'))
        .insert(withSedeInsert({
          fecha: format(selectedDate, 'yyyy-MM-dd'),
          cliente: clienteNombre || 'Consumidor Final',
          ...comprobanteFields(comprobanteUrl, comprobanteRef),
          total_ingresos: subtotal, // Store subtotal here, report logic handles IVA
          desglose: cart.map(item => ({
            descripcion: item.nombre,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            total: item.total
          })),
          metodos_pago: metodosPago,
          con_iva: conIva,
          tasa_cambio: rates.bcv,
          notas: `${notas}${vehiculoInfo ? ` | Vehículo: ${vehiculoInfo}` : ''}${tieneAbono ? ` | Abono: $${abonoAmount.toFixed(2)} | Saldo: $${saldoRestante.toFixed(2)}` : ''}`,
          creado_por: 'Admin',
          tiene_abono: tieneAbono,
          abono: abonoAmount,
          saldo_pendiente: saldoRestante,
          estado: estadoVenta
        }))
        .select()
        .single();

      if (ventaError) throw ventaError;

      // 2. Register in ventas_silenciadores (Compatibility)
      const silenciadoresInCart = cart.filter(item => {
        const prod = productos.find(p => p.id === item.id);
        return prod?.categoria === 'silenciador' || prod?.categoria === 'resonador';
      });

      for (const item of silenciadoresInCart) {
        await supabase.from('ventas_silenciadores').insert({
          cantidad: item.cantidad,
          modelo: item.nombre,
          fecha: selectedDate.toISOString(),
          sede_id: currentSede?.id,
          notas: `Venta POS #${ventaDia.id?.slice(0,8)}`
        });
      }

      // 3. Deduct Stock
      for (const item of cart) {
        const newStock = Math.max(0, item.stock - item.cantidad);
        await updateInventarioStock(item.id, newStock);
      }

      // 4. Print PDF (Optional but recommended)
      const data1: any = {
        id: ventaDia.id,
        fecha: format(selectedDate, 'dd/MM/yyyy'),
        cliente: clienteNombre || 'Consumidor Final',
        vehiculo: vehiculoInfo,
        items: cart.map(item => ({
          descripcion: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          total: item.total
        })),
        total: totalConIva,
        pago_usd: metodosPago.efectivo_usd + metodosPago.zelle,
        pago_ves: metodosPago.pago_movil + metodosPago.efectivo_ves,
        tasa_bcv: rates.bcv,
        iva_aplicado: conIva,
        tiene_abono: tieneAbono,
        abono: abonoAmount,
        saldo_pendiente: saldoRestante,
        estado: estadoVenta,
        comprobante_url: comprobanteUrl || undefined,
        comprobante_referencia: comprobanteRef || undefined
      };

      const dataList: any[] = [data1];
      if (printMode === 'dual') {
        dataList.push(data1);
      } else if (printMode === 'diferente' && secondVenta) {
        dataList.push({
          id: secondVenta.id,
          fecha: new Date(secondVenta.created_at).toLocaleDateString(),
          cliente: secondVenta.cliente || undefined,
          items: secondVenta.desglose || [],
          total: secondVenta.total_ingresos,
          tasa_bcv: secondVenta.tasa_cambio || rates.bcv,
          iva_aplicado: secondVenta.con_iva
        });
      }

      // 5. Register in centralized facturas table (BEFORE PDF so correlativo is included)
      let correlativoVenta: string | undefined;
      try {
        const facturaRegistro = await registrarFactura({
          tipo: 'venta',
          modulo_origen: 'ventas_pos',
          referencia_id: ventaDia.id,
          referencia_tabla: 'ventas_dia',
          cliente: clienteNombre || 'Consumidor Final',
          vehiculo: vehiculoInfo || undefined,
          total: totalConIva,
          moneda: 'USD',
          tasa_cambio: rates.bcv,
          total_bs: totalConIva * rates.bcv,
          items: cart.map(item => ({
            descripcion: item.nombre,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            total: item.total
          })),
          metodos_pago: metodosPago,
          con_iva: conIva,
          estado: estadoVenta as 'pagado' | 'pendiente',
          notas: notas || undefined,
          emitido_por: 'Admin',
          fecha_emision: format(selectedDate, 'yyyy-MM-dd'),
          sede_id: currentSede?.id || undefined,
          comprobante_url: comprobanteUrl || undefined,
          comprobante_referencia: comprobanteRef || undefined,
        });
        if (facturaRegistro?.correlativo) correlativoVenta = facturaRegistro.correlativo;
      } catch (facErr) {
        console.error('Error registrando factura centralizada:', facErr);
      }

      // 6. Print PDF with correlativo
      data1.correlativo = correlativoVenta;
      generateInvoicePDF(dataList, { mode: printMode, side: printSide });

      // 6. Success and Reset
      const abonoMsg = tieneAbono
        ? ` Abono: $${abonoAmount.toFixed(2)} | Saldo pendiente: $${saldoRestante.toFixed(2)}. La factura quedó en estado PENDIENTE POR PAGAR.`
        : '';
      alert(`¡Venta realizada con éxito!${abonoMsg} Stock actualizado y comprobante generado.`);
      setCart([]);
      setClienteNombre('');
      setVehiculoInfo('');
      setNotas('');
      setAbono(0);
      setShowAbonoSection(false);
      setComprobante(emptyComprobante());
      fetchData();
    } catch (err: any) {
      console.error('Error finalizing sale:', err);
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const filteredProductos = productos.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.categoria.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="text-gradient hover-glow italic">Ventas POS</span>
            <ShoppingCart className="w-8 h-8 text-primary animate-float" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Venta multi-artículo con sincronización total.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <button className="glass-card px-5 py-2.5 rounded-2xl border-2 border-primary/30 bg-primary/5 shadow-lg hover:bg-primary/10 transition-all text-left group relative overflow-hidden animate-pulse-glow min-w-[180px]">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 animate-bounce" /> Fecha de Venta
                  </p>
                  <Badge className="bg-primary text-white text-[7px] font-black h-4 px-1.5 border-none">
                    MODIFICAR
                  </Badge>
                </div>
                <p className="text-base font-black text-foreground truncate tracking-tight">{format(selectedDate, "PPP", { locale: es })}</p>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-2xl border-border/50 shadow-2xl" align="start">
              <CalendarUI
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
                locale={es}
                className="rounded-2xl"
              />
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-4 bg-card/40 backdrop-blur-xl p-2 rounded-2xl border border-border/50 h-full">
            <div className="flex flex-col items-end pr-4 border-r border-border/30">
              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Tasa BCV</span>
              <span className="text-sm font-black text-primary">{rates.bcv} Bs/$</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Sede</span>
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3 text-primary" />
                {currentSede?.nombre || 'General'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Botón flotante de carrito para móviles */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-6 right-6 z-50">
          <Button 
            onClick={() => document.getElementById('checkout-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="rounded-full h-16 w-16 shadow-2xl bg-primary hover:bg-primary/90 text-white p-0 relative group animate-pulse"
          >
            <ShoppingCart className="w-6 h-6" />
            <Badge className="absolute -top-1 -right-1 bg-destructive text-white border-2 border-white w-6 h-6 flex items-center justify-center p-0 text-[10px]">
              {cart.length}
            </Badge>
          </Button>
        </div>
      )}

      {/* ── Tabs: Nueva Venta / Pendientes ──────────────── */}
      <div className="flex items-center gap-1 bg-card/40 backdrop-blur-xl p-1 rounded-2xl border border-border/50 w-fit">
        <button
          onClick={() => setTabVenta('nueva')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            tabVenta === 'nueva'
              ? "bg-primary text-white shadow-lg shadow-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          )}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Nueva Venta
        </button>
        <button
          onClick={() => setTabVenta('pendientes')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all relative",
            tabVenta === 'pendientes'
              ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          Pendientes por Pagar
          {!loading && ventasPendientes.length > 0 && (
            <span className="bg-destructive text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
              {ventasPendientes.length}
            </span>
          )}
        </button>
      </div>

      {tabVenta === 'pendientes' ? (
        /* ── Sección de Ventas Pendientes ────────────────── */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Ventas Pendientes por Cobrar
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ventasPendientes.length > 0
                  ? `Total pendiente: $${ventasPendientes.reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0).toFixed(2)}`
                  : 'No hay ventas pendientes'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { fetchData(); setLoadingPendientes(true); setTimeout(() => setLoadingPendientes(false), 500); }}
              className="text-xs gap-1"
            >
              <Loader2 className={cn("w-3 h-3", loadingPendientes && "animate-spin")} />
              Actualizar
            </Button>
          </div>

          <Card className="glass-panel border-border/50 bg-card/40">
            <CardContent className="p-0">
              {ventasPendientes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 opacity-40">
                  <CheckCircle className="w-12 h-12 mb-3 text-green-400" />
                  <p className="text-sm font-bold uppercase tracking-widest">Todo al día</p>
                  <p className="text-xs text-muted-foreground mt-1">No hay ventas pendientes de pago</p>
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {ventasPendientes.map((v: any) => (
                    <div key={v.id} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black truncate">{v.cliente || 'Consumidor Final'}</p>
                          <Badge variant="outline" className="text-amber-400 border-amber-400/30 bg-amber-500/5 text-[8px] font-black px-1.5">
                            PENDIENTE
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{new Date(v.created_at).toLocaleDateString('es-VE')}</span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Total: ${Number(v.total_ingresos || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black text-amber-400">${Number(v.saldo_pendiente || 0).toFixed(2)}</p>
                        <p className="text-[9px] font-bold text-muted-foreground">SALDO</p>
                        {v.abono > 0 && (
                          <p className="text-[9px] font-bold text-green-400">Abonó: ${Number(v.total_abonado || v.abono).toFixed(2)}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Button
                          size="sm"
                          className="h-7 rounded-lg text-[9px] font-black gap-1 bg-green-500 hover:bg-green-600 text-white"
                          onClick={() => abrirModalAbono(v)}
                        >
                          <DollarSign className="w-3 h-3" /> Abonar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg text-[9px] font-black gap-1 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                          onClick={() => marcarPagadoCompleto(v)}
                          disabled={procesandoAbono}
                        >
                          <CheckCircle className="w-3 h-3" /> Pagado
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Catálogo de Productos */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="glass-panel border-border/50 bg-card/40">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por nombre o categoría..." 
                  className="pl-10 h-11 bg-background/50"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground animate-pulse">Cargando inventario...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredProductos.map(prod => (
                    <button
                      key={prod.id}
                      disabled={prod.stock <= 0}
                      onClick={() => addToCart(prod)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-2xl border border-border/30 transition-all text-left group relative overflow-hidden",
                        prod.stock <= 0 ? "opacity-50 grayscale cursor-not-allowed" : "bg-background/40 hover:bg-white hover:border-primary/30 hover:shadow-lg active:scale-[0.98]"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center text-primary transition-colors",
                        prod.stock <= 0 ? "bg-muted" : "bg-primary/10 group-hover:bg-primary group-hover:text-white"
                      )}>
                        <Package className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight truncate">{prod.nombre}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm font-black text-primary">${prod.precio_usd || '0.00'}</span>
                          <Badge variant={prod.stock <= 5 ? "destructive" : "secondary"} className="text-[9px] px-1.5 h-4 font-black">
                            {prod.stock} DISP.
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredProductos.length === 0 && (
                    <div className="col-span-full py-10 text-center text-muted-foreground">
                      No se encontraron productos.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Info del Cliente */}
          <Card className="glass-panel border-border/50 bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> Información del Cliente (Opcional)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre / Razón Social</Label>
                <Input 
                  placeholder="Ej: Juan Pérez" 
                  value={clienteNombre} 
                  onChange={e => setClienteNombre(e.target.value)}
                  className="bg-background/50 h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vehículo / Placa</Label>
                <Input 
                  placeholder="Ej: Toyota Corolla ABC-123" 
                  value={vehiculoInfo} 
                  onChange={e => setVehiculoInfo(e.target.value)}
                  className="bg-background/50 h-10 text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Carrito de Compras */}
        <div id="checkout-section" className="lg:col-span-5 space-y-4">
          <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl relative overflow-hidden flex flex-col h-full min-h-[70vh]">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none rotate-12">
              <ShoppingCart className="w-64 h-64" />
            </div>
            
            <CardHeader className="border-b border-border/30 bg-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-black flex items-center gap-2">
                  RESUMEN DE VENTA
                  <Badge className="bg-primary text-white border-none">{cart.length}</Badge>
                </CardTitle>
                <button onClick={() => setCart([])} className="text-[10px] font-bold text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Limpiar
                </button>
              </div>

              {/* Selector de Fecha */}
              <div className="mt-4 flex items-center justify-between bg-background/60 p-3 rounded-xl border border-border/40">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-[11px] font-bold text-foreground">{format(selectedDate, "PPP", { locale: es })}</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 rounded-lg border-primary/20 text-primary font-black text-[9px] uppercase px-2">
                      Cambiar
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarUI
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      initialFocus
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-0 custom-scrollbar">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                  <ShoppingCart className="w-16 h-16 mb-4" />
                  <p className="text-sm font-bold uppercase tracking-widest">Carrito Vacío</p>
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {cart.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-3 hover:bg-white/5 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black uppercase truncate">{item.nombre}</p>
                        <p className="text-[10px] font-bold text-primary mt-1">${item.precio_unitario} x {item.cantidad}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-background rounded-lg border border-border shadow-sm">
                          <button onClick={() => updateQuantity(item.id, -1)} className="px-2 py-1 text-muted-foreground hover:text-primary transition-colors">-</button>
                          <span className="w-8 text-center text-xs font-black">{item.cantidad}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="px-2 py-1 text-muted-foreground hover:text-primary transition-colors">+</button>
                        </div>
                        <p className="w-20 text-right text-sm font-black italic">${Number(item.total).toFixed(2)}</p>
                        <button onClick={() => removeFromCart(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>

            <div className="p-6 border-t border-border/30 bg-secondary/10 space-y-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={conIva} 
                    onChange={e => setConIva(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary" 
                  />
                  <span className="text-xs font-black text-muted-foreground group-hover:text-primary transition-colors uppercase">Aplicar IVA (16%)</span>
                </label>
                <div className="text-right">
                  <p className="text-base font-bold">${Number(subtotal).toFixed(2)}</p>
                </div>
              </div>

              {/* ── Abono Accordion ─────────────────────────── */}
              <div className="bg-background/40 rounded-2xl border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAbonoSection(!showAbonoSection)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-wider">
                      Abono / Apartado
                    </span>
                    {showAbonoSection && abono > 0 && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                        ${abono.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", showAbonoSection && "rotate-180")} />
                </button>
                <div className={cn("overflow-hidden transition-all duration-200", showAbonoSection ? "max-h-96" : "max-h-0")}>
                  <div className="px-4 pb-4 pt-1 space-y-3">
                    <p className="text-[10px] text-muted-foreground font-bold leading-tight">
                      Registra un abono parcial. La venta quedará como <span className="text-amber-400">PENDIENTE POR PAGAR</span> hasta que se liquide el saldo.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            type="number"
                            min={0}
                            max={total}
                            step={0.01}
                            placeholder="0.00"
                            value={abono || ''}
                            onChange={e => setAbono(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="pl-9 h-10 text-sm font-bold bg-background/50"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                        <span className="font-bold text-muted-foreground">Total venta:</span>
                        <span className="font-black text-foreground">${Number(total).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                        <span className="font-bold text-muted-foreground">Abono ahora:</span>
                        <span className="font-black text-green-400">- $${abono.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-3 bg-amber-500/10 rounded-xl border border-amber-400/20">
                        <span className="font-bold text-amber-400">Saldo pendiente:</span>
                        <span className="font-black text-amber-400">${Math.max(0, total - abono).toFixed(2)}</span>
                      </div>
                      {abono > 0 && total - abono <= 0 && (
                        <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-xl border border-green-500/20">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="text-xs font-bold text-green-400">El abono cubre el total — la venta quedará como PAGADA.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Notas Accordion ─────────────────────────── */}
              <div className="bg-background/40 rounded-2xl border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowNotasSection(!showNotasSection)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-wider">
                      Nota / Descripción
                    </span>
                    {showNotasSection && notas && (
                      <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full truncate max-w-[100px]">
                        {notas}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", showNotasSection && "rotate-180")} />
                </button>
                <div className={cn("overflow-hidden transition-all duration-200", showNotasSection ? "max-h-96" : "max-h-0")}>
                  <div className="px-4 pb-4 pt-1">
                    <textarea
                      placeholder="Notas adicionales para la factura..."
                      value={notas}
                      onChange={e => setNotas(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-3 py-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between py-4 border-y border-primary/20">
                <div>
                  <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-1">Total a Pagar</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-primary tracking-tighter italic">${Number(total).toFixed(2)}</span>
                    <span className="text-xs font-bold text-muted-foreground">USD</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 px-4 bg-primary/5 rounded-2xl border border-primary/10">
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-primary font-black uppercase tracking-widest">Configuración Impresión</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white/50 rounded-lg p-0.5 border border-primary/10">
                      <button 
                        onClick={() => setPrintMode('single')}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printMode === 'single' ? "bg-primary text-white shadow-sm" : "text-slate-500")}
                      >
                        Única
                      </button>
                      <button 
                        onClick={() => setPrintMode('dual')}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printMode === 'dual' ? "bg-primary text-white shadow-sm" : "text-slate-500")}
                        title="Dos copias de la misma factura"
                      >
                        Dual
                      </button>
                      <button 
                        onClick={() => {
                          setPrintMode('diferente');
                          if (!secondVenta) setShowSelector(true);
                        }}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printMode === 'diferente' ? "bg-primary text-white shadow-sm" : "text-slate-500")}
                        title="Dos facturas diferentes"
                      >
                        Diferente
                      </button>
                    </div>
                    {printMode === 'single' && (
                      <div className="flex items-center bg-white/50 rounded-lg p-0.5 border border-primary/10">
                        <button 
                          onClick={() => setPrintSide('left')}
                          className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printSide === 'left' ? "bg-primary text-white shadow-sm" : "text-slate-500")}
                        >
                          Izq
                        </button>
                        <button 
                          onClick={() => setPrintSide('right')}
                          className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printSide === 'right' ? "bg-primary text-white shadow-sm" : "text-slate-500")}
                        >
                          Der
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">En Bolívares</p>
                  <p className="text-xl font-black text-foreground">{(total * rates.bcv).toLocaleString('es-VE')} Bs.</p>
                </div>
              </div>

              <div className="pt-2">
                <ComprobanteInput value={comprobante} onChange={setComprobante} compact />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 h-12 rounded-xl border-primary/30 text-primary font-bold gap-2"
                  onClick={() => {
                    if (cart.length === 0) return;
                    const totalConIvaBorrador = subtotal * (conIva ? 1.16 : 1);
                    const abonoBorrador = showAbonoSection ? abono : 0;
                    generateInvoicePDF([{
                      fecha: new Date().toLocaleDateString(),
                      cliente: clienteNombre,
                      vehiculo: vehiculoInfo,
                      items: cart.map(i => ({ descripcion: i.nombre, cantidad: i.cantidad, precio_unitario: i.precio_unitario, total: i.total })),
                      total: totalConIvaBorrador,
                      tasa_bcv: rates.bcv,
                      iva_aplicado: conIva,
                      tiene_abono: abonoBorrador > 0 && (totalConIvaBorrador - abonoBorrador) > 0,
                      abono: abonoBorrador,
                      saldo_pendiente: Math.max(0, totalConIvaBorrador - abonoBorrador),
                      estado: abonoBorrador > 0 && (totalConIvaBorrador - abonoBorrador) > 0 ? 'pendiente' : 'pagado'
                    }], { mode: printMode, side: printSide });
                  }}
                >
                  <Printer className="w-4 h-4" /> Borrador
                </Button>
                
                <Button 
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-xl border border-primary/20 text-primary hover:bg-primary/5"
                  onClick={() => setShowSelector(true)}
                  title="Seleccionar factura para modo Diferente"
                >
                  <Search className="w-4 h-4" />
                </Button>

                {can('ventas', 'crear') ? (
                  <Button 
                    disabled={processing || cart.length === 0}
                    className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-primary/30"
                    onClick={handleFinalize}
                  >
                    {processing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Procesando</>
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Finalizar</>
                    )}
                  </Button>
                ) : (
                  <Button 
                    className="flex-1 h-12 rounded-xl" 
                    disabled
                    variant="outline"
                  >
                    Sin Permiso
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
      )}

      {/* Selector de Segunda Factura */}
      {showSelector && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[80%] overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-black flex items-center gap-2 italic uppercase tracking-widest text-slate-900">
                <Receipt className="w-4 h-4 text-primary" /> Seleccionar Otra Factura
              </h3>
              <button onClick={() => setShowSelector(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4 overflow-hidden">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  autoFocus
                  className="w-full bg-slate-100 border-none rounded-2xl pl-10 pr-4 py-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="Buscar cliente..."
                  value={searchTermVenta}
                  onChange={e => setSearchTermVenta(e.target.value)}
                />
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {ventasRecientes.filter(v => searchTermVenta === '' || (v.cliente || '').toLowerCase().includes(searchTermVenta.toLowerCase())).map(v => (
                  <button 
                    key={v.id} 
                    onClick={() => { setSecondVenta(v); setShowSelector(false); }}
                    className="w-full text-left p-4 rounded-2xl border border-transparent hover:border-slate-100 hover:bg-slate-50 transition-all flex justify-between items-center"
                  >
                    <div>
                      <p className="text-xs font-black text-slate-900 uppercase italic">{v.cliente || 'Consumidor Final'}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{new Date(v.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="text-xs font-black text-primary italic">${Number(v.total_ingresos).toFixed(2)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Abono ───────────────────────────────────── */}
      {abonoModalVenta && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !procesandoAbono && setAbonoModalVenta(null)}>
          <div className="bg-card border border-border rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border/50 flex items-center justify-between sticky top-0 bg-card z-10">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-400" /> Registrar Abono
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{abonoModalVenta.cliente}</p>
              </div>
              <button onClick={() => !procesandoAbono && setAbonoModalVenta(null)} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-background/50 border border-border/40 p-2.5">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase">Total</p>
                  <p className="text-sm font-black">${Number(abonoModalVenta.total_ingresos || 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-2.5">
                  <p className="text-[9px] font-bold text-green-400 uppercase">Abonado</p>
                  <p className="text-sm font-black text-green-400">${Number(abonoModalVenta.total_abonado || abonoModalVenta.abono || 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-2.5">
                  <p className="text-[9px] font-bold text-amber-400 uppercase">Saldo</p>
                  <p className="text-sm font-black text-amber-400">${Number(abonoModalVenta.saldo_pendiente || 0).toFixed(2)}</p>
                </div>
              </div>

              {abonoModalVenta.presupuesto_numero && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-2.5 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold">Presupuesto {abonoModalVenta.presupuesto_numero}</span>
                </div>
              )}

              {/* Historial de abonos */}
              <div>
                <Label className="text-xs font-bold mb-2 block">Historial de abonos</Label>
                {loadingAbonos ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                ) : abonosHistorial.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Sin abonos previos</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {abonosHistorial.map((a, i) => (
                      <div key={a.id} className="flex items-center justify-between text-xs bg-background/40 rounded-lg px-3 py-1.5 border border-border/30">
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="text-green-400 border-green-400/30 text-[8px] font-black px-1.5">ABONO {i + 1}</Badge>
                          <span className="text-muted-foreground">{new Date(a.created_at).toLocaleDateString('es-VE')}</span>
                        </span>
                        <span className="font-black text-green-400">${Number(a.monto).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Nuevo abono */}
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">Monto del abono (USD)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={abonoMonto || ''}
                    onChange={e => setAbonoMonto(Number(e.target.value))}
                    placeholder="0.00"
                    className="h-11 text-lg font-black"
                  />
                  <div className="flex gap-1.5 mt-2">
                    {[0.25, 0.5, 1].map(frac => {
                      const saldo = Number(abonoModalVenta.saldo_pendiente) || 0;
                      const val = frac === 1 ? saldo : Math.round(saldo * frac * 100) / 100;
                      return (
                        <button key={frac} onClick={() => setAbonoMonto(val)}
                          className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-background/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors">
                          {frac === 1 ? 'Saldo total' : `${frac * 100}%`} (${val.toFixed(2)})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold mb-1.5 block">Método de pago</Label>
                  <Select value={abonoMetodo} onValueChange={setAbonoMetodo}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo USD</SelectItem>
                      <SelectItem value="zelle">Zelle</SelectItem>
                      <SelectItem value="pago_movil">Pago Móvil</SelectItem>
                      <SelectItem value="efectivo_ves">Efectivo Bs</SelectItem>
                      <SelectItem value="punto_de_venta">Punto de Venta</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="cashea">Cashea</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold mb-1.5 block">Nota (opcional)</Label>
                  <Input value={abonoNota} onChange={e => setAbonoNota(e.target.value)} placeholder="Referencia, observación..." className="h-10" />
                </div>

                {abonoMonto > 0 && (
                  <div className="rounded-xl bg-background/50 border border-border/40 p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Abono ahora:</span><span className="font-black text-green-400">${abonoMonto.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Saldo después:</span><span className="font-black text-amber-400">${Math.max(0, (Number(abonoModalVenta.saldo_pendiente) || 0) - abonoMonto).toFixed(2)}</span></div>
                    {(Number(abonoModalVenta.saldo_pendiente) || 0) - abonoMonto <= 0.001 && (
                      <div className="flex items-center gap-1.5 pt-1 text-green-400"><CheckCircle className="w-3.5 h-3.5" /><span className="font-bold">Este abono salda la venta por completo</span></div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-border/50 flex gap-2 sticky bottom-0 bg-card">
              <Button variant="outline" className="flex-1 h-11 font-bold" onClick={() => setAbonoModalVenta(null)} disabled={procesandoAbono}>Cancelar</Button>
              <Button className="flex-1 h-11 font-black bg-green-500 hover:bg-green-600 text-white gap-2" onClick={registrarAbono} disabled={procesandoAbono || abonoMonto <= 0}>
                {procesandoAbono ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Registrar Abono
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
