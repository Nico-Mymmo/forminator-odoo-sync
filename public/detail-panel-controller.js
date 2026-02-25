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
  hasEventTypeMapping
} from './state-store.js';

let panelInitialized = false;
let emptyStateEl = null;
let contentEl = null;
let descriptionQuillEditor = null;
let descriptionQuillController = null;
let descriptionFormsCache = null;

const REGISTRATIONS_PER_PAGE = 25;
const registrationsCacheByWebinar = new Map();
const expandedQuestionsByWebinar = new Map();

/**
 * Clear registrations cache (call after sync to force fresh data)
 */
export function clearRegistrationsCache(webinarId = null) {
  if (webinarId) {
    registrationsCacheByWebinar.delete(webinarId);
  } else {
    registrationsCacheByWebinar.clear();
  }
}

function getExpandedQuestions(webinarId) {
  if (!expandedQuestionsByWebinar.has(webinarId)) {
    expandedQuestionsByWebinar.set(webinarId, new Set());
  }
  return expandedQuestionsByWebinar.get(webinarId);
}

function getRegistrationsCache(webinarId) {
  if (!registrationsCacheByWebinar.has(webinarId)) {
    registrationsCacheByWebinar.set(webinarId, {
      pages: new Map(),
      lastPage: 1,
      pagination: null,
      total: 0,
      loading: false
    });
  }
  return registrationsCacheByWebinar.get(webinarId);
}

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
    // Ctrl+Click on status badge → show sync comparison
    const badge = e.target.closest('.badge[data-action="compare-sync"]');
    if (badge && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const webinarId = parseInt(badge.dataset.webinarId);
      if (webinarId) showSyncComparison(webinarId);
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn || actionBtn.disabled) return;

    e.preventDefault();

    const action = actionBtn.dataset.action;
    const webinarId = parseInt(actionBtn.dataset.webinarId);
    const status = actionBtn.dataset.status;

    if (action === 'open-registrations-modal') {
      if (webinarId) {
        await openRegistrationsModal(webinarId);
      }
      return;
    }

    if (action === 'registrations-page') {
      const targetPage = parseInt(actionBtn.dataset.page || '1', 10);
      if (webinarId && Number.isInteger(targetPage) && targetPage > 0) {
        await renderRegistrationsPane(webinarId, targetPage);
      }
      return;
    }

    if (action === 'refresh-registrations') {
      if (webinarId) {
        const cache = getRegistrationsCache(webinarId);
        const page = cache.lastPage || 1;
        await renderRegistrationsModal(webinarId, page, { force: true });
      }
      return;
    }

    if (action === 'toggle-question') {
      const registrationId = parseInt(actionBtn.dataset.registrationId || '0', 10);
      if (webinarId && registrationId) {
        toggleQuestionExpansion(webinarId, registrationId);
      }
      return;
    }

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
    } else if (action === 'set-video-url') {
      if (webinarId && typeof window.recapHandleSetVideoUrl === 'function') {
        await window.recapHandleSetVideoUrl(webinarId);
      }
    } else if (action === 'clear-video-url') {
      if (webinarId && typeof window.recapHandleClearVideoUrl === 'function') {
        await window.recapHandleClearVideoUrl(webinarId);
      }
    } else if (action === 'trigger-thumb-upload') {
      const fi = document.getElementById('recap-thumb-file');
      if (fi) fi.click();
    } else if (action === 'save-recap-html') {
      if (webinarId && typeof window.recapHandleSaveHtml === 'function') {
        await window.recapHandleSaveHtml(webinarId);
      }
    } else if (action === 'send-recap') {
      if (webinarId && typeof window.recapOpenConfirmModal === 'function') {
        window.recapOpenConfirmModal(webinarId);
      }
    } else if (action === 'reset-recap') {
      if (webinarId && typeof window.recapOpenResetModal === 'function') {
        window.recapOpenResetModal(webinarId);
      }
    } else if (action === 'save-description') {
      if (webinarId) {
        await saveDescriptionInline(webinarId);
      }
    } else if (action === 'toggle-title-edit') {
      if (webinarId) {
        const isEditing = actionBtn.dataset.editing === 'true';
        if (isEditing) {
          await persistTitleOverride(webinarId);
          deactivateTitleEditor();
        } else {
          activateTitleEditor(webinarId);
        }
      }
    }
  });

  contentEl.addEventListener('keydown', async (e) => {
    const input = e.target.closest('#title-edit-input');
    if (!input || input.disabled) return;

    const webinarId = parseInt(input.dataset.webinarId || '0', 10);
    if (!webinarId) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      await persistTitleOverride(webinarId);
      deactivateTitleEditor();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      restoreTitleEditorValue(webinarId);
      deactivateTitleEditor();
    }
  });

  contentEl.addEventListener('toggle', (e) => {
    const detailsEl = e.target.closest('details[data-expander]');
    if (!detailsEl) return;
    syncExpanderChevron(detailsEl);
  });

  contentEl.addEventListener('change', async (e) => {
    const formPicker = e.target.closest('#description-form-picker');
    if (formPicker) {
      const webinarId = parseInt(formPicker.dataset.webinarId || '0', 10);
      if (webinarId) {
        await saveDescriptionSelectedForm(webinarId, formPicker.value || null);
      }
      return;
    }

    const checkbox = e.target.closest('input[data-action="toggle-attendance"]');
    if (!checkbox || checkbox.disabled) {
      return;
    }

    const webinarId = parseInt(checkbox.dataset.webinarId || '0', 10);
    const registrationId = parseInt(checkbox.dataset.registrationId || '0', 10);
    if (!webinarId || !registrationId) {
      return;
    }

    const attended = checkbox.checked;
    await handleSingleAttendanceUpdateByCheckbox(webinarId, registrationId, attended, checkbox);
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

  initializeInlineDescriptionEditor(webinar.id, webinar.x_studio_webinar_info || '', isArchived);
  initializeDescriptionFormPicker(webinar.id, snapshot?.selected_form_id || null, isArchived);
  syncExpanderChevrons();

  // Initialize recap section (async, non-blocking)
  if (typeof window.initRecapSection === 'function') {
    window.initRecapSection(webinar.id, webinar);
  }
}

/**
 * Render panel content
 */
function renderContent(webinar, snapshot, state, regCount, isArchived, hasMapping, wpPostId) {
  const statusBadge = getStatusBadge(state).replace(/__WID__/g, webinar.id);
  const eventTypeName = getEventTypeName(webinar);
  const formattedDate = formatEventDateTime(webinar);
  const registrationStatsBadges = renderRegistrationStatsBadges(snapshot?.registration_stats);
  const odooTitle = webinar.x_name || 'Untitled Event';
  const overrideTitle = snapshot?.title_override || '';
  const effectiveTitle = snapshot?.title_override || webinar.x_name || 'Untitled Event';

  return `
    <div class="space-y-4">
      <!-- Title + Status -->
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <h3
              class="text-lg font-semibold leading-tight"
              data-role="event-title"
              data-odoo-title="${escapeHtml(odooTitle)}"
              data-override-title="${escapeHtml(overrideTitle)}"
            >${escapeHtml(effectiveTitle)}</h3>
            <input
              id="title-edit-input"
              type="text"
              class="w-full hidden bg-transparent border-0 border-b border-base-content/25 rounded-none px-0 py-0 text-lg font-semibold leading-tight focus:outline-none focus:border-primary"
              value="${escapeHtml(effectiveTitle)}"
              data-webinar-id="${webinar.id}"
              ${isArchived ? 'disabled' : ''}
            >
          </div>
          <button
            data-action="toggle-title-edit"
            data-webinar-id="${webinar.id}"
            data-editing="false"
            class="btn btn-xs btn-ghost btn-circle"
            title="Titel bewerken"
            aria-label="Titel bewerken"
            ${isArchived ? 'disabled' : ''}
          >
            <i data-role="title-toggle-icon" data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <!-- Info (default open) -->
      <details class="pt-2 border-t border-base-200" data-expander open>
        <summary class="font-semibold text-sm flex items-center justify-between cursor-pointer list-none pb-3">
          <span class="flex items-center gap-2">
            <i data-lucide="info" class="w-4 h-4 text-primary"></i>
            Info
          </span>
          <i data-role="expander-chevron" data-lucide="chevron-down" class="w-4 h-4 text-base-content/60 transition-transform duration-200"></i>
        </summary>
        <div class="space-y-3">
          ${statusBadge}
          <div class="space-y-2 text-sm">
            ${renderMetaRow('calendar', 'Datum', formattedDate)}
            ${renderMetaRow('clock', 'Duur', `${webinar.x_studio_event_duration_minutes || 0} minuten`)}
            ${renderMetaRow('users', 'Inschrijvingen', `<button class="btn btn-ghost btn-xs px-2" data-action="open-registrations-modal" data-webinar-id="${webinar.id}">${regCount} bekijken</button>`)}
            ${renderMetaRow('tag', 'Event Type', eventTypeName)}
            ${wpPostId ? renderMetaRow('external-link', 'WordPress', `<a href="${snapshot.wp_snapshot?.url || '#'}" target="_blank" class="link link-primary">Bekijk post (#${wpPostId})</a>`) : ''}
          </div>
          ${registrationStatsBadges}
        </div>
      </details>

      <!-- ── Beschrijving (inline, geen modal) ── -->
      <details class="pt-4 border-t border-base-200" data-expander>
        <summary class="font-semibold text-sm flex items-center justify-between cursor-pointer list-none pb-3">
          <span class="flex items-center gap-2">
            <i data-lucide="file-text" class="w-4 h-4 text-primary"></i>
            Beschrijving
          </span>
          <i data-role="expander-chevron" data-lucide="chevron-down" class="w-4 h-4 text-base-content/60 transition-transform duration-200"></i>
        </summary>
        <div class="space-y-2">
          <div
            id="description-inline-editor"
            class="text-sm"
            style="min-height:220px;"
          ></div>
          <div class="pt-1">
            <label class="label py-0 pb-1">
              <span class="label-text text-xs font-medium">Inschrijfformulier</span>
            </label>
            <select
              id="description-form-picker"
              data-webinar-id="${webinar.id}"
              class="select select-bordered select-sm w-full"
              ${isArchived ? 'disabled' : ''}
            >
              <option value="">Geen formulier</option>
            </select>
          </div>
        </div>
      </details>

      <dialog id="registrations-modal-${webinar.id}" class="modal">
        <div class="modal-box max-w-6xl w-11/12">
          <h3 class="font-bold text-lg mb-2">Inschrijvingen</h3>
          <p class="text-sm text-base-content/60 mb-4">${escapeHtml(webinar.x_name || 'Untitled Event')}</p>

          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div class="text-sm text-base-content/70" id="registrations-summary-${webinar.id}">Laden...</div>
            <div class="flex items-center gap-2">
              <button class="btn btn-sm btn-ghost" data-action="refresh-registrations" data-webinar-id="${webinar.id}">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <div id="registrations-loading-${webinar.id}" class="hidden py-8 text-center">
            <span class="loading loading-spinner loading-md text-primary"></span>
          </div>

          <div class="overflow-x-auto">
            <table class="table table-sm table-zebra">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Vragen</th>
                  <th>Confirmation</th>
                  <th>Reminder</th>
                  <th>Recap</th>
                  <th>Nieuw contact?</th>
                  <th>Opportunity</th>
                  <th class="w-44">Aanwezig</th>
                </tr>
              </thead>
              <tbody id="registrations-list-${webinar.id}"></tbody>
            </table>
          </div>

          <div id="registrations-pagination-${webinar.id}" class="hidden flex items-center justify-between pt-3">
            <button class="btn btn-sm" data-action="registrations-page" data-page="1" data-webinar-id="${webinar.id}" id="registrations-prev-${webinar.id}">Vorige</button>
            <span id="registrations-page-info-${webinar.id}" class="text-sm text-base-content/70"></span>
            <button class="btn btn-sm" data-action="registrations-page" data-page="1" data-webinar-id="${webinar.id}" id="registrations-next-${webinar.id}">Volgende</button>
          </div>

          <div class="modal-action">
            <form method="dialog">
              <button class="btn">Sluiten</button>
            </form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      <!-- ── Webinar Recap ── -->
      <details class="pt-4 border-t border-base-200" data-expander>
        <summary class="font-semibold text-sm flex items-center justify-between cursor-pointer list-none pb-3">
          <span class="flex items-center gap-2">
            <i data-lucide="video" class="w-4 h-4 text-primary"></i>
            Webinar Recap
          </span>
          <span class="flex items-center gap-2">
            <span id="recap-loading-indicator" class="loading loading-spinner loading-xs hidden"></span>
            <i data-role="expander-chevron" data-lucide="chevron-down" class="w-4 h-4 text-base-content/60 transition-transform duration-200"></i>
          </span>
        </summary>
        <div class="space-y-3">

        <!-- Video URL -->
        <div>
          <label class="label py-0 pb-1">
            <span class="label-text text-xs font-medium">Video URL</span>
          </label>
          <div class="flex gap-1">
            <input
              id="recap-video-url"
              type="url"
              class="input input-bordered input-xs flex-1 font-mono text-xs min-w-0"
              placeholder="https://youtu.be/... of vimeo.com/..."
            >
            <button
              data-action="set-video-url"
              data-webinar-id="${webinar.id}"
              class="btn btn-xs btn-primary shrink-0"
              title="URL verwerken en thumbnail ophalen"
            >
              <i data-lucide="refresh-cw" class="w-3 h-3"></i>
            </button>
            <button
              data-action="clear-video-url"
              data-webinar-id="${webinar.id}"
              class="btn btn-xs btn-ghost btn-square shrink-0"
              title="URL en thumbnail wissen"
            >
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          </div>
          <div id="recap-url-alert" class="hidden mt-1 text-xs"></div>
        </div>

        <!-- Thumbnail -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="label py-0">
              <span class="label-text text-xs font-medium">Thumbnail</span>
            </label>
            <button
              data-action="trigger-thumb-upload"
              data-webinar-id="${webinar.id}"
              class="btn btn-xs btn-ghost btn-circle"
              title="Upload eigen thumbnail"
              aria-label="Upload eigen thumbnail"
            >
              <i data-lucide="upload" class="w-3 h-3"></i>
            </button>
          </div>
          <div
            id="recap-thumb-container"
            class="rounded-lg overflow-hidden bg-base-200 flex items-center justify-center mb-2"
            style="aspect-ratio:16/9;"
          >
            <i data-lucide="image" class="w-8 h-8 text-base-content/30"></i>
          </div>
          <input id="recap-thumb-file" type="file" accept="image/*" class="hidden">
          <div id="recap-thumb-alert" class="hidden mt-1 text-xs"></div>
        </div>

        <!-- Recap HTML Editor -->
        <div>
          <div class="mb-1">
            <span class="label-text text-xs font-medium">Recap HTML</span>
          </div>
          <div
            id="recap-html-editor"
            class="rounded-lg border border-base-content/20 bg-base-100 text-sm overflow-hidden"
            style="min-height:140px;"
          ></div>
          <div id="recap-html-alert" class="hidden mt-1 text-xs"></div>
        </div>

        <!-- Recap Ready Status -->
        <div id="recap-ready-status"></div>

        <!-- Send Recap Button -->
        <button
          id="recap-send-btn"
          data-action="send-recap"
          data-webinar-id="${webinar.id}"
          class="btn btn-sm btn-success w-full gap-1"
          disabled
        >
          <i data-lucide="send" class="w-4 h-4"></i>
          Verstuur Recap
        </button>

        <button
          id="recap-reset-btn"
          data-action="reset-recap"
          data-webinar-id="${webinar.id}"
          class="btn btn-sm btn-outline btn-warning w-full gap-1 hidden"
        >
          <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          Reset Recap Status
        </button>
        </div>
      </details>

      <!-- Actions -->
      <div class="space-y-2">
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

function syncExpanderChevron(detailsEl) {
  const chevron = detailsEl.querySelector('[data-role="expander-chevron"]');
  if (!chevron) return;
  chevron.classList.toggle('rotate-180', Boolean(detailsEl.open));
}

function syncExpanderChevrons() {
  contentEl?.querySelectorAll('details[data-expander]').forEach((detailsEl) => {
    syncExpanderChevron(detailsEl);
  });
}

function initializeInlineDescriptionEditor(webinarId, initialHtml, readOnly = false) {
  const editorEl = document.getElementById('description-inline-editor');
  if (!editorEl) return;

  descriptionQuillEditor = null;
  descriptionQuillController = null;

  if (typeof Quill === 'undefined' || !window.EOQuill || typeof window.EOQuill.create !== 'function') {
    editorEl.innerHTML = '<div class="p-3 text-sm text-base-content/70">Editor kon niet geladen worden.</div>';
    return;
  }

  descriptionQuillController = window.EOQuill.create({
    target: editorEl,
    initialHtml,
    readOnly,
    placeholder: 'Voer beschrijving in...',
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ align: [] }],
      ['link']
    ],
    onSave: async () => {
      await saveDescriptionInline(webinarId);
    },
    saveTooltip: 'Beschrijving opslaan'
  });

  descriptionQuillEditor = descriptionQuillController?.quill || null;
}

