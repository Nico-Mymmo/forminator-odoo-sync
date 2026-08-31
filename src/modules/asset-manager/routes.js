/**
 * Asset Manager — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET  /                           → Full-page UI (authenticated)
 *
 *  Asset API  (authenticated)
 *    GET  /api/assets/list            → Lijst bestanden + submappen op prefix (delimiter-scoped, paginering)
 *    POST /api/assets/upload          → Upload bestand (role-gated)
 *    DELETE /api/assets/delete        → Verwijder bestand (role-gated)
 *    POST /api/assets/rename          → Hernoem bestand (admin only)
 *    POST /api/assets/move            → Verplaats bestand (binnen schrijfbare prefixen; admin overal)
 *    POST /api/assets/create-folder    → Nieuwe top-level categorie (admin) OF submap in een
 *                                         bestaand, schrijfbaar prefix (iedereen met writeToegang daar)
 *    POST /api/assets/delete-folder    → Lege map verwijderen (writeToegang; top-level dynamische categorie: admin only)
 *    POST /api/assets/rename-category  → Label van een top-level dynamische categorie wijzigen (admin only)
 *    POST /api/assets/set-folder-brand → Link-domein (openvme/syndicoach) instellen voor een map (writeToegang)
 *
 * ─── Submappen ──────────────────────────────────────────────────────────────
 *
 *  Er is GEEN aparte foldertabel voor submappen -- die worden puur afgeleid uit
 *  R2 zelf via list(..., { delimiter: '/' }): dat geeft naast de objecten op
 *  het gevraagde prefix ook `delimitedPrefixes` terug (de eerstvolgende "map"-
 *  laag). Een lege submap wordt zichtbaar gemaakt met een zero-byte `.keep`
 *  placeholder-object (zelfde patroon als de bestaande top-level categorieën),
 *  die overal in de UI/lijst-response weer weggefilterd wordt.
 *  asset_manager_categories blijft uitsluitend de top-level (sidebar) mappen
 *  bijhouden -- submappen daaronder zijn pure R2-prefixen.
 *
 * ─── Publieke links (brand-per-map) ────────────────────────────────────────
 *
 *  De fysieke opslag/route verandert niet: alles blijft via deze Worker lopen
 *  (zie src/router/public-routes.js -- /assets/* is host-onafhankelijk). Wat
 *  een gebruiker bij "link kopiëren" te zien krijgt, is wél instelbaar per map:
 *  link.openvme.be/assets/... (default) of link.syndicoach.be/assets/...,
 *  beide proxyen transparant naar dezelfde bytes. Instelling zit in
 *  asset_manager_folder_brands (supabase/migrations/20260828120000_...sql),
 *  resolutie via longest-matching-ancestor-prefix, default 'openvme'.
 *
 * ─── Role semantics ────────────────────────────────────────────────────────
 *
 *  'admin'          – Alles: alle prefixen, rename, move, system/
 *  'asset_manager'  – Upload/delete in alle uploads/ prefixen, move/submap binnen eigen schrijfbare prefixen
 *  'user'           – Eigen prefix (users/{id}/) lezen + eigen bestanden verwijderen, move/submap binnen eigen prefix
 */

import { assetManagerUI } from './ui.js';
import { validateKey, sanitizeFilename, buildUserPrefix, isWithinPrefix, normalizePrefix } from './lib/path-utils.js';
import { isAllowedMimeType, getMimeType } from './lib/mime-types.js';
import { listObjects, putObject, deleteObject, headObject, copyObject } from './lib/r2-client.js';
import { getSupabaseClient } from '../../lib/database.js';

const LOG_PREFIX = '[asset-manager]';

// ─── Constanten ─────────────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// De volledige, gesloten namespace van de asset-manager zelf -- moet exact
// overeenkomen met de categorie-prefixen in ui.js (Banners/Events/Logos/
// Overige) + de per-user prefix. Dit is de "eigen map" van de asset-manager:
// GET /api/assets/list met een leeg prefix ("Alles") mag NOOIT verder kijken
// dan deze set, en elk expliciet opgegeven prefix moet hierbinnen vallen.
const ASSET_CATEGORY_PREFIXES = ['public/', 'banners/', 'events/', 'logos/', 'uploads/'];

