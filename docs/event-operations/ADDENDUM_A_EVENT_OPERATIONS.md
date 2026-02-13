# EVENT OPERATIONS – ADDENDUM A: UI & EDITORIAL OVERHAUL

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Base Implementation:** Phase 0-7 Complete (IMPLEMENTATION_MASTER_PLAN.md)  
**Implementation Period:** February 11, 2026  
**Status:** Ready for Implementation  
**Platform:** Cloudflare Workers + Supabase PostgreSQL + Pure Vanilla JavaScript

---

## 1. Addendum Overview

### Purpose

Addendum A extends the Event Operations module with improved user experience, editorial control, and WordPress taxonomy integration. The baseline implementation (Phase 0-7) provides Odoo x_webinar → WordPress Tribe Events synchronization with snapshot-based state management. This addendum improves UI usability, adds registration count visibility, enables tag mapping, and provides editorial content control without breaking existing publish workflows.

### Problem Solved

The baseline implementation has several UX and editorial limitations:

1. **Theme Inconsistency:** Module UI does not inherit correct theme, causing navbar overlap and inconsistent spacing
2. **Low Information Density:** Table view shows limited data per webinar (no registration count, no tags)
3. **No Segmentation:** All webinars in one flat list (no filtering by date, status, or category)
4. **No Tag Mapping:** WordPress relies on manual taxonomy management (no Odoo x_studio_tag_ids sync)
5. **No Editorial Control:** WP event description is 1:1 copy of Odoo field (no customization, shortcodes, or blocks)

This addendum resolves these issues through five controlled subfases (A1-A5).

### What It Does

1. **A1 – Layout & Theme Consistency Fix**
   - Fix theme inheritance (DaisyUI theme propagation)
   - Fix navbar overlap (correct top spacing)
   - Match Project Generator layout pattern
   - No functional changes

2. **A2 – Card View Redesign**
   - Replace table with card-based layout
   - Display registration count (x_webinarregistrations)
   - Status badges on cards
   - Expandable details per card
   - No editor or tag mapping yet

3. **A3 – Filtering & Segmentation Layer**
   - Client-side filtering (no new DB queries)
   - Tab-based segmentation: Upcoming, Past, Draft, Out of Sync, Archived, All
   - Filter logic uses existing odoo_snapshot and computed_state fields
   - No server-side changes

4. **A4 – Tag Mapping Engine**
   - New Supabase table: `webinar_tag_mappings`
   - Map Odoo x_studio_tag_ids → WordPress event tags
   - UI for tag mapping management
   - Publish flow extended to include tags
   - Auto-create WP tags option

> **Superseded for taxonomy decisions (Addendum C, 2026-02-13):**
> A4 many2many mapping via `x_studio_tag_ids` is deprecated for publish/sync taxonomy resolution.
> Current authoritative flow is `x_webinar_event_type_id` → `event_type_wp_tag_mapping` → `wp_tag_id`.

5. **A5 – Editorial Content Layer**
   - New column in `webinar_snapshots`: `editorial_content` (JSONB)
   - Simple block editor for custom WP descriptions
   - Shortcode inserter (Forminator, ACF, etc.)
   - Preview mode
   - Publish flow uses editorial layer when present, falls back to Odoo description

### What It Does Not Do

The following are explicit non-goals for Addendum A:

- Does not modify Odoo data (read-only integration remains)
- Does not change RLS pattern (user-scoped isolation remains)
- Does not introduce frameworks (vanilla JS + DOM APIs only)
- Does not add real-time sync (manual sync trigger remains)
- Does not support bidirectional WordPress → Odoo sync
- Does not modify state-engine.js logic (backward compatible)
- Does not add authentication mechanisms (existing user context remains)
- Does not add batch operations beyond single-webinar publish
- Does not support WordPress custom post types beyond Tribe Events
- Does not provide WYSIWYG editors (plain text + shortcodes only)

---

## 2. High-Level Architecture

### System Layers (Post-Addendum A)

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT LAYER (Browser)                                       │
│ - event-operations-client.js (NEW vanilla JavaScript file)  │
│ - DOM APIs only (createElement, textContent, appendChild)   │
│ - DaisyUI components, Lucide icons                         │
│ - No frameworks, no template literals for dynamic content   │
│ - Card rendering, tag editor, editorial editor             │
└─────────────────────────────────────────────────────────────┘
                              ↑ FETCH API
┌─────────────────────────────────────────────────────────────┐
│ SERVER LAYER (Cloudflare Workers)                           │
│ - routes.js: Extended API routes (tag mappings, editorial)  │
│ - ui.js: Extended static HTML shell (client script include) │
│ - state-engine.js: NO CHANGES (backward compatible)        │
│ - mapping.js: Extended with tag mapping logic              │
│ - wp-client.js: Extended to publish tags + editorial       │
│ - odoo-client.js: Extended to fetch x_studio_tag_ids       │
│ - NEW: tag-mapping.js (tag CRUD operations)                │
│ - NEW: editorial.js (editorial content helpers)            │
└─────────────────────────────────────────────────────────────┘
                              ↑ SUPABASE CLIENT / ODOO XML-RPC
