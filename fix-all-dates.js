const fs = require('fs');
const path = require('path');

function processFile(filePath, regexes) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  for (let { search, replace } of regexes) {
    content = content.replace(search, replace);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

// silenciadores
processFile(path.join(__dirname, 'app/dashboard/silenciadores/page.tsx'), [
  {
    search: /new Date\(venta\.fecha \|\| venta\.created_at\)\.toLocaleDateString\(\)/g,
    replace: "new Date((venta.fecha || venta.created_at).includes('T') ? (venta.fecha || venta.created_at) : (venta.fecha || venta.created_at) + 'T12:00:00').toLocaleDateString()"
  }
]);

// dashboard (app/dashboard/page.tsx)
processFile(path.join(__dirname, 'app/dashboard/page.tsx'), [
  {
    search: /new Date\(fecha\)\.toLocaleDateString\('es-VE'/g,
    replace: "new Date(fecha.includes('T') ? fecha : fecha + 'T12:00:00').toLocaleDateString('es-VE'"
  }
]);

// ia chat
processFile(path.join(__dirname, 'app/api/ia/chat/route.ts'), [
  {
    search: /new Date\(v\.fecha\)\.toLocaleDateString/g,
    replace: "new Date(v.fecha.includes('T') ? v.fecha : v.fecha + 'T12:00:00').toLocaleDateString"
  }
]);

// servicios
processFile(path.join(__dirname, 'app/dashboard/servicios/page.tsx'), [
  {
    search: /new Date\(entry\.fecha\)/g,
    replace: "new Date(entry.fecha.includes('T') ? entry.fecha : entry.fecha + 'T12:00:00')"
  }
]);

console.log('All remaining timezone fixes applied!');
