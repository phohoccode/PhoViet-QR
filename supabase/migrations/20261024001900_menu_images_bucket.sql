-- Storage metadata only. Object writes/removals MUST use the Storage API.
begin;
set local lock_timeout='3s';
do $audit$
begin
 if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
  raise exception 'OWNER HF01: enable Supabase Storage before applying bucket migration';
 end if;
 -- Never silently weaken/replace an existing write policy for this bucket.
 -- Our proxy-only model intentionally grants no direct browser write policy.
 if exists(select 1 from storage.buckets where id='menu-images' and name<>'menu-images') then
  raise exception 'OWNER HF01: audit existing menu-images bucket';
 end if;
 if exists(select 1 from storage.buckets where id='menu-images' and
   (not public or file_size_limit is distinct from 5242880 or
    cardinality(allowed_mime_types) is distinct from 3 or
    not (allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]))) then
  raise exception 'OWNER HF01: existing menu-images bucket settings are incompatible; audit before retry';
 end if;
end; $audit$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('menu-images','menu-images',true,5242880,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do nothing;
-- Restrictive policies also fence broad permissive policies from another bucket.
-- The service_role Storage API bypasses RLS only after server owner checks.
drop policy if exists hf01_menu_images_insert_fence on storage.objects;
create policy hf01_menu_images_insert_fence on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'menu-images');
drop policy if exists hf01_menu_images_update_fence on storage.objects;
create policy hf01_menu_images_update_fence on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'menu-images') with check(bucket_id<>'menu-images');
drop policy if exists hf01_menu_images_delete_fence on storage.objects;
create policy hf01_menu_images_delete_fence on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'menu-images');
-- Public bucket serving is handled by Storage. SQL listing isn't public.
commit;
