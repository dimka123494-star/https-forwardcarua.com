-- ЄДР усіх юросіб у базі: пошук компаній за назвою (НомерОК, /c/).
-- ПОТРЕБУЄ Supabase Pro: ≈2 млн рядків займають ≈1,1 ГБ разом з індексами (перевірено на повному ЄДР; free-план — 500 МБ).
-- Наповнення: edge-функція edr-load щосереди переносить шарди з GitHub-релізу edr-data (tools/edr_shards.py).
-- Картка /c/{код} і далі читає шард напряму — база потрібна лише для пошуку за назвою.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.edr_companies (
  code        text primary key check (code ~ '^\d{8}$'),
  name        text not null,                 -- повна назва
  short_name  text,
  state       text,
  active      boolean generated always as (coalesce(state, '') !~ '^(припинено|скасовано)') stored,
  reg_date    date,
  head        text,                          -- керівник (публікується в ЄДР)
  -- для пошуку: нижній регістр, без лапок і апострофів («Форвард» = "форвард" = форвард)
  search      text generated always as (lower(translate(coalesce(short_name, '') || ' ' || name, '"«»“”„''’ʼ`', ''))) stored,
  updated_at  timestamptz not null default now()
);
create index if not exists edr_companies_search_trgm on public.edr_companies using gin (search extensions.gin_trgm_ops);
alter table public.edr_companies enable row level security;   -- без політик: доступ лише через функції нижче

-- стан завантаження шардів (щоб edge-функція продовжувала з місця зупинки)
create table if not exists public.edr_load (
  shard      int primary key,
  generated  text not null,                  -- edr-meta.json → generated
  rows       int,
  loaded_at  timestamptz not null default now()
);
alter table public.edr_load enable row level security;

-- Пошук за назвою або кодом: зареєстровані вище, далі — за схожістю. Від 3 символів.
create or replace function public.edr_search(q text, lim int default 20)
returns table (code text, name text, short_name text, state text, active boolean, reg_date date, head text)
language plpgsql stable security definer set search_path = public, extensions set statement_timeout = '4s' as $$
declare
  s text := lower(btrim(regexp_replace(translate(coalesce(q, ''), '"«»“”„''’ʼ`%_\', ''), '\s+', ' ', 'g')));
  w text[]; longest text;
begin
  if s ~ '^\d{8}$' then
    return query select e.code, e.name, e.short_name, e.state, e.active, e.reg_date, e.head from edr_companies e where e.code = s;
    return;
  end if;
  lim := least(greatest(coalesce(lim, 20), 1), 50);
  -- кожне слово має бути в назві; найдовше — через триграмний індекс.
  -- Форми власності (ТОВ, ПП, АТ…) є в мільйоні назв — їх не шукаємо, інакше запит перебирає пів бази.
  select array_agg('%' || x || '%'), (array_agg(x order by length(x) desc))[1] into w, longest
    from unnest(string_to_array(s, ' ')) x
   where length(x) >= 2 and x not in ('тов','пп','ат','пат','прат','фг','сфг','фоп','кп','дп','вп','тдв','ов','ко','гк','го','осбб','ппо',
     'товариство','обмеженою','відповідальністю','приватне','підприємство','акціонерне','фермерське','господарство','громадська','організація');
  if longest is null or length(longest) < 3 then raise exception 'short_query'; end if;
  return query
    select e.code, e.name, e.short_name, e.state, e.active, e.reg_date, e.head
      from edr_companies e
     where e.search like '%' || longest || '%' and e.search like all (w)
     order by e.active desc, similarity(e.search, s) desc, e.reg_date desc nulls last
     limit lim;
end $$;
revoke all on function public.edr_search(text, int) from public;
grant execute on function public.edr_search(text, int) to anon, authenticated;

-- Виклик edge-функції edr-load з pg_cron (той самий cron_secret, що й у sanctions-sync)
create or replace function public.edr_load_call()
returns bigint language sql security definer set search_path = public, extensions, vault as $$
  select net.http_post(
    url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/edr-load',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$$;
revoke all on function public.edr_load_call() from public, anon, authenticated;

-- Щосереди: workflow «ЄДР» публікує шарди ≈03:30 UTC; далі кожні 4 хв по 16 шардів (512 шардів ≈ 2 год).
-- Коли все завантажено — виклики нічого не роблять.
select cron.schedule('edr-load', '*/4 4-9 * * 3', 'select public.edr_load_call()');
