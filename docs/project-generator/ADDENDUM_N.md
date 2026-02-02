# ADDENDUM N: TEMPLATE VISIBILITY & PERMISSIONS

**Status**: Design & Implementation Specification  
**Date**: January 30, 2026  
**Module**: Project Generator  
**Dependencies**: Core Template System

---

## PROBLEM STATEMENT

The Project Generator needs a clear, secure, and predictable system for controlling:

1. **Who can view** a template
2. **Who can generate projects** from a template
3. **Who can edit** a template

Without explicit visibility controls, templates are implicitly private, limiting collaboration and sharing of best-practice templates. However, any permission system must be:

- **Explicit** – no implicit permissions or role inference
- **Predictable** – users know exactly what they can do
- **Secure** – safe by default, fail-hard on violations
- **Simple** – no complex ACL systems

This addendum establishes a minimal, three-mode visibility system with explicit editor assignment.

---

## VISIBILITY MODES

Every template has exactly **one** of three mutually exclusive visibility modes.

### Mode Definitions (Normative)

#### PRIVATE

- **Default mode** for all newly created templates
- Only the **owner** can:
  - View the template
  - Edit the template
  - Generate projects from the template
- Template is **invisible** to all other users
- **Use case**: Work-in-progress templates, personal templates

#### PUBLIC_GENERATE

- **Anyone** can:
  - View the template
  - Generate projects from the template
- Only the **owner** can:
  - Edit the template
- **Use case**: "Best practice" or "reference" templates that should be reusable but protected from changes

#### PUBLIC_EDIT

- **Anyone** can:
  - View the template
  - Generate projects from the template
- Only the **owner + explicitly assigned editors** can:
  - Edit the template
- **Use case**: Collaborative templates maintained by a team

### Explicitly Forbidden

The following behaviors are **explicitly prohibited**:

- ❌ Implicit public editing based on organization membership
- ❌ Role-based permission inference (e.g., "managers can edit")
- ❌ Organization-wide edit access without explicit assignment
- ❌ Automatic visibility changes based on usage patterns
- ❌ Inherited permissions from Odoo roles

---

## OWNERSHIP MODEL

### Rules

1. **Every template has exactly one owner**
2. Owner is the **creating user** (set at template creation)
3. Ownership **cannot be transferred** (out of scope for Addendum N)
4. Owner **always has full rights** regardless of visibility mode
5. Owner can **delete the template** in all modes

### Owner Privileges (Non-Revocable)

In all visibility modes, the owner can:

- ✅ View the template
- ✅ Edit the template
- ✅ Generate projects from the template
- ✅ Change visibility mode
- ✅ Manage editors (in PUBLIC_EDIT mode)
- ✅ Delete the template

---

## EDITOR ACCESS MODEL

Editor access is only relevant when `visibility === PUBLIC_EDIT`.

### Rules

1. **Editing rights are explicitly assigned per user**
2. Editors are stored as a **list of user IDs**
3. Editor list is **ignored** unless visibility mode is PUBLIC_EDIT

### Editor Privileges

Editors (in PUBLIC_EDIT mode) can:

- ✅ Modify template content
- ✅ Save changes
- ✅ View the template
- ✅ Generate projects from the template

### Editor Restrictions

Editors **cannot**:

- ❌ Delete the template
- ❌ Change visibility mode
- ❌ Add or remove other editors
- ❌ Transfer ownership

### Owner's Role in Editor Management

Only the owner can:

- ✅ Add editors to the template
- ✅ Remove editors from the template
- ✅ Change visibility mode (which affects editor privileges)

---

## DATA MODEL

### Schema Extension

Extend the existing template schema with exactly three fields:

```json
{
  "template_id": "uuid",
  "name": "My Template",
  "content": { ... },
  
  // NEW FIELDS (Addendum N)
  "visibility": "private",
  "owner_user_id": "uuid",
  "editor_user_ids": ["uuid", "uuid"]
}
```

### Field Specifications

#### `visibility`

