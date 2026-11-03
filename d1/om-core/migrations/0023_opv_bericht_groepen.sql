-- Opvolging: groepen van berichten als eigen lijst (2026-11-03).
--
-- Zoals de mappen in Koppelingen: de groepen staan in de linkerkolom van het
-- tabblad Berichten (CX Automations), met aanmaken, hernoemen en verwijderen,
-- en een bericht sleep je naar een groep. Een bericht verwijst naar zijn groep
-- met groep_id; leeg = "Zonder groep". Een groep verwijderen laat haar
-- berichten staan, zonder groep.
--
-- opv_berichten.groep (de naam als tekst, uit 0022) wordt niet meer gelezen.

CREATE TABLE IF NOT EXISTS opv_bericht_groepen (
  id          TEXT PRIMARY KEY,
  naam        TEXT NOT NULL,
  volgorde    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

ALTER TABLE opv_berichten ADD COLUMN groep_id TEXT;

INSERT OR IGNORE INTO opv_bericht_groepen (id, naam, volgorde) VALUES
  ('niet-bereikbaar', 'Niet bereikbaar', 10),
  ('na-offerte', 'Na offerte', 20),
  ('na-gesprek', 'Na gesprek', 30),
  ('laatste-kans', 'Laatste kans', 40);

UPDATE opv_berichten SET groep_id = (
  SELECT g.id FROM opv_bericht_groepen g WHERE lower(g.naam) = lower(opv_berichten.groep)
) WHERE groep_id IS NULL;
