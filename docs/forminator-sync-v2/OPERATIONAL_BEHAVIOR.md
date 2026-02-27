# Forminator Sync V2 — Operational Behavior
Datum: 2026-02-25

## Fase 3B status
Webhook core flow uit Fase 2 + retry flow uit Fase 3A blijven actief. Fase 3B voegt replay en webhook security hardening toe, zonder nieuwe configuratiemogelijkheden.

## Activatiegedrag
- Integratie kan nog steeds niet actief gezet worden zonder geslaagde teststatus.
- Geen extra configuratievelden toegevoegd.

## Idempotency (ongewijzigd + retry-aware)
- Idempotency key: `integration_id + forminator_form_id + payload_hash`.
- `payload_hash` blijft deterministisch:
  - object keys alfabetisch gesorteerd
  - whitespace genormaliseerd
- DB-level guardrail:
  - unieke index op `(integration_id, idempotency_key)` blokkeert duplicate submission rows bij race-condities
- Duplicate handling:
  - `running`, `retry_running`, `retry_scheduled` ⇒ `duplicate_inflight`
  - terminal statussen (`success`, `partial_failed`, `permanent_failed`, `retry_exhausted`) ⇒ `duplicate_ignored`
  - duplicate response verwijst naar bestaande submission-id (geen nieuwe duplicate submission)

## Webhook security (Fase 3B)
- Vereiste header: `X-Forminator-Secret`
- Vereiste env var: `FORMINATOR_WEBHOOK_SECRET`
- Zonder geldige secret:
  - directe `401 Unauthorized`
  - geen submission record aangemaakt
- Met geldige secret:
  - normale intake-flow

## Retry mechanisme (Fase 3A)
- Retry geldt enkel voor recoverable fouten.
- Maximaal 3 pogingen totaal.
- Schema:
  - poging 1: direct (initiële run)
  - poging 2: +1 minuut
  - poging 3: +5 minuten
- Daarna status `retry_exhausted`.
- Retry gebruikt dezelfde submission en dezelfde idempotency key.
- Tijdens wachttijd status `retry_scheduled` + `next_retry_at`.
- Tijdens retry-uitvoering status `retry_running`.

## Recoverable vs permanent failure
Recoverable:
- netwerkfout
- timeout
- Odoo 429
- Odoo 5xx

Permanent:
- validatiefouten
- ontbrekende required mappings
- missing identifier
- Odoo 4xx (behalve 429)

## Target uitvoering tijdens retry
- Geen rollback.
- Eerder geslaagde targets worden niet opnieuw uitgevoerd.
- Die targets krijgen cumulatieve log-entry met `action_result = skipped` en `retry_skip_already_successful`.
- Eerder gefaalde targets worden opnieuw geprobeerd, steeds identifier-based.

## Concurrency gedrag
- Retry runner claimt submissions atomisch via status-transitie `retry_scheduled` → `retry_running`.
- Parallelle retry op dezelfde submission wordt hierdoor geweigerd (`skip_locked` resultaat).
- Webhook duplicate checks blijven actief tijdens retry lifecycle.
- Replay start wordt geweigerd als al een child replay met status `running` bestaat voor dezelfde `replay_of_submission_id`.

## Replay gedrag (Fase 3B)
- Endpoint: `POST /forminator-v2/api/submissions/:submissionId/replay`
- Replay maakt altijd een nieuwe submission row.
- `replay_of_submission_id` verwijst naar originele submission.
- `source_payload` wordt gekopieerd van origineel.
- `payload_hash` wordt opnieuw berekend uit gekopieerde payload.
- `idempotency_key` wordt geforceerd nieuw (`replay-<original>-<uuid>`) zodat replay geen duplicate_ignored wordt.
- Originele submission blijft ongewijzigd.
- Replay doorloopt volledige runtimeflow: resolvers → context → targets.
- Toegelaten originele statussen:
  - `partial_failed`
  - `permanent_failed`
  - `retry_exhausted`

## Finalisatie statuses
- `success`
- `partial_failed`
- `permanent_failed`
- `retry_scheduled`
- `retry_running`
- `retry_exhausted`
- `duplicate_inflight`
- `duplicate_ignored`

## Failure matrix (Fase 3A)
- Recoverable fout tijdens poging 1 → `retry_scheduled` (+1 minuut)
- Recoverable fout tijdens poging 2 → `retry_scheduled` (+5 minuten)
- Recoverable fout tijdens poging 3 → `retry_exhausted`
- Permanent fout op eender welke poging → `permanent_failed`
- Minstens één target success en één target failed → `partial_failed`
- Alle targets success/skipped-success-path → `success`

## Eenvoudige flowdiagram-beschrijving (uitgebreid)
1. Webhook binnenkomen
2. Security check op `X-Forminator-Secret`
3. Actieve integratie op form-id zoeken
4. Idempotency key berekenen
5. Duplicate check
6. Submission starten (`running`)
7. Resolvers uitvoeren en context opbouwen
8. Targets uitvoeren (identifier-based)
9. Targetresultaten loggen
10. Bij recoverable fout: `retry_scheduled` met `next_retry_at`
11. Retry runner claimt due submissions en zet `retry_running`
12. Alleen nog niet-succesvolle targets opnieuw uitvoeren
13. Eindstatus finaliseren (`success` / `partial_failed` / `permanent_failed` / `retry_exhausted`)

## Replay flow steps (simpel)
1. Replay request met `submissionId`
2. Originele submission ophalen
3. Statuscheck (alleen `partial_failed` / `permanent_failed` / `retry_exhausted`)
4. Concurrency check op bestaande `running` child replay
5. Nieuwe replay submission aanmaken met nieuwe idempotency key
6. Volledige runtimeflow uitvoeren
7. Nieuwe replay submission status teruggeven

## Niet in Fase 3B
- Geen nieuwe resolvertypes
- Geen nieuwe targetmodellen
- Geen branching/conditionele logica
- Geen expression engine
- Geen extra configuratievelden in blok 1–4
