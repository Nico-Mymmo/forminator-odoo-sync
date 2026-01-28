# Project Generator - Explorer (V1 Reasoning & Choices)

## Purpose of This Document

This document explains **why** the V1 scope was chosen and **how** the minimal design decisions were made.

This is NOT a feature wishlist. This is the **reasoning record**.

---

## Core Design Philosophy

### The Problem We're Solving

**User Need:**
"I create the same type of project structure repeatedly in Odoo. Setting up stages, milestones, and tasks manually is tedious and error-prone."

**V1 Solution:**
A simple template system that captures a project structure once and can recreate it in Odoo via API.

**NOT Solving (in V1):**
- Project management features (Odoo does this)
- Advanced scheduling or resource allocation
- Real-time collaboration
- Analytics or insights
- Process automation beyond initial creation

---

## Why This Scope?

### What We Included

**1. Blueprint Designer**
- **Why:** Need a way to design the structure before saving
- **Why Browser-Only:** No persistence needed until user explicitly saves
- **Why Cancel/Undo:** Executes "Discard all unsaved changes and restore last persisted blueprint state"
- **This is NOT:** Step-by-step undo, redo capability, or state history
- **This IS:** Deliberate UX choice for managers learning process thinking (safe reset to last save)

**2. Template Storage**
- **Why Supabase:** Already integrated, RLS handles permissions
- **Why Single Table:** No versioning in V1 keeps it simple
- **Why JSONB for Blueprint:** Flexible, no schema changes needed for structure tweaks
- **Why No Status Field:** Single workflow (create/edit/delete), no draft/published complexity needed

**3. Odoo Project Creation**
- **Why Sequential API Calls:** Simpler than parallel, dependencies are clear, ordering matters (parents before children)
- **Why No Rollback:** Complex to implement, V1 assumes success path (user manually cleans up on error)
- **Why Task Stages/Milestones/Tasks/Subtasks:** Complete set of building blocks for process thinking
- **Why Task Stages (project.task.type):** Odoo-native task kanban stages, project-specific via project_ids
- **Project-Level Stages:** Odoo-native, globally managed, NEVER touched by generator
- **Why Subtasks MANDATORY:** Process thinking fundamentally requires task decomposition
- **Why parent_id:** Respects Odoo's native subtask structure (no custom fields needed)
- **Why Subtasks ARE Essential:** Decomposition is fundamental to process thinking, subtasks enable task breakdown
- **Why parent_id on project.task:** Respects Odoo's native subtask structure (no custom fields needed)

**4. Validation**
- **Why Errors vs Warnings:** Some things must be correct (no circular deps, no circular parent hierarchy), others are advisory
- **Why Client-Side Only:** No server-side validation needed, client has full context
- **Why Simple Detection:** Circular dependency and parent hierarchy checks are essential, warnings guide users without blocking

### What We Excluded (and Why)

**❌ Version Control**
- **NOT in V1:** Adds tables, UX complexity (viewing history, reverting, diffing)
- **V1 Reality:** Single version only, overwrite on save
- **Workaround:** User can manually clone a template to preserve previous state

**❌ Audit Trail**
- **NOT in V1:** Requires separate table, query complexity, UI to view logs
- **V1 Reality:** No generation history tracking - templates are simple enough to recreate if lost

**❌ Rollback on Error**
- **NOT in V1:** Complex orchestration, requires tracking all created IDs, calling delete APIs
- **V1 Reality:** User manually deletes partial project in Odoo if generation fails (acceptable for MVP validation)

**✅ Subtasks (MANDATORY in V1)**
- **Status:** REQUIRED, not optional, not deferred
- **Why MANDATORY:** Process thinking fundamentally requires task decomposition
- **Implementation:** parent_id field on project.task (Odoo-native structure, no custom fields)
- **Creation Order:** Parents created first, then children (Odoo requirement)
- **Dependencies:** Subtasks may have dependencies, including cross-parent
- **UI:** Indented display under parent tasks in editor
- **This is NOT negotiable:** Without subtasks, no process thinking. V1 requires this.

**❌ Step-by-Step Undo/Redo**
- **NOT in V1:** Requires history stack, redo stack, UI buttons, event tracking
- **What IS in V1:** Cancel button that executes: "Discard all unsaved changes and restore last persisted blueprint state"
- **This is NOT:** Step-by-step undo, redo capability, state history
- **This IS:** Deliberate UX choice for managers learning process thinking (safe reset to last save)
- **Redo:** Explicitly excluded (workflow is forward, not backward)

