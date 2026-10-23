/**
 * Aanmelden vanuit Claude (OAuth 2.1 met PKCE, zoals claude.ai het verwacht).
 *
 * Het verloop:
 *   1. Claude vraagt /mcp/sales zonder token en krijgt 401 met een verwijzing
 *      naar /.well-known/oauth-protected-resource.
 *   2. Claude registreert zichzelf (/oauth/register) en stuurt de medewerker
 *      naar /oauth/authorize.
 *   3. Niet aangemeld in de OM? Dan eerst de gewone loginpagina, met 2FA.
 *      Daarna een toestemmingsscherm (public/claude-sales-toestemming.html).
 *   4. "Verbinden" geeft een code terug naar claude.ai, die ze inwisselt bij
 *      /oauth/token voor een toegangstoken (8 uur) en een vernieuwingstoken
 *      (30 dagen, bij elk gebruik vervangen).
 *
 * Afspraken:
 * - Tokens en codes staan enkel als SHA-256 in D1, zoals de sessies.
 * - Terugkeeradressen: enkel claude.ai / claude.com, of de eigen computer
 *   (Claude Code, de MCP Inspector). Anders kan eender wie een "connector"
 *   bouwen die met onze aanmelding naar zijn eigen site terugkeert.
 * - Er is altijd een toestemmingsscherm, ook als je al aangemeld bent: anders
 *   volstaat een link om iemands OM-account aan een vreemde connector te hangen.
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { randomToken, sha256Hex, base64UrlEncode } from '../../../lib/auth/crypto.js';
import { validateSession } from '../../../lib/auth/session.js';
import { extractSessionToken, veiligNextPad } from '../../../router/auth-gate.js';
import { MCP_PATH, publiekeOrigin, ACCESS_MS, REFRESH_MS, CODE_MS, LOG_PREFIX } from './constants.js';
import { sessieHeeftToegang } from './toegang.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-protocol-version',
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra },
  });
}

function oauthFout(code, beschrijving, status = 400) {
  return json({ error: code, error_description: beschrijving }, status);
}

const nu = () => new Date().toISOString();
const straks = (ms) => new Date(Date.now() + ms).toISOString();

// ── Metadata ───────────────────────────────────────────────────────────────

export function resourceUrl(env) {
  return publiekeOrigin(env) + MCP_PATH;
}

export function resourceMetadataUrl(env) {
  return publiekeOrigin(env) + '/.well-known/oauth-protected-resource' + MCP_PATH;
}

function protectedResource(env) {
  const o = publiekeOrigin(env);
  return {
    resource: resourceUrl(env),
    authorization_servers: [o],
    bearer_methods_supported: ['header'],
    resource_name: 'mymmo - Claude voor sales',
  };
}

function authorizationServer(env) {
  const o = publiekeOrigin(env);
  return {
    issuer: o,
    authorization_endpoint: o + '/oauth/authorize',
    token_endpoint: o + '/oauth/token',
    registration_endpoint: o + '/oauth/register',
    revocation_endpoint: o + '/oauth/revoke',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['sales'],
  };
}

// ── Terugkeeradressen ──────────────────────────────────────────────────────

const CLAUDE_HOSTS = ['claude.ai', 'claude.com'];

function toegelatenTerugkeer(env, uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === 'https:' && CLAUDE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) return true;
  // De eigen computer (RFC 8252): Claude Code, de MCP Inspector.
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return true;
  const extra = String(env?.CLAUDE_SALES_REDIRECTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.some((voorvoegsel) => uri.startsWith(voorvoegsel));
}

/** Loopback-adressen mogen van poort wisselen (RFC 8252, 7.3). */
function zelfdeTerugkeer(geregistreerd, gevraagd) {
  if (geregistreerd === gevraagd) return true;
  try {
    const a = new URL(geregistreerd);
    const b = new URL(gevraagd);
    const loopback = ['localhost', '127.0.0.1', '[::1]'];
    return a.protocol === 'http:' && loopback.includes(a.hostname) && a.hostname === b.hostname
      && a.pathname === b.pathname && a.search === b.search;
  } catch { return false; }
}

// ── Registratie ────────────────────────────────────────────────────────────

