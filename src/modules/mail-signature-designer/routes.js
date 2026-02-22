/**
 * Mail Signature Designer - Routes
 *
 * Endpoints:
 *   GET  /                       → UI
 *   GET  /api/config              → load global config
 *   PUT  /api/config              → save global config
 *   GET  /api/directory?search=   → search workspace users
 *   POST /api/preview             → compile + return { html, warnings }
 *   POST /api/push                → push to user(s), log results
 *   GET  /api/logs                → recent push log entries
 */

import { getConfig, upsertConfig, logPush, getLogs } from './lib/signature-store.js';
import { compileSignature } from './lib/signature-compiler.js';
import { listUsers } from './lib/directory-client.js';
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

export const routes = {
  /**
   * GET /mail-signatures/api/debug-google
   * Step-by-step diagnosis of Google API auth chain.
   * Returns exact output at each stage.
   */
  'GET /api/debug-google': async (context) => {
    const { env } = context;
    const steps = {};

    // ── Step 1: env var present? ──────────────────────────────────────
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

    // ── Step 2: PEM parsing ───────────────────────────────────────────
    try {
      const pemBody = sa.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
      steps.step2_pem = {
        ok: true,
        pemBodyLength: pemBody.length,
        first20chars: pemBody.substring(0, 20)
      };

      // ── Step 3: importKey ─────────────────────────────────────────
      const keyBuf = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
      steps.step3_decode = { ok: true, byteLength: keyBuf.byteLength };

      let cryptoKey;
      try {
        cryptoKey = await crypto.subtle.importKey(
          'pkcs8',
          keyBuf,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['sign']
        );
        steps.step4_importKey = { ok: true, type: cryptoKey.type, algorithm: cryptoKey.algorithm?.name };
      } catch (e) {
        steps.step4_importKey = { ok: false, error: e.message };
        return jsonOk({ steps });
      }

      // ── Step 4: Build JWT payload ─────────────────────────────────
      const TOKEN_URL = 'https://oauth2.googleapis.com/token';
      const now = Math.floor(Date.now() / 1000);
      const jwtPayload = {
        iss: sa.client_email,
        sub: 'nico@mymmo.com',
        scope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600
      };
      steps.step5_jwt_payload = {
        ...jwtPayload,
        iat_is_seconds: jwtPayload.iat < 9999999999,
        exp_minus_iat: jwtPayload.exp - jwtPayload.iat
      };

      // ── Step 5: Sign ──────────────────────────────────────────────
      function b64url(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      }
      const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
      const payload = b64url(new TextEncoder().encode(JSON.stringify(jwtPayload)));
      const data = `${header}.${payload}`;

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

      // ── Step 6: Token exchange ────────────────────────────────────
      const tokenResp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });
      const tokenBody = await tokenResp.text();
      steps.step7_token_exchange = {
        status: tokenResp.status,
        headers: Object.fromEntries(tokenResp.headers.entries()),
        body: tokenBody
      };

      if (tokenResp.status !== 200) {
        return jsonOk({ steps });
      }

      const tokenJson = JSON.parse(tokenBody);
      const accessToken = tokenJson.access_token;

      // ── Step 7: Directory API call ────────────────────────────────
      const dirResp = await fetch(
        'https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=2&orderBy=email&projection=basic',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const dirBody = await dirResp.text();
      steps.step8_directory_api = {
        status: dirResp.status,
        headers: Object.fromEntries(dirResp.headers.entries()),
        body: dirBody.substring(0, 500)
      };

    } catch (e) {
      steps.unexpected_error = { message: e.message, stack: e.stack };
    }

    return jsonOk({ steps });
  },

  /**
   * GET /mail-signatures
   * Render full-page UI
   */
  'GET /': async (context) => {
    return new Response(mailSignatureDesignerUI(context.user), {
      headers: { 'Content-Type': 'text/html' }
    });
  },

  /**
   * GET /mail-signatures/api/config
   * Return the current global signature config
   */
  'GET /api/config': async (context) => {
    try {
      const result = await getConfig(context.env);
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/config failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * PUT /mail-signatures/api/config
   * Save the global signature config
   * Body: { config: { ... } }
   */
  'PUT /api/config': async (context) => {
    try {
      const body = await context.request.json();
      if (!body?.config || typeof body.config !== 'object') {
        return jsonError('Request body must contain a config object', 400);
      }
      const result = await upsertConfig(context.env, body.config, context.user?.id ?? null);
      return jsonOk(result);
    } catch (err) {
      console.error(`${LOG_PREFIX} PUT /api/config failed:`, err);
      return jsonError(err.message);
    }
  },

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
   * POST /mail-signatures/api/preview
   * Compile signature HTML for a sample/preview user
   * Body: { config: { ... }, userData: { fullName, roleTitle, email, phone, photoUrl } }
   */
  'POST /api/preview': async (context) => {
    try {
      const body = await context.request.json();
      const config = body?.config ?? {};
      const userData = body?.userData ?? {};
      const { html, warnings } = compileSignature(config, userData);
      return jsonOk({ html, warnings });
    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/preview failed:`, err);
      return jsonError(err.message);
    }
  },

  /**
   * POST /mail-signatures/api/push
   * Push compiled signature to one or more users
   * Body: {
   *   targetUserEmails: string[] | "all",
   *   userDataOverrides?: { [email]: { fullName?, roleTitle?, phone?, photoUrl? } }
   * }
   */
  'POST /api/push': async (context) => {
    try {
      const { env, user } = context;
      const body = await context.request.json();

      // Load current config + enrich data sources in parallel
      const [{ config }, directoryUsers, odooEmployees] = await Promise.all([
        getConfig(env),
        listUsers(env).catch(e => {
          console.warn(`${LOG_PREFIX} directory fetch failed (userData will be email-only):`, e.message);
          return [];
        }),
        searchRead(env, {
          model: 'hr.employee',
          domain: [['active', '=', true]],
          fields: ['name', 'job_title', 'work_email', 'mobile_phone'],
          limit: 500
        }).catch(e => {
          console.warn(`${LOG_PREFIX} Odoo employee fetch failed:`, e.message);
          return [];
        })
      ]);

      // Build lookup maps by email
      const directoryMap = Object.fromEntries(directoryUsers.map(u => [u.email, u]));
      const odooMap = Object.fromEntries(
        odooEmployees.filter(e => e.work_email).map(e => [e.work_email, e])
      );

      // Resolve target emails (after directory is available)
      let targetEmails;
      if (body.targetUserEmails === 'all') {
        targetEmails = directoryUsers.map(u => u.email);
        if (targetEmails.length === 0) {
          return jsonError('No users found in directory', 500);
        }
      } else if (Array.isArray(body.targetUserEmails) && body.targetUserEmails.length > 0) {
        targetEmails = body.targetUserEmails;
      } else {
        return jsonError('targetUserEmails must be an array of emails or "all"', 400);
      }

      const overrides = body.userDataOverrides || {};

      const results = [];
      const actorEmail = user?.email || 'unknown';

      // Process in batches of PUSH_CONCURRENCY
      for (const batch of chunkArray(targetEmails, PUSH_CONCURRENCY)) {
        const batchResults = await Promise.all(
          batch.map(async (targetEmail) => {
            const dirUser = directoryMap[targetEmail] || {};
            const odooUser = odooMap[targetEmail] || {};

            const userData = {
              email: targetEmail,
              fullName: dirUser.fullName || '',
              photoUrl: dirUser.photoUrl || '',
              roleTitle: odooUser.job_title || '',
              phone: odooUser.mobile_phone || '',
              ...(overrides[targetEmail] || {})
            };

            try {
              const { html, warnings } = compileSignature(config, userData);
              const { sendAsEmail } = await updateSignature(env, targetEmail, html);
              const htmlHash = quickHash(html);

              await logPush(env, {
                actor_email: actorEmail,
                target_user_email: targetEmail,
                sendas_email: sendAsEmail,
                success: true,
                html_hash: htmlHash,
                metadata: warnings.length ? { warnings } : null
              });

              return { email: targetEmail, success: true, warnings };
            } catch (err) {
              console.error(`${LOG_PREFIX} push failed for ${targetEmail}:`, err);

              await logPush(env, {
                actor_email: actorEmail,
                target_user_email: targetEmail,
                sendas_email: null,
                success: false,
                error_message: err.message,
                html_hash: null,
                metadata: null
              });

              return { email: targetEmail, success: false, error: err.message };
            }
          })
        );
        results.push(...batchResults);
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      console.log(`${LOG_PREFIX} push complete: ${successCount} ok, ${failCount} failed`);

      return jsonOk({ results, successCount, failCount });
    } catch (err) {
      console.error(`${LOG_PREFIX} POST /api/push failed:`, err);
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
        model: 'hr.employee',
        domain: [['active', '=', true]],
        fields: ['id', 'name', 'job_title', 'work_email', 'mobile_phone', 'image_128'],
        order: 'name asc',
        limit: 200
      });
      return jsonOk({
        employees: employees.map(e => ({
          id: e.id,
          name: e.name || '',
          jobTitle: e.job_title || '',
          email: e.work_email || '',
          phone: e.mobile_phone || '',
          photoB64: e.image_128 || ''
        }))
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} GET /api/employees failed:`, err);
      return jsonError(err.message);
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
  }
};
