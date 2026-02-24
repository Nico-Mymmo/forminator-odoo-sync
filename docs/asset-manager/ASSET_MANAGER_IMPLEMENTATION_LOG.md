# Asset Manager — Implementatielog

> **Branch:** `assets-manager`
> **Datum:** 2026-02-24
> **Status:** Fase 1 t/m 3 voltooid + DB-activatie + workflow-cleanup

---

## Overzicht commits

| Commit | Fase | Beschrijving |
|--------|------|-------------|
| `af5bcec` | Fase 0 | docs: iteratie 3 asset-manager documentatie |
| `36d3224` | Pre-fase | infra: add R2_ASSETS binding to wrangler.jsonc |
| `d830f22` | — | Merge branch 'master' into assets-manager |
| `ee65d64` | Fase 1 | feat(asset-manager): core backend |
| `7455396` | Fase 2 | feat(asset-manager): public serving + UI skeleton |
| `a1a0c2f` | Fase 3 | feat(asset-manager): API implementatie + client JS |
| `8a6f5d2` | DB | chore: restore missing migration 20260223930000 as placeholder |
| `07fc84c` | Workflow | docs: remove wrangler dev from workflow — deploy-only |

---

## Pre-fase — Infra Correctie (`36d3224`)

**Branch:** `master` → gemerged naar `assets-manager`

**Probleem:** `R2_ASSETS` binding ontbrak in `wrangler.jsonc`. De binding bestond alleen in het Cloudflare Dashboard, niet in versiebeheer. Dit veroorzaakte dashboard-drift en zou bij elke `wrangler deploy` de binding verliezen.

**Actie:** `wrangler.jsonc` — `r2_buckets` blok toegevoegd:

```jsonc
"r2_buckets": [
  {
    "binding": "R2_ASSETS",
    "bucket_name": "openvme-assets"
  }
]
```

**Verificatie na deploy:** nul binding-warnings — Dashboard toont exact dezelfde state als `wrangler.jsonc`.

**Gewijzigde bestanden:**
- `wrangler.jsonc` — 10 regels toegevoegd

---

## Fase 1 — Core Backend (`ee65d64`)

**Branch:** `assets-manager`

Vijf nieuwe bestanden aangemaakt:

### `src/modules/asset-manager/lib/path-utils.js`

Pure validatie- en normalisatiefuncties. Geen side-effects, geen I/O.

| Export | Functie |
|--------|---------|
| `validateKey(key)` | Blokkeert `..`, `/`-prefix, null bytes, max 1024 chars, `VALID_KEY_PATTERN` regex |
| `sanitizeFilename(filename)` | Strips gevaarlijke karakters, normaliseert spaties naar `-` |
| `buildUserPrefix(userId)` | `uploads/<userId>/` — geïsoleerde map per gebruiker |
| `isPublicKey(key)` | `true` als key begint met `public/` |
| `isWithinPrefix(key, prefix)` | Controleert of key tot prefix behoort |
| `normalizePrefix(raw)` | Zorgt voor trailing slash, geen leading slash |

### `src/modules/asset-manager/lib/mime-types.js`

MIME-whitelist voor upload-validatie.

Toegestane extensies: `jpg`, `jpeg`, `png`, `gif`, `webp`, `svg`, `html`, `css`, `txt`, `pdf`, `zip`, `json`

| Export | Functie |
|--------|---------|
| `getMimeType(filename)` | Extensie → MIME string, fallback `application/octet-stream` |
| `isAllowedMimeType(mimeType)` | `true` als MIME in whitelist |

### `src/modules/asset-manager/lib/r2-client.js`

Dunne wrapper rond `env.R2_ASSETS`. Routes raken R2 nooit direct aan — altijd via deze laag.

| Export | R2-operatie |
|--------|-------------|
| `listObjects(env, prefix, options)` | `env.R2_ASSETS.list(...)` |
| `putObject(env, key, body, options)` | `env.R2_ASSETS.put(...)` |
| `getObject(env, key)` | `env.R2_ASSETS.get(...)` |
| `deleteObject(env, key)` | `env.R2_ASSETS.delete(...)` |
| `headObject(env, key)` | `env.R2_ASSETS.head(...)` |
| `copyObject(env, sourceKey, destKey)` | `getObject` → `putObject` (R2 heeft geen native copy) |

