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
  card.className = 'card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow';
  
  // Card body
  const cardBody = document.createElement('div');
  cardBody.className = 'card-body';
  
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
  title.className = 'card-title text-base mb-3';
  title.textContent = webinar.x_name;
  
  // Meta info grid
  const metaGrid = document.createElement('div');
  metaGrid.className = 'space-y-2 text-sm';
  
  // Date
  const dateRow = createMetaRow('calendar', 'Date', webinar.x_studio_date || '—');
  metaGrid.appendChild(dateRow);
  
  // Time
  const timeRow = createMetaRow('clock', 'Time', webinar.x_studio_starting_time || '—');
  metaGrid.appendChild(timeRow);
  
  // Registrations
  const regRow = createMetaRow('users', 'Registrations', regCount.toString());
  metaGrid.appendChild(regRow);
  
  // Tags
  if (webinar.x_studio_tag_ids && Array.isArray(webinar.x_studio_tag_ids) && webinar.x_studio_tag_ids.length > 0) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'flex items-center gap-2 text-base-content/80';
    
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'tag');
    icon.className = 'w-4 h-4 text-base-content/60';
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'font-medium min-w-[100px]';
    labelSpan.textContent = 'Tags:';
    
    const valueSpan = document.createElement('span');
    valueSpan.className = 'flex flex-wrap gap-1';
    webinar.x_studio_tag_ids.forEach(tagId => {
      const badge = document.createElement('span');
      badge.className = 'badge badge-outline badge-xs';
      // Use window.tagNamesMap from parent context
      const tagName = (window.tagNamesMap && window.tagNamesMap.get(tagId)) || 'Tag #' + tagId;
      badge.textContent = tagName;
      valueSpan.appendChild(badge);
    });
    
    tagsRow.appendChild(icon);
    tagsRow.appendChild(labelSpan);
    tagsRow.appendChild(valueSpan);
    metaGrid.appendChild(tagsRow);
  }
  
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
  actions.className = 'card-actions justify-end mt-4';
  
  if (state === 'not_published') {
    const publishBtn = createActionButton('upload', 'Publish', 'btn-primary', () => {
      if (typeof publishWebinar === 'function') publishWebinar(webinar.id, publishBtn);
    });
    actions.appendChild(publishBtn);
  } else {
    // Show Re-publish button for published or out_of_sync states
    const buttonStyle = state === 'out_of_sync' ? 'btn-warning' : 'btn-primary';
    const republishBtn = createActionButton('refresh-cw', 'Re-publish', buttonStyle, () => {
      if (typeof publishWebinar === 'function') publishWebinar(webinar.id, republishBtn);
    });
    actions.appendChild(republishBtn);
  }
  
  // Edit Description button (for published webinars)
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

function openTagModal() {
  const modal = document.getElementById('tagModal');
  modal.showModal();
  loadTagMappings();
}

async function loadTagMappings() {
  const loading = document.getElementById('tagMappingLoading');
  const content = document.getElementById('tagMappingContent');
  const tbody = document.getElementById('tagMappingTableBody');

  loading.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const [mappingsRes, odooTagsRes, wpCatsRes] = await Promise.all([
      fetch('/events/api/tag-mappings'),
      fetch('/events/api/odoo-tags'),
      fetch('/events/api/wp-event-categories')
    ]);

    if (!mappingsRes.ok || !odooTagsRes.ok || !wpCatsRes.ok) {
      throw new Error('Failed to load tag data');
    }

    const mappingsResponse = await mappingsRes.json();
    const odooTagsResponse = await odooTagsRes.json();
    const wpCatsResponse = await wpCatsRes.json();

    const mappings = mappingsResponse.data;
    const odooTags = odooTagsResponse.data;
    const wpCategories = wpCatsResponse.data;

    tbody.textContent = '';

    // Render existing mappings
    mappings.forEach(mapping => {
      const row = document.createElement('tr');
      
      const tdName = document.createElement('td');
      tdName.textContent = mapping.odoo_tag_name;
      row.appendChild(tdName);

      const tdCat = document.createElement('td');
      tdCat.textContent = mapping.wp_category_slug;
      row.appendChild(tdCat);

      const tdActions = document.createElement('td');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-xs btn-error btn-outline';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => deleteTagMapping(mapping.id);
      tdActions.appendChild(deleteBtn);
      row.appendChild(tdActions);

      tbody.appendChild(row);
    });

    // Populate form selects
    const odooTagSelect = document.getElementById('odooTagSelect');
    const wpCategorySelect = document.getElementById('wpCategorySelect');
    
    // Clear and populate Odoo tag select
    odooTagSelect.innerHTML = '<option value="">Select Odoo Tag...</option>';
    const mappedOdooIds = new Set(mappings.map(m => m.odoo_tag_id));
    odooTags.forEach(tag => {
      if (mappedOdooIds.has(tag.id)) return; // Skip already mapped tags
      const option = document.createElement('option');
      option.value = tag.id;
      option.textContent = tag.x_name;
      odooTagSelect.appendChild(option);
    });

    // Clear and populate WP category select
    wpCategorySelect.innerHTML = '<option value="">Select WP Category...</option>';
    wpCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.dataset.slug = cat.slug;
      option.textContent = cat.name + ' (' + cat.count + ')';
      wpCategorySelect.appendChild(option);
    });

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    console.error('Tag mapping load error:', error);
    alert('⚠️  Failed to load tag mappings');
    loading.classList.add('hidden');
  }
}

async function addTagMapping() {
  const select = document.getElementById('odooTagSelect');
  const catSelect = document.getElementById('wpCategorySelect');

  const odooTagId = parseInt(select.value);
  const wpCategoryId = parseInt(catSelect.value);

  if (!odooTagId || !wpCategoryId) {
    alert('⚠️  Select both an Odoo tag and a WP category');
    return;
  }

  const odooTagName = select.options[select.selectedIndex].textContent;
  const wpCategorySlug = catSelect.options[catSelect.selectedIndex].dataset.slug;

  try {
    const res = await fetch('/events/api/tag-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        odoo_tag_id: odooTagId,
        odoo_tag_name: odooTagName,
        wp_category_id: wpCategoryId,
        wp_category_slug: wpCategorySlug
      })
    });

    if (!res.ok) throw new Error(await res.text());

    alert('✅ Tag → Category mapping created');
    loadTagMappings();
  } catch (error) {
    console.error('Tag mapping create error:', error);
    alert('❌ Failed to create mapping: ' + error.message);
  }
}

async function deleteTagMapping(id) {
  if (!confirm('Delete this tag mapping?')) return;

  try {
    const res = await fetch('/events/api/tag-mappings/' + id, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error(await res.text());

    alert('✅ Tag mapping deleted');
    loadTagMappings();
  } catch (error) {
    console.error('Tag mapping delete error:', error);
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
