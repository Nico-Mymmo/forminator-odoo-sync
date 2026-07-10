// Mini-apps — client-side logica
// Vanilla JS, data-action patroon + event delegation, ES6 template literals.

lucide.createIcons();

// ====== State ======

var apps = [];               // laatst geladen lijst uit GET /api/apps
var colleagues = null;       // cache van GET /api/apps/colleagues
var currentApp = null;       // metadata van de app die open staat in appModal (bewerken)
var currentAppContent = '';  // laatst opgehaalde/opgeslagen HTML-inhoud (RAUW, zonder shim)
var codeEditor = null;       // CodeMirror-instance (lazy, 1x per pagina-load, value wordt herladen)
var appErrors = [];          // JS-fouten die de draaiende mini-app naar ons doorstuurt (postMessage)
var activeFrame = null;      // { frame, banner } -- welke iframe/foutbanner-paar nu actief is
                              // (appModal-bewerkmodus OF de kale appFullscreen-viewer, nooit beide)

// ====== Helpers ======

function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  var cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
  var toast = document.createElement('div');
  toast.className = 'alert ' + cls + ' text-sm py-2 px-4';
  var span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  container.appendChild(toast);
  if (type !== 'error') {
    setTimeout(function() { toast.remove(); }, 3000);
  } else {
    var close = document.createElement('button');
    close.className = 'btn btn-ghost btn-xs ml-2';
    close.textContent = '✕';
    close.addEventListener('click', function() { toast.remove(); });
    toast.appendChild(close);
  }
}

// ====== Mini-app instrumentatie (preview-/fullscreen-iframe) ======
//
// Beide iframes (de kleine "Bewerken"-modal en de kale fullscreen-viewer) draaien
// met sandbox="allow-scripts allow-forms allow-modals allow-popups" (bewust ZONDER
// allow-same-origin -- dat zou de sandbox grotendeels ongedaan maken, omdat de
// iframe dan hetzelfde origin als deze Operations Manager-pagina zou krijgen).
// Twee gevolgen daarvan lossen we hier op:
//  1. localStorage/sessionStorage zijn niet beschikbaar in een opaque-origin iframe
//     (Chrome gooit een SecurityError) -- we geven een in-memory polyfill mee zodat
//     apps die dit gebruiken (bv. een theme-toggle) niet meer crashen. Niet-persistent
//     tussen herladen, maar dat is een aanvaardbare afweging tegenover de sandbox.
//  2. JS-fouten in de iframe verschijnen alleen in de devtools-console van de
//     gebruiker, niet zichtbaar in de UI. We injecteren een kleine shim die
//     window.onerror / unhandledrejection doorstuurt via postMessage (werkt ook
//     vanuit een opaque origin, in tegenstelling tot directe DOM-toegang) zodat we
//     ze als banner boven de app kunnen tonen.
//
// De shim wordt uitsluitend toegevoegd aan wat we in de iframe laden -- de
// opgeslagen/bewerkte inhoud (currentAppContent, CodeMirror-waarde) blijft altijd
// de rauwe, ongewijzigde HTML van de gebruiker.

var MINI_APP_SHIM = '<script>(function(){'
  + 'function memStore(){var s={};return{'
  +   'getItem:function(k){return Object.prototype.hasOwnProperty.call(s,k)?s[k]:null;},'
  +   'setItem:function(k,v){s[k]=String(v);},'
  +   'removeItem:function(k){delete s[k];},'
  +   'clear:function(){s={};},'
  +   'key:function(i){return Object.keys(s)[i]||null;},'
  +   'get length(){return Object.keys(s).length;}'
  + '};}'
  + 'try{window.localStorage&&window.localStorage.getItem;}catch(e){'
  +   'try{Object.defineProperty(window,"localStorage",{value:memStore(),configurable:true});}catch(e2){}'
  + '}'
  + 'try{window.sessionStorage&&window.sessionStorage.getItem;}catch(e){'
  +   'try{Object.defineProperty(window,"sessionStorage",{value:memStore(),configurable:true});}catch(e2){}'
  + '}'
  + 'function relay(kind,detail){try{window.parent.postMessage({__miniAppError:true,kind:kind,detail:detail},"*");}catch(e){}}'
  + 'window.addEventListener("error",function(e){relay("error",{message:e.message,line:e.lineno,col:e.colno});});'
  + 'window.addEventListener("unhandledrejection",function(e){var r=e.reason;relay("promise",{message:(r&&(r.message||String(r)))||"Onbekende fout"});});'
  + '})();</'
  + 'script>';

