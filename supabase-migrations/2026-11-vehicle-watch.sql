-- «Стежити за авто» в Telegram (MVP, безкоштовно): функція vehicle-watch, бот — tg (/start w_<code>).
create table if not exists public.vehicle_watch (
  id bigint generated always as identity primary key,
  code text not null unique,                 -- одноразовий код для t.me/<бот>?start=w_<code>
  key text not null,                         -- номер (кирилицею) або VIN
  by_vin boolean not null default false,
  chat_id bigint, tg_username text,
  active boolean not null default false,
  sig text,                                  -- підпис стану: кількість операцій|дата|код|розшук
  car text, source text, ip text,
  created_at timestamptz not null default now(), linked_at timestamptz, checked_at timestamptz, notified_at timestamptz, expires_at timestamptz
);
create index if not exists vehicle_watch_chat on public.vehicle_watch (chat_id) where active;
create index if not exists vehicle_watch_ip on public.vehicle_watch (ip, created_at);
alter table public.vehicle_watch enable row level security;   -- лише service role (функції)

create or replace function public.vehicle_watch_scan_call()
returns bigint language sql security definer set search_path = public, extensions, vault as $$
  select net.http_post(
    url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/vehicle-watch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"scan"}'::jsonb, timeout_milliseconds := 300000);
$$;
revoke all on function public.vehicle_watch_scan_call() from public, anon, authenticated;
-- щодня о 07:10 за Києвом (05:10 UTC); нові дані МВС зʼявляються щовівторка після імпорту
select cron.schedule('vehicle-watch-scan', '10 5 * * *', 'select public.vehicle_watch_scan_call()');
