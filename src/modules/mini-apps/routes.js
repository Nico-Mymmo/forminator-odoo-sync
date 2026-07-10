/**
 * Mini-Apps — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET    /                          → Full-page UI (public/mini-apps.html)
 *
 *  API (authenticated — iedereen met module-toegang)
 *    GET    /api/apps                  → Lijst apps die de user mag zien
 *    POST   /api/apps                  → Upload nieuwe mini-app (multipart)
 *    GET    /api/apps/colleagues       → Lijst actieve gebruikers (share-picker)
 *    GET    /api/apps/:id              → Metadata van één app
 *    GET    /api/apps/:id/content      → HTML-inhoud van één app
 *    PUT    /api/apps/:id              → Metadata bijwerken (owner only)
 *    PUT    /api/apps/:id/content      → HTML-inhoud bijwerken — "tweaken" (owner only)
 *    DELETE /api/apps/:id              → App verwijderen (owner only)
 *    PUT    /api/apps/:id/favorite     → Favoriet markeren (view-only volstaat)
 *    DELETE /api/apps/:id/favorite     → Favoriet verwijderen
 *
 * ─── Rechten ─────────────────────────────────────────────────────────────────
 *
 *  Zien/draaien: eigenaar, of visibility='shared' (iedereen), of
 *  visibility='specific' + user staat in shared_user_ids.
 *  Tweaken/beheren: uitsluitend de eigenaar (zie permissions.js).
 */

import { getSupabaseClient } from '../../lib/database.js';
import { putAppContent, getAppContent, deleteAppContent } from './lib/r2-client.js';
import { canView, canEdit, normalizeSharedUserIds } from './permissions.js';

const LOG_PREFIX = '[mini-apps]';

export const MAX_APP_BYTES = 2 * 1024 * 1024; // 2 MB — ruim voldoende voor single-file HTML/JS/CSS

const SELECT_FIELDS = 'id, title, description, owner_user_id, visibility, shared_user_ids, size_bytes, version, created_at, updated_at, icon';

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

const VALID_VISIBILITIES = ['private', 'shared', 'specific'];

// Lucide-iconnamen die de eigenaar mag kiezen in de Instellingen-tab (dropdown).
// Moet in sync blijven met ICON_OPTIONS in public/mini-apps.js (daar staan ook
// de Nederlandse labels bij). Vrije DB-kolom, maar hier hard gevalideerd zodat
// er nooit een willekeurige string in de HTML-attributen (kaart, navbar) belandt.
const VALID_ICONS = [
  'puzzle', 'calculator', 'wrench', 'gauge', 'file-text', 'table', 'list-checks',
  'clipboard-list', 'dollar-sign', 'percent', 'clock', 'calendar', 'map', 'image',
  'qr-code', 'hash', 'ruler', 'scale', 'banknote', 'receipt', 'timer', 'hourglass',
  'sparkles', 'wand-2', 'package', 'box', 'folder', 'link', 'globe', 'mail', 'phone',
  'users', 'building-2', 'briefcase', 'tag', 'gift', 'lightbulb', 'flask-conical',
  'code', 'terminal', 'database', 'bar-chart-2', 'pie-chart', 'trending-up',
  'shopping-cart', 'truck', 'file-spreadsheet', 'clipboard-check'
];

function looksLikeHtml(file) {
  const name = (file?.name || '').toLowerCase();
  const type = (file?.type || '').toLowerCase();
  return name.endsWith('.html') || name.endsWith('.htm') || type.includes('html') || type.startsWith('text/');
}

/**
 * Haalt owner-namen op voor een set apps en plakt ze erbij als `ownerName`.
 * Losse query i.p.v. een embedded relationship-select — voorkomt afhankelijkheid
 * van de exacte (auto-gegenereerde) FK-constraintnaam in Supabase.
 */
async function attachOwnerNames(supabase, apps) {
  const ownerIds = Array.from(new Set(apps.map(a => a.owner_user_id)));
  if (ownerIds.length === 0) return apps;

  const { data: owners } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', ownerIds);

  const ownerMap = new Map((owners || []).map(o => [o.id, o.full_name || o.email]));
  return apps.map(a => ({ ...a, ownerName: ownerMap.get(a.owner_user_id) || 'Onbekend' }));
}

/**
 * Haalt de set mini_app_id's op die deze user als favoriet heeft gemarkeerd.
 */
