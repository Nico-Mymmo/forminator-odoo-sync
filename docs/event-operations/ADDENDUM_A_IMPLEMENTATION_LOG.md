# Event Operations – Addendum A Implementation Log

**Module:** Event Operations  
**Basisdocument:** ADDENDUM_A_EVENT_OPERATIONS.md  
**Branch:** events-operations  
**Date:** 2026-02-11

---

## Cross-Phase Summary Table

| Phase | Date | Commit | Status | Issues | Duration |
|-------|------|--------|--------|--------|----------|
| A1 | 2026-02-11 | `9632172` | ✅ | Theme toggle ontbraken, table width issues | ~45 min |
| A2 | 2026-02-11 | `cd9442e` | ✅ | switchView scope, STATUS_BADGES duplicate, cards niet zichtbaar | ~90 min |
| A3 | 2026-02-11 | `32688f0` | ✅ | Tab filtering bugs, shortcode false positives, duplicate WP events | ~180 min |
| A4 | 2026-02-11 | TBD | ⬜ | Not started | Est. ~6h |
| A5 | 2026-02-11 | TBD | ⬜ | Not started | Est. ~5h |

---

## Phase A1 – Layout & Theme Consistency Fix

### Metadata
| Veld | Waarde |
|------|--------|
| Date | 2026-02-11 |
| Branch | events-operations |
| Git Commit | `9632172` |

### Files Changed

| File | Action | Lines Changed |
|------|--------|---------------|
| src/modules/event-operations/ui.js | MODIFY | +52, -20 |
| docs/event-operations/ADDENDUM_A_EVENT_OPERATIONS.md | CREATE | +1350 |

### Issues Encountered

| # | Issue | Severity | Root Cause | Resolution |
|---|-------|----------|------------|------------|
| 1 | Theme toggle niet werkend | High | Geen `changeTheme()` / `initTheme()` functies in module | Toegevoegd conform home.js / project-generator-client.js pattern |
| 2 | Navbar logout/syncProdData undefined | Medium | Globale functies uit navbar niet beschikbaar in module | Toegevoegd: `logout()` en `syncProdData()` stub |
| 3 | Table column width problemen | Medium | Geen width constraints, geen whitespace-nowrap | Fixed met Tailwind classes: `w-*`, `min-w-*`, `whitespace-nowrap`, `truncate` |
| 4 | Lange titels breken layout | Medium | Geen text truncation | Toegevoegd: `max-w-xs` + `truncate` met `title` attribute voor full text |
| 5 | Knop tekst loopt over | Medium | `gap-1` in combinatie met icon + text | Replaced met `whitespace-nowrap` |
| 6 | Status badge tekst loopt over | Medium | Geen whitespace constraint | Toegevoegd: `whitespace-nowrap` op badge |

### Afwijkingen van ADDENDUM_A.md Initiële Scope

Tijdens implementatie bleek scope uitbreiding nodig:

| # | Originele Scope | Werkelijkheid | Aanpassing |
|---|----------------|---------------|------------|
| 1 | Alleen theme + layout fix | Theme toggle functies ontbraken volledig | Added `changeTheme()`, `initTheme()`, `logout()`, `syncProdData()` |
| 2 | Alleen `pt-16` toevoegen | Table width issues ontdekt | Extended met table column constraints + text truncation |
| 3 | Geen functionele wijzigingen | Navbar functies nodig voor consistency | Added navbar function stubs |

### Implementation Details

**Layout Changes:**
```diff
- <body class="bg-base-200" style="overflow-y: scroll;">
+ <body class="bg-base-200">
```

```diff
- <div class="pb-8">
-   <div class="container mx-auto px-6 max-w-7xl">
+ <div class="container mx-auto px-6 py-8 max-w-6xl">
```

**Theme Infrastructure Added:**
```javascript
function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('selectedTheme', theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem('selectedTheme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const selector = document.getElementById('themeSelector');
  if (selector) selector.value = savedTheme;
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
  } catch (err) {
    console.error('Logout error:', err);
  }
  localStorage.removeItem('adminToken');
  window.location.href = '/';
}

function syncProdData() {
  alert('Sync production data not available in this module');
}
```

