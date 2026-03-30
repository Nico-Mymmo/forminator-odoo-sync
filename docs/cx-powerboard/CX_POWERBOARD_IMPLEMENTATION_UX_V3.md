# CX POWERBOARD — IMPLEMENTATION UX V3
## Concrete vertaling van UX V2 naar code

**Date:** March 2026  
**Type:** Implementation spec — direct bouwklaar  
**Vereisten:** UX Corrections V1 (bugs opgelost), V5/V6 architectuur  
**Doel:** Dashboard dat richting geeft, motiveert, en niet beschuldigt

---

## 1. Gap Analyse — Huidig vs. UX V2 Intentie

| # | Wat er ontbreekt / fout zit | Locatie |
|---|---|---|
| 1 | **Geen persoonlijke begroeting** — "CX Powerboard" is een tool naam, geen welkom | Header H1 |
| 2 | **Streak chip is een voetnoot** — verstopt in subtitle span, `display:none`, zíjlijn | `#streakChip` in subtitle |
| 3 | **Geen "vernieuwd om HH:MM"** — gebruiker weet niet of data actueel is | Header |
| 4 | **Geen focus signal** — geen enkel antwoord op "wat doe ik nu?" | Ontbreekt volledig |
| 5 | **Stats volgorde straft** — eerste stat die je ziet is "Te doen vandaag", tweede is "Achterstallig" | Stats bar |
| 6 | **Cards gesorteerd op configuratievolgorde** — urgente cards staan niet automatisch bovenaan | `renderDashboard()` |
| 7 | **Geen guidance line op cards** — card toont wat, zegt niet wat te doen | `buildTypeCard()` |
| 8 | **Geen card stagger animatie** — alle kaarten ploffen tegelijk in | `renderDashboard()` |
| 9 | **Team view is een leaderboard** — medailles 🥇🥈🥉, kolom "Achterstallig" zichtbaar — ranking, niet support | `loadTeam()` |
| 10 | **Wins sectie: altijd loader, nooit verborgen** — lege wins-tab werkt demotiverend | `renderWins()` |
| 11 | **isDoneForToday banner ontbreekt** — subtitle tekst verandert, maar geen prominente viering | Boot script |
| 12 | **Volume badge bestaat niet** — geen signaal bij hoge dagproductie | Ontbreekt volledig |

---

## 2. Redesign per Component

### 2.1 Header

**Wat verandert:**
- H1 "CX Powerboard" wordt persoonlijke begroeting
- Streak chip van subtitle-voetnoot naar eigen zichtbare positie naast greeting
- "Vernieuwd om HH:MM" als derde regel, muted
- Focus signal als afzonderlijk blok onder de header (nieuw element)

**Nieuwe HTML structuur** (in `cxPowerboardDashboardUI()`, server-side rendered):

```js
// Server-side: extraheer voornaam
const firstName = (user.full_name || user.name || user.email || '').split(' ')[0] || 'je';
const safeFirstName = firstName.replace(/[<>&"']/g, '');

// Header HTML (vervangt huidige header div)
const headerHtml = `
<div class="flex items-start justify-between mb-6">
  <div>
    <p class="text-xs font-semibold uppercase tracking-widest text-base-content/40 mb-0.5">CX Powerboard</p>
    <h1 class="text-2xl font-bold leading-tight">
      Goedemorgen, ${safeFirstName}.
    </h1>
    <div class="flex items-center gap-3 mt-1">
      <span id="streakChip" style="display:none;"
            class="inline-flex items-center gap-1 text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
      </span>
      <span id="refreshedAt" class="text-xs text-base-content/35"></span>
    </div>
  </div>
  ${settingsBtn}
</div>

<!-- Focus signal: wat doe ik nu? -->
<div id="focusSignalBar" class="mb-5" style="display:none;">
  <p id="focusSignalText"
     class="text-sm text-base-content/60 italic border-l-2 border-primary/30 pl-3 py-0.5">
  </p>
</div>
`;
```

**Boot script aanpassingen** (vervang bestaande greeting/streak logica):

```js
// Na data load — in de .then() na r.json():

// 1. Vernieuwd timestamp
var refreshEl = document.getElementById('refreshedAt');
if (refreshEl) {
  var now = new Date();
  refreshEl.textContent = 'Vernieuwd om '
    + String(now.getHours()).padStart(2, '0') + ':'
    + String(now.getMinutes()).padStart(2, '0');
}

// 2. Streak chip — nu prominent naast naam
if (s.streak >= 2) {
  var chipEl = document.getElementById('streakChip');
  if (chipEl) {
    chipEl.innerHTML = '\uD83D\uDD25 ' + s.streak + ' dagen op rij';
    chipEl.style.display = 'inline-flex';
  }
}

// 3. Focus signal
var fsText = computeFocusSignal(s, perTypeData, mappingsData);
var fsBar  = document.getElementById('focusSignalBar');
var fsEl   = document.getElementById('focusSignalText');
if (fsEl && fsText) {
  fsEl.textContent = fsText;
  fsBar.style.display = '';
}
```

