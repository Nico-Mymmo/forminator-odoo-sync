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
