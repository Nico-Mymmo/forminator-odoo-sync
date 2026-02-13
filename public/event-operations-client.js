/**
 * Event Operations - Client-side UI rendering
 * Card view rendering with DOM APIs
 * Depends on: STATUS_BADGES, escapeHtml from parent scope (ui.js)
 */

// ── Render single webinar card ──
function renderWebinarCard(webinar, snapshot, registrationCount) {
  const state = snapshot ? snapshot.computed_state : 'not_published';
  const badge = STATUS_BADGES[state] || STATUS_BADGES.not_published;
  const wpId = snapshot?.wp_snapshot?.id;
  const regCount = registrationCount || 0;
  
  // Create card container
  const card = document.createElement('div');
  card.className = 'card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow min-h-[480px]';
  
  // Card body
  const cardBody = document.createElement('div');
  cardBody.className = 'card-body p-4 flex flex-col';
  
  // Header: ID + Status badge
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-2';
  
  const idSpan = document.createElement('span');
  idSpan.className = 'font-mono text-sm text-base-content/60';
  idSpan.textContent = '#' + webinar.id;
  
  const statusBadge = document.createElement('span');
  statusBadge.className = 'badge ' + badge.css + ' badge-sm';
  statusBadge.textContent = badge.label;
  
  header.appendChild(idSpan);
  header.appendChild(statusBadge);
  
  // Title
  const title = document.createElement('h3');
  title.className = 'card-title text-base mb-4';
  title.textContent = webinar.x_name;
  
  // Meta info grid
  const metaGrid = document.createElement('div');
  metaGrid.className = 'space-y-3 text-sm flex-1 overflow-y-auto';
  
  // Format datetime (use global formatEventDateTime from ui.js)
  let dateValue = '—';
  let timeValue = '—';
  if (webinar.x_studio_event_datetime && window.formatEventDateTime) {
    const formatted = window.formatEventDateTime(webinar.x_studio_event_datetime);
    dateValue = formatted.date;
    timeValue = formatted.time;
  }
  
  // Date
  const dateRow = createMetaRow('calendar', 'Datum', dateValue);
  metaGrid.appendChild(dateRow);
  
  // Time
  const timeRow = createMetaRow('clock', 'Tijd', timeValue);
  metaGrid.appendChild(timeRow);
  
  // Duration
  const durationValue = webinar.x_studio_event_duration_minutes ? webinar.x_studio_event_duration_minutes + ' min' : '—';
  const durationRow = createMetaRow('clock', 'Duur', durationValue);
  metaGrid.appendChild(durationRow);
  
  // Registrations
  const regRow = createMetaRow('users', 'Registrations', regCount.toString());
  metaGrid.appendChild(regRow);
  
  const eventTypeName = Array.isArray(webinar.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1
    ? webinar.x_webinar_event_type_id[1]
    : '—';
  const eventTypeRow = createMetaRow('tag', 'Event Type', eventTypeName);
  metaGrid.appendChild(eventTypeRow);
  
  // WordPress link (if published)
  if (wpId) {
    const wpRow = createMetaRow('external-link', 'WordPress', '');
    const wpLink = document.createElement('a');
    wpLink.href = 'https://openvme.be/wp-admin/post.php?post=' + wpId + '&action=edit';
    wpLink.target = '_blank';
    wpLink.className = 'link link-primary';
    wpLink.textContent = 'WP #' + wpId;
    wpRow.querySelector('.meta-value').appendChild(wpLink);
    metaGrid.appendChild(wpRow);
  }
  
  // Card actions
  const actions = document.createElement('div');
  actions.className = 'card-actions mt-auto pt-3 border-t border-base-200 flex flex-row gap-2';
  
  if (state === 'not_published') {
    // Dropdown button with publish options
    const dropdown = createPublishDropdown(webinar.id, 'Publish', 'btn-primary');
    actions.appendChild(dropdown);
  } else if (state === 'draft') {
    // Dropdown button with publish options for draft
    const dropdown = createPublishDropdown(webinar.id, 'Publish', 'btn-primary');
    actions.appendChild(dropdown);
  } else {
    // Dropdown button with re-publish options
    const buttonStyle = state === 'out_of_sync' ? 'btn-warning' : 'btn-primary';
    const dropdown = createPublishDropdown(webinar.id, 'Re-publish', buttonStyle);
    actions.appendChild(dropdown);
  }
  
  // Edit Description button (for published/draft webinars)
  if (state !== 'not_published') {
    const editDescBtn = createActionButton('edit', 'Edit Description', 'btn-outline btn-sm', () => {
      openEditorialEditor(webinar.id);
    });
    actions.appendChild(editDescBtn);
  }
  
  // Assemble card
  cardBody.appendChild(header);
  cardBody.appendChild(title);
  cardBody.appendChild(metaGrid);
  if (actions.children.length > 0) cardBody.appendChild(actions);
  
  card.appendChild(cardBody);
  
  return card;
}

// ── Helper: Create meta row (icon + label + value) ──
function createMetaRow(iconName, label, value) {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 text-base-content/80';
  
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', iconName);
  icon.className = 'w-4 h-4 text-base-content/60';
  
  const labelSpan = document.createElement('span');
  labelSpan.className = 'font-medium min-w-[100px]';
  labelSpan.textContent = label + ':';
  
  const valueSpan = document.createElement('span');
  valueSpan.className = 'meta-value';
  valueSpan.textContent = value;
  
  row.appendChild(icon);
  row.appendChild(labelSpan);
  row.appendChild(valueSpan);
  
  return row;
}

// ── Helper: Create action button with icon ──
function createActionButton(iconName, label, cssClass, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm ' + cssClass;
  btn.onclick = onClick;
  
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', iconName);
  icon.className = 'w-4 h-4';
  
  const span = document.createElement('span');
  span.textContent = label;
  
  btn.appendChild(icon);
  btn.appendChild(span);
  
  return btn;
}

// ── Helper: Create publish dropdown button ──
function createPublishDropdown(webinarId, buttonLabel, buttonClass) {
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown dropdown-end';
  
  // Main button
  const btn = document.createElement('div');
  btn.className = 'btn btn-sm ' + buttonClass;
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('role', 'button');
  
  const iconName = buttonLabel === 'Publish' ? 'upload' : 'refresh-cw';
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', iconName);
  icon.className = 'w-4 h-4';
  
  const span = document.createElement('span');
  span.textContent = buttonLabel;
  
  const chevron = document.createElement('i');
  chevron.setAttribute('data-lucide', 'chevron-down');
  chevron.className = 'w-3 h-3 ml-1';
  
  btn.appendChild(icon);
  btn.appendChild(span);
  btn.appendChild(chevron);
  
  // Dropdown menu
  const menu = document.createElement('ul');
  menu.className = 'dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-36';
  menu.setAttribute('tabindex', '0');
  
  // Create menu items
  const options = [
    { status: 'publish', icon: 'globe', label: 'Publish' },
    { status: 'draft', icon: 'file-edit', label: 'Draft' },
    { status: 'private', icon: 'lock', label: 'Private' }
  ];
  
  options.forEach(opt => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    
    const optIcon = document.createElement('i');
    optIcon.setAttribute('data-lucide', opt.icon);
    optIcon.className = 'w-3 h-3';
    
    const optLabel = document.createElement('span');
    optLabel.textContent = opt.label;
    
    a.appendChild(optIcon);
    a.appendChild(optLabel);
    
    a.onclick = function() {
      // Call publishWebinar with status
      if (typeof publishWebinar === 'function') {
        publishWebinar(webinarId, btn, opt.status);
      }
    };
    
    li.appendChild(a);
    menu.appendChild(li);
  });
  
  dropdown.appendChild(btn);
  dropdown.appendChild(menu);
  
  return dropdown;
}

// ── Render cards view (main entry point) ──
function renderCardsView(webinars, snapshotMap, registrationCounts) {
  const container = document.getElementById('cardsContainer');
  if (!container) {
    console.error('Cards container element not found');
    return;
  }
  
  // Clear container
  container.innerHTML = '';
  
  if (webinars.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'col-span-full text-center py-12 text-base-content/60';
    emptyState.innerHTML = '<i data-lucide="inbox" class="w-12 h-12 mx-auto mb-2 opacity-50"></i><p>No webinars found</p>';
    container.appendChild(emptyState);
    lucide.createIcons();
    return;
  }
  
  // Render cards
  for (const webinar of webinars) {
    const snapshot = snapshotMap.get(webinar.id);
    const regCount = registrationCounts[webinar.id] || 0;
    const cardEl = renderWebinarCard(webinar, snapshot, regCount);
    container.appendChild(cardEl);
  }
  
  // Re-initialize Lucide icons
  lucide.createIcons();
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
