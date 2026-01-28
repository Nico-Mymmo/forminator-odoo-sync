# Iteration 2: Manual Verification Checklist (STEP 3)

**Date**: 2026-01-28  
**Purpose**: Verification steps for Project Generator template library implementation

---

## VERIFICATION OVERVIEW

This checklist validates that Iteration 2 is complete and functional.  
**DO NOT PROCEED** to Iteration 3 until all items are verified.

---

## 1. MODULE ACCESSIBILITY

### Test: Navigation

**Steps:**
1. Deploy code to Cloudflare Worker (`wrangler deploy` or `npm run deploy`)
2. Open application in browser
3. Log in as admin user
4. Check navigation bar

**Expected:**
- ✅ "Project Generator" appears in navigation menu
- ✅ Icon is `folder-plus` (Lucide icon)
- ✅ Clicking navigates to `/projects`

**Actual:**
- [ ] Navigation item visible: YES / NO
- [ ] Correct icon displayed: YES / NO
- [ ] Route works: YES / NO

---

## 2. ROUTE RENDERING

### Test: Main UI Loads

**Steps:**
1. Navigate to `/projects`
2. Wait for page load

**Expected:**
- ✅ Navbar renders with user info
- ✅ Page title: "Project Generator"
- ✅ Subtitle: "Manage your project templates"
- ✅ "New Template" button visible
- ✅ Loading spinner appears briefly
- ✅ Either template table OR empty state appears

**Actual:**
- [ ] Navbar renders: YES / NO
- [ ] Page loads without errors: YES / NO
- [ ] UI matches design: YES / NO
- [ ] Console errors: YES / NO (should be NO)

---

## 3. CRUD OPERATIONS

### Test 3.1: Create Template (Happy Path)

**Steps:**
1. Navigate to `/projects`
2. Click "New Template" button
3. Modal opens
4. Enter name: "Test Template 1"
5. Enter description: "This is a test template"
6. Click "Create Template"

**Expected:**
- ✅ Modal opens with "Create Template" title
- ✅ Form fields are empty
- ✅ Submit button enabled
- ✅ On submit: Loading spinner shows
- ✅ Modal closes on success
- ✅ Success toast: "Template created"
- ✅ Template appears in table
- ✅ Template shows correct name and description

**Actual:**
- [ ] Modal works: YES / NO
- [ ] Template created: YES / NO
- [ ] Template appears in list: YES / NO
- [ ] Database record created (check Supabase): YES / NO

**Database Check:**
```sql
SELECT * FROM project_templates WHERE name = 'Test Template 1';
```
- [ ] Row exists: YES / NO
- [ ] `blueprint_data` is `{}`: YES / NO
- [ ] `user_id` matches logged-in user: YES / NO

---

### Test 3.2: Create Template (Validation)

**Steps:**
1. Click "New Template"
2. Leave name empty
3. Click "Create Template"

**Expected:**
- ✅ Error message: "Name is required"
- ✅ Modal stays open
- ✅ No API call made
- ✅ No template created

**Actual:**
- [ ] Validation works: YES / NO
- [ ] Error message shown: YES / NO
- [ ] Modal stays open: YES / NO

---

### Test 3.3: Edit Template

**Steps:**
1. Click edit icon on "Test Template 1"
2. Modal opens with pre-filled data
3. Change name to "Updated Template"
4. Change description to "Updated description"
5. Click "Save Changes"

**Expected:**
- ✅ Modal opens with "Edit Template" title
- ✅ Name field shows: "Test Template 1"
- ✅ Description field shows: "This is a test template"
- ✅ Submit button text: "Save Changes"
- ✅ On submit: Modal closes, success toast
- ✅ Template updates in table
- ✅ Updated timestamp changes

**Actual:**
- [ ] Edit modal works: YES / NO
- [ ] Data pre-filled: YES / NO
- [ ] Update successful: YES / NO
- [ ] Table refreshes: YES / NO

**Database Check:**
```sql
SELECT name, description, updated_at FROM project_templates 
WHERE name = 'Updated Template';
```
- [ ] Name updated: YES / NO
- [ ] Description updated: YES / NO
- [ ] `updated_at` changed: YES / NO

---

### Test 3.4: Delete Template

**Steps:**
1. Click delete icon on "Updated Template"
2. Confirmation dialog appears
3. Confirm deletion

**Expected:**
- ✅ Confirmation dialog: "Are you sure?"
- ✅ Dialog shows template name
- ✅ On confirm: Template disappears from table
- ✅ Success toast: "Template deleted"

**Actual:**
- [ ] Confirmation works: YES / NO
- [ ] Template deleted: YES / NO
- [ ] Table refreshes: YES / NO

