# EVENT OPERATIONS – ADDENDUM B: EVENT DATETIME MODEL REFACTOR

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Base Implementation:** Phase 0-7 Complete + Addendum A Complete  
**Implementation Date:** February 12, 2026  
**Status:** Ready for Implementation  
**Platform:** Cloudflare Workers + Supabase PostgreSQL + Odoo x_webinar + Pure Vanilla JavaScript

---

## 1. Module Overview

### Purpose

Addendum B performs a complete structural refactor of the Event Operations module datetime model. The Odoo x_webinar model previously used a structurally incorrect two-field pattern (`x_studio_date` + `x_studio_starting_time`) which caused timezone ambiguity, computation complexity, and architectural debt. Odoo x_webinar records have been migrated to a new single-field datetime pattern (`x_studio_event_datetime` + `x_studio_event_duration_minutes`). This addendum removes all legacy field references from the codebase, establishes the new fields as the single source of truth, and enforces a clean architectural break with no backward compatibility layer.

### Metadata

| Field | Value |
|-------|-------|
| Status | **Ready for Implementation** |
| Branch | `event-datetime-refactor` |
| Implementation Date | 2026-02-12 |
| Breaking Change | **YES** |
| Database Migration Required | **NO** (already completed in Odoo) |
| Rollback Strategy | Git revert + redeploy |
| Estimated Duration | 2-3 hours |

---

## 2. Problem Statement

### Legacy Model Structure

The x_webinar Odoo model used the following fields for event timing:

```javascript
// LEGACY (DEPRECATED)
{
  x_studio_date: "2026-06-18",              // Date (Date field type)
  x_studio_starting_time: "14u30",          // Char (inconsistent format)
}
```

**Critical Issues:**

1. **Timezone Ambiguity:** No timezone information stored; all times assumed Brussels time but not enforced
2. **Inconsistent Time Format:** `x_studio_starting_time` stored as Char with multiple formats (`"14u30"`, `"14:30"`, `"2:30 PM"`, etc.)
3. **Computation Complexity:** Computing event end time required parsing Char field, concatenating Date + Time, and guessing timezone
4. **No Duration Field:** End time could not be calculated; assumed 60 minutes hardcoded
5. **Sorting Issues:** Sorting by `x_studio_date` ignored time component
6. **Filtering Issues:** Filtering "upcoming" vs "past" required client-side datetime reconstruction
7. **WordPress Sync Issues:** Tribe Events expects UTC datetime but received Brussels-local strings
8. **State Engine Issues:** Discrepancy detection compared Date strings instead of datetime values

### Odoo Datetime Field Format Quirk

**CRITICAL DISCOVERY:** Odoo datetime fields are stored in UTC but returned **without timezone indicator**.

**Problem:**
```javascript
// User enters in Odoo UI (Brussels timezone): 18/06/2026 11:00
// Odoo stores in database (UTC): 2026-06-18 09:00:00  (11:00 - 2h DST = 09:00 UTC)
// Odoo API returns: "2026-06-18 09:00:00"  // ❌ NO 'Z' SUFFIX

// JavaScript interpretation:
const date = new Date("2026-06-18 09:00:00");  // Treats as LOCAL time!
// Result: 09:00 Brussels time displayed ❌ (should be 11:00)
```

**Root Cause:**
- Odoo datetime fields store UTC values
- API returns format: `"YYYY-MM-DD HH:MM:SS"` (space separator, no 'Z')
- JavaScript `new Date()` interprets strings without timezone as **local time**
- This causes a 2-hour shift (or 1-hour in winter) when displaying

**Solution:**
```javascript
// Convert Odoo format to proper ISO 8601 UTC before parsing
let isoString = odooDatetime.trim();

// "2026-06-18 09:00:00" → "2026-06-18T09:00:00Z"
if (isoString.includes(' ') && !isoString.includes('T')) {
  isoString = isoString.replace(' ', 'T') + 'Z';
}

const date = new Date(isoString);  // Now correctly parsed as UTC
// Format to Brussels: 11:00 ✅
```

### Migration Completed (External)

All x_webinar records have been migrated manually in Odoo to the new structure:

```javascript
// NEW (CURRENT STATE IN ODOO)
{
  x_studio_event_datetime: "2026-06-18T12:30:00Z",  // Datetime (UTC stored)
  x_studio_event_duration_minutes: 90,              // Integer (minutes)
  // Legacy fields still exist but deprecated
  x_studio_date: "2026-06-18",                      // NOT USED
  x_studio_starting_time: "14u30",                  // NOT USED
}
```

**Current State:**
- ✅ All webinar records have both old and new fields populated
- ✅ New fields are authoritative source of truth
- ❌ Codebase still reads legacy fields
- ❌ No enforcement of new fields as single source
- ❌ Fallback logic still exists
- ❌ Sync logic still uses old fields

### Architectural Debt

The following architectural problems must be resolved:

| # | Problem | Impact | Resolution |
|---|---------|--------|------------|
| 1 | Constants still reference `x_studio_date` and `x_studio_starting_time` | All modules use wrong fields | Update ODOO_FIELDS constants |
| 2 | Odoo client fetches legacy fields | API returns deprecated data | Replace with `x_studio_event_datetime` and `x_studio_event_duration_minutes` |
| 3 | UI renders legacy fields | Users see incorrect time format | Replace with computed datetime + timezone formatting |
| 4 | Filtering logic uses `x_studio_date` | "Upcoming" tab shows wrong events | Replace with datetime comparison |
| 5 | Sorting logic uses `x_studio_date DESC` | Events sorted without time component | Replace with `x_studio_event_datetime DESC` |
| 6 | WordPress sync uses legacy fields | WP events have wrong start/end times | Replace with UTC datetime + duration computation |
| 7 | State engine compares legacy fields | Discrepancy detection fails | Replace with datetime comparison |
| 8 | Snapshot storage includes legacy fields | Database bloat + confusion | Remove from snapshot JSONB payload |

