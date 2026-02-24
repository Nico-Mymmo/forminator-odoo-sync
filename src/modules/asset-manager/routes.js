/**
 * Asset Manager — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET  /                           → Full-page UI (authenticated) [Fase 2]
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
 *
 * ─── Implementatiestatus ───────────────────────────────────────────────────
 *  GET /                   → Fase 2 (ui.js wordt dan toegevoegd)
 *  GET /api/assets/list    → Fase 3
 *  POST /api/assets/upload → Fase 3
 *  DELETE /api/assets/delete → Fase 3
 *  POST /api/assets/rename → Fase 3
 *  POST /api/assets/move   → Fase 3
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

  // ── API — geïmplementeerd in Fase 3 ─────────────────────────────────────────
  'GET /api/assets/list': async (_context) => {
    return jsonError('Niet geïmplementeerd (Fase 3)', 501);
  },

  'POST /api/assets/upload': async (_context) => {
    return jsonError('Niet geïmplementeerd (Fase 3)', 501);
  },

  'DELETE /api/assets/delete': async (_context) => {
    return jsonError('Niet geïmplementeerd (Fase 3)', 501);
  },

  'POST /api/assets/rename': async (_context) => {
    return jsonError('Niet geïmplementeerd (Fase 3)', 501);
  },

  'POST /api/assets/move': async (_context) => {
    return jsonError('Niet geïmplementeerd (Fase 3)', 501);
  },

};