function instrumentAppHtml(html) {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, function(m) { return m + MINI_APP_SHIM; });
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, function(m) { return m + MINI_APP_SHIM; });
  }
  return MINI_APP_SHIM + html;
}

function resetAppErrors(bannerEl) {
  appErrors = [];
  if (!bannerEl) return;
  bannerEl.classList.add('hidden');
  bannerEl.innerHTML = '';
}

function renderAppErrors(bannerEl) {
  if (!bannerEl) return;
  if (appErrors.length === 0) {
    bannerEl.classList.add('hidden');
    return;
  }
  bannerEl.classList.remove('hidden');
  bannerEl.innerHTML = appErrors.map(function(msg) {
    return '<div class="flex items-start gap-1.5 py-0.5">'
      + '<i data-lucide="triangle-alert" class="w-3 h-3 mt-0.5 shrink-0"></i>'
      + '<span>' + escapeHtml(msg) + '</span>'
      + '</div>';
  }).join('');
  lucide.createIcons();
}

window.addEventListener('message', function(e) {
  if (!activeFrame || e.source !== activeFrame.frame.contentWindow) return;
  var data = e.data;
  if (!data || !data.__miniAppError) return;

  var d = data.detail || {};
  var text = data.kind === 'promise'
    ? ('Onverwerkte promise-fout: ' + (d.message || 'onbekend'))
    : ((d.message || 'Fout') + (d.line ? (' (regel ' + d.line + (d.col ? ':' + d.col : '') + ')') : ''));

  appErrors.push(text);
  if (appErrors.length > 20) appErrors.shift();
  renderAppErrors(activeFrame.banner);
});

async function apiFetch(url, options) {
  var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Niet ingelogd');
  }
  return res;
}

async function apiJson(url, options) {
  var res = await apiFetch(url, options);
  var body = await res.json();
  if (!res.ok || body.success === false) {
    throw new Error(body.error || ('Fout ' + res.status));
  }
  return body.data;
}

// ====== Navbar ======

async function renderNavbar() {
  var response = await apiFetch('/api/auth/me');
  var data = await response.json();
  if (!data.user) { window.location.href = '/'; return; }
  if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
}

// Extra "Terug"-link naast de Modules-dropdown in de GEDEELDE navbar, enkel
// zichtbaar tijdens de kale fullscreen-viewer. navbar.js zelf blijft de enige
// bron van navbar-HTML (CLAUDE.md-regel) -- dit voegt clientside enkel een
// tijdelijk element toe aan de al gerenderde navbar, geen eigen navbar-kopie.
function appendNavbarBackLink(container) {
  if (document.getElementById('miniAppNavbarBack')) return;
  var a = document.createElement('a');
  a.id = 'miniAppNavbarBack';
  // Terug naar de mini-apps-lijst (niet de Operations Manager-homepage).
  // href is een fallback (bv. midden-klik/nieuw tabblad); de gewone klik
  // sluit de fullscreen-viewer in-page, zonder herladen.
  a.href = '/mini-apps';
  a.className = 'btn btn-sm btn-ghost gap-2 font-normal';
  a.innerHTML = '<i data-lucide="arrow-left" class="w-4 h-4"></i> Terug';
  a.addEventListener('click', function(e) {
    e.preventDefault();
    closeAppFullscreen();
  });
  container.appendChild(a);
  lucide.createIcons();
}

function insertNavbarBackLink() {
  var container = document.querySelector('#navbar header > div:first-child');
  if (container) {
    appendNavbarBackLink(container);
    return;
  }
  // Navbar is (nog) niet geinjecteerd -- wachten tot renderNavbar() klaar is.
  var navbarEl = document.getElementById('navbar');
  if (!navbarEl) return;
  var observer = new MutationObserver(function() {
    var c = document.querySelector('#navbar header > div:first-child');
    if (c) {
      appendNavbarBackLink(c);
      observer.disconnect();
    }
  });
  observer.observe(navbarEl, { childList: true, subtree: true });
}

