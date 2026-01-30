# FORENSIC ORDERING TRACE

**Status**: 🔴 CRITICAL BUG IDENTIFIED  
**Date**: January 30, 2026  
**Context**: Task ordering investigation  
**Type**: Code execution forensics

---

## EXECUTIVE SUMMARY

**ROOT CAUSE IDENTIFIED**: The `sequence` field is computed and assigned in `generate.js` STEP 6, but is **NOT propagated to Odoo** by `batchCreateTasks()` in `odoo-creator.js`.

**Evidence**: Line 310 of `odoo-creator.js` builds task values but does not include `data.sequence` in the mapping, causing Odoo to default all tasks to `sequence = 0`.

**Impact**: Milestone dominance is destroyed because Odoo sorts by ID (creation order) instead of semantic sequence.

---

## 1. ENTRYPOINT MAP

### HTTP Request → generateProject() Call Chain

```
USER REQUEST (Browser)
  ↓
POST /projects/api/generate/:id
  ↓
src/index.js (Cloudflare Worker fetch handler)
  Line ~200-250: Route matching via MODULES registry
  ↓
src/modules/project-generator/module.js
  Line 297: 'POST /api/generate/:id' route handler
  ↓
module.js Line 384: await generateProject(env, params.id, template.name, projectStartDate, generationModel)
  ↓
src/modules/project-generator/generate.js
  Line 161: export async function generateProject(env, templateId, templateName, projectStartDate, overrideModel)
```

**Full Call Chain**:
1. **src/index.js** Lines 200-250: Request routing to module
2. **src/modules/project-generator/module.js** Line 297: Route handler `'POST /api/generate/:id'`
3. **module.js** Line 384: Calls `generateProject(env, params.id, template.name, projectStartDate, generationModel)`
4. **src/modules/project-generator/generate.js** Line 161: Function entry point

---

## 2. STEP-BY-STEP EXECUTION TRACE (RUNTIME)

### STEP 1: Validate Blueprint
- **Function**: `validateBlueprint()` from `validation.js`
- **Input**: `blueprintData` from `getBlueprintData(env, templateId)`
- **Output**: `{ valid: true/false, errors: [...] }`
- **Side Effects**: None (read-only validation)

### STEP 2: Build Generation Model
- **Function**: `buildGenerationModel()` (generate.js Line 509)
- **Input**: `blueprintData, templateName, projectStartDate, stakeholderMapping`
- **Output**: `generationModel` object with:
  - `project: { name, description, date_start, date, user_id }`
  - `stages: [{ blueprint_id, name, sequence }]`
  - `milestones: [{ blueprint_id, name }]` (⚠️ NO sequence field stored)
  - `tags: [{ blueprint_id, name }]`
  - `tasks: [{ blueprint_id, name, sequence, milestone_blueprint_id, parent_blueprint_id, ... }]`
- **Side Effects**: None (pure computation)

**CRITICAL**: `generationModel.tasks[].sequence` is populated from `blueprint.tasks[].sequence` (Line 692).

### STEP 3: Create Project
- **Function**: `createProject()` (odoo-creator.js Line 43)
- **Input**: `{ name, description, date_start, date, user_id }`
- **Output**: `projectId` (integer)
- **Odoo Call**: `create('project.project', values)`
- **Side Effects**: Odoo project record created

### STEP 4: Create Stages
- **Function**: `createStage()` (odoo-creator.js Line 78)
- **Input**: `{ name, sequence, project_id }`
- **Output**: `stageId` (integer)
- **Odoo Call**: 
  1. `create('project.task.type', { name, sequence })`
  2. `write('project.task.type', [stageId], { project_ids: [[4, projectId]] })`
- **Side Effects**: Stage created and linked to project
- **Stored**: `result.odoo_mappings.stages[blueprint_id] = stageId`

### STEP 5: Create Milestones
- **Function**: `batchCreateMilestones()` (odoo-creator.js Line 343)
- **Input**: `[{ name, project_id }]` (array)
- **Output**: `[milestoneId1, milestoneId2, ...]` (array of integers)
- **Odoo Call**: `batchCreate('project.milestone', valuesArray)`
- **Side Effects**: All milestones created in single API call
- **Stored**: `result.odoo_mappings.milestones[blueprint_id] = milestoneId`

