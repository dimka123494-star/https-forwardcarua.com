-- Застосовано 20.11.2026 після першого наповнення edr_companies (див. 2026-11-edr-companies.sql).
-- Через PostgREST-upsert по 2000 рядків вставки з триграмним індексом упиралися в statement timeout 8 с.

-- без «відкладеного списку» GIN: вставки рівномірні, без багатосекундних сплесків
alter index public.edr_companies_search_trgm set (fastupdate = off);

-- Upsert лише змінених рядків: щотижня змінюються тисячі записів із 2 млн, решту не чіпаємо.
create or replace function public.edr_upsert(p_rows jsonb)
returns int language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare n int;
begin
  insert into edr_companies(code, name, short_name, state, reg_date, head)
  select r.code, r.name, r.short_name, r.state, r.reg_date, r.head
    from jsonb_to_recordset(p_rows) as r(code text, name text, short_name text, state text, reg_date date, head text)
  on conflict (code) do update
     set name = excluded.name, short_name = excluded.short_name, state = excluded.state,
         reg_date = excluded.reg_date, head = excluded.head, updated_at = now()
   where (edr_companies.name, edr_companies.short_name, edr_companies.state, edr_companies.reg_date, edr_companies.head)
         is distinct from (excluded.name, excluded.short_name, excluded.state, excluded.reg_date, excluded.head);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.edr_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.edr_upsert(jsonb) to service_role;

-- щосереди щохвилини 04:00–09:59 UTC, по 3 шарди (ліміт CPU edge-функції); незмінені рядки проходять швидко
select cron.schedule('edr-load', '* 4-9 * * 3', 'select public.edr_load_call()');
