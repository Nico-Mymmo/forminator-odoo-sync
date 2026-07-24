/**
 * Mini-apps -- Event delegation (centrale click/change/keydown-listeners) + init
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

// ====== Event delegation ======

document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (el) {
    var action = el.dataset.action;
    if (action === 'openUploadModal') openUploadModal();
    else if (action === 'copyBuildPrompt') copyBuildPrompt();
    else if (action === 'closeUploadModal') closeUploadModal();
    else if (action === 'submitUpload') submitUpload();
    else if (action === 'setUploadSourceMode') setUploadSourceMode(el.dataset.mode);
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
    else if (action === 'saveExternalUrl') saveExternalUrl();
    else if (action === 'deleteApp') deleteApp();
    else if (action === 'openChatChannelsModal') openChatChannelsModal();
    else if (action === 'closeChatChannelsModal') closeChatChannelsModal();
    else if (action === 'submitChatChannel') submitChatChannel();
    else if (action === 'deleteChatChannel') deleteChatChannel(el.dataset.id);
    else if (action === 'confirmFavoriteNudge') confirmFavoriteNudge(el.dataset.id);
    else if (action === 'dismissFavoriteNudgeCallout') dismissFavoriteNudgeCallout();
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

// Browser-back/-forward: synchroniseer de fullscreen-viewer met de URL i.p.v.
// terug te vallen op de vorige pagina buiten /mini-apps (bv. de Operations
// Manager-homepage). openAppFullscreen()/closeAppFullscreen() in
// mini-apps-upload-viewer.js pushen/lezen de bijbehorende history-state;
// hier enkel de UI volgen, niet nogmaals de geschiedenis aanpassen (anders
// ontstaat een oneindige back/forward-lus).
window.addEventListener('popstate', function() {
  var appId = new URLSearchParams(location.search).get('app');
  if (appId) {
    if (!activeFrame || activeFrame.appId !== appId) openAppFullscreen(appId, { pushHistory: false });
  } else if (activeFrame) {
    closeAppFullscreen({ updateHistory: false });
  }
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
