# Werkbord — Supabase uitfaseren en de OM opruimen

Besluit van Nico, 2026-10-16: "ik wil Supabase uitfaseren", en daarbij per
onderdeel bekijken of alles nog nodig is en wat beter kan.

**Dit document is de bron van waarheid voor de voortgang.** Vraagt Nico
"waar focussen we vandaag?", dan lees je dit werkbord en stel je de bovenste
open stap voor (met in een zin waarom die eerst komt). Na elke afgewerkte
stap werk je het werkbord en het logboek onderaan bij, in dezelfde commit.

- De bevindingen per onderdeel (wat leeft, wat weg kan, wat beter kan, met
  bestand:regel): [`docs/schouwing-modules.md`](schouwing-modules.md).
- Hoe de verhuis technisch werkt: hoofdstuk "Aanpak" hieronder.

---

## Volgende stappen (van boven naar beneden afwerken)

Een stap is klaar als hij live staat, niet als de code af is.

| # | Stap | Soort | Status |
|---|---|---|---|
| 1 | **Productfeatures live zetten en verhuizen** — migratie `0002` toepassen, deploy, dan Beheer → Verhuis: Kopiëren → Overschakelen. Eerste echte proef van de aanpak. | verhuis | code klaar, wacht op deploy |
| 2 | **Mislukte indieningen worden nooit opnieuw geprobeerd** — `processDueRetries` heeft geen aanroeper (geen cron, geen knop). Eerst nagaan of er buiten de repo iets `POST /forminator-v2/api/retries/run-due` aanroept; zo niet, in `scheduled()` hangen. | fout, dringend | open |
| 3 | **Beheer wist rechten per module** — modules toewijzen doet delete + insert zonder `permissions` (bv. Sales Insight-beheerder valt weg), `admin/routes.js:445-470` en `:965-990`. Omzetten naar toevoegen/verwijderen van het verschil. | fout | open |
| 4 | **Routes zonder beheerderscontrole dichtzetten** — cx-automations "patch"-routes die Odoo aanpassen (o.a. `disable-sanitize`), sales-insight `test/phase0`, `err.stack` in foutantwoorden van Beheer, Claude-`client_secret` in de URL. | beveiliging | open |
| 5 | **Opruimronde 1: wat zeker weg kan** (zie "Te schrappen", kolom "zeker"). Minder om te verhuizen, minder om te onderhouden. | opruimen | open |
| 6 | **Beslissingen van Nico** over twijfelgevallen (zie "Te beslissen"). | beslissing | open |
| 7 | **Fase A afwerken**: odoo-controle, av-slides, booking-links, asset-manager, gmail-chatter, cx-automations, web-story-uitsluitingen. | verhuis | open |
| 8 | **Koppelingen voorbereiden op Supabase** (nog vóór hun verhuis, laag risico): dubbele webhooks herkennen op code `23505` i.p.v. op Postgres-tekst (`worker-handler.js:1290`), geneste en JSON-pad-selects herschrijven, lijst van koppelingen met een optelling i.p.v. alle inzendingen ophalen. | voorbereiding | open |
| 9 | Fase B, C, D, E, F (zie "Fases"). | verhuis | open |

Later te bespreken (bewust uitgesteld door Nico): **bewaartermijnen** voor
alles wat onbeperkt groeit (lijst in de schouwing, "Groeit zonder grens").

---

## Te schrappen in plaats van te verhuizen

| Wat | Waarom | Zeker / na beslissing |
|---|---|---|
| module **wp-form-schemas** + tabellen `wp_sites`, `wp_form_schemas` | geen UI, niemand roept het aan, CLAUDE.md zegt al: opruimen na de OM-formulieren; `api_secret` in klare tekst | zeker |
| `invites`, `roles`, `user_roles`, `user_profiles` + `src/lib/auth/invite.js` | overblijfsels van Supabase Auth, nergens gebruikt | zeker |
| kolom `sessions.token` | token in klare tekst, sinds 2FA niet meer gebruikt | zeker |
| `signature_config` (+ oude `/api/config`, `/api/push` na omzetten client) | vervangen door `marketing_signature_settings` | zeker (client eerst omzetten) |
| `cx_seen_activities`, `cx_activity_daily_snapshot` | niet meer gebruikt / enkel geschreven | zeker |
| `webinar_tag_mappings` | 0 verwijzingen | zeker |
| `src/modules/forminator-sync-v2/ui.js` (482 r.) | volledig uitgeschakeld | zeker |
| `mini-apps/.../permissions_test_copy.js`, `public/semantic-wizard.js.bak`, `newsletters createSeries`, ongebruikte functies in `lib/auth/middleware.js` | dode code | zeker |
| **event-operations v1** + `webinar_snapshots`, `event_type_wp_tag_mapping`, `forminator_forms` | vervangen door Eventbeheer v2; eerst drie helpers naar v2 verhuizen | na beslissing |
| **claude-integration** + 5 `claude_*`-tabellen | de pagina is nergens gelinkt, de doorverwijzing loopt dood | na beslissing |
| **project-generator** + 2 tabellen | route in de databank klopt niet met de code: waarschijnlijk ongebruikt | na beslissing |
| **campaign-funnels** + 3 tabellen | vermoedelijk weinig gebruikt; eerst rijen tellen | na beslissing |
| `endpoint_log` | wordt enkel geschreven, bij elke aanvraag; niemand leest het in de OM | na beslissing |
| koppelingen: legacy wizard (`forminator-sync-v2-wizard.js`) | nog bereikbaar via een knop | na beslissing |

## Te beslissen (Nico)

