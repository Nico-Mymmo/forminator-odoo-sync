# EVENT OPERATIONS – ADDENDUM D: CALENDAR WORKSPACE & AUTHORING LAYER

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Document:** ADDENDUM_D_CALENDAR_WORKSPACE_AND_AUTHORING_LAYER.md  
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
     1. Check concurrency (compare write_date)
     2. Write to Odoo `x_studio_description` (CANONICAL)
     3. On success: Log version to Supabase (best-effort)
     4. On Odoo failure: Show error, keep editor open
     5. On Supabase failure: Log warning, return success (Odoo write succeeded)
   - No compensating transactions or rollbacks

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

### Core Architectural Principles (Reaffirmed)

Addendum D maintains absolute adherence to the following foundational principles:

1. **Single Canonical Source:** Odoo is the authoritative system for all event data, including descriptions
2. **Unidirectional Sync:** Data flows Odoo → WordPress only (no bidirectional sync)
3. **Append-Only Audit Log:** Supabase stores version history as immutable log, never used in state comparisons
4. **No Distributed Transactions:** No XA/2PC; write to Odoo first, log to Supabase second
5. **Explicit Save:** No autosave; user controls when descriptions are committed
6. **Deterministic State Engine:** Discrepancy detection compares Odoo current vs WP current only

**Critical Clarification:**
- Supabase is NOT a parallel database
- Supabase is NOT compared to WordPress in state engine
- Supabase is NOT authoritative for any operational decision
- Supabase versions are historical audit trail ONLY

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

**Description Save Orchestration (Server-Side Only):**

**Route:** `PUT /api/save-description`

**Request Payload:**
```javascript
{
  user_id: UUID,
  webinar_id: INTEGER,
  html_content: TEXT,
  source_type: ENUM('generated', 'manual', 'restored', 'forced_overwrite'),
  editor_write_date: TIMESTAMP  // From editor open, for concurrency check
}
```

**Server Orchestration Steps:**

1. **Validate HTML Content**
   - Check non-empty
   - Check length ≤ Odoo field limit (~65000 chars)
   - **Server-side sanitization** (see Section 5.5.1)

2. **Concurrency Check (Server-Side)**
   - Fetch current Odoo `write_date` for webinar
   - Compare `current_write_date` with `editor_write_date` from request
   - If mismatch: Return `{ conflict: true, current_write_date, message }`
   - If match: Proceed

3. **Write to Odoo (CANONICAL)**
   - Call Odoo XML-RPC `write(webinar_id, { x_studio_description: sanitized_html })`
   - If fails: Return `{ success: false, error: odoo_error_message }`
   - If succeeds: Capture new `write_date` from response

4. **Log Version to Supabase (Best-Effort)**
   - Insert into `event_description_versions`
   - If Supabase insert fails: Log warning, continue (non-fatal)
   - Version logging failure does NOT abort save

5. **Return Success Response**
   ```javascript
   {
     success: true,
     new_write_date: TIMESTAMP,  // For client to update stored value
     version_logged: BOOLEAN      // True if Supabase succeeded, false if failed
   }
   ```

6. **Client State Update**
   - Client receives success response
   - Client sets local `computed_state = 'out_of_sync'`
   - Client updates stored `write_date` to `new_write_date`
   - Client closes editor, refreshes detail panel
   - No sync API call required

**Critical Constraint:**

**Client NEVER calls Supabase directly for version creation.**

All version logging happens server-side within `/api/save-description`.

Client has no direct access to `event_description_versions` INSERT operations.

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
- `source_type` (TEXT, NOT NULL) - Enum: 'generated' | 'manual' | 'restored' | 'forced_overwrite'
- `checksum` (TEXT, NOT NULL) - SHA-256 hash of html_content (integrity check)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `created_by` (TEXT, NULL) - User email or name (for audit trail)

**Source Type Values:**
- `'generated'` - Default description generated from template
- `'manual'` - User-edited content via TipTap editor
- `'restored'` - Restored from previous version
- `'forced_overwrite'` - Admin forced save despite concurrency conflict

**Indexes:**
- `idx_event_description_versions_user_id` on `user_id`
- `idx_event_description_versions_webinar_id` on `odoo_webinar_id`
- `idx_event_description_versions_user_webinar` on `(user_id, odoo_webinar_id, created_at DESC)`

**Unique Constraints:**
- None (duplicate content allowed for audit trail)

**Triggers:**
- None (created_at is immutable)

**RLS Policies (Event-Scoped Audit Trail):**

**Architectural Decision: Event-Scoped Version History**

Version history is a **shared audit trail** for each event, not a per-user draft log.

**Rationale:**
- Odoo is canonical and shared across organization
- Multiple users may edit same event over time
- Audit trail must show full history regardless of who made changes
- Transparency: All users see who edited what and when
- Matches Odoo's shared data model

**RLS Policies:**
- `All authenticated users can view all versions` (SELECT)  
  - Target: TO public  
  - Filter: `TRUE` (no user restriction)
  - Rationale: Audit transparency

- `No direct client INSERT` (INSERT)  
  - **No RLS policy defined**
  - Versions created via server-side `/api/save-description` only
  - Server uses SERVICE_ROLE_KEY (bypasses RLS)
  - Client cannot directly insert versions

- `No updates or deletes` (UPDATE, DELETE)  
  - No policies (versions are immutable)
  - Not even server can update/delete versions

**User Privacy Note:**

All authenticated users can see version history for all events. If per-user privacy is required, this design must be reconsidered. Current design prioritizes audit transparency over privacy.

