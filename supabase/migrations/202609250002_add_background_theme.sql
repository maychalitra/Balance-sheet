alter table public.money_map_settings
  add column if not exists background_theme text not null default 'mint';

alter table public.money_map_settings
  drop constraint if exists money_map_settings_background_theme_check;

alter table public.money_map_settings
  add constraint money_map_settings_background_theme_check
  check (background_theme in ('mint', 'sky', 'sunny', 'peach', 'lilac'));
