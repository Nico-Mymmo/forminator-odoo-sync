# Addendum B.1 — UX & Traceability Refinement

> **Module**: `forminator-sync-v2`
> **Status**: Architecturale verfijning — geen implementatie gestart
> **Datum**: 2026-03-03
> **Aanvulling op**: [Addendum B — Multi-Step Execution Pipeline](./ADDENDUM_B_MULTI_STEP_PIPELINE.md)
> **Scope**: UX-vertaling, componentstrategie, traceability, gefaseerde roadmap

---

## Leeswijzer

Addendum B beschrijft het technische model: nieuwe DB-velden, worker-aanpassingen, context propagation. Dit document beschrijft *hoe dat model wordt gebouwd zonder nieuwe componenten te bouwen, en hoe het aanvoelt voor een marketeer die nooit de term "execution_order" mag tegenkomen.*

---

## 1. UX-Principes — Concreet

### 1.1 De pipeline als "Reeks acties"

De technische term "execution pipeline" wordt voor de gebruiker nooit getoond. In de UI heeft de integratie een sectie:

> **"Reeks acties"** *(in plaats van "Targets" wanneer ≥ 2 targets)*

Zolang een integratie één target heeft, blijft de bestaande term onveranderd. De complexiteitsstap is afgeschermd achter het aantal stappen.

### 1.2 Vertaaltabel: technisch → gebruikerstaal

| Technisch concept | Gebruiker ziet |
|---|---|
| `execution_order` | Stepnummer badge: **"1 · 2 · 3"** |
| `label` | **"Naam van deze stap"** (optioneel invoerveld) |
| `operation_type: upsert` | **"Bijwerken of aanmaken"** (standaard, geen extra uitleg nodig) |
| `operation_type: create` | **"Altijd nieuw aanmaken"** |
| `operation_type: update_only` | **"Alleen bijwerken — overslaan als niet gevonden"** |
| `error_strategy: stop_on_error` | **"Stop de reeks als deze stap mislukt"** |
| `error_strategy: allow_partial` | **"Doorgaan ondanks fout"** (standaard) |
| `source_type: previous_step_output` | **"Uitvoer van stap [naam of nummer]"** |
| `previous_step_output: step.contact.record_id` | **"Odoo-ID uit stap 'Contact'"** |
| `pipeline_abort` (submission target reason) | **"Overgeslagen — eerdere stap mislukt"** |

### 1.3 Concrete labelteksten

**Binnen een stap-configuratieblok:**

```
┌─ Stap 2 ──────────────────────────────────────────────┐
│  Naam (optioneel)  [ Lead aanmaken         ]           │
│  Odoo model        [ crm.lead              ]           │
│  Actie             ( ) Bijwerken of aanmaken           │
│                    ( ) Altijd nieuw aanmaken           │
│                    (•) Alleen bijwerken                │
│  Bij fout          [ Doorgaan ondanks fout  ▼ ]       │
└────────────────────────────────────────────────────────┘
```

**In de mapping source selector, wanneer vorige stappen beschikbaar zijn:**

```
Bron:  [ Formulierveld          ▼ ]    ← huidige opties
       [ Vaste waarde            ]
       [ Contextwaarde           ]
       ─────────────────────────
       [ Uitvoer van stap 1 — Contact ▼ ]   ← nieuw, alleen zichtbaar wanneer ≥ 1 eerdere stap
```

**In de submission history, bij een aborted stap:**

```
⚡ Stap 2  crm.lead    [Overgeslagen — stap 1 mislukt]
```

### 1.4 Voorkomen dat de UI technisch wordt

Drie concrete regels die in de implementatie worden afgedwongen:

1. **Geen UUIDs of veldnamen zichtbaar** voor de gebruiker. Stapnummer is altijd een badge (1, 2, 3). Interne `target_id` of `execution_order` zijn nooit zichtbaar in de UI.
2. **Labels zijn altijd menselijk leesbaar**. Als een stap geen label heeft, toont de UI "Stap N" (N = execution_order), nooit de UUID.
3. **Geavanceerde opties zijn achter een toggle**. `operation_type` en `error_strategy` zijn verborgen onder een "Geavanceerde opties ▼" collapsible totdat de gebruiker daar bewust op klikt. Defaults zijn pre-selected en correct voor de meeste gevallen.

---

## 2. UI-Integratie Zonder Breuk

### 2.1 Één `MappingTable`, uitgebreid — niet vervangen

