// ── CierreWizard Component ─────────────────────────────────────
function CierreWizard({ ventas, onClose, onSaved }: {
  ventas: VentaDia[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = React.useState(1);
  const [periodo, setPeriodo] = React.useState<'dia' | 'mes'>('dia');
  const [fechaDia, setFechaDia] = React.useState(new Date().toISOString().split('T')[0]);
  const [fechaInicio, setFechaInicio] = React.useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = React.useState(new Date().toISOString().split('T')[0]);
  const [notasCierre, setNotasCierre] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [tasaBCV, setTasaBCV] = React.useState(0);
  const [inventario, setInventario] = React.useState<any[]>([]);
  const [userName, setUserName] = React.useState('Admin');

  React.useEffect(() => {
    fetch('/api/rates').then(r => r.json()).then(d => setTasaBCV(d.bcv || 0)).catch(() => {});
    if (supabase) {
      withSedeFilter(supabase.from('inventario')).select('*').eq('activo', true)
        .then(({ data }) => setInventario(data || []));
    }
  }, []);

  const ventasFiltradas = React.useMemo(() => {
    if (periodo === 'dia') return ventas.filter(v => v.fecha === fechaDia);
    return ventas.filter(v => v.fecha >= fechaInicio && v.fecha <= fechaFin);
  }, [ventas, periodo, fechaDia, fechaInicio, fechaFin]);

  const totalUSD = ventasFiltradas.reduce((s, v) => s + Number(v.total_ingresos), 0);
  const totalBS = totalUSD * (tasaBCV || 1);
  const totalClientes = ventasFiltradas.reduce((s, v) => s + Number(v.total_clientes || 0), 0);

  const desglosePagos = React.useMemo(() => {
    const agg: Record<string, number> = {};
    ventasFiltradas.forEach(v => {
      const mp = (v as any).metodos_pago || {};
      Object.entries(mp).forEach(([k, val]) => {
        if (typeof val === 'number' && val > 0) agg[k] = (agg[k] || 0) + val;
      });
    });
    return {
      efectivo_usd: agg.efectivo_usd,
      zelle: agg.zelle,
      pago_movil_bs: agg.pago_movil,
      efectivo_bs: agg.efectivo_ves,
      transferencia_bs: agg.transferencia,
      cashea_usd: agg.cashea_usd || agg.cashea,
      cashea_bs: agg.cashea_ves,
      binance_usdt: agg.binance,
      punto_venta_usd: agg.punto_de_venta_usd,
      punto_venta_bs: agg.punto_de_venta_ves || agg.punto_de_venta,
      otro: agg.otro,
    };
  }, [ventasFiltradas]);

  const handleGenerate = async () => {
    setSaving(true);
    try {
      const cierreData: CierreData = {
        sede_nombre: 'Lycos Team',
        periodo,
        fecha: periodo === 'dia'
          ? new Date(fechaDia + 'T12:00:00').toLocaleDateString('es-VE')
          : new Date(fechaInicio + 'T12:00:00').toLocaleDateString('es-VE'),
        fecha_inicio: periodo === 'mes' ? fechaInicio.split('-').reverse().join('/') : undefined,
        fecha_fin: periodo === 'mes' ? fechaFin.split('-').reverse().join('/') : undefined,
        total_ingresos_usd: totalUSD,
        total_bs: totalBS,
        tasa_bcv: tasaBCV,
        total_clientes: totalClientes,
        total_ventas: ventasFiltradas.length,
        desglose_pagos: desglosePagos,
        ventas: ventasFiltradas.map(v => ({
          fecha: new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-VE'),
          cliente: v.cliente || 'Cons. Final',
          descripcion: (v.desglose || []).map((d: any) => d.descripcion).join(', ') || (v.notas || '').slice(0, 40) || 'Servicio',
          metodo_pago: (v as any).metodo_pago || 'Varios',
          total_usd: Number(v.total_ingresos),
          total_bs: Number(v.total_ingresos) * (tasaBCV || 1),
          fuente: (v.creado_por || '').toLowerCase().includes('ia') ? 'ia' as const : 'pos' as const,
        })),
        inventario: inventario.map(p => ({
          nombre: p.nombre,
          stock: p.stock,
          precio_usd: p.precio_usd || p.precio_promo || 0,
          precio_bs: p.precio_bs || 0,
        })),
        notas: notasCierre,
        generado_por: userName,
        generado_en: new Date().toLocaleString('es-VE'),
      };

      if (supabase) {
        await (supabase.from('cierres_caja') as any).insert({
          fecha: fechaDia || fechaInicio,
          periodo,
          fecha_inicio: periodo === 'mes' ? fechaInicio : null,
          fecha_fin: periodo === 'mes' ? fechaFin : null,
          total_ingresos_usd: totalUSD,
          total_bs: totalBS,
          tasa_bcv: tasaBCV,
          total_clientes: totalClientes,
          total_ventas: ventasFiltradas.length,
          desglose_pagos: desglosePagos,
          ventas_dia_ids: ventasFiltradas.map(v => v.id),
          inventario_snapshot: inventario,
          notas: notasCierre,
          generado_por: userName,
        });
      }

      generateCierrePDF(cierreData);
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Error al generar cierre. Ver consola.');
    }
    setSaving(false);
  };

  const stepLabels = ['Período', 'Ventas', 'Métricas', 'Opciones', 'Exportar'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 bg-gradient-to-r from-orange-600/10 to-transparent">
          <div>
            <h2 className="text-sm font-black text-orange-500 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-4 h-4" /> Cierre de Caja — Lycos Team
            </h2>
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {stepLabels.map((s, i) => (
                <React.Fragment key={i}>
                  <button
                    onClick={() => i < step - 1 && setStep(i + 1)}
                    className={cn(
                      "flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full transition-all",
                      step === i + 1 ? "bg-orange-600 text-white" :
                      step > i + 1 ? "bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30" :
                      "bg-muted/30 text-muted-foreground"
                    )}
                  >
                    {step > i + 1 ? '✓' : (i + 1) + '.'} {s}
                  </button>
                  {i < 4 && <span className="text-muted-foreground/40 text-[8px]">›</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Step 1: Período */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Selecciona el tipo de cierre y el período a reportar.</p>
              <div className="flex gap-3">
                {(['dia', 'mes'] as const).map(p => (
                  <button key={p} onClick={() => setPeriodo(p)}
                    className={cn("flex-1 p-4 rounded-2xl border-2 text-sm font-black uppercase transition-all",
                      periodo === p ? "border-orange-500 bg-orange-600/10 text-orange-500" :
                      "border-border text-muted-foreground hover:border-orange-500/40")}>
                    {p === 'dia' ? '📅 Por Día' : '📆 Por Mes'}
                  </button>
                ))}
              </div>

              {periodo === 'dia' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fecha del cierre</label>
                  <input type="date" value={fechaDia} onChange={e => setFechaDia(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fecha inicio</label>
                    <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fecha fin</label>
                    <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Elaborado por</label>
                <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
                  placeholder="Nombre del responsable"
                  className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
              </div>
            </div>
          )}

          {/* Step 2: Ventas incluidas */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-600/5 border border-orange-600/20">
                <p className="text-xs text-muted-foreground">
                  Ventas en el período: <strong className="text-foreground">{ventasFiltradas.length}</strong>
                </p>
                <span className="text-xs font-black text-orange-500">${totalUSD.toFixed(2)} USD</span>
              </div>

              {ventasFiltradas.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border border-dashed border-border/40">
                  <p className="text-sm text-muted-foreground">No hay ventas para el período seleccionado</p>
                  <button onClick={() => setStep(1)} className="text-xs text-orange-500 mt-2 underline">← Cambiar período</button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                  {ventasFiltradas.map((v, i) => (
                    <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-border/20 hover:border-border/40 transition-all">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-orange-600/10 text-orange-500 text-[9px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</div>
                        <div>
                          <p className="text-xs font-bold">{v.cliente || 'Cons. Final'}</p>
                          <p className="text-[9px] text-muted-foreground">{v.fecha} · {v.total_servicios || 1} serv. · {v.total_clientes || 1} cliente(s)</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-green-400">${Number(v.total_ingresos).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Métricas */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: 'Total USD', value: '$' + Number(totalUSD).toFixed(2), color: 'text-green-400', bg: 'bg-green-500/10' },
                  { label: 'Total Bs.', value: Number(totalBS).toLocaleString('es-VE', {maximumFractionDigits: 0}) + ' Bs', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Clientes', value: String(totalClientes), color: 'text-purple-400', bg: 'bg-purple-500/10' },
                  { label: 'Ventas', value: String(ventasFiltradas.length), color: 'text-orange-400', bg: 'bg-orange-500/10' },
                ] as { label: string; value: string; color: string; bg: string }[]).map(k => (
                  <div key={k.label} className={'p-4 rounded-2xl border border-border/30 ' + k.bg}>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{k.label}</p>
                    <p className={'text-xl font-black mt-1 ' + k.color}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-background/50 border border-border/30 space-y-2">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Métodos de pago detectados</p>
                {Object.entries(desglosePagos).filter(([, v]) => v && Number(v) > 0).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="font-black">
                      {(k.includes('bs') || k === 'pago_movil_bs')
                        ? Number(v).toLocaleString('es-VE', {maximumFractionDigits: 0}) + ' Bs'
                        : '$' + Number(v).toFixed(2)}
                    </span>
                  </div>
                ))}
                {Object.values(desglosePagos).every(v => !v || Number(v) === 0) && (
                  <p className="text-xs text-muted-foreground italic">Sin desglose de pagos en los cierres del período</p>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-600/10 border border-orange-600/20">
                <span className="text-xs font-black text-orange-500 uppercase tracking-widest">Tasa BCV</span>
                <span className="text-sm font-black text-orange-500">{Number(tasaBCV).toFixed(2)} Bs/$</span>
              </div>
            </div>
          )}

          {/* Step 4: Opciones */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Notas / Observaciones del cierre</label>
                <textarea value={notasCierre} onChange={e => setNotasCierre(e.target.value)} rows={4}
                  placeholder="Ej: Caja cuadrada. Efectivo verificado. Sin pendientes..."
                  className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background/50 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-muted-foreground" />
              </div>

              <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/20 space-y-1.5">
                <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-1">El cierre PDF incluirá:</p>
                {[
                  '📊 KPIs: Ingresos USD y Bs., Clientes, Ventas',
                  '💳 Desglose detallado por método de pago',
                  '🧾 Tabla completa de ventas del período',
                  '📦 Snapshot actual del inventario de silenciadores',
                  '✍️ Líneas de firma: Elaborado / Autorizado',
                ].map((item, i) => (
                  <p key={i} className="text-[9px] text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Exportar */}
          {step === 5 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-20 h-20 rounded-3xl bg-orange-600/10 border-2 border-orange-600/30 flex items-center justify-center mx-auto">
                <FileText className="w-10 h-10 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-black">¡Todo listo!</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Se generará el PDF y se guardará en el historial de cierres de la base de datos.
                </p>
              </div>
              <div className="text-left p-4 rounded-2xl bg-background/60 border border-border/30 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Tipo</span><span className="font-bold capitalize">{periodo === 'dia' ? 'Cierre Diario' : 'Cierre Mensual'}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Período</span><span className="font-bold">{periodo === 'dia' ? fechaDia : fechaInicio + ' → ' + fechaFin}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Ventas incluidas</span><span className="font-bold">{ventasFiltradas.length}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total USD</span><span className="font-black text-orange-500">${Number(totalUSD).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Bs.</span><span className="font-black text-blue-400">{Number(totalBS).toLocaleString('es-VE', {maximumFractionDigits: 0})} Bs</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Elaborado por</span><span className="font-bold">{userName}</span></div>
              </div>
              <Button onClick={handleGenerate} disabled={saving}
                className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white font-black h-12 text-sm">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF...</>
                  : <><Download className="w-4 h-4" /> Generar y Descargar PDF</>}
              </Button>
              <p className="text-[9px] text-muted-foreground">El cierre queda registrado en la BD para tu historial.</p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between p-4 border-t border-border/30 bg-muted/10">
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30">
            {step === 1 ? 'Cancelar' : '← Atrás'}
          </button>
          <div className="text-[9px] text-muted-foreground font-bold">Paso {step} de 5</div>
          {step < 5 && (
            <Button onClick={() => setStep(step + 1)}
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white font-black px-6">
              Siguiente →
            </Button>
          )}
          {step === 5 && (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all border border-border/30">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

