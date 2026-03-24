# CX Powerboard — V4 Analysis: Today-First, Momentum-Driven Dashboard

## 1. Odoo activity completion mechanics — what actually happens

### The fundamental constraint

`mail.activity` records are **deleted** when marked done. There is no "completed" state, no archive flag, no `date_done` field on the activity itself. The record simply disappears.

**This means `mail.activity` cannot tell you what was finished today.** Querying `[['active', '=', false]]` returns nothing useful — Odoo does not archive activities, it deletes them.

### Where the trace *does* exist

When a CX agent clicks "Mark Done" in Odoo UI, Odoo calls `mail.activity._action_done()`, which:
1. Posts a `mail.message` on the related record's chatter with `mail_activity_type_id` set
2. Deletes the `mail.activity` row

So **`mail.message` is the authoritative completion ledger.** A completed activity leaves a message with:
- `mail_activity_type_id` = the activity type id (not null)
- `author_id` = the completing user's `res.partner.id` (partner_id, not user id)
- `date` = UTC timestamp of completion
- `model` + `res_id` = the related record

### What is available now vs. what is missing

| Signal | Available? | How |
|---|---|---|
| All open activities | ✅ | `mail.activity` query (already done) |
| Overdue count | ✅ | Derived from `date_deadline < today` |
| Due today count | ✅ | Derived from `date_deadline = today` |
| Future/upcoming | ✅ | Derived from `date_deadline > today` |
| **Completed today** | ❌ | Needs `mail.message` query with `partner_id` |
| **Partner ID for users** | ❌ | Currently only `odoo_uid` (`res.users.id`) is cached; `partner_id` is a different field and is not stored |
| Wins this week | ✅ | `cx_processed_wins` (cron, 15-min granularity) |
| Historical daily completions | ❌ | No table exists |
| Streak data | ❌ | No table exists |

### What assumptions are unsafe

- **"Activity disappeared = completed"** (current cron assumption) is not reliable for streak/completion counting. A disappearance can mean: marked done, deleted without completion, rescheduled to a new activity (creates a new record while the old one disappears), or merged. The `mail.message` query is stricter and correct.
- **Cron delay**: `cx_seen_activities` is at most 15 minutes stale. Using it as the real-time completion count would be misleading during active working sessions.
- **Timezone**: All Odoo dates are stored in UTC. `date_deadline` is a `Date` field (no time), so it represents the calendar day in the *company's configured timezone*, not UTC. The front-end currently compares deadlines against `new Date()` with local timezone assumptions. This is mostly fine for single-office setups but should be flagged.

---

## 2. Proposed minimal tracking layer

### A. Cache `partner_id` alongside `odoo_uid`

In the `users` table, add `odoo_partner_id INTEGER`. Discover it once via:
```js
searchRead('res.users', [['id','=',odoo_uid]], ['id','partner_id'])
```
Cache it just like `odoo_uid`. This unlocks the `mail.message` query.

### B. Query `mail.message` for completed today (no new table needed for real-time)

In `handleGetActivities`, add a second Odoo call:
```js
searchRead(env, {
  model: 'mail.message',
  domain: [
    ['mail_activity_type_id', '!=', false],
    ['author_id', '=', odooPartnerUid],
    ['date', '>=', todayUtcStart],
    ['date', '<', tomorrowUtcStart],
  ],
  fields: ['id', 'mail_activity_type_id', 'model', 'date'],
  limit: 500,
})
```
This returns real-time "completed today". Cheap per-user call. No infrastructure needed.

### C. New table: `cx_daily_completions` (for streaks)

```sql
CREATE TABLE cx_daily_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id  UUID NOT NULL REFERENCES users(id),
  day               DATE NOT NULL,
  completed_count   INTEGER NOT NULL DEFAULT 0,
  cleared_queue     BOOLEAN NOT NULL DEFAULT false,
  -- true if 0 overdue+today at any cron run that day
  -- once set true, never reverts
  UNIQUE(platform_user_id, day)
);
```

