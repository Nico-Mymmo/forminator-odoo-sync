# Plan — Supabase uitfaseren, naar Cloudflare D1

Besluit van Nico, 2026-10-16: "ik wil Supabase uitfaseren." Dit document is de
kaart voor die verhuis; elke stap verwijst hiernaar en vinkt zijn deel af.

## Wat er vandaag op Supabase steunt (gemeten 2026-10-16)

- **Enkel als databank.** Geen Supabase Auth (inloggen is eigen code,
  `src/lib/auth/`), geen Storage (bestanden staan in R2), geen Realtime, geen
  extensies buiten `pgcrypto`. Dat maakt de verhuis haalbaar.
- **126 tabellen** over **200 migraties**, gebruikt vanuit **77 bestanden** in
  `src/` (ongeveer 30 modules + `lib/auth`). De browser praat nooit
  rechtstreeks met Supabase; alles gaat via de Worker en `getSupabaseClient(env)`.
- **Ongeveer 500 query's** via de supabase-js query builder: vooral
  `select/eq/order/limit/single/maybeSingle/insert/update/upsert/delete/in`,
  weinig `gte/lt/is/not/or/ilike/contains/range`.
- **8 geneste selects** (joins via PostgREST-syntax, bv.
  `tag:fs_v2_tags(id, name, color)`): `forminator-sync-v2/database.js`,
  `sales-insight-explorer/routes.js`, `mini-apps/lib/favorites.js`,
  `cx_powerboard`. Die worden met de hand herschreven.
- **4 database-functies via `.rpc()`**: `upsert_endpoint_log`,
  `fs_v2_rr_next_user`, `fs_v2_rr_next_pool_member`, `fs_v2_pdf_next_sequence`
  (tellers die atomair moeten zijn). Plus 13 SQL-functies en 23 triggers in
  de migraties (meestal `updated_at`).
- D1 is al in gebruik: `SALES_DB` (om-sales, de OM schrijft) en `WEB_EVENTS`
  (enkel lezen).

## Aanpak

### 1. Fundament (eerst, eenmalig)

- Nieuwe D1-databank **`om-core`**, binding `CORE_DB`, migraties in
  `d1/om-core/migrations/`. Eén databank voor alles wat nu op Supabase staat
  (limiet 10 GB; een aparte databank enkel als een module dat nodig heeft,
  bv. de indieningen als die groot blijken).
- **`src/lib/core-db.js`: een kleine vertaallaag** met dezelfde vorm als de
  supabase-js query builder voor het deel dat we gebruiken
  (`from().select().eq()...`, `{ data, error }` als antwoord). Zo verandert per
  module bijna alleen `getSupabaseClient(env)` → `getCoreDb(env)`, en blijven
  de ~500 query's zoals ze zijn. Wat de laag niet kent, gooit een duidelijke
  fout in plaats van stil iets anders te doen.
- Omzettingsregels Postgres → SQLite, vastgelegd in de laag en de migraties:
  - `uuid` → `TEXT`, nieuwe id's met `crypto.randomUUID()` in de laag.
  - `timestamptz` → `TEXT` in ISO-8601 UTC (sorteert correct als tekst).
  - `jsonb` → `TEXT`; de laag parset/serialiseert per kolom (lijst van
    JSON-kolommen per tabel in de laag). `.contains()` → `json_each`.
  - `boolean` → `INTEGER 0/1`, terug als `true/false` uit de laag.
  - `ilike` → `LIKE` (SQLite is al hoofdletterongevoelig voor ASCII).
  - Triggers `updated_at` → de laag zet `updated_at` bij `update/upsert`.
  - `.rpc()`-tellers → één `UPDATE ... RETURNING` (atomair in D1).
  - RLS valt weg: D1 is alleen bereikbaar via de Worker-binding.
- **Gegevens kopiëren zonder dat iemand iets hoeft te draaien:** een
  beheerdersroute (`requiresAdmin`) die per tabel in stukken van Supabase leest
  en in D1 schrijft, herstartbaar en met een telling ervoor/erna. De Worker
  heeft beide al bereikbaar. Na de verhuis gaat die route weer weg.

