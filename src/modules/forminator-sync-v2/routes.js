import { executeKw } from '../../lib/odoo.js';
import { fetchFsv2ActivityTypes, fetchFsv2OdooUsers } from './odoo-client.js';
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
  deleteSubmission,
  cleanupFailedReplays,
  upsertFieldMeta,
  listWpConnections,
  getWpConnectionById,
  createWpConnection,
  deleteWpConnection,
  getModelDefaults,
  updateModelDefaultFields,
  updateModelFixedFields,
  updateModelIdentifierFields,
  getModelLinks,
  upsertModelLinks,
  getOdooModels,
  upsertOdooModels,
  getIntegrationById,
  listFieldTransforms,
  upsertFieldTransform,
  deleteFieldTransform,
  getIntegrationWarnings,
} from './database.js';
import { fetchOpenVmeForminatorForms, fetchForminatorFormsBasicAuth } from '../../lib/wordpress.js';
import {
  getMvpConstants,
  validateResolverPayload,
  validateTargetPayload,
  validateMappingPayload,
} from './validation.js';
import { handleForminatorV2Webhook, handleGenericWebhook, processDueRetries, replaySubmission } from './worker-handler.js';

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

function normalizeImportText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeImportPhone(value) {
  const raw = normalizeImportText(value);
  if (!raw) return '';
  return raw.replace(/[^\d+]/g, '');
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach((item) => {
    const key = normalizeImportText(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

function getOrderedValueMapKeys(transform) {
  const valueMap = transform && transform.value_map && typeof transform.value_map === 'object'
    ? transform.value_map
    : null;
  if (!valueMap) return [];

  const storedOrder = normalizeStringArray(transform && transform.value_map_order);
  const mapKeys = Object.keys(valueMap).filter((key) => key !== '__catchall__');
  if (!storedOrder.length) return mapKeys;

  const keySet = new Set(mapKeys);
  const ordered = [];
  storedOrder.forEach((key) => {
    if (!keySet.has(key)) return;
    ordered.push(key);
    keySet.delete(key);
  });
  mapKeys.forEach((key) => {
    if (keySet.has(key)) ordered.push(key);
  });
  return ordered;
}

function normalizeImportChannel(value) {
  const channel = normalizeImportText(value).toLowerCase();
  if (!channel) return 'mail';
  if (channel.includes('mail')) return 'mail';
  if (channel.includes('phone') || channel.includes('telefoon') || channel.includes('call')) return 'phone';
  if (channel.includes('whatsapp') || channel.includes('whats app')) return 'whatsapp';
  return channel;
}

function parseExcelSerialDate(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Excel serial epoch handling (with 1900 leap-year bug adjustment via 25569 offset)
  const millis = Math.round((num - 25569) * 86400 * 1000);
  const d = new Date(millis);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseFlexibleDateToIso(value) {
  if (value === undefined || value === null || value === '') return '';

  // Numeric Excel serial
  if (typeof value === 'number') {
    const excelIso = parseExcelSerialDate(value);
    if (excelIso) return excelIso;
  }

  const raw = normalizeImportText(value);
  if (!raw) return '';

  // Numeric string Excel serial
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const excelIso = parseExcelSerialDate(Number(raw));
    if (excelIso) return excelIso;
  }

  // Existing legacy parser first (supports MM/DD/YYYY h:mmam)
  const legacyIso = parseMetaCreatedAt(raw);
  if (legacyIso) return legacyIso;

  // DD/MM/YYYY [HH:mm]
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const d = new Date(year, month - 1, day, hour, minute, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD [HH:mm[:ss]]
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const second = Number(m[6] || 0);
    const d = new Date(year, month - 1, day, hour, minute, second);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();

  return null;
}

function isLikelyDateField(fieldName) {
  const k = String(fieldName || '').toLowerCase();
  return k.includes('date') || k.includes('datum') || k.includes('time') || k.includes('tijd') || k.includes('created_at') || k.includes('created_time') || k === 'gemaakt op';
}

function isLikelyEmailField(fieldName) {
  const k = String(fieldName || '').toLowerCase();
  return k.includes('email') || k.includes('mail');
}

function isLikelyPhoneField(fieldName) {
  const k = String(fieldName || '').toLowerCase();
  return k.includes('phone') || k.includes('telefoon') || k.includes('gsm') || k.includes('mobile') || k.includes('whatsapp');
}

function isLikelyContactField(fieldName) {
  const k = String(fieldName || '').toLowerCase();
  return k === 'contact' || k === 'raw_contact' || k === 'kanaal';
}

function isLikelyPlatformField(fieldName) {
  const k = String(fieldName || '').toLowerCase();
  return k === 'platform' || k === 'raw_platform' || k === 'bron';
}

function normalizePlatformValue(value) {
  const raw = normalizeImportText(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'betaald' || raw === 'paid') return 'fb';
  if (raw === 'organisch' || raw === 'organic') return 'fb';
  if (raw === 'facebook' || raw === 'fb') return 'fb';
  if (raw === 'instagram' || raw === 'ig') return 'ig';
  if (raw === 'linkedin' || raw === 'li') return 'li';
  if (raw === 'google') return 'google';
  return raw;
}

function normalizeFieldValueByType(fieldName, value) {
  if (value === undefined || value === null || value === '') return '';

  if (isLikelyDateField(fieldName)) {
    const iso = parseFlexibleDateToIso(value);
    if (iso === null) {
      const err = new Error('Ongeldige datum/tijd voor veld "' + fieldName + '". Gebruik bv. 2026-05-22 07:46, 22/05/2026 07:46 of Excel datum.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    return iso;
  }

  if (isLikelyEmailField(fieldName)) {
    return normalizeImportText(value).toLowerCase();
  }

  if (isLikelyPhoneField(fieldName)) {
    return normalizeImportPhone(value);
  }

  if (isLikelyContactField(fieldName)) {
    return normalizeImportChannel(value);
  }

  if (isLikelyPlatformField(fieldName)) {
    return normalizePlatformValue(value);
  }

  return normalizeImportText(value);
}

function parseMetaCreatedAt(value) {
  const raw = normalizeImportText(value);
  if (!raw) return null;

  // Meta export uses format like "05/31/2026 9:58am"
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    let hour = Number(match[4]);
    const minute = Number(match[5]);
    const ampm = String(match[6]).toLowerCase();

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const dt = new Date(year, month - 1, day, hour, minute, 0);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString();
    }
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString();
  }

  return null;
}

function buildMetaLeadPayload(row, integration) {
  const name = normalizeImportText(row['Naam'] || row.name || row.full_name);
  const email = normalizeImportText(row['E-mailadres'] || row.email || row.raw_email).toLowerCase();
  const phone = normalizeImportPhone(
    row['Telefoonnummer'] || row['WhatsApp-nummer'] || row['Secundair telefoonnummer'] || row.phone_number || row.raw_phone_number
  );
  const channel = normalizeImportChannel(row['Kanaal'] || row.contact || row.raw_contact || 'mail');
  const formName = normalizeImportText(row['Formulier'] || row.form_name);
  const createdAtIso = parseMetaCreatedAt(row['Gemaakt op'] || row.created_time);
  const sourceLabel = normalizeImportText(row['Bron'] || row.source || '').toLowerCase();
  const platform = sourceLabel.includes('betaald') ? 'fb' : normalizeImportText(row.platform || row.raw_platform || 'fb').toLowerCase();

  // Deterministic fingerprint used for repeated CSV imports.
  const importFingerprint = [
    integration.id,
    email || '-',
    phone || '-',
    normalizeImportText(formName).toLowerCase() || '-',
    createdAtIso ? createdAtIso.slice(0, 16) : '-'
  ].join('|');

  return {
    full_name: name,
    raw_full_name: name,
    email,
    raw_email: email,
    phone_number: phone,
    raw_phone_number: phone,
    contact: channel,
    raw_contact: channel,
    form_id: integration.forminator_form_id,
    form_name: formName,
    platform,
    raw_platform: platform,
    created_time: createdAtIso || new Date().toISOString(),
    imported_from: 'meta_leads_csv',
    import_fingerprint: importFingerprint,
    meta_export_row: row,
  };
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function extractExpectedImportFields(bundle) {
  const fields = [];
  const seen = new Set();

  function addField(field) {
    const key = normalizeImportText(field);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push(key);
  }

  const resolvers = Array.isArray(bundle?.resolvers) ? bundle.resolvers : [];
  resolvers.forEach((resolver) => {
    addField(resolver?.input_source_field);
  });

  const targets = Array.isArray(bundle?.targets) ? bundle.targets : [];
  const mappingsByTarget = bundle?.mappingsByTarget || {};
  targets.forEach((target) => {
    const targetMappings = Array.isArray(mappingsByTarget[target.id]) ? mappingsByTarget[target.id] : [];
    targetMappings.forEach((mapping) => {
      if (mapping?.source_type === 'form') addField(mapping?.source_value);
    });
    addField(target?.condition_field);
  });

  // Always allow common webhook keys as fallback for all integrations.
  ['full_name', 'email', 'phone_number', 'contact', 'form_name', 'created_time'].forEach(addField);

  return fields;
}

function buildPayloadFromConnectionTemplateRow(row, integration, expectedFields) {
  const source = (row && typeof row === 'object') ? row : {};
  const payload = {};
  let hasExpectedValue = false;

  expectedFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(source, field)) return;
    const value = source[field];
    const normalized = normalizeFieldValueByType(field, value);
    if (normalized) hasExpectedValue = true;
    payload[field] = normalized;
  });

  if (!hasExpectedValue) {
    // No integration-specific fields provided: treat as Meta export row.
    return buildMetaLeadPayload(source, integration);
  }

  if (!payload.form_id) payload.form_id = integration.forminator_form_id;
  if (!payload.form_name) payload.form_name = normalizeImportText(source.form_name || integration.name || '');
  if (!payload.created_time) {
    const createdValue = source['Gemaakt op'] || source.created_time;
    const createdIso = parseFlexibleDateToIso(createdValue);
    payload.created_time = createdIso || new Date().toISOString();
  }
  if (!payload.raw_email && payload.email) payload.raw_email = payload.email;
  if (!payload.raw_full_name && payload.full_name) payload.raw_full_name = payload.full_name;
  if (!payload.raw_phone_number && payload.phone_number) payload.raw_phone_number = payload.phone_number;
  if (!payload.raw_contact && payload.contact) payload.raw_contact = payload.contact;

  return payload;
}

function buildImportSignature(payload) {
  var source = payload;
  if (!source) return '';
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return '';
    }
  }
  if (typeof source !== 'object') return '';

  const email = normalizeImportText(source.email || source.raw_email).toLowerCase();
  const phone = normalizeImportPhone(source.phone_number || source.raw_phone_number);
  const formName = normalizeImportText(source.form_name || source.Formulier).toLowerCase();
  const created = normalizeImportText(source.created_time || source['Gemaakt op']);
  const createdMinute = created ? created.slice(0, 16) : '';
  const fingerprint = normalizeImportText(source.import_fingerprint);
  const baseSignature = [email || '-', phone || '-', formName || '-', createdMinute || '-', fingerprint || '-'].join('|');
  if (baseSignature !== '-|-|-|-|-') return baseSignature;

  const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
  return keys.map((k) => k + '=' + normalizeImportText(source[k])).join('|');
}

const META_TEMPLATE_COLUMNS = [
  'Gemaakt op',
  'Naam',
  'E-mailadres',
  'Bron',
  'Formulier',
  'Kanaal',
  'Fase',
  'Eigenaar',
  'Labels',
  'Telefoonnummer',
  'Secundair telefoonnummer',
  'WhatsApp-nummer'
];

const META_TEMPLATE_DROPDOWNS = {
  'Bron': ['Betaald', 'Organisch'],
  'Kanaal': ['E-mail', 'Telefoon', 'WhatsApp'],
  'Fase': ['Instroom', 'Nieuw', 'Contact gelegd', 'Gekwalificeerd'],
  'Eigenaar': ['Unassigned']
};

function toTemplateRowFromPayload(payload, integration, expectedFields) {
  var source = payload;
  if (!source) source = {};
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }

  const createdIso = normalizeImportText(source.created_time);
  let createdFormatted = '';
  if (createdIso) {
    const d = new Date(createdIso);
    if (!Number.isNaN(d.getTime())) {
      createdFormatted = d.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).toLowerCase().replace(' ', '');
    }
  }

  const normalizedRow = {};
  expectedFields.forEach((col) => {
    normalizedRow[col] = normalizeImportText(source[col]);
  });

  // Backfill common aliases when expected keys are present.
  if (Object.prototype.hasOwnProperty.call(normalizedRow, 'full_name') && !normalizedRow.full_name) {
    normalizedRow.full_name = normalizeImportText(source.full_name || source.raw_full_name);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedRow, 'email') && !normalizedRow.email) {
    normalizedRow.email = normalizeImportText(source.email || source.raw_email);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedRow, 'phone_number') && !normalizedRow.phone_number) {
    normalizedRow.phone_number = normalizeImportText(source.phone_number || source.raw_phone_number);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedRow, 'form_name') && !normalizedRow.form_name) {
    normalizedRow.form_name = normalizeImportText(source.form_name || integration?.name || '');
  }
  if (Object.prototype.hasOwnProperty.call(normalizedRow, 'created_time') && !normalizedRow.created_time) {
    normalizedRow.created_time = createdFormatted || normalizeImportText(source.created_time);
  }

  return normalizedRow;
}

