/**
 * wp-form-schemas — database layer
 *
 * Volledig los van events-operations, forminator-sync, en bestaande wp-client.
 * Leest/schrijft alleen wp_sites en wp_form_schemas.
 */

import { createClient } from '@supabase/supabase-js';

const T = {
  sites:   'wp_sites',
  schemas: 'wp_form_schemas'
};

function db(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// wp_sites
// ─────────────────────────────────────────────────────────────────────────────

export async function listSites(env) {
  const { data, error } = await db(env)
    .from(T.sites)
    .select('id, name, base_url, is_active, created_at')
    .order('name', { ascending: true });

  if (error) throw new Error(`listSites: ${error.message}`);
  return data ?? [];
}

export async function getSiteById(env, id) {
  const { data, error } = await db(env)
    .from(T.sites)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`getSiteById: ${error.message}`);
  return data ?? null;
}

export async function createSite(env, payload) {
  const { data, error } = await db(env)
    .from(T.sites)
    .insert({
      name:       payload.name,
      base_url:   payload.base_url.replace(/\/$/, ''),
      api_secret: payload.api_secret,
      is_active:  payload.is_active !== false
    })
    .select('id, name, base_url, is_active, created_at')
    .single();

  if (error) throw new Error(`createSite: ${error.message}`);
  return data;
}

export async function deleteSite(env, id) {
  const { error } = await db(env)
    .from(T.sites)
    .delete()
    .eq('id', id);

  if (error) throw new Error(`deleteSite: ${error.message}`);
  return { deleted: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// wp_form_schemas
// ─────────────────────────────────────────────────────────────────────────────

export async function listFormsBySite(env, siteId) {
  const { data, error } = await db(env)
    .from(T.schemas)
    .select('id, site_id, form_id, form_name, last_synced_at, created_at')
    .eq('site_id', siteId)
    .order('form_name', { ascending: true });

  if (error) throw new Error(`listFormsBySite: ${error.message}`);
  return data ?? [];
}

export async function getFormSchema(env, siteId, formId) {
  const { data, error } = await db(env)
    .from(T.schemas)
    .select('*')
    .eq('site_id', siteId)
    .eq('form_id', formId)
    .maybeSingle();

  if (error) throw new Error(`getFormSchema: ${error.message}`);
  return data ?? null;
}

/**
 * Upsert a single form schema (insert or update on conflict site_id+form_id).
 */
export async function upsertFormSchema(env, siteId, formId, formName, rawSchema, flattenedSchema) {
  const now = new Date().toISOString();

  const { data, error } = await db(env)
    .from(T.schemas)
    .upsert(
      {
        site_id:          siteId,
        form_id:          formId,
        form_name:        formName,
        raw_schema:       rawSchema,
        flattened_schema: flattenedSchema,
        last_synced_at:   now
      },
      { onConflict: 'site_id,form_id' }
    )
    .select('id, form_id, form_name, last_synced_at')
    .single();

  if (error) throw new Error(`upsertFormSchema (form ${formId}): ${error.message}`);
  return data;
}
