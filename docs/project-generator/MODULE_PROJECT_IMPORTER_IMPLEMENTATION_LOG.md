# MODULE PROJECT IMPORTER IMPLEMENTATION LOG

**Module Code:** `project_generator`  
**Module Name:** Project Generator  
**Implementation Period:** January 28, 2026  
**Status:** Production Ready  
**Platform:** Cloudflare Workers + Supabase PostgreSQL + Pure Vanilla JavaScript

---

## 1. Module Overview

### Purpose

The Project Generator module enables users to define reusable project blueprints and generate Odoo projects from those blueprints via a web interface. The module provides template management, blueprint editing, and one-way synchronization to Odoo.

### Problem Solved

Organizations using Odoo for project management repeatedly create projects with similar structures. Without templates, users must manually recreate stages, tasks, subtasks, milestones, and dependencies for each new project. This module eliminates repetitive work by allowing users to define project structure once and generate multiple Odoo projects from the same blueprint.

### What It Does

1. **Template Management**
   - Create, read, update, delete project templates
   - Store templates in Supabase with user-scoped isolation
   - Provide web UI for template CRUD operations

2. **Blueprint Editing**
   - Define project structure: stages, milestones, tasks, subtasks, dependencies
   - Client-side validation preventing circular dependencies and orphan tasks
   - Modal-based editing with DOM API rendering

3. **Odoo Project Generation**
   - Transform blueprint into Odoo entities via XML-RPC API
   - Sequential creation: project → stages → tags → tasks → dependencies
   - Return Odoo project URL for immediate access

4. **Generation Lifecycle Tracking**
   - Record all generation attempts with status (pending, in_progress, completed, failed)
   - Prevent concurrent generations per template
   - Store error details for failed generations
   - Provide generation history UI

5. **Post-Generation Feedback**
   - Modal-based success/failure/blocked notifications
   - Direct links to generated Odoo projects
   - Retry mechanisms with conflict resolution
   - Manual cleanup guidance for partial failures

### What It Does Not Do

The following are explicit non-goals:

- Does not import existing Odoo projects (one-way: blueprint → Odoo only)
- Does not synchronize changes after generation (no bidirectional sync)
- Does not roll back partial Odoo projects on failure (manual cleanup required)
- Does not assign users to tasks (all tasks created unassigned)
- Does not support task descriptions, estimated hours, or deadlines
- Does not provide real-time progress updates during generation
- Does not support batch generation or scheduled generation
- Does not modify blueprint schema based on Odoo responses

---

## 2. High-Level Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT LAYER (Browser)                                       │
│ - project-generator-client.js (vanilla JavaScript)          │
│ - DOM APIs only (createElement, textContent, appendChild)   │
│ - DaisyUI components, Lucide icons                         │
│ - No frameworks, no template literals for dynamic content   │
└─────────────────────────────────────────────────────────────┘
                              ↑ FETCH API
┌─────────────────────────────────────────────────────────────┐
│ SERVER LAYER (Cloudflare Workers)                           │
│ - module.js: Route handlers, HTTP request/response          │
│ - ui.js: Static HTML shells (no dynamic logic)             │
│ - generation-lifecycle.js: Generation state management      │
│ - generate.js: Odoo generation orchestrator                │
│ - odoo-creator.js: Low-level Odoo API wrapper              │
│ - library.js: Data access layer (Supabase queries)         │
│ - editor.js: Blueprint helpers (UUID, defaults)            │
│ - validation.js: Blueprint validation logic                │
└─────────────────────────────────────────────────────────────┘
                              ↑ SUPABASE CLIENT / ODOO XML-RPC
