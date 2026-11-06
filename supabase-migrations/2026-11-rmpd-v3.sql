-- =========================================================
-- RMPD v3: безпечний пілот
--  • «Зареєстровано» можна поставити лише після перевірки в RMPD406 (rmpd406_ok)
--  • фото техпаспорта / CMR у приватному сховищі rmpd-docs
--  • термінові заявки (urgent, border_eta)
--  • тестовий режим: адмін подає без обмежень, заявки позначаються is_test і не йдуть у CRM
--  • нагадування в Telegram за день до кінця строку дії номера (pg_cron)
-- =========================================================

alter table public.rmpd_requests
  add column if not exists docs jsonb not null default '[]'::jsonb,
  add column if not exists urgent boolean not null default false,
  add column if not exists border_eta timestamptz,
  add column if not exists rmpd406_ok boolean not null default false,
  add column if not exists is_test boolean not null default false;

-- ---------- доступ: адмін — тестовий режим без ліміту ----------
create or replace function public.rmpd_access(bid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b record; paid boolean; used int; lim int;
begin
  select * into b from brokers where id = bid and user_id = auth.uid();
  if not found then return jsonb_build_object('allowed', false, 'reason', 'no_profile'); end if;
  paid := coalesce(b.plan,'free') <> 'free' and (b.plan_expires_at is null or b.plan_expires_at > now());
  select count(*) into used from rmpd_requests
   where owner_id = bid and kind = 'new' and not is_test and created_at >= date_trunc('month', now());
  if is_admin() then
    return jsonb_build_object('allowed', true, 'limit', null, 'used', used, 'role', coalesce(b.kind,'broker'), 'plan', coalesce(b.plan,'free'), 'paid', true, 'test', true);
  end if;
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
revoke execute on function public.rmpd_access(uuid) from public, anon;
grant execute on function public.rmpd_access(uuid) to authenticated;

-- ---------- захист статусів ----------
create or replace function public.rmpd_protect()
returns trigger language plpgsql security definer set search_path = public as $$
declare acc jsonb;
begin
  new.updated_at := now();
  if is_admin() then
    if tg_op = 'INSERT' then new.is_test := true; new.user_id := coalesce(new.user_id, auth.uid()); end if;
    if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
      if not coalesce(new.rmpd406_ok, false) then raise exception 'rmpd_406_required'; end if;
      if coalesce(new.ref_number, '') = '' then raise exception 'rmpd_ref_required'; end if;
      new.done_at := now();
      if new.valid_until is null then new.valid_until := (now() at time zone 'Europe/Warsaw')::date + 10; end if;
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
    new.is_test := false; new.rmpd406_ok := false;
    new.admin_note := null; new.ref_number := null; new.done_at := null; new.valid_until := null; new.crm_request_id := null;
    return new;
  end if;

  if new.status = 'cancelled' and old.status <> 'done' then
    new := old; new.status := 'cancelled'; new.updated_at := now(); return new;
  end if;
  if old.status not in ('new','needs_fix') then raise exception 'rmpd: request is locked'; end if;
  new.status := 'new';
  new.owner_id := old.owner_id; new.user_id := old.user_id; new.kind := old.kind; new.parent_id := old.parent_id;
  new.admin_note := old.admin_note; new.ref_number := old.ref_number; new.done_at := old.done_at;
  new.valid_until := old.valid_until; new.crm_request_id := old.crm_request_id; new.created_at := old.created_at;
  new.is_test := old.is_test; new.rmpd406_ok := false;
  return new;
end $$;
revoke execute on function public.rmpd_protect() from public, anon, authenticated;

-- ---------- тестові заявки не йдуть у CRM ----------
create or replace function public.rmpd_to_crm()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  b record; body jsonb;
  k constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZHVva2phYXdtb3JjeWl1dml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDE1NDgsImV4cCI6MjA5NjQxNzU0OH0.usjLWtdJW0OJt8dgUfCnkVljKN6kpG7vJ907Y_XWieg';
begin
  if new.is_test then return new; end if;
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

-- ---------- нагадування за день до кінця строку дії ----------
create or replace function public.rmpd_expiry_reminders()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0;
begin
  for r in select id from rmpd_requests
            where status = 'done' and valid_until = (now() at time zone 'Europe/Kyiv')::date + 1 loop
    perform net.http_post(
      url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/tg',
      body := jsonb_build_object('event', 'rmpd_expiring', 'id', r.id, 'at', floor(extract(epoch from now()))::bigint),
      headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.rmpd_expiry_reminders() from public, anon, authenticated;

select cron.unschedule('rmpd-expiry-reminders') where exists (select 1 from cron.job where jobname = 'rmpd-expiry-reminders');
select cron.schedule('rmpd-expiry-reminders', '0 7 * * *', 'select public.rmpd_expiry_reminders()');

-- ---------- приватне сховище документів ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rmpd-docs', 'rmpd-docs', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rmpd_docs_ins on storage.objects;
create policy rmpd_docs_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'rmpd-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists rmpd_docs_sel on storage.objects;
create policy rmpd_docs_sel on storage.objects for select to authenticated
  using (bucket_id = 'rmpd-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists rmpd_docs_del on storage.objects;
create policy rmpd_docs_del on storage.objects for delete to authenticated
  using (bucket_id = 'rmpd-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
