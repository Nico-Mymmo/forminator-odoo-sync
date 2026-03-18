# CX Powerboard — Module Analysis & Design Document (v2)

> **Status: AWAITING APPROVAL — DO NOT IMPLEMENT**
> Version: 2.0 | Date: 2026-03-18
> Supersedes: CX_POWERBOARD_ANALYSIS.md (v1)

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

**CX Powerboard** is a lightweight dashboard module for Customer Success (CX) users built on top of the existing Operations Manager platform (Cloudflare Worker + Supabase + Odoo).

It is a **focus and momentum layer** — not a task manager, not a replacement for Odoo.

A CX user opens the Powerboard and sees their most important open activities, sorted by priority. They click one, do the work in Odoo, come back. Their win counter updates automatically. A manager can see the team's tempo at a glance.

**What it is:**
- A prioritized view of existing Odoo `mail.activity` records on `crm.lead`
- A wins tracker that detects completed activities automatically
- A manager overview of team activity health

**What it is NOT:**
- A task manager or parallel activity system
- A replacement for Odoo activities
- A manual input system for wins
- An event-driven integration hub

**Core principle:** Odoo is the single source of truth. The Powerboard only reads from Odoo. Win detection is automated via a scheduled background job — no human records wins manually.

---

## 2. Functional Overview

### 2.1 CX User — What they can do

| Action | Description |
|--------|-------------|
| View dashboard | See their own open activities sorted by priority |
| Switch period | Toggle between "Today" and "This week" |
| Open a lead | Click any item → Odoo lead form opens in new tab |
| See wins counter | Top bar: "X wins today / Y target" |
| See progress bar | Visual fill toward daily wins goal |

**What they cannot do in the dashboard:**
- Complete activities (done in Odoo only)
- Create activities (done in Odoo only)
- Record wins manually (automatic only)

### 2.2 CX Manager — What they can do

| Action | Description |
|--------|-------------|
| View team overview | Wins, open activities, overdue counts per user |
| Drill into a user | View any user's dashboard read-only |
| Configure mappings | Set `priority_weight` and `is_win` per activity type |
| Configure goals | Set daily wins target per user |

### 2.3 Platform Admin — What they can do

All manager capabilities plus:
- Grant `cx_powerboard` module access to users via existing admin panel

---

## 3. Data Model Design

### Overview

Two storage layers:

| Layer | Role |
|-------|------|
| **Odoo** | Source of truth for activities and leads — we only read |
| **Supabase** | Our own data: configuration, win snapshots, daily stats |

We store **no activity data** of our own. We store only the operational layer on top.

---

### 3.1 `cx_activity_mapping`

**Purpose:** Translates an Odoo activity type into operational meaning. Defines how much weight it carries and whether completing it counts as a win.

```sql
CREATE TABLE cx_activity_mapping (
  id                      UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_type_id   INTEGER  NOT NULL,
  odoo_activity_type_name VARCHAR(100) NOT NULL,   -- Cached display name
  priority_weight         INTEGER  NOT NULL DEFAULT 50
                          CHECK (priority_weight >= 0 AND priority_weight <= 100),
  is_win                  BOOLEAN  NOT NULL DEFAULT false,
  -- Audit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES users(id),
  -- Constraints
  UNIQUE (odoo_activity_type_id)
);
```

**Fields — exactly these, nothing more:**

| Field | Purpose |
|-------|---------|
| `odoo_activity_type_id` | Links to Odoo's `mail.activity.type.id` |
| `odoo_activity_type_name` | Cached name — avoids extra Odoo call on every render |
| `priority_weight` | 0–100 score contribution in the priority formula |
| `is_win` | If `true`, completing this activity increments the user's daily wins count |

**No `category`, no `expected_duration_minutes`, no `effort_score` linkage.** Removed — not needed in MVP.

**Fallback:** If no mapping exists for an activity type, defaults are used in code: `priority_weight = 10`, `is_win = false`. The dashboard never fails due to missing mappings.

---

### 3.2 `cx_seen_activities`

