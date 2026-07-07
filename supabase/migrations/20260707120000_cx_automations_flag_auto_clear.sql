-- ============================================================================
-- CX Automations — auto-clear vlaggen per fase/reden
-- ============================================================================
-- Voorheen escaleerde de vlag-cron alleen (nooit downgraden), en paste de
-- dagen-gebaseerde no_activity-drempel toe op elk actieblad in de fase,
-- ongeacht welke reden er al actief stond op de vlag. Dat zorgde voor twee
-- problemen:
--   1. Een handmatig gezette vlag met een andere reden (bv. churn_signal)
--      kon overschreven worden door de automatische inactiviteits-boodschap.
--   2. Er was geen manier om een vlag automatisch te laten verdwijnen zodra
--      de onderliggende conditie (inactiviteit) niet meer van toepassing was
--      — enkel manueel via de "Vlag verwijderen"-knop in Odoo.
--
-- Dit voegt een per-fase (per flag_reason-rij) instelbare optie toe: als
-- auto_clear_enabled = true, mag de cron de vlag terugzetten naar 'none'
-- zodra de conditie niet meer geldt. Staat default uit, zodat het huidige
-- manuele-verwijdering-gedrag ongewijzigd blijft tot CS het bewust aanzet.
-- ============================================================================

ALTER TABLE flag_thresholds
  ADD COLUMN IF NOT EXISTS auto_clear_enabled BOOLEAN NOT NULL DEFAULT false;
