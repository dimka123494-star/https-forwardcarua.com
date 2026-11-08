-- RMPD100 розділи 3.7/3.8: повна адреса місця старту й призначення в Польщі
-- {city, zip, street, bld, prov, lat, lon, src}
alter table public.rmpd_requests add column if not exists start_addr jsonb;
alter table public.rmpd_requests add column if not exists end_addr jsonb;
