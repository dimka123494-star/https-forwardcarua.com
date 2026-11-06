-- =========================================================
-- RMPD (Польща, SENT/RMPD на PUESC): заявки перевізників
-- Доступ:
--   • перевізник (brokers.kind = 'carrier'): безкоштовний тариф — 3 заявки на місяць,
--     будь-який платний тариф — без ліміту
--   • митний брокер: лише тариф «Преміум», без ліміту (подає за своїх клієнтів-перевізників)
--   • оновлення вже поданої заявки (kind = 'update') у ліміт не рахується
-- Заявку в PUESC вносить оператор МитнийБрокер (адмінка → RMPD),
-- номер RMPD повертається в кабінет і в Telegram.
-- =========================================================

create table if not exists public.rmpd_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references public.brokers(id) on delete cascade,
  user_id uuid default auth.uid(),
  kind text not null default 'new' check (kind in ('new','update')),
  parent_id uuid references public.rmpd_requests(id) on delete set null,
  status text not null default 'new' check (status in ('new','in_progress','needs_fix','done','cancelled')),

  -- перевізник
  carrier_name text not null,
  carrier_country text not null default 'UA',
  carrier_code text,
  carrier_address text,
  -- транспорт
  vehicle_id uuid references public.vehicles(id) on delete set null,
  plate text not null,
  plate_country text not null default 'UA',
  trailer_plate text,
  trailer_country text,
  -- водій
  driver_first text not null,
  driver_last text not null,
  driver_phone text,
  -- вантаж
  with_goods boolean not null default true,
  cargo_desc text,
  cargo_weight_t numeric,
  -- відправник / отримувач
  sender_name text, sender_country text, sender_address text,
  recipient_name text, recipient_country text, recipient_address text,
  -- маршрут
  load_country text, load_place text,
  unload_country text, unload_place text,
  entry_point text not null,
  exit_point text,
  start_date date not null,
  end_date date,
  permit_type text,
  -- геолокація
  gps_mode text check (gps_mode in ('sent_geo','zsl','external')),
  gps_id text,

  client_note text,
  admin_note text,
  ref_number text,
  done_at timestamptz,
  valid_until date,
  crm_request_id bigint,
  constraint rmpd_goods_chk check (not with_goods or (sender_name is not null and recipient_name is not null))
);
create index if not exists rmpd_owner_idx on public.rmpd_requests(owner_id, created_at desc);
create index if not exists rmpd_status_idx on public.rmpd_requests(status, created_at desc);

-- збережені водії, контрагенти, маршрути — щоб повторна заявка робилась у два кліки
create table if not exists public.rmpd_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references public.brokers(id) on delete cascade,
  kind text not null check (kind in ('driver','party','carrier')),
  label text not null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists rmpd_contacts_owner_idx on public.rmpd_contacts(owner_id, kind);