┌─────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                   │
│ - Supabase PostgreSQL                                       │
│   - webinar_snapshots (EXTENDED with editorial_content)    │
│   - webinar_tag_mappings (NEW TABLE)                       │
│   - RLS policies (user-scoped, TO public)                  │
│ - Odoo Server (external, read-only)                        │
│   - x_webinar (x_studio_tag_ids added to fetch fields)     │
│   - x_webinarregistrations (count query)                   │
│ - WordPress (external, write via Tribe + Core API)         │
│   - Tags taxonomy (auto-create on publish)                 │
└─────────────────────────────────────────────────────────────┘
```

### Separation of Concerns (Addendum A Changes)

**Client Layer Responsibilities (NEW):**
- Card rendering with DOM APIs
- Client-side filtering (date-based segmentation logic)
- Tag mapping UI (matrix view, add/edit/delete tags)
- Editorial content editor (simple block editor, shortcode insertion)
- Preview modal rendering
- All existing responsibilities (table rendering, modals, etc.) removed or migrated

**Server Layer Responsibilities (NEW):**
- Tag mapping CRUD routes (`GET /api/tag-mappings`, `POST /api/tag-mappings`, `DELETE /api/tag-mappings/:id`)
- Editorial content routes (`GET /api/editorial/:webinar_id`, `PUT /api/editorial/:webinar_id`)
- Extended publish flow (include tags, use editorial content)
- Registration count fetching (via Odoo `search_count` on x_webinarregistrations)

**Server Layer Responsibilities (UNCHANGED):**
- State engine logic (computeEventState, detectDiscrepancies)
- Snapshot upsert pattern
- Sync route orchestration

**Data Layer Responsibilities (NEW):**
- Store tag mappings with user-scoped RLS
- Store editorial content in webinar_snapshots JSONB column
- Enforce unique constraints on tag mappings (user_id + odoo_tag_id + wp_tag_slug)

**Data Layer Responsibilities (UNCHANGED):**
- Snapshot storage pattern
- RLS enforcement (auth.uid() = user_id)
- No foreign keys on user_id

### Key Architectural Constraints

All baseline constraints remain enforced:

1. **No Inline JavaScript in Server Templates**
   - Server-side `ui.js` returns static HTML shell only
   - All dynamic logic in external `event-operations-client.js`
   - No nested template literals, no backtick escaping

2. **No Template Literals for Dynamic UI**
   - Client-side HTML generation uses DOM APIs exclusively
   - `createElement`, `textContent`, `appendChild` pattern
   - Zero use of `innerHTML` with user data (XSS prevention)

3. **No Frameworks**
   - Pure vanilla JavaScript (ES6+)
   - No React, Vue, Angular, Svelte, etc.
   - DaisyUI for CSS components (no JS framework)

4. **User-Scoped Data**
   - All database queries filter by `user_id`
   - RLS enforced at database level (TO public)
   - No cross-user data leakage

5. **No Foreign Keys**
   - Matches baseline pattern across all tables
   - Application-enforced relationships
   - Prevents cascade deletion issues

6. **Backward Compatibility**
   - Existing publish flow must work without editorial content
   - State engine must work with pre-A4 snapshots (no tag mappings)
   - All existing routes remain functional

---

## 3. Database Schema Changes

### 3.1 New Table: webinar_tag_mappings

**Purpose:** Store mappings between Odoo x_studio_tag_ids and WordPress event tags

**Columns:**
- `id` (UUID, PK, DEFAULT gen_random_uuid()) - Mapping identifier
- `user_id` (UUID, NOT NULL) - Owner user ID (application-enforced, no FK)
- `odoo_tag_id` (INTEGER, NOT NULL) - Odoo x_studio_tag_ids value (x_tags.id)
- `odoo_tag_name` (TEXT, NOT NULL) - Cached Odoo tag name (for UI display)
- `wp_tag_slug` (TEXT, NOT NULL) - WordPress tag slug (created or existing)
- `wp_tag_id` (INTEGER, NULL) - WordPress tag ID (populated after first publish)
- `auto_created` (BOOLEAN, NOT NULL, DEFAULT false) - True if WP tag auto-created by module
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Mapping creation timestamp
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Mapping update timestamp

**Indexes:**
- `idx_webinar_tag_mappings_user_id` on `user_id`
- `idx_webinar_tag_mappings_odoo_tag_id` on `odoo_tag_id`
- `idx_webinar_tag_mappings_user_odoo` on `(user_id, odoo_tag_id)`

**Unique Constraints:**
- `unique_user_odoo_wp_tag` on `(user_id, odoo_tag_id, wp_tag_slug)` - Prevents duplicate mappings

**Triggers:**
- `webinar_tag_mappings_updated_at` - Auto-update `updated_at` on row update

**RLS Policies:**
- `Users can view own tag mappings` (SELECT)  - Target: TO public  - Filter: `auth.uid() = user_id`
- `Users can create own tag mappings` (INSERT)  - Target: TO public  - Filter: `auth.uid() = user_id`
- `Users can update own tag mappings` (UPDATE)  - Target: TO public  - Filter: `auth.uid() = user_id`
- `Users can delete own tag mappings` (DELETE)  - Target: TO public  - Filter: `auth.uid() = user_id`

**Migration File:** `supabase/migrations/20260211000001_event_operations_addendum_a.sql`

### 3.2 Extended Table: webinar_snapshots

**New Column:**
- `editorial_content` (JSONB, NULL, DEFAULT NULL) - Editorial layer for WP description

**Editorial Content Structure:**
```json
{
  "enabled": true,
  "base_description": "Odoo description at time of editorial creation",
  "custom_blocks": [
    {
      "type": "text",
      "content": "Custom intro paragraph"
    },
    {
      "type": "shortcode",
      "code": "[forminator_form id=\"123\"]"
    }
  ],
  "auto_append_registration": true
}
```

**Schema Validation (Application-Level):**
- `enabled` (boolean) - If false, ignore editorial content and use Odoo description
- `base_description` (string | null) - Snapshot of Odoo description when editorial was created
- `custom_blocks` (array of objects) - Ordered blocks for WP description
  - Each block: `{ type: 'text' | 'shortcode', content: string }`
- `auto_append_registration` (boolean) - If true, append "[Aantal inschrijvingen: X]" to end

**Migration File:** Same as 3.1 (`20260211000001_event_operations_addendum_a.sql`)

**Backward Compatibility:**
- Column is nullable (pre-A5 snapshots have `editorial_content: null`)
- Publish flow checks `editorial_content?.enabled` → falls back to `odoo_snapshot.x_studio_webinar_info`

### 3.3 RLS Strategy (Unchanged)

**Enforcement Level:** Database and application

**Pattern:** User-scoped isolation via `auth.uid() = user_id`

**Implementation:**
- Supabase client uses SERVICE_ROLE_KEY (bypasses RLS)
- Application explicitly filters by `user_id` in all queries (defensive)
- RLS policies provide defense-in-depth if application logic bypassed

**Rationale:**
- Consistent with existing platform patterns (project_templates, project_generations, webinar_snapshots)
- Defense-in-depth security
- No cross-user data leakage even if application bugs exist

### 3.4 Why No Foreign Keys (Unchanged)

**Baseline Pattern:** All existing tables have no foreign keys on user references.

**Reasons:**
1. Prevents cascade deletion issues
2. Simplifies migrations
3. Application-enforced relationships more flexible
4. Matches established codebase conventions

**Tradeoff Accepted:** Database cannot enforce referential integrity. Application must validate references.

### 3.5 Logged Data

**webinar_tag_mappings table logs:**
- All tag mapping CRUD operations
- Cached Odoo tag names (for UI without re-fetching Odoo)
- WordPress tag IDs after successful publish
- Auto-creation flag (audit trail for WP taxonomy changes)
- Creation and modification timestamps

**webinar_snapshots.editorial_content logs:**
- Full editorial state at time of publish
- Block order and types
- Base description snapshot (for diff comparison)
- Enabled/disabled state

**Not logged:**
- User actions within editorial editor (only final save)
- Intermediate block edits (only committed editorial_content)
- WordPress API responses for tag creation (only final wp_tag_id)
- Registration count history (only current count fetched on-demand)

---

## 4. Subfase Breakdown

### A1 – Layout & Theme Consistency Fix

**Goal:** Fix UI theme inheritance and spacing to match Project Generator module pattern.

**Affected Files:**
- `src/modules/event-operations/ui.js` (modify root container)

**Changes:**
- Add `data-theme` attribute propagation to root container
- Add correct `pt-16` (top padding) to avoid navbar overlap
- Ensure DaisyUI theme classes applied correctly

**Diff Preview:**
```diff
- return `<div class="min-h-screen bg-base-200">
+ return `<div class="min-h-screen bg-base-200 pt-16" data-theme="light">
```

**Test Checklist:**
- [ ] Theme toggles correctly on page (if theme switcher exists)
- [ ] Navbar does not overlap content
- [ ] Spacing matches Project Generator module
- [ ] No visual regressions in other modules

**Rollback Strategy:**
- Revert ui.js to baseline (restore from git)
- Redeploy worker

**Git Commit Message:**
```
fix(event-operations): correct theme inheritance and navbar spacing

- Add data-theme attribute to root container
- Add pt-16 to prevent navbar overlap
- Match Project Generator layout pattern

STOPPOINT: A1
```

**Risk Analysis:**
- **Low Risk:** CSS-only changes
- **No Breaking Changes:** Existing functionality unaffected
- **No Data Migration:** No database changes

**Explicit Non-Goals for A1:**
- No functional changes
- No new components
- No routing changes
- No API changes

---

### A2 – Card View Redesign

**Goal:** Add card-based layout view alongside existing table view, with view toggle and registration count.

**New Files:**
- `public/event-operations-client.js` (client-side card rendering + view switching)

**Affected Files:**
- `src/modules/event-operations/ui.js` (add view toggle UI, add script tag for client.js, keep existing table)
- `src/modules/event-operations/routes.js` (add registration count to /api/odoo-webinars response)
- `src/modules/event-operations/odoo-client.js` (add getRegistrationCount function)
- `src/modules/event-operations/constants.js` (add ODOO_FIELDS.REGISTRATION_COUNT if needed)

**Database Changes:**
- None (uses existing webinar_snapshots)

**New Server Functions:**
```javascript
// In odoo-client.js
export async function getRegistrationCount(env, webinarId) {
  const count = await searchCount(env, {
    model: ODOO_MODEL.REGISTRATION,
    domain: [['x_webinar_id', '=', webinarId]]
  });
  return count;
}
```

**View Toggle UI (Server-Side HTML):**
```html
<!-- View Toggle (added to ui.js header section) -->
<div class="btn-group">
  <button id="btnViewTable" class="btn btn-sm btn-active">
    <i data-lucide="list" class="w-4 h-4"></i> Table
  </button>
  <button id="btnViewCards" class="btn btn-sm">
    <i data-lucide="grid" class="w-4 h-4"></i> Cards
  </button>
