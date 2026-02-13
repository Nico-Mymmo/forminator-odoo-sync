/**
 * Event Operations - UI (Bootstrap Only)
 * 
 * Responsibilities:
 * - Load external dependencies (FullCalendar, TinyMCE)
 * - Render HTML structure
 * - Initialize controllers
 * - Provide helper functions
 * - Minimal coordination
 * 
 * Part of: ADDENDUM D - Calendar Workspace & Editorial Layer
 * Frontend Refactor Architecture
 */

import { navbar } from '../../lib/components/navbar.js';

/**
 * Status badge config: DaisyUI badge variant per computed_state
 */
const STATUS_BADGES = {
  not_published: { label: 'Not Published', css: 'badge-ghost' },
  draft: { label: 'Draft', css: 'badge-neutral' },
  published: { label: 'Published', css: 'badge-success' },
  out_of_sync: { label: 'Out of Sync', css: 'badge-warning' },
  archived: { label: 'Archived', css: 'badge-info' },
  deleted: { label: 'Deleted', css: 'badge-error' }
};

/**
 * Render Event Operations main page
 * 
 * @param {Object} user - Authenticated user object
 * @returns {string} HTML string
 */
export function eventOperationsUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Operations</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <!-- FullCalendar v6 (Addendum D) -->
    <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"></script>
    <!-- TinyMCE (Editorial Layer - Addendum D) -->
    <script src="https://cdn.tiny.cloud/1/no-api-key/tinymce/6/tinymce.min.js" referrerpolicy="origin"></script>
    <style>
      /* FullCalendar Minimal DaisyUI Integration (Month View Only) */
      
      .fc {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: hsl(var(--b1));
        --fc-border-color: hsl(var(--bc) / 0.06);
        --fc-today-bg-color: hsl(var(--p) / 0.03);
      }
      
      /* Toolbar */
      .fc .fc-toolbar {
        padding: 0.75rem 0;
        margin-bottom: 1rem;
      }
      .fc-toolbar-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: hsl(var(--bc));
      }
      
      /* Toolbar buttons - DaisyUI btn-sm style */
      .fc .fc-button {
        background-color: transparent;
        border: 1px solid hsl(var(--bc) / 0.2);
        color: hsl(var(--bc));
        text-transform: none;
        font-weight: 500;
        font-size: 0.875rem;
        padding: 0.375rem 0.75rem;
        border-radius: 0.5rem;
        box-shadow: none !important;
        transition: all 0.2s ease;
      }
      .fc .fc-button:hover {
        background-color: hsl(var(--bc) / 0.05);
      }
      .fc .fc-button-primary.fc-button-active {
        background-color: hsl(var(--p));
        border-color: hsl(var(--p));
        color: hsl(var(--pc));
        font-weight: 600;
      }
      
      /* Day cells */
      .fc-col-header-cell {
        border-bottom: 1px solid hsl(var(--bc) / 0.1);
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.6875rem;
        color: hsl(var(--bc) / 0.6);
        padding: 0.5rem 0.25rem;
      }
      .fc-daygrid-day-frame {
        padding: 0.25rem;
        min-height: 5rem;
      }
      
      /* Today highlight */
      .fc-daygrid-day.fc-day-today {
        background-color: hsl(var(--p) / 0.03) !important;
      }
      .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
        background-color: hsl(var(--p));
        color: hsl(var(--pc));
        border-radius: 0.375rem;
        font-weight: 600;
      }
      
      /* Events - styled via eventDidMount (CSS variables) */
      .fc-event {
        cursor: pointer;
        background-color: var(--event-bg, hsl(var(--b2))) !important;
        border-left: 3px solid var(--event-accent, hsl(var(--p))) !important;
        color: var(--event-text, hsl(var(--bc))) !important;
        border-width: 1px !important;
        font-weight: 500;
        font-size: 0.8125rem;
        padding: 0.125rem 0.375rem;
        margin-bottom: 0.125rem;
        border-radius: 0.25rem;
        transition: all 0.15s ease;
      }
      .fc-event:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px hsl(var(--bc) / 0.15);
        filter: brightness(0.95);
      }
      .fc-event-title,
      .fc-event-time {
        color: inherit !important;
      }
      
      /* Status Legend */
      .legend-warning {
        background-color: hsl(var(--wa) / 0.15) !important;
        border-color: hsl(var(--wa) / 0.3) !important;
        color: hsl(var(--bc)) !important;
      }
      .legend-success {
        background-color: hsl(var(--su) / 0.15) !important;
        border-color: hsl(var(--su) / 0.3) !important;
        color: hsl(var(--bc)) !important;
      }
      .legend-neutral {
        background-color: hsl(var(--n) / 0.15) !important;
        border-color: hsl(var(--n) / 0.3) !important;
        color: hsl(var(--bc)) !important;
      }
      .legend-info {
        background-color: hsl(var(--in) / 0.15) !important;
        border-color: hsl(var(--in) / 0.3) !important;
        color: hsl(var(--bc)) !important;
      }
    </style>
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-6xl">

          <!-- Header -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h1 class="text-4xl font-bold mb-2">Event Operations</h1>
                <p class="text-base-content/60">Odoo webinar → WordPress publication</p>
              </div>
              <div class="flex items-center gap-2">
                <!-- View toggle (LEFT) -->
                <div class="join">
                  <button id="viewBtnTable" class="btn btn-sm btn-outline join-item btn-active" onclick="switchView('table')">
                    <i data-lucide="table" class="w-4 h-4"></i> Table
                  </button>
                  <button id="viewBtnCalendar" class="btn btn-sm btn-outline join-item" onclick="switchView('calendar')">
                    <i data-lucide="calendar" class="w-4 h-4"></i> Calendar
                  </button>
                </div>
                <!-- Actions (RIGHT) -->
                <button id="btnTags" class="btn btn-outline btn-sm gap-2" onclick="openEventTypeMappingModal()">
                  <i data-lucide="tag" class="w-4 h-4"></i> Event Type Mapping
                </button>
                <button id="btnSync" class="btn btn-primary btn-sm gap-2" onclick="runSync()">
                  <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync All
                </button>
              </div>
            </div>
            
            <!-- Status Legend (Calendar View Only) -->
            <div id="statusLegend" class="hidden flex flex-wrap gap-2 text-xs mt-4">
              <span class="text-base-content/60 font-medium mr-2">Status:</span>
              <span class="badge badge-sm legend-warning">Out of Sync</span>
              <span class="badge badge-sm legend-success">Published</span>
              <span class="badge badge-sm legend-neutral">Draft</span>
              <span class="badge badge-sm legend-info">Not Published</span>
            </div>
          </div>

          <!-- Discrepancies section -->
          <div id="discrepancySection" class="hidden mb-6">
            <div class="collapse collapse-arrow bg-base-100 shadow-xl">
              <input type="checkbox" checked />
              <div class="collapse-title flex items-center gap-2">
                <i data-lucide="alert-triangle" class="w-5 h-5 text-warning"></i>
                <span class="font-semibold">Discrepancies</span>
                <span id="discrepancyCount" class="badge badge-warning badge-sm">0</span>
              </div>
              <div class="collapse-content">
                <div id="discrepancyList" class="space-y-2"></div>
              </div>
            </div>
          </div>

          <!-- Filter tabs (Table view only - Addendum D Phase 8) -->
          <div id="filterTabs" class="tabs tabs-boxed mb-6 bg-base-100 shadow-sm">
            <a id="tabAll" class="tab tab-active" onclick="switchTab('all')">Alle</a>
            <a id="tabUpcoming" class="tab" onclick="switchTab('upcoming')">Komend</a>
            <a id="tabPast" class="tab" onclick="switchTab('past')">Verleden</a>
            <a id="tabPublished" class="tab" onclick="switchTab('published')">Gepubliceerd</a>
            <a id="tabDraft" class="tab" onclick="switchTab('draft')">Concept</a>
            <a id="tabOutOfSync" class="tab" onclick="switchTab('out_of_sync')">Niet gesync</a>
            <a id="tabArchived" class="tab" onclick="switchTab('archived')">Gearchiveerd</a>
          </div>

          <!-- Toast container -->
          <div id="toastContainer" class="toast toast-top toast-end" style="z-index:9999;"></div>

          <!-- Event Type Mappings Modal -->
          <dialog id="eventTypeMappingModal" class="modal">
            <div class="modal-box max-w-4xl">
              <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                <i data-lucide="tag" class="w-5 h-5"></i>
                Event Type → WordPress Tag Mapping
              </h3>
              
              <!-- Loading State -->
              <div id="eventTypeMappingLoading" class="flex justify-center py-8">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
              
              <!-- Content -->
              <div id="eventTypeMappingContent" class="hidden">
                <p class="text-sm text-base-content/70 mb-4">
                  Map each Odoo event type to exactly one WordPress tag. Sync/publish will fail if a webinar event type has no mapping.
                </p>
                
                <!-- Add New Mapping Form -->
                <div class="card bg-base-200 mb-4">
                  <div class="card-body">
                    <h4 class="font-semibold mb-2">Save Mapping</h4>
                    <div class="flex gap-2">
                      <select id="odooEventTypeSelect" class="select select-bordered select-sm flex-1">
                        <option value="">Select Odoo Event Type...</option>
                      </select>
                      <select id="wpTagSelect" class="select select-bordered select-sm flex-1">
                        <option value="">Select WP Tag...</option>
                      </select>
                      <button id="btnSaveEventTypeMapping" class="btn btn-primary btn-sm" onclick="saveEventTypeMapping()">
                        <i data-lucide="save" class="w-4 h-4"></i> Save
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Existing Mappings Table -->
                <div class="overflow-x-auto">
                  <table class="table table-zebra table-sm">
                    <thead>
                      <tr>
                        <th>Odoo Event Type</th>
                        <th>WordPress Tag</th>
                        <th class="w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="eventTypeMappingTableBody">
                      <!-- Populated by loadEventTypeMappings() -->
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div class="modal-action">
                <form method="dialog">
                  <button class="btn">Close</button>
                </form>
              </div>
            </div>
            <form method="dialog" class="modal-backdrop">
              <button>close</button>
            </form>
          </dialog>

          <!-- Loading state -->
          <div id="loadingState" class="flex justify-center py-16">
            <span class="loading loading-spinner loading-lg"></span>
          </div>

          <!-- Empty state -->
          <div id="emptyState" class="hidden">
            <div class="card bg-base-100 shadow-xl">
              <div class="card-body text-center py-16">
                <i data-lucide="calendar-off" class="w-12 h-12 mx-auto text-base-content/30 mb-4"></i>
                <p class="text-base-content/60">No webinars found in Odoo.</p>
              </div>
            </div>
          </div>

          <!-- Webinar table -->
          <div id="dataTable" class="hidden">
            <div class="card bg-base-100 shadow-xl">
              <div class="card-body">
                <div class="overflow-x-auto">
                  <table class="table table-zebra">
                    <thead>
                      <tr>
                        <th class="w-16">ID</th>
                        <th class="min-w-[200px]">Title</th>
                        <th class="w-32 whitespace-nowrap">Date</th>
                        <th class="w-24 whitespace-nowrap">Time</th>
                        <th class="w-20 whitespace-nowrap">Registrations</th>
                        <th class="w-32">Event Type</th>
                        <th class="w-32">Status</th>
                        <th class="w-24">WP Event</th>
                        <th class="w-32">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="webinarTableBody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Calendar Workspace (Phase 8) -->
          <div id="calendarWorkspace" class="hidden">
            <div class="grid grid-cols-12 gap-6">
              <!-- Calendar Container (8/12) -->
              <div class="col-span-12 lg:col-span-8">
                <div class="card bg-base-100 shadow-xl">
                  <div class="card-body p-4">
                    <div id="fullcalendar"></div>
                  </div>
                </div>
              </div>
              
              <!-- Detail Panel (4/12) -->
              <div class="col-span-12 lg:col-span-4">
                <div class="card bg-base-100 shadow-xl sticky top-4">
                  <div class="card-body">
                    <!-- Empty State -->
                    <div id="panel-empty-state" class="text-center py-12">
                      <i data-lucide="mouse-pointer-click" class="w-12 h-12 mx-auto text-base-content/30 mb-2"></i>
                      <p class="text-base-content/60">Select an event from the calendar</p>
                    </div>
                    
                    <!-- Detail Content (hidden initially) -->
                    <div id="panel-content" class="hidden"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
    </div>

    <script>
      // ── Theme Management ──
      function changeTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('selectedTheme', theme);
      }
      
      function initTheme() {
        const savedTheme = localStorage.getItem('selectedTheme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const selector = document.getElementById('themeSelector');
        if (selector) selector.value = savedTheme;
      }

      // ── Navbar Functions ──
      async function logout() {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
        } catch (err) {
          console.error('Logout error:', err);
        }
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      }

      function syncProdData() {
        alert('Sync production data not available in this module');
      }

      // Status badge config
      const STATUS_BADGES = ${JSON.stringify(STATUS_BADGES)};

      // ── Toast ──
      function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const alertClass = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
        const toast = document.createElement('div');
        toast.className = 'alert ' + alertClass + ' text-sm py-2 px-4';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }

      // ── State management ──
      let odooWebinars = [];
      let snapshotMap = new Map(); // odoo_webinar_id → snapshot
      let registrationCounts = {}; // webinar.id → count
      let eventTypeNamesMap = new Map(); // event_type_id → event_type_name
      let activeTab = 'all'; // Current filter tab

      // ── Filter webinars by tab ──
      function filterWebinars(webinars, tab) {
        if (tab === 'all') return webinars;
        
        const now = new Date();
        
        return webinars.filter(webinar => {
          const snapshot = snapshotMap.get(webinar.id);
          const state = snapshot ? snapshot.computed_state : 'not_published';
          
          // Parse datetime - x_studio_event_datetime is in UTC but may lack 'Z'
          let eventDatetime = null;
          if (webinar.x_studio_event_datetime) {
            try {
              let isoString = webinar.x_studio_event_datetime.trim();
              
              // Ensure it's treated as UTC
              if (isoString.includes(' ') && !isoString.includes('T')) {
                isoString = isoString.replace(' ', 'T') + 'Z';
              } else if (isoString.includes('T') && !isoString.endsWith('Z')) {
                isoString = isoString + 'Z';
              }
              
              eventDatetime = new Date(isoString);
              
              // Validate
              if (isNaN(eventDatetime.getTime())) {
                console.warn('[filterWebinars] Invalid datetime for webinar', webinar.id, ':', webinar.x_studio_event_datetime);
                eventDatetime = null;
              }
            } catch (err) {
              console.warn('[filterWebinars] Error parsing datetime for webinar', webinar.id, ':', err);
              eventDatetime = null;
            }
          }
          
          switch (tab) {
            case 'upcoming':
              return eventDatetime && eventDatetime >= now && state !== 'archived';
            case 'past':
              return eventDatetime && eventDatetime < now && state !== 'archived';
            case 'published':
              return state === 'published';
            case 'draft':
              return state === 'draft' || state === 'not_published';
            case 'out_of_sync':
              return state === 'out_of_sync';
            case 'archived':
              return state === 'archived';
            default:
              return true;
          }
        });
      }

      // ── Switch tab ──
      function switchTab(tab) {
        activeTab = tab;
        
        // Update tab UI
        document.querySelectorAll('.tabs .tab').forEach(el => el.classList.remove('tab-active'));
        const tabId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const tabEl = document.getElementById(tabId);
        if (tabEl) tabEl.classList.add('tab-active');
        
        // Update URL hash
        window.location.hash = 'tab=' + tab;
        
        // Re-render current view with filtered data
        const filteredWebinars = filterWebinars(odooWebinars, activeTab);
        const currentView = localStorage.getItem('eventOpsViewMode') || 'table';
        
        if (currentView === 'cards') {
          if (typeof renderCardsView === 'function') {
            renderCardsView(filteredWebinars, snapshotMap, registrationCounts);
          }
        } else {
          renderTable(filteredWebinars);
        }
      }

      // ── Load data ──
      async function loadData() {
        document.getElementById('loadingState').style.display = 'flex';
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('dataTable').classList.add('hidden');

        try {
          const [webinarsRes, snapshotsRes, eventTypesRes, mappingsRes] = await Promise.all([
            fetch('/events/api/odoo-webinars?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json()),
            fetch('/events/api/snapshots?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json()),
            fetch('/events/api/odoo-event-types?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json()),
            fetch('/events/api/event-type-tag-mappings?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json())
          ]);

          if (!webinarsRes.success) throw new Error(webinarsRes.error);
          if (!snapshotsRes.success) throw new Error(snapshotsRes.error);
          if (!eventTypesRes.success) throw new Error(eventTypesRes.error);

          odooWebinars = webinarsRes.data.webinars || [];
          registrationCounts = webinarsRes.data.registrationCounts || {};
          
          snapshotMap.clear();
          for (const snap of (snapshotsRes.data || [])) {
            snapshotMap.set(snap.odoo_webinar_id, snap);
          }
          
          eventTypeNamesMap.clear();
          for (const eventType of (eventTypesRes.data || [])) {
            eventTypeNamesMap.set(eventType.id, eventType.x_name);
          }

          // Make event type map available to external client.js
          window.eventTypeNamesMap = eventTypeNamesMap;
          
          // Cache event type mappings globally (Phase 8)
          window.eventTypeMappings = mappingsRes.success ? mappingsRes.data : [];

          // Restore active tab from URL hash
          initTabFromHash();
          
          // Render with current filter
          const filteredWebinars = filterWebinars(odooWebinars, activeTab);
          renderTable(filteredWebinars);
        } catch (err) {
          showToast('Failed to load: ' + err.message, 'error');
        } finally {
          document.getElementById('loadingState').style.display = 'none';
          // Apply saved view mode after data is loaded
          initView();
        }
      }

      // ── Init tab from URL hash ──
      function initTabFromHash() {
        const hash = window.location.hash.slice(1); // Remove #
        const params = new URLSearchParams(hash);
        const tabParam = params.get('tab');
        
        if (tabParam && ['all', 'upcoming', 'past', 'published', 'draft', 'out_of_sync', 'archived'].includes(tabParam)) {
          activeTab = tabParam;
          
          // Update tab UI
          document.querySelectorAll('.tabs .tab').forEach(el => el.classList.remove('tab-active'));
          const tabId = 'tab' + tabParam.charAt(0).toUpperCase() + tabParam.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          const tabEl = document.getElementById(tabId);
          if (tabEl) tabEl.classList.add('tab-active');
        }
      }

      // ── Render table ──
      function renderTable(webinars = odooWebinars) {
        const tbody = document.getElementById('webinarTableBody');
        tbody.innerHTML = '';

        if (webinars.length === 0) {
          document.getElementById('emptyState').classList.remove('hidden');
          document.getElementById('dataTable').classList.add('hidden');
          return;
        }

        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('dataTable').classList.remove('hidden');

        for (const webinar of webinars) {
          const snap = snapshotMap.get(webinar.id);
          const state = snap ? snap.computed_state : 'not_published';
          const badge = STATUS_BADGES[state] || STATUS_BADGES.not_published;
          const wpId = snap?.wp_snapshot?.id;
          const regCount = registrationCounts[webinar.id] || 0;
          
          let eventTypeHtml = '—';
          if (Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1) {
            const eventTypeId = webinar.x_webinar_event_type_id[0];
            const eventTypeName = webinar.x_webinar_event_type_id[1] || ('Event Type #' + eventTypeId);
            eventTypeHtml = '<span class="badge badge-outline badge-sm">' + escapeHtml(eventTypeName) + '</span>';
          }
          
          // Format datetime
          const datetime = formatEventDateTime(webinar.x_studio_event_datetime);
          const duration = webinar.x_studio_event_duration_minutes ? webinar.x_studio_event_duration_minutes + ' min' : '—';
          
          const tr = document.createElement('tr');
          tr.innerHTML = 
            '<td class="font-mono text-sm">' + webinar.id + '</td>' +
            '<td class="max-w-xs"><div class="truncate" title="' + escapeHtml(webinar.x_name) + '">' + escapeHtml(webinar.x_name) + '</div></td>' +
            '<td class="whitespace-nowrap">' + datetime.date + '</td>' +
            '<td class="whitespace-nowrap">' + datetime.time + '</td>' +
            '<td class="whitespace-nowrap">' + duration + '</td>' +
            '<td class="text-center whitespace-nowrap"><span class="badge badge-neutral badge-sm">' + regCount + '</span></td>' +
            '<td class="whitespace-nowrap">' + eventTypeHtml + '</td>' +
            '<td><span class="badge ' + badge.css + ' badge-sm whitespace-nowrap">' + badge.label + '</span></td>' +
            '<td class="whitespace-nowrap">' + (wpId ? '<a href="https://openvme.be/wp-admin/post.php?post=' + wpId + '&action=edit" target="_blank" class="link link-primary text-sm">WP #' + wpId + '</a>' : '—') + '</td>' +
            '<td class="whitespace-nowrap">' + renderActions(webinar.id, state) + '</td>';
          
          tbody.appendChild(tr);
        }

        // Update discrepancies
        const discrepancies = webinars.filter(w => {
          const s = snapshotMap.get(w.id);
          return s && s.computed_state === 'out_of_sync';
        });
        renderDiscrepancies(discrepancies);
        
        lucide.createIcons();
      }

      // ── Render action buttons ──
      function renderActions(webinarId, state) {
        if (state === 'not_published') {
          // Dropdown with Publish options
          return '<div class="dropdown dropdown-end">' +
            '<div tabindex="0" role="button" class="btn btn-primary btn-xs">' +
              '<i data-lucide="upload" class="w-3 h-3"></i> Publish <i data-lucide="chevron-down" class="w-3 h-3 ml-1"></i>' +
            '</div>' +
            '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-36">' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;publish&apos;)"><i data-lucide="globe" class="w-3 h-3"></i> Publish</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;draft&apos;)"><i data-lucide="file-edit" class="w-3 h-3"></i> Draft</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;private&apos;)"><i data-lucide="lock" class="w-3 h-3"></i> Private</a></li>' +
            '</ul>' +
          '</div>';
        }
        if (state === 'draft') {
          // Dropdown for draft events - primary action is Publish
          return '<div class="dropdown dropdown-end">' +
            '<div tabindex="0" role="button" class="btn btn-neutral btn-xs">' +
              '<i data-lucide="upload" class="w-3 h-3"></i> Publish <i data-lucide="chevron-down" class="w-3 h-3 ml-1"></i>' +
            '</div>' +
            '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-36">' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;publish&apos;)"><i data-lucide="globe" class="w-3 h-3"></i> Publish</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;draft&apos;)"><i data-lucide="file-edit" class="w-3 h-3"></i> Draft</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;private&apos;)"><i data-lucide="lock" class="w-3 h-3"></i> Private</a></li>' +
            '</ul>' +
          '</div>';
        }
        if (state === 'out_of_sync') {
          // Dropdown for out of sync with Re-publish options
          return '<div class="dropdown dropdown-end">' +
            '<div tabindex="0" role="button" class="btn btn-warning btn-xs">' +
              '<i data-lucide="refresh-cw" class="w-3 h-3"></i> Re-publish <i data-lucide="chevron-down" class="w-3 h-3 ml-1"></i>' +
            '</div>' +
            '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-36">' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;publish&apos;)"><i data-lucide="globe" class="w-3 h-3"></i> Publish</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;draft&apos;)"><i data-lucide="file-edit" class="w-3 h-3"></i> Draft</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;private&apos;)"><i data-lucide="lock" class="w-3 h-3"></i> Private</a></li>' +
            '</ul>' +
          '</div>';
        }
        if (state === 'published') {
          // Dropdown for published events to change status
          return '<div class="dropdown dropdown-end">' +
            '<div tabindex="0" role="button" class="btn btn-primary btn-xs">' +
              '<i data-lucide="refresh-cw" class="w-3 h-3"></i> Re-publish <i data-lucide="chevron-down" class="w-3 h-3 ml-1"></i>' +
            '</div>' +
            '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-36">' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;publish&apos;)"><i data-lucide="globe" class="w-3 h-3"></i> Publish</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;draft&apos;)"><i data-lucide="file-edit" class="w-3 h-3"></i> Draft</a></li>' +
              '<li><a onclick="publishWebinar(' + webinarId + ', this, &apos;private&apos;)"><i data-lucide="lock" class="w-3 h-3"></i> Private</a></li>' +
            '</ul>' +
          '</div>';
        }
        return '<span class="text-base-content/40 text-xs">—</span>';
      }

      // ── Render discrepancies ──
      function renderDiscrepancies(discrepancies) {
        const section = document.getElementById('discrepancySection');
        const list = document.getElementById('discrepancyList');
        const count = document.getElementById('discrepancyCount');

        if (discrepancies.length === 0) {
          section.classList.add('hidden');
          return;
        }

        section.classList.remove('hidden');
        count.textContent = discrepancies.length;
        list.innerHTML = '';

        for (const w of discrepancies) {
          const div = document.createElement('div');
          div.className = 'alert alert-warning py-2';
          div.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4"></i> <span><strong>#' + w.id + '</strong> ' + escapeHtml(w.x_name) + ' — content differs between Odoo and WordPress</span>';
          list.appendChild(div);
        }
      }

      // ── Publish ──
      async function publishWebinar(odooWebinarId, btn, status = 'publish') {
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>'; }
        
        try {
          const res = await fetch('/events/api/publish', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ odoo_webinar_id: odooWebinarId, status: status })
          }).then(r => r.json());

          if (res.success) {
            const statusLabel = status === 'draft' ? 'as Draft' : (status === 'private' ? 'as Private' : '');
            showToast('Published webinar ' + odooWebinarId + ' ' + statusLabel + ' → WP #' + res.data.wp_event_id, 'success');
            await loadData(); // Refresh table
          } else {
            showToast('Publish failed: ' + res.error, 'error');
          }
        } catch (err) {
          showToast('Publish error: ' + err.message, 'error');
        } finally {
          if (btn) { btn.disabled = false; }
        }
      }

      // ── Sync ──
      async function runSync() {
        const btn = document.getElementById('btnSync');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Syncing...';

        try {
          const res = await fetch('/events/api/sync', {
            method: 'POST',
            credentials: 'include'
          }).then(r => r.json());

          if (res.success) {
            showToast('Sync complete: ' + res.data.synced_count + ' webinars, ' + res.data.discrepancies.length + ' discrepancies', 'success');
            await loadData(); // Refresh table with new states
          } else {
            showToast('Sync failed: ' + res.error, 'error');
          }
        } catch (err) {
          showToast('Sync error: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync All';
          lucide.createIcons();
        }
      }

      // ── Helpers ──
      function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
      }

      // ── View Switching (Addendum D Phase 8: Table + Calendar) ──
      function switchView(viewType) {
        const tableContainer = document.getElementById('dataTable');
        const calendarWorkspace = document.getElementById('calendarWorkspace');
        const emptyState = document.getElementById('emptyState');
        const tableBtn = document.getElementById('viewBtnTable');
        const calendarBtn = document.getElementById('viewBtnCalendar');
        const filterTabs = document.getElementById('filterTabs');
        const statusLegend = document.getElementById('statusLegend');
        
        const filteredWebinars = filterWebinars(odooWebinars, activeTab);
        
        if (viewType === 'table') {
          // Show table view
          tableContainer.classList.remove('hidden');
          calendarWorkspace.classList.add('hidden');
          tableBtn.classList.add('btn-active');
          calendarBtn.classList.remove('btn-active');
          // Show filter tabs, hide status legend
          if (filterTabs) filterTabs.classList.remove('hidden');
          if (statusLegend) statusLegend.classList.add('hidden');
          renderTable(filteredWebinars);
        } else if (viewType === 'calendar') {
          // Show calendar view
          tableContainer.classList.add('hidden');
          emptyState.classList.add('hidden');
          calendarWorkspace.classList.remove('hidden');
          tableBtn.classList.remove('btn-active');
          calendarBtn.classList.add('btn-active');
          // Hide filter tabs, show status legend
          if (filterTabs) filterTabs.classList.add('hidden');
          if (statusLegend) statusLegend.classList.remove('hidden');
          
          // Initialize calendar with filtered data (Addendum D Phase 8)
          if (typeof initializeCalendar === 'function') {
            initializeCalendar(filteredWebinars, snapshotMap, registrationCounts);
          }
        }
        
        localStorage.setItem('eventOpsViewMode', viewType);
      }

      function initView() {
        const savedView = localStorage.getItem('eventOpsViewMode') || 'table';
        if (savedView === 'calendar') {
          setTimeout(() => switchView('calendar'), 100);
        }
      }

      // ── Helper: Format UTC datetime to Brussels timezone ──
      function formatEventDateTime(utcDatetimeStr) {
        if (!utcDatetimeStr) return '—';
        
        try {
          // CRITICAL: Odoo datetime fields are stored in UTC but returned WITHOUT 'Z' suffix
          // Example: Odoo returns "2026-06-18 09:00:00" for 11:00 Brussels time
          // We must explicitly treat this as UTC by adding 'Z' or replacing space with 'T' + 'Z'
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
      
      // Make formatEventDateTime available to external scripts
      window.formatEventDateTime = formatEventDateTime;

      // ── Init ──
      initTheme();
      loadData();
      lucide.createIcons();
    </script>
    
    <!-- External client-side UI module -->
    <script src="/event-operations-client.js"></script>
</body>
</html>`;
}
