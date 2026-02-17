# ARCHITECTURE RE-ANALYSIS REPORT

Date: 2026-02-17  
Scope: Current repository state only (migrations + backend + frontend code)

---

## Executive Summary

- The database currently has **17 application tables** defined by migrations.
- Event/Webinar persistence currently exists only as:
  - `webinar_snapshots` (per-user per-webinar sync snapshot),
  - `webinar_tag_mappings` (legacy/alternate mapping layer),
  - `event_type_wp_tag_mapping` (current deterministic mapping layer).
- Registration rows are currently **read live from Odoo** (`x_webinarregistrations`) and are **not persisted in Supabase**.
- Email state for webinar registrations is currently **not persisted** in Supabase.
- Existing idempotency patterns are present for upserts and optimistic locking in other modules, but not for a registration-ingestion pipeline.

---

## A. Current Database State

### A1) Tables from current migrations

1. `users`  
2. `modules`  
3. `user_modules`  
4. `form_mappings`  
5. `form_mappings_history`  
6. `form_submissions_log`  
7. `invites`  
8. `sessions`  
9. `roles`  
10. `user_profiles`  
11. `user_roles`  
12. `sales_insight_queries`  
13. `project_templates`  
14. `project_generations`  
15. `webinar_snapshots`  
16. `webinar_tag_mappings`  
17. `event_type_wp_tag_mapping`

Notes:
- Baseline migration also documents views `active_invites_view` and `user_modules_view` (not table definitions there).
- Repository pattern strongly favors **application-enforced relations** and often **no foreign keys** on user-scoped tables.

### A2) Per-table purpose, PK, important columns

#### Core auth/platform

- `users`
  - PK: `id (uuid)`
  - Purpose: platform users/auth identities.
  - Important: `email` (unique), `password_hash`, `role`, `is_active`, `username`, `last_login_at`.

- `modules`
  - PK: `id (uuid)`
  - Purpose: module registry/navigation.
  - Important: `code` (unique), `route`, `is_active`, `display_order`.

- `user_modules`
  - PK: `id (uuid)` + unique `(user_id,module_id)`
  - Purpose: module grants per user.
  - Important: `user_id`, `module_id`, `is_enabled`, `granted_by`.

- `roles`
  - PK: `id (uuid)`
  - Purpose: role catalog for RLS role model.
  - Important: `key` (unique), `name`.

- `user_roles`
  - PK: `(user_id,role_id)`
  - Purpose: role assignments.
  - Important: `user_id`, `role_id`.

- `user_profiles`
  - PK: `id (uuid)`
  - Purpose: profile table tied to auth uid.
  - Important: `email`, `created_at`.

- `sessions`
  - PK: `id (uuid)`
  - Purpose: app sessions.
  - Important: `token` (unique), `user_id`, `expires_at`, `last_activity_at`.

- `invites`
  - PK: `id (uuid)`
  - Purpose: invitation flow.
  - Important: `email`, `token` (unique), `expires_at`, `accepted_at`.

#### Forminator sync / mappings

- `form_mappings`
  - PK: `id (uuid)`
  - Purpose: per-form mapping/workflow config.
  - Important: `form_id`, `field_mapping (jsonb)`, `value_mapping (jsonb)`, `workflow (jsonb)`, `version`, `deleted_at`.

- `form_mappings_history`
  - PK: `id (uuid)`
  - Purpose: mapping version history/audit.
  - Important: `mapping_id`, `form_id`, `version`, `change_type`, `changed_at`.

- `form_submissions_log`
  - PK: `id (uuid)`
  - Purpose: submission processing log for webhook processing.
  - Important: `form_id`, `entry_id`, `submission_data`, `processed_data`, `status`, `error_message`, `odoo_record_id`, `submitted_at`, `retry_count`, `metadata`.

#### Sales insights

- `sales_insight_queries`
  - PK: `id (uuid)`
  - Purpose: saved query definitions.
  - Important: `base_model`, `query_definition (jsonb)`, `source`, `complexity_hint`.

#### Project generator

- `project_templates`
  - PK: `id (uuid)`
  - Purpose: user-owned project blueprints.
  - Important: `user_id`, `blueprint_data`, `visibility`, `owner_user_id`, `editor_user_ids`.

- `project_generations`
  - PK: `id (uuid)`
  - Purpose: project generation runs and outcomes.
  - Important: `user_id`, `template_id`, `status`, `odoo_project_id`, `generation_model`, `odoo_mappings`, `failed_step`.

#### Event operations

- `webinar_snapshots`
  - PK: `id (uuid)` + unique `(user_id,odoo_webinar_id)`
  - Purpose: sync snapshot state per user/webinar.
  - Important: `odoo_webinar_id`, `odoo_snapshot (jsonb)`, `wp_snapshot (jsonb)`, `computed_state`, `editorial_content (jsonb)`, `last_synced_at`.

- `webinar_tag_mappings`
  - PK: `id (uuid)` + unique `(user_id,odoo_tag_id)`
  - Purpose: Odoo tag to WP category mapping (older tag mapping path).
  - Important: `odoo_tag_id`, `wp_category_slug`, `wp_category_id`, `auto_created`.

- `event_type_wp_tag_mapping`
  - PK: `id (uuid)` + unique `(user_id,odoo_event_type_id)`
  - Purpose: deterministic Odoo event type to WP tag mapping (current path).
  - Important: `odoo_event_type_id`, `wp_tag_id`, `wp_tag_slug`, `wp_tag_name`, `calendar_color`.

