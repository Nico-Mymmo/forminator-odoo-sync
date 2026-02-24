# Asset Manager — Architectuur

> **Status:** Fase 0 — Architectuurontwerp  
> **Branch:** `assets-manager`  
> **Datum:** 2026-02-24  
> **Vorige stap:** [ASSET_MANAGER_ANALYSIS.md](./ASSET_MANAGER_ANALYSIS.md)

---

## 1. Module-positie in de applicatie

```
Cloudflare Worker (src/index.js)
│
├── Module Router (src/modules/registry.js)
│   ├── home         → /
│   ├── forminator   → /forminator
│   ├── projects     → /projects
│   ├── sales        → /insights
│   ├── events       → /events
│   ├── signatures   → /mail-signatures
│   ├── admin        → /admin
│   ├── profile      → /profile
│   └── asset-manager → /assets  ← NIEUW
│
└── Public asset serving
    └── GET /assets/* → R2 → Response (VOOR module-routing, geen auth)
```

De `asset_manager` module leeft op route `/assets`. De publieke bestandsserving `/assets/*` wordt in `index.js` **vóór** de module-router afgehandeld (zie sectie 5).

---

## 2. Folderstructuur voorstel

```
src/modules/asset-manager/
│
├── module.js              ← Module registratie (code, name, route, icon, routes)
├── routes.js              ← Alle API- en UI-handlers
├── ui.js                  ← Server-rendered HTML skeleton
│
├── lib/
│   ├── r2-client.js       ← R2 abstractielaag (put, get, list, delete, head)
│   ├── asset-store.js     ← Optioneel: Supabase metadata-laag
│   ├── mime-types.js      ← MIME-type whitelist + content-type detectie
│   └── path-utils.js      ← Key-normalisatie, prefix-helpers, veiligheidsvalidatie
│
├── components/            ← Server-side HTML component-functies
│   ├── file-row.js        ← <tr> voor een bestand in de lijst
│   ├── folder-breadcrumb.js ← Breadcrumb-navigatie voor prefix-pad
│   └── upload-zone.js     ← Upload-formulier HTML
│
└── docs/
    ├── ASSET_MANAGER_ANALYSIS.md          ← (dit document's voorganger)
    ├── ASSET_MANAGER_ARCHITECTURE.md      ← dit document
    └── ASSET_MANAGER_IMPLEMENTATION_PLAN.md
```

Client-side JS (dynamisch gedrag in de browser):

```
public/
└── asset-manager-client.js   ← Alle browser JS (upload, lijst refresh, kopieer-URL, etc.)
```

---

## 3. module.js structuur

```js
/**
 * Asset Manager Module
 *
 * Centrale bestandsbeheerlaag bovenop Cloudflare R2.
 * Route: /assets
 */
import { routes } from './routes.js';

export default {
  code:        'asset_manager',
  name:        'Asset Manager',
  description: 'Centrale bestandsbeheerlaag voor uploads en publieke assets',
  route:       '/assets',
  icon:        'folder-open',
  isActive:    true,

  /**
   * Sub-roles:
   *   'user'           – Alleen eigen uploads bekijken (users/{id}/)
   *   'asset_manager'  – Upload/verwijder in alle uploads/ prefixen
   *   'admin'          – Volledige toegang inclusief public/ en system/
   */
  subRoles: ['user', 'asset_manager', 'admin'],

  routes
};
```

---

## 4. routes.js API-contract

### 4.1 UI route

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | `/` | `assetManagerUI(user)` | Authenticated |

### 4.2 Asset management API

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | `/api/assets/list` | Lijst bestanden op prefix | Authenticated |
| POST | `/api/assets/upload` | Upload bestand | Authenticated + role |
| DELETE | `/api/assets/delete` | Verwijder bestand | Authenticated + role |
| POST | `/api/assets/rename` | Hernoem bestand (copy + delete) | admin |
| POST | `/api/assets/move` | Verplaats bestand (copy + delete) | admin |

### 4.3 Route handler signatures

**GET /api/assets/list**
```
Query params:
  prefix    string   (optioneel) map-prefix, bv. 'uploads/banners/'
  cursor    string   (optioneel) paginering cursor van vorig antwoord
  limit     number   (optioneel, default 50, max 1000)

Response:
  {
    success: true,
    data: {
      objects: [
        {
          key: string,
          size: number,        // bytes
          uploaded: string,    // ISO datum
          contentType: string, // uit httpMetadata
          etag: string,
          customMetadata: { uploadedBy, originalName, module }
        }
      ],
      truncated: boolean,       // true als er meer zijn
      cursor: string | null     // voor volgende pagina
    }
  }
```

