# EVENT OPERATIONS – ADDENDUM D: CALENDAR WORKSPACE & AUTHORING LAYER

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Base Implementation:** Phase 0-7 Complete + Addendum A + Addendum B + Addendum C  
**Implementation Date:** February 13, 2026  
**Status:** Ready for Implementation  
**Platform:** Cloudflare Workers + Supabase PostgreSQL + Odoo x_webinar + Pure Vanilla JavaScript

---

## 1. Addendum Overview

### Purpose

Addendum D introduces two transformative architectural changes to the Event Operations module:

1. **Calendar Workspace Interface** – Replace the 3-column card grid with an industry-standard calendar planner view using FullCalendar, providing visual event scheduling, status coloring, and streamlined event detail access
2. **Description Authoring Layer** – Transform Event Operations into an editorial workspace where HTML descriptions are authored, versioned, and synchronized back to Odoo as the canonical storage layer, with Supabase serving exclusively as version history

This addendum maintains the existing architectural principle: **Odoo remains the single source of truth for all event data**. Event Operations becomes the **editing interface** that writes back to Odoo, not a parallel database.

### Problem Solved

The current implementation has critical UX and editorial workflow limitations:

1. **Inadequate Visual Planning:** Card grid does not provide time-based visual scheduling or calendar context
2. **Poor Information Density:** 3-column layout wastes horizontal space and requires excessive scrolling
3. **No Temporal Context:** Users cannot see event distribution across weeks/months without manual date scanning
4. **No Editorial Workflow:** Event descriptions are read-only from Odoo; no mechanism for structured HTML authoring
5. **No Description Versioning:** Changes to Odoo descriptions are untracked and irreversible
6. **No Form Template Registry:** Form shortcodes are hardcoded in templates; no support for multiple registration forms
7. **No WordPress-Aware Editing:** No awareness of WordPress shortcode compatibility or HTML constraints
8. **Manual Regeneration Risk:** No confirmation flow for regenerating descriptions from templates

The current flow is:

```
Odoo x_studio_description (plain text)
  → Transform via buildTribeEventPayload
  → POST to WordPress
  → Snapshot stored in Supabase
```

**Critical Gap:** Users cannot edit or enhance descriptions without directly modifying Odoo records, which bypasses version control and creates audit trail gaps.

### What It Does

#### Component 1: Calendar Workspace Interface

1. **Replace Card Grid with FullCalendar.js**
   - 2/3 width calendar planner (month/week/day views)
   - 1/3 width dynamic detail panel
   - Bottom-aligned action button bar
   - Status-based event coloring (published, draft, not_published, out_of_sync)
   - Click event → update detail panel (no navigation)
   - No WordPress integration inside calendar (Event Operations only)

2. **Status Visual Hierarchy**
   - `out_of_sync` state overrides WP status color
   - Visual indicators for discrepancy state
   - Color legend in UI header
   - Status badge in detail panel

3. **Detail Panel Responsibilities**
   - Display webinar metadata (name, datetime, type, registration count)
   - Show current status (computed_state from state engine)
   - Show description preview (current Odoo version)
   - Disable "Edit Description" if event archived
   - Disable "Publish" if no event type mapping exists

#### Component 2: Description Authoring Layer

1. **TipTap HTML Editor**
   - Rich text editing with WordPress-compatible HTML output
   - Custom node type for form shortcode blocks
   - No markdown-only mode (HTML is canonical)
   - Preview mode with rendered shortcodes
   - Character count and HTML validation

2. **Form Template Registry**
   - New Supabase table: `form_templates`
   - Support multiple registration forms
   - Dynamic shortcode injection (not hardcoded)
   - Default template selection
   - Admin interface for template management

3. **Default Generation System**
   - Generate description from Odoo metadata + template
   - Include dynamic form shortcode block
   - Require explicit user confirmation before overwriting existing content
   - Store generated defaults as versions

4. **Explicit Save Workflow**
   - **No autosave** (deliberate editorial control)
   - Save button triggers:
     1. Create version entry in Supabase
     2. PUT update to Odoo `x_studio_description`
     3. On success: Mark event `OUT_OF_SYNC`
     4. On failure: Rollback version entry, show error
   - Transactional integrity via compensating actions

5. **Version History System**
   - New Supabase table: `event_description_versions`
   - Store every saved version with metadata
   - Track source type (generated vs manual)
   - Restore flow: Write to Odoo → Create new version → Mark OUT_OF_SYNC
   - Diff view between versions

### What It Does Not Do

The following are explicit non-goals for Addendum D:

- **Does not make Supabase authoritative** – Odoo remains canonical source for descriptions
- **Does not bypass Odoo** – All saves write to Odoo first, Supabase second
- **Does not sync from WordPress to Odoo** – Unidirectional flow unchanged
- **Does not modify state engine discrepancy logic** – Still compares Odoo current vs WP current
- **Does not introduce autosave** – Explicit save required for version control integrity
- **Does not support collaborative editing** – Single-user edit sessions only
- **Does not add WYSIWYG preview of WordPress rendering** – Preview shows HTML structure only
- **Does not validate shortcode execution** – Form shortcodes rendered by WordPress, not validated in editor
- **Does not modify RLS patterns** – User-scoped isolation unchanged
- **Does not change publish flow architecture** – buildTribeEventPayload remains transformation layer
- **Does not support scheduled publishing** – Manual trigger unchanged
- **Does not add real-time calendar sync** – Calendar refreshes on load/sync action only

---

## 2. High-Level Architecture

### System Layers (Post-Addendum D)

