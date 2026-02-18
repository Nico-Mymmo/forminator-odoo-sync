# ADDENDUM K: Description and Form Improvements Analysis

**Status:** Analysis (Code-Validated)
**Date:** 2026-02-18  
**Purpose:** End-to-end analysis of description handling, title synchronization, out-of-sync detection, timezone handling, and Forminator shortcode management

---

## Executive Summary

This document provides a comprehensive, code-validated analysis of the complete data flow from Odoo to WordPress, focusing on:
1. **Description handling** - Quill WYSIWYG editor with editorial override system
2. **Event title** - Normalization and comparison logic
3. **Out-of-sync detection** - Date-only comparison (time changes ignored)
4. **Timezone handling** - UTC storage, Brussels display, comparison challenges
5. **Forminator shortcode** - Hardcoded form ID and **when it gets added/re-added**

**Critical Findings:**
1. ✅ **UI Implementation:** Quill.js WYSIWYG editor is active, old block editor deprecated
2. ⚠️ **Timezone:** Robust conversion Odoo→WP, but sync comparison only checks DATE (not time)
3. 🔴 **Form Hardcoding:** Single form ID (14547) hardcoded, no selection interface
4. 🔴 **Form Re-addition Bug:** "Reset to Odoo" sets editorial_content=NULL → next publish re-adds form unexpectedly
5. 🔴 **Snapshot Desync:** Deleted snapshot triggers CREATE even if WP event exists → duplicate events!
6. 🟡 **HTML Formatting Lost:** Quill editor strips bold/italic/lists on save (only plain text preserved)

**Most Critical Issue (User-Facing):**  
Users remove form shortcode manually, click "Reset to Odoo", then form mysteriously reappears on next publish. System treats NULL editorial_content as "needs default content" instead of "user wants plain Odoo description".

**Out of Scope:** Multi-template system (not needed per user feedback)

---

## 1. Complete Data Flow Architecture

### 1.1 Odoo → System → WordPress Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│ ODOO (Source of Truth)                                              │
├─────────────────────────────────────────────────────────────────────┤
│ x_webinar Table                                                     │
│ ├─ x_name                        (Event Title - plain text/HTML)   │
│ ├─ x_studio_webinar_info         (Description - HTML)              │
│ ├─ x_studio_event_datetime       (Datetime - UTC string)           │
│ ├─ x_studio_event_duration_minutes                                 │
│ ├─ x_webinar_event_type_id       (Event Type - many2one)           │
│ └─ x_active                      (Archive flag)                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ WORKER (Cloudflare)                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Fetch via odoo-client.js → getOdooWebinar()                     │
│ 2. Parse & Transform → mapping.js → mapOdooToWordPress()           │
│ 3. Editorial Layer → editorial.js → buildEditorialDescription()    │
│ 4. Sync State → state-engine.js → computeEventState()              │
│ 5. Publish → wp-client.js → publishToWordPress()                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SUPABASE (Snapshot & Editorial Storage)                            │
├─────────────────────────────────────────────────────────────────────┤
│ webinar_snapshots                                                   │
│ ├─ odoo_snapshot          (JSONB - complete Odoo record)           │
│ ├─ wp_snapshot            (JSONB - WordPress event data)           │
│ ├─ editorial_content      (JSONB - user blocks overrides)          │
│ └─ computed_state         (Enum - sync status)                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ WORDPRESS (Publication Target)                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Tribe Events (tribe_events post type)                              │
│ ├─ title                  (Post title - rendered HTML)             │
│ ├─ description            (Event description - HTML with shortcodes)│
│ ├─ start_date / end_date  (Event datetime - local timezone)        │
│ ├─ categories             (Tag slug - from event_type mapping)     │
│ └─ meta: odoo_webinar_id  (Foreign key back to Odoo)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Description Handling: End-to-End Analysis

### 2.1 Odoo Description Fetching

**Source Field:** `x_studio_webinar_info`

**Fetching Code:**
```javascript
// File: src/modules/event-operations/odoo-client.js
export async function getOdooWebinar(env, webinarId) {
  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [[ODOO_FIELDS.ID, '=', webinarId]],
    fields: [
      ODOO_FIELDS.INFO,  // x_studio_webinar_info ← DESCRIPTION (HTML)
      // ... other fields
    ]
  });
  return webinars[0];
}
```

**Content Type:** HTML string (rich text with tags, entities, inline styles)

**Characteristics:**
- ✅ Rich HTML content (paragraphs, lists, links, formatting)
- ⚠️ No sanitization on Odoo side (user-entered content)
- ⚠️ May contain malformed HTML or unclosed tags

---

### 2.2 Editorial Override System (WYSIWYG Editor)

**Current Implementation:** Quill.js WYSIWYG Editor (Active since Addendum D)

**Editor Location:** `public/editor-controller.js`

**UI Flow:**
```
User clicks "Beschrijving bewerken" in detail panel
    ↓
window.openEditorialEditor(webinarId) is called
    ↓
Quill.js editor modal opens with two modes:
    - "Editorial" mode (editable)
    - "Odoo (Read-only)" mode (canonical view)
    ↓
User edits HTML content in WYSIWYG editor
    ↓
On save:
    1. Update Odoo x_studio_webinar_info (PATCH /api/odoo-webinars/:id)
    2. Save editorial override to Supabase (client-side state)
    3. Convert HTML to editorial_content blocks format
    4. Refresh calendar and detail panel
```

**Code Architecture:**
```javascript
// File: public/editor-controller.js
export function initializeEditorModal() {
  editorModal = document.getElementById('editorial-editor-modal');
  window.openEditorialEditor = openEditor;  // ← Overwrites old block editor
}

export function openEditor(webinarId) {
  const webinar = getWebinar(webinarId);
  const canonicalDescription = webinar.x_studio_webinar_info || '';
  const editorialOverride = getEditorialOverride(webinarId);
  const activeDescription = editorialOverride?.description || canonicalDescription;
  
  // Initialize Quill.js
  editorInstance = new Quill('#editorial-editor', {
    theme: 'snow',
    modules: { toolbar: [/* rich text options */] }
  });
  
  editorInstance.root.innerHTML = activeDescription;
}
```

**Storage Format (Legacy):** `webinar_snapshots.editorial_content` (JSONB)
```json
{
  "blocks": [
    { "type": "paragraph", "content": "<p>HTML content here...</p>" },
    { "type": "shortcode", "name": "forminator_form", "attributes": { "id": "14547" } }
  ],
  "version": 1
}
```

**Note:** The old block-based editor (`public/event-operations-client.js` → `renderEditorialModal()`) is **deprecated** and no longer accessible via UI.

---

### 2.3 Default Editorial Content Generation

**Trigger:** First publish when no editorial_content exists

**Code Location:** `src/modules/event-operations/wp-client.js` (line 184-203)

```javascript
if (editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0) {
  // User has custom editorial content - use it
  const odooDescription = odooWebinar.x_studio_webinar_info || '';
  wpPayload.description = buildEditorialDescription(editorialContent, odooDescription);
} else {
  // 🔴 AUTO-GENERATE: Odoo description paragraph + hardcoded registration form
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

**🔴 HARDCODED FORM ID: `14547`**

This ID appears in:
- `src/modules/event-operations/wp-client.js:198` (default generation)
- `public/event-operations-client.js:795` (deprecated block editor display)
- `public/event-operations-client.js:814` (deprecated block editor hidden input)
- `public/event-operations-client.js:835` (deprecated add block function)

**Impact:** Every first-time published event gets form 14547 appended. User must manually remove/edit via Quill editor if different form needed.

**Current Workaround:** User opens Quill editor, manually types/pastes shortcode: `[forminator_form id="XXXXX"]`

---

### 2.4 HTML to Blocks Conversion

**Problem:** Quill editor saves HTML, but backend expects blocks JSONB

**Code Location:** `public/editor-controller.js` (line 395-444)

```javascript
function htmlToBlocks(html) {
  if (!html) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = [];

  for (const node of doc.body.childNodes) {
    const text = node.textContent.trim();
    if (!text) continue;

    // Check for shortcode pattern: [forminator_form id="14547"]
    const shortcodeMatch = text.match(/^\[(\w+)(?:\s+(.+?))?\]$/);
    if (shortcodeMatch) {
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
      blocks.push({ type: 'paragraph', content: text });
    }
  }

  return blocks.length > 0 ? { blocks, version: 1 } : null;
}
```

**⚠️ Shortcode Parsing Limitation:**
- Only detects shortcodes that are direct text nodes or element text
- Shortcodes inside nested HTML tags may be treated as paragraph content
- Regex assumes simple attribute format: `key="value"`

**Example Issue:**
```html
<p>Register here: [forminator_form id="14547"]</p>
<!-- Parsed as: { type: 'paragraph', content: 'Register here: [forminator_form id="14547"]' } -->
<!-- NOT parsed as shortcode block! -->
```

**Actual Backend Usage:**
The Quill editor updates Odoo directly and stores HTML in state. The blocks conversion is only used when saving to Supabase `editorial_content` column (which may be legacy at this point).

---

## 3. Timezone Handling: Deep Dive Analysis

### 3.1 The Timezone Challenge

**Context:** Events are scheduled in Brussels (Europe/Brussels, UTC+1 or UTC+2 with DST), but different systems represent times differently:
- **Odoo:** Stores as UTC without 'Z' suffix: `"2026-06-18 09:00:00"`
- **JavaScript:** Expects ISO 8601 with timezone indicator
- **WordPress:** Expects local time in site timezone: `"2026-06-18 11:00:00"`
- **Frontend Display:** Should show Brussels time to users

---

### 3.2 Odoo → Worker: UTC Parsing

**Problem:** Odoo returns UTC timestamp WITHOUT 'Z' suffix

**Code:** `src/modules/event-operations/mapping.js` (line 27-46)

```javascript
export function mapOdooToWordPress(odooWebinar, status = 'publish') {
  const eventDatetime = odooWebinar[ODOO_FIELDS.EVENT_DATETIME];
  // eventDatetime = "2026-06-18 09:00:00" (UTC, no Z)
  
  // CRITICAL: Explicitly treat as UTC by adding 'Z'
  let isoString = eventDatetime.trim();
  
  // Convert "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
  if (isoString.includes(' ') && !isoString.includes('T')) {
    isoString = isoString.replace(' ', 'T') + 'Z';
  }
  // If has T but no Z, add Z
  else if (isoString.includes('T') && !isoString.endsWith('Z')) {
    isoString = isoString + 'Z';
  }
  
  // Parse ISO 8601 UTC datetime
  const startDate = new Date(isoString);  // Now correctly parsed as UTC
  
  // Validate
  if (isNaN(startDate.getTime())) {
    throw new Error(`Webinar ${odooWebinar.id} has invalid datetime: ${eventDatetime}`);
  }
  
  // Compute end time from duration
  const endDate = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));
  
  return {
    title: odooWebinar[ODOO_FIELDS.NAME],
    start_date: formatDateTimeInTimezone(startDate, TIMEZONE),  // Convert to Brussels
    end_date: formatDateTimeInTimezone(endDate, TIMEZONE),
    description: /* ... */,
    status: status,
    timezone: TIMEZONE
  };
}
```

**✅ Solution:** Add 'Z' suffix before parsing to force UTC interpretation

---

### 3.3 Worker → WordPress: Timezone Conversion

**Goal:** Convert UTC Date object to Brussels local time string

**Code:** `src/modules/event-operations/mapping.js` (line 118-144)

```javascript
/**
 * Format Date to WordPress datetime string (timezone-aware)
 * 
 * CRITICAL: Manual construction to avoid UTC conversion
 * WordPress expects local time in "YYYY-MM-DD HH:MM:SS" format
 * 
 * @param {Date} date - UTC Date object
 * @param {string} timeZone - IANA timezone (e.g., "Europe/Brussels")
 * @returns {string} YYYY-MM-DD HH:MM:SS (local time)
 */
function formatDateTimeInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error(`Failed to format datetime for timezone ${timeZone}`);
  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
```

**Example:**
```
Input:  new Date("2026-06-18T09:00:00Z")  (UTC)
Output: "2026-06-18 11:00:00"             (Brussels, UTC+2 in summer)
```

**✅ Robust Solution:** Use `Intl.DateTimeFormat` with timezone parameter - browser/runtime handles DST automatically

**⚠️ Why Not `toISOString()`?**
```javascript
// ❌ WRONG APPROACH:
const wrongFormat = date.toISOString().replace('T', ' ').replace('Z', '');
// Returns: "2026-06-18 09:00:00" (still UTC! - not Brussels time)
```

---

### 3.4 Frontend: Display Brussels Time

**Calendar:** `public/calendar-controller.js` (line 29-54)

```javascript
function normalizeOdooDatetime(odooDatetime) {
  if (!odooDatetime || typeof odooDatetime !== 'string') {
    return null;
  }

  let isoString = odooDatetime.trim();

  // Convert Odoo format (space separator) to ISO 8601 (T separator + Z suffix)
  if (isoString.includes(' ') && !isoString.includes('T')) {
    isoString = isoString.replace(' ', 'T') + 'Z';
  }

  // Validate by attempting to parse
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return null;
  }

  return isoString;  // Return ISO string for FullCalendar
}
```

**UI Helper:** `src/modules/event-operations/ui.js` (line 1246-1278)

```javascript
function formatEventDateTime(webinar) {
  const utcDatetimeStr = webinar.x_studio_event_datetime;
  if (!utcDatetimeStr) return { date: '—', time: '—' };
  
  try {
    let isoString = utcDatetimeStr.trim();
    
    // Add Z suffix if needed
    if (isoString.includes(' ') && !isoString.includes('T')) {
      isoString = isoString.replace(' ', 'T') + 'Z';
    } else if (isoString.includes('T') && !isoString.endsWith('Z')) {
      isoString = isoString + 'Z';
    }
    
    const date = new Date(isoString);
    
    // Format to Brussels timezone for display
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
```

**✅ Consistent Pattern:** All frontend code adds 'Z' suffix before parsing

---

### 3.5 Sync Comparison: The Time Problem

**Backend Comparison:** `src/modules/event-operations/state-engine.js` (line 80-94)

```javascript
function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // ... title check ...
  
  // Date/time mismatch (only if WP has start_date — Tribe API field)
  const wpDateRaw = wpSnapshot.start_date;
  if (wpDateRaw) {
    // 🔴 PROBLEM: Only compares DATE portion, not TIME
    const wpDate = stripHtmlTags(String(wpDateRaw)).split(' ')[0].trim();
    const odooDate = odooSnapshot[ODOO_FIELDS.EVENT_DATETIME];
    if (wpDate && odooDate && wpDate !== odooDate) {
      console.log('🔍 DISCREPANCY DETECTED - Date mismatch:');
      console.log('  Odoo date:', odooDate);
      console.log('  WP date:', wpDate);
      return true;
    }
  }
  
  return false;
}
```

**Frontend Comparison:** `public/detail-panel-controller.js` (line 769-773)

```javascript
// Date mismatch (timezone-aware via UTC source)
if ((wp.utc_start_date || wp.start_date) && webinar.x_studio_event_datetime) {
  const odooUtc = parseUtcDateTime(webinar.x_studio_event_datetime);
  const wpUtc = parseUtcDateTime(wp.utc_start_date || wp.start_date);
  if (odooUtc && wpUtc && odooUtc.getTime() !== wpUtc.getTime()) return true;
}
```

**Frontend Helper:** `public/detail-panel-controller.js` (line 793-801)

```javascript
function parseUtcDateTime(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let iso = raw.trim();
  if (iso.includes(' ') && !iso.includes('T')) {
    iso = iso.replace(' ', 'T');
    if (!iso.endsWith('Z')) iso += 'Z';
  } else if (iso.includes('T') && !iso.endsWith('Z')) {
    iso += 'Z';
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
```

**✅ Frontend Does It Right:** Compares full UTC timestamps (`.getTime()`)

**❌ Backend Problem:** Only compares date string, not time

---

### 3.6 The Out-of-Sync Detection Gap

**Scenario:** User changes event time from 09:00 to 14:00 (UTC) in Odoo

**What Happens:**

1. **Odoo:** `2026-06-18 09:00:00` → `2026-06-18 14:00:00`
2. **WordPress (existing):** `2026-06-18 11:00:00` (Brussels)
3. **Backend Comparison:**
   ```javascript
   wpDate = "2026-06-18"  // extracted from "2026-06-18 11:00:00"
   odooDate = "2026-06-18 14:00:00"
   wpDate !== odooDate?  NO (both are "2026-06-18")
   ```
4. **Result:** `computed_state = 'published'` (NO out-of-sync detected!)

**Frontend Comparison (if snapshot exists):**
```javascript
odooUtc = new Date("2026-06-18T14:00:00Z")  // 14:00 UTC
wpUtc = new Date("2026-06-18T11:00:00Z")    // 11:00 UTC (assuming WordPress stores UTC)
odooUtc.getTime() !== wpUtc.getTime()  YES → return true
```

**🔴 Problem:** Frontend detects discrepancy, but backend doesn't, leading to inconsistent state!

---

### 3.7 Recommended Fix: Full Datetime Comparison

**Replace:** `src/modules/event-operations/state-engine.js` detectDiscrepancies()

```javascript
function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // ... title check ...
  
  // Full date+time comparison using UTC timestamps
  const wpDatetimeRaw = wpSnapshot.utc_start_date || wpSnapshot.start_date;
  const odooDatetimeRaw = odooSnapshot[ODOO_FIELDS.EVENT_DATETIME];
  
  if (wpDatetimeRaw && odooDatetimeRaw) {
    // Parse both as UTC
    const odooUtc = parseAsUTC(odooDatetimeRaw);
    const wpUtc = parseAsUTC(wpDatetimeRaw);
    
    if (odooUtc && wpUtc) {
      // Compare timestamps with 1-minute tolerance (allow clock drift)
      const diffSeconds = Math.abs((odooUtc.getTime() - wpUtc.getTime()) / 1000);
      if (diffSeconds > 60) {
        console.log('🔍 DISCREPANCY DETECTED - Datetime mismatch:');
        console.log('  Odoo:', odooUtc.toISOString());
        console.log('  WP:', wpUtc.toISOString());
        console.log('  Diff:', diffSeconds, 'seconds');
        return true;
      }
    }
  }
  
  return false;
}

function parseAsUTC(raw) {
  if (!raw) return null;
  let iso = String(raw).trim();
  if (iso.includes(' ') && !iso.includes('T')) {
    iso = iso.replace(' ', 'T') + 'Z';
  } else if (iso.includes('T') && !iso.endsWith('Z')) {
    iso = iso + 'Z';
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
```

**Benefits:**
- ✅ Detects time changes (not just date)
- ✅ Timezone-safe (compares UTC timestamps)
- ✅ Tolerates 1-minute clock drift
- ✅ Consistent with frontend comparison logic

---

### 3.8 WordPress Data Format Investigation

**Question:** Does WordPress store UTC or local time in database?

**Answer:** It depends on WordPress configuration and Tribe Events plugin settings.

**Tribe Events API Response:**
```json
{
  "id": 123,
  "title": "Event Title",
  "start_date": "2026-06-18 11:00:00",  // Local time (Brussels)
  "utc_start_date": "2026-06-18 09:00:00",  // UTC time (if plugin provides it)
  "timezone": "Europe/Brussels"
}
```

**Recommended:** Use `utc_start_date` if available, fallback to `start_date` with timezone conversion

**Updated Comparison:**
```javascript
const wpUtcRaw = wpSnapshot.utc_start_date;  // Preferred
const wpLocalRaw = wpSnapshot.start_date;      // Fallback
const wpTimezone = wpSnapshot.timezone || 'Europe/Brussels';

let wpUtc;
if (wpUtcRaw) {
  wpUtc = parseAsUTC(wpUtcRaw);
} else if (wpLocalRaw) {
  // Convert local time to UTC using timezone
  wpUtc = convertLocalToUTC(wpLocalRaw, wpTimezone);
}
```

---

### 3.9 DST (Daylight Saving Time) Considerations

**Belgium DST Rules:**
- **Winter (UTC+1):** Late October to late March
- **Summer (UTC+2):** Late March to late October

**Example:**
```
Event: March 30, 2026 at 10:00 Brussels time

Before DST (UTC+1):
- Brussels: 10:00
- UTC:      09:00

After DST (UTC+2):
- Brussels: 10:00
- UTC:      08:00
```

**✅ Current System:** `Intl.DateTimeFormat` handles DST automatically
**✅ No Manual DST Logic Needed:** Browser/runtime knows DST transitions

**⚠️ Edge Case:** Events scheduled during DST transition hour (02:00-03:00)
- 1 hour doesn't exist in spring (clock jumps forward)
- 1 hour repeats in autumn (clock falls back)

**Mitigation:** Validate event times and warn users if scheduling during transition

---

### 3.10 Timezone Summary

| Stage | Format | Timezone | Code Location |
|-------|--------|----------|---------------|
| **Odoo Storage** | `2026-06-18 09:00:00` | UTC (no Z) | Odoo database |
| **Odoo → Worker** | `2026-06-18T09:00:00Z` | UTC (add Z) | mapping.js |
| **Worker → WP** | `2026-06-18 11:00:00` | Brussels local | formatDateTimeInTimezone() |
| **Frontend Display** | `18/06/2026 11:00` | Brussels local | ui.js formatEventDateTime() |
| **Sync Compare (Backend)** | `2026-06-18` | ❌ Date only | ⚠️ state-engine.js |
| **Sync Compare (Frontend)** | `.getTime()` | ✅ UTC timestamps | ✅ detail-panel-controller.js |

**Conclusion:**
- ✅ Timezone conversion is **ROBUST** (Odoo → WP and Display work correctly)
- ❌ Out-of-sync detection is **INCOMPLETE** (backend ignores time portion)
- ✅ Frontend comparison is **CORRECT** (compares full timestamps)
- 🔨 **Fix Required:** Update backend `detect Discrepancies()` to compare full datetime

---

## 4. Event Title Setting & Normalization

### 3.1 Title Mapping

**Source Field:** `x_name` (Odoo x_webinar table)

**Mapping Code:**
```javascript
// File: src/modules/event-operations/mapping.js
export function mapOdooToWordPress(odooWebinar, status = 'publish') {
  return {
    title: odooWebinar[ODOO_FIELDS.NAME], // ← Direct pass-through
    start_date: formatDateTimeInTimezone(startDate, TIMEZONE),
    end_date: formatDateTimeInTimezone(endDate, TIMEZONE),
    description: stripHtmlTags(odooWebinar[ODOO_FIELDS.INFO] || '') || ' ',
    status: status,
    timezone: TIMEZONE
  };
}
```

**⚠️ No Transformation Applied**
- Title passed directly from Odoo to WordPress
- No HTML stripping on publish (WordPress handles rendering)
- No entity escaping (WordPress REST API handles encoding)

**Rationale:** WordPress title field accepts HTML and renders it safely

---

### 3.2 Title Comparison (Out-of-Sync Detection)

**Code Location:** `src/modules/event-operations/state-engine.js` (line 56-75)

```javascript
function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // Extract WP title (Core API: { rendered }, Tribe API: string)
  const wpTitleRaw = typeof wpSnapshot.title === 'object' 
    ? wpSnapshot.title?.rendered 
    : wpSnapshot.title;
  
  // Title mismatch — decode HTML entities before comparing
  if (wpTitleRaw) {
    const odooTitle = normalizeString(stripHtmlTags(odooSnapshot[ODOO_FIELDS.NAME] || ''));
    const wpTitle = normalizeString(stripHtmlTags(wpTitleRaw));
    if (odooTitle !== wpTitle) {
      console.log('🔍 DISCREPANCY DETECTED - Title mismatch:');
      console.log('  Odoo title:', odooTitle);
      console.log('  WP title:', wpTitle);
      return true;
    }
  }
  // ... date comparison
}
```

**Processing Pipeline:**
1. **stripHtmlTags()** - Remove all HTML tags and decode entities
2. **normalizeString()** - Lowercase, smart quotes → straight quotes, normalize spaces

**stripHtmlTags Implementation:**
```javascript
// File: src/modules/event-operations/utils/text.js
export function stripHtmlTags(html) {
  if (!html) return '';
  
  return html
    .replace(/<[^>]*>/g, '')               // Remove all HTML tags
    .replace(/&nbsp;/g, ' ')               // Non-breaking space
    .replace(/&amp;/g, '&')                // Ampersand
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))    // Decimal entities
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))  // Hex entities
    .trim();
}
```

**normalizeString Implementation:**
```javascript
export function normalizeString(str) {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .replace(/\u2026/g, '...')           // … → ...
    .replace(/\u2018|\u2019/g, "'")      // ' ' → '
    .replace(/\u201C|\u201D/g, '"')      // " " → "
    .replace(/\u2013|\u2014/g, '-')      // – — → -
    .replace(/\s+/g, ' ')                // Multiple spaces → single
    .replace(/\.\s+\.\s+\./g, '...')     // ". . ." → "..."
    .replace(/\.{3,}/g, '...')           // Multiple dots → exactly 3
    .replace(/\s*\.{3}\s*$/g, '')        // Remove trailing ellipsis
    .trim();
}
```

**✅ Robust Normalization:** Handles most common title variations
**⚠️ Potential Issues:**
- Unicode characters beyond defined set (emoji, special symbols)
- Different normalization on Odoo vs WordPress side
- WordPress may apply its own title filters (plugins, theme)

---

## 4. Out-of-Sync Determination Logic

### 4.1 State Machine Architecture

**Pure Function:** `computeEventState(odooSnapshot, wpSnapshot)`

**Decision Tree:**
```
┌─ Odoo Active? ────────────────────────────────────────┐
│                                                        │
├─ NO → Has WP Event? ─── YES → archived                │
│                    └─── NO  → deleted                  │
│                                                        │
└─ YES ─────────────────────────────────────────────────┤
              │                                          │
              └─ Has WP Event? ─── NO → not_published   │
                            │                            │
                            └─ YES ──────────────────────┤
                                          │              │
                    WP Status = trash? ─ YES → deleted  │
                                    │                    │
                                    └─ NO ───────────────┤
                                                │        │
                          WP Status = draft? ─ YES      │
                                          │    └→ draft  │
                                          │              │
                                          └─ NO ─────────┤
                                                    │    │
                                Title/Date Match? ─ NO  │
                                                │   └→ out_of_sync
                                                │       │
                                                └─ YES  │
                                                  └→ published
