-- Opvolging: instellingen (2026-10-30).
--
-- opv_instellingen: een sleutel met een JSON-waarde. Vandaag enkel 'sequentie':
--   de stappen waarmee een nieuwe aanvraag opgevolgd wordt (eerste beltaak,
--   de pogingen na een oproep zonder antwoord, en wat er na de laatste komt).
--   Ingesteld in CX Automations -> Opvolging; de vorm staat in
--   src/modules/cx-automations/opvolging/sequentie.js (normaliseerSequentie).

CREATE TABLE IF NOT EXISTS opv_instellingen (
  sleutel       TEXT PRIMARY KEY,
  waarde        JSON_TEXT NOT NULL,
  door_naam     TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
