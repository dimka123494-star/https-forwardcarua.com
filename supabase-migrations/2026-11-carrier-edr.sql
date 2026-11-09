-- Дані ЄДР (відкриті дані Мін'юсту) для перевізників-компаній. Файл data/edr-carriers.json щотижня
-- оновлює GitHub Actions (tools/edr_import.py); тут — забір файлу через pg_net і запис у carrier_edr.
create table if not exists public.carrier_edr (
  edrpou text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.carrier_edr enable row level security;   -- читання лише через carrier_public

create table if not exists public.edr_runs (id bigserial primary key, req_id bigint, started_at timestamptz default now(),
  finished_at timestamptz, rows int, note text);
alter table public.edr_runs enable row level security;

create or replace function public.edr_fetch_start() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare rid bigint; run bigint;
begin
  rid := net.http_get(url := 'https://raw.githubusercontent.com/dimka123494-star/https-forwardcarua.com/main/data/edr-carriers.json',
                      timeout_milliseconds := 120000);
  insert into edr_runs(req_id) values (rid) returning id into run;
  return run;
end $$;

create or replace function public.edr_fetch_finish() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r record; j jsonb; n int;
begin
  select * into r from edr_runs where finished_at is null order by id desc limit 1;
  if r.id is null then return 'nothing to do'; end if;
  select content::jsonb into j from net._http_response where id = r.req_id and status_code = 200;
  if j is null or jsonb_typeof(j) <> 'object' then
    update edr_runs set finished_at = now(), note = 'no response' where id = r.id; return 'no response';
  end if;
  insert into carrier_edr(edrpou, data, updated_at)
  select key, value, now() from jsonb_each(j)
  on conflict (edrpou) do update set data = excluded.data, updated_at = now() where carrier_edr.data is distinct from excluded.data;
  select count(*) into n from jsonb_object_keys(j);
  update edr_runs set finished_at = now(), rows = n where id = r.id;
  delete from net._http_response where id = r.req_id;
  return 'ok ' || n;
end $$;
revoke all on function public.edr_fetch_start(), public.edr_fetch_finish() from public, anon, authenticated;

select cron.schedule('edr-fetch-start', '20 6 * * 3', 'select public.edr_fetch_start()');
select cron.schedule('edr-fetch-finish', '30 6 * * 3', 'select public.edr_fetch_finish()');
