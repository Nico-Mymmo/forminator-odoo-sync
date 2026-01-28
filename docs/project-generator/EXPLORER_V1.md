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
- **Why No Auto-Save:** Reduces complexity, user controls when to commit
- **Why No Undo/Redo:** Browser refresh is the "undo" in V1

**2. Template Storage**
- **Why Supabase:** Already integrated, RLS handles permissions
- **Why Single Table:** No versioning in V1 keeps it simple
- **Why JSONB for Blueprint:** Flexible, no schema changes needed for structure tweaks
- **Why No Status Field:** Draft/published workflow deferred to V2

**3. Odoo Project Creation**
- **Why Sequential API Calls:** Simpler than parallel, dependencies are clear
- **Why No Rollback:** Complex to implement, V1 assumes success path
- **Why Stages/Milestones/Tasks Only:** These are the essential building blocks
- **Why No Subtasks:** Adds complexity, can be added in Odoo after creation

**4. Validation**
- **Why Errors vs Warnings:** Some things must be correct (no circular deps), others are advisory
- **Why Client-Side Only:** No server-side validation needed, client has full context
- **Why Simple Detection:** Circular dependency check is essential, other validations are nice-to-have

### What We Excluded (and Why)

**❌ Version Control**
- **Why Not V1:** Adds tables, UX complexity (viewing history, reverting, diffing)
- **Workaround:** User can manually clone a template if needed
- **Future:** V2+ feature when patterns emerge

**❌ Audit Trail**
- **Why Not V1:** Requires separate table, query complexity, UI to view logs
- **Workaround:** None needed - templates are simple enough to recreate
- **Future:** V2+ if compliance becomes critical

**❌ Rollback on Error**
- **Why Not V1:** Complex orchestration, requires tracking all created IDs, calling delete APIs
- **Workaround:** User manually deletes partial project in Odoo if generation fails
- **Future:** V2+ with proper transaction management

**❌ Subtasks**
- **Why Not V1:** Adds nesting complexity in editor UI, dependency graph becomes multi-level
- **Workaround:** Users can add subtasks directly in Odoo after project creation
- **Future:** V2+ if users demand it

**❌ Drag-and-Drop Reordering**
- **Why Not V1:** Requires drag library or custom implementation, adds visual complexity
- **Workaround:** Use simple up/down buttons or re-create items
- **Future:** V2+ UX polish

**❌ Visual Dependency Graph**
- **Why Not V1:** Requires graph rendering library (D3.js, Vis.js), layout algorithms
- **Workaround:** Text list of dependencies per task
- **Future:** V2+ if dependency complexity justifies it

**❌ Template Search/Filter**
- **Why Not V1:** Limited templates expected initially, table view sufficient
- **Workaround:** Use browser Ctrl+F
- **Future:** V2+ when template library grows

**❌ Import/Export**
- **Why Not V1:** JSON serialization already exists in JSONB field, no pressing need
- **Workaround:** Direct database access if needed
- **Future:** V2+ for sharing templates across instances

**❌ Keyboard Shortcuts**
- **Why Not V1:** Requires key binding library, discoverability UX (cheat sheet)
- **Workaround:** Mouse-only interaction acceptable for V1
- **Future:** V2+ UX polish

**❌ Confetti Animation**
- **Why Not V1:** Pure polish, zero functional value
- **Workaround:** Simple success message
- **Future:** Maybe never (nice to have, not necessary)

---

## Architectural Decisions

### Decision 1: No New Abstractions

**Choice:** Use existing `odoo.js` directly, no wrapper layer

**Reasoning:**
- App already has `executeKw` pattern in `odoo.js`
- Abstracting it adds files, indirection, mental overhead
- V1 needs are simple: `create` and `write` calls
- Future refactoring can happen if complexity grows

**Rejected Alternative:** Create `OdooProjectService` class
- Would add `src/modules/project-generator/services/odoo-project-service.js`
- Would require defining interfaces, error handling patterns
- Overkill for ~100 lines of code

---

### Decision 2: Sequential API Calls

**Choice:** Call Odoo APIs one at a time, wait for each to complete

**Reasoning:**
- Dependencies matter: can't create tasks without project ID
- Dependencies matter: can't set task dependencies without task IDs
- Error handling simpler: know exactly which step failed
- Performance acceptable: <10s for 50 tasks is fine

**Rejected Alternative:** Parallel API calls where possible
- Would complicate orchestration (Promise.all, error aggregation)
- Marginal time savings (network latency dominates, not parallelism)
- V1 prioritizes correctness over speed

---

### Decision 3: No State Management Library

**Choice:** Module-scoped variables, manual re-renders

**Reasoning:**
- Blueprint editor state is simple: one object with arrays
- No complex interactions between components
- No cross-module state sharing needed
- Manual `refreshEditor()` is 10 lines of code vs Redux setup

**Rejected Alternative:** Redux, Zustand, or custom state system
- Adds dependency, boilerplate, learning curve
- V1 doesn't need time-travel debugging or state inspection
- Can refactor later if complexity grows

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
- Deferred to V2+ when patterns emerge (how often do users version? do they need diffs?)

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
  ↓
