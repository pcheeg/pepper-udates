-- Allow any authenticated Pepper family member to change only the shared dog's photos.
create or replace function public.set_shared_dog_photo(
  target_dog_id uuid,
  photo_column text,
  photo_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if photo_column = 'avatar_path' then
    update public.dogs set avatar_path = photo_path, updated_at = now() where id = target_dog_id;
  elsif photo_column = 'photo_path' then
    update public.dogs set photo_path = photo_path, updated_at = now() where id = target_dog_id;
  else
    raise exception 'Only dog profile and header photos can be changed';
  end if;

  if not found then raise exception 'Dog profile not found'; end if;
end;
$$;

revoke all on function public.set_shared_dog_photo(uuid, text, text) from public;
grant execute on function public.set_shared_dog_photo(uuid, text, text) to authenticated;
