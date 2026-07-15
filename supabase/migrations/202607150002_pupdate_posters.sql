alter table public.pupdates
  add column if not exists poster_name text;

update public.pupdates as p
set poster_name = profiles.display_name
from public.profiles as profiles
where profiles.id = p.owner_id
  and (p.poster_name is null or btrim(p.poster_name) = '');

alter table public.pupdates
  drop constraint if exists pupdates_poster_name_length;

alter table public.pupdates
  add constraint pupdates_poster_name_length
  check (poster_name is null or char_length(poster_name) between 1 and 80);