**Purpose:** Snapshot of open activity IDs per user, maintained by the cron job. This is the mechanism that enables win detection without webhooks or event streams.

```sql
CREATE TABLE cx_seen_activities (
  id                    UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_id      INTEGER  NOT NULL,
  odoo_user_id          INTEGER  NOT NULL,    -- Odoo UID, not platform UUID
  activity_type_id      INTEGER  NOT NULL,    -- Odoo mail.activity.type ID
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  UNIQUE (odoo_activity_id)
);

CREATE INDEX idx_cx_seen_odoo_user ON cx_seen_activities (odoo_user_id);
```

**How it works:**
- The cron job fetches all currently open `mail.activity` records from Odoo
- It upserts this set into `cx_seen_activities` (updating `last_confirmed_at`)
- Any row whose `last_confirmed_at` is older than the last cron run = that activity has disappeared from Odoo = it was completed
- Those disappeared activities are the candidates for win detection

---

### 3.3 `cx_processed_wins`

**Purpose:** Idempotency log. Records every activity ID that has already been processed for win detection. Prevents double-counting under any circumstances.

```sql
CREATE TABLE cx_processed_wins (
  odoo_activity_id  INTEGER  NOT NULL,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  was_win           BOOLEAN  NOT NULL,
  odoo_user_id      INTEGER  NOT NULL,
  -- Constraints
  PRIMARY KEY (odoo_activity_id)    -- One row per activity, ever
);
```

**Logic:** When an activity disappears from Odoo, we attempt `INSERT INTO cx_processed_wins ... ON CONFLICT DO NOTHING`. If it inserts successfully, we process the win. If there is a conflict (already processed), we skip it silently. This guarantees exactly-once win counting.

---

### 3.4 `cx_user_daily_stats`

**Purpose:** Stores the daily wins count per user. Written exclusively by the cron job.

```sql
CREATE TABLE cx_user_daily_stats (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date   DATE    NOT NULL,
  wins_count  INTEGER NOT NULL DEFAULT 0,
  -- Audit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  UNIQUE (user_id, stat_date)
);

CREATE INDEX idx_cx_daily_stats_user_date
  ON cx_user_daily_stats (user_id, stat_date DESC);
```

**No `effort_score`.** Removed — metric not needed in MVP.

Updated via upsert: `INSERT ... ON CONFLICT (user_id, stat_date) DO UPDATE SET wins_count = wins_count + 1`.

---

### 3.5 `cx_goal`

**Purpose:** Daily wins target per user. Compared against `cx_user_daily_stats` to render the progress bar.

```sql
CREATE TABLE cx_goal (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period        VARCHAR(10) NOT NULL DEFAULT 'daily'
                CHECK (period IN ('daily', 'weekly')),
  target_value  INTEGER NOT NULL DEFAULT 5
                CHECK (target_value > 0),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID    REFERENCES users(id),
  -- Constraints
  UNIQUE (user_id, period)
);
```

MVP uses `period = 'daily'` only. If no goal row exists for a user, the dashboard shows wins count without a target bar.

---

### 3.6 Odoo data (read-only, never stored)

#### `mail.activity` — fields we read:

| Field | Used for |
|-------|---------|
| `id` | Activity identifier; stored in `cx_seen_activities` |
| `res_id` | Lead ID — for enrichment and deep-link |
| `res_model` | Filter: must equal `'crm.lead'` |
| `activity_type_id` | Join with `cx_activity_mapping` |
| `summary` | Activity description shown on card |
| `date_deadline` | Urgency score calculation |
| `user_id` | Filter by current user |

#### `crm.lead` — fields we read (fetched by `res_id`):

| Field | Used for |
|-------|---------|
| `id` | Deep-link to Odoo form |
| `name` | Lead name on card |
| `stage_id` | Stage shown on card; used for optional stage boost |
| `partner_id` | Company/contact name on card |
| `priority` | Optional Odoo priority boost in scoring |

---

### 3.7 Required Supabase Migrations

Four migration files:

1. `create_cx_activity_mapping.sql`
2. `create_cx_seen_activities.sql`
3. `create_cx_processed_wins.sql`
4. `create_cx_user_daily_stats.sql`
5. `create_cx_goal.sql`

