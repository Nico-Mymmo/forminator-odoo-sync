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
 * Forminator-/WordPress-plumbing die in ELKE webhook-payload meekomt maar
 * geen formulierantwoord is: het reCAPTCHA-token, browser-/verwijsherkomst,
 * WP-achtige hidden fields (`_wp_http_referer`, `_forminator_user_ip`) en
 * Forminator's eigen renderingmetadata (page/render-id, form-type/-title).
 * 2026-09: bleek dat dit soort velden bij een "alle velden"-notitie
 * (fieldIds === null) toch werd meegestuurd naar de Odoo-chatter, inclusief
 * het volledige reCAPTCHA-token — terwijl de gebruiker deze velden NERGENS
 * kan uitvinken: ze zitten niet in Forminator's eigen `form_fields`-schema en
 * verschijnen dus ook niet in de veld-checklist van de notitiestap. Onzichtbaar
 * en niet-configureerbaar mag ook niet doorgestuurd worden.
 * `canonicalKey()` normaliseert spelling (koppelteken/underscore, hoofdletters,
 * een voorloop-underscore zoals WordPress' eigen `_wp_http_referer`) zodat de
 * vergelijking niet op exacte schrijfwijze struikelt.
 */
const TECHNICAL_KEYS = new Set([
  'g_recaptcha_response', 'h_captcha_response', 'cf_turnstile_response',
  'hidden', 'referer_url', 'wp_http_referer', 'page_id', 'form_type',
  'current_url', 'render_id', 'forminator_user_ip', 'form_title', 'entry_time'
]);

function canonicalKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/^_+/, '')
    .replace(/[-\s]+/g, '_');
}

/**
 * Generates an Odoo-compatible HTML table from form field values.
 *
 * @param {string[] | null} fieldIds
 *   null        → include all non-system, non-technical fields from normalizedForm
 *                 (zie TECHNICAL_KEYS hierboven)
 *   string[]    → include only the specified field IDs (empty values omitted).
 *                 Een EXPLICIETE selectie wordt nooit tegen TECHNICAL_KEYS
 *                 gefilterd — wie zelf zo'n veld-ID kiest, kiest bewust.
 *
 * @param {Object} normalizedForm  Normalised key-value map of submitted form fields.
 * @param {Object|null} [labelMap]  Optional map of fieldId → display label.
 *                                  When provided, labels are used directly instead of
 *                                  being derived from the key name.
 * @param {Object|null} [widthMap]  Optional map of fieldId → 'full'|'half'.
 *                                  When widthMap is a present object, width is fully explicit:
 *                                  a missing key defaults to 'half' (paired), never to a
 *                                  heuristic. The LONG_VALUE_THRESHOLD length heuristic is used
 *                                  only when widthMap itself is undefined/null (legacy templates
 *                                  saved before this feature existed).
 *
 * @returns {string} HTML string with inline CSS, or '' when there are no rows.
 */
export function buildHtmlFormSummary(fieldIds, normalizedForm, labelMap, widthMap) {
  const entries = fieldIds === null
    ? Object.entries(normalizedForm).filter(
        ([k]) => !SYSTEM_KEYS.includes(k) && !k.includes('.') && !TECHNICAL_KEYS.has(canonicalKey(k))
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
    // Once a widthMap object is present at all, width is 100% explicit and
    // deterministic: a present-but-missing key defaults to 'half' (paired),
    // never to the length heuristic below. The heuristic is legacy-only --
    // it applies solely when widthMap itself is absent (undefined/null),
    // i.e. a saved template from before this feature existed.
    const isLong = widthMap == null
      ? raw.length > LONG_VALUE_THRESHOLD
      : widthMap[key] === 'full';
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
        rows += '<tr><td style="padding-bottom:12px;vertical-align:top" colspan="2">' + pending + '</td></tr>';
        pending = null;
      }
      rows += '<tr><td style="padding-bottom:12px;vertical-align:top" colspan="2">' + cell.html + '</td></tr>';
    } else if (pending) {
      rows += '<tr>'
        + '<td style="padding-bottom:12px;padding-right:6px;width:50%;vertical-align:top">' + pending + '</td>'
        + '<td style="padding-bottom:12px;width:50%;vertical-align:top">' + cell.html + '</td>'
        + '</tr>';
      pending = null;
    } else {
      pending = cell.html;
    }
  }
  if (pending) {
    rows += '<tr><td style="padding-bottom:12px;vertical-align:top" colspan="2">' + pending + '</td></tr>';
  }

  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Oxygen,Ubuntu,sans-serif;font-size:14px;color:#212529;border:1px solid #dee2e6;border-radius:8px;padding:16px;background:#f8f9fa">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>';
}
