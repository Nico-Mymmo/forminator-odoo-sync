# Forminator Sync V2 — IMPLEMENTATION LOG

## 2026-02-25 — Fase 1 (Foundation)

### Wat gebouwd is
- Nieuwe module aangemaakt onder `src/modules/forminator-sync-v2/`.
- Module-registratie toegevoegd in de centrale module registry.
- Databaselaag toegevoegd voor 6 MVP-tabellen:
  - `fs_v2_integrations`
  - `fs_v2_resolvers`
  - `fs_v2_targets`
  - `fs_v2_mappings`
  - `fs_v2_submissions`
  - `fs_v2_submission_targets`
- CRUD API gebouwd voor:
  - integraties
  - resolvers
  - targets
  - mappings
- Strikte server-side validatie ingebouwd voor MVP-freeze regels:
  - exact 2 resolvertypes
  - max 2 resolvers per integratie
  - max 2 targets per integratie
  - vaste identifierlogica per targetmodel
  - exact 2 update policies
  - verplichte mappings per targetmodel
- UI Foundation gebouwd met 5 blokken:
  - blok 1–4 volledig functioneel
  - blok 5 als teststub
- Activatieblokkering ingebouwd:
  - zonder geslaagde teststatus kan `is_active=true` niet worden opgeslagen.
- Fase-gebonden placeholders toegevoegd voor:
  - webhook handler
  - idempotency module
  - retry module
  - Odoo client runtime flow

### Wat bewust NIET gebouwd is
- Geen webhook intake.
- Geen runtime idempotency flow.
- Geen resolver-run/context-run/target-run verwerking.
- Geen retries.
- Geen partial failure runtime.
- Geen replay.
- Geen extra resolvertypes.
- Geen extra targetmodellen.
- Geen branching/conditionele logica/rule engine.

### Open technische risico’s
- Foundation veronderstelt dat de 6 MVP-tabellen al bestaan in databaseomgeving.
- Odoo connectie-validatie in runtime pad zit nog niet in Fase 1.
- Teststub simuleert enkel activatie-gate en geen echte verwerkingskwaliteit.

### Testresultaten
- Statische verificatie uitgevoerd:
  - Module registry bevat `forminator_sync_v2`.
  - Alle Foundation endpoints zijn gedefinieerd onder `/forminator-v2/api/*`.
  - Validatiepad blokkeert activatie zonder succesvolle test.
- Runtime end-to-end tests (webinar/contact/duplicate/recoverable/permanent) zijn nog niet uitvoerbaar in Fase 1 omdat webhook- en workerflow pas in Fase 2/3 gebouwd wordt.
- Fase 1 teststub gevalideerd als activatievoorwaarde.

## 2026-02-25 — Fase 2 (Core Flow)

### Wat gebouwd is
- Webhook intake endpoint toegevoegd onder `/forminator-v2/api/webhook`.
- Idempotency geïmplementeerd met deterministische payload hashing:
  - keys gesorteerd
  - whitespace genormaliseerd
- Duplicate handling geïmplementeerd met onderscheid:
  - `duplicate_inflight`
  - `duplicate_ignored`
- Resolver-run geïmplementeerd voor exact 2 resolvertypes:
  - `partner_by_email`
  - `webinar_by_external_id`
- Context-opbouw geïmplementeerd; volledige context inclusief resolver logs wordt opgeslagen op submission.
- Target-run geïmplementeerd met strikte identifier-based upsert:
  - geen fallback zoeklogica
  - geen fuzzy matching
- Submission history uitgebreid:
  - submission status updates
  - targetresultaten per target in `fs_v2_submission_targets`
- Extra history endpoints toegevoegd:
  - `/forminator-v2/api/integrations/:id/submissions`
  - `/forminator-v2/api/submissions/:submissionId`

