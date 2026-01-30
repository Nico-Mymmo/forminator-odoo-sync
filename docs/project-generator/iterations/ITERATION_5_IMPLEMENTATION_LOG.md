# Iteration 5 Implementation Log

## Project Generator - Generation History & Post-Generation UX

**Date:** 2026-01-28  
**Status:** In Progress  
**Scope:** Server-side generation lifecycle tracking and observability

---

## Overview

Iteration 5 adds generation lifecycle management to make project generation traceable, observable, and recoverable. This is a server-only implementation with no UI changes in this step.

**Key Principle:** Transparency without complexity.

---

## STEP 2: Server-Side Lifecycle Enforcement (COMPLETE)

### Implementation Summary

Added server-side tracking of generation attempts using the `project_generations` table (created in STEP 1).

### Changes Made

#### 1. New Module: `generation-lifecycle.js`

Created dedicated lifecycle management module with clean separation of concerns:

**Functions:**
- `getLatestGeneration(env, userId, templateId)` - Query most recent generation attempt
- `validateGenerationStart(env, userId, templateId, confirmOverwrite)` - Pre-generation validation
- `startGeneration(env, userId, templateId, generationModel)` - Create in_progress record
- `markGenerationSuccess(env, generationId, result)` - Update to completed status
- `markGenerationFailure(env, generationId, failedStep, errorMessage)` - Update to failed status

**Responsibilities:**
- ✅ Lifecycle state transitions
- ✅ Database persistence
- ✅ NO Odoo knowledge
- ✅ NO business logic

#### 2. Updated `module.js` Route Handler

Modified `POST /api/generate/:id` to wrap generation with lifecycle tracking:

**Flow:**
1. Get template metadata
2. Parse `confirmOverwrite` flag from request body (optional)
3. **Validate generation can proceed** (`validateGenerationStart`)
4. Build generation model from blueprint
5. **Create in_progress record** (`startGeneration`)
6. Execute Odoo generation (`generateProject`)
7. **Mark success** or **mark failure** based on result

**Error Handling:**
- Pre-generation validation returns 409 Conflict if blocked
- Unexpected errors caught and logged to failed record
- Original generation errors preserved in failed_step and error_message

#### 3. Updated `generate.js`

Added `generation_model` field to result object for audit trail:
- Stores canonical model in result
- Used by lifecycle tracking for persistence

---

## Lifecycle Enforcement Rules

### State Transitions

```
[START] → in_progress → completed
                     → failed
```

### Double-Generation Prevention

**Rule 1: HARD BLOCK if in_progress**
- Status: `409 Conflict`
- Message: "Generation already in progress for this template"
- Rationale: Prevent concurrent Odoo API calls

**Rule 2: SOFT BLOCK if completed**
- Status: `409 Conflict` (without confirmOverwrite)
- Message: "Template already generated. Set confirmOverwrite=true to generate again."
- Rationale: Prevent accidental duplicate projects

**Rule 3: ALLOW RETRY if failed**
- Status: `200 OK` (new generation record created)
- Rationale: Enable recovery from failures

**Rule 4: ALLOW with confirmation**
- Status: `200 OK` (if confirmOverwrite=true and status=completed)
- Rationale: Intentional re-generation

---

## Data Persistence

### Generation Record Structure

