# Forminator Sync V2 � Operational Behavior

> Datum laatste update: 2026-03-04  
> Status: Volledig live (alle fasen compleet)

---

## Integratie-activatie

- Een integratie kan enkel actief gezet worden (`is_active=true`) nadat er een geslaagde test-submission bestaat (`has_successful_test: true`).
- De test-stub (`POST /api/integrations/:id/test-stub`) maakt handmatig een geslaagde submission aan voor activatie-unlock.

---

## Idempotency

- Idempotency key: `integration_id + forminator_form_id + payload_hash`.
- `payload_hash` is deterministisch:
  - Object keys alfabetisch gesorteerd.
  - Whitespace genormaliseerd.
- DB-level guardrail: unieke index op `(integration_id, idempotency_key)` blokkeert duplicate submission-rows bij race conditions.
- Duplicate handling:
  - Status `running`, `retry_running`, `retry_scheduled` ? respons `duplicate_inflight`
  - Terminale status (`success`, `partial_failed`, `permanent_failed`, `retry_exhausted`) ? respons `duplicate_ignored`
  - Beide gevallen: response verwijst naar de bestaande submission-ID; geen nieuwe row.

---

## Webhook-authenticatie

- Forminator stuurt `?token=<secret>` als query-parameter.
- Worker valideert: `token === env.FORMINATOR_WEBHOOK_SECRET`.
- Ontbrekend of ongeldig token ? `401 Unauthorized`, geen submission-record aangemaakt.
- Configuratie: stel `FORMINATOR_WEBHOOK_SECRET` in als Cloudflare Worker secret.

---

## Runtime flow (webhookverwerking)

1. Webhook ontvangen (`POST /api/webhook?token=...`)
2. Authenticatiecheck op token
3. Actieve integratie opzoeken op form-ID
4. Idempotency key berekenen ? duplicate check
5. Submission-record aanmaken met status `running`
6. Resolvers uitvoeren ? context opbouwen (partner lookup, webinar lookup, �)
7. Targets uitvoeren in execution_order volgorde
8. Elke target: identifier ophalen ? record maken/bijwerken in Odoo
9. Target-resultaten loggen
10. Bij recoverable fout: status `retry_scheduled` + `next_retry_at`
11. Eindstatus finaliseren

---

## Template-waarden (`source_type: template`)

Waarden van de vorm `VME Check: {name-1.fname} {name-1.lname}` worden verwerkt door `lookupFormValue()` met 4 opzoekstappen:

| Stap | Methode | Voorbeeld |
|---|---|---|
| 1 | Exacte match | `{email-1}` naar sleutel `email-1` |
| 2 | Genormaliseerde match (dashes/underscores) | `{email-1}` naar `email_1` |
| 3 | Prefix-match (zonder achtervoegsel-cijfer) | `{email}` naar `email_1` |
| 4 | Subsequentie-match voor dot-notatie | `{name-1.fname}` naar `name-1.first-name` |

Meerdere placeholders per waarde zijn toegestaan. Niet-gevonden placeholders worden vervangen door een lege string.

---

## Samengestelde velden (composite fields)

Forminator stuurt samengestelde velden (bijv. naamveld) als een JSON-string onder de ouder-sleutel:

```
name-1: '{"first-name":"nico","last-name":"plinke"}'
```

`normalizeFormValues()` verwerkt dit als volgt:
1. Strings die beginnen met `{` of `[` worden via `JSON.parse` geparsed.
2. Het gecombineerde ouder-veld wordt opgeslagen: `name-1 = 'nico plinke'` (spatie-join van niet-lege waarden).
3. Elk subveld wordt afzonderlijk opgeslagen: `name-1.first-name = 'nico'`, `name-1.last-name = 'plinke'`.

Zowel het ouder-veld als elk subveld zijn daardoor individueel mappeerbaar:
- Mapping `name-1` naar `name` geeft `'nico plinke'`
- Mapping `name-1.fname` naar `x_voornaam` geeft `'nico'` (via subsequentie-match stap 4)

---

