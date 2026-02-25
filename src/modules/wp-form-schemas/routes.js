/**
 * wp-form-schemas — routes
 *
 * POST   /wp-sites                  → site aanmaken
 * GET    /wp-sites                  → sites oplijsten
 * POST   /wp-sites/:id/sync         → formulieren syncen vanuit WP
 * GET    /wp-sites/:id/forms        → gesyncte formulieren ophalen
 * GET    /wp-sites/:id/forms/:formId → flattened schema van één formulier
 */

import {
  listSites,
  getSiteById,
  createSite,
  deleteSite,
  listFormsBySite,
  getFormSchema
} from './database.js';
import { syncSiteForms } from './service.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorStatus(err) {
  const msg = String(err?.message ?? '').toLowerCase();
  if (msg.includes('niet gevonden') || msg.includes('not found')) return 404;
  if (msg.includes('401') || msg.includes('toegang'))             return 502;
  if (msg.includes('404') || msg.includes('endpoint niet'))       return 502;
  if (msg.includes('onbereikbaar') || msg.includes('network'))    return 502;
  if (msg.includes('verplicht') || msg.includes('required'))      return 400;
  return 500;
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

/**
 * Haal site op en blokkeer als inactief.
 * Gooit expliciet Error met leesbare boodschap.
 */
async function requireActiveSite(env, siteId) {
  const site = await getSiteById(env, siteId);
  if (!site) {
    const err = new Error(`Site niet gevonden: ${siteId}`);
    err.status = 404;
    throw err;
  }
  if (!site.is_active) {
    const err = new Error(`Site "${site.name}" is inactief en kan niet gesynchroniseerd worden`);
    err.status = 400;
    throw err;
  }
  return site;
}

export const routes = {

  // ── GET /wp-sites ─────────────────────────────────────────────────────────
  'GET /': async (context) => {
    try {
      const sites = await listSites(context.env);
      return json({ success: true, data: sites });
    } catch (err) {
      return json({ success: false, error: err.message }, errorStatus(err));
    }
  },

  // ── POST /wp-sites ────────────────────────────────────────────────────────
  'POST /': async (context) => {
    try {
      const body = await readBody(context.request);

      const missing = ['name', 'base_url', 'api_secret'].filter(k => !body[k]);
      if (missing.length) {
        return json({ success: false, error: `Verplichte velden ontbreken: ${missing.join(', ')}` }, 400);
      }

      const created = await createSite(context.env, body);
      return json({ success: true, data: created }, 201);
    } catch (err) {
      return json({ success: false, error: err.message }, errorStatus(err));
    }
  },

  // ── DELETE /wp-sites/:id ──────────────────────────────────────────────────
  'DELETE /:id': async (context) => {
    try {
      const site = await getSiteById(context.env, context.params?.id);
      if (!site) return json({ success: false, error: 'Site niet gevonden' }, 404);

      await deleteSite(context.env, context.params.id);
      return json({ success: true });
    } catch (err) {
      return json({ success: false, error: err.message }, errorStatus(err));
    }
  },

  // ── POST /wp-sites/:id/sync ───────────────────────────────────────────────
  'POST /:id/sync': async (context) => {
    try {
      const site = await requireActiveSite(context.env, context.params?.id);
      const result = await syncSiteForms(context.env, site);

      return json({
        success: true,
        data: {
          synced: result.synced,
          forms:  result.forms,
          ...(result.errors.length > 0 ? { partial_errors: result.errors } : {})
        }
      });
    } catch (err) {
      return json({ success: false, error: err.message }, err.status ?? errorStatus(err));
    }
  },

  // ── GET /wp-sites/:id/forms ───────────────────────────────────────────────
  'GET /:id/forms': async (context) => {
    try {
      const site = await getSiteById(context.env, context.params?.id);
      if (!site) return json({ success: false, error: 'Site niet gevonden' }, 404);

      const forms = await listFormsBySite(context.env, site.id);
      return json({ success: true, data: forms });
    } catch (err) {
      return json({ success: false, error: err.message }, errorStatus(err));
    }
  },

  // ── GET /wp-sites/:id/forms/:formId ──────────────────────────────────────
  'GET /:id/forms/:formId': async (context) => {
    try {
      const site = await getSiteById(context.env, context.params?.id);
      if (!site) return json({ success: false, error: 'Site niet gevonden' }, 404);

      const schema = await getFormSchema(context.env, site.id, context.params?.formId);
      if (!schema) return json({ success: false, error: 'Formulier niet gevonden' }, 404);

      return json({
        success: true,
        data: {
          form_id:          schema.form_id,
          form_name:        schema.form_name,
          last_synced_at:   schema.last_synced_at,
          flattened_schema: schema.flattened_schema,
          raw_schema:       schema.raw_schema
        }
      });
    } catch (err) {
      return json({ success: false, error: err.message }, errorStatus(err));
    }
  }
};
