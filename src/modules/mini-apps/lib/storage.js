/**
 * Mini-Apps — Gedeelde opslag (window.sharedStorage)
 *
 * Gegevens die een mini-app over gebruikers heen deelt (een teller, een
 * gedeelde checklist, een rooster). Sinds 2026-10 heeft elke mini-app een
 * EIGEN SQLite-database, in een Durable Object (lib/storage-do.js, binding
 * MINI_APP_STORAGE). Dit bestand is de enige toegang ertoe: routes.js,
 * scheduler.js en condition-scheduler.js roepen deze functies aan, nooit het
 * Durable Object rechtstreeks.
 *
 * Waarom het vroeger R2 was, en waarom dat niet meer hoeft: met 10 MB per
 * app zou dit in Supabase de 500 MB gratis databaseopslag delen met alle
 * echte bedrijfsdata, dus werd het R2, met één object per key of item. Dat
 * dwong een krap quotum af (500 objecten, 10 MB), een volledige lijst van de
 * app bij ELKE schrijfactie om het quotum na te rekenen, en een GET per item
 * bij elke lijst. Een database per app heeft geen van die drie nodig, en kan
 * op de server filteren (zie lib/storage-query.js).
 *
 * De oude R2-objecten (mini-apps-storage/{appId}/...) blijven staan als
 * back-up van de stand op het moment van verhuizen; ze worden niet meer
 * gelezen of geschreven, behalve door die eenmalige verhuizing en bij het
 * verwijderen van een app.
 *
 * De vorm naar buiten is ONGEWIJZIGD: dezelfde functies, dezelfde
 * teruggavewaarden ({ id, value }), dezelfde foutcodes. Bestaande mini-apps
 * merken niets van de verhuizing.
 *
 * Rechtencontrole (canView) gebeurt in routes.js, niet hier.
 */

import { normalizeQuery } from './storage-query.js';

// ─── Quota's ─────────────────────────────────────────────────────────────────
// Een Durable Object kan 10 GB aan; de grens hier is wat een mini-app
// redelijkerwijs nodig heeft, niet wat technisch kan.

export const MAX_KEY_LENGTH = 200;
export const MAX_COLLECTION_LENGTH = 200;
export const MAX_ITEM_ID_LENGTH = 200;
export const MAX_VALUE_BYTES = 1 * 1024 * 1024;           // 1 MB per key/item (een SQLite-rij in een DO mag max 2 MB)
export const MAX_OBJECTS_PER_APP = 50000;                 // keys + collection-items samen (was 500)
export const MAX_TOTAL_BYTES_PER_APP = 100 * 1024 * 1024; // 100 MB per app (was 10 MB)
// Wat er in ÉÉN antwoord terug mag: een lijst zonder filter, of de context van
// een geplande taak. Meer past niet veilig in het geheugen van een Worker; wie
// meer heeft, haalt het in delen op met where/limit/offset.
export const MAX_RESULT_BYTES = 16 * 1024 * 1024;

function byteLength(str) {
  return new TextEncoder().encode(str).byteLength;
}

function quotaError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function store(env, appId) {
  if (!env.MINI_APP_STORAGE) {
    throw new Error('Binding MINI_APP_STORAGE ontbreekt (zie durable_objects in wrangler.jsonc).');
  }
  return env.MINI_APP_STORAGE.get(env.MINI_APP_STORAGE.idFromName(appId));
}

/** Pakt het { ok, data } / { ok: false, code, message }-antwoord van het Durable Object uit. */
async function unwrap(promise) {
  const result = await promise;
  if (!result || result.ok !== true) {
    throw quotaError((result && result.message) || 'Onbekende opslagfout.', (result && result.code) || 'STORAGE_ERROR');
  }
  return result.data;
}

function validateKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw quotaError(`Key moet 1-${MAX_KEY_LENGTH} tekens zijn.`, 'INVALID_KEY');
  }
}

function validateCollection(collection) {
  if (typeof collection !== 'string' || collection.length === 0 || collection.length > MAX_COLLECTION_LENGTH) {
    throw quotaError(`Naam van de collection moet 1-${MAX_COLLECTION_LENGTH} tekens zijn.`, 'INVALID_COLLECTION');
  }
}

function validateItemId(itemId) {
  if (typeof itemId !== 'string' || itemId.length === 0 || itemId.length > MAX_ITEM_ID_LENGTH) {
    throw quotaError(`Item-id moet 1-${MAX_ITEM_ID_LENGTH} tekens zijn.`, 'INVALID_ITEM_ID');
  }
}

function validateValue(value, what) {
  if (typeof value !== 'string') {
    throw quotaError('Waarde moet een string zijn.', 'INVALID_VALUE');
  }
  if (byteLength(value) > MAX_VALUE_BYTES) {
    throw quotaError(`Waarde te groot. Maximum is ${MAX_VALUE_BYTES / 1024 / 1024} MB per ${what}.`, 'VALUE_TOO_LARGE');
  }
}

