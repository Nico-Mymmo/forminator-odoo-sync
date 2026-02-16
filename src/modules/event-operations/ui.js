/**
 * Event Operations - UI (Bootstrap Only - REFACTORED)
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
    <!-- Quill.js WYSIWYG Editor (Editorial Layer - Addendum D) -->
    <link href="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
    <style>
      /* FullCalendar Minimal DaisyUI Integration (Month View Only) */
      
      .fc {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: oklch(var(--b1));
        --fc-border-color: oklch(var(--bc) / 0.06);
        --fc-today-bg-color: oklch(var(--p) / 0.03);
      }
      
      /* Toolbar */
      .fc .fc-toolbar {
        padding: 0.75rem 0;
        margin-bottom: 1rem;
      }
      .fc-toolbar-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: oklch(var(--bc));
      }
      
      /* Toolbar buttons - DaisyUI btn-sm btn-outline style */
      .fc .fc-button {
        background-color: oklch(var(--b1)) !important;
        border: 1px solid oklch(var(--bc) / 0.2) !important;
        color: oklch(var(--bc)) !important;
        text-transform: none !important;
        font-weight: 500 !important;
        font-size: 0.875rem !important;
        padding: 0.375rem 0.75rem !important;
        border-radius: var(--rounded-btn, 0.5rem) !important;
        box-shadow: none !important;
        transition: all 0.2s ease !important;
        outline: none !important;
        height: 2rem !important;
        line-height: 1 !important;
      }
      .fc .fc-button:hover {
        background-color: oklch(var(--bc) / 0.08) !important;
        border-color: oklch(var(--bc) / 0.3) !important;
      }
      .fc .fc-button:focus {
        outline: none !important;
        box-shadow: none !important;
      }
      .fc .fc-button:disabled {
        opacity: 0.4 !important;
        cursor: not-allowed !important;
      }
      .fc .fc-button-primary:not(:disabled).fc-button-active,
      .fc .fc-button-primary:not(:disabled):active {
        background-color: oklch(var(--p)) !important;
        border-color: oklch(var(--p)) !important;
        color: oklch(var(--pc)) !important;
        font-weight: 600 !important;
      }
      /* Button group (prev/next) — join style */
      .fc .fc-button-group {
        gap: 0 !important;
      }
      .fc .fc-button-group > .fc-button {
        border-radius: 0 !important;
      }
      .fc .fc-button-group > .fc-button:first-child {
        border-top-left-radius: var(--rounded-btn, 0.5rem) !important;
        border-bottom-left-radius: var(--rounded-btn, 0.5rem) !important;
      }
      .fc .fc-button-group > .fc-button:last-child {
        border-top-right-radius: var(--rounded-btn, 0.5rem) !important;
        border-bottom-right-radius: var(--rounded-btn, 0.5rem) !important;
      }
      .fc .fc-button-group > .fc-button:not(:last-child) {
        border-right-width: 0 !important;
      }
      /* "Vandaag" today button — primary style */
      .fc .fc-today-button {
        background-color: oklch(var(--p)) !important;
        border-color: oklch(var(--p)) !important;
        color: oklch(var(--pc)) !important;
        font-weight: 600 !important;
      }
      .fc .fc-today-button:hover:not(:disabled) {
        background-color: oklch(var(--p) / 0.85) !important;
        border-color: oklch(var(--p) / 0.85) !important;
      }
      .fc .fc-today-button:disabled {
        background-color: oklch(var(--p) / 0.5) !important;
        border-color: oklch(var(--p) / 0.5) !important;
        color: oklch(var(--pc)) !important;
        opacity: 0.5 !important;
      }
      
      /* Day cells */
      .fc-col-header-cell {
        border-bottom: 1px solid oklch(var(--bc) / 0.1);
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.6875rem;
        color: oklch(var(--bc) / 0.6);
        padding: 0.5rem 0.25rem;
      }
      .fc-daygrid-day-frame {
        padding: 0.25rem;
        min-height: 5rem;
      }
      
      /* Today highlight */
      .fc-daygrid-day.fc-day-today {
        background-color: oklch(var(--p) / 0.03) !important;
      }
      .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
        background-color: oklch(var(--p));
        color: oklch(var(--pc));
        border-radius: 0.375rem;
        font-weight: 600;
      }
      
      /* Events — DaisyUI card style */
      .fc-event {
        cursor: pointer;
        background-color: var(--event-bg, oklch(var(--b2))) !important;
        border: none !important;
        color: var(--event-text, oklch(var(--bc))) !important;
        font-weight: 500;
        font-size: 0.8125rem;
        padding: 0.375rem 0.5rem !important;
        margin-bottom: 0.25rem !important;
        border-radius: var(--rounded-btn, 0.5rem) !important;
        box-shadow: 0 1px 2px oklch(var(--bc) / 0.08);
        transition: all 0.15s ease;
        overflow: visible !important;
        position: relative;
      }
      .fc-event:hover {
        transform: translateY(-1px);
        box-shadow: 0 3px 8px oklch(var(--bc) / 0.12);
      }
      .fc-event-title,
      .fc-event-time {
        color: inherit !important;
      }

      /* Event card inner layout */
      .fc-event-card {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        line-height: 1.3;
        width: 100%;
        position: relative;
      }
      .fc-event-card .event-type-label {
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.85;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-right: 0.75rem; /* space for status dot */
      }
      .fc-event-card .event-detail-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem;
        font-size: 0.6875rem;
        font-weight: 500;
        opacity: 0.7;
      }
      .fc-event-card .event-detail-row .event-time {
        white-space: nowrap;
      }
      .fc-event-card .event-detail-row .event-reg {
        display: flex;
        align-items: center;
        gap: 0.2rem;
        white-space: nowrap;
        flex-shrink: 0;
      }

      /* Status dot — top-right */
      .fc-event-card .status-dot {
        position: absolute;
        top: 0;
        right: 0;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background-color: var(--status-dot, oklch(var(--n)));
        border: 1.5px solid oklch(var(--b1));
      }

      /* Hide default FC dot */
      .fc-daygrid-event-dot {
        display: none !important;
      }
      .fc-daygrid-block-event .fc-event-main {
        padding: 0 !important;
      }
      
      /* Status Legend */
      .legend-warning {
        background-color: oklch(var(--wa) / 0.15) !important;
        border-color: oklch(var(--wa) / 0.3) !important;
        color: oklch(var(--bc)) !important;
      }
      .legend-success {
        background-color: oklch(var(--su) / 0.15) !important;
        border-color: oklch(var(--su) / 0.3) !important;
        color: oklch(var(--bc)) !important;
      }
      .legend-neutral {
        background-color: oklch(var(--n) / 0.15) !important;
        border-color: oklch(var(--n) / 0.3) !important;
        color: oklch(var(--bc)) !important;
      }
      .legend-info {
        background-color: oklch(var(--in) / 0.15) !important;
        border-color: oklch(var(--in) / 0.3) !important;
        color: oklch(var(--bc)) !important;
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
                <button class="btn btn-sm btn-outline" onclick="openEventTypeMappingModal()">
                  <i data-lucide="tags" class="w-4 h-4"></i> Event Type Mapping
                </button>
                <button id="btnSync" class="btn btn-sm btn-primary" onclick="runSync()">
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
            <div class="alert alert-warning">
              <i data-lucide="alert-triangle" class="w-5 h-5"></i>
              <div>
                <h3 class="font-bold">Discrepanc fixes (<span id="discrepancyCount">0</span>)</h3>
                <p class="text-sm">Events out of sync between Odoo and WordPress</p>
              </div>
            </div>
            <div id="discrepancyList" class="mt-4 space-y-2"></div>
          </div>

          <!-- Filter Tabs -->
          <div id="filterTabs" class="tabs tabs-boxed mb-6" role="tablist">
            <a role="tab" id="tabAll" class="tab tab-active" onclick="switchTab('all')">Alle</a>
            <a role="tab" id="tabUpcoming" class="tab" onclick="switchTab('upcoming')">Komend</a>
            <a role="tab" id="tabPast" class="tab" onclick="switchTab('past')">Verleden</a>
            <a role="tab" id="tabPublished" class="tab" onclick="switchTab('published')">Published</a>
            <a role="tab" id="tabDraft" class="tab" onclick="switchTab('draft')">Draft</a>
            <a role="tab" id="tabOutOfSync" class="tab" onclick="switchTab('out_of_sync')">Out of Sync</a>
            <a role="tab" id="tabArchived" class="tab" onclick="switchTab('archived')">Archived</a>
          </div>

          <!-- Loading State -->
          <div id="loadingState" class="flex justify-center items-center py-12" style="display: none;">
            <span class="loading loading-spinner loading-lg text-primary"></span>
          </div>

          <!-- Empty State -->
          <div id="emptyState" class="hidden text-center py-12">
            <i data-lucide="inbox" class="w-16 h-16 mx-auto text-base-content/20 mb-4"></i>
            <p class="text-lg text-base-content/60">Geen events gevonden</p>
          </div>

          <!-- Table View -->
          <div id="dataTable" class="hidden overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Naam</th>
                  <th>Datum</th>
                  <th>Tijd</th>
                  <th>Duur</th>
                  <th class="text-center">Aanmeldingen</th>
                  <th>Event Type</th>
                  <th>Status</th>
                  <th>WP</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="webinarTableBody"></tbody>
            </table>
          </div>

          <!-- Calendar Workspace (Addendum D) -->
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
                <div class="card bg-base-100 shadow-xl sticky top-4 overflow-visible">
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

    <!-- Toast Container -->
    <div id="toastContainer" class="toast toast-top toast-end z-50"></div>

    <!-- Feedback Modal (Sync / Publish results) -->
    <dialog id="feedbackModal" class="modal">
      <div class="modal-box">
        <h3 id="feedbackModalTitle" class="font-bold text-lg mb-4 flex items-center gap-2"></h3>
        <div id="feedbackModalBody" class="space-y-3"></div>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Sluiten</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <!-- Event Type Mapping Modal -->
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

    <!-- Bootstrap Script (ES Module) -->
    <script type="module">
      // ── Bootstrap: Event Operations Frontend (Addendum D Refactor) ──
      
      import {  appState,
        setWebinars,
        setSnapshots,
        setMappings,
        setRegistrations,
        setEditorialOverride,
        setCurrentEvent,
        subscribe
      } from '/state-store.js';
      
      import { initializeCalendar, refreshCalendar } from '/calendar-controller.js';
      import { initializeDetailPanel } from '/detail-panel-controller.js';
      import { initializeEditorModal } from '/editor-controller.js';
      
      // ── Theme Management ──
      function changeTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('selectedTheme', theme);
        // Sync theme selector dropdown
        const selector = document.getElementById('themeSelector');
        if (selector) selector.value = theme;
      }
      window.changeTheme = changeTheme;
      
      function initTheme() {
        const savedTheme = localStorage.getItem('selectedTheme') || 'light';
        changeTheme(savedTheme);
      }

      // ── Navbar Actions ──
      async function logout() {
        try {
          await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (err) {
          console.error('Logout error:', err);
        }
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      }
      window.logout = logout;

      function syncProdData() {
        alert('Sync production data not available in this module');
      }
      window.syncProdData = syncProdData;

      const STATUS_BADGES = ${JSON.stringify(STATUS_BADGES)};

      let isInitialLoad = true;

      // ── Toast / Notifications ──
      function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const alertClass = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
        const toast = document.createElement('div');
        toast.className = 'alert ' + alertClass + ' text-sm py-2 px-4';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }
      
      // Make globally available
      window.showNotification = showToast;

      // ── Feedback Modal ──
      function showFeedbackModal(title, icon, bodyHtml) {
        const modal = document.getElementById('feedbackModal');
        const titleEl = document.getElementById('feedbackModalTitle');
        const bodyEl = document.getElementById('feedbackModalBody');
        titleEl.innerHTML = '<i data-lucide="' + icon + '" class="w-5 h-5"></i> ' + title;
        bodyEl.innerHTML = bodyHtml;
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [titleEl, bodyEl] });
        modal.showModal();
      }

      // ── State management (legacy for table view) ──
      let activeTab = 'all';

      // ── Filter webinars by tab ──
      function filterWebinars(webinars, tab) {
        if (tab === 'all') return webinars;
        
        const now = new Date();
        
        return webinars.filter(webinar => {
          const snapshot = appState.snapshots[webinar.id];
          const state = snapshot ? snapshot.computed_state : 'not_published';
          
          let eventDatetime = null;
          if (webinar.x_start_datetime) {
            try {
              let isoString = webinar.x_start_datetime.trim();
              
              if (isoString.includes(' ') && !isoString.includes('T')) {
                isoString = isoString.replace(' ', 'T') + 'Z';
              } else if (isoString.includes('T') && !isoString.endsWith('Z')) {
                isoString = isoString + 'Z';
              }
              
              eventDatetime = new Date(isoString);
              
              if (isNaN(eventDatetime.getTime())) {
                console.warn('[filterWebinars] Invalid datetime for webinar',  webinar.id, ':', webinar.x_start_datetime);
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
      window.switchTab = function switchTab(tab) {
        activeTab = tab;
        
        document.querySelectorAll('.tabs .tab').forEach(el => el.classList.remove('tab-active'));
        const tabId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const tabEl = document.getElementById(tabId);
        if (tabEl) tabEl.classList.add('tab-active');
        
        window.location.hash = 'tab=' + tab;
        
        const filteredWebinars = filterWebinars(appState.webinars, activeTab);
        const currentView = localStorage.getItem('eventOpsViewMode') || 'table';
        
        if (currentView === 'calendar') {
          // Update appState and refresh calendar
          setWebinars(filteredWebinars);
          refreshCalendar();
        } else {
          renderTable(filteredWebinars);
        }
      };

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

          // Update state store
          setWebinars(webinarsRes.data.webinars || []);
          setRegistrations(webinarsRes.data.registrationCounts || {});
          
          const snapshotMap = {};
          for (const snap of (snapshotsRes.data || [])) {
            snapshotMap[snap.odoo_webinar_id] = snap;
          }
          setSnapshots(snapshotMap);
          
          setMappings(mappingsRes.success ? mappingsRes.data : []);

          // Load editorial overrides from snapshot data
          for (const snap of (snapshotsRes.data || [])) {
            if (snap.editorial_content && snap.editorial_content.blocks) {
              // editorial_content is JSONB { blocks: [...], version: 1 }
              // Convert blocks to HTML string before storing as editorial override
              const html = snap.editorial_content.blocks.map(block => {
                if (!block || !block.type) return '';
                if (block.type === 'paragraph') return '<p>' + escapeHtml(block.content || '') + '</p>';
                if (block.type === 'shortcode' && block.name) {
                  const attrs = Object.entries(block.attributes || {}).map(([k, v]) => k + '="' + escapeHtml(String(v)) + '"').join(' ');
                  return attrs ? '[' + block.name + ' ' + attrs + ']' : '[' + block.name + ']';
                }
                return '';
              }).filter(Boolean).join('\\n');
              if (html) setEditorialOverride(snap.odoo_webinar_id, html);
            }
          }

          // Restore active tab from URL hash
          initTabFromHash();
          
          // Render table data (only on initial load, subsequent loads handled in finally)
          if (isInitialLoad) {
            const filteredWebinars = filterWebinars(appState.webinars, activeTab);
            renderTable(filteredWebinars);
          }
        } catch (err) {
          showToast('Failed to load: ' + err.message, 'error');
        } finally {
          document.getElementById('loadingState').style.display = 'none';
          if (isInitialLoad) {
            initView();
            isInitialLoad = false;
          } else {
            // Refresh in-place — preserve current view and scroll position
            const currentView = localStorage.getItem('eventOpsViewMode') || 'table';
            const filteredWebinars = filterWebinars(appState.webinars, activeTab);
            setWebinars(filteredWebinars);
            if (currentView === 'calendar') {
              refreshCalendar();
            } else {
              renderTable(filteredWebinars);
            }
            // Re-render detail panel if an event is selected
            if (appState.currentEventId) {
              setCurrentEvent(appState.currentEventId);
            }
          }
        }
      }

      // ── Init tab from URL hash ──
      function initTabFromHash() {
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const tabParam = params.get('tab');
        
        if (tabParam && ['all', 'upcoming', 'past', 'published', 'draft', 'out_of_sync', 'archived'].includes(tabParam)) {
          activeTab = tabParam;
          
          document.querySelectorAll('.tabs .tab').forEach(el => el.classList.remove('tab-active'));
          const tabId = 'tab' + tabParam.charAt(0).toUpperCase() + tabParam.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          const tabEl = document.getElementById(tabId);
          if (tabEl) tabEl.classList.add('tab-active');
        }
      }

      // ── Render table (legacy table view) ──
      function renderTable(webinars = appState.webinars) {
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
          const snap = appState.snapshots[webinar.id];
          const state = snap ? snap.computed_state : 'not_published';
          const badge = STATUS_BADGES[state] || STATUS_BADGES.not_published;
          const wpId = snap?.wp_snapshot?.id;
          const regCount = appState.registrations[webinar.id] || 0;
          
          let eventTypeHtml = '—';
          if (Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1) {
            const eventTypeName = webinar.x_webinar_event_type_id[1] || ('Event Type #' + webinar.x_webinar_event_type_id[0]);
            eventTypeHtml = '<span class="badge badge-outline badge-sm">' + escapeHtml(eventTypeName) + '</span>';
          }
          
          const datetime = formatEventDateTime(webinar);
          const duration = webinar.x_duration_minutes ? webinar.x_duration_minutes + ' min' : '—';
          
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

        const discrepancies = webinars.filter(w => {
          const s = appState.snapshots[w.id];
          return s && s.computed_state === 'out_of_sync';
        });
        renderDiscrepancies(discrepancies);
        
        lucide.createIcons();
      }

      // ── Render action buttons ──
      function renderActions(webinarId, state) {
        if (state === 'not_published') {
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
        if (state === 'draft' || state === 'out_of_sync' || state === 'published') {
          return '<div class="dropdown dropdown-end">' +
            '<div tabindex="0" role="button" class="btn ' + (state === 'out_of_sync' ? 'btn-warning' : 'btn-primary') + ' btn-xs">' +
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
      window.publishWebinar = async function publishWebinar(odooWebinarId, btn, status = 'publish') {
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>'; }
        
        try {
          const res = await fetch('/events/api/publish', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ odoo_webinar_id: odooWebinarId, status: status })
          }).then(r => r.json());

          if (res.success) {
            const statusLabels = { draft: 'Concept', private: 'Privé', publish: 'Gepubliceerd' };
            const statusLabel = statusLabels[status] || status;
            await loadData();
            showFeedbackModal('Publicatie geslaagd', 'check-circle',
              '<div class="alert alert-success">' +
                '<div>' +
                  '<p class="font-semibold">Webinar ' + odooWebinarId + ' is gepubliceerd</p>' +
                  '<p class="text-sm">Status: ' + statusLabel + ' &bull; WordPress ID: #' + res.data.wp_event_id + '</p>' +
                '</div>' +
              '</div>'
            );
          } else {
            showFeedbackModal('Publicatie mislukt', 'alert-circle',
              '<div class="alert alert-error"><p>' + escapeHtml(res.error) + '</p></div>'
            );
          }
        } catch (err) {
          showFeedbackModal('Publicatie fout', 'alert-circle',
            '<div class="alert alert-error"><p>' + escapeHtml(err.message) + '</p></div>'
          );
        } finally {
          if (btn) { btn.disabled = false; }
        }
      };

      // ── Sync ──
      window.runSync = async function runSync() {
        const btn = document.getElementById('btnSync');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Syncing...';

        try {
          const res = await fetch('/events/api/sync', {
            method: 'POST',
            credentials: 'include'
          }).then(r => r.json());

          if (res.success) {
            await loadData();
            let bodyHtml = '<div class="alert alert-success"><div>' +
              '<p class="font-semibold">' + res.data.synced_count + ' webinars gesynchroniseerd</p>' +
              '</div></div>';
            if (res.data.discrepancies.length > 0) {
              bodyHtml += '<div class="alert alert-warning mt-2"><div>' +
                '<p class="font-semibold">' + res.data.discrepancies.length + ' discrepanties gevonden:</p>' +
                '<ul class="list-disc list-inside text-sm mt-1">';
              for (const d of res.data.discrepancies) {
                bodyHtml += '<li>#' + d.odoo_webinar_id + ' — ' + escapeHtml(d.title) + '</li>';
              }
              bodyHtml += '</ul></div></div>';
            }
            showFeedbackModal('Synchronisatie voltooid', 'refresh-cw', bodyHtml);
          } else {
            showFeedbackModal('Synchronisatie mislukt', 'alert-circle',
              '<div class="alert alert-error"><p>' + escapeHtml(res.error) + '</p></div>'
            );
          }
        } catch (err) {
          showFeedbackModal('Synchronisatie fout', 'alert-circle',
            '<div class="alert alert-error"><p>' + escapeHtml(err.message) + '</p></div>'
          );
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync All';
          lucide.createIcons();
        }
      };

      // ── View Switching (Table + Calendar) ──
      window.switchView = function switchView(viewType) {
        const tableContainer = document.getElementById('dataTable');
        const calendarWorkspace = document.getElementById('calendarWorkspace');
        const emptyState = document.getElementById('emptyState');
        const tableBtn = document.getElementById('viewBtnTable');
        const calendarBtn = document.getElementById('viewBtnCalendar');
        const filterTabs = document.getElementById('filterTabs');
        const statusLegend = document.getElementById('statusLegend');
        
        const filteredWebinars = filterWebinars(appState.webinars, activeTab);
        
        if (viewType === 'table') {
          tableContainer.classList.remove('hidden');
          calendarWorkspace.classList.add('hidden');
          tableBtn.classList.add('btn-active');
          calendarBtn.classList.remove('btn-active');
          if (filterTabs) filterTabs.classList.remove('hidden');
          if (statusLegend) statusLegend.classList.add('hidden');
          renderTable(filteredWebinars);
        } else if (viewType === 'calendar') {
          tableContainer.classList.add('hidden');
          emptyState.classList.add('hidden');
          calendarWorkspace.classList.remove('hidden');
          tableBtn.classList.remove('btn-active');
          calendarBtn.classList.add('btn-active');
          if (filterTabs) filterTabs.classList.add('hidden');
          if (statusLegend) statusLegend.classList.remove('hidden');
          
          // Update state and initialize calendar
          setWebinars(filteredWebinars);
          initializeCalendar();
        }
        
        localStorage.setItem('eventOpsViewMode', viewType);
      };

      function initView() {
        const savedView = localStorage.getItem('eventOpsViewMode') || 'table';
        if (savedView === 'calendar') {
          setTimeout(() => switchView('calendar'), 100);
        }
      }

      // ── Helper: Format UTC datetime to Brussels timezone ──
      function formatEventDateTime(webinar) {
        const utcDatetimeStr = webinar.x_studio_event_datetime;
        if (!utcDatetimeStr) return { date: '—', time: '—' };
        
        try {
          let isoString = utcDatetimeStr.trim();
          
          if (isoString.includes(' ') && !isoString.includes('T')) {
            isoString = isoString.replace(' ', 'T') + 'Z';
          } else if (isoString.includes('T') && !isoString.endsWith('Z')) {
            isoString = isoString + 'Z';
          }
          
          const date = new Date(isoString);
          
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
      
      // Make globally available
      window.formatEventDateTime = formatEventDateTime;

      // ── Helper: Escape HTML ──
      function escapeHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
      }

      // ── Initialize Controllers ──
      initTheme();
      initializeDetailPanel();
      initializeEditorModal();
      
      // ── Load Data & Render ──
      loadData();
      lucide.createIcons();
    </script>
    <script src="/event-operations-client.js"></script>
</body>
</html>`;
}