### A3) Existing relationships

#### Database-level relationships

- Core tables include unique/PK constraints and RLS policies.
- In user-scoped extension tables (`project_*`, `webinar_*`, `event_type_*`) the pattern is explicitly **no foreign keys**.

#### Application-enforced relationships (important)

- `webinar_snapshots.user_id` ↔ current authenticated user.
- `webinar_snapshots.odoo_webinar_id` ↔ Odoo `x_webinar.id`.
- `event_type_wp_tag_mapping.odoo_event_type_id` ↔ Odoo `x_webinar_event_type.id`.
- Registration route uses Odoo `x_webinarregistrations.x_studio_linked_webinar` ↔ Odoo `x_webinar.id`.

### A4) Existing registration-related storage

- **No Supabase table currently stores per-registration webinar records.**
- Existing registration-adjacent persistence:
  - `form_submissions_log`: logs Forminator webhook processing.
  - `webinar_snapshots`: stores webinar-level snapshots and counts context, not registration row history.

### A5) External ID patterns already used

- Odoo IDs are stored as integers in multiple places:
  - `odoo_webinar_id`, `odoo_tag_id`, `odoo_event_type_id`, `odoo_record_id`, `odoo_project_id`.
- WordPress IDs/slugs are persisted in mapping/snapshot records:
  - `wp_tag_id`, `wp_tag_slug`, WP event id inside `wp_snapshot`.
- Composite uniqueness for external IDs is pattern-based and user-scoped:
  - `(user_id,odoo_webinar_id)`, `(user_id,odoo_event_type_id)`, `(user_id,odoo_tag_id)`.

---

## B. Current Event / Webinar Architecture

### B1) How events are stored

- Odoo remains source of truth for webinar records (`x_webinar`), fetched via `getOdooWebinars()` / `getOdooWebinar()`.
- Supabase stores a per-user mirror/snapshot in `webinar_snapshots`:
  - `odoo_snapshot` and `wp_snapshot` JSON blobs,
  - `computed_state` (`not_published`, `draft`, `published`, `out_of_sync`, `archived`, `deleted`),
  - optional `editorial_content` override.

### B2) How WordPress sync works

- Route: `POST /events/api/publish`
  - pulls Odoo webinar,
  - resolves event-type mapping from `event_type_wp_tag_mapping`,
  - creates/updates WP event via Tribe endpoint,
  - writes meta `odoo_webinar_id` on WP core endpoint,
  - upserts `webinar_snapshots`.

- Route: `POST /events/api/sync`
  - fetches Odoo webinars + WP events + mappings,
  - validates event-type mapping coverage,
  - computes state and discrepancies,
  - batch upserts snapshots by `(user_id,odoo_webinar_id)`.

### B3) Whether registrations are already persisted

- Registrations are fetched live from Odoo (`x_webinarregistrations`) through:
  - `GET /events/api/events/:webinarId/registrations`
- They are normalized in-memory and returned to UI.
- Attendance writes update Odoo directly (`POST /events/api/events/registrations/:id/attendance`, bulk variant).
- **No registration persistence exists in Supabase for this flow.**

### B4) Whether any email state exists

- Registration response includes an `email` value resolved from Odoo fields/fallback partner email.
- No Supabase persistence currently stores webinar-registration email lifecycle state (queued/sent/failed/etc.).
- Existing email fields in other domains (`users`, invites, contacts) are not registration-email state.

---

## C. Current Webhook Infrastructure

### C1) Existing webhook routes

- Forminator ingest endpoints:
  - `POST /forminator/api/receive` (module route).
  - Legacy action endpoint: `POST /?action=receive_forminator` (ACTIONS router in `src/index.js`).

- Legacy action auth supports bearer/query token and special `openvmeform` user-agent gate.

### C2) Existing API routes relevant to this analysis

- Event operations routes (under `/events/...`):
  - webinars listing, WP events, snapshots, sync, publish,
  - event-type mappings,
  - editorial get/put,
  - registrations read + attendance writes.

- Forminator module routes (under `/forminator/...`):
  - mappings CRUD/import,
  - history endpoints,
  - receive and test-connection actions.

### C3) Ordering / idempotency patterns already used elsewhere

- **Idempotent upsert patterns**:
  - `webinar_snapshots` upsert on `(user_id,odoo_webinar_id)`.
  - `event_type_wp_tag_mapping` upsert on `(user_id,odoo_event_type_id)`.

- **Optimistic locking pattern**:
  - form mapping updates use `version` checks in repository update flow.

- **Deterministic ordering patterns**:
  - webinar registrations: `write_date desc, id desc`.
  - lead resolution tie-break: `write_date desc, create_date desc, id desc`.

- **Webhook idempotency for Forminator**:
  - no explicit idempotency key/unique webhook event key enforcement observed in current ingestion path.

---

## Observed Architectural Gaps (for Addendum H scope)

1. No durable registration table exists for event-operations registration rows.
2. No persisted email-state model exists for webinar registration notifications.
3. Registration ordering is deterministic in Odoo reads, but no persisted high-water-mark/cursor strategy exists in Supabase.
4. UI already has registration modal + attendance controls and badge primitives, but currently derives registration data live per request.

---

## Data-Model Consistency Note

- Migration defines `form_mappings_history`.
- `src/lib/database.js` queries `form_mapping_history` (singular).  
This may indicate a naming mismatch risk between code and migrated schema.