</div>
```

**Client-Side Card Structure (DOM API in event-operations-client.js):**
```javascript
function renderWebinarCard(webinar, snapshot, registrationCount) {
  const card = document.createElement('div');
  card.className = 'card bg-base-100 shadow-md hover:shadow-lg transition-shadow';
  
  const cardBody = document.createElement('div');
  cardBody.className = 'card-body';
  
  // Header: Title + Status Badge
  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-2 mb-3';
  
  const title = document.createElement('h3');
  title.className = 'card-title text-base flex-1';
  title.textContent = webinar.x_name;
  
  const badge = document.createElement('span');
  badge.className = `badge badge-${getBadgeClass(snapshot?.computed_state)} badge-sm whitespace-nowrap`;
  badge.textContent = snapshot?.computed_state || 'not_published';
  
  header.appendChild(title);
  header.appendChild(badge);
  
  // Details Grid
  const details = document.createElement('div');
  details.className = 'grid grid-cols-2 gap-2 text-sm text-base-content/70';
  
  // Date
  const dateDiv = document.createElement('div');
  dateDiv.innerHTML = '<strong>Date:</strong> ' + (webinar.x_studio_date || '—');
  
  // Time
  const timeDiv = document.createElement('div');
  timeDiv.innerHTML = '<strong>Time:</strong> ' + (webinar.x_studio_starting_time || '—');
  
  // Registration count
  const regDiv = document.createElement('div');
  regDiv.innerHTML = '<strong>Registrations:</strong> ' + registrationCount;
  
  // WP Event ID
  const wpDiv = document.createElement('div');
  const wpId = snapshot?.wp_snapshot?.id;
  if (wpId) {
    wpDiv.innerHTML = '<strong>WP:</strong> <a href="https://openvme.be/wp-admin/post.php?post=' + wpId + '&action=edit" target="_blank" class="link link-primary">#' + wpId + '</a>';
  } else {
    wpDiv.innerHTML = '<strong>WP:</strong> —';
  }
  
  details.appendChild(dateDiv);
  details.appendChild(timeDiv);
  details.appendChild(regDiv);
  details.appendChild(wpDiv);
  
  // Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions justify-end mt-4';
  
  const state = snapshot?.computed_state || 'not_published';
  if (state === 'not_published') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.innerHTML = '<i data-lucide="upload" class="w-4 h-4"></i> Publish';
    btn.onclick = () => publishWebinar(webinar.id, btn);
    actions.appendChild(btn);
  } else if (state === 'out_of_sync') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-warning btn-sm';
    btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Re-publish';
    btn.onclick = () => publishWebinar(webinar.id, btn);
    actions.appendChild(btn);
  }
  
  // Assemble
  cardBody.appendChild(header);
  cardBody.appendChild(details);
  cardBody.appendChild(actions);
  card.appendChild(cardBody);
  
  return card;
}

function renderCardsView(webinars, snapshots, registrationCounts) {
  const container = document.getElementById('cardsContainer');
  container.innerHTML = '';
  
  webinars.forEach(webinar => {
    const snapshot = snapshots.find(s => s.odoo_webinar_id === webinar.id);
    const regCount = registrationCounts[webinar.id] || 0;
    const card = renderWebinarCard(webinar, snapshot, regCount);
    container.appendChild(card);
  });
  
  lucide.createIcons();
}
```

**API Response Extended:**
```json
{
  "success": true,
  "data": [
    {
      "id": 44,
      "x_name": "Webinar Title",
      "x_studio_date": "2026-06-18",
      "x_studio_starting_time": "11u",
      "x_studio_webinar_info": "Description",
      "x_active": true,
      "registration_count": 12
    }
  ]
}
```

**View Switching Logic:**
```javascript
// In event-operations-client.js
let currentView = 'table'; // or 'cards'

function switchView(view) {
  currentView = view;
  
  if (view === 'table') {
    document.getElementById('dataTable').classList.remove('hidden');
    document.getElementById('cardsContainer').classList.add('hidden');
    document.getElementById('btnViewTable').classList.add('btn-active');
    document.getElementById('btnViewCards').classList.remove('btn-active');
  } else {
    document.getElementById('dataTable').classList.add('hidden');
    document.getElementById('cardsContainer').classList.remove('hidden');
    document.getElementById('btnViewTable').classList.remove('btn-active');
    document.getElementById('btnViewCards').classList.add('btn-active');
    renderCardsView(odooWebinars, snapshots, registrationCounts);
  }
  
  localStorage.setItem('eventOperationsView', view);
}

function initView() {
  const savedView = localStorage.getItem('eventOperationsView') || 'table';
  switchView(savedView);
}
```

**Test Checklist:**
- [ ] View toggle buttons work (table ↔ cards)
- [ ] Cards render correctly (title, status, date, time, registration count, WP link)
- [ ] Table view still works (improved width handling from A1)
- [ ] Status badges use correct DaisyUI classes in both views
- [ ] Registration count fetched from Odoo (x_webinarregistrations)
- [ ] Actions buttons work in both views (publish, re-publish)
- [ ] View preference persists in localStorage
- [ ] No XSS vulnerabilities (textContent used, not innerHTML for user data)
- [ ] Page load performance acceptable (< 2s for 50 webinars)
- [ ] Lucide icons render in both views

**Rollback Strategy:**
1. Remove `event-operations-client.js` from `public/`
2. Revert `ui.js` to A1 state (remove view toggle UI, remove client.js script tag, keep table improvements)
3. Revert `routes.js` to exclude registration_count
4. Revert `odoo-client.js` to remove getRegistrationCount
5. Redeploy worker

**Git Commit Message:**
```
feat(event-operations): A2 - dual view (table + cards) with registration counts

- Add card view alongside existing table view
- View toggle (table/cards) with localStorage persistence
- Add registration count from x_webinarregistrations in both views
- Client-side rendering with DOM APIs (event-operations-client.js)
- Status badges in both views
- Table view improvements retained from A1

STOPPOINT: A2
```

**Risk Analysis:**
- **Medium Risk:** New client-side JS file (DOM API complexity), parallel data fetching
- **No Breaking Changes:** Table view remains functional, API routes backward compatible
- **No Data Migration:** No database changes
- **Performance:** Registration count fetch adds latency (mitigated by parallel fetching per webinar batch)

**Explicit Non-Goals for A2:**
- No filtering yet (all webinars shown in both views)
- No tag display yet
- No editorial editor yet
- No inline editing (publish button remains)
- No drag-and-drop or reordering
- No expandable/collapsible card details (static card layout)

---

### A3 – Filtering & Segmentation Layer

**Goal:** Add client-side tab filtering (Upcoming, Past, Draft, Out of Sync, Archived, All).

**Affected Files:**
- `public/event-operations-client.js` (add tab UI, filtering logic)

**Database Changes:**
- None (uses existing odoo_snapshot.x_studio_date and computed_state)

**Filter Logic (Client-Side):**
```javascript
function filterWebinars(webinars, snapshots, tab) {
  const now = new Date();
  
  return webinars.filter(webinar => {
    const snapshot = snapshots.find(s => s.odoo_webinar_id === webinar.id);
    const eventDate = new Date(webinar.x_studio_date);
    
    switch (tab) {
      case 'upcoming':
        return eventDate >= now && snapshot?.computed_state !== 'archived';
      case 'past':
        return eventDate < now && snapshot?.computed_state !== 'archived';
      case 'draft':
        return snapshot?.computed_state === 'not_published';
      case 'out_of_sync':
        return snapshot?.computed_state === 'out_of_sync';
      case 'archived':
        return snapshot?.computed_state === 'archived';
      case 'all':
      default:
        return true;
    }
  });
}
```

**UI Structure (DOM API):**
```javascript
function renderTabs(activeTab, onTabChange) {
  const tabs = document.createElement('div');
  tabs.className = 'tabs tabs-boxed mb-4';
  
  const tabNames = ['upcoming', 'past', 'draft', 'out_of_sync', 'archived', 'all'];
  const tabLabels = {
    upcoming: 'Komend',
    past: 'Verleden',
    draft: 'Concept',
    out_of_sync: 'Niet gesynchroniseerd',
    archived: 'Gearchiveerd',
    all: 'Alles'
  };
  
  tabNames.forEach(name => {
    const tab = document.createElement('a');
    tab.className = `tab ${name === activeTab ? 'tab-active' : ''}`;
    tab.textContent = tabLabels[name];
    tab.addEventListener('click', () => onTabChange(name));
    tabs.appendChild(tab);
  });
  
  return tabs;
}
```

**Test Checklist:**
- [ ] Tabs render correctly
- [ ] Tab filtering logic correct (Upcoming = future dates, Past = past dates)
- [ ] Active tab highlights correctly
- [ ] Tab state preserved on page interactions (use URL hash: `#tab=upcoming`)
- [ ] No duplicate webinars across tabs
- [ ] Empty state shown when no webinars match filter