**Migration File:** Same as 3.1 (`20260213100000_event_operations_addendum_d_form_templates.sql`)

**Rationale:**
- **No UPDATE/DELETE:** Versions are immutable audit trail
- **checksum:** Detect data corruption or tampering
- **source_type:** Distinguish generated defaults from manual edits
- **created_by:** Optional user identity for multi-user environments

**Version History Philosophy:**

Supabase `event_description_versions` is:
1. **Logging layer only** (not authoritative, not operational)
2. **Best-effort audit trail** (missing entries acceptable if Supabase fails)
3. **Never used in state comparisons** (state engine uses Odoo vs WP only)
4. **Immutable append-only log** (no updates, no deletes)
5. **User-scoped via RLS** (users see only their versions)
6. **Independent of publish state** (versions track edits, not publishes)

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
│ CLIENT: User clicks "Save Description"                      │
│ Client POSTs to /api/save-description with:                 │
│   - html_content (from TipTap editor)                       │
│   - editor_write_date (stored at editor open)               │
│   - source_type ('manual' or 'generated')                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ SERVER STEP 1: Validate & Sanitize HTML                     │
│ - Check non-empty                                           │
│ - Check length ≤ Odoo limit                                 │
│ - Server-side sanitization (Section 5.5.1)                  │
│ - Strip dangerous tags/attributes                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ SERVER STEP 2: Concurrency Check (Server-Side Only)         │
│ - Server fetches current Odoo write_date                    │
│ - Server compares with editor_write_date from request       │
│ - If mismatch: Return { conflict: true, current_write_date }│
│ - If match: Proceed                                         │
└─────────────────────────────────────────────────────────────┘
         ↓ NO CONFLICT                    ↓ CONFLICT
┌─────────────────────────┐  ┌────────────────────────────────┐
│ SERVER STEP 3: Write to │  │ RETURN CONFLICT                │
│   Odoo (CANONICAL)      │  │ Client shows conflict modal    │
│ - Call Odoo XML-RPC     │  │ Options:                       │
│   write()               │  │   - Reload Latest              │
│ - Sanitized HTML stored │  │   - Force Overwrite (admin)    │
│ - Capture new write_date│  │   - Cancel                     │
└─────────────────────────┘  └────────────────────────────────┘
         ↓ SUCCESS                    ↓ FAILURE
