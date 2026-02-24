# Asset Manager — Analyse

> **Status:** Fase 0 — Analyse & Architectuur  
> **Branch:** `assets-manager`  
> **Datum:** 2026-02-24  
> **Auteur:** GitHub Copilot (ontwerp), Nico Plinke (opdrachtgever)

---

## 1. Context

De Operations Manager is een Cloudflare Worker die als centrale backend dient voor interne tooling van OpenVME. De Worker host zowel API-eindpunten als server-rendered HTML-modules onder één codebase (`src/index.js`), gedeployed via Wrangler.

Tot nu toe ontbreekt een **centrale bestandsbeheerlaag**. Bestanden (afbeeldingen, templates, banners, documenten) worden ad-hoc ergens opgeslagen of helemaal niet centraal beheerd. De `asset_manager` module vult deze gap door een herbruikbare opslaglaag te bieden bovenop Cloudflare R2.

---

## 2. Analyse bestaande modules

### 2.1 Module registratie

Alle modules worden manueel geregistreerd in `src/modules/registry.js`:

```
import homeModule from './home/module.js';
import mailSignatureDesignerModule from './mail-signature-designer/module.js';
// ... etc.
export const MODULES = [ homeModule, ..., mailSignatureDesignerModule ];
```

**Patroon:** Elke module exporteert één default object met:

| Veld | Type | Verplicht | Voorbeeld |
|------|------|-----------|-----------|
| `code` | string | ja | `'mail_signature_designer'` |
| `name` | string | ja | `'Signature Designer'` |
| `description` | string | ja | `'...'` |
| `route` | string | ja | `'/mail-signatures'` |
| `icon` | string | ja | `'mail'` (Lucide naam) |
| `isActive` | boolean | ja | `true` |
| `routes` | object | ja | `{ 'GET /': handler, ... }` |
| `subRoles` | array | nee | `['user', 'marketing_signature']` |

### 2.2 Routing systeem

`resolveModuleRoute(module, method, pathname)` in `registry.js`:

1. Berekent `subPath` = `pathname` minus `module.route` prefix
2. Zoekt eerst exact match op `'METHOD /subpath'`
3. Daarna paramgerichte matching via regex (`:id` → `([^/]+)`)
4. Tenslotte wildcard `'METHOD *'`

`index.js` dispatcht als volgt:

```
const module = getModuleByRoute(pathname);
// → sessie extraheren → user valideren → module-access checken
const result = resolveModuleRoute(module, method, pathname);
return await result.handler(context);
```

Context die elke handler krijgt: `{ request, env, ctx, user, params }`

### 2.3 Module-structuur vergelijking

| Module | Routes-locatie | UI-locatie | Heeft lib/ | Heeft services/ | Client JS in public/ |
|--------|---------------|------------|-----------|----------------|----------------------|
| event-operations | `routes.js` | `ui.js` | ja | ja | ja (`event-operations-client.js`) |
| mail-signature-designer | `routes.js` | `ui.js` | ja | nee | ja (`mail-signature-designer-client.js`) |
| project-generator | `module.js` (direct) | `ui.js` | nee | nee | ja (`project-generator-client.js`) |
| sales-insight-explorer | `routes.js` | `ui.js` | ja | nee | ja (`sales-insights-app.js`) |

**Conclusie:** Het geprefereerde patroon is `module.js` + `routes.js` + `ui.js` + `lib/`. Client-side JS leeft in `/public/`.

### 2.4 Observaties per module

**event-operations**
- Meest complexe module: eigen editorial layer, Odoo client, WP client, state-engine, tag-mapping
- Routes: aparte `routes/` subfolder voor event-registrations
- Splitst concerns duidelijk: `odoo-client.js`, `wp-client.js`, `state-engine.js`
- UI: embedded CSS voor FullCalendar integratie; Quill WYSIWYG

**mail-signature-designer**
- Strikts in UI-regels: één template literal, geen backticks in `<script>`, geen inline business JS
- Strikte role-based access (user / marketing_signature / admin)
- Heeft `subRoles` declaratie in module.js voor tooling/admin panels
- Beste voorbeeld van role-gating patroon

**project-generator**
- Routes direct in `module.js` (enige uitzondering op het patroon)
- Meest uitgebreid permission-systeem: `permissions.js` met `canRead`, `canEdit`, `canDelete`, enz.
- Geen apart `routes.js` bestand — te vermijden voor nieuwe modules

