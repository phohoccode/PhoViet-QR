-- P4-HF02. Audited legacy table lacks the nullable worker timestamp required
-- by the deployed C04 executor. Metadata-only addition; no evidence rewritten.
begin;
set local lock_timeout='3s';
do $preflight$
declare actual text; column_type regtype;
begin
 select md5(replace(prosrc,chr(13),'')) into actual from pg_proc
 where oid=to_regprocedure('public.p4_payment_execute(text,jsonb)');
 if actual is distinct from 'e4cf95c3e1283ba548e6e7e0dd379b6b' then
  raise exception 'P4-HF02 preflight: unexpected payment executor; audit deployed definition before retry';
 end if;
 select atttypid::regtype into column_type from pg_attribute
 where attrelid='public.payment_intents'::regclass and attname='last_checked_at' and not attisdropped;
 if column_type is not null and column_type<>'timestamptz'::regtype then
  raise exception 'P4-HF02 preflight: unexpected last_checked_at column type';
 end if;
end;
$preflight$;
alter table public.payment_intents add column if not exists last_checked_at timestamptz;
commit;
