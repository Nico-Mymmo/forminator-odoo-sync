# CX Powerboard — Architecture Analysis v3

> **Deep Validation, Architectural Challenge & Alignment**

---

## Document Control

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Version       | v3 (final)                                     |
| Status        | **READY FOR IMPLEMENTATION**                   |
| Supersedes    | CX_POWERBOARD_ANALYSIS_V2.md                   |
| Date          | 2026-03                                        |
| Module code   | `cx_powerboard`                                |

### What Changed from v2

| # | Area | v2 Position | v3 Correction | Severity |
|---|------|-------------|---------------|----------|
| 1 | Sub-role architecture | "No changes to `users.role` enum"; `cx_powerboard_manager` treated as a separate concept | `cx_powerboard_manager` IS a `users.role` value in DB; must be added to CHECK constraint and to `admin/routes.js` in 3 places | **CRITICAL** |
| 2 | `odoo_uid` | Mentioned as assumed to exist | Confirmed absent from codebase (0 grep matches); must be explicitly added to `users` table via migration | **CRITICAL** |
| 3 | `cx_seen_activities` cleanup | Cleanup after 1-hour TTL | Cleanup only after win is confirmed in `cx_processed_wins` OR activity type has `is_win = false`; eliminates data loss on partial cron failure | HIGH |
| 4 | `cx_activity_mapping` RLS | Write access: `role IN ('admin', 'manager')` | `manager` is a global platform role, not a module role; correct write guard: `role IN ('admin', 'cx_powerboard_manager')` | HIGH |
| 5 | Platform integration checklist | Not enumerated | Explicitly lists all files requiring change before implementation can begin | MEDIUM |
| 6 | Concurrent cron overlap | Not addressed | Explicitly documented with idempotency guarantees and ON CONFLICT behavior | MEDIUM |
| 7 | Session query | Not addressed | `odoo_uid` is NOT in the session SELECT; cron uses service key and queries `users` directly | LOW (clarification) |

---

## 1. Executive Summary

CX Powerboard is a read-only analytics module for customer-experience teams that automatically surfaces high-priority Odoo activities and detects wins — completed high-value interactions — through a background cron job (poll-and-diff). There is no manual win recording.

The module fits cleanly into the Operations Manager platform's existing patterns: `module.js` → `routes.js` → `ui.js` → `services/` → `odoo-client.js`. A sub-role `cx_powerboard_manager` follows the same `users.role` storage pattern established by `mail-signature-designer` (which uses `marketing_signature`). The automated win detection uses Cloudflare Scheduled Triggers, which are natively supported but not yet configured in `wrangler.jsonc`.

**v3 verdict:** Architecture is sound. Five concrete implementation blockers must be resolved before dev begins. No fundamental flaws found in v2's cron logic or data model (with corrections applied above).

---

## 2. Architecture Validation

### 2.1 Module Pattern Fit

Every CX Powerboard component maps directly onto the established module pattern with no novel patterns required:

| Required Component     | Platform Pattern         | CX Powerboard Equivalent           | Status |
|------------------------|--------------------------|-------------------------------------|--------|
| Module descriptor      | `module.js`              | `cx_powerboard/module.js`           | ✅ standard |
| Route handler          | `routes.js`              | `cx_powerboard/routes.js`           | ✅ standard |
| Server-side rendering  | `ui.js`                  | `cx_powerboard/ui.js`               | ✅ standard |
| Odoo integration       | `odoo-client.js`         | `cx_powerboard/odoo-client.js`      | ✅ standard |
| Business logic         | `services/`              | `cx_powerboard/services/`           | ✅ standard |
| KV caching             | `env.MAPPINGS_KV`        | Mapping table cache (5-min TTL)     | ✅ already bound |
| Scheduled processing   | Cloudflare cron triggers | Win detection cron (`*/15 * * * *`) | ⚠️ needs wrangler.jsonc update |
| Sub-role               | `users.role` value       | `cx_powerboard_manager`             | ⚠️ needs DB migration + admin/routes.js |

### 2.2 Sub-Role System — Critical Correction

**v2 was wrong.** This section documents how sub-roles actually work in the platform and what v3 requires.

#### How sub-roles work (actual implementation)

The platform does NOT have a separate sub-role table or a `hasModuleSubRoleAccess()` utility. Sub-roles are values stored directly in the `users.role` column.

Evidence from `src/modules/mail-signature-designer/module.js`:
```js
subRoles: ['user', 'marketing_signature', 'admin'],
```

`subRoles` is a **documentation array** in the module descriptor. It has no runtime effect. The actual enforcement lives in the route handler:

```js
// src/modules/mail-signature-designer/routes.js
function hasMarketingRole(context) {
  const { user } = context;
  return user?.role === 'admin' || user?.role === 'marketing_signature';
}
```

`marketing_signature` is not a concept in a separate table — it is a literal value stored in `users.role`.

#### Consequence for `admin/routes.js`

`admin/routes.js` hard-codes the valid role enum in **exactly 3 places**:

| Line | Function | Code |
|------|----------|------|
| 114  | `handleCreateUser`   | `if (!['admin', 'manager', 'user', 'marketing_signature'].includes(role))` |
| 211  | `handleUpdateUserRole` | `if (!['admin', 'manager', 'user', 'marketing_signature'].includes(role))` |
| 444  | `handleCreateInvite` | `if (!['admin', 'manager', 'user', 'marketing_signature'].includes(role))` |

All three must be updated to include `'cx_powerboard_manager'`.

#### Auto-grant pattern

When `handleUpdateUserRole` sets a user to `marketing_signature`, it automatically grants `mail_signature_designer` module access:

```js
// src/modules/admin/routes.js (lines 239–251)
if (role === 'marketing_signature') {
  const { data: module } = await supabase
    .from('modules')
    .select('id')
    .eq('code', 'mail_signature_designer')
    .single();

  if (module?.id) {
    await supabase
      .from('user_modules')
      .upsert(
        { user_id: userId, module_id: module.id, is_enabled: true, granted_by: userId },
        { onConflict: 'user_id,module_id' }
      );
  }
}
```

The same pattern must be implemented for `cx_powerboard_manager` → auto-grant `cx_powerboard`.

#### CX Powerboard sub-role specification

```
Role value:     cx_powerboard_manager
Stored in:      users.role (varchar)
Module access:  cx_powerboard (auto-granted on role assignment)
Permissions:    - Configure cx_activity_mapping (add/edit/delete win types)
                - View team dashboard (all users' activity queues)
                - View all wins in cx_processed_wins
                - Assign odoo_uid to users (delegated from admin? — see ADR-3)
Regular user:   Can only see their own activity queue and their own wins
Admin:          Has all cx_powerboard_manager permissions implicitly
```

### 2.3 `odoo_uid` — Confirmed Missing

Grep across the entire codebase returns **zero matches** for `odoo_uid`. The column does not exist in the `users` table. It must be added via migration.

**Impact surface:**
- The cron job uses `odoo_uid` to build the Odoo user ID filter for `mail.activity` queries
- The dashboard uses `odoo_uid` to scope the activity display to the logged-in user
- Session validation (`src/lib/auth/session.js`) does NOT select `odoo_uid` — the cron job queries `users` directly using the service key, so this is not a session change

**Required migration:**
```sql
ALTER TABLE users
  ADD COLUMN odoo_uid INTEGER UNIQUE;
```

**Handling missing `odoo_uid`:**
- Dashboard load: if `user.odoo_uid IS NULL`, render a clear "Odoo account not linked — contact your admin" message and halt
- Cron job: skip users with `odoo_uid IS NULL`; log a warning per skipped user; never crash

