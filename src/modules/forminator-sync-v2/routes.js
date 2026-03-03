import { executeKw } from '../../lib/odoo.js';
import {
  listIntegrationSummaries,
  createIntegrationRecord,
  getIntegrationDetails,
  updateIntegrationRecord,
  deleteIntegrationRecord
} from './services/integration-service.js';
import {
  listResolversByIntegration,
  createResolver,
  updateResolver,
  deleteResolver,
  listTargetsByIntegration,
  getTargetById,
  getMappingById,
  createTarget,
  updateTarget,
  deleteTarget,
  createMapping,
  updateMapping,
  deleteMapping,
  deleteMappingsByTarget,
  listMappingsByTarget,
  createSubmission,
  hasSuccessfulTestSubmission,
  listSubmissionsByIntegration,
  getSubmissionById,
  listSubmissionTargetResults,
  listWpConnections,
  getWpConnectionById,
  createWpConnection,
  deleteWpConnection,
  getModelDefaults,
  upsertModelDefaults,
} from './database.js';
import { fetchOpenVmeForminatorForms, fetchForminatorFormsBasicAuth } from '../../lib/wordpress.js';
import {
  getMvpConstants,
  validateResolverPayload,
  validateTargetPayload,
  validateMappingPayload,
  validateRequiredMappingsForTarget
} from './validation.js';
import { forminatorSyncV2UI } from './ui.js';
import { handleForminatorV2Webhook, processDueRetries, replaySubmission } from './worker-handler.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function parseErrorStatus(error) {
  if (error?.code === 'NOT_FOUND') return 404;
  if (error?.code === 'VALIDATION_ERROR') return 400;
  if (error?.code === 'CHAIN_REFERENCE_ERROR') return 422;
  if (error?.code === 'CONFLICT') return 409;

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not found')) return 404;
  if (message.includes('required') || message.includes('invalid') || message.includes('blocked') || message.includes('maximum') || message.includes('cannot')) return 400;

  return 500;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function assertIntegrationSelected(integrationId) {
  if (!integrationId) {
    const error = new Error('Integration id is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

async function enforceMvpLimitsOnResolvers(env, integrationId) {
  const resolvers = await listResolversByIntegration(env, integrationId);
  if (resolvers.length >= 2) {
    const error = new Error('MVP allows maximum two herkenningen per integratie');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

async function enforceMvpLimitsOnTargets(env, integrationId) {
  const targets = await listTargetsByIntegration(env, integrationId);
  if (targets.length >= 2) {
    const error = new Error('MVP allows maximum two schrijfdoelen per integratie');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

async function enforceNoDuplicateResolverType(env, integrationId, resolverType, currentResolverId = null) {
  const resolvers = await listResolversByIntegration(env, integrationId);
  const duplicate = resolvers.find((row) => row.resolver_type === resolverType && row.id !== currentResolverId);
  if (duplicate) {
    const error = new Error('Duplicate resolver type is not allowed in MVP');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

async function enforceRequiredMappingsForTarget(env, targetId, targetModel) {
  const mappings = await listMappingsByTarget(env, targetId);
  validateRequiredMappingsForTarget({ odoo_model: targetModel }, mappings);
}

async function enforceChainReferenceOrder(env, targetId, sourceValue) {
  // Validate that a previous_step_output reference points to a step with lower execution_order.
  const currentTarget = await getTargetById(env, targetId);
  if (!currentTarget) return; // let existing NOT_FOUND handling deal with missing target

  const allTargets = await listTargetsByIntegration(env, currentTarget.integration_id);

  // source_value must be 'step.<order_or_label>.record_id'
  const match = String(sourceValue || '').match(/^step\.([^.]+)\.record_id$/);
  if (!match) {
    const error = new Error('previous_step_output bronwaarde moet de vorm "step.<stap_of_label>.record_id" hebben');
    error.code = 'CHAIN_REFERENCE_ERROR';
    throw error;
  }

  const ref = match[1];
  const refAsNumber = Number(ref);

  const referencedTarget = isNaN(refAsNumber)
    ? allTargets.find((t) => t.label === ref)
    : allTargets.find((t) => (t.execution_order ?? t.order_index ?? 0) === refAsNumber);

  if (!referencedTarget) {
    const error = new Error(`Vorige stap "${ref}" niet gevonden in deze integratie`);
    error.code = 'CHAIN_REFERENCE_ERROR';
    throw error;
  }

  const currentOrder    = currentTarget.execution_order    ?? currentTarget.order_index    ?? 0;
  const referencedOrder = referencedTarget.execution_order ?? referencedTarget.order_index ?? 0;

  if (referencedOrder >= currentOrder) {
    const error = new Error(
      `Stap-referentie "${ref}" (execution_order ${referencedOrder}) moet v\u00f3\u00f3r het huidige doel komen (execution_order ${currentOrder})`
    );
    error.code = 'CHAIN_REFERENCE_ERROR';
    throw error;
  }
}

export const routes = {
  'GET /': async (context) => {
    return new Response(forminatorSyncV2UI(context.user), {
      headers: { 'Content-Type': 'text/html' }
    });
  },

  'GET /api/meta': async () => {
    return jsonResponse({ success: true, data: getMvpConstants() });
  },

  'GET /api/integrations': async (context) => {
    try {
      const rows = await listIntegrationSummaries(context.env);
      return jsonResponse({ success: true, data: rows });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/integrations': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      const created = await createIntegrationRecord(context.env, payload);
      return jsonResponse({ success: true, data: created }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/integrations/:id': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const bundle = await getIntegrationDetails(context.env, integrationId);
      if (!bundle) {
        return jsonResponse({ success: false, error: 'Integration not found' }, 404);
      }

      return jsonResponse({ success: true, data: bundle });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/integrations/:id': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      const updated = await updateIntegrationRecord(context.env, context.params?.id, payload);
      return jsonResponse({ success: true, data: updated });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/integrations/:id': async (context) => {
    try {
      const result = await deleteIntegrationRecord(context.env, context.params?.id);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/integrations/:id/resolvers': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      await enforceMvpLimitsOnResolvers(context.env, integrationId);

      const payload = await readJsonBody(context.request);
      validateResolverPayload(payload);
      await enforceNoDuplicateResolverType(context.env, integrationId, payload.resolver_type);

      const created = await createResolver(context.env, {
        integration_id: integrationId,
        order_index: Number(payload.order_index || 0),
        resolver_type: payload.resolver_type,
        input_source_field: payload.input_source_field,
        create_if_missing: payload.create_if_missing === true,
        output_context_key: payload.output_context_key,
        is_enabled: true
      });

      return jsonResponse({ success: true, data: created }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/integrations/:id/resolvers/:resolverId': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const payload = await readJsonBody(context.request);
      validateResolverPayload(payload);
      await enforceNoDuplicateResolverType(context.env, integrationId, payload.resolver_type, context.params?.resolverId);

      const updated = await updateResolver(context.env, context.params?.resolverId, {
        order_index: Number(payload.order_index || 0),
        resolver_type: payload.resolver_type,
        input_source_field: payload.input_source_field,
        create_if_missing: payload.create_if_missing === true,
        output_context_key: payload.output_context_key,
        is_enabled: payload.is_enabled !== false
      });

      return jsonResponse({ success: true, data: updated });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/integrations/:id/resolvers/:resolverId': async (context) => {
    try {
      await deleteResolver(context.env, context.params?.resolverId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/integrations/:id/targets': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      await enforceMvpLimitsOnTargets(context.env, integrationId);

      const payload = await readJsonBody(context.request);
      validateTargetPayload(payload);

      const created = await createTarget(context.env, {
        integration_id: integrationId,
        order_index: Number(payload.order_index || 0),
        odoo_model: payload.odoo_model,
        identifier_type: payload.identifier_type,
        update_policy: payload.update_policy,
        is_enabled: true,
        ...(payload.execution_order !== undefined ? { execution_order: Number(payload.execution_order) } : {}),
      });

      return jsonResponse({ success: true, data: created }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/integrations/:id/targets/:targetId': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      validateTargetPayload(payload);

      const updated = await updateTarget(context.env, context.params?.targetId, {
        order_index: Number(payload.order_index || 0),
        odoo_model: payload.odoo_model,
        identifier_type: payload.identifier_type,
        update_policy: payload.update_policy,
        is_enabled: payload.is_enabled !== false,
        ...(payload.execution_order !== undefined ? { execution_order: payload.execution_order === null ? null : Number(payload.execution_order) } : {}),
      });

      await enforceRequiredMappingsForTarget(context.env, context.params?.targetId, payload.odoo_model);

      return jsonResponse({ success: true, data: updated });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/integrations/:id/targets/:targetId': async (context) => {
    try {
      await deleteTarget(context.env, context.params?.targetId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/targets/:targetId/mappings': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      validateMappingPayload(payload);

      if (payload.source_type === 'previous_step_output') {
        await enforceChainReferenceOrder(context.env, context.params?.targetId, payload.source_value);
      }

      const created = await createMapping(context.env, {
        target_id: context.params?.targetId,
        order_index: Number(payload.order_index || 0),
        odoo_field: payload.odoo_field,
        source_type: payload.source_type,
        source_value: payload.source_value,
        is_required: payload.is_required === true,
        is_identifier: payload.is_identifier === true,
        is_update_field: payload.is_update_field !== false
      });

      return jsonResponse({ success: true, data: created }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/mappings/:mappingId': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      validateMappingPayload(payload);

      if (payload.source_type === 'previous_step_output') {
        const existingMapping = await getMappingById(context.env, context.params?.mappingId);
        if (existingMapping?.target_id) {
          await enforceChainReferenceOrder(context.env, existingMapping.target_id, payload.source_value);
        }
      }

      const updated = await updateMapping(context.env, context.params?.mappingId, {
        order_index: Number(payload.order_index || 0),
        odoo_field: payload.odoo_field,
        source_type: payload.source_type,
        source_value: payload.source_value,
        is_required: payload.is_required === true,
        is_identifier: payload.is_identifier === true,
        is_update_field: payload.is_update_field !== false
      });

      return jsonResponse({ success: true, data: updated });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/mappings/:mappingId': async (context) => {
    try {
      await deleteMapping(context.env, context.params?.mappingId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/targets/:targetId/mappings': async (context) => {
    try {
      await deleteMappingsByTarget(context.env, context.params?.targetId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/integrations/:id/test-stub': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const timestamp = new Date().toISOString();
      const payloadHash = crypto.randomUUID().replace(/-/g, '');

      const created = await createSubmission(context.env, {
        integration_id: integrationId,
        idempotency_key: `phase1-test-${integrationId}-${payloadHash}`,
        payload_hash: payloadHash,
        source_payload: { phase: 1, kind: 'manual_test_stub', created_at: timestamp },
        resolved_context: { phase: 1, status: 'test_ok' },
        status: 'processed',
        retry_count: 0,
        started_at: timestamp,
        finished_at: timestamp,
        created_at: timestamp
      });

      return jsonResponse({ success: true, data: created });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/integrations/:id/test-status': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const hasTest = await hasSuccessfulTestSubmission(context.env, integrationId);
      return jsonResponse({
        success: true,
        data: {
          has_successful_test: hasTest
        }
      });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/webhook-config': async (context) => {
    try {
      const secret = context.env?.FORMINATOR_WEBHOOK_SECRET || null;
      const url    = new URL(context.request.url);
      const base   = `${url.protocol}//${url.host}`;
      const webhookPath = '/forminator-v2/api/webhook';
      const webhookUrl  = secret
        ? `${base}${webhookPath}?token=${encodeURIComponent(secret)}`
        : null;
      return jsonResponse({
        success: true,
        data: {
          secret_configured: !!secret,
          webhook_url: webhookUrl,
          webhook_path: webhookPath,
          note: secret
            ? 'Plak deze URL in het WordPress Forminator webhook-veld.'
            : 'Stel de Cloudflare secret FORMINATOR_WEBHOOK_SECRET in en deploy opnieuw.',
        },
      });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  // Forminator validation ping — sends GET before saving webhook URL
  'GET /api/webhook': async (context) => {
    const url = new URL(context.request.url);
    const token = url.searchParams.get('token');
    const configured = context.env?.FORMINATOR_WEBHOOK_SECRET;
    if (!configured || token !== configured) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ success: true, message: 'Webhook endpoint ready' });
  },

  'POST /api/webhook': async (context) => {
    try {
      return await handleForminatorV2Webhook(context);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/integrations/:id/submissions': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const rows = await listSubmissionsByIntegration(context.env, integrationId, 50);
      return jsonResponse({ success: true, data: rows });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/submissions/:submissionId': async (context) => {
    try {
      const submissionId = context.params?.submissionId;
      if (!submissionId) {
        return jsonResponse({ success: false, error: 'Submission id is required' }, 400);
      }

      const submission = await getSubmissionById(context.env, submissionId);
      if (!submission) {
        return jsonResponse({ success: false, error: 'Submission not found' }, 404);
      }

      const targetResults = await listSubmissionTargetResults(context.env, submissionId);

      return jsonResponse({
        success: true,
        data: {
          submission,
          target_results: targetResults
        }
      });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/submissions/:submissionId/replay': async (context) => {
    try {
      const submissionId = context.params?.submissionId;
      if (!submissionId) {
        return jsonResponse({ success: false, error: 'Submission id is required' }, 400);
      }

      const result = await replaySubmission(context.env, submissionId);
      return jsonResponse({ success: true, data: result }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/retries/run-due': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      const rawLimit = Number(payload.limit || 10);
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;

      const result = await processDueRetries(context.env, limit);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WordPress Discovery — multi-site formulierenselectie
  // ─────────────────────────────────────────────────────────────────────────

  'GET /api/discovery/connections': async (context) => {
    try {
      const rows = await listWpConnections(context.env);
      return jsonResponse({ success: true, data: rows });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/discovery/connections': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      // auth_token = waarde die als X-OPENVME-SECRET naar WP gestuurd wordt
      if (!payload.name || !payload.base_url || !payload.auth_token) {
        return jsonResponse({ success: false, error: 'name, base_url en auth_token (X-OPENVME-SECRET waarde) zijn verplicht' }, 400);
      }
      const created = await createWpConnection(context.env, payload);
      return jsonResponse({ success: true, data: created }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/discovery/connections/:connectionId': async (context) => {
    try {
      const connectionId = context.params?.connectionId;
      if (!connectionId) return jsonResponse({ success: false, error: 'connectionId is required' }, 400);
      const result = await deleteWpConnection(context.env, connectionId);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/discovery/forms': async (context) => {
    try {
      const url = new URL(context.request.url);
      const wpConnectionId = url.searchParams.get('wp_connection_id');
      if (!wpConnectionId) {
        return jsonResponse({ success: false, error: 'wp_connection_id query param is verplicht' }, 400);
      }

      const connection = await getWpConnectionById(context.env, wpConnectionId);
      if (!connection) {
        return jsonResponse({ success: false, error: 'WordPress connectie niet gevonden' }, 404);
      }

      if (!connection.is_active) {
        return jsonResponse({ success: false, error: `Connectie "${connection.name}" is inactief` }, 400);
      }

      // auth_token bevat de X-OPENVME-SECRET waarde
      const forms = await fetchOpenVmeForminatorForms({
        baseUrl: connection.base_url,
        secret:  connection.auth_token
      });
      return jsonResponse({ success: true, data: forms });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  // ─── Cloudflare-secrets-based multi-site (Basic Auth) ──────────────────────

  /**
   * GET /api/forminator/sites
   * Geeft de lijst van geconfigureerde WP-sites terug op basis van
   * WORDPRESS_URL_SITE_N env vars. Nooit credentials in de response.
   */
  'GET /api/forminator/sites': async (context) => {
    try {
      const sites = [];
      for (let i = 1; i <= 10; i++) {
        const key = `SITE_${i}`;
        const url = context.env[`WORDPRESS_URL_${key}`];
        if (!url) continue;
        // Geef aan of het token geconfigureerd is maar stuur het NOOIT mee
        const hasToken = Boolean(context.env[`WP_API_TOKEN_${key}`]);
        sites.push({ key, label: `Site ${i}`, url, has_token: hasToken });
      }
      return jsonResponse({ success: true, data: sites });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * GET /api/forminator/forms?site=SITE_1
   * Haalt Forminator forms op van de opgegeven site via Basic Auth.
   * Credentials komen uitsluitend uit Cloudflare env vars (nooit DB).
   */
  'GET /api/forminator/forms': async (context) => {
    try {
      const url = new URL(context.request.url);
      const siteKey = (url.searchParams.get('site') || '').toUpperCase().trim();

      if (!siteKey) {
        return jsonResponse({ success: false, error: 'site query param is verplicht, bv. ?site=SITE_1' }, 400);
      }

      const baseUrl = context.env[`WORDPRESS_URL_${siteKey}`];
      const token   = context.env[`WP_API_TOKEN_${siteKey}`];

      if (!baseUrl) {
        return jsonResponse(
          { success: false, error: `WORDPRESS_URL_${siteKey} is niet geconfigureerd in Cloudflare secrets` },
          404
        );
      }
      if (!token) {
        return jsonResponse(
          { success: false, error: `WP_API_TOKEN_${siteKey} is niet geconfigureerd in Cloudflare secrets` },
          404
        );
      }

      const forms = await fetchForminatorFormsBasicAuth({ baseUrl, token });
      return jsonResponse({ success: true, data: forms, site: siteKey, base_url: baseUrl });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  /**
   * GET /api/settings/model-defaults?model=res.partner
   * Returns the saved default field list for a given Odoo model from Supabase.
   */
  'GET /api/settings/model-defaults': async (context) => {
    try {
      const url   = new URL(context.request.url);
      const model = (url.searchParams.get('model') || '').trim();
      if (!model) return jsonResponse({ success: false, error: 'model param required' }, 400);
      const row = await getModelDefaults(context.env, model);
      return jsonResponse({ success: true, data: row ? row.fields : [] });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * PUT /api/settings/model-defaults
   * Saves the default field list for a given Odoo model (upsert).
   * Body: { model: "res.partner", fields: [{name, label, required, order_index}] }
   */
  'PUT /api/settings/model-defaults': async (context) => {
    try {
      const body   = await readJsonBody(context.request);
      const { model, fields } = body;
      if (!model)                 return jsonResponse({ success: false, error: 'model required' }, 400);
      if (!Array.isArray(fields)) return jsonResponse({ success: false, error: 'fields must be an array' }, 400);
      const row = await upsertModelDefaults(context.env, model, fields);
      return jsonResponse({ success: true, data: row });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * GET /api/odoo/fields?model=res.partner
   * Returns all stored, user-visible fields for the given Odoo model.
   * Used by the mapping UI to provide a searchable dropdown of Odoo fields.
   */
  'GET /api/odoo/fields': async (context) => {
    try {
      const url = new URL(context.request.url);
      const model = (url.searchParams.get('model') || '').trim();

      if (!model) {
        return jsonResponse({ success: false, error: 'model query param is verplicht, bv. ?model=res.partner' }, 400);
      }

      const rawFields = await executeKw(context.env, {
        model,
        method: 'fields_get',
        args: [],
        kwargs: { attributes: ['string', 'type', 'store', 'readonly', 'selection', 'relation'] },
      });

      // Transform to sorted array; only expose stored fields
      const fields = Object.entries(rawFields)
        .filter(([, meta]) => meta.store === true)
        .map(([name, meta]) => ({
          name,
          label: meta.string || name,
          type: meta.type,
          readonly: !!meta.readonly,
          selection: Array.isArray(meta.selection) && meta.selection.length ? meta.selection : null,
          relation: meta.relation || null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'nl'));

      return jsonResponse({ success: true, data: fields, model });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  }
};