---

### 2.2 Stats Bar

**Wat verandert:**
- Volgorde: **Gedaan first** → Te doen → Wins → Achterstallig (achterstallig als laatste, niet tweede)
- Klasse van "Te doen vandaag" waarde: geen kleur by default (neutraal), alleen `text-error` als overdue > 0
- Volume badge: verschijnt naast "Gedaan vandaag" wanneer completedToday ≥ drempel
- `isDoneForToday` styling: bestaand `cx-stats-done` blijft, maar ook `statRemainingToday` krijgt `text-success` class

**Nieuwe HTML** (vervangt bestaande `#statsBar` div):

```html
<div id="statsBar" class="stats shadow w-full mb-4">
  <div class="stat place-items-center">
    <div class="stat-title">Gedaan vandaag</div>
    <div class="stat-value text-2xl text-success" id="statCompletedToday">—</div>
    <div class="stat-desc" id="volumeBadge" style="display:none;"></div>
  </div>
  <div class="stat place-items-center">
    <div class="stat-title">Te doen</div>
    <div class="stat-value text-2xl" id="statRemainingToday">—</div>
  </div>
  <div class="stat place-items-center">
    <div class="stat-title">Wins (week)</div>
    <div class="stat-value text-2xl text-success" id="statWins">—</div>
  </div>
  <div class="stat place-items-center">
    <div class="stat-title">Achterstallig</div>
    <div class="stat-value text-2xl" id="statOverdue">—</div>
  </div>
</div>
```

**Boot script — stats updaten** (vervangt huidige stat-update blok):

```js
var s = data.stats || {};

// Completed first — het goede nieuws
var compEl = document.getElementById('statCompletedToday');
if (compEl) compEl.textContent = s.completedToday != null ? s.completedToday : 0;

// Volume badge
var VOLUME_THRESHOLD = 10; // configureerbaar
var volEl = document.getElementById('volumeBadge');
if (volEl && s.completedToday >= VOLUME_THRESHOLD) {
  volEl.textContent = '\u26A1 ' + s.completedToday + ' vandaag';
  volEl.style.display = '';
}

// Remaining — animatie bij transitie naar 0
var remEl = document.getElementById('statRemainingToday');
if (remEl) {
  var newRem = s.remainingToday != null ? s.remainingToday : 0;
  var oldRem = parseInt(remEl.textContent, 10);
  remEl.textContent = newRem;
  if (!isNaN(oldRem) && oldRem > 0 && newRem === 0) {
    remEl.classList.add('cx-stat-complete');
    setTimeout(function() { remEl.classList.remove('cx-stat-complete'); }, 500);
  }
}

// Wins
var winsEl = document.getElementById('statWins');
if (winsEl) winsEl.textContent = s.winsThisWeek != null ? s.winsThisWeek : 0;

// Overdue — rood ALLEEN als er effectief achterstallige zijn
var ovEl = document.getElementById('statOverdue');
if (ovEl) {
  ovEl.textContent = s.overdue != null ? s.overdue : 0;
  if (s.overdue > 0) ovEl.classList.add('text-error');
  else               ovEl.classList.remove('text-error');
}

// isDoneForToday
if (s.isDoneForToday) {
  var statsBarEl = document.getElementById('statsBar');
  if (statsBarEl) statsBarEl.classList.add('cx-stats-done');
  // Toon done banner
  showDoneBanner(s);
}
```

---

### 2.3 isDoneForToday Banner

Geen toast, geen subtitle-tekst-swap. Een afsluitbare inline banner boven de cards.

**Nieuwe HTML** (voeg toe net boven `#dashboardCards`, als sibling):

```html
<div id="doneBanner" style="display:none;"
     class="alert bg-success/10 border border-success/20 text-success mb-4 flex items-center justify-between">
  <div class="flex items-center gap-2">
    <i data-lucide="check-circle-2" class="w-5 h-5 shrink-0"></i>
    <span id="doneBannerText" class="text-sm font-medium"></span>
  </div>
  <button onclick="document.getElementById('doneBanner').style.display='none'"
          class="btn btn-xs btn-ghost btn-circle">
    <i data-lucide="x" class="w-3 h-3"></i>
  </button>
</div>
```