De bestaande `window.FSV2.MappingTable.render(tableId, cfg)` in `forminator-sync-v2-mapping-table.js` blijft de enige mapping-tabel implementatie. Uitbreiding betekent:

- Het `cfg`-object krijgt een optionele `precedingSteps: []` array — een lijst van `{ order: 1, label: 'Contact' }` objecten voor stappen die voor de huidige stap komen
- Als `precedingSteps` leeg is (het geval voor stap 1 of single-target), rendert de source-dropdown precies zoals vandaag
- Als `precedingSteps` niet leeg is, voegt de dropdown een gescheiden sectie toe: **"Uitvoer van vorige stap"** met een sub-optie per beschikbare stap
- De `source_type` opgeslagen in de DB is `previous_step_output`; de `source_value` is `step.<label>.record_id` of `step.<order>.record_id`
- Geen nieuwe component. Geen nieuwe tabel. Uitbreiding van de bestaande `buildOdooOpts`-functie met een tweede dropdown-sectie.

### 2.2 Één target-weergave — uitgebreid met stap-metadata

De bestaande target-rendering in `renderDetailMappings()` (`detail.js`, ~lijn 133) loopt al over `targets`. Uitbreiding:

- Elk target-blok krijgt een **stepnummer badge** links van de `<h4>` titel (alleen zichtbaar als het integration ≥ 2 targets heeft)
- **Naam van deze stap** verschijnt als bewerkbaar inputveld direct onder de modelnaam (maps naar het nieuwe `label` veld)
- **Actie** en **Bij fout** dropdowns worden toegevoegd in het "Geavanceerde opties" blok van het target-accordion — niet direct zichtbaar

In de wizard (`renderWizardMapping()`, `wizard.js`, ~lijn 165): geen wijziging aan de wizard flow zelf. De wizard maakt voorlopig altijd één target aan met `execution_order: 1`. Multi-target configuratie vindt plaats in de detail view, niet in de wizard.

### 2.3 Één SourceSelector — drie branches, geen nieuwe component

De source-type logica zit op twee plaatsen in de huidige codebase:
- `resolveMappingValue()` in `worker-handler.js` — server side
- De `<select>` voor bronkeuze in `MappingTable.render()` — client side

Beide krijgen één nieuwe branch: `previous_step_output`. Geen nieuwe selector-component. Geen nieuwe formulierlogica. De bestaande select-element voor "Bron" krijgt optioneel een derde optiecluster.

### 2.4 Operation type is configuratie, geen aparte UI-flow

`operation_type` verandert het gedrag in de worker, maar niet de structuur van de mapping UI. Een target met `operation_type: create` heeft dezelfde mapping-table als één met `upsert`. Het verschil zit in wat de worker doet met de waarden — niet in hoe ze worden ingevoerd.

De enige UI-consequentie: bij `operation_type: update_only` verbergt de detail view de "Identifier"-kolom uit de mapping-table (er hoeft geen identifier gemarkeerd te worden als het record al gevonden moet zijn via another key). Dit is een CSS-class toggle op de render-aanroep, geen conditionele component.

---

## 3. Step Visualisatie

### 3.1 Stepnummer badges

Tonen alleen als de integratie ≥ 2 targets heeft. Berekening is client-side: sorteer targets op `execution_order`, wijs `1, 2, 3...` toe. Badge-stijl: `badge badge-neutral badge-sm` voor normale stappen, `badge badge-primary badge-sm` voor de geselecteerde stap.

Voorbeeld target-header:
```
[ 1 ]  res.partner  ·  Contact  ·  Bijwerken of aanmaken
[ 2 ]  crm.lead     ·  Lead     ·  Altijd nieuw aanmaken  ⚡ Stop bij fout
```

Het `⚡` icoon verschijnt alleen wanneer `error_strategy: stop_on_error`. Geen uitleg nodig — de tooltip doet de rest.

### 3.2 Wanneer een stap-label verplicht wordt

Label is nooit verplicht in DB. Maar de UI toont een zachte waarschuwing wanneer:

- Een integratie ≥ 2 targets heeft, én
- Een volgende stap een `previous_step_output` mapping heeft die refereert naar deze stap via `step.<order>.record_id` (positiebased, dus breekbaar bij reorder)

Waarschuwingstekst: *"Geef deze stap een naam zodat verwijzingen stabiel blijven als je de volgorde wijzigt."*

