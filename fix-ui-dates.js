const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix: new Date(vFecha).toLocaleDateString(...)
  content = content.replace(/new Date\(vFecha\)\.toLocaleDateString/g, "new Date(vFecha.includes('T') ? vFecha : vFecha + 'T12:00:00').toLocaleDateString");
  
  // Fix: new Date(v.displayDate).toLocaleDateString(...)
  content = content.replace(/new Date\(v\.displayDate\)\.toLocaleDateString/g, "new Date(v.displayDate.includes('T') ? v.displayDate : v.displayDate + 'T12:00:00').toLocaleDateString");

  // Fix: new Date(selectedSale.fecha).toLocaleDateString(...)
  content = content.replace(/new Date\(selectedSale\.fecha\)\.toLocaleDateString/g, "new Date(selectedSale.fecha.includes('T') ? selectedSale.fecha : selectedSale.fecha + 'T12:00:00').toLocaleDateString");

  // Fix: new Date(venta.fecha || venta.created_at).toLocaleDateString(...)
  content = content.replace(/new Date\(venta\.fecha \|\| venta\.created_at\)\.toLocaleDateString/g, "new Date((venta.fecha || venta.created_at).includes('T') ? (venta.fecha || venta.created_at) : (venta.fecha || venta.created_at) + 'T12:00:00').toLocaleDateString");
  
  // Fix: new Date(v.fecha).toLocaleDateString(...)
  content = content.replace(/new Date\(v\.fecha\)\.toLocaleDateString/g, "new Date(v.fecha.includes('T') ? v.fecha : v.fecha + 'T12:00:00').toLocaleDateString");

  fs.writeFileSync(filePath, content);
}

processFile(path.join(__dirname, 'app/dashboard/silenciadores/page.tsx'));
processFile(path.join(__dirname, 'app/dashboard/ventas/page.tsx'));
processFile(path.join(__dirname, 'app/dashboard/servicios/page.tsx'));
processFile(path.join(__dirname, 'app/dashboard/reportes/page.tsx'));

console.log('UI dates fixed!');