┌─────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                   │
│ - Supabase PostgreSQL                                       │
│   - project_templates table                                 │
│   - project_generations table                               │
│   - RLS policies (user-scoped)                             │
│ - Odoo Server (external)                                   │
│   - project.project, project.task.type, project.task, etc. │
└─────────────────────────────────────────────────────────────┘
```

### Separation of Concerns

**Client Layer Responsibilities:**
- DOM manipulation for all dynamic content
- Event handling (clicks, form submissions)
- API calls to server routes
- Modal lifecycle (show, hide, cleanup)
- Client-side validation feedback
- Icon rendering (Lucide)

**Server Layer Responsibilities:**
- HTTP routing and authentication
- Blueprint validation (server-side)
- Odoo API communication
- Generation lifecycle state transitions
- Error translation to HTTP status codes
- Static HTML shell generation

**Data Layer Responsibilities:**
- Persistent storage (templates, generations)
- User-scoped data isolation via RLS
- Audit trail (generation attempts, errors)
- No business logic in database

### Key Architectural Constraints

1. **No Inline JavaScript in Server Templates**
   - Server-side `ui.js` returns static HTML only
   - All dynamic logic in external `project-generator-client.js`
   - No nested template literals, no backtick escaping

2. **No Template Literals for Dynamic UI**
   - Client-side HTML generation uses DOM APIs exclusively
   - `createElement`, `textContent`, `appendChild` pattern
   - Zero use of `innerHTML` with user data

3. **No Frameworks**
   - Pure vanilla JavaScript (ES6+)
   - No React, Vue, Angular, Svelte, etc.
   - DaisyUI for CSS components (no JS framework)

4. **User-Scoped Data**
   - All database queries filter by `user_id`
   - RLS enforced at database level
   - No cross-user data leakage

5. **No Foreign Keys**
   - Matches baseline pattern across all tables
   - Application-enforced relationships
   - Prevents cascade deletion issues

---

## 3. Database Schema

### Tables

#### project_templates

**Purpose:** Store user-created project blueprints

**Columns:**
- `id` (UUID, PK) - Template identifier
- `user_id` (UUID, NOT NULL) - Owner user ID (application-enforced, no FK)
- `name` (TEXT, NOT NULL, CHECK > 0) - Template name
- `description` (TEXT, NULL) - Template description
- `blueprint_data` (JSONB, NOT NULL) - Blueprint structure
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

**Indexes:**
- `idx_project_templates_user_id` on `user_id`

**Triggers:**
- `project_templates_updated_at` - Auto-update `updated_at` on row update

**RLS Policies:**
- `Users can view own templates` (SELECT)
- `Users can create own templates` (INSERT)
- `Users can update own templates` (UPDATE)
- `Users can delete own templates` (DELETE)

All policies use `auth.uid() = user_id` filter and target `TO public`.

#### project_generations

**Purpose:** Track Odoo project generation attempts and results

**Columns:**
- `id` (UUID, PK) - Generation record identifier
- `user_id` (UUID, NOT NULL) - Owner user ID (application-enforced, no FK)
- `template_id` (UUID, NOT NULL) - Source template ID (application-enforced, no FK)
- `status` (TEXT, NOT NULL, CHECK IN pending/in_progress/completed/failed) - Generation state
- `odoo_project_id` (INTEGER, NULL) - Created Odoo project.project ID
- `odoo_project_url` (TEXT, NULL) - Direct link to Odoo project
- `generation_model` (JSONB, NOT NULL) - Canonical model snapshot
- `odoo_mappings` (JSONB, DEFAULT {}) - Blueprint UUID to Odoo ID mappings
- `error_message` (TEXT, NULL) - Error details for failed generations
- `failed_step` (TEXT, NULL) - Step identifier where generation failed
- `started_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Generation start time
- `completed_at` (TIMESTAMPTZ, NULL) - Generation completion time
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Record creation time

**Indexes:**
- `idx_project_generations_user_id` on `user_id`
- `idx_project_generations_template_id` on `template_id`
- `idx_project_generations_status` on `status`
- `idx_project_generations_user_template` on `(user_id, template_id)`

**RLS Policies:**
- `Users can view own generations` (SELECT)
- `Users can create own generations` (INSERT)
- `Users can update own generations` (UPDATE)
- `Users can delete own generations` (DELETE)

All policies use `auth.uid() = user_id` filter and target `TO public`.

### RLS Strategy

**Enforcement Level:** Database and application

**Pattern:** User-scoped isolation via `auth.uid() = user_id`

**Implementation:**
- Supabase client uses SERVICE_ROLE_KEY (bypasses RLS)
- Application explicitly filters by `user_id` in all queries (defensive)
- RLS policies provide defense-in-depth if application logic bypassed

**Rationale:**
- Defense-in-depth security
- Consistent with existing platform patterns
- No cross-user data leakage even if application bugs exist

### Why No Foreign Keys

**Baseline Pattern:** All existing tables (`users`, `modules`, `user_modules`, `user_roles`) have no foreign keys on user references.

**Reasons:**
1. Prevents cascade deletion issues
2. Simplifies migrations
3. Application-enforced relationships more flexible
4. Matches established codebase conventions

**Tradeoff Accepted:** Database cannot enforce referential integrity. Application must validate references.

### Logged Data

**project_templates table logs:**
- All blueprint edits (stored in `blueprint_data` JSONB)
- Template metadata changes (name, description)
- Creation and modification timestamps