function removeNavbarBackLink() {
  var el = document.getElementById('miniAppNavbarBack');
  if (el) el.remove();
}

// ====== Lijst ======

function visibilityBadge(app) {
  if (app.visibility === 'shared') {
    return `<span class="badge badge-sm gap-1"><i data-lucide="globe" class="w-3 h-3"></i> Gedeeld</span>`;
  }
  if (app.visibility === 'specific') {
    var n = (app.shared_user_ids || []).length;
    return `<span class="badge badge-sm gap-1"><i data-lucide="user-check" class="w-3 h-3"></i> Specifiek (${n})</span>`;
  }
  return `<span class="badge badge-sm badge-ghost gap-1"><i data-lucide="lock" class="w-3 h-3"></i> Privé</span>`;
}

var ADD_APP_TILE = `
  <button type="button" class="card border-2 border-dashed border-base-300 bg-transparent hover:border-primary hover:bg-base-100 transition-colors flex items-center justify-center min-h-[132px]" data-action="openUploadModal">
    <div class="flex flex-col items-center gap-1.5 text-base-content/50 hover:text-primary">
      <i data-lucide="plus" class="w-6 h-6"></i>
      <span class="text-sm font-medium">Nieuwe mini-app</span>
    </div>
  </button>`;

function renderAppCard(app) {
  var desc = app.description
    ? `<p class="text-xs text-base-content/60 mt-1 line-clamp-2">${escapeHtml(app.description)}</p>`
    : '';
  var ownerLine = app.isOwner
    ? ''
    : `<p class="text-xs text-base-content/40 mt-1">van ${escapeHtml(app.ownerName || 'onbekend')}</p>`;

  // "Openen" = kale fullscreen-viewer voor iedereen (eigenaar en gedeeld-met-mij).
  // "Bewerken" = de kleine modal met tabs (Voorbeeld/Code/Instellingen) -- enkel eigenaar.
  var editButton = app.isOwner
    ? `<button class="btn btn-secondary btn-sm gap-2 flex-1" data-action="openApp" data-id="${app.id}" title="Bewerken">
         <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
         Bewerken
       </button>`
    : '';

  return `
    <div class="card bg-base-100 shadow-sm border border-base-200 hover:border-primary/40 transition-colors h-full">
      <div class="card-body p-4 h-full">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-sm truncate" title="${escapeHtml(app.title)}">${escapeHtml(app.title)}</h3>
          ${visibilityBadge(app)}
        </div>
        ${desc}
        ${ownerLine}
        <div class="card-actions mt-auto pt-3 flex-nowrap">
          <button class="btn btn-primary btn-sm gap-2 flex-1" data-action="openAppFullscreen" data-id="${app.id}">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            Openen
          </button>
          ${editButton}
          <button class="btn btn-ghost btn-sm btn-square" data-action="copyAppLink" data-id="${app.id}" title="Directe link kopiëren">
            <i data-lucide="link" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function renderAppLists() {
  var own = apps.filter(function(a) { return a.isOwner; });
  var shared = apps.filter(function(a) { return !a.isOwner; });

  var ownEl = document.getElementById('ownApps');
  var sharedEl = document.getElementById('sharedApps');

  ownEl.innerHTML = own.map(renderAppCard).join('') + ADD_APP_TILE;

  sharedEl.innerHTML = shared.length
    ? shared.map(renderAppCard).join('')
    : `<p class="text-sm text-base-content/40 col-span-full">Nog niets gedeeld met jou.</p>`;

  lucide.createIcons();
}

async function loadApps() {
  try {
    apps = await apiJson('/mini-apps/api/apps');
    renderAppLists();
  } catch (err) {
    showToast('Lijst ophalen mislukt: ' + err.message, 'error');
  }
}

async function loadColleagues() {
  if (colleagues) return colleagues;
  colleagues = await apiJson('/mini-apps/api/apps/colleagues');
  return colleagues;
}

function renderColleagueCheckboxes(container, selectedIds) {
  var selected = new Set(selectedIds || []);
  if (!colleagues || colleagues.length === 0) {
    container.innerHTML = `<span class="text-xs text-base-content/40">Geen andere gebruikers gevonden.</span>`;
    return;
  }
  container.innerHTML = colleagues.map(function(c) {
    var checked = selected.has(c.id) ? ' checked' : '';
    return `
      <label class="flex items-center gap-2 text-sm cursor-pointer py-0.5">
        <input type="checkbox" class="checkbox checkbox-xs colleague-checkbox" data-colleague-id="${c.id}"${checked} />
        ${escapeHtml(c.full_name || c.email)}
      </label>`;
  }).join('');
}

function getCheckedColleagueIds(container) {
  return Array.from(container.querySelectorAll('.colleague-checkbox:checked')).map(function(cb) {
    return cb.dataset.colleagueId;
  });
}

function toggleColleaguesWrap(radioName, wrapId) {
  var value = document.querySelector(`input[name="${radioName}"]:checked`);
  var wrap = document.getElementById(wrapId);
  if (value && value.value === 'specific') {
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }
}

// ====== Upload-modal ======

async function openUploadModal() {
  document.getElementById('uploadTitle').value = '';
  document.getElementById('uploadDescription').value = '';
  document.getElementById('uploadFile').value = '';
  document.querySelector('input[name="uploadVisibility"][value="private"]').checked = true;
  document.getElementById('uploadColleaguesWrap').classList.add('hidden');

  document.getElementById('uploadModal').showModal();
  lucide.createIcons();

  try {
    await loadColleagues();
    renderColleagueCheckboxes(document.getElementById('uploadColleaguesList'), []);
  } catch (err) {
    showToast('Collega-lijst ophalen mislukt: ' + err.message, 'error');
  }
}

function closeUploadModal() {
  document.getElementById('uploadModal').close();
}

async function submitUpload() {
  var title = document.getElementById('uploadTitle').value.trim();
  var description = document.getElementById('uploadDescription').value.trim();
  var file = document.getElementById('uploadFile').files[0];
  var visibility = document.querySelector('input[name="uploadVisibility"]:checked').value;
  var sharedUserIds = visibility === 'specific'
    ? getCheckedColleagueIds(document.getElementById('uploadColleaguesList'))
    : [];

  if (!title) { showToast('Vul een titel in.', 'error'); return; }
  if (!file) { showToast('Kies een .html-bestand.', 'error'); return; }

  var btn = document.getElementById('uploadSubmitBtn');
  btn.disabled = true;

  try {
    var formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('visibility', visibility);
    formData.append('sharedUserIds', JSON.stringify(sharedUserIds));
    formData.append('file', file);

    await apiJson('/mini-apps/api/apps', { method: 'POST', body: formData });
    showToast('Mini-app geüpload.', 'success');
    closeUploadModal();
    await loadApps();
  } catch (err) {
    showToast('Uploaden mislukt: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ====== Link kopieren ======

function buildAppLink(id) {
  return location.origin + '/mini-apps?app=' + encodeURIComponent(id);
}

function copyAppLink(id) {
  var link = buildAppLink(id);
  navigator.clipboard.writeText(link).then(function() {
    showToast('Link gekopieerd — klaar om te bookmarken of te delen', 'success');
  }, function() {
    showToast('Kopiëren mislukt. Link: ' + link, 'error');
  });
}

// ====== Kale fullscreen-viewer ("Openen" + deeplink) ======
//
// Geen tabs, geen instellingen -- gewoon de app zelf, onder de vaste navbar
// (die een extra "Terug"-link krijgt zolang dit open staat). Dit is de weg voor
// iedereen die een "af" mini-app wil GEBRUIKEN, of het nu de eigenaar is of
// iemand waarmee ze gedeeld is. Bewerken/tweaken gaat via de aparte modal
// (openApp / knop "Bewerken", enkel zichtbaar voor de eigenaar).

async function openAppFullscreen(id) {
  try {
    var contentResult = await apiJson(`/mini-apps/api/apps/${id}/content`);

    var frame = document.getElementById('appFullscreenFrame');
    var banner = document.getElementById('appFullscreenErrorBanner');
    activeFrame = { frame: frame, banner: banner };
    resetAppErrors(banner);
    frame.srcdoc = instrumentAppHtml(contentResult.content);

    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('appFullscreen').classList.remove('hidden');
    insertNavbarBackLink();

    history.replaceState(null, '', '/mini-apps?app=' + encodeURIComponent(id));
  } catch (err) {
    showToast('App openen mislukt: ' + err.message, 'error');
  }
}

function closeAppFullscreen() {
  document.getElementById('appFullscreen').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
  document.getElementById('appFullscreenFrame').srcdoc = 'about:blank';
  removeNavbarBackLink();
  activeFrame = null;
  history.replaceState(null, '', '/mini-apps');
}

// ====== App-modal ("Bewerken" -- enkel eigenaar: draaien + tweaken + instellingen) ======

function ensureCodeEditor() {
  if (codeEditor) return codeEditor;
  codeEditor = CodeMirror(document.getElementById('appCodeEditor'), {
    mode: 'htmlmixed',
    theme: 'default',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    value: ''
  });
  return codeEditor;
}

function switchAppTab(tab) {
  document.querySelectorAll('[data-app-tab]').forEach(function(btn) {
    btn.classList.toggle('tab-active', btn.dataset.appTab === tab);
  });
  document.getElementById('appPanePreview').classList.toggle('hidden', tab !== 'preview');
  document.getElementById('appPaneCode').classList.toggle('hidden', tab !== 'code');
  document.getElementById('appPaneCode').classList.toggle('flex', tab === 'code');
  document.getElementById('appPaneSettings').classList.toggle('hidden', tab !== 'settings');

  if (tab === 'code') {
    var cm = ensureCodeEditor();
    cm.setValue(currentAppContent);
    setTimeout(function() { cm.refresh(); }, 0);
  }
}

async function openApp(id) {
  try {
    var meta = await apiJson(`/mini-apps/api/apps/${id}`);
    var contentResult = await apiJson(`/mini-apps/api/apps/${id}/content`);

    currentApp = meta;
    currentAppContent = contentResult.content;

    document.getElementById('appModalTitle').textContent = meta.title;
    document.getElementById('appModalSubtitle').textContent = meta.description || '';

    document.getElementById('appTabCode').classList.toggle('hidden', !meta.isOwner);
    document.getElementById('appTabSettings').classList.toggle('hidden', !meta.isOwner);

    var frame = document.getElementById('appFrame');
    var banner = document.getElementById('appErrorBanner');
    activeFrame = { frame: frame, banner: banner };
    resetAppErrors(banner);
    frame.srcdoc = instrumentAppHtml(currentAppContent);

    if (meta.isOwner) {
      document.getElementById('settingsTitle').value = meta.title;
      document.getElementById('settingsDescription').value = meta.description || '';
      var radio = document.querySelector(`input[name="settingsVisibility"][value="${meta.visibility}"]`);
      if (radio) radio.checked = true;
      toggleColleaguesWrap('settingsVisibility', 'settingsColleaguesWrap');
      try {
        await loadColleagues();
        renderColleagueCheckboxes(document.getElementById('settingsColleaguesList'), meta.shared_user_ids || []);
      } catch (err) {
        showToast('Collega-lijst ophalen mislukt: ' + err.message, 'error');
      }
    }

    document.getElementById('appCodeStatus').textContent = `v${meta.version}`;
    switchAppTab('preview');
    document.getElementById('appModal').showModal();
    lucide.createIcons();
  } catch (err) {
    showToast('App openen mislukt: ' + err.message, 'error');
  }
}

function closeAppModal() {
  document.getElementById('appModal').close();
  currentApp = null;
  currentAppContent = '';
  resetAppErrors(document.getElementById('appErrorBanner'));
  document.getElementById('appFrame').srcdoc = 'about:blank';
  activeFrame = null;
}

async function saveAppCode() {
  if (!currentApp) return;
  var cm = ensureCodeEditor();
  var content = cm.getValue();

  try {
    var updated = await apiJson(`/mini-apps/api/apps/${currentApp.id}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    });
    currentApp = Object.assign(currentApp, updated);
    currentAppContent = content;
    var banner = document.getElementById('appErrorBanner');
    resetAppErrors(banner);
    document.getElementById('appFrame').srcdoc = instrumentAppHtml(currentAppContent);
    document.getElementById('appCodeStatus').textContent = `v${updated.version} — opgeslagen`;
    showToast('Opgeslagen en herladen.', 'success');
    await loadApps();
  } catch (err) {
    showToast('Opslaan mislukt: ' + err.message, 'error');
  }
}

