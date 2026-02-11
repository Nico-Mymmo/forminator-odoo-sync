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
  } else if (state === 'out_of_sync') {
    const republishBtn = createActionButton('refresh-cw', 'Re-publish', 'btn-warning', () => {
      if (typeof publishWebinar === 'function') publishWebinar(webinar.id, republishBtn);
    });
    actions.appendChild(republishBtn);
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
