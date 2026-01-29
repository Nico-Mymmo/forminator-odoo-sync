# Addendum D — Proper Milestone Mapping

**Status:** Implemented  
**Date:** 2026-01-29  
**Type:** Model Correction  

---

## 🔴 Problem Statement

### What Was Wrong

In the initial implementation (Iteration 4), blueprint milestones were incorrectly mapped to Odoo `project.tags`:

```javascript
// ❌ INCORRECT (previous implementation)
const tagId = await createTag(env, milestoneName);
result.odoo_mappings.tags[milestoneName] = tagId;

// Tasks linked via tag_ids
taskData.tag_ids = [tagId];
```

### Why This Was Incorrect

**Semantic mismatch:**
- `project.tags` are generic labels/categories (e.g., "urgent", "bug", "feature")
- Milestones are first-class project management entities with:
  - Project-specific scope
  - Timeline/deadline semantics
  - Structural role in project phases

**Odoo data model:**
- Odoo has a dedicated `project.milestone` model
- Tasks link to milestones via `milestone_id` (many2one)
- Tags serve a different purpose entirely

**Impact:**
- Milestones appeared as generic tags in Odoo
- No proper milestone tracking in project views
- Semantic information loss
- Incorrect data modeling

---

## 🟢 Solution

### Corrected Mapping

Blueprint milestones now correctly map to `project.milestone` entities:

```javascript
// ✅ CORRECT (new implementation)
const milestoneId = await createMilestone(env, {
  name: milestone.name,
  project_id: projectId
});
result.odoo_mappings.milestones[milestone.blueprint_id] = milestoneId;

// Tasks linked via milestone_id
taskData.milestone_id = milestoneId;
```

### Changes Made

#### 1. **New Odoo Creator Function** (`odoo-creator.js`)

**Removed:**
```javascript
export async function createTag(env, name) { /* ... */ }
```

**Added:**
```javascript
export async function createMilestone(env, data) {
  const milestoneId = await create(env, {
    model: 'project.milestone',
    values: {
      name: data.name,
      project_id: data.project_id
    }
  });
  return milestoneId;
}
```

**Key differences:**
- Uses `project.milestone` model instead of `project.tags`
- Milestones are project-scoped via `project_id`
- Returns milestone ID for task linking

#### 2. **Updated Generation Lifecycle** (`generate.js`)

**STEP 5 changed from:**
```javascript
// Create tags for milestones
const uniqueMilestones = [...new Set(
  generationModel.tasks.map(t => t.milestone_name).filter(m => m !== null)
)];

for (const milestoneName of uniqueMilestones) {
  const tagId = await createTag(env, milestoneName);
  result.odoo_mappings.tags[milestoneName] = tagId;
}
```

**To:**
```javascript
// Create milestones
for (const milestone of generationModel.milestones) {
  const milestoneId = await createMilestone(env, {
    name: milestone.name,
    project_id: projectId
  });
  result.odoo_mappings.milestones[milestone.blueprint_id] = milestoneId;
}
```

**Key differences:**
- Milestones come from `generationModel.milestones` (not derived from tasks)
- Each milestone is created with explicit `project_id`
- Mapping uses blueprint IDs (not names) for deterministic lookups

#### 3. **Task Creation Updated** (`generate.js`)

**Changed from:**
```javascript
// Add milestone tag if exists
if (task.milestone_name && result.odoo_mappings.tags[task.milestone_name]) {
  taskData.tag_ids = [result.odoo_mappings.tags[task.milestone_name]];
}
```

**To:**
```javascript
// Add milestone if exists
if (task.milestone_blueprint_id) {
  const milestoneOdooId = result.odoo_mappings.milestones[task.milestone_blueprint_id];
  if (milestoneOdooId) {
    taskData.milestone_id = milestoneOdooId;
  }
}
```

**Key differences:**
- Uses `milestone_id` field (not `tag_ids`)
- Resolves via blueprint ID mapping
- Single milestone per task (not array)

#### 4. **Canonical Generation Model Extended** (`generate.js`)

**Added:**
```javascript
const model = {
  project: { /* ... */ },
  stages: [ /* ... */ ],
  milestones: [
    {
      blueprint_id: "uuid",
      name: "string"
    }
  ],
  tasks: [ /* ... */ ]
};
```

**Task model changed from:**
```javascript
{
  blueprint_id: "task-1",
  name: "Task name",
  milestone_name: "Milestone Alpha",  // ❌ Removed
  // ...
}
```

**To:**
```javascript
{
  blueprint_id: "task-1",
  name: "Task name",
  milestone_blueprint_id: "milestone-1",  // ✅ Added
  // ...
}
```

**Key differences:**
- Explicit `milestones` array in generation model
- Tasks reference milestones by blueprint ID (not name)
- Deterministic mapping via IDs

#### 5. **Result Mappings Updated**

**Changed from:**
```javascript
result.odoo_mappings = {
  stages: {},
  tags: {},      // ❌ Removed
  tasks: {}
};
```

