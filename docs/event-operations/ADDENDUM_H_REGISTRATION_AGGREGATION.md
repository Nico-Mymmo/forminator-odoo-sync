# EVENT OPERATIONS – ADDENDUM H: REGISTRATION AGGREGATION LAYER

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Base Implementation:** Phase 0-7 + Addendum A/B/C/D/E/F/G  
**Implementation Date:** February 17, 2026  
**Status:** Implemented  
**Platform:** Cloudflare Workers + Supabase PostgreSQL + Odoo `x_webinar` / `x_webinarregistrations` + Vanilla JS

---

## 1. Executive Summary

Addendum H introduces a **Registration Aggregation Layer** in the existing Event Operations sync flow.

Core principles:

1. **Odoo remains the single source of truth** for registration rows.
2. **Supabase remains a read-optimized mirror**, not an operational source for per-registration data.
3. **No new registration table is introduced**.
4. **No webhook-based registration ingestion is kept**.
5. **No new lifecycle engine is introduced**.

Behavioral target:

- During `POST /events/api/sync`, registrations are read live from Odoo per webinar.
- Aggregate metrics are computed in-memory.
- Aggregate payload is persisted on `webinar_snapshots.registration_stats`.
- Existing live registration detail endpoint remains live-from-Odoo and unchanged in contract.

---

## 2. Architecture Choice

### Chosen model

- Keep detailed registrations in Odoo only.
- Persist only webinar-level aggregate statistics in Supabase snapshot rows.

### Why this model

1. Aligns with existing Event Operations architecture where snapshot tables are mirrors.
2. Avoids duplicate per-registration persistence and consistency drift.
3. Reuses current `webinar_snapshots` upsert pattern (`odoo_webinar_id`).
4. Minimizes blast radius and regression risk in working publish/sync/detail flows.

### Scope model

- Event Operations snapshots are organization-wide (global, not per-user isolated).
- Event type mapping is organization-wide per `odoo_event_type_id`.

---

## 3. Why No New Table

A new per-registration Supabase table is explicitly out of scope for Addendum H.

Reasons:

1. Would duplicate Odoo authoritative rows and increase sync reconciliation complexity.
2. Would introduce schema + write-path + retention policies not required for current UX objective.
3. Existing requirement is aggregate visibility, not local registration storage.
4. Current architecture already has a natural aggregate carrier: `webinar_snapshots`.

Decision:

- Extend existing snapshot model with one additive field.

---

## 4. Why No Webhook

Webhook ingestion for registrations is removed from this scope because the aggregation model is sync-driven.

Reasons:

1. Sync pipeline already exists and is operationally trusted.
2. Live Odoo read during sync guarantees authoritative ordering and state at snapshot time.
3. Event-driven ingestion adds ordering/idempotency paths that are unnecessary for aggregate-only persistence.
4. Requirement explicitly forbids introducing new lifecycle mechanics.

Decision:

- Registration aggregation is executed only inside `POST /events/api/sync`.

---

## 5. Data Model Extension

### Target table

- `webinar_snapshots`

### Additive field

- `registration_stats JSONB NULL`

### Constraints

1. No new table
2. No extra index
3. No foreign keys
4. Snapshot/event-type mapping scope is global (organisatiebreed)

### JSON shape (canonical)

```json
{
  "total": 0,
  "attended_count": 0,
  "contact_created_count": 0,
  "lead_created_count": 0,
  "confirmation_sent_count": 0,
  "reminder_sent_count": 0,
  "recap_sent_count": 0,
  "any_confirmation_sent": false,
  "any_reminder_sent": false,
  "any_recap_sent": false,
  "last_registration_write_date": null
}
```

Notes:

- `last_registration_write_date` stores max Odoo `write_date` seen in current sync pass.
- Missing/unknown Odoo custom fields default to zero/false semantics.

---

## 6. Sync Flow Extension

### Existing route

- `POST /events/api/sync`

### Extended behavior per webinar

1. Read registrations live from Odoo model `x_webinarregistrations` with:
   - filter: `x_studio_linked_webinar = webinar.id`
   - order: `write_date desc, id desc`
