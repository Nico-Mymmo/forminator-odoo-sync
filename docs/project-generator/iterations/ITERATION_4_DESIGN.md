# ITERATION 4 DESIGN: PROJECT GENERATION PIPELINE

**Date:** January 28, 2026  
**Status:** 📐 DESIGN PHASE (NOT IMPLEMENTED)  
**Type:** Architecture & Contract Design

---

## STEP 0: STARTING POINT

**What we have:**
- Validated blueprint data in `project_templates.blueprint_data` (JSONB column)
- Blueprint schema: stages, milestones, tasks (with parent_id for subtasks), dependencies
- Client-side validation ensures: no orphan tasks, no circular dependencies, all IDs exist
- Server-side validation via `validation.js` can be re-run before generation
- No Odoo integration exists yet
- User-scoped data (RLS enforced)

**Guarantees:**
- Blueprint structure is valid at save time
- UUIDs are unique within a blueprint
- Parent tasks have at least one subtask
- Dependencies are acyclic

---

## STEP 1: GENERATION BOUNDARY

### What "Generate Project" Means (Concrete)

**IN SCOPE - What Gets Created:**

1. **ONE Odoo Project** (`project.project` model)
   - Created from template name + description
   - Becomes the container for all tasks
   - Gets a generated name with timestamp to ensure uniqueness

2. **Task Stages** (via `project.task.type`)
   - One stage per blueprint stage
   - Sequence preserved from blueprint
   - Linked to the generated project

3. **Main Tasks** (`project.task` model)
   - One Odoo task per blueprint parent task
   - Assigned to milestone (if exists)
   - Linked to project and stage

4. **Subtasks** (`project.task` model with `parent_id`)
   - One Odoo task per blueprint subtask
   - Parent_id points to main task
   - Inherits milestone from parent (or explicit if different)

5. **Dependencies** (via `depend_on_ids` field on `project.task`)
   - Created as many2many links between tasks
   - Only after ALL tasks exist
   - Dependency direction preserved

**OUT OF SCOPE - What Does NOT Get Created:**

❌ **Milestones** - Odoo has no native milestone model in `project.project`. We store milestone data as task tags or descriptions (design decision needed).

❌ **Users/Assignments** - No task assignments in V1. All tasks created unassigned.

❌ **Estimated Hours** - Not in blueprint schema.

❌ **Task Descriptions** - Only task names in V1.

❌ **Multiple Projects** - One blueprint = one project. No splitting.

❌ **Custom Fields** - No extension of Odoo models.

### Responsibility Boundary

**Generator is responsible for:**
- Transforming blueprint → Odoo API calls
- Creating entities in correct order
- Mapping UUIDs → Odoo IDs
- Recording what was created
- Failing atomically (all or nothing)

**Generator is NOT responsible for:**
- Blueprint validation (already done)
- User permissions in Odoo (assume user can create projects)
- Odoo server availability (fail fast)
- Cleanup on partial failure (user must delete manually)

---

## STEP 2: CANONICAL GENERATION MODEL (INTERNAL)

### Why This Layer Exists

The blueprint schema is designed for **editing**.  
The Odoo API requires **creation order and ID resolution**.

We need an intermediate model that:
1. Preserves blueprint semantics
2. Adds generation metadata (order, Odoo mapping readiness)
3. Isolates blueprint changes from Odoo API changes
4. Enables dry-run simulation without Odoo calls

### The Canonical Generation Model

```json
{
  "metadata": {
    "template_id": "uuid",
    "template_name": "string",
    "generated_at": "ISO 8601 timestamp",
    "user_id": "uuid"
  },
  "project": {
    "name": "string (template name + timestamp)",
    "description": "string | null"
  },
  "stages": [
    {
      "blueprint_id": "uuid",
      "name": "string",
      "sequence": 1,
      "odoo_id": null  // Populated during generation
    }
  ],
  "tasks": [
    {
      "blueprint_id": "uuid",
      "name": "string",
      "milestone_name": "string | null",
      "parent_blueprint_id": "uuid | null",
      "stage_blueprint_id": "uuid | null",
      "dependencies": ["blueprint_id", "blueprint_id"],
      "odoo_id": null,  // Populated during generation
      "generation_order": 1  // Computed: parents before children
    }
  ]
}
```

