const fs = require('fs');
const code = fs.readFileSync('app/dashboard/reportes/page.tsx', 'utf8');
const lines = code.split('\n');

let start = lines.findIndex(l => l.includes('{v.total_servicios}'));
while(!lines[start].includes('<td')) start--;

const end = lines.findIndex(l => l.includes('Total período'));

const newLines = `                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              {v.total_servicios}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm">{v.total_clientes}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[160px] truncate">
                            {v.notas ? v.notas.replace(/\\[FACTURA_IA_START\\][\\s\\S]*?\\[FACTURA_IA_END\\]/g, '').trim() || '—' : '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {v.imagen_url ? (
                              <span className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full inline-flex w-fit">
                                <Camera className="w-3 h-3" /> IA
                              </span>
                            ) : v.notas && v.notas.includes('[FACTURA_IA_START]') ? (
                               <button 
                                onClick={() => {
                                  const text = v.notas?.match(/\\[FACTURA_IA_START\\]\\n([\\s\\S]*?)\\n\\[FACTURA_IA_END\\]/)?.[1];
                                  if (text) setPreviewInvoice(text);
                                }}
                                className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full hover:bg-violet-500/20 transition-colors w-fit"
                               >
                                 <FileText className="w-3 h-3" /> Ver Factura
                               </button>
                            ) : (
                               <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full inline-flex w-fit">
                                 <Eye className="w-3 h-3" /> Manual
                               </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setEditando(v); setShowManual(true); }}
                                className="w-7 h-7 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(v.id)}
                                disabled={deleting === v.id}
                                className="w-7 h-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                                title="Eliminar"
                              >
                                {deleting === v.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/30 bg-muted/10">`;

lines.splice(start, end - start, ...newLines.split('\n'));
fs.writeFileSync('app/dashboard/reportes/page.tsx', lines.join('\n'));
console.log("Done fixing the table elements");
