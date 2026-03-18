# CX Powerboard — Module Analysis & Design Document

> **Status: AWAITING APPROVAL — DO NOT IMPLEMENT**
> Version: 2.0 | Date: 2026-03-18 (Revised)
> Changes from v1.0: Removed manual win recording → replaced with automated cron detection; simplified data model (removed category, effort_score); added cx_win_events idempotency table; added mapping cache; security clarifications; stage boost moved to code constant.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Functional Overview](#2-functional-overview)
3. [Data Model Design](#3-data-model-design)
4. [Data Flow](#4-data-flow)
5. [Priority Logic](#5-priority-logic)
6. [Security Model](#6-security-model)
7. [UX Structure](#7-ux-structure)
8. [Technical Architecture](#8-technical-architecture)
9. [Future Extensions](#9-future-extensions)
10. [Risks & Edge Cases](#10-risks--edge-cases)

---

## 1. Executive Summary

**CX Powerboard** is a lightweight, read-mostly dashboard module for Customer Success (CX) users.

It does **not** replace Odoo. It is a **focus layer on top of Odoo**.

Every morning a CX user opens the Powerboard and sees: *"Here are your 5 most important things to do today."* They click one item, land on the Odoo lead form, do the work there, and come back. A win counter ticks up. At a glance, a manager can see the team's tempo.

**What it is:**
- A prioritized, opinionated view of existing Odoo activities
- A momentum tracker ("wins today")
- A manager overview of team activity health

**What it is NOT:**
- A task manager
- A replacement for Odoo's activity system
- A complex event engine

**Platform fit:** This is a new module in the existing Operations Manager platform (Cloudflare Worker + Supabase + Odoo). It follows the same `module.js / routes.js / ui.js / odoo-client.js` pattern as all existing modules.

---

## 2. Functional Overview

### 2.1 CX User — What they can do

| Action | Description |
|--------|-------------|
| View dashboard | See their own activities sorted by priority |
| Filter by period | Toggle between "Today" and "This week" views |
| Open a lead | Click any item → navigates to Odoo lead form (new tab) |
| See wins counter | Top bar shows "X wins today / Y target" |
| See progress bar | Visual fill toward daily wins goal |

**What they cannot do inside the dashboard:**
- Complete activities (done in Odoo)
- Create activities (done in Odoo)
- Edit lead data (done in Odoo)

### 2.2 CX Manager — What they can do

| Action | Description |
|--------|-------------|
| View team overview | Wins per user today, open activities counts, overdue counts |
| See individual detail | Click a user → their dashboard view (read-only) |
| Configure mappings | Set priority_weight, category, is_win per activity type |
| Configure goals | Set daily/weekly wins targets per user |

### 2.3 Platform Admin — What they can do

All manager capabilities plus:
- Access via existing admin panel
- Assign `cx_powerboard` module access to users

---

## 3. Data Model Design

### Overview

The architecture has two storage layers:

- **Odoo** → source of truth for activities and lead data (read-only from our side)
- **Supabase** → stores configuration and win tracking (our own data)

We own **zero activity data**. We only own the **operational layer on top** of it.

---

### 3.1 Supabase: `cx_activity_mapping`

**Purpose:** Translates a raw Odoo activity type into operational meaning. Configured once by a manager. The system cannot prioritize anything without at least one mapping.

```sql
CREATE TABLE cx_activity_mapping (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link to Odoo activity type
  odoo_activity_type_id    INTEGER     NOT NULL,          -- Odoo's mail.activity.type ID
  odoo_activity_type_name  VARCHAR(100) NOT NULL,         -- Cached display name (e.g. "Call", "Email")
  -- Operational values
  priority_weight INTEGER     NOT NULL DEFAULT 50         -- 0–100, higher = more urgent
                              CHECK (priority_weight >= 0 AND priority_weight <= 100),
  expected_duration_minutes INTEGER NOT NULL DEFAULT 15,  -- Used for effort_score calculation
  is_win          BOOLEAN     NOT NULL DEFAULT false,     -- Does completing this count as a win?
  category        VARCHAR(20) NOT NULL DEFAULT 'admin'
                              CHECK (category IN ('call', 'mail', 'demo', 'admin')),
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        REFERENCES users(id),
  -- Constraints
  UNIQUE (odoo_activity_type_id)                          -- One mapping per activity type
);
```

**Notes:**
- `odoo_activity_type_name` is denormalized (cached) to avoid an extra Odoo call on every dashboard load
- `UNIQUE (odoo_activity_type_id)` ensures no conflicting weights exist
- When no mapping exists for an activity type, the dashboard uses a safe default (weight=10, category='admin', is_win=false)

---

### 3.2 Supabase: `cx_user_daily_stats`

**Purpose:** Tracks wins per user per day. Incremented when a manager marks an activity as a win (or via a future automated detection mechanism).

```sql
CREATE TABLE cx_user_daily_stats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date       DATE        NOT NULL,
  wins_count      INTEGER     NOT NULL DEFAULT 0,
  effort_score    INTEGER     NOT NULL DEFAULT 0,         -- Sum of expected_duration of won activities
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  UNIQUE (user_id, stat_date)                             -- One row per user per day
);

CREATE INDEX idx_cx_daily_stats_user_date
  ON cx_user_daily_stats (user_id, stat_date DESC);
```

**Notes:**
- `UNIQUE (user_id, stat_date)` means we use `INSERT ... ON CONFLICT DO UPDATE` (upsert) to increment wins
- `effort_score` sums `expected_duration_minutes` of completed win-activities for that day (optional metric)
- Records for days with zero activity are simply absent (no row) — this is intentional to keep the table lightweight

---

### 3.3 Supabase: `cx_goal`

**Purpose:** Defines a daily or weekly wins target for a user. Compared against `cx_user_daily_stats` to show progress.

```sql
CREATE TABLE cx_goal (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period          VARCHAR(10) NOT NULL DEFAULT 'daily'
                              CHECK (period IN ('daily', 'weekly')),
  target_value    INTEGER     NOT NULL DEFAULT 5
                              CHECK (target_value > 0),
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        REFERENCES users(id),
  -- Constraints
  UNIQUE (user_id, period)                                -- One active goal per user per period
);
```

**Notes:**
- MVP only uses `period = 'daily'`
- `UNIQUE (user_id, period)` keeps it simple — one goal per period per user
- If no goal exists for a user, the UI shows a neutral state (no progress bar, no target)

---

### 3.4 Odoo data (read-only, never stored)

The dashboard reads these Odoo models **live on each request**. We never persist this data.

#### `mail.activity` — fields we read:

| Field | Type | Used for |
|-------|------|---------|
| `id` | integer | Activity identifier |
| `res_id` | integer | Lead ID (for linking) |
| `res_model` | char | Filter: must be `'crm.lead'` |
| `activity_type_id` | many2one | Join with cx_activity_mapping |
| `summary` | char | Activity title/summary |
| `date_deadline` | date | Deadline urgency calculation |
| `user_id` | many2one | Filter: current user |
| `note` | html | Activity description (shown in tooltip) |

#### `crm.lead` — fields we read (fetched by res_id):

| Field | Type | Used for |
|-------|------|---------|
| `id` | integer | Link to Odoo form |
| `name` | char | Lead name shown in dashboard |
| `stage_id` | many2one | Stage name shown in dashboard |
| `partner_id` | many2one | Company/contact name |
| `priority` | selection | Odoo's own priority flag (0/1/2/3) |

---

### 3.5 Required Supabase Migrations

Three new migration files will be required:

1. `create_cx_activity_mapping.sql`
2. `create_cx_user_daily_stats.sql`
3. `create_cx_goal.sql`

Plus corresponding RLS policies (see Section 6).

---

## 4. Data Flow

### 4.1 Dashboard Load Flow

```
Browser → GET /cx-powerboard
         ↓
  [Cloudflare Worker]
  1. Validate session → get user (user_id, role, odoo_uid)
  2. Fetch from Odoo: mail.activity
     domain: [
       ['res_model', '=', 'crm.lead'],
       ['user_id', '=', <odoo_uid>],        ← current user's Odoo UID
       ['date_deadline', '!=', false]        ← only activities with deadlines
     ]
     fields: [id, res_id, activity_type_id, summary, date_deadline, note]
     limit: 50
     
  3. Extract unique res_ids from activities
  
  4. Fetch from Odoo: crm.lead
     domain: [['id', 'in', [<res_ids>]]]
     fields: [id, name, stage_id, partner_id, priority]
     
  5. Fetch from Supabase: cx_activity_mapping (all rows, cached per worker instance)
  
  6. Fetch from Supabase: cx_user_daily_stats
     WHERE user_id = current_user AND stat_date = today
     
  7. Fetch from Supabase: cx_goal
     WHERE user_id = current_user AND period = 'daily' AND is_active = true
     
  8. ENRICH each activity:
     - Attach lead data (name, stage, partner)
     - Attach mapping (priority_weight, category, is_win)
     - Calculate priority_score (see Section 5)
     
  9. SORT by priority_score DESC
  
  10. SPLIT into:
      - "Today" bucket: date_deadline <= today
      - "This week" bucket: date_deadline within 7 days
      
  11. Render SSR HTML → return to browser
```

### 4.2 Win Recording Flow

```
Manager clicks "Record Win" on a user's activity (MVP: manual trigger)
    ↓
POST /cx-powerboard/api/wins
body: { user_id, activity_type_id, activity_date }
    ↓
[Worker]
1. Verify caller has manager/admin role
2. Look up cx_activity_mapping for activity_type_id
3. If mapping.is_win = false → return 400 "Not a win activity"
4. UPSERT cx_user_daily_stats:
   INSERT INTO cx_user_daily_stats (user_id, stat_date, wins_count, effort_score)
   VALUES ($1, $2, 1, $3)
   ON CONFLICT (user_id, stat_date)
   DO UPDATE SET
     wins_count = cx_user_daily_stats.wins_count + 1,
     effort_score = cx_user_daily_stats.effort_score + $3,
     updated_at = NOW()
5. Return updated stats
```

**MVP note:** In phase 1, win recording is a **manual manager action**. There is no automated event detection from Odoo. This is intentional — it keeps the system simple and avoids polling or webhook complexity for MVP.

### 4.3 Activity → Win — Future flow (documented for future reference, NOT MVP)

```
[Future] Odoo webhook or poll detects activity.done event
→ Worker receives event
→ Looks up mapping.is_win
→ Upserts cx_user_daily_stats
→ (optionally) triggers notification
```

---

## 5. Priority Logic

### 5.1 Scoring Formula

Each activity receives a `priority_score` between 0 and 200:

```
priority_score = weight_score + urgency_score
```

Where:

```
weight_score  = mapping.priority_weight           (0–100, from cx_activity_mapping)
urgency_score = calculateUrgency(date_deadline)   (0–100, see table below)
```

### 5.2 Urgency Score Table

| Deadline state | Score | Rationale |
|----------------|-------|-----------|
| Overdue (past today) | +100 | Must be at the top, always |
| Due today | +80 | Top priority for the day |
| Due tomorrow | +60 | Should be prepared |
| Due in 2–3 days | +40 | On radar |
| Due in 4–7 days | +20 | This week |
| Due in 8+ days | +5 | Visible but de-prioritized |
| No deadline | +0 | Shown last |

### 5.3 Example Scenarios

| Activity type | priority_weight | Deadline | urgency | **Total** |
|---------------|----------------|----------|---------|-----------|
| Demo call | 90 | Overdue | 100 | **190** |
| Email follow-up | 40 | Today | 80 | **120** |
| Demo call | 90 | In 5 days | 20 | **110** |
| Admin task | 10 | Today | 80 | **90** |
| Admin task | 10 | In 8 days | 5 | **15** |

### 5.4 OPTIONAL: Odoo priority boost

If `crm.lead.priority` is `'2'` or `'3'` (high/very high in Odoo), add a flat `+15` to the score.

This is **optional and configurable** — a manager can enable or disable this boost in settings. It is off by default in MVP to avoid confusion.

### 5.5 Activities without a mapping

If no `cx_activity_mapping` row exists for an activity type, the defaults apply:
- `priority_weight = 10`
- Category = `'admin'`
- `is_win = false`

This ensures the dashboard never fails even with unconfigured activity types.

### 5.6 Tie-breaking

When two activities have identical scores:
- Sort by `date_deadline` ascending (earlier deadline shown first)
- Then by `activity_type_id` (deterministic but arbitrary)

---

## 6. Security Model

### 6.1 Platform-level access (existing system)

This module uses the existing Operations Manager session + role system.

| Who | How they get access |
|-----|-------------------|
| CX user | Admin assigns `cx_powerboard` module in `user_modules` table |
| CX manager | Same, plus `role = 'manager'` in `users.role` OR a module-level sub-role |
| Platform admin | Global `role = 'admin'` — automatically has access to all modules |

**Decision: reuse existing `users.role` for the manager/admin split.** No new global roles needed.

**Decision: introduce one module sub-role: `cx_powerboard_manager`**  
This is for non-admin users who need manager visibility (team view, mappings config). A user with `role = 'user'` but sub-role `cx_powerboard_manager` can see the team view and configure mappings. This mirrors the pattern already used in `mail-signature-designer` (`marketing_signature` sub-role).

### 6.2 Odoo-level access

The Worker calls Odoo **using the platform's API key and UID** (from `env.API_KEY` and `env.UID`). We then filter results by the session user's **Odoo user ID** (`odoo_uid`).

**Important:** The mapping between platform `user_id` (Supabase UUID) and Odoo `user_id` (integer) must be stored — this is an existing pattern used in other modules. We use `users.odoo_uid` field (if it exists) or a new `cx_odoo_user_mapping` table if not.

**To verify:** Does the `users` table already have an `odoo_uid` column? This must be confirmed before implementation. If not, we add it.

### 6.3 Supabase RLS Policies

#### `cx_activity_mapping`

```sql
-- All authenticated users can read mappings (needed for dashboard)
CREATE POLICY "cx_mapping_read_all" ON cx_activity_mapping
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only managers/admins can insert/update/delete
CREATE POLICY "cx_mapping_write_manager" ON cx_activity_mapping
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND (role IN ('admin', 'manager') OR /* sub-role check */)
    )
  );
```

*Note: RLS is enforced at Supabase level. The Worker also enforces role checks in route handlers as a second layer.*

#### `cx_user_daily_stats`

```sql
-- Users can read their own stats
CREATE POLICY "cx_stats_read_own" ON cx_user_daily_stats
  FOR SELECT USING (user_id = auth.uid());

-- Managers and admins can read all stats
CREATE POLICY "cx_stats_read_manager" ON cx_user_daily_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Only the Worker service role can write (no direct user writes)
CREATE POLICY "cx_stats_write_service" ON cx_user_daily_stats
  FOR ALL USING (auth.role() = 'service_role');
```

#### `cx_goal`

```sql
-- Users can read their own goals
CREATE POLICY "cx_goal_read_own" ON cx_goal
  FOR SELECT USING (user_id = auth.uid());

-- Managers and admins can read all goals
CREATE POLICY "cx_goal_read_manager" ON cx_goal
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Only managers/admins can create/update goals
CREATE POLICY "cx_goal_write_manager" ON cx_goal
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );
```

### 6.4 Permission Matrix

| Capability | CX User | cx_powerboard_manager | Admin |
|------------|---------|----------------------|-------|
| View own dashboard | ✅ | ✅ | ✅ |
| View team dashboard | ❌ | ✅ | ✅ |
| View another user's dashboard | ❌ | ✅ | ✅ |
| Record a win (own) | ❌ (MVP) | ✅ | ✅ |
| Configure mappings | ❌ | ✅ | ✅ |
| Configure goals | ❌ | ✅ | ✅ |
| View own wins stats | ✅ | ✅ | ✅ |
| View team wins stats | ❌ | ✅ | ✅ |

### 6.5 What users CANNOT see

- Activities assigned to other users (enforced by Odoo filter `user_id = <odoo_uid>`)
- Other users' daily stats (enforced by Supabase RLS + Worker route checks)
- Mappings (read-only, but cannot modify)

---

## 7. UX Structure

### 7.1 CX User Dashboard — Layout

```
┌─────────────────────────────────────────────────────┐
│  CX Powerboard                          [2026-03-18] │
├─────────────────────────────────────────────────────┤
│  🏆 WINS TODAY   ████████░░  4 / 5 target           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  TODAY (Prioritized)                                │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🔴 OVERDUE  │ Demo Call  │ Acme Corp          │  │
│  │  "Product demo follow-up"                     │  │
│  │  Stage: Proposal Sent │ Due: 2 days ago       │  │
│  │                              [Open in Odoo →] │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🟠 TODAY    │ Call       │ Beta BV            │  │
│  │  "Follow up on pricing"                       │  │
│  │  Stage: Negotiation │ Due: Today              │  │
│  │                              [Open in Odoo →] │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  THIS WEEK                                          │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🟡 3 DAYS   │ Email      │ Gamma Ltd          │  │
│  │  "Send contract draft"                        │  │
│  │  Stage: Qualified │ Due: Thursday             │  │
│  │                              [Open in Odoo →] │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 7.2 Dashboard Item — Fields shown

Each activity card shows:

| Field | Source | Display |
|-------|--------|---------|
| Urgency badge | Calculated | 🔴 OVERDUE / 🟠 TODAY / 🟡 N DAYS |
| Category icon | cx_activity_mapping.category | 📞 call / ✉️ mail / 🖥️ demo / 📋 admin |
| Activity type | mail.activity.activity_type_id | "Demo Call", "Email", etc. |
| Lead name | crm.lead.name | "Acme Corp — Q2 Deal" |
| Partner/Company | crm.lead.partner_id | "Acme Corp" |
| Activity summary | mail.activity.summary | Free-text summary line |
| Stage | crm.lead.stage_id | "Proposal Sent" |
| Deadline | mail.activity.date_deadline | Relative: "Today", "Tomorrow", "3 days", or date |
| Open button | — | Links to `<odoo_url>/odoo/crm/<lead_id>` in new tab |

### 7.3 Wins Counter Bar (top of page)

- Shows: `[filled blocks] X / Y target`
- Filled with color: green when ≥ target, amber when 50–99%, grey when < 50%
- If no goal configured: shows `X wins today` without a target or bar

### 7.4 Empty States

| Condition | Message shown |
|-----------|--------------|
| No activities | "No open activities. Time to check Odoo for new work." |
| Odoo connection failed | "Could not load activities from Odoo. Please try again." |
| No mapping configured | Warning banner: "Activity mappings not configured. Priorities may not be accurate." |

### 7.5 Manager View — Layout

```
┌─────────────────────────────────────────────────────┐
│  CX Powerboard — Team Overview        [2026-03-18]  │
├─────────────────────────────────────────────────────┤
│  Team Performance Today                             │
│  ┌────────────┬──────┬────────┬─────────┬────────┐ │
│  │ User       │ Wins │ Target │ Open    │ Overdue│ │
│  ├────────────┼──────┼────────┼─────────┼────────┤ │
│  │ Anna       │  4   │   5    │   8     │    1   │ │
│  │ Ben        │  2   │   5    │  12     │    3   │ │
│  │ Clara      │  5   │   5    │   6     │    0   │ │
│  └────────────┴──────┴────────┴─────────┴────────┘ │
│                                                     │
│  Overdue activities are highlighted in red.         │
│  Click any user row to view their dashboard.        │
└─────────────────────────────────────────────────────┘
```

### 7.6 Manager Configuration — Mapping Screen

A simple table editor for `cx_activity_mapping`:

```
Activity Type        | Weight | Duration | Category | Is Win?
---------------------|--------|----------|----------|-------
Demo Call            |  90    |   45 min | demo     | ✅ Yes
Email Follow-up      |  40    |   10 min | mail     | ✅ Yes
Phone Call           |  70    |   20 min | call     | ✅ Yes
Admin Task           |  10    |   15 min | admin    | ❌ No
```

Populated by fetching all `mail.activity.type` records from Odoo, then matching against stored mappings.

---

## 8. Technical Architecture

### 8.1 Module Structure

```
src/modules/cx-powerboard/
├── module.js              ← Module descriptor (code, name, route, icon)
├── routes.js              ← Route map (GET /, GET /team, POST /api/wins, etc.)
├── ui.js                  ← SSR HTML for CX user dashboard
├── ui-manager.js          ← SSR HTML for manager views (team, config)
├── odoo-client.js         ← All Odoo API calls for this module
├── scoring.js             ← Priority score calculation (pure function, testable)
└── services/
    ├── dashboard-service.js   ← Orchestrates fetch → enrich → sort → render
    ├── wins-service.js        ← Win upsert logic
    └── mapping-service.js     ← CRUD for cx_activity_mapping
```

### 8.2 Module Descriptor (`module.js`)

```js
export default {
  code: 'cx_powerboard',
  name: 'CX Powerboard',
  description: 'Prioritized activity dashboard for Customer Success',
  route: '/cx-powerboard',
  icon: 'layout-dashboard',
  isActive: true,
  subRoles: ['cx_powerboard_manager'],
  routes
};
```

### 8.3 Route Map (planned endpoints)

| Method | Path | Role required | Description |
|--------|------|---------------|-------------|
| GET | `/cx-powerboard` | any | Own dashboard (SSR) |
| GET | `/cx-powerboard/team` | cx_powerboard_manager | Team overview (SSR) |
| GET | `/cx-powerboard/config` | cx_powerboard_manager | Mapping config screen |
| GET | `/cx-powerboard/api/dashboard` | any | Dashboard data (JSON API) |
| GET | `/cx-powerboard/api/team` | cx_powerboard_manager | Team data (JSON API) |
| POST | `/cx-powerboard/api/wins` | cx_powerboard_manager | Record a win |
| GET | `/cx-powerboard/api/mappings` | any | Read mappings |
| PUT | `/cx-powerboard/api/mappings/:id` | cx_powerboard_manager | Update a mapping |
| POST | `/cx-powerboard/api/mappings` | cx_powerboard_manager | Create a mapping |
| GET | `/cx-powerboard/api/goals` | cx_powerboard_manager | Read all goals |
| PUT | `/cx-powerboard/api/goals/:userId` | cx_powerboard_manager | Set user goal |

### 8.4 Odoo Integration Layer (`odoo-client.js`)

Uses existing `executeKw` / `searchRead` from `src/lib/odoo.js`. No new Odoo integration primitives needed.

```js
// Fetch open activities for a specific Odoo user
export async function fetchUserActivities(env, odooUid) {
  return searchRead(env, {
    model: 'mail.activity',
    domain: [
      ['res_model', '=', 'crm.lead'],
      ['user_id', '=', odooUid]
    ],
    fields: ['id', 'res_id', 'activity_type_id', 'summary', 'date_deadline', 'note'],
    limit: 100
  });
}

// Fetch leads by IDs (for enrichment)
export async function fetchLeadsByIds(env, leadIds) {
  return searchRead(env, {
    model: 'crm.lead',
    domain: [['id', 'in', leadIds]],
    fields: ['id', 'name', 'stage_id', 'partner_id', 'priority']
  });
}

// Fetch all activity types (for mapping config screen)
export async function fetchActivityTypes(env) {
  return searchRead(env, {
    model: 'mail.activity.type',
    domain: [],
    fields: ['id', 'name', 'default_note', 'delay_count']
  });
}
```

### 8.5 Why State-Based (Not Event-Based)

The dashboard uses a **read-and-compute-on-request** pattern, not an event system. Reasons:

1. **Odoo does not push events** — there is no native webhook system for `mail.activity.done` available without Odoo server customization
2. **Polling is expensive** — continuously checking Odoo for status changes would bloat API call counts and hit rate limits (the existing throttle system in `src/lib/odoo.js` exists precisely for this reason)
3. **MVP scope alignment** — we are building a visualization layer, not an integration hub. An event engine would double the scope
4. **Correctness** — a fresh Odoo read on each dashboard load is always accurate. There is no stale state to reconcile
5. **Cloudflare Workers are stateless** — there is no persistent process to maintain subscriptions or queues. Durable Objects or Queues could enable events, but that is future work

**Result:** Every dashboard load triggers fresh Odoo reads. This is correct, simple, and maintainable.

### 8.6 Why We Do NOT Duplicate Activities

Duplicating `mail.activity` records into Supabase would mean:

1. **Synchronization problem** — activities in Odoo change constantly (completed, rescheduled, reassigned). A copy in Supabase would drift immediately
2. **Single source of truth violation** — CX users complete activities in Odoo. The system must always reflect that state. A copy that lags by minutes or hours would cause confusion and distrust
3. **Extra complexity** — a sync system requires error handling, retry logic, conflict resolution, and a whole new surface area for bugs
4. **No benefit** — the only data we own in Supabase is configuration (mappings, goals) and derived stats (wins). Raw activities are Odoo's responsibility

**Result:** Odoo is always queried directly for activity data. We own nothing we don't need to own.

### 8.7 Extensibility Design

The architecture supports future growth in specific ways:

| Future need | How the current design supports it |
|-------------|-----------------------------------|
| Add project.task to dashboard | `res_model` filter in the Odoo query is already parameterized. Add `['res_model', 'in', ['crm.lead', 'project.task']]`. Scoring is model-agnostic |
| Add webinar activities | Same as above — `cx_activity_mapping` is model-agnostic in its schema |
| Rules engine (complex priority logic) | `scoring.js` is isolated as a pure function. Replace or extend it without touching the rest |
| Event ingestion (Odoo webhook) | The `wins-service.js` is already decoupled from the trigger source. Connect a webhook endpoint to the same service |
| Weekly view / date ranges | The bucketing logic (today / this week) lives in `dashboard-service.js`. Add date range parameters to the API |
| Mobile app | All dashboard data is available via `GET /cx-powerboard/api/dashboard` as JSON |

---

## 9. Future Extensions

### Phase 2 — Automated Win Detection

**What:** Instead of manual win recording, detect when a CX user marks an activity as done in Odoo.

**How:** Either:
- Periodic poll: call `mail.activity` with `date_done != false AND user_id = X` and compare against last-seen state (simple but with delay)
- Odoo webhook: configure an Odoo automations rule to POST to our Worker endpoint when an activity is done (zero-lag but requires Odoo server config)

**Why not now:** Both require non-trivial reliability handling. Manual recording is adequate for MVP and allows us to validate the wins feature before over-investing.

### Phase 3 — Extended Model Support

**What:** Show activities on `project.task`, `helpdesk.ticket`, webinar registrations, etc.

**How:** The model is already parameterized. Each model needs:
- A new `res_model` value in the Odoo activity filter
- A corresponding detail-fetch function in `odoo-client.js`
- A new card template in `ui.js` for that model's fields

**Why not now:** MVP validates the pattern with `crm.lead` first.

### Phase 4 — Team Gamification

**What:** Leaderboard, streaks, badges for wins.

**How:** `cx_user_daily_stats` already has the data needed. Add a `streak_count` column and a leaderboard endpoint. Visual layer only.

### Phase 5 — Mobile / Progressive Web App

**What:** CX users access the Powerboard from their phone.

**How:** The JSON API endpoints (`/api/dashboard`) already exist. Build a thin mobile-first client consuming those endpoints.

---

## 10. Risks & Edge Cases

### 10.1 Odoo UID mapping

**Risk:** We need to know each platform user's Odoo UID to filter activities correctly. If this mapping is missing, the user sees no activities.

**Mitigation:** 
- Verify whether `users` table already has an `odoo_uid` column
- If not, add it as part of this module's migration
- Show a clear error if `odoo_uid` is null for a user: "Your Odoo account is not linked. Please contact an administrator."

### 10.2 Odoo API rate limits

**Risk:** Loading the team manager view fetches activities for all team members in sequence, potentially hitting Odoo's rate limits.

**Mitigation:**
- The existing throttle system (`THROTTLE_DELAY_MS = 200ms` in `src/lib/odoo.js`) already handles this
- For team view, fetch activities for all users in a **single Odoo call** using `['user_id', 'in', [uid1, uid2, ...]]` instead of N separate calls
- Limit team view to maximum 20 users per load

### 10.3 Clock drift / timezone

**Risk:** "Today" vs "overdue" calculations depend on the server timezone. An activity due at midnight might appear overdue one hour early or late.

**Mitigation:**
- Use Odoo's `date_deadline` as a `DATE` (not datetime) — it has no time component
- Compare against local date in user's timezone for display
- For backend sorting, use UTC date consistently

### 10.4 Large number of activities

**Risk:** A user with 200 open activities would cause a large render and slow Odoo queries.

**Mitigation:**
- Apply `limit: 100` to the Odoo activity fetch (configurable constant)
- Show only the top 30 results on initial render with a "show more" link
- Document the limit clearly in the UI

### 10.5 Mapping gaps (unmapped activity types)

**Risk:** A new activity type is created in Odoo but has no entry in `cx_activity_mapping`. It appears on the dashboard but with incorrect priority.

**Mitigation:**
- Default fallback: `priority_weight = 10`, `category = 'admin'`, `is_win = false`
- Warning banner shown to managers: "X activity types have no mapping. Configure them here."
- The mapping configuration screen lists ALL Odoo activity types, pre-populated with defaults

### 10.6 Wins recorded to wrong user

**Risk:** A manager accidentally records a win for the wrong user.

**Mitigation:**
- The POST `/api/wins` endpoint requires explicit `user_id` — no implicit "current user"
- The API response includes the updated stats row for confirmation
- MVP does not implement an undo feature — this is a known limitation

### 10.7 Odoo unreachable

**Risk:** Odoo is down or slow. Dashboard fails to load.

**Mitigation:**
- Wrap all Odoo calls in try/catch
- Return a graceful error page with a "Retry" button — not a 500 error
- If Odoo times out, show the cached mapping/goal data from Supabase with a banner: "Activity data unavailable. Displaying last known configuration."
- MVP does not implement activity caching (this would reintroduce the stale-state problem). The error state is sufficient.

### 10.8 User has no Odoo activities

**Risk:** A properly configured user simply has zero open activities. This looks identical to a misconfiguration.

**Mitigation:**
- Show a distinct "All clear" empty state with a checkmark icon
- Distinguish from the error state (which shows a warning icon)
- Show timestamp: "Last checked: 14:32 — No open activities"

---

## Appendix A — Architectural Decision Record

### ADR-001: No activity duplication in Supabase

**Decision:** Do not store `mail.activity` records in Supabase.
**Reason:** Sync complexity, stale data risk, and violation of single-source-of-truth principle.
**Alternative considered:** Periodic sync job. Rejected: introduces failure modes without commensurate benefit for MVP.

### ADR-002: Manual win recording in MVP

**Decision:** Wins are recorded by manager action, not by detecting Odoo activity completion.
**Reason:** Odoo does not expose a reliable, low-complexity webhook for `mail.activity.done`. Polling adds complexity. Manual recording is sufficient for the MVP use case.
**Future path:** Phase 2 automated detection via Odoo automation rules or scheduled poll.

### ADR-003: One scoring algorithm, no configuration

**Decision:** The priority score formula is hardcoded in `scoring.js`, not configurable.
**Reason:** Simpler to explain, simpler to debug. The only variable the manager controls is `priority_weight` per activity type.
**Alternative considered:** A rules builder interface. Rejected: severe over-engineering for MVP.

### ADR-004: No new global roles

**Decision:** Use one module sub-role (`cx_powerboard_manager`) rather than adding a new global `cx_manager` role to the `users` table.
**Reason:** The existing role system (`admin`, `manager`, `user`) plus module sub-roles is sufficient. Adding a new role would require changes to authentication middleware and all existing permission checks.

### ADR-005: SSR-first rendering

**Decision:** Dashboard is server-side rendered HTML, not a client-side SPA.
**Reason:** Consistent with all other modules in the platform. No additional JS bundle needed. Works without client-side state management.
**Future path:** A JSON API (`/api/dashboard`) exists from day one to enable a client-side or mobile version later.

---

## Appendix B — Open Questions (require decision before implementation)

| # | Question | Options | Recommended |
|---|----------|---------|-------------|
| B-1 | Does `users` table already have an `odoo_uid` column? | Check schema | Verify before migration |
| B-2 | Should overdue activities be excluded from the weekly bucket or shown in both? | Both / today-only | Today-only (cleaner UX) |
| B-3 | Should the Odoo priority boost (ADR-003 exception) be enabled by default? | Yes / No | No — off by default |
| B-4 | Should managers be able to remove a win they recorded accidentally? | Yes / No | No for MVP, note as known limitation |
| B-5 | What Odoo URL format is used to deep-link to a lead? | `/odoo/crm/<id>` or `/web#id=<id>&model=crm.lead` | Confirm with actual Odoo instance |

---

*End of Analysis Document — Awaiting approval before implementation begins.*