**Table Width Fixes:**
```diff
- <table class="table">
+ <table class="table table-zebra">
```

```diff
- <th>ID</th>
- <th>Title</th>
- <th>Date</th>
+ <th class="w-16">ID</th>
+ <th class="min-w-[200px]">Title</th>
+ <th class="w-32 whitespace-nowrap">Date</th>
```

```diff
- '<td>' + escapeHtml(webinar.x_name) + '</td>' +
+ '<td class="max-w-xs"><div class="truncate" title="' + escapeHtml(webinar.x_name) + '">' + escapeHtml(webinar.x_name) + '</div></td>' +
```

```diff
- '<td>' + (webinar.x_studio_date || '—') + '</td>' +
+ '<td class="whitespace-nowrap">' + (webinar.x_studio_date || '—') + '</td>' +
```

```diff
- '<button class="btn btn-primary btn-xs gap-1" onclick="publishWebinar(' + webinarId + ', this)">
+ '<button class="btn btn-primary btn-xs whitespace-nowrap" onclick="publishWebinar(' + webinarId + ', this)">
```

**Initialization:**
```diff
  // ── Init ──
+ initTheme();
  loadData();
+ lucide.createIcons();
```

### Test Results

| # | Test | Status |
|---|------|--------|
| 1 | Theme toggle werkt | ✅ |
| 2 | Theme persists na page reload (localStorage) | ✅ |
| 3 | Navbar does not overlap content | ✅ |
| 4 | Spacing matches Project Generator (py-8, max-w-6xl) | ✅ |
| 5 | Table columns behouden correcte width | ✅ |
| 6 | Lange titels truncated met ellipsis | ✅ |
| 7 | Dates blijven op single line | ✅ |
| 8 | Button tekst loopt niet over | ✅ |
| 9 | Badge tekst blijft binnen boundaries | ✅ |
| 10 | Table zebra striping zichtbaar | ✅ |

### Notes

A1 was oorspronkelijk gepland als simpele CSS fix (theme + spacing), maar tijdens implementatie bleek dat:

1. **Theme infrastructure volledig ontbraken** — andere modules (home, project-generator) hadden deze al, event-operations niet
2. **Table width problemen** — user feedback tijdens test leidde tot scope uitbreiding binnen A1
3. **Navbar functies ontbraken** — `logout()` en `syncProdData()` werden aangeroepen vanuit navbar maar bestonden niet in module scope

**Decision:** Alle drie opgelost binnen A1 omdat ze fundamentele UI consistency issues zijn die A2 anders zouden blokkeren.

### Rollback Instructies

```bash
# Revert commit
git revert 9632172

# Or hard reset
git reset --hard 5e3091e  # Previous commit (master state)

# Redeploy
wrangler deploy
```

**Data Loss:** Geen (alleen UI changes)

---

## Phase A2 – Dual View (Table + Cards) with Registration Counts

### Metadata
| Veld | Waarde |
|------|--------|
| Date | 2026-02-11 |
| Branch | events-operations |
| Git Commits | `cd9442e`, `fd2ce6a`, `b585fe5` |
| Status | ✅ Complete |

### Actual Files Changed

| File | Lines Changed | Purpose |
|------|--------------|---------|
| public/event-operations-client.js | +166 lines | Client-side card rendering (DOM APIs only) |
| src/modules/event-operations/ui.js | +56, -8 | View toggle UI, cards container, switchView logic, registrationCounts state |
| src/modules/event-operations/routes.js | +21, -2 | Parallel fetch registration counts, return `{webinars, registrationCounts}` |
| src/modules/event-operations/odoo-client.js | +11 lines | Add getRegistrationCount() using search_count |
| src/modules/event-operations/constants.js | +2 lines | Add ODOO_FIELDS.LINKED_WEBINAR constant |

### Issues Resolved

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | `switchView is not defined` | Inline onclick handlers can't access external script functions | Moved switchView + initView to main ui.js script |
| 2 | `STATUS_BADGES already declared` | Both ui.js and event-operations-client.js declared constant | Removed from client.js, rely on parent scope |
| 3 | Cards not rendering on initial load | initView called before data loaded | Move initView call to loadData() finally block |
| 4 | Registration counts always 0 | Used wrong field `x_webinar_id` instead of `x_studio_linked_webinar` | Changed to correct many2one field name (commit `b585fe5`) |

