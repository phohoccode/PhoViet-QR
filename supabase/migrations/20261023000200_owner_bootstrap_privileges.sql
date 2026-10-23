-- Explicit trusted server grants: hosted projects may not inherit the local
-- template's service_role defaults. BYPASSRLS alone does not grant table access.
begin;
grant usage on schema public to service_role;
grant select, insert on public.stores, public.owner_members to service_role;
commit;