async function register(request, env) {
  let body;
  try { body = await request.json(); } catch { return oauthFout('invalid_client_metadata', 'Geen geldige JSON.'); }
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length) return oauthFout('invalid_redirect_uri', 'redirect_uris ontbreekt.');
  const fout = uris.find((u) => !toegelatenTerugkeer(env, u));
  if (fout) return oauthFout('invalid_redirect_uri', `Terugkeeradres niet toegelaten: ${fout}`);

  const methode = ['client_secret_post', 'client_secret_basic'].includes(body.token_endpoint_auth_method)
    ? body.token_endpoint_auth_method : 'none';
  const clientId = 'om_' + randomToken(16);
  const secret = methode === 'none' ? null : randomToken(32);
  const naam = String(body.client_name || 'Claude').slice(0, 120);

  const db = getCoreDb(env);
  const { error } = await db.from('mcp_oauth_clients').insert({
    id: clientId, name: naam, redirect_uris: uris, secret_hash: secret ? await sha256Hex(secret) : null,
  });
  if (error) {
    console.error(LOG_PREFIX, 'registratie', error.message);
    return oauthFout('server_error', 'Registreren mislukt.', 500);
  }
  return json({
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: naam,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: methode,
  }, 201);
}

async function leesClient(env, clientId) {
  if (!clientId) return null;
  const { data } = await getCoreDb(env).from('mcp_oauth_clients').select('*').eq('id', String(clientId)).maybeSingle();
  return data || null;
}

// ── Autoriseren ────────────────────────────────────────────────────────────

/** De parameters van /oauth/authorize nakijken. Geeft { fout } of { client, p }. */
async function controleerAanvraag(env, params) {
  const p = {
    response_type: params.get('response_type'),
    client_id: params.get('client_id'),
    redirect_uri: params.get('redirect_uri'),
    state: params.get('state') || '',
    code_challenge: params.get('code_challenge'),
    code_challenge_method: params.get('code_challenge_method') || 'plain',
    resource: params.get('resource') || '',
    scope: params.get('scope') || '',
  };
  const client = await leesClient(env, p.client_id);
  if (!client) return { fout: 'Onbekende connector. Verwijder de connector in Claude en voeg hem opnieuw toe.' };
  const uris = Array.isArray(client.redirect_uris) ? client.redirect_uris : [];
  if (!p.redirect_uri || !uris.some((u) => zelfdeTerugkeer(u, p.redirect_uri))) {
    return { fout: 'Het terugkeeradres van deze connector klopt niet.' };
  }
  if (p.response_type !== 'code') return { fout: 'Enkel response_type=code wordt ondersteund.' };
  if (!p.code_challenge || p.code_challenge_method !== 'S256') return { fout: 'PKCE (S256) is verplicht.' };
  return { client, p };
}

async function authorizeGet(request, env) {
  const url = new URL(request.url);
  const { fout } = await controleerAanvraag(env, url.searchParams);
  if (fout) return json({ error: 'invalid_request', error_description: fout }, 400);

  const user = await validateSession(env, extractSessionToken(request));
  if (!user) {
    // Relatief, zie auth-gate: via operations.openvme.be is request.url een ander domein.
    const next = veiligNextPad(url.pathname + url.search);
    return new Response(null, { status: 302, headers: { Location: next ? `/?next=${encodeURIComponent(next)}` : '/' } });
  }
  const pagina = await env.ASSETS.fetch(new Request(new URL('/claude-sales-toestemming.html', request.url)));
  const headers = new Headers(pagina.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(pagina.body, { status: 200, headers });
}

/** Voor het toestemmingsscherm: wie vraagt het, wie ben jij, mag het? */
async function authorizeInfo(request, env) {
  const url = new URL(request.url);
  const { fout, client } = await controleerAanvraag(env, url.searchParams);
  if (fout) return json({ success: false, error: fout }, 400);
  const user = await validateSession(env, extractSessionToken(request));
  if (!user) return json({ success: false, error: 'Niet aangemeld.' }, 401);
  return json({
    success: true,
    data: {
      client_name: client.name || 'Claude',
      gebruiker: { naam: user.full_name || user.username || user.email, email: user.email },
      toegang: sessieHeeftToegang(user),
    },
  });
}

function zelfdeHerkomst(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    return o.origin === publiekeOrigin(env) || o.host === new URL(request.url).host;
  } catch { return false; }
}

