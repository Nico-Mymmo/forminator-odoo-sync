/**
 * Mail Signature Designer - Directory Client
 *
 * Wraps Google Admin Directory API using native fetch + Web Crypto JWT.
 * Works in Cloudflare Workers without googleapis SDK.
 *
 * Env requirements:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  (Cloudflare secret, stringified JSON)
 */

const ADMIN_EMAIL = 'nico@mymmo.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DIRECTORY_SCOPES = 'https://www.googleapis.com/auth/admin.directory.user.readonly';

/**
 * Base64url encode (no padding).
 */
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a signed JWT for a Google service account using Web Crypto.
 *
 * @param {Object} serviceAccount - Parsed service account JSON
 * @param {string} scopes - Space-separated OAuth scopes
 * @param {string} subject - Email to impersonate (domain-wide delegation)
 * @returns {Promise<string>} Signed JWT string
 */
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

  // Import the private key (PKCS8 PEM)
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const keyBuf = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuf,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(data)
  );

  return `${data}.${b64url(signatureBuf)}`;
}

/**
 * Obtain a short-lived OAuth2 access token from a signed JWT.
 *
 * @param {Object} serviceAccount
 * @param {string} scopes
 * @param {string} subject
 * @returns {Promise<string>} access_token
 */
async function getAccessToken(serviceAccount, scopes, subject) {
  const jwt = await createJWT(serviceAccount, scopes, subject);

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  const json = await resp.json();
  return json.access_token;
}

/**
 * Parse service account from env.
 */
function getServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Missing env: GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

/**
 * List all users in the domain, optionally filtered by search query.
 *
 * @param {Object} env
 * @param {string} [search=''] - Optional search string (name or email prefix)
 * @returns {Array} Array of user objects: { email, fullName, givenName, familyName, photoUrl }
 */
export async function listUsers(env, search = '') {
  const sa = getServiceAccount(env);
  const token = await getAccessToken(sa, DIRECTORY_SCOPES, ADMIN_EMAIL);

  const params = new URLSearchParams({
    customer: 'my_customer',
    maxResults: '100',
    orderBy: 'email',
    projection: 'basic'
  });

  if (search) {
    params.set('query', `email:${search}* name:${search}*`);
  }

  const resp = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Directory API failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const users = data.users || [];

  return users.map(u => ({
    email: u.primaryEmail,
    fullName: u.name?.fullName || '',
    givenName: u.name?.givenName || '',
    familyName: u.name?.familyName || '',
    photoUrl: u.thumbnailPhotoUrl || ''
  }));
}