---

## 3. Architectural Rationale

### Why This Refactor Is Required

1. **Data Integrity:** Single source of truth prevents data drift
2. **Timezone Correctness:** UTC storage + display-layer formatting is industry standard
3. **Architectural Clarity:** No ambiguity about which field is authoritative
4. **Maintainability:** Future developers cannot accidentally use deprecated fields
5. **WordPress Integration:** Tribe Events API requires ISO 8601 UTC datetime
6. **Sorting & Filtering:** Datetime fields enable correct chronological operations
7. **State Engine Accuracy:** Discrepancy detection requires precise datetime comparison

### Why No Backward Compatibility

**Decision:** No fallback logic. No dual-field support. Clean break enforced.

**Rationale:**
- All Odoo records already migrated → no data in "old only" state
- Fallback logic adds complexity without benefit
- Dual-field logic creates race conditions (which field is correct if they differ?)
- Clean break forces complete refactor (no partial migration risk)
- Reduces testing surface area (no edge cases for missing fields)

**Risk Mitigation:**
- Rollback strategy: Git revert + redeploy (< 5 minutes)
- Validation checkpoint: Pre-deployment API test confirms new fields exist
- Monitoring: Error logs track any missing field exceptions

---

## 4. High-Level Architecture Changes

### System Layer Impact

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT LAYER (Browser)                                       │
│ ✅ NO CHANGES REQUIRED                                       │
│ - Receives computed datetime from server                    │
│ - Displays formatted Brussels time (server-side formatted)  │
└─────────────────────────────────────────────────────────────┘
                              ↑ FETCH API
┌─────────────────────────────────────────────────────────────┐
│ SERVER LAYER (Cloudflare Workers)                           │
│ ⚠️  REFACTOR REQUIRED                                        │
│ - constants.js: Replace ODOO_FIELDS.DATE/START_TIME         │
│ - odoo-client.js: Fetch new datetime fields                 │
│ - ui.js: Render computed datetime + timezone formatting     │
│ - mapping.js: Map datetime to WP Tribe format               │
│ - state-engine.js: Compare datetimes (not date strings)     │
│ - routes.js: Return datetime in API responses               │
└─────────────────────────────────────────────────────────────┘
                              ↑ ODOO XML-RPC