**JS functie `showDoneBanner(s)`:**

```js
function showDoneBanner(s) {
  var bannerEl = document.getElementById('doneBanner');
  var textEl   = document.getElementById('doneBannerText');
  if (!bannerEl || !textEl) return;

  var now = new Date();
  var timeStr = String(now.getHours()).padStart(2, '0') + ':'
              + String(now.getMinutes()).padStart(2, '0');

  var msg = 'Dag afgerond om ' + timeStr + ' \u2014 goed gewerkt.';
  if (s.streak >= 5) {
    msg = 'Dag afgerond. Al ' + s.streak + ' dagen op rij \u2014 dat is consistentie.';
  } else if (s.streak >= 2) {
    msg = 'Dag afgerond om ' + timeStr + ' \u2014 ' + s.streak + ' dagen op rij.';
  }

  textEl.textContent = msg;
  bannerEl.style.display = '';
  lucide.createIcons();
}
```

---

### 2.4 Cards — Volledig Redesign per State

De huidige `buildTypeCard()` is correct na V1 Corrections. Dit voegt toe:
- Hero metric wisselt op basis van voortgang
- Guidance line per state
- Stagger animatie via CSS `--card-delay`
- Consistente `min-height`

**Vervang de huidige `buildTypeCard()` volledig:**

