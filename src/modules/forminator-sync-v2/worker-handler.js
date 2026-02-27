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
  transitionSubmissionStatus,
  updateSubmission
} from './database.js';
import {
  buildIdempotencyKey,
  classifyDuplicateStatus,
  computePayloadHash
} from './idempotency.js';
import { classifyFailureType, computeNextRetryAt, getMaxAttemptsTotal } from './retry.js';
import { findRecordByIdentifier, upsertRecordStrict } from './odoo-client.js';

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

    if (value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'value')) {
        normalized[key] = normalizeString(value.value);
      }
      continue;
    }

    normalized[key] = normalizeString(value);
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
    return lookupFormValue(normalizedForm, mapping.source_value);
  }

  if (mapping.source_type === 'context') {
    return resolveContextValue(contextObject, mapping.source_value);
  }

  if (mapping.source_type === 'static') {
    return mapping.source_value;
  }

  if (mapping.source_type === 'template') {
    // Replace {field_id} placeholders with form values
    return (mapping.source_value || '').replace(/\{([^}]+)\}/g, function(_, key) {
      return normalizeString(normalizedForm[key]);
    });
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
  const failedCount = targetResults.filter((row) => row.action_result === 'failed').length;

  if (failedCount === 0) {
    return 'success';
  }

  if (failedCount < targetResults.length) {
    return 'partial_failed';
  }

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

  // Resolvers are required for registration_composite targets (need context values).
  // For mapped_fields targets (contact/lead), resolvers are legacy/optional — failures are non-fatal.
  const needsResolver = integrationBundle.targets.some((t) => t.identifier_type === 'registration_composite');

  try {
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

    for (const target of integrationBundle.targets) {
      console.log(attemptTag, 'processing target:', target.id, target.odoo_model);
      const mappings = await listMappingsByTarget(env, target.id);
      console.log(attemptTag, 'mappings count:', mappings.length);

      if (isRetryAttempt) {
        const latestTargetResult = await getLatestSubmissionTargetResultByTarget(env, submission.id, target.id);
        if (latestTargetResult && ['created', 'updated', 'skipped'].includes(latestTargetResult.action_result)) {
          const skipResult = {
            submission_id: submission.id,
            target_id: target.id,
            action_result: 'skipped',
            odoo_record_id: latestTargetResult.odoo_record_id || null,
            error_detail: 'retry_skip_already_successful',
            processed_at: new Date().toISOString()
          };

          await createSubmissionTargetResult(env, skipResult);
          targetResults.push(skipResult);
          continue;
        }
      }

      const identifierDomain = buildIdentifierDomainForTarget(target, mappings, normalizedForm, contextObject);
      const incomingValues = buildIncomingValuesFromMappings(mappings, normalizedForm, contextObject);
      const updateValues   = buildUpdateValuesFromMappings(mappings, normalizedForm, contextObject);
      console.log(attemptTag, 'identifierDomain:', JSON.stringify(identifierDomain));
      console.log(attemptTag, 'incomingValues (create):', JSON.stringify(incomingValues));
      console.log(attemptTag, 'updateValues (update):', JSON.stringify(updateValues));

      try {
        const result = await upsertRecordStrict(env, {
          model: target.odoo_model,
          identifierDomain,
          incomingValues,
          updateValues,
          updatePolicy: target.update_policy
        });

        const targetResult = {
          submission_id: submission.id,
          target_id: target.id,
          action_result: result.action,
          odoo_record_id: result.recordId || null,
          error_detail: null,
          processed_at: new Date().toISOString()
        };

        await createSubmissionTargetResult(env, targetResult);
        targetResults.push(targetResult);
      } catch (targetError) {
        const targetResult = {
          submission_id: submission.id,
          target_id: target.id,
          action_result: 'failed',
          odoo_record_id: null,
          error_detail: targetError.message,
          processed_at: new Date().toISOString()
        };

        await createSubmissionTargetResult(env, targetResult);
        targetResults.push(targetResult);
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
        target_actions: targetResults.map((r) => ({
          model: integrationBundle.targets.find((t) => t.id === r.target_id)?.odoo_model || r.target_id,
          action: r.action_result,
          record_id: r.odoo_record_id || null
        }))
      },
      last_error: finalStatus === 'success' ? null : targetResults.find((row) => row.action_result === 'failed')?.error_detail || null,
      finished_at: new Date().toISOString()
    });

    return {
      success: true,
      status: finalStatus
    };
  } catch (error) {
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
