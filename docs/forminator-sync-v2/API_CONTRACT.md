# Forminator Sync V2 — API CONTRACT
Datum: 2026-02-25

Alle endpoints vallen onder `/forminator-v2/api/*`.

## Foundation endpoints (Fase 1)

### Meta
- `GET /forminator-v2/api/meta`
  - Response: toegelaten resolvertypes, targetmodellen, update policies, source types en MVP-limieten.

### Integraties
- `GET /forminator-v2/api/integrations`
- `POST /forminator-v2/api/integrations`
  - Request: `name`, `forminator_form_id`, `odoo_connection_id`
- `GET /forminator-v2/api/integrations/:id`
- `PUT /forminator-v2/api/integrations/:id`
  - Ondersteund in Fase 1: `name`, `forminator_form_id`, `odoo_connection_id`, `is_active`
  - Activatie (`is_active=true`) wordt geblokkeerd zonder geslaagde test.
- `DELETE /forminator-v2/api/integrations/:id`

### Resolvers
- `POST /forminator-v2/api/integrations/:id/resolvers`
- `PUT /forminator-v2/api/integrations/:id/resolvers/:resolverId`
- `DELETE /forminator-v2/api/integrations/:id/resolvers/:resolverId`

### Targets
- `POST /forminator-v2/api/integrations/:id/targets`
- `PUT /forminator-v2/api/integrations/:id/targets/:targetId`
- `DELETE /forminator-v2/api/integrations/:id/targets/:targetId`

### Mappings
- `POST /forminator-v2/api/targets/:targetId/mappings`
- `PUT /forminator-v2/api/mappings/:mappingId`
- `DELETE /forminator-v2/api/mappings/:mappingId`

### Teststub (Fase 1)
- `POST /forminator-v2/api/integrations/:id/test-stub`
  - Maakt een geslaagde testentry aan in submissions voor activatie-unlock in Foundation.
- `GET /forminator-v2/api/integrations/:id/test-status`
  - Response: `has_successful_test` boolean.

## Core Flow endpoints (Fase 2)

### Webhook intake
- `POST /forminator-v2/api/webhook`
  - Auth: shared secret header
    - Vereiste header: `X-Forminator-Secret`
    - Vereiste env var: `FORMINATOR_WEBHOOK_SECRET`
    - Bij ontbrekend/fout secret: `401 Unauthorized` en geen submission insert
  - Doel: intake + idempotency + resolver/target verwerking
  - Response status in payload:
    - `success`
    - `partial_failed`
    - `permanent_failed`
    - `retry_scheduled`
    - `retry_exhausted`
    - `duplicate_inflight`
    - `duplicate_ignored`

### Submission history
- `GET /forminator-v2/api/integrations/:id/submissions`
  - Response: lijst met submissions voor integratie
- `GET /forminator-v2/api/submissions/:submissionId`
  - Response: submission detail + target resultaten

## Hardening endpoints (Fase 3B)

### Replay
- `POST /forminator-v2/api/submissions/:submissionId/replay`
  - Maakt nieuwe submission record met:
    - `replay_of_submission_id = :submissionId`
    - `source_payload = kopie van originele payload`
    - `payload_hash = opnieuw berekend uit gekopieerde payload`
    - `idempotency_key = geforceerd nieuw` (`replay-<original>-<uuid>`)
  - Replay toegelaten status:
    - `partial_failed`
    - `permanent_failed`
    - `retry_exhausted`
  - Replay geweigerd voor alle andere statussen (waaronder `running`, `retry_scheduled`, `retry_running`)
  - Concurrencyregel:
    - geweigerd indien al een child replay voor dezelfde originele submission `running` is
  - Success response: `201`
    - `{ success: true, data: { replay_submission_id, replay_of_submission_id, status, next_retry_at, success } }`
  - Error responses:
    - `404` submission niet gevonden
    - `400` replay niet toegestaan / replay al running

## Hardening endpoints (Fase 3A)

### Retry runner
- `POST /forminator-v2/api/retries/run-due`
  - Request (optioneel): `limit`
  - Doel: due `retry_scheduled` submissions verwerken
  - Response: lijst met verwerkte submissions en eindstatus per submission

## Response afspraken
- Success: `{ success: true, data: ... }`
- Error: `{ success: false, error: "..." }`
- HTTP codes:
  - `200`, `201` bij success
  - `400` validatie
  - `404` niet gevonden
  - `500` technische fout

## Webhook security voorbeelden
- Zonder header of fout secret:
  - `401` + `{ success: false, error: "Unauthorized webhook request" }`
- Correct secret:
  - normale webhookverwerking volgens intake-flow

## Productie-instelling
- Configureer `FORMINATOR_WEBHOOK_SECRET` als Worker env secret.
- Laat de Forminator-caller exact dezelfde waarde sturen in `X-Forminator-Secret`.

## Niet beschikbaar in Fase 1
- Webhook endpoint.
- Runtime submission processing endpoint.
- Replay endpoint.