async function saveAppSettings() {
  if (!currentApp) return;

  var title = document.getElementById('settingsTitle').value.trim();
  var description = document.getElementById('settingsDescription').value.trim();
  var visibility = document.querySelector('input[name="settingsVisibility"]:checked').value;
  var sharedUserIds = visibility === 'specific'
    ? getCheckedColleagueIds(document.getElementById('settingsColleaguesList'))
    : [];

  if (!title) { showToast('Titel mag niet leeg zijn.', 'error'); return; }

  try {
    var updated = await apiJson(`/mini-apps/api/apps/${currentApp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, visibility, sharedUserIds })
    });
    currentApp = Object.assign(currentApp, updated);
    document.getElementById('appModalTitle').textContent = updated.title;
    document.getElementById('appModalSubtitle').textContent = updated.description || '';
    showToast('Instellingen opgeslagen.', 'success');
    await loadApps();
  } catch (err) {
    showToast('Opslaan mislukt: ' + err.message, 'error');
  }
}

async function deleteApp() {
  if (!currentApp) return;
  if (!confirm(`Deze mini-app ("${currentApp.title}") definitief verwijderen?`)) return;

  try {
    await apiJson(`/mini-apps/api/apps/${currentApp.id}`, { method: 'DELETE' });
    showToast('App verwijderd.', 'success');
    closeAppModal();
    await loadApps();
  } catch (err) {
    showToast('Verwijderen mislukt: ' + err.message, 'error');
  }
}

// ====== Event delegation ======

document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (el) {
    var action = el.dataset.action;
    if (action === 'openUploadModal') openUploadModal();
    else if (action === 'closeUploadModal') closeUploadModal();
    else if (action === 'submitUpload') submitUpload();
    else if (action === 'openAppFullscreen') openAppFullscreen(el.dataset.id);
    else if (action === 'openApp') openApp(el.dataset.id);
    else if (action === 'copyAppLink') copyAppLink(el.dataset.id);
    else if (action === 'copyCurrentAppLink') { if (currentApp) copyAppLink(currentApp.id); }
    else if (action === 'closeAppModal') closeAppModal();
    else if (action === 'saveAppCode') saveAppCode();
    else if (action === 'saveAppSettings') saveAppSettings();
    else if (action === 'deleteApp') deleteApp();
  }

  var tabBtn = e.target.closest('[data-app-tab]');
  if (tabBtn) switchAppTab(tabBtn.dataset.appTab);
});

document.addEventListener('change', function(e) {
  if (e.target.name === 'uploadVisibility') toggleColleaguesWrap('uploadVisibility', 'uploadColleaguesWrap');
  if (e.target.name === 'settingsVisibility') toggleColleaguesWrap('settingsVisibility', 'settingsColleaguesWrap');
});

// Escape sluit de kale fullscreen-viewer (die geen eigen sluit-knop heeft).
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('appFullscreen').classList.contains('hidden')) closeAppFullscreen();
});

// ====== Init ======

renderNavbar();
loadApps();

// Directe/bookmarkbare link: /mini-apps?app=<id> opent die app meteen fullscreen,
// onafhankelijk van de lijst -- ook voor de eigenaar (bewerken gaat via de losse
// "Bewerken"-knop in de lijst, niet via de deeplink).
(function openFromQueryString() {
  var appId = new URLSearchParams(location.search).get('app');
  if (appId) openAppFullscreen(appId);
})();