function renderRegistrationStatsBadges(registrationStats) {
  const stats = registrationStats && typeof registrationStats === 'object' ? registrationStats : null;

  if (!stats) {
    return '';
  }

  const badges = [];

  if (stats.any_confirmation_sent === true) {
    badges.push('<span class="badge badge-success badge-sm">Confirmation sent</span>');
  }

  if (stats.any_reminder_sent === true) {
    badges.push('<span class="badge badge-info badge-sm">Reminder sent</span>');
  }

  if (stats.any_recap_sent === true) {
    badges.push('<span class="badge badge-accent badge-sm">Recap sent</span>');
  }

  if (badges.length === 0) {
    return '';
  }

  return `
    <div class="flex flex-wrap gap-2 pt-2 border-t border-base-200">
      ${badges.join('')}
    </div>
  `;
}

async function fetchDescriptionForms() {
  if (Array.isArray(descriptionFormsCache)) {
    return descriptionFormsCache;
  }

  try {
    const response = await fetch('/events/api/forms', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      descriptionFormsCache = [];
      return descriptionFormsCache;
    }

    const result = await response.json();
    descriptionFormsCache = Array.isArray(result?.data) ? result.data : [];
    return descriptionFormsCache;
  } catch (error) {
    console.error('[DetailPanel] Failed to fetch forms:', error);
    descriptionFormsCache = [];
    return descriptionFormsCache;
  }
}

