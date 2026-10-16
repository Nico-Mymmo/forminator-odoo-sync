# Schouwing van alle onderdelen (2026-10-16)

Per onderdeel: leeft het nog, welke tabellen (en welke ongebruikt), wat niet
1-op-1 naar D1 gaat, wat beter kan, en de omvang van de verhuis (S/M/L).
Verzameld bij de start van de Supabase-verhuis; het werkbord met de volgorde
staat in [`plan-supabase-uitfaseren.md`](plan-supabase-uitfaseren.md).

Regelnummers zijn die van 2026-10-16; ze verschuiven. Git zegt weinig over de
leeftijd: de geschiedenis begint op 2026-10-06 met één grote import-commit.

**Werk je een punt af, schrap het hier dan en noteer het in het logboek van
het werkbord.**

---

## Overzicht

| Onderdeel | Leeft? | Tabellen (ongebruikt) | Omvang | Belangrijkste punt |
|---|---|---|---|---|
| admin | ja | 3 (0) | M | modules toewijzen wist `user_modules.permissions` |
| home | ja | 1 (0) | S | `department_id` mee in de sessie-query |
| profile | ja, half legacy | 0 eigen | S | `ui.js` naar `public/` |
| lib/auth + login | ja, kern | 5 (4 + kolom `sessions.token`) | L | ~8 databankrondes en een schrijfactie per aanvraag |
| endpoint-tracker | ja | 1 (enkel geschreven) | S | schrijfactie per aanvraag; weg of Analytics Engine |
| asset-manager | ja, legacy UI | 2 (0) | S | mappenlijst scant tot 20.000 R2-objecten per klik |
| av-slides | ja | 1 (0) | S | regex-CHECK naar de code; upload in gedeelde map beperken |
| booking-links | ja | 1 (0) | S | `odoo_user_name` veroudert; `odoo_uid` in de sessie |
| campaign-funnels | ja, weinig gebruikt? | 3 (0) | S | geen eigenaarscontrole; eerst tellen, misschien schrappen |
| content-feed | ja | 0 eigen | S | hangt via mini-apps aan fase C |
| mail-signature-designer | ja, legacy UI | 7 (1) | M | push-lus 5× gekopieerd; client op oude routes |
| wp-form-schemas | half dood | 2 (2) | schrappen | hele module weg |
| xpath-converter | ja | 0 | – | `requiresAdmin` zetten |
| web-conversions (lib) | ja | 0 eigen | S | gaat mee met koppelingen |
| claude-integration | half dood | 5 (0) | S | beslissen; `client_secret` uit de URL |
| cx-automations | ja | 3 (0) | S | Odoo-patch-routes zonder admin-check |
| cx_powerboard | ja, legacy UI | 9 (2) | M | 2 dode tabellen; 6 geneste selects |
| dashboards | ja | 5 (0) + leest fs_v2 | M | `dashboard_targets` op 3 plaatsen; kaart telt 50.000 rijen in JS |
| event-operations v1 | vervangen door v2 | 4 (1) | schrappen | v2 importeert nog 3 helpers uit v1 |
| event-operations-v2 | ja | 0 | – | loskoppelen van v1 |
| gmail-chatter | code ja, draait als `GMAIL_CHATTER_USERS` gezet is | 4 (0) | S | werklijst groeperen in SQL |
| mini-apps | ja, intensief | 13 (0) | L | 5 logtabellen zonder bewaartermijn; `uuid[]` in `.or()` |
| newsletters | ja | 6 (0) | M | 4 array-kolommen; pool filteren in de query |
| odoo-controle | ja, nieuw | 5 (0) | S | koppelingen herschrijven niet atomair; race op het casenummer |
| product-features | ja, verhuis bezig | 1 (0) | S | `herorden` als één batch |
| project-generator | twijfel | 2 (0) | S | route in DB ≠ code; gebruik nagaan |
| sales-insight-explorer | ja als API voor mini-apps | 7 (0) | M | debugroute `test/phase0` zonder admin-check |
| web-story (lib) | als bibliotheek van dashboards | 1 (0) | S | `lib/` naar `dashboards/lib` |
| **koppelingen** (forminator-sync-v2) | ja, kritisch | 23 (0) | L | retries starten nooit vanzelf; dubbele webhooks herkend op Postgres-tekst |

---

## Fouten en beveiliging die nu al spelen (los van de verhuis)

