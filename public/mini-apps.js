// Mini-apps — client-side logica
// Vanilla JS, data-action patroon + event delegation, ES6 template literals.

lucide.createIcons();

// ====== State ======

var apps = [];               // laatst geladen lijst uit GET /api/apps
var favorites = [];          // laatst geladen, geordende favorietenbalk uit GET /api/apps/favorites
var colleagues = null;       // cache van GET /api/apps/colleagues
var currentUser = null;      // { id, name, email } van de ingelogde gebruiker (via renderNavbar), gebruikt voor buildUserShim()
var isAdmin = false;         // via renderNavbar() -- bepaalt of de Chat-kanalen-beheer-UI zichtbaar is (server-side ook afgedwongen in routes.js)
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
//  3. localStorage/sessionStorage zijn dus NIET gedeeld tussen gebruikers en NIET
//     persistent na een herlaad. Voor apps die kleine data willen bewaren/delen
//     over gebruikers heen (bv. een teller, een gedeelde checklist) injecteren
//     we ook window.sharedStorage (get/set/remove/list, Promise-based) -- praat
//     via postMessage met deze pagina, die de echte opslag doet via
//     GET/PUT/DELETE /mini-apps/api/apps/:id/storage(/:key), zie
//     handleMiniAppStorageRequest() hieronder en
//     src/modules/mini-apps/lib/storage.js voor de quota's.
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
  + 'function miniAppStorageBridge(){var reqId=0,pending={};'
  +   'function send(action,extra){return new Promise(function(resolve,reject){'
  +     'var id=Date.now()+"_"+(reqId++);'
  +     'pending[id]={resolve:resolve,reject:reject};'
  +     'setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error("sharedStorage: timeout"));}},15000);'
  +     'var msg={__miniAppStorage:true,id:id,action:action};'
  +     'for(var k in extra){msg[k]=extra[k];}'
  +     'try{window.parent.postMessage(msg,"*");}catch(e){delete pending[id];reject(e);}'
  +   '});}'
  +   'window.addEventListener("message",function(e){'
  +     'var d=e.data;if(!d||!d.__miniAppStorageResult)return;'
  +     'var p=pending[d.id];if(!p)return;delete pending[d.id];'
  +     'if(d.ok)p.resolve(d.value);else p.reject(new Error(d.error||"sharedStorage-fout"));'
  +   '});'
  +   'window.platform={'
  +     'listColleagues:function(){return send("listColleagues",{});},'
  +     'notify:function(to,subject,message){return send("notify",{to:to,subject:subject,message:message});},'
  +     'listChatChannels:function(){return send("listChatChannels",{});},'
  +     'sendChat:function(channelId,message){return send("sendChat",{channelId:channelId,message:message});},'
  +     'schedule:{'
  +       'create:function(config){return send("scheduleCreate",{config:config});},'
  +       'list:function(){return send("scheduleList",{});},'
  +       'update:function(id,config){return send("scheduleUpdate",{scheduleId:id,config:config});},'
  +       'remove:function(id){return send("scheduleDelete",{scheduleId:id});},'
  +       'runNow:function(id){return send("scheduleRunNow",{scheduleId:id});}'
  +     '},'
  +     'condition:{'
  +       'create:function(config){return send("conditionCreate",{config:config});},'
  +       'list:function(){return send("conditionList",{});},'
  +       'update:function(id,config){return send("conditionUpdate",{taskId:id,config:config});},'
  +       'remove:function(id){return send("conditionDelete",{taskId:id});},'
  +       'runNow:function(id){return send("conditionRunNow",{taskId:id});}'
  +     '}'
  +   '};'
  +   'return{'
  +     'get:function(key){return send("get",{key:key});},'
  +     'set:function(key,value){return send("set",{key:key,value:String(value)});},'
  +     'remove:function(key){return send("remove",{key:key});},'
  +     'list:function(){return send("list",{});},'
  +     'usage:function(){return send("usage",{});},'
  +     'listItems:function(collection){return send("listItems",{collection:collection});},'
  +     'addItem:function(collection,value){return send("addItem",{collection:collection,value:String(value)});},'
  +     'updateItem:function(collection,itemId,value){return send("updateItem",{collection:collection,itemId:itemId,value:String(value)});},'
  +     'removeItem:function(collection,itemId){return send("removeItem",{collection:collection,itemId:itemId});}'
  +   '};'
  + '}'
  + 'try{Object.defineProperty(window,"sharedStorage",{value:miniAppStorageBridge(),writable:true,configurable:true});}'
  + 'catch(e){try{window.sharedStorage=miniAppStorageBridge();}catch(e2){}}'
  + '})();</'
  + 'script>';

// Zet het daisyUI-thema van DEZE pagina (data-theme, localStorage
// 'selectedTheme') door naar de iframe, vóór de app zelf iets laadt --
// een app die ons designsysteem (Tailwind + daisyUI) gebruikt en thema-
// bewuste kleuren (bg-base-100, text-base-content, ...) volgt hierdoor
// automatisch het thema dat de gebruiker zelf heeft ingesteld.
function buildThemeShim() {
  var theme = localStorage.getItem('selectedTheme') || 'light';
  return '<script>document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');</' + 'script>';
}

// Injecteert de ingelogde gebruiker als read-only window.currentUser -- vers
// bij elke load (net als het thema hierboven), NOOIT opgeslagen in de
// app-inhoud zelf. currentUser kan hier nog null zijn als renderNavbar() nog
// niet is teruggekomen (race bij de eerste paint); apps moeten daar rekening
// mee houden (zie BUILD_PROMPT).
function buildUserShim() {
  return '<script>window.currentUser = ' + JSON.stringify(currentUser) + ';</' + 'script>';
}

function instrumentAppHtml(html) {
  var shim = buildThemeShim() + buildUserShim() + MINI_APP_SHIM;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, function(m) { return m + shim; });
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, function(m) { return m + shim; });
  }
  return shim + html;
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
  if (!data) return;

  if (data.__miniAppError) {
    var d = data.detail || {};
    var text = data.kind === 'promise'
      ? ('Onverwerkte promise-fout: ' + (d.message || 'onbekend'))
      : ((d.message || 'Fout') + (d.line ? (' (regel ' + d.line + (d.col ? ':' + d.col : '') + ')') : ''));

    appErrors.push(text);
    if (appErrors.length > 20) appErrors.shift();
    renderAppErrors(activeFrame.banner);
    return;
  }

  if (data.__miniAppStorage) {
    handleMiniAppStorageRequest(data);
  }
});