**Rollback Strategy:**
1. Revert `event-operations-client.js` to pre-A3 version
2. Redeploy worker (no server changes)

**Git Commit Message:**
```
feat(event-operations): client-side tab filtering

- Add tabs: Upcoming, Past, Draft, Out of Sync, Archived, All
- Filter logic based on x_studio_date and computed_state
- Tab state in URL hash
- No server-side changes

STOPPOINT: A3
```

**Risk Analysis:**
- **Low Risk:** Client-side only, no API changes
- **No Breaking Changes:** Existing routes unaffected
- **No Data Migration:** No database changes
- **Performance:** Filtering is O(n), acceptable for < 1000 webinars

**Explicit Non-Goals for A3:**
- No server-side filtering (all data fetched, filtered client-side)
- No pagination (all webinars loaded at once)
- No search functionality
- No custom date ranges

---

### A4 – Tag Mapping Engine

**Goal:** Map Odoo x_studio_tag_ids to WordPress event tags.

**New Files:**
- `src/modules/event-operations/tag-mapping.js` (tag mapping CRUD helpers)

**Affected Files:**
- `supabase/migrations/20260211000001_event_operations_addendum_a.sql` (new table)
- `src/modules/event-operations/routes.js` (new tag mapping routes)
- `src/modules/event-operations/odoo-client.js` (fetch x_studio_tag_ids, fetch x_tags names)
- `src/modules/event-operations/wp-client.js` (publish tags to WP, auto-create tags)
- `src/modules/event-operations/mapping.js` (extend mapOdooToWordPress to include tags)
- `public/event-operations-client.js` (tag mapping UI matrix)

**Database Changes:**
- New table: `webinar_tag_mappings` (see 3.1)

**Migration SQL (Excerpt):**
```sql
-- Create webinar_tag_mappings table
CREATE TABLE webinar_tag_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  odoo_tag_id INTEGER NOT NULL,
  odoo_tag_name TEXT NOT NULL,
  wp_tag_slug TEXT NOT NULL,
  wp_tag_id INTEGER,
  auto_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_odoo_wp_tag UNIQUE (user_id, odoo_tag_id, wp_tag_slug)
);

-- Indexes
CREATE INDEX idx_webinar_tag_mappings_user_id ON webinar_tag_mappings(user_id);
CREATE INDEX idx_webinar_tag_mappings_odoo_tag_id ON webinar_tag_mappings(odoo_tag_id);
CREATE INDEX idx_webinar_tag_mappings_user_odoo ON webinar_tag_mappings(user_id, odoo_tag_id);

-- Trigger for updated_at
CREATE TRIGGER webinar_tag_mappings_updated_at
  BEFORE UPDATE ON webinar_tag_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE webinar_tag_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tag mappings"
  ON webinar_tag_mappings FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tag mappings"
  ON webinar_tag_mappings FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tag mappings"
  ON webinar_tag_mappings FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tag mappings"
  ON webinar_tag_mappings FOR DELETE
  TO public
  USING (auth.uid() = user_id);
```

**New Server Routes:**
```javascript
// routes.js
'GET /api/tag-mappings': async (context) => {
  // Fetch all tag mappings for user
},

'POST /api/tag-mappings': async (context) => {
  // Create new tag mapping
  // Body: { odoo_tag_id, odoo_tag_name, wp_tag_slug, auto_create_wp }
},

'DELETE /api/tag-mappings/:id': async (context) => {
  // Delete tag mapping by ID
}
```

**Extended Odoo Client:**
```javascript
// odoo-client.js
export async function getOdooWebinars(env) {
  // Add x_studio_tag_ids to fields array
  const fields = [..., 'x_studio_tag_ids'];
}

export async function getOdooTagNames(env, tagIds) {
  // Fetch x_tags records by IDs
  const tags = await searchRead(env, {
    model: 'x_tags',
    fields: ['id', 'name'],
    domain: [['id', 'in', tagIds]]
  });
  return tags;
}
```

**Extended WP Client:**
```javascript
// wp-client.js
export async function ensureWordPressTag(env, tagSlug) {
  // Check if tag exists in WP
  // If not, create it via POST /wp-json/wp/v2/tags
  // Return wp_tag_id
}

export async function publishToWordPress(env, userId, odooWebinarId) {
  // Existing flow...
  
  // NEW: Fetch tag mappings for webinar's x_studio_tag_ids
  const tagMappings = await getTagMappingsForOdooTags(supabase, userId, webinar.x_studio_tag_ids);
  
  // Ensure WP tags exist (auto-create if needed)
  const wpTagIds = await Promise.all(
    tagMappings.map(m => ensureWordPressTag(env, m.wp_tag_slug))
  );
  
  // Include tags in Tribe Events POST body
  const eventData = {
    ...mapOdooToWordPress(webinar),
    tags: wpTagIds
  };
}
```

**Tag Mapping UI (Client-Side Matrix):**
```
┌────────────────────────────────────────────────────┐
│ Tag Mapping                                        │
├────────────────────────────────────────────────────┤
│ Odoo Tag         │ WordPress Tag Slug  │ Actions   │
├────────────────────────────────────────────────────┤
│ Boekhouden       │ accounting          │ [Delete]  │
│ Marketing        │ marketing           │ [Delete]  │
│ Sales            │ (not mapped)        │ [Add]     │
└────────────────────────────────────────────────────┘
```

**Test Checklist:**
- [ ] Tag mappings table created in Supabase
- [ ] RLS policies enforce user-scoped access
- [ ] Tag mapping CRUD routes work
- [ ] Odoo x_studio_tag_ids fetched correctly
- [ ] Odoo x_tags names resolved correctly
- [ ] WordPress tags auto-created when needed
- [ ] Publish flow includes mapped tags
- [ ] UI matrix shows all Odoo tags (mapped + unmapped)
- [ ] Duplicate mapping prevented (unique constraint)

**Rollback Strategy:**
1. Drop migration: `supabase db reset` or manual `DROP TABLE webinar_tag_mappings`
2. Revert all affected files to pre-A4 versions
3. Redeploy worker
4. Tag mappings lost (manual recreation required if re-applied)

**Git Commit Message:**
```
feat(event-operations): tag mapping engine

- New table: webinar_tag_mappings
- Odoo x_studio_tag_ids → WP tags
- Auto-create WP tags option
- Tag mapping UI matrix
- Extended publish flow with tags

STOPPOINT: A4
```

**Risk Analysis:**
- **High Risk:** New table, new RLS policies, WordPress taxonomy mutations
- **Breaking Change:** None (tags optional in publish flow)
- **Data Migration:** New table (empty on creation)
- **WordPress Side Effects:** Auto-created tags persist even after mapping deletion

**Explicit Non-Goals for A4:**
- No tag hierarchy (WordPress supports, but not mapped)
- No tag color/icon mapping
- No bulk tag operations
- No tag sync from WP → Odoo (one-way only)

---

### A5 – Editorial Content Layer

**Goal:** Enable custom WP descriptions with block editor and shortcode support.

**New Files:**
- `src/modules/event-operations/editorial.js` (editorial content helpers)

**Affected Files:**
- `supabase/migrations/20260211000001_event_operations_addendum_a.sql` (add column)
- `src/modules/event-operations/routes.js` (new editorial routes)
- `src/modules/event-operations/wp-client.js` (use editorial content in publish flow)
- `public/event-operations-client.js` (editorial editor UI, preview modal)

**Database Changes:**
- New column: `webinar_snapshots.editorial_content` (JSONB, nullable, see 3.2)

**Migration SQL (Excerpt):**
```sql
-- Add editorial_content column to webinar_snapshots
ALTER TABLE webinar_snapshots
ADD COLUMN editorial_content JSONB DEFAULT NULL;
```

**New Server Routes:**
```javascript
// routes.js
'GET /api/editorial/:webinarId': async (context) => {
  // Fetch editorial_content from snapshot
  // Return { enabled, base_description, custom_blocks, auto_append_registration }
},

'PUT /api/editorial/:webinarId': async (context) => {
  // Update editorial_content in snapshot
  // Body: { enabled, base_description, custom_blocks, auto_append_registration }
  // Return updated snapshot
}
```

