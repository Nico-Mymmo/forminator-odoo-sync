function normalizeWhitespace(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (value && typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const normalized = {};

    for (const key of sortedKeys) {
      normalized[key] = normalizeForHash(value[key]);
    }

    return normalized;
  }

  return normalizeWhitespace(value);
}

export function normalizePayloadForHash(payload) {
  return normalizeForHash(payload || {});
}

export async function computePayloadHash(payload) {
  const normalizedPayload = normalizePayloadForHash(payload);
  const serialized = JSON.stringify(normalizedPayload);
  const data = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function buildIdempotencyKey({ integrationId, forminatorFormId, payloadHash }) {
  return `${integrationId}:${forminatorFormId}:${payloadHash}`;
}

export function isTerminalSubmissionStatus(status) {
  return ['success', 'partial_failed', 'permanent_failed', 'retry_exhausted', 'duplicate_ignored', 'duplicate_inflight', 'processed'].includes(String(status || '').trim());
}

export function classifyDuplicateStatus(existingStatus) {
  const normalizedStatus = String(existingStatus || '').trim();

  if (['running', 'retry_running', 'retry_scheduled'].includes(normalizedStatus)) {
    return 'duplicate_inflight';
  }

  if (isTerminalSubmissionStatus(normalizedStatus)) {
    return 'duplicate_ignored';
  }

  return null;
}
