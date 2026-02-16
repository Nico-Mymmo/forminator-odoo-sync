# ADDENDUM G – BACKEND IMPLEMENTATION LOG

**Module:** Event Operations  
**Addendum:** G – Registrations Layer in Workspace Card  
**Date:** February 16, 2026  
**Status:** BACKEND LOGIC STABLE – READY FOR UI

---

## 1. Delivered Backend Files

- `src/modules/event-operations/services/webinar-registration-service.js`
- `src/modules/event-operations/services/lead-resolution-service.js`
- `src/modules/event-operations/services/attendance-service.js`
- `src/modules/event-operations/routes/event-registrations.js`
- `src/modules/event-operations/routes.js` (route-map integration)
- `src/modules/event-operations/odoo-client.js` (Addendum G backend helper methods)
- `src/modules/event-operations/constants.js` (Addendum G model/field constants)

---

## 2. Constraint Compliance

- All Odoo access for Addendum G backend flows is routed through `event-operations/odoo-client.js`.
- Lead retrieval is batched by partner ID set (`crm.lead`), never per registration row.
- Lead resolution is deterministic: active non-archived → closed non-archived → archived, with tie-break order `write_date DESC`, `create_date DESC`, `id DESC`.
- Attendance writes always include audit metadata (`updated_at`, `updated_by`, `origin`) in the same write operation.
- Bulk attendance updates are processed in bounded batches (max 50 per batch) with row-level success/failure reporting.
- Registration volume behavior is enforced in backend response policy:
  - `0–120`: full list mode
  - `121–300`: pagination required
  - `>300`: pagination + virtualization required flag
- No UI changes were implemented in this deliverable.

---

## 3. Implemented API Endpoints

- `GET /events/api/events/:webinarId/registrations`
  - Returns registrations + deterministic lead state + pagination metadata + threshold flags.
- `POST /events/api/events/registrations/:id/attendance`
  - Updates single registration attendance with mandatory audit metadata.
- `POST /events/api/events/registrations/bulk-attendance`
  - Applies bounded bulk attendance updates with explicit partial-success reporting.

---

## 4. Completion Statement

Addendum G backend implementation is complete for services and routes scope. Backend logic is delivered without UI changes and aligned to Addendum G Analysis Revision 2 and implementation constraints.

---

## 5. Lead Status Model Fix (WON_STATUS)

- Refactored `lead-resolution-service.js` to remove all fold-based and stage-name heuristic closed/open detection.
- Implemented deterministic classification based only on `won_status` + `active`:
  - `won_status = pending` and `active = true` => OPEN
  - `won_status = won` and `active = true` => CLOSED_WON
  - `won_status = lost` and `active = false` => CLOSED_LOST
  - Any other combination => OPEN + anomaly log
- Updated tier priority per partner:
  - OPEN first
  - then CLOSED_WON
  - then CLOSED_LOST
  - then `null`
- Kept deterministic tie-break ordering:
  - `write_date DESC`
  - `create_date DESC`
  - `id DESC`
- Updated lead DTO output fields:
  - `resolved_lead_status` in (`pending`, `won`, `lost`)
  - `resolved_lead_stage_name` only when status is `pending`
- Updated Odoo lead retrieval to explicitly fetch `won_status`.
