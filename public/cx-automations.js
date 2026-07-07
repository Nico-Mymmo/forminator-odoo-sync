// CX Automations — Vlag-drempelwaarden beheer
// Vanilla JS, data-action patroon, geen inline handlers.

lucide.createIcons();

// ====== State ======

var odooStages = [];   // [{ id, name }] — dynamisch uit Odoo
var odooReasons = [];  // [{ value, label }] — dynamisch uit Odoo
var savedThresholds = {}; // { stage_id: { yellow_days, orange_days, red_days, flag_reason, auto_clear_enabled } }

// ====== Helpers ======

function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  var cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
  var toast = document.createElement('div');
  toast.className = 'alert ' + cls + ' text-sm py-2 px-4';
  var span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  container.appendChild(toast);
  if (type !== 'error') {
    setTimeout(function() { toast.remove(); }, 3000);
  } else {
    var close = document.createElement('button');
    close.className = 'btn btn-ghost btn-xs ml-2';
    close.textContent = '✕';
    close.addEventListener('click', function() { toast.remove(); });
    toast.appendChild(close);
  }
}

async function apiFetch(url, options) {
  var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Niet ingelogd');
  }
  return res;
}

function formatDate(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

// ====== Navbar ======

async function renderNavbar() {
  var response = await apiFetch('/api/auth/me');
  var data = await response.json();
  if (!data.user) { window.location.href = '/'; return; }
  if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
}
// ====== Drempelwaarden ======

function renderThresholdsTable() {
  var container = document.getElementById('thresholdsTable');

  if (!odooStages.length) {
    container.innerHTML = '<p class="text-sm text-base-content/50 py-4">Geen CS-stages gevonden in Odoo.</p>';
    return;
  }

  var reasonOpts = odooReasons.map(function(r) {
    return '<option value="' + escapeHtml(r.value) + '">' + escapeHtml(r.label) + '</option>';
  }).join('');

  var rows = odooStages.map(function(stage) {
    var saved = savedThresholds[stage.id] || {};
    var yellow = saved.yellow_days != null ? saved.yellow_days : 14;
    var orange = saved.orange_days != null ? saved.orange_days : 30;
    var red    = saved.red_days    != null ? saved.red_days    : 60;
    var reason = saved.flag_reason || 'no_activity';
    var autoClear = !!saved.auto_clear_enabled;
    var updatedAt = saved.updated_at ? formatDate(saved.updated_at) : '';
    var updatedBy = saved.updated_by || '';

    // Reden-opties met juiste geselecteerde waarde
    var reasonOptsForRow = odooReasons.map(function(r) {
      return '<option value="' + escapeHtml(r.value) + '"' + (r.value === reason ? ' selected' : '') + '>'
        + escapeHtml(r.label) + '</option>';
    }).join('');

    return '<tr>'
      + '<td class="py-3 pr-4 font-medium text-sm">' + escapeHtml(stage.name) + '</td>'
      + '<td class="py-3 px-2">'
      +   '<select class="select select-bordered select-sm threshold-input" '
      +     'data-stage-id="' + stage.id + '" data-field="flag_reason">'
      +   reasonOptsForRow + '</select></td>'
      + '<td class="py-3 px-2"><div class="flex items-center gap-1">'
      +   '<input type="number" min="0" max="365" class="input input-bordered input-sm w-20 text-center threshold-input" '
      +     'data-stage-id="' + stage.id + '" data-field="yellow_days" value="' + yellow + '" />'
      +   '<span class="text-xs text-base-content/50">d</span></div></td>'
      + '<td class="py-3 px-2"><div class="flex items-center gap-1">'
      +   '<input type="number" min="0" max="365" class="input input-bordered input-sm w-20 text-center threshold-input" '
      +     'data-stage-id="' + stage.id + '" data-field="orange_days" value="' + orange + '" />'
      +   '<span class="text-xs text-base-content/50">d</span></div></td>'
      + '<td class="py-3 px-2"><div class="flex items-center gap-1">'
      +   '<input type="number" min="0" max="365" class="input input-bordered input-sm w-20 text-center threshold-input" '
      +     'data-stage-id="' + stage.id + '" data-field="red_days" value="' + red + '" />'
      +   '<span class="text-xs text-base-content/50">d</span></div></td>'
      + '<td class="py-3 px-2 text-center">'
      +   '<input type="checkbox" class="checkbox checkbox-sm threshold-input" '
      +     'data-stage-id="' + stage.id + '" data-field="auto_clear_enabled"' + (autoClear ? ' checked' : '') + ' />'
      + '</td>'
      + '<td class="py-3 pl-4 text-xs text-base-content/40">'
      +   (updatedAt ? updatedAt + (updatedBy ? '<br>' + escapeHtml(updatedBy) : '') : '—')
      + '</td>'
      + '</tr>';
  }).join('');

  container.innerHTML = '<div class="overflow-x-auto">'
    + '<table class="table table-sm w-full">'
    + '<thead><tr>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2">Fase (Odoo)</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2 px-2">Reden</th>'
    + '<th class="text-xs font-semibold text-warning pb-2 px-2">🟡 Geel</th>'
    + '<th class="text-xs font-semibold text-orange-500 pb-2 px-2">🟠 Oranje</th>'
    + '<th class="text-xs font-semibold text-error pb-2 px-2">🔴 Rood</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2 px-2" title="Vlag automatisch wissen zodra de conditie niet meer van toepassing is (bv. gebouw weer actief)">Auto-wissen</th>'
    + '<th class="text-xs font-semibold text-base-content/40 pb-2 pl-4">Laatste wijziging</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div>';
}

async function loadConfig() {
  // Haal stages en redenen op uit Odoo, en drempelwaarden uit Supabase — parallel
  var container = document.getElementById('thresholdsTable');
  container.innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner loading-md text-primary"></span></div>';

  try {
    var [configRes, threshRes] = await Promise.all([
      apiFetch('/cx-automations/api/odoo-config'),
      apiFetch('/cx-automations/api/thresholds'),
    ]);

    var configData = await configRes.json();
    var threshData = await threshRes.json();

    if (!configData.success) throw new Error('Odoo config: ' + configData.error);
    if (!threshData.success) throw new Error('Thresholds: ' + threshData.error);

    odooStages  = configData.stages  || [];
    odooReasons = configData.reasons || [];

    // Index opgeslagen drempelwaarden op stage_id
    savedThresholds = {};
    (threshData.data || []).forEach(function(t) {
      savedThresholds[t.stage_id] = t;
    });

    renderThresholdsTable();
  } catch (err) {
    container.innerHTML = '<p class="text-error text-sm py-4">Fout bij laden: ' + escapeHtml(err.message) + '</p>';
  }
}

async function saveThresholds() {
  var btn = document.getElementById('saveBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  // Lees alle inputs per stage
  var byStage = {};
  document.querySelectorAll('.threshold-input').forEach(function(input) {
    var stageId = parseInt(input.dataset.stageId);
    var field   = input.dataset.field;
    if (!byStage[stageId]) {
      var stage = odooStages.find(function(s) { return s.id === stageId; });
      byStage[stageId] = { stage_id: stageId, stage_name: stage ? stage.name : String(stageId) };
    }
    byStage[stageId][field] = field === 'flag_reason' ? input.value
      : field === 'auto_clear_enabled' ? input.checked
      : (parseInt(input.value) || 0);
  });

  var thresholds = Object.values(byStage);

  try {
    var res = await apiFetch('/cx-automations/api/thresholds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thresholds: thresholds }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('Drempelwaarden opgeslagen', 'success');
    await loadConfig();
  } catch (err) {
    showToast('Fout bij opslaan: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    lucide.createIcons();
  }
}

// ====== Technical block escalatie-instellingen ======

async function loadSettings() {
  var container = document.getElementById('techBlockSettings');

  try {
    var res = await apiFetch('/cx-automations/api/settings');
    var data = await res.json();
    if (!data.success) throw new Error(data.error);

    var s = data.settings || {};
    var orange = s.tech_block_orange_days != null ? s.tech_block_orange_days : '3';
    var red    = s.tech_block_red_days    != null ? s.tech_block_red_days    : '5';

    container.innerHTML = '<div class="flex flex-wrap gap-6 items-end">'
      + '<div class="form-control">'
      +   '<label class="label pb-1"><span class="label-text text-xs font-semibold text-orange-500">🟠 Oranje na (dagen)</span></label>'
      +   '<div class="flex items-center gap-1">'
      +     '<input type="number" min="0" max="365" id="techBlockOrangeDays" class="input input-bordered input-sm w-24 text-center" value="' + escapeHtml(orange) + '" />'
      +     '<span class="text-xs text-base-content/50">d</span>'
      +   '</div>'
      + '</div>'
      + '<div class="form-control">'
      +   '<label class="label pb-1"><span class="label-text text-xs font-semibold text-error">🔴 Rood na (dagen)</span></label>'
      +   '<div class="flex items-center gap-1">'
      +     '<input type="number" min="0" max="365" id="techBlockRedDays" class="input input-bordered input-sm w-24 text-center" value="' + escapeHtml(red) + '" />'
      +     '<span class="text-xs text-base-content/50">d</span>'
      +   '</div>'
      + '</div>'
      + '<p class="text-xs text-base-content/40 self-end pb-1">Geel wordt altijd direct gezet bij eerste detectie.</p>'
      + '</div>';
  } catch (err) {
    container.innerHTML = '<p class="text-error text-sm py-2">Fout bij laden: ' + escapeHtml(err.message) + '</p>';
  }
}

async function saveSettings() {
  var btn = document.getElementById('saveSettingsBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  var orangeInput = document.getElementById('techBlockOrangeDays');
  var redInput    = document.getElementById('techBlockRedDays');

  if (!orangeInput || !redInput) {
    showToast('Instellingen nog niet geladen', 'error');
    btn.classList.remove('loading');
    btn.disabled = false;
    return;
  }

  try {
    var res = await apiFetch('/cx-automations/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tech_block_orange_days: parseInt(orangeInput.value) || 0,
        tech_block_red_days:    parseInt(redInput.value)    || 0,
      }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('Instellingen opgeslagen', 'success');
  } catch (err) {
    showToast('Fout bij opslaan: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    lucide.createIcons();
  }
}

// ====== Technical blocks ======

async function loadTechnicalBlocks() {
  var container = document.getElementById('technicalBlocksList');
  var badge = document.getElementById('technicalBlocksBadge');

  try {
    var res = await apiFetch('/cx-automations/api/technical-blocks');
    var data = await res.json();
    if (!data.success) throw new Error(data.error);

    var records = data.data || [];

    if (records.length === 0) {
      badge.style.display = 'none';
      container.innerHTML = '<p class="text-sm text-base-content/40 py-2">Geen blokkades gevonden.</p>';
      return;
    }

    badge.textContent = records.length;
    badge.style.display = '';

    var rows = records.map(function(r) {
      var stage = Array.isArray(r.x_studio_stage_id) ? r.x_studio_stage_id[1] : '—';
      var support = Array.isArray(r.x_studio_support_user_id) ? r.x_studio_support_user_id[1] : '—';
      var odooUrl = 'https://mymmo.odoo.com/odoo/x-sales-action-sheet/' + r.id;
      return '<tr>'
        + '<td class="py-2 text-sm">'
        +   '<a href="' + odooUrl + '" target="_blank" class="link link-hover text-error font-medium">'
        +   escapeHtml(r.x_name || 'Actieblad #' + r.id) + '</a></td>'
        + '<td class="py-2 text-sm text-base-content/60">' + escapeHtml(stage) + '</td>'
        + '<td class="py-2 text-sm text-base-content/60">' + escapeHtml(support) + '</td>'
        + '</tr>';
    }).join('');

    container.innerHTML = '<div class="overflow-x-auto">'
      + '<table class="table table-sm w-full">'
      + '<thead><tr>'
      + '<th class="text-xs font-semibold text-base-content/60 pb-2">Actieblad</th>'
      + '<th class="text-xs font-semibold text-base-content/60 pb-2">Fase</th>'
      + '<th class="text-xs font-semibold text-base-content/60 pb-2">Support</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div>';

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = '<p class="text-error text-sm py-2">Fout: ' + escapeHtml(err.message) + '</p>';
  }
}

// ====== Cron ======

async function runCron() {
  var btn = document.getElementById('runCronBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    var res = await apiFetch('/cx-automations/api/run-cron', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('Cron succesvol uitgevoerd', 'success');
    await loadLog();
  } catch (err) {
    showToast('Cron mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    lucide.createIcons();
  }
}

// ====== Cron log ======

function renderLog(runs) {
  var container = document.getElementById('logTable');

  if (!runs || runs.length === 0) {
    container.innerHTML = '<p class="text-sm text-base-content/50 py-4">Nog geen cron-runs gevonden.</p>';
    return;
  }

  var rows = runs.map(function(r) {
    var badge = r.error
      ? '<span class="badge badge-error badge-sm">Fout</span>'
      : '<span class="badge badge-success badge-sm">OK</span>';
    return '<tr>'
      + '<td class="py-2 text-sm">' + escapeHtml(formatDate(r.ran_at)) + '</td>'
      + '<td class="py-2 text-sm text-center">' + (r.actiebladen_checked != null ? r.actiebladen_checked : '—') + '</td>'
      + '<td class="py-2 text-sm text-center">' + (r.flags_updated != null ? r.flags_updated : '—') + '</td>'
      + '<td class="py-2">' + badge + '</td>'
      + (r.error ? '<td class="py-2 text-xs text-error max-w-xs truncate" title="' + escapeHtml(r.error) + '">' + escapeHtml(r.error) + '</td>' : '<td></td>')
      + '</tr>';
  }).join('');

  container.innerHTML = '<div class="overflow-x-auto">'
    + '<table class="table table-sm w-full">'
    + '<thead><tr>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2">Tijdstip</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2 text-center">Gecheckt</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2 text-center">Bijgewerkt</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2">Status</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2">Foutmelding</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div>';
}

async function loadLog() {
  try {
    var res = await apiFetch('/cx-automations/api/log');
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    renderLog(data.data);
  } catch (err) {
    document.getElementById('logTable').innerHTML =
      '<p class="text-error text-sm py-4">Fout bij laden: ' + escapeHtml(err.message) + '</p>';
  }
}

// ====== Tab switching ======

function switchTab(name) {
  document.querySelectorAll('[role="tab"][data-tab]').forEach(function(t) {
    t.classList.toggle('tab-active', t.dataset.tab === name);
  });
  document.querySelectorAll('[id^="tab-"]').forEach(function(panel) {
    panel.style.display = panel.id === 'tab-' + name ? '' : 'none';
  });
  if (name === 'mergers' && !mergerState[currentMergerPair].loaded) loadMergerConfig();
}

// ====== Merger state ======

var currentMergerPair = 'estate';                    // actieve pair
var mergerState = {                                  // state per pair
  estate:  { categories: [], loaded: false },
  contact: { categories: [], loaded: false },
};
var mergerAllFields  = [];   // [{ name, label, type, mapped }] — gedeeld, hertekend per pair
var mergerFieldsLoaded = false;

// ====== Merger helpers ======

function mergerEsc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function getMergerCategories() { return mergerState[currentMergerPair].categories; }
function setMergerCategories(cats) { mergerState[currentMergerPair].categories = cats; }

function getCategoryOptions(selectedKey) {
  return getMergerCategories().map(function(cat) {
    return '<option value="' + mergerEsc(cat.key) + '"' + (cat.key === selectedKey ? ' selected' : '') + '>'
      + mergerEsc(cat.label || cat.key) + '</option>';
  }).join('');
}

// ====== Merger render ======

function renderMergerCategories() {
  var container = document.getElementById('mergerCategories');
  var mergerCategories = getMergerCategories();
  if (!mergerCategories.length) {
    container.innerHTML = '<p class="text-sm text-base-content/40 py-4">Nog geen categorieën. Klik op "Nieuwe categorie" om te beginnen.</p>';
    return;
  }

  var html = mergerCategories.map(function(cat, catIdx) {
    var fieldRows = (cat.fields || []).map(function(f, fIdx) {
      return '<div class="flex items-center gap-2 py-1 border-b border-base-200 last:border-0">'
        + '<span class="text-xs font-mono text-base-content/50 w-48 truncate flex-shrink-0">' + mergerEsc(f[0]) + '</span>'
        + '<input type="text" class="input input-bordered input-xs flex-1 merger-field-label" '
        +   'data-cat-idx="' + catIdx + '" data-field-idx="' + fIdx + '" value="' + mergerEsc(f[1]) + '" />'
        + '<button class="btn btn-ghost btn-xs text-error" data-action="removeMergerField" data-cat-idx="' + catIdx + '" data-field-idx="' + fIdx + '">'
        +   '<i data-lucide="x" class="w-3 h-3"></i>'
        + '</button>'
        + '</div>';
    }).join('');

    return '<div class="card bg-base-100 shadow-sm border border-base-200 mb-4" data-cat-idx="' + catIdx + '">'
      + '<div class="card-body p-4">'
      + '<div class="flex items-start gap-3 mb-3">'
      + '<div class="flex-1 min-w-0">'
      +   '<input type="text" class="input input-bordered input-sm font-semibold w-full merger-cat-label" '
      +     'data-cat-idx="' + catIdx + '" value="' + mergerEsc(cat.label) + '" placeholder="Categorienaam" />'
      +   '<div class="mt-1 flex items-center gap-2">'
      +     '<span class="badge badge-ghost badge-sm font-mono">' + mergerEsc(cat.key) + '</span>'
      +     '<span class="text-xs text-base-content/40">wizard-veld</span>'
      +   '</div>'
      + '</div>'
      + '<button class="btn btn-ghost btn-xs text-error flex-shrink-0" data-action="removeMergerCategory" data-cat-idx="' + catIdx + '">'
      +   '<i data-lucide="trash-2" class="w-4 h-4"></i>'
      + '</button>'
      + '</div>'
      + '<div class="min-h-8">' + (fieldRows || '<p class="text-xs text-base-content/40 py-2">Nog geen velden. Voeg toe via het paneel rechts.</p>') + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

function renderUnmappedFields() {
  var container = document.getElementById('unmappedFields');
  var query = (document.getElementById('fieldSearch') || {}).value || '';
  var lower = query.toLowerCase();
  rebuildMappedStatus();

  var unmapped = mergerAllFields.filter(function(f) {
    if (f.mapped) return false;
    if (!lower) return true;
    return f.name.toLowerCase().includes(lower) || f.label.toLowerCase().includes(lower);
  });

  if (!mergerAllFields.length) {
    container.innerHTML = '<p class="text-xs text-base-content/40">Klik op vernieuwen om te laden.</p>';
    return;
  }
  if (!unmapped.length) {
    container.innerHTML = '<p class="text-xs text-base-content/40">Alle velden zijn gemapped (of geen resultaten).</p>';
    return;
  }

  var rows = unmapped.slice(0, 80).map(function(f) {
    return '<div class="flex items-center justify-between py-1 border-b border-base-200 last:border-0">'
      + '<div class="min-w-0 flex-1 mr-2">'
      +   '<div class="text-xs font-mono truncate" title="' + mergerEsc(f.name) + '">' + mergerEsc(f.name) + '</div>'
      +   '<div class="text-xs text-base-content/50 truncate">' + mergerEsc(f.label) + ' <span class="opacity-40">(' + mergerEsc(f.type) + ')</span></div>'
      + '</div>'
      + '<button class="btn btn-ghost btn-xs flex-shrink-0" data-action="openAddFieldModal" '
      +   'data-field-name="' + mergerEsc(f.name) + '" data-field-label="' + mergerEsc(f.label) + '">'
      +   '<i data-lucide="plus" class="w-3 h-3"></i>'
      + '</button>'
      + '</div>';
  }).join('');

  if (unmapped.length > 80) {
    rows += '<p class="text-xs text-base-content/40 pt-2">' + (unmapped.length - 80) + ' meer — gebruik de zoekbalk om te filteren.</p>';
  }

  container.innerHTML = rows;
  lucide.createIcons();
}

// ====== Merger data handlers ======

async function loadMergerConfig() {
  var container = document.getElementById('mergerCategories');
  container.innerHTML = '<div class="flex justify-center py-10"><span class="loading loading-spinner loading-md text-primary"></span></div>';

  try {
    var res = await apiFetch('/cx-automations/api/merger-config?pair=' + currentMergerPair);
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    mergerState[currentMergerPair].categories = data.categories || [];
    mergerState[currentMergerPair].loaded = true;
    renderMergerCategories();
    if (mergerFieldsLoaded) renderUnmappedFields();
  } catch (err) {
    container.innerHTML = '<p class="text-error text-sm py-4">Fout bij laden: ' + mergerEsc(err.message) + '</p>';
  }
}

async function patchLeadPreview() {
  var btn = document.getElementById('patchLeadPreviewBtn');
  var result = document.getElementById('patchLeadResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/patch-lead-preview', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return 'Actie ' + r.id + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Patch uitgevoerd', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Patch mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function fixLeadSearch() {
  var btn = document.getElementById('fixLeadSearchBtn');
  var result = document.getElementById('fixLeadSearchResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/fix-lead-search', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return 'Actie ' + r.id + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Fix uitgevoerd', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Fix mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function disableSanitize() {
  var btn = document.getElementById('disableSanitizeBtn');
  var result = document.getElementById('disableSanitizeResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/disable-sanitize', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return r.model + '.' + r.field + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Sanitization uitgeschakeld', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function addFieldExclusions() {
  var btn = document.getElementById('addFieldExclusionsBtn');
  var result = document.getElementById('addFieldExclusionsResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/add-field-exclusions', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return 'Actie ' + r.id + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Veld-selectie geactiveerd', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Patch mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function fixInlineCheckboxes() {
  var btn = document.getElementById('fixInlineCheckboxesBtn');
  var result = document.getElementById('fixInlineCheckboxesResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/fix-inline-checkboxes', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return 'Actie ' + r.id + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Fix toegepast', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Fix mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function inlineCheckboxes() {
  var btn = document.getElementById('inlineCheckboxesBtn');
  var result = document.getElementById('inlineCheckboxesResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/inline-checkboxes', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return 'Actie ' + r.id + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Inline checkboxen gepatcht', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Patch mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function upgradeLeadPreview() {
  var btn = document.getElementById('upgradeLeadPreviewBtn');
  var result = document.getElementById('upgradeLeadPreviewResult');
  btn.classList.add('loading');
  btn.disabled = true;
  result.textContent = '';
  try {
    var res = await apiFetch('/cx-automations/api/upgrade-lead-preview', { method: 'POST' });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    var lines = (data.results || []).map(function(r) { return 'Actie ' + r.id + ': ' + r.status; });
    result.innerHTML = '<span class="text-success">' + mergerEsc(lines.join(' | ')) + '</span>';
    showToast('Upgrade uitgevoerd', 'success');
  } catch (err) {
    result.innerHTML = '<span class="text-error">' + mergerEsc(err.message) + '</span>';
    showToast('Upgrade mislukt: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function switchMergerPair(pair) {
  if (pair === currentMergerPair) return;
  currentMergerPair = pair;
  // Sub-tab styling
  document.querySelectorAll('[data-merger-pair]').forEach(function(t) {
    t.classList.toggle('tab-active', t.dataset.mergerPair === pair);
  });
  // Laad config als nog niet geladen
  if (!mergerState[pair].loaded) {
    await loadMergerConfig();
  } else {
    renderMergerCategories();
    if (mergerFieldsLoaded) renderUnmappedFields();
  }
}

async function loadMergerFields() {
  var btn = document.getElementById('loadFieldsBtn');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  document.getElementById('unmappedFields').innerHTML =
    '<div class="flex justify-center py-4"><span class="loading loading-spinner loading-sm text-primary"></span></div>';

  try {
    var res = await apiFetch('/cx-automations/api/merger-fields?pair=' + currentMergerPair);
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    mergerAllFields = data.fields || [];
    mergerFieldsLoaded = true;
    renderUnmappedFields();
  } catch (err) {
    document.getElementById('unmappedFields').innerHTML =
      '<p class="text-error text-xs py-2">' + mergerEsc(err.message) + '</p>';
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; lucide.createIcons(); }
  }
}

// Sync labels van inputs naar mergerCategories state
function syncMergerStateFromDOM() {
  var cats = getMergerCategories();
  document.querySelectorAll('.merger-cat-label').forEach(function(input) {
    var catIdx = parseInt(input.dataset.catIdx);
    if (cats[catIdx]) cats[catIdx].label = input.value;
  });
  document.querySelectorAll('.merger-field-label').forEach(function(input) {
    var catIdx   = parseInt(input.dataset.catIdx);
    var fieldIdx = parseInt(input.dataset.fieldIdx);
    if (cats[catIdx] && cats[catIdx].fields[fieldIdx]) {
      cats[catIdx].fields[fieldIdx][1] = input.value;
    }
  });
}

async function saveMergerConfig() {
  syncMergerStateFromDOM();

  var btn = document.getElementById('saveMergerBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    var res = await apiFetch('/cx-automations/api/merger-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: getMergerCategories(), pair: currentMergerPair }),
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('Mapping opgeslagen in Odoo', 'success');
    // Ververs velden-status
    if (mergerAllFields.length) await loadMergerFields();
  } catch (err) {
    showToast('Fout bij opslaan: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    lucide.createIcons();
  }
}

function addMergerCategory() {
  var key = prompt('Veldsleutel (bv. x_studio_copy_legal_info):', 'x_studio_copy_');
  if (!key || !key.trim()) return;
  key = key.trim();
  if (getMergerCategories().find(function(c) { return c.key === key; })) {
    showToast('Sleutel bestaat al', 'error');
    return;
  }
  var label = prompt('Leesbare naam (bv. Juridische info):', '');
  if (label === null) return;
  getMergerCategories().push({ key: key, label: label || key, fields: [] });
  renderMergerCategories();
}

function removeMergerCategory(catIdx) {
  var cat = getMergerCategories()[catIdx];
  if (!cat) return;
  if (!confirm('Categorie "' + cat.label + '" verwijderen? (velden gaan ook weg)')) return;
  getMergerCategories().splice(catIdx, 1);
  renderMergerCategories();
}

function removeMergerField(catIdx, fieldIdx) {
  syncMergerStateFromDOM();
  var cats = getMergerCategories();
  if (!cats[catIdx]) return;
  cats[catIdx].fields.splice(fieldIdx, 1);
  rebuildMappedStatus();
  renderMergerCategories();
  if (mergerAllFields.length) renderUnmappedFields();
}

function rebuildMappedStatus() {
  var mapped = new Set(getMergerCategories().flatMap(function(c) {
    return (c.fields || []).map(function(f) { return f[0]; });
  }));
  mergerAllFields.forEach(function(f) { f.mapped = mapped.has(f.name); });
}

function openAddFieldModal(fieldName, fieldLabel) {
  if (!getMergerCategories().length) {
    showToast('Voeg eerst een categorie toe', 'error');
    return;
  }
  document.getElementById('modalFieldName').value = fieldName;
  document.getElementById('modalFieldNameDisplay').value = fieldName;
  document.getElementById('modalFieldLabel').value = fieldLabel;
  document.getElementById('modalFieldCategory').innerHTML = getCategoryOptions(getMergerCategories()[0].key);
  document.getElementById('addFieldModal').showModal();
}

function confirmAddField() {
  syncMergerStateFromDOM();
  var fieldName  = document.getElementById('modalFieldName').value;
  var fieldLabel = document.getElementById('modalFieldLabel').value.trim();
  var catKey     = document.getElementById('modalFieldCategory').value;

  if (!fieldLabel) { showToast('Vul een label in', 'error'); return; }

  var cat = getMergerCategories().find(function(c) { return c.key === catKey; });
  if (!cat) { showToast('Categorie niet gevonden', 'error'); return; }

  // Voorkom duplicaat
  if (cat.fields.find(function(f) { return f[0] === fieldName; })) {
    showToast('Veld staat al in deze categorie', 'error');
    return;
  }

  cat.fields.push([fieldName, fieldLabel]);
  rebuildMappedStatus();
  document.getElementById('addFieldModal').close();
  renderMergerCategories();
  if (mergerAllFields.length) renderUnmappedFields();
}

// ====== Events ======

document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;
  if (action === 'saveThresholds') saveThresholds();
  if (action === 'saveSettings') saveSettings();
  if (action === 'runCron') runCron();
  if (action === 'saveMergerConfig') saveMergerConfig();
  if (action === 'addMergerCategory') addMergerCategory();
  if (action === 'loadMergerFields') loadMergerFields();
  if (action === 'removeMergerCategory') removeMergerCategory(parseInt(el.dataset.catIdx));
  if (action === 'removeMergerField') removeMergerField(parseInt(el.dataset.catIdx), parseInt(el.dataset.fieldIdx));
  if (action === 'openAddFieldModal') openAddFieldModal(el.dataset.fieldName, el.dataset.fieldLabel);
  if (action === 'confirmAddField') confirmAddField();
  if (action === 'closeModal') document.getElementById('addFieldModal').close();
  if (action === 'patchLeadPreview') patchLeadPreview();
  if (action === 'fixLeadSearch') fixLeadSearch();
  if (action === 'upgradeLeadPreview') upgradeLeadPreview();
  if (action === 'disableSanitize') disableSanitize();
  if (action === 'addFieldExclusions') addFieldExclusions();
  if (action === 'inlineCheckboxes') inlineCheckboxes();
  if (action === 'fixInlineCheckboxes') fixInlineCheckboxes();
});

document.addEventListener('click', function(e) {
  var tab = e.target.closest('[role="tab"][data-tab]');
  if (tab) { switchTab(tab.dataset.tab); return; }

  var mergerTab = e.target.closest('[data-merger-pair]');
  if (mergerTab) switchMergerPair(mergerTab.dataset.mergerPair);
});

document.addEventListener('input', function(e) {
  if (e.target.id === 'fieldSearch') renderUnmappedFields();
});

// ====== Init ======

renderNavbar();
loadConfig();
loadSettings();
loadTechnicalBlocks();
loadLog();