**project_generations table logs:**
- Every generation attempt (regardless of outcome)
- Full canonical model snapshot (audit trail)
- Odoo entity mappings (blueprint UUID → Odoo ID)
- Error messages and failed step identifiers
- Generation duration (started_at → completed_at)
- Partial project IDs (for manual cleanup)

**Not logged:**
- User actions within blueprint editor (only final save)
- Intermediate generation states (only start, complete, fail)
- Odoo API response bodies (only IDs and URLs)

---

## 4. Blueprint → Generation → Odoo Flow

### Step-by-Step Data Flow

#### Phase 1: Blueprint Editor (Client-Side)

**User Actions:**
1. User clicks "Edit Blueprint" on template
2. Client loads template via `GET /api/blueprint/:id`
3. Client renders blueprint editor using DOM APIs
4. User adds/edits stages, milestones, tasks, dependencies
5. Client runs validation (errors block save, warnings allow save)
6. User clicks "Save Blueprint"
7. Client sends `PUT /api/blueprint/:id` with blueprint data
8. Server validates and updates `project_templates.blueprint_data`

**Blueprint Data Structure:**
```json
{
  "stages": [
    { "id": "uuid", "name": "To Do", "sequence": 1 }
  ],
  "milestones": [
    { "id": "uuid", "name": "Phase 1" }
  ],
  "tasks": [
    {
      "id": "uuid",
      "name": "Main Task",
      "milestone_id": "uuid | null",
      "parent_id": "uuid | null"
    }
  ],
  "dependencies": [
    {
      "task_id": "uuid",
      "depends_on_task_id": "uuid"
    }
  ]
}
```

**Validation Rules (Hard Errors):**
- Parent task must have at least one subtask
- No circular dependencies
- Dependencies must reference existing tasks
- Subtasks must reference existing parent tasks
- No duplicate IDs or sequences

**Validation Rules (Warnings):**
- Tasks without milestones
- Milestones without tasks
- Stages defined but no tasks use them

**Guaranteed State After Save:**
- Blueprint structure is valid
- All UUIDs are unique within blueprint
- Dependency graph is acyclic
- Parent-child relationships are valid

#### Phase 2: Generation Initiation (Server-Side)

**User Actions:**
1. User clicks "Generate Project" on template
2. Client confirms via browser `confirm()` dialog
3. Client sends `POST /api/generate/:id` (optional: `{ confirmOverwrite: true }`)

**Server Lifecycle Check:**
1. Load template metadata
2. Query latest generation for template (`getLatestGeneration`)
3. If status = `in_progress`: Return 409 Conflict (block)
4. If status = `completed` and `!confirmOverwrite`: Return 409 Conflict (soft block)
5. If status = `failed` or `confirmOverwrite`: Proceed

**Guaranteed State Before Generation:**
- Template exists and user owns it
- No concurrent generation in progress
- User explicitly confirmed if overwriting completed generation

#### Phase 3: Canonical Model Build (Server-Side)

**Process:**
1. Re-validate blueprint server-side (fail-fast if invalid)
2. Build canonical generation model from blueprint
3. Compute task generation order (parents before children)
4. Flatten dependencies into arrays
5. Create generation record with status = `in_progress`

**Canonical Generation Model Structure:**
```json
{
  "metadata": {
    "template_id": "uuid",
    "template_name": "string",
    "generated_at": "ISO 8601",
    "user_id": "uuid"
  },
  "project": {
    "name": "Template Name (2026-01-28T15-30-00)",
    "description": "string | null"
  },
  "stages": [
    {
      "blueprint_id": "uuid",
      "name": "string",
      "sequence": 1,
      "odoo_id": null
    }
  ],
  "tasks": [
    {
      "blueprint_id": "uuid",
      "name": "string",
      "milestone_name": "string | null",
      "parent_blueprint_id": "uuid | null",
      "stage_blueprint_id": "uuid | null",
      "dependencies": ["blueprint_id"],
      "odoo_id": null,
      "generation_order": 1
    }
  ]
}
```

**Key Transformations:**
- Milestones extracted into unique names (for tag creation)
- Milestone references stored directly on tasks (no separate milestone entity)
- Tasks flattened with explicit `generation_order` field
- Stages remain ordered array by `sequence`

**Guaranteed State After Model Build:**
- Model is serializable (stored in `generation_model` column)
- Task generation order is deterministic
- All blueprint IDs are preserved for mapping

#### Phase 4: Odoo Project Creation (Server-Side)

**Sequential Execution Steps:**

**STEP 1: Re-validate**
- Re-run server-side validation
- ABORT if validation fails

