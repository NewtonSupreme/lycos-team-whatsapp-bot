-- 032 · Alertas de atención al cliente (WhatsApp → asesores, a pantalla completa).
--
-- El bot abre una alerta cuando una conversación necesita a una persona: reclamo, emergencia,
-- pide un asesor, quiere negociar, está listo para comprar, reportó un pago, trámite, consulta
-- técnica o el bot no pudo responder. Hay UNA abierta por cliente y escenario: si el cliente
-- sigue escribiendo se actualiza (motivo, último mensaje, veces) en vez de llenar la pantalla.
-- Nada se borra: atenderla deja quién, cuándo y qué se hizo.

create table if not exists public.alertas_atencion (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  cliente_nombre text,
  tipo text not null check (tipo in ('reclamo','emergencia','pide_asesor','negociacion','venta_lista','pago_reportado','tramite','consulta_tecnica','bot_no_pudo')),
  prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
  motivo text not null,
  sugerencia text,
  ultimo_mensaje text,
  veces int not null default 1,
  estado text not null default 'abierta' check (estado in ('abierta','atendida','descartada')),
  pospuesta_hasta timestamptz,
  atendida_por text,
  atendida_en timestamptz,
  nota_cierre text,
  sede_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists alertas_atencion_una_abierta
  on public.alertas_atencion (telefono, tipo) where estado = 'abierta';
create index if not exists alertas_atencion_abiertas on public.alertas_atencion (estado, created_at desc);

alter table public.alertas_atencion enable row level security;