**❌ Drag-and-Drop Reordering**
- **NOT in V1:** Requires drag library or custom implementation, adds visual complexity
- **V1 Reality:** Simple up/down buttons or re-create items

**❌ Visual Dependency Graph**
- **NOT in V1:** Requires graph rendering library (D3.js, Vis.js), layout algorithms
- **V1 Reality:** Text list of dependencies per task (sufficient for validation)

**❌ Template Search/Filter**
- **NOT in V1:** Limited templates expected initially, table view sufficient
- **V1 Reality:** Use browser Ctrl+F for search (acceptable for small template library)

**❌ Import/Export**
- **NOT in V1:** JSON serialization already exists in JSONB field, no pressing need for user-facing UI
- **V1 Reality:** Direct database access if needed (developer-level operation only)

**❌ Keyboard Shortcuts**
- **Why Not V1:** Requires key binding library, discoverability UX (cheat sheet)
- **V1 Approach:** Mouse-only interaction (acceptable for V1 scope)
- **Not in scope** for current iteration

**❌ Confetti Animation**
- **Why Not V1:** Pure polish, zero functional value
- **V1 Approach:** Simple success message
- **Not in scope** for any version (unnecessary decoration)

---

## Architectural Decisions

### Decision 1: No New Abstractions

**Choice:** Use existing `odoo.js` directly, no wrapper layer

**Reasoning:**
- App already has `executeKw` pattern in `odoo.js`
- Abstracting it adds files, indirection, mental overhead
- V1 needs are simple: `create` and `write` calls
- Odoo is architecturally leading (generator adapts, not extends)

**Rejected Alternative:** Create `OdooProjectService` class
- Would add `src/modules/project-generator/services/odoo-project-service.js`
- Would require defining interfaces, error handling patterns
- Overkill for ~100 lines of code
- Violates principle: no new patterns beyond existing app structure

---

### Decision 2: Sequential API Calls (6 Steps)

**Choice:** Call Odoo APIs one at a time, wait for each to complete

**Reasoning:**
- Dependencies matter: can't create tasks without project ID
- Dependencies matter: can't create subtasks without parent task IDs (ordering!)
- Dependencies matter: can't set task dependencies without all task IDs
- Error handling simpler: know exactly which step failed
- Performance acceptable: <15s for 50 tasks + 20 subtasks is fine

**6-Step Sequence (exact order):**
1. Create project
2. Create task stages (project.task.type)
3. Create milestones
4. Create parent tasks (parent_id = null)
5. Create subtasks (parent_id != null) - MUST be after step 4
6. Set dependencies - MUST be after all tasks exist

**Rejected Alternative:** Parallel API calls where possible
- Would complicate orchestration (Promise.all, error aggregation)
- Marginal time savings (network latency dominates, not parallelism)
- V1 prioritizes correctness over speed
- Parent-child ordering would still require sequencing

---

### Decision 3: No State Management Library

**Choice:** Module-scoped variables, manual re-renders, savedBlueprint for Cancel

**Reasoning:**
- Blueprint editor state is simple: one object with arrays
- No complex interactions between components
- No cross-module state sharing needed
- Manual `refreshEditor()` is 10 lines of code vs Redux setup
- Cancel/Undo: Deep copy savedBlueprint, restore on demand

**Rejected Alternative:** Redux, Zustand, or custom state system
- Adds dependency, boilerplate, learning curve
- V1 doesn't need time-travel debugging or state inspection
- Follows existing app pattern (no state library elsewhere)

---

### Decision 4: Single Table, No Versioning

**Choice:** One `project_templates` table, overwrite on save

**Reasoning:**
- V1 use case: small team, few templates, trust-based editing
- Versioning requires `template_versions` table, version comparison UI
- Users can manually clone if they want to preserve old version
- RLS already handles permissions (own templates only)

**Rejected Alternative:** Full version control system
- Would need:
  - `template_versions` table (id, template_id, version_number, blueprint_data, created_at)
  - UI to view version history
  - UI to revert to previous version (creates new version)
  - Version number increment logic (major.minor.patch? auto-increment?)
- NOT in V1: Too complex for MVP validation. User can manually clone template to preserve old version.

---

### Decision 5: Client-Side Validation Only