**STEP 2: Build model**
- Already complete (see Phase 3)

**STEP 3: Create project** (FAIL-FAST)
- Call `createProject(env, name, description)`
- Odoo model: `project.project`
- Store `odoo_project_id` in generation record
- Build `odoo_project_url` for direct link
- ABORT on failure

**STEP 4: Create stages** (FAIL-FAST)
- For each stage (ordered by sequence):
  - Call `createStage(env, name, sequence, projectId)`
  - Odoo model: `project.task.type`
  - Link to project via `project_ids` many2many
  - Store mapping: `odoo_mappings.stages[blueprint_id] = odoo_id`
- ABORT if any stage creation fails

**STEP 5: Create milestone tags** (FAIL-SOFT)
- Extract unique milestone names from tasks
- For each milestone:
  - Call `createTag(env, name)`
  - Odoo model: `project.tags`
  - Store mapping: `odoo_mappings.tags[milestone_name] = odoo_id`
- CONTINUE on failure (non-critical)

**STEP 6: Create tasks** (FAIL-FAST)
- Sort tasks by `generation_order` (parents first)
- For each task:
  - Resolve parent_id from blueprint UUID to Odoo ID (if subtask)
  - Resolve milestone tag ID from milestone name (if assigned)
  - Resolve stage ID from blueprint UUID (default: first stage)
  - Call `createTask(env, name, projectId, stageId, parentId, tagIds)`
  - Odoo model: `project.task`
  - Store mapping: `odoo_mappings.tasks[blueprint_id] = odoo_id`
- ABORT if any task creation fails

**STEP 7: Add dependencies** (FAIL-SOFT)
- For each task with dependencies:
  - Resolve blueprint IDs to Odoo IDs
  - Call `addTaskDependencies(env, taskId, dependencyIds)`
  - Update `depend_on_ids` many2many field
- LOG on failure but CONTINUE (optional feature)

**STEP 8: Finalize**
- Update generation record: status = `completed`, completed_at = NOW()
- Return success result

**Odoo Field Mappings:**

| Odoo Model | Fields Set | Source |
|------------|-----------|---------|
| project.project | name, description | Template name + timestamp, template description |
| project.task.type | name, sequence, project_ids | Blueprint stage name/sequence, linked to project |
| project.tags | name | Blueprint milestone name |
| project.task | name, project_id, stage_id, parent_id, tag_ids | Blueprint task, resolved stage, parent, milestone |
| project.task | depend_on_ids | Blueprint dependencies (resolved) |

**Fields NOT Set:**
- Task descriptions (not in blueprint schema)
- User assignments (not in blueprint schema)
- Estimated hours (not in blueprint schema)
- Deadlines (not in blueprint schema)
- Custom fields (no Odoo model extension)

**Guaranteed State After Success:**
- Odoo project exists with all stages
- All tasks exist (parents created before children)
- Tasks linked to correct parent (if subtask)
- Tasks tagged with milestone (if assigned)
- Dependencies created (if no errors in STEP 7)
- Generation record status = `completed`
- All Odoo IDs stored in `odoo_mappings`

**Guaranteed State After Failure:**
- Generation record status = `failed`
- `failed_step` identifies exact step (e.g., "4-create-stages")
- `error_message` contains Odoo API error
- `odoo_project_id` may be set (if project created before failure)
- `odoo_mappings` contains entities created before failure
- Partial Odoo project may exist (user must delete manually)

#### Phase 5: Post-Generation Feedback (Client-Side)

**Success Flow:**
1. Server returns 200 OK with `{ success: true, odoo_project_url, ... }`
2. Client shows success modal with check-circle icon
3. Modal displays:
   - Success message
   - "View project in Odoo" button (primary action, opens new tab)
   - "View generation history" link (secondary action)
4. User clicks action or dismisses modal

**Failure Flow:**
1. Server returns 500 or 200 with `{ success: false, step, error, ... }`
2. Client shows failure modal with x-circle icon
3. Modal displays:
   - Failure message
   - Failed step identifier
   - Error message from Odoo
   - Manual cleanup warning (if `odoo_project_id` present)
   - "Retry generation" button (primary action)
   - "View generation history" link (secondary action)
4. User can retry or view history

**Blocked Flow (Concurrent/Duplicate):**
1. Server returns 409 Conflict with `{ success: false, blocking_status, ... }`
2. Client determines blocking reason: `in_progress` or `completed`
3. Modal displays context-specific message:
   - `in_progress`: "Generation already in progress" (no retry option)
   - `completed`: "Project already generated" (retry with override option)