┌─────────────────────────┐  ┌────────────────────────────────┐
│ SERVER STEP 4: Log to   │  │ RETURN ERROR                   │
│   Supabase (Best-Effort)│  │ - Odoo error message           │
│ - Insert version entry  │  │ - Save failed                  │
│ - If fails: Log warning │  │ - No version created           │
│ - Continue (non-fatal)  │  └────────────────────────────────┘
└─────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ SERVER STEP 5: Return Success                               │
│ Returns: {                                                  │
│   success: true,                                            │
│   new_write_date: TIMESTAMP,                                │
│   version_logged: BOOLEAN                                   │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ CLIENT: Update State                                        │
│ - Close editor modal                                        │
│ - Show success toast                                        │
│ - Update stored write_date to new_write_date                │
│ - Set local computed_state = 'out_of_sync'                  │
│ - Update calendar event color to amber                      │
│ - Refresh detail panel                                      │
│ - NO sync API call required                                 │
└─────────────────────────────────────────────────────────────┘
```

**Critical Constraint:**

**ALL operations happen server-side within `/api/save-description`.**

Client makes ONE request. Server orchestrates all steps. Client receives ONE response.

**Save Flow Principles:**

**Principle 1: Odoo Write is Authoritative**
- If Odoo write succeeds, save is successful (even if Supabase logging fails)
- If Odoo write fails, save is failed (Supabase never attempted)
- No compensating transactions, no rollbacks

**Principle 2: Supabase is Audit Log Only**
- Version logging is best-effort
- Version logging failure does NOT invalidate Odoo write
- Missing version entries are acceptable (incomplete audit trail)
- Log warnings for Supabase failures, do not abort

**Principle 3: No Distributed Transaction**
- No XA/2PC coordination
- No two-phase commits
- Simple sequential: Odoo first, Supabase second
- Accept eventual consistency for audit log

**Case Handling:**

**Case 1: Odoo Write Succeeds, Supabase Insert Succeeds**
- Version logged correctly
- User sees success toast
- OUT_OF_SYNC state set locally
- Expected path (99% of saves)

**Case 2: Odoo Write Succeeds, Supabase Insert Fails**
- Canonical write succeeded (description updated in Odoo)
- Version entry missing (incomplete audit trail)
- Log warning to monitoring
- User sees success toast (Odoo write succeeded)
- OUT_OF_SYNC state set locally
- **Accepted Tradeoff:** Not all Odoo changes are versioned in Supabase

**Case 3: Odoo Write Fails**
- No canonical change
- No Supabase write attempted
- User sees error toast with Odoo error message
- Editor remains open with unsaved content
- No state change

**Case 4: Concurrency Conflict Detected**
- Odoo write_date changed since editor opened
- No writes attempted (Odoo or Supabase)
- User sees conflict modal with options:
  - "Reload Latest" → Fetch current Odoo version, discard edits
  - "Force Overwrite" → Bypass check, write anyway (admin only)
- Prevents accidental overwrites

**Why No Autosave:**
- Version history integrity requires deliberate save points
- Autosave creates noise in version log (too many micro-edits)
- User controls when descriptions are "done" (editorial workflow)
- Reduces risk of accidental overwrites

### 5.5.1 Server-Side HTML Sanitization

**Problem:**

TipTap editor runs in client (browser). Client-side output can be manipulated before reaching server.

**Critical Requirement:**

**Server MUST sanitize HTML before writing to Odoo.**

**Sanitization Steps (Server-Side in `/api/save-description`):**

1. **Parse HTML Structure**
   - Use HTML parser library (e.g., `cheerio` for Node.js)
   - Reject if malformed (unclosed tags, invalid nesting)

2. **Whitelist Allowed Tags**
   ```javascript
   const ALLOWED_TAGS = [
     'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
     'p', 'br', 'hr',
     'strong', 'em', 'u', 's',
     'ul', 'ol', 'li',
     'a',
     'img',
     'div',  // For forminator-block
     'blockquote'
   ];
   ```

3. **Whitelist Allowed Attributes**
   ```javascript
   const ALLOWED_ATTRIBUTES = {
     'a': ['href', 'title', 'target'],
     'img': ['src', 'alt', 'width', 'height'],
     'div': ['class', 'data-forminator-block', 'data-template-id']
   };
   ```

4. **Strip Dangerous Content**
   - Remove `<script>` tags
   - Remove `<style>` tags (inline styles allowed)
   - Remove `javascript:` protocol in `href`
   - Remove `on*` event handlers (`onclick`, `onerror`, etc.)

5. **Validate Forminator Blocks**
   - Ensure `data-forminator-block` divs contain only valid shortcode format
   - Regex: `^\[forminator_form id="\d+"\]$`
   - Reject if shortcode contains unexpected content

6. **Return Sanitized HTML**
   - If sanitization removed content: Log warning
   - If critical structure broken: Return error, abort save
   - If clean: Proceed with Odoo write

**Implementation Library:**

Use `DOMPurify` (isomorphic version) or equivalent:

```javascript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeHTML(html) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    KEEP_CONTENT: false  // Remove tags, don't keep inner content
  });
  
  if (clean !== html) {
    log.warn('HTML sanitized, content removed', {
      original_length: html.length,
      sanitized_length: clean.length
    });
  }
  
  return clean;
}
```

**Why Not Rely on TipTap Alone:**

1. **Client-Side Manipulation:** Browser DevTools can modify TipTap output before POST
2. **XSS Risk:** Malicious user could inject script via manipulated request
3. **Defense in Depth:** Server is last line of defense before Odoo
4. **Odoo Protection:** Prevent malicious HTML from entering canonical database

**Placement in Save Flow:**

Sanitization happens in Step 1 (Validate HTML Content) before concurrency check or Odoo write.

### 5.6 Concurrency Control & Last-Write Protection

**Problem:**

Multiple users or systems can modify Odoo descriptions concurrently:

1. User A opens Event Operations editor for webinar #123
2. User B updates description directly in Odoo (or via another tool)
3. User A clicks "Save" in Event Operations
4. User A's save overwrites User B's changes (lost update)

**Solution: Optimistic Concurrency Control**

Implement optimistic locking using Odoo's built-in `write_date` field.

**Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│ EDITOR OPEN (Initial Load)                                  │
│ 1. Fetch webinar from Odoo                                  │
│ 2. Store write_date: "2026-02-13 10:30:00"                  │
│ 3. Store checksum: SHA-256(x_studio_description)            │
│ 4. Load description into TipTap editor                      │
└─────────────────────────────────────────────────────────────┘
                          ↓ USER EDITS
┌─────────────────────────────────────────────────────────────┐
│ SAVE (Concurrency Check)                                    │
│ 1. Fetch current webinar write_date from Odoo               │
│ 2. Compare: stored vs current                               │
│    - Match: Proceed to Step 2 (Odoo write)                  │
│    - Mismatch: CONFLICT DETECTED                            │
└─────────────────────────────────────────────────────────────┘
                          ↓ CONFLICT
┌─────────────────────────────────────────────────────────────┐
│ CONFLICT MODAL (User Decision Required)                     │
│ Message: "This event was modified in Odoo since you opened  │
│           the editor. Your changes may overwrite recent     │
│           updates."                                         │
│                                                             │
│ Options:                                                    │
│ 1. [Reload Latest] → Discard edits, fetch current version   │
│ 2. [Force Overwrite] → Save anyway (admin role only)        │
│ 3. [Cancel] → Keep editor open, review changes              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Details:**

**On Editor Open (Client-Side):**
```javascript
// Client fetches webinar metadata
const response = await fetch(`/api/webinar/${webinarId}`);
const webinar = await response.json();

// Store write_date in client state (for later concurrency check)
const editorState = {
  webinarId: webinarId,
  storedWriteDate: webinar.write_date,  // Will be sent with save request
  initialContent: webinar.x_studio_description
};

// Load description into TipTap editor
editor.setContent(webinar.x_studio_description);
```

**On Save (Client Sends Stored write_date to Server):**
```javascript
// Client POSTs save request with stored write_date
const response = await fetch('/api/save-description', {
  method: 'PUT',
  body: JSON.stringify({
    user_id: currentUserId,
    webinar_id: webinarId,
    html_content: editor.getHTML(),
    source_type: 'manual',
    editor_write_date: editorState.storedWriteDate  // From editor open
  })
});

