# Project Generator - Functional Analysis

## Executive Summary

The Project Generator module enables managers to design, template, and deploy complete project structures to Odoo with a single action. It operates as a design-time orchestration layer that pushes structured data to Odoo, not as a bidirectional sync or live editing system.

**Core Value Proposition:**
- Design project structures once, deploy many times
- Enforce organizational project discipline without restricting Odoo freedom
- Reduce project setup errors through guided design
- Enable knowledge capture in reusable templates

---

## Conceptual Layers

### Layer 1: Blueprint (Design-Time)
**Location:** Browser state only  
**Lifetime:** Transient  
**Purpose:** Active workspace for designing a project structure

A Blueprint is an in-memory design artifact that exists only while being edited. It contains:
- Kanban stage definitions (types, order, semantics)
- Milestones with descriptions
- Tasks with milestone assignments
- Subtasks nested under tasks
- Task prerequisites (dependencies between tasks)
- Metadata (name, description, color coding)

**Key Characteristics:**
- Not persisted until explicitly saved as Template
- Fully mutable
- No Odoo connection
- Validates structure but doesn't enforce perfect compliance
- Can be discarded without consequence

**User Actions:**
- Create from scratch
- Load from existing template
- Edit all structural elements
- Validate design
- Save as new template or version

---

### Layer 2: Template (Reusable Asset)
**Location:** Application database (Supabase)  
**Lifetime:** Persistent  
**Purpose:** Reusable project blueprint with version control

A Template is a saved Blueprint that can be instantiated multiple times.

**Properties:**
- `template_id` (UUID)
- `name` (string)
- `description` (text, optional)
- `version` (semantic: major.minor.patch)
- `status` (draft | published | archived)
- `locked` (boolean - prevents editing)
- `created_by` (user reference)
- `created_at`, `updated_at`
- `blueprint_data` (JSON - the complete structure)

**Versioning Model:**
- Templates can have multiple versions
- Only one version can be "published" at a time
- Published templates can be locked to prevent accidental modification
- Locked templates can be cloned to create new drafts
- Version history is append-only (no deletion of old versions)

**User Actions:**
- Create new template from blueprint
- Edit unlocked template
- Clone template (creates new draft)
- Publish version
- Archive template
- View version history
- Revert to previous version (creates new version)

**Impact Scope:**
Templates **only affect projects created AFTER template modification**. Existing Odoo projects are never touched by template changes.

---

### Layer 3: Instance (Runtime, Odoo)
**Location:** Odoo database  
**Lifetime:** Managed in Odoo  
**Purpose:** Actual working project

An Instance is the Odoo representation created when a user "generates" a project from a template.

**Creation Process:**
1. User selects template
2. User provides instance-specific data:
   - Project name
   - Company context (if multi-company)
   - Optional description override
3. System validates template
4. System orchestrates Odoo API calls (see Technical Analysis)
5. Odoo project becomes fully independent

**Key Characteristics:**
- No live link back to template
- 100% Odoo-native after creation
- Can be modified freely in Odoo
- Template changes don't propagate to existing instances
- Instance cannot "refresh" from template

**User Actions in This Module:**
- Generate project from template
- View generation log/audit trail
- (Optional) View list of generated projects for reconciliation

**User Actions in Odoo (outside this module):**
- All regular Odoo project management
- Task editing, completion, reassignment
- Stage modifications
- New tasks, milestones
- No restrictions

---

## User Flows

### Flow 1: Create Project Template from Scratch

**Actor:** Manager  
**Precondition:** Authenticated, has template creation permission  
**Goal:** Design and save a reusable project structure

**Steps:**
1. Navigate to Project Generator module
2. Click "New Template"
3. Enter template metadata:
   - Template name (required)
   - Description (optional)
4. **Design Kanban:**
   - Add stages (drag to reorder)
   - Set stage type (backlog, in_progress, review, blocked, done)
   - Set stage color/icon
   - System warns if multiple "done" stages exist
   - System suggests common kanban patterns