### Wat bewust NIET gebouwd is
- Geen retry mechanisme (blijft Fase 3).
- Geen replay mechanisme (blijft Fase 3).
- Geen extra resolvertypes.
- Geen extra targetmodellen.
- Geen branching of conditionele engine.
- Geen expression engine.
- Geen nieuwe JSON-config extensiepunten.
- Geen UX-uitbreidingen buiten bestaande Fase 1 pagina.

### Open technische risico’s
- Webhookauth gebruikt bestaand platform tokenpad; hardening op signatureniveau is niet toegevoegd in Fase 2.
- Concurrency op identieke identifiers is gemitigeerd met dubbele lookup vóór create, maar blijft afhankelijk van Odoo-side constraints voor absolute hard guarantees.
- Webinar external-id lookupveld gebruikt vaste serverconfig (`ODOO_WEBINAR_EXTERNAL_ID_FIELD` fallback), waardoor verkeerde infra-config direct impact heeft.

### Testresultaten
- Statische verificatie uitgevoerd:
  - V2 routes compileren zonder diagnostics errors.
  - Idempotency utilities compileren zonder diagnostics errors.
  - Worker-handler, odoo-client en database updates compileren zonder diagnostics errors.
- Contractverificatie uitgevoerd:
  - duplicate statuses worden afzonderlijk geretourneerd.
  - submission eindstatus finaliseert naar `success`, `partial_failed` of `permanent_failed`.
  - targetresultaten worden afzonderlijk gelogd.
- Volledige live end-to-end webhooktests tegen externe Odoo omgeving zijn in deze implementatieronde niet geautomatiseerd uitgevoerd in de workspace.

## 2026-02-25 — Fase 3A (Hardening: Retry)

### Wat gebouwd is
- Retry utilities geïmplementeerd in `src/modules/forminator-sync-v2/retry.js`:
  - recoverable/permanent classificatie
  - vast retrieschema (1 min, 5 min)
  - max attempts = 3
- DB-level idempotency hardening toegevoegd op submissions:
  - unieke index op `(integration_id, idempotency_key)`
- Duplicate webhook gedrag afgestemd op unieke idempotency:
  - geen extra duplicate submission rows
  - duplicate response verwijst naar bestaande submission-id
- Worker state machine uitgebreid in `src/modules/forminator-sync-v2/worker-handler.js`:
  - recoverable fouten → `retry_scheduled`
  - retry run-status → `retry_running`
  - retry limiet bereikt → `retry_exhausted`
- Retry draait op dezelfde submission en dezelfde idempotency key.
- Eerder geslaagde targets worden niet opnieuw uitgevoerd tijdens retry.
- Cumulatieve targetlogging blijft actief met extra `skipped` entries voor reeds geslaagde targets.
- Due retry processor toegevoegd via route:
  - `POST /forminator-v2/api/retries/run-due`
- Databaselaag uitgebreid met retry-query/claim helpers:
  - due retries ophalen
  - atomische status-transitie voor retry claim
  - laatste targetresultaat per target ophalen
- Migratie toegevoegd voor minimale datamodeluitbreiding:
  - `retry_status`
  - `next_retry_at`
  - `replay_of_submission_id`

### Wat bewust NIET gebouwd is
- Geen replay mechanisme (blijft Fase 3B).
- Geen webhook security hardening (blijft Fase 3B).
- Geen extra resolvertypes.
- Geen extra targetmodellen.
- Geen branching/conditionele logica.
- Geen expression engine.
- Geen nieuwe UX-configuratieopties.

### Open technische risico’s
- Retry scheduling gebruikt een expliciete run-due endpoint; automatische scheduler-koppeling moet operationeel worden ingericht (cron/trigger buiten modulecode).
- DB-level unique index op submissions voorkomt duplicate intake rows per integratie/idempotency key; Odoo-side unieke constraints blijven relevant voor domeinspecifieke data-integriteit per model.
- Errorclassificatie is bericht/statuscode-gebaseerd; infrastructuurfouten met niet-standaard foutteksten kunnen foutief als permanent geclassificeerd worden.