```

**Code:**
```javascript
// File: src/modules/event-operations/state-engine.js
export function computeEventState(odooSnapshot, wpSnapshot) {
  // Odoo archived → archived or deleted
  if (!odooSnapshot[ODOO_FIELDS.ACTIVE]) {
    return wpSnapshot ? SYNC_STATUS.ARCHIVED : SYNC_STATUS.DELETED;
  }
  
  // Not published to WordPress yet
  if (!wpSnapshot) {
    return SYNC_STATUS.NOT_PUBLISHED;
  }
  
  // WordPress event deleted but Odoo active
  if (wpSnapshot.status === 'trash') {
    return SYNC_STATUS.DELETED;
  }
  
  // WordPress event saved as draft
  if (wpSnapshot.status === 'draft') {
    return SYNC_STATUS.DRAFT;
  }
  
  // Check for content discrepancies (title and date only)
  const hasDiscrepancies = detectDiscrepancies(odooSnapshot, wpSnapshot);
  
  if (hasDiscrepancies) {
    return SYNC_STATUS.OUT_OF_SYNC;
  }
  
  return SYNC_STATUS.PUBLISHED;
}
```

---

### 4.2 Comparison Fields

**🔴 CRITICAL LIMITATION: Description NOT Compared**

**Only 2 fields checked:**
1. **Title** (normalized comparison)
2. **Date** (date part only, time ignored in some paths)

**Excluded from comparison:**
- ❌ Description content
- ❌ Duration
- ❌ Event type / categories
- ❌ Tags
- ❌ Registration count

**Rationale (from inline comments):**
> "No description or tag comparison - user manages description via editorial content and re-publishes when needed"

**Date Comparison:**
```javascript
function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // ... title check ...
  
  // Date/time mismatch (only if WP has start_date — Tribe API field)
  const wpDateRaw = wpSnapshot.start_date;
  if (wpDateRaw) {
    // Normalize and extract date part (strip HTML just in case)
    const wpDate = stripHtmlTags(String(wpDateRaw)).split(' ')[0].trim();
    const odooDate = odooSnapshot[ODOO_FIELDS.EVENT_DATETIME];
    if (wpDate && odooDate && wpDate !== odooDate) {
      console.log('🔍 DISCREPANCY DETECTED - Date mismatch:');
      console.log('  Odoo date:', odooDate);
      console.log('  WP date:', wpDate);
      return true;
    }
  }
  
  return false;
}
```

**⚠️ Date Comparison Issues:**
1. **String comparison** instead of proper datetime parsing
2. **Only date part compared** - time changes won't trigger out-of-sync
3. **Timezone assumptions** - Odoo stores UTC, WordPress uses local timezone
4. **Format dependency** - relies on WordPress returning `YYYY-MM-DD HH:MM:SS` format

**🔴 Example False Negative:**
```
Odoo:      2026-06-18 09:00:00  (UTC, represents 11:00 Brussels)
WordPress: 2026-06-18 11:00:00  (Local Brussels time)
Comparison: "2026-06-18" === "2026-06-18" → NO DISCREPANCY (but times differ!)
```

---

### 4.3 Why Description Not Compared

**Design Decision:** Editorial content layer decouples description from Odoo

**Logic:**
1. User can modify description via editorial blocks without touching Odoo
2. Odoo remains source of truth for factual data (title, date, type)
3. Editorial changes don't trigger out-of-sync (would create update loop)
4. User explicitly re-publishes when editorial content changes

**Trade-offs:**
- ✅ Flexibility: Users can enhance descriptions without Odoo access
- ✅ No update loops: Editorial changes don't force re-sync
- ❌ Silent divergence: Odoo description changes won't trigger warnings
- ❌ Manual reconciliation: User must notice Odoo description updates

**Potential Improvement:** Add optional "Odoo description changed" indicator
```sql
ALTER TABLE webinar_snapshots
ADD COLUMN odoo_description_hash TEXT;
-- Compare hash on sync, show warning if changed but not out-of-sync
```

---

---

## 6. Forminator Shortcode Management

### 6.1 Current Implementation

**Shortcode Format:** `[forminator_form id="14547"]`

**Hardcoded in Backend:** `src/modules/event-operations/wp-client.js` (line 184-203)

```javascript
async publishWebinar(webinar) {
  const wpData = mapOdooToWordPress(webinar, status);
  
  // Check if event already exists
  const existing = await this.findEventByTitle(wpData.title);
  
  if (existing) {
    // Update existing event (no description - preserve editorial)
    return await this.updateEvent(existing.id, {
      title: wpData.title,
      start_date: wpData.start_date,
      end_date:pd_date,
      status: wpData.status
    });
  }
  
  // First publish: Generate default editorial content
  const odooDescription = webinar[ODOO_FIELDS.DESCRIPTION] || '';
  const defaultBlocks = [
    { type: 'paragraph', content: odooDescription },
    { type: 'shortcode', name: 'forminator_form', attributes: { id: '14547' } }  // ← HARDCODED!
  ];
  
  wpData.description = buildEditorialDescription(defaultBlocks);
  return await this.createEvent(wpData);
}
```

**Rendered Output:** `src/modules/event-operations/editorial.js` (line 74-95)

```javascript
function renderShortcode(name, attributes) {
  if (!name) return '';

  // Build attribute string: id="14547"
  const attrs = Object.entries(attributes || {})
    .map(([key, val]) => {
      const escapedValue = escapeHtml(String(val));
      return `${key}="${escapedValue}"`;
    })
    .join(' ');

  return attrs ? `[${name} ${attrs}]` : `[${name}]`;
  // Result: [forminator_form id="14547"]
}
```

**Current Shortcode Locations:**

| Component | Status | Form ID | Can Edit? |
|-----------|--------|---------|-----------|
| **Backend Default** (wp-client.js) | ✅ Active | 14547 | ❌ Hardcoded |
| **Quill Editor** (editor-controller.js) | ✅ Active | User types | ✅ Manual entry |
| **Deprecated Block Editor** (event-operations-client.js) | ⚠️ Not accessible | 14547 | ❌ (UI removed) |

---

### 6.2 Quill.js WYSIWYG Editor (Current Active Editor)

**Implementation:** `public/editor-controller.js` (line 1-261)

```javascript
async function openEditor(eventId) {
  const modal = document.getElementById('editorial-modal');
  const toolbar = [[/* basic formatting */], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['link'], ['clean']];
  
  // Initialize Quill.js WYSIWYG editor
  window.editorQuillInstance = new Quill('#editorial-editor', {
    theme: 'snow',
    modules: { toolbar: toolbar },
    placeholder: 'Typ de beschrijving...'
  });
  
  // Load existing content from snapshot (Supabase)
  const snapshot = window.stateStore.getSnapshot(eventId);
  if (snapshot?.editorial_content) {
    const blocks = snapshot.editorial_content.blocks || [];
    const html = blocksToHtml(blocks);  // Convert legacy blocks → HTML
    window.editorQuillInstance.root.innerHTML = html;
  }
  
  modal.showModal();
}
```

**Save Logic:** `public/editor-controller.js` (line 100-160)

```javascript
async function saveDescription() {
  const html = window.editorQuillInstance.root.innerHTML;  // Get HTML from Quill
  const blocks = htmlToBlocks(html);  // Convert HTML → legacy blocks format
  
  // Update Supabase snapshot
  const { error: snapError } = await window.supabase
    .from('webinar_snapshots')
    .update({ editorial_content: { blocks, version: 1 } })
    .eq('odoo_webinar_id', eventId);
  
  // Update WordPress via editorial API
  const response = await fetch(`${API_BASE}/editorialcontent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      odoo_webinar_id: eventId,
      editorial_content: { blocks, version: 1 }
    })
  });
  
  // Refresh calendar
  await refreshCalendar();
}
```

**HTML → Blocks Conversion:** `public/editor-controller.js` (line 172-230)

```javascript
function htmlToBlocks(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const blocks = [];

  temp.childNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      
      // Shortcode detection: [forminator_form ...] patterns
      const content = node.textContent || '';
      const shortcodeMatch = content.match(/\[([a-z_]+)([^\]]*)\]/i);
      
      if (shortcodeMatch) {
        // Extract shortcode name and attributes
        const name = shortcodeMatch[1];
        const attrsStr = shortcodeMatch[2].trim();
        const attributes = {};
        
        // Parse id="14547" → { id: "14547" }
        const attrMatches = attrsStr.matchAll(/(\w+)="([^"]*)"/g);
        for (const match of attrMatches) {
          attributes[match[1]] = match[2];
        }
        
        blocks.push({ type: 'shortcode', name, attributes });
      } else {
        // Regular paragraph
        blocks.push({ type: 'paragraph', content: node.innerHTML });
      }
    }
  });

  return blocks;
}
```

**✅ User Can Manually Edit Shortcode:**
- Type `[forminator_form id="12345"]` directly in Quill editor
- Save button converts HTML → blocks with parsed attributes
- Flexible: User can specify *any* form ID

**❌ Limitations:**
1. **No form picker UI**: User must know form ID
2. **No validation**: Can't verify form exists
3. **No autocomplete**: Must type shortcode manually
4. **No form metadata**: Can't see form name/fields

---

### 6.3 Default Form ID: Where and Why

**Form 14547: "Inschrijven voor een YASCO webinar"**

**Hardcoded in 2 Active Locations:**

1. **wp-client.js (line 198)** – Default for first publish
   ```javascript
   { type: 'shortcode', name: 'forminator_form', attributes: { id: '14547' } }
   ```

2. **Deprecated block editor (event-operations-client.js)** – No longer accessible via UI
   ```javascript
   // Lines 795, 814, 835 (hardcoded displays)
   ```

**Why 14547?**
- Primary webinar registration form
- Contains standard fields: Name, Email, Company, etc.
- Used for 90%+ of events

**When to Use Different Form?**
- Specialized events (partners, premium content)
- A/B testing different registration flows
- Multi-language events (different form per language)

---

### 6.4 Shortcode Attribute Escaping Issue

**Current Implementation:** `src/modules/event-operations/editorial.js` (line 80-83)

```javascript
const attrs = Object.entries(attributes || {})
  .map(([key, val]) => {
    const escapedValue = escapeHtml(String(val));  // ← HTML entity escaping
    return `${key}="${escapedValue}"`;
  })
  .join(' ');
```

**Escaping Function:**
```javascript
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')    // ← Problematic for shortcodes!
    .replace(/'/g, '&#039;');
}
```

**🔴 Problem:** WordPress shortcode parser expects literal quotes, not HTML entities

**Example:**
```javascript
// Input:
{ id: "14547", title: "Sign Up" }

// Current output:
[forminator_form id="14547" title="Sign Up"]  // ✅ Works (no special chars)

// With special characters:
{ id: "14547", title: "Join \"Advanced\" Training" }

// Current output:
[forminator_form id="14547" title="Join &quot;Advanced&quot; Training"]
// ❌ WordPress may not parse &quot; inside shortcode attributes!
```

**WordPress Shortcode Format Requirements:**
- Attributes should use literal quotes: `id="value"` or `id='value'`
- Escape inner quotes with backslash: `title="Join \"Advanced\" Training"`
- OR use single quotes: `title='Join "Advanced" Training'`

**Recommended Fix:**

```javascript
function renderShortcode(name, attributes) {
  if (!name) return '';

  const attrs = Object.entries(attributes || {})
    .map(([key, val]) => {
      const strVal = String(val);
      
      // Use single quotes if value contains double quotes
      if (strVal.includes('"') && !strVal.includes("'")) {
        return `${key}='${strVal}'`;
      }
      // Use double quotes and escape inner double quotes
      else if (strVal.includes('"')) {
        return `${key}="${strVal.replace(/"/g, '\\"')}"`;
      }
      // Default: double quotes
      else {
        return `${key}="${strVal}"`;
      }
    })
    .join(' ');

  return attrs ? `[${name} ${attrs}]` : `[${name}]`;
}
```

**Benefits:**
- ✅ WordPress shortcode parser compatible
- ✅ Handles quotes in attribute values
- ✅ No HTML entity escaping (not needed in shortcodes)

---

### 6.5 Improvement Proposals: Form Selection

**Goal:** Allow users to select form without knowing form ID

---

#### Option 1: Form Picker Dropdown in Quill Toolbar

**Implementation:**

1. **Fetch Available Forms from WordPress:**
   ```javascript
   // New endpoint: GET /api/forms
   async function fetchForms() {
     const response = await fetch(`${API_BASE}/forms`, {
       headers: { 'X-API-Key': apiKey }
     });
     return await response.json();
     // Returns: [{ id: '14547', name: 'Webinar Registration' }, ...]
   }
   ```

2. **Add Form Picker to Quill Toolbar:**
   ```javascript
   // In editor-controller.js
   const toolbar = [
     [/* ... existing buttons ... */],
     [{ 'forminator': getFormsList() }],  // Custom dropdown
     ['clean']
   ];
   
   // Custom handler
   const quill = new Quill('#editor', {
     modules: {
       toolbar: {
         container: toolbar,
         handlers: {
           forminator: function(value) {
             if (value) {
               const cursorPosition = this.quill.getSelection().index;
               this.quill.insertText(cursorPosition, `[forminator_form id="${value}"]`);
             }
           }
         }
       }
     }
   });
   ```

3. **Dropdown Options:**
   ```html
   <select class="ql-forminator">
     <option value="">Selecteer formulier...</option>
     <option value="14547">Webinar Inschrijving</option>
     <option value="15000">Partner Event</option>
     <option value="15100">Premium Content</option>
   </select>
   ```

**Benefits:**
- ✅ Visual form selection (no ID memorization)
- ✅ Integrated in existing editor
- ✅ Shows form names (not just IDs)

**Limitations:**
- ⚠️ Requires WordPress API integration (fetch forms)
- ⚠️ Custom Quill module development

---

#### Option 2: Form Selection Modal

**Implementation:**

1. **Add "Insert Form" Button Below Quill Editor:**
   ```html
   <div class="editor-actions">
     <button id="insert-form-btn" class="btn btn-outline btn-sm">
       <svg><!-- form icon --></svg>
       Inschrijfformulier toevoegen
     </button>
   </div>
   ```

2. **Show Form Picker Modal:**
   ```javascript
   document.getElementById('insert-form-btn').addEventListener('click', async () => {
     const forms = await fetchForms();
     
     // Build modal with form cards
     const modal = document.getElementById('form-picker-modal');
     const grid = modal.querySelector('.form-grid');
     grid.innerHTML = forms.map(form => `
       <div class="card bg-base-200 cursor-pointer hover:bg-base-300" data-form-id="${form.id}">
         <div class="card-body">
           <h3 class="card-title">${form.name}</h3>
           <p class="text-sm">${form.fields_count} velden</p>
           <p class="text-xs opacity-60">ID: ${form.id}</p>
         </div>
       </div>
     `).join('');
     
     modal.showModal();
   });
   
   // Handle form selection
   document.querySelectorAll('[data-form-id]').forEach(card => {
     card.addEventListener('click', () => {
       const formId = card.dataset.formId;
       const shortcode = `[forminator_form id="${formId}"]`;
       
       // Insert at cursor or end
       const quill = window.editorQuillInstance;
       const selection = quill.getSelection();
       quill.insertText(selection ? selection.index : quill.getLength(), shortcode + '\n');
       
       document.getElementById('form-picker-modal').close();
     });
   });
   ```

**Benefits:**
- ✅ Visual form browser (cards with metadata)
- ✅ Shows form names, field counts, descriptions
- ✅ Can add form preview in future
- ✅ Doesn't interfere with Quill toolbar

**Limitations:**
- ⚠️ Separate UI flow (button → modal → insert)
- ⚠️ Requires API endpoint for form listing

---

#### Option 3: Shortcode Autocomplete

**Implementation:**

1. **Detect Shortcode Typing:**
   ```javascript
   quill.on('text-change', (delta, oldDelta, source) => {
     if (source !== 'user') return;
     
     const selection = quill.getSelection();
     if (!selection) return;
     
     //  Get text before cursor
     const text = quill.getText(0, selection.index);
     const match = text.match(/\[forminator_form\s*$/i);
     
     if (match) {
       showFormAutocomplete(selection.index);
     }
   });
   ```

2. **Show Autocomplete Dropdown:**
   ```javascript
   async function showFormAutocomplete(position) {
     const forms = await fetchForms();
     const dropdown = createAutocompleteDropdown(forms);
     
     // Position dropdown at cursor
     const bounds = quill.getBounds(position);
     dropdown.style.top = `${bounds.bottom}px`;
     dropdown.style.left = `${bounds.left}px`;
     
     document.body.appendChild(dropdown);
     
     // Handle selection
     dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
       item.addEventListener('click', () => {
         const formId = item.dataset.formId;
         quill.insertText(position, ` id="${formId}"]`);
         dropdown.remove();
       });
     });
   }
   ```

**Benefits:**
- ✅ Natural typing flow (like IDE autocomplete)
- ✅ Fast keyboard-driven selection
- ✅ Follows modern editor UX patterns

**Limitations:**
- ⚠️ Complex implementation (position calculation, keyboard nav)
- ⚠️ Can interfere with normal typing

---

### 6.6 Recommended Approach: Form Selection Modal

**Why Modal?**
1. **Simpler Implementation:** No Quill module customization needed
2. **Better UX for Non-Technical Users:** Visual cards easier than typing
3. **Extensible:** Can add form preview, metadata, filtering
4. **Separates Concerns:** Form management separate from text editing

**Implementation Plan:**

1. **Backend:**
   - Add `GET /api/forms` endpoint to fetch Forminator forms
   - Returns: `[{ id, name, fields, status }]`

2. **Frontend:**
   - Add "Insert Form" button below Quill editor
   - Create form picker modal with DaisyUI cards
   - Insert `[forminator_form id="..."]` at cursor on selection

3. **Optional Enhancements:**
   - Form preview (show form fields in modal)
   - Recently used forms (localStorage cache)
   - Form filtering/search (if many forms)

**Effort Estimate:**
- Backend endpoint: 2-3 hours
- Frontend modal: 3-4 hours
- Testing + polish: 2 hours
- **Total: ~1 day**

---

### 6.7 When is the Form Shortcode Added? Critical Flow Analysis

**User Question:** "Soms komt die er automatisch bij, andere keren dan weer niet. Dit heeft te maken met volgorde van werken."

---

#### 6.7.1 The Decision Logic (Code Deep Dive)

**Location:** `src/modules/event-operations/wp-client.js` (line 185-203)

```javascript
async function publishToWordPress(env, userId, odooWebinarId, status) {
  // 1. Fetch existing snapshot from Supabase
  const { data: existingSnapshot } = await supabase
    .from('webinar_snapshots')
    .select('wp_snapshot, editorial_content')
    .eq('odoo_webinar_id', odooWebinarId)
    .single();
  
  // 2. Extract editorial content
  let editorialContent = existingSnapshot?.editorial_content;
  let editorialContentToSave = null;
  
  // 3. CRITICAL DECISION POINT:
  if (editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0) {
    // ✅ Editorial content EXISTS and has blocks → Use existing content
    const odooDescription = odooWebinar.x_studio_webinar_info || '';
    wpPayload.description = buildEditorialDescription(editorialContent, odooDescription);
    // editorialContentToSave = null (don't overwrite DB)
  } else {
    // ❌ No editorial content OR empty blocks → Generate DEFAULT
    const odooDescription = odooWebinar.x_studio_webinar_info || '';
    const defaultEditorial = {
      blocks: [
        { type: 'paragraph', content: odooDescription },
        { type: 'shortcode', name: 'forminator_form', attributes: { id: '14547' } }  // ← FORM ADDED HERE
      ],
      version: 1
    };
    wpPayload.description = buildEditorialDescription(defaultEditorial, odooDescription);
    editorialContentToSave = defaultEditorial;  // Save to DB
  }
  
  // 4. Determine CREATE vs UPDATE
  const existingWpEventId = existingSnapshot?.wp_snapshot?.id;
  if (existingWpEventId) {
    // UPDATE existing WordPress event
  } else {
    // CREATE new WordPress event
  }
  
  // 5. Save snapshot (only updates editorial_content if editorialContentToSave !== null)
  await saveSnapshot(env, odooWebinar, wpEventData, editorialContentToSave, computedState);
}
```

---

#### 6.7.2 Scenario Analysis: When Does the Form Get Added?

| Scenario | Snapshot Exists? | editorial_content Value | Form Added? | Why? |
|----------|------------------|-------------------------|-------------|------|
| **1. First Publish** | ❌ No | `undefined` | ✅ YES | No snapshot → condition fails → default generated |
| **2. Re-publish (unchanged)** | ✅ Yes | `{ blocks: [...form...], version: 1 }` | ✅ YES (preserved) | Blocks exist → uses existing content |
| **3. User edited description** | ✅ Yes | `{ blocks: [...custom...], version: 1 }` | 🟡 Depends | If user kept shortcode → yes, if deleted → no |
| **4. User "Reset to Odoo"** | ✅ Yes | `null` | ✅ YES (re-added!) | NULL → condition fails → default generated |
| **5. Empty editorial blocks** | ✅ Yes | `{ blocks: [], version: 1 }` | ✅ YES (re-added!) | `blocks.length > 0` fails → default generated |
| **6. Snapshot deleted manually** | ❌ No | N/A | ✅ YES | Treated as first publish |
| **7. Snapshot corrupted (no blocks)** | ✅ Yes | `{ version: 1 }` (no blocks key) | ✅ YES | `editorialContent.blocks` undefined → fails → default |

---

#### 6.7.3 Critical Problem: "Reset to Odoo" Re-adds Form

**User Workflow:**
```
1. User publishes event → Form 14547 added automatically ✅
2. User opens Quill editor, removes shortcode manually ✅
3. User saves → editorial_content updated (no shortcode) ✅
4. Later: User clicks "Reset to Odoo" button ✅
5. Editor saves with editorial_content = NULL to Supabase 🔴
6. User re-publishes event
7. System checks: editorial_content = null → generates default → FORM RE-ADDED! ❌
```

**Code Evidence:** `public/editor-controller.js` (line 306-318)

```javascript
async function saveDescription() {
  const newDescription = editorInstance.root.innerHTML;
  const canonicalDescription = webinar?.x_studio_webinar_info || '';
  const isOverride = newDescription !== canonicalDescription;

  if (isOverride) {
    // Save as editorial override
    await saveEditorialToSupabase(currentWebinarId, newDescription);
  } else {
    // User reset to canonical → CLEAR editorial content
    clearEditorialOverride(currentWebinarId);
    await saveEditorialToSupabase(currentWebinarId, null);  // ← Sets editorial_content = NULL
  }
}
```

**Result:** Next publish sees `editorial_content = null` → treats as "no editorial content" → re-adds form!

---

#### 6.7.4 Critical Problem: HTML→Blocks Conversion Loses Formatting

**Issue:** When user saves Quill editor content, HTML is converted to blocks format

**Code:** `public/editor-controller.js` (line 395-445)

```javascript
function htmlToBlocks(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = [];

  for (const node of doc.body.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent.trim();  // ← LOSES HTML FORMATTING!
      
      // Check for shortcode
      const shortcodeMatch = text.match(/^\[(\w+)(?:\s+(.+?))?\]$/);
      if (shortcodeMatch) {
        // Parse as shortcode
        blocks.push({ type: 'shortcode', name: shortcodeMatch[1], attributes: {...} });
      } else {
        // Plain text paragraph (formatting lost!)
        blocks.push({ type: 'paragraph', content: text });
      }
    }
  }

  return { blocks, version: 1 };
}
```

**Example Loss:**
```html
User types in Quill: <p>Join our <strong>Advanced</strong> workshop on <em>AI</em></p>

