// Odoo API wrapper functions

const ODOO_URL_PROD = "https://mymmo.odoo.com/jsonrpc";
const ODOO_URL_STAGING = "https://mymmo-test-22961179.dev.odoo.com/jsonrpc";
const ODOO_DB_STAGING = "mymmo-test-22961179";

function getOdooUrl({ staging = false, odooUrl } = {}) {
  if (odooUrl) return odooUrl;
  if (staging === true) return ODOO_URL_STAGING;
  return ODOO_URL_PROD;
}

export async function executeKw(env, { model, method, args = [], kwargs = {}, staging = false, odooUrl, odooDb }) {
  const dbName = typeof odooDb === "string" && odooDb.trim() || staging === true && ODOO_DB_STAGING || (env.DB_NAME || '').trim();
  
  // DEBUG: Log exact values
  console.log('🔍 DEBUG executeKw:');
  console.log('  env.DB_NAME:', JSON.stringify(env.DB_NAME));
  console.log('  dbName (final):', JSON.stringify(dbName));
  console.log('  odooDb param:', JSON.stringify(odooDb));
  console.log('  staging:', staging);
  
  const uid = Number.parseInt(env.UID, 10);
  if (!Number.isFinite(uid)) {
    throw new Error(`Env UID must be numeric, got: ${env.UID}`);
  }
  const apiKey = env.API_KEY;
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [dbName, uid, apiKey, model, method, args, kwargs]
    }
  };
  const url = getOdooUrl({ staging, odooUrl });
  
  // Helper function for timestamp
  const timestamp = () => new Date().toISOString().substring(11, 19);
  
  // Helper function for args preview
  const argsPreview = JSON.stringify(args).substring(0, 100);
  
  // Log request
  console.log(`🔵 ${timestamp()} | ${dbName} | ${model}.${method} | args: ${argsPreview}`);
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    const errorMsg = `JSON parse failed: ${e?.message}`;
    console.log(`❌ ${timestamp()} | ${dbName} | ${model}.${method} | ERROR: ${errorMsg}`);
    throw new Error(`Odoo JSON parse failed: ${e?.message}. Raw: ${raw.slice(0, 500)}`);
  }
  if (json.error) {
    const errorMsg = json.error.data?.message || json.error.message || JSON.stringify(json.error);
    console.log(`❌ ${timestamp()} | ${dbName} | ${model}.${method} | ERROR: ${errorMsg}`);
    throw new Error(`Odoo RPC error: ${JSON.stringify(json.error)}`);
  }
  
  // Helper function for result info
  const getResultInfo = (result) => {
    if (Array.isArray(result)) return `${result.length} items`;
    if (typeof result === 'object' && result !== null) return JSON.stringify(result).substring(0, 50);
    return String(result);
  };
  
  // Log success
  console.log(`✅ ${timestamp()} | ${dbName} | ${model}.${method} | ${res.status} | ${getResultInfo(json.result)}`);
  
  return json.result;
}

export async function search(env, { model, domain = [], limit, offset = 0, order, staging = false, odooUrl, odooDb }) {
  return executeKw(env, {
    model,
    method: "search",
    args: [domain],
    kwargs: { limit, offset, order },
    staging,
    odooUrl,
    odooDb
  });
}

export async function read(env, { model, ids, fields = [], staging = false, odooUrl, odooDb }) {
  return executeKw(env, {
    model,
    method: "read",
    args: [ids],
    kwargs: { fields },
    staging,
    odooUrl,
    odooDb
  });
}

export async function searchRead(env, { model, domain = [], fields = [], limit, offset = 0, order, context, staging = false, odooUrl, odooDb }) {
  const kwargs = { fields, offset, order, context };
  if (limit !== false && limit !== undefined) kwargs.limit = limit;
  return executeKw(env, {
    model,
    method: "search_read",
    args: [domain],
    kwargs,
    staging,
    odooUrl,
    odooDb
  });
}

export async function create(env, { model, values, staging = false, odooUrl, odooDb }) {
  return executeKw(env, {
    model,
    method: "create",
    args: [values],
    staging,
    odooUrl,
    odooDb
  });
}

export async function write(env, { model, ids, values, staging = false, odooUrl, odooDb }) {
  return executeKw(env, {
    model,
    method: "write",
    args: [ids, values],
    staging,
    odooUrl,
    odooDb
  });
}

export async function messagePost(env, { model, id, body, staging = false, odooUrl, odooDb }) {
  return executeKw(env, {
    model,
    method: "message_post",
    args: [[id]],
    kwargs: {
      body,
      message_type: 'comment',
      subtype_xmlid: 'mail.mt_note'
    },
    staging,
    odooUrl,
    odooDb
  });
}
