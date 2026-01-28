# Iteration 2: UI & Module Design (STEP 1)

**Date**: 2026-01-28  
**Purpose**: Define screens and user flows for Project Generator template library (BEFORE implementation)

---

## 1. USER STORY

**As a** user with Project Generator access  
**I want to** manage my project templates  
**So that** I can store and reuse project blueprints

---

## 2. SCOPE

### What This Iteration Delivers

✅ **Template Library Screen**
- View list of my templates
- Create new template (name + description only)
- Edit existing template (name + description only)
- Delete template (with confirmation)

✅ **Data Persistence**
- All operations write to `project_templates` table
- RLS ensures user only sees their own templates
- `blueprint_data` initialized as `{}` (empty JSON object)

### What This Iteration Does NOT Deliver

❌ Blueprint editor (Iteration 3)  
❌ Blueprint validation (Iteration 3)  
❌ Odoo project generation (Iteration 4)  
❌ Template export/import  
❌ Template sharing  
❌ Search/filter/pagination  
❌ Template categories/tags

---

## 3. SCREEN DESIGN

### Main Screen: Template Library

**URL:** `/projects`

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ [Navbar with user info and navigation]                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Project Generator                                       │
│  Manage your project templates                           │
│                                                          │
│  [+ New Template]                                        │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ My Templates                                      │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ Template Name      Created       Updated  Actions│  │
│  ├──────────────────────────────────────────────────┤  │
│  │ My First Project   Jan 28       Jan 28   [E] [D]│  │
│  │ API Boilerplate    Jan 27       Jan 28   [E] [D]│  │
│  │ Worker Template    Jan 26       Jan 26   [E] [D]│  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  (Empty state if no templates:)                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  No templates yet                                 │  │
│  │  Create your first template to get started        │  │
│  │  [+ Create Template]                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- **Header:** Title + description
- **Action Button:** "New Template" (primary button, top right)
- **Templates Table:**
  - Columns: Name, Description (truncated), Created, Updated, Actions
  - Actions: Edit icon, Delete icon
  - Empty state: Helpful message + create button
- **Template Count Badge:** Shows total templates (optional, nice-to-have)

**Visual Style:**
- Use DaisyUI `card` for table container
- Use DaisyUI `table` component
- Use DaisyUI `btn btn-primary` for New Template
- Use DaisyUI `btn btn-ghost btn-sm` for action icons
- Use Lucide icons: `edit-2` (edit), `trash-2` (delete), `plus` (create)

---

### Modal: Create/Edit Template

**Trigger:**
- Click "New Template" button → Create mode
- Click edit icon on template row → Edit mode

**Layout:**
```
┌─────────────────────────────────────────────┐
│ [X] Create Template                          │
├─────────────────────────────────────────────┤
│                                              │
│  Template Name *                             │
│  [________________________________]           │
│                                              │
│  Description                                 │
│  [________________________________]           │
│  [________________________________]           │
│  [________________________________]           │
│                                              │
│  * Required field                            │
│                                              │
│            [Cancel]  [Create Template]       │
└─────────────────────────────────────────────┘
```

**Fields:**
- **Name:** Text input, required, max 100 characters
- **Description:** Textarea, optional, max 500 characters

**Behavior:**
- **Create Mode:**
  - Modal title: "Create Template"
  - Submit button: "Create Template"
  - On submit: POST `/projects/api/templates`
  - On success: Close modal, refresh table, show success toast
  
- **Edit Mode:**
  - Modal title: "Edit Template"
  - Submit button: "Save Changes"
  - Fields pre-filled with existing data
  - On submit: PUT `/projects/api/templates/:id`
  - On success: Close modal, refresh table, show success toast

**Validation:**
- Name required (client-side)
- Name must not be empty string (server-side)
- Description optional

---

### Confirmation Dialog: Delete Template

**Trigger:** Click delete icon on template row

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Confirm Deletion                             │
├─────────────────────────────────────────────┤
│                                              │
│  Are you sure you want to delete this        │
│  template?                                   │
│                                              │
│  Template: "My First Project"                │
│                                              │
│  This action cannot be undone.               │
│                                              │
│            [Cancel]  [Delete]                │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Use native `confirm()` dialog (simplest)
- Or: Use DaisyUI modal with alert styling (nicer)
- On confirm: DELETE `/projects/api/templates/:id`
- On success: Refresh table, show success toast

