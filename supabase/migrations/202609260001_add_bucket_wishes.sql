alter table public.money_map_settings
  add column if not exists investment_wish text not null default '',
  add column if not exists goal_wish text not null default '',
  add column if not exists planned_wish text not null default '',
  add column if not exists fun_wish text not null default '',
  add column if not exists giving_wish text not null default '';

alter table public.money_map_settings
  drop constraint if exists money_map_settings_investment_wish_check,
  drop constraint if exists money_map_settings_goal_wish_check,
  drop constraint if exists money_map_settings_planned_wish_check,
  drop constraint if exists money_map_settings_fun_wish_check,
  drop constraint if exists money_map_settings_giving_wish_check;

alter table public.money_map_settings
  add constraint money_map_settings_investment_wish_check check (char_length(investment_wish) <= 80),
  add constraint money_map_settings_goal_wish_check check (char_length(goal_wish) <= 80),
  add constraint money_map_settings_planned_wish_check check (char_length(planned_wish) <= 80),
  add constraint money_map_settings_fun_wish_check check (char_length(fun_wish) <= 80),
  add constraint money_map_settings_giving_wish_check check (char_length(giving_wish) <= 80);

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
    fun_percent, giving_percent, goal_name, goal_target_cents,
    investment_wish, goal_wish, planned_wish, fun_wish, giving_wish
  ) values (
    current_user_id, 'EUR', 20, 30, 30, 10, 10, '', 0,
    '', '', '', '', ''
  )
  on conflict (user_id) do update set
    currency = excluded.currency,
    investment_percent = excluded.investment_percent,
    goal_percent = excluded.goal_percent,
    planned_percent = excluded.planned_percent,
    fun_percent = excluded.fun_percent,
    giving_percent = excluded.giving_percent,
    goal_name = excluded.goal_name,
    goal_target_cents = excluded.goal_target_cents,
    investment_wish = excluded.investment_wish,
    goal_wish = excluded.goal_wish,
    planned_wish = excluded.planned_wish,
    fun_wish = excluded.fun_wish,
    giving_wish = excluded.giving_wish;
end;
$$;
