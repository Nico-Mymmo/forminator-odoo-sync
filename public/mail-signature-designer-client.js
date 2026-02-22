/**
 * Mail Signature Designer — Client JS  (Event Amplifier)
 *
 * Served as static asset: /mail-signature-designer-client.js
 * Referenced by ui.js via: <script src="/mail-signature-designer-client.js"></script>
 *
 * All functions are global (no ES-module syntax).
 * Backticks are used freely here — this file is NOT inside a server template literal.
 */

/* global lucide */

// ════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `alert alert-${type} fixed bottom-4 right-4 z-50 w-80 shadow-lg text-sm py-2.5`;
  el.textContent = msg;
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
// Preview State Machine
//   pristine | dirty | loading | saved | error
// ════════════════════════════════════════════════════════
let _previewState = 'pristine';

const PREVIEW_STATE_CONFIG = {
  pristine: { dot: 'bg-base-300',          text: '',                 textClass: 'text-base-content/40', show: false },
  dirty:    { dot: 'bg-warning',            text: 'Niet opgeslagen', textClass: 'text-warning',         show: true  },
  loading:  { dot: 'bg-info animate-pulse', text: 'Preview laden…',  textClass: 'text-info',            show: true  },
  saved:    { dot: 'bg-success',            text: 'Opgeslagen',      textClass: 'text-success',         show: true  },
  error:    { dot: 'bg-error',              text: 'Fout bij ophalen',textClass: 'text-error',           show: true  }
};

function setPreviewState(state) {
  _previewState = state;
  const cfg = PREVIEW_STATE_CONFIG[state] || PREVIEW_STATE_CONFIG.pristine;
  const bar  = $('preview-status-bar');
  const dot  = $('preview-status-dot');
  const txt  = $('preview-status-text');
  if (!bar) return;

  if (cfg.show) {
    bar.classList.remove('hidden');
    dot.className = `w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`;
    txt.textContent = cfg.text;
    txt.className = `text-xs ${cfg.textClass}`;
  } else {
    bar.classList.add('hidden');
  }
}

// ════════════════════════════════════════════════════════
// Save-status indicator (form header)
// ════════════════════════════════════════════════════════
function setSaveStatus(status) {
  const dot   = $('save-status-dot');
  const label = $('save-status');
  if (!label) return;
  if (status === 'dirty') {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-warning';
    label.textContent = 'Niet opgeslagen';
    label.className   = 'text-xs text-warning font-medium';
  } else if (status === 'saved') {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-success';
    label.textContent = 'Opgeslagen';
    label.className   = 'text-xs text-success font-medium';
  } else {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-base-300';
    label.textContent = '–';
    label.className   = 'text-xs text-base-content/40';
  }
}

let _isDirty = false;

function markDirty() {
  if (!_isDirty) { _isDirty = true; setSaveStatus('dirty'); }
}

function markClean() {
  _isDirty = false;
  setSaveStatus('saved');
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
function toggleCond(id, show) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('visible', show);
}
window.toggleCond = toggleCond;

// ════════════════════════════════════════════════════════
// Viewport toggle (desktop / mobile)
// ════════════════════════════════════════════════════════
function setViewport(mode) {
  const frame  = $('preview-frame');
  const canvas = $('preview-canvas');
  const btnD   = $('vp-desktop');
  const btnM   = $('vp-mobile');
  if (!frame) return;

  if (mode === 'mobile') {
    canvas.style.maxWidth = '360px';
    frame.style.maxWidth  = '360px';
    btnD?.classList.remove('btn-active');
    btnM?.classList.add('btn-active');
  } else {
    canvas.style.maxWidth = '600px';
    frame.style.maxWidth  = '';
    btnD?.classList.add('btn-active');
    btnM?.classList.remove('btn-active');
  }
}
window.setViewport = setViewport;

// ════════════════════════════════════════════════════════
// Color picker sync
// ════════════════════════════════════════════════════════
function initColorSync() {
  const picker = $('brand-color-picker');
  const text   = $('brand-color-text');
  if (!picker || !text) return;

  picker.addEventListener('input', () => {
    text.value = picker.value;
    markDirty();
    debouncedPreview();
  });
  text.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) {
      picker.value = text.value;
      markDirty();
      debouncedPreview();
    }
  });
}

