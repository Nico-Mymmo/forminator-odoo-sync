# Forminator Sync V2 — API Contract

> Datum laatste update: 2026-03-03  
> Alle endpoints leven onder `/forminator-v2/api/*`  
> Authenticatie: Admin Basic Auth op de Worker (geconfigureerd als Cloudflare secret)

## Algemene response-structuur

```json
// Success
{ "success": true, "data": { ... } }

// Fout
{ "success": false, "error": "beschrijving" }
```

HTTP-statuscodes:

| Code | Betekenis |
|---|---|
| `200` | OK |
| `201` | Aangemaakt |
| `400` | Validatiefout / ongeldige aanvraag |
| `401` | Ongeautoriseerd |
| `404` | Niet gevonden |
| `409` | Conflict |
| `422` | Chain reference fout |
| `500` | Technische fout |

---

## Pagina

| Methode | Pad | Beschrijving |
|---|---|---|
| `GET` | `/forminator-v2/` | Levert de HTML-interface |

---

## Meta

| Methode | Pad | Beschrijving |
|---|---|---|
| `GET` | `/api/meta` | MVP-constanten: resolverstypes, updatebeleid, source-types, limieten |

---

## Integraties

| Methode | Pad | Body / Query | Beschrijving |
|---|---|---|---|
| `GET` | `/api/integrations` | — | Lijst van alle integraties (summaries) |
| `POST` | `/api/integrations` | `{ name, forminator_form_id, odoo_connection_id }` | Nieuwe integratie aanmaken |
| `GET` | `/api/integrations/:id` | — | Volledige bundel: integration + resolvers + targets + mappings |
| `PUT` | `/api/integrations/:id` | `{ name?, is_active?, forminator_form_id?, odoo_connection_id? }` | Bijwerken. Activatie (`is_active=true`) geblokkeerd zonder geslaagde test |
| `DELETE` | `/api/integrations/:id` | — | Verwijderen (cascadeert naar resolvers, targets, mappings) |

---

## Resolvers

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `POST` | `/api/integrations/:id/resolvers` | `{ resolver_type, input_source_field, create_if_missing?, output_context_key, order_index? }` | Resolver aanmaken. Max 2 per integratie; geen duplicaat resolver_type |
| `PUT` | `/api/integrations/:id/resolvers/:resolverId` | zelfde velden | Bijwerken |
| `DELETE` | `/api/integrations/:id/resolvers/:resolverId` | — | Verwijderen |

**Toegestane `resolver_type` waarden** (via `/api/meta`):
- `partner_by_email`
- `webinar_by_external_id`

---

## Targets (schrijfdoelen)

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `POST` | `/api/integrations/:id/targets` | `{ odoo_model, identifier_type, update_policy, operation_type?, execution_order?, order_index? }` | Target aanmaken. `odoo_model` moet in de DB-registry staan |
| `PUT` | `/api/integrations/:id/targets/:targetId` | zelfde velden + `is_enabled?` | Bijwerken |
| `DELETE` | `/api/integrations/:id/targets/:targetId` | — | Verwijderen |

**`operation_type`**: `upsert` (default)  
**`update_policy`**: `always_overwrite` | `only_if_incoming_non_empty`  
**`identifier_type`**: `mapped_fields` | `single_email` | `registration_composite`  
**`execution_order`**: integer (stap-volgorde bij multi-step integraties)

---

## Mappings (veldkoppelingen)

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `POST` | `/api/targets/:targetId/mappings` | zie schema | Mapping aanmaken |
| `PUT` | `/api/mappings/:mappingId` | zelfde velden | Bijwerken |
| `DELETE` | `/api/mappings/:mappingId` | — | Verwijderen |
| `DELETE` | `/api/targets/:targetId/mappings` | — | Alle mappings van een target verwijderen |

**Mapping body schema:**
```json
{
  "odoo_field": "email_from",
  "source_type": "form",
  "source_value": "email-1",
  "is_required": false,
  "is_identifier": false,
  "is_update_field": true,
  "order_index": 0
}
```

**`source_type` waarden:**
- `form` — waarde uit formulierveld (`source_value` = veld-ID zoals `email-1`)
- `template` — tekst met placeholders zoals `Syndicoach Aangevraagd: {name-1}` (verwerkt door `lookupFormValue`)
- `context` — waarde uit resolver-context (`source_value` = context-key)
- `static` — vaste waarde
- `previous_step_output` — `step.<order>.record_id` (verwijst naar eerder target in multi-step)

**Chain reference validatie**: bij `previous_step_output` controleert de server dat het verwezen target een lagere `execution_order` heeft dan het huidige target.

---

## Test & Activatie

| Methode | Pad | Beschrijving |
|---|---|---|
| `POST` | `/api/integrations/:id/test-stub` | Maakt handmatige test-entry aan; ontgrendelt activatie |
| `GET` | `/api/integrations/:id/test-status` | Response: `{ has_successful_test: boolean }` |

