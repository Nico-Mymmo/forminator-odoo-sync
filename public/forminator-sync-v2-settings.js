/**
 * Forminator Sync V2 — Settings
 *
 * Renders and manages:
 *   1. Odoo model registry (add / remove custom models, stored in DB)
 *   2. Model link registry  (many2one chain-suggestion links)
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2), forminator-sync-v2-flow-builder.js
 */
(function () {
    'use strict';

    if (!window.FSV2) { console.error('[FSV2] Settings: core niet geladen.'); return; }

    function S() { return window.FSV2.S; }
    function esc(v) { return window.FSV2.esc(v); }

    // icon options available in the add-model form
    var ICON_OPTIONS = [
        { value: 'user', label: 'Contact (user)' },
        { value: 'trending-up', label: 'Lead (trending-up)' },
        { value: 'video', label: 'Webinar (video)' },
        { value: 'box', label: 'Vak (box)' },
        { value: 'briefcase', label: 'Portfolio (briefcase)' },
        { value: 'building-2', label: 'Bedrijf (building-2)' },
        { value: 'shopping-cart', label: 'Order (shopping-cart)' },
        { value: 'calendar', label: 'Agenda (calendar)' },
        { value: 'file-text', label: 'Document (file-text)' },
        { value: 'layers', label: 'Lagen (layers)' },
        { value: 'tag', label: 'Tag (tag)' },
        { value: 'settings', label: 'Instellingen (settings)' },
    ];

    // ───────────────────────────────────────────────────────────────────
    // helpers
    // ───────────────────────────────────────────────────────────────────

    /** Returns display label for a model name, using odooModelsCache first */
    function modelLabel(name) {
        var cache = Array.isArray(S().odooModelsCache) ? S().odooModelsCache : [];
        var found = cache.find(function (m) { return m.name === name; });
        return found ? found.label : name;
    }

    /** Returns icon name for a model */
    function modelIcon(name) {
        var cache = Array.isArray(S().odooModelsCache) ? S().odooModelsCache : [];
        var found = cache.find(function (m) { return m.name === name; });
        return found ? (found.icon || 'box') : 'box';
    }

/** True when the model is a built-in default — kept for reference but no longer blocks deletion */
  function isDefaultModel(_name) { return false; }

    // ───────────────────────────────────────────────────────────────────
    // Section 1 — Odoo model registry
    // ───────────────────────────────────────────────────────────────────
    function _renderModelsSection() {
        var models = Array.isArray(S().odooModelsCache) ? S().odooModelsCache : [];

        var tableHtml;
        if (models.length === 0) {
            tableHtml =
                '<div class="rounded-xl border border-dashed border-base-300 py-8 text-center mb-4">' +
                '<i data-lucide="database" class="w-7 h-7 text-base-content/20 mx-auto mb-2"></i>' +
                '<p class="text-sm text-base-content/50">Geen modellen geconfigureerd.</p>' +
                '</div>';
        } else {
            tableHtml =
                '<div class="overflow-x-auto mb-4 rounded-xl border border-base-200">' +
                '<table class="table table-sm w-full">' +
                '<thead class="bg-base-200/60">' +
                '<tr>' +
                '<th class="text-xs font-medium text-base-content/60 py-2.5 w-6"></th>' +
                '<th class="text-xs font-medium text-base-content/60 py-2.5">Label</th>' +
                '<th class="text-xs font-medium text-base-content/60">Technische naam</th>' +
                '<th></th>' +
                '</tr>' +
                '</thead>' +
                '<tbody>' +
                models.map(function (m, idx) {
                    var isEditing = (S().editingModelIdx === idx);
                    if (isEditing) {
                        var iconOpts = ICON_OPTIONS.map(function (o) {
                            return '<option value="' + esc(o.value) + '"' +
                                (o.value === (m.icon || 'box') ? ' selected' : '') + '>' +
                                esc(o.label) + '</option>';
                        }).join('');
                        var editFields = Array.isArray(S().editingDefaultFields) ? S().editingDefaultFields : (m.default_fields || []);
                        var fieldEditorRows = editFields.length
                          ? editFields.map(function (f, fi) {
                              return '<div class="flex items-center gap-2 py-1 border-b border-base-200 last:border-0">' +
                                '<code class="text-xs font-mono w-32 shrink-0 text-base-content/60">' + esc(f.name) + '</code>' +
                                '<span class="text-xs flex-1">' + esc(f.label || '') + '</span>' +
                                (f.required
                                  ? '<span class="badge badge-xs text-error border border-error/30 bg-error/5">verplicht</span>'
                                  : '<span class="badge badge-xs badge-ghost">optioneel</span>') +
                                '<button type="button" class="btn btn-ghost btn-xs text-error/60 hover:text-error" data-action="remove-default-field" data-idx="' + fi + '"><i data-lucide="x" class="w-3 h-3"></i></button>' +
                              '</div>';
                          }).join('')
                          : '<p class="text-xs text-base-content/40 py-1 italic">Geen velden gedefinieerd.</p>';
                        var fieldsEditorRow =
                          '<tr class="bg-base-200/10">' +
                            '<td colspan="4" class="pb-3 pt-0 px-4">' +
                              '<div class="border border-base-200 rounded-lg p-3">' +
                                '<p class="text-xs font-semibold text-base-content/60 mb-2 flex items-center gap-1.5">' +
                                  '<i data-lucide="list-checks" class="w-3 h-3"></i> Standaard velden (rood = verplicht in Odoo)' +
                                '</p>' +
                                '<div class="mb-2">' + fieldEditorRows + '</div>' +
                                '<div class="flex flex-wrap gap-2 items-end pt-2 border-t border-base-200">' +
                                  '<input id="editNewFieldName" type="text" placeholder="technisch (bijv. name)" class="input input-xs input-bordered font-mono w-36">' +
                                  '<input id="editNewFieldLabel" type="text" placeholder="label (bijv. Naam)" class="input input-xs input-bordered w-28">' +
                                  '<label class="flex items-center gap-1.5 text-xs cursor-pointer">' +
                                    '<input type="checkbox" id="editNewFieldRequired" class="checkbox checkbox-xs">' +
                                    '<span>Verplicht</span>' +
                                  '</label>' +
                                  '<button type="button" class="btn btn-xs btn-outline" data-action="add-default-field">' +
                                    '<i data-lucide="plus" class="w-3 h-3"></i> Veld toevoegen' +
                                  '</button>' +
                                '</div>' +
                              '</div>' +
                            '</td>' +
                          '</tr>';
                        return '<tr class="bg-base-200/40">' +
                            '<td class="pr-0">' +
                            '<i data-lucide="pencil" class="w-4 h-4 text-primary/60"></i>' +
                            '</td>' +
                            '<td>' +
                            '<input id="editModelLabel" type="text" value="' + esc(m.label || '') + '"' +
                            ' class="input input-xs input-bordered w-40" placeholder="Label" />' +
                            '</td>' +
                            '<td>' +
                            '<div class="flex items-center gap-2">' +
                            '<code class="text-xs font-mono text-base-content/50 bg-base-200 px-1.5 py-0.5 rounded">' + esc(m.name) + '</code>' +
                            '<select id="editModelIcon" class="select select-xs select-bordered w-44">' + iconOpts + '</select>' +
                            '</div>' +
                            '</td>' +
                            '<td class="text-right">' +
                            '<div class="flex gap-1 justify-end">' +
                            '<button type="button" class="btn btn-xs btn-primary" data-action="save-odoo-model" data-idx="' + idx + '" data-name="' + esc(m.name) + '">Opslaan</button>' +
                            '<button type="button" class="btn btn-xs btn-ghost" data-action="cancel-edit-model">Annuleer</button>' +
                            '</div>' +
                            '</td>' +
                            '</tr>' +
                            fieldsEditorRow;
                    }
                    var fieldTagsHtml = '';
                    if (Array.isArray(m.default_fields) && m.default_fields.length) {
                        fieldTagsHtml = '<div class="flex flex-wrap gap-1 mt-1.5">' +
                            m.default_fields.map(function (f) {
                                return f.required
                                    ? '<span class="badge badge-xs gap-0.5 text-error border border-error/30 bg-error/5"><i data-lucide="asterisk" class="w-2.5 h-2.5"></i>' + esc(f.label || f.name) + '</span>'
                                    : '<span class="badge badge-xs badge-ghost">' + esc(f.label || f.name) + '</span>';
                            }).join('') + '</div>';
                    }
                    return '<tr class="hover">' +
                        '<td class="pr-0">' +
                        '<i data-lucide="' + esc(m.icon || 'box') + '" class="w-4 h-4 text-base-content/40"></i>' +
                        '</td>' +
                        '<td>' +
                        '<span class="font-medium text-sm">' + esc(m.label || m.name) + '</span>' +
                        fieldTagsHtml +
                        '<td>' +
                        '<code class="text-xs font-mono text-base-content/50 bg-base-200 px-1.5 py-0.5 rounded">' + esc(m.name) + '</code>' +
                        '</td>' +
                        '<td class="text-right">' +
                        '<div class="flex gap-1 justify-end">' +
                        '<button type="button" class="btn btn-ghost btn-xs text-base-content/50 hover:text-primary" data-action="edit-odoo-model" data-idx="' + idx + '" title="Bewerken">' +
                        '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>' +
                        '</button>' +
                        '<button type="button" class="btn btn-ghost btn-xs text-error hover:bg-error/10" data-action="delete-odoo-model" data-idx="' + idx + '" title="Verwijderen">' +
                        '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>' +
                        '</button>' +
                        '</div>' +
                        '</td>' +
                        '</tr>';
                }).join('') +
                '</tbody>' +
                '</table>' +
                '</div>';
        }

        var iconOpts = ICON_OPTIONS.map(function (o) {
            return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
        }).join('');

        var addForm =
            '<div class="rounded-xl border border-base-200 bg-base-50 p-4 flex flex-wrap gap-3 items-end">' +
            '<div class="form-control">' +
            '<label class="label py-0 mb-1"><span class="label-text text-xs font-semibold">Technische naam</span></label>' +
            '<input id="newModelName" type="text" placeholder="bijv. sale.order"' +
            ' class="input input-sm input-bordered font-mono w-52" />' +
            '</div>' +
            '<div class="form-control">' +
            '<label class="label py-0 mb-1"><span class="label-text text-xs font-semibold">Label (weergave)</span></label>' +
            '<input id="newModelLabel" type="text" placeholder="bijv. Verkooporder"' +
            ' class="input input-sm input-bordered w-44" />' +
            '</div>' +
            '<div class="form-control">' +
            '<label class="label py-0 mb-1"><span class="label-text text-xs font-semibold">Icoon</span></label>' +
            '<select id="newModelIcon" class="select select-sm select-bordered w-52">' + iconOpts + '</select>' +
            '</div>' +
            '<button type="button" class="btn btn-sm btn-primary" data-action="add-odoo-model">' +
            '<i data-lucide="plus" class="w-3.5 h-3.5"></i> Model toevoegen' +
            '</button>' +
            '</div>';

        return (
            '<section class="mb-8">' +
            '<div class="flex items-center gap-2 mb-3">' +
            '<i data-lucide="database" class="w-4 h-4 text-secondary"></i>' +
            '<h3 class="font-bold text-sm">Odoo modellen</h3>' +
            '</div>' +
            '<p class="text-xs text-base-content/55 mb-4">' +
            'Definieer welke Odoo-modellen beschikbaar zijn als doelmodel in de synchronisatie-pipelines.' +
            ' Alle modellen worden opgeslagen in de database en kunnen vrij worden toegevoegd of verwijderd.' +
            '</p>' +
            tableHtml +
            addForm +
            '</section>'
        );
    }

    // ───────────────────────────────────────────────────────────────────
    // Section 2 — Model link registry
    // ───────────────────────────────────────────────────────────────────
    function _renderLinksSection() {
        var links = Array.isArray(S().modelLinksCache) ? S().modelLinksCache : [];
        var models = Array.isArray(S().odooModelsCache) ? S().odooModelsCache : [];

        var tableHtml;
        if (links.length === 0) {
            tableHtml =
                '<div class="rounded-xl border border-dashed border-base-300 py-8 text-center mb-4">' +
                '<i data-lucide="link-2" class="w-7 h-7 text-base-content/20 mx-auto mb-2"></i>' +
                '<p class="text-sm text-base-content/50">Nog geen koppelingen gedefinieerd.</p>' +
                '<p class="text-xs text-base-content/40 mt-1">Voeg hieronder een koppeling toe.</p>' +
                '</div>';
        } else {
            tableHtml =
                '<div class="overflow-x-auto mb-4 rounded-xl border border-base-200">' +
                '<table class="table table-sm w-full">' +
                '<thead class="bg-base-200/60">' +
                '<tr>' +
                '<th class="text-xs font-medium text-base-content/60 py-2.5">Van model</th>' +
                '<th class="text-xs font-medium text-base-content/60 w-5"></th>' +
                '<th class="text-xs font-medium text-base-content/60">Naar model</th>' +
                '<th class="text-xs font-medium text-base-content/60">Via veld</th>' +
                '<th></th>' +
                '</tr>' +
                '</thead>' +
                '<tbody>' +
                links.map(function (link, idx) {
                    var isEditing = (S().editingLinkIdx === idx);
                    if (isEditing) {
                        return '<tr class="bg-base-200/40">' +
                            '<td>' +
                            '<div class="flex items-center gap-1.5">' +
                            '<i data-lucide="' + esc(modelIcon(link.model_a)) + '" class="w-3.5 h-3.5 text-base-content/40 shrink-0"></i>' +
                            '<span class="text-sm">' + esc(modelLabel(link.model_a)) + '</span>' +
                            '</div>' +
                            '</td>' +
                            '<td><i data-lucide="arrow-right" class="w-3.5 h-3.5 text-base-content/25"></i></td>' +
                            '<td>' +
                            '<div class="flex items-center gap-1.5">' +
                            '<i data-lucide="' + esc(modelIcon(link.model_b)) + '" class="w-3.5 h-3.5 text-base-content/40 shrink-0"></i>' +
                            '<span class="text-sm">' + esc(modelLabel(link.model_b)) + '</span>' +
                            '</div>' +
                            '</td>' +
                            '<td>' +
                            '<div class="flex items-center gap-2">' +
                            '<code class="text-xs bg-base-200 px-1.5 py-0.5 rounded font-mono">' + esc(link.link_field) + '</code>' +
                            '<input id="editLinkLabel" type="text" value="' + esc(link.link_label || '') + '"' +
                            ' class="input input-xs input-bordered w-36" placeholder="Label (optioneel)" />' +
                            '</div>' +
                            '</td>' +
                            '<td class="text-right">' +
                            '<div class="flex gap-1 justify-end">' +
                            '<button type="button" class="btn btn-xs btn-primary" data-action="save-model-link" data-idx="' + idx + '">Opslaan</button>' +
                            '<button type="button" class="btn btn-xs btn-ghost" data-action="cancel-edit-link">Annuleer</button>' +
                            '</div>' +
                            '</td>' +
                            '</tr>';
                    }
                    return '<tr class="hover">' +
                        '<td>' +
                        '<div class="flex items-center gap-1.5">' +
                        '<i data-lucide="' + esc(modelIcon(link.model_a)) + '" class="w-3.5 h-3.5 text-base-content/40 shrink-0"></i>' +
                        '<span class="text-sm font-medium">' + esc(modelLabel(link.model_a)) + '</span>' +
                        '<code class="text-xs text-base-content/35 font-mono hidden sm:inline">' + esc(link.model_a) + '</code>' +
                        '</div>' +
                        '</td>' +
                        '<td><i data-lucide="arrow-right" class="w-3.5 h-3.5 text-base-content/25"></i></td>' +
                        '<td>' +
                        '<div class="flex items-center gap-1.5">' +
                        '<i data-lucide="' + esc(modelIcon(link.model_b)) + '" class="w-3.5 h-3.5 text-base-content/40 shrink-0"></i>' +
                        '<span class="text-sm font-medium">' + esc(modelLabel(link.model_b)) + '</span>' +
                        '<code class="text-xs text-base-content/35 font-mono hidden sm:inline">' + esc(link.model_b) + '</code>' +
                        '</div>' +
                        '</td>' +
                        '<td>' +
                        '<div class="flex items-center gap-1.5">' +
                        '<code class="text-xs bg-base-200 px-1.5 py-0.5 rounded font-mono">' + esc(link.link_field) + '</code>' +
                        (link.link_label
                            ? '<span class="text-xs text-base-content/45">' + esc(link.link_label) + '</span>'
                            : '') +
                        '</div>' +
                        '</td>' +
                        '<td class="text-right">' +
                        '<div class="flex gap-1 justify-end">' +
                        '<button type="button" class="btn btn-ghost btn-xs text-base-content/50 hover:text-primary" data-action="edit-model-link" data-idx="' + idx + '" title="Bewerken">' +
                        '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>' +
                        '</button>' +
                        '<button type="button" class="btn btn-ghost btn-xs text-error hover:bg-error/10" data-action="delete-model-link" data-idx="' + idx + '" title="Verwijderen">' +
                        '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>' +
                        '</button>' +
                        '</div>' +
                        '</td>' +
                        '</tr>';
                }).join('') +
                '</tbody>' +
                '</table>' +
                '</div>';
        }

        // build model options from live odooModelsCache
        var modelOpts = models.map(function (m) {
            return '<option value="' + esc(m.name) + '">' + esc((m.label || m.name) + ' — ' + m.name) + '</option>';
        }).join('');

        var addFormHtml =
            '<div class="rounded-xl border border-base-200 bg-base-50 p-4">' +
            '<h4 class="font-semibold text-xs mb-2 flex items-center gap-1.5 text-base-content/70">' +
            '<i data-lucide="plus-circle" class="w-3.5 h-3.5 text-primary"></i>' +
            'Nieuwe koppeling ontdekken' +
            '</h4>' +
            '<p class="text-xs text-base-content/50 mb-3">' +
            'Kies twee modellen. De app doorzoekt Odoo naar many2one-velden die de verbinding leggen.' +
            '</p>' +
            '<div class="flex flex-wrap gap-3 items-end">' +
            '<div class="form-control">' +
            '<label class="label py-0 mb-1"><span class="label-text text-xs font-semibold">Stap 1 — model</span></label>' +
            '<select id="linkModelA" class="select select-sm select-bordered min-w-52">' +
            '<option value="">— kies model —</option>' + modelOpts +
            '</select>' +
            '</div>' +
            '<div class="flex items-end pb-1.5">' +
            '<i data-lucide="arrow-right" class="w-4 h-4 text-base-content/30"></i>' +
            '</div>' +
            '<div class="form-control">' +
            '<label class="label py-0 mb-1"><span class="label-text text-xs font-semibold">Stap 2 — model</span></label>' +
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
            '</div>';

        return (
            '<section class="mb-2">' +
            '<div class="flex items-center gap-2 mb-3">' +
            '<i data-lucide="git-merge" class="w-4 h-4 text-secondary"></i>' +
            '<h3 class="font-bold text-sm">Model-koppelingen</h3>' +
            '</div>' +
            '<p class="text-xs text-base-content/55 mb-4">' +
            'Vertel de app via welk many2one-veld twee Odoo-modellen in een pipeline zijn verbonden.' +
            ' De chain-suggestie-engine gebruikt deze registry om automatisch de juiste linking-ID door te sturen.' +
            '</p>' +
            tableHtml +
            addFormHtml +
            '</section>'
        );
    }

    // ───────────────────────────────────────────────────────────────────
    // renderLinks — main entry point, renders both sections
    // ───────────────────────────────────────────────────────────────────
    function renderLinks() {
        var el = document.getElementById('linksList');
        if (!el) return;
        el.innerHTML = _renderModelsSection() + '<div class="divider my-2"></div>' + _renderLinksSection();
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
                'dat wijst naar <code class="text-xs">' + esc(modelA) + '</code>. ' +
                'Controleer of de Odoo-verbinding actief is.</span>' +
                '</div>';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        el.innerHTML =
            '<p class="text-xs font-semibold text-base-content/60 mb-2">' +
            'Kies het verbindingsveld (' + fields.length + ' gevonden):' +
            '</p>' +
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
                    (f.label ? '<span class="text-xs text-base-content/55">' + esc(f.label) + '</span>' : '') +
                    '</button>';
            }).join('') +
            '</div>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    Object.assign(window.FSV2, {
        renderLinks: renderLinks,
        renderLinkFieldsResult: renderLinkFieldsResult,
    });

}());