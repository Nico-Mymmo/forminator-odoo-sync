import {
  createSubmission,
  createSubmissionTargetResult,
  getActiveIntegrationByFormId,
  getFirstRunningSubmissionByIdempotencyKey,
  getIntegrationBundle,
  getLatestSubmissionByIdempotencyKey,
  getLatestSubmissionTargetResultByTarget,
  getRunningReplayByOriginalSubmissionId,
  getSubmissionById,
  listDueRetrySubmissions,
  listMappingsByTarget,
  listSubmissionTargetResults,
  transitionSubmissionStatus,
  updateSubmission
} from './database.js';
import {
  buildIdempotencyKey,
  classifyDuplicateStatus,
  computePayloadHash
} from './idempotency.js';
import { classifyFailureType, computeNextRetryAt, getMaxAttemptsTotal } from './retry.js';
import { findRecordByIdentifier, upsertRecordStrict, createRecordOnly, updateOnlyRecord, postChatterMessage, createActivity } from './odoo-client.js';
import { buildHtmlFormSummary } from './html-utils.js';

function createPermanentError(message) {
  const error = new Error(message);
  error.code = 'PERMANENT_FAILURE';
  return error;
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeFieldKey(key) {
  return String(key || '').toLowerCase().replace(/[-_\s]+/g, '_');
}

// Returns true when every character of abbr appears in order within full.
// Used to match Forminator API field-ids (e.g. "fname") against webhook JSON
// keys (e.g. "first_name"): f-n-a-m-e all appear left-to-right in f-i-r-s-t_n-a-m-e.
function isSubsequence(abbr, full) {
  var ai = 0;
  for (var fi = 0; fi < full.length && ai < abbr.length; fi++) {
    if (full[fi] === abbr[ai]) ai++;
  }
  return ai === abbr.length;
}

function lookupFormValue(normalizedForm, sourceValue) {
  if (!sourceValue) return '';
  // 1. Exact match
  const exact = normalizeString(normalizedForm[sourceValue]);
  if (exact) return exact;
  // 2. Normalize dashes/underscores and compare — e.g. "email-1" matches "email_1"
  const normalizedSource = normalizeFieldKey(sourceValue);
  for (const [key, val] of Object.entries(normalizedForm)) {
    if (normalizeFieldKey(key) === normalizedSource) {
      const resolved = normalizeString(val);
      if (resolved) {
        console.log(`[mapping] normalized match: source_value="${sourceValue}" → form key "${key}"`);
        return resolved;
      }
    }
  }
  // 3. Prefix match — source_value without trailing digit, e.g. "email" matches "email_1"
  const prefix = normalizeFieldKey(sourceValue);
  for (const [key, val] of Object.entries(normalizedForm)) {
    if (normalizeFieldKey(key).startsWith(prefix + '_') || normalizeFieldKey(key).startsWith(prefix + '-')) {
      const resolved = normalizeString(val);
      if (resolved) {
        console.log(`[mapping] prefix match: source_value="${sourceValue}" → form key "${key}"`);
        return resolved;
      }
    }
  }
  // 4. Dot-notation abbreviation match for composite sub-fields.
  //    Forminator API uses short ids like "fname"/"lname" but the webhook sends
  //    the JSON object with keys like "first-name"/"last-name".
  //    isSubsequence("fname", "first_name") → true (every char of abbr in order).
  if (sourceValue.indexOf('.') !== -1) {
    const dotIdx    = sourceValue.indexOf('.');
    const parentPart = normalizeFieldKey(sourceValue.slice(0, dotIdx));
    const childQuery = normalizeFieldKey(sourceValue.slice(dotIdx + 1));
    for (const [key, val] of Object.entries(normalizedForm)) {
      const normKey   = normalizeFieldKey(key);
      const keyDot    = normKey.indexOf('.');
      if (keyDot === -1) continue;
      if (normKey.slice(0, keyDot) !== parentPart) continue;
      const keyChild  = normKey.slice(keyDot + 1);
      if (isSubsequence(childQuery, keyChild) || isSubsequence(keyChild, childQuery)) {
        const resolved = normalizeString(val);
        if (resolved) {
          console.log(`[mapping] subsequence match: source_value="${sourceValue}" → form key "${key}"`);
          return resolved;
        }
      }
    }
  }
  return '';
}

function normalizeFormValues(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const candidate = raw.form_fields || raw.form_data || raw.data || raw.submission || raw;
  const source = candidate && typeof candidate === 'object' ? candidate : {};

  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      normalized[key] = value.map((entry) => normalizeString(entry)).join(', ');
      continue;
    }

    // Forminator stuurt soms composite velden als JSON-string: '{"first-name":"nico",...}'
    // Probeer te parsen zodat de object-branch hieronder het correct afhandelt.
    let parsedValue = value;
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try { parsedValue = JSON.parse(value); } catch (_) { /* geen geldig JSON — gewoon als string behandelen */ }
    }

    if (parsedValue && typeof parsedValue === 'object') {
      if (Object.prototype.hasOwnProperty.call(parsedValue, 'value')) {
        normalized[key] = normalizeString(parsedValue.value);
      } else if (Array.isArray(parsedValue)) {
        normalized[key] = parsedValue.map((entry) => normalizeString(entry)).join(', ');
      } else {
        // Composite veld (bijv. name-1: {"first-name": "Nico", "last-name": "Plinke"})
        // Samenvoegen van alle niet-lege waarden met een spatie.
        // Subvelden (name-1.fname, name-1.lname) worden OOK afzonderlijk opgenomen.
        const parts = Object.entries(parsedValue)
          .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
          .map(([subKey, v]) => {
            const joined = normalizeString(String(v));
            // Subveld opslaan als key.subKey (bijv. 'name-1.first-name')
            if (joined.length > 0) normalized[key + '.' + subKey] = joined;
            return joined;
          })
          .filter((s) => s.length > 0);
        if (parts.length > 0) normalized[key] = parts.join(' ');
      }
      continue;
    }

    normalized[key] = normalizeString(parsedValue ?? value);
  }

  return normalized;
}

function resolveFormId(payload, normalizedForm) {
  const candidates = [
    payload?.form_id,
    payload?.formId,
    payload?.forminator_form_id,
    payload?.ovme_forminator_id,
    normalizedForm.form_id,
    normalizedForm.formId,
    normalizedForm.ovme_forminator_id,
  ];

  for (const candidate of candidates) {
    const value = normalizeString(candidate);
    if (value) return value;
  }

  // Forminator always sends form_uid like "forminator-custom-form-123" — extract numeric ID
  const formUid = normalizeString(payload?.form_uid || normalizedForm.form_uid);
  if (formUid) {
    const match = formUid.match(/(\d+)$/);
    if (match) return match[1];
  }

  throw createPermanentError('Missing form identifier in webhook payload');
}