---

## 4. USER FLOWS

### Flow 1: View Templates (Happy Path)

1. User navigates to `/projects`
2. System loads user's templates via GET `/projects/api/templates`
3. System renders table with templates
4. User sees their templates

**Edge Cases:**
- **No templates:** Show empty state with create button
- **API error:** Show error toast, display empty state
- **Loading:** Show loading spinner while fetching

---

### Flow 2: Create Template (Happy Path)

1. User clicks "New Template" button
2. System opens create modal with empty form
3. User enters name: "My New Project"
4. User enters description: "A template for new projects"
5. User clicks "Create Template"
6. System validates name is not empty
7. System sends POST `/projects/api/templates` with `{ name, description }`
8. Backend creates template with `blueprint_data: {}`
9. Backend returns created template
10. System closes modal
11. System refreshes template list
12. System shows success toast: "Template created"
13. User sees new template in table

**Edge Cases:**
- **Name empty:** Show validation error "Name is required"
- **API error:** Show error toast, keep modal open
- **Network error:** Show error toast, keep modal open

---

### Flow 3: Edit Template (Happy Path)

1. User clicks edit icon on "My First Project" row
2. System opens edit modal
3. System pre-fills form with existing name and description
4. User changes name to "Updated Project"
5. User clicks "Save Changes"
6. System validates name is not empty
7. System sends PUT `/projects/api/templates/:id` with `{ name, description }`
8. Backend updates template
9. Backend returns updated template
10. System closes modal
11. System refreshes template list
12. System shows success toast: "Template updated"
13. User sees updated template in table

**Edge Cases:**
- **Name empty:** Show validation error "Name is required"
- **Template not found (deleted by another session):** Show error toast
- **API error:** Show error toast, keep modal open

---

### Flow 4: Delete Template (Happy Path)

1. User clicks delete icon on "Old Project" row
2. System shows confirmation dialog: "Are you sure?"
3. User confirms deletion
4. System sends DELETE `/projects/api/templates/:id`
5. Backend deletes template
6. Backend returns success
7. System refreshes template list
8. System shows success toast: "Template deleted"
9. User no longer sees template in table

**Edge Cases:**
- **User cancels:** No API call, modal closes
- **Template not found:** Show error toast, refresh list
- **API error:** Show error toast, don't refresh list

---

## 5. API SPECIFICATION

### GET /projects/api/templates

**Purpose:** List user's templates

**Request:**
- Method: GET
- Auth: Required (session cookie)
- Body: None

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "user_id": "user-uuid",
      "name": "My First Project",
      "description": "A template for my projects",
      "blueprint_data": {},
      "created_at": "2026-01-28T10:00:00Z",
      "updated_at": "2026-01-28T10:00:00Z"
    }
  ]
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message"
}
```

**RLS:** User sees only their templates (enforced by database)

---

### POST /projects/api/templates

**Purpose:** Create new template

**Request:**
- Method: POST
- Auth: Required (session cookie)
- Body:
```json
{
  "name": "My New Template",
  "description": "Optional description"
}
```

**Validation:**
- `name` required, non-empty string
- `description` optional, string

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-2",
    "user_id": "user-uuid",
    "name": "My New Template",
    "description": "Optional description",
    "blueprint_data": {},
    "created_at": "2026-01-28T11:00:00Z",
    "updated_at": "2026-01-28T11:00:00Z"
  }
}
```

**Response (Error - Validation):**
```json
{
  "success": false,
  "error": "Name is required"
}
```

**Backend Behavior:**
- Extract `user.id` from context
- Validate `name` is not empty
- Insert row with `user_id`, `name`, `description`, `blueprint_data: {}`
- Return created template

---

### PUT /projects/api/templates/:id

**Purpose:** Update existing template