4. Modal actions:
   - "Generate again" button (only if `completed`, passes `confirmOverwrite: true`)
   - "View generation history" link (always available)

**Guaranteed State After Feedback:**
- User knows generation outcome
- User has direct link to Odoo project (if successful)
- User understands cleanup requirement (if failed with partial project)
- User can view full generation history
- User can retry (with appropriate warnings)

---

## 5. Generation Lifecycle & Safety

### Status Model

**States:**
- `pending` - Record created, generation not started (unused in current implementation)
- `in_progress` - Generation API calls executing
- `completed` - Generation finished successfully
- `failed` - Generation aborted due to error

**Transitions:**
```
[CREATE] → in_progress → completed
                      → failed
```

**State Persistence:**
- All states persisted in `project_generations.status`
- Timestamps: `started_at`, `completed_at`
- No pending state used (record created directly as `in_progress`)

### Double-Generation Prevention

**Rule 1: HARD BLOCK on in_progress**
- HTTP Status: 409 Conflict
- Message: "Generation already in progress for this template"
- No override available
- Prevents concurrent Odoo API calls to same template
- User must wait for completion or manually mark failed

**Rule 2: SOFT BLOCK on completed**
- HTTP Status: 409 Conflict (without `confirmOverwrite`)
- Message: "Template already generated. Set confirmOverwrite=true to generate again."
- Override available via `confirmOverwrite: true` in request body
- Prevents accidental duplicate projects
- User can intentionally create multiple projects from same template

**Rule 3: ALLOW RETRY on failed**
- HTTP Status: 200 OK
- New generation record created
- Previous failed record remains for audit
- User can retry immediately without confirmation

**Implementation:**
```javascript
// In generation-lifecycle.js
const latest = await getLatestGeneration(env, userId, templateId);

if (latest && latest.status === 'in_progress') {
  return { blocked: true, reason: 'in_progress', existingGeneration: latest };
}

if (latest && latest.status === 'completed' && !confirmOverwrite) {
  return { blocked: true, reason: 'completed', existingGeneration: latest };
}

// Proceed with generation
```

### Retry Rules

**User-Initiated Retry:**
- Failed generations: Retry without confirmation
- Completed generations: Retry with `confirmOverwrite: true`
- In-progress generations: No retry (blocked)

**Automatic Retry:**
- Not implemented
- No background job processing
- No retry queue
- User must manually trigger retry

**Retry Behavior:**
- New generation record created
- Previous records remain (audit trail)
- No resume from failed step (starts from beginning)

### Why No Rollback

**Technical Limitations:**
1. Odoo XML-RPC API has no transaction support
2. Entities created in separate API calls
3. Delete operations may cascade unpredictably
4. Risk of orphaned data in Odoo

**Design Decision:**
- Favor transparency over automation
- User sees exactly what exists in Odoo
- User controls cleanup strategy
- Manual cleanup safer than automated rollback

**Failure Handling:**
- Generation record shows `odoo_project_id` if created
- `odoo_mappings` shows all entities created before failure
- User can navigate to Odoo and delete project manually
- Generation history shows partial creation details

### User Actions on Failure

**If Generation Fails:**
1. Review generation history
2. Identify failed step and error message
3. Navigate to Odoo (use `odoo_project_url` if available)
4. Manually delete partial project in Odoo
5. Fix issue (e.g., check Odoo permissions, network)
6. Retry generation from template library

**If Partial Project Exists:**
- `odoo_project_id` is set in failed record
- `odoo_project_url` links directly to partial project
- `odoo_mappings` shows which entities were created
- User must delete project.project in Odoo (may cascade tasks/stages)

**No Automated Cleanup:**
- Application does not call Odoo delete APIs
- Application does not track cleanup status
- User responsible for Odoo data hygiene

---

## 6. UI & User Experience

### Blueprint Editor

**URL:** `/projects/blueprint/:id`

**Layout:**
- Four sections: Stages, Milestones, Tasks & Subtasks, Dependencies
- Each section has Add/Edit/Delete modal-based interactions
- Validation errors/warnings displayed above Save button
- Save/Cancel buttons (Cancel reverts to last saved state)

**Editing Pattern:**
- Click Add button → Modal opens with empty form
- Fill form → Click Save in modal → Entity added to blueprint state
- Click Edit on entity → Modal opens pre-filled → Modify → Save
- Click Delete on entity → Browser confirm → Entity removed

**Validation Feedback:**
- Real-time validation on Save button click
- Errors displayed in red alert box (blocks save)
- Warnings displayed in yellow alert box (allows save)
- Validation runs client-side and server-side (re-validated on save API call)