```
┌────────────────────────────────────────────────────────────────────┐
│ CLIENT LAYER (Browser)                                              │
│ - event-operations-client.js (REFACTORED)                          │
│   - Calendar workspace layout (8/4 grid split)                     │
│   - FullCalendar.js integration (licensed under MIT)               │
│   - TipTap editor integration (headless editor framework)          │
│   - Form template selector UI                                      │
│   - Description version history viewer                             │
│   - Save workflow orchestration (Supabase → Odoo → State update)   │
│ - DaisyUI components (calendar header, detail panel, action bar)   │
│ - Lucide icons (calendar, edit, save, history)                     │
│ - NO frameworks except FullCalendar + TipTap (controlled deps)     │
└────────────────────────────────────────────────────────────────────┘
                                ↑ FETCH API
┌────────────────────────────────────────────────────────────────────┐
│ SERVER LAYER (Cloudflare Workers)                                  │
│ - routes.js: EXTENDED API routes                                   │
│   - GET /api/form-templates                                        │
│   - POST /api/form-templates (admin only)                          │
│   - GET /api/description-versions/:webinar_id                      │
│   - POST /api/description-versions                                 │
│   - POST /api/restore-version/:version_id                          │
│   - PUT /api/save-description (orchestrates Supabase + Odoo)       │
│ - ui.js: EXTENDED static HTML shell                                │
│   - Include FullCalendar CSS/JS                                    │
│   - Include TipTap CSS/JS                                          │
│   - Calendar workspace layout structure                            │
│ - state-engine.js: NO CHANGES (backward compatible)                │
│   - OUT_OF_SYNC triggered by Odoo != WP comparison                 │
│ - odoo-client.js: EXTENDED                                         │
│   - writeDescription(webinarId, htmlContent) method                │
│   - Validation for HTML field length limits                        │
│ - NEW: description-versioning.js                                   │
│   - createVersion(user_id, webinar_id, content, source_type)       │
│   - listVersions(user_id, webinar_id)                              │
│   - restoreVersion(version_id) → writes to Odoo                    │
│ - NEW: form-templates.js                                           │
│   - listTemplates(user_id)                                         │
│   - getDefaultTemplate(user_id)                                    │
│   - createTemplate(user_id, template_data) [admin only]            │
│ - NEW: description-generator.js                                    │
│   - generateDefault(webinar_metadata, form_template)               │
│   - Returns HTML string (does not auto-save)                       │
└────────────────────────────────────────────────────────────────────┘
                                ↑ SUPABASE CLIENT / ODOO XML-RPC
┌────────────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                          │
│ - Supabase PostgreSQL                                              │
│   - event_description_versions (NEW TABLE)                         │
│     - Version history log (all edits tracked)                      │
│     - RLS policies (user-scoped, TO public)                        │
│   - form_templates (NEW TABLE)                                     │
│     - Form template registry (shared across users)                 │
│     - RLS policies (read-all, write-admin)                         │
│   - webinar_snapshots (UNCHANGED)                                  │
│     - Snapshot log for publish operations                          │
│     - No editorial_content column (deprecated pattern)             │
│ - Odoo Server (external, READ-WRITE)                              │
│   - x_webinar.x_studio_description (WRITE ENABLED)                 │
│   - Canonical storage for event descriptions                       │
│   - Updated via XML-RPC write() method                             │
│ - WordPress (external, write via Tribe + Core API)                │
│   - Tribe Events description field (sync target)                   │
│   - OUT_OF_SYNC when Odoo != WP                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Separation of Concerns (Addendum D Changes)

#### Client Layer Responsibilities (NEW)

**Calendar Workspace:**
- Render FullCalendar with events from webinar_snapshots
- Map computed_state to event colors (borderColor, backgroundColor)
- Handle event click → update detail panel (no page navigation)
- Support month/week/day view switching
- Display status legend in calendar header

**Description Editor:**
- Initialize TipTap editor with WordPress-compatible schema
- Render custom form shortcode node type
- Provide form template selector dropdown
- Handle "Generate Default" button with confirmation modal
- Handle "Save" button with transactional flow
- Display save success/error feedback
- Show loading state during save operation

**Version History:**
- Fetch and display version list for selected webinar
- Show diff view between versions
- Handle "Restore Version" with confirmation modal
- Trigger Odoo write on restore

#### Server Layer Responsibilities (NEW)

**Description Save Orchestration:**
1. Receive save request with `{ user_id, webinar_id, html_content, source_type }`
2. Validate HTML content (length, structure)
3. Create version entry in Supabase `event_description_versions`
4. Call Odoo XML-RPC `write()` to update `x_studio_description`
5. If Odoo write succeeds:
   - Return success response
   - Client triggers sync to mark OUT_OF_SYNC
6. If Odoo write fails:
   - Delete version entry (compensating transaction)
   - Return error response with Odoo error message

**Form Template Management:**
- Return list of active templates sorted by `default_flag DESC, label ASC`
- Validate template structure on create/update
- Enforce admin-only write access

**Version History Queries:**
- Return versions for webinar scoped to `user_id` (RLS enforced)
- Return version content for restore operation
- Log all restore operations as new versions

#### Server Layer Responsibilities (UNCHANGED)

- State engine discrepancy detection (Odoo vs WP)
- Snapshot upsert pattern on publish
- Sync route orchestration
- WordPress publish flow via buildTribeEventPayload

#### Data Layer Responsibilities (NEW)

**Supabase Tables:**
- Store description versions with checksum for integrity
- Store form templates with shortcode metadata
- Enforce user-scoped RLS on versions
- Enforce read-all, write-admin RLS on templates

**Odoo Integration:**
- Accept `write()` calls on `x_studio_description` from Event Operations
- Return success/error status for audit trail
- Maintain canonical description value

---

## 3. Database Schema Changes

### 3.1 New Table: form_templates

**Purpose:** Registry of registration form templates for dynamic shortcode injection

**Columns:**
- `id` (UUID, PK, DEFAULT gen_random_uuid()) - Template identifier
- `label` (TEXT, NOT NULL) - Human-readable template name (e.g., "Webinar Registration Form")
- `wp_shortcode_id` (TEXT, NOT NULL) - Forminator form ID or shortcode identifier (e.g., "12345")
- `active` (BOOLEAN, NOT NULL, DEFAULT true) - Template availability flag
- `default_flag` (BOOLEAN, NOT NULL, DEFAULT false) - Mark as default template
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

**Indexes:**
- `idx_form_templates_active` on `active`
- `idx_form_templates_default` on `default_flag`

**Unique Constraints:**
- `unique_form_template_label` on `label` - Prevent duplicate template names

**Triggers:**
- `form_templates_updated_at` - Auto-update `updated_at` on row update

**RLS Policies:**
- `All users can view active templates` (SELECT)  
  - Target: TO public  
  - Filter: `active = true`
- `Only admins can manage templates` (INSERT, UPDATE, DELETE)  
  - Target: TO public  
  - Filter: `auth.jwt() ->> 'role' = 'admin'` (or application-enforced admin check)

**Migration File:** `supabase/migrations/20260213100000_event_operations_addendum_d_form_templates.sql`

**Rationale:**
- **No user_id column:** Templates are shared across all users (organization-wide)
- **default_flag:** UI can auto-select default template in editor
- **active flag:** Soft-delete deprecated forms without breaking historical references
- **wp_shortcode_id:** Decouples template from hardcoded shortcode strings

### 3.2 New Table: event_description_versions

**Purpose:** Version history log for all event description edits

**Columns:**
- `id` (UUID, PK, DEFAULT gen_random_uuid()) - Version identifier
- `user_id` (UUID, NOT NULL) - Editor user ID (application-enforced, no FK)
- `odoo_webinar_id` (INTEGER, NOT NULL) - Odoo x_webinar.id
- `html_content` (TEXT, NOT NULL) - Full HTML description content
- `source_type` (TEXT, NOT NULL) - Enum: 'generated' | 'manual'
- `checksum` (TEXT, NOT NULL) - SHA-256 hash of html_content (integrity check)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `created_by` (TEXT, NULL) - User email or name (for audit trail)

**Indexes:**
- `idx_event_description_versions_user_id` on `user_id`
- `idx_event_description_versions_webinar_id` on `odoo_webinar_id`
- `idx_event_description_versions_user_webinar` on `(user_id, odoo_webinar_id, created_at DESC)`

**Unique Constraints:**
- None (duplicate content allowed for audit trail)

**Triggers:**
- None (created_at is immutable)

**RLS Policies:**
- `Users can view own versions` (SELECT)  
  - Target: TO public  
  - Filter: `auth.uid() = user_id`
- `Users can create own versions` (INSERT)  
  - Target: TO public  
  - Filter: `auth.uid() = user_id`
- `No updates or deletes` (UPDATE, DELETE)  
  - No policies (versions are immutable)

**Migration File:** Same as 3.1 (`20260213100000_event_operations_addendum_d_form_templates.sql`)

**Rationale:**
- **No UPDATE/DELETE:** Versions are immutable audit trail
- **checksum:** Detect data corruption or tampering
- **source_type:** Distinguish generated defaults from manual edits
- **created_by:** Optional user identity for multi-user environments

### 3.3 New Column in webinar_snapshots: DEPRECATED

**Decision:** Do NOT add `editorial_content` column to `webinar_snapshots`.

**Rationale:**
- Addendum A design pattern (editorial_content JSONB) is deprecated
- Odoo `x_studio_description` is canonical storage
- Supabase serves only as version history log, not active storage
- Snapshot table remains focused on publish operations, not description authoring

**Impact:**
- Addendum A subfase A5 (Editorial Content Layer) is NOT implemented as designed
- This addendum supersedes A5 with a cleaner architecture

---

## 4. Calendar Workspace Architecture

### 4.1 Layout Grid System

**Primary Layout:** 8/4 split (2/3 calendar, 1/3 detail panel)

```html
<div class="event-operations-workspace">
  <!-- Top Header -->
  <div class="workspace-header">
    <h1>Event Calendar</h1>
    <div class="status-legend">
      <!-- Color legend badges -->
    </div>
    <button class="btn btn-primary" id="sync-btn">Sync from Odoo</button>
  </div>

  <!-- Main Grid -->
  <div class="workspace-grid">
    <!-- Calendar (8 columns) -->
    <div class="calendar-container">
      <div id="fullcalendar"></div>
    </div>

    <!-- Detail Panel (4 columns) -->
    <div class="detail-panel">
      <div class="panel-empty-state" id="empty-state">
        <!-- Show when no event selected -->
      </div>
      <div class="panel-content" id="event-details" style="display: none;">
        <!-- Event metadata -->
        <!-- Description preview -->
        <!-- Action buttons -->
      </div>
    </div>
  </div>

  <!-- Bottom Action Bar -->
  <div class="action-bar">
    <!-- Context-sensitive actions -->
  </div>