const result = await response.json();
```

**On Server (Concurrency Check):**
```javascript
// SERVER SIDE ONLY - Client does NOT perform this fetch
async function saveDescription(request) {
  const { webinar_id, editor_write_date, html_content } = request;
  
  // Server fetches current write_date from Odoo
  const current = await odooClient.read('x_webinar', webinar_id, ['write_date']);
  
  // Server compares
  if (current.write_date !== editor_write_date) {
    // CONFLICT DETECTED
    return {
      success: false,
      conflict: true,
      current_write_date: current.write_date,
      message: 'Event modified in Odoo since editor opened'
    };
  }
  
  // No conflict: Proceed with Odoo write
  const writeResult = await odooClient.write('x_webinar', webinar_id, {
    x_studio_description: sanitizeHTML(html_content)
  });
  
  // Capture new write_date from Odoo response
  const updated = await odooClient.read('x_webinar', webinar_id, ['write_date']);
  
  // Log version to Supabase (best-effort)
  try {
    await supabase.from('event_description_versions').insert({ ... });
  } catch (error) {
    log.warn('Version logging failed', error);
  }
  
  return {
    success: true,
    new_write_date: updated.write_date  // Client updates stored value
  };
}
```

**Critical Constraint:**

**Client performs NO extra read before save.**

Client sends `editor_write_date` (stored at editor open) with save request.

Server performs concurrency check internally.

Server returns conflict or new write_date.

**Conflict Resolution Options:**

1. **Reload Latest (Recommended):**
   - Fetch current `x_studio_description` from Odoo
   - Replace editor content with current version
   - Update `initialWriteDate` to current value
   - User can review and re-edit if needed
   - Safe: No data loss (current version preserved)

2. **Force Overwrite (Admin Only):**
   - Bypass `write_date` check
   - Write editor content to Odoo immediately
   - Log warning: "Forced overwrite by [user] at [timestamp]"
   - Create version entry with `source_type: 'forced_overwrite'`
   - High risk: May overwrite recent changes

3. **Cancel:**
   - Keep editor open
   - User can copy content to clipboard
   - User can manually compare with Odoo version
   - User decides how to reconcile

**Edge Cases:**

**Case 1: User Edits, Then Odoo Updates, Then User Saves Immediately**
- Conflict detected on save
- Modal shown
- User must choose resolution
- **No silent overwrite**

**Case 2: Multiple Users Edit Same Event Simultaneously**
- First save succeeds (updates `write_date`)
- Second save detects conflict (different `write_date`)
- Second user sees modal
- Last-write-wins prevented

**Case 3: User Opens Editor, Odoo System Updates Description Automatically**
- Conflict detected on save
- User sees modal
- User reloads latest (discards edits) or reviews conflict
- System-generated changes not silently overwritten

**Case 4: Network Delay in write_date Fetch**
- If fetch fails: Abort save with error (do not proceed)
- If fetch slow: Show loading state, wait for response
- If timeout: Abort save, show retry option
- **Never write without concurrency check**

**Why Not Pessimistic Locking:**
- Odoo does not support record-level locks via XML-RPC
- Pessimistic locks require database-level support
- Optimistic locking is standard for web applications
- Conflicts are rare (most edits are non-concurrent)

**Why write_date (Not Custom Field):**
- `write_date` is standard Odoo field (auto-updated on any write)
- No custom field creation required
- Works across all Odoo modules
- Reliable timestamp updated by Odoo server

**Logging Conflict Events:**

All conflict detections should be logged to monitoring:

```javascript
log.warn('Concurrency conflict detected', {
  webinar_id: webinarId,
  user_id: userId,
  editor_write_date: editorState.initialWriteDate,
  current_write_date: current.write_date,
  resolution: 'reload' | 'force_overwrite' | 'cancel'
});
```

This enables tracking conflict frequency and resolution patterns.

### 5.7 Version History System

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
│ - Set local OUT_OF_SYNC  │
│   state                  │
│ - Close modal            │
│ - Refresh detail panel   │
└─────────────────────────┘
```

**Restore Version Characteristics:**
- Restoring a version creates a NEW version entry (not an update)
- Original version entry remains unchanged (immutable audit trail)
- New version entry has `source_type: 'restored'`
- Checksum recalculated for new entry
- OUT_OF_SYNC set locally after restore (Odoo changed, WP unchanged)

**Why Create New Version on Restore:**
- Maintains complete audit trail (no gaps)
- Records who restored and when
- Allows tracking of "undo" operations
- Prevents confusion about version chronology

### 5.8 UX Definition

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

**Corrected Flow:**
```
User saves description in editor
  ↓
Description written to Odoo x_studio_description
  ↓
Odoo write succeeds
  ↓
Client sets local computed_state = 'out_of_sync'
  ↓
Calendar event color changes to amber (immediate UI update)
  ↓
Detail panel shows OUT_OF_SYNC badge
  ↓
NO sync API call required
  ↓
Next manual sync will confirm:
    Odoo.x_studio_description (NEW VALUE)
    vs
    WP.description (OLD VALUE)
    → Mismatch confirmed → out_of_sync persisted
```

**Key Correction:**

**Previous Incorrect Pattern:**
- Save description → Call `/api/sync` → State engine computes OUT_OF_SYNC

**Correct Pattern:**
- Save description → Set local state to OUT_OF_SYNC immediately
- No sync call required
- Next manual sync confirms discrepancy

**Rationale:**
1. **Immediate Feedback:** User sees OUT_OF_SYNC state instantly after save
2. **No Unnecessary Sync:** Sync is expensive (fetches Odoo + WP, computes diff)
3. **Deterministic:** We KNOW description changed in Odoo, WP unchanged → guaranteed out_of_sync
4. **Manual Sync Confirms:** Next sync validates local state assumption

**No Changes to State Engine Logic:**
- Discrepancy detection remains: Odoo current vs WP current
- No comparison between Supabase versions and WP
- No comparison between Supabase versions and Odoo
- Supabase versions are audit trail only, not state source
- State engine unchanged, just client-side state optimization

**Why No Automatic Publish:**
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