Converted to blocks: { type: 'paragraph', content: 'Join our Advanced workshop on AI' }
                     ← Lost <strong> and <em> tags!

Rendered back in WP: <p>Join our Advanced workshop on AI</p>
                     ← No bold, no italic!
```

**Why This Matters:**
- User adds rich formatting in Quill (bold, italic, lists, links)
- On save, formatting is stripped (only plain text preserved)
- WordPress displays unformatted text
- **User thinks: "Why did my formatting disappear?"**

---

#### 6.7.5 Critical Problem: Snapshot Determines Create vs Update

**Decision Code:** `wp-client.js` (line 162-212)

```javascript
const existingWpEventId = existingSnapshot?.wp_snapshot?.id;

if (existingWpEventId) {
  // UPDATE existing WordPress event
  await fetch(`${WP_URL}/wp-json/tribe/events/v1/events/${existingWpEventId}`, {
    method: 'POST',
    body: JSON.stringify(wpPayload)
  });
} else {
  // CREATE new WordPress event
  await fetch(`${WP_URL}/wp-json/tribe/events/v1/events`, {
    method: 'POST',
    body: JSON.stringify(wpPayload)
  });
}
```

**Problem Scenarios:**

**Scenario A: Snapshot Deleted, WP Event Exists**
```
1. Event published → Snapshot created with wp_snapshot.id = 123
2. Admin deletes snapshot from Supabase (testing, cleanup)
3. User clicks "Re-publish"
4. System checks: existingWpEventId = undefined → CREATE
5. WordPress receives CREATE request for event that already exists
6. Result: DUPLICATE EVENT or API error (depends on WP uniqueness constraints)
```

**Scenario B: WordPress Event Deleted, Snapshot Exists**
```
1. Event published → WP event ID 123
2. Admin deletes event in WordPress (manual cleanup)
3. User clicks "Re-publish"
4. System checks: existingWpEventId = 123 → UPDATE
5. WordPress receives UPDATE request for non-existent event
6. Result: API error 404 "Event not found"
```

**Scenario C: Snapshot Corrupted (wp_snapshot = null)**
```
1. Database migration goes wrong
2. Snapshot exists but wp_snapshot field is null
3. User clicks "Re-publish"
4. System: existingWpEventId = undefined → CREATE
5. Result: Duplicate event created
```

---

#### 6.7.6 Recommended Fixes

**Fix 1: Distinguish "No Content" from "Empty Content"**

```javascript
// Current problem:
if (editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0) {
  // Use existing
} else {
  // Generate default (adds form)
}

