const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'app/dashboard/servicios/page.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

const helperFunction = `
// Helper para formatear nombre de cliente y omitir "WHATSAPP" o "ADMIN IA"
const getDisplayName = (cita: any) => {
  const raw = cita.vehiculos?.clientes 
    ? \`\${cita.vehiculos.clientes.nombre} \${cita.vehiculos.clientes.apellido}\` 
    : cita.nombre_cliente;
  if (!raw) return 'NO DEFINIDO';
  const upper = raw.toUpperCase();
  if (upper.includes('WHATSAPP') || upper.includes('ADMIN IA')) return 'NO DEFINIDO';
  return raw;
};

export default function ServiciosPage() {`;

// Inject helper
content = content.replace('export default function ServiciosPage() {', helperFunction);

// Replace instances
const target1 = "`\${cita.vehiculos?.clientes.nombre} \${cita.vehiculos?.clientes.apellido}` : (cita.nombre_cliente || 'Cliente')";
content = content.replace("const clienteObj = cita.vehiculos?.clientes ? " + target1, "const clienteObj = getDisplayName(cita) || 'Cliente'");

const target2 = "`\${cita.vehiculos?.clientes.nombre} \${cita.vehiculos?.clientes.apellido}` : cita.nombre_cliente || 'CONSUMIDOR FINAL'";
content = content.replace("const clientName = cita.vehiculos?.clientes ? " + target2, "const clientName = getDisplayName(cita) || 'CONSUMIDOR FINAL'");

const target3 = "{cita.vehiculos?.clientes ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}` : cita.nombre_cliente}";
content = content.replace(target3, "{getDisplayName(cita)}"); // Card view
content = content.replace(target3, "{getDisplayName(cita)}"); // List view

const target4 = "? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}`";
const target5 = ": cita.nombre_cliente || 'CONSUMIDOR FINAL'";
// En la línea 1500 (estado inicial de setClientName)
// const [clientName, setClientName] = useState(cita.vehiculos?.clientes
//   ? `${cita.vehiculos?.clientes.nombre} ${cita.vehiculos?.clientes.apellido}`
//   : cita.nombre_cliente || 'CONSUMIDOR FINAL'
// );
content = content.replace(/const \[clientName, setClientName\] = useState\(cita\.vehiculos\?\.clientes[\s\S]*?\: cita\.nombre_cliente \|\| 'CONSUMIDOR FINAL'\s*\);/m, "const [clientName, setClientName] = useState(getDisplayName(cita) || 'CONSUMIDOR FINAL');");

// "Registrado por" highlight
const oldRegistradoPor = `        {/* Registrado por */}
        {cita.registrado_por && (
          <div className="pt-1">
            <p className="text-[9px] text-muted-foreground/50 font-medium">
              Registrado por: <span className="text-foreground/60">{cita.registrado_por}</span>
            </p>
          </div>
        )}`;

const newRegistradoPor = `        {/* Registrado por */}
        {cita.registrado_por && (
          <div className="pt-2 border-t border-white/5 mt-2">
            <div className="flex items-center gap-1.5 p-1.5 bg-primary/10 rounded-md border border-primary/20 w-fit">
              <User className="w-3 h-3 text-primary" />
              <p className="text-[10px] text-primary/80 font-bold uppercase tracking-wider">
                Registrado por: <span className="text-primary font-black ml-1">{cita.registrado_por}</span>
              </p>
            </div>
          </div>
        )}`;

content = content.replace(oldRegistradoPor, newRegistradoPor);

fs.writeFileSync(targetFile, content);
console.log('Servicios UI fixed');