### 2.4 Platform Integration Changes Required (Implementation Blockers)

These are concrete file changes required before any CX Powerboard code is functional. They are not module-internal changes — they are platform-level changes.

| # | File | Change Required | Impact |
|---|------|-----------------|--------|
| B1 | Supabase migration (new) | Add `cx_powerboard_manager` to `users.role` CHECK constraint; add `odoo_uid INTEGER UNIQUE` to `users` | Role validation in DB; cron attribution |
| B2 | `src/modules/admin/routes.js` | Add `'cx_powerboard_manager'` to role list at lines 114, 211, 444; add auto-grant block for `cx_powerboard` | Admin UI can assign the new role |
| B3 | `wrangler.jsonc` | Add `triggers: { crons: ["*/15 * * * *"] }` | Cron job fires |
| B4 | `src/index.js` / scheduler handler | Register `handleCxWinDetection` cron handler in the `scheduled` export | Cron runs the correct function |
| B5 | `src/modules/registry.js` | Register `cx_powerboard` module descriptor | Module is discoverable by the platform |

---

## 3. Functional Overview

### 3.1 Core Purpose

A lightweight, real-time dashboard surfacing each CX team member's Odoo activity queue, ordered by priority weight, with automated win detection. No forms, no data entry. Read-and-react.

### 3.2 User Stories

| Role | Story | Acceptance Criteria |
|------|-------|---------------------|
| CX Rep (user) | See my open Odoo activities ranked by priority | Activities sorted by priority_weight DESC, then deadline ASC |
| CX Rep (user) | Know when I've scored a win | Win appears in "Recent Wins" panel within 15 min of Odoo completion |
| CX Manager (cx_powerboard_manager) | See my whole team's queue at a glance | Team view shows all users with cx_powerboard access |
| CX Manager | Configure which activity types count as wins | CRUD on cx_activity_mapping table |
| CX Manager | Set priority weights for activity types | Edit priority_weight on cx_activity_mapping rows |
| Admin | Link a platform user to their Odoo account | Set odoo_uid on a users row |

### 3.3 Out of Scope (MVP)

- Manual win recording
- Win undo / disputes
- Leaderboard / gamification
- Webhook-based instant updates (Odoo does not support outbound webhooks)
- Historical trend analysis
- Notification/email on win detection

---

## 4. Data Model

### 4.1 `cx_activity_mapping`

Source of truth for which Odoo activity types are tracked and which are wins.

```sql
CREATE TABLE cx_activity_mapping (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_type_id   INTEGER     NOT NULL UNIQUE,
  odoo_activity_type_name TEXT        NOT NULL,
  priority_weight         INTEGER     NOT NULL DEFAULT 1
                            CHECK (priority_weight BETWEEN 1 AND 10),
  is_win                  BOOLEAN     NOT NULL DEFAULT false,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cam_type_id ON cx_activity_mapping (odoo_activity_type_id);
```

**RLS policies:**

```sql
-- Any authenticated platform user with cx_powerboard module can read
CREATE POLICY "cx_map_select" ON cx_activity_mapping
  FOR SELECT USING (true);
  -- (Worker enforces module access at the application layer;
  --  RLS is defense-in-depth for direct DB access)

-- Only admin or cx_powerboard_manager can write
-- (Note: 'manager' is a global role, NOT a module role — do not use it here)
CREATE POLICY "cx_map_write" ON cx_activity_mapping
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb ->> 'role'
      IN ('admin', 'cx_powerboard_manager')
  );
```

> **Note on RLS vs. Worker:** The platform uses a service role key in the Worker, which bypasses RLS entirely. RLS policies are a safety net for direct Supabase Studio access and future SDK consumers. Primary enforcement is the Worker route guard.

### 4.2 `cx_seen_activities`

Running log of open Odoo activities currently being tracked. Acts as the "previous state" for the poll-and-diff mechanism.

```sql
CREATE TABLE cx_seen_activities (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_id     INTEGER     NOT NULL UNIQUE,
  odoo_user_id         INTEGER     NOT NULL,
  platform_user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  activity_type_id     INTEGER     NOT NULL,
  activity_type_name   TEXT        NOT NULL,
  odoo_deadline        DATE,
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_csa_odoo_activity_id ON cx_seen_activities (odoo_activity_id);
CREATE INDEX idx_csa_platform_user    ON cx_seen_activities (platform_user_id);
```

**Attribution note:** `platform_user_id` is resolved at **first-seen time** by matching `users.odoo_uid = odoo_user_id`. If an activity is reassigned in Odoo after first-seen, the win will be attributed to the original user. This is a known MVP limitation (see Edge Case EC-3).

### 4.3 `cx_processed_wins`

Immutable ledger of detected wins. Once inserted, records are never updated.

```sql
CREATE TABLE cx_processed_wins (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_id     INTEGER     NOT NULL UNIQUE,   -- idempotency key
  platform_user_id     UUID        NOT NULL REFERENCES users(id),
  activity_type_id     INTEGER     NOT NULL,
  activity_type_name   TEXT        NOT NULL,
  priority_weight      INTEGER     NOT NULL,
  won_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  cron_run_id          TEXT        NOT NULL            -- ISO timestamp of the cron execution
);

CREATE INDEX idx_cpw_platform_user ON cx_processed_wins (platform_user_id, won_at DESC);
CREATE INDEX idx_cpw_odoo_id       ON cx_processed_wins (odoo_activity_id);
```

The `UNIQUE` constraint on `odoo_activity_id` is the primary idempotency mechanism. Concurrent cron runs that attempt to insert the same win will result in one success and one `ON CONFLICT DO NOTHING` — no double-counting, no error.

### 4.4 `users` table changes

```sql
-- Add Odoo user ID linkage
ALTER TABLE users
  ADD COLUMN odoo_uid INTEGER UNIQUE;

-- Extend role CHECK constraint to include the new sub-role
-- (exact syntax depends on whether a named constraint exists)
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'manager', 'user', 'marketing_signature', 'cx_powerboard_manager'));
```

### 4.5 Migration file summary

One migration file covers all CX Powerboard data model changes:

```
supabase/migrations/YYYYMMDDHHMMSS_cx_powerboard_init.sql
```

Contents:
1. `ALTER TABLE users ADD COLUMN odoo_uid INTEGER UNIQUE`
2. Role CHECK constraint update
3. `CREATE TABLE cx_activity_mapping`
4. `CREATE TABLE cx_seen_activities`
5. `CREATE TABLE cx_processed_wins`
6. All indexes
7. RLS ENABLE + policies
8. `INSERT INTO modules (code, name, …) VALUES ('cx_powerboard', …)`

---

## 5. Cron Job — Win Detection

### 5.1 Execution Flow

The cron job fires every 15 minutes via Cloudflare Scheduled Trigger. It is stateless and must be fully idempotent.