The cron (already runs every 15 min) upserts one row per user per day. `cleared_queue = true` is set the first time a user reaches `overdue = 0 AND due_today = 0`. Once set to true, it stays true — a new activity created after clearing doesn't un-clear the day.

---

## 3. Correct metrics definition

### Primary — today-focused

| Metric | Definition | Source |
|---|---|---|
| `overdue` | Activities with `date_deadline < today` | `mail.activity` (real-time) |
| `dueToday` | Activities with `date_deadline = today` | `mail.activity` (real-time) |
| `completedToday` | Messages with `mail_activity_type_id` posted today by user | `mail.message` (real-time) |
| `remainingToday` | `overdue + dueToday` | Derived |

### Derived

| Metric | Definition |
|---|---|
| `todayCompletionPct` | `completedToday / (completedToday + remainingToday) * 100` — scoped to today+overdue only |
| `isDoneForToday` | `overdue === 0 && dueToday === 0` |

### Secondary (non-stress, non-blocking)

| Metric | Definition |
|---|---|
| `futurePlanned` | Activities with `date_deadline > today` or no deadline |

### Gamification

| Metric | Definition |
|---|---|
| `winsThisWeek` | Already exists — keep as-is |
| `streak` | Consecutive calendar days where `cleared_queue = true` in `cx_daily_completions` |

---

## 4. UX strategy

### The core shift

The current dashboard answers: *"How much work do I have?"* → stress-inducing.  
The new dashboard should answer: *"Am I done for today?"* → momentum-driven.

### A. The finish line

The "done for today" state must be visually distinct and celebratory. When `isDoneForToday = true`:
- Cards turn green with a subtle success glow
- Top bar shows a clear message (e.g., "Alles voor vandaag is klaar ✓")
- No counters screaming at the user

### B. Progress framing

The current progress bar (`open / total`) is **inverted and meaningless**. A 21/27 bar showing 77% means "77% of my work is future" — it tells the user nothing about today's achievement.

New framing: progress is `completedToday / (completedToday + remainingToday)`. This starts at 0% and climbs toward 100% as the user works. Emotionally positive — the number only grows.

Microcopy examples:
- "Nog 3 te gaan" ← while 3 remain
- "Alles voor vandaag is klaar" ← when done
- "Goed bezig — 5 van 8 gedaan" ← mid-day progress hint

### C. Future work stays visible but is demoted

Future activities appear as a compact secondary zone: "Komende dagen: 12 gepland".  
Not part of any progress bar. Not part of any danger indicator.

---

## 5. UI adjustments (concrete, building on current)

### Stats bar — refocus

| Current | Proposed |
|---|---|
| Open | **Te doen vandaag** (= `dueToday`, not total) |
| Achterstallig | **Achterstallig** (unchanged) |
| Vandaag | **Gedaan vandaag** (= `completedToday` from `mail.message`) |
| Wins (week) | **Wins (week)** (unchanged) |

When `isDoneForToday`: stats bar background turns `success/10`. Overdue cell drops its error color. A small "Klaar voor vandaag ✓" badge appears in the header subtitle.

### Cards — fix scope and progress bar

Each card currently shows `total` (all activities) and `pct = open / total` (confusing).

New card layout:
```
[Type name]                              [status badge]

  [progress bar: completedToday / (completedToday + remaining)]

  Gedaan vandaag: X    |  Nog Y te gaan

  [N achterstallig]  [M vandaag]

  Komende: Z  ← muted, secondary
```

States:
- **danger**: `overdue > threshold OR dueToday > threshold` → red border, "Aandacht" badge (same thresholds as now)
- **active**: progress bar climbing, primary color
- **complete**: `overdue === 0 && dueToday === 0` for this type → green background, "Klaar" badge

The giant number changes from `stats.total` to `stats.remainingToday` (`overdue + dueToday`). When it hits 0, the card celebrates. Future activities move to muted secondary text below the fold.

### Streak indicator

Small, subtle. Lives in the header area or wins tab:
```
🔥 3 dagen op rij
```

Not a primary metric — a quiet reward for consistency.

---

## 6. Streak logic

### Definition

A day `D` counts toward the streak if `cleared_queue = true` in `cx_daily_completions` for that user on day `D`.

