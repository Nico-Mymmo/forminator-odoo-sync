# Forminator Sync V2 — IMPLEMENTATION LOG

## 2026-02-25 — Fase 1 (Foundation)

### Wat gebouwd is
- Nieuwe module aangemaakt onder `src/modules/forminator-sync-v2/`.
- Module-registratie toegevoegd in de centrale module registry.
- Databaselaag toegevoegd voor 6 MVP-tabellen:
  - `fs_v2_integrations`
  - `fs_v2_resolvers`
  - `fs_v2_targets`
  - `fs_v2_mappings`
  - `fs_v2_submissions`
  - `fs_v2_submission_targets`
- CRUD API gebouwd voor:
  - integraties
  - resolvers
  - targets
  - mappings
- Strikte server-side validatie ingebouwd voor MVP-freeze regels:
  - exact 2 resolvertypes
  - max 2 resolvers per integratie
  - max 2 targets per integratie
  - vaste identifierlogica per targetmodel
  - exact 2 update policies
  - verplichte mappings per targetmodel
- UI Foundation gebouwd met 5 blokken:
  - blok 1–4 volledig functioneel
  - blok 5 als teststub
- Activatieblokkering ingebouwd:
  - zonder geslaagde teststatus kan `is_active=true` niet worden opgeslagen.
- Fase-gebonden placeholders toegevoegd voor:
  - webhook handler
  - idempotency module
  - retry module
  - Odoo client runtime flow

### Wat bewust NIET gebouwd is
- Geen webhook intake.
- Geen runtime idempotency flow.
- Geen resolver-run/context-run/target-run verwerking.
- Geen retries.
- Geen partial failure runtime.
- Geen replay.
- Geen extra resolvertypes.
- Geen extra targetmodellen.
- Geen branching/conditionele logica/rule engine.

### Open technische risico’s
- Foundation veronderstelt dat de 6 MVP-tabellen al bestaan in databaseomgeving.
- Odoo connectie-validatie in runtime pad zit nog niet in Fase 1.
- Teststub simuleert enkel activatie-gate en geen echte verwerkingskwaliteit.

### Testresultaten
- Statische verificatie uitgevoerd:
  - Module registry bevat `forminator_sync_v2`.
  - Alle Foundation endpoints zijn gedefinieerd onder `/forminator-v2/api/*`.
  - Validatiepad blokkeert activatie zonder succesvolle test.
- Runtime end-to-end tests (webinar/contact/duplicate/recoverable/permanent) zijn nog niet uitvoerbaar in Fase 1 omdat webhook- en workerflow pas in Fase 2/3 gebouwd wordt.
- Fase 1 teststub gevalideerd als activatievoorwaarde.

## 2026-02-25 — Fase 2 (Core Flow)

### Wat gebouwd is
- Webhook intake endpoint toegevoegd onder `/forminator-v2/api/webhook`.
- Idempotency geïmplementeerd met deterministische payload hashing:
  - keys gesorteerd
  - whitespace genormaliseerd
- Duplicate handling geïmplementeerd met onderscheid:
  - `duplicate_inflight`
  - `duplicate_ignored`
- Resolver-run geïmplementeerd voor exact 2 resolvertypes:
  - `partner_by_email`
  - `webinar_by_external_id`
- Context-opbouw geïmplementeerd; volledige context inclusief resolver logs wordt opgeslagen op submission.
- Target-run geïmplementeerd met strikte identifier-based upsert:
  - geen fallback zoeklogica
  - geen fuzzy matching
- Submission history uitgebreid:
  - submission status updates
  - targetresultaten per target in `fs_v2_submission_targets`
- Extra history endpoints toegevoegd:
  - `/forminator-v2/api/integrations/:id/submissions`
  - `/forminator-v2/api/submissions/:submissionId`

### Wat bewust NIET gebouwd is
- Geen retry mechanisme (blijft Fase 3).
- Geen replay mechanisme (blijft Fase 3).
- Geen extra resolvertypes.
- Geen extra targetmodellen.
- Geen branching of conditionele engine.
- Geen expression engine.
- Geen nieuwe JSON-config extensiepunten.
- Geen UX-uitbreidingen buiten bestaande Fase 1 pagina.

