# Addendum B.2 — Critical Execution Clarifications

> **Module**: `forminator-sync-v2`
> **Status**: Pre-development beslisdocument — bindend
> **Datum**: 2026-03-03
> **Aanvulling op**: Addendum B + Addendum B.1
> **Scope**: Drie openstaande ambiguïteiten definitief gesloten

---

## 1. Retry Context Restoration — Verplichte Strategie

### De vereiste

Bij een retry-run moet `contextObject` exact dezelfde step-output-waarden bevatten als bij de originele run. Chained stappen die worden overgeslagen (want al succesvol) schrijven hun output **niet opnieuw** — ze zijn immers niet uitgevoerd. De context moet dus worden hersteld *voordat* de target-loop begint.

### Herstelprocedure — deterministisch

`runSubmissionAttempt` met `mode: 'retry'` voert het volgende uit **vóór** de target-loop:

**Stap A — Resolver context overnemen**

Lees `submission.resolved_context` dat werd opgeslagen bij de originele run. Kopieer alle keys die beginnen met `context.` of die door resolvers zijn geschreven naar het nieuwe `contextObject`. Dit zijn de pre-run resolver-outputs.

**Stap B — Step outputs herstellen**

Lees alle `fs_v2_submission_targets` rijen voor dit `submission_id` met `action_result IN ('created', 'updated', 'skipped')` en `skipped_reason = 'retry_skip_already_successful'` (of null). Voor elke rij:

1. Sla de bijbehorende `target` op uit `integrationBundle.targets` via `target_id`
2. Schrijf in `contextObject`:
   - `step.<target.execution_order>.record_id` = `submission_target.odoo_record_id`
   - `step.<target.label>.record_id` = `submission_target.odoo_record_id` (alleen als `target.label` niet null is)

Dit is identiek aan wat `registerTargetOutput()` doet bij live uitvoering — dezelfde schrijflogica, andere databron.

**Stap C — Loop begint**

De target-loop start. Stappen die al succesvol waren worden overgeslagen (bestaande retry-skip logica). Hun context-keys zijn echter al hersteld in Stap B, zodat afhankelijke stappen die nog wél moeten draaien dezelfde context zien.

### Volgorde is deterministisch

`fs_v2_submission_targets` rijen voor dit `submission_id` worden gesorteerd op `execution_order ASC` bij herstel. Dit garandeert dat als stap 2 afhankelijk is van stap 1, stap 1's output altijd hersteld is vóór stap 2's context nodig is.

### Ontbrekende of corrupte `resolved_context`

`submission.resolved_context` wordt als secundaire bron beschouwd — het is een convenience snapshot, niet de primary store. De **primaire bron voor context-herstel is altijd `fs_v2_submission_targets`** (Stap B). Stap A (resolver context uit `resolved_context`) is additief.

Wanneer `resolved_context` null, leeg of niet-parseerbaar JSON is:
- Stap A wordt overgeslagen — geen resolver context hersteld
- Stap B wordt altijd uitgevoerd — step-outputs worden hersteld uit DB-rijen
- Resolver-afhankelijke stappen die nog moeten draaien zullen hun resolver-inputs opnieuw uit het formulier lezen — dit is correct, want de `source_payload` is beschikbaar op de submission

Er is geen afbreuk van de run. Incomplete context-herstel produceert hooguit een `PERMANENT_FAILURE` op stap-niveau als een resolver-waarde echt ontbreekt — dat is precies hetzelfde gedrag als bij de originele run in dezelfde omstandigheid.

---

## 2. `update_only` + `previous_step_output` Edge Case — Beslissing

### Scenario

Stap 1: `operation_type: update_only` → record niet gevonden → `action_result: 'skipped'`

Stap 2: heeft een mapping `source_type: previous_step_output`, `source_value: step.1.record_id`

In `contextObject` bestaat `step.1.record_id` niet — het werd nooit geschreven omdat stap 1 overgeslagen werd zonder een `odoo_record_id`.

### Beslissing: **Optie B — Worker markeert stap 2 als `skipped` met `skipped_reason: 'dependency_missing'`**

### Onderbouwing

Optie A (expliciete fout) is te agressief. De integratie is niet fout geconfigureerd — het is een legitiem runtime-scenario waarbij de afhankelijkheid ontbrak. Een `failed` status triggert een retry, wat nutteloos is: bij retry zal stap 1 opnieuw skipped zijn en stap 2 opnieuw mislukken.

Optie C (null doorlaten naar Odoo) produceert een onbegrijpbare Odoo API-fout die niet terug te herleiden is naar de werkelijke oorzaak. Niet acceptabel.

Optie B is correct: de stap kan niet zinvol draaien, de reden is declaratief en traceeerbaar, en de submission-status weerspiegelt de werkelijkheid (`partial_failed` als andere stappen slaagden, anders op basis van geheel).

### Technische implementatie

