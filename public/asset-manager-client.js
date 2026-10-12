/**
 * Asset Manager — Client JS
 *
 * Draait uitsluitend in de browser. Geen server-side code.
 *
 * Architectuurregels:
 *  - Geen template literals voor HTML-generatie
 *  - DOM-manipulatie via document.createElement + element.textContent
 *  - Gebruikers-input NOOIT via innerHTML
 *  - Lucide icon SVG strings (bibliotheekcode) wél via innerHTML toegestaan,
 *    net als <i data-lucide="..."> + lucide.createIcons()
 *  - DaisyUI klassen via classList
 *  - IIFE om global scope niet te vervuilen
 *
 * Mappen werken zoals in Koppelingen (forminator-sync-v2-core.js,
 * renderFolderSidebar): één vaste zijbalk "Mappen" met de volledige boom
 * (uit GET /api/assets/folders), een "Alle bestanden"-rij bovenaan, per map
 * een aantal en een ⋯-menu (Submap / Hernoemen / Link-domein / Verwijderen).
 * Het content-paneel toont enkel bestanden -- mappen staan uitsluitend in de
 * zijbalk, niet meer als tegels tussen de bestanden.
 *
 * @version 4.0.0 — Mappenstructuur naar het model van Koppelingen
 */

(function AssetManagerClient() {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════

  var state          = window.__ASSET_STATE__ || { userRole: 'user', userId: '', canUpload: false, canAdmin: false, assetBaseUrl: '' };
  // Vaste basis voor /assets/-URL's -- env.APP_BASE_URL server-side, met
  // window.location.origin als terugval. Zonder dit gebruikte de client altijd
  // het paginadomein, wat op operations.openvme.be (los doorverwijsdomein naar
  // deze Worker) niet naar de werkende R2-asset-route leidde.
  var assetBase      = state.assetBaseUrl || window.location.origin;
  var viewMode       = 'grid';    // 'grid' | 'list'
  var activeFolder   = '';        // '' = "Alle bestanden", anders een map-prefix (bv. 'uploads/contracten/')
  var activeCursor   = null;
  var allObjects     = [];        // cache voor client-side sort/filter
  var listRequestSeq = 0;         // negeert trage antwoorden van een eerder geopende map
  var sortField      = 'date';    // 'name' | 'size' | 'date'
  var sortAsc        = false;     // false = nieuwste eerst (default)

  // Mappenboom (GET /api/assets/folders): platte lijst
  // { prefix, name, parent, kind: 'fixed'|'category'|'own'|'sub', count, brand, brandExplicit, canWrite }
  var folders          = [];
  var folderByPrefix   = {};
  var totalFiles       = 0;
  var foldersTruncated = false;
  var foldersLoaded    = false;
  var expandedFolders  = loadExpandedFolders();   // prefix -> true (uitgeklapt in de boom)

  var pendingDeleteKey = null;
  var pendingRenameKey = null;
  var pendingMoveKey   = null;
  // null = nieuwe top-level map (admin), anders het prefix waarin de submap
  // aangemaakt wordt (zie openFolderModal/confirmCreateFolder).
  var pendingFolderParentPrefix = null;
  // Custom MIME-achtige key om te herkennen dat een drag een bestaand asset
  // is (i.p.v. bestanden vanaf het OS-bureaublad, die het 'Files' type dragen).
  var ASSET_DRAG_TYPE = 'application/x-asset-key';
  var EXPANDED_STORAGE_KEY = 'assetManager.expandedFolders';

  // ── DOM refs ──────────────────────────────────────────────

  var gridView       = document.getElementById('asset-grid-view');
  var listView       = document.getElementById('asset-list-view');
  var listBody       = document.getElementById('asset-list-body');
  var listLoading    = document.getElementById('asset-list-loading');
  var listEmpty      = document.getElementById('asset-list-empty');
  var listEmptyText  = document.getElementById('asset-list-empty-text');
  var alertBox       = document.getElementById('asset-alert');
  var searchInput    = document.getElementById('asset-search');
  var assetCount     = document.getElementById('asset-count');
  var pagination     = document.getElementById('asset-pagination');
  var paginationInfo = document.getElementById('asset-pagination-info');
  var nextBtn        = document.getElementById('asset-next-btn');
  var uploadBtn      = document.getElementById('asset-upload-btn');
  var uploadModal    = document.getElementById('asset-upload-modal');
  var uploadFileInput      = document.getElementById('upload-file-input');
  var uploadFolderSelect   = document.getElementById('upload-folder-select');
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
  var moveFolderSelect   = document.getElementById('move-folder-select');
  var moveConfirmBtn     = document.getElementById('move-confirm-btn');
  var moveFilename       = document.getElementById('move-modal-filename');
  var previewModal        = document.getElementById('preview-modal');
  var previewModalContent = document.getElementById('preview-modal-content');
  var viewGridBtn  = document.getElementById('view-grid-btn');
  var viewListBtn  = document.getElementById('view-list-btn');
  var sortSelect   = document.getElementById('sort-select');
  var folderTreeEl       = document.getElementById('asset-folder-tree');
  var addRootFolderBtn   = document.getElementById('asset-add-root-folder-btn');
  var breadcrumbList     = document.getElementById('asset-breadcrumb-list');
  var brandInfo          = document.getElementById('asset-brand-info');
  var folderModal        = document.getElementById('asset-folder-modal');
  var folderModalLocation = document.getElementById('folder-modal-location');
  var folderLabelInput   = document.getElementById('folder-label-input');
  var folderSlugPreview  = document.getElementById('folder-slug-preview');
  var folderModalError   = document.getElementById('folder-modal-error');
  var folderConfirmBtn   = document.getElementById('folder-confirm-btn');
  var contentSection     = document.getElementById('asset-content-section');

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

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

  function dirOf(key) {
    return key.indexOf('/') !== -1 ? key.substring(0, key.lastIndexOf('/') + 1) : '';
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

  function refreshIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function lucideIcon(name, cls) {
    var i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.className = cls || 'w-3.5 h-3.5';
    return i;
  }

  var BRAND_LABELS  = { openvme: 'OpenVME', syndicoach: 'Syndicoach' };
  var BRAND_DOMAINS = { openvme: 'link.openvme.be', syndicoach: 'link.syndicoach.be' };

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

  // Client-side voorvertoning van de slug -- de server bepaalt de
  // definitieve, gevalideerde prefix (zelfde regels, best-effort hier).
  function slugifyLabel(label) {
    return String(label || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ══════════════════════════════════════════════════════════════
  // MAPPEN — data
  // ══════════════════════════════════════════════════════════════

  function loadExpandedFolders() {
    try {
      var raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function saveExpandedFolders() {
    try { window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expandedFolders)); } catch (_) { /* geen opslag beschikbaar */ }
  }

  function loadFolders() {
    return fetch('/assets/api/assets/folders')
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) {
          showAlert(json.error || 'Mappen ophalen mislukt.', 'error');
          return;
        }
        folders = json.data.folders || [];
        totalFiles = json.data.total || 0;
        foldersTruncated = !!json.data.truncated;
        foldersLoaded = true;
        folderByPrefix = {};
        folders.forEach(function(f) { folderByPrefix[f.prefix] = f; });

        // De open map bestaat niet meer (bv. net verwijderd) → terug naar de
        // dichtstbijzijnde bovenliggende map die nog wel bestaat.
        if (activeFolder && !folderByPrefix[activeFolder]) {
          var fallback = activeFolder;
          while (fallback && !folderByPrefix[fallback]) fallback = parentPrefixOf(fallback);
          switchFolder(fallback);
          return;
        }
        renderFolderUi();
        // Mapnamen bij bestanden ("Alle bestanden") en de lege-staat-tekst
        // hangen af van de boom -- opnieuw tekenen nu die er is.
        if (listLoading && listLoading.style.display === 'none') {
          renderView(sortObjects(allObjects));
          if (searchInput && searchInput.value) filterList(searchInput.value);
        }
      })
      .catch(function(err) { showAlert('Mappen ophalen mislukt: ' + err.message, 'error'); });
  }

  function parentPrefixOf(prefix) {
    var trimmed = (prefix || '').replace(/\/$/, '');
    var idx = trimmed.lastIndexOf('/');
    return idx === -1 ? '' : trimmed.slice(0, idx + 1);
  }

  // Zelfde opbouw als buildFolderTree() in Koppelingen: platte lijst → boom.
  // Top-level mappen behouden de volgorde van de server (vaste mappen eerst),
  // submappen staan alfabetisch.
  function buildFolderTree() {
    var byId = {};
    folders.forEach(function(f) { byId[f.prefix] = Object.assign({}, f, { children: [] }); });
    var roots = [];
    folders.forEach(function(f) {
      var node = byId[f.prefix];
      if (f.parent && byId[f.parent]) byId[f.parent].children.push(node);
      else roots.push(node);
    });
    function sortRec(list) {
      list.sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'nl'); });
      list.forEach(function(n) { sortRec(n.children); });
    }
    roots.forEach(function(n) { sortRec(n.children); });
    return roots;
  }

  function flattenFolderTree() {
    var flat = [];
    (function walk(nodes, depth) {
      nodes.forEach(function(n) { flat.push({ node: n, depth: depth }); walk(n.children, depth + 1); });
    })(buildFolderTree(), 0);
    return flat;
  }

  // Keten van mappen van de top-level map tot en met `prefix`.
  function folderChain(prefix) {
    var chain = [];
    var p = prefix;
    while (p && folderByPrefix[p]) {
      chain.unshift(folderByPrefix[p]);
      p = folderByPrefix[p].parent;
    }
    return chain;
  }

  // Leesbaar pad ("Overige / contracten / 2026") i.p.v. het ruwe R2-prefix.
  function folderPathLabel(prefix) {
    var chain = folderChain(prefix);
    if (chain.length === 0) return prefix.replace(/\/$/, '');
    return chain.map(function(f) { return f.name; }).join(' / ');
  }

  function folderHasChildren(prefix) {
    return folders.some(function(f) { return f.parent === prefix; });
  }

  function expandAncestors(prefix) {
    var p = folderByPrefix[prefix] ? folderByPrefix[prefix].parent : null;
    var changed = false;
    while (p) {
      if (!expandedFolders[p]) { expandedFolders[p] = true; changed = true; }
      p = folderByPrefix[p] ? folderByPrefix[p].parent : null;
    }
    if (changed) saveExpandedFolders();
  }

  // ══════════════════════════════════════════════════════════════
  // MAPPEN — zijbalk (zelfde opmaak als Koppelingen)
  // ══════════════════════════════════════════════════════════════

  function renderFolderUi() {
    renderFolderSidebar();
    renderBreadcrumb();
    renderBrandInfo();
  }

  var ROW_BASE_CLASS   = 'flex items-center rounded-lg py-1 cursor-pointer hover:bg-base-200';
  var ROW_ACTIVE_CLASS = ' bg-primary/10 text-primary font-medium';

  function renderFolderSidebar() {
    if (!folderTreeEl) return;
    folderTreeEl.textContent = '';

    var allRow = document.createElement('div');
    allRow.className = ROW_BASE_CLASS + ' gap-1.5 px-1.5' + (activeFolder === '' ? ROW_ACTIVE_CLASS : '');
    allRow.appendChild(lucideIcon('layout-grid', 'w-3.5 h-3.5 shrink-0 text-base-content/40'));
    var allLabel = document.createElement('span');
    allLabel.className = 'flex-1 truncate text-sm';
    allLabel.textContent = 'Alle bestanden';
    allRow.appendChild(allLabel);
    var allCount = document.createElement('span');
    allCount.className = 'text-xs text-base-content/35';
    allCount.textContent = foldersLoaded ? String(totalFiles) : '';
    allRow.appendChild(allCount);
    allRow.addEventListener('click', function() { switchFolder(''); });
    folderTreeEl.appendChild(allRow);

    var divider = document.createElement('div');
    divider.className = 'divider my-1';
    folderTreeEl.appendChild(divider);

    var tree = buildFolderTree();
    if (tree.length === 0) {
      var none = document.createElement('p');
      none.className = 'text-xs text-base-content/40 italic px-1.5 py-2';
      none.textContent = foldersLoaded ? 'Nog geen mappen.' : 'Laden...';
      folderTreeEl.appendChild(none);
    }
    tree.forEach(function(node) { folderTreeEl.appendChild(renderFolderNode(node, 0)); });

    if (foldersTruncated) {
      var warn = document.createElement('p');
      warn.className = 'text-xs text-warning px-1.5 pt-2';
      warn.textContent = 'Niet alle mappen konden geladen worden (te veel bestanden).';
      folderTreeEl.appendChild(warn);
    }

    refreshIcons();
  }

  function renderFolderNode(node, depth) {
    var wrap = document.createElement('div');
    var isActive    = activeFolder === node.prefix;
    var hasChildren = node.children.length > 0;
    var isExpanded  = !!expandedFolders[node.prefix];

    var row = document.createElement('div');
    row.className = ROW_BASE_CLASS + ' gap-1 pr-1.5' + (isActive ? ROW_ACTIVE_CLASS : '');
    row.style.paddingLeft = (8 + depth * 14) + 'px';
    row.title = node.name;

    if (hasChildren) {
      var chevron = document.createElement('button');
      chevron.type = 'button';
      chevron.className = 'shrink-0 w-4 h-4 flex items-center justify-center';
      chevron.title = isExpanded ? 'Inklappen' : 'Uitklappen';
      chevron.appendChild(lucideIcon(isExpanded ? 'chevron-down' : 'chevron-right', 'w-3 h-3'));
      chevron.addEventListener('click', function(e) {
        e.stopPropagation();
        if (expandedFolders[node.prefix]) delete expandedFolders[node.prefix];
        else expandedFolders[node.prefix] = true;
        saveExpandedFolders();
        renderFolderSidebar();
      });
      row.appendChild(chevron);
    } else {
      var spacer = document.createElement('span');
      spacer.className = 'shrink-0 w-4';
      row.appendChild(spacer);
    }

    row.appendChild(lucideIcon(isActive ? 'folder-open' : 'folder', 'w-3.5 h-3.5 shrink-0 text-base-content/40'));

    var name = document.createElement('span');
    name.className = 'flex-1 truncate text-sm';
    name.textContent = node.name;
    row.appendChild(name);

    var count = document.createElement('span');
    count.className = 'text-xs text-base-content/35';
    count.textContent = String(node.count || 0);
    row.appendChild(count);

    var menu = buildFolderMenu(node);
    if (menu) row.appendChild(menu);

    row.addEventListener('click', function(e) {
      if (e.target.closest('.dropdown')) return;
      switchFolder(node.prefix);
    });
    if (node.canWrite) bindFolderDropTarget(row, node.prefix);

    wrap.appendChild(row);
    if (hasChildren && isExpanded) {
      node.children.forEach(function(child) { wrap.appendChild(renderFolderNode(child, depth + 1)); });
    }
    return wrap;
  }

  // ⋯-menu per map -- zelfde dropdown als in Koppelingen. Items afhankelijk
  // van wat de server toelaat (canWrite) en het soort map: vaste mappen
  // (Banners/Events/...) en "Mijn bestanden" kan je niet verwijderen, enkel
  // zelf aangemaakte top-level mappen hebben een hernoembaar label.
  function buildFolderMenu(node) {
    var items = [];
    if (node.canWrite) {
      items.push({ icon: 'folder-plus', label: 'Submap', handler: function() { openFolderModal(node.prefix); } });
    }
    if (node.kind === 'category' && state.canAdmin) {
      items.push({ icon: 'pencil', label: 'Hernoemen', handler: function() { renameCategoryLabel(node.prefix, node.name); } });
    }
    if (node.canWrite) {
      items.push({ title: 'Link-domein' });
      ['openvme', 'syndicoach'].forEach(function(brandKey) {
        items.push({
          icon: node.brandExplicit === brandKey ? 'check' : null,
          label: BRAND_LABELS[brandKey],
          handler: function() { setFolderBrand(node.prefix, brandKey); },
        });
      });
      items.push({
        icon: node.brandExplicit ? null : 'check',
        label: 'Overerven',
        handler: function() { setFolderBrand(node.prefix, null); },
      });
    }
    var deletable = (node.kind === 'sub' && node.canWrite) || (node.kind === 'category' && state.canAdmin);
    if (deletable) {
      items.push({ divider: true });
      items.push({ icon: 'trash-2', label: 'Verwijderen', cls: 'text-error', handler: function() { deleteFolder(node.prefix, node.name); } });
    }
    if (items.length === 0) return null;

    var dropdown = document.createElement('div');
    dropdown.className = 'dropdown dropdown-end shrink-0';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = 0;
    btn.className = 'btn btn-ghost btn-xs px-1';
    btn.title = 'Acties';
    btn.appendChild(lucideIcon('more-horizontal', 'w-3.5 h-3.5'));
    btn.addEventListener('click', function(e) { e.stopPropagation(); });
    dropdown.appendChild(btn);

    var ul = document.createElement('ul');
    ul.tabIndex = 0;
    ul.className = 'dropdown-content z-[20] menu menu-xs p-1 shadow-lg bg-base-100 rounded-lg w-44 border border-base-200 text-base-content font-normal';

    items.forEach(function(def) {
      var li = document.createElement('li');
      if (def.divider) {
        var hr = document.createElement('hr');
        hr.className = 'my-1 border-base-200';
        li.appendChild(hr);
        ul.appendChild(li);
        return;
      }
      if (def.title) {
        li.className = 'menu-title text-[11px] px-2 pt-1.5 pb-0.5';
        li.textContent = def.title;
        ul.appendChild(li);
        return;
      }
      var a = document.createElement('a');
      if (def.cls) a.className = def.cls;
      if (def.icon) {
        a.appendChild(lucideIcon(def.icon, 'w-3.5 h-3.5'));
      } else {
        var blank = document.createElement('span');
        blank.className = 'w-3.5 h-3.5';
        a.appendChild(blank);
      }
      var lbl = document.createElement('span');
      lbl.textContent = def.label;
      a.appendChild(lbl);
      a.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        def.handler();
      });
      li.appendChild(a);
      ul.appendChild(li);
    });

    dropdown.appendChild(ul);
    return dropdown;
  }

  // ── Pad van de open map (boven de bestanden) ─────────────────

  function renderBreadcrumb() {
    if (!breadcrumbList) return;
    breadcrumbList.textContent = '';

    function addCrumb(label, targetPrefix, isLast, icon) {
      var li = document.createElement('li');
      var el = document.createElement(isLast ? 'span' : 'a');
      el.className = 'inline-flex items-center gap-1' + (isLast ? ' font-semibold' : '');
      if (icon) el.appendChild(lucideIcon(icon, 'w-3.5 h-3.5 opacity-60'));
      var text = document.createElement('span');
      text.textContent = label;
      el.appendChild(text);
      if (!isLast) {
        el.href = '#';
        el.addEventListener('click', function(e) {
          e.preventDefault();
          switchFolder(targetPrefix);
        });
        var target = targetPrefix ? folderByPrefix[targetPrefix] : null;
        if (target && target.canWrite) bindFolderDropTarget(el, targetPrefix);
      }
      li.appendChild(el);
      breadcrumbList.appendChild(li);
    }

    var chain = activeFolder ? folderChain(activeFolder) : [];
    addCrumb('Alle bestanden', '', chain.length === 0, 'layout-grid');
    chain.forEach(function(f, idx) {
      addCrumb(f.name, f.prefix, idx === chain.length - 1, idx === chain.length - 1 ? 'folder-open' : null);
    });
    refreshIcons();
  }

  // Toont via welk domein "link kopiëren" voor deze map werkt. Wijzigen
  // gebeurt via het ⋯-menu van de map in de zijbalk.
  function renderBrandInfo() {
    if (!brandInfo) return;
    var node = activeFolder ? folderByPrefix[activeFolder] : null;
    if (!node) {
      brandInfo.style.display = 'none';
      return;
    }
    brandInfo.textContent = '';
    brandInfo.appendChild(lucideIcon('link', 'w-3 h-3'));
    var lbl = document.createElement('span');
    lbl.textContent = (BRAND_DOMAINS[node.brand] || node.brand) + (node.brandExplicit ? '' : ' (overgeërfd)');
    brandInfo.appendChild(lbl);
    brandInfo.title = 'Link-domein van deze map' + (node.canWrite ? ' \u2014 wijzigen via ⋯ bij de map in de zijbalk' : '');
    brandInfo.style.removeProperty('display');
    refreshIcons();
  }

  // ══════════════════════════════════════════════════════════════
  // MAPPEN — acties
  // ══════════════════════════════════════════════════════════════

  // parentPrefix: undefined/null → nieuwe top-level map (admin-only).
  // Een prefix-string → submap in die map.
  function openFolderModal(parentPrefix) {
    if (!folderModal) return;
    pendingFolderParentPrefix = parentPrefix || null;
    if (folderLabelInput) folderLabelInput.value = '';
    if (folderSlugPreview) folderSlugPreview.textContent = '-';
    if (folderModalError) { folderModalError.style.display = 'none'; folderModalError.textContent = ''; }
    if (folderModalLocation) {
      if (pendingFolderParentPrefix) {
        folderModalLocation.textContent = 'In: ' + folderPathLabel(pendingFolderParentPrefix);
        folderModalLocation.style.removeProperty('display');
      } else {
        folderModalLocation.textContent = 'Nieuwe map op het hoogste niveau';
        folderModalLocation.style.removeProperty('display');
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
        showAlert('Map "' + json.data.label + '" aangemaakt.', 'success');
        if (parentPrefix) {
          expandedFolders[parentPrefix] = true;
          saveExpandedFolders();
        }
        loadFolders();
      })
      .catch(function(err) {
        if (folderConfirmBtn) folderConfirmBtn.disabled = false;
        if (folderModalError) { folderModalError.textContent = 'Netwerkfout: ' + err.message; folderModalError.style.display = ''; }
      });
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
        showAlert('Naam bijgewerkt.', 'success');
        loadFolders();
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
        // Publieke links van de bestanden veranderen mee -- beide herladen.
        refreshAll();
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  function deleteFolder(prefix, name) {
    if (!window.confirm('Map "' + name + '" verwijderen?\n\nEnkel lege mappen kunnen verwijderd worden. Dit kan niet ongedaan gemaakt worden.')) return;
    fetch('/assets/api/assets/delete-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefix }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Map verwijderen mislukt.', 'error'); return; }
        showAlert('Map verwijderd.', 'success');
        delete expandedFolders[prefix];
        saveExpandedFolders();
        // loadFolders() springt zelf naar de bovenliggende map als de
        // verwijderde map (of een submap ervan) open stond.
        loadFolders();
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // Vult een <select> met de mappen waarin de gebruiker mag schrijven, in
  // boomvolgorde (zelfde lijst als "Verplaats naar map" in Koppelingen). Elke
  // optie toont het volledige pad, zodat ook de gekozen waarde in de
  // ingeklapte select ondubbelzinnig is ("Overige / contracten / 2026").
  function fillFolderSelect(selectEl, preferredPrefix) {
    if (!selectEl) return 0;
    selectEl.textContent = '';
    var writable = flattenFolderTree().filter(function(item) { return item.node.canWrite; });
    writable.forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item.node.prefix;
      opt.textContent = folderPathLabel(item.node.prefix);
      selectEl.appendChild(opt);
    });
    var values = writable.map(function(item) { return item.node.prefix; });
    if (preferredPrefix && values.indexOf(preferredPrefix) !== -1) {
      selectEl.value = preferredPrefix;
    } else if (values.indexOf('uploads/') !== -1) {
      selectEl.value = 'uploads/';
    }
    return writable.length;
  }

  // ══════════════════════════════════════════════════════════════
  // SORT
  // ══════════════════════════════════════════════════════════════

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
      va = basename(a.key || '').toLowerCase();
      vb = basename(b.key || '').toLowerCase();
      return sortAsc
        ? (va < vb ? -1 : va > vb ? 1 : 0)
        : (vb < va ? -1 : vb > va ? 1 : 0);
    });
    return arr;
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW TOGGLE + RENDERING
  // ══════════════════════════════════════════════════════════════

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

  function emptyStateText() {
    if (!activeFolder) return 'Nog geen bestanden.';
    var node = folderByPrefix[activeFolder];
    var text = folderHasChildren(activeFolder)
      ? 'Geen bestanden in deze map \u2014 kies een submap in de zijbalk.'
      : 'Geen bestanden in deze map.';
    if (state.canUpload && node && node.canWrite) text += ' Sleep bestanden hierheen of klik op Uploaden.';
    return text;
  }

  function renderView(objects) {
    if (!objects || objects.length === 0) {
      setLoading(false);
      if (listEmptyText) listEmptyText.textContent = emptyStateText();
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

  // ── SVG icon strings (Lucide-stijl, inline toegestaan) ────

  var SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var SVG_DOTS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
  var SVG_FILE_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-40"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var SVG_LINK    = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  // ─── Grid view ─────────────────────────────────────────────

  function renderGrid(objects) {
    if (!gridView) return;
    gridView.textContent = '';
    objects.forEach(function(obj) {
      gridView.appendChild(renderGridCard(obj));
    });
  }

  // ─── Drag & drop ─────────────────────────────────────────────
  //
  // Twee soorten drags landen op een map (map in de zijbalk, pad boven de
  // bestanden): een bestaand asset (intern, ASSET_DRAG_TYPE) -- verplaatst het
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
      el.classList.add('bg-primary/20');
    });
    el.addEventListener('dragleave', function() {
      el.classList.remove('bg-primary/20');
    });
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('bg-primary/20');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (!state.canUpload) return;
        uploadFiles(e.dataTransfer.files, targetPrefix, false);
        return;
      }
      var key = e.dataTransfer.getData(ASSET_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
      if (key) moveAssetTo(key, targetPrefix);
    });
  }

  // Achtervang voor het hele content-paneel: bestanden vanaf het OS-bureaublad
  // ergens in het paneel droppen upload ze naar de open map ("Alle bestanden"
  // → 'uploads/' als redelijke default). Mappen in de zijbalk roepen zelf
  // stopPropagation() aan, dus deze handler vuurt enkel daarbuiten.
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
      var node = activeFolder ? folderByPrefix[activeFolder] : null;
      var target = node && node.canWrite ? activeFolder : 'uploads/';
      uploadFiles(e.dataTransfer.files, target, false);
    });
  }

  // Op "Alle bestanden" staan bestanden uit alle mappen door elkaar -- dan
  // tonen we bij elk bestand in welke map het zit.
  function renderFolderHint(obj) {
    var hint = document.createElement('span');
    hint.className = 'text-xs text-base-content/40 block leading-tight truncate';
    hint.textContent = folderPathLabel(dirOf(obj.key));
    return hint;
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

    var nameWrap = document.createElement('div');
    nameWrap.className = 'flex-1 min-w-0';
    var nameEl = document.createElement('p');
    nameEl.className = 'text-sm font-medium truncate';
    nameEl.title = obj.key;
    nameEl.textContent = basename(obj.key);
    nameWrap.appendChild(nameEl);
    if (!activeFolder) nameWrap.appendChild(renderFolderHint(obj));
    row1.appendChild(nameWrap);
    row1.appendChild(renderQuickCopyBtn(obj));
    row1.appendChild(renderKebabMenu(obj));
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

    // Naam (+ map, enkel op "Alle bestanden")
    var tdName = document.createElement('td');
    var nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium text-sm';
    nameSpan.textContent = basename(obj.key);
    tdName.appendChild(nameSpan);
    if (!activeFolder) tdName.appendChild(renderFolderHint(obj));
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
    tdAct.appendChild(renderKebabMenu(obj));
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

  // Verplaatsen mag een admin overal; anderen binnen mappen waar ze zelf
  // mogen schrijven (zelfde regel als POST /api/assets/move).
  function canMoveKey(key) {
    if (state.canAdmin) return true;
    var node = folderByPrefix[dirOf(key)];
    return !!(node && node.canWrite);
  }

  // ══════════════════════════════════════════════════════════════
  // KEBAB MENU (bestanden)
  // ══════════════════════════════════════════════════════════════

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
    }
    if (canMoveKey(obj.key)) {
      addItem('Verplaatsen naar map...', function() { openMoveModal(obj.key); });
    }

    if (state.canAdmin || isOwnKey(obj.key)) {
      var divLi = document.createElement('li');
      divLi.innerHTML = '<hr class="my-1 border-base-content/10" />';
      ul.appendChild(divLi);
      addItem('Verwijderen', function() { openDeleteModal(obj.key); }, 'text-error');
    }

    details.appendChild(ul);
    return details;
  }

  // ══════════════════════════════════════════════════════════════
  // PREVIEW MODAL
  // ══════════════════════════════════════════════════════════════

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
    metaEl.textContent = [folderPathLabel(dirOf(obj.key)), mime || '\u2014', formatBytes(obj.size), obj.uploaded ? formatDate(obj.uploaded) : '']
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
    var canMove = canMoveKey(obj.key);
    var canDelete = state.canAdmin || isOwnKey(obj.key);
    if (state.canAdmin || canMove || canDelete) {
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
      }
      if (canMove) {
        actRow.appendChild(makeActBtn('Verplaats',
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
          function() { openMoveModal(obj.key); }));
      }
      if (canDelete) {
        actRow.appendChild(makeActBtn('Verwijder',
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
          function() { openDeleteModal(obj.key); }, 'btn-error'));
      }

      container.appendChild(actRow);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // DATA LADEN
  // ══════════════════════════════════════════════════════════════

  function loadList(prefix, cursor) {
    var requestId = ++listRequestSeq;
    if (!cursor) setLoading(true);
    hideAlert();

    var url = '/assets/api/assets/list?limit=100';
    if (prefix) url += '&prefix=' + encodeURIComponent(prefix);
    if (cursor) url += '&cursor=' + encodeURIComponent(cursor);

    return fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (requestId !== listRequestSeq) return;   // intussen een andere map geopend
        setLoading(false);
        if (!json.success) {
          showAlert(json.error || 'Lijst ophalen mislukt.', 'error');
          return;
        }
        var data = json.data;
        var page = data.objects || [];
        // "Meer laden" voegt toe aan wat er al stond i.p.v. het te vervangen.
        allObjects = cursor ? allObjects.concat(page) : page;
        parseSortSelect();
        renderView(sortObjects(allObjects));
        if (assetCount) {
          assetCount.textContent = allObjects.length + ' bestand' + (allObjects.length !== 1 ? 'en' : '');
        }
        activeCursor = data.cursor || null;
        if (data.truncated) {
          if (pagination) pagination.style.removeProperty('display');
          if (nextBtn) nextBtn.style.display = activeCursor ? '' : 'none';
          if (paginationInfo) {
            paginationInfo.textContent = activeCursor
              ? allObjects.length + ' geladen \u2014 meer beschikbaar'
              : 'Toont de ' + allObjects.length + ' nieuwste bestanden \u2014 open een map om de rest te zien';
          }
        } else if (pagination) {
          pagination.style.setProperty('display', 'none', 'important');
        }
        // Filter opnieuw toepassen
        if (searchInput && searchInput.value) filterList(searchInput.value);
      })
      .catch(function(err) {
        if (requestId !== listRequestSeq) return;
        setLoading(false);
        showAlert('Netwerkfout: ' + err.message, 'error');
      });
  }

  function switchFolder(prefix) {
    activeFolder = prefix || '';
    activeCursor = null;
    if (activeFolder) expandAncestors(activeFolder);
    renderFolderUi();
    loadList(activeFolder, null);
  }

  // Na elke wijziging (upload, verplaatsen, verwijderen, link-domein): zowel
  // de bestanden als de mappen (aantallen) opnieuw ophalen.
  function refreshAll() {
    loadFolders();
    loadList(activeFolder, null);
  }

  // ─── Filter (client-side zoeken) ──────────────────────────

  function filterList(query) {
    var q = query.toLowerCase();
    gridView.querySelectorAll('[data-key]').forEach(function(el) {
      el.style.display = (!q || basename(el.dataset.key).toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
    listBody.querySelectorAll('tr[data-key]').forEach(function(tr) {
      tr.style.display = (!q || basename(tr.dataset.key).toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // ══════════════════════════════════════════════════════════════
  // UPLOAD
  // ══════════════════════════════════════════════════════════════

  function openUploadModal() {
    if (uploadFileInput) uploadFileInput.value = '';
    var count = fillFolderSelect(uploadFolderSelect, activeFolder);
    if (uploadConfirmBtn) uploadConfirmBtn.disabled = count === 0;
    if (count === 0) showAlert('Er is geen map waarin je mag uploaden.', 'warning');
    if (uploadModal.showModal) uploadModal.showModal();
  }

  // Uploadt de bestanden één na één naar `prefix` en herlaadt daarna één
  // keer. useOverwrite: enkel vanuit de upload-modal (checkbox) -- bij slepen
  // staat overschrijven altijd uit, een conflict geeft dan de 409-melding.
  function uploadFiles(fileList, prefix, useOverwrite) {
    var files = Array.prototype.slice.call(fileList);
    if (files.length === 0) return;
    var overwrite = !!(useOverwrite && uploadOverwriteInput && uploadOverwriteInput.checked);
    var errors = [];
    var done = 0;

    if (uploadProgress) uploadProgress.style.removeProperty('display');
    if (uploadConfirmBtn) uploadConfirmBtn.disabled = true;

    files.reduce(function(chain, file) {
      return chain.then(function() {
        return uploadFile(file, prefix, overwrite)
          .then(function() { done++; })
          .catch(function(err) { errors.push(file.name + ': ' + err.message); });
      });
    }, Promise.resolve()).then(function() {
      if (uploadProgress) uploadProgress.style.display = 'none';
      if (uploadConfirmBtn) uploadConfirmBtn.disabled = false;
      if (uploadModal && uploadModal.open && uploadModal.close) uploadModal.close();
      var where = folderPathLabel(prefix);
      if (errors.length) {
        showAlert((done ? done + ' geüpload naar ' + where + '. ' : '') + 'Mislukt: ' + errors.join(' \u00B7 '), 'error');
      } else {
        showAlert(done === 1 ? 'Geüpload naar ' + where + '.' : done + ' bestanden geüpload naar ' + where + '.', 'success');
      }
      refreshAll();
    });
  }

  function uploadFile(file, prefix, overwrite) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', prefix || 'uploads/');
    formData.append('overwrite', overwrite ? 'true' : 'false');

    return fetch('/assets/api/assets/upload', { method: 'POST', body: formData })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) throw new Error(json.error || 'Upload mislukt.');
        return json.data;
      });
  }

  // ══════════════════════════════════════════════════════════════
  // DELETE
  // ══════════════════════════════════════════════════════════════

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
        refreshAll();
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // ══════════════════════════════════════════════════════════════
  // RENAME
  // ══════════════════════════════════════════════════════════════

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
        refreshAll();
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // ══════════════════════════════════════════════════════════════
  // MOVE
  // ══════════════════════════════════════════════════════════════

  function openMoveModal(key) {
    pendingMoveKey = key;
    if (moveFilename) moveFilename.textContent = basename(key) + ' \u00B7 nu in ' + folderPathLabel(dirOf(key));
    var count = fillFolderSelect(moveFolderSelect, dirOf(key));
    if (moveConfirmBtn) moveConfirmBtn.disabled = count === 0;
    if (moveModal.showModal) moveModal.showModal();
  }

  function confirmMove() {
    if (!pendingMoveKey) return;
    var key    = pendingMoveKey;
    var target = moveFolderSelect ? moveFolderSelect.value : '';
    pendingMoveKey = null;
    if (moveModal.close) moveModal.close();
    if (!target || target === dirOf(key)) return;
    moveAssetTo(key, target);
  }

  // Herbruikt door zowel de "Verplaatsen"-modal als drag & drop van een asset
  // op een map (zijbalk of pad boven de bestanden).
  function moveAssetTo(key, targetPrefix) {
    if (!key || !targetPrefix || dirOf(key) === targetPrefix) return;
    fetch('/assets/api/assets/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, targetPrefix: targetPrefix }),
    })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (!json.success) { showAlert(json.error || 'Verplaatsen mislukt.', 'error'); return; }
        showAlert('Verplaatst naar ' + folderPathLabel(targetPrefix) + '.', 'success');
        refreshAll();
      })
      .catch(function(err) { showAlert('Fout: ' + err.message, 'error'); });
  }

  // ══════════════════════════════════════════════════════════════
  // URL KOPIËREN
  // ══════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ══════════════════════════════════════════════════════════════

  function bindEvents() {
    // Nieuwe top-level map (admin) -- de "+"-knop naast "Mappen", zoals in Koppelingen
    if (addRootFolderBtn) addRootFolderBtn.addEventListener('click', function() { openFolderModal(); });

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

    // Upload
    if (uploadBtn) uploadBtn.addEventListener('click', openUploadModal);
    if (uploadConfirmBtn) {
      uploadConfirmBtn.addEventListener('click', function() {
        var files = uploadFileInput ? uploadFileInput.files : [];
        if (!files || files.length === 0) {
          showAlert('Selecteer een bestand.', 'warning');
          return;
        }
        var prefix = uploadFolderSelect ? uploadFolderSelect.value : '';
        if (!prefix) return;
        uploadFiles(files, prefix, true);
      });
    }

    // Delete / rename / move
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', confirmDelete);
    if (renameConfirmBtn) renameConfirmBtn.addEventListener('click', confirmRename);
    if (moveConfirmBtn) moveConfirmBtn.addEventListener('click', confirmMove);

    // Nieuwe map
    if (folderLabelInput) {
      folderLabelInput.addEventListener('input', function() {
        var slug = slugifyLabel(folderLabelInput.value);
        if (folderSlugPreview) folderSlugPreview.textContent = slug ? ((pendingFolderParentPrefix || '') + slug + '/') : '-';
      });
      folderLabelInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmCreateFolder(); }
      });
    }
    if (folderConfirmBtn) folderConfirmBtn.addEventListener('click', confirmCreateFolder);

    // Paginering
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (activeCursor) loadList(activeFolder, activeCursor);
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

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  function init() {
    // Lucide icons voor statische HTML-elementen renderen
    refreshIcons();

    bindEvents();

    // Default sort
    if (sortSelect) sortSelect.value = 'date-desc';
    parseSortSelect();

    // Start met "Alle bestanden"; de mappenboom laadt parallel.
    renderFolderUi();
    loadFolders();
    loadList('', null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
