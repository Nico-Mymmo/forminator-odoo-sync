# PHASE 8 – CALENDAR WORKSPACE IMPLEMENTATION PLAN

**Module:** Event Operations  
**Phase:** 8 – Calendar Workspace Interface  
**Base Implementation:** Phase 0-7 + Addendum A + B + C  
**Date:** February 13, 2026  
**Status:** Planning Phase  

---

## 1. FILE CHANGE OVERVIEW

### 1.1 Files to CREATE

| File Path | Purpose | Lines (est.) |
|-----------|---------|--------------|
| None | Phase 8 is UI-only refactor | N/A |

### 1.2 Files to MODIFY

| File Path | Change Type | Impact | Lines Changed (est.) |
|-----------|-------------|--------|----------------------|
| `src/modules/event-operations/ui.js` | **MAJOR** | Replace 3-column card grid with 8/4 calendar workspace layout | ~150 |
| `public/event-operations-client.js` | **MAJOR** | Replace `renderWebinarCard()` grid logic with FullCalendar integration | ~300 |
| `public/event-operations-client.js` | **MINOR** | Add detail panel rendering functions | ~100 |
| `public/event-operations-client.js` | **MINOR** | Add status legend component | ~30 |

**Total Estimated Changes:** ~580 lines across 2 files

### 1.3 Files UNCHANGED (Strict Constraint)

| File Path | Reason |
|-----------|--------|
| `src/modules/event-operations/routes.js` | Phase 8 does NOT add new API routes |
| `src/modules/event-operations/state-engine.js` | State computation logic unchanged |
| `src/modules/event-operations/odoo-client.js` | No Odoo read/write changes in Phase 8 |
| `src/modules/event-operations/wp-client.js` | No WordPress integration changes |
| `src/modules/event-operations/tag-mapping.js` | Event type mapping unchanged |
| All Supabase migrations | Phase 8 is UI-only, no schema changes |

---

## 2. DEPENDENCY LIST

### 2.1 New External Dependencies

| Dependency | Version | License | CDN URL | Purpose | Fallback Strategy |
|------------|---------|---------|---------|---------|-------------------|
| **FullCalendar Core** | 6.1.10 | MIT | `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js` | Calendar framework | Local bundle fallback |
| **FullCalendar DayGrid** | 6.1.10 | MIT | (included in core) | Month view plugin | N/A (bundled) |
| **FullCalendar TimeGrid** | 6.1.10 | MIT | (included in core) | Week/day view plugin | N/A (bundled) |
| **FullCalendar CSS** | 6.1.10 | MIT | `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css` | Calendar styles | Inline critical CSS |

### 2.2 Existing Dependencies (Already Used)

| Dependency | Current Version | Use in Phase 8 |
|------------|-----------------|----------------|
| DaisyUI | 4.12.14 | Detail panel components, action buttons |
| Tailwind CSS | Latest (CDN) | Layout grid (8/4 split), responsive breakpoints |
| Lucide Icons | Latest | Calendar icon, refresh icon, external-link icon |

### 2.3 Dependency Loading Strategy

**Primary Strategy:** CDN with integrity hash

```html
<link 
  href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css" 
  rel="stylesheet"
  integrity="sha384-[HASH]"
  crossorigin="anonymous"
/>
<script 
  src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"
  integrity="sha384-[HASH]"
  crossorigin="anonymous"
></script>
```

**Fallback Strategy (if CDN fails):**

1. Inline critical CSS (calendar grid structure only)
2. Graceful degradation to table view (existing fallback already implemented)
3. Show warning toast: "Calendar view unavailable, using table view"

**Rationale for CDN vs Bundle:**
- FullCalendar is 85KB minified (acceptable CDN size)
- No build step required (maintains vanilla JS architecture)
- JSDelivr has 99.9% uptime SLA
- Browser caching across deployments
- No npm dependency in Cloudflare Workers project

### 2.4 Dependency Audit

**Security Check:**
- MIT License ✅ (compatible with commercial use)
- No telemetry/analytics ✅
- No external API calls ✅
- No GitHub copilot training ✅

**Performance Impact:**
- Initial load: +85KB JS + 12KB CSS (acceptable)
- Parse time: ~50ms on mid-range device
- Render time for 100 events: <500ms (measured in FullCalendar benchmarks)

