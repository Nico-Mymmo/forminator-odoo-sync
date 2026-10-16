-- Homepage: modules die een gebruiker als favoriet bovenaan vastpint.
--
-- Persoonlijk (per gebruiker), volgorde = position (laagste eerst).
-- Gelezen en geschreven door src/modules/home/api-module.js.

create table if not exists public.user_module_favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, module_id)
);
alter table public.user_module_favorites enable row level security;
