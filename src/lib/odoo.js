// Odoo API wrapper functions

const ODOO_URL_PROD = "https://mymmo.odoo.com/jsonrpc";
const ODOO_URL_STAGING = "https://mymmo-test-22961179.dev.odoo.com/jsonrpc";
const ODOO_DB_STAGING = "mymmo-test-22961179";

// ADDENDUM L: Centralized throttling to prevent rate limits.
//
// De oorspronkelijke versie zette een VASTE minimumtussenpauze (200ms)
// tussen ELKE twee Odoo-calls, via één gedeelde timestamp -- dat beschermt
// wel tegen een lawine van calls, maar saboteerde net zo hard elke plek die
// bewust Promise.all() gebruikt om calls PARALLEL te laten lopen (bv.
// listEvents() in event-operations-v2: drie calls tegelijk, "dat halveert
// de wachttijd" volgens de eigen code-comment daar). Met een vaste
// tussenpauze kwamen die drie calls er in de praktijk juist NA elkaar uit,
// met ~200ms wachttijd ertussen -- op een pagina met een kalender- én een
// lijst-shortcode liep dat samen op tot ruim een halve seconde pure,
// nutteloze wachttijd, bovenop de echte netwerktijd.
//
// Vervangen door een concurrency-limiter: maximaal N Odoo-calls TEGELIJK
// in de lucht vanuit deze Worker-instance, in plaats van een minimum-
// interval tussen calls die niet per se na elkaar hoeven. Een bewuste
// kleine Promise.all-groep (2-4 calls, zoals hierboven) loopt weer echt
// parallel; pas bij een write-piek (een lus met veel create()'s, of
// meerdere bezoekers tegelijk) treedt de limiet nog op.
const MAX_CONCURRENT_ODOO_CALLS = 6;
let activeOdooCalls = 0;
const odooCallQueue = [];

/** Wacht tot er een vrije "slot" is, in plaats van tot een vaste tijd verstreken is. */
async function acquireOdooSlot() {
  if (activeOdooCalls < MAX_CONCURRENT_ODOO_CALLS) {
    activeOdooCalls += 1;
    return;
  }
  await new Promise((resolve) => odooCallQueue.push(resolve));
  activeOdooCalls += 1;
}

/** Slot vrijgeven en de langst wachtende call (indien die er is) meteen laten starten. */
function releaseOdooSlot() {
  activeOdooCalls -= 1;
  const next = odooCallQueue.shift();
  if (next) next();
}

function getOdooUrl({ staging = false, odooUrl } = {}) {
  if (odooUrl) return odooUrl;
  if (staging === true) return ODOO_URL_STAGING;
  return ODOO_URL_PROD;
}

export async function executeKw(env, { model, method, args = [], kwargs = {}, staging = false, odooUrl, odooDb }) {
  // ADDENDUM L: wacht op een vrije concurrency-slot in plaats van een vaste
  // pauze -- zie de uitleg bij acquireOdooSlot() hierboven.
  await acquireOdooSlot();

  try {
    const dbName = typeof odooDb === "string" && odooDb.trim() || staging === true && ODOO_DB_STAGING || (env.DB_NAME || '').trim();

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
    const ts = () => new Date().toISOString().substring(11, 19);

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
      console.log(`[Odoo ${ts()}] ❌ ${model}.${method} — parse error: ${e?.message}`);
      throw new Error(`Odoo JSON parse failed: ${e?.message}. Raw: ${raw.slice(0, 500)}`);
    }
    if (json.error) {
      const errorMsg = json.error.data?.message || json.error.message || JSON.stringify(json.error);
      console.log(`[Odoo ${ts()}] ❌ ${model}.${method} — ${errorMsg}`);
      throw new Error(`Odoo RPC error: ${JSON.stringify(json.error)}`);
    }
    const resultInfo = Array.isArray(json.result) ? `${json.result.length} items` : String(json.result).substring(0, 60);
    console.log(`[Odoo ${ts()}] ${model}.${method} → ${resultInfo}`);

    return json.result;
  } finally {
    releaseOdooSlot();
  }
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
  // false = explicitly tell Odoo "no limit"; undefined = omit the key (Odoo uses server default)
  if (limit !== undefined) kwargs.limit = limit;
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

/**
 * Batch create multiple records (ADDENDUM L: Layer 3 optimization)
 * 
 * Creates multiple records in a single Odoo API call.
 * Odoo's create() method supports both single dict and array of dicts.
 * Returns array of created IDs in same order as input.
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} options - Options
 * @param {string} options.model - Odoo model name
 * @param {Array<Object>} options.valuesArray - Array of value dicts to create
 * @param {boolean} [options.staging=false] - Use staging environment
 * @param {string} [options.odooUrl] - Custom Odoo URL
 * @param {string} [options.odooDb] - Custom Odoo DB name
 * @returns {Promise<Array<number>>} Array of created record IDs
 */
export async function batchCreate(env, { model, valuesArray, staging = false, odooUrl, odooDb }) {
  if (!Array.isArray(valuesArray) || valuesArray.length === 0) {
    throw new Error('batchCreate requires non-empty valuesArray');
  }
  
  // Single call with array of values - Odoo returns array of IDs
  return executeKw(env, {
    model,
    method: "create",
    args: [valuesArray],
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

/**
 * Plaatst een chatterbericht.
 *
 * `isHtml` is NIET cosmetisch. Zonder `body_is_html` behandelt Odoo de body
 * als platte tekst en escapet ze: een body met opmaak komt dan als LETTERLIJKE
 * tekst in de chatter te staan -- "&lt;div style=...&gt;Mail geopend ...&lt;/div&gt;",
 * tags en al, precies zoals het er in de chatter van een contact uitzag.
 * De omweg die daarvoor in gebruik was (inline styling toevoegen zodat Odoo
 * het "als echte HTML zou herkennen") werkt niet -- alleen deze kwarg doet dat.
 *
 * De standaard blijft `false`: er zijn aanroepers die bewust platte,
 * ONGEESCAPETE tekst doorgeven (een gebruikersnaam, een kleurcode). Voor die
 * hoort Odoo's escaping juist te blijven werken. Zet `isHtml` dus alleen waar
 * de body echt HTML is EN elke ingevoegde waarde al geescaped wordt.
 */
export async function messagePost(env, { model, id, body, isHtml = false, staging = false, odooUrl, odooDb }) {
  return executeKw(env, {
    model,
    method: "message_post",
    args: [[id]],
    kwargs: {
      body,
      ...(isHtml ? { body_is_html: true } : {}),
      message_type: 'comment',
      subtype_xmlid: 'mail.mt_note'
    },
    staging,
    odooUrl,
    odooDb
  });
}