-- ---------- доступ і ліміт ----------
create or replace function public.rmpd_access(bid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b record; paid boolean; used int; lim int;
begin
  select * into b from brokers where id = bid and user_id = auth.uid();
  if not found then return jsonb_build_object('allowed', false, 'reason', 'no_profile'); end if;
  paid := coalesce(b.plan,'free') <> 'free' and (b.plan_expires_at is null or b.plan_expires_at > now());
  select count(*) into used from rmpd_requests
   where owner_id = bid and kind = 'new' and created_at >= date_trunc('month', now());
  if coalesce(b.kind,'broker') = 'carrier' then
    lim := case when paid then null else 3 end;
  else
    if not (paid and b.plan = 'premium') then
      return jsonb_build_object('allowed', false, 'reason', 'need_premium', 'used', used, 'role', 'broker');
    end if;
    lim := null;
  end if;
  return jsonb_build_object('allowed', lim is null or used < lim, 'reason', case when lim is not null and used >= lim then 'limit' end,
    'limit', lim, 'used', used, 'role', coalesce(b.kind,'broker'), 'plan', coalesce(b.plan,'free'), 'paid', paid);
end $$;
grant execute on function public.rmpd_access(uuid) to authenticated;

-- ---------- захист полів і статусів ----------
create or replace function public.rmpd_protect()
returns trigger language plpgsql security definer set search_path = public as $$
declare acc jsonb;
begin
  new.updated_at := now();
  if is_admin() then
    if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
      new.done_at := now();
      if new.valid_until is null then new.valid_until := (now() + interval '10 days')::date; end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.kind = 'update' then
      if not exists (select 1 from rmpd_requests p where p.id = new.parent_id and p.owner_id = new.owner_id) then
        raise exception 'rmpd: parent not found';
      end if;
    else
      acc := rmpd_access(new.owner_id);
      if not coalesce((acc->>'allowed')::boolean, false) then
        raise exception 'rmpd_denied:%', coalesce(acc->>'reason', 'denied');
      end if;
    end if;
    new.user_id := auth.uid();
    new.status := 'new';
    new.admin_note := null; new.ref_number := null; new.done_at := null; new.valid_until := null; new.crm_request_id := null;
    return new;
  end if;

  -- UPDATE від власника: редагувати можна лише нову заявку або повернуту на виправлення,
  -- після виправлення вона знову стає «new»; скасувати — будь-яку, крім виконаної
  if new.status = 'cancelled' and old.status <> 'done' then
    new := old; new.status := 'cancelled'; new.updated_at := now(); return new;
  end if;
  if old.status not in ('new','needs_fix') then raise exception 'rmpd: request is locked'; end if;
  new.status := 'new';
  new.owner_id := old.owner_id; new.user_id := old.user_id; new.kind := old.kind; new.parent_id := old.parent_id;
  new.admin_note := old.admin_note; new.ref_number := old.ref_number; new.done_at := old.done_at;
  new.valid_until := old.valid_until; new.crm_request_id := old.crm_request_id; new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists trg_rmpd_protect on public.rmpd_requests;
create trigger trg_rmpd_protect before insert or update on public.rmpd_requests
  for each row execute function public.rmpd_protect();

-- ---------- RLS ----------
alter table public.rmpd_requests enable row level security;
alter table public.rmpd_contacts enable row level security;

drop policy if exists rmpd_sel on public.rmpd_requests;
create policy rmpd_sel on public.rmpd_requests for select
  using (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists rmpd_ins on public.rmpd_requests;
create policy rmpd_ins on public.rmpd_requests for insert
  with check (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists rmpd_upd on public.rmpd_requests;
create policy rmpd_upd on public.rmpd_requests for update
  using (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()))
  with check (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists rmpd_adm_del on public.rmpd_requests;
create policy rmpd_adm_del on public.rmpd_requests for delete using (is_admin());

drop policy if exists rmpd_ct_all on public.rmpd_contacts;
create policy rmpd_ct_all on public.rmpd_contacts for all
  using (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()))
  with check (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));

-- ---------- нова заявка → CRM brokservisavto (як консультації) ----------
create or replace function public.rmpd_to_crm()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  b record; body jsonb;
  k constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZHVva2phYXdtb3JjeWl1dml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDE1NDgsImV4cCI6MjA5NjQxNzU0OH0.usjLWtdJW0OJt8dgUfCnkVljKN6kpG7vJ907Y_XWieg';
begin
  select name, phone, email, city, region, plan, kind into b from brokers where id = new.owner_id;
  body := jsonb_build_object(
    'name', coalesce(b.name, 'Перевізник МитнийБрокер'),
    'phone', coalesce(new.driver_phone, b.phone),
    'email', b.email,
    'city', coalesce(b.city, b.region),
    'client_type', 'Юр. особа',
    'service', 'RMPD (Польща)',
    'source', 'МитнийБрокер',
    'stage', 'Новий лід',
    'notes', case new.kind when 'update' then 'ОНОВЛЕННЯ заявки RMPD. ' else 'Нова заявка RMPD. ' end ||
             'Опрацювати в forwardcarua.com/admin → «RMPD» (тариф ' || coalesce(b.plan,'free') || ', ' ||
             case b.kind when 'carrier' then 'перевізник' else 'брокер' end || ').',
    'details', 'Перевізник: ' || new.carrier_name || E'\nАвто: ' || new.plate || coalesce(' / ' || new.trailer_plate, '') ||
               E'\nВодій: ' || new.driver_first || ' ' || new.driver_last ||
               E'\nВʼїзд: ' || new.entry_point || ' · ' || to_char(new.start_date, 'DD.MM.YYYY') ||
               case when new.with_goods then E'\nВантаж: ' || coalesce(new.cargo_desc, '—') else E'\nПорожній рейс' end
  );
  new.crm_request_id := net.http_post(
    url := 'https://rhduokjaawmorcyiuviy.supabase.co/rest/v1/leads',
    body := body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k, 'Authorization', 'Bearer ' || k, 'Prefer', 'return=minimal'));
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_rmpd_to_crm on public.rmpd_requests;
-- після trg_rmpd_protect (тригери BEFORE виконуються за алфавітом назв)
create trigger trg_rmpd_to_crm before insert on public.rmpd_requests
  for each row execute function public.rmpd_to_crm();

