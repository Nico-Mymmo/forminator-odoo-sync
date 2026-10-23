/**
 * Claude voor sales -- routes van de pagina. Alleen JSON, behalve `GET /`.
 * De connector zelf staat in lib/mcp.js, het aanmelden in lib/oauth.js.
 */

import { getCoreDb } from '../../lib/core-db.js';
import { getSupabaseClient } from '../../lib/database.js';
import { publiekeOrigin, MCP_PATH, LOG_PREFIX } from './lib/constants.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const isAdmin = (user) => user?.role === 'admin';

export const routes = {
  'GET /': async ({ env, request }) =>
    env.ASSETS.fetch(new Request(new URL('/claude-sales.html', request.url))),

  'GET /api/info': async ({ env, user }) => {
    try {
      const db = getCoreDb(env);
      const nu = new Date().toISOString();
      let verbindingen = db.from('mcp_oauth_tokens')
        .select('id, user_id, client_name, created_at, last_used_at, refresh_expires_at')
        .is('revoked_at', null).gt('refresh_expires_at', nu)
        .order('created_at', { ascending: false }).limit(100);
      let logboek = db.from('claude_sales_log')
        .select('id, user_id, user_name, tool, gebouw_id, lead_id, samenvatting, details, ok, ms, created_at')
        .order('created_at', { ascending: false }).limit(100);
      if (!isAdmin(user)) {
        verbindingen = verbindingen.eq('user_id', user.id);
        logboek = logboek.eq('user_id', user.id);
      }
      const [{ data: v, error: e1 }, { data: l, error: e2 }] = await Promise.all([verbindingen, logboek]);
      if (e1 || e2) throw new Error((e1 || e2).message);

      // Namen bij de verbindingen (voor een beheerder die alles ziet).
      const ids = [...new Set((v || []).map((x) => x.user_id))];
      let namen = {};
      if (ids.length) {
        const { data: users } = await getSupabaseClient(env).from('users').select('id, full_name, email').in('id', ids);
        namen = Object.fromEntries((users || []).map((u) => [u.id, u.full_name || u.email]));
      }
      return json({
        success: true,
        data: {
          connector_url: publiekeOrigin(env) + MCP_PATH,
          is_admin: isAdmin(user),
          verbindingen: (v || []).map((x) => ({ ...x, naam: namen[x.user_id] || null, eigen: x.user_id === user.id })),
          logboek: l || [],
          odoo: String(env.ODOO_WEB_ORIGIN || 'https://mymmo.odoo.com').replace(/\/+$/, ''),
        },
      });
    } catch (err) {
      console.error(LOG_PREFIX, err);
      return json({ success: false, error: err.message }, 500);
    }
  },

  'DELETE /api/verbindingen/:id': async ({ env, user, params }) => {
    try {
      let q = getCoreDb(env).from('mcp_oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', params.id);
      if (!isAdmin(user)) q = q.eq('user_id', user.id);
      const { data, error } = await q.select('id');
      if (error) throw new Error(error.message);
      if (!data || !data.length) return json({ success: false, error: 'Verbinding niet gevonden.' }, 404);
      return json({ success: true });
    } catch (err) {
      console.error(LOG_PREFIX, err);
      return json({ success: false, error: err.message }, 500);
    }
  },
};
