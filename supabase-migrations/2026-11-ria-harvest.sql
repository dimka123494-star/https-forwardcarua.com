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
