// Script para probar el webhook de WhatsApp localmente
// Simula un mensaje entrante de WhatsApp

const testWebhook = async () => {
  const webhookUrl = 'https://lycos-team-whatsapp-bot.vercel.app/api/whatsapp/webhook';
  
  const testMessage = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: '584142279708',
            id: 'test_msg_' + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: {
              body: 'Hola, ¿qué servicios ofrecen?'
            }
          }]
        }
      }]
    }]
  };

  try {
    console.log('📤 Enviando mensaje de prueba al webhook...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });

    const data = await response.json();
    console.log('✅ Respuesta del webhook:', data);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

testWebhook();
