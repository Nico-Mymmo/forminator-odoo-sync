-- Nieuwsbrieven: testmodus per mailing.
--
-- Een mailing staat in TESTMODUS tot de hoofdredactie die uitzet. In
-- testmodus gaat "Verzenden" naar een Odoo-lijst die als testlijst
-- aangevinkt is (mailing.list.x_studio_testlijst), via exact dezelfde weg
-- als de echte verzending. Zo'n test telt nergens mee: de cijfers van een
-- mailing komen enkel uit odoo_mailing_id, en een antwoord op een vraag in
-- een testmail wordt bewaard met test = true en telt niet.
--
-- Bestaande mailings komen in testmodus: niets vertrekt meer naar klanten
-- zonder dat iemand de schakelaar bewust omzet.

ALTER TABLE newsletter_editions ADD COLUMN IF NOT EXISTS testmodus BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE newsletter_answers ADD COLUMN IF NOT EXISTS test BOOLEAN NOT NULL DEFAULT FALSE;
