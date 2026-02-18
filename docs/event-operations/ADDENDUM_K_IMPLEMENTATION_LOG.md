# ADDENDUM K - Implementation Log

**Date:** 2026-02-18  
**Author:** System Implementation  
**Status:** Ready for implementation  
**Priority:** P0 - Critical bugs (form re-addition, time detection, snapshot desync)

---

## Overview

This document provides step-by-step implementation instructions for ADDENDUM K, which fixes critical bugs identified in the analysis:
1. Form re-addition after "Reset to Odoo"
2. Time changes not detected in out-of-sync
3. Snapshot desync creating duplicate WP events
4. HTML formatting lost in Quill editor

**Non-goals:** No template system, no UI redesign, no editor framework changes, minimal refactoring

---

## PART A: Schema Changes (Supabase Migration)

### File Created
✅ `supabase/migrations/20260218000000_addendum_k_editorial_semantics.sql`

### New Columns Added
1. **wp_event_id** (BIGINT, nullable, indexed)
   - Primary WordPress link source
   - Extracted from existing `wp_snapshot.id` during migration
   
2. **editorial_mode** (TEXT, NOT NULL, default='never_edited')
   - Enum: `never_edited`, `custom`, `use_odoo_plain`, `empty`
   - Determines description and form behavior
   - Migrated: existing records with editorial_content → `custom`
   
3. **selected_form_id** (TEXT, nullable)
   - Dedicated form selection field
   - NULL = no form, value = form ID for shortcode
   - Decoupled from editorial_content

### Migration Steps
```bash
# Apply migration via Supabase CLI
cd supabase
supabase db push

# Verify columns exist
supabase db query "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'webinar_snapshots' AND column_name IN ('wp_event_id', 'editorial_mode', 'selected_form_id');"
```

### Rollback
```sql
ALTER TABLE webinar_snapshots DROP COLUMN wp_event_id;
ALTER TABLE webinar_snapshots DROP COLUMN editorial_mode;
ALTER TABLE webinar_snapshots DROP COLUMN selected_form_id;
DROP INDEX idx_webinar_snapshots_wp_event_id;
```

---

## PART B: Editorial Semantics (Backend)

### File: `src/modules/event-operations/wp-client.js`

### Changes Required

#### 1. Update `publishToWordPress()` Function

**Location:** Lines 154-210 (editorial content logic)

**Replace:**
```javascript
// OLD code (lines 185-203):
let editorialContent = existingSnapshot?.editorial_content;
let editorialContentToSave = null;

if (editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0) {
  // User has custom editorial content - use it
  const odooDescription = odooWebinar.x_studio_webinar_info || '';
  wpPayload.description = buildEditorialDescription(editorialContent, odooDescription);
} else {
  // No editorial content - generate default
  const odooDescription = odooWebinar.x_studio_webinar_info || '';
  const defaultEditorial = {
    blocks: [
      { type: 'paragraph', content: odooDescription },
      { type: 'shortcode', name: 'forminator_form', attributes: { id: '14547' } }
    ],
    version: 1
  };
  wpPayload.description = buildEditorialDescription(defaultEditorial, odooDescription);
  editorialContentToSave = defaultEditorial;
}
```

