# Mail Signature Designer  Module Documentation

**Branch:** `mail-signature`  
**Route:** `/mail-signatures`  
**Module code:** `mail_signature_designer`  
**Status:** MVP implemented, local dev fully functional, production pending `GOOGLE_SERVICE_ACCOUNT_JSON` secret

---

## Inhoud

1. [Wat het doet](#1-wat-het-doet)
2. [Architectuur](#2-architectuur)
3. [Bestandsstructuur](#3-bestandsstructuur)
4. [Database](#4-database)
5. [API endpoints](#5-api-endpoints)
6. [Signature compiler](#6-signature-compiler)
7. [Google API integratie](#7-google-api-integratie)
8. [Data flow: push](#8-data-flow-push)
9. [Configuratie en secrets](#9-configuratie-en-secrets)
10. [Bekende beperkingen](#10-bekende-beperkingen)
11. [Cleanup TODO](#11-cleanup-todo)

---

## 1. Wat het doet

De module biedt een UI om:

- een **globale HTML-handtekeningtemplate** te configureren (kleuren, CTA, banner, disclaimer)
- de gegenereerde handtekening te **previewen** op basis van medewerkerdata
- de handtekening te **pushen** naar ��n of meerdere Google Workspace gebruikers via de Gmail Settings API
- een **pushlog** te bekijken (wie werd bijgewerkt, wanneer, succeeded/failed)

Elke push-operatie haalt de naam en foto op uit Google Directory en de jobtitel en telefoonnummer uit Odoo `hr.employee`, en combineert dat met de globale template.

---

## 2. Architectuur

```
Browser UI (ui.js)
    
     GET  /mail-signatures                   volledig HTML-scherm
     GET  /mail-signatures/api/config         laad globale config
     PUT  /mail-signatures/api/config         sla globale config op
     GET  /mail-signatures/api/directory      Google Directory gebruikerslijst
     POST /mail-signatures/api/preview        gecompileerde HTML preview
     POST /mail-signatures/api/push           push naar gebruiker(s)
     GET  /mail-signatures/api/logs           push audit log
     GET  /mail-signatures/api/debug-google   [TIJDELIJK] Google auth diagnose

routes.js
     lib/signature-store.js    (Supabase data access)
     lib/signature-compiler.js (pure HTML compiler)
     lib/directory-client.js   (Google Directory API)
     lib/gmail-signature-client.js (Gmail Settings API)
     lib/odoo.js (gedeeld  searchRead voor hr.employee)
```

**Runtime:** Cloudflare Workers (ESM), `nodejs_compat` vlag vereist.  
**Auth:** alle routes via `validateSession()` in `src/index.js`, behalve de tijdelijke debug-route.

---

## 3. Bestandsstructuur

```
src/modules/mail-signature-designer/
 module.js                    Module-definitie, geregistreerd in registry.js
 routes.js                    Alle HTTP-handlers
 ui.js                        Volledige HTML-pagina (DaisyUI + Tailwind CDN)
 lib/
     supabaseClient.js         Singleton Supabase admin client
     signature-store.js        Data access: config + pushlog
     signature-compiler.js     Pure HTML compiler: config + userData  HTML
     directory-client.js       Google Admin Directory API
     gmail-signature-client.js Gmail Settings API

supabase/migrations/
 20260220000000_mail_signature_designer_v1.sql

docs/mail-signature-designer/
 README.md                    (dit bestand)
```

---

## 4. Database

### Tabel `signature_config`

Singleton  altijd maximaal 1 rij, gehandhaafd via `CREATE UNIQUE INDEX signature_config_singleton ON signature_config ((true))`.

| Kolom        | Type        | Beschrijving |
|-------------|-------------|--------------|
| `id`         | UUID PK     | Vaste waarde: `00000000-0000-0000-0000-000000000001` |
| `config`     | JSONB       | Volledige configuratie (zie Config-structuur hieronder) |
| `updated_at` | TIMESTAMPTZ | Auto-bijgewerkt via trigger |
| `updated_by` | UUID        | UUID van de gebruiker die opgeslagen heeft (geen FK) |

**Config JSONB-structuur:**

```json
{
  "brandColor":      "#2563eb",
  "showPhoto":       false,
  "showCTA":         false,
  "showBanner":      false,
  "showDisclaimer":  false,
  "ctaText":         "",
  "ctaUrl":          "",
  "bannerImageUrl":  "",
  "bannerLinkUrl":   "",
  "disclaimerText":  ""
}
```

### Tabel `signature_push_log`

Append-only audit log. Elke push-poging per gebruiker levert ��n rij op, ongeacht succes of fout.

| Kolom               | Type        | Beschrijving |
|--------------------|-------------|--------------|
| `id`                | UUID PK     | Auto-gegenereerd |
| `actor_email`       | TEXT        | Email van de beheerder die pusht |
| `pushed_at`         | TIMESTAMPTZ | Auto-timestamp bij insert |
| `target_user_email` | TEXT        | Google Workspace email van de doelgebruiker |
| `sendas_email`      | TEXT        | Primair sendAs-adres dat bijgewerkt werd |
| `success`           | BOOLEAN     | Of de push geslaagd is |
| `error_message`     | TEXT        | Foutmelding bij mislukking |
| `html_hash`         | TEXT        | FNV-1a 32-bit hash van de gegenereerde HTML |
| `metadata`          | JSONB       | Extra info: compiler-warnings, etc. |

Indexen op `pushed_at DESC`, `actor_email`, `success`.

### RLS

Beide tabellen: permissief `TO public` (access enforcement zit in de module auth-laag van `index.js`).

---

## 5. API endpoints

### `GET /mail-signatures`
Geeft de volledige HTML-pagina terug. Vereist een geldige sessie.

### `GET /mail-signatures/api/config`
Returns `{ success: true, data: { config, updated_at, updated_by } }`.  
Geeft lege config terug als nog geen rij bestaat.

### `PUT /mail-signatures/api/config`
Body: het config-object (zie Config JSONB-structuur).  
Slaat op via upsert op de vaste singleton UUID. Gebruikt `user.id` (UUID) als `updated_by`.

### `GET /mail-signatures/api/directory?search=`
Optionele `search`-parameter filtert op naam of email-prefix via Google Directory API.  
Returns `{ success: true, data: { users: [{ email, fullName, givenName, familyName, photoUrl }] } }`.

### `POST /mail-signatures/api/preview`
Body: `{ config, userData: { fullName, roleTitle, email, phone, photoUrl } }`  
Compileert direct zonder database-calls.  
Returns `{ success: true, data: { html, warnings } }`.

### `POST /mail-signatures/api/push`
Body:
```json
{
  "targetUserEmails": ["nico@mymmo.com"],
  "userDataOverrides": {
    "nico@mymmo.com": { "fullName": "...", "roleTitle": "...", "phone": "...", "photoUrl": "..." }
  }
}
```
Ook `"targetUserEmails": "all"` is geldig  pusht naar alle Directory-gebruikers.

Haalt in parallel op:
1. Configuratie uit Supabase
2. Alle gebruikers uit Google Directory (fullName, photoUrl)
3. Alle actieve medewerkers uit Odoo `hr.employee` (job_title, mobile_phone)

Matcht op email. Verwerkt in batches van 5 concurrent. Logt elke poging in `signature_push_log`.  
Als Directory of Odoo faalt: graceful degradation naar lege velden (warning in console).

### `GET /mail-signatures/api/logs?limit=100`
Returns recentste push-logregels, nieuwste eerst. Max 500.

### `GET /mail-signatures/api/debug-google`  TIJDELIJK
Unauthenticated endpoint. Diagnoseert stap voor stap de volledige Google auth-keten:
env var aanwezig  JSON parse  PEM extract  importKey  JWT sign  token exchange  Directory API call.

**Verwijderen na productietest.**

---

## 6. Signature compiler

`lib/signature-compiler.js` is een pure functie zonder side effects.

```js
compileSignature(config, userData)  { html, warnings }
```

**Input `userData`:**

| Veld         | Bron                             |
|-------------|----------------------------------|
| `email`      | Google Directory (primaryEmail)  |
| `fullName`   | Google Directory (name.fullName) |
| `photoUrl`   | Google Directory (thumbnailPhotoUrl) |
| `roleTitle`  | Odoo hr.employee.job_title       |
| `phone`      | Odoo hr.employee.mobile_phone    |

**HTML-output regels:**
- Table-based layout (Outlook-compatibel)
- Alle stijlen inline, max-width 600px
- Font: Arial, Helvetica, sans-serif
- Lege blokken uitgelaten (geen lege `<br>` of lege `<tr>`)
- Onbekende `{{placeholders}}` in vrije tekstvelden (ctaText, disclaimerText) worden leeg gemaakt en als warning teruggegeven
- Photo-blok alleen gerenderd als `showPhoto === true` �n `photoUrl` niet leeg is

**Vaste elementen (niet configureerbaar):**
- Merk-naam "OpenVME" in brandColor
- Link "openvme.be" in contactblok

---

## 7. Google API integratie

Beide clients gebruiken **native `fetch()` + `crypto.subtle`**  g��n `googleapis` SDK.  
De `googleapis` npm-dependency gebruikt Node.js built-ins die niet werken in Cloudflare Workers, ook niet met `nodejs_compat`.

### Auth-flow

```
Service account JSON (env)
   PEM private key extraheren
   crypto.subtle.importKey (PKCS8 / RSASSA-PKCS1-v1_5 / SHA-256)
   JWT bouwen: { iss, sub, scope, aud, iat, exp }
   crypto.subtle.sign  base64url
   POST https://oauth2.googleapis.com/token (grant_type: jwt-bearer)
   access_token (geldig 1 uur)
   API-call met Authorization: Bearer <token>
```

### `directory-client.js`

- Scope: `https://www.googleapis.com/auth/admin.directory.user.readonly`
- Sub (impersonation): `nico@mymmo.com` (domain-wide delegation admin)
- Endpoint: `GET https://admin.googleapis.com/admin/directory/v1/users`
- Export: `listUsers(env, search?)`

### `gmail-signature-client.js`

- Scope: `https://www.googleapis.com/auth/gmail.settings.basic`
- Sub (impersonation): de doelgebruiker zelf
- Endpoints:
  - `GET https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs`  primair sendAs bepalen
  - `PUT https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/{sendAsEmail}`  handtekening schrijven
- ��n token-exchange per gebruiker voor beide calls
- Exports: `getPrimarySendAs(env, userEmail)`, `updateSignature(env, userEmail, html)`

### Vereiste Google Cloud configuratie

1. Service account: `signature-manager@operations-signature-manager.iam.gserviceaccount.com`
2. Client ID: `114736715876839968786`
3. Domain-wide delegation ingeschakeld op het service account
4. In Google Workspace Admin  Security  API Controls  Domain-wide delegation:
   - Scopes: `https://www.googleapis.com/auth/admin.directory.user.readonly` + `https://www.googleapis.com/auth/gmail.settings.basic`

---

## 8. Data flow: push

```
POST /api/push  { targetUserEmails: ["nico@mymmo.com"] }
  
   Parallel fetch:
      Supabase: signature_config (JSONB config)
      Google Directory: alle users  map email  { fullName, photoUrl }
      Odoo hr.employee: alle actieve  map work_email  { job_title, mobile_phone }
  
   Per target-email (max 5 concurrent):
      userData samenstellen uit directory + odoo + overrides
      compileSignature(config, userData)  { html, warnings }
      updateSignature(env, targetEmail, html)
         getAccessToken (JWT sign  token exchange)
         getPrimarySendAs  sendAsEmail
         PUT sendAs signature
      logPush(env, { success, html_hash, warnings })
  
   Return { results[], successCount, failCount }
```

---

## 9. Configuratie en secrets

### Lokale dev (`.dev.vars`)

```dotenv
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...volledig JSON op ��n regel...}
```

Wrangler leest `.dev.vars` opnieuw bij elke herstart van `wrangler dev`. Als de worker al draaide toen de variabele werd toegevoegd, is een herstart vereist.

### Productie (Cloudflare Secrets)

`GOOGLE_SERVICE_ACCOUNT_JSON` moet nog aangemaakt worden:

```powershell
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# plak de volledige JSON als ��n regel bij de prompt
```

Verifi�ren:

```powershell
npx wrangler secret list
```

### Secret-status productie

| Secret | Status |
|--------|--------|
| `SUPABASE_URL` |  |
| `SUPABASE_SERVICE_ROLE_KEY` |  |
| `DB_NAME` |  |
| `UID` |  |
| `API_KEY` |  |
| `AUTH_TOKEN` |  |
| `ADMIN_TOKEN` |  |
| `WORDPRESS_URL` |  |
| `WP_API_TOKEN` |  |
| `WP_PASSWORD` |  |
| `WP_USERNAME` |  |
| `GOOGLE_SERVICE_ACCOUNT_JSON` |  **ontbreekt** |

---

## 10. Bekende beperkingen

**Foto's in Gmail**  
`thumbnailPhotoUrl` uit Google Directory vereist authenticatie. Gmail-clients buiten het Google domein kunnen de foto niet laden. `showPhoto` werkt alleen met een publiek toegankelijke URL.

**Singleton config**  
��n globale handtekening voor de hele organisatie. Per-gebruiker templates zijn niet ondersteund in V1.

**Odoo-match op email**  
Koppeling tussen Google Directory-gebruiker en Odoo-medewerker via `work_email`. Bij afwijkend emailadres: graceful degradation naar lege `roleTitle` en `phone`.

**Debug-endpoint is unauthenticated**  
`GET /api/debug-google` en de public bypass in `src/index.js` moeten verwijderd worden na productietest.

---

## 11. Cleanup TODO

Na `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON` en succesvolle productietest:

**1. Verwijder debug handler uit `routes.js`**  
Het volledige `'GET /api/debug-google'` blok (momenteel regels 55186).

**2. Verwijder public bypass uit `src/index.js`**

```js
// Verwijder dit blok:
if (pathname === '/api/debug-google' && request.method === 'GET') {
  const { routes: sigRoutes } = await import('./modules/mail-signature-designer/routes.js');
  return await sigRoutes['GET /api/debug-google']({ env, request, user: null });
}
```

**3. Commit en merge `mail-signature`  `main`**