**On Start (status=in_progress):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "template_id": "uuid",
  "status": "in_progress",
  "generation_model": { /* full canonical model */ },
  "started_at": "2026-01-28T15:00:00Z",
  "created_at": "2026-01-28T15:00:00Z"
}
```

**On Success (status=completed):**
```json
{
  "status": "completed",
  "odoo_project_id": 123,
  "odoo_project_url": "https://mymmo.odoo.com/web#id=123...",
  "odoo_mappings": {
    "stages": { "blueprint-uuid": 456 },
    "tasks": { "blueprint-uuid": 789 }
  },
  "completed_at": "2026-01-28T15:02:30Z"
}
```

**On Failure (status=failed):**
```json
{
  "status": "failed",
  "failed_step": "4-create-stages",
  "error_message": "Odoo API error: Invalid stage name",
  "completed_at": "2026-01-28T15:01:15Z"
}
```

---

## Separation of Concerns

### Layer Responsibilities

**`generation-lifecycle.js`** (Data Access Layer)
- Database operations only
- No Odoo knowledge
- No HTTP responses
- Pure state management

**`generate.js`** (Generation Orchestrator)
- Odoo API calls
- Blueprint transformation
- No database writes (returns result object)
- No lifecycle knowledge

**`module.js`** (Route Handler)
- HTTP request/response
- Orchestrates lifecycle + generation
- Error translation (500, 409, 404)
- User-facing messages

---

## Error Handling Strategy

### Failure Paths

**1. Validation Failure (Pre-Generation)**
- No generation record created
- HTTP 409 Conflict
- User sees clear blocking reason

**2. Generation Failure (During Odoo Calls)**
- Generation record marked failed
- HTTP 500 Internal Server Error
- `failed_step` and `error_message` persisted

**3. Unexpected Exception**
- Caught in try/catch
- Generation record marked failed (if created)
- Generic error returned to user

### Retry Logic

**User-Initiated Retry:**
- Failed generations can be retried
- New generation record created
- No automatic retry (manual action required)

**No Rollback:**
- Partial Odoo projects remain
- User must manually delete in Odoo
- Generation record shows what was created (odoo_mappings)

---

## API Changes

### Request Format

**POST /api/generate/:id**

**Optional Body:**
```json
{
  "confirmOverwrite": true
}
```

**Default:** `confirmOverwrite = false`

### Response Formats

**Success (200 OK):**
```json
{
  "success": true,
  "generationId": "uuid",
  "odoo_project_id": 123,
  "odoo_project_url": "https://..."
}
```

**Blocked (409 Conflict):**
```json
{
  "success": false,
  "error": "Generation already in progress for this template",
  "existingGeneration": { /* full record */ }
}
```

**Failed (500 Internal Server Error):**
```json
{
  "success": false,
  "generationId": "uuid",
  "step": "4-create-stages",
  "error": "Odoo API error message"
}
```

---

## Testing Checklist

### Server-Side Verification

- [ ] First generation creates in_progress record
- [ ] Successful generation updates to completed
- [ ] Failed generation updates to failed with error details
- [ ] Concurrent generation attempt returns 409
- [ ] Retry after failure creates new record
- [ ] Re-generation without confirmation returns 409
- [ ] Re-generation with confirmOverwrite=true proceeds
- [ ] odoo_mappings populated on success
- [ ] generation_model snapshot stored correctly

### Error Scenarios

- [ ] Network failure during generation marks failed
- [ ] Odoo API error stores failed_step correctly
- [ ] Blueprint validation error before in_progress record
- [ ] Database error logged and returned as 500

---

## Files Changed

### New Files
- `src/modules/project-generator/generation-lifecycle.js` (191 lines)

### Modified Files
- `src/modules/project-generator/module.js` - Added lifecycle wrapper to generate route
- `src/modules/project-generator/generate.js` - Added generation_model to result

### Database
- Migration: `supabase/migrations/20260128150000_project_generations_v1.sql` (created in STEP 1)
- Status: Not yet applied (pending approval)

---

## Non-Goals (Explicitly Out of Scope)

❌ UI for generation history (STEP 4)  
❌ Automatic retry mechanism  
❌ Background job processing  
❌ Rollback or cleanup automation  
❌ Progress streaming  
❌ Webhook notifications  
❌ Blueprint changes  
❌ Generation model versioning  

---

## Next Steps

**STEP 3:** Extend data access layer (library.js)
- Add `getGenerationsForTemplate(env, templateId)`
- Add helper functions for UI consumption

**STEP 4:** Create generation history UI
- Read-only table view
- Link to Odoo projects
- Status badges

**STEP 5:** Post-generation UX feedback
- Success/failure screens
- Manual cleanup instructions
- Retry warnings

---

## Design Rationale

### Why Create Record BEFORE Generation?

**Prevents race conditions:**
- Second request sees in_progress status
- Blocks concurrent generation immediately

**Audit trail completeness:**
- Failed generations are visible
- Shows what was attempted even if crashed

### Why No Automatic Rollback?

**Odoo API limitations:**
- No transactional support
- Delete cascades unpredictable
- Risk of orphaned data

**Transparency over magic:**
- User sees exactly what exists
- Manual cleanup gives control
- Safer than automated cleanup

### Why Fail-Soft on Lifecycle Errors?

**Generation takes priority:**
- If Odoo succeeds but lifecycle update fails, log error but return success
- If lifecycle fails on failure marking, log but preserve original error

**Rationale:**
- Original error more important than tracking error
- Generation result should reach user even if tracking broken

---

## Known Limitations

1. **No progress updates:** User sees loading spinner until complete
2. **No resume capability:** Failed generation starts from scratch
3. **No partial cleanup:** User must delete entire project manually
4. **No dry-run mode:** Must test with real Odoo projects

These are intentional scope limitations for Iteration 5.

---

**Status:** STEP 2 COMPLETE  
**Next:** Await approval before proceeding to STEP 3

---

## STEP 3: Generation History Data Access (COMPLETE)

### Implementation Summary

Extended `library.js` with read-only data access functions for generation history.

### Changes Made

#### Added Functions to `library.js`

**1. `getGenerationsForTemplate(env, userId, templateId)`**
- Returns all generation attempts for a template
- Ordered by created_at DESC (newest first)
- User-scoped filtering
- Returns minimal, UI-friendly columns

**Return shape:**
```javascript
[
  {
    id,
    status,
    started_at,
    completed_at,
    odoo_project_id,
    odoo_project_url,
    failed_step,
    error_message
  }
]
```

**2. `getGenerationById(env, userId, generationId)`**
- Returns single generation record with full diagnostics
- User-scoped filtering
- Returns null if not found (PGRST116 error)
- Includes generation_model and odoo_mappings for debugging

**Return shape:**
```javascript
{
  id,
  status,
  template_id,
  started_at,
  completed_at,
  odoo_project_id,
  odoo_project_url,
  odoo_mappings,
  failed_step,
  error_message,
  generation_model
}
```

---

### Design Patterns Followed

**Consistency with existing library.js patterns:**
- ✅ Same Supabase client initialization
- ✅ Explicit column selection (no SELECT *)
- ✅ User-scoped filtering (defensive, even with RLS)
- ✅ Error handling with PGRST116 check
- ✅ Logging with console.error
- ✅ Throws descriptive errors
- ✅ Returns null for "not found" vs throwing

**Architectural compliance:**
- ✅ Pure data access (no business logic)
- ✅ No Odoo knowledge
- ✅ No HTTP handling
- ✅ No lifecycle transitions
- ✅ No side effects

---

### What Changed

**Modified:**
- `src/modules/project-generator/library.js` - Added 2 functions (66 lines)

**No changes to:**
- Generation logic
- Lifecycle tracking
- Odoo integration
- UI
- Routes
- Database schema

---

### Behavior

**Before STEP 3:**
- Application could not query generation history
- No way to show past generations to users

**After STEP 3:**
- Application can list generations per template
- Application can inspect individual generation records
- **Generation behavior unchanged** (still works exactly the same)
- **No user-visible changes** (UI not implemented yet)

---

### Usage Examples

**List generations for template:**
```javascript
const generations = await getGenerationsForTemplate(env, user.id, templateId);
// Returns: [{ id, status, started_at, ... }, ...]
```

**Get specific generation:**
```javascript
const generation = await getGenerationById(env, user.id, generationId);
if (!generation) {
  // Not found or not owned by user
}
// Returns: { id, status, odoo_mappings, generation_model, ... }
```

---

### Data Access Characteristics

**Security:**
- User-scoped (user_id filter on all queries)
- RLS enforced by Supabase
- No cross-user data leakage

**Performance:**
- Indexes exist on user_id, template_id (from migration)
- Ordered queries use created_at (indexed implicitly)
- No joins (single table queries)

**Error handling:**
- Database errors logged and re-thrown
- "Not found" returns null (not error)
- Consistent with existing library patterns

---

### Next Steps

**STEP 4:** Create generation history UI
- Build read-only view at `/projects/:templateId/generations`
- Display status badges
- Link to Odoo projects
- Show error messages

**STEP 5:** Post-generation UX feedback
- Success/failure screens
- Retry warnings
- Manual cleanup instructions

---

**Status:** STEP 3 COMPLETE  
**Next:** Await approval before proceeding to STEP 4

---

## STEP 4: Generation History UI (COMPLETE)

### Implementation Summary

Created read-only UI for viewing generation history per template.

### Changes Made

#### 1. New UI Function in `ui.js`

**Added `generationHistoryUI(user, templateId, templateName)`**
- Static HTML shell following existing patterns
- DaisyUI components
- Lucide icons
- Loading, empty, and table states
- Help text explaining generation history
- Back navigation to template library

#### 2. New Routes in `module.js`

**Route: `GET /generations/:id`**
- Serves generation history UI
- Checks template ownership
- Returns HTML page

**Route: `GET /api/generations/:id`**
- Returns JSON array of generations
- User-scoped via library function
- Powers client-side rendering

#### 3. Client-Side Rendering in `project-generator-client.js`

**Added generation history logic (250+ lines):**

**Functions:**
- `initGenerationHistory()` - Initialize view
- `loadGenerationHistory()` - Fetch data from API
- `renderGenerationHistory(generations)` - Build table using DOM APIs
- `createStatusBadge(status)` - Status badge component
- `formatDateTime(dateString)` - Timestamp formatting
- `calculateDuration(start, end)` - Duration calculation

**Status Badges:**
- ✅ `completed` - Green badge with check icon
- ❌ `failed` - Red badge with X icon
- ⏳ `in_progress` - Yellow badge with loader icon
- ⏱️ `pending` - Gray badge with clock icon

**Table Columns:**
1. **Status** - Visual badge
2. **Started** - Formatted timestamp
3. **Duration** - Calculated time or "In progress..."
4. **Result** - Context-specific:
   - Completed → Odoo project link (opens in new tab)
   - Failed → Failed step + error message + cleanup note
   - In Progress → Loading spinner
   - Other → Dash

#### 4. Navigation Integration

**Added "View History" button to template library:**
- Icon: `history`
- Placement: Between "Generate" and "Edit Blueprint"
- Links to `/projects/generations/:id`

---

### UI Characteristics

**Read-Only:**
- No retry buttons
- No cancel buttons
- No inline editing
- No confirmation modals
- Pure observation

**Safety:**
- ✅ NO template literals for dynamic content
- ✅ NO innerHTML with user data
- ✅ DOM APIs only (createElement, textContent, appendChild)
- ✅ Lucide icons via data-lucide attribute
- ✅ Follows Iteration 3 patterns exactly

**Empty State:**
- Clear message: "No generations yet"
- Explanation of when history appears
- Non-intrusive

**Error Display (Failed Generations):**
- Failed step clearly labeled
- Full error message displayed
- Manual cleanup note included
- Red error styling

**Completed Generations:**
- Direct link to Odoo project
- Opens in new tab (security: noopener noreferrer)
- External link icon
- Clear "View in Odoo" text

---

### Data Flow

```
User → /projects/generations/:id
  ↓