**With NEW code:**
```javascript
// NEW: editorial_mode-based logic
const odooDescription = odooWebinar.x_studio_webinar_info || '';
const editorialMode = existingSnapshot?.editorial_mode || 'never_edited';
const selectedFormId = existingSnapshot?.selected_form_id || null;
const editorialContent = existingSnapshot?.editorial_content || null;

let descriptionHtml = '';
let editorialModeToSave = editorialMode;
let selectedFormIdToSave = selectedFormId;

switch (editorialMode) {
  case 'never_edited':
    // First publish: Odoo description + optional form
    descriptionHtml = odooDescription || '';
    // Set default form on first publish if not set
    if (selectedFormId === null) {
      selectedFormIdToSave = '14547'; // Default form
    }
    break;
    
  case 'use_odoo_plain':
    // User wants plain Odoo description (no default injection!)
    descriptionHtml = odooDescription || '';
    break;
    
  case 'custom':
    // User has custom editorial content
    if (editorialContent && editorialContent.blocks) {
      descriptionHtml = buildEditorialDescription(editorialContent, odooDescription);
    } else {
      // Fallback to Odoo if editorial_content missing
      descriptionHtml = odooDescription || '';
    }
    break;
    
  case 'empty':
    // User wants empty description
    descriptionHtml = '';
    break;
    
  default:
    console.warn(`${LOG_PREFIX} Unknown editorial_mode: ${editorialMode}`);
    descriptionHtml = odooDescription || '';
    editorialModeToSave = 'never_edited';
}

// Append form shortcode if selected (decoupled from content)
if (selectedFormIdToSave) {
  const formShortcode = `\n\n[forminator_form id="${selectedFormIdToSave}"]`;
  descriptionHtml += formShortcode;
}

wpPayload.description = descriptionHtml;
```

#### 2. Update Snapshot SELECT Query

**Location:** Lines 161-164

**Change:**
```javascript
// OLD:
const { data: existingSnapshot } = await supabase
  .from('webinar_snapshots')
  .select('wp_snapshot, editorial_content')
  .eq('odoo_webinar_id', odooWebinarId)
  .single();

// NEW:
const { data: existingSnapshot } = await supabase
  .from('webinar_snapshots')
  .select('wp_event_id, editorial_mode, selected_form_id, editorial_content, wp_snapshot')
  .eq('odoo_webinar_id', odooWebinarId)
  .single();
```

---

## PART C: Reset to Odoo (Frontend)

### File: `public/editor-controller.js`

### Changes Required

#### 1. Update `saveDescription()` Function

**Location:** Lines 306-318 (Reset to Odoo logic)

**Replace:**
```javascript
// OLD code:
if (isOverride) {
  // Save as editorial override
  await saveEditorialToSupabase(currentWebinarId, newDescription);
} else {
  // User reset to canonical → CLEAR editorial content
  clearEditorialOverride(currentWebinarId);
  await saveEditorialToSupabase(currentWebinarId, null);  // ← BUG: Sets NULL!
}
```

**With NEW code:**
```javascript
// NEW: Use editorial_mode instead of NULL
if (isOverride) {
  // User customized content
  await saveEditorialToSupabase(currentWebinarId, newDescription, 'custom');
} else {
  // User wants Odoo description (no custom content)
  // Set mode to use_odoo_plain, NOT null!
  await saveEditorialToSupabase(currentWebinarId, null, 'use_odoo_plain');
  clearEditorialOverride(currentWebinarId);
}
```

#### 2. Update `saveEditorialToSupabase()` Function

**Location:** Lines 450-471

**Add editorial_mode parameter:**
```javascript
// OLD signature:
async function saveEditorialToSupabase(webinarId, htmlOrNull) {
  const editorialContent = htmlOrNull ? htmlToBlocks(htmlOrNull) : null;
  
  const response = await fetch(`/events/api/editorial/${webinarId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ editorialContent })
  });
  // ...
}

// NEW signature:
async function saveEditorialToSupabase(webinarId, htmlOrNull, editorialMode = null) {
  const editorialContent = htmlOrNull ? htmlToBlocks(htmlOrNull) : null;
  
  const payload = { editorialContent };
  if (editorialMode) {
    payload.editorialMode = editorialMode;
  }
  
  const response = await fetch(`/events/api/editorial/${webinarId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  // ...
}
```

#### 3. Add "Clear Form" Button (Optional but Recommended)

**Location:** Editor modal UI (lines 50-130)

**Add button:**
```html
<!-- In editor modal actions -->
<div class="form-control mb-4">
  <label class="label">
    <span class="label-text">Inschrijfformulier</span>
  </label>
  <select id="form-picker-select" class="select select-bordered">
    <option value="">Geen formulier</option>
    <option value="14547" selected>Standaard Webinar Inschrijving (14547)</option>
    <!-- More forms loaded dynamically -->
  </select>
</div>
```

**Add handler:**
```javascript
// In openEditor() or initializeQuill()
const formPicker = document.getElementById('form-picker-select');
if (formPicker) {
  formPicker.addEventListener('change', async (e) => {
    const formId = e.target.value || null;
    // Save to Supabase
    await fetch(`/events/api/editorial/${currentWebinarId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ selectedFormId: formId })
    });
  });
}
```

---

## PART D: Form Picker Backend

### File: `src/modules/event-operations/routes.js`

### Add New Endpoint

**Location:** After existing routes (e.g., line 1000)

**Add:**
```javascript
/**
 * GET /events/api/forms
 * Fetch available Forminator forms from WordPress
 */
