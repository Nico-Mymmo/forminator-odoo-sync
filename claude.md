# Projectregels — forminator-odoo-sync

## Odoo-aanpassingen — geen code, alles via Studio

**Regel:** Alle Odoo-aanpassingen gebeuren via Odoo Studio of de Technische UI (automations, server actions, views). Geen Python-modules, geen custom XML buiten Studio, geen `mymmo_fixes`-aanpassingen. Als iets niet via Studio kan, gaat het naar Dynapps (externe partij, kost geld) — dit is een last resort. Stel altijd een Studio-first oplossing voor, ook als die een compromis is qua UX.

---

## Wat is dit project?

De **Operations Manager** — intern platform voor mymmo.com, draait als Cloudflare Worker. De repo heet `forminator-odoo-sync` (historische naam); de v1-sync-pipeline is volledig verwijderd. De enige forminator-module is **forminator-sync-v2** (`/forminator-v2`, code: `forminator_sync_v2`). "Odoo" = het CRM/ERP waar data naartoe gesynchroniseerd wordt.

## Stack

Cloudflare Worker (`src/`) met enkel API-routes en server-logica; statische frontend in `public/` (HTML + JS, daisyUI 4 + Tailwind + Lucide via CDN); Supabase (PostgreSQL) via `src/lib/database.js`; Odoo via `src/lib/odoo.js`; auth via sessie-cookie (`session=`) en `src/lib/auth/session.js`.

## Architectuur — request pipeline

`src/index.js` is een dunne entry. Volgorde per request:

1. `src/router/cors.js` — OPTIONS preflight + `addCorsHeaders()`
2. `src/router/public-routes.js` — auth-vrije routes: `/favicon.ico`, R2-assets (`/assets/*`), `/api/auth/login|logout|me`, forminator-v2 webhooks (token-auth)
3. `src/router/module-router.js` — `getModuleByRoute()` → `authGate()` → handler → `trackEndpoint()` (fire-and-forget)
4. `src/router/auth-gate.js` — token-extractie → `validateSession()` → requiresAuth/requiresAdmin/user_modules check

`scheduled()` in index.js draait de cx-powerboard cron.

**Verboden:** debug-/fix-routes zonder auth in index.js of routers (geen `/test-db`, `/fix-admin-now`, `/run-migrations` e.d.). Geen secrets/service-account keys in de repo — altijd via Worker secrets.

## Database — altijd via getSupabaseClient(env)

```js
import { getSupabaseClient } from '../../lib/database.js';
const supabase = getSupabaseClient(env); // per-isolate singleton, persistSession: false
```

**NOOIT** `createClient()` uit `@supabase/supabase-js` direct aanroepen in modules. Geen module-eigen supabaseClient.js-bestanden. Migraties in `supabase/migrations/` met timestamp-prefix `YYYYMMDDHHMMSS_naam.sql`.

## Endpoint-tracking

Elke succesvolle module-route-aanroep wordt geregistreerd in de tabel `endpoint_log` (`endpoint`, `last_called_at`, `call_count`) via `src/lib/endpoint-tracker.js` → SQL-functie `upsert_endpoint_log(p_endpoint)`. De module-router doet dit automatisch (fire-and-forget, route-patroon zoals `GET /admin/api/users/:id` — nooit raw paths met IDs). Publieke en auth-routes worden niet getrackt. Nieuwe modules hoeven hier niets voor te doen.

## Nieuwe module — template

```
src/modules/{module}/
  module.js     — definitie: { code, name, route, requiresAuth, requiresAdmin?, routes }
  routes.js     — handlers, alleen JSON responses
public/{module-naam}.html   — volledige UI
public/{module-naam}.js     — optionele client-side logica
```

```js
// module.js
import { routes } from './routes.js';
export default {
  code: 'mijn_module',
  name: 'Mijn Module',
  route: '/mijn-module',
  requiresAuth: true,
  routes: {
    'GET /': async (context) =>
      context.env.ASSETS.fetch(new Request(new URL('/mijn-module.html', context.request.url))),
    'GET /api/items': async ({ env, user }) => {
      const supabase = getSupabaseClient(env);
      // ...
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
```

Registreer in `src/modules/registry.js` (import + MODULES-array).

