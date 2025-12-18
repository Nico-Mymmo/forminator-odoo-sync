import { testConnection } from "./actions/test_connection.js";
import { receiveForminator } from "./actions/receive_forminator.js";
import { getMappings, getMapping, saveMapping, deleteMapping, importMappings } from "./actions/mappings_api.js";
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
        return requireAdminAuth(getMappings)({ request, env, ctx });
      }
      
      // POST /api/mappings/import - Import entire mappings JSON
      if (pathname === '/api/mappings/import' && request.method === 'POST') {
        const data = await request.json();
        return requireAdminAuth(importMappings)({ request, env, ctx, data });
      }
      
      // GET /api/wordpress/form/:formId - Fetch form from WordPress
      const wpFormMatch = pathname.match(/^\/api\/wordpress\/form\/([^\/]+)$/);
      if (wpFormMatch && request.method === 'GET') {
        const formId = wpFormMatch[1];
        return requireAdminAuth(async ({ env }) => {
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
      }
      
      // Extract formId from path: /api/mappings/:formId
      const formIdMatch = pathname.match(/^\/api\/mappings\/([^\/]+)$/);
      if (formIdMatch) {
        const formId = formIdMatch[1];
        
        // GET /api/mappings/:formId - Get specific form mapping
        if (request.method === 'GET') {
          return requireAdminAuth(getMapping)({ request, env, ctx, formId });
        }
        
        // POST /api/mappings/:formId - Save/update form mapping
        if (request.method === 'POST') {
          const data = await request.json();
          return requireAdminAuth(saveMapping)({ request, env, ctx, formId, data });
        }
        
        // DELETE /api/mappings/:formId - Delete form mapping
        if (request.method === 'DELETE') {
          return requireAdminAuth(deleteMapping)({ request, env, ctx, formId });
        }
      }
      
      return new Response(JSON.stringify({ error: 'Invalid API endpoint' }), {
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
