/**
 * Validate webhook authentication
 * Supports both Bearer token and query parameter token
 */
export function validateAuth(request, env) {
  // Check Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token === env.AUTH_TOKEN) {
      return true;
    }
  }

  // Check query parameter
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get("token");
  if (tokenParam && tokenParam === env.AUTH_TOKEN) {
    return true;
  }

  return false;
}

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new Error(`Invalid JSON body: ${error.message}`);
  }
}

/**
 * Create success response
 */
export function successResponse(data, status = 200) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Create error response
 */
export function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