Plus RLS policies per table (see Section 6).

---

## 4. Data Flow

### 4.1 Dashboard Load Flow

```
Browser → GET /cx-powerboard
         ↓
  [Cloudflare Worker]
  1. Validate session → get user (user_id, role, odoo_uid)
  
  2. Parallel fetches:
     a. Odoo: mail.activity
        domain: [
          ['res_model', '=', 'crm.lead'],
          ['user_id', '=', <odoo_uid>]
        ]
        fields: [id, res_id, activity_type_id, summary, date_deadline]
        limit: 100
     b. Supabase: cx_activity_mapping (all rows, from in-memory cache or DB)
     c. Supabase: cx_user_daily_stats WHERE user_id = X AND stat_date = TODAY
     d. Supabase: cx_goal WHERE user_id = X AND period = 'daily' AND is_active = true

  3. From (a): extract unique res_ids
  
  4. Odoo: crm.lead
     domain: [['id', 'in', [<res_ids>]]]
     fields: [id, name, stage_id, partner_id, priority]

  5. ENRICH each activity:
     - Attach lead data (name, stage, partner, priority)
     - Attach mapping (priority_weight, is_win) — or fallback defaults
     - Calculate priority_score (Section 5)

  6. SORT by priority_score DESC

  7. SPLIT:
     - "Today" bucket:     date_deadline <= today
     - "This week" bucket: date_deadline within 7 days from today

  8. Render SSR HTML → return to browser
```

---

### 4.2 Win Detection Flow (Cron Job)

This runs on a **Cloudflare Worker scheduled handler** (cron trigger). It is the only way wins are recorded. No human input. No endpoint.

```
[Cloudflare Cron — every 15 minutes]
         ↓
  [Scheduled Worker handler]

  1. Fetch all currently open activities from Odoo for ALL tracked users:
     model: mail.activity
     domain: [['res_model', '=', 'crm.lead']]
     fields: [id, user_id, activity_type_id]
     limit: false  (fetch all)

  2. Build set of current activity IDs: currentIds = Set([...])

  3. Query Supabase cx_seen_activities:
     SELECT odoo_activity_id, odoo_user_id, activity_type_id
     FROM cx_seen_activities

  4. Compute disappeared = rows in cx_seen_activities
     where odoo_activity_id NOT IN currentIds
     → These activities existed before and are now gone = completed in Odoo

  5. For each disappeared activity:
     a. INSERT INTO cx_processed_wins (odoo_activity_id, odoo_user_id, was_win=false)
        ON CONFLICT (odoo_activity_id) DO NOTHING
        → Returns whether the row was inserted (new) or skipped (already processed)

     b. If SKIPPED → skip this activity entirely (idempotent)

     c. If INSERTED:
        - Look up cx_activity_mapping for activity_type_id
        - If mapping.is_win = true:
          → Update cx_processed_wins SET was_win = true
          → Look up platform user_id from odoo_uid mapping
          → UPSERT cx_user_daily_stats:
            INSERT (user_id, stat_date=TODAY, wins_count=1)
            ON CONFLICT (user_id, stat_date)
            DO UPDATE SET wins_count = wins_count + 1, updated_at = NOW()

  6. UPSERT all current activities into cx_seen_activities:
     For each activity in currentIds:
       INSERT (odoo_activity_id, odoo_user_id, activity_type_id, last_confirmed_at=NOW())
       ON CONFLICT (odoo_activity_id)
       DO UPDATE SET last_confirmed_at = NOW()

  7. CLEAN UP: DELETE FROM cx_seen_activities
     WHERE last_confirmed_at < NOW() - INTERVAL '1 hour'
     (Removes entries that disappeared AND were already processed)
```

**Key properties:**
- **No duplicates:** `cx_processed_wins` PRIMARY KEY on `odoo_activity_id` guarantees each activity is processed at most once, ever.
- **No missed events:** The cron fires every 15 minutes. Even if a run fails, the next run catches it — disappeared activities remain eligible until they are inserted into `cx_processed_wins`.
- **No webhooks needed:** Pure poll-and-diff. Works with Odoo as-is.
- **No user action required:** Fully automatic.