```
T+0:00  Cron fires  
T+0:01  Load cx_activity_mapping from KV cache (key: "cx_activity_mapping")  
        → If cache miss or TTL expired (>5 min): fetch from Supabase, update KV  
        → Build two lookup structures:  
             typeMap: { [odoo_activity_type_id]: { priority_weight, is_win } }  
             winTypeIds: Set of type_ids where is_win=true  

T+0:02  Fetch all users with odoo_uid IS NOT NULL from Supabase  
        → Build: odooUidSet = Set of odoo_uid values  
        → Build: uidToUser: { [odoo_uid]: { id, odoo_uid } }  

T+0:03  Query Odoo mail.activity:  
          domain: [['user_id', 'in', [...odooUidSet]], ['active', '=', true]]  
          fields: ['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model']  
          limit: 1000  
        → Build: odooActiveSet = Set of Odoo activity IDs from result  
        → Throttle: single call via executeKw (200ms platform throttle applies)  

T+0:05  Query cx_seen_activities for all existing records  
        → Build: seenMap: { [odoo_activity_id]: { platform_user_id, activity_type_id, … } }  
        → Build: seenSet = Set of odoo_activity_ids  

T+0:05  Compute diffs:  
          newActivities    = odooActiveSet  \ seenSet   (in Odoo, not seen yet)  
          goneActivities   = seenSet        \ odooActiveSet  (in seen, not in Odoo anymore)  

T+0:06  Process new activities:  
          For each odoo_activity_id in newActivities:  
            - Look up odoo user_id from Odoo result  
            - Resolve platform_user_id via uidToUser[odoo_user_id]  
            - If resolution fails: log warning, skip (no orphaned records)  
            - UPSERT into cx_seen_activities (on conflict: update last_seen_at)  

T+0:07  Process gone activities (the win detection path):  
          For each odoo_activity_id in goneActivities:  
            seen = seenMap[odoo_activity_id]  
            typeInfo = typeMap[seen.activity_type_id]  
            
            If typeInfo exists AND typeInfo.is_win = true:  
              a. INSERT INTO cx_processed_wins  
                   (odoo_activity_id, platform_user_id, activity_type_id,  
                    activity_type_name, priority_weight, won_at, cron_run_id)  
                 ON CONFLICT (odoo_activity_id) DO NOTHING  
              b. If insert succeeded OR conflict already existed:  
                 DELETE FROM cx_seen_activities WHERE odoo_activity_id = X  
            Else:  
              DELETE FROM cx_seen_activities WHERE odoo_activity_id = X  

T+0:08  Log summary: { added, wins_detected, non_win_purged, errors, cron_run_id }  
```

### 5.2 Idempotency Guarantees

| Scenario | Mechanism | Outcome |
|----------|-----------|---------|
| Two cron runs overlap, both detect same win | `UNIQUE (odoo_activity_id)` on cx_processed_wins + `ON CONFLICT DO NOTHING` | Exactly one win recorded |
| Cron crashes after win INSERT but before cx_seen_activities DELETE | Next run: activity still in seenSet, not in odooActiveSet → tries INSERT again → conflict → proceeds to DELETE | Correct; no duplicate |
| Cron crashes before any write | No partial state written; next run reruns from scratch | Safe |
| cx_seen_activities UPSERT for same new activity fires twice | `ON CONFLICT (odoo_activity_id) DO UPDATE SET last_seen_at = now()` | Idempotent |

### 5.3 Cleanup Rule (Corrected from v2)

v2 proposed a 1-hour TTL for `cx_seen_activities` entries. **This is rejected.**

**Problem:** If a cron run fails before writing to `cx_processed_wins`, a TTL-based cleanup on the next run would delete the seen record before the win is recorded. The win would be silently lost.

**Replacement rule:** An entry in `cx_seen_activities` is deleted **if and only if** the activity is no longer present in Odoo AND one of:
- `is_win = false` for that activity type (nothing to record; delete immediately), or
- The INSERT into `cx_processed_wins` succeeded or the record was already there (conflict)

This is naturally enforced by the cron logic in Section 5.1. There is no TTL. Records are cleaned up at the moment the activity disappears from Odoo and its fate is determined.

### 5.4 Odoo Query Strategy

**Single batched query** — not one query per user. The `user_id IN [...]` domain filter handles all users in one round-trip.

```js
// src/modules/cx_powerboard/odoo-client.js
export async function fetchActiveActivities(env, odooUids) {
  return searchRead(env, 'mail.activity', [
    ['user_id', 'in', odooUids],
    ['active', '=', true],
  ], ['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model']);
}
```

The filter `['user_id', 'in', odooUids]` is always injected by this helper — it cannot be omitted. This is the structural mitigation for the shared API key risk (see Section 6.4).

**Scale concern:** At 100 users × average 20 activities = 2,000 records per fetch. Well within Odoo's read limits. If a team exceeds ~500 users, revisit with pagination or a dedicated Odoo domain filter per batch.

---

## 6. Security & Authorization

### 6.1 Defense-in-Depth Layers

```
Request
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1 — Cloudflare Worker (session validation)           │
│  validateSession() → user object or 401                    │
│  Checks: session token valid, user.is_active = true        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2 — Route guard (module + role)                      │
│  hasModuleAccess(user, 'cx_powerboard')                    │
│                         → 403 if not in user.modules       │
│  hasManagerAccess(user)                                     │
│   = user.role === 'admin' || user.role === 'cx_powerboard_manager'  │
│                         → 403 for protected routes         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3 — Data scoping (application layer)                 │
│  All user-facing queries include WHERE platform_user_id = userId  │
│  All team-facing queries include JOIN to verify module access      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4 — Supabase RLS (defense-in-depth only)             │
│  Not the primary enforcement; catches direct DB access     │
│  (Service key in Worker bypasses RLS at runtime)           │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Authorization Flow Matrix

| Action | Session Required | Module Access | Role Required | Data Scope |
|--------|-----------------|---------------|---------------|------------|
| View own dashboard | ✅ | cx_powerboard | any | Records where `platform_user_id = session.user.id` |
| View team dashboard | ✅ | cx_powerboard | `cx_powerboard_manager` or `admin` | All users with cx_powerboard module |
| Read cx_activity_mapping | ✅ | cx_powerboard | any | All rows |
| Write cx_activity_mapping | ✅ | cx_powerboard | `cx_powerboard_manager` or `admin` | All rows |
| View own win history | ✅ | cx_powerboard | any | `platform_user_id = session.user.id` |
| View all wins (team) | ✅ | cx_powerboard | `cx_powerboard_manager` or `admin` | All rows |
| Cron win detection | ❌ (no session) | — | Service role key | All users with `odoo_uid IS NOT NULL` |
| Set user's `odoo_uid` | ✅ | — | `admin` only | Admin: any user |

### 6.3 Route Guard Implementation Pattern

```js
// src/modules/cx_powerboard/routes.js

function requireCxAccess(context) {
  const { user } = context;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const hasAccess = user.modules?.some(m => m.module?.code === 'cx_powerboard' && m.is_enabled);
  if (!hasAccess) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  return null; // proceed
}