---

## 3. MIGRATION PLAN

### 3.1 Database Changes

**Phase 8 requires NO database migrations.**

| Change | Required? | Reason |
|--------|-----------|--------|
| Schema modifications | ❌ | UI-only refactor |
| RLS policy updates | ❌ | No new data access patterns |
| Index additions | ❌ | No new query patterns |

### 3.2 Configuration Changes

**No environment variable changes required.**

| Variable | Change | Required? |
|----------|--------|-----------|
| `SUPABASE_URL` | None | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | None | ❌ |
| `ODOO_*` | None | ❌ |
| `WP_*` | None | ❌ |

### 3.3 Data Migration

**No data migration or seeding required.**

Phase 8 uses existing `webinar_snapshots` table data unchanged.

---

## 4. EXECUTION ORDER (Step-by-Step)

### 4.1 Pre-Implementation Checks

**Critical validations BEFORE writing code:**

- [ ] **Verify FullCalendar CDN accessibility**
  - Command: `curl -I https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js`
  - Expected: HTTP 200
  - If fails: Abort, network policy issue

- [ ] **Verify current `/api/events` route returns valid data**
  - Command: Test in dev environment
  - Expected: Array of webinar_snapshots with `computed_state`
  - If fails: Abort, routes.js issue

- [ ] **Verify existing card grid renders correctly**
  - Action: Load Event Operations UI in browser
  - Expected: 3-column card layout visible
  - If fails: Baseline state corrupted, restore from git

- [ ] **Backup current state**
  - Command: `git checkout -b addendum-d-phase-8-backup`
  - Expected: New branch created
  - Rationale: Easy rollback point

### 4.2 Implementation Sequence

**Execute in this exact order:**

#### STEP 1: Modify `ui.js` – HTML Shell Layout (30 min)

**File:** `src/modules/event-operations/ui.js`

**Changes:**
1. Replace 3-column card container `<div id="webinarCardsContainer">` with:
   ```html
   <div class="workspace-grid">
     <div class="calendar-container">
       <div id="fullcalendar"></div>
     </div>
     <div class="detail-panel">
       <div id="panel-empty-state">Select an event...</div>
       <div id="panel-content" style="display:none;"></div>
     </div>
   </div>
   ```

2. Add FullCalendar CDN script/CSS in `<head>` section

3. Add Tailwind grid classes for 8/4 layout:
   ```javascript
   .workspace-grid { @apply grid grid-cols-12 gap-6; }
   .calendar-container { @apply col-span-8; }
   .detail-panel { @apply col-span-4 bg-base-100 rounded-lg shadow-xl p-6; }
   ```

4. Add status legend in header:
   ```html
   <div class="status-legend flex gap-2 text-xs">
     <span class="badge badge-warning">Out of Sync</span>
     <span class="badge badge-success">Published</span>
     <span class="badge badge-neutral">Draft</span>
     <span class="badge badge-ghost">Not Published</span>
     <span class="badge badge-info">Archived</span>
   </div>
   ```

**Validation:**
- [ ] HTML renders without console errors
- [ ] Grid layout displays correctly (8/4 split visible)
- [ ] Empty state message visible in detail panel
- [ ] Status legend visible in header

---

#### STEP 2: Modify `event-operations-client.js` – FullCalendar Integration (90 min)

**File:** `public/event-operations-client.js`

**Changes:**

1. **Remove existing card rendering logic**
   - Delete `renderWebinarCard()` function (~100 lines)
   - Delete `renderWebinarCards()` grid rendering loop
   - **KEEP** existing API fetch logic (`loadWebinars()`, `loadSnapshots()`)

2. **Add FullCalendar initialization**
   ```javascript
   function initializeCalendar(webinars, snapshots, registrationCounts) {
     const calendar = new FullCalendar.Calendar(document.getElementById('fullcalendar'), {
       initialView: 'dayGridMonth',
       headerToolbar: {
         left: 'prev,next today',
         center: 'title',
         right: 'dayGridMonth,timeGridWeek,timeGridDay'
       },
       events: transformToCalendarEvents(webinars, snapshots, registrationCounts),
       eventClick: handleEventClick
     });
     calendar.render();
   }
   ```