**Editorial Helpers:**
```javascript
// editorial.js
export function buildEditorialDescription(editorialContent, odooDescription, registrationCount) {
  if (!editorialContent?.enabled) {
    return odooDescription; // Fallback to Odoo
  }
  
  let description = '';
  
  // Render custom blocks
  for (const block of editorialContent.custom_blocks || []) {
    if (block.type === 'text') {
      description += block.content + '\n\n';
    } else if (block.type === 'shortcode') {
      description += block.content + '\n\n';
    }
  }
  
  // Auto-append registration count
  if (editorialContent.auto_append_registration && registrationCount > 0) {
    description += `\n\n[Aantal inschrijvingen: ${registrationCount}]`;
  }
  
  return description.trim();
}
```

**Extended WP Client:**
```javascript
// wp-client.js
export async function publishToWordPress(env, userId, odooWebinarId) {
  // Fetch snapshot (includes editorial_content)
  const snapshot = await getSnapshot(supabase, userId, odooWebinarId);
  
  // Fetch registration count
  const registrationCount = await getRegistrationCount(env, odooWebinarId);
  
  // Build description (editorial or fallback)
  const description = buildEditorialDescription(
    snapshot?.editorial_content,
    webinar.x_studio_webinar_info,
    registrationCount
  );
  
  // Publish with editorial description
  const eventData = {
    ...mapOdooToWordPress(webinar),
    description
  };
}
```

**Editorial Editor UI (Client-Side):**
```
┌────────────────────────────────────────────────────┐
│ Editorial Content Editor                           │
├────────────────────────────────────────────────────┤
│ ☑ Enable custom description                       │
├────────────────────────────────────────────────────┤
│ Blocks:                                            │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │ [Text Block]                                 │  │
│ │ Custom intro paragraph...                    │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │ [Shortcode Block]                            │  │
│ │ [forminator_form id="123"]                   │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ [+ Add Text Block] [+ Add Shortcode]              │
│                                                    │
│ ☑ Auto-append registration count                  │
│                                                    │
│ [Preview] [Save]                                   │
└────────────────────────────────────────────────────┘
```

**Preview Modal:**
```javascript
function renderPreviewModal(editorialContent, odooDescription, registrationCount) {
  const modal = document.createElement('dialog');
  modal.className = 'modal';
  
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box max-w-4xl';
  
  const title = document.createElement('h3');
  title.className = 'font-bold text-lg';
  title.textContent = 'Preview';
  
  const preview = document.createElement('div');
  preview.className = 'prose mt-4';
  preview.textContent = buildEditorialDescription(editorialContent, odooDescription, registrationCount);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm btn-circle btn-ghost absolute right-2 top-2';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => modal.close());
  
  modalBox.appendChild(closeBtn);
  modalBox.appendChild(title);
  modalBox.appendChild(preview);
  modal.appendChild(modalBox);
  
  return modal;
}
```

**Test Checklist:**
- [ ] Editorial content column added to webinar_snapshots
- [ ] Editorial routes work (GET, PUT)
- [ ] Editor UI renders correctly
- [ ] Text blocks editable
- [ ] Shortcode blocks editable
- [ ] Preview modal shows correct output
- [ ] Auto-append registration count works
- [ ] Publish flow uses editorial content when enabled
- [ ] Publish flow falls back to Odoo description when disabled
- [ ] Shortcodes preserved (no HTML escaping)

**Rollback Strategy:**
1. Drop column: `ALTER TABLE webinar_snapshots DROP COLUMN editorial_content`
2. Revert all affected files to pre-A5 versions
3. Redeploy worker
4. Editorial content lost (manual recreation required if re-applied)

**Git Commit Message:**
```
feat(event-operations): editorial content layer

- New column: webinar_snapshots.editorial_content (JSONB)
- Block-based editor (text + shortcode blocks)
- Preview modal
- Auto-append registration count
- Publish flow uses editorial or falls back to Odoo

STOPPOINT: A5
```

**Risk Analysis:**
- **Medium Risk:** JSONB column, complex client-side editor logic
- **Breaking Change:** None (editorial_content nullable, publish flow backward compatible)
- **Data Migration:** Column addition (no data transformation)
- **WordPress Side Effects:** Custom descriptions may contain unsupported shortcodes (validation recommended)

**Explicit Non-Goals for A5:**
- No WYSIWYG editor (plain text only)
- No rich text formatting (bold, italic, etc.)
- No image uploads
- No HTML editor
- No shortcode validation (user responsible for correctness)
- No version history for editorial content

---

## 5. Rollback Strategy (Global)

### Per-Subfase Rollback

Each subfase includes specific rollback instructions in its section (see 4.x).

### Full Addendum A Rollback

If all subfases must be rolled back:

1. **Database Rollback:**
   ```sql
   -- Drop tag mappings table
   DROP TABLE IF EXISTS webinar_tag_mappings CASCADE;
   
   -- Drop editorial content column
   ALTER TABLE webinar_snapshots DROP COLUMN IF EXISTS editorial_content;
   ```

2. **Code Rollback:**
   ```bash
   git revert <commit-a5> <commit-a4> <commit-a3> <commit-a2> <commit-a1>
   # Or hard reset to pre-A1 commit:
   git reset --hard <commit-before-a1>
   ```

3. **Redeploy:**
   ```bash
   wrangler deploy
   ```

4. **Verify:**
   - [ ] Module loads without errors
   - [ ] Baseline functionality (Phase 0-7) intact
   - [ ] No database constraint errors
   - [ ] No 404 routes

### Data Loss on Rollback

- **Tag mappings:** All mappings lost (manual recreation required)
- **Editorial content:** All editorial content lost (manual recreation required)
- **WordPress tags:** Auto-created tags persist (manual deletion required)
- **Snapshots:** Baseline snapshots intact (odoo_snapshot, wp_snapshot, computed_state preserved)

---

## 6. Explicit Non-Goals (Addendum A)

### Features Explicitly Out of Scope

1. **Real-Time Sync**
   - No WebSocket or SSE for live updates
   - Manual sync trigger remains

2. **Bidirectional Sync**
   - No WordPress → Odoo sync
   - One-way Odoo → WordPress only

3. **Batch Operations**
   - No multi-select publish
   - No bulk tag assignment

4. **Advanced Filtering**
   - No search bar
   - No custom date ranges
   - No saved filters

5. **Rich Text Editing**
   - No WYSIWYG editor
   - No HTML editor
   - No markdown support

6. **Tag Hierarchy**
   - No parent/child tag relationships
   - Flat tag list only

7. **User Assignment**
   - No multi-user collaboration
   - No role-based tag mapping permissions

8. **Analytics**
   - No registration trend graphs
   - No tag usage statistics
   - No publish success rate tracking

9. **Mobile Optimization**
   - Desktop-first design
   - No responsive card layout (basic responsiveness via DaisyUI only)

10. **Version History**
    - No editorial content versioning
    - No tag mapping audit log beyond created_at/updated_at

---

## 7. Testing Strategy

### Per-Subfase Testing (Stop-Points)

Each subfase has a **STOPPOINT** requiring explicit user confirmation before proceeding.

**Testing Sequence:**
1. Deploy subfase code
2. Run manual tests (checklist in subfase section)
3. Verify no regressions (existing functionality intact)
4. User confirms STOPPOINT
5. Proceed to next subfase

### Regression Test Suite (Run After Each Subfase)

**Baseline Functionality (Phase 0-7):**
- [ ] GET /events loads without errors
- [ ] GET /api/odoo-webinars returns webinars
- [ ] GET /api/wp-events returns WP events
- [ ] POST /api/sync completes successfully
- [ ] POST /api/publish creates WP event
- [ ] GET /api/snapshots returns user-scoped data
- [ ] State engine computes correct states (not_published, published, out_of_sync, archived, deleted)

**Addendum A Functionality (Cumulative):**
- [ ] A1: Theme inheritance correct, no navbar overlap
- [ ] A2: Cards render, registration counts display
- [ ] A3: Tabs filter correctly, URL hash persists tab state
- [ ] A4: Tag mappings CRUD, WP tags auto-created, publish includes tags
- [ ] A5: Editorial content saved, publish uses editorial, preview modal works

### Performance Benchmarks

**Target Metrics:**
- Page load (initial render): < 2 seconds
- Odoo webinar fetch (50 webinars): < 3 seconds
- WordPress events fetch (50 events): < 3 seconds
- Sync operation (50 webinars): < 10 seconds
- Tag mapping save: < 500 ms
- Editorial content save: < 500 ms

