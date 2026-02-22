/**
 * Mail Signature Designer — Client JS  (Iteration 2)
 *
 * Served as a static asset from root /public/.
 * Referenced by ui.js as: <script src="/mail-signature-designer-client.js"></script>
 *
 * All functions are global (no ES-module syntax).
 * Uses backticks freely — this file is NOT inside a server-side template literal.
 */

/* global lucide */

// ════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `alert alert-${type} fixed bottom-4 right-4 z-50 w-80 shadow-lg text-sm`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ════════════════════════════════════════════════════════
// Tab switching
// ════════════════════════════════════════════════════════
function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('[role=tab]').forEach(el => el.classList.remove('tab-active'));
  $(`tab-${tabName}`).classList.add('active');
  btn.classList.add('tab-active');
  lucide.createIcons();
  if (tabName === 'logs') loadLogs();
}
window.switchTab = switchTab;

// ════════════════════════════════════════════════════════
// Conditional sub-fields
// ════════════════════════════════════════════════════════
function toggleConditional(id, show) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('visible', show);
}
window.toggleConditional = toggleConditional;

// ════════════════════════════════════════════════════════
// Dirty state
// ════════════════════════════════════════════════════════
let _isDirty = false;

function markDirty() {
  if (!_isDirty) {
    _isDirty = true;
    setSaveStatus('dirty');
  }
}

function markClean() {
  _isDirty = false;
  setSaveStatus('saved');
}

function setSaveStatus(status) {
  const el = $('save-status');
  if (!el) return;
  if (status === 'dirty') {
    el.textContent = '● Niet opgeslagen wijzigingen';
    el.className = 'text-xs text-warning font-medium';
  } else if (status === 'saved') {
    el.textContent = '✓ Opgeslagen';
    el.className = 'text-xs text-success font-medium';
  } else {
    el.textContent = '–';
    el.className = 'text-xs text-base-content/40';
  }
}

// ════════════════════════════════════════════════════════
// Color picker: keep text and color input in sync
// ════════════════════════════════════════════════════════
function initColorSync() {
  const picker = document.querySelector('[name=brandColor]');
  const text   = $('brand-color-text');
  if (!picker || !text) return;

  picker.addEventListener('input', () => {
    text.value = picker.value;
    debouncedPreview();
    markDirty();
  });
  text.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) {
      picker.value = text.value;
      debouncedPreview();
      markDirty();
    }
  });
}

