-- ============================================================================
-- Afspraaklinks — eigen copy per link in het venster op de website
-- ============================================================================
-- Migration: 2026-09-24
--
-- Een afspraaklink opent op de website een venster met ENKEL de agenda. De
-- titel van dat venster was al `tab_title`; daar komen bij:
--
--   intro       de regel onder de titel ("Rob toont je in 30 minuten ...")
--   points      de vinkjes in de zijkolom, als JSON-lijst van teksten
--   show_photo  de avatar van de eigenaar (res.users in Odoo) tonen
--   calendly_description
--               de omschrijving van het afspraaktype in Calendly, bij het
--               BEWAREN overgenomen (zelfde regel als scheduling_url: de
--               publieke API mag niet afhangen van een live Calendly-aanroep).
--               Terugval voor intro als die leeg is.
--
-- Leeg = de tekst van de opstelling in WordPress blijft staan. Niets hiervan
-- verandert iets aan een bestaande link: een lege intro en een lege lijst
-- vinkjes zijn exact het gedrag van voor deze migratie. show_photo staat
-- standaard AAN, want dat is de reden dat iemand een persoonlijke link maakt.
-- ============================================================================

ALTER TABLE booking_links ADD COLUMN IF NOT EXISTS intro      TEXT    NOT NULL DEFAULT '';
ALTER TABLE booking_links ADD COLUMN IF NOT EXISTS points     JSONB   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE booking_links ADD COLUMN IF NOT EXISTS show_photo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE booking_links ADD COLUMN IF NOT EXISTS calendly_description TEXT NOT NULL DEFAULT '';

ALTER TABLE booking_links DROP CONSTRAINT IF EXISTS booking_links_points_lijst;
ALTER TABLE booking_links ADD CONSTRAINT booking_links_points_lijst CHECK (jsonb_typeof(points) = 'array');