**Supabase Role Clarification:**

Supabase `event_description_versions` table is:
- **Audit trail only** (historical log)
- **Not authoritative** (not source of truth)
- **Not used in state engine** (never compared to Odoo or WP)
- **Best-effort logging** (missing entries acceptable)

**Version History Completeness Edge Cases:**

**Case 1: User Edits Description in Odoo Directly (Bypassing Event Operations)**
- Odoo description changes
- No version entry created in Supabase (edit bypassed Event Operations)
- Next sync: Odoo != WP → marks `out_of_sync`
- Version history incomplete (missing Odoo direct edit)
- **Accepted Tradeoff:** Version history only tracks Event Operations edits

**Case 2: User Saves Description, Supabase Insert Fails**
- Odoo description updated (canonical write succeeded)
- Version entry NOT created (Supabase failure)
- State shows `out_of_sync` (correct)
- Version history incomplete (missing version entry)
- **Accepted Tradeoff:** Audit log best-effort, not guaranteed

**Case 3: User Publishes Without Editing in Event Operations**
- Odoo description unchanged
- Published to WP as-is
- No version entry created (no edit occurred)
- State engine shows `published` (Odoo == WP)
- **Expected Behavior:** Versions track edits, not publishes

**Case 4: User Restores Old Version, Then Publishes**
- Restore writes to Odoo (canonical update)
- Restore creates new version entry (source_type: 'restored')
- Publish syncs Odoo → WP
- State engine shows `published` (Odoo == WP)
- Version history complete (restore logged)

**Case 5: WordPress Description Manually Edited**
- Odoo unchanged
- Next sync: Odoo != WP → marks `out_of_sync`
- Version history shows no change (Odoo not edited)
- User must decide: Re-publish from Odoo (overwrite WP) or accept WP divergence
- **No Bidirectional Sync:** WP changes never written back to Odoo

---

## 7. Impact Analysis

### 7.1 Impact on Addendum A (UI & Editorial Overhaul)

**Completely Supersedes:**

**A2 (Card View Redesign):**
- Replaced by calendar workspace (FullCalendar-based UI)
- Card grid NOT implemented
- Registration count displayed in detail panel (not cards)
- Status badges shown in calendar legend (not per-card)

**A5 (Editorial Content Layer):**
- **COMPLETELY REPLACED** by TipTap authoring layer architecture
- Addendum A proposed `editorial_content` JSONB column in `webinar_snapshots`
- Addendum D rejects this pattern:
  - Odoo is canonical storage (not Supabase)
  - Supabase is version history log only (not active storage)
  - `editorial_content` column is NOT added to `webinar_snapshots`
- Addendum D architecture is cleaner:
  - Write descriptions to Odoo directly
  - Log versions to Supabase as audit trail
  - No dual storage, no ambiguity

**Maintains (Unchanged):**

**A1 (Layout & Theme Consistency):**
- Theme inheritance pattern unchanged
- DaisyUI theme propagation still applies
- Navbar overlap fix pattern retained

**A3 (Filtering & Segmentation):**
- Month/week/day calendar views provide superior segmentation
- No need for tab-based filters (calendar is temporal filter)
- Client-side filtering logic can be adapted to calendar date ranges

**Deprecated (Not Implemented):**

**A4 (Tag Mapping Engine):**
- `webinar_tag_mappings` table NOT created
- Superseded by Addendum C `event_type_wp_tag_mapping`
- Many-to-many tag mapping rejected in favor of deterministic event type mapping

**Database Schema Impact:**

**Tables NOT Created:**
- `webinar_tag_mappings` (A4 pattern rejected)
- No `editorial_content` column added (A5 pattern rejected)

**Tables Created (Addendum D):**
- `form_templates` (form template registry)
- `event_description_versions` (version history log)

**Code Migration:**
- `event-operations-client.js` refactored (card rendering → calendar rendering)
- Tag mapping UI NOT implemented (Addendum C handles taxonomy)
- Editorial JSONB logic NOT implemented (Odoo write pattern used instead)

**Backward Compatibility:**
- Existing `webinar_snapshots` remain functional (no schema breaking changes)
- Users without version history can begin creating versions immediately
- No data migration required from A1-A3 patterns

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
| Odoo write_date field not accessible | Low | High | Verify field exposure in Phase 9 pre-check |
| Version history table bloat | Low | Medium | Add retention policy (archive versions >1 year old) |
| Form template migration gaps | High | Medium | Provide seed SQL with default template, validate in Phase 9.1 |
| Calendar performance (>500 events) | Medium | Medium | Implement date range filtering, lazy load events |
| User confusion (UI paradigm shift) | High | Low | Provide onboarding modal, document in user guide |
| Concurrent edit conflicts | Medium | Low | Optimistic locking detects conflicts, user resolves via modal |
| Supabase logging failures | Low | Low | Log warnings, accept incomplete audit trail |

**Critical Path Dependencies:**
1. Odoo `write()` permission must be granted before Phase 9
2. Odoo `write_date` field must be accessible via XML-RPC read() before Phase 9
3. WordPress staging site must be available for shortcode testing
4. Form template seed data must be created before editor testing

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
- Editor remains open with unsaved content
- No version entry created (Odoo write failed, no Supabase write attempted)

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

### 8.7 Supabase Logging Failure + Client Crash (Eventual Consistency)

**Symptom:** Odoo write succeeds, Supabase logging succeeds, but client crashes before setting OUT_OF_SYNC state locally

**Root Cause:** Client-side failure (browser crash, network disconnect, tab closed)