'GET /api/forms': async (context) => {
  const { env } = context;
  
  try {
    // Option 1: If Forminator has REST API
    const response = await fetch(
      `${env.WORDPRESS_URL}/wp-json/forminator/v1/forms`,
      {
        headers: {
          'Authorization': wpAuthHeader(env)
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Forminator API error: ${response.status}`);
    }
    
    const forms = await response.json();
    
    // Transform to simple format
    const simpleForms = forms.map(form => ({
      id: String(form.id),
      name: form.name || form.title || `Form ${form.id}`
    }));
    
    return new Response(JSON.stringify({
      success: true,
      data: simpleForms
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error(`${LOG_PREFIX} ${EMOJI.ERROR} Fetch forms failed:`, error);
    
    // Fallback: Hardcoded forms list
    return new Response(JSON.stringify({
      success: true,
      data: [
        { id: '14547', name: 'Webinar Inschrijving (Standaard)' },
        { id: '15201', name: 'Workshop Inschrijving' },
        { id: '16034', name: 'Training Enrollment' }
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
},
```

---

## PART E: WordPress Linking

### File: `src/modules/event-operations/wp-client.js`

### Changes Required

**Location:** Lines 210-265 (CREATE vs UPDATE logic)

**Replace:**
```javascript
// OLD code:
const existingWpEventId = existingSnapshot?.wp_snapshot?.id;

if (existingWpEventId) {
  // UPDATE existing WordPress event
  const updateResponse = await fetch(...)
} else {
  // CREATE new WordPress event
  const createResponse = await fetch(...)
}
```

**With NEW code:**
```javascript
// NEW: WordPress is leidend (verify existence, find matches)
let wpEventId = existingSnapshot?.wp_event_id || null;

if (wpEventId) {
  // Verify WP event still exists
  const verifyResponse = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}/${wpEventId}`,
    { headers: { 'Authorization': wpAuthHeader(env) } }
  );
  
  if (verifyResponse.status === 404) {
    console.warn(`${LOG_PREFIX} ⚠️ WP event ${wpEventId} not found, will search for match`);
    wpEventId = null; // Unlink
  } else if (!verifyResponse.ok) {
    throw new Error(`Failed to verify WP event ${wpEventId}: ${verifyResponse.status}`);
  }
}

if (!wpEventId) {
  // Try to find existing WP event by meta odoo_webinar_id
  console.log(`${LOG_PREFIX} 🔍 Searching for WP event with odoo_webinar_id=${odooWebinarId}`);
  
  const wpEventsResponse = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.WP_EVENTS}?per_page=100&status=publish,draft,private`,
    { headers: { 'Authorization': wpAuthHeader(env) } }
  );
  
  if (wpEventsResponse.ok) {
    const wpEvents = await wpEventsResponse.json();
    const matchedEvent = wpEvents.find(event => 
      event.meta && String(event.meta.odoo_webinar_id) === String(odooWebinarId)
    );
    
    if (matchedEvent) {
      wpEventId = matchedEvent.id;
      console.log(`${LOG_PREFIX} 🔗 Found WP event ${wpEventId} via meta, will link and UPDATE`);
    }
  }
}

// Now decide CREATE vs UPDATE
let wpEventData;

if (wpEventId) {
  // UPDATE existing event
  const updateResponse = await fetch(...);
  wpEventData = await updateResponse.json();
} else {
  // CREATE new event
  const createResponse = await fetch(...);
  wpEventData = await createResponse.json();
  wpEventId = wpEventData.id;
}
```

---

## PART F: Out-of-Sync Logic

### File: `src/modules/event-operations/state-engine.js`

### Changes Required

**Location:** Lines 51-98 (`detectDiscrepancies` function)

**Replace:**
```javascript
// OLD code (date-only comparison):
const wpDate = stripHtmlTags(String(wpDateRaw)).split(' ')[0].trim();
const odooDate = odooSnapshot[ODOO_FIELDS.EVENT_DATETIME];
if (wpDate && odooDate && wpDate !== odooDate) {
  return true;
}
```

**With NEW code (full datetime comparison):**
```javascript
// NEW: Full datetime comparison (execution-critical fields only)

// 1. Datetime comparison (date AND time)
const wpDatetimeRaw = wpSnapshot.utc_start_date || wpSnapshot.start_date;
const odooDatetimeRaw = odooSnapshot[ODOO_FIELDS.EVENT_DATETIME];

if (wpDatetimeRaw && odooDatetimeRaw) {
  const odooUtc = parseAsUTC(odooDatetimeRaw);
  const wpUtc = parseAsUTC(wpDatetimeRaw);
  
  if (odooUtc && wpUtc) {
    // Compare with 1-minute tolerance
    const diffMs = Math.abs(odooUtc.getTime() - wpUtc.getTime());
    if (diffMs > 60000) { // 60 seconds
      console.log('🔍 DISCREPANCY - Datetime:', {
        odoo: odooUtc.toISOString(),
        wp: wpUtc.toISOString(),
        diffMinutes: Math.round(diffMs / 60000)
      });
      return true;
    }
  }
}

// 2. Duration comparison (if available)
// TODO: Check if duration fields exist in snapshots

// 3. Meeting link comparison (if available)
// TODO: Check if meeting_link fields exist in snapshots

// 4. Host comparison (if available)
// TODO: Check if host fields exist in snapshots

// Note: Title and description are NOT compared (as per spec)

function parseAsUTC(raw) {
  if (!raw) return null;
  let iso = String(raw).trim();
  if (iso.includes(' ') && !iso.includes('T')) {
    iso = iso.replace(' ', 'T') + 'Z';
  } else if (iso.includes('T') && !iso.endsWith('Z')) {
    iso += 'Z';
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
```

**Remove title comparison:**
```javascript
// DELETE lines 70-79:
const wpTitle = stripHtmlTags(String(wpSnapshot.title || '').trim().toLowerCase());
const odooTitle = String(odooSnapshot[ODOO_FIELDS.NAME] || '').trim().toLowerCase();

if (wpTitle !== odooTitle) {
  console.log('🔍 DISCREPANCY DETECTED - Title mismatch:');
  console.log('  Odoo title:', odooTitle);
  console.log('  WP title:', wpTitle);
  return true;
}
```

---

## PART G: HTML Formatting Preservation

### File: `public/editor-controller.js`

### Changes Required

**Location:** Lines 395-445 (`htmlToBlocks` function)

**Replace:**
```javascript
// OLD code (uses textContent, loses formatting):
const text = node.textContent.trim();
if (text) {
  blocks.push({ type: 'paragraph', content: text });
}
```

**With NEW code (preserves HTML):**
```javascript
// NEW: Preserve full HTML (outerHTML or innerHTML)
if (node.nodeType === Node.ELEMENT_NODE) {
  const text = node.textContent.trim();
  if (!text) continue;

  // Check for shortcode first
  const shortcodeMatch = text.match(/^\[(\w+)(?:\s+(.+?))?\]$/);
  
  if (shortcodeMatch) {
    // Parse as shortcode
    const attrs = {};
    if (shortcodeMatch[2]) {
      const attrRegex = /(\w+)="([^"]*)"/g;
      let m;
      while ((m = attrRegex.exec(shortcodeMatch[2]))) {
        attrs[m[1]] = m[2];
      }
    }
    blocks.push({ type: 'shortcode', name: shortcodeMatch[1], attributes: attrs });
  } else {
    // Preserve FULL HTML (not just text!)
    blocks.push({ type: 'paragraph', content: node.outerHTML });  // ← KEY CHANGE
  }
}
```

---

## Backend Route Updates

### File: `src/modules/event-operations/routes.js`

### Changes Required

**Location:** Line 1058 (`PUT /api/editorial/:webinarId`)

**Update to handle editorial_mode and selected_form_id:**
```javascript
// OLD:
'PUT /api/editorial/:webinarId': async (context) => {
  const { editorialContent } = await request.json();
  
  const { error } = await supabase
    .from('webinar_snapshots')
    .update({ editorial_content: editorialContent })
    .eq('odoo_webinar_id', webinarId);
  // ...
}

// NEW:
'PUT /api/editorial/:webinarId': async (context) => {
  const { editorialContent, editorialMode, selectedFormId } = await request.json();
  
  const updateData = {};
  if (editorialContent !== undefined) {
    updateData.editorial_content = editorialContent;
  }
  if (editorialMode !== undefined) {
    updateData.editorial_mode = editorialMode;
  }
  if (selectedFormId !== undefined) {
    updateData.selected_form_id = selectedFormId;
  }
  
  const { error } = await supabase
    .from('webinar_snapshots')
    .update(updateData)
    .eq('odoo_webinar_id', webinarId);
  // ...
}
```

---

## Testing Checklist

### Manual Tests

- [ ] **Test 1: Form Re-addition Bug (CRITICAL)**
  1. Publish new event → form 14547 added automatically
  2. Open Quill editor, remove shortcode manually
  3. Save
  4. Verify in WP: form should be GONE
  5. Click "Reset to Odoo" in editor
  6. Save
  7. Re-publish event
  8. Check WP description
  9. ✅ Expected: NO form (bug fixed)
  10. ❌ Old behavior: Form 14547 re-added

- [ ] **Test 2: Time Change Detection (CRITICAL)**
  1. Create event in Odoo: 2026-06-18 09:00:00
  2. Publish to WordPress
  3. Change time in Odoo: 2026-06-18 14:00:00
  4. Run sync or refresh dashboard
  5. ✅ Expected: Status shows "out-of-sync"
  6. ❌ Old behavior: Status shows "published"

- [ ] **Test 3: Snapshot Desync (CRITICAL)**
  1. Publish event → WP event ID 123 created
  2. Manually delete snapshot from Supabase:
     ```sql
     DELETE FROM webinar_snapshots WHERE odoo_webinar_id = 456;
     ```
  3. Click "Publish" again
  4. ✅ Expected: System finds WP event via meta, performs UPDATE
  5. ❌ Old behavior: CREATE new event → duplicate

- [ ] **Test 4: HTML Formatting Preservation**
  1. Open Quill editor
  2. Type: "Join our **Advanced** workshop on *AI*"
  3. Save
  4. Check Supabase `editorial_content.blocks`
  5. ✅ Expected: HTML preserved (`<strong>`, `<em>` tags)
  6. ❌ Old behavior: Plain text only

- [ ] **Test 5: Form Picker**
  1. Open editor modal
  2. Select different form from dropdown
  3. Save
  4. Publish
  5. ✅ Expected: Selected form shortcode in WP
  6. Check Supabase: `selected_form_id` updated

- [ ] **Test 6: Empty Editorial Mode**
  1. Publish event
  2. Delete ALL content in editor
  3. Save (should set `editorial_mode = 'empty'`)
  4. Re-publish
  5. ✅ Expected: Empty description in WP
  6. ❌ Old behavior: Default with form re-added

- [ ] **Test 7: WordPress Linking**
  1. Create "orphaned" WP event manually with meta `odoo_webinar_id = 999`
  2. Delete corresponding Supabase snapshot
  3. Publish Odoo webinar ID 999
  4. ✅ Expected: System finds and links to existing WP event
  5. ❌ Old behavior: Duplicate event created

### Automated Tests (Recommended)

Create test file: `tests/addendum-k.test.js`

```javascript
describe('Addendum K: Editorial Semantics', () => {
  test('editorial_mode never_edited sets default form on first publish', async () => {
    // Mock snapshot with editorial_mode = 'never_edited', selected_form_id = null
    // Call publishToWordPress()
    // Assert: selected_form_id updated to '14547'
  });
  
  test('editorial_mode use_odoo_plain does not inject form', async () => {
    // Mock snapshot with editorial_mode = 'use_odoo_plain', selected_form_id = null
    // Call publishToWordPress()
    // Assert: description has NO shortcode
  });
  
  test('Reset to Odoo sets editorial_mode to use_odoo_plain (not null)', async () => {
    // Call saveEditorialToSupabase(webinarId, null, 'use_odoo_plain')
    // Assert: Supabase updated with correct mode, not NULL
  });
  
  test('Time change detected in out-of-sync', () => {
    // Mock snapshots with different times, same date
    // Call detectDiscrepancies()
    // Assert: returns true
  });
  
  test('WP event verified before UPDATE', async () => {
    // Mock wp_event_id = 123
    // Mock WP API returns 404
    // Call publishToWordPress()
    // Assert: System searches for match instead of UPDATE
  });
});
```

---

## Rollback Plan

### Database Rollback

```sql
-- Rollback migration (removes new columns)
BEGIN;

-- Remove indexes
DROP INDEX IF EXISTS idx_webinar_snapshots_wp_event_id;

-- Remove columns
ALTER TABLE webinar_snapshots DROP COLUMN IF EXISTS wp_event_id;
ALTER TABLE webinar_snapshots DROP COLUMN IF EXISTS editorial_mode;
ALTER TABLE webinar_snapshots DROP COLUMN IF EXISTS selected_form_id;

COMMIT;
```

### Code Rollback

```bash
# Revert to commit before Addendum K
git log --oneline --grep="Addendum K"  # Find commit hash
git revert <commit-hash>

# Or reset if not pushed:
git reset --hard HEAD~1
```

### Data Integrity After Rollback

⚠️ **Warning:** Rolling back schema will:
- Remove `wp_event_id` (can be regenerated from `wp_snapshot.id`)
- Remove `editorial_mode` (system will treat all as `never_edited`)
- Remove `selected_form_id` (forms in `editorial_content` blocks still work)

**Recovery after rollback:**
```sql
-- If you need to restore wp_event_id:
UPDATE webinar_snapshots
SET wp_event_id = (wp_snapshot->>'id')::BIGINT
WHERE wp_snapshot IS NOT NULL
  AND wp_snapshot->>'id' IS NOT NULL;
```

---

## Implementation Order

**Phase 1: Database (5 min)**
1. Apply Supabase migration
2. Verify columns exist
3. Check data migration (editorial_mode set correctly)

**Phase 2: Backend Critical (2 hours)**
1. Update `wp-client.js` editorial semantics (Part B)
2. Update `wp-client.js` WordPress linking (Part E)
3. Update `state-engine.js` out-of-sync logic (Part F)
4. Update routes.js PUT /api/editorial endpoint

**Phase 3: Frontend Critical (1.5 hours)**
1. Update `editor-controller.js` saveDescription() (Part C)
2. Update `editor-controller.js` saveEditorialToSupabase()
3. Fix `htmlToBlocks()` formatting (Part G)

**Phase 4: Form Picker (1 hour)**
1. Add GET /api/forms endpoint (Part D)
2. Add form picker UI in editor modal
3. Wire up form selection handler

**Phase 5: Testing (2 hours)**
1. Run manual test checklist
2. Fix any issues
3. Verify rollback works

**Total Estimated Time:** 6.5 hours (1 day)

---

## Success Criteria

✅ Events can be published without form (selected_form_id = null)  
✅ "Reset to Odoo" does NOT cause form re-addition on next publish  
✅ Publish with missing snapshot but existing WP event does NOT create duplicate  
✅ Time changes (09:00 → 14:00) trigger out-of-sync status  
✅ Form picker loads forms list and saves selection  
✅ Quill formatting (bold, italic, lists) preserved after save  
✅ Title changes do NOT trigger out-of-sync  

---

## Notes & Caveats

1. **Backward Compatibility:** Existing records with `editorial_content` are migrated to `editorial_mode = 'custom'`. This preserves current behavior.

2. **Form Shortcode Location:** Shortcodes are appended to description HTML during publish. They are NOT stored in `editorial_content` blocks (decoupled design).

3. **WordPress API Limitations:** If Forminator doesn't provide REST API, the form picker will use hardcoded fallback list. This can be enhanced later.

4. **Out-of-Sync Fields:** Only datetime checked for now. Meeting link, host, and duration can be added later if fields exist in snapshots.

5. **Reset to Odoo vs Clear:** "Reset to Odoo" sets `editorial_mode = 'use_odoo_plain'`. If user wants empty description, they should delete content and save (sets `editorial_mode = 'empty'`).

6. **Testing on Production:** Run sync on a single test event first before enabling for all events.

---

## Implementation Decisions (Finalized 2026-02-18)

### 1. Form Default: UI-Driven Only ✅

**Decision:** NO automatic form injection based on event type.

- User decides explicitly: no form, yes form, which form
- Backend does NOT inject defaults based on:
  - Event type
  - `never_edited` mode
  - `blocks` content
  - `null` content
- If default 14547 is needed on first publish:
  - ONLY if `selected_form_id` is `null`
  - MUST be visible in UI (pre-selected in dropdown)
  - NO hidden behavior
- **Preference:** Fully UI-driven form selection

**Implementation:** Remove automatic form injection from wp-client.js editorial_mode switch. Form picker dropdown defaults to "Geen formulier".

### 2. Shortcode Validation for Odoo Push ✅

**Decision:** MANDATORY shortcode stripping before Odoo PATCH.

- Strip ALL shortcodes from description before pushing to Odoo
- Form shortcodes are WordPress-only
- Log when stripping occurs
- Forms NEVER go to `x_studio_webinar_info`

**Implementation:** Add `stripShortcodes()` function, call before Odoo PATCH.

### 3. Out-of-Sync Tolerance ✅

**Decision:** 60 seconds, full UTC timestamp comparison.

- Full UTC timestamp comparison (NOT date-only string compare)
- 60 second tolerance window
- Title and description NOT included in out-of-sync detection
- Only execution-critical fields:
  - `utc_start_date` (full datetime, not just date)
  - `duration` (if available)
  - `meeting_link` (if available)
  - `host` (if available)

**Implementation:** Update state-engine.js detectDiscrepancies() with parseAsUTC() + 60s tolerance.

### 4. WordPress Linking Fallback ✅

**Decision:** Conservative title+date matching as final fallback.

**Linking order:**
1. **Primary:** Match on meta `odoo_webinar_id` or `owid`
2. **Fallback:** If no meta match:
   - Same day
   - Start time within ±2 hours
   - Normalized title match
3. **Multiple candidates:** Do NOT link, log warning

**Implementation:** Add title+datetime fallback to wp-client.js linking logic with ±2 hour window.

### 5. Deployment Timing ✅

**Decision:** Deploy NOW.

- These are correctness fixes, not cosmetic changes
- Form re-addition bug is critical
- Time detection bug is critical
- Deploy immediately after testing

---

**Status:** ✅ Decisions finalized, implementation in progress  
**Review:** Completed by project lead  
**Next Step:** Begin Part B implementation (wp-client.js)