</div>
```

**Responsive Breakpoints:**
- Desktop (≥1024px): 8/4 split
- Tablet (768-1023px): 6/6 split (stacked)
- Mobile (<768px): Full-width stacked (calendar collapses to agenda view)

### 4.2 FullCalendar Configuration

**Library:** FullCalendar v6 (MIT License)

**Views Enabled:**
- `dayGridMonth` (default): Month view with event dots
- `timeGridWeek`: Week view with time slots
- `timeGridDay`: Single day with hourly slots

**Event Source:**
```javascript
{
  events: function(fetchInfo, successCallback, failureCallback) {
    // Fetch from /api/events
    // Filter by fetchInfo.start and fetchInfo.end
    // Transform webinar_snapshots to FullCalendar event format
  }
}
```

**Event Object Format:**
```javascript
{
  id: 'odoo_webinar_123',
  title: 'Webinar Name',
  start: '2026-06-18T12:30:00Z',  // x_studio_event_datetime
  end: '2026-06-18T14:00:00Z',    // computed from duration
  backgroundColor: '#3b82f6',     // status-based color
  borderColor: '#2563eb',
  extendedProps: {
    computed_state: 'out_of_sync',
    odoo_webinar_id: 123,
    registration_count: 42
  }
}
```

**Event Click Handler:**
```javascript
eventClick: function(info) {
  // Prevent navigation
  info.jsEvent.preventDefault();
  
  // Update detail panel
  updateDetailPanel(info.event.extendedProps);
}
```

**Status Color Mapping:**
| computed_state | backgroundColor | borderColor | Visual Priority |
|----------------|-----------------|-------------|-----------------|
| `out_of_sync` | `#f59e0b` (amber-500) | `#d97706` (amber-600) | 1 (highest) |
| `published` | `#10b981` (emerald-500) | `#059669` (emerald-600) | 2 |
| `draft` | `#6b7280` (gray-500) | `#4b5563` (gray-600) | 3 |
| `not_published` | `#3b82f6` (blue-500) | `#2563eb` (blue-600) | 4 |
| `archived` | `#9ca3af` (gray-400) | `#6b7280` (gray-500) | 5 (lowest) |

**Rationale for OUT_OF_SYNC Priority:**
- Overrides WP status color to draw attention to discrepancies
- Amber color signals "action required" without alarm (not red)
- Consistent with state engine logic (Odoo != WP triggers out_of_sync)

### 4.3 Detail Panel Responsibilities

**Panel Header:**
- Event name (bold, text-lg)
- Status badge (colored, uppercase)
- Event type label (from x_event_type_id)

**Metadata Section:**
- Date & time (formatted in Brussels timezone)
- Duration (computed from x_studio_event_duration_minutes)
- Registration count (x_webinarregistrations count)
- WordPress tag (from event_type_wp_tag_mapping)

**Description Preview:**
- First 200 characters of current Odoo description
- "Read more" link → expands to full description
- Indicate if description is empty ("No description available")

**Action Buttons:**
- "Edit Description" → Opens editor modal
- "Publish to WordPress" → Triggers publish flow
- "View in Odoo" → Opens Odoo record in new tab
- "View on Website" → Opens WP event page (if published)

**Button Disabled States:**
| Button | Disabled When | Reason |
|--------|---------------|--------|
| Edit Description | Event archived | Read-only for historical records |
| Publish to WordPress | No event type mapping | Cannot determine WP tag |
| Publish to WordPress | Event archived | Cannot publish archived events |
| View on Website | WP post ID null | Event not yet published |

### 4.4 Calendar Workspace vs Detail Panel Separation

**Calendar Component Owns:**
- Event rendering (dots, colors, labels)
- View switching (month/week/day)
- Date navigation (prev/next)
- Event click handling

**Detail Panel Owns:**
- Event metadata display
- Description preview
- Action button states
- Edit/publish workflow triggers

**No Overlap:**
- Calendar does NOT show action buttons
- Detail panel does NOT show calendar navigation
- Both components read from same webinar_snapshots data
- Both update on sync operation

---

## 5. Description Authoring Layer Architecture

### 5.1 Editor Technology: TipTap

**Library:** TipTap v2 (MIT License, headless editor framework)

**Why TipTap:**
1. **WordPress HTML Compatibility:** Outputs clean HTML (not markdown)
2. **Custom Node Types:** Supports custom shortcode block node
3. **Headless Architecture:** Fully controllable via DOM APIs (no framework lock-in)
4. **Extensible Schema:** Can define WordPress-specific constraints
5. **Minimal Dependencies:** Core library is framework-agnostic

**Why NOT Alternatives:**
- **ContentEditable alone:** Too low-level, no structured schema
- **Quill.js:** Delta format requires conversion to HTML
- **Draft.js:** React-only (violates no-framework constraint)
- **CKEditor:** Heavy, opinionated toolbar (not headless)

**TipTap Extensions Used:**
- `StarterKit` (basic formatting: bold, italic, headings, lists)
- `Link` (hyperlink support)
- `Image` (image insertion with WordPress media library URLs)
- **Custom Extension:** `FormShortcode` (shortcode block node)

### 5.2 Custom Node Type: FormShortcode

**Purpose:** Render Forminator shortcodes as structured blocks (not raw text)

**Node Specification:**
```javascript
{
  name: 'formShortcode',
  group: 'block',
  content: 'inline*',
  atom: true,
  attrs: {
    formTemplateId: { default: null },
    shortcode: { default: '' }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-forminator-block]',
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'div',
      {
        'data-forminator-block': '',
        'data-template-id': node.attrs.formTemplateId,
        class: 'forminator-block'
      },
      node.attrs.shortcode
    ];
  }
}
```

**Rendering in Editor:**
- Block displayed as gray card with form icon
- Shows form template label (not raw shortcode)
- Click block → opens form template selector modal
- Delete block → removes shortcode

**HTML Output:**
```html
<div data-forminator-block data-template-id="uuid-123" class="forminator-block">
  [forminator_form id="12345"]
</div>
```

**WordPress Rendering:**
- WordPress parses shortcode normally
- `data-*` attributes ignored by shortcode processor
- Block structure maintains semantic separation

### 5.3 Form Template Selector UI

**Location:** Modal overlay (opens from editor toolbar or shortcode block)

**UI Elements:**
- Dropdown list of active templates (from `form_templates` table)
- Default template pre-selected
- Template preview (shows example shortcode output)
- "Insert" button → adds FormShortcode node to editor
- "Cancel" button → closes modal without action

**Data Flow:**
1. User clicks "Insert Form" toolbar button
2. Fetch `GET /api/form-templates` (cached for session)
3. Render dropdown with template labels
4. User selects template
5. Construct shortcode: `[forminator_form id="${wp_shortcode_id}"]`
6. Insert FormShortcode node into editor at cursor position

**Validation:**
- Prevent duplicate form blocks in same description
- Warn if no active templates exist (show admin contact message)

### 5.4 Default Generation Layer

**Trigger:** User clicks "Generate Default Description" button

**Confirmation Flow:**
1. Check if editor has existing content (non-empty)
2. If content exists:
   - Show modal: "Replace existing description? This action cannot be undone."
   - Require explicit "Confirm" or "Cancel"
3. If content empty:
   - Skip confirmation, proceed directly

**Generation Logic:**
```javascript
function generateDefaultDescription(webinarMetadata, formTemplate) {
  const { x_name, x_studio_event_datetime, x_event_type_id } = webinarMetadata;
  const eventTypeName = x_event_type_id[1]; // many2one tuple [id, name]
  const formattedDate = formatDateBrussels(x_studio_event_datetime);

  return `
    <h2>${x_name}</h2>
    <p><strong>Type:</strong> ${eventTypeName}</p>
    <p><strong>Datum:</strong> ${formattedDate}</p>
    <p>Join us for this upcoming event. More details will be shared soon.</p>
    <div data-forminator-block data-template-id="${formTemplate.id}" class="forminator-block">
      [forminator_form id="${formTemplate.wp_shortcode_id}"]
    </div>
  `;
}
```

