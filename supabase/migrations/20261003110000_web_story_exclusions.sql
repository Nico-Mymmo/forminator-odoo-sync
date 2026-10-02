-- ============================================================================
-- Webgedrag: uitgesloten personen en browsers
-- ============================================================================
-- Migration: 2026-10-02
--
-- Een partner of een vaste klant die de site intensief gebruikt, kleurt elk
-- klein segment: in Gedrag kwamen 7 van de 7 bezoeken van één persoon. Zo
-- iemand zet je op deze lijst; die bezoeken tellen dan nergens meer mee in de
-- CIJFERS (Webgedrag -> Gedrag, het dashboard Website-bezoeken, de attributie).
-- Het eigen verhaal (Traject, de lead in Odoo) blijft volledig.
-- Weer meetellen = de rij weghalen.
--
--   kind = 'email'    value = een HERLEID adres (visitor_emails.email_norm in
--                     D1): elke browser die dat adres ooit gebruikte, ook een
--                     nieuwe na een gewiste cookie.
--   kind = 'visitor'  value = een bezoeker-UUID: één browser. Voor een anonieme
--                     bezoeker, of een gedeelde browser waarvan je de andere
--                     persoon niet wil uitsluiten.
--
-- Bewust in Supabase en niet in D1: D1 heeft één schrijver (de tracker), en dit
-- is een keuze van de OM over hoe ze telt, geen gegeven over de bezoeker.
-- Zie src/modules/web-story/lib/exclusions.js.
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_story_exclusions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL,
  value            TEXT NOT NULL,
  label            TEXT NOT NULL DEFAULT '',
  reason           TEXT NOT NULL DEFAULT '',
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT web_story_exclusions_kind CHECK (kind IN ('email', 'visitor')),
  CONSTRAINT web_story_exclusions_uniek UNIQUE (kind, value)
);

ALTER TABLE web_story_exclusions ENABLE ROW LEVEL SECURITY;
