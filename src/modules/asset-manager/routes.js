/**
 * Asset Manager — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET  /                           → Full-page UI (authenticated)
 *
 *  Asset API  (authenticated)
 *    GET  /api/assets/list            → Lijst bestanden op prefix (paginering)
 *    POST /api/assets/upload          → Upload bestand (role-gated)
 *    DELETE /api/assets/delete        → Verwijder bestand (role-gated)
 *    POST /api/assets/rename          → Hernoem bestand (admin only)
 *    POST /api/assets/move            → Verplaats bestand (admin only)
 *
 * ─── Role semantics ────────────────────────────────────────────────────────
 *
 *  'admin'          – Alles: alle prefixen, rename, move, system/
 *  'asset_manager'  – Upload/delete in alle uploads/ prefixen
 *  'user'           – Eigen prefix (users/{id}/) lezen + eigen bestanden verwijderen
 */

import { assetManagerUI } from './ui.js';
import { validateKey, sanitizeFilename, buildUserPrefix, isWithinPrefix, normalizePrefix } from './lib/path-utils.js';
import { isAllowedMimeType, getMimeType } from './lib/mime-types.js';
import { listObjects, putObject, deleteObject, copyObject } from './lib/r2-client.js';

const LOG_PREFIX = '[asset-manager]';

// ─── Constanten ─────────────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

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
  if (isAdmin(user)) return true;
  if (user.role === 'asset_manager') return true;
  const ownPrefix = buildUserPrefix(user.id);
  return isWithinPrefix(keyOrPrefix, ownPrefix);
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export const routes = {

  // ── UI ──────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    return new Response(assetManagerUI(context.user), {
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

    if (prefix && !canReadPrefix(user, prefix)) {
      console.error(`${LOG_PREFIX} list forbidden: user ${user?.id} op prefix ${prefix}`);
      return jsonError('Geen toegang tot dit prefix.', 403, 'PREFIX_FORBIDDEN');
    }

    try {
      const result = await listObjects(env, { prefix, cursor, limit });
      console.log(`${LOG_PREFIX} LIST prefix=${prefix || '/'} count=${result.objects.length} truncated=${result.truncated}`);
      return jsonOk(result);
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

    if (!canWritePrefix(user, prefix)) {
      return jsonError('Geen schrijfrechten voor dit prefix.', 403, 'PREFIX_FORBIDDEN');
    }

    const safeFilename      = sanitizeFilename(filename);
    const normalizedPrefix  = normalizePrefix(prefix);
    const key               = `${normalizedPrefix}${safeFilename}`;

    if (!validateKey(key)) {
      return jsonError('Ongeldige bestandssleutel.', 400, 'KEY_INVALID');
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
      // Dynamische URL — nooit hardcoded domein
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

  'POST /api/assets/move': async (context) => {
    const { request, env, user } = context;

    if (!isAdmin(user)) {
      return jsonError('Alleen admins mogen bestanden verplaatsen.', 403, 'FORBIDDEN');
    }

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
    const newKey   = `${normalizePrefix(targetPrefix)}${filename}`;

    if (!validateKey(newKey)) return jsonError('Resulterende target key is ongeldig.', 400, 'KEY_INVALID');

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

};