**POST /api/assets/upload**
```
Body:         multipart/form-data
  file        File     (verplicht) het bestand
  prefix      string   (optioneel, default 'uploads/') doelmap
  filename    string   (optioneel) overschrijf bestandsnaam

Response:
  {
    success: true,
    data: {
      key: string,          // definitief R2 object-pad
      url: string,          // publieke URL (als public/ prefix)
      size: number,
      contentType: string
    }
  }
```

**DELETE /api/assets/delete**
```
Body (JSON):
  key         string   (verplicht) R2 object-key

Response:
  { success: true, data: { key } }
```

**POST /api/assets/rename**
```
Body (JSON):
  key         string   (verplicht) huidig R2 object-pad
  newKey      string   (verplicht) nieuw R2 object-pad

Response:
  { success: true, data: { oldKey, newKey } }
```

**POST /api/assets/move**
```
Body (JSON):
  key         string   (verplicht) huidig R2 object-pad
  targetPrefix string  (verplicht) doelmap-prefix

Response:
  { success: true, data: { oldKey, newKey } }
```

### 4.4 Public asset serving (in index.js, NIET in module)

```
GET /assets/{key}
  → geen auth
  → env.R2_ASSETS.get(key)
  → Response met correct Content-Type + Cache-Control
  → 404 als object niet bestaat
```

---

## 5. index.js uitbreiding (conceptueel)

In `src/index.js` moet de publieke asset-route worden toegevoegd **vóór** de session-validatie:

```
// Publieke asset serving (geen auth, vóór module-router)
if (pathname.startsWith('/assets/') && request.method === 'GET') {
  const key = pathname.slice('/assets/'.length);
  // valideer key (geen path traversal)
  // haal op uit R2
  // return Response met headers
}
```

Kritische headers voor publieke assets:

```
Content-Type:   <uit httpMetadata of afgeleid van extensie>
Cache-Control:  public, max-age=31536000, immutable   (voor public/)
                no-store                               (voor signed/private)
ETag:           <etag van R2 object>
```

---

## 6. lib/r2-client.js contract

De R2 client abstraheert `env.R2_ASSETS` calls zodat routes.js niet direct de R2 API aanroept:

```js
// Conceptueel interface (geen code in Fase 0)

listObjects(env, { prefix, cursor, limit })
  → Promise<{ objects, truncated, cursor }>

putObject(env, key, body, { contentType, metadata })
  → Promise<{ key, etag, size }>

getObject(env, key)
  → Promise<R2ObjectBody | null>

deleteObject(env, key)
  → Promise<void>

headObject(env, key)
  → Promise<R2Object | null>

copyObject(env, sourceKey, destKey)
  → Promise<{ key }>
```

---

## 7. lib/path-utils.js veiligheidseisen

Elke key die van de client komt moet gevalideerd worden:

1. **Geen path traversal:** key mag geen `..` bevatten
2. **Geen absolute paden:** key mag niet beginnen met `/`
3. **Geen null bytes:** mag geen `\0` bevatten
4. **Max lengte:** key ≤ 1024 tekens (R2 limiet)
5. **Geldige tekens:** alleen URL-safe tekens en `/`
6. **Prefix-isolatie:** user zonder admin-rol mag alleen schrijven/lezen binnen toegestaan prefix

```js
// Conceptueel
function validateKey(key)  → boolean
function sanitizeFilename(name)  → string
function buildUserPrefix(userId) → string   // 'users/{userId}/'
function isPublicKey(key)  → boolean        // begint met 'public/'
function isWithinPrefix(key, allowedPrefix) → boolean
```

---

## 8. ui.js structuur

```js
import { navbar } from '../../lib/components/navbar.js';

export function assetManagerUI(user) {
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'asset_manager';
  const isAdmin = user?.role === 'admin';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Asset Manager</title>
  <!-- Theme early-init IIFE -->
  <!-- DaisyUI CDN -->
  <!-- Tailwind CDN warning suppressor -->
  <!-- Tailwind CDN -->
  <!-- Lucide icons -->
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <script>
    window.__ASSET_STATE__ = ${JSON.stringify({
      userRole: user?.role || 'user',
      userId: user?.id || '',
    })};
  </script>

  <div style="padding-top: 48px;">
    <!-- Panel: Folder-navigatie (breadcrumb + folder-lijst) -->
    <!-- Panel: Bestandslijst (tabel met naam, grootte, datum, actions) -->
    <!-- Upload-zone (role-gated) -->
    <!-- Modals: confirm-delete, rename -->
  </div>

  <script src="/asset-manager-client.js"></script>
</body>
</html>`;
}
```

**Verplichte UI-regels (conform mail-signature-designer patroon):**
- Eén `return \`...\`` per exportfunctie
- Nul backticks in `<script>` blokken
- Geen inline business JS in `ui.js`
- Server→client data alleen via `window.__ASSET_STATE__`

