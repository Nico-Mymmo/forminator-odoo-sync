# Forensic Trace: Blueprint Milestone Reordering Failure

**Investigation Date**: 2025-01-XX  
**Issue**: Milestone reordering in Blueprint Editor has no visible effect  
**Methodology**: Code-only evidence analysis with zero speculation

---

## 1. ENTRYPOINT TRACE

### UI Event Binding
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1274)
```javascript
upBtn.onclick = () => moveMilestone(milestone.id, 'up');
```

**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1286)
```javascript
downBtn.onclick = () => moveMilestone(milestone.id, 'down');
```

**Evidence**: Up/down buttons directly invoke `moveMilestone(milestoneId, direction)` with no intermediate event handlers.

---

### Milestone Move Function
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1436-L1460)

```javascript
async function moveMilestone(milestoneId, direction) {
  // Sort milestones by sequence
  const sortedMilestones = [...blueprintState.milestones].sort((a, b) => 
    (a.sequence || 0) - (b.sequence || 0)
  );
  
  const currentIndex = sortedMilestones.findIndex(m => m.id === milestoneId);
  if (currentIndex === -1) return;
  
  // Determine swap target
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= sortedMilestones.length) return;
  
  // Swap sequence values
  const currentMilestone = sortedMilestones[currentIndex];
  const targetMilestone = sortedMilestones[targetIndex];
  
  const tempSequence = currentMilestone.sequence;
  currentMilestone.sequence = targetMilestone.sequence;
  targetMilestone.sequence = tempSequence;
  
  // Re-render and persist
  renderMilestones();
  validateAndDisplay();
  await persistBlueprint('milestone_reorder');
}
```

**Evidence**:
1. Line 1438-1440: Sorts `blueprintState.milestones` by `sequence` field
2. Line 1448-1453: Swaps `sequence` values between current and target milestone objects
3. Line 1456-1458: Calls `renderMilestones()`, `validateAndDisplay()`, then `persistBlueprint('milestone_reorder')`
4. **CRITICAL**: Mutates milestone objects directly via reference from `sortedMilestones` array

**Question**: Does sorting create copies or references?  
**Answer from code**: Line 1438 creates shallow copy of array (`[...blueprintState.milestones]`), but milestone objects themselves are references. Mutations to `currentMilestone.sequence` and `targetMilestone.sequence` mutate the original objects in `blueprintState.milestones`.

---

### Persist Function
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L954-L990)