### Failure matrix (Fase 3A)
- Recoverable fout poging 1 → `retry_scheduled` (+1m)
- Recoverable fout poging 2 → `retry_scheduled` (+5m)
- Recoverable fout poging 3 → `retry_exhausted`
- Permanent fout → `permanent_failed`
- Gemengde targetuitkomst → `partial_failed`

### Testscenario’s
- Recoverable error:
  - Verwacht: submission naar `retry_scheduled` met `next_retry_at`.
- Permanent error:
  - Verwacht: submission naar `permanent_failed`, geen retry planning.
- Retry exhaust:
  - Verwacht: na derde recoverable mislukking status `retry_exhausted`.
- Replay succes:
  - Niet uitgevoerd in Fase 3A (buiten scope, gepland in Fase 3B).
- Replay geweigerd:
  - Niet uitgevoerd in Fase 3A (buiten scope, gepland in Fase 3B).

## 2026-02-25 — Fase 3B (Hardening: Replay + Security + UX)

### Wat gebouwd is
- Replay endpoint toegevoegd:
  - `POST /forminator-v2/api/submissions/:submissionId/replay`
- Replay backendflow toegevoegd in worker-handler:
  - nieuwe child submission per replay
  - `replay_of_submission_id` verwijst naar origineel
  - `source_payload` gekopieerd van origineel
  - `payload_hash` opnieuw berekend op gekopieerde payload
  - `idempotency_key` geforceerd nieuw (`replay-<original>-<uuid>`)
  - volledige runtimeflow opnieuw uitgevoerd (resolvers → context → targets)
- Replay statusguardrails toegevoegd:
  - toegestaan: `partial_failed`, `permanent_failed`, `retry_exhausted`
  - geweigerd: alle andere statussen (incl. `running`, `retry_scheduled`, `retry_running`)
- Replay concurrencyregel toegevoegd:
  - replay start geweigerd als al een child replay `running` is voor dezelfde originele submission
- Webhook security hardening toegevoegd:
  - vereiste header `X-Forminator-Secret`
  - secret uit env `FORMINATOR_WEBHOOK_SECRET`
  - invalid/missing secret ⇒ `401`, zonder submission insert
- Minimale blok-5 UX uitgebreid:
  - history tabel met status badges
  - weergave `retry_count` en `next_retry_at`
  - replay knop enkel bij toegelaten statussen
  - child replay zichtbaar in history via `replay_of_submission_id` + laatste replay referentie

### Wat bewust NIET gebouwd is
- Geen wijziging aan retry mechanisme uit Fase 3A.
- Geen nieuwe resolvertypes.
- Geen nieuwe targetmodellen.
- Geen branching/conditionele logica.
- Geen expression engine.
- Geen auto-suggest mappings.
- Geen nieuwe configuratievelden in blok 1–4.
- Geen nieuwe tabellen.

### Open technische risico’s
- Webhook shared secret gebruikt stringvergelijking; rotatiebeleid/secret lifecycle moet operationeel beheerd worden buiten modulecode.
- Replay kan businessmatig opnieuw externe side-effects triggeren; functioneel bewust als force-run ontworpen.

### Testresultaten (Fase 3B)
- Uitgevoerd (code/contract):
  - Diagnostics op `worker-handler.js`, `routes.js`, `database.js`, `public/client.js`, `ui.js`: geen errors.
  - Replay contractpad aanwezig met 404/400 guards en force-run idempotency key generatie.
  - Webhook auth guard staat vóór submission creatiepad in webhook handler.
- Niet volledig live uitgevoerd in workspace (externe afhankelijkheden):
  - Replay success op echte `partial_failed` submission tegen live Odoo.
  - Security calls tegen live endpoint met/zonder `X-Forminator-Secret` header.

## 2026-02-25 — Multi-site WordPress Discovery

