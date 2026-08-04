-- ============================================================
-- forwardcarua.com — безпека БД
-- Виконати в Supabase → SQL Editor. Anon-ключ у браузері безпечний
-- тільки за умови, що ці політики увімкнені.
-- ============================================================

-- 1. Таблиця платежів (потрібна для WayForPay)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references public.brokers(id) on delete cascade,
  plan text not null,
  period text not null default 'month',
  amount numeric not null,
  order_reference text unique not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.brokers        add column if not exists plan_until timestamptz;
alter table public.brokers        add column if not exists views_count integer not null default 0;

-- 2. Вмикаємо RLS усюди
alter table public.brokers          enable row level security;
alter table public.broker_services  enable row level security;
alter table public.requests         enable row level security;
alter table public.payments         enable row level security;

-- 3. БРОКЕРИ: каталог читають усі, редагує лише власник
drop policy if exists brokers_public_read on public.brokers;
create policy brokers_public_read on public.brokers
  for select using (is_active = true);

drop policy if exists brokers_insert_own on public.brokers;
create policy brokers_insert_own on public.brokers
  for insert with check (auth.uid() = user_id);

drop policy if exists brokers_update_own on public.brokers;
create policy brokers_update_own on public.brokers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Тариф змінює лише сервер (service_role) через callback оплати.
-- Захист від того, щоб брокер сам собі поставив plan='premium':
create or replace function public.protect_plan_columns()
returns trigger language plpgsql security definer as $$
begin
  if auth.role() <> 'service_role' then
    new.plan := old.plan;
    new.plan_until := old.plan_until;
    new.views_count := old.views_count;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_plan on public.brokers;
create trigger trg_protect_plan before update on public.brokers
  for each row execute function public.protect_plan_columns();

-- 4. ПОСЛУГИ: читають усі, змінює власник профілю
drop policy if exists services_public_read on public.broker_services;
create policy services_public_read on public.broker_services
  for select using (true);

drop policy if exists services_owner_write on public.broker_services;
create policy services_owner_write on public.broker_services
  for all using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

-- 5. ЗАЯВКИ: створити може будь-хто, ЧИТАЄ лише брокер-адресат
--    (без цього будь-хто вивантажив би базу телефонів клієнтів)
drop policy if exists requests_anon_insert on public.requests;
create policy requests_anon_insert on public.requests
  for insert with check (true);

drop policy if exists requests_owner_read on public.requests;
create policy requests_owner_read on public.requests
  for select using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

drop policy if exists requests_owner_update on public.requests;
create policy requests_owner_update on public.requests
  for update using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

-- 6. ПЛАТЕЖІ: брокер бачить лише свої, пише лише сервер
drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments
  for select using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

-- 7. Лічильник переглядів профілю (виклик з фронтенду безпечний)
create or replace function public.increment_broker_views(broker uuid)
returns void language sql security definer as $$
  update public.brokers set views_count = coalesce(views_count,0) + 1 where id = broker;
$$;

grant execute on function public.increment_broker_views(uuid) to anon, authenticated;
