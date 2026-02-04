# Addendum O: Stage Semantics and Workflow Integration

**Date:** 2026-02-04  
**Updated:** 2026-02-04 (Added Approved stage)  
**Related to:** Project Generator Module  
**Dependencies:** Odoo v14+, project.task.type model with custom fields `x_is_done_stage`, `x_is_approved_stage`, and `x_is_cancelled_stage`

---

## 1. Overview

This addendum documents the implementation of **stage semantics** in the Project Generator. Stage semantics allow users to designate specific stages in a blueprint with semantic meaning ("Done", "Approved", "Cancelled"), which are then used by Odoo's workflow automation.

### Problem Statement

In Odoo project management:
- **Stages** are visual workflow columns (e.g., "To Do", "In Progress", "Testing", "Done")
- **State** and other workflow logic depend on understanding which stages have special meaning

Without semantic markers, workflows must rely on fragile stage names or sequences. Property-driven semantics provide a robust, language-agnostic solution.

### Solution

The Project Generator now:
1. Allows users to mark stages with semantic properties:
   - **Done stage** (required, exactly 1)
   - **Cancelled stage** (required, exactly 1)  
   - **Approved stage** (optional, max 1)
2. Maps these flags to Odoo custom fields (`x_is_done_stage`, `x_is_approved_stage`, `x_is_cancelled_stage`)
3. Validates constraints before project generation
4. Provides clear UI indicators and error messages

---

## 2. Odoo Integration

### Custom Fields

The Odoo database must have these boolean fields on `project.task.type`:

```xml
<field name="x_is_done_stage" type="boolean" string="Done Stage"/>
<field name="x_is_approved_stage" type="boolean" string="Approved Stage"/>
<field name="x_is_cancelled_stage" type="boolean" string="Cancelled Stage"/>
```

### Workflow Automation

Odoo automated actions (Server Actions) read these flags to drive workflow behavior. The Project Generator does **not** implement this logic—it only sets the semantic flags. Odoo handles the rest.

**Example automated action pattern:**

```python
# Pseudo-code for Odoo automated action (implemented in Odoo, not in generator)
if record.stage_id.x_is_done_stage:
    record.state = '1_done'
elif record.stage_id.x_is_cancelled_stage:
    record.state = '1_canceled'
else:
    record.state = '01_in_progress'

# Approved stage might trigger different logic
if record.stage_id.x_is_approved_stage:
    # Custom approval workflow (implemented in Odoo)
    pass
```

This automation is **property-driven** (not name-driven or sequence-driven), making it robust against stage renaming or reordering.

**Note:** The Project Generator only sets these boolean flags. All workflow behavior is implemented in Odoo, not in the generator code.

---

## 3. Blueprint Data Model

### Stage Schema

Each stage in `blueprintState.stages` includes:

```javascript
{
  id: string,                     // Unique ID
  name: string,                   // Stage name (e.g., "In Progress")
  sequence: number,               // Display order (e.g., 10, 20, 30)
  is_done_stage: boolean,         // Mark as Done stage (optional)
  is_approved_stage: boolean,     // Mark as Approved stage (optional)
  is_cancelled_stage: boolean     // Mark as Cancelled stage (optional)
}
```

### Semantic Constraints

| Property              | Required | Max Count | Description                                    |
|-----------------------|----------|-----------|------------------------------------------------|
| `is_done_stage`       | Yes      | 1         | Stage where tasks are marked as completed      |
| `is_approved_stage`   | No       | 1         | Stage where tasks require formal approval      |
| `is_cancelled_stage`  | Yes      | 1         | Stage where tasks are marked as cancelled      |

### Mutual Exclusivity

A stage can have **at most one** semantic flag set. The UI enforces this with automatic checkbox toggling:
- Checking "Done" unchecks "Approved" and "Cancelled"
- Checking "Approved" unchecks "Done" and "Cancelled"
- Checking "Cancelled" unchecks "Done" and "Approved"

---

## 4. User Interface

### Stage Modal

