const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/dashboard/reportes/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add import if not exists
if (!content.includes('getLocalISODate')) {
  content = content.replace(
    "import { cn } from '@/lib/utils';",
    "import { cn, getLocalISODate } from '@/lib/utils';"
  );
}

// Replace new Date().toISOString().split('T')[0] -> getLocalISODate()
content = content.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate()");

// Replace specific Date.now math
content = content.replace(/new Date\(Date\.now\(\) - days \* 86400000\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate(new Date(Date.now() - days * 86400000))");

// Replace now.toISOString().split('T')[0] -> getLocalISODate(now)
content = content.replace(/now\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate(now)");

// Replace d.toISOString().split('T')[0] -> getLocalISODate(d)
content = content.replace(/d\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate(d)");

fs.writeFileSync(filePath, content);
console.log('Done!');
