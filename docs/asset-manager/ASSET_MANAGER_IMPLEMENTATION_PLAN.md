# Asset Manager — Implementatieplan

> **Status:** Fase 0 — Planning (Iteratie 3)  
> **Branch:** `assets-manager`  
> **Datum:** 2026-02-24  
> **Vorige stap:** [ASSET_MANAGER_ARCHITECTURE.md](./ASSET_MANAGER_ARCHITECTURE.md)

---

## Overzicht

Dit document beschrijft de fasering en volgorde van implementatie voor de `asset_manager` module. Elke fase heeft duidelijke deliverables en een go/no-go checkpoint.

**Totaal: 6 fasen (inclusief pre-module infra)**

| Fase | Naam | Branch | Scope | Blocker voor |
|------|------|--------|-------|-------------|
| 0 | Analyse & Architectuur | `assets-manager` | Documenten | Pre-infra |
| Pre | Global Infra Correction | **`master`** | wrangler.jsonc + R2 binding | Fase 1 |
| 1 | Core backend | `assets-manager` | r2-client, path-utils, routes skeleton | Fase 2 |
| 2 | Public serving + UI skeleton | `assets-manager` | index.js, ui.js, module.js, registry | Fase 3 |
| 3 | API implementatie + Client JS | `assets-manager` | routes.js volledig, asset-manager-client.js | Fase 4 |
| 4 | Polish & koppelingen | `assets-manager` | Role-gating, optioneel domein, module-koppelingen | — |

**Kritieke volgorderegel:** De infra-correctie (Pre-fase) gebeurt op `master` en wordt gedeployed **vóórdat** enige code op `assets-manager` geïmplementeerd wordt. De module mag de `R2_ASSETS` binding gebruiken, maar mag hem niet introduceren.

---

## Pre-fase — Global Infra Correction

> **Branch: `master`**  
> **Doel:** Dashboard-binding elimineren. `wrangler.jsonc` is van nu af de enige bron van waarheid voor alle bindings. Na deze fase mag `wrangler deploy` **nul** binding-warnings produceren.

### Stappen (volgorde dwingend, op master branch)

**Pre.1 — Vaststellen huidige R2 bucket naam en inhoud**
- Open Cloudflare Dashboard → R2 → bestaande buckets
- Noteer de **exacte bucket-naam** (bv. `openvme-assets` of anders)
- Noteer het **aantal objecten** in de bucket (migratie-nulmeting)
- Bevestig: bucket public-access staat UIT

**Pre.2 — R2 binding toevoegen aan wrangler.jsonc**
```jsonc
"r2_buckets": [
  {
    "binding": "R2_ASSETS",
    "bucket_name": "<exacte-bucket-naam>"
  }
]
```
- Binding naam: **`R2_ASSETS`** (niet `ASSETS` — dat is al in gebruik)
- Commit message: `infra: add R2_ASSETS binding to wrangler.jsonc`
- **Geen andere code-wijzigingen in deze commit**

**Pre.3 — Deploy en verificatie**
```bash
wrangler deploy
```
- Controleer: **nul** binding-waarschuwingen in de output
- Controleer: bestaande modules werken correct
- Controleer: bucket-inhoud ongewijzigd (zelfde aantal objecten als gemeten in Pre.1)

**Pre.4 — Dashboard opruimen**
- Verwijder de handmatig geconfigureerde binding uit het Cloudflare Dashboard
- Dashboard toont nu exact dezelfde state als `wrangler.jsonc`

**Go/No-Go criteria Pre-fase:**
- [ ] `wrangler deploy` geeft **nul** binding-warnings
- [ ] Alle bestaande modules werken correct
- [ ] Bucket-inhoud ongewijzigd
- [ ] Dashboard-binding handmatig verwijderd
- [ ] Commit aanwezig op `master` met alleen de wrangler.jsonc wijziging

**→ Pas na ✅ Go op alle bovenstaande criteria begint implementatie op `assets-manager` branch.**

---

## Fase 0 — Analyse & Architectuur ✅ (huidig)

