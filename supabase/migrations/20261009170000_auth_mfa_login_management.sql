-- =============================================================================
-- Inloggen: tweestapsverificatie (2FA) en loginbeheer
-- =============================================================================
--
-- Zie CLAUDE.md, "Inloggen -- 2FA en loginbeheer (2026-10)".
--
-- Volledig ACHTERWAARTS COMPATIBEL met de code van voor deze wijziging: er
-- verdwijnt niets en `sessions.token` blijft bestaan (enkel niet meer
-- verplicht). Deze migratie mag dus VOOR de deploy draaien; de oude code
-- blijft er gewoon mee werken tot de nieuwe live staat.

-- -----------------------------------------------------------------------------
-- users: het 2FA-geheim (versleuteld), en of het wachtwoord gewijzigd moet
-- -----------------------------------------------------------------------------
alter table public.users
  add column if not exists mfa_secret_enc text,
  add column if not exists mfa_enabled_at timestamptz,
  add column if not exists mfa_last_step bigint,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_changed_at timestamptz;

comment on column public.users.mfa_secret_enc is
  'TOTP-geheim, AES-GCM-versleuteld met een sleutel uit de Worker-secret AUTH_SECRET_KEY en gebonden aan users.id. Nooit leesbaar zonder die secret.';
comment on column public.users.mfa_last_step is
  'TOTP-tijdstap van de laatst aanvaarde code; een code van die stap of vroeger wordt geweigerd (geen hergebruik).';
comment on column public.users.must_change_password is
  'Gezet als een beheerder het wachtwoord aanmaakt of reset: bij de volgende aanmelding moet de gebruiker een eigen wachtwoord kiezen.';

-- -----------------------------------------------------------------------------
-- sessions: het token enkel nog als hash, en hoe de tweede stap gezet werd
-- -----------------------------------------------------------------------------
alter table public.sessions alter column token drop not null;

alter table public.sessions
  add column if not exists token_hash text,
  add column if not exists mfa_method text,
  add column if not exists country text,
  add column if not exists city text;

create unique index if not exists sessions_token_hash_key on public.sessions (token_hash);
create index if not exists sessions_user_id_idx on public.sessions (user_id);

comment on column public.sessions.token_hash is
  'SHA-256 van het sessietoken. Het token zelf staat enkel in de cookie van de gebruiker. Rijen zonder token_hash dateren van voor 2026-10-09 en worden opgeruimd.';
comment on column public.sessions.mfa_method is
  'Hoe de tweede stap gezet werd: totp of recovery. Leeg = zonder 2FA (enkel mogelijk met AUTH_MFA_MODE=optional).';

-- -----------------------------------------------------------------------------
-- auth_challenges: een aanmelding die nog niet af is (tussen wachtwoord en sessie)
-- -----------------------------------------------------------------------------
create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  stage text not null check (stage in ('mfa_verify', 'mfa_enroll', 'password_change', 'mfa_setup')),
  pending_secret_enc text,
  mfa_method text,
  attempts integer not null default 0,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.auth_challenges enable row level security;

create index if not exists auth_challenges_user_id_idx on public.auth_challenges (user_id);
create index if not exists auth_challenges_expires_at_idx on public.auth_challenges (expires_at);

-- -----------------------------------------------------------------------------
-- user_mfa_recovery_codes: herstelcodes, enkel als hash, elk EEN keer bruikbaar
-- -----------------------------------------------------------------------------
create table if not exists public.user_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.user_mfa_recovery_codes enable row level security;

create unique index if not exists user_mfa_recovery_codes_user_hash_key
  on public.user_mfa_recovery_codes (user_id, code_hash);

-- -----------------------------------------------------------------------------
-- auth_events: het aanmeldlogboek, en de bron voor de tijdelijke blokkering
-- -----------------------------------------------------------------------------
create table if not exists public.auth_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete set null,
  email text,
  event text not null,
  ip_address text,
  user_agent text,
  country text,
  city text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.auth_events enable row level security;

create index if not exists auth_events_email_created_idx on public.auth_events (email, created_at desc);
create index if not exists auth_events_ip_created_idx on public.auth_events (ip_address, created_at desc);
create index if not exists auth_events_user_created_idx on public.auth_events (user_id, created_at desc);
create index if not exists auth_events_created_idx on public.auth_events (created_at desc);

comment on table public.auth_events is
  'Elke aanmeldpoging en elke wijziging aan de toegang (2FA, wachtwoord, sessies). Wordt na 365 dagen opgeruimd (src/lib/auth/cleanup.js).';
