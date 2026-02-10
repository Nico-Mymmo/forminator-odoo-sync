# Addendum P: Backlog Stage & Default Stakeholder Users

**Date:** 2026-02-10  
**Related to:** Project Generator Module  
**Dependencies:** Addendum J (Stakeholders), Addendum O (Stage Semantics), Odoo v14+ with custom field `x_is_backlog_stage` on `project.task.type`

---

## 1. Overview

This addendum extends the Project Generator with three enhancements:

1. **Backlog Stage Property** - Allow marking a stage as "Backlog" for workflow automation
2. **Default Users for Stakeholders** - Pre-assign Odoo users to stakeholders in templates
3. **Optional User Assignment** - Support tasks with no user assignments

### Problem Statement

**P.1 - Backlog Stage Identification**  
Project workflows often need a "Backlog" stage for tasks not yet scheduled. Without semantic marking (like Done/Cancelled stages in Addendum O), workflows must rely on fragile name-based detection.

**P.2 - Template Reusability vs. User Assignment**  
Templates are designed to be reusable (Addendum J), but stakeholder-to-user mapping happens during generation. However, many templates have predictable default users (e.g., "Project Manager" → always maps to same person). Forcing manual mapping every time reduces efficiency.

**P.3 - Unassigned Tasks**  
Some tasks legitimately have no assignee (e.g., placeholder tasks, optional tasks). The system should support this without requiring dummy users.

### Solution

**P.1** - Add `is_backlog_stage` boolean property to stages, mapped to Odoo custom field `x_is_backlog_stage`. This allows workflow automation to detect backlog tasks property-driven, like Done/Cancelled stages.

**P.2** - Allow stakeholders to define `default_user_ids` in templates. During generation, the mapping modal pre-populates with these defaults, which users can override (add/remove). This balances template reusability with generation flexibility.

**P.3** - If no users are selected for a stakeholder (or defaults are removed), the stakeholder is excluded from the mapping, resulting in no `user_ids` being set on tasks in Odoo.

---

## 2. P.1: Backlog Stage Property

### Odoo Integration

The Odoo database must have this boolean field on `project.task.type`:

```xml
<field name="x_is_backlog_stage" type="boolean" string="Backlog Stage"/>
```

Like Done/Approved/Cancelled stages (Addendum O), workflow automation reads this flag. The Project Generator sets the flag, Odoo handles workflow logic.

**Example automated action (implemented in Odoo):**

```python
# Pseudo-code - Odoo automated action
if record.stage_id.x_is_backlog_stage:
    # Mark task as unprioritized, exclude from sprint planning, etc.
    record.x_is_backlog = True
```

### Blueprint Data Model

Stage schema extension:

```javascript
{
  id: string,
  name: string,
  sequence: number,
  is_done_stage: boolean,        // Addendum O
  is_approved_stage: boolean,    // Addendum O
  is_cancelled_stage: boolean,   // Addendum O
  is_backlog_stage: boolean      // Addendum P - NEW
}
```

**Semantic Constraints:**

| Property             | Required | Max Count | Mutual Exclusivity                |
|----------------------|----------|-----------|-----------------------------------|
| `is_backlog_stage`   | No       | 1         | Independent (not mutually exclusive with Done/Approved/Cancelled) |

**Note:** Backlog is **independent** of Done/Approved/Cancelled semantics. A stage can be Backlog OR Done/Approved/Cancelled, but not both. The UI does NOT enforce mutual exclusivity between Backlog and the O-trio, but logically they should be separate.

### User Interface

