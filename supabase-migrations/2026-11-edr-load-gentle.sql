-- Щадне завантаження ЄДР (після вичерпання Disk IO Budget 20.11.2026):
-- 1) edr_upsert_rows пише лише нові й змінені рядки (незмінні не чіпає — без зайвих записів у WAL і GIN-індекс);
-- 2) edr-load бере по 3 шарди за виклик (≈12 тис. рядків), лише вночі за Києвом (00:00–05:59 = 22–03 UTC), кожні 5 хв.
create or replace function public.edr_upsert_rows(p jsonb)
returns int language sql security definer set search_path = public as $$
  with src as (
    select code, name, short_name, state, reg_date, head
      from jsonb_to_recordset(p) as x(code text, name text, short_name text, state text, reg_date date, head text)
  ), ins as (
    insert into edr_companies (code, name, short_name, state, reg_date, head, updated_at)
    select code, name, short_name, state, reg_date, head, now() from src
    on conflict (code) do update set name = excluded.name, short_name = excluded.short_name, state = excluded.state,
      reg_date = excluded.reg_date, head = excluded.head, updated_at = now()
    where (edr_companies.name, edr_companies.short_name, edr_companies.state, edr_companies.reg_date, edr_companies.head)
          is distinct from (excluded.name, excluded.short_name, excluded.state, excluded.reg_date, excluded.head)
    returning 1
  ) select count(*)::int from ins;
$$;
revoke all on function public.edr_upsert_rows(jsonb) from public, anon, authenticated;

-- розклад: одна нічна задача замість щохвилинних
select cron.unschedule('edr-load-initial') where exists (select 1 from cron.job where jobname = 'edr-load-initial');
select cron.unschedule('edr-load') where exists (select 1 from cron.job where jobname = 'edr-load');
select cron.schedule('edr-load-night', '*/5 22,23,0,1,2,3 * * *', 'select public.edr_load_call()');