**Request:**
- Method: PUT
- Auth: Required (session cookie)
- Params: `id` (template UUID)
- Body:
```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Validation:**
- `name` required, non-empty string
- `description` optional, string

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-1",
    "user_id": "user-uuid",
    "name": "Updated Name",
    "description": "Updated description",
    "blueprint_data": {},
    "created_at": "2026-01-28T10:00:00Z",
    "updated_at": "2026-01-28T11:30:00Z"
  }
}
```

**Response (Error - Not Found):**
```json
{
  "success": false,
  "error": "Template not found"
}
```

**Backend Behavior:**
- Extract `id` from params
- Validate `name` is not empty
- Update row with new `name` and `description`
- RLS ensures user can only update their own templates
- Return updated template

---

### DELETE /projects/api/templates/:id

**Purpose:** Delete template

**Request:**
- Method: DELETE
- Auth: Required (session cookie)
- Params: `id` (template UUID)
- Body: None

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Error - Not Found):**
```json
{
  "success": false,
  "error": "Template not found"
}
```

**Backend Behavior:**
- Extract `id` from params
- Delete row
- RLS ensures user can only delete their own templates
- Return success boolean

---

## 6. DATA MODEL REFERENCE

### Table: project_templates

Already deployed in Iteration 1:

```sql
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS Policies:**
- `SELECT`: User can view own templates
- `INSERT`: User can create templates
- `UPDATE`: User can update own templates
- `DELETE`: User can delete own templates

**Fields Used in Iteration 2:**
- `id`: UUID (auto-generated)
- `user_id`: UUID (set from context.user.id)
- `name`: String (user input, required)
- `description`: String (user input, optional)
- `blueprint_data`: JSONB (hardcoded to `{}` in this iteration)
- `created_at`: Timestamp (auto-set)
- `updated_at`: Timestamp (auto-updated via trigger)

---

## 7. ERROR HANDLING

### Client-Side Validation

**Before API Call:**
- Name field required
- Show inline error if empty
- Disable submit button until valid

### API Error Handling

**Network Errors:**
- Show toast: "Network error. Please try again."
- Keep modal/dialog open
- Allow retry

**Server Errors (500):**
- Show toast: "Server error. Please contact support."
- Log error to console
- Close modal

**Validation Errors (400):**
- Show toast with server error message
- Keep modal open
- Focus on invalid field

**Not Found Errors (404):**
- Show toast: "Template not found. It may have been deleted."
- Refresh list
- Close modal

### Success Feedback

**All Operations:**
- Show success toast
- Auto-dismiss after 3 seconds
- Use DaisyUI alert component

---

## 8. UI COMPONENTS REFERENCE

### DaisyUI Components Used

- `card`: Template list container
- `table`: Template table
- `btn btn-primary`: New Template button
- `btn btn-ghost btn-sm`: Action icons
- `modal`: Create/edit template form
- `form-control`: Form fields
- `input`: Name field
- `textarea`: Description field
- `alert`: Success/error toasts
- `loading loading-spinner`: Loading states

### Lucide Icons Used

- `folder-plus`: Module icon
- `plus`: Create button
- `edit-2`: Edit action
- `trash-2`: Delete action

---

## 9. IMPLEMENTATION FILES

### Files to Modify

1. **`src/modules/project-generator/module.js`**
   - Remove placeholder routes
   - Add real CRUD route handlers
   - Import from `library.js` for data access

2. **`src/modules/project-generator/ui.js`**
   - Remove hardcoded templates
   - Build template table UI
   - Add create/edit modal
   - Add client-side CRUD logic

### Files to Create

3. **`src/modules/project-generator/library.js`**
   - `getTemplates(env, userId)` → Array of templates
   - `createTemplate(env, userId, data)` → Created template
   - `updateTemplate(env, templateId, updates)` → Updated template
   - `deleteTemplate(env, templateId)` → Boolean

---

## STEP 1 COMPLETE

**Design Summary:**
- ✅ Main screen: Template library with table/list
- ✅ Create flow: Modal with name + description
- ✅ Edit flow: Modal pre-filled with existing data
- ✅ Delete flow: Confirmation → API call → refresh
- ✅ API spec: 4 endpoints (GET, POST, PUT, DELETE)
- ✅ Error handling: Client validation + server errors
- ✅ Success feedback: Toasts for all operations

**Next Step:** STEP 2 - Code Implementation
