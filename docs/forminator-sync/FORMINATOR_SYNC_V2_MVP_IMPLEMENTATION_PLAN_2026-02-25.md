# Forminator Sync V2 — MVP Implementatieplan (Freeze)
Datum: 2026-02-25

## 1) MVP FREEZE (kritisch)

Dit document is bindend voor V2 MVP binnen 4–6 weken. Elke wijziging buiten deze lijst is automatisch “out of scope” en wordt niet gebouwd in MVP.

Alles wat branching vereist, valt buiten MVP.

### Definitief WEL in MVP
- Nieuwe V2-module, volledig los van V1 code en V1-tabellen.
- Mentaal model: Resolvers → Context → Targets.
- Exact 2 resolvertypes:
  - partner_by_email
  - webinar_by_external_id
- Maximaal 2 targets per integratie.
- Toegestane targets in MVP:
  - crm.lead
  - res.partner
  - x_webinarregistrations
- Exact 2 update policies:
  - always_overwrite
  - only_if_incoming_non_empty
- Idempotency op webhookniveau met vaste keydefinitie.
- Automatische retry alleen voor recoverable fouten.
- Partial failure status per submission.
- History + replay.
- Activatieblokkering zonder geslaagde test.

### Definitief NIET in MVP
- Generic resolver.
- Extra resolvertypes buiten de 2 vastgelegde types.
- Meer dan 2 targets per integratie.
- Branching, voorwaarden, rule engine, scripts, expressies.
- Vrije composite identifiers.
- Per-veld update policy.
- Auto-suggest mappings.
- Geavanceerde transformatieregels.
- Cross-target rollbacktransacties.
- Migratie-assistent voor V1-configuraties.

### Freeze-toets voor nieuwe featureverzoeken
Een verzoek wordt alleen toegelaten als het aan alle 4 criteria voldoet:
- Geen branching of conditionele logica.
- Geen nieuw resolvertype.
- Geen uitbreiding voorbij 2 targets.
- Geen impact op 4–6 weken livegang.

Als één criterium faalt: verzoek gaat naar V2.1 en wordt niet in MVP opgenomen.

## 2) Functionele specificatie (definitief)

### Resolvers (exact 2)
1. partner_by_email
- Input: form email-veld.
- Actie: zoek res.partner op email.
- Create-if-missing: toegestaan en configureerbaar als ja/nee.
- Output: context.partner_id.

2. webinar_by_external_id
- Input: form webinar identifier-veld.
- Actie: zoek x_webinar op extern ID.
- Create-if-missing: niet toegestaan.
- Output: context.webinar_id.

### Targets (max 2 per integratie)
- Integratie heeft 1 of 2 targets, nooit meer.
- Toegestane modellen: crm.lead, res.partner, x_webinarregistrations.

### Identifierlogica (vast gedefinieerd)
- crm.lead: identifier = form.email.
- res.partner: identifier = form.email.
- x_webinarregistrations: identifier = context.partner_id + context.webinar_id.
- Geen andere identifierpatronen in MVP.

### Update policy (exact 2 varianten)
- always_overwrite: inkomende waarde overschrijft bestaande waarde altijd.
- only_if_incoming_non_empty: overschrijf alleen als inkomende waarde niet leeg is.
- Standaard in UI: only_if_incoming_non_empty.

### Idempotency (definitieve keuze)
- Idempotency key = integration_id + forminator_form_id + payload_hash.
- payload_hash wordt berekend op genormaliseerde payload (stabiele veldvolgorde, trim op stringranden, lege trailing waarden genegeerd).
- Sleutel is uniek binnen 7 dagen retentionwindow.

### Retrystrategie (definitieve keuze)
- Alleen recoverable fouten krijgen retry.
- Aantal retries: 3 pogingen totaal (eerste run + 2 retries).
- Timing: retry na 1 minuut, daarna 5 minuten.
- Na derde mislukking: status failed_permanent_retry_exhausted.

### Partial failure policy (definitieve keuze)
- Partial failure = minimaal 1 target geslaagd en minimaal 1 target gefaald.
- Geen rollback van geslaagde targets.
- Eindstatus wordt partial_failed.
- Replay blijft beschikbaar voor herverwerking na fix.

## 3) UX-definitie (verplicht concreet)

## Pagina-opbouw (5 blokken)

### Blok 1: Basisinstellingen
Velden:
- Integratienaam (verplicht)
- Formulier (verplicht)
- Odoo-verbinding (verplicht)
- Actief (toggle, standaard uit)

Foutmeldingen:
- “Kies een formulier.”
- “Kies een Odoo-verbinding.”
- “Geef een integratienaam op.”

