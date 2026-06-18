'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, Plus, Trash2, Receipt, Package, 
  Search, MapPin, CheckCircle, AlertCircle, Loader2,
  TrendingUp, Calendar, ArrowRight, Printer, UserPlus,
  ArrowDown, ChevronRight, ChevronDown, X, CreditCard, Banknote, 
  Wallet, Sparkles, Filter, Eye, Download, History,
  FileText, Car, User, DollarSign, Info, Calculator, Clock,
  Coins, Smartphone, Repeat, RefreshCw, Bot
} from 'lucide-react';
import { supabase, updateInventarioStock, registrarFactura } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { useAppStore } from '@/lib/store';
import { cn, parseDescripcionItems } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateInvoicePDF } from '@/lib/invoice-pdf';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CartItem {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  precio_bs?: number;
  total: number;
  stock: number;
  isTuberia?: boolean;
  medida_tuberia?: 'completo' | 'metros';
  metros_tuberia?: number;
  precio_tuberia_completo?: number;
}

export default function VentasPage() {
  const [productos, setProductos] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [vehiculoInfo, setVehiculoInfo] = useState('');
  const [notas, setNotas] = useState('');
  const [conIva, setConIva] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // Cashea: porcentaje de inicial (40, 50 o 60%)
  const [casheaPct, setCasheaPct] = useState<40 | 50 | 60>(50);
  // Cashea: moneda visual ('usd' o 'ves')
  const [casheaCurrency, setCasheaCurrency] = useState<'usd' | 'ves'>('usd');
  // Custom item prices (for tubería and variable-price items)
  const [customItemPrices, setCustomItemPrices] = useState<Record<string, number>>({});
  
  // Modals
  const [showPreview, setShowPreview] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showSaleDetail, setShowSaleDetail] = useState(false);
  const [showAbonoDialog, setShowAbonoDialog] = useState(false);
  const [selectedPendiente, setSelectedPendiente] = useState<any>(null);
  const [abonoExtra, setAbonoExtra] = useState(0);

  const symbol = (selectedSale?.metodos_pago?.euros > 0 || /euro/i.test(selectedSale?.notes || '') || /euro/i.test(selectedSale?.notas || '')) ? '€' : '$';

  // Payment methods (Stored in USD/Euros)
  const [metodosPago, setMetodosPago] = useState({
    efectivo_usd: 0,
    zelle: 0,
    pago_movil: 0,
    efectivo_ves: 0,
    punto_de_venta: 0,
    transferencia: 0,
    cashea: 0,
    binance: 0,
    euros: 0,
    otro: 0
  });

  const [printMode, setPrintMode] = useState<'single' | 'dual' | 'diferente'>('dual');
  const [printSide, setPrintSide] = useState<'left' | 'right'>('left');
  const [printCurrencyMode, setPrintCurrencyMode] = useState<'auto' | 'usd' | 'dual'>('auto');

  const { currentSede, sedeRefreshKey } = useSedeStore();
  const [rates, setRates] = useState({ bcv: 518.0 });
  const [customRate, setCustomRate] = useState<number | null>(null);

  // Stats
  const [ventasRecientes, setVentasRecientes] = useState<any[]>([]);

  const [searchTermVenta, setSearchTermVenta] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [secondVenta, setSecondVenta] = useState<any | null>(null);
  const [modoCashea, setModoCashea] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Local state for Bs. inputs to avoid rounding issues while typing
  const [bsInputs, setBsInputs] = useState<Record<string, string>>({});
  // Collapsible sections
  const [showAbonoSection, setShowAbonoSection] = useState(false);
  const [showNotasSection, setShowNotasSection] = useState(false);
  const [abono, setAbono] = useState(0);
  const [tabVenta, setTabVenta] = useState<'nueva' | 'pendientes'>('nueva');
  const [ventasPendientes, setVentasPendientes] = useState<any[]>([]);
  const [loadingPendientes, setLoadingPendientes] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchData();
    fetchRates();
  }, [currentSede, sedeRefreshKey]);

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/rates');
      const data = await res.json();
      if (data.bcv) setRates({ bcv: data.bcv });
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

      // Fetch both accounting sales and IA-registered silencer sales
      const [salesDia, salesSil] = await Promise.all([
        withSedeFilter(supabase.from('ventas_dia'))
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
        withSedeFilter(supabase.from('ventas_silenciadores'))
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      const hoyStr = new Date().toISOString().split('T')[0];

       const normalizedSil = (salesSil.data || []).map((v: any) => {
        const notes = v.notas || '';
        
        // Robust multi-format price extraction:
        // Prioritize "Total" lines to avoid picking up individual item prices or IVA
        const totalMatch =
          notes.match(/[Tt]otal(?:\s+a\s+pagar)?\s*(?:[Cc]ashea|USD|BCV)?\s*[:=]?\s*(?:USD\s*)?\$?\s*([\d]+(?:[.,][\d]+)?)/i) ||
          notes.match(/\[[Tt]otal\s+[^\]]+\]\s*[:=]?\s*\$?\s*([\d]+(?:[.,][\d]+)?)/i) ||
          notes.match(/USD\s+([\d]+(?:[.,][\d]+)?)/i);

        const rawPrice = totalMatch ? totalMatch[1].replace(',', '.') : null;
        const extractedPrice = rawPrice ? parseFloat(rawPrice) : null;

        // Detect currency context (BCV, Divisas, Cashea, Binance)
        const isBcv = /bcv/i.test(notes) && !/cashea/i.test(notes);
        const isDivisas = /divisas|promo/i.test(notes) && !/cashea/i.test(notes);
        const isCashea = /cashea/i.test(notes);
        const isBinance = /binance|usdt/i.test(notes);
        
        let context: string | null = isBcv ? 'BCV' : isDivisas ? 'Div' : null;
        if (isCashea) context = 'Cashea';
        if (isBinance) context = 'USDT';

        // Extract client from notes
        const clientMatch = notes.match(/[Cc]liente[:\s]+([^|\n,]+)/i);
        const clientFromNotes = clientMatch ? clientMatch[1].trim() : null;

        // Parse 'Items: A:$10, B:$20' format into proper desglose
        const itemsMatch = notes.match(/Items?:\s*([^|\n]+)/i);
        let parsedDesglose: { descripcion: string; cantidad: number; total: number }[] = [];
        if (itemsMatch) {
          parsedDesglose = itemsMatch[1].split(',').map((item: string) => {
            const parts = item.trim().split(':');
            const desc = parts[0]?.trim() || item.trim();
            const priceStr = parts[1]?.replace(/[^\d.]/g, '') || '0';
            return { descripcion: desc, cantidad: 1, total: parseFloat(priceStr) || 0 };
          });
        }

        // Fallback to inventory lookup if no price found in notes
        let unitPrice: number | null = extractedPrice;
        let matchedProduct = null;

        if (unitPrice === null) {
          const modelLower = (v.modelo || '').toLowerCase().trim();
          matchedProduct = (invData || []).find((p: any) => {
            const nameLower = (p.nombre || '').toLowerCase();
            return nameLower === modelLower || nameLower.includes(modelLower) || (modelLower.length > 2 && modelLower.includes(nameLower));
          });
          // Cashea uses BCV price; otherwise use divisas price
          if (matchedProduct) {
            unitPrice = isCashea
              ? (matchedProduct.precio_bs || 0)
              : (matchedProduct.precio_promo || matchedProduct.precio_usd || matchedProduct.precio || 0);
          } else {
            unitPrice = 0;
          }
        }

        const total = (unitPrice ?? 0) * (v.cantidad || 1);

        // Use parsedDesglose if available, else build single item
        const desglose = parsedDesglose.length > 0 ? parsedDesglose : [{
          descripcion: v.modelo || 'Producto',
          cantidad: v.cantidad || 1,
          total: total
        }];

        const ventaFecha = v.fecha?.split('T')[0] || '';
        const isAtrasado = v.registro_atrasado === true || (ventaFecha && ventaFecha !== hoyStr && v.created_at?.split('T')[0] !== ventaFecha);

        return {
          id: v.id,
          created_at: v.created_at || v.fecha,
          fecha: v.fecha,
          displayDate: v.fecha || v.created_at,
          cliente: clientFromNotes || 'Consumidor Final',
          total_ingresos: total,
          context: context,
          isCashea: isCashea,
          isBinance: isBinance,
          desglose: desglose,
          notas: v.notas,
          source: 'ia',
          isAtrasado
        };
      });

      const normalizedAccounting = (salesDia.data || []).map((v: any) => {
        const isCashea = (v.notas || '').toLowerCase().includes('cashea') || (v.metodos_pago && Number(v.metodos_pago.cashea) > 0);
        const isBinance = (v.notas || '').toLowerCase().includes('binance') || (v.metodos_pago && Number(v.metodos_pago.binance) > 0);
        const ventaFecha = v.fecha || v.created_at?.split('T')[0] || '';
        const isAtrasado = v.registro_atrasado === true || (ventaFecha && ventaFecha !== hoyStr && v.created_at?.split('T')[0] !== ventaFecha);
        
        return {
          ...v,
          cliente: v.cliente || 'Consumidor Final',
          isCashea,
          isBinance,
          source: 'pos',
          displayDate: v.fecha || v.created_at,
          isAtrasado
        };
      });

      const mergedSales = [...normalizedAccounting, ...normalizedSil]
        .sort((a, b) => {
          const dateA = a.displayDate ? new Date(a.displayDate).getTime() : new Date(a.created_at).getTime();
          const dateB = b.displayDate ? new Date(b.displayDate).getTime() : new Date(b.created_at).getTime();
          return dateB - dateA;
        })
        .slice(0, 10);

      setVentasRecientes(mergedSales);
      // Fetch pending sales (con abono / saldo pendiente)
      const { data: pData } = await withSedeFilter(supabase.from('ventas_dia'))
        .select('*')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(50);
      setVentasPendientes(pData || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (prod: any) => {
    const existing = cart.find(item => item.id === prod.id);
    const customPrice = customItemPrices[prod.id];
    const effectivePrice = customPrice !== undefined ? customPrice : (prod.precio_usd || 0);
    const isTub = prod.nombre.toLowerCase().includes('tuberia') || 
                  prod.nombre.toLowerCase().includes('tubería') || 
                  prod.nombre.toLowerCase().startsWith('tubo') || 
                  prod.nombre.toLowerCase().includes('tubo ') ||
                  (prod.categoria && (
                    prod.categoria.toLowerCase() === 'tuberia' || 
                    prod.categoria.toLowerCase() === 'tubería'
                  ));

    if (existing) {
      let qtyNeeded = existing.cantidad + 1;
      if (existing.isTuberia && existing.medida_tuberia === 'metros') {
        qtyNeeded = Math.ceil((qtyNeeded * (existing.metros_tuberia || 6)) / 6);
      }
      if (qtyNeeded > prod.stock) return alert("Stock insuficiente");
      
      setCart(cart.map(item => 
        item.id === prod.id 
          ? { ...item, cantidad: item.cantidad + 1, total: (item.cantidad + 1) * item.precio_unitario }
          : item
      ));
    } else {
      const effectivePrecioBs = prod.precio_bs || effectivePrice;
      setCart([...cart, {
        id: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        precio_unitario: effectivePrice,
        precio_bs: effectivePrecioBs,
        total: effectivePrice,
        stock: prod.stock,
        isTuberia: isTub,
        medida_tuberia: isTub ? 'completo' : undefined,
        metros_tuberia: isTub ? 6 : undefined,
        precio_tuberia_completo: isTub ? effectivePrice : undefined
      }]);
    }
  };

  // Update custom price for an item already in cart
  const updateCartItemPrice = (id: string, newPrice: number) => {
    setCart(cart.map(item =>
      item.id === id
        ? { ...item, precio_unitario: newPrice, total: newPrice * item.cantidad }
        : item
    ));
  };

  // Update Dólar BCV price (expressed in USD) for an item already in cart
  const updateCartItemPrecioBs = (id: string, newPrecioBs: number) => {
    setCart(cart.map(item =>
      item.id === id
        ? { ...item, precio_bs: newPrecioBs }
        : item
    ));
  };

  const handleTuberiaChange = (id: string, medida: 'completo' | 'metros', metros: number) => {
    const prod = productos.find(p => p.id === id);
    if (!prod) return;

    setCart(cart.map(item => {
      if (item.id === id) {
        let qtyNeeded = item.cantidad;
        if (medida === 'metros') {
          qtyNeeded = Math.ceil((item.cantidad * metros) / 6);
        }
        
        if (qtyNeeded > prod.stock) {
          alert(`Stock insuficiente. Solo hay ${prod.stock} tubo(s) disponible(s).`);
          return item;
        }

        const precioCompleto = item.precio_tuberia_completo !== undefined ? item.precio_tuberia_completo : item.precio_unitario;
        let newPrecioUnitario = item.precio_unitario;
        let newTotal = item.total;
        let newPrecioBs = item.precio_bs;

        if (medida === 'completo') {
          newPrecioUnitario = precioCompleto;
          newTotal = precioCompleto * item.cantidad;
          newPrecioBs = item.precio_bs || precioCompleto;
        } else {
          const calculatedPrice = (precioCompleto / 6) * metros;
          newPrecioUnitario = Number(calculatedPrice.toFixed(2));
          newTotal = newPrecioUnitario * item.cantidad;
          if (item.precio_bs) {
            const originalBsCompleto = (item.precio_bs * 6) / (item.metros_tuberia || 6);
            newPrecioBs = Number(((originalBsCompleto / 6) * metros).toFixed(2));
          } else {
            newPrecioBs = newPrecioUnitario;
          }
        }

        return {
          ...item,
          medida_tuberia: medida,
          metros_tuberia: metros,
          precio_unitario: newPrecioUnitario,
          precio_bs: newPrecioBs,
          total: newTotal
        };
      }
      return item;
    }));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const prod = productos.find(p => p.id === id);
        const newQty = Math.max(1, item.cantidad + delta);
        
        let qtyNeeded = newQty;
        if (item.isTuberia && item.medida_tuberia === 'metros') {
          qtyNeeded = Math.ceil((newQty * (item.metros_tuberia || 6)) / 6);
        }

        if (delta > 0 && prod && qtyNeeded > prod.stock) {
           alert("Stock insuficiente");
           return item;
        }
        return { ...item, cantidad: newQty, total: newQty * item.precio_unitario };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const activeRate = customRate !== null ? customRate : rates.bcv;

  // Cashea uses precio_bs (which stores the BCV base price in USD) or precio_unitario.
  const isCasheaActive = modoCashea || metodosPago.cashea > 0;
  const subtotal = cart.reduce((sum, item) => {
    // Si es Cashea, usamos el precio base (precio_bs que ya está en USD para tasa BCV)
    const basePrice = (conIva && isCasheaActive)
      ? (item.precio_bs || item.precio_unitario)
      : item.precio_unitario;
    return sum + (item.cantidad * basePrice);
  }, 0);

  const total = subtotal * (conIva ? 1.16 : 1);
  // Cashea initial payment = total * casheaPct%
  const casheaInicial = total * (casheaPct / 100);
  const casheaResto = total - casheaInicial;
  const casheaCuota = casheaResto / 3;

  const totalPaid = Object.values(metodosPago).reduce((acc, val) => acc + val, 0);
  const balance = total - totalPaid;

  const resolvedCurrencyMode = printCurrencyMode === 'auto'
    ? ((metodosPago.pago_movil > 0 || metodosPago.efectivo_ves > 0 || isCasheaActive) ? 'dual' : 'usd')
    : printCurrencyMode;

  const handleFinalize = async () => {
    if (cart.length === 0) return alert("El carrito está vacío");
    if (!supabase) return;

    let abonoAmount = showAbonoSection ? abono : 0;
    let saldoRestante = 0;
    
    if (isCasheaActive) {
      abonoAmount = totalPaid;
      saldoRestante = Math.max(0, total - totalPaid);
    } else {
      if (showAbonoSection) {
        if (totalPaid < abonoAmount - 0.05) return alert(`El abono registrado es de $${abonoAmount.toFixed(2)}, pero solo hay $${totalPaid.toFixed(2)} en métodos de pago.`);
        saldoRestante = Math.max(0, total - abonoAmount);
      } else {
        if (Math.abs(balance) > 0.05 && balance > 0) return alert(`Aún falta pagar $${(balance || 0).toFixed(2)}`);
        abonoAmount = 0;
        saldoRestante = 0;
      }
    }

    const tieneAbono = isCasheaActive || (showAbonoSection && abonoAmount > 0 && saldoRestante > 0);
    const estadoVenta = saldoRestante > 0 ? 'pendiente' : 'pagado';

    setProcessing(true);
    try {
      const ventaFechaStr = format(selectedDate, 'yyyy-MM-dd');
      const hoyStr = format(new Date(), 'yyyy-MM-dd');
      const esRegistroAtrasado = ventaFechaStr !== hoyStr;

      const { data: ventaDia, error: ventaError } = await withSedeFilter(supabase.from('ventas_dia'))
        .insert(withSedeInsert({
          fecha: ventaFechaStr,
          cliente: clienteNombre || 'Consumidor Final',
          total_ingresos: total,
          desglose: cart.map(item => {
            const effectivePrice = (conIva && isCasheaActive)
              ? (item.precio_bs || item.precio_unitario)
              : item.precio_unitario;
            
            let name = item.nombre;
            if (item.isTuberia && item.medida_tuberia === 'metros') {
              name = `${item.nombre} (${item.metros_tuberia} metros)`;
            } else if (item.isTuberia && item.medida_tuberia === 'completo') {
              name = `${item.nombre} (Tubo Completo 6m)`;
            }

            return {
              descripcion: name,
              cantidad: item.cantidad,
              precio_unitario: effectivePrice,
              total: effectivePrice * item.cantidad
            };
          }),
          metodos_pago: metodosPago,
          con_iva: conIva,
          tasa_cambio: activeRate,
          total_servicios: cart.reduce((s, i) => s + i.cantidad, 0),
          total_clientes: 1,
          notas: `${notas}${vehiculoInfo ? ` | Vehículo: ${vehiculoInfo}` : ''}${tieneAbono ? ` | Abono: $${abonoAmount.toFixed(2)} | Saldo: $${saldoRestante.toFixed(2)}` : ''}${esRegistroAtrasado ? ' | ⚠️ REGISTRO ATRASADO' : ''}`,
          creado_por: 'Admin',
          tiene_abono: tieneAbono,
          abono: abonoAmount,
          saldo_pendiente: saldoRestante,
          estado: estadoVenta,
          fecha_registro: new Date().toISOString(),
          registro_atrasado: esRegistroAtrasado
        }))
        .select()
        .single();

      if (ventaError) throw ventaError;

      // Log Activity
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'IA',
        accion: 'Registró venta POS (Silenciadores)',
        detalles: `Cliente: ${clienteNombre || 'Consumidor Final'}, Total: $${Number(total).toFixed(2)}`,
        referencia_id: ventaDia.id,
        referencia_tabla: 'ventas_dia'
      });

      for (const item of cart) {
        let qtyToDeduct = item.cantidad;
        if (item.isTuberia && item.medida_tuberia === 'metros') {
          qtyToDeduct = Math.ceil((item.cantidad * (item.metros_tuberia || 6)) / 6);
        }
        const newStock = Math.max(0, item.stock - qtyToDeduct);
        await updateInventarioStock(item.id, newStock);
      }

      const bcvTotal = cart.reduce((sum, item) => {
        const base = item.precio_bs || item.precio_unitario;
        return sum + (item.cantidad * base);
      }, 0) * (conIva ? 1.16 : 1);

      const data1: any = {
        id: ventaDia.id,
        fecha: format(selectedDate, 'dd/MM/yyyy'),
        cliente: clienteNombre || 'Consumidor Final',
        vehiculo: vehiculoInfo,
        items: cart.map(item => {
          const effectivePrice = (conIva && isCasheaActive)
            ? (item.precio_bs || item.precio_unitario)
            : item.precio_unitario;

          let name = item.nombre;
          if (item.isTuberia && item.medida_tuberia === 'metros') {
            name = `${item.nombre} (${item.metros_tuberia}m)`;
          } else if (item.isTuberia && item.medida_tuberia === 'completo') {
            name = `${item.nombre} (Completo 6m)`;
          }

          return {
            descripcion: name,
            cantidad: item.cantidad,
            precio_unitario: effectivePrice,
            total: effectivePrice * item.cantidad
          };
        }),
        total: total,
        tasa_bcv: activeRate,
        total_ves: bcvTotal * activeRate,
        iva_aplicado: conIva,
        metodos_pago: metodosPago,
        tiene_abono: tieneAbono,
        abono: abonoAmount,
        saldo_pendiente: saldoRestante,
        estado: estadoVenta
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
          tasa_bcv: secondVenta.tasa_cambio || activeRate,
          total_ves: secondVenta.total_ingresos * (secondVenta.tasa_cambio || activeRate),
          iva_aplicado: secondVenta.con_iva
        });
      }

      // Register in centralized facturas table BEFORE generating PDF so correlativo is included
      let correlativoSil: string | undefined;
      try {
        const facturaRegistro = await registrarFactura({
          tipo: 'venta',
          modulo_origen: 'silenciadores',
          referencia_id: ventaDia.id,
          referencia_tabla: 'ventas_dia',
          cliente: clienteNombre || 'Consumidor Final',
          vehiculo: vehiculoInfo || undefined,
          total: total,
          moneda: 'USD',
          tasa_cambio: activeRate,
          total_bs: total * activeRate,
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
        });
        if (facturaRegistro?.correlativo) correlativoSil = facturaRegistro.correlativo;
      } catch (facErr) {
        console.error('Error registrando factura centralizada:', facErr);
      }

      data1.correlativo = correlativoSil;
      generateInvoicePDF(dataList, { mode: printMode, side: printSide, currencyMode: resolvedCurrencyMode as any });

      setCart([]);
      setClienteNombre('');
      setVehiculoInfo('');
      setNotas('');
      setMetodosPago({ efectivo_usd: 0, zelle: 0, pago_movil: 0, efectivo_ves: 0, punto_de_venta: 0, transferencia: 0, cashea: 0, binance: 0, euros: 0, otro: 0 });
      setAbono(0);
      setShowAbonoSection(false);
      setShowPreview(false);
      fetchData();
      const abonoMsg = tieneAbono
        ? ` Abono: $${abonoAmount.toFixed(2)} | Saldo pendiente: $${saldoRestante.toFixed(2)}. La factura quedó en estado PENDIENTE POR PAGAR.`
        : '';
      alert(`¡Venta realizada con éxito!${abonoMsg} Stock actualizado y comprobante generado.`);
    } catch (err: any) {
      console.error('Error finalizing sale:', err);
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const categories = Array.from(new Set(productos.map(p => p.categoria)));

  const filteredProductos = productos
    .filter(p => {
      const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.categoria.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || p.categoria === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const priceA = a.precio_usd || 0;
      const priceB = b.precio_usd || 0;
      if (priceA > 0 && priceB === 0) return -1;
      if (priceA === 0 && priceB > 0) return 1;
      return b.stock - a.stock;
    });

  // Payment Calculation Logic
  const handlePaymentChange = (method: string, valueStr: string) => {
    const val = valueStr === '' ? 0 : parseFloat(valueStr);
    setMetodosPago(prev => ({ ...prev, [method]: isNaN(val) ? 0 : val }));
  };

  const autoFillMethod = (method: string) => {
    if (method === 'cashea') {
      setModoCashea(true);
      const casheaSubtotal = cart.reduce((sum, item) => {
        const basePrice = item.precio_bs || item.precio_unitario;
        return sum + (item.cantidad * basePrice);
      }, 0);
      const casheaTotal = casheaSubtotal * 1.16;
      const inicial = casheaTotal * (casheaPct / 100);
      const otherPayments = Object.entries(metodosPago).reduce((acc, [k, v]) => {
        if (k === 'cashea') return acc;
        return acc + v;
      }, 0);
      const targetVal = Math.max(0, inicial - otherPayments);
      setMetodosPago(prev => ({ ...prev, cashea: Number(targetVal.toFixed(2)) }));
      return;
    }

    if (balance <= 0) return;
    setMetodosPago(prev => ({ ...prev, [method]: Number(balance.toFixed(2)) }));
  };

  // ─── Acciones para Ventas Pendientes ──────────────────────────────────
  const handleMarcarPagado = async (venta: any) => {
    if (!supabase) return;
    if (!confirm(`¿Marcar como PAGADA la venta de ${venta.cliente} por $${Number(venta.total_ingresos || 0).toFixed(2)}?`)) return;
    try {
      const { error } = await withSedeFilter(supabase.from('ventas_dia'))
        .update({
          estado: 'pagado',
          saldo_pendiente: 0,
          notas: `${venta.notas || ''} | Pagado completo el ${new Date().toLocaleDateString('es-VE')}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', venta.id);
      if (error) throw error;
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Ventas',
        accion: 'Marcó venta pendiente como pagada',
        detalles: `Cliente: ${venta.cliente}, Total: $${Number(venta.total_ingresos || 0).toFixed(2)}`,
        referencia_id: venta.id,
        referencia_tabla: 'ventas_dia'
      });
      alert('✅ Venta marcada como PAGADA');
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleRegistrarAbono = async () => {
    if (!supabase || !selectedPendiente) return;
    if (abonoExtra <= 0) return alert('Ingresa un monto de abono válido');
    const nuevoAbono = (Number(selectedPendiente.abono) || 0) + abonoExtra;
    const nuevoSaldo = Math.max(0, (Number(selectedPendiente.saldo_pendiente) || 0) - abonoExtra);
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'pendiente';

    try {
      const { error } = await withSedeFilter(supabase.from('ventas_dia'))
        .update({
          abono: nuevoAbono,
          saldo_pendiente: nuevoSaldo,
          estado: nuevoEstado,
          notas: `${selectedPendiente.notas || ''} | Abono extra: $${abonoExtra.toFixed(2)} el ${new Date().toLocaleDateString('es-VE')}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPendiente.id);
      if (error) throw error;
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Ventas',
        accion: `Registró abono extra a venta pendiente`,
        detalles: `Cliente: ${selectedPendiente.cliente}, Abono: $${abonoExtra.toFixed(2)}, Saldo restante: $${nuevoSaldo.toFixed(2)}`,
        referencia_id: selectedPendiente.id,
        referencia_tabla: 'ventas_dia'
      });
      setShowAbonoDialog(false);
      setSelectedPendiente(null);
      setAbonoExtra(0);
      alert(nuevoEstado === 'pagado' ? '✅ Abono registrado. Venta liquidada completamente.' : `✅ Abono registrado. Saldo pendiente: $${nuevoSaldo.toFixed(2)}`);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleReabrirVenta = async (venta: any) => {
    if (!supabase) return;
    if (!confirm(`¿Reabrir la venta de ${venta.cliente} por $${Number(venta.total_ingresos || 0).toFixed(2)}? Se cambiará a estado PENDIENTE.`)) return;
    try {
      const saldo = Number(venta.total_ingresos || 0) - (Number(venta.abono) || 0);
      const { error } = await withSedeFilter(supabase.from('ventas_dia'))
        .update({
          estado: 'pendiente',
          saldo_pendiente: Math.max(0, saldo),
          notas: `${venta.notas || ''} | Reabierto el ${new Date().toLocaleDateString('es-VE')}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', venta.id);
      if (error) throw error;
      await logActivity({
        usuario: useAppStore.getState().user?.nombre || 'Admin',
        modulo: 'Ventas',
        accion: 'Reabrió venta como pendiente',
        detalles: `Cliente: ${venta.cliente}, Total: $${Number(venta.total_ingresos || 0).toFixed(2)}`,
        referencia_id: venta.id,
        referencia_tabla: 'ventas_dia'
      });
      alert('✅ Venta reabierta como PENDIENTE');
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleReimprimirFactura = async (venta: any) => {
    const bcvRate = venta.tasa_cambio || rates.bcv;
    const mp = venta.metodos_pago || {};
    const resolvedCurrencyMode = printCurrencyMode === 'auto'
      ? ((mp.pago_movil > 0 || mp.efectivo_ves > 0 || venta.isCashea) ? 'dual' : 'usd')
      : printCurrencyMode;

    // Look up correlativo from facturas table before generating PDF
    let correlativoReprint: string | undefined;
    try {
      if (supabase) {
        const { data: facData } = await supabase.from('facturas')
          .select('correlativo').eq('referencia_id', venta.id).limit(1).maybeSingle();
        if (facData?.correlativo) correlativoReprint = facData.correlativo;
      }
    } catch { /* non-blocking */ }

    generateInvoicePDF([{
      id: venta.id,
      correlativo: correlativoReprint,
      fecha: new Date(venta.fecha || venta.created_at).toLocaleDateString(),
      cliente: venta.cliente,
      items: (venta.desglose || [{ descripcion: 'Producto', cantidad: 1, precio_unitario: venta.total_ingresos, total: venta.total_ingresos }]).flatMap((item: any) => parseDescripcionItems(item.descripcion || '', item.total ?? item.precio_unitario ?? 0)),
      total: venta.total_ingresos,
      notas: venta.notas,
      tasa_bcv: bcvRate,
      total_ves: (venta.total_ingresos || 0) * bcvRate,
      iva_aplicado: venta.con_iva,
      metodos_pago: mp
    }], { mode: 'single', side: 'left', currencyMode: resolvedCurrencyMode as any });
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-40 animate-in fade-in duration-500">
      {/* Header Premium */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card/30 backdrop-blur-xl p-6 rounded-3xl border border-border/50 shadow-xl">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3 transition-transform">
            <ShoppingCart className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter italic text-foreground uppercase" style={{ fontFamily: 'Syne, sans-serif' }}>
              Módulo de <span className="text-primary">Ventas</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold px-2">
                <MapPin className="w-3 h-3 mr-1" /> {currentSede?.nombre || 'General'}
              </Badge>
              <Badge variant="outline" className="bg-green-500/5 text-green-500 border-green-500/20 font-bold px-2">
                <Sparkles className="w-3 h-3 mr-1" /> Tasa: {rates.bcv} Bs.
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <button className="glass-card px-5 py-2.5 rounded-2xl border-2 border-primary/30 bg-primary/5 shadow-lg hover:bg-primary/10 transition-all text-left group relative overflow-hidden animate-pulse-glow">
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
          <div className="glass-card px-4 py-2 rounded-2xl border border-border/50 bg-background/40 shadow-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">En Carrito</p>
            <p className="text-xl font-black text-primary">{cart.length}</p>
          </div>
          <div className="glass-card px-4 py-2 rounded-2xl border border-border/50 bg-background/40 shadow-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Restante</p>
            <p className={cn("text-xl font-black transition-colors", balance > 0.01 ? "text-destructive" : "text-green-500")}>
              ${(balance || 0).toFixed(2)}
            </p>
          </div>
          <div className="hidden sm:block glass-card px-4 py-2 rounded-2xl border border-border/50 bg-background/40 shadow-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total</p>
            <p className="text-xl font-black text-foreground">${(total || 0).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Botón flotante de carrito para móviles rediseñado */}
      <AnimatePresence mode="wait">
        {cart.length > 0 && (
          <motion.div 
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            className="xl:hidden fixed bottom-24 right-4 z-50 pointer-events-auto"
          >
            <button 
              onClick={() => document.getElementById('checkout-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-3 bg-primary text-white pl-4 pr-2 py-2.5 rounded-full shadow-2xl border border-white/20 active:scale-95 transition-transform group"
            >
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none">Mi Carrito</span>
                <span className="text-sm font-black italic tracking-tight">${(total || 0).toFixed(2)}</span>
              </div>
              <div className="bg-white/20 p-2 rounded-full relative">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-destructive text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {cart.length}
                </span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
                  {ventasPendientes.map((v: any) => {
                    const vFecha = v.fecha || v.created_at?.split('T')[0] || '';
                    const isAtrasado = v.registro_atrasado === true || (vFecha && vFecha !== new Date().toISOString().split('T')[0]);
                    return (
                    <div key={v.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-white/5 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black truncate">{v.cliente || 'Consumidor Final'}</p>
                          <Badge variant="outline" className="text-amber-400 border-amber-400/30 bg-amber-500/5 text-[8px] font-black px-1.5">
                            PENDIENTE
                          </Badge>
                          {isAtrasado && (
                            <Badge className="bg-orange-500 text-white border-none text-[7px] font-black h-3.5 px-1 animate-pulse">
                              ⚠️ ATRASADO
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {vFecha ? new Date(vFecha.includes('T') ? vFecha : vFecha + 'T12:00:00').toLocaleDateString('es-VE') : new Date(v.created_at).toLocaleDateString('es-VE')}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Total: ${Number(v.total_ingresos || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <p className="text-sm font-black text-amber-400">${Number(v.saldo_pendiente || 0).toFixed(2)}</p>
                        <p className="text-[9px] font-bold text-muted-foreground leading-none">SALDO</p>
                        {v.abono > 0 && (
                          <p className="text-[9px] font-bold text-green-400 leading-none">Abonó: ${Number(v.abono).toFixed(2)}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1.5">
                          <button
                            onClick={() => handleMarcarPagado(v)}
                            className="px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-black hover:bg-green-500/20 transition-all"
                            title="Marcar como Pagado"
                          >
                            PAGADO
                          </button>
                          <button
                            onClick={() => { setSelectedPendiente(v); setAbonoExtra(0); setShowAbonoDialog(true); }}
                            className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-black hover:bg-blue-500/20 transition-all"
                            title="Registrar Abono"
                          >
                            ABONAR
                          </button>
                          <button
                            onClick={() => handleReimprimirFactura(v)}
                            className="px-2 py-1 rounded-lg bg-muted/30 border border-border/30 text-muted-foreground text-[8px] font-black hover:bg-muted/50 transition-all"
                            title="Reimprimir Factura"
                          >
                            🖨️
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
              {/* Modal de Abono */}
              <Dialog open={showAbonoDialog} onOpenChange={setShowAbonoDialog}>
                <DialogContent className="max-w-md bg-card border-border/50 rounded-[2rem] p-6">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-black flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-amber-400" />
                      Registrar Abono
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Cliente: <strong>{selectedPendiente?.cliente || 'N/A'}</strong>
                      {selectedPendiente && (
                        <span className="block mt-1">
                          Saldo pendiente: <strong className="text-amber-400">${Number(selectedPendiente.saldo_pendiente || 0).toFixed(2)}</strong>
                          {Number(selectedPendiente.abono) > 0 && (
                            <> | Abonado: <strong className="text-green-400">${Number(selectedPendiente.abono).toFixed(2)}</strong></>
                          )}
                        </span>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground">Monto del Abono ($)</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        max={selectedPendiente?.saldo_pendiente || 0}
                        placeholder="0.00"
                        className="h-12 text-lg font-black"
                        value={abonoExtra || ''}
                        onChange={e => setAbonoExtra(Math.max(0, parseFloat(e.target.value) || 0))}
                      />
                    </div>
                    {selectedPendiente && abonoExtra > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-muted-foreground">Abono ahora:</span>
                          <span className="font-black text-green-400">- ${abonoExtra.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-muted-foreground">Nuevo saldo:</span>
                          <span className="font-black text-amber-400">${Math.max(0, (Number(selectedPendiente.saldo_pendiente) || 0) - abonoExtra).toFixed(2)}</span>
                        </div>
                        {abonoExtra >= (Number(selectedPendiente.saldo_pendiente) || 0) && (
                          <div className="flex items-center gap-2 pt-1 text-green-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold">¡La venta quedará liquidada!</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <DialogFooter className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setShowAbonoDialog(false); setSelectedPendiente(null); setAbonoExtra(0); }}>
                      CANCELAR
                    </Button>
                    <Button className="flex-1 rounded-xl bg-primary text-white font-black" onClick={handleRegistrarAbono} disabled={abonoExtra <= 0}>
                      REGISTRAR ABONO
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 mt-6">
        {/* LADO IZQUIERDO: PRODUCTOS */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          <Card className="flex flex-col glass-panel border-border/50 bg-card/40 overflow-hidden shadow-xl rounded-[40px]">
            <CardHeader className="pb-4 pt-8 px-8 border-b border-border/10 bg-white/5">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Busca por nombre o categoría..." 
                    className="pl-11 h-12 bg-card/40 border-border/50 rounded-2xl text-sm font-medium"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-12 bg-card/40 border-border/50 rounded-2xl text-[10px] font-black uppercase">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todas</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat} className="capitalize font-bold">{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-8 custom-scrollbar">

          {/* Grid de Productos - PRECIOS REALES DEL INVENTARIO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar p-1">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-3xl bg-card/20 animate-pulse border border-border/30" />
              ))
            ) : filteredProductos.map(prod => (
                <button
                  key={prod.id}
                  disabled={prod.stock <= 0}
                  onClick={() => addToCart(prod)}
                  className={cn(
                    "group relative p-5 rounded-3xl border border-border/50 transition-all text-left flex flex-col justify-between h-44 overflow-hidden shadow-sm",
                    prod.stock <= 0 
                      ? "bg-muted/50 opacity-40 cursor-not-allowed" 
                      : "bg-card/40 hover:bg-white hover:border-primary/40 hover:shadow-2xl active:scale-95"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center transition-all",
                      prod.stock <= 0 ? "bg-muted" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white"
                    )}>
                      <Package className="w-6 h-6" />
                    </div>
                    <Badge variant={prod.stock <= 5 ? "destructive" : "secondary"} className="text-[10px] font-black border-none h-5">
                      {prod.stock} DISP
                    </Badge>
                  </div>

                  <div className="mt-3">
                    <p className="text-[10px] font-black text-muted-foreground uppercase truncate opacity-60">{prod.categoria}</p>
                    <p className="text-sm font-black text-foreground mt-1 truncate group-hover:text-primary transition-colors">{prod.nombre}</p>
                    
                    <div className="flex items-center gap-3 mt-2">
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black text-primary uppercase tracking-tight">Dólar Divisa ($)</span>
                           <span className="text-base font-black text-primary italic tracking-tighter">${prod.precio_usd || '0'}</span>
                        </div>
                        <div className="w-[1px] h-6 bg-border/40" />
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tight">Dólar BCV</span>
                           <span className="text-base font-black text-foreground/70 italic tracking-tighter">
                             ${((prod.precio_bs || prod.precio_usd) || 0).toFixed(2)}
                           </span>
                           <span className="text-[8px] font-bold text-muted-foreground/50 leading-none">
                             {((prod.precio_bs || prod.precio_usd) * rates.bcv).toLocaleString('es-VE', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                             })} Bs.
                           </span>
                        </div>
                    </div>
                  </div>
                </button>
            ))}
          </div>
        </CardContent>
          </Card>
          
          {/* Historial Dinámico Interactivo por Sede */}
          <Card className="glass-panel border-border/50 bg-card/20 rounded-3xl overflow-hidden shadow-sm border-t-4 border-t-primary/20">
            <CardHeader className="p-5 bg-primary/5 flex flex-row items-center justify-between border-b border-border/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <History className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-[0.2em]">Ventas Recientes</CardTitle>
                  <p className="text-[10px] font-bold text-primary uppercase flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" /> {currentSede?.nombre || 'General'}
                  </p>
                </div>
              </div>
              <button 
                onClick={fetchData}
                className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all border border-border/30 shadow-sm"
              >
                <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loading && "animate-spin text-primary")} />
              </button>
            </CardHeader>
            <div className="divide-y divide-border/5 max-h-[450px] overflow-y-auto custom-scrollbar">
              {ventasRecientes.length > 0 ? ventasRecientes.map((v, i) => (
                <button 
                  key={i} 
                  onClick={() => { setSelectedSale(v); setShowSaleDetail(true); }}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-primary/[0.02] transition-all group text-left border-l-4 border-transparent hover:border-primary"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-muted/30 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 group-hover:rotate-3 transition-all border border-border/10">
                       <Receipt className="w-6 h-6" />
                    </div>
                      <div className="flex flex-col">
                      <span className="text-sm font-black text-foreground uppercase group-hover:text-primary transition-colors tracking-tight">{v.cliente || 'Consumidor Final'}</span>
                      <div className="flex items-center gap-2 mt-0.5 opacity-60">
                        <span className="text-[10px] font-bold flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {v.displayDate ? new Date(v.displayDate.includes('T') ? v.displayDate : v.displayDate + 'T12:00:00').toLocaleDateString('es-VE') : new Date(v.created_at).toLocaleDateString('es-VE')}
                        </span>
                        {v.isAtrasado && (
                          <Badge className="bg-orange-500 text-white border-none text-[7px] font-black h-3.5 px-1 animate-pulse">
                            ⚠️ ATRASADO
                          </Badge>
                        )}
                        <span className="text-[10px] font-bold">•</span>
                        <span className="text-[10px] font-bold uppercase">{v.desglose?.length || 0} ITEMS</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                      <span className="text-base font-black text-primary italic tracking-tighter drop-shadow-sm">
                        ${v.total_ingresos?.toFixed(2)}
                        {v.context && <span className="text-[9px] ml-1 opacity-50 not-italic font-bold">({v.context})</span>}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground leading-none">
                        {((v.total_ingresos || 0) * (v.tasa_cambio || rates.bcv)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className={cn(
                          "text-[8px] font-black h-4 px-1.5 border-primary/20 uppercase transition-colors",
                          v.source === 'ia' ? "bg-violet-500/10 text-violet-500 border-violet-500/30" : "bg-primary/5 text-primary/70 group-hover:bg-primary group-hover:text-white"
                        )}>
                          {v.source === 'ia' ? '🤖 IA ASSISTANT' : 'Ver Factura'}
                        </Badge>
                        {v.isCashea && (
                          <Badge className="bg-[#3366FF] text-white border-none text-[8px] font-black h-4 px-1.5 animate-pulse">
                            CASHEA
                          </Badge>
                        )}
                        {v.isBinance && (
                          <Badge className="bg-yellow-500 text-black border-none text-[8px] font-black h-4 px-1.5">
                            BINANCE
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              )) : (
                <div className="py-24 text-center opacity-30 flex flex-col items-center gap-4">
                   <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                     <History className="w-8 h-8" />
                   </div>
                   <div className="space-y-1">
                     <p className="text-xs font-black uppercase tracking-[0.2em]">Sin actividad hoy</p>
                     <p className="text-[10px] font-bold">No hay ventas registradas en {currentSede?.nombre}</p>
                   </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* LADO DERECHO: CARRITO / INVOICE */}
        <div id="checkout-section" className="xl:col-span-5">
          <div className="sticky top-24 space-y-6">
            <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl rounded-[2.5rem] relative overflow-hidden flex flex-col">
              <CardHeader className="border-b border-border/30 bg-primary/5 p-7">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-black tracking-tighter flex items-center gap-3">
                    REGISTRO DE VENTA
                    <Badge className="bg-primary text-white border-none text-[10px] h-5 px-2">{cart.length}</Badge>
                  </CardTitle>
                  <button onClick={() => setCart([])} className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive hover:text-white transition-all">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Datos del Cliente */}
                <div className="px-7 py-4 space-y-4 border-b border-border/10 bg-primary/5">
                   <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest mb-2">
                     <User className="w-4 h-4" /> Datos del Cliente
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Nombre / Razón Social</Label>
                        <Input 
                          placeholder="Nombre del cliente"
                          className="h-9 bg-background/50 text-xs font-black border-border/50 rounded-xl"
                          value={clienteNombre}
                          onChange={e => setClienteNombre(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Vehículo (Placa/Modelo)</Label>
                        <Input 
                          placeholder="Ej: ABC-123 / Corolla"
                          className="h-9 bg-background/50 text-xs font-black border-border/50 rounded-xl"
                          value={vehiculoInfo}
                          onChange={e => setVehiculoInfo(e.target.value)}
                        />
                      </div>
                   </div>
                </div>

                {/* Selector de Fecha y Toggle IVA */}
                <div className="px-7 py-4 flex items-center justify-between border-b border-border/10">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" className="h-10 p-0 hover:bg-transparent flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">Fecha</p>
                              <p className="text-xs font-black text-foreground mt-1">{format(selectedDate, "dd/MM/yyyy")}</p>
                            </div>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl border-border/50 shadow-2xl">
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
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all border cursor-pointer",
                        conIva ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-muted/30 text-muted-foreground border-border/50"
                      )} onClick={() => setConIva(!conIva)}>
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div className="text-left cursor-pointer" onClick={() => setConIva(!conIva)}>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">Impuestos</p>
                        <p className={cn("text-xs font-black mt-1", conIva ? "text-primary" : "text-foreground")}>{conIva ? '+16% IVA' : 'Sin IVA'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        const newModo = !modoCashea;
                        setModoCashea(newModo);
                        if (newModo) {
                          setConIva(true);
                        }
                      }}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                        modoCashea ? "bg-[#3366FF] text-white border-[#3366FF] shadow-lg shadow-blue-500/20" : "bg-blue-500/5 text-blue-500 border-blue-500/20 hover:bg-blue-500/10"
                      )}
                    >
                      {modoCashea ? 'Modo Cashea Activo' : 'Activar Cashea'}
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-10">
                    <ShoppingCart className="w-20 h-20 mb-4" />
                    <p className="text-sm font-black uppercase tracking-[0.3em]">Carrito Vacío</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {cart.map(item => (
                      <div key={item.id} className="p-4 flex flex-col gap-2 group border-l-4 border-transparent hover:border-primary transition-all">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black uppercase truncate">{item.nombre}</p>
                            <p className="text-[9px] font-black text-muted-foreground italic mt-0.5">
                              Divisa: ${item.precio_unitario} | BCV: ${item.precio_bs || item.precio_unitario}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center bg-background/60 rounded-xl border border-border/50 p-1">
                              <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-primary font-black">-</button>
                              <span className="w-8 text-center text-xs font-black">{item.cantidad}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-primary font-black">+</button>
                            </div>
                            
                            {/* Precio Divisa Editable */}
                            <div className="flex flex-col items-end gap-0.5">
                               <input
                                 type="number" step="0.01" min="0"
                                 title="Precio Divisa USD"
                                 className="w-16 text-right text-xs font-black italic tracking-tighter bg-transparent border-b border-dashed border-primary/40 focus:border-primary focus:outline-none text-primary pb-0.5"
                                 value={item.precio_unitario}
                                 onChange={e => updateCartItemPrice(item.id, parseFloat(e.target.value) || 0)}
                               />
                               <span className="text-[7px] text-primary/75 font-black uppercase opacity-60">USD C/U</span>
                            </div>

                            {/* Precio BCV Editable */}
                            <div className="flex flex-col items-end gap-0.5">
                               <input
                                 type="number" step="0.01" min="0"
                                 title="Precio Dólar BCV (en USD)"
                                 className="w-16 text-right text-xs font-black italic tracking-tighter bg-transparent border-b border-dashed border-blue-500/40 focus:border-blue-500 focus:outline-none text-blue-600 pb-0.5"
                                 value={item.precio_bs || item.precio_unitario}
                                 onChange={e => updateCartItemPrecioBs(item.id, parseFloat(e.target.value) || 0)}
                               />
                               <span className="text-[7px] text-blue-600/75 font-black uppercase opacity-60">USD BCV</span>
                            </div>

                            <button onClick={() => removeFromCart(item.id)} className="text-destructive/40 hover:text-destructive transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Controles de tubería específicos */}
                        {item.isTuberia && (
                          <div className="ml-1 mt-1.5 p-3.5 rounded-2xl bg-primary/5 border border-primary/10 space-y-3.5 text-xs">
                            <div className="flex flex-col gap-1.5">
                              <span className="font-black text-muted-foreground uppercase text-[10px] tracking-wider">Modo de venta:</span>
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none">
                                  <input 
                                    type="radio" 
                                    name={`medida-${item.id}`} 
                                    checked={item.medida_tuberia === 'completo'} 
                                    onChange={() => handleTuberiaChange(item.id, 'completo', 6)}
                                    className="accent-primary w-4 h-4"
                                  />
                                  Tubo Completo (6m)
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none">
                                  <input 
                                    type="radio" 
                                    name={`medida-${item.id}`} 
                                    checked={item.medida_tuberia === 'metros'} 
                                    onChange={() => handleTuberiaChange(item.id, 'metros', 1)}
                                    className="accent-primary w-4 h-4"
                                  />
                                  Por Metros
                                </label>
                              </div>
                            </div>

                            {item.medida_tuberia === 'metros' && (
                              <div className="flex items-center gap-2.5 select-none">
                                <span className="font-extrabold text-muted-foreground text-xs">Metros a vender:</span>
                                <div className="flex items-center bg-background/60 rounded-xl border border-border p-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current = item.metros_tuberia || 1;
                                      const next = Math.max(0.1, Number((current - 0.5).toFixed(1)));
                                      handleTuberiaChange(item.id, 'metros', next);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 active:bg-primary/10 rounded-lg transition-all font-black text-base"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={item.metros_tuberia || 1}
                                    onChange={(e) => handleTuberiaChange(item.id, 'metros', parseFloat(e.target.value) || 0)}
                                    className="w-14 h-8 bg-transparent border-none text-center font-black text-sm focus:outline-none focus:ring-0"
                                    placeholder="m"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current = item.metros_tuberia || 1;
                                      const next = Number((current + 0.5).toFixed(1));
                                      handleTuberiaChange(item.id, 'metros', next);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 active:bg-primary/10 rounded-lg transition-all font-black text-base"
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-muted-foreground font-black text-xs">metros</span>
                              </div>
                            )}

                            <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 text-[11px] font-medium text-muted-foreground leading-normal space-y-1">
                              {item.medida_tuberia === 'completo' ? (
                                <p>✓ <strong>Venta completa</strong>. Se descontará <strong>{item.cantidad} tubo(s)</strong> de 6 metros del stock de inventario.</p>
                              ) : (
                                <>
                                  <p>✓ Fraccionado a <strong>{item.metros_tuberia}m</strong> por pieza (Total: <strong>{((item.metros_tuberia || 1) * item.cantidad).toFixed(1)}m</strong>).</p>
                                  <p>✓ Redondeo de stock: Se descontará <strong>{Math.ceil(((item.metros_tuberia || 1) * item.cantidad) / 6)} tubo(s)</strong> del stock de inventario.</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>

              {/* PAGOS: MEJORADO CON DOBLE INPUT BS/USD */}
              <div className="px-8 py-6 space-y-6 border-t border-border/30 bg-background/50 backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                   <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                     <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                       <Calculator className="w-4 h-4" /> MÉTODOS DE PAGO
                     </h3>
                     <div className="flex items-center gap-2 bg-primary/5 p-1.5 rounded-xl border border-primary/10">
                       <Label className="text-[9px] font-bold uppercase text-primary/70">Tasa Manual (Bs):</Label>
                       <input
                         type="number" step="0.01" min="0"
                         title="Tasa BCV del día. Escribe para usar una tasa personalizada para esta venta."
                         placeholder={`Auto: ${rates.bcv}`}
                         className="h-6 w-24 bg-background text-xs font-black border border-primary/20 rounded-lg text-center focus:ring-1 focus:ring-primary focus:outline-none"
                         value={customRate !== null ? customRate : ''}
                         onChange={e => setCustomRate(e.target.value ? parseFloat(e.target.value) : null)}
                       />
                     </div>
                   </div>
                   <div className="text-right">
                      <p className="text-[9px] font-black text-muted-foreground uppercase">Por Cobrar</p>
                      <p className={cn("text-lg font-black italic", balance > 0.05 ? "text-destructive" : "text-green-500")}>
                        ${(balance || 0).toFixed(2)}
                      </p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   {/* ── Cashea Panel ── */}
                    <div className={`space-y-3 p-4 rounded-2xl border col-span-full transition-all ${isCasheaActive ? 'bg-blue-600/10 dark:bg-blue-950/30 border-blue-600/40 dark:border-blue-500/30 shadow-lg shadow-blue-600/10' : 'bg-blue-600/5 dark:bg-blue-950/10 border-blue-600/10 dark:border-blue-950/20'}`}>
                       <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-2">
                            <Smartphone className="w-4 h-4" /> Cashea
                          </Label>
                          <button
                            onClick={() => { setConIva(true); setModoCashea(true); autoFillMethod('cashea'); }}
                            className="text-[8px] font-black text-blue-600 dark:text-blue-400 bg-white/50 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-blue-600/20 dark:border-blue-500/30"
                          >USAR CASHEA (+16% IVA)</button>
                       </div>

                       {/* Porcentaje de inicial: 40%, 50%, 60% */}
                       <div className="flex items-center gap-2">
                         <span className="text-[9px] font-black text-blue-600/70 dark:text-blue-400/70 uppercase tracking-widest">Inicial:</span>
                         {([40, 50, 60] as const).map(pct => (
                           <button
                             key={pct}
                             onClick={() => { setCasheaPct(pct); setConIva(true); setModoCashea(true); if (metodosPago.cashea === 0) autoFillMethod('cashea'); }}
                             className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all border ${casheaPct === pct && isCasheaActive ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white/40 dark:bg-slate-900/40 text-blue-600 dark:text-blue-400 border-blue-600/20 dark:border-blue-500/20 hover:bg-blue-600/10 dark:hover:bg-blue-400/10'}`}
                           >{pct}%</button>
                         ))}
                       </div>

                        {isCasheaActive && (
                          <div className="flex items-center justify-between bg-white/50 dark:bg-slate-900/50 p-1 rounded-xl border border-blue-600/10 dark:border-blue-500/20 mb-1.5">
                            <span className="text-[9px] font-black text-blue-600/70 dark:text-blue-400/70 uppercase pl-1.5">Visualizar en:</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setCasheaCurrency('usd')}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${casheaCurrency === 'usd' ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-600/5 dark:hover:bg-blue-400/5'}`}
                              >
                                DÓLARES ($)
                              </button>
                              <button
                                type="button"
                                onClick={() => setCasheaCurrency('ves')}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${casheaCurrency === 'ves' ? 'bg-blue-600 text-white shadow-sm' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-600/5 dark:hover:bg-blue-400/5'}`}
                              >
                                BOLÍVARES (Bs.)
                              </button>
                            </div>
                          </div>
                        )}

                        {isCasheaActive && total > 0 && (() => {
                          const formatVal = (val: number) => {
                            if (casheaCurrency === 'ves') {
                              return `${((val || 0) * rates.bcv).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;
                            }
                            return `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          };

                          return (
                            <div className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-white/60 dark:bg-slate-900/80 border border-blue-600/10 dark:border-blue-500/25">
                              <div className="col-span-4 flex justify-between text-[9px] font-black text-blue-700 dark:text-blue-300 border-b border-blue-600/10 dark:border-blue-500/20 pb-1.5 mb-1">
                                <span>BASE BCV (sin IVA)</span><span>{formatVal(subtotal)}</span>
                              </div>
                              <div className="col-span-4 flex justify-between text-[9px] font-black text-orange-500 dark:text-orange-400">
                                <span>IVA 16%</span><span>+{formatVal(total - subtotal)}</span>
                              </div>
                              <div className="col-span-4 flex justify-between text-[10px] font-black text-blue-800 dark:text-blue-200 border-t border-blue-600/10 dark:border-blue-500/20 pt-1.5 mt-0.5">
                                <span>TOTAL CASHEA</span><span>{formatVal(total)}</span>
                              </div>
                              <div className="col-span-4 grid grid-cols-4 gap-1.5 mt-1">
                                <div className="col-span-2 bg-blue-600 text-white p-2 rounded-xl text-center flex flex-col justify-center items-center">
                                  <p className="text-[8px] font-bold opacity-80 uppercase leading-none mb-1">INICIAL ({casheaPct}%)</p>
                                  <p className="text-xs font-black leading-none">{formatVal(casheaInicial)}</p>
                                </div>
                                <div className="col-span-2 bg-blue-600/10 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 p-2 rounded-xl border border-blue-600/5 dark:border-blue-500/10">
                                  <p className="text-[8px] font-bold uppercase leading-none mb-1">RESTO (3 cuotas)</p>
                                  <p className="text-[10px] font-black leading-none mb-0.5">{formatVal(casheaResto)}</p>
                                  <p className="text-[8px] opacity-75 dark:opacity-85 leading-none">{formatVal(casheaCuota)}/cuota</p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                       <Input
                         placeholder="Monto $ total Cashea"
                         className="h-10 bg-white/60 dark:bg-slate-950/60 text-sm font-black border-blue-600/20 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 placeholder:text-blue-700/50 dark:placeholder:text-blue-300/40"
                         value={metodosPago.cashea || ''}
                         onChange={e => handlePaymentChange('cashea', e.target.value)}
                       />
                    </div>

                   {/* Binance / USDT */}
                   <div className="space-y-1.5 p-3 rounded-2xl bg-yellow-500/5 border border-yellow-500/10">
                      <div className="flex items-center justify-between">
                         <Label className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1">
                           <Coins className="w-3 h-3" /> Binance (USDT)
                         </Label>
                         <button onClick={() => autoFillMethod('binance')} className="text-[8px] font-black text-yellow-600">AUTO</button>
                      </div>
                      <Input 
                        placeholder="Monto $"
                        className="h-9 bg-background/50 text-xs font-black border-none"
                        value={metodosPago.binance || ''}
                        onChange={e => handlePaymentChange('binance', e.target.value)}
                      />
                   </div>

                   {/* Divisas Cash */}
                   <div className="space-y-1.5 p-3 rounded-2xl bg-primary/5 border border-primary/10">
                      <div className="flex items-center justify-between">
                         <Label className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1">Divisas ($)</Label>
                         <button onClick={() => autoFillMethod('efectivo_usd')} className="text-[8px] font-black text-primary">AUTO</button>
                      </div>
                      <Input 
                        placeholder="Monto $"
                        className="h-9 bg-background/50 text-xs font-black border-none"
                        value={metodosPago.efectivo_usd || ''}
                        onChange={e => handlePaymentChange('efectivo_usd', e.target.value)}
                      />
                   </div>

                   {/* Euros Cash */}
                   <div className="space-y-1.5 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                      <div className="flex items-center justify-between">
                         <Label className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1">Euros (€)</Label>
                         <button onClick={() => autoFillMethod('euros')} className="text-[8px] font-black text-amber-500">AUTO</button>
                      </div>
                      <Input 
                        placeholder="Monto €"
                        className="h-9 bg-background/50 text-xs font-black border-none"
                        value={metodosPago.euros || ''}
                        onChange={e => handlePaymentChange('euros', e.target.value)}
                      />
                   </div>

                   {/* Zelle */}
                   <div className="space-y-1.5 p-3 rounded-2xl bg-purple-500/5 border border-purple-500/10">
                      <div className="flex items-center justify-between">
                         <Label className="text-[9px] font-black uppercase text-muted-foreground">Zelle</Label>
                         <button onClick={() => autoFillMethod('zelle')} className="text-[8px] font-black text-purple-500">AUTO</button>
                      </div>
                      <Input 
                        placeholder="Monto $"
                        className="h-9 bg-background/50 text-xs font-black border-none"
                        value={metodosPago.zelle || ''}
                        onChange={e => handlePaymentChange('zelle', e.target.value)}
                      />
                   </div>

                   {/* Pago Móvil - DUAL INPUT */}
                   <div className="col-span-full space-y-2 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                      <div className="flex items-center justify-between">
                         <Label className="text-[10px] font-black uppercase text-blue-600">Pago Móvil</Label>
                         <button onClick={() => autoFillMethod('pago_movil')} className="text-[9px] font-black text-blue-600 hover:bg-blue-600/10 px-2 py-0.5 rounded-lg border border-blue-600/20">SALDAR RESTANTE</button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-muted-foreground">En Bolívares (Bs.)</span>
                          <Input 
                            placeholder="Bs."
                            className="h-9 bg-background/50 text-xs font-black border-none"
                            value={metodosPago.pago_movil ? ((metodosPago.pago_movil * rates.bcv) || 0).toFixed(2) : ''}
                            onChange={e => handlePaymentChange('pago_movil', (parseFloat(e.target.value) / rates.bcv).toString())}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-muted-foreground">Equivalente en Dólares ($)</span>
                          <Input 
                            placeholder="$"
                            className="h-9 bg-background/50 text-xs font-black border-none"
                            value={metodosPago.pago_movil || ''}
                            onChange={e => handlePaymentChange('pago_movil', e.target.value)}
                          />
                        </div>
                      </div>
                   </div>

                   {/* Bolívares Efectivo - DUAL INPUT */}
                   <div className="col-span-full space-y-2 p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10">
                      <div className="flex items-center justify-between">
                         <Label className="text-[10px] font-black uppercase text-orange-600">Bolívares en Efectivo</Label>
                         <button onClick={() => autoFillMethod('efectivo_ves')} className="text-[9px] font-black text-orange-600 hover:bg-orange-600/10 px-2 py-0.5 rounded-lg border border-orange-600/20">SALDAR RESTANTE</button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-muted-foreground">En Bolívares (Bs.)</span>
                          <Input 
                            placeholder="Bs."
                            className="h-9 bg-background/50 text-xs font-black border-none"
                            value={bsInputs['efectivo_ves'] ?? (metodosPago.efectivo_ves ? ((metodosPago.efectivo_ves * rates.bcv) || 0).toFixed(2) : '')}
                            onChange={e => {
                              const val = e.target.value;
                              setBsInputs(prev => ({ ...prev, ['efectivo_ves']: val }));
                              const num = parseFloat(val);
                              if (!isNaN(num)) {
                                handlePaymentChange('efectivo_ves', (num / rates.bcv).toString());
                              } else if (val === '') {
                                handlePaymentChange('efectivo_ves', '0');
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-muted-foreground">Equivalente en Dólares ($)</span>
                          <Input 
                            placeholder="$"
                            className="h-9 bg-background/50 text-xs font-black border-none"
                            value={metodosPago.efectivo_ves || ''}
                            onChange={e => {
                              const val = e.target.value;
                              handlePaymentChange('efectivo_ves', val);
                              const num = parseFloat(val);
                              if (!isNaN(num)) {
                                setBsInputs(prev => ({ ...prev, ['efectivo_ves']: ((num * rates.bcv) || 0).toFixed(2) }));
                              } else {
                                setBsInputs(prev => ({ ...prev, ['efectivo_ves']: '' }));
                              }
                            }}
                          />
                        </div>
                      </div>
                   </div>
                </div>
               </div>

              {/* ── Abono Accordion ─────────────────────────── */}
              <div className="mx-8 bg-background/40 rounded-2xl border border-border/40 overflow-hidden">
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
              <div className="mx-8 bg-background/40 rounded-2xl border border-border/40 overflow-hidden">
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

              {/* Totales y Finalización */}
              <div className="p-8 space-y-6 bg-gradient-to-t from-primary/10 to-transparent border-t border-border/30">
                <div className="flex items-end justify-between">
                  <div className="pl-4 border-l-4 border-primary">
                    <p className="text-[11px] text-primary font-black uppercase tracking-[0.3em] mb-2">TOTAL A PAGAR USD</p>
                    <span className="text-5xl font-black text-primary tracking-tighter italic">${(total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col items-end pt-2 border-t border-border/10">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.15em] opacity-60">Total en Bolívares</p>
                    <p className="text-2xl font-black text-foreground tracking-tighter italic">{(total * rates.bcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
                  </div>
                </div>

                {isCasheaActive && (
                  <div className="mt-4 p-4 rounded-2xl bg-blue-50 border border-blue-100 space-y-3 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-600 text-white font-black text-[9px] px-1.5 h-4">INICIAL {casheaPct}%</Badge>
                        <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">A Pagar Hoy</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-blue-700 leading-none">${Number(casheaInicial).toFixed(2)}</p>
                        <p className="text-[11px] font-bold text-blue-600/70">{(casheaInicial * rates.bcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-blue-200/50 flex justify-between items-center opacity-60">
                      <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">3 Cuotas de</span>
                      <p className="text-sm font-black text-blue-700">${Number(casheaCuota).toFixed(2)}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5 pt-4">
                   <Button 
                    variant="outline" 
                    className="h-16 rounded-3xl border-primary/30 text-primary font-black uppercase text-[11px]"
                    onClick={() => { if (cart.length > 0) setShowPreview(true); }}
                  >
                    REVISAR NOTA
                  </Button>
                  <Button 
                    disabled={processing || cart.length === 0 || balance > 0.05}
                    className="h-16 rounded-3xl bg-primary text-white font-black uppercase tracking-[0.2em] text-[12px] shadow-2xl relative overflow-hidden group"
                    onClick={handleFinalize}
                  >
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                    {processing ? <><Loader2 className="w-6 h-6 animate-spin" /> PROCESANDO</> : <><CheckCircle className="w-6 h-6" /> REGISTRAR VENTA</>}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
      )}

      {/* MODAL DE VISTA PREVIA */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-[95vw] md:max-w-2xl bg-card border-border/50 rounded-[2rem] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          <div className="bg-primary/5 p-4 md:p-8 border-b border-border/30 flex-shrink-0">
             <DialogTitle className="text-xl md:text-2xl font-black tracking-tighter flex items-center gap-3 uppercase italic">
               <FileText className="w-6 h-6 md:w-8 md:h-8 text-primary" /> RESUMEN DE FACTURACIÓN
             </DialogTitle>
          </div>
          <div className="p-4 md:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CLIENTE / VEHÍCULO</p>
                <p className="text-sm font-black text-foreground uppercase truncate">{clienteNombre || 'Consumidor Final'}</p>
                <p className="text-xs font-bold text-muted-foreground uppercase truncate">{vehiculoInfo || 'S/D'}</p>
              </div>
              <div className="md:text-right space-y-1">
                <Badge className="bg-primary/20 text-primary border-none font-black text-[9px] mb-2">{currentSede?.nombre}</Badge>
                <p className="text-sm font-black text-foreground uppercase">{format(selectedDate, 'dd/MM/yyyy')}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs min-w-[400px]">
                   <thead className="bg-muted/50 border-b border-border/30 font-black uppercase text-muted-foreground">
                     <tr><th className="px-4 py-3">ITEM</th><th className="px-4 py-3 text-center">CANT</th><th className="px-4 py-3 text-right">TOTAL USD</th></tr>
                   </thead>
                   <tbody className="divide-y divide-border/20">
                     {cart.map((item, idx) => {
                        const effectivePrice = (conIva && isCasheaActive)
                          ? (item.precio_bs || item.precio_unitario)
                          : item.precio_unitario;
                        const itemTotal = effectivePrice * item.cantidad;
                        return (
                          <tr key={idx} className="font-bold">
                            <td className="px-4 py-3 uppercase truncate max-w-[150px]">{item.nombre}</td>
                            <td className="px-4 py-3 text-center font-black">{item.cantidad}</td>
                            <td className="px-4 py-3 text-right font-black">${Number(itemTotal).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                   </tbody>
                 </table>
               </div>
            </div>

            <div className="flex justify-between items-center py-4 border-t border-border/30">
               <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">TOTAL A COBRAR:</span>
               <span className="text-2xl md:text-3xl font-black text-primary italic tracking-tighter">${Number(total).toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter className="p-4 md:p-8 bg-muted/20 flex flex-col gap-4 flex-shrink-0">
             <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4">
                <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200 w-full md:w-auto justify-center">
                      <button 
                        onClick={() => setPrintMode('single')}
                        className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex-1 md:flex-none", printMode === 'single' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                      >
                        Única
                      </button>
                      <button 
                        onClick={() => setPrintMode('dual')}
                        className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex-1 md:flex-none", printMode === 'dual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Dos copias de la misma factura"
                      >
                        Dual
                      </button>
                      <button 
                        onClick={() => {
                          setPrintMode('diferente');
                          if (!secondVenta) setShowSelector(true);
                        }}
                        className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex-1 md:flex-none", printMode === 'diferente' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Dos facturas diferentes"
                      >
                        Dif.
                      </button>
                    </div>

                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200 w-full md:w-auto justify-center">
                      <button 
                        onClick={() => setPrintCurrencyMode('auto')}
                        className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex-1 md:flex-none", printCurrencyMode === 'auto' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Auto detecta si pagó en Bs para imprimir en Dual, sino Solo USD"
                      >
                        Auto
                      </button>
                      <button 
                        onClick={() => setPrintCurrencyMode('usd')}
                        className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex-1 md:flex-none", printCurrencyMode === 'usd' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Imprimir solo columnas en USD"
                      >
                        Solo USD
                      </button>
                      <button 
                        onClick={() => setPrintCurrencyMode('dual')}
                        className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex-1 md:flex-none", printCurrencyMode === 'dual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Imprimir columnas en Bs y USD"
                      >
                        Bs + USD
                      </button>
                    </div>

                  {printMode === 'single' && (
                    <div className="flex items-center bg-background rounded-lg p-0.5 border border-border w-full md:w-auto justify-center">
                      <button 
                        onClick={() => setPrintSide('left')}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printSide === 'left' ? "bg-primary text-white" : "text-slate-500")}
                      >
                        Izq
                      </button>
                      <button 
                        onClick={() => setPrintSide('right')}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printSide === 'right' ? "bg-primary text-white" : "text-slate-500")}
                      >
                        Der
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <Button variant="outline" className="h-10 rounded-xl font-bold flex-1 md:px-6" onClick={() => setShowPreview(false)}>VOLVER</Button>
                  <Button className="h-10 rounded-xl bg-primary text-white font-black uppercase tracking-widest gap-2 flex-[2] md:px-6" onClick={handleFinalize}>
                    <Printer className="w-4 h-4" /> CONFIRMAR
                  </Button>
                </div>
             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE DETALLE DE VENTA RECIENTE */}
      <Dialog open={showSaleDetail} onOpenChange={setShowSaleDetail}>
        <DialogContent className="max-w-2xl bg-card border-border/50 rounded-[2rem] p-0 overflow-hidden shadow-2xl">
          {selectedSale && (
            <>
              <div className="bg-primary/5 p-8 border-b border-border/30">
                 <DialogTitle className="text-2xl font-black tracking-tighter flex items-center gap-3 uppercase italic">
                   {selectedSale.source === 'ia' ? <Bot className="w-8 h-8 text-violet-500" /> : <Receipt className="w-8 h-8 text-primary" />}
                   {selectedSale.source === 'ia' ? 'REGISTRO DE IA' : `FACTURA #${selectedSale.id?.slice(0, 8)}`}
                 </DialogTitle>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase">CLIENTE</p>
                    <p className="text-sm font-black uppercase">{selectedSale.cliente}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedSale.isAtrasado && (
                        <Badge className="bg-orange-500 text-white border-none text-[8px] font-black px-1.5 animate-pulse">
                          ⚠️ REGISTRO ATRASADO
                        </Badge>
                      )}
                      {selectedSale.fecha && (
                        <p className="text-[9px] font-bold text-muted-foreground">
                          Venta del: {new Date(selectedSale.fecha.includes('T') ? selectedSale.fecha : selectedSale.fecha + 'T12:00:00').toLocaleDateString('es-VE')}
                        </p>
                      )}
                      {selectedSale.fecha_registro && (
                        <p className="text-[9px] font-bold text-muted-foreground">
                          Registrado el: {new Date(selectedSale.fecha_registro).toLocaleString('es-VE')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase">MONTO TOTAL</p>
                    <p className="text-2xl font-black text-primary italic">{symbol}{selectedSale.total_ingresos?.toFixed(2)}</p>
                    <p className="text-xs font-bold text-muted-foreground">
                      {((selectedSale.total_ingresos || 0) * (selectedSale.tasa_cambio || rates.bcv)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 overflow-hidden">
                   <table className="w-full text-left text-xs">
                     <thead className="bg-muted/50 border-b border-border/30 font-black">
                       <tr><th className="px-4 py-3 uppercase">ARTÍCULO</th><th className="px-4 py-3 text-center uppercase">CANT</th><th className="px-4 py-3 text-right uppercase">TOTAL</th></tr>
                     </thead>
                     <tbody className="divide-y divide-border/20">
                       {selectedSale.desglose?.map((item: any, idx: number) => (
                         <tr key={idx}><td className="px-4 py-3 uppercase font-bold">{item.descripcion}</td><td className="px-4 py-3 text-center font-black">{item.cantidad}</td><td className="px-4 py-3 text-right font-black">{symbol}{item.total?.toFixed(2)}</td></tr>
                       ))}
                     </tbody>
                   </table>
                </div>
              </div>
              <DialogFooter className="p-8 bg-muted/20 flex flex-col gap-4">
                 <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4">
                   <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                     <div className="flex items-center bg-background rounded-lg p-0.5 border border-border w-full md:w-auto justify-center">
                       <button 
                         onClick={() => setPrintMode('single')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printMode === 'single' ? "bg-primary text-white" : "text-slate-500")}
                       >
                         Única
                       </button>
                       <button 
                         onClick={() => setPrintMode('dual')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printMode === 'dual' ? "bg-primary text-white" : "text-slate-500")}
                       >
                         Dual
                       </button>
                     </div>

                     <div className="flex items-center bg-background rounded-lg p-0.5 border border-border w-full md:w-auto justify-center">
                       <button 
                         onClick={() => setPrintCurrencyMode('auto')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printCurrencyMode === 'auto' ? "bg-primary text-white" : "text-slate-500")}
                         title="Auto detecta si pagó en Bs para imprimir en Dual, sino Solo USD"
                       >
                         Auto
                       </button>
                       <button 
                         onClick={() => setPrintCurrencyMode('usd')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printCurrencyMode === 'usd' ? "bg-primary text-white" : "text-slate-500")}
                         title="Imprimir solo columnas en USD"
                       >
                         Solo USD
                       </button>
                       <button 
                         onClick={() => setPrintCurrencyMode('dual')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printCurrencyMode === 'dual' ? "bg-primary text-white" : "text-slate-500")}
                         title="Imprimir columnas en Bs y USD"
                       >
                         Bs + USD
                       </button>
                     </div>

                     {printMode === 'single' && (
                       <div className="flex items-center bg-background rounded-lg p-0.5 border border-border w-full md:w-auto justify-center">
                         <button 
                           onClick={() => setPrintSide('left')}
                           className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printSide === 'left' ? "bg-primary text-white" : "text-slate-500")}
                         >
                           Izq
                         </button>
                         <button 
                           onClick={() => setPrintSide('right')}
                           className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all flex-1 md:flex-none", printSide === 'right' ? "bg-primary text-white" : "text-slate-500")}
                         >
                           Der
                         </button>
                       </div>
                     )}
                   </div>
                   <div className="flex gap-2 w-full md:w-auto">
                     <Button variant="outline" className="h-10 rounded-xl font-bold px-6 flex-1 md:flex-none" onClick={() => setShowSaleDetail(false)}>CERRAR</Button>
                     <Button className="h-10 rounded-xl bg-primary text-white font-black uppercase tracking-widest gap-2 px-6 flex-[2] md:flex-none" 
                       onClick={() => {
                          const bcvRate = selectedSale.tasa_cambio || rates.bcv;
                          const mp = selectedSale.metodos_pago || {};
                          const resolvedCurrencyMode = printCurrencyMode === 'auto'
                            ? ((mp.pago_movil > 0 || mp.efectivo_ves > 0 || selectedSale.isCashea) ? 'dual' : 'usd')
                            : printCurrencyMode;

                          generateInvoicePDF([{
                            id: selectedSale.id,
                            fecha: new Date(selectedSale.created_at).toLocaleDateString(),
                            cliente: selectedSale.cliente,
                            items: selectedSale.desglose || [],
                            total: selectedSale.total_ingresos,
                            notas: selectedSale.notas,
                            tasa_bcv: bcvRate,
                            total_ves: selectedSale.total_ingresos * bcvRate,
                            iva_aplicado: selectedSale.con_iva,
                            metodos_pago: mp
                          }], { mode: printMode, side: printSide, currencyMode: resolvedCurrencyMode as any });
                       }}>
                       <Download className="w-4 h-4" /> DESCARGAR
                     </Button>
                   </div>
                 </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
        {/* Selector de Segunda Factura */}
        {showSelector && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[80%] overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-black flex items-center gap-2 italic uppercase tracking-widest text-slate-900">
                  <Receipt className="w-4 h-4 text-orange-500" /> Seleccionar Otra Factura
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
                    className="w-full bg-slate-100 border-none rounded-2xl pl-10 pr-4 py-3 text-xs font-bold focus:ring-2 focus:ring-orange-500/20 outline-none"
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
                        <p className="text-[10px] text-slate-400 font-bold">{v.fecha}</p>
                      </div>
                      <p className="text-xs font-black text-orange-500 italic">${Number(v.total_ingresos).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Footer Premium */}
        <footer className="mt-16 pb-12 border-t border-border/20 pt-12 text-center space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <span className="text-sm font-black uppercase tracking-[0.3em] text-foreground/40">Lycos Team POS</span>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Plataforma de Gestión de Ventas e Inventario
            </p>
          </div>
          <div className="pt-4 border-t border-border/5 max-w-xs mx-auto">
            <p className="text-[9px] font-black uppercase text-primary italic tracking-[0.1em]">
              Elaborado por Leandro Marquez
            </p>
            <p className="text-[8px] font-medium text-muted-foreground mt-1">
              &copy; {new Date().getFullYear()} Lycos Garage. Todos los derechos reservados.
            </p>
          </div>
        </footer>
      </div>
    );
}
