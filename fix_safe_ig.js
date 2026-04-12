const fs = require('fs');
const path = 'app/dashboard/instagram/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// 1. Rename WA variables to IG variables
c = c.replace(/WhatsApp CRM/g, 'Instagram CRM');
c = c.replace(/mensajes_whatsapp/g, 'mensajes_instagram');
c = c.replace(/conversaciones/g, 'conversaciones_instagram');
c = c.replace(/wa_message_id/g, 'ig_message_id');
c = c.replace(/telefono/g, 'ig_id');
c = c.replace(/\/api\/whatsapp\/send/g, '/api/instagram/send');
c = c.replace(/\/api\/whatsapp\/react/g, '/api/instagram/react');
c = c.replace(/from_number/g, 'from_id');
c = c.replace(/to_number/g, 'to_id');
c = c.replace(/WhatsAppMsg/g, 'InstagramMsg');
c = c.replace(/Whatsapp/g, 'Instagram');
c = c.replace(/whatsapp/g, 'instagram');

// 2. Safe CSS Inline replacements (Mapping hardcoded WA dark mode colors to Tailwind variables)
c = c.replace(/'#111b21'/g, '"var(--background)"'); 
c = c.replace(/'#0b141a'/g, '"var(--background)"'); 
c = c.replace(/'#202c33'/g, '"var(--card)"'); 
c = c.replace(/'#2a3942'/g, '"var(--muted)"'); 
c = c.replace(/'#e9edef'/g, '"var(--foreground)"'); 
c = c.replace(/'#8696a0'/g, '"var(--muted-foreground)"'); 

// WA specific Outgoing color
c = c.replace(/'#005c4b'/g, '"linear-gradient(to top right, #f59e0b, #ef4444, #db2777)"'); // WhatsApp outgoing
c = c.replace(/'#00a884'/g, '"#ef4444"'); // WhatsApp green accent -> Lycos Red
c = c.replace(/'#25d366'/g, '"#ef4444"'); // Whatsapp active -> Lycos Red
c = c.replace(/'rgba\(233,237,239,0.5\)'/g, '"var(--muted-foreground)"');
c = c.replace(/'rgba\(233,237,239,0.6\)'/g, '"var(--muted-foreground)"');

// Remove border clashes
c = c.replace(/borderBottom:\s*'1px solid rgba\(255,255,255,0.06\)'/g, 'borderBottom: "1px solid var(--border)"');
c = c.replace(/borderBottom:\s*`1px solid \$\{isHumano \? 'rgba\\\(251,146,60,0.15\\\)' : 'rgba\\\(167,139,250,0.15\\\)'\}`/g, 'borderBottom: `1px solid ${isHumano ? "rgba(251,146,60,0.15)" : "rgba(167,139,250,0.15)"}`');

c = c.replace(/borderColor:\s*'#202c33'/g, 'borderColor: "var(--border)"');
c = c.replace(/border:\s*'1px solid rgba\(255,255,255,0.04\)'/g, 'border: "1px solid var(--border)"');
c = c.replace(/border:\s*'1px solid rgba\(255,255,255,0.06\)'/g, 'border: "1px solid var(--border)"');

// Some leftover texts
c = c.replace(/'rgba\(255,255,255,0.15\)'/g, '"var(--muted-foreground)"');
c = c.replace(/'rgba\(255,255,255,0.2\)'/g, '"var(--muted-foreground)"');
c = c.replace(/'rgba\(255,255,255,0.35\)'/g, '"var(--muted-foreground)"');
c = c.replace(/'rgba\(255,255,255,0.08\)'/g, '"var(--muted)"');

// Avatars
c = c.replace(/'linear-gradient\(135deg, #00a884 0%, #008069 100%\)'/g, '"linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #db2777 100%)"'); // Instagram gradient

fs.writeFileSync(path, c);
