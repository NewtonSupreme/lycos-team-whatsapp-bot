const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const url = "https://svazupuylnaxqmtaastz.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YXp1cHV5bG5heHFtdGFhc3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTUxMjYsImV4cCI6MjA4OTI5MTEyNn0.l_rCrXM0qmMSU6ZMkv_9aP4vQbJR3m02prauifyo09o";
const WHATSAPP_TOKEN = "EAA8C2JhxGVEBRGSVCZBk74f5bnyOBb7bcpLBl7RwvuB6oq28fNI29GyeJWqKbvava2LL1HVQgDCwAzuWizGZBllUyZBKK4dD6e6cxAiyEalzSojKWkz4hHYnIkLvV9T7IoSZChjMGSAumi6MDFzoYbb9LSxz7KQkdZAvZCtJjWebc89oryoOTle52Sw1dALgZDZD";
const WHATSAPP_PHONE_ID = "1085854084608404";

const outPath = "c:\\Users\\NewtonSupreme\\Videos\\Chat Bot whatsapp\\tmp\\send_result.json";

async function run() {
  const log = [];
  try {
    log.push("Iniciando script...");
    fs.writeFileSync(outPath, JSON.stringify(log, null, 2));

    const db = createClient(url, key);
    const targetPhone = "584142289474";
    
    log.push(`Buscando conversación para ${targetPhone}...`);
    const { data: conv, error: convErr } = await db.from('conversaciones')
      .select('*')
      .ilike('telefono', `%4142289474%`)
      .maybeSingle();

    if (convErr) {
      log.push(`Error buscando conversación: ${JSON.stringify(convErr)}`);
      fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
      return;
    }

    const effectivePhone = conv ? conv.telefono : targetPhone;
    const effectiveSedeId = conv ? conv.sede_id : "310595c5-5258-47fa-9b69-5ad9932685a7";
    log.push(`Conversación encontrada: Teléfono=${effectivePhone}, Sede=${effectiveSedeId}, Estado=${conv?.estado}`);
    fs.writeFileSync(outPath, JSON.stringify(log, null, 2));

    const messageText = `¡Buenísimo que ya tengas nuestra App de Lycos instalada! 📱✨\n\nTe confirmo que en nuestra sede de *El Paraíso* ¡sí laboramos los sábados! Los sábados trabajamos en horario de *8:30 AM a 2:00 PM*. De lunes a viernes estamos de 8:00 AM a 4:00 PM.\n\n¿Prefieres agendar tu revisión gratuita en El Paraíso para este *sábado en la mañana* o te quedaría mejor agendar para el *viernes*? 📅🔧 ¡Avísame qué día y a qué hora te viene mejor para organizarlo en el sistema y esperarte con el equipo técnico! 😊`;

    log.push("Enviando mensaje a Meta WhatsApp Cloud API...");
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: effectivePhone,
      type: 'text',
      text: { preview_url: false, body: messageText }
    };

    const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json();
      log.push(`❌ Error desde Meta API: ${JSON.stringify(err, null, 2)}`);
      fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
      return;
    }

    const metaData = await response.json();
    const waMessageId = metaData.messages?.[0]?.id || null;
    log.push(`✅ Mensaje enviado a WhatsApp exitosamente. ID: ${waMessageId}`);
    fs.writeFileSync(outPath, JSON.stringify(log, null, 2));

    log.push("Guardando mensaje en Supabase como si fuera el BOT...");
    const { error: msgErr } = await db.from('mensajes_whatsapp').insert({
      from_number: 'system',
      to_number: effectivePhone,
      body: messageText,
      tipo: 'saliente',
      estado: 'enviado',
      es_ia: true,
      ...(waMessageId ? { wa_message_id: waMessageId } : {}),
      sede_id: effectiveSedeId
    });

    if (msgErr) {
      log.push(`Error insertando en mensajes_whatsapp: ${JSON.stringify(msgErr)}`);
    } else {
      log.push("✅ Registro en mensajes_whatsapp creado con éxito (es_ia: true).");
    }

    log.push("Actualizando tabla conversaciones...");
    const { error: updErr } = await db.from('conversaciones').upsert({
      telefono: effectivePhone,
      ultimo_mensaje: messageText,
      ultimo_mensaje_at: new Date().toISOString(),
      estado: 'bot',
      is_processing: false,
      sede_id: effectiveSedeId
    }, { onConflict: 'telefono' });

    if (updErr) {
      log.push(`Error actualizando conversaciones: ${JSON.stringify(updErr)}`);
    } else {
      log.push("✅ Conversación actualizada con éxito (estado: 'bot', is_processing: false).");
    }

    log.push("¡Todo completado sin errores!");
  } catch (e) {
    log.push(`Fatal Error: ${e.toString()}`);
  }
  fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
}

run();