### Blok 2: Herkenning
Velden:
- Herkenningstype (dropdown, exact 2 keuzes)
- Formulier-veld (verplicht)
- Nieuw contact maken als niet gevonden (alleen zichtbaar bij partner_by_email)
- Opslaan als (output key, automatisch ingevuld, niet vrij bewerkbaar)

Verplicht:
- Minstens 1 herkenning.
- partner_by_email vereist geldig email-veld.

Foutmeldingen:
- “Kies een herkenningstype.”
- “Kies een formulier-veld voor deze herkenning.”
- “Dit formulier-veld bevat geen bruikbaar e-mailadres.”

### Blok 3: Schrijf naar Odoo
Velden:
- Doelmodel (dropdown: crm.lead, res.partner, x_webinarregistrations)
- Recordherkenning (read-only tekst op basis van model)
- Updatebeleid (exact 2 keuzes)

Conditioneel zichtbaar:
- Bij x_webinarregistrations verschijnt vaste melding: “Record wordt herkend op contact + webinar.”

Foutmeldingen:
- “Kies een Odoo-doel.”
- “Maximaal 2 doelen toegestaan in MVP.”

### Blok 4: Veldkoppelingen
Velden per rij:
- Odoo veld (verplicht)
- Bron (formulier / herkende gegevens / vaste waarde) (verplicht)
- Bronwaarde (verplicht)

Verplicht:
- Voor elk target minstens 1 mapping.
- Voor x_webinarregistrations zijn partner_id en webinar_id verplicht gemapt.
- Voor crm.lead is email_from verplicht gemapt.

Foutmeldingen:
- “Map alle verplichte velden.”
- “Bronwaarde ontbreekt.”
- “Dit veld is dubbel gekoppeld.”

### Blok 5: Test en geschiedenis
Onderdelen:
- Test uitvoeren (verplicht vóór activatie)
- Laatste testresultaat
- Laatste verwerkingen (statuslijst)
- Opnieuw uitvoeren op geselecteerde verwerking

Foutmeldingen:
- “Activatie geblokkeerd: voer eerst een geslaagde test uit.”
- “Test mislukt: controleer herkenning en veldkoppelingen.”

## Wat blokkeert activatie
Integratie kan alleen actief worden als alle checks slagen:
- Basisinstellingen volledig.
- Minstens 1 herkenning correct ingesteld.
- 1 of 2 doelen correct ingesteld.
- Verplichte veldkoppelingen volledig.
- Laatste teststatus = geslaagd.

## Terminologie in UI
Toegestaan:
- Herkenning
- Herkende gegevens
- Schrijf naar Odoo
- Recordherkenning
- Veldkoppeling
- Opnieuw uitvoeren

Niet zichtbaar voor marketeer:
- Resolver
- Context
- Target
- Identifier
- Idempotency
- Partial failure
- Upsert

## Activatieflow
- Stap 1: gebruiker configureert blok 1–4.
- Stap 2: gebruiker voert test uit in blok 5.
- Stap 3: systeem valideert verplichte checks.
- Stap 4: alleen bij geslaagde test wordt “Actief” toegestaan.
- Stap 5: bij activatie wordt validatiestatus vastgelegd in history.

## 4) Operationeel gedrag (verplicht scherp)

### Idempotency
- Keyberekening: integration_id + forminator_form_id + payload_hash.
- Submission wordt genegeerd als dezelfde key al status processed of partial_failed heeft.
- duplicate_inflight: als dezelfde key al running is, tweede call krijgt status duplicate_inflight en stopt direct.
- running timeout: maximaal 15 minuten; daarna wordt status stale_running en komt submission in retryflow.

### Retry
Recoverable fouten:
- Odoo timeout.
- Tijdelijke netwerkstoring.
- Odoo 5xx.
- Odoo rate limit.

Niet-recoverable fouten:
- Ongeldige mapping.
- Ontbrekend verplicht veld.
- Odoo validatiefout 4xx.
- Ontbrekende webinar of partner bij verplichte identificatie.

Retryschema:
- Poging 1: direct.
- Poging 2: +1 minuut.
- Poging 3: +5 minuten.
- Daarna definitieve stop met failed_permanent_retry_exhausted.

### Partial failure
- Geen rollback.
- Support ziet per target een duidelijke uitkomst: created, updated, failed.
- Marketeer ziet status: “Deels verwerkt” met korte samenvatting en actie “Opnieuw uitvoeren”.

## 5) Datamodel (bevroren)

Exact 6 tabellen.

### 1. fs_v2_integrations
Doel:
- Basis van integratieconfiguratie en activatiestatus.

Absoluut verplichte velden:
- id
- name
- forminator_form_id
- odoo_connection_id
- is_active
- created_at
- updated_at

### 2. fs_v2_resolvers
Doel:
- Vastleggen van herkenningsregels.