async function initializeDescriptionFormPicker(webinarId, selectedFormId = null, readOnly = false) {
  const formPicker = document.getElementById('description-form-picker');
  if (!formPicker) return;

  formPicker.disabled = Boolean(readOnly);
  formPicker.innerHTML = '<option value="">Geen formulier</option>';

  const forms = await fetchDescriptionForms();
  forms.forEach((form) => {
    const option = document.createElement('option');
    option.value = String(form.id);
    option.textContent = form.name || `Formulier ${form.id}`;
    if (form.description) {
      option.title = form.description;
    }
    formPicker.appendChild(option);
  });

  const selectedValue = selectedFormId === null || selectedFormId === undefined
    ? ''
    : String(selectedFormId);
  formPicker.value = selectedValue;
  formPicker.dataset.webinarId = String(webinarId);
}

async function saveDescriptionSelectedForm(webinarId, selectedFormId) {
  const formId = selectedFormId ? String(selectedFormId) : null;

  try {
    const response = await fetch(`/events/api/editorial/${webinarId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ selectedFormId: formId })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(errBody || 'Failed to save selected form');
    }

    const snapshot = getSnapshot(webinarId);
    if (snapshot) {
      snapshot.selected_form_id = formId;
    }

    if (typeof window.showNotification === 'function') {
      window.showNotification(formId ? 'Formulier geselecteerd' : 'Formulier verwijderd', 'success');
    }
  } catch (error) {
    console.error('[DetailPanel] Save selected form failed:', error);
    if (typeof window.showNotification === 'function') {
      window.showNotification('Fout bij opslaan formulier', 'error');
    }
  }
}

async function saveDescriptionInline(webinarId) {
  const descriptionRaw = descriptionQuillController ? descriptionQuillController.getHTML() : '';
  const normalized = String(descriptionRaw || '').trim();
  const description = normalized === '<p><br></p>' ? '' : descriptionRaw;

  try {
    const response = await fetch(`/events/api/odoo-webinars/${webinarId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ x_studio_webinar_info: description })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(errBody || 'Failed to save description');
    }

    const webinar = getWebinar(webinarId);
    if (webinar) {
      webinar.x_studio_webinar_info = description;
    }

    const editorialResponse = await fetch(`/events/api/editorial/${webinarId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        editorialMode: 'use_odoo_plain',
        editorialContent: null
      })
    });

    if (!editorialResponse.ok) {
      const errBody = await editorialResponse.text();
      throw new Error(errBody || 'Failed to switch editorial mode');
    }

    const snapshot = getSnapshot(webinarId);
    if (snapshot) {
      snapshot.editorial_mode = 'use_odoo_plain';
      snapshot.editorial_content = null;
    }

    if (descriptionQuillController) {
      descriptionQuillController.markSaved();
    }

    if (typeof window.showNotification === 'function') {
      window.showNotification('Beschrijving opgeslagen', 'success');
    }
  } catch (error) {
    console.error('[DetailPanel] Save description failed:', error);
    if (typeof window.showNotification === 'function') {
      window.showNotification('Fout bij opslaan beschrijving', 'error');
    }
  }
}

function activateTitleEditor(webinarId) {
  const inputEl = document.getElementById('title-edit-input');
  const titleEl = contentEl?.querySelector('[data-role="event-title"]');
  const toggleBtn = contentEl?.querySelector('[data-action="toggle-title-edit"]');
  if (!inputEl || !titleEl || !toggleBtn) return;

  const odooTitle = titleEl?.dataset.odooTitle || getWebinar(webinarId)?.x_name || 'Untitled Event';
  const currentOverride = titleEl?.dataset.overrideTitle || '';

  inputEl.value = currentOverride || odooTitle;
  titleEl.classList.add('hidden');
  inputEl.classList.remove('hidden');
  toggleBtn.dataset.editing = 'true';
  toggleBtn.setAttribute('title', 'Titel opslaan');
  toggleBtn.setAttribute('aria-label', 'Titel opslaan');

  const icon = toggleBtn.querySelector('[data-role="title-toggle-icon"]');
  if (icon) {
    icon.setAttribute('data-lucide', 'save');
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons({ nodes: [toggleBtn] });
  }

  setTimeout(() => {
    inputEl.focus();
    inputEl.select();
  }, 0);
}

function deactivateTitleEditor() {
  const inputEl = document.getElementById('title-edit-input');
  const titleEl = contentEl?.querySelector('[data-role="event-title"]');
  const toggleBtn = contentEl?.querySelector('[data-action="toggle-title-edit"]');

  if (inputEl) {
    inputEl.classList.add('hidden');
  }
  if (titleEl) {
    titleEl.classList.remove('hidden');
  }

  if (toggleBtn) {
    toggleBtn.dataset.editing = 'false';
    toggleBtn.setAttribute('title', 'Titel bewerken');
    toggleBtn.setAttribute('aria-label', 'Titel bewerken');

    const icon = toggleBtn.querySelector('[data-role="title-toggle-icon"]');
    if (icon) {
      icon.setAttribute('data-lucide', 'edit-3');
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ nodes: [toggleBtn] });
    }
  }
}

function restoreTitleEditorValue(webinarId) {
  const inputEl = document.getElementById('title-edit-input');
  const titleEl = contentEl?.querySelector('[data-role="event-title"]');
  if (!inputEl || !titleEl) return;

  const odooTitle = titleEl.dataset.odooTitle || getWebinar(webinarId)?.x_name || 'Untitled Event';
  const overrideTitle = titleEl.dataset.overrideTitle || '';
  inputEl.value = overrideTitle || odooTitle;
}

async function persistTitleOverride(webinarId, options = {}) {
  const { silent = false } = options;
  const inputEl = document.getElementById('title-edit-input');
  if (!inputEl) return;

  const value = (inputEl.value || '').trim();
  const titleOverride = value === '' ? null : value;

  try {
    const response = await fetch(`/events/api/editorial/${webinarId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ titleOverride })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(errBody || 'Failed to save title override');
    }

    const snapshot = getSnapshot(webinarId);
    if (snapshot) {
      snapshot.title_override = titleOverride;
    }

    const webinar = getWebinar(webinarId);
    const titleEl = contentEl?.querySelector('[data-role="event-title"]');
    if (titleEl) {
      titleEl.dataset.overrideTitle = titleOverride || '';
      titleEl.textContent = titleOverride || webinar?.x_name || 'Untitled Event';
    }

    if (!silent && typeof window.showNotification === 'function') {
      window.showNotification('Titel opgeslagen', 'success');
    }
  } catch (error) {
    console.error('[DetailPanel] Persist title override failed:', error);
    if (!silent && typeof window.showNotification === 'function') {
      window.showNotification('Fout bij opslaan titel', 'error');
    }
  }
}

