-- Opvolging: berichtteksten (macro's) (2026-11-03).
--
-- Een rij = een mail die een verkoper vanuit de opvolging kan sturen: een naam,
-- een groep (Na offerte, Niet bereikbaar, Laatste kans, ...), een merk en een
-- taal, een onderwerp en een tekst met placeholders ({{contact.first_name}},
-- {{offerte.nummer}}, {{verkoper.first_name}}, ...). De handtekening van de
-- verkoper komt er bij het versturen vanzelf onder; die staat niet in de tekst.
-- Logica en de lijst placeholders: src/modules/cx-automations/opvolging/berichten.js.
-- Schrijven: CX Automations -> Opvolging -> Berichten.
--
--   merk     'alle' | 'syndicoach' | 'openvme'
--   taal     'nl' | 'fr'
--   actief   uit = concept: staat in de lijst, maar wordt nog nergens aangeboden

CREATE TABLE IF NOT EXISTS opv_berichten (
  id          TEXT PRIMARY KEY,
  naam        TEXT NOT NULL,
  groep       TEXT NOT NULL,
  merk        TEXT NOT NULL DEFAULT 'alle',
  taal        TEXT NOT NULL DEFAULT 'nl',
  onderwerp   TEXT NOT NULL DEFAULT '',
  tekst_html  TEXT NOT NULL DEFAULT '',
  actief      BOOLEAN NOT NULL DEFAULT 0,
  volgorde    INTEGER NOT NULL DEFAULT 0,
  door_naam   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Drie concepten om mee te beginnen, zodat de groepen en de placeholders er
-- meteen staan. Thomas herschrijft ze; ze staan uit tot hij ze aanzet.
INSERT OR IGNORE INTO opv_berichten (id, naam, groep, merk, taal, onderwerp, tekst_html, volgorde, door_naam) VALUES
('concept-niet-bereikbaar', 'Ik probeerde je te bellen', 'Niet bereikbaar', 'syndicoach', 'nl',
 'Ik probeerde je te bellen',
 '<p>Hoi {{contact.first_name}},</p><p><br></p><p>Ik probeerde je net te bellen over je aanvraag voor {{gebouw.naam}}, maar kreeg je niet te pakken.</p><p>Past het beter op een ander moment? Kies dan zelf een moment dat je uitkomt: <a href="{{afspraak.sender.standaard}}">plan een gesprek</a>.</p><p><br></p><p>Groeten,</p><p>{{verkoper.first_name}}</p>',
 10, 'Claude'),
('concept-na-offerte', 'Heb je de offerte goed ontvangen?', 'Na offerte', 'syndicoach', 'nl',
 'Je offerte voor {{gebouw.naam}}',
 '<p>Hoi {{contact.first_name}},</p><p><br></p><p>Op {{offerte.datum}} kreeg je onze offerte voor {{gebouw.naam}}. Heb je ze goed ontvangen, en zijn er vragen waar ik je mee kan helpen?</p><p>Bellen kan altijd, of <a href="{{afspraak.sender.standaard}}">plan zelf een kort gesprek</a>.</p><p><br></p><p>Groeten,</p><p>{{verkoper.first_name}}</p>',
 20, 'Claude'),
('concept-laatste-kans', 'Laatste bericht', 'Laatste kans', 'syndicoach', 'nl',
 'Nog interesse?',
 '<p>Hoi {{contact.first_name}},</p><p><br></p><p>Ik heb je een paar keer geprobeerd te bereiken over je aanvraag voor {{gebouw.naam}}. Ik wil je niet blijven storen, dus dit is mijn laatste bericht.</p><p>Wil je er later toch op terugkomen? Antwoord gewoon op deze mail.</p><p><br></p><p>Groeten,</p><p>{{verkoper.first_name}}</p>',
 30, 'Claude');