## Waarde-mapping per keuze (`value_map`)

Voor keuzevelden (radio, checkbox, select) kan per keuzeoptie een vertaling naar een Odoo-waarde worden ingesteld:

```json
{ "option_a": "draft", "option_b": "confirmed" }
```

Opgeslagen als `value_map JSONB` in `fs_v2_mappings`. Verwerking in `resolveMappingValue()`:
1. Lookup de ruwe formulierwaarde.
2. Als `value_map` aanwezig is en de waarde als sleutel bevat: gebruik de gemapte Odoo-waarde.
3. Anders: gebruik de ruwe formulierwaarde als fallback.

Typisch gebruikt in combinatie met Odoo `selection`- of `many2one`-velden.

---

## Retry-mechanisme

- Retry geldt enkel voor recoverable fouten (zie matrix hieronder).
- Maximaal 3 pogingen totaal.

| Poging | Wanneer | Wachttijd |
|---|---|---|
| 1 | Direct (initi�le run) | � |
| 2 | Na recoverable fout op poging 1 | +1 minuut |
| 3 | Na recoverable fout op poging 2 | +5 minuten |
| � | Na recoverable fout op poging 3 | `retry_exhausted` |

- Retry gebruikt dezelfde submission-row en dezelfde idempotency key.
- Tijdens wacht: status `retry_scheduled` + `next_retry_at` timestamp.
- Tijdens uitvoering: status `retry_running`.
- Retry runner claimt submissions atomisch (`retry_scheduled` ? `retry_running`), parallelle claims worden geweigerd.

---

## Recoverable vs. permanente fouten

| Type | Voorbeelden |
|---|---|
| **Recoverable** | Netwerkfout, timeout, Odoo 429, Odoo 5xx |
| **Permanent** | Validatiefout, ontbrekende verplichte mapping, ontbrekende identifier, Odoo 4xx (behalve 429) |

---

## Target-uitvoering bij retry

- Geen rollback van eerder geslaagde targets.
- Eerder geslaagde targets: overgeslagen met log `action_result = skipped` + `retry_skip_already_successful`.
- Eerder gefaalde targets: opnieuw uitgevoerd (identifier-based).

---

## Replay

- Endpoint: `POST /api/submissions/:submissionId/replay`
- Maakt altijd een **nieuwe** submission-row:
  - `replay_of_submission_id` ? originele submission
  - `source_payload` ? kopie van origineel
  - `payload_hash` ? opnieuw berekend uit gekopieerd payload
  - `idempotency_key` ? geforceerd nieuw (`replay-<orig>-<uuid>`)
- Toegestane statussen om te replayen: `partial_failed`, `permanent_failed`, `retry_exhausted`.
- Geweigerd als al een child replay met status `running` bestaat voor dezelfde originele submission.
- Replay doorloopt de volledige runtimeflow: resolvers ? context ? targets.
- Originele submission blijft ongewijzigd.

---

## Submission-statussen

| Status | Betekenis |
|---|---|
| `running` | Verwerking actief |
| `success` | Alle targets geslaagd |
| `partial_failed` | Minstens ��n target geslaagd, minstens ��n gefaald |
| `permanent_failed` | Permanente fout (niet herstelbaar) |
| `retry_scheduled` | Awaiting retry na recoverable fout |
| `retry_running` | Retry actief |
| `retry_exhausted` | Alle 3 pogingen verbruikt |
| `duplicate_inflight` | Duplicate van een actieve/geplande submission |
| `duplicate_ignored` | Duplicate van een reeds verwerkte submission |

---

## Failure matrix

| Situatie | Eindstatus |
|---|---|
| Recoverable fout op poging 1 | `retry_scheduled` (+1 min) |
| Recoverable fout op poging 2 | `retry_scheduled` (+5 min) |
| Recoverable fout op poging 3 | `retry_exhausted` |
| Permanente fout op eender welke poging | `permanent_failed` |
| Minstens ��n target OK, ��n gefaald | `partial_failed` |
| Alle targets OK of skipped-success | `success` |