```js
function buildTypeCard(name, pt, mapping, cardIdx) {
  // ── Data ─────────────────────────────────────────────────────────────
  var overdueCnt    = pt.overdue        || 0;
  var dueTodayCnt   = pt.dueToday       || 0;
  var futureCnt     = pt.future         || 0;
  var completedCnt  = pt.completedToday || 0;
  var remaining     = overdueCnt + dueTodayCnt;
  var total         = remaining + completedCnt;

  var thOv = mapping.danger_threshold_overdue != null ? mapping.danger_threshold_overdue : 1;
  var thTd = mapping.danger_threshold_today   != null ? mapping.danger_threshold_today   : 3;

  // ── States ────────────────────────────────────────────────────────────
  var isIdle   = remaining === 0 && completedCnt === 0;
  var isDone   = remaining === 0 && completedCnt > 0;
  var isDanger = !isIdle && !isDone && (overdueCnt >= thOv || dueTodayCnt >= thTd);
  // isNormal = none of the above

  var progressPct  = total > 0 ? Math.round(100 * completedCnt / total) : 0;
  var showProgress = total > 0;
  var targetWidth  = progressPct + '%';

  // ── Theming ───────────────────────────────────────────────────────────
  var cardBg, cardBorder, numCls, barCls, statusHtml;
  if (isIdle) {
    cardBg = 'bg-base-100'; cardBorder = 'border border-base-200';
    numCls = 'text-base-content/25'; barCls = 'bg-base-300'; statusHtml = '';
  } else if (isDone) {
    cardBg = 'bg-success/10'; cardBorder = 'border border-success/30';
    numCls = 'text-success';  barCls = 'bg-success';
    statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-success shrink-0">'
      + '<i data-lucide="check-circle-2" class="w-3 h-3 shrink-0"></i>Klaar</span>';
  } else if (isDanger) {
    cardBg = 'bg-error/10'; cardBorder = 'border border-error/30';
    numCls = 'text-error';  barCls = 'bg-error';
    statusHtml = '<span class="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-error shrink-0">'
      + '<i data-lucide="alert-circle" class="w-3 h-3 shrink-0"></i>Aandacht</span>';
  } else {
    cardBg = 'bg-base-100'; cardBorder = 'border border-base-200';
    numCls = 'text-base-content'; barCls = 'bg-primary'; statusHtml = '';
  }

  // ── Hero metric: wisselt op basis van voortgang ───────────────────────
  // < 50% voltooid: toon completions (traction)
  // ≥ 50% voltooid: toon remaining (finish-line pull)
  // isDone: check icoon
  // isIdle: dash
  var heroNum, heroSublabel;
  if (isDone) {
    heroNum      = null; // wordt icoon
    heroSublabel = completedCnt + ' afgerond vandaag';
  } else if (isIdle) {
    heroNum      = null; // wordt dash
    heroSublabel = futureCnt > 0 ? 'Niets voor vandaag gepland' : 'Geen taken geconfigureerd';
  } else if (progressPct >= 50 && completedCnt > 0) {
    // finish-line pull: resterende taken zijn de motivator
    heroNum      = remaining;
    heroSublabel = 'nog te gaan';
  } else if (completedCnt > 0) {
    // traction: wat al gedaan is motiveert
    heroNum      = completedCnt;
    heroSublabel = 'afgerond vandaag';
  } else {
    // niets gedaan: toon pending
    heroNum      = remaining;
    heroSublabel = overdueCnt > 0 && dueTodayCnt > 0
      ? 'waarvan ' + overdueCnt + ' achterstallig'
      : overdueCnt > 0 ? 'achterstallig' : 'te doen vandaag';
  }

  var bigEl;
  if (isDone) {
    bigEl = '<i data-lucide="check-circle-2" class="w-10 h-10 ' + numCls + ' mb-0.5"></i>';
  } else if (isIdle) {
    bigEl = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">—</span>';
  } else {
    bigEl = '<span class="text-5xl font-black leading-none tabular-nums ' + numCls + '">' + heroNum + '</span>';
  }

  // ── Guidance line (Phase 1: rule-based) ──────────────────────────────
  var guidanceLine = computeCardGuidance(overdueCnt, dueTodayCnt, completedCnt, progressPct, isDone, isIdle, isDanger, cardIdx);

  // ── Pills (niet voor isIdle) ──────────────────────────────────────────
  var pillsHtml = '';
  if (!isIdle) {
    var pillBase = 'inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] cursor-pointer transition-opacity hover:opacity-80';
    var ovPill   = overdueCnt > 0
      ? pillBase + ' bg-error/15 text-error font-semibold'
      : pillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
    var tdPill   = dueTodayCnt > 0
      ? pillBase + ' bg-warning/15 text-warning font-semibold'
      : pillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
    var doPill   = completedCnt > 0
      ? pillBase + ' bg-success/15 text-success font-medium'
      : pillBase + ' bg-base-200/60 text-base-content/25 pointer-events-none';
    pillsHtml = '<div class="flex flex-wrap gap-1.5 mt-3">'
      + '<span class="' + ovPill + '" onclick="openPbCard(' + cardIdx + ',&quot;overdue&quot;,event)">'   + overdueCnt   + '\u00a0achterstallig</span>'
      + '<span class="' + tdPill + '" onclick="openPbCard(' + cardIdx + ',&quot;today&quot;,event)">'     + dueTodayCnt  + '\u00a0vandaag</span>'
      + '<span class="' + doPill + '" onclick="openPbCard(' + cardIdx + ',&quot;completed&quot;,event)">' + completedCnt + '\u00a0gedaan</span>'
      + '</div>';
  }

  // ── Future tasks (niet bij isDone of isDanger) ────────────────────────
  var futureLine = (!isDone && !isDanger && futureCnt > 0)
    ? '<p class="text-[0.65rem] text-base-content/35 mt-2">Komende: ' + futureCnt + ' gepland</p>'
    : '';

  // ── Render ────────────────────────────────────────────────────────────
  var delay = (cardIdx * 50) + 'ms';  // stagger

  return '<div class="rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer min-h-44 flex flex-col justify-between '
      + cardBg + ' ' + cardBorder + '" '
      + 'style="opacity:0; transform:translateY(6px); animation: cx-card-in 0.25s ease forwards; animation-delay:' + delay + ';" '
      + 'onclick="openPbCard(' + cardIdx + ')">'
    // ── Top block
    + '<div>'
    + '<div class="flex items-start justify-between gap-2 mb-3">'
    + '<p class="font-semibold text-sm leading-snug text-base-content/80">' + name + '</p>'
    + statusHtml
    + '</div>'
    + '<div class="mb-1">'
    + bigEl
    + '<p class="text-[0.6rem] font-medium uppercase tracking-widest text-base-content/40 mt-1.5">' + escHtml(heroSublabel) + '</p>'
    + '</div>'
    + (showProgress
        ? '<div class="mt-3 mb-1">'
          + '<div class="flex items-center justify-between mb-1">'
          + '<span class="text-[0.65rem] text-base-content/45">' + completedCnt + ' van ' + total + ' afgerond</span>'
          + '<span class="text-[0.65rem] font-semibold ' + numCls + '">' + progressPct + '%</span>'
          + '</div>'
          + '<div class="h-1.5 rounded-full bg-base-200 overflow-hidden">'
          + '<div class="h-full rounded-full transition-all duration-500 ' + barCls + '" style="width:0%" data-target-width="' + targetWidth + '"></div>'
          + '</div>'
          + '</div>'
        : '')
    + '</div>'
    // ── Bottom block
    + '<div>'
    + pillsHtml
    + futureLine
    + (guidanceLine
        ? '<p class="text-[0.65rem] text-base-content/40 italic mt-2 leading-snug">' + escHtml(guidanceLine) + '</p>'
        : '')
    + '</div>'
    + '</div>';
}
```

