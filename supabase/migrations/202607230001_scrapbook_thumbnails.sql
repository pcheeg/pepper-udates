alter table public.pupdate_photos
  add column if not exists thumbnail_path text;

create index if not exists pupdate_photos_missing_thumbnail_idx
  on public.pupdate_photos(created_at desc)
  where thumbnail_path is null;
