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

// Role injected server-side via window.__SIG_STATE__
const _userRole   = window.__SIG_STATE__?.userRole   || 'user';
const _actorEmail = window.__SIG_STATE__?.actorEmail || '';

/**
 * True when the current user may access marketing config and multi-push.
 * Mirrors the server-side hasMarketingRole() check in routes.js.
 */
const _isMarketing = (_userRole === 'admin' || _userRole === 'marketing_signature');

// Holds the eventId from the loaded config until the event dropdown is populated
let _pendingEventId = null;

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
    const [webinarRes, publishedRes] = await Promise.all([
      fetch('/events/api/odoo-webinars?_t=' + Date.now(), { credentials: 'include' }),
      fetch('/events/api/published-webinar-ids', { credentials: 'include' })
    ]);
    const [json, publishedJson] = await Promise.all([webinarRes.json(), publishedRes.json()]);
    if (!json.success) throw new Error(json.error || 'Onbekende fout');

    // Build a set of IDs that are live on WordPress (published or out_of_sync)
    const publishedIds = new Set((publishedJson.data || []).map(String));

    const { webinars, registrationCounts } = json.data;
    _allEvents = (webinars || []).map(w => ({
      id:                w.id,
      title:             w.x_name || '(geen naam)',
      datetime:          w.x_studio_event_datetime || null,
      registrationCount: (registrationCounts && registrationCounts[w.id]) || 0,
      registrationUrl:   w.x_studio_registration_url || null
    }));

    // Upcoming AND published to WordPress only, sorted soonest first
    const now = Date.now();
    const upcoming = _allEvents
      .filter(e => e.datetime && new Date(e.datetime).getTime() >= now && publishedIds.has(String(e.id)))
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

function onEventSelect(idStr, silent = false) {
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
    if (!silent) { markDirty(); debouncedPreview(); }
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

  if (!silent) { markDirty(); debouncedPreview(); }
}
window.onEventSelect = onEventSelect;

function onLinkedinPromoToggle(checked) {
  toggleCond('linkedin-promo-fields', checked);
  markDirty();
  debouncedPreview();
}
window.onLinkedinPromoToggle = onLinkedinPromoToggle;

