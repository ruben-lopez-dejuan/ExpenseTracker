-- Bring existing projects to the same shape as a clean installation.
alter table public.categories
  add column if not exists description text not null default '',
  add column if not exists icon text not null default 'pricetag-outline',
  add column if not exists color text not null default '#6366F1',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.expenses
  add column if not exists description text not null default '',
  add column if not exists currency text not null default 'EUR',
  add column if not exists transaction_date timestamptz not null default now(),
  add column if not exists status text not null default 'completed',
  add column if not exists source text not null default 'manual',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists recurring_id uuid;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary_period text not null default 'month',
  custom_start_date date,
  custom_end_date date,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences
  add column if not exists summary_period text not null default 'month',
  add column if not exists custom_start_date date,
  add column if not exists custom_end_date date,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_id_user_id_key'
  ) then
    alter table public.categories
      add constraint categories_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recurring_transactions'::regclass
      and conname = 'recurring_transactions_id_user_id_key'
  ) then
    alter table public.recurring_transactions
      add constraint recurring_transactions_id_user_id_key unique (id, user_id);
  end if;
end;
$$;

alter table public.expenses
  drop constraint if exists expenses_category_id_fkey,
  drop constraint if exists expenses_category_owner_fkey,
  drop constraint if exists expenses_recurring_id_fkey,
  drop constraint if exists expenses_recurring_owner_fkey;
alter table public.expenses
  add constraint expenses_category_owner_fkey
    foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete restrict,
  add constraint expenses_recurring_owner_fkey
    foreign key (recurring_id, user_id)
    references public.recurring_transactions(id, user_id)
    on delete set null (recurring_id);

alter table public.incomes
  drop constraint if exists incomes_recurring_id_fkey,
  drop constraint if exists incomes_recurring_owner_fkey;
alter table public.incomes
  add constraint incomes_recurring_owner_fkey
    foreign key (recurring_id, user_id)
    references public.recurring_transactions(id, user_id)
    on delete set null (recurring_id);

alter table public.budgets
  drop constraint if exists budgets_category_id_fkey,
  drop constraint if exists budgets_category_owner_fkey;
alter table public.budgets
  add constraint budgets_category_owner_fkey
    foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete cascade;

alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_category_id_fkey,
  drop constraint if exists recurring_transactions_category_owner_fkey;
alter table public.recurring_transactions
  add constraint recurring_transactions_category_owner_fkey
    foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete restrict;

create index if not exists categories_user_created_idx
  on public.categories(user_id, created_at);
create index if not exists expenses_user_date_idx
  on public.expenses(user_id, transaction_date desc);
create index if not exists expenses_user_category_idx
  on public.expenses(user_id, category_id);
create index if not exists incomes_user_date_idx
  on public.incomes(user_id, transaction_date desc);
create index if not exists budgets_user_month_idx
  on public.budgets(user_id, month_start desc);
create index if not exists recurring_user_next_idx
  on public.recurring_transactions(user_id, next_run_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();
drop trigger if exists incomes_set_updated_at on public.incomes;
create trigger incomes_set_updated_at
  before update on public.incomes
  for each row execute function public.set_updated_at();
drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();
drop trigger if exists recurring_transactions_set_updated_at on public.recurring_transactions;
create trigger recurring_transactions_set_updated_at
  before update on public.recurring_transactions
  for each row execute function public.set_updated_at();
drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.incomes enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.user_preferences enable row level security;

alter table public.categories force row level security;
alter table public.expenses force row level security;
alter table public.incomes force row level security;
alter table public.budgets force row level security;
alter table public.recurring_transactions force row level security;
alter table public.user_preferences force row level security;

revoke all on public.categories, public.expenses, public.incomes,
  public.budgets, public.recurring_transactions, public.user_preferences from anon;
revoke all on public.categories, public.expenses, public.incomes,
  public.budgets, public.recurring_transactions, public.user_preferences from authenticated;
grant select, insert, update, delete on public.categories, public.expenses, public.incomes,
  public.budgets, public.recurring_transactions, public.user_preferences to authenticated;

drop policy if exists "Users manage own categories" on public.categories;
drop policy if exists "Users manage own expenses" on public.expenses;
drop policy if exists "Users manage own incomes" on public.incomes;
drop policy if exists "Users manage own budgets" on public.budgets;
drop policy if exists "Users manage own recurring transactions" on public.recurring_transactions;
drop policy if exists "Users manage own preferences" on public.user_preferences;

drop policy if exists categories_select_own on public.categories;
drop policy if exists categories_insert_own on public.categories;
drop policy if exists categories_update_own on public.categories;
drop policy if exists categories_delete_own on public.categories;
create policy categories_select_own on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy categories_insert_own on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy categories_update_own on public.categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy categories_delete_own on public.categories for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists expenses_select_own on public.expenses;
drop policy if exists expenses_insert_own on public.expenses;
drop policy if exists expenses_update_own on public.expenses;
drop policy if exists expenses_delete_own on public.expenses;
create policy expenses_select_own on public.expenses for select to authenticated using ((select auth.uid()) = user_id);
create policy expenses_insert_own on public.expenses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy expenses_update_own on public.expenses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy expenses_delete_own on public.expenses for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists incomes_select_own on public.incomes;
drop policy if exists incomes_insert_own on public.incomes;
drop policy if exists incomes_update_own on public.incomes;
drop policy if exists incomes_delete_own on public.incomes;
create policy incomes_select_own on public.incomes for select to authenticated using ((select auth.uid()) = user_id);
create policy incomes_insert_own on public.incomes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy incomes_update_own on public.incomes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy incomes_delete_own on public.incomes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists budgets_select_own on public.budgets;
drop policy if exists budgets_insert_own on public.budgets;
drop policy if exists budgets_update_own on public.budgets;
drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_select_own on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy budgets_insert_own on public.budgets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy budgets_update_own on public.budgets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy budgets_delete_own on public.budgets for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists recurring_transactions_select_own on public.recurring_transactions;
drop policy if exists recurring_transactions_insert_own on public.recurring_transactions;
drop policy if exists recurring_transactions_update_own on public.recurring_transactions;
drop policy if exists recurring_transactions_delete_own on public.recurring_transactions;
create policy recurring_transactions_select_own on public.recurring_transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy recurring_transactions_insert_own on public.recurring_transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy recurring_transactions_update_own on public.recurring_transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy recurring_transactions_delete_own on public.recurring_transactions for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists user_preferences_select_own on public.user_preferences;
drop policy if exists user_preferences_insert_own on public.user_preferences;
drop policy if exists user_preferences_update_own on public.user_preferences;
drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy user_preferences_insert_own on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_preferences_update_own on public.user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_preferences_delete_own on public.user_preferences for delete to authenticated using ((select auth.uid()) = user_id);
