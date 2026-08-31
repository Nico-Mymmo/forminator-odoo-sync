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

  var state          = window.__ASSET_STATE__ || { userRole: 'user', userId: '', canUpload: false, canAdmin: false, assetBaseUrl: '' };
  // Vaste basis voor /assets/-URL's -- env.APP_BASE_URL server-side, met
  // window.location.origin als terugval. Zonder dit gebruikte de client altijd
  // het paginadomein, wat op operations.openvme.be (los doorverwijsdomein naar
  // deze Worker) niet naar de werkende R2-asset-route leidde.
  var assetBase      = state.assetBaseUrl || window.location.origin;
  var viewMode       = 'grid';    // 'grid' | 'list'
  var activeCategory = '';        // actief prefix (kan een submap zijn, bv. 'uploads/contracten/')
  var activeCursor   = null;
  var allObjects     = [];        // cache voor client-side sort/filter
  var allFolders     = [];        // submappen op het huidige prefix (uit GET .../list)
  var sortField      = 'date';    // 'name' | 'size' | 'date'
  var sortAsc        = false;     // false = nieuwste eerst (default)
  var pendingDeleteKey = null;
  var pendingRenameKey = null;
  var pendingMoveKey   = null;
  // null = nieuwe top-level categorie (sidebar), anders het prefix waarin de
  // submap aangemaakt wordt (zie openFolderModal/confirmCreateFolder).
  var pendingFolderParentPrefix = null;
  // Custom MIME-achtige key om te herkennen dat een drag een bestaand asset
  // is (i.p.v. bestanden vanaf het OS-bureaublad, die het 'Files' type dragen).
  var ASSET_DRAG_TYPE = 'application/x-asset-key';

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
  var addFolderBtn       = document.getElementById('add-folder-btn');
  var addFolderBtnMobile = document.getElementById('add-folder-btn-mobile');
  var newSubfolderBtn    = document.getElementById('asset-new-subfolder-btn');
  var brandControl       = document.getElementById('asset-brand-control');
  var brandSelect        = document.getElementById('asset-brand-select');
  var folderModal        = document.getElementById('asset-folder-modal');
  var folderModalTitle    = document.getElementById('folder-modal-title');
  var folderModalLocation = document.getElementById('folder-modal-location');
  var folderLabelInput   = document.getElementById('folder-label-input');
  var folderSlugPreview  = document.getElementById('folder-slug-preview');
  var folderModalError   = document.getElementById('folder-modal-error');
  var folderConfirmBtn   = document.getElementById('folder-confirm-btn');
  var breadcrumbWrap     = document.getElementById('asset-breadcrumb');
  var breadcrumbList     = document.getElementById('asset-breadcrumb-list');
  var contentSection     = document.getElementById('asset-content-section');

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
    if (!iso) return '\u2014';
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

  // Client-side benadering van de server-side canWritePrefix-check (routes.js) --
  // enkel om kebab-acties (brand instellen / map verwijderen) al dan niet te
  // tonen. De server controleert dit hoe dan ook opnieuw bij elke aanroep.
  function canManageFolder(prefix) {
    return state.canAdmin || state.canUpload || (prefix || '').indexOf('users/' + state.userId + '/') === 0;
  }

  var BRAND_LABELS = { openvme: 'OpenVME', syndicoach: 'Syndicoach' };

  function mimeFromKey(key) {
    var ext = (key.split('.').pop() || '').toLowerCase();
    var map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
                webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
                ico: 'image/x-icon', bmp: 'image/bmp',
                pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm' };
    return map[ext] || '';
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

  // Client-side voorvertoning van de slug -- de server bepaalt de
  // definitieve, gevalideerde prefix (zelfde regels, best-effort hier).
  function slugifyLabel(label) {
    return String(label || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // parentPrefix: undefined/null → nieuwe top-level categorie (sidebar, admin-only,
  // volledige page reload nodig zodat de nieuwe sidebar-link meekomt vanaf de server).
  // Een prefix-string → submap in de huidig geopende map (geen reload, gewoon herladen
  // van de lijst).
  function openFolderModal(parentPrefix) {
    if (!folderModal) return;
    pendingFolderParentPrefix = parentPrefix || null;
    if (folderLabelInput) folderLabelInput.value = '';
    if (folderSlugPreview) folderSlugPreview.textContent = '-';
    if (folderModalError) { folderModalError.style.display = 'none'; folderModalError.textContent = ''; }
    if (folderModalLocation) {
      if (pendingFolderParentPrefix) {
        folderModalLocation.textContent = 'in: ' + pendingFolderParentPrefix;
        folderModalLocation.style.removeProperty('display');
      } else {
        folderModalLocation.style.display = 'none';
      }
    }
    if (folderModal.showModal) folderModal.showModal();
    if (folderLabelInput) folderLabelInput.focus();
  }

  function confirmCreateFolder() {
    var label = folderLabelInput ? folderLabelInput.value.trim() : '';
    if (!label) {
      if (folderModalError) { folderModalError.textContent = 'Naam is verplicht.'; folderModalError.style.display = ''; }
      return;
    }
    if (folderConfirmBtn) folderConfirmBtn.disabled = true;

    var parentPrefix = pendingFolderParentPrefix;
    var payload = { label: label };
    if (parentPrefix) payload.parentPrefix = parentPrefix;

    fetch('/assets/api/assets/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (folderConfirmBtn) folderConfirmBtn.disabled = false;
        if (!json.success) {
          if (folderModalError) { folderModalError.textContent = json.error || 'Map aanmaken mislukt.'; folderModalError.style.display = ''; }
          return;
        }
        if (folderModal.close) folderModal.close();
        if (parentPrefix) {
          showAlert('Map "' + json.data.label + '" aangemaakt.', 'success');
          loadList(activeCategory, null);
        } else {
          showAlert('Map "' + json.data.label + '" aangemaakt. Pagina wordt herladen...', 'success');
          setTimeout(function() { window.location.reload(); }, 900);
        }
      })
      .catch(function(err) {
        if (folderConfirmBtn) folderConfirmBtn.disabled = false;
        if (folderModalError) { folderModalError.textContent = 'Netwerkfout: ' + err.message; folderModalError.style.display = ''; }
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
    if ((!objects || objects.length === 0) && allFolders.length === 0) {
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

  // â”€â”€â”€ Breadcrumb (submap-navigatie) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function renderBreadcrumb(prefix) {
    if (!breadcrumbWrap || !breadcrumbList) return;
    breadcrumbList.textContent = '';

    if (!prefix) {
      breadcrumbWrap.style.display = 'none';
      return;
    }
    breadcrumbWrap.style.removeProperty('display');

    var segments = prefix.replace(/\/$/, '').split('/');
    var pathSoFar = '';

    function addCrumb(label, targetPrefix, isLast, icon) {
      var li = document.createElement('li');
      if (isLast) {
        var span = document.createElement('span');
        span.className = 'font-medium inline-flex items-center gap-1';
        if (icon) span.innerHTML = icon;
        var textSpan = document.createElement('span');
        textSpan.textContent = label;
        span.appendChild(textSpan);
        li.appendChild(span);
      } else {
        var a = document.createElement('a');
        a.className = 'inline-flex items-center gap-1';
        a.href = '#';
        if (icon) a.innerHTML = icon;
        var textSpan2 = document.createElement('span');
        textSpan2.textContent = label;
        a.appendChild(textSpan2);
        a.dataset.prefix = targetPrefix;
        a.addEventListener('click', function(e) {
          e.preventDefault();
          switchCategory(targetPrefix);
        });
        li.appendChild(a);
      }
      breadcrumbList.appendChild(li);
    }

    addCrumb('Alles', '', false, SVG_HOME);
    segments.forEach(function(seg, idx) {
      pathSoFar += seg + '/';
      addCrumb(seg, pathSoFar, idx === segments.length - 1);
    });
  }

  // â”€â”€ SVG icon strings (Lucide-stijl, inline toegestaan) â”€â”€â”€â”€

  var SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var SVG_FOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-primary opacity-70"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
  var SVG_FOLDER_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-primary opacity-70"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
  var SVG_DOTS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
  var SVG_FILE_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-40"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var SVG_LINK    = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var SVG_HOME    = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>';

  // â”€â”€â”€ Grid view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function renderSectionLabel(text) {
    var el = document.createElement('div');
    el.className = 'col-span-full text-xs font-semibold text-base-content/40 uppercase tracking-wide mt-1 first:mt-0';
    el.textContent = text;
    return el;
  }

  function renderGrid(objects) {
    if (!gridView) return;
    gridView.textContent = '';
    var showLabels = allFolders.length > 0 && objects.length > 0;
    if (allFolders.length > 0) {
      if (showLabels) gridView.appendChild(renderSectionLabel('Mappen'));
      allFolders.forEach(function(folder) {
        gridView.appendChild(renderFolderCard(folder));
      });
    }
    if (objects.length > 0) {
      if (showLabels) gridView.appendChild(renderSectionLabel('Bestanden'));
      objects.forEach(function(obj) {
        gridView.appendChild(renderGridCard(obj));
      });
    }
  }

  function renderFolderCard(folder) {
    var card = document.createElement('div');
    card.className = 'card bg-primary/5 border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer';
    card.dataset.folderPrefix = folder.prefix;
    card.title = 'Open map';
    card.addEventListener('click', function(e) {
      if (e.target.closest('details')) return;
      switchCategory(folder.prefix);
    });
    bindFolderDropTarget(card, folder.prefix);

    var thumb = document.createElement('div');
    thumb.className = 'aspect-square flex items-center justify-center overflow-hidden rounded-t-[var(--rounded-box,1rem)]';
    thumb.innerHTML = SVG_FOLDER;
    card.appendChild(thumb);

    var body = document.createElement('div');
    body.className = 'p-3 pt-2';

    var row1 = document.createElement('div');
    row1.className = 'flex items-start gap-1 mb-1';
    var nameEl = document.createElement('p');
    nameEl.className = 'text-sm font-medium truncate flex-1 min-w-0';
    nameEl.title = folder.name;
    nameEl.textContent = folder.name;
    row1.appendChild(nameEl);
    row1.appendChild(renderFolderKebabMenu(folder));
    body.appendChild(row1);

    body.appendChild(renderBrandBadge(folder.brand));

    card.appendChild(body);
    return card;
  }

  function renderBrandBadge(brand) {
    var badge = document.createElement('span');
    badge.className = 'badge badge-ghost badge-xs gap-1 opacity-60';
    badge.innerHTML = SVG_LINK;
    var lbl = document.createElement('span');
    lbl.textContent = BRAND_LABELS[brand] || brand || '';
    badge.appendChild(lbl);
    return badge;
  }

  // â”€â”€â”€ Drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // Twee soorten drags landen op een map (folder-tile, breadcrumb, sidebar
  // categorie): een bestaand asset (intern, ASSET_DRAG_TYPE) -- verplaatst het
  // bestand -- of bestanden vanaf het OS-bureaublad ('Files') -- upload ze
  // rechtstreeks naar die map. bindFolderDropTarget bindt beide op eender welk
  // element dat een prefix als doel heeft.

  function bindAssetDragSource(el, key) {
    el.draggable = true;
    el.addEventListener('dragstart', function(e) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(ASSET_DRAG_TYPE, key);
      e.dataTransfer.setData('text/plain', key);
    });
  }

  function bindFolderDropTarget(el, targetPrefix) {
    el.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.types.indexOf('Files') !== -1 ? 'copy' : 'move';
      el.classList.add('ring', 'ring-primary', 'ring-2');
    });
    el.addEventListener('dragleave', function() {
      el.classList.remove('ring', 'ring-primary', 'ring-2');
    });
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('ring', 'ring-primary', 'ring-2');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFilesTo(e.dataTransfer.files, targetPrefix);
        return;
      }
      var key = e.dataTransfer.getData(ASSET_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
      if (key) moveAssetTo(key, targetPrefix);
    });
  }

  // Achtervang voor het hele content-paneel: bestanden vanaf het OS-bureaublad
  // ergens in de lege ruimte (niet op een specifieke map-tile) droppen upload
  // ze naar de huidig geopende map ("Alles" → 'uploads/' als redelijke default).
  // Folder-tiles roepen zelf stopPropagation() aan, dus deze handler vuurt
  // enkel als de drop niet al door een tile is opgevangen.
  function bindContentDropzone(el) {
    if (!el) return;
    el.addEventListener('dragover', function(e) {
      if (e.dataTransfer.types.indexOf('Files') === -1) return;
      e.preventDefault();
    });
    el.addEventListener('drop', function(e) {
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      if (!state.canUpload) return;
      var target = activeCategory || 'uploads/';
      uploadFilesTo(e.dataTransfer.files, target);
    });
  }

  function renderGridCard(obj) {
    var card = document.createElement('div');
    card.className = 'card bg-base-100 shadow-sm hover:shadow-md transition-shadow';
    card.dataset.key = obj.key;
    bindAssetDragSource(card, obj.key);

    // Thumbnail
    var thumb = document.createElement('div');
    thumb.className = 'aspect-square bg-base-200 flex items-center justify-center overflow-hidden cursor-pointer rounded-t-[var(--rounded-box,1rem)]';
    thumb.title = 'Preview';
    thumb.addEventListener('click', function() { openPreviewModal(obj); });

    var mime = obj.contentType || mimeFromKey(obj.key);
    if (isImageMime(mime)) {
      var img = document.createElement('img');
      img.src = assetBase + '/assets/' + obj.key;
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
    row1.appendChild(renderQuickCopyBtn(obj));
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

  function renderSectionLabelRow(text) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'text-xs font-semibold text-base-content/40 uppercase tracking-wide bg-base-200/40 py-1';
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  function renderTableList(objects) {
    if (!listBody) return;
    listBody.textContent = '';
    var showLabels = allFolders.length > 0 && objects.length > 0;
    if (allFolders.length > 0) {
      if (showLabels) listBody.appendChild(renderSectionLabelRow('Mappen'));
      allFolders.forEach(function(folder) {
        listBody.appendChild(renderFolderRow(folder));
      });
    }
    if (objects.length > 0) {
      if (showLabels) listBody.appendChild(renderSectionLabelRow('Bestanden'));
      objects.forEach(function(obj) {
        listBody.appendChild(renderListRow(obj));
      });
    }
  }

  function renderFolderRow(folder) {
    var tr = document.createElement('tr');
    tr.dataset.folderPrefix = folder.prefix;
    tr.className = 'cursor-pointer hover bg-primary/5';
    tr.addEventListener('click', function(e) {
      if (e.target.closest('details')) return;
      switchCategory(folder.prefix);
    });
    bindFolderDropTarget(tr, folder.prefix);

    var tdIcon = document.createElement('td');
    tdIcon.className = 'w-10 pr-0';
    var iconBox = document.createElement('div');
    iconBox.className = 'w-8 h-8 rounded bg-base-200 flex items-center justify-center';
    iconBox.innerHTML = SVG_FOLDER_SM;
    tdIcon.appendChild(iconBox);
    tr.appendChild(tdIcon);

    var tdName = document.createElement('td');
    tdName.colSpan = 4;
    var nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium text-sm mr-2';
    nameSpan.textContent = folder.name;
    tdName.appendChild(nameSpan);
    tdName.appendChild(renderBrandBadge(folder.brand));
    tr.appendChild(tdName);

    var tdAct = document.createElement('td');
    tdAct.className = 'text-right';
    tdAct.appendChild(renderFolderKebabMenu(folder));
    tr.appendChild(tdAct);

    return tr;
  }

  function renderListRow(obj) {
    var tr = document.createElement('tr');
    tr.dataset.key = obj.key;
    tr.className = 'cursor-pointer hover';
    bindAssetDragSource(tr, obj.key);
    tr.addEventListener('click', function(e) {
      if (e.target.closest('details')) return;
      openPreviewModal(obj);
    });

    // Thumbnail
    var tdThumb = document.createElement('td');
    tdThumb.className = 'w-10 pr-0';
    var mime = obj.contentType || mimeFromKey(obj.key);
    if (isImageMime(mime)) {
      var img = document.createElement('img');
      img.src = assetBase + '/assets/' + obj.key;
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
    tdAct.className = 'text-right whitespace-nowrap';
    tdAct.appendChild(renderQuickCopyBtn(obj));
    tdAct.appendChild(renderKebabMenu(obj, 'list'));
    tr.appendChild(tdAct);

    return tr;
  }

  // Rechtstreeks zichtbare kopieer-knop op elke kaart/rij, i.p.v. verstopt in
  // het kebab-menu -- de meest gebruikte actie op een asset-bibliotheek.
  function renderQuickCopyBtn(obj) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-xs btn-square';
    btn.title = 'Link kopiëren';
    btn.innerHTML = SVG_LINK;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      copyUrl(obj);
    });
    return btn;
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
    addItem('Link kopiëren', function() { copyUrl(obj); });

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

  // Zelfde dropdown-patroon als renderKebabMenu, maar voor een foldertegel:
  // link-domein instellen (openvme/syndicoach/overerven) en de map verwijderen
  // (enkel mogelijk als ze leeg is -- de server blokkeert dit anders, zie
  // POST /api/assets/delete-folder).
  // Generieke opbouw van een kebab-dropdown (⋮) uit een lijst item-definities:
  // { label, handler, cls } voor een klikbaar item, { divider: true } voor een
  // scheidingslijn, of { title: '...' } voor een niet-klikbare menu-titel.
  // Gedeeld door renderFolderKebabMenu (submap-tegel) en renderCategoryKebabMenu
  // (top-level categorie in de zijbalk) zodat de dropdown-mechaniek (details/
  // summary, sluiten na klik) niet dubbel onderhouden hoeft te worden.
  function buildActionsDropdown(itemDefs) {
    var details = document.createElement('details');
    details.className = 'dropdown dropdown-end';

    var summary = document.createElement('summary');
    summary.className = 'btn btn-ghost btn-xs btn-square';
    summary.style.listStyle = 'none';
    summary.innerHTML = SVG_DOTS;
    details.appendChild(summary);

    var ul = document.createElement('ul');
    ul.className = 'dropdown-content menu bg-base-100 rounded-box shadow-lg z-30 w-52 p-1 text-sm';

    itemDefs.forEach(function(def) {
      if (def.divider) {
        var divLi = document.createElement('li');
        divLi.innerHTML = '<hr class="my-1 border-base-200" />';
        ul.appendChild(divLi);
        return;
      }
      if (def.title) {
        var titleLi = document.createElement('li');
        titleLi.className = 'menu-title text-xs px-2 pt-1 pb-0';
        titleLi.textContent = def.title;
        ul.appendChild(titleLi);
        return;
      }
      var li = document.createElement('li');
      if (def.cls) li.className = def.cls;
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = def.label;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        details.removeAttribute('open');
        def.handler();
      });
      li.appendChild(a);
      ul.appendChild(li);
    });

    details.appendChild(ul);
    return details;
  }

  function brandMenuItems(prefix, currentBrand) {
    var items = [{ title: 'Link-domein' }];
    ['openvme', 'syndicoach'].forEach(function(brandKey) {
      items.push({
        label: (currentBrand === brandKey ? '✓ ' : '') + BRAND_LABELS[brandKey],
        handler: function() { setFolderBrand(prefix, brandKey); },
      });
    });
    items.push({ label: 'Overerven van bovenliggende map', handler: function() { setFolderBrand(prefix, null); } });
    return items;
  }

  function renderFolderKebabMenu(folder) {
    if (!canManageFolder(folder.prefix)) {
      // Niets te beheren voor deze gebruiker -- geen (lege) kebab tonen.
      return document.createElement('span');
    }
    var items = brandMenuItems(folder.prefix, folder.brand);
    items.push({ divider: true });
    items.push({ label: 'Verwijderen', cls: 'text-error', handler: function() { deleteFolder(folder.prefix, folder.name); } });
    return buildActionsDropdown(items);
  }

  // Kebab voor een top-level, door de gebruiker aangemaakte categorie (zijbalk/
  // mobiele tabs) -- enkel admins mogen die hernoemen/verwijderen (zelfde regel
  // als op de server, zie routes.js create/delete-folder/rename-category).
  function renderCategoryKebabMenu(prefix, label) {
    if (!state.canAdmin) return document.createElement('span');
    var items = [
      { label: 'Naam wijzigen', handler: function() { renameCategoryLabel(prefix, label); } },
    ];
    items = items.concat(brandMenuItems(prefix, null));
    items.push({ divider: true });
    items.push({ label: 'Verwijderen', cls: 'text-error', handler: function() { deleteFolder(prefix, label); } });
    return buildActionsDropdown(items);
  }

  function renameCategoryLabel(prefix, currentLabel) {
    var next = window.prompt('Nieuwe naam voor deze map:', currentLabel);
    if (next === null) return;
    next = next.trim();
    if (!next || next === currentLabel) return;

    fetch('/assets/api/assets/rename-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefix, label: next }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Naam wijzigen mislukt.', 'error'); return; }
        showAlert('Naam bijgewerkt. Pagina wordt herladen...', 'success');
        setTimeout(function() { window.location.reload(); }, 900);
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  function setFolderBrand(prefix, brand) {
    fetch('/assets/api/assets/set-folder-brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefix, brand: brand }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Link-domein instellen mislukt.', 'error'); return; }
        showAlert('Link-domein bijgewerkt.', 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  function deleteFolder(prefix, name) {
    if (!window.confirm('Map "' + name + '" verwijderen? Dit kan niet ongedaan gemaakt worden.')) return;
    // Een top-level categorie (één padsegment, bv. 'stap-1/') staat ook in de
    // zijbalk -- die moet opnieuw server-side opgebouwd worden, dus reload i.p.v.
    // enkel de huidige lijst te verversen (dat volstaat wel voor een submap).
    var isTopLevel = prefix.replace(/\/$/, '').indexOf('/') === -1;
    fetch('/assets/api/assets/delete-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefix }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Map verwijderen mislukt.', 'error'); return; }
        if (isTopLevel) {
          showAlert('Map verwijderd. Pagina wordt herladen...', 'success');
          setTimeout(function() { window.location.reload(); }, 900);
        } else {
          showAlert('Map verwijderd.', 'success');
          loadList(activeCategory, null);
        }
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
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
    var mime = obj.contentType || mimeFromKey(obj.key);
    var url  = assetBase + '/assets/' + obj.key;
    var publicLinkUrl = resolvePublicUrl(obj);

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
    metaEl.textContent = [mime || '\u2014', formatBytes(obj.size), obj.uploaded ? formatDate(obj.uploaded) : '']
      .filter(Boolean).join(' \u00B7 ');
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
    urlInput.value = publicLinkUrl;
    urlInput.className = 'input input-bordered input-sm flex-1 font-mono text-xs min-w-0';
    urlRow.appendChild(urlInput);

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary btn-sm gap-1 shrink-0';
    copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var copyLabel = document.createElement('span');
    copyLabel.textContent = 'Kopieer';
    copyBtn.appendChild(copyLabel);
    copyBtn.addEventListener('click', function() { copyUrl(obj); });
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
        allFolders = data.folders || [];
        // currentBrand(Explicit) zit enkel in de respons bij een concreet prefix
        // (niet bij "Alles") -- zie GET /api/assets/list in routes.js.
        if (brandControl) {
          if (prefix && 'currentBrand' in data && canManageFolder(prefix)) {
            brandControl.style.removeProperty('display');
            if (brandSelect) brandSelect.value = data.currentBrandExplicit || '';
          } else {
            brandControl.style.display = 'none';
          }
        }
        parseSortSelect();
        renderView(sortObjects(allObjects));
        if (assetCount) {
          var countText = allObjects.length + ' bestand' + (allObjects.length !== 1 ? 'en' : '');
          if (allFolders.length > 0) {
            countText += ' · ' + allFolders.length + ' map' + (allFolders.length !== 1 ? 'pen' : '');
          }
          assetCount.textContent = countText;
        }
        if (data.truncated && data.cursor) {
          activeCursor = data.cursor;
          if (pagination) pagination.style.removeProperty('display');
          if (paginationInfo) paginationInfo.textContent = allObjects.length + ' geladen \u2014 meer beschikbaar';
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
    renderBreadcrumb(prefix);
    // "Nieuwe map hier" heeft geen zin op "Alles" (geen eenduidig prefix) --
    // de server toetst schrijfrechten sowieso opnieuw bij het aanmaken zelf.
    if (newSubfolderBtn) newSubfolderBtn.style.display = prefix ? '' : 'none';
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
    gridView.querySelectorAll('[data-folder-prefix]').forEach(function(el) {
      el.style.display = (!q || el.dataset.folderPrefix.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
    listBody.querySelectorAll('tr[data-folder-prefix]').forEach(function(tr) {
      tr.style.display = (!q || tr.dataset.folderPrefix.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
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

  // Drag & drop van OS-bestanden op een map (folder-tile of huidige map):
  // upload elk bestand rechtstreeks naar dat prefix, zonder de upload-modal
  // te tonen. Overschrijven staat hier altijd uit (geen checkbox beschikbaar) --
  // een conflict geeft gewoon de bestaande 409-foutmelding via uploadFile.
  function uploadFilesTo(fileList, prefix) {
    var files = Array.prototype.slice.call(fileList);
    if (files.length === 0) return;
    files.forEach(function(f) { uploadFile(f, prefix); });
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
    moveAssetTo(key, target);
  }

  // Herbruikt door zowel de "Verplaatsen"-modal als drag & drop van een asset
  // op een map (folder-tile, breadcrumb-segment, sidebar-categorie).
  function moveAssetTo(key, targetPrefix) {
    if (!key || !targetPrefix) return;
    fetch('/assets/api/assets/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, targetPrefix: targetPrefix }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Verplaatsen mislukt.', 'error'); return; }
        showAlert('Verplaatst naar ' + targetPrefix, 'success');
        loadList(activeCategory, null);
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // URL KOPIÃ‹REN
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // objOrKey: het volledige object (met .publicUrl, het brand-domein zoals
  // link.openvme.be/link.syndicoach.be) of, voor terugwaartse compatibiliteit,
  // enkel de key als string -- dan wordt het object opgezocht in de huidige
  // cache om alsnog de publicUrl te pakken te krijgen. Zonder publicUrl (bv.
  // nog niet geladen) valt het terug op de interne assetBase-URL.
  function resolvePublicUrl(objOrKey) {
    var obj = typeof objOrKey === 'string'
      ? allObjects.filter(function(o) { return o.key === objOrKey; })[0]
      : objOrKey;
    if (obj && obj.publicUrl) return obj.publicUrl;
    var key = obj ? obj.key : objOrKey;
    return assetBase + '/assets/' + key;
  }

  function copyUrl(objOrKey) {
    var url = resolvePublicUrl(objOrKey);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function() { showAlert('Link gekopieerd!', 'success'); })
        .catch(function() { showAlert('URL: ' + url, 'info'); });
    } else {
      showAlert('URL: ' + url, 'info');
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EVENT BINDINGS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function bindEvents() {
    // Categorie-menu desktop -- ook drop-doel zodat een asset er rechtstreeks
    // op gesleept kan worden om naar die top-level categorie te verplaatsen.
    if (categoryMenu) {
      categoryMenu.querySelectorAll('a[data-prefix]').forEach(function(a) {
        a.addEventListener('click', function(e) {
          e.preventDefault();
          switchCategory(a.dataset.prefix);
        });
        if (a.dataset.prefix) bindFolderDropTarget(a, a.dataset.prefix);
      });
    }

    // Categorie-tabs mobile
    document.querySelectorAll('.cat-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { switchCategory(btn.dataset.prefix); });
      if (btn.dataset.prefix) bindFolderDropTarget(btn, btn.dataset.prefix);
    });

    // Kebab (naam wijzigen / link-domein / verwijderen) op elke door de
    // gebruiker aangemaakte top-level categorie -- de 5 hardcoded categorieën
    // krijgen server-side bewust geen placeholder (zie ui.js), dus hier is
    // niets te doen voor die.
    document.querySelectorAll('.dynamic-cat-actions').forEach(function(el) {
      el.appendChild(renderCategoryKebabMenu(el.dataset.prefix, el.dataset.label));
    });

    // Nieuwe map hier (submap in de huidig geopende map)
    if (newSubfolderBtn) {
      newSubfolderBtn.addEventListener('click', function() {
        if (activeCategory) openFolderModal(activeCategory);
      });
    }

    // Link-domein van de huidig geopende map
    if (brandSelect) {
      brandSelect.addEventListener('change', function() {
        if (activeCategory) setFolderBrand(activeCategory, brandSelect.value || null);
      });
    }

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
        // Pre-selecteer huidige categorie/submap. Een submap heeft geen eigen
        // <option> in de select -- val dan terug op "Aangepast pad" met het
        // huidige prefix al ingevuld, zodat uploaden in een geopende submap
        // niet per ongeluk naar de top-level categorie gaat.
        if (uploadCategorySelect && activeCategory) {
          var opt = uploadCategorySelect.querySelector('option[value="' + activeCategory + '"]');
          if (opt) {
            uploadCategorySelect.value = activeCategory;
            if (uploadCustomWrap) uploadCustomWrap.style.display = 'none';
          } else {
            uploadCategorySelect.value = '_custom';
            if (uploadCustomWrap) uploadCustomWrap.style.removeProperty('display');
            if (uploadPrefixInput) uploadPrefixInput.value = activeCategory;
          }
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

    // Nieuwe map
    if (addFolderBtn) addFolderBtn.addEventListener('click', openFolderModal);
    if (addFolderBtnMobile) addFolderBtnMobile.addEventListener('click', openFolderModal);
    if (folderLabelInput) {
      folderLabelInput.addEventListener('input', function() {
        var slug = slugifyLabel(folderLabelInput.value);
        if (folderSlugPreview) folderSlugPreview.textContent = slug ? (slug + '/') : '-';
      });
    }
    if (folderConfirmBtn) folderConfirmBtn.addEventListener('click', confirmCreateFolder);

    // Paginering
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (activeCursor) loadList(activeCategory, activeCursor);
      });
    }

    // Drag & drop van OS-bestanden ergens in het content-paneel
    bindContentDropzone(contentSection);

    // Buiten elke dropzone: voorkom dat de browser het bestand zelf opent/
    // navigeert wanneer een drop toch ontsnapt (bv. buiten het contentpaneel).
    document.addEventListener('dragover', function(e) {
      if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') !== -1) e.preventDefault();
    });
    document.addEventListener('drop', function(e) {
      if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') !== -1) e.preventDefault();
    });
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
