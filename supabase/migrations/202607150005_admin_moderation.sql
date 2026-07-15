-- Replace broad administrator access with limited moderation permissions.
drop policy if exists "admins access profiles" on public.profiles;
drop policy if exists "admins access dogs" on public.dogs;
drop policy if exists "admins access pupdates" on public.pupdates;
drop policy if exists "admins access pupdate photos" on public.pupdate_photos;
drop policy if exists "admins access care events" on public.care_events;
drop policy if exists "admins access avatar objects" on storage.objects;
drop policy if exists "admins access pupdate objects" on storage.objects;
drop policy if exists "admins access likes" on public.pupdate_likes;
drop policy if exists "admins access comments" on public.pupdate_comments;

create policy "admins view profiles for moderation" on public.profiles
for select using (public.is_admin());

create policy "admins view pupdates for moderation" on public.pupdates
for select using (public.is_admin());

create policy "admins view dogs for account cleanup" on public.dogs
for select using (public.is_admin());

create policy "admins view pupdate photos for cleanup" on public.pupdate_photos
for select using (public.is_admin());

create policy "admins delete pupdates" on public.pupdates
for delete using (public.is_admin());

create policy "admins view comments for moderation" on public.pupdate_comments
for select using (public.is_admin());

create policy "admins delete comments" on public.pupdate_comments
for delete using (public.is_admin());

create policy "admins delete stored media" on storage.objects
for delete using (bucket_id in ('avatars', 'pupdates') and public.is_admin());

create or replace function public.admin_delete_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot remove your own administrator account';
  end if;
  delete from auth.users where id = target_user_id;
end;
$$;

create or replace function public.admin_delete_pupdate(target_pupdate_id uuid)
returns void
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  delete from public.pupdates where id = target_pupdate_id;
end;
$$;

create or replace function public.admin_delete_comment(target_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  delete from public.pupdate_comments where id = target_comment_id;
end;
$$;

revoke all on function public.admin_delete_account(uuid) from public;
revoke all on function public.admin_delete_pupdate(uuid) from public;
revoke all on function public.admin_delete_comment(uuid) from public;
grant execute on function public.admin_delete_account(uuid) to authenticated;
grant execute on function public.admin_delete_pupdate(uuid) to authenticated;
grant execute on function public.admin_delete_comment(uuid) to authenticated;
