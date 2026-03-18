/**
 * Module Registry
 * 
 * Central registry for all platform modules.
 * Handles module discovery, routing, and user access control.
 */

import homeModule from './home/module.js';
import forminatorSyncModule from './forminator-sync/module.js';
import forminatorSyncV2Module from './forminator-sync-v2/module.js';
import wpFormSchemasModule from './wp-form-schemas/module.js';
import projectGeneratorModule from './project-generator/module.js';
import adminModule from './admin/module.js';
import profileModule from './profile/module.js';
import salesInsightExplorerModule from './sales-insight-explorer/module.js';
import eventOperationsModule from './event-operations/module.js';
import mailSignatureDesignerModule from './mail-signature-designer/module.js';
import assetManagerModule from './asset-manager/module.js';
import cxPowerboardModule from './cx_powerboard/module.js';

/**
 * All registered modules
 */
export const MODULES = [
  homeModule,
  forminatorSyncModule,
  forminatorSyncV2Module,
  wpFormSchemasModule,
  projectGeneratorModule,
  adminModule,
  profileModule,
  salesInsightExplorerModule,
  eventOperationsModule,
  mailSignatureDesignerModule,
  assetManagerModule,
  cxPowerboardModule
];

/**
 * Find module by route
 * @param {string} pathname - Request pathname
 * @returns {Object|null} Module definition or null
 */
export function getModuleByRoute(pathname) {
  // Sort modules by route length (longest first) to avoid "/" matching everything
  const sorted = [...MODULES].sort((a, b) => b.route.length - a.route.length);
  return sorted.find(m => pathname === m.route || (m.route !== '/' && pathname.startsWith(m.route)));
}

/**
 * Find module by code
 * @param {string} code - Module code
 * @returns {Object|null} Module definition or null
 */
export function getModuleByCode(code) {
  return MODULES.find(m => m.code === code);
}

/**
 * Get modules enabled for user
 * @param {Object} user - User object with modules array
 * @returns {Array} Array of module definitions
 */
export function getUserModules(user) {
  if (!user || !user.modules) return [];
  
  const enabledCodes = user.modules
    .filter(um => um.module && um.is_enabled)
    .map(um => um.module.code);
  
  return MODULES.filter(m => enabledCodes.includes(m.code));
}

/**
 * Get active modules (globally enabled)
 * @returns {Array} Array of active module definitions
 */
export function getActiveModules() {
  return MODULES.filter(m => m.isActive !== false);
}

/**
 * Check whether a user has an elevated sub-role access within a specific module.
 *
 * Modules can declare a `subRoles` array in their definition.
 * If a module has sub-roles, a user qualifies for elevated access when their
 * users.role matches one of the declared sub-roles (other than 'user').
 *
 * This does NOT replace the user_modules access gate – it is an additional
 * intra-module role check used by individual route handlers.
 *
 * Example usage in a route handler:
 *   if (!hasModuleSubRoleAccess(context.user, 'marketing_signature')) { ... }
 *
 * @param {Object} user       - Authenticated user object (from session)
 * @param {string} requiredRole - The sub-role to check (e.g. 'marketing_signature')
 * @returns {boolean}
 */
export function hasModuleSubRoleAccess(user, requiredRole) {
  if (!user) return false;
  if (user.role === 'admin') return true;           // admin always qualifies
  return user.role === requiredRole;
}

/**
 * Resolve route handler for module
 * @param {Object} module - Module definition
 * @param {string} method - HTTP method
 * @param {string} pathname - Request pathname
 * @returns {Object|null} Route handler and params or null
 */
export function resolveModuleRoute(module, method, pathname) {
  if (!module || !module.routes) return null;
  
  // Get sub-path within module
  const subPath = pathname === module.route 
    ? '/' 
    : pathname.slice(module.route.length) || '/';
  
  // Look for exact match first
  const routeKey = `${method} ${subPath}`;
  if (module.routes[routeKey]) {
    return { handler: module.routes[routeKey], params: {} };
  }
  
  // Try parameter routes (e.g., /api/users/:id/role)
  for (const [key, handler] of Object.entries(module.routes)) {
    const [routeMethod, routePath] = key.split(' ');
    if (routeMethod !== method) continue;
    
    // Convert route pattern to regex
    const pattern = routePath.replace(/:[^/]+/g, '([^/]+)');
    const regex = new RegExp(`^${pattern}$`);
    const match = subPath.match(regex);
    
    if (match) {
      // Extract parameter names and values
      const paramNames = (routePath.match(/:[^/]+/g) || []).map(p => p.slice(1));
      const params = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler, params };
    }
  }
  
  // Look for wildcard match
  const wildcardKey = `${method} *`;
  if (module.routes[wildcardKey]) {
    return { handler: module.routes[wildcardKey], params: {} };
  }
  
  return null;
}