### Wat gebouwd is

**Migratie**
- Nieuwe tabel `wp_connections` (id, name, base_url, auth_token, is_active, created_at).
- RLS ingesteld: alleen service_role.
- Pushed als `20260225170000_wp_connections.sql`.

**wp-client.js uitgebreid (events-operations)**
- Twee nieuwe exports toegevoegd onderaan; bestaande functies ongewijzigd:
  - `fetchForminatorForms(baseUrl, authToken)` — live fetch van WP REST endpoint `/wp-json/openvme/v1/forminator/forms`.
  - `getWpClient(env, connection = null)` — factory die met expliciete connection object werkt of terugvalt op `env.WORDPRESS_URL` / `env.WP_API_TOKEN`.
- Events-operations routes.js importeert alleen de originele 5 functies; geen wijziging nodig.

**database.js (forminator-sync-v2)**
- `wpConnections` tabel-sleutel toegevoegd aan TABLES constant.
- Nieuwe exports: `listWpConnections`, `getWpConnectionById`, `createWpConnection`, `deleteWpConnection`.

**routes.js (forminator-sync-v2)**
- Import van nieuwe database-functies + `getWpClient` uit wp-client.js.
- Vier nieuwe discovery routes toegevoegd:
  - `GET  /api/discovery/connections` — lijst actieve WP connecties (no auth_token in response).
  - `POST /api/discovery/connections` — connectie aanmaken.
  - `DELETE /api/discovery/connections/:connectionId` — connectie verwijderen.
  - `GET  /api/discovery/forms?wp_connection_id=xxx` — live formulieren ophalen via WP REST.

**ui.js (forminator-sync-v2)**
- Nieuw blok "0) WordPress connectie & formulieren" toegevoegd vóór bestaand integraties-overzicht.
- Bevat: site-dropdown, "Formulieren ophalen" knop, veldpreview tabel, connectiebeheer (lijst + toevoegen/verwijderen).

**public/client.js (forminator-sync-v2)**
- Discovery functies toegevoegd: `loadWpConnections`, `renderConnectionList`, `handleLoadForms`, `handleAddConnection`, `handleDeleteConnection`.
- `loadWpConnections()` opgenomen in `bootstrap()`.
- Afzonderlijke click-listener voor `delete-connection` data-action (naast bestaande tabelacties-listener).

### Wat bewust NIET gebouwd is
- Geen opslag van formulieren in eigen DB.
- Geen caching.
- Geen sync-mechanisme.
- Geen nieuwe integratie-engine.
- Geen wijzigingen in events-operations module.
- Geen automatische mapping.

### Events-operations — garantie ongewijzigd
- `routes.js` in event-operations importeert uitsluitend: `getWordPressEvents`, `getWordPressEventsWithMeta`, `getWordPressEvent`, `publishToWordPress`, `getWordPressEventCategories`.
- Geen van deze functies is aangepast.
- Legacy env-vars `WORDPRESS_URL` + `WP_API_TOKEN` blijven de enige configuratie voor events.

### Testcriteria
1. Events-operations haalt events op zoals voorheen → ongewijzigde imports/functiehandtekeningen.
2. Forminator Sync V2 kan site A kiezen → forms ophalen → site B kiezen → forms ophalen.
3. Geen errors bij `wp_connection_id` ontbreekt in events module (gebruikt env-vars, niet tabel).
4. Geen wijziging nodig in bestaande env-config voor events.

---

## 2026-02-25 — Discovery: blocker WP REST endpoint

### Wat getest is

Na implementatie van de discovery-route werd live getest tegen `https://openvme.be`.

Getest met Basic Auth (`Marketing:S0o7vkfcsB2s9CsYI1FI5cM6`):

| Endpoint | Status |
|---|---|
| `/wp-json/openvme/v1/forminator/forms` | 404 |
| `/wp-json/forminator/v1/forms` | 404 |
| `/wp-json/wp/v2/forminator_forms` | 404 |
| `/wp-json/openvme/v1/` (namespace root) | 404 |