// ════════════════════════════════════════════════════════
// Event Amplifier — event fetch & dropdown wiring
// ════════════════════════════════════════════════════════
let _allEvents = [];

function formatEventDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString('nl-BE', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) { return isoStr; }
}

async function loadEvents() {
  const sel = $('event-select');
  if (!sel) return;

  const prevValue = sel.value;
  sel.innerHTML = '<option value="">Laden\u2026</option>';

  try {
    const res  = await fetch('/events/api/odoo-webinars?_t=' + Date.now(), { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Onbekende fout');

    const { webinars, registrationCounts } = json.data;
    _allEvents = (webinars || []).map(w => ({
      id:                w.id,
      title:             w.x_name || '(geen naam)',
      datetime:          w.x_studio_event_datetime || null,
      registrationCount: (registrationCounts && registrationCounts[w.id]) || 0,
      registrationUrl:   w.x_studio_registration_url || null
    }));

    // Upcoming only (datetime >= start of today), sorted soonest first
    const now = Date.now();
    const upcoming = _allEvents
      .filter(e => e.datetime && new Date(e.datetime).getTime() >= now)
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    if (upcoming.length === 0) {
      sel.innerHTML = '<option value="">\u2014 Geen aankomende events \u2014</option>';
      return;
    }

    sel.innerHTML = '<option value="">\u2014 Kies een event \u2014</option>' +
      upcoming.map(e => {
        const d = formatEventDate(e.datetime);
        return `<option value="${e.id}">${e.title}${d ? ' \xb7 ' + d : ''}</option>`;
      }).join('');

    // Restore previous selection when refreshing
    if (prevValue) {
      const stillThere = upcoming.find(e => String(e.id) === prevValue);
      if (stillThere) sel.value = prevValue;
    }

    lucide.createIcons();
  } catch (err) {
    console.error('[sig] loadEvents error:', err);
    sel.innerHTML = '<option value="">\u2014 Laden mislukt \u2014</option>';
    showToast('Events laden mislukt: ' + err.message, 'error');
  }
}
window.loadEvents = loadEvents;

function onEventPromoToggle(checked) {
  toggleCond('event-promo-fields', checked);
  // Show fallback banner controls only when event promo is OFF
  const fallback = $('fallback-banner-section');
  if (fallback) fallback.classList.toggle('visible', !checked);
  markDirty();
  debouncedPreview();
}
window.onEventPromoToggle = onEventPromoToggle;

function onEventSelect(idStr) {
  const eventId   = parseInt(idStr, 10);
  const titleEl   = $('event-hidden-title');
  const dateEl    = $('event-hidden-date');
  const metaDiv   = $('event-meta');
  const metaTitle = $('event-meta-title');
  const metaDate  = $('event-meta-date');
  const metaBadge = $('event-meta-badge');

  if (!eventId) {
    if (titleEl) titleEl.value = '';
    if (dateEl)  dateEl.value  = '';
    if (metaDiv) metaDiv.classList.add('hidden');
    markDirty();
    debouncedPreview();
    return;
  }

  const ev = _allEvents.find(e => e.id === eventId);
  if (!ev) return;

  const dateStr = formatEventDate(ev.datetime);
  if (titleEl) titleEl.value = ev.title;
  if (dateEl)  dateEl.value  = dateStr;

  // Pre-fill registration URL from Odoo when the field is available
  const regUrlEl = document.querySelector('[name="eventRegUrl"]');
  if (regUrlEl && ev.registrationUrl && !regUrlEl.value) {
    regUrlEl.value = ev.registrationUrl;
  }

  if (metaDiv) {
    metaDiv.classList.remove('hidden');
    if (metaTitle) metaTitle.textContent = ev.title;
    if (metaDate)  metaDate.textContent  = dateStr;
    if (metaBadge) {
      const n = ev.registrationCount;
      metaBadge.textContent = n + ' inschrijving' + (n !== 1 ? 'en' : '');
    }
  }

  markDirty();
  debouncedPreview();
}
window.onEventSelect = onEventSelect;

function onLinkedinPromoToggle(checked) {
  toggleCond('linkedin-promo-fields', checked);
  markDirty();
  debouncedPreview();
}
window.onLinkedinPromoToggle = onLinkedinPromoToggle;

// ════════════════════════════════════════════════════════
// Config form helpers
// ════════════════════════════════════════════════════════
function getFormConfig() {
  const f      = $('config-form');
  const data   = new FormData(f);
  const picker = $('brand-color-picker');
  const txt    = $('brand-color-text');
  const brandColor = (txt?.value && /^#[0-9a-fA-F]{6}$/.test(txt.value))
    ? txt.value
    : (picker?.value || '#2563eb');

  const rawEventId = data.get('eventId');
  const eventId    = rawEventId ? parseInt(rawEventId, 10) : null;

  return {
    // ── Event Amplifier
    eventPromoEnabled: f.querySelector('[name="eventPromoEnabled"]')?.checked || false,
    eventId,
    eventTitle:    data.get('eventTitle')    || '',
    eventDate:     data.get('eventDate')     || '',
    eventEyebrow:  data.get('eventEyebrow')  || 'Schrijf je in',
    eventImageUrl: data.get('eventImageUrl') || '',
    eventRegUrl:   data.get('eventRegUrl')   || '',
    // ── Fallback banner
    showBanner:     f.querySelector('[name="showBanner"]')?.checked || false,
    bannerImageUrl: data.get('bannerImageUrl') || '',
    bannerLinkUrl:  data.get('bannerLinkUrl')  || '',
    // ── Branding
    brandName:    data.get('brandName')  || '',
    websiteUrl:   data.get('websiteUrl') || '',
    brandColor,
    // ── LinkedIn promo
    linkedinPromoEnabled: f.querySelector('[name="linkedinPromoEnabled"]')?.checked || false,
    linkedinUrl:  data.get('linkedinUrl')  || '',
    linkedinText: data.get('linkedinText') || '',
    // ── Disclaimer
    showDisclaimer: f.querySelector('[name="showDisclaimer"]')?.checked || false,
    disclaimerText: data.get('disclaimerText') || ''
  };
}

function applyConfigToForm(config) {
  if (!config) return;
  const f   = $('config-form');
  const set = (name, val) => {
    const el = f.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
  };

  // Backwards compat: old configs may use primaryColor
  const brandColor = config.brandColor || config.primaryColor || '#2563eb';

  // Branding
  set('brandName',  config.brandName  ?? '');
  set('websiteUrl', config.websiteUrl ?? '');
  set('brandColor', brandColor);

  // Event Amplifier
  set('eventPromoEnabled', config.eventPromoEnabled);
  set('eventId',           config.eventId        ?? '');
  set('eventTitle',        config.eventTitle      ?? '');
  set('eventDate',         config.eventDate       ?? '');
  set('eventEyebrow',      config.eventEyebrow    || 'Schrijf je in');
  set('eventImageUrl',     config.eventImageUrl   ?? '');
  set('eventRegUrl',       config.eventRegUrl     ?? '');

  // Fallback banner
  set('showBanner',     config.showBanner);
  set('bannerImageUrl', config.bannerImageUrl ?? '');
  set('bannerLinkUrl',  config.bannerLinkUrl  ?? '');

  // Disclaimer
  set('showDisclaimer', config.showDisclaimer);
  set('disclaimerText', config.disclaimerText ?? '');

  // Sync colour controls
  const picker = $('brand-color-picker');
  const txtel  = $('brand-color-text');
  if (picker) picker.value = brandColor;
  if (txtel)  txtel.value  = brandColor;

  // Conditional visibility
  const promoOn = !!config.eventPromoEnabled;
  toggleCond('event-promo-fields', promoOn);
  const fallback = $('fallback-banner-section');
  if (fallback) fallback.classList.toggle('visible', !promoOn);
  toggleCond('fallback-banner-fields',    !!config.showBanner);
  toggleCond('disclaimer-fields',          !!config.showDisclaimer);

  // LinkedIn
  set('linkedinPromoEnabled', config.linkedinPromoEnabled);
  set('linkedinUrl',          config.linkedinUrl  ?? '');
  set('linkedinText',         config.linkedinText ?? '');
  toggleCond('linkedin-promo-fields', !!config.linkedinPromoEnabled);

  // Restore event metadata display (badge count restored after loadEvents)
  if (promoOn && config.eventTitle) {
    const metaDiv   = $('event-meta');
    const metaTitle = $('event-meta-title');
    const metaDate  = $('event-meta-date');
    if (metaDiv)   metaDiv.classList.remove('hidden');
    if (metaTitle) metaTitle.textContent = config.eventTitle;
    if (metaDate)  metaDate.textContent  = config.eventDate || '';
  }
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
    setSaveStatus('–');
    _isDirty = false;
  } catch (e) {
    console.error('[sig] loadConfig error:', e);
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
      setPreviewState('saved');
      showToast('Configuratie opgeslagen', 'success');
      updatePreview();
    } else {
      setPreviewState('error');
      showToast('Opslaan mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    setPreviewState('error');
    showToast('Netwerkfout: ' + e.message, 'error');
  }
}
window.saveConfig = saveConfig;

// ════════════════════════════════════════════════════════
// Live preview wiring
// ════════════════════════════════════════════════════════
const debouncedPreview = debounce(updatePreview, 300);

function attachLivePreview() {
  const form = $('config-form');
  if (!form) return;
  form.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'hidden') return;  // hidden fields are driven by onEventSelect
    const ev = (el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
    el.addEventListener(ev, () => { markDirty(); debouncedPreview(); });
  });
  ['prev-fullName', 'prev-roleTitle', 'prev-email', 'prev-phone', 'prev-photoUrl'].forEach(id => {
    $(id)?.addEventListener('input', debouncedPreview);
  });
}

// ════════════════════════════════════════════════════════
// Preview
// ════════════════════════════════════════════════════════
let _previewInflight = false;
let _previewPending  = false;

async function updatePreview() {
  if (_previewInflight) { _previewPending = true; return; }

  _previewInflight = true;
  setPreviewState('loading');

  const photoVal = $('prev-photoUrl')?.value || '';
  const dataWarn = $('preview-data-warning');
  if (dataWarn) dataWarn.classList.toggle('hidden', !photoVal.startsWith('data:'));

  const config   = getFormConfig();
  const userData = {
    fullName:  $('prev-fullName')?.value  || '',
    roleTitle: $('prev-roleTitle')?.value || '',
    email:     $('prev-email')?.value     || '',
    phone:     $('prev-phone')?.value     || '',
    photoUrl:  photoVal
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

      // Auto-size the iframe to fit content (no scrollbar)
      const autoSize = () => {
        const h = frame.contentDocument?.body?.scrollHeight;
        if (h) frame.style.height = (h + 4) + 'px';
      };
      requestAnimationFrame(autoSize);
      // Re-measure once images have loaded
      Array.from(frame.contentDocument?.querySelectorAll('img') || []).forEach(img => {
        if (!img.complete) img.addEventListener('load', autoSize);
      });

      const warnDiv  = $('preview-warnings');
      const warnList = $('preview-warnings-list');
      const apiWarnings = (json.data.warnings || []).filter(w => !w.includes('data:'));
      if (apiWarnings.length > 0) {
        warnList.innerHTML = apiWarnings.map(w => `<li>${w}</li>`).join('');
        warnDiv.classList.remove('hidden');
      } else {
        warnDiv.classList.add('hidden');
      }

      setPreviewState(_isDirty ? 'dirty' : 'saved');
      lucide.createIcons();
    } else {
      setPreviewState('error');
    }
  } catch (e) {
    console.error('[sig] updatePreview error:', e);
    setPreviewState('error');
  } finally {
    _previewInflight = false;
    if (_previewPending) {
      _previewPending = false;
      setTimeout(updatePreview, 0);
    }
  }
}
window.updatePreview = updatePreview;

