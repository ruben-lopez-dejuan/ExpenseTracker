create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  icon text not null default 'pricetag-outline',
  color text not null default '#6366F1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  description text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  transaction_date timestamptz not null default now(),
  status text not null default 'completed' check (status in ('completed', 'planned')),
  source text not null default 'manual' check (source in ('manual', 'text', 'voice', 'recurring')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_category_owner_fkey
    foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete restrict
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary_period text not null default 'month'
    check (summary_period in ('day', 'week', 'month', 'year', 'custom')),
  custom_start_date date,
  custom_end_date date,
  updated_at timestamptz not null default now(),
  check (
    summary_period <> 'custom'
    or (
      custom_start_date is not null
      and custom_end_date is not null
      and custom_start_date <= custom_end_date
    )
  )
);

create index if not exists categories_user_created_idx
  on public.categories(user_id, created_at);
create index if not exists expenses_user_date_idx
  on public.expenses(user_id, transaction_date desc);
create index if not exists expenses_user_category_idx
  on public.expenses(user_id, category_id);

alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.user_preferences enable row level security;

revoke all on public.categories, public.expenses, public.user_preferences from anon;
grant select, insert, update, delete
  on public.categories, public.expenses, public.user_preferences
  to authenticated;

create policy categories_select_own on public.categories
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy categories_insert_own on public.categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy categories_update_own on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy categories_delete_own on public.categories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy expenses_select_own on public.expenses
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy expenses_insert_own on public.expenses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy expenses_update_own on public.expenses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy expenses_delete_own on public.expenses
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_preferences_delete_own on public.user_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);