### 3.3 Dependency badges

Op elke stap die mappings heeft met `source_type: previous_step_output`:

```
[ 2 ]  crm.lead  ·  Lead    ← van stap 1
```

"← van stap 1" is een kleine badge of chip naast de koptekst. Klikken op de badge scrollt naar stap 1. Geen apart dependency-diagram. Geen visuele pijlen.

### 3.4 Veilig reorderen

Drag-to-reorder is **Fase 3** (zie §7). In Fase 1 en 2 kan volgorde alleen worden aangepast via een **"▲ Omhoog / ▼ Omlaag"** knoppenpaar per stap. Dit is eenvoudiger te valideren.

Validatieregel bij elke volgorde-aanpassing:
- Zoek alle mappings in de verplaatste stap met `source_type: previous_step_output`
- Controleer of de gerefereerde stap nog steeds *voor* de verplaatste stap komt na de aanpassing
- Zo niet: toon blokkerende melding: *"Stap '[naam]' verwijst naar uitvoer van stap '[naam]'. Je kunt stap '[naam]' niet boven stap '[naam]' plaatsen."*

Reorder wordt geblokkeerd, niet achteraf gerepareerd. Eenvoudig en deterministisch.

---

## 4. Mapping UI Uitbreiding

### 4.1 Nieuwe bronoptie in de bestaande source dropdown

De bestaande source dropdown in `MappingTable` heeft vandaag:

```
Formulierveld
Vaste waarde
Contextwaarde (uit pre-run resolver)
```

Na uitbreiding, wanneer `cfg.precedingSteps` niet leeg is:

```
Formulierveld
Vaste waarde
Contextwaarde
──────────────────
Uitvoer van stap 1 — Contact
Uitvoer van stap 2 — Lead
```

Alleen stappen met een lagere `execution_order` dan de huidige stap worden aangeboden. Stap 1 heeft geen vorige stappen — de sectie verschijnt niet.

### 4.2 Wat "Uitvoer van stap N" concreet bevat

In Fase 1 is de enige beschikbare uitvoer het `record_id` van de Odoo-record die werd aangemaakt of bijgewerkt. Dit is het meest gebruikte geval (gebruik partner_id van stap 1 als many2one in stap 2).

De dropdown-optie:

```
Uitvoer van stap 1 — Contact  →  Odoo-ID (partner_id)
```

Geselecteerde waarde opgeslagen als `source_type: previous_step_output`, `source_value: step.contact.record_id`.

Toekomstige uitvoertypen (bijv. specifieke velden zoals `email` of `name`) zijn uitbreidingen van deze structuur, maar zijn geen MVP-vereiste.

### 4.3 Blokkering van ongeldige referenties

Twee validatiemomenten:

1. **Bij selectie**: De dropdown bevat structureel alleen voorgaande stappen. Latere stappen zijn nooit beschikbaar als optie. Ongeldige referenties zijn daarom niet instelbaar via normale gebruik.

2. **Bij opslaan**: Server-side validatie in `routes.js` controleert of de `source_value` van een `previous_step_output` mapping refereert naar een target met een lagere `execution_order` dan het huidige target. Zo niet: HTTP 422 met duidelijke foutmelding.

Geen nieuwe validatie-engine. De bestaande POST-handler voor mappings krijgt één extra check.

---

## 5. Traceability — Zonder Overdrive

### 5.1 Uitbreiding van de bestaande submission history tabel

De functie `renderDetailSubmissions()` in `detail.js` (lijn 222) rendert al een tabel met `actionBadge(sub)` die `resolved_context.target_actions` leest. Dit is de bestaande hook.

Na de pipeline-uitbreiding bevat `resolved_context.target_actions` meer gestructureerde data (zie Addendum B §4.2 en §6). `actionBadge()` wordt uitgebreid om een **Stap-voor-stap samenvatting** te tonen bij klik op een rij.

### 5.2 Submission Timeline — specificatie

Geen aparte pagina. Geen nieuw scherm. De bestaande submission-rij wordt uitklapbaar:

**Ingeklapt (huidige weergave, ongewijzigd):**
```
abc1234f  · hans@email.nl  [success]  [aangemaakt] [bijgewerkt]  23 feb 12:41  [Replay]
```