### STEP 5.5: Create Tags
- **Function**: `getOrCreateTag()` (odoo-creator.js Line 137)
- **Input**: `{ name }`
- **Output**: `tagId` (integer)
- **Odoo Call**: 
  1. `searchRead('project.tags', [['name', '=', tagName]])`
  2. If not found: `create('project.tags', { name })`
- **Side Effects**: Tag found or created (global, not project-scoped)
- **Stored**: `result.odoo_mappings.tags[blueprint_id] = tagId`

### STEP 6: Create Tasks (THE CRITICAL STEP)

#### 6.1: Compute Task Orderings
- **Function**: `computeTaskOrders()` (generate.js Line 67)
- **Input**: `generationModel`
- **Output**: `{ logicalTasks, executionTasks }`
- **Logic**:
  - **logicalTasks**: Sorted by `milestone.sequence ASC → parent-first → task.sequence ASC`
  - **executionTasks**: Sorted by `milestone.sequence DESC → parent-first (NOT reversed) → task.sequence DESC`

#### 6.2: Build Sequence Map
- **Code**: generate.js Lines 349-353
  ```javascript
  const taskSequenceMap = new Map();
  logicalTasks.forEach((task, index) => {
    taskSequenceMap.set(task.blueprint_id, index * 10); // 0, 10, 20, 30...
  });
  ```
- **Effect**: `taskSequenceMap` contains `blueprint_id → sequence` mapping based on logical order

#### 6.3: Build Task Data
- **Function**: `buildTaskData()` (generate.js Line 363)
- **Input**: `task` object from execution order
- **Output**: Task payload object
- **Payload Fields** (Line 364-372):
  ```javascript
  {
    name: task.name,
    project_id: projectId,
    stage_id: defaultStageId,
    sequence: taskSequenceMap.get(task.blueprint_id) ?? 0,  // ✅ ASSIGNED HERE
    parent_id: parentOdooId (if subtask),
    milestone_id: milestoneOdooId (if exists),
    color: task.color (if exists),
    tag_ids: [mapped tag IDs],
    user_ids: [mapped user IDs],
    planned_date_begin: task.planned_date_begin (if exists),
    date_deadline: task.date_deadline (if exists),
    allocated_hours: task.planned_hours (if exists)
  }
  ```

**CRITICAL OBSERVATION**: `sequence` is included in the payload built by `buildTaskData()`.

#### 6.4: Create Tasks via batchCreateTasks()
- **Function**: `batchCreateTasks()` (odoo-creator.js Line 290)
- **Input**: `[taskData]` (array with single element, called per task in loop Line 431)
- **Output**: `[taskId]` (array with single element)
- **Odoo Call**: `batchCreate('project.task', valuesArray)`

**CRITICAL CODE** (odoo-creator.js Lines 302-324):
```javascript
const valuesArray = tasksData.map(data => {
  const values = {
    name: data.name,
    project_id: data.project_id
  };
  
  if (data.stage_id) values.stage_id = data.stage_id;
  if (data.parent_id) values.parent_id = data.parent_id;
  if (data.milestone_id) values.milestone_id = data.milestone_id;
  if (data.color !== null && data.color !== undefined) values.color = data.color;
  if (data.tag_ids && data.tag_ids.length > 0) {
    values.tag_ids = data.tag_ids.map(id => [4, id]);
  }
  if (data.user_ids && data.user_ids.length > 0) {
    values.user_ids = data.user_ids.map(id => [4, id]);
  }
  if (data.planned_date_begin) values.planned_date_begin = data.planned_date_begin;
  if (data.date_deadline) values.date_deadline = data.date_deadline;
  if (data.allocated_hours !== null && data.allocated_hours !== undefined) {
    values.allocated_hours = data.allocated_hours;
  }
  
  // Addendum B: Hide subtasks from Kanban
  values.display_in_project = data.parent_id ? false : true;
  
  return values;
});
```

**🔴 SMOKING GUN**: The `sequence` field is **NEVER mapped** from `data.sequence` into `values`.

**Evidence**: No line contains `values.sequence = data.sequence` or similar.

### STEP 7: Create Dependencies
- **Function**: `addTaskDependencies()` (odoo-creator.js Line 268)
- **Input**: `taskOdooId, [dependsOnOdooIds]`
- **Output**: None (void)
- **Odoo Call**: `write('project.task', [taskId], { depend_on_ids: [[6, 0, dependsOnIds]] })`
- **Side Effects**: Dependency links created
- **Iteration Source**: `logicalTasks` (correctly uses semantic order)

---