### Open technische risico’s
- Webhookauth gebruikt bestaand platform tokenpad; hardening op signatureniveau is niet toegevoegd in Fase 2.
- Concurrency op identieke identifiers is gemitigeerd met dubbele lookup vóór create, maar blijft afhankelijk van Odoo-side constraints voor absolute hard guarantees.
- Webinar external-id lookupveld gebruikt vaste serverconfig (`ODOO_WEBINAR_EXTERNAL_ID_FIELD` fallback), waardoor verkeerde infra-config direct impact heeft.

### Testresultaten
- Statische verificatie uitgevoerd:
  - V2 routes compileren zonder diagnostics errors.
  - Idempotency utilities compileren zonder diagnostics errors.
  - Worker-handler, odoo-client en database updates compileren zonder diagnostics errors.
- Contractverificatie uitgevoerd:
  - duplicate statuses worden afzonderlijk geretourneerd.
  - submission eindstatus finaliseert naar `success`, `partial_failed` of `permanent_failed`.
  - targetresultaten worden afzonderlijk gelogd.
- Volledige live end-to-end webhooktests tegen externe Odoo omgeving zijn in deze implementatieronde niet geautomatiseerd uitgevoerd in de workspace.

## 2026-02-25 — Fase 3A (Hardening: Retry)

### Wat gebouwd is
- Retry utilities geïmplementeerd in `src/modules/forminator-sync-v2/retry.js`:
  - recoverable/permanent classificatie
  - vast retrieschema (1 min, 5 min)
  - max attempts = 3
- Worker state machine uitgebreid in `src/modules/forminator-sync-v2/worker-handler.js`:
  - recoverable fouten → `retry_scheduled`
  - retry run-status → `retry_running`
  - retry limiet bereikt → `retry_exhausted`
- Retry draait op dezelfde submission en dezelfde idempotency key.
- Eerder geslaagde targets worden niet opnieuw uitgevoerd tijdens retry.
- Cumulatieve targetlogging blijft actief met extra `skipped` entries voor reeds geslaagde targets.
- Due retry processor toegevoegd via route:
  - `POST /forminator-v2/api/retries/run-due`
- Databaselaag uitgebreid met retry-query/claim helpers:
  - due retries ophalen
  - atomische status-transitie voor retry claim
  - laatste targetresultaat per target ophalen
- Migratie toegevoegd voor minimale datamodeluitbreiding:
  - `retry_status`
  - `next_retry_at`
  - `replay_of_submission_id`

### Wat bewust NIET gebouwd is
- Geen replay mechanisme (blijft Fase 3B).
- Geen webhook security hardening (blijft Fase 3B).
- Geen extra resolvertypes.
- Geen extra targetmodellen.
- Geen branching/conditionele logica.
- Geen expression engine.
- Geen nieuwe UX-configuratieopties.

### Open technische risico’s
- Retry scheduling gebruikt een expliciete run-due endpoint; automatische scheduler-koppeling moet operationeel worden ingericht (cron/trigger buiten modulecode).
- Voor absolute duplicate-preventie onder extreme concurrentie blijft Odoo-side unieke constraint aanbevolen.
- Errorclassificatie is bericht/statuscode-gebaseerd; infrastructuurfouten met niet-standaard foutteksten kunnen foutief als permanent geclassificeerd worden.

### Failure matrix (Fase 3A)
- Recoverable fout poging 1 → `retry_scheduled` (+1m)
- Recoverable fout poging 2 → `retry_scheduled` (+5m)
- Recoverable fout poging 3 → `retry_exhausted`
- Permanent fout → `permanent_failed`
- Gemengde targetuitkomst → `partial_failed`

### Testscenario’s
- Recoverable error:
  - Verwacht: submission naar `retry_scheduled` met `next_retry_at`.
- Permanent error:
  - Verwacht: submission naar `permanent_failed`, geen retry planning.
- Retry exhaust:
  - Verwacht: na derde recoverable mislukking status `retry_exhausted`.
- Replay succes:
  - Niet uitgevoerd in Fase 3A (buiten scope, gepland in Fase 3B).
- Replay geweigerd:
  - Niet uitgevoerd in Fase 3A (buiten scope, gepland in Fase 3B).
