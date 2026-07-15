create table if not exists public.pupdate_likes (
  id uuid primary key default gen_random_uuid(),
  pupdate_id uuid not null references public.pupdates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pupdate_id, user_id)
);

create table if not exists public.pupdate_comments (
  id uuid primary key default gen_random_uuid(),
  pupdate_id uuid not null references public.pupdates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists pupdate_likes_post_idx on public.pupdate_likes(pupdate_id, created_at);
create index if not exists pupdate_comments_post_idx on public.pupdate_comments(pupdate_id, created_at);

alter table public.pupdate_likes enable row level security;
alter table public.pupdate_comments enable row level security;

drop policy if exists "authenticated view likes" on public.pupdate_likes;
create policy "authenticated view likes" on public.pupdate_likes
for select to authenticated using (true);
drop policy if exists "users manage own likes" on public.pupdate_likes;
create policy "users manage own likes" on public.pupdate_likes
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "authenticated view comments" on public.pupdate_comments;
create policy "authenticated view comments" on public.pupdate_comments
for select to authenticated using (true);
drop policy if exists "users manage own comments" on public.pupdate_comments;
create policy "users manage own comments" on public.pupdate_comments
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