**CSS toe te voegen** (in de `<style>` block):

```css
@keyframes cx-card-in {
  to { opacity: 1; transform: translateY(0); }
}
```

---

### 2.5 Card Sorting — Urgentie eerst

`renderDashboard()` sorteert momenteel op configuratievolgorde. Voeg sorting toe voor de loop:

**Vervangt de bestaande `renderDashboard()` body:**

```js
function renderDashboard() {
  if (dashboardRendered) return;
  dashboardRendered = true;

  var container = document.getElementById('dashboardCards');
  if (!container) return;

  // Maak gesorteerde lijst van mappings die op dashboard staan
  var visibleMappings = mappingsData.filter(function(m) { return m.show_on_dashboard; });

  // Sorteer: danger > normal > done > idle
  function cardPriority(m) {
    var tid = String(m.odoo_activity_type_id);
    var pt  = perTypeData[tid] || {};
    var ov  = pt.overdue    || 0;
    var td  = pt.dueToday   || 0;
    var co  = pt.completedToday || 0;
    var rem = ov + td;
    var thOv = m.danger_threshold_overdue != null ? m.danger_threshold_overdue : 1;
    var thTd = m.danger_threshold_today   != null ? m.danger_threshold_today   : 3;
    if (rem === 0 && co === 0)  return 3; // idle
    if (rem === 0 && co > 0)   return 2; // done
    if (ov >= thOv || td >= thTd) return 0; // danger
    return 1; // normal
  }

  visibleMappings.sort(function(a, b) {
    var pa = cardPriority(a), pb = cardPriority(b);
    if (pa !== pb) return pa - pb;
    // Bij gelijkspel: meeste remaining bovenaan
    var remA = (perTypeData[String(a.odoo_activity_type_id)] || {});
    var remB = (perTypeData[String(b.odoo_activity_type_id)] || {});
    var countA = (remA.overdue || 0) + (remA.dueToday || 0);
    var countB = (remB.overdue || 0) + (remB.dueToday || 0);
    return countB - countA;
  });

  if (!visibleMappings.length) {
    container.innerHTML = '<div class="text-center py-16 col-span-full text-base-content/50">'
      + '<i data-lucide="layout-dashboard" class="w-10 h-10 mx-auto mb-2"></i>'
      + '<p class="text-sm">Geen dashboard kaarten geconfigureerd.</p>'
      + '<p class="text-xs mt-1">Zet &quot;Dashboard kaart&quot; aan in de instellingen.</p>'
      + '</div>';
    lucide.createIcons();
    return;
  }

  var html = '';
  for (var ci = 0; ci < visibleMappings.length; ci++) {
    var mapping   = visibleMappings[ci];
    var tid       = String(mapping.odoo_activity_type_id);
    var pt        = perTypeData[tid] || { overdue: 0, dueToday: 0, future: 0, completedToday: 0 };
    var typeIntId = mapping.odoo_activity_type_id;
    cardUrls[ci] = {
      all:       buildOdooUrl(typeIntId, 'all'),
      overdue:   buildOdooUrl(typeIntId, 'overdue'),
      today:     buildOdooUrl(typeIntId, 'today'),
      completed: buildOdooUrl(typeIntId, 'completed'),
    };
    html += buildTypeCard(escHtml(mapping.odoo_activity_type_name), pt, mapping, ci);
  }

  container.innerHTML = html;
  lucide.createIcons();
  animateBars();
}
```

---

## 3. Guidance Layer (Phase 1 — geen AI)

### `computeFocusSignal(stats, perTypeData, mappingsData)`

Globale zin boven de cards. Eén antwoord op "wat doe ik nu?".

