-- ============================================================================
-- Odoo-controle: de factuur-, abonnement- en CRM-controle in de OM
-- ============================================================================
-- Overgenomen van de claude.ai-pagina "Factuur-, abonnement- en CRM-controle"
-- (oktober 2026). Een case is een fout of open vraag in een offerte,
-- abonnement, factuur, bedrijf of verkoopkans in Odoo; een patroon is een
-- oorzaak die bij meerdere klanten terugkomt, met de regel die het voortaan
-- voorkomt. Een case kan meerdere patronen hebben (controle_case_patterns).
--
-- De status van een case is AFGELEID en staat niet in een kolom:
--   geen_fout -> 'geenfout'; onderzocht en rechtgezet -> 'opgelost';
--   vasthouden -> 'wacht'; een van beide stappen -> 'bezig'; anders 'open'.
--   (src/modules/odoo-controle/lib/constants.js, statusVan)
--
-- Gelijktijdig werken: elke schrijfactie verhoogt `versie`; het scherm stuurt
-- de versie mee die het kent en krijgt een 409 als die niet meer klopt.
-- Elke veldwijziging komt in controle_history (wie, wat, waarvandaan).
--
-- RLS: de Worker gebruikt de service-role-key (bypasst RLS); de rechten zitten
-- in src/modules/odoo-controle/routes.js. RLS staat aan zonder policies, zodat
-- de tabellen via PostgREST met de anon-key dicht zijn (regel in claude.md).
-- ============================================================================

create table if not exists public.controle_patterns (
  id              text primary key,                 -- slug, bv. 'startfactuur-dubbel'
  nr              integer not null default 99,      -- volgorde
  titel           text not null,
  uitleg          text not null default '',         -- wat er misgaat en waarom
  regel           text not null default '',         -- wat je voortaan doet (geldt voor het hele patroon)
  controle        text not null default '',         -- toetsbare voorwaarde in Odoo
  bron_case       text,                             -- case waaruit het patroon ontstond (via Claude)
  aangemaakt      timestamptz,
  bijgewerkt      timestamptz,                      -- laatste tekstwijziging; "gewijzigd, niet geverifieerd" = bijgewerkt > geverifieerd
  geverifieerd    timestamptz,
  door_user_id    uuid references public.users(id) on delete set null,
  door_naam       text,
  versie          integer not null default 0,
  rij_bijgewerkt  timestamptz not null default now()
);
alter table public.controle_patterns enable row level security;

create table if not exists public.controle_cases (
  id                text primary key,               -- 'c001' ...
  nr                integer not null,
  klant             text not null,
  klanttype         text,                           -- VME in beheer | VME in advies | Professionele syndicus | ...
  titel             text,
  bedrag            text,                           -- weergavetekst, bv. '€ 981,84 ARR'
  categorie         text,
  domein            text,                           -- facturatie | abonnement | partners | crm
  prio              text,                           -- dringend | hoog | gemiddeld | beslissen | laag
  prio_rang         integer,
  zekerheid         text,                           -- zeker | waarschijnlijk | na te kijken
  soort             text not null default 'onbekend', -- ingave | upsell | dubbel | creditnota | opvolging | afspraak | gegevens | systeem | onbekend
  deadline          date,
  vervaldag         date,
  bevinding         text,                           -- vaststelling uit de controle (vast)
  voorstel          text,                           -- voorstel uit de controle (vast)
  refs              jsonb not null default '[]'::jsonb, -- [{id, label, model}] met model in res.partner|sale.order|account.move|crm.lead
  -- werk van het team
  onderzocht        boolean not null default false,
  rechtgezet        boolean not null default false, -- in Odoo, of in OpenVME als in_openvme aan staat
  geen_fout         boolean not null default false, -- dit is bewust zo
  in_openvme        boolean not null default false, -- fout wordt in OpenVME opgelost, niet in Odoo
  vasthouden        boolean not null default false, -- wacht op goedkeuring (eigen status)
  wat_gebeurde      text not null default '',
  actie             text not null default '',       -- wat we deden om het recht te zetten
  complicaties      text not null default '',       -- opmerkingen: complicaties, waarop of op wie we wachten
  les               text not null default '',       -- les voor het patroon (optioneel; voedt de regel)
  bijgewerkt        timestamptz,                    -- laatste wijziging door het team
  tekst_bijgewerkt  timestamptz,                    -- laatste wijziging aan een van de vier teksten
  geverifieerd      timestamptz,                    -- Claude's voorstel beslist, of "mijn versie houden"
  door_user_id      uuid references public.users(id) on delete set null,
  door_naam         text,
  aangemaakt        timestamptz not null default now(),
  versie            integer not null default 0,
  rij_bijgewerkt    timestamptz not null default now()
);
alter table public.controle_cases enable row level security;
create index if not exists idx_controle_cases_prio on public.controle_cases (prio_rang, nr);
create index if not exists idx_controle_cases_rij on public.controle_cases (rij_bijgewerkt);

create table if not exists public.controle_case_patterns (
  case_id     text not null references public.controle_cases(id) on delete cascade,
  pattern_id  text not null references public.controle_patterns(id) on delete cascade,
  pos         integer not null default 0,           -- volgorde; 0 = het eerste
  primary key (case_id, pattern_id)
);
alter table public.controle_case_patterns enable row level security;
create index if not exists idx_controle_case_patterns_pattern on public.controle_case_patterns (pattern_id);

create table if not exists public.controle_history (
  id            bigserial primary key,
  entity        text not null,                      -- 'case' | 'pattern' | 'import'
  entity_id     text not null,
  veld          text not null,
  oud           text,
  nieuw         text,
  door_user_id  uuid references public.users(id) on delete set null,
  door_naam     text,
  bron          text,                               -- 'gebruiker' | 'claude-voorstel-overgenomen' | 'import'
  tijd          timestamptz not null default now()
);
alter table public.controle_history enable row level security;
create index if not exists idx_controle_history_entity on public.controle_history (entity, entity_id, tijd desc);

create table if not exists public.controle_meta (
  key    text primary key,
  value  text
);
alter table public.controle_meta enable row level security;

-- ─── Module-registratie ─────────────────────────────────────────────────────

insert into public.modules (code, name, description, route, icon, is_active, is_default, display_order)
values (
  'odoo_controle',
  'Odoo-controle',
  'Factuur-, abonnement- en CRM-controle: cases, patronen, regels en het skill-concept',
  '/odoo-controle',
  'clipboard-check',
  true,
  false,
  150
)
on conflict (code) do nothing;

-- Iedereen die actief is: het team werkt er samen in (lezen en schrijven).
-- Verwijderen van patronen en importeren blijft voor beheerders (routes.js).
insert into public.user_modules (user_id, module_id, is_enabled, granted_by)
select u.id, m.id, true, u.id
from public.users u
cross join public.modules m
where m.code = 'odoo_controle'
  and u.is_active = true
  and not exists (
    select 1 from public.user_modules um
    where um.user_id = u.id and um.module_id = m.id
  );