**Generated Content Characteristics:**
- Structured HTML (not plain text)
- Includes form shortcode block (from default template)
- Metadata placeholders (name, type, date)
- Generic introductory paragraph

**Source Type Tracking:**
- Generated defaults saved as `source_type: 'generated'`
- Manual edits saved as `source_type: 'manual'`
- Version history shows source type badge

**Explicit Non-Behavior:**
- **Does NOT auto-save** (user must click "Save" explicitly)
- **Does NOT overwrite without confirmation** (if existing content present)
- **Does NOT fetch from WordPress** (generation is local)

### 5.5 Explicit Save Flow

**Trigger:** User clicks "Save Description" button

**Pre-Save Validation:**
1. Check HTML content is non-empty
2. Validate HTML structure (well-formed tags)
3. Check content length ≤ Odoo field limit (likely ~65000 chars)
4. Confirm user is authenticated

**Save Transaction Steps:**

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Create Version Entry in Supabase                    │
│ POST /api/description-versions                              │
│ Payload: { user_id, odoo_webinar_id, html_content, ... }   │
│ Returns: { version_id, checksum }                          │
└─────────────────────────────────────────────────────────────┘
                          ↓ SUCCESS
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Write to Odoo x_studio_description                  │
│ PUT /api/save-description                                   │
│ Calls: odooClient.write(webinar_id, { x_studio_description })│
│ Returns: { success: true } or { success: false, error }    │
└─────────────────────────────────────────────────────────────┘
         ↓ SUCCESS                    ↓ FAILURE
┌─────────────────────────┐  ┌────────────────────────────────┐
│ STEP 3A: Mark Success    │  │ STEP 3B: Rollback Version     │
│ - Close editor modal     │  │ DELETE /api/description-ver-  │
│ - Show success toast     │  │   sions/:version_id           │
│ - Refresh detail panel   │  │ - Show error toast with Odoo  │
│ - Trigger OUT_OF_SYNC    │  │   error message               │
│   (via sync operation)   │  │ - Keep editor open            │
└─────────────────────────┘  └────────────────────────────────┘
```

**Transactional Integrity Handling:**

**Case 1: Supabase Insert Fails (Network/DB Error)**
- No version created
- No Odoo write attempted
- User sees error: "Failed to save version. Please try again."
- Editor remains open with unsaved content

**Case 2: Supabase Insert Succeeds, Odoo Write Fails**
- Version entry exists in Supabase
- Odoo description unchanged
- **Compensating Action:** DELETE version entry
- User sees error: "Failed to update Odoo: [error message]"
- Editor remains open with unsaved content

**Case 3: Both Succeed**
- Version entry logged in Supabase
- Odoo description updated
- User sees success: "Description saved successfully"
- Editor closes
- Detail panel refreshes to show new content
- **OUT_OF_SYNC triggered:** State engine detects Odoo != WP

**Case 4: Odoo Write Succeeds, Rollback Delete Fails**
- **Rare edge case:** Odoo updated, but cannot delete orphaned version
- Log error to console/monitoring
- User sees success (Odoo write succeeded, rollback is cleanup)
- Version entry remains but marked as `source_type: 'failed_rollback'` (optional)

**Why No Distributed Transaction:**
- No XA/2PC support across Supabase + Odoo
- Compensating actions are sufficient for this use case
- Failure rate is low (Odoo write is reliable)
- Orphaned version entries are benign (audit trail remains)

**Why No Autosave:**
- Version history integrity requires deliberate save points
- Autosave creates noise in version log (too many micro-edits)
- User controls when descriptions are "done" (editorial workflow)
- Reduces risk of accidental overwrites

### 5.6 Version History System

**UI Location:** Modal overlay (opens from "View History" button in detail panel)

**Display Format:**
- List of versions sorted by `created_at DESC` (newest first)
- Each version shows:
  - Created date/time (formatted in Brussels timezone)
  - Source type badge (Generated | Manual)
  - Created by user (email or name)
  - Character count
  - Checksum (first 8 chars for verification)
- Compare view (diff between selected version and current Odoo version)

**Diff View:**
- Use `diff-match-patch` library (Google, Apache 2.0 license)
- Highlight added text (green)
- Highlight removed text (red)
- Highlight unchanged text (gray)

**Restore Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: User Selects Version                                │
│ Click "Restore This Version" button                         │
│ Show confirmation modal:                                    │
│ "Restore this version? Current Odoo content will be         │
│  replaced with this version."                               │
└─────────────────────────────────────────────────────────────┘
                          ↓ CONFIRM
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Write to Odoo                                       │
│ POST /api/restore-version/:version_id                       │
│ Calls: odooClient.write(webinar_id, { x_studio_description })│
│ Returns: { success: true } or { success: false, error }    │
└─────────────────────────────────────────────────────────────┘
         ↓ SUCCESS                    ↓ FAILURE
┌─────────────────────────┐  ┌────────────────────────────────┐
│ STEP 3A: Create New Ver- │  │ STEP 3B: Show Error           │
│   sion Entry             │  │ - Display Odoo error message  │
│ - Log restored content   │  │ - Keep modal open             │
│   as new version         │  │ - Do not create version entry │
│ - Mark source_type:      │  └────────────────────────────────┘
│   'restored'             │
│ - Trigger OUT_OF_SYNC    │
│ - Close modal            │
│ - Refresh detail panel   │
└─────────────────────────┘
```

**Restore Version Characteristics:**
- Restoring a version creates a NEW version entry (not an update)
- Original version entry remains unchanged (immutable audit trail)
- New version entry has `source_type: 'restored'`
- Checksum recalculated for new entry
- OUT_OF_SYNC triggered after restore (Odoo changed, WP unchanged)

**Why Create New Version on Restore:**
- Maintains complete audit trail (no gaps)
- Records who restored and when
- Allows tracking of "undo" operations
- Prevents confusion about version chronology

### 5.7 UX Definition

#### Layout Grid System (Duplicate from 4.1 for Reference)

**Primary Layout:** 8/4 split responsive grid

**Action Button Hierarchy:**
1. **Primary Action (Fill Color):** "Save Description" (blue, btn-primary)
2. **Secondary Actions (Outline):** "Generate Default", "View History"
3. **Tertiary Actions (Ghost):** "Cancel", "Close"

#### Modal Overlays

**Editor Modal:**
- Full-screen overlay (z-index: 1000)
- Dark backdrop (opacity: 0.5)
- Centered modal (max-width: 5xl, 90% viewport height)
- Header: Event name + Close button
- Body: TipTap editor + toolbar
- Footer: Action buttons (Save, Cancel)

**Version History Modal:**
- Same overlay pattern as editor
- Header: "Version History" + Close button
- Body: Version list (scrollable)
- Footer: Close button only

**Confirmation Modal:**
- Smaller modal (max-width: md)
- Header: Warning icon + Title
- Body: Confirmation message
- Footer: Confirm (danger) + Cancel (ghost)

#### Button States

**Enabled State:**
- Full color saturation
- Cursor: pointer
- Hover: darken color

**Disabled State:**
- Gray color (text-gray-400)
- Cursor: not-allowed
- Opacity: 0.5
- Tooltip: Explain why disabled (e.g., "Event is archived")

**Loading State:**
- Button text replaced with spinner icon
- Disabled during loading
- No color change (maintain primary/secondary hierarchy)

#### Success Feedback

**Toast Notifications:**
- Position: Top-right corner
- Duration: 5 seconds (auto-dismiss)
- Success: Green background, checkmark icon
- Error: Red background, X icon
- Max 3 toasts stacked

**Inline Feedback:**
- "Last saved: 2 minutes ago" (below editor)
- "X versions available" (in detail panel)