- **Koppelingen: mislukte inzendingen worden nooit opnieuw geprobeerd.**
  `processDueRetries` (`forminator-sync-v2/worker-handler.js:3122`) is enkel
  bereikbaar via `POST /api/retries/run-due` (`routes.js:2774`); niets roept
  die aan (geen cron in `scheduled()`, geen knop). Nagaan of er een externe
  cron bestaat.
- **Beheer wist rechten per module.** `handleUpdateUserModules`
  (`admin/routes.js:445-470`) en `handleUpdateModuleUsers` (`:965-990`)
  wissen alle `user_modules` en zetten ze terug zonder `permissions` en
  `granted_by`. Niet in een transactie.
- **Routes zonder beheerderscontrole:**
  - cx-automations: acht "patch"-routes die Odoo aanpassen
    (`disable-sanitize` op `routes.js:999-1046` zet `sanitize=false` op
    HTML-velden; ook `:754`, `:1062`). Iedereen met de module kan ze aanroepen.
  - sales-insight-explorer: `GET /api/sales-insights/test/phase0`
    (`routes.js:2770`, handler `:1273`).
  - xpath-converter: `get_views` leest de arch van elk Odoo-model (alleen-lezen).
  - av-slides: `PUT /api/thingies/:name` schrijft in de gedeelde brand-map in R2 (`routes.js:226-240`).
  - campaign-funnels: geen eigenaarscontrole op funnels, swimlanes, kaarten (`routes.js:124,175,354`).
- **Lekken:** `stack: err.stack` en `details: error` in foutantwoorden van
  Beheer (`admin/routes.js:93,39,255`); Claude-`client_secret` als
  query-parameter (`claude-integration/routes.js:309-320`,
  `claude-settings.html:770`); `wp_sites.api_secret` in klare tekst met
  `requiresAdmin: false`.
- **Lijst van koppelingen klopt niet bij veel inzendingen.**
  `database.js:76-80` haalt alle inzendingen op voor `last_submission_at`;
  PostgREST kapt stil af op 1000 rijen, dus minder recente koppelingen
  krijgen `null`. Idem de sparkline (`:92-96`, `:113-117`).
- **Bulkimport ziet oudere duplicaten niet** (`routes.js:2105`: 5000 gevraagd,
  1000 gekregen).

## Groeit zonder grens (voor de bewaartermijnen, later)

`fs_v2_submissions`, `fs_v2_submission_targets`, `fs_v2_mail_events` (elke
heropening + ruwe payload), `fs_v2_tracker_hits`, `fs_v2_generated_documents`,
`fs_v2_mail_attachment_cache`, `claude_audit_log` (+ verlopen tokens en
challenges), `flag_run_log` (~35.000/jaar), `signature_push_log`,
`newsletter_activity`, `mini_app_ai_calls`, `mini_app_chat_log`,
`mini_app_scheduled_task_log`, `mini_app_condition_task_log`,
`mini_app_notifications`, `endpoint_log`. Enkel `fs_v2_bot_rejections` (30
dagen) en gmail-chatter hebben een opruiming.

---

## Per onderdeel

### admin
- Tabellen: `modules`, `user_modules`, `module_departments`. Leest ook users,
  sessions, auth_events, auth_challenges, mini_app_user_settings.
- Ongebruikte kolommen: `modules.is_default`, `user_modules.granted_at`.
- D1: upserts op `user_id,module_id`, `.in()`; geen geneste selects.
- Beter: de rechtenfout hierboven; rollen → modules hard gecodeerd en
  gekopieerd uit migraties (`routes.js:262-296`).

### home
- Tabel: `user_module_favorites`; leest `module_departments`, `modules`
  (`lib/module-layout.js:32-41`).
- Beter: `REMOVED_MODULES = ['forminator_sync']` (`api-module.js:25`) wijst op
  verweesde rijen; `reorderFavorites` één update per id; `department_id` mee
  in de join van `session.js:150`.

### profile
- `/profile` is nog legacy `ui.js` (laadt tailwind/lucide `@latest`);
  `/profile/beveiliging` is `public/account-security.html`.
- `handleChangePassword` (`routes.js:95-200`) ≈ `handleLoginPassword`
  (`api/auth-login.js:308-345`): één helper.

### lib/auth + api/auth-login.js (fase E)
- In gebruik: `users`, `sessions`, `auth_challenges`,
  `user_mfa_recovery_codes`, `auth_events`, `user_modules` (+ `modules`).
- **Weg:** `invites` (+ `invite.js`, 236 r., tokens in klare tekst), `roles`,
  `user_roles`, `user_profiles`, kolom `sessions.token`.