async function openRegistrationsModal(webinarId) {
  const modal = document.getElementById(`registrations-modal-${webinarId}`);
  if (!modal) return;

  modal.showModal();
  const cache = getRegistrationsCache(webinarId);
  const page = cache.lastPage || 1;
  await renderRegistrationsModal(webinarId, page);
}

async function renderRegistrationsModal(webinarId, page = 1, options = {}) {
  const { force = false } = options;

  const loadingEl = document.getElementById(`registrations-loading-${webinarId}`);
  const listEl = document.getElementById(`registrations-list-${webinarId}`);
  if (!loadingEl || !listEl) {
    return;
  }

  loadingEl.classList.remove('hidden');
  listEl.innerHTML = '';

  try {
    const data = await loadRegistrationsPage(webinarId, page, { force });
    renderRegistrationsData(webinarId, data);
  } catch (error) {
    listEl.innerHTML = '<tr><td colspan="9"><div class="alert alert-error text-sm">Failed to load registrations: ' + escapeHtml(error.message || 'unknown error') + '</div></td></tr>';
  } finally {
    loadingEl.classList.add('hidden');
  }
}

async function loadRegistrationsPage(webinarId, page = 1, options = {}) {
  const { force = false } = options;
  const cache = getRegistrationsCache(webinarId);

  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  if (!force && cache.pages.has(normalizedPage)) {
    cache.lastPage = normalizedPage;
    return cache.pages.get(normalizedPage);
  }

  const url = `/events/api/events/${webinarId}/registrations?page=${normalizedPage}&per_page=${REGISTRATIONS_PER_PAGE}`;
  const response = await fetch(url, {
    credentials: 'include'
  });
  const json = await response.json();

  if (!response.ok || !json?.success) {
    throw new Error(json?.error || `HTTP ${response.status}`);
  }

  const payload = json.data;
  cache.pages.set(normalizedPage, payload);
  cache.lastPage = normalizedPage;
  cache.pagination = payload.pagination;
  cache.total = Number(payload.total || 0);
  return payload;
}

