const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/dashboard/taller/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states
const statesToInject = `
  const [encargados, setEncargados] = useState<{nombre: string, rol: string}[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffSuggestions, setStaffSuggestions] = useState<{nombre: string, rol: string}[]>([]);
  const [showStaffResults, setShowStaffResults] = useState(false);
`;
content = content.replace("  const [costoEstimado, setCostoEstimado] = useState('');", "  const [costoEstimado, setCostoEstimado] = useState('');\n" + statesToInject);

// 2. Add fetchStaff
const fetchStaffFunc = `
  const fetchStaff = useCallback(async () => {
    if (!supabase) return;
    const { data } = await withSedeFilter(supabase.from('usuarios'))
      .select('nombre, rol')
      .in('rol', ['mecanico', 'mecanico_acceso', 'jefe_taller', 'jefe_taller_acceso', 'admin', 'empleado']);
    if (data) setStaffSuggestions(data);
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
`;
content = content.replace("  useEffect(() => { fetchCustomTypes(); }, [fetchCustomTypes]);", "  useEffect(() => { fetchCustomTypes(); }, [fetchCustomTypes]);\n" + fetchStaffFunc);

// 3. Update handleRegister logic
const handleRegStart = `
      // 1. Manage staff
      const newEncargadosPromises = encargados.map(async (e) => {
        const exists = staffSuggestions.some(s => s.nombre.toLowerCase() === e.nombre.toLowerCase());
        if (!exists) {
          const { currentSede } = useSedeStore.getState();
          const timestamp = Date.now();
          const username = \`\${e.nombre.replace(/\\s+/g, '_').toLowerCase()}_\${timestamp}\`;
          
          await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: e.nombre,
              email: \`\${username}@lycosteam.internal\`,
              password_hash: 'NO_ACCESS_STAFF',
              rol: e.rol,
              activo: false,
              sede_id: currentSede?.id || ''
            })
          });
        }
      });
      await Promise.all(newEncargadosPromises);

      // 2. Create client if needed
`;
content = content.replace("// 1. Create client if needed", handleRegStart);

// Update payload
const payloadBlockOld = `
        seguimiento: [{
          fecha: now.toISOString(),
          accion: 'Registrado desde Taller',
          usuario: user?.nombre || 'Admin',
          tipo: 'sistema',
          progreso: 0,
        }],
      };
`;
const payloadBlockNew = `
        notas: encargados.length > 0 
          ? \`Encargados: \${encargados.map(e => \`\${e.nombre} (\${e.rol === 'jefe_taller' ? 'Jefe' : 'Mecánico'})\`).join(', ')}\`
          : '',
        seguimiento: [
          {
            fecha: now.toISOString(),
            accion: 'Registrado desde Taller',
            usuario: user?.nombre || 'Admin',
            tipo: 'sistema',
            progreso: 0,
          },
          ...encargados.map(e => ({
            fecha: now.toISOString(),
            accion: \`Encargado asignado: \${e.nombre} (\${e.rol === 'jefe_taller' ? 'Jefe de Taller' : 'Mecánico'})\`,
            usuario: user?.nombre || 'Admin',
            tipo: 'sistema'
          }))
        ],
      };
`;
content = content.replace(payloadBlockOld, payloadBlockNew);

// Add clear encargados to Reset form
content = content.replace("setDescripcion(''); setTipo('mecanica'); setTipoPersonalizado(''); setCostoEstimado('');", "setDescripcion(''); setTipo('mecanica'); setTipoPersonalizado(''); setCostoEstimado(''); setEncargados([]); setStaffSearch('');");

// 4. Update Form UI
const labelOld = `className="text-xs font-semibold text-muted-foreground flex items-center gap-1"`;
const labelNew = `className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center gap-1"`;
content = content.replace(new RegExp(labelOld, 'g'), labelNew);

const labelOld2 = `className="text-xs font-semibold text-muted-foreground"`;
const labelNew2 = `className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center gap-1"`;
content = content.replace(new RegExp(labelOld2, 'g'), labelNew2);

const inputOld = `className="w-full bg-background/50 border border-border/50 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"`;
const inputNew = `className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pl-8"`;
content = content.replace(new RegExp(inputOld, 'g'), inputNew);

const inputOld2 = `className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"`;
const inputNew2 = `className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"`;
content = content.replace(new RegExp(inputOld2, 'g'), inputNew2);

const inputOldUpper = `className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary"`;
const inputNewUpper = `className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground uppercase font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"`;
content = content.replace(new RegExp(inputOldUpper, 'g'), inputNewUpper);

const textareaOld = `className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"`;
const textareaNew = `className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"`;
content = content.replace(new RegExp(textareaOld, 'g'), textareaNew);

// 5. Inject Encargados block before submit button
const encargadosUI = \`
              {/* Encargados */}
              <div className="space-y-1.5 pt-2 border-t border-border/30">
                <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1 mb-1.5 flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Personal a Cargo
                </label>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  {encargados.map((e, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-muted/30 border border-border pl-3 pr-1 py-1 rounded-xl group animate-in zoom-in-95 duration-200">
                      <span className="text-[11px] font-bold text-foreground">{e.nombre}</span>
                      <button 
                        type="button"
                        onClick={() => {
                          const next = [...encargados];
                          next[idx].rol = e.rol === 'jefe_taller' ? 'mecanico' : 'jefe_taller';
                          setEncargados(next);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all",
                          e.rol === 'jefe_taller' ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                        )}
                      >
                        {e.rol === 'jefe_taller' ? 'Jefe' : 'Mecánico'}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setEncargados(encargados.filter((_, i) => i !== idx))}
                        className="w-6 h-6 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input 
                    className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="Buscar o agregar encargado..."
                    value={staffSearch}
                    onChange={e => {
                      setStaffSearch(e.target.value);
                      setShowStaffResults(true);
                    }}
                    onFocus={() => setShowStaffResults(true)}
                    onBlur={() => setTimeout(() => setShowStaffResults(false), 200)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && staffSearch.trim()) {
                        e.preventDefault();
                        if (!encargados.some(enc => enc.nombre === staffSearch.trim())) {
                          setEncargados([...encargados, { nombre: staffSearch.trim(), rol: 'mecanico' }]);
                        }
                        setStaffSearch('');
                      }
                    }}
                  />
                  {showStaffResults && staffSuggestions.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto">
                      {staffSuggestions
                        .filter(s => s.nombre.toLowerCase().includes(staffSearch.toLowerCase()) && !encargados.some(e => e.nombre === s.nombre))
                        .map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 transition-colors flex items-center gap-2"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEncargados([...encargados, { nombre: s.nombre, rol: 'mecanico' }]);
                              setStaffSearch('');
                              setShowStaffResults(false);
                            }}
                          >
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="font-medium">{s.nombre}</span>
                            <span className="text-[9px] text-muted-foreground/60 uppercase ml-auto">{s.rol.replace('_', ' ')}</span>
                          </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
\n`;

content = content.replace("{can('taller', 'crear') && (", encargadosUI + "              {can('taller', 'crear') && (");

// import useSedeStore
if (!content.includes('useSedeStore')) {
  content = content.replace("import { useAppStore } from '@/lib/store';", "import { useAppStore } from '@/lib/store';\nimport { useSedeStore } from '@/lib/store/useSedeStore';");
}

fs.writeFileSync(filePath, content);
console.log('Taller form updated');
