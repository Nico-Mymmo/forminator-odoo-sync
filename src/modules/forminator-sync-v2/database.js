import { getSupabaseClient } from '../../lib/database.js';

const TABLES = {
  integrations:    'fs_v2_integrations',
  resolvers:       'fs_v2_resolvers',
  targets:         'fs_v2_targets',
  mappings:        'fs_v2_mappings',
  submissions:     'fs_v2_submissions',
  submissionTargets: 'fs_v2_submission_targets',
  wpConnections:   'wp_connections',
  odooModels:      'fs_v2_odoo_models',
  modelLinks:      'fs_v2_model_links',
  fieldTransforms: 'fs_v2_field_transforms',
};

function getSupabase(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return getSupabaseClient(env);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function listIntegrations(env) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.integrations)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list integrations: ${error.message}`);
  const integrations = ensureArray(data);

  // Fetch minimal target info for step-badge display in list view
  const ids = integrations.map((r) => r.id);
  if (ids.length > 0) {
    const { data: targets } = await supabase
      .from(TABLES.targets)
      .select('integration_id, odoo_model, operation_type, execution_order, order_index')
      .in('integration_id', ids);
    const byInteg = {};
    ensureArray(targets).forEach((t) => {
      if (!byInteg[t.integration_id]) byInteg[t.integration_id] = [];
      byInteg[t.integration_id].push(t);
    });
    integrations.forEach((row) => {
      row.targets = (byInteg[row.id] || []).sort(
        (a, b) => (a.execution_order ?? a.order_index ?? 0) - (b.execution_order ?? b.order_index ?? 0)
      );
    });
  }

  return integrations;
}

export async function getIntegrationById(env, integrationId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.integrations)
    .select('*')
    .eq('id', integrationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch integration: ${error.message}`);
  return data || null;
}

export async function createIntegration(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.integrations)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create integration: ${error.message}`);
  return data;
}

export async function updateIntegration(env, integrationId, updates) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.integrations)
    .update(updates)
    .eq('id', integrationId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update integration: ${error.message}`);
  return data;
}

export async function upsertFieldMeta(env, integrationId, meta) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.integrations)
    .update({ field_meta: meta, updated_at: new Date().toISOString() })
    .eq('id', integrationId);
  if (error) throw new Error(`Failed to save field_meta: ${error.message}`);
  return meta;
}

export async function deleteIntegration(env, integrationId) {
  const supabase = getSupabase(env);

  const resolverDelete = await supabase
    .from(TABLES.resolvers)
    .delete()
    .eq('integration_id', integrationId);
  if (resolverDelete.error) {
    throw new Error(`Failed to delete resolvers: ${resolverDelete.error.message}`);
  }

  const { data: targets, error: targetFetchError } = await supabase
    .from(TABLES.targets)
    .select('id')
    .eq('integration_id', integrationId);
  if (targetFetchError) {
    throw new Error(`Failed to fetch targets: ${targetFetchError.message}`);
  }

  const targetIds = ensureArray(targets).map((row) => row.id);
  if (targetIds.length > 0) {
    const mappingDelete = await supabase
      .from(TABLES.mappings)
      .delete()
      .in('target_id', targetIds);
    if (mappingDelete.error) {
      throw new Error(`Failed to delete mappings: ${mappingDelete.error.message}`);
    }
  }

  const targetDelete = await supabase
    .from(TABLES.targets)
    .delete()
    .eq('integration_id', integrationId);
  if (targetDelete.error) {
    throw new Error(`Failed to delete targets: ${targetDelete.error.message}`);
  }

  const submissionDelete = await supabase
    .from(TABLES.submissions)
    .delete()
    .eq('integration_id', integrationId);
  if (submissionDelete.error) {
    throw new Error(`Failed to delete submissions: ${submissionDelete.error.message}`);
  }

  const integrationDelete = await supabase
    .from(TABLES.integrations)
    .delete()
    .eq('id', integrationId);
  if (integrationDelete.error) {
    throw new Error(`Failed to delete integration: ${integrationDelete.error.message}`);
  }

  return true;
}