function buildTemplateDropdowns(expectedFields, fieldTransforms = {}) {
  const result = {};

  function addOption(field, value, label) {
    if (!result[field]) result[field] = [];
    const list = result[field];
    const valueKey = String(value);
    const exists = list.some((item) => {
      if (item && typeof item === 'object') return String(item.value || '') === valueKey;
      return String(item) === valueKey;
    });
    if (exists) return;
    list.push({ value: valueKey, label: label || valueKey });
  }

  expectedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(META_TEMPLATE_DROPDOWNS, field)) {
      META_TEMPLATE_DROPDOWNS[field].forEach((opt) => addOption(field, opt, opt));
    }
  });

  expectedFields.forEach((field) => {
    const transform = fieldTransforms[field];
    const valueMap = transform && transform.value_map && typeof transform.value_map === 'object'
      ? transform.value_map
      : null;
    if (!valueMap) return;

    getOrderedValueMapKeys(transform).forEach((key) => {
      addOption(field, key, key + ' -> ' + String(valueMap[key]));
    });
  });

  if (expectedFields.includes('contact') && !result.contact) {
    ['mail', 'phone', 'whatsapp'].forEach((opt) => addOption('contact', opt, opt));
  }
  if (expectedFields.includes('platform') && !result.platform) {
    ['fb', 'ig', 'li', 'google'].forEach((opt) => addOption('platform', opt, opt));
  }
  if (expectedFields.includes('raw_platform') && !result.raw_platform) {
    ['fb', 'ig', 'li', 'google', 'facebook', 'instagram'].forEach((opt) => addOption('raw_platform', opt, opt));
  }
  return result;
}