function resolveContextValue(contextObject, key) {
  const rawKey = normalizeString(key);
  if (!rawKey) return null;

  if (Object.prototype.hasOwnProperty.call(contextObject, rawKey)) {
    return contextObject[rawKey];
  }

  if (rawKey.startsWith('context.')) {
    const stripped = rawKey.slice('context.'.length);
    if (Object.prototype.hasOwnProperty.call(contextObject, stripped)) {
      return contextObject[stripped];
    }
  }

  return null;
}

function setContextValue(contextObject, key, value) {
  const rawKey = normalizeString(key);
  contextObject[rawKey] = value;

  if (rawKey.startsWith('context.')) {
    contextObject[rawKey.slice('context.'.length)] = value;
  }
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getWebinarExternalField(env) {
  const fromEnv = normalizeString(env?.ODOO_WEBINAR_EXTERNAL_ID_FIELD);
  return fromEnv || 'x_studio_external_id';
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Registers step output into contextObject after a successful target execution.
// Keys written: step.<execution_order>.record_id, step.<label>.record_id (if label set),
// step.<execution_order>.action. Identical structure is used by restoreStepOutputsFromDB.
function registerTargetOutput(contextObject, target, result) {
  const order = target.execution_order ?? target.order_index ?? 0;
  contextObject[`step.${order}.record_id`] = result.recordId || null;
  contextObject[`step.${order}.action`]    = result.action;
  const label = normalizeString(target.label);
  if (label) {
    contextObject[`step.${label}.record_id`] = result.recordId || null;
    contextObject[`step.${label}.action`]    = result.action;
  }
}

// Restores resolver-written context keys from the saved resolved_context JSON.
// Step output keys (step.*) are excluded — those are restored from DB via restoreStepOutputsFromDB.
function restoreResolverContext(resolvedContextJson, contextObject) {
  let saved;
  try {
    saved = typeof resolvedContextJson === 'string'
      ? JSON.parse(resolvedContextJson)
      : (resolvedContextJson && typeof resolvedContextJson === 'object' ? resolvedContextJson : {});
  } catch (_) {
    return; // corrupt resolved_context — skip silently, DB restore is the primary source
  }
  for (const [key, value] of Object.entries(saved)) {
    if (key === 'resolver_logs' || key === 'target_actions' || key.startsWith('step.')) continue;
    contextObject[key] = value;
  }
}

// Restores step output context from fs_v2_submission_targets (primary source for retry).
// Called after restoreResolverContext so that step outputs are available for chained targets.
async function restoreStepOutputsFromDB(env, submissionId, sortedTargets, contextObject) {
  const allResults = await listSubmissionTargetResults(env, submissionId);
  // Sort by execution_order to restore in deterministic order
  const sorted = [...allResults].sort((a, b) => {
    const ao = a.execution_order ?? 0;
    const bo = b.execution_order ?? 0;
    return ao - bo;
  });
  for (const row of sorted) {
    // Only restore results that represent a completed step — not aborted or missing-dependency skips
    if (!['created', 'updated', 'skipped'].includes(row.action_result)) continue;
    if (row.skipped_reason === 'pipeline_abort') continue;
    if (row.skipped_reason === 'dependency_missing') continue;
    const target = sortedTargets.find((t) => t.id === row.target_id);
    if (!target) continue;
    const order = row.execution_order ?? target.execution_order ?? target.order_index ?? 0;
    contextObject[`step.${order}.record_id`] = row.odoo_record_id || null;
    contextObject[`step.${order}.action`]    = row.action_result;
    const label = normalizeString(target.label);
    if (label) {
      contextObject[`step.${label}.record_id`] = row.odoo_record_id || null;
      contextObject[`step.${label}.action`]    = row.action_result;
    }
  }
}

// Checks whether all required previous_step_output mappings have a resolved value.
// Returns { hasMissingDependency: false } or { hasMissingDependency: true, field, sourceValue }.
// Also emits a console warning for previous_step_output mappings missing is_required.
function checkRequiredDependencies(mappings, contextObject, attemptTag) {
  for (const mapping of mappings) {
    if (mapping.source_type !== 'previous_step_output') continue;
    if (!mapping.is_required) {
      console.warn(attemptTag, `[pipeline] WARNING: previous_step_output used without is_required=true on field "${mapping.odoo_field}" (source_value: "${mapping.source_value}")`);
      continue;
    }
    const val = resolveContextValue(contextObject, mapping.source_value);
    if (val === null || val === undefined) {
      return { hasMissingDependency: true, field: mapping.odoo_field, sourceValue: mapping.source_value };
    }
  }
  return { hasMissingDependency: false };
}

// Determines whether a target should be skipped in a retry run based on its last result.
// pipeline_abort and dependency_missing are re-executed; successfully completed steps are not.
function shouldSkipOnRetry(latestResult) {
  if (!latestResult) return false;
  if (!['created', 'updated', 'skipped'].includes(latestResult.action_result)) return false;
  // These special skips must be retried — they did not complete successfully
  if (latestResult.skipped_reason === 'pipeline_abort') return false;
  if (latestResult.skipped_reason === 'dependency_missing') return false;
  return true;
}

async function runResolver(env, resolver, normalizedForm, contextObject, resolverLogs) {
  const resolverType = resolver.resolver_type;
  const inputField = normalizeString(resolver.input_source_field);

  const inputValue = lookupFormValue(normalizedForm, inputField);

  if (!inputValue) {
    throw createPermanentError(`Resolver input missing for ${resolverType}`);
  }

  if (resolverType === 'partner_by_email') {
    const partner = await findRecordByIdentifier(env, {
      model: 'res.partner',
      identifierDomain: [['email', '=', inputValue]],
      fields: ['id']
    });

    if (partner?.id) {
      setContextValue(contextObject, resolver.output_context_key, partner.id);
      resolverLogs.push({ resolver_type: resolverType, action: 'found', input_field: inputField, created: false, record_id: partner.id });
      return;
    }

    if (resolver.create_if_missing === true) {
      const created = await upsertRecordStrict(env, {
        model: 'res.partner',
        identifierDomain: [['email', '=', inputValue]],
        incomingValues: {
          email: inputValue,
          name: normalizeString(normalizedForm.name || normalizedForm.name_1 || normalizedForm.full_name || normalizedForm.full_name_1) || inputValue
        },
        updatePolicy: 'always_overwrite'
      });

      setContextValue(contextObject, resolver.output_context_key, created.recordId);
      resolverLogs.push({ resolver_type: resolverType, action: 'created', input_field: inputField, created: true, record_id: created.recordId });
      return;
    }

    throw createPermanentError('Resolver partner_by_email did not find a partner and create_if_missing is disabled');
  }

  if (resolverType === 'webinar_by_external_id') {
    const externalField = getWebinarExternalField(env);
    const webinar = await findRecordByIdentifier(env, {
      model: 'x_webinar',
      identifierDomain: [[externalField, '=', inputValue]],
      fields: ['id']
    });

    if (!webinar?.id) {
      throw createPermanentError('Resolver webinar_by_external_id did not find a webinar');
    }

    setContextValue(contextObject, resolver.output_context_key, webinar.id);
    resolverLogs.push({ resolver_type: resolverType, action: 'found', input_field: inputField, created: false, record_id: webinar.id });
    return;
  }

  throw createPermanentError(`Unsupported resolver type in MVP: ${resolverType}`);
}

function resolveMappingValue(mapping, normalizedForm, contextObject) {
  if (mapping.source_type === 'form') {
    const raw = lookupFormValue(normalizedForm, mapping.source_value);
    // Pas value_map toe als aanwezig: formulierwaarde → Odoo-waarde.
    // Handig voor keuzevelden (radio/checkbox/select) gekoppeld aan selection- of many2one-velden.
    // Fallback: als de waarde niet in de map staat, wordt de ruwe formulierwaarde gebruikt.
    if (raw && mapping.value_map && typeof mapping.value_map === 'object') {
      if (Object.prototype.hasOwnProperty.call(mapping.value_map, raw)) {
        return mapping.value_map[raw];
      }
    }
    return raw;
  }

  if (mapping.source_type === 'context') {
    return resolveContextValue(contextObject, mapping.source_value);
  }

  if (mapping.source_type === 'static') {
    // Coerce boolean-looking strings so Odoo receives true JS booleans.
    // In Python (Odoo XML-RPC), bool("0") === True — so we must send actual booleans.
    const v = mapping.source_value;
    if (v === 'true'  || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    return v;
  }

  if (mapping.source_type === 'template') {
    // Replace {field_id} placeholders with form values.
    // Use lookupFormValue (not direct key access) so that {email-1} matches form key email_1.
    return (mapping.source_value || '').replace(/\{([^}]+)\}/g, function(_, key) {
      return lookupFormValue(normalizedForm, key);
    });
  }

  // Pipeline chaining: reads step output written by registerTargetOutput of a prior step.
  // Architecturally identical to 'context' — delegates to resolveContextValue.
  if (mapping.source_type === 'previous_step_output') {
    return resolveContextValue(contextObject, mapping.source_value);
  }

  // Feature A (Addendum F, Fase 2): generates an HTML table from submitted form fields.
  // source_value = null / '' → all non-system fields; JSON array → specific field IDs.
  if (mapping.source_type === 'html_form_summary') {
    let fieldIds;
    if (!mapping.source_value) {
      fieldIds = null; // null = ALL fields
    } else {
      try {
        const parsed = JSON.parse(mapping.source_value);
        fieldIds = Array.isArray(parsed) ? parsed : null;
      } catch (_) {
        fieldIds = null; // parse error → all fields
      }
    }
    return buildHtmlFormSummary(fieldIds, normalizedForm);
  }

  return null;
}

function buildIdentifierDomainForTarget(target, mappings, normalizedForm, contextObject) {
  if (target.identifier_type === 'single_email') {
    const emailValue = lookupFormValue(normalizedForm, 'email');
    if (!emailValue) {
      throw createPermanentError('single_email identifier requires form field email');
    }

    const field = target.odoo_model === 'crm.lead' ? 'email_from' : 'email';
    return [[field, '=', emailValue]];
  }

  if (target.identifier_type === 'registration_composite') {
    const partnerContextValue = resolveContextValue(contextObject, 'context.partner_id');
    const webinarContextValue = resolveContextValue(contextObject, 'context.webinar_id');

    const partnerId = parsePositiveInteger(partnerContextValue);
    const webinarId = parsePositiveInteger(webinarContextValue);

    if (!partnerId || !webinarId) {
      throw createPermanentError('registration_composite identifier requires context.partner_id and context.webinar_id');
    }

    const partnerMapping = mappings.find((row) => row.source_type === 'context' && normalizeString(row.source_value) === 'context.partner_id');
    const webinarMapping = mappings.find((row) => row.source_type === 'context' && normalizeString(row.source_value) === 'context.webinar_id');

    if (!partnerMapping || !webinarMapping) {
      throw createPermanentError('registration_composite requires mappings for context.partner_id and context.webinar_id');
    }

    return [
      [partnerMapping.odoo_field, '=', partnerId],
      [webinarMapping.odoo_field, '=', webinarId]
    ];
  }

  if (target.identifier_type === 'mapped_fields') {
    const identifierMappings = mappings.filter((m) => m.is_identifier);
    if (!identifierMappings.length) {
      throw createPermanentError('No identifier fields are marked in this target’s mappings. Mark at least one field as identifier.');
    }
    return identifierMappings.map((m) => {
      const value = resolveMappingValue(m, normalizedForm, contextObject);
      if (!value && value !== 0) {
        const availableKeys = Object.keys(normalizedForm).filter((k) => !['form_id', 'form_uid', 'ovme_forminator_id'].includes(k)).join(', ') || '(geen)';
        throw createPermanentError(
          `Kan Odoo-record niet identificeren: identifierveld "${m.odoo_field}" is gekoppeld aan formulierveld "${m.source_value}", maar dat veld heeft geen waarde in de ingediende data. ` +
          `Beschikbare formuliervelden: ${availableKeys}. ` +
          `Controleer of de veldnaam in de mapping overeenkomt met wat het formulier verstuurt.`
        );
      }
      return [m.odoo_field, '=', value];
    });
  }

  throw createPermanentError(`Unsupported identifier type: ${target.identifier_type}`);
}

function buildIncomingValuesFromMappings(mappings, normalizedForm, contextObject) {
  const values = {};
  for (const mapping of mappings) {
    const resolvedValue = resolveMappingValue(mapping, normalizedForm, contextObject);
    if (resolvedValue !== null && resolvedValue !== undefined) {
      values[mapping.odoo_field] = resolvedValue;
    }
  }
  return values;
}

// Only include fields that are allowed to be written on update (is_update_field !== false)
function buildUpdateValuesFromMappings(mappings, normalizedForm, contextObject) {
  const values = {};
  for (const mapping of mappings) {
    if (mapping.is_update_field === false) continue;
    const resolvedValue = resolveMappingValue(mapping, normalizedForm, contextObject);
    if (resolvedValue !== null && resolvedValue !== undefined) {
      values[mapping.odoo_field] = resolvedValue;
    }
  }
  return values;
}

function classifyFinalSubmissionStatus(targetResults) {
  const failedCount     = targetResults.filter((r) => r.action_result === 'failed').length;
  // pipeline_abort counts as a problem — a step was blocked from running
  const abortCount      = targetResults.filter((r) => r.skipped_reason === 'pipeline_abort').length;

  if (failedCount === 0 && abortCount === 0) return 'success';

  const totalProblematic = failedCount + abortCount;
  if (totalProblematic < targetResults.length) return 'partial_failed';

  // All targets either failed or were aborted — nothing succeeded
  return 'permanent_failed';
}

function isUniqueViolationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('duplicate key value') && message.includes('idempotency');
}

function toHttpResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createHttpError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertWebhookSharedSecret(env, request) {
  const configuredSecret = normalizeString(env?.FORMINATOR_WEBHOOK_SECRET);
  if (!configuredSecret) {
    return toHttpResponse({
      success: false,
      error: 'FORMINATOR_WEBHOOK_SECRET is not configured'
    }, 500);
  }

  // Accept secret from X-Forminator-Secret header OR ?token= query param
  // (WordPress Forminator webhook sends token in URL, not a custom header)
  const headerSecret = normalizeString(request?.headers?.get('X-Forminator-Secret'));
  const url = new URL(request.url);
  const queryToken = normalizeString(url.searchParams.get('token'));

  if (headerSecret === configuredSecret || queryToken === configuredSecret) {
    return null; // authorized
  }

  return toHttpResponse({
    success: false,
    error: 'Unauthorized webhook request'
  }, 401);
}

function canReplaySubmissionStatus(status) {
  return ['partial_failed', 'permanent_failed', 'retry_exhausted'].includes(status);
}

function buildReplayIdempotencyKey(originalSubmissionId) {
  return `replay-${originalSubmissionId}-${crypto.randomUUID()}`;
}

async function scheduleRetryOrExhaust(env, submission, processingError, resolverLogs, contextObject) {
  const now = new Date().toISOString();
  const currentRetryCount = Number(submission.retry_count || 0);
  const nextAttemptNumber = currentRetryCount + 2;
  const maxAttemptsTotal = getMaxAttemptsTotal();

  const nextRetryAt = nextAttemptNumber <= maxAttemptsTotal
    ? computeNextRetryAt(now, nextAttemptNumber)
    : null;

  if (!nextRetryAt) {
    await updateSubmission(env, submission.id, {
      status: 'retry_exhausted',
      retry_status: 'exhausted',
      retry_count: currentRetryCount + 1,
      next_retry_at: null,
      resolved_context: {
        ...contextObject,
        resolver_logs: resolverLogs
      },
      last_error: processingError.message,
      finished_at: now
    });

    return {
      finalStatus: 'retry_exhausted',
      httpStatus: 500,
      success: false,
      message: processingError.message
    };
  }

  await updateSubmission(env, submission.id, {
    status: 'retry_scheduled',
    retry_status: 'scheduled',
    retry_count: currentRetryCount + 1,
    next_retry_at: nextRetryAt,
    resolved_context: {
      ...contextObject,
      resolver_logs: resolverLogs
    },
    last_error: processingError.message,
    finished_at: now
  });

  return {
    finalStatus: 'retry_scheduled',
    httpStatus: 500,
    success: false,
    message: processingError.message,
    nextRetryAt
  };
}

async function runSubmissionAttempt(env, {
  submission,
  integrationBundle,
  rawPayload,
  mode
}) {
  const isRetryAttempt = mode === 'retry';
  const now = new Date().toISOString();
  const normalizedForm = normalizeFormValues(rawPayload);

  const contextObject = {};
  const resolverLogs = [];
  const targetResults = [];

  await updateSubmission(env, submission.id, {
    status: isRetryAttempt ? 'retry_running' : 'running',
    retry_status: isRetryAttempt ? 'running' : null,
    started_at: now,
    finished_at: null
  });

  const attemptTag = '[attempt:' + submission.id.slice(0, 8) + ']';

  // Sort targets by execution_order; fall back to order_index for transitional pre-migration rows.
  const sortedTargets = [...integrationBundle.targets].sort((a, b) => {
    const ao = a.execution_order ?? a.order_index ?? 0;
    const bo = b.execution_order ?? b.order_index ?? 0;
    return ao - bo;
  });

  // Resolvers are required for registration_composite targets (need context values).
  // For mapped_fields targets (contact/lead), resolvers are legacy/optional — failures are non-fatal.
  const needsResolver = sortedTargets.some((t) => t.identifier_type === 'registration_composite');

  try {
    // ── Retry: restore context BEFORE resolver loop and target loop ─────────
    // Primary: step outputs from fs_v2_submission_targets (authoritative).
    // Secondary: resolver context keys from resolved_context (convenience snapshot).
    if (isRetryAttempt) {
      restoreResolverContext(submission.resolved_context, contextObject);
      await restoreStepOutputsFromDB(env, submission.id, sortedTargets, contextObject);
      console.log(attemptTag, '[retry] restored context keys:', Object.keys(contextObject).join(', ') || '(none)');
    }

    for (const resolver of integrationBundle.resolvers) {
      console.log(attemptTag, 'running resolver:', resolver.resolver_type, '| required:', needsResolver);
      try {
        await runResolver(env, resolver, normalizedForm, contextObject, resolverLogs);
        console.log(attemptTag, 'resolver done, contextObject keys:', Object.keys(contextObject).join(', '));
      } catch (resolverError) {
        if (needsResolver) throw resolverError;
        console.log(attemptTag, 'resolver warning (non-fatal):', resolverError.message);
        resolverLogs.push({ resolver_type: resolver.resolver_type, action: 'skipped', error: resolverError.message });
      }
    }

    for (let i = 0; i < sortedTargets.length; i++) {
      const target      = sortedTargets[i];
      const executionOrder = target.execution_order ?? target.order_index ?? i;
      const opType      = target.operation_type || 'upsert';
      const errStrategy = target.error_strategy  || 'allow_partial';

      console.log(attemptTag, 'processing target:', target.id, target.odoo_model, '| op:', opType, '| order:', executionOrder);
      const mappings = await listMappingsByTarget(env, target.id);
      console.log(attemptTag, 'mappings count:', mappings.length);

      // ── Retry skip ─────────────────────────────────────────────────────────
      if (isRetryAttempt) {
        const latestTargetResult = await getLatestSubmissionTargetResultByTarget(env, submission.id, target.id);
        if (shouldSkipOnRetry(latestTargetResult)) {
          console.log(attemptTag, 'retry skip target:', target.id);
          const skipResult = {
            submission_id: submission.id,
            target_id: target.id,
            execution_order: executionOrder,
            action_result: 'skipped',
            skipped_reason: 'retry_skip_already_successful',
            odoo_record_id: latestTargetResult.odoo_record_id || null,
            error_detail: null,
            processed_at: new Date().toISOString()
          };
          await createSubmissionTargetResult(env, skipResult);
          targetResults.push(skipResult);
          continue;
        }
      }

      // ── Dependency pre-flight: required previous_step_output must be present ─
      const depCheck = checkRequiredDependencies(mappings, contextObject, attemptTag);
      if (depCheck.hasMissingDependency) {
        console.log(attemptTag, 'dependency_missing on target:', target.id, '| field:', depCheck.field, '| source:', depCheck.sourceValue);
        const depResult = {
          submission_id: submission.id,
          target_id: target.id,
          execution_order: executionOrder,
          action_result: 'skipped',
          skipped_reason: 'dependency_missing',
          odoo_record_id: null,
          error_detail: `Required previous_step_output "${depCheck.sourceValue}" missing for field "${depCheck.field}"`,
          processed_at: new Date().toISOString()
        };
        await createSubmissionTargetResult(env, depResult);
        targetResults.push(depResult);
        continue;
      }

      // ── create_activity: schedule an Odoo activity on a record from a prior step ─
      if (opType === 'create_activity') {
        try {
          const resIdSource = target.activity_res_id_source;
          if (!resIdSource) {
            throw createPermanentError('create_activity target heeft geen activity_res_id_source. Koppel het aan een vorig stap-record (bijv. \'step.1.record_id\').');
          }
          const rawResId = contextObject[resIdSource];
          const resId = parsePositiveInteger(rawResId);
          if (!resId) {
            throw createPermanentError('create_activity: vorige stap heeft geen geldig record-ID opgeleverd (bron: "' + resIdSource + '", waarde: "' + String(rawResId) + '").');
          }

          const offset = target.activity_deadline_offset != null ? Number(target.activity_deadline_offset) : 1;
          const deadlineDate = new Date();
          deadlineDate.setDate(deadlineDate.getDate() + offset);
          const dateDeadline = deadlineDate.toISOString().slice(0, 10);

          const rawTemplate = (target.activity_summary_template || '').trim();
          const summary = rawTemplate
            ? rawTemplate.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
                return String(lookupFormValue(normalizedForm, key.trim()) || '');
              })
            : null;

          const result = await createActivity(env, {
            resModel:       target.odoo_model,
            resId:          resId,
            activityTypeId: target.activity_type_id || null,
            dateDeadline:   dateDeadline,
            summary:        summary || null,
            userId:         target.activity_user_id || null,
          });

          const targetResult = {
            submission_id:   submission.id,
            target_id:       target.id,
            execution_order: executionOrder,
            action_result:   result.action,
            skipped_reason:  null,
            odoo_record_id:  result.recordId || null,
            error_detail:    null,
            processed_at:    new Date().toISOString()
          };
          await createSubmissionTargetResult(env, targetResult);
          targetResults.push(targetResult);
          registerTargetOutput(contextObject, target, result);
          console.log(attemptTag, 'create_activity done | activity_id:', result.recordId || null);
        } catch (activityError) {
          // Activity failures are non-fatal — they warn but never abort the pipeline.
          const targetResult = {
            submission_id:   submission.id,
            target_id:       target.id,
            execution_order: executionOrder,
            action_result:   'activity_failed',
            skipped_reason:  null,
            odoo_record_id:  null,
            error_detail:    activityError.message,
            processed_at:    new Date().toISOString()
          };
          await createSubmissionTargetResult(env, targetResult);
          targetResults.push(targetResult);
          console.warn(attemptTag, 'create_activity failed (non-fatal):', activityError.message);
        }
        continue;
      }

      // ── chatter_message helpers ────────────────────────────────────────────
      // Wrapper round buildHtmlFormSummary that resolves each field ID through
      // lookupFormValue (fuzzy matching) so that e.g. 'text-1' matches 'text_1'
      // in the normalizedForm, and the label map is preserved.
      function buildChatterSummaryHtml(fieldIds, form, lblMap) {
        if (fieldIds === null) {
          // No specific selection: pass through as-is, filter system keys
          return buildHtmlFormSummary(null, form, lblMap);
        }
        // Specific selection: resolve each ID via lookupFormValue (fuzzy)
        const resolvedForm = {};
        fieldIds.forEach(function(fid) {
          const val = lookupFormValue(form, fid);
          if (val) resolvedForm[fid] = val;
        });
        console.log('[chatter] buildChatterSummaryHtml fieldIds:', JSON.stringify(fieldIds));
        console.log('[chatter] normalizedForm keys:', JSON.stringify(Object.keys(form)));
        console.log('[chatter] resolved keys:', JSON.stringify(Object.keys(resolvedForm)));
        if (!Object.keys(resolvedForm).length) {
          // Fallback: geen enkele field ID matched → toon alles
          console.log('[chatter] FALLBACK: geen matches, toon alle velden');
          return buildHtmlFormSummary(null, form, lblMap);
        }
        return buildHtmlFormSummary(fieldIds, resolvedForm, lblMap);
      }

      // ── chatter_message: post HTML message to Odoo chatter ────────────────
      if (opType === 'chatter_message') {
        try {
          const identifierMapping = mappings.find(function(m) { return m.is_identifier; });
          if (!identifierMapping) {
            throw createPermanentError('chatter_message target heeft geen identifier-mapping (is_identifier=true). Koppel het aan een vorig stap-record via previous_step_output.');
          }
          const rawRecordId = resolveMappingValue(identifierMapping, normalizedForm, contextObject);
          const recordId = parsePositiveInteger(rawRecordId);
          if (!recordId) {
            throw createPermanentError('chatter_message: vorige stap heeft geen geldig record-ID opgeleverd (waarde: "' + String(rawRecordId) + '"). Zorg dat de gelinkte stap is uitgevoerd voor deze stap.');
          }

          const rawTemplate    = (target.chatter_template || '').trim();
          const COMBINED_PREFIX = '__COMBINED__:';
          const SUMMARY_PREFIX  = '__SUMMARY__:';
          let body;
          if (rawTemplate.startsWith(COMBINED_PREFIX)) {
            // New combined format: { message, ids, labels }
            let combinedMsg     = '';
            let summaryFieldIds = null;
            let summaryLabelMap = null;
            try {
              const parsed = JSON.parse(rawTemplate.slice(COMBINED_PREFIX.length));
              combinedMsg     = String(parsed.message || '');
              summaryFieldIds = Array.isArray(parsed.ids) && parsed.ids.length ? parsed.ids : null;
              summaryLabelMap = (parsed.labels && typeof parsed.labels === 'object') ? parsed.labels : null;
            } catch (_e) {}
            const parts = [];
            if (combinedMsg) {
              // combinedMsg is HTML from Quill — substitute {field} placeholders with form values.
              // Do NOT re-escape: Quill already produces safe HTML; only the placeholder
              // substitution values need escaping.
              const isHtml = combinedMsg.trimStart().startsWith('<');
              if (isHtml) {
                const msgHtml = combinedMsg.replace(/\{([^}]+)\}/g, function(_, key) {
                  const v = String(lookupFormValue(normalizedForm, key) || '');
                  return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                });
                parts.push(msgHtml);
              } else {
                // Legacy plain-text fallback
                const msgHtml = combinedMsg
                  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/\{([^}]+)\}/g, function(_, key) {
                    const v = String(lookupFormValue(normalizedForm, key) || '');
                    return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                  })
                  .replace(/\n/g, '<br>');
                parts.push('<p>' + msgHtml + '</p>');
              }
            }
            const summaryHtml = buildChatterSummaryHtml(summaryFieldIds, normalizedForm, summaryLabelMap);
            if (summaryHtml) parts.push(summaryHtml);
            body = parts.join('');
          } else if (rawTemplate.startsWith(SUMMARY_PREFIX)) {
            let summaryFieldIds = null;
            let summaryLabelMap = null;
            try {
              const parsed = JSON.parse(rawTemplate.slice(SUMMARY_PREFIX.length));
              if (Array.isArray(parsed)) {
                summaryFieldIds = parsed.length ? parsed : null;
              } else if (parsed && typeof parsed === 'object') {
                summaryFieldIds = Array.isArray(parsed.ids) && parsed.ids.length ? parsed.ids : null;
                summaryLabelMap = (parsed.labels && typeof parsed.labels === 'object') ? parsed.labels : null;
              }
            } catch (_e) {}
            body = buildChatterSummaryHtml(summaryFieldIds, normalizedForm, summaryLabelMap);
          } else if (rawTemplate) {
            // Plain text template: escape everything, then substitute placeholders with escaped values
            const escapedTpl = rawTemplate
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/\{([^}]+)\}/g, function(_, key) {
                const v = String(lookupFormValue(normalizedForm, key) || '');
                return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              })
              .replace(/\n/g, '<br>');
            body = '<p>' + escapedTpl + '</p>';
          } else {
            body = buildHtmlFormSummary(null, normalizedForm);
          }

          const result = await postChatterMessage(env, {
            model: target.odoo_model,
            recordId: recordId,
            body: body,
            subtypeXmlid: target.chatter_subtype_xmlid || 'mail.mt_note'
          });

          const targetResult = {
            submission_id: submission.id,
            target_id: target.id,
            execution_order: executionOrder,
            action_result: result.action,
            skipped_reason: null,
            odoo_record_id: result.recordId || null,
            error_detail: null,
            processed_at: new Date().toISOString()
          };
          await createSubmissionTargetResult(env, targetResult);
          targetResults.push(targetResult);
          registerTargetOutput(contextObject, target, result);
          console.log(attemptTag, 'chatter_message posted | msg_id:', result.recordId || null);
        } catch (chatterError) {
          const targetResult = {
            submission_id: submission.id,
            target_id: target.id,
            execution_order: executionOrder,
            action_result: 'failed',
            skipped_reason: null,
            odoo_record_id: null,
            error_detail: chatterError.message,
            processed_at: new Date().toISOString()
          };
          await createSubmissionTargetResult(env, targetResult);
          targetResults.push(targetResult);
          console.log(attemptTag, 'chatter_message failed:', chatterError.message);
          if (errStrategy === 'stop_on_error') {
            for (let j = i + 1; j < sortedTargets.length; j++) {
              const abortTarget = sortedTargets[j];
              const abortOrder  = abortTarget.execution_order ?? abortTarget.order_index ?? j;
              const abortResult = {
                submission_id: submission.id,
                target_id: abortTarget.id,
                execution_order: abortOrder,
                action_result: 'skipped',
                skipped_reason: 'pipeline_abort',
                odoo_record_id: null,
                error_detail: 'Pipeline aborted by chatter step ' + executionOrder + ': ' + chatterError.message,
                processed_at: new Date().toISOString()
              };
              await createSubmissionTargetResult(env, abortResult);
              targetResults.push(abortResult);
            }
            break;
          }
        }
        continue;
      }

      // ── Build values ───────────────────────────────────────────────────────
      // 'create' op type never needs an identifier domain.
      let identifierDomain = null;
      if (opType !== 'create') {
        identifierDomain = buildIdentifierDomainForTarget(target, mappings, normalizedForm, contextObject);
      }
      const incomingValues = buildIncomingValuesFromMappings(mappings, normalizedForm, contextObject);
      const updateValues   = buildUpdateValuesFromMappings(mappings, normalizedForm, contextObject);

      // ── Model-specific mandatory field fallbacks ───────────────────────────
      // crm.lead requires 'name' (opportunity title). If not mapped, derive from
      // partner_name, form name fields, or fall back to the form title.
      if (target.odoo_model === 'crm.lead' && !incomingValues.name) {
        const fallback =
          incomingValues.partner_name ||
          lookupFormValue(normalizedForm, 'name') ||
          lookupFormValue(normalizedForm, 'name_1') ||
          lookupFormValue(normalizedForm, 'full_name') ||
          lookupFormValue(normalizedForm, 'full_name_1') ||
          normalizedForm.form_title ||
          'Lead';
        incomingValues.name = fallback;
        if (!updateValues.name) updateValues.name = fallback;
        console.log(attemptTag, '[crm.lead] auto-filled name:', fallback);
      }

      console.log(attemptTag, 'opType:', opType, '| identifierDomain:', JSON.stringify(identifierDomain));
      console.log(attemptTag, 'incomingValues:', JSON.stringify(incomingValues));
      console.log(attemptTag, 'updateValues:', JSON.stringify(updateValues));

      // ── Dispatch on operation_type ─────────────────────────────────────────
      try {
        let result;

        if (opType === 'create') {
          // Always create a new record — never searches for an existing one.
          result = await createRecordOnly(env, {
            model: target.odoo_model,
            values: incomingValues,
            updatePolicy: target.update_policy
          });
        } else if (opType === 'update_only') {
          // Update if found, skip silently if not found — never creates.
          result = await updateOnlyRecord(env, {
            model: target.odoo_model,
            identifierDomain,
            values: updateValues,
            updatePolicy: target.update_policy
          });
        } else {
          // Default: upsert (find-or-create, then update).
          result = await upsertRecordStrict(env, {
            model: target.odoo_model,
            identifierDomain,
            incomingValues,
            updateValues,
            updatePolicy: target.update_policy
          });
        }

        const targetResult = {
          submission_id: submission.id,
          target_id: target.id,
          execution_order: executionOrder,
          action_result: result.action,
          skipped_reason: null,
          odoo_record_id: result.recordId || null,
          error_detail: null,
          processed_at: new Date().toISOString()
        };

        await createSubmissionTargetResult(env, targetResult);
        targetResults.push(targetResult);

        // Write step output into context so downstream targets can use it.
        registerTargetOutput(contextObject, target, result);
        console.log(attemptTag, 'target done:', result.action, '| record_id:', result.recordId || null);

      } catch (targetError) {
        const targetResult = {
          submission_id: submission.id,
          target_id: target.id,
          execution_order: executionOrder,
          action_result: 'failed',
          skipped_reason: null,
          odoo_record_id: null,
          error_detail: targetError.message,
          processed_at: new Date().toISOString()
        };

        await createSubmissionTargetResult(env, targetResult);
        targetResults.push(targetResult);
        console.log(attemptTag, 'target failed:', targetError.message);

        // ── stop_on_error: mark all remaining targets as pipeline_abort ───
        if (errStrategy === 'stop_on_error') {
          console.log(attemptTag, 'stop_on_error triggered — aborting', sortedTargets.length - i - 1, 'remaining targets');
          for (let j = i + 1; j < sortedTargets.length; j++) {
            const abortTarget = sortedTargets[j];
            const abortOrder  = abortTarget.execution_order ?? abortTarget.order_index ?? j;
            const abortResult = {
              submission_id: submission.id,
              target_id: abortTarget.id,
              execution_order: abortOrder,
              action_result: 'skipped',
              skipped_reason: 'pipeline_abort',
              odoo_record_id: null,
              error_detail: `Pipeline aborted by step ${executionOrder}: ${targetError.message}`,
              processed_at: new Date().toISOString()
            };
            await createSubmissionTargetResult(env, abortResult);
            targetResults.push(abortResult);
          }
          break;
        }
      }
    }

    const finalStatus = classifyFinalSubmissionStatus(targetResults);
    await updateSubmission(env, submission.id, {
      status: finalStatus,
      retry_status: finalStatus,
      next_retry_at: null,
      resolved_context: {
        ...contextObject,
        resolver_logs: resolverLogs,
        target_actions: targetResults.map((r) => {
          const t = sortedTargets.find((t) => t.id === r.target_id);
          return {
            model: t?.odoo_model || r.target_id,
            label: t?.label || null,
            execution_order: r.execution_order ?? t?.execution_order ?? null,
            action: r.action_result,
            record_id: r.odoo_record_id || null,
            skipped_reason: r.skipped_reason || null,
            error_detail: r.error_detail || null
          };
        })
      },
      last_error: finalStatus === 'success' ? null : targetResults.find((row) => row.action_result === 'failed')?.error_detail || null,
      finished_at: new Date().toISOString()
    });

    return {
      success: true,
      status: finalStatus
    };
  } catch (error) {
    // Attach any partial target results so the UI can show which steps completed before the error.
    if (targetResults.length > 0 && !contextObject.target_actions) {
      contextObject.target_actions = targetResults.map((r) => {
        const t = sortedTargets.find((t) => t.id === r.target_id);
        return {
          model:           t?.odoo_model || r.target_id,
          label:           t?.label || null,
          execution_order: r.execution_order ?? t?.execution_order ?? null,
          action:          r.action_result,
          record_id:       r.odoo_record_id || null,
          skipped_reason:  r.skipped_reason || null,
          error_detail:    r.error_detail || null
        };
      });
    }

    const failureType = classifyFailureType(error);

    if (failureType === 'recoverable') {
      return scheduleRetryOrExhaust(env, submission, error, resolverLogs, contextObject);
    }

    await updateSubmission(env, submission.id, {
      status: 'permanent_failed',
      retry_status: 'permanent_failed',
      next_retry_at: null,
      resolved_context: {
        ...contextObject,
        resolver_logs: resolverLogs
      },
      last_error: error.message,
      finished_at: new Date().toISOString()
    });

    return {
      success: false,
      status: 'permanent_failed',
      httpStatus: 400,
      message: error.message
    };
  }
}