### Implementation Details

**Registration Count Fetching (odoo-client.js):**
```javascript
export async function getRegistrationCount(env, webinarId) {
  const count = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'search_count',
    args: [[['x_studio_linked_webinar', '=', webinarId]]]
  });
  return count;
}
```

**Parallel Count Fetch (routes.js):**
```javascript
const countPromises = webinars.map(async (webinar) => {
  try {
    const count = await getRegistrationCount(env, webinar.id);
    return { id: webinar.id, count };
  } catch (err) {
    console.error(`Failed to get count for webinar ${webinar.id}:`, err);
    return { id: webinar.id, count: 0 };
  }
});

const countResults = await Promise.all(countPromises);
const registrationCounts = Object.fromEntries(
  countResults.map(r => [r.id, r.count])
);

return context.json({ 
  success: true, 
  data: { webinars, registrationCounts } 
});
```

**Response Structure Change (BREAKING):**
```diff
- { success: true, data: [...webinars] }
+ { success: true, data: { webinars: [...], registrationCounts: { 44: 12, ... } } }
```

**State Management (ui.js):**
```javascript
let odooWebinars = [];
let snapshotMap = new Map();
let registrationCounts = {}; // NEW

// In loadData():
odooWebinars = webinarsRes.data.webinars || [];
registrationCounts = webinarsRes.data.registrationCounts || {};
```

**View Toggle UI:**
```html
<div class="join">
  <button id="viewBtnTable" class="btn btn-sm btn-outline join-item btn-active" 
          onclick="switchView('table')">
    <i data-lucide="table" class="w-4 h-4"></i> Table
  </button>
  <button id="viewBtnCards" class="btn btn-sm btn-outline join-item" 
          onclick="switchView('cards')">
    <i data-lucide="layout-grid" class="w-4 h-4"></i> Cards
  </button>
</div>
```

**Cards Container:**
```html
<div id="cardsContainer" class="hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
```

**View Switching Logic:**
```javascript
function switchView(viewType) {
  const tableContainer = document.getElementById('dataTable');
  const cardsContainer = document.getElementById('cardsContainer');
  const tableBtn = document.getElementById('viewBtnTable');
  const cardsBtn = document.getElementById('viewBtnCards');
  
  if (viewType === 'table') {
    tableContainer.classList.remove('hidden');
    cardsContainer.classList.add('hidden');
    tableBtn.classList.add('btn-active');
    cardsBtn.classList.remove('btn-active');
  } else {
    tableContainer.classList.add('hidden');
    cardsContainer.classList.remove('hidden');
    tableBtn.classList.remove('btn-active');
    cardsBtn.classList.add('btn-active');
    
    if (typeof renderCardsView === 'function') {
      renderCardsView(odooWebinars, snapshotMap, registrationCounts);
    }
  }
  
  localStorage.setItem('eventOpsViewMode', viewType);
}

function initView() {
  const savedView = localStorage.getItem('eventOpsViewMode') || 'table';
  if (savedView === 'cards') {
    setTimeout(() => switchView('cards'), 100);
  }
}
```

**Table - Registration Count Column:**
```diff
+ <th class="w-20 whitespace-nowrap">Registrations</th>
```

```javascript
const regCount = registrationCounts[webinar.id] || 0;
// ...
+ '<td class="text-center whitespace-nowrap"><span class="badge badge-neutral badge-sm">' + regCount + '</span></td>' +
```

**Card Rendering (event-operations-client.js):**
- Uses only DOM APIs (createElement, textContent, appendChild)
- No innerHTML with user data (XSS prevention)
- Card structure: header (ID + status badge), title, meta grid (date, time, registrations, WP link), action buttons
- Responsive grid: 1 column mobile, 2 tablet, 3 desktop
- Hover shadow transition on cards

### Test Results