Absoluut verplichte velden:
- id
- integration_id
- order_index
- resolver_type
- input_source_field
- create_if_missing
- output_context_key
- is_enabled

### 3. fs_v2_targets
Doel:
- Vastleggen van Odoo schrijfdoelen en updatebeleid.

Absoluut verplichte velden:
- id
- integration_id
- order_index
- odoo_model
- identifier_type
- update_policy
- is_enabled

### 4. fs_v2_mappings
Doel:
- Veldkoppelingen per target.

Absoluut verplichte velden:
- id
- target_id
- order_index
- odoo_field
- source_type
- source_value
- is_required

### 5. fs_v2_submissions
Doel:
- Idempotency, runtime status, retries en audit op submissionniveau.

Absoluut verplichte velden:
- id
- integration_id
- idempotency_key
- payload_hash
- source_payload
- resolved_context
- status
- retry_count
- started_at
- finished_at
- created_at

### 6. fs_v2_submission_targets
Doel:
- Resultaat per target per submission.

Absoluut verplichte velden:
- id
- submission_id
- target_id
- action_result
- odoo_record_id
- error_detail
- processed_at

### Bewust NIET toegevoegd
- Geen replay job tabel.
- Geen generieke config JSON blobs.
- Geen policy-config tabellen.
- Geen transformatietabellen.
- Geen uitbreidingshaakjes voor conditionele regels.

## 6) Definition of Done (engineering)

MVP is pas “done” als alle punten aantoonbaar groen zijn:
- End-to-end webinar scenario werkt.
- End-to-end contactscenario werkt.
- Duplicate webhook veroorzaakt geen dubbele Odoo-records.
- Recoverable fout wordt automatisch hersteld binnen retrieschema.
- Permanent fout stopt retry direct.
- Replay werkt en maakt nieuwe verwerkingsentry met link naar origineel.
- Activatie is geblokkeerd zonder geslaagde test.
- Max 2 targets wordt technisch afgedwongen.
- Alleen 2 resolvertypes zijn beschikbaar in UI en backendvalidatie.

## 7) Implementation Roadmap (max 3 fases)

### Fase 1: Foundation
Deliverables:
- Datamodel (6 tabellen) operationeel.
- Integratiebeheer voor blok 1–4.
- Validatieregels voor verplichte velden en targetlimiet.

Acceptatiecriteria:
- Integratie kan opgeslagen en gevalideerd worden.
- UI toont alleen toegelaten resolver- en targetkeuzes.
- Activatie blijft geblokkeerd zonder testresultaat.

Niet gebouwd in fase 1:
- Webhookverwerking.
- Retrymechanisme.
- Replay.

### Fase 2: Core Flow
Deliverables:
- Webhook intake.
- Resolvers → herkende gegevens → targets verwerking.
- Idempotency check en duplicate-afhandeling.
- Submission history + targetresultaten.

Acceptatiecriteria:
- Webinar en contactscenario werken end-to-end.
- duplicate_inflight en duplicate_ignored zijn zichtbaar in history.
- Geen dubbele Odoo-records bij dubbele payload.

Niet gebouwd in fase 2:
- Automatische retries.
- Replayfunctie.

### Fase 3: Hardening
Deliverables:
- Retryflow volgens vast schema.
- Partial failure status en UX-weergave.
- Replay vanuit history.
- Operationele statussen voor support en marketeer.

Acceptatiecriteria:
- Recoverable fouten gaan automatisch door retrieschema.
- Permanent fouten stoppen zonder extra retries.
- Replay herverwerkt correct met bestaande idempotencyregels.

Niet gebouwd in fase 3:
- Extra resolvertypes.
- Auto-suggest mappings.
- V1 migratie-assistent.

## 8) Scope Guardrails

### Featureverzoeken die automatisch geweigerd worden
- Alles met branching/if-then logica.
- Alles dat een derde resolvertype introduceert.
- Alles dat meer dan 2 targets vereist.
- Alles met scriptbaarheid of vrije expressies.
- Alles dat een generiek integratieframework impliceert.

### Uitbreidingen die pas in V2.1 mogen
- Extra resolvertypes buiten de 2 MVP-types.
- Auto-suggest mappings.
- Per-veld update policy.
- Extra targetmodellen buiten de 3 MVP-modellen.
- Verbeterde migratietooling voor V1 naar V2.

### Besliskader MVP vs Nice-to-have
Elk verzoek krijgt een binaire uitkomst:
- MVP: alleen als het bestaande freeze versterkt zonder scope-uitbreiding.
- V2.1: zodra het nieuwe logica, extra varianten of extra configuratieruimte introduceert.

Beslissingsregel:
- Bij twijfel is het V2.1.