## 3. TASK ORDERING PIPELINE (DEEP DIVE)

### 3.1: Generation Model Construction

**File**: `src/modules/project-generator/generate.js`  
**Function**: `buildGenerationModel()` Line 509

**Milestones** (Lines 563-592):
```javascript
model.milestones = blueprint.milestones.map(milestone => {
  // ... timing calculation ...
  return {
    blueprint_id: milestone.id,
    name: milestone.name
    // ⚠️ NO sequence field - lost here
  };
});
```

**Blueprint Source**: `blueprint.milestones[].sequence` exists (from Supabase schema).

**Generation Model**: `generationModel.milestones[]` does NOT include `sequence` field.

**Impact**: `computeTaskOrders()` must look up milestone sequence from blueprint, not from generation model.

**Tasks** (Lines 609-699):
```javascript
taskMap.set(task.id, {
  blueprint_id: task.id,
  name: task.name,
  sequence: task.sequence || 0,  // ✅ PRESERVED from blueprint
  milestone_blueprint_id: task.milestone_id || null,
  parent_blueprint_id: task.parent_id,
  // ... other fields ...
});
```

**Task Sequence Source**: `blueprint.tasks[].sequence` (Supabase).

**Generation Model**: `generationModel.tasks[].sequence` is populated.

### 3.2: computeTaskOrders() Logic

**File**: `src/modules/project-generator/generate.js`  
**Function**: `computeTaskOrders()` Line 67

**Milestone Sequence Lookup** (Lines 71-77):
```javascript
const milestoneSequenceMap = new Map();
if (generationModel.milestones && Array.isArray(generationModel.milestones)) {
  generationModel.milestones.forEach(m => {
    milestoneSequenceMap.set(m.blueprint_id, m.sequence || 0);
  });
}
```

**🔴 BUG**: `generationModel.milestones[].sequence` is `undefined` because it was not copied in `buildGenerationModel()`.

**Result**: All milestones get `sequence = 0` in the map.

**Workaround**: The code at Line 349 references `generationModel.milestones.find(m => m.blueprint_id === task.milestone_blueprint_id)?.sequence`, which is also `undefined`.

**ACTUAL BEHAVIOR**: Milestone sequence ordering is **BROKEN** at runtime because milestone sequence is not available.

### 3.3: Logical Tasks Ordering

**Sort Key** (Lines 87-118):
1. `milestone.sequence ASC` ← **ALWAYS 0** (broken)
2. `parent_blueprint_id` presence (parents first)
3. `task.sequence ASC`

**Result**: Tasks are only sorted by parent-first + task sequence. Milestone ordering is non-functional.

### 3.4: Execution Tasks Ordering

**Sort Key** (Lines 121-154):
1. `milestone.sequence DESC` ← **ALWAYS 0** (broken)
2. `parent_blueprint_id` presence (parents first, NOT reversed)
3. `task.sequence DESC`

**Result**: Tasks are sorted DESC by task sequence, parent-first. Milestone ordering is non-functional.

### 3.5: Task Sequence Map

**Code** (Lines 349-353):
```javascript
const taskSequenceMap = new Map();
logicalTasks.forEach((task, index) => {
  taskSequenceMap.set(task.blueprint_id, index * 10);
});
```

**Input**: `logicalTasks` (sorted by broken milestone + task sequence)  
**Output**: Map of `blueprint_id → 0, 10, 20, 30, ...`

**Scheme**: Linear sequence starting at 0, incrementing by 10.

### 3.6: Payload Sent to Odoo

**Code** (generate.js Lines 364-372):
```javascript
const taskData = {
  name: task.name,
  project_id: projectId,
  stage_id: defaultStageId,
  sequence: taskSequenceMap.get(task.blueprint_id) ?? 0,  // ✅ INCLUDED
  parent_id: ...,
  milestone_id: ...,
  // ... other fields ...
};
```

**Payload includes**: `sequence` field with value from `taskSequenceMap`.

### 3.7: batchCreateTasks() Behavior

**File**: `src/modules/project-generator/odoo-creator.js`  
**Function**: `batchCreateTasks()` Line 290

