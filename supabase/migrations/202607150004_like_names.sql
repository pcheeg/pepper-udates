alter table public.pupdate_likes
  add column if not exists liker_name text;

update public.pupdate_likes as likes
set liker_name = profiles.display_name
from public.profiles as profiles
where profiles.id = likes.user_id
  and (likes.liker_name is null or btrim(likes.liker_name) = '');

alter table public.pupdate_likes
  drop constraint if exists pupdate_likes_liker_name_length;

alter table public.pupdate_likes
  add constraint pupdate_likes_liker_name_length
  check (liker_name is null or char_length(liker_name) between 1 and 80);

create or replace function public.set_like_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    select display_name into new.liker_name
    from public.profiles
    where id = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_like_name on public.pupdate_likes;
create trigger set_like_name
before insert on public.pupdate_likes
for each row execute function public.set_like_name();