- **Type**: `enum string`
- **Values**: `"private"` | `"public_generate"` | `"public_edit"`
- **Required**: Yes
- **Default**: `"private"`
- **Mutable**: Yes (by owner only)

#### `owner_user_id`

- **Type**: `uuid` (references Odoo `res.users.id`)
- **Required**: Yes
- **Default**: Current user ID at creation time
- **Mutable**: No (ownership transfer not supported)

#### `editor_user_ids`

- **Type**: `array of uuid` (references Odoo `res.users.id`)
- **Required**: No
- **Default**: `[]`
- **Mutable**: Yes (by owner only)
- **Behavior**: Ignored unless `visibility === "public_edit"`

### Data Integrity Rules

1. **No orphaned templates**: Every template must have a valid `owner_user_id`
2. **No self-loops**: Owner cannot be in `editor_user_ids` (redundant)
3. **No invalid users**: All UUIDs in `editor_user_ids` must reference existing users
4. **No derived permissions**: All permissions are computed from these three fields only

---

## UI / UX DESIGN (DAISYUI)

### Template Settings Panel

Add a new **Visibility** section to the Template Settings panel.

#### Visibility Selector

Use DaisyUI radio buttons with clear labels and explanatory subtext.

**Example Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Template Visibility                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ (•) Private                                                 │
│     Only you can edit and generate from this template       │
│                                                             │
│ ( ) Public – Generate only                                  │
│     Others can use this template to generate projects       │
│                                                             │
│ ( ) Public – Editable                                       │
│     Others can generate and selected users can edit         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**HTML Structure (DaisyUI):**

```html
<div class="form-control">
  <label class="label cursor-pointer">
    <span class="label-text">
      <div class="font-semibold">Private</div>
      <div class="text-sm opacity-70">Only you can edit and generate from this template</div>
    </span>
    <input type="radio" name="visibility" value="private" class="radio" checked />
  </label>
</div>

<div class="form-control">
  <label class="label cursor-pointer">
    <span class="label-text">
      <div class="font-semibold">Public – Generate only</div>
      <div class="text-sm opacity-70">Others can use this template to generate projects</div>
    </span>
    <input type="radio" name="visibility" value="public_generate" class="radio" />
  </label>
</div>

<div class="form-control">
  <label class="label cursor-pointer">
    <span class="label-text">
      <div class="font-semibold">Public – Editable</div>
      <div class="text-sm opacity-70">Others can generate and selected users can edit</div>
    </span>
    <input type="radio" name="visibility" value="public_edit" class="radio" />
  </label>
</div>
```

### Editor Selector (Conditional)

**Visibility Condition:**

Only shown when `visibility === "public_edit"`

**Requirements:**

1. Multi-select user picker
2. List of users fetched from Odoo (`res.users`)
3. Display: name + avatar
4. Owner badge (non-removable)
5. Empty list = owner-only editing

**Example Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Template Editors                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Search users...]                                     [Add] │
│                                                             │
│ • John Doe (Owner) ──────────────────────────────── [────] │
│ • Jane Smith ───────────────────────────────────────── [×] │
│ • Bob Johnson ──────────────────────────────────────── [×] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**

- Owner is always listed first with "(Owner)" badge
- Owner cannot be removed
- Click [×] to remove an editor
- Search/select from Odoo users to add editors

### Visual Affordances in Template List

Templates list must clearly indicate visibility state.

**Icons & Tooltips:**

| Icon | Mode | Tooltip |
|------|------|---------|
| 🔒 | Private | Only visible to you |
| 📦 | Public (Generate) | Anyone can use this template |
| ✏️ | Public (Editable) | Collaborative template |

**Example Row:**

```
┌───────────────────────────────────────────────────────────┐
│ 🔒 My Private Template                     [Edit] [Delete]│
│ 📦 Company Onboarding Template            [Use] [Edit]    │
│ ✏️ Team Project Template (3 editors)      [Use] [Edit]    │
└───────────────────────────────────────────────────────────┘
```

---

## PERMISSION ENFORCEMENT

**Non-Negotiable Rule:**

