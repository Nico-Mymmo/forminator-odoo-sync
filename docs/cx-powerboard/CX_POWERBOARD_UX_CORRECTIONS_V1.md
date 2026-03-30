# CX POWERBOARD — UX CORRECTIONS V1

**Date:** 2025-01  
**Author:** Based on V5 UX model (§3A–3E) vs. implemented buildTypeCard() audit  
**Status:** Approved for implementation

---

## 0. Executive Summary

A systematic comparison of the implemented `buildTypeCard()` function against the V5/V6 UX model reveals **six defects**, one of which is a critical data bug that causes the big "remaining" number to always render as `0` regardless of actual activity counts. The remaining five are UX/rendering gaps: meaningless progress display on zero-data states, missing future-task count, no differentiated "nothing today" visual state, suboptimal microcopy, and always-visible pills that pollute the idle state. This document defines the corrected state machine, visual spec, microcopy ladder, and complete replacement code for `buildTypeCard()`.

---

## 1. Gap Analysis

### Gap 1 — CRITICAL: `remaining` always 0 (data bug)

| | |
|---|---|
| **Location** | `buildTypeCard()`, line: `var remaining = pt.remainingToday \|\| 0` |
| **Root cause** | `routes.js` builds `perType` as `{ overdue, dueToday, future, completedToday }`. There is **no `remainingToday` field**. The frontend fallback `\|\| 0` silently yields 0. |
| **Impact** | The 5xl big number on every card **always shows "0"** regardless of how many overdue or due-today activities exist. The danger state visual (red card, "Aandacht" badge) does fire correctly because it reads `overdueCnt = pt.overdue` and `pt.dueToday` directly — but the primary data-ink element is wrong. |
| **Fix** | `var remaining = (pt.overdue \|\| 0) + (pt.dueToday \|\| 0)` |

---

### Gap 2 — Progress bar shown when denominator = 0 (UX bug)

| | |
|---|---|
| **Location** | `buildTypeCard()`, progress section always rendered |
| **Root cause** | `total = remaining + completedCnt`. When both are 0, `total = 0`. `progressPct = 0`. The bar renders as an empty line `"0 van 0 afgerond 0%"`. |
| **Impact** | Visual noise on idle cards (nothing today, nothing done). The empty progress section implies the user started something and completed nothing — creating false anxiety. |
| **Fix** | Wrap the entire progress section in `if (showProgress)` where `showProgress = total > 0`. |
| **V5 ref** | §3B: "Progress bar only rendered when denominator > 0." |

---

### Gap 3 — Missing "idle" card state (UX gap)

| | |
|---|---|
| **Condition** | `overdueCnt === 0 && dueTodayCnt === 0 && completedCnt === 0` |
| **Current behavior** | Falls through to `isNormal`: white card, big "0" in `text-base-content`, microcopy "Geen taken vandaag". Three muted pills still rendered. Looks like a broken card. |
| **Desired behavior** | `isIdle` state: muted card, replace big number with `"—"` in `text-base-content/25`, hide all three pills (or render them greyed without `onclick`), hide progress section. If future tasks exist, show "Komende: N gepland" as the only data. |
| **Fix** | Add fourth state: `var isIdle = remaining === 0 && completedCnt === 0` before `isDone`/`isDanger`. |

---

### Gap 4 — Missing future tasks count (feature gap)

