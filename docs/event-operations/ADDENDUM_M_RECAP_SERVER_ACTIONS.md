# Addendum M — Recap via Odoo Server Actions

**Date:** 2026-02-25  
**Scope:** Event Operations recap send/reset behavior after migration to Odoo Server Actions.  
**Source of truth:** Current module code only.

---

## 1) Context

Recap execution no longer calls a direct model method on `x_webinar`.  
Both recap operations now run through `ir.actions.server` with webinar context:

- **Send Recap Mail** → Server Action ID **1099**
- **Reset Recap Status** → Server Action ID **1100**

This preserves the existing architecture (UI → Worker routes → Odoo RPC) while delegating send/reset logic to Odoo Server Actions.

---

## 2) Backend behavior

### 2.1 Send recap

Worker route (unchanged path):

- `POST /events/api/webinar/:id/send-recap`

Flow:

1. Validate `webinarId`
2. Parse optional UI payload from send-confirm action
3. Sync UI state to Odoo **before** sending (UI is treated as source of truth at send time):
   - title override → `x_name` (only when override is present)
   - recap fields → `video_url`, `thumbnail_url`, `followup_html`
4. Keep existing readiness validation (`computeRecapReady`)
5. Keep existing already-sent guard (`getWebinarRecapSentStatus`)
6. Execute Odoo Server Action **1099** with context:
   - `active_model: 'x_webinar'`
   - `active_id: webinarId`
   - `active_ids: [webinarId]`
   - `recap_template_id: <resolved template id>`
7. Return existing success/failure shape

Template ID resolution for `recap_template_id`:

1. `env.RECAP_MAIL_TEMPLATE_ID`
2. fallback `env.ODOO_RECAP_TEMPLATE_ID`
3. fallback `0`

This guarantees a template-id key is always passed in action context.

Implementation points:

- `src/modules/event-operations/odoo-client.js` → `sendWebinarRecap(...)`
- `src/modules/event-operations/routes.js` → send route keeps guards and error handling

### 2.2 Reset recap

New Worker route:

- `POST /events/api/webinar/:id/reset-recap`

Flow:

1. Validate `webinarId`
2. Execute Odoo Server Action **1100** with context:
   - `active_model: 'x_webinar'`
   - `active_id: webinarId`
   - `active_ids: [webinarId]`
3. Return:

```json
{
  "success": true,
  "webinar_id": 123
}
```

Errors from Odoo RPC are returned via existing route error pattern (`success: false`, HTTP 500).

Implementation points:

- `src/modules/event-operations/odoo-client.js` → `resetWebinarRecapStatus(...)`
- `src/modules/event-operations/routes.js` → new reset route

---

## 3) UI behavior

### 3.1 Send button

Recap send behavior remains the same from the user perspective:

- “Verstuur Recap” uses existing confirm modal.
- Existing ready/sent gating and success/error handling remain in place.
- At confirm-time, current visible recap UI values are serialized and sent to backend,
  so send uses what is on screen at that moment.

### 3.2 Reset button

Recap section now includes:

- **Reset Recap Status** button
- Visible **only when** `recap_sent = true`
- Button opens a dedicated confirm modal with explicit confirmation text
- No automatic/no silent reset

Implementation points:

- `public/detail-panel-controller.js` → reset action/button wiring
- `public/event-operations-client.js` → modal open/confirm logic + endpoint call
- `src/modules/event-operations/ui.js` → reset confirmation modal markup

---

## 4) What did not change

Deliberately unchanged:

- Thumbnail generation/upload logic
- Asset storage logic
- Recap readiness logic (`computeRecapReady`)
- Recap sent status check (`getWebinarRecapSentStatus`)
- Odoo model naming (`x_webinar`, `x_webinarregistrations`)
- Overall module architecture

---

## 5) Operational contract

Required Odoo assets:

1. `ir.actions.server` record **1099** (send recap)
2. `ir.actions.server` record **1100** (reset recap status)
3. Server Actions must correctly interpret context:
   - `active_model = 'x_webinar'`
   - `active_id`, `active_ids`
   - `recap_template_id`
4. Optional Worker env keys for template selection:
   - `RECAP_MAIL_TEMPLATE_ID`
   - `ODOO_RECAP_TEMPLATE_ID`

If action IDs are absent/misconfigured, Worker routes fail with Odoo RPC errors.

---

## 6) Verification checklist

Expected outcomes:

1. Send Recap sets sent-state and sends mails
2. Reset Recap clears sent-state
3. Send Recap works again after reset
4. No resending possible without reset (guard + Odoo behavior)
5. No direct `send_recap_email` Worker model call remains

---

## 7) Notes vs Addendum L

Addendum L analyzed the recap dependency model and historical direct-method coupling.  
This addendum documents the current implementation where send/reset execution is routed via Odoo Server Actions.
