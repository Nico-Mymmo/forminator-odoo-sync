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
 *  - DaisyUI klassen via classList.add
 *  - IIFE om global scope niet te vervuilen
 * @version 2.0.0 — 3-pane layout, folder tree, preview pane, sort, move
 */

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