```js
function computeFocusSignal(s, ptData, mappings) {
  var totalOverdue    = s.overdue      || 0;
  var totalRemaining  = s.remainingToday || 0;
  var totalCompleted  = s.completedToday  || 0;

  if (s.isDoneForToday) {
    return null; // doneBanner vervangt dit; geen dubbele boodschap
  }
  if (totalOverdue > 0) {
    var label = totalOverdue === 1 ? 'taak verdient aandacht' : 'taken verdienen aandacht';
    // Vind de card met meeste overdue
    var topCard = null, topCount = 0;
    for (var i = 0; i < mappings.length; i++) {
      var m = mappings[i];
      var pt = ptData[String(m.odoo_activity_type_id)] || {};
      if ((pt.overdue || 0) > topCount) {
        topCount  = pt.overdue;
        topCard   = m.odoo_activity_type_name;
      }
    }
    if (topCard) {
      return totalOverdue + ' ' + label + '. Begin met ' + topCard + '.';
    }
    return totalOverdue + ' ' + label + '. Begin met de oudste.';
  }
  if (totalRemaining > 0 && totalCompleted > 0) {
    var pct = Math.round(100 * totalCompleted / (totalCompleted + totalRemaining));
    if (pct >= 50) {
      return 'Je bent al verder dan halverwege. Nog ' + totalRemaining + ' te gaan.';
    }
    return totalCompleted + ' gedaan, nog ' + totalRemaining + ' te gaan. Goed bezig.';
  }
  if (totalRemaining > 0 && totalCompleted === 0) {
    return 'Je hebt ' + totalRemaining + ' ' + (totalRemaining === 1 ? 'taak' : 'taken') + ' voor vandaag. Begin wanneer je klaar bent.';
  }
  return null; // geen relevant signaal
}
```

**AI hook (Phase 2):** Vervang de body van `computeFocusSignal()` door een call naar `/cx-powerboard/api/ai/focus`. Response contract: `{ signal: string | null }`. Fallback: roep de huidige functie aan als de call faalt.

---

### `computeCardGuidance(overdue, dueToday, completed, pct, isDone, isIdle, isDanger, idx)`

Per-card guidance regel onderaan de card.

```js
function computeCardGuidance(overdueCnt, dueTodayCnt, completedCnt, pct, isDone, isIdle, isDanger, cardIdx) {
  if (isDone || isIdle) return null;

  if (overdueCnt >= 1 && completedCnt === 0) {
    return 'Begin met de oudste \u2014 zo maak je het meeste ruimte.';
  }
  if (overdueCnt >= 1 && completedCnt > 0) {
    return 'Goed begonnen. Nog ' + overdueCnt + ' achterstallig \u2014 doorzetten.';
  }
  if (dueTodayCnt === 1 && completedCnt > 0) {
    return 'Nog \u00e9\u00e9n \u2014 bijna klaar!';
  }
  if (pct >= 50 && pct < 100) {
    return 'Je bent al meer dan halverwege. Doorzetten.';
  }
  if (dueTodayCnt > 0 && completedCnt === 0) {
    return 'Je hebt ' + dueTodayCnt + ' ' + (dueTodayCnt === 1 ? 'taak' : 'taken') + ' voor vandaag klaarstaan.';
  }
  return null;
}
```

**AI hook (Phase 2):** Vervang door async call naar `/cx-powerboard/api/ai/card-guidance?typeId=X`. Response contract: `{ guidance: string | null }`. Dezelfde `guidanceLine` slot in de card HTML.

---

## 4. Recognition Layer

### Streak chip

**Slot:** `#streakChip` — nu in de header, eerste regel naast de naam. Al aangemaakt in §2.1.

**Logica** (in boot script):

```js
if (s.streak >= 2) {
  var chipEl = document.getElementById('streakChip');
  if (chipEl) {
    var streakLabel;
    if (s.streak >= 20) streakLabel = '\uD83D\uDD25 ' + s.streak + ' dagen op rij \u2014 dat is discipline.';
    else if (s.streak >= 7) streakLabel = '\uD83D\uDD25 ' + s.streak + ' dagen op rij';
    else                     streakLabel = '\uD83D\uDD25 ' + s.streak + ' dagen op rij';
    chipEl.textContent = streakLabel;
    chipEl.style.display = 'inline-flex';
  }
}
```

**Milestone animatie** (bij streak >= 5, 10, 20 — eenmalig via localStorage):

```js
var milestones = [5, 10, 20];
var currentStreak = s.streak || 0;
var lastMilestone = parseInt(localStorage.getItem('pb_streak_milestone') || '0', 10);
for (var mi = 0; mi < milestones.length; mi++) {
  if (currentStreak >= milestones[mi] && lastMilestone < milestones[mi]) {
    localStorage.setItem('pb_streak_milestone', String(milestones[mi]));
    var chipEl2 = document.getElementById('streakChip');
    if (chipEl2) {
      chipEl2.style.animation = 'cx-pop 0.5s ease';
      setTimeout(function() { var c = document.getElementById('streakChip'); if (c) c.style.animation = ''; }, 500);
    }
    break;
  }
}
```

---

### Volume badge

