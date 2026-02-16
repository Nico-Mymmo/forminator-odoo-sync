# ADDENDUM E – IMPLEMENTATION LOG

**Module:** Event Operations  
**Addendum:** E – Configurable Calendar Colors & Editable Mappings  
**Implementation Date:** February 16, 2026  
**Status:** ✅ COMPLETE  
**Depends on:** Addendum C (Event Type Mapping), Addendum D Phase 8 (Calendar Workspace)

---

## 1. IMPLEMENTATION SUMMARY

**Objective:** Replace hardcoded event-type-to-color keyword matching with user-configurable colors stored in the mapping database. Allow editing of existing mappings.

**Before (Addendum D):**
- Calendar card colors were determined by keyword matching on the event type name (`webinar` → primary, `infosessie` → info, `workshop` → accent, etc.)
- No way for users to change colors without code changes
- Existing mappings could only be created or deleted — not edited

**After (Addendum E):**
- Each event type mapping stores a `calendar_color` token in the database
- Users pick from 14 predefined DaisyUI colors (7 base × 2 variants: normal + soft)
- Calendar reads color from `appState.mappings` at render time
- Existing mappings can be edited inline via an Edit button per row
- Mapping changes trigger immediate calendar refresh (no page reload needed)

---

## 2. SCOPE

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Add `calendar_color` column to `event_type_wp_tag_mapping` | ✅ |
| 2 | Color dropdown in mapping modal (14 predefined colors) | ✅ |
| 3 | Color swatch preview in mapping table rows | ✅ |
| 4 | Backend route accepts + persists `calendar_color` | ✅ |
| 5 | Calendar reads color from mappings instead of keyword matching | ✅ |
| 6 | Edit button per mapping row (populate form, update via upsert) | ✅ |
| 7 | Cancel edit mode (reset form) | ✅ |
| 8 | Calendar auto-refreshes on mapping save/delete | ✅ |

---

## 3. FILES CHANGED

### 3.1 New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260214000000_event_type_mapping_calendar_color.sql` | `ALTER TABLE` — adds `calendar_color TEXT NOT NULL DEFAULT 'primary'` |

### 3.2 Modified Files

| File | Changes |
|------|---------|
| `src/modules/event-operations/tag-mapping.js` | Upsert payload includes `calendar_color` |
| `src/modules/event-operations/routes.js` | PUT route destructures + forwards `calendar_color` |
| `src/modules/event-operations/ui.js` | Color dropdown (`#calendarColorSelect`), Color column in table header, form title `#mappingFormTitle`, Cancel button `#btnCancelEditMapping`, `mappings-changed` event listener |
| `public/event-operations-client.js` | `getCalendarColorPreview()`, color swatch in table rows, Edit/Cancel/Save edit mode, `editEventTypeMapping()`, `cancelEditMapping()`, `saveEventTypeMapping()` sends `calendar_color`, dispatches `mappings-changed` event |
| `public/calendar-controller.js` | `getEventTypeColors()` rewritten: reads `calendar_color` from `appState.mappings` by `odoo_event_type_id` lookup. New `resolveColorToken()` maps tokens to oklch CSS values |

### 3.3 Files Unchanged

✅ **Confirmed no changes to:**
- `src/modules/event-operations/state-engine.js`
- `src/modules/event-operations/odoo-client.js`
- `src/modules/event-operations/wp-client.js`
- `public/state-store.js`
- `public/detail-panel-controller.js`
- `public/editor-controller.js`

---

## 4. DATABASE SCHEMA CHANGE

### 4.1 Migration

```sql
ALTER TABLE event_type_wp_tag_mapping
  ADD COLUMN calendar_color TEXT NOT NULL DEFAULT 'primary';
```

### 4.2 Updated Table Schema

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID NOT NULL | RLS scoped |
| `odoo_event_type_id` | INTEGER NOT NULL | Odoo many2one ID |
| `wp_tag_id` | INTEGER NOT NULL | WordPress tag ID |
| `wp_tag_slug` | TEXT NOT NULL | Snapshot for display |
| `wp_tag_name` | TEXT NOT NULL | Snapshot for display |
| `calendar_color` | TEXT NOT NULL DEFAULT 'primary' | **NEW** — DaisyUI color token |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | trigger-maintained |