function renderRegistrationsData(webinarId, payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const pagination = payload?.pagination || {};

  const summaryEl = document.getElementById(`registrations-summary-${webinarId}`);
  if (summaryEl) {
    const virtualizationSuffix = pagination.requiresVirtualization ? ' • virtualization enabled' : '';
    summaryEl.textContent = `${payload.total || 0} registrations${virtualizationSuffix}`;
  }

  const listWrapEl = document.getElementById(`registrations-list-wrap-${webinarId}`);
  const listEl = document.getElementById(`registrations-list-${webinarId}`);
  if (!listEl) {
    return;
  }

  if (rows.length === 0) {
    listEl.innerHTML = '<tr><td colspan="9" class="text-sm text-base-content/60 py-2">Geen inschrijvingen gevonden.</td></tr>';
  } else {
    listEl.innerHTML = rows.map((row) => renderRegistrationRow(row, webinarId)).join('');
  }

  renderPaginationState(webinarId, pagination);

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function renderPaginationState(webinarId, pagination) {
  const paginationEl = document.getElementById(`registrations-pagination-${webinarId}`);
  const prevBtn = document.getElementById(`registrations-prev-${webinarId}`);
  const nextBtn = document.getElementById(`registrations-next-${webinarId}`);
  const pageInfo = document.getElementById(`registrations-page-info-${webinarId}`);
  if (!paginationEl || !prevBtn || !nextBtn || !pageInfo) {
    return;
  }

  const requiresPagination = Boolean(pagination.requiresPagination);
  paginationEl.classList.toggle('hidden', !requiresPagination);
  if (!requiresPagination) {
    return;
  }

  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  pageInfo.textContent = `Page ${page} / ${totalPages}`;

  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;
  prevBtn.dataset.page = String(Math.max(1, page - 1));
  nextBtn.dataset.page = String(Math.min(totalPages, page + 1));
}

function renderRegistrationRow(row, webinarId) {
  const registrationId = Number(row?.id || 0);
  const expanded = getExpandedQuestions(webinarId).has(registrationId);
  const leadBadge = renderLeadBadge(row?.lead);
  const questionsBlock = renderQuestionsBlock(row, webinarId, expanded);
  const contactName = row?.registeredBy?.name || row?.name || 'Unknown contact';
  const contactCreatedBadge = row?.contactCreated
    ? '<span class="badge badge-success badge-sm">Gemaakt</span>'
    : '<span class="badge badge-ghost badge-sm">Niet gemaakt</span>';
  const confirmationBadge = row?.x_studio_confirmation_email_sent === true
    ? '<span class="badge badge-success badge-xs">✓</span>'
    : '';
  const reminderBadge = row?.x_studio_reminder_email_sent === true
    ? '<span class="badge badge-info badge-xs">✓</span>'
    : '';
  const recapBadge = row?.x_studio_recap_email_sent === true
    ? '<span class="badge badge-warning badge-xs">✓</span>'
    : '';

  return `
    <tr data-registration-id="${registrationId}">
      <td class="font-medium">${escapeHtml(contactName)}</td>
      <td class="text-sm">${escapeHtml(row?.email || 'Geen e-mail')}</td>
      <td class="text-xs">${questionsBlock}</td>
      <td>${confirmationBadge}</td>
      <td>${reminderBadge}</td>
      <td>${recapBadge}</td>
      <td>${contactCreatedBadge}</td>
      <td>${leadBadge}</td>
      <td>
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          data-action="toggle-attendance"
          data-registration-id="${registrationId}"
          data-webinar-id="${webinarId}"
          ${row?.attended ? 'checked' : ''}
        />
      </td>
    </tr>
  `;
}

function renderLeadBadge(lead) {
  const leadId = Number(lead?.id || 0);
  const leadUrl = leadId > 0
    ? 'https://mymmo.odoo.com/web#id=' + leadId + '&model=crm.lead&view_type=form'
    : null;

  const wrapClickable = (innerHtml) => {
    if (!leadUrl) {
      return innerHtml;
    }

    return '<a href="' + leadUrl + '" target="_blank" rel="noopener noreferrer" class="inline-flex items-center">' + innerHtml + '</a>';
  };

  const stageName = typeof lead?.resolved_lead_stage_name === 'string' ? lead.resolved_lead_stage_name.trim() : '';
  if (!leadId || !stageName) {
    return '<span class="badge badge-ghost badge-sm">Geen lead</span>';
  }

  return wrapClickable('<span class="badge badge-info badge-sm">' + escapeHtml(stageName) + '</span>');
}

function renderQuestionsBlock(row, webinarId, expanded) {
  const registrationId = Number(row?.id || 0);
  const raw = typeof row?.questions === 'string' ? row.questions : '';
  if (!raw.trim()) {
    return '<div class="text-xs text-base-content/40">—</div>';
  }

  const isHtml = Boolean(row?.questions_is_html_flag);
  const maxPreviewLength = 180;
  const hasOverflow = raw.length > maxPreviewLength;

  if (isHtml) {
    const sanitized = sanitizeHtml(raw);
    const previewText = htmlToText(sanitized);
    if (!expanded && hasOverflow) {
      return '<div class="text-xs">' + escapeHtml(previewText.slice(0, maxPreviewLength)) + '… ' +
        '<button class="btn btn-ghost btn-xs px-1 min-h-0 h-auto" data-action="toggle-question" data-registration-id="' + registrationId + '" data-webinar-id="' + webinarId + '">More</button>' +
      '</div>';
    }

    return '<div class="prose prose-xs max-w-none">' + sanitized + '</div>' +
      (hasOverflow
        ? '<button class="btn btn-ghost btn-xs px-1 min-h-0 h-auto" data-action="toggle-question" data-registration-id="' + registrationId + '" data-webinar-id="' + webinarId + '">' + (expanded ? 'Less' : 'More') + '</button>'
        : '');
  }

  const escapedText = escapeHtml(raw).replace(/\n/g, '<br>');
  if (!expanded && hasOverflow) {
    const preview = escapeHtml(raw.slice(0, maxPreviewLength)).replace(/\n/g, '<br>');
    return '<div class="text-xs">' + preview + '… ' +
      '<button class="btn btn-ghost btn-xs px-1 min-h-0 h-auto" data-action="toggle-question" data-registration-id="' + registrationId + '" data-webinar-id="' + webinarId + '">More</button>' +
    '</div>';
  }

  return '<div class="text-xs">' + escapedText + '</div>' +
    (hasOverflow
      ? '<button class="btn btn-ghost btn-xs px-1 min-h-0 h-auto" data-action="toggle-question" data-registration-id="' + registrationId + '" data-webinar-id="' + webinarId + '">' + (expanded ? 'Less' : 'More') + '</button>'
      : '');
}

function toggleQuestionExpansion(webinarId, registrationId) {
  const expanded = getExpandedQuestions(webinarId);
  if (expanded.has(registrationId)) {
    expanded.delete(registrationId);
  } else {
    expanded.add(registrationId);
  }

  const cache = getRegistrationsCache(webinarId);
  const page = cache.lastPage || 1;
  const payload = cache.pages.get(page);
  if (payload) {
    renderRegistrationsData(webinarId, payload);
  }
}

async function handleSingleAttendanceUpdateByCheckbox(webinarId, registrationId, attended, checkboxEl) {
  const previousValue = !attended;
  checkboxEl.disabled = true;

  try {
    const response = await fetch(`/events/api/events/registrations/${registrationId}/attendance`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attended, origin: 'workspace_panel' })
    });

    const json = await response.json();
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }

    updateCachedAttendance(webinarId, registrationId, attended);
    const cache = getRegistrationsCache(webinarId);
    const payload = cache.pages.get(cache.lastPage || 1);
    if (payload) {
      renderRegistrationsData(webinarId, payload);
    }

    if (typeof window.showNotification === 'function') {
      window.showNotification('Aanwezigheid bijgewerkt', 'success');
    }
  } catch (error) {
    checkboxEl.checked = previousValue;
    if (typeof window.showNotification === 'function') {
      window.showNotification('Aanwezigheid bijwerken mislukt: ' + (error.message || 'unknown error'), 'error');
    }
  } finally {
    checkboxEl.disabled = false;
  }
}


