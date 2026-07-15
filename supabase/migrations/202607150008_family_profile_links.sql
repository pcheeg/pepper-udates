alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 300);

drop policy if exists "family view profiles" on public.profiles;
create policy "family view profiles" on public.profiles
for select to authenticated using (true);

drop policy if exists "family view avatar objects" on storage.objects;
create policy "family view avatar objects" on storage.objects
for select to authenticated using (bucket_id = 'avatars');