function requireCxManagerAccess(context) {
  const noAccess = requireCxAccess(context);
  if (noAccess) return noAccess;
  const { user } = context;
  if (user.role !== 'admin' && user.role !== 'cx_powerboard_manager') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return null; // proceed
}
```

These follow the exact same pattern as `hasMarketingRole` in `mail-signature-designer/routes.js`.

### 6.4 Odoo API Key Risk

**Risk:** The platform uses a single shared Odoo API key (service credentials in `env`). This key can query any Odoo data. If a bug causes a user to see another user's activities, it is not blocked at the Odoo layer.

**Mitigation — structural:** All Odoo queries go through helper functions in `odoo-client.js` that always inject the `user_id IN [...]` filter. No raw `searchRead` calls from route handlers. This makes the scope boundary visible and auditable.

**Mitigation — operational:** The cron job is the only code that queries across all users intentionally. It is a background process with no output rendered to any user. Results are written to `cx_processed_wins` with explicit `platform_user_id` attribution.

**Accepted risk:** A bug in `odoo-client.js` or a logic error in the `user_id` filter could expose cross-user data. This is the same risk profile as every other Odoo-integrated module on the platform. It is accepted at the platform architecture level, not specific to CX Powerboard.

### 6.5 XSS Prevention

Activity type names fetched from Odoo are stored in `cx_activity_mapping.odoo_activity_type_name` and rendered in the SSR dashboard. These strings must be HTML-escaped before insertion into the template:

```js
// In ui.js — ALL Odoo-sourced strings must go through escapeHtml()
const safeName = escapeHtml(activity.activity_type_name);
```

Never use: `innerHTML = activity.activity_type_name`  
Always use: `textContent` or `escapeHtml()` + template string

---

## 7. UI & SSR

### 7.1 Page Structure

The dashboard renders server-side via `ui.js`, following the platform's SSR pattern. No client-side frameworks. Minimal JS for panel toggling.

```
/cx-powerboard                  → My Dashboard (all users)
/cx-powerboard/team             → Team View (cx_powerboard_manager, admin)
/cx-powerboard/settings         → Mapping Config (cx_powerboard_manager, admin)
/cx-powerboard/wins             → Win History (own; team for managers)
```

### 7.2 My Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│ CX Powerboard                          [Team View →] │
├──────────────────────────────────────────────────────┤
│ OPEN ACTIVITIES                                      │
│  ●●● Call back: Acme Corp        Due: Today  P:8     │
│  ●●○ Email follow-up: Beta Ltd   Due: +2d    P:5     │
│  ●○○ Contract review: Gamma AS   Due: +5d    P:3     │
├──────────────────────────────────────────────────────┤
│ RECENT WINS (last 30 days)      [All wins →]         │
│  🏆 Phone Demo: Acme Corp       Won: 2h ago  P:9     │
│  🏆 Signed Proposal: Delta Inc  Won: Yesterday P:8   │
└──────────────────────────────────────────────────────┘
```

### 7.3 `odoo_uid` Not Set — Error State

```
┌──────────────────────────────────────────────────────┐
│ CX Powerboard                                        │
├──────────────────────────────────────────────────────┤
│ ⚠️ Your Odoo account is not linked.                  │
│ Contact your administrator to connect your account.  │
│ [Request access →]                                   │
└──────────────────────────────────────────────────────┘
```

This is the full page content when `user.odoo_uid IS NULL`. No activities shown, no confusing empty states.

### 7.4 Priority Display

Activities are sorted `priority_weight DESC, deadline ASC`. Priority is not shown as a raw number — it is visualised as filled dots (●●○) or a badge class.

---

## 8. Priority Scoring

### 8.1 Configuration

Priority weights are stored in `cx_activity_mapping.priority_weight` (1–10). They are set by the CX manager via the Settings UI. The cron job reads weights at the time it processes a disappeared activity, not at first-seen time.

### 8.2 Sort Order

When a user's dashboard is loaded, their activities are fetched from Odoo in real-time (not from `cx_seen_activities`). `cx_seen_activities` is purely a diff table for the cron job.

```
Sort: JOIN cx_activity_mapping ON activity_type_id
      ORDER BY priority_weight DESC, date_deadline ASC NULLS LAST
```

This means the live dashboard always reflects the current priority configuration. If a CX manager raises the weight of "Phone Demo," all users' dashboards re-sort immediately on next load.

### 8.3 Mapping Cache

Activity mapping is cached in KV (`env.MAPPINGS_KV`, key: `cx_activity_mapping_cache`):
- **TTL:** 5 minutes
- **Used by:** cron job (to avoid a DB round-trip every 15 min), Settings UI read endpoint
- **Invalidated by:** any write to `cx_activity_mapping` (explicit cache bust on POST/PUT/DELETE to settings API)

---

## 9. Edge Cases

### EC-1: Activity Type Not in Mapping

An Odoo activity with a type that has no entry in `cx_activity_mapping` is:
- Displayed in the dashboard with a default priority weight of 0 (appears last in sort)
- NOT recorded as a win when it disappears
- Tracked in `cx_seen_activities` as normal (for consistency)
- Never inserted into `cx_processed_wins`

CX manager should be prompted (via Settings UI) to add unmapped types.

### EC-2: `odoo_uid` Not Set

- **Dashboard:** Hard error state (Section 7.3) — no activities rendered
- **Cron job:** User is excluded from the Odoo query batch; no `cx_seen_activities` records are created for this user; skipped silently with warning log
- **Win history:** Empty (no records for this user in `cx_processed_wins`)

### EC-3: Activity Reassigned in Odoo

If activity `#1234` is assigned to User A (first_seen in `cx_seen_activities` with  `platform_user_id = A`), then reassigned in Odoo to User B before completion:

- The cron still sees `#1234` in the Odoo result set (active)
- `cx_seen_activities.last_seen_at` is updated on each cron run
- When `#1234` completes (disappears from Odoo), the win is attributed to User A (the first-seen user)

**MVP decision: accepted.** The wrong user gets credit for a reassigned win. Probability is low in normal operations. Mitigation path: add a `last_seen_user_id` column to `cx_seen_activities` and update it each cron run; attribute win to `last_seen_user_id` instead of `platform_user_id`. Deferred to v2 of the module.

### EC-4: Activity Type Changes for an Open Activity

If activity `#1234` had type "Email" (is_win=false, weight=2) when first seen, and the user changes the type in Odoo to "Phone Demo" (is_win=true, weight=9) before closing it:

- `cx_seen_activities.activity_type_id` still holds the original type
- When the activity disappears, the cron looks up the CURRENT `cx_activity_mapping` by the stored `activity_type_id`
- It would classify this as a non-win (using the old type), so no win is recorded

**MVP decision: accepted.** Mid-activity type changes are rare in practice. The `last_seen_at` update mechanism could be extended to also update `activity_type_id` — deferred to v2.

### EC-5: Odoo API Unavailable During Cron

- Cron logs the error with cron_run_id
- No state is written (no deletions from `cx_seen_activities`)
- `cx_seen_activities` retains all previous entries — consistent with "last known state"
- Next cron run runs the full diff against fresh Odoo data
- Activities that completed during the downtime window are detected in the next successful run — at most 15 minutes late

### EC-6: Concurrent Cron Runs (Cloudflare)

Cloudflare Scheduled Triggers can fire overlapping events under certain conditions (deployment, zone failover). Two concurrent runs are safe due to:
- `cx_processed_wins`: `ON CONFLICT (odoo_activity_id) DO NOTHING` — exactly one insert succeeds
- `cx_seen_activities` new inserts: `ON CONFLICT (odoo_activity_id) DO UPDATE SET last_seen_at = now()` — idempotent
- `cx_seen_activities` deletes: If both runs try to DELETE the same row, the second DELETE affects 0 rows — not an error

**Result:** Double execution produces the same final state as single execution.

### EC-7: Large Team (Odoo Query Volume)

At 100+ users × average 25 open activities = 2,500 records per Odoo fetch. Odoo's default `mail.activity` read limit is typically 80–100 records per call. The fetch must use pagination or a high explicit limit:

```js
// Must pass an explicit limit to avoid Odoo's default pagination cutting results
searchRead(env, 'mail.activity', domain, fields, { limit: 10000 })
```

At 500 users × 25 activities = 12,500 — still within a single Odoo call. Revisit at 1,000+ users with batched calls by user_id chunk.

---

## 10. Architecture Decision Records

### ADR-1: Automated Win Detection via Poll-and-Diff

**Decision:** KEEP  
**Rationale:** Odoo does not support outbound webhooks. Manual win recording introduces human error and gaming risk. Poll-and-diff is the only viable pattern that maintains data integrity without Odoo customisation.  
**Trade-off:** 15-minute latency for win detection.