---

## 5. COLOR PALETTE

### 5.1 Available Tokens

| Token | Emoji | CSS Variable | Opacity (card bg) |
|-------|-------|-------------|-------------------|
| `primary` | 🔵 | `--p` | 0.15 |
| `primary-soft` | 🔵 | `--p` | 0.08 |
| `secondary` | 🟣 | `--s` | 0.15 |
| `secondary-soft` | 🟣 | `--s` | 0.08 |
| `accent` | 🟠 | `--a` | 0.15 |
| `accent-soft` | 🟠 | `--a` | 0.08 |
| `info` | 🔷 | `--in` | 0.15 |
| `info-soft` | 🔷 | `--in` | 0.08 |
| `success` | 🟢 | `--su` | 0.15 |
| `success-soft` | 🟢 | `--su` | 0.08 |
| `warning` | 🟡 | `--wa` | 0.15 |
| `warning-soft` | 🟡 | `--wa` | 0.08 |
| `neutral` | ⚪ | `--n` | 0.15 |
| `neutral-soft` | ⚪ | `--n` | 0.08 |

### 5.2 Resolution Logic (`resolveColorToken`)

```javascript
function resolveColorToken(token) {
  const isSoft = token.endsWith('-soft');
  const baseToken = isSoft ? token.replace('-soft', '') : token;
  const cssVar = cssVarMap[baseToken] || '--n';
  const opacity = isSoft ? 0.08 : 0.15;
  return {
    bg: `oklch(var(${cssVar}) / ${opacity})`,
    text: 'oklch(var(--bc))'
  };
}
```

### 5.3 Fallback Behavior

- Event type **with mapping** → uses `mapping.calendar_color`
- Event type **without mapping** → falls back to `neutral` (grey)
- Events without event type → falls back to `neutral`

---

## 6. EDIT MAPPING FLOW

### 6.1 User Flow

1. User clicks **Edit** button on a mapping row
2. Form header changes from "New Mapping" → "Edit Mapping"
3. Odoo Event Type dropdown is pre-selected and **disabled** (locked)
4. WP Tag dropdown is pre-selected with current value
5. Color dropdown is pre-selected with current value
6. Save button text changes to "Update", Cancel button appears
7. On Save → upsert (same `odoo_event_type_id`), form resets, calendar refreshes
8. On Cancel → form resets, dropdown restored

### 6.2 Technical Implementation

- **Edit entry point:** `editEventTypeMapping(mapping, eventTypeName)` — called from Edit button `onclick`
- **Form population:** Inserts the mapped event type as an option (normally filtered out), selects it, disables the select
- **Save reuse:** `saveEventTypeMapping()` unchanged — PUT upsert on `(user_id, odoo_event_type_id)` handles both create and update
- **Cancel:** `cancelEditMapping()` — re-enables dropdown, resets values, calls `loadEventTypeMappings()` to restore filtered state
- **Auto-reset:** After successful save, edit mode is reset automatically

---

## 7. CALENDAR REFRESH ON MAPPING CHANGE

### 7.1 Event Bridge (Legacy → ES Module)

The mapping modal lives in `event-operations-client.js` (legacy script), while the calendar is managed by `calendar-controller.js` (ES module). Communication uses a custom DOM event:

```
saveEventTypeMapping()  ──→  window.dispatchEvent('mappings-changed')
deleteEventTypeMapping() ──→  window.dispatchEvent('mappings-changed')
                                        │
                                        ▼
                              ui.js bootstrap listener
                                        │
                              fetch /api/event-type-tag-mappings
                              setMappings(data)
                              refreshCalendar()
```

### 7.2 Refresh Behavior

