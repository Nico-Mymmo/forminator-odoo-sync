import { createClient } from '@supabase/supabase-js';

const TABLES = {
  integrations: 'fs_v2_integrations',
  resolvers: 'fs_v2_resolvers',
  targets: 'fs_v2_targets',
  mappings: 'fs_v2_mappings',
  submissions: 'fs_v2_submissions',
  submissionTargets: 'fs_v2_submission_targets'
};

function getSupabase(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
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
  return ensureArray(data);
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
    .order('order_index', { ascending: true });

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

export async function getIntegrationBundle(env, integrationId) {
  const integration = await getIntegrationById(env, integrationId);
  if (!integration) return null;

  const resolvers = await listResolversByIntegration(env, integrationId);
  const targets = await listTargetsByIntegration(env, integrationId);

  const mappingsByTarget = {};
  for (const target of targets) {
    mappingsByTarget[target.id] = await listMappingsByTarget(env, target.id);
  }

  return {
    integration,
    resolvers,
    targets,
    mappingsByTarget
  };
}