// ─── Platte key/value-opslag ─────────────────────────────────────────────────

/**
 * Alle key/value-paren van een app als plain object.
 */
export async function listStorage(env, appId) {
  return unwrap(store(env, appId).kvList(appId));
}

/**
 * Eén waarde, of null als de key niet bestaat. Een key die nooit gezet kon
 * worden (te lang, leeg) bestaat per definitie niet: null, geen fout -- zo
 * gedroeg het zich ook in R2.
 */
export async function getStorageValue(env, appId, key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) return null;
  return unwrap(store(env, appId).kvGet(appId, key));
}

/**
 * Zet (upsert) één key/value-paar, met quota-afdwinging.
 * Gooit een Error met een `.code` property bij een quota-overschrijding.
 */
export async function setStorageValue(env, appId, key, value) {
  validateKey(key);
  validateValue(value, 'key');
  await unwrap(store(env, appId).kvSet(appId, key, value));
}

/**
 * Verwijdert één key. Geen fout als de key niet bestaat (idempotent).
 */
export async function deleteStorageValue(env, appId, key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) return;
  await unwrap(store(env, appId).kvDelete(appId, key));
}

// ─── Collections (concurrency-veilig: 1 item = 1 rij) ───────────────────────

/**
 * Items van een collection als [{ id, value }, ...], in de volgorde waarin
 * ze toegevoegd werden. `query` is optioneel (where/orderBy/order/limit/
 * offset, zie lib/storage-query.js); zonder query: alles, zoals vroeger.
 * Een ongeldig filter gooit een Error met code INVALID_QUERY.
 */
export async function listCollectionItems(env, appId, collection, query) {
  validateCollection(collection);
  const normalized = normalizeQuery(query);
  return unwrap(store(env, appId).itemsList(appId, collection, normalized));
}

/**
 * Aantal items in een collection dat aan het filter voldoet (limit/offset
 * tellen niet mee).
 */
export async function countCollectionItems(env, appId, collection, query) {
  validateCollection(collection);
  const normalized = normalizeQuery(query);
  return unwrap(store(env, appId).itemsCount(appId, collection, normalized));
}

/**
 * Voegt een nieuw item toe. Het id is altijd een verse UUID van de server --
 * daarom kunnen twee gelijktijdige toevoegingen elkaar nooit overschrijven.
 */
export async function addCollectionItem(env, appId, collection, value) {
  validateCollection(collection);
  validateValue(value, 'item');
  return unwrap(store(env, appId).itemAdd(appId, collection, value));
}

/**
 * Wijzigt een BESTAAND item in-place (zelfde id). Bestaat het item niet
 * (meer), dan komt het er opnieuw bij onder dat id (upsert) -- zoals het
 * altijd gewerkt heeft; de aanroeper bepaalt zelf de betekenis van het id.
 */
export async function updateCollectionItem(env, appId, collection, itemId, value) {
  validateCollection(collection);
  validateItemId(itemId);
  validateValue(value, 'item');
  return unwrap(store(env, appId).itemUpdate(appId, collection, itemId, value));
}

/**
 * Verwijdert één item. Idempotent.
 */
export async function removeCollectionItem(env, appId, collection, itemId) {
  if (typeof collection !== 'string' || !collection || collection.length > MAX_COLLECTION_LENGTH) return;
  if (typeof itemId !== 'string' || !itemId || itemId.length > MAX_ITEM_ID_LENGTH) return;
  await unwrap(store(env, appId).itemRemove(appId, collection, itemId));
}

/**
 * ALLE collections van een app, gegroepeerd per naam --
 * { collectionNaam: [{ id, value }, ...] }. Gebruikt door lib/scheduler.js en
 * lib/condition-scheduler.js voor de template-context: een taak kent enkel de
 * naam die de app-bouwer zelf koos, niet vooraf bekend bij ons. Begrensd op
 * MAX_RESULT_BYTES (code RESULT_TOO_LARGE daarboven).
 */
export async function listAllCollections(env, appId) {
  return unwrap(store(env, appId).allCollections(appId));
}

// ─── Quotum-overzicht (voor de Instellingen-tab) ────────────────────────────

/**
 * @returns {Promise<{usedBytes:number, maxBytes:number, objectCount:number, maxObjects:number}>}
 */
export async function getStorageUsage(env, appId) {
  return unwrap(store(env, appId).usage(appId));
}

/**
 * Verwijdert ALLE gedeelde opslag van één app -- de database én de oude
 * R2-back-up. Gebruikt door routes.js bij DELETE /api/apps/:id. Idempotent.
 */
export async function deleteAllStorage(env, appId) {
  await unwrap(store(env, appId).destroy(appId));
}
