# ADDENDUM J – IMPLEMENTATION LOG

**Module:** Event Operations  
**Datum:** 17 februari 2026  
**Probleem:** Verwijderde inschrijvingen blijven zichtbaar na sync  
**Root Cause:** HTTP caching + client-side cache persistence  

---

## CONTEXT

Na analyse bleek dat verwijderde registrations (hard deleted uit Odoo) toch zichtbaar bleven op kaarten en in lijsten, zelfs na een volledige sync. Dit was NIET het soft-delete probleem met `x_active`, maar een **caching probleem** op twee niveaus:

1. **HTTP Caching**: Cloudflare/browser cachen API responses zonder expliciete cache headers
2. **Client-side Cache**: `registrationsCacheByWebinar` Map blijft bestaan tussen syncs

---

## DIAGNOSTIEK

### Symptomen
- Registration count badge toont "1 inschrijving" 
- Na sync in app blijft dit gelijk
- Registrations modal kan oude data tonen
- Hard refresh (Ctrl+Shift+R) lost tijdelijk op → bevestigt cache probleem

### Waarom Sync Niet Werkte

**Verwachte Flow:**
```
User clicks Sync → POST /api/sync → refreshSnapshotsAfterSync() 
→ fetches /api/odoo-webinars → nieuwe counts → panel update
```

**Actuele Flow:**
```
User clicks Sync → POST /api/sync → refreshSnapshotsAfterSync() 
→ fetches /api/odoo-webinars → CACHED oude counts ❌
→ client-side cache blijft staan ❌
→ oude data blijft zichtbaar ❌
```

---

## IMPLEMENTED FIXES

### Fix 1: HTTP Cache-Control Headers

**Problem**: Geen expliciete cache headers op API endpoints → Cloudflare/browser kunnen cachen

**Solution**: Voeg `Cache-Control: no-store` toe aan alle registration/webinar endpoints

#### 1.1 Main Webinars Endpoint

**File**: `src/modules/event-operations/routes.js`  
**Route**: `GET /api/odoo-webinars`  
**Line**: ~245

```diff
  return new Response(JSON.stringify({
    success: true,
    data: {
      webinars,
      registrationCounts
    }
  }), {
-   headers: { 'Content-Type': 'application/json' }
+   headers: { 
+     'Content-Type': 'application/json',
+     'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
+   }
  });
```

**Impact**: Forces fresh fetch van registration counts bij elke request

---

#### 1.2 Registrations Endpoints

**File**: `src/modules/event-operations/routes/event-registrations.js`  
**Function**: `jsonResponse()` helper  
**Line**: ~9-13

```diff
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
-   headers: { 'Content-Type': 'application/json' }
+   headers: { 
+     'Content-Type': 'application/json',
+     'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
+   }
  });
}
```

**Impact**: 
- `GET /api/events/:webinarId/registrations` - registrations lijst
- `POST /api/events/registrations/:id/attendance` - attendance updates
- `POST /api/events/registrations/bulk-attendance` - bulk updates

Alle registrations data is nu altijd fresh.

---

### Fix 2: Client-Side Cache Clearing

**Problem**: `registrationsCacheByWebinar` Map blijft in memory tussen syncs

**Solution**: Voeg export functie toe om cache te wissen + roep aan na sync

#### 2.1 Add Cache Clear Function

**File**: `public/detail-panel-controller.js`  
**Line**: ~33-45

```diff
const REGISTRATIONS_PER_PAGE = 25;
const registrationsCacheByWebinar = new Map();
const expandedQuestionsByWebinar = new Map();

+/**
+ * Clear registrations cache (call after sync to force fresh data)
+ */
+export function clearRegistrationsCache(webinarId = null) {
+  if (webinarId) {
+    registrationsCacheByWebinar.delete(webinarId);
+  } else {
+    registrationsCacheByWebinar.clear();
+  }
+}
+
function getExpandedQuestions(webinarId) {
  // ... existing code ...
}
```

**Behavior**:
- `clearRegistrationsCache()` - wist ALLE cached registration data
- `clearRegistrationsCache(44)` - wist cache voor specifiek webinar
- Gebruikt `.clear()` niet `.delete()` voor full clear → efficiënter

---

#### 2.2 Import in UI Module

**File**: `src/modules/event-operations/ui.js`  
**Line**: ~654

```diff
  import { initializeCalendar, refreshCalendar } from '/calendar-controller.js';
- import { initializeDetailPanel } from '/detail-panel-controller.js';
+ import { initializeDetailPanel, clearRegistrationsCache } from '/detail-panel-controller.js';
  import { initializeEditorModal } from '/editor-controller.js';
```

---

#### 2.3 Clear Cache After Sync

**File**: `src/modules/event-operations/ui.js`  
**Function**: `refreshSnapshotsAfterSync()`  
**Line**: ~950-965

```diff
  if (activeView === 'calendar') {
    refreshCalendar();
  } else {
    renderTable(filteredWebinars);
  }

+ // Clear registrations cache to force fresh data after sync
+ clearRegistrationsCache();
+
  if (appState.currentEventId) {
    setCurrentEvent(appState.currentEventId);
  }
```

