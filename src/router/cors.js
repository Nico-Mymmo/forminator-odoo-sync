/**
 * CORS handling — OPTIONS preflight + response headers.
 *
 * @module router/cors
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

/**
 * Handle CORS preflight (OPTIONS) requests.
 * @returns {Response}
 */
export function handlePreflight() {
  return new Response(null, {
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * Add CORS headers to an existing response.
 * @param {Response} response
 * @returns {Response}
 */
export function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
