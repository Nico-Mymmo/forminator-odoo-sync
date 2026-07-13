/**
 * Mini-Apps — Gedeelde opslag (shared storage), backed door R2
 *
 * Kleine/document-achtige data die een mini-app over gebruikers heen wil delen
 * (bv. een teller, een gedeelde checklist, een recurring schema) -- in
 * tegenstelling tot de per-browser in-memory localStorage-shim in de iframe
 * (public/mini-apps.js), die niet persisteert en niet gedeeld wordt.
 *
 * Waarom R2 en niet de Supabase-database (zoals de rest van deze module)?
 * Met een quotum van 10 MB per app zou dit, opgeteld over veel apps, de
 * 500 MB gratis Supabase-databaseopslag delen met alle echte bedrijfsdata
 * (forms, leads, event-registraties, ...). Cloudflare R2 heeft 10 GB gratis
 * opslag, geen egress-kosten, en is al de plek waar de app-inhoud zelf staat
 * (zie lib/r2-client.js) -- past dus beter bij "veel kleine documenten,
 * eventueel best wat data per app".
 *
 * Key-layout in R2 (allemaal onder env.R2_ASSETS, key-prefix "mini-apps-storage/"):
 *   mini-apps-storage/{appId}/kv/{encodeURIComponent(key)}
 *     -- platte key/value-paren (get/set/remove/list)
 *   mini-apps-storage/{appId}/collections/{encodeURIComponent(collection)}/{itemId}
 *     -- collection-items; itemId = server-gegenereerde UUID, dus twee
 *     gebruikers die tegelijk een item toevoegen krijgen elk hun eigen key
 *     en botsen nooit (in tegenstelling tot één grote JSON-lijst die je in
 *     zijn geheel zou overschrijven -- daar verlies je dan de andere edit).
 *
 * Rechtencontrole (canView) gebeurt in routes.js, niet hier.
 */

const PREFIX = 'mini-apps-storage/';

// ─── Quota's ─────────────────────────────────────────────────────────────────
// Ruim genoeg voor "eigen kleine databases" (recurring schema's, checklists,
// gedeelde lijsten) maar geen vervanging voor een echte database.

export const MAX_KEY_LENGTH = 200;
export const MAX_VALUE_BYTES = 1 * 1024 * 1024;      // 1 MB per key/item
export const MAX_OBJECTS_PER_APP = 500;              // max aantal keys + collection-items samen
export const MAX_TOTAL_BYTES_PER_APP = 10 * 1024 * 1024; // 10 MB totaal per app

function byteLength(str) {
  return new TextEncoder().encode(str).byteLength;
}

function encodeSegment(s) {
  return encodeURIComponent(String(s));
}

function kvKey(appId, key) {
  return `${PREFIX}${appId}/kv/${encodeSegment(key)}`;
}

function collectionPrefix(appId, collection) {
  return `${PREFIX}${appId}/collections/${encodeSegment(collection)}/`;
}

function collectionItemKey(appId, collection, itemId) {
  return `${collectionPrefix(appId, collection)}${encodeSegment(itemId)}`;
}

/**
 * Haalt ALLE objecten (kv + collection-items) van een app op, met hun grootte
 * -- alleen metadata, geen bodies. Gebruikt voor quota-controle en usage().
 * R2 list() geeft max 1000 objecten per call terug; bij ons quotum
 * (MAX_OBJECTS_PER_APP) is één call altijd voldoende, maar we volgen
 * `truncated`/`cursor` toch netjes op voor de zekerheid.
 */
