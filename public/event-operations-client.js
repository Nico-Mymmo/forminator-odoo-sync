/**
 * Event Operations - Client-side UI rendering
 * PHASE 8: FullCalendar workspace with detail panel
 * Depends on: STATUS_BADGES, FullCalendar v6, formatEventDateTime from ui.js
 */

// ══════════════════════════════════════════════════════════════════════════════
// FULLCALENDAR INTEGRATION (Phase 8)
// ══════════════════════════════════════════════════════════════════════════════

let calendarInstance = null; // Global calendar instance

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

  emptyState.style.display = 'none';
  panelContent.style.display = 'block';

  panelContent.innerHTML = renderDetailPanelContent(webinar, snapshot, state, regCount);
  
  // Re-initialize Lucide icons after DOM update
  setTimeout(() => {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
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
    }
  });

  detailPanelDelegationInitialized = true;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAG MAPPING
// ══════════════════════════════════════════════════════════════════════════════

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

      const tdActions = document.createElement('td');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-xs btn-error btn-outline';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => deleteEventTypeMapping(mapping.id);
      tdActions.appendChild(deleteBtn);
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

async function saveEventTypeMapping() {
  const eventTypeSelect = document.getElementById('odooEventTypeSelect');
  const wpTagSelect = document.getElementById('wpTagSelect');

  const odooEventTypeId = parseInt(eventTypeSelect.value);
  const wpTagId = parseInt(wpTagSelect.value);

  if (!odooEventTypeId || !wpTagId) {
    alert('⚠️  Select both an Odoo event type and a WP tag');
    return;
  }

  const wpTagSlug = wpTagSelect.options[wpTagSelect.selectedIndex].dataset.slug;
  const wpTagName = wpTagSelect.options[wpTagSelect.selectedIndex].dataset.name;

  try {
    const res = await fetch('/events/api/event-type-tag-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        odoo_event_type_id: odooEventTypeId,
        wp_tag_id: wpTagId,
        wp_tag_slug: wpTagSlug,
        wp_tag_name: wpTagName
      })
    });

    if (!res.ok) throw new Error(await res.text());

    alert('✅ Event type mapping saved');
    loadEventTypeMappings();
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
