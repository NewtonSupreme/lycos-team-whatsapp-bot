const fs = require('fs');
const path = 'app/dashboard/instagram/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/WhatsApp CRM/g, 'Instagram CRM');
c = c.replace(/mensajes_whatsapp/g, 'mensajes_instagram');
c = c.replace(/conversaciones/g, 'conversaciones_instagram');
c = c.replace(/wa_message_id/g, 'ig_message_id');
c = c.replace(/telefono/g, 'ig_id');
c = c.replace(/\/api\/whatsapp\/send/g, '/api/instagram/send');
c = c.replace(/\/api\/whatsapp\/react/g, '/api/instagram/react');
// Replace standard properties that might be using WA specific naming formats:
// "from_number" -> "from_id"
c = c.replace(/from_number/g, 'from_id');
// "to_number" -> "to_id"
c = c.replace(/to_number/g, 'to_id');
// "WhatsAppMsg" -> "InstagramMsg"
c = c.replace(/WhatsAppMsg/g, 'InstagramMsg');
c = c.replace(/Whatsapp/g, 'Instagram');
c = c.replace(/whatsapp/g, 'instagram');

fs.writeFileSync(path, c);