// ====== Gedeelde opslag — brug tussen iframe (window.sharedStorage) en API ======
//
// De iframe praat NOOIT rechtstreeks met /mini-apps/api/... (opaque origin,
// geen sessie-cookie beschikbaar) -- alle get/set/remove/list-aanvragen komen
// hier binnen via postMessage (zie window.sharedStorage in MINI_APP_SHIM) en
// worden hier, met de sessie van DEZE pagina, doorgezet naar de echte API.
// Isolatie per app: altijd activeFrame.appId gebruiken, nooit een appId uit
// het bericht zelf overnemen (een gecompromitteerde iframe zou anders een
// andere app-id kunnen invullen en bij een andere app's opslag kunnen).
async function handleMiniAppStorageRequest(data) {
  var frame = activeFrame;
  function reply(ok, value, error) {
    if (!frame) return;
    try {
      frame.frame.contentWindow.postMessage(
        { __miniAppStorageResult: true, id: data.id, ok: ok, value: value, error: error },
        '*'
      );
    } catch (_err) { /* iframe intussen weg -- niets meer te doen */ }
  }

  var appId = frame && frame.appId;
  if (!appId) { reply(false, null, 'Geen actieve app.'); return; }

  var base = `/mini-apps/api/apps/${appId}/storage`;
  var collBase = `${base}/collections/${encodeURIComponent(data.collection)}`;
  try {
    if (data.action === 'list') {
      reply(true, await apiJson(base));
    } else if (data.action === 'get') {
      var result = await apiJson(`${base}/${encodeURIComponent(data.key)}`);
      reply(true, result.value);
    } else if (data.action === 'set') {
      await apiJson(`${base}/${encodeURIComponent(data.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: data.value })
      });
      reply(true, null);
    } else if (data.action === 'remove') {
      await apiJson(`${base}/${encodeURIComponent(data.key)}`, { method: 'DELETE' });
      reply(true, null);
    } else if (data.action === 'usage') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/storage-usage`));
    } else if (data.action === 'listItems') {
      reply(true, await apiJson(collBase));
    } else if (data.action === 'addItem') {
      reply(true, await apiJson(collBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: data.value })
      }));
    } else if (data.action === 'updateItem') {
      reply(true, await apiJson(`${collBase}/${encodeURIComponent(data.itemId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: data.value })
      }));
    } else if (data.action === 'removeItem') {
      await apiJson(`${collBase}/${encodeURIComponent(data.itemId)}`, { method: 'DELETE' });
      reply(true, null);
    } else if (data.action === 'listColleagues') {
      reply(true, await apiJson('/mini-apps/api/apps/colleagues'));
    } else if (data.action === 'notify') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: data.to, subject: data.subject, message: data.message })
      }));
    } else if (data.action === 'listChatChannels') {
      reply(true, await apiJson('/mini-apps/api/apps/chat-channels'));
    } else if (data.action === 'sendChat') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/chat-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: data.channelId, message: data.message })
      }));
    } else if (data.action === 'scheduleList') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/schedules`));
    } else if (data.action === 'scheduleCreate') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.config)
      }));
    } else if (data.action === 'scheduleUpdate') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/schedules/${encodeURIComponent(data.scheduleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.config)
      }));
    } else if (data.action === 'scheduleDelete') {
      await apiJson(`/mini-apps/api/apps/${appId}/schedules/${encodeURIComponent(data.scheduleId)}`, { method: 'DELETE' });
      reply(true, null);
    } else if (data.action === 'scheduleRunNow') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/schedules/${encodeURIComponent(data.scheduleId)}/run-now`, { method: 'POST' }));
    } else if (data.action === 'conditionList') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/condition-tasks`));
    } else if (data.action === 'conditionCreate') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/condition-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.config)
      }));
    } else if (data.action === 'conditionUpdate') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/condition-tasks/${encodeURIComponent(data.taskId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.config)
      }));
    } else if (data.action === 'conditionDelete') {
      await apiJson(`/mini-apps/api/apps/${appId}/condition-tasks/${encodeURIComponent(data.taskId)}`, { method: 'DELETE' });
      reply(true, null);
    } else if (data.action === 'conditionRunNow') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/condition-tasks/${encodeURIComponent(data.taskId)}/run-now`, { method: 'POST' }));
    } else {
      reply(false, null, 'Onbekende actie: ' + data.action);
    }
  } catch (err) {
    reply(false, null, err.message || 'sharedStorage-fout');
  }
}

// ====== Instellingen-tab: quotum-indicator voor gedeelde opslag ======

async function refreshStorageUsage(appId) {
  var label = document.getElementById('settingsStorageLabel');
  var count = document.getElementById('settingsStorageCount');
  var bar = document.getElementById('settingsStorageBar');
  if (!label || !count || !bar) return;

  label.textContent = 'Laden…';
  count.textContent = '';
  try {
    var usage = await apiJson(`/mini-apps/api/apps/${appId}/storage-usage`);
    var usedKb = (usage.usedBytes / 1024).toFixed(1);
    var maxMb = (usage.maxBytes / 1024 / 1024).toFixed(0);
    label.textContent = `${usedKb} KB / ${maxMb} MB gebruikt`;
    count.textContent = `${usage.objectCount} / ${usage.maxObjects} items`;
    bar.max = usage.maxBytes;
    bar.value = usage.usedBytes;
  } catch (err) {
    label.textContent = 'Opslag-info niet beschikbaar';
  }
}

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
  currentUser = { id: data.user.id, name: data.user.full_name || data.user.username, email: data.user.email };
  isAdmin = data.user.role === 'admin';
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
  a.className = 'btn btn-xs btn-ghost border border-base-300 gap-1.5 font-normal text-base-content/70 hover:text-base-content hover:border-primary/40';
  a.innerHTML = '<i data-lucide="arrow-left" class="w-3 h-3"></i> Terug';
  a.addEventListener('click', function(e) {
    e.preventDefault();
    closeAppFullscreen();
  });
  // Als eerste (meest linkse) blokje in de favorietenlijst -- zo verspringen
  // de utility-knoppen en de avatar rechts ervan niet van positie.
  container.insertBefore(a, container.firstChild);
  var divider = document.getElementById('navbarFavoritesDivider');
  if (divider) divider.classList.remove('hidden');
  lucide.createIcons();
}

function insertNavbarBackLink() {
  var container = document.getElementById('navbarFavorites');
  if (container) {
    appendNavbarBackLink(container);
    return;
  }
  // Navbar is (nog) niet geinjecteerd -- wachten tot renderNavbar() klaar is.
  var navbarEl = document.getElementById('navbar');
  if (!navbarEl) return;
  var observer = new MutationObserver(function() {
    var c = document.getElementById('navbarFavorites');
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
  var container = document.getElementById('navbarFavorites');
  var divider = document.getElementById('navbarFavoritesDivider');
  if (container && divider && container.children.length === 0) {
    divider.classList.add('hidden');
  }
}

// ====== Iconen ======
//
// Moet in sync blijven met VALID_ICONS in src/modules/mini-apps/routes.js
// (dezelfde iconnamen, hier met een Nederlands label voor de dropdown).

var ICON_OPTIONS = [
  { value: 'puzzle', label: 'Puzzelstuk (standaard)' },
  { value: 'calculator', label: 'Rekenmachine' },
  { value: 'wrench', label: 'Moersleutel' },
  { value: 'gauge', label: 'Meter' },
  { value: 'file-text', label: 'Document' },
  { value: 'table', label: 'Tabel' },
  { value: 'list-checks', label: 'Checklist' },
  { value: 'clipboard-list', label: 'Klembord' },
  { value: 'dollar-sign', label: 'Dollar' },
  { value: 'percent', label: 'Percentage' },
  { value: 'clock', label: 'Klok' },
  { value: 'calendar', label: 'Kalender' },
  { value: 'map', label: 'Kaart' },
  { value: 'image', label: 'Afbeelding' },
  { value: 'qr-code', label: 'QR-code' },
  { value: 'hash', label: 'Hekje' },
  { value: 'ruler', label: 'Liniaal' },
  { value: 'scale', label: 'Weegschaal' },
  { value: 'banknote', label: 'Bankbiljet' },
  { value: 'receipt', label: 'Bonnetje' },
  { value: 'timer', label: 'Timer' },
  { value: 'hourglass', label: 'Zandloper' },
  { value: 'sparkles', label: 'Sterretjes' },
  { value: 'wand-2', label: 'Toverstok' },
  { value: 'package', label: 'Pakket' },
  { value: 'box', label: 'Doos' },
  { value: 'folder', label: 'Map' },
  { value: 'link', label: 'Link' },
  { value: 'globe', label: 'Wereldbol' },
  { value: 'mail', label: 'E-mail' },
  { value: 'phone', label: 'Telefoon' },
  { value: 'users', label: 'Gebruikers' },
  { value: 'building-2', label: 'Gebouw' },
  { value: 'briefcase', label: 'Koffer' },
  { value: 'tag', label: 'Label' },
  { value: 'gift', label: 'Cadeau' },
  { value: 'lightbulb', label: 'Lamp' },
  { value: 'flask-conical', label: 'Kolf' },
  { value: 'code', label: 'Code' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'database', label: 'Database' },
  { value: 'bar-chart-2', label: 'Staafdiagram' },
  { value: 'pie-chart', label: 'Taartdiagram' },
  { value: 'trending-up', label: 'Trend' },
  { value: 'shopping-cart', label: 'Winkelwagen' },
  { value: 'truck', label: 'Vrachtwagen' },
  { value: 'file-spreadsheet', label: 'Spreadsheet' },
  { value: 'clipboard-check', label: 'Afgevinkt klembord' }
];

// Vult een dropdown eenmalig -- daarna enkel .value + preview bijwerken per app.
// Gebruikt voor zowel de Instellingen-tab (settingsIcon) als de upload-modal
// (uploadIcon) -- zelfde iconlijst, twee onafhankelijke select-elementen.
function initIconSelect(selectId) {
  var select = document.getElementById(selectId);
  if (!select || select.options.length > 0) return;
  select.innerHTML = ICON_OPTIONS.map(function(opt) {
    return `<option value="${opt.value}">${opt.label}</option>`;
  }).join('');
}

function updateIconPreview(iconName, wrapId) {
  var wrap = document.getElementById(wrapId || 'settingsIconPreviewWrap');
  if (!wrap) return;
  wrap.innerHTML = `<i data-lucide="${iconName || 'puzzle'}" class="w-4 h-4"></i>`;
  lucide.createIcons();
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

// Zichtbaar voor IEDEREEN (niet enkel admins) -- verklaart waarom een app die
// niemand expliciet met jou deelde toch in je lijst verschijnt.
function globalFavoriteBadge(app) {
  if (!app.isGlobalFavorite) return '';
  return `<span class="badge badge-sm badge-warning gap-1" title="Door een admin favoriet gemaakt voor iedereen"><i data-lucide="star" class="w-3 h-3"></i> Voor iedereen</span>`;
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

  // Favoriet: blokje bovenaan in de gedeelde navbar (zie navbar.js +
  // session.js). Werkt op zowel eigen als gedeelde apps.
  var favActive = !!app.isFavorite;
  var favButton = `<button class="btn btn-ghost btn-sm btn-square${favActive ? ' text-error' : ''}" data-action="toggleFavorite" data-id="${app.id}" data-favorite="${favActive ? '1' : '0'}" title="${favActive ? 'Favoriet verwijderen' : 'Als favoriet markeren'}">
         <i data-lucide="heart" class="w-3.5 h-3.5${favActive ? ' fill-current' : ''}"></i>
       </button>`;

  // Favoriet-voor-iedereen: enkel zichtbaar/bruikbaar voor admins (server-side
  // ook afgedwongen in routes.js, user.role !== 'admin' -> 403).
  var globalFavActive = !!app.isGlobalFavorite;
  var globalFavButton = isAdmin
    ? `<button class="btn btn-ghost btn-sm btn-square${globalFavActive ? ' text-warning' : ''}" data-action="toggleGlobalFavorite" data-id="${app.id}" data-global-favorite="${globalFavActive ? '1' : '0'}" title="${globalFavActive ? 'Niet meer favoriet voor iedereen' : 'Favoriet maken voor iedereen'}">
           <i data-lucide="star" class="w-3.5 h-3.5${globalFavActive ? ' fill-current' : ''}"></i>
         </button>`
    : '';

  return `
    <div class="card bg-base-100 shadow-sm border border-base-200 hover:border-primary/40 transition-colors h-full">
      <div class="card-body p-4 h-full">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <i data-lucide="${app.icon || 'puzzle'}" class="w-4 h-4 text-base-content/50 shrink-0"></i>
            <h3 class="font-semibold text-sm truncate" title="${escapeHtml(app.title)}">${escapeHtml(app.title)}</h3>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${globalFavoriteBadge(app)}
            ${visibilityBadge(app)}
          </div>
        </div>
        ${desc}
        ${ownerLine}
        <div class="card-actions mt-auto pt-3 flex-nowrap">
          <button class="btn btn-primary btn-sm gap-2 flex-1" data-action="openAppFullscreen" data-id="${app.id}">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            Openen
          </button>
          ${editButton}
          ${favButton}
          ${globalFavButton}
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

