-- Nieuwsbrieven: automatische mailinglijsten (2026-11-02).
--
-- Een rij = een mailing.list in Odoo die de OM zelf vult en dagelijks bijhoudt:
-- de contactpersonen (res.partner, geen bedrijf, met e-mailadres) onder een
-- bedrijf met een van de gekozen waarden van x_studio_company_status.
-- Logica: src/modules/newsletters/lib/auto-lijsten.js. Instellen: Nieuwsbrieven
-- -> Automatische lijsten.
--
--   odoo_list_id  leeg tot de eerste ronde de lijst in Odoo maakte (of een
--                 bestaande lijst met dezelfde naam vond)
--   statussen     de technische waarden ('Free Trial', 'Inactive', ...)
--   laatste_*     het resultaat van de laatste ronde, voor het scherm

CREATE TABLE IF NOT EXISTS nb_auto_lijsten (
  id               TEXT PRIMARY KEY,
  naam             TEXT NOT NULL,
  statussen        JSON_TEXT NOT NULL,
  odoo_list_id     INTEGER,
  actief           BOOLEAN NOT NULL DEFAULT 1,
  laatste_ronde_at TIMESTAMPTZ,
  laatste_resultaat JSON_TEXT,
  door_naam        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO nb_auto_lijsten (id, naam, statussen, door_naam)
VALUES ('freemium-gebruikers', 'Freemium Gebruikers', '["Free Trial","Inactive"]', 'Nico');
