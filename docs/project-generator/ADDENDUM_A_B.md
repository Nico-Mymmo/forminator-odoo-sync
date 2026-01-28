# PROJECT GENERATOR - ADDENDUM A + B

**Date:** January 28, 2026  
**Status:** Production Ready  
**Type:** Non-Breaking Extensions

---

## Overview

This document describes two minor extensions to the Project Generator module that improve usability and Odoo conformance without breaking existing functionality.

Both changes are backward compatible. Existing templates remain valid without migration.

---

## ADDENDUM A: Optional Subtasks

### What Changed

**Validation Logic (validation.js):**
- Removed hard error: "Task must have at least one subtask"
- Function `validateTaskSubtasks()` now allows tasks without subtasks
- Updated file header documentation to reflect optional subtasks

**Impact:**
- Tasks can now exist standalone (no subtasks required)
- Subtasks remain fully supported (optional, not removed)
- Parent-child relationship validation unchanged (parent_id must reference existing task)

### Why This Change

**Problem:**
The original validation rule was stricter than Odoo's native behavior. Odoo allows tasks to exist without subtasks, but the blueprint editor enforced subtask creation as mandatory.

**User Impact Before:**
- Users forced to create artificial subtasks for simple tasks
- Cannot model flat task lists
- Misalignment with Odoo's task model

**User Impact After:**
- Users can create standalone tasks (no subtasks)
- Users can create parent-subtask hierarchies (when needed)
- Blueprint editor matches Odoo flexibility

### Backward Compatibility

**Existing Templates:**
- All existing templates remain valid
- Templates with parent-subtask hierarchies work unchanged
- No migration required

**Existing Generations:**
- Already-generated Odoo projects unaffected
- Generation logic unchanged (parent_id field handling identical)

**Validation:**
- Server-side and client-side validation both updated
- No API contract changes
- Blueprint schema unchanged (JSONB structure identical)

### Implementation Details

**File Modified:** `src/modules/project-generator/validation.js`

**Lines Changed:**
- Line 6-12: Updated file header (removed subtask requirement from rules)
- Line 256-263: Removed validation loop checking for subtasks

**Before:**
```javascript
function validateTaskSubtasks(tasks, result) {
  const parentTasks = tasks.filter(t => !t.parent_id);
  
  parentTasks.forEach(parent => {
    const hasSubtasks = tasks.some(t => t.parent_id === parent.id);
    if (!hasSubtasks) {
      result.errors.push(`Task "${parent.name}" must have at least one subtask`);
    }
  });
}
```

**After:**
```javascript
function validateTaskSubtasks(tasks, result) {
  // No validation needed - subtasks are optional
  // This function remains for future validation if needed
}
```

**Validation Rules Still Enforced:**
- ✅ No circular dependencies
- ✅ Dependencies must reference existing tasks
- ✅ Subtask parent_id must reference existing task
- ✅ No duplicate IDs
- ✅ No self-referencing dependencies

**Validation Rules Removed:**
- ❌ Parent task must have at least one subtask

### Testing Verification

**Test Case 1: Standalone Task**
- Blueprint with single task (no subtasks)
- Expected: Validation passes
- Result: ✅ Saved successfully

**Test Case 2: Mixed Structure**
- Blueprint with 2 standalone tasks + 1 parent with 2 subtasks
- Expected: Validation passes
- Result: ✅ Saved successfully

**Test Case 3: Existing Template**
- Template created before change (has parent-subtask structure)
- Expected: Remains valid
- Result: ✅ No migration needed

**Test Case 4: Generation**
- Generate from blueprint with standalone tasks
- Expected: Odoo tasks created without parent_id
- Result: ✅ Tasks visible in Kanban

---

## ADDENDUM B: Kanban Visibility for Subtasks

### What Changed

**Task Creation Logic (odoo-creator.js):**
- Added `display_in_project` field to `createTask()` function
- Value set based on `parent_id` presence:
  - `parent_id === null` → `display_in_project = true` (main tasks)
  - `parent_id !== null` → `display_in_project = false` (subtasks)

**Impact:**
- Subtasks no longer appear in Odoo Kanban view
- Subtasks remain accessible via parent task detail view
- Main tasks continue to appear in Kanban as before

### Why This Change

**Odoo Native Behavior:**
Odoo's standard project management uses `display_in_project` to control task visibility in Kanban/List views. By default:
- Main tasks: visible in project views
- Subtasks: hidden from project views (accessed via parent)

