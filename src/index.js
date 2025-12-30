import { testConnection } from "./actions/test_connection.js";
import { receiveForminator } from "./actions/receive_forminator.js";
import { getMappings, getMapping, saveMapping, deleteMapping, importMappings } from "./actions/mappings_api.js";
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
    if (pathname === '/admin' || pathname === '/admin/') {
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
      
      // POST /api/mappings/sync-prod - Sync production data to preview (dev only)
      if (pathname === '/api/mappings/sync-prod' && request.method === 'POST') {
        const response = await requireAdminAuth(async ({ env }) => {
          try {
            // In dev mode, we need to fetch from the remote production namespace
            // Use the Cloudflare API to fetch directly
            const accountId = env.CLOUDFLARE_ACCOUNT_ID;
            const apiToken = env.CLOUDFLARE_API_TOKEN;
            const prodNamespaceId = '04e4118b842b48a58f5777e008931026';
            
            if (!accountId || !apiToken) {
              return new Response(JSON.stringify({
                success: false,
                error: 'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .dev.vars for sync to work'
              }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            
            // Fetch from production KV via Cloudflare API
            const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${prodNamespaceId}/values/mappings`;
            const kvResponse = await fetch(kvUrl, {
              headers: {
                'Authorization': `Bearer ${apiToken}`
              }
            });
            
            if (!kvResponse.ok) {
              throw new Error(`Failed to fetch production data: ${kvResponse.statusText}`);
            }
            
            const mappingsJson = await kvResponse.json();
            
            // Write to current (preview) namespace
            await env.MAPPINGS_KV.put('mappings', JSON.stringify(mappingsJson, null, 2));
            
            return new Response(JSON.stringify({
              success: true,
              message: `Synced ${Object.keys(mappingsJson).filter(k => !k.startsWith('_')).length} forms from production`
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          } catch (error) {
            return new Response(JSON.stringify({
              success: false,
              error: error.message
            }), { status: 500, headers: { 'Content-Type': 'application/json' } });
          }
        })({ request, env, ctx });
        return addCorsHeaders(response);
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
      const formIdMatch = pathname.match(/^\/api\/mappings\/([^\/]+)$/);
      if (formIdMatch) {
        const formId = formIdMatch[1];
        
        // GET /api/mappings/:formId - Get specific form mapping
        if (request.method === 'GET') {
          const response = await requireAdminAuth(getMapping)({ request, env, ctx, formId });
          return addCorsHeaders(response);
        }
        
        // POST /api/mappings/:formId - Save/update form mapping
        if (request.method === 'POST') {
          const data = await request.json();
          const response = await requireAdminAuth(saveMapping)({ request, env, ctx, formId, data });
          return addCorsHeaders(response);
        }
        
        // DELETE /api/mappings/:formId - Delete form mapping
        if (request.method === 'DELETE') {
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
    try { data = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

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