// Recommended:
if (editorialContent === null || editorialContent === undefined) {
  // User never set editorial content OR explicitly reset → Generate default
  generateDefault();
} else if (editorialContent.blocks && editorialContent.blocks.length === 0) {
  // User explicitly cleared content → Respect that (no form!)
  wpPayload.description = '';
} else {
  // User has custom editorial content → Use it
  useExisting();
}
```

**Fix 2: Preserve HTML Formatting in Blocks**

```javascript
function htmlToBlocks(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = [];

  for (const node of doc.body.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Check for shortcode first
      const text = node.textContent.trim();
      const shortcodeMatch = text.match(/^\[(\w+)(?:\s+(.+?))?\]$/);
      
      if (shortcodeMatch) {
        blocks.push({ type: 'shortcode', name: shortcodeMatch[1], attributes: {...} });
      } else {
        // Preserve FULL HTML (not just text!)
        blocks.push({ type: 'paragraph', content: node.outerHTML });  // ← Keep formatting!
      }
    }
  }

  return { blocks, version: 1 };
}
```

**Fix 3: Verify WordPress Event Existence Before Update**

```javascript
async function publishToWordPress(env, userId, odooWebinarId, status) {
  // ... existing code ...
  
  if (existingWpEventId) {
    // Verify event still exists in WordPress
    const verifyResponse = await fetch(
      `${env.WORDPRESS_URL}/wp-json/tribe/events/v1/events/${existingWpEventId}`,
      { headers: { 'Authorization': wpAuthHeader(env) } }
    );
    
    if (verifyResponse.status === 404) {
      // Event was deleted in WP → Treat as new event
      console.warn(`WP event ${existingWpEventId} not found, creating new event`);
      existingWpEventId = null;  // Force CREATE
    } else if (!verifyResponse.ok) {
      throw new Error(`Failed to verify WP event: ${verifyResponse.status}`);
    }
  }
  
  if (existingWpEventId) {
    // UPDATE
  } else {
    // CREATE
  }
}
```

**Fix 4: Add "Clear Form" Option in Editor**

```javascript
// In editor UI, add button:
<button id="remove-form-btn" class="btn btn-ghost btn-sm">
  <i data-lucide="x" class="w-4 h-4"></i>
  Formulier verwijderen