module.js: GET /generations/:id
  ↓
ui.js: generationHistoryUI() → HTML shell
  ↓
Browser loads project-generator-client.js
  ↓
initGenerationHistory()
  ↓
loadGenerationHistory() → GET /api/generations/:id
  ↓
module.js: calls getGenerationsForTemplate(env, userId, templateId)
  ↓
library.js: queries project_generations table
  ↓
Returns JSON array
  ↓
renderGenerationHistory() → DOM manipulation
  ↓
lucide.createIcons() → Icons rendered
```

---

### What Changed

**New Files:**
- None (all additions to existing files)

**Modified Files:**
- `src/modules/project-generator/ui.js` - Added generationHistoryUI() function
- `src/modules/project-generator/module.js` - Added 2 routes (UI + API)
- `public/project-generator-client.js` - Added generation history rendering logic

**No changes to:**
- Database schema
- Generation logic
- Lifecycle tracking
- Odoo integration
- Blueprint editor
- Validation

---

### Behavior

**Before STEP 4:**
- Users could not see generation history
- No way to know if generation succeeded/failed
- No links to generated Odoo projects

**After STEP 4:**
- Users can click "View History" on any template
- See all generation attempts (newest first)
- Click links to view projects in Odoo
- Understand why generations failed
- Know when to clean up partial Odoo projects

---

### Technical Details

**Status Badge Implementation:**
```javascript
// Example: completed status
const badge = document.createElement('span');
badge.className = 'badge badge-success gap-1';

