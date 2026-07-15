create policy "admins view stored pupdate media for moderation" on storage.objects
for select using (bucket_id in ('pupdates', 'avatars') and public.is_admin());