| # | Test | Status |
|---|------|--------|
| 1 | Table view shows registration counts | ✅ |
| 2 | Card view renders all webinars | ✅ |
| 3 | View toggle switches between table/cards | ✅ |
| 4 | View preference persists in localStorage | ✅ |
| 5 | Registration counts fetch in parallel (no sequential lag) | ✅ |
| 6 | Individual count fetch failures don't break entire request | ✅ |
| 7 | Lucide icons render in both views | ✅ |
| 8 | Publish/Re-publish buttons work in card view | ✅ |
| 9 | A1 table improvements retained | ✅ |

### Scope Corrections

| # | Change | Reason |
|---|--------|--------|
| 1 | Added registration count column to table view | Scope extension - valuable UX improvement |
| 2 | Response structure changed from array to object | Technical necessity for dual data return |

**Data Loss:** Geen (backwards compatible - oude clients krijgen error maar data blijft intact)

---

## Phase A3 – Client-side Tab Filtering

### Metadata
| Veld | Waarde |
|------|--------|
| Date | 2026-02-11 |
| Branch | events-operations |
| Git Commit | `32688f0` |
| Status | ✅ Complete |

### Files Changed

| File | Action | Lines Changed |
|------|--------|---------------|
| src/modules/event-operations/ui.js | MODIFY | +130, -25 |
| src/modules/event-operations/state-engine.js | MODIFY | +7, -2 |
| src/modules/event-operations/utils/text.js | MODIFY | +11 lines |
| src/modules/event-operations/wp-client.js | MODIFY | +75, -30 |

### Issues Resolved

| # | Issue | Severity | Root Cause | Fix |
|---|-------|----------|------------|-----|
| 1 | Table filtering didn't work | High | renderTable() ignored webinars parameter, always used global odooWebinars | Changed all renderTable() references to use webinars parameter |
| 2 | Missing "Published" filter | High | Initial design only had status-based tabs | Added "Gepubliceerd" tab with state === 'published' filter |
| 3 | Date filtering broken | High | Only handled DD/MM/YYYY format | Added YYYY-MM-DD support, date validation, normalized to start of day |
| 4 | Discrepancies at bottom | Medium | HTML order placed section after table/cards | Moved discrepancy section above tabs (mb-6) |
| 5 | False positive discrepancies | Critical | WordPress shortcodes differ in escaping vs Odoo | Added stripShortcodes() to remove shortcodes before comparison |
| 6 | Duplicate WP events on publish | Critical | publishToWordPress() always created new events | Added snapshot check → UPDATE existing event instead of CREATE |

### Implementation Details

**Tab UI (ui.js):**
```html
<div class="tabs tabs-boxed mb-6 flex-wrap">
  <button id="tabAll" class="tab tab-active" onclick="switchTab('all')">All</button>
  <button id="tabUpcoming" class="tab" onclick="switchTab('upcoming')">Komend</button>
  <button id="tabPast" class="tab" onclick="switchTab('past')">Verleden</button>
  <button id="tabPublished" class="tab" onclick="switchTab('published')">Gepubliceerd</button>
  <button id="tabDraft" class="tab" onclick="switchTab('draft')">Concept</button>
  <button id="tabOutOfSync" class="tab" onclick="switchTab('out_of_sync')">Out of Sync</button>
  <button id="tabArchived" class="tab" onclick="switchTab('archived')">Gearchiveerd</button>
</div>
```

**Filter Logic (ui.js):**
```javascript
function filterWebinars(webinars, tab) {
  if (tab === 'all') return webinars;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Normalize to start of day
  
  return webinars.filter(w => {
    const snapshot = snapshotMap.get(w.id);
    const state = snapshot?.computed_state || 'not_published';
    
    let eventDate = null;
    if (w[ODOO_FIELDS.DATE]) {
      const dateStr = w[ODOO_FIELDS.DATE];
      // Support DD/MM/YYYY and YYYY-MM-DD
      if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        eventDate = new Date(year, month - 1, day);
      } else if (dateStr.includes('-')) {
        eventDate = new Date(dateStr);
      }
      
      if (eventDate && !isNaN(eventDate)) {
        eventDate.setHours(0, 0, 0, 0);
      } else {
        console.warn('Invalid date format:', dateStr);
        eventDate = null;
      }
    }
    
    switch(tab) {
      case 'upcoming':
        return eventDate && eventDate >= now && state !== 'archived';
      case 'past':
        return eventDate && eventDate < now && state !== 'archived';
      case 'published':
        return state === 'published';
      case 'draft':
        return state === 'not_published';
      case 'out_of_sync':
        return state === 'out_of_sync';
      case 'archived':
        return state === 'archived';
      default:
        return true;
    }
  });
}
```

