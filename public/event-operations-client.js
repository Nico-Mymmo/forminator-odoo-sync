/**
 * Event Operations - Client-side UI rendering
 * PHASE 8: FullCalendar workspace with detail panel
 * Depends on: STATUS_BADGES, FullCalendar v6, formatEventDateTime from ui.js
 */

// ══════════════════════════════════════════════════════════════════════════════
// FULLCALENDAR INTEGRATION (Phase 8)
// ══════════════════════════════════════════════════════════════════════════════

let calendarInstance = null; // Global calendar instance
let recapQuillEditor = null; // Global Quill instance for recap HTML editor
let recapQuillController = null;

/**
 * Initialize FullCalendar with webinar data
 */
function initializeCalendar(webinars, snapshotMap, registrationCounts) {
  const calendarEl = document.getElementById('fullcalendar');
  if (!calendarEl) {
    console.error('[initializeCalendar] Calendar element not found');
    return;
  }

  // Destroy existing calendar instance if present
  if (calendarInstance) {
    calendarInstance.destroy();
  }

  // Transform webinars to FullCalendar events
  const events = transformToCalendarEvents(webinars, snapshotMap, registrationCounts);

  // Initialize FullCalendar (month view only)
  calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: '' // No view switcher - month only
    },
    events: events,
    eventClick: handleEventClick,
    eventDidMount: styleCalendarEvent,
    height: 'auto'
  });

  // Initialize detail panel event delegation (once)
  initDetailPanelDelegation();

  calendarInstance.render();
}

/**
 * Transform webinars to FullCalendar event objects
 */
