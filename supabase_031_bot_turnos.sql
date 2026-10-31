-- 031 · Bot de WhatsApp: un mensaje se procesa una sola vez y una conversación, un turno a la vez.
--
-- · El índice único de wa_message_id hace que el reenvío de un aviso de WhatsApp (o dos
--   ejecuciones a la vez) no pueda guardar ni contestar el mismo mensaje dos veces: el
--   segundo INSERT falla y se descarta.
-- · procesando_desde es el candado del turno: solo una ejecución contesta una conversación;
--   se toma con un UPDATE condicional (atómico) y caduca a los 2 minutos si algo se cae.
-- · atendido_hasta marca hasta qué mensaje del cliente ya se contestó: lo que llegue después
--   (aunque llegue mientras el bot piensa) se contesta en el mismo turno, todo junto.

create unique index if not exists mensajes_whatsapp_wa_message_id_unico
  on public.mensajes_whatsapp (wa_message_id)
  where wa_message_id is not null;

alter table public.conversaciones add column if not exists procesando_desde timestamptz;
alter table public.conversaciones add column if not exists atendido_hasta timestamptz;

create index if not exists mensajes_whatsapp_entrantes_por_numero
  on public.mensajes_whatsapp (from_number, created_at)
  where tipo = 'entrante';
