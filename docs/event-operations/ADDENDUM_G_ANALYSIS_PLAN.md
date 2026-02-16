# ADDENDUM G – ANALYSIS PLAN (REVISION 2)

**Module:** Event Operations  
**Addendum:** G – Registrations Layer in Workspace Card  
**Date:** February 16, 2026  
**Status:** ANALYSIS REVISION 2 COMPLETE

---

## 1. Scope Definition

### 1.1 What Addendum G Changes

Addendum G extends the right-side workspace card from webinar detail only to a dual-level operational panel:

- Webinar detail context
- Registration operational context

Addendum G includes:

- Registration list for selected webinar
- Questions visibility per registration
- Contact creation indicator per registration
- Lead stage visibility per registration contact
- Attendance update operations that write to Odoo

### 1.2 What Remains Untouched

Addendum G does not alter:

- Core webinar publication logic
- Core webinar sync state computation logic
- Direct webinar-to-lead model relationship
- Existing Event Operations routing purpose outside registrations layer

### 1.3 UI-Only vs Functional Expansion

Addendum G is a functional expansion with UI impact. It adds cross-model retrieval behavior and attendance write-back behavior.

### 1.4 Explicit Decision Block

**Decision:** Addendum G scope is classified as **functional expansion**.  
**Scope impact:** Addendum G approval includes data retrieval policy, display policy, and attendance write policy in one approved scope.

---

## 2. Data Flow Analysis

### 2.1 Canonical Relation Path

Data path is fixed:

**Webinar → Registrations → Contact (res.partner) → Leads (crm.lead)**

Lead linkage remains contact-based.

### 2.2 Lead Resolution Semantics

Lead resolution follows deterministic rules.

#### 2.2.1 Active Lead Definition

A lead is **active** when all conditions are true:

1. Lead record is not archived (`active = true`)
2. Lead stage is not closed-won
3. Lead stage is not closed-lost

#### 2.2.2 Closed Stage Definition

Closed stages are classified by either of these criteria:

1. Stage flags indicate terminal outcome (won/lost)
2. Stage name indicates closed outcome (`won`, `lost`, `closed`) after normalized case comparison

#### 2.2.3 Selection Priority

For each registration contact, display lead is selected in this exact order:

1. All active leads for that contact
2. Sort active leads by `write_date` descending
3. If equal `write_date`, sort by `create_date` descending
4. If equal `create_date`, sort by `id` descending
5. Pick first record
6. If no active leads exist, repeat the same sorting sequence on non-archived closed leads
7. If no non-archived leads exist, repeat the same sorting sequence on archived leads
8. If no leads exist, display `No lead`

#### 2.2.4 Archiving Logic

Archived leads enter the final fallback tier only. Archived leads never override non-archived leads.

### 2.3 Edge-Case Resolution Rules

- Registration without partner reference: display `No contact`
- Partner exists and zero leads: display `No lead`
- Multiple leads with mixed states: apply deterministic priority sequence above
- Contact-created boolean true and no lead: display `Contact created, no lead`
- Contact-created boolean false and lead exists: display `Lead exists, contact flag not aligned`

### 2.4 Registration Volume Handling Strategy

Operational volume assumptions are fixed:

- Typical: 0–120 registrations per webinar
- High: 121–300 registrations per webinar
- Extreme: >300 registrations per webinar

Scaling policy is fixed:

1. Up to 120: full in-panel list load
2. 121–300: paginated load is mandatory
3. Above 300: paginated load plus list virtualization is mandatory

Lead lookup strategy is fixed:

- Lead retrieval is batched for the full visible registration set
- Per-row lead retrieval is forbidden

### 2.5 Explicit Decision Block

**Decision:** Lead resolution is deterministic and reproducible through explicit active/closed/archive tiers and strict tie-break ordering.  
**Decision:** Batched lead retrieval is mandatory.  
**Decision:** Pagination threshold starts at 121 registrations; virtualization is mandatory above 300.

---

## 3. Questions Field Rendering Strategy

### 3.1 Input Variability

`x_studio_webinar_questions` contains plain text and HTML.

### 3.2 Detection Rule

Questions content is classified as HTML only when markup tokens are present in valid structural form. All other content is classified as plain text.