**Visual Indicators:**
- Stages show sequence badges and up/down arrows for reordering
- Tasks show milestone badges (if assigned)
- Subtasks visually indented with left border
- Dependencies shown as text list with task names

**Technical Implementation:**
- All rendering via DOM APIs (createElement, textContent, appendChild)
- No template literals for dynamic content
- No innerHTML with user data
- Lucide icons via data-lucide attributes

**User Cannot:**
- Drag and drop entities (uses buttons for reordering)
- Undo/redo changes (only full revert via Cancel)
- See visual dependency graph (text list only)
- Edit multiple blueprints simultaneously (one editor per template)

### Template Library

**URL:** `/projects` (module default route)

**Features:**
- Table view of all user templates
- Columns: Name, Description, Updated, Actions
- Empty state when no templates exist
- Loading spinner during data fetch

**Actions Per Template:**
- Generate Project (primary button, play icon)
- View History (secondary button, history icon)
- Edit Blueprint (secondary button, edit icon)
- Edit Template (ghost button, pencil icon)
- Delete Template (ghost button, trash icon)

**Create Template Flow:**
1. Click "Create Template" button
2. Modal opens with name/description form
3. Submit → API creates template with empty blueprint
4. Table refreshes with new template
5. User clicks "Edit Blueprint" to define structure

**Generate Project Flow:**
1. Click "Generate Project" button
2. Browser confirm dialog
3. Loading toast appears
4. Success modal or failure modal or blocked modal
5. User takes action from modal

### Generation History UI

**URL:** `/projects/generations/:id`

**Features:**
- Read-only table view of all generation attempts for template
- Columns: Status, Started, Duration, Result
- Ordered by started_at DESC (newest first)
- Back button to template library

**Status Badges:**
- Completed: Green badge with check-circle icon
- Failed: Red badge with x-circle icon
- In Progress: Yellow badge with loader icon
- Pending: Gray badge with clock icon

**Result Column:**
- Completed: Link to Odoo project (opens in new tab, noopener)
- Failed: Failed step + error message + cleanup note
- In Progress: Loading spinner text
- Other: Dash

**Empty State:**
- Message: "No generations yet"
- Explanation: "History will appear after first generation"

**User Cannot:**
- Retry generation from history (must go to template library)
- Delete generation records
- Edit generation records
- Cancel in-progress generation

### Success/Failure/Blocked Modals

**Success Modal:**
- Icon: Large green check-circle
- Message: "Project generated successfully!"
- Primary action: "View project in Odoo" (button, opens new tab)
- Secondary action: "View generation history" (button, navigates to history)
- Dismissible via X button or backdrop click

**Failure Modal:**
- Icon: Large red x-circle
- Message: "Project generation failed"
- Details: Failed step identifier, error message
- Warning: Manual cleanup note (if partial project created)
- Primary action: "Retry generation" (button, calls generateProjectFromTemplate again)
- Secondary action: "View generation history" (button, navigates to history)
- Dismissible via X button or backdrop click

**Blocked Modal (In Progress):**
- Icon: Large yellow alert-circle
- Message: "Generation already in progress"
- Explanation: "Please wait for completion or check generation history"
- Action: "View generation history" (button, navigates to history)
- No retry button (cannot override in_progress)
- Dismissible via X button or backdrop click

**Blocked Modal (Completed):**
- Icon: Large yellow alert-circle
- Message: "Project already generated"
- Explanation: "This template has already been used. You can generate a new project (creates separate Odoo project)."
- Primary action: "Generate again" (button, retries with confirmOverwrite)
- Secondary action: "View generation history" (button, navigates to history)
- Dismissible via X button or backdrop click

**Modal Implementation:**
- Created via `createGenerationModal(type)` factory function
- Populated with DOM API-generated content
- Appended to document.body
- Opened with native `modal.showModal()` API
- Closed with `closeGenerationModal()` (removes from DOM after 300ms)

**User Cannot:**
- Dismiss modal during generation (loading toast, not modal)
- Modify generation settings from modal
- View generation details from modal (must go to history)

### What User Can Always Do

1. Create unlimited templates
2. Edit blueprints without limit (save validates, warnings allow save)
3. Generate multiple projects from same template (with confirmation)
4. View all generation attempts in history
5. Retry failed generations immediately
6. Delete templates (does not affect generated Odoo projects or generation records)

### What User Cannot Do

