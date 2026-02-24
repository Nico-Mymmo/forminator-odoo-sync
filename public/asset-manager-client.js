/**
 * Asset Manager — Client JS
 *
 * Draait uitsluitend in de browser. Geen server-side code.
 *
 * Architectuurregels:
 *  - Geen template literals voor HTML-generatie
 *  - DOM-manipulatie via document.createElement + element.textContent
 *  - Gebruikers-input NOOIT via innerHTML
 *  - Lucide icon SVG strings (bibliotheekcode) wél via innerHTML toegestaan
 *  - DaisyUI klassen via classList
 *  - IIFE om global scope niet te vervuilen
 *
 * @version 3.0.0 — Redesign: categorie-sidebar, grid/list view, kebab acties, preview modal
 */

(function AssetManagerClient() {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════

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

  // ── DOM refs ──────────────────────────────────────────────

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

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return iso; }
  }

  function basename(key) {
    return key.split('/').pop() || key;
  }

  function showAlert(message, type) {
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
    alertBox.style.display = 'none';
  }

  function setLoading(on) {
    listLoading.style.display = on ? '' : 'none';
    if (on) { listEmpty.style.display = 'none'; }
  }

  function isOwnKey(key) {
    return key.startsWith('users/' + state.userId + '/');
  }

  function isImageMime(mime) {
    return mime && mime.indexOf('image/') === 0;
  }

  // ══════════════════════════════════════════════════════════
  // CATEGORIEËN
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // SORT
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // VIEW TOGGLE + RENDERING
  // ══════════════════════════════════════════════════════════

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
      listEmpty.style.removeProperty('display');
      gridView.textContent = '';
      listBody.textContent = '';
      return;
    }
    listEmpty.style.display = 'none';
    if (viewMode === 'grid') {
      renderGrid(objects);
    } else {
      renderTableList(objects);
    }
  }

  // ── SVG icon strings (Lucide-stijl, inline toegestaan) ────

  var SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var SVG_DOTS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
  var SVG_FILE_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-40"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  // ─── Grid view ─────────────────────────────────────────────

  function renderGrid(objects) {
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

  // ─── List view ─────────────────────────────────────────────

  function renderTableList(objects) {
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

  // ══════════════════════════════════════════════════════════
  // KEBAB MENU
  // ══════════════════════════════════════════════════════════

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
    addItem('URL kopiëren', function() { copyUrl(obj.key); });

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

  // ══════════════════════════════════════════════════════════
  // PREVIEW MODAL
  // ══════════════════════════════════════════════════════════

  function openPreviewModal(obj) {
    if (!previewModal) return;
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
    metaEl.textContent = [mime || '—', formatBytes(obj.size), obj.uploaded ? formatDate(obj.uploaded) : '']
      .filter(Boolean).join(' · ');
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

  // ══════════════════════════════════════════════════════════
  // DATA LADEN
  // ══════════════════════════════════════════════════════════

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
          pagination.style.removeProperty('display');
          paginationInfo.textContent = allObjects.length + ' geladen — meer beschikbaar';
        } else {
          activeCursor = null;
          pagination.style.setProperty('display', 'none', 'important');
          paginationInfo.textContent = allObjects.length + ' bestand' +
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

  // ─── Filter (client-side zoeken) ──────────────────────────

  function filterList(query) {
    var q = query.toLowerCase();
    gridView.querySelectorAll('[data-key]').forEach(function(el) {
      el.style.display = (!q || el.dataset.key.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
    listBody.querySelectorAll('tr[data-key]').forEach(function(tr) {
      tr.style.display = (!q || tr.dataset.key.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // ══════════════════════════════════════════════════════════
  // UPLOAD
  // ══════════════════════════════════════════════════════════

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
        showAlert('Geüpload: ' + basename(json.data.key), 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) {
        uploadProgress.style.display = 'none';
        uploadConfirmBtn.disabled = false;
        showAlert('Upload fout: ' + err.message, 'error');
      });
  }

  // ══════════════════════════════════════════════════════════
  // DELETE
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // RENAME
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // MOVE
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // URL KOPIËREN
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════

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


(function AssetManagerClient() {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════════════════

  var state       = window.__ASSET_STATE__ || { userRole: 'user', userId: '', canUpload: false, canAdmin: false };
  var activePrefix = '';
  var activeCursor = null;
  var pendingDeleteKey = null;
  var pendingRenameKey = null;
  var pendingMoveKey   = null;
  var sortField        = 'name';   // 'name' | 'size' | 'date'
  var sortAsc          = true;
  var allObjects       = [];       // cache voor client-side sortering

  // ─── DOM refs ──────────────────────────────────────────────────────────────

  var listBody       = document.getElementById('asset-list-body');
  var listEmpty      = document.getElementById('asset-list-empty');
  var listLoading    = document.getElementById('asset-list-loading');
  var alertBox       = document.getElementById('asset-alert');
  var searchInput    = document.getElementById('asset-search');
  var pagination     = document.getElementById('asset-pagination');
  var paginationInfo = document.getElementById('asset-pagination-info');
  var nextBtn        = document.getElementById('asset-next-btn');
  var uploadBtn      = document.getElementById('asset-upload-btn');
  var uploadModal    = document.getElementById('asset-upload-modal');
  var uploadFileInput   = document.getElementById('upload-file-input');
  var uploadPrefixInput = document.getElementById('upload-prefix-input');
  var uploadProgress    = document.getElementById('upload-progress');
  var uploadConfirmBtn  = document.getElementById('upload-confirm-btn');
  var deleteModal       = document.getElementById('asset-delete-modal');
  var deleteFilename    = document.getElementById('delete-modal-filename');
  var deleteConfirmBtn  = document.getElementById('delete-confirm-btn');
  var renameModal       = document.getElementById('asset-rename-modal');
  var renameNewKeyInput = document.getElementById('rename-newkey-input');
  var renameConfirmBtn  = document.getElementById('rename-confirm-btn');
  var moveModal         = document.getElementById('asset-move-modal');
  var moveFilename      = document.getElementById('move-modal-filename');
  var movePrefixInput   = document.getElementById('move-prefix-input');
  var moveConfirmBtn    = document.getElementById('move-confirm-btn');
  var folderTree        = document.getElementById('folder-tree');
  var folderRootLink    = document.getElementById('folder-root-link');
  var previewPane       = document.getElementById('preview-pane');
  var previewContent    = document.getElementById('preview-content');
  var previewCloseBtn   = document.getElementById('preview-close-btn');
  var previewModal      = document.getElementById('preview-modal');
  var previewModalTitle = document.getElementById('preview-modal-title');
  var previewModalContent = document.getElementById('preview-modal-content');
  var assetCount        = document.getElementById('asset-count');
  var sortNameBtn       = document.getElementById('sort-name-btn');
  var sortSizeBtn       = document.getElementById('sort-size-btn');
  var sortDateBtn       = document.getElementById('sort-date-btn');
  var uploadOverwriteInput = document.getElementById('upload-overwrite-input');

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return iso;
    }
  }

  function basename(key) {
    return key.split('/').pop() || key;
  }

  function showAlert(message, type) {
    // type: 'success' | 'error' | 'info' | 'warning'
    alertBox.style.display = '';
    alertBox.className = 'mb-3 alert alert-' + (type || 'info');
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
    alertBox.style.display = 'none';
  }

  function setLoading(on) {
    listLoading.style.display = on ? '' : 'none';
    if (on) {
      listEmpty.style.display = 'none';
    }
  }

  // ─── Breadcrumb ───────────────────────────────────────────────────────────

  function renderBreadcrumb(prefix) {
    var ul = document.querySelector('#asset-breadcrumb ul');
    ul.textContent = '';

    // Root
    var rootLi = document.createElement('li');
    var rootA  = document.createElement('a');
    rootA.href = '#';
    rootA.textContent = '/';
    rootA.addEventListener('click', function(e) {
      e.preventDefault();
      switchFolder('');
    });
    rootLi.appendChild(rootA);
    ul.appendChild(rootLi);

    if (!prefix) return;

    // Bouw segmenten: 'uploads/banners/' → ['uploads', 'banners']
    var parts = prefix.replace(/\/$/, '').split('/');
    var cumulative = '';
    parts.forEach(function(part) {
      cumulative = cumulative ? cumulative + '/' + part : part;
      var captured = cumulative + '/';
      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href = '#';
      a.textContent = part;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        switchFolder(captured);
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  // ─── Bestandslijst ────────────────────────────────────────────────────────

  function renderFileRow(obj) {
    var tr = document.createElement('tr');

    // Naam cel
    var tdName = document.createElement('td');
    var nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium';
    nameSpan.textContent = basename(obj.key);
    tdName.appendChild(nameSpan);

    // Is het een "map" (key eindigt met /) — niet van toepassing voor R2 list, maar voor prefix-entries
    tr.dataset.key = obj.key;

    // Type cel
    var tdType = document.createElement('td');
    var typeBadge = document.createElement('span');
    typeBadge.className = 'badge badge-ghost badge-sm';
    var mime = obj.contentType || '—';
    typeBadge.textContent = mime.split('/')[1] || mime;
    tdType.appendChild(typeBadge);

    // Grootte cel
    var tdSize = document.createElement('td');
    tdSize.textContent = formatBytes(obj.size);
    tdSize.className = 'text-sm text-base-content/70';

    // Datum cel
    var tdDate = document.createElement('td');
    tdDate.textContent = formatDate(obj.uploaded);
    tdDate.className = 'text-sm text-base-content/70';

    // Acties cel
    var tdActions = document.createElement('td');
    tdActions.className = 'flex gap-1 justify-end';

    // Selecteer rij voor preview
    tr.className = 'cursor-pointer hover:bg-base-200';
    tr.addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON') return; // acties niet triggeren
      selectFile(obj);
    });

    // Kopieer-URL knop
    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-ghost btn-xs';
    copyBtn.title = 'Kopieer URL';
    copyBtn.textContent = 'URL';
    copyBtn.addEventListener('click', function() {
      copyUrl(obj.key);
    });
    tdActions.appendChild(copyBtn);

    // Verwijder knop (eigen prefix of admin)
    if (state.canAdmin || isOwnKey(obj.key)) {
      var delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost btn-xs text-error';
      delBtn.title = 'Verwijderen';
      delBtn.textContent = 'Verwijder';
      delBtn.addEventListener('click', function() {
        openDeleteModal(obj.key);
      });
      tdActions.appendChild(delBtn);
    }

    // Rename knop (admin only)
    if (state.canAdmin) {
      var renBtn = document.createElement('button');
      renBtn.className = 'btn btn-ghost btn-xs';
      renBtn.title = 'Hernoemen';
      renBtn.textContent = 'Hernoem';
      renBtn.addEventListener('click', function() {
        openRenameModal(obj.key);
      });
      tdActions.appendChild(renBtn);
    }

    // Move knop (admin only)
    if (state.canAdmin) {
      var moveBtn = document.createElement('button');
      moveBtn.className = 'btn btn-ghost btn-xs';
      moveBtn.title = 'Verplaatsen';
      moveBtn.textContent = 'Verplaats';
      moveBtn.addEventListener('click', function() {
        openMoveModal(obj.key);
      });
      tdActions.appendChild(moveBtn);
    }

    tr.appendChild(tdName);
    tr.appendChild(tdType);
    tr.appendChild(tdSize);
    tr.appendChild(tdDate);
    tr.appendChild(tdActions);

    return tr;
  }

  function isOwnKey(key) {
    return key.startsWith('users/' + state.userId + '/');
  }

  function renderList(objects) {
    listBody.textContent = '';

    if (!objects || objects.length === 0) {
      listEmpty.style.display = '';
      return;
    }

    listEmpty.style.display = 'none';
    objects.forEach(function(obj) {
      listBody.appendChild(renderFileRow(obj));
    });
  }

  // ─── Data laden ───────────────────────────────────────────────────────────

  function loadList(prefix, cursor) {
    setLoading(true);
    hideAlert();

    var url = '/assets/api/assets/list?limit=100';
    if (prefix)  url += '&prefix=' + encodeURIComponent(prefix);
    if (cursor)  url += '&cursor=' + encodeURIComponent(cursor);

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
        buildFolderTree(allObjects);
        var sorted = sortObjects(allObjects);
        renderList(sorted);
        renderBreadcrumb(prefix);
        applySortIcons();
        if (assetCount) assetCount.textContent = allObjects.length + ' bestand' + (allObjects.length !== 1 ? 'en' : '');
        hidePreview();

        // Paginering
        if (data.truncated && data.cursor) {
          activeCursor = data.cursor;
          pagination.style.removeProperty('display');
          paginationInfo.textContent = data.objects.length + ' geladen — meer beschikbaar';
        } else {
          activeCursor = null;
          pagination.style.setProperty('display', 'none', 'important');
          if (data.objects.length > 0) {
            paginationInfo.textContent = data.objects.length + ' bestanden';
          }
        }
      })
      .catch(function(err) {
        setLoading(false);
        showAlert('Netwerk fout: ' + err.message, 'error');
      });
  }

  function switchFolder(prefix) {
    activePrefix = prefix;
    activeCursor = null;
    // Markeer actieve map in folder tree
    if (folderRootLink) {
      folderRootLink.classList.toggle('active', prefix === '');
    }
    if (folderTree) {
      var allLinks = folderTree.querySelectorAll('a[data-prefix]');
      allLinks.forEach(function(a) {
        a.classList.toggle('active', a.dataset.prefix === prefix);
      });
    }
    loadList(prefix, null);
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  function uploadFile(file, prefix) {
    uploadProgress.style.display = '';
    uploadConfirmBtn.disabled = true;

    var formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', prefix || 'uploads/');
    var overwrite = uploadOverwriteInput && uploadOverwriteInput.checked ? 'true' : 'false';
    formData.append('overwrite', overwrite);

    fetch('/assets/api/assets/upload', {
      method: 'POST',
      body: formData,
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        uploadProgress.style.display = 'none';
        uploadConfirmBtn.disabled = false;
        if (uploadModal.close) uploadModal.close();

        if (!json.success) {
          showAlert(json.error || 'Upload mislukt.', 'error');
          return;
        }
        showAlert('Geüpload: ' + json.data.key, 'success');
        loadList(activePrefix, null);
      })
      .catch(function(err) {
        uploadProgress.style.display = 'none';
        uploadConfirmBtn.disabled = false;
        showAlert('Upload fout: ' + err.message, 'error');
      });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

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
        if (!json.success) {
          showAlert(json.error || 'Verwijderen mislukt.', 'error');
          return;
        }
        showAlert('Verwijderd: ' + key, 'success');
        loadList(activePrefix, null);
      })
      .catch(function(err) {
        showAlert('Verwijder fout: ' + err.message, 'error');
      });
  }

  // ─── Rename ───────────────────────────────────────────────────────────────

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
        if (!json.success) {
          showAlert(json.error || 'Hernoemen mislukt.', 'error');
          return;
        }
        showAlert('Hernoemd naar: ' + newKey, 'success');
        loadList(activePrefix, null);
      })
      .catch(function(err) {
        showAlert('Rename fout: ' + err.message, 'error');
      });
  }

  // ─── URL kopiëren ─────────────────────────────────────────────────────────

  function copyUrl(key) {
    var url = window.location.origin + '/assets/' + key;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        showAlert('URL gekopieerd: ' + url, 'success');
      }).catch(function() {
        showAlert('Kopiëren mislukt. URL: ' + url, 'warning');
      });
    } else {
      // Fallback voor oudere browsers
      showAlert('URL: ' + url, 'info');
    }
  }

  // ─── Zoeken (client-side, huidige pagina) ─────────────────────────────────

  function filterList(query) {
    var rows = listBody.querySelectorAll('tr');
    var q = query.toLowerCase();
    rows.forEach(function(tr) {
      var key = (tr.dataset.key || '').toLowerCase();
      tr.style.display = (!q || key.indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // ─── Folder tree ──────────────────────────────────────────────────────────

  function buildFolderTree(objects) {
    if (!folderTree) return;
    // Haal bestaande gegenereerde items weg (behoud root)
    var existing = folderTree.querySelectorAll('li[data-generated]');
    existing.forEach(function(li) { li.remove(); });

    // Verzamel unieke top-level prefixes uit de keys
    var prefixSet = {};
    objects.forEach(function(obj) {
      var parts = obj.key.split('/');
      if (parts.length > 1) {
        // Top-level mapnaam
        var top = parts[0] + '/';
        prefixSet[top] = prefixSet[top] || {};
        if (parts.length > 2) {
          var sub = parts[0] + '/' + parts[1] + '/';
          prefixSet[top][sub] = true;
        }
      }
    });

    Object.keys(prefixSet).sort().forEach(function(top) {
      var li = document.createElement('li');
      li.dataset.generated = '1';
      var a = document.createElement('a');
      a.href = '#';
      a.dataset.prefix = top;
      a.className = 'gap-2' + (activePrefix === top ? ' active' : '');
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = top.replace(/\/$/, '');
      a.appendChild(nameSpan);
      a.addEventListener('click', function(e) { e.preventDefault(); switchFolder(top); });
      li.appendChild(a);

      // Submappen
      var subs = Object.keys(prefixSet[top]).sort();
      if (subs.length > 0) {
        var subUl = document.createElement('ul');
        subs.forEach(function(sub) {
          var subLi = document.createElement('li');
          var subA = document.createElement('a');
          subA.href = '#';
          subA.dataset.prefix = sub;
          subA.className = 'gap-2 text-xs' + (activePrefix === sub ? ' active' : '');
          subA.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
          var subNameSpan = document.createElement('span');
          var subParts = sub.replace(/\/$/, '').split('/');
          subNameSpan.textContent = subParts[subParts.length - 1];
          subA.appendChild(subNameSpan);
          subA.addEventListener('click', function(e) { e.preventDefault(); switchFolder(sub); });
          subLi.appendChild(subA);
          subUl.appendChild(subLi);
        });
        li.appendChild(subUl);
      }

      folderTree.appendChild(li);
    });
  }

  // ─── Sortering ────────────────────────────────────────────────────────────

  function sortObjects(objects) {
    var arr = objects.slice();
    arr.sort(function(a, b) {
      var va, vb;
      if (sortField === 'size') {
        va = a.size || 0; vb = b.size || 0;
        return sortAsc ? va - vb : vb - va;
      } else if (sortField === 'date') {
        va = a.uploaded ? new Date(a.uploaded).getTime() : 0;
        vb = b.uploaded ? new Date(b.uploaded).getTime() : 0;
        return sortAsc ? va - vb : vb - va;
      } else {
        va = (a.key || '').toLowerCase();
        vb = (b.key || '').toLowerCase();
        return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (vb < va ? -1 : vb > va ? 1 : 0);
      }
    });
    return arr;
  }

  function setSort(field) {
    if (sortField === field) {
      sortAsc = !sortAsc;
    } else {
      sortField = field;
      sortAsc = true;
    }
    applySortIcons();
    renderList(sortObjects(allObjects));
    filterList(searchInput ? searchInput.value : '');
  }

  function applySortIcons() {
    var icons = { name: sortNameBtn, size: sortSizeBtn, date: sortDateBtn };
    var fields = ['name', 'size', 'date'];
    fields.forEach(function(f) {
      var btn = icons[f];
      if (!btn) return;
      var iconSpan = btn.querySelector('span');
      if (!iconSpan) return;
      if (sortField === f) {
        iconSpan.textContent = sortAsc ? ' ↑' : ' ↓';
      } else {
        iconSpan.textContent = '';
      }
    });
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  var selectedKey = null;

  function selectFile(obj) {
    selectedKey = obj.key;
    // Highlight rij
    if (listBody) {
      var rows = listBody.querySelectorAll('tr');
      rows.forEach(function(tr) {
        tr.classList.toggle('bg-primary/10', tr.dataset.key === obj.key);
      });
    }
    // Desktop: toon preview pane
    var isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
      showPreview(obj);
    } else {
      showPreviewModal(obj);
    }
  }

  function showPreview(obj) {
    if (!previewPane) return;
    previewPane.style.display = 'flex';
    renderPreviewCard(obj, previewContent);
  }

  function hidePreview() {
    selectedKey = null;
    if (previewPane) previewPane.style.display = 'none';
    if (previewContent) {
      previewContent.textContent = '';
      var placeholder = document.createElement('div');
      placeholder.className = 'flex flex-col items-center justify-center h-full text-base-content/30 gap-3';
      placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><span class="text-sm">Selecteer een bestand</span>';
      previewContent.appendChild(placeholder);
    }
  }

  function showPreviewModal(obj) {
    if (!previewModal) return;
    if (previewModalTitle) previewModalTitle.textContent = obj.key;
    if (previewModalContent) renderPreviewCard(obj, previewModalContent);
    if (previewModal.showModal) previewModal.showModal();
  }

  function isImageMime(mime) {
    return mime && (mime.indexOf('image/') === 0 || mime === 'image/svg+xml');
  }

  function renderPreviewCard(obj, container) {
    container.textContent = '';
    var mime = obj.contentType || '';
    var url  = window.location.origin + '/assets/' + obj.key;

    // Image preview
    if (isImageMime(mime)) {
      var imgWrap = document.createElement('div');
      imgWrap.className = 'flex items-center justify-center bg-base-200 rounded-lg mb-3 overflow-hidden';
      imgWrap.style.maxHeight = '220px';
      var img = document.createElement('img');
      img.src = url;
      img.alt = basename(obj.key);
      img.style.maxWidth = '100%';
      img.style.maxHeight = '220px';
      img.style.objectFit = 'contain';
      imgWrap.appendChild(img);
      container.appendChild(imgWrap);
    } else {
      // File icon placeholder
      var iconWrap = document.createElement('div');
      iconWrap.className = 'flex items-center justify-center bg-base-200 rounded-lg mb-3 py-8';
      iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="opacity-30"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      container.appendChild(iconWrap);
    }

    // Bestandsnaam
    var nameEl = document.createElement('p');
    nameEl.className = 'font-medium text-sm mb-1 break-all';
    nameEl.textContent = basename(obj.key);
    container.appendChild(nameEl);

    // Metadata
    var metaEl = document.createElement('p');
    metaEl.className = 'text-xs text-base-content/50 mb-3';
    metaEl.textContent = (mime || '—') + ' · ' + formatBytes(obj.size) + (obj.uploaded ? ' · ' + formatDate(obj.uploaded) : '');
    container.appendChild(metaEl);

    // URL kopiëren
    var urlLabel = document.createElement('div');
    urlLabel.className = 'label';
    var urlLabelSpan = document.createElement('span');
    urlLabelSpan.className = 'label-text text-xs';
    urlLabelSpan.textContent = 'URL';
    urlLabel.appendChild(urlLabelSpan);
    container.appendChild(urlLabel);

    var urlRow = document.createElement('div');
    urlRow.className = 'flex gap-1 mb-3';
    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.readOnly = true;
    urlInput.value = url;
    urlInput.className = 'input input-xs input-bordered flex-1 font-mono text-xs';
    var copyUrlBtn = document.createElement('button');
    copyUrlBtn.className = 'btn btn-xs btn-ghost';
    copyUrlBtn.textContent = 'Kopieer';
    copyUrlBtn.addEventListener('click', function() { copyUrl(obj.key); });
    urlRow.appendChild(urlInput);
    urlRow.appendChild(copyUrlBtn);
    container.appendChild(urlRow);

    // Acties
    var actRow = document.createElement('div');
    actRow.className = 'flex flex-wrap gap-1';

    if (state.canAdmin || isOwnKey(obj.key)) {
      var del2Btn = document.createElement('button');
      del2Btn.className = 'btn btn-xs btn-error btn-outline';
      del2Btn.textContent = 'Verwijder';
      del2Btn.addEventListener('click', function() { openDeleteModal(obj.key); });
      actRow.appendChild(del2Btn);
    }
    if (state.canAdmin) {
      var ren2Btn = document.createElement('button');
      ren2Btn.className = 'btn btn-xs btn-outline';
      ren2Btn.textContent = 'Hernoem';
      ren2Btn.addEventListener('click', function() { openRenameModal(obj.key); });
      actRow.appendChild(ren2Btn);

      var mov2Btn = document.createElement('button');
      mov2Btn.className = 'btn btn-xs btn-outline';
      mov2Btn.textContent = 'Verplaats';
      mov2Btn.addEventListener('click', function() { openMoveModal(obj.key); });
      actRow.appendChild(mov2Btn);
    }
    container.appendChild(actRow);
  }

  // ─── Move ─────────────────────────────────────────────────────────────────

  function openMoveModal(key) {
    pendingMoveKey = key;
    if (moveFilename) moveFilename.textContent = key;
    if (movePrefixInput) movePrefixInput.value = activePrefix || 'uploads/';
    if (moveModal && moveModal.showModal) moveModal.showModal();
  }

  function confirmMove() {
    if (!pendingMoveKey) return;
    var key    = pendingMoveKey;
    var target = movePrefixInput ? movePrefixInput.value.trim() : '';
    pendingMoveKey = null;
    if (moveModal && moveModal.close) moveModal.close();

    if (!target) return;

    fetch('/assets/api/assets/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, targetPrefix: target }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) {
          showAlert(json.error || 'Verplaatsen mislukt.', 'error');
          return;
        }
        showAlert('Verplaatst naar: ' + json.data.newKey, 'success');
        loadList(activePrefix, null);
      })
      .catch(function(err) {
        showAlert('Move fout: ' + err.message, 'error');
      });
  }

  // ─── Event listeners ──────────────────────────────────────────────────────

  function bindEvents() {
    // Folder root link
    if (folderRootLink) {
      folderRootLink.addEventListener('click', function(e) {
        e.preventDefault();
        switchFolder('');
      });
    }

    // Preview sluiten
    if (previewCloseBtn) {
      previewCloseBtn.addEventListener('click', hidePreview);
    }

    // Sortering
    if (sortNameBtn) sortNameBtn.addEventListener('click', function() { setSort('name'); });
    if (sortSizeBtn) sortSizeBtn.addEventListener('click', function() { setSort('size'); });
    if (sortDateBtn) sortDateBtn.addEventListener('click', function() { setSort('date'); });

    // Upload knop
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function() {
        uploadPrefixInput.value = activePrefix || 'uploads/';
        uploadFileInput.value = '';
        if (uploadModal.showModal) uploadModal.showModal();
      });
    }

    // Upload bevestigen
    if (uploadConfirmBtn) {
      uploadConfirmBtn.addEventListener('click', function() {
        var file   = uploadFileInput.files[0];
        var prefix = uploadPrefixInput.value.trim() || 'uploads/';
        if (!file) {
          showAlert('Selecteer een bestand.', 'warning');
          return;
        }
        uploadFile(file, prefix);
      });
    }

    // Delete bevestigen
    if (deleteConfirmBtn) {
      deleteConfirmBtn.addEventListener('click', confirmDelete);
    }

    // Rename bevestigen
    if (renameConfirmBtn) {
      renameConfirmBtn.addEventListener('click', confirmRename);
    }

    // Move bevestigen
    if (moveConfirmBtn) {
      moveConfirmBtn.addEventListener('click', confirmMove);
    }

    // Paginering
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (activeCursor) {
          loadList(activePrefix, activeCursor);
        }
      });
    }

    // Zoeken
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        filterList(searchInput.value);
      });
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    bindEvents();
    // Laad root-lijst bij start
    switchFolder('');
  }

  // Start na DOMContentLoaded (script staat onderaan body, dus al geladen)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
