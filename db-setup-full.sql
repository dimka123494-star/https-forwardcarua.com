-- ============================================================
-- forwardcarua.com — ПОВНИЙ скрипт налаштування бази
-- Замінює db-security.sql, db-admin.sql і db-migration.sql.
-- Виконувати цілком, одним запуском, у Supabase → SQL Editor.
-- Можна запускати повторно.
--
-- ПЕРЕД ЗАПУСКОМ: Database → Backups → зробіть бекап.
-- ============================================================

begin;

-- ============================================================
-- КРОК 0. Знімаємо всі старі політики й тригери
-- Вони тримають колонки, які треба прибрати, і мають різні
-- назви з попередніх версій — тому знімаємо динамічно.
-- ============================================================

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('brokers','broker_services','broker_profiles','requests',
                        'payments','reviews','review_replies','review_helpful',
                        'profiles','admins')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop trigger  if exists trg_protect_plan on public.brokers;
drop function if exists public.protect_plan_columns() cascade;
drop trigger  if exists trg_recalc_rating on public.reviews;
drop trigger  if exists trg_force_review_pending on public.reviews;

-- ============================================================
-- КРОК 1. Таблиця адміністраторів і хелпер is_admin()
-- Права дає база, а не JavaScript: сховати кнопку недостатньо.
-- ============================================================

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- ============================================================
-- КРОК 2. BROKERS — зводимо дублікати колонок
-- Різні версії коду писали в різні колонки, тому таблиці
-- в адмінці показували порожнечу там, де дані є.
-- ============================================================

alter table public.brokers
  add column if not exists is_active       boolean,
  add column if not exists is_verified     boolean,
  add column if not exists rating_avg      numeric,
  add column if not exists rating_count    integer,
  add column if not exists about           text,
  add column if not exists plan_expires_at timestamptz,
  add column if not exists views_count     integer,
  add column if not exists last_seen_at    timestamptz;

-- Переносимо дані зі старих колонок, якщо вони існують
do $$
declare
  has_col boolean;
begin
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='brokers' and column_name='active') into has_col;
  if has_col then execute 'update public.brokers set is_active = coalesce(is_active, active, true)'; end if;

  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='brokers' and column_name='verified') into has_col;
  if has_col then execute 'update public.brokers set is_verified = coalesce(is_verified, verified, false)'; end if;

  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='brokers' and column_name='rating') into has_col;
  if has_col then execute 'update public.brokers set rating_avg = coalesce(rating_avg, rating)'; end if;

  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='brokers' and column_name='reviews_count') into has_col;
  if has_col then execute 'update public.brokers set rating_count = coalesce(rating_count, reviews_count, 0)'; end if;

  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='brokers' and column_name='bio') into has_col;
  if has_col then execute 'update public.brokers set about = coalesce(about, bio)'; end if;

  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='brokers' and column_name='plan_until') into has_col;
  if has_col then execute 'update public.brokers set plan_expires_at = coalesce(plan_expires_at, plan_until)'; end if;
end $$;

update public.brokers set
  is_active    = coalesce(is_active, true),
  is_verified  = coalesce(is_verified, false),
  rating_count = coalesce(rating_count, 0),
  views_count  = coalesce(views_count, 0),
  plan         = coalesce(plan, 'free');

-- Прибираємо дублікати й непотрібне
alter table public.brokers
  drop column if exists active,
  drop column if exists verified,
  drop column if exists rating,
  drop column if exists reviews_count,
  drop column if exists bio,
  drop column if exists plan_until,
  drop column if exists password_hash,  -- залишок саморобної авторизації
  drop column if exists initials,        -- рахується з name
  drop column if exists avatar_color,    -- визначається тарифом
  drop column if exists services,        -- є таблиця broker_services
  drop column if exists is_online;       -- ніхто не оновлював, показував неправду

alter table public.brokers
  alter column is_active    set default true,
  alter column is_verified  set default false,
  alter column plan         set default 'free',
  alter column rating_count set default 0,
  alter column views_count  set default 0;

alter table public.brokers alter column is_active   set not null;
alter table public.brokers alter column is_verified set not null;

alter table public.brokers drop constraint if exists brokers_plan_chk;
alter table public.brokers add constraint brokers_plan_chk
  check (plan in ('free','standard','pro','premium'));

create unique index if not exists brokers_user_id_key on public.brokers(user_id) where user_id is not null;
create index if not exists brokers_region_idx on public.brokers(region);
create index if not exists brokers_plan_idx   on public.brokers(plan);

-- ============================================================
-- КРОК 3. REQUESTS — поля майстра заявки і прив'язка до клієнта
-- ============================================================

alter table public.requests
  add column if not exists client_user_id  uuid references auth.users(id) on delete set null,
  add column if not exists client_telegram text,
  add column if not exists service         text,
  add column if not exists comment         text,
  add column if not exists car_make        text,
  add column if not exists car_model       text,
  add column if not exists car_year        text,
  add column if not exists car_country     text,
  add column if not exists urgency         text;

