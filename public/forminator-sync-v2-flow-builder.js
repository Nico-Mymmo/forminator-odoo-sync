/**
 * Forminator Sync V2 — FlowBuilder (shared component)
 *
 * Renders a compact visual pipeline flow: model-chip → arrow → model-chip.
 * Used by: list cards, detail header, wizard summary.
 *
 * Dependencies: forminator-sync-v2-core.js (FSV2.esc)
 */
(function () {
  'use strict';

  if (!window.FSV2) { console.error('[FSV2] FlowBuilder: core niet geladen.'); return; }

  function esc(v) { return window.FSV2.esc(v); }

  var MODEL_ICONS = {
    'res.partner':            'user',
    'crm.lead':               'trending-up',
    'x_webinarregistrations': 'video',
  };

  var MODEL_COLORS = {
    'res.partner':            'text-info',
    'crm.lead':               'text-success',
    'x_webinarregistrations': 'text-warning',
  };

  var MODEL_LABELS = {
    'res.partner':            'Contact',
    'crm.lead':               'Lead',
    'x_webinarregistrations': 'Webinaar',
  };

  /**
   * Renders a horizontal pipeline flow.
   *
   * @param {Array<{model:string, label?:string}>} steps
   *   model  - Odoo model technical name
   *   label  - optional human label / name override
   * @param {object} [opts]
   *   size:       'sm' (default) | 'md'
   *   showLabels: show step label next to model chip (default true)
   * @returns {string} HTML string (no surrounding wrapper needed)
   */
  function renderFlowPreview(steps, opts) {
    opts = opts || {};
    var size       = opts.size || 'sm';
    var iconCls    = size === 'md' ? 'w-4 h-4'   : 'w-3.5 h-3.5';
    var textCls    = size === 'md' ? 'text-sm font-semibold' : 'text-xs font-medium';
    var padCls     = size === 'md' ? 'px-2.5 py-1.5' : 'px-2 py-1';

    if (!steps || !steps.length) return '';

    return '<div class="flex items-center gap-1 flex-wrap">' +
      steps.map(function (step, i) {
        var model = step.model || step.odoo_model || '';
        var icon  = MODEL_ICONS[model]  || 'box';
        var color = MODEL_COLORS[model] || 'text-base-content/60';
        var lbl   = MODEL_LABELS[model] || model;
        var name  = (opts.showLabels !== false) ? (step.label || step.name || '') : '';

        return (i > 0
          ? '<i data-lucide="chevron-right" class="w-3 h-3 text-base-content/25 shrink-0"></i>'
          : '') +
          '<div class="flex items-center gap-1 bg-base-200/80 rounded-md ' + padCls + '">' +
            '<i data-lucide="' + esc(icon) + '" class="' + iconCls + ' ' + esc(color) + ' shrink-0"></i>' +
            '<span class="' + esc(textCls) + '">' + esc(lbl) + '</span>' +
            (name ? '<span class="text-xs text-base-content/40 ml-0.5 hidden sm:inline truncate max-w-20">' + esc(name) + '</span>' : '') +
          '</div>';
      }).join('') +
    '</div>';
  }

  Object.assign(window.FSV2, {
    renderFlowPreview: renderFlowPreview,
    FLOW_MODEL_LABELS: MODEL_LABELS,
    FLOW_MODEL_ICONS:  MODEL_ICONS,
  });

}());