// ====== Bouw-prompt ======
//
// Basisprompt die een gebruiker in een Claude-gesprek kan plakken: Claude
// stelt dan gerichte vragen over de gewenste mini-app en levert nadien het
// kant-en-klare .html-bestand terug, klaar om hier te uploaden.

var BUILD_PROMPT = `Ik wil een mini-app (interne tool) bouwen voor de Mini-apps-module van onze Operations Manager.

Begin met een laagdrempelige, open vraag: "Wat zou je graag willen maken, of wat moet de app precies doen?" Ga op basis van mijn antwoord verder in gesprek met gerichte, open vervolgvragen (geen meerkeuze/keuzemenu's) over input, output, berekeningen/regels en gewenste stijl, tot je genoeg weet om te beginnen coderen.

Technische vereisten voor de uiteindelijke app (belangrijk, hou hier rekening mee):
- De output is ÉÉN volledig zelfstandig .html-bestand: alle CSS en JavaScript inline in <style>- en <script>-tags in dat ene bestand. Geen losse .css- of .js-bestanden, geen build-stap -- ook niet als tussenstap tijdens het bouwen zelf (bv. via losse bestandstools). Werk je in een omgeving die bestanden kan aanmaken, maak dan GEEN aparte .js/.css-bestanden aan, ook niet tijdelijk -- schrijf alles meteen in het ene .html-bestand. De Mini-apps-module kan enkel dat ene bestand opslaan/serveren; een <script src="..."> of <link href="..."> naar een lokaal bestand geeft altijd een 404 zodra de app draait.
- Gebruik ons designsysteem, exact zoals de rest van de Operations Manager:
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
  Gebruik Tailwind-utility-classes + daisyUI-componenten (btn, card, input, badge, ...) en Lucide-icons (<i data-lucide="...">, gevolgd door lucide.createIcons() na render).
- De omgeving zet automatisch het daisyUI-thema (data-theme) dat de gebruiker zelf heeft ingesteld in de Operations Manager. Gebruik daarom overal thema-bewuste daisyUI-kleuren (bv. bg-base-100/200/300, text-base-content, btn-primary/secondary/accent, border-base-300) i.p.v. hardcoded kleuren -- dan volgt jouw app automatisch het gekozen thema.
- Extra CDN-links mag je aanvullend gebruiken als dat nodig is, dat werkt gewoon.
- De app draait in een gesandboxte iframe zonder toegang tot de bovenliggende pagina of de sessie van de gebruiker. localStorage/sessionStorage worden vervangen door een in-memory variant die NIET bewaard blijft na een herlaad en NIET gedeeld wordt tussen gebruikers -- ga er dus niet van uit dat opgeslagen data blijft bestaan of zichtbaar is voor anderen.
- Moet de app kleine of middelgrote data bewaren of delen TUSSEN GEBRUIKERS (bv. een teller, een instelling, een recurring schema per medewerker)? Gebruik dan window.sharedStorage in plaats van localStorage -- die is wél persistent en gedeeld over alle gebruikers die deze mini-app mogen draaien:
    await window.sharedStorage.set("mijnKey", "een string-waarde");   // opslaan (max 1 MB per key)
    var waarde = await window.sharedStorage.get("mijnKey");           // string, of null als niet gezet
    var alles = await window.sharedStorage.list();                    // { key: value, ... } -- alle keys van deze app
    await window.sharedStorage.remove("mijnKey");
  Alle methodes geven een Promise terug en werken uitsluitend met string-waarden -- gebruik zelf JSON.stringify/JSON.parse voor objecten of arrays.
- Moet de app een GEDEELDE LIJST bijhouden waar meerdere gebruikers tegelijk items aan toevoegen/verwijderen (bv. een boodschappenlijst, een to-do-lijst)? Gebruik dan NIET één grote lijst-waarde via set()/get() -- als twee mensen tegelijk opslaan, verliest de een de wijziging van de ander. Gebruik in plaats daarvan de collection-API, waarbij elk item een eigen record is en toevoegen/verwijderen door verschillende mensen nooit botst:
    var item = await window.sharedStorage.addItem("boodschappen", "melk");   // { id, value } -- id wordt server-side gegenereerd
    var items = await window.sharedStorage.listItems("boodschappen");        // [{ id, value }, ...]
    await window.sharedStorage.updateItem("boodschappen", item.id, "melk (aangekocht)"); // item aanpassen MET behoud van id -- bv. iets als "aangekocht" markeren
    await window.sharedStorage.removeItem("boodschappen", item.id);
  Wil je iets exporteren/downloaden vanuit de app (bv. de lijst als bestand)? Dat kan gewoon met gangbare browser-JS (Blob + een <a download>-link) -- downloads zijn toegestaan vanuit deze sandbox.
- Optioneel: await window.sharedStorage.usage() geeft { usedBytes, maxBytes, objectCount, maxObjects } terug -- handig als de app zelf ook een quotum-balkje wil tonen (de Mini-apps-module toont dit trouwens al standaard in de Instellingen-tab).
- BELANGRIJK, voorkomt een veelgemaakte fout: window.sharedStorage en window.platform (inclusief .schedule/.condition) staan al VOLLEDIG en synchroon klaar vanaf de allereerste regel van je eigen <script>-code -- ze worden door de omgeving in de <head> geïnjecteerd, dus altijd vóór jouw code draait. Geen race, geen "wachten tot ze bestaan" nodig -- schrijf dus NOOIT een eigen polling-/retry-lus (bv. setTimeout-loops die controleren of window.sharedStorage.listItems al een functie is) om hierop te wachten; die is overbodig en kan een echte fout (bv. een typfout in een key/collection-naam) verbergen achter een misleidende "nog niet klaar"-verklaring. De ENIGE uitzondering hierop is window.currentUser (zie hieronder), die wél heel even null kan zijn.
- De app kent de ingelogde gebruiker: window.currentUser is een kant-en-klaar object { id, name, email } van wie de app nu gebruikt -- geen login/invulveld nodig om te weten "wie ben ik". Kan bij het laden nog null zijn (heel kort, voor de eerste paint) -- check dus of het bestaat voor je het gebruikt (dit is het enige geval waar een korte "wacht tot beschikbaar"-check wél zinvol is).
- Moet de app iets doen MET/VOOR een specifieke collega (bv. een taak toewijzen, iemand kiezen uit een lijst)? Gebruik var collega's = await window.platform.listColleagues(); -- geeft [{ id, full_name, email }, ...] terug van alle actieve collega's (zelfde lijst als de share-picker in deze module). Gebruik altijd het id-veld om een collega te identificeren in window.sharedStorage, niet de naam (namen kunnen dubbel zijn).
- Wil de app een e-mail sturen naar de gebruiker zelf of naar een specifieke collega (bv. een herinnering of een bevestiging)? Gebruik window.platform.notify(to, subject, message) -- to is "self" of het id-veld van een collega uit listColleagues(). Geef NOOIT zelf een e-mailadres op -- dat wordt niet ondersteund en genegeerd/geweigerd; de ontvanger wordt altijd server-side herleid. Elke mail krijgt automatisch een voettekst met de appnaam en wie de actie startte, en is beperkt tot een dagelijkse limiet per app -- dus geen bulk-mailtool, enkel gerichte meldingen.
    await window.platform.notify("self", "Vergeten iets?", "Je hebt nog niet ingevuld welke dagen je naar de winkel gaat.");
    await window.platform.notify(collega.id, "Boodschappenlijst bijgewerkt", "Er staat weer iets nieuws op de lijst!");
- Wil de app een bericht sturen naar een Google Chat-KANAAL (geen 1-op-1 DM naar een persoon -- dat wordt nog niet ondersteund)? Gebruik window.platform.listChatChannels() -- geeft [{ id, name }, ...] terug van kanalen die een ADMIN al gekoppeld heeft (via de "Chat-kanalen"-knop in de Mini-apps-lijst -- enkel admins mogen kanalen toevoegen/verwijderen, iedereen mag de lijst gebruiken) -- en window.platform.sendChat(channelId, message).
  BELANGRIJK: jij (Claude, in dit gesprek) weet NIET welke kanalen vandaag al bestaan -- die lijst staat niet vast en kan na het bouwen van deze app nog wijzigen. Hardcode dus NOOIT een kanaalnaam of -id, en pak NOOIT zomaar "het eerste kanaal" uit de lijst. Haal de lijst altijd live op zodra de app opent, en laat de gebruiker zelf een kanaal kiezen (bv. via een <select>) voor je iets verstuurt. Is de lijst leeg? Toon dan een duidelijke melding dat er nog geen kanaal gekoppeld is en dat een admin dat via de "Chat-kanalen"-knop moet doen -- de app kan zelf geen kanaal aanmaken.
    var kanalen = await window.platform.listChatChannels();
    // bv. kanalen renderen als <select><option value="\${k.id}">\${k.name}</option>...</select>,
    // en pas bij een submit: await window.platform.sendChat(gekozenKanaalId, "Er staat een nieuw item op de lijst!");
- Totale limiet gedeelde opslag per app: 10 MB en max 500 keys/items samen (kv + collection-items).
- Maximale bestandsgrootte van de HTML-app zelf: 2 MB.
- Tips voor een vlotte, snelle gedeelde opslag (elke aanroep is een echte netwerk-round-trip via de bovenliggende pagina naar R2 -- geen gratis synchrone call zoals localStorage):
    - set()/addItem()/updateItem() herberekenen server-side eerst het quotumverbruik van de HELE app (alle keys + items samen), niet enkel van dat ene item -- vermijd dus een tight loop die per toetsaanslag of per item apart opslaat. Debounce tekstvelden (bv. 400-600ms na de laatste toets) voor je set() aanroept, en voeg meerdere nieuwe items niet snel na elkaar toe als het ook als één actie kan.
    - list()/listItems() halen ALTIJD alles op (geen server-side filter/paginatie/sortering) -- roep dit niet opnieuw aan bij elke render of in een polling-loop. Haal éénmaal op bij het laden van de app, bewaar het resultaat in een gewone JS-variabele/state, en filter/sorteer lokaal in JavaScript. Wil je verse data van andere gebruikers zien, ververs dan op een trage interval (bv. elke 30-60s) of via een expliciete ververs-knop.
    - Werk optimistisch: update de UI meteen (voeg het item lokaal toe aan je state) en stuur de sharedStorage-aanroep op de achtergrond, in plaats van te wachten met een spinner tot de round-trip terug is. Faalt de aanroep (bv. na de 15s-timeout), rol de UI-wijziging dan terug en toon een duidelijke foutmelding.
    - Onafhankelijke aanroepen (bv. meerdere keys/collections tegelijk inladen bij het openen van de app) mag je parallelliseren met Promise.all([...]) i.p.v. na elkaar te awaiten.
    - Hoort iets logisch bij elkaar (bv. alle instellingen van één gebruiker)? Bewaar dat dan als één kv-key of collection-item met een JSON-waarde i.p.v. een aparte key per veld -- dat is zowel sneller (één round-trip i.p.v. meerdere) als lichter voor het object-quotum (max 500 keys/items samen).
    - Moet je een grote lijst of een rooster (bv. weken/maanden aan geplande dagen) herberekenen na een wijziging (bv. één vakantiedag, één uitzondering)? Wis en herschrijf dan NIET de volledige lijst -- vergelijk eerst per record wat er al staat tegenover wat er zou moeten staan, en schrijf enkel de records weg die effectief verschillen. Bij een kleine wijziging scheelt dat tientallen tot honderden overbodige opslag-aanroepen t.o.v. alles wissen en opnieuw aanmaken.
    - Moet een opruimfunctie (bv. verlopen uitzonderingen/afgevinkte items opruimen) de server bijwerken? Werk dan in dezelfde functie ook meteen de lokale JS-state bij (dezelfde wijziging die je naar de server stuurt), i.p.v. nadien alle collecties opnieuw volledig op te halen om weer synchroon te lopen -- dat laatste is typisch de duurste stap van een actie en meestal overbodig als de lokale state al correct is bijgewerkt.
- Moet de app ook iets versturen OP EEN VAST TIJDSTIP/INTERVAL, ook als niemand die dag de app open heeft (bv. een dagelijkse post om 11u, of een wekelijkse herinnering)? Gebruik window.platform.schedule -- dit draait volledig server-side via een cron (elke 15 min, dus tot 15 min vertraging op het ingestelde tijdstip), los van of de app open staat:
    var taak = await window.platform.schedule.create({
      name: "Dagelijkse update",                          // herkenbare naam, voor jezelf/collega's in de lijst
      recurrence: { frequency: "daily", time: "11:00" },   // of: { frequency: "weekly", time: "09:00", daysOfWeek: [1,3,5] } (0=zo..6=za)
                                                             // of: { frequency: "every_n_days", time: "08:30", intervalDays: 14, anchorDate: "2026-07-07" }
      deliveryMethod: "mail",                               // "mail" of "chat"
      targetType: "self",                                   // "self" | "colleague" (+ targetUserId) | "channel" (+ targetChannelId, enkel bij "chat")
      subjectTemplate: "Dagupdate",                          // enkel bij deliveryMethod "mail"
      messageTemplate: "Vandaag op de lijst:\n{{#each boodschappen}}- {{this.naam}}\n{{/each}}{{#isEmpty boodschappen}}Niets vandaag!{{/isEmpty}}"
    });
    var mijnTaken = await window.platform.schedule.list();           // ALLE taken van deze app (ook die van collega's -- transparantie, geen dubbele posts) + { isMine, canManage }
    await window.platform.schedule.update(taak.id, { ...zelfde velden als bij create... });  // enkel toegestaan als jij de taak maakte of de app-eigenaar bent
    await window.platform.schedule.remove(taak.id);
    await window.platform.schedule.runNow(taak.id);                   // test de taak meteen, i.p.v. tot het volgende tijdstip te wachten
  Het message/subject-template is GEEN JavaScript-expressie maar een eenvoudige, veilige tekst-vervanging (geen eval, geen logica) die alleen mag verwijzen naar data uit window.sharedStorage van DEZE app:
    {{kv.KEY}}                                    -- een platte sharedStorage-waarde (window.sharedStorage.get/set)
    {{#each collectieNaam}}...{{this}}/{{this.veld}}...{{/each}}   -- itereert over een collection (this.veld leest een JSON-veld als het item als JSON is opgeslagen)
    {{#isEmpty collectieNaam}}...{{/isEmpty}}     -- enkel getoond als de collection leeg is (bv. "niemand vandaag")
    {{#notEmpty collectieNaam}}...{{/notEmpty}}   -- enkel getoond als de collection NIET leeg is
  targetType "colleague"/"channel" volgen dezelfde regels als notify()/sendChat() hierboven: nooit zelf een e-mailadres/kanaal-id verzinnen, altijd targetUserId uit listColleagues() of targetChannelId uit listChatChannels() gebruiken, en laat de gebruiker zelf kiezen via een <select> i.p.v. iets te hardcoden. Max 20 geplande taken per app.
- Moet de app iets versturen ZODRA EEN VOORWAARDE WAAR WORDT (bv. "een nieuwe bestelling", "voorraad op"), i.p.v. op een vast tijdstip? Gebruik window.platform.condition -- dit is een APARTE, snellere cron (elke 5 min) die de voorwaarde zelf server-side controleert, dus ook als niemand de app open heeft. Stuurt enkel bij een overgang van niet-waar naar waar (geen herhaalde berichten zolang de voorwaarde waar blijft):
    var taak = await window.platform.condition.create({
      name: "Nieuwe bestelling",
      criteria: { source: "collection", collection: "bestellingen", field: "status", equals: "nieuw" },
                                                          // of: { source: "kv", key: "voorraadStatus", equals: "op" }
                                                          // equals/notEquals mogen {{today}}/{{weekday}}/{{weekdayName}}/{{isoWeek}}/{{isoYear}} bevatten
      deliveryMethod: "chat",                              // "mail" of "chat"
      targetType: "channel",                               // "self" | "colleague" (+ targetUserId) | "channel" (+ targetChannelId, enkel bij "chat")
      subjectTemplate: "Nieuwe bestelling",                 // enkel bij deliveryMethod "mail"
      messageTemplate: "Er is een nieuwe bestelling binnengekomen op {{today}} ({{weekdayName}})."
    });
    var mijnCriteriaTaken = await window.platform.condition.list();     // ALLE criteria-taken van deze app + { isMine, canManage, last_condition_met, last_triggered_at }
    await window.platform.condition.update(taak.id, { ...zelfde velden als bij create... });   // reset de edge-detectie, enkel toegestaan als jij de taak maakte of de app-eigenaar bent
    await window.platform.condition.remove(taak.id);
    await window.platform.condition.runNow(taak.id);                   // stuurt het bericht ONMIDDELLIJK, ongeacht of de voorwaarde net "waar geworden" is -- handig om het template te testen
  Het message/subject-template werkt hetzelfde als bij window.platform.schedule hierboven (logic-less, geen eval), plus twee extra's die ENKEL bij condition-taken beschikbaar zijn (niet bij schedule-taken):
    {{today}} / {{weekday}} / {{weekdayName}} / {{isoWeek}} / {{isoYear}}   -- server-berekende dag-context op het MOMENT VAN VERSTUREN (Europe/Brussels): datum (YYYY-MM-DD), weekdag (0=zo..6=za), weekdagnaam (NL), ISO-weeknummer/-jaar
    {{#eachWhere collectieNaam field="veld" equals="waarde"}}...{{/eachWhere}}   -- gefilterde variant van {{#each}}: enkel items waar "veld" gelijk is aan "waarde" (mag zelf {{today}}/{{weekday}}/... bevatten); notEquals="..." kan ook
    {{rotation.NAAM}}   -- actieve persoon/item van een BEURTROL met vaste interval + optionele uitzonderingen (bv. "wie gaat er vandaag naar de winkel", "wie is on-call"), volledig server-side herberekend. Zet dit op met ÉÉN sharedStorage-key met een gereserveerde naam:
      await window.sharedStorage.set("__rotation_NAAM__", JSON.stringify({
        anchorDate: "2026-06-30", intervalDays: 14, items: ["Jan", "Piet", "An"],
        exceptionsCollection: "afwezigheden", exceptionDateField: "date", exceptionPersonField: "person"   // optioneel: een collection met { date, person } om iemand voor één dag over te slaan (bv. vakantie) -- springt automatisch door naar de volgende in de rotatie
      }));
  targetType "colleague"/"channel" volgen dezelfde regels als hierboven. Max 20 criteria-taken per app. window.platform.schedule (vast tijdstip) en window.platform.condition (databeslissing) zijn twee onafhankelijke mechanismes -- kies op basis van OF de app op een vast tijdstip moet sturen OF zodra iets waar wordt, niet allebei door elkaar voor dezelfde taak.

Zodra je voldoende weet: geef me de volledige inhoud van dat ene .html-bestand terug in één codeblok, zodat ik het meteen kan opslaan en uploaden in de Mini-apps-module. Nogmaals: geen aparte .js/.css-bestanden, ook niet als tussenstap -- alles inline in dat ene codeblok.`;

