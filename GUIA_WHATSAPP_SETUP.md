# 🚀 Guía de Configuración WhatsApp Business API - Lycos Team

## ✅ Lo que ya tienes configurado:
- ✅ Gemini 2.5 Flash Lite (el modelo más rápido y económico)
- ✅ WhatsApp Token y Phone ID configurados
- ✅ Aplicación desplegada en Vercel: https://lycos-team-whatsapp-bot.vercel.app
- ✅ Webhook configurado en Meta Developers
- ✅ Logging detallado para diagnóstico

---

## 🔍 VERIFICACIÓN FINAL

### 1️⃣ Confirmar Variables de Entorno en Vercel

Ve a tu proyecto en Vercel y verifica que estas variables estén configuradas:

1. Ve a: https://vercel.com/dashboard
2. Selecciona tu proyecto: **lycos-team-whatsapp-bot**
3. Ve a **Settings → Environment Variables**
4. Verifica que existan:
   - `GEMINI_API_KEY`
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_ID`
   - `WHATSAPP_VERIFY_TOKEN`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Si faltan variables**: Agrégalas y haz **Redeploy** del proyecto.

---

### 2️⃣ Verificar Webhook en Meta Developers

Tu webhook debe estar configurado así:
- **URL**: `https://lycos-team-whatsapp-bot.vercel.app/api/whatsapp/webhook`
- **Token de verificación**: `lycos_webhook_token_2026`
- **Suscripción**: ✅ Campo "messages" marcado

---

### 3️⃣ Verificar que el número esté vinculado

1. En Meta Developers, ve a **"WhatsApp" → "Números de teléfono"**
2. Verifica que **+584265903033** esté listado y activo
3. Asegúrate de que el **Phone Number ID** coincida: `1063581616830803`

---

### 4️⃣ Probar el sistema AHORA

1. Envía un mensaje de WhatsApp a: **+584265903033**
   - Ejemplo: "Hola, ¿qué servicios ofrecen?"
   
2. Revisa los logs en Vercel:
   - Ve a: https://vercel.com/dashboard
   - Selecciona tu proyecto
   - Ve a **Deployments → [último deployment] → Logs**
   
3. Deberías ver:
   ```
   📥 Webhook recibido: {...}
   📩 Mensaje de 584123456789: Hola
   🤖 Consultando Gemini 3.1 Flash Lite...
   ✅ Respuesta de Gemini generada
   📤 Enviando mensaje a 584123456789...
   ✅ Mensaje enviado exitosamente
   ```

---

## 🔍 Diagnóstico de Problemas

### ❌ Si NO recibes mensajes:

**Problema 1: Variables de entorno no están en Vercel**
- Ve a Vercel Dashboard → Settings → Environment Variables
- Agrega todas las variables de `.env.local`
- Haz **Redeploy** del proyecto

**Problema 2: Webhook no verificado**
- Ve a Meta Developers → WhatsApp → Configuración
- Verifica que la URL sea: `https://lycos-team-whatsapp-bot.vercel.app/api/whatsapp/webhook`
- El estado debe mostrar "✅ Verificado"

**Problema 3: Suscripción a mensajes no activada**
- En Meta Developers, sección Webhook
- Marca la casilla **"messages"**

### ⚠️ Si recibes mensajes pero NO hay respuesta:

Revisa los logs en Vercel para ver el error específico:
- `❌ GEMINI_API_KEY no configurada` → Agrega la variable en Vercel
- `❌ Error de Gemini API` → Verifica que tu API key sea válida
- `❌ WhatsApp no configurado` → Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID

### 🔴 Si hay error al enviar respuesta:

- Verifica que `WHATSAPP_TOKEN` no haya expirado (válido hasta Mayo 2026)
- Confirma que `WHATSAPP_PHONE_ID` sea: `1063581616830803`
- Revisa permisos de la app en Meta Developers

---

## 🧪 Probar localmente (Opcional)

Para probar el webhook localmente antes de desplegar:

1. Instala ngrok: https://ngrok.com/
2. Ejecuta tu app: `npm run dev`
3. En otra terminal: `ngrok http 3000`
4. Usa la URL de ngrok en Meta Developers temporalmente

---

## ⚙️ Verificar Variables de Entorno en Vercel

**CRÍTICO**: Asegúrate de que estas variables estén en Vercel:

```
GEMINI_API_KEY=AIzaSyCxXPAabQB3q44At3Bnbd8BPkkdSaFXY9k
WHATSAPP_TOKEN=EAAOau4YIpdYBQ4LNQUra5vKXdzqSprqIeoybJZCQRH1tMiCCpqZA2DKptgR7iEbSNgEvLRjZCxD5kulk5WtPVZCHiwt1tZAX92CxuzdOcseaqh748EpxeYvhD728Ek6nqTLnACz0tAaSB3PpObFXIuZBtc3lHkSQn2bdXipItjW3ZBXDvNcwBug9SSBr9Ws9hsDo0tf09MneIKixZCbhgWqhM4D21ypE8B5431Rk
WHATSAPP_PHONE_ID=1063581616830803
WHATSAPP_VERIFY_TOKEN=lycos_webhook_token_2026
NEXT_PUBLIC_SUPABASE_URL=https://svazupuylnaxqmtaastz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YXp1cHV5bG5heHFtdGFhc3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTUxMjYsImV4cCI6MjA4OTI5MTEyNn0.l_rCrXM0qmMSU6ZMkv_9aP4vQbJR3m02prauifyo09o
```

**Cómo agregar variables en Vercel:**
1. Ve a: https://vercel.com/dashboard
2. Selecciona: **lycos-team-whatsapp-bot**
3. Ve a: **Settings → Environment Variables**
4. Agrega cada variable (Name y Value)
5. Haz clic en **Save**
6. Ve a **Deployments** y haz **Redeploy** del último deployment

---

## 📞 Contacto de Soporte

Si sigues teniendo problemas:
- Revisa la documentación oficial: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
- Verifica el estado de la API: https://developers.facebook.com/status/

---

## ✨ Mejoras Implementadas

1. **Gemini 2.5 Flash Lite** - El modelo más rápido y económico
2. **Logging detallado** para diagnóstico en tiempo real
3. **Manejo de errores robusto** con mensajes claros en consola
4. **Validación de configuración** antes de procesar mensajes

---

## 🎯 SIGUIENTE PASO INMEDIATO

**Prueba enviando un mensaje a +584265903033 desde WhatsApp**

Si no recibes respuesta en 10 segundos:
1. Revisa los logs en Vercel (Dashboard → Deployments → Logs)
2. Verifica que las variables de entorno estén en Vercel
3. Confirma que el webhook esté verificado en Meta Developers
