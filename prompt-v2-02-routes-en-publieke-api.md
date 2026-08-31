# Event Operations v2 — Fase 1, stap 5 & 6: beheer-API en publieke API

**Bedoeld voor: Claude Sonnet 5.**

Het fundament is af en getest. Jouw taak is HTTP op bestaande functies leggen. Bijna alle beslissingen zijn al genomen en zitten in code vast — je hoeft ze niet opnieuw te nemen, en je mag ze niet omzeilen.

## Lees eerst

- `claude.md`
- `src/modules/event-operations-v2/odoo-contract.js` — het contract, lees dit volledig
- `src/modules/event-operations-v2/constants.js`
- `src/modules/event-operations-v2/lib/events-service.js` — hier zit de logica al
- `src/modules/event-operations-v2/lib/validation.js`
- `src/modules/event-operations-v2/lib/cache.js`
- `src/modules/event-operations-v2/lib/blocks.js`
- `src/modules/event-operations-v2/lib/partners.js`
- `src/modules/event-operations-v2/routes.js` — bevat al `withErrors` en een health-route
- `src/modules/event-operations-v2/tests/contract-test.mjs` — 39 tests, moeten groen blijven
- `src/router/public-routes.js` — bekijk `dispatchV2Webhook` en hoe `/forminator-v2/api/webhook` geregistreerd is
- `src/lib/auth/middleware.js`
- `src/modules/asset-manager/lib/r2-client.js`
- `src/modules/event-operations/services/recap-service.js` — voor `getPublicAssetUrl`

## Wat er al staat

