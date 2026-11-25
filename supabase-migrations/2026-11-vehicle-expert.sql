-- Детальна перевірка авто за VIN (обмеження, ДРОРМ, штрафи, виконавчі провадження, обтяження) — 500 грн.
-- Клієнт оплачує карткою → заявка в адмінці → адміністратор заповнює довідку текстом → клієнт отримує лист з посиланням /dovidka-avto?t=…
-- Доступ: таблицю читає/змінює лише адмін (RLS), клієнт бачить довідку через vehicle-check {action:'expert_get', t} за випадковим токеном.

insert into service_prices (code, name, price, active, sort)
values ('vehicle_expert', 'Детальна перевірка авто за VIN: обмеження, ДРОРМ, штрафи, виконавчі провадження, обтяження', 500, true, 59)
on conflict (code) do nothing;

create table if not exists vehicle_expert_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique,
  q text not null,                 -- що вводив клієнт (номер або VIN)
  vin text not null,               -- VIN, за яким перевіряємо
  vehicle text,                    -- марка/модель/рік для зручності
  email text not null,
  phone text,
  amount numeric not null,
  status text not null default 'pending',   -- pending → paid → in_progress → done; expired / declined / cancelled
  order_reference text unique,
  paid_at timestamptz,
  raw jsonb,
  result jsonb,                    -- {restrictions, drorm, fines, enforcement, encumbrances, conclusion}
  done_at timestamptz,
  paid_mailed_at timestamptz,
  done_mailed_at timestamptz
);
create index if not exists vehicle_expert_orders_created on vehicle_expert_orders (created_at desc);
alter table vehicle_expert_orders enable row level security;
create policy vexp_admin on vehicle_expert_orders for all using (is_admin()) with check (is_admin());

-- листи: після оплати (клієнту — підтвердження, адміну — нова заявка) і коли довідка готова
create or replace function vehicle_expert_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if new.status = 'paid' and coalesce(old.status, '') <> 'paid' and new.paid_mailed_at is null then k := 'paid';
  elsif new.status = 'done' and coalesce(old.status, '') <> 'done' and new.done_mailed_at is null then k := 'done';
  end if;
  if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  if k is not null then
    perform net.http_post(
      url := 'https://ecdfpqhbaqjqurzedunh.supabase.co/functions/v1/order-reminders',
      body := jsonb_build_object('expert', new.id, 'kind', k),
      headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
  end if;
  return new;
end $$;
create or replace trigger vehicle_expert_notify before update on vehicle_expert_orders for each row execute function vehicle_expert_notify();