**Deliverables:**
- [x] `ASSET_MANAGER_ANALYSIS.md` — uitgebreide codebase-analyse
- [x] `ASSET_MANAGER_ARCHITECTURE.md` — module-ontwerp + API-contract
- [x] `ASSET_MANAGER_IMPLEMENTATION_PLAN.md` — dit document

**Checkpoint:** Alle drie documenten aanwezig en compleet. Iteratie 2 verwerkt.

---

## Fase 1 — Core backend

> **Doel:** R2 abstractielaag en veiligheidshelpers gereed. Nog geen UI. Vereist dat Pre-fase geslaagd is.

### Bestanden aanmaken

**1.1 — `src/modules/asset-manager/lib/path-utils.js`**

Inhoud: pure functies voor key-validatie en -normalisatie.

Functies te implementeren:
- `validateKey(key)` → boolean
- `sanitizeFilename(name)` → string
- `buildUserPrefix(userId)` → `'users/${userId}/'`
- `isPublicKey(key)` → boolean
- `isWithinPrefix(key, prefix)` → boolean
- `normalizePrefix(prefix)` → string (trailing slash afdwingen)

Veiligheidseisen:
- Blokkeer `..` in keys (path traversal)
- Blokkeer keys die beginnen met `/`
- Blokkeer null bytes
- Max key-lengte: 1024 tekens
- Geldige karakters: `[a-zA-Z0-9._\-\/]` (plus URL-encoded uitbreidingen)
- Prefix-isolatie: `isWithinPrefix(key, allowedPrefix)` is de primaire toegangsbeveiligingsfunctie

**1.2 — `src/modules/asset-manager/lib/mime-types.js`**

Inhoud:
- MIME-type whitelist (toegestane upload-types)
- `getMimeType(filename)` → string op basis van extensie
- `isAllowedMimeType(mimeType)` → boolean

Toegestane types (MVP):
```
image/*:    jpeg, png, gif, webp, svg
text/*:     html, css, plain
application/pdf
application/zip
application/json
```

**1.3 — `src/modules/asset-manager/lib/r2-client.js`**

Inhoud: dunne wrapper om `env.R2_ASSETS`.

Functies:
- `listObjects(env, { prefix, cursor, limit })` → `{ objects[], truncated, cursor }`
- `putObject(env, key, body, { contentType, customMetadata })` → `{ key, etag, size }`
- `getObject(env, key)` → `R2ObjectBody | null`
- `deleteObject(env, key)` → `void`
- `headObject(env, key)` → `R2Object | null`
- `copyObject(env, sourceKey, destKey)` → `{ key }`

Foutafhandeling: elke functie vangt R2-errors en gooit een consistent error-object.

Log-prefix: alle `console.log`/`console.error` calls in dit bestand starten met `[asset-manager]`.

**1.4 — `src/modules/asset-manager/routes.js` (skeleton)**

Alleen de handler-signatures + jsonOk/jsonError helpers + `MAX_UPLOAD_BYTES` constante. Nog geen volledige logica.
Routes die gedeclareerd worden:
- `GET /`
- `GET /api/assets/list`
- `POST /api/assets/upload`
- `DELETE /api/assets/delete`
- `POST /api/assets/rename`
- `POST /api/assets/move`

`MAX_UPLOAD_BYTES` staat bovenaan het bestand als named constant (default: `10 * 1024 * 1024`).

**1.5 — `src/modules/asset-manager/module.js`**

Volledige module registratie. Klaar voor registry.

**Go/No-Go criteria Fase 1:**
- [ ] `path-utils.js` heeft alle veiligheidsvalidaties
- [ ] `r2-client.js` heeft alle functies met `[asset-manager]` log prefix
- [ ] `routes.js` heeft alle route-keys gedefinieerd (skeletons) + `MAX_UPLOAD_BYTES` constante
- [ ] `module.js` klaar voor registry-toevoeging
- [ ] Geen syntax-fouten in nieuwe bestanden
- [ ] Geen import-fouten (r2-client importeert `env.R2_ASSETS`, niet `env.ASSETS`)

---

## Fase 2 — Public asset serving + UI skeleton

> **Doel:** `/assets/*` publiek serveert. Module verschijnt in navbar.

### Stappen

**2.1 — Public asset serving in index.js**