// Andere modules die dezelfde env.R2_ASSETS-bucket gebruiken (zie
// src/modules/mini-apps/lib/r2-client.js + lib/storage.js) -- de
// asset-manager mag hier nooit in lezen of schrijven, ook een admin niet.
// Nieuwe modules die deze bucket later ook gebruiken: hier toevoegen.
const FOREIGN_MODULE_PREFIXES = ['mini-apps/', 'mini-apps-storage/', 'fsv2-tracker-logos/'];

function isForeignPrefix(prefix) {
  const p = String(prefix || '');
  return FOREIGN_MODULE_PREFIXES.some(fp => p.startsWith(fp));
}

// Zero-byte placeholder-objecten die een (sub)map zichtbaar houden in R2 zolang
// hij leeg is -- nooit tonen als "bestand" in lijst-responses.
function isKeepPlaceholder(key) {
  return typeof key === 'string' && key.endsWith('/.keep');
}

/**
 * Bouwt de folder-lijst voor de UI op basis van R2's delimitedPrefixes.
 *
 * @param {string[]} delimitedPrefixes  Volledige prefixen, bv. 'uploads/contracten/'
 * @param {string} parentPrefix         Het prefix waaronder gelist werd (kan leeg zijn)
 * @returns {Array<{ prefix: string, name: string }>}
 */
function buildFolderList(delimitedPrefixes, parentPrefix) {
  return (delimitedPrefixes || []).map(p => ({
    prefix: p,
    name:   p.slice(parentPrefix.length).replace(/\/$/, ''),
  }));
}

// ─── Publieke links (brand-per-map, Supabase) ──────────────────────────────
// asset_manager_folder_brands (supabase/migrations/20260828120000_...sql) legt
// per prefix vast via welk "mooi" domein de publieke link getoond wordt bij
// "link kopiëren" -- de fysieke opslag/route blijft ongewijzigd (zie
// src/router/public-routes.js). Geen rij -> overerven van de dichtstbijzijnde
// voorouder-prefix -> uiteindelijk DEFAULT_BRAND.

const LINK_DOMAINS = {
  openvme:    'https://link.openvme.be',
  syndicoach: 'https://link.syndicoach.be',
};
const DEFAULT_BRAND = 'openvme';