5. **Define Milestones:**
   - Add milestone (name, description)
   - Optionally assign visual marker
   - No dates or deadlines
6. **Design Tasks:**
   - Add task to milestone
   - Set task name, description
   - Add subtasks (nested)
   - Set default kanban stage
   - Add labels/tags
7. **Define Dependencies:**
   - Select task
   - Add prerequisite tasks
   - System visualizes dependency graph
   - System warns about circular dependencies
   - System highlights bottlenecks (tasks blocking many others)
8. **Validate:**
   - System runs validation checks
   - Shows errors (blocking) vs warnings (advisory)
   - User can save despite warnings
9. **Save:**
   - Status: draft
   - Version: 1.0.0
   - User can continue editing or exit

**Post-condition:** Template exists in database, status=draft

---

### Flow 2: Generate Project from Template

**Actor:** Manager  
**Precondition:** At least one published template exists  
**Goal:** Create a new Odoo project with full structure

**Steps:**
1. Navigate to Project Generator
2. Click "Generate Project"
3. Select template from list
   - Shows: name, version, last used date, preview icon
   - Filter by tags, creator, date
4. Preview template structure:
   - Visual kanban preview
   - Milestone list
   - Task count, dependency count
5. Enter instance details:
   - **Project name** (required)
   - **Company** (if multi-company, defaults to user's company)
   - Description override (optional)
6. Review generation plan:
   - Shows what will be created
   - Estimates: X stages, Y milestones, Z tasks
7. Click "Generate"
8. System shows progress:
   - Creating project...
   - Creating kanban stages...
   - Creating milestones...
   - Creating tasks...
   - Setting dependencies...
9. Success screen:
   - "Project created successfully"
   - Link to Odoo project
   - Option to generate another
   - Link to generation audit log

**Post-condition:**  
- New project exists in Odoo
- All structural elements created
- User redirected to Odoo or stays in module

**Error Handling:**
- API failure: partial rollback attempt, log created
- User notified of failure reason
- Can retry or debug via audit log

---

### Flow 3: Edit and Version Existing Template

**Actor:** Manager  
**Precondition:** Template exists, user has edit permission  
**Goal:** Update template and create new version

**Steps:**
1. Navigate to template library
2. Select template
3. Check status:
   - If locked: Clone option presented
   - If unlocked: Edit button available
4. Click "Edit" (or "Clone and Edit")
5. Make changes (same design interface as creation)
6. System tracks changes:
   - Shows diff preview (optional)
7. Click "Save"
8. Choose save option:
   - **Save as draft** (overwrites current draft)
   - **Publish as new version** (increments version)
   - **Publish as major/minor/patch** (semantic versioning)
9. If publishing:
   - Previous published version becomes historical
   - New version marked as published
   - Optional: lock published version

**Post-condition:**  
- Template version history updated
- New version available for project generation
- Old version remains in history

---

### Flow 4: Clone Template

**Actor:** Manager  
**Goal:** Create derivative template from existing one

**Steps:**
1. Select template
2. Click "Clone"
3. System creates new template:
   - New `template_id`
   - Name: "[Original] Copy"
   - Status: draft
   - Version: 1.0.0
   - Same blueprint structure
4. User immediately in edit mode
5. Make modifications
6. Save as independent template

**Post-condition:**  
- New independent template exists
- No link to original (not a version)

---

### Flow 5: Browse Template Library

**Actor:** Manager  
**Goal:** Find and understand available templates

**Steps:**
1. Navigate to Template Library
2. View options:
   - Grid view (cards with preview)
   - List view (table with metadata)
3. Filter by:
   - Status (draft, published, archived)
   - Creator
   - Tags
   - Last used date
   - Version number
4. Sort by:
   - Name
   - Created date
   - Last updated
   - Usage count
5. Click template to see detail:
   - Full structure preview
   - Version history
   - Usage statistics (how many projects generated)
   - Creator notes
6. Actions available:
   - Generate project
   - Edit (if permitted)
   - Clone
   - Archive (if permitted)
   - Export (JSON download)
   - Import template (JSON upload)

---

## Manager Capabilities Matrix

| Capability | Standard User | Template Creator | Admin |
|-----------|---------------|------------------|-------|
| View templates | Published only | Own + Published | All |
| Generate projects | ✅ | ✅ | ✅ |
| Create templates | ❌ | ✅ | ✅ |
| Edit own templates | ❌ | ✅ (unlocked only) | ✅ |
| Edit others' templates | ❌ | ❌ | ✅ |
| Publish templates | ❌ | ✅ (own) | ✅ |
| Lock templates | ❌ | ✅ (own) | ✅ |
| Archive templates | ❌ | ✅ (own) | ✅ |
| Delete templates | ❌ | ❌ | ✅ (soft delete) |
| View audit logs | Own projects | Own + generated | All |
| Import/Export | ✅ | ✅ | ✅ |

---

## Locked vs Flexible Aspects

### Locked (Not User-Configurable)

**During Template Design:**
- Template structure schema (kanban, milestones, tasks, dependencies)
- Odoo model types used (project.project, project.task, project.milestone)
- API sequencing order
- Validation rule logic

**After Project Generation:**
- Template → Instance link (doesn't exist)
- Historical generation logs (immutable)
- Template version history (append-only)

### Flexible (User-Controlled)

**During Template Design:**
- Number of kanban stages (1-20 suggested range)
- Stage names, colors, types
- Number of milestones (0-50 suggested)
- Task hierarchy depth (3 levels: milestone → task → subtask)
- Dependencies between tasks (DAG required, but not enforced strictly)
- Labels, tags, descriptions

**During Project Generation:**
- Project name
- Company assignment
- Description override

**Template Management:**
- Publishing status
- Locking status
- Versioning strategy (when to increment)
- Template sharing/visibility (future: teams)

---

## Use Cases

### Use Case 1: Standardize Client Onboarding
**Context:** Company onboards 20+ clients per month  
**Problem:** Each PM creates onboarding project differently, steps get missed  
**Solution:**  
- Create "Client Onboarding v2" template
- Includes: kickoff, discovery, implementation, go-live milestones
- Standardized tasks with dependencies
- Generate new project per client with client-specific name
- PMs execute in Odoo with confidence structure is correct

---

### Use Case 2: Software Release Process
**Context:** Dev team releases every 2 weeks  
**Problem:** Release checklist inconsistent, blockers not visible  
**Solution:**  
- "Sprint Release v1.3" template
- Milestones: Code freeze, QA, Staging, Production
- Tasks with clear prerequisites (e.g., "Deploy to prod" depends on "QA sign-off")
- Dependency graph shows critical path
- Generate project per sprint, team executes in Odoo

---

### Use Case 3: Event Planning Template Library
**Context:** Marketing runs events quarterly  
**Problem:** Each event reinvents structure  
**Solution:**  
- Multiple templates: "Webinar", "Conference", "Product Launch"
- Each has event-specific milestones and tasks
- Marketing picks appropriate template
- Customizes project name and company
- Executes event coordination fully in Odoo

---

### Use Case 4: Template Evolution
**Context:** Process improves over time  
**Problem:** Need to update template without breaking existing projects  
**Solution:**  
- Edit "Client Onboarding v2" to create v3
- Add new milestone "Post-Launch Review"
- Publish as v3
- Future projects use v3
- Old projects (v2) continue unaffected in Odoo
- Template history shows evolution

---

## Validation Rules

### Blueprint Validation (Pre-Save)

**Errors (Block Save):**
- Template name empty
- Zero kanban stages
- Duplicate stage names
- Circular task dependencies
- Task references nonexistent milestone
- Prerequisite references nonexistent task

**Warnings (Allow Save):**
- More than 15 kanban stages (UX clutter)
- Zero milestones (unusual but valid)
- Tasks with >5 dependencies (complexity warning)
- Isolated tasks (no dependencies in or out)
- Missing "done" stage type
- Multiple "done" stages

### Template Publish Validation

**Errors (Block Publish):**
- Any blueprint errors present
- Template already locked
- No changes since last version

**Warnings:**
- Major version bump without significant changes
- Publishing without testing (no projects generated from draft)

### Generation Validation (Pre-Generate)

**Errors (Block Generation):**
- Project name empty
- Company selection invalid
- Template in draft status
- Template archived
- Odoo connection failed

**Warnings:**
- Project name already exists in Odoo (allows proceed)
- Template hasn't been used in >6 months (stale concern)
- Large template (>100 tasks) - performance warning

---

## Semantic Guidance (Not Enforcement)

The system provides intelligent guidance without hard enforcement:

### Kanban Stage Types
System recognizes these semantic types:
- **Backlog:** Initial state for unstarted work
- **In Progress:** Active work states
- **Review:** Waiting for approval/feedback
- **Blocked:** Work stopped due to external dependency
- **Done:** Completed work

**Guidance:**
- Suggests typical flow: Backlog → In Progress → Review → Done
- Warns if no "Done" stage exists
- Warns if multiple "Done" stages (Odoo allows it)
- Shows example kanban patterns from best practices

**Does Not Enforce:**
- Required stage types
- Stage order
- Single "done" stage

### Task Dependencies
System helps visualize and understand:
- Critical path (longest dependency chain)
- Bottleneck tasks (tasks blocking many others)
- Parallel work opportunities (tasks with no dependencies)
- Depth of dependency tree

**Guidance:**
- Highlights circular dependencies (error)
- Shows tasks with >5 prerequisites (complexity warning)
- Suggests breaking down complex dependency chains

**Does Not Enforce:**
- Maximum dependency count
- Specific dependency patterns

### Milestone Design
**Guidance:**
- Suggests milestone-per-phase pattern
- Warns if milestone has >20 tasks (might be too broad)
- Suggests balanced task distribution across milestones

**Does Not Enforce:**
- Minimum/maximum milestone count
- Task-per-milestone ratios

---

## Non-Functional Behaviors

### Performance Expectations
- Blueprint edit operations: <100ms response
- Template save: <500ms
- Template list load: <1s for 100 templates
- Project generation: <10s for 50-task project
- Validation: <200ms for typical blueprint

### Audit & Logging
Every generation event creates audit record:
- Timestamp
- User
- Template (id, version)
- Odoo project created (id, name)
- Success/failure status
- Error details if failed
- API call count
- Duration

### Error Recovery
- Partial generation failure: attempt rollback
- Rollback failure: log orphaned records
- Provide manual cleanup instructions
- Never leave silent failures

### Data Integrity
- Template version history immutable
- Audit logs immutable
- Soft delete for templates (never hard delete)
- Blueprint validation before every save

---

## Future Considerations (Out of Scope for V1)

**Not Included:**
- Scheduling (start dates, due dates, offsets)
- Resource assignment (users, teams)
- Budget or cost estimation
- Time tracking integration
- Custom fields beyond Odoo standard
- Automated recurrence (e.g., monthly project generation)
- Template sharing across organizations
- Template marketplace
- AI-suggested templates
- Gantt chart views
- Importing existing Odoo projects as templates

**Explicitly Excluded Forever:**
- Bidirectional sync with Odoo
- Live editing of Odoo projects from this module
- Template-driven updates to existing projects
- Odoo Studio integration
- BPMN workflow engine
- Approvals or state machines in this layer

---

## Success Metrics

### User Success
- Template creation time <15 minutes for typical project
- Project generation success rate >95%
- User reports reduced project setup errors
- Template reuse rate >3 projects per template

### System Success
- Zero data corruption events
- API failure rate <1%
- Audit log completeness 100%
- Template load performance <1s

### Business Success
- Reduced project setup time by >50%
- Increased project structure consistency
- Knowledge capture in template library
- Onboarding time for new PMs reduced
