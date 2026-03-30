// Script para probar el webhook localmente
const testLocal = async () => {
  const webhookUrl = 'http://localhost:3000/api/whatsapp/webhook';
  
  const testMessage = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: '584142279708',
            id: 'test_local_' + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: { body: 'Hola, ¿qué servicios ofrecen?' }
          }]
        }
      }]
    }]
  };

  try {
    console.log('📤 Enviando mensaje de prueba LOCAL...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });
    console.log('✅ Status:', response.status);
    const data = await response.json();
    console.log('✅ Respuesta:', data);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};
testLocal();