function updateCachedAttendance(webinarId, registrationId, attended) {
  const cache = getRegistrationsCache(webinarId);
  for (const [, payload] of cache.pages.entries()) {
    if (!Array.isArray(payload?.rows)) {
      continue;
    }

    const row = payload.rows.find((entry) => Number(entry?.id) === Number(registrationId));
    if (row) {
      row.attended = Boolean(attended);
    }
  }
}

function sanitizeHtml(input) {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(String(input || ''), 'text/html');
  const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta']);

  const walk = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      if (blockedTags.has(tagName)) {
        node.remove();
        return;
      }

      const attrs = [...node.attributes];
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim();

        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
          continue;
        }

        if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
          node.removeAttribute(attr.name);
        }
      }
    }

    [...node.childNodes].forEach(walk);
  };

  walk(documentFragment.body);
  return documentFragment.body.innerHTML;
}

function htmlToText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
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

  // Title mismatch (decode HTML entities before comparing)
  const wpTitle = typeof wp.title === 'object' ? wp.title?.rendered : wp.title;
  if (wpTitle && webinar.x_name && decodeEntities(webinar.x_name) !== decodeEntities(wpTitle)) return true;

  // Date mismatch (timezone-aware via UTC source)
  if ((wp.utc_start_date || wp.start_date) && webinar.x_studio_event_datetime) {
    const odooUtc = parseUtcDateTime(webinar.x_studio_event_datetime);
    const wpUtc = parseUtcDateTime(wp.utc_start_date || wp.start_date);
    if (odooUtc && wpUtc && odooUtc.getTime() !== wpUtc.getTime()) return true;
  }

  return false;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(state) {
  const badgeMap = {
    'out_of_sync': '<span class="badge badge-warning badge-sm cursor-help" data-action="compare-sync" data-webinar-id="__WID__" title="Ctrl+Click om versies te vergelijken">Out of Sync</span>',
    'published': '<span class="badge badge-success badge-sm cursor-help" data-action="compare-sync" data-webinar-id="__WID__" title="Ctrl+Click om versies te vergelijken">Published</span>',
    'draft': '<span class="badge badge-neutral badge-sm cursor-help" data-action="compare-sync" data-webinar-id="__WID__" title="Ctrl+Click om versies te vergelijken">Draft</span>',
    'not_published': '<span class="badge badge-error badge-sm">Not Published</span>',
    'archived': '<span class="badge badge-info badge-sm">Archived</span>'
  };
  return badgeMap[state] || '';
}