All permission checks are enforced **server-side** in the Project Generator application layer.

### Permission Matrix (Normative)

| Action     | Private       | Public Generate | Public Edit           |
|------------|---------------|------------------|-----------------------|
| **View**   | Owner only    | Everyone         | Everyone              |
| **Generate** | Owner only  | Everyone         | Everyone              |
| **Edit**   | Owner only    | Owner only       | Owner + Editors       |
| **Delete** | Owner only    | Owner only       | Owner only            |
| **Manage Editors** | N/A | N/A              | Owner only            |
| **Change Visibility** | Owner only | Owner only | Owner only          |

### List Visibility Enforcement

**CRITICAL PRIVACY INVARIANT:**

> A user must never be able to infer the existence of a PRIVATE template they do not own.

This applies to:

- Template list endpoints
- Search endpoints
- Any aggregated views or counts

**Implementation:**

Templates must be filtered server-side using `canSeeTemplateInList(template, userId)` before being returned in any list or search result.

**Behavioral Requirements:**

1. **Private template accessed by non-owner:**
   - List/search endpoints: Template MUST NOT appear in results (filtered out silently)
   - Direct fetch by ID: MUST return 404 Not Found (not 403 Forbidden, to avoid leaking existence)

2. **Public template accessed by non-owner without edit permission:**
   - List/search endpoints: Template MUST appear in results
   - Edit attempt: MUST return 403 Forbidden (existence is already known)

**Helper Function (Conceptual):**

```javascript
function canSeeTemplateInList(template, userId) {
  if (template.visibility === 'private') {
    return template.owner_user_id === userId;
  }
  return true; // public_generate or public_edit
}
```

**Note:** This is a conceptual helper for clarity. It may reuse `canRead` internally, but the intent must remain explicit in code to prevent future permission leaks.

### Read Access

**Rules:**

- `PRIVATE` → Only owner can view
- `PUBLIC_GENERATE` → All users can view
- `PUBLIC_EDIT` → All users can view

**Enforcement:**

```javascript
function canRead(template, userId) {
  if (template.visibility === 'private') {
    return template.owner_user_id === userId;
  }
  return true; // public_generate or public_edit
}
```

### Generate Access

**Rules:**

- `PRIVATE` → Only owner can generate
- `PUBLIC_GENERATE` → All users can generate
- `PUBLIC_EDIT` → All users can generate

**Enforcement:**

```javascript
function canGenerate(template, userId) {
  if (template.visibility === 'private') {
    return template.owner_user_id === userId;
  }
  return true; // public_generate or public_edit
}
```

### Edit Access

**Rules:**

- `PRIVATE` → Owner only
- `PUBLIC_GENERATE` → Owner only
- `PUBLIC_EDIT` → Owner + Editors

**Enforcement:**

```javascript
function canEdit(template, userId) {
  // Owner always has edit rights
  if (template.owner_user_id === userId) {
    return true;
  }
  
  // Public edit mode: check editor list
  if (template.visibility === 'public_edit') {
    return template.editor_user_ids.includes(userId);
  }
  
  // Private or public_generate: no one else can edit
  return false;
}
```

### Delete Access

**Rules:**

- Only owner can delete in **all modes**

**Enforcement:**

```javascript
function canDelete(template, userId) {
  return template.owner_user_id === userId;
}
```

### Failure Behavior (Mandatory)

Any permission violation must:

1. **Fail hard** – reject the request immediately
2. **Return HTTP 403 Forbidden** with clear error message
3. **Be logged** with user ID, template ID, attempted action

**Example Error Response:**

```json
{
  "error": "Forbidden",
  "message": "You do not have permission to edit this template",
  "details": {
    "template_id": "uuid",
    "required_permission": "edit",
    "visibility": "public_generate"
  }
}
```

---

## SAFETY & PERFORMANCE

### Safe Defaults

**All existing templates** must be migrated to:

```json
{
  "visibility": "private",
  "owner_user_id": "<creator_user_id>",
  "editor_user_ids": []
}
```

**Migration Rules:**