export async function deleteSubmission(env, submissionId) {
  const supabase = getSupabase(env);

  // Find all replays of this submission
  const { data: replays, error: replaysError } = await supabase
    .from(TABLES.submissions)
    .select('id, status')
    .eq('replay_of_submission_id', submissionId);
  if (replaysError) throw new Error(`Failed to fetch replays: ${replaysError.message}`);

  const successStatuses = ['success', 'processed'];
  const successfulReplays = (replays || []).filter(r => successStatuses.includes(r.status));
  const failedReplays     = (replays || []).filter(r => !successStatuses.includes(r.status));

  // Promote successful replays to standalone (clear the reference before deleting the original)
  if (successfulReplays.length > 0) {
    const { error: promoteError } = await supabase
      .from(TABLES.submissions)
      .update({ replay_of_submission_id: null })
      .in('id', successfulReplays.map(r => r.id));
    if (promoteError) throw new Error(`Failed to promote successful replays: ${promoteError.message}`);
  }

  // Delete targets + submissions for failed replays
  if (failedReplays.length > 0) {
    const failedIds = failedReplays.map(r => r.id);
    const { error: replayTargetsError } = await supabase
      .from(TABLES.submissionTargets)
      .delete()
      .in('submission_id', failedIds);
    if (replayTargetsError) throw new Error(`Failed to delete replay targets: ${replayTargetsError.message}`);

    const { error: replayDeleteError } = await supabase
      .from(TABLES.submissions)
      .delete()
      .in('id', failedIds);
    if (replayDeleteError) throw new Error(`Failed to delete failed replays: ${replayDeleteError.message}`);
  }

  // Delete child target rows first (FK constraint)
  const { error: targetsError } = await supabase
    .from(TABLES.submissionTargets)
    .delete()
    .eq('submission_id', submissionId);
  if (targetsError) throw new Error(`Failed to delete submission targets: ${targetsError.message}`);

  const { error } = await supabase
    .from(TABLES.submissions)
    .delete()
    .eq('id', submissionId);
  if (error) throw new Error(`Failed to delete submission: ${error.message}`);

  return true;
}

/**
 * For a given integration: find all original submissions that have at least one
 * successful replay, then delete the failed originals + all failed replays while
 * keeping (and promoting) the successful replay.
 * Returns { deleted, promoted } counts.
 */
export async function cleanupFailedReplays(env, integrationId) {
  const supabase = getSupabase(env);
  const successStatuses = ['success', 'processed'];

  // Fetch all submissions for this integration
  const { data: subs, error: subsError } = await supabase
    .from(TABLES.submissions)
    .select('id, status, replay_of_submission_id')
    .eq('integration_id', integrationId);
  if (subsError) throw new Error(`Failed to fetch submissions: ${subsError.message}`);

  // Group replays by their original
  const replaysByOrigId = {};
  subs.filter(s => s.replay_of_submission_id).forEach(r => {
    if (!replaysByOrigId[r.replay_of_submission_id]) replaysByOrigId[r.replay_of_submission_id] = [];
    replaysByOrigId[r.replay_of_submission_id].push(r);
  });

  const toPromote   = []; // successful replay ids to clear replay_of_submission_id
  const toDeleteIds = []; // failed original + failed replay ids to delete

  for (const [origId, replays] of Object.entries(replaysByOrigId)) {
    const successfulReplays = replays.filter(r => successStatuses.includes(r.status));
    if (successfulReplays.length === 0) continue; // no successful replay — skip

    successfulReplays.forEach(r => toPromote.push(r.id));
    replays.filter(r => !successStatuses.includes(r.status)).forEach(r => toDeleteIds.push(r.id));
    toDeleteIds.push(origId);
  }

  if (toPromote.length > 0) {
    const { error } = await supabase
      .from(TABLES.submissions)
      .update({ replay_of_submission_id: null })
      .in('id', toPromote);
    if (error) throw new Error(`Failed to promote replays: ${error.message}`);
  }

  let deleted = 0;
  if (toDeleteIds.length > 0) {
    const { error: tErr } = await supabase
      .from(TABLES.submissionTargets)
      .delete()
      .in('submission_id', toDeleteIds);
    if (tErr) throw new Error(`Failed to delete targets: ${tErr.message}`);

    const { error: sErr } = await supabase
      .from(TABLES.submissions)
      .delete()
      .in('id', toDeleteIds);
    if (sErr) throw new Error(`Failed to delete submissions: ${sErr.message}`);
    deleted = toDeleteIds.length;
  }

  return { deleted, promoted: toPromote.length };
}

export async function getTargetById(env, targetId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.targets)
    .select('*')
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw new Error(`Failed to get target: ${error.message}`);
  return data;
}

export async function getMappingById(env, mappingId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.mappings)
    .select('*')
    .eq('id', mappingId)
    .maybeSingle();
  if (error) throw new Error(`Failed to get mapping: ${error.message}`);
  return data;
}

