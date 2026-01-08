import { testConnection } from "./actions/test_connection.js";
import { receiveForminator } from "./actions/receive_forminator.js";
import { getMappings, getMapping, saveMapping, deleteMapping, importMappings, getMappingHistory, restoreMappingFromHistory } from "./actions/mappings_api.js";
import { handleHistoryGet, handleHistoryGetAll } from "./actions/history_api.js";
import { requireAdminAuth } from "./lib/admin_auth.js";
import { adminHTML } from "./lib/admin_interface.js";
import { getForminatorForm, extractFieldsFromForm, generateFieldMapping } from "./lib/wordpress.js";

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
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Helper to add CORS headers to any response
    const addCorsHeaders = (response) => {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

    // Serve admin interface HTML (no auth required for viewing)
    // BUT: don't serve HTML if there's an action parameter (that's for API)
    const hasAction = url.searchParams.has('action');
    if ((pathname === '/' || pathname === '/admin' || pathname === '/admin/') && !hasAction) {
      return new Response(adminHTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // API routes for admin interface (require admin auth)
    if (pathname.startsWith('/api/mappings')) {
      // GET /api/mappings - Get all mappings
      if (pathname === '/api/mappings' && request.method === 'GET') {
        const response = await requireAdminAuth(getMappings)({ request, env, ctx });
        return addCorsHeaders(response);
      }
      
      // POST /api/mappings/sync-prod - DEPRECATED (KV sync not needed with Supabase)
      if (pathname === '/api/mappings/sync-prod' && request.method === 'POST') {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'KV sync deprecated - Supabase is now the single source of truth'
        }), { 
          status: 410, 
          headers: { 'Content-Type': 'application/json' } 
        }));
      }
      
      // POST /api/mappings/import - Import entire mappings JSON
      if (pathname === '/api/mappings/import' && request.method === 'POST') {
        const data = await request.json();
        const response = await requireAdminAuth(importMappings)({ request, env, ctx, data });
        return addCorsHeaders(response);
      }
      
      // GET /api/wordpress/form/:formId - Fetch form from WordPress
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
      
      // Extract formId from path: /api/mappings/:formId
      const formIdMatch = pathname.match(/^\/api\/mappings\/([^\/]+)(?:\/(.+))?$/);
      if (formIdMatch) {
        const formId = formIdMatch[1];
        const subpath = formIdMatch[2];
        
        // GET /api/mappings/:formId/history - Get form mapping history
        if (subpath === 'history' && request.method === 'GET') {
          const response = await requireAdminAuth(getMappingHistory)({ request, env, ctx, formId });
          return addCorsHeaders(response);
        }
        
        // POST /api/mappings/:formId/restore - Restore from history
        if (subpath === 'restore' && request.method === 'POST') {
          const data = await request.json();
          const response = await requireAdminAuth(restoreMappingFromHistory)({ request, env, ctx, formId, data });
          return addCorsHeaders(response);
        }
        
        // GET /api/mappings/:formId - Get specific form mapping
        if (!subpath && request.method === 'GET') {
          const response = await requireAdminAuth(getMapping)({ request, env, ctx, formId });
          return addCorsHeaders(response);
        }
        
        // POST /api/mappings/:formId - Save/update form mapping
        if (!subpath && request.method === 'POST') {
          const data = await request.json();
          const response = await requireAdminAuth(saveMapping)({ request, env, ctx, formId, data });
          return addCorsHeaders(response);
        }
        
        // DELETE /api/mappings/:formId - Delete form mapping
        if (!subpath && request.method === 'DELETE') {
          const response = await requireAdminAuth(deleteMapping)({ request, env, ctx, formId });
          return addCorsHeaders(response);
        }
      }
      
      return new Response(JSON.stringify({ error: 'Invalid API endpoint' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // API route for history
    if (pathname.startsWith('/api/history')) {
      // GET /api/history - Get ALL history across all forms
      if (pathname === '/api/history' && request.method === 'GET') {
        const response = await requireAdminAuth(handleHistoryGetAll)({ request, env, ctx });
        return addCorsHeaders(response);
      }
      
      // GET /api/history/:formId - Get history for specific form
      const formIdMatch = pathname.match(/^\/api\/history\/([^\/]+)$/);
      if (formIdMatch && request.method === 'GET') {
        const formId = formIdMatch[1];
        const response = await requireAdminAuth(handleHistoryGet)({ request, env, ctx, formId });
        return addCorsHeaders(response);
      }
      
      return new Response(JSON.stringify({ error: 'Invalid history API endpoint' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
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
  }
};
