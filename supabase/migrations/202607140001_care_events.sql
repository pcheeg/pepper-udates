create table if not exists public.care_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  event_type text not null check (event_type in ('walk', 'feed')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists care_events_owner_dog_time_idx
  on public.care_events(owner_id, dog_id, occurred_at desc);

alter table public.care_events enable row level security;

drop policy if exists "care events own rows" on public.care_events;
create policy "care events own rows"
  on public.care_events
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
