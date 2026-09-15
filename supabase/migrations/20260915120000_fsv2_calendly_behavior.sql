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
--   {"skip": true}                              -- deze fase niet uitvoeren
--   {"subject": "...", "body": "..."}           -- eigen mailtekst voor deze fase
--   {"message": "<p>...</p>"}                   -- eigen notitietekst voor deze fase
-- Een lege/ontbrekende sleutel betekent ook hier: gebruik de standaardtekst
-- van de stap. Zie worker-handler.js, blok "Calendly: gedrag per fase".
comment on column fs_v2_targets.calendly_behavior is
  'Gedrag per Calendly-fase (booking_action). Voor record-stappen: default | upsert | update_only | create | search | skip. Voor send_mail/chatter_message: {skip:true} of een inhoud-override ({subject,body} resp. {message}). Leeg/NULL = standaardgedrag/-tekst voor elke fase.';
