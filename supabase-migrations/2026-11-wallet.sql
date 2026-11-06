-- =========================================================
-- Баланс і оплата за документ (замість лімітів тарифів для RMPD)
--  • service_prices — ціни послуг (редагує адмін)
--  • wallet_tx — журнал: поповнення (+), заморожування за заявку (hold), списання (done), повернення (released)
--  • при подачі заявки сума заморожується; списується, коли оператор ставить «Зареєстровано»;
--    повертається на баланс, якщо заявку скасовано
--  • оновлення заявки — безкоштовне; тестові заявки адміна — безкоштовні
-- =========================================================

create table if not exists public.service_prices (
  code text primary key,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.service_prices (code, name, price, sort) values
  ('rmpd', 'Заявка RMPD (Польща) — подає оператор', 450, 10),
  ('rmpd_update', 'Оновлення заявки RMPD', 0, 11)
on conflict (code) do nothing;
alter table public.service_prices enable row level security;
drop policy if exists sp_read on public.service_prices;
create policy sp_read on public.service_prices for select using (true);
drop policy if exists sp_admin on public.service_prices;
create policy sp_admin on public.service_prices for all using (is_admin()) with check (is_admin());

create table if not exists public.wallet_tx (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  broker_id uuid not null references public.brokers(id) on delete cascade,
  amount numeric(10,2) not null,              -- + поповнення / повернення, − оплата
  kind text not null check (kind in ('topup','charge','bonus','adjust')),
  status text not null default 'done' check (status in ('hold','done','released')),
  service text,                               -- код послуги для charge
  ref_id uuid,                                -- id заявки (rmpd_requests)
  ext_ref text,                               -- orderReference WayForPay
  note text
);
create index if not exists wallet_tx_broker_idx on public.wallet_tx(broker_id, created_at desc);
create unique index if not exists wallet_tx_ext_ref_uq on public.wallet_tx(ext_ref) where ext_ref is not null;
create unique index if not exists wallet_tx_ref_uq on public.wallet_tx(ref_id, kind) where ref_id is not null and kind = 'charge';
alter table public.wallet_tx enable row level security;
drop policy if exists wtx_read on public.wallet_tx;
create policy wtx_read on public.wallet_tx for select
  using (is_admin() or exists (select 1 from brokers b where b.id = broker_id and b.user_id = auth.uid()));
-- запис — лише функціями security definer і сервісом оплати

alter table public.rmpd_requests add column if not exists price numeric(10,2) not null default 0;

-- ---------- стан балансу ----------
create or replace function public.wallet_state(bid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce(sum(amount) filter (where status = 'done'), 0),
    'hold',    coalesce(-sum(amount) filter (where status = 'hold'), 0),
    'available', coalesce(sum(amount) filter (where status = 'done'), 0) + coalesce(sum(amount) filter (where status = 'hold'), 0))
  from wallet_tx where broker_id = bid
    and (is_admin() or exists (select 1 from brokers b where b.id = bid and b.user_id = auth.uid()));
$$;
revoke execute on function public.wallet_state(uuid) from public, anon;
grant execute on function public.wallet_state(uuid) to authenticated;

-- ---------- доступ до RMPD: за балансом ----------
create or replace function public.rmpd_access(bid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b record; w jsonb; price numeric;
begin
  select * into b from brokers where id = bid and user_id = auth.uid();
  if not found then return jsonb_build_object('allowed', false, 'reason', 'no_profile'); end if;
  select sp.price into price from service_prices sp where sp.code = 'rmpd' and sp.active;
  w := wallet_state(bid);
  if is_admin() then
    return jsonb_build_object('allowed', true, 'test', true, 'price', coalesce(price, 0)) || w;
  end if;
  if price is null then return jsonb_build_object('allowed', false, 'reason', 'unavailable'); end if;
  return jsonb_build_object('allowed', (w->>'available')::numeric >= price,
    'reason', case when (w->>'available')::numeric < price then 'balance' end,
    'price', price, 'role', coalesce(b.kind, 'broker')) || w;
end $$;
revoke execute on function public.rmpd_access(uuid) from public, anon;
grant execute on function public.rmpd_access(uuid) to authenticated;

-- ---------- заявка: заморожування, списання, повернення ----------
create or replace function public.rmpd_protect()
returns trigger language plpgsql security definer set search_path = public as $$
declare acc jsonb;
begin
  new.updated_at := now();
  if is_admin() then
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
    new.is_test := false; new.rmpd406_ok := false; new.price := 0;
    if new.kind = 'update' then
      if not exists (select 1 from rmpd_requests p where p.id = new.parent_id and p.owner_id = new.owner_id) then
        raise exception 'rmpd: parent not found';
      end if;
    else
      acc := rmpd_access(new.owner_id);
      if not coalesce((acc->>'allowed')::boolean, false) then
        raise exception 'rmpd_denied:%', coalesce(acc->>'reason', 'denied');
      end if;
      new.price := (acc->>'price')::numeric;
      if new.price > 0 then
        insert into wallet_tx (broker_id, amount, kind, status, service, ref_id, note)
        values (new.owner_id, -new.price, 'charge', 'hold', 'rmpd', new.id, 'RMPD ' || coalesce(new.plate, ''));
      end if;
    end if;
    new.user_id := auth.uid();
    new.status := 'new';
    new.admin_note := null; new.ref_number := null; new.done_at := null; new.valid_until := null; new.crm_request_id := null;
    return new;
  end if;

  if new.status = 'cancelled' and old.status <> 'done' then
    update wallet_tx set status = 'released', updated_at = now(), note = coalesce(note || ' · ', '') || 'заявку скасовано'
     where ref_id = old.id and kind = 'charge' and status = 'hold';
    new := old; new.status := 'cancelled'; new.updated_at := now(); return new;
  end if;
  if old.status not in ('new','needs_fix') then raise exception 'rmpd: request is locked'; end if;
  new.status := 'new';
  new.owner_id := old.owner_id; new.user_id := old.user_id; new.kind := old.kind; new.parent_id := old.parent_id;
  new.admin_note := old.admin_note; new.ref_number := old.ref_number; new.done_at := old.done_at;
  new.valid_until := old.valid_until; new.crm_request_id := old.crm_request_id; new.created_at := old.created_at;
  new.is_test := old.is_test; new.rmpd406_ok := false; new.price := old.price;
  return new;
end $$;
revoke execute on function public.rmpd_protect() from public, anon, authenticated;

-- ---------- ручне зарахування адміном (оплата на рахунок, бонус, корекція) ----------
create or replace function public.admin_wallet_adjust(p_email text, p_amount numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bid uuid; bname text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_amount = 0 then raise exception 'amount'; end if;
  select b.id, b.name into bid, bname from brokers b left join auth.users u on u.id = b.user_id
   where lower(coalesce(b.email, '')) = lower(trim(p_email)) or lower(coalesce(u.email, '')) = lower(trim(p_email))
   order by (u.email is not null) desc limit 1;
  if bid is null then raise exception 'not_found'; end if;
  insert into wallet_tx (broker_id, amount, kind, status, note)
  values (bid, p_amount, case when p_amount > 0 then 'bonus' else 'adjust' end, 'done', coalesce(nullif(trim(p_note), ''), 'Ручне зарахування'));
  return jsonb_build_object('broker', bname) || wallet_state(bid);
end $$;
revoke execute on function public.admin_wallet_adjust(text, numeric, text) from public, anon;
grant execute on function public.admin_wallet_adjust(text, numeric, text) to authenticated;
