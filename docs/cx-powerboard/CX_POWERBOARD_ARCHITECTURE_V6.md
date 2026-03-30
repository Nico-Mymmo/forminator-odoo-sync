# CX Powerboard — Architecture V6
## Hardening & Corrections to V5

> **This document does not rewrite V5.** It validates assumptions, corrects gaps, and adds hardened decisions. Read alongside V5.

---

## 1. `date_done` validation

### What Odoo actually does

When `keep_done = true` on an activity type and the agent clicks "Mark Done", Odoo's `_action_done()` calls `fields.Date.today()` and writes it to `date_done`. This is Python's `date.today()` — the **server's local calendar date**.

Odoo SaaS (mymmo.odoo.com) runs in UTC. `date_done` therefore stores the UTC calendar date, not the Amsterdam calendar date.

### The gap V5 misses

V5's R4 fix — compute `todayStr` server-side using `ODOO_TIMEZONE` — corrects the app's query date. It does **not** change what Odoo stores. The mismatch is:

- The app computes `todayStr = "2026-03-23"` (Amsterdam time)
- Odoo stored `date_done = "2026-03-22"` for a task completed at 00:30 Amsterdam (= 23:30 UTC on March 22)

The filter `date_done = todayStr` silently misses those completions. Risk window: 00:00–01:00 CET, 00:00–02:00 CEST. Low probability for CX working hours but silently wrong.

### Correction — query with a one-day lookback

```js
// Instead of: ['date_done', '=', todayStr]
// Use:
['date_done', '>=', yesterdayUtcStr],  // catches the late-night UTC edge
['date_done', '<=', todayStr],
// then in JS: filter results to keep only activities where date_done
// maps to "today" in the local timezone
```

For the standard CX window (08:00–19:00 Amsterdam), this edge case is irrelevant in practice. It must be documented as a known limitation, not left as a silent gap.

### Is `date_done` always populated when `keep_done = true`?

**Yes, for the standard UI completion path.** The only exceptions:
- Activity closed via direct ORM `unlink()` bypassing `_action_done()` (scripted/admin operations)
- Bulk operations in Odoo backend that call `unlink()` directly

For normal CX agent workflows, `date_done` is reliable.

### Required defensive guard

Always include `['date_done', '!=', False]` even under the `active = False` filter — a guard against any edge case where `active` was set false via a non-standard path without setting `date_done`:

```
domain: [
  ['user_id', '=', odoo_uid],
  ['active', '=', False],
  ['date_done', '!=', False],   ← required, always
  ['date_done', '>=', todayStr],
  ['activity_type_id', 'in', tracked_type_ids]
]
context: { active_test: False }
```

---

## 2. Failure fallback strategy

### How the system degrades without `keep_done`

If `keep_done = false` on a tracked type:
- Activities are deleted on completion — they disappear from `mail.activity`
- `completedToday = 0` (not a data gap but a false zero)
- `isDoneForToday` can still become `true` if `remainingToday` drops to 0 from activities disappearing — but the reason is deletion, not tracked completion
- Wins: cron misses them entirely (poll-and-diff is retired; direct query finds nothing)
- Streaks: `cleared_queue` could be set correctly if remaining drops to 0, but `completed_count` would be wrong (0 instead of actual count)

The failure is **silent and looks like normal behaviour**. Users will see "Nog 5 te gaan" then suddenly "Alles klaar" with `completedToday = 0`. They will stop trusting the completions column.

### Layer 1 — Prevent silently (Settings UI)

Block saving a tracked type without confirmed `keep_done`. Show a blocking warning, not just a visual indicator:

> "Kon keep_done niet bevestigen in Odoo. Sla op om opnieuw te proberen — of controleer de Odoo-verbinding."

Do not allow a type to appear as `tracked` without `keep_done_confirmed_at` being set. This turns a silent failure into an explicit one at configuration time.

### Layer 2 — Detect in production (dashboard API)

Add a `dataWarning` field to the `/api/activities` response:

