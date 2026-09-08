/**
 * html-utils.js — Worker (ESM) — source of truth for buildHtmlFormSummary.
 *
 * Drift-preventie (Addendum F correctie F):
 * This file is the SINGLE SOURCE OF TRUTH.
 * public/forminator-sync-v2-html-utils.js is the browser IIFE twin.
 * When the logic changes, update BOTH files simultaneously in the same commit.
 * Diff-check before every merge.
 */

const SYSTEM_KEYS = ['form_id', 'form_uid', 'ovme_forminator_id', 'nonce'];

/**
 * Generates an Odoo-compatible HTML table from form field values.
 *
 * @param {string[] | null} fieldIds
 *   null        → include all non-system fields from normalizedForm
 *   string[]    → include only the specified field IDs (empty values omitted)
 *
 * @param {Object} normalizedForm  Normalised key-value map of submitted form fields.
 * @param {Object|null} [labelMap]  Optional map of fieldId → display label.
 *                                  When provided, labels are used directly instead of
 *                                  being derived from the key name.
 * @param {Object|null} [widthMap]  Optional map of fieldId → 'full'|'half'.
 *                                  Explicit override of column width per field. When a
 *                                  field has no entry, falls back to the LONG_VALUE_THRESHOLD
 *                                  heuristic (length-based) for backward compatibility.
 *
 * @returns {string} HTML string with inline CSS, or '' when there are no rows.
 */
export function buildHtmlFormSummary(fieldIds, normalizedForm, labelMap, widthMap) {
  const entries = fieldIds === null
    ? Object.entries(normalizedForm).filter(
        ([k]) => !SYSTEM_KEYS.includes(k) && !k.includes('.')
      )
    : fieldIds
        .map(k => [k, normalizedForm[k] ?? null])
        .filter(([, v]) => v !== null && v !== undefined && v !== '');

  if (!entries.length) return '';

  const LONG_VALUE_THRESHOLD = 40;

  const cells = entries.map(([key, value]) => {
    const label = (labelMap && labelMap[key])
      || key
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
          .replace(/\s+\d+$/, '');
    const raw = String(value);
    const safe = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const forced = widthMap && Object.prototype.hasOwnProperty.call(widthMap, key)
      ? widthMap[key]
      : null;
    const isLong = forced === 'full'
      ? true
      : forced === 'half'
        ? false
        : raw.length > LONG_VALUE_THRESHOLD;
    return {
      isLong: isLong,
      html: '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6c757d;margin-bottom:3px">' + label + '</div>'
        + '<div style="border:1px solid #dee2e6;border-radius:6px;padding:8px 12px;background:#fff;color:#212529;font-size:14px">' + safe + '</div>'
    };
  });

  // Two short fields side by side per row; a long field (or an unpaired
  // leftover short field) gets its own full-width row instead.
  let rows = '';
  let pending = null;
  for (const cell of cells) {
    if (cell.isLong) {
      if (pending) {
        rows += '<tr><td style="padding-bottom:12px" colspan="2">' + pending + '</td></tr>';
        pending = null;
      }
      rows += '<tr><td style="padding-bottom:12px" colspan="2">' + cell.html + '</td></tr>';
    } else if (pending) {
      rows += '<tr>'
        + '<td style="padding-bottom:12px;padding-right:6px;width:50%">' + pending + '</td>'
        + '<td style="padding-bottom:12px;width:50%">' + cell.html + '</td>'
        + '</tr>';
      pending = null;
    } else {
      pending = cell.html;
    }
  }
  if (pending) {
    rows += '<tr><td style="padding-bottom:12px" colspan="2">' + pending + '</td></tr>';
  }

  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Oxygen,Ubuntu,sans-serif;font-size:14px;color:#212529;border:1px solid #dee2e6;border-radius:8px;padding:16px;background:#f8f9fa">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>';
}
