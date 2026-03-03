/**
 * Forminator Sync V2 — Settings (model link registry)
 *
 * Renders and manages the model link registry UI.
 * Links tell the chain-suggestion engine which many2one field connects two
 * Odoo models in a multi-step pipeline (e.g. crm.lead.partner_id → res.partner).
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2), forminator-sync-v2-flow-builder.js
 */
(function () {
  'use strict';

  if (!window.FSV2) { console.error('[FSV2] Settings: core niet geladen.'); return; }

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  var TARGET_MODELS = ['res.partner', 'crm.lead', 'x_webinarregistrations'];

  var MODEL_DISPLAY = {
    'res.partner':            'Contact',
    'crm.lead':               'Lead',
    'x_webinarregistrations': 'Webinaarinschrijving',
  };

  // ───────────────────────────────────────────────────────────────────
  // renderLinks
  // ───────────────────────────────────────────────────────────────────
  function renderLinks() {
    var el = document.getElementById('linksList');
    if (!el) return;

    var links = Array.isArray(S().modelLinksCache) ? S().modelLinksCache : [];

    // ── Existing links table ──────────────────────────────────────────
    var existingHtml = '';
    if (links.length === 0) {
      existingHtml =
        '<div class="rounded-xl border border-dashed border-base-300 bg-base-50 py-10 text-center mb-6">' +
          '<i data-lucide="link-2" class="w-8 h-8 text-base-content/20 mx-auto mb-3"></i>' +
          '<p class="text-sm text-base-content/50">Nog geen koppelingen gedefinieerd.</p>' +
          '<p class="text-xs text-base-content/40 mt-1">Voeg hieronder een koppeling toe.</p>' +
        '</div>';
    } else {
      existingHtml =
        '<div class="overflow-x-auto mb-6 rounded-xl border border-base-200">' +
          '<table class="table table-sm w-full">' +
            '<thead class="bg-base-200/60">' +
              '<tr>' +
                '<th class="text-xs font-medium text-base-content/60 py-2.5">Van model</th>' +
                '<th class="text-xs font-medium text-base-content/60"></th>' +
                '<th class="text-xs font-medium text-base-content/60">Naar model</th>' +
                '<th class="text-xs font-medium text-base-content/60">Via veld</th>' +
                '<th></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              links.map(function (link, idx) {
                var modelALabel = MODEL_DISPLAY[link.model_a] || link.model_a;
                var modelBLabel = MODEL_DISPLAY[link.model_b] || link.model_b;
                return '<tr class="hover">' +
                  '<td>' +
                    '<div class="flex items-center gap-1.5">' +
                      '<span class="text-sm font-medium">' + esc(modelALabel) + '</span>' +
                      '<code class="text-xs text-base-content/40 font-mono">' + esc(link.model_a) + '</code>' +
                    '</div>' +
                  '</td>' +
                  '<td><i data-lucide="arrow-right" class="w-3.5 h-3.5 text-base-content/30"></i></td>' +
                  '<td>' +
                    '<div class="flex items-center gap-1.5">' +
                      '<span class="text-sm font-medium">' + esc(modelBLabel) + '</span>' +
                      '<code class="text-xs text-base-content/40 font-mono">' + esc(link.model_b) + '</code>' +
                    '</div>' +
                  '</td>' +
                  '<td>' +
                    '<div class="flex items-center gap-1.5">' +
                      '<code class="text-xs bg-base-200 px-1.5 py-0.5 rounded font-mono">' + esc(link.link_field) + '</code>' +
                      (link.link_label
                        ? '<span class="text-xs text-base-content/50">' + esc(link.link_label) + '</span>'
                        : '') +
                    '</div>' +
                  '</td>' +
                  '<td class="text-right">' +
                    '<button type="button" class="btn btn-ghost btn-xs text-error hover:bg-error/10" title="Verwijderen"' +
                      ' data-action="delete-model-link" data-idx="' + idx + '">' +
                      '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>' +
                    '</button>' +
                  '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>';
    }

    // ── Add form ──────────────────────────────────────────────────────
    var modelOpts = TARGET_MODELS.map(function (m) {
      return '<option value="' + esc(m) + '">' + esc((MODEL_DISPLAY[m] || m) + ' — ' + m) + '</option>';
    }).join('');

    var addFormHtml =
      '<div class="card bg-base-100 border border-base-200 shadow-sm">' +
        '<div class="card-body p-5">' +
          '<h4 class="font-semibold text-sm mb-1 flex items-center gap-2">' +
            '<i data-lucide="plus-circle" class="w-4 h-4 text-primary"></i>' +
            'Nieuwe koppeling toevoegen' +
          '</h4>' +
          '<p class="text-xs text-base-content/55 mb-4">' +
            'Kies twee modellen. De app doorzoekt Odoo automatisch naar many2one-velden die de verbinding leggen.' +
          '</p>' +
          '<div class="flex flex-wrap gap-3 items-end">' +
            '<div class="form-control">' +
              '<label class="label py-0 mb-1.5"><span class="label-text text-xs font-semibold">Stap 1 — model</span></label>' +
              '<select id="linkModelA" class="select select-sm select-bordered min-w-52">' +
                '<option value="">— kies model —</option>' + modelOpts +
              '</select>' +
            '</div>' +
            '<div class="flex items-end pb-1.5">' +
              '<i data-lucide="arrow-right" class="w-4 h-4 text-base-content/30"></i>' +
            '</div>' +
            '<div class="form-control">' +
              '<label class="label py-0 mb-1.5"><span class="label-text text-xs font-semibold">Stap 2 — model</span></label>' +
              '<select id="linkModelB" class="select select-sm select-bordered min-w-52">' +
                '<option value="">— kies model —</option>' + modelOpts +
              '</select>' +
            '</div>' +
            '<button type="button" class="btn btn-sm btn-primary" data-action="discover-link-fields">' +
              '<i data-lucide="search" class="w-3.5 h-3.5"></i>' +
              'Zoek verbindingsveld' +
            '</button>' +
          '</div>' +
          '<div id="linkFieldsResult" class="mt-4 min-h-2"></div>' +
        '</div>' +
      '</div>';

    el.innerHTML = existingHtml + addFormHtml;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // ───────────────────────────────────────────────────────────────────
  // renderLinkFieldsResult — shows discovered link-field candidates
  // ───────────────────────────────────────────────────────────────────
  function renderLinkFieldsResult(fields, modelA, modelB) {
    var el = document.getElementById('linkFieldsResult');
    if (!el) return;

    if (!fields || fields.length === 0) {
      el.innerHTML =
        '<div class="alert alert-warning py-2 text-sm mt-2">' +
          '<i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>' +
          '<span>Geen many2one-veld gevonden op <code class="text-xs">' + esc(modelB) + '</code> ' +
          'dat wijst naar <code class="text-xs">' + esc(modelA) + '</code>.' +
          ' Controleer of de Odoo-verbinding actief is.</span>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }

    el.innerHTML =
      '<p class="text-xs font-semibold text-base-content/60 mb-2">Kies het verbindingsveld:</p>' +
      '<div class="flex flex-wrap gap-2">' +
        fields.map(function (f) {
          return '<button type="button"' +
            ' class="btn btn-sm btn-outline hover:btn-primary gap-1.5"' +
            ' data-action="add-model-link"' +
            ' data-model-a="' + esc(modelA) + '"' +
            ' data-model-b="' + esc(modelB) + '"' +
            ' data-field="' + esc(f.name) + '"' +
            ' data-label="' + esc(f.label || f.name) + '">' +
            '<code class="font-mono text-xs">' + esc(f.name) + '</code>' +
            '<span class="text-xs text-base-content/55">' + esc(f.label || '') + '</span>' +
          '</button>';
        }).join('') +
      '</div>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  Object.assign(window.FSV2, {
    renderLinks:            renderLinks,
    renderLinkFieldsResult: renderLinkFieldsResult,
  });

}());