export async function listResolversByIntegration(env, integrationId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.resolvers)
    .select('*')
    .eq('integration_id', integrationId)
    .order('order_index', { ascending: true });

  if (error) throw new Error(`Failed to list resolvers: ${error.message}`);
  return ensureArray(data);
}

export async function createResolver(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.resolvers)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create resolver: ${error.message}`);
  return data;
}

export async function updateResolver(env, resolverId, updates) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.resolvers)
    .update(updates)
    .eq('id', resolverId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update resolver: ${error.message}`);
  return data;
}

export async function deleteResolver(env, resolverId) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.resolvers)
    .delete()
    .eq('id', resolverId);

  if (error) throw new Error(`Failed to delete resolver: ${error.message}`);
  return true;
}

export async function listTargetsByIntegration(env, integrationId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.targets)
    .select('*')
    .eq('integration_id', integrationId)
    .order('execution_order', { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Failed to list targets: ${error.message}`);
  return ensureArray(data);
}

export async function createTarget(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.targets)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create target: ${error.message}`);
  return data;
}

export async function updateTarget(env, targetId, updates) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.targets)
    .update(updates)
    .eq('id', targetId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update target: ${error.message}`);
  return data;
}

export async function deleteTarget(env, targetId) {
  const supabase = getSupabase(env);

  const mappingDelete = await supabase
    .from(TABLES.mappings)
    .delete()
    .eq('target_id', targetId);
  if (mappingDelete.error) {
    throw new Error(`Failed to delete target mappings: ${mappingDelete.error.message}`);
  }

  const { error } = await supabase
    .from(TABLES.targets)
    .delete()
    .eq('id', targetId);

  if (error) throw new Error(`Failed to delete target: ${error.message}`);
  return true;
}

export async function listMappingsByTarget(env, targetId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.mappings)
    .select('*')
    .eq('target_id', targetId)
    .order('order_index', { ascending: true });

  if (error) throw new Error(`Failed to list mappings: ${error.message}`);
  return ensureArray(data);
}

export async function createMapping(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.mappings)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create mapping: ${error.message}`);
  return data;
}

export async function updateMapping(env, mappingId, updates) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.mappings)
    .update(updates)
    .eq('id', mappingId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update mapping: ${error.message}`);
  return data;
}

export async function deleteMapping(env, mappingId) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.mappings)
    .delete()
    .eq('id', mappingId);

  if (error) throw new Error(`Failed to delete mapping: ${error.message}`);
  return true;
}

export async function deleteMappingsByTarget(env, targetId) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.mappings)
    .delete()
    .eq('target_id', targetId);

  if (error) throw new Error(`Failed to delete mappings for target: ${error.message}`);
  return true;
}

export async function createSubmission(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create submission: ${error.message}`);
  return data;
}

export async function updateSubmission(env, submissionId, updates) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .update(updates)
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update submission: ${error.message}`);
  return data;
}

export async function createSubmissionTargetResult(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissionTargets)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create submission target result: ${error.message}`);
  return data;
}

export async function getLatestSubmissionByIdempotencyKey(env, integrationId, idempotencyKey) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('integration_id', integrationId)
    .eq('idempotency_key', idempotencyKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch idempotency submission: ${error.message}`);
  return data || null;
}

export async function getFirstRunningSubmissionByIdempotencyKey(env, integrationId, idempotencyKey) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('integration_id', integrationId)
    .eq('idempotency_key', idempotencyKey)
    .eq('status', 'running')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch running idempotency submission: ${error.message}`);
  return data || null;
}

export async function listSubmissionsByIntegration(env, integrationId, limit = 20) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list submissions: ${error.message}`);
  return ensureArray(data);
}

export async function getSubmissionById(env, submissionId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch submission: ${error.message}`);
  return data || null;
}

export async function getRunningReplayByOriginalSubmissionId(env, originalSubmissionId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('replay_of_submission_id', originalSubmissionId)
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch running replay submission: ${error.message}`);
  return data || null;
}

export async function listReplaySubmissionsByOriginalSubmissionId(env, originalSubmissionId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('replay_of_submission_id', originalSubmissionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list replay submissions: ${error.message}`);
  return ensureArray(data);
}

