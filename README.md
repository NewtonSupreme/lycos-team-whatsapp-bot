# 🚗 Lycos Team — Sistema de Gestión Automotriz SaaS

Plataforma web completa para taller automotriz con IA, WhatsApp y panel administrativo avanzado.
Desarrollado por **Leandro Márquez** | Stack: Next.js 14 + Supabase + Gemini AI

## 🚀 Inicio Rápido

```bash
npm install
cp .env.example .env.local
# Edita .env.local con tus credenciales
npm run dev
```

Abre http://localhost:3000

## ✨ Módulos

- Dashboard con métricas en tiempo real y gráficos (Recharts)
- Clientes — CRUD completo con historial
- Vehículos — gestión por marca, placa, estado
- Servicios — mecánica, electrónica, cerrajería, motor
- Agenda — calendario mensual interactivo con citas
- WhatsApp — chat tipo WhatsApp Web + bot IA
- IA Asistente — chat con Gemini 1.5 24/7
- Reportes — gráficos de ingresos, KPIs
- Actividad — log de auditoría completo
- Configuración — empresa, bot, APIs, seguridad

## Variables de Entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
GEMINI_API_KEY=AIzaSy...
WHATSAPP_TOKEN=EAAG...
WHATSAPP_PHONE_ID=1234567890
WHATSAPP_VERIFY_TOKEN=lycos_webhook_token_2026
```

## Deploy Vercel

1. Push a GitHub
2. Importar en vercel.com
3. Agregar variables de entorno
4. Deploy ✅

## WhatsApp Webhook

URL: https://tu-dominio.vercel.app/api/whatsapp/webhook
Verify Token: lycos_webhook_token_2026

© 2026 Lycos Team · Desarrollado por Leandro Márquez
