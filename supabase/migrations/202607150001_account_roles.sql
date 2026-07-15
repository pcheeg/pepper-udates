-- Account roles: the oldest existing account is the app administrator.
-- All current and future accounts otherwise remain standard users.
alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user'));

update public.profiles
set role = 'user';

update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  order by created_at asc
  limit 1
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Roles can only be changed through a trusted database/admin operation.
create or replace function public.protect_account_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.role := 'user';
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Account roles cannot be changed from the app';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_account_role on public.profiles;
create trigger protect_account_role
before insert or update on public.profiles
for each row execute function public.protect_account_role();

-- Administrators can inspect and moderate app records; users retain access
-- only to their own records through the existing owner policies.
drop policy if exists "admins access profiles" on public.profiles;
create policy "admins access profiles" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins access dogs" on public.dogs;
create policy "admins access dogs" on public.dogs
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins access pupdates" on public.pupdates;
create policy "admins access pupdates" on public.pupdates
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins access pupdate photos" on public.pupdate_photos;
create policy "admins access pupdate photos" on public.pupdate_photos
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins access care events" on public.care_events;
create policy "admins access care events" on public.care_events
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins access avatar objects" on storage.objects;
create policy "admins access avatar objects" on storage.objects
for all using (bucket_id = 'avatars' and public.is_admin())
with check (bucket_id = 'avatars' and public.is_admin());

drop policy if exists "admins access pupdate objects" on storage.objects;
create policy "admins access pupdate objects" on storage.objects
for all using (bucket_id = 'pupdates' and public.is_admin())
with check (bucket_id = 'pupdates' and public.is_admin());