**Input Mapping** (Lines 302-327):
- ✅ `name` → `values.name`
- ✅ `project_id` → `values.project_id`
- ✅ `stage_id` → `values.stage_id` (if exists)
- ✅ `parent_id` → `values.parent_id` (if exists)
- ✅ `milestone_id` → `values.milestone_id` (if exists)
- ✅ `color` → `values.color` (if exists)
- ✅ `tag_ids` → `values.tag_ids` (if exists)
- ✅ `user_ids` → `values.user_ids` (if exists)
- ✅ `planned_date_begin` → `values.planned_date_begin` (if exists)
- ✅ `date_deadline` → `values.date_deadline` (if exists)
- ✅ `allocated_hours` → `values.allocated_hours` (if exists)
- ✅ `display_in_project` → `values.display_in_project` (computed)
- ❌ **`sequence` → NOT MAPPED**

**Odoo RPC Call** (via `batchCreate()` in `src/lib/odoo.js` Line 168):
```javascript
executeKw(env, {
  model: 'project.task',
  method: 'create',
  args: [valuesArray]
});
```

**Odoo Behavior** (UNKNOWN FROM CODE):
- Assumption: Odoo defaults `sequence = 0` for all tasks when field not provided
- Result: All tasks have identical sequence, sorted by `id DESC` in UI

**Order Preservation**: `batchCreate()` returns IDs in input order (Line 177 comment confirms).

---

## 4. ODOO CREATOR LAYER (CRITICAL)

### createProject() - Line 43
**Payload**:
```javascript
{
  name: data.name,
  description: data.description (optional),
  date_start: data.date_start (optional),
  date: data.date (optional),
  user_id: data.user_id (optional)
}
```
**Odoo Model**: `project.project`  
**Odoo Method**: `create`  
**Sequence**: N/A (not a sequenced model)

### createStage() - Line 78
**Payload**:
```javascript
{
  name: data.name,
  sequence: data.sequence  // ✅ INCLUDED
}
```
**Odoo Model**: `project.task.type`  
**Odoo Method**: `create` + `write` (for project link)  
**Sequence**: ✅ Correctly persisted

