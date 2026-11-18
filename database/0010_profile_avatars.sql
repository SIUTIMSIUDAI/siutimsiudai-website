-- 0010_profile_avatars.sql  ·  Optional profile photos, synced to the account and shown in My Family
--
-- profiles.avatar_path points at the user's current photo in the private `avatars` bucket (null for
-- none). It sits on profiles, so the existing policies decide who can learn it: own_profiles (yourself)
-- and manager_read_profiles (a manager reading each dependent), the same rule as display_name.
--
-- Files are stored as avatars/<auth.uid()>/<epoch ms>.jpg, or .png: the photo picker keeps
-- screenshots as PNG, so the bucket takes JPEG or PNG up to 5 MB. The storage policies below compare
-- the FIRST path segment to the caller: the owner has full control of their own folder, and a manager may
-- read a dependent's folder. The uid is compared AS TEXT rather than casting the path segment to uuid,
-- so a malformed name can never raise a cast error during policy evaluation (the pattern drafted in
-- 0008 for meal-images). Nothing else can read or write the bucket.
--
-- delete-account removes the user's folder before deleting the auth user, because Storage does not
-- cascade with auth.users. That function fails while this bucket is missing, so apply this first.

begin;

alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists avatars_owner on storage.objects;
create policy avatars_owner on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_manager_read on storage.objects;
create policy avatars_manager_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1
      from public.family_members mgr
      join public.family_members dep on dep.group_id = mgr.group_id
      where mgr.user_id = auth.uid()
        and mgr.role = 'manager'
        and dep.role = 'dependent'
        and dep.user_id::text = (storage.foldername(name))[1]
    )
  );

notify pgrst, 'reload schema';

commit;