| | |
|---|---|
| **Current behavior** | `pt.future` is present in the routes response but never rendered on the card. |
| **Desired behavior** | When `!isDone && futureCnt > 0`: show `"Komende: N gepland"` as a muted caption below the pills row. |
| **Visibility rules** | • Hidden when `isDone` (future is tomorrow's problem; done state must feel complete). • Hidden when `isDanger` (adding scheduled-future context to an already-red card increases cognitive load). • Shown only for `isNormal` and `isIdle` states. |
| **V5 ref** | §3D: "Komende: N gepland — muted, small, below pills, not a pill." |

---

### Gap 5 — Microcopy does not follow V5 pct-based ladder (UX gap)

| | |
|---|---|
| **Current** | Count-based: `"X achterstallig, Y vandaag"` or `"X te doen vandaag"`. Always descriptive, never motivational. |
| **V5 §3E ladder** | Pct-based, progresses from informational → motivational → celebratory |
| **Fix** | See §6 — Microcopy below. |

---

### Gap 6 — `isDone` state shows big "0" (UX gap)

| | |
|---|---|
| **Current** | `isDone` → remaining = 0 → renders `<span>0</span>` in `text-success`. |
| **Problem** | "0" reads as empty/bad even in green. The visual does not communicate achievement. |
| **Fix** | When `isDone`: replace the big number span with a `check-circle-2` icon at `w-10 h-10` in `text-success`. Microcopy becomes primary: `"N afgerond vandaag"`. |

---

## 2. Card Redesign — Four States and Visual Hierarchy

### State Machine

```
                   remaining > 0?
                   ┌── yes ──┐
                   │          │
            overdue ≥ thOv    │
            OR dueToday ≥ thTd│
               ┌──yes         │
               │              │
           isDanger        isNormal
               │              │
               └──────────────┘
                       │
                   remaining === 0?
                   ┌── yes ──┐
              completedCnt > 0?
              ┌── yes    no ──┐
            isDone          isIdle
```

### Visual Treatment

| State | Card bg | Card border | Big element | `numCls` | Bar color | Status badge |
|---|---|---|---|---|---|---|
| `isIdle` | `bg-base-100` | `border-base-200` | `"—"` | `text-base-content/25` | — | none |
| `isNormal` | `bg-base-100` | `border-base-200` | remaining count | `text-base-content` | `bg-primary` | none |
| `isDanger` | `bg-error/10` | `border-error/30` | remaining count | `text-error` | `bg-error` | `alert-circle` "Aandacht" |
| `isDone` | `bg-success/10` | `border-success/30` | `check-circle-2` icon | `text-success` | `bg-success` | `check-circle-2` "Klaar" |

> **Note on isDanger border:** Upgraded from `border-error/25` → `border-error/30` to give danger cards marginally stronger delineation without resorting to a heavy ring or pulsing animation.

### Component Anatomy (top → bottom)

```
┌─────────────────────────────────────────┐
│  [Type name]                  [Status]  │  ← header row
│                                          │
│  [Big element]                           │  ← 5xl count (normal/danger)
│                                          │     check icon (isDone)
│                                          │     "—" (isIdle)
│  [Microcopy]                             │  ← 0.6rem uppercase muted
│                                          │
│  [Progress row]  ← hidden when total=0  │  ← "X van Y afgerond  Z%"
│  [Progress bar]  ← hidden when total=0  │
│                                          │
│  [Overdue pill] [Today pill] [Done pill] │  ← hidden entirely when isIdle
│                                          │
│  [Komende: N gepland]  ← conditional    │  ← isNormal + isIdle only
└─────────────────────────────────────────┘
```

---

## 3. Progress Redefinition

### Rule: only show progress when `total > 0`

```js
var showProgress = total > 0;   // total = remaining + completedCnt
```

When `showProgress = false`: the entire `<div class="mb-3">` progress section is omitted from the HTML string. The card is shorter and unambiguous.

### Formula (unchanged, but now only applied when valid)

```
progressPct = Math.round(100 * completedCnt / total)   // when total > 0
targetWidth = progressPct + '%'
```

The `data-target-width` attribute feeds `animateBars()`. No change needed to the animation logic — it only touches elements with that attribute, and those elements only exist when `showProgress = true`.

---

## 4. Overdue Handling — Danger State

### Current threshold defaults

```js
var thOv = mapping.danger_threshold_overdue ?? 1;   // enter danger at 1+ overdue
var thTd = mapping.danger_threshold_today   ?? 3;   // enter danger at 3+ due today
```

These defaults are appropriate. A single overdue item is already an SLA risk; 3+ due-today is a capacity warning.

### Visual changes

- Border strengthened: `border-error/25` → `border-error/30` (barely visible change, but consistent with the state table above)
- No pulsing, no ring, no animation — danger must be stable, not distracting
- Future tasks count **hidden** on danger cards (per §3D rule: do not add future-burden context to an already-alerting card)

### Danger + pills interaction

Pills for overdue and today remain fully interactive on danger cards. They are the primary drill-down mechanism when a card is in danger state.

---

## 5. Future Tasks — Visibility Rules

```
Show "Komende: N gepland"   when:   !isDone && !isDanger && futureCnt > 0
Hide                         when:   isDone   (done state must feel complete)
Hide                         when:   isDanger (reduces cognitive overload)
Hide                         when:   futureCnt === 0
```

Visual treatment: `text-[0.65rem] text-base-content/35 mt-2` — muted caption, not a pill.

Location: below the pills row, as the last item in the card.

---

## 6. Microcopy — Exact Dutch Copy

### Ladder (evaluated top to bottom)

| Condition | Microcopy |
|---|---|
| `isIdle && futureCnt > 0` | `"Niets voor vandaag gepland"` |
| `isIdle && futureCnt === 0` | `"Geen taken geconfigureerd"` |
| `isDone` | `"[N] afgerond vandaag"` |
| `progressPct >= 50` (1 remaining) | `"Bijna klaar — nog 1 te gaan"` |
| `progressPct >= 50` (N remaining) | `"Bijna klaar — nog [N] te gaan"` |
| `progressPct > 0` (1–49%) | `"Goed bezig — [N] gedaan"` |
| `progressPct === 0 && overdueCnt > 0 && dueTodayCnt > 0` | `"[X] achterstallig, [Y] vandaag"` |
| `progressPct === 0 && overdueCnt > 0` | `"[X] achterstallig"` |
| `progressPct === 0 && dueTodayCnt > 0` | `"[N] te doen vandaag"` |
| fallback | `"[N] te doen"` |

### Milestone copy for "last one"

When `remaining === 1`:
- Normal: `"Bijna klaar — nog 1 te gaan"` (via the ≥50% branch, since at least one was completed)
- Danger: `"Nog 1 te gaan"` (same)

The extra "— bijna klaar!" suffix from V6 §4A is folded into the ladder naturally (the `>= 50%` branch handles it).

---

## 7. Implementation Spec — Complete `buildTypeCard()` Replacement

> Drop-in replacement. No changes to `renderDashboard()`, `animateBars()`, or routes.js are required.

```js
function buildTypeCard(name, pt, mapping, cardIdx) {
  // ── Data ──────────────────────────────────────────────────────────────────
  var overdueCnt   = pt.overdue        || 0;
  var dueTodayCnt  = pt.dueToday       || 0;
  var futureCnt    = pt.future         || 0;
  var completedCnt = pt.completedToday || 0;
  // FIX Gap 1: routes sends overdue+dueToday, NOT remainingToday
  var remaining    = overdueCnt + dueTodayCnt;
  var total        = remaining + completedCnt;

  // ── Thresholds ────────────────────────────────────────────────────────────
  var thOv = mapping.danger_threshold_overdue != null ? mapping.danger_threshold_overdue : 1;
  var thTd = mapping.danger_threshold_today   != null ? mapping.danger_threshold_today   : 3;

  // ── State (mutually exclusive, evaluated in priority order) ───────────────
  var isIdle   = remaining === 0 && completedCnt === 0;
  var isDone   = remaining === 0 && completedCnt > 0;
  var isDanger = !isIdle && !isDone && (overdueCnt >= thOv || dueTodayCnt >= thTd);
  var isNormal = !isIdle && !isDone && !isDanger;

  // ── Progress (only meaningful when total > 0) ─────────────────────────────
  var progressPct  = total > 0 ? Math.round(100 * completedCnt / total) : 0;
  var targetWidth  = progressPct + '%';
  var showProgress = total > 0;

  // ── Theming ───────────────────────────────────────────────────────────────
  var cardBg, cardBorder, numCls, barCls, statusHtml;
  if (isIdle) {
    cardBg     = 'bg-base-100';
    cardBorder = 'border border-base-200';
    numCls     = 'text-base-content/25';
    barCls     = 'bg-base-300';
    statusHtml = '';
  } else if (isDone) {
    cardBg     = 'bg-success/10';
    cardBorder = 'border border-success/30';
    numCls     = 'text-success';
    barCls     = 'bg-success';
    statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-success shrink-0">'
      + '<i data-lucide="check-circle-2" class="w-3 h-3 shrink-0"></i>Klaar</span>';
  } else if (isDanger) {
    cardBg     = 'bg-error/10';
    cardBorder = 'border border-error/30';
    numCls     = 'text-error';
    barCls     = 'bg-error';
    statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-error shrink-0">'
      + '<i data-lucide="alert-circle" class="w-3 h-3 shrink-0"></i>Aandacht</span>';
  } else {
    cardBg     = 'bg-base-100';
    cardBorder = 'border border-base-200';
    numCls     = 'text-base-content';
    barCls     = 'bg-primary';
    statusHtml = '';
  }

  // ── Big primary element ───────────────────────────────────────────────────
  var bigEl;
  if (isDone) {
    // Replace "0" with a check icon — achievement, not emptiness
    bigEl = '<i data-lucide="check-circle-2" class="w-10 h-10 ' + numCls + ' mb-1"></i>';
  } else if (isIdle) {
    // Muted dash — "nothing here today"
    bigEl = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">—</span>';
  } else {
    bigEl = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + remaining + '</span>';
  }

  // ── Microcopy ─────────────────────────────────────────────────────────────
  var microcopy;
  if (isIdle) {
    microcopy = futureCnt > 0 ? 'Niets voor vandaag gepland' : 'Geen taken geconfigureerd';
  } else if (isDone) {
    microcopy = completedCnt + ' afgerond vandaag';
  } else if (progressPct >= 50) {
    microcopy = 'Bijna klaar \u2014 nog ' + remaining + ' te gaan';
  } else if (progressPct > 0) {
    microcopy = 'Goed bezig \u2014 ' + completedCnt + ' gedaan';
  } else if (overdueCnt > 0 && dueTodayCnt > 0) {
    microcopy = overdueCnt + ' achterstallig, ' + dueTodayCnt + ' vandaag';
  } else if (overdueCnt > 0) {
    microcopy = overdueCnt + ' achterstallig';
  } else {
    microcopy = remaining + ' te doen vandaag';
  }

  // ── Pills (hidden entirely for isIdle) ────────────────────────────────────
  var pillsHtml = '';
  if (!isIdle) {
    var ovPillBase = 'inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] cursor-pointer transition-opacity hover:opacity-80';
    var ovPillCls  = overdueCnt > 0
      ? ovPillBase + ' bg-error/15 text-error font-semibold'
      : ovPillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
    var tdPillCls  = dueTodayCnt > 0
      ? ovPillBase + ' bg-warning/15 text-warning font-semibold'
      : ovPillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
    var doCls      = completedCnt > 0
      ? ovPillBase + ' bg-success/15 text-success font-medium'
      : ovPillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
    pillsHtml = '<div class="flex flex-wrap gap-1.5">'
      + '<span class="' + ovPillCls + '" onclick="openPbCard(' + cardIdx + ',&quot;overdue&quot;,event)">' + overdueCnt + '\u00a0achterstallig</span>'
      + '<span class="' + tdPillCls + '" onclick="openPbCard(' + cardIdx + ',&quot;today&quot;,event)">'   + dueTodayCnt + '\u00a0vandaag</span>'
      + '<span class="' + doCls     + '" onclick="openPbCard(' + cardIdx + ',&quot;completed&quot;,event)">' + completedCnt + '\u00a0gedaan</span>'
      + '</div>';
  }

  // ── Future tasks line (isNormal + isIdle only) ────────────────────────────
  var futureLine = (!isDone && !isDanger && futureCnt > 0)
    ? '<p class="text-[0.65rem] text-base-content/35 mt-2">Komende: ' + futureCnt + ' gepland</p>'
    : '';

  // ── Assemble ──────────────────────────────────────────────────────────────
  return '<div class="rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ' + cardBg + ' ' + cardBorder + '" onclick="openPbCard(' + cardIdx + ')">'
    + '<div class="flex items-start justify-between gap-2 mb-3">'
    + '<p class="font-semibold text-sm leading-snug text-base-content/80">' + name + '</p>'
    + statusHtml
    + '</div>'
    + '<div class="mb-3">'
    + bigEl
    + '<p class="text-[0.6rem] font-medium uppercase tracking-widest text-base-content/40 mt-2">' + escHtml(microcopy) + '</p>'
    + '</div>'
    + (showProgress
        ? '<div class="mb-3">'
          + '<div class="flex items-center justify-between mb-1">'
          + '<span class="text-[0.65rem] text-base-content/50">' + completedCnt + ' van ' + total + ' afgerond</span>'
          + '<span class="text-[0.65rem] font-semibold ' + numCls + '">' + progressPct + '%</span>'
          + '</div>'
          + '<div class="h-1.5 rounded-full bg-base-200 overflow-hidden">'
          + '<div class="h-full rounded-full transition-all duration-500 ' + barCls + '" style="width:0%" data-target-width="' + targetWidth + '"></div>'
          + '</div>'
          + '</div>'
        : '')
    + pillsHtml
    + futureLine
    + '</div>';
}
```

---

## 8. Regression Checklist

After deploying the corrected `buildTypeCard()`:

| Scenario | Expected result |
|---|---|
| No overdue, no due today, no completed | `isIdle`: muted `—`, "Niets voor vandaag gepland" or "Geen taken geconfigureerd", no pills, no bar |
| No overdue, no due today, no completed, future > 0 | `isIdle` + "Komende: N gepland" below |
| 3 overdue, 0 completed | `isDanger`: big "3", "3 achterstallig", bar 0%, three pills |
| 3 overdue, 1 completed | `isDanger`: big "3", "Goed bezig — 1 gedaan", bar 25%, three pills |
| 0 overdue, 4 due today, 2 completed | `isNormal`: big "2", "Bijna klaar — nog 2 te gaan", bar 50% |
| 0 remaining, 5 completed | `isDone`: check icon, "5 afgerond vandaag", bar hidden (total=5, isDone), "Klaar" badge |
| 0 remaining, 0 completed, danger thresholds not met | `isIdle` (not isDanger, because remaining=0) |

---

## 9. Non-Goals (Out of Scope for V1)

- Per-card `<details>` collapse for future tasks (deferred to V2)
- Timestamp "Alles klaar — om 14:32" (deferred to V2, requires client-side session tracking)
- Toast notifications on first completion (separate feature, routes signal already implemented)
- Per-type streak display on cards (global streak chip in header is V6 spec)
