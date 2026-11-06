-- =========================================================
-- RMPD: режим «Подаю сам» — клієнт отримує перевірені дані в порядку полів PUESC
-- і сам вносить їх у свій акаунт PUESC. Ціна rmpd_self списується одразу
-- (послуга — перевірка й підготовка даних), заявка не потрапляє в чергу оператора.
-- Номер RMPD і позначку RMPD406 клієнт вносить сам → статус «Зареєстровано».
-- =========================================================

insert into public.service_prices (code, name, price, sort) values
  ('rmpd_self', 'Заявка RMPD — подаю сам (перевірка й дані для PUESC)', 100, 12)
on conflict (code) do nothing;

alter table public.rmpd_requests add column if not exists mode text not null default 'team';
alter table public.rmpd_requests drop constraint if exists rmpd_mode_chk;
alter table public.rmpd_requests add constraint rmpd_mode_chk check (mode in ('team','self'));

create or replace function public.rmpd_access(bid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b record; w jsonb; price numeric; price_self numeric; avail numeric;
begin
  select * into b from brokers where id = bid and user_id = auth.uid();
  if not found then return jsonb_build_object('allowed', false, 'reason', 'no_profile'); end if;
  select sp.price into price from service_prices sp where sp.code = 'rmpd' and sp.active;
  select sp.price into price_self from service_prices sp where sp.code = 'rmpd_self' and sp.active;
  w := wallet_state(bid); avail := (w->>'available')::numeric;
  if is_admin() then
    return jsonb_build_object('allowed', true, 'allowed_self', true, 'test', true, 'price', coalesce(price, 0), 'price_self', coalesce(price_self, 0)) || w;
  end if;
  if price is null and price_self is null then return jsonb_build_object('allowed', false, 'allowed_self', false, 'reason', 'unavailable'); end if;
  return jsonb_build_object(
    'allowed', price is not null and avail >= price,
    'allowed_self', price_self is not null and avail >= price_self,
    'reason', case when (price is null or avail < price) and (price_self is null or avail < price_self) then 'balance' end,
    'price', price, 'price_self', price_self, 'role', coalesce(b.kind, 'broker')) || w;
end $$;
revoke execute on function public.rmpd_access(uuid) from public, anon;
grant execute on function public.rmpd_access(uuid) to authenticated;

create or replace function public.rmpd_protect()
returns trigger language plpgsql security definer set search_path = public as $$
declare acc jsonb; pr numeric; ref text;
begin
  new.updated_at := now();
  if is_admin() and not (tg_op = 'UPDATE' and old.mode = 'self' and old.user_id = auth.uid()) then
    if tg_op = 'INSERT' then new.is_test := true; new.price := 0; new.user_id := coalesce(new.user_id, auth.uid()); end if;
    if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
      if not coalesce(new.rmpd406_ok, false) then raise exception 'rmpd_406_required'; end if;
      if coalesce(new.ref_number, '') = '' then raise exception 'rmpd_ref_required'; end if;
      new.done_at := now();
      if new.valid_until is null then new.valid_until := (now() at time zone 'Europe/Warsaw')::date + 10; end if;
      update wallet_tx set status = 'done', updated_at = now() where ref_id = new.id and kind = 'charge' and status = 'hold';
    end if;
    if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
      update wallet_tx set status = 'released', updated_at = now(), note = coalesce(note || ' · ', '') || 'заявку скасовано'
       where ref_id = new.id and kind = 'charge' and status = 'hold';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_test := is_admin(); new.rmpd406_ok := false; new.price := 0;
    new.mode := coalesce(new.mode, 'team');
    if new.kind = 'update' then
      if not exists (select 1 from rmpd_requests p where p.id = new.parent_id and p.owner_id = new.owner_id) then
        raise exception 'rmpd: parent not found';
      end if;
    elsif not new.is_test then
      acc := rmpd_access(new.owner_id);
      if not coalesce((acc->>(case new.mode when 'self' then 'allowed_self' else 'allowed' end))::boolean, false) then
        raise exception 'rmpd_denied:%', coalesce(acc->>'reason', 'balance');
      end if;
      pr := (acc->>(case new.mode when 'self' then 'price_self' else 'price' end))::numeric;
      new.price := coalesce(pr, 0);
      if new.price > 0 then
        insert into wallet_tx (broker_id, amount, kind, status, service, ref_id, note)
        values (new.owner_id, -new.price, 'charge', case new.mode when 'self' then 'done' else 'hold' end,
                case new.mode when 'self' then 'rmpd_self' else 'rmpd' end, new.id,
                'RMPD ' || coalesce(new.plate, '') || case new.mode when 'self' then ' · подаю сам' else '' end);
      end if;
    end if;
    new.user_id := auth.uid();
    new.status := 'new';
    new.admin_note := null; new.ref_number := null; new.done_at := null; new.valid_until := null; new.crm_request_id := null;
    return new;
  end if;

  -- скасування: заморожене повертається (для «подаю сам» оплата вже списана — послугу надано)
  if new.status = 'cancelled' and old.status <> 'done' then
    update wallet_tx set status = 'released', updated_at = now(), note = coalesce(note || ' · ', '') || 'заявку скасовано'
     where ref_id = old.id and kind = 'charge' and status = 'hold';
    new := old; new.status := 'cancelled'; new.updated_at := now(); return new;
  end if;

  -- «подаю сам»: клієнт вносить номер RMPD після реєстрації в PUESC
  if old.mode = 'self' and new.status = 'done' and old.status in ('new','needs_fix') then
    if coalesce(trim(new.ref_number), '') = '' then raise exception 'rmpd_ref_required'; end if;
    if not coalesce(new.rmpd406_ok, false) then raise exception 'rmpd_406_required'; end if;
    ref := upper(trim(new.ref_number));
    new := old;
    new.status := 'done'; new.ref_number := ref; new.rmpd406_ok := true; new.updated_at := now();
    new.done_at := now(); new.valid_until := (now() at time zone 'Europe/Warsaw')::date + 10;
    return new;
  end if;

  if old.status not in ('new','needs_fix') then raise exception 'rmpd: request is locked'; end if;
  new.status := 'new';
  new.owner_id := old.owner_id; new.user_id := old.user_id; new.kind := old.kind; new.parent_id := old.parent_id; new.mode := old.mode;
  new.admin_note := old.admin_note; new.ref_number := old.ref_number; new.done_at := old.done_at;
  new.valid_until := old.valid_until; new.crm_request_id := old.crm_request_id; new.created_at := old.created_at;
  new.is_test := old.is_test; new.rmpd406_ok := false; new.price := old.price;
  return new;
end $$;
revoke execute on function public.rmpd_protect() from public, anon, authenticated;

-- «подаю сам» не йде в CRM і не сповіщає оператора
create or replace function public.rmpd_to_crm()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  b record; body jsonb;
  k constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZHVva2phYXdtb3JjeWl1dml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDE1NDgsImV4cCI6MjA5NjQxNzU0OH0.usjLWtdJW0OJt8dgUfCnkVljKN6kpG7vJ907Y_XWieg';
begin
  if new.is_test or new.mode = 'self' then return new; end if;
  select name, phone, email, city, region, plan, kind into b from brokers where id = new.owner_id;
  body := jsonb_build_object(
    'name', coalesce(b.name, 'Перевізник МитнийБрокер'),
    'phone', coalesce(new.driver_phone, b.phone),
    'email', coalesce(new.carrier_email, b.email),
    'city', coalesce(b.city, b.region),
    'client_type', 'Юр. особа',
    'service', 'RMPD (Польща)',
    'source', 'МитнийБрокер',
    'stage', 'Новий лід',
    'notes', case when new.urgent then 'ТЕРМІНОВО! ' else '' end ||
             case new.kind when 'update' then 'ОНОВЛЕННЯ заявки RMPD. ' else 'Нова заявка RMPD. ' end ||
             'Опрацювати в forwardcarua.com/admin → «RMPD» (тариф ' || coalesce(b.plan,'free') || ', ' ||
             case b.kind when 'carrier' then 'перевізник' else 'брокер' end || ').',
    'details', 'Перевізник: ' || coalesce(new.carrier_name, '—') || coalesce(' (' || new.carrier_code || ')', '') ||
               E'\nАвто: ' || coalesce(new.plate, '—') || coalesce(' / ' || new.trailer_plate, '') ||
               coalesce(E'\nВодій: ' || nullif(trim(coalesce(new.driver_first,'') || ' ' || coalesce(new.driver_last,'')), ''), '') ||
               E'\nВʼїзд: ' || coalesce(new.entry_point, new.load_place, '—') || ' · ' || coalesce(to_char(new.start_date, 'DD.MM.YYYY'), '—') ||
               coalesce(E'\nНа кордоні: ' || to_char(new.border_eta at time zone 'Europe/Kyiv', 'DD.MM HH24:MI'), '') ||
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
revoke execute on function public.rmpd_to_crm() from public, anon, authenticated;

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
    when tg_table_name = 'rmpd_requests' and coalesce(n->>'mode', 'team') = 'self' then null
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
