# Forminator Sync V2 — Operational Behavior
Datum: 2026-02-25

## Fase 3A status
Webhook core flow uit Fase 2 blijft actief. Fase 3A voegt uitsluitend retry-hardening toe, zonder nieuwe configuratiemogelijkheden.

## Activatiegedrag
- Integratie kan nog steeds niet actief gezet worden zonder geslaagde teststatus.
- Geen extra configuratievelden toegevoegd.

## Idempotency (ongewijzigd + retry-aware)
- Idempotency key: `integration_id + forminator_form_id + payload_hash`.
- `payload_hash` blijft deterministisch:
  - object keys alfabetisch gesorteerd
  - whitespace genormaliseerd
- Duplicate handling:
  - `running`, `retry_running`, `retry_scheduled` ⇒ `duplicate_inflight`
  - terminal statussen (`success`, `partial_failed`, `permanent_failed`, `retry_exhausted`) ⇒ `duplicate_ignored`

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
2. Actieve integratie op form-id zoeken
3. Idempotency key berekenen
4. Duplicate check
5. Submission starten (`running`)
6. Resolvers uitvoeren en context opbouwen
7. Targets uitvoeren (identifier-based)
8. Targetresultaten loggen
9. Bij recoverable fout: `retry_scheduled` met `next_retry_at`
10. Retry runner claimt due submissions en zet `retry_running`
11. Alleen nog niet-succesvolle targets opnieuw uitvoeren
12. Eindstatus finaliseren (`success` / `partial_failed` / `permanent_failed` / `retry_exhausted`)

## Niet in Fase 3A
- Replay mechanisme (Fase 3B)
- Webhook security hardening (Fase 3B)
- UX-uitbreiding buiten statusweergave (Fase 3B)