**Database Check:**
```sql
SELECT * FROM project_templates WHERE name = 'Updated Template';
```
- [ ] Row deleted: YES / NO (should return no rows)

---

### Test 3.5: Multiple Templates

**Steps:**
1. Create 3 templates:
   - "Template A" / "Description A"
   - "Template B" / "Description B"
   - "Template C" / "Description C"

**Expected:**
- ✅ All 3 templates appear in table
- ✅ Templates ordered by `created_at DESC` (newest first)
- ✅ Empty state hidden
- ✅ Table visible

**Actual:**
- [ ] Multiple templates work: YES / NO
- [ ] Ordering correct: YES / NO
- [ ] All data displays correctly: YES / NO

---

## 4. RLS ENFORCEMENT

### Test: User Isolation

**Prerequisite:** Create a second user account

**Steps:**
1. Log in as User A
2. Create template "User A Template"
3. Log out
4. Log in as User B
5. Navigate to `/projects`

**Expected:**
- ✅ User B sees empty state (or only their templates)
- ✅ User B does NOT see "User A Template"
- ✅ User B cannot edit/delete User A's template

**Actual:**
- [ ] RLS enforced: YES / NO
- [ ] User isolation works: YES / NO

**Database Check (as admin):**
```sql
SELECT id, user_id, name FROM project_templates;
```
- [ ] Templates have different `user_id`: YES / NO
- [ ] Each user's templates scoped correctly: YES / NO

---

## 5. ERROR HANDLING

### Test 5.1: Network Error Simulation

**Steps:**
1. Open browser DevTools (Network tab)
2. Enable "Offline" mode
3. Try to create a template

**Expected:**
- ✅ Error toast: "Network error. Please try again."
- ✅ Modal stays open
- ✅ Form data preserved

**Actual:**
- [ ] Error handled gracefully: YES / NO
- [ ] User informed of error: YES / NO

---

### Test 5.2: Server Error Simulation

**Steps:**
1. Temporarily break database connection (optional)
2. Or: Create template with very long name (> 100 chars)

**Expected:**
- ✅ Error toast with message
- ✅ No silent failures
- ✅ Console logs error

**Actual:**
- [ ] Server errors handled: YES / NO
- [ ] User informed: YES / NO

---

## 6. BROWSER CONSOLE

### Test: No JavaScript Errors

**Steps:**
1. Open browser DevTools (Console tab)
2. Perform all CRUD operations
3. Check for errors

**Expected:**
- ✅ No red error messages
- ✅ Only informational logs (if any)
- ✅ No warnings about missing resources

**Actual:**
- [ ] Console clean: YES / NO
- [ ] Errors found: (list any)

---

## 7. RESPONSIVE DESIGN

### Test: Mobile View

**Steps:**
1. Open DevTools
2. Toggle device toolbar (mobile view)
3. Navigate UI

**Expected:**
- ✅ Table scrolls horizontally if needed
- ✅ Buttons remain accessible
- ✅ Modal fits on screen
- ✅ No layout breaks

**Actual:**
- [ ] Mobile responsive: YES / NO

---

## 8. DATABASE SCHEMA COMPLIANCE

### Test: Blueprint Data Initialized

**Steps:**
1. Create a template
2. Check database

**Query:**
```sql
SELECT id, name, blueprint_data FROM project_templates 
WHERE name = 'Test Template 1';
```

**Expected:**
```json
{
  "blueprint_data": {}
}
```

**Actual:**
- [ ] `blueprint_data` is `{}`: YES / NO
- [ ] `blueprint_data` is valid JSON: YES / NO

---

## ITERATION 2 ACCEPTANCE CRITERIA

All items must be checked YES:

- [ ] Module accessible via navigation
- [ ] Route `/projects` renders without errors
- [ ] Templates can be created (name + description)
- [ ] Templates can be edited
- [ ] Templates can be deleted
- [ ] RLS enforces user ownership
- [ ] Empty state shows when no templates
- [ ] Table shows when templates exist
- [ ] All operations show success/error feedback
- [ ] No console errors
- [ ] Database records have `blueprint_data: {}`

---

## KNOWN LIMITATIONS (BY DESIGN)

These are NOT bugs - they are deferred to Iteration 3:

- ❌ No blueprint editor
- ❌ No blueprint validation
- ❌ No Odoo generation
- ❌ No search/filter/pagination
- ❌ No template export/import
- ❌ `blueprint_data` is always `{}`

---

## BLOCKERS

If any verification fails, document here:

**Issue:**
**Impact:**
**Workaround:**

---

## SIGN-OFF

**Tested By:**  
**Date:**  
**Result:** PASS / FAIL  
**Notes:**

**Approval to Proceed to Iteration 3:** YES / NO
