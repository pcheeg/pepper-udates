-- Every signed-in Hooman belongs to the same private Pepper family.
-- Reads are shared; existing owner/admin policies continue to control writes.

drop policy if exists "family view profiles" on public.profiles;
create policy "family view profiles" on public.profiles
for select to authenticated using (true);

drop policy if exists "family view dog" on public.dogs;
create policy "family view dog" on public.dogs
for select to authenticated using (true);

drop policy if exists "family view pupdates" on public.pupdates;
create policy "family view pupdates" on public.pupdates
for select to authenticated using (true);

drop policy if exists "family view pupdate photos" on public.pupdate_photos;
create policy "family view pupdate photos" on public.pupdate_photos
for select to authenticated using (true);

drop policy if exists "family view care events" on public.care_events;
create policy "family view care events" on public.care_events
for select to authenticated using (true);

drop policy if exists "family view likes" on public.pupdate_likes;
create policy "family view likes" on public.pupdate_likes
for select to authenticated using (true);

drop policy if exists "family view comments" on public.pupdate_comments;
create policy "family view comments" on public.pupdate_comments
for select to authenticated using (true);

drop policy if exists "family view avatars" on storage.objects;
create policy "family view avatars" on storage.objects
for select to authenticated using (bucket_id = 'avatars');

drop policy if exists "family view pupdate media" on storage.objects;
create policy "family view pupdate media" on storage.objects
for select to authenticated using (bucket_id = 'pupdates');