- D1: geneste `user:users!inner(...)` (`session.js:97-114`),
  `module:modules!inner(...)` met filter en order op de geneste tabel
  (`:145-163`), `.or()` met e-mail tussen aanhalingstekens (`events.js:194`),
  replay-bescherming als voorwaardelijke update (`mfa.js:55-57` →
  `UPDATE … RETURNING`), `auth_events.id` identity → `INTEGER PRIMARY KEY`,
  `ip_address INET` → `TEXT`.
- Beter: ~8 databankrondes per aanvraag en een schrijfactie bij ELKE aanvraag
  (`session.js:199`, terwijl `:36-37` "hoogstens één per dag" belooft);
  `requireModule` is fout (`middleware.js:155`) en ongebruikt, net als
  `requireRole`, `optionalAuth`; `extractToken` ≈ `extractSessionToken`.

### endpoint-tracker
- `endpoint_log` + `.rpc('upsert_endpoint_log')`; enkel geschreven, bij elke
  module-aanvraag. Weg, of Workers Analytics Engine.

### asset-manager
- Tabellen: `asset_manager_categories`, `asset_manager_folder_brands`
  (bestanden in R2). Legacy `ui.js`.
- Beter: `GET /api/assets/folders` leest tot 20×1000 R2-objecten per root bij
  elke klik (`routes.js:346-357`); een map bestaat zowel als rij als
  `.keep`-bestand (`:618-653`).

### av-slides
- Tabel: `av_slide_editions` (`content` jsonb). CHECK met regex `~`: naar de
  code (`geldigeMaand` doet het al, `lib/editions.js:26`).

### booking-links
- Tabel: `booking_links`; ook gebruikt door koppelingen en dashboards.
- D1: `.or()` (`lib/links.js:174-181`); regex- en `jsonb_typeof`-CHECK's naar
  de code; foutherkenning op constraintnamen (`links.js:248-256`).
- Beter: `odoo_user_name` kopie van Odoo; `resolveOdooUser` per aanvraag
  (`links.js:139-157`); cx_powerboard zoekt `odoo_uid` op een eigen manier.

### campaign-funnels
- Tabellen: `campaign_funnels`, `campaign_swimlanes`, `campaign_cards`.
- Beter: geen eigenaarscontrole; `confirmGroupsHandler` zonder transactie
  (`routes.js:242-290`). Eerst rijen tellen.

### content-feed
- Geen eigen tabellen (Odoo + KV). Onrechtstreeks `mini_app_ai_calls`,
  `mini_app_chat_*` via mini-apps → verhuist mee met fase C.
- `.ilike('email', …)` zonder escape (`lib/chat-inbox.js:112`) → `.eq(lower)`.

### mail-signature-designer
- 7 tabellen, **`signature_config` ongebruikt** (`lib/signature-store.js:35-75`
  geïmporteerd, nooit aangeroepen).
- D1: 5 `updated_at`-triggers; alles wissen met `.neq('email','')` en opnieuw
  inserten zonder transactie (`:387-396`, `:593-608`).
- Beter: push-lus 5× gekopieerd (`routes.js:419-436, 990-1000, 1046-1056,
  1317-1327, 1353-1363`); client gebruikt nog `/api/config` en `/api/push`.

### wp-form-schemas — schrappen
- Geen seed in `modules`, geen UI, niemand roept `/wp-sites` aan. `wp_sites`
  en `wp_form_schemas` enkel hier. `wp_connections` (koppelingen,
  event-operations) bewaart dezelfde gegevens.

### xpath-converter
- Geen tabellen. `requiresAdmin` past beter.

### web-conversions (lib)
- Leest `fs_v2_integrations`, `fs_v2_forms`; terugval op `TRACKER_PUBLIC`
  werkt nooit vanuit een Worker (`:19-23`).

### claude-integration
- 5 tabellen, alle in gebruik. `scopes TEXT[]`, `model_config` jsonb.
- Half dood: `GET /` stuurt naar `/insights/claude` dat niet bestaat
  (`routes.js:616`); `claude-settings.html` nergens gelinkt.
- Beter: `client_secret` in de URL; `context-builder.js:119-132,166` haalt
  volledige Odoo-modellen op (`limit: false`).

### cx-automations
- Tabellen: `flag_thresholds`, `flag_run_log`, `cx_settings`. Cron elke 15 min.
- Beter: patch-routes (zie beveiliging); `flag_run_log` opruimen; één
  Odoo-write per actieblad (`cron.js:197,276`).

