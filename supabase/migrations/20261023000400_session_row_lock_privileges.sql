-- SELECT ... FOR SHARE / FOR UPDATE also requires UPDATE on at least one
-- column. Hosted projects do not necessarily grant it to service_role by
-- default, and BYPASSRLS does not replace PostgreSQL object privileges.
-- Only the trusted backend gains this access; guest/owner grants are unchanged.
begin;
grant update (name) on public.stores to service_role;
grant update (label) on public.dining_tables to service_role;
grant update (active) on public.qr_codes to service_role;
commit;