export async function handleForminatorV2Webhook({ env, request, payload: payloadOverride = null }) {
  const authErrorResponse = assertWebhookSharedSecret(env, request);
  if (authErrorResponse) {
    return authErrorResponse;
  }

  const now = new Date().toISOString();
  let rawPayload = payloadOverride;

  if (!rawPayload) {
    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    try {
      if (contentType.includes('application/json')) {
        rawPayload = await request.json();
      } else if (contentType.includes('form')) {
        const formData = await request.formData();
        rawPayload = {};
        for (const [key, value] of formData.entries()) {
          rawPayload[key] = value;
        }
      } else {
        // Empty body or unknown content-type (e.g. Forminator validation ping)
        rawPayload = {};
      }
    } catch (_) {
      rawPayload = {};
    }
  }

  const normalizedForm = normalizeFormValues(rawPayload);

  // Log every incoming webhook for debugging
  console.log('[webhook] raw payload keys:', Object.keys(rawPayload || {}).join(', ') || '(empty)');
  console.log('[webhook] raw payload:', JSON.stringify(rawPayload).slice(0, 1000));

  // Resolve form ID gracefully — Forminator sends a validation ping with no body
  let formId;
  try {
    formId = resolveFormId(rawPayload, normalizedForm);
  } catch (_) {
    console.log('[webhook] no form_id found in payload — treated as validation ping');
    return toHttpResponse({ success: true, message: 'Webhook received (no form ID in payload)' }, 200);
  }

  console.log('[webhook] resolved form_id:', formId);

  console.log('[webhook] looking up integration for form_id:', formId);
  const integration = await getActiveIntegrationByFormId(env, formId);
  if (!integration) {
    console.log('[webhook] no active integration for form_id:', formId);
    // Return 200 so Forminator does not disable the webhook
    return toHttpResponse({
      success: true,
      message: 'No active integration configured for this form',
      form_id: formId
    }, 200);
  }

  const payloadHash = await computePayloadHash(rawPayload);
  const idempotencyKey = buildIdempotencyKey({
    integrationId: integration.id,
    forminatorFormId: formId,
    payloadHash
  });

  console.log('[webhook] integration found:', integration.id, '| idempotency_key:', idempotencyKey);
  const existing = await getLatestSubmissionByIdempotencyKey(env, integration.id, idempotencyKey);
  const duplicateStatus = classifyDuplicateStatus(existing?.status);
  console.log('[webhook] duplicate check:', duplicateStatus || 'none');

  if (duplicateStatus) {
    return toHttpResponse({
      success: true,
      data: {
        submission_id: existing?.id || null,
        status: duplicateStatus
      }
    });
  }

  let submission;
  try {
    submission = await createSubmission(env, {
      integration_id: integration.id,
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      source_payload: rawPayload,
      resolved_context: {},
      status: 'running',
      retry_count: 0,
      retry_status: null,
      next_retry_at: null,
      replay_of_submission_id: null,
      started_at: now,
      finished_at: null,
      created_at: now
    });
  } catch (insertError) {
    if (!isUniqueViolationError(insertError)) {
      throw insertError;
    }

    const current = await getLatestSubmissionByIdempotencyKey(env, integration.id, idempotencyKey);
    const conflictStatus = classifyDuplicateStatus(current?.status) || 'duplicate_ignored';

    return toHttpResponse({
      success: true,
      data: {
        submission_id: current?.id || null,
        status: conflictStatus
      }
    });
  }

  const firstRunning = await getFirstRunningSubmissionByIdempotencyKey(env, integration.id, idempotencyKey);
  if (firstRunning && firstRunning.id !== submission.id) {
    submission = await updateSubmission(env, submission.id, {
      status: 'duplicate_inflight',
      retry_status: null,
      finished_at: new Date().toISOString(),
      last_error: 'Duplicate inflight request detected'
    });

    return toHttpResponse({
      success: true,
      data: {
        submission_id: submission.id,
        status: 'duplicate_inflight'
      }
    });
  }

  console.log('[webhook] fetching integration bundle...');
  const integrationBundle = await getIntegrationBundle(env, integration.id);
  if (!integrationBundle) {
    throw createPermanentError('Integration bundle not found for active integration');
  }
  console.log('[webhook] starting runSubmissionAttempt | submission:', submission.id, '| integration:', integration.name || integration.id);

  const result = await runSubmissionAttempt(env, {
    submission,
    integrationBundle,
    rawPayload,
    mode: 'initial'
  });

  if (result.success) {
    return toHttpResponse({
      success: true,
      data: {
        submission_id: submission.id,
        status: result.status
      }
    });
  }

  return toHttpResponse({
    success: false,
    error: result.message || 'Submission failed',
    data: {
      submission_id: submission.id,
      status: result.finalStatus || result.status,
      next_retry_at: result.nextRetryAt || null
    }
  }, result.httpStatus || 500);
}

