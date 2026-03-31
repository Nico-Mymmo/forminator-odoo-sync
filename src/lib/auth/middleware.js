/**
 * Authentication Middleware
 * 
 * Protect routes with authentication and authorization checks
 */

import { validateSession } from './session.js';

/**
 * Extract bearer token from request
 * 
 * @param {Request} request - HTTP request
 * @returns {string|null} Token or null
 */
function extractToken(request) {
  const authHeader = request.headers.get('Authorization');

  if (authHeader) {
    // Support "Bearer TOKEN" format
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    // Support plain token
    return authHeader;
  }

  // Fall back to session cookie (browser UI requests)
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith('session=')) {
        return trimmed.slice('session='.length);
      }
    }
  }

  return null;
}

/**
 * Require authentication middleware
 * 
 * Validates session and attaches user to context
 * 
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler
 */
export function requireAuth(handler) {
  return async (context) => {
    const { request, env } = context;
    
    // Extract token
    const token = extractToken(request);
    
    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required'
      }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="API"'
        }
      });
    }
    
    // Validate session
    const user = await validateSession(env, token);
    
    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid or expired session'
      }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="API"'
        }
      });
    }
    
    // Attach user to context
    context.user = user;
    
    // Call handler
    return handler(context);
  };
}

/**
 * Require admin role middleware
 * 
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler with auth + admin check
 */
export function requireAdmin(handler) {
  return requireAuth(async (context) => {
    const { user } = context;
    
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin access required'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return handler(context);
  });
}

/**
 * Require specific role middleware
 * 
 * @param {string|Array<string>} roles - Required role(s)
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler
 */
export function requireRole(roles, handler) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return requireAuth(async (context) => {
    const { user } = context;
    
    if (!allowedRoles.includes(user.role)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Required role: ${allowedRoles.join(' or ')}`
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return handler(context);
  });
}

/**
 * Require module access middleware
 * 
 * @param {string} moduleCode - Module code to check
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler
 */
export function requireModule(moduleCode, handler) {
  return requireAuth(async (context) => {
    const { user } = context;
    
    const hasAccess = user.modules?.some(m => m.code === moduleCode);
    
    if (!hasAccess) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Module access denied'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return handler(context);
  });
}

/**
 * Optional auth middleware
 * 
 * Attaches user if token is valid, but doesn't require it
 * 
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler
 */
export function optionalAuth(handler) {
  return async (context) => {
    const { request, env } = context;
    
    const token = extractToken(request);
    
    if (token) {
      const user = await validateSession(env, token);
      if (user) {
        context.user = user;
      }
    }
    
    return handler(context);
  };
}
