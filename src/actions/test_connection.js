import { searchRead } from "../lib/odoo.js";

/**
 * Test connection to Odoo
 * Fetches a simple record to verify the entire flow works
 */
export async function testConnection({ env, user }) {
  // Check authentication
  if (!user) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unauthorized' 
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Fetch first partner from Odoo to test connection
  const partners = await searchRead(env, {
    model: "res.partner",
    domain: [],
    fields: ["id", "name", "email"],
    limit: 3,
    order: "id desc"
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Connection to Odoo successful",
    sample_data: partners,
    env_check: {
      has_db_name: !!env.DB_NAME,
      has_uid: !!env.UID,
      has_api_key: !!env.API_KEY,
      db_name: env.DB_NAME
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
