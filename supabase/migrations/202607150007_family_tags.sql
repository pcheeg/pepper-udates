alter table public.profiles
  add column if not exists member_tag text not null default 'HOOMAN',
  add column if not exists tag_color text not null default 'purple';

update public.profiles set member_tag = 'HOOMAN' where btrim(member_tag) = '';
update public.profiles set tag_color = 'purple' where tag_color is null;

alter table public.profiles drop constraint if exists profiles_member_tag_length;
alter table public.profiles add constraint profiles_member_tag_length
check (char_length(btrim(member_tag)) between 1 and 24);

alter table public.profiles drop constraint if exists profiles_tag_color_check;
alter table public.profiles add constraint profiles_tag_color_check
check (tag_color in ('purple', 'red', 'orange', 'yellow', 'green', 'light-blue', 'indigo', 'violet', 'pink'));

create policy "admins update family tags" on public.profiles
for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.protect_family_tag_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.member_tag is distinct from old.member_tag and not public.is_admin() then
    raise exception 'Only the Chief Hooman can change family tags';
  end if;

  if public.is_admin() and auth.uid() is distinct from old.id then
    if new.display_name is distinct from old.display_name
      or new.avatar_path is distinct from old.avatar_path
      or new.onboarding_complete is distinct from old.onboarding_complete
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at then
      raise exception 'Administrators can only change family tags and colours';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_family_tag_fields on public.profiles;
create trigger protect_family_tag_fields
before update on public.profiles
for each row execute function public.protect_family_tag_fields();
