-- Hanzo's Money Map: authenticated, per-user settings and transactions.

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

create table if not exists public.money_map_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'EUR' check (currency = 'EUR'),
  investment_percent smallint not null default 20 check (investment_percent between 0 and 100),
  goal_percent smallint not null default 30 check (goal_percent between 0 and 100),
  planned_percent smallint not null default 30 check (planned_percent between 0 and 100),
  fun_percent smallint not null default 10 check (fun_percent between 0 and 100),
  giving_percent smallint not null default 10 check (giving_percent between 0 and 100),
  goal_name text not null default '' check (char_length(goal_name) <= 60),
  goal_target_cents bigint not null default 0 check (goal_target_cents between 0 and 100000000000),
  updated_at timestamptz not null default now(),
  constraint allocation_totals_100 check (
    investment_percent + goal_percent + planned_percent + fun_percent + giving_percent = 100
  )
);

create table if not exists public.transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(btrim(id)) between 1 and 120),
  transaction_date date not null,
  type text not null check (type in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  category text not null,
  note text not null default '' check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint transaction_category_matches_type check (
    (type = 'income' and category in ('Allowance', 'Chore', 'Gift', 'Sale', 'Other'))
    or
    (type = 'expense' and category in ('Food & Drink', 'School', 'Transport', 'Planned Purchase', 'Fun', 'Giving', 'Goal Purchase', 'Other'))
  )
);

create index if not exists transactions_owner_date_created_idx
  on public.transactions (user_id, transaction_date desc, created_at desc);

drop trigger if exists money_map_settings_set_updated_at on public.money_map_settings;
create trigger money_map_settings_set_updated_at
before update on public.money_map_settings
for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.reject_future_transaction_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.transaction_date > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Transaction dates cannot be in the future.' using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_reject_future_date on public.transactions;
create trigger transactions_reject_future_date
before insert or update of transaction_date on public.transactions
for each row execute function public.reject_future_transaction_date();

alter table public.money_map_settings enable row level security;
alter table public.transactions enable row level security;

revoke all on table public.money_map_settings from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
grant select, insert, update, delete on table public.money_map_settings to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;

drop policy if exists "Users select their own money map settings" on public.money_map_settings;
create policy "Users select their own money map settings"
on public.money_map_settings for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own money map settings" on public.money_map_settings;
create policy "Users insert their own money map settings"
on public.money_map_settings for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own money map settings" on public.money_map_settings;
create policy "Users update their own money map settings"
on public.money_map_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own money map settings" on public.money_map_settings;
create policy "Users delete their own money map settings"
on public.money_map_settings for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users select their own transactions" on public.transactions;
create policy "Users select their own transactions"
on public.transactions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own transactions" on public.transactions;
create policy "Users insert their own transactions"
on public.transactions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own transactions" on public.transactions;
create policy "Users update their own transactions"
on public.transactions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own transactions" on public.transactions;
create policy "Users delete their own transactions"
on public.transactions for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.reset_money_map()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  delete from public.transactions where user_id = current_user_id;

  insert into public.money_map_settings (
    user_id, currency, investment_percent, goal_percent, planned_percent,
    fun_percent, giving_percent, goal_name, goal_target_cents
  ) values (
    current_user_id, 'EUR', 20, 30, 30, 10, 10, '', 0
  )
  on conflict (user_id) do update set
    currency = excluded.currency,
    investment_percent = excluded.investment_percent,
    goal_percent = excluded.goal_percent,
    planned_percent = excluded.planned_percent,
    fun_percent = excluded.fun_percent,
    giving_percent = excluded.giving_percent,
    goal_name = excluded.goal_name,
    goal_target_cents = excluded.goal_target_cents;
end;
$$;