### 2. Per module verhuizen, klein → groot

Per module dezelfde vijf stappen:

1. Schema in `d1/om-core/migrations/` (vertaald, met dezelfde indexen).
2. Code naar `getCoreDb(env)`; joins en `.rpc()` met de hand.
3. Gegevens kopiëren via de beheerdersroute; tellingen vergelijken.
4. Live zetten. Supabase-tabellen blijven **ongemoeid** staan als terugval.
5. Na twee weken zonder problemen: tabellen in Supabase leegmaken/weg.

Volgorde (zelfstandig en klein eerst, wat alles raakt als laatste):

| Fase | Modules | Waarom hier |
|---|---|---|
| A — proef | `endpoint_log`, product-features, av-slides, booking-links, odoo-controle | klein, op zichzelf, bewijst de laag |
| B | newsletters, content-feed, campaign-funnels, mail-signature-designer, asset-manager, wp-form-schemas, web-story, event-operations(-v2) | middelgroot, weinig verbanden |
| C | mini-apps, dashboards, cx_powerboard, cx-automations, gmail-chatter, claude-integration, sales-insight-explorer, project-generator | meer joins/verbanden |
| D | **forminator-sync-v2 (koppelingen)** | het belangrijkste en drukste pad; zie hieronder |
| E | **gebruikers, sessies, modules, rechten** (`lib/auth`, admin, profile, home) | alles hangt hiervan af: als laatste, in één keer |
| F | Supabase-secrets weg, `@supabase/supabase-js` uit `package.json`, `database.js` weg, CLAUDE.md bijwerken | opruimen |

### Koppelingen (fase D) — extra voorzichtig

- Een indiening die verloren gaat, is een aanvraag die niet in Odoo komt.
  Daarom: eerst **dubbel schrijven** (Supabase én D1) gedurende een week,
  lezen blijft op Supabase; dan lezen omzetten naar D1; dan pas Supabase los.
- Tabellen: `fs_v2_submissions`, `fs_v2_submission_targets`,
  `fs_v2_mail_events` plus de ~20 configuratietabellen (`fs_v2_integrations`,
  `_targets`, `_mappings`, `_forms`, ...).
- Ook andere modules lezen `fs_v2_submissions`:
  `dashboards/lib/aanvragen-kaart.js`, `web-story/lib/conversion-catchup.js`,
  `forms/bot-rejections.js`. Die gaan mee in dezelfde stap.
- Meteen een **bewaartermijn** afspreken voor indieningen (vandaag: voor
  altijd); dat houdt de databank klein en is beter voor de privacy.

## Open punten

- Hoeveel gegevens staan er nu in Supabase (vooral `fs_v2_submissions`)? Te
  meten met de eerste versie van de kopieerroute (enkel tellen).
- Bewaartermijn voor indieningen en mail-events: voorstel 2 jaar.
- Wie handmatig in Supabase iets rechtzette (bv. 2FA-noodreset in CLAUDE.md),
  doet dat straks in de D1-console van Cloudflare. Die instructies mee
  aanpassen in fase E.

## Voortgang

- [x] Fundament, deel 1 (2026-10-16, live): binding `CORE_DB` (`om-core`,
      id `c4ff79bd-...`; de deploy maakte de databank aan maar schreef het id
      NIET terug in `wrangler.jsonc` -- met de hand gezet), `src/lib/core-db.js` met
      46 controles in `src/lib/tests/core-db-test.mjs`, migratie `0001_init.sql`
      (logboek van de verhuis, toegepast op remote), regel in CLAUDE.md.
- [ ] Fundament, deel 2: de kopieerroute (bij de eerste module van fase A)
- [ ] Fase A
- [ ] Fase B
- [ ] Fase C
- [ ] Fase D (koppelingen)
- [ ] Fase E (gebruikers en inloggen)
- [ ] Fase F (opruimen)