User adds stages, milestones, tasks, dependencies
  ↓
User clicks "Validate"
  ↓
Validation runs (pure JS function)
  ↓
Errors/warnings displayed
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
  ↓
Redirect to template library
```

**No server-side logic. No background jobs. No queues.**

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
Sequential Odoo API calls:
  1. createProject(name) → projectId
  2. createStages(projectId, stages) → stageMap
  3. createMilestones(projectId, milestones) → milestoneMap
  4. createTasks(projectId, tasks, milestoneMap) → taskMap
  5. setDependencies(taskMap, dependencies)
  ↓
Success → show success message
Error → show error message
  ↓
No rollback, no audit log
```

**Deterministic, sequential, simple.**

---

## UX Choices

### Why 3-Column Layout in Editor?

**Reasoning:**
- Stages, Milestones, Tasks are conceptually distinct
- Side-by-side view shows relationships clearly
- No scrolling needed for small structures
- Matches mental model: stage → milestone → task

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

**Mitigation in V1:**
- Show clear error message
- User manually cleans up in Odoo

**Future Mitigation (V2+):**
- Implement rollback: track all created IDs, delete in reverse order on failure
- Requires error aggregation, API call orchestration

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

**Mitigation in V1:**
- Clear messaging: "Templates only affect NEW projects"
- No link from template to instances
- Odoo projects are independent after creation

**Future Mitigation:**
- Add generation audit log showing which template version was used

---

### Risk: Template Grows Too Large (>100 tasks)

**Mitigation in V1:**
- Warning shown if >50 tasks
- User can proceed anyway
- Odoo API may timeout (unlikely, sequential calls)

**Future Mitigation:**
- Batch API calls (create tasks in groups of 10)
- Show progress indicator with steps

---

## Why NOT Bidirectional Sync?

**This is critical to understand:**

**Reasons:**
1. **Complexity:** Tracking changes in Odoo, detecting conflicts, merging updates
2. **Scope:** Odoo is the source of truth for runtime project data
3. **User Expectation:** PMs manage projects in Odoo, not in this module
4. **Data Model:** Odoo adds fields (assigned_to, actual_hours, attachments) not in template
5. **Conflict Resolution:** What if user changes Odoo task name, then regenerates from template?

**V1 Stance:**
- This module is a **project initializer**, not a **project manager**
- Once created, project is 100% Odoo-native
- Template modifications don't propagate
- User freedom in Odoo is unrestricted

**If V2+ Needs Sync:**
- Would require `generated_projects` table linking template_id → odoo_project_id
- Would require change detection in Odoo (polling? webhooks?)
- Would require conflict resolution UX
- Massively increases complexity

**Decision: V1 is one-way push only.**

---

## Success Metrics (How We Know V1 Works)

### Functional Success
1. ✅ User can create template with 10 tasks in <5 minutes
2. ✅ User can generate project in <30 seconds
3. ✅ Generated project appears in Odoo with correct structure
4. ✅ Validation catches circular dependencies
5. ✅ Warnings display without blocking save

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

## Future Expansion Paths (V2+ Ideas)

**If V1 succeeds, consider:**

1. **Versioning System**
   - Track template versions
   - View version history
   - Revert to previous version
   - Compare versions (diff view)

2. **Audit Trail**
   - Log every project generation
   - Show which template version was used
   - Link to generated Odoo project (if accessible)

3. **Advanced Validation**
   - Complexity score
   - Critical path calculation
   - Bottleneck detection
   - Best practice suggestions

4. **UX Polish**
   - Visual dependency graph
   - Drag-and-drop reordering
   - Modal dialogs instead of prompt/confirm
   - Keyboard shortcuts
   - Auto-save draft

5. **Template Library Enhancements**
   - Search and filter
   - Categories/tags
   - Usage statistics
   - Template preview

6. **Generation Improvements**
   - Rollback on error
   - Progress indicator with steps
   - Batch generation
   - Schedule generation
   - Link to Odoo project after creation

7. **Data Enhancements**
   - Subtasks
   - Task descriptions
   - Estimated hours
   - Task assignments (if user mapping exists)
   - Tags

8. **Collaboration**
   - Share templates with team
   - Template approval workflow
   - Lock/unlock templates
   - Comments on templates

**None of these are in V1. V1 is minimal, functional, proven.**

---

## Conclusion

This V1 scope is **intentionally minimal** because:

1. **Proven Value First:** Validate core workflow before adding features
2. **Fast to Build:** Days, not weeks
3. **Easy to Understand:** New developers can grasp it quickly
4. **Low Risk:** Small surface area, few failure modes
5. **Foundation for Future:** Can expand systematically if users demand it

**This is NOT feature poverty. This is disciplined product development.**

The V1 delivers:
- ✅ Template creation
- ✅ Template editing
- ✅ Template deletion
- ✅ Project generation
- ✅ Validation

**Everything else is V2+.**

**This document is the source of truth for WHY V1 looks like it does.**