1. Import existing Odoo projects
2. Synchronize blueprint changes to existing Odoo projects
3. Cancel in-progress generation
4. Resume failed generation from last step
5. Automatically clean up partial Odoo projects
6. Schedule generation or batch generate
7. Receive notifications when generation completes

---

## 7. Error Handling & Observability

### Errors Logged to Database

**project_generations table captures:**
- All generation attempts (success, failure, in-progress)
- Failed step identifier (e.g., "4-create-stages", "6-create-tasks")
- Full error message from Odoo API or application
- Partial Odoo project ID (if created before failure)
- Odoo entity mappings (blueprint UUID → Odoo ID for entities created before failure)
- Generation model snapshot (full canonical model for audit)
- Timestamps (started_at, completed_at)
- User ID and template ID (for filtering)

**Example failed record:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "template_id": "uuid",
  "status": "failed",
  "failed_step": "4-create-stages",
  "error_message": "Odoo RPC error: Invalid stage name",
  "odoo_project_id": 123,
  "odoo_project_url": "https://mymmo.odoo.com/web#id=123...",
  "odoo_mappings": {
    "stages": {},
    "tasks": {}
  },
  "generation_model": { },
  "started_at": "2026-01-28T15:00:00Z",
  "completed_at": "2026-01-28T15:01:15Z"
}
```

### Errors Visible to Users

**Generation History UI:**
- Failed generation rows show:
  - Red "Failed" badge
  - Failed step identifier
  - Error message text
  - Cleanup reminder
- All generation attempts visible (no filtering)
- Ordered newest first

**Failure Modal:**
- Displays failed step
- Displays error message
- Shows cleanup warning if partial project created
- Provides retry button

**Toast Notifications:**
- Network errors during generation
- Validation errors before generation starts
- Loading state during generation

**Browser Console:**
- Server errors logged via console.error
- Network errors logged by fetch API
- Validation errors logged during development

### Persistent Audit Data

**Immutable Records:**
- All generation attempts logged (never deleted)
- Generation model snapshots preserved
- Odoo mappings preserved (for debugging)
- Error messages preserved (for pattern analysis)

**Queryable Data:**
- Filter by user, template, status
- Order by timestamp
- Indexed for performance

**Use Cases:**
- Incident review: "What went wrong in generation X?"
- Pattern analysis: "Which step fails most often?"
- User support: "Show me all failed generations for user Y"
- Compliance: "Prove generation happened at time Z"

### What Is NOT Logged

**Not Persisted:**
- User actions within blueprint editor (only final save)
- Intermediate generation states (only start, complete, fail)
- Odoo API request/response bodies (only IDs and URLs)
- Validation warnings (only errors that block save)
- Client-side JavaScript errors (no telemetry)

**Why Not Logged:**
- Blueprint edits: Performance and storage concerns
- Intermediate states: Adds complexity without value
- API bodies: Privacy and storage concerns
- Warnings: Not actionable failures
- Client errors: No telemetry infrastructure

**Tradeoff Accepted:**
- Cannot replay exact user session
- Cannot debug client-side issues without reproduction
- Cannot analyze partial Odoo API responses

### Observability Limitations

**No Real-Time Monitoring:**
- No progress updates during generation
- No WebSocket or SSE for status updates
- User sees loading spinner until completion

**No Aggregated Metrics:**
- No success rate dashboard
- No average generation duration tracking
- No error frequency analysis

**No Alerting:**
- No email notifications on failure
- No webhook integrations
- No Slack/Teams notifications

**Rationale:**
- Scope limitation for initial implementation
- Simple synchronous request/response model
- User-initiated monitoring via history UI

---

## 8. Explicit Non-Goals

The following features were explicitly excluded from implementation scope:

### Bidirectional Synchronization
- Importing existing Odoo projects into blueprints
- Detecting changes in Odoo projects after generation
- Updating blueprints based on Odoo modifications
- Syncing blueprint changes to existing Odoo projects

### Automatic Cleanup
- Rolling back partial Odoo projects on failure
- Deleting Odoo entities created before error
- Cascading blueprint deletes to generated projects
- Orphaned project detection

### Advanced Generation Features
- Resume failed generation from last successful step
- Dry-run mode (preview without creating)
- Batch generation (multiple projects from one template)
- Scheduled/automated generation
- Background job processing

### Progress Indicators
- Real-time progress updates during generation
- Step-by-step completion feedback
- Percentage completion tracking
- WebSocket or SSE for live updates

### Rich Task Features
- Task descriptions in blueprint schema
- User assignments to tasks
- Estimated hours per task
- Task deadlines or due dates
- Task priorities or severity levels
- Custom fields in Odoo models

### Odoo Model Extensions
- Custom Odoo models beyond standard fields
- Native milestone model creation
- Custom stage assignment per task
- Workflow state machines
- Approval processes

### Notifications
- Email notifications on generation complete/fail
- Webhook integrations
- Slack/Teams/Discord notifications
- In-app notification center

### Analytics
- Success rate dashboards
- Generation duration metrics
- Error frequency analysis
- Template popularity tracking
- User activity reports

### Collaboration
- Sharing templates between users
- Template marketplace or library
- Template versioning
- Multi-user blueprint editing
- Change approval workflows

### Mobile Support
- Native mobile apps
- Mobile-optimized UI
- Touch-friendly interactions
- Offline mode

### API Integrations Beyond Odoo
- Jira, Asana, Monday.com imports
- Export to other project management tools
- Calendar integrations
- Time tracking integrations

---

## 9. Current State Summary

### Production Ready Components

**Database:**
- `project_templates` table with RLS policies
- `project_generations` table with RLS policies
- Indexes on user_id, template_id, status
- Migrations applied to production Supabase instance

**Server-Side Code:**
- All routes implemented and tested
- Generation orchestrator handles 7-step Odoo creation
- Lifecycle tracking prevents concurrent generations
- Error handling with appropriate HTTP status codes
- Static HTML shells for all UI screens

**Client-Side Code:**
- Template library CRUD operations
- Blueprint editor with full validation
- Generation history UI with status badges
- Success/failure/blocked modals with actions
- All rendering via DOM APIs (XSS-safe)

**Odoo Integration:**
- XML-RPC API wrapper for all required models
- Sequential entity creation (project, stages, tags, tasks, dependencies)
- Proper field mappings (parent_id, tag_ids, depend_on_ids)
- Error handling with failed step identification

**User Experience:**
- Complete template management workflow
- Blueprint editing with real-time validation
- One-click project generation
- Post-generation feedback with retry capability
- Generation history for audit and debugging

### No Further Action Required

**Functionality:**
- All planned features implemented
- All validation rules enforced
- All error paths handled
- All user feedback mechanisms in place

**Architecture:**
- Strict separation of concerns maintained
- No inline JavaScript in server templates
- No template literals for dynamic UI
- No frameworks introduced
- RLS policies enforced

**Documentation:**
- Implementation details recorded
- Design rationale documented
- Error handling patterns established
- User workflows defined

### Future Extension Points

The following areas can be extended without redesign:

**Blueprint Schema:**
- Add task description field (requires Odoo mapping update)
- Add estimated hours field (requires Odoo mapping update)
- Add deadline field (requires Odoo mapping update)
- Current schema is extensible (JSONB column)

**Generation Lifecycle:**
- Add progress streaming (requires WebSocket or SSE)
- Add resume capability (requires step checkpointing)
- Add dry-run mode (requires generation simulation)
- Current state machine supports new states

**Odoo Mappings:**
- Add user assignment mapping (requires user lookup)
- Add stage-per-task assignment (requires stage field in blueprint)
- Add custom field mappings (requires Odoo model extension)
- Current mapper is extensible (new fields in canonical model)

**UI Features:**
- Add drag-and-drop reordering (requires library like SortableJS)
- Add visual dependency graph (requires graph rendering library)
- Add template sharing (requires new RLS policies)
- Current DOM API pattern supports new features

**Observability:**
- Add metrics aggregation (requires new table or analytics service)
- Add email notifications (requires email service integration)
- Add webhook support (requires new table for webhook config)
- Current event points are hookable (lifecycle transitions)

**No Breaking Changes Required:**
- Database schema is additive (new columns, new tables)
- API is versioned (routes can be duplicated for v2)
- Blueprint schema is versioned (JSONB supports migration)
- UI is component-based (new features are isolated)

### System Is Complete For

1. Creating reusable project templates
2. Defining complex project structures (stages, tasks, subtasks, dependencies)
3. Generating Odoo projects from templates
4. Tracking generation attempts and outcomes
5. Providing user feedback on success/failure
6. Enabling retry and override workflows
7. Maintaining audit trail of all generations

### System Is NOT Complete For

1. Enterprise-scale usage (no rate limiting, no quotas)
2. Multi-tenant isolation beyond RLS (no organization model)
3. High-concurrency scenarios (no queue, no load balancing)
4. Advanced project management (no Gantt, no resource allocation)
5. Integration with non-Odoo systems

**Deployment Status:** Production-ready for single-organization, moderate-concurrency usage with manual Odoo cleanup on failures.

---

**END OF DOCUMENT**