export async function listDueRetrySubmissions(env, nowIso, limit = 25) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissions)
    .select('*')
    .eq('status', 'retry_scheduled')
    .not('next_retry_at', 'is', null)
    .lte('next_retry_at', nowIso)
    .order('next_retry_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to list due retry submissions: ${error.message}`);
  return ensureArray(data);
}

export async function transitionSubmissionStatus(env, submissionId, fromStatuses, updates) {
  const supabase = getSupabase(env);
  const statuses = ensureArray(fromStatuses);

  if (statuses.length === 0) {
    throw new Error('transitionSubmissionStatus requires at least one source status');
  }

  const { data, error } = await supabase
    .from(TABLES.submissions)
    .update(updates)
    .eq('id', submissionId)
    .in('status', statuses)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to transition submission status: ${error.message}`);
  return data || null;
}

export async function hasSuccessfulTestSubmission(env, integrationId) {
  const supabase = getSupabase(env);
  const { count, error } = await supabase
    .from(TABLES.submissions)
    .select('id', { count: 'exact', head: true })
    .eq('integration_id', integrationId)
    .in('status', ['processed', 'success']);

  if (error) throw new Error(`Failed to check successful test: ${error.message}`);
  return Number(count || 0) > 0;
}

export async function getActiveIntegrationByFormId(env, forminatorFormId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.integrations)
    .select('*')
    .eq('forminator_form_id', forminatorFormId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch active integration by form: ${error.message}`);
  return data || null;
}

export async function listSubmissionTargetResults(env, submissionId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissionTargets)
    .select('*')
    .eq('submission_id', submissionId)
    .order('processed_at', { ascending: true });

  if (error) throw new Error(`Failed to list submission target results: ${error.message}`);
  return ensureArray(data);
}

export async function getLatestSubmissionTargetResultByTarget(env, submissionId, targetId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.submissionTargets)
    .select('*')
    .eq('submission_id', submissionId)
    .eq('target_id', targetId)
    .order('processed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch latest submission target result: ${error.message}`);
  return data || null;
}

export async function listFieldTransforms(env, integrationId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.fieldTransforms)
    .select('*')
    .eq('integration_id', integrationId)
    .order('field_name');
  if (error) throw new Error(`Failed to list field_transforms: ${error.message}`);
  return ensureArray(data);
}

export async function upsertFieldTransform(env, integrationId, fieldName, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.fieldTransforms)
    .upsert({
      integration_id: integrationId,
      field_name:     fieldName,
      field_type:     payload.field_type || 'text',
      value_map:      payload.value_map  || null,
      value_map_order: Array.isArray(payload.value_map_order) && payload.value_map_order.length
        ? payload.value_map_order
        : null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'integration_id,field_name' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to upsert field_transform: ${error.message}`);
  return data;
}

export async function deleteFieldTransform(env, integrationId, fieldName) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.fieldTransforms)
    .delete()
    .eq('integration_id', integrationId)
    .eq('field_name', fieldName);
  if (error) throw new Error(`Failed to delete field_transform: ${error.message}`);
}

export async function getIntegrationBundle(env, integrationId) {
  const integration = await getIntegrationById(env, integrationId);
  if (!integration) return null;

  const resolvers = await listResolversByIntegration(env, integrationId);
  const targets = await listTargetsByIntegration(env, integrationId);

  const mappingsByTarget = {};
  for (const target of targets) {
    mappingsByTarget[target.id] = await listMappingsByTarget(env, target.id);
  }

  const fieldTransformsList = await listFieldTransforms(env, integrationId);
  // Index by field_name for O(1) lookup during value resolution
  const fieldTransforms = {};
  for (const t of fieldTransformsList) {
    fieldTransforms[t.field_name] = t;
  }

  return {
    integration,
    resolvers,
    targets,
    mappingsByTarget,
    fieldTransforms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// wp_connections — lees-/schrijffuncties voor Forminator Sync V2 discovery
// ─────────────────────────────────────────────────────────────────────────────

export async function listWpConnections(env) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.wpConnections)
    .select('id, name, base_url, is_active, created_at')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to list wp_connections: ${error.message}`);
  return ensureArray(data);
}

export async function getWpConnectionById(env, id) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.wpConnections)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch wp_connection: ${error.message}`);
  return data || null;
}

export async function createWpConnection(env, payload) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.wpConnections)
    .insert({
      name: payload.name,
      base_url: payload.base_url,
      auth_token: payload.auth_token,
      is_active: payload.is_active !== false
    })
    .select('id, name, base_url, is_active, created_at')
    .single();

  if (error) throw new Error(`Failed to create wp_connection: ${error.message}`);
  return data;
}

export async function deleteWpConnection(env, id) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.wpConnections)
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete wp_connection: ${error.message}`);
  return { deleted: true };
}

