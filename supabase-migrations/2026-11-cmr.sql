-- =========================================================
-- CMR: заповнена міжнародна товарно-транспортна накладна з картки рейсу.
-- 100 грн з балансу за документ (адмін — безкоштовно), правки після створення — безкоштовні.
-- =========================================================

insert into public.service_prices (code, name, price, sort) values
  ('cmr', 'CMR — заповнена накладна (PDF для друку)', 100, 20)
on conflict (code) do nothing;

create table if not exists public.cmr_docs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references public.brokers(id) on delete cascade,
  user_id uuid default auth.uid(),
  rmpd_id uuid references public.rmpd_requests(id) on delete set null,
  number text,
  data jsonb not null default '{}'::jsonb,
  price numeric(10,2) not null default 0,
  is_test boolean not null default false
);
create index if not exists cmr_owner_idx on public.cmr_docs(owner_id, created_at desc);
create index if not exists cmr_rmpd_idx on public.cmr_docs(rmpd_id);

create or replace function public.cmr_protect()
returns trigger language plpgsql security definer set search_path = public as $$
declare pr numeric; w jsonb;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id; new.user_id := old.user_id; new.price := old.price;
    new.is_test := old.is_test; new.created_at := old.created_at; new.rmpd_id := old.rmpd_id;
    return new;
  end if;
  if not exists (select 1 from brokers b where b.id = new.owner_id and b.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  new.user_id := auth.uid();
  if new.rmpd_id is not null and not exists (select 1 from rmpd_requests r where r.id = new.rmpd_id and r.owner_id = new.owner_id) then
    new.rmpd_id := null;
  end if;
  new.is_test := is_admin();
  new.price := 0;
  if not new.is_test then
    select sp.price into pr from service_prices sp where sp.code = 'cmr' and sp.active;
    if pr is null then raise exception 'cmr_unavailable'; end if;
    if pr > 0 then
      w := wallet_state(new.owner_id);
      if (w->>'available')::numeric < pr then raise exception 'cmr_denied:balance'; end if;
      new.price := pr;
      insert into wallet_tx (broker_id, amount, kind, status, service, ref_id, note)
      values (new.owner_id, -pr, 'charge', 'done', 'cmr', new.id, 'CMR ' || coalesce(new.data->>'plate', ''));
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.cmr_protect() from public, anon, authenticated;

drop trigger if exists trg_cmr_protect on public.cmr_docs;
create trigger trg_cmr_protect before insert or update on public.cmr_docs
  for each row execute function public.cmr_protect();

alter table public.cmr_docs enable row level security;
drop policy if exists cmr_sel on public.cmr_docs;
create policy cmr_sel on public.cmr_docs for select
  using (is_admin() or exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists cmr_ins on public.cmr_docs;
create policy cmr_ins on public.cmr_docs for insert
  with check (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
drop policy if exists cmr_upd on public.cmr_docs;
create policy cmr_upd on public.cmr_docs for update
  using (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()))
  with check (exists (select 1 from brokers b where b.id = owner_id and b.user_id = auth.uid()));
