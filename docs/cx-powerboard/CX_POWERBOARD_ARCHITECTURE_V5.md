# CX Powerboard — Architecture V5
## Today-First, Momentum-Driven Dashboard

> **Supersedes V4.** V4 proposed using `mail.message` as the completion source. V5 replaces that entirely with `mail.activity + keep_done`. This is simpler, safer, and avoids the `partner_id` indirection. Do not use the `mail.message` approach.

---

## 1. Architecture validation: `mail.activity + keep_done`

### The `keep_done` mechanism

`mail.activity.type` has a boolean field `keep_done`. When `true`:
- Completing an activity does **not** delete the `mail.activity` record
- Instead, Odoo sets `active = False` and `date_done = <today>` on the record
- The record stays in the database indefinitely, queryable via `active_test = False`

This gives us a proper, typed, per-user completion log — directly in `mail.activity`.

### Can we completely avoid `mail.message`?

**Yes.** With `keep_done = true` on all tracked types, `mail.activity` contains everything needed:

| Data needed | Field on `mail.activity` | Available? |
|---|---|---|
| Open activities | `active = True` | ✅ |
| Completed activities | `active = False`, `date_done != False` | ✅ (once keep_done set) |
| User attribution | `user_id` (res.users ID, not partner) | ✅ |
| Date of completion | `date_done` (Date field) | ✅ |
| Activity type | `activity_type_id` | ✅ |
| Associated record | `res_model`, `res_id`, `res_name` | ✅ |
| Original deadline | `date_deadline` | ✅ |

`mail.message` is **not needed**. V4's proposal to cache `odoo_partner_id` is **cancelled**.

### Exact domain filters (Odoo RPC)

All queries use `context: { active_test: False }` to bypass the default `active = True` filter.

```
# Open activities — all tracked types, single user
[
  ['user_id', '=', odoo_uid],
  ['active', '=', True],
  ['activity_type_id', 'in', tracked_type_ids]
]

# Completed activities — all tracked types, single user
[
  ['user_id', '=', odoo_uid],
  ['active', '=', False],
  ['date_done', '!=', False],
  ['activity_type_id', 'in', tracked_type_ids]
]

# Completed today — dashboard real-time
[
  ['user_id', '=', odoo_uid],
  ['active', '=', False],
  ['date_done', '=', '<today_str>'],   ← today's date as YYYY-MM-DD, computed server-side in UTC+company_tz
  ['activity_type_id', 'in', tracked_type_ids]
]

# Completed today — cron batch (all tracked users)
[
  ['user_id', 'in', all_odoo_uids],
  ['active', '=', False],
  ['date_done', '=', '<today_str>'],
  ['activity_type_id', 'in', tracked_type_ids]
]
```

Fields to fetch for open activities:
```
['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model', 'res_name', 'summary', 'note']
```

Fields to fetch for completed activities:
```
['id', 'activity_type_id', 'user_id', 'date_done', 'res_model', 'res_name']
```

### Critical prerequisite: `keep_done` must be set BEFORE an activity is completed

If an activity is completed before `keep_done = true` is set on its type, that completion is lost (deleted). For types configured as tracked **from today forward**, this is acceptable — the constraint explicitly permits starting fresh.

---

## 2. Data flow

### 2A. Admin configures a new tracking mapping

```
1. Settings UI loads all mail.activity.type from Odoo (searchRead, no filter)
2. Admin toggles a type to "tracked" + configures: is_win, priority_weight, show_on_dashboard, thresholds
3. On save:
   a. App upserts row in cx_activity_mapping (Supabase)
   b. App calls Odoo via execute_kw:
      model: 'mail.activity.type'
      method: 'write'
      args: [[type_id], { keep_done: true }]
   c. App verifies: reads back keep_done field to confirm
   d. App stores keep_done_confirmed_at timestamp in cx_activity_mapping
4. KV cache for mappings is busted
```

