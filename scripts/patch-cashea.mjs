import { readFileSync, writeFileSync } from 'fs';

const path = 'app/dashboard/silenciadores/page.tsx';
let content = readFileSync(path, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

const casheaStart = '{/* Cashea */}';
const startIdx = content.indexOf(casheaStart);

if (startIdx === -1) {
  console.log('Could not find Cashea comment');
  process.exit(1);
}

// Find the closing </div> of the Cashea block by scanning ahead
// The Cashea block starts with {/* Cashea */} and contains one <div>...</div>
let depth = 0;
let i = startIdx + casheaStart.length;
let divStart = -1;
let divEnd = -1;

while (i < content.length) {
  if (content.substring(i, i + 4) === '<div') { 
    if (depth === 0) divStart = i;
    depth++;
  } else if (content.substring(i, i + 6) === '</div>') {
    depth--;
    if (depth === 0) {
      divEnd = i + 6;
      break;
    }
  }
  i++;
}

console.log(`Found Cashea block: [${startIdx}, ${divEnd}]`);
console.log('Old block:', JSON.stringify(content.substring(startIdx, Math.min(startIdx+100, divEnd))));

const newPanel = `{/* ── Cashea Panel ── */}
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

                       {/* Porcentaje de inicial: 40%, 50%, 60% */}
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
                    </div>`;

content = content.substring(0, startIdx) + newPanel + content.substring(divEnd);
writeFileSync(path, content, 'utf8');
console.log('Cashea panel replaced successfully. File size:', content.length);
