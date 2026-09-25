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
import MetodoPagoPanel from '@/components/pos/MetodoPagoPanel';
import { planCashea, type PorcentajeCashea } from '@/lib/pagos/cashea';
import { binsDeColumnas, lineasDePago } from '@/lib/pagos/desglose';
import { buildVentaDiaFields, emptyBins, binsTotalUSD, deptFromInventario, type Bins } from '@/lib/reporte/ventas-mapping';
import { ComprobanteInput, emptyComprobante, type ComprobanteValue } from '@/components/ventas/ComprobanteInput';
import { uploadComprobante, comprobanteFields } from '@/lib/comprobante';
import ErpShell from '@/components/erp/ErpShell';
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
import PersonalYComisiones, { type AsignacionEmpleado, type ItemDesglose } from '@/components/nomina/PersonalYComisiones';
import { asignacionesValidas, buildJobsDesdeAsignacion } from '@/lib/nomina/asignaciones';

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
  // Nómina: técnico(s) encargado(s) de la instalación (escapes) para la comisión.
  const [asignaciones, setAsignaciones] = useState<AsignacionEmpleado[]>([]);
  const [conIva, setConIva] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // Cashea: porcentaje de inicial (40, 50 o 60%)
  const [casheaPct, setCasheaPct] = useState<PorcentajeCashea>(50);
  // Cashea: moneda visual ('usd' o 'ves')
  const [casheaCurrency, setCasheaCurrency] = useState<'usd' | 'ves'>('usd');
  // Custom item prices (for tubería and variable-price items)
  const [customItemPrices, setCustomItemPrices] = useState<Record<string, number>>({});
  
  // Modals
  const [showPreview, setShowPreview] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showSaleDetail, setShowSaleDetail] = useState(false);
  const [saleCorrelativo, setSaleCorrelativo] = useState<string>('');
  const [showAbonoDialog, setShowAbonoDialog] = useState(false);
  const [selectedPendiente, setSelectedPendiente] = useState<any>(null);
  const [abonoExtra, setAbonoExtra] = useState(0);

  const symbol = (selectedSale?.metodos_pago?.euros > 0 || /euro/i.test(selectedSale?.notes || '') || /euro/i.test(selectedSale?.notas || '')) ? '€' : '$';

  // Load or generate correlativo when a sale detail is opened
  useEffect(() => {
    if (!selectedSale?.id || !supabase) { setSaleCorrelativo(''); return; }
    (async () => {
      try {
        const { data: facData } = await supabase.from('facturas')
          .select('correlativo').eq('referencia_id', selectedSale.id).limit(1).maybeSingle();
        if (facData?.correlativo) { setSaleCorrelativo(facData.correlativo); return; }
        // No record yet — generate one now
        const referencia_tabla = selectedSale.source === 'ia' ? 'ventas_silenciadores' : 'ventas_dia';
        const modulo_origen = selectedSale.source === 'ia' ? 'bot' : 'silenciadores';
        const facturaRegistro = await registrarFactura({
          tipo: 'venta', modulo_origen, referencia_id: selectedSale.id, referencia_tabla,
          cliente: selectedSale.cliente || 'Consumidor Final',
          total: selectedSale.total_ingresos || 0, moneda: 'USD',
          tasa_cambio: selectedSale.tasa_cambio || rates.bcv,
          total_bs: (selectedSale.total_ingresos || 0) * (selectedSale.tasa_cambio || rates.bcv),
          items: (selectedSale.desglose || []).flatMap((item: any) => parseDescripcionItems(item.descripcion || '', item.total ?? 0)),
          metodos_pago: selectedSale.metodos_pago, con_iva: selectedSale.con_iva ?? false,
          estado: 'pagado', fecha_emision: selectedSale.fecha || new Date().toISOString().split('T')[0],
          sede_id: currentSede?.id || undefined,
        });
        if (facturaRegistro?.correlativo) setSaleCorrelativo(facturaRegistro.correlativo);
      } catch { setSaleCorrelativo(''); }
    })();
  }, [selectedSale?.id]);

  // Desglose de pago por banco (clasificación exacta) → columnas de ventas_dia
  const [bins, setBins] = useState<Bins>(emptyBins());

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
  // Collapsible sections
  const [showAbonoSection, setShowAbonoSection] = useState(false);
  const [showNotasSection, setShowNotasSection] = useState(false);
  const [abono, setAbono] = useState(0);
  // Comprobante de pago (referencia + imagen del pago móvil / transferencia)
  const [comprobante, setComprobante] = useState<ComprobanteValue>(emptyComprobante());
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
  const isCasheaActive = modoCashea || bins.cashea > 0;
  const subtotal = cart.reduce((sum, item) => {
    // Si es Cashea, usamos el precio base (precio_bs que ya está en USD para tasa BCV)
    const basePrice = (conIva && isCasheaActive)
      ? (item.precio_bs || item.precio_unitario)
      : item.precio_unitario;
    return sum + (item.cantidad * basePrice);
  }, 0);

  const total = subtotal * (conIva ? 1.16 : 1);

  /**
   * El carrito visto por nómina.
   *
   * Cada producto es un renglón asignable, así el técnico cobra el porcentaje
   * que le toca POR CADA cosa que hizo —un silenciador y una revisión en la
   * misma venta no llevan el mismo porcentaje— en vez de un único monto global.
   */
  const itemsNomina: ItemDesglose[] = cart.map(item => {
    const precio = (conIva && isCasheaActive) ? (item.precio_bs || item.precio_unitario) : item.precio_unitario;
    return {
      descripcion: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: precio,
      total: Number((precio * item.cantidad).toFixed(2)),
    };
  });
  // Cashea initial payment = total * casheaPct%
  const casheaInicial = total * (casheaPct / 100);
  const casheaResto = total - casheaInicial;
  const casheaCuota = casheaResto / 3;

  const totalPaid = binsTotalUSD(bins, activeRate);
  const balance = total - totalPaid;

  const hasBsBin = bins.pago_movil_banesco > 0 || bins.bnc > 0 || bins.punto_banesco > 0 ||
                   bins.punto_bancamiga > 0 || bins.pago_movil_exterior > 0 || bins.efectivo_bs > 0;
  const resolvedCurrencyMode = printCurrencyMode === 'auto'
    ? ((hasBsBin || isCasheaActive) ? 'dual' : 'usd')
    : printCurrencyMode;

  const handleFinalize = async () => {
    if (cart.length === 0) return alert("El carrito está vacío");
    if (!supabase) return;
    // Nómina: exige técnico encargado o "lo hizo el taller".
    const asignValidas = asignacionesValidas(asignaciones);
    if (asignValidas.length === 0) return alert('Indica el técnico encargado o marca "Lo hizo el taller" en la sección Comisión / Nómina.');

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

      // Subir comprobante de pago (si se adjuntó imagen) → URL pública
      const comprobanteUrl = await uploadComprobante(comprobante.file);
      const comprobanteRef = comprobante.referencia.trim() || null;

      // Clasificación exacta: banco (bins) + departamento (por categoría del producto)
      const deptItems = cart.map(item => {
        const prod = productos.find(p => p.id === item.id);
        return { dept: deptFromInventario(prod?.categoria || 'silenciador'), monto: (item.precio_unitario || 0) * item.cantidad };
      });
      const mapped = buildVentaDiaFields({
        bins,
        subtotal,
        conIva,
        // Con el plan de Cashea puesto, el resto financiado lo reparte el
        // porcentaje. Pasarlo también aquí lo sumaba dos veces al saldo.
        //
        // Se mira `modoCashea` y no que la casilla tenga monto: si alguien
        // teclea a mano un importe en la casilla de Cashea, el reparto por
        // porcentaje se lo pisaría con otra cifra sin avisar. Con el plan
        // activo manda el plan; escrito a mano, manda lo escrito.
        saldo: modoCashea ? 0 : saldoRestante,
        tasa: activeRate,
        casheaPct: modoCashea ? casheaPct : null,
        deptItems,
      });

      const { data: ventaDia, error: ventaError } = await withSedeFilter(supabase.from('ventas_dia'))
        .insert(withSedeInsert({
          fecha: ventaFechaStr,
          ...comprobanteFields(comprobanteUrl, comprobanteRef),
          cliente: clienteNombre || 'Consumidor Final',
          total_ingresos: total,
          clientes_atendidos: 1,
          ...mapped, // departamentos + columnas por banco + contado/iva/inicial/financiado/por_cobrar/tasa + metodos_pago
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
          con_iva: conIva,
          tasa_cambio: activeRate,
          total_servicios: cart.reduce((s, i) => s + i.cantidad, 0),
          total_clientes: 1,
          notas: `${notas}${vehiculoInfo ? ` | Vehículo: ${vehiculoInfo}` : ''}${tieneAbono ? ` | Abono: $${abonoAmount.toFixed(2)} | Saldo: $${saldoRestante.toFixed(2)}` : ''}${esRegistroAtrasado ? ' | ⚠️ REGISTRO ATRASADO' : ''}`,
          creado_por: 'Admin',
          // El saldo y el estado los manda el mapeo cuando hay Cashea: la
          // inicial entra hoy y el resto queda financiado, y tener la cifra en
          // dos sitios es lo que dejaba la venta cerrada con dinero sin cobrar.
          tiene_abono: modoCashea ? mapped.saldo_pendiente > 0.01 : tieneAbono,
          abono: modoCashea ? mapped.inicial : abonoAmount,
          saldo_pendiente: modoCashea ? mapped.saldo_pendiente : saldoRestante,
          estado: modoCashea ? mapped.estado : estadoVenta,
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

      // Nómina: registra trabajos + comisiones (no bloquea la venta si falla).
      try {
        await fetch('/api/nomina/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sede: currentSede?.id || null,
            // Un trabajo por renglón asignado, con el NOMBRE DEL PRODUCTO como
            // descripción. Antes iba el nombre del cliente, y como las reglas se
            // evalúan contra ese texto, ninguna regla por tipo de servicio podía
            // coincidir desde el punto de venta.
            jobs: asignValidas.flatMap(a => buildJobsDesdeAsignacion(a, {
              items: itemsNomina,
              costoTotal: total,
              tipoTrabajo: a.zona,
              descripcionBase: cart.map(i => i.nombre).join(' + ')
                || `${clienteNombre || 'Consumidor Final'}${vehiculoInfo ? ' · ' + vehiculoInfo : ''}`,
              referenciaTabla: 'ventas_dia',
              referenciaId: ventaDia.id,
              fecha: ventaFechaStr,
            })),
          }),
        });
      } catch (nominaErr) {
        console.error('No se pudo registrar la comisión de nómina (POS):', nominaErr);
      }

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
        // La venta recién grabada: de ahí salen el técnico y el cobro por banco.
        venta_id: ventaDia?.id || null,
        pagos: lineasDePago(binsDeColumnas(mapped as unknown as Record<string, unknown>), activeRate),
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
        metodos_pago: mapped.metodos_pago,
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
          venta_id: secondVenta.source === 'ia' ? null : secondVenta.id,
          servicio_id: secondVenta.servicio_id || null,
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
          metodos_pago: mapped.metodos_pago,
          con_iva: conIva,
          estado: estadoVenta as 'pagado' | 'pendiente',
          notas: notas || undefined,
          emitido_por: 'Admin',
          fecha_emision: format(selectedDate, 'yyyy-MM-dd'),
          sede_id: currentSede?.id || undefined,
          comprobante_url: comprobanteUrl || undefined,
          comprobante_referencia: comprobanteRef || undefined,
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
      setBins(emptyBins());
      setModoCashea(false);
      setAsignaciones([]);
      setAbono(0);
      setShowAbonoSection(false);
      setComprobante(emptyComprobante());
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

  const categories = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean)));

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

  // Payment Calculation Logic — Cashea se maneja aquí; el resto vía DesglosePagoBancos
  const setCasheaMonto = (valueStr: string) => {
    const val = valueStr === '' ? 0 : parseFloat(valueStr);
    setBins(prev => ({ ...prev, cashea: isNaN(val) ? 0 : Math.max(0, val) }));
  };

  /**
   * Carga en Cashea la inicial que le toca al plan.
   *
   * El porcentaje se recibe en vez de leerlo del estado: al pulsar otro plan,
   * `setCasheaPct` aún no se ha aplicado y se calculaba con el anterior.
   *
   * Cashea financia SOBRE el precio con IVA, y el precio base es el de tasa BCV
   * (`precio_bs`, que está en dólares) porque es el que aplica al no pagar en
   * efectivo. Solo la INICIAL entra como cobro; el resto es crédito.
   */
  const autoFillCashea = (pct: PorcentajeCashea = casheaPct) => {
    setModoCashea(true);
    const casheaSubtotal = cart.reduce((sum, item) => {
      const basePrice = item.precio_bs || item.precio_unitario;
      return sum + (item.cantidad * basePrice);
    }, 0);
    const plan = planCashea(casheaSubtotal, pct);
    const otrosPagos = binsTotalUSD({ ...bins, cashea: 0 }, activeRate);
    const targetVal = Math.max(0, plan.inicial - otrosPagos);
    setBins(prev => ({ ...prev, cashea: Number(targetVal.toFixed(2)) }));
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

    // Look up correlativo from facturas table; generate on-the-fly if missing
    let correlativoReprint: string | undefined;
    try {
      if (supabase) {
        const { data: facData } = await supabase.from('facturas')
          .select('correlativo').eq('referencia_id', venta.id).limit(1).maybeSingle();
        if (facData?.correlativo) {
          correlativoReprint = facData.correlativo;
        } else {
          const referencia_tabla = venta.source === 'ia' ? 'ventas_silenciadores' : 'ventas_dia';
          const modulo_origen = venta.source === 'ia' ? 'bot' : 'silenciadores';
          const parsedItemsReprint = (venta.desglose || []).flatMap((item: any) =>
            parseDescripcionItems(item.descripcion || '', item.total ?? item.precio_unitario ?? 0));
          const reg = await registrarFactura({
            tipo: 'venta', modulo_origen, referencia_id: venta.id, referencia_tabla,
            cliente: venta.cliente || 'Consumidor Final',
            total: venta.total_ingresos || 0, moneda: 'USD',
            tasa_cambio: venta.tasa_cambio || rates.bcv,
            total_bs: (venta.total_ingresos || 0) * (venta.tasa_cambio || rates.bcv),
            items: parsedItemsReprint, metodos_pago: venta.metodos_pago,
            con_iva: venta.con_iva ?? false, estado: 'pagado',
            fecha_emision: venta.fecha || new Date().toISOString().split('T')[0],
            sede_id: currentSede?.id || undefined,
          });
          if (reg?.correlativo) correlativoReprint = reg.correlativo;
        }
      }
    } catch { /* non-blocking */ }

    generateInvoicePDF([{
      id: venta.id,
      venta_id: venta.source === 'ia' ? null : venta.id,
      servicio_id: venta.servicio_id || null,
      correlativo: correlativoReprint,
      fecha: new Date(venta.fecha || venta.created_at).toLocaleDateString(),
      cliente: venta.cliente,
      items: (venta.desglose || [{ descripcion: 'Producto', cantidad: 1, precio_unitario: venta.total_ingresos, total: venta.total_ingresos }]).flatMap((item: any) => parseDescripcionItems(item.descripcion || '', item.total ?? item.precio_unitario ?? 0)),
      total: venta.total_ingresos,
      notas: venta.notas,
      tasa_bcv: bcvRate,
      total_ves: (venta.total_ingresos || 0) * bcvRate,
      iva_aplicado: venta.con_iva,
      metodos_pago: mp,
      comprobante_url: venta.comprobante_url || undefined,
      comprobante_referencia: venta.comprobante_referencia || undefined
    }], { mode: 'single', side: 'left', currencyMode: resolvedCurrencyMode as any });
  };

  if (!mounted) return null;

  // ── Panel inferior: lo del día, calculado de las ventas ya cargadas ──────
  const hoyISO = new Date().toISOString().split('T')[0];
  const ventasHoy = ventasRecientes.filter(v => (v.displayDate || v.fecha || v.created_at || '').slice(0, 10) === hoyISO);
  const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total_ingresos || 0), 0);

  const metodosMes = (() => {
    const acc: Record<string, number> = {};
    ventasRecientes.forEach(v => {
      Object.entries(v.metodos_pago || {}).forEach(([k, val]) => {
        const n = Number(val) || 0;
        if (n > 0) acc[k] = (acc[k] || 0) + n;
      });
    });
    const total = Object.values(acc).reduce((s, n) => s + n, 0);
    const TONOS = ['bg-[#22c55e]', 'bg-[#3b82f6]', 'bg-[#8b5cf6]', 'bg-[#f97316]', 'bg-[#eab308]', 'bg-[#94a3b8]'];
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, monto], i) => ({
        nombre: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        monto,
        pct: total > 0 ? Math.round((monto / total) * 100) : 0,
        barra: TONOS[i % TONOS.length],
      }));
  })();

  const bs = (n: number) => `${(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;

  return (
    <ErpShell
      variant="oscuro"
      buscador="Buscar productos, clientes o facturas..."
      lema={['Cada venta', 'queda registrada', 'al instante']}
    >
      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <header className="mb-3.5 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#fff1e7] text-[#f97316]">
          <ShoppingCart className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[21px] font-extrabold leading-tight tracking-tight text-[#16181d]">
            Punto de venta
          </h1>
          <p className="text-[12.5px] text-[#8a909c]">
            {currentSede?.nombre || 'General'} · tasa {rates.bcv} Bs. · {cart.length} en carrito
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]">
                <Calendar className="h-4 w-4 text-[#f97316]" aria-hidden />
                {format(selectedDate, 'dd/MM/yyyy')}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-2xl border-border/50 p-0 shadow-2xl" align="end">
              <CalendarUI mode="single" selected={selectedDate} onSelect={d => d && setSelectedDate(d)} initialFocus locale={es} className="rounded-2xl" />
            </PopoverContent>
          </Popover>

          <button
            onClick={() => { setCart([]); setAsignaciones([]); setBins(emptyBins()); setAbono(0); }}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Limpiar
          </button>

          <button
            onClick={() => { if (cart.length > 0) setShowPreview(true); }}
            disabled={cart.length === 0}
            className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] bg-white px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-45"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Revisar nota
          </button>

          <button
            onClick={handleFinalize}
            disabled={processing || cart.length === 0 || balance > 0.05}
            title={balance > 0.05 ? `Faltan $${balance.toFixed(2)} por cubrir` : undefined}
            className="flex h-[38px] items-center gap-1.5 rounded-lg bg-[#f97316] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[#f97316]"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle className="h-4 w-4" aria-hidden />}
            {processing ? 'Procesando…' : 'Finalizar venta'}
          </button>
        </div>
      </header>

      {/* ── Pestañas ───────────────────────────────────────────────────── */}
      <div className="mb-3.5 flex items-center gap-1 rounded-xl border border-[#e8eaed] bg-white p-1" role="tablist">
        {([['nueva', 'Nueva venta', ShoppingCart], ['pendientes', 'Pendientes por pagar', Clock]] as const).map(([id, label, Icono]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tabVenta === id}
            onClick={() => setTabVenta(id)}
            className={cn(
              'flex h-[36px] items-center gap-2 rounded-lg px-3.5 text-[12.5px] font-semibold transition-colors',
              tabVenta === id ? 'bg-[#f97316] text-white' : 'text-[#5b616e] hover:bg-[#f6f7f9]',
            )}
          >
            <Icono className="h-4 w-4" aria-hidden />
            {label}
            {id === 'pendientes' && ventasPendientes.length > 0 && (
              <span className={cn(
                'flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                tabVenta === id ? 'bg-white text-[#f97316]' : 'bg-[#ef4444] text-white',
              )}>
                {ventasPendientes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabVenta === 'pendientes' ? (
        /* ── Ventas pendientes ───────────────────────────────────────── */
        <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-extrabold text-[#16181d]">Ventas pendientes por cobrar</h2>
              <p className="num text-[12.5px] text-[#8a909c]">
                {ventasPendientes.length > 0
                  ? `Total pendiente: $${ventasPendientes.reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0).toFixed(2)}`
                  : 'No hay ventas pendientes'}
              </p>
            </div>
            <button
              onClick={() => { fetchData(); setLoadingPendientes(true); setTimeout(() => setLoadingPendientes(false), 500); }}
              className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#e2e5ea] px-3 text-[12.5px] font-medium text-[#3d4350] hover:bg-[#f6f7f9]"
            >
              <RefreshCw className={cn('h-4 w-4', loadingPendientes && 'animate-spin')} aria-hidden />
              Actualizar
            </button>
          </header>

          {ventasPendientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CheckCircle className="mb-3 h-10 w-10 text-[#16a34a]" aria-hidden />
              <p className="text-[13px] font-bold text-[#16181d]">Todo al día</p>
              <p className="text-[12px] text-[#8a909c]">No hay ventas pendientes de pago</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-y border-[#eef0f3] bg-[#fafbfc]">
                    {['Cliente', 'Fecha', 'Total', 'Abonado', 'Saldo', 'Acciones'].map(h => (
                      <th key={h} scope="col" className="px-4 py-2.5 text-left text-[11.5px] font-semibold text-[#5b616e]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ventasPendientes.map((v: any) => {
                    const vFecha = v.fecha || v.created_at?.split('T')[0] || '';
                    const atrasado = v.registro_atrasado === true || (vFecha && vFecha !== hoyISO);
                    return (
                      <tr key={v.id} className="border-b border-[#f2f3f5] last:border-0 hover:bg-[#fafbfc]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-semibold text-[#16181d]">{v.cliente || 'Consumidor Final'}</span>
                            {atrasado && (
                              <span className="rounded-md bg-[#fff4ec] px-1.5 py-[2px] text-[10px] font-semibold text-[#c2410c]">Atrasado</span>
                            )}
                          </div>
                        </td>
                        <td className="num px-4 py-2.5 text-[12px] text-[#5b616e]">
                          {vFecha ? new Date(vFecha.includes('T') ? vFecha : vFecha + 'T12:00:00').toLocaleDateString('es-VE') : new Date(v.created_at).toLocaleDateString('es-VE')}
                        </td>
                        <td className="num px-4 py-2.5 text-[12px] text-[#16181d]">${Number(v.total_ingresos || 0).toFixed(2)}</td>
                        <td className="num px-4 py-2.5 text-[12px] text-[#16a34a]">{Number(v.abono) > 0 ? `$${Number(v.abono).toFixed(2)}` : '—'}</td>
                        <td className="num px-4 py-2.5 text-[12px] font-bold text-[#c2410c]">${Number(v.saldo_pendiente || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleMarcarPagado(v)}
                              className="h-[28px] rounded-lg border border-[#bbf7d0] bg-[#e8f7ee] px-2.5 text-[11px] font-semibold text-[#15803d] hover:bg-[#d6f0e0]"
                            >
                              Pagado
                            </button>
                            <button
                              onClick={() => { setSelectedPendiente(v); setAbonoExtra(0); setShowAbonoDialog(true); }}
                              className="h-[28px] rounded-lg border border-[#cfe0fb] bg-[#eef4fe] px-2.5 text-[11px] font-semibold text-[#1d4ed8] hover:bg-[#e2edfd]"
                            >
                              Abonar
                            </button>
                            <button
                              onClick={() => handleReimprimirFactura(v)}
                              aria-label="Reimprimir factura"
                              className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]"
                            >
                              <Printer className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal de abono */}
          <Dialog open={showAbonoDialog} onOpenChange={setShowAbonoDialog}>
            <DialogContent className="max-w-md rounded-2xl border-border/50 bg-card p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-black">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                  Registrar abono
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Cliente: <strong>{selectedPendiente?.cliente || 'N/A'}</strong>
                  {selectedPendiente && (
                    <span className="mt-1 block">
                      Saldo pendiente: <strong className="text-amber-500">${Number(selectedPendiente.saldo_pendiente || 0).toFixed(2)}</strong>
                      {Number(selectedPendiente.abono) > 0 && (
                        <> | Abonado: <strong className="text-green-500">${Number(selectedPendiente.abono).toFixed(2)}</strong></>
                      )}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground">Monto del abono ($)</Label>
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
                  <div className="space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-muted-foreground">Abono ahora:</span>
                      <span className="font-black text-green-500">- ${abonoExtra.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-muted-foreground">Nuevo saldo:</span>
                      <span className="font-black text-amber-500">${Math.max(0, (Number(selectedPendiente.saldo_pendiente) || 0) - abonoExtra).toFixed(2)}</span>
                    </div>
                    {abonoExtra >= (Number(selectedPendiente.saldo_pendiente) || 0) && (
                      <div className="flex items-center gap-2 pt-1 text-green-500">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold">¡La venta quedará liquidada!</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setShowAbonoDialog(false); setSelectedPendiente(null); setAbonoExtra(0); }}>
                  Cancelar
                </Button>
                <Button className="flex-1 rounded-xl bg-primary font-black text-white" onClick={handleRegistrarAbono} disabled={abonoExtra <= 0}>
                  Registrar abono
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : (
        <>
          {/* ── Tres columnas de trabajo ────────────────────────────────── */}
          <div className="mb-3.5 flex flex-col gap-3.5 lg:h-[calc(100dvh-15.5rem)] lg:flex-row">

            {/* Catálogo */}
            <section className="flex w-full flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:w-[400px] lg:shrink-0">
              <header className="border-b border-[#e8eaed] px-4 py-3">
                <h2 className="mb-2.5 text-[14.5px] font-bold text-[#16181d]">Productos y servicios</h2>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Busca por nombre o categoría..."
                    aria-label="Buscar producto"
                    className="h-[38px] w-full rounded-lg border border-[#e2e5ea] pl-9 pr-3 text-[12.5px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {['all', ...categories].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      aria-pressed={categoryFilter === cat}
                      className={cn(
                        'h-[26px] rounded-md px-2.5 text-[11px] font-medium capitalize transition-colors',
                        categoryFilter === cat ? 'bg-[#fff1e7] text-[#f97316]' : 'bg-[#f2f3f5] text-[#5b616e] hover:bg-[#e8eaed]',
                      )}
                    >
                      {cat === 'all' ? 'Todas' : cat}
                    </button>
                  ))}
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {loading ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-[150px] animate-pulse rounded-lg border border-[#eef0f3] bg-[#f6f7f9]" />
                    ))}
                  </div>
                ) : filteredProductos.length === 0 ? (
                  <p className="py-10 text-center text-[12.5px] text-[#8a909c]">
                    Ningún producto coincide con esa búsqueda.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {filteredProductos.map(prod => (
                      <button
                        key={prod.id}
                        disabled={prod.stock <= 0}
                        onClick={() => addToCart(prod)}
                        className={cn(
                          'flex flex-col rounded-lg border p-2.5 text-left transition-colors',
                          prod.stock <= 0
                            ? 'cursor-not-allowed border-[#eef0f3] opacity-45'
                            : 'border-[#e8eaed] hover:border-[#f97316] hover:bg-[#fffaf6]',
                        )}
                      >
                        {/* Hueco de la foto del producto, reservado con su fondo. */}
                        <span className="relative mb-2 flex h-[72px] w-full items-center justify-center rounded-md bg-[#f4f5f7]" aria-hidden>
                          <Package className="h-6 w-6 text-[#c2c7d0]" />
                          <span className={cn(
                            'absolute right-1 top-1 rounded px-1.5 py-[1px] text-[9.5px] font-bold',
                            prod.stock <= 5 ? 'bg-[#fdeaea] text-[#dc2626]' : 'bg-white text-[#5b616e]',
                          )}>
                            {prod.stock}
                          </span>
                        </span>

                        <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-[#9ba1ab]">
                          {prod.categoria}
                        </span>
                        <span className="mt-0.5 block min-h-[30px] text-[12px] font-semibold leading-tight text-[#16181d] line-clamp-2">
                          {prod.nombre}
                        </span>

                        <span className="mt-1.5 flex items-end justify-between gap-1">
                          <span className="num text-[13px] font-extrabold text-[#f97316]">
                            ${Number(prod.precio_usd || 0).toFixed(2)}
                          </span>
                          <span className="num text-right text-[9.5px] leading-tight text-[#9ba1ab]">
                            BCV ${Number(prod.precio_bs || prod.precio_usd || 0).toFixed(2)}
                            <span className="block">{bs((prod.precio_bs || prod.precio_usd || 0) * rates.bcv)}</span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Detalle de la venta */}
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
              <header className="flex items-center gap-2 border-b border-[#e8eaed] px-4 py-3">
                <h2 className="flex-1 text-[14.5px] font-bold text-[#16181d]">Detalle de la venta</h2>
                <span className="rounded-md bg-[#f2f3f5] px-2 py-0.5 text-[11px] font-semibold text-[#5b616e]">
                  {cart.length} ítem{cart.length === 1 ? '' : 's'}
                </span>
                <button
                  onClick={() => { if (!isCasheaActive) setConIva(!conIva); }}
                  disabled={isCasheaActive}
                  aria-pressed={conIva}
                  title={isCasheaActive
                    ? 'Con Cashea el IVA del 16% es obligatorio: es sobre ese total que se calculan la inicial y las cuotas.'
                    : undefined}
                  className={cn(
                    'flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors',
                    conIva ? 'border-[#f97316] bg-[#fff4ec] text-[#f97316]' : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
                  )}
                >
                  <Receipt className="h-3.5 w-3.5" aria-hidden />
                  {conIva ? 'Con IVA 16%' : 'Sin IVA'}
                </button>
                <button
                  onClick={() => { const n = !modoCashea; setModoCashea(n); if (n) setConIva(true); }}
                  aria-pressed={modoCashea}
                  className={cn(
                    'flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors',
                    modoCashea ? 'border-[#2563eb] bg-[#eef4fe] text-[#2563eb]' : 'border-[#e2e5ea] text-[#5b616e] hover:bg-[#f6f7f9]',
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                  Cashea
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {/* Cliente y vehículo */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">Cliente</span>
                    <span className="flex items-center gap-2.5 rounded-lg border border-[#e2e5ea] px-3 py-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[#9ba1ab]" aria-hidden>
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        value={clienteNombre}
                        onChange={e => setClienteNombre(e.target.value)}
                        placeholder="Consumidor Final"
                        aria-label="Nombre del cliente"
                        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-[#16181d] outline-none placeholder:font-normal placeholder:text-[#9ba1ab]"
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11.5px] font-medium text-[#5b616e]">Vehículo (opcional)</span>
                    <span className="flex items-center gap-2.5 rounded-lg border border-[#e2e5ea] px-3 py-2">
                      <span className="flex h-9 w-[52px] shrink-0 items-center justify-center rounded-md bg-[#f4f5f7] text-[#c2c7d0]" aria-hidden>
                        <Car className="h-4 w-4" />
                      </span>
                      <input
                        value={vehiculoInfo}
                        onChange={e => setVehiculoInfo(e.target.value)}
                        placeholder="Ej: AB123CD / Corolla"
                        aria-label="Vehículo"
                        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-[#16181d] outline-none placeholder:font-normal placeholder:text-[#9ba1ab]"
                      />
                    </span>
                  </label>
                </div>

                {/* Líneas */}
                <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Ítems de la venta</p>
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#d5d9e0] py-12">
                    <ShoppingCart className="mb-2 h-8 w-8 text-[#d5d9e0]" aria-hidden />
                    <p className="text-[12.5px] font-medium text-[#8a909c]">Carrito vacío</p>
                    <p className="text-[11.5px] text-[#9ba1ab]">Toca un producto del catálogo para agregarlo.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#e8eaed]">
                    <table className="w-full min-w-[560px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#e8eaed] bg-[#fafbfc]">
                          {['#', 'Descripción', 'Precio USD', 'Precio BCV', 'Cant.', 'Total', ''].map((h, i) => (
                            <th key={i} scope="col" className={cn('px-2.5 py-2 text-[11px] font-semibold text-[#5b616e]', i === 0 || i > 1 ? 'text-center' : 'text-left')}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((item, idx) => {
                          const precioEfectivo = (conIva && isCasheaActive)
                            ? (item.precio_bs || item.precio_unitario)
                            : item.precio_unitario;
                          return (
                            <React.Fragment key={item.id}>
                              <tr className="border-b border-[#f0f1f4] last:border-0">
                                <td className="num px-2.5 py-2 text-center text-[12px] text-[#9ba1ab]">{idx + 1}</td>
                                <td className="px-2.5 py-2 text-[12.5px] leading-tight text-[#16181d]">
                                  {item.nombre}
                                  {item.isTuberia && (
                                    <span className="block text-[10.5px] text-[#9ba1ab]">
                                      {item.medida_tuberia === 'completo' ? 'Tubo completo (6 m)' : `${item.metros_tuberia || 1} m por pieza`}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 text-center">
                                  <input
                                    type="number" step="0.01" min="0"
                                    title="Precio en divisa (USD)"
                                    value={item.precio_unitario}
                                    onChange={e => updateCartItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                    className="num h-[26px] w-[68px] rounded-md border border-[#e2e5ea] px-1.5 text-right text-[12px] font-semibold text-[#f97316] outline-none focus:border-[#f97316]"
                                  />
                                </td>
                                <td className="px-2.5 py-2 text-center">
                                  <input
                                    type="number" step="0.01" min="0"
                                    title="Precio dólar BCV (en USD)"
                                    value={item.precio_bs || item.precio_unitario}
                                    onChange={e => updateCartItemPrecioBs(item.id, parseFloat(e.target.value) || 0)}
                                    className="num h-[26px] w-[68px] rounded-md border border-[#e2e5ea] px-1.5 text-right text-[12px] font-semibold text-[#2563eb] outline-none focus:border-[#2563eb]"
                                  />
                                </td>
                                <td className="px-2.5 py-2">
                                  <span className="mx-auto flex w-[86px] items-center justify-between rounded-md border border-[#e2e5ea]">
                                    <button onClick={() => updateQuantity(item.id, -1)} aria-label="Quitar uno" className="h-[26px] w-[24px] text-[#5b616e] hover:text-[#f97316]">−</button>
                                    <span className="num text-[12px] font-semibold">{item.cantidad}</span>
                                    <button onClick={() => updateQuantity(item.id, 1)} aria-label="Agregar uno" className="h-[26px] w-[24px] text-[#5b616e] hover:text-[#f97316]">+</button>
                                  </span>
                                </td>
                                <td className="num px-2.5 py-2 text-right text-[12.5px] font-semibold text-[#16181d]">
                                  ${(precioEfectivo * item.cantidad).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <button onClick={() => removeFromCart(item.id)} aria-label={`Quitar ${item.nombre}`} className="text-[#e05252] hover:text-[#c02f2f]">
                                    <Trash2 className="h-[15px] w-[15px]" aria-hidden />
                                  </button>
                                </td>
                              </tr>

                              {/* Tubería: se vende por tubo o por metros y el stock se redondea. */}
                              {item.isTuberia && (
                                <tr className="border-b border-[#f0f1f4] bg-[#fffaf6] last:border-0">
                                  <td colSpan={7} className="px-3 py-2.5">
                                    <div className="flex flex-wrap items-center gap-4">
                                      <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] font-medium text-[#3d4350]">
                                        <input
                                          type="radio"
                                          name={`medida-${item.id}`}
                                          checked={item.medida_tuberia === 'completo'}
                                          onChange={() => handleTuberiaChange(item.id, 'completo', 6)}
                                          className="h-[15px] w-[15px] accent-[#f97316]"
                                        />
                                        Tubo completo (6 m)
                                      </label>
                                      <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] font-medium text-[#3d4350]">
                                        <input
                                          type="radio"
                                          name={`medida-${item.id}`}
                                          checked={item.medida_tuberia === 'metros'}
                                          onChange={() => handleTuberiaChange(item.id, 'metros', 1)}
                                          className="h-[15px] w-[15px] accent-[#f97316]"
                                        />
                                        Por metros
                                      </label>

                                      {item.medida_tuberia === 'metros' && (
                                        <span className="flex items-center gap-2">
                                          <span className="text-[12px] text-[#5b616e]">Metros:</span>
                                          <span className="flex items-center rounded-md border border-[#e2e5ea]">
                                            <button
                                              type="button"
                                              onClick={() => handleTuberiaChange(item.id, 'metros', Math.max(0.1, Number(((item.metros_tuberia || 1) - 0.5).toFixed(1))))}
                                              className="h-[28px] w-[26px] text-[#5b616e] hover:text-[#f97316]"
                                              aria-label="Menos medio metro"
                                            >−</button>
                                            <input
                                              type="number" step="0.1" min="0.1"
                                              value={item.metros_tuberia || 1}
                                              onChange={e => handleTuberiaChange(item.id, 'metros', parseFloat(e.target.value) || 0)}
                                              className="num h-[28px] w-[54px] border-0 text-center text-[12px] font-semibold outline-none"
                                              aria-label="Metros a vender"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleTuberiaChange(item.id, 'metros', Number(((item.metros_tuberia || 1) + 0.5).toFixed(1)))}
                                              className="h-[28px] w-[26px] text-[#5b616e] hover:text-[#f97316]"
                                              aria-label="Más medio metro"
                                            >+</button>
                                          </span>
                                        </span>
                                      )}
                                    </div>

                                    <p className="num mt-2 text-[11px] leading-snug text-[#8a909c]">
                                      {item.medida_tuberia === 'completo'
                                        ? `Se descontarán ${item.cantidad} tubo(s) de 6 m del inventario.`
                                        : `Total ${(((item.metros_tuberia || 1) * item.cantidad)).toFixed(1)} m · se descontarán ${Math.ceil(((item.metros_tuberia || 1) * item.cantidad) / 6)} tubo(s) del inventario.`}
                                    </p>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Comisión / nómina: sin esto no se puede cerrar la venta. */}
                {cart.length > 0 && (
                  <>
                    <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-[#5b616e]">
                      <Banknote className="h-3.5 w-3.5 text-[#f97316]" aria-hidden />
                      Comisión / nómina
                    </p>
                    <div className="rounded-lg border border-[#ffd9bd] bg-[#fffaf6] p-3">
                      <PersonalYComisiones
                        value={asignaciones}
                        onChange={setAsignaciones}
                        sedeId={currentSede?.id || null}
                        defaultZona="escape"
                        items={itemsNomina}
                        costoTotal={total}
                        tipoTrabajo="escape"
                        descripcionTrabajo={cart.map(i => i.nombre).join(' + ') || null}
                      />
                    </div>
                  </>
                )}

                {/* Notas */}
                <p className="mb-1.5 mt-3 text-[11.5px] font-medium text-[#5b616e]">Notas de la venta</p>
                <textarea
                  rows={2}
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones, recomendaciones, etc."
                  aria-label="Notas de la venta"
                  className="w-full resize-none rounded-lg border border-[#e2e5ea] px-3 py-2 text-[12.5px] outline-none placeholder:text-[#9ba1ab] focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
                />

                {/* Totales */}
                <dl className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <dt className="text-[#5b616e]">Subtotal</dt>
                    <dd className="num font-semibold text-[#16181d]">${subtotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <dt className="text-[#5b616e]">IVA (16%)</dt>
                    <dd className="num font-semibold text-[#16181d]">${(conIva ? total - subtotal : 0).toFixed(2)}</dd>
                  </div>
                </dl>

                <div className="mt-2.5 rounded-lg bg-[#fff4ec] px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-bold text-[#16181d]">Total a pagar</span>
                    <span className="num text-[19px] font-extrabold text-[#16181d]">${total.toFixed(2)}</span>
                  </div>
                  <p className="num mt-0.5 text-right text-[11px] text-[#9ba1ab]">{bs(total * rates.bcv)}</p>
                </div>
              </div>
            </section>

            {/* Pago */}
            <div className="flex min-h-0 w-full flex-col gap-3.5 lg:w-[372px] lg:shrink-0">
              <MetodoPagoPanel
                bins={bins}
                onBinsChange={setBins}
                totalUSD={total}
                subtotalUSD={subtotal}
                tasa={activeRate}
                tasaAuto={rates.bcv}
                customRate={customRate}
                onCustomRate={setCustomRate}
                cashea={{
                  pct: casheaPct,
                  // Se recalcula SIEMPRE al cambiar de plan. Antes solo se rellenaba si la
                  // inicial estaba en cero, así que con el plan al 0% se quedaba pegada.
                  onPct: pct => { setCasheaPct(pct); setConIva(true); setModoCashea(true); autoFillCashea(pct); },
                  activo: isCasheaActive,
                  onUsar: () => { setConIva(true); setModoCashea(true); autoFillCashea(casheaPct); },
                  inicial: casheaInicial,
                  resto: casheaResto,
                  cuota: casheaCuota,
                  cuotas: 3,
                }}
              />

              {/* Abono / apartado */}
              <div className="shrink-0 overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
                <button
                  type="button"
                  onClick={() => setShowAbonoSection(!showAbonoSection)}
                  aria-expanded={showAbonoSection}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[#fafbfc]"
                >
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#fdf5e2] text-[#eab308]">
                    <DollarSign className="h-[13px] w-[13px]" aria-hidden />
                  </span>
                  <span className="flex-1 text-[12.5px] font-semibold text-[#16181d]">Abono / apartado</span>
                  {abono > 0 && <span className="num rounded-md bg-[#fdf5e2] px-2 py-0.5 text-[11px] font-bold text-[#a16207]">${abono.toFixed(2)}</span>}
                  <ChevronDown className={cn('h-4 w-4 text-[#9ba1ab] transition-transform', showAbonoSection && 'rotate-180')} aria-hidden />
                </button>

                {showAbonoSection && (
                  <div className="space-y-2 border-t border-[#eef0f3] px-4 py-2.5">
                    <p className="text-[11px] leading-snug text-[#8a909c]">
                      Registra un abono parcial. La venta queda <strong className="text-[#c2410c]">pendiente por pagar</strong> hasta liquidar el saldo.
                    </p>
                    <input
                      type="number" min={0} max={total} step={0.01}
                      placeholder="0.00"
                      aria-label="Monto del abono"
                      value={abono || ''}
                      onChange={e => setAbono(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="num h-[36px] w-full rounded-md border border-[#e2e5ea] px-2.5 text-[12.5px] font-semibold outline-none focus:border-[#f97316]"
                    />
                    <dl className="space-y-1 text-[11.5px]">
                      <div className="flex justify-between"><dt className="text-[#5b616e]">Total venta</dt><dd className="num font-semibold">${total.toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-[#5b616e]">Abono ahora</dt><dd className="num font-semibold text-[#16a34a]">- ${abono.toFixed(2)}</dd></div>
                      <div className="flex justify-between border-t border-[#eef0f3] pt-1"><dt className="font-semibold text-[#c2410c]">Saldo pendiente</dt><dd className="num font-bold text-[#c2410c]">${Math.max(0, total - abono).toFixed(2)}</dd></div>
                    </dl>
                    {abono > 0 && total - abono <= 0 && (
                      <p className="flex items-center gap-1.5 rounded-md bg-[#e8f7ee] px-2.5 py-2 text-[11px] font-medium text-[#15803d]">
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                        El abono cubre el total: la venta quedará pagada.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Cierre */}
              <div className="shrink-0 rounded-xl border border-[#e8eaed] bg-white px-4 py-3">
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-[12px] text-[#5b616e]">Por cobrar</span>
                  <span className={cn('num text-[17px] font-extrabold', balance > 0.05 ? 'text-[#dc2626]' : 'text-[#16a34a]')}>
                    ${balance.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { if (cart.length > 0) setShowPreview(true); }}
                    disabled={cart.length === 0}
                    className="flex h-[42px] items-center justify-center gap-1.5 rounded-lg border border-[#e2e5ea] text-[12.5px] font-semibold text-[#3d4350] hover:bg-[#f6f7f9] disabled:opacity-45"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    Revisar nota
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={processing || cart.length === 0 || balance > 0.05}
                    className="flex h-[42px] items-center justify-center gap-1.5 rounded-lg bg-[#f97316] text-[12.5px] font-semibold text-white transition-colors hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[#f97316]"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle className="h-4 w-4" aria-hidden />}
                    {processing ? 'Procesando' : 'Registrar'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Paneles del pie ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
            <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:col-span-5">
              <header className="flex items-center gap-2 px-4 py-3">
                <Receipt className="h-4 w-4 text-[#f97316]" aria-hidden />
                <h2 className="flex-1 text-[13.5px] font-bold text-[#16181d]">Ventas recientes</h2>
                <button onClick={fetchData} aria-label="Actualizar" className="rounded-md p-1 text-[#5b616e] hover:bg-[#f4f5f7]">
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin text-[#f97316]')} aria-hidden />
                </button>
              </header>

              {ventasRecientes.length === 0 ? (
                <p className="px-4 pb-6 pt-2 text-center text-[12.5px] text-[#8a909c]">
                  Sin ventas registradas en {currentSede?.nombre || 'esta sede'}.
                </p>
              ) : (
                <div className="max-h-[320px] overflow-auto">
                  <table className="w-full min-w-[520px] border-collapse">
                    <thead className="sticky top-0">
                      <tr className="border-y border-[#f0f1f4] bg-[#fafbfc]">
                        {['Cliente', 'Fecha', 'Ítems', 'Total', 'Origen'].map(h => (
                          <th key={h} scope="col" className="px-3 py-2 text-left text-[10.5px] font-semibold text-[#8a909c]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ventasRecientes.map((v, i) => (
                        <tr
                          key={v.id || i}
                          onClick={() => { setSelectedSale(v); setShowSaleDetail(true); }}
                          className="cursor-pointer border-b border-[#f5f6f8] last:border-0 hover:bg-[#fafbfc]"
                        >
                          <td className="px-3 py-2.5 text-[11.5px] font-medium text-[#16181d]">
                            {v.cliente || 'Consumidor Final'}
                            {v.isAtrasado && <span className="ml-1.5 rounded bg-[#fff4ec] px-1 py-[1px] text-[9.5px] font-semibold text-[#c2410c]">Atrasado</span>}
                          </td>
                          <td className="num px-3 py-2.5 text-[11.5px] text-[#5b616e]">
                            {v.displayDate
                              ? new Date(v.displayDate.includes('T') ? v.displayDate : v.displayDate + 'T12:00:00').toLocaleDateString('es-VE')
                              : new Date(v.created_at).toLocaleDateString('es-VE')}
                          </td>
                          <td className="num px-3 py-2.5 text-[11.5px] text-[#5b616e]">{v.desglose?.length || 0}</td>
                          <td className="num px-3 py-2.5 text-[11.5px] font-semibold text-[#16181d]">
                            ${Number(v.total_ingresos || 0).toFixed(2)}
                            <span className="block text-[10px] font-normal text-[#9ba1ab]">
                              {bs((v.total_ingresos || 0) * (v.tasa_cambio || rates.bcv))}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="flex flex-wrap items-center gap-1">
                              {v.source === 'ia' && <span className="rounded bg-[#f0eafc] px-1.5 py-[1px] text-[10px] font-semibold text-[#7c3aed]">IA</span>}
                              {v.isCashea && <span className="rounded bg-[#e7f0fe] px-1.5 py-[1px] text-[10px] font-semibold text-[#2563eb]">Cashea</span>}
                              {v.isBinance && <span className="rounded bg-[#fdf5e2] px-1.5 py-[1px] text-[10px] font-semibold text-[#a16207]">Binance</span>}
                              {!v.source && !v.isCashea && !v.isBinance && <span className="text-[10.5px] text-[#9ba1ab]">Mostrador</span>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white lg:col-span-4">
              <header className="flex items-center gap-2 px-4 py-3">
                <Coins className="h-4 w-4 text-[#f97316]" aria-hidden />
                <h2 className="flex-1 text-[13.5px] font-bold text-[#16181d]">Métodos de pago</h2>
                <span className="text-[10.5px] text-[#9ba1ab]">{ventasRecientes.length} ventas</span>
              </header>

              {metodosMes.length === 0 ? (
                <p className="px-4 pb-6 text-center text-[12.5px] text-[#8a909c]">Sin cobros registrados todavía.</p>
              ) : (
                <ul className="px-4 pb-3.5">
                  {metodosMes.map(m => (
                    <li key={m.nombre} className="flex items-center gap-2.5 py-[7px]">
                      <span className="w-[92px] shrink-0 truncate text-[11.5px] text-[#3d4350]">{m.nombre}</span>
                      <span className="num w-[76px] shrink-0 text-[11.5px] font-medium text-[#16181d]">${m.monto.toFixed(2)}</span>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#f0f1f4]">
                        <span className={`block h-full rounded-full ${m.barra}`} style={{ width: `${m.pct}%` }} />
                      </span>
                      <span className="num w-[26px] shrink-0 text-right text-[11px] text-[#8a909c]">{m.pct}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
              {[
                { label: 'Ventas de hoy', valor: String(ventasHoy.length), tinte: 'bg-[#e7f0fe] text-[#2563eb]' },
                { label: 'Total de hoy', valor: `$${totalHoy.toFixed(2)}`, sub: bs(totalHoy * rates.bcv), tinte: 'bg-[#e8f7ee] text-[#16a34a]' },
              ].map(k => (
                <article key={k.label} className="flex items-center gap-3 rounded-xl border border-[#e8eaed] bg-white px-4 py-3.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.tinte}`}>
                    <TrendingUp className="h-[17px] w-[17px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-[#8a909c]">{k.label}</p>
                    <p className="num text-[18px] font-extrabold leading-tight text-[#16181d]">{k.valor}</p>
                    {k.sub && <p className="num text-[10.5px] text-[#9ba1ab]">{k.sub}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Vista previa / comprobante / impresión ──────────────────────── */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="flex max-h-[90vh] max-w-[95vw] flex-col overflow-hidden rounded-2xl border-border/50 bg-card p-0 shadow-2xl md:max-w-2xl">
          <div className="flex-shrink-0 border-b border-border/30 bg-primary/5 p-4 md:p-6">
            <DialogTitle className="flex items-center gap-3 text-xl font-black tracking-tight">
              <FileText className="h-6 w-6 text-primary" /> Resumen de facturación
            </DialogTitle>
          </div>
          <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cliente / vehículo</p>
                <p className="truncate text-sm font-black uppercase text-foreground">{clienteNombre || 'Consumidor Final'}</p>
                <p className="truncate text-xs font-bold uppercase text-muted-foreground">{vehiculoInfo || 'S/D'}</p>
              </div>
              <div className="space-y-1 md:text-right">
                <Badge className="mb-2 border-none bg-primary/20 text-[9px] font-black text-primary">{currentSede?.nombre}</Badge>
                <p className="text-sm font-black uppercase text-foreground">{format(selectedDate, 'dd/MM/yyyy')}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/50">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px] text-left text-xs">
                  <thead className="border-b border-border/30 bg-muted/50 font-black uppercase text-muted-foreground">
                    <tr><th className="px-4 py-3">Ítem</th><th className="px-4 py-3 text-center">Cant</th><th className="px-4 py-3 text-right">Total USD</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {cart.map((item, idx) => {
                      const effectivePrice = (conIva && isCasheaActive) ? (item.precio_bs || item.precio_unitario) : item.precio_unitario;
                      return (
                        <tr key={idx} className="font-bold">
                          <td className="max-w-[150px] truncate px-4 py-3 uppercase">{item.nombre}</td>
                          <td className="px-4 py-3 text-center font-black">{item.cantidad}</td>
                          <td className="px-4 py-3 text-right font-black">${Number(effectivePrice * item.cantidad).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/30 py-4">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total a cobrar:</span>
              <span className="text-2xl font-black tracking-tight text-primary md:text-3xl">${Number(total).toFixed(2)}</span>
            </div>

            {/* Comprobante de pago (referencia + imagen) */}
            <ComprobanteInput value={comprobante} onChange={setComprobante} />
          </div>

          <DialogFooter className="flex flex-shrink-0 flex-col gap-4 bg-muted/20 p-4 md:p-6">
            <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row">
              <div className="flex w-full flex-col items-center gap-2 md:w-auto md:flex-row">
                <div className="flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 md:w-auto">
                  {([['single', 'Única'], ['dual', 'Dual'], ['diferente', 'Dif.']] as const).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => { setPrintMode(m); if (m === 'diferente' && !secondVenta) setShowSelector(true); }}
                      className={cn('flex-1 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all md:flex-none', printMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 md:w-auto">
                  {([['auto', 'Auto'], ['usd', 'Solo USD'], ['dual', 'Bs + USD']] as const).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => setPrintCurrencyMode(m)}
                      className={cn('flex-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all md:flex-none', printCurrencyMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {printMode === 'single' && (
                  <div className="flex w-full items-center justify-center rounded-lg border border-border bg-background p-0.5 md:w-auto">
                    {([['left', 'Izq'], ['right', 'Der']] as const).map(([s, label]) => (
                      <button
                        key={s}
                        onClick={() => setPrintSide(s)}
                        className={cn('flex-1 rounded-md px-2 py-1 text-[9px] font-black uppercase transition-all md:flex-none', printSide === s ? 'bg-primary text-white' : 'text-slate-500')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex w-full gap-2 md:w-auto">
                <Button variant="outline" className="h-10 flex-1 rounded-xl font-bold md:px-6" onClick={() => setShowPreview(false)}>Volver</Button>
                <Button className="h-10 flex-[2] gap-2 rounded-xl bg-primary font-black uppercase tracking-widest text-white md:px-6" onClick={handleFinalize}>
                  <Printer className="h-4 w-4" /> Confirmar
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detalle de una venta reciente ───────────────────────────────── */}
      <Dialog open={showSaleDetail} onOpenChange={setShowSaleDetail}>
        <DialogContent className="max-w-2xl overflow-hidden rounded-2xl border-border/50 bg-card p-0 shadow-2xl">
          {selectedSale && (
            <>
              <div className="border-b border-border/30 bg-primary/5 p-6">
                <DialogTitle className="flex items-center gap-3 text-xl font-black tracking-tight">
                  {selectedSale.source === 'ia' ? <Bot className="h-7 w-7 text-violet-500" /> : <Receipt className="h-7 w-7 text-primary" />}
                  {saleCorrelativo || (selectedSale.source === 'ia' ? 'Registro de IA' : `Factura #${selectedSale.id?.slice(0, 8).toUpperCase()}`)}
                </DialogTitle>
              </div>
              <div className="space-y-6 p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">Cliente</p>
                    <p className="text-sm font-black uppercase">{selectedSale.cliente}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {selectedSale.isAtrasado && (
                        <Badge className="border-none bg-orange-500 px-1.5 text-[8px] font-black text-white">Registro atrasado</Badge>
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
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">Monto total</p>
                    <p className="text-2xl font-black text-primary">{symbol}{selectedSale.total_ingresos?.toFixed(2)}</p>
                    <p className="text-xs font-bold text-muted-foreground">
                      {bs((selectedSale.total_ingresos || 0) * (selectedSale.tasa_cambio || rates.bcv))}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border/50">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border/30 bg-muted/50 font-black">
                        <tr><th className="px-4 py-3 uppercase">Artículo</th><th className="px-4 py-3 text-center uppercase">Cant</th><th className="px-4 py-3 text-right uppercase">Total</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {(selectedSale.desglose || []).flatMap((item: any, idx: number) =>
                          parseDescripcionItems(item.descripcion || '', item.total ?? item.precio_unitario ?? 0).map((parsed, pidx) => (
                            <tr key={`${idx}-${pidx}`}>
                              <td className="px-4 py-3 font-bold uppercase">{parsed.descripcion}</td>
                              <td className="px-4 py-3 text-center font-black">{parsed.cantidad}</td>
                              <td className="px-4 py-3 text-right font-black">{symbol}{parsed.total?.toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col gap-4 bg-muted/20 p-6">
                <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row">
                  <div className="flex w-full flex-col items-center gap-2 md:w-auto md:flex-row">
                    <div className="flex w-full items-center justify-center rounded-lg border border-border bg-background p-0.5 md:w-auto">
                      {([['single', 'Única'], ['dual', 'Dual']] as const).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => setPrintMode(m)}
                          className={cn('flex-1 rounded-md px-2 py-1 text-[9px] font-black uppercase transition-all md:flex-none', printMode === m ? 'bg-primary text-white' : 'text-slate-500')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="flex w-full items-center justify-center rounded-lg border border-border bg-background p-0.5 md:w-auto">
                      {([['auto', 'Auto'], ['usd', 'Solo USD'], ['dual', 'Bs + USD']] as const).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => setPrintCurrencyMode(m)}
                          className={cn('flex-1 rounded-md px-2 py-1 text-[9px] font-black uppercase transition-all md:flex-none', printCurrencyMode === m ? 'bg-primary text-white' : 'text-slate-500')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {printMode === 'single' && (
                      <div className="flex w-full items-center justify-center rounded-lg border border-border bg-background p-0.5 md:w-auto">
                        {([['left', 'Izq'], ['right', 'Der']] as const).map(([s, label]) => (
                          <button
                            key={s}
                            onClick={() => setPrintSide(s)}
                            className={cn('flex-1 rounded-md px-2 py-1 text-[9px] font-black uppercase transition-all md:flex-none', printSide === s ? 'bg-primary text-white' : 'text-slate-500')}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex w-full gap-2 md:w-auto">
                    <Button variant="outline" className="h-10 flex-1 rounded-xl px-6 font-bold md:flex-none" onClick={() => setShowSaleDetail(false)}>Cerrar</Button>
                    <Button
                      className="h-10 flex-[2] gap-2 rounded-xl bg-primary px-6 font-black uppercase tracking-widest text-white md:flex-none"
                      onClick={() => {
                        const bcvRate = selectedSale.tasa_cambio || rates.bcv;
                        const mp = selectedSale.metodos_pago || {};
                        const modo = printCurrencyMode === 'auto'
                          ? ((mp.pago_movil > 0 || mp.efectivo_ves > 0 || selectedSale.isCashea) ? 'dual' : 'usd')
                          : printCurrencyMode;
                        generateInvoicePDF([{
                          id: selectedSale.id,
                          venta_id: selectedSale.source === 'ia' ? null : selectedSale.id,
                          servicio_id: selectedSale.servicio_id || null,
                          fecha: new Date(selectedSale.created_at).toLocaleDateString(),
                          cliente: selectedSale.cliente,
                          items: selectedSale.desglose || [],
                          total: selectedSale.total_ingresos,
                          notas: selectedSale.notas,
                          tasa_bcv: bcvRate,
                          total_ves: selectedSale.total_ingresos * bcvRate,
                          iva_aplicado: selectedSale.con_iva,
                          metodos_pago: mp,
                        }], { mode: printMode, side: printSide, currencyMode: modo as any });
                      }}
                    >
                      <Download className="h-4 w-4" /> Descargar
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Selector de la segunda factura (impresión "Dif.") ───────────── */}
      {showSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[#e8eaed] bg-white shadow-2xl">
            <header className="flex items-center gap-2 border-b border-[#e8eaed] px-5 py-3.5">
              <Receipt className="h-4 w-4 text-[#f97316]" aria-hidden />
              <h3 className="flex-1 text-[14px] font-bold text-[#16181d]">Seleccionar otra factura</h3>
              <button onClick={() => setShowSelector(false)} aria-label="Cerrar" className="rounded-lg p-1.5 text-[#5b616e] hover:bg-[#f4f5f7]">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba1ab]" aria-hidden />
                <input
                  autoFocus
                  value={searchTermVenta}
                  onChange={e => setSearchTermVenta(e.target.value)}
                  placeholder="Buscar cliente..."
                  aria-label="Buscar factura por cliente"
                  className="h-[38px] w-full rounded-lg border border-[#e2e5ea] pl-9 pr-3 text-[12.5px] outline-none focus:border-[#f97316]"
                />
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {ventasRecientes
                  .filter(v => searchTermVenta === '' || (v.cliente || '').toLowerCase().includes(searchTermVenta.toLowerCase()))
                  .map(v => (
                    <button
                      key={v.id}
                      onClick={() => { setSecondVenta(v); setShowSelector(false); }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#eef0f3] px-3 py-2.5 text-left hover:border-[#e2e5ea] hover:bg-[#fafbfc]"
                    >
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[12.5px] font-semibold text-[#16181d]">{v.cliente || 'Consumidor Final'}</span>
                        <span className="num block text-[11px] text-[#9ba1ab]">{v.fecha}</span>
                      </span>
                      <span className="num shrink-0 text-[12.5px] font-bold text-[#f97316]">${Number(v.total_ingresos || 0).toFixed(2)}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </ErpShell>
  );
}
