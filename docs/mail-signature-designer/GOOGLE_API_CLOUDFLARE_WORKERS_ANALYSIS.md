# Google API integratie in Cloudflare Workers — Analyse

**Datum:** 20 februari 2026  
**Module:** `mail_signature_designer`  
**Branch:** `mail-signature`

---

## 1. Initiële aanpak: `googleapis` npm-pakket

De eerste implementatie van `directory-client.js` en `gmail-signature-client.js` gebruikte het officiële [`googleapis`](https://www.npmjs.com/package/googleapis) npm-pakket, op precies dezelfde wijze als het werkende `scripts/test-gmail-signature.js`:

```js
import { google } from 'googleapis';

const auth = new google.auth.JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: [...],
  subject: impersonatedEmail
});

const gmail = google.gmail({ version: 'v1', auth });
await gmail.users.settings.sendAs.list({ userId: 'me' });
```

Dit werkt perfect in een standaard Node.js-omgeving, maar faalt in Cloudflare Workers.

---

## 2. Het probleem: Cloudflare Workers ≠ Node.js

### Build-fouten (63 errors)

Bij `wrangler dev` produceerde esbuild onmiddellijk 63 build-fouten van de vorm:

```
X [ERROR] Could not resolve "http"
    node_modules/agent-base/dist/helpers.js:27:34
    The package "http" wasn't found on the file system but is built into node.
    Add the "nodejs_compat" compatibility flag to your project.
```

De betrokken Node.js built-ins waren: `http`, `https`, `net`, `tls`, `stream`, `buffer`, `crypto`, `fs`, `os`, `path`, `url`, `util`, `events`, `process`, `zlib`, `http2`, `querystring`, `child_process`, `assert`.

De `googleapis`-dependency tree trekt tientallen pakketten mee die elk meerdere Node.js built-ins requiren:

```
googleapis
  └── googleapis-common
  └── google-auth-library
        └── gtoken          (fs, path, util)
        └── google-p12-pem  (crypto)
        └── gcp-metadata    (fs, os)
  └── gaxios              (https, stream)
  └── agent-base          (http, https, net)
  └── https-proxy-agent   (net, tls, url)
  └── node-fetch          (http, https, stream, buffer, zlib, net, url)
  └── jws / jwa           (crypto, stream, util, buffer)
```

### Tijdelijke fix: `nodejs_compat` flag

Als eerste stap werd `"compatibility_flags": ["nodejs_compat"]` toegevoegd aan `wrangler.jsonc`. Dit lost de build-fouten op omdat Wrangler de Node.js built-ins polyfilt of doorstuurt naar de V8 Workers-runtime.

De build slaagde daarna — `wrangler dev` startte op `http://127.0.0.1:8787`.

### Runtime-fout ondanks `nodejs_compat`

Toch gaf de `/api/directory` endpoint een 500-fout:

```
GET http://127.0.0.1:8787/mail-signatures/api/directory?search= 500 (Internal Server Error)
```

De oorzaak: `googleapis` gebruikt intern `node-fetch` en Node.js HTTP-transports (`http.Agent`, `https.Agent`, TCP sockets). Deze werken niet in de Cloudflare Workers runtime, zelfs niet met `nodejs_compat`. Cloudflare Workers draaien op **V8 Isolates** — een gesandboxte JavaScript-omgeving zonder echte TCP-stack of bestandssysteem. `nodejs_compat` polyfilt alleen de meest eenvoudige built-ins; het kan geen volledige HTTP/TCP networking emuleren.

---

## 3. De oplossing: native fetch + Web Crypto JWT

De enige betrouwbare aanpak in Cloudflare Workers is het vermijden van Node.js-afhankelijke pakketten en gebruik maken van de **Workers Web Platform APIs**:

| Behoefte | Node.js (googleapis) | Workers (native) |
|----------|---------------------|-----------------|
| HTTP-requests | `node-fetch` / `https.Agent` | `fetch()` (globaal beschikbaar) |
| JWT ondertekenen | `jwa` + `jws` (crypto module) | `crypto.subtle.sign()` (Web Crypto API) |
| RSA-sleutel importeren | `crypto.createSign()` | `crypto.subtle.importKey('pkcs8', ...)` |
| Base64url | `Buffer.from(...).toString('base64')` | `btoa()` + string replace |

### JWT-flow (volledig in Workers)

```
Service Account JSON (private key PEM)
  ↓
crypto.subtle.importKey('pkcs8', ..., { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' })
  ↓
crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, header.payload)
  ↓
Signed JWT → fetch(TOKEN_URL, { body: { grant_type: 'jwt-bearer', assertion: jwt } })
  ↓
access_token
  ↓
fetch('https://admin.googleapis.com/...', { headers: { Authorization: 'Bearer <token>' } })
```

### Implementatie

**`directory-client.js`** (herschreven, ~140 regels, 0 externe imports):
- `b64url()` — base64url encode via `btoa()`
- `createJWT()` — bouwt en ondertekent JWT via `crypto.subtle`
- `getAccessToken()` — ruilt JWT in bij `oauth2.googleapis.com/token` via `fetch()`
- `listUsers()` — roept `admin.googleapis.com/admin/directory/v1/users` aan via `fetch()`

**`gmail-signature-client.js`** (herschreven, ~170 regels, 0 externe imports):
- Dezelfde JWT/token helpers
- `getPrimarySendAs()` — `GET /gmail/v1/users/me/settings/sendAs`
- `updateSignature()` — één token aanvragen, list + update in één flow (geen dubbele tokenuitwisseling)

---

## 4. Bijkomende lessen

### Domain-wide delegation vereist `sub` in JWT

Voor impersonation (het aanroepen van de API namens een andere gebruiker dan de service account zelf) moet het JWT-payload het `sub`-veld bevatten met het e-mailadres van de te impersoneren gebruiker:

```json
{
  "iss": "signature-manager@...iam.gserviceaccount.com",
  "sub": "nico@mymmo.com",
  "scope": "https://www.googleapis.com/auth/gmail.settings.basic",
  "aud": "https://oauth2.googleapis.com/token",
  "iat": 1708435200,
  "exp": 1708438800
}
```

Zonder `sub` geeft de token exchange een 200 terug maar de Gmail API geeft `403 insufficientPermissions`.

### `googleapis` is uitsluitend aanwezig voor de test-scripts

Het `googleapis`-pakket blijft in `package.json` staan voor gebruik in locale Node.js scripts (`scripts/test-gmail-signature.js`). De Worker-code importeert het niet meer. Dit is de correcte taakverdeling:

| Omgeving | Aanpak |
|----------|--------|
| Node.js scripts (`scripts/`) | `googleapis` npm-pakket |
| Cloudflare Worker (`src/`) | native `fetch()` + Web Crypto |

---

## 5. Conclusie

`googleapis` is een uitstekend pakket voor server-side Node.js maar **onbruikbaar in Cloudflare Workers** omdat het de volledige Node.js networking stack verwacht. De oplossing — een lichtgewicht JWT + fetch implementatie met enkel Web Platform APIs — is niet alleen compatibel maar ook significant sneller (geen zware dependency tree, geen polyfills, koudere start) en beter aansluitend bij het "Workers-first" ontwerp van dit project.