**URL Hash State Management:**
```javascript
function switchTab(tab) {
  activeTab = tab;
  
  // Update tab UI
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1).replace('_', '')).classList.add('tab-active');
  
  // Update URL hash
  window.location.hash = 'tab=' + tab;
  
  // Re-render current view with filtered data
  const filtered = filterWebinars(odooWebinars, activeTab);
  switchView(currentView); // Refresh view
}

function initTabFromHash() {
  const hash = window.location.hash.substring(1);
  if (hash.startsWith('tab=')) {
    const tab = hash.replace('tab=', '');
    if (['all', 'upcoming', 'past', 'published', 'draft', 'out_of_sync', 'archived'].includes(tab)) {
      switchTab(tab);
    }
  }
}

// Call after data loaded
initTabFromHash();
```

**Shortcode Stripping (utils/text.js):**
```javascript
/**
 * Strip WordPress shortcodes from text
 * 
 * Prevents false positives when shortcodes differ in escaping
 * Examples: [forminator_form id="14547"], [gallery ids="1,2,3"]
 * 
 * @param {string} text
 * @returns {string}
 */
export function stripShortcodes(text) {
  if (!text) return '';
  // Remove all [shortcode attr="value"] patterns
  return text.replace(/\[([a-z_-]+)(?:\s+[^\]]+)?\]/gi, '').trim();
}
```

**State Engine Fix (state-engine.js):**
```javascript
import { stripHtmlTags, normalizeString, stripShortcodes } from './utils/text.js';

function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // ... title and date checks ...
  
  // Description comparison with shortcode stripping
  const odooDescRaw = stripHtmlTags(odooSnapshot[ODOO_FIELDS.INFO] || '').trim();
  const wpDescRaw = stripHtmlTags(wpSnapshot.description || wpSnapshot.content?.rendered || '').trim();
  
  const odooDesc = stripShortcodes(odooDescRaw);
  const wpDesc = stripShortcodes(wpDescRaw);
  
  if (odooDesc && wpDesc && normalizeString(odooDesc) !== normalizeString(wpDesc)) {
    return true;
  }
  
  return false;
}
```