do $$
declare has_col boolean;
begin
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='requests' and column_name='message') into has_col;
  if has_col then execute 'update public.requests set comment = coalesce(comment, message)'; end if;
end $$;

alter table public.requests
  drop column if exists message,
  drop column if exists broker_name;  -- беремо через join, щоб не розходилось

-- Єдиний словник статусів: new → accepted → done, або declined
update public.requests set status = 'declined' where status in ('rejected','decline');
update public.requests set status = 'done'     where status in ('completed','complete');
update public.requests set status = 'accepted' where status in ('pending','in_progress');
update public.requests set status = 'new'      where status is null;

alter table public.requests alter column status set default 'new';
alter table public.requests drop constraint if exists requests_status_chk;
alter table public.requests add constraint requests_status_chk
  check (status in ('new','accepted','done','declined'));

create index if not exists requests_broker_idx on public.requests(broker_id, created_at desc);
create index if not exists requests_client_idx on public.requests(client_user_id, created_at desc);

-- ============================================================
-- КРОК 4. REVIEWS — бракувало дати й лічильника корисності
-- ============================================================

alter table public.reviews
  add column if not exists created_at     timestamptz not null default now(),
  add column if not exists helpful_count  integer not null default 0,
  add column if not exists author_user_id uuid references auth.users(id) on delete set null;

update public.reviews set status = 'pending' where status is null;
alter table public.reviews alter column status set default 'pending';

alter table public.reviews drop constraint if exists reviews_status_chk;
alter table public.reviews add constraint reviews_status_chk
  check (status in ('pending','published','rejected'));

alter table public.reviews drop constraint if exists reviews_rating_chk;
alter table public.reviews add constraint reviews_rating_chk
  check (rating between 1 and 5);

create index if not exists reviews_broker_idx on public.reviews(broker_id, status);
create unique index if not exists review_replies_review_key on public.review_replies(review_id);
create unique index if not exists review_helpful_unique on public.review_helpful(review_id, ip_hash);

-- ============================================================
-- КРОК 5. PAYMENTS
-- ============================================================

alter table public.payments
  add column if not exists period text not null default 'month';

update public.payments set status = 'approved' where status in ('success','Approved');
alter table public.payments drop constraint if exists payments_status_chk;
alter table public.payments add constraint payments_status_chk
  check (status in ('pending','approved','declined','refunded','expired'));

create unique index if not exists payments_order_key on public.payments(wayforpay_order_id);

-- ============================================================
-- КРОК 6. Тригери цілісності
-- ============================================================

-- 6.1 Тариф, рейтинг і верифікацію змінює лише сервер або адмін.
-- Без цього брокер ставить собі plan='premium' і рейтинг 5.0 через API.
create or replace function public.protect_broker_columns()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.plan            := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.is_verified     := old.is_verified;
    new.views_count     := old.views_count;
    new.rating_avg      := old.rating_avg;
    new.rating_count    := old.rating_count;
    new.user_id         := old.user_id;
  end if;
  return new;
end $$;

create trigger trg_protect_broker before update on public.brokers
  for each row execute function public.protect_broker_columns();

-- 6.2 Рейтинг рахується з опублікованих відгуків
create or replace function public.recalc_broker_rating()
returns trigger language plpgsql security definer
set search_path = public as $$
declare bid uuid := coalesce(new.broker_id, old.broker_id);
begin
  if bid is null then return null; end if;
  update public.brokers b set
    rating_avg   = sub.avg_rating,
    rating_count = sub.cnt
  from (
    select round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as cnt
    from public.reviews where broker_id = bid and status = 'published'
  ) sub
  where b.id = bid;
  return null;
end $$;

create trigger trg_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_broker_rating();

-- 6.3 Новий відгук завжди йде на модерацію
create or replace function public.force_review_pending()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.status := 'pending';
    new.rejection_reason := null;
    new.helpful_count := 0;
  end if;
  return new;
end $$;

create trigger trg_force_review_pending before insert on public.reviews
  for each row execute function public.force_review_pending();

-- 6.4 Профіль клієнта створюється разом з акаунтом
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- КРОК 7. Функції для фронтенду
-- ============================================================

create or replace function public.increment_broker_views(broker uuid)
returns void language sql security definer
set search_path = public as $$
  update public.brokers set views_count = coalesce(views_count,0) + 1 where id = broker;
$$;

create or replace function public.mark_review_helpful(review uuid, voter text)
returns integer language plpgsql security definer
set search_path = public as $$
declare c integer;
begin
  insert into public.review_helpful (review_id, ip_hash) values (review, voter)
  on conflict do nothing;
  update public.reviews set helpful_count = (
    select count(*) from public.review_helpful where review_id = review
  ) where id = review
  returning helpful_count into c;
  return coalesce(c, 0);
end $$;

grant execute on function public.increment_broker_views(uuid) to anon, authenticated;
grant execute on function public.mark_review_helpful(uuid, text) to anon, authenticated;

