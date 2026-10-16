/**
 * home.js — homepage van de Operations Manager (public/home.html).
 *
 * Links de departementen (zelfde opbouw als de mappen in Koppelingen en
 * Assetbeheer), rechts compacte tegels per departement. Beheerders krijgen een
 * tandwiel per tegel (departement, icoon, beschrijving, wie heeft toegang) en
 * kunnen departementen aanmaken, hernoemen, verschuiven en verwijderen.
 *
 * Data:  GET /home/api/overview            (src/modules/home/api-module.js)
 * Beheer: /admin/api/departments*, /admin/api/modules/:id/settings|users
 *         (src/modules/admin/department-routes.js + routes.js)
 *
 * Events via data-action + een centrale listener (UI-regel 3).
 */
(function () {
  'use strict';

  var ALL = '__all__';
  var NONE = '__none__';
  var STORE_KEY = 'home-dept';

  // Iconen die je met een klik kiest in de beheervensters (Lucide-namen).
  var ICON_PICKS = [
    'workflow', 'arrow-left-right', 'newspaper', 'megaphone', 'mail', 'mail-check', 'pen-tool',
    'calendar-days', 'calendar-clock', 'presentation', 'bar-chart-3', 'layout-dashboard', 'database',
    'trending-up', 'blocks', 'trophy', 'zap', 'heart-handshake', 'folder-kanban', 'clipboard-check',
    'puzzle', 'wrench', 'settings-2', 'users', 'wallet', 'file-text', 'globe', 'box'
  ];

  var S = {
    isAdmin: false,
    departmentsReady: true,
    departments: [],
    modules: [],
    active: ALL,
    search: '',
    mm: null,   // open module-instellingen: { module, users, access:Set, usersLoaded }
    dm: null    // open departement-venster: { id|null }
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function iconName(v, fallback) {
    var s = String(v || '').trim().toLowerCase();
    return /^[a-z0-9-]{1,40}$/.test(s) ? s : (fallback || 'box');
  }

  function refreshIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
    return null;
  }

  function toast(msg, kind) {
    var host = $('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'alert ' + (kind === 'error' ? 'alert-error' : 'alert-success') + ' text-sm py-2 shadow-lg';
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, kind === 'error' ? 6000 : 3000);
  }

  async function api(method, url, body) {
    var res = await fetch(url, {
      method: method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 || res.redirected) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && (data.error || data.message)) || ('Fout ' + res.status));
    }
    return data || {};
  }

  // ── Afgeleide gegevens ────────────────────────────────────────────────────

  function deptById(id) {
    for (var i = 0; i < S.departments.length; i++) if (S.departments[i].id === id) return S.departments[i];
    return null;
  }

  function moduleById(id) {
    for (var i = 0; i < S.modules.length; i++) if (S.modules[i].id === id) return S.modules[i];
    return null;
  }

  // Een module waarvan het departement niet (meer) bestaat, hoort bij "Overige".
  function deptOf(m) {
    return m.department_id && deptById(m.department_id) ? m.department_id : NONE;
  }

  function sortModules(list) {
    return list.slice().sort(function (a, b) {
      return (a.display_order || 0) - (b.display_order || 0) || a.name.localeCompare(b.name, 'nl');
    });
  }

  function matchesSearch(m) {
    if (!S.search) return true;
    var q = S.search.toLowerCase();
    return (m.name + ' ' + (m.description || '')).toLowerCase().indexOf(q) !== -1;
  }

  function countIn(deptId) {
    return S.modules.filter(function (m) { return deptOf(m) === deptId; }).length;
  }

  // ── Linkerkolom ──────────────────────────────────────────────────────────

  function deptRow(id, label, icon, count, extra) {
    var active = S.active === id;
    return '<div class="home-dept group relative rounded-lg px-1.5 py-1 cursor-pointer flex items-center gap-1.5 '
      + (active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-base-content/5') + '" data-action="select-dept" data-id="' + esc(id) + '">'
      + '<i data-lucide="' + esc(iconName(icon, 'folder')) + '" class="w-3.5 h-3.5 shrink-0 ' + (active ? '' : 'text-base-content/40') + '"></i>'
      + '<span class="flex-1 truncate text-sm">' + esc(label) + '</span>'
      + (extra || '')
      + '<span class="text-xs text-base-content/35 tabular-nums">' + count + '</span>'
      + '</div>';
  }

  function deptMenu(d, index) {
    var last = index === S.departments.length - 1;
    return '<div class="home-dept-actions dropdown dropdown-end" data-stop="1">'
      + '<button type="button" tabindex="0" class="btn btn-ghost btn-xs btn-square h-5 min-h-0 w-5" title="Departement beheren" data-stop="1">'
      + '<i data-lucide="more-horizontal" class="w-3.5 h-3.5"></i></button>'
      + '<ul tabindex="0" class="dropdown-content z-[20] menu menu-sm p-1 shadow-lg bg-base-100 rounded-xl w-44 mt-1 border border-base-content/10 font-normal text-base-content">'
      + '<li><button type="button" data-action="edit-dept" data-id="' + esc(d.id) + '"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Wijzigen</button></li>'
      + (index > 0 ? '<li><button type="button" data-action="move-dept" data-id="' + esc(d.id) + '" data-dir="-1"><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>Omhoog</button></li>' : '')
      + (!last ? '<li><button type="button" data-action="move-dept" data-id="' + esc(d.id) + '" data-dir="1"><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>Omlaag</button></li>' : '')
      + '<li><button type="button" class="text-error" data-action="delete-dept" data-id="' + esc(d.id) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Verwijderen</button></li>'
      + '</ul></div>';
  }

  function renderSidebar() {
    var el = $('deptList');
    if (!el) return;
    $('btnAddDept').classList.toggle('hidden', !(S.isAdmin && S.departmentsReady));

    var html = deptRow(ALL, 'Alle modules', 'layout-grid', S.modules.length);
    var rows = '';
    S.departments.forEach(function (d, i) {
      var n = countIn(d.id);
      if (!n && !S.isAdmin) return;
      rows += deptRow(d.id, d.name, d.icon, n, S.isAdmin ? deptMenu(d, i) : '');
    });
    var none = countIn(NONE);
    if (none && S.departments.length) rows += deptRow(NONE, 'Overige', 'inbox', none);

    if (rows) html += '<div class="divider my-1"></div>' + rows;
    else if (!S.departmentsReady && S.isAdmin) {
      html += '<p class="text-xs text-base-content/50 px-1.5 py-2">De departementen staan nog niet in de database. Zodra de update live staat, verschijnen ze hier.</p>';
    }
    el.innerHTML = html;
  }

  // ── Tegels ───────────────────────────────────────────────────────────────

  function tile(m) {
    var gear = S.isAdmin
      ? '<button type="button" class="home-gear btn btn-ghost btn-xs btn-square absolute top-1.5 right-1.5" data-action="module-settings" data-id="' + esc(m.id) + '" title="Instellingen van ' + esc(m.name) + '" aria-label="Instellingen van ' + esc(m.name) + '">'
        + '<i data-lucide="settings" class="w-3.5 h-3.5"></i></button>'
      : '';
    return '<div class="home-tile-wrap relative">'
      + '<a href="' + esc(m.route) + '" class="home-tile flex items-center gap-3 h-full p-3 pr-9 rounded-xl bg-base-100 border border-base-content/10 hover:border-primary/40">'
      + '<span class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">'
      + '<i data-lucide="' + esc(iconName(m.icon)) + '" class="w-5 h-5 text-primary"></i></span>'
      + '<span class="min-w-0 flex-1">'
      + '<span class="block font-semibold text-sm leading-snug truncate">' + esc(m.name) + '</span>'
      + (m.description ? '<span class="block text-xs text-base-content/60 leading-snug line-clamp-2 mt-0.5">' + esc(m.description) + '</span>' : '')
      + '</span></a>' + gear + '</div>';
  }

  function grid(list) {
    return '<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">' + sortModules(list).map(tile).join('') + '</div>';
  }

  function section(title, icon, list) {
    return '<div class="mb-7 last:mb-0">'
      + '<h2 class="flex items-center gap-2 text-sm font-semibold text-base-content/70 mb-2.5">'
      + '<i data-lucide="' + esc(iconName(icon, 'folder')) + '" class="w-4 h-4 text-base-content/40"></i>'
      + esc(title) + '<span class="text-xs font-normal text-base-content/40">' + list.length + '</span></h2>'
      + grid(list) + '</div>';
  }

  function emptyBox(icon, text) {
    return '<div class="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-base-content/15">'
      + '<i data-lucide="' + icon + '" class="w-10 h-10 text-base-content/30 mb-3"></i>'
      + '<p class="text-sm text-base-content/50">' + esc(text) + '</p></div>';
  }

  function renderModules() {
    var el = $('moduleArea');
    if (!el) return;

    if (!S.modules.length) {
      el.innerHTML = emptyBox('layout-dashboard', 'Je hebt nog geen modules. Vraag je beheerder om toegang.');
      return;
    }

    var visible = S.modules.filter(matchesSearch);
    var html = '';

    if (S.active === ALL) {
      if (!S.departments.length) {
        html = visible.length ? grid(visible) : '';
      } else {
        S.departments.forEach(function (d) {
          var list = visible.filter(function (m) { return deptOf(m) === d.id; });
          if (list.length) html += section(d.name, d.icon, list);
        });
        var rest = visible.filter(function (m) { return deptOf(m) === NONE; });
        if (rest.length) html += section('Overige', 'inbox', rest);
      }
    } else {
      var list = visible.filter(function (m) { return deptOf(m) === S.active; });
      if (list.length) {
        var d = deptById(S.active);
        html = section(d ? d.name : 'Overige', d ? d.icon : 'inbox', list);
      }
    }

    if (!html) {
      html = S.search
        ? emptyBox('search-x', 'Geen module gevonden voor "' + S.search + '".')
        : emptyBox('folder-open', S.isAdmin
          ? 'Nog geen modules in dit departement. Kies een departement via het tandwiel op een tegel.'
          : 'Nog geen modules in dit departement.');
    }
    el.innerHTML = html;
  }

  function render() {
    if (S.active !== ALL && S.active !== NONE && !deptById(S.active)) S.active = ALL;
    if (S.active === NONE && !countIn(NONE)) S.active = ALL;
    renderSidebar();
    renderModules();
    refreshIcons();
  }

  // ── Laden ────────────────────────────────────────────────────────────────

  async function loadOverview() {
    var data = await api('GET', '/home/api/overview');
    S.isAdmin = !!data.isAdmin;
    S.departmentsReady = data.departmentsReady !== false;
    S.departments = data.departments || [];
    S.modules = data.modules || [];
  }

  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (me.navbarHtml && window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
      var u = me.user || {};
      var naam = u.full_name || u.username || u.email || '';
      $('welcome').textContent = naam ? 'Welkom, ' + naam : 'Welkom';
    } catch (e) { /* navbar is niet essentieel */ }

    S.active = store(STORE_KEY) || ALL;
    try {
      await loadOverview();
    } catch (e) {
      $('moduleArea').innerHTML = emptyBox('alert-triangle', 'De modules konden niet geladen worden: ' + e.message + '. Herlaad de pagina.');
      $('deptList').innerHTML = '';
      refreshIcons();
      return;
    }
    render();
  }

  // ── Icoonkiezer (gedeeld door beide vensters) ────────────────────────────

  function renderIconPicks(hostId, inputId) {
    var host = $(hostId);
    var current = iconName($(inputId).value, '');
    host.innerHTML = ICON_PICKS.map(function (n) {
      return '<button type="button" class="home-icon-pick btn btn-ghost btn-xs btn-square' + (n === current ? ' is-active' : '') + '" data-action="pick-icon" data-icon="' + n + '" data-input="' + inputId + '" title="' + n + '">'
        + '<i data-lucide="' + n + '" class="w-4 h-4"></i></button>';
    }).join('');
  }

  function renderMmPreview() {
    var icon = iconName($('mmIcon').value, (S.mm && S.mm.module.icon) || 'box');
    $('mmIconPreview').innerHTML = '<i data-lucide="' + esc(icon) + '" class="w-5 h-5 text-primary"></i>';
    renderIconPicks('mmIconPicks', 'mmIcon');
    refreshIcons();
  }

  // ── Module-instellingen ──────────────────────────────────────────────────

  function setMmTab(tab) {
    document.querySelectorAll('[data-action="mm-tab"]').forEach(function (b) {
      b.classList.toggle('tab-active', b.dataset.tab === tab);
    });
    $('mmPaneAlgemeen').classList.toggle('hidden', tab !== 'algemeen');
    $('mmPaneToegang').classList.toggle('hidden', tab !== 'toegang');
    if (tab === 'toegang') $('mmUserSearch').focus();
  }

  function renderAccessCount() {
    var mm = S.mm;
    $('mmAccessCount').textContent = mm && mm.usersLoaded ? mm.access.size + '/' + mm.users.length : '';
  }

  function renderUsers() {
    var mm = S.mm;
    var host = $('mmUsers');
    if (!mm.usersLoaded) {
      host.innerHTML = '<div class="p-4 text-sm text-base-content/50 flex items-center gap-2"><span class="loading loading-spinner loading-xs"></span>Gebruikers laden...</div>';
      return;
    }
    var q = ($('mmUserSearch').value || '').trim().toLowerCase();
    var list = mm.users.filter(function (u) {
      return !q || ((u.fullName || '') + ' ' + u.email).toLowerCase().indexOf(q) !== -1;
    });
    host.innerHTML = list.length ? list.map(function (u) {
      var checked = mm.access.has(u.id);
      return '<label class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-base-content/5' + (u.isActive === false ? ' opacity-50' : '') + '">'
        + '<input type="checkbox" class="checkbox checkbox-sm checkbox-primary" data-action="mm-user" data-id="' + esc(u.id) + '"' + (checked ? ' checked' : '') + '>'
        + '<span class="min-w-0 flex-1"><span class="block text-sm truncate">' + esc(u.fullName || u.email) + '</span>'
        + (u.fullName ? '<span class="block text-xs text-base-content/50 truncate">' + esc(u.email) + '</span>' : '')
        + '</span>'
        + (u.isActive === false ? '<span class="badge badge-ghost badge-sm">inactief</span>' : '')
        + '</label>';
    }).join('') : '<p class="p-4 text-sm text-base-content/50">Geen gebruikers gevonden.</p>';
    renderAccessCount();
  }

  async function openModuleSettings(id) {
    var m = moduleById(id);
    if (!m) return;
    S.mm = { module: m, users: [], access: new Set(), usersLoaded: false, accessChanged: false };

    $('mmTitle').textContent = m.name;
    $('mmRoute').textContent = m.route;
    $('mmDesc').value = m.description || '';
    $('mmIcon').value = m.icon || '';
    $('mmUserSearch').value = '';
    var sel = $('mmDept');
    sel.innerHTML = '<option value="">Geen (Overige)</option>' + S.departments.map(function (d) {
      return '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>';
    }).join('');
    sel.value = deptOf(m) === NONE ? '' : m.department_id;
    sel.disabled = !S.departmentsReady;
    setMmTab('algemeen');
    renderMmPreview();
    renderUsers();
    renderAccessCount();
    $('moduleModal').showModal();

    try {
      var data = await api('GET', '/admin/api/modules/' + encodeURIComponent(id) + '/users');
      if (!S.mm || S.mm.module.id !== id) return;
      S.mm.users = data.users || [];
      S.mm.access = new Set(S.mm.users.filter(function (u) { return u.hasAccess; }).map(function (u) { return u.id; }));
      S.mm.usersLoaded = true;
      renderUsers();
    } catch (e) {
      $('mmUsers').innerHTML = '<p class="p-4 text-sm text-error">Gebruikers laden mislukt: ' + esc(e.message) + '</p>';
    }
  }

  async function saveModuleSettings() {
    var mm = S.mm;
    if (!mm) return;
    var btn = $('mmSave');
    var icon = $('mmIcon').value.trim().toLowerCase();
    if (icon && !/^[a-z0-9-]{1,40}$/.test(icon)) {
      setMmTab('algemeen');
      toast('Een icoonnaam bestaat enkel uit kleine letters, cijfers en -.', 'error');
      return;
    }
    var body = { icon: icon || null, description: $('mmDesc').value.trim() };
    if (S.departmentsReady) body.department_id = $('mmDept').value || null;

    btn.disabled = true;
    try {
      await api('PUT', '/admin/api/modules/' + encodeURIComponent(mm.module.id) + '/settings', body);
      if (mm.usersLoaded && mm.accessChanged) {
        await api('PUT', '/admin/api/modules/' + encodeURIComponent(mm.module.id) + '/users', { userIds: Array.from(mm.access) });
      }
      $('moduleModal').close();
      S.mm = null;
      await loadOverview();
      render();
      toast('Instellingen bewaard.');
    } catch (e) {
      toast('Bewaren mislukt: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ── Departementen ────────────────────────────────────────────────────────

  function openDeptModal(id) {
    var d = id ? deptById(id) : null;
    S.dm = { id: d ? d.id : null };
    $('dmTitle').textContent = d ? 'Departement wijzigen' : 'Nieuw departement';
    $('dmName').value = d ? d.name : '';
    $('dmIcon').value = d ? (d.icon || '') : '';
    renderIconPicks('dmIconPicks', 'dmIcon');
    refreshIcons();
    $('deptModal').showModal();
    $('dmName').focus();
  }

  async function saveDept() {
    if (!S.dm) return;
    var name = $('dmName').value.trim();
    var icon = $('dmIcon').value.trim().toLowerCase();
    if (!name) { toast('Geef het departement een naam.', 'error'); return; }
    if (icon && !/^[a-z0-9-]{1,40}$/.test(icon)) { toast('Een icoonnaam bestaat enkel uit kleine letters, cijfers en -.', 'error'); return; }
    var btn = $('dmSave');
    btn.disabled = true;
    try {
      var body = { name: name, icon: icon || null };
      if (S.dm.id) {
        await api('PUT', '/admin/api/departments/' + encodeURIComponent(S.dm.id), body);
      } else {
        var res = await api('POST', '/admin/api/departments', body);
        if (res.department) { S.active = res.department.id; store(STORE_KEY, S.active); }
      }
      $('deptModal').close();
      S.dm = null;
      await loadOverview();
      render();
      toast('Departement bewaard.');
    } catch (e) {
      toast('Bewaren mislukt: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteDept(id) {
    var d = deptById(id);
    if (!d) return;
    var n = countIn(id);
    var vraag = 'Departement "' + d.name + '" verwijderen?'
      + (n ? '\n\nDe ' + n + ' module' + (n === 1 ? '' : 's') + ' erin komen onder "Overige". Er verdwijnt geen enkele module.' : '');
    if (!window.confirm(vraag)) return;
    try {
      await api('DELETE', '/admin/api/departments/' + encodeURIComponent(id));
      await loadOverview();
      render();
      toast('Departement verwijderd.');
    } catch (e) {
      toast('Verwijderen mislukt: ' + e.message, 'error');
    }
  }

  async function moveDept(id, dir) {
    var ids = S.departments.map(function (d) { return d.id; });
    var i = ids.indexOf(id);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids[i] = ids[j];
    ids[j] = id;
    S.departments.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
    render();
    try {
      await api('PUT', '/admin/api/departments/order', { ids: ids });
    } catch (e) {
      toast('Volgorde bewaren mislukt: ' + e.message, 'error');
      await loadOverview();
      render();
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;

    // Klikken in het "..."-menu van een departement selecteert het niet.
    if (a === 'select-dept') {
      if (e.target.closest('[data-stop]')) return;
      S.active = el.dataset.id;
      store(STORE_KEY, S.active);
      render();
      return;
    }
    if (a === 'module-settings') { e.preventDefault(); openModuleSettings(el.dataset.id); return; }
    if (a === 'add-dept') { openDeptModal(null); return; }
    if (a === 'edit-dept') { if (document.activeElement) document.activeElement.blur(); openDeptModal(el.dataset.id); return; }
    if (a === 'delete-dept') { if (document.activeElement) document.activeElement.blur(); deleteDept(el.dataset.id); return; }
    if (a === 'move-dept') { if (document.activeElement) document.activeElement.blur(); moveDept(el.dataset.id, Number(el.dataset.dir)); return; }
    if (a === 'close-dialog') { $(el.dataset.dialog).close(); return; }
    if (a === 'mm-tab') { setMmTab(el.dataset.tab); return; }
    if (a === 'mm-save') { saveModuleSettings(); return; }
    if (a === 'dm-save') { saveDept(); return; }
    if (a === 'pick-icon') {
      $(el.dataset.input).value = el.dataset.icon;
      if (el.dataset.input === 'mmIcon') renderMmPreview();
      else { renderIconPicks('dmIconPicks', 'dmIcon'); refreshIcons(); }
      return;
    }
    if (a === 'mm-all') {
      if (!S.mm || !S.mm.usersLoaded) return;
      var aan = el.dataset.value === '1';
      var q = ($('mmUserSearch').value || '').trim().toLowerCase();
      S.mm.users.forEach(function (u) {
        if (q && ((u.fullName || '') + ' ' + u.email).toLowerCase().indexOf(q) === -1) return;
        if (aan) S.mm.access.add(u.id); else S.mm.access.delete(u.id);
      });
      S.mm.accessChanged = true;
      renderUsers();
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.action === 'mm-user' && S.mm) {
      if (el.checked) S.mm.access.add(el.dataset.id); else S.mm.access.delete(el.dataset.id);
      S.mm.accessChanged = true;
      renderAccessCount();
    }
  });

  document.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'homeSearch') { S.search = e.target.value.trim(); renderModules(); refreshIcons(); }
    else if (id === 'mmUserSearch') renderUsers();
    else if (id === 'mmIcon') renderMmPreview();
    else if (id === 'dmIcon') { renderIconPicks('dmIconPicks', 'dmIcon'); refreshIcons(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.target.id === 'dmName' || e.target.id === 'dmIcon')) { e.preventDefault(); saveDept(); }
    // "/" springt naar het zoekveld, zoals op veel dashboards.
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      $('homeSearch').focus();
    }
  });

  init();
})();