async function listAppObjects(env, appId) {
  const objects = [];
  let cursor;
  do {
    const page = await env.R2_ASSETS.list({ prefix: `${PREFIX}${appId}/`, cursor });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

function quotaError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Controleert of een nieuwe/vervangen waarde binnen de quota's van de app
 * blijft. `existingKey` is de volledige R2-key die vervangen wordt (undefined
 * bij een nieuw item, bv. altijd het geval voor collection-items).
 */
async function assertWithinQuota(env, appId, existingKey, newValueBytes) {
  const objects = await listAppObjects(env, appId);
  const existing = existingKey ? objects.find(o => o.key === existingKey) : undefined;
  const isNew = !existing;

  if (isNew && objects.length >= MAX_OBJECTS_PER_APP) {
    throw quotaError(`Maximum aantal keys/items per app (${MAX_OBJECTS_PER_APP}) bereikt.`, 'TOO_MANY_KEYS');
  }

  const currentTotal = objects.reduce((sum, o) => sum + o.size, 0);
  const previousBytes = existing ? existing.size : 0;
  const newTotal = currentTotal - previousBytes + newValueBytes;
  if (newTotal > MAX_TOTAL_BYTES_PER_APP) {
    throw quotaError(
      `Totale opslag-limiet per app (${MAX_TOTAL_BYTES_PER_APP / 1024 / 1024} MB) bereikt.`,
      'STORAGE_QUOTA_EXCEEDED'
    );
  }
}

function validateKeyAndValue(key, value) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw quotaError(`Key moet 1-${MAX_KEY_LENGTH} tekens zijn.`, 'INVALID_KEY');
  }
  if (typeof value !== 'string') {
    throw quotaError('Waarde moet een string zijn.', 'INVALID_VALUE');
  }
  const valueBytes = byteLength(value);
  if (valueBytes > MAX_VALUE_BYTES) {
    throw quotaError(`Waarde te groot. Maximum is ${MAX_VALUE_BYTES / 1024 / 1024} MB per key.`, 'VALUE_TOO_LARGE');
  }
  return valueBytes;
}

// ─── Platte key/value-opslag ─────────────────────────────────────────────────

/**
 * Haalt alle key/value-paren van een app op als plain object.
 * N losse gets na de list (R2 list geeft geen bodies terug) -- prima voor de
 * kleine aantallen die deze quota's toelaten.
 */
export async function listStorage(env, appId) {
  const page = await env.R2_ASSETS.list({ prefix: `${PREFIX}${appId}/kv/` });
  const entries = await Promise.all(page.objects.map(async (o) => {
    const obj = await env.R2_ASSETS.get(o.key);
    const decodedKey = decodeURIComponent(o.key.slice(o.key.lastIndexOf('/') + 1));
    return [decodedKey, obj ? await obj.text() : null];
  }));
  const result = {};
  for (const [key, value] of entries) {
    if (value !== null) result[key] = value;
  }
  return result;
}

/**
 * Haalt één waarde op, of null als de key niet bestaat.
 */
export async function getStorageValue(env, appId, key) {
  const obj = await env.R2_ASSETS.get(kvKey(appId, key));
  if (!obj) return null;
  return await obj.text();
}

/**
 * Zet (upsert) één key/value-paar, met quota-afdwinging.
 * Gooit een Error met een `.code` property bij een quota-overschrijding.
 */