function copyBuildPrompt() {
  navigator.clipboard.writeText(BUILD_PROMPT).then(function() {
    showToast('Prompt gekopieerd — plak hem in een Claude-gesprek.', 'success');
  }, function() {
    showToast('Kopiëren mislukt.', 'error');
  });
}

// ====== Upload-modal ======

async function openUploadModal() {
  document.getElementById('uploadTitle').value = '';
  document.getElementById('uploadDescription').value = '';
  document.getElementById('uploadFile').value = '';
  document.getElementById('uploadIcon').value = 'puzzle';
  updateIconPreview('puzzle', 'uploadIconPreviewWrap');
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
  var icon = document.getElementById('uploadIcon').value;
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
    formData.append('icon', icon);
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
    activeFrame = { frame: frame, banner: banner, appId: id };
    resetAppErrors(banner);
    frame.srcdoc = instrumentAppHtml(contentResult.content);

    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('appFullscreen').classList.remove('hidden');
    // Opruimen: enkel relevant voor de allereerste paint van een directe
    // link (zie de inline <script> in mini-apps.html) -- de klassen hierboven
    // regelen de zichtbaarheid vanaf nu zelf.
    document.documentElement.classList.remove('mini-app-deeplink');
    insertNavbarBackLink();

    history.replaceState(null, '', '/mini-apps?app=' + encodeURIComponent(id));
  } catch (err) {
    document.documentElement.classList.remove('mini-app-deeplink');
    showToast('App openen mislukt: ' + err.message, 'error');
  }
}