### ADR-2: KV Cache for Activity Mapping

**Decision:** KEEP  
**Rationale:** `env.MAPPINGS_KV` is already bound in `wrangler.jsonc`. Caching avoids a Supabase round-trip on every cron run. 5-minute TTL is appropriate — mapping changes are infrequent and a 5-minute propagation delay is acceptable.  
**Constraint:** Cache must be explicitly busted on every write to `cx_activity_mapping`.

### ADR-3: `cx_powerboard_manager` as `users.role` Value

**Decision:** ADJUST (corrects v2)  
**Rationale:** The platform stores sub-roles in `users.role`, not in a separate table. This pattern is established by `mail-signature-designer` (`marketing_signature`). Following it ensures `admin/routes.js` validation, auto-grant, and role-based route guards all work identically.  
**Implementation:** Add to CHECK constraint, add to 3 locations in `admin/routes.js`, implement auto-grant on role assignment.

### ADR-4: `odoo_uid` as a Required Linkage Field

**Decision:** ADJUST (corrects v2 omission)  
**Rationale:** The cron job cannot attribute wins without knowing which platform user maps to which Odoo user. The field does not exist in the current schema and must be added. It is optional in the DB (nullable) but functionally required for the dashboard to be usable.  
**Who sets it:** Admin only, via the admin panel's user management interface (set `odoo_uid` on the user record).

### ADR-5: Single Shared Odoo API Credential

**Decision:** KEEP (accepted risk)  
**Rationale:** The platform uses a single service-level Odoo credential for all modules. Changing this is out of scope for CX Powerboard. Risk is mitigated by always injecting `user_id IN [...]` filter via the `odoo-client.js` helper — never pass a raw Odoo search to a route handler.

### ADR-6: Cron Frequency — 15 Minutes

**Decision:** KEEP  
**Rationale:** Balances win detection latency (acceptable: max 15 min) against Odoo API load. Odoo JSON-RPC is synchronous and rate-sensitive; every 15 minutes is conservative and safe.  
**Future:** If real-time feedback becomes required, explore Odoo's `bus.bus` message bus as a polling target (still not webhooks, but higher frequency).

### ADR-7: No TTL Cleanup for `cx_seen_activities`

