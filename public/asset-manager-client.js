/**
 * Asset Manager — Client JS
 *
 * Draait in de browser. Geen server-side code hier.
 *
 * Regels (conform architectuur):
 *  - Geen template literals voor HTML-generatie
 *  - DOM-manipulatie via document.createElement + element.textContent
 *  - Strings van de server worden NOOIT als innerHTML ingezet zonder sanitatie
 *  - DaisyUI klassen gezet via element.classList.add(...)
 *  - Geen inline backtick HTML strings
 */

(function AssetManagerClient() {
  'use strict';

  // ─── State ─────────────────────────────────────────────────────────────────

  var state = window.__ASSET_STATE__ || { userRole: 'user', userId: '', canUpload: false, canAdmin: false };
  var activePrefix = '';
  var activeCursor = null;
  var pendingDeleteKey = null;
  var pendingRenameKey = null;

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
    tdActions.className = 'flex gap-1';

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

    var url = '/assets/api/assets/list?limit=50';
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
        renderList(data.objects);
        renderBreadcrumb(prefix);

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
    loadList(prefix, null);
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  function uploadFile(file, prefix) {
    uploadProgress.style.display = '';
    uploadConfirmBtn.disabled = true;

    var formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', prefix || 'uploads/');

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

  // ─── Event listeners ──────────────────────────────────────────────────────

  function bindEvents() {
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
