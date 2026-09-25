create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Subscriptions contain device credentials and are only accessed by the server
-- through the service role. No client RLS policies are intentionally created.

create table if not exists public.pupdate_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_requested_at timestamptz not null
);

alter table public.pupdate_requests enable row level security;

create or replace function public.request_pupdate()
returns table (accepted boolean, next_allowed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_at timestamptz;
  available_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.pupdate_requests (user_id, last_requested_at)
  values (auth.uid(), clock_timestamp())
  on conflict (user_id) do update
    set last_requested_at = excluded.last_requested_at
    where pupdate_requests.last_requested_at <= clock_timestamp() - interval '6 hours'
  returning last_requested_at into requested_at;

  if requested_at is not null then
    return query select true, requested_at + interval '6 hours';
    return;
  end if;

  select last_requested_at + interval '6 hours'
  into available_at
  from public.pupdate_requests
  where user_id = auth.uid();

  return query select false, available_at;
end;
$$;

revoke all on function public.request_pupdate() from public;
grant execute on function public.request_pupdate() to authenticated;

create table if not exists public.push_dispatches (
  pupdate_id uuid primary key references public.pupdates(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.push_dispatches enable row level security;

