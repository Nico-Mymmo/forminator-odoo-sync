/**
 * Google-toegangstoken via het service-account, met domain-wide delegation.
 *
 * Secret: GOOGLE_SERVICE_ACCOUNT_KEY (stringified JSON), dezelfde als de Gmail-
 * en Directory-koppelingen. Elke scope die hier gevraagd wordt, moet in de Google
 * Admin Console bij de client-ID van dat service-account staan
 * (Beveiliging -> API-beheer -> Domeinbrede delegatie); anders antwoordt Google
 * met `unauthorized_client` en zegt deze functie dat in leesbare taal.
 *
 * LET OP bij het toevoegen van een scope in de Admin Console: het veld bevat de
 * VOLLEDIGE lijst. Wie enkel de nieuwe scope invult, zet de oude af, en dan
 * vallen de handtekeningen en de Gmail-koppelingen stil zonder dat iets hier faalt.
 *
 * De oudere modules (gmail-send-client, gmail-signature-client, directory-client,
 * google-drive-client) hebben elk een eigen kopie van deze code. Nieuwe code
 * gebruikt dit bestand.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Per isolate: een token is een uur geldig. Vijf minuten marge.
const memo = new Map();
const MARGE_MS = 5 * 60 * 1000;

export class GoogleAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function b64url(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlString(str) {
  return b64url(new TextEncoder().encode(str));
}

export function getServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new GoogleAuthError('Het secret GOOGLE_SERVICE_ACCOUNT_KEY ontbreekt op deze Worker.', 'MISSING_SERVICE_ACCOUNT');
  }
  try {
    return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    throw new GoogleAuthError('GOOGLE_SERVICE_ACCOUNT_KEY is geen geldige JSON.', 'MISSING_SERVICE_ACCOUNT');
  }
}

/** De client-ID die in de Admin Console bij domeinbrede delegatie staat, of null. */
export function getServiceAccountClientId(env) {
  try {
    return getServiceAccount(env).client_id || null;
  } catch {
    return null;
  }
}

async function createJwt(sa, subject, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64urlString(JSON.stringify({
    iss: sa.client_email,
    sub: subject,
    scope: scopes,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const data = `${header}.${payload}`;
  const pem = String(sa.private_key || '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

/**
 * Een access token NAMENS `subject` (een @mymmo.com-adres) voor `scopes`.
 *
 * @param {object} env
 * @param {string} subject  wie het service-account nadoet
 * @param {string|string[]} scopes
 * @returns {Promise<string>}
 */
export async function getGoogleAccessToken(env, subject, scopes) {
  const scope = Array.isArray(scopes) ? scopes.join(' ') : String(scopes || '');
  if (!subject) throw new GoogleAuthError('Er is geen e-mailadres om namens te werken.', 'MISSING_SUBJECT');
  const sleutel = `${subject}|${scope}`;
  const bewaard = memo.get(sleutel);
  if (bewaard && bewaard.exp - MARGE_MS > Date.now()) return bewaard.token;

  const sa = getServiceAccount(env);
  const jwt = await createJwt(sa, subject, scope);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const tekst = await res.text();
  if (!res.ok) {
    let google = '';
    try {
      const j = JSON.parse(tekst);
      google = [j.error, j.error_description].filter(Boolean).join(': ');
    } catch {
      google = tekst.slice(0, 200);
    }
    if (/unauthorized_client/.test(tekst)) {
      throw new GoogleAuthError(
        `Het service-account mag de scope ${scope} nog niet gebruiken. Voeg ze in de Google Admin Console toe bij domeinbrede delegatie voor client-ID ${sa.client_id || '(onbekend)'} -- samen met de scopes die er al staan. Staat ze er al, dan is de wijziging bij Google nog niet doorgevoerd (dat kan tot 24 uur duren). Google zei: ${google}`,
        'SCOPE_NOT_AUTHORIZED',
      );
    }
    if (/invalid_grant/.test(tekst)) {
      throw new GoogleAuthError(`Google kent ${subject} niet als gebruiker in de Workspace. Google zei: ${google}`, 'UNKNOWN_SUBJECT');
    }
    throw new GoogleAuthError(`Google weigerde het token (${res.status}): ${google}`, 'TOKEN_FAILED');
  }
  const json = JSON.parse(tekst);
  memo.set(sleutel, { token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 });
  return json.access_token;
}
