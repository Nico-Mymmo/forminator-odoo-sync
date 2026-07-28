import {
  createIntegration,
  updateIntegration,
  getIntegrationBundle,
  hasSuccessfulTestSubmission,
  listIntegrations,
  getIntegrationById,
  deleteIntegration,
  createTrackerIntegration
} from '../database.js';
import {
  validateIntegrationCreatePayload,
  validateIntegrationUpdatePayload,
  validateActivationReadiness
} from '../validation.js';

export async function listIntegrationSummaries(env) {
  return listIntegrations(env);
}

export async function createIntegrationRecord(env, payload) {
  validateIntegrationCreatePayload(payload);

  // Tracker integrations (trackable short link / QR code) have their own dedicated
  // creation path — they generate a unique tracker_slug and never touch Odoo/Forminator.
  if (payload.source_type === 'tracker') {
    return createTrackerIntegration(env, {
      name: payload.name.trim(),
      destination_url: String(payload.destination_url).trim()
    });
  }

  const sourceType = payload.source_type || 'forminator';

  return createIntegration(env, {
    name: payload.name.trim(),
    forminator_form_id: String(payload.forminator_form_id || '').trim(),
    odoo_connection_id: String(payload.odoo_connection_id).trim(),
    site_key: payload.site_key || null,
    source_type: sourceType,
    webhook_token: payload.webhook_token || null,
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

export async function getIntegrationDetails(env, integrationId) {
  return getIntegrationBundle(env, integrationId);
}

export async function updateIntegrationRecord(env, integrationId, payload) {
  validateIntegrationUpdatePayload(payload);

  const existing = await getIntegrationById(env, integrationId);
  if (!existing) {
    const error = new Error('Integration not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const updates = {
    updated_at: new Date().toISOString()
  };

  if (payload.name !== undefined) updates.name = String(payload.name).trim();
  if (payload.forminator_form_id !== undefined) updates.forminator_form_id = String(payload.forminator_form_id).trim();
  if (payload.odoo_connection_id !== undefined) updates.odoo_connection_id = String(payload.odoo_connection_id).trim();
  if (payload.site_key !== undefined) updates.site_key = payload.site_key || null;

  // Tracker QR-styling (dot/achtergrondkleur) — persisted server-side zodat elke
  // gebruiker dezelfde QR-weergave ziet (zie 20260728130000_fsv2_tracker_qr_style.sql).
  // Het logo zelf loopt via de aparte tracker-logo-routes (R2), niet via deze payload.
  const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  if (payload.qr_dot_color !== undefined) {
    if (payload.qr_dot_color !== null && !HEX_COLOR_RE.test(String(payload.qr_dot_color))) {
      const error = new Error('qr_dot_color must be a hex color like #000000');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    updates.qr_dot_color = payload.qr_dot_color || null;
  }
  if (payload.qr_bg_color !== undefined) {
    if (payload.qr_bg_color !== null && !HEX_COLOR_RE.test(String(payload.qr_bg_color))) {
      const error = new Error('qr_bg_color must be a hex color like #ffffff');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    updates.qr_bg_color = payload.qr_bg_color || null;
  }

  if (payload.is_active === true) {
    // Trackers never have resolvers/targets (they don't write to Odoo), so the
    // normal "at least one schrijfdoel" activation-readiness check doesn't apply.
    if (existing.source_type === 'tracker') {
      updates.is_active = true;
    } else {
      const bundle = await getIntegrationBundle(env, integrationId);
      const successfulTest = await hasSuccessfulTestSubmission(env, integrationId);
      validateActivationReadiness(bundle, successfulTest);
      updates.is_active = true;
    }
  } else if (payload.is_active === false) {
    updates.is_active = false;
  }

  return updateIntegration(env, integrationId, updates);
}

export async function deleteIntegrationRecord(env, integrationId) {
  const existing = await getIntegrationById(env, integrationId);
  if (!existing) {
    const error = new Error('Integration not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  await deleteIntegration(env, integrationId);
  return { success: true };
}