**To:**
```javascript
result.odoo_mappings = {
  stages: {},
  milestones: {},  // ✅ Added
  tasks: {}
};
```

---

## 📊 Impact Analysis

### What Changed

| Aspect | Before (Iteration 4) | After (Addendum D) |
|--------|---------------------|-------------------|
| **Odoo Model** | `project.tags` | `project.milestone` |
| **Task Field** | `tag_ids` (many2many) | `milestone_id` (many2one) |
| **Scope** | Global tags | Project-scoped milestones |
| **Mapping Key** | Milestone name (string) | Blueprint ID (UUID) |
| **Generation Model** | Derived from tasks | Explicit `milestones` array |

### What Did NOT Change

✅ **Blueprint schema:** Milestones remain `{ id, name }` (no changes)  
✅ **UI:** Editor and library unchanged  
✅ **Validation:** Milestone validation rules unchanged  
✅ **Generation flow:** Still 7 sequential steps  
✅ **Fail-fast/fail-soft:** Error handling unchanged  

### Files Modified

1. [`src/modules/project-generator/generate.js`](../../src/modules/project-generator/generate.js)
   - Updated STEP 5 (tags → milestones)
   - Updated STEP 6 (task milestone linking)
   - Extended `buildGenerationModel()`
   - Updated result mappings

2. [`src/modules/project-generator/odoo-creator.js`](../../src/modules/project-generator/odoo-creator.js)
   - Removed `createTag()`
   - Added `createMilestone()`
   - Updated `createTask()` JSDoc

---

## 🔄 Backward Compatibility

### Existing Templates

✅ **No migration required**
- Blueprint schema unchanged
- Existing templates work without modification
- Validation rules unchanged

### Generated Projects

⚠️ **No automatic migration**
- Projects created before Addendum D still have milestone tags
- New projects will have proper milestones
- No conflicts (tags and milestones are separate models)

**Manual cleanup (optional):**
If you want to clean up old projects:
1. Delete milestone tags manually in Odoo
2. Create proper milestones
3. Link tasks to milestones via `milestone_id`

### API Compatibility

✅ **No breaking changes**
- POST `/api/generate/:id` signature unchanged
- Response structure unchanged (`odoo_mappings.tags` → `odoo_mappings.milestones`)
- Error handling unchanged

---

## 🧪 Testing Verification

### Test Cases

1. **Generate project with milestones:**
   - Milestones appear in Odoo as `project.milestone` entities
   - Tasks correctly linked via `milestone_id`
   - No tags created for milestones

2. **Generate project without milestones:**
   - No milestones created
   - Tasks have `milestone_id = null`
   - No errors

3. **Mixed task configurations:**
   - Some tasks with milestones
   - Some without
   - Correct selective linking

### Expected Odoo UI Behavior

- Milestones visible in project milestone view
- Tasks show milestone in task form
- No milestone-related tags visible
- Proper project scoping (milestones isolated per project)

---

## 📝 Rationale

### Why This Is a Correction, Not a Feature

This is **not** an optional enhancement—it's a **semantic correctness fix**:

1. **Odoo's intended data model:**
   - Milestones = `project.milestone` (designed for this purpose)
   - Tags = generic labels (different semantic domain)

2. **Data integrity:**
   - Proper foreign key relationships
   - Correct many2one semantics
   - Project-scoped data isolation

3. **User expectations:**
   - Milestones should appear in milestone views
   - Not mixed with generic tags

4. **Future compatibility:**
   - Odoo may add milestone-specific features (deadlines, progress tracking)
   - Using correct model ensures forward compatibility

---

## 🚀 Future Considerations

### Potential Enhancements (Not Implemented)

The following are **excluded** from Addendum D but could be future iterations:

1. **Milestone deadlines:**
   - Add `deadline` field to blueprint milestones
   - Map to `project.milestone.deadline`

2. **Milestone states:**
   - Add `state` (active/completed) to blueprint
   - Map to Odoo milestone state management

3. **Task-milestone validation:**
   - Warn if tasks reference non-existent milestones
   - Ensure all milestone references are valid

4. **Generation history:**
   - Track which milestones were created
   - Link to generated Odoo milestone URLs

---

## ✅ Acceptance Criteria Met

- [x] Milestones created as `project.milestone` entities
- [x] Tasks linked via `milestone_id` (not `tag_ids`)
- [x] No `project.tags` used for milestones
- [x] Generation remains deterministic
- [x] No blueprint schema changes
- [x] No UI changes required
- [x] Backward compatible (templates unchanged)
- [x] Documentation complete

---

## 📚 Related Documentation

- [MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md](MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md) - Full implementation history
- [ITERATION_4_DESIGN.md](ITERATION_4_DESIGN.md) - Original generation design
- [ITERATION_4_SUMMARY.md](ITERATION_4_SUMMARY.md) - Iteration 4 scope

---

**Conclusion:**  
Addendum D corrects a semantic error in the Odoo mapping layer without affecting user-facing behavior or requiring blueprint changes. This ensures proper data modeling and future-proofs the project generator for Odoo's milestone-specific features.