---

### 4.3 Cron Trigger Configuration (`wrangler.jsonc`)

```jsonc
"triggers": {
  "crons": ["*/15 * * * *"]   // Every 15 minutes
}
```

The Worker's `scheduled` export handler is wired to the win detection job.

---

## 5. Priority Logic

### 5.1 Scoring Formula

Each activity receives a `priority_score` (0–215):

```
priority_score = priority_weight + urgency_score + stage_boost
```

### 5.2 Components

**`priority_weight`** — from `cx_activity_mapping` (0–100)

**`urgency_score`** — from `date_deadline`:

| Deadline state | Score |
|----------------|-------|
| Overdue | +100 |
| Due today | +80 |
| Due tomorrow | +60 |
| Due in 2–3 days | +40 |
| Due in 4–7 days | +20 |
| Due in 8+ days | +5 |
| No deadline | +0 |

**`stage_boost`** — hardcoded in `scoring.js`, not configurable, does NOT touch the database:

| Condition | Boost |
|-----------|-------|
| `crm.lead.priority = '2'` (high) | +10 |
| `crm.lead.priority = '3'` (very high) | +15 |
| All other priorities | +0 |

The stage boost is applied **in code only**. A manager adjusting mappings has no effect on it. It is small enough to never override a major urgency difference, but enough to surface hot leads.

### 5.3 Example Scores

| Activity | weight | Deadline | urgency | boost | **Total** |
|----------|--------|----------|---------|-------|-----------|
| Demo Call | 90 | Overdue | 100 | 0 | **190** |
| Email (hot lead) | 40 | Today | 80 | 15 | **135** |
| Demo Call | 90 | In 5 days | 20 | 0 | **110** |
| Admin task | 10 | Today | 80 | 0 | **90** |
| Admin task | 10 | In 8 days | 5 | 0 | **15** |

### 5.4 Fallback for unmapped activity types

`priority_weight = 10`, `is_win = false`. Dashboard always renders.

### 5.5 Tie-breaking

Equal scores → sort by `date_deadline` ASC, then `odoo_activity_id` ASC (deterministic).

---

## 6. Security Model

### 6.1 Platform access

| Who | Access mechanism |
|-----|-----------------|
| CX user | Admin grants `cx_powerboard` in `user_modules` table |
| CX manager | Same, plus sub-role `cx_powerboard_manager` (see below) |
| Platform admin | Global `role = 'admin'` — bypasses all sub-role checks |

**One new module sub-role: `cx_powerboard_manager`**
Follows the existing sub-role pattern (`marketing_signature`, etc.). A regular user with this sub-role gains team view and mapping/goal configuration access. No new global roles are introduced. No changes to `users.role` enum.

### 6.2 Odoo UID mapping

The Worker calls Odoo using the **platform's shared API key and UID** (`env.API_KEY`, `env.UID`). It then filters activity results by the individual user's Odoo UID.

**This filter is enforced in the Odoo domain query — not just in application code.** If the domain filter is omitted, a user would see activities belonging to others. The filter `['user_id', '=', odoo_uid]` must be present on every user-facing activity fetch.

**`odoo_uid` storage:** Each platform user must have their Odoo integer UID stored. This is stored in `users.odoo_uid` (to be verified — if this column does not exist, it is added in the migration for this module). A user with `odoo_uid = NULL` sees an error: *"Your Odoo account is not linked. Contact your administrator."*

**Cron job:** The scheduled handler fetches ALL activities (no user filter) because it needs to detect wins across the entire team. It uses the platform API key. The result is then matched to platform users via the `odoo_uid` mapping table.

### 6.3 Supabase RLS Policies

#### `cx_activity_mapping`

```sql
ALTER TABLE cx_activity_mapping ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users (needed for dashboard scoring)
CREATE POLICY "cx_mapping_read" ON cx_activity_mapping
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write: managers and admins only (Worker enforces this too)
CREATE POLICY "cx_mapping_write" ON cx_activity_mapping
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );
```

