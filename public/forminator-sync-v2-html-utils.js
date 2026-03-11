/*
 * Generated from src/modules/forminator-sync-v2/html-utils.js
 * Do not edit independently.
 * If the logic changes, update BOTH files simultaneously.
 */
(function () {
  var SYSTEM_KEYS = ['form_id', 'form_uid', 'ovme_forminator_id', 'nonce'];

  /**
   * Generates an Odoo-compatible HTML table from form field values.
   *
   * @param {string[] | null} fieldIds
   *   null        → include all non-system fields from normalizedForm
   *   string[]    → include only the specified field IDs (empty values omitted)
   *
   * @param {Object} normalizedForm  Normalised key-value map of submitted form fields.
   *
   * @returns {string} HTML string with inline CSS, or '' when there are no rows.
   */
  function buildHtmlFormSummary(fieldIds, normalizedForm, labelMap) {
    var entries;
    if (fieldIds === null) {
      entries = Object.entries(normalizedForm).filter(function (kv) {
        return !SYSTEM_KEYS.includes(kv[0]) && !kv[0].includes('.');
      });
    } else {
      entries = fieldIds
        .map(function (k) { return [k, normalizedForm[k] != null ? normalizedForm[k] : null]; })
        .filter(function (kv) { return kv[1] !== null && kv[1] !== undefined && kv[1] !== ''; });
    }

    if (!entries.length) return '';

    var rows = entries.map(function (kv) {
      var key   = kv[0];
      var value = kv[1];
      var label = (labelMap && labelMap[key])
        || key
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); })
            .replace(/\s+\d+$/, '');
      var safe = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return '<tr>'
        + '<td style="padding-bottom:12px">'
        + '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6c757d;margin-bottom:3px">' + label + '</div>'
        + '<div style="border:1px solid #dee2e6;border-radius:6px;padding:8px 12px;background:#fff;color:#212529;font-size:14px">' + safe + '</div>'
        + '</td>'
        + '</tr>';
    }).join('');

    return '<div style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Oxygen,Ubuntu,sans-serif;font-size:14px;color:#212529;border:1px solid #dee2e6;border-radius:8px;padding:16px;background:#f8f9fa">'
      + '<table style="width:100%;border-collapse:collapse">'
      + '<tbody>' + rows + '</tbody>'
      + '</table>'
      + '</div>';
  }

  window.FSV2 = window.FSV2 || {};
  window.FSV2.buildHtmlFormSummary = buildHtmlFormSummary;
}());