### cx_powerboard
- 9 tabellen; **`cx_seen_activities` ongebruikt**, **`cx_activity_daily_snapshot`
  enkel geschreven** (`routes.js:608-623`).
- D1: 6 geneste selects op `cx_activity_mapping` (`routes.js:143,159,414,743,1107`),
  embed `user:platform_user_id(...)` (`win-service.js:41`), samengestelde
  upserts, triggers.
- Beter: legacy `ui.js` (3052 r.); 23× `console.log` in `routes.js`.

### dashboards
- Eigen: `dashboard_settings`, `dashboard_targets`, `sales_exclusions`,
  `sales_planned_professionals`, `marketing_flow_views`. Verkoop staat al in
  D1 (`SALES_DB`). Leest `fs_v2_*` (kaart Aanvragen) → fase D.
- D1: JSON-pad in select `source_payload->form_data->>key`
  (`lib/aanvragen-kaart.js:143`) → `json_extract`.
- Beter: `dashboard_targets` op 3 plaatsen bevraagd (`lib/targets.js`,
  `lib/sales/settings.js`, `lib/sales/routes.js:92`); kaart haalt tot 50.000
  inzendingen per koppeling op (`aanvragen-kaart.js:145-158`) → `GROUP BY`.

### event-operations v1
- Inhoudelijk vervangen door v2, formeel "loopt naast" (`event-operations-v2/module.js:7`).
- v2 importeert uit v1: `legacy-wp-pages.js:22-23`, `registrations-service.js:44`.
- Tabellen: `webinar_snapshots` (kopie van Odoo/WP: cache, geen brondata),
  `event_type_wp_tag_mapping`, `forminator_forms`, **`webinar_tag_mappings`
  ongebruikt**.

### event-operations-v2
- Geen tabellen (KV), `getSupabaseClient` bewust verboden. Enkel de drie
  v1-imports intern maken.

### gmail-chatter
- 4 tabellen, nette bewaartermijn per status. Cron elke 5 min, doet niets
  zonder `GMAIL_CHATTER_USERS` (nagaan of die secret gezet is).
- Beter: `werklijstPerContact` groepeert 1000 rijen in JS (`store.js:310-346`).

### mini-apps (fase C)
- 13 tabellen, alle in gebruik; 123 `.from()`-aanroepen.
- D1: `shared_user_ids UUID[]` + `.or()` met `cs.{…}` (`routes.js:530`) →
  `json_each` (core-db kent `cs`); geneste `mini_apps(…)` (`lib/favorites.js:33`);
  `count: 'exact'` als AI-ratelimit (`ai.js:191,210`).
- Beter: 5 logtabellen zonder bewaartermijn; `permissions_test_copy.js` dood;
  `routes.js` 2405 r.

### newsletters
- 6 tabellen; `newsletter_series` ook gelezen door koppelingen.
- D1: `odoo_list_ids INTEGER[]`, `editor_user_ids UUID[]`,
  `test_mailing_ids INTEGER[]`, `series_ids UUID[]` (enkel in JS gefilterd);
  atomaire claim `.is('odoo_mailing_id', null)` (`store.js:279-285`).
- Beter: `createSeries` dood (`store.js:116`); suggesties halen de hele pool op
  (`routes.js:727-732`).

### odoo-controle
- 5 tabellen; `refs` jsonb; geen triggers.
- Beter: delete + insert van koppelingen zonder transactie (`store.js:230-233`)
  → `batch()`; `max(nr)+1` race (`store.js:258-260`).

### product-features
- Verhuis bezig (`dbVoor`). `herorden` één update per id (`store.js:150-157`).

### project-generator
- 2 tabellen. Seed zet route `/project-generator`, code gebruikt `/projects`:
  de link in navbar/home loopt waarschijnlijk dood.
- Beter: taken één voor één aangemaakt (`generate.js:458-476`).

### sales-insight-explorer (fase C, samen met mini-apps)
- 7 tabellen. Mini-apps gebruikt `lib/mini-app-bridge.js`, `mini-app-discovery.js`.
- D1: `module:modules!inner(code)` + filter (`routes.js:1726-1727`).
- Beter: debugroute; tabel `models` dubbel met `fs_v2_odoo_models`;
  `public/semantic-wizard.js.bak`; `routes.js` 2795 r.