**Choice:** Validate blueprint structure in browser before save/generate

**Reasoning:**
- Blueprint data is fully available client-side
- No server round-trip needed for validation
- Instant feedback to user
- Server trust isn't an issue (user can only hurt their own data)

**Rejected Alternative:** Server-side validation endpoint
- Would require API route, server-side validation logic duplication
- Adds latency to validation feedback
- V1 doesn't need this defense-in-depth

---

### Decision 6: Errors Block, Warnings Allow

**Choice:** Distinguish between fatal errors and advisory warnings

**Reasoning:**
- Circular dependencies will break Odoo → must block
- Empty stage is unusual but valid → warn but allow
- Gives user guidance without being dictatorial

**Rejected Alternative:** Block everything that's not "perfect"
- Would frustrate users who have valid edge cases
- Reduces flexibility unnecessarily

**Rejected Alternative:** Allow everything, no validation
- Users would create broken structures
- Odoo API errors would be cryptic

---

## Data Flow

### Create Template Flow

```
User clicks "New Template"
  ↓
Editor loads with empty blueprint (browser state)
savedBlueprint = deep copy of empty blueprint
  ↓
User adds task stages, milestones, tasks (with subtasks), dependencies
  ↓
User clicks "Validate"
  ↓
Validation runs (pure JS function, checks parent_id validity, circular hierarchies)
  ↓
Errors/warnings displayed
  ↓
User clicks "Cancel" (optional)
  → Executes: "Discard all unsaved changes and restore last persisted blueprint state"
  → currentBlueprint = deep copy of savedBlueprint
  ↓
User clicks "Save" (if no errors)
  ↓
Prompt for template name
  ↓
INSERT into project_templates (Supabase)
  ↓
RLS checks user_id = auth.uid()
  ↓
Template saved
savedBlueprint = deep copy of currentBlueprint (update saved state)
  ↓
Redirect to template library
```

**No server-side logic. No background jobs. No queues. No bidirectional sync.**

---

### Generate Project Flow

```
User selects template
  ↓
User clicks "Generate Project"
  ↓
User enters project name
  ↓
User clicks "Create"
  ↓
Frontend calls generateProject(name, blueprint)
  ↓
Sequential Odoo API calls (6-step sequence, EXACT order):
  1. createProject(name) → projectId
  2. createTaskStages(projectId, taskStages) → taskStageMap
     (project.task.type with project_ids linkage - NOT project-level stages)
  3. createMilestones(projectId, milestones) → milestoneMap
  4. createParentTasks(projectId, tasks where parent_id=null, milestoneMap) → taskMap
  5. createSubtasks(projectId, tasks where parent_id!=null, milestoneMap, taskMap) → update taskMap
     (MUST come after step 4 - children require parent IDs)
  6. setDependencies(taskMap, dependencies)
     (MUST come after all tasks exist - requires complete taskMap)
  ↓
Success → show success message, project fully autonomous in Odoo
Error → show error message, user manually cleans up (no automatic rollback)
  ↓
Template and Odoo project: ZERO connection from this point forward
No sync (never), no updates (never), no reflection (never)
```

**Critical:**
- 6 steps (not 5) - subtask ordering requires separate pass
- One-way push only: Template → Odoo, then disconnected forever
- No rollback, no audit log, no bidirectional sync

---

## UX Choices

### Why 3-Column Layout in Editor?

**Reasoning:**
- Task Stages, Milestones, Tasks & Subtasks are conceptually distinct
- Side-by-side view shows relationships clearly
- No scrolling needed for small structures
- Matches mental model: task stage → milestone → task → subtask
- **Terminology Correction:** "Task Stages" (not "Stages") to distinguish from project-level stages

**Alternative Rejected:** Single-column accordion
- Would hide information
- More clicking to see full structure

---

### Why Prompt for Dependency Selection?

**Reasoning:**
- V1 has no modal system
- `prompt()` is built-in, zero code
- Lists available tasks clearly
- Works for small number of tasks (<20)

**Alternative Rejected:** Dropdown select
- Would work, slightly better UX
- Acceptable to upgrade in V2

**Alternative Rejected:** Visual graph with click-to-connect
- Overkill for V1
- Requires graph library

---

### Why Table View for Template Library?

**Reasoning:**
- Simple, fast to render
- Shows essential info: name, date, actions
- Sortable by browser (click column header)
- DaisyUI provides `table-zebra` for free