The stage editor modal ([src/modules/project-generator/ui.js](../../src/modules/project-generator/ui.js#L476-L516)) includes checkboxes for all three semantic flags:

```html
<!-- Workflow Semantics Section -->
<div class="form-control">
  <label class="label">
    <span class="label-text font-semibold">Workflow Semantics</span>
  </label>
  
  <!-- Done Stage Checkbox (Green) -->
  <label class="label cursor-pointer justify-start gap-3">
    <input type="checkbox" id="stageIsDone" class="checkbox checkbox-success" />
    <div class="flex flex-col">
      <span class="label-text font-medium">Done Stage</span>
      <span class="label-text-alt">Tasks moved to this stage are marked as completed</span>
    </div>
  </label>
  
  <!-- Approved Stage Checkbox (Orange) -->
  <label class="label cursor-pointer justify-start gap-3">
    <input type="checkbox" id="stageIsApproved" class="checkbox checkbox-warning" />
    <div class="flex flex-col">
      <span class="label-text font-medium">Approved Stage</span>
      <span class="label-text-alt">Tasks in this stage require formal approval</span>
    </div>
  </label>
  
  <!-- Cancelled Stage Checkbox (Red) -->
  <label class="label cursor-pointer justify-start gap-3">
    <input type="checkbox" id="stageIsCancelled" class="checkbox checkbox-error" />
    <div class="flex flex-col">
      <span class="label-text font-medium">Cancelled Stage</span>
      <span class="label-text-alt">Tasks moved to this stage are marked as canceled</span>
    </div>
  </label>
  
  <!-- Info Alert -->
  <div role="alert" class="alert alert-info text-xs mt-2">
    <i data-lucide="info" class="w-4 h-4"></i>
    <span>Required: one Done and one Cancelled stage. Optional: up to one Approved stage.</span>
  </div>
</div>
```

### Mutual Exclusivity

The UI enforces 3-way mutual exclusivity via JavaScript event handlers:

```javascript
isDoneCheck.onchange = () => {
  if (isDoneCheck.checked) {
    isApprovedCheck.checked = false;
    isCancelledCheck.checked = false;
  }
};
isApprovedCheck.onchange = () => {
  if (isApprovedCheck.checked) {
    isDoneCheck.checked = false;
    isCancelledCheck.checked = false;
  }
};
isCancelledCheck.onchange = () => {
  if (isCancelledCheck.checked) {
    isDoneCheck.checked = false;
    isApprovedCheck.checked = false;
  }
};
```

### Stage List Badges

Stages in the list view display colored badges indicating their semantic role:

```javascript
if (stage.is_done_stage) {
  const doneBadge = document.createElement('span');
  doneBadge.className = 'badge badge-success badge-sm';  // Green
  doneBadge.textContent = 'Done';
  leftDiv.appendChild(doneBadge);
}
if (stage.is_approved_stage) {
  const approvedBadge = document.createElement('span');
  approvedBadge.className = 'badge badge-warning badge-sm';  // Orange
  approvedBadge.textContent = 'Approved';
  leftDiv.appendChild(approvedBadge);
}
if (stage.is_cancelled_stage) {
  const cancelBadge = document.createElement('span');
  cancelBadge.className = 'badge badge-error badge-sm';  // Red
  cancelBadge.textContent = 'Cancelled';
  leftDiv.appendChild(cancelBadge);
}
```

---

## 5. Validation

### Client-Side Validation

[public/project-generator-client.js](../../public/project-generator-client.js) - `validateBlueprint()`:

```javascript
const doneStages = stages.filter(s => s.is_done_stage);
const approvedStages = stages.filter(s => s.is_approved_stage);
const cancelledStages = stages.filter(s => s.is_cancelled_stage);

// Done: required, exactly 1
if (doneStages.length === 0) {
  result.warnings.push('No Done stage defined. You must define exactly one Done stage before generating.');
} else if (doneStages.length > 1) {
  result.errors.push('Multiple Done stages found. Only one stage can be marked as Done.');
}

// Approved: optional, max 1
if (approvedStages.length > 1) {
  result.errors.push('Multiple Approved stages found. Only one stage can be marked as Approved.');
}

// Cancelled: required, exactly 1
if (cancelledStages.length === 0) {
  result.warnings.push('No Cancelled stage defined. You must define exactly one Cancelled stage before generating.');
} else if (cancelledStages.length > 1) {
  result.errors.push('Multiple Cancelled stages found. Only one stage can be marked as Cancelled.');
}
```

**Behavior:**
- **Warnings** if required flags missing (allows editing to continue)
- **Errors** if duplicates found (blocks generation button)
- No warning if Approved missing (it's optional)

### Server-Side Validation

[src/modules/project-generator/validation.js](../../src/modules/project-generator/validation.js) - `validateStages()`:

```javascript
let doneStageCount = 0;
let approvedStageCount = 0;
let cancelledStageCount = 0;

stages.forEach((stage, index) => {
  // ... existing validation ...
  
  if (stage.is_done_stage) doneStageCount++;
  if (stage.is_approved_stage) approvedStageCount++;
  if (stage.is_cancelled_stage) cancelledStageCount++;
});

// Done: required, exactly 1
if (doneStageCount === 0) {
  result.errors.push('Blueprint must have exactly one Done stage. Mark one stage as Done in the stage editor.');
} else if (doneStageCount > 1) {
  result.errors.push('Blueprint has multiple Done stages. Only one stage can be marked as Done.');
}

// Approved: optional, max 1
if (approvedStageCount > 1) {
  result.errors.push('Blueprint has multiple Approved stages. Only one stage can be marked as Approved.');
}

// Cancelled: required, exactly 1
if (cancelledStageCount === 0) {
  result.errors.push('Blueprint must have exactly one Cancelled stage. Mark one stage as Cancelled in the stage editor.');
} else if (cancelledStageCount > 1) {
  result.errors.push('Blueprint has multiple Cancelled stages. Only one stage can be marked as Cancelled.');
}
```

**Behavior:**
- **Blocks generation** if required flags missing or duplicates found
- Returns clear error messages for the user
- No error if Approved missing (it's optional)

---

## 6. Odoo Project Generation

### Stage Creation

[src/modules/project-generator/odoo-creator.js](../../src/modules/project-generator/odoo-creator.js) - `createStage()`:

```javascript
export async function createStage(env, data) {
  const values = {
    name: data.name,
    sequence: data.sequence
  };
  
  // Map stage semantics to Odoo custom fields (Addendum O)
  if (data.is_done_stage) {
    values.x_is_done_stage = true;
  }
  if (data.is_approved_stage) {
    values.x_is_approved_stage = true;
  }
  if (data.is_cancelled_stage) {
    values.x_is_cancelled_stage = true;
  }
  
  const stageId = await create(env, {
    model: 'project.task.type',
    values: values
  });
  
  // ... link to project ...
  
  return stageId;
}
```

**Note:** Only stages with semantic flags set will have the corresponding Odoo fields set to `true`. All other stages have these fields implicitly set to `false`.

### Field Mapping

| Blueprint Field          | Odoo Field              | Type    | Required |
|--------------------------|-------------------------|---------|----------|
| `is_done_stage`          | `x_is_done_stage`       | boolean | Yes      |
| `is_approved_stage`      | `x_is_approved_stage`   | boolean | No       |
| `is_cancelled_stage`     | `x_is_cancelled_stage`  | boolean | Yes      |

---

## 7. Error Messages

### Client-Side Errors

| Scenario                      | Error Type | Message                                                                 |
|-------------------------------|------------|-------------------------------------------------------------------------|
| No Done stage (editing)       | Warning    | "No Done stage defined. You must define exactly one Done stage before generating." |
| No Cancelled stage (editing)  | Warning    | "No Cancelled stage defined. You must define exactly one Cancelled stage before generating." |
| Multiple Done stages          | Error      | "Multiple Done stages found. Only one stage can be marked as Done."    |
| Multiple Approved stages      | Error      | "Multiple Approved stages found. Only one stage can be marked as Approved." |
| Multiple Cancelled stages     | Error      | "Multiple Cancelled stages found. Only one stage can be marked as Cancelled." |
| User sets multiple semantic flags | Prevented | Checkboxes are mutually exclusive (automatic unchecking)           |

### Server-Side Errors

| Scenario                      | HTTP Status | Message                                                                 |
|-------------------------------|-------------|-------------------------------------------------------------------------|
| No Done stage (generation)    | 400         | "Blueprint must have exactly one Done stage. Mark one stage as Done in the stage editor." |
| Multiple Done stages          | 400         | "Blueprint has multiple Done stages. Only one stage can be marked as Done." |
| Multiple Approved stages      | 400         | "Blueprint has multiple Approved stages. Only one stage can be marked as Approved." |
| No Cancelled stage (generation) | 400      | "Blueprint must have exactly one Cancelled stage. Mark one stage as Cancelled in the stage editor." |
| Multiple Cancelled stages    | 400         | "Blueprint has multiple Cancelled stages. Only one stage can be marked as Cancelled." |

---

## 8. Testing Checklist

### UI Behavior

- [ ] Stage modal displays Done/Approved/Cancelled checkboxes
- [ ] Checkboxes are mutually exclusive (checking one unchecks the others)
- [ ] Stage list shows "Done" badge (green) for Done stages
- [ ] Stage list shows "Approved" badge (orange) for Approved stages
- [ ] Stage list shows "Cancelled" badge (red) for Cancelled stages
- [ ] Info alert explains requirements (Done & Cancelled required, Approved optional)

### Validation

- [ ] Warning displayed when no Done stage defined
- [ ] Warning displayed when no Cancelled stage defined
- [ ] No warning when no Approved stage defined (it's optional)
- [ ] Error displayed when multiple Done stages exist
- [ ] Error displayed when multiple Approved stages exist
- [ ] Error displayed when multiple Cancelled stages exist
- [ ] Generation button disabled when errors exist

### Data Persistence

- [ ] Stage flags saved when creating new stage
- [ ] Stage flags saved when editing existing stage
- [ ] Blueprint JSON includes `is_done_stage`, `is_approved_stage`, and `is_cancelled_stage` fields
- [ ] Flags persist across page refresh

### Odoo Integration

- [ ] Generated stages have `x_is_done_stage = true` when blueprint flag is set
- [ ] Generated stages have `x_is_approved_stage = true` when blueprint flag is set
- [ ] Generated stages have `x_is_cancelled_stage = true` when blueprint flag is set
- [ ] Workflow automation in Odoo correctly reads these flags

---

## 9. Migration Notes

### Existing Blueprints

Blueprints created before Addendum O will **not** have semantic stage flags. When loaded:
- Validation will show warnings (not errors) during editing for missing Done/Cancelled
- No warning for missing Approved (it's optional)
- Generation will be **blocked** until user marks exactly one Done and one Cancelled stage

**Migration Path:**
1. User opens existing blueprint
2. Sees warnings: "No Done stage defined" and "No Cancelled stage defined"
3. Edits stages to add semantic flags (Done and Cancelled required, Approved optional)
4. Generation proceeds normally

### Backward Compatibility

This change is **backward compatible** for editing but **breaking for generation**:
- Existing blueprints can still be opened and edited
- Generation requires user intervention to add semantic flags

---

## 10. Implementation Summary

### Files Modified

1. **[src/modules/project-generator/ui.js](../../src/modules/project-generator/ui.js)**
   - Added Done/Approved/Cancelled checkboxes to stage modal HTML
   - Updated info alert to mention Approved as optional

2. **[public/project-generator-client.js](../../public/project-generator-client.js)**
   - `openStageModal()`: Populate all 3 checkboxes, implement 3-way mutual exclusivity
   - `handleStageSubmit()`: Capture all 3 semantic flags, enforce duplicate checks
   - `renderStages()`: Display Done/Approved/Cancelled badges (green/orange/red)
   - `validateBlueprint()`: Validate Done (required), Approved (optional, max 1), Cancelled (required)

3. **[src/modules/project-generator/validation.js](../../src/modules/project-generator/validation.js)**
   - `validateStages()`: Server-side validation for all 3 semantic flags

4. **[src/modules/project-generator/odoo-creator.js](../../src/modules/project-generator/odoo-creator.js)**
   - `createStage()`: Map `is_done_stage` → `x_is_done_stage`, `is_approved_stage` → `x_is_approved_stage`, `is_cancelled_stage` → `x_is_cancelled_stage`

5. **[src/modules/project-generator/generate.js](../../src/modules/project-generator/generate.js)**
   - `buildGenerationModel()`: Include `is_approved_stage` in stage mapping
   - Stage creation loop: Pass `is_approved_stage` to `createStage()`

### Documentation

- **[docs/project-generator/ADDENDUM_O.md](ADDENDUM_O.md)** (this file) - Updated to include Approved stage semantics

---

## 11. Design Rationale

### Why Property-Driven (Not Name-Driven)?

**Problem with name-driven approach:**
- Stage names can change ("Done" → "Completed" → "Finished")
- Localization requires translated names
- Hardcoded names are brittle

**Property-driven solution:**
- Boolean flags are language-agnostic
- Stage can be renamed without breaking automation
- Clear separation of visual (name) and semantic (flag) concerns

### Why These Specific Semantics?

**Stage semantics reflect Odoo workflow requirements:**

1. **Done Stage (required):** Tasks reaching this stage are considered completed. Odoo's task state must distinguish completion from in-progress.

2. **Cancelled Stage (required):** Tasks can be abandoned or cancelled. This is distinct from completion and requires its own semantic marker.

3. **Approved Stage (optional):** Some workflows require formal approval steps. This flag enables workflow automation around approval gates without hardcoding stage names.

**Why mutual exclusivity:**
- A stage represents a single workflow state
- Conflicting semantics (e.g., "Done" and "Cancelled") would be ambiguous
- Forces clear workflow design

---

## 12. Future Enhancements

### Potential Improvements

1. **Additional Stage Semantics:**
   - `x_is_blocked_stage` - Tasks waiting on external dependencies
   - `x_is_review_stage` - Code review or quality check stages
   - Property-driven approach scales to new semantics without breaking changes

2. **Bulk Import/Export:**
   - Export blueprints with semantic flags
   - Import with validation of semantic constraints

3. **Visual Workflow Preview:**
   - Show state transitions diagram
   - Highlight semantic stages in workflow visualization

4. **Multi-Project Templates:**
   - Reuse semantic stage definitions across templates
   - Stage library with pre-configured semantic flags

---

## 13. Related Documentation

- **[ADDENDUM_M.md](ADDENDUM_M.md):** Project Generator API
- **[ADDENDUM_F.md](ADDENDUM_F.md):** Task Colors and Tags (Section 14: Color Consistency)
- **[PROJECT_GENERATOR_COMPLETE_V1.md](PROJECT_GENERATOR_COMPLETE_V1.md):** Complete technical specification

---

**End of Addendum O**
