-- Opvolging (src/modules/opvolging), 2026-10-30.
--
-- Eerste stuk van Sales Sequences: een gesprek afronden in een klik, en een
-- controlepaneel bovenaan de kans in Odoo.
--
-- opv_contactmomenten: elk gesprek dat via de OM afgerond werd, met zijn
--   uitkomst. Odoo krijgt dezelfde info in de chatter; deze tabel is er om
--   later te kunnen rapporteren (is de sequentie gehaald, welk kanaal werkt),
--   want wat we nu niet bijhouden, kunnen we later niet meer tonen.
--   soort: 'contact' (echt contact) of 'poging' (geen antwoord).
--   kanaal: voorlopig enkel 'telefoon'; mail en WhatsApp volgen.

CREATE TABLE IF NOT EXISTS opv_contactmomenten (
  id                   TEXT PRIMARY KEY,
  lead_id              INTEGER NOT NULL,
  kanaal               TEXT NOT NULL DEFAULT 'telefoon',
  uitkomst             TEXT NOT NULL,              -- 'opgenomen' | 'ingesproken' | 'niets'
  soort                TEXT NOT NULL,              -- 'contact' | 'poging'
  notitie              TEXT,
  bron                 TEXT NOT NULL DEFAULT 'om', -- 'om' | later: 'claude', 'dstny'
  door_user_id         TEXT,
  door_naam            TEXT,
  odoo_message_id      INTEGER,
  taken_afgerond       INTEGER NOT NULL DEFAULT 0,
  volgende_deadline    TEXT,                       -- 'YYYY-MM-DD' of NULL
  created_at           TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS opv_contactmomenten_lead ON opv_contactmomenten (lead_id, created_at);