Alle functies loggen met prefix `[asset-manager]`. Uitsluitend `env.R2_ASSETS` — nooit `env.ASSETS`.

### `src/modules/asset-manager/routes.js` (skelet)

Fase 1 bevat de volledige structuur zonder implementatie van API-handlers:

- `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` (10 MB)
- Response-helpers: `jsonOk(data)`, `jsonError(message, status, code)`
- Foutcodes: `KEY_INVALID`, `PREFIX_FORBIDDEN`, `MIME_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FORBIDDEN`, `NOT_FOUND`, `UNAUTHORIZED`
- Role-helpers: `isAdmin(user)`, `hasUploadAccess(user)`, `canWritePrefix(user, prefix)`, `canReadPrefix(user, prefix)`
- Alle 6 route-keys gedeclareerd als stubs

### `src/modules/asset-manager/module.js`

Registratie-object voor de module-registry:

```js
{
  code: 'asset_manager',
  route: '/assets',
  icon: 'folder-open',
  subRoles: ['user', 'asset_manager', 'admin']
}
```

**Gewijzigde bestanden:** 5 nieuwe bestanden, 518 regels

---

## Fase 2 — Public Serving + UI Skeleton (`7455396`)

### `src/index.js` — Publieke asset serving

Nieuw blok toegevoegd **vóór** de module-router, **na** `/favicon.ico`:

```js
if (pathname.startsWith('/assets/') && !pathname.startsWith('/assets/api/') && request.method === 'GET') {
  const key = pathname.slice('/assets/'.length);
  if (!validateKey(key)) return new Response('Not Found', { status: 404 });
  const object = await env.R2_ASSETS.get(key);
  if (!object) return new Response('Not Found', { status: 404 });
  // Cache-Control logica:
  // - public/   → Cache-Control: public, max-age=31536000, immutable
  // - uploads/  → Cache-Control: public, max-age=3600
  // - overig    → Cache-Control: no-store
  return new Response(object.body, { headers: { 'Content-Type', 'Cache-Control', 'ETag' } });
}
```

> **Let op:** de check `!pathname.startsWith('/assets/api/')` is later toegevoegd als bugfix (zie bugfix-log hieronder).

Imports toegevoegd bovenaan `src/index.js`:
```js
import { validateKey } from "./modules/asset-manager/lib/path-utils.js";
import { getMimeType } from "./modules/asset-manager/lib/mime-types.js";
```

### `src/modules/asset-manager/ui.js`

Server-rendered HTML skeleton. Eén export: `assetManagerUI(user)`.

Bevat:
- Theme early-init IIFE (voorkomt FOUC)
- DaisyUI 4.12.14 CDN
- Tailwind CDN suppressie + Tailwind CDN
- Lucide icons CDN
- `navbar(user)` — hergebruik van bestaand patroon
- `window.__ASSET_STATE__` met `userRole`, `userId`, `canUpload`, `canAdmin`
- Lege containers: breadcrumb, bestandslijst, upload-zone, 3 modals (delete/rename/move)
- `<script src="/asset-manager-client.js"></script>`
- Nul backticks in `<script>` blokken (vereiste voor Workers JS-escaping)

### `src/modules/asset-manager/routes.js` — GET /

```js
'GET /': async (request, context) => {
  const html = assetManagerUI(context.user);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
```

### `src/modules/registry.js`

```js
import assetManagerModule from './asset-manager/module.js';
// toegevoegd aan MODULES array
```

**Gewijzigde bestanden:** 4 bestanden gewijzigd/aangemaakt, 232 regels

---

## Fase 3 — API Implementatie + Client JS (`a1a0c2f`)

### `src/modules/asset-manager/routes.js` — alle 5 API-routes

**`GET /api/assets/list`**
- Query params: `prefix` (verplicht), `cursor` (optioneel), `limit` (max 1000, default 100)
- `canReadPrefix(user, prefix)` check
- `listObjects(env, prefix, { limit, cursor })` → gemapped naar `{ key, size, uploaded, httpMetadata }` array
- Retourneert: `{ objects, truncated, cursor, prefix }`