Invoegpunt: vóór de bestaande CORS-handlers, MAAR na CORS preflight en favicon.

```
Bestaande volgorde:
  1. CORS preflight  ← bestaand
  2. /favicon.ico    ← bestaand
  3. /test-db        ← bestaand
  ...

Nieuwe volgorde:
  1. CORS preflight  ← bestaand
  2. /favicon.ico    ← bestaand
  3. GET /assets/*   ← NIEUW (publiek, geen auth)
  4. /test-db        ← bestaand
  ...
```

Aanpassing in `src/index.js` (exact blok):
- Controleer `pathname.startsWith('/assets/')` en `method === 'GET'`

  > **Precisieplicht — trailing slash is verplicht:**  
  > Gebruik `pathname.startsWith('/assets/')` — **niet** `pathname.startsWith('/assets')`.  
  > `/assets` (zonder slash) is de module-UI — die moet de module-router bereiken met authenticatie.  
  > `/assets/*` (met slash) zijn publieke bestanden — die worden hier onderschept zonder auth.  
  > Een verkeerde check blokkeert de module-UI en stuurt een R2-response terug in plaats van de interface.

- Extraheer key: `pathname.slice('/assets/'.length)`
- Valideer key via `validateKey(key)` uit path-utils
- Haal op via `env.R2_ASSETS.get(key)`
- Return `404` als null, anders Response met correct Content-Type
- Cache-Control: `public, max-age=31536000, immutable` voor keys die beginnen met `public/`
- Log elke request met `[asset-manager]` prefix

**2.2 — ui.js aanmaken**

Volledig HTML-skelet conform analyse (Sectie 3.1 van Architecture document):
- Theme early-init IIFE
- DaisyUI + Tailwind + Lucide
- `${navbar(user)}`
- `window.__ASSET_STATE__` block
- Lege containers voor: breadcrumb, bestandslijst, upload-zone, modals
- `<script src="/asset-manager-client.js"></script>`
- **Geen dynamisch gegenereerde HTML in ui.js** — skeleton only

**2.3 — Module toevoegen aan registry**

In `src/modules/registry.js`:
- Import toevoegen: `import assetManagerModule from './asset-manager/module.js';`
- Toevoegen aan `MODULES` array

