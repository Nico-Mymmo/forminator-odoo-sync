-- Voegt mailing.contact toe aan de Odoo-modelregistry (fs_v2_odoo_models), zodat het
-- net als de andere modellen (Contact, Lead, Webinaarinschrijving) beheerd kan worden
-- via Instellingen > Modellen, met configureerbare default_fields (Standaardvelden-UI).
--
-- De mailing_list-stap (renderMailingListComposer / buildMailingListExtraRows in
-- forminator-sync-v2-detail.js) leest voortaan getModelCfg('mailing.contact').default_fields
-- i.p.v. een hardgecodeerde veldenlijst.
--
-- ON CONFLICT DO NOTHING: idempotent, en overschrijft geen handmatige aanpassingen als
-- een admin het model al zelf had toegevoegd vóór deze migratie.

INSERT INTO fs_v2_odoo_models
  (name, label, icon, sort_order, identifier_type, update_policy, resolver_type, default_fields)
VALUES
  (
    'mailing.contact',
    'Mailingcontact',
    'mail',
    3,
    'mapped_fields',
    'always_overwrite',
    NULL,
    '[
      {"name":"email",                        "label":"E-mailadres",            "required":true},
      {"name":"name",                         "label":"Naam (volledig)",        "required":false},
      {"name":"x_studio_first_name",          "label":"Voornaam",               "required":false},
      {"name":"company_name",                 "label":"Bedrijfsnaam",           "required":false},
      {"name":"x_studio_provider",            "label":"Leverancier",            "required":false},
      {"name":"x_studio_professional_syndic", "label":"Professionele syndicus", "required":false}
    ]'::jsonb
  )
ON CONFLICT (name) DO NOTHING;
