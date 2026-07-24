/**
 * Mini-apps -- Lijst (iconen-select, badges, renderAppCard/renderAppLists,
 * loadApps, collega-checkboxes, bouw-prompt)
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

// Externe-URL-apps (app_type === 'url', zie routes.js POST /api/apps/external)
// tonen een klein badge naast de titel om ze visueel te onderscheiden van
// gewone "html"-apps (geen code-editor, geen instrumentatie/shim mogelijk).
function externalUrlBadge(app) {
  if (app.app_type !== 'url') return '';
  return `<span class="badge badge-sm badge-outline gap-1" title="Externe app (URL)"><i data-lucide="external-link" class="w-3 h-3"></i></span>`;
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
  // Enkel deze twee staan nog in de card-actions-rij zodat ze nooit naar een
  // tweede lijn wrappen (zie header hierboven voor koppeling/favoriet).
  var editButton = app.isOwner
    ? `<button class="btn btn-secondary btn-sm gap-2 flex-1" data-action="openApp" data-id="${app.id}" title="Bewerken">
         <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
         Bewerken
       </button>`
    : '';

  // Koppeling (directe link) verhuisd naar de header-rij, naast de badges.
  var linkButton = `<button class="btn btn-ghost btn-sm btn-square" data-action="copyAppLink" data-id="${app.id}" title="Directe link kopiëren">
         <i data-lucide="link" class="w-3.5 h-3.5"></i>
       </button>`;

  // Favoriet (voor mezelf) en favoriet-voor-iedereen (enkel admins, server-side
  // ook afgedwongen in routes.js, user.role !== 'admin' -> 403) zijn samengevoegd
  // tot één control: gewone gebruikers zien enkel de hart-knop, admins krijgen
  // een dropdown met beide opties zodat er geen twee losse knoppen meer nodig zijn.
  var favActive = !!app.isFavorite;
  var globalFavActive = !!app.isGlobalFavorite;
  var favoriteControl;
  if (!isAdmin) {
    favoriteControl = `<button class="btn btn-ghost btn-sm btn-square${favActive ? ' text-error' : ''}" data-action="toggleFavorite" data-id="${app.id}" data-favorite="${favActive ? '1' : '0'}" title="${favActive ? 'Favoriet verwijderen' : 'Als favoriet markeren'}">
         <i data-lucide="heart" class="w-3.5 h-3.5${favActive ? ' fill-current' : ''}"></i>
       </button>`;
  } else {
    // Sterretje = favoriet voor iedereen, hartje = enkel voor mezelf favoriet --
    // dit ene icoon vervangt de losse gele "Voor iedereen"-badge die hier vroeger
    // stond (redundant: het sterretje zegt al hetzelfde).
    var mainIcon = globalFavActive ? 'star' : 'heart';
    var mainColorClass = globalFavActive ? ' text-warning' : (favActive ? ' text-error' : '');
    favoriteControl = `<div class="dropdown dropdown-end">
         <button type="button" tabindex="0" class="btn btn-ghost btn-sm btn-square${mainColorClass}" title="Favoriet-opties">
           <i data-lucide="${mainIcon}" class="w-3.5 h-3.5${(globalFavActive || favActive) ? ' fill-current' : ''}"></i>
         </button>
         <ul tabindex="0" class="dropdown-content menu menu-sm z-10 p-2 shadow bg-base-100 rounded-box w-56 border border-base-200">
           <li><a data-action="toggleFavorite" data-id="${app.id}" data-favorite="${favActive ? '1' : '0'}">
             <i data-lucide="heart" class="w-3.5 h-3.5${favActive ? ' fill-current text-error' : ''}"></i>
             ${favActive ? 'Favoriet verwijderen (voor mij)' : 'Favoriet voor mezelf'}
           </a></li>
           <li><a data-action="toggleGlobalFavorite" data-id="${app.id}" data-global-favorite="${globalFavActive ? '1' : '0'}">
             <i data-lucide="star" class="w-3.5 h-3.5${globalFavActive ? ' fill-current text-warning' : ''}"></i>
             ${globalFavActive ? 'Niet meer favoriet voor iedereen' : 'Favoriet voor iedereen'}
           </a></li>
         </ul>
       </div>`;
  }

  return `
    <div class="card bg-base-100 shadow-sm border border-base-200 hover:border-primary/40 transition-colors h-full">
      <div class="card-body p-4 h-full">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <i data-lucide="${app.icon || 'puzzle'}" class="w-4 h-4 text-base-content/50 shrink-0"></i>
            <h3 class="font-semibold text-sm truncate" title="${escapeHtml(app.title)}">${escapeHtml(app.title)}</h3>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${externalUrlBadge(app)}
            ${visibilityBadge(app)}
            ${linkButton}
            ${favoriteControl}
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
    appsLoaded = true;
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

BELANGRIJK, vermeld dit ALTIJD expliciet in je allereerste antwoord, ongeacht of ik zelf om AI vraag: deze omgeving ondersteunt AI-functionaliteit via window.platform.ai.ask() (zie verderop voor de technische details) -- laat me dus weten dat dat een optie is. Waarschuw er in datzelfde antwoord ook bij dat we momenteel de GRATIS laag van Gemini gebruiken, waarbij Google prompts/antwoorden mag gebruiken om hun modellen te trainen/verbeteren. Stuur daarom NOOIT gevoelige bedrijfsinformatie mee in een AI-prompt (klantgegevens, interne cijfers/omzet, wachtwoorden/secrets, strategische info, persoonsgegevens van collega's of klanten, ...) -- ook niet als ik dat zelf zou vragen of als het de gevraagde functionaliteit makkelijker zou maken: wijs me daar dan expliciet op i.p.v. het gewoon te doen, en stel een alternatief voor (bv. enkel geanonimiseerde/geaggregeerde tekst meesturen).

Begin met een laagdrempelige, open vraag: "Wat zou je graag willen maken, of wat moet de app precies doen?" Ga op basis van mijn antwoord verder in gesprek met gerichte, open vervolgvragen (geen meerkeuze/keuzemenu's) over input, output, berekeningen/regels en gewenste stijl, tot je genoeg weet om te beginnen coderen. Vraag daarbij ook altijd expliciet:
- Zijn er dingen die ENKEL de maker van de app (of een Operations Manager-admin) moet kunnen doen, die andere gebruikers niet mogen zien of gebruiken (bv. instellingen aanpassen, gevoelige data zien, iets verwijderen of aanpassen voor iedereen)? Gebruik in dat geval window.currentUser.isCreator/.isAdmin/.isPrivileged (zie verderop) om die functionaliteit in de UI te tonen of te verbergen voor wie het niet mag gebruiken.
- Heeft de gebruiker nood aan wat extra uitleg in de app zelf (bv. een korte intro-tekst bovenaan, tooltips bij minder voor de hand liggende velden, een duidelijke melding bij een leeg scherm met wat te doen)? Vraag dit gericht na in plaats van zomaar overal uitleg bij te schrijven -- te veel tekst kan een simpele tool net onoverzichtelijk maken.

Technische vereisten voor de uiteindelijke app (belangrijk, hou hier rekening mee):
- De output is ÉÉN volledig zelfstandig .html-bestand: alle CSS en JavaScript inline in <style>- en <script>-tags in dat ene bestand. Geen losse .css- of .js-bestanden, geen build-stap -- ook niet als tussenstap tijdens het bouwen zelf (bv. via losse bestandstools). Werk je in een omgeving die bestanden kan aanmaken, maak dan GEEN aparte .js/.css-bestanden aan, ook niet tijdelijk -- schrijf alles meteen in het ene .html-bestand. De Mini-apps-module kan enkel dat ene bestand opslaan/serveren; een <script src="..."> of <link href="..."> naar een lokaal bestand geeft altijd een 404 zodra de app draait.
- Gebruik ons designsysteem, exact zoals de rest van de Operations Manager:
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
  Gebruik Tailwind-utility-classes + daisyUI-componenten (btn, card, input, badge, ...) en Lucide-icons (<i data-lucide="...">, gevolgd door lucide.createIcons() na render).
- Plaats je enige <script>-blok altijd vlak vóór </body>, NA alle HTML (ook na <dialog>-elementen of andere UI die pas verderop in het bestand staat) -- of wrap alle initialisatiecode (getElementById-aanroepen, addEventListener op paginaelementen, ...) in document.addEventListener("DOMContentLoaded", function() { ... }). Een <script> hoger in het bestand (bv. in <head> of bovenaan <body>) draait namelijk voordat de browser de rest van de HTML heeft ingelezen, waardoor getElementById(...) op een element dat pas verderop staat null teruggeeft en een addEventListener-aanroep daarop een crash geeft. Ga er sowieso nooit van uit dat getElementById(...) een element teruggeeft -- check dat (of laat de fout duidelijk zien) voor je er iets mee doet.
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
- window.currentUser bevat ook drie rol-vlaggen, handig om extra functionaliteit te tonen/verbergen: isCreator (deze gebruiker heeft de app gemaakt/is eigenaar), isAdmin (deze gebruiker is Operations Manager-admin) en isPrivileged (isCreator OF isAdmin -- handige kortere check). Bv.: als (window.currentUser && window.currentUser.isPrivileged) is, een "Beheer"-tabblad of -knop tonen. Dit is puur UI-gemak, geen beveiliging -- gebruik er dus geen gevoelige logica achter die écht afgeschermd moet zijn (dat kan sowieso niet: de app heeft geen toegang tot andermans data, enkel tot zijn eigen window.sharedStorage).
- Moet de app iets doen MET/VOOR een specifieke collega (bv. een taak toewijzen, iemand kiezen uit een lijst)? Gebruik var collega's = await window.platform.listColleagues(); -- geeft [{ id, full_name, email }, ...] terug van alle actieve collega's (zelfde lijst als de share-picker in deze module). full_name is hier altijd een niet-lege string (het platform valt zelf terug op e-mail/"Onbekend" als iemand geen naam invulde) -- je hoeft dat dus zelf niet af te vangen, wel gewoon gebruiken zoals het is. Gebruik altijd het id-veld om een collega te identificeren in window.sharedStorage, niet de naam (namen kunnen dubbel zijn).
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
- Moet de app iets laten doen met AI (bv. een tekst samenvatten, iets classificeren, een suggestie/herschrijving genereren)? Gebruik window.platform.ai.ask(prompt, opties) -- stuurt ÉÉN prompt (+ optioneel een system-instructie) server-side naar een AI-model en geeft het antwoord terug, zonder dat de app zelf een API-key nodig heeft. BELANGRIJK (herhaling van hierboven, want dit is waar het telt): dit draait momenteel op de GRATIS laag van Gemini -- neem NOOIT gevoelige bedrijfsinformatie op in de prompt die je hier opbouwt (klantgegevens, interne cijfers, wachtwoorden, strategie, persoonsgegevens, ...), Google mag dat gebruiken om hun modellen te trainen:
    var antwoord = await window.platform.ai.ask("Vat deze tekst samen in 3 bullets: " + tekst);
    // of met een system-instructie (stijl/rol voor het model) en een striktere lengte-cap op het antwoord:
    var antwoord2 = await window.platform.ai.ask("Classificeer dit bericht als 'urgent' of 'normaal': " + bericht, {
      system: "Antwoord met exact één woord: urgent of normaal.",
      maxOutputTokens: 20   // optioneel, wordt sowieso begrensd server-side
    });
  antwoord is een platte string (het model-antwoord). Dit is bewust single-shot (GEEN chatgeschiedenis/multi-turn-geheugen) -- roep het per losse vraag aan, bewaar zelf in window.sharedStorage wat je van eerdere antwoorden wil onthouden. Max 8000 tekens per prompt, max 200 AI-aanroepen per app per dag (kostenbeheersing) -- vang een afgewezen aanroep (bv. daglimiet bereikt) op met een duidelijke foutmelding in de UI i.p.v. stil te falen. Stuur geen wachtwoorden/geheimen in de prompt.

Zodra je voldoende weet: lever het eindresultaat op als een ECHT, downloadbaar .html-bestand (bv. via een artifact/bestand dat ik kan opslaan) -- NIET als platte tekst of enkel een codeblok in de chat. Ik wil dat bestand direct kunnen downloaden en zonder verdere aanpassingen kunnen uploaden in de Mini-apps-module. Nogmaals: geen aparte .js/.css-bestanden, ook niet als tussenstap -- alles inline in dat ene bestand.`;

function copyBuildPrompt() {
  navigator.clipboard.writeText(BUILD_PROMPT).then(function() {
    showToast('Prompt gekopieerd — plak hem in een Claude-gesprek.', 'success');
  }, function() {
    showToast('Kopiëren mislukt.', 'error');
  });
}