**Slot:** `#volumeBadge` in de stats bar (zie §2.2). Wordt getoond wanneer `completedToday >= VOLUME_THRESHOLD` (default 10, aanpasbaar).

**Geen aparte animatie** — de stat zelf communiceert al; de badge is een rustige toevoeging.

---

### Wins sectie — conditioneel tonen

`renderWins()` moet de wins-tab verbergen (of een vriendelijk leeg-scherm geven) als er niets is. **Nooit** een lege trofee sectie.

**Voeg toe aan het begin van `renderWins()`:**

```js
// Aan het begin van renderWins, na data check:
if (!winsData || winsData.length === 0) {
  var winsEl = document.getElementById('winsContent');
  if (winsEl) {
    winsEl.innerHTML = '<div class="text-center py-16 text-base-content/40">'
      + '<i data-lucide="trophy" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>'
      + '<p class="text-sm">Nog geen wins deze week.</p>'
      + '<p class="text-xs mt-1 text-base-content/30">Wins worden bijgeschreven als je een activiteit van het type &quot;Win&quot; afrondt.</p>'
      + '</div>';
    lucide.createIcons();
  }
  return;
}
```

---

## 5. UX Gedrag

### 5.1 Card sorting

Gedefinieerd in `renderDashboard()` — zie §2.5. Volgorde: danger → normal → done → idle. Binnen elke groep: meeste remaining bovenaan.

### 5.2 Animaties

**Card entry stagger** — via `animation-delay` per card (50ms per index). CSS keyframe al gedefinieerd in §2.4. Cards starten op `opacity:0; transform:translateY(6px)` en animeren naar zichtbaar.

**Progress bar fill** — bestaand `animateBars()` via double `requestAnimationFrame`. Geen wijziging nodig.

**Stat pop bij transitie → 0** — bestaand `cx-stat-complete`. Geen wijziging.

**Streak milestone** — eenmalige `cx-pop` animatie op de chip. Zie §4.

**Geen confetti, geen toasts, geen pulserende ringen.**

### 5.3 Empty states — wanneer elementen verborgen zijn

| Element | Verborgen wanneer |
|---|---|
| `#focusSignalBar` | `isDoneForToday` of geen relevant signaal |
| `#streakChip` | `streak < 2` |
| `#refreshedAt` | Vóór eerste data load |
| `#volumeBadge` | `completedToday < VOLUME_THRESHOLD` |
| `#doneBanner` | Niet `isDoneForToday` |
| `#dataWarningBanner` | `!s.dataWarning` |
| `#uidMissingAlert` | `!data.odooUidMissing` |
| Wins sectie | `winsData.length === 0` |
| Card pills | `isIdle === true` |
| Card progress section | `total === 0` |
| Card guidance line | `isDone || isIdle` (of geen relevante conditie) |
| Card future line | `isDone || isDanger || futureCnt === 0` |

**Nul visuele ruis** — geen lege balken, geen "0/0 afgerond", geen lege trofeeën.

### 5.4 Team view — verwijder leaderboard

De huidige team view is een leaderboard met 🥇🥈🥉 en een kolom "Achterstallig". Dit is exact het tegenovergestelde van de V2 intentie.

**Vervangt de hele `loadTeam()` render** (de container.innerHTML call):

```js
// Sorteer op closed_queue + wins, maar TOON GEEN RANKING
var rows = '';
for (var ti = 0; ti < team.length; ti++) {
  var tm     = team[ti];
  var tname  = escHtml(tm.name || tm.email || '—');
  var twins  = tm.winsThisWeek || 0;
  var tstreak = tm.streak || 0;
  var tcleared = tm.clearedToday ? '\u2705' : '\u23F3';  // ✅ of ⏳

  rows += '<tr>'
    + '<td class="font-medium">' + tname + '</td>'
    + '<td class="text-center">' + tcleared + '</td>'
    + '<td class="text-center text-success font-semibold">' + twins + '</td>'
    + '<td class="text-center text-base-content/60">'
    + (tstreak >= 2 ? '\uD83D\uDD25 ' + tstreak : '\u2014')
    + '</td>'
    + '</tr>';
}
container.innerHTML = '<div class="card bg-base-100 shadow-sm">'
  + '<div class="card-body">'
  + '<h2 class="font-semibold text-base mb-1">Je team vandaag</h2>'
  + '<p class="text-xs text-base-content/40 mb-4">Wie heeft zijn dag afgerond, wie is nog bezig.</p>'
  + '<table class="table table-sm">'
  + '<thead><tr>'
  + '<th>Naam</th>'
  + '<th class="text-center">Dag klaar</th>'
  + '<th class="text-center text-success">Wins/week</th>'
  + '<th class="text-center">Streak</th>'
  + '</tr></thead>'
  + '<tbody>' + rows + '</tbody>'
  + '</table></div></div>';
lucide.createIcons();
```