export async function setStorageValue(env, appId, key, value) {
  const valueBytes = validateKeyAndValue(key, value);
  const r2Key = kvKey(appId, key);
  await assertWithinQuota(env, appId, r2Key, valueBytes);
  await env.R2_ASSETS.put(r2Key, value, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
}

/**
 * Verwijdert één key. Geen fout als de key niet bestaat (idempotent, zoals R2.delete()).
 */
export async function deleteStorageValue(env, appId, key) {
  await env.R2_ASSETS.delete(kvKey(appId, key));
}

// ─── Collections (concurrency-veilig: 1 item = 1 R2-object) ────────────────

/**
 * Haalt alle items van een collection op als [{ id, value }, ...].
 */
export async function listCollectionItems(env, appId, collection) {
  const page = await env.R2_ASSETS.list({ prefix: collectionPrefix(appId, collection) });
  const items = await Promise.all(page.objects.map(async (o) => {
    const obj = await env.R2_ASSETS.get(o.key);
    const id = decodeURIComponent(o.key.slice(o.key.lastIndexOf('/') + 1));
    return { id, value: obj ? await obj.text() : null };
  }));
  return items.filter(item => item.value !== null);
}

/**
 * Voegt een nieuw item toe aan een collection. Genereert altijd een verse
 * UUID als item-id -- dit is precies waarom collections geen lost updates
 * kunnen hebben bij gelijktijdige toevoegingen door verschillende gebruikers.
 */
export async function addCollectionItem(env, appId, collection, value) {
  if (typeof value !== 'string') {
    throw quotaError('Waarde moet een string zijn.', 'INVALID_VALUE');
  }
  const valueBytes = byteLength(value);
  if (valueBytes > MAX_VALUE_BYTES) {
    throw quotaError(`Waarde te groot. Maximum is ${MAX_VALUE_BYTES / 1024 / 1024} MB per item.`, 'VALUE_TOO_LARGE');
  }
  const id = crypto.randomUUID();
  const r2Key = collectionItemKey(appId, collection, id);
  await assertWithinQuota(env, appId, undefined, valueBytes); // altijd nieuw object
  await env.R2_ASSETS.put(r2Key, value, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  return { id, value };
}

/**
 * Wijzigt een BESTAAND item in-place (zelfde id blijft behouden) -- nodig om
 * bv. een boodschappenlijst-item als "aangekocht" te markeren zonder het als
 * nieuw item opnieuw te moeten aanmaken (dat zou het item-id laten
 * verspringen en is dus geen "update" meer voor de rest van de app).
 * Idempotent qua bestaan: als het item niet meer bestaat, wordt het gewoon
 * opnieuw aangemaakt onder hetzelfde id (upsert) -- eenvoudiger en even veilig
 * als een aparte 404 hier, de aanroeper bepaalt zelf de betekenis van het id.
 */
export async function updateCollectionItem(env, appId, collection, itemId, value) {
  if (typeof value !== 'string') {
    throw quotaError('Waarde moet een string zijn.', 'INVALID_VALUE');
  }
  const valueBytes = byteLength(value);
  if (valueBytes > MAX_VALUE_BYTES) {
    throw quotaError(`Waarde te groot. Maximum is ${MAX_VALUE_BYTES / 1024 / 1024} MB per item.`, 'VALUE_TOO_LARGE');
  }
  const r2Key = collectionItemKey(appId, collection, itemId);
  await assertWithinQuota(env, appId, r2Key, valueBytes); // bestaand item -> niet dubbel meetellen in de quota
  await env.R2_ASSETS.put(r2Key, value, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  return { id: itemId, value };
}

/**
 * Verwijdert één item uit een collection. Idempotent.
 */
export async function removeCollectionItem(env, appId, collection, itemId) {
  await env.R2_ASSETS.delete(collectionItemKey(appId, collection, itemId));
}

/**
 * Haalt ALLE collections van een app in één keer op, gegroepeerd per naam --
 * { collectionNaam: [{ id, value }, ...] }. Gebruikt door lib/scheduler.js om
 * de template-context voor een geplande taak op te bouwen: de taak kent enkel
 * de collection-naam die de app-bouwer zelf gebruikt (bv. "boodschappen"),
 * niet vooraf bekend bij ons -- dus lezen we alle collections onder de app in
 * één R2-list en groeperen we zelf, in plaats van per naam een aparte call te
 * vereisen. Blijft bounded door de bestaande MAX_OBJECTS_PER_APP-quota.
 */
export async function listAllCollections(env, appId) {
  const prefix = `${PREFIX}${appId}/collections/`;
  const objects = [];
  let cursor;
  do {
    const page = await env.R2_ASSETS.list({ prefix, cursor });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const grouped = {};
  await Promise.all(objects.map(async (o) => {
    const rest = o.key.slice(prefix.length); // "{collectionEnc}/{itemIdEnc}"
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) return;
    const collection = decodeURIComponent(rest.slice(0, slashIdx));
    const id = decodeURIComponent(rest.slice(slashIdx + 1));
    const obj = await env.R2_ASSETS.get(o.key);
    if (!obj) return;
    const value = await obj.text();
    if (!grouped[collection]) grouped[collection] = [];
    grouped[collection].push({ id, value });
  }));
  return grouped;
}

// ─── Quotum-overzicht (voor de Instellingen-tab) ────────────────────────────

/**
 * @returns {Promise<{usedBytes:number, maxBytes:number, objectCount:number, maxObjects:number}>}
 */
export async function getStorageUsage(env, appId) {
  const objects = await listAppObjects(env, appId);
  return {
    usedBytes: objects.reduce((sum, o) => sum + o.size, 0),
    maxBytes: MAX_TOTAL_BYTES_PER_APP,
    objectCount: objects.length,
    maxObjects: MAX_OBJECTS_PER_APP
  };
}

/**
 * Verwijdert ALLE gedeelde opslag (kv + collection-items) van één app in
 * één keer -- gebruikt door routes.js bij DELETE /api/apps/:id, zodat een
 * verwijderde app geen orphaned R2-objecten achterlaat onder
 * mini-apps-storage/{appId}/ (dat prefix wordt door niets anders opgeruimd:
 * het is geen databaserij met een FK/CASCADE, gewoon losse R2-objecten).
 * R2.delete() aanvaardt tot 1000 keys per aanroep -- ons quotum
 * (MAX_OBJECTS_PER_APP = 500) blijft daar ruim onder, dus altijd één call.
 * Idempotent: geen fout als er niets (meer) is om te verwijderen.
 */
export async function deleteAllStorage(env, appId) {
  const objects = await listAppObjects(env, appId);
  if (objects.length === 0) return;
  await env.R2_ASSETS.delete(objects.map(o => o.key));
}
