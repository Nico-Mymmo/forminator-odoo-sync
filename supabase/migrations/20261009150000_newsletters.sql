-- ============================================================================
-- Nieuwsbrieven — de redactietafel in de OM
-- ============================================================================
-- Migration: 2026-10-09
--
-- De drie nieuwsbrieven (Syndicoach, OpenVME, Professionals) worden in de OM
-- samengesteld, door het hele bedrijf: elke rubriek heeft een eigenaar, elke
-- editie een inleverdatum en een verzendmoment. Odoo blijft de motor die
-- verstuurt (mailing.mailing op mailing.list, Postmark broadcast) en de lijsten
-- en uitschrijvingen beheert. Ontwerp: docs/ontwerp-om-nieuwsbrieven.md.
--
-- Dit is werkproces van de OM, geen CRM-gegeven: daarom Supabase. Odoo krijgt
-- het eindproduct (de mailing) en de antwoorden op vragen in de mail (via een
-- koppeling).
--
-- Elke tabel krijgt RLS aan, zonder policies (zie CLAUDE.md): de Worker
-- gebruikt de service-role-key.
-- ============================================================================

-- ─── REEKSEN ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter_series (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    TEXT NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  brand                   TEXT NOT NULL CHECK (brand IN ('openvme', 'syndicoach')),
  description             TEXT NOT NULL DEFAULT '',
  -- Voor de AI: voor wie schrijven we, en hoe klinken we.
  audience                TEXT NOT NULL DEFAULT '',
  tone                    TEXT NOT NULL DEFAULT '',
  -- Odoo mailing.list-id's. Pas gebruikt bij een ECHTE verzending; zolang
  -- NEWSLETTER_SEND_MODE niet 'live' is, gaat er enkel een test naar de
  -- testadressen.
  odoo_list_ids           INTEGER[] NOT NULL DEFAULT '{}',
  from_name               TEXT NOT NULL DEFAULT '',
  from_email              TEXT NOT NULL DEFAULT '',
  reply_to                TEXT NOT NULL DEFAULT '',
  logo_url                TEXT NOT NULL DEFAULT '',
  tint                    TEXT NOT NULL DEFAULT '',
  -- Ritme: 'monthly' (elke maand op send_day) of 'none' (enkel met de hand).
  cadence                 TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('monthly', 'none')),
  send_day                INTEGER NOT NULL DEFAULT 15 CHECK (send_day BETWEEN 1 AND 28),
  send_hour               INTEGER NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 6 AND 20),
  deadline_workdays       INTEGER NOT NULL DEFAULT 3 CHECK (deadline_workdays BETWEEN 1 AND 10),
  create_days_ahead       INTEGER NOT NULL DEFAULT 35 CHECK (create_days_ahead BETWEEN 7 AND 90),
  -- Naam of id van een kanaal uit Mini-apps -> Chat-kanalen. Leeg = geen
  -- meldingen. Bewust standaard leeg: een deploy mag niemand beginnen te porren.
  chat_channel            TEXT NOT NULL DEFAULT '',
  -- De koppeling waar de antwoorden op vragen in de mail naartoe gaan.
  answers_integration_id  UUID,
  -- Wie naast admin/marketing hoofdredactie is van deze reeks.
  editor_user_ids         UUID[] NOT NULL DEFAULT '{}',
  -- De vaste rubrieken: [{key, title, kind, owner_user_id, hint}]. Een nieuwe
  -- editie krijgt per rubriek een opdracht bij de eigenaar.
  sections                JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_series ENABLE ROW LEVEL SECURITY;

