/**
 * Event Operations v2 — Communicatie-studio (client)
 *
 * Bewerkt de mailblokken die IN ODOO staan:
 *   x_webinar_event_type.x_studio_mail_blocks      (standaard per type)
 *   x_webinar.x_studio_mail_blocks_override        (override per event)
 *
 * Er is geen lokale opslag en geen tweede waarheid: alles gaat via de
 * JSON-routes van de Worker, die op hun beurt enkel die twee Odoo-velden
 * lezen en schrijven.
 *
 * REGELS UIT CLAUDE.md die hier gelden:
 *  - geen inline onclick/onchange; alles via data-attributen + één centrale
 *    listener (die van events-v2-client.js, uitgebreid onderaan dit bestand)
 *  - tabs altijd tabs-boxed
 *  - fetch met credentials: 'include', bij 401 terug naar /
 */

(function () {
  'use strict';

  var API = '/events-v2/api';

  var state = {
    eventId: null,
    eventTitle: '',
    eventTypeId: null,
    eventTypeName: '',
    kind: 'confirmation',
    scope: 'event_type',
    typeDoc: null,
    eventDoc: null,
    schema: null,
    dirty: false,
    previewTimer: null,
    sending: false
  };

  var KIND_LABEL = {
    confirmation: 'bevestiging',
    reminder: 'reminder',
    recap: 'recap'
  };

  var BLOCK_LABEL = {
    hero: 'Hero-afbeelding',
    heading: 'Titel',
    text: 'Tekst',
    event_details: 'Praktisch (datum, plaats, link)',
    button: 'Knop',
    divider: 'Scheidingslijn',
    spacer: 'Witruimte',
    video: 'Video-thumbnail'
  };

  // Welke velden een bloktype heeft. Eén bron, zodat de editor en de
  // renderer in de Worker niet uit elkaar kunnen lopen qua veldnamen.
  var BLOCK_FIELDS = {
    hero: [
      { key: 'src', label: 'Afbeelding-URL', type: 'url' },
      { key: 'alt', label: 'Alt-tekst', type: 'text' },
      { key: 'href', label: 'Link (optioneel)', type: 'url' },
      { key: 'width', label: 'Breedte (px)', type: 'number' }
    ],
    heading: [
      { key: 'text', label: 'Tekst', type: 'text' },
      { key: 'level', label: 'Niveau (1-3)', type: 'number' }
    ],
    text: [{ key: 'html', label: 'Tekst (HTML mag)', type: 'textarea' }],
    event_details: [],
    button: [
      { key: 'label', label: 'Opschrift', type: 'text' },
      { key: 'href', label: 'Link', type: 'url' }
    ],
    divider: [],
    spacer: [{ key: 'height', label: 'Hoogte (px)', type: 'number' }],
    video: [
      { key: 'href', label: 'Video-URL', type: 'url' },
      { key: 'thumbnail', label: 'Thumbnail-URL', type: 'url' },
      { key: 'alt', label: 'Alt-tekst', type: 'text' }
    ]
  };

  function el(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function api(path, options) {
    var response = await fetch(API + path, Object.assign({ credentials: 'include' }, options || {}));
    if (response.status === 401) { window.location.href = '/'; return null; }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || ('Serverfout ' + response.status));
    }
    return payload.data;
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') { window.showToast(message, type); return; }
    console.log('[mail-studio]', message);
  }

  /** Het document dat op dit moment bewerkt wordt (type of event). */
  function activeDoc() {
    return state.scope === 'event' ? state.eventDoc : state.typeDoc;
  }

  function activeSection() {
    var doc = activeDoc();
    if (!doc[state.kind]) doc[state.kind] = { subject: '', preheader: '', blocks: [] };
    if (!Array.isArray(doc[state.kind].blocks)) doc[state.kind].blocks = [];
    return doc[state.kind];
  }

  function markDirty() {
    state.dirty = true;
    el('mailStudioDirty').textContent = 'Niet-bewaarde wijzigingen';
    schedulePreview();
  }

  // ─── Openen ────────────────────────────────────────────────────────────────

  async function open(eventId) {
    state.eventId = Number(eventId);
    state.dirty = false;
    state.kind = 'confirmation';
    state.scope = 'event_type';

    el('mailStudioDialog').showModal();
    el('mailStudioEditor').innerHTML = '<p class="text-sm opacity-60">Laden…</p>';
    el('mailStudioDirty').textContent = '';

    try {
      if (!state.schema) state.schema = await api('/mail/schema');

      var data = await api('/events/' + state.eventId + '/mail-blocks');
      state.eventTypeId = data.event_type.id;
      state.eventTypeName = data.event_type.name || '(geen type)';
      state.typeDoc = data.type_doc;
      state.eventDoc = data.event_doc;

      el('mailStudioSubtitle').textContent = state.eventTypeName + ' · blokken staan in Odoo';
      renderStatus(data);
      render();
    } catch (error) {
      el('mailStudioEditor').innerHTML = '<p class="text-sm text-error">' + esc(error.message) + '</p>';
    }
  }

  function renderStatus(data) {
    var owned = data.owned_by_om;
    var badge = owned
      ? '<span class="badge badge-success badge-sm">De OM verstuurt deze mails</span>'
      : '<span class="badge badge-warning badge-sm">Odoo-automations versturen nog</span>';

    var hint = owned
      ? 'Bevestiging en reminder worden bij het inschrijven klaargezet in mail.mail.'
      : 'Zet dit event-type in EVENTS_V2_MAIL_OWNER om het over te nemen. Tot dan blijven de bestaande automations het werk doen en dient dit scherm om de opmaak voor te bereiden.';

    el('mailStudioStatus').innerHTML = badge + '<span class="opacity-70">' + esc(hint) + '</span>';
  }

  // ─── Editor ────────────────────────────────────────────────────────────────

  function render() {
    renderTabs();
    renderScope();
    renderEditor();
    renderSendButton();
    schedulePreview();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderTabs() {
    el('mailStudioKindTabs').querySelectorAll('[data-mail-kind]').forEach(function (tab) {
      tab.classList.toggle('tab-active', tab.getAttribute('data-mail-kind') === state.kind);
    });
  }

  function renderScope() {
    el('mailScopeType').classList.toggle('btn-active', state.scope === 'event_type');
    el('mailScopeEvent').classList.toggle('btn-active', state.scope === 'event');
  }

  function renderEditor() {
    var section = activeSection();
    var container = el('mailStudioEditor');

    var scopeNote = state.scope === 'event'
      ? 'Deze blokken gelden ALLEEN voor dit event en overschrijven de standaard van het type volledig. Maak de lijst leeg om weer van het type te erven.'
      : 'Deze blokken zijn de standaard voor élk event van het type "' + state.eventTypeName + '".';

    var head =
      '<div class="alert alert-info py-2 text-xs">' + esc(scopeNote) + '</div>' +
      '<label class="form-control">' +
        '<span class="label-text text-xs opacity-70 mb-1">Onderwerp</span>' +
        '<input class="input input-bordered input-sm" data-mail-field="subject" value="' + esc(section.subject) + '">' +
      '</label>' +
      '<label class="form-control">' +
        '<span class="label-text text-xs opacity-70 mb-1">Voorbeeldtekst in de inbox (preheader)</span>' +
        '<input class="input input-bordered input-sm" data-mail-field="preheader" value="' + esc(section.preheader) + '">' +
      '</label>';

    var blocks = section.blocks.length === 0
      ? '<p class="text-sm opacity-60 py-4">Nog geen blokken. Voeg er hieronder een toe.</p>'
      : section.blocks.map(renderBlockCard).join('');

    var addOptions = Object.keys(BLOCK_FIELDS).map(function (type) {
      return '<option value="' + type + '">' + esc(BLOCK_LABEL[type] || type) + '</option>';
    }).join('');

    var footer =
      '<div class="flex items-center gap-2 pt-2 border-t border-base-200">' +
        '<select class="select select-bordered select-sm flex-1" id="mailAddType">' + addOptions + '</select>' +
        '<button class="btn btn-sm btn-outline gap-1" data-action="mail-add-block">' +
          '<i data-lucide="plus" class="w-4 h-4"></i> Blok toevoegen</button>' +
      '</div>' +
      '<details class="text-xs opacity-70">' +
        '<summary class="cursor-pointer">Beschikbare placeholders</summary>' +
        '<div class="pt-2 flex flex-wrap gap-1">' +
          (state.schema ? state.schema.placeholders : []).map(function (p) {
            return '<code class="bg-base-200 rounded px-1">{{' + esc(p) + '}}</code>';
          }).join('') +
        '</div>' +
      '</details>';

    container.innerHTML = head + '<div class="space-y-2">' + blocks + '</div>' + footer;
  }

  function renderBlockCard(block, index) {
    var fields = (BLOCK_FIELDS[block.type] || []).map(function (field) {
      var value = block[field.key] === undefined || block[field.key] === null ? '' : block[field.key];
      if (field.type === 'textarea') {
        return '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">' + esc(field.label) + '</span>' +
          '<textarea rows="4" class="textarea textarea-bordered textarea-sm font-mono text-xs" ' +
          'data-mail-block="' + index + '" data-mail-prop="' + esc(field.key) + '">' + esc(value) + '</textarea></label>';
      }
      return '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">' + esc(field.label) + '</span>' +
        '<input type="' + esc(field.type) + '" class="input input-bordered input-sm" ' +
        'data-mail-block="' + index + '" data-mail-prop="' + esc(field.key) + '" value="' + esc(value) + '"></label>';
    }).join('');

    // Site-zichtbaarheid: dit vervangt de QWeb t-if op
    // x_studio_registration_site die vandaag het hero-logo per site kiest.
    var sites = Array.isArray(block.sites) ? block.sites : [];
    var siteChips = (state.schema ? state.schema.sites : ['openvme', 'syndicoach']).map(function (site) {
      var on = sites.indexOf(site) !== -1;
      return '<button class="btn btn-xs ' + (on ? 'btn-primary' : 'btn-ghost') + '" ' +
        'data-action="mail-toggle-site" data-mail-block="' + index + '" data-mail-site="' + esc(site) + '">' +
        esc(site) + '</button>';
    }).join('');

    return '<div class="card bg-base-100 border border-base-200">' +
      '<div class="px-3 py-2 flex items-center gap-2 border-b border-base-200">' +
        '<span class="text-sm font-medium">' + esc(BLOCK_LABEL[block.type] || block.type) + '</span>' +
        '<div class="ml-auto flex items-center gap-1">' +
          '<button class="btn btn-xs btn-ghost btn-square" data-action="mail-move-block" data-mail-block="' + index + '" data-mail-dir="-1" title="Omhoog">' +
            '<i data-lucide="chevron-up" class="w-3 h-3"></i></button>' +
          '<button class="btn btn-xs btn-ghost btn-square" data-action="mail-move-block" data-mail-block="' + index + '" data-mail-dir="1" title="Omlaag">' +
            '<i data-lucide="chevron-down" class="w-3 h-3"></i></button>' +
          '<button class="btn btn-xs btn-ghost btn-square text-error" data-action="mail-remove-block" data-mail-block="' + index + '" title="Verwijderen">' +
            '<i data-lucide="trash-2" class="w-3 h-3"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="p-3 space-y-2">' +
        (fields || '<p class="text-xs opacity-60">Dit blok heeft geen instellingen.</p>') +
        '<div class="flex items-center gap-2 pt-1">' +
          '<span class="text-xs opacity-60">Alleen tonen op:</span>' + siteChips +
          '<span class="text-xs opacity-40">' + (sites.length === 0 ? 'niets aan = iedereen' : '') + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Voorbeeld ─────────────────────────────────────────────────────────────

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(refreshPreview, 350);
  }

  async function refreshPreview() {
    if (!state.eventId) return;

    // Het voorbeeld toont wat er MET DE HUIDIGE, NOG NIET BEWAARDE blokken
    // verstuurd zou worden. Daarom sturen we het bewerkte document mee in
    // plaats van de server opnieuw uit Odoo te laten lezen.
    try {
      var data = await api('/events/' + state.eventId + '/mail-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: state.kind,
          site: el('mailPreviewSite').value || null,
          draft: activeDoc(),
          scope: state.scope
        })
      });
      if (!data) return;

      el('mailPreviewSubject').textContent = data.subject || '(geen onderwerp ingesteld)';
      el('mailPreviewFrame').srcdoc = data.html || '<p style="font-family:sans-serif;padding:24px;color:#6b7280">Nog geen blokken.</p>';
      el('mailPreviewMeta').textContent = data.sender_error
        ? 'Afzender: ' + data.sender_error
        : 'Van ' + (data.email_from || '—');
    } catch (error) {
      el('mailPreviewMeta').textContent = error.message;
    }
  }

  // ─── Bewaren en versturen ──────────────────────────────────────────────────

  function renderSendButton() {
    var label = 'Klaarzetten: ' + (KIND_LABEL[state.kind] || state.kind);
    el('mailSendLabel').textContent = label;
    // Bevestiging vertrekt automatisch bij het inschrijven; handmatig
    // klaarzetten is er alleen voor wie er eentje gemist heeft.
    el('mailSendBtn').classList.toggle('btn-primary', state.kind === 'recap');
  }

  async function save() {
    var path = state.scope === 'event'
      ? '/events/' + state.eventId + '/mail-blocks'
      : '/event-types/' + state.eventTypeId + '/mail-blocks';

    if (state.scope === 'event_type' && !state.eventTypeId) {
      toast('Dit event heeft geen event-type; kies eerst een type of gebruik "Alleen dit event".', 'error');
      return;
    }

    try {
      var saved = await api(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDoc())
      });
      if (state.scope === 'event') state.eventDoc = saved; else state.typeDoc = saved;
      state.dirty = false;
      el('mailStudioDirty').textContent = '';
      toast('Blokken bewaard in Odoo', 'success');
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function send() {
    if (state.sending) return;
    if (state.dirty && !window.confirm('Er zijn niet-bewaarde wijzigingen. Toch versturen met wat er in Odoo staat?')) return;

    state.sending = true;
    el('mailSendBtn').classList.add('btn-disabled');
    try {
      var result = await api('/events/' + state.eventId + '/mails/' + state.kind + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (result) {
        var queued = result.queued ? result.queued.length : 0;
        var skipped = result.skipped ? result.skipped.length : 0;
        toast(
          result.message ||
            (queued + ' mail(s) klaargezet' + (skipped ? ', ' + skipped + ' overgeslagen' : '')),
          queued > 0 ? 'success' : 'info'
        );
      }
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      state.sending = false;
      el('mailSendBtn').classList.remove('btn-disabled');
    }
  }

  // ─── Eén centrale listener, geen inline handlers ───────────────────────────

  document.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-mail-kind]');
    if (tab && el('mailStudioDialog').open) {
      state.kind = tab.getAttribute('data-mail-kind');
      render();
      return;
    }

    var trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    var action = trigger.getAttribute('data-action');

    if (action === 'open-mail-studio') {
      open(trigger.getAttribute('data-event-id'));
      return;
    }
    if (!el('mailStudioDialog').open) return;

    var index = Number(trigger.getAttribute('data-mail-block'));

    switch (action) {
      case 'mail-studio-close':
        el('mailStudioDialog').close();
        break;
      case 'mail-scope':
        state.scope = trigger.getAttribute('data-mail-scope');
        render();
        break;
      case 'mail-add-block': {
        var type = el('mailAddType').value;
        activeSection().blocks.push({ id: type + '-' + Date.now(), type: type, sites: [] });
        markDirty();
        renderEditor();
        if (window.lucide) window.lucide.createIcons();
        break;
      }
      case 'mail-remove-block':
        activeSection().blocks.splice(index, 1);
        markDirty();
        renderEditor();
        if (window.lucide) window.lucide.createIcons();
        break;
      case 'mail-move-block': {
        var dir = Number(trigger.getAttribute('data-mail-dir'));
        var blocks = activeSection().blocks;
        var target = index + dir;
        if (target >= 0 && target < blocks.length) {
          var moved = blocks.splice(index, 1)[0];
          blocks.splice(target, 0, moved);
          markDirty();
          renderEditor();
          if (window.lucide) window.lucide.createIcons();
        }
        break;
      }
      case 'mail-toggle-site': {
        var site = trigger.getAttribute('data-mail-site');
        var block = activeSection().blocks[index];
        if (!Array.isArray(block.sites)) block.sites = [];
        var at = block.sites.indexOf(site);
        if (at === -1) block.sites.push(site); else block.sites.splice(at, 1);
        markDirty();
        renderEditor();
        if (window.lucide) window.lucide.createIcons();
        break;
      }
      case 'mail-save': save(); break;
      case 'mail-send': send(); break;
      default: break;
    }
  });

  document.addEventListener('input', function (event) {
    if (!el('mailStudioDialog').open) return;
    var target = event.target;

    var docField = target.getAttribute && target.getAttribute('data-mail-field');
    if (docField) {
      activeSection()[docField] = target.value;
      markDirty();
      return;
    }

    var blockIndex = target.getAttribute && target.getAttribute('data-mail-block');
    var prop = target.getAttribute && target.getAttribute('data-mail-prop');
    if (blockIndex !== null && blockIndex !== undefined && prop) {
      var block = activeSection().blocks[Number(blockIndex)];
      if (!block) return;
      block[prop] = target.type === 'number' ? Number(target.value) : target.value;
      markDirty();
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'mailPreviewSite') refreshPreview();
  });

  window.EventsMailStudio = { open: open };
})();