#### Error Feedback

**Validation Errors:**
- Red border on input field
- Error message below field (text-red-600)
- Icon: Exclamation triangle

**API Errors:**
- Toast notification (persistent until dismissed)
- Error message includes:
  - What operation failed
  - Odoo/Supabase error code
  - Suggested resolution
- Example: "Failed to save description: Odoo returned error 'Access Denied'. Please check your permissions."

---

## 6. State Engine Extension

### 6.1 Current Discrepancy Detection (Addendum C)

**Existing Logic:**
```javascript
function computeEventState(odoo_snapshot, wp_snapshot) {
  // Compare Odoo current vs WP current
  // Fields: x_name, x_studio_event_datetime, x_event_type_id, x_studio_description
  
  if (odoo_snapshot.x_studio_description !== wp_snapshot.description) {
    return 'out_of_sync';
  }
  // ... other comparisons
}
```

**Trigger Points:**
- Manual sync operation
- Publish operation
- Periodic background sync (if implemented)

### 6.2 OUT_OF_SYNC Integration (Addendum D)

**New Trigger Point:** Description save operation

**Flow:**
```
User saves description in editor
  ↓
Description written to Odoo x_studio_description
  ↓
Client calls POST /api/sync (manual trigger)
  ↓
State engine compares:
    Odoo.x_studio_description (NEW VALUE)
    vs
    WP.description (OLD VALUE)
  ↓
Mismatch detected → computed_state = 'out_of_sync'
  ↓
Calendar event color changes to amber
  ↓
Detail panel shows OUT_OF_SYNC badge
```

**No Changes to State Engine Logic:**
- Discrepancy detection remains: Odoo current vs WP current
- No comparison between Supabase versions and WP
- No comparison between Supabase versions and Odoo
- Supabase versions are audit trail only, not state source

**Why No Automatic Sync Trigger:**
- OUT_OF_SYNC is intentional signal (user must review before publish)
- Automatic publish would bypass user confirmation pattern
- User may need to edit description multiple times before publishing
- Manual publish maintains editorial control

### 6.3 Clarification: Supabase Role in State Management

**Supabase Does NOT Participate in Discrepancy Detection:**
- `event_description_versions` is a log table, not a state source
- State engine compares Odoo vs WordPress only
- No "Supabase vs WP" or "Supabase vs Odoo" comparisons
- Version history is independent of publish state

**Why This Separation:**
- Eliminates ambiguity about which system is authoritative
- Prevents cascading state mismatches
- Simplifies rollback logic (no need to reconcile 3-way state)
- Maintains existing architectural principle: Odoo is canonical

**Edge Case Handling:**

**Case 1: User Edits Description in Odoo Directly**
- Version history in Supabase does NOT reflect this change
- Next sync operation will NOT mark out_of_sync (Odoo == Odoo)
- User must manually create version entry via Event Operations if audit trail desired
- **Accepted Tradeoff:** Version history is incomplete if users bypass Event Operations

**Case 2: User Publishes Without Saving in Editor**
- Odoo description published to WP as-is
- No version entry created
- State engine shows `published` (Odoo == WP)
- **Accepted Tradeoff:** Not all published descriptions are versioned

**Case 3: User Restores Old Version, Then Publishes**
- Restore creates new version entry
- Publish syncs Odoo → WP
- State engine shows `published` (Odoo == WP)
- Version history shows "restored" entry followed by "published" snapshot

**Case 4: WordPress Description Manually Edited**
- Odoo unchanged
- Next sync operation marks `out_of_sync` (Odoo != WP)
- User must decide: Re-publish from Odoo or accept WP changes
- **No Bidirectional Sync:** WP changes never written back to Odoo

---

## 7. Impact Analysis

### 7.1 Impact on Addendum A (UI & Editorial Overhaul)

**Supersedes:**
- **A2 (Card View Redesign):** Replaced by calendar workspace (sections 4.1-4.4)
- **A5 (Editorial Content Layer):** Replaced by TipTap authoring layer (sections 5.1-5.7)

**Maintains:**
- **A1 (Layout & Theme Consistency):** Theme inheritance pattern unchanged
- **A3 (Filtering & Segmentation):** Month/week/day views provide superior segmentation
- **A4 (Tag Mapping Engine):** `webinar_tag_mappings` table deprecated by Addendum C (event_type_wp_tag_mapping)

**Database Schema Changes:**
- `webinar_tag_mappings` table NOT created (Addendum C superseded A4)
- `editorial_content` column NOT added to `webinar_snapshots` (superseded by Addendum D)

**Code Migration:**
- `event-operations-client.js` refactored (card rendering → calendar rendering)
- Tag mapping UI removed (replaced by event type mapping in Addendum C)

**Backward Compatibility:**
- Existing webinar_snapshots remain functional (no schema breaking changes)
- Users without version history can begin creating versions immediately
- No data migration required

### 7.2 Impact on Addendum B (Event Datetime Refactor)

**No Impact (Fully Compatible):**
- Addendum B datetime fields (`x_studio_event_datetime`, `x_studio_event_duration_minutes`) used directly by FullCalendar
- Calendar event start/end times computed from datetime + duration (no changes needed)
- Timezone handling (Brussels) applied in client-side formatting (no changes needed)

**Enhanced Utilization:**
- FullCalendar leverages datetime fields for accurate time-slot rendering in week/day views
- Sorting by datetime (not just date) improves chronological accuracy

### 7.3 Impact on Addendum C (Event Type Mapping)

**No Impact (Fully Compatible):**
- Addendum C event type mapping logic unchanged
- `event_type_wp_tag_mapping` table used in publish flow (no changes needed)
- Detail panel displays WP tag from mapping (enhanced UX, no logic changes)

**Enhanced Utilization:**
- Detail panel can show "No tag mapping configured" warning if mapping missing
- Disable "Publish" button if no mapping exists (prevents publish errors)

### 7.4 Impact on Implementation Master Plan

**Phase 0-7 (Complete):** No changes required

**New Phases (Proposed):**
- **Phase 8:** Calendar Workspace UI (FullCalendar integration, detail panel)
- **Phase 9:** Description Authoring Layer (TipTap editor, form templates)
- **Phase 10:** Version History System (version table, restore flow)

**Estimated Duration:**
- Phase 8: 8-12 hours
- Phase 9: 10-14 hours
- Phase 10: 6-8 hours
- Total: 24-34 hours

**Rollback Strategy:**
- Git revert per phase (same as existing phases)
- Database migrations reversible (DROP TABLE statements provided)
- No destructive changes to existing data

### 7.5 Backward Compatibility Matrix

| Component | Pre-Addendum D Behavior | Post-Addendum D Behavior | Breaking Change? |
|-----------|------------------------|--------------------------|------------------|
| UI Layout | 3-column card grid | Calendar + detail panel | ✅ YES (UI only) |
| Description Editing | Read-only from Odoo | Editable via TipTap | ❌ NO (new feature) |
| Publish Flow | Odoo → WP | Odoo → WP (unchanged) | ❌ NO |
| State Engine | Odoo vs WP | Odoo vs WP (unchanged) | ❌ NO |
| Snapshots | Logged on publish | Logged on publish (unchanged) | ❌ NO |
| Version History | None | Logged on save | ❌ NO (new feature) |
| Form Templates | Hardcoded | Registry-based | ✅ YES (requires migration) |

**Migration Requirements:**
1. **Form Templates:** Must create initial `form_templates` records before editors can use form selector
2. **Calendar Dependencies:** Must load FullCalendar CDN (added to ui.js)
3. **TipTap Dependencies:** Must load TipTap CDN (added to ui.js)

**No Data Loss:**
- Existing `webinar_snapshots` remain functional
- No columns dropped from existing tables
- New tables are additive only

