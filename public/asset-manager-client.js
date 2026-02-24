/**
 * Asset Manager â€” Client JS
 *
 * Draait uitsluitend in de browser. Geen server-side code.
 *
 * Architectuurregels:
 *  - Geen template literals voor HTML-generatie
 *  - DOM-manipulatie via document.createElement + element.textContent
 *  - Gebruikers-input NOOIT via innerHTML
 *  - Lucide icon SVG strings (bibliotheekcode) wÃ©l via innerHTML toegestaan
 *  - DaisyUI klassen via classList
 *  - IIFE om global scope niet te vervuilen
 *
 * @version 3.0.0 â€” Redesign: categorie-sidebar, grid/list view, kebab acties, preview modal
 */

(function AssetManagerClient() {
  'use strict';

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // STATE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  var state          = window.__ASSET_STATE__ || { userRole: 'user', userId: '', canUpload: false, canAdmin: false };
  var viewMode       = 'grid';    // 'grid' | 'list'
  var activeCategory = '';        // actief prefix
  var activeCursor   = null;
  var allObjects     = [];        // cache voor client-side sort/filter
  var sortField      = 'date';    // 'name' | 'size' | 'date'
  var sortAsc        = false;     // false = nieuwste eerst (default)
  var pendingDeleteKey = null;
  var pendingRenameKey = null;
  var pendingMoveKey   = null;

  // â”€â”€ DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  var gridView       = document.getElementById('asset-grid-view');
  var listView       = document.getElementById('asset-list-view');
  var listBody       = document.getElementById('asset-list-body');
  var listLoading    = document.getElementById('asset-list-loading');
  var listEmpty      = document.getElementById('asset-list-empty');
  var alertBox       = document.getElementById('asset-alert');
  var searchInput    = document.getElementById('asset-search');
  var assetCount     = document.getElementById('asset-count');
  var pagination     = document.getElementById('asset-pagination');
  var paginationInfo = document.getElementById('asset-pagination-info');
  var nextBtn        = document.getElementById('asset-next-btn');
  var uploadBtn      = document.getElementById('asset-upload-btn');
  var uploadModal    = document.getElementById('asset-upload-modal');
  var uploadFileInput      = document.getElementById('upload-file-input');
  var uploadCategorySelect = document.getElementById('upload-category-select');
  var uploadCustomWrap     = document.getElementById('upload-custom-wrap');
  var uploadPrefixInput    = document.getElementById('upload-prefix-input');
  var uploadOverwriteInput = document.getElementById('upload-overwrite-input');
  var uploadProgress       = document.getElementById('upload-progress');
  var uploadConfirmBtn     = document.getElementById('upload-confirm-btn');
  var deleteModal      = document.getElementById('asset-delete-modal');
  var deleteFilename   = document.getElementById('delete-modal-filename');
  var deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  var renameModal        = document.getElementById('asset-rename-modal');
  var renameNewKeyInput  = document.getElementById('rename-newkey-input');
  var renameConfirmBtn   = document.getElementById('rename-confirm-btn');
  var moveModal          = document.getElementById('asset-move-modal');
  var moveCategorySelect = document.getElementById('move-category-select');
  var moveCustomWrap     = document.getElementById('move-custom-wrap');
  var movePrefixInput    = document.getElementById('move-prefix-input');
  var moveConfirmBtn     = document.getElementById('move-confirm-btn');
  var moveFilename       = document.getElementById('move-modal-filename');
  var previewModal        = document.getElementById('preview-modal');
  var previewModalContent = document.getElementById('preview-modal-content');
  var viewGridBtn  = document.getElementById('view-grid-btn');
  var viewListBtn  = document.getElementById('view-list-btn');
  var sortSelect   = document.getElementById('sort-select');
  var categoryMenu = document.getElementById('category-menu');

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // HELPERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  }

  function formatDate(iso) {
    if (!iso) return 'â€”';
    try {
      return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return iso; }
  }

  function basename(key) {
    return key.split('/').pop() || key;
  }

  function showAlert(message, type) {
    if (!alertBox) return;
    alertBox.style.removeProperty('display');
    alertBox.className = 'mb-4 alert alert-' + (type || 'info');
    alertBox.textContent = '';
    var span = document.createElement('span');
    span.textContent = message;
    alertBox.appendChild(span);
    clearTimeout(alertBox._timer);
    if (type === 'success') {
      alertBox._timer = setTimeout(function() { alertBox.style.display = 'none'; }, 3000);
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  function setLoading(on) {
    if (listLoading) listLoading.style.display = on ? '' : 'none';
    if (on && listEmpty) listEmpty.style.display = 'none';
  }

  function isOwnKey(key) {
    return key.startsWith('users/' + state.userId + '/');
  }

  function isImageMime(mime) {
    return mime && mime.indexOf('image/') === 0;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CATEGORIEÃ‹N
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function setActiveCategory(prefix) {
    // Desktop sidebar
    if (categoryMenu) {
      categoryMenu.querySelectorAll('a[data-prefix]').forEach(function(a) {
        a.classList.toggle('active', a.dataset.prefix === prefix);
      });
    }
    // Mobile tabs
    document.querySelectorAll('.cat-tab').forEach(function(btn) {
      btn.className = 'btn btn-sm cat-tab ' +
        (btn.dataset.prefix === prefix ? 'btn-primary' : 'btn-ghost');
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SORT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function parseSortSelect() {
    if (!sortSelect) return;
    var val   = sortSelect.value || 'date-desc';
    var parts = val.split('-');
    sortField  = parts[0];
    sortAsc    = parts[parts.length - 1] === 'asc';
  }

  function sortObjects(objects) {
    var arr = objects.slice();
    arr.sort(function(a, b) {
      var va, vb;
      if (sortField === 'size') {
        va = a.size || 0; vb = b.size || 0;
        return sortAsc ? va - vb : vb - va;
      }
      if (sortField === 'date') {
        va = a.uploaded ? new Date(a.uploaded).getTime() : 0;
        vb = b.uploaded ? new Date(b.uploaded).getTime() : 0;
        return sortAsc ? va - vb : vb - va;
      }
      va = (a.key || '').toLowerCase();
      vb = (b.key || '').toLowerCase();
      return sortAsc
        ? (va < vb ? -1 : va > vb ? 1 : 0)
        : (vb < va ? -1 : vb > va ? 1 : 0);
    });
    return arr;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VIEW TOGGLE + RENDERING
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function setView(mode) {
    viewMode = mode;
    if (mode === 'grid') {
      gridView.style.removeProperty('display');
      listView.style.display = 'none';
      if (viewGridBtn) viewGridBtn.classList.add('btn-active');
      if (viewListBtn) viewListBtn.classList.remove('btn-active');
    } else {
      gridView.style.display = 'none';
      listView.style.removeProperty('display');
      if (viewGridBtn) viewGridBtn.classList.remove('btn-active');
      if (viewListBtn) viewListBtn.classList.add('btn-active');
    }
    renderView(sortObjects(allObjects));
    // Filter opnieuw toepassen
    if (searchInput && searchInput.value) filterList(searchInput.value);
  }

  function renderView(objects) {
    if (!objects || objects.length === 0) {
      setLoading(false);
      if (listEmpty) listEmpty.style.removeProperty('display');
      if (gridView) gridView.textContent = '';
      if (listBody) listBody.textContent = '';
      return;
    }
    if (listEmpty) listEmpty.style.display = 'none';
    if (viewMode === 'grid') {
      renderGrid(objects);
    } else {
      renderTableList(objects);
    }
  }

  // â”€â”€ SVG icon strings (Lucide-stijl, inline toegestaan) â”€â”€â”€â”€

  var SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var SVG_DOTS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
  var SVG_FILE_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-40"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  // â”€â”€â”€ Grid view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function renderGrid(objects) {
    if (!gridView) return;
    gridView.textContent = '';
    objects.forEach(function(obj) {
      gridView.appendChild(renderGridCard(obj));
    });
  }

  function renderGridCard(obj) {
    var card = document.createElement('div');
    card.className = 'card bg-base-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow';
    card.dataset.key = obj.key;

    // Thumbnail
    var thumb = document.createElement('div');
    thumb.className = 'aspect-square bg-base-200 flex items-center justify-center overflow-hidden cursor-pointer';
    thumb.title = 'Preview';
    thumb.addEventListener('click', function() { openPreviewModal(obj); });

    var mime = obj.contentType || '';
    if (isImageMime(mime)) {
      var img = document.createElement('img');
      img.src = window.location.origin + '/assets/' + obj.key;
      img.alt = basename(obj.key);
      img.loading = 'lazy';
      img.className = 'w-full h-full object-cover';
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = SVG_FILE;
    }
    card.appendChild(thumb);

    // Card body
    var body = document.createElement('div');
    body.className = 'p-3 pt-2';

    var row1 = document.createElement('div');
    row1.className = 'flex items-start gap-1 mb-1';

    var nameEl = document.createElement('p');
    nameEl.className = 'text-sm font-medium truncate flex-1 min-w-0';
    nameEl.title = obj.key;
    nameEl.textContent = basename(obj.key);
    row1.appendChild(nameEl);
    row1.appendChild(renderKebabMenu(obj, 'grid'));
    body.appendChild(row1);

    var row2 = document.createElement('div');
    row2.className = 'flex items-center gap-1';

    var badge = document.createElement('span');
    badge.className = 'badge badge-ghost badge-xs truncate max-w-[72px]';
    badge.textContent = ((mime.split('/')[1] || mime || '?')).slice(0, 10);
    row2.appendChild(badge);

    var sizeEl = document.createElement('span');
    sizeEl.className = 'text-xs text-base-content/40 ml-auto';
    sizeEl.textContent = formatBytes(obj.size);
    row2.appendChild(sizeEl);

    body.appendChild(row2);
    card.appendChild(body);
    return card;
  }

  // â”€â”€â”€ List view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function renderTableList(objects) {
    if (!listBody) return;
    listBody.textContent = '';
    objects.forEach(function(obj) {
      listBody.appendChild(renderListRow(obj));
    });
  }

  function renderListRow(obj) {
    var tr = document.createElement('tr');
    tr.dataset.key = obj.key;
    tr.className = 'cursor-pointer hover';
    tr.addEventListener('click', function(e) {
      if (e.target.closest('details')) return;
      openPreviewModal(obj);
    });

    // Thumbnail
    var tdThumb = document.createElement('td');
    tdThumb.className = 'w-10 pr-0';
    var mime = obj.contentType || '';
    if (isImageMime(mime)) {
      var img = document.createElement('img');
      img.src = window.location.origin + '/assets/' + obj.key;
      img.alt = '';
      img.loading = 'lazy';
      img.className = 'w-8 h-8 object-cover rounded';
      tdThumb.appendChild(img);
    } else {
      var iconBox = document.createElement('div');
      iconBox.className = 'w-8 h-8 rounded bg-base-200 flex items-center justify-center';
      iconBox.innerHTML = SVG_FILE_SM;
      tdThumb.appendChild(iconBox);
    }
    tr.appendChild(tdThumb);

    // Naam + pad
    var tdName = document.createElement('td');
    var nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium text-sm';
    nameSpan.textContent = basename(obj.key);
    tdName.appendChild(nameSpan);
    var prefix = obj.key.includes('/') ? obj.key.substring(0, obj.key.lastIndexOf('/') + 1) : '';
    if (prefix) {
      var pathSpan = document.createElement('span');
      pathSpan.className = 'text-xs text-base-content/40 block leading-tight';
      pathSpan.textContent = prefix;
      tdName.appendChild(pathSpan);
    }
    tr.appendChild(tdName);

    // Type
    var tdType = document.createElement('td');
    tdType.className = 'hidden sm:table-cell';
    var badge = document.createElement('span');
    badge.className = 'badge badge-ghost badge-sm';
    badge.textContent = mime.split('/')[1] || mime || '?';
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    // Grootte
    var tdSize = document.createElement('td');
    tdSize.className = 'hidden md:table-cell text-sm text-base-content/60';
    tdSize.textContent = formatBytes(obj.size);
    tr.appendChild(tdSize);

    // Datum
    var tdDate = document.createElement('td');
    tdDate.className = 'hidden lg:table-cell text-sm text-base-content/60';
    tdDate.textContent = formatDate(obj.uploaded);
    tr.appendChild(tdDate);

    // Acties
    var tdAct = document.createElement('td');
    tdAct.className = 'text-right';
    tdAct.appendChild(renderKebabMenu(obj, 'list'));
    tr.appendChild(tdAct);

    return tr;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // KEBAB MENU
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function renderKebabMenu(obj) {
    var details = document.createElement('details');
    details.className = 'dropdown dropdown-end';

    var summary = document.createElement('summary');
    summary.className = 'btn btn-ghost btn-xs btn-square';
    summary.style.listStyle = 'none';
    summary.innerHTML = SVG_DOTS;
    details.appendChild(summary);

    var ul = document.createElement('ul');
    ul.className = 'dropdown-content menu bg-base-100 rounded-box shadow-lg z-30 w-44 p-1 text-sm';

    function addItem(label, handler, cls) {
      var li = document.createElement('li');
      if (cls) li.className = cls;
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = label;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        details.removeAttribute('open');
        handler();
      });
      li.appendChild(a);
      ul.appendChild(li);
    }

    addItem('Preview', function() { openPreviewModal(obj); });
    addItem('URL kopiÃ«ren', function() { copyUrl(obj.key); });

    if (state.canAdmin) {
      addItem('Hernoemen', function() { openRenameModal(obj.key); });
      addItem('Verplaatsen', function() { openMoveModal(obj.key); });
    }

    if (state.canAdmin || isOwnKey(obj.key)) {
      var divLi = document.createElement('li');
      divLi.innerHTML = '<hr class="my-1 border-base-200" />';
      ul.appendChild(divLi);
      addItem('Verwijderen', function() { openDeleteModal(obj.key); }, 'text-error');
    }

    details.appendChild(ul);
    return details;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PREVIEW MODAL
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function openPreviewModal(obj) {
    if (!previewModal || !previewModalContent) return;
    previewModalContent.textContent = '';
    renderPreviewContent(obj, previewModalContent);
    if (previewModal.showModal) previewModal.showModal();
  }

  function renderPreviewContent(obj, container) {
    var mime = obj.contentType || '';
    var url  = window.location.origin + '/assets/' + obj.key;

    // Visuele preview
    if (isImageMime(mime)) {
      var imgWrap = document.createElement('div');
      imgWrap.className = 'rounded-xl overflow-hidden bg-base-200 mb-5 flex items-center justify-center';
      imgWrap.style.maxHeight = '360px';
      var img = document.createElement('img');
      img.src = url;
      img.alt = basename(obj.key);
      img.className = 'max-w-full max-h-[360px] object-contain';
      imgWrap.appendChild(img);
      container.appendChild(imgWrap);
    } else {
      var iconBox = document.createElement('div');
      iconBox.className = 'rounded-xl bg-base-200 flex items-center justify-center mb-5 py-10';
      iconBox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="opacity-20"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      container.appendChild(iconBox);
    }

    // Naam + meta
    var nameEl = document.createElement('h4');
    nameEl.className = 'font-semibold text-lg mb-1 break-all';
    nameEl.textContent = basename(obj.key);
    container.appendChild(nameEl);

    var metaEl = document.createElement('p');
    metaEl.className = 'text-sm text-base-content/50 mb-5';
    metaEl.textContent = [mime || 'â€”', formatBytes(obj.size), obj.uploaded ? formatDate(obj.uploaded) : '']
      .filter(Boolean).join(' Â· ');
    container.appendChild(metaEl);

    // URL rij
    var urlLabel = document.createElement('p');
    urlLabel.className = 'text-xs font-medium text-base-content/50 mb-1 uppercase tracking-wide';
    urlLabel.textContent = 'Publieke URL';
    container.appendChild(urlLabel);

    var urlRow = document.createElement('div');
    urlRow.className = 'flex gap-2 mb-5';

    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.readOnly = true;
    urlInput.value = url;
    urlInput.className = 'input input-bordered input-sm flex-1 font-mono text-xs min-w-0';
    urlRow.appendChild(urlInput);

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary btn-sm gap-1 shrink-0';
    copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var copyLabel = document.createElement('span');
    copyLabel.textContent = 'Kopieer';
    copyBtn.appendChild(copyLabel);
    copyBtn.addEventListener('click', function() { copyUrl(obj.key); });
    urlRow.appendChild(copyBtn);
    container.appendChild(urlRow);

    // Admin / eigen acties
    if (state.canAdmin || isOwnKey(obj.key)) {
      var actRow = document.createElement('div');
      actRow.className = 'flex flex-wrap gap-2';

      function makeActBtn(label, svgStr, handler, cls) {
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline gap-1 ' + (cls || '');
        btn.innerHTML = svgStr;
        var lbl = document.createElement('span');
        lbl.textContent = label;
        btn.appendChild(lbl);
        btn.addEventListener('click', function() {
          if (previewModal.close) previewModal.close();
          handler();
        });
        return btn;
      }

      if (state.canAdmin) {
        actRow.appendChild(makeActBtn('Hernoem',
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
          function() { openRenameModal(obj.key); }));
        actRow.appendChild(makeActBtn('Verplaats',
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
          function() { openMoveModal(obj.key); }));
      }
      actRow.appendChild(makeActBtn('Verwijder',
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
        function() { openDeleteModal(obj.key); }, 'btn-error'));

      container.appendChild(actRow);
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DATA LADEN
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function loadList(prefix, cursor) {
    setLoading(true);
    hideAlert();

    var url = '/assets/api/assets/list?limit=100';
    if (prefix) url += '&prefix=' + encodeURIComponent(prefix);
    if (cursor) url += '&cursor=' + encodeURIComponent(cursor);

    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(json) {
        setLoading(false);
        if (!json.success) {
          showAlert(json.error || 'Lijst ophalen mislukt.', 'error');
          return;
        }
        var data = json.data;
        allObjects = data.objects || [];
        parseSortSelect();
        renderView(sortObjects(allObjects));
        if (assetCount) {
          assetCount.textContent = allObjects.length + ' bestand' +
            (allObjects.length !== 1 ? 'en' : '');
        }
        if (data.truncated && data.cursor) {
          activeCursor = data.cursor;
          if (pagination) pagination.style.removeProperty('display');
          if (paginationInfo) paginationInfo.textContent = allObjects.length + ' geladen â€” meer beschikbaar';
        } else {
          activeCursor = null;
          if (pagination) pagination.style.setProperty('display', 'none', 'important');
          if (paginationInfo) paginationInfo.textContent = allObjects.length + ' bestand' +
            (allObjects.length !== 1 ? 'en' : '');
        }
        // Filter opnieuw toepassen
        if (searchInput && searchInput.value) filterList(searchInput.value);
      })
      .catch(function(err) {
        setLoading(false);
        showAlert('Netwerkfout: ' + err.message, 'error');
      });
  }

  function switchCategory(prefix) {
    activeCategory = prefix;
    activeCursor   = null;
    setActiveCategory(prefix);
    loadList(prefix, null);
  }

  // â”€â”€â”€ Filter (client-side zoeken) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function filterList(query) {
    var q = query.toLowerCase();
    gridView.querySelectorAll('[data-key]').forEach(function(el) {
      el.style.display = (!q || el.dataset.key.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
    listBody.querySelectorAll('tr[data-key]').forEach(function(tr) {
      tr.style.display = (!q || tr.dataset.key.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // UPLOAD
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function getUploadPrefix() {
    if (!uploadCategorySelect) return activeCategory || 'uploads/';
    var val = uploadCategorySelect.value;
    if (val === '_custom') {
      return (uploadPrefixInput ? uploadPrefixInput.value.trim() : '') || 'uploads/';
    }
    return val;
  }

  function uploadFile(file, prefix) {
    uploadProgress.style.removeProperty('display');
    uploadConfirmBtn.disabled = true;

    var formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', prefix || 'uploads/');
    formData.append('overwrite', uploadOverwriteInput && uploadOverwriteInput.checked ? 'true' : 'false');

    fetch('/assets/api/assets/upload', { method: 'POST', body: formData })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        uploadProgress.style.display = 'none';
        uploadConfirmBtn.disabled = false;
        if (uploadModal.close) uploadModal.close();
        if (!json.success) { showAlert(json.error || 'Upload mislukt.', 'error'); return; }
        showAlert('GeÃ¼pload: ' + basename(json.data.key), 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) {
        uploadProgress.style.display = 'none';
        uploadConfirmBtn.disabled = false;
        showAlert('Upload fout: ' + err.message, 'error');
      });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DELETE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function openDeleteModal(key) {
    pendingDeleteKey = key;
    deleteFilename.textContent = key;
    if (deleteModal.showModal) deleteModal.showModal();
  }

  function confirmDelete() {
    if (!pendingDeleteKey) return;
    var key = pendingDeleteKey;
    pendingDeleteKey = null;
    if (deleteModal.close) deleteModal.close();

    fetch('/assets/api/assets/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Verwijderen mislukt.', 'error'); return; }
        showAlert('Verwijderd.', 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENAME
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function openRenameModal(key) {
    pendingRenameKey = key;
    renameNewKeyInput.value = key;
    if (renameModal.showModal) renameModal.showModal();
  }

  function confirmRename() {
    if (!pendingRenameKey) return;
    var key    = pendingRenameKey;
    var newKey = renameNewKeyInput.value.trim();
    pendingRenameKey = null;
    if (renameModal.close) renameModal.close();
    if (!newKey || newKey === key) return;

    fetch('/assets/api/assets/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, newKey: newKey }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Hernoemen mislukt.', 'error'); return; }
        showAlert('Hernoemd naar: ' + newKey, 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MOVE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function getMovePrefix() {
    if (!moveCategorySelect) return activeCategory || 'uploads/';
    var val = moveCategorySelect.value;
    if (val === '_custom') {
      return (movePrefixInput ? movePrefixInput.value.trim() : '') || 'uploads/';
    }
    return val;
  }

  function openMoveModal(key) {
    pendingMoveKey = key;
    if (moveFilename) moveFilename.textContent = key;
    if (moveModal.showModal) moveModal.showModal();
  }

  function confirmMove() {
    if (!pendingMoveKey) return;
    var key    = pendingMoveKey;
    var target = getMovePrefix();
    pendingMoveKey = null;
    if (moveModal.close) moveModal.close();
    if (!target) return;

    fetch('/assets/api/assets/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, targetPrefix: target }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Verplaatsen mislukt.', 'error'); return; }
        showAlert('Verplaatst.', 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // URL KOPIÃ‹REN
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function copyUrl(key) {
    var url = window.location.origin + '/assets/' + key;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function() { showAlert('URL gekopieerd!', 'success'); })
        .catch(function() { showAlert('URL: ' + url, 'info'); });
    } else {
      showAlert('URL: ' + url, 'info');
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EVENT BINDINGS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function bindEvents() {
    // Categorie-menu desktop
    if (categoryMenu) {
      categoryMenu.querySelectorAll('a[data-prefix]').forEach(function(a) {
        a.addEventListener('click', function(e) {
          e.preventDefault();
          switchCategory(a.dataset.prefix);
        });
      });
    }

    // Categorie-tabs mobile
    document.querySelectorAll('.cat-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { switchCategory(btn.dataset.prefix); });
    });

    // View toggle
    if (viewGridBtn) viewGridBtn.addEventListener('click', function() { setView('grid'); });
    if (viewListBtn) viewListBtn.addEventListener('click', function() { setView('list'); });

    // Sort
    if (sortSelect) {
      sortSelect.addEventListener('change', function() {
        parseSortSelect();
        renderView(sortObjects(allObjects));
        if (searchInput && searchInput.value) filterList(searchInput.value);
      });
    }

    // Zoeken
    if (searchInput) {
      searchInput.addEventListener('input', function() { filterList(searchInput.value); });
    }

    // Upload knop
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function() {
        if (uploadFileInput) uploadFileInput.value = '';
        // Pre-selecteer huidige categorie
        if (uploadCategorySelect && activeCategory) {
          var opt = uploadCategorySelect.querySelector('option[value="' + activeCategory + '"]');
          if (opt) uploadCategorySelect.value = activeCategory;
        }
        if (uploadModal.showModal) uploadModal.showModal();
      });
    }

    // Upload categorie toggle
    if (uploadCategorySelect) {
      uploadCategorySelect.addEventListener('change', function() {
        if (uploadCustomWrap) {
          uploadCustomWrap.style.display =
            uploadCategorySelect.value === '_custom' ? '' : 'none';
        }
      });
    }

    // Upload bevestigen
    if (uploadConfirmBtn) {
      uploadConfirmBtn.addEventListener('click', function() {
        var files = uploadFileInput ? uploadFileInput.files : [];
        if (!files || files.length === 0) {
          showAlert('Selecteer een bestand.', 'warning');
          return;
        }
        var prefix = getUploadPrefix();
        Array.from(files).forEach(function(f) { uploadFile(f, prefix); });
      });
    }

    // Delete
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', confirmDelete);

    // Rename
    if (renameConfirmBtn) renameConfirmBtn.addEventListener('click', confirmRename);

    // Move categorie toggle
    if (moveCategorySelect) {
      moveCategorySelect.addEventListener('change', function() {
        if (moveCustomWrap) {
          moveCustomWrap.style.display =
            moveCategorySelect.value === '_custom' ? '' : 'none';
        }
      });
    }

    // Move
    if (moveConfirmBtn) moveConfirmBtn.addEventListener('click', confirmMove);

    // Paginering
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (activeCursor) loadList(activeCategory, activeCursor);
      });
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // INIT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function init() {
    // Lucide icons voor statische HTML-elementen renderen
    if (window.lucide) window.lucide.createIcons();

    bindEvents();

    // Default sort
    if (sortSelect) sortSelect.value = 'date-desc';
    parseSortSelect();

    // Start met 'Alles' categorie (lege prefix = alle bestanden)
    switchCategory('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