---

## 9. public/asset-manager-client.js verantwoordelijkheden

Dit bestand draait in de browser. Het is verantwoordelijk voor:

- Initialisatie: inlezen van `window.__ASSET_STATE__`
- Laden van de bestandslijst via `GET /assets/api/assets/list`
- Folder-navigatie: bijhouden actieve prefix, breadcrumb renderen
- Upload-afhandeling: `FormData` bouwen, fetch naar `POST /assets/api/assets/upload`
- Voortgangsindicatie tijdens upload
- Kopieer-URL knop (clipboard API)
- Verwijder-bevestiging (DaisyUI modal openen)
- Verwijder request naar `DELETE /assets/api/assets/delete`
- Rename flow (modal + PATCH request)
- User feedback: alert tonen na elke actie

**Geen backticks** voor HTML-generatie in client JS — `createElement` + `textContent` of DaisyUI component-initialisatie via klassen.

---

## 10. wrangler.jsonc voorstel (volledig)

Dit is de doelconfiguratie na correcte R2-integratie:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "forminator-sync",
  "main": "src/index.js",
  "compatibility_date": "2025-07-30",
  "compatibility_flags": ["nodejs_compat"],
  "preview_urls": false,
  "observability": {
    "enabled": true
  },
  "kv_namespaces": [
    {
      "binding": "MAPPINGS_KV",
      "id": "04e4118b842b48a58f5777e008931026"
    }
  ],
  "r2_buckets": [
    {
      "binding": "R2_ASSETS",
      "bucket_name": "openvme-assets",
      "preview_bucket_name": "openvme-assets-dev"
    }
  ],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  },
  // Optioneel: routes voor custom domeinen
  // "routes": [
  //   { "pattern": "assets.openvme.be/*", "zone_name": "openvme.be" }
  // ]
}
```

**Acties na implementatie:**
1. Verifieer dat de R2 bucket `openvme-assets` bestaat in Cloudflare Dashboard
2. Voeg de binding toe in `wrangler.jsonc`
3. Verwijder de dashboard-binding (of laat wrangler deze overschrijven bij deploy)
4. Commit + deploy
5. Verifieer dat de waarschuwing verdwenen is

---

## 11. Data flow diagrammen

### Upload flow

```
Browser
  → POST /assets/api/assets/upload (multipart)
  → index.js → module router
  → routes.js: 'POST /api/assets/upload'
  → path-utils.js: validateKey, sanitizeFilename
  → role check: hasUploadAccess(context)
  → r2-client.js: putObject(env, key, body, metadata)
  → env.R2_ASSETS.put(key, stream, options)
  → jsonOk({ key, url, size, contentType })
  → Browser: toon bevestiging, refresh lijst
```

### Public asset serving flow

```
Browser (of e-mailclient, WordPress)
  → GET /assets/uploads/banners/header.jpg
  → index.js: pathname.startsWith('/assets/')
  → GEEN auth check
  → key = 'uploads/banners/header.jpg'
  → path-utils.js: validateKey(key)
  → env.R2_ASSETS.get(key)
  → Response(body, { headers: { Content-Type, Cache-Control } })
```

### Lijst flow

```
Browser
  → GET /assets/api/assets/list?prefix=uploads/banners/&limit=50
  → index.js → module router
  → routes.js: 'GET /api/assets/list'
  → role check + prefix-isolatie
  → r2-client.js: listObjects(env, { prefix, limit, cursor })
  → env.R2_ASSETS.list({ prefix, limit, cursor })
  → jsonOk({ objects, truncated, cursor })
  → Browser: render tabel
```

---

## 12. Koppelingspunten met andere modules

| Module | Koppeling | Beschrijving |
|--------|-----------|-------------|
| mail-signature-designer | Banners opslaan | Upload banner → `uploads/banners/` → URL gebruiken in signature |
| event-operations | Event-afbeeldingen | Upload event-headers → publisuek URL voor WordPress |
| project-generator | Templates | Upload projecttemplate-bestanden |

De asset_manager is een **dienende module** — andere modules kunnen ze als opslaglaag gebruiken. De koppeling is losjes: andere modules genereren gewoon een URL en slaan die op.

---

*Volgende stap: ASSET_MANAGER_IMPLEMENTATION_PLAN.md — fasering, volgorde, checkpoints*
