# Asset Manager — Analyse

> **Status:** Fase 0 — Analyse & Architectuur (Iteratie 3)  
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

### 2.4 Expliciete patroonkeuze voor asset_manager

**BESLISSING — gevolgd patroon:** `mail-signature-designer` + `sales-insight-explorer`
- `module.js` importeert enkel `routes` uit `routes.js` en exporteert het module-object
- `routes.js` bevat alle API- en UI-handlers als named export `{ routes }`
- `ui.js` retourneert uitsluitend een HTML-skelet string — geen dynamiek
- `lib/` bevat geïsoleerde services (r2-client, path-utils, mime-types)
- `public/asset-manager-client.js` bevat alle browser-side logica

**BESLISSING — NIET gevolgd patroon:** `project-generator`
- Routes horen **niet** direct in `module.js` — dat patroon is een historische uitzondering
- Geen `permissions.js` voorlopig — role-gating zit inline in `routes.js`
- Geen `components/` subfolder — server-side HTML is minimaal (skeleton only)

### 2.5 Observaties per module

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

**BESLISSING voor asset_manager:**
- `ui.js` rendert server-side uitsluitend het HTML-skelet
- Alle dynamiek (lijst laden, upload, navigatie) zit in `public/asset-manager-client.js`
- Geen template literals met HTML in `asset-manager-client.js` — DOM-manipulatie via `document.createElement` en `textContent`
- Dit is een harde architectuurkeuze, geen suggestie

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

**Doelstelling:** Na de infra-fix mag `wrangler deploy` geen enkele binding-waarschuwing meer produceren. Nul. Dit is een harde eis, geen nice-to-have.

**Branch-strategie:** De infra-fix (toevoegen van R2 binding aan `wrangler.jsonc`) gebeurt op de **`master`-branch**, vóórdat de module-branch `assets-manager` gemerged of geïmplementeerd wordt. De module mag de binding gebruiken, maar mag hem niet introduceren.

### 5.2 Waarom dashboard-bindings vermeden moeten worden

| Probleem | Gevolg |
|----------|--------|
| Bindings verdwijnen bij volgende `wrangler deploy` | Productie-outage na elke deploy |
| Configuratie is niet in versiebeheer | Geen rollback mogelijk |
| Dashboard-state is niet reproduceerbaar | Nieuwe developer kan Worker niet lokaal draaien |
| `wrangler dev` kent de binding niet | Lokaal testen mislukt of vereist workarounds |
| CI/CD kan niet gebouwd worden rondom dashboard-state | Deploy-pipeline is fragiel |

**Principe:** Elke binding die de Worker gebruikt **moet** gedeclareerd zijn in `wrangler.jsonc`. Het Dashboard is alleen voor inzien, niet voor configureren.

### 5.3 Bindingsnaam — definitieve keuze

**De binding heet `R2_ASSETS` — overal, altijd, zonder uitzondering.**

Verklaring:
- `ASSETS` is al in gebruik voor de Cloudflare Static Assets binding (`"binding": "ASSETS"` in de assets-sectie)
- Om naamconflict te vermijden en de semantiek duidelijk te maken, is `R2_ASSETS` de correcte naam
- Code die de binding gebruikt: `env.R2_ASSETS.put(...)`, `env.R2_ASSETS.get(...)`, enz.
- Documentatie, routes.js, r2-client.js en de wrangler.jsonc gebruiken allen `R2_ASSETS`