**Alternative Rejected:** Grid/card view with previews
- Would need thumbnail generation
- More visual, less information-dense
- Can add as toggle in V2

---

## Integration Points

### Why Register in `modules/registry.js`?

**Reasoning:**
- App already has module registration system
- Sales Insight Explorer uses this pattern
- Consistent with existing architecture
- No need to invent new registration

---

### Why Use `src/lib/odoo.js` Directly?

**Reasoning:**
- Already exists and works
- `executeKw` method handles all Odoo RPC
- No need to wrap or abstract
- Keep it simple

---

### Why Use `src/lib/database.js` Directly?

**Reasoning:**
- Already has Supabase client
- RLS policies work transparently
- No need for repository pattern in V1
- Direct queries are clear and debuggable

---

## Risk Mitigation

### Risk: Partial Project Creation on Error

**V1 Reality:**
- Show clear error message
- User manually cleans up in Odoo (acceptable for MVP validation)

**NOT in V1 (too complex):**
- Implement rollback: would require tracking all created IDs, delete in reverse order on failure
- Would require error aggregation, API call orchestration
- Deferred until V1 proves core workflow value

---

### Risk: Circular Dependency Not Detected

**Mitigation in V1:**
- Graph cycle detection algorithm in validation.js
- Error blocks save if cycle found
- Tested with unit tests (future)

**Future Mitigation:**
- Add visual graph to show cycles clearly

---

### Risk: User Edits Template, Expects Old Projects to Update

**Reality in V1:**
- Templates and Odoo projects have ZERO connection after generation
- Template changes affect ONLY new generations (never retroactive)
- This is by design, not a limitation

**Mitigation:**
- Clear messaging: "Templates only affect NEW projects"
- No link from template to instances (architectural decision)
- Odoo projects are fully autonomous after creation

**This is NOT:**
- Something to "fix" in future versions
- A missing feature
- A limitation to overcome

**This IS:**
- Deliberate architectural choice
- One-way data flow by design
- Prevents complexity, conflicts, and confusion

---

### Risk: Template Grows Too Large (>100 tasks)

**Mitigation in V1:**
- Warning shown if >50 tasks
- User can proceed anyway
- Performance target: <15s for 50 tasks + 20 subtasks
- Odoo API may timeout (unlikely with sequential calls)

**NOT in V1 (wait for actual performance issues):**
- Batch API calls (create tasks in groups of 10)
- Progress indicator with steps
- Queue system

---

## Why NO Bidirectional Sync (Architectural Principle)

**This is absolutely critical to understand:**

**One-Way Data Flow:**
```
Template → Odoo Project
(design)   (runtime, fully autonomous)

After generation: ZERO connection
```

**Why NO sync (ever):**
1. **Complexity:** Tracking changes in Odoo, detecting conflicts, merging updates
2. **Scope:** Odoo is the source of truth for runtime project data
3. **User Expectation:** PMs manage projects in Odoo, not in this module
4. **Data Model:** Odoo adds fields (assigned_to, actual_hours, attachments, comments) not in template
5. **Conflict Resolution:** Unsolvable - if user changes Odoo task name, which wins?
6. **Odoo is Leading:** Generator adapts to Odoo. Sync would require Odoo to adapt to generator.

**V1 Stance (Absolute):**
- This module is a **project initializer**, NOT a **project manager**
- Once created, project is 100% Odoo-native, fully autonomous
- Template modifications affect ONLY new generations (never retroactive)
- User freedom in Odoo is unrestricted (no constraints from generator)
- After generation: template and project are permanently disconnected

**This is NOT open for negotiation:**
- No sync in V1
- No sync in V2
- No sync ever
- If user wants sync → wrong tool, use Odoo's native features

**What sync would require (why it violates principles):**
- Would require `generated_projects` table linking template_id → odoo_project_id
- Would require change detection in Odoo (polling? webhooks?)
- Would require conflict resolution UX
- Would require Odoo to "remember" generator metadata (violates Odoo-is-leading principle)
- Massively increases complexity
- Fundamentally incompatible with "Odoo is leading" principle

**Decision (final): One-way push only. Forever.**

---

## Success Metrics (How We Know V1 Works)

