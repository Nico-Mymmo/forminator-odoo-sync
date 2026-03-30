# CX POWERBOARD — USER-CENTRIC UX V2
## From Correct to Supportive: A Dashboard That Works With People

**Date:** March 2026  
**Scope:** UX strategy, component redesign, recognition system, guidance layer, AI-readiness  
**Prerequisites:** V5 architecture, V6 hardening, UX Corrections V1 (gaps fixed)  
**Status:** Strategy document — actionable per phase

---

## 0. Starting Point

UX Corrections V1 fixed six functional defects: the broken remaining count, the meaningless 0/0 progress bar, the empty idle state, the missing future count, bad microcopy, and the too-weak danger signal.

That work made the dashboard **correct**. This document makes it **worthwhile**.

Correct means the data shows up without visual lies. Worthwhile means the user has a reason to open it, a reason to come back, and a feeling that the tool is on their side.

---

## 1. Dashboard Purpose From the User's Perspective

### 1.1 What emotional job should this dashboard do?

The people using this dashboard handle a steady stream of activities — follow-ups, calls, tasks, checks — many of which are externally driven and time-sensitive. At 09:00 they open the board. They have not had coffee yet. They need to understand their day in under 10 seconds and feel like it is manageable.

**The dashboard has one emotional job: make the user feel oriented and capable, not surveilled and behind.**

This is not about hiding overdue tasks. It is about framing them correctly. "You have 3 things to pick up" is a starting point. "You have 3 overdue items" is an accusation. The difference is tone and agency.

### 1.2 Why should users want to open it?

Users should open the dashboard because it:

- Shows them what they personally achieved (not just what remains)
- Gives them a clear answer to "what do I do first?"
- Remembers their streak and reflects it back with warmth
- Occasionally says something that feels like recognition
- Gets out of the way once they're on top of things

The current board gives none of these. It has no memory, no recognition, no guidance. It is a snapshot of tasks. That is not compelling enough to return to.

### 1.3 What should they feel in the first 10 seconds?

| Sequence | What the user sees | What they should feel |
|---|---|---|
| 0–2s | Header + personal greeting | "This is mine. It knows who I am." |
| 2–5s | Stats bar + streak chip | "Here's where I stand. Yesterday was good." |
| 5–8s | Cards with intelligent state | "I know what to do next." |
| 8–10s | Wins or recognition if earned | "My effort is visible here." |

They should **not** feel:
- Immediately behind (even if overdue items exist)
- Surveilled by a system that only counts failures
- Confused about where to begin

---

## 2. New Hierarchy of Attention

### Current hierarchy (implicit)

1. Per-type task cards (the entire screen)
2. Stats bar (secondary header)
3. Streak chip (barely visible)
4. Overdue data (dominates the red cards)

This hierarchy puts the most stressful information in the most prominent position. The user lands on a wall of cards, some of which are red.

### Proposed hierarchy

**Top → Bottom = Important → Supporting**

```
1. ORIENTATION ZONE
   Personal greeting + date + time since last refresh
   "Goedemorgen Nico — hier is je dag."

2. ACHIEVEMENT SIGNAL
   Streak (if ≥ 2 days)       — always at the top, not buried in a chip
   Win badge (if earned today) — temporary but prominent
   Completion celebration      — when isDoneForToday

3. FOCUS SIGNAL: "What matters now"
   A single sentence summarising the day's priority.
   Non-AI: derived from the card with highest urgency.
   AI: synthesised from tasks + context.

4. CARDS
   The actual work. Framed as "here's what you're handling" rather than "here's what you haven't done."
   Danger cards are visible but not dominant. They contain forward guidance.

5. WINS + RECOGNITION TRAY
   This week's wins. Badges earned. Running count.
   Persistent, not ephemeral.

6. TEAM SIGNAL (teamlead view only)
   Who has cleared their queue. Who might need support.
   Framed as care, not control.
```

**What moves up:** Recognition, orientation, personal greeting, streak  
**What moves down:** Overdue counts (still visible, but not the first thing user reads)  
**What changes framing:** Cards shift from "status report" to "what needs your attention next"

---

## 3. Card Philosophy and States

### 3.1 The card's job

Each card answers **one question**: "What is the situation with this type of work, and what should I do?"