create or replace function public.replace_money_map(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  allocation_json jsonb;
  goal_json jsonb;
  item jsonb;
  seen_ids text[] := array[]::text[];
  investment_value integer;
  goal_value integer;
  planned_value integer;
  fun_value integer;
  giving_value integer;
  target_euros numeric;
  item_id text;
  item_type text;
  item_category text;
  item_note text;
  item_date_text text;
  item_date date;
  item_amount numeric;
  item_created_ms numeric;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'The backup must contain one data object.' using errcode = '22023';
  end if;
  if jsonb_typeof(payload->'version') is distinct from 'number'
    or (payload->>'version')::numeric <> 1 then
    raise exception 'This backup version is not supported.' using errcode = '22023';
  end if;
  if jsonb_typeof(payload->'currency') is distinct from 'string'
    or payload->>'currency' is distinct from 'EUR' then
    raise exception 'This tracker only supports EUR backups.' using errcode = '22023';
  end if;

  allocation_json := payload->'allocation';
  if allocation_json is null or jsonb_typeof(allocation_json) is distinct from 'object' then
    raise exception 'The five-part money plan is missing.' using errcode = '22023';
  end if;
  if jsonb_typeof(allocation_json->'investment') is distinct from 'number'
    or jsonb_typeof(allocation_json->'goal') is distinct from 'number'
    or jsonb_typeof(allocation_json->'planned') is distinct from 'number'
    or jsonb_typeof(allocation_json->'fun') is distinct from 'number'
    or jsonb_typeof(allocation_json->'giving') is distinct from 'number' then
    raise exception 'The five-part money plan is invalid.' using errcode = '22023';
  end if;
  if (allocation_json->>'investment')::numeric <> trunc((allocation_json->>'investment')::numeric)
    or (allocation_json->>'goal')::numeric <> trunc((allocation_json->>'goal')::numeric)
    or (allocation_json->>'planned')::numeric <> trunc((allocation_json->>'planned')::numeric)
    or (allocation_json->>'fun')::numeric <> trunc((allocation_json->>'fun')::numeric)
    or (allocation_json->>'giving')::numeric <> trunc((allocation_json->>'giving')::numeric) then
    raise exception 'The five percentages must be whole numbers.' using errcode = '22023';
  end if;
  investment_value := (allocation_json->>'investment')::integer;
  goal_value := (allocation_json->>'goal')::integer;
  planned_value := (allocation_json->>'planned')::integer;
  fun_value := (allocation_json->>'fun')::integer;
  giving_value := (allocation_json->>'giving')::integer;
  if investment_value not between 0 and 100
    or goal_value not between 0 and 100
    or planned_value not between 0 and 100
    or fun_value not between 0 and 100
    or giving_value not between 0 and 100
    or investment_value + goal_value + planned_value + fun_value + giving_value <> 100 then
    raise exception 'The five percentages must be whole numbers from 0 to 100 and total 100.' using errcode = '22023';
  end if;

  goal_json := payload->'goal';
  if goal_json is null or jsonb_typeof(goal_json) is distinct from 'object'
    or jsonb_typeof(goal_json->'name') is distinct from 'string'
    or jsonb_typeof(goal_json->'targetAmount') is distinct from 'number' then
    raise exception 'The big goal details are invalid.' using errcode = '22023';
  end if;
  target_euros := (goal_json->>'targetAmount')::numeric;
  if char_length(btrim(goal_json->>'name')) > 60
    or target_euros < 0
    or target_euros > 1000000000
    or round(target_euros, 2) <> target_euros then
    raise exception 'The big goal details are invalid.' using errcode = '22023';
  end if;

  if jsonb_typeof(payload->'transactions') is distinct from 'array' then
    raise exception 'The transaction list is invalid.' using errcode = '22023';
  end if;
  if jsonb_array_length(payload->'transactions') > 10000 then
    raise exception 'The transaction list is invalid or too large.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(payload->'transactions') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'date') is distinct from 'string'
      or jsonb_typeof(item->'type') is distinct from 'string'
      or jsonb_typeof(item->'amount') is distinct from 'number'
      or jsonb_typeof(item->'category') is distinct from 'string'
      or jsonb_typeof(item->'note') is distinct from 'string'
      or jsonb_typeof(item->'createdAt') is distinct from 'number' then
      raise exception 'A money move is malformed.' using errcode = '22023';
    end if;

    item_id := item->>'id';
    item_date_text := item->>'date';
    item_type := item->>'type';
    item_amount := (item->>'amount')::numeric;
    item_category := item->>'category';
    item_note := btrim(item->>'note');
    item_created_ms := (item->>'createdAt')::numeric;

    if char_length(btrim(item_id)) not between 1 and 120 or item_id = any(seen_ids) then
      raise exception 'A money move has an invalid or repeated ID.' using errcode = '22023';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    if item_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'A money move has an invalid date.' using errcode = '22007';
    end if;
    item_date := item_date_text::date;
    if to_char(item_date, 'YYYY-MM-DD') <> item_date_text
      or item_date > (now() at time zone 'Europe/Berlin')::date then
      raise exception 'A money move has an invalid or future date.' using errcode = '22007';
    end if;
    if item_type not in ('income', 'expense') then
      raise exception 'A money move has an invalid type.' using errcode = '22023';
    end if;
    if item_amount <= 0 or item_amount > 1000000000 or round(item_amount, 2) <> item_amount then
      raise exception 'A money move has an invalid amount.' using errcode = '22023';
    end if;
    if not (
      (item_type = 'income' and item_category in ('Allowance', 'Chore', 'Gift', 'Sale', 'Other'))
      or
      (item_type = 'expense' and item_category in ('Food & Drink', 'School', 'Transport', 'Planned Purchase', 'Fun', 'Giving', 'Goal Purchase', 'Other'))
    ) then
      raise exception 'A money move has an unknown category.' using errcode = '22023';
    end if;
    if char_length(item_note) > 120 or item_created_ms <= 0 then
      raise exception 'A money move has invalid note or creation time.' using errcode = '22023';
    end if;
  end loop;

  insert into public.money_map_settings (
    user_id, currency, investment_percent, goal_percent, planned_percent,
    fun_percent, giving_percent, goal_name, goal_target_cents
  ) values (
    current_user_id,
    'EUR',
    investment_value,
    goal_value,
    planned_value,
    fun_value,
    giving_value,
    btrim(goal_json->>'name'),
    round(target_euros * 100)::bigint
  )
  on conflict (user_id) do update set
    currency = excluded.currency,
    investment_percent = excluded.investment_percent,
    goal_percent = excluded.goal_percent,
    planned_percent = excluded.planned_percent,
    fun_percent = excluded.fun_percent,
    giving_percent = excluded.giving_percent,
    goal_name = excluded.goal_name,
    goal_target_cents = excluded.goal_target_cents;

  delete from public.transactions where user_id = current_user_id;

  for item in select value from jsonb_array_elements(payload->'transactions') loop
    insert into public.transactions (
      user_id, id, transaction_date, type, amount_cents, category, note, created_at
    ) values (
      current_user_id,
      item->>'id',
      (item->>'date')::date,
      item->>'type',
      round((item->>'amount')::numeric * 100)::bigint,
      item->>'category',
      btrim(item->>'note'),
      to_timestamp((item->>'createdAt')::numeric / 1000)
    );
  end loop;
end;
$$;

revoke all on function public.reset_money_map() from public, anon;
revoke all on function public.replace_money_map(jsonb) from public, anon;
grant execute on function public.reset_money_map() to authenticated;
grant execute on function public.replace_money_map(jsonb) to authenticated;
