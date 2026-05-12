'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  DollarSign, 
  ArrowRightLeft, 
  Percent, 
  CreditCard, 
  TrendingUp,
  Info,
  ChevronRight,
  ShieldCheck,
  Zap,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function CalculadoraPage() {
  // Currency State
  const [tasa, setTasa] = useState<number>(36.5);
  const [activeRate, setActiveRate] = useState<'bcv' | 'binance' | 'custom'>('bcv');
  const [rates, setRates] = useState<{ bcv: number; binance: number }>({ bcv: 36.5, binance: 40.2 });
  const [loadingRates, setLoadingRates] = useState(true);
  const [usdAmount, setUsdAmount] = useState<string>('');
  const [vesAmount, setVesAmount] = useState<string>('');

  // Cashea State
  const [casheaTotal, setCasheaTotal] = useState<string>('');
  const [casheaLevel, setCasheaLevel] = useState<number>(1); // 1 to 6
  const [casheaWithIva, setCasheaWithIva] = useState(false);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch(`/api/rates?t=${Date.now()}`);
        const data = await res.json();
        if (data.bcv && data.binance) {
          setRates({ bcv: data.bcv, binance: data.binance });
          setTasa(data.bcv);
        }
      } catch (e) {
        console.error('Error loading rates:', e);
      } finally {
        setLoadingRates(false);
      }
    };
    fetchRates();
  }, []);

  const handleRateSelect = (type: 'bcv' | 'binance' | 'custom') => {
    setActiveRate(type);
    if (type !== 'custom') {
      const newTasa = rates[type];
      setTasa(newTasa);
      // Recalculate VES if USD exists
      if (usdAmount) {
        setVesAmount((Number(usdAmount) * newTasa).toFixed(2));
      }
    }
  };

  const handleManualTasaChange = (val: number) => {
    setTasa(val);
    if (activeRate === 'custom') {
      if (usdAmount) {
        setVesAmount((Number(usdAmount) * val).toFixed(2));
      }
    }
  };

  // IVA State
  const [baseAmount, setBaseAmount] = useState<string>('');
  const [withIva, setWithIva] = useState(false);

  // Conversion Logic
  const handleUsdChange = (val: string) => {
    setUsdAmount(val);
    if (val && !isNaN(Number(val))) {
      setVesAmount((Number(val) * tasa).toFixed(2));
    } else {
      setVesAmount('');
    }
  };

  const handleVesChange = (val: string) => {
    setVesAmount(val);
    if (val && !isNaN(Number(val)) && tasa > 0) {
      setUsdAmount((Number(val) / tasa).toFixed(2));
    } else {
      setUsdAmount('');
    }
  };

  // Cashea Logic (6 levels, info from chatbot)
  const getCasheaInitial = () => {
    if (casheaLevel === 1) return 0.60;
    if (casheaLevel === 2) return 0.50;
    return 0.40; // Nivel 3 en adelante (hasta 6) es 40%
  };

  const calculateCashea = () => {
    let total = Number(casheaTotal) || 0;
    if (casheaWithIva) total = total * 1.16;
    
    const initialPct = getCasheaInitial();
    const initialAmount = total * initialPct;
    const remaining = total - initialAmount;
    const quoteAmount = remaining / 3;

    return {
      initialAmount,
      quoteAmount,
      remaining,
      total,
      ivaAmount: (Number(casheaTotal) || 0) * 0.16
    };
  };

  const casheaResult = calculateCashea();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="w-8 h-8 text-primary" /> Herramientas de Cálculo
        </h1>
        <p className="text-muted-foreground">Calculadora multi-moneda, cuotas Cashea y gestión de tasas BCV para Lycos Team.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ── Conversor de Divisas ──────────────────────── */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" /> Conversor de Divisas
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-6 w-6 rounded-full", loadingRates && "animate-spin")}
                  onClick={() => {
                    setLoadingRates(true);
                    fetch(`/api/rates?t=${Date.now()}`)
                      .then(r => r.json())
                      .then(data => {
                        if (data.bcv && data.binance) {
                          setRates({ bcv: data.bcv, binance: data.binance });
                          setTasa(activeRate === 'bcv' ? data.bcv : data.binance);
                        }
                      })
                      .catch(console.error)
                      .finally(() => setLoadingRates(false));
                  }}
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </CardTitle>
              <div className={cn(
                "flex items-center gap-2 px-2 py-1 rounded-lg border transition-all",
                activeRate === 'custom' ? "bg-primary/10 border-primary/40 ring-2 ring-primary/20" : "bg-muted/50 border-border/50"
              )}>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {activeRate === 'custom' ? 'Tasa Libre:' : 'Tasa Actual:'}
                </span>
                <input 
                  type="number" 
                  value={tasa} 
                  onChange={(e) => handleManualTasaChange(Number(e.target.value))}
                  disabled={activeRate !== 'custom'}
                  className={cn(
                    "w-12 bg-transparent text-xs font-bold focus:outline-none",
                    activeRate === 'custom' ? "text-primary" : "text-muted-foreground"
                  )}
                />
              </div>
            </div>
            <CardDescription>Conversión rápida entre Dólares y Bolívares.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 p-1 bg-muted/30 rounded-xl border border-border/50">
                <button
                  onClick={() => handleRateSelect('bcv')}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-[10px] font-bold transition-all",
                    activeRate === 'bcv' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  BCV: {rates.bcv.toFixed(2)}
                </button>
                <button
                  onClick={() => handleRateSelect('binance')}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-[10px] font-bold transition-all",
                    activeRate === 'binance' ? "bg-yellow-500 text-black shadow-lg" : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  BINANCE: {rates.binance.toFixed(2)}
                </button>
                <button
                  onClick={() => handleRateSelect('custom')}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-[10px] font-bold transition-all",
                    activeRate === 'custom' ? "bg-slate-700 text-white shadow-lg" : "text-muted-foreground hover:bg-white/5"
                  )}
                >
                  PERSONALIZADA
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monto en Dólares (USD)</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-bold">$</div>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={usdAmount}
                    onChange={(e) => handleUsdChange(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-border/50 bg-background/50 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-lg font-bold"
                  />
                </div>
              </div>
            </div>

              <div className="flex justify-center -my-2 relative z-10">
                <div className="p-2 rounded-full bg-card border border-border shadow-lg">
                  <ArrowRightLeft className="w-4 h-4 text-primary rotate-90" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monto en Bolívares (VES)</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Bs.</div>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={vesAmount}
                    onChange={(e) => handleVesChange(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-border/50 bg-background/50 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-lg font-bold"
                  />
                </div>
              </div>
          </CardContent>
        </Card>

        {/* ── Calculadora Cashea ────────────────────────── */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-violet-400">
                <Zap className="w-4 h-4" /> Calculadora Cashea
              </CardTitle>
              <div className="flex items-center gap-1 bg-violet-500/10 px-1 py-1 rounded-lg border border-violet-500/20 flex-wrap justify-end">
                {[1, 2, 3, 4, 5, 6].map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setCasheaLevel(lvl)}
                    className={cn(
                      "px-2 py-1 rounded text-[9px] font-black transition-all",
                      casheaLevel === lvl ? "bg-violet-500 text-white shadow-lg" : "text-violet-400 hover:bg-violet-500/20"
                    )}
                  >
                    L{lvl}
                  </button>
                ))}
              </div>
            </div>
            <CardDescription>Calcula cuotas y pago inicial según nivel de usuario.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Compra (Base $)</label>
                  <label className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={casheaWithIva}
                      onChange={e => setCasheaWithIva(e.target.checked)}
                      className="w-3 h-3 rounded border-violet-500/30 text-violet-500 focus:ring-violet-500/20"
                    />
                    <span className="text-[9px] font-bold text-muted-foreground group-hover:text-violet-400 transition-colors">SUMAR IVA (+16%)</span>
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 font-bold">$</div>
                  <input
                    type="number"
                    placeholder="Ej: 100"
                    value={casheaTotal}
                    onChange={(e) => setCasheaTotal(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-violet-500/20 bg-violet-500/5 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-lg font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <p className="text-[10px] text-violet-300 uppercase font-bold mb-1">Pago Inicial ({(getCasheaInitial() * 100)}%)</p>
                <p className="text-xl font-black text-violet-400">${casheaResult.initialAmount.toFixed(2)}</p>
                <p className="text-[9px] text-violet-300/50 mt-1">A pagar hoy en tienda</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">3 Cuotas de</p>
                <p className="text-xl font-black text-foreground">${casheaResult.quoteAmount.toFixed(2)}</p>
                <p className="text-[9px] text-muted-foreground/50 mt-1">Pagos quincenales</p>
              </div>
            </div>

            <div className="pt-2 border-t border-border/20">
              {casheaWithIva && (
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Monto IVA (16%):</span>
                  <span className="font-bold text-orange-400">+${casheaResult.ivaAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Monto Total Financiado:</span>
                <span className="font-bold text-violet-300">${casheaResult.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Calculadora de IVA ─────────────────────────── */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden md:col-span-2">
          <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-orange-400">
              <Percent className="w-4 h-4" /> Calculadora de Impuestos (IVA 16%)
            </CardTitle>
            <CardDescription>Añade o extrae el IVA del monto base rápidamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monto Base ($)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background/50 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-lg font-bold"
                />
              </div>

              <div className="flex flex-col gap-3">
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-between">
                   <div>
                     <p className="text-[10px] text-orange-300 uppercase font-bold">Monto IVA (16%)</p>
                     <p className="text-lg font-black text-orange-400">${(Number(baseAmount) * 0.16).toFixed(2)}</p>
                   </div>
                   <ShieldCheck className="w-6 h-6 text-orange-400/50" />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="p-4 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-between">
                   <div>
                     <p className="text-[10px] text-orange-100 uppercase font-bold">Total con IVA</p>
                     <p className="text-2xl font-black text-white">${(Number(baseAmount) * 1.16).toFixed(2)}</p>
                   </div>
                   <Zap className="w-6 h-6 text-orange-300/50" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Info Footer */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <p className="font-bold text-foreground mb-1">Información Importante:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Las tasas de conversión son referenciales. Asegúrate de verificar la tasa oficial del BCV.</li>
            <li>El cálculo de Cashea asume 3 cuotas quincenales/mensuales estándar. Los porcentajes de inicial varían según el nivel del cliente (L1: 40%, L2: 30%, L3: 20%).</li>
            <li>El IVA del 16% es el estándar vigente en Venezuela para servicios mecánicos y repuestos.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
