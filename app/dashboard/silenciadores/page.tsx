'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, Plus, Trash2, Receipt, Package, 
  Search, MapPin, CheckCircle, AlertCircle, Loader2,
  TrendingUp, Calendar, ArrowRight, Printer, UserPlus,
  ArrowDown, ChevronRight, X, CreditCard, Banknote, 
  Wallet, Sparkles, Filter, Eye, Download, History,
  FileText, Car, User, DollarSign, Info, Calculator,
  Coins, Smartphone, Repeat, RefreshCw
} from 'lucide-react';
import { supabase, updateInventarioStock } from '@/lib/supabase';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CartItem {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  precio_bs?: number;
  total: number;
  stock: number;
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
  
  // Modals
  const [showPreview, setShowPreview] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showSaleDetail, setShowSaleDetail] = useState(false);

  // Payment methods (Stored in USD)
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

  const { currentSede } = useSedeStore();
  const [rates, setRates] = useState({ bcv: 36.5 });

  // Stats
  const [ventasRecientes, setVentasRecientes] = useState<any[]>([]);

  const [searchTermVenta, setSearchTermVenta] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [secondVenta, setSecondVenta] = useState<any | null>(null);

  useEffect(() => {
    fetchData();
    fetchRates();
  }, [currentSede]);

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

      const { data: salesData } = await withSedeFilter(supabase.from('ventas_dia'))
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      setVentasRecientes(salesData || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (prod: any) => {
    const existing = cart.find(item => item.id === prod.id);
    if (existing) {
      if (existing.cantidad >= prod.stock) return alert("Stock insuficiente");
      setCart(cart.map(item => 
        item.id === prod.id 
          ? { ...item, cantidad: item.cantidad + 1, total: (item.cantidad + 1) * (prod.precio_usd || 0) }
          : item
      ));
    } else {
      setCart([...cart, {
        id: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        precio_unitario: prod.precio_usd || 0,
        precio_bs: prod.precio_bs || 0,
        total: prod.precio_usd || 0,
        stock: prod.stock
      }]);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const prod = productos.find(p => p.id === id);
        const newQty = Math.max(1, item.cantidad + delta);
        if (delta > 0 && prod && newQty > prod.stock) {
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

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal * (conIva ? 1.16 : 1);

  const totalPaid = Object.values(metodosPago).reduce((acc, val) => acc + val, 0);
  const balance = total - totalPaid;

  const handleFinalize = async () => {
    if (cart.length === 0) return alert("El carrito está vacío");
    if (Math.abs(balance) > 0.05 && balance > 0) return alert(`Aún falta pagar $${balance.toFixed(2)}`);
    if (!supabase) return;

    setProcessing(true);
    try {
      const { data: ventaDia, error: ventaError } = await withSedeFilter(supabase.from('ventas_dia'))
        .insert(withSedeInsert({
          fecha: new Date().toISOString().split('T')[0],
          cliente: clienteNombre || 'Consumidor Final',
          total_ingresos: subtotal,
          desglose: cart.map(item => ({
            descripcion: item.nombre,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            total: item.total
          })),
          metodos_pago: metodosPago,
          con_iva: conIva,
          tasa_cambio: rates.bcv,
          notas: `${notas}${vehiculoInfo ? ` | Vehículo: ${vehiculoInfo}` : ''}`,
          creado_por: 'Admin'
        }))
        .select()
        .single();

      if (ventaError) throw ventaError;

      for (const item of cart) {
        const newStock = Math.max(0, item.stock - item.cantidad);
        await updateInventarioStock(item.id, newStock);
      }

      const data1 = {
        id: ventaDia.id,
        fecha: new Date().toLocaleDateString(),
        cliente: clienteNombre || 'Consumidor Final',
        vehiculo: vehiculoInfo,
        items: cart.map(item => ({
          descripcion: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          total: item.total
        })),
        total: total,
        tasa_bcv: rates.bcv,
        iva_aplicado: conIva
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

      generateInvoicePDF(dataList, { mode: printMode, side: printSide });

      setCart([]);
      setClienteNombre('');
      setVehiculoInfo('');
      setNotas('');
      setMetodosPago({ efectivo_usd: 0, zelle: 0, pago_movil: 0, efectivo_ves: 0, punto_de_venta: 0, transferencia: 0, cashea: 0, otro: 0 });
      setShowPreview(false);
      fetchData();
      alert('¡Venta realizada con éxito!');
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
    if (balance <= 0) return;
    setMetodosPago(prev => ({ ...prev, [method]: Number(balance.toFixed(2)) }));
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-20 animate-in fade-in duration-500">
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="glass-card px-4 py-2 rounded-2xl border border-border/50 bg-background/40 shadow-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">En Carrito</p>
            <p className="text-xl font-black text-primary">{cart.length}</p>
          </div>
          <div className="glass-card px-4 py-2 rounded-2xl border border-border/50 bg-background/40 shadow-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Restante</p>
            <p className={cn("text-xl font-black transition-colors", balance > 0.01 ? "text-destructive" : "text-green-500")}>
              ${balance.toFixed(2)}
            </p>
          </div>
          <div className="hidden sm:block glass-card px-4 py-2 rounded-2xl border border-border/50 bg-background/40 shadow-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total</p>
            <p className="text-xl font-black text-foreground">${total.toFixed(2)}</p>
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
                <span className="text-sm font-black italic tracking-tight">${total.toFixed(2)}</span>
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-[calc(100vh-12rem)] mt-6">
        {/* LADO IZQUIERDO: PRODUCTOS */}
        <div className="xl:col-span-7 h-full flex flex-col">
          <Card className="flex-1 flex flex-col glass-panel border-border/50 bg-card/40 overflow-hidden shadow-xl rounded-[40px]">
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
                          <span className="text-[9px] font-black text-primary uppercase tracking-tight">Precio Divisas</span>
                          <span className="text-base font-black text-primary italic tracking-tighter">${prod.precio_usd || '0'}</span>
                       </div>
                       <div className="w-[1px] h-6 bg-border/40" />
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tight">Precio BCV (Bs)</span>
                          <span className="text-base font-black text-foreground/70 italic tracking-tighter">{prod.precio_bs || '0'} Bs.</span>
                       </div>
                    </div>
                  </div>
                </button>
            ))}
          </div>
        </CardContent>
      </Card>

          {/* Historial Dinámico Interactivo por Sede */}
          <Card className="glass-panel border-border/50 bg-card/20 rounded-3xl overflow-hidden shadow-sm mt-8 border-t-4 border-t-primary/20">
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
                          <Calendar className="w-3 h-3" /> {new Date(v.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] font-bold">•</span>
                        <span className="text-[10px] font-bold uppercase">{v.desglose?.length || 0} ITEMS</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                      <span className="text-base font-black text-primary italic tracking-tighter drop-shadow-sm">${v.total_ingresos?.toFixed(2)}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[8px] font-black h-4 px-1.5 border-primary/20 text-primary/70 uppercase bg-primary/5 group-hover:bg-primary group-hover:text-white transition-colors">
                          Ver Factura
                        </Badge>
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
            <Card className="glass-panel border-primary/20 bg-card/60 shadow-2xl rounded-[2.5rem] relative overflow-hidden flex flex-col min-h-[850px]">
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
                      <div key={item.id} className="p-4 flex items-center gap-4 group border-l-4 border-transparent hover:border-primary transition-all">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black uppercase truncate">{item.nombre}</p>
                          <p className="text-[10px] font-black text-muted-foreground italic mt-0.5">${item.precio_unitario} C/U</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center bg-background/60 rounded-xl border border-border/50 p-1">
                            <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-primary font-black">-</button>
                            <span className="w-8 text-center text-xs font-black">{item.cantidad}</span>
                            <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-primary font-black">+</button>
                          </div>
                          <p className="w-20 text-right text-sm font-black italic tracking-tighter">${item.total.toFixed(2)}</p>
                          <button onClick={() => removeFromCart(item.id)} className="text-destructive/40 hover:text-destructive transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>

              {/* PAGOS: MEJORADO CON DOBLE INPUT BS/USD */}
              <div className="px-8 py-6 space-y-6 border-t border-border/30 bg-background/50 backdrop-blur-md">
                <div className="flex items-center justify-between">
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                     <Calculator className="w-4 h-4" /> MÉTODOS DE PAGO
                   </h3>
                   <div className="text-right">
                      <p className="text-[9px] font-black text-muted-foreground uppercase">Por Cobrar</p>
                      <p className={cn("text-lg font-black italic", balance > 0.05 ? "text-destructive" : "text-green-500")}>
                        ${balance.toFixed(2)}
                      </p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                            value={metodosPago.pago_movil ? (metodosPago.pago_movil * rates.bcv).toFixed(2) : ''}
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
                            value={metodosPago.efectivo_ves ? (metodosPago.efectivo_ves * rates.bcv).toFixed(2) : ''}
                            onChange={e => handlePaymentChange('efectivo_ves', (parseFloat(e.target.value) / rates.bcv).toString())}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase text-muted-foreground">Equivalente en Dólares ($)</span>
                          <Input 
                            placeholder="$"
                            className="h-9 bg-background/50 text-xs font-black border-none"
                            value={metodosPago.efectivo_ves || ''}
                            onChange={e => handlePaymentChange('efectivo_ves', e.target.value)}
                          />
                        </div>
                      </div>
                   </div>
                </div>
              </div>

              {/* Totales y Finalización */}
              <div className="p-8 space-y-6 bg-gradient-to-t from-primary/10 to-transparent border-t border-border/30">
                <div className="flex items-end justify-between">
                  <div className="pl-4 border-l-4 border-primary">
                    <p className="text-[11px] text-primary font-black uppercase tracking-[0.3em] mb-2">TOTAL A PAGAR USD</p>
                    <span className="text-5xl font-black text-primary tracking-tighter italic">${total.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.15em] opacity-60">Total en Bolívares</p>
                    <p className="text-2xl font-black text-foreground tracking-tighter italic">{(total * rates.bcv).toLocaleString('es-VE')} Bs.</p>
                  </div>
                </div>

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

      {/* MODAL DE VISTA PREVIA */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl bg-card border-border/50 rounded-[2rem] p-0 overflow-hidden shadow-2xl">
          <div className="bg-primary/5 p-8 border-b border-border/30">
             <DialogTitle className="text-2xl font-black tracking-tighter flex items-center gap-3 uppercase italic">
               <FileText className="w-8 h-8 text-primary" /> RESUMEN DE FACTURACIÓN
             </DialogTitle>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CLIENTE / VEHÍCULO</p>
                <p className="text-sm font-black text-foreground uppercase">{clienteNombre || 'Consumidor Final'}</p>
                <p className="text-xs font-bold text-muted-foreground uppercase">{vehiculoInfo || 'S/D'}</p>
              </div>
              <div className="text-right space-y-1">
                <Badge className="bg-primary/20 text-primary border-none font-black text-[9px] mb-2">{currentSede?.nombre}</Badge>
                <p className="text-sm font-black text-foreground uppercase">{new Date().toLocaleDateString()}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 overflow-hidden">
               <table className="w-full text-left text-xs">
                 <thead className="bg-muted/50 border-b border-border/30 font-black uppercase text-muted-foreground">
                   <tr><th className="px-4 py-3">ITEM</th><th className="px-4 py-3 text-center">CANT</th><th className="px-4 py-3 text-right">TOTAL USD</th></tr>
                 </thead>
                 <tbody className="divide-y divide-border/20">
                   {cart.map((item, idx) => (
                     <tr key={idx} className="font-bold">
                       <td className="px-4 py-3 uppercase">{item.nombre}</td>
                       <td className="px-4 py-3 text-center font-black">{item.cantidad}</td>
                       <td className="px-4 py-3 text-right font-black">${item.total.toFixed(2)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>

            <div className="flex justify-between items-center py-4 border-t border-border/30">
               <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">TOTAL A COBRAR:</span>
               <span className="text-3xl font-black text-primary italic tracking-tighter">${total.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter className="p-8 bg-muted/20 flex flex-col gap-4">
             <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200">
                      <button 
                        onClick={() => setPrintMode('single')}
                        className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", printMode === 'single' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                      >
                        Única
                      </button>
                      <button 
                        onClick={() => setPrintMode('dual')}
                        className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", printMode === 'dual' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Dos copias de la misma factura"
                      >
                        Dual
                      </button>
                      <button 
                        onClick={() => {
                          setPrintMode('diferente');
                          if (!secondVenta) setShowSelector(true);
                        }}
                        className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", printMode === 'diferente' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                        title="Dos facturas diferentes"
                      >
                        Diferente
                      </button>
                    </div>

                  {printMode === 'single' && (
                    <div className="flex items-center bg-background rounded-lg p-0.5 border border-border">
                      <button 
                        onClick={() => setPrintSide('left')}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printSide === 'left' ? "bg-primary text-white" : "text-slate-500")}
                      >
                        Izq
                      </button>
                      <button 
                        onClick={() => setPrintSide('right')}
                        className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printSide === 'right' ? "bg-primary text-white" : "text-slate-500")}
                      >
                        Der
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-10 rounded-xl font-bold px-6" onClick={() => setShowPreview(false)}>VOLVER</Button>
                  <Button className="h-10 rounded-xl bg-primary text-white font-black uppercase tracking-widest gap-2 px-6" onClick={handleFinalize}>
                    <Printer className="w-4 h-4" /> CONFIRMAR Y REGISTRAR
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
                   <Receipt className="w-8 h-8 text-primary" /> FACTURA #{selectedSale.id?.slice(0, 8)}
                 </DialogTitle>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase">CLIENTE</p>
                    <p className="text-sm font-black uppercase">{selectedSale.cliente}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-black text-muted-foreground uppercase">MONTO</p>
                    <p className="text-2xl font-black text-primary">${selectedSale.total_ingresos?.toFixed(2)}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 overflow-hidden">
                   <table className="w-full text-left text-xs">
                     <thead className="bg-muted/50 border-b border-border/30 font-black">
                       <tr><th className="px-4 py-3 uppercase">ARTÍCULO</th><th className="px-4 py-3 text-center uppercase">CANT</th><th className="px-4 py-3 text-right uppercase">TOTAL</th></tr>
                     </thead>
                     <tbody className="divide-y divide-border/20">
                       {selectedSale.desglose?.map((item: any, idx: number) => (
                         <tr key={idx}><td className="px-4 py-3 uppercase font-bold">{item.descripcion}</td><td className="px-4 py-3 text-center font-black">{item.cantidad}</td><td className="px-4 py-3 text-right font-black">${item.total?.toFixed(2)}</td></tr>
                       ))}
                     </tbody>
                   </table>
                </div>
              </div>
              <DialogFooter className="p-8 bg-muted/20 flex flex-col gap-4">
                 <div className="flex items-center justify-between w-full">
                   <div className="flex items-center gap-2">
                     <div className="flex items-center bg-background rounded-lg p-0.5 border border-border">
                       <button 
                         onClick={() => setPrintMode('single')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printMode === 'single' ? "bg-primary text-white" : "text-slate-500")}
                       >
                         Única
                       </button>
                       <button 
                         onClick={() => setPrintMode('dual')}
                         className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printMode === 'dual' ? "bg-primary text-white" : "text-slate-500")}
                       >
                         Dual
                       </button>
                     </div>
                     {printMode === 'single' && (
                       <div className="flex items-center bg-background rounded-lg p-0.5 border border-border">
                         <button 
                           onClick={() => setPrintSide('left')}
                           className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printSide === 'left' ? "bg-primary text-white" : "text-slate-500")}
                         >
                           Izq
                         </button>
                         <button 
                           onClick={() => setPrintSide('right')}
                           className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all", printSide === 'right' ? "bg-primary text-white" : "text-slate-500")}
                         >
                           Der
                         </button>
                       </div>
                     )}
                   </div>
                   <div className="flex gap-2">
                     <Button variant="outline" className="h-10 rounded-xl font-bold px-6" onClick={() => setShowSaleDetail(false)}>CERRAR</Button>
                     <Button className="h-10 rounded-xl bg-primary text-white font-black uppercase tracking-widest gap-2 px-6" 
                       onClick={() => generateInvoicePDF([{
                         id: selectedSale.id,
                         fecha: new Date(selectedSale.created_at).toLocaleDateString(),
                         cliente: selectedSale.cliente,
                         items: selectedSale.desglose || [],
                         total: selectedSale.total_ingresos,
                         notas: selectedSale.notas,
                         tasa_bcv: selectedSale.tasa_cambio,
                         iva_aplicado: selectedSale.con_iva
                       }], { mode: printMode, side: printSide })}>
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
                      <p className="text-xs font-black text-orange-500 italic">${v.total_ingresos.toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
}