#### `cx_seen_activities` and `cx_processed_wins`

```sql
-- Only service_role (Worker) can read/write these tables
-- No user-facing access needed
ALTER TABLE cx_seen_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cx_seen_service_only" ON cx_seen_activities
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE cx_processed_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cx_wins_service_only" ON cx_processed_wins
  FOR ALL USING (auth.role() = 'service_role');
```

#### `cx_user_daily_stats`

```sql
ALTER TABLE cx_user_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cx_stats_read_own" ON cx_user_daily_stats
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "cx_stats_read_manager" ON cx_user_daily_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Write: service_role only (cron job)
CREATE POLICY "cx_stats_write_service" ON cx_user_daily_stats
  FOR ALL USING (auth.role() = 'service_role');
```

#### `cx_goal`

```sql
ALTER TABLE cx_goal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cx_goal_read_own" ON cx_goal
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "cx_goal_read_manager" ON cx_goal
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

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
| Wins recorded automatically | ✅ | ✅ | ✅ |
| Record wins manually | ❌ | ❌ | ❌ |
| Configure mappings | ❌ | ✅ | ✅ |
| Configure goals | ❌ | ✅ | ✅ |
| View own wins | ✅ | ✅ | ✅ |
| View team wins | ❌ | ✅ | ✅ |

---

## 7. UX Structure

### 7.1 CX User Dashboard

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

### 7.2 Activity Card — Fields

| Field | Source |
|-------|--------|
| Urgency badge | Calculated: 🔴 OVERDUE / 🟠 TODAY / 🟡 N DAYS |
| Activity type name | `mail.activity.activity_type_id` display name |
| Lead name | `crm.lead.name` |
| Partner | `crm.lead.partner_id` name |
| Activity summary | `mail.activity.summary` |
| Stage | `crm.lead.stage_id` name |
| Deadline | Relative display: "Today", "Tomorrow", "3 days", or date string |
| Open button | Links to `<odoo_url>/odoo/crm/<lead_id>` — new tab |

### 7.3 Wins Counter Bar

- Shown at top of page at all times
- Format: `[progress bar]  X / Y target`
- Color: green when ≥ target, amber when 50–99%, grey when < 50%
- No goal configured → shows `X wins today` with no bar
- **Wins update on page reload.** The cron runs every 15 minutes. When a user completes work in Odoo and returns to the Powerboard, refreshing the page will reflect the new win count within at most 15 minutes. No real-time push needed for MVP.

### 7.4 Empty States

| Condition | Display |
|-----------|---------|
| No open activities | ✅ "All clear. No open activities." + last-checked timestamp |
| Odoo unreachable | ⚠️ "Could not load from Odoo. Try refreshing." |
| `odoo_uid` not set | ⚠️ "Your Odoo account is not linked. Contact an administrator." |
| No mappings configured | ℹ️ Banner: "Activity types have no priority mapping. Defaults are applied." |

### 7.5 Manager — Team Overview

```
┌────────────────────────────────────────────────────────┐
│  CX Powerboard — Team Overview          [2026-03-18]   │
├────────────────────────────────────────────────────────┤
│  ┌────────────┬──────┬────────┬─────────┬───────────┐  │
│  │ User       │ Wins │ Target │ Open    │ Overdue   │  │
│  ├────────────┼──────┼────────┼─────────┼───────────┤  │
│  │ Anna       │  4   │   5    │   8     │    1      │  │
│  │ Ben        │  2   │   5    │  12     │    3 🔴   │  │
│  │ Clara      │  5   │   5    │   6     │    0      │  │
│  └────────────┴──────┴────────┴─────────┴───────────┘  │
│  Click any row to view that user's dashboard.          │
└────────────────────────────────────────────────────────┘
```

Overdue count ≥ 1 is highlighted red. Win count ≥ target is highlighted green.

### 7.6 Manager — Mapping Configuration

Simple table. One row per Odoo activity type. Inline editable:

```
Activity Type    | Weight (0–100) | Is Win?
-----------------|----------------|--------
Demo Call        |      90        |  ✅ Yes
Email Follow-up  |      40        |  ✅ Yes
Phone Call       |      70        |  ✅ Yes
Admin Task       |      10        |  ❌ No
[unmapped type]  |      10 (def.) |  ❌ No  ← highlighted, no mapping yet
```

Activity types in Odoo with no mapping row are shown pre-filled with defaults, highlighted in amber. Manager can save them to create a real mapping.

---

## 8. Technical Architecture

### 8.1 Module File Structure

```
src/modules/cx-powerboard/
├── module.js              ← Module descriptor
├── routes.js              ← HTTP route handlers
├── ui.js                  ← SSR: CX user dashboard
├── ui-manager.js          ← SSR: team view + mapping config
├── odoo-client.js         ← All Odoo API calls
├── scoring.js             ← Pure priority score function
├── cron.js                ← Scheduled handler (win detection job)
└── services/
    ├── dashboard-service.js   ← Fetch → enrich → sort pipeline
    ├── wins-service.js        ← Win upsert into cx_user_daily_stats
    └── mapping-service.js     ← CRUD for cx_activity_mapping