```js
const untrackedTypeIds = openActivities
  .map(a => a.activity_type_id)
  .filter(id => !mappedTypeIds.has(id));

const unconfirmedMappings = mappings.filter(m => !m.keep_done_confirmed_at);

const dataWarning = untrackedTypeIds.length > 0 || unconfirmedMappings.length > 0;
```

When `dataWarning = true`, the dashboard shows a subtle banner:

> "⚠ Let op: niet alle activiteitstypes zijn volledig geconfigureerd. Gedaan vandaag kan onvolledig zijn."

### No `mail.message` fallback

Do NOT add `mail.message` as a fallback source. It reintroduces `partner_id` complexity with unreliable `write_uid` attribution. The correct answer is to make setup failures surface loudly rather than build a fragile secondary signal.

---

## 3. Mapping flags — explicit definition

The existing `cx_activity_mapping` schema mixes concerns and leaves some flags implicit. Authoritative definition:

| Flag | Type | Controls | Notes |
|---|---|---|---|
| Row presence | implicit | **Tracking** — type is visible to the app | Row exists = tracked. No separate boolean needed. |
| `show_on_dashboard` | `BOOLEAN DEFAULT true` | **Card visibility** — whether a card appears on the dashboard | Can be false for types tracked silently (e.g., internal admin types) |
| `is_win` | `BOOLEAN DEFAULT false` | **Win ledger** — completions insert into `cx_processed_wins` | Set by admin per type |
| `include_in_streak` | `BOOLEAN DEFAULT true` | **Streak gate** — whether this type's remaining count blocks `cleared_queue` | See below |
| `priority_weight` | `INTEGER 1–10` | **Queue sort order** — within same urgency band | Always required |
| `danger_threshold_overdue` | `INTEGER DEFAULT 1` | **Danger state trigger** — overdue count at which card turns red | Per type |
| `danger_threshold_today` | `INTEGER DEFAULT 3` | **Danger state trigger** — today count threshold | Per type |
| `keep_done_confirmed_at` | `TIMESTAMPTZ` | **Setup integrity** — confirms Odoo write succeeded | Set server-side; read-only to admin UI |

### Gap correction: `include_in_streak`

Currently all tracked types implicitly contribute to the streak clearing condition. This is wrong for opportunistic types.

Example: "Spontaan contact" is a win type logged when a lucky call happens. Failing to generate one on a given day should not break a streak. The streak should only gate on **obligatory** daily work types.

Add one column:

```sql
ALTER TABLE cx_activity_mapping
  ADD COLUMN IF NOT EXISTS include_in_streak BOOLEAN NOT NULL DEFAULT true;
```

Streak clearing condition becomes:

```
cleared_queue = (remaining_today WHERE include_in_streak = true) === 0
```

Win counting remains controlled by `is_win` independently. A type can be `is_win = true, include_in_streak = false` (opportunistic win, not streak-gating).

---

## 4. UX hardening

### A. Progress feels earned, not calculated

**Fix 1 — Animate on load.**
The current `transition-all duration-500` CSS applies but the bar starts at its final width because JS sets it immediately. Fix: render the bar at `width: 0%` on mount, then trigger fill on the next animation frame:

```js
// In buildTypeCard(), set initial style to width:0%
// Then after container.innerHTML = html:
requestAnimationFrame(function() {
  requestAnimationFrame(function() {
    document.querySelectorAll('.cx-bar-fill').forEach(function(el) {
      el.style.width = el.dataset.targetWidth;
    });
  });
});
```

Every page load now shows the user's progress accumulating — a small but felt moment of forward motion.

**Fix 2 — Lead with the number, not the percentage.**
"5 gedaan" is an achievement. "62%" is arithmetic. Reorder the card secondary label:

```
[N remaining]  ·  X gedaan vandaag     ←  large, human
████████████░░  62%                    ←  bar + % as supporting detail
```

**Fix 3 — Milestone microcopy at the finish line.**
When `remainingToday_for_type = 1`, shift microcopy from:
> "Nog 1 te gaan"

to:
> "Nog 1 te gaan — bijna klaar!"

One text change, zero engineering overhead. Creates a visible anticipation moment.

### B. Future tasks treatment