### Functional Success
1. ✅ User can create template with 10 tasks + subtasks in <5 minutes
2. ✅ User can generate project in <30 seconds
3. ✅ Generated project appears in Odoo with correct structure (including subtask parent_id)
4. ✅ Validation catches circular dependencies (both task dependencies and parent hierarchies)
5. ✅ Warnings display without blocking save
6. ✅ Cancel button restores last persisted blueprint state (no step-by-step undo needed)

### Technical Success
1. ✅ No crashes or unhandled errors
2. ✅ RLS prevents users from seeing others' templates
3. ✅ Odoo API calls succeed with valid data
4. ✅ Blueprint data serializes/deserializes correctly

### User Success
1. ✅ User doesn't need documentation to use basic features
2. ✅ Error messages are clear and actionable
3. ✅ User can recover from mistakes (delete template, delete project)

**NOT Measuring in V1:**
- User adoption rate
- Time saved vs manual setup
- Template reuse frequency
- User satisfaction scores

---

## Future Expansion Considerations (NOT V1 Scope)

**These features are explicitly EXCLUDED from V1. They represent potential post-MVP expansions, NOT commitments:**

1. **Versioning System - NOT in V1**
   - **Excluded:** Track template versions, view version history, revert to previous version, compare versions (diff view)
   - **V1 Reality:** Single version only, overwrite on save. If user wants to preserve old version, manually clone template first.

2. **Audit Trail - NOT in V1**
   - **Excluded:** Log every project generation, show which template version was used, link to generated Odoo project
   - **V1 Reality:** No generation history tracking. Templates are simple enough to recreate if needed.

3. **Advanced Validation - NOT in V1**
   - **Excluded:** Complexity score, critical path calculation, bottleneck detection, best practice suggestions
   - **V1 Reality:** Basic validation only (errors block generation, warnings allow with confirmation). Sufficient for MVP validation.

4. **UX Polish - NOT in V1**
   - **Excluded:** Visual dependency graph, drag-and-drop reordering, modal dialogs, keyboard shortcuts, auto-save draft, confetti animations
   - **V1 Reality:** Simple forms, prompt/confirm dialogs, manual save, Cancel returns to last saved state. Deliberately minimal for fast validation.

5. **Template Library Enhancements - NOT in V1**
   - **Excluded:** Search/filter, categories/tags, usage statistics, template preview
   - **V1 Reality:** Simple table with browser Ctrl+F for search. Acceptable for small template libraries during validation phase.

6. **Generation Improvements - NOT in V1**
   - **Excluded:** Rollback on error, progress indicator with steps, batch generation, schedule generation, link to Odoo project after creation
   - **V1 Reality:** No rollback (user manually deletes partial project in Odoo), simple loading spinner, one-at-a-time generation, manual trigger, no automatic link to created project. Acceptable for MVP validation.

7. **Data Enhancements - PARTIALLY in V1**
   - **✅ IN V1:** Subtasks (MANDATORY via parent_id field - essential for process thinking)
   - **NOT in V1:** Task descriptions, estimated hours, task assignments, tags, stage colors
   - **V1 Reality:** Task names only + parent_id for hierarchy. Metadata expansion deferred until core workflow validated.

8. **Collaboration - NOT in V1**
   - **Excluded:** Share templates with team, template approval workflow, lock/unlock templates, comments on templates
   - **V1 Reality:** User-owned templates only (Supabase RLS). Sharing functionality deferred until single-user workflow validated.

**Critical Reminder:**
- Subtasks ARE in V1 (MANDATORY - only item from this entire list)
- Everything else is explicitly OUT of V1 scope
- These are POSSIBILITIES for post-MVP expansion, NOT commitments
- V1 must prove core workflow value before ANY expansion
- No expansion decisions until V1 deployed and user feedback collected

---

## Conclusion

This V1 scope is **deliberately minimal** because:

1. **Proven Value First:** Validate core workflow before adding features
2. **Fast to Build:** Days, not weeks (~4 days estimated)
3. **Easy to Understand:** New developers can grasp it quickly
4. **Low Risk:** Small surface area, few failure modes
5. **Expansion Possible Later:** Can expand systematically after V1 validates core workflow
6. **Odoo is Leading:** Generator adapts, never extends or modifies Odoo

**This is NOT feature poverty. This is disciplined product development.**

The V1 delivers:
- ✅ Template creation
- ✅ Template editing
- ✅ Template deletion
- ✅ Project generation
- ✅ Validation

**Everything else is explicitly excluded until V1 proves value.**

**This document is the source of truth for WHY V1 looks like it does.**
