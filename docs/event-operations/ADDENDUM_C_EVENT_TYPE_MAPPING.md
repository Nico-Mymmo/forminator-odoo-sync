# EVENT OPERATIONS – ADDENDUM C: EVENT TYPE → WORDPRESS TAG MAPPING REFACTOR

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Base Implementation:** Phase 0-7 Complete + Addendum A Complete + Addendum B Complete  
**Implementation Date:** February 13, 2026  
**Status:** Implemented  
**Platform:** Cloudflare Workers + Supabase PostgreSQL + Odoo `x_webinar` + Pure Vanilla JavaScript

---

## 1. Addendum Overview

### Purpose

Addendum C replaces the legacy many-to-many webinar tag mapping model with a deterministic event type mapping model. Instead of syncing WordPress tags directly from `x_studio_tag_ids`, each webinar now resolves exactly one Odoo event type (`x_event_type_id`) and maps that event type to exactly one WordPress tag ID.

### Problem Solved

The previous model introduced ambiguity and operational complexity:

1. **Many-to-many ambiguity:** One webinar could carry multiple Odoo tags without deterministic priority
2. **Non-deterministic sync output:** Different mapping states could produce inconsistent WP tag payloads
3. **UI inconsistency:** Mapping UI depended on free-form tag logic and historical assumptions
4. **Operational risk:** Silent fallbacks masked missing mappings and caused unexpected taxonomy drift

### New Deterministic Rule Set

1. **One webinar → one event type** (`x_event_type_id`)
2. **One event type → max one WP tag mapping**
3. **One WP tag may be reused by multiple event types**
4. **Sync uses `wp_tag_id` only** (slug/name are display snapshots)
5. **Tribe publish payload uses `wp_tag_slug` in `categories`** for The Events Calendar taxonomy assignment

---

## 2. Architecture Decision

### Current Canonical Odoo Model

```javascript
{
  id: 44,
  x_name: "Example Webinar",
  x_event_type_id: [7, "Webinar"],   // many2one (authoritative)
  x_studio_tag_ids: [4, 7, 12]                // deprecated for sync
}
```

### New Mapping Table (Module-Owned)

Table: `event_type_wp_tag_mapping`

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `id` | UUID | ✅ | Primary key (`gen_random_uuid()`) |
| `user_id` | UUID | ✅ | User-scoped ownership (no FK) |
| `odoo_event_type_id` | INTEGER | ✅ | Odoo many2one ID from `x_event_type_id` |
| `wp_tag_id` | INTEGER | ✅ | Canonical WordPress tag identifier |
| `wp_tag_slug` | TEXT | ✅ | Snapshot for display only |
| `wp_tag_name` | TEXT | ✅ | Snapshot for display only |
| `created_at` | TIMESTAMPTZ | ✅ | Default `NOW()` |
| `updated_at` | TIMESTAMPTZ | ✅ | Auto-updated via trigger |

### Constraints

1. Unique mapping on `(user_id, odoo_event_type_id)`
2. `wp_tag_id` is intentionally non-unique
3. No database foreign keys (module baseline)
4. RLS user isolation follows existing module pattern (`auth.uid() = user_id`)

---

## 3. Sync Flow Refactor

### Legacy Flow (Deprecated)

```text
x_webinar.x_studio_tag_ids (many2many)
  → tag mapping table lookup
  → multiple WP tags
  → push to WP
```

### New Flow (Authoritative)

```text
x_webinar.x_event_type_id
  → lookup event_type_wp_tag_mapping by odoo_event_type_id
  → resolve wp_tag_id
  → push single deterministic WP tag payload
```

### Validation Rules (Mandatory)

1. If `x_event_type_id` missing: fail sync with explicit error
2. If mapping not found: fail sync with explicit error
3. No silent fallback to `x_studio_tag_ids`
4. No default/fallback tag injection

---

## 4. Mapping UI Requirements

### WP Tag Source of Truth

WordPress Event Categories (`tribe_events_cat`) must be fetched live from REST at mapping screen open.

### UI Behavior

