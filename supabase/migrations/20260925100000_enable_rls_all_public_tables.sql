-- Row-Level Security aan op ELKE tabel in het public-schema.
--
-- Waarom: Supabase meldde `rls_disabled_in_public` (2026-09-19). Een tabel in
-- `public` zonder RLS is via de PostgREST-API te lezen, te wijzigen en te
-- wissen door iedereen met de project-URL en de (publieke) anon-key.
--
-- Waarom dit niets breekt: de Worker praat uitsluitend met de
-- SERVICE-ROLE-key (`getSupabaseClient()` in src/lib/database.js), en die rol
-- heeft BYPASSRLS. Nergens in de repo (Worker, public/, wp-plugin/) wordt de
-- anon-key gebruikt. RLS aan zonder policies = anon/authenticated krijgen
-- niets, de Worker merkt geen verschil.
--
-- Dynamisch en niet per tabel uitgeschreven: 90+ tabellen zijn verspreid over
-- 175 migraties aangemaakt, en een handgeschreven lijst mist er gegarandeerd
-- een. Idempotent: een tabel die al RLS heeft, wordt overgeslagen.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')          -- gewone + gepartitioneerde tabellen
      and not c.relrowsecurity
  loop
    begin
      execute format('alter table public.%I enable row level security', t.relname);
      raise notice 'RLS aangezet op public.%', t.relname;
    exception when insufficient_privilege then
      -- bv. een tabel van een extensie (spatial_ref_sys): niet van ons.
      raise warning 'RLS NIET aangezet op public.% (geen eigenaar)', t.relname;
    end;
  end loop;
end
$$;

-- Vangnet voor de toekomst: elke NIEUWE tabel in public krijgt meteen RLS.
-- Zonder dit komt de melding terug bij de eerstvolgende migratie die een
-- `create table` vergeet te volgen met `enable row level security`.
create or replace function public.om_rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end
$$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'om_rls_auto_enable') then
    create event trigger om_rls_auto_enable
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.om_rls_auto_enable();
  end if;
exception when insufficient_privilege then
  -- Mag de rol geen event trigger maken, dan blijft de eenmalige ronde
  -- hierboven staan; nieuwe tabellen moeten RLS dan zelf aanzetten.
  raise warning 'Event trigger om_rls_auto_enable niet aangemaakt (geen rechten)';
end
$$;

-- Controle achteraf (moet 0 rijen geven):
-- select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