┌─────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                   │
│ ✅ NO CHANGES REQUIRED                                       │
│ - Odoo x_webinar: New fields already exist                  │
│ - Supabase webinar_snapshots: Will store new fields in JSONB│
│ - No schema changes needed (JSONB is flexible)              │
└─────────────────────────────────────────────────────────────┘
```

### Refactor Scope Matrix

| Component | File | Change Type | Breaking | Lines Changed (Est.) |
|-----------|------|-------------|----------|---------------------|
| Constants | `src/modules/event-operations/constants.js` | REPLACE | ✅ Yes | ~10 |
| Odoo Client | `src/modules/event-operations/odoo-client.js` | REPLACE | ✅ Yes | ~15 |
| UI Rendering | `src/modules/event-operations/ui.js` | REFACTOR | ✅ Yes | ~40 |
| WordPress Mapping | `src/modules/event-operations/mapping.js` | REFACTOR | ✅ Yes | ~30 |
| State Engine | `src/modules/event-operations/state-engine.js` | REFACTOR | ❌ No | ~20 |
| API Routes | `src/modules/event-operations/routes.js` | MINOR | ❌ No | ~5 |
| WP Client | `src/modules/event-operations/wp-client.js` | VERIFY | ❌ No | ~0 (verify only) |
| Documentation | `docs/event-operations/*.md` | UPDATE | ❌ No | Reference updates |

---

## 5. Database Model Changes

### 5.1 Odoo x_webinar Model (External, Read-Only)

**BEFORE (Deprecated):**
```javascript
{
  id: 44,
  x_name: "Introduction to OpenVME Events",
  x_studio_date: "2026-06-18",              // ❌ DEPRECATED
  x_studio_starting_time: "14u30",          // ❌ DEPRECATED
  x_studio_webinar_info: "...",
  x_studio_stage_id: [1, "Published"],
  x_active: true,
  x_studio_tag_ids: [4, 7, 12]
}
```

**AFTER (Authoritative):**
```javascript
{
  id: 44,
  x_name: "Introduction to OpenVME Events",
  x_studio_event_datetime: "2026-06-18T12:30:00Z",    // ✅ SINGLE SOURCE OF TRUTH (UTC)
  x_studio_event_duration_minutes: 90,                // ✅ DURATION IN MINUTES
  x_studio_webinar_info: "...",
  x_studio_stage_id: [1, "Published"],
  x_active: true,
  x_studio_tag_ids: [4, 7, 12],
  // Legacy fields still exist in Odoo but NOT FETCHED by our API
  x_studio_date: "2026-06-18",              // ⚠️  EXISTS BUT IGNORED
  x_studio_starting_time: "14u30",          // ⚠️  EXISTS BUT IGNORED
}
```

**Field Specifications:**

| Field Name | Type | Timezone | Format | Example | Notes |
|------------|------|----------|--------|---------|-------|
| `x_studio_event_datetime` | Datetime | UTC | ISO 8601 | `"2026-06-18T12:30:00Z"` | Single source of truth |
| `x_studio_event_duration_minutes` | Integer | N/A | Minutes | `90` | Used to compute end time |

**Computed Values:**

| Computed Field | Formula | Example |
|----------------|---------|---------|
| Event Start (Brussels) | `datetime.toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })` | `"18/06/2026, 14:30:00"` |
| Event End (UTC) | `datetime + duration_minutes` | `"2026-06-18T14:00:00Z"` |
| Event End (Brussels) | `(datetime + duration_minutes).toLocaleString('nl-BE', ...)` | `"18/06/2026, 16:00:00"` |

### 5.2 Supabase webinar_snapshots Table

**NO SCHEMA CHANGES REQUIRED** (JSONB column already flexible)

**BEFORE (odoo_snapshot JSONB):**
```json
{
  "id": 44,
  "x_name": "Introduction to OpenVME Events",
  "x_studio_date": "2026-06-18",
  "x_studio_starting_time": "14u30",
  "x_studio_webinar_info": "...",
  "x_studio_stage_id": [1, "Published"],
  "x_active": true,
  "x_studio_tag_ids": [4, 7, 12]
}
```

**AFTER (odoo_snapshot JSONB):**
```json
{
  "id": 44,
  "x_name": "Introduction to OpenVME Events",
  "x_studio_event_datetime": "2026-06-18T12:30:00Z",
  "x_studio_event_duration_minutes": 90,
  "x_studio_webinar_info": "...",
  "x_studio_stage_id": [1, "Published"],
  "x_active": true,
  "x_studio_tag_ids": [4, 7, 12]
}
```

**Impact:** Next snapshot sync will overwrite old field structure with new structure. No migration required (JSONB is schemaless).

---

## 6. Detailed Refactor Scope

### 6.1 Constants Refactor

**File:** `src/modules/event-operations/constants.js`

**BEFORE:**
```javascript
export const ODOO_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  DATE: 'x_studio_date',                    // ❌ REMOVE
  START_TIME: 'x_studio_starting_time',     // ❌ REMOVE
  INFO: 'x_studio_webinar_info',
  STAGE: 'x_studio_stage_id',
  ACTIVE: 'x_active',
  TAG_IDS: 'x_studio_tag_ids',
  LINKED_WEBINAR: 'x_studio_linked_webinar'
};
```

**AFTER:**
```javascript
export const ODOO_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  EVENT_DATETIME: 'x_studio_event_datetime',           // ✅ NEW
  DURATION_MINUTES: 'x_studio_event_duration_minutes', // ✅ NEW
  INFO: 'x_studio_webinar_info',
  STAGE: 'x_studio_stage_id',
  ACTIVE: 'x_active',
  TAG_IDS: 'x_studio_tag_ids',
  LINKED_WEBINAR: 'x_studio_linked_webinar'
};
```

**Breaking Change:** All modules importing `ODOO_FIELDS.DATE` or `ODOO_FIELDS.START_TIME` will fail at runtime.

---

### 6.2 Odoo Client Refactor

**File:** `src/modules/event-operations/odoo-client.js`

**BEFORE:**
```javascript
export async function getOdooWebinars(env) {
  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [[ODOO_FIELDS.ACTIVE, '=', true]],
    fields: [
      ODOO_FIELDS.ID,
      ODOO_FIELDS.NAME,
      ODOO_FIELDS.DATE,          // ❌ REMOVE
      ODOO_FIELDS.START_TIME,    // ❌ REMOVE
      ODOO_FIELDS.INFO,
      ODOO_FIELDS.STAGE,
      ODOO_FIELDS.ACTIVE,
      ODOO_FIELDS.TAG_IDS
    ],
    order: `${ODOO_FIELDS.DATE} DESC`,  // ❌ WRONG FIELD
    limit: 100
  });
  return webinars;
}
```

**AFTER:**
```javascript
export async function getOdooWebinars(env) {
  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [[ODOO_FIELDS.ACTIVE, '=', true]],
    fields: [
      ODOO_FIELDS.ID,
      ODOO_FIELDS.NAME,
      ODOO_FIELDS.EVENT_DATETIME,      // ✅ NEW
      ODOO_FIELDS.DURATION_MINUTES,    // ✅ NEW
      ODOO_FIELDS.INFO,
      ODOO_FIELDS.STAGE,
      ODOO_FIELDS.ACTIVE,
      ODOO_FIELDS.TAG_IDS
    ],
    order: `${ODOO_FIELDS.EVENT_DATETIME} DESC`,  // ✅ CORRECT CHRONOLOGICAL SORT
    limit: 100
  });
  return webinars;
}
```

**Impact:** API responses will include new fields; client-side code must be updated to consume them.

**Same Change Required For:**
- `getOdooWebinar(env, webinarId)` — single webinar fetch

---

### 6.3 UI Rendering Refactor

**File:** `src/modules/event-operations/ui.js`

**BEFORE (Table Rendering):**
```javascript
'<td class="whitespace-nowrap">' + (webinar.x_studio_date || '—') + '</td>' +
'<td class="whitespace-nowrap">' + (webinar.x_studio_starting_time || '—') + '</td>' +
```

**AFTER (Table Rendering):**
```javascript
'<td class="whitespace-nowrap">' + formatEventDateTime(webinar.x_studio_event_datetime) + '</td>' +
'<td class="whitespace-nowrap">' + (webinar.x_studio_event_duration_minutes || '—') + ' min</td>' +
```

**New Helper Function (Add to ui.js):**
```javascript
/**
 * Format UTC datetime to Brussels timezone for display
 * 
 * CRITICAL: Odoo datetime fields are UTC but lack 'Z' suffix
 * Must explicitly add 'Z' to ensure correct parsing
 * 
 * @param {string} utcDatetimeStr - Odoo datetime (e.g., "2026-06-18 09:00:00")
 * @returns {object} { date: "18/06/2026", time: "11:00" }
 */