-- ─── EDITIES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter_editions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id               UUID NOT NULL REFERENCES newsletter_series(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL DEFAULT '',
  send_at                 TIMESTAMPTZ NOT NULL,
  deadline_at             TIMESTAMPTZ NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'collecting'
                          CHECK (status IN ('collecting', 'review', 'scheduled', 'sent', 'cancelled')),
  subject                 TEXT NOT NULL DEFAULT '',
  preheader               TEXT NOT NULL DEFAULT '',
  -- De echte mailing in Odoo (enkel bij een live verzending).
  odoo_mailing_id         INTEGER,
  -- Testmailings: elke test is een eigen mailing.mailing (een verzonden
  -- mailing kan in Odoo niet opnieuw).
  test_mailing_ids        INTEGER[] NOT NULL DEFAULT '{}',
  last_test_at            TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,
  stats                   JSONB,
  -- Welke herinneringen al vertrokken: {"d3": "...", "d1": "..."}.
  reminders               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_editions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_newsletter_editions_series ON newsletter_editions (series_id, send_at DESC);
-- Eén automatische editie per reeks per verzendmoment: de cron mag hem nooit
-- twee keer aanmaken, ook niet als twee rondes tegelijk lopen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_newsletter_editions_series_send
  ON newsletter_editions (series_id, send_at) WHERE status <> 'cancelled';

-- ─── BIJDRAGEN ──────────────────────────────────────────────────────────────
-- Een stukje van één persoon. edition_id NULL = in de voorraad.

CREATE TABLE IF NOT EXISTS newsletter_contributions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id              UUID REFERENCES newsletter_editions(id) ON DELETE SET NULL,
  -- Voor de voorraad: voor welke reeksen is dit idee bedoeld.
  series_ids              UUID[] NOT NULL DEFAULT '{}',
  section_key             TEXT NOT NULL DEFAULT '',
  position                INTEGER NOT NULL DEFAULT 0,
  kind                    TEXT NOT NULL,
  title                   TEXT NOT NULL DEFAULT '',
  content                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_notes               TEXT NOT NULL DEFAULT '',
  owner_user_id           UUID,
  status                  TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'draft', 'submitted', 'approved')),
  -- Waar het vandaan komt: 'event:88', 'snippet:97', 'linkedin:<url>', 'idee'.
  source                  TEXT NOT NULL DEFAULT '',
  submitted_at            TIMESTAMPTZ,
  approved_at             TIMESTAMPTZ,
  approved_by             UUID,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_contributions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_newsletter_contributions_edition ON newsletter_contributions (edition_id, position);
CREATE INDEX IF NOT EXISTS idx_newsletter_contributions_owner ON newsletter_contributions (owner_user_id, status);

-- ─── OPMERKINGEN ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter_comments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id         UUID NOT NULL REFERENCES newsletter_contributions(id) ON DELETE CASCADE,
  user_id                 UUID,
  body                    TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_newsletter_comments_contribution ON newsletter_comments (contribution_id, created_at);

