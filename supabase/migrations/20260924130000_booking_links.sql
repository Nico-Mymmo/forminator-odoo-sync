-- ============================================================================
-- Afspraaklinks — persoonlijke Calendly-links die op ONZE site openen
-- ============================================================================
-- Migration: 2026-09-24
--
-- Een afspraaklink koppelt een collega (Odoo res.users) aan een van zijn
-- Calendly-afspraaktypes, onder een korte sleutel:
--
--   https://openvme.be/?afspraak=rob-demo
--
-- opent de homepage met het venster van mymmo-forms op "Plan een gesprek",
-- maar met Robs agenda in plaats van de algemene. De Calendly-link zelf komt
-- NOOIT in de URL: dan kan iedereen een link maken die op onze site de agenda
-- van een vreemde toont. De plugin zoekt de sleutel server-side op via de
-- publieke API (sitesleutel).
--
-- In de koppelingen levert de placeholder {{afspraak.<stap>.<soort>}} de link
-- van de EIGENAAR van het record uit die stap (crm.lead.user_id).
--
-- odoo_user_id is de sleutel waarop gezocht wordt, niet om_user_id: de
-- eigenaar van een lead is een Odoo-gebruiker, en niet elke Odoo-gebruiker
-- heeft een OM-account. om_user_id bepaalt enkel wie de rij mag bewerken.
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_links (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    TEXT NOT NULL UNIQUE,
  kind                    TEXT NOT NULL DEFAULT 'standaard',
  label                   TEXT NOT NULL DEFAULT '',
  odoo_user_id            INTEGER NOT NULL,
  odoo_user_name          TEXT NOT NULL DEFAULT '',
  om_user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  calendly_event_type_uri TEXT NOT NULL DEFAULT '',
  calendly_event_type_name TEXT NOT NULL DEFAULT '',
  scheduling_url          TEXT NOT NULL,
  duration                INTEGER,
  site                    TEXT NOT NULL DEFAULT '',
  tab_title               TEXT NOT NULL DEFAULT '',
  is_default              BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_links_slug_vorm CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  CONSTRAINT booking_links_kind_vorm CHECK (kind ~ '^[a-z0-9][a-z0-9-]{0,38}$'),
  CONSTRAINT booking_links_url_https CHECK (scheduling_url LIKE 'https://calendly.com/%')
);

-- De placeholder zoekt op (eigenaar, soort).
CREATE INDEX IF NOT EXISTS booking_links_owner_kind_idx
  ON booking_links (odoo_user_id, kind) WHERE is_active;

-- Hoogstens één standaardlink per eigenaar. Twee zou betekenen dat
-- {{afspraak.<stap>.standaard}} stil een van de twee kiest.
CREATE UNIQUE INDEX IF NOT EXISTS booking_links_one_default_idx
  ON booking_links (odoo_user_id) WHERE is_default AND is_active;

-- 'algemeen' is gereserveerd: dat is de terugval ("geen persoonlijke link,
-- toon de algemene agenda") en mag nooit naar een persoon wijzen.
ALTER TABLE booking_links DROP CONSTRAINT IF EXISTS booking_links_slug_gereserveerd;
ALTER TABLE booking_links ADD CONSTRAINT booking_links_slug_gereserveerd CHECK (slug <> 'algemeen');

COMMENT ON TABLE booking_links IS 'Persoonlijke Calendly-afspraaklinks die via ?afspraak=<slug> op onze site in het mymmo-forms-venster openen. Zie src/modules/booking-links/.';

-- ─── MODULE REGISTRATION ─────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'booking_links',
  'Afspraaklinks',
  'Je eigen Calendly-links die op onze website openen',
  '/afspraaklinks',
  'calendar-clock',
  true,
  false,
  130
)
ON CONFLICT (code) DO NOTHING;

-- Iedereen: elke collega beheert zijn eigen links.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'booking_links'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
