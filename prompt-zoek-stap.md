# Nieuw stapgedrag: `search` (record opzoeken op een ander model)

## Lees eerst deze bestanden voor je begint

- `src/modules/forminator-sync-v2/worker-handler.js` (vooral `runResolver`, `buildIdentifierDomainForTarget`, `registerTargetOutput`, `restoreStepOutputsFromDB`, `shouldSkipOnRetry`, `checkRequiredDependencies`, en de dispatch op `opType` rond r. 1495–1570)
- `src/modules/forminator-sync-v2/validation.js`
- `src/modules/forminator-sync-v2/odoo-client.js` (`findRecordByIdentifier`, `updateOnlyRecord`)
- `src/modules/forminator-sync-v2/database.js` (targets/mappings CRUD, `listSubmissionTargetResults`)
- `src/modules/forminator-sync-v2/routes.js` (target-routes)
- `public/forminator-sync-v2-detail-mapping-tab.js`
- `public/forminator-sync-v2-mapping-table.js`
- `supabase/migrations/20260303100000_forminator_sync_v2_pipeline_phase1.sql`
- `supabase/migrations/20260908160000_fsv2_send_mail_step.sql` (voorbeeld van hoe een nieuw gedrag eerder is toegevoegd)
- `CLAUDE.md`

## Context

Vandaag heeft elke stap (`fs_v2_targets`) een `operation_type`: `upsert`, `create`, `update_only`, plus de niet-schrijvende varianten `create_activity`, `send_mail`, `chatter_message`, `mailing_list`. De identifier van een stap gaat **altijd over het model van die stap zelf** (`identifier_type` + `is_identifier`-mappings → `buildIdentifierDomainForTarget`).

Wat ontbreekt: een record op een **ander** model opzoeken en dat in een volgende stap als many2one gebruiken. Concreet voorbeeld: stap "maak een bedrijf" (`res.partner`) moet gekoppeld worden aan het contact met `x_studio_generated_unique_identifier = X`.

In v1 loste `runResolver` dit op, maar hardcoded (`partner_by_email`, `webinar_by_external_id`) én met `create_if_missing`. We willen het configureerbaar, en zonder aanmaken.

**Gekozen richting: een aparte zoek-stap, geen "koppel"-gedrag op de schrijfstap.**

Reden: de pipeline heeft de bouwstenen al. `registerTargetOutput` schrijft `step.<order>.record_id` en `step.<label>.record_id`, en `source_type: 'previous_step_output'` leest die. Een zoek-stap is dus alleen "de bestaande resolver, maar configureerbaar en zichtbaar in het stappenlijstje". Een `koppel`-gedrag zou daarentegen twee betekenissen van "identifier" in één stap proppen (welk record schrijf ik / welk record wijs ik aan), werkt maar voor één many2one per stap, en verbergt de lookup in het uitvoerlogboek. Met een zoek-stap krijg je per opzoeking een eigen rij in `fs_v2_submission_targets` — zichtbaar in de inzending, en herbruikbaar door meerdere volgende stappen.

## Wat je implementeert

### 1. Migratie

`supabase/migrations/<timestamp>_fsv2_search_step.sql`:

```sql
ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS search_on_not_found text NOT NULL DEFAULT 'abort';

COMMENT ON COLUMN fs_v2_targets.search_on_not_found
  IS 'Gedrag van een search-stap als er geen record gevonden wordt: abort (stap faalt), skip_step (stap wordt overgeslagen, volgende stappen die ervan afhangen krijgen dependency_missing) of continue_empty (leeg resultaat, pipeline gaat door).';
```

Er staan geen CHECK-constraints op `operation_type` of `action_result`, dus daar hoeft niets aan. Voeg wel de rollback-commentaar onderaan toe, zoals in `20260304180000_fsv2_chatter_message.sql`.

### 2. `worker-handler.js` — dispatch

Behandel `search` **vóór** het blok "Build values", in dezelfde stijl als `chatter_message` / `mailing_list` (eigen blok, eindigend op `continue`). Een zoek-stap schrijft niets, dus `buildIncomingValuesFromMappings` / `buildUpdateValuesFromMappings` mogen er niet overheen lopen.

```js
if (opType === 'search') {
  const searchDomain = buildIdentifierDomainForTarget(target, mappings, normalizedForm, contextObject);
  const found = await findRecordByIdentifier(env, {
    model: target.odoo_model,
    identifierDomain: searchDomain,
    fields: ['id']
  });
  // found?.id → action_result 'found', odoo_record_id = found.id, registerTargetOutput(...)
  // niet gevonden → volg target.search_on_not_found
  continue;
}
```

- **gevonden**: `action_result: 'found'`, `odoo_record_id` gezet, daarna `registerTargetOutput(contextObject, target, { action: 'found', recordId: found.id }, mappings)`.
- **`abort`** (default): gooi `createPermanentError` met een leesbare melding die het model, het identifierveld én de gezochte waarde noemt. De bestaande catch eromheen maakt daar `failed` van en respecteert `stop_on_error`.
- **`skip_step`**: `action_result: 'skipped'`, `skipped_reason: 'not_found'`, géén step-output. Volgende stappen met een `is_required` `previous_step_output`-mapping vallen dan vanzelf in de bestaande `dependency_missing`-tak (`checkRequiredDependencies`).
- **`continue_empty`**: `action_result: 'skipped'`, `skipped_reason: 'not_found'`, maar wél step-output met `record_id: null`.

### 3. `worker-handler.js` — `found` in de drie whitelists

`'found'` is een nieuwe waarde van `action_result`. Voeg 'm toe aan:

- `shouldSkipOnRetry` → `['created', 'updated', 'skipped', 'found']`
- `restoreStepOutputsFromDB` → idem, anders is het gevonden id na een retry weg
- `buildIdentifierDomainForTarget` hoeft niets, maar controleer `classifyFinalSubmissionStatus` — die telt alleen `failed` en `pipeline_abort`, dus `found` telt correct als succes. Laat 'm zoals hij is.

Voeg ook een test toe die precies dit bewijst: zoek-stap slaagt, daarna een retry, en het `step.N.record_id` van de zoek-stap is er nog.

### 4. Identifier op een id-veld

Voor de omgekeerde koppeling (zie "Wat dit oplost") moet een stap een record kunnen identificeren op het id uit een vorige stap. Dat kan via `identifier_type: 'mapped_fields'` met een mapping op `odoo_field: 'id'`, `source_type: 'previous_step_output'`, `is_identifier: true`.

Eén guard is daarvoor nodig: `id` mag nooit in de schrijfwaarden belanden. Sla in `buildIncomingValuesFromMappings` én `buildUpdateValuesFromMappings` elke mapping met `odoo_field === 'id'` over.

Raak `identifier_type: 'odoo_id'` niet aan — dat staat wel in `IDENTIFIER_TYPES` in `validation.js` maar heeft geen implementatie in `buildIdentifierDomainForTarget`. Als je het wil opruimen, doe dat in een aparte opdracht.

### 5. `validation.js`

In `validateTargetPayload`, vóór de model-whitelist-check, een eigen tak voor `search`:

- `odoo_model` verplicht
- `identifier_type` moet `mapped_fields` zijn (single_email/registration_composite zijn schrijfmodel-specifiek en hier zinloos)
- `search_on_not_found`, indien gezet, moet in `['abort', 'skip_step', 'continue_empty']` zitten
- géén `update_policy`-controle — een zoek-stap schrijft niet
- daarna `return`

En in `validateActivationReadiness`: een `search`-stap zonder enkele `is_identifier`-mapping mag niet activeerbaar zijn. Dat is de enige echte manier waarop deze stap stil kan mislukken.

### 6. UI

In `public/forminator-sync-v2-detail-mapping-tab.js` en `public/forminator-sync-v2-mapping-table.js`:

- Nieuw item in de gedrag-picker (`_opIcons` / de optiearray): `{ value: 'search', icon: 'search', label: 'Zoeken — record opzoeken, niets schrijven' }`
- Label in `OP_LABELS`: `'search': 'Opzoeken'`
- Bij gedrag `search`: toon alleen de identifier-kolom in de mappingtabel, verberg "bijwerken bij update" en de update-policy-keuze
- Een keuzeveld voor `search_on_not_found` met de drie waarden, default "Stap laten falen"
- De bestaande waarschuwing bij `upsert`/`update_only` zonder identifier (rond r. 1320) moet ook voor `search` gelden
- Geen inline `onclick`/`onchange` met variabelen — `data-action` + de bestaande centrale listener, zoals de rest van het bestand

### 7. Tests

`src/modules/forminator-sync-v2/tests/` — nieuw bestand `search-step-test.mjs`:

1. zoek-stap vindt een record → `found` + `step.1.record_id` gezet
2. niet gevonden + `abort` → stap `failed`, foutmelding noemt model en waarde
3. niet gevonden + `skip_step` → stap `skipped`, volgende stap met `is_required` previous_step_output → `dependency_missing`
4. niet gevonden + `continue_empty` → volgende stap draait met een lege many2one
5. retry na een geslaagde zoek-stap → `step.1.record_id` overleeft `restoreStepOutputsFromDB`
6. een `search`-stap schrijft nooit naar Odoo (geen `create`/`write`-call in de mock)

## Wat dit oplost (het scenario van Nico, als configuratie)

Voorwaartse koppeling — het nieuwe bedrijf wijst naar het gevonden contact:

1. **Stap 1** — `res.partner`, gedrag `search`, identifier-mapping `x_studio_generated_unique_identifier` ← formulierveld. Label: `contact`.
2. **Stap 2** — `res.partner`, gedrag `upsert` (bestaat → bijwerken, bestaat niet → aanmaken), met een mapping `<many2one veld>` ← `previous_step_output: step.contact.record_id`, `is_required: true`.

Omgekeerde koppeling — `parent_id` van het gevonden contact op het nieuwe bedrijf zetten (dit is wat "koppel het contact aan het bedrijf" via `parent_id` in Odoo feitelijk betekent, want `parent_id` staat op het contact):

3. **Stap 3** — `res.partner`, gedrag `update_only`, identifier-mapping `id` ← `previous_step_output: step.contact.record_id`, plus schrijfmapping `parent_id` ← `previous_step_output: step.2.record_id`.

Beide richtingen, zonder nieuw gedrag op de schrijfstap. Dat is het argument voor deze aanpak: een `koppel`-gedrag zou alleen richting 1 dekken.

## Wat je NIET aanraakt

- `runResolver` en de bestaande resolvertypes — die blijven werken; een migratie van resolvers naar zoek-stappen is een aparte opdracht
- `identifier_type: 'odoo_id'` (dode waarde in `validation.js`)
- `src/modules/forminator-sync-v2/ui.js` (legacy)
- `mail-step.js`, `postmark-webhook.js`, de `forms/`-map
- De bestaande gedragingen `upsert`, `create`, `update_only`, `create_activity`, `send_mail`, `chatter_message`, `mailing_list` — geen gedragswijziging, alleen de twee whitelists uit punt 3 en de `id`-guard uit punt 4
- Supabase-tabellen van andere modules

Lees ook `CLAUDE.md` voor de projectregels.
