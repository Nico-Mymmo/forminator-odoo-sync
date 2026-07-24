/**
 * Mini-apps -- Favorieten-sectie + chat-kanalen-modal
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
    favoritesLoaded = true;
    renderFavoritesSection();
    // Kan de nudge-tegel intussen achterhaald zijn (bv. net favoriet gemaakt
    // vanuit een ander tabblad) -- herteken zodat hij verdwijnt zodra de open
    // app effectief favoriet is.
    if (favoriteNudgeApp && favorites.some(function(f) { return f.id === favoriteNudgeApp.id; })) {
      hideFavoriteNudge();
    }
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
  // draggable="true" + data-fav-id: sleep-en-neerzet-herordenen (zie
  // setupFavoritesDragAndDrop hieronder). De pijltjesknoppen blijven ernaast
  // bestaan als toegankelijk/mobiel-vriendelijk alternatief -- geen van
  // beide vervangt de andere, ze sturen allebei dezelfde persistFavoritesOrder().
  strip.innerHTML = favorites.map(function(fav, index) {
    return `<div class="join" draggable="true" data-fav-id="${fav.id}">
      <span class="btn btn-ghost btn-xs join-item cursor-grab active:cursor-grabbing px-1" title="Slepen om te herordenen">
        <i data-lucide="grip-vertical" class="w-3 h-3 pointer-events-none"></i>
      </span>
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
  reorderNavbarFavoritesDom();
  await persistFavoritesOrder();
}

// Gedeeld door moveFavorite (pijltjes) en de drag-and-drop-herordening
// hieronder -- beide passen eerst `favorites` + de weergave zelf aan
// (optimistisch), en roepen dit dan aan om op te slaan + terug te rollen bij
// een fout.
async function persistFavoritesOrder() {
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

// ====== Favorieten herordenen via slepen (enkel de in-page strip) ======
//
// LET OP -- reikwijdte bewust beperkt tot #favoritesStrip. De gedeelde
// navbar-balk (#navbarFavorites) is app-breed zichtbaar op elke moderne
// module-pagina, niet enkel hier -- die krijgt daarom zijn EIGEN, onafhankelijke
// drag-and-drop-afhandeling in public/shared-navbar.js (zodat slepen ook werkt
// op bv. /admin of /cx-automations, niet enkel binnen deze module). Zonder
// deze scheiding zouden twee losse dragstart/drop-systemen (hier EN in
// shared-navbar.js) om dezelfde #navbarFavorites-tegels vechten.
//
// #favoritesStrip zelf bestaat enkel op DEZE pagina (de mini-apps-
// overzichtpagina) en blijft dus terecht module-eigen UI/logica.
// Event delegation op `document` (niet op #favoritesStrip zelf), want de
// strip wordt bij elke renderFavoritesSection() volledig herbouwd
// (innerHTML) -- een rechtstreeks gebonden listener zou na de eerste
// herteken alweer weg zijn.
var dragFavoriteId = null;

function bindFavoritesDragAndDrop() {
  document.addEventListener('dragstart', function(e) {
    var item = e.target.closest('#favoritesStrip [data-fav-id]');
    if (!item) return; // ander sleepgedrag elders op de pagina niet blokkeren
    dragFavoriteId = item.dataset.favId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragFavoriteId); } catch (_err) { /* Firefox-quirk, negeerbaar */ }
    }
    item.classList.add('opacity-40');
  });

  document.addEventListener('dragend', function(e) {
    var item = e.target.closest('#favoritesStrip [data-fav-id]');
    if (item) item.classList.remove('opacity-40');
    dragFavoriteId = null;
    clearFavoriteDropIndicator();
  });

  document.addEventListener('dragover', function(e) {
    if (!dragFavoriteId) return;
    var target = resolveFavoriteDropTarget(e);
    if (!target) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    showFavoriteDropIndicator(target, e.clientX);
  });

  document.addEventListener('drop', function(e) {
    if (!dragFavoriteId) return;
    var target = resolveFavoriteDropTarget(e);
    var draggedId = dragFavoriteId;
    dragFavoriteId = null;
    clearFavoriteDropIndicator();
    if (!target || target.dataset.favId === draggedId) return;
    e.preventDefault();
    // VOOR of NA het doelblokje neerzetten, afhankelijk van op welke helft
    // (links/rechts van het midden) je loslaat -- zo kan je een favoriet
    // exact TUSSEN twee andere zetten i.p.v. enkel "op" een bestaande tegel
    // te moeten droppen (die altijd naar dezelfde kant verplaatste).
    var rect = target.getBoundingClientRect();
    var placeAfter = (e.clientX - rect.left) > (rect.width / 2);
    reorderFavoriteByDrag(draggedId, target.dataset.favId, placeAfter);
  });

  document.addEventListener('dragleave', function(e) {
    if (!dragFavoriteId) return;
    // Enkel opruimen als de cursor de HELE strip verlaat (niet enkel een
    // individuele tegel) -- anders knippert de indicator elke keer de cursor
    // over de tussenruimte tussen twee tegels beweegt (zie
    // resolveFavoriteDropTarget hieronder: die tussenruimte hoort net zo goed
    // bij de dropzone, maar vuurt op zich wel een dragleave van de vorige
    // tegel af).
    var related = e.relatedTarget;
    var stillInsideStrip = related && related.closest && related.closest('#favoritesStrip');
    if (!stillInsideStrip) clearFavoriteDropIndicator();
  });
}

