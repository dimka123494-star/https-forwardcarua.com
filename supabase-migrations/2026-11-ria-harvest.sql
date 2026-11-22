-- ria-harvest: поповнення ria_ads_archive парами «номер → VIN» з найновіших оголошень AUTO.RIA
-- бюджет — ria_cache key 'harvest:cfg' {per_run, off}; щогодини о :23
insert into public.ria_cache (key, data, checked_at) values ('harvest:cfg', '{"per_run":4,"off":false}', now()) on conflict (key) do nothing;
create or replace function public.ria_harvest_call(p_body jsonb default '{}'::jsonb)
returns bigint language sql security definer set search_path = public, extensions, vault as $$
  select net.http_post(
    url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/ria-harvest',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := p_body, timeout_milliseconds := 120000);
$$;
revoke all on function public.ria_harvest_call(jsonb) from public, anon, authenticated;
select cron.schedule('ria-harvest', '23 * * * *', $$select public.ria_harvest_call('{}'::jsonb)$$);

-- 22.11: збір з RIA вимкнено (не витрачаємо ліміт API); номер → VIN — з архіву оголошень і від користувачів
select cron.unschedule('ria-harvest');
update public.ria_cache set data = '{"per_run":4,"off":true}' where key = 'harvest:cfg';
create table if not exists public.plate_vin_reports (
  id bigint generated always as identity primary key,
  plate text not null, vin text not null, ip text, source text,
  created_at timestamptz not null default now()
);
create index if not exists plate_vin_reports_plate on public.plate_vin_reports (plate);
create index if not exists plate_vin_reports_ip on public.plate_vin_reports (ip, created_at);
alter table public.plate_vin_reports enable row level security;
create or replace function public.plate_vin_lookup(p_plate text)
returns table (vin text, title text, source text) language sql stable security definer set search_path = public as $$
  (select a.vin, a.data->>'title', 'auto.ria' from ria_ads_archive a
    where a.plate = p_plate and a.vin is not null order by a.last_seen desc limit 1)
  union all
  (select r.vin, null, 'users' from plate_vin_reports r where r.plate = p_plate
    group by r.vin having count(distinct coalesce(r.ip, r.id::text)) >= 2 order by count(*) desc limit 1)
  limit 1;
$$;
revoke all on function public.plate_vin_lookup(text) from public, anon, authenticated;
