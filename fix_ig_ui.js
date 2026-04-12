const fs = require('fs');
const path = 'app/dashboard/instagram/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// Container & layout
c = c.replace(/style=\{\{ height: 'calc\(100vh - 180px\)', minHeight: '560px', background: '#111b21' \}\}/g, 'style={{ height: "calc(100vh - 180px)", minHeight: "560px" }} className={"flex rounded-2xl overflow-hidden border border-border bg-background shadow-lg"}');
c = c.replace(/style=\{\{ background: '#202c33' \}\}/g, 'className={"bg-card"}');
c = c.replace(/style=\{\{ background: '#0b141a' \}\}/g, 'className={"bg-background"}');
c = c.replace(/style=\{\{ background: '#2a3942' \}\}/g, 'className={"bg-muted"}');
c = c.replace(/style=\{\{ borderBottom: '1px solid rgba\(255,255,255,0.06\)' \}\}/g, 'className={"border-b border-border"}');

// Search input
c = c.replace(/style=\{\{ background: '#2a3942' \}\}/g, 'className={"bg-muted"}');
c = c.replace(/text-white\/40/g, 'text-muted-foreground');
c = c.replace(/text-white\/80/g, 'text-foreground');
c = c.replace(/placeholder:text-white\/35/g, 'placeholder:text-muted-foreground');

// Texts
c = c.replace(/style=\{\{ color: '#e9edef' \}\}/g, 'className={"text-foreground"}');
c = c.replace(/style=\{\{ color: '#8696a0' \}\}/g, 'className={"text-muted-foreground"}');
c = c.replace(/style=\{\{ color: 'rgba\(255,255,255,0.2\)' \}\}/g, 'className={"text-muted-foreground opacity-50"}');
c = c.replace(/style=\{\{ color: 'rgba\(255,255,255,0.35\)' \}\}/g, 'className={"text-muted-foreground"}');
c = c.replace(/style=\{\{ borderColor: '#202c33' \}\}/g, 'className={"border-card"}');

// Incoming / Outgoing messages
const waIncomingBg = `style={{ background: '#202c33' }}`;
const igIncomingBg = `className={"bg-muted text-foreground"}`;
c = c.replace(/style=\{\{ background: '#202c33', borderRadius:/g, 'className={"bg-muted text-foreground"} style={{ borderRadius:');

const waOutgoingBg = `style={{ background: '#005c4b' }}`;
const igOutgoingBg = `className={"bg-gradient-to-tr from-yellow-500 via-red-500 to-pink-500 text-white shadow-md"}`;
c = c.replace(/style=\{\{ background: '#005c4b', borderRadius:/g, 'className={"bg-gradient-to-tr from-yellow-500 via-red-500 to-pink-500 text-white shadow-md"} style={{ borderRadius:');

// Generic WA green text checks to Lycos Red checks
c = c.replace(/color: '#53bdeb'/g, 'color: "currentColor"'); // Checks color
c = c.replace(/color: '#8696a0'/g, 'className={"text-muted-foreground"}'); // Unread check

// Unread badge generic
c = c.replace(/style=\{\{ background: '#00a884', color: '#111b21' \}\}/g, 'className={"bg-red-500 text-white"}');
c = c.replace(/text-green-400/g, 'text-primary');

// Avatar gradient 
// In getAvatarColor function we can change hardcoded wa colors to IG/Lycos ones
c = c.replace(/'linear-gradient\(135deg, #00a884 0%, #008069 100%\)'/g, '"linear-gradient(135deg, #FFB100, #F50000, #C5009D)"'); // IG Gradient

// Reaction bubble generic
c = c.replace(/background: '#2a3942', border: '1px solid #0b141a'/g, 'background: "var(--background)", border: "1px solid var(--border)"');

// Input Area
c = c.replace(/style=\{\{ background: '#2a3942', borderRadius: '8px' \}\}/g, 'className={"bg-muted rounded-full"}');

fs.writeFileSync(path, c);