2. Compute aggregation payload:
   - `total`
   - `attended_count`
   - `contact_created_count`
   - `lead_created_count`
   - `confirmation_sent_count`
   - `reminder_sent_count`
   - `recap_sent_count`
   - `any_confirmation_sent`
   - `any_reminder_sent`
   - `any_recap_sent`
   - `last_registration_write_date`
3. Include `registration_stats` in the existing snapshot upsert row.
4. Upsert conflict key is `odoo_webinar_id` (global snapshot row per webinar).

### Non-goals in sync

- No per-registration persistence in Supabase.
- No new routes.
- No endpoint contract change for registration detail API.
- No new standalone service/repository layer.

---

## 7. Impact Analysis

### Backend impact

- `routes.js` sync block is extended with aggregation step and snapshot payload field.
- Odoo client can be minimally extended only if required by current fetch helpers.
- Existing publish and discrepancy logic remains intact.
- Snapshot reads/writes are global (no `user_id` scoping in snapshot routes/upserts).
- Event type mapping reads/writes are global (no `user_id` scoping).

### Database impact

- One additive nullable JSONB column on existing table.
- No migration side effects on existing row reads.
- `webinar_snapshots` gemigreerd naar globale sleutel op `odoo_webinar_id`.
- `event_type_wp_tag_mapping` gemigreerd naar globale sleutel op `odoo_event_type_id`.

### Frontend impact

- Existing registration modal remains unchanged (still live Odoo detail reads).
- Existing webinar card/snapshot presentation can render minimal badges from `registration_stats` booleans/counters.
- No layout redesign.

### Operational impact

- Sync duration may increase proportionally to registration volume.
- Risk is bounded because flow reuses current sync orchestration and batching semantics.

---

## 8. Acceptance Criteria

1. `POST /events/api/sync` remains fully operational.
2. `webinar_snapshots` rows are updated with valid `registration_stats` JSON.
3. Registration detail endpoint remains live-from-Odoo.
4. No new registration table exists.
5. No registration persistence layer is introduced.
6. No registration webhook route remains in Event Operations router map.
7. Publish flow remains unaffected (no regression).
8. UI uses `registration_stats` badges without redesign.
9. `webinar_snapshots` bevat maximaal één rij per `odoo_webinar_id`.
10. Event type mapping bevat maximaal één rij per `odoo_event_type_id`.

---

## 9. Migration Execution (Supabase CLI)

Executed CLI sequence:

1. `supabase migration new add_registration_stats_to_webinar_snapshots`
2. Migration created: `supabase/migrations/20260217085717_add_registration_stats_to_webinar_snapshots.sql`
3. Applied SQL:
   - `ALTER TABLE webinar_snapshots ADD COLUMN registration_stats JSONB NULL;`
4. Executed: `supabase db push`
5. Verified with: `supabase migration list` (local and remote both include `20260217085717`)
6. `supabase migration new make_webinar_snapshots_global`
7. Migration created: `supabase/migrations/20260217094340_make_webinar_snapshots_global.sql`
8. `supabase db push` (global snapshot migration applied)
9. `supabase migration new make_event_type_mapping_global`
10. Migration created: `supabase/migrations/20260217094734_make_event_type_mapping_global.sql`
11. `supabase db push` (global event type mapping migration applied)

Schema constraints respected:

- No extra index
- No extra table
- No foreign keys

Global scope migrations applied:

- `webinar_snapshots`: `user_id` removed, unique on `odoo_webinar_id`
- `event_type_wp_tag_mapping`: `user_id` removed, unique on `odoo_event_type_id`

## 10. Registration Webhook Removal Note

Codebase audit result:

- Event Operations module does not expose a dedicated registration webhook route.
- Registration aggregation now runs exclusively inside `POST /events/api/sync`.
- Existing Forminator webhook endpoints are outside Event Operations scope and were intentionally not modified.

---

## 11. No-Regression Guardrails

1. Keep existing event publish/sync architecture intact.
2. Keep registration detail endpoint and attendance updates intact.
3. Avoid broad refactors outside Addendum H scope.
4. Prefer additive changes over structural rewrites.
5. Preserve existing route map and module registration behavior.
