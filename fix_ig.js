const fs = require('fs');
const path = 'app/api/instagram/webhook/route.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/WHATSAPP_VERIFY_TOKEN/g, 'INSTAGRAM_VERIFY_TOKEN');
c = c.replace(/WHATSAPP_TOKEN/g, 'INSTAGRAM_TOKEN');
c = c.replace(/WHATSAPP_PHONE_ID/g, 'INSTAGRAM_PAGE_ID');
c = c.replace(/mensajes_whatsapp/g, 'mensajes_instagram');
c = c.replace(/conversaciones/g, 'conversaciones_instagram');
c = c.replace(/whatsapp_business_account/g, 'instagram');
c = c.replace(/from_number/g, 'from_id');
c = c.replace(/to_number/g, 'to_id');
c = c.replace(/wa_message_id/g, 'ig_message_id');
c = c.replace(/whatsapp_cron_retry/g, 'instagram_cron_retry');
c = c.replace(/whatsapp_message/g, 'instagram_message');
c = c.replace(/telefono/g, 'ig_id');

fs.writeFileSync(path, c);
