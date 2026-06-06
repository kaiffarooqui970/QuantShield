-- Run this in your Supabase SQL editor

-- 1. Profiles table (extends auth.users)
create table if not exists public.profiles (
  id                    uuid primary key references auth.users on delete cascade,
  email                 text,
  full_name             text,
  tier                  text not null default 'free' check (tier in ('free', 'pro', 'enterprise')),
  stripe_customer_id    text,
  stripe_subscription_id text,
  api_key               text unique,
  created_at            timestamptz default now()
);

-- 2. Simulation usage (free tier daily limit)
create table if not exists public.simulation_usage (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  date      date not null default current_date,
  count     integer not null default 0,
  unique (user_id, date)
);

-- 3. Row Level Security
alter table public.profiles enable row level security;
alter table public.simulation_usage enable row level security;

-- Users can read/update their own profile
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Backend (service role) bypasses RLS — no extra policies needed for service key.

-- 4. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, tier)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'free'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
