/**
 * Mail Signature Designer - Routes
 *
 * â”€â”€â”€ Endpoint map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *  UI
 *    GET  /                         â†’ Full-page UI
 *
 *  Marketing config  (role-gated: admin | marketing_signature)
 *    GET  /api/marketing-config     â†’ Load marketing layer settings
 *    PUT  /api/marketing-config     â†’ Save marketing layer settings
 *
 *  User settings  (any authenticated user â€“ own settings only)
 *    GET  /api/my-settings          â†’ Load own user signature settings
 *    PUT  /api/my-settings          â†’ Save own user signature settings
 *
 *  Preview
 *    POST /api/preview              â†’ Merge + compile â†’ { html, warnings }
 *
 *  Push (role-gated where indicated)
 *    POST /api/push/self            â†’ Push merged signature to own account (any user)
 *    POST /api/push/users           â†’ Push to selected users (admin | marketing_signature)
 *    POST /api/push/all             â†’ Push to all directory users (admin | marketing_signature)
 *
 *  Helpers
 *    GET  /api/directory?search=    â†’ Search workspace users
 *    GET  /api/employees            â†’ Odoo hr.employee list (preview dropdown)
 *    GET  /api/linkedin-meta?url=   â†’ Scrape LinkedIn OG meta (server-side, no CORS)
 *    GET  /api/logs?limit=          â†’ Recent push log entries
 *
 *  Legacy (backwards-compatible, kept for existing clients)
 *    GET  /api/config               â†’ Alias for /api/marketing-config
 *    PUT  /api/config               â†’ Alias for /api/marketing-config (role-gated)
 *    POST /api/push                 â†’ Legacy push; multi-user requires marketing role
 *    GET  /api/debug-google         â†’ Google API auth diagnostics
 *
 * â”€â”€â”€ Role semantics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *  'admin'               â€“ Full access; all routes; all push targets
 *  'marketing_signature' â€“ Marketing config; push to multi/all
 *  'user' (default)      â€“ Own settings + own push (/api/push/self) only
 */

import {
  getConfig, upsertConfig,
  getMarketingSettings, upsertMarketingSettings,
  getUserSettings, upsertUserSettings, clearAllHiddenEventIds,
  logPush, getLogs
} from './lib/signature-store.js';
import { compileSignature } from './lib/signature-compiler.js';
import { mergeSignatureLayers, mergeForPreview } from './lib/signature-merge-engine.js';
import { listUsers, getUserByEmail } from './lib/directory-client.js';
import { getPrimarySendAs, updateSignature } from './lib/gmail-signature-client.js';
import { mailSignatureDesignerUI } from './ui.js';
import { searchRead } from '../../lib/odoo.js';

const LOG_PREFIX = '[mail-signature-designer]';
const PUSH_CONCURRENCY = 5;

