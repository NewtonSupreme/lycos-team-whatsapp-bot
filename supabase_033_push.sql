-- 033 · Notificaciones push que llegan a quien deben, rápido, y con constancia.
--
-- · Cada aparato suscrito queda atado a su usuario (rol, sede): un aviso de WhatsApp le llega
--   a quien atiende WhatsApp, no a todos los aparatos que alguna vez se suscribieron.
-- · ultimo_ok / fallos / ultimo_error dicen qué aparato está recibiendo y cuál no.
-- · push_envios guarda cada aviso: a cuántos aparatos salió y cuántos fallaron, para poder
--   comprobar que no se escapó ninguno.

alter table public.push_subscriptions add column if not exists usuario_id text;
alter table public.push_subscriptions add column if not exists usuario_nombre text;
alter table public.push_subscriptions add column if not exists rol text;
alter table public.push_subscriptions add column if not exists sede_id uuid;
alter table public.push_subscriptions add column if not exists ultimo_ok timestamptz;
alter table public.push_subscriptions add column if not exists fallos int not null default 0;
alter table public.push_subscriptions add column if not exists ultimo_error text;
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();

create index if not exists push_subscriptions_usuario on public.push_subscriptions (usuario_id);

create table if not exists public.push_envios (
  id uuid primary key default gen_random_uuid(),
  titulo text, tipo text, modulo text, url text,
  aparatos int not null default 0, enviados int not null default 0, fallidos int not null default 0, borrados int not null default 0,
  ms int, created_at timestamptz not null default now()
);
create index if not exists push_envios_fecha on public.push_envios (created_at desc);
alter table public.push_envios enable row level security;