function buildTemplateInputRules(expectedFields) {
  const rules = {};
  expectedFields.forEach((field) => {
    if (isLikelyDateField(field)) {
      rules[field] = {
        type: 'datetime',
        accepted: [
          '2026-05-22 07:46',
          '22/05/2026 07:46',
          '05/22/2026 7:46am',
          'Excel datum/tijd cel'
        ]
      };
      return;
    }
    if (isLikelyEmailField(field)) {
      rules[field] = { type: 'email' };
      return;
    }
    if (isLikelyPhoneField(field)) {
      rules[field] = { type: 'phone' };
      return;
    }
    if (isLikelyContactField(field)) {
      rules[field] = { type: 'enum', accepted: ['mail', 'phone', 'whatsapp'] };
      return;
    }
    if (isLikelyPlatformField(field)) {
      rules[field] = { type: 'enum', accepted: ['fb', 'ig', 'li', 'google'] };
      return;
    }
    rules[field] = { type: 'text' };
  });
  return rules;
}

async function enforceMvpLimitsOnResolvers(env, integrationId) {
  const resolvers = await listResolversByIntegration(env, integrationId);
  if (resolvers.length >= 2) {
    const error = new Error('MVP allows maximum two herkenningen per integratie');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

async function enforceMvpLimitsOnTargets(_env, _integrationId) {
  // No hard limit on number of targets
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
    return context.env.ASSETS.fetch(
      new Request(new URL('/forminator-sync-v2.html', context.request.url))
    );
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

  'GET /api/integrations/warnings': async (context) => {
    try {
      const warnings = await getIntegrationWarnings(context.env);
      return jsonResponse({ success: true, data: warnings });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/integrations': async (context) => {
    try {
      const payload = await readJsonBody(context.request);

      // For generic/Zapier webhook integrations: generate unique token + synthetic form ID
      if (payload.source_type === 'generic_webhook') {
        const tokenBytes = new Uint8Array(24);
        crypto.getRandomValues(tokenBytes);
        payload.webhook_token = btoa(String.fromCharCode(...tokenBytes))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        payload.forminator_form_id = 'generic-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      }

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
      const storedModels = await getOdooModels(context.env);
      // Allow both slug name and technical Odoo model name
      const allowedModels = storedModels.flatMap(m => [
        m.name,
        ...(m.odoo_model && m.odoo_model !== m.name ? [m.odoo_model] : []),
      ]);
      validateTargetPayload(payload, { allowedModels });

      const created = await createTarget(context.env, {
        integration_id: integrationId,
        order_index: Number(payload.order_index || 0),
        odoo_model: payload.odoo_model,
        identifier_type: payload.identifier_type,
        update_policy: payload.update_policy,
        operation_type: payload.operation_type || 'upsert',
        is_enabled: true,
        ...(payload.execution_order !== undefined ? { execution_order: Number(payload.execution_order) } : {}),
        ...(payload.chatter_template !== undefined ? { chatter_template: payload.chatter_template || null } : {}),
        ...(payload.chatter_subtype_xmlid !== undefined ? { chatter_subtype_xmlid: payload.chatter_subtype_xmlid || 'mail.mt_note' } : {}),
        ...(payload.activity_type_id         !== undefined ? { activity_type_id:         payload.activity_type_id         || null  } : {}),
        ...(payload.activity_deadline_offset !== undefined ? { activity_deadline_offset: Number(payload.activity_deadline_offset) || 1 } : {}),
        ...(payload.activity_summary_template !== undefined ? { activity_summary_template: payload.activity_summary_template || null } : {}),
        ...(payload.activity_user_id         !== undefined ? { activity_user_id:         payload.activity_user_id         || null  } : {}),
        ...(payload.activity_res_id_source   !== undefined ? { activity_res_id_source:   payload.activity_res_id_source   || null  } : {}),
        ...(payload.activity_user_mode       !== undefined ? { activity_user_mode:       payload.activity_user_mode       || 'fixed' } : {}),
        ...(payload.activity_user_pool       !== undefined ? { activity_user_pool:       Array.isArray(payload.activity_user_pool) ? payload.activity_user_pool : null } : {}),
        ...(payload.label            !== undefined ? { label:            payload.label            || null } : {}),
        ...(payload.condition_field  !== undefined ? { condition_field:  payload.condition_field  || null } : {}),
        ...(payload.condition_values !== undefined ? { condition_values: Array.isArray(payload.condition_values) && payload.condition_values.length ? payload.condition_values : null } : {}),
        ...(payload.identifier_field !== undefined ? { identifier_field: payload.identifier_field || null } : {}),
      });

      return jsonResponse({ success: true, data: created }, 201);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/integrations/:id/targets/:targetId': async (context) => {
    try {
      const payload = await readJsonBody(context.request);
      const storedModels = await getOdooModels(context.env);
      const allowedModels = storedModels.map(m => m.name);
      validateTargetPayload(payload, { allowedModels });

      const updated = await updateTarget(context.env, context.params?.targetId, {
        order_index: Number(payload.order_index || 0),
        odoo_model: payload.odoo_model,
        identifier_type: payload.identifier_type,
        update_policy: payload.update_policy,
        operation_type: payload.operation_type || 'upsert',
        is_enabled: payload.is_enabled !== false,
        ...(payload.execution_order !== undefined ? { execution_order: payload.execution_order === null ? null : Number(payload.execution_order) } : {}),
        ...(payload.chatter_template !== undefined ? { chatter_template: payload.chatter_template || null } : {}),
        ...(payload.chatter_subtype_xmlid !== undefined ? { chatter_subtype_xmlid: payload.chatter_subtype_xmlid || 'mail.mt_note' } : {}),
        ...(payload.activity_type_id         !== undefined ? { activity_type_id:         payload.activity_type_id         || null  } : {}),
        ...(payload.activity_deadline_offset !== undefined ? { activity_deadline_offset: Number(payload.activity_deadline_offset) || 1 } : {}),
        ...(payload.activity_summary_template !== undefined ? { activity_summary_template: payload.activity_summary_template || null } : {}),
        ...(payload.activity_user_id         !== undefined ? { activity_user_id:         payload.activity_user_id         || null  } : {}),
        ...(payload.activity_res_id_source   !== undefined ? { activity_res_id_source:   payload.activity_res_id_source   || null  } : {}),
        ...(payload.activity_user_mode       !== undefined ? { activity_user_mode:       payload.activity_user_mode       || 'fixed' } : {}),
        ...(payload.activity_user_pool       !== undefined ? { activity_user_pool:       Array.isArray(payload.activity_user_pool) ? payload.activity_user_pool : null } : {}),
        ...(payload.condition_field  !== undefined ? { condition_field:  payload.condition_field  || null } : {}),
        ...(payload.condition_values !== undefined ? { condition_values: Array.isArray(payload.condition_values) && payload.condition_values.length ? payload.condition_values : null } : {}),
      });

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
        is_update_field: payload.is_update_field !== false,
        value_map: (payload.value_map && typeof payload.value_map === 'object' && !Array.isArray(payload.value_map))
          ? payload.value_map
          : null,
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
        is_update_field: payload.is_update_field !== false,
        value_map: (payload.value_map && typeof payload.value_map === 'object' && !Array.isArray(payload.value_map))
          ? payload.value_map
          : null,
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

  'POST /api/integrations/:id/import-meta-leads': async (context) => {
    try {
      const MAX_ROWS_PER_INVOCATION = 5;
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const integration = await getIntegrationById(context.env, integrationId);
      if (!integration) {
        return jsonResponse({ success: false, error: 'Integration not found' }, 404);
      }

      const payload = await readJsonBody(context.request);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const maxRows = Math.min(Math.max(Number(payload?.max_rows || MAX_ROWS_PER_INVOCATION), 1), MAX_ROWS_PER_INVOCATION);
      const boundedRows = rows.slice(0, maxRows);
      if (boundedRows.length === 0) {
        return jsonResponse({ success: false, error: 'rows array is required' }, 400);
      }

      const runWhenInactive = payload?.run_when_inactive === true;
      const skipPipeline = !integration.is_active && !runWhenInactive;
      const integrationBundle = await getIntegrationDetails(context.env, integrationId);
      const expectedFields = extractExpectedImportFields(integrationBundle || {});

      const existingSubmissions = await listSubmissionsByIntegration(context.env, integrationId, 5000);
      const existingSignatures = new Set();
      for (const sub of existingSubmissions) {
        const sig = buildImportSignature(sub.source_payload || {});
        if (sig) existingSignatures.add(sig);
      }

      const stats = {
        total_rows: boundedRows.length,
        imported: 0,
        skipped_existing: 0,
        duplicate_ignored: 0,
        failed: 0,
        skipped_inactive: 0,
      };
      const results = [];

      for (let index = 0; index < boundedRows.length; index++) {
        const row = boundedRows[index] || {};
        let transformed;
        try {
          transformed = buildPayloadFromConnectionTemplateRow(row, integration, expectedFields);
        } catch (mapError) {
          stats.failed += 1;
          results.push({
            row_index: index + 1,
            status: 'failed',
            error: 'Rijvalidatie: ' + (mapError?.message || 'ongeldige invoer')
          });
          continue;
        }
        const signature = buildImportSignature(transformed);

        if (signature && existingSignatures.has(signature)) {
          stats.skipped_existing += 1;
          results.push({ row_index: index + 1, status: 'skipped_existing' });
          continue;
        }

        if (skipPipeline) {
          stats.skipped_inactive += 1;
          results.push({ row_index: index + 1, status: 'skipped_inactive' });
          continue;
        }

        const syntheticRequest = new Request('https://internal/forminator-v2/import-meta-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(transformed),
        });

        const webhookResponse = await handleGenericWebhook({
          env: context.env,
          integration,
          request: syntheticRequest,
          skipPipeline: false,
        });

        const body = await webhookResponse.json().catch(() => ({}));
        const status = body?.data?.status || (webhookResponse.ok ? 'processed' : 'failed');

        if (!webhookResponse.ok) {
          stats.failed += 1;
          results.push({ row_index: index + 1, status: 'failed', error: body?.error || 'Import failed' });
          continue;
        }

        if (status === 'duplicate_ignored' || status === 'duplicate_inflight') {
          stats.duplicate_ignored += 1;
          results.push({ row_index: index + 1, status, submission_id: body?.data?.submission_id || null });
          continue;
        }

        stats.imported += 1;
        if (signature) existingSignatures.add(signature);
        results.push({ row_index: index + 1, status, submission_id: body?.data?.submission_id || null });
      }

      return jsonResponse({
        success: true,
        data: {
          integration_id: integrationId,
          stats,
          results,
        },
      });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/integrations/:id/import-meta-leads/template': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const integration = await getIntegrationById(context.env, integrationId);
      if (!integration) {
        return jsonResponse({ success: false, error: 'Integration not found' }, 404);
      }

      const integrationBundle = await getIntegrationDetails(context.env, integrationId);
      const expectedFields = extractExpectedImportFields(integrationBundle || {});

      const recentSubmissions = await listSubmissionsByIntegration(context.env, integrationId, 200);
      const sampleSubmission = recentSubmissions.find((s) => {
        const raw = s.source_payload;
        if (!raw) return false;
        if (typeof raw === 'object') {
          const hasEmail = normalizeImportText(raw.email || raw.raw_email);
          const hasName = normalizeImportText(raw.full_name || raw.raw_full_name);
          return !!(hasEmail || hasName);
        }
        try {
          const parsed = JSON.parse(raw);
          const hasEmail = normalizeImportText(parsed.email || parsed.raw_email);
          const hasName = normalizeImportText(parsed.full_name || parsed.raw_full_name);
          return !!(hasEmail || hasName);
        } catch {
          return false;
        }
      });

      const samplePayload = parseJsonObject(sampleSubmission?.source_payload || {});
      const sampleRow = toTemplateRowFromPayload(samplePayload, integration, expectedFields);
      const fieldTransforms = (integrationBundle && integrationBundle.fieldTransforms) || {};
      const dropdowns = buildTemplateDropdowns(expectedFields, fieldTransforms);
      const inputRules = buildTemplateInputRules(expectedFields);

      return jsonResponse({
        success: true,
        data: {
          columns: expectedFields,
          sample_row: sampleRow,
          dropdowns,
          input_rules: inputRules,
          field_transforms: fieldTransforms,
          field_meta: integration.field_meta || {},
          hint: 'Vul nieuwe leads aan volgens deze kolommen en upload daarna het bestand via Importeren.'
        }
      });
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

  // Per-integration generic/Zapier webhook (token validated here, no session required)
  'POST /api/integrations/:id/webhook': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const integration = await getIntegrationById(context.env, integrationId);
      if (!integration) {
        return jsonResponse({ success: false, error: 'Integration not found' }, 404);
      }
      if (integration.source_type !== 'generic_webhook') {
        return jsonResponse({ success: false, error: 'This integration does not accept generic webhooks' }, 400);
      }

      // Timing-safe token validation (always validate, even when inactive)
      const url = new URL(context.request.url);
      const submittedToken = url.searchParams.get('token') || '';
      const expectedToken  = integration.webhook_token || '';
      if (!expectedToken || submittedToken.length !== expectedToken.length) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }
      // Constant-time compare using TextEncoder
      const enc = new TextEncoder();
      const a = enc.encode(submittedToken);
      const b = enc.encode(expectedToken);
      let mismatch = 0;
      for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
      if (mismatch !== 0) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }

      // For inactive integrations: store the payload (so fields can be discovered) but skip Odoo pipeline
      return await handleGenericWebhook({ env: context.env, integration, request: context.request, skipPipeline: !integration.is_active });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'GET /api/integrations/:id/field-transforms': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);
      const transforms = await listFieldTransforms(context.env, integrationId);
      return jsonResponse({ success: true, data: transforms });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/integrations/:id/field-transforms/:fieldName': async (context) => {
    try {
      const integrationId = context.params?.id;
      const fieldName     = decodeURIComponent(context.params?.fieldName || '');
      assertIntegrationSelected(integrationId);
      if (!fieldName) return jsonResponse({ success: false, error: 'fieldName required' }, 400);
      const body = await context.request.json();
      const transform = await upsertFieldTransform(context.env, integrationId, fieldName, {
        field_type: body.field_type || 'text',
        value_map:  body.value_map  ?? null,
        value_map_order: normalizeStringArray(body.value_map_order),
      });
      return jsonResponse({ success: true, data: transform });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'DELETE /api/integrations/:id/field-transforms/:fieldName': async (context) => {
    try {
      const integrationId = context.params?.id;
      const fieldName     = decodeURIComponent(context.params?.fieldName || '');
      assertIntegrationSelected(integrationId);
      if (!fieldName) return jsonResponse({ success: false, error: 'fieldName required' }, 400);
      await deleteFieldTransform(context.env, integrationId, fieldName);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  // Returns the webhook URL + token for a generic_webhook integration (requires auth)
  'GET /api/integrations/:id/webhook-url': async (context) => {
    try {
      const integrationId = context.params?.id;
      assertIntegrationSelected(integrationId);

      const integration = await getIntegrationById(context.env, integrationId);
      if (!integration) {
        return jsonResponse({ success: false, error: 'Integration not found' }, 404);
      }
      if (integration.source_type !== 'generic_webhook' || !integration.webhook_token) {
        return jsonResponse({ success: false, error: 'Not a generic webhook integration' }, 400);
      }

      const reqUrl  = new URL(context.request.url);
      const base    = `${reqUrl.protocol}//${reqUrl.host}`;
      const path    = `/forminator-v2/api/integrations/${integrationId}/webhook`;
      const webhookUrl = `${base}${path}?token=${encodeURIComponent(integration.webhook_token)}`;

      return jsonResponse({ success: true, data: { webhook_url: webhookUrl, webhook_token: integration.webhook_token } });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
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

  'DELETE /api/submissions/:submissionId': async (context) => {
    try {
      const submissionId = context.params?.submissionId;
      if (!submissionId) {
        return jsonResponse({ success: false, error: 'Submission id is required' }, 400);
      }
      await deleteSubmission(context.env, submissionId);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'POST /api/integrations/:integrationId/cleanup-replays': async (context) => {
    try {
      const integrationId = context.params?.integrationId;
      if (!integrationId) {
        return jsonResponse({ success: false, error: 'Integration id is required' }, 400);
      }
      const result = await cleanupFailedReplays(context.env, integrationId);
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  'PUT /api/integrations/:integrationId/field-meta': async (context) => {
    try {
      const integrationId = context.params?.integrationId;
      if (!integrationId) {
        return jsonResponse({ success: false, error: 'Integration id is required' }, 400);
      }
      const body = await readJsonBody(context.request);
      const meta = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
      await upsertFieldMeta(context.env, integrationId, meta);
      return jsonResponse({ success: true });
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
  // Odoo activity types — for create_activity step configuration
  // ─────────────────────────────────────────────────────────────────────────

  'GET /api/activity-types': async (context) => {
    try {
      const url   = new URL(context.request.url);
      const model = url.searchParams.get('model') || null;
      const types = await fetchFsv2ActivityTypes(context.env, model);
      return jsonResponse({ success: true, data: types });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  'GET /api/odoo-users': async (context) => {
    try {
      const users = await fetchFsv2OdooUsers(context.env);
      return jsonResponse({ success: true, data: users });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
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
      await updateModelDefaultFields(context.env, model, fields);
      return jsonResponse({ success: true, data: { model, fields } });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * PUT /api/settings/model-identifier-fields
   * Saves the identifier_fields for a single Odoo model.
   */
  'PUT /api/settings/model-identifier-fields': async (context) => {
    try {
      const body   = await readJsonBody(context.request);
      const { model, fields } = body;
      if (!model)                 return jsonResponse({ success: false, error: 'model required' }, 400);
      if (!Array.isArray(fields)) return jsonResponse({ success: false, error: 'fields must be an array' }, 400);
      await updateModelIdentifierFields(context.env, model, fields);
      return jsonResponse({ success: true, data: { model, fields } });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * PUT /api/settings/model-fixed-fields
   * Saves the fixed_fields for a single Odoo model.
   */
  'PUT /api/settings/model-fixed-fields': async (context) => {
    try {
      const body   = await readJsonBody(context.request);
      const { model, fields } = body;
      if (!model)                 return jsonResponse({ success: false, error: 'model required' }, 400);
      if (!Array.isArray(fields)) return jsonResponse({ success: false, error: 'fields must be an array' }, 400);
      await updateModelFixedFields(context.env, model, fields);
      return jsonResponse({ success: true, data: { model, fields } });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * GET /api/settings/model-links
   * Returns the saved model link registry (array of {model_a, model_b, link_field, link_label}).
   */
  'GET /api/settings/model-links': async (context) => {
    try {
      const links = await getModelLinks(context.env);
      return jsonResponse({ success: true, data: links });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * PUT /api/settings/model-links
   * Saves the complete model link registry.
   * Body: { links: [{model_a, model_b, link_field, link_label}] }
   */
  'PUT /api/settings/model-links': async (context) => {
    try {
      const body = await readJsonBody(context.request);
      if (!Array.isArray(body.links)) return jsonResponse({ success: false, error: 'links must be an array' }, 400);
      const saved = await upsertModelLinks(context.env, body.links);
      return jsonResponse({ success: true, data: saved });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * GET /api/settings/odoo-models
   * Returns the user-managed list of Odoo models.
   */
  'GET /api/settings/odoo-models': async (context) => {
    try {
      const models = await getOdooModels(context.env);
      return jsonResponse({ success: true, data: models });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  },

  /**
   * PUT /api/settings/odoo-models
   * Saves the full Odoo model registry.
   * Body: { models: [{name, label, icon}] }
   */
  'PUT /api/settings/odoo-models': async (context) => {
    try {
      const body = await readJsonBody(context.request);
      if (!Array.isArray(body.models)) return jsonResponse({ success: false, error: 'models must be an array' }, 400);
      const saved = await upsertOdooModels(context.env, body.models);
      return jsonResponse({ success: true, data: saved });
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

      // Resolve slug → actual Odoo model (e.g. 'bedrijf' → 'res.partner')
      let odooModel = model;
      try {
        const allModels = await getOdooModels(context.env);
        const modelCfg = allModels.find(m => m.name === model);
        if (modelCfg && modelCfg.odoo_model) odooModel = modelCfg.odoo_model;
      } catch (_) { /* fallback to raw model param */ }

      const rawFields = await executeKw(context.env, {
        model: odooModel,
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

      return jsonResponse({ success: true, data: fields, model, odooModel });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },

  /**
   * GET /api/odoo/search?model=res.partner&q=Nico&limit=20
   * Search records of a many2one model for value pickers.
   */
  'GET /api/odoo/search': async (context) => {
    try {
      const url   = new URL(context.request.url);
      const model = (url.searchParams.get('model') || '').trim();
      const q     = (url.searchParams.get('q') || '').trim();
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

      if (!model) return jsonResponse({ success: false, error: 'model is verplicht' }, 400);

      // Resolve slug → odoo model
      let odooModel = model;
      try {
        const allModels = await getOdooModels(context.env);
        const cfg = allModels.find(m => m.name === model);
        if (cfg && cfg.odoo_model) odooModel = cfg.odoo_model;
      } catch (_) {}

      const domain = q ? [['display_name', 'ilike', q]] : [];

      const records = await executeKw(context.env, {
        model: odooModel,
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'display_name'], limit },
      });

      const results = (records || []).map(r => ({ id: r.id, label: r.display_name }));
      return jsonResponse({ success: true, data: results });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, parseErrorStatus(error));
    }
  },
};