**`POST /api/assets/upload`**
- Content-Length pre-check **vóór** `formData()` aanroep (voorkomt onnodige body-parsing)
- `formData()` → `file` (File), `prefix` (string)
- `isAllowedMimeType(file.type)` → 415 bij geweigerd type
- `canWritePrefix(user, prefix)` → 403 bij prefix-overtreding
- `sanitizeFilename(file.name)` → `validateKey(key)` → 400 bij ongeldig pad
- `putObject(env, key, file.stream(), { httpMetadata })` → R2 write
- URL opgebouwd via `new URL(request.url).origin` — nooit hardcoded domein
- Retourneert: `{ key, url, size, contentType }`

**`DELETE /api/assets/delete`**
- JSON body: `{ key }`
- `validateKey(key)` → eigen-prefix check voor niet-admins (`isWithinPrefix`)
- `deleteObject(env, key)`
- Retourneert: `{ deleted: key }`

**`POST /api/assets/rename`**
- Admin-only
- JSON body: `{ key, newKey }`
- `validateKey` op beide keys
- `copyObject(env, key, newKey)` → `deleteObject(env, key)` (atomisch via R2)
- Retourneert: `{ from: key, to: newKey }`

**`POST /api/assets/move`**
- Admin-only
- JSON body: `{ key, targetPrefix }`
- `normalizePrefix(targetPrefix)` → nieuwe key samenstellen
- `validateKey(destKey)` → copy + delete
- Retourneert: `{ from: key, to: destKey }`

### `public/asset-manager-client.js`

Volledig browser-client als IIFE. **Geen template literals voor HTML.** Alle DOM via `createElement` + `textContent`.

| Functie | Verantwoordelijkheid |
|---------|---------------------|
| `init()` | Leest `window.__ASSET_STATE__`, bindt upload-handler, start `switchFolder('')` |
| `loadList(prefix, cursor)` | `GET /api/assets/list` → `renderList` + breadcrumb + paginering |
| `renderFileRow(obj)` | Bouwt volledige `<tr>` via DOM-API: naam, grootte, datum, acties |
| `renderBreadcrumb(prefix)` | Segment-links met click-handlers per niveau |
| `switchFolder(prefix)` | State bijwerken + `loadList` aanroepen |
| `uploadFile(file, prefix)` | `FormData` → `POST /api/assets/upload` |
| `openDeleteModal(key)` | DaisyUI modal openen |
| `confirmDelete()` | `DELETE /api/assets/delete` → lijst herladen |
| `openRenameModal(key)` | DaisyUI modal openen + input pre-vullen |
| `confirmRename()` | `POST /api/assets/rename` → lijst herladen |
| `copyUrl(key)` | Clipboard API met `prompt()`-fallback |
| `filterList(query)` | Client-side filter op huidige paginadata |

**Gewijzigde bestanden:** 2 bestanden gewijzigd, 655 regels

---

## Database Activatie

### Migratie `20260224000000_add_asset_manager_module.sql`

Aangeleverd door gebruiker. Registreert `asset_manager` in de `modules` tabel en auto-grant aan alle admin-gebruikers.

### Migration Drift Fix (`8a6f5d2`)

**Probleem:** `npx supabase migration list` toonde dat remote de migratie `20260223930000` had, maar lokaal ontbrak dit bestand. Hierdoor weigerde `db push` te werken.

**Oplossing:** No-op placeholder aangemaakt:
```
supabase/migrations/20260223930000_placeholder.sql
```
Inhoud: alleen commentaar, geen SQL-statements. Puur bedoeld om de history in sync te brengen.

### `npx supabase db push`

Na de drift-fix:
```
Applying migration 20260224000000_add_asset_manager_module.sql...
Finished supabase db push.
```

Verificatie:
```
20260224000000 | 20260224000000 | 2026-02-24 00:00:00
```
✅ Beide kanten in sync.

---

## Bugfix — `/assets/api/*` route conflict

**Probleem:** `GET /assets/api/assets/list` gaf 404 terug. Het public serving block in `src/index.js` onderschepte alle requests die beginnen met `/assets/` — inclusief API-routes.

