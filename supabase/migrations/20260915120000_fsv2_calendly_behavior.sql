-- Gedrag per Calendly-fase, per stap.
--
-- WAAROM DIT GEEN VOORWAARDE IS
-- -----------------------------
-- Een Calendly-koppeling heeft ALTIJD vier fases: een nieuwe boeking, de nieuwe
-- afspraak van een verplaatsing, de oude afspraak die daarbij vervalt, en een
-- annulatie. Dat is geen uitzondering maar de normale gang van zaken.
--
-- Met alleen `condition_field` moest je voor elke fase een KOPIE van de stap
-- maken met een andere voorwaarde erop -- vier keer dezelfde veldkoppelingen
-- onderhouden voor iets dat bij elke Calendly-koppeling bestaat. Een voorwaarde
-- hoort een uitzondering te zijn ("start een andere flow op basis van een
-- antwoord"), geen standaardgereedschap.
--
-- Eén stap, vier gedragingen dus. Vorm:
--   {"new":"upsert","rescheduled":"update_only","rescheduled_old":"search","canceled":"skip"}
--
-- Een ontbrekende sleutel, een lege waarde of "default" betekent: doe wat
-- operation_type van de stap zelf zegt. Een NULL-kolom (de bestaande rijen)
-- betekent dus exact het huidige gedrag -- deze migratie verandert op zichzelf
-- niets aan een draaiende koppeling.
alter table fs_v2_targets
  add column if not exists calendly_behavior jsonb;

-- send_mail/chatter_message zijn HANDELINGEN, geen zoek/schrijf-stap: daar
-- betekent "gedrag" (upsert/update_only/...) niets. Voor die twee is de
-- waarde per fase daarom geen string maar een INHOUD-override:
--   {"skip": true}                                              -- deze fase niet uitvoeren
--   {"mail_subject_template": "...", "mail_body_html": "..."}   -- eigen mailtekst voor deze fase
--   {"chatter_template": "__COMBINED__:{...}"}                  -- eigen notitie (zelfde vorm als target.chatter_template)
-- Deze inhoud wordt gecomponeerd in een aparte tab van de bestaande editor
-- (forminator-sync-v2-detail-mapping-tab.js: renderComposerFaseTabs() +
-- switchComposerFase()), niet in het "Tekst per fase"-paneel zelf -- dat
-- paneel kiest enkel WELKE fases een tab krijgen. Een lege/ontbrekende
-- sleutel betekent hier ook: gebruik de standaardtekst van de stap. Zie
-- worker-handler.js, blok "Calendly: gedrag per fase".
comment on column fs_v2_targets.calendly_behavior is
  'Gedrag per Calendly-fase (booking_action). Voor record-stappen: default | upsert | update_only | create | search | skip. Voor send_mail/chatter_message: {skip:true} of een inhoud-override ({mail_subject_template,mail_body_html} resp. {chatter_template}). Leeg/NULL = standaardgedrag/-tekst voor elke fase.';