### 7.6 Migration Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| FullCalendar rendering errors | Medium | High | Extensive testing in dev environment, fallback to table view |
| TipTap schema conflicts with WordPress | Medium | Medium | Test generated HTML in WP staging site before production |
| Odoo write permission denied | Low | High | Test write access in Phase 9 pre-check, document required permissions |
| Version history table bloat | Low | Medium | Add retention policy (archive versions >1 year old) |
| Form template migration gaps | High | Medium | Provide seed SQL with default template, validate in Phase 9.1 |
| Calendar performance (>500 events) | Medium | Medium | Implement date range filtering, lazy load events |
| User confusion (UI paradigm shift) | High | Low | Provide onboarding modal, document in user guide |

**Critical Path Dependencies:**
1. Odoo `write()` permission must be granted before Phase 9
2. WordPress staging site must be available for shortcode testing
3. Form template seed data must be created before editor testing

---

## 8. Failure Scenarios & Rollback Logic

### 8.1 FullCalendar Rendering Failure

**Symptom:** Calendar div remains empty, JavaScript console shows FullCalendar error

**Potential Causes:**
- CDN unavailable (network issue)
- Event data malformed (invalid ISO datetime)
- CSS conflicts (DaisyUI overriding FullCalendar styles)

**Detection:**
```javascript
// In event-operations-client.js
try {
  const calendar = new FullCalendar.Calendar(calendarEl, config);
  calendar.render();
} catch (error) {
  console.error('FullCalendar render failed:', error);
  showFallbackUI();
}
```

**Fallback UI:**
- Display message: "Calendar failed to load. Showing list view."
- Render events as sortable table (fallback to Addendum A card layout)
- Log error to monitoring service

**Rollback:**
- Git revert Phase 8 commit
- Redeploy previous version
- No data loss (calendar is pure UI layer)

### 8.2 TipTap Editor Initialization Failure

**Symptom:** Editor modal shows empty div, no toolbar rendered

**Potential Causes:**
- CDN unavailable
- TipTap version incompatibility
- Custom FormShortcode extension error

**Detection:**
```javascript
try {
  const editor = new Editor({
    extensions: [StarterKit, Link, Image, FormShortcode],
    content: initialContent
  });
} catch (error) {
  console.error('TipTap init failed:', error);
  showPlainTextFallback();
}
```

**Fallback UI:**
- Display plain textarea for HTML editing
- Show warning: "Rich text editor unavailable. Editing HTML directly."
- Disable form template selector (cannot insert shortcode blocks)

**Rollback:**
- Git revert Phase 9 commit
- Redeploy previous version
- Users can still view descriptions (read-only)

### 8.3 Odoo Write Failure (Permission Denied)

**Symptom:** Save description returns 403 Forbidden or "Access Denied" error

**Root Cause:** Odoo user lacks write permission on `x_studio_description` field

**Detection:**
```javascript
// In odoo-client.js
async function writeDescription(webinarId, htmlContent) {
  try {
    const result = await xmlrpc.execute(
      'x_webinar',
      'write',
      [[webinarId], { x_studio_description: htmlContent }]
    );
    if (!result) {
      throw new Error('Odoo write returned false (permission denied or record locked)');
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

**User Feedback:**
- Toast notification: "Failed to save description: Odoo permission denied. Contact your administrator."
- Version entry deleted (compensating transaction)
- Editor remains open with unsaved content

**Resolution:**
1. Grant Odoo user write access on `x_studio_description` field
2. Test write access via `scripts/test-odoo-write-access.mjs`
3. Retry save operation

**Rollback:**
- Not applicable (permission issue, not code issue)
- Users can read descriptions (read-only mode)

### 8.4 Version History Table Bloat

**Symptom:** Database storage exceeds quota, queries slow down

**Root Cause:** Too many version entries (users saving frequently)

**Monitoring:**
```sql
-- Check version count per webinar
SELECT 
  odoo_webinar_id,
  COUNT(*) as version_count,
  MAX(created_at) as last_version
FROM event_description_versions
GROUP BY odoo_webinar_id
ORDER BY version_count DESC
LIMIT 20;
```

**Mitigation Strategies:**
1. **Retention Policy:** Archive versions older than 1 year
2. **Deduplication:** Skip creating version if content identical to last version
3. **Compression:** Store `html_content` as JSONB with gzip compression
4. **Pagination:** Limit version history modal to 50 most recent versions

**Implementation (Retention Policy):**
```sql
-- Archive old versions (move to archive table)
CREATE TABLE event_description_versions_archive (LIKE event_description_versions);

INSERT INTO event_description_versions_archive
SELECT * FROM event_description_versions
WHERE created_at < NOW() - INTERVAL '1 year';

DELETE FROM event_description_versions
WHERE created_at < NOW() - INTERVAL '1 year';
```

**Rollback:**
- Not applicable (maintenance task, not feature rollback)

### 8.5 Form Template Migration Gaps

**Symptom:** Editor cannot insert form blocks, dropdown shows "No templates available"

**Root Cause:** `form_templates` table empty after migration

**Prevention:**
```sql
-- Seed default template in migration file
INSERT INTO form_templates (label, wp_shortcode_id, active, default_flag)
VALUES ('Webinar Registration Form', '12345', true, true)
ON CONFLICT DO NOTHING;
```

**Detection:**
```javascript
// In editor initialization
const templates = await fetchFormTemplates();
if (templates.length === 0) {
  console.warn('No form templates available');
  disableFormInsertion();
  showAdminAlert();
}
```

**User Feedback:**
- Warning message in editor: "No form templates configured. Contact your administrator to add templates."
- Disable "Insert Form" button
- Allow manual shortcode entry as fallback

**Resolution:**
1. Admin creates form template via `POST /api/form-templates`
2. Refresh editor modal
3. Form insertion enabled

**Rollback:**
- Not applicable (data gap, not code issue)

### 8.6 Transactional Integrity Failure (Orphaned Version)

**Symptom:** Version entry exists in Supabase but Odoo description unchanged

**Root Cause:** Supabase insert succeeded, Odoo write failed, rollback DELETE failed

**Detection:**
```sql
-- Find orphaned versions (no corresponding Odoo update)
SELECT v.*
FROM event_description_versions v
WHERE v.created_at > NOW() - INTERVAL '1 hour'
  AND NOT EXISTS (
    SELECT 1 FROM webinar_snapshots ws
    WHERE ws.odoo_webinar_id = v.odoo_webinar_id
      AND ws.odoo_snapshot->>'x_studio_description' = v.html_content
  );