// ─── Model defaults (reads/writes default_fields on fs_v2_odoo_models) ────────
//  getModelDefaults left as compatibility shim — reads default_fields column.
export async function getModelDefaults(env, model) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.odooModels)
    .select('default_fields')
    .eq('name', model)
    .maybeSingle();
  if (error) throw new Error(`Failed to get model defaults: ${error.message}`);
  return data ? { fields: data.default_fields || [] } : null;
}

// ──────────────────────────────────────────────────────────────────────────
// MODEL LINK REGISTRY  (fs_v2_model_links)
// Each row: model_a, model_b, link_field, link_label
// ──────────────────────────────────────────────────────────────────────────
export async function getModelLinks(env) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.modelLinks)
    .select('model_a, model_b, link_field, link_label')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to get model links: ${error.message}`);
  return ensureArray(data);
}

export async function upsertModelLinks(env, links) {
  // Full replace: compute delta then apply
  const supabase  = getSupabase(env);
  const { data: existing, error: fetchErr } = await supabase
    .from(TABLES.modelLinks)
    .select('id, model_a, model_b, link_field');
  if (fetchErr) throw new Error(`Failed to fetch model links: ${fetchErr.message}`);

  // Delete rows not present in the new list
  const toDelete = ensureArray(existing).filter(
    ex => !links.some(l => l.model_a === ex.model_a && l.model_b === ex.model_b && l.link_field === ex.link_field)
  );
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from(TABLES.modelLinks)
      .delete()
      .in('id', toDelete.map(r => r.id));
    if (delErr) throw new Error(`Failed to delete model links: ${delErr.message}`);
  }

  // Upsert all rows in the new list
  if (links.length > 0) {
    const rows = links.map(l => ({
      model_a:    l.model_a,
      model_b:    l.model_b,
      link_field: l.link_field,
      link_label: l.link_label || '',
    }));
    const { error: upsErr } = await supabase
      .from(TABLES.modelLinks)
      .upsert(rows, { onConflict: 'model_a,model_b,link_field' });
    if (upsErr) throw new Error(`Failed to save model links: ${upsErr.message}`);
  }

  return getModelLinks(env);
}

// ──────────────────────────────────────────────────────────────────────────
// ODOO MODEL REGISTRY  (fs_v2_odoo_models)
// Each row: name (unique), label, icon, sort_order
// ──────────────────────────────────────────────────────────────────────────
export async function getOdooModels(env) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from(TABLES.odooModels)
    .select('name, odoo_model, label, icon, sort_order, default_fields, fixed_fields, identifier_fields, identifier_type, update_policy, resolver_type, hidden_odoo_fields')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Failed to get odoo models: ${error.message}`);
  return ensureArray(data);
}

export async function updateModelDefaultFields(env, model, fields) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.odooModels)
    .update({ default_fields: fields })
    .eq('name', model);
  if (error) throw new Error(`Failed to update model default fields: ${error.message}`);
  return true;
}

export async function upsertOdooModels(env, models) {
  // Full replace: compute delta then apply
  const supabase = getSupabase(env);
  const { data: existing, error: fetchErr } = await supabase
    .from(TABLES.odooModels)
    .select('id, name');
  if (fetchErr) throw new Error(`Failed to fetch odoo models: ${fetchErr.message}`);

  const newNames = models.map(m => m.name);

  // Delete rows not present in the new list
  const toDelete = ensureArray(existing).filter(ex => !newNames.includes(ex.name));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from(TABLES.odooModels)
      .delete()
      .in('id', toDelete.map(r => r.id));
    if (delErr) throw new Error(`Failed to delete odoo models: ${delErr.message}`);
  }

  // Upsert all rows in the new list
  if (models.length > 0) {
    const rows = models.map((m, i) => ({
      name:              m.name,
      label:             m.label || m.name,
      icon:              m.icon || 'box',
      sort_order:        i,
      default_fields:    Array.isArray(m.default_fields)    ? m.default_fields    : undefined,
      hidden_odoo_fields: Array.isArray(m.hidden_odoo_fields) ? m.hidden_odoo_fields : [],
    }));
    const { error: upsErr } = await supabase
      .from(TABLES.odooModels)
      .upsert(rows, { onConflict: 'name' });
    if (upsErr) throw new Error(`Failed to save odoo models: ${upsErr.message}`);
  }

  return getOdooModels(env);
}