| Bestand | Bevat |
|---|---|
| `odoo-contract.js` | alle veldnamen, `FORBIDDEN_FIELDS`, datetime-conversie, `deriveFormat`, `seatsLeft`, `registrationStatus`, `toEventDto`, `toPublicEventDto`, `toRegistrationDto`, `toOdooEventValues` |
| `lib/events-service.js` | `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `setPublicationState`, `setEventActive`, `duplicateEvent`, `listEventTypes`, `getRegistrationCounts`, `logToChatter` |
| `lib/validation.js` | `ValidationError` (met `.status` en `.details`), `validateEventInput`, `checkPublishReadiness`, `assertPublicationTransition`, `normalizePagination`, `normalizeEmail` |
| `lib/cache.js` | `readThrough`, `invalidateEvents`, `weakEtag`, `checkRateLimit` |
| `lib/blocks.js` | `sanitizePublicHtml`, `htmlToText`, `summarize`, `buildMetaDescription` |
| `lib/partners.js` | `resolvePartnerByEmail` |
| `lib/slug.js` | `slugify`, `ensureUniqueSlug` |
| `routes.js` | `withErrors` en `GET /api/health` |
| migratie | `20260831081157_event_operations_v2_module.sql` — de enige, alleen moduleregistratie |

De module is geregistreerd in `src/modules/registry.js` en `/events-v2` resolveert correct zonder `/events` (v1) te breken.

## Vier regels die niet ter discussie staan

1. **Odoo is de enige database.** Geen Supabase, geen nieuwe tabel, geen `getSupabaseClient`. Cache is wegwerpbaar.
2. **Geen `x_`-veldnaam buiten `odoo-contract.js`.** Heb je een veld nodig dat er niet staat, voeg het dáár toe aan `EVENT_FIELDS` of `REGISTRATION_FIELDS`.
3. **Elke lijst is twee Odoo-calls.** De services doen dat al goed; roep ze aan in plaats van zelf `searchRead` te schrijven. Nooit `fields: []`. Nooit een call per event.
4. **De publieke respons komt altijd uit `toPublicEventDto`.** Nooit zelf een object samenstellen — die functie is de enige garantie dat `x_studio_webinar_link` niet lekt.

## Stap 5 — Beheer-API

Vul `routes.js` aan. Alles achter de bestaande auth-gate (die regelt `module-router.js` al, je hoeft zelf geen `requireAuth` aan te roepen — controleer dat in `src/router/auth-gate.js` en `module-router.js` en volg wat `forminator-sync-v2/routes.js` doet). Wrap elke handler in `withErrors`.

| Route | Aanroep |
|---|---|
| `GET /api/events` | `listEvents` met filters uit de querystring: `state`, `type`, `format`, `from`, `to`, `q`, `include_archived`, plus `normalizePagination` |
| `POST /api/events` | `createEvent(env, body, context.user)` |
| `GET /api/events/:id` | `getEvent(env, { id })` — 404 als `event` null is |
| `PATCH /api/events/:id` | `updateEvent(env, id, body, context.user)` |
| `POST /api/events/:id/publish` | `setPublicationState(env, id, 'published', context.user)` |
| `POST /api/events/:id/unpublish` | `setPublicationState(env, id, 'draft', context.user)` |
| `POST /api/events/:id/cancel` | `setPublicationState(env, id, 'cancelled', context.user)` |
| `POST /api/events/:id/archive` | `setEventActive(env, id, false, context.user)` |
| `POST /api/events/:id/unarchive` | `setEventActive(env, id, true, context.user)` |
| `POST /api/events/:id/duplicate` | `duplicateEvent(env, id, context.user)` |
| `GET /api/event-types` | `listEventTypes` |
| `POST /api/events/:id/hero-image` | zie hieronder |

Antwoordvorm consequent `{ success: true, data: ... }` en bij fouten `{ success: false, error, details }` — dat doet `withErrors` al.

Geef bij een lijst ook `total`, `page` en `per_page` mee, en zet `X-Cache: hit|miss` op basis van het `cached`-veld dat de services teruggeven.

**Hero-image upload.** Multipart met veld `file`. Valideer content-type `image/*` en een maximum van 5 MB. Sla op met `putObject` uit de asset-manager onder `events/{id}/hero.{ext}`, bouw de publieke URL met `env.BASE_ASSET_URL` precies zoals `recap-service.js` het doet, en schrijf die URL weg via `updateEvent(env, id, { hero_image_url: url }, context.user)` — dus via de service, niet met een eigen `write`, zodat de cache-invalidatie en het chatterbericht meelopen.

## Stap 6 — Publieke API

Nieuw bestand `src/modules/event-operations-v2/public-api.js` met de handlers, plus registratie in `src/router/public-routes.js` volgens het patroon van `dispatchV2Webhook`.

| Route | Geeft |
|---|---|
| `GET /events-v2/public/v1/events` | gepubliceerde events; params `from`, `to`, `type`, `format`, `limit` (max `PAGINATION.PUBLIC_MAX_LIMIT`), `include_past` |
| `GET /events-v2/public/v1/events/:slug` | één event met `detail: true` |
| `GET /events-v2/public/v1/event-types` | `listEventTypes` |

Voor alle drie geldt:

- **Alleen `publication_state === 'published'`.** Zet dat filter in de handler, niet in de querystring.
- **Standaard geen events uit het verleden**, tenzij `include_past=1`.
- **Sitesleutel** in header `X-Mymmo-Site-Key`, vergeleken met `env.EVENTS_PUBLIC_SITE_KEYS` (komma-gescheiden). Gebruik een timing-safe vergelijking — kopieer de aanpak uit `forminator-sync-v2/routes.js` rond regel 1489-1521. Ontbreekt of klopt hij niet: 401.
- **CORS** alleen voor de origins in `env.EVENTS_PUBLIC_ORIGINS`. Handel ook `OPTIONS` af.
- **Rate limit** met `checkRateLimit(env, siteKey, PUBLIC_RATE_LIMIT)`; bij overschrijding 429 met `Retry-After`.
- **ETag** met `weakEtag(body)`, en 304 bij een matchende `If-None-Match`. Plus `Cache-Control: public, max-age=60, stale-while-revalidate=300`. Dit is wat het pollen door de WordPress-plugin goedkoop maakt, dus sla het niet over.
- **Cache** via de services: geef `cacheTtl: CACHE_TTL.PUBLIC_LIST` respectievelijk `PUBLIC_DETAIL` mee.
- **`body_html` altijd door `sanitizePublicHtml`.** Dat haalt scripts, inline handlers en oude `[forminator_form]`-shortcodes eruit.
- **`summary`**: valt terug op `summarize(body_html)` als het veld leeg is, zodat een kaart nooit leeg is.
- Voeg `PUBLIC_SHAPE_VERSION` toe aan de respons als `meta.shape_version`. Dat is het contract met de plugin.

Response-envelope voor een lijst:

```json
{ "meta": { "shape_version": 1, "count": 12, "generated_at": "..." }, "events": [ ... ] }
```

## Wat je NIET doet

- Geen inschrijf-endpoint. `POST .../register` is fase 3. `resolvePartnerByEmail` staat er al klaar voor; laat hem staan.
- Geen UI. Geen `public/events-v2.html`, geen HTML uit de Worker.
- Geen mailverzending.
- Niets aanraken in `src/modules/event-operations/` (v1), `public/event-operations-client.js` of `public/*-controller.js`.
- Geen tweede migratie. De bestaande is de enige.
- `odoo-contract.js` alleen aanvullen met veldnamen, niet herstructureren. De 39 tests zijn de bewaking.
- Geen eigen `searchRead` of `write` op `x_webinar` — dat loopt via `events-service.js`, zodat cache-invalidatie en chatter altijd meelopen.

## Definitie van klaar

- `node src/modules/event-operations-v2/tests/contract-test.mjs` geeft 39 geslaagde tests
- `grep -rn "getSupabaseClient" src/modules/event-operations-v2/ --include=*.js | grep -v "^\s*\*"` geeft nul code-resultaten
- `grep -rnE "'x_[a-z_]+'|\"x_[a-z_]+\"" src/modules/event-operations-v2/ --include=*.js | grep -v odoo-contract.js | grep -vE ":\s*\*|//"` geeft nul resultaten
- `grep -rn "fields: \[\]" src/modules/event-operations-v2/` geeft nul code-resultaten
- Alle bestanden halen `node --check`
- Een event aanmaken, patchen, publiceren en weer op draft zetten werkt via de beheer-API
- Publiceren van een incompleet event geeft 409 met in `details` een lijst van wat mist
- `cancelled → published` geeft 409
- `GET /events-v2/public/v1/events` werkt zonder sessiecookie met een geldige sitesleutel, 401 zonder, en 304 bij een matchende ETag
- **`curl` op de publieke endpoints bevat nergens de string `x_studio_webinar_link` of de waarde van de online link** — test dit met een event dat een zoom-link heeft
- `/events` (v1) werkt onveranderd

Lees ook `claude.md` voor de projectregels.