function formatEventDateTime(utcDatetimeStr) {
  if (!utcDatetimeStr) return { date: '—', time: '—' };
  
  try {
    // CRITICAL: Odoo datetime fields are stored in UTC but returned WITHOUT 'Z' suffix
    // Example: Odoo returns "2026-06-18 09:00:00" for 11:00 Brussels time
    // We must explicitly treat this as UTC by adding 'Z'
    let isoString = utcDatetimeStr.trim();
    
    // If it's in format "YYYY-MM-DD HH:MM:SS" (no T, no Z), convert to ISO with Z
    if (isoString.includes(' ') && !isoString.includes('T')) {
      isoString = isoString.replace(' ', 'T') + 'Z';
    }
    // If it has T but no Z, add Z
    else if (isoString.includes('T') && !isoString.endsWith('Z')) {
      isoString = isoString + 'Z';
    }
    
    const date = new Date(isoString);
    
    // Format to Brussels timezone - datum en tijd apart
    const dateFormatted = date.toLocaleDateString('nl-BE', {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const timeFormatted = date.toLocaleTimeString('nl-BE', {
      timeZone: 'Europe/Brussels',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return { date: dateFormatted, time: timeFormatted };
  } catch (err) {
    console.error('[formatEventDateTime] Invalid datetime:', utcDatetimeStr, err);
    return { date: '—', time: '—' };
  }
}

/**
 * Compute event end datetime (UTC)
 * 
 * @param {string} startDatetimeStr - ISO 8601 UTC datetime
 * @param {number} durationMinutes - Event duration in minutes
 * @returns {Date} End datetime object
 */
function computeEventEnd(startDatetimeStr, durationMinutes) {
  const startDate = new Date(startDatetimeStr);
  const endDate = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));
  return endDate;
}
```

**BEFORE (Filtering Logic):**
```javascript
function filterWebinars(allWebinars, activeTab) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return allWebinars.filter(webinar => {
    let eventDate = null;
    
    if (webinar.x_studio_date) {
      const dateStr = webinar.x_studio_date.trim();
      // ... complex parsing logic ...
      eventDate = new Date(dateStr);
    }
    
    if (activeTab === 'upcoming') {
      return eventDate && eventDate >= today && state === 'published';
    }
    // ...
  });
}
```

**AFTER (Filtering Logic):**
```javascript
function filterWebinars(allWebinars, activeTab) {
  const now = new Date();

  return allWebinars.filter(webinar => {
    const eventDatetime = webinar.x_studio_event_datetime 
      ? new Date(webinar.x_studio_event_datetime) 
      : null;
    
    if (activeTab === 'upcoming') {
      return eventDatetime && eventDatetime >= now && state === 'published';
    }
    
    if (activeTab === 'past') {
      return eventDatetime && eventDatetime < now && state === 'published';
    }
    // ...
  });
}
```

**Impact:** 
- More accurate filtering (uses time component, not just date)
- Brussels→UTC conversion handled by browser Date constructor
- No manual date parsing required

---

### 6.4 WordPress Mapping Refactor

**File:** `src/modules/event-operations/mapping.js`

**BEFORE:**
```javascript
export function mapWebinarToTribeEvent(webinar, config = {}) {
  const {
    wpCategoryId = null,
    status = 'draft',
    eventTags = []
  } = config;

  // ❌ LEGACY: Manual datetime construction
  const eventDate = webinar.x_studio_date || new Date().toISOString().split('T')[0];
  const startTime = webinar.x_studio_starting_time || '10:00';
  
  // Parse time (handles "14u30", "14:30", etc.)
  const timeParts = startTime.replace('u', ':').split(':');
  const hours = parseInt(timeParts[0]) || 10;
  const minutes = parseInt(timeParts[1]) || 0;
  
  // Construct datetime (assumes Brussels timezone but sends to WP without TZ info)
  const startDatetime = `${eventDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  
  // Hardcoded 60-minute duration
  const endDatetime = new Date(new Date(startDatetime).getTime() + 60 * 60 * 1000).toISOString();

  return {
    title: webinar.x_name,
    description: webinar.x_studio_webinar_info || '',
    start_date: startDatetime,
    end_date: endDatetime,
    status: status,
    categories: wpCategoryId ? [wpCategoryId] : [],
    tags: eventTags
  };
}
```

**AFTER:**
```javascript
export function mapOdooToWordPress(odooWebinar, status = 'publish') {
  const eventDatetime = odooWebinar[ODOO_FIELDS.EVENT_DATETIME];
  const durationMinutes = odooWebinar[ODOO_FIELDS.DURATION_MINUTES] || DEFAULT_DURATION_MINUTES;
  
  // Validate datetime field
  if (!eventDatetime) {
    throw new Error(`Webinar ${odooWebinar.id} has no datetime (x_studio_event_datetime is empty)`);
  }
  
  // CRITICAL: Odoo datetime fields are stored in UTC but returned WITHOUT 'Z' suffix
  // Example: Odoo returns "2026-06-18 09:00:00" for 11:00 Brussels time (stored as UTC)
  // We must explicitly treat this as UTC by adding 'Z'
  let isoString = eventDatetime.trim();
  
  // If it's in format "YYYY-MM-DD HH:MM:SS" (no T, no Z), convert to ISO with Z
  if (isoString.includes(' ') && !isoString.includes('T')) {
    isoString = isoString.replace(' ', 'T') + 'Z';
  }
  // If it has T but no Z, add Z
  else if (isoString.includes('T') && !isoString.endsWith('Z')) {
    isoString = isoString + 'Z';
  }
  
  // Parse ISO 8601 UTC datetime
  const startDate = new Date(isoString);
  
  // Validate parsed date
  if (isNaN(startDate.getTime())) {
    throw new Error(`Webinar ${odooWebinar.id} has invalid datetime: ${eventDatetime}`);
  }
  
  // Compute end time from duration
  const endDate = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));
  
  return {
    title: odooWebinar[ODOO_FIELDS.NAME],
    start_date: startDate.toISOString(),  // ✅ Properly formatted UTC
    end_date: endDate.toISOString(),      // ✅ Computed from duration
    description: stripHtmlTags(odooWebinar[ODOO_FIELDS.INFO] || '') || ' ',
    status: status,
    timezone: TIMEZONE
  };
}
```

**Impact:**
- WordPress events will have correct UTC start/end times
- No hardcoded 60-minute assumption
- No manual time parsing (eliminates format inconsistency bugs)

---

### 6.5 State Engine Refactor

**File:** `src/modules/event-operations/state-engine.js`

**BEFORE:**
```javascript
export function detectDiscrepancies(odooData, wpData) {
  const discrepancies = [];

  // ❌ String comparison (ignores time component)
  if (odooData.x_studio_date !== wpData.start_date.split('T')[0]) {
    discrepancies.push({
      field: 'date',
      odoo: odooData.x_studio_date,
      wp: wpData.start_date
    });
  }

  // ❌ No end time comparison (WP has end time, Odoo doesn't)
  
  return discrepancies;
}
```

**AFTER:**
```javascript
export function detectDiscrepancies(odooData, wpData) {
  const discrepancies = [];

  // ✅ Datetime comparison (includes time component)
  const odooStart = odooData.x_studio_event_datetime;
  const wpStart = wpData.start_date;
  
  if (odooStart !== wpStart) {
    discrepancies.push({
      field: 'event_datetime',
      odoo: odooStart,
      wp: wpStart
    });
  }

  // ✅ End time comparison (computed from duration)
  const durationMinutes = odooData.x_studio_event_duration_minutes || DEFAULT_DURATION_MINUTES;
  const odooEnd = new Date(new Date(odooStart).getTime() + (durationMinutes * 60 * 1000)).toISOString();
  const wpEnd = wpData.end_date;
  
  if (odooEnd !== wpEnd) {
    discrepancies.push({
      field: 'event_end_datetime',
      odoo: odooEnd,
      wp: wpEnd
    });
  }

  return discrepancies;
}
```

**Impact:**
- Accurate discrepancy detection (no false positives from timezone drift)
- End time discrepancies now detected

---

### 6.6 API Routes (Minor Updates)

**File:** `src/modules/event-operations/routes.js`

**Change:** None required (API returns whatever Odoo client fetches; already refactored in 6.2)

**Verification Required:**
- Confirm API response structure matches client expectations
- Confirm no client-side code expects legacy fields

---

## 7. Migration Strategy

### 7.1 Pre-Deployment Validation

**Checkpoint:** Confirm all Odoo webinar records have new fields populated.

**Validation Script (Run in Odoo or via API):**
```javascript
// Pseudo-code: Fetch all webinars and check for missing fields
const webinars = await getOdooWebinars(env);

const invalidRecords = webinars.filter(w => 
  !w.x_studio_event_datetime || 
  !w.x_studio_event_duration_minutes
);

if (invalidRecords.length > 0) {
  throw new Error(`${invalidRecords.length} webinars missing new datetime fields: ${invalidRecords.map(w => w.id).join(', ')}`);
}

console.log('✅ All webinar records have new datetime fields');
```

**Abort Deployment If:**
- Any webinar record is missing `x_studio_event_datetime`
- Any webinar record is missing `x_studio_event_duration_minutes`

---

### 7.2 Deployment Sequence

**Step 1: Create Feature Branch**
```bash
git checkout -b event-datetime-refactor
```

**Step 2: Implement Refactor (Sequential)**

1. ✅ Update `constants.js` (ODOO_FIELDS)
2. ✅ Update `odoo-client.js` (getOdooWebinars, getOdooWebinar)
3. ✅ Update `ui.js` (formatEventDateTime, filterWebinars, table rendering)
4. ✅ Update `mapping.js` (mapWebinarToTribeEvent)
5. ✅ Update `state-engine.js` (detectDiscrepancies)
6. ✅ Test locally (wrangler dev)
7. ✅ Commit changes
8. ✅ Deploy to Cloudflare Workers (`wrangler deploy`)

**Step 3: Post-Deployment Smoke Test**

| Test # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Load Event Operations UI | No console errors |
| 2 | View webinar list | Datetime formatted as Brussels time |
| 3 | Filter "Upcoming" tab | Only future events shown (using datetime, not date) |
| 4 | Publish a webinar to WordPress | WP event has correct UTC start/end times |
| 5 | Check "Out of Sync" tab | Discrepancies detected correctly |
| 6 | Verify registration count | Still fetched correctly (no dependency on datetime fields) |

---

### 7.3 Rollback Plan

**Trigger Conditions:**
- API returns webinars with missing `x_studio_event_datetime`
- UI shows "—" for all event datetimes
- WordPress publish fails due to missing start_date
- State engine throws errors on datetime comparison

**Rollback Steps:**
```bash
# Revert commits
git revert <commit-hash-of-refactor>

# Redeploy previous version
wrangler deploy

# Estimated downtime: < 5 minutes
```

**Data Loss:** None (no database schema changes; snapshots can be re-synced)

---

## 8. Risk Analysis

### 8.1 High-Risk Areas

| Risk # | Area | Likelihood | Impact | Mitigation |
|--------|------|------------|--------|------------|
| R1 | Odoo records missing new fields | **LOW** | **CRITICAL** | Pre-deployment validation script (abort if any missing) |
| R2 | Client-side code still expects legacy fields | **MEDIUM** | **HIGH** | Full codebase audit (grep search for `x_studio_date`, `x_studio_starting_time`) |
| R3 | Timezone conversion errors (Odoo datetime lacks 'Z') | **RESOLVED** | **CRITICAL** | ✅ Fixed: Explicitly add 'Z' suffix before parsing Odoo datetime strings |
| R4 | WordPress Tribe Events API rejects new format | **LOW** | **HIGH** | Test publish flow to staging WP before production deploy |
| R5 | State engine false positives | **MEDIUM** | **LOW** | Test with known in-sync and out-of-sync webinars |
| R6 | Snapshot sync overwrites working data | **LOW** | **MEDIUM** | Snapshots stored in JSONB (old snapshots remain valid until next sync) |

---

### 8.2 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Webinar with `x_studio_event_datetime = null` | Validation script rejects deployment |
| Webinar with `x_studio_event_duration_minutes = 0` | Use `DEFAULT_DURATION_MINUTES` constant (60) |
| Webinar with `x_studio_event_datetime` in past | No special handling (past events still synced) |
| Odoo datetime without 'Z' suffix | ✅ Fixed: Automatically add 'Z' during parsing (`"2026-06-18 09:00:00"` → `"2026-06-18T09:00:00Z"`) |
| Odoo datetime with 'T' but no 'Z' | ✅ Fixed: Add 'Z' suffix (`"2026-06-18T09:00:00"` → `"2026-06-18T09:00:00Z"`) |
| Odoo datetime already has 'Z' | No modification needed (already correct format) |
| WordPress event already published with old times | Discrepancy detected → user must re-publish → WP event updated |
| User manually edited WP event times | Discrepancy detected → user chooses Odoo or WP as source |

---

### 8.3 Breaking Change Impact Assessment

**Who Is Affected:**

| Stakeholder | Impact | Mitigation |
|-------------|--------|------------|
| End Users (Event Operations UI) | Date/time display changes format | Brussels timezone format is more readable than old `"14u30"` format |
| WordPress Site Visitors | Event times may shift if old sync was incorrect | Re-publish all events to fix historical errors |
| Developers | Must update any custom scripts using old field names | Communicate breaking change in deployment notes |
| Odoo Admins | No impact (Odoo fields unchanged after migration) | None |

**Breaking Change Classification:** **MAJOR** (semantic versioning 2.0.0 → 3.0.0)

---

## 9. Observability & Validation

### 9.1 Error Logging

**New Error Scenarios:**

| Error Code | Trigger | Log Message | Severity |
|------------|---------|-------------|----------|
| E_DATETIME_MISSING | `x_studio_event_datetime` is null | `[mapWebinarToTribeEvent] Missing x_studio_event_datetime for webinar ${id}` | **CRITICAL** |
| E_DURATION_MISSING | `x_studio_event_duration_minutes` is null | `[mapWebinarToTribeEvent] Using default duration for webinar ${id}` | **WARNING** |
| E_DATETIME_INVALID | Date constructor throws on invalid datetime | `[formatEventDateTime] Invalid datetime: ${utcDatetimeStr}` | **ERROR** |

**Logging Implementation (Add to mapping.js, ui.js):**
```javascript
if (!webinar.x_studio_event_datetime) {
  console.error(`[CRITICAL] E_DATETIME_MISSING: Webinar ${webinar.id} missing x_studio_event_datetime`);
  throw new Error(`Missing x_studio_event_datetime for webinar ${webinar.id}`);
}

if (!webinar.x_studio_event_duration_minutes) {
  console.warn(`[WARNING] E_DURATION_MISSING: Webinar ${webinar.id} using default duration (${DEFAULT_DURATION_MINUTES} min)`);
}
```

---

### 9.2 Validation Checklist (Post-Deployment)

| # | Validation Step | Pass Criteria |
|---|----------------|---------------|
| 1 | **Odoo API Fetch** | All webinars have `x_studio_event_datetime` and `x_studio_event_duration_minutes` |
| 2 | **UI Rendering** | Table shows formatted Brussels times (not "—") |
| 3 | **Filtering Accuracy** | "Upcoming" tab shows only events where `x_studio_event_datetime >= now` |
| 4 | **Sorting Accuracy** | Events sorted chronologically by datetime (not just date) |
| 5 | **WordPress Publish** | WP event `start_date` matches Odoo `x_studio_event_datetime` (UTC) |
| 6 | **WordPress End Time** | WP event `end_date` equals `start_date + duration_minutes` |
| 7 | **Discrepancy Detection** | Events with matching Odoo/WP datetimes show "✅ In Sync" |
| 8 | **Discrepancy Detection** | Events with differing Odoo/WP datetimes show "⚠️ Out of Sync" |
| 9 | **Console Logs** | No `E_DATETIME_MISSING` errors |
| 10 | **Console Logs** | No `E_DATETIME_INVALID` errors |
| 11 | **Snapshot Sync** | Next sync stores new fields in `odoo_snapshot` JSONB |
| 12 | **Registration Count** | Still fetched correctly (no dependency on datetime refactor) |

**Automated Validation Script (Optional):**
```javascript
// Run via browser console after deployment
async function validateDatetimeRefactor() {
  const res = await fetch('/api/odoo-webinars');
  const { data } = await res.json();
  const webinars = data.webinars || [];
  
  const errors = [];
  
  webinars.forEach(w => {
    if (!w.x_studio_event_datetime) {
      errors.push(`Webinar ${w.id}: Missing x_studio_event_datetime`);
    }
    if (!w.x_studio_event_duration_minutes) {
      errors.push(`Webinar ${w.id}: Missing x_studio_event_duration_minutes`);
    }
    if (w.x_studio_date || w.x_studio_starting_time) {
      errors.push(`Webinar ${w.id}: Legacy fields still present in API response`);
    }
  });
  
  if (errors.length > 0) {
    console.error('❌ VALIDATION FAILED:', errors);
  } else {
    console.log('✅ All webinars have new datetime fields');
  }
}
```

---

## 10. Explicit Non-Goals

The following are **explicitly excluded** from Addendum B scope:

| Non-Goal | Rationale |
|----------|-----------|
| **Maintain backward compatibility with legacy fields** | Clean break enforced; no fallback logic |
| **Support webinars with only old fields** | All webinars already migrated in Odoo |
| **Migrate historical WordPress events** | User must manually re-publish if times were incorrect |
| **Add timezone selector to UI** | Brussels timezone is hardcoded (business requirement) |
| **Add duration editor to UI** | Duration managed in Odoo only (read-only integration) |
| **Support timezone conversion for non-Brussels users** | Not a requirement (all events are Brussels-based) |
| **Batch re-publish all events** | User must manually re-publish events with time discrepancies |
| **Database migration script** | Odoo migration already completed externally |
| **Supabase schema changes** | JSONB storage is flexible; no schema change needed |
| **Add duration validation rules** | Trust Odoo data (no business logic duplication) |

---

## 11. Current State Summary

### 11.1 Before Addendum B

| Component | Status |
|-----------|--------|
| Odoo x_webinar model | ✅ New fields exist and populated |
| Odoo x_webinar model | ⚠️ Legacy fields still exist (deprecated) |
| Codebase constants | ❌ Still reference legacy fields |
| Codebase API fetch | ❌ Still fetch legacy fields |
| Codebase UI rendering | ❌ Still render legacy fields |
| Codebase WordPress sync | ❌ Still use legacy fields |
| Codebase state engine | ❌ Still compare legacy fields |

**Risk:** Odoo admins could delete new fields, thinking they're unused (because codebase doesn't reference them).

---

### 11.2 After Addendum B

| Component | Status |
|-----------|--------|
| Odoo x_webinar model | ✅ New fields are single source of truth |
| Odoo x_webinar model | ⚠️ Legacy fields still exist but ignored |
| Codebase constants | ✅ Reference new fields only |
| Codebase API fetch | ✅ Fetch new fields only |
| Codebase UI rendering | ✅ Render computed datetimes (Brussels timezone) |
| Codebase WordPress sync | ✅ Use UTC datetime + computed end time |
| Codebase state engine | ✅ Compare datetime values (not date strings) |

**Recommended Future Action (Odoo Admin):**
- Archive legacy fields in Odoo (`x_studio_date`, `x_studio_starting_time`)
- Prevent accidental use by new Odoo developers

---

## 12. Implementation Checklist

Use this checklist during implementation to ensure complete refactor:

### Phase B1: Constants & API Layer
- [ ] Update `ODOO_FIELDS` in `constants.js`
- [ ] Update `getOdooWebinars()` in `odoo-client.js`
- [ ] Update `getOdooWebinar()` in `odoo-client.js`
- [ ] Verify no other files import `ODOO_FIELDS.DATE` or `ODOO_FIELDS.START_TIME`

### Phase B2: UI Layer
- [ ] Add `formatEventDateTime()` helper function to `ui.js`
- [ ] Add `computeEventEnd()` helper function to `ui.js`
- [ ] Update table rendering to use new fields
- [ ] Update `filterWebinars()` to use `x_studio_event_datetime`
- [ ] Remove all references to `x_studio_date` and `x_studio_starting_time` in `ui.js`

### Phase B3: WordPress Integration
- [ ] Update `mapWebinarToTribeEvent()` in `mapping.js`
- [ ] Update `detectDiscrepancies()` in `state-engine.js`
- [ ] Add error handling for missing `x_studio_event_datetime`
- [ ] Add default duration fallback logic

### Phase B4: Testing & Validation
- [ ] Run pre-deployment validation script
- [ ] Test locally with `wrangler dev`
- [ ] Verify table rendering shows Brussels times
- [ ] Verify "Upcoming" filter shows only future events
- [ ] Test WordPress publish flow (staging WP site)
- [ ] Verify no console errors

### Phase B5: Deployment
- [ ] Commit changes with message: `refactor: Event datetime model (Addendum B)`
- [ ] Deploy to Cloudflare Workers (`wrangler deploy`)
- [ ] Run post-deployment validation checklist (Section 9.2)
- [ ] Monitor error logs for 24 hours
- [ ] Document any issues in implementation log

### Phase B6: Documentation
- [ ] Update `EVENT_OPERATIONS_ANALYSIS_V4.md` (if exists)
- [ ] Update `README.md` (Breaking Changes section)
- [ ] Update API documentation (if exists)
- [ ] Archive legacy field documentation

---

## 13. Code Diff Summary

### Files Modified

| File | Lines Added | Lines Removed | Net Change |
|------|-------------|---------------|------------|
| `src/modules/event-operations/constants.js` | 2 | 2 | 0 |
| `src/modules/event-operations/odoo-client.js` | 4 | 4 | 0 |
| `src/modules/event-operations/ui.js` | 55 | 25 | +30 |
| `src/modules/event-operations/mapping.js` | 15 | 20 | -5 |
| `src/modules/event-operations/state-engine.js` | 15 | 8 | +7 |
| **TOTAL** | **91** | **59** | **+32** |

### Files Not Modified (Verification Required)

| File | Reason |
|------|--------|
| `src/modules/event-operations/routes.js` | API returns Odoo client data (already updated) |
| `src/modules/event-operations/wp-client.js` | Receives mapped data (already updated) |
| `public/event-operations-client.js` | Client-side rendering uses server-formatted data |

---

## 14. Deployment Timeline

| Time | Activity | Duration |
|------|----------|----------|
| T+0:00 | Run pre-deployment validation | 5 min |
| T+0:05 | Implement Phase B1 (Constants & API) | 15 min |
| T+0:20 | Implement Phase B2 (UI Layer) | 30 min |
| T+0:50 | Implement Phase B3 (WP Integration) | 20 min |
| T+1:10 | Local testing (`wrangler dev`) | 20 min |
| T+1:30 | Commit changes | 5 min |
| T+1:35 | Deploy to Cloudflare Workers | 5 min |
| T+1:40 | Post-deployment validation | 15 min |
| T+1:55 | Monitor error logs | 5 min |
| **TOTAL** | **Complete refactor** | **~2 hours** |

---

## Appendix A: Grep Audit Results

**Command:**
```bash
grep -r "x_studio_date\|x_studio_starting_time" src/ public/ docs/
```

**Results:**

| File | Line(s) | Context | Action Required |
|------|---------|---------|-----------------|
| `src/modules/event-operations/constants.js` | 39-40 | `DATE: 'x_studio_date'` | ✅ **REPLACE** |
| `src/modules/event-operations/odoo-client.js` | 24-25 | `ODOO_FIELDS.DATE, ODOO_FIELDS.START_TIME` | ✅ **REPLACE** |
| `src/modules/event-operations/odoo-client.js` | 31 | `order: ${ODOO_FIELDS.DATE} DESC` | ✅ **REPLACE** |
| `src/modules/event-operations/ui.js` | 278-279 | `if (webinar.x_studio_date)` | ✅ **REPLACE** |
| `src/modules/event-operations/ui.js` | 298 | `console.warn(...x_studio_date)` | ✅ **REPLACE** |
| `src/modules/event-operations/ui.js` | 449-450 | Table rendering | ✅ **REPLACE** |
| `docs/event-operations/ADDENDUM_A_*.md` | Multiple | Documentation examples | ⚠️ **UPDATE** (informational only) |
| `docs/event-operations/EVENT_OPERATIONS_ANALYSIS_V3.md` | Multiple | Spec document | ⚠️ **ARCHIVE** (deprecated) |

**Validation:** No references found outside event-operations module.

---

## Appendix B: Timezone Reference

**Brussels Timezone (Europe/Brussels):**
- Standard Time (Winter): UTC+1
- Daylight Saving Time (Summer): UTC+2
- DST Transition: Last Sunday in March (03:00 → 04:00) and October (04:00 → 03:00)

**Odoo Datetime Storage & Retrieval:**

```
User Input in Odoo UI (Brussels time):  18/06/2026 11:00
  ↓ (Odoo converts to UTC: -2h for DST)
Odoo Database Storage (UTC):           2026-06-18 09:00:00
  ↓ (API returns without timezone indicator)
Odoo API Response:                     "2026-06-18 09:00:00"  ❌ NO 'Z'
  ↓ (Our code adds 'Z' before parsing)
Parsed as ISO 8601 UTC:                "2026-06-18T09:00:00Z"
  ↓ (JavaScript converts to Brussels timezone)
Displayed in UI (Brussels time):       18/06/2026, 11:00  ✅ CORRECT
```

**Example Conversion:**
```
Odoo API Returns:  "2026-06-18 09:00:00"      (UTC value, no 'Z')
After Fix:         "2026-06-18T09:00:00Z"    (Proper ISO 8601)
Brussels (DST):    2026-06-18 11:00 (UTC+2)
Display Format:    "18/06/2026, 11:00"
```

**JavaScript Date API Handling:**
```javascript
const utcDate = new Date("2026-06-18T12:30:00Z");

// Automatic timezone conversion
const formatted = utcDate.toLocaleString('nl-BE', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

console.log(formatted); // "18/06/2026, 14:30"
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-12 | GitHub Copilot | Initial Addendum B specification |

---

**END OF ADDENDUM B – EVENT DATETIME MODEL REFACTOR**
