# Forminator Sync V2 — MVP SPEC
Datum: 2026-02-25

## Scope Freeze
Dit document is bindend voor MVP en ondersteunt een livegang binnen 4–6 weken.

### In MVP
- Nieuwe module op route `/forminator-v2`.
- Mentaal model: Resolvers → Context → Targets.
- Exact 2 resolvertypes:
  - `partner_by_email`
  - `webinar_by_external_id`
- Maximaal 2 targets per integratie.
- Toegestane targetmodellen:
  - `crm.lead`
  - `res.partner`
  - `x_webinarregistrations`
- Identifierlogica:
  - `crm.lead` via `single_email`
  - `res.partner` via `single_email`
  - `x_webinarregistrations` via `registration_composite`
- Exact 2 update policies:
  - `always_overwrite`
  - `only_if_incoming_non_empty`
- Server-side validatie van alle configuratie.
- Activatieblokkering zonder geslaagde test.

### Niet in MVP
- Generic resolver.
- Extra resolvertypes.
- Branching/conditionele logica/rule engine.
- Meer dan 2 targets.
- Per-veld update policies.
- Auto-suggest mappings.
- JSON-config blobs als open engine.

## Fase 1 Foundation (status)
- Geïmplementeerd:
  - Databaselaag voor 6 tabellen.
  - CRUD endpoints voor integraties, resolvers, targets, mappings.
  - Validatieregels met MVP-limieten.
  - UI blok 1–4 volledig.
  - Blok 5 teststub + activatiecheck.
- Nog niet geïmplementeerd in Fase 1:
  - Webhook intake.
  - Idempotency runtime flow.
  - Target verwerking naar Odoo.
  - Retry en replay.
