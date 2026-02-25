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
  - Auth: token-auth (zelfde platformtokenbeleid)
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

## Niet beschikbaar in Fase 1
- Webhook endpoint.
- Runtime submission processing endpoint.
- Replay endpoint.

## Niet beschikbaar in Fase 3A
- Replay mechanisme (Fase 3B).
- Webhook security hardening (Fase 3B).
