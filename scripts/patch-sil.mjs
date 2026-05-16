import { readFileSync, writeFileSync } from 'fs';

const path = 'app/dashboard/silenciadores/page.tsx';
let content = readFileSync(path, 'utf8');

// ─── 1. Replace cart item price display (the <p> total line) with editable input ───
// Find and replace the exact snippet for the cart item total price
const cartOld = `<p className="w-20 text-right text-sm font-black italic tracking-tighter">\${item.total.toFixed(2)}</p>
                           <button onClick={() => removeFromCart(item.id)} className="text-destructive/40 hover:text-destructive transition-colors">
                             <X className="w-4 h-4" />
                           </button>`;

const cartNew = `<div className="flex flex-col items-end gap-0.5">
                             <input
                               type="number" step="0.01" min="0"
                               title="Precio editable — útil para tubería o servicios variables"
                               className="w-20 text-right text-sm font-black italic tracking-tighter bg-transparent border-b border-dashed border-primary/40 focus:border-primary focus:outline-none text-primary pb-0.5"
                               value={item.precio_unitario}
                               onChange={e => updateCartItemPrice(item.id, parseFloat(e.target.value) || 0)}
                             />
                             <span className="text-[8px] text-muted-foreground font-bold opacity-50">USD c/u</span>
                           </div>
                           <button onClick={() => removeFromCart(item.id)} className="text-destructive/40 hover:text-destructive transition-colors">
                             <X className="w-4 h-4" />
                           </button>`;

if (content.includes('item.total.toFixed(2)')) {
  // Normalize the old pattern (handle both \n and \r\n)
  const normalized = content.replace(/\r\n/g, '\n');
  const hasOld = normalized.includes('item.total.toFixed(2)');
  console.log('Found item.total.toFixed:', hasOld);
  
  // Do replacement on normalized
  let fixed = normalized
    .replace(
      /\<p className="w-20 text-right text-sm font-black italic tracking-tighter"\>\$\{item\.total\.toFixed\(2\)\}<\/p>/g,
      `<div className="flex flex-col items-end gap-0.5">
                             <input
                               type="number" step="0.01" min="0"
                               title="Precio editable — útil para tubería o servicios variables"
                               className="w-20 text-right text-sm font-black italic tracking-tighter bg-transparent border-b border-dashed border-primary/40 focus:border-primary focus:outline-none text-primary pb-0.5"
                               value={item.precio_unitario}
                               onChange={e => updateCartItemPrice(item.id, parseFloat(e.target.value) || 0)}
                             />
                             <span className="text-[8px] text-muted-foreground font-bold opacity-50">USD c/u</span>
                           </div>`
    );

  // ─── 2. Replace the simple Cashea block with the full panel ───
  fixed = fixed.replace(
    /\{\/\* Cashea \*\/\}\s*<div className="space-y-1\.5 p-3 rounded-2xl bg-blue-600\/10 border border-blue-600\/20 col-span-full">[\s\S]*?<\/Input>\s*<\/div>/,
    `{/* ── Cashea Panel ── */}
                    <div className={\`space-y-3 p-4 rounded-2xl border col-span-full transition-all \${isCasheaActive ? 'bg-blue-600/10 border-blue-600/40 shadow-lg shadow-blue-600/10' : 'bg-blue-600/5 border-blue-600/10'}\`}>
                       <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-2">
                            <Smartphone className="w-4 h-4" /> Cashea
                          </Label>
                          <button
                            onClick={() => { setConIva(true); autoFillMethod('cashea'); }}
                            className="text-[8px] font-black text-blue-600 bg-white/50 px-2 py-0.5 rounded-lg border border-blue-600/20"
                          >USAR CASHEA (+16% IVA)</button>
                       </div>

                       {/* Porcentaje de inicial */}
                       <div className="flex items-center gap-2">
                         <span className="text-[9px] font-black text-blue-600/70 uppercase tracking-widest">Inicial:</span>
                         {([40, 50, 60] as const).map(pct => (
                           <button
                             key={pct}
                             onClick={() => { setCasheaPct(pct); setConIva(true); if (metodosPago.cashea === 0) autoFillMethod('cashea'); }}
                             className={\`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all border \${casheaPct === pct && isCasheaActive ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white/40 text-blue-600 border-blue-600/20 hover:bg-blue-600/10'}\`}
                           >{pct}%</button>
                         ))}
                       </div>

                       {/* Desglose en tiempo real */}
                       {isCasheaActive && total > 0 && (
                         <div className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-white/60 border border-blue-600/10">
                           <div className="col-span-4 flex justify-between text-[9px] font-black text-blue-700 border-b border-blue-600/10 pb-1.5 mb-1">
                             <span>BASE BCV (sin IVA)</span><span>\${subtotal.toFixed(2)}</span>
                           </div>
                           <div className="col-span-4 flex justify-between text-[9px] font-black text-orange-500">
                             <span>IVA 16%</span><span>+\${(total - subtotal).toFixed(2)}</span>
                           </div>
                           <div className="col-span-4 flex justify-between text-[10px] font-black text-blue-800 border-t border-blue-600/10 pt-1.5 mt-0.5">
                             <span>TOTAL CASHEA</span><span>\${total.toFixed(2)}</span>
                           </div>
                           <div className="col-span-4 grid grid-cols-4 gap-1.5 mt-1">
                             <div className="col-span-2 bg-blue-600 text-white p-2 rounded-xl text-center">
                               <p className="text-[8px] font-bold opacity-80">INICIAL ({casheaPct}%)</p>
                               <p className="text-sm font-black">\${casheaInicial.toFixed(2)}</p>
                             </div>
                             <div className="col-span-2 bg-blue-600/10 text-blue-700 p-2 rounded-xl">
                               <p className="text-[8px] font-bold">RESTO (3 cuotas)</p>
                               <p className="text-xs font-black">\${casheaResto.toFixed(2)}</p>
                               <p className="text-[8px] opacity-70">\${casheaCuota.toFixed(2)}/cuota</p>
                             </div>
                           </div>
                         </div>
                       )}

                       <Input
                         placeholder="Monto $ total Cashea"
                         className="h-10 bg-white/60 text-sm font-black border-blue-600/20 text-blue-700"
                         value={metodosPago.cashea || ''}
                         onChange={e => handlePaymentChange('cashea', e.target.value)}
                       />
                    </div>`
  );

  writeFileSync(path, fixed, 'utf8');
  console.log('File updated successfully');
} else {
  console.log('Target text NOT found - checking actual content...');
  const idx = content.indexOf('item.total.toFixed');
  console.log('toFixed index:', idx);
  if (idx > 0) {
    console.log('Context:', JSON.stringify(content.substring(idx - 50, idx + 100)));
  }
}