// ════════════════════════════════════════════════════════
// Employees dropdown (preview helper)
// ════════════════════════════════════════════════════════
let _employees = [];

async function loadEmployees() {
  const sel = $('prev-employee-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Laden\u2026</option>';
  try {
    const res  = await fetch('/mail-signatures/api/employees');
    const json = await res.json();
    if (json.success) {
      _employees = json.data.employees || [];
      sel.innerHTML = '<option value="">\u2014 Kies medewerker \u2014</option>' +
        _employees.map(e =>
          `<option value="${e.id}">${e.name}${e.jobTitle ? ' \xb7 ' + e.jobTitle : ''}</option>`
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
  $('prev-photoUrl').value  = emp.photoB64 ? `data:image/png;base64,${emp.photoB64}` : '';
  updatePreview();
}
window.onEmployeeSelect = onEmployeeSelect;

// ════════════════════════════════════════════════════════
// Push — user search + selection
// ════════════════════════════════════════════════════════
let _loadedUsers = [];

async function searchUsers() {
  await _fetchUsers($('push-search').value.trim());
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
      <td>${u.fullName || '\u2013'}</td>
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
  const n   = document.querySelectorAll('.push-user-check:checked').length;
  const btn = $('push-btn');
  btn.disabled = n === 0;
  $('push-selected-count').textContent = n === 0
    ? 'Niets geselecteerd'
    : `${n} gebruiker${n === 1 ? '' : 's'} geselecteerd`;
}
window.updatePushCount = updatePushCount;

async function pushSelected() {
  const emails = [...document.querySelectorAll('.push-user-check:checked')].map(c => c.dataset.email);
  if (!emails.length) { showToast('Selecteer minstens \xe9\xe9n gebruiker', 'warning'); return; }

  const resultDiv = $('push-result');
  resultDiv.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Pushen\u2026';
  resultDiv.classList.remove('hidden');
  $('push-btn').disabled = true;

  try {
    const res  = await fetch('/mail-signatures/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserEmails: emails })
    });
    const json = await res.json();
    if (json.success) {
      const { successCount, failCount, results } = json.data;
      const rows = results.map(r => {
        const badge = r.success
          ? (r.changed ? '<span class="badge badge-xs badge-warning">gewijzigd</span>'
                       : '<span class="badge badge-xs badge-ghost">ongewijzigd</span>')
          : '';
        const info = r.error || (r.warnings?.length ? r.warnings.join(', ') : '\u2013');
        return `<tr class="${r.success ? '' : 'log-row-fail'}">
          <td>${r.email}</td>
          <td>${r.success ? '\u2705' : '\u274c'}</td>
          <td>${badge}</td>
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
      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-base-content/40 py-4">Geen logs gevonden</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const meta = l.metadata || {};
        const changedCell = l.success
          ? (meta.changed === true  ? '<span class="badge badge-xs badge-warning">gewijzigd</span>'
           : meta.changed === false ? '<span class="badge badge-xs badge-ghost">ongewijzigd</span>'
           : '\u2013')
          : '\u2013';
        const hashInfo = (meta.new_hash && meta.old_hash)
          ? `<span class="text-xs text-base-content/40" title="old: ${meta.old_hash} \u2192 new: ${meta.new_hash}">${meta.new_hash.slice(0, 8)}</span>`
          : '';
        const foutInfo = l.error_message
          ? `<span class="text-error">${l.error_message}</span>`
          : (meta.warnings?.length
              ? `<span class="text-warning">${meta.warnings.join('; ')}</span>`
              : hashInfo || '\u2013');
        return `<tr class="${l.success ? '' : 'log-row-fail'}">
          <td class="whitespace-nowrap">${fmtDate(l.pushed_at)}</td>
          <td>${l.actor_email || '\u2013'}</td>
          <td>${l.target_user_email || '\u2013'}</td>
          <td>${l.success ? '\u2705' : '\u274c'}</td>
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
// Theme + navbar (required by shared navbar)
// ════════════════════════════════════════════════════════
function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('selectedTheme', theme);
  document.cookie = 'selectedTheme=' + encodeURIComponent(theme) + '; path=/; max-age=' + (60 * 60 * 24 * 365);
  const sel = document.getElementById('themeSelector');
  if (sel) sel.value = theme;
}
window.changeTheme = changeTheme;

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
  const savedTheme = localStorage.getItem('selectedTheme') || 'light';
  changeTheme(savedTheme);

  lucide.createIcons();
  initColorSync();
  attachLivePreview();

  // 1) Load config, then fire initial preview
  // 2) Load events in parallel; after both complete, restore badge count
  Promise.all([
    loadConfig().then(() => updatePreview()),
    loadEvents()
  ]).then(() => {
    // Restore badge count for selected event after loadEvents fills _allEvents
    const sel = $('event-select');
    if (sel && sel.value) onEventSelect(sel.value);
  });

  loadEmployees();
});