### Key Differences from Blueprint

1. **Flattened Structure**: Tasks and stages in ordered arrays, not nested
2. **Generation Order**: Explicit `generation_order` field for tasks
3. **Odoo ID Tracking**: Placeholder for mapping blueprint UUIDs → Odoo IDs
4. **Metadata**: Contextual info for logging and traceability
5. **Milestone Handling**: Milestone name stored directly on task (no separate entity)
6. **Dependency Resolution**: Blueprint IDs stored, resolved to Odoo IDs later

### What Problems It Solves

- **Separation of Concerns**: Blueprint editor doesn't need to know about Odoo
- **Testability**: Can validate generation model without Odoo API
- **Auditability**: Clear input to generation process
- **Retry Safety**: Same model → same output (idempotent-ish)
- **Error Isolation**: Blueprint changes don't break generator

---

## STEP 3: MAPPING STRATEGY TO ODOO (ABSTRACT)

### Conceptual Mapping Table

| Canonical Concept | Odoo Target | Notes | Mismatches/Constraints |
|------------------|-------------|-------|------------------------|
| **Project** | `project.project` | 1:1 mapping | None. Standard Odoo model. |
| **Stage** | `project.task.type` | 1:1 mapping | Must link to project via `project_ids` (many2many). Sequence preserved. |
| **Main Task** | `project.task` | 1:1 mapping | `parent_id = False`. Must reference project and stage. |
| **Subtask** | `project.task` | 1:1 mapping | `parent_id = <odoo_id_of_parent>`. Odoo supports native subtasks. |
| **Milestone** | ❌ NO NATIVE MODEL | **Design Decision Needed** | Options: (1) Task tags, (2) Task description prefix, (3) Ignore. We propose: **Task tag** (`project.tags`). |
| **Dependency** | `project.task.depend_on_ids` | Many2many field | Must create tasks FIRST, then update with dependencies. Cannot create during task creation. |

### Critical Unknowns

1. **Milestone Implementation**
   - Odoo Community has no native milestone model
   - Odoo Enterprise has milestones but different structure
   - **Decision Required**: Use tags or omit milestones in V1?

2. **Stage Assignment**
   - Blueprint has stages but no task→stage assignment
   - **Decision Required**: All tasks start in first stage? Or assign explicitly in blueprint editor (future)?

3. **Dependency Field Structure**
   - Is `depend_on_ids` available in Community edition?
   - **Must Verify**: Odoo API documentation or test instance

4. **Project Visibility**
   - Default privacy settings for generated projects?
   - **Assumption**: Public within company, user is owner

---

## STEP 4: FAILURE MODES & SAFETY

### Hard Failure Scenarios

#### 1. Partial Project Creation

**Scenario**: Project created, but stage creation fails.

- **Can Retry?** ❌ No. Project already exists with that name.
- **Rollback Required?** ⚠️ Ideally yes, but risky. Deleting a project might cascade.
- **Mitigation**: Generate unique project names (template name + ISO timestamp).
- **Logging**: Record project ID before attempting stages.
- **User Action**: Manual deletion in Odoo if partial.

#### 2. Partial Task Creation

**Scenario**: 5 of 10 tasks created, then network failure.

- **Can Retry?** ❌ No. Cannot distinguish created vs. not-created tasks safely.
- **Rollback Required?** ⚠️ Deleting tasks might affect other data.
- **Mitigation**: Transaction-like approach (all or nothing), but Odoo API doesn't support transactions.
- **Logging**: Record each task ID as created.
- **User Action**: Manual cleanup or abandon project.

#### 3. Dependency Creation Failure

**Scenario**: All tasks created, but dependency linking fails.