---

## Webhook

| Methode | Pad | Auth | Beschrijving |
|---|---|---|---|
| `GET` | `/api/webhook-config` | Admin | Geeft webhook-URL + configuratiestatus terug |
| `GET` | `/api/webhook?token=<secret>` | Token | Forminator validation ping (antwoord `200 OK` bij geldig token) |
| `POST` | `/api/webhook?token=<secret>` | Token | Forminator submission intake |

**Webhook-authenticatie:**
- Forminator stuurt `?token=<FORMINATOR_WEBHOOK_SECRET>` als query-parameter.
- Worker valideert: `token === env.FORMINATOR_WEBHOOK_SECRET`.
- Ontbrekend of fout token → `401 Unauthorized`, geen submission-record aangemaakt.

**POST webhook response statussen** (in `data.status`):
```
success | partial_failed | permanent_failed | retry_scheduled |
retry_exhausted | duplicate_inflight | duplicate_ignored
```

---

## Submissions

| Methode | Pad | Beschrijving |
|---|---|---|
| `GET` | `/api/integrations/:id/submissions` | Laatste 50 submissions voor een integratie |
| `GET` | `/api/submissions/:submissionId` | Detail: `{ submission, target_results: [] }` |
| `POST` | `/api/submissions/:submissionId/replay` | Replay van een gefaalde submission |

**Replay voorwaarden:**  
Enkel toegestaan voor status: `partial_failed`, `permanent_failed`, `retry_exhausted`.  
Geweigerd als al een child replay met status `running` bestaat.  
Replay maakt altijd een nieuwe submission-row (eigen idempotency key `replay-<orig>-<uuid>`).

---

## Retries

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `POST` | `/api/retries/run-due` | `{ limit?: number }` | Verwerk due `retry_scheduled` submissions (max 100 per aanroep) |

---

## WordPress Discovery (Cloudflare secrets — primair)

| Methode | Pad | Query | Beschrijving |
|---|---|---|---|
| `GET` | `/api/forminator/sites` | — | Geeft geconfigureerde sites terug op basis van `WORDPRESS_URL_SITE_N` env vars. Credentials **nooit** in response |
| `GET` | `/api/forminator/forms` | `?site=SITE_1` | Haalt Forminator-formulieren op via Basic Auth (`WP_API_TOKEN_SITE_N`) |

**Configuratie** (Cloudflare secrets, per site 1 t/m 10):
```
WORDPRESS_URL_SITE_1=https://voorbeeld.be
WP_API_TOKEN_SITE_1=gebruiker:AppWachtwoord   ← NOOIT vooraf base64-encoded
```
De Worker doet de Base64-encoding runtime via `btoa()`.

---

## WordPress Discovery (DB-backed — legacy)

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `GET` | `/api/discovery/connections` | — | Lijst van opgeslagen WP-verbindingen |
| `POST` | `/api/discovery/connections` | `{ name, base_url, auth_token }` | Nieuwe verbinding aanmaken |
| `DELETE` | `/api/discovery/connections/:connectionId` | — | Verbinding verwijderen |
| `GET` | `/api/discovery/forms` | `?wp_connection_id=` | Formulieren ophalen via een opgeslagen verbinding |

---

## Instellingen: Odoo model registry

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `GET` | `/api/settings/odoo-models` | — | Volledige model-registry uit DB (`name`, `label`, `icon`, `sort_order`, `default_fields`, …) |
| `PUT` | `/api/settings/odoo-models` | `{ models: [{ name, label, icon, default_fields? }] }` | **Volledige vervanging** van de registry. Delta: verwijdert rijen die er niet meer in zitten; upsert de rest |

**`default_fields` item schema:**
```json
{ "name": "email_from", "label": "E-mailadres", "required": true }
```

---

## Instellingen: Model links (chain-suggestion)

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `GET` | `/api/settings/model-links` | — | Huidige model-link registry |
| `PUT` | `/api/settings/model-links` | `{ links: [{ model_a, model_b, link_field, link_label }] }` | Volledige vervanging |

---

## Instellingen: Model defaults (legacy endpoint)

| Methode | Pad | Body | Beschrijving |
|---|---|---|---|
| `PUT` | `/api/settings/model-defaults` | `{ model, fields: [{name, label, required, order_index}] }` | Schrijft `default_fields` voor één model. **Vervangen door `PUT /api/settings/odoo-models`** |

---

## Odoo velden

| Methode | Pad | Query | Beschrijving |
|---|---|---|---|
| `GET` | `/api/odoo/fields` | `?model=res.partner` | Opgeslagen velden voor het opgegeven model via Odoo `fields_get`. Gefilterd op `store=true`, gesorteerd op label |

**Response item:**
```json
{
  "name": "email",
  "label": "E-mail",
  "type": "char",
  "readonly": false,
  "selection": null,
  "relation": null
}
```