**Uitgeklapt (nieuw — click op rij):**
```
▼ abc1234f — 23 feb 12:41

  📥 Ingekomen payload
     form-field-1: Hans de Vries
     email-1: hans@email.nl
     [+ meer velden tonen]    ← collapse, maximaal 5 zichtbaar

  ─────────────────────────────────
  ⬤  Stap 1 · Contact (res.partner)
     ✅ Aangemaakt  ·  Odoo #4821

  ⬤  Stap 2 · Lead (crm.lead)
     ✅ Bijgewerkt  ·  Odoo #9034

  ⬤  Stap 3 · Websitebezoeker (website.visitor)
     ⏭  Overgeslagen — geen wijziging
  ─────────────────────────────────
  Totale doorlooptijd: 1.2s
```

### 5.3 Databronnen binnen de huidige structuur

| Wat tonen | Gegevensbron |
|---|---|
| Payload velden | `submission.source_payload` (al aanwezig) |
| Stap naam | `target.label` (nieuw veld), fallback: "Stap N" |
| Stap model | `resolved_context.target_actions[].model` (al aanwezig) |
| Stap uitkomst | `resolved_context.target_actions[].action` (al aanwezig) |
| Odoo record ID | `resolved_context.target_actions[].record_id` (al aanwezig) |
| Reden overgeslagen | `fs_v2_submission_targets.skipped_reason` (nieuw veld) |
| Doorlooptijd | `submission.finished_at - submission.started_at` (al aanwezig) |

Geen extra logging. Geen extra API-calls. Alle data is reeds aanwezig of wordt toegevoegd als deel van de worker-uitbreiding in Addendum B.

### 5.4 Geen Odoo-dumps

De traceability view toont uitsluitend wat de worker al vastlegt:

- Welk record werd geraakt (`record_id`)
- Wat er gebeurde (`created / updated / skipped / failed`)
- Waarom overgeslagen (`skipped_reason`)

Geen `write_values` dump. Geen Odoo API-response body. Geen volledige payload echo (maximaal 5 velden zichtbaar, rest achter collapse). Dit houdt de view bruikbaar en voorkomt data-overload.

---

## 6. Retry & Replay UX

### 6.1 Welke stappen al succesvol waren

In de uitklapbare submission timeline (§5.2) krijgen reeds-succesvolle stappen een ander visueel gewicht bij een retry-weergave:

```
⬤  Stap 1 · Contact    ✅ Aangemaakt #4821   [Overgeslagen bij retry — al gedaan]
⬤  Stap 2 · Lead       ❌ Mislukt — [foutmelding]
⬤  Stap 3 · Bezoeker   ⏭  Overgeslagen — stap 2 mislukt
```

De `skipped_reason` kolom in `fs_v2_submission_targets` (`retry_skip_already_successful` vs `pipeline_abort`) bepaalt het label:

| `skipped_reason` | Label in UI |
|---|---|
| `retry_skip_already_successful` | "Overgeslagen bij retry — al gedaan" (lichtgrijs) |
| `pipeline_abort` | "Overgeslagen — eerdere stap mislukt" (oranje) |
| `null` | Geen badge |

### 6.2 Pipeline abort zichtbaar

Wanneer een stap `error_strategy: stop_on_error` had en mislukte, kleurt de submission-rij in de history niet alleen rood op basis van de status (`partial_failed`), maar toont ook een specifiek icoon:

```
⚡ [partial_failed]  Stap 2 stopte de reeks
```

De `⚡` badge verschijnt op de rij-header. Bij uitklappen toont de timeline de aborted stappen met het "pipeline_abort" label.

### 6.3 Replay visueel onderscheidbaar

Bestaand gedrag: replay-rijen tonen al een `↳` indentatie en `bg-success/5` achtergrond. Uitbreiding:

- Replay-rij toont een badge: **"↳ Replay"** in `badge-ghost`
- Wanneer de replay een stap opnieuw uitvoerde die eerder mislukt was, toont die stap in de timeline groen mét de tekst: *"Geslaagd bij replay"*
- Wanneer een stap al succesvol was in de originele run en werd overgeslagen in de replay: lichtgrijs, *"Niet opnieuw uitgevoerd"*

Geen new replay-engine. Geen nieuwe states. Alleen presentatie-logica op basis van `skipped_reason` in `fs_v2_submission_targets`.

---

## 7. Implementatie Roadmap — Gefaseerd

Elke fase is volledig zelfstandig deploybaar. Geen fase vereist dat de volgende al gestart is.

---

### Fase 1 — Pipeline Fundament