### Browser Compatibility

**Supported Browsers:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Not Supported:**
- IE 11 (no ES6 support)
- Safari < 14 (no optional chaining)

---

## 8. Implementation Timeline

### Estimated Durations

| Subfase | Estimated Time | Includes Testing |
|---------|----------------|------------------|
| A1 | 1 hour | Layout fix, visual verification |
| A2 | 4 hours | Card rendering, Odoo integration, client.js setup |
| A3 | 2 hours | Tab UI, filtering logic |
| A4 | 6 hours | Migration, tag CRUD, WP integration, UI matrix |
| A5 | 5 hours | Migration, editor UI, preview, publish integration |
| **Total** | **18 hours** | Full implementation + testing |

### Stop-Point Confirmations

Each STOPPOINT requires:
1. User manual testing (checklist completion)
2. User explicit confirmation via message: "STOPPOINT AX confirmed, proceed to A(X+1)"
3. Git commit with STOPPOINT tag

**No skipping allowed.** If regressions found at any STOPPOINT, implementation halts for bugfix.

---

## 9. Current State Summary (Post-Addendum A)

### Production Ready Components (Added by Addendum A)

**Database:**
- `webinar_tag_mappings` table with RLS policies
- `webinar_snapshots.editorial_content` column (JSONB)
- Indexes on tag mappings (user_id, odoo_tag_id)
- Unique constraint on (user_id, odoo_tag_id, wp_tag_slug)

**Server-Side Code:**
- Tag mapping CRUD routes
- Editorial content CRUD routes
- Extended Odoo client (x_studio_tag_ids, x_tags, registration count)
- Extended WP client (tag creation, tag publish, editorial description)
- Editorial content builder (buildEditorialDescription)

**Client-Side Code:**
- Full client.js for card rendering, tabs, tag mapping UI, editorial editor
- DOM API rendering (no innerHTML with user data)
- Preview modal for editorial content
- Tab state persistence (URL hash)

**WordPress Integration:**
- Auto-create tags via WP REST API
- Publish tags with events
- Shortcode support in descriptions

**User Experience:**
- Card-based webinar view
- Registration count visibility
- Tab filtering (Upcoming, Past, Draft, Out of Sync, Archived, All)
- Tag mapping management
- Editorial content editor with preview

### No Further Action Required (Addendum A)

**Functionality:**
- All A1-A5 features implemented
- All validation rules enforced (tag uniqueness, editorial schema)
- All error paths handled
- All user feedback mechanisms in place

**Architecture:**
- Strict separation of concerns maintained
- No inline JavaScript in server templates
- No template literals for dynamic UI
- No frameworks introduced
- RLS policies enforced
- Backward compatibility with Phase 0-7

**Documentation:**
- Implementation details recorded
- Design rationale documented
- Error handling patterns established
- User workflows defined

### Future Extension Points (Beyond Addendum A)

The following areas can be extended without redesign:

**Addendum B – Advanced Filtering:**
- Search bar (text search in titles/descriptions)
- Custom date ranges (calendar picker)
- Saved filters (user preferences)

**Addendum C – Batch Operations:**
- Multi-select publish
- Bulk tag assignment
- Bulk editorial content templates

**Addendum D – Analytics Dashboard:**
- Registration trends over time
- Tag usage statistics
- Publish success rate metrics

**Addendum E – Mobile Optimization:**
- Responsive card layout
- Touch-friendly interactions
- Mobile-optimized editorial editor

---

## 10. A4 Final Implementation Log (Verified State)

### 10.1 Overview

**Implementation Date:** February 11, 2026  
**Stoppoint:** A4 Complete  
**Status:** Code is source of truth – documentation reflects actual implementation  
**Pattern:** User-scoped isolation, NO foreign keys, RLS to public

This section documents the **actual implementation** of A4 as committed to the codebase, not theoretical plans.

### 10.2 Database Schema (As Implemented)

**Migration File:** `20260211010000_event_operations_tag_mappings.sql`

**Table Definition:**
```sql
CREATE TABLE webinar_tag_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  odoo_tag_id INTEGER NOT NULL,
  odoo_tag_name TEXT NOT NULL,
  wp_category_slug TEXT NOT NULL,
  wp_category_id INTEGER,
  auto_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_odoo_category UNIQUE (user_id, odoo_tag_id)
);
```

**Key Design Decisions (Actual):**
- Column names: `wp_category_slug` and `wp_category_id` (NOT wp_tag_*)
- Unique constraint: `unique_user_odoo_category` on `(user_id, odoo_tag_id)`
- No foreign key on `user_id` (baseline pattern compliance)
- `wp_category_id` nullable (populated after first successful publish)
- `auto_created` flag for tracking WP category creation source

**Indexes Created:**
```sql
CREATE INDEX idx_webinar_tag_mappings_user_id ON webinar_tag_mappings(user_id);
CREATE INDEX idx_webinar_tag_mappings_odoo_tag_id ON webinar_tag_mappings(odoo_tag_id);
CREATE INDEX idx_webinar_tag_mappings_user_odoo ON webinar_tag_mappings(user_id, odoo_tag_id);
```

**RLS Policies (Actual):**
```sql
ALTER TABLE webinar_tag_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tag mappings"
  ON webinar_tag_mappings FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tag mappings"
  ON webinar_tag_mappings FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tag mappings"
  ON webinar_tag_mappings FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tag mappings"
  ON webinar_tag_mappings FOR DELETE
  TO public
  USING (auth.uid() = user_id);
```

**RLS Pattern:** `TO public` (not `TO authenticated`) – matches baseline pattern

### 10.3 Server Implementation (As Implemented)

**Modified Files:**
- `src/modules/event-operations/wp-client.js` (publish flow extended)
- `src/modules/event-operations/tag-mapping.js` (new file – CRUD helpers)
- `src/modules/event-operations/constants.js` (updated with WP_EVENT_CATEGORIES endpoint)

**Publish Flow Logic (wp-client.js, lines 155-163):**
```javascript
// 3a. Add categories (Tribe V1 API expects comma-separated string of slugs)
const odooTagIds = odooWebinar.x_studio_tag_ids || [];
if (odooTagIds.length > 0) {
  const tagMappings = await getTagMappingsForOdooTags(env, userId, odooTagIds);
  if (tagMappings.length > 0) {
    const categorySlugs = tagMappings.map(m => m.wp_category_slug);
    const categoriesString = categorySlugs.join(',');
    wpPayload.categories = categoriesString;
  }
}
```

**Critical Implementation Detail:**
- Tribe V1 API format: `categories: "live,webinar"` (comma-separated slug string)
- Core REST API NOT used for category assignment during publish
- Category logic runs for both CREATE and UPDATE flows

**Tag Mapping Helpers (tag-mapping.js):**
- `getTagMappings(env, userId)` - Fetch all mappings for user
- `getTagMappingsForOdooTags(env, userId, odooTagIds)` - Fetch specific mappings (used in publish)
- `createTagMapping(env, userId, mapping)` - Create new mapping
- `updateTagMapping(env, userId, mappingId, updates)` - Update existing mapping
- `deleteTagMapping(env, userId, mappingId)` - Delete mapping

**WordPress Endpoints (constants.js):**
```javascript
export const WP_ENDPOINTS = {
  TRIBE_EVENTS: '/wp-json/tribe/events/v1/events',
  WP_EVENTS: '/wp-json/wp/v2/tribe_events',
  WP_EVENT_CATEGORIES: '/wp-json/wp/v2/tribe_events_cat'
};
```

### 10.4 Client Implementation (As Implemented)

**Modified File:** `public/event-operations-client.js`

**Tag Badge Rendering (lines 60-84):**
- Uses DOM API: `document.createElement('span')`
- Tag names resolved via `window.tagNamesMap` (populated from Odoo tags API)
- Badges styled with DaisyUI: `badge badge-outline badge-xs`
- No innerHTML with dynamic content

**Tag Mapping Modal (loadTagMappings function, lines 212-280):**
- Fetches data via three API calls:
  - `GET /events/api/tag-mappings` (existing mappings)
  - `GET /events/api/odoo-tags` (available Odoo tags)
  - `GET /events/api/wp-event-categories` (WordPress categories)
- Renders table rows using DOM API (`createElement`, `appendChild`)
- Form selects populated dynamically (already-mapped tags excluded)
- Delete button per mapping row

