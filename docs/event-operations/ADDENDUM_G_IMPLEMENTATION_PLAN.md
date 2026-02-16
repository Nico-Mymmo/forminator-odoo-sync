# ADDENDUM G – IMPLEMENTATION PLAN

**Module:** Event Operations  
**Addendum:** G – Registrations Layer in Workspace Card  
**Date:** February 16, 2026  
**Status:** IMPLEMENTATION PLAN

---

## 1. Implementation Scope Confirmation

Addendum G implementation scope is confirmed as a functional expansion of the right-side workspace panel with strict alignment to Analysis Revision 2.

Confirmed scope:

- Webinar detail plus registrations operational layer
- Data path: Webinar → Registrations → Contact (res.partner) → Leads (crm.lead)
- Mandatory tab-based panel segmentation
- Deterministic lead resolution rules
- Attendance audit metadata requirement
- Registration volume thresholds and performance controls

Confirmed UI structure:

- `Webinar` tab
- `Registrations` tab

Confirmed lead resolution rules:

1. Active lead: `active = true` and stage not closed-won and not closed-lost
2. Closed stage classification: terminal stage flags or normalized stage name (`won`, `lost`, `closed`)
3. Deterministic ordering: `write_date DESC`, then `create_date DESC`, then `id DESC`
4. Tiered fallback: active non-archived → closed non-archived → archived → no lead

Confirmed attendance rule:

- Attendance update is valid only with audit metadata write

Confirmed volume rules:

- 0–120: full list
- 121–300: pagination mandatory
- >300: pagination + virtualization mandatory

Alignment with Revision 2 is exact and complete.

---

## 2. Database Layer Changes

Attendance audit requirement applies to `x_webinarregistrations`.

### 2.1 Fields

Required fields:

- `x_studio_attendance_updated_at` — DATETIME
- `x_studio_attendance_updated_by` — MANY2ONE (`res.users`)
- `x_studio_attendance_update_origin` — CHAR/TEXT

### 2.2 Model Impact

Impacted model:

- `x_webinarregistrations`

### 2.3 Backward Compatibility Impact

- Existing attendance boolean remains authoritative state field
- Existing records remain valid without historical audit values
- New audit values are populated on Addendum G attendance updates

### 2.4 Default Values Policy

- Existing records: audit fields remain null until first attendance write through Addendum G flow
- New attendance writes: audit fields are mandatory and always populated

### 2.5 Migration Strategy

- Additive schema extension only
- No destructive change
- No existing field rename
- No existing behavior removal

---

## 3. Backend Retrieval Architecture

### 3.1 Webinar Retrieval Flow

Selected webinar flow:

1. Load selected webinar context
2. Retrieve registrations linked by `x_studio_linked_webinar`
3. Extract partner IDs from `x_studio_registered_by`
4. Build unique partner ID set for lead retrieval batch scope

### 3.2 Lead Batch Retrieval Flow

Lead retrieval architecture:

1. Single batched lead retrieval for partner ID set
2. In-memory grouping by partner ID
3. Deterministic reduction per registration contact using approved tier and tie-break order
4. Materialize one display lead state per registration row

No per-row CRM lookup path is allowed.

---

## 4. Attendance Write Architecture

Attendance update flow:

1. Operator updates attendance state for one or more registrations
2. System writes attendance boolean and audit metadata in same write operation
3. System returns row-level write result status

Audit write behavior:

- Every attendance write includes timestamp, operator, origin

Conflict rule:

- Last-write-wins
- Latest successful write state becomes authoritative state

Bulk update behavior:

- Bulk operations process as bounded batch actions
- Row-level success/failure is preserved
- Partial completion state is explicit in response

Error feedback strategy:

- Row-level failures are returned with explicit reason
- Bulk result includes success count, failure count, failed row references

---

## 5. UI Architecture

### 5.1 Tab Structure

`Webinar` tab contents:

- Webinar metadata
- Existing webinar actions
- Existing publish/sync context

`Registrations` tab contents:

- Registration operational list
- Contact and lead state indicators
- Attendance controls
- Questions previews

### 5.2 Registration Row Structure

Each registration row contains:

- Contact
- Email
- Contact-created indicator
- Lead stage badge
- Attendance control
- Questions preview

### 5.3 Pagination Rules

At 120 threshold:

- Up to 120 rows: full list in panel

At 300 threshold:

- 121–300 rows: paginated list required
- More than 300 rows: paginated list required with virtualization required

### 5.4 Virtualization Behavior

For datasets above 300 registrations:

- Only visible row window is rendered
- Off-screen rows are not mounted
- Scroll position drives render window updates
- Tab boundary remains unchanged

---

## 6. Security Controls

HTML detection pipeline:

1. Classify questions content as HTML or plain text
2. Route HTML-classified content through sanitization
3. Route plain text through escaped text rendering

Sanitization enforcement:

- Sanitization is mandatory on all HTML-classified question values
- Unsafe tags, attributes, and executable vectors are stripped

Prohibited behaviors:

- Raw untrusted HTML render
- Inline script/event-handler execution
- Bypass path that skips sanitization on HTML-classified content

---

## 7. Performance Controls

Batched lead retrieval enforcement:

- Partner-based lead retrieval executes in batched mode only
- Per-row lead lookup is prohibited

Render bounding rules:

- Full render allowed only up to 120 rows
- Pagination enforced above 120
- Pagination plus virtualization enforced above 300

Lazy loading triggers:

- Trigger at registration count 121 and above
- Page-based loading governs data and UI rendering boundaries

---

## 8. Testing Strategy

### 8.1 Unit Tests Required

- Lead resolution correctness
- Closed stage classification handling
- Tie-break ordering validation
- Attendance audit metadata recording validation

### 8.2 Integration Tests Required

- Webinar with 0 registrations
- Webinar with 50 registrations
- Webinar with 200 registrations
- Webinar with 400 registrations

### 8.3 Security Tests

- XSS injection attempt in questions field
- Malformed HTML payload in questions field
- Plain text with angle brackets in questions field

---

## 9. Rollout Plan

Migration sequence:

1. Apply additive attendance audit schema changes
2. Verify read/write compatibility with existing records

Deployment order:

1. Database schema extension
2. Backend retrieval and attendance write deployment
3. UI tab and registrations layer deployment
4. Post-deploy validation and monitoring

Feature flag policy:

- Addendum G rollout uses a feature flag for controlled activation

Backward compatibility guarantee:

- Existing webinar workflows remain operational
- Existing records remain readable without audit backfill
- Addendum G behavior activates without breaking prior module behavior