**Scope**: Backend + worker chaining. Geen UI-wijzigingen zichtbaar voor eindgebruikers.

**Deliverables:**

1. **Migratie**: Voeg `label`, `operation_type`, `error_strategy`, `execution_order` toe aan `fs_v2_targets`. Backfill `execution_order` vanuit `order_index`. Defaults zorgen dat alle bestaande integraties onveranderd functioneren.
2. **Migratie**: Voeg `execution_order` en `skipped_reason` toe aan `fs_v2_submission_targets`.
3. **Worker**: `registerTargetOutput()` helper die na elke succesvolle stap `step.<label>.record_id` en `step.<order>.record_id` schrijft in `contextObject`.
4. **Worker**: Dispatch op `operation_type` — split `upsertRecordStrict` in drie code paths in `odoo-client.js`.
5. **Worker**: `stop_on_error` guard na elke mislukte stap. Resterende stappen krijgen `skipped_reason: pipeline_abort`.
6. **Worker**: Retry-skip logic uitgebreid — `pipeline_abort` stappen worden opnieuw uitgevoerd, `retry_skip_already_successful` niet.

**Wat niet verandert**: UI ongewijzigd. Bestaande integraties gedragen zich identiek. `operation_type: upsert` + `error_strategy: allow_partial` zijn defaults.

**Risico**: Geen — alle wijzigingen zijn additief of vervangen bestaand impliciet gedrag door expliciete equivalenten.

---

### Fase 2 — Context Chaining + Traceability UI

**Scope**: Nieuw mapping source type + submission timeline. Geen wizard-aanpassingen.

**Deliverables:**

1. **`resolveMappingValue()`**: Nieuwe branch voor `source_type: previous_step_output` — delegeert naar bestaande `resolveContextValue()`.
2. **`MappingTable.render()`**: `cfg.precedingSteps` parameter. Wanneer aanwezig: extra sectie in source dropdown met "Uitvoer van stap N".
3. **`renderDetailMappings()`**: Bouw `precedingSteps` op vanuit gesorteerde `S().detail.targets` en geef mee aan `MappingTable.render()`.
4. **Server-side validatie**: Extra check op `source_value` bij save mapping — referentie moet naar lagere `execution_order` wijzen.
5. **`renderDetailSubmissions()`** + `actionBadge()`: Uitklapbare timeline-rijen. Payload collapsible. Stap-voor-stap uitkomst met `skipped_reason` labels.
6. **Detail view**: Stepnummer badges op target-headers (alleen zichtbaar bij ≥ 2 targets).
7. **Replay UX**: Badge "↳ Replay" + stap-niveau labels "Geslaagd bij replay" / "Niet opnieuw uitgevoerd".

**Wat niet verandert**: Wizard ongewijzigd. Single-target integraties zien geen enkele wijziging. Geen nieuwe componenten.

**Risico**: Minimaal — uitbreidingen zijn volledig addtief op bestaande render-functies.

---

### Fase 3 — Reorder + Dependency Validatie

**Scope**: Drag-to-reorder + visuele dependency badges. Optioneel en niet blokkerend voor Fase 1+2.

**Deliverables:**

1. **"▲ Omhoog / ▼ Omlaag" knoppen** per target in detail view (simpelere voorganger van drag). Activeert validatiecheck vóór opslaan.
2. **Validatiecheck bij reorder**: Detecteer `previous_step_output` mappings die door de verplaatsing ongeldig worden. Blokkeer met gebruikersvriendelijke foutmelding.
3. **Dependency badges**: "← van stap N" chip naast target-header wanneer een `previous_step_output` mapping aanwezig is.
4. **Zachte waarschuwing** bij naamloze stap met label-based referentie (§3.2).
5. **Optioneel**: Drag-to-reorder als UI-spit boven de pijlen-knoppen — alleen na succesvolle validatielogica uit stap 2–3.

**Wat niet verandert**: Fase 1+2 werken volledig zonder Fase 3. Drag is nooit een vereiste.

---

## 8. Backward Compatibility UX

### 8.1 Single-target integraties

Een integratie met één target ziet **geen enkele UI-wijziging**:

- Geen stepnummer badges (worden alleen getoond bij ≥ 2 targets)
- Geen "Uitvoer van vorige stap" optie in de mapping dropdown (geen vorige stappen)
- Geen "Reeks acties" terminologie (één target = gewone "Actie")
- Geen `operation_type` / `error_strategy` dropdowns zichtbaar (achter collapse, default al correct)

