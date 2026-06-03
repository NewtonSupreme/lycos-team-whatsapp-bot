-- Fix RLS para tablas con autenticación propia (tabla usuarios + cookie, no Supabase Auth)
-- auth.role() siempre retorna 'anon', por lo que RLS bloquea inserts/updates/deletes.

alter table presupuestos disable row level security;

drop policy if exists "Usuarios: Lectura pública" on public.usuarios;
drop policy if exists "Usuarios: Actualización pública" on public.usuarios;
alter table public.usuarios disable row level security;
