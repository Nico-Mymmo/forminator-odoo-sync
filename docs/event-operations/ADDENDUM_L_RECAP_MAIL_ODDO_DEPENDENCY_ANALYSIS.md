# Addendum L — Recap Mail & Odoo Dependency Analysis

> Note (2026-02-25): the send/reset execution mechanism is now documented in
> `ADDENDUM_M_RECAP_SERVER_ACTIONS.md`.
> This document remains valid for dependency/risk analysis, but references to
> direct `send_recap_email` invocation are historical.

**Date:** 2026-02-25  
**Scope:** End-to-end behavior of recap sending in Event Operations (frontend + Worker + Odoo RPC), with specific focus on whether mails can be sent correctly when `x_webinar` is custom/non-standard.  
**Source of truth:** Only repository code (no external assumptions).

---

## 1) Executive summary

Based on the code, recap sending is **hard-coupled** to a custom Odoo data model and custom fields/methods:

- Odoo model required: `x_webinar`
- Odoo registration model required: `x_webinarregistrations`
- Odoo method required: `x_webinar.send_recap_email`
- Odoo custom fields required for recap readiness:
  - `x_studio_vimeo_url`
  - `x_studio_vimeo_thumbnail_url`
  - `x_studio_followup_html`
- Odoo registration field required for “already sent” guard:
  - `x_studio_recap_email_sent`

If these custom objects do not exist (or have different names), recap endpoints fail with Odoo RPC errors and no mail is sent.

The Worker does **not** build recipient lists itself. It only passes `webinarId` to Odoo and delegates recipient targeting to Odoo’s `send_recap_email` implementation. So “mails to jan en alleman” can only happen if that Odoo method is misconfigured.

---

## 2) Where the recap flow lives in this module

### Frontend entry points

- Detail panel button action `send-recap` triggers `window.recapOpenConfirmModal(webinarId)` in:
  - `public/detail-panel-controller.js`
- Recap UI behavior (load status, upload thumbnail, save HTML, confirm send) is implemented in:
  - `public/event-operations-client.js`

### Backend API endpoints

In `src/modules/event-operations/routes.js`:

- `GET /events/api/webinar/:id/recap`
- `POST /events/api/webinar/:id/video-url`
- `POST /events/api/webinar/:id/thumbnail`
- `PUT /events/api/webinar/:id/recap-html`
- `POST /events/api/webinar/:id/send-recap`

### Odoo integration points

In `src/modules/event-operations/odoo-client.js`:

- `getWebinarRecapFields(env, webinarId)`
- `getWebinarRecapSentStatus(env, webinarId)`
- `updateWebinarRecapFields(env, webinarId, fields)`
- `sendWebinarRecap(env, webinarId)`

Constants in `src/modules/event-operations/constants.js` define required model/field names.

---

## 3) Exact send flow (code path)

## 3.1 UI state before sending

`initRecapSection(webinarId)` calls `GET /events/api/webinar/:id/recap` and receives:

- `video_url`
- `thumbnail_url`
- `followup_html`
- `recap_sent`
- `recap_ready`
- `recap_reasons`

Button behavior:

- If `recap_sent = true`: send button disabled and shown as already sent.
- If `recap_ready = true` and not sent: send button enabled.
- Otherwise disabled with warning reasons shown.

## 3.2 When user confirms “Verstuur Recap”

Frontend does:

- `POST /events/api/webinar/:id/send-recap`

Backend route executes:

1. Parse/validate `webinarId`
2. Load recap fields from Odoo (`getWebinarRecapFields`)
3. Compute readiness (`computeRecapReady`)
4. Block with 409 if not ready
5. Check already-sent (`getWebinarRecapSentStatus`)
6. Block with 409 if already sent
7. Call `sendWebinarRecap(env, webinarId)`
8. Return success payload with Odoo result + timestamp

Frontend success handling:

- Shows success alert
- Closes modal after delay
- Marks button disabled as sent

---

## 4) Odoo dependencies that must exist

From constants and Odoo client code:

### Required models

- `x_webinar`
- `x_webinarregistrations`

### Required webinar fields

- `x_name`
- `x_studio_event_datetime`
- `x_studio_vimeo_url`
- `x_studio_vimeo_thumbnail_url`
- `x_studio_followup_html`