### Checklist
- [ ] `public/{module-naam}.html` aangemaakt; `GET /` serveert via `context.env.ASSETS.fetch()`
- [ ] Geen `ui.js`, geen HTML-strings in de Worker
- [ ] Client-side JS: data-attributen + centrale listener voor events
- [ ] API-routes retourneren JSON; database via `getSupabaseClient(env)`; Odoo via `lib/odoo.js`
- [ ] Frontend fetch met `credentials: 'include'`; bij 401 → `window.location.href = '/'`

## UI-regels

**REGEL 1 — UI hoort in `/public`, niet in de Worker.** NOOIT HTML-strings genereren in de Worker, NOOIT `new Response('<html>...')` voor een pagina. Referentie: `src/modules/admin/module.js` + `public/admin-dashboard.html`.

**REGEL 2 — DOM-manipulatie of innerHTML met data-attributen.** Template literals zijn OK in `.html`-bestanden (geen build-stap). NOOIT variabelen in inline event handlers.

**REGEL 3 — Event handlers via data-attributen + één centrale listener:**

```js
// ✅
`<button data-action="deleteItem" data-id="${item.id}">Verwijder</button>`
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  if (action === 'deleteItem') deleteItem(id);
});
// ❌ NOOIT: onclick="deleteItem('${item.id}')"
```

**REGEL 4 — Worker-routes retourneren altijd JSON.** Enige uitzondering: `GET /` van een module serveert HTML via `ASSETS.fetch()`.

**REGEL 5 — Auth in frontend:** elke fetch met `credentials: 'include'`; bij 401 redirect naar `/`. De navbar zit als plain HTML in elke pagina.

## Modules — status

| Module | Route | Code | UI | Status |
|---|---|---|---|---|
| home | `/` | `home` | `src/modules/home/ui.js` | ⚠️ Legacy |
| admin | `/admin` | `admin` | `public/admin-dashboard.html` | ✅ Correct |
| profile | `/profile` | `profile` | `src/modules/profile/ui.js` | ⚠️ Legacy |
| forminator-sync-v2 | `/forminator-v2` | `forminator_sync_v2` | `public/forminator-sync-v2.html` + `ui.js` | ⚠️ Legacy |
| project-generator | `/projects` | — | `src/modules/project-generator/ui.js` | ⚠️ Legacy |
| sales-insight-explorer | `/insights` | — | `ui-*.js` | ⚠️ Legacy — migratie bezig |
| event-operations | `/events` | — | `ui.js` | ⚠️ Legacy |
| mail-signature-designer | `/mail-signatures` | — | `ui.js` | ⚠️ Legacy |
| asset-manager | `/assets` | — | `ui.js` | ⚠️ Legacy |
| cx-powerboard | `/cx-powerboard` | — | `ui.js` | ⚠️ Legacy |
| wp-form-schemas | `/wp-sites` | — | in `routes.js` | ⚠️ Legacy |
| claude-integration | `/api/claude` | — | onderdeel van `/insights` | ⚠️ Legacy |

**Legacy modules NIET aanraken tenzij expliciet gevraagd.** Bij aanpassingen aan legacy `ui.js`: string-concatenatie (+), geen geneste template literals, geen variabelen in inline event handlers. `src/lib/components/navbar.js` is de legacy server-rendered navbar voor deze ui.js-bestanden.

## Bestandsstructuur

```
src/
  index.js                  — dunne entry: try/catch + pipeline + scheduled()
  router/
    cors.js                 — preflight + addCorsHeaders
    public-routes.js        — auth-vrije routes
    auth-gate.js            — sessie + module-toegang
    module-router.js        — module resolve + handler + trackEndpoint
  api/auth.js               — login/logout/me handlers
  lib/
    database.js             — getSupabaseClient(env) (enige plek met createClient)
    endpoint-tracker.js     — trackEndpoint(env, endpoint, ctx)
    odoo.js                 — searchRead(), executeKw()
    wordpress.js            — Forminator form fetchers (v2 + wp-form-schemas)
    auth/                   — session.js, middleware.js, password.js, invite.js
    components/navbar.js    — LEGACY navbar string
  modules/
    registry.js             — MODULES + getModuleByRoute + resolveModuleRoute
    {module}/module.js      — definitie + routes
public/                     — statische UI per module
supabase/migrations/        — YYYYMMDDHHMMSS_naam.sql
```
