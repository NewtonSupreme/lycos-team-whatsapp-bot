# Lycos Team Project Summary
*Last updated: 2026-05-20*

## Overview
Sistema de gestión para taller automotriz con chatbot WhatsApp, dashboard administrativo, y panel de IA.

---

## What We've Done (Most Recent First)

### ✅ Tutorial Video Uploaded to Cloud
- **Problem**: Video `tutorial_Lycos_Team.mp4` was 408MB — too large to serve via Next.js and exceed Supabase free tier limits (50MB per file).
- **Solution**: 
  - Compressed to **34.82 MB** using ffmpeg (H.264, CRF 28, 720p) → `tutorial_compressed.mp4`
  - Uploaded to **Supabase Storage** bucket `tutorial/`
  - API route `app/api/tutorial-video/route.ts` handles auth (cookie session check) and redirects to a signed URL (24h expiry)
  - Dashboard `app/dashboard/page.tsx` plays the video via `<source src="/api/tutorial-video">`
- **Note**: Original file deleted locally. Compressed file retained.

### ✅ IA Assistant — Major Improvements
- **Image interpretation**: Handles facturas, vehículos, tickets, Excel screenshots (columns → tabla)
- **Sales context**: Distinguishes recent sales (same month) vs. older ones
- **System prompt improvements**: Better guidance for user categorization (nuevo/recurrente/inactivo)
- **Admin webhook** (`app/api/ia/webhook/route.ts`): Enhanced `ADMIN_KNOWLEDGE` with:
  - Detailed vehicle image analysis restoration (firma, modelo, color, daños, etc.)
  - Access to dashboard, real-time reports (`/reportes`), `cierres_de_caja` table
  - Instructions to guide users to the correct sections
- **Chat route** (`app/api/ia/chat/route.ts`): Updated query — selects `mensajes_sin_leer` from `conversaciones` table

### ✅ Empleados Page Fix — `app/dashboard/empleados/page.tsx`
- **Problem**: `permisos` column doesn't exist in the DB `usuarios` table; was referenced in a `.select()` and a `formatPermisos` helper.
- **Fix**: 
  - Removed from the `.select()` query
  - Wrapped `formatPermisos()` call inside a conditional `if (r.permisos)`
  - UI shows "Sin permisos definidos" gracefully when missing
  - Column is not required in the DB — no migration needed

### ✅ Mermaid Chart Fix — `app/dashboard/ia/entrenamiento/page.tsx`
- When using dark class + Mermaid, `<pre>` elements inside `.mermaid` containers were invisible.

### ✅ Inventory Module — `app/dashboard/inventario/`
- Generated full CRUD with server actions.
- `page.tsx` — client component with search, row click → detail/categorías panel.
- `[id]/page.tsx` — detail page tabs (Info, Kardex, Categorías).
- `acciones.ts` — Server Actions (create, update, delete, bulk).
- DB tables: `inventario`, `inventario_kardex`, `inventario_categorias`.

### ✅ Escritorio (Desk) Realtime — `app/api/desk/`
- Replaces polling with Supabase Realtime subscriptions for all desk tables.
- Pings every 25s to keep the channel alive.

### ✅ Dashboard Real-time — `app/dashboard/page.tsx`
- Replaces manual polling with Supabase Realtime subscriptions for tables: `mensajes_whatsapp`, `conversaciones`, `servicios`, `citas`, `clientes`, `vehiculos`, `ventas_silenciadores`.

### ✅ Database Migration Improvements
- Migration `20250307_remove_duplicate_columns.sql`: Forgiving ALTER TABLE (checks existence before dropping).
- Schema modifications for `sedes` DNI field.
- `pnpm db:push` → uses `supabase db push`.

### ✅ WhatsApp Cloud API Integration
- **Webhook Verification**: GET handler validates `hub.verify_token` against `WHA_VERIFY_TOKEN`.
- **Incoming Messages**: POST handler processes text, interactive, image messages.
- **Auto-reply**: Marks messages as `leido`, checks DB for known numbers (clientes), assigns `sede_id` via area code.
- **Message Types**: Text replies, interactive buttons (Agendar Cita, Hablar con Asesor), and template messages.
- **Media Download**: Downloads images from WhatsApp servers using `WHA_TOKEN`, stores as Base64 in `mensajes_whatsapp`.
- **Errors**: Returns 200 for duplicate messages, 403 for bad tokens.

### ✅ IA Integration — `app/api/ia/`
- **`responder/route.ts`**: AI generates responses via OpenRouter (deepseek-chat). Includes context (historial, perfil cliente, sede, catálogo) and optionally generates quotes from images.
- **`responder-image/route.ts`**: Image analysis with OpenRouter (OpenAI Vision). Generates descriptions of vehicle damage/mileage/license plate.
- **`entrenamiento/`**: Training page with `contexto.md`, `personalidad.md`, subidas.

### ✅ GraphQL Quote Fix — `lib/twilio/queries.ts`
- Fixed `get_catalogo` GQL query to use `HasAccess` with `ready: true` and correct filter syntax.

---

## Architecture

```
Next.js App Router + Supabase (PostgreSQL + Storage + Realtime)
├── app/
│   ├── api/
│   │   ├── ia/       → chat, responder, responder-image, webhook, entrenamiento
│   │   ├── desk/     → realtime escritorio endpoints
│   │   ├── rates/    → exchange rates (BCV, Binance)
│   │   ├── tutorial-video/ → serves tutorial video from Supabase Storage with auth
│   │   └── whatsapp/ → webhook, messages, send
│   ├── dashboard/
│   │   ├── page.tsx   → home with stats, charts, realtime
│   │   ├── empleados/
│   │   ├── inventario/
│   │   ├── ia/
│   │   └── ...
```

## Key DB Tables
- `usuarios` (id, username, nombre, rol, activo, created_at) — **no `permisos` column**
- `clientes`, `vehiculos`, `servicios`, `citas`
- `conversaciones`, `mensajes_whatsapp`
- `sedes`
- `inventario`, `inventario_kardex`, `inventario_categorias`
- `cierres_de_caja`
- `ventas_silenciadores`

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `WHA_TOKEN`, `WHA_PHONE_NUMBER_ID`, `WHA_VERIFY_TOKEN`, `WHA_BUSINESS_ACCOUNT_ID`
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SYNC_SERVICE_SID`

## Notes
- Always use `pnpm` not npm
- Run `pnpm db:push` after schema changes
- Run `pnpm lint` after edits
- Video tutorial: compressed to 35MB, stored in Supabase Storage bucket `tutorial/`