async function fetchLinkedinMeta() {
  const urlInput  = $('linkedin-url-input');
  const statusEl  = $('linkedin-fetch-status');
  const btn       = $('linkedin-fetch-btn');
  const textArea  = document.querySelector('[name="linkedinText"]');
  const url       = urlInput?.value?.trim();

  if (!url) {
    showToast('Voer eerst een LinkedIn-URL in', 'warning');
    return;
  }

  // Enable promo toggle automatically
  const toggle = $('linkedin-promo-toggle');
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    onLinkedinPromoToggle(true);
  }

  if (statusEl) {
    statusEl.className = 'text-xs mt-1 text-info';
    statusEl.textContent = 'Post ophalen\u2026';
  }
  if (btn) btn.disabled = true;

  try {
    const res  = await fetch('/mail-signatures/api/linkedin-meta?url=' + encodeURIComponent(url));
    const json = await res.json();

    if (!json.success) {
      if (statusEl) {
        statusEl.className = 'text-xs mt-1 text-error';
        statusEl.textContent = json.error || 'Ophalen mislukt';
      }
      showToast('LinkedIn ophalen mislukt: ' + json.error, 'error');
      return;
    }

    const { description, authorName, authorImgUrl, likesCount } = json.data;

    // Store scraped metadata in hidden form fields (so it persists on save/load)
    const setH = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };
    setH('linkedin-hidden-author-name', authorName);
    setH('linkedin-hidden-author-img',  authorImgUrl);
    setH('linkedin-hidden-likes',       likesCount || '');

    // Show meta badge
    const metaDiv    = $('linkedin-meta');
    const metaAuthor = $('linkedin-meta-author');
    const metaAvatar = $('linkedin-meta-avatar');
    const metaLikes  = $('linkedin-meta-likes');
    if (metaDiv) {
      metaDiv.classList.remove('hidden');
      if (metaAuthor) metaAuthor.textContent = authorName || '';
      if (metaAvatar && authorImgUrl) { metaAvatar.src = authorImgUrl; metaAvatar.classList.remove('hidden'); }
      if (metaLikes && likesCount)    { metaLikes.textContent = `\ud83d\udc4d ${likesCount}`; metaLikes.classList.remove('hidden'); }
    }

    // Auto-fill flavor text only when field is empty
    if (textArea && !textArea.value && description) {
      // Strip the author prefix LinkedIn adds ("Dirk Gypen on LinkedIn: ")
      const cleaned = description.replace(/^[^:]+\s+op LinkedIn:\s*/i, '').replace(/^[^:]+\s+on LinkedIn:\s*/i, '');
      textArea.value = cleaned.slice(0, 280);
    }

    if (statusEl) {
      statusEl.className = 'text-xs mt-1 text-success';
      statusEl.textContent = '\u2713 Post opgehaald' + (authorName ? ` \u2014 ${authorName}` : '');
      setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }

    markDirty();
    debouncedPreview();
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'text-xs mt-1 text-error';
      statusEl.textContent = 'Netwerkfout: ' + err.message;
    }
    showToast('Netwerkfout: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.fetchLinkedinMeta = fetchLinkedinMeta;

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
    eventEyebrow:        data.get('eventEyebrow')        || 'Schrijf je in',
    eventImageUrl:       data.get('eventImageUrl')       || '',
    eventImageMaxHeight: data.get('eventImageMaxHeight') ? parseInt(data.get('eventImageMaxHeight'), 10) : null,
    eventRegUrl:         data.get('eventRegUrl')         || '',
    // ── Fallback banner
    showBanner:     f.querySelector('[name="showBanner"]')?.checked || false,
    bannerImageUrl: data.get('bannerImageUrl') || '',
    bannerLinkUrl:  data.get('bannerLinkUrl')  || '',
    // ── Branding
    brandName:    data.get('brandName')  || '',
    websiteUrl:   data.get('websiteUrl') || '',
    brandColor,
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
  _pendingEventId = config.eventId ? String(config.eventId) : null;  // stash for post-loadEvents restore
  set('eventTitle',        config.eventTitle      ?? '');
  set('eventDate',         config.eventDate       ?? '');
  set('eventEyebrow',         config.eventEyebrow         || 'Schrijf je in');
  set('eventImageUrl',        config.eventImageUrl        ?? '');
  set('eventImageMaxHeight',  config.eventImageMaxHeight  ?? '');
  set('eventRegUrl',          config.eventRegUrl          ?? '');

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
      if (json.data?.eventPushTriggered) {
        showToast('Configuratie opgeslagen — handtekeningen worden bijgewerkt voor alle gebruikers', 'success');
      } else {
        showToast('Configuratie opgeslagen', 'success');
      }
      // Refresh marketing preview
      updatePreview();
      // Also refresh the "Mijn handtekening" preview so _activeEvent is up-to-date
      // (e.g. when the event is changed or cleared, the toggle and preview update too)
      loadMySettings().then(() => updateMyPreview());
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

  const config   = getFormConfig();
  // If eventId is set but eventTitle is empty (config saved before event was selected,
  // or event is no longer in the upcoming dropdown), look it up live from _allEvents.
  if (config.eventId && !config.eventTitle) {
    const ev = _allEvents.find(e => e.id === config.eventId);
    if (ev) {
      config.eventTitle = ev.title;
      if (!config.eventDate) config.eventDate = formatEventDate(ev.datetime);
    }
  }
  // Ghost/anonymous userData — marketing preview focuses on the marketing block only
  const userData = {
    fullName:     'Medewerkers naam',
    roleTitle:    'Functietitel',
    email:        'medewerker@openvme.be',
    phone:        '',
    photoUrl:     '',
    greetingText: 'Met vriendelijke groet,',
    showGreeting: true,
    company:      config.brandName || 'OpenVME'
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

      // Auto-size the iframe to fit content (no scrollbar).
      // Attach onload BEFORE doc.open() so it fires when doc.close() triggers load.
      const autoSize = () => {
        const h = frame.contentDocument?.body?.scrollHeight;
        if (h) frame.style.height = (h + 4) + 'px';
      };
      frame.onload = autoSize;
      doc.open(); doc.write(json.data.html); doc.close();
      // Apply dark/light background after write
      try {
        const body = frame.contentDocument?.body;
        if (body) body.style.backgroundColor = _previewDark ? CANVAS_DARK_BG : '';
      } catch (_) {}
      setTimeout(autoSize, 0);
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
// Push all users (marketing builder tab)
// ════════════════════════════════════════════════════════
async function pushAllUsers() {
  const btn = $('push-all-btn');
  const resultDiv = $('push-all-result');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Bezig…'; }
  if (resultDiv) { resultDiv.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Pushen…'; resultDiv.classList.remove('hidden'); }
  try {
    // 1. Save current form state first (same as pushSelected)
    const saveRes  = await fetch('/mail-signatures/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: getFormConfig() })
    });
    const saveJson = await saveRes.json();
    if (!saveJson.success) {
      if (resultDiv) resultDiv.innerHTML = `<div class="alert alert-error text-sm">Opslaan mislukt: ${saveJson.error || 'onbekende fout'}</div>`;
      return;
    }
    markClean();

    // 2. Fetch all directory users
    const dirRes  = await fetch('/mail-signatures/api/directory?search=');
    const dirJson = await dirRes.json();
    if (!dirJson.success) throw new Error(dirJson.error || 'Directory laden mislukt');
    const emails = (dirJson.data.users || []).map(u => u.email).filter(Boolean);
    if (!emails.length) {
      if (resultDiv) resultDiv.innerHTML = '<div class="alert alert-warning text-sm">Geen gebruikers gevonden in directory</div>';
      return;
    }

    // 3. Push to all emails via the same endpoint as pushSelected
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
        const info = r.error || (r.warnings?.length ? r.warnings.join(', ') : '–');
        return `<tr class="${r.success ? '' : 'log-row-fail'}">
          <td>${r.email}</td><td>${r.success ? '✅' : '❌'}</td>
          <td>${badge}</td>
          <td class="max-w-xs truncate text-xs text-base-content/60">${info}</td>
        </tr>`;
      }).join('');
      if (resultDiv) resultDiv.innerHTML = `
        <div class="alert alert-${failCount === 0 ? 'success' : 'warning'} text-sm mb-2">
          ${successCount} geslaagd, ${failCount} mislukt
        </div>
        <table class="table table-xs">
          <thead><tr><th>E-mail</th><th>Status</th><th>Wijziging</th><th>Info</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      showToast(`Push voltooid — ${successCount} geslaagd, ${failCount} mislukt`, failCount ? 'warning' : 'success');
    } else {
      if (resultDiv) resultDiv.innerHTML = `<div class="alert alert-error text-sm">Push mislukt: ${json.error}</div>`;
    }
  } catch (e) {
    if (resultDiv) resultDiv.innerHTML = `<div class="alert alert-error text-sm">Netwerkfout: ${e.message}</div>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5 mr-1"></i> Pushen naar alle gebruikers';
      lucide.createIcons();
    }
  }
}
window.pushAllUsers = pushAllUsers;

