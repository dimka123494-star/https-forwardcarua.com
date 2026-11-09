-- Публічні профілі перевізників /perevizhnyk/{ЄДРПОУ} на основі реєстру ліцензій (carrier_registry).
-- Реєстр закритий RLS; назовні — лише через SECURITY DEFINER-функції з потрібними полями.
-- ФОП: імʼя не показуємо (персональні дані) — лише статус ліцензії.

alter table public.registry_claims add column if not exists kind text not null default 'broker';
alter table public.brokers add column if not exists edrpou text;
create index if not exists brokers_edrpou_idx on public.brokers (edrpou) where edrpou is not null;
create index if not exists carrier_registry_name_idx on public.carrier_registry (lower(name)) where not is_fop;

create or replace function public.carrier_public(code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r carrier_registry; rm int; sn int; b uuid; pend boolean;
begin
  if code !~ '^\d{8,10}$' then return jsonb_build_object('found', false); end if;
  select * into r from carrier_registry where edrpou = code;
  if not found then return jsonb_build_object('found', false); end if;
  select count(*) into rm from rmpd_requests where carrier_code = code and status = 'done' and not coalesce(is_test, false);
  select count(*) into sn from sent_requests where carrier_id = code and status = 'done' and not coalesce(is_test, false);
  select id into b from brokers where edrpou = code and is_active and kind = 'carrier' and claimed_at is not null limit 1;
  select exists(select 1 from registry_claims where edrpou = code and kind = 'carrier' and status in ('new','verified')) into pend;
  return jsonb_build_object(
    'found', true, 'code', r.edrpou, 'is_fop', r.is_fop,
    'name', case when r.is_fop then null else r.name end,
    'status', r.status, 'intl_cargo', r.intl_cargo, 'dangerous', r.dangerous,
    'activities', r.activities, 'license_date', r.license_date, 'checked_at', r.updated_at,
    'rmpd_done', rm, 'sent_done', sn, 'broker_id', b,
    'state', case when b is not null then 'claimed' when pend then 'pending' else 'none' end);
end $$;

create or replace function public.carrier_search(q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text := trim(coalesce(q, ''));
begin
  if t ~ '^\d{8,10}$' then
    return coalesce((select jsonb_agg(jsonb_build_object('code', edrpou, 'name', case when is_fop then null else name end,
                       'is_fop', is_fop, 'status', status, 'intl_cargo', intl_cargo)) from carrier_registry where edrpou = t), '[]'::jsonb);
  end if;
  if length(t) < 3 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('code', edrpou, 'name', name, 'is_fop', false, 'status', status, 'intl_cargo', intl_cargo) x
      from carrier_registry where not is_fop and lower(name) like '%' || lower(replace(replace(t, '%', ''), '_', '')) || '%'
      order by (status = 'Чинна') desc, intl_cargo desc, name limit 20) s), '[]'::jsonb);
end $$;

-- «Це моя компанія» від перевізника — у ту саму чергу заявок, що й брокерські (registry_claims), з kind = 'carrier'
create or replace function public.claim_carrier_profile(p_edrpou text, p_company text, p_name text, p_position text, p_phone text, p_email text, p_comment text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_edrpou !~ '^\d{8,10}$' or not exists (select 1 from carrier_registry where edrpou = p_edrpou) then raise exception 'bad_edrpou'; end if;
  if length(coalesce(trim(p_name),'')) < 2 then raise exception 'bad_name'; end if;
  if length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 9 then raise exception 'bad_phone'; end if;
  if coalesce(p_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if (select count(*) from registry_claims where edrpou = p_edrpou and created_at > now() - interval '1 day') >= 3 then raise exception 'too_many'; end if;
  insert into registry_claims (edrpou, company, contact_name, position, phone, email, comment, kind)
  values (p_edrpou, left(coalesce(p_company, ''), 300), left(trim(p_name), 120), left(p_position, 120), left(p_phone, 40),
          lower(left(trim(p_email), 160)), left(p_comment, 1000), 'carrier');
  return true;
end $$;

revoke all on function public.carrier_public(text), public.carrier_search(text),
  public.claim_carrier_profile(text, text, text, text, text, text, text) from public;
grant execute on function public.carrier_public(text), public.carrier_search(text),
  public.claim_carrier_profile(text, text, text, text, text, text, text) to anon, authenticated;

-- Оновлено (міграції carrier_public_edr, carrier_public_profile, carrier_sitemap_claimed_fop):
--  carrier_public повертає edr/edr_at (дані ЄДР) і profile (контакти, автопарк, напрямки) для підтвердженого профілю;
--  carrier_sitemap включає ФОП, які підтвердили профіль.