```

`cron.js` is the scheduled event handler. It imports `wins-service.js` and `odoo-client.js`. It is **not** reachable via any HTTP route.

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

### 8.3 HTTP Route Map

No `/api/wins` endpoint exists. Wins are written by the cron, not by HTTP.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/cx-powerboard` | any | Own dashboard (SSR) |
| GET | `/cx-powerboard/team` | cx_powerboard_manager | Team overview (SSR) |
| GET | `/cx-powerboard/config` | cx_powerboard_manager | Mapping config (SSR) |
| GET | `/cx-powerboard/api/dashboard` | any | Dashboard JSON (for future mobile) |
| GET | `/cx-powerboard/api/team` | cx_powerboard_manager | Team stats JSON |
| GET | `/cx-powerboard/api/mappings` | any | Read all mappings |
| PUT | `/cx-powerboard/api/mappings/:id` | cx_powerboard_manager | Update a mapping |
| POST | `/cx-powerboard/api/mappings` | cx_powerboard_manager | Create a mapping |
| GET | `/cx-powerboard/api/goals` | cx_powerboard_manager | Read all goals |
| PUT | `/cx-powerboard/api/goals/:userId` | cx_powerboard_manager | Set a user's goal |

### 8.4 Mapping Cache (in-memory)

`cx_activity_mapping` rows are read on every dashboard load. To avoid a Supabase round-trip on every request, they are cached in the Worker's module-level memory.

```
Cache strategy:
- Store: Map<odoo_activity_type_id, { priority_weight, is_win }>
- TTL: 5 minutes (cached_at timestamp stored alongside)
- On cache miss or expiry: fetch all rows from Supabase, rebuild map
- On cache hit: return map directly
- Fallback: if Supabase is unreachable, return last known cache regardless of TTL
```

**Note:** Cloudflare Workers are stateless between requests. However, within a single Worker instance (which may handle multiple requests in quick succession), module-level variables persist. This provides a best-effort cache, not a guaranteed one. For MVP, this is sufficient — a cold cache simply means one extra Supabase query per Worker instance startup.

### 8.5 Cron Wrangler Configuration

Add to `wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["*/15 * * * *"]
}
```

The Worker's exported `scheduled` handler is wired to `cron.js`. The main `fetch` handler is unchanged.

### 8.6 Why State-Based (Not Event-Based) for the Dashboard

The dashboard uses **read-on-request**. Reasons:
1. Odoo exposes no native push events for `mail.activity`
2. Cloudflare Workers are stateless — no persistent subscriptions
3. A fresh Odoo read on each page load is always accurate
4. Complexity of a real-time push system far exceeds MVP value

### 8.7 Why Polling (Not Webhook) for Win Detection

The cron job is a **poll-and-diff** approach. Reasons:
1. Odoo automation webhooks require server-side Odoo configuration — out of scope for MVP
2. The poll-and-diff pattern is simple, auditable, and requires no Odoo changes
3. A 15-minute detection lag is acceptable for a daily wins tracker
4. The `cx_processed_wins` idempotency table means late detection is safe — it's still exactly-once