The write to Odoo is **one-directional and permanent**. The app never sets `keep_done = false`, even if the type is later removed from tracking. This is by design: completed activities of that type remain queryable.

### 2B. Daily dashboard load (user)

```
On /cx-powerboard load → fetch('/cx-powerboard/api/activities'):

SERVER SIDE (routes.js, handleGetActivities):

1. Resolve odoo_uid (from users table or Odoo lookup, cached)
2. Load tracked type IDs from cx_activity_mapping (KV-cached, 5 min)
3. Parallel Odoo calls:
   a. fetchTrackedOpenActivities(env, [odoo_uid], tracked_type_ids)
      → mail.activity, active = True
   b. fetchCompletedToday(env, [odoo_uid], tracked_type_ids, todayStr)
      → mail.activity, active = False, date_done = today

4. Compute per-activity urgency (overdue / today / upcoming / none)

5. Compute stats:
   overdue       = open.filter(date_deadline < today).length
   dueToday      = open.filter(date_deadline = today).length
   remainingToday = overdue + dueToday
   completedToday = completedTodayList.length
   futurePlanned  = open.filter(date_deadline > today OR no deadline).length
   isDoneForToday = remainingToday === 0
   todayProgress  = completedToday / (completedToday + remainingToday)  [0–1]

6. Per-type breakdown (for cards):
   For each type in mappingsData:
     remaining_today  = overdue_of_type + today_of_type
     completed_today  = completedTodayList.filter(type).length
     future           = open_of_type - overdue_of_type - today_of_type

7. Read streak from cx_daily_completions (Supabase, single query)

8. Load wins from cx_processed_wins (existing, unchanged)

9. Return JSON: { activities, completedToday, stats, mappings, wins, streak, odooUid, odooBaseUrl }
```

### 2C. Cron (every 15 minutes)

```
handleCxWinDetection (re-uses existing trigger, extended logic):

1. Load tracked users (users with odoo_uid)
2. Load tracked type IDs from cx_activity_mapping
3. Parallel:
   a. fetchTrackedOpenActivities(env, allUids, trackedTypeIds)    ← replaces old fetchActiveActivities
   b. fetchCompletedToday(env, allUids, trackedTypeIds, todayStr) ← new
4. Win detection (SIMPLIFIED — no more poll-and-diff):
   For each activity in completedToday:
     If mapping.is_win = true:
       Upsert into cx_processed_wins (UNIQUE on odoo_activity_id prevents duplicates)
5. Update cx_daily_completions (upsert per user per day):
   For each tracked user:
     completed_count = completedToday.filter(user).length
     overdue_count   = open.filter(user, deadline < today).length
     today_count     = open.filter(user, deadline = today).length
     remaining       = overdue_count + today_count
     cleared_queue   = (remaining === 0)   ← GREATEST logic: never revert to false once true
     UPSERT (platform_user_id, day) → set completed_count, cleared_queue (only upgrade)
6. cx_seen_activities is RETIRED (see §6, migration note)
```

**Why poll-and-diff is retired**: The old cron needed `cx_seen_activities` because disappearances were the only signal. With `keep_done`, completed activities are directly queryable. The diff approach is fragile (reschedules, deletes, merges all look like completions). Direct query is reliable.

---

## 3. UX model

### 3A. Primary state: "am I done for today?"

This is the single most important question. Every screen element must serve this.

**States:**

| State | Condition | Visual treatment |
|---|---|---|
| **Loaded, work to do** | `remainingToday > 0` | Normal — show remaining count prominently |
| **Loaded, done for today** | `isDoneForToday = true` | Success glow — header changes, all cards green |
| **No tracked activities** | No open activities at all | Clean empty state, not alarming |

The header subtitle currently reads "Jouw prioriteitenlijst voor vandaag". When `isDoneForToday`:

```
subtitle → "Alles voor vandaag is klaar ✓"   [text-success]
```

### 3B. Progress — scoped to today only

**Rule**: The progress bar must ONLY count `remainingToday` (overdue + due today) as the denominator. Future tasks never enter the calculation.