export async function replaySubmission(env, originalSubmissionId) {
  const originalSubmission = await getSubmissionById(env, originalSubmissionId);
  if (!originalSubmission) {
    throw createHttpError('Submission not found', 'NOT_FOUND');
  }

  if (!canReplaySubmissionStatus(originalSubmission.status)) {
    throw createHttpError(`Replay not allowed for status: ${originalSubmission.status}`, 'VALIDATION_ERROR');
  }

  const runningReplay = await getRunningReplayByOriginalSubmissionId(env, originalSubmissionId);
  if (runningReplay) {
    throw createHttpError('Replay already running for this submission', 'VALIDATION_ERROR');
  }

  const integrationBundle = await getIntegrationBundle(env, originalSubmission.integration_id);
  if (!integrationBundle) {
    throw createHttpError('Integration bundle not found for submission', 'NOT_FOUND');
  }

  const now = new Date().toISOString();
  const sourcePayload = originalSubmission.source_payload || {};
  const payloadHash = await computePayloadHash(sourcePayload);

  const replaySubmissionRecord = await createSubmission(env, {
    integration_id: originalSubmission.integration_id,
    idempotency_key: buildReplayIdempotencyKey(originalSubmission.id),
    payload_hash: payloadHash,
    source_payload: sourcePayload,
    resolved_context: {},
    status: 'running',
    retry_count: 0,
    retry_status: null,
    next_retry_at: null,
    replay_of_submission_id: originalSubmission.id,
    started_at: now,
    finished_at: null,
    created_at: now
  });

  const result = await runSubmissionAttempt(env, {
    submission: replaySubmissionRecord,
    integrationBundle,
    rawPayload: sourcePayload,
    mode: 'initial'
  });

  return {
    replay_submission_id: replaySubmissionRecord.id,
    replay_of_submission_id: originalSubmission.id,
    status: result.finalStatus || result.status || 'unknown',
    next_retry_at: result.nextRetryAt || null,
    success: Boolean(result.success)
  };
}

