/**
 * Mini-Apps — Google Drive Client
 *
 * Geeft mini-apps read + create-toegang tot Google Drive, via
 * window.platform.drive.*, ZONDER dat elke gebruiker een eigen OAuth-
 * consent-flow moet doorlopen. Hergebruikt het bestaande service-account
 * (env.GOOGLE_SERVICE_ACCOUNT_KEY -- zelfde secret als gmail-send-client.js
 * en mail-signature-designer), maar impersoneert hier NOOIT een vaste
 * mailbox: het 'sub'-veld in de JWT is altijd het echte e-mailadres van de
 * ingelogde Operations Manager-gebruiker (context.user.email) die de
 * mini-app op dat moment gebruikt.
 *
 * Waarom dit veilig is voor "enkel bestanden waar de gebruiker zelf
 * toegang toe heeft": domain-wide delegation + impersonation betekent dat
 * Google de aanvraag behandelt AL WAS HET die gebruiker zelf die de Drive
 * API aanroept. Drive's eigen permissiemodel (wie het bestand ziet/mag
 * bewerken) wordt dus native afgedwongen door Google zelf -- er is geen
 * aparte "shared with everyone"-filtering in onze code nodig of mogelijk
 * om te omzeilen.
 *
 * Vereist EENMALIG, door een Workspace-admin, in admin.google.com →
 * Security → API controls → Domain-wide delegation: het Client ID van
 * hetzelfde service-account toevoegen met scopes
 *   https://www.googleapis.com/auth/drive.readonly
 *   https://www.googleapis.com/auth/drive.file
 * (comma-separated in de Admin Console, space-separated in de JWT hieronder).
 *
 * Bewust een eigen, zelfstandige kopie van de JWT/token-exchange-logica
 * i.p.v. hergebruik van gmail-send-client.js -- zelfde reden als daar
 * gedocumenteerd: zo blijft de al werkende notify-flow volledig onaangeroerd
 * door deze nieuwe, ongerelateerde feature.
 *
 * Enkel READ + CREATE. Er bestaat bewust geen update/delete-functie in dit
 * bestand en geen update/delete-route in routes.js -- ongeacht wat de Drive
 * API zelf zou toelaten met deze scopes, is er hier geen code-pad naartoe.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Functionele kill-switch (2026-07-24, zie CLAUDE.md "Google Drive-koppeling
 * mini-apps -- UITGESCHAKELD"). De koppeling zelf werkt (domain-wide
 * delegation is gewhitelist en getest), maar staat bewust volledig dicht:
 * gebruikers/de BUILD_PROMPT weten niet dat window.platform.drive bestaat
 * (verwijderd uit de iframe-shim in mini-apps-core.js) en de routes in
 * routes.js geven hierdoor sowieso 404. Zet dit terug op true (en herstel de
 * shim + BUILD_PROMPT-paragraaf + git-historie van die bestanden) zodra er
 * een veilige AI-koppeling is (geen gratis/training-tier) -- zie CLAUDE.md
 * voor de volledige motivatie en heractivatie-checklist.
 */
export const DRIVE_INTEGRATION_ENABLED = false;

export const MAX_LIST_PAGE_SIZE = 100;
export const MAX_CREATE_CONTENT_LENGTH = 2_000_000; // ~2MB, ruim genoeg voor mini-app-gegenereerde bestanden

function driveError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  if (status) err.status = status;
  return err;
}

// ─── Base64(url) helpers (zelfde patroon als gmail-send-client.js) ──────────

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlFromString(str) {
  return b64url(new TextEncoder().encode(str));
}

// ─── JWT / domain-wide delegation ────────────────────────────────────────────

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

async function getAccessToken(serviceAccount, subject) {
  const jwt = await createJWT(serviceAccount, DRIVE_SCOPES, subject);

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
    // Meest voorkomende oorzaak: domain-wide delegation nog niet gewhitelist
    // voor deze scopes/client-id, of de gebruiker heeft geen Workspace-account.
    throw driveError(`Google-token-aanvraag mislukt (${resp.status}): ${text}`, 'TOKEN_EXCHANGE_FAILED', resp.status);
  }

  const json = await resp.json();
  return json.access_token;
}

function getServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw driveError('Missing env: GOOGLE_SERVICE_ACCOUNT_KEY', 'MISSING_SERVICE_ACCOUNT');
  }
  return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

/**
 * Haalt een kort-levend access-token op namens de opgegeven, ECHTE
 * gebruiker (nooit een vaste/gedeelde mailbox -- roep dit altijd aan met
 * context.user.email van de ingelogde Operations Manager-sessie).
 */
