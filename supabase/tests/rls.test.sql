begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

-- Fixed owners are sufficient for policy tests. Foreign-key triggers are disabled only
-- while arranging rows inside this rolled-back test transaction.
set local session_replication_role = replica;
insert into public.money_map_settings (user_id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
insert into public.transactions (
  user_id, id, transaction_date, type, amount_cents, category,
  original_currency, original_amount_cents, exchange_rate_to_eur, exchange_rate_date
)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-a-move', current_date, 'income', 1000, 'Allowance', 'EUR', 1000, 1, current_date),
  ('22222222-2222-4222-8222-222222222222', 'owner-b-move', current_date, 'income', 2000, 'Gift', 'EUR', 2000, 1, current_date);
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select results_eq(
  'select count(*)::bigint from public.money_map_settings',
  array[1::bigint],
  'an authenticated user sees only their settings row'
);
select results_eq(
  'select count(*)::bigint from public.transactions',
  array[1::bigint],
  'an authenticated user sees only their transaction rows'
);
select throws_ok(
  $$insert into public.transactions (user_id, id, transaction_date, type, amount_cents, category)
    values ('22222222-2222-4222-8222-222222222222', 'forged', current_date, 'income', 100, 'Other')$$,
  '42501',
  null,
  'an authenticated user cannot insert for another owner'
);
select results_eq(
  $$with changed as (
      update public.transactions set note = 'forged'
      where user_id = '22222222-2222-4222-8222-222222222222'
      returning 1
    ) select count(*)::bigint from changed$$,
  array[0::bigint],
  'another owner''s rows cannot be updated'
);

select throws_ok(
  $$insert into public.transactions (
      user_id, id, transaction_date, type, amount_cents, category,
      original_currency, original_amount_cents, exchange_rate_to_eur, exchange_rate_date
    ) values (
      '11111111-1111-4111-8111-111111111111', 'bad-conversion', current_date, 'expense', 101, 'Fun',
      'USD', 100, 0.5, current_date
    )$$,
  '23514',
  null,
  'a converted EUR amount must match the stored original amount and rate'
);

select throws_ok(
  $$select public.replace_money_map(
    '{"version":1,"currency":"EUR","allocation":{"investment":20,"goal":30,"planned":30,"fun":10,"giving":9},"goal":{"name":"","targetAmount":0},"transactions":[]}'::jsonb
  )$$,
  '22023',
  'The five percentages must be whole numbers from 0 to 100 and total 100.',
  'restore rejects a backup whose allocation does not total 100'
);
select results_eq(
  'select count(*)::bigint from public.transactions',
  array[1::bigint],
  'a rejected restore leaves the current owner''s data untouched'
);

select public.reset_money_map();
select results_eq(
  'select count(*)::bigint from public.transactions',
  array[0::bigint],
  'reset deletes only the current owner''s transactions'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select results_eq(
  'select count(*)::bigint from public.transactions',
  array[1::bigint],
  'the other owner''s transaction survives another owner''s reset'
);

reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.transactions',
  '42501',
  null,
  'anonymous users have no transaction table privileges'
);

reset role;
select * from finish();
rollback;
