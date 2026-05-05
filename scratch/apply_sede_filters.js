const fs = require('fs');
const path = require('path');

const TABLES_WITH_SEDE = [
  'inventario', 'inventarios', 'productos', 'stock', 
  'clientes', 'vehiculos', 'servicios', 'citas',
  'ventas_silenciadores', 'ventas_dia', 'egresos',
  'conversaciones', 'mensajes_whatsapp', 'activity_log', 'logs_actividad'
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Add import if not present and if the file uses supabase
  if (content.includes('supabase') && !content.includes('withSedeFilter')) {
    const importStatement = "import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';\n";
    // Find last import
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfLine = content.indexOf('\n', lastImportIndex);
      content = content.slice(0, endOfLine + 1) + importStatement + content.slice(endOfLine + 1);
    } else {
      content = importStatement + content;
    }
  }

  // Replace supabase.from('table') with withSedeFilter(supabase.from('table'))
  TABLES_WITH_SEDE.forEach(table => {
    // Regex to match supabase.from('table') or supabase!.from('table')
    const regex1 = new RegExp(`supabase(!?)\\.from\\(['"\`]${table}['"\`]\\)`, 'g');
    content = content.replace(regex1, `withSedeFilter(supabase$1.from('${table}'))`);
    
    const regex2 = new RegExp(`supabase\\?\\.from\\(['"\`]${table}['"\`]\\)`, 'g');
    content = content.replace(regex2, `withSedeFilter(supabase?.from('${table}'))`);
  });

  // Replace .insert({ ... }) with .insert(withSedeInsert({ ... }))
  // We only replace if we know it's a simple object or array
  // This is tricky with regex, let's just do specific replacements for common patterns
  content = content.replace(/\.insert\(\s*\{([\s\S]*?)\}\s*\)/g, (match, p1) => {
    if (match.includes('withSedeInsert')) return match;
    return `.insert(withSedeInsert({${p1}}))`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

const targetDir = path.join(__dirname, '../app/dashboard');
walkDir(targetDir);
console.log('Done applying filters.');
