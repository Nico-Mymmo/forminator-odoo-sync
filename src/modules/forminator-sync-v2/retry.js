const MAX_ATTEMPTS_TOTAL = 3;
const RETRY_MINUTES_BY_ATTEMPT = {
  2: 1,
  3: 5
};

function parseHttpStatusFromMessage(message) {
  const match = String(message || '').match(/\b(4\d\d|5\d\d)\b/);
  if (!match) return null;

  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function classifyFailureType(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  const messageStatusCode = parseHttpStatusFromMessage(message);
  const resolvedStatusCode = statusCode || messageStatusCode || 0;

  const looksLikeTimeout = message.includes('timeout') || message.includes('timed out');
  const looksLikeNetwork = message.includes('network') || message.includes('fetch failed') || message.includes('connection reset');

  if (looksLikeTimeout || looksLikeNetwork) {
    return 'recoverable';
  }

  if (resolvedStatusCode === 429) {
    return 'recoverable';
  }

  if (resolvedStatusCode >= 500 && resolvedStatusCode <= 599) {
    return 'recoverable';
  }

  if (resolvedStatusCode >= 400 && resolvedStatusCode <= 499) {
    return 'permanent';
  }

  return 'permanent';
}

export function getRetryScheduleMinutes(nextAttemptNumber) {
  return RETRY_MINUTES_BY_ATTEMPT[nextAttemptNumber] || null;
}

export function getMaxAttemptsTotal() {
  return MAX_ATTEMPTS_TOTAL;
}

export function computeNextRetryAt(nowIso, nextAttemptNumber) {
  const scheduleMinutes = getRetryScheduleMinutes(nextAttemptNumber);
  if (!scheduleMinutes) {
    return null;
  }

  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) {
    return null;
  }

  return new Date(nowMs + scheduleMinutes * 60 * 1000).toISOString();
}