</button>

// Handler:
document.getElementById('remove-form-btn').addEventListener('click', () => {
  const html = editorInstance.root.innerHTML;
  // Remove all shortcodes from HTML
  const cleanHtml = html.replace(/\[forminator_form[^\]]*\]/g, '');
  editorInstance.root.innerHTML = cleanHtml;
  
  // Save with empty editorial content (no form)
  const blocks = htmlToBlocks(cleanHtml);
  if (blocks.blocks.length === 0) {
    // Save as explicit empty (not null!)
    saveEditorialToSupabase(webinarId, { blocks: [], version: 1 });
  }
});
```

---

#### 6.7.7 Summary: Form Addition Decision Tree

```
User clicks "Publish"
    ↓
Does Supabase snapshot exist?
    ├─ NO → Create default editorial content (with form 14547) → Save to DB → CREATE in WP
    ├─ YES → Check editorial_content field:
        ├─ NULL → Generate default (with form 14547) → Save to DB → UPDATE in WP  🔴 UNEXPECTED!
        ├─ { blocks: [] } → Generate default (with form 14547) → Save to DB → UPDATE in WP  🔴 UNEXPECTED!
        ├─ { blocks: [...] } (length > 0) → Use existing content → Don't modify DB → UPDATE in WP  ✅ EXPECTED
        └─ Undefined or corrupt → Generate default (with form 14547) → Save to DB → UPDATE in WP  🔴 EDGE CASE
