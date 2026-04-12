const fs = require('fs');
const path = 'app/dashboard/instagram/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// Replace standard backgrounds
c = c.replace(/style=\{\{\s*[^}]*background:\s*'(#111b21|#0b141a|#202c33)'[^}]*\}\}/g, 'className="bg-card border-border"');
c = c.replace(/style=\{\{\s*[^}]*background:\s*'#2a3942'[^}]*\}\}/g, 'className="bg-muted"');

// Replace standard text colors
c = c.replace(/style=\{\{\s*color:\s*'#e9edef'\s*\}\}/g, 'className="text-foreground"');
c = c.replace(/style=\{\{\s*color:\s*'#8696a0'\s*\}\}/g, 'className="text-muted-foreground"');

// Replace outgoing / incoming chat bubbles
// Outgoing
c = c.replace(/background:\s*'#005c4b'/g, 'background: "linear-gradient(to top right, #f59e0b, #ef4444, #ec4899)"'); // Lycos/Ig gradient
c = c.replace(/color:\s*'#e9edef'/g, 'color: "white"');
// Incoming WA uses '#202c33' which we will map to local component specific rules but simpler just replace inline
c = c.replace(/background:\s*'#202c33'/g, 'background: "var(--muted)"');

// Replace green primary to Red Lycos
c = c.replace(/#00a884/g, '#ef4444');
c = c.replace(/#25d366/g, '#ef4444');

// Some leftover inline styles might clash, let's explicitly strip specific styles blocks
c = c.replace(/style=\{\{ height: 'calc\(100vh - 180px\)', minHeight: '560px', background: '#111b21' \}\}/g, 'style={{ height: "calc(100vh - 180px)", minHeight: "560px" }} className="flex rounded-2xl overflow-hidden border bg-card shadow-lg"');

c = c.replace(/style=\{\{ background: '#202c33' \}\}/gi, 'className="bg-muted/30"');
c = c.replace(/style=\{\{ background: '#0b141a' \}\}/gi, 'className="bg-background"');
c = c.replace(/style=\{\{ background: '#2a3942' \}\}/gi, 'className="bg-muted"');

// Icons
c = c.replace(/color:\s*'rgba\(255,255,255,0.15\)'/g, 'color: "currentColor"');
c = c.replace(/color:\s*'rgba\(255,255,255,0.2\)'/g, 'color: "currentColor"');
c = c.replace(/color:\s*'rgba\(255,255,255,0.35\)'/g, 'color: "currentColor"');

// Avatar gradient: Map green #00a884 to Lycos IG Gradient
c = c.replace(/'linear-gradient\(135deg, #00a884 0%, #008069 100%\)'/g, '"linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #db2777 100%)"');

fs.writeFileSync(path, c);