In `resolveMappingValue()`: wanneer `source_type === 'previous_step_output'` en de waarde `null` of `undefined` is uit `contextObject`, wordt **geen** fout gegooid. De null-waarde wordt doorgegeven.

In `buildIncomingValuesFromMappings()`: null-waarden worden al gefilterd (bestaande logica: `if (resolvedValue !== null && resolvedValue !== undefined)`). Het veld komt dus niet mee in de Odoo-call.

Maar de worker voert een **pre-flight check** uit vóór de Odoo-call: als een mapping `is_required: true` heeft én de resolved waarde is null, **en** de `source_type` is `previous_step_output`, wordt de stap afgebroken met `action_result: 'skipped'`, `skipped_reason: 'dependency_missing'`.

Dit vereist dat de mapping voor `partner_id` in het voorbeeld als `is_required: true` is gemarkeerd. Dit is een bestaand veld in `fs_v2_mappings` — geen nieuw veld nodig.

### Wat de gebruiker ziet in de timeline

```
⬤  Stap 1 · Bezoeker (website.visitor)
   ⏭  Overgeslagen — record niet gevonden

⬤  Stap 2 · Lead (crm.lead)
   ⏭  Overgeslagen — vereiste uitvoer van stap 1 ontbreekt
```

### Hoe retry hiermee omgaat

`dependency_missing` stappen krijgen `action_result: 'skipped'`, maar `skipped_reason: 'dependency_missing'` — niet `retry_skip_already_successful`. De retry-skip check controleert uitsluitend op `retry_skip_already_successful`. Stap 2 wordt bij retry dus opnieuw geprobeerd zodra stap 1 wél een record_id oplevert.

Wanneer stap 1 bij retry opnieuw overslaat (want record nog steeds niet gevonden), slaat stap 2 opnieuw over. Dit is correct gedrag — geen oneindige retry-lus, want de submission zal na `max_attempts` exhausted worden.

Samenvatting van `skipped_reason` values en hun retry-behandeling:

| `skipped_reason` | Retry-behandeling |
|---|---|
| `retry_skip_already_successful` | Niet opnieuw uitvoeren |
| `pipeline_abort` | Opnieuw uitvoeren |
| `dependency_missing` | Opnieuw uitvoeren |
| `null` (reguliere skip door Odoo) | Niet opnieuw uitvoeren |

---

## 3. `execution_order` vs `order_index` — Definitieve Strategie

### Beslissing

**`execution_order` wordt de enige bron van waarheid voor pipeline-volgorde. `order_index` wordt gedeprecieerd en na één migratiecyclus verwijderd.**

### Motivatie

Twee velden voor hetzelfde concept is een garantie op inconsistentie. De volgende developer die een target aanmaakt via de API stelt één van beide in maar vergeet het andere. De worker sorteert ooit op het verkeerde veld. Dit is vermijdbare technische schuld.

`order_index` bestond als eenvoudige sorteerveld zonder semantische garanties (default 0, geen unique constraint). `execution_order` introduceert die garanties wél. Er is geen reden beide te handhaven.

### Migratiestrategie

**Migratie 1** (deel van Fase 1, Addendum B.1 §7):
- Voeg `execution_order integer` toe aan `fs_v2_targets`
- Backfill: `UPDATE fs_v2_targets SET execution_order = order_index WHERE execution_order IS NULL`
- Voeg `UNIQUE (integration_id, execution_order)` constraint toe
- `order_index` blijft aanwezig — geen breaking change

**Migratie 2** (apart, na validatie in productie):
- Verwijder `order_index` kolom uit `fs_v2_targets`
- Update alle DB-queries die `order_index` gebruiken naar `execution_order`

Tussen migratie 1 en 2 geldt: **de worker gebruikt uitsluitend `execution_order`**. `order_index` is na migatie 1 dode code in de DB — aanwezig maar genegeerd door de applicatie.

### Voorkomen van toekomstige inconsistentie

- `createTarget()` in `database.js` accepteert na migratie 1 geen `order_index` meer als parameter — alleen `execution_order`
- De UI (detail view target-accordion) schrijft bij aanmaken/herordenen uitsluitend `execution_order`
- De unique constraint op DB-niveau maakt duplicaten onmogelijk zonder expliciete conflictoplossing
- Wanneer een nieuwe target wordt aangemaakt via de UI, stelt de client `execution_order` in als `max(bestaande execution_orders) + 1` — nooit een hardcoded default

### Tussenliggende periode (migratie 1 aanwezig, migratie 2 nog niet)

De worker voert `listTargetsByIntegration()` uit met `.order('execution_order', { ascending: true })`. Wanneer `execution_order` null is voor een target (pre-migratie record dat backfill miste), valt de worker terug op `order_index` als sorteerveld voor diezelfde query. Dit is een één-tijd-veiligheidsnet, geen permanente terugval.

---

*Einde van Addendum B.2 — Critical Execution Clarifications*

*Na dit document zijn alle drie de architecturale ambiguïteiten gesloten. Development kan starten.*