async function getFolderBrandRows(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('asset_manager_folder_brands')
      .select('prefix, brand');
    if (error) {
      console.error(`${LOG_PREFIX} getFolderBrandRows error:`, error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error(`${LOG_PREFIX} getFolderBrandRows error:`, err.message);
    return [];
  }
}

/**
 * Zoekt de dichtstbijzijnde voorouder-prefix (of exacte match) met een
 * expliciete brand-instelling voor `keyOrPrefix`. Langste match wint.
 *
 * @param {string} keyOrPrefix
 * @param {Array<{ prefix: string, brand: string }>} rows
 * @returns {string}  'openvme' | 'syndicoach'
 */
function resolveBrand(keyOrPrefix, rows) {
  let best = null;
  for (const row of rows || []) {
    if (keyOrPrefix.startsWith(row.prefix) && (!best || row.prefix.length > best.prefix.length)) {
      best = row;
    }
  }
  return best ? best.brand : DEFAULT_BRAND;
}

function buildPublicLink(key, rows) {
  const brand = resolveBrand(key, rows);
  return `${LINK_DOMAINS[brand] || LINK_DOMAINS[DEFAULT_BRAND]}/assets/${key}`;
}

// ─── Dynamische categorieën (Supabase) ─────────────────────────────────────
// Naast de 5 hardcoded categorieën hierboven kunnen admins vanuit de UI extra
// top-level mappen aanmaken (POST /api/assets/create-folder). Die staan in
// asset_manager_categories (supabase/migrations/20260827090000_asset_manager_categories.sql).

async function getDynamicCategories(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('asset_manager_categories')
      .select('prefix, label')
      .order('created_at', { ascending: true });
    if (error) {
      console.error(`${LOG_PREFIX} getDynamicCategories error:`, error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error(`${LOG_PREFIX} getDynamicCategories error:`, err.message);
    return [];
  }
}

// ─── Response helpers ────────────────────────────────────────────────────────

function jsonOk(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function jsonError(message, status = 500, code = undefined) {
  return new Response(JSON.stringify({ success: false, error: message, ...(code ? { code } : {}) }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function isAdmin(user) {
  return user?.role === 'admin';
}

function hasUploadAccess(user) {
  return user?.role === 'admin' || user?.role === 'asset_manager';
}

/**
 * Controleert of de user schrijfrechten heeft op de opgegeven prefix.
 * Admins mogen alles. asset_manager mag alle uploads/ prefixen.
 * Gewone users mogen alleen hun eigen users/{id}/ prefix.
 *
 * @param {Object} user
 * @param {string} prefix
 * @returns {boolean}
 */
function canWritePrefix(user, prefix) {
  if (!user) return false;
  if (isForeignPrefix(prefix)) return false;
  if (isAdmin(user)) return true;
  if (user.role === 'asset_manager') {
    return prefix.startsWith('uploads/') || prefix.startsWith('users/');
  }
  // Gewone user: alleen eigen prefix
  const ownPrefix = buildUserPrefix(user.id);
  return isWithinPrefix(normalizePrefix(prefix), ownPrefix) || normalizePrefix(prefix) === ownPrefix;
}

/**
 * Controleert of de user leesrechten heeft op de opgegeven key/prefix.
 *
 * @param {Object} user
 * @param {string} keyOrPrefix
 * @returns {boolean}
 */
function canReadPrefix(user, keyOrPrefix) {
  if (!user) return false;
  if (isForeignPrefix(keyOrPrefix)) return false;
  if (isAdmin(user)) return true;
  if (user.role === 'asset_manager') return true;
  const ownPrefix = buildUserPrefix(user.id);
  return isWithinPrefix(keyOrPrefix, ownPrefix);
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export const routes = {

  // ── UI ──────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    const dynamicCategories = await getDynamicCategories(context.env);
    return new Response(assetManagerUI(context.user, context.env, dynamicCategories), {
      headers: { 'Content-Type': 'text/html' }
    });
  },

  // ── API — geïmplementeerd ────────────────────────────────────────────────────
  'GET /api/assets/list': async (context) => {
    const { request, env, user } = context;
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';
    const cursor = url.searchParams.get('cursor') || undefined;
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 1000);

    // Onvoorwaardelijke rechtencontrole -- voorheen enkel gedaan `if (prefix
    // && ...)`, waardoor een LEEG prefix (de "Alles"-tab) zowel de
    // rechtencontrole als elke scoping oversloeg en de HELE R2_ASSETS-bucket
    // liet zien, inclusief andere modules' objecten (zie FOREIGN_MODULE_PREFIXES).
    if (prefix && !canReadPrefix(user, prefix)) {
      console.error(`${LOG_PREFIX} list forbidden: user ${user?.id} op prefix ${prefix}`);
      return jsonError('Geen toegang tot dit prefix.', 403, 'PREFIX_FORBIDDEN');
    }

    try {
      const brandRows = await getFolderBrandRows(env);
      const withPublicUrl = (objects) => objects.map(o => ({ ...o, publicUrl: buildPublicLink(o.key, brandRows) }));
      const withBrand = (folders) => folders.map(f => ({ ...f, brand: resolveBrand(f.prefix, brandRows) }));
      // Alleen relevant/getoond wanneer één concreet prefix bevraagd wordt (niet "Alles"):
      // het EIGEN, effectieve brand van de map die je nu open hebt, plus of die expliciet
      // ingesteld is op dit exacte prefix (i.p.v. overgeërfd) -- de UI toont "Overerven"
      // in de select wanneer ownBrandExplicit ontbreekt.
      const explicitBrandFor = (p) => (brandRows.find(r => r.prefix === p)?.brand) || null;

      // Expliciet prefix (categorie of submap): delimiter-scoped -- enkel de
      // directe kinderen van dit prefix (bestanden ÉN submappen), niet alles
      // recursief. Zo kan de UI een folderboom tonen i.p.v. één platte lijst.
      if (prefix) {
        const result = await listObjects(env, { prefix, cursor, limit, delimiter: '/' });
        const objects = withPublicUrl(result.objects.filter(o => !isKeepPlaceholder(o.key)));
        const folders = withBrand(buildFolderList(result.delimitedPrefixes, prefix));
        console.log(`${LOG_PREFIX} LIST prefix=${prefix} count=${objects.length} folders=${folders.length} truncated=${result.truncated}`);
        return jsonOk({
          objects, folders, truncated: result.truncated, cursor: result.cursor,
          currentBrand: resolveBrand(prefix, brandRows),
          currentBrandExplicit: explicitBrandFor(prefix),
        });
      }

      // Leeg prefix ("Alles"): NOOIT meer 1-op-1 naar R2 doorgeven.
      if (!isAdmin(user) && user?.role !== 'asset_manager') {
        // Gewone user: "Alles" betekent gewoon zijn eigen prefix (ook delimiter-scoped,
        // zodat gewone users hun eigen submappen kunnen aanmaken/inzien).
        const ownPrefix = buildUserPrefix(user.id);
        const result = await listObjects(env, { prefix: ownPrefix, cursor, limit, delimiter: '/' });
        const objects = withPublicUrl(result.objects.filter(o => !isKeepPlaceholder(o.key)));
        const folders = withBrand(buildFolderList(result.delimitedPrefixes, ownPrefix));
        console.log(`${LOG_PREFIX} LIST prefix=${ownPrefix} (eigen, "alles") count=${objects.length} folders=${folders.length} truncated=${result.truncated}`);
        return jsonOk({ objects, folders, truncated: result.truncated, cursor: result.cursor });
      }

      // Admin/asset_manager: som van de gekende, eigen categorieën --
      // begrensd aantal (ASSET_CATEGORY_PREFIXES), dus een vaste, kleine set
      // parallelle R2-calls, nooit een blinde bucket-brede list(). Ook hier
      // delimiter-scoped per categorie (top-level bestanden + submappen);
      // dieper genestte bestanden zie je door een categorie/map te openen.
      // Geen cross-prefix cursor-paginering (elke categorie afzonderlijk heeft
      // dat wel) -- voor de "Alles"-tab volstaat gesorteerd + afgekapt tot limit.
      const dynamicCategories = await getDynamicCategories(env);
      const allCategoryPrefixes = ASSET_CATEGORY_PREFIXES.concat(dynamicCategories.map(cat => cat.prefix));
      const perCategory = await Promise.all(
        allCategoryPrefixes.map(p => listObjects(env, { prefix: p, limit, delimiter: '/' }))
      );
      const merged = perCategory.flatMap(r => r.objects.filter(o => !isKeepPlaceholder(o.key)));
      merged.sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0));
      const truncated = perCategory.some(r => r.truncated) || merged.length > limit;
      const objects = withPublicUrl(merged.slice(0, limit));
      const folders = withBrand(perCategory.flatMap((r, i) => buildFolderList(r.delimitedPrefixes, allCategoryPrefixes[i])));
      console.log(`${LOG_PREFIX} LIST prefix=/ (alle categorieën) count=${objects.length} folders=${folders.length} truncated=${truncated}`);
      return jsonOk({ objects, folders, truncated, cursor: null });
    } catch (err) {
      console.error(`${LOG_PREFIX} list error:`, err.message);
      return jsonError('Lijst ophalen mislukt.', 500);
    }
  },

  'POST /api/assets/upload': async (context) => {
    const { request, env, user } = context;

    if (!hasUploadAccess(user)) {
      return jsonError('Onvoldoende rechten om te uploaden.', 403, 'FORBIDDEN');
    }

    // Content-Length pre-check — laad geen body als te groot
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return jsonError(`Bestand te groot. Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (_err) {
      return jsonError('Ongeldige multipart-body.', 400);
    }

    const file     = formData.get('file');
    const prefix   = formData.get('prefix') || 'uploads/';
    const filename = formData.get('filename') || file?.name || 'file';

    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonError('Geen bestand ontvangen.', 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(`Bestand te groot. Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }

    const overwrite = formData.get('overwrite') === 'true';

    if (!canWritePrefix(user, prefix)) {
      return jsonError('Geen schrijfrechten voor dit prefix.', 403, 'PREFIX_FORBIDDEN');
    }

    const safeFilename      = sanitizeFilename(filename);
    const normalizedPrefix  = normalizePrefix(prefix);
    const key               = `${normalizedPrefix}${safeFilename}`;

    if (!validateKey(key)) {
      return jsonError('Ongeldige bestandssleutel.', 400, 'KEY_INVALID');
    }

    // Overschrijfbeveiliging — standaard geblokkeerd tenzij overwrite=true
    if (!overwrite) {
      const existing = await headObject(env, key);
      if (existing) {
        return jsonError('Bestand bestaat al. Stuur overwrite=true om te overschrijven.', 409, 'KEY_EXISTS');
      }
    }

    const detectedMime = file.type || getMimeType(safeFilename);
    if (!isAllowedMimeType(detectedMime)) {
      return jsonError(`Bestandstype niet toegestaan: ${detectedMime}`, 415, 'MIME_NOT_ALLOWED');
    }

    const body = await file.arrayBuffer();
    const customMetadata = {
      uploadedBy:   user.id,
      originalName: file.name || safeFilename,
      module:       'asset_manager',
      uploadedAt:   new Date().toISOString(),
    };

    try {
      const result = await putObject(env, key, body, { contentType: detectedMime, customMetadata });
      // Dynamische URL — nooit hardcoded domein. link.openvme.be is bewust NIET de
      // basis hier (zie public-routes.js): dat domein redirect enkel naar dit adres.
      const origin    = new URL(request.url).origin;
      const publicUrl = `${origin}/assets/${key}`;
      console.log(`${LOG_PREFIX} UPLOAD ${key} — ${result.size} bytes — user ${user.id}`);
      return jsonOk({ key, url: publicUrl, size: result.size, contentType: detectedMime });
    } catch (err) {
      console.error(`${LOG_PREFIX} upload error:`, err.message);
      return jsonError('Upload mislukt.', 500);
    }
  },

  'DELETE /api/assets/delete': async (context) => {
    const { request, env, user } = context;

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const { key } = body;
    if (!key)             return jsonError('key is verplicht.', 400);
    if (!validateKey(key)) return jsonError('Ongeldige key.', 400, 'KEY_INVALID');

    if (!isAdmin(user)) {
      const ownPrefix = buildUserPrefix(user.id);
      if (!isWithinPrefix(key, ownPrefix)) {
        return jsonError('Geen verwijderrechten voor dit bestand.', 403, 'PREFIX_FORBIDDEN');
      }
    }

    try {
      await deleteObject(env, key);
      console.log(`${LOG_PREFIX} DELETE ${key} — user ${user?.id}`);
      return jsonOk({ key });
    } catch (err) {
      console.error(`${LOG_PREFIX} delete error:`, err.message);
      return jsonError('Verwijderen mislukt.', 500);
    }
  },

  'POST /api/assets/rename': async (context) => {
    const { request, env, user } = context;

    if (!isAdmin(user)) {
      return jsonError('Alleen admins mogen bestanden hernoemen.', 403, 'FORBIDDEN');
    }

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const { key, newKey } = body;
    if (!key || !newKey)   return jsonError('key en newKey zijn verplicht.', 400);
    if (!validateKey(key))    return jsonError('Ongeldige source key.', 400, 'KEY_INVALID');
    if (!validateKey(newKey)) return jsonError('Ongeldige target key.', 400, 'KEY_INVALID');
    if (key === newKey)       return jsonError('Source en target zijn identiek.', 400, 'KEY_IDENTICAL');

    try {
      await copyObject(env, key, newKey);
      await deleteObject(env, key);
      console.log(`${LOG_PREFIX} RENAME ${key} → ${newKey} — user ${user.id}`);
      return jsonOk({ oldKey: key, newKey });
    } catch (err) {
      console.error(`${LOG_PREFIX} rename error:`, err.message);
      return jsonError('Hernoemen mislukt.', 500);
    }
  },

  'POST /api/assets/create-folder': async (context) => {
    const { request, env, user } = context;

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const label = String(body?.label || '').trim();
    if (!label) return jsonError('Naam is verplicht.', 400);
    if (label.length > 80) return jsonError('Naam is te lang (max 80 tekens).', 400);

    // Slug: lowercase, diakritische tekens weg, alleen a-z0-9 en koppeltekens.
    const slug = label
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) return jsonError('Naam levert geen geldige mapnaam op.', 400, 'SLUG_INVALID');

    // parentPrefix aanwezig → submap binnen een bestaand, al-beschrijfbaar
    // prefix (categorie of diepere map). Geen DB-rij, geen admin-vereiste --
    // wie al mag schrijven op parentPrefix mag daar ook een submap in maken.
    const parentPrefixRaw = String(body?.parentPrefix || '').trim();
    if (parentPrefixRaw) {
      const parentPrefix = normalizePrefix(parentPrefixRaw);

      if (!validateKey(parentPrefix)) {
        return jsonError('Ongeldig bovenliggend pad.', 400, 'KEY_INVALID');
      }
      if (!canWritePrefix(user, parentPrefix)) {
        return jsonError('Geen schrijfrechten op deze locatie.', 403, 'FORBIDDEN');
      }

      const prefix = `${parentPrefix}${slug}/`;
      if (!validateKey(prefix)) {
        return jsonError('Ongeldige mapnaam.', 400, 'KEY_INVALID');
      }
      if (isForeignPrefix(prefix)) {
        return jsonError('Deze locatie is niet toegestaan.', 403, 'FORBIDDEN');
      }

      try {
        const existing = await headObject(env, `${prefix}.keep`);
        if (existing) {
          return jsonError('Deze map bestaat al.', 409, 'KEY_EXISTS');
        }
        await putObject(env, `${prefix}.keep`, new Uint8Array(0), {
          contentType: 'application/octet-stream',
          customMetadata: { module: 'asset_manager', purpose: 'folder-placeholder', createdBy: user.id },
        });
        console.log(`${LOG_PREFIX} CREATE-SUBFOLDER ${prefix} ("${label}") — user ${user.id}`);
        return jsonOk({ prefix, label, parentPrefix });
      } catch (err) {
        console.error(`${LOG_PREFIX} create-folder (submap) error:`, err.message);
        return jsonError('Map aanmaken mislukt.', 500);
      }
    }

    // Geen parentPrefix → nieuwe top-level categorie (sidebar), zoals voorheen: admin-only,
    // geregistreerd in asset_manager_categories zodat hij overal in de UI verschijnt.
    if (!isAdmin(user)) {
      return jsonError('Alleen admins mogen nieuwe top-level mappen aanmaken.', 403, 'FORBIDDEN');
    }

    const prefix = normalizePrefix(slug);

    if (!validateKey(prefix)) {
      return jsonError('Ongeldige mapnaam.', 400, 'KEY_INVALID');
    }
    if (isForeignPrefix(prefix) || prefix === 'users/' || prefix === 'system/' || ASSET_CATEGORY_PREFIXES.includes(prefix)) {
      return jsonError('Deze naam is gereserveerd of bestaat al.', 409, 'PREFIX_RESERVED');
    }

    try {
      const supabase = getSupabaseClient(env);

      const { data: existing } = await supabase
        .from('asset_manager_categories')
        .select('prefix')
        .eq('prefix', prefix)
        .maybeSingle();
      if (existing) {
        return jsonError('Deze map bestaat al.', 409, 'KEY_EXISTS');
      }

      const { data: inserted, error: insertError } = await supabase
        .from('asset_manager_categories')
        .insert({ prefix, label, created_by: user.id })
        .select('id, prefix, label')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return jsonError('Deze map bestaat al.', 409, 'KEY_EXISTS');
        }
        throw insertError;
      }

      try {
        // Zero-byte placeholder zodat de lege prefix meteen zichtbaar is in R2-listings.
        await putObject(env, `${prefix}.keep`, new Uint8Array(0), {
          contentType: 'application/octet-stream',
          customMetadata: { module: 'asset_manager', purpose: 'folder-placeholder', createdBy: user.id },
        });
      } catch (r2Err) {
        // Rij en R2 uit sync -- ruim de Supabase-rij op i.p.v. een zombie-categorie te laten staan.
        console.error(`${LOG_PREFIX} create-folder R2 placeholder failed, rolling back DB row:`, r2Err.message);
        await supabase.from('asset_manager_categories').delete().eq('id', inserted.id);
        return jsonError('Map aanmaken mislukt (opslag).', 500);
      }

      console.log(`${LOG_PREFIX} CREATE-FOLDER ${prefix} ("${label}") — user ${user.id}`);
      return jsonOk({ prefix, label });
    } catch (err) {
      console.error(`${LOG_PREFIX} create-folder error:`, err.message);
      return jsonError('Map aanmaken mislukt.', 500);
    }
  },

  'POST /api/assets/move': async (context) => {
    const { request, env, user } = context;

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const { key, targetPrefix } = body;
    if (!key || !targetPrefix) return jsonError('key en targetPrefix zijn verplicht.', 400);
    if (!validateKey(key))     return jsonError('Ongeldige source key.', 400, 'KEY_INVALID');

    const filename = key.split('/').pop();
    const normalizedTarget = normalizePrefix(targetPrefix);
    const newKey   = `${normalizedTarget}${filename}`;

    if (!validateKey(newKey))  return jsonError('Resulterende target key is ongeldig.', 400, 'KEY_INVALID');
    if (key === newKey)        return jsonError('Bestand staat al op het opgegeven prefix.', 400, 'KEY_IDENTICAL');

    // Admins mogen overal verplaatsen. Anderen (asset_manager / user) mogen
    // slepen binnen prefixen waar ze zelf al schrijfrechten op hebben --
    // zowel de bron- als de doellocatie moeten daarvoor canWritePrefix
    // doorstaan. Dit maakt drag & drop bruikbaar voor eigen-map-reorganisatie
    // zonder de bestaande rename-restrictie (admin-only) te wijzigen.
    if (!isAdmin(user)) {
      const sourcePrefix = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
      if (!canWritePrefix(user, sourcePrefix) || !canWritePrefix(user, normalizedTarget)) {
        return jsonError('Geen rechten om dit bestand te verplaatsen.', 403, 'FORBIDDEN');
      }
    }

    try {
      await copyObject(env, key, newKey);
      await deleteObject(env, key);
      console.log(`${LOG_PREFIX} MOVE ${key} → ${newKey} — user ${user.id}`);
      return jsonOk({ oldKey: key, newKey });
    } catch (err) {
      console.error(`${LOG_PREFIX} move error:`, err.message);
      return jsonError('Verplaatsen mislukt.', 500);
    }
  },

  // Hernoemt enkel het WEERGAVE-label van een top-level, door de gebruiker
  // aangemaakte categorie (asset_manager_categories.label) -- het prefix (en
  // dus de R2-keys van alle bestanden eronder) blijft ongewijzigd. Bewust geen
  // "echte" hernoem-naar-nieuw-prefix: dat zou elk bestand eronder moeten
  // kopiëren/verplaatsen, met alle risico's van dien voor iets dat hier puur
  // over een cosmetische naam gaat. Enkel de 5 hardcoded categorieën en
  // submappen (die geen apart label-veld hebben, enkel hun slug) vallen hier
  // buiten -- zie ASSET_CATEGORY_PREFIXES resp. create-folder hierboven.
  'POST /api/assets/rename-category': async (context) => {
    const { request, env, user } = context;

    if (!isAdmin(user)) {
      return jsonError('Alleen admins mogen categorieën hernoemen.', 403, 'FORBIDDEN');
    }

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const prefixRaw = String(body?.prefix || '').trim();
    if (!prefixRaw) return jsonError('prefix is verplicht.', 400);
    const prefix = normalizePrefix(prefixRaw);

    const label = String(body?.label || '').trim();
    if (!label) return jsonError('Naam is verplicht.', 400);
    if (label.length > 80) return jsonError('Naam is te lang (max 80 tekens).', 400);

    try {
      const supabase = getSupabaseClient(env);
      const { data: updated, error } = await supabase
        .from('asset_manager_categories')
        .update({ label })
        .eq('prefix', prefix)
        .select('prefix, label')
        .maybeSingle();

      if (error) throw error;
      if (!updated) {
        return jsonError('Deze categorie bestaat niet (enkel door gebruikers aangemaakte top-level mappen zijn hernoembaar).', 404, 'CATEGORY_NOT_FOUND');
      }

      console.log(`${LOG_PREFIX} RENAME-CATEGORY ${prefix} → "${label}" — user ${user.id}`);
      return jsonOk({ prefix, label });
    } catch (err) {
      console.error(`${LOG_PREFIX} rename-category error:`, err.message);
      return jsonError('Naam wijzigen mislukt.', 500);
    }
  },

  'POST /api/assets/set-folder-brand': async (context) => {
    const { request, env, user } = context;

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const prefixRaw = String(body?.prefix || '').trim();
    if (!prefixRaw) return jsonError('prefix is verplicht.', 400);
    const prefix = normalizePrefix(prefixRaw);
    if (!validateKey(prefix)) return jsonError('Ongeldig prefix.', 400, 'KEY_INVALID');
    if (isForeignPrefix(prefix)) return jsonError('Deze locatie is niet toegestaan.', 403, 'FORBIDDEN');

    if (!canWritePrefix(user, prefix)) {
      return jsonError('Geen schrijfrechten op deze locatie.', 403, 'FORBIDDEN');
    }

    // brand === null/'' → terug naar "overerven" (rij verwijderen). Anders moet
    // het één van de twee bekende merken zijn.
    const brandRaw = body?.brand;
    const brand = brandRaw ? String(brandRaw).trim() : null;
    if (brand && !LINK_DOMAINS[brand]) {
      return jsonError('Onbekend link-domein.', 400, 'BRAND_INVALID');
    }

    try {
      const supabase = getSupabaseClient(env);

      if (!brand) {
        await supabase.from('asset_manager_folder_brands').delete().eq('prefix', prefix);
        console.log(`${LOG_PREFIX} SET-FOLDER-BRAND ${prefix} → overerven — user ${user.id}`);
        return jsonOk({ prefix, brand: null });
      }

      const { error } = await supabase
        .from('asset_manager_folder_brands')
        .upsert({ prefix, brand, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'prefix' });
      if (error) throw error;

      console.log(`${LOG_PREFIX} SET-FOLDER-BRAND ${prefix} → ${brand} — user ${user.id}`);
      return jsonOk({ prefix, brand });
    } catch (err) {
      console.error(`${LOG_PREFIX} set-folder-brand error:`, err.message);
      return jsonError('Link-domein instellen mislukt.', 500);
    }
  },

  'POST /api/assets/delete-folder': async (context) => {
    const { request, env, user } = context;

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const prefixRaw = String(body?.prefix || '').trim();
    if (!prefixRaw) return jsonError('prefix is verplicht.', 400);
    const prefix = normalizePrefix(prefixRaw);
    if (!validateKey(prefix)) return jsonError('Ongeldig prefix.', 400, 'KEY_INVALID');

    // De 5 hardcoded categorieën zijn structureel, geen door de gebruiker
    // aangemaakte map -- die kan je niet verwijderen, enkel leegmaken.
    if (ASSET_CATEGORY_PREFIXES.includes(prefix)) {
      return jsonError('Deze vaste categorie kan niet verwijderd worden.', 403, 'CATEGORY_FIXED');
    }

    try {
      const supabase = getSupabaseClient(env);

      // Top-level dynamische categorie (staat in asset_manager_categories) → zelfde
      // regel als aanmaken: admin-only. Submap eronder → wie er al op mag schrijven.
      const { data: dynamicCategory } = await supabase
        .from('asset_manager_categories')
        .select('id')
        .eq('prefix', prefix)
        .maybeSingle();

      if (dynamicCategory) {
        if (!isAdmin(user)) {
          return jsonError('Alleen admins mogen top-level categorieën verwijderen.', 403, 'FORBIDDEN');
        }
      } else if (!canWritePrefix(user, prefix)) {
        return jsonError('Geen schrijfrechten op deze map.', 403, 'FORBIDDEN');
      }

      // Blokkeren tot leeg: enkel het eigen .keep-placeholder-object mag er nog
      // staan. Geen cascade-delete -- veiligste optie, geen kans op dataverlies
      // door een verkeerd geklikte map.
      const result = await listObjects(env, { prefix, limit: 25, delimiter: '/' });
      const remainingFiles = result.objects.filter(o => !isKeepPlaceholder(o.key));
      const remainingFolders = result.delimitedPrefixes || [];
      if (remainingFiles.length > 0 || remainingFolders.length > 0) {
        return jsonError(
          `Map is niet leeg (${remainingFiles.length} bestand(en), ${remainingFolders.length} submap(pen)). Maak eerst leeg.`,
          409, 'FOLDER_NOT_EMPTY'
        );
      }

      await deleteObject(env, `${prefix}.keep`);

      if (dynamicCategory) {
        await supabase.from('asset_manager_categories').delete().eq('id', dynamicCategory.id);
      }
      // Eventuele eigen brand-instelling van deze map opruimen (niet die van
      // submappen -- die zijn hier sowieso net geblokkeerd als "niet leeg").
      await supabase.from('asset_manager_folder_brands').delete().eq('prefix', prefix);

      console.log(`${LOG_PREFIX} DELETE-FOLDER ${prefix} — user ${user.id}`);
      return jsonOk({ prefix });
    } catch (err) {
      console.error(`${LOG_PREFIX} delete-folder error:`, err.message);
      return jsonError('Map verwijderen mislukt.', 500);
    }
  },

};