**Impact:**
- Canonical Odoo description updated (correct)
- Version logged in Supabase (correct)
- Local client state NOT updated to OUT_OF_SYNC (stale)
- User sees old state in calendar (stale)

**Recovery:**

Next manual sync operation reconciles state:

1. User clicks "Sync from Odoo" (or periodic sync triggers)
2. State engine fetches Odoo current description
3. State engine fetches WP current description
4. Comparison: Odoo != WP
5. State engine sets `computed_state = 'out_of_sync'`
6. Calendar event color updates to amber
7. Stale state corrected

**Accepted Eventual Consistency:**

This is an acceptable edge case:
- Canonical data is correct (Odoo)
- Audit trail is correct (Supabase)
- Only client UI state is temporarily stale
- Next sync auto-corrects
- No user intervention required
- No data loss

**Why No Immediate Fix:**
- Cannot prevent client crashes
- Cannot guarantee client state updates
- Eventual consistency is sufficient for UI state
- State engine is authoritative check on next sync

**Monitoring:**
- Track save success rate (Odoo write succeeded)
- Track version logging success rate (Supabase insert succeeded)
- Track sync frequency (how often users sync)
- Alert if sync frequency drops (users not seeing corrected state)

**Symptom:** Odoo write succeeds but version entry not created in Supabase

**Root Cause:** Supabase insert failed (network issue, database error, quota exceeded)

**Impact:**
- Canonical write succeeded (description updated in Odoo)
- Version entry missing (incomplete audit trail)
- User sees success toast (Odoo write succeeded)
- OUT_OF_SYNC state set correctly
- **No operational impact** (system functions normally)

**Detection:**
```javascript
// In save workflow
try {
  await supabaseClient.insert('event_description_versions', versionData);
  log.info('Version logged successfully');
} catch (error) {
  log.warn('Version logging failed (non-fatal)', {
    webinar_id: webinarId,
    error: error.message,
    odoo_write_succeeded: true
  });
  // Continue execution - Odoo write succeeded
}
```

**User Feedback:**
- Success toast: "Description saved successfully"
- No warning shown to user (log failure is internal)
- Editor closes normally
- OUT_OF_SYNC state visible in UI

**Monitoring Alert:**
- Log warning to monitoring service
- Alert on Supabase failure rate >5%
- Track version logging success rate

**Resolution:**
- Investigate Supabase connectivity
- Check database quota/limits
- Review RLS policies (ensure user can insert)
- No user action required (Odoo write succeeded)

**Why This is Acceptable:**
- Version history is audit trail, not operational requirement
- Missing versions do not prevent system function
- Users can still edit, save, publish
- Next successful save will create version entry
- Incomplete audit trail is better than blocking saves

**Why No Rollback:**
- Odoo write is authoritative action
- Cannot "unsave" description in Odoo
- Audit log failure should not invalidate canonical write
- Users expect save to succeed if Odoo succeeds

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

### 9.3 Why Odoo First, Supabase Second (Not Reverse)

**Decision:** Write to Odoo `x_studio_description` first, log to Supabase second

**Rationale:**
1. **Odoo is Canonical:** Only Odoo write changes operational state
2. **Supabase is Audit Log:** Version logging is secondary to canonical write
3. **Simplifies Failure Handling:** If Odoo fails, nothing written (clean abort)
4. **No Orphan Cleanup:** Never create version entry for failed Odoo write
5. **Aligns with Principle:** Single source of truth (Odoo), simple append log (Supabase)

**Previous Pattern (INCORRECT):**
```
Create Supabase version → Write to Odoo → Rollback version if Odoo fails
```

**Problems with Previous Pattern:**
- Creates orphaned versions if rollback fails
- Requires compensating transaction DELETE
- Adds complexity without benefit
- Violates "Supabase is not authoritative" principle

**Current Pattern (CORRECT):**
```
Write to Odoo → If success: Log to Supabase → If logging fails: Continue anyway
```

**Benefits:**
- No orphaned versions possible
- No rollback logic needed
- Clear ownership: Odoo controls state, Supabase observes
- Supabase failure is non-fatal (audit gap, not operational failure)

### 9.4 Why No Autosave

**Decision:** Require explicit "Save" button click (no autosave timer)

**Rationale:**
1. **Version Integrity:** Prevents noise in version history (too many micro-edits)
2. **Editorial Control:** User decides when description is "done"
3. **Reduces Odoo Load:** Fewer XML-RPC write calls
4. **Prevents Accidental Overwrites:** User must confirm save action
5. **Audit Trail Clarity:** Each version is deliberate save point
6. **Concurrency Friendly:** Reduces write_date conflicts from background saves

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
   - `createVersion(user_id, webinar_id, html_content, source_type, created_by)` (server-side only)
   - `listVersions(user_id, webinar_id)`
   - `restoreVersion(version_id)` → writes to Odoo
   - **No deleteVersion** (versions are immutable)

2. `src/modules/event-operations/form-templates.js`
   - `listTemplates(user_id)` → returns active templates
   - `getDefaultTemplate(user_id)` → returns template with default_flag=true
   - `createTemplate(user_id, template_data)` [admin only]
   - `updateTemplate(template_id, template_data)` [admin only]

3. `src/modules/event-operations/description-generator.js`
   - `generateDefault(webinar_metadata, form_template)` → returns HTML string
   - Template structure defined in function (not external file)

4. `src/modules/event-operations/concurrency-control.js`
   - `checkWriteDateConflict(webinar_id, editor_write_date)` → server-side check only
   - Returns conflict status or allows proceed

5. `src/modules/event-operations/html-sanitizer.js`
   - `sanitizeHTML(html_content)` → DOMPurify-based sanitization
   - Whitelist enforcement
   - Returns clean HTML or throws validation error