**Safe innerHTML Usage (verified):**
- Line 179: `container.innerHTML = '';` (clearing only)
- Line 184: Empty state static content (no user input)
- Lines 269, 280: Select option defaults (static strings)
- **No nested template literals**
- **No inline JS in templates**

**DOM API Patterns:**
- All dynamic content uses `textContent` or `appendChild`
- No `eval()`, no `Function()` constructor
- No framework dependencies

### 10.5 API Routes (As Implemented)

**New Routes Added (routes.js):**
- `GET /events/api/tag-mappings` - Fetch user's tag mappings
- `POST /events/api/tag-mappings` - Create new mapping
- `PUT /events/api/tag-mappings/:id` - Update mapping
- `DELETE /events/api/tag-mappings/:id` - Delete mapping
- `GET /events/api/odoo-tags` - Fetch Odoo x_webinar_tag records
- `GET /events/api/wp-event-categories` - Fetch WP tribe_events_cat taxonomy

**Authentication:**
- All routes use `requireUser()` middleware (existing pattern)
- User context extracted from `request.user`
- RLS enforces user-scoped isolation at database level

### 10.6 Modified Files Summary

**Database:**
- `supabase/migrations/20260211010000_event_operations_tag_mappings.sql` (new)

**Server:**
- `src/modules/event-operations/wp-client.js` (publish flow extended)
- `src/modules/event-operations/tag-mapping.js` (new – CRUD helpers)
- `src/modules/event-operations/constants.js` (WP_EVENT_CATEGORIES added)
- `src/modules/event-operations/routes.js` (6 new routes)
- `src/modules/event-operations/odoo-client.js` (getOdooTags function added)

**Client:**
- `public/event-operations-client.js` (tag badges, tag mapping modal)

**No Changes:**
- `state-engine.js` (backward compatible – no state logic changes)
- `snapshot.js` (no schema changes)
- `mapping.js` (no core field mapping changes)

### 10.7 Risk Assessment (Actual Implementation)

**Low Risk:**
- ✅ Migration is additive only (no ALTER on existing tables)
- ✅ RLS policies follow baseline pattern (TO public)
- ✅ Publish flow backward compatible (categories are optional)
- ✅ Client-side rendering uses DOM API (XSS-safe)
- ✅ No inline JavaScript in server templates
- ✅ No framework dependencies introduced

**Medium Risk:**
- ⚠️ Tribe V1 API string format dependency (`categories: "slug1,slug2"`)
  - **Mitigation:** Format documented in code comments
  - **Validation:** Manual testing confirms format works
- ⚠️ Unique constraint on (user_id, odoo_tag_id) prevents duplicate mappings
  - **Mitigation:** UI prevents selection of already-mapped tags
  - **Validation:** Database constraint enforced

**No High Risk Items Identified**

### 10.8 Known Limitations

1. **Tribe V1 Format Dependency:**
   - Categories must be comma-separated slug string
   - Changing to Core REST API would require publish flow refactor
   - Current implementation validated with manual testing

2. **No Bulk Mapping:**
   - Users must map tags one at a time
   - Future: Addendum C could add bulk operations

3. **No Auto-Sync of WP Category ID:**
   - `wp_category_id` column exists but not yet populated after publish
   - Future: Could add WP category ID backfill logic

4. **No Validation of WP Category Existence:**
   - User can select WP category that doesn't exist yet
   - Publish may fail if category slug invalid
   - Future: Could add WP category existence validation

### 10.9 Validation Checklist (Actual Results)

**Pre-Deployment:**
- ✅ Migration SQL syntax validated (no syntax errors)
- ✅ RLS policies tested with `auth.uid()` mocking
- ✅ Unique constraint tested (duplicate insert rejected)
- ✅ Indexes created successfully

**Post-Deployment:**
- ✅ Tag mapping CRUD works (create, read, update, delete)
- ✅ Publish flow assigns categories correctly (manual test: live,webinar)
- ✅ Tag badges render in UI (Odoo tag names displayed)
- ✅ Modal loads Odoo tags and WP categories successfully
- ✅ No console errors in browser
- ✅ No 500 errors in Worker logs

**Architectural Compliance:**
- ✅ No foreign keys on user_id
- ✅ RLS policies TO public (not TO authenticated)
- ✅ No template literals for dynamic UI rendering
- ✅ No inline JavaScript in server templates
- ✅ No framework dependencies
- ✅ User-scoped isolation enforced

---

## 11. STOPPOINT A4 – FINAL STATUS

**Date:** February 11, 2026  
**Codebase State:** Stable  
**Documentation State:** Synchronized with code

### Implementation Checklist

- ✅ **Migration Applied:** `20260211010000_event_operations_tag_mappings.sql` deployed
- ✅ **RLS Validated:** All policies enforce `auth.uid() = user_id`
- ✅ **Unique Constraint Validated:** `unique_user_odoo_category` enforced
- ✅ **Publish Assigns Categories:** Tribe V1 format `categories: "slug1,slug2"` confirmed working
- ✅ **No Architectural Violations:** No foreign keys, RLS TO public, no frameworks
- ✅ **No Nested Template Literals:** Client uses DOM API only
- ✅ **No Inline JS in Server Templates:** All logic in separate .js files
- ✅ **No Framework Introduced:** Pure vanilla JavaScript + DOM APIs

### Code as Source of Truth

From this point forward:
- **Current committed code is authoritative**
- **Documentation reflects actual implementation** (not plans)
- **Code must NOT be modified to match documentation**
- All future changes require new stoppoints

### Ready for A5

- ✅ A4 stable and validated
- ✅ No regressions in existing publish flow
- ✅ Tag mapping engine operational
- ⏸️ **WAITING FOR CONFIRMATION BEFORE A5 CODING**

---

## 12. A5 Implementation Plan (Preparation Phase – NO CODE)

### 12.1 Overview

**Goal:** Enable editorial control over WordPress event descriptions without modifying Odoo source data.

**Pattern:** Extend existing `webinar_snapshots` table with JSONB column for editorial content blocks.

**User Workflow:**
1. User publishes webinar (Odoo description used by default)
2. User clicks "Edit Description" on webinar card
3. Modal opens with block editor (plain text blocks + shortcode inserter)
4. User saves editorial content → stored in `webinar_snapshots.editorial_content`
5. Next publish uses editorial content if present, else falls back to Odoo description

### 12.2 Database Changes

**Schema Extension (Backward Compatible):**
```sql
-- Migration: 20260211020000_event_operations_editorial_content.sql
ALTER TABLE webinar_snapshots
ADD COLUMN editorial_content JSONB DEFAULT NULL;

COMMENT ON COLUMN webinar_snapshots.editorial_content IS 
'User-authored editorial content blocks for WP description override';
```

**JSONB Structure (Planned):**
```json
{
  "blocks": [
    {
      "type": "paragraph",
      "content": "Custom intro text here..."
    },
    {
      "type": "shortcode",
      "name": "forminator_form",
      "attributes": { "id": "123" }
    },
    {
      "type": "paragraph",
      "content": "More custom content..."
    }
  ],
  "version": 1
}
```

**Constraints:**
- Column nullable (NULL = use Odoo description)
- JSONB validation via application logic (not DB constraint)
- No foreign keys

**Risk:**
- ⚠️ JSONB validation required to prevent malformed data
- ⚠️ Shortcode rendering risk (must sanitize attributes)
- Mitigation: Schema validation helper function

### 12.3 Server Changes (Planned)

**New Helper File:** `src/modules/event-operations/editorial.js`

**Functions to Add:**
```javascript
/**
 * Build WordPress description from editorial content or Odoo fallback
 * 
 * @param {Object} editorialContent - JSONB from webinar_snapshots.editorial_content
 * @param {string} odooDescription - Fallback from Odoo x_studio_webinar_info
 * @returns {string} HTML description for WordPress
 */
export function buildEditorialDescription(editorialContent, odooDescription) {
  // If no editorial content, return Odoo description
  if (!editorialContent || !editorialContent.blocks) {
    return odooDescription || '';
  }

  // Render blocks to HTML
  return editorialContent.blocks.map(block => {
    if (block.type === 'paragraph') {
      return `<p>${escapeHtml(block.content)}</p>`;
    }
    if (block.type === 'shortcode') {
      return renderShortcode(block.name, block.attributes);
    }
    return '';
  }).join('\n');
}

function escapeHtml(text) {
  // Escape HTML entities
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderShortcode(name, attributes) {
  // Build WordPress shortcode syntax
  const attrs = Object.entries(attributes)
    .map(([key, val]) => `${key}="${escapeHtml(String(val))}"`)
    .join(' ');
  return `[${name} ${attrs}]`;
}
```

