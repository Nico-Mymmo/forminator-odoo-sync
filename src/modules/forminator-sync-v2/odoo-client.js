import { create, searchRead, write } from '../../lib/odoo.js';

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