async function getFavoriteAppIds(supabase, userId) {
  const { data } = await supabase
    .from('mini_app_favorites')
    .select('mini_app_id')
    .eq('user_id', userId);
  return new Set((data || []).map(r => r.mini_app_id));
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export const routes = {

  // ── UI ────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    return context.env.ASSETS.fetch(new Request(new URL('/mini-apps.html', context.request.url)));
  },

  // ── Lijst ─────────────────────────────────────────────────────────────────
  'GET /api/apps': async ({ env, user }) => {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .or(`owner_user_id.eq.${user.id},visibility.eq.shared,shared_user_ids.cs.{${user.id}}`)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(`${LOG_PREFIX} list error:`, error.message);
      return jsonError('Lijst ophalen mislukt.', 500);
    }

    const [withOwners, favoriteIds] = await Promise.all([
      attachOwnerNames(supabase, data || []),
      getFavoriteAppIds(supabase, user.id)
    ]);
    return jsonOk(withOwners.map(a => ({
      ...a,
      isOwner: a.owner_user_id === user.id,
      isFavorite: favoriteIds.has(a.id)
    })));
  },

  // ── Collega's voor share-picker ──────────────────────────────────────────
  'GET /api/apps/colleagues': async ({ env, user }) => {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .neq('id', user.id)
      .order('full_name', { ascending: true });

    if (error) {
      console.error(`${LOG_PREFIX} colleagues error:`, error.message);
      return jsonError('Gebruikerslijst ophalen mislukt.', 500);
    }

    return jsonOk(data || []);
  },

  // ── Upload ────────────────────────────────────────────────────────────────
  'POST /api/apps': async (context) => {
    const { request, env, user } = context;

    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_APP_BYTES) {
      return jsonError(`Bestand te groot. Maximum is ${MAX_APP_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (_err) {
      return jsonError('Ongeldige multipart-body.', 400);
    }

    const file = formData.get('file');
    const title = (formData.get('title') || '').toString().trim();
    const description = (formData.get('description') || '').toString().trim() || null;
    const visibility = (formData.get('visibility') || 'private').toString();
    let sharedUserIdsRaw = [];
    try {
      sharedUserIdsRaw = JSON.parse(formData.get('sharedUserIds') || '[]');
    } catch (_err) {
      return jsonError('sharedUserIds moet een JSON-array zijn.', 400);
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonError('Geen bestand ontvangen.', 400);
    }
    if (!title) {
      return jsonError('Titel is verplicht.', 400);
    }
    if (!VALID_VISIBILITIES.includes(visibility)) {
      return jsonError('Ongeldige visibility-waarde.', 400, 'INVALID_VISIBILITY');
    }
    if (file.size > MAX_APP_BYTES) {
      return jsonError(`Bestand te groot. Maximum is ${MAX_APP_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }
    if (!looksLikeHtml(file)) {
      return jsonError('Upload een single-file .html bestand.', 415, 'NOT_HTML');
    }

    const htmlContent = await file.text();
    const sharedUserIds = visibility === 'specific' ? normalizeSharedUserIds(sharedUserIdsRaw, user.id) : [];

    const supabase = getSupabaseClient(env);
    const { data: inserted, error: insertError } = await supabase
      .from('mini_apps')
      .insert({
        title,
        description,
        owner_user_id: user.id,
        visibility,
        shared_user_ids: sharedUserIds,
        r2_key: `mini-apps/pending`, // wordt hieronder direct overschreven met het echte, id-afhankelijke key
        size_bytes: file.size,
        version: 1
      })
      .select(SELECT_FIELDS)
      .single();

    if (insertError) {
      console.error(`${LOG_PREFIX} insert error:`, insertError.message);
      return jsonError('Aanmaken van de app mislukt.', 500);
    }

    try {
      const r2Result = await putAppContent(env, inserted.id, htmlContent);
      await supabase.from('mini_apps').update({ r2_key: r2Result.key }).eq('id', inserted.id);
      console.log(`${LOG_PREFIX} CREATE ${inserted.id} — ${r2Result.size} bytes — user ${user.id}`);
      return jsonOk({ ...inserted, r2_key: r2Result.key, isOwner: true });
    } catch (err) {
      console.error(`${LOG_PREFIX} R2 write error:`, err.message);
      await supabase.from('mini_apps').delete().eq('id', inserted.id);
      return jsonError('Opslaan van de app-inhoud mislukt.', 500);
    }
  },

  // ── Eén app — metadata ───────────────────────────────────────────────────
  'GET /api/apps/:id': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} get error:`, error.message);
      return jsonError('App ophalen mislukt.', 500);
    }
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const [[withOwner], favoriteIds] = await Promise.all([
      attachOwnerNames(supabase, [app]),
      getFavoriteAppIds(supabase, user.id)
    ]);
    return jsonOk({ ...withOwner, isOwner: app.owner_user_id === user.id, isFavorite: favoriteIds.has(app.id) });
  },

  // ── Eén app — HTML-inhoud ────────────────────────────────────────────────
  'GET /api/apps/:id/content': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} get content error:`, error.message);
      return jsonError('App ophalen mislukt.', 500);
    }
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const content = await getAppContent(env, app.id);
    if (content === null) return jsonError('App-inhoud niet gevonden in opslag.', 404);

    return jsonOk({ content });
  },

  // ── Metadata bijwerken (owner only) ──────────────────────────────────────
  'PUT /api/apps/:id': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canEdit(app, user)) return jsonError('Alleen de eigenaar mag deze app bewerken.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const update = {};
    if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim();
    if (typeof body.description === 'string' || body.description === null) {
      update.description = body.description ? body.description.trim() : null;
    }
    if (body.visibility !== undefined) {
      if (!VALID_VISIBILITIES.includes(body.visibility)) {
        return jsonError('Ongeldige visibility-waarde.', 400, 'INVALID_VISIBILITY');
      }
      update.visibility = body.visibility;
      update.shared_user_ids = body.visibility === 'specific'
        ? normalizeSharedUserIds(body.sharedUserIds, user.id)
        : [];
    }
    if (body.icon !== undefined) {
      if (!VALID_ICONS.includes(body.icon)) {
        return jsonError('Ongeldig icoon.', 400, 'INVALID_ICON');
      }
      update.icon = body.icon;
    }

    if (Object.keys(update).length === 0) {
      return jsonError('Niets om bij te werken.', 400);
    }

    const { data: updated, error: updateError } = await supabase
      .from('mini_apps')
      .update(update)
      .eq('id', app.id)
      .select(SELECT_FIELDS)
      .single();

    if (updateError) {
      console.error(`${LOG_PREFIX} update error:`, updateError.message);
      return jsonError('Bijwerken mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} UPDATE metadata ${app.id} — user ${user.id}`);
    return jsonOk({ ...updated, isOwner: true });
  },

  // ── HTML-inhoud bijwerken — "tweaken" (owner only) ───────────────────────
  'PUT /api/apps/:id/content': async ({ request, env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canEdit(app, user)) return jsonError('Alleen de eigenaar mag deze app tweaken.', 403, 'FORBIDDEN');

    let body;
    try {
      body = await request.json();
    } catch (_err) {
      return jsonError('Ongeldige JSON-body.', 400);
    }

    const content = body.content;
    if (typeof content !== 'string' || !content.trim()) {
      return jsonError('content is verplicht.', 400);
    }
    const sizeBytes = new TextEncoder().encode(content).byteLength;
    if (sizeBytes > MAX_APP_BYTES) {
      return jsonError(`Inhoud te groot. Maximum is ${MAX_APP_BYTES / 1024 / 1024} MB.`, 413, 'FILE_TOO_LARGE');
    }

    try {
      await putAppContent(env, app.id, content);
    } catch (err) {
      console.error(`${LOG_PREFIX} R2 update error:`, err.message);
      return jsonError('Opslaan van de app-inhoud mislukt.', 500);
    }

    const { data: updated, error: updateError } = await supabase
      .from('mini_apps')
      .update({ size_bytes: sizeBytes, version: (app.version || 1) + 1 })
      .eq('id', app.id)
      .select(SELECT_FIELDS)
      .single();

    if (updateError) {
      console.error(`${LOG_PREFIX} version bump error:`, updateError.message);
      return jsonError('Opslaan gelukt, metadata bijwerken mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} TWEAK ${app.id} → v${updated.version} — user ${user.id}`);
    return jsonOk({ ...updated, isOwner: true });
  },

  // ── Verwijderen (owner only) ─────────────────────────────────────────────
  'DELETE /api/apps/:id': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canEdit(app, user)) return jsonError('Alleen de eigenaar mag deze app verwijderen.', 403, 'FORBIDDEN');

    try {
      await deleteAppContent(env, app.id);
    } catch (err) {
      console.error(`${LOG_PREFIX} R2 delete error:`, err.message);
      // Ga door met het verwijderen van de metadata, ook als R2-delete faalt —
      // een orphaned R2-object is minder erg dan een onverwijderbare rij.
    }

    const { error: deleteError } = await supabase.from('mini_apps').delete().eq('id', app.id);
    if (deleteError) {
      console.error(`${LOG_PREFIX} delete error:`, deleteError.message);
      return jsonError('Verwijderen mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} DELETE ${app.id} — user ${user.id}`);
    return jsonOk({ id: app.id });
  },

  // ── Favoriet markeren (view-toegang volstaat) ────────────────────
  'PUT /api/apps/:id/favorite': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { data: app, error: fetchError } = await supabase
      .from('mini_apps')
      .select(SELECT_FIELDS)
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) return jsonError('App ophalen mislukt.', 500);
    if (!app) return jsonError('App niet gevonden.', 404);
    if (!canView(app, user)) return jsonError('Geen toegang tot deze app.', 403, 'FORBIDDEN');

    const { error: favError } = await supabase
      .from('mini_app_favorites')
      .upsert({ user_id: user.id, mini_app_id: app.id }, { onConflict: 'user_id,mini_app_id' });

    if (favError) {
      console.error(`${LOG_PREFIX} favorite error:`, favError.message);
      return jsonError('Favoriet markeren mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} FAVORITE ${app.id} — user ${user.id}`);
    return jsonOk({ id: app.id, isFavorite: true });
  },

  // ── Favoriet verwijderen ────────────────────
  'DELETE /api/apps/:id/favorite': async ({ env, user, params }) => {
    const supabase = getSupabaseClient(env);
    const { error: unfavError } = await supabase
      .from('mini_app_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('mini_app_id', params.id);

    if (unfavError) {
      console.error(`${LOG_PREFIX} unfavorite error:`, unfavError.message);
      return jsonError('Favoriet verwijderen mislukt.', 500);
    }

    console.log(`${LOG_PREFIX} UNFAVORITE ${params.id} — user ${user.id}`);
    return jsonOk({ id: params.id, isFavorite: false });
  },

};