"Komende: 4 gepland" inline on every card is suboptimal. It occupies visual real estate even when the user is focused on today.

**When `isDoneForToday`**: hide future count on all cards entirely. Replace with a single calm line:
> "Morgen start je met X activiteiten."

Tomorrow is tomorrow's problem. The done state must feel complete, not pre-loaded.

**When NOT done**: the future count at card bottom is acceptable only if:
1. It is muted and small (already is)
2. The card is NOT in danger state — if a card is red (overdue/danger), future count must not appear at all. Adding fuel to anxiety when a card is already alerting is counterproductive.

Future-state tasks are also a candidate for a `<details>` collapse on the card, unlocking them only when the user wants the context. Not required immediately, but preferable over always-visible counts.

### C. Completion feeling — two targeted improvements

**Addition 1 — Timestamp the finish.**
When `isDoneForToday` first becomes true in the current session, capture the time client-side and append it to the completion message:

```
"Alles voor vandaag is klaar — om 14:32"
```

This creates a specific, owned moment. No server involvement — computed locally when the dashboard transitions to the done state.

**Addition 2 — One-time stat pop animation.**
When `remainingToday` transitions from `> 0` to `0` during a live data refresh (not on initial page load), apply a single pulse to the "Te doen vandaag" stat value:

```css
@keyframes cx-pop {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.15); }
}
.cx-stat-complete { animation: cx-pop 0.4s ease-out; }
```

Applied once via JS when the transition is detected. Not applied on initial load. Subtle — just enough to mark the moment.

---

## 5. Top 3 perception risks

### Risk 1: "I finished tasks but the dashboard ignores them"

**What breaks trust**: `completedToday = 0` after the user has demonstrably completed activities in Odoo. No error, no warning — the number just stays at 0.

**Root cause**: `keep_done` not set on the activity type.

**Prevention**:
- Block tracked type setup without confirmed `keep_done` (Layer 1 above)
- Add `dataWarning` banner when unconfirmed types are present (Layer 2 above)
- Add "Vernieuwd om HH:MM" timestamp below the stats bar so users know the data is live, not stale from login

---

### Risk 2: "The dashboard says I'm done, but I know I'm not"

**What breaks trust**: `isDoneForToday = true` while the user has visible activities in Odoo that the dashboard doesn't show. Causes: activities of an untracked type, wrong `odoo_uid` mapping, timezone edge case causing yesterday's overdue not to appear.

**Prevention**:
- Surface `untrackedTypesDetected` as a banner (Layer 2 above)
- Add a scope qualifier below the completion message:
  > "Op basis van X geconfigureerde activiteitstypes"
  This sets correct expectations — the user understands the dashboard's scope
- Keep a visible Odoo deep-link in the header pointing to the user's full activity list at all times. One click to verify against the source of truth

---

### Risk 3: "My streak disappeared for no reason"

**What breaks trust**: Yesterday: 7-day streak. Today: 3 (or 0). The cron could have missed a run, or the user completed their last activity at 23:55 but the cron ran at 23:45 and saw 1 remaining — so `cleared_queue` was never set.

**Root cause**: The 15-minute cron granularity creates a window where a fully-cleared queue is never observed by the cron.

**Prevention (important correction to V5)**:
The dashboard API itself must also write `cleared_queue = true` when `isDoneForToday = true` is detected from the live Odoo query. This covers the cron gap:

```js
// In handleGetActivities, after computing isDoneForToday:
if (isDoneForToday) {
  await supabase
    .from('cx_daily_completions')
    .upsert({
      platform_user_id: user.id,
      day: todayStr,
      cleared_queue: true,
      // completed_count and remaining_count already set by cron;
      // only upgrade cleared_queue, never set it from the API otherwise
    }, { onConflict: 'platform_user_id,day' });
    // Note: only write cleared_queue = true; never write false from here
}
```

This means the streak is confirmed the instant the user opens the dashboard with a clear queue — not 14 minutes later.

Additional safeguard: only show `streak >= 2` (already in V5). A reset to 1 is silent. A reset to 0 only happens after 2+ missed days in a row, which is a real streak loss.