3. **Add data transformation function**
   ```javascript
   function transformToCalendarEvents(webinars, snapshots, registrationCounts) {
     return webinars.map(webinar => {
       const snapshot = snapshots.find(s => s.odoo_webinar_id === webinar.id);
       const state = snapshot ? snapshot.computed_state : 'not_published';
       const colors = getStatusColors(state);
       
       return {
         id: `webinar_${webinar.id}`,
         title: webinar.x_name || 'Untitled Event',
         start: webinar.x_studio_event_datetime,
         end: calculateEndTime(webinar.x_studio_event_datetime, webinar.x_studio_event_duration_minutes),
         backgroundColor: colors.bg,
         borderColor: colors.border,
         extendedProps: {
           computed_state: state,
           odoo_webinar_id: webinar.id,
           registration_count: registrationCounts[webinar.id] || 0,
           webinar: webinar,
           snapshot: snapshot
         }
       };
     });
   }
   ```

4. **Add status color mapping function**
   ```javascript
   function getStatusColors(state) {
     const colorMap = {
       'out_of_sync': { bg: '#f59e0b', border: '#d97706' }, // amber-500, amber-600
       'published': { bg: '#10b981', border: '#059669' },   // emerald-500, emerald-600
       'draft': { bg: '#6b7280', border: '#4b5563' },       // gray-500, gray-600
       'not_published': { bg: '#3b82f6', border: '#2563eb' }, // blue-500, blue-600
       'archived': { bg: '#9ca3af', border: '#6b7280' }     // gray-400, gray-500
     };
     return colorMap[state] || colorMap.not_published;
   }
   ```

5. **Add end time calculation helper**
   ```javascript
   function calculateEndTime(startISO, durationMinutes) {
     if (!startISO || !durationMinutes) return startISO;
     const start = new Date(startISO);
     const end = new Date(start.getTime() + durationMinutes * 60000);
     return end.toISOString();
   }
   ```

6. **Add event click handler**
   ```javascript
   function handleEventClick(info) {
     info.jsEvent.preventDefault();
     const { webinar, snapshot, computed_state, registration_count } = info.event.extendedProps;
     updateDetailPanel(webinar, snapshot, computed_state, registration_count);
   }
   ```

**Validation:**
- [ ] Calendar renders with month view as default
- [ ] Events display with correct colors per status
- [ ] View toggle buttons switch between month/week/day
- [ ] Event click handler fires (check console log)

---

#### STEP 3: Modify `event-operations-client.js` – Detail Panel Rendering (60 min)

**File:** `public/event-operations-client.js`

**Changes:**

1. **Add detail panel update function**
   ```javascript
   function updateDetailPanel(webinar, snapshot, state, regCount) {
     const emptyState = document.getElementById('panel-empty-state');
     const panelContent = document.getElementById('panel-content');
     
     emptyState.style.display = 'none';
     panelContent.style.display = 'block';
     
     panelContent.innerHTML = renderDetailPanelContent(webinar, snapshot, state, regCount);
     lucide.createIcons(); // Re-initialize Lucide icons
   }
   ```

2. **Add detail panel HTML renderer**
   ```javascript
   function renderDetailPanelContent(webinar, snapshot, state, regCount) {
     const badge = STATUS_BADGES[state] || STATUS_BADGES.not_published;
     const wpId = snapshot?.wp_snapshot?.id;
     const isArchived = !webinar.x_studio_active;
     
     const eventTypeId = Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 0
       ? webinar.x_webinar_event_type_id[0]
       : null;
     const hasMapping = eventTypeId && hasEventTypeMapping(eventTypeId); // Check cached mappings
     
     return `
       <div class="space-y-4">
         <div class="border-b border-base-200 pb-4">
           <h2 class="text-xl font-bold mb-2">${escapeHtml(webinar.x_name || 'Untitled')}</h2>
           <span class="badge ${badge.css} badge-sm">${badge.label}</span>
         </div>
         
         <div class="space-y-2 text-sm">
           ${renderMetaRow('calendar', 'Datum', formatDate(webinar.x_studio_event_datetime))}
           ${renderMetaRow('clock', 'Tijd', formatTime(webinar.x_studio_event_datetime))}
           ${renderMetaRow('users', 'Registraties', regCount.toString())}
           ${renderMetaRow('tag', 'Event Type', getEventTypeName(webinar))}
           ${wpId ? renderMetaRow('external-link', 'WordPress', `<a href="https://openvme.be/wp-admin/post.php?post=${wpId}&action=edit" target="_blank" class="link link-primary">WP #${wpId}</a>`) : ''}
         </div>
         
         <div class="space-y-2 pt-4 border-t border-base-200">
           <button 
             class="btn btn-sm btn-outline btn-primary w-full"
             ${isArchived ? 'disabled title="Event is archived"' : ''}
             onclick="openDescriptionEditor(${webinar.id})"
           >
             <i data-lucide="edit" class="w-4 h-4"></i> Edit Description
           </button>
           
           <button 
             class="btn btn-sm btn-outline btn-success w-full"
             ${isArchived || !hasMapping ? 'disabled title="' + (isArchived ? 'Event is archived' : 'No event type mapping') + '"' : ''}
             onclick="publishWebinar(${webinar.id})"
           >
             <i data-lucide="send" class="w-4 h-4"></i> Publish to WordPress
           </button>
         </div>
       </div>
     `;
   }
   ```