Stage modal ([src/modules/project-generator/ui.js](../../src/modules/project-generator/ui.js#L512-L523)):

```html
<!-- Backlog Stage Checkbox (Blue) - AFTER Cancelled -->
<label class="label cursor-pointer justify-start gap-3">
  <input type="checkbox" id="stageIsBacklog" class="checkbox checkbox-info" />
  <div class="flex flex-col">
    <span class="label-text font-medium">Backlog Stage</span>
    <span class="label-text-alt">Tasks in this stage are marked as backlog items</span>
  </div>
</label>
```

**Validation:**
- Max 1 backlog stage across all stages (enforced in [public/project-generator-client.js:1361](../../public/project-generator-client.js#L1361-L1364))
- Optional (no minimum required)

**Stage Overview Display:**

Backlog stages are indicated with a blue "Backlog" badge in the stages list overview ([public/project-generator-client.js:1248-1254](../../public/project-generator-client.js)):

```javascript
// Render backlog badge in stage overview
if (stage.is_backlog_stage) {
  const backlogBadge = document.createElement('span');
  backlogBadge.className = 'badge badge-info badge-sm';
  backlogBadge.textContent = 'Backlog';
  leftDiv.appendChild(backlogBadge);
}
```

**Visual Example:**
```
Stages (4)
  [10] To Do
  [20] In Progress
  [30] Done [Done]
  [40] Backlog [Backlog]
```

**Client Logic ([public/project-generator-client.js:1283-1379](../../public/project-generator-client.js)):**

```javascript
// Get checkbox reference (L1286)
const isBacklogCheck = document.getElementById('stageIsBacklog');

// Load existing value (L1294)
isBacklogCheck.checked = stage.is_backlog_stage || false;

// Reset for new stage (L1302)
isBacklogCheck.checked = false;

// No mutual exclusivity handler - Backlog is independent

// Validate uniqueness (L1361-L1364)
if (isBacklog && otherStages.some(s => s.is_backlog_stage)) {
  alert('Only one stage can be marked as Backlog stage');
  return;
}

// Save to blueprint (L1376)
stage.is_backlog_stage = isBacklog;
```

### Generation Flow

**Step 4: Create Stages ([src/modules/project-generator/generate.js:245-257](../../src/modules/project-generator/generate.js#L245-L257))**

```javascript
for (const stage of generationModel.stages) {
  const stageId = await createStage(env, {
    name: stage.name,
    sequence: stage.sequence,
    project_id: projectId,
    is_done_stage: stage.is_done_stage || false,
    is_approved_stage: stage.is_approved_stage || false,
    is_cancelled_stage: stage.is_cancelled_stage || false,
    is_backlog_stage: stage.is_backlog_stage || false  // Addendum P
  });
}
```

**Odoo Creator ([src/modules/project-generator/odoo-creator.js:95-106](../../src/modules/project-generator/odoo-creator.js))**

```javascript
export async function createStage(env, data) {
  const values = {
    name: data.name,
    sequence: data.sequence
  };
  
  // Addendum O
  if (data.is_done_stage) values.x_is_done_stage = true;
  if (data.is_approved_stage) values.x_is_approved_stage = true;
  if (data.is_cancelled_stage) values.x_is_cancelled_stage = true;
  
  // Addendum P
  if (data.is_backlog_stage) values.x_is_backlog_stage = true;
  
  const stageId = await create(env, { model: 'project.task.type', values });
  // ... link to project
  return stageId;
}
```

---

## 3. P.2: Default Users for Stakeholders

### Concept

**Templates are generic, generations are specific** (Addendum J principle).

**Without defaults:**
- Template defines "Project Manager" stakeholder
- Every generation requires manually mapping "Project Manager" → real user
- Repetitive for predictable assignments

**With defaults:**
- Template defines "Project Manager" with `default_user_ids: [42]` (e.g., John Doe)
- Generation modal pre-populates with John Doe
- User can override (add/remove users) if needed

**Use cases:**
- Always the same person (e.g., "CEO" → always maps to company CEO)
- Common team (e.g., "Core Developers" → always maps to 3 specific developers)
- Starter configuration for new templates

### Blueprint Data Model

Stakeholder schema extension:

```javascript
{
  id: string,
  name: string,
  description: string,
  color: number,                  // Addendum J
  sequence: number,
  default_user_ids: [number]      // Addendum P - NEW (array of Odoo user IDs)
}
```

**Notes:**
- `default_user_ids` is **optional** (defaults to `[]`)
- Stores Odoo user IDs directly (not stakeholder IDs)
- Validated during generation (users must exist in Odoo)

**Stakeholder Overview Display:**

Stakeholders with default users show a badge indicating the count in the stakeholder list overview ([public/project-generator-client.js:1930-1942](../../public/project-generator-client.js)):

```javascript
// Show default users count in stakeholder overview
if (stakeholder.default_user_ids && stakeholder.default_user_ids.length > 0) {
  const defaultUsersBadge = document.createElement('span');
  defaultUsersBadge.className = 'badge badge-secondary badge-sm mt-1';
  const userIcon = document.createElement('i');
  userIcon.setAttribute('data-lucide', 'users');
  userIcon.className = 'w-3 h-3 mr-1';
  defaultUsersBadge.appendChild(userIcon);
  const userText = document.createElement('span');
  userText.textContent = `${stakeholder.default_user_ids.length} default user${stakeholder.default_user_ids.length !== 1 ? 's' : ''}`;
  defaultUsersBadge.appendChild(userText);
  textDiv.appendChild(defaultUsersBadge);
}
```

**Visual Example:**
```
Stakeholders (3)
  [1] Project Manager
      Overall responsibility
      [👥 2 default users]
  
  [2] Developer
      Implementation work
  
  [3] Client Contact
      [👥 1 default user]
```

### User Interface: Stakeholder Modal

**Location:** [src/modules/project-generator/ui.js:656-683](../../src/modules/project-generator/ui.js#L656-L683)

**New Section (after Color Picker):**

```html
<!-- Default Users Section (Addendum P) -->
<div class="divider">Default Users (Optional)</div>
<div class="form-control mb-4">
  <label class="label">
    <span class="label-text">Default Users</span>
    <span class="label-text-alt">Pre-assign users during project generation</span>
  </label>
  <div id="stakeholderDefaultUsersContainer">
    <!-- Selected users badges -->
    <div id="stakeholderSelectedUsers" class="flex flex-wrap gap-2 min-h-[2rem] items-center mb-2">
      <!-- Badges added by client.js -->
    </div>
    <!-- User selector -->
    <select id="stakeholderUserSelect" class="select select-bordered w-full select-sm">
      <option value="">-- Add default user --</option>
      <!-- Options populated by fetchAndRenderDefaultUsers() -->
    </select>
    <div class="alert alert-info text-xs mt-2">
      <i data-lucide="info" class="w-4 h-4"></i>
      <span>Default users can be overridden during project generation</span>
    </div>
  </div>
</div>
```

**Client Logic ([public/project-generator-client.js:1946-2155](../../public/project-generator-client.js)):**

**1. Open Modal - Fetch Users:**

```javascript
function openStakeholderModal(stakeholderId = null) {
  // ... existing color picker setup ...
  
  let defaultUserIds = []; // Addendum P
  
  if (stakeholderId) {
    const stakeholder = blueprintState.stakeholders.find(s => s.id === stakeholderId);
    defaultUserIds = stakeholder.default_user_ids || [];
  }
  
  // Addendum P: Fetch and render users
  fetchAndRenderDefaultUsers(defaultUserIds);
  
  modal.showModal();
}
```

**2. Fetch Users from API:**

```javascript
async function fetchAndRenderDefaultUsers(selectedUserIds = []) {
  const selectedUsersDiv = document.getElementById('stakeholderSelectedUsers');
  const userSelect = document.getElementById('stakeholderUserSelect');
  
  selectedUsersDiv.dataset.selectedUsers = JSON.stringify(selectedUserIds);
  
  // Fetch from /projects/api/odoo-users (same as generation modal)
  const response = await fetch('/projects/api/odoo-users', { credentials: 'include' });
  const result = await response.json();
  const users = result.users || [];
  
  // Populate dropdown
  users.forEach(user => {
    const option = document.createElement('option');
    option.value = user.id;
    option.dataset.userName = user.name;
    option.dataset.userLogin = user.login;
    option.textContent = `${user.name} (${user.login})`;
    userSelect.appendChild(option);
  });
  
  // Render selected users as badges
  selectedUserIds.forEach(userId => {
    const user = users.find(u => u.id === userId);
    if (user) addUserBadge(selectedUsersDiv, userId, user.name, user.login);
  });
  
  // Setup onchange handler to add users
  userSelect.onchange = () => { /* ... add badge logic ... */ };
}
```

**3. Save to Blueprint:**

```javascript
async function handleStakeholderSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('stakeholderName').value.trim();
  const description = document.getElementById('stakeholderDescription').value.trim();
  const selectedColor = document.getElementById('stakeholderColorPicker').dataset.selectedColor;
  
  // Addendum P: Get selected default users
  const selectedUsersDiv = document.getElementById('stakeholderSelectedUsers');
  const defaultUserIds = JSON.parse(selectedUsersDiv.dataset.selectedUsers || '[]');
  
  if (editingStakeholderId) {
    stakeholder.default_user_ids = defaultUserIds; // UPDATE
  } else {
    blueprintState.stakeholders.push({
      // ... other fields ...
      default_user_ids: defaultUserIds // CREATE
    });
  }
  
  await persistBlueprint('stakeholder_save');
}
```

### Generation Flow: Stakeholder Mapping Modal

**Location:** [public/project-generator-client.js:557-836](../../public/project-generator-client.js#L557-L836)

**Pre-population Logic ([L633-L688](../../public/project-generator-client.js#L633-L688)):**

```javascript
stakeholders.forEach(stakeholder => {
  // Addendum P: Pre-populate with default users
  const defaultUserIds = stakeholder.default_user_ids || [];
  
  const selectedUsersDiv = document.createElement('div');
  selectedUsersDiv.dataset.stakeholderId = stakeholder.id;
  selectedUsersDiv.dataset.selectedUsers = JSON.stringify(defaultUserIds); // Start with defaults
  
  // Render default users as badges
  defaultUserIds.forEach(userId => {
    const user = odooUsers.find(u => u.id === userId);
    if (user) {
      const badge = createUserBadge(userId, user.name);
      badge.onclick = () => removeUser(userId); // User can remove defaults
      selectedUsersDiv.appendChild(badge);
    }
  });
  
  // Dropdown to add more users (same as before)
  const select = createUserDropdown();
  select.onchange = () => addUser(); // User can add to defaults
});
```

**User Interaction:**
- Modal opens with default users already shown as badges
- User can **remove** default users by clicking X on badge
- User can **add** additional users via dropdown
- No distinction between "default" and "manually added" after modal opens

**Mapping Collection ([L797-L808](../../public/project-generator-client.js#L797-L808)):**

```javascript
confirmBtn.onclick = () => {
  const mapping = {
    project_responsible: projectResponsible,
    stakeholders: {}
  };
  
  stakeholders.forEach(stakeholder => {
    const selectedUsersDiv = modalBox.querySelector(`[data-stakeholder-id="${stakeholder.id}"]`);
    const userIds = JSON.parse(selectedUsersDiv.dataset.selectedUsers || '[]');
    
    // Addendum P: Only add if users selected (allows empty arrays)
    if (userIds.length > 0) {
      mapping.stakeholders[stakeholder.id] = userIds;
    }
  });
  
  resolve(mapping);
};
```

---

## 4. P.3: Optional User Assignment

### Concept

**Current behavior (Addendum J):**  
Tasks always get `user_ids` if stakeholder mapping exists.

**Problem:**  
- Placeholder tasks (no assignee yet)
- Tasks assigned to external parties (not in Odoo)
- Flexible templates where some tasks have no owner

**Solution:**  
If stakeholder has no users selected (either no defaults, or defaults removed during generation), the stakeholder is **excluded from the mapping**. When building the generation model, missing stakeholders result in no `user_ids` on the task.

### Implementation

**No code changes required** - existing logic already supports this:

**1. Mapping Modal ([public/project-generator-client.js:797-808](../../public/project-generator-client.js#L797-L808)):**

```javascript
stakeholders.forEach(stakeholder => {
  const userIds = JSON.parse(selectedUsersDiv.dataset.selectedUsers || '[]');
  
  // Only add to mapping if users are selected
  if (userIds.length > 0) {
    mapping.stakeholders[stakeholder.id] = userIds;
  }
  // If empty: stakeholder NOT in mapping.stakeholders
});
```

**2. Generation Model ([src/modules/project-generator/generate.js:724-737](../../src/modules/project-generator/generate.js#L724-L737)):**

```javascript
// Map stakeholder_ids to user_ids (Addendum J)
let user_ids = [];
if (stakeholderMapping && task.stakeholder_ids && task.stakeholder_ids.length > 0) {
  task.stakeholder_ids.forEach(stakeholderId => {
    const mappedUsers = stakeholderMapping.stakeholders[stakeholderId];
    if (mappedUsers && Array.isArray(mappedUsers)) {
      user_ids.push(...mappedUsers);
    }
    // If stakeholder not in mapping: mappedUsers is undefined → no users added
  });
  user_ids = [...new Set(user_ids)]; // Remove duplicates
}

taskMap.set(task.id, {
  // ... other fields ...
  user_ids: user_ids  // May be empty array
});
```

**3. Task Creation ([src/modules/project-generator/generate.js:399-403](../../src/modules/project-generator/generate.js#L399-L403)):**

```javascript
// Add user assignments if exist (Addendum J)
// Note (Addendum P): If user_ids is empty/missing here, odoo-creator.js
// will explicitly set it to empty list to prevent Odoo auto-assignment
if (task.user_ids && task.user_ids.length > 0) {
  taskData.user_ids = task.user_ids;
}
// If empty or undefined: user_ids NOT passed to odoo-creator
```

**4. Odoo Creator ([src/modules/project-generator/odoo-creator.js:237-244](../../src/modules/project-generator/odoo-creator.js#L237-L244)):**

```javascript
// Addendum J/P: User assignment support
// ALWAYS set user_ids explicitly to prevent Odoo from auto-assigning creator
if (data.user_ids && data.user_ids.length > 0) {
  values.user_ids = data.user_ids.map(id => [4, id]);  // Link existing users
} else {
  values.user_ids = [[6, 0, []]];  // Replace all with empty list
}
```

**Critical Fix (Addendum P):**  
Odoo's default behavior is to assign the API user (typically Administrator) as the task creator/assignee when `user_ids` is not provided. To prevent this auto-assignment, we **explicitly set `user_ids` to an empty list** using the Odoo ORM command `[[6, 0, []]]` which means "replace all with nothing".

**Odoo ORM Commands:**
- `[[4, id]]` - Link existing record (add to many2many)
- `[[6, 0, [ids]]]` - Replace all with list of IDs
- `[[6, 0, []]]` - Replace all with empty (removes all assignees)

**Result:** Tasks in Odoo have **truly empty `user_ids`** (no assignees, not even creator) if stakeholder was excluded from mapping.

---

## 5. Summary of Changes

### Files Modified

**Server-side:**
1. [src/modules/project-generator/odoo-creator.js](../../src/modules/project-generator/odoo-creator.js)
   - Line 106: Add `x_is_backlog_stage` mapping to `createStage()`
   - Lines 237-244: **Critical fix** - Explicitly set `user_ids` to empty list when no users provided (prevents Odoo auto-assignment of creator)
   - Lines 319-325: Apply same fix to `batchCreateTasks()`

2. [src/modules/project-generator/generate.js](../../src/modules/project-generator/generate.js)
   - Line 253: Include `is_backlog_stage` in stage creation
   - Lines 399-403: Add comment documenting explicit empty user_ids behavior

3. [src/modules/project-generator/ui.js](../../src/modules/project-generator/ui.js)
   - Lines 512-523: Add Backlog checkbox to stage modal
   - Lines 656-683: Add Default Users section to stakeholder modal

**Client-side:**
4. [public/project-generator-client.js](../../public/project-generator-client.js)
   - Lines 1248-1254: Add Backlog badge to stage overview (`renderStages()`)
   - Lines 1286-1376: Handle `is_backlog_stage` in stage modal
   - Lines 1930-1942: Show default users count in stakeholder overview (`renderStakeholders()`)
   - Lines 1976-2155: Fetch and manage default users in stakeholder modal
   - Lines 2045-2051: Save `default_user_ids` to blueprint
   - Lines 633-688: Pre-populate mapping modal with default users
   - Lines 803-806: Document optional user assignment behavior

### API Endpoints

**No new endpoints** - uses existing:
- `GET /projects/api/odoo-users` (Addendum J) - fetches users for default selection

### Database Schema

**No blueprint schema changes** - new optional fields:
- `stages[].is_backlog_stage` (boolean, optional)
- `stakeholders[].default_user_ids` (array, optional)

**Odoo custom field required:**
- `project.task.type.x_is_backlog_stage` (boolean)

---

## 6. Testing Scenarios

### P.1: Backlog Stage

**Scenario 1: Create Backlog Stage**
1. Open stage modal
2. Check "Backlog Stage"
3. Verify Done/Approved/Cancelled remain unchecked
4. Save → Verify stage appears in list
5. Validate blueprint → No errors

**Scenario 2: Backlog Uniqueness**
1. Create stage "Backlog" with Backlog checked
2. Create stage "Icebox" with Backlog checked
3. Verify error: "Only one stage can be marked as Backlog stage"

**Scenario 3: Generation with Backlog**
1. Create blueprint with Backlog stage
2. Generate project
3. Inspect Odoo stage → Verify `x_is_backlog_stage = True`

**Scenario 4: Backlog Badge in Overview**
1. Create stage "Parking Lot" with Backlog checked
2. Save and verify blue "Backlog" badge appears next to stage name in overview
3. Compare with Done (green), Approved (orange), Cancelled (red) badges

### P.2: Default Users

**Scenario 1: Add Default Users to Stakeholder**
1. Create stakeholder "Project Manager"
2. In Default Users section, select "John Doe"
3. Verify badge appears
4. Save → Verify `default_user_ids: [42]` in blueprint

**Scenario 2: Edit Default Users**
1. Edit existing stakeholder with defaults
2. Remove one user, add another
3. Save → Verify updated `default_user_ids`

**Scenario 3: Defaults Pre-populate Mapping Modal**
1. Create stakeholder with default users
2. Start generation → Open mapping modal
3. Verify default users already shown as badges
4. Remove one default, add new user
5. Continue → Verify custom mapping used

**Scenario 4: Default Users Badge in Overview**
1. Create stakeholder "Developer" with 2 default users
2. Save and verify "[👥 2 default users]" badge appears below stakeholder description
3. Create stakeholder "Designer" with 1 default user
4. Verify "[👥 1 default user]" badge (singular)
5. Create stakeholder "Client" with no default users
6. Verify no badge appears for stakeholders without defaults

### P.3: Optional User Assignment

**Scenario 1: Remove All Users from Stakeholder**
1. Stakeholder has defaults
2. In mapping modal, remove all users
3. Continue generation
4. Inspect Odoo task → Verify `user_ids` is empty

**Scenario 2: Stakeholder with No Defaults**
1. Create stakeholder with no defaults
2. In mapping modal, don't select any users
3. Continue generation
4. Verify task created with no assignees

**Scenario 3: Mixed Assignment**
1. Blueprint has 2 stakeholders: A (with users), B (without)
2. Task assigned to both A and B
3. Generate → Task gets only users from A

**Scenario 4: No Auto-Assignment of Creator (Critical)**
1. Create blueprint with stakeholder "External Contact"
2. Assign task to "External Contact"
3. In mapping modal, don't select any users for "External Contact"
4. Continue generation
5. Inspect Odoo task → Verify `user_ids` is completely empty
6. **Critical verification**: Administrator (API user) should NOT be assigned
7. Task should show "No assignee" in Odoo UI

**Technical Note:**  
This scenario validates that we explicitly set `user_ids = [[6, 0, []]]` in Odoo, preventing Odoo's default behavior of auto-assigning the creator (API user) to tasks.

---

## 7. Migration Notes

**Existing blueprints are compatible:**
- Missing `is_backlog_stage` on stages → defaults to `false`
- Missing `default_user_ids` on stakeholders → defaults to `[]`
- No breaking changes

**Odoo custom field:**
- Must add `x_is_backlog_stage` to `project.task.type` before using Backlog stages
- Existing stages will have `x_is_backlog_stage = False` (no impact)

**Workflow automation:**
- Implement Odoo automated actions to read `x_is_backlog_stage` (optional)
- Project Generator only sets the flag, automation is Odoo-side

---

## 8. Related Documentation

- [ADDENDUM_J.md](./ADDENDUM_J.md) - Stakeholders and user mapping foundation
- [ADDENDUM_O.md](./ADDENDUM_O.md) - Stage semantics (Done/Approved/Cancelled) pattern
- [Project Generator Complete V1](./PROJECT_GENERATOR_COMPLETE_V1.md) - Full system reference

---

## 9. Future Enhancements

**P.4: Role-based Defaults**  
Allow stakeholders to reference Odoo groups/roles instead of specific users for dynamic defaults.

**P.5: User Validation**  
Warn if default users no longer exist in Odoo when opening mapping modal.

**P.6: Backlog Constraints**  
Optionally enforce that Backlog stage cannot have Done/Approved/Cancelled (currently only recommended, not enforced).

**P.7: Stakeholder Templates**  
Global stakeholder library (e.g., "Standard Team Roles") shared across templates.

---

**End of Addendum P**