- **Can Retry?** ✅ Maybe. Dependencies are idempotent (re-linking doesn't duplicate).
- **Rollback Required?** ❌ No. Tasks are usable without dependencies.
- **Mitigation**: Log failed dependencies, allow user to skip or retry.
- **User Action**: Manually add dependencies in Odoo or retry generation.

#### 4. Stage Creation Failure

**Scenario**: Stages fail to create or link to project.

- **Can Retry?** ❌ No, if project already created.
- **Rollback Required?** ⚠️ Complex.
- **Mitigation**: Create stages BEFORE tasks. Fail fast.
- **User Action**: Delete project, fix issue, regenerate.

#### 5. Permission Denied

**Scenario**: User lacks permissions to create projects in Odoo.

- **Can Retry?** ❌ Not without fixing permissions.
- **Rollback Required?** ❌ Nothing created.
- **Mitigation**: Pre-check permissions (if Odoo API allows).
- **Logging**: Record permission error clearly.
- **User Action**: Contact admin or use different credentials.

#### 6. Network Timeout Mid-Generation

**Scenario**: API call hangs, times out.

- **Can Retry?** ⚠️ Unknown. Entity might be created but response lost.
- **Rollback Required?** ❌ Cannot determine state.
- **Mitigation**: Short timeouts, fail fast, log last successful step.
- **User Action**: Check Odoo manually, delete if partial, retry.

### Safety Matrix

| Failure Type | Retry Safe? | Rollback Possible? | Logging Required | User Action |
|--------------|-------------|-------------------|------------------|-------------|
| Partial Project | ❌ | ⚠️ Manual only | ✅ Project ID | Delete manually |
| Partial Tasks | ❌ | ⚠️ Manual only | ✅ Each task ID | Delete manually |
| Dependencies Fail | ✅ Maybe | ❌ Not needed | ✅ Failed pairs | Retry or skip |
| Stages Fail | ❌ | ⚠️ Manual only | ✅ Stage IDs | Delete project |
| Permission Denied | ❌ | ❌ Nothing created | ✅ Error message | Fix permissions |
| Network Timeout | ⚠️ Unknown | ❌ Unknown state | ✅ Last step | Manual check |

### Critical Logging Requirements

**Before Each Step:**
- Template ID, User ID, timestamp
- Current step name
- Input data snapshot

**After Each Success:**
- Entity created (type, name, Odoo ID)
- Time elapsed

**On Any Failure:**
- Step that failed
- Error message from Odoo API
- All Odoo IDs created so far
- Full generation model snapshot

**Storage:** Database table (proposed: `generation_history`)

---

## STEP 5: EXECUTION STRATEGY (HIGH LEVEL)

### Linear Execution Plan

```
1. PRE-GENERATION VALIDATION
   ├─ Re-validate blueprint using validation.js
   ├─ Confirm user has Odoo credentials
   ├─ Ping Odoo API (health check)
   └─ FAIL FAST if any check fails

2. BUILD CANONICAL GENERATION MODEL
   ├─ Transform blueprint → generation model
   ├─ Compute generation order (parents before children)
   ├─ Flatten dependencies into task-level array
   └─ Add metadata (timestamp, user, template)

3. CREATE PROJECT
   ├─ Generate unique project name (template name + ISO timestamp)
   ├─ Call Odoo: create `project.project`
   ├─ Store: project.odoo_id
   └─ STOP if fails

4. CREATE STAGES
   ├─ For each stage in generation model (ordered by sequence):
   │  ├─ Call Odoo: create `project.task.type`
   │  ├─ Link to project via `project_ids`
   │  ├─ Store: stage.odoo_id
   │  └─ STOP if any fails
   └─ All stages created before proceeding

5. CREATE MILESTONES (IF USING TAGS)
   ├─ For each unique milestone name:
   │  ├─ Call Odoo: create `project.tags`
   │  ├─ Store: milestone_name → tag.odoo_id mapping
   │  └─ Continue even if fails (non-critical)

6. CREATE TASKS (ORDERED)
   ├─ Sort tasks by generation_order (parents first)
   ├─ For each task:
   │  ├─ Prepare task data:
   │  │  ├─ name
   │  │  ├─ project_id (from step 3)
   │  │  ├─ stage_id (default: first stage, or mapped)
   │  │  ├─ parent_id (if subtask: resolve blueprint parent → odoo_id)
   │  │  ├─ tag_ids (if milestone: resolve milestone → tag odoo_id)
   │  ├─ Call Odoo: create `project.task`
   │  ├─ Store: task.odoo_id in generation model
   │  └─ STOP if fails
   └─ All tasks created before dependencies

7. CREATE DEPENDENCIES
   ├─ For each task with dependencies:
   │  ├─ Resolve blueprint dependency IDs → Odoo task IDs
   │  ├─ Call Odoo: update `project.task.depend_on_ids`
   │  └─ LOG if fails, but CONTINUE (dependencies optional)

8. FINALIZE
   ├─ Mark generation as complete
   ├─ Store all Odoo IDs in generation_history
   ├─ Return success + Odoo project URL
   └─ Clean up temporary data

9. ON ANY FAILURE
   ├─ Log failure point
   ├─ Log all created Odoo IDs
   ├─ Mark generation as failed
   ├─ Return error + cleanup instructions
   └─ DO NOT attempt rollback
```

### Key Principles

1. **No Async Hand-Waving**: All steps sequential, blocking
2. **Fail Fast**: Stop on critical failures (project, stages, tasks)
3. **Fail Soft**: Continue on optional failures (dependencies, milestones)
4. **Order Matters**: Parents before children, entities before links
5. **Idempotency Impossible**: Accept that retry is dangerous
6. **User Cleanup**: User must manually delete partial projects

### Dry-Run Possibility

**NO dry-run in V1.**

Reasons:
- Odoo API doesn't support transactions
- Validating without creating is complex
- Adds scope creep
- User can test with throwaway template

**Future consideration:** Mock Odoo API for testing.

---

## STEP 6: PERSISTENCE & TRACEABILITY

### Where to Store Generation Data

**Proposed: ONE new table `project_generations`**

#### Schema

```sql
CREATE TABLE project_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  template_id UUID NOT NULL REFERENCES project_templates(id),
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  
  -- Odoo entity IDs
  odoo_project_id INTEGER,
  odoo_project_url TEXT,
  
  -- Generation model snapshot
  generation_model JSONB NOT NULL,
  
  -- Odoo ID mappings (blueprint UUID → Odoo ID)
  odoo_mappings JSONB DEFAULT '{}',
  
  -- Error tracking
  error_message TEXT,
  failed_step TEXT,
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_project_generations_user ON project_generations(user_id);
CREATE INDEX idx_project_generations_template ON project_generations(template_id);
CREATE INDEX idx_project_generations_status ON project_generations(status);
```

#### Field Usage

- **`generation_model`**: Full canonical model from Step 2 (audit trail)
- **`odoo_mappings`**: JSON object mapping blueprint UUIDs → Odoo IDs
  ```json
  {
    "stages": {
      "blueprint-uuid-1": 123,
      "blueprint-uuid-2": 124
    },
    "tasks": {
      "blueprint-uuid-3": 456,
      "blueprint-uuid-4": 457
    }
  }
  ```
- **`status`**: Current state (prevents double generation)
- **`error_message`**: Full error from Odoo or network
- **`failed_step`**: Step number from execution plan

### Preventing Double Generation

**Before starting generation:**

```sql
SELECT * FROM project_generations
WHERE template_id = ?
AND status IN ('in_progress', 'completed')
ORDER BY created_at DESC
LIMIT 1;
```

**Actions:**
- If `in_progress`: Warn user, ask to cancel or wait
- If `completed`: Show existing project, ask to generate new (confirm)
- If `failed`: Allow retry (but warn about manual cleanup)
- If none: Proceed

### Preventing Partial Duplicates

**No prevention.**

Reasoning:
- Odoo doesn't support unique constraints on project names
- User might intentionally generate same template multiple times
- Timestamp in project name provides uniqueness
- Cleanup is user's responsibility

### What We Log

**Always:**
- Full generation model (for replay/debug)
- Each created Odoo ID
- Timestamps for each step
- User and template context

**On Success:**
- Odoo project URL
- All mappings

**On Failure:**
- Failed step name
- Error message
- All IDs created before failure

---

## STEP 7: EXPLICIT NON-GOALS

### What We Will NOT Do in Iteration 4

1. **❌ Rollback/Undo System**
   - No automatic cleanup of partial projects
   - User deletes manually in Odoo

2. **❌ Update/Sync After Generation**
   - No bidirectional sync
   - No "regenerate" to update existing project
   - One-way, one-time only

3. **❌ Bulk Generation**
   - One template = one generation at a time
   - No batch processing

4. **❌ Progress Indicators/Streaming**
   - No real-time updates during generation
   - User waits for completion

5. **❌ Dry-Run Mode**
   - No simulation without actual creation
   - Test with throwaway templates

6. **❌ Odoo Validation**
   - No pre-checking if task names are valid
   - Trust Odoo to reject invalid data

7. **❌ Custom Field Mapping**
   - No user-defined field mappings
   - Fixed mapping strategy only

8. **❌ Multi-Project Generation**
   - No splitting one template into multiple projects
   - One blueprint = one project

9. **❌ Template Versioning**
   - No tracking of which template version was used
   - Current template state is used

10. **❌ User Assignment**
    - Tasks created unassigned
    - User assigns in Odoo post-generation

11. **❌ Estimated Hours/Deadlines**
    - Not in blueprint schema
    - User adds in Odoo

12. **❌ Task Descriptions**
    - Only task names
    - User adds descriptions in Odoo

13. **❌ File Attachments**
    - No document upload
    - Not in scope

14. **❌ Email Notifications**
    - No emails on generation complete
    - User checks manually

15. **❌ Webhooks/Integrations**
    - No external system notifications
    - Standalone operation

---

## STEP 8: ITERATION 5 PREVIEW

If Iteration 4 design is approved and implemented successfully, **Iteration 5** would logically focus on:

**Post-Generation Management & Quality of Life**

- **Generation History UI**: View past generations, link to Odoo projects, see status
- **Error Recovery Guidance**: In-app instructions for cleaning up failed generations
- **Template Cloning**: Duplicate existing templates with blueprints for faster iteration
- **Blueprint Import/Export**: JSON file support for backup and sharing
- **Stage Assignment in Blueprint**: Allow editor to assign tasks to specific stages (currently defaults to first stage)
- **Improved Validation**: Pre-generation checks against live Odoo schema (field existence, permissions)
- **Milestone Strategy Refinement**: Based on V1 feedback, decide if tags work or need different approach
- **Odoo Link Integration**: Direct links from generation history to Odoo project, task views

Iteration 5 would NOT include sync, updates, or bidirectional flow. It remains a **one-way, one-time generator** but with better UX around the generation lifecycle.

---

## APPROVAL CHECKLIST

Before proceeding to implementation, confirm:

- [ ] **Generation boundary is clear**: What gets created in Odoo is explicitly defined
- [ ] **Canonical model makes sense**: Intermediate layer justification is accepted
- [ ] **Mapping strategy is validated**: Odoo field availability confirmed (especially `depend_on_ids`, milestone approach)
- [ ] **Failure handling is acceptable**: No rollback, user manual cleanup, logging sufficient
- [ ] **Execution order is sound**: Sequential steps, fail-fast on critical, fail-soft on optional
- [ ] **Persistence strategy is approved**: Single `project_generations` table, schema reviewed
- [ ] **Non-goals are acknowledged**: All 15 exclusions are accepted for V1 scope
- [ ] **Iteration 5 direction aligns**: Quality-of-life improvements, not scope expansion

---

## OPEN QUESTIONS (REQUIRE DECISIONS)

1. **Milestone Implementation**: Tags, description prefix, or omit entirely?
2. **Stage Assignment**: All tasks to first stage, or add stage selection in blueprint editor first?
3. **Dependency Field**: Verify `depend_on_ids` exists in Odoo Community (or use Enterprise-only field)?
4. **Project Naming**: Timestamp format? User-editable prefix?
5. **Retry Strategy**: Allow user to retry failed generation, or always create new?

---

**END OF DESIGN PHASE**

**Next Step:** Address open questions, get design approval, then proceed to implementation in a new iteration.