```javascript
async function persistBlueprint(saveReason = 'auto') {
  // Validate before persisting
  const validation = validateBlueprint();
  
  if (!validation.valid) {
    showToast('Cannot save: blueprint has errors', 'error');
    throw new Error('Blueprint validation failed');
  }
  
  try {
    const response = await fetch(`/projects/api/blueprint/${window.TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(blueprintState)
    });
    
    const result = await response.json();
    
    if (result.success) {
      savedBlueprintState = deepClone(blueprintState);
      if (saveReason === 'manual_save') {
        showToast('Blueprint saved successfully', 'success');
      }
      validateAndDisplay();
    } else {
      showToast('Save failed: ' + result.error, 'error');
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Save blueprint error:', err);
    showToast('Network error saving blueprint', 'error');
    throw err;
  }
}
```

**Evidence**:
1. Line 970: Serializes **entire** `blueprintState` object via `JSON.stringify(blueprintState)`
2. Line 965-971: Sends PUT request to `/projects/api/blueprint/${TEMPLATE_ID}` with JSON body
3. **CRITICAL**: `blueprintState.milestones` array is serialized as-is, including all `sequence` fields
4. Line 977: On success, clones current state to `savedBlueprintState`

**Payload Content**: Entire blueprint object including:
- `blueprintState.milestones[]` (with mutated `sequence` values)
- `blueprintState.tasks[]`
- `blueprintState.stages[]`
- `blueprintState.tags[]`
- `blueprintState.stakeholders[]`
- `blueprintState.dependencies[]`

---

### Backend Route Handler
**Location**: [src/modules/project-generator/module.js](src/modules/project-generator/module.js#L194-L216)

```javascript
// Save blueprint data
'PUT /api/blueprint/:id': async (context) => {
  const { request, env, params } = context;
  
  try {
    const blueprintData = await request.json();
    const template = await saveBlueprintData(env, params.id, blueprintData);
    
    return new Response(JSON.stringify({
      success: true,
      data: template
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Project Generator] Save blueprint failed:', error);
    
    const status = error.message.includes('not found') ? 404 :
                  error.message.includes('must be') ? 400 : 500;
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status,
```

**Evidence**:
1. Line 197: Parses request body to `blueprintData` object
2. Line 198: Passes entire `blueprintData` object to `saveBlueprintData(env, params.id, blueprintData)`
3. **NO transformations, filtering, or normalization applied**
4. Line 200-203: Returns entire template object (includes `blueprint_data` field)

---

### Backend Persistence Layer
**Location**: [src/modules/project-generator/library.js](src/modules/project-generator/library.js#L245-L260)

```javascript
export async function saveBlueprintData(env, templateId, blueprintData) {
  if (!blueprintData || typeof blueprintData !== 'object') {
    throw new Error('Blueprint data must be an object');
  }
  
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_templates')
    .update({ blueprint_data: blueprintData })
    .eq('id', templateId)
    .select()
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
```

**Evidence**:
1. Line 254: Updates `blueprint_data` JSONB field with exact `blueprintData` object received
2. **NO sorting, normalization, or sequence recalculation**
3. Line 256: Returns updated row via `.select().single()`

**Database Schema**: `project_templates.blueprint_data` is JSONB column (dynamic structure, no constraints)

---

### Backend Read-Back Layer
**Location**: [src/modules/project-generator/library.js](src/modules/project-generator/library.js#L216-L232)

```javascript
export async function getBlueprintData(env, templateId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_templates')
    .select('blueprint_data')
    .eq('id', templateId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Template not found');
    }
    console.error('[Template Library] Get blueprint failed:', error);
    throw new Error(`Failed to get blueprint: ${error.message}`);
  }
  
  return data.blueprint_data || {};
}
```

**Evidence**:
1. Line 220-224: Selects `blueprint_data` JSONB field directly from database
2. Line 232: Returns `data.blueprint_data` as-is (or empty object)
3. **NO sorting, normalization, or sequence interpretation**
4. JSONB field is returned exactly as stored

---

### Backend GET Route Handler
**Location**: [src/modules/project-generator/module.js](src/modules/project-generator/module.js#L168-L191)

```javascript
try {
  const blueprintData = await getBlueprintData(env, params.id);
  
  return new Response(JSON.stringify({
    success: true,
    data: blueprintData
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
  
} catch (error) {
  console.error('[Project Generator] Get blueprint failed:', error);
  
  const status = error.message.includes('not found') ? 404 : 500;
  
  return new Response(JSON.stringify({
    success: false,
    error: error.message
  }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Evidence**:
1. Line 170: Calls `getBlueprintData(env, params.id)`
2. Line 172-176: Returns blueprint data as JSON response
3. **NO transformations applied**

---

### Client-Side Load Function
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L874-L891)

```javascript
async function loadBlueprint() {
  try {
    const response = await fetch(`/projects/api/blueprint/${window.TEMPLATE_ID}`, {
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      const data = result.data || {};
      
      // Ensure all required properties exist with defaults
      blueprintState = {
        description: data.description || '',  // Template description
        stages: data.stages || [],
        milestones: data.milestones || [],
        tags: data.tags || [],
        stakeholders: data.stakeholders || [], // Addendum J
        tasks: data.tasks || [],
        dependencies: data.dependencies || []
      };
```

**Evidence**:
1. Line 889: Assigns `data.milestones || []` directly to `blueprintState.milestones`
2. **NO sorting or sequence normalization**
3. Milestones array is loaded exactly as stored in database

---

### Client-Side Render Function
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1198-L1224)

```javascript
function renderMilestones() {
  const list = document.getElementById('milestonesList');
  const empty = document.getElementById('emptyMilestones');
  const countBadge = document.getElementById('milestonesCount');
  
  list.innerHTML = '';
  
  // I1: Update count badge
  if (countBadge) {
    countBadge.textContent = blueprintState.milestones.length;
  }
  
  if (blueprintState.milestones.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  empty.style.display = 'none';
  
  const sortedMilestones = [...blueprintState.milestones].sort((a, b) => 
    (a.sequence || 0) - (b.sequence || 0)
  );
  
  sortedMilestones.forEach((milestone, index) => {
```

**Evidence**:
1. Line 1220-1222: Sorts milestones by `sequence` field for **display purposes only**
2. **CRITICAL**: This sort is **client-side only** and **does not persist**
3. Sort uses `(a.sequence || 0) - (b.sequence || 0)` (ascending numeric sort)
4. **UNKNOWN FROM CODE**: Whether this sort correctly reflects swapped sequence values

---

## 2. PAYLOAD DIFF ANALYSIS

### Before Reorder (Hypothetical Initial State)
```json
{
  "milestones": [
    { "id": "abc-123", "name": "Milestone 1", "sequence": 1, ... },
    { "id": "def-456", "name": "Milestone 2", "sequence": 2, ... },
    { "id": "ghi-789", "name": "Milestone 3", "sequence": 3, ... }
  ]
}
```

### After User Clicks "Move Down" on Milestone 1
**Expected Mutation** (per code at line 1448-1453):
- Milestone 1 (`sequence: 1`) swaps with Milestone 2 (`sequence: 2`)
- Result: Milestone 1 gets `sequence: 2`, Milestone 2 gets `sequence: 1`

**Payload Sent to PUT /api/blueprint/:id** (per code at line 970):
```json
{
  "milestones": [
    { "id": "abc-123", "name": "Milestone 1", "sequence": 2, ... },
    { "id": "def-456", "name": "Milestone 2", "sequence": 1, ... },
    { "id": "ghi-789", "name": "Milestone 3", "sequence": 3, ... }
  ]
}
```

**Evidence**:
1. Array order in `blueprintState.milestones` is **unchanged** (order depends on original load order)
2. `sequence` fields are **swapped** in-place
3. Payload contains **mutated sequence values**

**CRITICAL OBSERVATION**: Array order in JSONB ≠ display order. Display order is determined by client-side sort at render time.

---

## 3. BACKEND WRITE VERIFICATION

### Persistence Mechanism
**Location**: [library.js](src/modules/project-generator/library.js#L254)
```javascript
.update({ blueprint_data: blueprintData })
```

**Evidence**:
1. Supabase `update()` overwrites entire `blueprint_data` JSONB column
2. **NO field-level filtering, normalization, or recalculation**
3. Exact payload received from client is written to database
4. JSONB preserves array order and all fields

**Database State After Write**:
```json
{
  "blueprint_data": {
    "milestones": [
      { "id": "abc-123", "sequence": 2, ... },
      { "id": "def-456", "sequence": 1, ... },
      { "id": "ghi-789", "sequence": 3, ... }
    ]
  }
}
```

**Evidence Conclusion**: Backend writes **exact payload** with **swapped sequence values**.

---

## 4. READ-BACK TRACE

### Database Read
**Location**: [library.js](src/modules/project-generator/library.js#L232)
```javascript
return data.blueprint_data || {};
```

**Evidence**:
1. Returns JSONB field exactly as stored
2. **NO sorting or normalization**

### Client-Side Load
**Location**: [project-generator-client.js](public/project-generator-client.js#L889)
```javascript
milestones: data.milestones || [],
```

**Evidence**:
1. Assigns milestones array directly to `blueprintState.milestones`
2. **NO sorting or normalization**
3. Array order matches database storage order

### Client-Side Render
**Location**: [project-generator-client.js](public/project-generator-client.js#L1220-L1222)
```javascript
const sortedMilestones = [...blueprintState.milestones].sort((a, b) => 
  (a.sequence || 0) - (b.sequence || 0)
);
```

**Evidence**:
1. Sorts milestones by `sequence` field (ascending)
2. After reorder, milestones should sort as:
   - Milestone 2 (`sequence: 1`) → index 0
   - Milestone 1 (`sequence: 2`) → index 1
   - Milestone 3 (`sequence: 3`) → index 2

**Expected Behavior**: If sequence swap persisted correctly, Milestone 1 should appear **second** in display.

---

## 5. FAILURE POINT IDENTIFICATION

### Hypothesis Testing

#### Hypothesis 1: Sequence Swap Does Not Execute
**Evidence Against**:
- Code at [line 1448-1453](public/project-generator-client.js#L1448-L1453) explicitly swaps `sequence` values
- No conditional logic prevents execution
- No evidence of early return after swap

**Verdict**: REJECTED (code clearly swaps values)

---

#### Hypothesis 2: Payload Not Transmitted Correctly
**Evidence Against**:
- Code at [line 970](public/project-generator-client.js#L970) serializes entire `blueprintState` via `JSON.stringify()`
- Swapped milestones are part of `blueprintState.milestones`
- No evidence of payload filtering or transformation

**Verdict**: REJECTED (payload includes swapped sequence values)

---

#### Hypothesis 3: Backend Does Not Persist Payload
**Evidence Against**:
- Code at [library.js:254](src/modules/project-generator/library.js#L254) writes exact payload to database
- No evidence of middleware, triggers, or constraints that would reject sequence changes
- JSONB column has no schema constraints

**Verdict**: REJECTED (backend writes exact payload)

---

#### Hypothesis 4: Read-Back Overwrites Sequence Values
**Evidence Against**:
- Code at [library.js:232](src/modules/project-generator/library.js#L232) returns JSONB exactly as stored
- Code at [project-generator-client.js:889](public/project-generator-client.js#L889) assigns milestones array directly
- No evidence of normalization or recalculation

**Verdict**: REJECTED (read-back preserves persisted state)

---

#### Hypothesis 5: Render Does Not Respect Sequence Values
**Evidence FOR**:
- Code at [line 1220-1222](public/project-generator-client.js#L1220-L1222) **does** sort by sequence
- Sort expression: `(a.sequence || 0) - (b.sequence || 0)` (ascending numeric sort)
- **SHOULD** respect swapped sequence values

**Verdict**: INSUFFICIENT EVIDENCE (sort expression is correct, but actual runtime behavior UNKNOWN FROM CODE)

---

#### Hypothesis 6: Sequence Values Are Not Initialized
**Critical Question**: Do milestones have `sequence` field set when created?

**Evidence Search Required**:
- How are milestones created?
- Is `sequence` field set on creation?
- What is default value if missing?

**Location**: Searching for milestone creation code...

**UNKNOWN FROM CODE**: Milestone creation logic not yet examined. This is the **most likely failure point**.

---

### Additional Evidence Needed

To complete this analysis, must examine:
1. **Milestone creation code** to verify `sequence` field initialization
2. **Milestone edit code** to verify `sequence` field preservation
3. **Runtime logging** to verify actual sequence values before/after swap

**CRITICAL GAP**: If milestones do not have `sequence` field, the swap operation at [line 1448-1453](public/project-generator-client.js#L1448-L1453) swaps `undefined` values, resulting in:
```javascript
const tempSequence = undefined;  // currentMilestone.sequence
currentMilestone.sequence = undefined;  // targetMilestone.sequence
targetMilestone.sequence = undefined;  // tempSequence
```

This would leave **both milestones with `sequence: undefined`**, causing the sort at [line 1220-1222](public/project-generator-client.js#L1220-L1222) to treat them as `sequence: 0` (due to `|| 0` fallback), resulting in **no visible order change**.

---

## 6. VERIFICATION LOGGING

To prove/disprove the `sequence` field hypothesis, add the following minimal logging (NO logic changes):

### Log 1: Milestone Reorder Entry
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1436)
**Insert AFTER line 1436**:
```javascript
async function moveMilestone(milestoneId, direction) {
  console.log('[FORENSIC] moveMilestone called:', { milestoneId, direction });
```

### Log 2: Pre-Swap State
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1448)
**Insert BEFORE line 1448**:
```javascript
  // Swap sequence values
  console.log('[FORENSIC] Pre-swap:', {
    currentId: currentMilestone.id,
    currentSequence: currentMilestone.sequence,
    targetId: targetMilestone.id,
    targetSequence: targetMilestone.sequence
  });
```

### Log 3: Post-Swap State
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1453)
**Insert AFTER line 1453**:
```javascript
  targetMilestone.sequence = tempSequence;
  
  console.log('[FORENSIC] Post-swap:', {
    currentId: currentMilestone.id,
    currentSequence: currentMilestone.sequence,
    targetId: targetMilestone.id,
    targetSequence: targetMilestone.sequence
  });
```

### Log 4: Payload Transmission
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L970)
**Insert BEFORE line 970**:
```javascript
      body: JSON.stringify(blueprintState)
    });
    
    console.log('[FORENSIC] persistBlueprint payload milestones:', 
      blueprintState.milestones.map(m => ({ id: m.id, sequence: m.sequence }))
    );
```

### Log 5: Render Sort Input
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1220)
**Insert BEFORE line 1220**:
```javascript
  const sortedMilestones = [...blueprintState.milestones].sort((a, b) => 
    (a.sequence || 0) - (b.sequence || 0)
  );
  
  console.log('[FORENSIC] renderMilestones input:', 
    blueprintState.milestones.map(m => ({ id: m.id, sequence: m.sequence }))
  );
  console.log('[FORENSIC] renderMilestones sorted:', 
    sortedMilestones.map(m => ({ id: m.id, sequence: m.sequence }))
  );
```

### Log 6: Milestone Creation
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1392)
**Insert AFTER line 1399**:
```javascript
      sequence: maxSequence + 1  // ADDENDUM M: deterministic ordering
    });
    
    console.log('[FORENSIC] New milestone created:', {
      id: blueprintState.milestones[blueprintState.milestones.length - 1].id,
      sequence: blueprintState.milestones[blueprintState.milestones.length - 1].sequence
    });
```

### Log 7: Milestone Edit Preservation
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1381)
**Insert AFTER line 1385**:
```javascript
    milestone.color = color;
    
    console.log('[FORENSIC] Milestone edited (sequence preserved):', {
      id: milestone.id,
      sequence: milestone.sequence
    });
```

---

## 7. FINAL VERDICT

### Execution Path Verified
The milestone reordering code path is **structurally sound**:
1. ✅ UI buttons invoke `moveMilestone()` correctly
2. ✅ `moveMilestone()` swaps `sequence` field values
3. ✅ `persistBlueprint()` serializes entire blueprint with swapped values
4. ✅ Backend writes exact payload to JSONB column
5. ✅ Backend reads JSONB column without normalization
6. ✅ Client loads milestones array without normalization
7. ✅ `renderMilestones()` sorts by `sequence` field

### Milestone Creation: Sequence IS Initialized
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1392-L1399)

```javascript
  } else {
    // ADDENDUM M: Auto-assign sequence based on current max + 1
    const maxSequence = blueprintState.milestones.reduce((max, m) => 
      Math.max(max, m.sequence || 0), 0);
    
    blueprintState.milestones.push({
      id: generateUUID(),
      name: name,
      deadline_offset_days: deadline_offset_days,
      duration_days: duration_days,
      color: color,
      sequence: maxSequence + 1  // ADDENDUM M: deterministic ordering
    });
  }
```

**Evidence**:
1. Line 1393-1394: Computes `maxSequence` from existing milestones
2. Line 1399: Sets `sequence: maxSequence + 1` for new milestones
3. Comment references "ADDENDUM M: deterministic ordering"
4. **CRITICAL**: New milestones **ARE** assigned sequence values

### Milestone Edit: Sequence Is Preserved
**Location**: [public/project-generator-client.js](public/project-generator-client.js#L1381-L1385)

```javascript
  if (editingMilestoneId) {
    const milestone = blueprintState.milestones.find(m => m.id === editingMilestoneId);
    milestone.name = name;
    milestone.deadline_offset_days = deadline_offset_days;
    milestone.duration_days = duration_days;
    milestone.color = color;
  }
```

**Evidence**:
1. Edit code mutates existing milestone object
2. **`sequence` field is NOT modified** (preserved from creation)
3. New milestones get `sequence`, existing milestones keep `sequence`

### Root Cause: REVISED HYPOTHESIS

Since `sequence` **IS** initialized on creation (line 1399) and **IS** preserved on edit (lines 1381-1385), the original hypothesis is **REJECTED**.

**New Hypothesis**: Existing milestones created **before ADDENDUM M** may not have `sequence` field.

**Evidence**:
1. Comment at line 1392: "ADDENDUM M: Auto-assign sequence based on current max + 1"
2. This implies `sequence` field was added in a later iteration
3. Milestones created before ADDENDUM M would have `sequence: undefined`
4. Migration code to backfill `sequence` field: **UNKNOWN FROM CODE**

### Failure Scenario (HIGH CONFIDENCE)

**For Old Milestones (Pre-ADDENDUM M)**:
```javascript
// Milestone created before sequence field existed
{ id: "old-123", name: "Old Milestone", sequence: undefined }

// moveMilestone() swap logic (line 1448-1453):
const tempSequence = undefined;  // currentMilestone.sequence
currentMilestone.sequence = undefined;  // targetMilestone.sequence  
targetMilestone.sequence = undefined;  // tempSequence

// Result: No change (undefined ↔ undefined)
```

**For New Milestones (Post-ADDENDUM M)**:
```javascript
// Milestone created after sequence field added
{ id: "new-456", name: "New Milestone", sequence: 1 }

// moveMilestone() swap logic works correctly:
const tempSequence = 1;
currentMilestone.sequence = 2;  // targetMilestone.sequence
targetMilestone.sequence = 1;   // tempSequence

// Result: Swap succeeds, order changes
```

**Mixed Scenario (Most Likely in Production)**:
- 3 old milestones: `sequence: undefined, undefined, undefined`
- 2 new milestones: `sequence: 1, 2`
- Sorting: `[undefined, undefined, undefined, 1, 2]` → `[undefined, undefined, undefined, 1, 2]` (fallback to `0`)
- **Reordering old milestones has no effect** (all treated as `sequence: 0`)
- **Reordering new milestones works correctly**

### Evidence Required to Confirm
1. **Runtime logging** to check actual `sequence` values in pre-swap log
2. **Database inspection** to check if old milestones have `sequence: null`
3. **Blueprint age** to determine if created before/after ADDENDUM M

### Fix Required (NOT IMPLEMENTED - USER DID NOT REQUEST)
**Migration code to backfill `sequence` field for old milestones:**

```javascript
// HYPOTHETICAL FIX (NOT IMPLEMENTED)
async function loadBlueprint() {
  // ... existing load code ...
  
  // Auto-fix missing sequence fields
  let hasSequenceFixes = false;
  blueprintState.milestones.forEach((milestone, index) => {
    if (milestone.sequence === undefined || milestone.sequence === null) {
      milestone.sequence = index + 1;
      hasSequenceFixes = true;
    }
  });
  
  if (hasSequenceFixes) {
    await persistBlueprint('sequence_backfill');
  }
}
```

**Final Evidence-Based Statement**: 

Milestone reordering **WORKS CORRECTLY** for milestones created after ADDENDUM M (which added the `sequence` field). However, milestones created **before** ADDENDUM M have `sequence: undefined`, causing the swap operation to have no effect (`undefined ↔ undefined`). The render function's fallback (`|| 0`) treats all undefined sequences as `0`, resulting in stable sort by original array order. Reordering fails for old milestones but succeeds for new ones. **Root cause: Missing migration code to backfill `sequence` field for pre-ADDENDUM M milestones**. Logging at swap entry point will reveal exact `sequence` values and confirm this hypothesis.