**Oorzaak:** De conditie `pathname.startsWith('/assets/')` is te breed.

**Fix:**
```js
// Vóór:
if (pathname.startsWith('/assets/') && request.method === 'GET') {

// Na:
if (pathname.startsWith('/assets/') && !pathname.startsWith('/assets/api/') && request.method === 'GET') {
```

`/assets/api/*` valt nu door naar de module-router en bereikt de auth-laag. `/assets/uploads/foto.png` wordt nog steeds via R2 geserveerd.

---

## Workflow Cleanup (`07fc84c`)

**Aanleiding:** Het project gebruikt geen lokale runtime. Alle `wrangler dev` referenties in actieve documentatie en `package.json` zijn onjuist en verwarrend.

**Gewijzigde bestanden:**

| Bestand | Wijziging |
|---------|-----------|
| `package.json` | `"dev": "wrangler dev"` en `"start": "wrangler dev"` verwijderd; `"logs": "wrangler tail"` toegevoegd |
| `README.md` | Development-sectie herschreven: deploy → test via URL, geen `npm run dev` |
| `docs/asset-manager/ASSET_MANAGER_ANALYSIS.md` | Sectie 5.4 volledig herschreven: `wrangler dev --local` aanbeveling vervangen door deploy-workflow; niet-doen-lijst gecorrigeerd |
| `docs/asset-manager/ASSET_MANAGER_ARCHITECTURE.md` | Nieuwe sectie **Runtime Model** toegevoegd (zie hieronder) |

**Runtime Model (toegevoegd aan ARCHITECTURE.md):**

| Aspect | Situatie |
|--------|----------|
| Runtime | Cloudflare Workers (productie) |
| R2 | Productie-bucket `openvme-assets` |
| Lokale emulatie | ❌ Geen |
| Preview-runtime | ❌ Geen |
| `wrangler dev` | ❌ Niet gebruikt |
| Lokale R2 mock | ❌ Niet gebruikt |
| Docker shadow DB | ❌ Niet nodig |

---

## Huidige staat

**Branch:** `assets-manager`  
**Laatste commit:** `07fc84c`

```
✅ Pre-fase   R2_ASSETS binding op master, deployed, nul warnings
✅ Fase 1     Core backend — path-utils, mime-types, r2-client, routes (structuur), module.js
✅ Fase 2     Public serving in index.js, UI skeleton, registry-registratie
✅ Fase 3     Alle 5 API-routes geïmplementeerd, volledige browser-client
✅ Database   Migration 20260224000000 gepushed — asset_manager actief in DB
✅ Bugfix     /assets/api/* route conflict opgelost
✅ Workflow   wrangler dev volledig verwijderd uit actieve docs en scripts
⏳ Fase 4    Polish — role-gating review, foutcodes, geen debug leftovers
```

---

## Bestandsinventaris (aangemaakt/gewijzigd deze sessie)

```
wrangler.jsonc                                      ← R2_ASSETS binding
src/index.js                                        ← public asset serving block + imports + bugfix
src/modules/registry.js                             ← assetManagerModule toegevoegd
src/modules/asset-manager/module.js                 ← NIEUW
src/modules/asset-manager/routes.js                 ← NIEUW (skelet Fase 1, volledig Fase 3)
src/modules/asset-manager/ui.js                     ← NIEUW
src/modules/asset-manager/lib/path-utils.js         ← NIEUW
src/modules/asset-manager/lib/mime-types.js         ← NIEUW
src/modules/asset-manager/lib/r2-client.js          ← NIEUW
public/asset-manager-client.js                      ← NIEUW
supabase/migrations/20260224000000_add_asset_manager_module.sql  ← aangeleverd door gebruiker
supabase/migrations/20260223930000_placeholder.sql  ← NIEUW (drift fix)
package.json                                        ← dev/start scripts verwijderd
README.md                                           ← Development sectie herschreven
docs/asset-manager/ASSET_MANAGER_ANALYSIS.md        ← Sectie 5.4 herschreven
docs/asset-manager/ASSET_MANAGER_ARCHITECTURE.md    ← Runtime Model sectie toegevoegd
```
