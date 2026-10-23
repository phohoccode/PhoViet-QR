-- READ ONLY. Run on the intended Production project before retrying migration006.
-- One JSON result for Supabase SQL Editor: Export -> JSON. No guest/session secrets.
begin transaction read only;

with definition as (
 select pg_get_functiondef(to_regprocedure('public.p2_execute(text,jsonb)')) as raw
), markers as (
 select raw, replace(raw,E'\r\n',E'\n') as normalized,
 'if action=''resolve'' then'||chr(10)||'   retry:=public.p2_rate(''read:''' as lf_marker
 from definition
), marker_diagnostics as (
 select length(raw)-length(replace(raw,chr(13),'')) as cr_count,
 length(raw)-length(replace(raw,chr(10),'')) as lf_count,
 position(lf_marker in raw) as raw_lf_marker_position,
 position(replace(lf_marker,chr(10),chr(13)||chr(10)) in raw) as raw_crlf_marker_position,
 position(lf_marker in normalized) as normalized_lf_marker_position,
 position(replace(lf_marker,chr(10),chr(13)||chr(10)) in normalized) as old_crlf_marker_in_normalized_source,
 replace(replace(substring(raw from greatest(1,position('if action=''resolve'' then' in raw)-120) for 420),chr(13),'<CR>'),chr(10),'<LF>') as escaped_resolve_snippet
 from markers
)
select jsonb_build_object(
 'database',current_database(),'user',current_user,'server_version',version(),
 'function',(select jsonb_build_object(
   'signature',p.oid::regprocedure::text,'language',l.lanname,
   'security_definer',p.prosecdef,'config',p.proconfig,'owner',p.proowner::regrole::text,
   'acl',p.proacl,'raw_body_md5',md5(p.prosrc),
   'lf_body_md5',md5(replace(p.prosrc,E'\r\n',E'\n')),
   'body_status',case md5(replace(p.prosrc,E'\r\n',E'\n'))
     when '7fb5e08b689e4bd0f6f2ac1b98130396' then 'migration003_baseline'
     when 'f80bcdba939630909ac8cf32cc8b8280' then 'migration006_patched'
     else 'unknown_drift_inspect_definition' end,
   'function_definition',pg_get_functiondef(p.oid))
   from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid=to_regprocedure('public.p2_execute(text,jsonb)')),
 'marker_diagnostics',(select to_jsonb(m) from marker_diagnostics m),
 'migration006_artifacts',jsonb_build_object(
   'lifecycle_rpc',to_regprocedure('public.p2_table_qr_execute(text,jsonb)')::text,
   'label_normalizer',to_regprocedure('public.p2_normalize_table_label(text)')::text,
   'audit_table',to_regclass('public.table_qr_audit_log')::text,
   'retired_at_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='qr_codes' and column_name='retired_at')),
 'indexes',(select jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname)
   from pg_indexes where schemaname='public' and tablename in ('dining_tables','qr_codes')),
 'constraints',(select jsonb_agg(jsonb_build_object('relation',conrelid::regclass::text,'name',conname,'validated',convalidated,'definition',pg_get_constraintdef(oid)) order by conname)
   from pg_constraint where conrelid in ('public.dining_tables'::regclass,'public.qr_codes'::regclass)),
 'triggers',(select jsonb_agg(jsonb_build_object('relation',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid)) order by tgname)
   from pg_trigger where not tgisinternal and tgrelid in ('public.dining_tables'::regclass,'public.qr_codes'::regclass)),
 'row_counts',jsonb_build_object('dining_tables',(select count(*) from public.dining_tables),'qr_codes',(select count(*) from public.qr_codes),'table_sessions',(select count(*) from public.table_sessions))
 ,'privileges',jsonb_build_object(
   'authenticated_update_qr_active',has_column_privilege('authenticated','public.qr_codes','active','update'),
   'service_update_store_timestamp',has_column_privilege('service_role','public.stores','updated_at','update'),
   'anon_execute_resolver',has_function_privilege('anon','public.p2_execute(text,jsonb)','execute'),
   'service_execute_resolver',has_function_privilege('service_role','public.p2_execute(text,jsonb)','execute'))
) as production_diagnostic;
rollback;