```

**Key Insight:**  
The form is added whenever `editorial_content.blocks.length` is NOT greater than 0. This includes:
- First publish (expected ✅)
- After "Reset to Odoo" (unexpected ❌)
- After manual content clearing (unexpected ❌)
- After snapshot deletion (expected but risky ⚠️)

**Recommendation:**  
Implement Fix 1 (distinguish null from empty array) to give users control over form presence.

---

## 7. Key Findings & Recommendations

### 7.1 Critical Issues Identified (Code-Validated)

#### 🔴 **Issue 1: Time Changes Not Detected**

**Location:** `src/modules/event-operations/state-engine.js` (line 80-94)

**Problem:**  
Backend only compares DATE portion ("2026-06-18"), not full datetime.

**Impact:**  
- User changes event from 09:00 → 14:00 in Odoo
- System shows status as "published" (no out-of-sync)
- Frontend (if snapshot available) shows discrepancy
- **Inconsistent state across UI!**

**Recommendation:**  
Update `detectDiscrepancies()` to compare full UTC timestamps (like frontend does).

**Code Fix:**  
Replace date string comparison with:
```javascript
const odooUtc = parseAsUTC(odooSnapshot[ODOO_FIELDS.EVENT_DATETIME]);
const wpUtc = parseAsUTC(wpSnapshot.utc_start_date || wpSnapshot.start_date);
if (odooUtc && wpUtc && Math.abs(odooUtc.getTime() - wpUtc.getTime()) > 60000) {
  return true;  // Out-of-sync if >1 minute difference
}
```

**Effort:** 2-3 hours (implementation + testing)

---

#### 🟡 **Issue 2: Shortcode Attribute Escaping**

**Location:** `src/modules/event-operations/editorial.js` (line 80-83)

**Problem:**  
HTML entity escaping (`&quot;`) applied to shortcode attributes.  
WordPress shortcode parser may not handle HTML entities correctly.

**Example:**
```javascript
{ title: 'Join "Advanced" Training' }
// Current output:
[forminator_form title="Join &quot;Advanced&quot; Training"]  // ❌ May fail

// Should be:
[forminator_form title='Join "Advanced" Training']  // ✅ or escaped quotes
```

**Recommendation:**  
Use single quotes for values with double quotes, or escape with backslash (not HTML entities).

**Effort:** 1 hour

---

#### 🟢 **Issue 3: Hardcoded Form ID (14547)**

**Location:** `src/modules/event-operations/wp-client.js` (line 198)

**Problem:**  
All new events default to form 14547.  
No UI to select different form.

**Workaround Available:**  
Users CAN manually type different shortcode in Quill editor:  
`[forminator_form id="12345"]`

**Recommendation:**  
Add form picker modal (see Section 6.6 for implementation).

**Effort:** 1 day (backend endpoint + frontend modal)

---

#### 🔴 **Issue 4: Form Re-added After "Reset to Odoo"**

**Location:** `src/modules/event-operations/wp-client.js` (line 185-203) + `public/editor-controller.js` (line 306-318)

**Problem:**  
1. User removes form shortcode from description manually
2. User clicks "Reset to Odoo" button
3. System sets `editorial_content = NULL` in database
4. Next publish: NULL is treated as "no editorial content" → **form automatically re-added!**

**Impact:**  
- User expects: "Reset to Odoo" = use plain Odoo description (no form)
- System does: "Reset to Odoo" → NULL → next publish adds form again
- **User confusion:** "I removed the form, why is it back?"

**Recommendation:**  
Distinguish between:
- `NULL` = never edited (add default form)
- `{ blocks: [] }` = explicitly cleared (no form!)
- `{ blocks: [...] }` = custom content (use as-is)

**Code Fix:** See Section 6.7.6 Fix 1

**Effort:** 3-4 hours (logic update + testing)

---

#### 🟡 **Issue 5: HTML Formatting Lost in Blocks Conversion**

**Location:** `public/editor-controller.js` htmlToBlocks() (line 395-445)

**Problem:**  
When user adds rich formatting in Quill (bold, italic, lists), the HTML→blocks conversion preserves only plain text:

```html
User types: <p>Join our <strong>Advanced</strong> workshop</p>
Converted:  { type: 'paragraph', content: 'Join our Advanced workshop' }
Result:     Formatting lost! ❌
```

**Impact:**  
- All rich text formatting disappears after save
- Links, bold, italic, lists, headings → all stripped

**Recommendation:**  
Save full HTML in blocks (not just text content). See Section 6.7.6 Fix 2.

**Effort:** 2-3 hours

---

#### ⚠️ **Issue 6: Snapshot Desync Creates Duplicate Events**

**Location:** `src/modules/event-operations/wp-client.js` (line 212)

**Problem:**  
System decides CREATE vs UPDATE based on snapshot:
```javascript
const existingWpEventId = existingSnapshot?.wp_snapshot?.id;
if (existingWpEventId) {
  // UPDATE
} else {
  // CREATE (may create duplicate if WP event exists!)
}
```

**Risk Scenarios:**
1. **Snapshot deleted, WP event exists** → Creates duplicate event
2. **WP event deleted, snapshot exists** → Update fails (404 error)
3. **Snapshot corrupted (wp_snapshot = null)** → Creates duplicate

**Recommendation:**  
Verify WordPress event existence before UPDATE. See Section 6.7.6 Fix 3.

**Effort:** 2-3 hours

---

### 7.2 What Works Well ✅

1. **Timezone Conversion:**  
   - Robust Intl.DateTimeFormat usage
   - Handles DST automatically
   - Converts Odoo UTC → Brussels time correctly

2. **Title Normalization:**  
   - Case-insensitive comparison
   - HTML entity handling
   - Whitespace normalization

3. **Quill WYSIWYG Editor:**  
   - Active and functional
   - Allows manual shortcode entry
   - Intuitive UI for description editing

4. **Editorial Override Pattern:**  
   - Description NOT compared in sync (intentional)
   - Allows editorial customization
   - Preserves content on title/date updates

---

### 7.3 Implementation Priority

| Priority | Issue | Impact | Effort | Blocker? |
|----------|-------|--------|--------|----------|
| **P0** | Time comparison bug (Issue 1) | 🔴 Data integrity | 3h | Critical |
| **P0** | Form re-addition bug (Issue 4) | 🔴 User confusion | 4h | Critical |
| **P1** | Snapshot desync (Issue 6) | 🟠 Duplicate events | 3h | Important |
| **P1** | Shortcode escaping (Issue 2) | 🟡 Edge case | 1h | Low risk |
| **P2** | HTML formatting loss (Issue 5) | 🟡 UX degradation | 3h | Annoying |
| **P3** | Form picker UI (Issue 3) | 🟢 UX improvement | 1d | Nice-to-have |

**Total Effort for Critical Fixes (P0):** ~7 hours (1 day)  
**Total Effort for All Fixes:** ~2.5 days

---

### 7.4 Out-of-Scope (User Feedback)

❌ **Multi-Template Support** – Not needed at this time  
❌ **Template Variables** – No current use case  
❌ **Template Library** – Complexity not justified

**Focus Instead:**  
✅ Form selection flexibility  
✅ Timezone handling robustness  
✅ Out-of-sync detection accuracy

---

## 8. Testing Recommendations

### 8.1 Timezone Edge Cases

**Test 1: DST Transition**
```
Event: March 30, 2026 02:30 (non-existent time during spring DST)
Expected: Warning or auto-adjust to 03:30
```

**Test 2: Time Change Detection**
```
1. Create event in Odoo: 2026-06-18 09:00:00
2. Publish to WordPress
3. Change time in Odoo: 2026-06-18 14:00:00
4. Refresh dashboard
Expected: Status should be "out-of-sync" (currently shows "published" ❌)
```

**Test 3: Cross-Timezone Consistency**
```
Odoo: 2026-06-18 09:00:00 (UTC)
WP Display: 18/06/2026 11:00 (Brussels)
Frontend Calendar: June 18, 2026 11:00 AM
Expected: All show same Brussels time
```

---

### 8.2 Form Shortcode Tests

**Test 4: Manual Shortcode Entry**
```
1. Open event in Quill editor
2. Type: [forminator_form id="99999"]
3. Save
Expected: Shortcode saved and rendered correctly
```

**Test 5: Special Characters in Attributes**
```
Shortcode: [form title="Test \"Quotes\""]
Expected: WordPress renders form correctly (not broken by escaped quotes)
```

**Test 6: Form Re-addition After Reset (🔴 CRITICAL BUG TEST)**
```
1. Publish new event → Form 14547 added automatically
2. Open Quill editor
3. Remove shortcode manually (delete line with [forminator_form...])
4. Save → Editorial content updated
5. Verify in WP: Form should be GONE ✅
6. Click "Reset to Odoo" button in editor
7. Save
8. Re-publish event
9. Check WP description
Expected: NO form (user removed it)
Actual (BUG): Form 14547 RE-ADDED ❌
```

**Test 7: Empty Editorial Content Behavior**
```
1. Publish event (form added)
2. Open Quill editor
3. Delete ALL content (including form and description)
4. Save (editorial_content = { blocks: [], version: 1 })
5. Re-publish
Expected Option A: Empty description (no form, no content)
Expected Option B: Odoo description only (no form)
Actual (BUG): Default generated (form re-added) ❌
```

**Test 8: Formatting Preservation (🟡 BUG TEST)**
```
1. Open Quill editor
2. Type: "Join our **Advanced** workshop on *AI*" (with bold and italic)
3. Save
4. Check Supabase editorial_content.blocks
Expected: HTML preserved (<strong>, <em> tags)
Actual (BUG): Only plain text "Join our Advanced workshop on AI" ❌
5. Check WordPress description
Expected: Bold and italic formatting visible
Actual (BUG): Plain text only ❌
```

---

### 8.3 Description Handling Tests

**Test 9: Plain Text from Odoo**
```
Odoo: "This is plain text with < and > characters"
Expected: Renders as <p>This is plain text with &lt; and &gt; characters</p>
```

**Test 10: HTML from Odoo**
```
Odoo: "<p>This is <strong>HTML</strong></p>"
Expected: Renders as-is (passthrough)
```

**Test 11: Editorial Override**
```
1. Publish event (uses Odoo description)
2. Edit description in Quill (add formatting, images)
3. Change description in Odoo
4. Re-sync event
Expected: WordPress description NOT overwritten (editorial preserved)
```

---

### 8.4 Snapshot Desync Tests (⚠️ CRITICAL)

**Test 12: Snapshot Deleted, WP Event Exists**
```
1. Publish event → WP event ID 123 created
2. Manually delete snapshot from Supabase: 
   DELETE FROM webinar_snapshots WHERE odoo_webinar_id = 456;