- `setMappings()` updates `appState.mappings` in the state store
- `refreshCalendar()` calls `transformToCalendarEvents()` which calls `getEventTypeColors()` per event
- `getEventTypeColors()` reads the updated `appState.mappings` → new colors applied instantly

---

## 8. API CHANGES

### PUT `/events/api/event-type-tag-mappings`

**Updated request body:**

```json
{
  "odoo_event_type_id": 3,
  "wp_tag_id": 42,
  "wp_tag_slug": "webinar",
  "wp_tag_name": "Webinar",
  "calendar_color": "primary"
}
```

- `calendar_color` is optional — defaults to `"primary"` if omitted
- Existing callers without `calendar_color` continue to work (backward compatible)

---

## 9. BREAKING CHANGES

**None.** All changes are additive:
- New column has `DEFAULT 'primary'` — existing rows auto-populate
- PUT route accepts optional new field — backward compatible
- Calendar falls back to `neutral` for unmapped event types
- Edit functionality is purely additive UI

---

## 10. VALIDATION

- ✅ All modified files pass syntax/diagnostic checks (zero errors)
- ✅ Migration applied via `supabase db push` (exit code 0)
- ✅ Backward compatible — no breaking changes to existing API consumers

### Manual Checklist

- [ ] Create new mapping with non-default color → verify calendar card uses selected color
- [ ] Edit existing mapping color → verify calendar updates on save
- [ ] Delete mapping → verify calendar falls back to neutral
- [ ] Verify soft vs normal opacity difference is visually distinguishable
- [ ] Verify edit mode locks event type dropdown
- [ ] Verify cancel edit restores form to "New Mapping" state

---

## 11. SYNC COMPARISON MODAL (Ctrl+Click)

**Date:** February 16, 2026

### 11.1 Problem

Users had no way to inspect **why** an event was marked "Out of Sync". The status badge showed the state but not the underlying field mismatches.

### 11.2 Solution

Ctrl+Click (or Cmd+Click on macOS) on the **status badge** in the detail panel opens a comparison modal that shows a field-by-field diff between the Odoo source and the WordPress snapshot.

### 11.3 Comparison Fields

| Field | Odoo Source | WordPress Source | Match Check |
|-------|------------|-----------------|-------------|
| Titel | `x_name` | `wp_snapshot.title` | ✓/✗ (entity-decoded) |
| Startdatum | `x_studio_event_datetime` (date part) | `wp_snapshot.start_date` (date part) | ✓/✗ |
| Starttijd | `x_studio_event_datetime` (time part) | `wp_snapshot.start_date` (time part) | ✓/✗ |
| Duur | `x_studio_event_duration_minutes` | `wp_snapshot.duration` | Informational |
| WP Status | `x_active` → Active/Archived | `wp_snapshot.status` | Informational |
| Computed State | — | `snapshot.computed_state` | Informational |
| WP Post ID | — | `wp_snapshot.id` | Informational |
| Laatste sync | — | `snapshot.last_synced_at` | Informational |

Mismatched fields are highlighted with a red ✗ and a `bg-warning/10` row tint.

### 11.4 Files Changed

| File | Changes |
|------|---------|
| `src/modules/event-operations/ui.js` | Added `<dialog id="syncComparisonModal">` with table layout |
| `public/detail-panel-controller.js` | Added `showSyncComparison()` renderer, Ctrl+Click handler in `bindEventDelegation()`, `data-action="compare-sync"` on status badges, cursor-help + tooltip |

### 11.5 UX Details

- **Status badges** for `out_of_sync`, `published`, `draft` show `title="Ctrl+Click om versies te vergelijken"` and `cursor-help`
- Badges for `not_published` and `archived` have no compare action (nothing to compare)
- Modal title shows event name + current state badge
- Snapshot metadata footer shows Event Type, Odoo ID, WP ID

---

## 12. HTML ENTITY DECODE BUGFIX

**Date:** February 16, 2026

### 12.1 Problem

WordPress stores `&` as `&#038;` in titles. The frontend `checkDiscrepancy()` compared raw strings without decoding, causing false positive "Out of Sync" for titles containing `&`:

```
Odoo:      Q&A Butterfly Solutions x OpenVME
WordPress: Q&#038;A Butterfly Solutions x OpenVME
Result:    ✗ false positive mismatch
```

The **backend** `state-engine.js` already handled this correctly via `stripHtmlTags()` which includes `&#(\d+);` decoding. The bug was frontend-only.

### 12.2 Fix

Added `decodeEntities()` helper to both frontend files:

```javascript
function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
```

### 12.3 Files Changed

| File | Change |
|------|--------|
| `public/calendar-controller.js` | Added `decodeEntities()`, `checkDiscrepancy()` uses it for title comparison |
| `public/detail-panel-controller.js` | Added `decodeEntities()`, `checkDiscrepancy()` + `showSyncComparison()` use it for title comparison |

### 12.4 Scope

- Three comparison points fixed: calendar `checkDiscrepancy`, detail panel `checkDiscrepancy`, comparison modal match indicator
- Backend `state-engine.js` was already correct — no changes needed

---

## 13. CALENDAR VISUAL REFINEMENTS (Theme + Layout Stability)

**Date:** February 16, 2026

### 13.1 Problem

- FullCalendar weekday header remained white in non-light DaisyUI themes
- Calendar grid corners did not fully follow the active DaisyUI radius styling
- Month height could visually shift when event density changed between months
- Past days and out-of-month day cells were not visually distinct enough

### 13.2 Solution

- Applied DaisyUI surface tokens to calendar header row (`--b2`) and weekday labels
- Added rounded corners to the calendar scrollgrid using `--rounded-box`
- Stabilized month view layout with:
  - `height: 640`
  - `fixedWeekCount: true`
  - `dayMaxEvents: 2` (overflow via `+more`, no row growth from event count)
- Added day-state styling:
  - `fc-day-past` (subtle muted background + muted date number)
  - `fc-day-other` (lightly tinted to distinguish days outside current month)

### 13.3 Files Changed

| File | Changes |
|------|---------|
| `src/modules/event-operations/ui.js` | Updated FullCalendar CSS integration: themed weekday header, calendar radius, stable day-event area sizing, past-day and other-month styling |
| `public/calendar-controller.js` | Updated FullCalendar config: fixed height, fixed 6-week grid, capped day event rows |

### 13.4 Notes

- Changes are visual/UX only; no backend or schema impact
- Existing event color token behavior from Addendum E remains unchanged

---

## 14. CALENDAR-FIRST DEFAULT VIEW (No persisted view restore)

**Date:** February 16, 2026

### 14.1 Problem

On page reload, UI briefly rendered table view before switching to calendar based on persisted view mode. This created a visual jump and made table feel like the primary workspace.

### 14.2 Solution

- Removed persisted view restore for `eventOpsViewMode` (no `localStorage` read/write for defaulting)
- Set calendar as the hard default on every load (`initView()` always calls `switchView('calendar')`)
- Kept table as optional/manual navigation via the existing view toggle

### 14.3 Files Changed

| File | Changes |
|------|---------|
| `src/modules/event-operations/ui.js` | View toggle default set to Calendar, removed persisted view-mode dependency, introduced in-memory `activeView` tracking for runtime refresh/tab behavior |

### 14.4 Reload UX Refinement

- `filterTabs` now starts hidden by default (no brief table-filter flash on reload)
- Added calendar-specific loading placeholder (`#calendarLoadingState`) in the calendar card
- Loading state is rendered as an overlay while `#fullcalendar` remains layout-visible for correct FullCalendar sizing
- Disabled generic page spinner (`#loadingState`) for calendar-view data loads to prevent vertical layout jumps
- Overlay uses DaisyUI-native loading + skeleton components and theme surface/border tokens
- Removed loading-only frame/border around the calendar area to match non-loading visual container
- Kept status legend visible in calendar-first default during loading to prevent header-area reflow/jump
- Result: reload remains visually calendar-first, with a smooth loading state in the correct workspace area