async function authorizeApprove(request, env) {
  if (!zelfdeHerkomst(request, env)) return json({ success: false, error: 'Verboden herkomst.' }, 403);
  const user = await validateSession(env, extractSessionToken(request));
  if (!user) return json({ success: false, error: 'Niet aangemeld.' }, 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const params = new URLSearchParams(String(body.query || '').replace(/^\?/, ''));
  const { fout, client, p } = await controleerAanvraag(env, params);
  if (fout) return json({ success: false, error: fout }, 400);

  const terug = new URL(p.redirect_uri);
  if (p.state) terug.searchParams.set('state', p.state);
  terug.searchParams.set('iss', publiekeOrigin(env));

  if (!body.akkoord) {
    terug.searchParams.set('error', 'access_denied');
    return json({ success: true, data: { redirect: terug.toString() } });
  }
  if (!sessieHeeftToegang(user)) {
    return json({ success: false, error: 'Je hebt nog geen toegang tot "Claude voor sales". Vraag het aan een beheerder.' }, 403);
  }

  const code = randomToken(32);
  const { error } = await getCoreDb(env).from('mcp_oauth_codes').insert({
    code_hash: await sha256Hex(code),
    client_id: client.id,
    user_id: user.id,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    resource: p.resource || null,
    used: false,
    expires_at: straks(CODE_MS),
  });
  if (error) {
    console.error(LOG_PREFIX, 'code', error.message);
    return json({ success: false, error: 'Er ging iets mis. Probeer het opnieuw.' }, 500);
  }
  terug.searchParams.set('code', code);
  return json({ success: true, data: { redirect: terug.toString() } });
}

// ── Token ──────────────────────────────────────────────────────────────────

async function leesFormulier(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    const b = await request.json().catch(() => ({}));
    return new URLSearchParams(Object.entries(b || {}).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await request.text());
}

/** client_id en eventueel geheim, uit de body of uit Basic-auth. */
async function clientUitAanvraag(request, env, form) {
  let id = form.get('client_id');
  let geheim = form.get('client_secret');
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const [a, b] = atob(auth.slice(6)).split(':');
      id = decodeURIComponent(a); geheim = decodeURIComponent(b || '');
    } catch { /* negeren */ }
  }
  const client = await leesClient(env, id);
  if (!client) return null;
  if (client.secret_hash && (!geheim || (await sha256Hex(geheim)) !== client.secret_hash)) return null;
  return client;
}

async function pkceKlopt(verifier, challenge) {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest)) === challenge;
}

function tokenAntwoord(access, refresh) {
  return json({
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_MS / 1000),
    refresh_token: refresh,
    scope: 'sales',
  });
}

async function token(request, env) {
  const form = await leesFormulier(request);
  const client = await clientUitAanvraag(request, env, form);
  if (!client) return oauthFout('invalid_client', 'Onbekende connector.', 401);
  const db = getCoreDb(env);
  const grant = form.get('grant_type');

  if (grant === 'authorization_code') {
    const code = form.get('code');
    if (!code) return oauthFout('invalid_request', 'code ontbreekt.');
    // Opeisen in een keer: twee gelijktijdige aanvragen met dezelfde code
    // kunnen niet allebei een token krijgen.
    const { data: rijen } = await db.from('mcp_oauth_codes')
      .update({ used: true })
      .eq('code_hash', await sha256Hex(code)).eq('used', false)
      .select('*');
    const c = rijen && rijen[0];
    if (!c || c.client_id !== client.id) return oauthFout('invalid_grant', 'Ongeldige of al gebruikte code.');
    if (Date.parse(c.expires_at) < Date.now()) return oauthFout('invalid_grant', 'De code is verlopen.');
    if (form.get('redirect_uri') && !zelfdeTerugkeer(c.redirect_uri, form.get('redirect_uri'))) {
      return oauthFout('invalid_grant', 'Terugkeeradres klopt niet.');
    }
    if (!(await pkceKlopt(form.get('code_verifier'), c.code_challenge))) return oauthFout('invalid_grant', 'PKCE klopt niet.');

    const access = randomToken(32);
    const refresh = randomToken(32);
    const { error } = await db.from('mcp_oauth_tokens').insert({
      id: crypto.randomUUID(),
      client_id: client.id,
      client_name: client.name,
      user_id: c.user_id,
      access_hash: await sha256Hex(access),
      refresh_hash: await sha256Hex(refresh),
      access_expires_at: straks(ACCESS_MS),
      refresh_expires_at: straks(REFRESH_MS),
      last_used_at: nu(),
    });
    if (error) {
      console.error(LOG_PREFIX, 'token', error.message);
      return oauthFout('server_error', 'Token maken mislukt.', 500);
    }
    return tokenAntwoord(access, refresh);
  }

  if (grant === 'refresh_token') {
    const oud = form.get('refresh_token');
    if (!oud) return oauthFout('invalid_request', 'refresh_token ontbreekt.');
    const access = randomToken(32);
    const refresh = randomToken(32);
    // Vervangen in een keer, en enkel als het oude nog geldig is.
    const { data: rijen } = await db.from('mcp_oauth_tokens')
      .update({
        access_hash: await sha256Hex(access),
        refresh_hash: await sha256Hex(refresh),
        access_expires_at: straks(ACCESS_MS),
        refresh_expires_at: straks(REFRESH_MS),
      })
      .eq('refresh_hash', await sha256Hex(oud))
      .eq('client_id', client.id)
      .is('revoked_at', null)
      .gt('refresh_expires_at', nu())
      .select('id');
    if (!rijen || !rijen.length) return oauthFout('invalid_grant', 'De verbinding is verlopen of ingetrokken. Verbind opnieuw.');
    return tokenAntwoord(access, refresh);
  }

  return oauthFout('unsupported_grant_type', 'Enkel authorization_code en refresh_token.');
}