### batchCreateMilestones() - Line 343
**Payload**:
```javascript
{
  name: data.name,
  project_id: data.project_id
}
```
**Odoo Model**: `project.milestone`  
**Odoo Method**: `create` (batched)  
**Sequence**: N/A (milestones don't have sequence in Odoo schema per our code)

### getOrCreateTag() - Line 137
**Payload**:
```javascript
{
  name: data.name
}
```
**Odoo Model**: `project.tags`  
**Odoo Method**: `search_read` + `create` (conditional)  
**Sequence**: N/A (tags are global, no sequence)

### batchCreateTasks() - Line 290
**Payload** (🔴 CRITICAL):
```javascript
{
  name: data.name,
  project_id: data.project_id,
  stage_id: data.stage_id (optional),
  parent_id: data.parent_id (optional),
  milestone_id: data.milestone_id (optional),
  color: data.color (optional),
  tag_ids: [[4, id], ...] (optional),
  user_ids: [[4, id], ...] (optional),
  planned_date_begin: data.planned_date_begin (optional),
  date_deadline: data.date_deadline (optional),
  allocated_hours: data.allocated_hours (optional),
  display_in_project: boolean (computed)
  // ❌ sequence: MISSING
}
```
**Odoo Model**: `project.task`  
**Odoo Method**: `create` (batched via `batchCreate`)  
**Sequence**: ❌ **NOT INCLUDED** despite being in `data.sequence`

**Post-Creation Write**: NONE (no additional `write()` call to set sequence).

### addTaskDependencies() - Line 268
**Payload**:
```javascript
{
  depend_on_ids: [[6, 0, [id1, id2, ...]]]
}
```
**Odoo Model**: `project.task`  
**Odoo Method**: `write`  
**Sequence**: N/A (dependency linking only)

---

## 5. WHAT ODOO UI IS SORTING BY

### From Code Evidence

**UNKNOWN FROM CODE**: This repository does not contain:
- Custom Odoo views
- Custom search views
- Custom actions with default_order
- Client-side view customization

### Inference (Labeled as Such)

**INFERENCE** (not proven from code):
1. Odoo's default task list view likely sorts by `id DESC` when all tasks have `sequence = 0`
2. This explains why tasks appear in reverse creation order
3. When `sequence` field is properly set with distinct values, Odoo would sort by `sequence ASC`

**Observable Symptom**: Tasks appear ordered by creation ID (descending), not by milestone or semantic order.

**What We Can Prove**:
- `sequence` field is computed in STEP 6 (✅ proven)
- `sequence` field is included in `buildTaskData()` payload (✅ proven)
- `sequence` field is NOT mapped in `batchCreateTasks()` (✅ proven)
- Therefore, Odoo receives tasks without `sequence` field (✅ proven)
- Odoo's default behavior for missing `sequence` is UNKNOWN FROM CODE

---

## 6. ROOT CAUSE HYPOTHESES (RANKED)

### Hypothesis 1: sequence Field Not Mapped in batchCreateTasks() [CONFIRMED]

**Evidence**:
- `odoo-creator.js` Line 302-327: No `values.sequence = data.sequence` mapping
- `generate.js` Line 370: `sequence` IS included in `taskData`
- Result: Field computed but not transmitted to Odoo

**Likelihood**: ✅ **100% CONFIRMED**

**Next Check**: Add `values.sequence = data.sequence` in `batchCreateTasks()` mapping logic.

**Minimal Test**:
```javascript
// In odoo-creator.js Line ~318 (after allocated_hours check)
if (data.sequence !== null && data.sequence !== undefined) {
  values.sequence = data.sequence;
}
```

**Expected Result**: Tasks will be sorted by sequence in Odoo UI after this fix.

---

### Hypothesis 2: Milestone Sequence Not Persisted in Generation Model [CONFIRMED]

**Evidence**:
- `generate.js` Line 583: `generationModel.milestones[]` does not include `sequence` field
- `generate.js` Line 73: `milestoneSequenceMap.set(m.blueprint_id, m.sequence || 0)` reads undefined
- Result: All milestone sequences are 0, milestone ordering is broken

**Likelihood**: ✅ **100% CONFIRMED**

**Impact**: Even if task sequence is fixed, milestone-based ordering is non-functional.

**Next Check**: Add `sequence: milestone.sequence` to generation model milestones.

**Minimal Fix**:
```javascript
// In generate.js Line ~583
return {
  blueprint_id: milestone.id,
  name: milestone.name,
  sequence: milestone.sequence || 0  // ADD THIS
};
```

**Expected Result**: Milestone-based ordering will function in `computeTaskOrders()`.

---

### Hypothesis 3: Blueprint Milestones Missing Sequence Field [NEEDS VERIFICATION]

**Evidence**: UNKNOWN FROM CODE (blueprint schema not visible in this session).

**Check Required**: Verify Supabase schema for `blueprint_milestones` table has `sequence` column.

**Query**:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'blueprint_milestones';
```

**Expected**: `sequence` column of type `integer` should exist.

---

### Hypothesis 4: Task Sequence Values Overwritten Post-Creation [UNLIKELY]

**Evidence**: No `write()` call observed in STEP 6 or STEP 7 that modifies `sequence`.

**Check**: Search for `write(env, { model: 'project.task', ... values: { sequence: ... }})`.

**Result**: Not found in visible code.

**Likelihood**: ❌ **0%** (no evidence of sequence modification).

---

### Hypothesis 5: batchCreate() Drops Unknown Fields [UNLIKELY]

**Evidence**: 
- `batchCreate()` in `odoo.js` Line 168 passes `valuesArray` directly to `executeKw()`
- `executeKw()` passes values unchanged to Odoo RPC

**Likelihood**: ❌ **0%** (low-level library does not filter fields).

**Conclusion**: The bug is in the mapping layer (`batchCreateTasks()`), not in RPC layer.

---

## 7. MINIMAL INSTRUMENTATION PLAN

### Instrumentation Locations

#### 7.1: generate.js STEP 6 - Before Task Creation
**Location**: Line 430 (inside task creation loop)

**Code**:
```javascript
for (const task of tasksToCreateThisPass) {
  const taskData = buildTaskData(task);
  
  // FORENSIC LOG: Task creation payload
  console.log(JSON.stringify({
    forensic: 'TASK_CREATE',
    blueprint_id: task.blueprint_id,
    name: task.name,
    sequence: taskData.sequence,
    milestone_id: task.milestone_blueprint_id,
    milestone_seq: task.milestone_blueprint_id 
      ? (generationModel.milestones.find(m => m.blueprint_id === task.milestone_blueprint_id)?.sequence ?? 'UNDEFINED')
      : null,
    parent_id: task.parent_blueprint_id,
    task_seq_blueprint: task.sequence
  }));
  
  const taskIds = await batchCreateTasks(env, [taskData]);
  // ... rest of code ...
}
```

#### 7.2: odoo-creator.js batchCreateTasks() - Payload Inspection
**Location**: Line 330 (before batchCreate call)

**Code**:
```javascript
export async function batchCreateTasks(env, tasksData) {
  // ... existing mapping code ...
  
  // FORENSIC LOG: Odoo RPC payload
  valuesArray.forEach((values, index) => {
    console.log(JSON.stringify({
      forensic: 'ODOO_PAYLOAD',
      index: index,
      name: values.name,
      sequence: values.sequence ?? 'MISSING',
      milestone_id: values.milestone_id ?? null,
      parent_id: values.parent_id ?? null,
      stage_id: values.stage_id ?? null
    }));
  });
  
  const taskIds = await batchCreate(env, {
    model: 'project.task',
    valuesArray: valuesArray
  });
  
  // FORENSIC LOG: Returned IDs
  console.log(JSON.stringify({
    forensic: 'ODOO_RESPONSE',
    task_count: taskIds.length,
    ids: taskIds
  }));
  
  return taskIds;
}
```

#### 7.3: odoo.js executeKw() - RPC Layer Verification
**Already Logged**: Lines 68-106 contain comprehensive RPC logging.

**Additional**: None needed (existing logs sufficient).

### Log Format

**Single-line JSON per event** (grep-friendly):
```json
{"forensic":"TASK_CREATE","blueprint_id":"abc-123","name":"Task A","sequence":0,"milestone_id":"m1","milestone_seq":"UNDEFINED","parent_id":null,"task_seq_blueprint":1}
{"forensic":"ODOO_PAYLOAD","index":0,"name":"Task A","sequence":"MISSING","milestone_id":123,"parent_id":null,"stage_id":456}
{"forensic":"ODOO_RESPONSE","task_count":1,"ids":[789]}
```

**Grep Commands**:
```bash
# Extract all task creation events
grep '"forensic":"TASK_CREATE"' logs.txt | jq .

# Extract all Odoo payloads
grep '"forensic":"ODOO_PAYLOAD"' logs.txt | jq .

# Check for MISSING sequence
grep '"sequence":"MISSING"' logs.txt
```

### Safety
- ✅ No secrets logged (env/tokens excluded)
- ✅ No DOM manipulation (server-side only)
- ✅ No behavior changes (logs only)
- ✅ Single-line JSON (parseable)

---

## 8. REQUIRED CODE FIXES

### Fix 1: Map sequence Field in batchCreateTasks() [CRITICAL]

**File**: `src/modules/project-generator/odoo-creator.js`  
**Location**: Line 318 (after `allocated_hours` mapping)

**Add**:
```javascript
if (data.sequence !== null && data.sequence !== undefined) {
  values.sequence = data.sequence;
}
```

### Fix 2: Persist Milestone Sequence in Generation Model [CRITICAL]

**File**: `src/modules/project-generator/generate.js`  
**Location**: Line 583 (milestone mapping)

**Change**:
```javascript
return {
  blueprint_id: milestone.id,
  name: milestone.name,
  sequence: milestone.sequence || 0  // ADD THIS LINE
};
```

### Fix 3: Add Milestone Sequence to Blueprint Schema [IF MISSING]

**IF** Supabase `blueprint_milestones` table lacks `sequence` column:

**Migration**:
```sql
ALTER TABLE blueprint_milestones 
ADD COLUMN sequence INTEGER DEFAULT 0;

UPDATE blueprint_milestones 
SET sequence = ROW_NUMBER() OVER (PARTITION BY blueprint_id ORDER BY id);
```

**ELSE**: No schema change needed.

---

## CONCLUSION

**Two critical bugs identified**:

1. **`sequence` field not transmitted to Odoo** (odoo-creator.js Line 318)
   - Field computed ✅
   - Field assigned to payload ✅
   - Field NOT mapped to Odoo values ❌
   - **Impact**: All tasks default to `sequence = 0`, Odoo sorts by ID

2. **Milestone `sequence` lost in generation model** (generate.js Line 583)
   - Field exists in blueprint ✅ (assumed)
   - Field NOT copied to generation model ❌
   - Field lookup returns `undefined` in `computeTaskOrders()` ❌
   - **Impact**: Milestone-based ordering is non-functional

**Required Actions**:
1. Apply Fix 1 immediately (critical)
2. Apply Fix 2 immediately (critical)
3. Verify blueprint schema has milestone sequence (Fix 3 if needed)
4. Add instrumentation (section 7) for verification
5. Test with multi-milestone project to confirm ordering

**End of Forensic Trace**