### 8.8 Why No Activity Duplication

Storing `mail.activity` rows in Supabase would require:
- A continuous sync mechanism
- Conflict resolution when Odoo changes an activity
- A staleness problem (lag between Odoo state and our copy)

We own nothing we don't need to own. The only Supabase writes are:
- Configuration (mappings, goals) — rarely changes
- Snapshots for diff detection (`cx_seen_activities`) — written by cron, not users
- Derived stats (`cx_user_daily_stats`) — written by cron, not users

### 8.9 Extensibility

| Future need | How current design supports it |
|-------------|-------------------------------|
| Add `project.task` | Change `res_model` filter, add lead-fetch equivalent. Scoring is model-agnostic. |
| Add more models | Same pattern. `cx_activity_mapping` is not model-specific. |
| Real-time wins | Replace cron with Odoo webhook → same `wins-service.js`, different trigger |
| Complex priority rules | Replace `scoring.js` pure function without touching anything else |
| Mobile app | `/api/dashboard` JSON endpoint exists from day one |
| Streak tracking | Add `streak_count` to `cx_user_daily_stats` — data already there |

---

## 9. Future Extensions

### Phase 2 — Odoo Webhook Integration

Replace the 15-minute cron poll with a zero-lag webhook. Configure an Odoo server action on `mail.activity.done` to POST to `/cx-powerboard/api/activity-done` (new endpoint, token-authenticated). The `wins-service.js` is already decoupled from trigger source — plug in the webhook handler and remove the cron.

### Phase 3 — Extended Model Support

Add `project.task` and `helpdesk.ticket` to the dashboard. Each needs a new `res_model` filter variant, a corresponding lead/task-fetch function in `odoo-client.js`, and a new card template. The scoring, mapping, and win detection systems require zero changes.

### Phase 4 — Streaks and Leaderboard

Add `streak_count` to `cx_user_daily_stats`. The cron already has everything needed to compute streaks. Leaderboard is a read-only query on `cx_user_daily_stats` for the current week.

### Phase 5 — Mobile / PWA

The `/api/dashboard` JSON endpoint is built in Phase 1. A mobile-optimized client consumes it without any backend changes.

---

## 10. Risks & Edge Cases

### 10.1 `odoo_uid` not set for a user

**Risk:** User sees no activities; cron skips them silently.
**Mitigation:** Explicit UI error if `odoo_uid` is null. Admin can set it. Cron only processes users with a known `odoo_uid`.

### 10.2 Activity deleted in Odoo (not completed — just deleted)

**Risk:** A deleted activity looks identical to a completed one to the cron. If `is_win = true`, a false win is counted.
**Mitigation:** In Odoo, activities that are done are marked with `date_done`, while deleted activities simply disappear. In MVP there is no reliable way to distinguish the two via the `mail.activity` model once they are gone. **This is a known MVP limitation.** In practice, manually deleted activities are rare. Phase 2 (webhook) resolves this by receiving explicit `done` vs `unlink` events.

### 10.3 Cron run failure

**Risk:** A cron run fails mid-way. Some activities are processed, some are not.
**Mitigation:** The idempotency guarantee from `cx_processed_wins` means re-running the cron on the next cycle catches any missed activities without double-counting. Partial writes are safe.

### 10.4 Odoo rate limits during cron

**Risk:** The cron fetches all activities for all users in one call. For large teams this could be a large response, but it is a single API call — not N calls.
**Mitigation:** The existing `THROTTLE_DELAY_MS` in `src/lib/odoo.js` applies. The cron uses `limit: false` on a single `searchRead` call. Odoo handles this as one request regardless of result size. For very large datasets (1000+ activities), pagination may be needed — this is a Phase 2 concern.

### 10.5 Clock skew between Worker and Odoo

