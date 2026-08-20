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
var appsLoaded = false;       // true zodra loadApps() minstens 1x is teruggekomen (zie favorieten-nudge hieronder)
var favoritesLoaded = false; // true zodra loadFavorites() minstens 1x is teruggekomen
var favoriteNudgeApp = null; // { id, title, icon } van de app die nu OPEN staat maar nog geen favoriet is -- null als er niets te nudgen valt
var aiAbortControllers = {}; // requestId (van de aiAsk-boodschap uit de iframe) -> AbortController van de LOPENDE ai/ask-fetch.
                              // Zie streamMiniAppAiAsk() en de 'aiAbort'-actie in handleMiniAppStorageRequest():
                              // zonder dit bleef een aanroep gewoon doorlopen (en tokens verbruiken) nadat de
                              // brug in de iframe er lokaal al bij weggelopen was (stall/hard-timeout), waardoor
                              // elke retry BOVENOP de nog levende vorige aanroep kwam i.p.v. hem te vervangen.

// ====== Helpers ======

function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  var cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : type === 'warning' ? 'alert-warning' : 'alert-info';
  var toast = document.createElement('div');
  toast.className = 'alert ' + cls + ' text-sm py-2 px-4';
  var span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  container.appendChild(toast);
  // 'warning' blijft net als 'error' staan tot de gebruiker ze sluit -- een
  // afgekapte-resultaten-melding (zie odooRunQuery hieronder) mag niet na 3s
  // stil verdwijnen zoals een gewone info-toast.
  if (type !== 'error' && type !== 'warning') {
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
  + 'function miniAppStorageBridge(){var reqId=0,pending={},aiPending={};'
  +   'function send(action,extra,timeoutMs){return new Promise(function(resolve,reject){'
  +     'var id=Date.now()+"_"+(reqId++);'
  +     'pending[id]={resolve:resolve,reject:reject};'
  +     'setTimeout(function(){if(pending[id]){delete pending[id];'
  +       'var err=new Error("Verzoek verliep (timeout na "+Math.round((timeoutMs||15000)/1000)+"s) -- probeer opnieuw of splits de aanroep op.");'
  +       'err.code="timeout";err.timeoutMs=timeoutMs||15000;reject(err);}},timeoutMs||15000);'
  +     'var msg={__miniAppStorage:true,id:id,action:action};'
  +     'for(var k in extra){msg[k]=extra[k];}'
  +     'try{window.parent.postMessage(msg,"*");}catch(e){delete pending[id];reject(e);}'
  +   '});}'
  // ── AI-brug: INACTIVITEITS-timeout i.p.v. een totaalduur-gok ─────────────
  // Hier stond tot 2026-08 aiAskTimeoutMs(): een timeout die meeschaalde met
  // het GEVRAAGDE aantal output-tokens (45s -> 180s -> 300s, drie keer op
  // gevoel opgetrokken telkens nadat er iets misliep). Dat was structureel
  // ongokbaar: de duur hangt af van wat er WERKELIJK gegenereerd wordt, niet
  // van het gevraagde maximum. Erger nog: die timeout annuleerde niets -- de
  // fetch in de host-pagina liep door, de Worker liep door, Claude genereerde
  // door, en het antwoord kwam aan bij een promise die niemand meer vasthield.
  // Rate-limit en kosten verbruikt, resultaat weggegooid.
  //
  // Sinds de providers streamen (stream:true, zie
  // src/modules/mini-apps/lib/ai-providers/anthropic.js) komt er continu
  // verkeer binnen: de host-pagina leest de SSE-stream en relayt elke delta
  // hierheen als een `__miniAppAiEvent`-bericht. Daardoor is de onmogelijke
  // vraag "hoe lang gaat dit in totaal duren?" vervangen door de meetbare
  // vraag "is er de laatste AI_STALL_MS iets gebeurd?" -- een waarde die niet
  // meebeweegt met de gevraagde output-lengte en dus nooit meer bijgesteld
  // hoeft te worden. AI_HARD_MS is enkel een noodrem tegen een oneindig
  // hangende promise, geen begrenzing van normaal gedrag.
  //
  // De provider zelf breekt al na 60s stilte af (AI_STALL_TIMEOUT_MS in
  // lib/ai.js) en meldt dat als AI_STALLED; deze 90s zit daar bewust ruim
  // boven, zodat de SERVER de fout meldt (met foutcode en audit-log) en deze
  // brug alleen ingrijpt als zelfs de server niets meer laat horen.
  // LET OP: geen '+' voor deze commentaarregels -- anders breekt de
  // string-concatenatie hieronder (elke '+' gevolgd door enkel commentaar
  // wordt een unary plus op de volgende regel, die dan NaN oplevert i.p.v.
  // gewoon samen te voegen).
  // AI_HARD_MS was 900000 (15 min) -- opgetrokken naar 30 min sinds
  // MAX_OUTPUT_TOKENS_CAP in lib/ai.js van 8192 naar 32000 ging: bij een
  // aanroep die effectief tegen dat nieuwe plafond aan genereert, duurt het
  // GENEREREN zelf (niet de inactiviteit -- AI_STALL_MS blijft ongewijzigd,
  // dat gaat over stilte, niet totale duur) merkbaar langer, en de oude 15
  // minuten was daar te krap voor. Dit blijft een pure noodrem tegen een
  // oneindig hangende promise, geen normale-gedrag-limiet.
  // AI_STALL_MS opgetrokken van 90000 naar 120000: dit is een BACKSTOP-timer,
  // bedoeld voor het geval de SSE-relay tussen Worker en browser doodgaat
  // zonder dat de Worker dat zelf merkt (die heeft zijn EIGEN, gezaghebbende
  // inactiviteits-guard van 60s -- AI_STALL_TIMEOUT_MS in lib/ai.js -- die al
  // correct rapporteert EN de aanroep naar Claude afbreekt zodra die stil valt).
  // Deze 90s->120s-marge voorkwam vroeger niet dat de brug een AL LEVENDE,
  // gewoon nog bezig zijnde aanroep (bv. een grote batch die nog niet klaar is
  // met haar eerste zichtbare stukje tekst) verkeerd als "gestald" bestempelde.
  +   'var AI_STALL_MS=120000,AI_HARD_MS=1800000;'
  // Echte Error met het volledige foutcontract erop (zie
  // src/modules/mini-apps/lib/ai-errors.js). err.message blijft leesbaar
  // Nederlands, zodat bestaande catch-blokken die enkel err.message in een
  // toast zetten ongewijzigd blijven werken -- maar err.code/.retryable/
  // .retryAfterMs maken het nu mogelijk om GERICHT te reageren i.p.v. reguliere
  // expressies op foutteksten los te laten.
  +   'function aiError(p){p=p||{};var e=new Error(p.error||"Onbekende AI-fout.");'
  +     'e.name="AiError";e.code=p.code||"AI_INTERNAL";e.retryable=!!p.retryable;'
  +     'e.phase=p.phase||"bridge";'
  +     'if(p.retryAfterMs!=null)e.retryAfterMs=p.retryAfterMs;'
  +     'if(p.providerStatus!=null)e.providerStatus=p.providerStatus;'
  +     'if(p.requestId)e.requestId=p.requestId;'
  +     'if(p.stopReason)e.stopReason=p.stopReason;'
  +     'if(p.partialText)e.partialText=p.partialText;'
  +     'return e;}'
  // KRITIEKE FIX (2026-08): vóór deze wijziging gaf de brug bij een lokale
  // stall/hard-timeout enkel LOKAAL op (finish()+reject()) -- de eigenlijke
  // fetch in de host-pagina, en de Worker-aanroep naar Claude daarachter,
  // liepen gewoon door, onzichtbaar, nog steeds tokens verbruikend. Omdat de
  // aanroep-laag (Actiebladen Insights' withRetry) een AFGEWEZEN promise
  // hierna als "mislukt, probeer opnieuw" behandelde, startte ELKE retry een
  // VOLLEDIG NIEUWE aanroep BOVENOP de nog levende vorige -- vandaar meerdere
  // gelijktijdige, groeiende "ask"-requests in de Network-tab die nooit
  // afgebroken werden. `abortHost()` stuurt nu een expliciete `aiAbort`-actie
  // naar de host zodra de brug lokaal opgeeft (bij stall of hard-timeout, NOOIT
  // bij een normale onDone/onError -- die betekenen dat de host al klaar is),
  // die de fetch écht annuleert (zie handleMiniAppStorageRequest/
  // streamMiniAppAiAsk hieronder) én -- via request.signal, doorgegeven aan
  // askAI() in routes.js -- de aanroep naar Claude zelf afbreekt. Zo vervangt
  // een retry de vorige poging, in plaats van ernaast te lopen.
  +   'function aiSend(o){'
  +     'return new Promise(function(resolve,reject){'
  +       'var id=Date.now()+"_"+(reqId++);'
  +       'var stallTimer=null,hardTimer=null,finished=false,text="";'
  +       'function finish(){finished=true;'
  +         'if(stallTimer)clearTimeout(stallTimer);if(hardTimer)clearTimeout(hardTimer);'
  +         'delete aiPending[id];}'
  +       'function abortHost(){try{window.parent.postMessage({__miniAppStorage:true,id:"a_"+id,action:"aiAbort",abortId:id},"*");}catch(e){}}'
  +       'function bump(){if(finished)return;if(stallTimer)clearTimeout(stallTimer);'
  +         'stallTimer=setTimeout(function(){if(finished)return;abortHost();finish();'
  +           'reject(aiError({error:"De AI-aanroep liet "+Math.round(AI_STALL_MS/1000)+"s lang niets meer horen -- afgebroken door de brug (de onderliggende aanroep is nu ook echt geannuleerd, niet enkel losgelaten).",code:"AI_STALLED",retryable:true,partialText:text}));'
  +         '},AI_STALL_MS);}'
  +       'aiPending[id]={'
  +         'onOpen:function(){bump();},'
  +         'onDelta:function(d){bump();text+=d;'
  +           'if(typeof o.onProgress==="function"){try{o.onProgress({text:text,delta:d});}catch(err){}}},'
  +         'onDone:function(p){finish();resolve(p||{});},'
  +         'onError:function(p){finish();reject(aiError(p));}};'
  +       'hardTimer=setTimeout(function(){if(finished)return;abortHost();finish();'
  +         'reject(aiError({error:"De AI-aanroep is na "+Math.round(AI_HARD_MS/60000)+" minuten afgebroken (noodrem van de brug, aanroep ook effectief geannuleerd).",code:"AI_STALLED",retryable:false,partialText:text}));'
  +       '},AI_HARD_MS);'
  +       'bump();'
  +       'var msg={__miniAppStorage:true,id:id,action:"aiAsk",prompt:o.prompt,system:o.system,'
  +         'maxOutputTokens:o.maxOutputTokens,model:o.model,schema:o.schema,cacheSystem:o.cacheSystem};'
  +       'try{window.parent.postMessage(msg,"*");}'
  +       'catch(err){finish();reject(aiError({error:"De host-pagina is niet bereikbaar: "+err.message,code:"AI_BRIDGE_UNAVAILABLE"}));}'
  +     '});'
  +   '}'
  +   'window.addEventListener("message",function(e){'
  +     'var d=e.data;if(!d||!d.__miniAppAiEvent)return;'
  +     'var h=aiPending[d.id];if(!h)return;'
  +     'if(d.event==="open")h.onOpen();'
  +     'else if(d.event==="delta")h.onDelta(d.delta||"");'
  +     'else if(d.event==="done")h.onDone(d.payload);'
  +     'else if(d.event==="error")h.onError(d.payload);'
  +   '});'
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
  // window.platform.ai -- ask() resolvet nog steeds met een STRING, precies
  // zoals vroeger, zodat bestaande mini-apps niets hoeven te wijzigen en toch
  // meteen van het streamende transport profiteren. Nieuw en puur additief:
  //   options.onProgress({text, delta})  voortgang tijdens het genereren
  //                                      (een echte voortgangsbalk i.p.v. een
  //                                      spinner die niets weet)
  //   ai.ask.full(prompt, options)       resolvet met {text, json, model,
  //                                      usage, stopReason} i.p.v. enkel tekst
  //   ai.ask.json(prompt, {schema})      resolvet met een GEPARST object dat de
  //                                      provider tegen het JSON-schema
  //                                      gedwongen heeft -- geen zelfgeschreven
  //                                      regex/NDJSON-parser meer nodig
  //   options.model                      moet in MODEL_ALLOWLIST (lib/ai.js)
  //                                      staan; bv. claude-haiku-4-5 voor
  //                                      goedkope classificatie
  +     'ai:(function(){'
  +       'function opts(prompt,options){options=options||{};return{prompt:prompt,system:options.system,'
  +         'maxOutputTokens:options.maxOutputTokens,model:options.model,schema:options.schema,'
  +         'cacheSystem:options.cacheSystem,onProgress:options.onProgress};}'
  +       'function ask(prompt,options){return aiSend(opts(prompt,options)).then(function(r){return r.text;});}'
  +       'ask.full=function(prompt,options){return aiSend(opts(prompt,options));};'
  +       'ask.json=function(prompt,options){options=options||{};'
  +         'if(!options.schema)return Promise.reject(aiError({error:"ai.ask.json() vereist options.schema (een JSON-schema).",code:"AI_INVALID_SCHEMA"}));'
  +         'return aiSend(opts(prompt,options)).then(function(r){return r.json;});};'
  +       'return{ask:ask};'
  +     '})(),'
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
  +     '},'
  +     'odoo:{'
  +       'listQueries:function(){return send("odooListQueries",{});},'
  +       'runQuery:function(queryId,params){return send("odooRunQuery",{queryId:queryId,params:params||{}},30000);}'
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
// ====== AI-brug (streamend) — host-kant =====================================
//
// De enige actie uit het iframe met een STREAMEND antwoord. De Worker-route
// POST /api/apps/:id/ai/ask?stream levert server-sent events; die worden hier
// gelezen en per stuk doorgestuurd naar het iframe als `__miniAppAiEvent`.
//
// Waarom dit bestaat (zie ONTWERP-ai-aanroep-architectuur.md §1): met een
// niet-streamende fetch kwamen er NUL bytes tot het volledige antwoord af was,
// waardoor de brug onmogelijk kon weten of Claude nog werkte of de verbinding
// dood was. De enige timeout stond daarom clientside en was een gok op de
// totaalduur -- drie keer opgetrokken (45s -> 180s -> 300s) en nog steeds fout,
// want hij annuleerde de serveraanroep niet eens. Nu levert elke delta een
// meetbaar levensteken en volstaat een inactiviteits-timeout.
//
// Isolatie per app: net als bij handleMiniAppStorageRequest komt appId ALTIJD
// van activeFrame, nooit uit het bericht zelf.
async function streamMiniAppAiAsk(frame, appId, data) {
  function post(event, payload, delta) {
    if (!frame) return;
    try {
      frame.frame.contentWindow.postMessage(
        { __miniAppAiEvent: true, id: data.id, event: event, delta: delta, payload: payload },
        '*'
      );
    } catch (_err) { /* iframe intussen weg -- niets meer te doen */ }
  }

  // AbortController voor DEZE specifieke aanroep, geregistreerd onder het id dat
  // de iframe-brug meegaf (data.id) -- zie de 'aiAbort'-actie in
  // handleMiniAppStorageRequest() hieronder. Zonder dit had een stall/hard-
  // timeout in de brug (MINI_APP_SHIM) geen enkele manier om de ECHTE fetch (en,
  // via request.signal in routes.js, de ECHTE aanroep naar Claude) alsnog af te
  // breken -- die liep gewoon door terwijl de brug al lokaal had opgegeven en de
  // aanroeper (bv. withRetry() in een mini-app) alweer een NIEUWE poging deed.
  var controller = new AbortController();
  aiAbortControllers[data.id] = controller;
  function cleanupController() {
    if (aiAbortControllers[data.id] === controller) delete aiAbortControllers[data.id];
  }

  var res;
  try {
    res = await apiFetch(`/mini-apps/api/apps/${appId}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: data.prompt,
        system: data.system,
        maxOutputTokens: data.maxOutputTokens,
        model: data.model,
        schema: data.schema,
        cacheSystem: data.cacheSystem,
        stream: true
      }),
      signal: controller.signal
    });
  } catch (err) {
    cleanupController();
    if (err && err.name === 'AbortError') return; // bewust geannuleerd (aiAbort) -- de brug heeft al lokaal afgehandeld, niets meer te posten
    post('error', { error: 'Kon de AI-aanroep niet starten: ' + err.message, code: 'AI_BRIDGE_UNAVAILABLE', retryable: true, phase: 'bridge' });
    return;
  }

  // Een foutstatus vóór de stream begint (403 geen toegang, 404 app weg, 429
  // rate-limit als die al vóór het streamen geraakt wordt): gewone JSON-body,
  // die het foutcontract al bevat.
  if (!res.ok || !res.body) {
    cleanupController();
    var errBody = null;
    try { errBody = await res.json(); } catch (_err) { /* geen JSON -- val terug */ }
    post('error', (errBody && errBody.code)
      ? errBody
      : { error: (errBody && errBody.error) || ('Fout ' + res.status), code: 'AI_INTERNAL', retryable: false, phase: 'bridge' });
    return;
  }

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var settled = false;

  try {
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      // Chunks breken willekeurig af (ook midden in een regel of een
      // UTF-8-teken) -- daarom bufferen op '\n\n' en decoderen met
      // {stream:true}, nooit per chunk apart.
      buffer += decoder.decode(chunk.value, { stream: true });
      var sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        var raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        var eventName = 'message';
        var dataLines = [];
        raw.split('\n').forEach(function (line) {
          if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
          else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).trim());
        });
        if (dataLines.length === 0) continue;
        var parsed;
        try { parsed = JSON.parse(dataLines.join('\n')); } catch (_err) { continue; }

        if (eventName === 'delta') {
          post('delta', null, parsed.delta || '');
        } else if (eventName === 'open') {
          post('open', parsed);
        } else if (eventName === 'done') {
          settled = true;
          post('done', parsed);
        } else if (eventName === 'error') {
          settled = true;
          post('error', parsed);
        }
      }
    }
  } catch (err) {
    settled = true;
    cleanupController();
    if (err && err.name === 'AbortError') return; // bewust geannuleerd (aiAbort) -- niets meer te posten, de brug wist dit al lokaal
    post('error', { error: 'De verbinding met de server brak af tijdens de AI-aanroep: ' + err.message, code: 'AI_STREAM_INTERRUPTED', retryable: true, phase: 'bridge' });
    return;
  }

  cleanupController();
  if (!settled) {
    // Stream dicht zonder done/error: netwerk weggevallen of Worker gestopt.
    post('error', { error: 'De verbinding met de server brak af tijdens de AI-aanroep.', code: 'AI_STREAM_INTERRUPTED', retryable: true, phase: 'bridge' });
  }
}

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
      // AI loopt NIET via reply()/apiJson: het is de enige actie met een
      // streamend antwoord. streamMiniAppAiAsk() hieronder leest de SSE en
      // stuurt open/delta/done/error als aparte __miniAppAiEvent-berichten naar
      // het iframe -- zie de AI-brug in MINI_APP_SHIM bovenaan dit bestand.
      await streamMiniAppAiAsk(frame, appId, data);
      return;
    } else if (data.action === 'aiAbort') {
      // Verstuurd door de brug (MINI_APP_SHIM's abortHost()) zodra ZIJ lokaal
      // opgeeft op een aiAsk-aanroep (stall/hard-timeout) -- dit annuleert de
      // ECHTE, nog lopende fetch (en, via request.signal in routes.js, de
      // ECHTE aanroep naar Claude) i.p.v. die onzichtbaar te laten doorlopen.
      // Geen reply nodig: de brug wacht hier niet op, ze heeft haar promise al
      // lokaal afgehandeld.
      var ctrl = aiAbortControllers[data.abortId];
      if (ctrl) { try { ctrl.abort(); } catch (_err) { /* al afgebroken/klaar */ } }
      return;
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
    } else if (data.action === 'odooListQueries') {
      reply(true, await apiJson(`/mini-apps/api/apps/${appId}/odoo-queries`));
    } else if (data.action === 'odooRunQuery') {
      var odooRunResult = await apiJson(`/mini-apps/api/apps/${appId}/odoo-queries/${encodeURIComponent(data.queryId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: data.params })
      });
      // Uniforme afkap-waarschuwing: de tekst komt uit cascade-executor.js
      // (dezelfde motor als de Sales Insight Explorer-wizard) en wordt hier
      // altijd als toast getoond in de host-pagina -- ongeacht of de mini-app
      // zelf iets met result.meta doet in zijn eigen renderResults(). Zo mist
      // een gebruiker een afkap nooit, ook niet in een app die er geen UI voor
      // heeft voorzien.
      if (odooRunResult && odooRunResult.meta && odooRunResult.meta.truncated && odooRunResult.meta.truncated_message) {
        showToast(odooRunResult.meta.truncated_message, 'warning');
      }
      reply(true, odooRunResult);
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

// Foutobject uit een API-respons -> echte Error MET het volledige contract.
// Vóór 2026-08 deed dit `new Error(body.error)` en verdween body.code hier
// stil: zowel lib/ai.js als de providers zetten netjes een foutcode, maar die
// stierf in deze functie. Mini-apps konden daarna enkel nog reguliere
// expressies op Nederlandse foutteksten loslaten (Actiebladen Insights deed
// letterlijk /timeout|verliep/i en /limiet|limit/i) om onderscheid te maken
// tussen een timeout, een rate-limit van de provider, onze eigen daglimiet en
// een echte bug. Dit is de reparatie die de hele foutcontract-keten pas laat
// werken -- zie src/modules/mini-apps/lib/ai-errors.js.
function apiErrorFrom(body, status) {
  var err = new Error((body && body.error) || ('Fout ' + status));
  if (body && body.code) err.code = body.code;
  if (body && typeof body.retryable === 'boolean') err.retryable = body.retryable;
  if (body && body.retryAfterMs != null) err.retryAfterMs = body.retryAfterMs;
  if (body && body.phase) err.phase = body.phase;
  if (body && body.providerStatus != null) err.providerStatus = body.providerStatus;
  if (body && body.requestId) err.requestId = body.requestId;
  if (body && body.stopReason) err.stopReason = body.stopReason;
  err.httpStatus = status;
  return err;
}

async function apiJson(url, options) {
  var res = await apiFetch(url, options);
  var body = await res.json();
  if (!res.ok || body.success === false) {
    throw apiErrorFrom(body, res.status);
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
  if (isAdmin) {
    // Onthult enkel het "Config"-tabblad (Chat-kanalen + AI-gebruiksrapport) --
    // het rapport zelf laadt pas zodra dat tabblad daadwerkelijk geopend wordt
    // (zie mini-apps-bootstrap.js), niet hier: de grafiekjes in
    // mini-apps-admin-ai-usage.js renderen anders in een nog verborgen (display:none)
    // tabpanel, wat Chart.js met een canvas van 0x0 pixels oplevert.
    var configTab = document.getElementById('tabMiniAppsConfig');
    if (configTab) configTab.classList.remove('hidden');
  }
  if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
  // window.renderSharedNavbar() hierboven vervangt de VOLLEDIGE #navbar-HTML
  // (zie public/shared-navbar.js) -- dat wist ook alles wat we zelf
  // client-side hadden toegevoegd aan #navbarFavorites: de "Terug"-link
  // (insertNavbarBackLink(), enkel zichtbaar terwijl een app fullscreen open
  // staat) EN de favorieten-nudge-tegel. Zonder deze twee opnieuw toe te
  // voegen verdwijnt "Terug" bijvoorbeeld zodra renderNavbar() ergens
  // tussendoor wordt aangeroepen terwijl een app nog open staat (bv. net na
  // confirmFavoriteNudge() -> persistFavoritesOrder() -> renderNavbar()).
  // window.renderSharedNavbar() hierboven (public/shared-navbar.js) doet
  // ONDERTUSSEN zelf ook al enhanceNavbarFavoriteLinks()/appendNavbarMoreLink()/
  // lucide.createIcons() -- dat is nu APP-BREED gedeelde logica (werkt op elke
  // moderne module, niet enkel hier), dus geen duplicatie meer nodig in dit
  // mini-apps-eigen bestand. Hier blijft enkel wat ECHT mini-apps-specifiek is:
  // de "Terug"-link (enkel relevant tijdens de fullscreen-viewer van DEZE
  // module) en de favorieten-nudge.
  if (activeFrame) insertNavbarBackLink();
  renderFavoriteNudge();
  lucide.createIcons();
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

// ====== Favorieten-nudge ======
//
// Wie een mini-app opent die nog GEEN favoriet is (bv. via een doorgestuurde
// link, of gewoon "Openen" vanuit de gedeeld-met-mij-lijst) krijgt tijdelijk
// een extra tegel vooraan in de navbar-favorietenbalk (naast de "Terug"-link),
// met een kleine callout die vraagt om de app aan de favorieten toe te voegen.
// Bewust GEEN persistente "niet meer tonen"-onthouding: de nudge mag elke
// keer opnieuw verschijnen, ook als hij eerder werd weggeklikt. De tegel zelf
// verdwijnt altijd zodra de app sluit (zie closeAppFullscreen), ongeacht of
// de gebruiker de callout intussen bevestigde of wegklikte.
function showFavoriteNudge(appMeta) {
  favoriteNudgeApp = appMeta || null;
  renderFavoriteNudge();
}

function hideFavoriteNudge() {
  favoriteNudgeApp = null;
  var el = document.getElementById('miniAppFavNudge');
  if (el) el.remove();
}

// Enkel de callout wegklikken -- de tegel zelf (die de app nog toont, gewoon
// nog niet als favoriet) blijft staan tot de app sluit.
function dismissFavoriteNudgeCallout() {
  var callout = document.getElementById('miniAppFavNudgeCallout');
  if (callout) callout.remove();
}

async function confirmFavoriteNudge(id) {
  var appMeta = (favoriteNudgeApp && favoriteNudgeApp.id === id) ? favoriteNudgeApp : apps.find(function(a) { return a.id === id; });
  hideFavoriteNudge();

  // Optimistisch: meteen vooraan toevoegen aan de in-memory favorietenlijst en
  // zowel de in-page strip als de navbar-balk herteken VOOR de round-trip
  // terugkomt -- anders verschijnt de favoriet pas na een volledige
  // paginaherlaad (en dan nog achteraan, want de server-volgorde staat pas
  // bij de volgende renderNavbar()-call goed).
  var alreadyFavorite = favorites.some(function(f) { return f.id === id; });
  if (appMeta && !alreadyFavorite) {
    favorites = [{ id: appMeta.id, title: appMeta.title, icon: appMeta.icon }].concat(favorites);
    renderFavoritesSection();
    renderNavbarFavoriteOptimistic(favorites[0]);
  }

  try {
    // Volgorde is hier belangrijk: eerst als favoriet markeren (de server
    // voegt een NIEUWE favoriet typisch gewoon ACHTERAAN toe aan de
    // opgeslagen volgorde) -- daarna EXPLICIET onze eigen volgorde
    // opslaan (persistFavoritesOrder(), met de nieuwe favoriet vooraan,
    // exact zoals we 'm hierboven al tonen). Zonder die tweede stap zou de
    // favoriet, zodra de PUT hieronder + de daaropvolgende
    // loadFavorites()/renderNavbar() terugkomen, alsnog naar de
    // server-volgorde (achteraan) verspringen.
    await apiJson(`/mini-apps/api/apps/${id}/favorite`, { method: 'PUT' });
    await persistFavoritesOrder();
    await loadApps();
  } catch (err) {
    showToast('Favoriet toevoegen mislukt: ' + err.message, 'error');
    // Rollback: herlaad de echte staat (de optimistische invoeging hierboven
    // klopt dan niet meer, want de server-aanroep is mislukt).
    await Promise.all([loadApps(), loadFavorites(), renderNavbar()]);
  }
}

// Toont de zonet toegevoegde favoriet METEEN als een echte navbar-favoriet-
// tegel (zelfde opmaak als navbar.js zou renderen), vooraan in de balk --
// puur om de wachttijd tot de volgende renderNavbar()-round-trip te
// overbruggen. Wordt hoe dan ook overschreven zodra renderNavbar() de
// server-waarheid terugkrijgt.
function renderNavbarFavoriteOptimistic(fav) {
  var container = document.getElementById('navbarFavorites');
  if (!container || !fav) return;
  var existing = container.querySelector('[data-optimistic-fav="' + fav.id + '"]');
  if (existing) return;

  var a = document.createElement('a');
  a.href = '/mini-apps?app=' + encodeURIComponent(fav.id);
  a.dataset.optimisticFav = fav.id;
  a.dataset.favId = fav.id;   // zodat bindFavoritesDragAndDrop('navbarFavorites') 'm meteen als draggable-tegel herkent
  a.draggable = true;
  a.className = 'btn btn-xs btn-ghost border border-base-300 gap-1.5 font-normal text-base-content/70 hover:text-base-content hover:border-primary/40 max-w-[9rem]';
  a.title = fav.title;
  a.innerHTML = `<i data-lucide="${fav.icon || 'puzzle'}" class="w-3 h-3"></i><span class="truncate">${escapeHtml(fav.title)}</span>`;

  var backLink = document.getElementById('miniAppNavbarBack');
  container.insertBefore(a, backLink ? backLink.nextSibling : container.firstChild);
  var divider = document.getElementById('navbarFavoritesDivider');
  if (divider) divider.classList.remove('hidden');
  lucide.createIcons();
}

function renderFavoriteNudge() {
  var container = document.getElementById('navbarFavorites');
  if (!container) return;
  var existing = document.getElementById('miniAppFavNudge');
  if (existing) existing.remove();
  if (!favoriteNudgeApp) return;

  var wrap = document.createElement('div');
  wrap.id = 'miniAppFavNudge';
  wrap.className = 'relative inline-flex';
  wrap.innerHTML = `<button type="button" class="btn btn-xs btn-ghost border border-dashed border-primary/50 gap-1.5 font-normal text-base-content/70" data-action="confirmFavoriteNudge" data-id="${favoriteNudgeApp.id}" title="Toevoegen aan favorieten">
      <i data-lucide="${favoriteNudgeApp.icon || 'puzzle'}" class="w-3.5 h-3.5"></i>
      ${escapeHtml(favoriteNudgeApp.title)}
    </button>
    <div id="miniAppFavNudgeCallout" class="absolute top-full left-0 mt-1 z-20 bg-base-100 border border-primary/40 shadow-lg rounded-lg p-2 text-xs w-48 flex items-start gap-1.5">
      <i data-lucide="heart" class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5"></i>
      <span class="flex-1">Toevoegen aan je favorieten-balk?</span>
      <button type="button" class="btn btn-ghost btn-xs btn-circle" data-action="dismissFavoriteNudgeCallout" title="Negeren">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    </div>`;

  // Vooraan, maar NA de "Terug"-link als die er is (zodat die altijd het
  // meest linkse blokje blijft) -- anders als eerste kind.
  var backLink = document.getElementById('miniAppNavbarBack');
  if (backLink) {
    container.insertBefore(wrap, backLink.nextSibling);
  } else {
    container.insertBefore(wrap, container.firstChild);
  }
  var divider = document.getElementById('navbarFavoritesDivider');
  if (divider) divider.classList.remove('hidden');
  lucide.createIcons();
}

// ============================================================================
// Odoo-discovery voor de bouw-/bijwerk-prompt
//
// Een mini-app wordt gebouwd/bijgewerkt in een APART Claude-gesprek. Vroeger
// bakten de prompt-knoppen daarom een momentopname van een query (veldnamen +
// een paar voorbeeldrijen) in de gekopieerde tekst -- die was verouderd zodra
// de query nadien wijzigde, en ze zei niets over welke andere queries bestaan.
//
// In plaats daarvan vragen we hier een kortlevend, read-only discovery-token
// aan en zetten we de bijbehorende URL's in de prompt. Het model haalt de
// actuele structuur dan zelf op tijdens het gesprek. Het token geeft enkel
// toegang tot de STRUCTUUR van gedeelde queries -- echt data ophalen blijft
// window.platform.odoo.runQuery() met de sessie van de ingelogde gebruiker.
// ============================================================================
async function requestOdooDiscoveryToken() {
  return await apiJson('/mini-apps/api/apps/odoo-discovery-token', { method: 'POST' });
}

// De tekstblok die aan elke prompt (bouwen én bijwerken) wordt toegevoegd.
// Bevat de URL's, de vervaldatum en -- belangrijk -- de VERPLICHTE
// fallback-patronen die de gegenereerde app moet bevatten.
function odooDiscoveryPromptSection(tokenInfo, options) {
  options = options || {};
  var expires = tokenInfo.expires_at ? new Date(tokenInfo.expires_at).toLocaleDateString('nl-BE') : 'binnenkort';
  var queryOverview = [];
  if (Array.isArray(tokenInfo.queries) && tokenInfo.queries.length > 0) {
    queryOverview.push('Beschikbare gedeelde queries (naam -- omschrijving -- basismodel):');
    tokenInfo.queries.forEach(function(q) {
      queryOverview.push('  - ' + q.name + (q.description ? ' -- ' + q.description : '') + ' (' + q.base_model + ')');
    });
    queryOverview.push('Dit is enkel een overzicht zodat je weet wat er bestaat (bv. wat "' + tokenInfo.queries[0].name + '" precies is) -- de exacte veldnamen haal je nog steeds op via stap 2 hieronder voor de query die je effectief gaat gebruiken.');
  } else {
    queryOverview.push('Er zijn momenteel GEEN queries gedeeld met mini-apps. Zeg dat expliciet: er moet eerst in Sales Insight Explorer een zoekopdracht bewaard en aangevinkt worden als "ook beschikbaar voor mini-apps".');
  }
  var lines = [
    '--- ODOO-QUERIES OPVRAGEN (doe dit zelf, tijdens dit gesprek) ---',
    '',
    'Welke Odoo-data beschikbaar is, moet je NIET aan mij vragen en niet verzinnen: haal het op met een gewone HTTP-GET.',
    '',
  ].concat(queryOverview).concat([
    '',
    '1) Alle beschikbare (gedeelde) queries met hun veldnamen en parameters:',
    '   ' + tokenInfo.list_url,
    '2) Eén specifieke query, inclusief een klein live voorbeeldresultaat (vervang QUERY_ID door de id uit stap 1):',
    '   ' + tokenInfo.query_url_template,
    '   Enkel de structuur, zonder Odoo aan te spreken? Voeg &sample=0 toe.',
    '',
    'Dit token is read-only, geeft enkel de queries die met mini-apps gedeeld zijn, en verloopt op ' + expires + '.',
    'Kan je zelf geen URL\'s ophalen in dit gesprek? Zeg dat dan expliciet en vraag mij om de inhoud van bovenstaande link te plakken -- verzin geen veldnamen.',
    'Geeft de lijst niets terug (geen enkele gedeelde query), of past geen enkele query bij wat ik nodig heb? Zeg dat dan expliciet: dan moet er eerst in Sales Insight Explorer een zoekopdracht bewaard en aangevinkt worden als "ook beschikbaar voor mini-apps".',
    '',
    'De app zelf haalt data ALTIJD op met window.platform.odoo.runQuery(queryId, params) -- nooit via de discovery-URL hierboven (die is enkel voor jou, nu, om te weten hoe de query eruitziet) en nooit rechtstreeks bij Odoo.',
    '',
    'Vorm van het resultaat: { records: [...] }. Elk record is een rij van het basismodel. Gekoppelde modellen hangen als GENESTE sleutels met dubbele underscore aan dat record (bv. record.__contactpersonen is een array, record.__gebouw is één object of null) en kunnen zelf weer geneste __-sleutels bevatten. De discovery-URL hierboven geeft per query exact welke sleutels bestaan en of ze een array of één object zijn (veld "shape").',
    '',
    'Twee dingen die de VELDNAMEN EN -VORM in het resultaat beinvloeden, en dus ook je "NODIGE_VELDEN"-controle hieronder:',
    '  - Studio-prefixen (x_ en x_studio_) worden er automatisch afgehaald: "x_studio_has_reserve_account" komt binnen als "has_reserve_account". Gebruik dus de KORTE naam, ook in NODIGE_VELDEN.',
    '  - Een geneste relatie (record.__iets) komt binnen als [id, "naam"] -- net als Odoo’s eigen many2one-velden -- als er voor die relatie GEEN extra velden gekozen zijn (enkel id + naam). Zijn er wel extra velden gekozen, of hangt er zelf nog een cascade onder, dan blijft het een volledig object ({id, naam, ...}). De discovery-URL toont per query welke vorm van toepassing is.',
    '  - Een veld dat op een record ONTBREEKT had de waarde false (leeg/niet aangevinkt/niet ingevuld) -- weggelaten om de payload compact te houden, net omdat dit vaak naar een AI gaat. Lees een optioneel veld dus altijd als `record.veld || standaardwaarde`, nooit met een aanname dat de key bestaat.',
    '',
    'VERPLICHT in de app-code (twee fallbacks, geen dynamisch schema-systeem nodig -- gewoon deze twee simpele controles):',
    '',
    '  // 1. Query bestaat niet meer / is niet langer gedeeld',
    '  var resultaat;',
    '  try {',
    '    resultaat = await window.platform.odoo.runQuery(QUERY_ID, {});',
    '  } catch (err) {',
    '    toonMelding("Deze query is niet meer beschikbaar. Vraag een beheerder om ze opnieuw te delen in Sales Insight Explorer.");',
    '    return;',
    '  }',
    '',
    '  // 2. Resultaat mist een veld dat de app nodig heeft (bv. na een wijziging aan de query)',
    '  // Check dit tegen resultaat.meta.fields, NIET tegen de sleutels van een',
    '  // los record: een veld dat gewoon false is op elk opgehaald record staat',
    '  // nergens in de records maar hoort wel degelijk bij de query (zie hierboven).',
    '  // resultaat.meta.fields is de vaste lijst van velden die de query ophaalt,',
    '  // ongeacht of ze op een specifiek record leeg waren.',
    '  var NODIGE_VELDEN = ["veld_a", "veld_b"];   // exact de sleutels die deze app gebruikt',
    '  var beschikbareVelden = (resultaat && resultaat.meta && resultaat.meta.fields) || [];',
    '  var ontbreekt = NODIGE_VELDEN.filter(function(f) { return beschikbareVelden.indexOf(f) === -1; });',
    '  if (ontbreekt.length > 0) {',
    '    toonMelding("Onbekende/ontbrekende velden in het resultaat: " + ontbreekt.join(", ") + ". De onderliggende zoekopdracht is waarschijnlijk aangepast.");',
    '    return;',
    '  }',
    '',
    'Beide meldingen moeten ZICHTBAAR in de UI staan (geen console.log, geen stille fout, geen crash), en de app moet verder bruikbaar blijven.'
  ]);
  if (options.extra) lines.push('', options.extra);
  return lines.join('\n');
}
