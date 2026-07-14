/**
 * Mail Signature Designer – Company Directory
 *
 * Single source of truth for the companies a user can attach their
 * signature to. Each entry becomes a clickable logo badge in the compiled
 * signature (see signature-compiler.js) and a checkbox in the settings UI.
 *
 * Keys here are the only valid values inside `selected_companies`
 * (user_signature_settings.selected_companies, a jsonb array of keys).
 * Unknown/stale keys are silently ignored by the merge engine.
 */
export const COMPANY_DIRECTORY = {
  openvme: {
    key: 'openvme',
    name: 'OpenVME',
    url: 'https://openvme.be',
    logoUrl: 'https://forminator-sync.openvme-odoo.workers.dev/assets/logos/openvme.svg'
  },
  syndicoach: {
    key: 'syndicoach',
    name: 'Syndicoach',
    url: 'https://syndicoach.be',
    logoUrl: 'https://forminator-sync.openvme-odoo.workers.dev/assets/logos/syndicoach.svg'
  }
};

export const COMPANY_KEYS = Object.keys(COMPANY_DIRECTORY);

/**
 * Sanitise a raw selected_companies value into a valid, de-duplicated array
 * of known company keys. Falls back to ALL known companies when the input
 * is missing/empty/not an array — this is the "default both" rule.
 *
 * @param {*} raw - value read from the DB / form (expected: array of strings)
 * @returns {string[]}
 */
export function resolveSelectedCompanies(raw) {
  if (Array.isArray(raw)) {
    const filtered = [...new Set(raw)].filter((k) => COMPANY_DIRECTORY[k]);
    if (filtered.length > 0) return filtered;
  }
  return [...COMPANY_KEYS];
}