// ════════════════════════════════════════════════════════
// Modal: push to selected users
// ════════════════════════════════════════════════════════
async function openPushModal() {
  const dlg = document.getElementById('push-select-modal');
  if (!dlg) return;
  dlg.showModal();
  lucide.createIcons();
  // Auto-load users if list is empty
  if ($('modal-push-tbody').innerHTML.trim() === '') {
    await modalLoadAllUsers();
  }
}
window.openPushModal = openPushModal;

async function modalSearchUsers() {
  await _fetchModalUsers($('modal-push-search').value.trim());
}
window.modalSearchUsers = modalSearchUsers;

async function modalLoadAllUsers() {
  await _fetchModalUsers('');
}
window.modalLoadAllUsers = modalLoadAllUsers;

async function _fetchModalUsers(q) {
  const loading = $('modal-push-loading');
  if (loading) loading.classList.remove('hidden');
  try {
    const res  = await fetch('/mail-signatures/api/directory?search=' + encodeURIComponent(q));
    const json = await res.json();
    if (json.success) {
      const users = json.data.users || [];
      const tbody = $('modal-push-tbody');
      tbody.innerHTML = users.map(u => `
        <tr>
          <td><input type="checkbox" class="checkbox checkbox-xs modal-user-check"
                     data-email="${u.email}" onchange="modalUpdateCount()" /></td>
          <td>${u.fullName || '\u2013'}</td>
          <td class="text-xs">${u.email}</td>
        </tr>`).join('');
      $('modal-push-list').classList.remove('hidden');
      $('modal-select-all').checked = false;
      modalUpdateCount();
    } else {
      showToast('Gebruikers laden mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Netwerkfout: ' + e.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function modalToggleAll(cb) {
  document.querySelectorAll('.modal-user-check').forEach(c => c.checked = cb.checked);
  modalUpdateCount();
}
window.modalToggleAll = modalToggleAll;

function modalUpdateCount() {
  const n   = document.querySelectorAll('.modal-user-check:checked').length;
  const btn = $('modal-push-btn');
  if (btn) btn.disabled = n === 0;
  const cnt = $('modal-push-count');
  if (cnt) cnt.textContent = n === 0
    ? 'Niets geselecteerd'
    : `${n} gebruiker${n === 1 ? '' : 's'} geselecteerd`;
}
window.modalUpdateCount = modalUpdateCount;

async function modalPushSelected() {
  const emails = [...document.querySelectorAll('.modal-user-check:checked')].map(c => c.dataset.email);
  if (!emails.length) { showToast('Selecteer minstens \xe9\xe9n gebruiker', 'warning'); return; }

  const resultDiv = $('modal-push-result');
  const btn       = $('modal-push-btn');
  btn.disabled    = true;
  resultDiv.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Pushen\u2026';
  resultDiv.classList.remove('hidden');

  try {
    // Always save first so the push reflects the current form state
    const saveRes  = await fetch('/mail-signatures/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: getFormConfig() })
    });
    const saveJson = await saveRes.json();
    if (!saveJson.success) {
      resultDiv.innerHTML = `<div class="alert alert-error text-sm">Opslaan mislukt: ${saveJson.error || 'onbekende fout'}</div>`;
      return;
    }
    markClean();
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
          <td>${r.email}</td><td>${r.success ? '\u2705' : '\u274c'}</td>
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
      showToast(`${successCount} geslaagd, ${failCount} mislukt`, failCount ? 'warning' : 'success');
    } else {
      resultDiv.innerHTML = `<div class="alert alert-error text-sm">Push mislukt: ${json.error}</div>`;
    }
  } catch (e) {
    resultDiv.innerHTML = `<div class="alert alert-error text-sm">Netwerkfout: ${e.message}</div>`;
  } finally {
    modalUpdateCount();
  }
}
window.modalPushSelected = modalPushSelected;

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
    // Always save first so the push reflects the current form state
    const saveRes  = await fetch('/mail-signatures/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: getFormConfig() })
    });
    const saveJson = await saveRes.json();
    if (!saveJson.success) {
      resultDiv.innerHTML = `<div class="alert alert-error text-sm">Opslaan mislukt: ${saveJson.error || 'onbekende fout'}</div>`;
      return;
    }
    markClean();
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
        const scopeBadge = {
          self:   '<span class="badge badge-xs badge-info">self</span>',
          single: '<span class="badge badge-xs badge-outline">single</span>',
          multi:  '<span class="badge badge-xs badge-primary">multi</span>',
          all:    '<span class="badge badge-xs badge-secondary">all</span>'
        }[l.push_scope] || '\u2013';
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
          <td>${scopeBadge}</td>
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
// Viewport toggle for "Mijn handtekening" preview
// ════════════════════════════════════════════════════════
// Dark/light preview background toggle state
let _myPreviewDark = false;
let _previewDark   = false;

const PREVIEW_DARK_BG  = '#1e1e2e';
const PREVIEW_LIGHT_BG = '#f3f4f6';
const CANVAS_DARK_BG   = '#2a2a3a';
const CANVAS_LIGHT_BG  = '#ffffff';

function applyPreviewMode(dark, wrapId, canvasId, frameId, btnId, iconName) {
  const wrap   = $(wrapId);
  const canvas = $(canvasId);
  const frame  = $(frameId);
  const btn    = $(btnId);
  if (wrap)   wrap.style.backgroundColor   = dark ? PREVIEW_DARK_BG  : PREVIEW_LIGHT_BG;
  if (canvas) canvas.style.backgroundColor = dark ? CANVAS_DARK_BG   : CANVAS_LIGHT_BG;
  if (btn)    btn.classList.toggle('btn-active', dark);
  // Update iframe body background if document is already loaded
  try {
    const body = frame?.contentDocument?.body;
    if (body) body.style.backgroundColor = dark ? CANVAS_DARK_BG : '';
  } catch (_) {}
  // Swap icon
  const icon = btn?.querySelector('[data-lucide]');
  if (icon) { icon.setAttribute('data-lucide', dark ? 'sun' : 'moon'); lucide.createIcons(); }
}

function toggleMyPreviewMode() {
  _myPreviewDark = !_myPreviewDark;
  applyPreviewMode(_myPreviewDark, 'my-preview-wrap', 'my-preview-canvas', 'my-preview-frame', 'my-vp-dark', 'moon');
}
window.toggleMyPreviewMode = toggleMyPreviewMode;

function togglePreviewMode() {
  _previewDark = !_previewDark;
  applyPreviewMode(_previewDark, 'preview-wrap', 'preview-canvas', 'preview-frame', 'vp-dark', 'moon');
}
window.togglePreviewMode = togglePreviewMode;

function setMyViewport(mode) {
  const canvas = $('my-preview-canvas');
  const frame  = $('my-preview-frame');
  const btnD   = $('my-vp-desktop');
  const btnM   = $('my-vp-mobile');
  if (!canvas) return;
  if (mode === 'mobile') {
    canvas.style.maxWidth = '360px';
    if (frame) frame.style.maxWidth = '360px';
    btnD?.classList.remove('btn-active');
    btnM?.classList.add('btn-active');
  } else {
    canvas.style.maxWidth = '600px';
    if (frame) frame.style.maxWidth = '';
    btnD?.classList.add('btn-active');
    btnM?.classList.remove('btn-active');
  }
}
window.setMyViewport = setMyViewport;

// ════════════════════════════════════════════════════════
// My-signature preview state machine
// ════════════════════════════════════════════════════════
function setMyPreviewState(state) {
  const cfg = PREVIEW_STATE_CONFIG[state] || PREVIEW_STATE_CONFIG.pristine;
  const bar  = $('my-preview-status-bar');
  const dot  = $('my-preview-status-dot');
  const txt  = $('my-preview-status-text');
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
// My-signature save indicator
// ════════════════════════════════════════════════════════
let _myIsDirty   = false;
let _odooProfile = null;  // populated by loadMySettings(); used as preview fallback
let _activeEvent = null;  // { title, date } of the current marketing event, or null

function setMySaveStatus(status) {
  const dot   = $('my-save-status-dot');
  const label = $('my-save-status');
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

function markMyDirty() { if (!_myIsDirty) { _myIsDirty = true; setMySaveStatus('dirty'); } }
function markMyClean() { _myIsDirty = false; setMySaveStatus('saved'); }

// ════════════════════════════════════════════════════════
// Read user settings form
// ════════════════════════════════════════════════════════
function getMySettingsForm() {
  const f = $('my-settings-form');
  if (!f) return {};

  const bool = (name) => {
    const el = f.querySelector(`[name="${name}"]`);
    return el ? el.checked : null;
  };
  const str  = (name) => {
    const el = f.querySelector(`[name="${name}"]`);
    return el ? (el.value || null) : null;
  };

  return {
    full_name_override:     str('full_name_override')  || null,
    role_title_override:    str('role_title_override') || null,
    phone_override:         str('phone_override')      || null,
    show_greeting:          bool('show_greeting'),
    greeting_text:          str('greeting_text')    || null,
    show_company:           bool('show_company'),
    company_override:       str('company_override') || null,
    show_email:             bool('show_email'),
    show_phone:             bool('show_phone'),
    show_photo:             bool('show_photo'),
    // Per-event opt-out: store the current event ID (as string to match the TEXT column)
    // when the user hides it, clear it when they re-enable.
    hidden_event_id:        bool('show_event_promo') ? null : (_activeEvent?.id != null ? String(_activeEvent.id) : null),
    // Preview-only signal — not saved to DB (not in store allowlist).
    // Lets the preview route bypass ID-matching and directly respect the toggle.
    _preview_show_event:    bool('show_event_promo'),
    show_disclaimer:        bool('show_disclaimer'),
    disclaimer_text:        str('disclaimer_text')     || null,
    linkedin_promo_enabled: bool('linkedin_promo_enabled'),
    linkedin_url:           str('linkedin_url')        || null,
    linkedin_eyebrow:       str('linkedin_eyebrow')    || null,
    linkedin_text:          str('linkedin_text')       || null,
    linkedin_author_name:   str('linkedin_author_name') || null,
    linkedin_author_img:    str('linkedin_author_img')  || null,
    linkedin_likes:         parseInt(str('linkedin_likes') || '0', 10) || 0,
    quote_enabled: bool('quote_enabled'),
    quote_text:    str('quote_text')   || null,
    quote_author:  str('quote_author') || null,
    quote_date:    str('quote_date')   || null
  };
}

// ════════════════════════════════════════════════════════
// Apply loaded user settings to form
// ════════════════════════════════════════════════════════
function applyMySettingsToForm(settings, odooProfile) {
  if (!settings) return;
  const f   = $('my-settings-form');
  if (!f) return;

  const set = (name, val) => {
    const el = f.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = val === true || val === 'true';
    else el.value = val ?? '';
  };

  const setPlaceholder = (name, odooVal, fallback) => {
    const el = f.querySelector(`[name="${name}"]`);
    if (!el) return;
    el.placeholder = odooVal ? `${odooVal}  (via Odoo)` : fallback;
  };

  set('show_greeting',          settings.show_greeting   !== false);  // default true
  set('greeting_text',          settings.greeting_text   ?? '');
  set('full_name_override',     settings.full_name_override  ?? '');
  set('role_title_override',    settings.role_title_override ?? '');
  set('show_company',           settings.show_company    !== false);  // default true
  set('company_override',       settings.company_override ?? '');
  set('phone_override',         settings.phone_override      ?? '');
  set('show_email',             settings.show_email      !== false);   // default true
  set('show_phone',             settings.show_phone      !== false);   // default true
  set('show_photo',             settings.show_photo      !== false);   // default true
  // Event toggle: checked UNLESS hidden_event_id matches the current active event.
  // hidden_event_id is stored as TEXT in the DB so normalise both to strings.
  const eventIsHidden = !!(settings.hidden_event_id && _activeEvent?.id &&
                           String(settings.hidden_event_id) === String(_activeEvent.id));
  set('show_event_promo', !eventIsHidden);

  // Show active event or 'geen event' message
  const hasEvent = !!(_activeEvent?.title);
  const eventActiveDiv = document.getElementById('my-event-active');
  const eventNoneDiv   = document.getElementById('my-event-none');
  const eventTitleEl   = document.getElementById('my-event-title-display');
  if (eventActiveDiv) eventActiveDiv.classList.toggle('hidden', !hasEvent);
  if (eventNoneDiv)   eventNoneDiv.classList.toggle('hidden',    hasEvent);
  if (hasEvent && eventTitleEl) {
    eventTitleEl.textContent = _activeEvent.title + (_activeEvent.date ? ` — ${_activeEvent.date}` : '');
  }

  // Show the user's own email address in the read-only display span
  const emailDisplayEl = document.getElementById('my-email-display');
  if (emailDisplayEl) emailDisplayEl.textContent = _actorEmail || '';

  // Show photo thumbnail or 'geen foto' message based on what odooProfile provided
  const hasPhoto     = !!(odooProfile?.photoUrl);
  const hasPhotoDiv  = document.getElementById('my-photo-has-photo');
  const noPhotoDiv   = document.getElementById('my-photo-no-photo');
  const photoThumb   = document.getElementById('my-photo-thumb');
  if (hasPhotoDiv)  hasPhotoDiv.classList.toggle('hidden', !hasPhoto);
  if (noPhotoDiv)   noPhotoDiv.classList.toggle('hidden',  hasPhoto);
  if (hasPhoto && photoThumb) photoThumb.src = odooProfile.photoUrl;
  set('show_disclaimer',        !!settings.show_disclaimer);
  set('disclaimer_text',        settings.disclaimer_text     ?? '');
  set('linkedin_promo_enabled', !!settings.linkedin_promo_enabled);
  set('linkedin_url',           settings.linkedin_url        ?? '');
  set('linkedin_eyebrow',       settings.linkedin_eyebrow    || 'Mijn laatste LinkedIn\u2011post');
  set('linkedin_text',          settings.linkedin_text       ?? '');
  set('linkedin_author_name',   settings.linkedin_author_name ?? '');
  set('linkedin_author_img',    settings.linkedin_author_img  ?? '');
  set('linkedin_likes',         settings.linkedin_likes ?? '');

  set('quote_enabled', !!settings.quote_enabled);
  set('quote_text',    settings.quote_text   ?? '');
  set('quote_author',  settings.quote_author ?? '');
  set('quote_date',    settings.quote_date   ?? '');

  // Dynamic placeholders: show Odoo value so user knows what will be used
  if (odooProfile) {
    setPlaceholder('full_name_override',  odooProfile.name,         'Laat leeg = Odoo naam');
    setPlaceholder('role_title_override', odooProfile.job_title,    'Laat leeg = Odoo functie');
    setPlaceholder('phone_override',      odooProfile.mobile_phone, 'Laat leeg = Odoo telefoon');
  }

  // Conditional visibility
  toggleCond('my-disclaimer-fields', !!settings.show_disclaimer);
  toggleCond('my-linkedin-fields',   !!settings.linkedin_promo_enabled);
  toggleCond('my-quote-fields',      !!settings.quote_enabled);
}

// ════════════════════════════════════════════════════════
// Load / save my settings
// ════════════════════════════════════════════════════════
async function loadMySettings() {
  try {
    const res  = await fetch('/mail-signatures/api/my-settings', { credentials: 'include' });
    const json = await res.json();
    if (json.success && json.data) {
      _odooProfile = json.data.odooProfile ?? null;
      _activeEvent = json.data.activeEvent  ?? null;
      applyMySettingsToForm(json.data.settings ?? {}, _odooProfile);
    }
    setMySaveStatus('–');
    _myIsDirty = false;
  } catch (e) {
    console.error('[sig] loadMySettings error:', e);
  }
}

async function saveMySettings() {
  const settings = getMySettingsForm();
  try {
    const res = await fetch('/mail-signatures/api/my-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
      credentials: 'include'
    });
    const json = await res.json();
    if (json.success) {
      markMyClean();
      setMyPreviewState('saved');
      showToast('Instellingen opgeslagen', 'success');
      updateMyPreview();
    } else {
      setMyPreviewState('error');
      showToast('Opslaan mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    setMyPreviewState('error');
    showToast('Netwerkfout: ' + e.message, 'error');
  }
}
window.saveMySettings = saveMySettings;

// ════════════════════════════════════════════════════════
// Push self
// ════════════════════════════════════════════════════════
async function pushSelf() {
  const resultDiv = $('my-push-result');
  if (resultDiv) {
    resultDiv.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Pushen\u2026';
    resultDiv.classList.remove('hidden');
  }

  try {
    // Always save current form state first — the push reads from DB, so
    // unsaved changes (e.g. toggling the event off) would be ignored otherwise.
    const saveRes  = await fetch('/mail-signatures/api/my-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: getMySettingsForm() }),
      credentials: 'include'
    });
    const saveJson = await saveRes.json();
    if (!saveJson.success) {
      if (resultDiv) resultDiv.innerHTML = `<div class="alert alert-error text-sm">Opslaan mislukt: ${saveJson.error || 'onbekende fout'}</div>`;
      return;
    }
    markMyClean();

    const res  = await fetch('/mail-signatures/api/push/self', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'include'
    });
    const json = await res.json();
    if (json.success) {
      const r = json.data.results?.[0] || {};
      if (r.success) {
        const badge = r.changed
          ? '<span class="badge badge-xs badge-warning">gewijzigd</span>'
          : '<span class="badge badge-xs badge-ghost">ongewijzigd</span>';
        if (resultDiv) {
          resultDiv.innerHTML = `<div class="alert alert-success text-sm">Handtekening gepusht naar jouw Gmail ${badge}</div>`;
        }
        showToast('Handtekening gepusht', 'success');
      } else {
        if (resultDiv) {
          resultDiv.innerHTML = `<div class="alert alert-error text-sm">Push mislukt: ${r.error}</div>`;
        }
        showToast('Push mislukt: ' + r.error, 'error');
      }
    } else {
      if (resultDiv) {
        resultDiv.innerHTML = `<div class="alert alert-error text-sm">Push mislukt: ${json.error}</div>`;
      }
      showToast('Push mislukt: ' + json.error, 'error');
    }
  } catch (e) {
    if (resultDiv) {
      resultDiv.innerHTML = `<div class="alert alert-error text-sm">Netwerkfout: ${e.message}</div>`;
    }
    showToast('Netwerkfout: ' + e.message, 'error');
  }
}
window.pushSelf = pushSelf;

// ════════════════════════════════════════════════════════
// My-signature LinkedIn toggle
// ════════════════════════════════════════════════════════
function onMyLinkedinToggle(checked) {
  toggleCond('my-linkedin-fields', checked);
  markMyDirty();
  debouncedMyPreview();
}
window.onMyLinkedinToggle = onMyLinkedinToggle;

// ════════════════════════════════════════════════════════
// My-signature Quote toggle
// ════════════════════════════════════════════════════════
function onMyQuoteToggle(checked) {
  toggleCond('my-quote-fields', checked);
  markMyDirty();
  debouncedMyPreview();
}
window.onMyQuoteToggle = onMyQuoteToggle;

// ════════════════════════════════════════════════════════
// My-signature LinkedIn meta fetch
// Mirrors fetchLinkedinMeta() but uses the my-settings form fields.
// ════════════════════════════════════════════════════════
async function fetchMyLinkedinMeta() {
  const urlInput  = $('my-linkedin-url');
  const statusEl  = $('my-linkedin-fetch-status');
  const btn       = $('my-linkedin-fetch-btn');
  const textArea  = $('my-linkedin-text');
  const url       = urlInput?.value?.trim();

  if (!url) { showToast('Voer eerst een LinkedIn-URL in', 'warning'); return; }

  // Auto-enable toggle
  const toggle = $('my-linkedin-toggle');
  if (toggle && !toggle.checked) { toggle.checked = true; onMyLinkedinToggle(true); }

  if (statusEl) { statusEl.className = 'text-xs mt-1 text-info'; statusEl.textContent = 'Post ophalen\u2026'; statusEl.classList.remove('hidden'); }
  if (btn) btn.disabled = true;

  try {
    const res  = await fetch('/mail-signatures/api/linkedin-meta?url=' + encodeURIComponent(url));
    const json = await res.json();
    if (!json.success) {
      if (statusEl) { statusEl.className = 'text-xs mt-1 text-error'; statusEl.textContent = json.error || 'Ophalen mislukt'; }
      showToast('LinkedIn ophalen mislukt: ' + json.error, 'error');
      return;
    }
    const { description, authorName, authorImgUrl, likesCount } = json.data;
    const setH = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };
    setH('my-linkedin-author-name', authorName);
    setH('my-linkedin-author-img',  authorImgUrl);
    setH('my-linkedin-likes',       likesCount || '');

    if (textArea && !textArea.value && description) {
      const cleaned = description.replace(/^[^:]+\s+op LinkedIn:\s*/i, '').replace(/^[^:]+\s+on LinkedIn:\s*/i, '');
      textArea.value = cleaned.slice(0, 280);
    }
    if (statusEl) {
      statusEl.className = 'text-xs mt-1 text-success';
      statusEl.textContent = '\u2713 Post opgehaald' + (authorName ? ` \u2014 ${authorName}` : '');
      setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }
    markMyDirty();
    debouncedMyPreview();
  } catch (err) {
    if (statusEl) { statusEl.className = 'text-xs mt-1 text-error'; statusEl.textContent = 'Netwerkfout: ' + err.message; }
    showToast('Netwerkfout: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.fetchMyLinkedinMeta = fetchMyLinkedinMeta;

// ════════════════════════════════════════════════════════
// My-signature live preview
// ════════════════════════════════════════════════════════
let _myPreviewInflight = false;
let _myPreviewPending  = false;

const debouncedMyPreview = debounce(updateMyPreview, 300);

async function updateMyPreview() {
  if (_myPreviewInflight) { _myPreviewPending = true; return; }

  _myPreviewInflight = true;
  setMyPreviewState('loading');

  const userSettings = getMySettingsForm();
  // Use actorEmail as the preview target (shows own email in signature)
  const previewEmail = _actorEmail || 'preview@example.com';

  try {
    const res = await fetch('/mail-signatures/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'user',
        userSettings,
        userData: {
          email:        previewEmail,
          fullName:     userSettings.full_name_override  || _odooProfile?.name         || '',
          roleTitle:    userSettings.role_title_override || _odooProfile?.job_title    || '',
          phone:        (userSettings.show_phone    !== false) ? (userSettings.phone_override    || _odooProfile?.mobile_phone || '') : '',
          photoUrl:     (userSettings.show_photo    !== false) ? (_odooProfile?.photoUrl         || '') : '',
          greetingText: (userSettings.show_greeting !== false) ? (userSettings.greeting_text    || 'Met vriendelijke groet,') : '',
          showGreeting: userSettings.show_greeting !== false,
          company:      (userSettings.show_company  !== false) ? (userSettings.company_override || 'OpenVME') : ''
        }
      })
    });
    const json = await res.json();
    if (json.success) {
      const frame = $('my-preview-frame');
      if (frame) {
        const doc = frame.contentDocument || frame.contentWindow.document;
        const autoSize = () => {
          const h = frame.contentDocument?.body?.scrollHeight;
          if (h) frame.style.height = (h + 4) + 'px';
        };
        frame.onload = autoSize;
        doc.open(); doc.write(json.data.html); doc.close();
        // Apply dark/light background after write
        try {
          const body = frame.contentDocument?.body;
          if (body) body.style.backgroundColor = _myPreviewDark ? CANVAS_DARK_BG : '';
        } catch (_) {}
        setTimeout(autoSize, 0);
        Array.from(frame.contentDocument?.querySelectorAll('img') || []).forEach(img => {
          if (!img.complete) img.addEventListener('load', autoSize);
        });
      }
      setMyPreviewState(_myIsDirty ? 'dirty' : 'saved');
    } else {
      setMyPreviewState('error');
    }
  } catch (e) {
    console.error('[sig] updateMyPreview error:', e);
    setMyPreviewState('error');
  } finally {
    _myPreviewInflight = false;
    if (_myPreviewPending) { _myPreviewPending = false; setTimeout(updateMyPreview, 0); }
  }
}
window.updateMyPreview = updateMyPreview;

// ════════════════════════════════════════════════════════
// Wire live preview for my-settings form
// ════════════════════════════════════════════════════════
function attachMyLivePreview() {
  const form = $('my-settings-form');
  if (!form) return;
  form.querySelectorAll('input, textarea').forEach(el => {
    if (el.type === 'hidden') return;
    if (el.type === 'checkbox') {
      // Checkbox: save immediately + refresh preview
      el.addEventListener('change', () => { debouncedMyPreview(); saveMySettings(); });
    } else {
      // Text / textarea: live preview while typing; save on focus-out
      el.addEventListener('input', () => { markMyDirty(); debouncedMyPreview(); });
      el.addEventListener('blur',  () => { if (_myIsDirty) saveMySettings(); });
    }
  });
}

// ════════════════════════════════════════════════════════
// Boot
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('selectedTheme') || 'light';
  changeTheme(savedTheme);

  lucide.createIcons();
  initColorSync();
  attachLivePreview();
  attachMyLivePreview();

  // ── "Mijn handtekening" tab: load user settings then fire preview
  loadMySettings().then(() => updateMyPreview());

  // ── Marketing tabs: only run when user has marketing role
  if (_isMarketing) {
    Promise.all([
      loadConfig(),
      loadEvents()
    ]).then(() => {
      // Restore the saved eventId now that the dropdown is populated.
      // Use silent=true so onEventSelect only sets hidden fields + metadata
      // without triggering markDirty or a debounced preview — we fire one
      // clean updatePreview() below as the single render trigger.
      const sel = $('event-select');
      if (sel && _pendingEventId) {
        sel.value = _pendingEventId;
        // Always call onEventSelect — even if the event is past (filtered out of the
        // dropdown), _allEvents has ALL events so hidden fields will be populated.
        onEventSelect(sel.value || _pendingEventId, true);
      } else if (sel?.value) {
        onEventSelect(sel.value, true);
      }
      // Single authoritative preview render after config + events are both loaded
      updatePreview();
    });
  }
});