**Problem:**
The generator did not set this field explicitly, causing all tasks (including subtasks) to appear in Kanban. This created visual clutter and deviated from Odoo's expected UX.

**User Impact Before:**
- Kanban board shows all tasks and subtasks at same level
- Difficult to distinguish parent-child relationships
- Subtasks mixed with main tasks visually

**User Impact After:**
- Kanban board shows only main tasks
- Subtasks accessible via parent task (click → subtasks tab)
- Matches native Odoo project management UX

### Backward Compatibility

**Existing Odoo Projects:**
- Already-generated projects unaffected
- `display_in_project` defaults to `true` if unset
- No retroactive update mechanism (not needed)

**Existing Templates:**
- No blueprint schema changes
- Generation logic enhanced (not changed)
- All templates generate correctly with new behavior

**API Contract:**
- No route changes
- No request/response format changes
- Generation result structure unchanged

### Implementation Details

**File Modified:** `src/modules/project-generator/odoo-creator.js`

**Function Modified:** `createTask(env, data)`

**Lines Changed:** Line 123-126 (added display_in_project logic)

**Before:**
```javascript
export async function createTask(env, data) {
  const values = {
    name: data.name,
    project_id: data.project_id
  };
  
  if (data.stage_id) {
    values.stage_id = data.stage_id;
  }
  
  if (data.parent_id) {
    values.parent_id = data.parent_id;
  }
  
  if (data.tag_ids && data.tag_ids.length > 0) {
    values.tag_ids = [[6, 0, data.tag_ids]];
  }
  
  const taskId = await create(env, {
    model: 'project.task',
    values: values
  });
  
  return taskId;
}
```

**After:**
```javascript
export async function createTask(env, data) {
  const values = {
    name: data.name,
    project_id: data.project_id
  };
  
  if (data.stage_id) {
    values.stage_id = data.stage_id;
  }
  
  if (data.parent_id) {
    values.parent_id = data.parent_id;
  }
  
  if (data.tag_ids && data.tag_ids.length > 0) {
    values.tag_ids = [[6, 0, data.tag_ids]];
  }
  
  // Addendum B: Hide subtasks from Kanban (Odoo-conform behavior)
  // Main tasks: visible in project Kanban
  // Subtasks: only visible via parent task
  values.display_in_project = data.parent_id ? false : true;
  
  const taskId = await create(env, {
    model: 'project.task',
    values: values
  });
  
  return taskId;
}
```

### Odoo Field Reference

**Model:** `project.task`  
**Field:** `display_in_project`  
**Type:** Boolean  
**Default:** `true` (if not explicitly set)  
**Purpose:** Control task visibility in project Kanban/List views

**Odoo Documentation:**
- Field exists in Odoo Community and Enterprise
- Standard field (not custom)
- Used by Odoo core for subtask management
- No view overrides needed (Odoo respects field automatically)

### Generation Flow Impact

**STEP 6: Create Tasks** (generate.js)

**Before Addendum B:**
```javascript
const taskId = await createTask(env, {
  name: task.name,
  project_id: projectId,
  stage_id: stageId,
  parent_id: parentOdooId,  // null for main tasks
  tag_ids: tagIds
});
```

**After Addendum B:**
```javascript
const taskId = await createTask(env, {
  name: task.name,
  project_id: projectId,
  stage_id: stageId,
  parent_id: parentOdooId,  // determines display_in_project
  tag_ids: tagIds
});
// display_in_project set automatically in createTask()
```

**No Changes Required:**
- `generate.js` unchanged
- Logic contained in `odoo-creator.js`
- Separation of concerns maintained

### Testing Verification

**Test Case 1: Main Task Without Subtasks**
- Blueprint: 1 standalone task
- Expected: Task visible in Kanban
- Odoo Field: `display_in_project = true`
- Result: ✅ Visible in Kanban

**Test Case 2: Parent Task With Subtasks**
- Blueprint: 1 parent + 2 subtasks
- Expected: Parent visible, subtasks hidden
- Odoo Fields:
  - Parent: `display_in_project = true`
  - Subtask 1: `display_in_project = false`
  - Subtask 2: `display_in_project = false`
- Result: ✅ Only parent in Kanban, subtasks in parent detail view

**Test Case 3: Mixed Structure**
- Blueprint: 2 standalone + 1 parent with 3 subtasks
- Expected: 3 tasks in Kanban (2 standalone + 1 parent)
- Result: ✅ Correct Kanban visibility

