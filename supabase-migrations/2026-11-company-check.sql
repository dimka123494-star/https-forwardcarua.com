-- Платна «Перевірка компанії» (50 грн з балансу кабінету): Реєстр боржників (виконавчі провадження) і справи про банкрутство.
-- Дані — відкриті дані Мін'юсту й ДСА; GitHub Actions (tools/opendata_import.py) кладе їх у гілку opendata,
-- звідси їх забирає opendata_fetch_start/finish. Лише юрособи (8-значний ЄДРПОУ), фізособи не зберігаємо.
create table if not exists public.company_erb (code text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.company_bankrupt (code text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.company_checks (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  broker_id uuid not null references brokers(id) on delete cascade, user_id uuid, code text not null,
  price numeric not null default 0, report jsonb not null);
create index if not exists company_checks_owner_idx on public.company_checks (broker_id, code, created_at desc);
alter table public.company_erb enable row level security;
alter table public.company_bankrupt enable row level security;
alter table public.company_checks enable row level security;
create policy "checks own read" on public.company_checks for select
  using (exists (select 1 from brokers b where b.id = broker_id and b.user_id = auth.uid()) or is_admin());

create table if not exists public.opendata_runs (id bigserial primary key, started_at timestamptz default now(), req_ids bigint[],
  finished_at timestamptz, erb int, bankrupt int, note text);
alter table public.opendata_runs enable row level security;

insert into public.service_prices (code, name, price, active, sort)
values ('company_check', 'Перевірка компанії: Реєстр боржників і банкрутство', 50, true, 50)
on conflict (code) do nothing;

create or replace function public.opendata_fetch_start() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare ids bigint[] := '{}'; rid bigint; base text := 'https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/opendata/';
begin
  for i in 0..15 loop
    ids := ids || net.http_get(url := base || 'erb-' || lpad(i::text, 2, '0') || '.json', timeout_milliseconds := 180000);
  end loop;
  ids := ids || net.http_get(url := base || 'bankrupt.json', timeout_milliseconds := 180000);
  insert into opendata_runs(req_ids) values (ids) returning id into rid;
  return rid;
end $$;

create or replace function public.opendata_fetch_finish() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r record; ok int; t0 timestamptz := now(); ne int; nb int;
begin
  set local statement_timeout = '15min';
  select * into r from opendata_runs where finished_at is null order by id desc limit 1;
  if r.id is null then return 'nothing to do'; end if;
  select count(*) into ok from net._http_response where id = any(r.req_ids) and status_code = 200;
  if ok < array_length(r.req_ids, 1) then
    update opendata_runs set finished_at = now(), note = 'відповіді неповні (' || ok || '/' || array_length(r.req_ids, 1) || ') — дані не змінено' where id = r.id;
    return 'incomplete';
  end if;
  -- рядки, яких немає в новому наборі, лишаються зі старою updated_at і вважаються неактуальними (company_check бере лише свіжі)
  insert into company_erb(code, data, updated_at)
  select e.key, e.value, t0 from net._http_response x, jsonb_each(x.content::jsonb) e where x.id = any(r.req_ids[1:16])
  on conflict (code) do update set data = excluded.data, updated_at = t0;
  get diagnostics ne = row_count;
  insert into company_bankrupt(code, data, updated_at)
  select e.key, e.value, t0 from net._http_response x, jsonb_each(x.content::jsonb) e where x.id = r.req_ids[17]
  on conflict (code) do update set data = excluded.data, updated_at = t0;
  get diagnostics nb = row_count;
  update opendata_runs set finished_at = now(), erb = ne, bankrupt = nb where id = r.id;
  return 'ok erb ' || ne || ', bankrupt ' || nb;
end $$;
revoke all on function public.opendata_fetch_start(), public.opendata_fetch_finish() from public, anon, authenticated;

-- Звіт за ЄДРПОУ; 50 грн з балансу. Повторний перегляд тієї ж компанії протягом 30 днів — безкоштовно (свіжі дані).
create or replace function public.company_check(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b brokers; pr numeric; w jsonb; prev company_checks; rep jsonb; c carrier_registry; e carrier_edr; nm text;
        cid uuid := gen_random_uuid(); fresh timestamptz; at timestamptz;
begin
  if p_code !~ '^\d{8}$' then raise exception 'bad_code'; end if;
  select * into b from brokers where user_id = auth.uid() order by created_at limit 1;
  if b.id is null then raise exception 'no_cabinet'; end if;
  select started_at, finished_at into fresh, at from opendata_runs where erb is not null order by id desc limit 1;
  if fresh is null then raise exception 'unavailable'; end if;
  select * into c from carrier_registry where edrpou = p_code;
  select * into e from carrier_edr where edrpou = p_code;
  nm := coalesce(e.data->>'name', c.name, (select data->>'name' from company_erb where code = p_code), (select data->>'name' from company_bankrupt where code = p_code));
  rep := jsonb_build_object(
    'code', p_code, 'name', nm, 'checked_at', now(), 'data_at', at,
    'erb', (select data from company_erb where code = p_code and updated_at >= fresh),
    'bankrupt', (select data->'items' from company_bankrupt where code = p_code and updated_at >= fresh),
    'edr', e.data,
    'license', case when c.edrpou is null then null else jsonb_build_object('status', c.status, 'intl_cargo', c.intl_cargo, 'dangerous', c.dangerous) end);
  select * into prev from company_checks where broker_id = b.id and code = p_code and created_at > now() - interval '30 days' order by created_at desc limit 1;
  if prev.id is not null then
    insert into company_checks(id, broker_id, user_id, code, price, report) values (cid, b.id, auth.uid(), p_code, 0, rep);
    return rep || jsonb_build_object('id', cid, 'price', 0, 'repeat', true);
  end if;
  pr := 0;
  if not is_admin() then
    select sp.price into pr from service_prices sp where sp.code = 'company_check' and sp.active;
    if pr is null then raise exception 'unavailable'; end if;
    w := wallet_state(b.id);
    if (w->>'available')::numeric < pr then raise exception 'balance'; end if;
    if pr > 0 then
      insert into wallet_tx (broker_id, amount, kind, status, service, ref_id, note)
      values (b.id, -pr, 'charge', 'done', 'company_check', cid, 'Перевірка компанії ' || p_code);
    end if;
  end if;
  insert into company_checks(id, broker_id, user_id, code, price, report) values (cid, b.id, auth.uid(), p_code, coalesce(pr, 0), rep);
  return rep || jsonb_build_object('id', cid, 'price', coalesce(pr, 0), 'repeat', false);
end $$;
revoke all on function public.company_check(text) from public, anon;
grant execute on function public.company_check(text) to authenticated;

select cron.schedule('opendata-fetch-start', '40 4 * * 1,4', 'select public.opendata_fetch_start()');
select cron.schedule('opendata-fetch-finish', '55 4 * * 1,4', 'select public.opendata_fetch_finish()');

-- ===== Оновлення (міграція company_check_charge) =====
-- Дані більше НЕ завантажуються в БД (company_erb/company_bankrupt не використовуються, cron opendata-* знято):
-- edge-функція company-check (supabase-functions/company-check) бере один шард з гілки opendata
-- (erb/, bankrupt/, courts/ — int(код) % 128) і викликає company_check_charge, яка списує ціну й зберігає звіт.
create or replace function public.company_check_charge(p_user uuid, p_code text, p_report jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b brokers; pr numeric := 0; w jsonb; rep boolean; cid uuid := gen_random_uuid(); adm boolean;
begin
  if p_code !~ '^\d{8}$' then raise exception 'bad_code'; end if;
  select * into b from brokers where user_id = p_user order by created_at limit 1;
  if b.id is null then raise exception 'no_cabinet'; end if;
  select exists(select 1 from admins where user_id = p_user) into adm;
  select exists(select 1 from company_checks where broker_id = b.id and code = p_code and created_at > now() - interval '30 days') into rep;
  if not rep and not adm then
    select sp.price into pr from service_prices sp where sp.code = 'company_check' and sp.active;
    if pr is null then raise exception 'unavailable'; end if;
    w := (select jsonb_build_object('available', coalesce(sum(amount) filter (where status = 'done'), 0) + coalesce(sum(amount) filter (where status = 'hold'), 0))
          from wallet_tx where broker_id = b.id);
    if (w->>'available')::numeric < pr then raise exception 'balance'; end if;
    if pr > 0 then
      insert into wallet_tx (broker_id, amount, kind, status, service, ref_id, note)
      values (b.id, -pr, 'charge', 'done', 'company_check', cid, 'Перевірка компанії ' || p_code);
    end if;
  end if;
  pr := case when rep or adm then 0 else pr end;
  insert into company_checks(id, broker_id, user_id, code, price, report)
  values (cid, b.id, p_user, p_code, pr, p_report || jsonb_build_object('price', pr, 'repeat', rep));
  return jsonb_build_object('id', cid, 'price', pr, 'repeat', rep);
end $$;
revoke all on function public.company_check_charge(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.company_check_charge(uuid, text, jsonb) to service_role;
revoke all on function public.company_check(text) from authenticated;
select cron.unschedule('opendata-fetch-start');
select cron.unschedule('opendata-fetch-finish');

-- ===== Оплата карткою без кабінету (міграція check_orders, edge-функція check-pay) =====
create table if not exists public.check_orders (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  token text not null unique, code text not null check (code ~ '^\d{8}$'), email text not null, amount numeric not null,
  status text not null default 'pending', order_reference text unique, paid_at timestamptz, report jsonb, raw jsonb);
alter table public.check_orders enable row level security;

create policy "check orders admin read" on public.check_orders for select using (is_admin());

-- ===== Санкції РНБО (міграції sanctions_legal, cron_secret_sanctions; edge-функція sanctions-sync) =====
-- Ключ API реєстру санкцій — секрет edge-функцій NSDC_API_KEY. Щодня о 05:17 UTC pg_cron викликає sanctions_sync_call()
-- із заголовком x-cron-secret (секрет cron_secret у Vault, перевірка — cron_secret_ok()). AEO — aeo.json у гілці opendata.
