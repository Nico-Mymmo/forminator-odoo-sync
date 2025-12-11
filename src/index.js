import { testConnection } from "./actions/test_connection.js";

const ACTIONS = {
  test_connection: testConnection,
};

// Validate authentication using either header or query parameter
async function validateAuth(request, env) {
  // First check Authorization header (preferred method)
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token === env.AUTH_TOKEN) {
      return true;
    }
  }

  // If no valid header, check query parameter
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get("token");
  if (tokenParam && tokenParam === env.AUTH_TOKEN) {
    return true;
  }

  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Validate authentication for all routes
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