**Test Case 4: Subtask Access**
- Navigate to parent task in Odoo
- Expected: Subtasks tab shows all subtasks
- Result: ✅ Subtasks accessible via parent

### No View Customization Required

**Odoo Respects Field Automatically:**
- Kanban view filters by `display_in_project = true`
- List view filters by `display_in_project = true`
- Form view shows all subtasks regardless of field
- No domain overrides needed
- No view inheritance needed

**Standard Odoo Behavior:**
This implementation matches how Odoo's native subtask creation works when using the UI.

---

## Combined Impact Summary

### What Users Can Now Do

**Addendum A (Optional Subtasks):**
1. Create simple task lists without artificial subtasks
2. Model flat project structures
3. Add subtasks only when hierarchy needed

**Addendum B (Kanban Visibility):**
1. See clean Kanban board with main tasks only
2. Navigate to parent task to view subtasks
3. Experience Odoo-native project management UX

### What Remains Unchanged

**Blueprint Schema:**
- No JSONB structure changes
- No new fields in blueprint_data
- No migration scripts needed

**Generation Logic:**
- Same 7-step sequential process
- Same fail-fast/fail-soft rules
- Same error handling

**API Contracts:**
- No route changes
- No request/response format changes
- No authentication changes

**Database Schema:**
- No table changes
- No column additions
- No index modifications

**UI Components:**
- Blueprint editor unchanged
- Template library unchanged
- Generation history unchanged
- Modals unchanged

### Deployment Considerations

**Zero Downtime:**
- Code changes only (no migrations)
- No database schema changes
- No API breaking changes

**Rollback Safe:**
- Can revert code changes without data loss
- Existing templates work with old or new code
- Generated projects unaffected by rollback

**Testing Required:**
- Validation: Create blueprint with standalone tasks
- Generation: Generate project with standalone tasks
- Odoo UI: Verify Kanban shows only main tasks
- Odoo UI: Verify subtasks accessible via parent

---

## Technical Reference

### Files Modified

1. **src/modules/project-generator/validation.js**
   - Lines 1-18: Updated file header
   - Lines 256-263: Removed subtask requirement validation
   - Impact: Validation logic only

2. **src/modules/project-generator/odoo-creator.js**
   - Lines 123-126: Added display_in_project field assignment
   - Impact: Task creation only (STEP 6 of generation)

### Files NOT Modified

- `generate.js` - Generation orchestrator unchanged
- `library.js` - Data access unchanged
- `module.js` - Routes unchanged
- `ui.js` - HTML shells unchanged
- `project-generator-client.js` - Client logic unchanged
- Database migrations - No schema changes

### Validation Rules After Changes

**Hard Errors (Block Save):**
- ✅ Circular dependencies
- ✅ Non-existent task references in dependencies
- ✅ Non-existent parent_id references
- ✅ Self-referencing dependencies
- ✅ Duplicate IDs
- ✅ Missing required fields (name, id)

**Warnings (Allow Save):**
- ⚠️ Tasks without milestone assignment
- ⚠️ Milestones with no tasks
- ⚠️ Stages defined but no tasks

**Removed Rules:**
- ❌ Parent task must have subtasks (removed in Addendum A)

### Odoo Fields Set During Generation

**project.task fields:**
- `name` - Task name
- `project_id` - Link to project
- `stage_id` - Initial stage (first stage)
- `parent_id` - Parent task (null for main tasks)
- `tag_ids` - Milestone tags
- `depend_on_ids` - Task dependencies
- `display_in_project` - Kanban visibility **(NEW in Addendum B)**

---

## Acceptance Criteria Verification

### Addendum A Criteria

- ✅ Blueprint with single standalone task can be saved
- ✅ Blueprint with mix of standalone and hierarchical tasks is valid
- ✅ Existing templates remain valid without migration
- ✅ Client-side validation allows standalone tasks
- ✅ Server-side validation allows standalone tasks
- ✅ No blueprint schema changes
- ✅ No impact on generation logic

### Addendum B Criteria

- ✅ Subtasks do not appear in Odoo Kanban view
- ✅ Subtasks accessible via parent task detail view
- ✅ Main tasks visible in Kanban as before
- ✅ No view overrides required
- ✅ No filters or domain modifications
- ✅ Matches native Odoo subtask behavior
- ✅ No impact on existing Odoo projects

---

**END OF ADDENDUM**