**Extended Modules:**
1. `src/modules/event-operations/odoo-client.js`
   - Add `writeDescription(webinar_id, html_content)` method
   - Add `fetchWriteDate(webinar_id)` method for server-side concurrency check
   - Validate content length before write
   - Return `{ success, error, write_date }` object

2. `src/modules/event-operations/routes.js`
   - Extend with new routes (see above)
   - `/api/save-description` is the ONLY way to create versions
   - Client has no direct Supabase version INSERT access

2. `src/modules/event-operations/routes.js`
   - Add `GET /api/form-templates`
   - Add `POST /api/form-templates` (admin only)
   - Add `GET /api/description-versions/:webinar_id` (LIST versions only)
   - Add `PUT /api/save-description` (orchestrates concurrency + Odoo write + Supabase log)
   - Add `POST /api/restore-version/:version_id`
   - **Note:** No `POST /api/description-versions` route (versions created server-side only)

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
   - Add save workflow (calls `/api/save-description` only)
   - Add confirmation modals
   - Add toast notifications
   - **NO direct Supabase access** (all version operations via server routes)

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
   - Test save flow (Odoo write first, Supabase log second)
   - Test Supabase logging failure (non-fatal, save succeeds)
   - Test OUT_OF_SYNC local state update
   - Test concurrency conflict detection (write_date mismatch)

2. `calendar-workspace.test.js`
   - Test event rendering (color mapping)
   - Test detail panel update
   - Test status legend

**Manual Tests:**
1. FullCalendar rendering across browsers (Chrome, Firefox, Safari, Edge)
2. TipTap editor shortcode insertion
3. Version history diff view
4. Restore version confirmation flow
5. Save success when Odoo succeeds (even if Supabase logging fails)
6. Concurrency conflict modal (simulate concurrent Odoo update)

---

## 11. Validation Checklist

### 11.1 Pre-Implementation Validation

- [ ] Read Addendum A, B, C to confirm no architectural conflicts
- [ ] Review Implementation Master Plan phases 0-7 completion status
- [ ] **CRITICAL:** Verify Odoo user has write permission on `x_studio_description`
- [ ] **CRITICAL:** Verify Odoo exposes `write_date` field via XML-RPC read()
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
- [ ] Save button writes to Odoo first
- [ ] Odoo description updated after save
- [ ] Supabase version created after Odoo write
- [ ] Save succeeds even if Supabase logging fails (warning logged)
- [ ] OUT_OF_SYNC set locally (no sync API call)
- [ ] Concurrency check detects write_date mismatch
- [ ] Conflict modal shows when concurrent edit detected
- [ ] Toast notifications display success/error

### 11.4 Post-Phase 10 Validation (Version History)

- [ ] Version history modal shows all versions
- [ ] Diff view highlights changes correctly
- [ ] Restore version creates new version entry
- [ ] Restore sets local OUT_OF_SYNC state
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
- [ ] OUT_OF_SYNC set locally after description save (no sync call)
- [ ] Calendar colors reflect event status (published, draft, out_of_sync)
- [ ] Concurrency check prevents overwriting concurrent Odoo edits
- [ ] Conflict modal shown when write_date mismatch detected

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

## 14.1 Architectural Hardening Summary

This section explicitly documents the architectural corrections applied to eliminate ambiguity and harden security.

### 14.1.1 Save Orchestration: Server-Only Pattern

**Correction Applied:**

All save operations are orchestrated entirely server-side within `/api/save-description`.

**Previous Ambiguity:**
- Document suggested both `/api/save-description` and separate `/api/description-versions` routes
- Client's role in version creation was unclear

**Corrected Architecture:**

**Server Route:** `PUT /api/save-description`
- Receives: `{ html_content, editor_write_date, source_type }`
- Orchestrates: Validate → Sanitize → Concurrency Check → Odoo Write → Supabase Log
- Returns: `{ success, new_write_date, version_logged }`

**Server Route:** `GET /api/description-versions/:webinar_id`
- Purpose: LIST versions only
- No client INSERT capability

**Explicit Constraint:**

Client NEVER calls Supabase directly for version creation. All version logging happens server-side.

### 14.1.2 Concurrency Check: Server-Side Only

**Correction Applied:**

Concurrency check happens entirely inside server route. Client performs NO extra fetch.

**Previous Ambiguity:**
- Suggested client might fetch `write_date` before save

**Corrected Flow:**

1. **Editor Open:** Client fetches webinar, stores `write_date` in local state
2. **Save Request:** Client sends stored `write_date` with save request
3. **Server Check:** Server fetches current `write_date`, compares with request value
4. **Conflict Response:** Server returns conflict or proceeds with write
5. **Client Update:** Client updates stored `write_date` with response value

Client makes ONE request. Server performs concurrency check internally.

### 14.1.3 Version History Scope: Event-Scoped Audit Trail

**Correction Applied:**

Version history is event-scoped (all users see all versions), not user-scoped.

**Previous Inconsistency:**
- RLS suggested `auth.uid() = user_id` (user-scoped)
- Document called it "audit trail" (implies shared visibility)

**Corrected Model:**

**Chosen: Option A (Event-Scoped Audit Trail)**

**Rationale:**
- Odoo webinars are shared across organization
- Multiple users may edit same event over time
- Full audit trail requires visibility of all edits
- Matches Odoo's shared data model

**RLS Policy:**
- SELECT: `TRUE` (all authenticated users see all versions)
- INSERT: No RLS policy (server-side only via SERVICE_ROLE_KEY)
- UPDATE/DELETE: No policies (immutable)

