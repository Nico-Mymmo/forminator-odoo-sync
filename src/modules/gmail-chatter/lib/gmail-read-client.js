/**
 * Gmail → chatter — leestoegang tot de mailbox van een medewerker.
 *
 * Draait op hetzelfde service-account als de handtekeningen
 * (`signature-manager@…`, client ID 114736715876839968786) via domain-wide
 * delegation, maar met een eigen scope: `gmail.readonly`.
 *
 * WAAROM EEN EIGEN TOKENFUNCTIE EN GEEN IMPORT UIT mail-signature-designer.
 * Dat bestand exporteert die helper niet, en de repo doet dit al twee keer zo
 * (`gmail-signature-client.js` en `google-drive-client.js` hebben elk hun eigen
 * `createJWT`). Eén kopie erbij is beter dan een module die aan de interne
 * werking van een andere module gaat hangen. De implementatie is Web Crypto,
 * want dit draait in een Cloudflare Worker — geen `node:crypto`.
 *
 * WAT DIT BESTAND BEWUST NIET DOET: bodies ophalen die we niet nodig hebben.
 * `getMessageMetadata()` haalt alleen headers op (afzender, ontvanger,
 * onderwerp, message-id). Pas als de sync heeft vastgesteld dat de tegenpartij
 * een bekende lead of contact is, wordt `getMessageFull()` aangeroepen. Zo
 * wordt de inhoud van privécorrespondentie nooit gelezen. Zie sync.js.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPE_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** De headers die we opvragen bij een metadata-call. Meer niet. */
export const METADATA_HEADERS = [
  'From', 'To', 'Cc', 'Subject', 'Date',
  'Message-ID', 'In-Reply-To', 'References',
  'Auto-Submitted', 'X-Autoreply', 'Precedence', 'List-Unsubscribe'
];

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function createJWT(serviceAccount, scopes, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: subject,
    scope: scopes,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  })));
  const data = `${header}.${payload}`;

  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const keyBuf = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(data)
  );
  return `${data}.${b64url(sig)}`;
}

function getServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) throw new Error('Ontbrekende env: GOOGLE_SERVICE_ACCOUNT_KEY');
  return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

/**
 * Tokens leven een uur; binnen één cron-ronde halen we er dus maar één per
 * medewerker op in plaats van één per API-call.
 */
const tokenCache = new Map();

async function getToken(env, userEmail) {
  const nu = Date.now();
  const bewaard = tokenCache.get(userEmail);
  if (bewaard && bewaard.verlooptOp > nu + 60_000) return bewaard.token;

  const sa = getServiceAccount(env);
  const jwt = await createJWT(sa, GMAIL_SCOPE_READONLY, userEmail);
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!resp.ok) {
    throw new Error(`Gmail-token mislukt voor ${userEmail} (${resp.status}): ${await resp.text()}`);
  }
  const json = await resp.json();
  tokenCache.set(userEmail, { token: json.access_token, verlooptOp: nu + 3_500_000 });
  return json.access_token;
}

async function apiGet(env, userEmail, pad, params = {}) {
  const token = await getToken(env, userEmail);
  const url = new URL(API + pad);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const fout = new Error(`Gmail ${pad} gaf ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    fout.status = resp.status;
    throw fout;
  }
  return resp.json();
}

/** Het profiel bevat de huidige historyId — het vertrekpunt voor een bootstrap. */
export async function getProfile(env, userEmail) {
  return apiGet(env, userEmail, '/profile');
}

/**
 * Nieuwe berichten sinds `startHistoryId`.
 *
 * Gmail bewaart de historiek beperkt. Is de cursor te oud, dan antwoordt de API
 * met 404 en geven we `tooOld: true` terug — de aanroeper valt dan terug op een
 * bootstrap in plaats van stil niets te doen.
 *
 * @returns {Promise<{messageIds: string[], historyId: string|null, tooOld: boolean}>}
 */
export async function listHistory(env, userEmail, startHistoryId) {
  const ids = new Set();
  let pageToken;
  let historyId = null;

  try {
    do {
      const data = await apiGet(env, userEmail, '/history', {
        startHistoryId,
        historyTypes: 'messageAdded',
        maxResults: 500,
        pageToken
      });
      historyId = data.historyId || historyId;
      for (const h of data.history || []) {
        for (const toegevoegd of h.messagesAdded || []) {
          if (toegevoegd.message?.id) ids.add(toegevoegd.message.id);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    if (err.status === 404) return { messageIds: [], historyId: null, tooOld: true };
    throw err;
  }

  return { messageIds: [...ids], historyId, tooOld: false };
}

/**
 * Bootstrap: de recente berichten, zonder historiek.
 * Bewust een KORT venster — we willen geen jaren aan oude mail alsnog in de
 * chatter duwen bij de eerste run.
 */
export async function listRecentMessageIds(env, userEmail, { query = 'newer_than:2d', max = 200 } = {}) {
  const ids = [];
  let pageToken;
  do {
    const data = await apiGet(env, userEmail, '/messages', {
      q: query,
      maxResults: Math.min(500, max - ids.length),
      pageToken
    });
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

/** Alleen de headers. Geen inhoud. */
export async function getMessageMetadata(env, userEmail, messageId) {
  return apiGet(env, userEmail, `/messages/${encodeURIComponent(messageId)}`, {
    format: 'metadata',
    metadataHeaders: METADATA_HEADERS
  });
}

/** De volledige mail, inclusief body. Alleen aanroepen na een match. */
export async function getMessageFull(env, userEmail, messageId) {
  return apiGet(env, userEmail, `/messages/${encodeURIComponent(messageId)}`, { format: 'full' });
}

// ─── Hulp bij het uitpakken ──────────────────────────────────────────────────

/** Headers als platte, kleingeschreven map. */
export function headerMap(message) {
  const uit = {};
  for (const h of message?.payload?.headers || []) {
    uit[String(h.name).toLowerCase()] = h.value;
  }
  return uit;
}

function decodeBase64Url(data) {
  const normaal = String(data).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(normaal), c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * De body uit een bericht halen.
 *
 * Voorkeur voor `text/html`, want dat is wat de chatter toont. Valt terug op
 * `text/plain`. Bijlagen (parts met een filename) worden overgeslagen.
 *
 * @returns {{html: string|null, text: string|null}}
 */
export function extractBody(message) {
  let html = null;
  let text = null;

  const loop = (part) => {
    if (!part) return;
    const type = part.mimeType || '';
    const isBijlage = Boolean(part.filename);
    if (!isBijlage && part.body?.data) {
      if (type === 'text/html' && html === null) html = decodeBase64Url(part.body.data);
      else if (type === 'text/plain' && text === null) text = decodeBase64Url(part.body.data);
    }
    for (const kind of part.parts || []) loop(kind);
  };

  loop(message?.payload);
  return { html, text };
}
