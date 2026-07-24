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