```

**Impact:**
- Orphaned version entry in database (benign)
- Audit trail includes failed save attempt
- No user data loss (editor content preserved)

**Cleanup:**
- Manual DELETE of orphaned versions (DBA task)
- Add `failed_rollback` flag to version entry for audit

**Prevention:**
- Log rollback failures to monitoring service
- Alert on rollback failure rate >1%

**Rollback:**
- Not applicable (data cleanup, not feature rollback)

---

## 9. Explicit Architecture Decisions

### 9.1 Why FullCalendar (Not Custom Calendar)

**Decision:** Use FullCalendar.js library instead of building custom calendar

**Rationale:**
1. **Industry Standard:** 500K+ npm weekly downloads, battle-tested in production
2. **Feature Complete:** Month/week/day views, timezone handling, event rendering, drag-drop (future)
3. **Accessibility:** ARIA labels, keyboard navigation built-in
4. **MIT License:** Permissive license, no commercial restrictions
5. **Maintenance:** Active development, regular security updates

**Tradeoff:**
- **Adds Dependency:** ~200KB (minified + gzipped), increases bundle size
- **Learning Curve:** Team must learn FullCalendar API
- **Customization Limits:** Some UI patterns require workarounds

**Acceptance Criteria:**
- Bundle size increase acceptable (<500KB total)
- MIT license permits commercial use
- Active GitHub repository (last commit <3 months)

### 9.2 Why TipTap (Not ContentEditable Alone)

**Decision:** Use TipTap framework instead of raw contentEditable

**Rationale:**
1. **Structured Schema:** Enforces valid HTML structure (prevents malformed output)
2. **WordPress Compatibility:** Outputs clean HTML (not markdown or proprietary format)
3. **Custom Nodes:** Supports FormShortcode block (not possible with textarea)
4. **Headless Architecture:** No framework lock-in (works with vanilla JS)
5. **Extensible:** Can add custom commands, plugins, validation rules

**Tradeoff:**
- **Adds Dependency:** ~100KB (minified + gzipped)
- **Complexity:** More complex than plain textarea
- **Debugging:** Schema validation errors can be cryptic

**Alternatives Rejected:**
- **Plain Textarea:** No rich text formatting, no structure enforcement
- **Quill.js:** Uses Delta format (requires conversion to HTML)
- **Draft.js:** React-only (violates no-framework constraint)
- **CKEditor:** Heavy (~500KB), opinionated toolbar, not headless

### 9.3 Why Odoo as Canonical Storage (Not Supabase)

**Decision:** Write descriptions to Odoo `x_studio_description`, use Supabase only for versions

**Rationale:**
1. **Single Source of Truth:** Odoo is existing canonical system for all event data
2. **Integration Consistency:** Other Odoo fields (name, datetime, type) already authoritative
3. **Audit Trail Separation:** Supabase versions are historical log, not active data
4. **Simplifies State Engine:** No 3-way comparison (Odoo vs WP vs Supabase)
5. **Odoo as Backend:** Maintains existing architectural principle (Odoo owns data, Event Operations is UI)

**Tradeoff:**
- **Odoo Dependency:** Cannot save descriptions if Odoo unavailable
- **Latency:** XML-RPC write slower than Supabase insert
- **Permission Complexity:** Requires Odoo user write access setup

**Alternatives Rejected:**
- **Supabase as Canonical:** Creates dual source of truth, state engine ambiguity
- **WordPress as Canonical:** Violates unidirectional sync principle
- **Dual Write (Odoo + Supabase):** Introduces consistency risks, no transactional guarantee

### 9.4 Why No Autosave

**Decision:** Require explicit "Save" button click (no autosave timer)

**Rationale:**
1. **Version Integrity:** Prevents noise in version history (too many micro-edits)
2. **Editorial Control:** User decides when description is "done"
3. **Reduces Odoo Load:** Fewer XML-RPC write calls
4. **Prevents Accidental Overwrites:** User must confirm save action
5. **Audit Trail Clarity:** Each version is deliberate save point

**Tradeoff:**
- **Risk of Data Loss:** User closes browser without saving
- **User Frustration:** Must remember to click Save

**Mitigation:**
- Warn before closing editor with unsaved changes: `window.onbeforeunload`
- Show "Unsaved changes" indicator in editor header
- Provide "Save Draft" vs "Save & Close" options

**Alternatives Rejected:**
- **Autosave Every 30s:** Creates too many versions, floods version history
- **Autosave on Blur:** User may not intend to save (just switching tabs)
- **Local Storage Draft:** Adds complexity, state inconsistency risk

### 9.5 Why Form Template Registry (Not Hardcoded Shortcodes)

**Decision:** Create `form_templates` table instead of hardcoding shortcode IDs

**Rationale:**
1. **Future-Proof:** Supports multiple registration forms (webinar vs workshop vs conference)
2. **Admin Flexibility:** Business users can add forms without code changes
3. **Decouples Logic:** Template selection independent of shortcode implementation
4. **Audit Trail:** Track which form used for which event
5. **Migration Path:** Easier to swap forms when WordPress changes

**Tradeoff:**
- **Complexity:** Requires admin UI for template management
- **Migration Effort:** Must seed initial templates

**Alternatives Rejected:**
- **Hardcoded in Constants:** Requires code changes to add new forms
- **Environment Variable:** Cannot support multiple forms per environment
- **WordPress-Sourced:** Adds external dependency, slower to fetch

### 9.6 Why No Supabase vs WP Comparison

**Decision:** State engine compares only Odoo vs WP (not Supabase vs WP)

**Rationale:**
1. **Eliminates Ambiguity:** One canonical source (Odoo), one sync target (WP)
2. **Prevents Cascading Mismatches:** No 3-way conflict resolution needed
3. **Simplifies Rollback:** Only 2 systems to reconcile
4. **Version History is Log:** Supabase versions are audit trail, not state source
5. **Maintains Existing Pattern:** Addendum C already uses Odoo vs WP logic

**Implication:**
- Supabase versions may diverge from Odoo if user edits directly in Odoo
- Accepted tradeoff: Version history incomplete if users bypass Event Operations

**Alternatives Rejected:**
- **3-Way Comparison:** Adds complexity, unclear resolution priority
- **Supabase as Source of Truth:** Creates dual canonical system
- **WordPress as Source of Truth:** Violates unidirectional sync principle

---

## 10. Required Code Changes (Overview)

### 10.1 Database Layer

**New Migrations:**
1. `20260213100000_event_operations_addendum_d_form_templates.sql`
   - Create `form_templates` table
   - Create `event_description_versions` table
   - Add indexes, triggers, RLS policies
   - Seed default form template

**No Table Modifications:**
- `webinar_snapshots` unchanged (no editorial_content column)

### 10.2 Server Layer (Cloudflare Workers)

**New Modules:**
1. `src/modules/event-operations/description-versioning.js`
   - `createVersion(user_id, webinar_id, html_content, source_type, created_by)`
   - `listVersions(user_id, webinar_id)`
   - `restoreVersion(version_id)` → writes to Odoo
   - `deleteVersion(version_id)` (rollback only)

2. `src/modules/event-operations/form-templates.js`
   - `listTemplates(user_id)` → returns active templates
   - `getDefaultTemplate(user_id)` → returns template with default_flag=true
   - `createTemplate(user_id, template_data)` [admin only]
   - `updateTemplate(template_id, template_data)` [admin only]

3. `src/modules/event-operations/description-generator.js`
   - `generateDefault(webinar_metadata, form_template)` → returns HTML string
   - Template structure defined in function (not external file)

**Extended Modules:**
1. `src/modules/event-operations/odoo-client.js`
   - Add `writeDescription(webinar_id, html_content)` method
   - Validate content length before write
   - Return `{ success, error }` object

2. `src/modules/event-operations/routes.js`
   - Add `GET /api/form-templates`
   - Add `POST /api/form-templates` (admin only)
   - Add `GET /api/description-versions/:webinar_id`
   - Add `POST /api/description-versions`
   - Add `POST /api/restore-version/:version_id`
   - Add `PUT /api/save-description` (orchestrates Supabase + Odoo)

3. `src/modules/event-operations/ui.js`
   - Add FullCalendar CSS/JS CDN links
   - Add TipTap CSS/JS CDN links
   - Replace card grid HTML with calendar workspace layout
   - Include `diff-match-patch` library for version diff view

**Unchanged Modules:**
1. `src/modules/event-operations/state-engine.js`
   - No changes (backward compatible)

2. `src/modules/event-operations/wp-client.js`
   - No changes (publish flow unchanged)

### 10.3 Client Layer (Browser JavaScript)

**Complete Refactor:**
1. `public/event-operations-client.js`
   - Remove card grid rendering logic
   - Add FullCalendar initialization
   - Add detail panel update logic
   - Add TipTap editor initialization
   - Add form template selector UI
   - Add version history modal
   - Add save workflow orchestration
   - Add confirmation modals
   - Add toast notifications

**Estimated LOC Changes:**
- Removed: ~800 lines (card grid logic)
- Added: ~1200 lines (calendar + editor logic)
- Net: +400 lines

### 10.4 Testing Requirements

**Unit Tests:**
1. `description-versioning.test.js`
   - Test `createVersion` success/failure
   - Test `listVersions` filtering
   - Test `restoreVersion` rollback logic

2. `form-templates.test.js`
   - Test `listTemplates` active filtering
   - Test `getDefaultTemplate` priority logic

3. `description-generator.test.js`
   - Test HTML output structure
   - Test shortcode injection
   - Test metadata placeholder replacement

**Integration Tests:**
1. `save-description.test.js`
   - Test transactional flow (Supabase → Odoo)
   - Test rollback on Odoo failure
   - Test OUT_OF_SYNC trigger

2. `calendar-workspace.test.js`
   - Test event rendering (color mapping)
   - Test detail panel update
   - Test status legend

**Manual Tests:**
1. FullCalendar rendering across browsers (Chrome, Firefox, Safari, Edge)
2. TipTap editor shortcode insertion
3. Version history diff view
4. Restore version confirmation flow
5. Save error handling (disconnect Odoo, verify rollback)

---

## 11. Validation Checklist

### 11.1 Pre-Implementation Validation

- [ ] Read Addendum A, B, C to confirm no architectural conflicts
- [ ] Review Implementation Master Plan phases 0-7 completion status
- [ ] Verify Odoo user has write permission on `x_studio_description`
- [ ] Test FullCalendar CDN accessibility (network policy)
- [ ] Test TipTap CDN accessibility
- [ ] Confirm WordPress staging site available for shortcode testing
- [ ] Create seed form template data (default Forminator form ID)

### 11.2 Post-Phase 8 Validation (Calendar Workspace)

- [ ] Calendar renders with month/week/day views
- [ ] Events display with correct colors (status mapping)
- [ ] Detail panel updates on event click
- [ ] Status legend shows all 5 states
- [ ] Action buttons disabled correctly (archived events)
- [ ] Sync button triggers calendar refresh
- [ ] Responsive layout works on tablet/mobile

### 11.3 Post-Phase 9 Validation (Description Authoring)

- [ ] TipTap editor loads with toolbar
- [ ] Form template selector shows active templates
- [ ] Generate default creates valid HTML structure
- [ ] Save button triggers version creation
- [ ] Odoo description updated after save
- [ ] OUT_OF_SYNC triggered after save
- [ ] Rollback deletes version on Odoo failure
- [ ] Toast notifications display success/error

### 11.4 Post-Phase 10 Validation (Version History)

- [ ] Version history modal shows all versions
- [ ] Diff view highlights changes correctly
- [ ] Restore version creates new version entry
- [ ] Restore triggers OUT_OF_SYNC
- [ ] Checksum validation passes
- [ ] Source type badge displays correctly

### 11.5 Regression Testing

- [ ] Existing publish flow works (Addendum C event type mapping)
- [ ] State engine detects discrepancies (Addendum C logic)
- [ ] Datetime formatting correct (Addendum B Brussels timezone)
- [ ] Existing webinar_snapshots readable
- [ ] RLS policies enforce user isolation
- [ ] No console errors in browser devtools

---

## 12. Rollback Plan

### 12.1 Phase 8 Rollback (Calendar Workspace)

**Trigger:** FullCalendar rendering fails, performance issues, user rejection

**Steps:**
1. Git revert Phase 8 commit
2. Redeploy previous version via `npx wrangler publish`
3. No database changes to rollback (UI only)

**Data Impact:** None

**Downtime:** <5 minutes (deploy time)

### 12.2 Phase 9 Rollback (Description Authoring)

**Trigger:** TipTap initialization fails, Odoo write errors, version creation bugs

**Steps:**
1. Git revert Phase 9 commit
2. Redeploy previous version
3. Optionally: `DROP TABLE event_description_versions CASCADE`
4. Optionally: `DROP TABLE form_templates CASCADE`

**Data Impact:**
- Version history lost (if tables dropped)
- Form templates lost (if tables dropped)
- Odoo descriptions unchanged (data safe)

**Downtime:** <5 minutes (deploy time)

### 12.3 Phase 10 Rollback (Version History)

**Trigger:** Version restore bugs, diff view errors, performance issues

**Steps:**
1. Git revert Phase 10 commit
2. Redeploy previous version
3. Keep `event_description_versions` table (data preserved)

**Data Impact:** None (version history preserved)

**Downtime:** <5 minutes (deploy time)

### 12.4 Full Addendum D Rollback

**Trigger:** Complete failure, incompatibility with production environment

**Steps:**
1. Git revert all Addendum D commits (Phase 8, 9, 10)
2. Drop tables:
   ```sql
   DROP TABLE IF EXISTS event_description_versions CASCADE;
   DROP TABLE IF EXISTS form_templates CASCADE;
   ```
3. Redeploy pre-Addendum D version
4. Document rollback reason for post-mortem

**Data Impact:**
- All version history lost
- Form templates lost
- Odoo descriptions unchanged (safe)
- webinar_snapshots unchanged (safe)

**Downtime:** <10 minutes (full redeploy)

---

## 13. Success Criteria

### 13.1 Functional Criteria

- [ ] Users can view events in calendar (month/week/day views)
- [ ] Users can edit descriptions via TipTap editor
- [ ] Users can insert form shortcodes from template registry
- [ ] Users can save descriptions to Odoo
- [ ] Users can view version history
- [ ] Users can restore previous versions
- [ ] OUT_OF_SYNC triggered after description save
- [ ] Calendar colors reflect event status (published, draft, out_of_sync)

### 13.2 Performance Criteria

- [ ] Calendar renders <2s for 100 events
- [ ] Editor opens <1s
- [ ] Save operation completes <3s (Supabase + Odoo)
- [ ] Version history modal loads <2s (50 versions)
- [ ] Page load time <3s (including FullCalendar + TipTap)

### 13.3 Security Criteria

- [ ] RLS enforced on `event_description_versions` (user-scoped)
- [ ] RLS enforced on `form_templates` (read-all, write-admin)
- [ ] No XSS vulnerabilities in HTML editor (TipTap sanitizes input)
- [ ] No SQL injection in version queries
- [ ] Odoo write permission validated before save

### 13.4 Usability Criteria

- [ ] No console errors in browser devtools
- [ ] All buttons have hover states
- [ ] Disabled buttons show tooltips explaining why
- [ ] Error messages include actionable resolution steps
- [ ] Success feedback visible for all save operations
- [ ] Confirmation modals prevent accidental data loss

### 13.5 Maintainability Criteria

- [ ] Code follows existing module patterns (no inconsistencies)
- [ ] All functions have JSDoc comments
- [ ] Database schema documented in migration files
- [ ] API routes documented with OpenAPI comments
- [ ] Rollback procedures tested in staging environment

---

## 14. Future Enhancements (Out of Scope)

The following enhancements are explicitly deferred to future addendums:

1. **Drag-and-Drop Event Rescheduling** (FullCalendar supports this, requires Odoo write to datetime field)
2. **Collaborative Editing** (multi-user simultaneous editing with conflict resolution)
3. **Scheduled Publishing** (cron-based automated publish at specified time)
4. **WordPress Preview Mode** (render shortcodes in editor preview)
5. **Template Versioning** (track changes to form templates over time)
6. **Bulk Description Generation** (generate defaults for all events at once)
7. **AI-Assisted Content Generation** (GPT-powered description suggestions)
8. **Version Comparison** (diff between any two versions, not just current vs selected)
9. **Export Version History** (download all versions as HTML files)
10. **Real-Time Calendar Sync** (WebSocket updates when Odoo changes)

---

## 15. Conclusion

Addendum D represents a significant architectural evolution of the Event Operations module, transforming it from a read-only view layer into a complete editorial workspace. By introducing the calendar workspace and description authoring layer, users gain:

1. **Visual Planning:** Industry-standard calendar interface for event scheduling context
2. **Editorial Control:** Rich text editing with WordPress-compatible HTML output
3. **Version Integrity:** Complete audit trail of all description changes
4. **Form Flexibility:** Registry-based template system for dynamic shortcode management
5. **State Clarity:** OUT_OF_SYNC visualization maintains awareness of publish state

The architecture maintains strict adherence to existing principles:
- **Odoo as canonical source** (no parallel data storage)
- **Unidirectional sync** (Odoo → WP only)
- **User-scoped isolation** (RLS enforced)
- **No frameworks** (vanilla JS + controlled dependencies)
- **Backward compatible** (no breaking changes to existing data)

All failure scenarios have defined rollback procedures, and all edge cases have explicit handling logic. The addendum is ready for phased implementation with clear validation criteria and success metrics.

**Status:** Ready for Implementation  
**Next Step:** Phase 8 Implementation (Calendar Workspace UI)  
**Estimated Completion:** 24-34 hours total implementation time
