-- ============================================================
-- forwardcarua.com — доступ адміністратора
-- Виконати ПІСЛЯ db-security.sql, у Supabase → SQL Editor.
-- ============================================================

alter table public.brokers add column if not exists verified boolean not null default false;

-- 1. Список адміністраторів
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Адмін бачить лише власний рядок — цього досить, щоб панель
-- перевірила права, і недосить, щоб хтось отримав список адмінів.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select using (auth.uid() = user_id);

-- 2. Хелпер: чи є поточний користувач адміном
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- 3. Права адміна поверх звичайних політик
drop policy if exists brokers_admin_all on public.brokers;
create policy brokers_admin_all on public.brokers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists services_admin_all on public.broker_services;
create policy services_admin_all on public.broker_services
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists requests_admin_all on public.requests;
create policy requests_admin_all on public.requests
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments
  for select using (public.is_admin());

-- 4. Оновлюємо тригер захисту тарифу: адмін і сервер можуть,
--    сам брокер — ні (інакше поставить собі premium через API)
create or replace function public.protect_plan_columns()
returns trigger language plpgsql security definer as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.plan := old.plan;
    new.plan_until := old.plan_until;
    new.verified := old.verified;
    new.views_count := old.views_count;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
  end if;
  return new;
end $$;

-- 5. Додати себе в адміни.
--    Спочатку зареєструйте акаунт custom@forwardcarua.com у Supabase
--    (Authentication → Users → Add user), потім:
-- insert into public.admins (user_id, email)
-- select id, email from auth.users where email = 'custom@forwardcarua.com'
-- on conflict (user_id) do nothing;

-- 6. Перевірка, що все на місці:
-- select tablename, rowsecurity from pg_tables where schemaname='public';
-- select * from public.admins;