-- ---------- Telegram: rmpd_new (адмінам), rmpd_done / rmpd_fix (власнику) ----------
create or replace function public.tg_event()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare ev text; o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end; n jsonb := to_jsonb(new);
begin
  ev := case
    when tg_table_name = 'cargo_requests' and tg_op = 'INSERT' and n->>'status' = 'open' then 'cargo_new'
    when tg_table_name = 'cargo_responses' and tg_op = 'INSERT' then 'offer_new'
    when tg_table_name = 'cargo_responses' and tg_op = 'UPDATE' and n->>'status' = 'accepted' and o->>'status' is distinct from 'accepted' then 'offer_accepted'
    when tg_table_name = 'cargo_responses' and tg_op = 'UPDATE' and n->>'status' = 'new' and n->>'price' is distinct from o->>'price' then 'offer_updated'
    when tg_table_name = 'requests' and tg_op = 'INSERT' and n->>'broker_id' is not null then 'request_new'
    when tg_table_name = 'vehicles' and tg_op = 'UPDATE' and n->>'status' in ('verified','rejected') and o->>'status' is distinct from n->>'status' then 'vehicle_' || (n->>'status')
    when tg_table_name = 'rmpd_requests' and tg_op = 'INSERT' then 'rmpd_new'
    when tg_table_name = 'rmpd_requests' and tg_op = 'UPDATE' and n->>'status' = 'new' and o->>'status' = 'needs_fix' then 'rmpd_new'
    when tg_table_name = 'rmpd_requests' and tg_op = 'UPDATE' and n->>'status' = 'done' and o->>'status' is distinct from 'done' then 'rmpd_done'
    when tg_table_name = 'rmpd_requests' and tg_op = 'UPDATE' and n->>'status' = 'needs_fix' and o->>'status' is distinct from 'needs_fix' then 'rmpd_fix'
    else null end;
  if ev is not null then
    perform net.http_post(
      url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/tg',
      body := jsonb_build_object('event', ev, 'id', n->>'id', 'at', floor(extract(epoch from now()))::bigint),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 60000);
  end if;
  return new;
exception when others then
  raise warning 'tg_event: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_tg_rmpd on public.rmpd_requests;
create trigger trg_tg_rmpd after insert or update on public.rmpd_requests
  for each row execute function public.tg_event();

-- тригерні функції не викликаються через API напряму; rmpd_access — лише для авторизованих
revoke execute on function public.rmpd_access(uuid) from public, anon;
grant execute on function public.rmpd_access(uuid) to authenticated;
revoke execute on function public.rmpd_protect() from public, anon, authenticated;
revoke execute on function public.rmpd_to_crm() from public, anon, authenticated;
