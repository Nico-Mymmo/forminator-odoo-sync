/**
 * Mini-apps -- Core (state, helpers, iframe-instrumentatie, gedeelde opslag-brug,
 * opslagquotum-indicator, apiFetch/apiJson, navbar-integratie)
 *
 * Split out of het voormalige monolithische public/mini-apps.js (1406 regels)
 * om het bewerkingsrisico op grote bestanden te verlagen (zie CLAUDE.md,
 * "Bestand-editing bij grote/gevoelige bestanden"). Geen functionele wijzigingen
 * bij deze splitsing.
 *
 * Net als het origineel: platte globale scope (var/function declaraties),
 * geen IIFE/namespace -- alle secties deelden al globale state (apps, isAdmin, ...),
 * dus <script>-tags in volgorde in mini-apps.html volstaan.
 */

// Mini-apps — client-side logica
// Vanilla JS, data-action patroon + event delegation, ES6 template literals.

lucide.createIcons();

// ====== State ======

var apps = [];               // laatst geladen lijst uit GET /api/apps
var favorites = [];          // laatst geladen, geordende favorietenbalk uit GET /api/apps/favorites
var colleagues = null;       // cache van GET /api/apps/colleagues
var currentUser = null;      // { id, name, email } van de ingelogde gebruiker (via renderNavbar), gebruikt voor buildUserShim() -- die voegt er per-app isCreator/isAdmin/isPrivileged aan toe voor de iframe
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
  +     'ai:{'
  +       'ask:function(prompt,options){options=options||{};return send("aiAsk",{prompt:prompt,system:options.system,maxOutputTokens:options.maxOutputTokens});}'
  +     '},'
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
// isOwner (van deze specifieke app -- via meta.isOwner bij openApp() of
// contentResult.isOwner bij openAppFullscreen(), zie routes.js) plus de globale
// isAdmin (bijgewerkt door renderNavbar()) samen naar de mini-app doorgegeven op
// window.currentUser, zodat een app-bouwer eenvoudig extra functionaliteit kan
// tonen voor de maker van de app en/of een Operations Manager-admin:
//   window.currentUser.isCreator    -- huidige gebruiker is de eigenaar/maker van DEZE app
//   window.currentUser.isAdmin      -- huidige gebruiker is Operations Manager-admin
//   window.currentUser.isPrivileged -- isCreator OF isAdmin (kortere check voor "mag beheerhandelingen zien")
// Deze vlaggen zijn puur voor UI-gemak in de mini-app zelf (bv. een extra
// "Beheer"-tabblad tonen/verbergen) -- ze vervangen GEEN server-side controle:
// alles wat écht afgeschermd moet zijn (bv. schrijfacties via window.sharedStorage
// of window.platform) wordt nog steeds server-side gevalideerd zoals vandaag.
function buildUserShim(isOwner) {
  var user = currentUser
    ? Object.assign({}, currentUser, {
        isCreator: !!isOwner,
        isAdmin: isAdmin,
        isPrivileged: !!isOwner || isAdmin
      })
    : null;
  return '<script>window.currentUser = ' + JSON.stringify(user) + ';</' + 'script>';
}

function instrumentAppHtml(html, isOwner) {
  var shim = buildThemeShim() + buildUserShim(isOwner) + MINI_APP_SHIM;
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
    } else if (data.action === 'aiAsk') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: data.prompt, system: data.system, maxOutputTokens: data.maxOutputTokens })
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

