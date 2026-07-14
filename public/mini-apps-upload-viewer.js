/**
 * Mini-apps -- Upload-modal, link kopieren, kale fullscreen-viewer ("Openen")
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
    frame.srcdoc = instrumentAppHtml(contentResult.content, contentResult.isOwner);

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

