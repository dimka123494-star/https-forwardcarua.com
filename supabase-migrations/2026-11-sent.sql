-- =========================================================
-- SENT: доповнення заявки перевізником (SENT-301 ввезення з-поза ЄС / транзит,
-- SENT-202 ввезення з ЄС, SENT-102 вивезення з Польщі).
-- Польська сторона створює заявку й дає перевізнику номер SENT + ключ KD-…;
-- перевізник доповнює: свої дані, авто, локатор GPS, дати, пункти, документ.
-- Режими як у RMPD: team (оператор, сума заморожується, списується при «Подано»)
-- і self (клієнт подає сам, оплата одразу).
-- =========================================================

insert into public.service_prices (code, name, price, sort) values
  ('sent', 'SENT — доповнення заявки перевізника (подає оператор)', 450, 30),
  ('sent_self', 'SENT — перевірка даних, подаю сам', 100, 31)
on conflict (code) do nothing;

create table if not exists public.sent_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references public.brokers(id) on delete cascade,
  user_id uuid default auth.uid(),
  rmpd_id uuid references public.rmpd_requests(id) on delete set null,
  mode text not null default 'team' check (mode in ('team','self')),
  status text not null default 'new' check (status in ('new','in_progress','needs_fix','done','cancelled')),
  direction text not null default 'import' check (direction in ('import','eu_in','export')),
  sent_number text not null,
  carrier_key text not null,
  carrier_name text, carrier_country text, carrier_id_type text, carrier_id text,
  carrier_street text, carrier_building text, carrier_city text, carrier_postcode text,
  plate text not null, trailer_plate text, permit_number text,
  gps_id text, gps_backup text, carrier_email text, sms_phone text,
  start_date date, end_date date, entry_point text, exit_point text,
  doc_type text default 'CMR', doc_number text,
  signer_first text, signer_last text,
  client_note text, admin_note text,
  done_at timestamptz, is_test boolean not null default false, price numeric(10,2) not null default 0
);
create index if not exists sent_owner_idx on public.sent_requests(owner_id, created_at desc);
create index if not exists sent_status_idx on public.sent_requests(status, created_at desc);

create or replace function public.sent_protect()
returns trigger language plpgsql security definer set search_path = public as $$
declare pr numeric; w jsonb;
begin
  new.updated_at := now();
  new.sent_number := upper(regexp_replace(coalesce(new.sent_number, ''), '\s', '', 'g'));
  new.carrier_key := upper(regexp_replace(coalesce(new.carrier_key, ''), '\s', '', 'g'));
  if new.sent_number !~ '^SENT[0-9]{14}$' then raise exception 'sent_number_format'; end if;
  if new.carrier_key !~ '^KD-[1-9]{2}[XLANTCYDRUEFZPHMJSKW]{2}$' then raise exception 'sent_key_format'; end if;

  if is_admin() and not (tg_op = 'UPDATE' and old.mode = 'self' and old.user_id = auth.uid()) then
    if tg_op = 'INSERT' then new.is_test := true; new.price := 0; new.user_id := coalesce(new.user_id, auth.uid()); end if;
    if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
      new.done_at := now();
      update wallet_tx set status = 'done', updated_at = now() where ref_id = new.id and kind = 'charge' and status = 'hold';
    end if;
    if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
      update wallet_tx set status = 'released', updated_at = now(), note = coalesce(note || ' · ', '') || 'заявку скасовано'
       where ref_id = new.id and kind = 'charge' and status = 'hold';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not exists (select 1 from brokers b where b.id = new.owner_id and b.user_id = auth.uid()) then raise exception 'forbidden'; end if;
    if new.rmpd_id is not null and not exists (select 1 from rmpd_requests r where r.id = new.rmpd_id and r.owner_id = new.owner_id) then new.rmpd_id := null; end if;
    new.is_test := false; new.user_id := auth.uid(); new.status := 'new'; new.admin_note := null; new.done_at := null;
    select sp.price into pr from service_prices sp where sp.code = case when new.mode = 'self' then 'sent_self' else 'sent' end and sp.active;
    if pr is null then raise exception 'sent_denied:unavailable'; end if;
    new.price := pr;
    if pr > 0 then
      w := wallet_state(new.owner_id);
      if (w->>'available')::numeric < pr then raise exception 'sent_denied:balance'; end if;
      insert into wallet_tx (broker_id, amount, kind, status, service, ref_id, note)
      values (new.owner_id, -pr, 'charge', case when new.mode = 'self' then 'done' else 'hold' end,
              case when new.mode = 'self' then 'sent_self' else 'sent' end, new.id, 'SENT ' || new.plate);
    end if;
    return new;
  end if;

  -- UPDATE клієнтом
  if new.status = 'cancelled' and old.status <> 'done' then
    update wallet_tx set status = 'released', updated_at = now(), note = coalesce(note || ' · ', '') || 'заявку скасовано'
     where ref_id = old.id and kind = 'charge' and status = 'hold';
    new := old; new.status := 'cancelled'; new.updated_at := now(); return new;
  end if;
  if old.mode = 'self' and new.status = 'done' and old.status in ('new','needs_fix') then
    new := old; new.status := 'done'; new.done_at := now(); new.updated_at := now(); return new;
  end if;
  if old.status not in ('new','needs_fix') then raise exception 'sent: request is locked'; end if;
  new.status := 'new';
  new.owner_id := old.owner_id; new.user_id := old.user_id; new.mode := old.mode; new.rmpd_id := old.rmpd_id;
  new.admin_note := old.admin_note; new.done_at := old.done_at; new.created_at := old.created_at;
  new.is_test := old.is_test; new.price := old.price;
  return new;