Not: "How far behind are you?"  
But: "Here's what's happening and here's your best move."

This means every non-idle card must contain:
- A status (what's happening)
- A momentum signal (you're moving / you started / you finished)
- A next step or reassurance

### 3.2 State redesign

---

#### State A — Needs attention (active work, no danger)

**Current feeling:** A number and three pills.  
**Target feeling:** "I see where you are. Keep going."

```
┌─────────────────────────────────────────┐
│  Telefonische opvolging                 │
│                                          │
│  3                                       │  ← remaining (count, not a warning)
│  te doen vandaag                        │  ← microcopy without blame
│                                          │
│  ████████░░░░   2 gedaan  ·  33%        │  ← progress bar + human count
│                                          │
│  [overdue pill] [today pill] [done pill]│
│                                          │
│  💡 Begin best met de oudste taak       │  ← guidance line (non-AI)
└─────────────────────────────────────────┘
```

Key changes:
- "te doen vandaag" replaces the empty microcopy void
- The guidance line is new — a single sentence pointing to the next action
- Progress shown as "2 gedaan" (human units) not just a percentage

---

#### State B — Progress / in motion (≥ 1 completed, ≥ 1 remaining)

**Current feeling:** Still shows the raw remaining count.  
**Target feeling:** "You're moving — here's how far."

Microcopy uses the motivational ladder from V1 Corrections ("Bijna klaar — nog N te gaan", "Goed bezig") and the card should signal movement, not stasis. The progress bar is the hero element here, not the remaining count.

When `progressPct >= 50`:
- Big element: remaining count (you're near the finish line — the gap is the motivator)
- Microcopy: "Bijna klaar — nog N te gaan"
- Bar: visually prominent, near full

When `0 < progressPct < 50`:
- Big element: completed count (emphasise what was done, not what remains)
- Microcopy: "Goed bezig — N gedaan"
- Bar: showing traction

This is a reversal of what the card shows as its hero number depending on where the user is in their day. When you're just starting, what you've done is the pride signal. When you're nearly finished, what remains is the finish-line pull.

---

#### State C — Done

**Current feeling:** A green card with a check icon.  
**Target feeling:** A small, warm moment of recognition.

```
┌─────────────────────────────────────────┐
│  Telefonische opvolging        ✔ Klaar  │
│                                          │
│  ✓  (check icon, large, success green)  │
│  5 afgerond vandaag                     │
│                                          │
│  Goed gedaan. 5 van 5 klaar.           │  ← warm, brief, specific
│                                          │
│  [5 gedaan pill]                        │  ← only the done pill, others hidden
└─────────────────────────────────────────┘
```

The done state must feel **complete** rather than empty. Removing overdue/today pills entirely (already done in V1 Corrections) is right. Consider surfacing the done count more prominently than the check icon alone.

Optional (Phase 1): time stamp — "om 14:32 afgerond" — adds specificity and ownership to the moment.

---

#### State D — Idle (no work today)

**Current feeling:** A greyed-out card with a dash. Looks broken.  
**Target feeling:** Actively neutral — "nothing here today, that's fine."

```
┌─────────────────────────────────────────┐
│  Klantbezoek opvolging                  │
│                                          │
│  —                                       │  ← muted dash
│  Niets gepland voor vandaag             │
│                                          │
│  Komende: 2 gepland                     │  ← if future > 0, show it; otherwise hide
└─────────────────────────────────────────┘
```

If there is zero planned work for this type today OR in the future, consider whether the card should appear at all on the dashboard. An always-visible card for a type with nothing scheduled for the week creates visual noise. This is a candidate for a "hide when inactive" toggle in settings.

---

#### State E — Danger (overdue threshold exceeded)

**Current feeling:** Red card, "Aandacht" badge. Feels like an alarm.  
**Target feeling:** "Here's what needs you first. Here is your path forward."

The visual urgency of danger state must remain — it should stand out. But the card must lead with **agency**, not accusation.

```
┌─────────────────────────────────────────┐
│  Telefonische opvolging       ⚠ Aandacht│
│                                          │
│  4                                       │  ← remaining, in error red
│  waarvan 2 achterstallig                │  ← "of which" framing, not "you failed"
│                                          │
│  ████░░░░░░░░   1 gedaan  ·  20%        │
│                                          │
│  [2 achterstallig] [2 vandaag] [1 gedaan]│
│                                          │
│  💡 Begin met de oudste — zo verklein  │
│     je de achterstand het snelst.       │  ← guidance, not blame
└─────────────────────────────────────────┘
```

"waarvan 2 achterstallig" is fundamentally different from "2 achterstallig" as the headline. The first positions overdue as a component of the user's current situation; the second positions it as an indictment.

The guidance line is critical on danger cards. Give the user a path, not just a red number.

---

### 3.3 Cross-card guidance line (Phase 1 — no AI)

Every non-idle, non-done card should have an optional guidance line. Phase 1 implementation is rule-based:

| Condition | Guidance line |
|---|---|
| `overdueCnt >= 1` | "Begin met de oudste — zo verklein je de achterstand snel." |
| `dueTodayCnt >= 1 && overdueCnt === 0` | "Je hebt " + N + " taken die vandaag verwacht worden." |
| `progressPct >= 50` | "Je bent al meer dan halverwege — doorzetten!" |
| `remaining === 1` | "Nog één — bijna klaar!" |
| `completedCnt >= 3 && remaining === 0` | (done state — covered by celebration) |

The guidance line is muted (`text-base-content/50`, `text-[0.65rem]`, italic), below the pills row. It is **not** a warning. It is a prompt.

---

## 4. Recognition Layer

### 4.1 Why recognition matters here

CX work is invisible in most systems. A good follow-up, a closed ticket, a satisfied customer — these leave no trace a human can see. The board has a chance to be the one place where effort accumulates visibly.

Recognition on this board must be:
- **Earned**, not automatic (it must mean something)
- **Specific** (tied to actual behaviour, not vague praise)
- **Proportionate** (not childish, not corporate)
- **Persistent where it counts** (streaks and wins should not disappear after a refresh)

### 4.2 Recognition types

| Type | Trigger | Duration | Visibility |
|---|---|---|---|
| **Day streak** | ≥ 2 consecutive `cleared_queue` days | Persistent while active | Personal (header) |
| **Win count** | `is_win = true` activity completed | Persistent (this week shown) | Personal + potential team |
| **Day completion** | `isDoneForToday = true` | Session (disappears next load if no longer true) | Personal (header + stats bar) |
| **Volume badge** | N completions in a single day (configurable threshold) | Daily | Personal |
| **Milestone badge** | 10 / 25 / 50 / 100 total wins | Permanent | Personal |
| **Streak milestone** | 5 / 10 / 20-day streak | Permanent | Personal + team |

### 4.3 What should be per-user, team-visible, or private

**Per-user only (private):**
- Daily completion state
- Volume count today
- Card-level progress
- Guidance line content

**Team-visible (opt-in or teamlead view):**
- Streak (with user consent)
- Win count (this week)
- Streak milestones celebrated
- Day completion ("✔ done for today" in team roster)

**Private by default, never auto-surfaced:**
- Overdue counts per user (not for team view — only the user and their lead)
- Per-type breakdown

### 4.4 Visual treatment of recognition elements

**Streak chip (header, near subtitle):**

```
🔥 7 dagen op rij
```

- Small but visible — `text-sm font-semibold`
- Appears only when streak ≥ 2 (already implemented)
- On streak milestone (5, 10, 20): brief entry animation (scale from 0.9 to 1.0, once)

**Win count (stats bar):**

- Already in the stats bar as `statWins`
- Phase 1 improvement: add subtle badge when `winsThisWeek >= 3`:

```
🏆 5 wins deze week
```

**Day completion state (header):**

When `isDoneForToday`:
- Header subtitle becomes "Dag afgerond ✔ Goed gewerkt!" (already implemented)
- Stats bar background shifts to `cx-stats-done` (already implemented)

Phase 1 addition: show a dismissible inline banner (not a toast, not a modal):

```
┌──────────────────────────────────────────────────────┐
│  ✔  Je hebt vandaag alles afgerond. Goed bezig!      │  [×]
│     "Begin best met de oudste taak"  →  was je advies
└──────────────────────────────────────────────────────┘
```

**Volume badge (new, Phase 1):**

When `completedTodayTotal >= highWaterMark` (configurable, default 10):

```
⚡ 10 afgerond vandaag
```

Small pill in the stats bar, same row as the streak chip. Disappears at end of day.

### 4.5 Tone of recognition

Recognition copy must be warm but not sycophantic. Examples:

| Trigger | Good | Bad |
|---|---|---|
| Streak 7 days | "7 dagen op rij — dat is consistentie." | "WOW you're on fire AMAZING 🎉🎉" |
| isDoneForToday | "Dag afgerond. Goed gewerkt." | "CONGRATULATIONS! YOU DID IT! 🏅" |
| Win completed | "Win bijgeschreven." | "INCREDIBLE WIN!! 🥇🚀" |
| 10 completions | "10 afgerond vandaag." | "Super productivity hero!" |

The copy is a quiet nod, not a cheerleader. The user is a professional.

---

## 5. Guidance Layer

### 5.1 Principle

Guidance on this dashboard has one job: reduce friction between "I see what's happening" and "I know what to do next."

It does not judge. It does not assign blame. It suggests a path.

### 5.2 Phase 1 — Rule-based guidance (no AI)

#### 5.2.1 "What matters now" — global focus signal

A single sentence in the orientation zone, derived algorithmically:

```js
// Priority logic (server-side or client-side)
if (totalOverdue > 0) {
  focusSignal = "Je hebt " + totalOverdue + " achterstallige "
    + (totalOverdue === 1 ? "taak" : "taken") + " — begin daar.";
} else if (totalDueToday > 0) {
  // find the card with most dueToday
  focusSignal = "Je prioriteit vandaag: " + highestDueCard + " (" + N + " taken).";
} else if (isDoneForToday) {
  focusSignal = "Je dag is afgerond. Goed gedaan.";
} else {
  focusSignal = "Geen urgente taken vandaag. Goede dag.";
}
```

This is placed **above the cards**, below the stats bar. One line. No icon needed. The sentence itself carries the weight.

#### 5.2.2 Card-level guidance line

Per card, bottom of card, muted — see §3.3 above.

#### 5.2.3 Deep-link guidance

Cards already link to Odoo via `openPbCard()`. The guidance line can contain the contextual link:

```html
<span>Begin met de oudste — 
  <a onclick="openPbCard(idx,'overdue',event)">bekijk ze hier</a>.
</span>
```

This reduces the user's path from "I know I need to address this" to "I am now looking at the relevant tasks in Odoo" to one click.

#### 5.2.4 Guided onboarding state (new settings page only)

When mappings exist but none have `show_on_dashboard = true`:

> "Je dashboard is nog leeg. Zet 'Dashboard kaart' aan bij één of meer activiteitstypes om te beginnen."

When mappings exist with `keep_done_confirmed_at = null`:

> "⚠ Activiteitstype '…' is geconfigureerd maar Odoo heeft keep_done nog niet bevestigd. Afgeronde taken worden mogelijk niet geteld."

### 5.3 Phase 2 — AI-enhanced guidance (Claude Business integration)

Each guidance element has a fallback (Phase 1) and an enhanced version (Phase 2). The architecture for Phase 2 must be designed now so Phase 1 components are replaceable, not throwaway.

#### 5.3.1 "What to do next" AI summary

**Purpose:** Replace the rule-based `focusSignal` with a contextually aware summary.

**Input to Claude:** structured JSON: `{ overdue, dueToday, perType, streak, completedToday, dayOfWeek }`

**Output:** 1–2 sentence personalised focus summary.

Example output:
> "Je hebt 2 achterstallige opvolgingen en 4 planningen voor vandaag. Goed beginpunt: de oudste telefonische opvolging — die staat al 3 dagen open."

**Placement:** Same location as Phase 1 focus signal, same visual treatment. Swap is transparent.

**Fallback:** Rule-based Phase 1 signal shown until Claude responds (or on error).

#### 5.3.2 Next-best-action

**Purpose:** On a per-card basis, suggest the single most useful action.

**Input:** Per-type object with task titles/summaries (if passed from routes).

**Output:** Short actionable sentence.

**Placement:** Replaces the static guidance line on the card bottom.

**Fallback:** Static rule-based guidance line from Phase 1.

#### 5.3.3 Drafting assistant

**Purpose:** From the card, open a panel where the user can generate a draft response or follow-up text for the highest-priority task of that type.

**Trigger:** A small "📝 Draft" button on the card, only visible on hover (not distracting at rest).

**Placement:** Opens in a side drawer (not a modal — does not interrupt workflow).

**Fallback:** Link directly to the Odoo activity instead.

#### 5.3.4 Coaching nudge

**Purpose:** A periodic message (once per session, not per refresh) that acknowledges what the user has done and suggests a next frame.

Example:
> "Je hebt al 6 taken afgehandeld vandaag en je streak staat op 5 dagen. Nog 2 te gaan — je bent er bijna."

**Trigger:** Once per day, shown after first load where `completedToday >= 3 && remaining > 0`.

**Placement:** Dismissible banner below the stats bar. Not a toast (too disruptive).

**Fallback:** A static version based on the same conditions — same placement, pre-written copy.

#### 5.3.5 AI language design principles

When Claude is integrated, all AI-generated copy must:

- Use **jij/je** (informal but respectful)
- Never use passive construction ("Er zijn taken..." → "Je hebt X taken...")
- Never blame ("You still haven't..." → never used)
- Be short — 1–2 sentences maximum
- Be dismissible — the user can close any AI surface without it reappearing that session
- Have a loading state that does not block the rest of the UI

---

## 6. Teamlead / Manager Supportive UX

### 6.1 Design principle

The manager view must never be a leaderboard. A leaderboard punishes the person at the bottom. Instead, the manager view answers one question per team member:

> "Who is doing well today, and who might benefit from support?"

### 6.2 Supportive insight design

The team view (separate from self-view) shows a roster of agents with:

| Element | What it shows | What it communicates |
|---|---|---|
| Name + avatar | Agent identity | Human-first framing |
| Status indicator | 🟢 Cleared / 🟡 In progress / ⚪ Not started | Today's situation at a glance |
| Streak badge | "5 dagen" if ≥ 3 | "This person is consistent right now" |
| Win count (week) | Numeric | Output, not effort — useful for recognition |
| Overdue flag | ⚠ only if over threshold | Private exception signal — not a leaderboard column |

The overdue flag is visible to the teamlead but **never shown as a ranking**. It is an exception signal: "this person may need support today." Not: "this person is performing worst."

### 6.3 Recognition moments for the team

When an agent hits a milestone (streak of 5, 10 wins in a week, best week ever), the teamlead view can surface a prompt:

> "Fatima heeft deze week 15 wins bijgedragen — een goed moment voor een compliment."

This is a nudge, not a notification. It appears once, in context, and the teamlead can dismiss it or act on it.

The phrasing matters: "een goed moment voor een compliment" is an invitation. It is not "Fatima deserves a reward" (patronising) or "send a kudos!" (gamified).

### 6.4 Supportive intervention cue

When an agent has had 0 completions by midday AND has overdue items:

> "Sander heeft vandaag nog niet gestart en heeft 3 achterstallige taken. Misschien helpt een korte check-in."

This is surfaced only to the teamlead. It is a **care signal**, not a performance flag. The suggested action is a conversation, not a reprimand.

### 6.5 Phase 2 — AI for managers

Claude can synthesise per-agent context into a short team briefing:

> "Vandaag heeft je team 23 taken afgehandeld. Sterkste dag voor: Nico (8 compleet). Thomas heeft een moeilijke dag — 2 achterstallig, geen completions. Overweeg een check-in."

This briefing is generated once per manager per day, on demand (not pushed automatically). It is accessed via a "Team samenvatting" button, not auto-loaded.

---

## 7. Microcopy Direction

### 7.1 System principles

| Principle | Rule |
|---|---|
| **Agency** | Always address the user as the actor ("Je hebt…", "Begin met…") |
| **Present tense** | What is, not what was or should have been |
| **Specificity** | Use actual numbers ("3 taken") not vague qualifiers ("some tasks") |
| **Forward motion** | Always point toward the next action, not the last failure |
| **Proportionality** | Praise scales with achievement; it doesn't plateau at "Goed gedaan" forever |

### 7.2 Microcopy examples by context

#### Encouragement

| Situation | Copy |
|---|---|
| Streak ≥ 2 | "N dagen op rij — je bent consistent." |
| Streak ≥ 7 | "N dagen op rij. Dat is discipline." |
| Streak ≥ 20 | "N dagen op rij. Hier is iets goed mee." |
| Volume badge | "N afgerond vandaag." |
| Win | "Win bijgeschreven." |
| Best day ever | "Beste dag tot nu toe — N afgerond." |

#### Next action

| Situation | Copy |
|---|---|
| Overdue > 0, nothing done | "Begin met de oudste taak — zo maak je de meeste ruimte." |
| Overdue = 0, due today > 0 | "Alles op schema. De planningen voor vandaag staan klaar." |
| Progress > 50% | "Je bent al verder dan halverwege." |
| 1 remaining | "Nog één — bijna klaar." |

#### Praise / done state

| Situation | Copy |
|---|---|
| isDoneForToday | "Dag afgerond. Goed gewerkt." |
| isDoneForToday, streak ≥ 5 | "Dag afgerond — al N dagen op rij." |
| isDoneForToday, with timestamp | "Klaar om HH:MM. Goed bezig." |
| Card done, 1 completed | "1 afgerond vandaag." |
| Card done, N completed | "N afgerond vandaag." |

#### Almost done / finishing line

| Situation | Copy |
|---|---|
| progressPct ≥ 50 | "Bijna klaar — nog N te gaan." |
| 1 remaining, streak active | "Nog één. Dan blijft je streak staan." |

#### Warning without blame

| Situation | Copy |
|---|---|
| Overdue > threshold | "waarvan N achterstallig" (sub-label, not headline) |
| Danger card guidance | "Begin met de oudste — zo verklein je de achterstand het snelst." |
| keepDone not confirmed | "Afgeronde taken worden mogelijk niet geteld — controleer de instellingen." |
| Data warning | "Niet alle activiteitstypes zijn geverifieerd. De telling kan onvolledig zijn." |

#### AI assistant language (Phase 2)

| Role | Copy pattern |
|---|---|
| Summary | "Je hebt vandaag [N] taken afgehandeld, waarvan [X] wins. Je prioriteit nu: [type]." |
| Next-best-action | "De oudste open taak is [N] dagen oud. Begin daar — dat heeft de meeste impact." |
| Draft trigger | "Wil je een conceptreactie opstellen voor de eerste taak?" |
| Coaching nudge | "Je bent al goed bezig. Nog [N] te gaan — je kunt dit afronden voor [tijdstip]." |

#### What to avoid

- **Guilt words:** achterstallig, gemist, vergeten, te laat — use only as factual sub-labels, never as headlines
- **Passive:** "Er zijn 3 taken" → "Je hebt 3 taken"
- **Vague praise:** "Great work!", "Super!", "Amazing!" → specific or nothing
- **Robotic phrasing:** "Task completion status: 3/7 (42.86%)" → "3 van 7 afgerond"
- **Childish gamification:** XP, levels, points, confetti by default

---

## 8. Screen-Level Recommendations

### 8.1 Header

**Current:** Title, subtitle with `isDoneForToday` text, streak chip.  
**Proposed:**

```
┌─────────────────────────────────────────────────────────┐
│  CX Powerboard                         [vernieuwd 14:32]│
│  Goedemorgen, Nico.                    🔥 7 dagen op rij │
│  [focusSignal one-liner]                                 │
└─────────────────────────────────────────────────────────┘
```

Changes:
- Personal greeting using first name (derived from `user.full_name` already available)
- "Vernieuwd om HH:MM" timestamp replaces ambiguity about data freshness
- Streak chip moved to the same line as greeting — more prominent, not a footnote
- Focus signal as a third line — the "what matters now" sentence from §5.2.1

### 8.2 Stats bar

**Current:** 4 stats: Te doen vandaag, Achterstallig, Afgerond vandaag, Wins.  
**Proposed order and framing:**

```
[Afgerond vandaag: N]  [Te doen: N]  [Achterstallig: N]  [Wins deze week: N]
```

**Lead with what was done**, not what remains. Achterstallig third, not second. This is a one-pixel change with a large perceptual impact.

On `isDoneForToday`: wrap the stats bar in a subtle success frame (already done in V1). Add the recognition badge (⚡ if volume, 🔥 if streak milestone).

### 8.3 Cards

See §3.2 above for full redesign.

Additional card-level recommendations:

- **Card min-height:** Set a consistent min-height (e.g., `min-h-44`) so cards don't collapse to tiny when in idle state
- **Card ordering:** Sort cards by urgency — danger cards first, then normal, then done, then idle. Currently cards follow mapping order (arbitrary)
- **Card animation:** Existing `animateBars()` is good. Add a 50ms stagger between cards (delay = `cardIdx * 50ms`) for a cascade entry feel that is not distracting

### 8.4 Wins + recognition tray

**Current:** Wins are listed in a separate section below cards.  
**Proposed:** Keep the wins section but give it a named heading and visual framing:

```
┌──────────────────────────────────────────────────────┐
│  🏆 Jouw wins deze week                              │
│                                                      │
│  [win badge] [win badge] [win badge]                 │
│  Bekijk alle wins →                                  │
└──────────────────────────────────────────────────────┘
```

Wins should be displayed as cards, not as a flat list. Each win card: activity type icon, record name, time relative to now ("2 uur geleden"). Small, scannable.

If `winsThisWeek === 0`: do not show an empty wins section. Hide it entirely. An empty trophy section amplifies failure.

### 8.5 Manager / team insight section

**Placement:** Below the user's own cards (not above).  
**View condition:** Only rendered when `user.role === 'teamlead'` or equivalent.  
**Content:** Per §6 above — roster, status indicator, streak badge, supportive intervention cue.

### 8.6 AI help section (Phase 2 placeholder)

**Phase 1:** A placeholder row is acceptable:

```
┌──────────────────────────────────────────────────────┐
│  💬 AI-assistent — binnenkort beschikbaar            │
└──────────────────────────────────────────────────────┘
```

Do **not** build this yet. Keep the slot open in the layout so it does not require a structural redesign when Phase 2 arrives.

**Phase 2 placement:** Below the stats bar, above the cards. A collapsible panel (default closed). Contains: focus summary, next-best-action per card, draft button.

---

## 9. AI-Ready Future Layer

### 9.1 What Claude Business enables

Claude Business provides a company-controlled Claude API — the same quality as Claude.ai but with data privacy guarantees and organizational control.

When connected, every rule-based guidance element in this dashboard can be upgraded to a contextually intelligent one. The key decision is: **build Phase 1 in a way that Phase 2 is a swap, not a rebuild.**

### 9.2 Architecture for replaceability

Each guidance surface should be a **named slot** in the UI, filled by a data source. Phase 1: filled by a JS function. Phase 2: filled by an API response.

```
// Phase 1
var focusSignal = computeFocusSignal(stats);

// Phase 2 (same slot, different source)
var focusSignal = await fetchAiFocusSignal(stats);  // returns same string format
```

The UI never needs to know which source is active. The response contract (a short string) stays the same.

### 9.3 AI integration surface map

| Surface | Phase 1 | Phase 2 |
|---|---|---|
| Header focus signal | Rule-based sentence | Claude summary of day context |
| Card guidance line | Rule-based per-condition | Claude next-best-action per type |
| Draft button | Not present / Odoo deeplink | Claude draft panel in side drawer |
| Coaching nudge | Static copy | Claude contextual coaching |
| Manager team briefing | Not present | Claude daily team synthesis |
| Win explanation | Not present | "Why this matters" sentence next to win badge |

### 9.4 Data contract for Claude

When calling Claude for any guidance surface, the input must be structured and minimal:

```json
{
  "context": "cx_powerboard_focus",
  "date": "2026-03-24",
  "dayOfWeek": "Tuesday",
  "user": { "firstName": "Nico", "streakDays": 7 },
  "stats": {
    "overdue": 2,
    "dueToday": 4,
    "completedToday": 3,
    "winsToday": 1
  },
  "perType": [
    { "name": "Telefonische opvolging", "overdue": 2, "dueToday": 2, "completed": 1 },
    { "name": "Klantbezoek opvolging",  "overdue": 0, "dueToday": 2, "completed": 2 }
  ]
}
```

No PII (no customer names, no task content). Only aggregate statistics per type. This keeps the integration privacy-safe by design.

### 9.5 Gating — when to call AI

Do not call Claude on every dashboard load. Call only when:
- User explicitly triggers a surface (asks for guidance, opens draft panel)
- Or: once per day, the first time the page loads after 08:00 (for the focus signal)

Add a 5-minute session cache so a page refresh does not re-call Claude.

---

## 10. Phased Implementation Plan

### Phase 1 — No AI required, implementable now

These changes are all frontend/backend without any external AI dependency.

| # | Change | Location | Effort |
|---|---|---|---|
| 1.1 | Personal greeting in header ("Goedemorgen, [naam]") | `ui.js` header HTML | Small |
| 1.2 | "Vernieuwd om HH:MM" timestamp in header | `ui.js` boot + refresh | Small |
| 1.3 | Streak chip moved to greeting line (more prominent) | `ui.js` HTML layout | Small |
| 1.4 | Stats bar reordered: Afgerond first, Achterstallig third | `ui.js` HTML | Trivial |
| 1.5 | Rule-based focus signal (1 sentence above cards) | `ui.js` `computeFocusSignal()` | Small |
| 1.6 | Card ordering by urgency (danger first) | `ui.js` `renderDashboard()` | Small |
| 1.7 | Card stagger animation (50ms delay per card) | `ui.js` `renderDashboard()` | Trivial |
| 1.8 | Card guidance line (rule-based per-state) | `ui.js` `buildTypeCard()` | Small |
| 1.9 | Danger card microcopy: "waarvan N achterstallig" not headline | `ui.js` `buildTypeCard()` | Trivial |
| 1.10 | Progress card: lead with completed count when < 50%, remaining when ≥ 50% | `ui.js` `buildTypeCard()` | Small |
| 1.11 | Done card: completion timestamp "om HH:MM" (client-side) | `ui.js` boot + `buildTypeCard()` | Small |
| 1.12 | isDoneForToday: dismissible inline banner (not toast) | `ui.js` | Small |
| 1.13 | Wins section: hide when `winsThisWeek === 0` | `ui.js` | Trivial |
| 1.14 | Card min-height consistency | `ui.js` CSS | Trivial |
| 1.15 | Volume badge in stats bar (configurable threshold) | `ui.js` boot | Small |

**Phase 1 total: ~2–3 days of focused UI work. No new endpoints or schema changes needed.**

---

### Phase 2 — Claude Business integration required

These changes require the Claude Business API to be connected and a `/cx-powerboard/api/ai-guidance` endpoint or equivalent to be built.

| # | Change | Location | Dependency |
|---|---|---|---|
| 2.1 | AI focus signal replacing rule-based computation | Worker endpoint + `ui.js` | Claude API |
| 2.2 | AI card guidance line (next-best-action per type) | Worker endpoint + `ui.js` | Claude API + task titles in routes response |
| 2.3 | Draft assistant side drawer | New `ui.js` component + Worker endpoint | Claude API |
| 2.4 | Coaching nudge (once per day, contextual) | `ui.js` session state + Worker | Claude API + session tracking |
| 2.5 | Manager AI team briefing (on-demand) | Manager UI + Worker endpoint | Claude API + team data aggregation |
| 2.6 | AI coaching for manager (supportive intervention) | Manager UI | Claude API |

**Phase 2 total: estimated 1–2 weeks including the Claude integration scaffold. Phase 1 must be complete first.**

---

## Appendix — This Document vs. Earlier Documents

| Document | What it covers |
|---|---|
| `CX_POWERBOARD_ARCHITECTURE_V5.md` | Data flow, Odoo queries, `keep_done` mechanism |
| `CX_POWERBOARD_ARCHITECTURE_V6.md` | Hardening: date_done edge cases, failure fallback, `include_in_streak` |
| `CX_POWERBOARD_UX_CORRECTIONS_V1.md` | Six functional UX defects fixed: remaining=0 bug, idle state, progress bar, future count, microcopy, danger border |
| **`CX_POWERBOARD_USER_CENTRIC_UX_V2.md`** | **This document:** dashboard purpose, hierarchy of attention, card philosophy, recognition layer, guidance layer, manager UX, microcopy system, AI-ready design, phased implementation |

The documents are additive. V2 does not supersede V1 Corrections — those are prerequisite fixes. V2 is the layer on top.
