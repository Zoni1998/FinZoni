-- FinZoni: standalone personal Open Finance ledger.
-- Apply on Supabase before enabling the feature. Does NOT change public.finances.
create table if not exists public.open_finance_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  label text not null check (char_length(label) <= 80),
  status text,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create table if not exists public.open_finance_accounts (
  user_id uuid not null,
  item_id uuid not null,
  account_id uuid not null,
  name text not null,
  kind text not null check (kind in ('BANK', 'CREDIT')),
  subtype text,
  balance numeric(18, 2),
  currency_code text not null default 'BRL',
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id),
  foreign key (user_id, item_id) references public.open_finance_items (user_id, item_id) on delete cascade
);
create table if not exists public.open_finance_transactions (
  user_id uuid not null,
  account_id uuid not null,
  transaction_id uuid not null,
  occurred_on date not null,
  description text not null,
  amount numeric(18, 2) not null,
  category text,
  transaction_type text,
  status text,
  updated_at timestamptz not null default now(),
  primary key (user_id, transaction_id),
  foreign key (user_id, account_id) references public.open_finance_accounts (user_id, account_id) on delete cascade
);
create index if not exists of_transactions_user_date
  on public.open_finance_transactions (user_id, occurred_on desc);
alter table public.open_finance_items enable row level security;
alter table public.open_finance_accounts enable row level security;
alter table public.open_finance_transactions enable row level security;
revoke all on public.open_finance_items from anon;
revoke all on public.open_finance_accounts from anon;
revoke all on public.open_finance_transactions from anon;
grant select, insert, update, delete on public.open_finance_items to authenticated;
grant select, insert, update, delete on public.open_finance_accounts to authenticated;
grant select, insert, update, delete on public.open_finance_transactions to authenticated;
drop policy if exists "OF owner" on public.open_finance_items;
create policy "OF owner" on public.open_finance_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "OF owner" on public.open_finance_accounts;
create policy "OF owner" on public.open_finance_accounts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "OF owner" on public.open_finance_transactions;
create policy "OF owner" on public.open_finance_transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
