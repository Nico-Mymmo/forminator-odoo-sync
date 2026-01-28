# Project Generator - Complete System Documentation

## Executive Summary

The **Project Generator** module is an internal web application that serves as a design-time orchestration layer for Odoo Projects. It enables managers to design, template, and deploy complete project structures to Odoo with a single action, promoting organizational project discipline while maintaining full Odoo flexibility post-creation.

### Core Concept

```
Template (Design Layer) ──one-time push──> Odoo Project (Runtime Layer)
     ↑                                           ↓
  Reusable                                  Fully independent
  Versioned                                 No sync back
  Validated                                 100% Odoo-native
```

**Not a project management tool.** This is a project structure design and deployment tool. Actual project execution happens entirely in Odoo.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Conceptual Model](#conceptual-model)
3. [User Capabilities](#user-capabilities)
4. [Technical Architecture](#technical-architecture)
5. [User Experience Design](#user-experience-design)
6. [Data Model](#data-model)
7. [Integration Strategy](#integration-strategy)
8. [Security & Permissions](#security--permissions)
9. [Risks & Mitigations](#risks--mitigations)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Success Criteria](#success-criteria)

---

## System Overview

### Purpose

Organizations often create similar projects repeatedly (client onboarding, product launches, events). Each project setup is manual, error-prone, and inconsistent. The Project Generator solves this by:

1. **Capturing knowledge** in reusable templates
2. **Enforcing structure** without restricting creativity
3. **Reducing setup time** from 30+ minutes to seconds
4. **Improving consistency** across teams and projects

### Value Proposition

**For Managers:**
- Create project templates once, use many times
- Visual design tools (no technical skills needed)
- Confidence that project structure is correct
- Reduce onboarding time for new team members

**For Organizations:**
- Standardized processes encoded in templates
- Knowledge preservation (templates document workflows)
- Faster project delivery (eliminate setup friction)
- Measurable consistency across projects

### Scope

**In Scope:**
- Project blueprint design (kanban, milestones, tasks, dependencies)
- Template storage and versioning
- One-time project generation to Odoo
- Audit logging and usage analytics
- Template library management

**Out of Scope (Forever):**
- Bidirectional sync with Odoo
- Live editing of Odoo projects
- Scheduling (dates, deadlines, offsets)
- Resource allocation or time tracking
- Custom Odoo Studio integration
- BPMN workflow engine

---

## Conceptual Model

### Three-Layer Architecture

#### Layer 1: Blueprint (Design-Time)
**Nature:** Transient, in-memory design artifact  
**Location:** Browser JavaScript state  
**Lifetime:** Session-scoped  

A Blueprint is the active workspace where users design project structure. It contains:
- Kanban stage definitions (names, types, colors, order)
- Milestones with descriptions
- Tasks with milestone assignments and default stages
- Subtasks nested under tasks
- Task dependencies (which tasks must complete before others)
- Metadata (schema version, creation timestamp)

**Key Properties:**
- Not persisted until explicitly saved as Template
- Fully mutable, no constraints during design
- Validated on-demand (errors block save, warnings allow save)
- Can be discarded without consequence

**User Mental Model:** "Scratch pad for designing a project"

---

#### Layer 2: Template (Reusable Asset)
**Nature:** Persistent, versioned, governed artifact  
**Location:** Application database (Supabase)  
**Lifetime:** Permanent (until archived/deleted)  

A Template is a saved Blueprint that can be instantiated multiple times.

**Template Properties:**
- Unique ID, name, description
- Version number (semantic: major.minor.patch)
- Status (draft | published | archived)
- Locked flag (prevents editing)
- Blueprint data (JSON serialization of Blueprint)
- Ownership and timestamps
- Usage statistics (how many times used)

**Versioning:**
- Templates can evolve through multiple versions
- Only one version is "published" (current) at a time
- Old versions remain in history (immutable)
- Users can generate from current version or historical versions
- Locking prevents accidental modification of production templates

**Impact Boundary:**
Templates only affect **new projects created after template modification**. Existing Odoo projects are never touched.

**User Mental Model:** "Mold or blueprint for creating identical projects"

---

#### Layer 3: Instance (Runtime, Odoo)
**Nature:** Independent, operational project  
**Location:** Odoo database  
**Lifetime:** Managed in Odoo (user controls)  

An Instance is the actual Odoo project created when a user generates a project from a template.

**Creation Process:**
1. User selects template
2. User provides instance-specific data (project name, company)
3. System orchestrates Odoo API calls to create all structural elements
4. Odoo project becomes fully independent

**Key Properties:**
- **No link to template:** Once created, project is 100% Odoo-native
- **No sync:** Template changes don't propagate to existing instances
- **Full Odoo freedom:** Users can modify project in Odoo without restriction
- **Immutable audit:** Generation event logged permanently

**User Mental Model:** "The actual building created from the blueprint"

---

### Separation of Concerns

| Concern | Blueprint | Template | Instance |
|---------|-----------|----------|----------|
| Where stored | Browser memory | Supabase DB | Odoo DB |
| Mutability | Fully mutable | Controlled (versioned) | Odoo-controlled |
| Validation | On-demand | Required before publish | N/A |
| User actions | Design, validate | Save, version, publish | Execute work (in Odoo) |
| Lifetime | Session | Permanent | Permanent |
| Visibility | Creator only | Role-based | Odoo RLS |

---

## User Capabilities

### User Roles

#### Standard User
- View published templates
- Generate projects from templates
- View own generation history
- Export templates

#### Template Creator (Role or Permission)
- All Standard User capabilities
- Create new templates
- Edit own unlocked templates
- Publish own templates
- Lock/unlock own templates
- Archive own templates

#### Administrator
- All Template Creator capabilities
- Edit any template
- Delete templates (soft delete)
- View all generation history
- Access analytics dashboard

### Primary User Flows

#### Flow 1: Create Template from Scratch

**Goal:** Design reusable project structure

1. Navigate to Template Library
2. Click "New Template"
3. Enter template metadata (name, description, tags)
4. Design kanban stages:
   - Add/remove stages
   - Set stage types (backlog, in_progress, review, done)
   - Reorder via drag-and-drop
   - Choose colors
5. Define milestones:
   - Add milestones (name, description)
   - Reorder milestones
6. Create tasks:
   - Add task to milestone
   - Set task name, description
   - Choose default kanban stage
   - Add subtasks (optional)
   - Add tags
7. Set dependencies:
   - Select task
   - Add prerequisite tasks
   - System shows dependency graph
   - System warns about circular dependencies
8. Validate blueprint:
   - System checks for errors (blocking issues)
   - System shows warnings (advisory issues)
9. Save:
   - Save as draft (can continue editing)
   - Or publish immediately (increments version)
10. Template now available for project generation

**Duration:** 10-20 minutes for typical project  
**Complexity:** Moderate (guided by UI)

---

#### Flow 2: Generate Project from Template

**Goal:** Create Odoo project with complete structure

1. Navigate to Template Library (or start from template detail view)
2. Click "Generate" on desired template
3. Review template preview (stages, milestones, tasks)
4. Enter instance details:
   - Project name (required)
   - Company (defaults to user's company)
   - Description override (optional)
5. Review generation plan:
   - Shows what will be created (X stages, Y milestones, Z tasks)
6. Click "Generate Project"
7. System shows progress:
   - Real-time updates (Creating project... Creating stages... etc.)
   - Progress bar
8. Success screen:
   - Confirmation message
   - Link to Odoo project
   - Generation summary
9. User navigates to Odoo to begin work

**Duration:** 10-20 seconds for generation (varies by template size)  
**Complexity:** Simple (form fill + confirmation)

---

#### Flow 3: Version Existing Template

**Goal:** Update template without breaking existing projects

1. Select template from library
2. Click "Edit" (or "Clone" if locked)
3. Make changes in blueprint editor
4. Validate changes
5. Click "Publish as New Version"
6. Choose version bump:
   - Major (breaking changes)
   - Minor (new features)
   - Patch (small fixes)
7. Optionally lock new version
8. New version becomes "current"
9. Future generations use new version
10. Old projects unaffected

**Impact:** Only new projects created after publish

---

#### Flow 4: Clone Template

**Goal:** Create derivative template

1. Select template
2. Click "Clone"
3. System creates new template:
   - New UUID
   - Name: "[Original] Copy"
   - Status: draft
   - Version: 1.0.0
4. User immediately in edit mode
5. Modify as needed
6. Save as independent template

**Use Cases:**
- Create team-specific variant
- Experiment without affecting original
- Start from example template

---

### Manager Capabilities Matrix

| Capability | Standard | Creator | Admin |
|-----------|----------|---------|-------|
| View published templates | ✅ | ✅ | ✅ |
| View own drafts | ✅ | ✅ | ✅ |
| Generate projects | ✅ | ✅ | ✅ |
| Create templates | ❌ | ✅ | ✅ |
| Edit own templates | ❌ | ✅ (unlocked) | ✅ |
| Edit others' templates | ❌ | ❌ | ✅ |
| Publish templates | ❌ | ✅ (own) | ✅ |
| Lock templates | ❌ | ✅ (own) | ✅ |
| Archive templates | ❌ | ✅ (own) | ✅ |
| Delete templates | ❌ | ❌ | ✅ (soft delete) |
| View all audit logs | ❌ | ❌ | ✅ |
| Analytics dashboard | ❌ | ❌ | ✅ |

---

## Technical Architecture

### System Context

```
┌─────────────────────────────────────────────────┐
│         Project Generator Module                │
│  (Cloudflare Worker + Browser JavaScript)       │
└─────────────────────────────────────────────────┘
         ↓                              ↓
         ↓ Templates                    ↓ Projects
         ↓ Audit Logs                   ↓ Tasks
         ↓                              ↓ Milestones
┌─────────────────┐          ┌─────────────────────┐
│   Supabase      │          │   Odoo (via RPC)    │
│   PostgreSQL    │          │   System of Record  │
└─────────────────┘          └─────────────────────┘
```

### Module Structure

Following the established platform pattern:

```
src/modules/project-generator/
├── module.js                 # Module registration (code, name, route)
├── routes.js                 # HTTP request handlers
├── ui.js                     # HTML generation for screens
├── lib/                      # Business logic
│   ├── blueprint-manager.js      # Blueprint CRUD (client-side)
│   ├── template-repository.js    # Template persistence (Supabase)
│   ├── odoo-orchestrator.js      # Project generation coordinator
│   ├── validation-engine.js      # Blueprint validation logic
│   ├── dependency-analyzer.js    # Dependency graph algorithms
│   └── audit-logger.js           # Generation event logging
└── config/
    ├── kanban-types.js           # Stage type definitions
    └── validation-rules.js       # Validation thresholds
```

**Integration with Platform:**
- Registered in `src/modules/registry.js` alongside other modules
- Uses existing `src/lib/odoo.js` for Odoo API communication
- Uses existing auth and Supabase infrastructure
- Follows same routing pattern as `sales-insight-explorer`

---

### Data Model

#### Supabase Tables

**project_templates**
```sql
id                UUID PRIMARY KEY
name              VARCHAR(255) NOT NULL
description       TEXT
version           VARCHAR(20) NOT NULL      -- "1.2.3"
status            VARCHAR(20) NOT NULL      -- 'draft' | 'published' | 'archived'
locked            BOOLEAN NOT NULL DEFAULT false
blueprint_data    JSONB NOT NULL            -- Complete blueprint structure
tags              TEXT[]
created_by        UUID REFERENCES auth.users
created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
usage_count       INTEGER NOT NULL DEFAULT 0
last_used_at      TIMESTAMPTZ
```

**project_generations** (Audit Log)
```sql
id                 UUID PRIMARY KEY
template_id        UUID REFERENCES project_templates
template_version   VARCHAR(20) NOT NULL
odoo_project_id    INTEGER                  -- Odoo's project ID
odoo_project_name  VARCHAR(255) NOT NULL
odoo_company_id    INTEGER
status             VARCHAR(20) NOT NULL     -- 'started' | 'success' | 'failed' | 'partial'
started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
completed_at       TIMESTAMPTZ
duration_ms        INTEGER
api_calls_made     INTEGER DEFAULT 0
error_message      TEXT
error_details      JSONB
created_records    JSONB                    -- {stages: [...], milestones: [...], tasks: [...]}
generated_by       UUID REFERENCES auth.users
```

#### Blueprint Data Structure (JSONB)

Stored in `project_templates.blueprint_data`:

```json
{
  "kanban": {
    "stages": [
      {
        "id": "uuid-1",
        "name": "To Do",
        "type": "backlog",
        "sequence": 0,
        "color": "#3B82F6",
        "fold": false
      }
    ]
  },
  "milestones": [
    {
      "id": "uuid-2",
      "name": "Phase 1: Discovery",
      "description": "Initial requirements gathering",
      "sequence": 0
    }
  ],
  "tasks": [
    {
      "id": "uuid-3",
      "name": "Kickoff meeting",
      "description": "Conduct initial client meeting",
      "milestone_id": "uuid-2",
      "default_stage_id": "uuid-1",
      "sequence": 0,
      "tag_ids": ["discovery", "client-facing"],
      "subtasks": [
        {
          "id": "uuid-4",
          "name": "Prepare agenda",
          "description": "",
          "sequence": 0
        }
      ],
      "prerequisite_ids": []
    }
  ],
  "metadata": {
    "created_at": "2026-01-28T12:00:00Z",
    "schema_version": "1.0"
  }
}
```

**Design Rationale:**
- UUIDs enable client-side generation (offline editing)
- References by ID enable graph traversal
- Flat task array with foreign keys simplifies queries
- Subtasks nested for clarity (max 1 level deep)
- Schema version enables future migrations

---

### Odoo Integration

#### Models Used

**project.project** - Main project container
- Created via `executeKw(env, {model: 'project.project', method: 'create', args: [{name, company_id, description}]})`
- Returns project ID

**project.task.type** - Kanban stages
- Created per stage in blueprint
- Linked to project via many2many: `project_ids: [[6, 0, [projectId]]]`

**project.milestone** - Milestones
- Created per milestone in blueprint
- Linked to project via `project_id`

**project.task** - Tasks and subtasks
- Created per task in blueprint
- Subtasks have `parent_id` set to parent task
- Dependencies set via `depend_on_ids` (many2many)

**project.tags** - Task labels
- Search for existing tags by name
- Create missing tags
- Link to tasks via `tag_ids`

#### API Sequencing

Critical: Order of operations matters.

**Phase 1: Create Project**
```javascript
const projectId = await executeKw(env, {
  model: 'project.project',
  method: 'create',
  args: [{name, company_id, description}]
});
```

**Phase 2: Create Stages**
```javascript
for (const stage of stages) {
  const stageId = await executeKw(env, {
    model: 'project.task.type',
    method: 'create',
    args: [{
      name: stage.name,
      project_ids: [[6, 0, [projectId]]],
      sequence: stage.sequence,
      fold: stage.fold
    }]
  });
  stageMap[stage.id] = stageId;  // Map blueprint ID → Odoo ID
}
```

**Phase 3: Create Milestones**
```javascript
for (const milestone of milestones) {
  const milestoneId = await executeKw(env, {
    model: 'project.milestone',
    method: 'create',
    args: [{
      name: milestone.name,
      project_id: projectId,
      description: milestone.description,
      sequence: milestone.sequence
    }]
  });
  milestoneMap[milestone.id] = milestoneId;
}
```

**Phase 4: Prepare Tags**
```javascript
// Search existing tags
const existingTags = await searchRead(env, {
  model: 'project.tags',
  domain: [['name', 'in', allTagNames]],
  fields: ['id', 'name']
});

// Create missing tags
for (const tagName of missingTagNames) {
  const tagId = await executeKw(env, {
    model: 'project.tags',
    method: 'create',
    args: [{name: tagName, color: 0}]
  });
  tagMap[tagName] = tagId;
}
```

**Phase 5: Create Tasks (Pass 1 - No Dependencies)**
```javascript
for (const task of tasks) {
  const taskId = await executeKw(env, {
    model: 'project.task',
    method: 'create',
    args: [{
      name: task.name,
      description: task.description,
      project_id: projectId,
      milestone_id: milestoneMap[task.milestone_id],
      stage_id: stageMap[task.default_stage_id],
      sequence: task.sequence,
      tag_ids: [[6, 0, task.tag_ids.map(name => tagMap[name])]]
    }]
  });
  taskMap[task.id] = taskId;
  
  // Create subtasks immediately
  for (const subtask of task.subtasks) {
    await executeKw(env, {
      model: 'project.task',
      method: 'create',
      args: [{
        name: subtask.name,
        description: subtask.description,
        project_id: projectId,
        parent_id: taskId,
        sequence: subtask.sequence
      }]
    });
  }
}
```

**Phase 6: Set Task Dependencies (Pass 2)**
```javascript
for (const task of tasks) {
  if (task.prerequisite_ids && task.prerequisite_ids.length > 0) {
    const odooTaskId = taskMap[task.id];
    const odooDependencyIds = task.prerequisite_ids.map(id => taskMap[id]);
    
    await executeKw(env, {
      model: 'project.task',
      method: 'write',
      args: [
        [odooTaskId],
        {depend_on_ids: [[6, 0, odooDependencyIds]]}
      ]
    });
  }
}
```

**Why Two-Pass Task Creation:**
- Odoo requires task IDs to exist before setting `depend_on_ids`
- Cannot create task with dependencies to tasks that don't exist yet
- First pass creates all tasks, second pass sets all dependencies

#### Error Recovery

**Rollback Strategy:**
```javascript
try {
  // ... all phases ...
} catch (error) {
  // Attempt rollback: delete project (cascade deletes tasks, etc.)
  try {
    await executeKw(env, {
      model: 'project.project',
      method: 'unlink',
      args: [[projectId]]
    });
    // Rollback successful
  } catch (rollbackError) {
    // Rollback failed - log orphaned records
    await logError({
      phase: 'rollback',
      projectId,
      orphanedRecords: createdRecords
    });
  }
  throw error;
}
```

**Partial Success Handling:**
If dependency setting fails but all tasks created:
- Status: 'partial'
- Project exists in Odoo
- User notified: "Project created, but dependencies not set. You can set them manually in Odoo."

---

## User Experience Design

### Design Principles

1. **Manager-Centric Language**
   - No technical jargon
   - "Blueprint" not "schema"
   - "Generate" not "deploy"
   - "Depends on" not "has prerequisite"

2. **Progressive Disclosure**
   - Simple path for basic templates
   - Advanced features available but not required
   - Expandable sections for power users

3. **Visual First**
   - Drag-and-drop for ordering
   - Visual kanban preview
   - Dependency graph visualization
   - Color coding for quick scanning

4. **Educate, Don't Block**
   - Show warnings, allow override
   - Suggest improvements, don't mandate
   - Preview before generate

### Primary Screens

#### 1. Template Library (Landing Page)

**Layout:**
- Header: Search, filters (status, tags), sort options
- Grid of template cards (name, preview, stats, actions)
- Actions per card: Generate, Edit, Clone, Archive

**Features:**
- Live search (debounced)
- Filter by status (draft, published, archived)
- Sort by name, date, usage
- Toggle grid/list view

**Empty State:**
```
📋 No templates yet

Create your first project template to get started.

[+ New Template]
```

---

#### 2. Blueprint Editor

**Layout:**
- Left panel (30%): Structure outline (kanban, milestones, tasks, dependencies)
- Center panel (50%): Active editor (tabbed)
- Right panel (20%): Properties & validation results

**Tabs:**
1. **Template Info:** Name, description, tags, version, status
2. **Kanban Design:** Visual stage builder with drag-and-drop
3. **Milestones:** List with inline add/edit
4. **Tasks:** Two-pane (milestone selector + task editor)
5. **Review & Validate:** Validation results, structure summary, publish actions

**Kanban Design Tab:**
```
[To Do] ──→ [In Progress] ──→ [Review] ──→ [Done]
 Backlog     In Progress       Review       Done
  🔵          🟡               🟠           🟢

Stage Details (selected: "In Progress")
┌──────────────────────────┐
│ Name      [In Progress_] │
│ Type      [In Progress ▾]│
│ Color     [🟡 Yellow ▾]  │
│ Folded    [ ] Collapsed  │
│ [Delete Stage]           │
└──────────────────────────┘
```

**Task Editor:**
```
Name*          [Initial kickoff meeting______________]

Description    [Conduct kickoff meeting with team___]

Default Stage  [To Do ▾]

Tags           [+ Add] [discovery ×] [client-facing ×]

This task depends on:
  [+ Add dependency]
  ○ No dependencies

Subtasks (2)                                [+ Add]
  ⋮ 1. Prepare agenda                       [Edit] [×]
  ⋮ 2. Send calendar invite                 [Edit] [×]

                              [Delete Task] [Save]
```

---

#### 3. Generate Project Flow

**Step 1: Select Template** (if not pre-selected)  
**Step 2: Configure Project**
```
Project Name*     [ACME Corp Onboarding_____________________________]
Company           [Your Company ▾]
Description       [Custom description or leave blank________________]
```

**Step 3: Review & Generate**
```
You're about to create:

Project Name:  ACME Corp Onboarding
Template:      Client Onboarding v2 (v2.1.0)
Company:       Your Company

This will create in Odoo:
  ✓ 1 Project
  ✓ 5 Kanban stages
  ✓ 4 Milestones
  ✓ 23 Tasks (including 2 subtasks)
  ✓ 12 Task dependencies

⏱ Estimated time: ~8 seconds

⚠ After creation, the project is fully independent in Odoo.
  Template changes won't affect it.

[← Back]  [Generate Project]
```

**Step 4: Progress**
```
Generating Project...

✅ Creating project in Odoo
✅ Creating kanban stages
⏳ Creating milestones... (2 of 4)
⏹ Creating tasks...
⏹ Setting dependencies...

[████████░░░░░░░░░░] 40%
```

**Success:**
```
✅ Project Created Successfully!

ACME Corp Onboarding is ready in Odoo

Created:
  • 1 Project
  • 5 Kanban stages
  • 4 Milestones
  • 23 Tasks
  • 12 Dependencies

Duration: 7.2 seconds

[Open in Odoo]  [Generate Another]  [Done]
```

---

#### 4. Template Detail View

**Tabs:**
1. **Overview:** Description, tags, metadata, structure summary
2. **Structure Preview:** Visual kanban, milestone tree, dependency graph (read-only)
3. **Version History:** List of all versions with view/clone actions
4. **Usage Stats:** Projects generated, recent generations

**Actions:**
- Generate Project
- Edit (if permitted)
- Clone
- Export (JSON)
- Archive

---

#### 5. Generation History

**Table View:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Project Name    Template       Date         Status    Duration  │
├─────────────────────────────────────────────────────────────────┤
│ ACME Corp...    Client Onb.    Jan 28 14:23  ✅ Success  7.2s   │
│ [View in Odoo] [View Log]                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Filters:** Status, User, Date range

---

### Interaction Patterns

**Drag-and-Drop:**
- Reorder stages, milestones, tasks
- Visual feedback (ghost preview, drop zones)
- Smooth animations

**Validation Feedback:**
- Real-time field validation
- Inline error messages (red)
- Warning messages (yellow)
- Success indicators (green)

**Tooltips:**
- Hover on ⓘ icon for contextual help
- Short explanations (1-2 sentences)

**Modal Dialogs:**
- Add/edit milestone
- Add dependency
- Confirm delete
- Publish template
- Error details

---

## Data Model

### Entity-Relationship Diagram

```
┌─────────────────┐
│  auth.users     │
└────────┬────────┘
         │
         │ created_by, generated_by
         │
         ├──────────────┬─────────────────┐
         ↓              ↓                 ↓
┌──────────────────┐  ┌──────────────────┐
│ project_templates│  │project_generations│
│                  │  │                  │
│ • id (PK)        │  │ • id (PK)        │
│ • name           │←─┤ • template_id    │
│ • version        │  │ • odoo_project_id│
│ • status         │  │ • status         │
│ • blueprint_data │  │ • created_records│
│ • created_by(FK) │  │ • generated_by   │
└──────────────────┘  └──────────────────┘
```

**Relationships:**
- User → Templates (one-to-many, created_by)
- User → Generations (one-to-many, generated_by)
- Template → Generations (one-to-many, template_id)

**No Direct Odoo Link:**
- `odoo_project_id` is a reference only, not a foreign key
- No enforcement of referential integrity with Odoo
- Odoo projects can be deleted without affecting this system

---

## Integration Strategy

### With Existing Platform

**Module Registration:**
```javascript
// src/modules/registry.js
import projectGeneratorModule from './project-generator/module.js';

export const MODULES = [
  // ... existing modules ...
  projectGeneratorModule,  // ← Added here
  // ... more modules ...
];
```

**Module Definition:**
```javascript
// src/modules/project-generator/module.js
export default {
  code: 'project_generator',
  name: 'Project Generator',
  description: 'Design and deploy project structures to Odoo',
  route: '/projects',
  icon: 'briefcase',
  isActive: true,
  routes
};
```

**Routing:**
- Follows same pattern as `sales-insight-explorer`
- Routes defined in `routes.js`, exported in `module.js`
- Platform router dispatches based on route matching

**Authentication:**
- All routes marked `auth: true`
- Platform auth middleware enforces user authentication
- User context available in `request.env.user`

**Odoo Communication:**
- **Reuses existing `src/lib/odoo.js`**
- No new Odoo client
- No new abstractions
- Direct calls to `executeKw`, `searchRead`

**Database:**
- Uses platform Supabase client
- RLS policies enforce access control
- Migrations follow platform pattern (files in `supabase/migrations/`)

---

### With Odoo

**API Contract:**
- **Method:** JSON-RPC 2.0
- **Endpoint:** `https://[instance].odoo.com/jsonrpc`
- **Authentication:** UID + API Key (from env vars)
- **Operations:** `execute_kw` for create/write/unlink, `search_read` for queries

**No Custom Endpoints:**
- Uses Odoo's standard XML-RPC/JSON-RPC API
- No Odoo module required
- Works with vanilla Odoo installation

**Version Compatibility:**
- Designed for Odoo 16+
- Tested against Odoo 16, 17
- Feature detection for version-specific fields (e.g., `depend_on_ids`)

**Error Handling:**
- Odoo errors parsed and translated to user-friendly messages
- API errors logged with full stack trace
- Network errors retry up to 3 times

---

## Security & Permissions

### Authentication & Authorization

**Platform-Level:**
- User must be authenticated (platform enforces)
- Module access controlled via platform permissions system
- Users without permission see no "/projects" route

**Template-Level (RLS):**
```sql
-- Users can view published templates or their own
CREATE POLICY templates_select_policy ON project_templates
  FOR SELECT
  USING (status = 'published' OR created_by = auth.uid());

-- Users can insert their own
CREATE POLICY templates_insert_policy ON project_templates
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Users can update their own unlocked templates
CREATE POLICY templates_update_policy ON project_templates
  FOR UPDATE
  USING (created_by = auth.uid() AND locked = false);

-- Users can delete their own templates
CREATE POLICY templates_delete_policy ON project_templates
  FOR DELETE
  USING (created_by = auth.uid());
```

**Generation-Level (RLS):**
```sql
-- Users can view their own generations
CREATE POLICY generations_select_policy ON project_generations
  FOR SELECT
  USING (generated_by = auth.uid());

-- Users can insert their own generations
CREATE POLICY generations_insert_policy ON project_generations
  FOR INSERT
  WITH CHECK (generated_by = auth.uid());
```

**Odoo-Level:**
- Company validation: User must have access to selected company
- Project creation: User must have project creation rights in Odoo
- All Odoo calls use user's API key (inherits user's Odoo permissions)

### Data Privacy

**Template Data:**
- Templates may contain business process knowledge (sensitive)
- Only shared with users who have appropriate permissions
- Export feature requires authentication

**Audit Logs:**
- Immutable record of all generation events
- No PII beyond user ID (linked to auth.users)
- Retention: permanent (or configurable purge policy)

**Odoo Data:**
- This system never stores Odoo project content
- Only stores reference IDs for audit
- Odoo enforces its own RLS

### Input Sanitization

**Client-Side:**
- Validate all inputs (blueprint editor)
- Prevent XSS in template names, descriptions

**Server-Side:**
- Re-validate all inputs (never trust client)
- Sanitize before database insert
- Sanitize before Odoo API calls
- Prevent SQL injection (parameterized queries via Supabase SDK)

**Rate Limiting:**
- Max 10 project generations per minute per user
- Max 100 template saves per hour per user
- Prevent abuse, accidental loops

---

## Risks & Mitigations

### Top 5 Risks

#### 1. Odoo API Orchestration Failure (Severity: High)

**Risk:** Multi-step generation fails mid-process, leaving orphaned records in Odoo.

**Mitigation:**
- Atomic rollback on failure (delete project cascades)
- Detailed audit logging (exactly what was created)
- If rollback fails, log orphaned records for manual cleanup
- Idempotency checks prevent duplicate generation

**Residual Risk:** Low

---

#### 2. User Expects Bidirectional Sync (Severity: Medium)

**Risk:** User modifies project in Odoo, expects template to update (or vice versa).

**Mitigation:**
- Clear messaging throughout UX: "One-way push, no sync"
- During generation: "Project will be fully independent in Odoo"
- Template detail: "Changes only affect NEW projects"
- Help documentation emphasizes architecture

**Residual Risk:** Medium (requires ongoing education)

---

#### 3. Complex Dependency Graphs Overwhelm Users (Severity: Low)

**Risk:** Visual dependency graph too complex for non-technical users.

**Mitigation:**
- Dependencies are optional (not required)
- Simplified list view as alternative
- Graph filtering (by milestone, critical path only)
- Educate via tooltips and examples

**Residual Risk:** Low

---

#### 4. Template Governance Chaos (Severity: Medium)

**Risk:** Too many templates, no naming conventions, duplicates, outdated versions.

**Mitigation:**
- Naming convention validation
- Template owner role (designated maintainer)
- Archival process (quarterly review of unused templates)
- Tags/categories required
- Admin dashboard for template health

**Residual Risk:** Medium (organizational discipline required)

---

#### 5. Odoo Version Compatibility (Severity: Medium)

**Risk:** Odoo upgrade changes API, breaking generation.

**Mitigation:**
- Version detection (query Odoo version)
- Staging environment testing before production deploy
- Abstraction layer isolates version-specific logic
- Graceful degradation (skip unsupported features)
- Monitoring alerts on API errors

**Residual Risk:** Medium (reactive fixes required)

---

## Implementation Roadmap

### Phase 0: Foundation (Week 1)

**Database:**
- Create Supabase migration for `project_templates`, `project_generations`
- Set up RLS policies
- Test RLS enforcement

**Module Registration:**
- Create module structure (`module.js`, `routes.js`, `ui.js`)
- Register in platform registry
- Verify routing works

**Basic UI:**
- Template library placeholder
- Blueprint editor shell
- Navigation between screens

**Deliverable:** Module accessible, database schema live

---

### Phase 1: Template Management (Weeks 2-3)

**Service Layer:**
- `lib/template-repository.js` (CRUD operations)
- `lib/blueprint-manager.js` (Blueprint manipulation)

**UI:**
- Template library (list, search, filter)
- Template detail view
- Template creation form

**Routes:**
- `GET /projects` → Template library
- `POST /projects/api/templates` → Create template
- `GET /projects/api/templates/:id` → Get template
- `PUT /projects/api/templates/:id` → Update template

**Testing:**
- Create template
- Edit template
- List templates
- Filter/search templates

**Deliverable:** Full template CRUD working, no generation yet

---

### Phase 2: Blueprint Editor (Weeks 4-5)

**UI Components:**
- Kanban designer (drag-and-drop stages)
- Milestone editor
- Task editor with subtasks
- Dependency selector

**Client-Side Logic:**
- Blueprint state management
- Real-time validation feedback
- Visual previews

**Routes:**
- `GET /projects/new` → Blueprint editor
- `POST /projects/api/validate` → Validate blueprint

**Testing:**
- Design complete project structure
- Validation errors/warnings display correctly
- Save blueprint as template

**Deliverable:** Full blueprint editing experience

---

### Phase 3: Validation & Dependencies (Week 6)

**Service Layer:**
- `lib/validation-engine.js` (Validation logic)
- `lib/dependency-analyzer.js` (Graph algorithms)

**Features:**
- Structural validation (errors)
- Semantic validation (warnings)
- Dependency cycle detection
- Critical path calculation
- Bottleneck identification

**UI:**
- Validation results display
- Dependency graph visualization (Cytoscape.js)
- Inline warnings in editor

**Testing:**
- Create circular dependency → error
- Create complex dependency chain → warnings
- Graph visualization renders correctly

**Deliverable:** Robust validation system

---

### Phase 4: Project Generation (Weeks 7-8)

**Service Layer:**
- `lib/odoo-orchestrator.js` (Generation coordinator)
- `lib/audit-logger.js` (Generation logging)

**Odoo Integration:**
- Create project
- Create stages (sequential)
- Create milestones (sequential)
- Prepare tags (search/create)
- Create tasks (two-pass)
- Set dependencies

**Error Handling:**
- Rollback on failure
- Partial success handling
- Detailed error logging

**Routes:**
- `POST /projects/api/generate` → Generate project
- `GET /projects/api/generations` → List generations
- `GET /projects/api/generations/:id` → Get generation details

**UI:**
- Generation flow (3-step wizard)
- Progress tracking (real-time updates)
- Success/error screens

**Testing:**
- Generate project from simple template → verify in Odoo
- Generate project from complex template (dependencies) → verify
- Simulate API failure → verify rollback
- Simulate partial failure → verify partial status

**Deliverable:** End-to-end project generation working

---

### Phase 5: Versioning & Polish (Week 9)

**Features:**
- Template versioning (publish as major/minor/patch)
- Template locking
- Template cloning
- Version history view

**UI Enhancements:**
- Template analytics (usage stats)
- Generation history filtering
- Export/import (JSON)

**Testing:**
- Publish new version → verify old version historical
- Clone template → verify independent
- Lock template → verify edit prevented

**Deliverable:** Full versioning system

---

### Phase 6: Testing & Refinement (Week 10)

**Testing:**
- E2E tests on staging Odoo
- Performance testing (100-task template)
- Browser compatibility testing
- Mobile responsiveness check

**Documentation:**
- User guide
- Video tutorials (optional)
- Admin documentation

**Bug Fixes:**
- Address issues found in testing

**Deliverable:** Production-ready module

---

### Phase 7: Launch & Monitoring (Week 11+)

**Deployment:**
- Deploy to production
- Run database migration
- Announce to users

**Monitoring:**
- Set up alerts (generation success rate, API errors)
- Daily review of error logs (first week)
- Weekly review of usage metrics

**Support:**
- User feedback collection
- Bug triage
- Feature requests logged

**Deliverable:** Live system with active monitoring

---

## Success Criteria

### Technical Success

**Reliability:**
- ✅ Generation success rate >95%
- ✅ Zero data corruption events
- ✅ Rollback success rate >98%
- ✅ API error rate <1%

**Performance:**
- ✅ Template list load <1s
- ✅ Blueprint validation <200ms
- ✅ Project generation <10s (typical project)
- ✅ Generation timeout <60s (max)

**Quality:**
- ✅ All RLS policies enforced
- ✅ 100% audit log coverage (all generations logged)
- ✅ No security vulnerabilities
- ✅ Accessibility compliance (WCAG AA)

---

### User Success

**Adoption:**
- ✅ >50% of project managers create at least one template (within 3 months)
- ✅ >5 templates created per team/department
- ✅ >3 projects generated per template (average)

**Efficiency:**
- ✅ Project setup time reduced from 30+ minutes to <5 minutes
- ✅ User-reported reduction in project setup errors
- ✅ Template reuse rate >50% (reusing existing vs creating new)

**Satisfaction:**
- ✅ User feedback: "Easy to use" >80%
- ✅ User feedback: "Saves time" >90%
- ✅ Support ticket rate <5 per week (after launch stabilization)

---

### Business Success

**Consistency:**
- ✅ Measurable increase in project structure consistency (via audit)
- ✅ Reduction in "forgotten tasks" incidents
- ✅ Knowledge captured in template library

**Value:**
- ✅ Time savings: >10 hours per month per team
- ✅ Template library grows to >20 templates (org-wide)
- ✅ Cross-team template sharing (teams using each other's templates)

**Governance:**
- ✅ Template ownership assigned (no orphaned templates)
- ✅ Archival process running (quarterly reviews)
- ✅ Template health dashboard used by admins

---

## Conclusion

The Project Generator module transforms project creation from a manual, error-prone process into a structured, repeatable, and auditable operation. By separating design (templates) from execution (Odoo projects), it enables organizations to capture knowledge, enforce discipline, and accelerate delivery while preserving the full flexibility of Odoo for actual project management.

**Key Principles Maintained:**
- ✅ No bidirectional sync (one-way push only)
- ✅ Full integration with existing platform architecture
- ✅ Reuse of established Odoo communication patterns
- ✅ Manager-friendly UX (no technical jargon)
- ✅ Educate and guide, don't block and mandate
- ✅ Comprehensive audit trail for all actions

This is not a project management tool. This is a project **setup** tool. The distinction is critical and communicated throughout.

---

**Document Version:** 1.0  
**Date:** January 28, 2026  
**Status:** Complete Analysis (Ready for Implementation Planning)