async function getUserAccessToken(env, userEmail) {
  if (!userEmail) {
    throw driveError('userEmail is verplicht (impersonation-subject)', 'MISSING_USER_EMAIL');
  }
  const sa = getServiceAccount(env);
  return getAccessToken(sa, userEmail);
}

// ─── Publieke API ────────────────────────────────────────────────────────────

/**
 * Lijst bestanden die de gebruiker zelf in zijn Drive kan zien (native
 * Google-permissies, geen eigen filtering nodig/mogelijk).
 *
 * @param {Object} env
 * @param {string} userEmail
 * @param {Object} [opts]
 * @param {string} [opts.query] - vrije-tekst zoekterm (matcht op bestandsnaam)
 * @param {number} [opts.pageSize]
 * @param {string} [opts.pageToken]
 */
export async function listDriveFiles(env, userEmail, opts = {}) {
  const token = await getUserAccessToken(env, userEmail);

  const pageSize = Math.min(Math.max(1, opts.pageSize || 25), MAX_LIST_PAGE_SIZE);
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,shared,owners(displayName,emailAddress))',
    orderBy: 'modifiedTime desc',
    corpora: 'allDrives',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true'
  });

  const qParts = ["trashed = false"];
  if (opts.query && String(opts.query).trim()) {
    const escaped = String(opts.query).trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    qParts.push(`name contains '${escaped}'`);
  }
  params.set('q', qParts.join(' and '));

  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const resp = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw driveError(`Drive-lijst mislukt (${resp.status}): ${text}`, 'LIST_FAILED', resp.status);
  }

  const json = await resp.json();
  return { files: json.files || [], nextPageToken: json.nextPageToken || null };
}

/**
 * Leest metadata + (voor tekstuele bestanden) inhoud van één bestand,
 * enkel toegankelijk als de gebruiker er zelf rechten toe heeft.
 */
export async function getDriveFile(env, userEmail, fileId) {
  if (!fileId) throw driveError('fileId is verplicht', 'MISSING_FILE_ID');
  const token = await getUserAccessToken(env, userEmail);

  const metaResp = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink,size,owners(displayName,emailAddress)&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!metaResp.ok) {
    const text = await metaResp.text();
    throw driveError(`Drive-metadata mislukt (${metaResp.status}): ${text}`, 'GET_METADATA_FAILED', metaResp.status);
  }

  const meta = await metaResp.json();

  // Google-native documenten (Docs/Sheets/Slides) hebben geen downloadbare
  // bytes -- die moeten geëxporteerd worden naar een concreet formaat.
  const GOOGLE_EXPORT_MIME = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain'
  };

  let content = null;
  let contentMimeType = meta.mimeType;

  if (GOOGLE_EXPORT_MIME[meta.mimeType]) {
    contentMimeType = GOOGLE_EXPORT_MIME[meta.mimeType];
    const exportResp = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(contentMimeType)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (exportResp.ok) {
      content = await exportResp.text();
    }
  } else if (meta.mimeType && meta.mimeType.startsWith('text/') || meta.mimeType === 'application/json') {
    const mediaResp = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (mediaResp.ok) {
      content = await mediaResp.text();
    }
  }
  // Andere bestandstypes (afbeeldingen, PDF, ...): enkel metadata + webViewLink,
  // geen ruwe binary-inhoud teruggegeven aan de mini-app.

  return { ...meta, content, contentMimeType };
}

/**
 * Maakt een nieuw bestand aan namens de gebruiker (landt in diens "Mijn
 * Drive"). Enkel tekstuele inhoud (mini-app-gegenereerde exports/notities
 * e.d.) -- geen binary upload-pad.
 */
export async function createDriveFile(env, userEmail, { name, mimeType, content, parentId }) {
  if (!name || !String(name).trim()) throw driveError('name is verplicht', 'MISSING_NAME');
  if (typeof content !== 'string') throw driveError('content moet een string zijn', 'INVALID_CONTENT');
  if (content.length > MAX_CREATE_CONTENT_LENGTH) {
    throw driveError(`content overschrijdt maximum van ${MAX_CREATE_CONTENT_LENGTH} tekens`, 'CONTENT_TOO_LARGE');
  }

  const token = await getUserAccessToken(env, userEmail);
  const finalMimeType = mimeType || 'text/plain';

  const metadata = { name: String(name).trim(), mimeType: finalMimeType };
  if (parentId) metadata.parents = [parentId];

  const boundary = `mini-apps-drive-${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${finalMimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const resp = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw driveError(`Drive-aanmaak mislukt (${resp.status}): ${text}`, 'CREATE_FAILED', resp.status);
  }

  return resp.json();
}
