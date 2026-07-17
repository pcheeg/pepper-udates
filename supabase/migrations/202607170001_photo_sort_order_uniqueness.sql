alter table public.pupdate_photos
  drop constraint if exists pupdate_photos_pupdate_id_sort_order_key;

alter table public.pupdate_photos
  add constraint pupdate_photos_pupdate_id_sort_order_key
  unique (pupdate_id, sort_order);

notify pgrst, 'reload schema';
