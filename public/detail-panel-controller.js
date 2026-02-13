/**
 * DETAIL PANEL CONTROLLER - Event Operations Frontend
 * 
 * Responsibilities:
 * - Listen to currentEventId state changes
 * - Render detail panel once
 * - Update fields without destroying entire DOM
 * - Bind buttons once via event delegation
 * 
 * Does NOT:
 * - Fetch data
 * - Initialize editor (delegates to editor-controller)
 * - Publish directly (calls global publishWebinar function)
 * - Know about calendar internals
 * 
 * Part of: ADDENDUM D - Calendar Workspace & Editorial Layer
 * Frontend Refactor Architecture
 */

import { 
  subscribe, 
  getWebinar, 
  getSnapshot, 
  getRegistrationCount,
  hasEventTypeMapping,
  getActiveDescription
} from './state-store.js';

let panelInitialized = false;
let emptyStateEl = null;
let contentEl = null;

/**
 * Initialize detail panel
 * Call once on page load
 */
export function initializeDetailPanel() {
  if (panelInitialized) return;

  emptyStateEl = document.getElementById('panel-empty-state');
  contentEl = document.getElementById('panel-content');

  if (!emptyStateEl || !contentEl) {
    console.error('[DetailPanel] Required elements not found');
    return;
  }

  // Bind event delegation once
  bindEventDelegation();

  // Subscribe to state changes
  subscribe('currentEventId', handleEventChange);

  panelInitialized = true;
}

/**
 * Bind event delegation (once only)
 */
function bindEventDelegation() {
  contentEl.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn || actionBtn.disabled) return;

    e.preventDefault();

    const action = actionBtn.dataset.action;
    const webinarId = parseInt(actionBtn.dataset.webinarId);
    const status = actionBtn.dataset.status;

    if (action === 'edit') {
      // Delegate to editor controller
      if (typeof window.openEditorialEditor === 'function') {
        window.openEditorialEditor(webinarId);
      }
    } else if (action === 'publish') {
      // Close dropdown by blurring the trigger
      const dropdown = actionBtn.closest('.dropdown');
      if (dropdown) dropdown.querySelector('[tabindex]')?.blur();

      // Call global publishWebinar function
      if (typeof window.publishWebinar === 'function') {
        await window.publishWebinar(webinarId, null, status);
      }
    }
  });
}

/**
 * Handle event change from state
 */
function handleEventChange(webinarId) {
  if (!webinarId) {
    showEmptyState();
    return;
  }

  const webinar = getWebinar(webinarId);
  if (!webinar) {
    showEmptyState();
    return;
  }

  const snapshot = getSnapshot(webinarId);
  const regCount = getRegistrationCount(webinarId);

  updatePanel(webinar, snapshot, regCount);
}

/**
 * Show empty state
 */
function showEmptyState() {
  emptyStateEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
}

/**
 * Hide empty state
 */
function hideEmptyState() {
  emptyStateEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
}

/**
 * Update panel (render content)
 */