### Required registration fields

- `x_studio_linked_webinar`
- `x_studio_recap_email_sent` (used in guard query)

### Required method

- Model: `x_webinar`
- Method: `send_recap_email`
- Invocation style: `execute_kw(..., model='x_webinar', method='send_recap_email', args=[[webinarId]])`

If this method is missing or signature incompatible, send fails with Odoo RPC error.

---

## 5) How recipients are determined (important)

The Worker **does not pass** a recipient list, email addresses, or registration IDs to Odoo when sending recap.

It only passes webinar ID to `x_webinar.send_recap_email`.

Therefore recipient selection is fully inside Odoo custom logic. This module cannot, from current code, guarantee who receives mails beyond trusting that method.

Implication:

- Safe behavior depends on correct Odoo method implementation.
- Risk of broad/incorrect sending exists only if Odoo method itself is wrong.

---

## 6) Built-in safety checks in this module

Before calling Odoo send:

1. **Readiness gate** (`computeRecapReady`) requires all of:
   - video URL exists
   - thumbnail URL exists
   - recap HTML exists and non-empty
   - webinar datetime is in the past

2. **Already-sent gate**:
   - checks `x_webinarregistrations` where:
     - `x_studio_linked_webinar = webinarId`
     - `x_studio_recap_email_sent = true`
   - if any found, module blocks resend with HTTP 409

These checks reduce accidental sending, but still do not replace correctness of Odoo method internals.

---

## 7) Notable field-name inconsistency in code/comments

In `odoo-client.js`, comments in `sendWebinarRecap` mention `x_studio_recap_mail_sent`, but active code checks `x_studio_recap_email_sent`.

Observed usage in codebase around registrations primarily uses `..._recap_email_sent` variants.

Risk:

- If real Odoo implementation uses a different field than what this module checks, “already sent” guard may be inaccurate.

Current truth from executable code:

- Guard query uses `x_studio_recap_email_sent`.

---

## 8) Failure modes if Odoo customizations are absent/misaligned

If `x_webinar` does not exist:

- Any recap route that calls Odoo on that model fails (500 with Odoo RPC error).

If `send_recap_email` method does not exist:

- `POST /send-recap` fails on method call (500).

If required custom fields do not exist:

- `GET /recap`, readiness checks, or update routes fail (500).

If registration model/fields differ:

- Already-sent check may fail or behave incorrectly.

No fallback exists in this module to standard Odoo webinar/mail models.

---

## 9) What this module does **not** do

- Does not construct recipient lists in Worker
- Does not send emails directly from Worker
- Does not maintain independent recap-sent ledger in Supabase for send authority
- Does not implement fallback to standard Odoo models
- Does not validate Odoo method semantics at startup

---

## 10) Practical verification checklist (from code perspective)

To confirm production safety, these must be true in Odoo:

1. Model `x_webinar` exists
2. Model `x_webinarregistrations` exists
3. Fields exist exactly as referenced:
   - `x_studio_vimeo_url`
   - `x_studio_vimeo_thumbnail_url`
   - `x_studio_followup_html`
   - `x_studio_linked_webinar`
   - `x_studio_recap_email_sent`
4. Method `x_webinar.send_recap_email` exists and accepts the called signature
5. Method internally restricts recipients to intended registrations for that webinar
6. Method marks sent status in a way consistent with `x_studio_recap_email_sent`

If any point fails, current module behavior is fail/error or logically inconsistent.

---

## 11) Direct answer to the concern

> “`x_webinar` is not standard Odoo; will mails fail or go to everyone?”

From this module’s code:

- Yes, `x_webinar` is treated as required custom model. If missing, recap send fails (no mail).
- “Send to everyone” is not implemented in Worker logic; recipient scope depends entirely on Odoo method `send_recap_email`.
- So the real risk is not in Worker recipient logic, but in Odoo custom method correctness and field alignment.

---

## 12) Conclusion

The recap feature is a custom Odoo-dependent integration, not a standard-model implementation. It is operationally safe only when Odoo custom model/method/fields match the names used in this module and `send_recap_email` is correctly scoped. The Worker itself uses webinar ID as a strict key and delegates recipient targeting to Odoo.