function closeAppFullscreen() {
  document.getElementById('appFullscreen').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
  document.getElementById('appFullscreenFrame').srcdoc = 'about:blank';
  // Anders zou mainContent verborgen blijven (zie html.mini-app-deeplink
  // #mainContent-regel in mini-apps.html) als deze klasse nog aanstond.
  document.documentElement.classList.remove('mini-app-deeplink');
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
  if (tab === 'settings' && currentApp) {
    refreshStorageUsage(currentApp.id);
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
    activeFrame = { frame: frame, banner: banner, appId: id };
    resetAppErrors(banner);
    frame.srcdoc = instrumentAppHtml(currentAppContent);

    try {
      var sub = await apiJson(`/mini-apps/api/apps/${id}/mail-subscription`);
      renderMailSubscriptionToggle(sub.subscribed);
    } catch (err) {
      renderMailSubscriptionToggle(true);
    }

    if (meta.isOwner) {
      document.getElementById('settingsTitle').value = meta.title;
      document.getElementById('settingsDescription').value = meta.description || '';
      document.getElementById('settingsIcon').value = meta.icon || 'puzzle';
      updateIconPreview(meta.icon || 'puzzle', 'settingsIconPreviewWrap');
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

// ====== Mail-abonnement per app (in-/uitschrijven persoonlijke mails) ======
//
// Zelf-service, elke viewer (niet enkel de eigenaar) -- window.platform.notify()
// in een mini-app kan altijd geweigerd worden door de ontvanger zelf, los van
// wie de app gebouwd heeft. Status wordt bij elke openApp() opnieuw opgehaald
// (geen cache) zodat de knop nooit een verouderde staat toont.

function renderMailSubscriptionToggle(subscribed) {
  var btn = document.getElementById('mailSubscriptionToggle');
  if (!btn) return;
  btn.dataset.subscribed = subscribed ? '1' : '0';
  btn.innerHTML = subscribed
    ? '<i data-lucide="bell" class="w-4 h-4"></i>'
    : '<i data-lucide="bell-off" class="w-4 h-4"></i>';
  btn.title = subscribed
    ? 'Je ontvangt persoonlijke mails van deze app — klik om uit te schrijven'
    : 'Uitgeschreven voor persoonlijke mails van deze app — klik om in te schrijven';
  lucide.createIcons();
}

async function toggleMailSubscription() {
  if (!currentApp) return;
  var btn = document.getElementById('mailSubscriptionToggle');
  var next = !(btn && btn.dataset.subscribed === '1');
  try {
    await apiJson(`/mini-apps/api/apps/${currentApp.id}/mail-subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed: next })
    });
    renderMailSubscriptionToggle(next);
    showToast(next ? 'Ingeschreven voor mails van deze app.' : 'Uitgeschreven voor mails van deze app.', 'success');
  } catch (err) {
    showToast('Wijzigen mislukt: ' + err.message, 'error');
  }
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
  var icon = document.getElementById('settingsIcon').value;
  var visibility = document.querySelector('input[name="settingsVisibility"]:checked').value;
  var sharedUserIds = visibility === 'specific'
    ? getCheckedColleagueIds(document.getElementById('settingsColleaguesList'))
    : [];

  if (!title) { showToast('Titel mag niet leeg zijn.', 'error'); return; }

  try {
    var updated = await apiJson(`/mini-apps/api/apps/${currentApp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, icon, visibility, sharedUserIds })
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

// ====== Favorieten ======
//
// Favoriete mini-apps verschijnen als blokjes rechtsboven in de gedeelde
// navbar (server-side gerenderd, zie navbar.js + session.js) EN als
// herordenbare strip bovenaan deze pagina (renderFavoritesSection hieronder)
// -- beide tonen dezelfde, door de gebruiker zelf bepaalde volgorde (zie
// src/modules/mini-apps/lib/favorites.js). Na het toggelen/herordenen
// herladen we telkens kaarten + strip + navbar, zodat alles meteen
// verschijnt/verdwijnt/verschuift zonder volledige paginaherlaad.

async function toggleFavorite(id, isFavorite) {
  try {
    if (isFavorite) {
      await apiJson(`/mini-apps/api/apps/${id}/favorite`, { method: 'DELETE' });
    } else {
      await apiJson(`/mini-apps/api/apps/${id}/favorite`, { method: 'PUT' });
    }
    await Promise.all([loadApps(), loadFavorites(), renderNavbar()]);
  } catch (err) {
    showToast('Favoriet wijzigen mislukt: ' + err.message, 'error');
  }
}

// Admin only (server-side afgedwongen, zie routes.js) -- favoriet VOOR
// IEDEREEN, verschijnt bij elke gebruiker in de navbar + Favorieten-strip.
async function toggleGlobalFavorite(id, isGlobalFavorite) {
  try {
    if (isGlobalFavorite) {
      await apiJson(`/mini-apps/api/apps/${id}/global-favorite`, { method: 'DELETE' });
    } else {
      await apiJson(`/mini-apps/api/apps/${id}/global-favorite`, { method: 'PUT' });
    }
    await Promise.all([loadApps(), loadFavorites(), renderNavbar()]);
  } catch (err) {
    showToast('Favoriet-voor-iedereen wijzigen mislukt: ' + err.message, 'error');
  }
}

async function loadFavorites() {
  try {
    favorites = await apiJson('/mini-apps/api/apps/favorites');
    renderFavoritesSection();
  } catch (err) {
    // Stil falen -- de strip is een nice-to-have bovenop de gewone lijst,
    // geen kritiek pad. showToast zou hier enkel ruis toevoegen bij elke load.
    console.error('Favorieten ophalen mislukt:', err.message);
  }
}

function renderFavoritesSection() {
  var section = document.getElementById('favoritesSection');
  var strip = document.getElementById('favoritesStrip');
  if (!section || !strip) return;

  if (favorites.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  strip.innerHTML = favorites.map(function(fav, index) {
    return `<div class="join">
      <button class="btn btn-ghost btn-xs join-item" data-action="moveFavorite" data-id="${fav.id}" data-dir="-1"${index === 0 ? ' disabled' : ''} title="Naar links">
        <i data-lucide="chevron-left" class="w-3 h-3"></i>
      </button>
      <button class="btn btn-ghost btn-xs join-item gap-1.5 font-normal" data-action="openAppFullscreen" data-id="${fav.id}">
        <i data-lucide="${fav.icon || 'puzzle'}" class="w-3.5 h-3.5"></i>
        ${escapeHtml(fav.title)}
      </button>
      <button class="btn btn-ghost btn-xs join-item" data-action="moveFavorite" data-id="${fav.id}" data-dir="1"${index === favorites.length - 1 ? ' disabled' : ''} title="Naar rechts">
        <i data-lucide="chevron-right" class="w-3 h-3"></i>
      </button>
    </div>`;
  }).join('');
  lucide.createIcons();
}

// Optimistisch: de strip verschuift meteen (geen wachten op de round-trip),
// en rolt terug + herlaadt bij een falende opslag (zie CLAUDE.md-tips over
// snelle/soepele sharedStorage -- zelfde principe, hier op de eigen API).
async function moveFavorite(id, dir) {
  var index = favorites.findIndex(function(f) { return f.id === id; });
  var targetIndex = index + dir;
  if (index === -1 || targetIndex < 0 || targetIndex >= favorites.length) return;

  var reordered = favorites.slice();
  var tmp = reordered[index];
  reordered[index] = reordered[targetIndex];
  reordered[targetIndex] = tmp;
  favorites = reordered;
  renderFavoritesSection();

  try {
    await apiJson('/mini-apps/api/apps/favorites/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: favorites.map(function(f) { return f.id; }) })
    });
    renderNavbar();
  } catch (err) {
    showToast('Volgorde opslaan mislukt: ' + err.message, 'error');
    await loadFavorites();
  }
}

// ====== Chat-kanalen modal ======

async function openChatChannelsModal() {
  document.getElementById('chatChannelName').value = '';
  document.getElementById('chatChannelWebhookUrl').value = '';
  document.getElementById('chatChannelAddWrap').classList.toggle('hidden', !isAdmin);
  document.getElementById('chatChannelNonAdminNote').classList.toggle('hidden', isAdmin);
  document.getElementById('chatChannelsModal').showModal();
  lucide.createIcons();
  await loadChatChannelsList();
}

function closeChatChannelsModal() {
  document.getElementById('chatChannelsModal').close();
}

async function loadChatChannelsList() {
  var container = document.getElementById('chatChannelsList');
  container.innerHTML = '<span class="text-xs text-base-content/40">Laden…</span>';
  try {
    var channels = await apiJson('/mini-apps/api/apps/chat-channels');
    if (channels.length === 0) {
      container.innerHTML = '<span class="text-xs text-base-content/40">Nog geen kanalen gekoppeld.</span>';
      return;
    }
    container.innerHTML = channels.map(function(c) {
      var deleteBtn = isAdmin
        ? `<button class="btn btn-ghost btn-xs btn-circle" data-action="deleteChatChannel" data-id="${c.id}" title="Verwijderen">
             <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
           </button>`
        : '';
      return `<div class="flex items-center justify-between bg-base-200/40 rounded-lg px-3 py-1.5">
        <span class="text-sm">${escapeHtml(c.name)}</span>
        ${deleteBtn}
      </div>`;
    }).join('');
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = '<span class="text-xs text-error">Ophalen mislukt: ' + escapeHtml(err.message) + '</span>';
  }
}

async function submitChatChannel() {
  var name = document.getElementById('chatChannelName').value.trim();
  var webhookUrl = document.getElementById('chatChannelWebhookUrl').value.trim();
  if (!name || !webhookUrl) {
    showToast('Naam en webhook-URL zijn verplicht.', 'error');
    return;
  }
  try {
    await apiJson('/mini-apps/api/apps/chat-channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, webhookUrl: webhookUrl })
    });
    document.getElementById('chatChannelName').value = '';
    document.getElementById('chatChannelWebhookUrl').value = '';
    showToast('Kanaal gekoppeld.', 'success');
    await loadChatChannelsList();
  } catch (err) {
    showToast('Koppelen mislukt: ' + err.message, 'error');
  }
}

async function deleteChatChannel(id) {
  try {
    await apiJson(`/mini-apps/api/apps/chat-channels/${id}`, { method: 'DELETE' });
    showToast('Kanaal verwijderd.', 'success');
    await loadChatChannelsList();
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
    else if (action === 'copyBuildPrompt') copyBuildPrompt();
    else if (action === 'closeUploadModal') closeUploadModal();
    else if (action === 'submitUpload') submitUpload();
    else if (action === 'openAppFullscreen') openAppFullscreen(el.dataset.id);
    else if (action === 'openApp') openApp(el.dataset.id);
    else if (action === 'copyAppLink') copyAppLink(el.dataset.id);
    else if (action === 'toggleFavorite') toggleFavorite(el.dataset.id, el.dataset.favorite === '1');
    else if (action === 'toggleGlobalFavorite') toggleGlobalFavorite(el.dataset.id, el.dataset.globalFavorite === '1');
    else if (action === 'moveFavorite') moveFavorite(el.dataset.id, parseInt(el.dataset.dir, 10));
    else if (action === 'copyCurrentAppLink') { if (currentApp) copyAppLink(currentApp.id); }
    else if (action === 'toggleMailSubscription') toggleMailSubscription();
    else if (action === 'closeAppModal') closeAppModal();
    else if (action === 'saveAppCode') saveAppCode();
    else if (action === 'saveAppSettings') saveAppSettings();
    else if (action === 'deleteApp') deleteApp();
    else if (action === 'openChatChannelsModal') openChatChannelsModal();
    else if (action === 'closeChatChannelsModal') closeChatChannelsModal();
    else if (action === 'submitChatChannel') submitChatChannel();
    else if (action === 'deleteChatChannel') deleteChatChannel(el.dataset.id);
  }

  var tabBtn = e.target.closest('[data-app-tab]');
  if (tabBtn) switchAppTab(tabBtn.dataset.appTab);
});

document.addEventListener('change', function(e) {
  if (e.target.name === 'uploadVisibility') toggleColleaguesWrap('uploadVisibility', 'uploadColleaguesWrap');
  if (e.target.name === 'settingsVisibility') toggleColleaguesWrap('settingsVisibility', 'settingsColleaguesWrap');
  if (e.target.id === 'settingsIcon') updateIconPreview(e.target.value, 'settingsIconPreviewWrap');
  if (e.target.id === 'uploadIcon') updateIconPreview(e.target.value, 'uploadIconPreviewWrap');
});

// Links naar /mini-apps?app=<id> binnen deze pagina onderscheppen (navbar-
// favorieten, en eventuele andere links) -- schakel in-page over naar de
// nieuwe app i.p.v. een volledige paginanavigatie.
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href]');
  if (!link) return;
  var url;
  try {
    url = new URL(link.href, location.href);
  } catch (_err) {
    return;
  }
  if (url.pathname !== '/mini-apps') return;
  var appId = url.searchParams.get('app');
  if (!appId) return;
  e.preventDefault();
  openAppFullscreen(appId);
});

// Escape sluit de kale fullscreen-viewer (die geen eigen sluit-knop heeft).
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('appFullscreen').classList.contains('hidden')) closeAppFullscreen();
});

// ====== Init ======

renderNavbar();
loadApps();
loadFavorites();
initIconSelect('settingsIcon');
initIconSelect('uploadIcon');

// Directe/bookmarkbare link: /mini-apps?app=<id> opent die app meteen fullscreen,
// onafhankelijk van de lijst -- ook voor de eigenaar (bewerken gaat via de losse
// "Bewerken"-knop in de lijst, niet via de deeplink).
(function openFromQueryString() {
  var appId = new URLSearchParams(location.search).get('app');
  if (appId) openAppFullscreen(appId);
})();