**Trade-Off Accepted:**

All users can see who edited what. If per-user privacy required, this design must be reconsidered.

### 14.1.4 Source Type Enum: Explicit Definition

**Correction Applied:**

Explicitly defined `source_type` enum values in schema documentation.

**Previous Ambiguity:**
- Enum values mentioned but not formally defined

**Corrected Schema:**

**Column:** `source_type` (TEXT, NOT NULL)

**Allowed Values:**
1. `'generated'` - Default description generated from template
2. `'manual'` - User-edited content via TipTap editor
3. `'restored'` - Restored from previous version
4. `'forced_overwrite'` - Admin forced save despite concurrency conflict

**Enforcement:**

Application-level validation in `/api/save-description` (no database CHECK constraint).

### 14.1.5 Server-Side HTML Sanitization: Required

**Correction Applied:**

Added explicit server-side HTML sanitization step before Odoo write.

**Previous Gap:**
- Relied solely on TipTap client-side sanitization
- No server-side validation defined

**Corrected Architecture:**

**New Module:** `src/modules/event-operations/html-sanitizer.js`

**Sanitization Steps:**
1. Parse HTML structure (reject if malformed)
2. Whitelist allowed tags (h1-h6, p, strong, em, ul, ol, li, a, img, div, br, hr, blockquote)
3. Whitelist allowed attributes (href, src, alt, class, data-*)
4. Strip dangerous content (`<script>`, `<style>`, `javascript:` protocol, `on*` handlers)
5. Validate forminator blocks (regex match shortcode format)
6. Return sanitized HTML or throw error

**Implementation:** DOMPurify (isomorphic version)

**Placement:** Step 1 of `/api/save-description` flow (before concurrency check)

**Why Required:**

Client-side can be bypassed via DevTools. Server is last line of defense before Odoo.

### 14.1.6 OUT_OF_SYNC Local State: Edge Case Clarified

**Correction Applied:**

Explicitly documented edge case: Odoo write succeeds, Supabase logs, client crashes before state update.

**New Section:** 8.7 (Supabase Logging Failure + Client Crash)

**Scenario:**
1. Server saves description to Odoo (success)
2. Server logs version to Supabase (success)
3. Server returns success to client
4. Client crashes before setting `out_of_sync` state (e.g., browser crash, tab closed)

**Impact:**
- Canonical data correct (Odoo)
- Audit trail correct (Supabase)
- Client UI state stale (still shows old state)

**Recovery:**

Next manual sync reconciles state:
- State engine compares Odoo vs WP
- Detects mismatch
- Sets `computed_state = 'out_of_sync'`
- Calendar updates

**Accepted Eventual Consistency:**

This is acceptable:
- No data loss
- No user intervention required
- Next sync auto-corrects
- State engine is authoritative

### 14.1.7 Architectural Constraints Reaffirmed

**The following are UNCHANGED and non-negotiable:**

1. **Odoo is canonical** (Supabase is not authoritative)
2. **Unidirectional sync** (Odoo → WP only, no WordPress writeback)
3. **No distributed transactions** (no XA/2PC, no compensating deletes)
4. **Explicit save** (no autosave)
5. **Optimistic concurrency** (via `write_date`, not pessimistic locks)
6. **Best-effort audit log** (Supabase logging failures acceptable)
7. **Server-side orchestration** (client makes simple requests, server orchestrates)

---

## 15. Conclusion

Addendum D represents a significant architectural evolution of the Event Operations module, transforming it from a read-only view layer into a complete editorial workspace. By introducing the calendar workspace and description authoring layer, users gain:

1. **Visual Planning:** Industry-standard calendar interface for event scheduling context
2. **Editorial Control:** Rich text editing with WordPress-compatible HTML output
3. **Version Integrity:** Complete audit trail of all description changes (best-effort)
4. **Form Flexibility:** Registry-based template system for dynamic shortcode management
5. **State Clarity:** OUT_OF_SYNC visualization maintains awareness of publish state
6. **Concurrency Protection:** Optimistic locking prevents accidental overwrites

The architecture maintains strict adherence to existing principles:
- **Odoo as canonical source** (no parallel data storage)
- **Unidirectional sync** (Odoo → WP only)
- **User-scoped isolation** (RLS enforced)
- **No frameworks** (vanilla JS + controlled dependencies)
- **Backward compatible** (no breaking changes to existing data)
- **No distributed transactions** (Odoo first, Supabase second, no rollback)

**Critical Architectural Corrections Applied:**

1. **Save Flow Order:** Odoo write first (canonical), Supabase log second (audit)
2. **No Rollback Logic:** Supabase failure does not invalidate Odoo write
3. **OUT_OF_SYNC Optimization:** Set locally after save, no sync API call required
4. **Concurrency Control:** Optimistic locking via Odoo `write_date` field
5. **Version History Clarity:** Best-effort logging, not authoritative, not used in state engine

All failure scenarios have defined handling procedures (no rollback deletes), and all edge cases have explicit acceptance criteria. The addendum is ready for phased implementation with clear validation criteria and success metrics.

**Status:** Ready for Implementation  
**Next Step:** Phase 8 Implementation (Calendar Workspace UI)  
**Estimated Completion:** 24-34 hours total implementation time

**Key Risks Mitigated:**
- Concurrent edit overwrites prevented by write_date check
- Odoo unavailability blocks saves (expected behavior, Odoo is canonical)
- Supabase unavailability does NOT block saves (audit gap acceptable)
- State engine remains simple (Odoo vs WP only, no 3-way comparison)