1. Show Odoo event types as source list
2. Show WordPress tag dropdown from live API result
3. Disable free-text tag entry
4. Save mapping using `wp_tag_id` as internal value
5. Persist `wp_tag_slug` and `wp_tag_name` as display snapshots

### Prohibited Patterns

1. No hardcoded WP tag lists
2. No slug-based matching for sync decisions
3. No fallback to stale local tag cache when live call succeeds

---

## 5. Deprecation & Migration Policy

### Deprecation Statement

`x_studio_tag_ids` is deprecated for Event Operations publish/sync logic as of Addendum C.

### Explicit Non-Destructive Policy

1. Do not remove `x_studio_tag_ids` from Odoo
2. Do not auto-migrate old per-webinar mappings to event-type mappings
3. Do not infer mappings from historical snapshots without explicit migration task

### Migration Note

This addendum is a **breaking behavior change** in mapping resolution strategy. Existing webinars without a valid `x_event_type_id` mapping will fail sync until a mapping record is created.

---

## 6. Required Code Changes

### 6.1 Database Layer

- Add migration for `event_type_wp_tag_mapping` (`20260213090000_event_operations_addendum_c_event_type_mapping.sql`)
- Add indexes, unique constraint, `updated_at` trigger, and RLS policies
- Keep no-FK schema baseline intact

### 6.2 Server Layer

- Refactor mapping/publish flow to use `x_event_type_id`
- Remove runtime dependency on `x_studio_tag_ids` for publish
- Introduce strict error responses for missing event type or missing mapping
- Implement API endpoints:
  - `GET /events/api/event-type-tag-mappings`
  - `PUT /events/api/event-type-tag-mappings`
  - `DELETE /events/api/event-type-tag-mappings/:id`
  - `GET /events/api/odoo-event-types`
  - `GET /events/api/wp-event-categories` (Tribe taxonomy `tribe_events_cat`)

### 6.3 Client Layer

- Replace old tag mapping UI with event-type mapping UI
- Populate WP tag options from live REST
- Ensure payload stores `wp_tag_id`, `wp_tag_slug`, `wp_tag_name`

### 6.4 Documentation Layer

- Update implementation log with Addendum C scope and migration impact
- Update architecture and sync-flow docs to reflect deterministic mapping
- Keep Addendum A/B history intact while marking A4 mapping approach as superseded for sync

---

## 7. Acceptance Criteria

All criteria must pass before merge:

- [x] Sync resolves tags exclusively via event type mapping
- [x] No publish path uses `x_studio_tag_ids` for WP taxonomy decisions
- [x] `event_type_wp_tag_mapping` table exists and is user-scoped
- [x] WP tags are fetched dynamically from REST in mapping UI
- [x] Multiple event types can map to the same WP tag
- [x] Missing mapping causes explicit sync failure (no fallback)
- [x] Documentation updated (Addendum C + implementation log + architecture/sync flow updates)
- [x] The Events Calendar category taxonomy (`tribe_events_cat`) is assigned on publish

---

## 8. No-Regression Rules

1. Do not break Addendum A editorial layer functionality
2. Do not break Addendum B datetime refactor behavior
3. Do not introduce foreign keys
4. Maintain separation of concerns (client UI vs server sync logic)
5. Do not hardcode WordPress tags
6. Keep no-inline-JS-in-server-template rule intact

---

## 9. Breaking Change Note

**Breaking Change:** Yes  
**Reason:** Mapping source changed from many-to-many webinar tags to one-to-one event-type mapping lookup.  
**Impact:** Existing records without configured event-type mappings fail fast at sync time.  
**Rollback:** Revert Addendum C commits and redeploy previous mapping flow.

---

## 10. Implementation Checklist

- [x] Add Supabase migration for `event_type_wp_tag_mapping`
- [x] Add/adjust server helpers for event-type mapping lookup
- [x] Refactor publish path and remove many-to-many mapping dependency
- [x] Update mapping UI for event types + live WP category dropdown (`tribe_events_cat`)
- [x] Add missing-mapping hard-fail validation in publish + sync flow
- [x] Verify no syntax regressions in Addendum A/B affected files (`get_errors` checks)
- [x] Update implementation log with execution evidence
