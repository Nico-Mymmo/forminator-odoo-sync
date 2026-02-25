/**
 * wp-form-schemas — WordPressFormsService
 *
 * Volledig autonoom. Gebruikt NIET de bestaande wp-client, events-operations
 * constants of bestaande WordPress verbindingen.
 *
 * Authenticatie: X-API-SECRET header (niet Basic Auth).
 * Endpoint:      GET {base_url}/wp-json/openvme/v2/forminator/forms
 */

import { flattenFields } from './flattening.js';
import { upsertFormSchema } from './database.js';

/** Endpoint path op de WP-site */
const WP_FORMS_PATH = '/wp-json/openvme/v2/forminator/forms';

/**
 * Haal Forminator formulieren live op van één WP-site.
 *
 * @param {string} baseUrl    - bijv. "https://openvme.be"  (trailing slash gestript)
 * @param {string} apiSecret  - waarde van de X-API-SECRET header
 * @returns {Promise<Array>}  - raw forms array van WP
 * @throws {Error}            - bij netwerk-, auth- of parsefouten
 */
export async function fetchFormsFromSite(baseUrl, apiSecret) {
  const url = `${baseUrl}${WP_FORMS_PATH}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'X-API-SECRET': apiSecret,
        'Accept':       'application/json'
      }
    });
  } catch (networkErr) {
    throw new Error(`WP onbereikbaar (${baseUrl}): ${networkErr.message}`);
  }

  if (response.status === 401) {
    throw new Error(`WP weigerde toegang (401) voor ${baseUrl} — controleer api_secret`);
  }

  if (response.status === 404) {
    throw new Error(
      `WP endpoint niet gevonden (404): ${url} — ` +
      `installeer de openvme/v2 plugin op de WP-site`
    );
  }

  if (!response.ok) {
    throw new Error(`WP API fout ${response.status} bij ${url}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Ongeldige JSON ontvangen van ${url}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`Verwachtte array van formulieren van ${url}, maar kreeg: ${typeof data}`);
  }

  return data;
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
  const rawForms = await fetchFormsFromSite(site.base_url, site.api_secret);

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