```
denominator = completedToday + remainingToday  (today's scope only)
numerator   = completedToday
pct         = numerator / denominator * 100   (starts at 0, ends at 100)
```

When `denominator = 0` (nothing due today, no overdue): bar is full (100%) and styled as success — "nothing to do = done".

Microcopy ladder based on pct:
- `0%`       → "Nog X te gaan"
- `1–49%`    → "Goed bezig — X gedaan"
- `50–99%`   → "Bijna klaar — nog Y te gaan"
- `100%`     → "Alles voor vandaag is klaar"

### 3C. Completion state — per card and global

**Per card** (when `remaining_today_for_type === 0`):
- Background: `bg-success/10`
- Border: `border-success/30`
- Badge: "Klaar ✓" (green, subtle)
- Progress bar: full, green

**Global** (when `isDoneForToday`):
- Stats bar gets soft `bg-success/5` background
- "Achterstallig" cell loses its `text-error` styling
- Header subtitle becomes the completion message
- No confetti, no animation — clean, professional

### 3D. Cards — new layout logic

**What changes:**
- Giant number: was `stats.total` → now `remaining_today` per type  
  (the number that matters: what still needs doing today)
- Progress bar: scoped formula (see 3B)
- Completed today: shown as secondary label below the bar
- Future tasks: demoted to muted one-liner at the bottom

**New card anatomy:**

```
┌──────────────────────────────────────────────────────┐
│  [Type name]                           [status badge] │
│                                                       │
│  [N]  ← remaining today (giant number)               │
│  te gaan vandaag                                      │
│                                                       │
│  ████████████░░░░░  67%                               │
│  5 van 8 gedaan vandaag                               │
│                                                       │
│  [2 achterstallig]  [3 vandaag]                       │
│                                                       │
│  Komende: 4 gepland   ← muted, no pill styling        │
└──────────────────────────────────────────────────────┘
```

When `remaining_today = 0`:
```
┌──────────────────────────────────────────────────────┐
│  [Type name]                              ✓ Klaar     │
│                                                       │
│  [0]  ← muted, not alarming                           │
│  te gaan vandaag                                      │
│                                                       │
│  ████████████████  100%                               │
│  5 van 5 gedaan vandaag                               │
│                                                       │
│  Komende: 4 gepland                                   │
└──────────────────────────────────────────────────────┘
```

### 3E. Momentum signals

**Intra-day feedback** (triggered client-side by crossing thresholds):

| Trigger | Signal |
|---|---|
| First activity completed today (`completedToday` goes from 0 to 1) | Subtle toast: "Eerste taak gedaan — goed bezig!" |
| Progress crosses 50% | No toast (avoid interrupting flow) |
| `isDoneForToday` transitions to `true` | Header + all cards update to completion state. Optional brief toast: "Alles klaar voor vandaag 🎯" |

These are computed client-side by comparing previous render state to new data. No server involvement.

**Streak** (subtle, in header or wins tab):

```
🔥 5 dagen op rij
```

