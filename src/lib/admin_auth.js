/**
 * Authentication middleware for admin API endpoints
 */

/**
 * Verify admin token from Authorization header
 * 
 * @param {Request} request - The request object
 * @param {Object} env - Environment variables
 * @returns {boolean} - True if authenticated
 */
export function verifyAdminToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return false;
  }
  
  // Support both "Bearer TOKEN" and "TOKEN" formats
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;
  
  // Check against ADMIN_TOKEN secret
  return token === env.ADMIN_TOKEN;
}

/**
 * Return unauthorized response
 * 
 * @returns {Response}
 */
export function unauthorizedResponse() {
  return new Response(JSON.stringify({
    success: false,
    error: 'Unauthorized - Invalid or missing admin token'
  }), {
    status: 401,
    headers: { 
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="Admin API"'
    }
  });
}

/**
 * Middleware wrapper for admin endpoints
 * 
 * @param {Function} handler - The endpoint handler function
 * @returns {Function} - Wrapped handler with authentication
 */
export function requireAdminAuth(handler) {
  return async (context) => {
    if (!verifyAdminToken(context.request, context.env)) {
      return unauthorizedResponse();
    }
    return handler(context);
  };
}