-- ============================================================
-- КРОК 8. RLS — вмикаємо всюди
-- ============================================================

alter table public.brokers         enable row level security;
alter table public.broker_services enable row level security;
alter table public.broker_profiles enable row level security;
alter table public.requests        enable row level security;
alter table public.payments        enable row level security;
alter table public.reviews         enable row level security;
alter table public.review_replies  enable row level security;
alter table public.review_helpful  enable row level security;
alter table public.profiles        enable row level security;
alter table public.admins          enable row level security;

-- ── БРОКЕРИ: каталог читають усі, редагує власник ──
create policy brokers_public_read on public.brokers
  for select using (is_active = true);

create policy brokers_owner_read on public.brokers
  for select using (auth.uid() = user_id);

create policy brokers_insert_own on public.brokers
  for insert with check (auth.uid() = user_id);

create policy brokers_update_own on public.brokers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy brokers_admin_all on public.brokers
  for all using (public.is_admin()) with check (public.is_admin());

-- ── ПОСЛУГИ ──
create policy services_public_read on public.broker_services
  for select using (true);

create policy services_owner_write on public.broker_services
  for all using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

create policy services_admin_all on public.broker_services
  for all using (public.is_admin()) with check (public.is_admin());

-- ── ЗАЯВКИ: створити може будь-хто, ЧИТАЄ лише адресат ──
-- Без цього база телефонів клієнтів вивантажується одним запитом.
create policy requests_anyone_insert on public.requests
  for insert with check (true);

create policy requests_broker_read on public.requests
  for select using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

create policy requests_broker_update on public.requests
  for update using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

create policy requests_client_read on public.requests
  for select using (client_user_id is not null and client_user_id = auth.uid());

create policy requests_admin_all on public.requests
  for all using (public.is_admin()) with check (public.is_admin());

-- ── ВІДГУКИ ──
create policy reviews_public_read on public.reviews
  for select using (status = 'published');

create policy reviews_broker_read on public.reviews
  for select using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

create policy reviews_anyone_insert on public.reviews
  for insert with check (true);

create policy reviews_admin_all on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());

create policy replies_public_read on public.review_replies
  for select using (true);

create policy replies_owner_write on public.review_replies
  for all using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

create policy helpful_insert on public.review_helpful
  for insert with check (true);

-- ── ПЛАТЕЖІ: брокер бачить свої, пише лише сервер ──
create policy payments_owner_read on public.payments
  for select using (
    exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid())
  );

create policy payments_admin_read on public.payments
  for select using (public.is_admin());

-- ── ПРОФІЛІ КЛІЄНТІВ ──
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy profiles_self_write on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ── АДМІНИ: кожен бачить лише свій рядок ──
create policy admins_self_read on public.admins
  for select using (auth.uid() = user_id);

-- ── broker_profiles: стара таблиця, закриваємо до з'ясування ──
create policy broker_profiles_admin on public.broker_profiles
  for all using (public.is_admin()) with check (public.is_admin());

commit;

-- ============================================================
-- КРОК 9. Перерахунок рейтингів за наявними відгуками
-- ============================================================

update public.brokers b set
  rating_avg = sub.avg_rating, rating_count = sub.cnt
from (
  select broker_id, round(avg(rating)::numeric,1) as avg_rating, count(*)::int as cnt
  from public.reviews where status = 'published' and broker_id is not null
  group by broker_id
) sub
where b.id = sub.broker_id;

update public.brokers set rating_avg = null, rating_count = 0
where id not in (
  select broker_id from public.reviews
  where status = 'published' and broker_id is not null
);

-- ============================================================
-- КРОК 10. ЗРОБІТЬ ЦЕ ВРУЧНУ ПІСЛЯ СКРИПТА
-- ============================================================

-- 10.1 Створіть акаунт в Authentication → Users → Add user
--      (email custom@forwardcarua.com, галочка Auto Confirm User),
--      потім розкоментуйте і виконайте:
-- insert into public.admins (user_id, email)
-- select id, email from auth.users where email = 'custom@forwardcarua.com'
-- on conflict (user_id) do nothing;

-- 10.2 Прив'яжіть свій профіль брокера до цього акаунта:
-- update public.brokers b set user_id = u.id
-- from auth.users u
-- where u.email = 'custom@forwardcarua.com'
--   and b.email = 'custom@forwardcarua.com' and b.user_id is null;

-- 10.3 Приберіть вигаданих брокерів (спершу перевірте заявки!):
-- select b.name, count(r.id) from public.brokers b
--   left join public.requests r on r.broker_id = b.id
--   where b.email like '%@example.com' group by b.name;
-- delete from public.brokers where email like '%@example.com';

-- ============================================================
-- ПЕРЕВІРКА
-- ============================================================
-- select tablename, rowsecurity from pg_tables where schemaname='public';
-- select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename;
-- select column_name from information_schema.columns
--   where table_name='brokers' order by ordinal_position;