**sales-insight-explorer**
- Meest schema-gedreven module; complex query-systeem
- Duidelijke scheiding: `lib/` met schema-service, capability-detection, query-validator, etc.
- Beste voorbeeld van gestructureerde `lib/` opbouw

---

## 3. UI infrastructuur patronen

### 3.1 Server-rendered HTML skeleton

Alle modules renderen een volledige HTML-pagina server-side. De `ui.js` functie retourneert een string met:

1. **Theme early-init IIFE** (als eerste script, vóór DaisyUI laden) — voorkomt flash-of-unstyled-content
2. **DaisyUI** via CDN: `https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css`
3. **Tailwind CDN warning suppressor** IIFE
4. **Tailwind CDN**: `https://cdn.tailwindcss.com`
5. **Lucide icons**: `https://unpkg.com/lucide@latest`
6. **`${navbar(user)}`** geïnjecteerd — geïmporteerd uit `../../lib/components/navbar.js`
7. **`window.__MODULE_STATE__`** setblok met `JSON.stringify({...})` voor minimale server→client state
8. **Lege HTML-skelet** voor dynamische rendering door client JS

### 3.2 Component hergebruik

Beschikbare shared components in `src/lib/components/`:

| Component | Bestand | Gebruik |
|-----------|---------|---------|
| Navbar | `navbar.js` | Alle modules — `${navbar(user)}` |
| Layout | `layout.js` | Page wrapper |
| Modal | `modal.js` | DaisyUI modal wrapper |
| Login | `login.js` | Login-pagina |
| Editor | `editor.js` | Rich text editing |
| Navigation | `navigation.js` | Secundaire nav |
| Sidebar | `sidebar.js` | Zij-navigatie |
| Field palette | `field_palette.js` | Form-gerelateerde UI |

**Regel:** Geen nieuwe UI-primitieven uitvinden. Bestaande components hergebruiken.

### 3.3 DaisyUI consistentie

- **Geen inline Tailwind utility classes** voor kleuren — DaisyUI semantic tokens gebruiken (`bg-base-100`, `text-base-content`, `badge-success`, enz.)
- **Tabs:** `tabs tabs-boxed` + `tab` + `tab-content` patroon (niet `role="tabpanel"`)
- **Modals:** DaisyUI `modal` + `modal-box` — geen eigen overlay-implementaties
- **Knoppen:** `btn btn-sm`, `btn btn-primary`, `btn btn-ghost`, enz.
- **Forms:** `input input-bordered`, `select select-bordered`, `label` + `label-text`
- **Feedback:** `alert alert-info/success/warning/error`, `badge badge-*`
- **Cards:** `card card-body shadow-md`

### 3.4 User feedback patterns

- **Loading states:** spinner via `<span class="loading loading-spinner loading-sm"></span>`
- **Toast/alerts:** DaisyUI `alert` blocks dynamisch getoond via JS
- **Optimistische UI:** state direct bijwerken, error terugdraaien
- **Geen template literals met backticks** in `<script>` blocks — veroorzaakt parse-problemen in server-side template strings

### 3.5 Geen spaghetti template literals

De `mail-signature-designer` heeft expliciete regels die voor de hele codebase gelden:
- Precies één `return \`...\`` in elke `ui.js` export-functie
- Nul backticks in `<script>` blokken (gebruik `var`, `function`, string concatenation)
- Geen inline business logic in `ui.js` — alleen HTML-skelet
- Server→client data altijd via `window.__STATE__ = ${JSON.stringify({...})}`

---

## 4. API patronen

### 4.1 Route handler definitie

```js
export const routes = {
  'GET /': async (context) => { ... },
  'GET /api/assets/list': async (context) => { ... },
  'POST /api/assets/upload': async (context) => { ... },
  'DELETE /api/assets/delete': async (context) => { ... },
};
```

### 4.2 Context object

```js
const { request, env, ctx, user, params } = context;
```

- `env` geeft toegang tot alle bindings: `env.R2_ASSETS`, `env.MAPPINGS_KV`, etc.
- `user` is het gevalideerde session-object (of `null` voor public routes)
- `params` zijn geëxtraheerde URL-parameters (`:id` → `params.id`)