const icon = document.createElement('i');
icon.setAttribute('data-lucide', 'check-circle');
icon.className = 'w-3 h-3';

badge.appendChild(icon);
badge.appendChild(document.createTextNode('Completed'));
```

**Odoo Link Implementation:**
```javascript
// Example: completed generation
const link = document.createElement('a');
link.href = generation.odoo_project_url;
link.target = '_blank';
link.rel = 'noopener noreferrer';
link.className = 'link link-primary flex items-center gap-2';

const text = document.createElement('span');
text.textContent = 'View in Odoo';
link.appendChild(text);

const icon = document.createElement('i');
icon.setAttribute('data-lucide', 'external-link');
link.appendChild(icon);
```

**Error Display Implementation:**
```javascript
// Example: failed generation
const errorDiv = document.createElement('div');

const failedStep = document.createElement('div');
failedStep.className = 'font-semibold text-error';
failedStep.textContent = 'Failed at: ' + generation.failed_step;
errorDiv.appendChild(failedStep);

const errorMsg = document.createElement('div');
errorMsg.textContent = generation.error_message;
errorDiv.appendChild(errorMsg);

const cleanup = document.createElement('div');
cleanup.className = 'text-xs text-base-content/40 mt-2';
cleanup.textContent = 'Manual cleanup in Odoo may be required';
errorDiv.appendChild(cleanup);
```

---

### User Experience

**Happy Path (Completed Generation):**
1. User generates project
2. Clicks "View History"
3. Sees green "Completed" badge
4. Clicks "View in Odoo" link
5. Opens Odoo project in new tab

**Error Path (Failed Generation):**
1. Generation fails at step 4
2. User clicks "View History"
3. Sees red "Failed" badge
4. Reads: "Failed at: 4-create-stages"
5. Sees error message
6. Notes cleanup reminder
7. Manually deletes partial project in Odoo

**Empty State:**
1. User creates new template
2. Clicks "View History"
3. Sees: "No generations yet"
4. Understands history will appear after generation

---

## STEP 5: Post-Generation UX Feedback

**Implementation Summary:**  
Replaced simple toast notifications with comprehensive modal-based feedback system that provides clear user guidance, explicit actions, and safety warnings after project generation attempts.

### Changes Made

**1. Modified `public/project-generator-client.js`**

#### Updated `generateProjectFromTemplate` function
- **Location:** Lines 297-327
- **Changes:**
  - Removed old toast-based success feedback
  - Added response status handling for three outcomes:
    - `409 Conflict` → calls `showBlockedGenerationModal()`
    - `200 Success` → calls `showSuccessGenerationModal()`
    - `500 Failure` → calls `showFailureGenerationModal()`
  - Maintained loading toast for in-progress feedback
  - Network error handling remains with toast fallback

#### Added `showSuccessGenerationModal` function
- **Location:** Lines 1550-1602
- **Purpose:** Display success feedback with action buttons
- **Behavior:**
  - Creates modal with success icon (check-circle)
  - Shows success message: "Project generated successfully!"
  - Primary action: "View project in Odoo" button (new tab, noopener)
  - Secondary action: "View generation history" button (navigates to history)
  - Uses DOM APIs exclusively (createElement, textContent, appendChild)
  - Integrates Lucide icons (external-link, history)
- **Safety:** No user data in innerHTML, all text via textContent

#### Added `showFailureGenerationModal` function
- **Location:** Lines 1604-1705
- **Purpose:** Display failure feedback with recovery options
- **Behavior:**
  - Creates modal with error icon (x-circle)
  - Shows failure message with failed step (if available)
  - Displays error message (if available)
  - Shows manual cleanup warning if `odoo_project_id` present
  - Primary action: "Retry generation" button (calls `generateProjectFromTemplate` again)
  - Secondary action: "View generation history" button
  - Uses alert-warning for partial project warning
- **Safety:** Error text via textContent (no XSS risk), graceful degradation if fields missing

#### Added `showBlockedGenerationModal` function
- **Location:** Lines 1707-1782
- **Purpose:** Handle 409 Conflict responses (in_progress or completed)
- **Behavior:**
  - Checks `result.blocking_status` to determine context
  - For `in_progress`: Shows "Generation already in progress" with wait guidance
  - For `completed`: Shows "Project already generated" with retry option
  - Conditional primary action:
    - Shows "Generate again" button ONLY if not in_progress
    - Calls `retryGenerationWithOverride()` which passes `confirmOverwrite: true`
  - Secondary action: "View generation history" button (always shown)
  - Uses warning icon (alert-circle)
- **Safety:** Prevents concurrent generations, guides user to history

#### Added `retryGenerationWithOverride` function
- **Location:** Lines 1784-1813
- **Purpose:** Retry generation with confirmOverwrite flag
- **Behavior:**
  - Shows confirmation dialog explaining new project will be created
  - Sends POST with `{ confirmOverwrite: true }` in body
  - Handles all three response types (success/failure/blocked)
  - Maintains same modal routing logic as original generation
- **Safety:** Explicit user confirmation, respects lifecycle rules

#### Added `createGenerationModal` function
- **Location:** Lines 1815-1859
- **Purpose:** Factory function for modal structure
- **Parameters:** `type` ('success' | 'error' | 'warning')
- **Behavior:**
  - Creates dialog element with DaisyUI modal classes
  - Adds close button (top-right X)
  - Creates icon container with type-specific Lucide icon
  - Color-codes icon based on type (success/error/warning)
  - Creates empty `.modal-body` for specific modal functions to populate
  - Adds backdrop for click-to-close
- **Pattern:** Returns modal DOM element ready for content injection

#### Added `closeGenerationModal` function
- **Location:** Lines 1861-1865
- **Purpose:** Close and cleanup modal
- **Behavior:**
  - Calls `modal.close()` to dismiss
  - Removes modal from DOM after 300ms (animation delay)
- **Safety:** Prevents DOM bloat, ensures cleanup

### Design Patterns

**1. Modal Routing**
```javascript
if (response.status === 409) {
  showBlockedGenerationModal(result, templateId);
} else if (result.success) {
  showSuccessGenerationModal(result, templateId);
} else {
  showFailureGenerationModal(result, templateId);
}
```
- Clear separation of success/failure/blocked paths
- No nested conditionals
- Explicit status code handling

**2. DOM API Compliance**
```javascript
const message = document.createElement('p');
message.className = 'text-lg mb-4';
message.textContent = 'Project generated successfully!';
body.appendChild(message);
```
- Zero template literals for dynamic content
- Zero innerHTML usage
- All text via textContent (XSS-safe)
- createElement + appendChild pattern

**3. Icon Integration**
```javascript
const icon = document.createElement('i');
icon.setAttribute('data-lucide', 'check-circle');
icon.className = 'w-12 h-12';
icon.style.color = 'hsl(var(--su))';
```
- Uses DaisyUI CSS variables for theme consistency
- Calls `lucide.createIcons()` after modal appended
- Accessible icon sizing (w-12 h-12 for main icon, w-4 h-4 for buttons)

**4. Graceful Degradation**
```javascript
if (result.odoo_project_url) {
  // Show Odoo link button
}
if (result.step) {
  // Show failed step
}
```
- All optional fields checked before rendering
- Modals work even if backend changes field names
- No crashes on missing data

**5. User Confirmation**
```javascript
if (!confirm('Generate a new project from this template?\n\nThis will create a separate project in Odoo (the previous one will remain).')) {
  return;
}
```
- Explicit consent before potentially destructive actions
- Clear explanation of consequences
- Maintains browser-native confirm for consistency with existing patterns

### Behavior Changes

**Before:**
- Toast notification for success (auto-dismiss after 10s)
- Inline Odoo link in toast (small, easy to miss)
- Toast notification for failure (generic error message)
- Toast for partial project cleanup warning
- No blocked generation handling (would show error toast)
- No retry flow

**After:**
- Modal for success (requires explicit dismissal or action)
- Primary "View project in Odoo" button (clear, prominent)
- Secondary "View generation history" link (persistent tracking)
- Modal for failure with detailed step/error information
- Explicit manual cleanup warning (alert component)
- "Retry generation" button with same flow
- Modal for blocked generation with context-specific messages
- Conditional "Generate again" button (only for completed, not in_progress)
- Retry with `confirmOverwrite` flag to bypass lifecycle check
- All modals use DaisyUI styling (consistent with app theme)
- All modals are dismissible (X button + backdrop click)

### Technical Details

**1. Modal Lifecycle**
- Created via `createGenerationModal(type)`
- Populated with content in specific modal functions
- Appended to `document.body`
- Opened with `modal.showModal()` (native dialog API)
- Closed with `closeGenerationModal(modal)` (remove after 300ms)

**2. HTTP Status Mapping**
- `200` + `result.success === true` → Success modal
- `200` + `result.success === false` → Failure modal
- `500` → Failure modal
- `409` → Blocked modal
- Network error → Toast fallback

**3. Generation Retry Logic**
- **From failure modal:** Normal retry (no special flags)
- **From blocked modal:** Retry with `confirmOverwrite: true` in request body
- Both routes go through same response handling logic
- Lifecycle module on backend handles confirmOverwrite flag

**4. Icon Usage**
- Success: check-circle (green)
- Failure: x-circle (red)
- Blocked: alert-circle (yellow)
- Odoo link: external-link
- History: history
- Retry: refresh-cw (failure) or plus-circle (blocked)

**5. Modal Structure**
```html
<dialog class="modal">
  <div class="modal-box">
    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
    <div class="flex justify-center mb-4">
      <i data-lucide="[icon-name]" class="w-12 h-12"></i>
    </div>
    <div class="modal-body">
      <!-- Specific content injected here -->
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"></form>
</dialog>
```

### Testing Considerations

**Manual Testing:**
1. Generate new template → should show success modal with Odoo link
2. Click "View project in Odoo" → should open new tab with correct URL
3. Click "View generation history" → should navigate to history page
4. Attempt generation again → should show blocked modal (completed)
5. Click "Generate again" → should confirm and retry with override
6. Simulate failure (disconnect Odoo) → should show failure modal with error details
7. Click "Retry generation" from failure → should retry without override
8. Attempt generation while one in progress → should show blocked modal (in_progress)
9. Blocked modal for in_progress → should NOT show "Generate again" button

**Edge Cases:**
- Missing `odoo_project_url` → modal shows but no Odoo button
- Missing `step` or `error` in failure → modal shows generic message
- Missing `blocking_status` → defaults to completed behavior
- Network error during retry → shows toast fallback

---

### Next Steps

**STEP 6:** Final documentation
- Update ITERATION_5_SUMMARY.md
- Document complete iteration
- Add usage examples
- Update main README.md

---

**Status:** STEP 5 COMPLETE  
**Next:** Await approval before proceeding to STEP 6