**Flow na deze fix:**

```
User clicks Sync
  ↓
POST /api/sync completes
  ↓
refreshSnapshotsAfterSync() called
  ↓
1. Fetch fresh webinars + counts (no-cache headers)
  ↓
2. clearRegistrationsCache() - wist client Map
  ↓
3. setCurrentEvent() - triggers detail panel re-render
  ↓
4. Next registration modal open → fresh fetch (geen cache hit)
  ↓
Result: ✅ Deleted registrations verdwijnen
```

---

## TECHNICAL NOTES

### Why Two-Level Caching Existed

1. **HTTP Level**: 
   - Cloudflare Workers default: geen expliciete cache headers
   - Browser heuristic caching: kan GET requests cachen zonder Cache-Control
   - `?_t=${Date.now()}` in frontend helpt, maar niet altijd voldoende

2. **Application Level**:
   - Performance optimization: vermijd repeat fetches tijdens één sessie
   - Pagination support: cache pages voor smooth UX
   - **BUT**: geen invalidatie strategie bij data mutations

### Cache Invalidation Strategy

**Before**: Geen invalidatie → stale forever tot hard refresh

**After**: 
- Explicit no-cache → HTTP layer always fresh
- clearRegistrationsCache() → app layer reset on sync
- setCurrentEvent() trigger → force panel re-render

**Future**: Consider TTL-based cache (e.g., 30 seconds) vs full no-cache

---

## TESTING PERFORMED

### Test Case 1: Deleted Registration Visibility

**Setup**:
1. Webinar #44 heeft 1 registration in Odoo
2. App toont "1 inschrijving"

**Action**:
1. Delete registration in Odoo (hard delete)
2. Click "Sync All" in app
3. Observe count badge

**Before Fix**: Still shows "1 inschrijving" ❌

**After Fix**: Shows "0 inschrijvingen" ✅

---

### Test Case 2: Modal Data Freshness

**Setup**: Same as Test 1, maar check modal data

**Action**:
1. Delete registration in Odoo
2. Open registrations modal (shows cached "1 registration")
3. Click Sync
4. Re-open modal

**Before Fix**: Still shows deleted registration ❌

**After Fix**: Empty list ✅

---

### Test Case 3: Regression - New Registration

**Action**:
1. Start with 0 registrations
2. Add registration in Odoo
3. Sync in app
4. Check count

**Result**: Shows "1 inschrijving" ✅ (no regression)

---

## REMAINING WORK

### Not Implemented: x_active Filter

The analysis document (ADDENDUM_J_DELETED_ITEMS_ANALYSIS.md) identified a SECOND issue: **soft-deleted registrations** (where Odoo sets `active=False` but keeps record) are still counted.

**Status**: NOT fixed in this implementation

**Why**: User confirmed their issue was hard deletion, not soft deletion. The x_active filter fix is documented but not yet needed.

**If Needed Later**, apply these changes to `odoo-client.js`:

```javascript
// getWebinarRegistrations()
domain: [
  [ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId],
  ['x_active', '=', true]  // ← Add this
]

// getRegistrationCount()
args: [[
  [ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId],
  ['x_active', '=', true]  // ← Add this
]]

// getRegistrationCountsByWebinar()
args: [
  [
    ['x_studio_linked_webinar', 'in', sanitizedIds],
    ['x_active', '=', true]  // ← Add this
  ],
  // ...
]
```

---

## FILES MODIFIED

| File | Lines | Change |
|------|-------|--------|
| `src/modules/event-operations/routes.js` | ~245 | Added Cache-Control header |
| `src/modules/event-operations/routes/event-registrations.js` | ~9-13 | Added Cache-Control to jsonResponse |
| `public/detail-panel-controller.js` | ~33-45 | Added clearRegistrationsCache() export |
| `src/modules/event-operations/ui.js` | ~654 | Import clearRegistrationsCache |
| `src/modules/event-operations/ui.js` | ~950-965 | Call clearRegistrationsCache after sync |

---

## DEPLOYMENT

```bash
# Build + deploy
wrangler deploy
```

**Post-Deploy Checklist**:
- ✅ Hard refresh browser (Ctrl+Shift+R) to clear old JS module cache
- ✅ Test sync with deleted registration
- ✅ Verify count updates correctly
- ✅ Check browser Network tab: no 304/cached responses on /api/odoo-webinars

---

## CONCLUSION

**Problem**: HTTP + client-side caching caused stale registration data to persist after sync

**Solution**: 
1. Explicit `Cache-Control: no-store` on all registration endpoints
2. `clearRegistrationsCache()` function to wipe client Map after sync
3. Integrated into sync flow for automatic invalidation

**Result**: Deleted registrations verdwijnen onmiddellijk na sync ✅

**Performance Impact**: Minimal - registration fetches were already happening on sync, just now guaranteed fresh

**Future**: Monitor if no-cache impacts performance negatively. Can consider short TTL (30s) vs full no-cache if needed.
