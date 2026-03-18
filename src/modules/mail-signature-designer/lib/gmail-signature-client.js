/**
 * Mail Signature Designer - Gmail Signature Client
 *
 * Wraps Gmail Settings API using native fetch + Web Crypto JWT.
 * Works in Cloudflare Workers without googleapis SDK.
 *
 * Env requirements:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  (Cloudflare secret, stringified JSON)
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// gmail.settings.basic  – required for list/read/patch primary sendAs
// gmail.settings.sharing – additionally required for PATCH on non-primary (alias) sendAs
const GMAIL_SCOPES_BASIC   = 'https://www.googleapis.com/auth/gmail.settings.basic';
const GMAIL_SCOPES_SHARING = 'https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.settings.sharing';

/**
 * Base64url encode (no padding).
 */
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a signed JWT for a Google service account using Web Crypto.
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
 * Exchange signed JWT for an OAuth2 access token.
 * @param {Object} serviceAccount
 * @param {string} subject  - user to impersonate
 * @param {string} [scopes] - space-separated scope string (defaults to BASIC)
 */
async function getAccessToken(serviceAccount, subject, scopes = GMAIL_SCOPES_BASIC) {
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
 * Get the primary sendAs address for a user.
 *
 * @param {Object} env
 * @param {string} userEmail
 * @returns {{ sendAsEmail: string, currentSignature: string }}
 */
export async function getPrimarySendAs(env, userEmail) {
  const sa = getServiceAccount(env);
  const token = await getAccessToken(sa, userEmail);

  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`sendAs.list failed for ${userEmail} (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const sendAsList = data.sendAs || [];

  if (sendAsList.length === 0) {
    throw new Error(`No sendAs identities found for ${userEmail}`);
  }

  const primary = sendAsList.find(s => s.isPrimary) || sendAsList[0];

  return {
    sendAsEmail: primary.sendAsEmail,
    currentSignature: primary.signature || ''
  };
}

/**
 * List all sendAs identities for a user (primary + aliases).
 *
 * @param {Object} env
 * @param {string} userEmail
 * @returns {Promise<Array<{ sendAsEmail, displayName, isPrimary, isDefault, signature }>>}
 */
export async function listSendAs(env, userEmail) {
  const sa = getServiceAccount(env);
  const token = await getAccessToken(sa, userEmail);

  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`sendAs.list failed for ${userEmail} (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  return (data.sendAs || []).map(s => ({
    sendAsEmail: s.sendAsEmail,
    displayName: s.displayName || '',
    isPrimary:   !!s.isPrimary,
    isDefault:   !!s.isDefault,
    signature:   s.signature || ''
  }));
}

/**
 * Push a signature to a specific sendAs address without listing first.
 * The caller is responsible for providing a valid sendAsEmail.
 *
 * @param {Object} env
 * @param {string} userEmail    - Google Workspace user to impersonate
 * @param {string} sendAsEmail  - The sendAs address to update
 * @param {string} signatureHtml
 * @returns {Promise<void>}
 */
export async function pushSignatureToAlias(env, userEmail, sendAsEmail, signatureHtml) {
  const sa = getServiceAccount(env);
  // Non-primary sendAs requires the additional gmail.settings.sharing scope
  const token = await getAccessToken(sa, userEmail, GMAIL_SCOPES_SHARING);

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(sendAsEmail)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signature: signatureHtml })
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`sendAs.patch failed for ${sendAsEmail} on ${userEmail} (${resp.status}): ${text}`);
  }
}

/**
 * Update the signature for the primary sendAs of a user.
 *
 * @param {Object} env
 * @param {string} userEmail - The Google Workspace user to impersonate
 * @param {string} signatureHtml - HTML string for the new signature
 * @returns {{ sendAsEmail: string }}
 */
export async function updateSignature(env, userEmail, signatureHtml) {
  const sa = getServiceAccount(env);
  const token = await getAccessToken(sa, userEmail);

  // Determine primary sendAs using the same token
  const listResp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listResp.ok) {
    const text = await listResp.text();
    throw new Error(`sendAs.list failed for ${userEmail} (${listResp.status}): ${text}`);
  }

  const listData = await listResp.json();
  const sendAsList = listData.sendAs || [];
  if (sendAsList.length === 0) throw new Error(`No sendAs identities found for ${userEmail}`);
  const primarySendAs = sendAsList.find(s => s.isPrimary) || sendAsList[0];
  const sendAsEmail = primarySendAs.sendAsEmail;
  const oldSignature = primarySendAs.signature || '';

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(sendAsEmail)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signature: signatureHtml })
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`sendAs.patch failed for ${userEmail} (${resp.status}): ${text}`);
  }

  return { sendAsEmail, oldSignature };
}