3. **Add helper functions**
   ```javascript
   function renderMetaRow(icon, label, value) {
     return `
       <div class="flex items-center gap-2">
         <i data-lucide="${icon}" class="w-4 h-4 text-base-content/60"></i>
         <span class="text-base-content/60">${label}:</span>
         <span class="font-medium">${value}</span>
       </div>
     `;
   }
   
   function getEventTypeName(webinar) {
     if (Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1) {
       return escapeHtml(webinar.x_webinar_event_type_id[1]);
     }
     return '—';
   }
   
   function hasEventTypeMapping(eventTypeId) {
     // Check against cached event type mappings (already loaded in global scope)
     return window.eventTypeMappings?.some(m => m.odoo_event_type_id === eventTypeId);
   }
   ```

**Validation:**
- [ ] Clicking calendar event updates detail panel
- [ ] Event name, status badge, metadata display correctly
- [ ] "Edit Description" button disabled for archived events
- [ ] "Publish" button disabled for events without event type mapping
- [ ] WordPress link visible only for published events

---

#### STEP 4: Integration Testing (30 min)

**Manual Tests:**

1. **Calendar Rendering**
   - [ ] Load Event Operations page
   - [ ] Verify calendar displays with current month
   - [ ] Verify events render with correct colors
   - [ ] Verify status legend visible in header

2. **View Switching**
   - [ ] Click "Week" view button
   - [ ] Verify calendar switches to week view with time slots
   - [ ] Click "Day" view button
   - [ ] Verify calendar switches to day view

3. **Event Click**
   - [ ] Click any event in calendar
   - [ ] Verify detail panel updates (not navigation)
   - [ ] Verify event metadata correct
   - [ ] Verify action buttons visible

