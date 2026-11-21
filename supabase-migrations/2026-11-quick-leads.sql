-- Швидка заявка без реєстрації (лендинги RMPD / SENT / відрядження / CMR).
-- Відвідувач лишає контакт і кілька полів → оператор отримує повідомлення в Telegram і передзвонює.
-- Анонім може лише створити запис (жодного читання); читає й змінює тільки адмін.

create table if not exists public.quick_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service text not null default 'rmpd' check (service in ('rmpd','sent','deleg','cmr')),
  contact text not null check (char_length(btrim(contact)) between 5 and 80),
  contact_method text not null default 'telegram' check (contact_method in ('telegram','viber','phone')),
  plate text check (plate is null or char_length(plate) <= 40),
  route text check (route is null or char_length(route) <= 200),
  entry_date date,
  comment text check (comment is null or char_length(comment) <= 1000),
  page text check (page is null or char_length(page) <= 300),
  gclid text check (gclid is null or char_length(gclid) <= 300),
  utm jsonb,
  status text not null default 'new' check (status in ('new','in_progress','done','spam')),
  admin_note text,
  is_test boolean not null default false
);
create index if not exists quick_leads_created_idx on public.quick_leads (created_at desc);

-- Захист від спаму: дубль того самого контакту за 3 хв і понад 30 заявок за 10 хв — відхиляємо.
-- Клієнт не може сам виставити статус, нотатку чи позначку тесту.
create or replace function public.quick_leads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- з сайту (PostgREST, session_user = authenticator) — справжня заявка; адмін або прямий SQL — тест
    new.is_test := is_admin() or session_user <> 'authenticator';
    if not is_admin() then new.status := 'new'; new.admin_note := null; end if;
    new.contact := btrim(new.contact);
    if exists (select 1 from quick_leads q where q.contact = new.contact and q.created_at > now() - interval '3 minutes') then
      raise exception 'duplicate_lead';
    end if;
    if (select count(*) from quick_leads q where q.created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'too_many_leads';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_quick_leads_guard on public.quick_leads;
create trigger trg_quick_leads_guard before insert or update on public.quick_leads
  for each row execute function public.quick_leads_guard();

alter table public.quick_leads enable row level security;
drop policy if exists quick_leads_ins on public.quick_leads;
create policy quick_leads_ins on public.quick_leads for insert to anon, authenticated with check (true);
drop policy if exists quick_leads_sel on public.quick_leads;
create policy quick_leads_sel on public.quick_leads for select using (is_admin());
drop policy if exists quick_leads_upd on public.quick_leads;
create policy quick_leads_upd on public.quick_leads for update using (is_admin()) with check (is_admin());
grant insert on public.quick_leads to anon, authenticated;
grant select, update on public.quick_leads to authenticated;

-- Сповіщення оператору в Telegram (функція tg, подія lead_new)
create or replace function public.quick_leads_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/tg',
    body := jsonb_build_object('event', 'lead_new', 'id', new.id, 'at', floor(extract(epoch from now()))::bigint),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000);
  return new;
exception when others then
  raise warning 'quick_leads_notify: %', sqlerrm;
  return new;
end $$;
revoke execute on function public.quick_leads_notify() from public, anon, authenticated;
drop trigger if exists trg_quick_leads_notify on public.quick_leads;
create trigger trg_quick_leads_notify after insert on public.quick_leads
  for each row execute function public.quick_leads_notify();