end $$;
revoke execute on function public.sent_protect() from public, anon, authenticated;

drop trigger if exists trg_sent_protect on public.sent_requests;
create trigger trg_sent_protect before insert or update on public.sent_requests
  for each row execute function public.sent_protect();

alter table public.sent_requests enable row level security;
drop policy if exists sent_sel on public.sent_requests;
create policy sent_sel on public.sent_requests for select
  using (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists sent_ins on public.sent_requests;
create policy sent_ins on public.sent_requests for insert
  with check (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists sent_upd on public.sent_requests;
create policy sent_upd on public.sent_requests for update
  using (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()))
  with check (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));

-- Telegram: нові заявки оператору, «подано» / «уточнення» клієнту
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
    when tg_table_name in ('rmpd_requests','sent_requests') and coalesce(n->>'mode', 'team') = 'self' then null
    when tg_table_name = 'rmpd_requests' and tg_op = 'INSERT' then 'rmpd_new'
    when tg_table_name = 'rmpd_requests' and tg_op = 'UPDATE' and n->>'status' = 'new' and o->>'status' = 'needs_fix' then 'rmpd_new'
    when tg_table_name = 'rmpd_requests' and tg_op = 'UPDATE' and n->>'status' = 'done' and o->>'status' is distinct from 'done' then 'rmpd_done'
    when tg_table_name = 'rmpd_requests' and tg_op = 'UPDATE' and n->>'status' = 'needs_fix' and o->>'status' is distinct from 'needs_fix' then 'rmpd_fix'
    when tg_table_name = 'sent_requests' and tg_op = 'INSERT' then 'sent_new'
    when tg_table_name = 'sent_requests' and tg_op = 'UPDATE' and n->>'status' = 'new' and o->>'status' = 'needs_fix' then 'sent_new'
    when tg_table_name = 'sent_requests' and tg_op = 'UPDATE' and n->>'status' = 'done' and o->>'status' is distinct from 'done' then 'sent_done'
    when tg_table_name = 'sent_requests' and tg_op = 'UPDATE' and n->>'status' = 'needs_fix' and o->>'status' is distinct from 'needs_fix' then 'sent_fix'
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
revoke execute on function public.tg_event() from public, anon, authenticated;

drop trigger if exists trg_tg_sent on public.sent_requests;
create trigger trg_tg_sent after insert or update on public.sent_requests
  for each row execute function public.tg_event();
