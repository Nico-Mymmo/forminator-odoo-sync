# CLEAN ADDENDUM H PROPOSAL

Date: 2026-02-17  
Precondition: Based only on current repository state (fresh re-analysis)

---

## 1) Decision: New table vs extending existing tables

## Recommendation

Create a **new** table: `webinar_registrations`.

### Why not extend existing tables?

- `webinar_snapshots` is webinar-level and keyed by `(user_id,odoo_webinar_id)`; it cannot represent many registrations per webinar cleanly.
- `form_submissions_log` is Forminator webhook processing history, not event-operations registration state.
- Extending either would mix unrelated lifecycles and degrade query clarity.

### Why a new table is the minimal clean design

- Matches existing pattern: user-scoped table with app-enforced external IDs.
- Supports idempotent upsert by Odoo registration ID.
- Supports independent registration-email state and ordering metadata.

---

## 2) Minimal data design for Odoo registration persistence

Proposed logical shape for `webinar_registrations`:

- Identity and ownership
  - `id` (uuid, internal PK)
  - `user_id` (uuid)
  - `odoo_registration_id` (int)
  - `odoo_webinar_id` (int)

- Registration payload essentials
  - `registered_by_partner_id` (int, nullable)
  - `name` (text, nullable)
  - `email` (text, nullable)
  - `questions` (text/jsonb, nullable)
  - `questions_is_html_flag` (boolean default false)
  - `contact_created` (boolean default false)
  - `attended` (boolean default false)

- Source ordering and sync metadata
  - `odoo_write_date` (timestamptz, nullable)
  - `odoo_create_date` (timestamptz, nullable)
  - `last_seen_at` (timestamptz)
  - `created_at` / `updated_at` (timestamptz)

- Suggested uniqueness/index strategy (conceptual)
  - unique `(user_id, odoo_registration_id)`
  - index `(user_id, odoo_webinar_id)`
  - index `(user_id, odoo_webinar_id, odoo_write_date desc, odoo_registration_id desc)`

This keeps the shape minimal while enabling fast list/pagination and incremental sync.

---

## 3) Email state flag design

## Recommendation

Store email lifecycle fields **on `webinar_registrations` rows** (not a separate table for MVP).

### Minimal flag set

- `email_send_eligible` (boolean)
- `email_send_attempted_at` (timestamptz, nullable)
- `email_sent_at` (timestamptz, nullable)
- `email_send_failed_at` (timestamptz, nullable)
- `email_failure_reason` (text, nullable)

### Optional but useful

- `email_provider_message_id` (text, nullable)
- `email_send_status` enum-like text (`pending|sent|failed|skipped`) if preferred over pure flags.

### Why this is clean and minimal

- Co-locates registration and notification lifecycle in one row.
- Avoids premature complexity of per-attempt child table.
- Can later evolve into `webinar_registration_email_attempts` if needed.

---

## 4) Write-date ordering strategy

## Recommendation

Use **deterministic source ordering** consistent with existing event-operations rules:

1. `odoo_write_date DESC`
2. `odoo_registration_id DESC` (tie-break)

For ingestion/upserts, use high-water-mark logic conceptually as:

- last cursor = max tuple `(odoo_write_date, odoo_registration_id)` previously seen for `(user_id,odoo_webinar_id)`.
- fetch next batch where source tuple is strictly newer than cursor.
- upsert by `(user_id,odoo_registration_id)` to keep idempotent behavior.

This aligns with current code patterns (`write_date desc, id desc`) and keeps ordering stable.

---

## 5) UI visualization design (true-only badges)

## Recommendation

Use **true-only badges** in the registrations UI:

- Show badge only when flag is true.
- Render nothing for false/null.

### Suggested badge mapping

- `contact_created === true` → badge: “Contact created”
- `attended === true` → badge: “Attended”
- `email_sent_at != null` (or `email_send_status === sent`) → badge: “Email sent”
- `email_send_failed_at != null` (or `email_send_status === failed`) → badge: “Email failed”

### Why this fits current UI architecture

- Current detail panel/modal already supports compact badges and status chips.
- True-only display reduces noise in dense registration tables.
- Preserves scannability for operational triage.

---

## 6) Integration with current architecture

- Keep Odoo as source-of-truth for registration updates (attendance writes stay in Odoo).
- Add Supabase persistence as read-optimized mirror for registration and email state.
- Keep user-scoped table pattern and no-FK style to remain consistent with existing event/project tables.
- Preserve existing `/events/api/events/:webinarId/registrations` contract shape where possible; backend can swap data source from live Odoo to persisted mirror (or hybrid).

---

## 7) Implementation sequencing (no SQL/code yet)

1. Create schema for `webinar_registrations`.
2. Add ingestion/sync service that reads Odoo registrations and upserts deterministically.
3. Extend registration API to read persisted rows (with fallback strategy if needed).
4. Add email-state update hooks in backend flow.
5. Add true-only badges in detail-panel registration modal rendering.

---

## Final Position

- **A new `webinar_registrations` table is required.**
- Extending current tables is not structurally clean for per-registration persistence.
- Email state should be stored on registration rows for MVP.
- Ordering should follow `write_date` + id deterministic tie-break, matching current patterns.
- UI should use true-only badges for attendance/contact/email state visibility.
