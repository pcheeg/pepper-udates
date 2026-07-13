create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_path text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  breed text not null check (char_length(breed) between 1 and 100),
  birthday date not null,
  bio text check (bio is null or char_length(bio) <= 500),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pupdates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  location text check (location is null or char_length(location) <= 160),
  event_date date,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pupdate_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pupdate_id uuid not null references public.pupdates(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pupdates_owner_created_idx on public.pupdates(owner_id, created_at desc);
create index if not exists pupdate_photos_post_idx on public.pupdate_photos(pupdate_id, sort_order);

alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.pupdates enable row level security;
alter table public.pupdate_photos enable row level security;

drop policy if exists "profiles own rows" on public.profiles;
create policy "profiles own rows" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "dogs own rows" on public.dogs;
create policy "dogs own rows" on public.dogs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "pupdates own rows" on public.pupdates;
create policy "pupdates own rows" on public.pupdates for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "pupdate photos own rows" on public.pupdate_photos;
create policy "pupdate photos own rows" on public.pupdate_photos for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic']),
       ('pupdates', 'pupdates', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar owner read" on storage.objects;
create policy "avatar owner read" on storage.objects for select using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar owner insert" on storage.objects;
create policy "avatar owner insert" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar owner delete" on storage.objects;
create policy "avatar owner delete" on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pupdate owner read" on storage.objects;
create policy "pupdate owner read" on storage.objects for select using (bucket_id = 'pupdates' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pupdate owner insert" on storage.objects;
create policy "pupdate owner insert" on storage.objects for insert with check (bucket_id = 'pupdates' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pupdate owner update" on storage.objects;
create policy "pupdate owner update" on storage.objects for update using (bucket_id = 'pupdates' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pupdate owner delete" on storage.objects;
create policy "pupdate owner delete" on storage.objects for delete using (bucket_id = 'pupdates' and (storage.foldername(name))[1] = auth.uid()::text);