**Risk:** The cron determines "today" for `stat_date`. If the Worker clock and Odoo disagree on date boundaries, wins could land on the wrong day.
**Mitigation:** Use `new Date().toISOString().slice(0, 10)` (UTC) as `stat_date` consistently in both cron and dashboard. Document that the system uses UTC dates. Display in local time on the UI side only.

### 10.6 Mapping cache staleness

**Risk:** A manager updates a mapping (e.g., changing `is_win` on an activity type). The cache in already-running Worker instances takes up to 5 minutes to expire.
**Mitigation:** For dashboard scoring, a 5-minute stale mapping is acceptable. For win detection, the cron reads mappings fresh from Supabase on every run — no cache. The cache only affects the SSR render of priority scores, which is a cosmetic concern at worst.

### 10.7 User has no open activities

**Risk:** Empty dashboard looks the same as a broken connection.
**Mitigation:** Two distinct states: "All clear" (✅, shows last-checked time) vs "Connection failed" (⚠️, shows retry button). The distinction is made by whether the Odoo fetch succeeded.

### 10.8 Large number of open activities per user

**Risk:** 100+ activities causes slow render or exceeds display capacity.
**Mitigation:** Fetch limit: 100 activities per user. Display limit: top 30, with "Show more" link. The limit is documented in the UI. A user with 100+ open activities has a CX process problem, not a Powerboard problem.

---

## Appendix A — Architectural Decision Record

### ADR-001: No activity duplication

**Decision:** `mail.activity` records are never stored in Supabase.
**Reason:** Sync complexity, stale data risk, single-source-of-truth principle.

### ADR-002: Automatic win detection via cron, not manual input

**Decision:** Wins are detected by a scheduled cron job comparing activity snapshots. No human records wins.
**Reason:** A manual wins system introduces user error (wrong user, wrong activity, wrong day) and friction. Automation is more accurate and creates no extra work for the manager. The 15-minute lag is acceptable.
**Alternative rejected:** Manual manager input. Inconsistent, error-prone, not scalable.

### ADR-003: Idempotency via `cx_processed_wins`

**Decision:** Every processed activity is recorded in `cx_processed_wins` with a PRIMARY KEY on `odoo_activity_id`.
**Reason:** Guarantees exactly-once win counting regardless of cron restart, retries, or network failures.

### ADR-004: Simplified mapping model

**Decision:** `cx_activity_mapping` has only `odoo_activity_type_id`, `odoo_activity_type_name`, `priority_weight`, `is_win`.
**Reason:** `category` and `expected_duration_minutes` are not used in any MVP formula or display. Removed to keep the model minimal and the config UI simple.

### ADR-005: No new global roles

**Decision:** One module sub-role (`cx_powerboard_manager`). No changes to `users.role`.
**Reason:** The existing global role enum and auth middleware are stable. A sub-role achieves the same access separation without touching shared infrastructure.

### ADR-006: Stage boost hardcoded in `scoring.js`

**Decision:** The Odoo lead priority boost (+10/+15) is hardcoded, not configurable.
**Reason:** A configurable boost requires DB storage, a settings screen, and cache invalidation. The values are simple and unlikely to need tuning. If they do, a code change is appropriate — this is internal logic, not business configuration.

### ADR-007: SSR-first

**Decision:** All views are server-side rendered HTML.
**Reason:** Consistent with all other platform modules. No JS bundle needed. The JSON API endpoints exist in parallel for future mobile/client use.

---

## Appendix B — Open Questions (resolve before implementation)

| # | Question | Recommended |
|---|----------|-------------|
| B-1 | Does `users` table have `odoo_uid` column? | Check schema; add in migration if not |
| B-2 | Overdue activities: show in "Today" bucket only, or also in "This week"? | Today only (cleaner) |
| B-3 | Odoo deep-link format: `/odoo/crm/<id>` or `/web#id=<id>&model=crm.lead`? | Confirm with actual instance |
| B-4 | Should cron also track wins for activities on models other than `crm.lead`? | No — MVP is `crm.lead` only |
| B-5 | Is 15 minutes an acceptable win detection lag? | Yes for MVP — confirm with stakeholder |

---

*End of Analysis Document v2 — Awaiting approval before implementation begins.*