export async function processDueRetries(env, limit = 10) {
  const now = new Date().toISOString();
  const dueSubmissions = await listDueRetrySubmissions(env, now, limit);
  const results = [];

  for (const submission of dueSubmissions) {
    const claimed = await transitionSubmissionStatus(env, submission.id, ['retry_scheduled'], {
      status: 'retry_running',
      retry_status: 'running',
      started_at: new Date().toISOString(),
      finished_at: null
    });

    if (!claimed) {
      results.push({ submission_id: submission.id, status: 'skip_locked' });
      continue;
    }

    const integrationBundle = await getIntegrationBundle(env, claimed.integration_id);
    if (!integrationBundle) {
      await updateSubmission(env, claimed.id, {
        status: 'permanent_failed',
        retry_status: 'permanent_failed',
        next_retry_at: null,
        last_error: 'Integration bundle not found during retry run',
        finished_at: new Date().toISOString()
      });

      results.push({ submission_id: claimed.id, status: 'permanent_failed' });
      continue;
    }

    const result = await runSubmissionAttempt(env, {
      submission: claimed,
      integrationBundle,
      rawPayload: claimed.source_payload || {},
      mode: 'retry'
    });

    results.push({
      submission_id: claimed.id,
      status: result.finalStatus || result.status || 'unknown',
      next_retry_at: result.nextRetryAt || null
    });
  }

  return {
    processed: results.length,
    results
  };
}
