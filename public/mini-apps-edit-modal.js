/**
 * Mini-apps -- App-modal ("Bewerken": tabs, code-editor, opslaan instellingen/code,
 * verwijderen) + mail-abonnement per app
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
    frame.srcdoc = instrumentAppHtml(currentAppContent, meta.isOwner);

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
    document.getElementById('appFrame').srcdoc = instrumentAppHtml(currentAppContent, currentApp && currentApp.isOwner);
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