**Decision:** ADJUST (removes v2's 1-hour TTL)  
**Rationale:** TTL-based cleanup risks deleting records before the win is recorded, silently losing wins if a cron run fails mid-execution. The cleanup must be event-driven: delete only when the activity leaves Odoo and its fate is determined.

### ADR-8: No Manual Win Recording

**Decision:** KEEP  
**Rationale:** The module's purpose is objective measurement. Manual entry would allow gaming, requires a UI form, and adds moderation complexity. Automated detection is the design invariant.

---

## 11. Risks & Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | `odoo_uid` not configured for a user | Medium (initial rollout) | Medium — user cannot use dashboard | Hard error state in UI; admin prompted via users list |
| R2 | Win attributed to wrong user (activity reassigned) | Low | Low | Logged in cron; documented MVP limitation; fix in v2 of module |
| R3 | Odoo API unavailable during cron window | Low | Low | Cron exits cleanly; next run catches up; no data loss |
| R4 | Concurrent cron executions | Low | Low | Idempotent design; UNIQUE constraints prevent double-counting |
| R5 | Activity type name changed in Odoo (mapping drift) | Medium | Medium | Settings UI shows live Odoo type names; manager manually reviews mapping |
| R6 | `cx_powerboard_manager` confused with global `manager` role | Medium (admin confusion) | Low | UI label: "CX Powerboard Manager"; tooltip clarifies scope |
| R7 | XSS via Odoo activity data | Low | High | All Odoo strings go through `escapeHtml()` in `ui.js`; never `innerHTML` |
| R8 | Odoo query returns >10,000 activities | Very low (MVP) | Medium | Add explicit `limit: 10000` param; add pagination warning log |
| R9 | `wrangler.jsonc` cron trigger not added before deploy | High (human error) | High (cron never fires) | B3 is a numbered implementation blocker; add to deployment checklist |
| R10 | KV cache not busted after mapping update | Medium | Medium | `cx_powerboard/services/mapping-service.js` must call `env.MAPPINGS_KV.delete(key)` on every write; unit-test this |

---

## 12. Implementation File Map

### New files (CX Powerboard module)

```
src/modules/cx_powerboard/
  module.js                    — Module descriptor; subRoles includes cx_powerboard_manager
  routes.js                    — Route handlers; requireCxAccess, requireCxManagerAccess
  ui.js                        — SSR dashboard, team view, settings, win history
  odoo-client.js               — fetchActiveActivities(env, odooUids)
  services/
    mapping-service.js         — CRUD for cx_activity_mapping; KV cache management
    win-service.js             — Query cx_processed_wins; team and personal views
  cron/
    win-detection.js           — handleCxWinDetection(env): full poll-and-diff execution
supabase/migrations/
  YYYYMMDDHHMMSS_cx_powerboard_init.sql
```

### Modified files (platform-level blockers)

```
wrangler.jsonc                        — Add cron trigger: */15 * * * *
src/index.js                          — Register scheduled handler
src/modules/registry.js               — Register cx_powerboard module
src/modules/admin/routes.js           — Add cx_powerboard_manager to role list (3 locations)
                                        Add auto-grant block for cx_powerboard
```

### `module.js` specification

```js
export const module = {
  code: 'cx_powerboard',
  name: 'CX Powerboard',
  description: 'Activity queue, priority scoring, and automated win detection for CX teams.',
  route: '/cx-powerboard',
  icon: 'trophy',
  display_order: 40,
  subRoles: ['user', 'cx_powerboard_manager', 'admin'],
  // subRoles is documentation only; enforcement via user.role in routes.js
};
```

---

## 13. Go / No-Go Assessment

### ✅ Go Conditions (All Met)

| Condition | Evidence |
|-----------|----------|
| Module pattern is established | mail-signature-designer, crm-leads, mail-sync all follow same pattern |
| Cloudflare Scheduled Triggers available | Platform is a Cloudflare Worker; wrangler supports `triggers.crons` |
| KV namespace already bound | `MAPPINGS_KV` in `wrangler.jsonc` |
| Odoo API client available | `src/lib/odoo.js`: executeKw, searchRead, etc. |
| Sub-role pattern established | mail-signature-designer uses marketing_signature in users.role |
| Supabase service key can write | All modules use service key for writes |
| No new infrastructure required | Same Supabase, same Cloudflare Worker, same Odoo connection |

### ❌ Implementation Blockers (Must Resolve First)

| Blocker | File | Action |
|---------|------|--------|
| B1 | New migration file | Create tables + extend users.role CHECK + add odoo_uid |
| B2 | `src/modules/admin/routes.js` | Add cx_powerboard_manager to 3 role lists + auto-grant block |
| B3 | `wrangler.jsonc` | Add cron trigger `*/15 * * * *` |
| B4 | `src/index.js` | Register `scheduled` export handler for win detection |
| B5 | `src/modules/registry.js` | Register cx_powerboard module descriptor |

None of these blockers are architectural unknowns. All follow established platform patterns with clear precedents.

---

## Appendix A: Key Odoo API Calls

### Fetch all active activities for known platform users

```js
const activities = await searchRead(
  env,
  'mail.activity',
  [
    ['user_id', 'in', odooUids],   // always scoped — never omit this filter
    ['active', '=', true],
  ],
  ['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model', 'res_name'],
  { limit: 10000 }
);
```

### Fetch activity types (for mapping setup in Settings UI)

```js
const activityTypes = await searchRead(
  env,
  'mail.activity.type',
  [],
  ['id', 'name', 'icon', 'decoration_type']
);
```

### Resolve Odoo user by email (for initial `odoo_uid` assignment)

```js
const odooUsers = await searchRead(
  env,
  'res.users',
  [['login', '=', email]],
  ['id', 'name', 'login']
);
```

---

## Appendix B: Database Schema Summary

```
users (modified)
  + odoo_uid    INTEGER UNIQUE
  ~ role CHECK: + 'cx_powerboard_manager'

cx_activity_mapping
  id                      UUID PK
  odoo_activity_type_id   INTEGER UNIQUE NOT NULL
  odoo_activity_type_name TEXT NOT NULL
  priority_weight         INTEGER 1–10
  is_win                  BOOLEAN
  notes                   TEXT
  created_at / updated_at TIMESTAMPTZ

cx_seen_activities
  id                  UUID PK
  odoo_activity_id    INTEGER UNIQUE NOT NULL
  odoo_user_id        INTEGER NOT NULL
  platform_user_id    UUID → users.id
  activity_type_id    INTEGER
  activity_type_name  TEXT
  odoo_deadline       DATE
  first_seen_at       TIMESTAMPTZ
  last_seen_at        TIMESTAMPTZ

cx_processed_wins
  id                  UUID PK
  odoo_activity_id    INTEGER UNIQUE NOT NULL    ← idempotency key
  platform_user_id    UUID NOT NULL → users.id
  activity_type_id    INTEGER
  activity_type_name  TEXT
  priority_weight     INTEGER
  won_at              TIMESTAMPTZ
  cron_run_id         TEXT
```

---

## 14. Integration Analysis

> This section validates CX Powerboard against the **live, existing codebase** — not assumptions. Every finding below is derived from reading actual source files.

---

### 14.1 Module Placement

#### Confirmed folder structure pattern

Three reference modules were inspected:

| Module | Flat files | `routes.js` separated | `services/` | `lib/` | `odoo-client.js` |
|--------|-----------|----------------------|-------------|--------|------------------|
| Project Generator | ✅ (all flat) | ❌ (inline in module.js) | ❌ | ❌ | `odoo-creator.js` |
| Event Operations | ❌ | ✅ (`routes.js` + `routes/`) | ✅ | ✅ | ✅ |
| Sales Insight Explorer | ❌ | ✅ (`routes.js`) | ❌ | ✅ (deep) | ❌ (imports direct from `src/lib/odoo.js`) |

CX Powerboard is a service-oriented multi-page module with multiple API sub-routes and a background cron job. It maps to the **Event Operations pattern**: `routes.js` + `services/` + `odoo-client.js`.

#### Correct folder structure (adjusted)

```
src/modules/cx_powerboard/
  module.js
  routes.js
  ui.js
  odoo-client.js
  services/
    mapping-service.js
    win-service.js
  cron/
    win-detection.js
```

**Naming conventions confirmed:**
- Module code: `cx_powerboard` — underscore, matches `project_generator`, `event_operations`, `sales_insight_explorer`
- Route: `/cx-powerboard` — kebab-case, matches `/projects`, `/events`, `/insights`
- File names: kebab-case, e.g. `win-detection.js`, `mapping-service.js`

#### Module descriptor — CORRECTION to v3

v3 used `export const module = { ... }`. **This is wrong.** All modules use `export default { ... }` with `routes` imported from `routes.js`:

```js
// src/modules/cx_powerboard/module.js
import { routes } from './routes.js';

export default {
  code: 'cx_powerboard',
  name: 'CX Powerboard',
  description: 'Activity priority queue and automated win detection for CX teams.',
  route: '/cx-powerboard',
  icon: 'trophy',
  isActive: true,
  routes
};
```

`subRoles` is NOT present in event-operations or sales-insight-explorer module descriptors — it is optional documentation used only in mail-signature-designer. **Omit it from the module descriptor.** Sub-role enforcement belongs in `routes.js`, not the descriptor.

---

### 14.2 Odoo Wrapper Alignment

#### How the existing wrapper works

`src/lib/odoo.js` exports the following functions (all throttled at 200ms via a shared `lastOdooCallTime` state):

| Export | Signature |
|--------|-----------|
| `executeKw` | `(env, { model, method, args, kwargs, staging, odooUrl, odooDb })` |
| `search` | `(env, { model, domain, limit, offset, order, … })` |
| `read` | `(env, { model, ids, fields, … })` |
| `searchRead` | `(env, model, domain, fields, kwargs)` — convenience wrapper |
| `create` | `(env, { model, values, … })` |
| `write` | `(env, { model, ids, values, … })` |

Auth is injected automatically inside `executeKw`: it reads `env.UID` (Odoo numeric user ID) and `env.API_KEY` from Worker env bindings. No caller needs to pass credentials.

#### How modules use the wrapper

**Pattern A — module-local odoo-client.js wrapping the shared lib:**

```js
// event-operations/odoo-client.js
import { searchRead, executeKw, write } from '../../lib/odoo.js';

export async function getOdooWebinars(env) {
  return searchRead(env, ODOO_MODEL.WEBINAR, [], ODOO_FIELDS.WEBINAR);
}
```

**Pattern B — direct import at route/service level:**

```js
// sales-insight-explorer/routes.js
import { searchRead } from '../../lib/odoo.js';
```

Both patterns are used. For CX Powerboard, Pattern A (module-local `odoo-client.js`) is correct — it keeps all Odoo domain knowledge in one place and enforces the mandatory `user_id IN [...]` filter.

#### Decision: Reuse existing wrapper via module-local odoo-client.js

CX Powerboard MUST import from `../../lib/odoo.js`. No new Odoo client. `odoo-client.js` wraps the shared functions with CX-specific domain logic:

```js
// src/modules/cx_powerboard/odoo-client.js
import { searchRead } from '../../lib/odoo.js';

// The user_id filter is mandatory. It cannot be omitted.
export async function fetchActiveActivities(env, odooUids) {
  return searchRead(
    env,
    'mail.activity',
    [['user_id', 'in', odooUids], ['active', '=', true]],
    ['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model', 'res_name'],
    { limit: 10000 }
  );
}

export async function fetchActivityTypes(env) {
  return searchRead(env, 'mail.activity.type', [], ['id', 'name']);
}
```

The 200ms throttle is transparent — it is applied inside `executeKw` and does not need to be called by CX modules.

---

### 14.3 UI / Design System Fit

#### Confirmed design system (live codebase)

Every module in the platform uses the **exact same stack** loaded from CDN on every page:

```html
<link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
```

#### Confirmed layout anatomy (all modules, no exceptions)

```html
<html lang="en" data-theme="light">
<head>
  <!-- theme init script (cookie + localStorage) -->
  <!-- CDN dependencies above -->
</head>
<body class="bg-base-200">
  ${navbar(user)}                      <!-- imported from ../../lib/components/navbar.js -->
  
  <div style="padding-top: 48px;">     <!-- compensates for fixed 48px navbar -->
    <div class="container mx-auto px-6 py-8 max-w-*xl">
      <!-- page content -->
    </div>
  </div>
</body>
```

`padding-top: 48px` is a **fixed inline style**, not a Tailwind class — this is consistent across all modules.

#### Confirmed component vocabulary

| UI Element | DaisyUI class |
|------------|---------------|
| Panel/card | `card bg-base-100 shadow-xl` |
| Table | `table` inside `overflow-x-auto` |
| Primary button | `btn btn-primary` |
| Small button | `btn btn-sm` |
| Status badge | `badge badge-{success|warning|error|neutral|info}` |
| Alert/error | `alert alert-{info|error|warning}` |
| Loading spinner | `loading loading-spinner loading-{sm|md|lg}` |
| Modal | `<dialog class="modal">` + `modal-box` |
| Form input | `input input-bordered` |
| Select | `select select-bordered` |
| Page header | `text-4xl font-bold mb-2` + `text-base-content/60` |

#### Theme init script (required in every ui.js `<head>`)

All modules include an early theme init:

```js
(function initThemeEarly() {
  try {
    const localTheme = localStorage.getItem('selectedTheme');
    const cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
    const cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    const theme = localTheme || cookieTheme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
```

CX Powerboard `ui.js` MUST include this script. Omitting it causes a flash-of-wrong-theme.

#### CX Powerboard dashboard — design system alignment

All panels use `card bg-base-100 shadow-xl`. The activity list is a `table`. Priority dots are a `badge`. Recent wins panel is a separate `card`. Status/error states use `alert`. This is standard; no new paradigms needed.

---

### 14.4 Navigation Placement

#### How navigation works (confirmed)

The navbar in `src/lib/components/navbar.js` generates the "Modules" dropdown automatically from `user.modules`:

```js
const modules = userModules.map(um => um.module || um);
// → renders: <li><a href="${m.route}">${m.name}</a></li>
```

The home dashboard renders one `card` tile per module using the same array.

**No manual navigation changes are required.** Once:
1. `cx_powerboard` is registered in `src/modules/registry.js`
2. A user has `cx_powerboard` in their `user_modules` (via admin panel or auto-grant)

...the module appears automatically in the navbar dropdown AND the home dashboard tile grid.

#### Navigation placement decision

- **Primary navigation:** Navbar → Modules dropdown → "CX Powerboard" link
- **Home dashboard:** Tile in the `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` grid alongside other module tiles
- **Module type:** Top-level module (NOT a sub-module, NOT a tab inside another module)
- **Entry route:** `/cx-powerboard` → own dashboard page

The module does NOT live inside Event Operations, Sales Insight Explorer, or any other module. It is a peer-level entry in the registry.

---

### 14.5 Auth & Role Alignment

#### Confirmed auth flow (from index.js)

1. `index.js` catches any request matching `/cx-powerboard` or `/cx-powerboard/*`
2. Extracts session token from `cookie: session=`
3. Calls `validateSession(env, token)` → returns `user` or `null`
4. Checks module access: `getUserModules(user).some(m => m.code === 'cx_powerboard')`
5. If user is `role === 'admin'`, this access check is **skipped** (admins access all modules)
6. Passes `{ request, env, ctx, user, params }` to the module route handler

This means: **index.js already handles the module-level access gate for the page load (GET/).** Module API sub-routes (e.g. `GET /api/activities`) must do their own auth check because `index.js` only gates the route at the module level — not per API endpoint.

#### Confirmed sub-role utility: `hasModuleSubRoleAccess`

`registry.js` exports a reusable utility:

```js
export function hasModuleSubRoleAccess(user, requiredRole) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === requiredRole;
}
```

This is the **platform-provided** way to check sub-roles in route handlers. CX Powerboard MUST use this function, not re-implement the check.

Updated route guard pattern:

```js
// src/modules/cx_powerboard/routes.js
import { hasModuleSubRoleAccess } from '../../modules/registry.js';

function requireCxAccess(context) {
  if (!context.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const hasAccess = context.user.role === 'admin' ||
    context.user.modules?.some(m => m.module?.code === 'cx_powerboard' && m.is_enabled);
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return null;
}

function requireCxManagerAccess(context) {
  const denied = requireCxAccess(context);
  if (denied) return denied;
  if (!hasModuleSubRoleAccess(context.user, 'cx_powerboard_manager')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return null;
}
```

#### Role system alignment

| Pattern | mail-signature-designer | CX Powerboard |
|---------|------------------------|---------------|
| Sub-role value in `users.role` | `marketing_signature` | `cx_powerboard_manager` |
| Route guard function | `hasMarketingRole(context)` | `requireCxManagerAccess(context)` (uses `hasModuleSubRoleAccess`) |
| Admin override | `user.role === 'admin'` | via `hasModuleSubRoleAccess` (built-in) |
| Module auto-grant on role set | `mail_signature_designer` | `cx_powerboard` |
| DB constraint update required | ✅ | ✅ |

CX Powerboard follows the **exact same pattern** as mail-signature-designer. No new mechanisms needed.

---

### 14.6 Data Layer Consistency

#### Supabase client usage confirmed

All modules use the service role key directly:

```js
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
```

event-operations adds a module-local wrapper (`lib/supabaseClient.js`) that calls the same pattern — this is optional convenience. CX Powerboard services should call `createClient` directly; no need for an additional wrapper.

#### Naming conventions confirmed

| Convention | Platform examples | CX Powerboard |
|------------|------------------|---------------|
| Table names | `users`, `user_modules`, `modules`, `sessions` | `cx_activity_mapping`, `cx_seen_activities`, `cx_processed_wins` — all prefixed `cx_` |
| `id` column | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | ✅ same |
| Timestamps | `created_at TIMESTAMPTZ DEFAULT now()` | ✅ same |
| Foreign keys | `REFERENCES users(id) ON DELETE CASCADE/SET NULL` | ✅ same |
| `is_active` / `is_enabled` booleans | `users.is_active`, `user_modules.is_enabled` | ✅ `cx_activity_mapping.is_win` follows same boolean naming |

No deviations from platform conventions.

#### RLS note (re-confirmed)

The Worker uses the service role key, which bypasses RLS at runtime. RLS is a safety net for direct DB/Studio access. This is consistent with all other modules — none rely on RLS for runtime enforcement.

---

### 14.7 Performance Alignment

#### How other modules handle Odoo performance

| Module | Batching | Caching | Throttle |
|--------|----------|---------|---------|
| Event Operations | Single call per operation; `SYNC_WORKER_CONCURRENCY = 5` for multi-event syncs | Module-local in-memory cache on field name resolution | Via shared `throttle()` in `lib/odoo.js` |
| Sales Insight Explorer | Single query per user request | Supabase-persisted schema cache with `getCachedSchema` / `cacheSchema` | Via shared `throttle()` |
| Project Generator | Single call per generation | None needed (writes only) | Via shared `throttle()` |

#### CX Powerboard alignment

CX Powerboard uses:
1. **KV cache** (`env.MAPPINGS_KV`) for `cx_activity_mapping` — consistent with the platform's existing KV binding (`MAPPINGS_KV` is already in `wrangler.jsonc`) and mirrors the schema-cache pattern in Sales Insight Explorer
2. **Single batched Odoo query** per cron run — consistent with event-operations batching philosophy (`limit: 10000`, `user_id IN [...]`). Never one query per user.
3. **No additional throttle logic needed** — the 200ms throttle in `lib/odoo.js` applies automatically to the single cron query

One difference from the schema cache (Sales Insight Explorer): the schema cache uses Supabase as its persistence layer, while CX Powerboard uses KV. Both are valid — KV is already bound and is faster for lightweight key→JSON lookups like the activity mapping table.

---

### 14.8 Module Validity Re-Evaluation

After full integration analysis, the CX Powerboard module design is **confirmed valid** with the following structural adjustments incorporated:

| # | Adjustment | Source |
|---|-----------|--------|
| A1 | `export default { ... }` not `export const module` | Confirmed in all 3 reference modules |
| A2 | `subRoles` array omitted from module descriptor | Not present in event-ops or sales-insight reference modules |
| A3 | Route guards use `hasModuleSubRoleAccess` from `registry.js` | Confirmed utility exists; not re-implementing |
| A4 | `odoo-client.js` imports from `../../lib/odoo.js` — no parallel client | Confirmed by both reference patterns |
| A5 | `createClient` called directly in services — no wrapper layer | Consistent with project-generator and sales-insight-explorer |
| A6 | `padding-top: 48px` inline style on content div (not Tailwind `pt-12`) | Confirmed in all existing ui.js files |
| A7 | Theme init script required in every `<head>` | Confirmed in event-operations and project-generator |
| A8 | `index.js` requires new `scheduled` export — no existing handler to add to | Confirmed: only `fetch` is currently exported |

No component needs to be invented. Every element has a direct analogue in the existing codebase.

---

## 15. Future Extensions

> All items below are explicitly **out of scope for MVP**. They are recorded to prevent scope creep during implementation while preserving a clear upgrade path.

### 15.1 Real-Time Activity Updates (Post-MVP)

**Current:** Dashboard refreshes on page load. Activity changes visible after next full page reload.  
**Extension:** Poll `/api/cx-powerboard/activities` on a 30-second interval (client-side `setInterval`). No SSE or WebSockets needed. Consistent with how other modules handle live data (event-operations uses manual refresh).

### 15.2 Win Attribution Fix for Reassigned Activities (EC-3)

**Current:** Win attributed to first-seen `platform_user_id`. If activity reassigned in Odoo, wrong user gets credit.  
**Extension:** Add `last_seen_odoo_user_id INTEGER` column to `cx_seen_activities`. Update it on each cron run alongside `last_seen_at`. At win detection time, prefer `last_seen_odoo_user_id` for attribution. No schema changes to `cx_processed_wins` required.

### 15.3 Activity Type Drift Detection

**Current:** If an open activity's type is changed in Odoo after first-seen, the cron uses the stale type (EC-4).  
**Extension:** Add `last_seen_type_id INTEGER` to `cx_seen_activities`, updated each cron run. At win detection, use `last_seen_type_id` for classification instead of `activity_type_id`. One column addition, no logic overhaul.

### 15.4 CX Manager Odoo UID Assignment Delegation

**Current:** Only `admin` can set `users.odoo_uid`.  
**Extension:** Allow `cx_powerboard_manager` to set `odoo_uid` for users within their team. Requires a scoped API endpoint with explicit checks that the target user has the `cx_powerboard` module. Avoids bottlenecking admin for routine team setup.

### 15.5 Win Streak & Team Leaderboard

**Current:** Win history shown per user, no aggregation.  
**Extension:** A read-only leaderboard view aggregating `cx_processed_wins` by `platform_user_id` over a rolling window (7/30/90 days). No new tables needed — pure query aggregation on existing data.

### 15.6 Notification on Win Detection

**Current:** Win appears in dashboard on next load (15-min lag).  
**Extension:** After writing to `cx_processed_wins`, the cron job could write a notification to a shared `notifications` table (if the platform adds one) or trigger a Supabase Realtime event. Deferred until the platform has a notification layer.

### 15.7 Historical Win Trend Charts

**Current:** Tabular win history.  
**Extension:** Chart.js CDN (already used by other modules) to render wins-per-week bar chart inline in the dashboard. Purely additive — new UI element, no data model change.

---

## 16. Final Assessment

### 16.1 Architecture Validity After Integration Analysis

The Integration Analysis (Section 14) confirmed that no fundamental architectural assumption in v3 conflicts with the existing Operations Manager system. The eight structural adjustments identified (A1–A8 in Section 14.8) are all **pre-implementation corrections** — they prevent implementation errors, they are not architectural reworks.

| Question | Answer |
|----------|--------|
| Does anything need to change in the architecture? | No. A1–A8 are naming/pattern corrections, not design changes. |
| Are there conflicts with existing systems? | None. Every pattern has a direct precedent in an existing module. |
| Are we still MVP-clean? | Yes. Three tables, one cron job, one dashboard page, one settings page. No scope additions. |
| Is any new infrastructure required? | No. KV already bound, Odoo wrapper exists, Supabase in use, Cloudflare cron supported. |
| Are any platform files modified that could break other modules? | Two: `admin/routes.js` (additive — new role value) and `registry.js` (additive — new import). Both are append-only changes with no effect on existing module behaviour. |

### 16.2 Resolved Issues Checklist

| Issue | Resolution | Status |
|-------|-----------|--------|
| `cx_powerboard_manager` sub-role storage | `users.role` value; DB constraint + admin/routes.js (3 locations) + auto-grant | ✅ Resolved |
| `odoo_uid` missing from codebase | `ALTER TABLE users ADD COLUMN odoo_uid INTEGER UNIQUE` in migration | ✅ Resolved |
| `cx_seen_activities` cleanup safety | Event-driven cleanup only (no TTL) | ✅ Resolved |
| `cx_activity_mapping` write RLS | `role IN ('admin', 'cx_powerboard_manager')` — not `'manager'` | ✅ Resolved |
| Module descriptor format | `export default { ... }` with `routes` imported from `routes.js` | ✅ Resolved |
| Route guards | Use `hasModuleSubRoleAccess` from `registry.js` | ✅ Resolved |
| Concurrent cron idempotency | `ON CONFLICT DO NOTHING` on `cx_processed_wins`; upsert on `cx_seen_activities` | ✅ Resolved |
| Theme flash on page load | Theme init script in `<head>` of every `ui.js` page | ✅ Resolved |
| `padding-top` convention | Inline `style="padding-top: 48px"` not Tailwind class | ✅ Resolved |
| Odoo client isolation | Module-local `odoo-client.js` wrapping `../../lib/odoo.js`; mandatory filter injected | ✅ Resolved |
| XSS from Odoo strings | `escapeHtml()` on all Odoo-sourced strings in `ui.js` | ✅ Resolved |

### 16.3 Implementation Order

The five blockers must be resolved **in this order** — later steps depend on earlier ones:

```
Step 1  →  Migration: users.odoo_uid + users.role constraint + 3 CX tables
Step 2  →  admin/routes.js: add cx_powerboard_manager to role lists (×3) + auto-grant block
Step 3  →  wrangler.jsonc: add cron trigger */15 * * * *
Step 4  →  registry.js: import and register cx_powerboard module
Step 5  →  src/index.js: add `scheduled` export handler
Step 6  →  Build module files (module.js → routes.js → ui.js → odoo-client.js → services → cron)
```

Steps 1–5 are platform-level changes. Step 6 is the module build. Test step 1–5 individually before writing module code.

### 16.4 Open Questions Before First Commit

These require a human decision before implementation starts:

| # | Question | Decision needed from |
|---|----------|---------------------|
| Q1 | Who is the first cx_powerboard_manager? An existing `manager` user who gets role changed, or a new user? | Product owner |
| Q2 | Should `odoo_uid` assignment be visible in the existing admin user-edit UI, or only via API? | Product owner |
| Q3 | What is the initial set of `cx_activity_mapping` rows to seed? Which Odoo activity types get `is_win = true`? | CX team |
| Q4 | Should the cron run in the same Worker instance as the request handler, or is a separate Worker preferred? (Standard pattern is same Worker — confirming assumption.) | Infrastructure |

None of Q1–Q4 block implementation of the module skeleton. They only block final wiring and data seeding.

---

**READY FOR IMPLEMENTATION**
