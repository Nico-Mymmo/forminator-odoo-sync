export const forminatorSyncV2ClientScript = String.raw`
(() => {
  const state = {
    integrations: [],
    activeIntegrationId: null,
    meta: null,
    detail: null,
    testStatus: null,
    submissions: []
  };

  const els = {
    integrationList: document.getElementById('integrationList'),
    integrationForm: document.getElementById('integrationForm'),
    resolverForm: document.getElementById('resolverForm'),
    targetForm: document.getElementById('targetForm'),
    mappingForm: document.getElementById('mappingForm'),
    testForm: document.getElementById('testForm'),
    statusAlert: document.getElementById('statusAlert'),
    selectedIntegrationLabel: document.getElementById('selectedIntegrationLabel'),
    resolverRows: document.getElementById('resolverRows'),
    targetRows: document.getElementById('targetRows'),
    mappingRows: document.getElementById('mappingRows'),
    activationToggle: document.getElementById('integrationActive'),
    testInfo: document.getElementById('testInfo'),
    submissionRows: document.getElementById('submissionRows')
  };

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('nl-BE');
  }

  function shortId(value) {
    const raw = String(value || '');
    return raw ? raw.slice(0, 8) : '-';
  }

  function isReplayAllowedStatus(status) {
    return ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(String(status || ''));
  }

  function statusBadgeClass(status) {
    const value = String(status || '');
    if (value === 'success') return 'badge-success';
    if (value === 'partial_failed') return 'badge-warning';
    if (value === 'permanent_failed') return 'badge-error';
    if (value === 'retry_scheduled') return 'badge-warning';
    if (value === 'retry_running') return 'badge-info';
    if (value === 'retry_exhausted') return 'badge-error';
    if (value === 'duplicate_inflight') return 'badge-info';
    if (value === 'duplicate_ignored') return 'badge-neutral';
    if (value === 'running') return 'badge-info';
    return 'badge-ghost';
  }

  function findLatestReplayChild(parentSubmissionId) {
    const children = (state.submissions || [])
      .filter((row) => row.replay_of_submission_id === parentSubmissionId)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    return children[0] || null;
  }

  function renderSubmissionHistory() {
    if (!els.submissionRows) return;

    const submissions = state.submissions || [];
    if (submissions.length === 0) {
      els.submissionRows.innerHTML = '<tr><td colspan="8" class="text-base-content/60">Nog geen submissions</td></tr>';
      return;
    }

    els.submissionRows.innerHTML = submissions.map((submission) => {
      const replayAllowed = isReplayAllowedStatus(submission.status);
      const latestReplay = findLatestReplayChild(submission.id);
      const replayAction = replayAllowed
        ? '<button class="btn btn-xs btn-primary" data-action="replay-submission" data-id="' + submission.id + '">Opnieuw uitvoeren</button>'
        : '<span class="text-base-content/50">-</span>';

      const replayOf = submission.replay_of_submission_id
        ? '<span class="font-mono">' + escapeHtml(shortId(submission.replay_of_submission_id)) + '</span>'
        : '-';

      const replayChild = latestReplay
        ? '<span class="font-mono">' + escapeHtml(shortId(latestReplay.id)) + '</span>'
        : '-';

      return '<tr>' +
        '<td><span class="font-mono">' + escapeHtml(shortId(submission.id)) + '</span></td>' +
        '<td><span class="badge ' + statusBadgeClass(submission.status) + '">' + escapeHtml(submission.status || '-') + '</span></td>' +
        '<td>' + escapeHtml(String(submission.retry_count ?? '-')) + '</td>' +
        '<td>' + escapeHtml(formatDateTime(submission.next_retry_at)) + '</td>' +
        '<td>' + replayOf + '</td>' +
        '<td>' + replayChild + '</td>' +
        '<td>' + escapeHtml(formatDateTime(submission.created_at)) + '</td>' +
        '<td>' + replayAction + '</td>' +
      '</tr>';
    }).join('');
  }

  function showStatus(message, type = 'info') {
    if (!els.statusAlert) return;
    els.statusAlert.className = 'alert mb-4';
    if (type === 'error') els.statusAlert.classList.add('alert-error');
    if (type === 'success') els.statusAlert.classList.add('alert-success');
    if (type === 'warning') els.statusAlert.classList.add('alert-warning');
    if (type === 'info') els.statusAlert.classList.add('alert-info');
    els.statusAlert.textContent = message;
    els.statusAlert.style.display = 'flex';
  }

  async function api(path, options = {}) {
    const response = await fetch('/forminator-v2/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || body.success === false) {
      throw new Error(body.error || 'Request failed');
    }

    return body;
  }

  function renderIntegrations() {
    if (!els.integrationList) return;

    if (state.integrations.length === 0) {
      els.integrationList.innerHTML = '<tr><td colspan="5" class="text-base-content/60">Nog geen integraties</td></tr>';
      return;
    }

    els.integrationList.innerHTML = state.integrations.map((row) => {
      const isActive = row.id === state.activeIntegrationId;
      return '<tr>' +
        '<td><button class="btn btn-xs btn-ghost" data-action="select-integration" data-id="' + row.id + '">Open</button></td>' +
        '<td>' + escapeHtml(row.name || '-') + '</td>' +
        '<td>' + escapeHtml(row.forminator_form_id || '-') + '</td>' +
        '<td>' + escapeHtml(row.odoo_connection_id || '-') + '</td>' +
        '<td>' + (row.is_active ? '<span class="badge badge-success">Actief</span>' : '<span class="badge">Inactief</span>') + (isActive ? ' <span class="badge badge-primary">Geselecteerd</span>' : '') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderDetail() {
    const detail = state.detail;
    if (!detail || !detail.integration) {
      if (els.selectedIntegrationLabel) els.selectedIntegrationLabel.textContent = 'Geen integratie geselecteerd';
      if (els.resolverRows) els.resolverRows.innerHTML = '<tr><td colspan="6" class="text-base-content/60">Selecteer eerst een integratie</td></tr>';
      if (els.targetRows) els.targetRows.innerHTML = '<tr><td colspan="6" class="text-base-content/60">Selecteer eerst een integratie</td></tr>';
      if (els.mappingRows) els.mappingRows.innerHTML = '<tr><td colspan="6" class="text-base-content/60">Selecteer eerst een target</td></tr>';
      if (els.activationToggle) els.activationToggle.checked = false;
      if (els.testInfo) els.testInfo.textContent = 'Geen test uitgevoerd.';
      if (els.submissionRows) els.submissionRows.innerHTML = '<tr><td colspan="8" class="text-base-content/60">Selecteer eerst een integratie</td></tr>';
      return;
    }

    if (els.selectedIntegrationLabel) {
      els.selectedIntegrationLabel.textContent = detail.integration.name + ' (' + detail.integration.forminator_form_id + ')';
    }
    if (els.activationToggle) {
      els.activationToggle.checked = !!detail.integration.is_active;
    }

    const resolvers = detail.resolvers || [];
    els.resolverRows.innerHTML = resolvers.length
      ? resolvers.map((resolver) => '<tr>' +
          '<td>' + escapeHtml(resolver.resolver_type) + '</td>' +
          '<td>' + escapeHtml(resolver.input_source_field) + '</td>' +
          '<td>' + (resolver.create_if_missing ? 'Ja' : 'Nee') + '</td>' +
          '<td>' + escapeHtml(resolver.output_context_key) + '</td>' +
          '<td>' + escapeHtml(String(resolver.order_index ?? '0')) + '</td>' +
          '<td><button class="btn btn-xs btn-error" data-action="delete-resolver" data-id="' + resolver.id + '">Verwijder</button></td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" class="text-base-content/60">Nog geen herkenningen</td></tr>';

    const targets = detail.targets || [];
    els.targetRows.innerHTML = targets.length
      ? targets.map((target) => '<tr>' +
          '<td>' + escapeHtml(target.odoo_model) + '</td>' +
          '<td>' + escapeHtml(target.identifier_type) + '</td>' +
          '<td>' + escapeHtml(target.update_policy) + '</td>' +
          '<td>' + escapeHtml(String(target.order_index ?? '0')) + '</td>' +
          '<td>' + ((detail.mappingsByTarget?.[target.id] || []).length) + '</td>' +
          '<td><button class="btn btn-xs btn-error" data-action="delete-target" data-id="' + target.id + '">Verwijder</button></td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" class="text-base-content/60">Nog geen schrijfdoelen</td></tr>';

    const firstTarget = targets[0];
    const mappings = firstTarget ? (detail.mappingsByTarget?.[firstTarget.id] || []) : [];
    els.mappingRows.innerHTML = mappings.length
      ? mappings.map((mapping) => '<tr>' +
          '<td>' + escapeHtml(mapping.odoo_field) + '</td>' +
          '<td>' + escapeHtml(mapping.source_type) + '</td>' +
          '<td>' + escapeHtml(mapping.source_value) + '</td>' +
          '<td>' + (mapping.is_required ? 'Ja' : 'Nee') + '</td>' +
          '<td>' + escapeHtml(String(mapping.order_index ?? '0')) + '</td>' +
          '<td><button class="btn btn-xs btn-error" data-action="delete-mapping" data-id="' + mapping.id + '">Verwijder</button></td>' +
        '</tr>').join('')
      : '<tr><td colspan="6" class="text-base-content/60">Nog geen veldkoppelingen op eerste target</td></tr>';

    if (els.testInfo) {
      const tested = state.testStatus?.has_successful_test;
      els.testInfo.textContent = tested
        ? 'Laatste teststatus: geslaagd. Activatie toegestaan.'
        : 'Laatste teststatus: niet geslaagd. Activatie blijft geblokkeerd.';
    }

    renderSubmissionHistory();

    populateMappingTargetSelect();
  }

  function populateMeta() {
    if (!state.meta) return;

    const resolverSelect = document.getElementById('resolverType');
    const targetModelSelect = document.getElementById('targetModel');
    const targetPolicySelect = document.getElementById('targetPolicy');
    const mappingSourceType = document.getElementById('mappingSourceType');

    if (resolverSelect) {
      resolverSelect.innerHTML = state.meta.resolverTypes.map((value) => '<option value="' + value + '">' + value + '</option>').join('');
    }

    if (targetModelSelect) {
      targetModelSelect.innerHTML = state.meta.targetModels.map((value) => '<option value="' + value + '">' + value + '</option>').join('');
    }

    if (targetPolicySelect) {
      targetPolicySelect.innerHTML = state.meta.updatePolicies.map((value) => '<option value="' + value + '">' + value + '</option>').join('');
    }

    if (mappingSourceType) {
      mappingSourceType.innerHTML = state.meta.sourceTypes.map((value) => '<option value="' + value + '">' + value + '</option>').join('');
    }
  }

  function populateMappingTargetSelect() {
    const mappingTargetSelect = document.getElementById('mappingTargetId');
    if (!mappingTargetSelect) return;
    const targets = state.detail?.targets || [];

    mappingTargetSelect.innerHTML = targets.map((target) => {
      return '<option value="' + target.id + '">' + escapeHtml(target.odoo_model) + ' (' + target.identifier_type + ')</option>';
    }).join('');
  }

  function getIdentifierTypeForModel(model) {
    if (model === 'x_webinarregistrations') return 'registration_composite';
    if (model === 'crm.lead') return 'single_email';
    if (model === 'res.partner') return 'single_email';
    return 'single_email';
  }

  function getOutputKeyForResolverType(type) {
    if (type === 'partner_by_email') return 'context.partner_id';
    if (type === 'webinar_by_external_id') return 'context.webinar_id';
    return 'context.unknown';
  }

  function updateResolverDependentUi() {
    const resolverType = document.getElementById('resolverType')?.value;
    const createWrapper = document.getElementById('createIfMissingWrapper');
    const outputKeyInput = document.getElementById('resolverOutputKey');

    if (outputKeyInput) {
      outputKeyInput.value = getOutputKeyForResolverType(resolverType);
    }

    if (createWrapper) {
      createWrapper.style.display = resolverType === 'partner_by_email' ? 'block' : 'none';
      const checkbox = document.getElementById('resolverCreateIfMissing');
      if (checkbox && resolverType !== 'partner_by_email') checkbox.checked = false;
    }
  }

  function updateTargetDependentUi() {
    const model = document.getElementById('targetModel')?.value;
    const identifierInput = document.getElementById('targetIdentifierType');
    const info = document.getElementById('targetIdentifierInfo');

    const identifierType = getIdentifierTypeForModel(model);
    if (identifierInput) identifierInput.value = identifierType;
    if (info) {
      if (model === 'x_webinarregistrations') {
        info.textContent = 'Recordherkenning: contact + webinar';
      } else {
        info.textContent = 'Recordherkenning: e-mailadres';
      }
    }
  }

  async function loadIntegrations() {
    const body = await api('/integrations');
    state.integrations = body.data || [];
    renderIntegrations();
  }

  async function loadIntegrationDetail(id) {
    const body = await api('/integrations/' + id);
    state.detail = body.data;
    state.activeIntegrationId = id;

    const test = await api('/integrations/' + id + '/test-status');
    state.testStatus = test.data;

    const submissions = await api('/integrations/' + id + '/submissions');
    state.submissions = submissions.data || [];

    renderIntegrations();
    renderDetail();
  }

  async function loadMeta() {
    const body = await api('/meta');
    state.meta = body.data;
    populateMeta();
    updateResolverDependentUi();
    updateTargetDependentUi();
  }

  async function handleCreateIntegration(event) {
    event.preventDefault();
    const formData = new FormData(els.integrationForm);

    const payload = {
      name: String(formData.get('name') || '').trim(),
      forminator_form_id: String(formData.get('forminator_form_id') || '').trim(),
      odoo_connection_id: String(formData.get('odoo_connection_id') || '').trim()
    };

    const body = await api('/integrations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showStatus('Integratie aangemaakt.', 'success');
    await loadIntegrations();
    await loadIntegrationDetail(body.data.id);
  }

  async function handleAddResolver(event) {
    event.preventDefault();
    if (!state.activeIntegrationId) throw new Error('Selecteer eerst een integratie');

    const formData = new FormData(els.resolverForm);
    const resolverType = String(formData.get('resolver_type'));
    const payload = {
      resolver_type: resolverType,
      input_source_field: String(formData.get('input_source_field') || '').trim(),
      create_if_missing: resolverType === 'partner_by_email' ? formData.get('create_if_missing') === 'on' : false,
      output_context_key: String(formData.get('output_context_key') || '').trim(),
      order_index: Number(formData.get('order_index') || '0')
    };

    await api('/integrations/' + state.activeIntegrationId + '/resolvers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showStatus('Herkenning toegevoegd.', 'success');
    els.resolverForm.reset();
    updateResolverDependentUi();
    await loadIntegrationDetail(state.activeIntegrationId);
  }

  async function handleAddTarget(event) {
    event.preventDefault();
    if (!state.activeIntegrationId) throw new Error('Selecteer eerst een integratie');

    const formData = new FormData(els.targetForm);
    const model = String(formData.get('odoo_model'));

    const payload = {
      odoo_model: model,
      identifier_type: getIdentifierTypeForModel(model),
      update_policy: String(formData.get('update_policy')),
      order_index: Number(formData.get('order_index') || '0')
    };

    await api('/integrations/' + state.activeIntegrationId + '/targets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showStatus('Schrijfdoel toegevoegd.', 'success');
    await loadIntegrationDetail(state.activeIntegrationId);
  }

  async function handleAddMapping(event) {
    event.preventDefault();
    const formData = new FormData(els.mappingForm);
    const targetId = String(formData.get('target_id') || '');
    if (!targetId) throw new Error('Kies eerst een target voor koppeling');

    const payload = {
      odoo_field: String(formData.get('odoo_field') || '').trim(),
      source_type: String(formData.get('source_type') || '').trim(),
      source_value: String(formData.get('source_value') || '').trim(),
      is_required: formData.get('is_required') === 'on',
      order_index: Number(formData.get('order_index') || '0')
    };

    await api('/targets/' + targetId + '/mappings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showStatus('Veldkoppeling toegevoegd.', 'success');
    await loadIntegrationDetail(state.activeIntegrationId);
  }

  async function handleRunTestStub(event) {
    event.preventDefault();
    if (!state.activeIntegrationId) throw new Error('Selecteer eerst een integratie');

    await api('/integrations/' + state.activeIntegrationId + '/test-stub', {
      method: 'POST',
      body: JSON.stringify({})
    });

    showStatus('Test geslaagd. Activatie is nu toegestaan.', 'success');
    await loadIntegrationDetail(state.activeIntegrationId);
  }

  async function handleActivationToggle(event) {
    if (!state.activeIntegrationId) {
      event.preventDefault();
      throw new Error('Selecteer eerst een integratie');
    }

    const desired = event.target.checked;
    try {
      await api('/integrations/' + state.activeIntegrationId, {
        method: 'PUT',
        body: JSON.stringify({ is_active: desired })
      });
      showStatus(desired ? 'Integratie geactiveerd.' : 'Integratie gedeactiveerd.', 'success');
      await loadIntegrations();
      await loadIntegrationDetail(state.activeIntegrationId);
    } catch (error) {
      event.target.checked = !desired;
      throw error;
    }
  }

  async function handleTableActions(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'select-integration') {
      await loadIntegrationDetail(id);
      return;
    }

    if (!state.activeIntegrationId) {
      throw new Error('Selecteer eerst een integratie');
    }

    if (action === 'delete-resolver') {
      await api('/integrations/' + state.activeIntegrationId + '/resolvers/' + id, { method: 'DELETE' });
      showStatus('Herkenning verwijderd.', 'success');
      await loadIntegrationDetail(state.activeIntegrationId);
      return;
    }

    if (action === 'delete-target') {
      await api('/integrations/' + state.activeIntegrationId + '/targets/' + id, { method: 'DELETE' });
      showStatus('Schrijfdoel verwijderd.', 'success');
      await loadIntegrationDetail(state.activeIntegrationId);
      return;
    }

    if (action === 'delete-mapping') {
      await api('/mappings/' + id, { method: 'DELETE' });
      showStatus('Veldkoppeling verwijderd.', 'success');
      await loadIntegrationDetail(state.activeIntegrationId);
      return;
    }

    if (action === 'replay-submission') {
      const body = await api('/submissions/' + id + '/replay', { method: 'POST', body: JSON.stringify({}) });
      showStatus('Replay gestart: nieuwe submission ' + shortId(body.data?.replay_submission_id), 'success');
      await loadIntegrationDetail(state.activeIntegrationId);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function bootstrap() {
    try {
      await loadMeta();
      await loadIntegrations();
      await loadWpConnections();
      await loadSitesFromEnv();
      renderDetail();
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WordPress Discovery
  // ─────────────────────────────────────────────────────────────────────────

  async function loadWpConnections() {
    try {
      const res = await fetch('/forminator-v2/api/discovery/connections');
      const json = await res.json();
      const connections = json.data || [];

      const select = document.getElementById('wpConnectionSelect');
      if (!select) return;
      select.innerHTML = '<option value="">— selecteer site —</option>';
      connections.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + ' (' + c.base_url + ')';
        select.appendChild(opt);
      });

      renderConnectionList(connections);
    } catch (err) {
      showStatus('Fout bij laden WordPress connecties: ' + err.message, 'error');
    }
  }

  function renderConnectionList(connections) {
    const el = document.getElementById('connectionList');
    if (!el) return;
    if (connections.length === 0) {
      el.innerHTML = '<p class="text-sm text-base-content/60">Geen connecties geconfigureerd.</p>';
      return;
    }
    el.innerHTML = '<ul class="list-none space-y-1">' +
      connections.map((c) =>
        '<li class="flex items-center gap-2 text-sm">' +
        '<span class="font-medium">' + c.name + '</span>' +
        '<span class="text-base-content/60">' + c.base_url + '</span>' +
        '<button class="btn btn-xs btn-error ml-auto" data-action="delete-connection" data-id="' + c.id + '">Verwijderen</button>' +
        '</li>'
      ).join('') +
      '</ul>';
  }

  async function handleLoadForms() {
    const select = document.getElementById('wpConnectionSelect');
    const resultEl = document.getElementById('formDiscoveryResult');
    if (!select || !resultEl) return;

    const wpConnectionId = select.value;
    if (!wpConnectionId) {
      showStatus('Selecteer eerst een WordPress site.', 'error');
      return;
    }

    resultEl.style.display = 'none';
    resultEl.innerHTML = '<p class="text-sm text-base-content/60">Formulieren ophalen...</p>';
    resultEl.style.display = '';

    try {
      const res = await fetch('/forminator-v2/api/discovery/forms?wp_connection_id=' + encodeURIComponent(wpConnectionId));
      const json = await res.json();

      if (!json.success) {
        resultEl.innerHTML = '<div class="alert alert-error"><span>Fout: ' + escapeHtml(json.error || 'onbekend') + '</span></div>';
        return;
      }

      const forms = json.data || [];
      if (forms.length === 0) {
        resultEl.innerHTML = '<div class="alert alert-warning"><span>Geen formulieren gevonden op deze site.</span></div>';
        return;
      }

      resultEl.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        forms.map((form) => {
          const fields = Array.isArray(form.fields) ? form.fields : [];
          const mappableCount = fields.filter(f => !['page-break','group','html','section','captcha'].includes(f.type)).length;
          return '<div class="card card-compact bg-base-200 border">' +
            '<div class="card-body">' +
            '<div class="flex items-start justify-between gap-2">' +
            '<div>' +
            '<p class="font-semibold text-sm">' + escapeHtml(form.form_name || form.form_id) + '</p>' +
            '<p class="text-xs text-base-content/60">ID: ' + escapeHtml(String(form.form_id)) + '</p>' +
            '</div>' +
            '<span class="badge badge-neutral badge-sm shrink-0">' + mappableCount + ' velden</span>' +
            '</div>' +
            '<button class="btn btn-xs btn-primary mt-2 w-full" ' +
            'data-action="preview-form" ' +
            'data-form-id="' + escapeHtml(String(form.form_id)) + '" ' +
            'data-form-name="' + escapeHtml(String(form.form_name || form.form_id)) + '" ' +
            'data-fields=\'' + escapeHtml(JSON.stringify(fields)) + '\'>Preview velden</button>' +
            '</div></div>';
        }).join('') + '</div>';
    } catch (err) {
      resultEl.innerHTML = '<div class="alert alert-error"><span>Fout: ' + escapeHtml(err.message) + '</span></div>';
    }
  }

  function openFormPreview(formId, formName, fields) {
    const modal = document.getElementById('formPreviewModal');
    const title = document.getElementById('formPreviewTitle');
    const body  = document.getElementById('formPreviewBody');
    if (!modal || !title || !body) return;

    title.textContent = formName + ' (ID: ' + formId + ')';

    if (!fields || fields.length === 0) {
      body.innerHTML = '<p class="text-sm text-base-content/60">Geen velden beschikbaar.</p>';
    } else {
      body.innerHTML =
        '<div class="overflow-x-auto">' +
        '<table class="table table-xs table-zebra">' +
        '<thead><tr><th>Veld ID</th><th>Label</th><th>Type</th><th>Verplicht</th></tr></thead>' +
        '<tbody>' +
        fields.flatMap((f) => {
          const isSkip = ['page-break','group','html','section','captcha'].includes(f.type);
          const rows = [];
          const rowClass = isSkip ? 'opacity-40' : '';
          rows.push(
            '<tr class="' + rowClass + '">' +
            '<td class="font-mono text-xs">' + escapeHtml(String(f.field_id ?? '')) + '</td>' +
            '<td>' + escapeHtml(String(f.label ?? '')) + (f.is_composite ? ' <span class="badge badge-ghost badge-xs">composite</span>' : '') + '</td>' +
            '<td><span class="badge badge-outline badge-xs">' + escapeHtml(String(f.type ?? '')) + '</span></td>' +
            '<td>' + (f.required ? '<span class="badge badge-error badge-xs">verplicht</span>' : '') + '</td>' +
            '</tr>'
          );
          if (f.is_composite && Array.isArray(f.children)) {
            f.children.forEach((child) => {
              rows.push(
                '<tr class="bg-base-200">' +
                '<td class="font-mono text-xs pl-6">↳ ' + escapeHtml(String(child.field_id ?? '')) + '</td>' +
                '<td class="pl-6 text-sm">' + escapeHtml(String(child.label ?? '')) + '</td>' +
                '<td><span class="badge badge-outline badge-xs">' + escapeHtml(String(child.type ?? '')) + '</span></td>' +
                '<td>' + (child.required ? '<span class="badge badge-error badge-xs">verplicht</span>' : '') + '</td>' +
                '</tr>'
              );
            });
          }
          return rows;
        }).join('') +
        '</tbody></table></div>';
    }

    modal.showModal();
  }

  // Preview knop click voor form discovery
  document.addEventListener('click', (event) => {
    if (event.target?.dataset?.action === 'preview-form') {
      const btn = event.target;
      try {
        const fields = JSON.parse(btn.dataset.fields || '[]');
        openFormPreview(btn.dataset.formId, btn.dataset.formName, fields);
      } catch {
        showStatus('Kon velden niet tonen.', 'error');
      }
    }
  });

  async function handleAddConnection(event) {
    event.preventDefault();
    const form = event.target;
    const payload = {
      name: form.name.value.trim(),
      base_url: form.base_url.value.trim(),
      auth_token: form.auth_token.value.trim()
    };
    const res = await fetch('/forminator-v2/api/discovery/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.success) {
      showStatus('Fout: ' + json.error, 'error');
      return;
    }
    form.reset();
    showStatus('Connectie toegevoegd.', 'success');
    loadWpConnections();
  }

  async function handleDeleteConnection(id) {
    const res = await fetch('/forminator-v2/api/discovery/connections/' + id, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      showStatus('Fout bij verwijderen: ' + json.error, 'error');
      return;
    }
    showStatus('Connectie verwijderd.', 'success');
    loadWpConnections();
  }

  document.getElementById('loadFormsBtn')?.addEventListener('click', () => {
    handleLoadForms().catch((err) => showStatus(err.message, 'error'));
  });

  document.getElementById('addConnectionForm')?.addEventListener('submit', (event) => {
    handleAddConnection(event).catch((err) => showStatus(err.message, 'error'));
  });

  document.addEventListener('click', async (event) => {
    if (event.target?.dataset?.action === 'delete-connection') {
      const id = event.target.dataset.id;
      if (id) await handleDeleteConnection(id);
    }
  });

  // ── Cloudflare Secrets multi-site ────────────────────────────────────────────

  async function loadSitesFromEnv() {
    try {
      const res = await fetch('/forminator-v2/api/forminator/sites');
      const json = await res.json();
      const sites = json.data || [];

      const select = document.getElementById('siteEnvSelect');
      if (!select) return;

      if (sites.length === 0) {
        select.innerHTML = '<option value="">\u2014 geen sites geconfigureerd in Cloudflare secrets \u2014</option>';
        return;
      }

      select.innerHTML = '<option value="">\u2014 selecteer site \u2014</option>';
      sites.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.key;
        const tokenStatus = s.has_token ? '' : ' \u26A0\uFE0F geen token';
        opt.textContent = s.label + ' (' + s.url + ')' + tokenStatus;
        select.appendChild(opt);
      });
    } catch (err) {
      showStatus('Fout bij laden Cloudflare sites: ' + err.message, 'error');
    }
  }

  async function handleLoadSiteForms() {
    const select = document.getElementById('siteEnvSelect');
    const resultEl = document.getElementById('siteFormDiscoveryResult');
    if (!select || !resultEl) return;

    const siteKey = select.value;
    if (!siteKey) {
      showStatus('Selecteer eerst een WordPress site.', 'error');
      return;
    }

    resultEl.style.display = 'none';
    resultEl.innerHTML = '<p class="text-sm text-base-content/60">Formulieren ophalen via Basic Auth...</p>';
    resultEl.style.display = '';

    try {
      const res = await fetch('/forminator-v2/api/forminator/forms?site=' + encodeURIComponent(siteKey));
      const json = await res.json();

      if (!json.success) {
        resultEl.innerHTML = '<div class="alert alert-error"><span>Fout: ' + escapeHtml(json.error || 'onbekend') + '</span></div>';
        return;
      }

      const forms = json.data || [];
      if (forms.length === 0) {
        resultEl.innerHTML = '<div class="alert alert-warning"><span>Geen formulieren gevonden op ' + escapeHtml(json.base_url || siteKey) + '.</span></div>';
        return;
      }

      resultEl.innerHTML =
        '<p class="text-xs text-base-content/60 mb-2">Site: ' + escapeHtml(json.base_url || siteKey) + ' &middot; ' + forms.length + ' formulieren</p>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        forms.map((form) => {
          const fields = Array.isArray(form.fields) ? form.fields : [];
          const mappableCount = fields.filter(function(f) {
            return !['page-break','group','html','section','captcha'].includes(f.type);
          }).length;
          return '<div class="card card-compact bg-base-200 border">' +
            '<div class="card-body">' +
            '<div class="flex items-start justify-between gap-2">' +
            '<div>' +
            '<p class="font-semibold text-sm">' + escapeHtml(form.form_name || form.form_id) + '</p>' +
            '<p class="text-xs text-base-content/60">ID: ' + escapeHtml(String(form.form_id)) + '</p>' +
            '</div>' +
            '<span class="badge badge-neutral badge-sm shrink-0">' + mappableCount + ' velden</span>' +
            '</div>' +
            '<button class="btn btn-xs btn-primary mt-2 w-full" ' +
            'data-action="preview-form" ' +
            'data-form-id="' + escapeHtml(String(form.form_id)) + '" ' +
            'data-form-name="' + escapeHtml(String(form.form_name || form.form_id)) + '" ' +
            'data-fields=\'' + escapeHtml(JSON.stringify(fields)) + '\'>Preview velden</button>' +
            '</div></div>';
        }).join('') + '</div>';
    } catch (err) {
      resultEl.innerHTML = '<div class="alert alert-error"><span>Fout: ' + escapeHtml(err.message) + '</span></div>';
    }
  }

  document.getElementById('loadSiteFormsBtn')?.addEventListener('click', () => {
    handleLoadSiteForms().catch((err) => showStatus(err.message, 'error'));
  });

  // einde WordPress Discovery
  // ─────────────────────────────────────────────────────────────────────────

  document.addEventListener('submit', async (event) => {
    try {
      if (event.target === els.integrationForm) return await handleCreateIntegration(event);
      if (event.target === els.resolverForm) return await handleAddResolver(event);
      if (event.target === els.targetForm) return await handleAddTarget(event);
      if (event.target === els.mappingForm) return await handleAddMapping(event);
      if (event.target === els.testForm) return await handleRunTestStub(event);
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });

  document.addEventListener('click', async (event) => {
    try {
      await handleTableActions(event);
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });

  document.getElementById('resolverType')?.addEventListener('change', updateResolverDependentUi);
  document.getElementById('targetModel')?.addEventListener('change', updateTargetDependentUi);
  els.activationToggle?.addEventListener('change', async (event) => {
    try {
      await handleActivationToggle(event);
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });

  bootstrap();
})();
`;