/** Simple hash (FNV-1a 32-bit) for logging html_hash */
function quickHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function jsonOk(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// â”€â”€â”€ Role helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Returns true if the acting user has marketing-level access.
 * Marketing role allows: managing marketing config, pushing to multi/all.
 *
 * @param {Object} context - Route context ({ user, ... })
 */
function hasMarketingRole(context) {
  const role = context.user?.role;
  return role === 'admin' || role === 'marketing_signature';
}

/**
 * Return a 403 JSON response if the user lacks marketing role.
 * Usage:
 *   const deny = guardMarketingRole(context);
 *   if (deny) return deny;
 *
 * @param {Object} context
 * @returns {Response|null}
 */
function guardMarketingRole(context) {
  if (!hasMarketingRole(context)) {
    return jsonError(
      'Forbidden: deze actie vereist de rol marketing_signature of admin',
      403
    );
  }
  return null;
}

/**
 * Return a 401 if user is not authenticated.
 *
 * @param {Object} context
 * @returns {Response|null}
 */
function guardAuth(context) {
  if (!context.user) {
    return jsonError('Unauthorized', 401);
  }
  return null;
}

// â”€â”€â”€ Push helper (shared by all push routes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Push a merged signature to a single target email.
 * Fetches user layer from DB, merges with marketing config + Odoo + directory.
 *
 * @param {Object} opts
 * @param {Object} opts.env
 * @param {string} opts.targetEmail         - The Gmail address to push to
 * @param {Object} opts.marketingConfig     - Marketing config blob
 * @param {Object} opts.directoryMap        - { email â†’ dirUser } from Google Directory
 * @param {Object} opts.odooMap             - { email â†’ odooEmployee } from Odoo
 * @param {string} opts.actorEmail          - Who is performing the push
 * @param {string} [opts.pushScope='single'] - Scope label for the push log
 * @param {Object|null} [opts.userSettingsOverride] - Pre-fetched user settings (skips DB lookup)
 * @returns {Promise<Object>} Result: { email, success, warnings?, changed?, error? }
 */
async function pushOneUser({
  env,
  targetEmail,
  marketingConfig,
  directoryMap,
  odooMap,
  actorEmail,
  pushScope = 'single',
  userSettingsOverride = null
}) {
  try {
    // Load user-layer settings (allow caller to pass pre-fetched value)
    const userSettings = userSettingsOverride !== null
      ? userSettingsOverride
      : await getUserSettings(env, targetEmail);

    const dirUser  = directoryMap[targetEmail] || {};
    const odooUser = odooMap[targetEmail]      || {};

    // Merge all layers
    const { config, userData } = mergeSignatureLayers(
      userSettings,
      marketingConfig,
      odooUser,
      dirUser,
      targetEmail
    );

    // Compile pure HTML
    const { html, warnings } = compileSignature(config, userData);

    // Push to Gmail
    const { sendAsEmail, oldSignature } = await updateSignature(env, targetEmail, html);
    const newHash = quickHash(html);
    const oldHash = quickHash(oldSignature || '');
    const changed = oldHash !== newHash;

    // Audit log
    await logPush(env, {
      actor_email:       actorEmail,
      target_user_email: targetEmail,
      sendas_email:      sendAsEmail,
      success:           true,
      html_hash:         newHash,
      push_scope:        pushScope,
      metadata: {
        ...(warnings.length ? { warnings } : {}),
        old_hash: oldHash,
        new_hash: newHash,
        changed
      }
    });

    return { email: targetEmail, success: true, warnings, changed, old_hash: oldHash, new_hash: newHash };
  } catch (err) {
    console.error(`${LOG_PREFIX} push failed for ${targetEmail}:`, err);

    await logPush(env, {
      actor_email:       actorEmail,
      target_user_email: targetEmail,
      sendas_email:      null,
      success:           false,
      error_message:     err.message,
      html_hash:         null,
      push_scope:        pushScope,
      metadata:          {}
    });

    return { email: targetEmail, success: false, error: err.message };
  }
}

/**
 * Fetch the three data sources needed for push in parallel.
 * Returns { marketingConfig, directoryUsers, directoryMap, odooEmployees, odooMap }
 */
async function fetchPushDataSources(env) {
  const [marketingResult, directoryUsers, odooEmployees] = await Promise.all([
    getMarketingSettings(env),
    listUsers(env).catch(e => {
      console.warn(`${LOG_PREFIX} directory fetch failed:`, e.message);
      return [];
    }),
    searchRead(env, {
      model:  'hr.employee',
      domain: [['active', '=', true]],
      fields: ['name', 'job_title', 'work_email', 'mobile_phone'],
      limit:  500
    }).catch(e => {
      console.warn(`${LOG_PREFIX} Odoo employee fetch failed:`, e.message);
      return [];
    })
  ]);

  const directoryMap = Object.fromEntries(directoryUsers.map(u => [u.email, u]));
  const odooMap = Object.fromEntries(
    odooEmployees.filter(e => e.work_email).map(e => [e.work_email, e])
  );

  return {
    marketingConfig: marketingResult.config || {},
    directoryUsers,
    directoryMap,
    odooEmployees,
    odooMap
  };
}

/**
 * Fire-and-forget: push all directory users' signatures in the background.
 * Called via ctx.waitUntil() when marketing activates a new event.
 */
async function triggerPushAllBackground({ env, actorEmail }) {
  try {
    const { marketingConfig, directoryUsers, directoryMap, odooMap } =
      await fetchPushDataSources(env);
    if (directoryUsers.length === 0) return;
    const targetEmails = directoryUsers.map(u => u.email);
    for (const batch of chunkArray(targetEmails, PUSH_CONCURRENCY)) {
      await Promise.all(
        batch.map(email => pushOneUser({
          env, targetEmail: email, marketingConfig, directoryMap, odooMap,
          actorEmail, pushScope: 'all'
        }))
      );
    }
    console.log(`${LOG_PREFIX} background push (event change): ${targetEmails.length} users processed`);
  } catch (err) {
    console.error(`${LOG_PREFIX} background push failed:`, err.message);
  }
}

export const routes = {
  // ===========================================================================
  // GET /mail-signatures
  // ===========================================================================
  'GET /': async (context) => {
    return new Response(mailSignatureDesignerUI(context.user), {
      headers: { 'Content-Type': 'text/html' }
    });
  },

  // ===========================================================================
  // MARKETING CONFIG   (role-gated: admin | marketing_signature)
  // ===========================================================================

  /**
   * GET /mail-signatures/api/marketing-config
   * Load the global marketing signature settings.
   */
  'GET /api/marketing-config': async (context) => {
    const deny = guardAuth(context) || guardMarketingRole(context);
    if (deny) return deny;
    try {
      const result = await getMarketingSettings(context.env);
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/marketing-config failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * PUT /mail-signatures/api/marketing-config
   * Save the global marketing signature settings.
   * Body: { config: { ... } }
   */
  'PUT /api/marketing-config': async (context) => {
    const deny = guardAuth(context) || guardMarketingRole(context);
    if (deny) return deny;
    try {
      const body = await context.request.json();
      if (!body?.config || typeof body.config !== 'object') {
        return jsonError('Request body must contain a config object', 400);
      }

      // Detect event change before overwriting
      const existing    = await getMarketingSettings(context.env);
      const oldEventId  = existing?.config?.eventId  || null;
      const oldActive   = !!(existing?.config?.eventPromoEnabled && oldEventId);
      const newEventId  = body.config.eventId || null;
      const newActive   = !!(body.config.eventPromoEnabled && newEventId);
      // Reset all users' hidden_event_id when event changes (new ID) or is cleared/disabled
      const eventReset = (oldActive && !newActive) ||
        (newActive && String(oldEventId) !== String(newEventId));
      // Only auto-push when a genuinely new event is activated
      const eventChanged = newActive && String(oldEventId) !== String(newEventId);

      const result = await upsertMarketingSettings(
        context.env,
        body.config,
        context.user?.id ?? null
      );

      // Clear all users' event opt-outs when the event changes or is removed
      if (eventReset) {
        try { await clearAllHiddenEventIds(context.env); } catch (e) {
          console.warn(`${LOG_PREFIX} clearAllHiddenEventIds warning:`, e.message);
        }
      }

      // When a new event is activated, push to all users in the background
      if (eventChanged && context.ctx?.waitUntil) {
        context.ctx.waitUntil(
          triggerPushAllBackground({ env: context.env, actorEmail: context.user?.email || 'marketing-auto' })
        );
      }

      return jsonOk({ ...result, eventPushTriggered: eventChanged });
    } catch (err) {
      console.error(`${LOG_PREFIX} PUT /api/marketing-config failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // USER SETTINGS   (any authenticated user â€“ own settings only)
  // ===========================================================================

  /**
   * GET /mail-signatures/api/my-settings
   * Load the calling user's personal signature settings.
   */
  'GET /api/my-settings': async (context) => {
    const deny = guardAuth(context);
    if (deny) return deny;
    try {
      const userEmail = context.user.email;

      // Parallel: load saved settings + fetch Odoo employee profile + Google Directory photo + marketing active event
      const [settings, odooProfile, activeEvent] = await Promise.all([
        getUserSettings(context.env, userEmail),
        Promise.all([
          searchRead(context.env, {
            model: 'hr.employee',
            domain: [['work_email', '=', userEmail]],
            fields: ['name', 'job_title', 'mobile_phone', 'work_phone'],
            limit: 1
          }).then(rows => {
            const emp = rows?.[0];
            if (!emp) return null;
            return {
              name:        emp.name        || null,
              job_title:   emp.job_title   || null,
              mobile_phone: emp.mobile_phone || emp.work_phone || null
            };
          }).catch(err => {
            console.warn(`${LOG_PREFIX} Odoo profile fetch failed for ${userEmail}:`, err.message);
            return null;
          }),
          getUserByEmail(context.env, userEmail)
            .then(dir => dir?.photoUrl || null)
            .catch(err => {
              console.warn(`${LOG_PREFIX} Directory photo fetch failed for ${userEmail}:`, err.message);
              return null;
            })
        ]).then(([odoo, photoUrl]) => ({
          name:         odoo?.name         || null,
          job_title:    odoo?.job_title    || null,
          mobile_phone: odoo?.mobile_phone || null,
          photoUrl:     photoUrl           || null
        })),
        getMarketingSettings(context.env)
          .then(r => {
            const c = r?.config || {};
            if (!c.eventPromoEnabled || !c.eventTitle) return null;
            return { id: c.eventId || null, title: c.eventTitle, date: c.eventDate || null };
          })
          .catch(() => null)
      ]);

      return jsonOk({ settings: settings ?? {}, odooProfile, activeEvent });
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/my-settings failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * PUT /mail-signatures/api/my-settings
   * Save the calling user's personal signature settings.
   * Body: { settings: { full_name_override?, role_title_override?, ... } }
   */
  'PUT /api/my-settings': async (context) => {
    const deny = guardAuth(context);
    if (deny) return deny;
    try {
      const body = await context.request.json();
      if (!body?.settings || typeof body.settings !== 'object') {
        return jsonError('Request body must contain a settings object', 400);
      }
      const result = await upsertUserSettings(
        context.env,
        context.user.email,
        body.settings,
        context.user.id ?? null
      );
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} PUT /api/my-settings failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // PREVIEW
  // ===========================================================================

  /**
   * POST /mail-signatures/api/preview
   * Merge + compile HTML for a sample/preview user.
   *
   * Body:
   *   For marketing preview (admin/marketing_signature):
   *     { scope: 'marketing', config: { ... }, userData: { ... } }
   *   For user preview (any user):
   *     { scope: 'user', userSettings: { ... }, userData: { ... } }
   *   Legacy (no scope field):
   *     { config: { ... }, userData: { ... } }
   *
   * userData fields: fullName, roleTitle, email, phone, photoUrl
   */
  'POST /api/preview': async (context) => {
    try {
      const body = await context.request.json();
      const scope = body?.scope || 'legacy';
      let config, userData;

      if (scope === 'user') {
        // User is previewing their own settings merged with marketing layer
        const marketingResult = await getMarketingSettings(context.env);
        const userSettings = body?.userSettings || {};
        const previewEmail  = body?.userData?.email || context.user?.email || 'preview@example.com';
        const merged = mergeForPreview(userSettings, marketingResult.config || {}, previewEmail);
        config   = merged.config;
        userData = merged.userData;
        // Preview: directly respect the show/hide toggle from the UI.
        // This bypasses hidden_event_id ID-matching, which is only meaningful
        // for the persisted save path. A null eventId would otherwise prevent
        // the toggle from having any effect in preview.
        if (typeof userSettings._preview_show_event === 'boolean') {
          const hasEvent = !!(marketingResult.config?.eventPromoEnabled && marketingResult.config?.eventTitle);
          config = { ...config, eventPromoEnabled: hasEvent && userSettings._preview_show_event };
        }
        // Allow override of userData fields from form (so user sees their preview tweaks)
        if (body?.userData) {
          Object.assign(userData, {
            fullName:  body.userData.fullName  ?? userData.fullName,
            roleTitle: body.userData.roleTitle ?? userData.roleTitle,
            phone:     body.userData.phone     ?? userData.phone,
            photoUrl:  body.userData.photoUrl  ?? userData.photoUrl
          });
        }
      } else {
        // Legacy / marketing preview: use raw config + userData as-is
        config   = body?.config   ?? {};
        userData = body?.userData ?? {};
      }

      const { html, warnings } = compileSignature(config, userData);
      return jsonOk({ html, warnings });
    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/preview failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // PUSH â€” Self   (any authenticated user)
  // ===========================================================================

  /**
   * POST /mail-signatures/api/push/self
   * Push the calling user's merged signature to their own Gmail account.
   * No body required.
   */
  'POST /api/push/self': async (context) => {
    const deny = guardAuth(context);
    if (deny) return deny;

    try {
      const { env, user } = context;
      const targetEmail = user.email;

      const { marketingConfig, directoryMap, odooMap } = await fetchPushDataSources(env);

      const result = await pushOneUser({
        env,
        targetEmail,
        marketingConfig,
        directoryMap,
        odooMap,
        actorEmail: targetEmail,
        pushScope: 'self'
      });

      return jsonOk({
        results: [result],
        successCount: result.success ? 1 : 0,
        failCount:    result.success ? 0 : 1
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/push/self failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // PUSH â€” Selected users   (admin | marketing_signature)
  // ===========================================================================

  /**
   * POST /mail-signatures/api/push/users
   * Push merged signatures to one or more selected users.
   * Body: { targetUserEmails: string[] }
   */
  'POST /api/push/users': async (context) => {
    const deny = guardAuth(context) || guardMarketingRole(context);
    if (deny) return deny;

    try {
      const { env, user } = context;
      const body = await context.request.json();

      if (!Array.isArray(body?.targetUserEmails) || body.targetUserEmails.length === 0) {
        return jsonError('targetUserEmails must be a non-empty array', 400);
      }

      const targetEmails = body.targetUserEmails;
      const actorEmail   = user.email || 'unknown';

      const { marketingConfig, directoryMap, odooMap } = await fetchPushDataSources(env);

      const results = [];
      for (const batch of chunkArray(targetEmails, PUSH_CONCURRENCY)) {
        const batchResults = await Promise.all(
          batch.map(email => pushOneUser({
            env, targetEmail: email, marketingConfig, directoryMap, odooMap,
            actorEmail, pushScope: 'multi'
          }))
        );
        results.push(...batchResults);
      }

      const successCount = results.filter(r => r.success).length;
      const failCount    = results.filter(r => !r.success).length;
      console.log(`${LOG_PREFIX} push/users: ${successCount} ok, ${failCount} failed`);

      return jsonOk({ results, successCount, failCount });
    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/push/users failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // PUSH â€” All users   (admin | marketing_signature)
  // ===========================================================================

  /**
   * POST /mail-signatures/api/push/all
   * Push merged signatures to every user in the Google Workspace directory.
   * Body: {} (empty)
   */
  'POST /api/push/all': async (context) => {
    const deny = guardAuth(context) || guardMarketingRole(context);
    if (deny) return deny;

    try {
      const { env, user } = context;
      const actorEmail = user.email || 'unknown';

      const { marketingConfig, directoryUsers, directoryMap, odooMap } =
        await fetchPushDataSources(env);

      if (directoryUsers.length === 0) {
        return jsonError('No users found in Google Directory', 500);
      }

      const targetEmails = directoryUsers.map(u => u.email);
      const results = [];
      for (const batch of chunkArray(targetEmails, PUSH_CONCURRENCY)) {
        const batchResults = await Promise.all(
          batch.map(email => pushOneUser({
            env, targetEmail: email, marketingConfig, directoryMap, odooMap,
            actorEmail, pushScope: 'all'
          }))
        );
        results.push(...batchResults);
      }

      const successCount = results.filter(r => r.success).length;
      const failCount    = results.filter(r => !r.success).length;
      console.log(`${LOG_PREFIX} push/all: ${successCount} ok, ${failCount} failed`);

      return jsonOk({ results, successCount, failCount });
    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/push/all failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // DIRECTORY, EMPLOYEES, LINKEDIN, LOGS
  // ===========================================================================

  /**
   * GET /mail-signatures/api/directory?search=
   * Search workspace users via Google Directory API
   */
  'GET /api/directory': async (context) => {
    try {
      const url = new URL(context.request.url);
      const search = url.searchParams.get('search') || '';
      const users = await listUsers(context.env, search);
      return jsonOk({ users });
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/directory failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * GET /mail-signatures/api/employees
   * Fetch active hr.employee records from Odoo for preview dropdown
   */
  'GET /api/employees': async (context) => {
    try {
      const employees = await searchRead(context.env, {
        model:  'hr.employee',
        domain: [['active', '=', true]],
        fields: ['id', 'name', 'job_title', 'work_email', 'mobile_phone', 'image_128'],
        order:  'name asc',
        limit:  200
      });
      return jsonOk({
        employees: employees.map(e => ({
          id:       e.id,
          name:     e.name       || '',
          jobTitle: e.job_title  || '',
          email:    e.work_email || '',
          phone:    e.mobile_phone || '',
          photoB64: e.image_128  || ''
        }))
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/employees failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * GET /mail-signatures/api/linkedin-meta?url=
   * Fetch OG meta tags from a public LinkedIn post URL (server-side, bypasses CORS).
   */
  'GET /api/linkedin-meta': async (context) => {
    const reqUrl = new URL(context.request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) return jsonError('Missing ?url= parameter', 400);

    let parsed;
    try { parsed = new URL(target); } catch { return jsonError('Invalid URL', 400); }
    if (!parsed.hostname.endsWith('linkedin.com')) {
      return jsonError('Only linkedin.com URLs are supported', 400);
    }

    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8'
        },
        redirect: 'follow'
      });

      if (!res.ok) return jsonError(`LinkedIn returned HTTP ${res.status}`, 502);

      const html = await res.text();

      const ogGet = (prop) => {
        const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
                || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
        return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
      };

      const title       = ogGet('title');
      const description = ogGet('description');
      const imageUrl    = ogGet('image');

      if (!title && !description) {
        return jsonError('Kon geen post-inhoud ophalen â€” mogelijk is de post niet publiek of vereist LinkedIn een login', 422);
      }

      const authorName = title.replace(/\s+(op|on)\s+linkedin[:\s].*/i, '').trim();

      let authorImgUrl = '';
      let likesCount   = 0;
      const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of ldBlocks) {
        try {
          const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
          const ld    = JSON.parse(inner);
          const nodes = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
          for (const node of nodes) {
            if (!authorImgUrl && node.author) {
              const img = node.author?.image;
              authorImgUrl = (typeof img === 'string' ? img : img?.url) || '';
            }
            if (!likesCount && node.interactionStatistic) {
              const stats = Array.isArray(node.interactionStatistic) ? node.interactionStatistic : [node.interactionStatistic];
              const likes = stats.find(s => /like|react/i.test(s.interactionType || ''));
              if (likes?.userInteractionCount) likesCount = parseInt(likes.userInteractionCount, 10) || 0;
            }
          }
        } catch { /* ignore malformed JSON-LD */ }
      }
      if (!likesCount) {
        const lm = html.match(/"numLikes"\s*:\s*(\d+)/) || html.match(/(\d[\d,]*)\s*(?:likes|reactions)/i);
        if (lm) likesCount = parseInt(lm[1].replace(/,/g, ''), 10) || 0;
      }

      return jsonOk({ title, description, imageUrl, authorName, authorImgUrl, likesCount });
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/linkedin-meta failed:`, err);
      return jsonError('Ophalen mislukt: ' + err.message);
    }
  },

  /**
   * GET /mail-signatures/api/logs?limit=
   * Return recent push log entries
   */
  'GET /api/logs': async (context) => {
    try {
      const url = new URL(context.request.url);
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const logs = await getLogs(context.env, Math.min(limit, 500));
      return jsonOk({ logs });
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/logs failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // LEGACY BACKWARDS-COMPATIBLE ROUTES
  // ===========================================================================

  /**
   * GET /mail-signatures/api/config
   * @deprecated Use /api/marketing-config
   * Kept for backwards compatibility with existing clients.
   */
  'GET /api/config': async (context) => {
    try {
      // Serve marketing settings under the old key name for BC
      const result = await getMarketingSettings(context.env);
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/config (legacy) failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * PUT /mail-signatures/api/config
   * @deprecated Use /api/marketing-config
   * Now role-gated. Returns 403 for non-marketing users.
   */
  'PUT /api/config': async (context) => {
    const deny = guardAuth(context) || guardMarketingRole(context);
    if (deny) return deny;
    try {
      const body = await context.request.json();
      if (!body?.config || typeof body.config !== 'object') {
        return jsonError('Request body must contain a config object', 400);
      }

      // Detect event change to reset all users' hidden_event_id
      const existing  = await getMarketingSettings(context.env);
      const oldEventId = existing?.config?.eventId || null;
      const oldActive  = !!(existing?.config?.eventPromoEnabled && oldEventId);
      const newEventId = body.config.eventId || null;
      const newActive  = !!(body.config.eventPromoEnabled && newEventId);
      const eventReset = (oldActive && !newActive) ||
        (newActive && String(oldEventId) !== String(newEventId));

      const result = await upsertMarketingSettings(
        context.env,
        body.config,
        context.user?.id ?? null
      );

      if (eventReset) {
        try { await clearAllHiddenEventIds(context.env); } catch (e) {
          console.warn(`${LOG_PREFIX} clearAllHiddenEventIds (legacy) warning:`, e.message);
        }
      }

      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} PUT /api/config (legacy) failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * POST /mail-signatures/api/push
   * @deprecated Use /api/push/self, /api/push/users or /api/push/all
   *
   * Legacy push endpoint. Behavior:
   *   targetUserEmails = [own email]           â†’ allowed for all users (scope: self)
   *   targetUserEmails = [one other email]     â†’ requires marketing role (scope: single)
   *   targetUserEmails = [multiple emails]     â†’ requires marketing role (scope: multi)
   *   targetUserEmails = "all"                 â†’ requires marketing role (scope: all)
   */
  'POST /api/push': async (context) => {
    const deny = guardAuth(context);
    if (deny) return deny;

    try {
      const { env, user } = context;
      const body = await context.request.json();
      const actorEmail = user.email || 'unknown';

      // Determine scope and enforce role
      let targetEmails;
      let pushScope;

      if (body.targetUserEmails === 'all') {
        const denyMarketing = guardMarketingRole(context);
        if (denyMarketing) return denyMarketing;
        pushScope = 'all';
        const { directoryUsers, marketingConfig, directoryMap, odooMap } =
          await fetchPushDataSources(env);
        if (directoryUsers.length === 0) return jsonError('No users found in directory', 500);
        targetEmails = directoryUsers.map(u => u.email);

        const results = [];
        for (const batch of chunkArray(targetEmails, PUSH_CONCURRENCY)) {
          const batchResults = await Promise.all(
            batch.map(email => pushOneUser({
              env, targetEmail: email, marketingConfig, directoryMap, odooMap,
              actorEmail, pushScope
            }))
          );
          results.push(...batchResults);
        }
        const successCount = results.filter(r => r.success).length;
        const failCount    = results.filter(r => !r.success).length;
        return jsonOk({ results, successCount, failCount });

      } else if (Array.isArray(body.targetUserEmails) && body.targetUserEmails.length > 0) {
        targetEmails = body.targetUserEmails;
        const isSelfOnly =
          targetEmails.length === 1 &&
          targetEmails[0].toLowerCase() === actorEmail.toLowerCase();

        if (!isSelfOnly) {
          const denyMarketing = guardMarketingRole(context);
          if (denyMarketing) return denyMarketing;
        }
        pushScope = isSelfOnly ? 'self' : (targetEmails.length === 1 ? 'single' : 'multi');
      } else {
        return jsonError('targetUserEmails must be an array of emails or "all"', 400);
      }

      const { marketingConfig, directoryMap, odooMap } = await fetchPushDataSources(env);
      const results = [];
      for (const batch of chunkArray(targetEmails, PUSH_CONCURRENCY)) {
        const batchResults = await Promise.all(
          batch.map(email => pushOneUser({
            env, targetEmail: email, marketingConfig, directoryMap, odooMap,
            actorEmail, pushScope
          }))
        );
        results.push(...batchResults);
      }

      const successCount = results.filter(r => r.success).length;
      const failCount    = results.filter(r => !r.success).length;
      console.log(`${LOG_PREFIX} push (legacy): ${successCount} ok, ${failCount} failed`);
      return jsonOk({ results, successCount, failCount });

    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/push (legacy) failed:`, err);
      return jsonError(err.message);
    }
  },

  // ===========================================================================
  // DIAGNOSTICS
  // ===========================================================================

  /**
   * GET /mail-signatures/api/debug-google
   * Step-by-step diagnosis of Google API auth chain.
   */
  'GET /api/debug-google': async (context) => {
    const { env } = context;
    const steps = {};

    steps.step1_env = {
      GOOGLE_SERVICE_ACCOUNT_JSON_present: !!env.GOOGLE_SERVICE_ACCOUNT_JSON,
      length: env.GOOGLE_SERVICE_ACCOUNT_JSON?.length ?? 0
    };

    let sa;
    try {
      sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
      steps.step1_parse = {
        ok: true,
        client_email: sa.client_email,
        private_key_starts: sa.private_key?.substring(0, 40),
        private_key_ends: sa.private_key?.substring(sa.private_key.length - 30)
      };
    } catch (e) {
      steps.step1_parse = { ok: false, error: e.message };
      return jsonOk({ steps });
    }

    try {
      const pemBody = sa.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
      steps.step2_pem = { ok: true, pemBodyLength: pemBody.length, first20chars: pemBody.substring(0, 20) };

      const keyBuf = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
      steps.step3_decode = { ok: true, byteLength: keyBuf.byteLength };

      function b64url(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      }

      let cryptoKey;
      try {
        cryptoKey = await crypto.subtle.importKey(
          'pkcs8', keyBuf,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false, ['sign']
        );
        steps.step4_importKey = { ok: true, type: cryptoKey.type, algorithm: cryptoKey.algorithm?.name };
      } catch (e) {
        steps.step4_importKey = { ok: false, error: e.message };
        return jsonOk({ steps });
      }

      const TOKEN_URL = 'https://oauth2.googleapis.com/token';
      const now = Math.floor(Date.now() / 1000);
      const jwtPayload = {
        iss: sa.client_email, sub: 'nico@mymmo.com',
        scope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
        aud: TOKEN_URL, iat: now, exp: now + 3600
      };
      steps.step5_jwt_payload = { ...jwtPayload, iat_is_seconds: jwtPayload.iat < 9999999999 };

      const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
      const payload = b64url(new TextEncoder().encode(JSON.stringify(jwtPayload)));
      const data    = `${header}.${payload}`;

      let signatureBuf;
      try {
        signatureBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(data));
        steps.step6_sign = { ok: true, signatureByteLength: signatureBuf.byteLength };
      } catch (e) {
        steps.step6_sign = { ok: false, error: e.message };
        return jsonOk({ steps });
      }

      const jwt = `${data}.${b64url(signatureBuf)}`;
      steps.step6_jwt_length = jwt.length;

      const tokenResp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
      });
      const tokenBody = await tokenResp.text();
      steps.step7_token_exchange = { status: tokenResp.status, body: tokenBody };

      if (tokenResp.status !== 200) return jsonOk({ steps });

      const accessToken = JSON.parse(tokenBody).access_token;
      const dirResp = await fetch(
        'https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=2&orderBy=email&projection=basic',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const dirBody = await dirResp.text();
      steps.step8_directory_api = { status: dirResp.status, body: dirBody.substring(0, 500) };

    } catch (e) {
      steps.unexpected_error = { message: e.message, stack: e.stack };
    }

    return jsonOk({ steps });
  }
};
