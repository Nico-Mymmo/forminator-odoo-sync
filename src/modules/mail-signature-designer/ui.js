/**
 * Mail Signature Designer - UI
 *
 * Full-page HTML template, matching the project's module UI pattern.
 * Three tabs: Builder · Push · Logs
 */

import { navbar } from '../../lib/components/navbar.js';

export function mailSignatureDesignerUI(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signature Designer</title>
  <script>
    (function initThemeEarly() {
      try {
        const localTheme = localStorage.getItem('selectedTheme');
        const cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
        const cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        const theme = localTheme || cookieTheme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
  <script>
    (function suppressTailwindCdnWarning() {
      const originalWarn = console.warn;
      console.warn = function(...args) {
        if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com should not be used in production')) return;
        return originalWarn.apply(this, args);
      };
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    #preview-frame { border: none; width: 100%; min-height: 280px; background: #fff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .log-row-fail { background-color: oklch(var(--er) / 0.08); }
  </style>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-7xl">

      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-4xl font-bold mb-2">Signature Designer</h1>
        <p class="text-base-content/60">Ontwerp en push e-mailhandtekeningen voor Google Workspace</p>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-lifted mb-6">
    <button role="tab" class="tab tab-active" data-tab="builder" onclick="switchTab('builder', this)">
      <i data-lucide="pencil" class="w-4 h-4 mr-2"></i> Builder
    </button>
    <button role="tab" class="tab" data-tab="push" onclick="switchTab('push', this)">
      <i data-lucide="send" class="w-4 h-4 mr-2"></i> Push
    </button>
    <button role="tab" class="tab" data-tab="logs" onclick="switchTab('logs', this)">
      <i data-lucide="list" class="w-4 h-4 mr-2"></i> Logs
    </button>
  </div>

  <!-- ─── TAB: Builder ────────────────────────────────────────────────── -->
  <div id="tab-builder" class="tab-content active">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Left: Config form -->
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title text-base">Configuratie</h2>
          <form id="config-form" class="space-y-4">

            <!-- Branding -->
            <div class="divider text-xs">Branding</div>
            <label class="form-control">
              <div class="label"><span class="label-text">Logo URL</span></div>
              <input type="url" name="logoUrl" placeholder="https://…/logo.png" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">Brand naam</span></div>
              <input type="text" name="brandName" placeholder="OpenVME" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">Website URL</span></div>
              <input type="url" name="websiteUrl" placeholder="https://openvme.be" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">Primaire kleur</span></div>
              <input type="color" name="primaryColor" value="#1d4ed8" class="input input-bordered input-sm w-24" />
            </label>

            <!-- Photo -->
            <div class="divider text-xs">Foto</div>
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="showPhoto" class="checkbox checkbox-sm" />
              <span class="label-text">Profielfoto tonen</span>
            </label>

            <!-- CTA button -->
            <div class="divider text-xs">CTA Knop</div>
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="showCTA" class="checkbox checkbox-sm" />
              <span class="label-text">CTA knop tonen</span>
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">CTA tekst</span></div>
              <input type="text" name="ctaText" placeholder="Bekijk onze diensten" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">CTA URL</span></div>
              <input type="url" name="ctaUrl" placeholder="https://openvme.be" class="input input-bordered input-sm" />
            </label>

            <!-- Banner -->
            <div class="divider text-xs">Banner</div>
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="showBanner" class="checkbox checkbox-sm" />
              <span class="label-text">Banner tonen</span>
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">Banner afbeelding URL</span></div>
              <input type="url" name="bannerImageUrl" placeholder="https://…/banner.png" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">Banner link URL</span></div>
              <input type="url" name="bannerLinkUrl" placeholder="https://openvme.be" class="input input-bordered input-sm" />
            </label>

            <!-- Disclaimer -->
            <div class="divider text-xs">Disclaimer</div>
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="showDisclaimer" class="checkbox checkbox-sm" />
              <span class="label-text">Disclaimer tonen</span>
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text">Disclaimer tekst</span></div>
              <textarea name="disclaimerText" rows="3" placeholder="Dit bericht is vertrouwelijk…" class="textarea textarea-bordered textarea-sm"></textarea>
            </label>

            <div class="flex gap-2 pt-2">
              <button type="button" onclick="saveConfig()" class="btn btn-primary btn-sm">Opslaan</button>
              <button type="button" onclick="updatePreview()" class="btn btn-ghost btn-sm">Preview</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Right: Preview + sample user -->
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <h2 class="card-title text-base">Preview</h2>

          <!-- Employee dropdown -->
          <div class="form-control">
            <div class="label"><span class="label-text text-xs font-medium">Medewerker uit Odoo</span></div>
            <div class="flex gap-2">
              <select id="prev-employee-select" class="select select-bordered select-xs flex-1" onchange="onEmployeeSelect(this)">
                <option value="">— Laad medewerkers… —</option>
              </select>
              <button onclick="loadEmployees()" class="btn btn-ghost btn-xs" title="Vernieuwen">
                <i data-lucide="refresh-cw" class="w-3 h-3"></i>
              </button>
            </div>
          </div>

          <div class="divider text-xs my-1">of vul handmatig in</div>

          <!-- Sample user fields (editable, populated by dropdown) -->
          <div class="grid grid-cols-2 gap-2">
            <label class="form-control col-span-2">
              <div class="label"><span class="label-text text-xs">Naam</span></div>
              <input type="text" id="prev-fullName" value="Jan De Vries" class="input input-bordered input-xs" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text text-xs">Rol</span></div>
              <input type="text" id="prev-roleTitle" value="Syndicus" class="input input-bordered input-xs" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text text-xs">E-mail</span></div>
              <input type="email" id="prev-email" value="jan@mymmo.com" class="input input-bordered input-xs" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text text-xs">Telefoon</span></div>
              <input type="text" id="prev-phone" value="" class="input input-bordered input-xs" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text text-xs">Foto URL</span></div>
              <input type="url" id="prev-photoUrl" value="" placeholder="https://…" class="input input-bordered input-xs" />
            </label>
          </div>
          <button onclick="updatePreview()" class="btn btn-outline btn-xs w-fit">Vernieuwen</button>

          <!-- Warnings -->
          <div id="preview-warnings" class="hidden">
            <div class="alert alert-warning text-xs py-2">
              <i data-lucide="alert-triangle" class="w-4 h-4"></i>
              <ul id="preview-warnings-list"></ul>
            </div>
          </div>

          <!-- HTML iframe preview -->
          <div class="border border-base-300 rounded-lg overflow-hidden">
            <iframe id="preview-frame" title="Signature preview"></iframe>
          </div>
        </div>
      </div>
    </div>
  </div><!-- /tab-builder -->

  <!-- ─── TAB: Push ───────────────────────────────────────────────────── -->
  <div id="tab-push" class="tab-content">
    <div class="card bg-base-100 shadow max-w-3xl">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">Signature pushen</h2>
        <p class="text-sm text-base-content/60">
          Selecteer één of meerdere gebruikers. De handtekening wordt opgesteld op basis van de opgeslagen configuratie.
          Gebruikersdata (naam, foto, …) wordt live opgehaald via de Directory API.
        </p>

        <!-- Search users -->
        <div class="flex gap-2">
          <input type="text" id="push-search" placeholder="Zoek op naam of e-mailadres…" class="input input-bordered input-sm flex-1" />
          <button onclick="searchUsers()" class="btn btn-outline btn-sm">Zoeken</button>
          <button onclick="loadAllUsers()" class="btn btn-ghost btn-sm">Alle laden</button>
        </div>

        <!-- User list -->
        <div id="push-user-list" class="overflow-y-auto max-h-72 border border-base-300 rounded-lg hidden">
          <table class="table table-xs w-full">
            <thead>
              <tr>
                <th><input type="checkbox" id="push-select-all" class="checkbox checkbox-xs" onchange="toggleSelectAll(this)" /></th>
                <th>Naam</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody id="push-user-tbody"></tbody>
          </table>
        </div>

        <button onclick="pushSelected()" class="btn btn-primary btn-sm w-fit">
          <i data-lucide="send" class="w-4 h-4 mr-2"></i> Pushen
        </button>

        <!-- Push result -->
        <div id="push-result" class="hidden"></div>
      </div>
    </div>
  </div><!-- /tab-push -->

  <!-- ─── TAB: Logs ───────────────────────────────────────────────────── -->
  <div id="tab-logs" class="tab-content">
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-4">
        <div class="flex items-center justify-between">
          <h2 class="card-title text-base">Push logs</h2>
          <button onclick="loadLogs()" class="btn btn-outline btn-sm">
            <i data-lucide="refresh-cw" class="w-4 h-4 mr-1"></i> Vernieuwen
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="table table-xs w-full">
            <thead>
              <tr>
                <th>Tijdstip</th>
                <th>Actor</th>
                <th>Doelgebruiker</th>
                <th>SendAs</th>
                <th>Status</th>
                <th>Fout</th>
              </tr>
            </thead>
            <tbody id="logs-tbody">
              <tr><td colspan="6" class="text-center text-base-content/40 py-4">Logs laden…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div><!-- /tab-logs -->

    </div><!-- /container -->
  </div><!-- /padding-top -->

<script>
// ════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = \`alert alert-\${type} fixed bottom-4 right-4 z-50 w-80 shadow-lg text-sm\`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
}

// ════════════════════════════════════════════════════════
// Tab switching
// ════════════════════════════════════════════════════════
function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('[role=tab]').forEach(el => el.classList.remove('tab-active'));
  $('tab-' + tabName).classList.add('active');
  btn.classList.add('tab-active');
  lucide.createIcons();
  if (tabName === 'logs') loadLogs();
}

// ════════════════════════════════════════════════════════
// Config form helpers
// ════════════════════════════════════════════════════════
function getFormConfig() {
  const f = $('config-form');
  const data = new FormData(f);
  return {
    logoUrl:        data.get('logoUrl')        || '',
    brandName:      data.get('brandName')      || '',
    websiteUrl:     data.get('websiteUrl')     || '',
    primaryColor:   data.get('primaryColor')   || '#1d4ed8',
    showPhoto:      f.querySelector('[name=showPhoto]').checked,
    showCTA:        f.querySelector('[name=showCTA]').checked,
    ctaText:        data.get('ctaText')        || '',
    ctaUrl:         data.get('ctaUrl')         || '',
    showBanner:     f.querySelector('[name=showBanner]').checked,
    bannerImageUrl: data.get('bannerImageUrl') || '',
    bannerLinkUrl:  data.get('bannerLinkUrl')  || '',
    showDisclaimer: f.querySelector('[name=showDisclaimer]').checked,
    disclaimerText: data.get('disclaimerText') || ''
  };
}

function applyConfigToForm(config) {
  if (!config) return;
  const f = $('config-form');
  const set = (name, val) => {
    const el = f.querySelector(\`[name=\${name}]\`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
  };
  Object.keys(config).forEach(k => set(k, config[k]));
}

// ════════════════════════════════════════════════════════
// Load config on boot
// ════════════════════════════════════════════════════════
async function loadConfig() {
  try {
    const res = await fetch('/mail-signatures/api/config');
    const json = await res.json();
    if (json.success && json.data?.config) {
      applyConfigToForm(json.data.config);
    }
  } catch (e) {
    console.error('loadConfig error:', e);
  }
}

async function saveConfig() {
  const config = getFormConfig();
  try {
    const res = await fetch('/mail-signatures/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    });
    const json = await res.json();
    if (json.success) {
      showToast('Configuratie opgeslagen', 'success');
      updatePreview();
    } else {
      showToast('Opslaan mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Netwerkfout: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
// Employees dropdown
// ════════════════════════════════════════════════════════
let _employees = [];

async function loadEmployees() {
  const sel = $('prev-employee-select');
  sel.innerHTML = '<option value="">Laden…</option>';
  try {
    const res = await fetch('/mail-signatures/api/employees');
    const json = await res.json();
    if (json.success) {
      _employees = json.data.employees || [];
      sel.innerHTML = '<option value="">— Kies medewerker —</option>' +
        _employees.map(e => \`<option value="\${e.id}">\${e.name}\${e.jobTitle ? ' · ' + e.jobTitle : ''}</option>\`).join('');
    } else {
      sel.innerHTML = '<option value="">Laden mislukt</option>';
      showToast('Medewerkers laden mislukt: ' + json.error, 'error');
    }
  } catch (err) {
    sel.innerHTML = '<option value="">Laden mislukt</option>';
    showToast('Netwerkfout: ' + err.message, 'error');
  }
  lucide.createIcons();
}

function onEmployeeSelect(sel) {
  const id = parseInt(sel.value, 10);
  if (!id) return;
  const emp = _employees.find(e => e.id === id);
  if (!emp) return;
  $('prev-fullName').value  = emp.name     || '';
  $('prev-roleTitle').value = emp.jobTitle || '';
  $('prev-email').value     = emp.email    || '';
  $('prev-phone').value     = emp.phone    || '';
  // Base64 photo als data-URI voor preview in iframe
  $('prev-photoUrl').value  = emp.photoB64 ? 'data:image/png;base64,' + emp.photoB64 : '';
  updatePreview();
}

// ════════════════════════════════════════════════════════
// Preview
// ════════════════════════════════════════════════════════
async function updatePreview() {
  const config = getFormConfig();
  const userData = {
    fullName:  $('prev-fullName').value,
    roleTitle: $('prev-roleTitle').value,
    email:     $('prev-email').value,
    phone:     $('prev-phone').value,
    photoUrl:  $('prev-photoUrl').value
  };
  try {
    const res = await fetch('/mail-signatures/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, userData })
    });
    const json = await res.json();
    if (json.success) {
      const frame = $('preview-frame');
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open(); doc.write(json.data.html); doc.close();

      const warnDiv = $('preview-warnings');
      const warnList = $('preview-warnings-list');
      if (json.data.warnings && json.data.warnings.length > 0) {
        warnList.innerHTML = json.data.warnings.map(w => \`<li>\${w}</li>\`).join('');
        warnDiv.classList.remove('hidden');
      } else {
        warnDiv.classList.add('hidden');
      }
      lucide.createIcons();
    }
  } catch (e) {
    console.error('updatePreview error:', e);
  }
}

// ════════════════════════════════════════════════════════
// Push - user search
// ════════════════════════════════════════════════════════
let _loadedUsers = [];

async function searchUsers() {
  const q = $('push-search').value.trim();
  await _fetchUsers(q);
}

async function loadAllUsers() {
  await _fetchUsers('');
}

async function _fetchUsers(q) {
  try {
    const res = await fetch('/mail-signatures/api/directory?search=' + encodeURIComponent(q));
    const json = await res.json();
    if (json.success) {
      _loadedUsers = json.data.users || [];
      renderUserList(_loadedUsers);
    } else {
      showToast('Gebruikers laden mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Netwerkfout: ' + e.message, 'error');
  }
}

function renderUserList(users) {
  const tbody = $('push-user-tbody');
  tbody.innerHTML = users.map(u => \`
    <tr>
      <td><input type="checkbox" class="checkbox checkbox-xs push-user-check" data-email="\${u.email}" /></td>
      <td>\${u.fullName || '–'}</td>
      <td>\${u.email}</td>
    </tr>\`).join('');
  $('push-user-list').classList.remove('hidden');
  $('push-select-all').checked = false;
}

function toggleSelectAll(cb) {
  document.querySelectorAll('.push-user-check').forEach(c => c.checked = cb.checked);
}

function getSelectedEmails() {
  return [...document.querySelectorAll('.push-user-check:checked')].map(c => c.dataset.email);
}

async function pushSelected() {
  const emails = getSelectedEmails();
  if (emails.length === 0) { showToast('Selecteer minstens één gebruiker', 'warning'); return; }

  const resultDiv = $('push-result');
  resultDiv.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Pushen…';
  resultDiv.classList.remove('hidden');

  try {
    const res = await fetch('/mail-signatures/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserEmails: emails })
    });
    const json = await res.json();
    if (json.success) {
      const { successCount, failCount, results } = json.data;
      const rows = results.map(r => \`
        <tr class="\${r.success ? '' : 'log-row-fail'}">
          <td>\${r.email}</td>
          <td>\${r.success ? '✅' : '❌'}</td>
          <td>\${r.error || (r.warnings?.join(', ') || '–')}</td>
        </tr>\`).join('');

      resultDiv.innerHTML = \`
        <div class="alert alert-\${failCount === 0 ? 'success' : 'warning'} text-sm mb-2">
          \${successCount} geslaagd, \${failCount} mislukt
        </div>
        <table class="table table-xs"><thead><tr><th>E-mail</th><th>Status</th><th>Info</th></tr></thead>
        <tbody>\${rows}</tbody></table>\`;
    } else {
      resultDiv.innerHTML = \`<div class="alert alert-error text-sm">Push mislukt: \${json.error}</div>\`;
    }
  } catch (e) {
    resultDiv.innerHTML = \`<div class="alert alert-error text-sm">Netwerkfout: \${e.message}</div>\`;
  }
}

// ════════════════════════════════════════════════════════
// Logs
// ════════════════════════════════════════════════════════
async function loadLogs() {
  const tbody = $('logs-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><span class="loading loading-spinner loading-sm"></span></td></tr>';

  try {
    const res = await fetch('/mail-signatures/api/logs');
    const json = await res.json();
    if (json.success) {
      const logs = json.data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-base-content/40 py-4">Geen logs gevonden</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => \`
        <tr class="\${l.success ? '' : 'log-row-fail'}">
          <td>\${fmtDate(l.pushed_at)}</td>
          <td>\${l.actor_email || '–'}</td>
          <td>\${l.target_user_email || '–'}</td>
          <td>\${l.sendas_email || '–'}</td>
          <td>\${l.success ? '✅' : '❌'}</td>
          <td class="max-w-xs truncate" title="\${l.error_message || ''}">\${l.error_message || '–'}</td>
        </tr>\`).join('');
    }
  } catch (e) {
    tbody.innerHTML = \`<tr><td colspan="6" class="text-center text-error py-4">\${e.message}</td></tr>\`;
  }
}

// ════════════════════════════════════════════════════════
// Theme management (required by shared navbar)
// ════════════════════════════════════════════════════════
function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('selectedTheme', theme);
  document.cookie = 'selectedTheme=' + encodeURIComponent(theme) + '; path=/; max-age=' + (60 * 60 * 24 * 365);
  const selector = document.getElementById('themeSelector');
  if (selector) selector.value = theme;
}
window.changeTheme = changeTheme;

function initTheme() {
  const savedTheme = localStorage.getItem('selectedTheme') || 'light';
  changeTheme(savedTheme);
}

// ── Navbar Actions ──
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Logout error:', err);
  }
  localStorage.removeItem('adminToken');
  window.location.href = '/';
}
window.logout = logout;

function syncProdData() {
  alert('Sync production data not available in this module');
}
window.syncProdData = syncProdData;

// ════════════════════════════════════════════════════════
// Boot
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  lucide.createIcons();
  loadConfig().then(() => updatePreview());
  loadEmployees();
});
</script>
</body>
</html>`;
}