**2.4 — Route handler voor GET /**

In `routes.js`, de `'GET /'` handler implementeren:
```js
'GET /': async (context) => {
  return new Response(assetManagerUI(context.user), {
    headers: { 'Content-Type': 'text/html' }
  });
}
```

**Go/No-Go criteria Fase 2:**
- [ ] `GET /assets/some-key` serveert een bestand uit R2 (of 404)
- [ ] `GET /assets` laadt de module-pagina met navbar
- [ ] Module verschijnt in navbar voor gebruikers met toegang
- [ ] Geen regressie in bestaande modules
- [ ] `wrangler deploy` nog steeds nul binding-warnings

---

## Fase 3 — API implementatie + Client JS

> **Doel:** Werkende upload/lijst/delete flow in de browser.

### Stappen

**4.1 — GET /api/assets/list implementeren**

In `routes.js`:
- Lees `prefix`, `cursor`, `limit` uit query params
- Valideer prefix via `isWithinPrefix` (user mag alleen eigen prefix of admin alles)
- Roep `r2-client.listObjects` aan
- Return `jsonOk({ objects, truncated, cursor })`

**4.2 — POST /api/assets/upload implementeren**

In `routes.js`:
- Parse multipart/form-data via `request.formData()`

  > **Memory-limiet:** `formData()` laadt de volledige request body in Worker-geheugen. Controleer de `Content-Length` header vóór `formData()` aanroepen. Als `Content-Length > MAX_UPLOAD_BYTES`: return onmiddellijk HTTP 413 zonder de body te lezen. Streaming uploads zijn buiten scope voor MVP (zie Analysis sectie 7.7).

- Extraheer `file`, `prefix`, `filename`
- Valideer MIME-type via `mime-types.isAllowedMimeType`
- Valideer bestandsgrootte (max `MAX_UPLOAD_BYTES`, default 10 MB)
- Bouw key: `${prefix}${sanitizedFilename}`
- Valideer key via `validateKey`
- Role check: `hasUploadAccess(context, prefix)`
- Roep `r2-client.putObject` aan
- Bouw publieke URL **dynamisch** — nooit hardcoden:
  ```js
  const origin = new URL(request.url).origin;
  const url = `${origin}/assets/${key}`;
  ```
  Dit garandeert correcte werking op `workers.dev`, custom domein en preview environments.
- Return `jsonOk({ key, url, size, contentType })`

**4.3 — DELETE /api/assets/delete implementeren**

In `routes.js`:
- Parse JSON body: `{ key }`
- Valideer key
- Controleer eigenaarschap of admin rol
- Roep `r2-client.deleteObject` aan
- Return `jsonOk({ key })`

**4.4 — POST /api/assets/rename implementeren**

In `routes.js`:
- Admin only
- Parse `{ key, newKey }`
- Valideer beide keys
- Kopie via `r2-client.copyObject(env, key, newKey)`
- Verwijder origineel via `r2-client.deleteObject(env, key)`
- Return `jsonOk({ oldKey, newKey })`

**4.5 — public/asset-manager-client.js aanmaken**

Verantwoordelijkheden (zie Architecture sectie 9):
- `init()` — lees `__ASSET_STATE__`, laad initiële lijst
- `loadList(prefix, cursor)` — fetch lijst, render in tabel
- `renderFileRow(object)` — één `<tr>` via DOM-API (geen template literals)
- `renderBreadcrumb(prefix)` — navigatie boven de lijst
- `uploadFile(file, prefix)` — fetch upload, voortgangsbalk
- `deleteFile(key)` — confirm modal + fetch delete
- `copyUrl(key)` — clipboard API
- `switchFolder(prefix)` — update actieve prefix, reload lijst

**Checkpoint Fase 4:**
- [ ] Bestanden laden en weergeven in tabel
- [ ] Upload werkt (bestand in R2 na submit)
- [ ] Verwijderen werkt (confirm modal + definitief weg)
- [ ] URL kopiëren werkt
- [ ] Folder-navigatie werkt (prefix-navigatie)
- [ ] Role-gating werkt (geen upload-knop voor gewone users)

---

## Fase 4 — Polish & koppelingen

> **Doel:** Productieklaar. Optionele domeinconfiguratie. Koppelingen met andere modules.

### Stappen

**4.1 — assets.openvme.be configureren (OPTIONEEL — geen MVP-blocker)**

Dit is een optionele verbetering voor wanneer branded URLs gewenst zijn. `workers.dev` is voldoende voor interne tooling.

Als gekozen wordt voor custom domein, voeg toe aan `wrangler.jsonc` op `master`:
```jsonc
"routes": [
  { "pattern": "assets.openvme.be/*", "zone_name": "openvme.be" }
]
```
Vereisten:
- Domein `openvme.be` bij Cloudflare geregistreerd of geproxied
- DNS: CNAME `assets.openvme.be` → Worker route

**4.2 — Cache-Control strategie verfijnen**

| Prefix | Cache-Control |
|--------|--------------|
| `public/` | `public, max-age=31536000, immutable` |
| `uploads/` | `public, max-age=3600` |
| `users/` | `private, no-store` |
| `system/` | `private, no-store` |

**4.3 — Koppeling mail-signature-designer**

Optionele uitbreiding: "Kies bestand uit Asset Manager" knop in de banner-upload sectie van Signature Designer. Dit is een aparte feature-slice, buiten MVP.

**4.4 — Foutafhandeling en logging finaliseren**

- Consistente error responses voor alle API-eindpunten (conform error-structuur in Analysis sectie 7.4)
- Server-side logs met prefix `[asset-manager]` op alle routes
- Client-side toast-feedback bij elke actie (succes + fout)
- Upload-grootte-overschrijding foutmelding met vriendelijke tekst

**Go/No-Go criteria Fase 4 (= MVP-release):**
- [ ] Public assets bereikbaar via productie-URL
- [ ] Upload/lijst/delete volledig functioneel
- [ ] Role-gating actief (user / asset_manager / admin)
- [ ] Alle bestaande modules ongewijzigd
- [ ] Geen dashboard-bindings meer
- [ ] `wrangler deploy` nul warnings

---

## Implementatievolgorde samenvatting

```
Pre  [master branch]
     wrangler.jsonc: R2_ASSETS binding toevoegen
     deploy + verificatie (nul warnings)
  ↓
Fase 0  [assets-manager] ✅
        Documenten aanmaken
  ↓ (Pre-fase vereist voor Fase 1)
Fase 1  [assets-manager]
        lib/path-utils.js
        lib/mime-types.js
        lib/r2-client.js
        routes.js (skeleton + MAX_UPLOAD_BYTES)
        module.js
  ↓
Fase 2  [assets-manager]
        index.js: publieke /assets/* serving
        ui.js skeleton
        registry.js: module registreren
  ↓
Fase 3  [assets-manager]
        routes.js: list, upload, delete, rename implementeren
        asset-manager-client.js
  ↓
Fase 4  [assets-manager]
        Polish, foutafhandeling
        Optioneel: custom domein op master
        Optionele module-koppelingen
```

---

## Buitengrenzen (herhaling)

Zaken die **niet** in de asset_manager horen:

- ❌ Bestandsconversie (PDF → afbeelding, resize, etc.) — aparte microservice indien nodig
- ❌ Eigen authenticatiesysteem — hergebruik bestaande sessie-validatie
- ❌ Directe S3-API exposure — altijd via Worker API
- ❌ R2 binding via Dashboard aanmaken — altijd via `wrangler.jsonc`
- ❌ Binding naam `ASSETS` voor R2 gebruiken — dat is al in gebruik, gebruik `R2_ASSETS`
- ❌ Meerdere Workers per module — één Worker, meerdere routes
- ❌ Custom domein verplicht stellen als MVP-vereiste — `workers.dev` is voldoende
- ❌ Routes inline in `module.js` — project-generator patroon NIET volgen
- ❌ Template literals in `asset-manager-client.js` voor HTML-generatie

---

## Changelog

### Iteratie 3 — 2026-02-24

- **Fase 2, stap 2.1:** Precisie-noot toegevoegd — `pathname.startsWith('/assets/')` met trailing slash is verplicht; toelichting waarom de verkeerde check de module-UI blokkeert
- **Fase 3, stap 4.2:** Hardcoded URL `https://openvme.be/assets/${key}` vervangen door dynamische `new URL(request.url).origin` aanpak met codevoorbeeld; `formData()` memory-beperking gedocumenteerd met implementatienoot voor Content-Length pre-check
- **Consistentiecheck:** Alle binding-referenties bevestigd als `R2_ASSETS`; hardcoded domein opgespoord en verwijderd; geen contradicties met Analysis en Architecture gevonden

### Iteratie 2 — 2026-02-24

- **Overzichtstabel:** Pre-fase (Global Infra Correction) toegevoegd op aparte rij met eigen branch-aanduiding
- **Pre-fase:** Volledig nieuwe sectie: infra-correctie op `master` vóór module-implementatie, Go/No-Go criteria, migratie-nulmeting
- **Fase 1:** Hernoemd van "Infra-correctie" naar "Core backend" (infra is nu Pre-fase)
- **Fase 1.3:** Log-prefix expliciete vereiste toegevoegd aan r2-client.js
- **Fase 1.4:** `MAX_UPLOAD_BYTES` named constant als expliciete deliverable
- **Fase 2 (was 3):** Skeleton-only vereiste explicieter gedocumenteerd
- **Fase 3 (was 4):** Prefix-isolatie check toegevoegd aan upload-stap; log-statements als deliverable; no-template-literals as Go/No-Go criterium
- **Fase 4 (was 5):** Custom domein gemarkeerd als OPTIONEEL met uitleg; Supabase-laag verplaatst naar Future extensibility (in Analysis)
- **Implementatievolgorde:** Pre-fase opgenomen met branch-aanduiding
- **Buitengrenzen:** `R2_ASSETS` naamregel, custom domein optioneel, DOM-API vereiste toegevoegd

*Dit document is het eindpunt van Fase 0. Implementatie begint met de Pre-fase op `master` branch.*
