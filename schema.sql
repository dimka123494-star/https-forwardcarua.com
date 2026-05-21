-- МитнийБрокер — Supabase Schema
-- Виконай в Supabase → SQL Editor → Run

create table if not exists brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  city text, region text, experience int default 0, about text,
  phone text, telegram text, email text,
  plan text default 'free' check (plan in ('free','standard','pro','premium')),
  plan_expires_at timestamptz,
  rating_avg numeric(3,2) default 0,
  rating_count int default 0,
  views_count int default 0,
  is_verified boolean default false,
  is_online boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists broker_services (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references brokers(id) on delete cascade,
  name text not null, price_from int, price_to int,
  created_at timestamptz default now()
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references brokers(id) on delete set null,
  service text not null,
  car_make text, car_model text, car_year text, car_country text,
  comment text, urgency text,
  client_name text not null, client_phone text not null,
  client_telegram text, client_email text,
  status text default 'new' check (status in ('new','accepted','declined','done')),
  created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references brokers(id) on delete cascade,
  author_name text not null, author_phone_hash text,
  rating smallint not null check (rating between 1 and 5),
  service text, body text not null,
  status text default 'pending' check (status in ('pending','published','rejected')),
  rejection_reason text, helpful_count int default 0,
  created_at timestamptz default now()
);

create table if not exists review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references reviews(id) on delete cascade unique,
  broker_id uuid references brokers(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists review_helpful (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references reviews(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz default now(),
  unique(review_id, ip_hash)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references brokers(id) on delete cascade,
  plan text not null, amount int not null,
  period text default 'monthly',
  status text default 'pending' check (status in ('pending','success','failed')),
  wayforpay_order_id text, wayforpay_transaction_id text,
  created_at timestamptz default now()
);

-- Тригер автоматичного рейтингу
create or replace function update_broker_rating() returns trigger as $$
begin
  update brokers set
    rating_avg = (select coalesce(round(avg(rating)::numeric,2),0) from reviews where broker_id = coalesce(new.broker_id, old.broker_id) and status = 'published'),
    rating_count = (select count(*) from reviews where broker_id = coalesce(new.broker_id, old.broker_id) and status = 'published')
  where id = coalesce(new.broker_id, old.broker_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_update_rating on reviews;
create trigger trigger_update_rating after insert or update or delete on reviews for each row execute function update_broker_rating();

-- Функція лічильника переглядів
create or replace function increment_views(broker_id uuid) returns void as $$
  update brokers set views_count = views_count + 1 where id = broker_id;
$$ language sql;

-- RLS
alter table brokers enable row level security;
alter table broker_services enable row level security;
alter table requests enable row level security;
alter table reviews enable row level security;
alter table review_replies enable row level security;
alter table review_helpful enable row level security;
alter table payments enable row level security;

create policy "brokers_read_all" on brokers for select using (true);
create policy "brokers_insert_own" on brokers for insert with check (auth.uid() = user_id);
create policy "brokers_update_own" on brokers for update using (auth.uid() = user_id);
create policy "services_read_all" on broker_services for select using (true);
create policy "services_write_own" on broker_services for all using (broker_id in (select id from brokers where user_id = auth.uid()));
create policy "requests_insert_anon" on requests for insert with check (true);
create policy "requests_read_broker" on requests for select using (broker_id in (select id from brokers where user_id = auth.uid()));
create policy "reviews_read_published" on reviews for select using (status = 'published');
create policy "reviews_insert_anon" on reviews for insert with check (true);
create policy "replies_read_all" on review_replies for select using (true);
create policy "replies_write_own" on review_replies for insert with check (broker_id in (select id from brokers where user_id = auth.uid()));
create policy "helpful_insert" on review_helpful for insert with check (true);
create policy "helpful_read" on review_helpful for select using (true);
create policy "payments_own" on payments for all using (broker_id in (select id from brokers where user_id = auth.uid()));

-- Індекси
create index if not exists idx_brokers_region on brokers(region);
create index if not exists idx_brokers_plan on brokers(plan);
create index if not exists idx_brokers_rating on brokers(rating_avg desc);
create index if not exists idx_reviews_broker on reviews(broker_id, status);
create index if not exists idx_requests_broker on requests(broker_id, status);