// ════════════════════════════════════════════════════════
// Admin: Excluded emails (Administratie tab)
// ════════════════════════════════════════════════════════

let _excludedEmails = []; // current working set

async function loadExcludedEmails() {
  const loading = document.getElementById('excluded-loading');
  if (loading) loading.classList.remove('hidden');
  try {
    const res  = await fetch('/mail-signatures/api/admin/excluded-emails', { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Laden mislukt');
    _excludedEmails = json.data?.emails || [];
    renderExcludedChips();
  } catch (e) {
    showExcludedStatus('Fout bij laden: ' + e.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function renderExcludedChips() {
  const container = document.getElementById('excluded-chips');
  if (!container) return;
  if (_excludedEmails.length === 0) {
    container.innerHTML = '<span class="text-sm text-base-content/40 italic">Geen uitgesloten adressen</span>';
    return;
  }
  container.innerHTML = _excludedEmails.map(email =>
    `<div class="badge badge-outline gap-1 py-3">
      <span class="text-sm">${email}</span>
      <button class="btn btn-ghost btn-xs p-0 min-h-0 h-auto ml-1" onclick="removeExcludedEmail('${email}')" title="Verwijderen">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    </div>`
  ).join('');
  lucide.createIcons();
}

async function addExcludedEmail() {
  const input = document.getElementById('excluded-new-input');
  if (!input) return;
  const val = input.value.trim().toLowerCase();
  if (!val) return;
  if (_excludedEmails.includes(val)) {
    showExcludedStatus(`${val} staat al in de lijst`, 'warning');
    return;
  }
  _excludedEmails = [..._excludedEmails, val].sort();
  input.value = '';
  renderExcludedChips();
  await persistExcludedEmails();
}
window.addExcludedEmail = addExcludedEmail;

async function removeExcludedEmail(email) {
  _excludedEmails = _excludedEmails.filter(e => e !== email);
  renderExcludedChips();
  await persistExcludedEmails();
}
window.removeExcludedEmail = removeExcludedEmail;

async function persistExcludedEmails() {
  try {
    const res  = await fetch('/mail-signatures/api/admin/excluded-emails', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: _excludedEmails })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Opslaan mislukt');
    _excludedEmails = json.data?.emails || _excludedEmails;
    renderExcludedChips();
    showExcludedStatus('Opgeslagen', 'success');
  } catch (e) {
    showExcludedStatus('Fout bij opslaan: ' + e.message, 'error');
  }
}

function showExcludedStatus(msg, type) {
  const el = document.getElementById('excluded-status');
  if (!el) return;
  el.className = `text-xs mt-2 text-${type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success'}`;
  el.classList.remove('hidden');
  el.textContent = msg;
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// Load excluded emails when the Administratie tab is opened
const _origSwitchTab = window.switchTab;
window.switchTab = function(tabId, btn) {
  if (_origSwitchTab) _origSwitchTab(tabId, btn);
  if (tabId === 'admin' && _excludedEmails.length === 0) {
    loadExcludedEmails();
  }
};