// ════════════════════════════════════════════════════════
// Config form helpers
// ════════════════════════════════════════════════════════
function getFormConfig() {
  const f = $('config-form');
  const data = new FormData(f);

  // brandColor: prefer text field, fall back to color picker
  const colorPicker = f.querySelector('[name=brandColor]');
  const colorText   = $('brand-color-text');
  const brandColor  = (colorText?.value && /^#[0-9a-fA-F]{6}$/.test(colorText.value))
    ? colorText.value
    : (colorPicker?.value || '#2563eb');

  return {
    brandName:      data.get('brandName')      || '',
    websiteUrl:     data.get('websiteUrl')     || '',
    brandColor,
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
    const el = f.querySelector(`[name=${name}]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
  };

  // Backwards compat: old configs may have primaryColor
  const brandColor = config.brandColor || config.primaryColor || '#2563eb';

  set('brandName',      config.brandName      ?? '');
  set('websiteUrl',     config.websiteUrl     ?? '');
  set('brandColor',     brandColor);
  set('showPhoto',      config.showPhoto);
  set('showCTA',        config.showCTA);
  set('ctaText',        config.ctaText        ?? '');
  set('ctaUrl',         config.ctaUrl         ?? '');
  set('showBanner',     config.showBanner);
  set('bannerImageUrl', config.bannerImageUrl ?? '');
  set('bannerLinkUrl',  config.bannerLinkUrl  ?? '');
  set('showDisclaimer', config.showDisclaimer);
  set('disclaimerText', config.disclaimerText ?? '');

  // Sync colour text field
  const colorText = $('brand-color-text');
  if (colorText) colorText.value = brandColor;

  // Restore conditional visibility
  toggleConditional('cta-fields',        !!config.showCTA);
  toggleConditional('banner-fields',     !!config.showBanner);
  toggleConditional('disclaimer-fields', !!config.showDisclaimer);
}

// ════════════════════════════════════════════════════════
// Live preview wiring
// ════════════════════════════════════════════════════════
const debouncedPreview = debounce(updatePreview, 300);

function attachLivePreview() {
  const form = $('config-form');
  if (!form) return;
  form.querySelectorAll('input, textarea, select').forEach(el => {
    const event = (el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
    el.addEventListener(event, () => { markDirty(); debouncedPreview(); });
  });

  // Re-trigger preview when sample user fields change
  ['prev-fullName', 'prev-roleTitle', 'prev-email', 'prev-phone', 'prev-photoUrl'].forEach(id => {
    $(id)?.addEventListener('input', debouncedPreview);
  });
}

// ════════════════════════════════════════════════════════
// Load / save config
// ════════════════════════════════════════════════════════
async function loadConfig() {
  try {
    const res  = await fetch('/mail-signatures/api/config');
    const json = await res.json();
    if (json.success && json.data?.config) {
      applyConfigToForm(json.data.config);
    }
    setSaveStatus('saved');
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
      markClean();
      showToast('Configuratie opgeslagen', 'success');
      updatePreview();
    } else {
      showToast('Opslaan mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Netwerkfout: ' + e.message, 'error');
  }
}
window.saveConfig = saveConfig;

// ════════════════════════════════════════════════════════
// Employees dropdown
// ════════════════════════════════════════════════════════
let _employees = [];

async function loadEmployees() {
  const sel = $('prev-employee-select');
  sel.innerHTML = '<option value="">Laden…</option>';
  try {
    const res  = await fetch('/mail-signatures/api/employees');
    const json = await res.json();
    if (json.success) {
      _employees = json.data.employees || [];
      sel.innerHTML = '<option value="">— Kies medewerker —</option>' +
        _employees.map(e =>
          `<option value="${e.id}">${e.name}${e.jobTitle ? ' · ' + e.jobTitle : ''}</option>`
        ).join('');
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
window.loadEmployees = loadEmployees;

function onEmployeeSelect(sel) {
  const id  = parseInt(sel.value, 10);
  if (!id) return;
  const emp = _employees.find(e => e.id === id);
  if (!emp) return;
  $('prev-fullName').value  = emp.name     || '';
  $('prev-roleTitle').value = emp.jobTitle || '';
  $('prev-email').value     = emp.email    || '';
  $('prev-phone').value     = emp.phone    || '';
  // data: URI for preview (compiler warns on push)
  $('prev-photoUrl').value  = emp.photoB64 ? `data:image/png;base64,${emp.photoB64}` : '';
  updatePreview();
}
window.onEmployeeSelect = onEmployeeSelect;

// ════════════════════════════════════════════════════════
// Preview
// ════════════════════════════════════════════════════════
async function updatePreview() {
  const config   = getFormConfig();
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
      const doc   = frame.contentDocument || frame.contentWindow.document;
      doc.open(); doc.write(json.data.html); doc.close();

      const warnDiv  = $('preview-warnings');
      const warnList = $('preview-warnings-list');
      if (json.data.warnings && json.data.warnings.length > 0) {
        warnList.innerHTML = json.data.warnings.map(w => `<li>${w}</li>`).join('');
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
window.updatePreview = updatePreview;

// ════════════════════════════════════════════════════════
// Push — user search + selection
// ════════════════════════════════════════════════════════
let _loadedUsers = [];

async function searchUsers() {
  const q = $('push-search').value.trim();
  await _fetchUsers(q);
}
window.searchUsers = searchUsers;

async function loadAllUsers() {
  await _fetchUsers('');
}
window.loadAllUsers = loadAllUsers;

async function _fetchUsers(q) {
  try {
    const res  = await fetch('/mail-signatures/api/directory?search=' + encodeURIComponent(q));
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
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <input type="checkbox" class="checkbox checkbox-xs push-user-check"
               data-email="${u.email}" onchange="updatePushCount()" />
      </td>
      <td>${u.fullName || '–'}</td>
      <td>${u.email}</td>
    </tr>`).join('');
  $('push-user-list').classList.remove('hidden');
  $('push-select-all').checked = false;
  updatePushCount();
}

function toggleSelectAll(cb) {
  document.querySelectorAll('.push-user-check').forEach(c => c.checked = cb.checked);
  updatePushCount();
}
window.toggleSelectAll = toggleSelectAll;

function updatePushCount() {
  const selected = document.querySelectorAll('.push-user-check:checked').length;
  const btn      = $('push-btn');
  const label    = $('push-selected-count');
  btn.disabled   = selected === 0;
  label.textContent = selected === 0
    ? 'Niets geselecteerd'
    : `${selected} gebruiker${selected === 1 ? '' : 's'} geselecteerd`;
}
window.updatePushCount = updatePushCount;

function getSelectedEmails() {
  return [...document.querySelectorAll('.push-user-check:checked')].map(c => c.dataset.email);
}

async function pushSelected() {
  const emails = getSelectedEmails();
  if (emails.length === 0) { showToast('Selecteer minstens één gebruiker', 'warning'); return; }

  const resultDiv = $('push-result');
  resultDiv.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Pushen…';
  resultDiv.classList.remove('hidden');
  $('push-btn').disabled = true;

  try {
    const res = await fetch('/mail-signatures/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserEmails: emails })
    });
    const json = await res.json();
    if (json.success) {
      const { successCount, failCount, results } = json.data;
      const rows = results.map(r => {
        const changedBadge = r.success
          ? (r.changed
              ? '<span class="badge badge-xs badge-warning">gewijzigd</span>'
              : '<span class="badge badge-xs badge-ghost">ongewijzigd</span>')
          : '';
        const info = r.error || (r.warnings?.length ? r.warnings.join(', ') : '–');
        return `<tr class="${r.success ? '' : 'log-row-fail'}">
          <td>${r.email}</td>
          <td>${r.success ? '✅' : '❌'}</td>
          <td>${changedBadge}</td>
          <td class="max-w-xs truncate text-xs text-base-content/60">${info}</td>
        </tr>`;
      }).join('');

      resultDiv.innerHTML = `
        <div class="alert alert-${failCount === 0 ? 'success' : 'warning'} text-sm mb-2">
          ${successCount} geslaagd, ${failCount} mislukt
        </div>
        <table class="table table-xs">
          <thead><tr><th>E-mail</th><th>Status</th><th>Wijziging</th><th>Info</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    } else {
      resultDiv.innerHTML = `<div class="alert alert-error text-sm">Push mislukt: ${json.error}</div>`;
    }
  } catch (e) {
    resultDiv.innerHTML = `<div class="alert alert-error text-sm">Netwerkfout: ${e.message}</div>`;
  } finally {
    updatePushCount();
  }
}
window.pushSelected = pushSelected;

// ════════════════════════════════════════════════════════
// Logs
// ════════════════════════════════════════════════════════
async function loadLogs() {
  const tbody = $('logs-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><span class="loading loading-spinner loading-sm"></span></td></tr>';

  try {
    const res  = await fetch('/mail-signatures/api/logs');
    const json = await res.json();
    if (json.success) {
      const logs = json.data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-base-content/40 py-4">Geen logs gevonden</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const meta = l.metadata || {};
        const changedCell = l.success
          ? (meta.changed === true
              ? '<span class="badge badge-xs badge-warning">gewijzigd</span>'
              : meta.changed === false
                ? '<span class="badge badge-xs badge-ghost">ongewijzigd</span>'
                : '–')
          : '–';
        const hashInfo = (meta.new_hash && meta.old_hash)
          ? `<span class="text-xs text-base-content/40" title="old: ${meta.old_hash} → new: ${meta.new_hash}">${meta.new_hash.slice(0, 8)}</span>`
          : '';
        const foutInfo = l.error_message
          ? `<span class="text-error">${l.error_message}</span>`
          : (meta.warnings?.length
              ? `<span class="text-warning">${meta.warnings.join('; ')}</span>`
              : hashInfo || '–');

        return `<tr class="${l.success ? '' : 'log-row-fail'}">
          <td class="whitespace-nowrap">${fmtDate(l.pushed_at)}</td>
          <td>${l.actor_email || '–'}</td>
          <td>${l.target_user_email || '–'}</td>
          <td>${l.success ? '✅' : '❌'}</td>
          <td>${changedCell}</td>
          <td class="max-w-xs truncate">${foutInfo}</td>
        </tr>`;
      }).join('');
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error py-4">${e.message}</td></tr>`;
  }
}
window.loadLogs = loadLogs;

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

async function logout() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
  localStorage.removeItem('adminToken');
  window.location.href = '/';
}
window.logout = logout;

function syncProdData() { alert('Sync production data not available in this module'); }
window.syncProdData = syncProdData;

// ════════════════════════════════════════════════════════
// Boot
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  lucide.createIcons();
  initColorSync();
  attachLivePreview();
  loadConfig().then(() => updatePreview());
  loadEmployees();
});
