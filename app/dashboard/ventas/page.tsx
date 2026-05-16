'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingCart, Plus, Trash2, Receipt, Package, 
  Search, MapPin, CheckCircle, AlertCircle, Loader2,
  TrendingUp, Calendar, ArrowRight, Printer, UserPlus, X
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
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CartItem {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
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

  const { currentSede } = useSedeStore();
  const [rates, setRates] = useState({ bcv: 0 });

  useEffect(() => {
    fetchData();
    fetchRates();
  }, [currentSede]);

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
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
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
    if (cart.length === 0) return alert("El carrito está vacío");
    if (!supabase) return;

    if (!confirm(`¿Finalizar venta por $${Number(total).toFixed(2)}?`)) return;

    setProcessing(true);
    try {
      // 1. Register in ventas_dia (Accounting)
      const { data: ventaDia, error: ventaError } = await withSedeFilter(supabase.from('ventas_dia'))
        .insert(withSedeInsert({
          fecha: format(selectedDate, 'yyyy-MM-dd'),
          cliente: clienteNombre || 'Consumidor Final',
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
          notas: `${notas}${vehiculoInfo ? ` | Vehículo: ${vehiculoInfo}` : ''}`,
          creado_por: 'Admin'
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
      const data1 = {
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
        total: total,
        pago_usd: metodosPago.efectivo_usd + metodosPago.zelle,
        pago_ves: metodosPago.pago_movil + metodosPago.efectivo_ves,
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

      // 5. Success and Reset
      alert('¡Venta realizada con éxito! Stock actualizado y comprobante generado.');
      setCart([]);
      setClienteNombre('');
      setVehiculoInfo('');
      setNotas('');
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

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 rounded-xl border-primary/30 text-primary font-bold gap-2"
                  onClick={() => {
                    if (cart.length === 0) return;
                    generateInvoicePDF([{
                      fecha: new Date().toLocaleDateString(),
                      cliente: clienteNombre,
                      vehiculo: vehiculoInfo,
                      items: cart.map(i => ({ descripcion: i.nombre, cantidad: i.cantidad, precio_unitario: i.precio_unitario, total: i.total })),
                      total: total,
                      tasa_bcv: rates.bcv,
                      iva_aplicado: conIva
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
              </div>
            </div>
          </Card>
        </div>
      </div>

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
    </div>
  );
}