1. **Eventbeheer v1** weg zodra v2 op zichzelf staat? (aanbevolen: ja)
2. **Claude-integratie** (`/api/claude`, instellingen op `/claude-settings.html`): nog nodig?
3. **Projectgenerator** (`/projects`): nog gebruikt?
4. **Campagnefunnels** (`/campaigns`): nog gebruikt?
5. **Endpoint-log**: bekijkt iemand dat in Supabase? Zo niet: weg.
6. **Oude wizard** bij koppelingen: weg?
7. Bewaartermijnen (later).

---

## Fases van de verhuis

Bijgewerkt na de schouwing van 2026-10-16: onderdelen die van elkaar
afhangen, verhuizen samen.

| Fase | Onderdelen | Omvang | Status |
|---|---|---|---|
| A | product-features (bezig), odoo-controle, av-slides, booking-links, asset-manager, gmail-chatter, cx-automations, web-story-uitsluitingen | klein, op zichzelf | 1/8 klaar in code |
| B | newsletters, mail-signature-designer, dashboards (eigen tabellen), cx_powerboard, + wat na de beslissingen overblijft (campaign-funnels, project-generator, claude-integration) | middel | open |
| C | mini-apps + sales-insight-explorer samen (13 + 7 tabellen; content-feed hangt eraan) | groot | open |
| D | koppelingen (23 tabellen) + wie hun inzendingen leest: kaart Aanvragen, web-story `conversion-catchup`, `web-conversions`, nieuwsbrieven-antwoorden | groot, kritisch | open |
| E | gebruikers, sessies, modules, rechten: `lib/auth`, admin, home, profile | groot, alles hangt eraan | open |
| F | Supabase-secrets, `@supabase/supabase-js`, `database.js` weg; CLAUDE.md bijwerken | klein | open |

Inschatting koppelingen (fase D): ongeveer 11–16 werkdagen plus een week
observeren. Fase E: groot, omdat elke aanvraag erlangs komt (vandaag zo'n 8
databankrondes per aanvraag, waaronder een schrijfactie bij ELKE aanvraag in
`session.js:199` — dat moet eerst omlaag, D1 heeft één schrijver).

---

## Aanpak

### Het fundament (live sinds 2026-10-16)

- D1-databank **`om-core`**, binding `CORE_DB`, migraties in
  `d1/om-core/migrations/` (toepassen: `npx wrangler d1 migrations apply om-core --remote`).
- **`src/lib/core-db.js`**: dezelfde querytaal als de Supabase-client
  (`from().select().eq()...`, `{ data, error }`). Per module verandert vooral
  `getSupabaseClient(env)` → `getCoreDb(env)`. Wat de laag niet kent, geeft
  `CORE_DB_UNSUPPORTED`. Tests: `node src/lib/tests/core-db-test.mjs`.
- Omzettingen Postgres → SQLite (type-afspraken bovenaan `0001_init.sql`):
  uuid → `TEXT` (id gemaakt door de laag), timestamptz → `TIMESTAMPTZ`
  (altijd ISO met `Z`), jsonb en arrays → `JSON_TEXT`, boolean → `BOOLEAN`,
  `updated_at`-triggers → de laag zet het, `.rpc()` → functie in `RPC` van
  core-db, RLS valt weg. Lange `in()`-lijsten gaan als een JSON-parameter
  (D1 aanvaardt maar 100 parameters per statement).

### Per tabel: Beheer → Verhuis (`src/lib/verhuis.js`)

1. **Schouwing**: wat weg kan, verhuist niet (zie de schouwing).
2. Schema in `d1/om-core/migrations/`.
3. Opslagcode: `getSupabaseClient(env)` → `await dbVoor(env, '<tabel>')`, en
   de tabel in `VERHUISBAAR` zetten. Joins en `.rpc()` met de hand.
4. Deploy. Daarna in **Beheer → Verhuis**:
   - **Kopiëren** (mag herhaald worden, de module blijft op Supabase);
   - **Overschakelen** (enkel bij gelijke aantallen en laatste wijziging);
   - **Terugzetten** is de noodrem.
5. Twee weken zonder problemen: `dbVoor` → `getCoreDb`, tabel uit
   `VERHUISBAAR`, tabel in Supabase weg.

### Koppelingen (fase D): extra voorzichtig

Een inzending die verloren gaat, is een aanvraag die niet in Odoo komt.
Daarom daar een week **dubbel schrijven** (Supabase én om-core), lezen blijft
op Supabase; dan lezen omzetten; dan pas Supabase los. De grootste risico's
staan in de schouwing (idempotentie, tellers voor round-robin en
offertenummers, delete+insert zonder transactie).

Wie handmatig in Supabase iets rechtzette (bv. de 2FA-noodreset in
CLAUDE.md), doet dat straks in de D1-console van Cloudflare: die instructies
gaan mee in fase E.

---

## Logboek

- **2026-10-16** — Plan en inventaris (126 tabellen, ~500 query's, 77
  bestanden; Supabase enkel als databank).
- **2026-10-16** — Fundament live: `om-core` aangemaakt door de deploy (id met
  de hand in `wrangler.jsonc` gezet: wrangler schreef het niet terug),
  `0001_init.sql` toegepast, `core-db.js` + tests, regel in CLAUDE.md
  (nieuwe tabellen in om-core).
- **2026-10-16** — Beheer → Verhuis gebouwd (`verhuis.js`, 18 controles),
  productfeatures omgezet naar `dbVoor`, migratie `0002_product_features.sql`.
  Nog niet live.
- **2026-10-16** — Schouwing van alle onderdelen (drie rapporten), samengevat
  in `docs/schouwing-modules.md`; werkbord herschikt.
- **2026-10-19** — `product_features` kreeg een kolom `achtergrond`
  (achtergrondbouwer): Supabase `20261019140000` en om-core
  `0004_product_features_achtergrond.sql`. Allebei toepassen voor het
  kopieren, anders mist de kopie die kolom.
