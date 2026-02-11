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

**END OF DOCUMENT**