**Wat verandert:**
- Geen medals, geen ranking-volgorde
- Geen "Achterstallig" kolom in teamoverzicht (privé signaal, niet voor team)
- Titel "Je team vandaag", niet "Leaderboard"
- "Dag klaar" als binaire indicator: ✅ / ⏳

---

## 6. Microcopy — Gebruiksklare Strings

Geen uitleg, direct toepasbaar:

```
"Goedemorgen, [naam]."
"Nog 1 te gaan — bijna klaar!"
"Bijna klaar — nog [N] te gaan."
"Goed bezig — [N] gedaan."
"Begin met de oudste — zo maak je het meeste ruimte."
"Dag afgerond om [HH:MM] — goed gewerkt."
"Al [N] dagen op rij — dat is consistentie."
"[N] afgerond vandaag."
"Je bent al verder dan halverwege. Doorzetten."
"Niets voor vandaag gepland."
"Nog [N] taken verdienen aandacht. Begin met [type]."
"Win bijgeschreven."
"Je team vandaag — wie heeft zijn dag afgerond."
"[N] dagen op rij."
```

**Vermijden:**
- "achterstallig" als headline (mag alleen als sub-label of in pill)
- "U heeft" (informeel, gebruik "je")
- "Er zijn X taken" (passief)
- "Je hebt X achterstallige taken" (schuld)
- Exclamatiepunten op succes (de inhoud is al warm genoeg)

---

## 7. AI-Ready Hooks (Phase 2)

Overzicht van exacte inplug-punten. Niets bouwen nu — slot openhouden.

| Slot | Huidige invulling (Phase 1) | Phase 2 swap |
|---|---|---|
| `computeFocusSignal()` | Rule-based JS functie | `GET /cx-powerboard/api/ai/focus` → `{ signal: string }` |
| `computeCardGuidance()` | Rule-based per conditie | `GET /cx-powerboard/api/ai/card-guidance?typeId=X` → `{ guidance: string }` |
| `doneBanner` tekst | `showDoneBanner()` template | Claude composing → zelfde `textEl.textContent` slot |
| Team view support cue | Niet aanwezig (Phase 2 only) | Manager-only panel: `GET /cx-powerboard/api/ai/team-brief` → `{ briefing: string }` |

**Contract vereisten voor Phase 2:**
- Alle AI responses zijn `string | null`
- Bij `null` of fout: Phase 1 fallback wordt gebruikt
- AI nooit geblokkeerd op DOM render — laadt asynchroon, vult slot in wanneer klaar
- Geen PII in requests: enkel `{ stats, perType, streak, firstName }` — geen taaknamen, geen klantdata

```js
// Voorbeeld async pattern voor Phase 2:
function loadAiFocusSignal(payload) {
  fetch('/cx-powerboard/api/ai/focus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (!d.signal) return; // geen AI output — Phase 1 blijft staan
    var fsEl = document.getElementById('focusSignalText');
    var fsBar = document.getElementById('focusSignalBar');
    if (fsEl) {
      fsEl.textContent = d.signal;
      if (fsBar) fsBar.style.display = '';
    }
  })
  .catch(function() {}); // silent fail — Phase 1 blijft
}
```

---

## Appendix — Implementatievolgorde

Aanbevolen volgorde om risico te minimaliseren:

1. **Stats bar reorder** (§2.2 HTML) — trivial, visuele impact direct zichtbaar
2. **Header greeting + streak prominence** (§2.1) — small, onmiddellijk persoonlijker
3. **`refreshedAt` timestamp** (§2.1 boot) — trivial
4. **`showDoneBanner()`** (§2.3) — small
5. **Card sorting** (§2.5 `renderDashboard()`) — small, context-onafhankelijk
6. **Card stagger animatie CSS + delay** (§2.4) — trivial CSS + één regel JS
7. **`computeFocusSignal()` + focusSignalBar** (§3) — small, nieuwe functie
8. **`computeCardGuidance()` + guidance line in card** (§2.4 + §3) — small
9. **Team view redesign** (§5.4) — small, verwijder leaderboard
10. **Wins lege state** (§4) — trivial
11. **Volume badge** (§4) — small

**Totale schatting: 1 werkdag geconcentreerd werk.**  
Elke stap is zelfstandig deploybaar zonder de andere te breken.
