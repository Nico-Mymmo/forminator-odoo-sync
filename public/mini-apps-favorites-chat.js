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
// (niet-herordenbare) strip bovenaan deze pagina (renderFavoritesSection
// hieronder) -- beide tonen dezelfde, door de gebruiker zelf bepaalde
// volgorde (zie src/modules/mini-apps/lib/favorites.js). Herordenen gebeurt
// UITSLUITEND nog via de navbar-balk (sleep-en-neerzet, src/lib/components/
// navbar.js) -- de eigen pijltjes/drag-and-drop-implementatie van deze
// strip is bewust verwijderd (2026-07-31) om dubbele/verwarrende
// herorden-UI te vermijden; de onderliggende PUT /api/apps/favorites/order
// blijft gewoon bestaan voor de navbar. Na het toggelen herladen we telkens
// kaarten + strip + navbar, zodat alles meteen verschijnt/verdwijnt zonder
// volledige paginaherlaad.

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
  // Vaste volgorde, niet-herordenbaar vanaf deze pagina -- herordenen doe je
  // via de navbar-balk (sleep-en-neerzet, src/lib/components/navbar.js).
  strip.innerHTML = favorites.map(function(fav) {
    return `<button class="btn btn-ghost btn-xs gap-1.5 font-normal" data-action="openAppFullscreen" data-id="${fav.id}">
      <i data-lucide="${fav.icon || 'puzzle'}" class="w-3.5 h-3.5"></i>
      ${escapeHtml(fav.title)}
    </button>`;
  }).join('');
  lucide.createIcons();
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

