-- Preserve the currency Hanzo actually used while keeping every calculation in EUR cents.

alter table public.transactions
  add column if not exists original_currency text,
  add column if not exists original_amount_cents bigint,
  add column if not exists exchange_rate_to_eur numeric(20, 10),
  add column if not exists exchange_rate_date date;

update public.transactions
set
  original_currency = 'EUR',
  original_amount_cents = amount_cents,
  exchange_rate_to_eur = 1,
  exchange_rate_date = transaction_date
where original_currency is null
   or original_amount_cents is null
   or exchange_rate_to_eur is null
   or exchange_rate_date is null;

create or replace function public.fill_legacy_transaction_currency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Version 1 backup restore intentionally contains converted EUR amounts only.
  if new.original_currency is null
    and new.original_amount_cents is null
    and new.exchange_rate_to_eur is null
    and new.exchange_rate_date is null then
    new.original_currency := 'EUR';
    new.original_amount_cents := new.amount_cents;
    new.exchange_rate_to_eur := 1;
    new.exchange_rate_date := new.transaction_date;
  elsif new.original_currency is null
    or new.original_amount_cents is null
    or new.exchange_rate_to_eur is null
    or new.exchange_rate_date is null then
    raise exception 'Currency conversion details must be complete.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_fill_legacy_currency on public.transactions;
create trigger transactions_fill_legacy_currency
before insert on public.transactions
for each row execute function public.fill_legacy_transaction_currency();

alter table public.transactions
  alter column original_currency set not null,
  alter column original_amount_cents set not null,
  alter column exchange_rate_to_eur set not null,
  alter column exchange_rate_date set not null;

alter table public.transactions
  drop constraint if exists transactions_original_currency_check,
  drop constraint if exists transactions_original_amount_check,
  drop constraint if exists transactions_exchange_rate_check,
  drop constraint if exists transactions_exchange_rate_date_check,
  drop constraint if exists transactions_fx_amount_matches,
  drop constraint if exists transactions_eur_identity;

alter table public.transactions
  add constraint transactions_original_currency_check check (
    original_currency in (
      'EUR', 'USD', 'GBP', 'THB', 'CHF', 'JPY', 'CAD', 'AUD', 'CNY', 'HKD',
      'SGD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'INR',
      'KRW', 'NZD'
    )
  ),
  add constraint transactions_original_amount_check check (
    original_amount_cents between 1 and 100000000000
  ),
  add constraint transactions_exchange_rate_check check (
    exchange_rate_to_eur > 0 and exchange_rate_to_eur <= 1000000000
  ),
  add constraint transactions_exchange_rate_date_check check (
    exchange_rate_date <= transaction_date
  ),
  add constraint transactions_fx_amount_matches check (
    amount_cents = round(original_amount_cents::numeric * exchange_rate_to_eur)::bigint
  ),
  add constraint transactions_eur_identity check (
    original_currency <> 'EUR'
    or (
      original_amount_cents = amount_cents
      and exchange_rate_to_eur = 1
      and exchange_rate_date = transaction_date
    )
  );

comment on column public.transactions.amount_cents is
  'The transaction value converted to EUR cents; all balances and reports use this column.';
comment on column public.transactions.original_amount_cents is
  'The amount entered by the family in hundredths of original_currency.';
comment on column public.transactions.exchange_rate_to_eur is
  'EUR received for one unit of original_currency, rounded to ten decimal places.';
comment on column public.transactions.exchange_rate_date is
  'The observation date returned by the historical reference-rate service.';
