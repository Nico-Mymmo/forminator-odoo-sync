import { create, searchRead, write, executeKw } from '../../lib/odoo.js';

function normalizeIncomingValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }

  return value;
}

function applyPolicyToValues(incomingValues, updatePolicy) {
  const values = incomingValues || {};
  const policy = String(updatePolicy || '').trim();

  if (policy === 'always_overwrite') {
    return values;
  }

  if (policy === 'only_if_incoming_non_empty') {
    const filtered = {};
    for (const [field, value] of Object.entries(values)) {
      const normalized = normalizeIncomingValue(value);
      if (normalized !== null) {
        filtered[field] = normalized;
      }
    }
    return filtered;
  }

  const error = new Error('Unsupported update policy');
  error.code = 'VALIDATION_ERROR';
  throw error;
}

export async function findRecordByIdentifier(env, { model, identifierDomain, fields = ['id'] }) {
  const records = await searchRead(env, {
    model,
    domain: identifierDomain,
    fields,
    limit: 1,
    order: 'id asc'
  });

  return Array.isArray(records) && records.length > 0 ? records[0] : null;
}

export async function createRecord(env, { model, values }) {
  return create(env, { model, values });
}

export async function updateRecord(env, { model, id, values }) {
  await write(env, { model, ids: [id], values });
  return id;
}

export async function upsertRecordStrict(env, {
  model,
  identifierDomain,
  incomingValues,
  updateValues,
  updatePolicy
}) {
  // updateValues: fields to write on UPDATE (defaults to incomingValues)
  // incomingValues: fields to write on CREATE
  const valuesOnUpdate = applyPolicyToValues(updateValues !== undefined ? updateValues : incomingValues, updatePolicy);
  const valuesOnCreate = applyPolicyToValues(incomingValues, updatePolicy);

  let existing = await findRecordByIdentifier(env, {
    model,
    identifierDomain,
    fields: ['id']
  });

  if (existing) {
    if (Object.keys(valuesOnUpdate).length === 0) {
      return { action: 'skipped', recordId: existing.id };
    }
    await updateRecord(env, { model, id: existing.id, values: valuesOnUpdate });
    return { action: 'updated', recordId: existing.id };
  }

  // Second lookup to handle race conditions
  existing = await findRecordByIdentifier(env, {
    model,
    identifierDomain,
    fields: ['id']
  });

  if (existing) {
    if (Object.keys(valuesOnUpdate).length === 0) {
      return { action: 'skipped', recordId: existing.id };
    }
    await updateRecord(env, { model, id: existing.id, values: valuesOnUpdate });
    return { action: 'updated', recordId: existing.id };
  }

  const recordId = await createRecord(env, { model, values: valuesOnCreate });
  return { action: 'created', recordId };
}

// operation_type: 'create' — always creates a new record, never searches.
// Use for models where duplicates are valid (activities, notes, etc.).
export async function createRecordOnly(env, { model, values, updatePolicy }) {
  const valuesToWrite = applyPolicyToValues(values, updatePolicy || 'always_overwrite');
  const recordId = await createRecord(env, { model, values: valuesToWrite });
  return { action: 'created', recordId };
}

// operation_type: 'update_only' — find record and update it; skip silently if not found.
// Use for enrichment steps where the target record may not exist yet.
export async function updateOnlyRecord(env, { model, identifierDomain, values, updatePolicy }) {
  const valuesToWrite = applyPolicyToValues(values, updatePolicy || 'always_overwrite');

  const existing = await findRecordByIdentifier(env, {
    model,
    identifierDomain,
    fields: ['id']
  });

  if (!existing) {
    return { action: 'skipped', recordId: null };
  }

  if (Object.keys(valuesToWrite).length === 0) {
    return { action: 'skipped', recordId: existing.id };
  }

  await updateRecord(env, { model, id: existing.id, values: valuesToWrite });
  return { action: 'updated', recordId: existing.id };
}

/**
 * Plaatst een HTML-bericht in de Odoo-chatter via message_post.
 * - Altijd method: 'message_post' — NOOIT mail.message.create
 * - message_type is ALTIJD 'comment' — hardcoded
 * - author_id wordt NOOIT meegegeven
 */
export async function postChatterMessage(env, { model, recordId, body, subtypeXmlid }) {
  const msgId = await executeKw(env, {
    model,
    method:  'message_post',
    args:    [[recordId]],
    kwargs: {
      body:          body || '',
      body_is_html:  true,
      message_type:  'comment',
      subtype_xmlid: subtypeXmlid || 'mail.mt_note',
    }
  });
  return { action: 'posted', recordId: msgId };
}

/**
 * Maakt een nieuwe mail.activity aan op het opgegeven record.
 * - Fout in activity-stap mag de pipeline niet breken; de caller handelt dit af.
 * - Odoo vereist zowel res_model (char) als res_model_id (ir.model FK) bij create via RPC.
 *   We zoeken res_model_id op via ir.model zodat de NOT NULL constraint nooit faalt.
 */
export async function createActivity(env, { resModel, resId, activityTypeId, dateDeadline, summary, userId }) {
  // Look up ir.model id for the given model name — required alongside res_model string.
  const irModels = await searchRead(env, {
    model:  'ir.model',
    domain: [['model', '=', resModel]],
    fields: ['id'],
    limit:  1,
  });
  if (!irModels.length) {
    throw new Error(`createActivity: model "${resModel}" niet gevonden in ir.model`);
  }
  const resModelId = irModels[0].id;

  const values = {
    res_model:          resModel,
    res_model_id:       resModelId,
    res_id:             resId,
    activity_type_id:   activityTypeId,
    date_deadline:      dateDeadline,
  };
  if (summary)  values.summary  = String(summary).slice(0, 255); // Odoo summary field limit
  if (userId)   values.user_id  = userId;

  const activityId = await create(env, { model: 'mail.activity', values });
  return { action: 'activity_created', recordId: activityId };
}

/**
 * Haalt alle beschikbare mail.activity.type records op.
 * Bedoeld voor de UI-dropdown in FSV2-stap configuratie.
 */
export async function fetchFsv2ActivityTypes(env) {
  return searchRead(env, {
    model:  'mail.activity.type',
    domain: [],
    fields: ['id', 'name'],
    order:  'name asc',
  });
}