De extra velden bestaan in de DB maar zijn onzichtbaar en werken stilzwijgend correct via defaults.

### 8.2 Bestaande multi-target integraties

Integraties met meerdere targets vandaag (bijv. contact + registratie) krijgen na migratie:

- `execution_order` back-filled vanuit `order_index` — volgorde onveranderd
- `operation_type: upsert` — gedrag identiek aan vandaag
- `error_strategy: allow_partial` — gedrag identiek aan vandaag
- `label: null` — UI toont "Stap 1", "Stap 2" als fallback

Geen functionele verandering. Geen verplichte herconfiguratie.

### 8.3 Bestaande mappings

Geen enkele bestaande mapping-rij wordt aangeraakt. `source_type` waardes `form`, `context`, `static`, `template` werken ongewijzigd. Het nieuwe `previous_step_output` type is alleen van toepassing op nieuw aangemaakte mappings.

---

## 9. Risico-Analyse op UX-niveau

### 9.1 Cognitieve overload

**Risico**: Een marketeer ziet een integratie met 4 stappen, elk met hun operatie-type en foutstrategie, en raakt gedesoriënteerd.

**Mitigatie**:
- Geavanceerde opties zijn standaard ingeklapt. De standaardinstellingen zijn correct voor 90% van de gevallen.
- Stap-labels zijn het enige dat de gebruiker actief moet invullen voor chained flows.
- De stepnummer badges zijn passieve informatie — ze verstoren de workflow niet.

### 9.2 Misconfiguratie door reorder

**Risico**: Gebruiker sleept stap 1 naar positie 3. Stap 2 had een `previous_step_output` mapping naar stap 1. De referentie is nu gebroken.

**Mitigatie**:
- Reorder is in Fase 1 en 2 niet beschikbaar.
- In Fase 3 blokkeren we de reorder vóór opslaan met een expliciete foutmelding.
- Label-based referenties (`step.contact.record_id`) zijn robuuster dan numerieke referenties — door stap-labels te promoten reduceren we de kwetsbaarheid.

### 9.3 Verkeerde chaining

**Risico**: Gebruiker koppelt veld `partner_id` van `crm.lead` aan "Uitvoer van stap 1 — Contact", maar stap 1 doet `update_only` en slaat over als de contact niet bestaat → stap 2 krijgt een lege `partner_id`.

**Mitigatie**:
- Bij `operation_type: update_only` toont de UI een informatieve tekst: *"Let op: als deze stap overslaat, hebben afhankelijke stappen geen Odoo-ID beschikbaar."*
- In de submission timeline is het resultaat direct zichtbaar: stap 2 zal `failed` of `skipped` tonen met de herleidbare reden.
- Voor robustere flows combineert de gebruiker `update_only` met `error_strategy: stop_on_error` — precies wat de UI-opties samen communiceren.

### 9.4 Replay die onverwacht records aanmaakt

**Risico**: Gebruiker klikt "Replay" op een failed submission die een `operation_type: create` target bevat. Er wordt een tweede Odoo-record aangemaakt.

**Mitigatie**:
- In de submission history toont de Replay-knop een confirmatiedialog wanneer de integratie ≥ 1 target heeft met `operation_type: create`: *"Let op: deze integratie bevat een stap die altijd een nieuw Odoo-record aanmaakt. Een replay maakt dus een extra record aan in '[model]'. Wil je doorgaan?"*
- Dit is een één-keer waarschuwing — geen blokkering. De gebruiker heeft expliciete controle.
- De submission timeline maakt achteraf zichtbaar welke stappen bij de replay nieuwe records hadden aangemaakt versus overgeslagen.

### 9.5 Stop-on-error verborgen als oorzaak

**Risico**: Stap 3 mislukte, maar de eigenlijke oorzaak is dat stap 2 ook mislukte en de pipeline stopte. Gebruiker ziet alleen dat stap 3 "Overgeslagen" is en onderzoekt de verkeerde stap.

**Mitigatie**:
- De "Overgeslagen — eerdere stap mislukt" label in de timeline bevat een klikbare referentie naar de stap die de pipeline deed stoppen: *"Overgeslagen — stap 2 mislukte en stopte de reeks"*.
- De volgorde van stappen in de timeline is altijd chronologisch — de mislukking is altijd boven de overgeslagen stap zichtbaar.

---

*Einde van Addendum B.1 — UX & Traceability Refinement*
