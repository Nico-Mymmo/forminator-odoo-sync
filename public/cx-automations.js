// CX Automations — Vlag-drempelwaarden beheer
// Vanilla JS, data-action patroon, geen inline handlers.

lucide.createIcons();

// ====== State ======

var odooStages = [];   // [{ id, name }] — dynamisch uit Odoo
var odooReasons = [];  // [{ value, label }] — dynamisch uit Odoo
var savedThresholds = {}; // { stage_id: { yellow_days, orange_days, red_days, flag_reason } }

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

  var modules = (data.user.modules || []).map(function(um) { return um.module || um; });
  var navbar = document.getElementById('navbar');
  navbar.innerHTML = '<header class="flex items-center justify-between bg-base-100 shadow-sm px-4" style="position:fixed;top:0;left:0;right:0;height:48px;z-index:50;">'
    + '<div class="flex items-center gap-4">'
    + '<a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    + '<span class="text-base font-semibold">OpenVME Operations Manager</span>'
    + '</a>'
    + (modules.length > 0
      ? '<div class="dropdown dropdown-hover"><div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2">'
        + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>Modules</div>'
        + '<ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">'
        + modules.map(function(m) { return '<li><a href="' + escapeHtml(m.route) + '">' + escapeHtml(m.name) + '</a></li>'; }).join('')
        + '</ul></div>'
      : '')
    + '</div>'
    + '<span class="text-xs text-base-content/50">CX Automations</span>'
    + '</header>';
  lucide.createIcons();
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
    var updatedAt = saved.updated_at ? formatDate(saved.updated_at) : '';
    var updatedBy = saved.updated_by || '';

    // Reden-opties met juiste geselecteerde waarde
    var reasonOptsForRow = odooReasons.map(function(r) {
      return '<option value="' + escapeHtml(r.value) + '"' + (r.value === reason ? ' selected' : '') + '>'
        + escapeHtml(r.label) + '</option>';
    }).join('');

    return '<tr>'
      + '<td class="py-3 pr-4 font-medium text-sm">' + escapeHtml(stage.name) + '</td>'
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
      + '<td class="py-3 px-2">'
      +   '<select class="select select-bordered select-sm threshold-input" '
      +     'data-stage-id="' + stage.id + '" data-field="flag_reason">'
      +   reasonOptsForRow + '</select></td>'
      + '<td class="py-3 pl-4 text-xs text-base-content/40">'
      +   (updatedAt ? updatedAt + (updatedBy ? '<br>' + escapeHtml(updatedBy) : '') : '—')
      + '</td>'
      + '</tr>';
  }).join('');

  container.innerHTML = '<div class="overflow-x-auto">'
    + '<table class="table table-sm w-full">'
    + '<thead><tr>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2">Fase (Odoo)</th>'
    + '<th class="text-xs font-semibold text-warning pb-2 px-2">🟡 Geel</th>'
    + '<th class="text-xs font-semibold text-orange-500 pb-2 px-2">🟠 Oranje</th>'
    + '<th class="text-xs font-semibold text-error pb-2 px-2">🔴 Rood</th>'
    + '<th class="text-xs font-semibold text-base-content/60 pb-2 px-2">Reden</th>'
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
    byStage[stageId][field] = field === 'flag_reason' ? input.value : (parseInt(input.value) || 0);
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

// ====== Events ======

document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;
  if (action === 'saveThresholds') saveThresholds();
  if (action === 'saveSettings') saveSettings();
  if (action === 'runCron') runCron();
});

// ====== Init ======

renderNavbar();
loadConfig();
loadSettings();
loadTechnicalBlocks();
loadLog();
