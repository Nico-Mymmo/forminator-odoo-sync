import {
  createIntegration,
  updateIntegration,
  getIntegrationBundle,
  hasSuccessfulTestSubmission,
  listIntegrations,
  getIntegrationById,
  deleteIntegration
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

  return createIntegration(env, {
    name: payload.name.trim(),
    forminator_form_id: String(payload.forminator_form_id).trim(),
    odoo_connection_id: String(payload.odoo_connection_id).trim(),
    site_key: payload.site_key || null,
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

  if (payload.is_active === true) {
    const bundle = await getIntegrationBundle(env, integrationId);
    const successfulTest = await hasSuccessfulTestSubmission(env, integrationId);
    validateActivationReadiness(bundle, successfulTest);
    updates.is_active = true;
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
