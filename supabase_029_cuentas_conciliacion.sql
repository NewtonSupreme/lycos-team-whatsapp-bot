-- ════════════════════════════════════════════════════════════════════════════
-- 029 · Cuentas de la empresa: con qué estado de cuenta se concilia cada una
-- ─────────────────────────────────────────────────────────────────────────────
-- Una cuenta puede recibir cobros de ventas (tiene `bin`: el método de pago) o ser
-- interna (sin `bin`: caja chica, BNC 8215 de cuotas, cuenta de ahorro, etc.).
-- `conciliacion_banco` dice qué formato de estado de cuenta le corresponde
-- (banesco | bnc | bnc_cuotas | exterior | cashea), para que la conciliación y el
-- flujo de caja sepan qué archivo es de qué cuenta.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════
alter table cuentas_financieras add column if not exists conciliacion_banco text;
alter table cuentas_financieras add column if not exists titular text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cuentas_conciliacion_banco_check') then
    alter table cuentas_financieras add constraint cuentas_conciliacion_banco_check
      check (conciliacion_banco is null or conciliacion_banco in ('banesco','bnc','bnc_cuotas','exterior','cashea'));
  end if;
end $$;
-- Las que ya existen: su formato por el método de cobro.
update cuentas_financieras set conciliacion_banco = case bin
  when 'pago_movil_banesco' then 'banesco' when 'punto_banesco' then 'banesco'
  when 'bnc' then 'bnc' when 'pago_movil_exterior' then 'exterior' when 'cashea' then 'cashea' end
where conciliacion_banco is null and bin in ('pago_movil_banesco','punto_banesco','bnc','pago_movil_exterior','cashea');
