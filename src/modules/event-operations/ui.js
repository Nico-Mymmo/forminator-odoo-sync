/**
 * Event Operations - UI
 * 
 * HTML rendering for Event Operations module.
 * Follows existing module conventions (daisyUI 4.12.14 + Tailwind only).
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
</head>
<body class="bg-base-200">
    ${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8 max-w-6xl">

          <!-- Header -->
          <div class="flex items-center justify-between mb-8">
            <div>
              <h1 class="text-4xl font-bold mb-2">Event Operations</h1>
              <p class="text-base-content/60">Odoo webinar → WordPress publication</p>
            </div>
            <div class="flex gap-2">
              <!-- View toggle -->
              <div class="join">
                <button id="viewBtnTable" class="btn btn-sm btn-outline join-item btn-active" onclick="switchView('table')">
                  <i data-lucide="table" class="w-4 h-4"></i> Table
                </button>
                <button id="viewBtnCards" class="btn btn-sm btn-outline join-item" onclick="switchView('cards')">
                  <i data-lucide="layout-grid" class="w-4 h-4"></i> Cards
                </button>
              </div>
              <button id="btnTags" class="btn btn-outline btn-sm gap-2" onclick="openTagModal()">
                <i data-lucide="tag" class="w-4 h-4"></i> Tags
              </button>
              <button id="btnSync" class="btn btn-outline btn-sm gap-2" onclick="runSync()">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync All
              </button>
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

          <!-- Filter tabs -->
          <div class="tabs tabs-boxed mb-6 bg-base-100 shadow-sm">
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

          <!-- Tag Mappings Modal -->
          <dialog id="tagModal" class="modal">
            <div class="modal-box max-w-4xl">
              <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                <i data-lucide="tag" class="w-5 h-5"></i>
                Tag Mappings
              </h3>
              
              <!-- Loading State -->
              <div id="tagMappingLoading" class="flex justify-center py-8">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
              
              <!-- Content -->
              <div id="tagMappingContent" class="hidden">
                <p class="text-sm text-base-content/70 mb-4">
                  Map Odoo tags to WordPress Event Categories. When a webinar has tags, they will be published as categories.
                </p>
                
                <!-- Add New Mapping Form -->
                <div class="card bg-base-200 mb-4">
                  <div class="card-body">
                    <h4 class="font-semibold mb-2">Add New Mapping</h4>
                    <div class="flex gap-2">
                      <select id="odooTagSelect" class="select select-bordered select-sm flex-1">
                        <option value="">Select Odoo Tag...</option>
                      </select>
                      <select id="wpCategorySelect" class="select select-bordered select-sm flex-1">
                        <option value="">Select WP Category...</option>
                      </select>
                      <button id="btnAddTagMapping" class="btn btn-primary btn-sm" onclick="addTagMapping()">
                        <i data-lucide="plus" class="w-4 h-4"></i> Add
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Existing Mappings Table -->
                <div class="overflow-x-auto">
                  <table class="table table-zebra table-sm">
                    <thead>
                      <tr>
                        <th>Odoo Tag</th>
                        <th>WordPress Category</th>
                        <th class="w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="tagMappingTableBody">
                      <!-- Populated by loadTagMappings() -->
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
                        <th class="w-32">Tags</th>
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

          <!-- Cards view -->
          <div id="cardsContainer" class="hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>

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
      let tagNamesMap = new Map(); // tag_id → tag_name
      let activeTab = 'all'; // Current filter tab

      // ── Filter webinars by tab ──
      function filterWebinars(webinars, tab) {
        if (tab === 'all') return webinars;
        
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today
        
        return webinars.filter(webinar => {
          const snapshot = snapshotMap.get(webinar.id);
          const state = snapshot ? snapshot.computed_state : 'not_published';
          
          // Parse date - Odoo format can be DD/MM/YYYY or YYYY-MM-DD
          let eventDate = null;
          if (webinar.x_studio_date) {
            const dateStr = webinar.x_studio_date.trim();
            
            // Try DD/MM/YYYY format first
            if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
                const year = parseInt(parts[2], 10);
                eventDate = new Date(year, month, day);
              }
            } 
            // Try YYYY-MM-DD format
            else if (dateStr.includes('-')) {
              eventDate = new Date(dateStr);
            }
            
            // Validate date
            if (eventDate && isNaN(eventDate.getTime())) {
              console.warn('[filterWebinars] Invalid date for webinar', webinar.id, ':', webinar.x_studio_date);
              eventDate = null;
            } else if (eventDate) {
              eventDate.setHours(0, 0, 0, 0); // Normalize to start of day
            }
          }
          
          switch (tab) {
            case 'upcoming':
              return eventDate && eventDate >= now && state !== 'archived';
            case 'past':
              return eventDate && eventDate < now && state !== 'archived';
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
          const [webinarsRes, snapshotsRes, tagsRes] = await Promise.all([
            fetch('/events/api/odoo-webinars?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json()),
            fetch('/events/api/snapshots?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json()),
            fetch('/events/api/odoo-tags?_t=' + Date.now(), { credentials: 'include' }).then(r => r.json())
          ]);

          if (!webinarsRes.success) throw new Error(webinarsRes.error);
          if (!snapshotsRes.success) throw new Error(snapshotsRes.error);
          if (!tagsRes.success) throw new Error(tagsRes.error);

          odooWebinars = webinarsRes.data.webinars || [];
          registrationCounts = webinarsRes.data.registrationCounts || {};
          
          snapshotMap.clear();
          for (const snap of (snapshotsRes.data || [])) {
            snapshotMap.set(snap.odoo_webinar_id, snap);
          }
          
          tagNamesMap.clear();
          for (const tag of (tagsRes.data || [])) {
            tagNamesMap.set(tag.id, tag.x_name);
          }
          
          // Make tagNamesMap available to external client.js
          window.tagNamesMap = tagNamesMap;

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
          
          // Render tags badges
          let tagsHtml = '—';
          if (webinar.x_studio_tag_ids && Array.isArray(webinar.x_studio_tag_ids) && webinar.x_studio_tag_ids.length > 0) {
            tagsHtml = webinar.x_studio_tag_ids.map(tagId => {
              const tagName = tagNamesMap.get(tagId) || 'Tag #' + tagId;
              return '<span class="badge badge-outline badge-xs mr-1">' + escapeHtml(tagName) + '</span>';
            }).join('');
          }
          
          const tr = document.createElement('tr');
          tr.innerHTML = 
            '<td class="font-mono text-sm">' + webinar.id + '</td>' +
            '<td class="max-w-xs"><div class="truncate" title="' + escapeHtml(webinar.x_name) + '">' + escapeHtml(webinar.x_name) + '</div></td>' +
            '<td class="whitespace-nowrap">' + (webinar.x_studio_date || '—') + '</td>' +
            '<td class="whitespace-nowrap">' + (webinar.x_studio_starting_time || '—') + '</td>' +
            '<td class="text-center whitespace-nowrap"><span class="badge badge-neutral badge-sm">' + regCount + '</span></td>' +
            '<td class="whitespace-nowrap">' + tagsHtml + '</td>' +
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

      // ── View Switching ──
      function switchView(viewType) {
        const tableContainer = document.getElementById('dataTable');
        const cardsContainer = document.getElementById('cardsContainer');
        const tableBtn = document.getElementById('viewBtnTable');
        const cardsBtn = document.getElementById('viewBtnCards');
        
        const filteredWebinars = filterWebinars(odooWebinars, activeTab);
        
        if (viewType === 'table') {
          tableContainer.classList.remove('hidden');
          cardsContainer.classList.add('hidden');
          tableBtn.classList.add('btn-active');
          cardsBtn.classList.remove('btn-active');
          renderTable(filteredWebinars);
        } else {
          tableContainer.classList.add('hidden');
          cardsContainer.classList.remove('hidden');
          tableBtn.classList.remove('btn-active');
          cardsBtn.classList.add('btn-active');
          
          // Re-render cards with filtered data
          if (typeof renderCardsView === 'function') {
            renderCardsView(filteredWebinars, snapshotMap, registrationCounts);
          }
        }
        
        localStorage.setItem('eventOpsViewMode', viewType);
      }

      function initView() {
        const savedView = localStorage.getItem('eventOpsViewMode') || 'table';
        if (savedView === 'cards') {
          setTimeout(() => switchView('cards'), 100);
        }
      }

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
