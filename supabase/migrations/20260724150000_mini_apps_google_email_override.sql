-- Mini-apps — eigen "Google-werk-e-mailadres"-override, ONAFHANKELIJK van
-- mail-signature-designer's user_signature_settings.google_email_override.
--
-- Waarom een aparte tabel i.p.v. hergebruik van het bestaande override-veld:
-- de Operations Manager-login (users.email) is niet altijd hetzelfde adres
-- als iemands echte Google Workspace-mailbox (bv. een gedeeld/generiek OM-
-- account). mail-signature-designer heeft dit probleem al opgelost met zijn
-- eigen google_email_override, puur voor de signature-Gmail-push. Mini-apps'
-- Google Drive-koppeling (src/modules/mini-apps/lib/google-drive-client.js)
-- heeft exact hetzelfde probleem, maar bewust een EIGEN veld: zo blijft
-- instellen van het ene adres (bv. voor Drive) losstaan van het andere (voor
-- signatures) — geen module-koppeling, geen verrassend neveneffect als een
-- gebruiker het adres voor de ene feature wijzigt.
create table if not exists mini_app_user_settings (
  user_id               uuid primary key references users(id) on delete cascade,
  google_email_override text,
  updated_at            timestamptz not null default now()
);

comment on table mini_app_user_settings is
  'Per-gebruiker instellingen voor de mini-apps module. Vandaag enkel google_email_override (impersonation-subject voor de Google Drive-koppeling, zie lib/google-drive-client.js) -- bewust apart van mail-signature-designer.user_signature_settings.google_email_override.';