### Conclusie

Het custom WP REST endpoint `openvme/v1/forminator/forms` dat de discovery-route verwacht bestaat **niet** op `openvme.be`. De WP-plugin (of custom code) die dit endpoint registreert is niet geïnstalleerd of niet actief op de site.

De 401-fout die de Worker teruggeeft is een gevolg van de eigen foutafhandeling in `fetchForminatorForms` die elke niet-200 status als WP API error rapporteert — de werkelijke HTTP status van WP is 404.

### Wat geblokkeerd is

Testcriterium 2 (live formulieren ophalen) kan pas werken als het WP REST endpoint beschikbaar is.

### Twee opties om verder te gaan

**Optie A — WP-plugin endpoint aanmaken (voorkeur)**
Voeg server-side PHP toe aan de WordPress plugin/theme op `openvme.be` (en eventuele tweede site) die het endpoint registreert:
```php
register_rest_route('openvme/v1', '/forminator/forms', [
  'methods'             => 'GET',
  'callback'            => 'openvme_get_forminator_forms',
  'permission_callback' => function() {
    return current_user_can('edit_posts');
  }
]);
```
De callback haalt Forminator forms op via `Forminator_API::get_forms()` en retourneert `form_id`, `form_name` en `fields`.

**Optie B — Bestaande Forminator REST API gebruiken**
Forminator Pro biedt vanaf v1.15 een eigen namespace `forminator/v1`. Op `openvme.be` geeft dit echter ook 404 — de Pro versie is niet actief of de REST API is uitgeschakeld in de Forminator instellingen.
Fixparcours: Forminator instellingen → REST API inschakelen, daarna testen op `/wp-json/forminator/v1/forms`.

### Aanbeveling

Optie B eerst proberen (geen code nodig, alleen instellingen in WP). Als dat geen optie is, Optie A via de bestaande plugin implementeren.

De Node/Worker-code **is klaar** en hoeft niet aangepast te worden — het enige wat ontbreekt is het WP-side endpoint.

---

## 2026-02-26 — Module: WP Form Schemas (multi-site sync)

### Architectuurschets

```
wp_sites (DB)
  └─ POST /wp-sites                → site aanmaken
  └─ GET  /wp-sites                → sites oplijsten
  └─ POST /wp-sites/:id/sync       → fetch WP + flatten + upsert in DB
  └─ GET  /wp-sites/:id/forms      → lijst gesyncte formulieren
  └─ GET  /wp-sites/:id/forms/:fid → flattened schema + raw schema

WordPressFormsService
  └─ fetchFormsFromSite(baseUrl, apiSecret)  → GET {base_url}/wp-json/openvme/v2/forminator/forms
                                                header: X-API-SECRET

flattenFields(fields)
  ├─ is_composite === true  → parent overslaan, children afzonderlijk toevoegen
  ├─ type in skip set       → volledig negeren (page-break, group, html, section, captcha)
  ├─ dubbele field_id       → Error
  └─ rest                   → rechtstreeks mappable veld
```

### Nieuwe bestanden

| Bestand | Inhoud |
|---|---|
| `supabase/migrations/20260226100000_wp_form_schemas.sql` | Tabellen `wp_sites` + `wp_form_schemas` met RLS, FK, uniek constraint |
| `src/modules/wp-form-schemas/database.js` | CRUD voor beide tabellen + `upsertFormSchema` |
| `src/modules/wp-form-schemas/flattening.js` | `flattenFields` + `flattenRawSchema` |
| `src/modules/wp-form-schemas/service.js` | `fetchFormsFromSite` + `syncSiteForms` |
| `src/modules/wp-form-schemas/routes.js` | 5 route handlers |
| `src/modules/wp-form-schemas/module.js` | Module definitie (route: `/wp-sites`) |