### 4.3 Response helpers (patroon volgen)

```js
function jsonOk(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 4.4 Role-gating patroon

```js
function hasUploadAccess(context) {
  const role = context.user?.role;
  return role === 'admin' || role === 'asset_manager';
}

// In handler:
if (!hasUploadAccess(context)) return jsonError('Forbidden', 403);
```

### 4.5 Authenticatie flow

1. Session-token uit `Authorization: Bearer <token>` header **of** `session=` cookie
2. `validateSession(env, token)` → user object of `null`
3. Module-access check via `getUserModules(user)` → controleert `user_modules` tabel
4. Role-check voor sub-functies (upload/delete/admin)

---

## 5. Infra patronen — Wrangler vs Dashboard

### 5.1 Het huidige probleem

Bij elke `wrangler deploy` verschijnt de waarschuwing:

```
Your Worker has bindings that were configured in the Cloudflare dashboard.
Deploying now will override these settings.
```

Dit betekent dat een **R2 bucket binding** via het Cloudflare Dashboard is toegevoegd als tijdelijke oplossing, maar **niet** in `wrangler.jsonc` staat.

**Dit is een infra-inconsistentie.** De config-source-of-truth is gesplitst: deel in `wrangler.jsonc`, deel in het dashboard.

### 5.2 Waarom dashboard-bindings vermeden moeten worden

| Probleem | Gevolg |
|----------|--------|
| Bindings verdwijnen bij volgende `wrangler deploy` | Productie-outage na elke deploy |
| Configuratie is niet in versiebeheer | Geen rollback mogelijk |
| Dashboard-state is niet reproduceerbaar | Nieuwe developer kan Worker niet lokaal draaien |
| `wrangler dev` kent de binding niet | Lokaal testen mislukt of vereist workarounds |
| CI/CD kan niet gebouwd worden rondom dashboard-state | Deploy-pipeline is fragiel |

**Principe:** Elke binding die de Worker gebruikt **moet** gedeclareerd zijn in `wrangler.jsonc`. Het Dashboard is alleen voor inzien, niet voor configureren.

### 5.3 Hoe R2 binding correct gedeclareerd wordt

In `wrangler.jsonc`, naast de bestaande `kv_namespaces`:

```jsonc
{
  "name": "forminator-sync",
  "main": "src/index.js",
  "compatibility_date": "2025-07-30",
  "compatibility_flags": ["nodejs_compat"],
  
  "kv_namespaces": [
    {
      "binding": "MAPPINGS_KV",
      "id": "04e4118b842b48a58f5777e008931026"
    }
  ],
  
  // R2 bucket binding — CORRECT GEDECLAREERD IN CONFIG
  "r2_buckets": [
    {
      "binding": "R2_ASSETS",        // naam waarmee env.R2_ASSETS beschikbaar is
      "bucket_name": "openvme-assets" // naam van de R2 bucket in Cloudflare
    }
  ],
  
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  }
}
```

**Na toevoegen:** de Dashboard-binding kan worden verwijderd. Bij volgende deploy staat alles in sync.

### 5.4 Dev vs production configuratie

Voor lokale ontwikkeling met `wrangler dev`:

```jsonc
// In wrangler.jsonc:
"r2_buckets": [
  {
    "binding": "R2_ASSETS",
    "bucket_name": "openvme-assets",
    "preview_bucket_name": "openvme-assets-dev"  // aparte dev bucket
  }
]
```

Alternatief — lokale R2 zonder aparte bucket:
```bash
wrangler dev --local  # gebruikt in-memory R2 simulatie
```

### 5.5 Hoe toekomstige modules infra-consistent blijven

**Regel:** Elke nieuwe binding (R2, KV, D1, Queue, AI) die een module nodig heeft, wordt **eerst** gedeclareerd in `wrangler.jsonc` vóór implementatie.

Workflow:
1. Beslis welke binding nodig is
2. Voeg toe aan `wrangler.jsonc`
3. Commit de config
4. Deploy
5. Pas dan de module implementeren

**Nooit:** een binding via het Dashboard aanmaken en aannemen dat die beschikbaar blijft.

### 5.6 Hoe meerdere routes/domeinen aan dezelfde Worker gekoppeld worden

```jsonc
{
  "routes": [
    { "pattern": "openvme.be/*", "zone_name": "openvme.be" },
    { "pattern": "assets.openvme.be/*", "zone_name": "openvme.be" }
  ]
}
```

Of via `workers.dev` (gratis subdomain, geen custom domain):
```jsonc
{
  "workers_dev": true  // maakt forminator-sync.workers.dev beschikbaar
}
```

Voor eigene domeinen is een **Cloudflare Zone** vereist (het domein moet bij Cloudflare geregistreerd of geproxied zijn).

---

## 6. R2 storage model

### 6.1 Wat is R2

Cloudflare R2 is object storage compatibel met de S3 API (maar zonder egress-kosten). Bestanden worden opgeslagen als **objects** met een **key** (pad) en optionele **metadata**.

### 6.2 Prefix-based folder strategie

R2 heeft geen echte mappen — alles zijn objecten met een key. Mappenstructuur wordt gesimuleerd via key-prefixes:

```
uploads/banners/event-header-2026.jpg
uploads/templates/signature-base-v3.html
uploads/documents/offerte-abc.pdf
users/abc123/avatars/profile.jpg
public/logos/openvme-main.svg
```

Voordelen van deze aanpak:
- `list({ prefix: 'uploads/banners/' })` geeft alle banners terug
- `list({ prefix: 'users/abc123/' })` geeft alle bestanden van één user
- Compatibel met S3-tooling
- Geen complexe mappen-API nodig

Voorgestelde prefix-structuur voor asset_manager:

| Prefix | Gebruik | Toegang |
|--------|---------|---------|
| `public/` | Publiek toegankelijke assets (logo, favicon) | Iedereen |
| `uploads/` | Module-specifieke uploads | Authenticated users |
| `uploads/banners/` | Event banners voor mail-signature | marketing_signature, admin |
| `uploads/templates/` | HTML/CSS templates | admin |
| `uploads/documents/` | Interne documenten | Varies |
| `users/{userId}/` | User-specifieke bestanden | Owner + admin |
| `system/` | Systeemgenereerde bestanden | admin only |

### 6.3 Metadata-strategie

R2 objecten ondersteunen **custom HTTP metadata** (max 8 KB):

```js
await env.R2_ASSETS.put(key, fileBody, {
  httpMetadata: {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000',
  },
  customMetadata: {
    uploadedBy: user.id,
    originalName: 'banner.jpg',
    module: 'mail_signature_designer',
    uploadedAt: new Date().toISOString(),
  }
});
```

---

## 7. Security model

### 7.1 Upload-autorisatie

| Actie | Vereiste rol |
|-------|-------------|
| Upload naar `public/` | admin |
| Upload naar `uploads/banners/` | marketing_signature, admin |
| Upload naar `uploads/templates/` | admin |
| Upload naar `users/{own_id}/` | elke authenticated user (eigen folder) |
| Upload naar `users/{other_id}/` | admin |
| Lijst opvragen | authenticated user (eigen prefix) of admin (alle) |
| Verwijderen | admin, of eigenaar van bestand |
| Hernoemen/verplaatsen | admin |

### 7.2 Public asset-serving

Public assets (`GET /assets/*`) mogen **zonder authenticatie** bereikbaar zijn — dit is noodzakelijk voor het embedden van afbeeldingen in e-mailhandtekeningen en WordPress-pagina's.

**Cruciaal:** de `/assets/*` route mag nooit de Worker-authenticatie loop ingaan. Deze route wordt afgehandeld vóór session-validatie.

### 7.3 Geen directe R2 public-access

R2 bucket public-access is uitgeschakeld. Alle requests gaan via de Worker, die:
1. Autoriseert (of doorlaat voor public prefix)
2. Juiste `Content-Type` headers zet
3. Cache headers bepaalt
4. Optioneel signed URLs genereert

---

## 8. MVP scope

### In scope voor MVP

- Upload van bestanden via browser (POST multipart/form-data)
- Lijst opvragen van bestanden (paginering, prefix-filter)
- Verwijderen van bestanden
- Publiek serveren van assets via `/assets/*`
- Folder-browse UI (prefix-navigatie)
- Bestandsgrootte + type weergave
- Kopieer-URL functionaliteit
- Role-based upload permissions

### Bewust buiten MVP

- Preview-rendering van PDF/docx
- Versiegeschiedenis van bestanden
- Metadata-zoeken / full-text search
- CDN-integratie (R2 → Cloudflare Cache)
- Bulk-upload
- ZIP-download van folder
- Image-resize on-the-fly
- Asset-tagging systeem
- Koppeling met WordPress media library
- Signed/expiring URLs (tenzij alsnog in scope voor security)

---

## 9. Domeinstrategie

### 9.1 Huidige situatie

De Worker is bereikbaar op:
- `forminator-sync.workers.dev` (workers.dev subdomain)
- Mogelijk gekoppeld aan `openvme.be` via Cloudflare route

### 9.2 Waarom `assets.openvme.be` beter is

| Aspect | `workers.dev` | `assets.openvme.be` |
|--------|--------------|---------------------|
| Professioneel | Nee | Ja |
| Insluitbaar in e-mail img src | Beperkt (spam-filters) | Ja |
| Cacheable via Cloudflare CDN | Beperkt | Ja (via Cache Rules) |
| CORS-controle | Ingewikkeld | Volledig beheerbaar |
| Branded URL | Nee | Ja |
| Toekomstige CDN-integratie | Moeilijk | Eenvoudig |

**Aanbeveling:** Stel `assets.openvme.be` in als route in `wrangler.jsonc`, gekoppeld aan de bestaande Worker. Geen aparte Worker nodig.

### 9.3 Waarom public route gescheiden moet blijven

De `/assets/*` route dient publieke, gecachede bestanden. Deze route:
- Mag **geen** authenticatie vereisen
- Moet **aparte Cache-Control headers** sturen (lang — `max-age=31536000`)
- Mag **niet** via de module-routing loop gaan
- Moet **vóór** de session-validatie worden afgehandeld in `index.js`

Implementatievolgorde in `index.js`:
```
1. CORS preflight
2. /favicon.ico
3. /assets/*  ← PUBLIEK, voor auth
4. /api/auth/* (login/logout)
5. Module-routing (met auth)
```

### 9.4 Deploymentstrategie

- Eén Worker, meerdere routes (`openvme.be/*` + `assets.openvme.be/*`)
- Beide routes worden gedefinieerd in `wrangler.jsonc`
- Geen aparte Worker-deploy voor assets
- `wrangler.jsonc` is de single source of truth voor alle routes en bindings

---

## 10. Niet-doen lijst

- ❌ R2 binding via Dashboard configureren (altijd via `wrangler.jsonc`)
- ❌ Dashboard-state als bron van waarheid gebruiken
- ❌ Publieke R2 bucket-access inschakelen (altijd via Worker)
- ❌ `wrangler dev` skipping voor testen (altijd testen met lokale binding)
- ❌ Routes inline in `module.js` definiëren (gebruik `routes.js`)
- ❌ Backticks in `<script>` blokken van `ui.js`
- ❌ Business logic in `ui.js` (alleen HTML-skelet)
- ❌ Eigen CORS-headers op sub-routes (geregeld in `index.js`)
- ❌ Nieuwe UI-primitieven uitvinden (bestaande components hergebruiken)
- ❌ Half dashboard / half wrangler situatie laten bestaan

---

## 11. Open vragen

1. **Bucket naam:** Welke naam krijgt de R2 bucket in Cloudflare? (`openvme-assets`? `forminator-assets`?)
2. **Dev bucket:** Aparte `openvme-assets-dev` bucket voor lokaal testen, of `--local` modus?
3. **Domein timing:** Wanneer wordt `assets.openvme.be` geconfigureerd? Voor of na MVP?
4. **Max bestandsgrootte:** Wat is de gewenste uploadlimiet? (R2 ondersteunt objecten tot 5 TB; Workers request body is max 100 MB)
5. **Bestandstypen whitelist:** Welke MIME-types zijn toegestaan op upload?
6. **Bestaande bestanden:** Zijn er al bestanden in de R2 bucket die gemigreerd moeten worden?
7. **Koppeling met mail-signature:** Moeten banners direct vanuit asset_manager inzetbaar zijn in de Signature Designer?
8. **Supabase metadata:** Bijhouden van asset-metadata in Supabase (voor zoeken/filteren) of alleen R2 custom metadata?

---

*Volgende stap: ASSET_MANAGER_ARCHITECTURE.md — module-structuur, component-ontwerp, API-contract*