/**
 * Atomisch ophalen van de volgende gebruiker in de round-robin pool voor een activity-stap.
 * Roept de Supabase RPC-functie fs_v2_rr_next_user aan die de index atoomgewijs ophoogt.
 * Geeft null terug als de pool leeg is of de target niet bestaat.
 */
export async function rrNextUser(env, targetId) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .rpc('fs_v2_rr_next_user', { p_target_id: targetId });
  if (error) throw new Error(`Failed to get round-robin user: ${error.message}`);
  return data != null ? Number(data) : null;
}
export async function updateModelFixedFields(env, model, fields) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.odooModels)
    .update({ fixed_fields: fields })
    .eq('name', model);
  if (error) throw new Error(`Failed to update model fixed fields: ${error.message}`);
  return true;
}

export async function updateModelIdentifierFields(env, model, fields) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from(TABLES.odooModels)
    .update({ identifier_fields: fields })
    .eq('name', model);
  if (error) throw new Error(`Failed to update model identifier fields: ${error.message}`);
  return true;
}

/**
 * Berekent per integratie welke verplichte standaardvelden ontbreken in de mappings.
 * Retourneert: { [integrationId]: [{ targetId, targetLabel, missingLabels, missingFields }] }
 * Alleen entries met ≥1 ontbrekend veld worden opgenomen.
 * Chatter- en activiteit-stappen worden overgeslagen.
 */
export async function getIntegrationWarnings(env) {
  const supabase = getSupabase(env);

  // 1. Laad alle odoo-modellen met default_fields én fixed_fields
  const { data: models, error: modelsErr } = await supabase
    .from(TABLES.odooModels)
    .select('name, default_fields, fixed_fields');
  if (modelsErr) throw new Error(`Failed to load models: ${modelsErr.message}`);

  // Bouw map: modelName → [{ name, label }] verplichte velden die NIET via fixed_fields gedekt zijn
  const requiredByModel = {};
  for (const m of (models || [])) {
    const fixedNames = new Set((m.fixed_fields || []).map(f => f.name || f));
    const req = (m.default_fields || [])
      .filter(f => f.required && !fixedNames.has(f.name))
      .map(f => ({ name: f.name, label: f.label || f.name }));
    if (req.length) requiredByModel[m.name] = req;
  }
  if (!Object.keys(requiredByModel).length) return {};

  // 2. Laad alle targets
  const { data: targets, error: targetsErr } = await supabase
    .from(TABLES.targets)
    .select('id, integration_id, label, odoo_model, execution_order, operation_type')
    .order('execution_order', { ascending: true });
  if (targetsErr) throw new Error(`Failed to load targets: ${targetsErr.message}`);

  // Sla chatter- en activiteit-stappen over — die hebben geen gewone veldmappings
  const relevantTargets = (targets || []).filter(t =>
    requiredByModel[t.odoo_model] &&
    t.operation_type !== 'chatter_message' &&
    t.operation_type !== 'create_activity'
  );
  if (!relevantTargets.length) return {};

  // 3. Laad alle mappings voor relevante targets
  const relevantIds = relevantTargets.map(t => t.id);
  const { data: mappings, error: mappingsErr } = await supabase
    .from(TABLES.mappings)
    .select('target_id, odoo_field')
    .in('target_id', relevantIds);
  if (mappingsErr) throw new Error(`Failed to load mappings: ${mappingsErr.message}`);

  const mappedByTarget = {};
  for (const mp of (mappings || [])) {
    if (!mappedByTarget[mp.target_id]) mappedByTarget[mp.target_id] = new Set();
    mappedByTarget[mp.target_id].add(mp.odoo_field);
  }

  // 4. Bereken ontbrekende verplichte velden per integratie
  const warnings = {};
  for (const t of relevantTargets) {
    const required = requiredByModel[t.odoo_model] || [];
    const mapped   = mappedByTarget[t.id] || new Set();
    const missing  = required.filter(f => !mapped.has(f.name));
    if (!missing.length) continue;
    if (!warnings[t.integration_id]) warnings[t.integration_id] = [];
    warnings[t.integration_id].push({
      targetId:      t.id,
      targetLabel:   t.label || `Stap ${t.execution_order || '?'}`,
      missingLabels: missing.map(f => f.label),
      missingFields: missing.map(f => f.name),
    });
  }
  return warnings;
}
