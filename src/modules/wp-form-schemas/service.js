/**
 * wp-form-schemas — WordPressFormsService
 *
 * Volledig autonoom. Gebruikt NIET de bestaande wp-client of events-operations.
 *
 * WP-authenticatie: X-OPENVME-SECRET header via centrale helper in lib/wordpress.js.
 * Endpoint:         GET {base_url}/wp-json/openvme/v1/forminator/forms
 */

import { fetchOpenVmeForminatorForms } from '../../lib/wordpress.js';
import { flattenFields } from './flattening.js';
import { upsertFormSchema } from './database.js';

/**
 * Haal Forminator formulieren live op van één WP-site.
 * Wrapper rond de centrale helper; site.api_secret wordt als X-OPENVME-SECRET gebruikt.
 *
 * @param {Object} site - wp_sites record { id, base_url, api_secret }
 * @returns {Promise<Array>}
 */
export async function fetchFormsFromSite(site) {
  return fetchOpenVmeForminatorForms({ baseUrl: site.base_url, secret: site.api_secret });
}

/**
 * Sync alle formulieren van één site naar de database.
 *
 * Per formulier:
 *   1. Flattening uitvoeren
 *   2. Raw schema + flattened schema opslaan (upsert)
 *
 * @param {Object} env     - Cloudflare env (Supabase config)
 * @param {Object} site    - wp_sites record { id, base_url, api_secret }
 * @returns {Promise<{synced: number, forms: Array}>}
 */
export async function syncSiteForms(env, site) {
  const rawForms = await fetchFormsFromSite(site);

  const results = [];
  const errors  = [];

  for (const form of rawForms) {
    const formId   = String(form.form_id);
    const formName = String(form.form_name ?? formId);

    let flattened;
    try {
      flattened = flattenFields(form.fields ?? []);
    } catch (flatErr) {
      errors.push({ form_id: formId, error: flatErr.message });
      continue;
    }

    try {
      const saved = await upsertFormSchema(
        env,
        site.id,
        formId,
        formName,
        form.fields ?? [],
        flattened
      );
      results.push(saved);
    } catch (dbErr) {
      errors.push({ form_id: formId, error: dbErr.message });
    }
  }

  if (errors.length > 0 && results.length === 0) {
    throw new Error(
      `Sync mislukt voor alle formulieren: ${errors.map(e => `${e.form_id}: ${e.error}`).join('; ')}`
    );
  }

  return {
    synced: results.length,
    forms:  results,
    errors
  };
}
