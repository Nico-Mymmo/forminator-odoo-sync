-- Registratie van de module "Gmail → Chatter" in de database.
--
-- Dit staat LOS van src/modules/registry.js: `user.modules` in de sessie komt
-- uit de tabellen `modules` + `user_modules`, niet uit de registry. Zonder deze
-- rij blijft de module onzichtbaar in de navbar en op het homedashboard, ook al
-- is de code correct geregistreerd. (Zie de checklist in CLAUDE.md; dit ging
-- eerder mis bij campaign_funnels.)

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'gmail_chatter',
  'Gmail → Chatter',
  'Mail uit je Gmail bij de juiste lead in Odoo — en zelf toewijzen wat we niet konden plaatsen',
  '/gmail-chatter',
  'mail-check',
  true,
  false,
  120
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT AAN ALLE ACTIEVE GEBRUIKERS.
--
-- Toegang tot het SCHERM is niet hetzelfde als deelnemen aan de sync: wiens
-- mailbox gelezen wordt, bepaalt uitsluitend de secret `GMAIL_CHATTER_USERS`.
-- Wie daar niet in staat ziet een lege lijst met de melding dat zijn mailbox
-- nog niet gelezen wordt. Het scherm toont per gebruiker enkel zijn EIGEN
-- berichten (server-side afgedwongen in routes.js), dus breed toegang geven
-- lekt niets.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'gmail_chatter'
  AND u.is_active = true
ON CONFLICT (user_id, module_id) DO NOTHING;