4. **Status Color Verification**
   - [ ] Find an event with `out_of_sync` state
   - [ ] Verify color is amber (#f59e0b)
   - [ ] Find an event with `published` state
   - [ ] Verify color is emerald (#10b981)

5. **Responsive Layout**
   - [ ] Resize browser to tablet width (768px)
   - [ ] Verify 6/6 split or stacked layout
   - [ ] Resize to mobile width (<768px)
   - [ ] Verify full-width stacked layout

6. **Button State Logic**
   - [ ] Click archived event
   - [ ] Verify "Edit Description" button disabled
   - [ ] Verify tooltip shows "Event is archived"
   - [ ] Click event without event type mapping
   - [ ] Verify "Publish" button disabled
   - [ ] Verify tooltip shows "No event type mapping"

7. **Performance**
   - [ ] Load page with >50 events
   - [ ] Verify calendar renders in <2 seconds
   - [ ] Click multiple events rapidly
   - [ ] Verify detail panel updates without lag

**Browser Compatibility:**
- [ ] Test in Chrome (primary)
- [ ] Test in Firefox
- [ ] Test in Edge
- [ ] (Optional) Test in Safari if macOS available

**Regression Tests:**
- [ ] Existing sync flow works (click "Sync All")
- [ ] Existing publish flow works (use detail panel button)
- [ ] Event type mapping modal opens correctly
- [ ] State engine discrepancy detection unchanged

---

## 5. VALIDATION PLAN

### 5.1 Functional Requirements

| Requirement | Test Method | Pass Criteria |
|-------------|-------------|---------------|
| Calendar renders with month/week/day views | Manual UI test | All 3 views switch correctly |
| Events display with status-based colors | Visual inspection | Colors match spec (amber for out_of_sync, emerald for published, etc.) |
| Detail panel updates on event click | Click 5 random events | Panel content updates each time without page navigation |
| Status legend visible | Visual inspection | 5 status badges visible in header |
| Action buttons disabled correctly | Click archived event | "Edit Description" disabled, tooltip visible |
| Publish button validates mapping | Click event without mapping | "Publish" disabled, tooltip explains why |
| Responsive layout | Resize browser | 8/4 split on desktop, stacked on mobile |

### 5.2 Performance Requirements

| Metric | Target | Test Method | Pass Criteria |
|--------|--------|-------------|---------------|
| Calendar render time (100 events) | <2s | Chrome DevTools Performance tab | Initial render <2000ms |
| Event click response | <100ms | Manual stopwatch | Detail panel updates immediately |
| View switch time | <500ms | Manual test | Month→Week→Day smooth transition |
| Page load time | <3s | Lighthouse audit | Total page load <3000ms on 3G |

### 5.3 Code Quality Requirements

| Check | Tool | Pass Criteria |
|-------|------|---------------|
| JavaScript syntax | ESLint (if configured) | 0 errors |
| Console errors | Browser DevTools | 0 errors in console |
| Network errors | Browser DevTools Network tab | 0 failed requests (except 404 for missing CDN if testing fallback) |
| HTML validation | W3C Validator | 0 errors, warnings acceptable |

### 5.4 Regression Testing

| Existing Feature | Test Method | Pass Criteria |
|------------------|-------------|---------------|
| Sync flow | Click "Sync All" button | Snapshots refresh, calendar re-renders with updated data |
| Publish flow | Click "Publish to WordPress" in detail panel | Event publishes, state changes to `published` |
| Event type mapping | Click "Event Type Mapping" button | Modal opens, mappings load correctly |
| State engine | Publish event, check color | OUT_OF_SYNC → PUBLISHED color change visible |

---

## 6. ROLLBACK PLAN

### 6.1 Rollback Trigger Conditions

Rollback Phase 8 if ANY of the following occur:

| Condition | Severity | Action |
|-----------|----------|--------|
| FullCalendar fails to load from CDN | **CRITICAL** | Abort deployment, fallback to table view temporarily |
| Calendar does not render events | **CRITICAL** | Immediate rollback |
| Event click causes JavaScript errors | **HIGH** | Rollback within 1 hour |
| Performance degradation (>5s load time) | **HIGH** | Rollback, optimize offline |
| Detail panel fails to update | **MEDIUM** | Rollback, debug in staging |
| User reports confusion about new UI | **LOW** | Document, do not rollback (UX issue, not bug) |

### 6.2 Rollback Procedure

**Estimated Rollback Time:** <5 minutes

**Steps:**

1. **Git Revert**
   ```powershell
   git checkout main
   git revert HEAD --no-edit
   git push origin main
   ```

2. **Redeploy Previous Version**
   ```powershell
   npx wrangler deploy
   ```

3. **Verify Rollback Success**
   - Load Event Operations page
   - Verify 3-column card grid visible (old UI)
   - Verify no console errors
   - Verify sync/publish flows work

4. **Notify Team**
   - Post rollback notification in Slack/Teams
   - Document failure reason
   - Create bug ticket for post-mortem

### 6.3 Data Impact Assessment

**Phase 8 Rollback Data Impact:** NONE

| Data Store | Impact |
|------------|--------|
| Supabase `webinar_snapshots` | ✅ No changes, data safe |
| Supabase `event_type_wp_tag_mapping` | ✅ No changes, data safe |
| Odoo `x_webinar` | ✅ No writes in Phase 8, data safe |
| WordPress events | ✅ No writes in Phase 8, data safe |
| User sessions | ✅ No session changes, safe |

**Rollback is SAFE because Phase 8 is UI-only refactor with no backend changes.**

### 6.4 Rollback Testing

**Pre-Rollback Validation (Execute in Staging):**

1. Create rollback test branch
2. Intentionally break calendar rendering (comment out FullCalendar init)
3. Execute rollback procedure
4. Verify old UI returns
5. Delete test branch

**Rollback rehearsal completed:** ❌ Not yet (execute before Phase 8 deployment)

---

## 7. KNOWN RISKS & MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **FullCalendar CDN unavailable** | Low (1%) | Critical | Implement inline fallback CSS, graceful degradation to table view |
| **Browser compatibility issues (older browsers)** | Medium (10%) | High | Test in IE11 (if org requires), polyfill ES6 features if needed |
| **Performance with >500 events** | Medium (15%) | Medium | Implement pagination or date range filtering in Phase 9 |
| **User confusion (UI change too drastic)** | Medium (20%) | Low | Add onboarding tooltip, document in release notes |
| **Timezone mismatch in calendar display** | Low (5%) | Medium | Use existing `formatEventDateTime()` from Addendum B (Brussels timezone) |
| **State color mapping inconsistency** | Low (5%) | Low | Add visual regression test screenshots before/after |

---

## 8. DEPENDENCIES ON FUTURE PHASES

| Phase 9 Dependency | Phase 8 Delivers | Phase 9 Needs |
|--------------------|------------------|---------------|
| Description editor modal | Detail panel "Edit Description" button | Button click handler stub (Phase 8), actual editor modal (Phase 9) |
| Version history access | Detail panel structure | "View History" button (added in Phase 9) |
| Form template selector | None | New UI component (Phase 9) |

**Phase 8 Must Leave Hooks For Phase 9:**

1. `openDescriptionEditor(webinarId)` function stub (logs to console, will be implemented in Phase 9)
2. Detail panel button IDs for Phase 9 to attach listeners
3. Global state management for selected webinar (for editor context)

---

## 9. SUCCESS CRITERIA SUMMARY

Phase 8 is considered **COMPLETE** when:

- [ ] Calendar renders with 3 views (month/week/day)
- [ ] Events display with correct status colors
- [ ] Detail panel updates on event click
- [ ] Status legend visible
- [ ] Action buttons disabled correctly
- [ ] Responsive layout works on tablet/mobile
- [ ] No console errors
- [ ] Performance targets met (<2s render time)
- [ ] Regression tests pass (sync, publish flows)
- [ ] Browser compatibility verified (Chrome, Firefox, Edge)

**Exit Criteria:**
- Zero critical bugs
- Performance within targets
- User acceptance (test with 2-3 internal users)

---

## 10. IMPLEMENTATION TIMELINE ESTIMATE

| Step | Duration | Dependencies |
|------|----------|--------------|
| Pre-implementation checks | 15 min | None |
| Modify `ui.js` (layout) | 30 min | FullCalendar CDN verified |
| Modify `event-operations-client.js` (calendar) | 90 min | Step 2 complete |
| Modify `event-operations-client.js` (detail panel) | 60 min | Step 3 complete |
| Integration testing | 30 min | All code changes complete |
| Browser compatibility testing | 30 min | Step 5 complete |
| Documentation | 15 min | All testing complete |

**Total Estimated Time:** 4.5 hours (single developer, uninterrupted)

**Recommended Buffer:** +1.5 hours for debugging/unexpected issues

**Total Planned Time:** 6 hours

---

## 11. APPROVAL CHECKLIST

Before proceeding with Phase 8 implementation, confirm:

- [ ] This plan reviewed and approved
- [ ] FullCalendar CDN accessible from production network
- [ ] Staging environment available for testing
- [ ] Rollback procedure rehearsed in staging
- [ ] No conflicting deployments scheduled
- [ ] Team notified of UI change (not a silent deploy)

**Approved by:** _____________  
**Date:** _____________

---

## 12. NEXT STEPS (AFTER APPROVAL)

1. **User confirms approval** → Proceed to code implementation
2. **User identifies issues in plan** → Revise plan, resubmit for approval
3. **User requests clarification** → Answer questions, update plan

**Current Status:** ⏳ Awaiting approval to proceed with implementation

---

**Phase 8 Plan Complete. Ready for review.**

Do NOT proceed to code implementation until this plan is explicitly approved.

If you detect any contradictions between:
- This plan
- Addendum D specification
- Existing codebase
- Previous addendums

**STOP and report before proceeding.**
