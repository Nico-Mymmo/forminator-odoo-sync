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
  createTarget,
  updateTarget,
  deleteTarget,
  createMapping,
  updateMapping,
  deleteMapping,
  listMappingsByTarget,
  createSubmission,
  hasSuccessfulTestSubmission,
  listSubmissionsByIntegration,
  getSubmissionById,
  listSubmissionTargetResults,
  listWpConnections,
  getWpConnectionById,
  createWpConnection,
  deleteWpConnection
} from './database.js';
import { getWpClient } from '../event-operations/wp-client.js';
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
        is_enabled: true
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
        is_enabled: payload.is_enabled !== false
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

      const created = await createMapping(context.env, {
        target_id: context.params?.targetId,
        order_index: Number(payload.order_index || 0),
        odoo_field: payload.odoo_field,
        source_type: payload.source_type,
        source_value: payload.source_value,
        is_required: payload.is_required === true
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

      const updated = await updateMapping(context.env, context.params?.mappingId, {
        order_index: Number(payload.order_index || 0),
        odoo_field: payload.odoo_field,
        source_type: payload.source_type,
        source_value: payload.source_value,
        is_required: payload.is_required === true
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
      if (!payload.name || !payload.base_url || !payload.auth_token) {
        return jsonResponse({ success: false, error: 'name, base_url en auth_token zijn verplicht' }, 400);
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

      const client = getWpClient(context.env, connection);
      const forms = await client.fetchForms();
      return jsonResponse({ success: true, data: forms });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  }
};