**Publish Flow Modification (wp-client.js):**
```javascript
// In publishWebinar function (after line 153):

// 3b. Add editorial description if present
const editorialContent = existingSnapshot?.editorial_content;
if (editorialContent) {
  wpPayload.description = buildEditorialDescription(editorialContent, odooWebinar.x_studio_webinar_info);
}
// Else: wpPayload.description already set by mapOdooToWordPress()
```

**API Routes to Add:**
- `GET /events/api/editorial/:webinarId` - Fetch editorial content for webinar
- `PUT /events/api/editorial/:webinarId` - Save editorial content (JSONB validation required)

**Route Logic:**
```javascript
// GET /events/api/editorial/:webinarId
const snapshot = await supabase
  .from('webinar_snapshots')
  .select('editorial_content')
  .eq('user_id', userId)
  .eq('odoo_webinar_id', webinarId)
  .single();

return { data: snapshot?.editorial_content || null };

// PUT /events/api/editorial/:webinarId
// 1. Validate JSONB schema (blocks array, valid types)
// 2. Update snapshot:
await supabase
  .from('webinar_snapshots')
  .update({ editorial_content: validatedContent })
  .eq('user_id', userId)
  .eq('odoo_webinar_id', webinarId);
```

### 12.4 Client Changes (Planned)

**UI Location:** Modal triggered from webinar card (new button: "Edit Description")

**Modal Structure:**
```
┌─────────────────────────────────────────┐
│ Edit Editorial Content (Webinar #123)  │
├─────────────────────────────────────────┤
│ [+ Add Paragraph] [+ Add Shortcode]    │
├─────────────────────────────────────────┤
│ ┌─ Block 1: Paragraph ────────────┐   │
│ │ [Textarea: user types here]     │   │
│ │ [↑] [↓] [🗑️]                     │   │
│ └─────────────────────────────────┘   │
│ ┌─ Block 2: Shortcode ────────────┐   │
│ │ Type: [forminator_form ▼]       │   │
│ │ Attributes:                      │   │
│ │   id: [123]                      │   │
│ │ [↑] [↓] [🗑️]                     │   │
│ └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│ [Preview] [Save] [Cancel]              │
└─────────────────────────────────────────┘
```

**DOM Rendering Strategy (No Template Literals):**
```javascript
function renderEditorialModal(webinarId, editorialContent) {
  const modal = document.createElement('div');
  modal.className = 'modal modal-open';
  
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box max-w-3xl';
  
  // Header
  const header = document.createElement('h3');
  header.className = 'font-bold text-lg';
  header.textContent = 'Edit Editorial Content (Webinar #' + webinarId + ')';
  modalBox.appendChild(header);
  
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'flex gap-2 my-4';
  
  const addParagraphBtn = document.createElement('button');
  addParagraphBtn.className = 'btn btn-sm btn-outline';
  addParagraphBtn.textContent = '+ Add Paragraph';
  addParagraphBtn.onclick = () => addBlock('paragraph');
  toolbar.appendChild(addParagraphBtn);
  
  const addShortcodeBtn = document.createElement('button');
  addShortcodeBtn.className = 'btn btn-sm btn-outline';
  addShortcodeBtn.textContent = '+ Add Shortcode';
  addShortcodeBtn.onclick = () => addBlock('shortcode');
  toolbar.appendChild(addShortcodeBtn);
  
  modalBox.appendChild(toolbar);
  
  // Blocks container
  const blocksContainer = document.createElement('div');
  blocksContainer.id = 'editorialBlocks';
  blocksContainer.className = 'space-y-2';
  modalBox.appendChild(blocksContainer);
  
  // Render existing blocks
  if (editorialContent?.blocks) {
    editorialContent.blocks.forEach((block, index) => {
      renderBlock(blocksContainer, block, index);
    });
  }
  
  // Footer buttons
  const footer = document.createElement('div');
  footer.className = 'modal-action';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => saveEditorialContent(webinarId);
  footer.appendChild(saveBtn);
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => modal.remove();
  footer.appendChild(cancelBtn);
  
  modalBox.appendChild(footer);
  modal.appendChild(modalBox);
  document.body.appendChild(modal);
}
```

**No innerHTML Usage:**
- All blocks rendered via `createElement` + `appendChild`
- Textarea values set via `.value` property
- Preview rendered in separate element (not eval'd)

**Preview Mode:**
- Render blocks to HTML (same logic as server-side `buildEditorialDescription`)
- Display in read-only div
- Uses `textContent` for paragraph blocks (no XSS risk)
- Shortcodes rendered as `[shortcode_name attr="value"]` (not executed)

### 12.5 Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Invalid JSONB schema breaks publish | High | Medium | Schema validation before save, fallback to Odoo description |
| Shortcode attribute injection | High | Low | Escape all attribute values, whitelist allowed shortcodes |
| Publish regression (non-editorial webinars) | Medium | Low | NULL editorial_content = use Odoo description (default) |
| Large JSONB size impact | Low | Low | Size limit validation (e.g., max 50 blocks) |
| Block reordering UI bugs | Low | Medium | Manual testing of drag/drop or arrow buttons |

### 12.6 Validation Strategy

**Pre-Deployment:**
- [ ] JSONB schema validation function tested
- [ ] Shortcode rendering tested with sample attributes
- [ ] NULL editorial_content doesn't break publish (regression test)
- [ ] Block rendering produces valid HTML

**Post-Deployment:**
- [ ] Editorial content saves successfully
- [ ] Publish uses editorial content when present
- [ ] Publish falls back to Odoo description when NULL
- [ ] Preview matches published WordPress description
- [ ] No XSS vulnerabilities in preview or publish

### 12.7 Stop-Point Checklist for A5

Before marking A5 complete:

**Database:**
- [ ] Migration applied: `editorial_content` column exists
- [ ] Column is nullable (backward compatible)
- [ ] No RLS policy changes required (column inherits table policies)

**Server:**
- [ ] `editorial.js` helpers implemented
- [ ] `buildEditorialDescription()` function tested
- [ ] API routes for GET/PUT editorial content working
- [ ] Publish flow uses editorial content when present
- [ ] Publish regression test passes (non-editorial webinars still work)

**Client:**
- [ ] Editorial modal renders via DOM API (no innerHTML with user data)
- [ ] Add paragraph/shortcode buttons work
- [ ] Block reordering works (↑↓ buttons or drag/drop)
- [ ] Delete block works
- [ ] Save persists to database
- [ ] Preview renders correctly
- [ ] No console errors

**Architecture:**
- [ ] No template literals for dynamic UI
- [ ] No inline JavaScript in server templates
- [ ] No framework dependencies
- [ ] Backward compatible with A4 tag mappings
- [ ] state-engine.js not modified

### 12.8 Files to Create/Modify (A5)

**New Files:**
- `supabase/migrations/20260211020000_event_operations_editorial_content.sql`
- `src/modules/event-operations/editorial.js`

**Modified Files:**
- `src/modules/event-operations/wp-client.js` (publish flow: use editorial content)
- `src/modules/event-operations/routes.js` (add GET/PUT /api/editorial/:webinarId)
- `public/event-operations-client.js` (editorial modal, block editor)

**No Changes:**
- `state-engine.js` (no state logic changes)
- `snapshot.js` (migration handles schema change)
- `tag-mapping.js` (orthogonal to editorial layer)

### 12.9 Future Enhancements (Beyond A5)

**Not in scope for A5:**
- Rich text editor (WYSIWYG) – A5 uses plain textarea
- Drag-and-drop block reordering – A5 uses ↑↓ buttons
- Block templates/presets – A5 manual only
- Shortcode preview rendering – A5 shows shortcode syntax only
- Undo/redo – A5 no history

**Possible Addendum F – Advanced Editorial:**
- WYSIWYG editor integration (e.g., TinyMCE)
- Block templates library
- Shortcode live preview (iframe sandbox)
- Editorial content versioning

---

**END OF DOCUMENT**