function parseUtcDateTime(raw) {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  let isoString = raw.trim();
  if (isoString.includes(' ') && !isoString.includes('T')) {
    isoString = isoString.replace(' ', 'T') + 'Z';
  } else if (isoString.includes('T') && !isoString.endsWith('Z')) {
    isoString = isoString + 'Z';
  }

  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBrusselsDate(date) {
  return date.toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatBrusselsTime(date) {
  return date.toLocaleTimeString('nl-BE', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit'
  });
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
 * Show sync comparison modal — Odoo vs WordPress field-by-field
 */
function showSyncComparison(webinarId) {
  const webinar = getWebinar(webinarId);
  const snapshot = getSnapshot(webinarId);
  const modal = document.getElementById('syncComparisonModal');
  const body = document.getElementById('syncComparisonBody');

  if (!modal || !body || !webinar) return;

  const wp = snapshot?.wp_snapshot;
  const state = computeState(webinar, snapshot);

  // Build comparison rows
  const fields = [];

  // 1. Title
  const odooTitle = webinar.x_name || '';
  const wpTitleRaw = wp ? (typeof wp.title === 'object' ? wp.title?.rendered : wp.title) : null;
  const wpTitle = wpTitleRaw || '';
  fields.push({
    label: 'Titel',
    odoo: odooTitle,
    wp: wpTitle || '—',
    match: decodeEntities(odooTitle) === decodeEntities(wpTitle),
    available: !!wp
  });

  // 2. Start datetime
  const odooDateRaw = webinar.x_studio_event_datetime || '';
  const wpDateRaw = wp?.start_date || '';
  const odooUtc = parseUtcDateTime(odooDateRaw);
  const wpUtc = parseUtcDateTime(wp?.utc_start_date || wpDateRaw);
  const odooDateBrussels = odooUtc ? formatBrusselsDate(odooUtc) : '—';
  const wpDateBrussels = wpUtc ? formatBrusselsDate(wpUtc) : (wpDateRaw || '—');
  fields.push({
    label: 'Startdatum',
    odoo: odooDateBrussels,
    wp: wpDateBrussels,
    match: Boolean(odooUtc && wpUtc && odooDateBrussels === wpDateBrussels),
    available: !!wp
  });

  // 3. Start time
  const odooTime = odooUtc ? formatBrusselsTime(odooUtc) : '';
  const wpTime = wpUtc ? formatBrusselsTime(wpUtc) : '';
  fields.push({
    label: 'Starttijd',
    odoo: odooTime || '—',
    wp: wpTime || '—',
    match: Boolean(odooUtc && wpUtc && odooTime === wpTime),
    available: !!wp
  });

  // 4. Duration
  const odooDuration = webinar.x_studio_event_duration_minutes ? webinar.x_studio_event_duration_minutes + ' min' : '—';
  const wpDuration = wp?.duration ? wp.duration : '—';
  fields.push({
    label: 'Duur',
    odoo: odooDuration,
    wp: wpDuration,
    match: null, // informational, no comparison
    available: !!wp
  });

  // 5. Status
  fields.push({
    label: 'WP Status',
    odoo: webinar.x_active ? 'Active' : 'Archived',
    wp: wp?.status || '—',
    match: null,
    available: !!wp
  });

  // 6. Backend computed state
  fields.push({
    label: 'Computed State',
    odoo: '—',
    wp: snapshot?.computed_state || '—',
    match: null,
    available: !!snapshot
  });

  // 7. WP Post ID
  fields.push({
    label: 'WP Post ID',
    odoo: '—',
    wp: wp?.id ? `#${wp.id}` : '—',
    match: null,
    available: !!wp
  });

  // 8. Last synced
  fields.push({
    label: 'Laatste sync',
    odoo: '—',
    wp: snapshot?.last_synced_at ? new Date(snapshot.last_synced_at).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' }) : '—',
    match: null,
    available: !!snapshot
  });

  // Render table
  const headerBadge = state === 'out_of_sync' 
    ? '<span class="badge badge-warning badge-sm ml-2">Out of Sync</span>' 
    : `<span class="badge badge-sm ml-2">${state}</span>`;

  let html = `
    <div class="text-sm text-base-content/70 mb-3">
      <strong>${escapeHtml(webinar.x_name || 'Untitled')}</strong> ${headerBadge}
    </div>
    <div class="overflow-x-auto">
      <table class="table table-sm table-zebra">
        <thead>
          <tr>
            <th class="w-32">Veld</th>
            <th>Odoo</th>
            <th>WordPress</th>
            <th class="w-16 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const field of fields) {
    let statusIcon = '';
    if (field.match === true) {
      statusIcon = '<span class="text-success" title="Match">✓</span>';
    } else if (field.match === false) {
      statusIcon = '<span class="text-error font-bold" title="Mismatch">✗</span>';
    } else {
      statusIcon = '<span class="text-base-content/30">—</span>';
    }

    const rowClass = field.match === false ? 'bg-warning/10' : '';

    html += `
      <tr class="${rowClass}">
        <td class="font-medium">${field.label}</td>
        <td class="font-mono text-xs break-all max-w-xs">${escapeHtml(String(field.odoo))}</td>
        <td class="font-mono text-xs break-all max-w-xs">${field.available ? escapeHtml(String(field.wp)) : '<span class="text-base-content/30">niet gepubliceerd</span>'}</td>
        <td class="text-center">${statusIcon}</td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  // If there's a snapshot with raw odoo_snapshot, show the full Odoo event type
  if (snapshot?.odoo_snapshot) {
    const odooSnap = snapshot.odoo_snapshot;
    const eventType = Array.isArray(odooSnap.x_webinar_event_type_id) && odooSnap.x_webinar_event_type_id.length > 1
      ? odooSnap.x_webinar_event_type_id[1]
      : '—';
    html += `
      <div class="mt-3 text-xs text-base-content/50">
        <strong>Snapshot metadata:</strong> Event Type: ${escapeHtml(eventType)} · Odoo ID: ${webinar.id} · WP ID: ${wp?.id || '—'}
      </div>
    `;
  }

  body.innerHTML = html;
  modal.showModal();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

/**
 * Decode HTML entities for comparison (e.g. &#038; → &)
 */
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
