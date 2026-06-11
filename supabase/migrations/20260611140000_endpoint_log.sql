-- Endpoint tracking: registreert wanneer een module-endpoint voor het laatst is aangeroepen.
-- Upsert via upsert_endpoint_log() — fire-and-forget vanuit de module-router.

create table if not exists endpoint_log (
  endpoint text primary key,
  last_called_at timestamptz not null default now(),
  call_count bigint not null default 1
);

create or replace function upsert_endpoint_log(p_endpoint text)
returns void language sql as $$
  insert into endpoint_log (endpoint, last_called_at, call_count)
  values (p_endpoint, now(), 1)
  on conflict (endpoint) do update
    set last_called_at = now(),
        call_count = endpoint_log.call_count + 1;
$$;