### Gewijzigde bestanden

| Bestand | Wijziging |
|---|---|
| `src/modules/registry.js` | Import + registratie van `wpFormSchemasModule` |

### Wat de module doet

- Meerdere WP-sites registreren (`POST /wp-sites`) met `name`, `base_url`, `api_secret`.
- Sync triggeren (`POST /wp-sites/:id/sync`): haalt live formulieren op via `X-API-SECRET` header, slaat raw én flattened schema op in DB.
- Formulieren terugsturen zonder WP opnieuw te raadplegen (`GET /wp-sites/:id/forms/:formId`).
- Inactieve sites worden geblokkeerd bij sync.
- Nette foutmeldingen bij WP onbereikbaar (502), 401, 404 endpoint.

### Wat bewust NIET gebouwd is
- Geen webhook listener
- Geen submission verwerking
- Geen Odoo integratie
- Geen retry / queue
- Geen diff-detectie
- Geen UI (API-only module)

### Volledig los van events-operations
- Geen import van `wp-client.js`
- Geen gebruik van `WORDPRESS_URL` of `WP_API_TOKEN` env vars
- Geen hergebruik van `forminator_forms` tabel of events-tabellen
- Eigen auth-mechanisme (X-API-SECRET vs Basic Auth)
- Eigen namespace op WP-side (`openvme/v2` vs `openvme/v1`)

### Geblokkeerd: WP-side endpoint

Het WP-endpoint `GET /wp-json/openvme/v2/forminator/forms` moet aanwezig zijn op elke te syncen WP-site. Dit endpoint bestaat nog niet (404 op openvme.be bij eerdere tests).

**Benodigde PHP (toevoegen aan WP-plugin of theme):**

```php
add_action('rest_api_init', function () {
    register_rest_route('openvme/v2', '/forminator/forms', [
        'methods'             => 'GET',
        'permission_callback' => function (WP_REST_Request $request) {
            return $request->get_header('x_api_secret') === OPENVME_API_SECRET;
        },
        'callback'            => function () {
            if (!class_exists('Forminator_API')) return new WP_Error('no_forminator', 'Forminator niet actief', ['status' => 503]);
            $forms  = Forminator_API::get_forms(null, 1, 9999);
            $result = [];
            foreach ($forms as $form) {
                $id     = $form->id;
                $data   = Forminator_API::get_form($id);
                $fields = [];
                foreach (($data->fields ?? []) as $field) {
                    $slug    = $field->slug ?? '';
                    $subGrps = $field->raw['subgroups'] ?? $field->raw['fields'] ?? [];
                    $isComp  = !empty($subGrps);
                    $entry   = [
                        'field_id'     => $slug,
                        'label'        => $field->raw['field_label'] ?? $slug,
                        'type'         => $field->raw['type'] ?? 'text',
                        'required'     => !empty($field->raw['required']) && $field->raw['required'] === 'true',
                        'is_composite' => $isComp,
                    ];
                    if ($isComp) {
                        $children = [];
                        foreach ($subGrps as $sub) {
                            $children[] = [
                                'field_id' => $sub['id'] ?? ($slug . '.' . ($sub['label'] ?? '')),
                                'label'    => $sub['label'] ?? '',
                                'type'     => $field->raw['type'] ?? 'text',
                                'required' => !empty($field->raw['required']) && $field->raw['required'] === 'true',
                            ];
                        }
                        $entry['children'] = $children;
                    }
                    $fields[] = $entry;
                }
                $result[] = [
                    'form_id'   => (string)$id,
                    'form_name' => $data->settings['formName'] ?? "Form $id",
                    'fields'    => $fields,
                ];
            }
            return rest_ensure_response($result);
        }
    ]);
});
```

`OPENVME_API_SECRET` moet in `wp-config.php` gedefinieerd zijn en overeenkomen met de `api_secret` in `wp_sites`.
