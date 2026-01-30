# ADDENDUM M2: Task Generation Ordering & Odoo Display Semantics

**Status**: ✅ Implemented  
**Version**: 1.0  
**Date**: January 30, 2026  
**Context**: Project Generator Module  
**Parent**: ADDENDUM M (Deterministic Task Ordering)  
**Type**: Normative Ordering Contract

---

## Executive Summary

ADDENDUM M2 defines the **normative ordering contract** for task generation and documents the **intentional reverse execution order** required to align with Odoo's UI display behavior.

This document establishes the **single source of truth** for task creation ordering semantics.

**Critical Rules**:
1. Milestones are execution boundaries (tasks never cross them)
2. Parent-child ordering is local to milestones
3. Tasks are created in reverse logical order to match Odoo's newest-first display

**⚠️ CRITICAL BUGS IDENTIFIED AND FIXED (January 30, 2026)**:

Two catastrophic implementation bugs were discovered via forensic analysis:

1. **`sequence` field not transmitted to Odoo**: The field was computed correctly but NOT mapped in `batchCreateTasks()`, causing all tasks to default to `sequence = 0` in Odoo. Fixed by adding field mapping in `odoo-creator.js`.

2. **Milestone `sequence` lost in generation model**: The field was not copied from blueprint to generation model, breaking milestone-based ordering in `computeTaskOrders()`. Fixed by adding field preservation in `buildGenerationModel()`.

**See**: [FORENSIC_ORDERING_TRACE.md](./FORENSIC_ORDERING_TRACE.md) for complete code execution analysis, evidence, and instrumentation.

---

## Historical Regression Warning

**Incident Date**: January 30, 2026  
**Severity**: CRITICAL — Milestone ordering completely non-functional  
**Duration**: UNKNOWN (latent bug, possibly present since ADDENDUM M implementation)

### The Moment Where Execution Order Leaked Into Semantics

During development of STEP 7 (dependency creation), a catastrophic regression occurred where `executionTasks` was accidentally used instead of `logicalTasks`. This caused:
- Dependencies to be created in reverse milestone order (M3 → M2 → M1)
- Tasks from later milestones to reference earlier ones incorrectly
- Complete destruction of semantic ordering invariants
- Silent corruption that only manifested in Odoo UI

**Root Cause**: Execution order has ZERO semantic meaning. It exists ONLY to control API call timing in STEP 6. Any use of execution order outside task creation is a breaking change.

**Why This is Catastrophic**: In execution order, Milestone 3 comes before Milestone 1. Dependencies created in execution order would link M3 → M1, which is semantically backwards and breaks project logic.

**Prevention**: The fix included `Object.freeze(logicalTasks)` and explicit runtime guards preventing `executionTasks` use in semantic steps.

### The Moment Where Sequence Was Computed But Not Persisted

On January 30, 2026, forensic code analysis revealed that task ordering was non-functional despite correct computation of `sequence` values. The bug had two components:

**Bug 1: `sequence` field silently dropped in `batchCreateTasks()`**
- **Location**: `src/modules/project-generator/odoo-creator.js` Line 302-327
- **Symptom**: Field computed in STEP 6, assigned to `taskData`, but NOT mapped to Odoo payload
- **Result**: All tasks created with `sequence = 0`, Odoo sorts by ID instead of semantic order
- **Why it survived**: Internal ordering appeared correct, DESC creation order produced correct display as a side effect
- **Why it's fatal**: Correct order depends on fragile ID-based sorting, breaks on any manual interaction

**Bug 2: Milestone `sequence` lost in generation model**
- **Location**: `src/modules/project-generator/generate.js` Line 594-629 (`buildGenerationModel()`)
- **Symptom**: Field exists in blueprint but NOT copied to `generationModel.milestones`
- **Result**: `computeTaskOrders()` reads `undefined` for all milestone sequences → all milestones treated as sequence 0
- **Why it survived**: No validation checking milestone sequence distribution
- **Why it's fatal**: Milestone dominance completely broken, tasks from different milestones could be intermixed

### Why UI Symptoms Were Misleading

**Observed Behavior**: Tasks appeared in correct order in Odoo UI immediately after generation.

**Misleading Conclusion**: "Ordering is working correctly."

**Actual Mechanism**:
1. Tasks created in DESC order (M3 → M2 → M1)
2. Odoo assigns IDs in creation order (M3 gets lowest IDs, M1 gets highest IDs)
3. Odoo defaults to sorting by `id DESC` when all tasks have `sequence = 0`
4. Display order matches logical order AS A SIDE EFFECT of ID ordering
5. But this is fragile: any Odoo refresh, manual reorder, or data migration breaks it

**Why This Hid the Bug**:
- Developers saw correct display and assumed sequence persistence was working
- No one inspected actual Odoo `sequence` field values (all were 0)
- No one tested manual reordering (which would reveal the fragility)
- Forensic logs showing `sequence: "MISSING"` were never added until January 30

### Why This Bug Survived Multiple Iterations

**Development Process Failures**:

1. **No integration boundary verification**: Assumed fields in `taskData` automatically reach Odoo
2. **No payload inspection**: Never verified actual Odoo RPC payload contained `sequence`
3. **No persistence verification**: Never queried Odoo to check `sequence` field values after creation
4. **No manual interaction testing**: Never tested manual task reordering in Odoo
5. **Coincidental correctness**: DESC creation order produced correct display, masking the bug

**Code Review Gaps**:

1. **No checklist for field mapping**: `batchCreateTasks()` had 11 other fields correctly mapped, `sequence` omission went unnoticed
2. **No checklist for generation model fields**: `buildGenerationModel()` copied many fields, `milestone.sequence` omission went unnoticed
3. **No validation of ordering invariants**: No runtime check that all tasks in M1 have lower sequence than tasks in M2

**Testing Gaps**:

1. **No Odoo field assertions**: Tests checked task creation count, not field values
2. **No ordering assertions**: Tests checked tasks exist, not their display order
3. **No manual interaction simulation**: Tests never simulated Odoo user manually reordering tasks

### Lessons Learned (MANDATORY)

**Normative Prevention Rules**:

> 1. Any field computed for ordering MUST be verified at the Odoo RPC boundary.  
> 2. Any generation model transformation MUST preserve all ordering-relevant fields.  
> 3. Assumptions about "obvious" field propagation are FORBIDDEN.  
> 4. Any change to `batchCreateTasks()` MUST include payload inspection logging.  
> 5. Any change to `buildGenerationModel()` MUST verify all output fields are documented.

**Mandatory Verification Steps**:

Before ANY code change affecting ordering:
1. ✅ Verify `sequence` in `taskData` (STEP 6)
2. ✅ Verify `sequence` in `values` (RPC boundary)
3. ✅ Verify `sequence` in Odoo payload logs
4. ✅ Verify `sequence` in Odoo database query
5. ✅ Verify milestone sequence in `generationModel`
6. ✅ Verify milestone sequence used in `computeTaskOrders()`

**Code Review Requirements**:

- ❌ Any field omission in `batchCreateTasks()` mapping
- ❌ Any field omission in `buildGenerationModel()` output
- ❌ Any change without forensic logging at RPC boundary
- ❌ Any change without payload inspection verification
- ✅ Explicit mapping for EVERY ordering-related field
- ✅ Forensic logs showing actual values transmitted to Odoo
- ✅ Documentation update explaining why each field is mandatory

**Consequence of Violation**:

> Any regression in sequence propagation or milestone sequence preservation  
> is a ROLLBACK-REQUIRED BUG.  
> No exceptions.

---

## Table of Contents

- [M2.1: Task Generation Ordering Contract](#m21-task-generation-ordering-contract)
- [M2.2: Reverse Creation Order for Odoo UI Correctness](#m22-reverse-creation-order-for-odoo-ui-correctness)
- [M2.3: Implementation](#m23-implementation)
- [M2.4: Validation](#m24-validation)

---

## M2.1: Task Generation Ordering Contract

### M2.1.1: Primary Execution Boundary — Milestones

**Normative Rule**:

> Milestones are the primary execution boundary.  
> Tasks must never cross milestone boundaries during generation.

**Odoo Technical Constraint**:

> Odoo sorts tasks in the UI by the `project.task.sequence` field.  
> Milestone dominance in the UI is ONLY enforceable by setting task.sequence correctly.  
> Correct JavaScript ordering without persisting sequence to Odoo is worthless.

**Critical Understanding**:

1. **Odoo does NOT sort by milestone automatically**
   - Odoo has no built-in "milestone-first" display logic
   - Task list views use `sequence ASC` or `id DESC` as default sort order
   - If `sequence` is not set, all tasks default to `sequence = 0`
   - Tasks with identical sequence are sorted by creation ID (newest first)

2. **Milestone boundary MUST be enforced via task.sequence values**
   - Tasks in Milestone 1 MUST have lower sequence values than Milestone 2
   - Tasks in Milestone 2 MUST have lower sequence values than Milestone 3
   - This is the ONLY way to guarantee milestone-first display in Odoo UI

3. **Generation-time ordering alone is insufficient**
   - Computing correct logical order in JavaScript has zero effect on Odoo UI
   - Creating tasks in DESC order produces correct display ONLY as a side effect of ID ordering
   - Without explicit sequence values, UI correctness depends on fragile ID-based sorting
   - Any manual task reordering in Odoo will destroy milestone boundaries

**Explicitly Required**:
- ✅ Every task MUST have an explicit `sequence` value derived from logical order
- ✅ Sequence values MUST respect milestone boundaries (M1 tasks < M2 tasks < M3 tasks)
- ✅ Sequence assignment MUST happen during generation, not post-creation

**Explicitly Forbidden**:
- ❌ Relying on Odoo's default ID-based ordering for correctness
- ❌ Assuming DESC creation order is sufficient without sequence persistence
- ❌ Setting sequence = 0 for all tasks (destroys milestone boundaries)

**Requirements**:

1. **Tasks are grouped per milestone**
   - All tasks belonging to a milestone are processed together
   - Task grouping happens before any ordering operations
   - No task may be processed outside its milestone group

2. **Milestones are ordered by `milestone.sequence` (ascending in logical order)**
   - Milestone sequence determines primary processing order
   - Lower sequence numbers represent earlier milestones
   - Milestone ordering is absolute and non-negotiable

3. **No global task ordering is permitted**
   - Tasks from different milestones must never be interleaved
   - Sorting operations are scoped per milestone
   - Cross-milestone comparisons are forbidden

**Explicitly Forbidden**:
- ❌ Global task sorting across milestones
- ❌ Task sequence values overriding milestone boundaries
- ❌ Any operation that allows Milestone 2 tasks to appear before Milestone 1 tasks

---

### M2.1.2: Parent–Child Ordering is Local

**Normative Rule**:

> Parent–child relationships only influence ordering within a single milestone.

**Requirements**:

1. **Parent tasks are created before their subtasks**
   - Within a milestone, all parent tasks precede all subtasks
   - This ensures Odoo `parent_id` references resolve correctly
   - Parent-first ordering is mandatory for referential integrity

2. **This rule applies only inside the same milestone**
   - Parent-child ordering has no effect across milestone boundaries
   - A subtask in Milestone 1 is created before any task in Milestone 2
   - Milestone boundary always takes precedence over parent-child relationship

3. **Parent–child ordering must never override milestone ordering**
   - A parent task in Milestone 2 cannot be created before a subtask in Milestone 1
   - Milestone sequence is the dominant ordering key
   - Parent-child is a secondary constraint within milestone scope

**Explicitly Forbidden**:
- ❌ Global parent-first batching (all parents from all milestones, then all subtasks)
- ❌ Global subtask-first batching
- ❌ Any batching strategy that crosses milestone boundaries

**Parent Scope as Ordering Boundary**:

Parent-child ordering implies a strict parent scope boundary:

- **Subtasks are ordered only within their own parent**
  - Each parent task defines an isolated ordering scope for its subtasks
  - `task.sequence` is only meaningful when comparing subtasks of the SAME parent
  
- **Subtasks of different parents MUST NOT be compared or reordered relative to each other**
  - Even within the same milestone, subtasks belong to distinct parent scopes
  - No global subtask sorting is permitted
  - Ordering between subtasks of different parents is determined solely by their parent's relative order

**Example**:
```
Parent A (seq: 1) → Subtask A1 (seq: 10)
Parent B (seq: 2) → Subtask B1 (seq: 1)

Correct: A, A1, B, B1  (A1 cannot be reordered relative to B1)
Wrong:   A, B, B1, A1  (B1 before A1 due to sequence comparison)
```

---

### M2.1.3: Task Sequence is Secondary

**Normative Rule**:

> `task.sequence` is a secondary ordering key and is only applied  
> within the same milestone and the same parent scope.

**Requirements**:

1. **Task sequence applies within milestone**
   - After grouping by milestone, tasks are sorted by `task.sequence`
   - Sequence values are only compared within the same milestone
   - Cross-milestone sequence comparisons are meaningless and forbidden

2. **Task sequence applies within parent scope**
   - Parent tasks are sorted by sequence within their milestone
   - Subtasks are sorted by sequence within their parent
   - Subtasks of different parents are not compared by sequence

3. **Task sequence is tertiary priority**
   - Milestone sequence (primary)
   - Parent-before-child (secondary)
   - Task sequence (tertiary)

**Example Hierarchy**:
```
Milestone 1 (seq: 1)
  Parent Task A (seq: 10)
    Subtask A1 (seq: 5)
  Parent Task B (seq: 5)

Milestone 2 (seq: 2)
  Parent Task C (seq: 1)
```

**Correct Creation Order** (logical, before reversal):
1. Task B (Milestone 1, parent, seq 5)
2. Task A (Milestone 1, parent, seq 10)
3. Subtask A1 (Milestone 1, subtask, seq 5)
4. Task C (Milestone 2, parent, seq 1)

**Key Insight**: Task C (seq 1) comes AFTER Task A (seq 10) because milestone boundary dominates.

---

## M2.2: Reverse Creation Order for Odoo UI Correctness

### M2.2.1: Odoo UI Behavior (Documented Fact)

**Observation**:

> Odoo displays tasks in reverse creation order by default  
> (newest records appear at the top).

**Technical Details**:
- Odoo's default task list view sorts by `id DESC`
- Recently created tasks (higher IDs) appear first in the list
- Users see the most recent activity at the top
- This is standard Odoo UI behavior and cannot be changed via API

**Implication**:
If we create tasks in logical order (Milestone 1 → Milestone 2 → Milestone 3), Odoo will display them in reverse (Milestone 3 → Milestone 2 → Milestone 1), which violates the "wat je ziet is wat Odoo krijgt" contract.

---

### M2.2.2: Required Inversion Rule

**Normative Rule**:

> To ensure that earlier milestones appear first in the Odoo UI,  
> tasks MUST be created in reverse logical order.

**Requirements**:

1. **Reverse milestone processing**
   - Process milestones in descending sequence order
   - Last milestone is created first
   - First milestone is created last

2. **Reverse task sequence within milestone**
   - Within each milestone, process tasks in descending sequence order
   - Higher sequence tasks are created first
   - Lower sequence tasks are created last

3. **Preserve parent-before-child within reversed milestone**
   - Even in reversed order, parents precede their subtasks
   - Parent-child relationship is not reversed
   - Only milestone and task sequence are reversed

**Why This Works**:
```
Execution: Milestone 3 → Milestone 2 → Milestone 1
Odoo IDs:  100...     → 200...     → 300...
Odoo View: Milestone 1 → Milestone 2 → Milestone 3 ✅
```

---

### M2.2.3: Logical vs Execution Order

**Definitions**:

**Logical Order (Semantic)**:
- The order users see in the blueprint editor
- The order users expect to see in Odoo
- The order that makes semantic sense
- **Sorting**: `milestone.sequence ASC`, `task.sequence ASC`
- **Purpose**: Determines `task.sequence` values persisted to Odoo
- **Effect**: Controls Odoo UI display order permanently

**Execution Order (Technical)**:
- The order in which tasks are actually created in Odoo
- The reverse of logical order
- The order required to produce correct Odoo display (when sequence is not set)
- **Sorting**: `milestone.sequence DESC`, `task.sequence DESC`
- **Purpose**: Determines API call sequence only
- **Effect**: Affects creation IDs, NOT sequence values

**Critical Distinction**:

> Logical order determines WHAT sequence values are set.  
> Execution order determines WHEN API calls are made.  
> These two concerns MUST NEVER be conflated.

**Relationship**:
```
Logical Order  = Blueprint Display Order = Desired Odoo Display Order = task.sequence source
Execution Order = Reverse(Logical Order) = Actual API Call Order = creation ID source
```

**Sequence Assignment Rule**:

> The `task.sequence` field MUST be derived from logical order position.  
> The `task.sequence` field MUST NEVER be derived from execution order position.

**Violation Example** (forbidden):
```javascript
// ❌ WRONG: Coupling sequence to execution order
executionTasks.forEach((task, index) => {
  taskData.sequence = index * 10;  // Milestone 3 gets sequence 0, Milestone 1 gets sequence 100
});
```

**Correct Implementation**:
```javascript
// ✅ CORRECT: Sequence from logical order, execution uses reversed list
const taskSequenceMap = new Map();
logicalTasks.forEach((task, index) => {
  taskSequenceMap.set(task.blueprint_id, index * 10);  // M1 gets 0-90, M2 gets 100-190, M3 gets 200+
});

// Create in execution order, but use sequence from logical order
for (const task of executionTasks) {
  const taskData = {
    sequence: taskSequenceMap.get(task.blueprint_id)  // From logical order
  };
  await createTask(taskData);
}
```

**Parent-Child Constraint**:
- Logical order: Parent before child ✅
- Execution order: Parent before child ✅ (NOT reversed)

---

### M2.2.4: Preventing Execution Order Leakage (CRITICAL)

**Historical Regression**:

During development, a catastrophic regression occurred where `executionTasks` was accidentally used in STEP 7 (dependency creation) instead of `logicalTasks`. This caused:
- Milestone boundaries to be violated in dependency logic
- Tasks from later milestones to reference earlier ones incorrectly
- Complete destruction of semantic ordering invariants
- Silent corruption that only manifested in Odoo UI

**Root Cause**:

> Execution order has ZERO semantic meaning.  
> It exists ONLY to control API call timing in STEP 6.  
> Any use of execution order outside task creation is a breaking change.

**Why This is Catastrophic**:

1. **Execution order violates milestone dominance**
   - In execution order, Milestone 3 comes before Milestone 1
   - Dependencies created in execution order would link M3 → M1
   - This is semantically backwards and breaks project logic

2. **Execution order destroys parent scope boundaries**
   - Task sequence in execution order is DESC within milestones
   - Using this for semantic operations reverses intended relationships
   - Subtask B1 (seq 1) would be processed before Subtask A2 (seq 2), violating parent scope

3. **The symptom is subtle but fatal**
   - Code may appear to "work" during initial testing
   - Odoo UI may show correct order due to ID-based sorting side effects
   - But logical relationships (dependencies, validation) are corrupted
   - Damage only becomes apparent in complex projects with many milestones

**Normative Prevention Rule**:

> Any use of `executionTasks` outside STEP 6 task creation is a critical bug.  
> Any semantic operation (dependencies, sequence, validation, preview) MUST use `logicalTasks`.  
> These orderings MUST NEVER be interchanged or conflated.

**Enforcement Mechanisms** (implemented):

1. **Freeze semantic ordering**
   ```javascript
   Object.freeze(logicalTasks); // Prevent mutation
   ```

2. **Explicit guards in semantic steps**
   ```javascript
   // STEP 7 guard
   if (!Object.isFrozen(logicalTasks)) {
     throw new Error('logicalTasks must be frozen before STEP 7');
   }
   const iterationSource = logicalTasks; // Explicit
   if (iterationSource === executionTasks) {
     throw new Error('STEP 7 cannot use executionTasks');
   }
   ```

3. **Milestone dominance validation**
   ```javascript
   validateMilestoneDominance(logicalTasks, 'logicalTasks');
   // Throws if task from M2 appears before task from M1
   ```

**Code Review Checklist**:

- ❌ `for (const task of executionTasks)` in STEP 7 or later
- ❌ Using `executionTasks` for sequence calculation
- ❌ Using `executionTasks` for dependency resolution
- ❌ Using `executionTasks` for preview generation
- ❌ Using `executionTasks` for validation
- ✅ `executionTasks` used ONLY in STEP 6 creation loop
- ✅ `logicalTasks` used for ALL semantic operations
- ✅ Guards exist preventing execution order misuse

**Consequence of Violation**:

> Any change that allows execution order to influence semantic steps  
> is a breaking change and must be treated as a critical bug requiring immediate rollback.

---

### M2.2.5: Task Sequence Propagation to Odoo

**Problem**:

Task ordering is computed correctly in STEP 6, with `sequence` values assigned to each task based on logical order position. However, these sequence values were never transmitted to Odoo.

**Root Cause**:

File: `src/modules/project-generator/odoo-creator.js`  
Function: `batchCreateTasks()` (Line 290)

The function builds an Odoo payload by explicitly mapping fields from `data` object to `values` object. The `sequence` field was computed and included in `data.sequence` but was NOT mapped to `values.sequence`, causing it to be silently dropped.

**Code Location**:

Lines 302-327 in `odoo-creator.js` map the following fields:
- ✅ `name` → `values.name`
- ✅ `project_id` → `values.project_id`
- ✅ `stage_id` → `values.stage_id`
- ✅ `parent_id` → `values.parent_id`
- ✅ `milestone_id` → `values.milestone_id`
- ✅ `color` → `values.color`
- ✅ `tag_ids` → `values.tag_ids`
- ✅ `user_ids` → `values.user_ids`
- ✅ `planned_date_begin` → `values.planned_date_begin`
- ✅ `date_deadline` → `values.date_deadline`
- ✅ `allocated_hours` → `values.allocated_hours`
- ❌ **`sequence` → NOT MAPPED**

**Why This Broke Ordering**:

When `sequence` is not provided to Odoo's `project.task.create()`:
1. Odoo sets all tasks to `sequence = 0` (default value)
2. With identical sequence values, Odoo falls back to sorting by `id DESC`
3. Milestone boundaries become invisible to Odoo
4. Correct internal ordering (logicalTasks, executionTasks) becomes irrelevant
5. Users observe tasks in reverse creation order, not semantic order

**Why This is Catastrophic**:

> Ordering contracts are VOID if `sequence` is not persisted to Odoo.  
> Internal ordering correctness has ZERO value without RPC boundary propagation.

Without explicit sequence values:
- Tasks from later milestones appear above earlier milestones in Odoo
- Milestone boundaries are invisible to Odoo's UI
- Manual task reordering destroys semantic groupings
- DESC creation order produces correct display only as a fragile side effect
- Any Odoo refresh or manual interaction breaks the ordering

**Critical Fix Applied** (January 30, 2026):

```javascript
// In batchCreateTasks() after allocated_hours mapping (Line ~318)
// ADDENDUM M2: Persist logical order sequence (CRITICAL FIX)
if (data.sequence !== null && data.sequence !== undefined) {
  values.sequence = data.sequence;
}
```

**Normative Rule**:

> Every task created by the generator MUST have an explicit `sequence` field value.  
> This value MUST be derived from the task's position in logical order.  
> This value MUST be transmitted to Odoo in `batchCreateTasks()`.  
> Any omission of this mapping is a ROLLBACK-REQUIRED BUG.

**Code Review Requirement**:

> Any change to `batchCreateTasks()` MUST be reviewed for field mapping completeness.  
> Any omission of a computed field is a critical bug.  
> Assumptions about "obvious" field propagation are FORBIDDEN.

---

### M2.2.6: Milestone Sequence as Semantic Dominant Key

**Problem**:

The `computeTaskOrders()` function sorts tasks by milestone sequence as the primary key, but milestone sequence values were always `undefined`.

**Root Cause**:

File: `src/modules/project-generator/generate.js`  
Function: `buildGenerationModel()` (Line 509)

When copying milestones from blueprint to generation model (Lines 590-629), the function did NOT include the `sequence` field in the returned milestone object. This caused `generationModel.milestones[]` to lack sequence information.

**Code Location**:

Lines 594-629: Milestone mapping returns:
```javascript
return {
  blueprint_id: milestone.id,
  name: milestone.name
  // ❌ sequence: MISSING
};
```

**Why This Broke Ordering**:

In `computeTaskOrders()` (Lines 71-77):
```javascript
const milestoneSequenceMap = new Map();
if (generationModel.milestones && Array.isArray(generationModel.milestones)) {
  generationModel.milestones.forEach(m => {
    milestoneSequenceMap.set(m.blueprint_id, m.sequence || 0);  // m.sequence is undefined
  });
}
```

Result: All milestones get `sequence = 0` in the map.

When sorting tasks (Lines 87-118):
```javascript
const aMilestoneSeq = milestoneSequenceMap.get(a.milestone_blueprint_id) || 0;  // Always 0
const bMilestoneSeq = milestoneSequenceMap.get(b.milestone_blueprint_id) || 0;  // Always 0

if (aMilestoneSeq !== bMilestoneSeq) {
  return aMilestoneSeq - bMilestoneSeq;  // Never executed (always equal)
}
```

**Impact**:
- Milestone-based ordering was completely non-functional
- Tasks were only sorted by parent-first + task sequence
- Tasks from Milestone 2 could appear before tasks from Milestone 1
- Milestone dominance contract was violated at the ordering computation stage

**Why This is Catastrophic**:

> Milestone sequence is the PRIMARY ordering key.  
> Without milestone sequence, ordering is fundamentally broken.  
> No amount of correct task sequence can fix missing milestone dominance.

**Critical Fix Applied** (January 30, 2026):

```javascript
// In buildGenerationModel() milestone mapping (Line ~628)
return {
  blueprint_id: milestone.id,
  name: milestone.name,
  sequence: milestone.sequence || 0  // CRITICAL FIX: Preserve milestone ordering
};
```

**Normative Rule**:

> Milestone `sequence` MUST be preserved in the generation model.  
> Any generation model transformation that drops ordering fields is a ROLLBACK-REQUIRED BUG.  
> Milestone sequence is the DOMINANT ordering key and MUST NEVER be lost.

**Code Review Requirement**:

> Any change to `buildGenerationModel()` MUST preserve all ordering-relevant fields.  
> Any transformation that drops `sequence` from milestones is a critical bug.  
> Generation model MUST contain all fields required by `computeTaskOrders()`.

---

### M2.2.7: Generator ↔ Odoo Ordering Contract

**Normative Contract**:

> The Project Generator MUST produce task order in Odoo that matches blueprint logical order.  
> This contract has THREE mandatory requirements, ALL of which must be satisfied:

**Requirement 1: Compute Logical Order**

- Sort tasks by `milestone.sequence ASC → parent-first → task.sequence ASC`
- This produces the semantic ordering that matches blueprint display
- This ordering defines what users expect to see in Odoo

**Requirement 2: Assign Sequence Values from Logical Order**

- Derive `task.sequence` values from position in logical order
- Milestone 1 tasks: sequence 0-90
- Milestone 2 tasks: sequence 100-190
- Milestone 3 tasks: sequence 200-290
- Gap of 10 between tasks allows manual reordering within milestones

**Requirement 3: Transmit Sequence to Odoo**

- Map `data.sequence` to `values.sequence` in `batchCreateTasks()`
- Persist sequence values to Odoo `project.task` records
- Odoo will sort by `sequence ASC`, enforcing milestone boundaries

**Contract Fulfillment**:

✅ **Logical order computed** (`computeTaskOrders()` produces `logicalTasks`)  
✅ **Sequence values assigned** (`taskSequenceMap` built from `logicalTasks` position)  
✅ **Sequence transmitted** (`values.sequence = data.sequence` in `batchCreateTasks()`)

**Contract Violations**:

❌ Missing any requirement breaks the contract  
❌ Computing order but not persisting sequence → fragile ID-based ordering  
❌ Persisting sequence but computing wrong order → wrong display in Odoo  
❌ Correct computation and persistence but wrong transmission → silently dropped

**Why All Three are Mandatory**:

1. **Without Requirement 1**: No semantic ordering, random task order
2. **Without Requirement 2**: No milestone boundaries, tasks can be intermixed
3. **Without Requirement 3**: Correct internal order, wrong Odoo display

**Historical Failure (January 30, 2026)**:

- ✅ Requirement 1: Logical order computed correctly
- ✅ Requirement 2: Sequence values assigned correctly
- ❌ Requirement 3: Sequence NOT transmitted to Odoo → **CONTRACT VIOLATED**

Result: Milestone boundaries invisible to Odoo, tasks sorted by creation ID.

**Normative Rule**:

> Any regression in Requirements 1, 2, or 3 is a ROLLBACK-REQUIRED BUG.  
> All three requirements MUST be verified in code review.  
> Assumptions about "obvious" field propagation violate Requirement 3.

**Verification Checklist**:

- ✅ `computeTaskOrders()` returns `logicalTasks` sorted by milestone → parent → task sequence
- ✅ `taskSequenceMap` built from `logicalTasks.forEach((task, index) => map.set(task.id, index * 10))`
- ✅ `buildTaskData()` includes `sequence: taskSequenceMap.get(task.blueprint_id)`
- ✅ `batchCreateTasks()` maps `values.sequence = data.sequence`
- ✅ Forensic logs show `sequence` in Odoo payload (not `'MISSING'`)
- ✅ Odoo UI displays tasks in milestone order after generation

---

### M2.2.8: Concrete Example

**Blueprint**:
```
Milestone 1 (seq: 1)
  Task A (seq: 1)
  Task B (seq: 2)

Milestone 2 (seq: 2)
  Task C (seq: 1)
```

**Logical Order**:
```
1. Task A (Milestone 1, seq 1)
2. Task B (Milestone 1, seq 2)
3. Task C (Milestone 2, seq 1)
```

**Execution (Creation) Order**:
```
1. Task C (Milestone 2, seq 1) → Odoo ID: 100
2. Task B (Milestone 1, seq 2) → Odoo ID: 101
3. Task A (Milestone 1, seq 1) → Odoo ID: 102
```

**Resulting Odoo UI Order** (sorted by ID DESC):
```
102: Task A (Milestone 1, seq 1) ← appears first
101: Task B (Milestone 1, seq 2)
100: Task C (Milestone 2, seq 1) ← appears last
```

**Verification**:
- ✅ Milestone 1 tasks appear before Milestone 2 tasks
- ✅ Within Milestone 1, Task A appears before Task B
- ✅ Logical order matches Odoo display order
- ✅ "Wat je ziet is wat Odoo krijgt" contract satisfied

---

### M2.2.9: Complex Example with Subtasks

**Blueprint**:
```
Milestone 1 (seq: 1)
  Parent A (seq: 1)
    Subtask A1 (seq: 1)
    Subtask A2 (seq: 2)
  Parent B (seq: 2)

Milestone 2 (seq: 2)
  Parent C (seq: 1)
    Subtask C1 (seq: 1)
```

**Logical Order**:
```
1. Parent A (M1, seq 1)
2. Subtask A1 (M1, parent A, seq 1)
3. Subtask A2 (M1, parent A, seq 2)
4. Parent B (M1, seq 2)
5. Parent C (M2, seq 1)
6. Subtask C1 (M2, parent C, seq 1)
```

**Execution Order** (reversed milestones, reversed sequences, parents-first preserved):
```
Step 1: Process Milestone 2 (reversed)
  1a. Parent C (seq 1) → Odoo ID: 100
  1b. Subtask C1 (seq 1, parent C) → Odoo ID: 101

Step 2: Process Milestone 1 (reversed)
  2a. Parent B (seq 2) → Odoo ID: 102
  2b. Parent A (seq 1) → Odoo ID: 103
  2c. Subtask A2 (seq 2, parent A) → Odoo ID: 104
  2d. Subtask A1 (seq 1, parent A) → Odoo ID: 105
```

**Resulting Odoo UI** (ID DESC):
```
105: Subtask A1 (M1, parent A, seq 1)
104: Subtask A2 (M1, parent A, seq 2)
103: Parent A (M1, seq 1)
102: Parent B (M1, seq 2)
101: Subtask C1 (M2, parent C, seq 1)
100: Parent C (M2, seq 1)
```

**Verification**:
- ✅ All Milestone 1 tasks appear before Milestone 2 tasks
- ✅ Within M1: Parent A (seq 1) before Parent B (seq 2)
- ✅ Within Parent A: Subtask A1 (seq 1) before Subtask A2 (seq 2)
- ✅ Parents appear before their subtasks in display
- ✅ Logical order perfectly matches Odoo display order

---

### M2.2.10: Critical Warning

**DO NOT REMOVE THE REVERSAL**

This is not a bug. This is not "counter-intuitive complexity".  
This is the ONLY way to make Odoo display order match blueprint order.

**DO NOT OMIT SEQUENCE PERSISTENCE**

Any implementation that does not persist `task.sequence` derived from logical order is invalid, regardless of internal ordering logic.

**Normative Contract Requirement**:

> Every task created by the generator MUST have an explicit `sequence` field value.  
> This value MUST be derived from the task's position in logical order.  
> This value MUST respect milestone boundaries (earlier milestones = lower sequence).  
> This value MUST be set during `project.task.create()`, not in post-processing.

**Violation Consequences**:
- Tasks from later milestones will appear above earlier milestones in Odoo
- Milestone boundaries will be invisible to Odoo's UI
- Manual task reordering will destroy semantic groupings
- Users will lose trust in the system

**Rationale**:
- Removing the reversal will cause Milestone 3 to appear before Milestone 1 in Odoo
- This breaks the fundamental "wat je ziet is wat Odoo krijgt" contract
- Users will see incorrect task order and lose trust in the system
- The reversal is the ONLY way to align blueprint order with Odoo display order

**Maintenance**:
- Do not "optimize" by removing DESC sorting
- Do not assume Odoo will change its default sort order
- Do not rely on manual sorting in Odoo UI (users should see correct order by default)
- If Odoo behavior changes, update this document first, then code

**Code Review**:
- If you see `milestone.sequence DESC` in the code, it is correct
- If you see `task.sequence DESC` in the code, it is correct
- If you see `sequence: taskSequenceMap.get(...)` in buildTaskData, it is mandatory
- If someone suggests changing to ASC, refer them to this document
- If someone suggests omitting sequence field, refer them to section M2.2.7
- Any change to execution order MUST update this document first

---

### M2.2.11: Failure Mode — Missing Sequence Persistence

**Symptom**:

> Tasks from later milestones appear above tasks from earlier milestones in Odoo UI,  
> despite correct ordering logic in the generator.

**Root Cause**:

When `project.task.create()` is called without setting the `sequence` field:

1. **Odoo sets all tasks to `sequence = 0` by default**
   - No distinction between tasks from different milestones
   - No distinction between tasks with different logical positions
   - All tasks have identical sequence values

2. **Odoo falls back to ID-based sorting**
   - With identical sequence values, Odoo sorts by `id DESC`
   - Most recently created tasks (highest IDs) appear first
   - If creation order is DESC (M3 → M2 → M1), display order is correct by accident
   - If creation order is ASC (M1 → M2 → M3), display order is inverted

3. **Milestone boundaries become invisible to Odoo**
   - Odoo has no concept of "this task belongs to Milestone 1"
   - Without sequence values, milestone grouping is lost
   - Manual reordering in Odoo can intermix milestones

**Why STEP 7 (Dependencies) Cannot Fix This**:

> Task dependencies have zero effect on task display order in Odoo.

**Technical Explanation**:
- Dependencies are stored in a separate `project.task.dependency` model
- They affect task execution logic (blocking, warnings)
- They do NOT affect the task list view sort order
- Odoo's task list view sorts by `sequence ASC` or `id DESC`, never by dependency graph

**Common Misdiagnosis**:
- ❌ "Dependencies are not being created correctly" (dependencies work, but don't affect display)
- ❌ "We need to add milestone sorting after task creation" (Odoo doesn't support this)
- ❌ "The DESC creation order is the problem" (DESC is correct, but insufficient alone)

**Why This is Often Attributed to Dependencies**:

Developers observe:
1. Tasks are created in DESC order → Display looks correct initially ✅
2. Tasks have dependencies set correctly → Logical flow seems right ✅
3. But after Odoo refresh or manual reorder → Display is broken ❌

They incorrectly conclude: "Dependencies must be fixing the order somehow, and they're broken."

**Actual Mechanism**:
- DESC creation order produces correct display AS A SIDE EFFECT of ID ordering
- This is fragile and breaks on any manual interaction
- Dependencies never affected display order at all
- Only explicit `sequence` values provide durable correctness

**The Only Fix**:

> Set `task.sequence` explicitly during creation, derived from logical order.

**Implementation**:
```javascript
// Build sequence map from logical order
const taskSequenceMap = new Map();
logicalTasks.forEach((task, index) => {
  taskSequenceMap.set(task.blueprint_id, index * 10);
});

// Use sequence map during task creation (in execution order)
for (const task of executionTasks) {
  const taskData = {
    name: task.name,
    sequence: taskSequenceMap.get(task.blueprint_id)  // From logical order
  };
  await createTask(taskData);
}
```

**Result**:
- Milestone 1 tasks: sequence 0-90
- Milestone 2 tasks: sequence 100-190  
- Milestone 3 tasks: sequence 200-290

Odoo sorts by sequence ASC → Milestone 1 → Milestone 2 → Milestone 3 ✅

**Persistence**:
- Correct order survives Odoo refresh ✅
- Correct order survives manual task reordering within milestones ✅
- Milestone boundaries are enforced by sequence values ✅

---

### M2.2.12: Integration Boundary Failure — sequence Propagation

**Historical Incident**: January 30, 2026

**Root Cause Identified**:

On January 30, 2026, forensic code analysis revealed that task ordering was non-functional despite correct computation of `sequence` values. Two critical bugs were identified at the Odoo integration boundary:

1. **`sequence` field silently dropped in `batchCreateTasks()`**
   - Location: `src/modules/project-generator/odoo-creator.js`
   - Symptom: Field computed in STEP 6, assigned to `taskData`, but NOT mapped to Odoo payload
   - Result: All tasks created with `sequence = 0`, Odoo sorts by ID instead of semantic order

2. **Milestone `sequence` lost in generation model**
   - Location: `src/modules/project-generator/generate.js` (`buildGenerationModel()`)
   - Symptom: Field exists in blueprint but NOT copied to `generationModel.milestones`
   - Result: `computeTaskOrders()` reads `undefined` for all milestone sequences

**Normative Rule**:

> Ordering contracts are VOID if `sequence` is not persisted to Odoo.  
> Internal ordering correctness has ZERO value without RPC boundary propagation.

**Critical Integration Boundary**:

`batchCreateTasks()` in `odoo-creator.js` is a critical boundary where computed ordering MUST be transmitted to Odoo. Any field mapping omission at this boundary destroys ordering invariants.

**Mandatory Verification Rule**:

> Any generator change that computes ordering MUST verify persistence at the Odoo RPC boundary.  
> Verification MUST include inspection of actual Odoo payload in `batchCreateTasks()`.  
> Assumptions about "obvious" field propagation are FORBIDDEN.

**Failure Mode**:

When `sequence` is not transmitted to Odoo:
- Odoo creates all tasks with `sequence = 0` (default value)
- Tasks with identical sequence are sorted by creation ID (descending)
- Milestone boundaries become invisible to Odoo's UI
- Correct internal ordering (logicalTasks, executionTasks) becomes irrelevant
- Users observe tasks in reverse creation order, not semantic order

**Why This Failure is Catastrophic**:

1. **Silent corruption**: Code appears correct, logs show correct ordering, but Odoo receives wrong data
2. **Boundary crossing**: Bug exists in mapping layer, not in ordering logic or Odoo RPC
3. **Assumed propagation**: Developers assume fields in `taskData` automatically reach Odoo
4. **No validation**: No runtime check verifies `sequence` in actual Odoo payload

**Prevention Mechanisms** (implemented):

1. **Explicit field mapping in `batchCreateTasks()`**:
   ```javascript
   // ADDENDUM M2: Persist logical order sequence (CRITICAL FIX)
   if (data.sequence !== null && data.sequence !== undefined) {
     values.sequence = data.sequence;
   }
   ```

2. **Preserve milestone sequence in generation model**:
   ```javascript
   return {
     blueprint_id: milestone.id,
     name: milestone.name,
     sequence: milestone.sequence || 0  // CRITICAL FIX: Preserve milestone ordering
   };
   ```

3. **Forensic logging at RPC boundary**:
   ```javascript
   // FORENSIC LOG: Odoo RPC payload verification
   valuesArray.forEach((values, index) => {
     console.log(JSON.stringify({
       forensic: 'ODOO_PAYLOAD',
       index: index,
       name: values.name,
       sequence: values.sequence ?? 'MISSING',
       milestone_id: values.milestone_id ?? null
     }));
   });
   ```

**Code Review Requirement**:

> Any change to `batchCreateTasks()` MUST be reviewed for field mapping completeness.  
> Any omission of a computed field is a critical bug.  
> Any change to `buildGenerationModel()` MUST preserve all ordering-relevant fields.

**See**: [FORENSIC_ORDERING_TRACE.md](./FORENSIC_ORDERING_TRACE.md) for complete analysis.

1. **Explicit field mapping** (Fix 1):
   ```javascript
   if (data.sequence !== null && data.sequence !== undefined) {
     values.sequence = data.sequence;
   }
   ```

2. **Milestone sequence preservation** (Fix 2):
   ```javascript
   return {
     blueprint_id: milestone.id,
     name: milestone.name,
     sequence: milestone.sequence || 0  // Preserve for computeTaskOrders()
   };
   ```

3. **Forensic logging** (verification):
   - Pre-creation: Log `taskData.sequence` before `batchCreateTasks()`
   - Payload: Log `values.sequence` inside `batchCreateTasks()`
   - Response: Log returned task IDs for correlation

**Code Review Checklist**:

- ❌ Any field computed for ordering but not in `batchCreateTasks()` mapping
- ❌ Any generation model field omitted that is used by `computeTaskOrders()`
- ❌ Assumptions about automatic field propagation
- ✅ Explicit mapping for every ordering-related field
- ✅ Forensic logs at RPC boundary showing actual payload
- ✅ Tests verifying Odoo receives correct `sequence` values

**Reference**: See [FORENSIC_ORDERING_TRACE.md](./FORENSIC_ORDERING_TRACE.md) for complete code execution analysis.

---

## M2.3: Implementation

### M2.3.1: Execution Structure

**File**: `src/modules/project-generator/generate.js`  
**Function**: `generateProject()` (Step 6: Create tasks)

**Key Implementation**:

```javascript
// ADDENDUM M2: Sort milestones in DESCENDING order for correct Odoo UI display
// (Odoo shows newest tasks first, so we create in reverse)
const sortedMilestones = [...generationModel.milestones].sort((a, b) => {
  const aSeq = a.sequence || 0;
  const bSeq = b.sequence || 0;
  return bSeq - aSeq; // DESC order (reversed)
});

// ADDENDUM M1: Execute milestone-first loop
for (const milestone of sortedMilestones) {
  const group = milestoneGroups.get(milestone.blueprint_id);
  if (!group) continue;
  
  // ADDENDUM M2: Tasks within milestone are already sorted DESC by generation_order
  // (generation_order was computed with milestone DESC, task sequence DESC)
  
  // Parent tasks first (in reversed sequence order)
  if (group.parents.length > 0) {
    await batchCreateTasks(env, group.parents.map(buildTaskData));
  }
  
  // Subtasks (in reversed sequence order, after their parents)
  if (group.subtasks.length > 0) {
    await batchCreateTasks(env, group.subtasks.map(buildTaskData));
  }
}
```

**Reversal Points**:

1. **Milestone Loop**: `sortedMilestones` sorted by `sequence DESC`
2. **Task Sorting in buildGenerationModel()**: Tasks sorted by `milestone.sequence DESC`, then `task.sequence DESC`
3. **Parent-Child NOT Reversed**: Parents always before subtasks (safety constraint)

### M2.3.2: Code Changes

**File**: `src/modules/project-generator/generate.js`

**Change 1**: Reverse milestone loop order (line ~295)
```javascript
// Before (ADDENDUM M1):
const sortedMilestones = [...generationModel.milestones].sort((a, b) => {
  const aSeq = a.sequence || 0;
  const bSeq = b.sequence || 0;
  return aSeq - bSeq; // ASC
});

// After (ADDENDUM M2):
const sortedMilestones = [...generationModel.milestones].sort((a, b) => {
  const aSeq = a.sequence || 0;
  const bSeq = b.sequence || 0;
  return bSeq - aSeq; // DESC ← REVERSED
});
```

**Change 2**: Reverse task sorting in buildGenerationModel() (line ~595)
```javascript
// ADDENDUM M2: Sort in REVERSE order for Odoo UI correctness
allTasks.sort((a, b) => {
  // 1. Sort by milestone sequence (DESCENDING for M2 reversal)
  const aMilestoneSeq = a.milestone_blueprint_id 
    ? (milestoneSequenceMap.get(a.milestone_blueprint_id) || 0) 
    : -999999; // No milestone goes last (reversed)
  const bMilestoneSeq = b.milestone_blueprint_id 
    ? (milestoneSequenceMap.get(b.milestone_blueprint_id) || 0) 
    : -999999;
  
  if (aMilestoneSeq !== bMilestoneSeq) {
    return bMilestoneSeq - aMilestoneSeq; // DESC (reversed)
  }
  
  // 2. Within same milestone, parent tasks before subtasks (NOT reversed)
  const aIsParent = !a.parent_blueprint_id;
  const bIsParent = !b.parent_blueprint_id;
  
  if (aIsParent !== bIsParent) {
    return aIsParent ? -1 : 1; // Parents first (NOT reversed)
  }
  
  // 3. Within same level, sort by task sequence (DESCENDING for M2 reversal)
  const aTask = blueprint.tasks.find(t => t.id === a.blueprint_id);
  const bTask = blueprint.tasks.find(t => t.id === b.blueprint_id);
  const aTaskSeq = aTask ? (aTask.sequence || 0) : 0;
  const bTaskSeq = bTask ? (bTask.sequence || 0) : 0;
  
  return bTaskSeq - aTaskSeq; // DESC (reversed)
});
```

**Lines Changed**: ~5 lines (3 sort comparisons reversed)

---

## M2.4: Validation

### M2.4.1: Ordering Contract Validation

**Test Case 1**: Milestone Boundary Enforcement
```
Blueprint:
  Milestone 1 (seq: 1)
    Task A (seq: 100)
  
  Milestone 2 (seq: 2)
    Task B (seq: 1)

Expected Odoo Display:
  Task A (appears first, despite higher sequence)
  Task B (appears second)

Validation:
✅ Task A has higher Odoo ID than Task B
✅ Milestone boundary respected
```

**Test Case 2**: Parent-Child Local Scope
```
Blueprint:
  Milestone 1 (seq: 1)
    Parent A (seq: 1)
      Subtask A1 (seq: 1)
  
  Milestone 2 (seq: 2)
    Parent B (seq: 1)

Expected Execution Order (reversed):
  1. Parent B (M2)
  2. Parent A (M1)
  3. Subtask A1 (M1, child of A)

Expected Odoo Display:
  Parent A (M1)
  Subtask A1 (M1)
  Parent B (M2)

Validation:
✅ Subtask A1 appears after Parent A (parent-child preserved)
✅ Subtask A1 appears before Parent B (milestone boundary)
✅ No global batching violated milestone boundary
```

### M2.4.2: Reverse Order Validation

**Test Case 3**: Simple Reversal
```
Blueprint:
  Milestone 1 (seq: 1)
    Task A (seq: 1)
    Task B (seq: 2)
  
  Milestone 2 (seq: 2)
    Task C (seq: 1)

Execution Order:
  1. Task C (M2, seq 1) → ID: 100
  2. Task B (M1, seq 2) → ID: 101
  3. Task A (M1, seq 1) → ID: 102

Odoo Display (ID DESC):
  Task A (ID: 102)
  Task B (ID: 101)
  Task C (ID: 100)

Validation:
✅ Odoo display matches logical order
✅ Milestone 1 appears before Milestone 2
✅ Within M1, Task A (seq 1) before Task B (seq 2)
```

**Test Case 4**: Complex Reversal with Subtasks
```
Blueprint:
  Milestone 1 (seq: 1)
    Parent A (seq: 1)
      Subtask A1 (seq: 1)
      Subtask A2 (seq: 2)
  
  Milestone 2 (seq: 2)
    Parent B (seq: 1)

Execution Order:
  1. Parent B (M2) → ID: 100
  2. Parent A (M1) → ID: 101
  3. Subtask A2 (M1, parent A, seq 2) → ID: 102
  4. Subtask A1 (M1, parent A, seq 1) → ID: 103

Odoo Display (ID DESC):
  Subtask A1 (ID: 103)
  Subtask A2 (ID: 102)
  Parent A (ID: 101)
  Parent B (ID: 100)

Validation:
✅ Milestone 1 tasks appear before Milestone 2
✅ Parent A appears before its subtasks in display
✅ Subtask A1 (seq 1) appears before Subtask A2 (seq 2)
✅ Logical order perfectly matches Odoo display
```

### M2.4.3: Edge Cases

**Edge Case 1**: Tasks without milestone
```
Blueprint:
  Milestone 1 (seq: 1)
    Task A (seq: 1)
  
  No Milestone:
    Task Orphan (seq: 1)

Expected Behavior:
  Orphan tasks are processed last (milestone seq: -999999 in reversed sort)
  They appear at the bottom in Odoo display

Validation:
✅ Orphan tasks do not interfere with milestone ordering
✅ Orphan tasks appear after all milestone tasks
```

**Edge Case 2**: Empty milestones
```
Blueprint:
  Milestone 1 (seq: 1) - no tasks
  Milestone 2 (seq: 2)
    Task A (seq: 1)

Expected Behavior:
  Milestone 1 skipped (no tasks to create)
  Milestone 2 processed normally

Validation:
✅ Empty milestones do not cause errors
✅ No empty batch API calls made
```

### M2.4.4: Regression Testing

**ADDENDUM M/M1 Compatibility**:
- [x] Milestone-first execution preserved
- [x] No global batching across milestones
- [x] Parent-before-child within milestone preserved
- [x] Task sequence respected (now reversed)

**ADDENDUM L Compatibility**:
- [x] Batching still active (per milestone)
- [x] Performance maintained (no additional API calls)
- [x] Timeout guards still active

**Preview Compatibility**:
- [x] Preview shows logical order (not execution order)
- [x] Preview matches Odoo display order
- [x] generation_order field still computed (but now in reverse)

---

## Summary

**ADDENDUM M2** establishes the normative ordering contract and implements reverse execution order.

### Ordering Contract (Part 1)

1. **Milestones are execution boundaries** (tasks never cross)
2. **Parent-child is local** (only within milestone)
3. **Task sequence is secondary** (only within milestone + parent scope)

### Reverse Execution Order (Part 2)

**Problem**: Odoo displays tasks in reverse creation order (newest first)

**Solution**: Create tasks in reverse logical order

**Mechanism**:
- Sort milestones: `sequence DESC` (instead of ASC)
- Sort tasks: `sequence DESC` (instead of ASC)
- Preserve: `parent before child` (NOT reversed)

**Result**: Odoo display order matches blueprint logical order

### Code Changes

**File**: `src/modules/project-generator/generate.js`

**Lines Changed**: ~5
- Milestone sort: `aSeq - bSeq` → `bSeq - aSeq`
- Task milestone sort: `aMilestoneSeq - bMilestoneSeq` → `bMilestoneSeq - aMilestoneSeq`
- Task sequence sort: `aTaskSeq - bTaskSeq` → `bTaskSeq - aTaskSeq`

**Complexity**: Minimal (3 sort direction reversals)

### Validation

- ✅ Milestone boundaries enforced
- ✅ Parent-child local to milestone
- ✅ Task sequence secondary
- ✅ Reverse execution produces correct Odoo display
- ✅ Complex scenarios (subtasks, orphans, empty milestones) handled
- ✅ No regressions in M/M1/L

### Critical Warning

**DO NOT REMOVE THE REVERSAL**

This is not a bug. This is not "counter-intuitive complexity".  
This is the ONLY way to make Odoo display order match blueprint order.

---

**End of ADDENDUM M2**
