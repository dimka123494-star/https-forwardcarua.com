-- Інформаційні листи покупцям (функція news): згоди, відписки, журнал надсилань.
create table if not exists marketing_contacts (
  email text primary key,
  consent_at timestamptz,          -- натиснув «хочу отримувати новини»
  unsubscribed_at timestamptz,     -- відписався — більше нічого рекламного
  source text,
  created_at timestamptz not null default now()
);
alter table marketing_contacts enable row level security;
create policy mkt_contacts_admin on marketing_contacts for select using (is_admin());

create table if not exists marketing_sends (
  campaign text not null,
  email text not null,
  sent_at timestamptz not null default now(),
  primary key (campaign, email)
);
alter table marketing_sends enable row level security;
create policy mkt_sends_admin on marketing_sends for select using (is_admin());

-- одержувачі кампанії: покупці (оплачені звіти авто/компаній, детальні перевірки), без відписаних і тих, кому вже надіслано;
-- p_consent_only — лише ті, хто дав згоду (для всіх наступних розсилок після першої)
create or replace function marketing_recipients(p_campaign text, p_consent_only boolean default false)
returns table(email text) language sql stable security definer set search_path = public as $$
  with buyers as (
    select lower(trim(email)) email from vehicle_orders where status = 'paid' and email is not null
    union select lower(trim(email)) from check_orders where status = 'paid' and email is not null
    union select lower(trim(email)) from vehicle_expert_orders where status in ('paid','in_progress','done') and email is not null
  )
  select b.email from buyers b
  left join marketing_contacts c on c.email = b.email
  where b.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and c.unsubscribed_at is null
    and (not p_consent_only or c.consent_at is not null)
    and not exists (select 1 from marketing_sends s where s.campaign = p_campaign and s.email = b.email)
  order by 1;
$$;
revoke all on function marketing_recipients(text, boolean) from public, anon, authenticated;