1. No automatic promotion to public modes
2. Creator/owner is determined by existing metadata (e.g., `created_by`)
3. If creator cannot be determined, template is marked as orphaned and flagged for manual review
4. Migration is **one-way** and **permanent**

### No Odoo-Side ACL Dependency

**Explicit Statement:**

Template permissions are enforced **entirely within the Project Generator application layer**.

**Odoo is never trusted to enforce:**

- ❌ Template visibility
- ❌ Edit rights
- ❌ Generation rights
- ❌ User-level permissions

**Rationale:**

1. Odoo's permission model is designed for business objects (CRM, Sales, etc.)
2. Template permissions are application-specific and must be controlled independently
3. Relying on Odoo ACLs would create implicit permissions and unpredictable behavior

**Data Security:**

- Templates are stored in Cloudflare KV (not Odoo)
- Permission checks happen in Cloudflare Worker (not Odoo)
- Odoo is only queried for user metadata (name, avatar) for UI display

---

## EXPLICIT NON-GOALS

This addendum **does not** include the following features:

### 1. Role-Based Access Control (RBAC)

❌ No automatic permissions based on Odoo roles (e.g., "Sales Manager", "Admin")

**Why:** Role inference is implicit and unpredictable. Explicit editor assignment is clearer.

### 2. Organization-Level Permissions

❌ No "all users in my organization can edit" option

**Why:** Organization boundaries are not well-defined in Odoo multi-tenant scenarios.

### 3. Template Forking

❌ No "create my own copy of this template" feature

**Why:** Out of scope. Users can manually copy/paste content if needed.

### 4. Template Versioning

❌ No version history or rollback capability

**Why:** Adds significant complexity. Future addendum if needed.

### 5. Approval Workflows

❌ No "request edit access" or "approve changes" flow

**Why:** Over-engineered for current use case. Owner can manually add editors.

### 6. Ownership Transfer

❌ No "transfer ownership to another user" feature

**Why:** Adds migration complexity. Can be added in a future addendum if needed.

### 7. Public Discovery/Marketplace

❌ No "browse all public templates" feature

**Why:** Discoverability is out of scope. Users must share template IDs manually.

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Data Model

- [ ] Add `visibility`, `owner_user_id`, `editor_user_ids` fields to template schema
- [ ] Create database migration script
- [ ] Migrate existing templates to `private` mode with correct ownership
- [ ] Add validation for visibility enum values
- [ ] Add foreign key constraints for user IDs

### Phase 2: Server-Side Enforcement

- [ ] Implement `canRead(template, userId)` function
- [ ] Implement `canGenerate(template, userId)` function
- [ ] Implement `canEdit(template, userId)` function
- [ ] Implement `canDelete(template, userId)` function
- [ ] Implement `canManageEditors(template, userId)` function
- [ ] Add permission checks to all template API endpoints
- [ ] Add 403 error handling with logging

### Phase 3: UI Components

- [ ] Add visibility radio selector to Template Settings panel
- [ ] Add conditional editor selector (PUBLIC_EDIT mode only)
- [ ] Implement user search/picker (fetch from Odoo `res.users`)
- [ ] Add visibility icons to template list (🔒 📦 ✏️)
- [ ] Add tooltips for visibility modes
- [ ] Add owner badge in editor list

### Phase 4: Testing

- [ ] Unit tests for permission functions
- [ ] Integration tests for template CRUD with different visibility modes
- [ ] UI tests for visibility selector behavior
- [ ] UI tests for editor management (add/remove)
- [ ] Security tests for permission boundary violations

### Phase 5: Documentation

- [ ] Update user documentation with visibility mode explanations
- [ ] Add examples of common visibility scenarios
- [ ] Document migration process for existing templates

---

## SECURITY CONSIDERATIONS

### Trust Boundary

**CRITICAL:**

> Template visibility is a trust boundary.  
> Any ambiguity here is a security bug.

**PRIVACY INVARIANT:**

> A user must never be able to infer the existence of a PRIVATE template they do not own.