### 5.3b Hoe R2 binding correct gedeclareerd wordt

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
  // Binding naam: R2_ASSETS (niet ASSETS — dat is al in gebruik voor static files)
  "r2_buckets": [
    {
      "binding": "R2_ASSETS",
      "bucket_name": "<exacte-bucket-naam-uit-dashboard>"
    }
  ],
  
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"  // dit blijft ongewijzigd
  }
}
```

**Na toevoegen:** de Dashboard-binding kan worden verwijderd. Bij volgende deploy staat alles in sync.

### 5.4 Development workflow en R2-runtime

`npm run dev` draait via `wrangler dev` met `"remote": true` op de R2- en KV-bindings in `wrangler.jsonc`. De echte `openvme-assets` bucket is actief in zowel dev als productie.

```bash
npm run dev     # wrangler dev — echte R2 via remote binding
npm run deploy  # wrangler deploy — productie
```

**Altijd gebruiken:**
- ✅ `wrangler dev` met `remote: true` in binding-config
- ✅ `wrangler deploy`

**Nooit gebruiken:**
- ❌ `wrangler dev --remote` (dwingt preview-buckets af voor àlle bindings)
- ❌ `wrangler dev --local` (negeert `remote: true`, activeert in-memory R2 mock)
- ❌ `preview_bucket_name` toevoegen

Zie ook: `ASSET_MANAGER_ARCHITECTURE.md` → sectie *Development Runtime Model*.

### 5.5 Migratiestrategie als bucket al data bevat

Als de R2 bucket al bestanden bevat op het moment van de infra-fix:

1. **Niets verandert aan de data** — het toevoegen van de binding aan `wrangler.jsonc` heeft geen effect op de inhoud van de bucket
2. **Geen data-migratie nodig** — R2 objecten blijven intact tijdens bindings-config-wijzigingen
3. **Verifieer bestandslijst vóór en na** de infra-deploy via Dashboard → R2 → bucket-bestanden
4. **Bestaande URLs blijven geldig** — de bucket-naam verandert niet

**Actie:** Noteer het aantal objecten in de bestaande bucket vóór de infra-fix. Controleer na deploy dat dit aantal gelijk is.

### 5.6 Logging en observability

De Worker heeft `observability: { enabled: true }` in `wrangler.jsonc`. Dit schakelt Cloudflare Workers Logpush in.

**`wrangler tail` voor live debugging:**
```bash
npx wrangler tail
```
Dit streamt live Worker-logs naar de terminal — nuttig voor upload-debugging, R2-foutopsporing en auth-problemen.

**Log prefix conventie:** Alle server-side logs van de asset_manager gebruiken `[asset-manager]` als prefix:
```
[asset-manager] PUT uploads/banners/header.jpg — 204KB — user abc123
[asset-manager] ERROR R2 put failed: key too long
[asset-manager] DELETE uploads/banners/old.jpg — user abc123
```

Deze conventie bestaat al in andere modules (`[event-operations]`, `[mail-signature-designer]`) en wordt hier voortgezet.

### 5.7 Hoe toekomstige modules infra-consistent blijven

**Regel:** Elke nieuwe binding (R2, KV, D1, Queue, AI) die een module nodig heeft, wordt **eerst** gedeclareerd in `wrangler.jsonc` vóór implementatie.

Workflow:
1. Beslis welke binding nodig is
2. Voeg toe aan `wrangler.jsonc`
3. Commit de config
4. Deploy
5. Pas dan de module implementeren

**Nooit:** een binding via het Dashboard aanmaken en aannemen dat die beschikbaar blijft.

### 5.8 Hoe meerdere routes/domeinen aan dezelfde Worker gekoppeld worden

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

### 7.1b Prefix-isolatie (formeel)

Prefix-isolatie is de primaire beveiligingslaag voor niet-admin gebruikers.

**Definitie:** Een gebruiker met rol `user` mag uitsluitend lezen en schrijven binnen zijn/haar eigen prefix: `users/{user.id}/`.

**Harde regels:**
1. De prefix wordt **server-side** berekend op basis van `user.id` — nooit op basis van client-input alleen
2. Een user-supplied prefix wordt geverifieerd: `isWithinPrefix(suppliedPrefix, buildUserPrefix(user.id))`
3. Als de check mislukt → 403 Forbidden
4. Een admin kan elke prefix benaderen — geen prefix-restrictie
5. Een `asset_manager` rol heeft toegang tot alle `uploads/` prefixen maar niet tot `users/` van anderen of `system/`

**Aanvalsvector die geblokkeerd wordt:** Een kwaadwillende user die `prefix=uploads/banners/` meestuurt in een upload-request om in de verkeerde map te schrijven.

### 7.2 Max upload-groottelimiet

De maximale uploadgrootte wordt als constante gedefinieerd in `routes.js` (bovenaan het bestand, naast andere constanten):

```
MAX_UPLOAD_BYTES = 10 * 1024 * 1024   // 10 MB standaard
```

Deze waarde is bewust een named constant zodat hij op één plek aangepast kan worden. Het is geen magic number verspreid door de code.

Bij overschrijding: HTTP 413 met `{ success: false, error: 'Bestand te groot. Maximum is 10 MB.' }`

### 7.3 Rate limiting strategie

Cloudflare Workers hebben geen ingebouwde per-user rate limiting. Voor MVP is dit acceptabel (interne tooling, beperkt aantal gebruikers).

**Future-ready strategie (niet in MVP):**
- Gebruik KV om upload-counts per user per tijdvenster bij te houden
- Sleutel: `ratelimit:{userId}:{windowMinute}` → count
- TTL: 60 seconden
- Limiet: 20 uploads per minuut per user

**Huidige maatregel (MVP):** max bestandsgrootte + authenticatievereiste zijn voldoende bescherming voor intern gebruik.

### 7.4 Gestandaardiseerde error-structuur

Alle API-fouten gebruiken het zelfde schema:

```
{
  success: false,
  error: string,        // leesbare foutmelding
  code: string,         // machine-leesbare code (optioneel)
  status: number        // HTTP status (in de Response, niet in de body)
}
```

Voorbeelden van foutcodes:
- `KEY_INVALID` — key bevat `..` of begint met `/`
- `PREFIX_FORBIDDEN` — user probeert buiten eigen prefix te schrijven
- `MIME_NOT_ALLOWED` — bestandstype niet in whitelist
- `FILE_TOO_LARGE` — groter dan MAX_UPLOAD_BYTES
- `NOT_FOUND` — R2 object bestaat niet
- `UNAUTHORIZED` — geen geldige sessie
- `FORBIDDEN` — geldige sessie maar onvoldoende rol

### 7.5 Public asset-serving

Public assets (`GET /assets/*`) mogen **zonder authenticatie** bereikbaar zijn — dit is noodzakelijk voor het embedden van afbeeldingen in e-mailhandtekeningen en WordPress-pagina's.

**Cruciaal:** de `/assets/*` route mag nooit de Worker-authenticatie loop ingaan. Deze route wordt afgehandeld vóór session-validatie.

### 7.6 Geen directe R2 public-access

R2 bucket public-access is uitgeschakeld. Alle requests gaan via de Worker, die:
1. Autoriseert (of doorlaat voor public prefix)
2. Juiste `Content-Type` headers zet
3. Cache headers bepaalt
4. Optioneel signed URLs genereert (future)

### 7.7 Upload beperkingen — streaming buiten scope

**`request.formData()` laadt de volledige request body in Worker-geheugen.** Dit is een fundamentele beperking van de multipart upload-aanpak in Cloudflare Workers.

| Aspect | Situatie |
|--------|----------|
| Upload-methode | `request.formData()` — volledig in memory geladen |
| Streaming uploads | **Niet ondersteund in MVP** |
| Direct-to-R2 presigned upload | **Niet ondersteund in MVP** |
| Max upload-grootte | 10 MB (`MAX_UPLOAD_BYTES`) — directe gevolg van deze beperking |

**Waarom 10 MB als hard maximum:**
- `formData()` buffert het volledige bestand in het Worker-geheugen vóór verwerking
- Cloudflare Workers hebben een geheugenbeperking — grote payloads veroorzaken crashes of timeouts
- De 10 MB limiet is de veilige werkgrens voor de huidige aanpak

**Wat dit praktisch uitsluit voor MVP:**
- Video-uploads (doorgaans > 10 MB)
- Grote PDF-documenten of archieven
- Bulk-uploads van meerdere grote bestanden tegelijk

**Future extensibility:** Streaming of presigned direct-to-R2 uploads kunnen later worden toegevoegd als de 10 MB limiet knelt. Dit vereist een aparte flow: de Worker genereert een tijdelijk presigned token, de browser POST direct naar R2 zonder via de Worker te gaan. Zie sectie 10.2 (Signed URLs) voor de architecturele haak die hiervoor klaarstaat.

**Implementatienoot:** Controleer `Content-Length` header vóór `formData()` aanroepen. Als de waarde `MAX_UPLOAD_BYTES` overschrijdt: retourneer onmiddellijk HTTP 413 zonder de body te verwerken.

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
- Streaming uploads / presigned direct-to-R2 (zie sectie 7.7)

---

## 8.5 Performance Overwegingen

> **Geen implementatie in Fase 0** — dit zijn ontwerpbeslissingen die de architectuur sturen.

### 8.5.1 R2 `list()` limiet

R2 `list()` retourneert maximaal **1000 objecten per aanroep**. Dit is een hard platform-maximum, geen configureerbare instelling.

**Gevolg voor ontwerp:**
- De API-response bevat altijd een `truncated` vlag en een `cursor` voor vervolgpagina's
- De client mag **nooit** aannemen dat de eerste response de volledige bucket-inhoud bevat
- Cursor-based paginering is een architecturele vereiste, geen optimalisatie

### 8.5.2 Waarom default limit 50 is

De default paginagrootte is ingesteld op **50 objecten** (ver onder het maximum van 1000):

| Reden | Toelichting |
|-------|-------------|
| Snelle eerste render | 50 rijen laden sneller dan 1000 |
| Minder DOM-werk | Browser rendert 50 `<tr>` elementen, niet 1000 |
| Kleinere response body | Minder JSON serialisatie overhead |
| Vooruitloopt op groei | Bucket groeit over tijd; 50 blijft responsief |

De client kan via de `limit` parameter hogere waarden aanvragen (max 1000).

### 8.5.3 Cursor-based paginering is verplicht

R2 list gebruikt **cursor-based paginering** — geen offset/page-number aanpak.

- `truncated: true` → er zijn meer objecten na de huidige pagina
- `cursor: "<opaque string>"` → door te geven als `cursor` param in de volgende aanroep
- Cursors zijn opaque: de client mag ze niet interpreteren of manipuleren
- Een cursor is alleen geldig voor dezelfde `prefix` en `limit` combinatie

**Implicatie voor client JS:** `loadList(prefix, cursor)` moet de cursor doorgeven bij elke "Volgende pagina" actie.

### 8.5.4 Client-side zoeken werkt alleen op de geladen pagina

De UI biedt een zoekveld voor bestandsnamen. **Belangrijk:** dit zoekfilter werkt uitsluitend op de objecten die momenteel in de browser geladen zijn (één pagina).

- Er is **geen server-side full-text zoeken** op R2 keys in MVP
- R2 list() ondersteunt alleen prefix-filtering, geen substring-matching
- Als er 500 bestanden zijn maar de pagina toont er 50, zoekt de UI alleen in die 50

**Communiceer dit in de UI:** Een label "Zoeken in huidige pagina (50 van X)" voorkomt verwarring.

### 8.5.5 Metadata-index via Supabase als toekomstige oplossing

Voor full-text zoeken, filtering op `uploadedBy`, of sortering op velden die R2 niet ondersteunt, is een **externe metadata-index** vereist.

**Toekomstige aanpak (niet in MVP):**
- Supabase tabel `asset_metadata`: `key`, `original_name`, `size`, `content_type`, `module`, `uploaded_by`, `uploaded_at`
- Bij elke upload schrijft de Worker ook een rij in `asset_metadata`
- Zoek-endpoints bevragen Supabase, halen bestanden op via R2
- `r2-client.js` blijft puur R2 — `asset-store.js` (zie sectie 10.3) is de metadata-laag

**Architecturele beslissing voor MVP:** De `lib/`-structuur anti-paleert al op `asset-store.js` als optioneel bestand. De R2-client en routes hoeven niet aangepast te worden wanneer de Supabase-laag later wordt toegevoegd.

---

## 9. Domeinstrategie

### 9.1 Huidige situatie

De Worker is bereikbaar op:
- `forminator-sync.workers.dev` (workers.dev subdomain, automatisch actief)
- Mogelijk gekoppeld aan `openvme.be` via Cloudflare route

### 9.2 workers.dev is voldoende voor interne tooling

Dit is een **interne applicatie** — gebruikt door OpenVME-medewerkers, niet door het grote publiek.

| Aspect | `workers.dev` | `assets.openvme.be` |
|--------|--------------|---------------------|
| Setup-complexiteit | Nul | Vereist Cloudflare Zone + DNS |
| Vereist domein bij CF | Nee | Ja |
| Geschikt voor intern gebruik | Ja | Ja |
| Geschikt voor e-mail `img src` | Beperkt | Beter |
| Branded URL | Nee | Ja |
| CDN caching | Beperkt | Volledig |

**Beslissing voor MVP:** `workers.dev` is productieklaar voor interne tooling. Een custom domein is optioneel en kan later toegevoegd worden zonder architectuurwijzigingen.

**Wanneer custom domein wel nuttig wordt:**
- Als asset-URLs worden ingesloten in e-mails die naar externe ontvangers gaan
- Als assets op een branded URL gepubliceerd worden
- Als Cloudflare Cache Rules gewenst zijn voor publieke assets

**Hoe custom domein later toe te voegen** (geen blocker voor MVP):
```jsonc
// Toe te voegen aan wrangler.jsonc wanneer gewenst:
"routes": [
  { "pattern": "assets.openvme.be/*", "zone_name": "openvme.be" }
]
```
Vereist: domein `openvme.be` bij Cloudflare geregistreerd of geproxied.

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

- Eén Worker, één codebase, één `wrangler deploy`
- Geen aparte Worker-deploy voor assets
- `wrangler.jsonc` is de single source of truth voor alle routes en bindings
- Custom domein is een optionele toekomstige uitbreiding, geen architecturele vereiste

---

## 10. Future extensibility

Deze sectie documenteert uitbreidingen die bewust buiten MVP gehouden worden maar architectureel rekening mee gehouden is.

### 10.1 Image resizing hook

R2 heeft geen ingebouwde image-resize. Toekomstige aanpak:
- Upload origineel naar `uploads/originals/{key}`
- Cloudflare Images of een externe service transformeert on-demand
- Cache resultaat in R2 onder `uploads/resized/{width}x{height}/{key}`
- De `r2-client.js` abstactielaag is zo ontworpen dat dit later toegevoegd kan worden zonder de routes aan te passen

### 10.2 Signed URLs (private assets)

Voor bestanden die niet publiek mogen zijn maar toch deelbaar zijn:
- Worker genereert een tijdelijk token (in KV opgeslagen, 1 uur TTL)
- URL: `/assets/signed/{token}/{key}`
- Worker valideert token, serveert bestand, verwijdert token uit KV
- Vereiste toevoeging: `GET /assets/signed/:token/:key` route in `index.js`

### 10.3 Metadata-index via Supabase

R2 list ondersteunt geen full-text zoeken of filtering op custom metadata. Toekomstige aanpak:
- `asset_metadata` tabel in Supabase met kolommen: `key`, `original_name`, `size`, `content_type`, `module`, `uploaded_by`, `uploaded_at`
- `asset-store.js` in `lib/` schrijft metadata bij elke upload
- Zoek-endpoints gebruiken Supabase, haal bestand op via R2
- `r2-client.js` blijft puur R2 — `asset-store.js` is de metadata-laag

### 10.4 CDN caching rules

Na custom domain configuratie:
- Cloudflare Cache Rules voor `assets.openvme.be/public/*` → Edge cache 1 jaar
- Cache purge API call na hernoemen/verwijderen van publieke bestanden
- `Cache-Control: public, max-age=31536000, immutable` op public prefix

### 10.5 Cross-module asset picker API

Andere modules (mail-signature-designer, event-operations) kunnen assets opvragen via een interne pickup-API:
- `GET /assets/api/assets/list?prefix=uploads/banners/` → lijst met URL's
- Frontend van andere module toont een modal met asset-kiezer
- Geselecteerde URL wordt teruggegeven aan de aanroepende module
- Geen extra Worker-communicatie nodig — gewone fetch tussen client-side JS bestanden

---

## 11. Niet-doen lijst

- ❌ R2 binding via Dashboard configureren (altijd via `wrangler.jsonc`)
- ❌ Dashboard-state als bron van waarheid gebruiken
- ❌ Binding `ASSETS` gebruiken voor R2 (gebruik `R2_ASSETS` — `ASSETS` is al in gebruik voor static files)
- ❌ Publieke R2 bucket-access inschakelen (altijd via Worker)
- ❌ `wrangler dev --remote` gebruiken (dwingt preview-buckets af — gebruik `wrangler dev` met `remote: true` per binding)
- ❌ Routes inline in `module.js` definiëren (gebruik `routes.js` — project-generator patroon NIET volgen)
- ❌ Backticks in `<script>` blokken van `ui.js`
- ❌ Template literals voor HTML in `asset-manager-client.js` (gebruik DOM-API)
- ❌ Business logic in `ui.js` (alleen HTML-skelet)
- ❌ Eigen CORS-headers op sub-routes (geregeld in `index.js`)
- ❌ Nieuwe UI-primitieven uitvinden (bestaande components hergebruiken)
- ❌ Half dashboard / half wrangler situatie laten bestaan
- ❌ custom domein verplicht stellen voor MVP (workers.dev is voldoende voor interne tooling)

---

## 12. Open vragen

1. **Bucket naam:** Wat is de exacte naam van de bestaande R2 bucket in Cloudflare Dashboard?
2. **Bestaande bestanden:** Hoeveel objecten zitten er al in de bucket? Moeten ze bewaard worden?
3. **Max bestandsgrootte:** Is 10 MB voldoende, of is een hogere limiet gewenst? (default: 10 MB)
4. **Bestandstypen whitelist:** Zijn de genoemde MIME-types voldoende, of zijn er extra types nodig?
5. **Koppeling met mail-signature:** Is een asset-picker modal in de Signature Designer gewenst voor MVP, of later?
6. **Supabase metadata:** Moet zoeken/filteren op metadata aangeboden worden? Zo ja, dan is de Supabase-laag nodig.
7. **Custom domein timing:** Wanneer wordt `assets.openvme.be` geconfigureerd? Voor of na MVP? (geen blocker)

---

## Changelog

### Iteratie 3 — 2026-02-24

- **Sectie 7.7:** Nieuwe sectie toegevoegd — Upload beperkingen: `formData()` laadt in memory, streaming buiten MVP, 10 MB limiet als directe gevolg, future extensibility via presigned URLs, implementatienoot voor Content-Length pre-check
- **Sectie 8.5:** Nieuwe sectie toegevoegd — Performance Overwegingen: R2 list() max 1000 objecten, default limit 50 met onderbouwing, cursor-based paginering als verplichte architectuurkeuze, client-side zoeken beperkt tot geladen pagina, Supabase metadata-index als toekomstige oplossing
- **Sectie 8 Bewust buiten MVP:** Streaming uploads / presigned uploads toegevoegd aan de lijst (verwijzing naar 7.7)
- **Consistentiecheck:** Alle verwijzingen naar R2 binding gebruiken `R2_ASSETS` — geen `ASSETS` als R2 binding gevonden; geen hardcoded domeinen gevonden

### Iteratie 2 — 2026-02-24

- **Sectie 2.3/2.4:** Expliciete patroonkeuze toegevoegd — `routes.js` patroon gevolgd, `project-generator` patroon expliciet NIET gevolgd
- **Sectie 3.5:** Architectuurkeuze formeel vastgelegd: `ui.js` = skeleton only, alle dynamiek in client JS, geen template literals in client
- **Sectie 5.1:** Duidelijk gemaakt dat infra-fix op `master` branch plaatsvindt vóór module-branch; nul binding-warnings als harde eis
- **Sectie 5.3:** Bindingsnaam definitief vastgelegd als `R2_ASSETS` (niet `ASSETS`), met verklaring van naamconflict vermijding
- **Sectie 5.4:** Migratiestrategie toegevoegd voor het geval de bucket al data bevat
- **Sectie 5.6:** Logging & observability sectie toegevoegd: `wrangler tail`, `[asset-manager]` log prefix conventie
- **Sectie 7:** Security volledig uitgebreid: prefix-isolatie formeel uitgeschreven, max upload-grootte als named constant, rate limiting strategie, gestandaardiseerde error-structuur met foutcodes
- **Sectie 9:** Domeinstrategie herzien: `workers.dev` is voldoende voor interne tooling, custom domein is optioneel
- **Sectie 10:** Nieuwe sectie: Future extensibility (image resizing, signed URLs, Supabase metadata-index, CDN, cross-module asset picker)
- **Sectie 11:** Niet-doen lijst uitgebreid met `R2_ASSETS` naamregel, DOM-API vereiste voor client JS, project-generator patroon verbod
- **Sectie 12:** Open vragen vereenvoudigd (domein niet meer urgente vraag)

*Volgende stap: ASSET_MANAGER_ARCHITECTURE.md — module-structuur, component-ontwerp, API-contract*