- Position: small chip in the header row, right of the subtitle text, or as a sub-stat in the stats bar
- Only shown if `streak >= 2` (a streak of 1 isn't motivating enough to highlight)
- Does not appear in the danger/urgency visual hierarchy

---

## 4. Metrics definition

### Authoritative source

All metrics derived from `mail.activity` only. No `mail.message`. No `cx_seen_activities`.

### Per-user, per-day metrics (real-time, from Odoo)

| Metric | Formula | Source |
|---|---|---|
| `overdue` | open activities where `date_deadline < today` | `mail.activity` (active=True) |
| `dueToday` | open activities where `date_deadline = today` | `mail.activity` (active=True) |
| `futurePlanned` | open activities where `date_deadline > today` OR no deadline | `mail.activity` (active=True) |
| `remainingToday` | `overdue + dueToday` | Derived |
| `completedToday` | done activities where `date_done = today` | `mail.activity` (active=False) |
| `todayProgress` | `completedToday / (completedToday + remainingToday)` | Derived |
| `isDoneForToday` | `remainingToday === 0` | Derived |
| `streak` | consecutive days with `cleared_queue = true` | `cx_daily_completions` |
| `winsThisWeek` | wins in last 7 days | `cx_processed_wins` |

### Per-type breakdown (for cards)

For each mapped type, same metrics scoped to `activity_type_id = type_id`.

### Stats bar mapping

| Slot | Label | Value | Color |
|---|---|---|---|
| 1 | Te doen vandaag | `remainingToday` | `text-warning` if > 0, `text-success` if 0 |
| 2 | Achterstallig | `overdue` | `text-error` if > 0, muted if 0 |
| 3 | Gedaan vandaag | `completedToday` | `text-success` |
| 4 | Wins (week) | `winsThisWeek` | `text-success` |

---

## 5. Supabase data model (minimal)

### Keep (unchanged)

- `users` — add NO new columns (partner_id no longer needed)
- `cx_activity_mapping` — unchanged schema, add `keep_done_confirmed_at TIMESTAMPTZ` column
- `cx_processed_wins` — unchanged

### Retire

- `cx_seen_activities` — **deprecated**. Once the cron migrates to the direct-query approach, this table can be dropped. It was only needed for poll-and-diff, which is replaced. Migration plan: run both approaches in parallel for 1–2 weeks to validate, then drop.

### Add

```sql
-- cx_daily_completions
-- One row per user per calendar day.
-- Written by cron. Read by dashboard API for streak.

CREATE TABLE cx_daily_completions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day               DATE        NOT NULL,
  completed_count   INTEGER     NOT NULL DEFAULT 0,
  remaining_count   INTEGER     NOT NULL DEFAULT 0,
  cleared_queue     BOOLEAN     NOT NULL DEFAULT false,
  -- cleared_queue: true = at some point during this day, remaining_count was 0
  -- NEVER reverted from true to false once set
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform_user_id, day)
);

CREATE INDEX idx_cdcomp_user_day ON cx_daily_completions (platform_user_id, day DESC);

-- RLS: users can read own rows only
ALTER TABLE cx_daily_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cx_daily_completions_select_own"
  ON cx_daily_completions FOR SELECT TO public
  USING (auth.uid() = platform_user_id);
```

Upsert logic in cron (important — cleared_queue never reverts):

```js
await supabase
  .from('cx_daily_completions')
  .upsert({
    platform_user_id: userId,
    day: todayStr,
    completed_count:  completedCount,
    remaining_count:  remainingCount,
    cleared_queue:    remainingCount === 0 ? true : existingRow?.cleared_queue ?? false,
    // ↑ only upgrade to true, never downgrade
  }, { onConflict: 'platform_user_id,day' });
```

### Streak query (SQL, called from dashboard API)

```sql
WITH cleared_days AS (
  SELECT day
  FROM cx_daily_completions
  WHERE platform_user_id = $1
    AND cleared_queue = true
  ORDER BY day DESC
),
numbered AS (
  SELECT day,
         day - (ROW_NUMBER() OVER (ORDER BY day DESC))::integer AS grp
  FROM cleared_days
),
groups AS (
  SELECT grp, COUNT(*) AS len, MAX(day) AS latest
  FROM numbered
  GROUP BY grp
)
SELECT COALESCE(
  (SELECT len FROM groups WHERE latest >= CURRENT_DATE - 1 ORDER BY latest DESC LIMIT 1),
  0
) AS streak;
```

The `CURRENT_DATE - 1` grace means: if the user hasn't cleared their queue today yet, yesterday's streak is still shown rather than resetting to 0.

### `cx_activity_mapping` schema addition

```sql
ALTER TABLE cx_activity_mapping
  ADD COLUMN IF NOT EXISTS keep_done_confirmed_at TIMESTAMPTZ;
-- null = not yet confirmed; set after successful Odoo write + read-back verification
```

### What is persisted vs. recomputed

| Data | Location | Persistence |
|---|---|---|
| Open activities | Odoo `mail.activity` | Source of truth, never mirrored |
| Completed activities | Odoo `mail.activity` (`active=False`) | Source of truth, never mirrored |
| Wins ledger | `cx_processed_wins` | Permanent, append-only |
| Daily aggregates | `cx_daily_completions` | Compact; cron writes, dashboard reads |
| Streak | Computed from `cx_daily_completions` | SQL query, not stored as a field |
| Today stats | Computed on every API request | Not stored — always fresh from Odoo |

---

## 6. Risks and edge cases

### R1: `keep_done` not confirmed after write

**Risk**: The Odoo `write()` call succeeds at the RPC level but the field change fails silently (permissions, module not installed, Odoo version difference), or the connection drops mid-write.  
**Mitigation**:
1. After every `write` on `keep_done`, immediately `read` back the field to verify
2. Store result in `cx_activity_mapping.keep_done_confirmed_at`
3. Settings UI shows a visual indicator per type: "✓ Geactiveerd in Odoo" vs "⚠ Nog niet bevestigd"
4. Dashboard API warns if any tracked type has `keep_done_confirmed_at IS NULL`

### R2: New activity type created in Odoo, not yet tracked

**Risk**: A CX user gets activities of a new type. Those completions are silently not counted.  
**Mitigation**:
1. Settings UI polls `mail.activity.type` fresh on each load (no caching for this list)
2. Show untracked types as a banner: "2 nieuwe activiteitstypes gevonden — configureer ze"
3. The dashboard API computes a `untrackedTypesDetected` flag by comparing open activity type IDs against `cx_activity_mapping`. If any type is missing, a warning is shown.

### R3: Performance of `mail.activity` (active=False) growing indefinitely

**Risk**: Done activities accumulate; queries against `mail.activity` with `active=False` get slower over months/years.  
**Mitigation**:
1. The `completed_today` query is always filtered by `date_done = today` — only today's records, always fast
2. For the cron `completed_today` batch query, add a strict `date_done = today` filter; no full table scans
3. If Odoo's built-in indices on `(user_id, active, date_done)` are insufficient, propose a database index to the Odoo admin (this is a low-urgency future concern given typical CX team sizes)
4. No historical backfill is needed — system starts from today

### R4: Timezone mismatch between server and Odoo

**Risk**: `date_deadline` and `date_done` are Date fields in Odoo (no time component). They represent the calendar day in the **Odoo company's configured timezone**. The app server computes "today" in UTC unless explicitly configured otherwise.  
**Mitigation**:
1. Compute `todayStr` server-side using a configurable `ODOO_TIMEZONE` env var (e.g., `"Europe/Amsterdam"`)
2. Use `Intl.DateTimeFormat` or equivalent to get the correct calendar date: `new Date().toLocaleDateString('en-CA', { timeZone: env.ODOO_TIMEZONE })` → `YYYY-MM-DD`
3. Never compute `todayStr` client-side (browser timezone is irrelevant to Odoo's date fields)
4. This is one env var addition, no architecture change

### R5: Duplicate win counting on concurrent cron runs

**Risk**: Two cron instances fire within seconds of each other; both see the same `date_done = today` completions and try to insert wins.  
**Mitigation**: Already handled. `cx_processed_wins` has `UNIQUE(odoo_activity_id)`. The upsert with `ignoreDuplicates: true` is idempotent. No change needed.

### R6: User toggles tracking on, then off

**Risk**: Admin enables a type (sets `keep_done = true` in Odoo), records some wins/streaks, then removes the type from `cx_activity_mapping`. Historical data in `cx_processed_wins` and `cx_daily_completions` references a type no longer tracked.  
**Mitigation**:
1. **Never delete** `cx_activity_mapping` rows — only soft-delete or mark `show_on_dashboard = false`
2. Wins remain in `cx_processed_wins` regardless — they were earned
3. `cx_daily_completions` is backwards-compatible — historical rows remain correct
4. `keep_done` in Odoo stays `true` (by design) — no data loss
5. New completions of the untracked type are simply ignored by the query (not in `tracked_type_ids`)

### R7: `user_id` attribution on completed activities

**Risk**: In some Odoo workflows, activities can be reassigned. If user A reassigns an activity to user B, and B completes it, `user_id` on the `mail.activity` record reflects B (the final assignee). This is correct behaviour — B did the work.  
**Risk edge case**: If user B is not a tracked platform user (no `odoo_uid` mapped), the completion is simply not counted for the CX platform. This is acceptable and expected.

### R8: `cx_seen_activities` migration

**Risk**: Poll-and-diff cron and new direct-query cron run simultaneously during transition, causing double win inserts.  
**Mitigation**:
1. The `UNIQUE(odoo_activity_id)` constraint on `cx_processed_wins` prevents double-counting regardless
2. Retire the poll-and-diff approach by removing the `cx_seen_activities` reads/writes from the cron once the direct-query cron is deployed and validated (1–2 week parallel run)

---

## 7. Final recommendation

### Architecture: confirmed correct

Use `mail.activity` with `keep_done = true` as the sole source of truth. No `mail.message`, no `partner_id`, no full activity mirroring to Supabase. This is simpler and more reliable than anything in V4.

The only new Supabase table needed is `cx_daily_completions` (5 columns, written by cron). All other state lives in Odoo.

### Data model summary

```
Odoo:
  mail.activity.type   ← keep_done = true controlled by app
  mail.activity        ← open (active=True) + done (active=False, date_done set)

Supabase (existing):
  cx_activity_mapping  ← type config, is_win, thresholds (+ add keep_done_confirmed_at)
  cx_processed_wins    ← immutable win ledger (unchanged)
  users                ← odoo_uid cached (NO partner_id change)

Supabase (new):
  cx_daily_completions ← compact daily snapshot for streak calculation

Supabase (retire):
  cx_seen_activities   ← no longer needed after direct-query cron is live
```

### UX approach: one clear finish line

The dashboard has one north-star metric: `remainingToday`. Everything else is context. When it hits 0, the interface celebrates — quietly, professionally.

Progress bars measure completed / (completed + remaining_today) only. Future work is visible but demoted. Streaks are a quiet reward, not a pressure mechanism.

### Implementation sequence

**Step 1 (foundation, no visible change):**
- Add `keep_done_confirmed_at` to `cx_activity_mapping` (migration)
- Create `cx_daily_completions` table (migration)
- Add `fetchTrackedOpenActivities` and `fetchCompletedToday` to `odoo-client.js`
- Add `setKeepDone(env, typeId)` + `verifyKeepDone(env, typeId)` to `odoo-client.js`
- Wire `setKeepDone` into the mapping create/update flow in Settings
- Extend cron to: (a) query completed-today directly, (b) upsert `cx_daily_completions`, (c) detect wins from direct query instead of poll-and-diff

**Step 2 (API — no UI change):**
- `handleGetActivities` fetches `completedToday` from Odoo in parallel with open activities
- Add `completedToday`, `remainingToday`, `isDoneForToday`, `streak` to the stats response
- Existing UI ignores unknown fields — zero breaking changes

**Step 3 (UI — visual shift):**
- Stats bar: new labels + IDs (`statRemainingToday`, `statCompletedToday`)
- Boot script: map new fields to new elements
- `buildTypeCard()`: change giant number, fix progress bar formula, add microcopy
- Add `isDoneForToday` global state (header + stats bar styling)
- Add streak chip in header

**Step 4 (cleanup):**
- Retire `cx_seen_activities` reads/writes from cron after 2-week validation
- Drop `cx_seen_activities` table
- Settings UI: add `keep_done_confirmed_at` status indicator per type

Each step is independently deployable and non-breaking.
