import { testConnection } from "./actions/test_connection.js";
import { receiveForminator } from "./actions/receive_forminator.js";
import { MODULES, getModuleByRoute, getModuleByCode, resolveModuleRoute, getUserModules } from "./modules/registry.js";
import { requireAdminAuth } from "./lib/admin_auth.js";
import { validateSession } from "./lib/auth/session.js";
import { getForminatorForm, extractFieldsFromForm, generateFieldMapping } from "./lib/wordpress.js";
import { handleLogin, handleLogout, handleMe } from "./api/auth.js";
import { validateKey } from "./modules/asset-manager/lib/path-utils.js";
import { getMimeType } from "./modules/asset-manager/lib/mime-types.js";

const ACTIONS = {
  test_connection: testConnection,
  receive_forminator: receiveForminator,
};

// Validate authentication using either header or query parameter
async function validateAuth(request, env) {
  const userAgent = request.headers.get("User-Agent") || "";
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get("token");
  
  // Public Forminator token: only works from openvme.be User-Agent
  if (tokenParam === "openvmeform") {
    if (!userAgent.includes("openvme.be")) {
      console.error(`🚫 openvmeform token used but User-Agent doesn't contain openvme.be: ${userAgent}`);
      return false;
    }
    return true;
  }
  
  // Check Authorization header for general access
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token === env.AUTH_TOKEN) {
      return true;
    }
  }

  // Check query parameter for AUTH_TOKEN (legacy support)
  if (tokenParam && tokenParam === env.AUTH_TOKEN) {
    return true;
  }

  return false;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          }
        });
      }

    // Helper to add CORS headers to any response
    const addCorsHeaders = (response) => {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    };

    // Serve favicon (no auth required)
    if (pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // Public asset serving — geen auth, vóór module-router
    // Exacte check: startsWith('/assets/') met trailing slash — NIET '/assets'
    // '/assets' (zonder slash) = module-UI, moet de module-router bereiken met auth
    // '/assets/api/*'          = API routes, moeten module-router bereiken met auth
    // '/assets/*' (met slash)  = publieke bestanden, worden hier geserveerd zonder auth
    if (pathname.startsWith('/assets/') && !pathname.startsWith('/assets/api/') && request.method === 'GET') {
      const key = pathname.slice('/assets/'.length);

      if (!validateKey(key)) {
        return new Response('Not Found', { status: 404 });
      }

      let object;
      try {
        object = await env.R2_ASSETS.get(key);
      } catch (err) {
        console.error('[asset-manager] R2 get error:', err.message);
        return new Response('Internal Server Error', { status: 500 });
      }

      if (!object) {
        return new Response('Not Found', { status: 404 });
      }

      const contentType = object.httpMetadata?.contentType || getMimeType(key);

      let cacheControl;
      if (key.startsWith('public/')) {
        cacheControl = 'public, max-age=31536000, immutable';
      } else if (key.startsWith('uploads/')) {
        cacheControl = 'public, max-age=3600';
      } else {
        cacheControl = 'private, no-store';
      }

      return new Response(object.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'ETag': object.etag || '',
        }
      });
    }

    // TEST DATABASE CONNECTION
    if (pathname === '/test-db') {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        
        const { data: users, error } = await supabase
          .from('users')
          .select('id, email, role, is_active, created_at');
        
        return new Response(JSON.stringify({ 
          success: !error,
          supabase_url: env.SUPABASE_URL,
          users_count: users?.length || 0,
          users,
          error 
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ 
          success: false,
          error: err.message,
          stack: err.stack
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // FIX ADMIN PASSWORD
    if (pathname === '/fix-admin-now') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      
      // Generate hash for "Pindakaas1" using Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode('Pindakaas1');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const passwordHash = `$2a$${hashHex.slice(0,2)}$${hashHex.slice(2)}`;
      
      const { data: result, error } = await supabase
        .from('users')
        .update({ password_hash: passwordHash })
        .eq('email', 'admin@mymmo.com')
        .select();
      
      return new Response(JSON.stringify({ 
        success: !error, 
        message: 'Password set to: Pindakaas1',
        hash: passwordHash,
        result, 
        error 
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // RUN MIGRATIONS
    if (pathname === '/run-migrations' && request.method === 'POST') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      
      try {
        const { sql } = await request.json();
        
        if (!sql) {
          return new Response(JSON.stringify({ 
            success: false,
            error: 'SQL query required'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Execute SQL directly (note: this bypasses RLS)
        const { data, error } = await supabase.rpc('exec_sql', { sql });
        
        if (error) {
          return new Response(JSON.stringify({ 
            success: false,
            error: error.message,
            details: error
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ 
          success: true,
          message: 'SQL executed successfully',
          result: data
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      } catch (err) {
        return new Response(JSON.stringify({ 
          success: false,
          error: err.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Public authentication endpoints (no auth required)
    if (pathname === '/api/auth/login' && request.method === 'POST') {
      return await handleLogin({ request, env, ctx });
    }

    // TEMPORARY: Google API debug (no auth) — remove after diagnosis
    if (pathname === '/api/debug-google' && request.method === 'GET') {
      const { routes: sigRoutes } = await import('./modules/mail-signature-designer/routes.js');
      return await sigRoutes['GET /api/debug-google']({ env, request, user: null });
    }
    
    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      return await handleLogout({ request, env, ctx });
    }
    
    // Get current user (requires auth)
    if (pathname === '/api/auth/me' && request.method === 'GET') {
      const cookieHeader = request.headers.get('Cookie');
      let token = null;
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim());
        const sessionCookie = cookies.find(c => c.startsWith('session='));
        if (sessionCookie) {
          token = sessionCookie.split('=')[1];
        }
      }
      
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const user = await validateSession(env, token);
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return await handleMe({ user });
    }

    // Route to module or redirect to default
    // Check if pathname matches a module route
    const hasAction = url.searchParams.has('action');

    // Public webhook intake for Forminator Sync V2 (token-auth, no session required)
    if (pathname === '/forminator-v2/api/webhook' && request.method === 'POST') {
      const isAuthorized = await validateAuth(request, env);
      if (!isAuthorized) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const v2Module = getModuleByCode('forminator_sync_v2');
      if (!v2Module) {
        return new Response(JSON.stringify({ success: false, error: 'Forminator Sync V2 module unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const context = { request, env, ctx, user: null };
      const resolved = resolveModuleRoute(v2Module, request.method, pathname);
      if (!resolved) {
        return new Response(JSON.stringify({ success: false, error: 'Webhook route not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      context.params = resolved.params;
      return await resolved.handler(context);
    }
    
    // Special handling for legacy /api/ routes -> redirect to forminator module
    if (pathname.startsWith('/api/mappings') || pathname.startsWith('/api/history') || pathname === '/api/test-connection') {
      // These are actually Forminator Sync module routes
      // Rewrite the request to go through the forminator module
      const forminatorModule = getModuleByCode('forminator_sync');
      if (forminatorModule) {
        // Extract session token
        const authHeader = request.headers.get('Authorization');
        let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        
        if (!token) {
          const cookieHeader = request.headers.get('Cookie');
          if (cookieHeader) {
            const cookies = cookieHeader.split(';').map(c => c.trim());
            const sessionCookie = cookies.find(c => c.startsWith('session='));
            if (sessionCookie) {
              token = sessionCookie.split('=')[1];
            }
          }
        }
        
        // Validate session
        let user = null;
        if (token) {
          user = await validateSession(env, token);
        }
        
        // Build context
        const context = { request, env, ctx, user };
        
        // Check auth
        if (!user) {
          return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Resolve route within forminator module
        const subPath = pathname; // Use full path as-is
        const routeKey = `${request.method} ${subPath}`;
        
        if (forminatorModule.routes[routeKey]) {
          return await forminatorModule.routes[routeKey](context);
        }
        
        // Try parameter routes
        for (const [key, handler] of Object.entries(forminatorModule.routes)) {
          const [routeMethod, routePath] = key.split(' ');
          if (routeMethod !== request.method) continue;
          
          const pattern = routePath.replace(/:[^/]+/g, '([^/]+)');
          const regex = new RegExp(`^${pattern}$`);
          const match = subPath.match(regex);
          
          if (match) {
            return await handler(context);
          }
        }
      }
    }
    
    // Try to resolve module route
    const module = getModuleByRoute(pathname);
    if (module && !hasAction) {
      // Extract session token from Authorization header or cookie
      const authHeader = request.headers.get('Authorization');
      let token = authHeader?.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : null;
      
      // If no auth header, check cookies
      if (!token) {
        const cookieHeader = request.headers.get('Cookie');
        if (cookieHeader) {
          const cookies = cookieHeader.split(';').map(c => c.trim());
          const sessionCookie = cookies.find(c => c.startsWith('session='));
          if (sessionCookie) {
            token = sessionCookie.split('=')[1];
          }
        }
      }
      
      // Validate session
      let user = null;
      if (token) {
        user = await validateSession(env, token);
      }
      
      // Build context
      const context = { request, env, ctx, user };
      
      // If module requires auth but user not logged in, redirect to home (login page)
      const requiresAuth = module.requiresAuth !== false && module.code !== 'home';
      if (!user && requiresAuth) {
        return Response.redirect(new URL('/', url), 302);
      }
      
      // Check module access if user is authenticated
      if (user) {
        // Admin module requires admin role
        if (module.requiresAdmin && user.role !== 'admin') {
          return new Response(JSON.stringify({
            error: 'Forbidden',
            message: 'Admin access required'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Profile module is always accessible to all authenticated users
        // Admins have access to ALL modules
        // Other users need module access (unless it's home or profile)
        if (user.role !== 'admin' && !module.requiresAdmin && module.code !== 'home' && module.code !== 'profile') {
          const userModules = getUserModules(user);
          const hasAccess = userModules.some(m => m.code === module.code);
          
          if (!hasAccess) {
            return new Response(JSON.stringify({
              error: 'Forbidden',
              message: 'You do not have access to this module'
            }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      }
      
      // Resolve and execute handler
      const result = resolveModuleRoute(module, request.method, pathname);
      if (result) {
        // Add params to context
        context.params = result.params;
        return await result.handler(context);
      }
    }

    // Module API routes (handled by module system)
    // All /forminator/* routes are now handled by the forminator-sync module
    // All /projects/* routes are now handled by the project-generator module
    
    // Legacy WordPress form fetcher (keep for now, used by forminator module)
    if (pathname.startsWith('/api/wordpress/form/')) {
      const wpFormMatch = pathname.match(/^\/api\/wordpress\/form\/([^\/]+)$/);
      if (wpFormMatch && request.method === 'GET') {
        const formId = wpFormMatch[1];
        const response = await requireAdminAuth(async ({ env }) => {
          try {
            const formData = await getForminatorForm(formId, env);
            const fields = extractFieldsFromForm(formData);
            const suggestedMapping = generateFieldMapping(fields);
            
            return new Response(JSON.stringify({
              success: true,
              form: {
                id: formData.id || formId,
                name: formData.settings?.formName || formData.name || `Form ${formId}`,
                fields: fields
              },
              suggested_mapping: suggestedMapping
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (error) {
            return new Response(JSON.stringify({
              success: false,
              error: error.message
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })({ request, env, ctx });
        return addCorsHeaders(response);
      }
    }

    // Legacy action-based routes (require public auth)
    const isAuthorized = await validateAuth(request, env);
    if (!isAuthorized) {
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized"
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    let data;
    const contentType = request.headers.get("Content-Type") || "";
    
    try {
      if (contentType.includes("application/json")) {
        data = await request.json();
      } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        // Parse form data
        const formData = await request.formData();
        data = {};
        for (const [key, value] of formData.entries()) {
          data[key] = value;
        }
      } else {
        // Try JSON first, then form data
        const clonedRequest = request.clone();
        try {
          data = await request.json();
        } catch {
          const formData = await clonedRequest.formData();
          data = {};
          for (const [key, value] of formData.entries()) {
            data[key] = value;
          }
        }
      }
    } catch (err) {
      console.error("Failed to parse request body:", err);
      return new Response("Invalid request body", { status: 400 });
    }

    // Get action from URL parameter, fallback to body
    const action = url.searchParams.get("action") || data.action;

    // Route to explicit actions
    if (ACTIONS[action]) {
      try {
        return await ACTIONS[action]({ request, env, ctx, data });
      } catch (err) {
        return new Response(JSON.stringify({ error: true, message: String(err?.message || err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
    } catch (error) {
      // Global error handler - prevents Workers from returning HTML error pages
      console.error('[Worker] Unhandled error in fetch:', error);
      console.error('[Worker] Error stack:', error.stack);
      console.error('[Worker] Request URL:', request.url);
      console.error('[Worker] Request method:', request.method);
      
      return new Response(JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        type: error.name || 'Error'
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