-- ─── WAT ER GEBEURDE ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newsletter_activity (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id              UUID REFERENCES newsletter_editions(id) ON DELETE CASCADE,
  contribution_id         UUID,
  user_id                 UUID,
  kind                    TEXT NOT NULL,
  text                    TEXT NOT NULL DEFAULT '',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_activity ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_newsletter_activity_edition ON newsletter_activity (edition_id, created_at DESC);

-- ─── ANTWOORDEN OP VRAGEN IN DE MAIL ────────────────────────────────────────
-- Eén rij per (vraag, ontvanger); het laatste antwoord telt. Een anoniem
-- antwoord (geen geldig token: doorgestuurde of oude mail) telt mee in de
-- cijfers maar gaat niet naar Odoo.

CREATE TABLE IF NOT EXISTS newsletter_answers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id         UUID NOT NULL REFERENCES newsletter_contributions(id) ON DELETE CASCADE,
  edition_id              UUID REFERENCES newsletter_editions(id) ON DELETE CASCADE,
  option_value            TEXT NOT NULL,
  comment                 TEXT NOT NULL DEFAULT '',
  contact_id              INTEGER,
  verified                BOOLEAN NOT NULL DEFAULT FALSE,
  -- Geheim dat enkel de bedankpagina kent: daarmee mag ze een toelichting of
  -- een ander antwoord op DEZE rij zetten.
  answer_key              TEXT NOT NULL,
  -- Rijpt 10 minuten voor het naar de koppeling gaat (zie lib/answers.js).
  pushed_at               TIMESTAMPTZ,
  push_error              TEXT,
  submission_id           UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE newsletter_answers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS uq_newsletter_answers_contact
  ON newsletter_answers (contribution_id, contact_id) WHERE contact_id IS NOT NULL AND verified;
CREATE INDEX IF NOT EXISTS idx_newsletter_answers_push ON newsletter_answers (pushed_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_answers_edition ON newsletter_answers (edition_id);

-- ─── DE DRIE REEKSEN ────────────────────────────────────────────────────────
-- Gemeten 2026-10-09: lijst 19 = Nieuwsbrief Syndicoach (1.799), lijst 1 =
-- Nieuwsbrief OpenVME (308), lijst 15 = Nieuwsbrief Pro (1.613), lijst 17 =
-- Professionele gebruikers (111). Welke lijsten bij OpenVME en Professionals
-- horen, is nog een open vraag (docs/ontwerp-om-nieuwsbrieven.md §12); het
-- staat los van de veiligheid, want zonder NEWSLETTER_SEND_MODE=live gaat er
-- niets naar een van deze lijsten.

INSERT INTO newsletter_series (code, name, brand, description, audience, tone, odoo_list_ids,
  from_name, from_email, reply_to, logo_url, tint, send_day, sections)
VALUES
(
  'syndicoach', 'Syndicoach-brief', 'syndicoach',
  'Om te inspireren, mensen mee te krijgen en top of mind te blijven.',
  'Mensen die zich via syndicoach.be inschreven: (mede-)eigenaars van kleine en middelgrote appartementsgebouwen in Vlaanderen, vaak eigenaar-syndicus of op zoek naar een syndicus.',
  'Warm, inspirerend en praktisch. Je en jij. Korte zinnen. Geen verkooppraat, geen superlatieven.',
  '{19}', 'Thomas van Syndicoach', 'info@syndicoach.be', 'team-cx@openvme.be',
  'https://syndicoach.be/wp-content/uploads/2026/04/syndicoach-logo.png', '#fdf2f8', 10,
  '[
    {"key":"woordje","title":"Woordje vooraf","kind":"intro","hint":"Een persoonlijke opening van een paar zinnen."},
    {"key":"inhoud","title":"In deze editie","kind":"toc"},
    {"key":"stelling","title":"Stelling van de maand","kind":"statement","hint":"Een stelling waar lezers met één klik op reageren."},
    {"key":"team","title":"Uit het team","kind":"article","hint":"Wat we deze maand hoorden of leerden."},
    {"key":"agenda","title":"Agenda","kind":"events"},
    {"key":"nieuws","title":"Uit het nieuws","kind":"news"},
    {"key":"vraag","title":"Korte vraag","kind":"question","hint":"Eén vraag met een paar keuzes."},
    {"key":"afsluiting","title":"Tot volgende maand","kind":"closing"}
  ]'::jsonb
),
(
  'openvme', 'OpenVME platform-update', 'openvme',
  'Platformgebruikers op de hoogte houden van de ontwikkelingen en mogelijkheden in het platform.',
  'Gebruikers van het OpenVME-platform: eigenaars en eigenaar-syndici die hun gebouw in OpenVME beheren.',
  'Helder, behulpzaam en concreet: wat is nieuw, en hoe gebruik je het. Je en jij.',
  '{1}', 'Thomas van OpenVME', 'thomas@openvme.be', 'team-cx@openvme.be',
  'https://openvme.be/wp-content/uploads/2024/05/OpenVME-peppol-ready-1.png', '#f0f9ff', 3,
  '[
    {"key":"nieuw","title":"Nieuw in je platform","kind":"article","hint":"De belangrijkste nieuwigheid, met een schermafbeelding."},
    {"key":"inhoud","title":"In deze editie","kind":"toc"},
    {"key":"vernieuwd","title":"Ook vernieuwd","kind":"article","hint":"Kleinere verbeteringen, kort."},
    {"key":"peiling","title":"Jij beslist mee","kind":"poll","hint":"Laat gebruikers kiezen wat er als volgende komt."},
    {"key":"tip","title":"Tip van support","kind":"article","hint":"Eén tip die tijd bespaart."},
    {"key":"agenda","title":"Live sessies","kind":"events"},
    {"key":"afsluiting","title":"Tot de volgende update","kind":"closing"}
  ]'::jsonb
),
(
  'professionals', 'Professionals', 'openvme',
  'Onze professionals dicht bij ons houden.',
  'Professionele syndici en vastgoedbeheerders die met OpenVME werken of het overwegen.',
  'Collegiaal en zakelijk, maar niet stijf. Je en jij. Concreet over wat het hen oplevert.',
  '{15}', 'Thomas van OpenVME', 'thomas@openvme.be', 'team-cx@openvme.be',
  'https://openvme.be/wp-content/uploads/2024/05/OpenVME-peppol-ready-1.png', '#f0fdfa', 20,
  '[
    {"key":"woordje","title":"Woordje vooraf","kind":"intro"},
    {"key":"inhoud","title":"In deze editie","kind":"toc"},
    {"key":"praktijk","title":"Uit de praktijk","kind":"article","hint":"Een verhaal of inzicht uit het werk van een syndicus."},
    {"key":"stelling","title":"Stelling","kind":"statement"},
    {"key":"agenda","title":"Agenda","kind":"events"},
    {"key":"nieuws","title":"Uit het nieuws","kind":"news"},
    {"key":"afsluiting","title":"Tot de volgende","kind":"closing"}
  ]'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- ─── MODULE REGISTRATION ────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'newsletters',
  'Nieuwsbrieven',
  'Samen de nieuwsbrieven maken: elk zijn stukje, marketing als hoofdredactie',
  '/nieuwsbrieven',
  'newspaper',
  true,
  false,
  140
)
ON CONFLICT (code) DO NOTHING;

-- Iedereen: het hele bedrijf schrijft mee.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'newsletters'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