function transformToCalendarEvents(webinars, snapshotMap, registrationCounts) {
  return webinars.map(webinar => {
    const snapshot = snapshotMap.get(webinar.id);
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

/**
 * Get status-based colors using DaisyUI CSS variables
 * Returns CSS variable strings for proper theme integration
 */
function getStatusColors(state) {
  const colorMap = {
    'out_of_sync': { 
      bg: 'oklch(var(--wa) / 0.15)', 
      border: 'oklch(var(--wa) / 0.3)',
      accent: 'oklch(var(--wa))',
      text: 'oklch(var(--bc))'
    },
    'published': { 
      bg: 'oklch(var(--su) / 0.15)', 
      border: 'oklch(var(--su) / 0.3)',
      accent: 'oklch(var(--su))',
      text: 'oklch(var(--bc))'
    },
    'draft': { 
      bg: 'oklch(var(--n) / 0.15)', 
      border: 'oklch(var(--n) / 0.3)',
      accent: 'oklch(var(--n))',
      text: 'oklch(var(--bc))'
    },
    'not_published': { 
      bg: 'oklch(var(--in) / 0.15)', 
      border: 'oklch(var(--in) / 0.3)',
      accent: 'oklch(var(--in))',
      text: 'oklch(var(--bc))'
    },
    'archived': { 
      bg: 'oklch(var(--n) / 0.08)', 
      border: 'oklch(var(--n) / 0.2)',
      accent: 'oklch(var(--n) / 0.5)',
      text: 'oklch(var(--bc) / 0.6)'
    },
    'deleted': { 
      bg: 'oklch(var(--er) / 0.15)', 
      border: 'oklch(var(--er) / 0.3)',
      accent: 'oklch(var(--er))',
      text: 'oklch(var(--bc))'
    }
  };
  return colorMap[state] || colorMap.not_published;
}

/**
 * Apply DaisyUI-based styling to calendar events using CSS variables
 * Called via eventDidMount hook
 */
function styleCalendarEvent(info) {
  const { extendedProps } = info.event;
  const colors = getStatusColors(extendedProps.computed_state);
  
  // Set CSS variables on event element for consistent theming
  const el = info.el;
  el.style.setProperty('--event-accent', colors.accent);
  el.style.setProperty('--event-bg', colors.bg);
  el.style.setProperty('--event-border', colors.border);
  el.style.setProperty('--event-text', colors.text);
}

/**
 * Calculate event end time from start + duration
 */
function calculateEndTime(startISO, durationMinutes) {
  if (!startISO || !durationMinutes) return startISO;
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return end.toISOString();
}

/**
 * Handle calendar event click - update detail panel
 */
function handleEventClick(info) {
  info.jsEvent.preventDefault();
  const { webinar, snapshot, computed_state, registration_count } = info.event.extendedProps;
  updateDetailPanel(webinar, snapshot, computed_state, registration_count);
}

// ══════════════════════════════════════════════════════════════════════════════
// DETAIL PANEL RENDERING (Phase 8)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Update detail panel with selected webinar
 */
function updateDetailPanel(webinar, snapshot, state, regCount) {
  const emptyState = document.getElementById('panel-empty-state');
  const panelContent = document.getElementById('panel-content');

  if (!emptyState || !panelContent) {
    console.error('[updateDetailPanel] Panel elements not found');
    return;
  }

  // Destroy existing Quill instance before re-render
  recapQuillEditor = null;

  emptyState.style.display = 'none';
  panelContent.style.display = 'block';

  panelContent.innerHTML = renderDetailPanelContent(webinar, snapshot, state, regCount);
  
  // Re-initialize Lucide icons after DOM update
  setTimeout(() => {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
    // Initialize recap section (async, non-blocking)
    initRecapSection(webinar.id, webinar);
  }, 10);
}

/**
 * Render detail panel HTML content
 */
function renderDetailPanelContent(webinar, snapshot, state, regCount) {
  const badge = STATUS_BADGES[state] || STATUS_BADGES.not_published;
  const wpId = snapshot?.wp_snapshot?.id;
  // CRITICAL FIX: Use correct field x_active (not x_studio_active)
  const isArchived = !webinar.x_active;

  // Check if event type mapping exists
  const eventTypeId = Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 0
    ? webinar.x_webinar_event_type_id[0]
    : null;
  const hasMapping = eventTypeId && hasEventTypeMapping(eventTypeId);

  // Format datetime using global helper
  let dateValue = '—';
  let timeValue = '—';
  if (webinar.x_studio_event_datetime && window.formatEventDateTime) {
    const formatted = window.formatEventDateTime(webinar.x_studio_event_datetime);
    dateValue = formatted.date;
    timeValue = formatted.time;
  }

  return `
    <div class="space-y-4">
      <div class="border-b border-base-200 pb-4">
        <h2 class="text-xl font-bold mb-2">${escapeHtml(webinar.x_name || 'Untitled')}</h2>
        <span class="badge ${badge.css} badge-sm">${badge.label}</span>
      </div>
      
      <div class="space-y-2 text-sm">
        ${renderMetaRow('calendar', 'Datum', dateValue)}
        ${renderMetaRow('clock', 'Tijd', timeValue)}
        ${renderMetaRow('clock', 'Duur', webinar.x_studio_event_duration_minutes ? webinar.x_studio_event_duration_minutes + ' min' : '—')}
        ${renderMetaRow('users', 'Registraties', regCount.toString())}
        ${renderMetaRow('tag', 'Event Type', getEventTypeName(webinar))}
        ${wpId ? renderMetaRow('external-link', 'WordPress', `<a href="https://openvme.be/wp-admin/post.php?post=${wpId}&action=edit" target="_blank" class="link link-primary">WP #${wpId}</a>`) : ''}
      </div>
      
      <div class="space-y-2 pt-4 border-t border-base-200">
        <button 
          data-action="edit"
          data-webinar-id="${webinar.id}"
          class="btn btn-sm btn-outline btn-primary w-full"
          ${isArchived ? 'disabled' : ''}
          ${isArchived ? 'title="Event is archived"' : ''}
        >
          <i data-lucide="edit" class="w-4 h-4"></i> Edit Description
        </button>
        
        <div class="dropdown dropdown-top w-full">
          <div 
            tabindex="0" 
            role="button" 
            class="btn btn-sm btn-success w-full ${isArchived || !hasMapping ? 'btn-disabled' : ''}"
            ${isArchived || !hasMapping ? 'disabled' : ''}
            title="${isArchived ? 'Event is archived' : (!hasMapping ? 'No event type mapping' : 'Publish to WordPress')}"
          >
            <i data-lucide="send" class="w-4 h-4"></i> Publish to WordPress
            <i data-lucide="chevron-down" class="w-3 h-3 ml-1"></i>
          </div>
          ${!isArchived && hasMapping ? `
          <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-full">
            <li><a data-action="publish" data-webinar-id="${webinar.id}" data-status="publish"><i data-lucide="globe" class="w-3 h-3"></i> Publish</a></li>
            <li><a data-action="publish" data-webinar-id="${webinar.id}" data-status="draft"><i data-lucide="file-edit" class="w-3 h-3"></i> Draft</a></li>
            <li><a data-action="publish" data-webinar-id="${webinar.id}" data-status="private"><i data-lucide="lock" class="w-3 h-3"></i> Private</a></li>
          </ul>
          ` : ''}
        </div>
      </div>

      <!-- ── Webinar Recap ── -->
      <details class="pt-4 border-t border-base-200">
        <summary class="font-semibold text-sm flex items-center justify-between cursor-pointer list-none pb-3">
          <span class="flex items-center gap-2">
            <i data-lucide="video" class="w-4 h-4 text-primary"></i>
            Webinar Recap
          </span>
          <span id="recap-loading-indicator" class="loading loading-spinner loading-xs hidden"></span>
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
          <label class="label py-0 pb-1">
            <span class="label-text text-xs font-medium">Thumbnail</span>
          </label>
          <div
            id="recap-thumb-container"
            class="rounded-lg overflow-hidden bg-base-200 flex items-center justify-center mb-2"
            style="aspect-ratio:16/9;"
          >
            <i data-lucide="image" class="w-8 h-8 text-base-content/30"></i>
          </div>
          <input id="recap-thumb-file" type="file" accept="image/*" class="hidden">
          <button
            data-action="trigger-thumb-upload"
            data-webinar-id="${webinar.id}"
            class="btn btn-xs btn-outline w-full gap-1"
          >
            <i data-lucide="upload" class="w-3 h-3"></i> Upload eigen thumbnail
          </button>
          <div id="recap-thumb-alert" class="hidden mt-1 text-xs"></div>
        </div>

        <!-- Recap HTML Editor -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="label-text text-xs font-medium">Recap HTML</span>
            <button
              data-action="save-recap-html"
              data-webinar-id="${webinar.id}"
              class="btn btn-xs btn-outline btn-primary gap-1"
            >
              <i data-lucide="save" class="w-3 h-3"></i> Opslaan
            </button>
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
        </div>
      </details>
    </div>
  `;
}

/**
 * Helper: Render metadata row HTML
 */
function renderMetaRow(icon, label, value) {
  return `
    <div class="flex items-center gap-2">
      <i data-lucide="${icon}" class="w-4 h-4 text-base-content/60"></i>
      <span class="text-base-content/60">${label}:</span>
      <span class="font-medium">${value}</span>
    </div>
  `;
}

/**
 * Helper: Get event type name from webinar
 */
function getEventTypeName(webinar) {
  if (Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1) {
    return escapeHtml(webinar.x_webinar_event_type_id[1]);
  }
  return '—';
}

/**
 * Helper: Check if event type has mapping
 */
function hasEventTypeMapping(eventTypeId) {
  // Check against cached event type mappings (loaded globally)
  return window.eventTypeMappings?.some(m => m.odoo_event_type_id === eventTypeId);
}

/**
 * Initialize detail panel event delegation (ONCE on calendar init)
 * Uses event delegation pattern - no inline handlers, no repeated attachment
 */
let detailPanelDelegationInitialized = false;

function initDetailPanelDelegation() {
  if (detailPanelDelegationInitialized) return;
  
  const panelContent = document.getElementById('panel-content');
  if (!panelContent) {
    console.error('[initDetailPanelDelegation] Panel content not found');
    return;
  }

  // Single delegated listener for all panel actions
  panelContent.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn || actionBtn.disabled) return;

    const action = actionBtn.dataset.action;
    const webinarId = Number(actionBtn.dataset.webinarId);
    
    if (!webinarId) {
      console.error('[DetailPanel] Invalid webinar ID');
      return;
    }

    // Route action
    if (action === 'edit') {
      if (typeof openEditorialEditor === 'function') {
        openEditorialEditor(webinarId);
      } else {
        console.error('[DetailPanel] openEditorialEditor not found');
      }
    } else if (action === 'publish') {
      const status = actionBtn.dataset.status || 'publish';
      if (typeof publishWebinar === 'function') {
        await publishWebinar(webinarId, null, status);
      } else {
        console.error('[DetailPanel] publishWebinar not found');
      }
    } else if (action === 'set-video-url') {
      await recapHandleSetVideoUrl(webinarId);
    } else if (action === 'clear-video-url') {
      await recapHandleClearVideoUrl(webinarId);
    } else if (action === 'trigger-thumb-upload') {
      const fi = document.getElementById('recap-thumb-file');
      if (fi) fi.click();
    } else if (action === 'save-recap-html') {
      await recapHandleSaveHtml(webinarId);
    } else if (action === 'send-recap') {
      recapOpenConfirmModal(webinarId);
    }
  });

  detailPanelDelegationInitialized = true;
}

// ══════════════════════════════════════════════════════════════════════════════
// RECAP SECTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the recap section for a webinar.
 * Called automatically after the detail panel is rendered.
 *
 * @param {number} webinarId
 * @param {Object} [webinarHint]  Optional partial webinar data (datetime, etc.)
 */
async function initRecapSection(webinarId, webinarHint) {
  const loading = document.getElementById('recap-loading-indicator');
  if (loading) loading.classList.remove('hidden');

  try {
    const res  = await fetch('/events/api/webinar/' + webinarId + '/recap');
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Laden mislukt');

    const { video_url, thumbnail_url, followup_html, recap_sent, recap_ready, recap_reasons } = json.data;

    // ── Video URL ──
    const videoInput = document.getElementById('recap-video-url');
    if (videoInput && video_url) videoInput.value = video_url;

    // ── Thumbnail preview ──
    setRecapThumbnailPreview(thumbnail_url);

    // ── Bind file-input change ──
    const fileInput = document.getElementById('recap-thumb-file');
    if (fileInput) {
      fileInput.onchange = () => recapHandleThumbUpload(webinarId, fileInput);
    }

    // ── Quill editor ──
    const editorEl = document.getElementById('recap-html-editor');
    if (editorEl && window.EOQuill && typeof window.EOQuill.create === 'function') {
      recapQuillController = window.EOQuill.create({
        target: editorEl,
        initialHtml: followup_html || '',
        readOnly: false,
        placeholder: 'Schrijf hier de recap HTML...',
        toolbar: [
          [{ 'header': [2, 3, 4, false] }],
          ['bold', 'italic', 'underline'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['link']
        ],
        onSave: async () => {
          await recapHandleSaveHtml(webinarId);
        },
        saveTooltip: 'Recap HTML opslaan'
      });
      recapQuillEditor = recapQuillController?.quill || null;
    }

    // ── Recap Ready status ──
    const statusEl = document.getElementById('recap-ready-status');
    if (statusEl) {
      statusEl.innerHTML = renderRecapReadyBadge(recap_ready, recap_reasons, recap_sent);
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // ── Send Recap button ──
    const sendBtn = document.getElementById('recap-send-btn');
    const resetBtn = document.getElementById('recap-reset-btn');
    if (sendBtn) {
      if (recap_sent) {
        sendBtn.textContent = '✓ Recap al verstuurd';
        sendBtn.disabled = true;
        sendBtn.className = 'btn btn-sm btn-disabled w-full gap-1';
      } else if (recap_ready) {
        sendBtn.textContent = 'Verstuur Recap';
        sendBtn.className = 'btn btn-sm btn-success w-full gap-1';
        sendBtn.disabled = false;
      } else {
        sendBtn.textContent = 'Verstuur Recap';
        sendBtn.className = 'btn btn-sm btn-success w-full gap-1';
        sendBtn.disabled = true;
      }
    }

    if (resetBtn) {
      resetBtn.classList.toggle('hidden', !recap_sent);
    }

  } catch (err) {
    console.error('[initRecapSection] Error:', err);
    const statusEl = document.getElementById('recap-ready-status');
    if (statusEl) {
      statusEl.innerHTML = '<div class="alert alert-error text-xs p-2"><span>Recap laden mislukt: ' + escapeHtml(err.message) + '</span></div>';
    }
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

/**
 * Set the thumbnail preview image in the recap section.
 * @param {string|null} url
 */
function setRecapThumbnailPreview(url) {
  const container = document.getElementById('recap-thumb-container');
  if (!container) return;
  container.dataset.thumbnailUrl = url || '';
  if (url) {
    // Proxy through current origin so dev-mode loads from localhost
    // instead of the production worker URL stored in Odoo
    let displayUrl = url;
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/assets/')) {
        displayUrl = window.location.origin + parsed.pathname;
      }
    } catch (e) { /* keep original url */ }
    const img = document.createElement('img');
    img.src = displayUrl;
    img.alt = 'Thumbnail';
    img.className = 'w-full h-full object-cover';
    img.onerror = () => {
      container.innerHTML = '<div class="flex flex-col items-center gap-1 text-xs text-base-content/40"><i data-lucide="image-off" class="w-6 h-6"></i><span>Laden mislukt</span></div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    };
    container.innerHTML = '';
    container.appendChild(img);
  } else {
    container.innerHTML = '<i data-lucide="image" class="w-8 h-8 text-base-content/30"></i>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }
}

/**
 * Render the "Recap Ready" status badge.
 * @param {boolean} ready
 * @param {string[]} reasons
 * @param {boolean} sent
 * @returns {string} HTML
 */
function renderRecapReadyBadge(ready, reasons, sent) {
  if (sent) {
    return '<div class="badge badge-success gap-1 w-full justify-start py-3 text-xs">' +
      '<i data-lucide="check-circle" class="w-3 h-3"></i> Recap verzonden</div>';
  }
  if (ready) {
    return '<div class="badge badge-success badge-outline gap-1 w-full justify-start py-3 text-xs">' +
      '<i data-lucide="check-circle" class="w-3 h-3"></i> Klaar om te versturen</div>';
  }
  const items = reasons.map(function(r) {
    return '<li>' + escapeHtml(r) + '</li>';
  }).join('');
  return '<div class="alert alert-warning text-xs p-2">' +
    '<div><div class="font-medium mb-1 flex items-center gap-1">' +
    '<i data-lucide="alert-circle" class="w-3 h-3"></i> Recap nog niet klaar:</div>' +
    '<ul class="list-disc list-inside space-y-0.5">' + items + '</ul></div></div>';
}

/**
 * Handle "Verwerk URL" button: POST video URL, update thumbnail preview.
 * @param {number} webinarId
 */
async function recapHandleSetVideoUrl(webinarId) {
  const input = document.getElementById('recap-video-url');
  const alertEl = document.getElementById('recap-url-alert');
  const loading = document.getElementById('recap-loading-indicator');
  if (!input) return;

  const url = input.value.trim();
  if (!url) {
    recapShowAlert(alertEl, 'Voer een URL in', 'error');
    return;
  }

  if (loading) loading.classList.remove('hidden');
  if (alertEl) alertEl.classList.add('hidden');

  try {
    const res  = await fetch('/events/api/webinar/' + webinarId + '/video-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Verwerken mislukt');

    setRecapThumbnailPreview(json.data.thumbnail_url);
    recapShowAlert(alertEl, json.data.platform + ' thumbnail opgehaald ✓', 'success');
    // Refresh ready status
    await recapRefreshReadyStatus(webinarId);

  } catch (err) {
    recapShowAlert(alertEl, err.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

/**
 * Clear the video URL and thumbnail for a webinar.
 * @param {number} webinarId
 */
async function recapHandleClearVideoUrl(webinarId) {
  const input = document.getElementById('recap-video-url');
  const alertEl = document.getElementById('recap-url-alert');
  const loading = document.getElementById('recap-loading-indicator');

  if (loading) loading.classList.remove('hidden');

  try {
    const res = await fetch('/events/api/webinar/' + webinarId + '/video-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '' })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Wissen mislukt');

    if (input) input.value = '';
    setRecapThumbnailPreview(null);
    recapShowAlert(alertEl, 'URL en thumbnail gewist ✓', 'success');
    await recapRefreshReadyStatus(webinarId);

  } catch (err) {
    recapShowAlert(alertEl, err.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

/**
 * Handle custom thumbnail file upload.
 * @param {number} webinarId
 * @param {HTMLInputElement} fileInput
 */
async function recapHandleThumbUpload(webinarId, fileInput) {
  const alertEl = document.getElementById('recap-thumb-alert');
  const loading = document.getElementById('recap-loading-indicator');
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    recapShowAlert(alertEl, 'Selecteer een afbeeldingsbestand', 'error');
    return;
  }

  if (loading) loading.classList.remove('hidden');

  try {
    const formData = new FormData();
    formData.append('thumbnail', file);

    const res  = await fetch('/events/api/webinar/' + webinarId + '/thumbnail', {
      method: 'POST',
      body: formData
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Upload mislukt');

    setRecapThumbnailPreview(json.data.thumbnail_url);
    recapShowAlert(alertEl, 'Thumbnail geüpload ✓', 'success');
    await recapRefreshReadyStatus(webinarId);

  } catch (err) {
    recapShowAlert(alertEl, err.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
    fileInput.value = '';
  }
}

/**
 * Handle "Opslaan" for recap HTML.
 * @param {number} webinarId
 */
async function recapHandleSaveHtml(webinarId) {
  const alertEl = document.getElementById('recap-html-alert');
  const loading = document.getElementById('recap-loading-indicator');

  const html = recapQuillController
    ? recapQuillController.getHTML()
    : (recapQuillEditor ? recapQuillEditor.root.innerHTML : '');

  if (loading) loading.classList.remove('hidden');

  try {
    const res  = await fetch('/events/api/webinar/' + webinarId + '/recap-html', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Opslaan mislukt');

    recapShowAlert(alertEl, 'HTML opgeslagen ✓', 'success');
    if (recapQuillController) {
      recapQuillController.markSaved();
    }
    await recapRefreshReadyStatus(webinarId);

  } catch (err) {
    recapShowAlert(alertEl, err.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

/**
 * Refresh the recap-ready status + send button after a change.
 * @param {number} webinarId
 */
async function recapRefreshReadyStatus(webinarId) {
  try {
    const res  = await fetch('/events/api/webinar/' + webinarId + '/recap');
    const json = await res.json();
    if (!json.success) return;

    const { recap_ready, recap_reasons, recap_sent } = json.data;

    const statusEl = document.getElementById('recap-ready-status');
    if (statusEl) {
      statusEl.innerHTML = renderRecapReadyBadge(recap_ready, recap_reasons, recap_sent);
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    const sendBtn = document.getElementById('recap-send-btn');
    const resetBtn = document.getElementById('recap-reset-btn');

    if (sendBtn) {
      if (recap_sent) {
        sendBtn.textContent = '✓ Recap al verstuurd';
        sendBtn.disabled = true;
        sendBtn.className = 'btn btn-sm btn-disabled w-full gap-1';
      } else {
        sendBtn.textContent = 'Verstuur Recap';
        sendBtn.className = 'btn btn-sm btn-success w-full gap-1';
        sendBtn.disabled = !recap_ready;
      }
    }

    if (resetBtn) {
      resetBtn.classList.toggle('hidden', !recap_sent);
    }
  } catch (_) {}
}

/**
 * Open the Send Recap confirmation modal.
 * @param {number} webinarId
 */
function recapOpenConfirmModal(webinarId) {
  const modal = document.getElementById('sendRecapModal');
  if (!modal) return;

  // Set webinar name in modal
  const nameEl = document.getElementById('sendRecapWebinarName');
  const panelTitle = document.querySelector('#panel-content h2');
  if (nameEl) nameEl.textContent = panelTitle ? panelTitle.textContent : '#' + webinarId;

  // Reset status area
  const statusEl = document.getElementById('sendRecapStatus');
  if (statusEl) { statusEl.className = 'hidden'; statusEl.innerHTML = ''; }

  // Re-enable confirm button
  const confirmBtn = document.getElementById('sendRecapConfirmBtn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Ja, verstuur recap';
    confirmBtn.dataset.webinarId = String(webinarId);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  modal.showModal();
}

/**
 * Open the Reset Recap confirmation modal.
 * @param {number} webinarId
 */
function recapOpenResetModal(webinarId) {
  const modal = document.getElementById('resetRecapModal');
  if (!modal) return;

  const statusEl = document.getElementById('resetRecapStatus');
  if (statusEl) {
    statusEl.className = 'hidden';
    statusEl.innerHTML = '';
  }

  const confirmBtn = document.getElementById('resetRecapConfirmBtn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i data-lucide="rotate-ccw" class="w-4 h-4"></i> Ja, reset status';
    confirmBtn.dataset.webinarId = String(webinarId);
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  const cancelBtn = document.getElementById('resetRecapCancelBtn');
  if (cancelBtn) {
    cancelBtn.disabled = false;
  }

  modal.showModal();
}

/**
 * Execute the recap send after modal confirmation.
 * @param {number} webinarId
 */
async function recapConfirmSend(webinarId) {
  const confirmBtn  = document.getElementById('sendRecapConfirmBtn');
  const cancelBtn   = document.getElementById('sendRecapCancelBtn');
  const statusEl    = document.getElementById('sendRecapStatus');
  const loading     = document.getElementById('recap-loading-indicator');

  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Versturen...'; }
  if (cancelBtn)  cancelBtn.disabled = true;

  try {
    const videoInput = document.getElementById('recap-video-url');
    const thumbContainer = document.getElementById('recap-thumb-container');
    const titleEl = document.querySelector('#panel-content [data-role="event-title"]');
    const titleInput = document.getElementById('title-edit-input');

    const odooTitle = (titleEl?.dataset?.odooTitle || '').trim();
    const isEditingTitle = Boolean(titleInput && !titleInput.classList.contains('hidden'));
    const candidateTitle = isEditingTitle
      ? (titleInput?.value || '').trim()
      : (titleEl?.dataset?.overrideTitle || '').trim();

    const effectiveTitleOverride = candidateTitle && candidateTitle !== odooTitle
      ? candidateTitle
      : null;

    const uiPayload = {
      titleOverride: effectiveTitleOverride,
      videoUrl: (videoInput?.value || '').trim(),
      thumbnailUrl: (thumbContainer?.dataset?.thumbnailUrl || '').trim(),
      followupHtml: recapQuillController
        ? recapQuillController.getHTML()
        : (recapQuillEditor ? recapQuillEditor.root.innerHTML : '')
    };

    const res  = await fetch('/events/api/webinar/' + webinarId + '/send-recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uiPayload)
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error || 'Versturen mislukt');

    // Success
    if (statusEl) {
      statusEl.className = 'alert alert-success text-sm p-2 mb-2';
      statusEl.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Recap succesvol verstuurd!</span>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // Close modal and update panel
    setTimeout(() => {
      const modal = document.getElementById('sendRecapModal');
      if (modal) modal.close();
      // Mark send button as sent
      const sendBtn = document.getElementById('recap-send-btn');
      if (sendBtn) {
        sendBtn.textContent = '✓ Recap verstuurd';
        sendBtn.disabled = true;
        sendBtn.className = 'btn btn-sm btn-disabled w-full';
      }
      const readyEl = document.getElementById('recap-ready-status');
      if (readyEl) {
        readyEl.innerHTML = renderRecapReadyBadge(true, [], true);
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
    }, 1500);

  } catch (err) {
    if (statusEl) {
      statusEl.className = 'alert alert-error text-sm p-2 mb-2';
      statusEl.innerHTML = '<i data-lucide="x-circle" class="w-4 h-4"></i><span>' + escapeHtml(err.message) + '</span>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Opnieuw proberen'; }
    if (cancelBtn)  cancelBtn.disabled = false;
    if (loading)    loading.classList.add('hidden');
  }
}

/**
 * Execute recap reset after modal confirmation.
 * @param {number} webinarId
 */
async function recapConfirmReset(webinarId) {
  const confirmBtn  = document.getElementById('resetRecapConfirmBtn');
  const cancelBtn   = document.getElementById('resetRecapCancelBtn');
  const statusEl    = document.getElementById('resetRecapStatus');
  const loading     = document.getElementById('recap-loading-indicator');

  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Resetten...'; }
  if (cancelBtn)  cancelBtn.disabled = true;
  if (loading)    loading.classList.remove('hidden');

  try {
    const res  = await fetch('/events/api/webinar/' + webinarId + '/reset-recap', { method: 'POST' });
    const json = await res.json();

    if (!json.success) throw new Error(json.error || 'Reset mislukt');

    if (statusEl) {
      statusEl.className = 'alert alert-success text-sm p-2 mb-2';
      statusEl.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i><span>Recap status gereset.</span>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    await recapRefreshReadyStatus(webinarId);

    setTimeout(() => {
      const modal = document.getElementById('resetRecapModal');
      if (modal) modal.close();
    }, 900);

  } catch (err) {
    if (statusEl) {
      statusEl.className = 'alert alert-error text-sm p-2 mb-2';
      statusEl.innerHTML = '<i data-lucide="x-circle" class="w-4 h-4"></i><span>' + escapeHtml(err.message) + '</span>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Opnieuw proberen'; }
    if (cancelBtn)  cancelBtn.disabled = false;
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

/**
 * Small inline alert helper for the recap section.
 * @param {Element|null} el
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 */
function recapShowAlert(el, msg, type) {
  if (!el) return;
  const classes = { success: 'text-success', error: 'text-error', info: 'text-info' };
  el.className = 'mt-1 text-xs ' + (classes[type] || '');
  el.textContent = msg;
  if (type === 'success') {
    setTimeout(() => { el.classList.add('hidden'); }, 3000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TAG MAPPING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map color token to a CSS color for preview swatch
 * Uses DaisyUI CSS variables via getComputedStyle
 */
function getCalendarColorPreview(token) {
  const colorMap = {
    'primary':        'oklch(var(--p))',
    'primary-soft':   'oklch(var(--p) / 0.25)',
    'secondary':      'oklch(var(--s))',
    'secondary-soft': 'oklch(var(--s) / 0.25)',
    'accent':         'oklch(var(--a))',
    'accent-soft':    'oklch(var(--a) / 0.25)',
    'info':           'oklch(var(--in))',
    'info-soft':      'oklch(var(--in) / 0.25)',
    'success':        'oklch(var(--su))',
    'success-soft':   'oklch(var(--su) / 0.25)',
    'warning':        'oklch(var(--wa))',
    'warning-soft':   'oklch(var(--wa) / 0.25)',
    'neutral':        'oklch(var(--n))',
    'neutral-soft':   'oklch(var(--n) / 0.25)',
  };
  return colorMap[token] || colorMap['primary'];
}

function openEventTypeMappingModal() {
  const modal = document.getElementById('eventTypeMappingModal');
  modal.showModal();
  loadEventTypeMappings();
}

async function loadEventTypeMappings() {
  const loading = document.getElementById('eventTypeMappingLoading');
  const content = document.getElementById('eventTypeMappingContent');
  const tbody = document.getElementById('eventTypeMappingTableBody');

  loading.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const [mappingsRes, odooEventTypesRes, wpCategoriesRes] = await Promise.all([
      fetch('/events/api/event-type-tag-mappings'),
      fetch('/events/api/odoo-event-types'),
      fetch('/events/api/wp-event-categories')
    ]);

    if (!mappingsRes.ok || !odooEventTypesRes.ok || !wpCategoriesRes.ok) {
      throw new Error('Failed to load mapping data');
    }

    const mappingsResponse = await mappingsRes.json();
    const odooEventTypesResponse = await odooEventTypesRes.json();
    const wpCategoriesResponse = await wpCategoriesRes.json();

    const mappings = mappingsResponse.data;
    const odooEventTypes = odooEventTypesResponse.data;
    const wpCategories = wpCategoriesResponse.data;
    const eventTypeNameById = new Map(
      (odooEventTypes || []).map((eventType) => [eventType.id, eventType.x_name])
    );

    tbody.textContent = '';

    // Render existing mappings
    mappings.forEach(mapping => {
      const row = document.createElement('tr');
      
      const tdName = document.createElement('td');
      const resolvedEventTypeName = eventTypeNameById.get(mapping.odoo_event_type_id);
      tdName.textContent = resolvedEventTypeName || ('Event Type #' + mapping.odoo_event_type_id);
      row.appendChild(tdName);

      const tdCat = document.createElement('td');
      const displayWpTagName = decodeHtmlEntities(mapping.wp_tag_name || '');
      tdCat.textContent = displayWpTagName + ' (' + mapping.wp_tag_slug + ')';
      row.appendChild(tdCat);

      const tdColor = document.createElement('td');
      const colorToken = mapping.calendar_color || 'primary';
      const colorSwatch = document.createElement('span');
      colorSwatch.className = 'inline-flex items-center gap-1';
      const dot = document.createElement('span');
      dot.className = 'w-3 h-3 rounded-full inline-block';
      dot.style.backgroundColor = getCalendarColorPreview(colorToken);
      colorSwatch.appendChild(dot);
      const colorLabel = document.createElement('span');
      colorLabel.className = 'text-xs';
      colorLabel.textContent = colorToken;
      colorSwatch.appendChild(colorLabel);
      tdColor.appendChild(colorSwatch);
      row.appendChild(tdColor);

      const tdActions = document.createElement('td');
      const btnGroup = document.createElement('div');
      btnGroup.className = 'flex gap-1';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-xs btn-info btn-outline';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => editEventTypeMapping(mapping, resolvedEventTypeName);
      btnGroup.appendChild(editBtn);
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-xs btn-error btn-outline';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => deleteEventTypeMapping(mapping.id);
      btnGroup.appendChild(deleteBtn);
      tdActions.appendChild(btnGroup);
      row.appendChild(tdActions);

      tbody.appendChild(row);
    });

    // Populate form selects
    const odooEventTypeSelect = document.getElementById('odooEventTypeSelect');
    const wpTagSelect = document.getElementById('wpTagSelect');
    
    // Clear and populate Odoo event type select
    odooEventTypeSelect.innerHTML = '<option value="">Select Odoo Event Type...</option>';
    const mappedOdooEventTypeIds = new Set(mappings.map(m => m.odoo_event_type_id));
    odooEventTypes.forEach(eventType => {
      if (mappedOdooEventTypeIds.has(eventType.id)) return; // Skip already mapped event types
      const option = document.createElement('option');
      option.value = eventType.id;
      option.textContent = eventType.x_name;
      odooEventTypeSelect.appendChild(option);
    });

    // Clear and populate WP Event Category select
    wpTagSelect.innerHTML = '<option value="">Select WP Tag...</option>';
    wpCategories.forEach(tag => {
      const wpTagNameDecoded = decodeHtmlEntities(tag.name || '');
      const option = document.createElement('option');
      option.value = tag.id;
      option.dataset.slug = tag.slug;
      option.dataset.name = wpTagNameDecoded;
      option.textContent = wpTagNameDecoded + ' (' + tag.count + ')';
      wpTagSelect.appendChild(option);
    });

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    console.error('Event type mapping load error:', error);
    alert('⚠️  Failed to load event type mappings');
    loading.classList.add('hidden');
  }
}

/**
 * Edit an existing mapping — populate the form with current values
 */
function editEventTypeMapping(mapping, eventTypeName) {
  const eventTypeSelect = document.getElementById('odooEventTypeSelect');
  const wpTagSelect = document.getElementById('wpTagSelect');
  const colorSelect = document.getElementById('calendarColorSelect');
  const formTitle = document.getElementById('mappingFormTitle');
  const cancelBtn = document.getElementById('btnCancelEditMapping');
  const saveBtn = document.getElementById('btnSaveEventTypeMapping');

  // Add the currently-mapped event type as an option (it's normally filtered out)
  const existingOpt = eventTypeSelect.querySelector(`option[value="${mapping.odoo_event_type_id}"]`);
  if (!existingOpt) {
    const opt = document.createElement('option');
    opt.value = mapping.odoo_event_type_id;
    opt.textContent = eventTypeName || ('Event Type #' + mapping.odoo_event_type_id);
    eventTypeSelect.appendChild(opt);
  }

  // Set form values
  eventTypeSelect.value = String(mapping.odoo_event_type_id);
  eventTypeSelect.disabled = true; // Lock event type during edit
  wpTagSelect.value = String(mapping.wp_tag_id);
  if (colorSelect) colorSelect.value = mapping.calendar_color || 'primary';

  // Switch to edit mode UI
  formTitle.textContent = 'Edit Mapping';
  cancelBtn.classList.remove('hidden');
  saveBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Update';
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Scroll form into view
  eventTypeSelect.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Cancel edit mode — reset form back to "New Mapping" state
 */
function cancelEditMapping() {
  const eventTypeSelect = document.getElementById('odooEventTypeSelect');
  const formTitle = document.getElementById('mappingFormTitle');
  const cancelBtn = document.getElementById('btnCancelEditMapping');
  const saveBtn = document.getElementById('btnSaveEventTypeMapping');
  const colorSelect = document.getElementById('calendarColorSelect');

  eventTypeSelect.disabled = false;
  eventTypeSelect.value = '';
  document.getElementById('wpTagSelect').value = '';
  if (colorSelect) colorSelect.value = 'primary';

  formTitle.textContent = 'New Mapping';
  cancelBtn.classList.add('hidden');
  saveBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save';
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Reload to restore filtered dropdown
  loadEventTypeMappings();
}

async function saveEventTypeMapping() {
  const eventTypeSelect = document.getElementById('odooEventTypeSelect');
  const wpTagSelect = document.getElementById('wpTagSelect');
  const colorSelect = document.getElementById('calendarColorSelect');

  const odooEventTypeId = parseInt(eventTypeSelect.value);
  const wpTagId = parseInt(wpTagSelect.value);

  if (!odooEventTypeId || !wpTagId) {
    alert('⚠️  Select both an Odoo event type and a WP tag');
    return;
  }

  const wpTagSlug = wpTagSelect.options[wpTagSelect.selectedIndex].dataset.slug;
  const wpTagName = wpTagSelect.options[wpTagSelect.selectedIndex].dataset.name;
  const calendarColor = colorSelect ? colorSelect.value : 'primary';

  try {
    const res = await fetch('/events/api/event-type-tag-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        odoo_event_type_id: odooEventTypeId,
        wp_tag_id: wpTagId,
        wp_tag_slug: wpTagSlug,
        wp_tag_name: wpTagName,
        calendar_color: calendarColor
      })
    });

    if (!res.ok) throw new Error(await res.text());

    // Reset edit mode if active
    const formTitle = document.getElementById('mappingFormTitle');
    const cancelBtn = document.getElementById('btnCancelEditMapping');
    const saveBtn = document.getElementById('btnSaveEventTypeMapping');
    eventTypeSelect.disabled = false;
    formTitle.textContent = 'New Mapping';
    cancelBtn.classList.add('hidden');
    saveBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Save';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    alert('✅ Event type mapping saved');
    loadEventTypeMappings();
    window.dispatchEvent(new CustomEvent('mappings-changed'));
  } catch (error) {
    console.error('Event type mapping save error:', error);
    alert('❌ Failed to save mapping: ' + error.message);
  }
}

async function deleteEventTypeMapping(id) {
  if (!confirm('Delete this event type mapping?')) return;

  try {
    const res = await fetch('/events/api/event-type-tag-mappings/' + id, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error(await res.text());

    alert('✅ Event type mapping deleted');
    loadEventTypeMappings();
    window.dispatchEvent(new CustomEvent('mappings-changed'));
  } catch (error) {
    console.error('Event type mapping delete error:', error);
    alert('❌ Failed to delete mapping: ' + error.message);
  }
}

// ============================================================================
// EDITORIAL CONTENT EDITOR
// ============================================================================

/**
 * Open editorial editor modal for a webinar
 */
async function openEditorialEditor(webinarId) {
  try {
    // Fetch existing editorial content
    const res = await fetch('/events/api/editorial/' + webinarId);
    if (!res.ok) throw new Error(await res.text());
    
    const { data } = await res.json();
    const editorialContent = data || { blocks: [], version: 1 };
    
    // Render modal
    renderEditorialModal(webinarId, editorialContent);
    
  } catch (error) {
    console.error('Editorial fetch error:', error);
    alert('❌ Failed to load editorial content: ' + error.message);
  }
}

/**
 * Render editorial editor modal using DOM APIs
 */
function renderEditorialModal(webinarId, editorialContent) {
  // Remove existing modal if any
  const existing = document.getElementById('editorialModal');
  if (existing) existing.remove();
  
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'editorialModal';
  modal.className = 'modal modal-open';
  
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box max-w-4xl';
  
  // Header
  const header = document.createElement('h3');
  header.className = 'font-bold text-lg mb-4';
  header.textContent = 'Edit Description - Webinar #' + webinarId;
  modalBox.appendChild(header);
  
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'flex gap-2 mb-4';
  
  const addParaBtn = document.createElement('button');
  addParaBtn.className = 'btn btn-sm btn-outline';
  addParaBtn.textContent = '+ Add Paragraph';
  addParaBtn.onclick = () => addBlock('paragraph');
  toolbar.appendChild(addParaBtn);
  
  const addShortcodeBtn = document.createElement('button');
  addShortcodeBtn.className = 'btn btn-sm btn-outline';
  addShortcodeBtn.textContent = '📝 + Add Registration Form';
  addShortcodeBtn.onclick = () => addBlock('shortcode');
  toolbar.appendChild(addShortcodeBtn);
  
  modalBox.appendChild(toolbar);
  
  // Blocks container
  const blocksContainer = document.createElement('div');
  blocksContainer.id = 'editorialBlocks';
  blocksContainer.className = 'space-y-3 mb-4 max-h-96 overflow-y-auto';
  modalBox.appendChild(blocksContainer);
  
  // Render existing blocks
  if (editorialContent.blocks && editorialContent.blocks.length > 0) {
    editorialContent.blocks.forEach((block, index) => {
      renderBlock(blocksContainer, block, index);
    });
  } else {
    const emptyState = document.createElement('p');
    emptyState.className = 'text-base-content/50 text-center py-8';
    emptyState.textContent = 'No blocks yet. Add a paragraph or registration form to start.';
    blocksContainer.appendChild(emptyState);
  }
  
  // Footer actions
  const footer = document.createElement('div');
  footer.className = 'modal-action';
  
  const previewBtn = document.createElement('button');
  previewBtn.className = 'btn btn-outline';
  previewBtn.textContent = 'Preview';
  previewBtn.onclick = () => previewEditorialContent();
  footer.appendChild(previewBtn);
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => saveEditorialContent(webinarId);
  footer.appendChild(saveBtn);
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => modal.remove();
  footer.appendChild(cancelBtn);
  
  modalBox.appendChild(footer);
  modal.appendChild(modalBox);
  document.body.appendChild(modal);
  
  lucide.createIcons();
}

/**
 * Render a single block in the editor
 */
function renderBlock(container, block, index) {
  const blockDiv = document.createElement('div');
  blockDiv.className = 'card bg-base-200 shadow-sm';
  blockDiv.dataset.blockIndex = index;
  
  const blockBody = document.createElement('div');
  blockBody.className = 'card-body p-4';
  
  // Block header
  const blockHeader = document.createElement('div');
  blockHeader.className = 'flex justify-between items-center mb-2';
  
  const blockTitle = document.createElement('h4');
  blockTitle.className = 'font-semibold text-sm';
  blockTitle.textContent = block.type === 'paragraph' ? '📄 Paragraph' : '📝 Registration Form';
  blockHeader.appendChild(blockTitle);
  
  // Block actions
  const blockActions = document.createElement('div');
  blockActions.className = 'flex gap-1';
  
  const moveUpBtn = document.createElement('button');
  moveUpBtn.className = 'btn btn-xs btn-ghost';
  moveUpBtn.innerHTML = '↑';
  moveUpBtn.onclick = () => moveBlock(index, -1);
  if (index === 0) moveUpBtn.disabled = true;
  blockActions.appendChild(moveUpBtn);
  
  const moveDownBtn = document.createElement('button');
  moveDownBtn.className = 'btn btn-xs btn-ghost';
  moveDownBtn.innerHTML = '↓';
  moveDownBtn.onclick = () => moveBlock(index, 1);
  blockActions.appendChild(moveDownBtn);
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-xs btn-error btn-ghost';
  deleteBtn.textContent = '🗑️';
  deleteBtn.onclick = () => deleteBlock(index);
  blockActions.appendChild(deleteBtn);
  
  blockHeader.appendChild(blockActions);
  blockBody.appendChild(blockHeader);
  
  // Block content
  if (block.type === 'paragraph') {
    const textarea = document.createElement('textarea');
    textarea.className = 'textarea textarea-bordered w-full';
    textarea.rows = 4;
    textarea.placeholder = 'Enter paragraph text...';
    textarea.value = block.content || '';
    textarea.dataset.blockType = 'paragraph';
    blockBody.appendChild(textarea);
  } else if (block.type === 'shortcode') {
    // Hardcoded shortcode: [forminator_form id="14547"]
    const shortcodeDisplay = document.createElement('div');
    shortcodeDisplay.className = 'mockup-code bg-base-200 text-sm';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = '[forminator_form id="14547"]';
    pre.appendChild(code);
    shortcodeDisplay.appendChild(pre);
    blockBody.appendChild(shortcodeDisplay);
    
    const note = document.createElement('p');
    note.className = 'text-xs text-base-content/60 mt-2';
    note.textContent = 'Registration form shortcode (auto-inserted)';
    blockBody.appendChild(note);
    
    // Hidden inputs to store values for collectBlocks
    const nameInput = document.createElement('input');
    nameInput.type = 'hidden';
    nameInput.value = 'forminator_form';
    nameInput.dataset.shortcodePart = 'name';
    blockBody.appendChild(nameInput);
    
    const attrsInput = document.createElement('input');
    attrsInput.type = 'hidden';
    attrsInput.value = JSON.stringify({ id: "14547" });
    attrsInput.dataset.shortcodePart = 'attributes';
    blockBody.appendChild(attrsInput);
  }
  
  blockDiv.appendChild(blockBody);
  container.appendChild(blockDiv);
}

/**
 * Add a new block
 */
function addBlock(type) {
  const container = document.getElementById('editorialBlocks');
  
  // Remove empty state if present
  const emptyState = container.querySelector('.text-base-content\\/50');
  if (emptyState) emptyState.remove();
  
  const newBlock = type === 'paragraph' 
    ? { type: 'paragraph', content: '' }
    : { type: 'shortcode', name: 'forminator_form', attributes: { id: '14547' } };
  
  const index = container.children.length;
  renderBlock(container, newBlock, index);
  
  lucide.createIcons();
}

/**
 * Delete a block
 */
function deleteBlock(index) {
  const container = document.getElementById('editorialBlocks');
  const blocks = Array.from(container.children);
  
  if (index >= 0 && index < blocks.length) {
    blocks[index].remove();
    
    // Re-index remaining blocks
    reindexBlocks();
    
    // Add empty state if no blocks left
    if (container.children.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'text-base-content/50 text-center py-8';
      emptyState.textContent = 'No blocks yet. Add a paragraph or registration form to start.';
      container.appendChild(emptyState);
    }
  }
}

/**
 * Move a block up or down
 */
function moveBlock(index, direction) {
  const container = document.getElementById('editorialBlocks');
  const blocks = Array.from(container.children);
  const newIndex = index + direction;
  
  if (newIndex >= 0 && newIndex < blocks.length) {
    const block = blocks[index];
    
    if (direction === -1) {
      container.insertBefore(block, blocks[newIndex]);
    } else {
      if (newIndex + 1 < blocks.length) {
        container.insertBefore(block, blocks[newIndex + 1]);
      } else {
        container.appendChild(block);
      }
    }
    
    reindexBlocks();
  }
}

/**
 * Re-index all blocks after deletion/movement
 */
function reindexBlocks() {
  const container = document.getElementById('editorialBlocks');
  const blocks = Array.from(container.children);
  
  blocks.forEach((block, index) => {
    block.dataset.blockIndex = index;
    
    // Update move down button disabled state
    const moveDownBtn = block.querySelector('button[onclick*="moveBlock"]');
    if (moveDownBtn && moveDownBtn.textContent === '↓') {
      moveDownBtn.disabled = (index === blocks.length - 1);
    }
    
    // Update move up button disabled state
    const moveUpBtn = block.querySelector('button[onclick*="moveBlock"]');
    if (moveUpBtn && moveUpBtn.textContent === '↑') {
      moveUpBtn.disabled = (index === 0);
    }
  });
}

/**
 * Collect blocks from UI
 */
function collectBlocks() {
  const container = document.getElementById('editorialBlocks');
  const blocks = Array.from(container.children);
  
  return blocks.map(blockDiv => {
    const textarea = blockDiv.querySelector('textarea[data-block-type="paragraph"]');
    if (textarea) {
      return {
        type: 'paragraph',
        content: textarea.value
      };
    }
    
    const nameInput = blockDiv.querySelector('input[data-shortcode-part="name"]');
    const attrsInput = blockDiv.querySelector('input[data-shortcode-part="attributes"]');
    
    if (nameInput && attrsInput) {
      let attributes = {};
      try {
        attributes = JSON.parse(attrsInput.value || '{}');
      } catch (e) {
        console.warn('Invalid JSON in attributes, using empty object:', e);
      }
      
      return {
        type: 'shortcode',
        name: nameInput.value,
        attributes
      };
    }
    
    return null;
  }).filter(block => block !== null);
}

/**
 * Preview editorial content
 */
function previewEditorialContent() {
  const blocks = collectBlocks();
  
  // Build HTML preview
  const html = blocks.map(block => {
    if (block.type === 'paragraph') {
      return '<p>' + escapeHtml(block.content) + '</p>';
    } else if (block.type === 'shortcode') {
      const attrs = Object.entries(block.attributes || {})
        .map(([k, v]) => k + '="' + escapeHtml(String(v)) + '"')
        .join(' ');
      return '[' + block.name + (attrs ? ' ' + attrs : '') + ']';
    }
    return '';
  }).join('\n\n');
  
  // Create preview modal
  const previewModal = document.createElement('div');
  previewModal.className = 'modal modal-open';
  
  const previewBox = document.createElement('div');
  previewBox.className = 'modal-box max-w-3xl';
  
  const previewHeader = document.createElement('h3');
  previewHeader.className = 'font-bold text-lg mb-4';
  previewHeader.textContent = 'Preview';
  previewBox.appendChild(previewHeader);
  
  const previewContent = document.createElement('div');
  previewContent.className = 'bg-base-200 p-4 rounded-lg whitespace-pre-wrap font-mono text-sm max-h-96 overflow-y-auto';
  previewContent.textContent = html;
  previewBox.appendChild(previewContent);
  
  const previewFooter = document.createElement('div');
  previewFooter.className = 'modal-action';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => previewModal.remove();
  previewFooter.appendChild(closeBtn);
  
  previewBox.appendChild(previewFooter);
  previewModal.appendChild(previewBox);
  document.body.appendChild(previewModal);
}

/**
 * Save editorial content
 */
async function saveEditorialContent(webinarId) {
  try {
    const blocks = collectBlocks();
    
    const editorialContent = blocks.length > 0 
      ? { blocks, version: 1 }
      : null; // NULL = use Odoo description
    
    const res = await fetch('/events/api/editorial/' + webinarId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editorialContent })
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Save failed');
    }
    
    alert('✅ Editorial content saved! Re-publish the webinar to apply changes.');
    
    // Close modal
    const modal = document.getElementById('editorialModal');
    if (modal) modal.remove();
    
  } catch (error) {
    console.error('Editorial save error:', error);
    alert('❌ Failed to save: ' + error.message);
  }
}

// ================================================================================
// FORMINATOR FORMS MANAGEMENT
// ================================================================================

let forminatorForms = [];
let editingFormId = null;

/**
 * Open Forminator Forms modal
 */
function openForminatorFormsModal() {
  const modal = document.getElementById('forminatorFormsModal');
  modal.showModal();
  loadForminatorForms();
}

/**
 * Load forminator forms from backend
 */
async function loadForminatorForms() {
  const loading = document.getElementById('forminatorFormsLoading');
  const content = document.getElementById('forminatorFormsContent');
  const tbody = document.getElementById('forminatorFormsTableBody');

  loading.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const response = await fetch('/events/api/forminator-forms', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch forms');
    }
    
    const result = await response.json();
    forminatorForms = result.data || [];
    
    // Clear table
    tbody.innerHTML = '';
    
    // Sort by display_order
    forminatorForms.sort((a, b) => a.display_order - b.display_order);
    
    // Populate table
    forminatorForms.forEach(form => {
      const row = document.createElement('tr');
      
      const tdFormId = document.createElement('td');
      tdFormId.innerHTML = `<code class="badge badge-ghost">${escapeHtml(form.form_id)}</code>`;
      row.appendChild(tdFormId);
      
      const tdName = document.createElement('td');
      tdName.innerHTML = `<strong>${escapeHtml(form.form_name)}</strong>`;
      row.appendChild(tdName);
      
      const tdDescription = document.createElement('td');
      tdDescription.innerHTML = form.description 
        ? `<span class="text-xs">${escapeHtml(form.description)}</span>` 
        : '<span class="text-gray-400">-</span>';
      row.appendChild(tdDescription);
      
      const tdOrder = document.createElement('td');
      tdOrder.textContent = form.display_order;
      row.appendChild(tdOrder);
      
      const tdStatus = document.createElement('td');
      tdStatus.innerHTML = form.is_active 
        ? '<span class="badge badge-success badge-sm">Actief</span>' 
        : '<span class="badge badge-ghost badge-sm">Inactief</span>';
      row.appendChild(tdStatus);
      
      const tdActions = document.createElement('td');
      const btnGroup = document.createElement('div');
      btnGroup.className = 'flex gap-1';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-xs btn-info btn-outline';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => editForminatorForm(form);
      btnGroup.appendChild(editBtn);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-xs btn-error btn-outline';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => deleteForminatorForm(form.id, form.form_name);
      btnGroup.appendChild(deleteBtn);
      
      tdActions.appendChild(btnGroup);
      row.appendChild(tdActions);
      
      tbody.appendChild(row);
    });

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    console.error('Forminator forms load error:', error);
    alert('⚠️  Failed to load forminator forms: ' + error.message);
    loading.classList.add('hidden');
  }
}

/**
 * Edit forminator form
 */
function editForminatorForm(form) {
  editingFormId = form.id;
  
  document.getElementById('formFormTitle').textContent = 'Formulier Bewerken';
  document.getElementById('editingFormId').value = form.id;
  document.getElementById('formIdInput').value = form.form_id;
  document.getElementById('formIdInput').disabled = false;
  document.getElementById('formNameInput').value = form.form_name;
  document.getElementById('formDescriptionInput').value = form.description || '';
  document.getElementById('formOrderInput').value = form.display_order;
  document.getElementById('formActiveCheckbox').checked = form.is_active;
  
  document.getElementById('btnCancelEditForm').classList.remove('hidden');
  document.getElementById('btnSaveForm').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Bijwerken';
  lucide.createIcons();
}

/**
 * Cancel edit form
 */
function cancelEditForm() {
  editingFormId = null;
  
  document.getElementById('formFormTitle').textContent = 'Nieuw Formulier';
  document.getElementById('editingFormId').value = '';
  document.getElementById('formIdInput').value = '';
  document.getElementById('formIdInput').disabled = false;
  document.getElementById('formNameInput').value = '';
  document.getElementById('formDescriptionInput').value = '';
  document.getElementById('formOrderInput').value = '0';
  document.getElementById('formActiveCheckbox').checked = true;
  
  document.getElementById('btnCancelEditForm').classList.add('hidden');
  document.getElementById('btnSaveForm').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Opslaan';
  lucide.createIcons();
}

/**
 * Save forminator form (create or update)
 */
async function saveForminatorForm() {
  const formId = document.getElementById('formIdInput').value.trim();
  const formName = document.getElementById('formNameInput').value.trim();
  const description = document.getElementById('formDescriptionInput').value.trim();
  const displayOrder = parseInt(document.getElementById('formOrderInput').value, 10);
  const isActive = document.getElementById('formActiveCheckbox').checked;

  if (!formId || !formName) {
    alert('⚠️ Form ID en Naam zijn verplicht');
    return;
  }

  const formData = {
    form_id: formId,
    form_name: formName,
    description: description || null,
    display_order: displayOrder,
    is_active: isActive
  };

  try {
    const url = editingFormId 
      ? `/events/api/forminator-forms/${editingFormId}`
      : '/events/api/forminator-forms';
    
    const method = editingFormId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save form');
    }

    alert(editingFormId ? '✅ Formulier bijgewerkt!' : '✅ Formulier toegevoegd!');
    cancelEditForm();
    await loadForminatorForms();
  } catch (error) {
    console.error('Save form failed:', error);
    alert('❌ Fout bij opslaan: ' + error.message);
  }
}

/**
 * Delete forminator form
 */
async function deleteForminatorForm(id, name) {
  if (!confirm(`Weet je zeker dat je "${name}" wilt verwijderen?`)) {
    return;
  }

  try {
    const response = await fetch(`/events/api/forminator-forms/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to delete form');
    }

    alert('✅ Formulier verwijderd!');
    await loadForminatorForms();
  } catch (error) {
    console.error('Delete form failed:', error);
    alert('❌ Fout bij verwijderen: ' + error.message);
  }
}

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * Escape HTML (client-side helper)
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(text || '');
  return textarea.value;
}

// ── Send Recap modal: confirm button global binding ───────────────────────────
// The confirm button lives outside the detail panel (inside a <dialog>),
// so it cannot be handled by the delegated panel listener. We bind it once
// at module-load time via a document-level click listener.
document.addEventListener('click', function(e) {
  const btn = e.target.closest('#sendRecapConfirmBtn');
  if (!btn || btn.disabled) return;
  const webinarId = Number(btn.dataset.webinarId);
  if (webinarId) {
    recapConfirmSend(webinarId);
  }
});

document.addEventListener('click', function(e) {
  const btn = e.target.closest('#resetRecapConfirmBtn');
  if (!btn || btn.disabled) return;
  const webinarId = Number(btn.dataset.webinarId);
  if (webinarId) {
    recapConfirmReset(webinarId);
  }
});