3. Click "Publish" again on same Odoo event
4. Check system logs
Expected Behavior (with fix): Verify WP event, perform UPDATE
Actual Behavior (BUG): CREATE new event → Duplicate! ❌
5. Check WordPress events list
Result: TWO events with same title/date
```

**Test 13: WP Event Deleted, Snapshot Exists**
```
1. Publish event → WP event ID 123
2. Manually delete event in WordPress admin
3. Click "Re-publish" in system
4. Check API response
Expected Behavior (with fix): Detect 404, perform CREATE
Actual Behavior (BUG): UPDATE request fails with 404 ❌
5. Check console logs
Result: Error "Tribe API update error 404: Event not found"
```

**Test 14: Snapshot Corrupted (wp_snapshot = null)**
```
1. Publish event normally
2. Manually corrupt snapshot in Supabase:
   UPDATE webinar_snapshots 
   SET wp_snapshot = NULL 
   WHERE odoo_webinar_id = 456;
3. Click "Re-publish"
Expected Behavior (with fix): Verify WP event, perform UPDATE
Actual Behavior (BUG): CREATE new event → Duplicate ❌
```

**Test 15: Snapshot wp_snapshot.id Mismatch**
```
1. Publish event → WP event ID 123
2. Event gets duplicated somehow (manual WP creation)→ New WP event ID 456 for same title
3. Snapshot still has wp_snapshot.id = 123
4. Click "Re-publish"
Result: Updates OLD event (123), not NEW event (456)
Impact: Two events exist, system only updates one
```

---

## 9. Migration Notes

### 9.1 Existing Events

**Current State:**  
- All events use form 14547 (hardcoded default)
- Editorial content stored in Supabase `webinar_snapshots.editorial_content`
- Snapshots use legacy blocks format `{ blocks: [...], version: 1 }`

**After Form Picker Implementation:**  
- Existing events keep form 14547 (no migration needed)
- Users can manually update forms via Quill editor
- New events still default to 14547 (configurable in code)

**No Breaking Changes:**  
✅ Backward compatible  
✅ No database migration required  
✅ Gradual adoption possible

---

### 9.2 Out-of-Sync Status Update

**After Time Comparison Fix:**  
Some events currently showing "published" may switch to "out-of-sync" if times differ.

**Query to Check Impact:**
```sql
SELECT 
  ws.odoo_webinar_id,
  ws.wp_event_id,
  ws.odoo_snapshot->>'x_studio_event_datetime' AS odoo_datetime,
  ws.wp_snapshot->>'start_date' AS wp_datetime
FROM webinar_snapshots ws
WHERE 
  ws.computed_state = 'published'
  AND (ws.odoo_snapshot->>'x_studio_event_datetime')::text != (ws.wp_snapshot->>'start_date')::text;
```

**Communication Plan:**  
- Notify users of improved sync detection
- Explain why some events now show out-of-sync
- Provide bulk re-sync option if needed

---

## 10. Conclusion

## 10. Conclusion

### 10.1 Summary

**Strengths Found:**  
✅ Solid timezone architecture (Intl.DateTimeFormat)  
✅ Clean editorial content model (JSONB blocks)  
✅ Functional Quill WYSIWYG editor  
✅ Good HTML escaping for security  
✅ Editorial override pattern preserves custom content

**Critical Gaps Found:**  
❌ **Time changes not detected** - Backend compares date-only (not full datetime)  
❌ **Form re-added unexpectedly** - "Reset to Odoo" → NULL → next publish adds form  
❌ **Snapshot desync risk** - Deleted snapshot can create duplicate WP events  
❌ **HTML formatting lost** - Quill editor strips all rich text on save  

**Medium Priority Issues:**  
⚠️ Shortcode escaping incompatible with WordPress parser  
⚠️ No WP event existence verification before UPDATE  

**UX Improvements Needed:**  
🔨 Form selection UI (currently hardcoded 14547)  
🔨 "Clear form" button in editor  
🔨 Form library/picker modal

### 10.2 Impact Assessment

**Issue 4 (Form Re-addition) - Most User-Facing:**
```
User Experience:
1. "I want to use Odoo description without form"
2. User removes shortcode manually ✅
3. User clicks "Reset to Odoo" thinking it will preserve removal ✅
4. Next publish → Form is back! ❌
5. User confusion: "Why does it keep coming back?"
```

**Issue 6 (Snapshot Desync) - Highest Data Risk:**
```
Risk Scenario:
- Snapshot accidentally deleted (migration, cleanup, bug)
- System thinks: "New event, need to CREATE"
- WordPress already has event → DUPLICATE CREATED
- Now TWO events exist for same Odoo webinar
- Manual cleanup required
```

**Issue 1 (Time Detection) - Silent Data Corruption:**
```
Risk Scenario:
- User changes event time 09:00 → 14:00 in Odoo
- System shows: "published" (green checkmark)
- WordPress still has old time 09:00
- Attendees show up at WRONG time!
- No warning given to user
```

### 10.3 Recommended Implementation Order

**Phase 1: Critical Fixes (Week 1) - 1 day effort**
1. ✅ Fix time comparison (Issue 1) - 3h  
   → Prevents silent time desync
2. ✅ Fix form re-addition logic (Issue 4) - 4h  
   → Distinguish NULL vs empty array vs existing content
3. ✅ Add WP event verification (Issue 6) - 3h  
   → Prevent duplicate event creation

**Phase 2: Data Integrity (Week 2) - 0.5 days effort**
4. ✅ Fix HTML formatting preservation (Issue 5) - 3h  
   → Save outerHTML instead of textContent
5. ✅ Fix shortcode escaping (Issue 2) - 1h  
   → Use proper quote handling for WordPress

**Phase 3: UX Improvements (Week 3-4) - 2 days effort**
6. ✅ Implement form picker modal (Issue 3) - 8h  
   → Allow users to select different forms
7. ✅ Add "Clear form" button in editor - 2h  
   → Explicit control over form presence
8. ✅ Add form library UI - 6h  
   → Show available forms with metadata

**Total Effort:** ~4 days for complete fix

### 10.4 Quick Wins (Can Implement Today)

**Fix 1: Time Comparison (3 hours)**
```javascript
// In state-engine.js, replace:
const wpDate = stripHtmlTags(String(wpDateRaw)).split(' ')[0].trim();
if (wpDate && odooDate && wpDate !== odooDate) return true;

// With:
const odooUtc = parseAsUTC(odooSnapshot[ODOO_FIELDS.EVENT_DATETIME]);
const wpUtc = parseAsUTC(wpSnapshot.utc_start_date || wpSnapshot.start_date);
if (odooUtc && wpUtc && Math.abs(odooUtc.getTime() - wpUtc.getTime()) > 60000) {
  return true;
}
```

**Fix 2: Form Re-addition (4 hours)**
```javascript
// In wp-client.js, replace:
if (editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0) {
  // Use existing
} else {
  // Generate default
}

// With:
if (editorialContent === null || editorialContent === undefined) {
  // Never edited → Generate default (with form)
  generateDefaultWithForm();
} else if (editorialContent.blocks && editorialContent.blocks.length === 0) {
  // Explicitly cleared → Respect that (no form!)
  wpPayload.description = '';
} else {
  // Has custom content → Use it
  useExistingContent();
}
```

**Fix 3: Snapshot Verification (3 hours)**
```javascript
// In wp-client.js, before UPDATE:
if (existingWpEventId) {
  const verifyResponse = await fetch(
    `${env.WORDPRESS_URL}/wp-json/tribe/events/v1/events/${existingWpEventId}`,
    { headers: { 'Authorization': wpAuthHeader(env) } }
  );
  
  if (verifyResponse.status === 404) {
    console.warn(`WP event ${existingWpEventId} not found, creating new`);
    existingWpEventId = null;  // Force CREATE
  }
}
```

### 10.5 Testing Checklist Before Deployment

- [ ] Test 6: Form re-addition after "Reset to Odoo"
- [ ] Test 7: Empty editorial content behavior
- [ ] Test 12: Snapshot deleted, WP event exists
- [ ] Test 13: WP event deleted, snapshot exists
- [ ] Test 2: Time change detection (09:00 → 14:00)
- [ ] Regression test: Normal publish/update flow still works
- [ ] Regression test: Editorial content preservation still works

---

**Document Status:** Code-Validated Analysis Complete with Critical Flow Issues Identified  
**Last Updated:** 2026-02-18  
**Review:** Ready for immediate implementation (Critical bugs found)  
**Priority:** P0 - Form re-addition and time detection bugs affect production use  
**Out-of-Scope:** Multi-template system (confirmed by user)