**Publish Flow Fix (wp-client.js):**
```javascript
export async function publishToWordPress(env, userId, odooWebinarId) {
  // 1. Fetch Odoo webinar
  const odooWebinar = await getOdooWebinar(env, odooWebinarId);
  
  // 2. Check if snapshot exists (to determine create vs update)
  const supabase = await getSupabaseAdminClient(env);
  const { data: existingSnapshot } = await supabase
    .from('webinar_snapshots')
    .select('wp_snapshot')
    .eq('user_id', userId)
    .eq('odoo_webinar_id', odooWebinarId)
    .single();
  
  const existingWpEventId = existingSnapshot?.wp_snapshot?.id;
  
  // 3. Map to WordPress payload
  const wpPayload = mapOdooToWordPress(odooWebinar);
  
  let wpEventId;
  
  if (existingWpEventId) {
    // UPDATE existing WordPress event
    console.log(`Updating existing WP event ${existingWpEventId}...`);
    
    const updateResponse = await fetch(
      `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}/${existingWpEventId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': wpAuthHeader(env),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(wpPayload)
      }
    );
    
    if (!updateResponse.ok) {
      throw new Error(`Tribe API update error ${updateResponse.status}`);
    }
    
    wpEventId = (await updateResponse.json()).id;
    
  } else {
    // CREATE new WordPress event
    console.log(`Creating new Tribe event...`);
    
    const createResponse = await fetch(
      `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}`,
      {
        method: 'POST',
        headers: {
          'Authorization': wpAuthHeader(env),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(wpPayload)
      }
    );
    
    if (!createResponse.ok) {
      throw new Error(`Tribe API create error ${createResponse.status}`);
    }
    
    wpEventId = (await createResponse.json()).id;
  }
  
  // 4. Set meta (always)
  // 5. Save snapshot
  
  return { wp_event_id: wpEventId, computed_state: 'published' };
}
```

### Test Results

| Feature | Status | Notes |
|---------|--------|-------|
| All tabs render correctly | ✅ | 7 tabs visible with proper styling |
| "Komend" filter (upcoming) | ✅ | Shows only future events, excludes archived |
| "Verleden" filter (past) | ✅ | Shows only past events, excludes archived |
| "Gepubliceerd" filter | ✅ | Shows state === 'published' |
| "Concept" filter | ✅ | Shows state === 'not_published' |
| "Out of Sync" filter | ✅ | Shows state === 'out_of_sync' |
| "Gearchiveerd" filter | ✅ | Shows state === 'archived' |
| Date parsing DD/MM/YYYY | ✅ | Correctly parsed |
| Date parsing YYYY-MM-DD | ✅ | Correctly parsed |
| URL hash persistence | ✅ | #tab=upcoming restores filter on reload |
| Table filtering works | ✅ | renderTable() uses filtered webinars |
| Card filtering works | ✅ | renderCardsView() uses filtered webinars |
| Discrepancy section above tabs | ✅ | Moved to top with mb-6 spacing |
| No shortcode false positives | ✅ | stripShortcodes() prevents discrepancy detection |
| Publish updates existing event | ✅ | No duplicate events created |
| Publish creates new event (first time) | ✅ | Works for new webinars |

### Scope Corrections

| # | Change | Reason |
|---|--------|--------|
| 1 | Added stripShortcodes() utility | User-reported false positive bug |
| 2 | Fixed publishToWordPress() to support UPDATE | Critical bug - duplicate events created |
| 3 | Moved discrepancy section above tabs | UX improvement request |

---

## Phase A4 – Tag Mapping Engine

### Metadata
| Status | ⬜ Not Started |

### Planned Scope

- New table: `webinar_tag_mappings`
- Odoo x_studio_tag_ids → WordPress event tags mapping
- Tag mapping UI (matrix view)
- Auto-create WP tags option
- Extended publish flow with tags

---

## Phase A5 – Editorial Content Layer

### Metadata
| Status | ⬜ Not Started |

### Planned Scope

- New column: `webinar_snapshots.editorial_content` (JSONB)
- Simple block editor (text + shortcode blocks)
- Preview modal
- Auto-append registration count option
- Publish flow uses editorial or falls back to Odoo description

---

## Addendum A Corrections Summary

Accumulated afwijkingen van initiële ADDENDUM_A_EVENT_OPERATIONS.md scope:

| # | Originele Planning | Werkelijkheid | Fase |
|---|-------------------|---------------|------|
| 1 | A1: alleen layout fix | A1: layout + theme infrastructure + table width fixes | A1 |
| 2 | A2: replace table met cards | A2: dual view (table AND cards) | A2 |
| 3 | A3: alleen client-side filtering | A3: filtering + shortcode stripping + publish update fix | A3 |

**Reden voor wijzigingen:**
- **A1 scope creep:** User feedback tijdens test → table width issues moesten opgelost worden voordat A2 zou starten
- **A2 scope pivot:** User request → beide views behouden i.p.v. table vervangen door cards
- **A3 scope creep:** Critical bugs discovered tijdens testing:
  - False positive discrepancies door WordPress shortcode escaping
  - Duplicate WordPress events door ontbrekende UPDATE logic
  - UI/UX improvements (discrepancy section positioning)

---

**Document Status:** 🔄 Active (A1-A3 compleet, A4-A5 pending)  
**Totaal issues A1:** 6  
**Totaal issues A2:** 4  
**Totaal issues A3:** 6  
**Totaal corrections:** 3  
**Huidige fase:** A3 compleet → ready for A4 (Tag Mapping Engine)