### web-story (lib)
- Niet meer geregistreerd; leeft als bibliotheek van dashboards (cron,
  marketing, av-slides). Tabel `web_story_exclusions`.
- Beter: `src/modules/web-story/lib` → `src/modules/dashboards/lib/web-story/`.

### koppelingen — forminator-sync-v2 (fase D)

**Tabellen (23, alle in gebruik).**
- Configuratie: integrations, targets, mappings, resolvers, field_transforms,
  odoo_models, model_links, forms, form_fields, folders, tags,
  integration_tags, favorites, pdf_templates, bedrijf_profielen,
  calendly_subscriptions, mail_attachment_cache. Ook `wp_connections`,
  `newsletter_series`, `users`.
- Hoog volume: submissions, submission_targets, mail_events, tracker_hits,
  generated_documents, bot_rejections (30 dagen).
- Ongebruikte exports: `listReplaySubmissionsByOriginalSubmissionId`
  (`database.js:882`), `listTagsForIntegration` (`:1596`), export van
  `generateTrackerSlug`.

**Andere lezers:** `lib/web-conversions.js:99,104`,
`dashboards/lib/aanvragen-kaart.js:79-147`,
`web-story/lib/conversion-catchup.js:44-52` (limit 5000 met hele payload),
`newsletters/lib/answers.js:242`, `newsletters/routes.js:951,1453`,
`router/public-routes.js:51` (webhooks, tracker).

**Niet 1-op-1 naar D1:**
- Geneste selects `tag:fs_v2_tags(...)` (`database.js:63,1600`); JSON-pad-selects
  (`aanvragen-kaart.js:143`, `forms/bot-rejections.js:221`).
- 3 `.rpc()`: `fs_v2_rr_next_user`, `fs_v2_rr_next_pool_member` (round-robin:
  `pool[idx % len]`, dan `idx+1`), `fs_v2_pdf_next_sequence` (offertenummer).
  Worden `UPDATE … RETURNING`; let op: RETURNING geeft de NIEUWE index.
  Offertenummers moeten uniek blijven: goed testen.
- **`isUniqueViolationError` (`worker-handler.js:1290-1293`) kijkt naar de
  Postgres-tekst `duplicate key value`.** Op D1 luidt de fout anders → dubbele
  webhooks geven een 500 i.p.v. `duplicate_ignored`. Omzetten naar code
  `23505` (core-db vertaalt dat al). Kan nu al.
- CHECK `languages @> to_jsonb(default_language)` → `json_each`.
- Geen transacties: `deleteIntegration` (handmatige cascade terwijl FK's al
  cascaden), `deleteSubmission`, `cleanupFailedReplays`, formuliervelden en
  field_transforms (delete + insert, `forms/database.js:262-297, 347-378`),
  `upsertModelLinks`. In D1: `batch()`.
- Rijgrootte D1 ~2 MB: let op grote `source_payload`/`resolved_context`.

**Beter:**
1. Lijst van koppelingen: één aggregatiequery (`GROUP BY integration_id,
   date(created_at)`, `MAX(created_at)`) i.p.v. alle inzendingen.
2. Mappings twee keer per stap geladen (N+1): `database.js:1100-1103` en
   `worker-handler.js:1521`.
3. Indieningen: max 50 zichtbaar, geen paginering; `mail-events-summary` haalt
   wel alle events op (`routes.js:2617`).
4. Bulkimport-duplicaten op `payload_hash` met index i.p.v. 5000 rijen.
5. Dode code: `ui.js` (482 r.), legacy wizard (304 r., mojibake), mojibake in
   enkele `public/forminator-sync-v2-*.js`.
6. Grote bestanden: `routes.js` 3206, `worker-handler.js` 3172,
   `-detail-mapping-tab.js` 2479, `-bootstrap.js` 2362, `database.js` 1605.
   Splitsen per domein maakt ook de verhuis per deel testbaar.
7. `fs_v2_mail_events` bewaart elke heropening + payload terwijl Odoo de stand
   al heeft; enkel eerste event per soort, of korte termijn.
8. Retry-cron (zie fouten) + purge-cron naar het voorbeeld van
   `purgeOldBotRejections`.

**Volgorde binnen fase D:** (1) voorbereiden op Supabase (23505, selects,
aggregatie, batches); (2) configuratietabellen als één blok + de 3 RPC's;
(3) hoog volume met een week dubbel schrijven, samen met de andere lezers;
(4) lezen omzetten, Supabase twee weken als terugval. Inschatting 11–16
werkdagen + een observatieweek.
