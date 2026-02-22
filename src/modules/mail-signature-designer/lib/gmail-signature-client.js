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
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.settings.basic';

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
 */
async function getAccessToken(serviceAccount, subject) {
  const jwt = await createJWT(serviceAccount, GMAIL_SCOPES, subject);

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
  const sendAsEmail = (sendAsList.find(s => s.isPrimary) || sendAsList[0]).sendAsEmail;

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(sendAsEmail)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signature: signatureHtml })
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`sendAs.update failed for ${userEmail} (${resp.status}): ${text}`);
  }

  return { sendAsEmail };
}