async function revoke(request, env) {
  const form = await leesFormulier(request);
  const t = form.get('token');
  if (t) {
    const h = await sha256Hex(t);
    const db = getCoreDb(env);
    await db.from('mcp_oauth_tokens').update({ revoked_at: nu() }).eq('access_hash', h);
    await db.from('mcp_oauth_tokens').update({ revoked_at: nu() }).eq('refresh_hash', h);
  }
  return new Response(null, { status: 200, headers: CORS });
}

// ── Token van een aanroep nakijken ─────────────────────────────────────────

/** @returns {Promise<{tokenId, userId}|null>} */
export async function valideerBearer(env, request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const t = auth.slice(7).trim();
  if (!t) return null;
  const db = getCoreDb(env);
  const { data: rij } = await db.from('mcp_oauth_tokens')
    .select('id, user_id, access_expires_at, revoked_at, last_used_at')
    .eq('access_hash', await sha256Hex(t)).maybeSingle();
  if (!rij || rij.revoked_at || Date.parse(rij.access_expires_at) < Date.now()) return null;
  // Hoogstens een schrijfactie per tien minuten.
  if (!rij.last_used_at || Date.now() - Date.parse(rij.last_used_at) > 10 * 60 * 1000) {
    db.from('mcp_oauth_tokens').update({ last_used_at: nu() }).eq('id', rij.id).then(() => {}, () => {});
  }
  return { tokenId: rij.id, userId: rij.user_id };
}

// ── Router ─────────────────────────────────────────────────────────────────

export function isOauthPad(pathname) {
  return pathname.startsWith('/.well-known/oauth-') || pathname.startsWith('/oauth/');
}

/** @returns {Promise<Response|null>} */
export async function handleOauth(request, env) {
  const { pathname } = new URL(request.url);
  const m = request.method;

  if (m === 'GET' && (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource' + MCP_PATH)) {
    return json(protectedResource(env));
  }
  if (m === 'GET' && (pathname === '/.well-known/oauth-authorization-server' || pathname.startsWith('/.well-known/oauth-authorization-server/'))) {
    return json(authorizationServer(env));
  }
  if (pathname === '/oauth/register' && m === 'POST') return register(request, env);
  if (pathname === '/oauth/authorize' && m === 'GET') return authorizeGet(request, env);
  if (pathname === '/oauth/authorize/info' && m === 'GET') return authorizeInfo(request, env);
  if (pathname === '/oauth/authorize/approve' && m === 'POST') return authorizeApprove(request, env);
  if (pathname === '/oauth/token' && m === 'POST') return token(request, env);
  if (pathname === '/oauth/revoke' && m === 'POST') return revoke(request, env);
  return null;
}
