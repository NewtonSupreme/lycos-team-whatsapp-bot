const fs = require('fs');
const path = 'app/dashboard/instagram/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/style=\{\{\s*background:\s*'#182229',\s*className=\{"text-muted-foreground"\}\s*\}\}/g, 'className="text-muted-foreground bg-muted"');

c = c.replace(/className="flex-1\s*py-2\s*px-4\s*rounded-lg\s*text-sm\s*outline-none"\s*className="bg-muted"/g, 'className="flex-1 py-2 px-4 rounded-lg text-sm outline-none bg-muted"');

c = c.replace(/style=\{\{\s*background:\s*'#202c33',\s*borderBottom:\s*'1px solid rgba\(255,255,255,0.06\)'\s*\}\}/g, 'className="bg-card border-b border-border"');

c = c.replace(/style=\{\{\s*background:\s*isOut\s*\?\s*'#005c4b'\s*:\s*'#202c33',/g, 'style={{ background: isOut ? "linear-gradient(to top right, #f59e0b, #ef4444, #db2777)" : "var(--muted)", color: isOut ? "#fff" : "var(--foreground)",');
c = c.replace(/style=\{\{\s*background:\s*isOut\s*\?\s*"linear-gradient\(to top right, #f59e0b, #ef4444, #ec4899\)"\s*:\s*"var\(--muted\)"/g, 'style={{ background: isOut ? "linear-gradient(to top right, #f59e0b, #ef4444, #db2777)" : "var(--muted)"');

c = c.replace(/className="bg-card\s*border-border"\s*className="bg-card\s*border-border"/g, 'className="bg-card border-border"');

c = c.replace(/style=\{\{\s*height:\s*'calc\(100vh\s*-\s*180px\)',\s*minHeight:\s*'560px'\s*\}\}\s*className=\{"flex\s*rounded-2xl\s*overflow-hidden\s*border\s*border-border\s*bg-background\s*shadow-lg"\}/g, 'style={{ height: "calc(100vh - 180px)", minHeight: "560px" }} className="flex rounded-2xl overflow-hidden border border-border bg-background shadow-lg"');

c = c.replace(/className=\{"bg-card"\}/g, 'className="bg-card"');
c = c.replace(/className=\{"bg-muted"\}/g, 'className="bg-muted"');
c = c.replace(/className=\{"bg-background"\}/g, 'className="bg-background"');
c = c.replace(/className=\{"text-muted-foreground"\}/g, 'className="text-muted-foreground"');
c = c.replace(/className=\{"text-foreground"\}/g, 'className="text-foreground"');

// Fix Quick repliy array map duplicates
c = c.replace(/style=\{\{\s*background:\s*'#2a3942',\s*className="text-muted-foreground",\s*border:\s*'1px solid rgba\(255,255,255,0.06\)'\s*\}\}/g, 'className="text-muted-foreground bg-muted border border-border"');

c = c.replace(/style=\{\{\s*background:\s*'#0b141a'\s*\}\}/g, 'className="bg-background"');

fs.writeFileSync(path, c);
