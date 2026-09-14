-- Gmail → chatter: de UITZONDERINGEN.
--
-- De hoofdregel is automatisch: staat het adres van de tegenpartij op een lead
-- in Odoo, dan komt de mail er vanzelf bij. Deze tabel is voor alles wat daar
-- niet onder valt — typisch iemand die vanaf een ander adres schrijft dan het
-- adres dat op de lead staat.
--
-- EEN KOPPELING HANGT AAN EEN ADRES, NIET AAN EEN BERICHT. Dat is het hele
-- punt: je beslist één keer per persoon, en dat geldt dan voor zijn oude én
-- toekomstige mail. Per bericht beslissen betekent dat je bij elke nieuwe mail
-- van dezelfde persoon opnieuw hetzelfde doet.
--
-- MEERDERE ADRESSEN MOGEN NAAR DEZELFDE LEAD WIJZEN. Iemand die vanaf werk en
-- privé mailt krijgt twee rijen met dezelfde `odoo_res_id`. Daarom staat de
-- sleutel op het ADRES en niet op de lead.
--
-- `action = 'ignore'` IS NET ZO BELANGRIJK ALS 'lead'. Zonder die mogelijkheid
-- blijft een leverancier die nooit een klant wordt bij elke mail opnieuw in de
-- werklijst opduiken, en dan wordt dat een lijst die niemand nog bekijkt.

CREATE TABLE IF NOT EXISTS gmail_contact_links (
  counterpart_email text PRIMARY KEY,

  -- 'lead'   = alle mail van/naar dit adres hoort bij odoo_res_id
  -- 'ignore' = nooit meer tonen, nooit plaatsen
  action            text NOT NULL CHECK (action IN ('lead', 'ignore')),

  odoo_model        text,
  odoo_res_id       bigint,

  -- Wie de koppeling maakte en waarvandaan ('om' of 'gmail-addon').
  created_by        text,
  source            text,
  note              text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Een koppeling naar een lead zonder lead is zinloos; laat de database dat
  -- afdwingen in plaats van het te hopen.
  CONSTRAINT gmail_contact_links_lead_vereist
    CHECK (action <> 'lead' OR (odoo_model IS NOT NULL AND odoo_res_id IS NOT NULL))
);

COMMENT ON TABLE gmail_contact_links IS
  'Uitzonderingen op de automatische koppeling: per e-mailadres vastleggen bij welke lead de mail hoort, of dat het adres genegeerd moet worden.';

-- Alles van één lead terugvinden (welke adressen wijzen hierheen?).
CREATE INDEX IF NOT EXISTS gmail_contact_links_lead_idx
  ON gmail_contact_links (odoo_model, odoo_res_id)
  WHERE odoo_res_id IS NOT NULL;

-- Zelfde afweging als bij de andere twee tabellen: enkel de Worker raakt dit
-- aan, en die gebruikt de service role key (die RLS omzeilt). Deny-all dus,
-- bewust zonder policies.
ALTER TABLE gmail_contact_links ENABLE ROW LEVEL SECURITY;