### 3.3 Sanitization Rule

Any HTML-classified content is sanitized before render. Unsafe elements, unsafe attributes, and executable payload vectors are removed.

### 3.4 Plain Text Rule

Plain text is escaped and rendered as text-only with line-break preservation.

### 3.5 Rendering Model

Questions are rendered in compact preview mode by default with explicit expand action for full content.

### 3.6 Security Rule

Raw untrusted HTML injection is prohibited in all registration-question rendering paths.

### 3.7 Explicit Decision Block

**Decision:** Default render mode is compact preview with expand action.  
**Decision:** HTML sanitization is mandatory for any HTML-classified value.  
**Decision:** Plain text rendering remains escaped and non-interpreted.

---

## 4. Attendance Management Analysis

### 4.1 Current Attendance State

Attendance state is currently represented by `x_studio_webinar_attended` boolean per registration.

### 4.2 Audit Decision

Attendance audit fields are mandatory for Addendum G scope.

Mandatory attendance audit data includes:

- Last attendance update timestamp
- Last attendance update operator identity
- Last attendance update origin (`workspace_panel`)

### 4.3 Justification

Attendance directly affects operational reporting and post-event follow-up. Boolean-only state does not provide accountability. Auditability is required for operational integrity.

### 4.4 Sync Direction and Conflict Rule

- Odoo is source of truth
- Workspace writes attendance updates to Odoo
- Last-write-wins is the conflict rule
- Every write records audit metadata

### 4.5 Scope Impact Statement

Attendance audit requirements are part of Addendum G implementation scope and approval scope.

### 4.6 Explicit Decision Block

**Decision:** Option B is selected. Attendance audit fields are mandatory.  
**Decision:** Boolean-only attendance model is rejected.

---

## 5. UX Structural Impact

### 5.1 Mandatory Segmentation Model

Right-side panel structure is fixed to **tabs**.

Tab model:

1. `Webinar` tab: webinar-level details and actions
2. `Registrations` tab: registration list, questions preview, contact/lead indicators, attendance controls

### 5.2 Why Tabs

Tabs preserve a single stable panel frame while separating webinar-level and attendee-level cognitive contexts.

### 5.3 Why Not Alternatives

- Accordion is rejected because mixed expanded states increase scan friction in dense registration flows.
- Context switching via modal is rejected because attendance workflows require repeated row operations and persistent context.
- Split layout is rejected because Phase 8 workspace width is constrained and dense split columns reduce readability.

### 5.4 Phase 8 Usability Protection

Tabs preserve Phase 8 interaction rhythm:

- Calendar selection remains primary navigation
- Right panel remains stable
- Operators switch context explicitly instead of parsing mixed content blocks

### 5.5 Explicit Decision Block

**Decision:** Tab-based segmentation is mandatory.  
**Decision:** Accordion, modal context switching, and split layout are rejected for Addendum G.

---

## 6. Architectural Risks

### 6.1 CRM Coupling Risk

Contact-to-lead dependency introduces CRM data quality sensitivity in workspace rendering.

### 6.2 Performance Risk

Registration-heavy webinars increase retrieval and render cost. Batched lookup plus threshold-based pagination controls this risk.

### 6.3 Data Consistency Risk

Contact flags and lead reality can diverge. Deterministic display labels expose divergence explicitly.

### 6.4 Security Risk

Questions content includes untrusted markup. Sanitization policy removes executable vectors and blocks raw injection paths.

### 6.5 Scalability Risk

Registration growth degrades panel performance without thresholds. Mandatory pagination and virtualization policy enforces bounded rendering cost.

---

## 7. Recommended Architectural Direction

### 7.1 Option Decision

Selected direction: **Moderate CRM integration**.

### 7.2 Final Decision Set

1. Lead resolution uses deterministic active/closed/archive tiers and strict tie-break order.
2. Attendance audit fields are mandatory and in-scope.
3. Right panel segmentation is tab-based and mandatory.
4. Registration scaling uses fixed thresholds with mandatory pagination and virtualization gates.

### 7.3 Approval Statement

Addendum G Revision 2 analysis is architecturally decisive and ready for implementation approval.
