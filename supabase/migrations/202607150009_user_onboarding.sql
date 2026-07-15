-- New accounts create only their own Hooman profile and join the existing dog.
drop policy if exists "family view shared dog" on public.dogs;
create policy "family view shared dog" on public.dogs
for select to authenticated using (true);

drop policy if exists "family view shared pupdate media" on storage.objects;
create policy "family view shared pupdate media" on storage.objects
for select to authenticated using (bucket_id = 'pupdates');