// Geeft de tegel terug waar het (drag/drop-)event bij hoort te horen --
// zowel wanneer de cursor letterlijk BOVEN een tegel zit, als wanneer die in
// de tussenruimte TUSSEN twee tegels zit (bv. de flex-gap, of boven de
// stippellijn-indicator zelf, die zelf geen data-fav-id heeft). Zonder deze
// fallback viel de dropzone precies uit tussen twee tegels -- exact het
// gebied waar je een favoriet net TUSSEN twee andere wil neerzetten -- en gaf
// dat een geflikker (indicator verschijnt/verdwijnt) omdat elke dragover
// daar zonder geldig doelwit vroegtijdig afbrak.
function resolveFavoriteDropTarget(e) {
  var direct = e.target.closest('#favoritesStrip [data-fav-id]');
  if (direct) return direct;
  var container = e.target.closest('#favoritesStrip');
  if (!container) return null;
  var tiles = container.querySelectorAll('[data-fav-id]');
  var nearest = null;
  var nearestDist = Infinity;
  Array.prototype.forEach.call(tiles, function(tile) {
    var rect = tile.getBoundingClientRect();
    var center = rect.left + rect.width / 2;
    var dist = Math.abs(e.clientX - center);
    if (dist < nearestDist) { nearestDist = dist; nearest = tile; }
  });
  return nearest;
}

// ====== Visuele "hier komt 'm terecht"-indicator tijdens het slepen ======
//
// Bewust een ECHT tussengevoegd flex-kind (geen border/opacity op de tegel
// zelf) -- zo'n indicator-elementje neemt zelf ruimte in de flex-rij in, wat
// de buurtegels letterlijk een beetje uit elkaar duwt, in plaats van enkel
// een rand op een bestaande tegel te tonen (die niet duidelijk maakte TUSSEN
// welke twee tegels de favoriet precies zou landen). Eén gedeeld element,
// steeds verplaatst naar de juiste positie i.p.v. telkens een nieuwe aan te
// maken/verwijderen.
function getFavoriteDropIndicatorEl() {
  var el = document.getElementById('favoriteDropIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'favoriteDropIndicator';
    el.setAttribute('aria-hidden', 'true');
    // border-dashed op een border-l geeft het "verticaal stippellijntje"-effect;
    // self-stretch laat 'm de volledige hoogte van de rij (navbar-balk of
    // strip-rij) volgen, ongeacht of dat een <a> of een <div class="join"> is.
    el.className = 'self-stretch border-l-2 border-dashed border-primary mx-1 shrink-0 rounded-sm';
    el.style.minHeight = '1.5rem';
  }
  return el;
}

function showFavoriteDropIndicator(target, clientX) {
  var indicator = getFavoriteDropIndicatorEl();
  var parent = target.parentElement;
  if (!parent) return;
  var rect = target.getBoundingClientRect();
  var placeAfter = (clientX - rect.left) > (rect.width / 2);
  parent.insertBefore(indicator, placeAfter ? target.nextSibling : target);
}

function clearFavoriteDropIndicator() {
  var el = document.getElementById('favoriteDropIndicator');
  if (el && el.parentElement) el.parentElement.removeChild(el);
}

async function reorderFavoriteByDrag(draggedId, targetId, placeAfter) {
  var fromIndex = favorites.findIndex(function(f) { return f.id === draggedId; });
  if (fromIndex === -1) return;

  var reordered = favorites.slice();
  var moved = reordered.splice(fromIndex, 1)[0];
  var targetIndex = reordered.findIndex(function(f) { return f.id === targetId; });
  if (targetIndex === -1) return;
  var insertAt = placeAfter ? targetIndex + 1 : targetIndex;
  reordered.splice(insertAt, 0, moved);
  favorites = reordered;
  // Optimistisch: beide weergaves meteen bijwerken, VOOR de round-trip
  // (renderFavoritesSection voor de strip, reorderNavbarFavoritesDom voor de
  // navbar-balk -- zie mini-apps-core.js) -- persistFavoritesOrder() ververst
  // nadien de navbar sowieso nog eens via renderNavbar() met de servertruth.
  renderFavoritesSection();
  reorderNavbarFavoritesDom();
  await persistFavoritesOrder();
}

bindFavoritesDragAndDrop();

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

