/**
 * Mini-Apps — Gmail Send Client
 *
 * Verstuurt e-mail namens de organisatie via de Gmail API
 * (users.messages.send), met domain-wide delegation via het bestaande
 * service-account (env.GOOGLE_SERVICE_ACCOUNT_KEY -- zelfde secret als
 * mail-signature-designer, nu ook geautoriseerd voor de scope 'gmail.send'
 * in de Admin Console domeinbrede delegatie voor dit client-id).
 *
 * Bewust een eigen, zelfstandige kopie van de JWT/token-exchange-logica
 * i.p.v. hergebruik van mail-signature-designer/lib/gmail-signature-client.js
 * -- zo blijft die al werkende, productie-signature-flow volledig onaangeroerd
 * door deze nieuwe, ongerelateerde feature.
 *
 * Env requirements:
 *   GOOGLE_SERVICE_ACCOUNT_KEY         (Cloudflare secret, bestaat al)
 *   MINI_APPS_NOTIFY_IMPERSONATE_EMAIL (optioneel, default 'nico@mymmo.com')
 *   -- de ECHTE Workspace-mailbox die we impersoneren voor domain-wide
 *   delegation (het 'sub'-veld in de JWT). Moet een bestaand account zijn.
 *   MINI_APPS_NOTIFY_FROM_EMAIL        (optioneel, default = zelfde als
 *   impersonate-email) -- het adres dat de ontvanger als "Van" ziet. Mag een
 *   alias/verified sendAs-adres van de impersonate-mailbox zijn (bv.
 *   hallo-collega@mymmo.com als alternatief e-mailadres op die mailbox) --
 *   geen apart Workspace-account of licentie nodig, wel eerst toevoegen via
 *   Admin Console → Directory → Gebruikers → alternatief e-mailadres.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const DEFAULT_IMPERSONATE_EMAIL = 'nico@mymmo.com';
const FROM_DISPLAY_NAME = 'Operations Manager (mini-apps)';

// ─── Base64(url) helpers ─────────────────────────────────────────────────────

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlFromString(str) {
  return b64url(new TextEncoder().encode(str));
}

/** MIME-body base64 netjes op 76 tekens per regel (RFC 2045). */
function wrap76(b64) {
  return b64.replace(/.{76}/g, (line) => `${line}\r\n`);
}

// ─── JWT / domain-wide delegation (zelfde patroon als gmail-signature-client.js) ─

async function createJWT(serviceAccount, scopes, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64urlFromString(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: subject,
    scope: scopes,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));

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

async function getAccessToken(serviceAccount, subject, scopes) {
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

function getServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('Missing env: GOOGLE_SERVICE_ACCOUNT_KEY');
  }
  return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function getImpersonateEmail(env) {
  return env.MINI_APPS_NOTIFY_IMPERSONATE_EMAIL || DEFAULT_IMPERSONATE_EMAIL;
}

function getFromEmail(env) {
  return env.MINI_APPS_NOTIFY_FROM_EMAIL || getImpersonateEmail(env);
}

// ─── MIME-bericht ────────────────────────────────────────────────────────────

/** RFC 2047-encode een headerwaarde zodra die niet-ASCII bevat (bv. é, ë). */
function encodeHeaderValue(text) {
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  return `=?UTF-8?B?${toBase64(new TextEncoder().encode(text))}?=`;
}

function buildMimeMessage({ fromEmail, toEmail, subject, textBody, htmlBody }) {
  const from = `"${encodeHeaderValue(FROM_DISPLAY_NAME)}" <${fromEmail}>`;
  const textB64 = wrap76(toBase64(new TextEncoder().encode(textBody)));

  // Zonder htmlBody (bv. een toekomstige andere aanroeper van sendEmail()):
  // gewoon platte tekst, exact zoals voorheen -- geen gedrag gewijzigd.
  if (!htmlBody) {
    return [
      `From: ${from}`,
      `To: ${toEmail}`,
      `Subject: ${encodeHeaderValue(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      textB64
    ].join('\r\n');
  }

  // multipart/alternative: mailclients die geen HTML tonen (of de gebruiker
  // koos platte tekst) vallen terug op het text/plain-deel; de rest krijgt
  // de opgemaakte HTML-versie te zien. Boundary bevat geen voorspelbare data
  // (crypto.randomUUID()), kan dus nooit botsen met base64-inhoud.
  const boundary = `mini-apps-${crypto.randomUUID()}`;
  const htmlB64 = wrap76(toBase64(new TextEncoder().encode(htmlBody)));

  return [
    `From: ${from}`,
    `To: ${toEmail}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    textB64,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    '',
    `--${boundary}--`
  ].join('\r\n');
}

// ─── Publieke API ────────────────────────────────────────────────────────────

/**
 * Verstuurt een e-mail namens de organisatie. Met htmlBody: multipart/
 * alternative (platte tekst + opgemaakte HTML, mailclient kiest zelf).
 * Zonder htmlBody: platte tekst, ongewijzigd t.o.v. voorheen.
 *
 * @param {Object} env
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} textBody
 * @param {string} [htmlBody]
 */
export async function sendEmail(env, toEmail, subject, textBody, htmlBody) {
  const sa = getServiceAccount(env);
  const impersonateEmail = getImpersonateEmail(env);
  const fromEmail = getFromEmail(env);
  const token = await getAccessToken(sa, impersonateEmail, GMAIL_SEND_SCOPE);

  const raw = b64urlFromString(buildMimeMessage({ fromEmail, toEmail, subject, textBody, htmlBody }));

  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail send failed (${resp.status}): ${text}`);
  }
}