This invariant applies to:

- Template list/search endpoints (templates must be filtered)
- Direct access by ID (must return 404, not 403, for private templates the user doesn't own)
- Aggregate counts or statistics
- Error messages (must not reveal template existence)

### Behavioral Requirements by Scenario

#### Scenario 1: Fetching a private template you do not own

**Required behavior:** MUST behave as "not found" (404)

**Rationale:** Returning 403 Forbidden would confirm the template exists, violating the privacy invariant.

**Implementation:**
- Direct GET requests for private templates by non-owners return 404
- Template is filtered out of list/search results

#### Scenario 2: Editing/generating from a template you can see but cannot modify

**Required behavior:** MUST return 403 Forbidden

**Rationale:** User already knows the template exists (it's public), so 403 is appropriate.

**Implementation:**
- Public templates return 403 when user attempts unauthorized action (edit/delete)
- Error message clearly states permission denied

### Attack Vectors to Prevent

1. **Privilege Escalation**
   - ❌ Non-owner changing visibility mode
   - ❌ Non-owner adding themselves as editor
   - ❌ Editor deleting template or changing ownership

2. **Data Leakage**
   - ❌ Private templates visible in public template lists
   - ❌ Template content returned in API responses for unauthorized users

3. **Injection Attacks**
   - ❌ User IDs not validated before adding to `editor_user_ids`
   - ❌ Visibility mode accepts invalid enum values

### Security Testing Requirements

1. Attempt to edit a template as a non-authorized user → Must return 403
2. Attempt to view a private template as a non-owner → Must return 403
3. Attempt to add invalid user IDs to editor list → Must fail validation
4. Attempt to set invalid visibility mode → Must fail validation

---

## MIGRATION STRATEGY

### Existing Templates

**Step 1: Add New Fields (with defaults)**

```sql
ALTER TABLE templates 
ADD COLUMN visibility TEXT DEFAULT 'private',
ADD COLUMN owner_user_id UUID,
ADD COLUMN editor_user_ids UUID[];
```

**Step 2: Populate Ownership**

```sql
-- Assuming templates have a created_by field
UPDATE templates 
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;
```

**Step 3: Set Empty Editor Lists**

```sql
UPDATE templates 
SET editor_user_ids = ARRAY[]::UUID[]
WHERE editor_user_ids IS NULL;
```

**Step 4: Validate Migration**

```sql
-- Ensure no NULL owners
SELECT COUNT(*) FROM templates WHERE owner_user_id IS NULL;
-- Should return 0

-- Ensure all visibility modes are valid
SELECT COUNT(*) FROM templates 
WHERE visibility NOT IN ('private', 'public_generate', 'public_edit');
-- Should return 0
```

### Rollback Plan

If migration fails:

1. Drop new columns
2. Restore from backup
3. Investigate failures in `owner_user_id` assignment

---

## FUTURE ENHANCEMENTS (Post-Addendum N)

These features are explicitly deferred to future addenda:

1. **Addendum N+1: Template Forking**
   - Allow users to create personal copies of public templates
   - Preserve attribution to original template

2. **Addendum N+2: Ownership Transfer**
   - Allow owner to transfer ownership to another user
   - Handle editor list updates on transfer

3. **Addendum N+3: Public Template Discovery**
   - Browse/search public templates
   - Filter by category, tags, popularity

4. **Addendum N+4: Approval Workflows**
   - Request edit access from owner
   - Owner approves/denies requests

---

## CONCLUSION

Addendum N establishes a **minimal, explicit, and secure** permission system for Project Generator templates.

**Key Principles:**

1. ✅ **Safe by default** – new templates are private
2. ✅ **Explicit permissions** – no role inference or implicit access
3. ✅ **Owner-centric** – owner always has full control
4. ✅ **Three clear modes** – private, public-generate, public-edit
5. ✅ **Fail-hard enforcement** – violations return 403 and are logged

This system prioritizes **security and predictability** over flexibility. Additional features can be added in future addenda without breaking the core permission model.

---

**End of Addendum N**