function updatePanel(webinar, snapshot, regCount) {
  hideEmptyState();

  const state = computeState(webinar, snapshot);
  const isArchived = !webinar.x_active;
  const eventTypeId = Array.isArray(webinar.x_webinar_event_type_id) 
    ? webinar.x_webinar_event_type_id[0] 
    : null;
  const hasMapping = hasEventTypeMapping(eventTypeId);
  const wpPostId = snapshot?.wp_snapshot?.id;

  // Render content
  contentEl.innerHTML = renderContent(webinar, snapshot, state, regCount, isArchived, hasMapping, wpPostId);

  // Re-initialize Lucide icons
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

/**
 * Render panel content
 */
function renderContent(webinar, snapshot, state, regCount, isArchived, hasMapping, wpPostId) {
  const statusBadge = getStatusBadge(state);
  const eventTypeName = getEventTypeName(webinar);
  const formattedDate = formatEventDateTime(webinar);

  return `
    <div class="space-y-4">
      <!-- Title + Status -->
      <div>
        <h3 class="text-lg font-semibold mb-1">${escapeHtml(webinar.x_name || 'Untitled Event')}</h3>
        ${statusBadge}
      </div>

      <!-- Metadata -->
      <div class="space-y-2 text-sm">
        ${renderMetaRow('calendar', 'Datum', formattedDate)}
        ${renderMetaRow('clock', 'Duur', `${webinar.x_studio_event_duration_minutes || 0} minuten`)}
        ${renderMetaRow('users', 'Inschrijvingen', regCount)}
        ${renderMetaRow('tag', 'Event Type', eventTypeName)}
        ${wpPostId ? renderMetaRow('external-link', 'WordPress', `<a href="${snapshot.wp_snapshot?.url || '#'}" target="_blank" class="link link-primary">Bekijk post (#${wpPostId})</a>`) : ''}
      </div>

      <!-- Actions -->
      <div class="space-y-2">
        <!-- Edit Description -->
        <button 
          data-action="edit" 
          data-webinar-id="${webinar.id}"
          class="btn btn-sm btn-outline w-full"
          ${isArchived ? 'disabled' : ''}
        >
          <i data-lucide="edit-3" class="w-4 h-4"></i>
          Beschrijving bewerken
        </button>

        <!-- Publish Dropdown -->
        <div class="dropdown dropdown-end w-full">
          <button 
            class="btn btn-sm btn-primary w-full" 
            tabindex="0"
            ${isArchived || !hasMapping ? 'disabled' : ''}
          >
            <i data-lucide="upload" class="w-4 h-4"></i>
            Publiceren naar WordPress
            <i data-lucide="chevron-down" class="w-4 h-4"></i>
          </button>
          <ul tabindex="0" class="dropdown-content menu bg-base-200 rounded-box z-10 w-full p-2 shadow">
            <li>
              <a data-action="publish" data-webinar-id="${webinar.id}" data-status="publish">
                <i data-lucide="check-circle" class="w-4 h-4"></i>
                Publiceren
              </a>
            </li>
            <li>
              <a data-action="publish" data-webinar-id="${webinar.id}" data-status="draft">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                Concept
              </a>
            </li>
            <li>
              <a data-action="publish" data-webinar-id="${webinar.id}" data-status="private">
                <i data-lucide="lock" class="w-4 h-4"></i>
                Privé
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

/**
 * Compute state (matches calendar controller logic)
 */
function computeState(webinar, snapshot) {
  const isArchived = !webinar.x_active;
  if (isArchived) return 'archived';

  // Use backend-computed state if available (most reliable)
  if (snapshot?.computed_state && snapshot.computed_state !== 'not_published') {
    const hasDiscrepancy = checkDiscrepancy(webinar, snapshot);
    if (hasDiscrepancy) return 'out_of_sync';
    return snapshot.computed_state;
  }

  // Fallback: check wp_snapshot for publish status
  const wpId = snapshot?.wp_snapshot?.id;
  if (!wpId || wpId <= 0) return 'not_published';

  const hasDiscrepancy = checkDiscrepancy(webinar, snapshot);
  if (hasDiscrepancy) return 'out_of_sync';

  const wpStatus = snapshot?.wp_snapshot?.status || 'draft';
  if (wpStatus === 'publish') return 'published';
  return 'draft';
}

/**
 * Check for discrepancies
 */
function checkDiscrepancy(webinar, snapshot) {
  if (!snapshot || !snapshot.wp_snapshot) return false;

  const wp = snapshot.wp_snapshot;

  // Title mismatch
  const wpTitle = typeof wp.title === 'object' ? wp.title?.rendered : wp.title;
  if (wpTitle && webinar.x_name && webinar.x_name !== wpTitle) return true;

  // Date mismatch (compare date portion only)
  if (wp.start_date && webinar.x_studio_event_datetime) {
    const normalizeDate = (s) => s ? s.replace(' ', 'T').split('T')[0] : '';
    if (normalizeDate(webinar.x_studio_event_datetime) !== normalizeDate(wp.start_date)) return true;
  }

  return false;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(state) {
  const badgeMap = {
    'out_of_sync': '<span class="badge badge-warning badge-sm">Out of Sync</span>',
    'published': '<span class="badge badge-success badge-sm">Published</span>',
    'draft': '<span class="badge badge-neutral badge-sm">Draft</span>',
    'not_published': '<span class="badge badge-ghost badge-sm">Not Published</span>',
    'archived': '<span class="badge badge-info badge-sm">Archived</span>'
  };
  return badgeMap[state] || '';
}

/**
 * Render metadata row
 */
function renderMetaRow(icon, label, value) {
  return `
    <div class="flex items-start gap-2">
      <i data-lucide="${icon}" class="w-4 h-4 text-base-content/60 mt-0.5"></i>
      <div class="flex-1">
        <span class="text-base-content/60">${label}:</span>
        <span class="ml-1">${value}</span>
      </div>
    </div>
  `;
}

/**
 * Get event type name
 */
function getEventTypeName(webinar) {
  if (Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1) {
    return webinar.x_webinar_event_type_id[1];
  }
  return '—';
}

/**
 * Format event date/time (uses global function from ui.js)
 */
function formatEventDateTime(webinar) {
  if (typeof window.formatEventDateTime === 'function') {
    const result = window.formatEventDateTime(webinar);
    // window.formatEventDateTime returns { date: '...', time: '...' }
    if (result && typeof result === 'object' && result.date && result.time) {
      return `${result.date} om ${result.time}`;
    }
    return result || '—';
  }
  return webinar.x_studio_event_datetime || '—';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