`cleared_queue` is set `true` when the cron runs and finds `overdue = 0 AND dueToday = 0` for the user. Use `UPSERT ... SET cleared_queue = GREATEST(cleared_queue, true)` — once set, it never reverts.

### Edge cases

| Case | Handling |
|---|---|
| No activities due that day | Neutral: doesn't break streak, doesn't extend it (skip the day) |
| User is off (weekend) | Same as "no activities" — neutral |
| New overdue added late in the day | Doesn't un-clear a day already cleared |
| First activity completed at 23:59 | Still counts; cron catches it within 15 min |

### Streak calculation (SQL)

```sql
WITH ordered AS (
  SELECT day,
         day - (ROW_NUMBER() OVER (ORDER BY day DESC))::integer AS grp
  FROM cx_daily_completions
  WHERE platform_user_id = $1
    AND cleared_queue = true
  ORDER BY day DESC
),
streak_groups AS (
  SELECT grp, COUNT(*) AS streak_length, MAX(day) AS latest_day
  FROM ordered
  GROUP BY grp
)
SELECT streak_length
FROM streak_groups
WHERE latest_day >= CURRENT_DATE - 1  -- grace: today or yesterday
ORDER BY latest_day DESC
LIMIT 1;
```

The "yesterday grace" means: if you haven't worked today yet, the streak from yesterday stays visible rather than showing 0.

---

## 7. Implementation plan

### Phase 1 — Data layer (no UI changes)

1. **Supabase migration**: Add `cx_daily_completions` table. Add `odoo_partner_id INTEGER` column to `users`.
2. **`odoo-client.js`**: Add `fetchCompletedActivitiesToday(env, partnerIds)` — queries `mail.message` for today.
3. **`routes.js` — `handleGetActivities`**: Discover and cache `odoo_partner_id` (same pattern as `odoo_uid`). Add parallel call to `fetchCompletedActivitiesToday`. Add `completedToday`, `remainingToday`, `isDoneForToday`, `streak` to `stats` response.
4. **`win-detection.js` cron**: After diff calculation, upsert `cx_daily_completions` — one row per user per day, increment `completed_count`, set `cleared_queue = true` when `overdue = 0 AND dueToday = 0`.

**Breaking changes**: None. Adds new fields to API response. Existing UI continues to work.

### Phase 2 — Metrics fix (UI, non-breaking)

5. Fix `buildTypeCard()` in `ui.js`:
   - Change giant number from `stats.total` to `stats.remainingToday` per type
   - Fix progress bar formula: `completedToday / (completedToday + remainingToday)`
   - Update progress label microcopy ("Nog X te gaan" / "Alles klaar")
   - Add `completedToday` sub-label per card
   - Demote future activities to muted secondary text

### Phase 3 — Stats bar + header state

6. Update stats bar HTML: new labels + IDs for `statDueToday`, `statCompletedToday`
7. Map new API fields in boot script
8. Add `isDoneForToday` visual state: success styling on header/stats bar
9. Add streak chip in header subtitle or wins tab

### Phase 4 — Per-type completion breakdown (optional)

`mail.message` query already returns `mail_activity_type_id` per message. Client-side: group `completedMessages` by `mail_activity_type_id` before passing to `buildTypeCard()`. No additional API changes needed.

---

## Summary of required changes

| Change | Effort | New dependency |
|---|---|---|
| Add `odoo_partner_id` to `users` | Tiny | 1 migration |
| Add `cx_daily_completions` table | Small | 1 migration |
| `mail.message` query for completed-today | Small | None |
| Cron update for `cx_daily_completions` | Small | None |
| Fix progress bar formula + giant number per card | Medium | None |
| Stats bar relabeling | Trivial | None |
| Done-for-today visual state | Small | None |
| Streak display | Small | `cx_daily_completions` |

Nothing requires a large new system. The `mail.message` query is a single `searchRead` call. The `partner_id` caching is a copy of the existing `odoo_uid` pattern. The streak table is five SQL lines. The full UI stays tab-based, DaisyUI-styled, and familiar.
