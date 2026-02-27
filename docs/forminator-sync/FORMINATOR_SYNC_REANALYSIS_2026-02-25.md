# Forminator Sync V2 — Iteratie 2 (MVP Functionele Analyse & Implementatieplan)
Datum: 2026-02-25

## Executive summary
V2 wordt een nieuwe, aparte module naast V1, met nieuwe tabellen, nieuwe UI en nieuwe verwerkingsflow.
De MVP is bewust klein: Resolvers → Context → Targets, zonder generieke engine.
Scope is gericht op 4–6 weken livegang: webinarregistratie en contactformulier-flow.
We beperken resolvertypes tot 2, beperken targetcomplexiteit en schrappen advanced features.
Idempotency is verplicht: dubbele webhooks mogen geen dubbele Odoo-records veroorzaken.
Retrybeleid is strak: alleen recoverable fouten krijgen automatische retries.
Partial failures worden expliciet ondersteund met zichtbare status per target.
Datamodel wordt minimaal gehouden, zonder overmatige JSON-configblobs.
UX-termen worden vertaald naar marketeer-taal en schermcomplexiteit wordt verlaagd.
V1 blijft draaien; V2 wordt gefaseerd ingevoerd met duidelijke cutovercriteria.

## 1) Wat is V2 MVP exact?

### Wat kan het
- Forminator webhook ontvangen en valideren.
- Per integratie identiteiten herkennen via resolvers.
- Context opbouwen met herkende IDs.
- Naar maximaal 2 Odoo-doelen schrijven per integratie.
- Submission verwerken met idempotency, retries en history.
- Eén submission opnieuw uitvoeren via replay vanuit history.

### Wat kan het NIET
- Geen workflow builder.
- Geen branchings of voorwaarden.
- Geen scriptbare transformaties.
- Geen drag & drop configuratie.
- Geen onbeperkt aantal targetstappen.

### Wat is bewust uitgesteld
- Auto-suggest mappings.
- Geavanceerde update policies per veld.
- Meer dan 2 resolvertypes.
- Meer dan 2 targets per integratie.
- Volledige migratie-assistent van V1-configuraties.

## 2) Definitieve MVP scope

### Resolvers (definitief)
MVP bevat exact 2 resolvertypes:
- partner_by_email
- webinar_by_external_id

Keuzes:
- Geen generic resolver in MVP.
- Geen third resolvertype in MVP.
- Resolver doet alleen: zoeken, optioneel aanmaken, context-ID zetten.

Create-if-missing regels:
- partner_by_email: toegestaan (aan/uit per integratie)
- webinar_by_external_id: niet toegestaan in MVP (alleen lookup)

### Targets (definitief)
- Maximaal 2 targets per integratie.
- Toegestane modellen in MVP:
  - crm.lead
  - res.partner
  - x_webinarregistrations

Composite identifier:
- Ja, maar alleen voor x_webinarregistrations.
- Exact patroon: context.partner_id + context.webinar_id.
- Geen vrij configureerbare composities in MVP.

Single identifier:
- crm.lead: form.email of context.partner_id (keuze uit beperkte lijst)
- res.partner: form.email

Update policy (definitief: 2 varianten)
- always_overwrite
- only_if_incoming_non_empty

Standaard:
- only_if_incoming_non_empty

Niet in MVP:
- fill_only_if_target_empty
- policy per individueel veld

## 3) Idempotency & betrouwbaarheid (verplicht)

### Dubbele webhook detectie
We slaan per ontvangen submission een idempotency key op en blokkeren dubbele verwerking.

### Idempotency key (MVP definitie)
Idempotency key = combinatie van:
- integration_id
- webhook event timestamp (of delivery id indien beschikbaar)
- genormaliseerde payload hash

Regel:
- Als dezelfde key al succesvol verwerkt is: markeer als duplicate_ignored en voer geen Odoo schrijfacties opnieuw uit.
- Als dezelfde key nog in status running staat: markeer als duplicate_inflight en negeer tweede run.

### Retry vanuit Forminator
- Als Forminator dezelfde payload opnieuw stuurt, loopt die door idempotency check.
- Resultaat: geen dubbele records, wel history entry met duplicate status.

### Worker crash scenario
- Submissionstatus wordt bij start op running gezet met started_at.
- Stale running jobs (ouder dan ingestelde timeout) worden recoverable en opnieuw ingepland.
- Herstart gebruikt dezelfde idempotency key en dezelfde execution state-check.

### Dubbele records in Odoo voorkomen
- Voor elk target altijd eerst identifier lookup.
- Alleen create wanneer lookup geen record vindt.
- Bij retries en duplicates geen blind create pad.

## 4) Foutenstrategie (verplicht)

### Recoverable failures
- Tijdelijke Odoo timeouts.
- Tijdelijke netwerkfouten.
- Odoo 5xx of rate limit.

Beleid:
- Automatische retries met backoff.
- Max 3 pogingen totaal.

### Permanent failures
- Ongeldige configuratie.
- Ontbrekende verplichte inputvelden.
- Ongeldige mapping naar niet-bestaand Odoo-veld.
- Odoo 4xx validatiefouten die niet transient zijn.

Beleid:
- Geen automatische retry.
- Status failed_permanent met duidelijke foutoorzaak.

### Partial failure
Definitie:
- Minstens één target geslaagd en minstens één target gefaald.

Beleid:
- Geen rollback van al geslaagde targets in MVP.
- Eindstatus partial_failed.
- Support kan herstarten via replay na configuratiefix.

### Rollbackbeleid
- Geen cross-target transactierollback in MVP.
- Reden: operationele eenvoud en voorspelbaarheid binnen 4–6 weken scope.

### Retry policy (expliciet)
- Alleen recoverable fouten.
- Backoff: kort, middellang, lang (3 stappen).
- Daarna final failure status met retry_count en last_error.

## 5) Minimalistisch datamodel

Doel: minimum tabellen, minimum configuratievrijheid, maximum traceerbaarheid.

### Tabel 1: fs_v2_integrations
Waarom nodig:
- Basisconfiguratie per formulier en activatiestatus.

Velden:
- id
- name
- forminator_form_id
- odoo_connection_id
- is_active
- created_at
- updated_at

### Tabel 2: fs_v2_resolvers
Waarom nodig:
- Resolver-instellingen apart beheren per integratie.

Velden:
- id
- integration_id
- order_index
- resolver_type
- input_source_field
- create_if_missing
- output_context_key
- is_enabled

### Tabel 3: fs_v2_targets
Waarom nodig:
- Targets en hun kerninstellingen vastleggen.

Velden:
- id
- integration_id
- order_index
- odoo_model
- identifier_type (single_email, partner_context, registration_composite)
- update_policy
- is_enabled

Waarom geen JSON blob hier:
- Identifier-opties zijn in MVP beperkt en passen in enum-achtige velden.
- Minder foutkans, eenvoudiger validatie.

### Tabel 4: fs_v2_mappings
Waarom nodig:
- Mappingregels per target apart beheren.

Velden:
- id
- target_id
- order_index
- odoo_field
- source_type (form, context, static)
- source_value
- is_required

### Tabel 5: fs_v2_submissions
Waarom nodig:
- Verwerkingsstatus, idempotency en operationele opvolging.

Velden:
- id
- integration_id
- idempotency_key
- payload_hash
- source_payload
- resolved_context
- status (received, running, processed, partial_failed, failed_permanent, failed_recoverable, duplicate_ignored)
- retry_count
- last_error
- started_at
- finished_at
- created_at

### Tabel 6: fs_v2_submission_targets
Waarom nodig:
- Target-resultaten per submission zichtbaar maken.

Velden:
- id
- submission_id
- target_id
- action_result (created, updated, skipped, failed)
- odoo_record_id
- error_detail
- processed_at

### Wat we expliciet schrappen in datamodel
- Geen aparte replay_jobs tabel in MVP (replay loggen als nieuwe submission met replay_reference).
- Geen execution_plan snapshots als aparte structuur.
- Geen generieke policy_config velden.
- Geen transform libraries of rule tabellen.

## 6) UX MVP (marketeer-taal)

### Terminologievertaling
- Resolver → Herkenning
- Context → Herkende gegevens
- Target → Schrijf naar Odoo
- Identifier → Hoe herkennen we dit record?
- Replay → Opnieuw uitvoeren

### Pagina-opzet (vereenvoudigd)
1. Basisinstellingen
2. Herkenning
3. Schrijf naar Odoo
4. Veldkoppelingen
5. Test en geschiedenis

### Blokvereenvoudiging
- Geen aparte advanced panel in MVP.
- Alleen zichtbare keuzes die nodig zijn.
- Max 2 targets visueel afgedwongen.
- Composite-optie alleen zichtbaar bij x_webinarregistrations.

### UX-regels
- Elke foutmelding bevat “wat moet ik aanpassen?”.
- Geen technische termen zoals many2one of upsert in primaire labels.
- Activeren van integratie alleen na geslaagde test.

## 7) Concrete MVP voorbeelden (verplicht)

### Voorbeeld 1: Webinarregistratie
Doel:
- Inschrijving verwerken naar x_webinarregistrations.

Instelling:
- Herkenning 1: partner_by_email op form.email, create_if_missing aan.
- Herkenning 2: webinar_by_external_id op form.webinar_id, create_if_missing uit.
- Schrijfdoel: x_webinarregistrations.
- Recordherkenning: partner_id + webinar_id.
- Update policy: only_if_incoming_non_empty.
- Velden: partner_id, webinar_id, naam, bron.

Resultaat:
- Bestaande registratie wordt geüpdatet, anders aangemaakt.
- Dubbele webhook veroorzaakt geen dubbele registratie.

### Voorbeeld 2: Contactformulier naar lead
Doel:
- Contactaanvraag als lead in crm.lead.

Instelling:
- Herkenning 1: partner_by_email op form.email, create_if_missing aan.
- Schrijfdoel 1: crm.lead met recordherkenning via form.email.
- Schrijfdoel 2 (optioneel): res.partner via form.email.
- Update policy: only_if_incoming_non_empty.
- Velden: leadnaam, email, bericht, partner_id.

Resultaat:
- Lead wordt consistent gecreëerd of geüpdatet.
- Partner blijft gekoppeld voor opvolging.

## 8) Wat komt expliciet NIET in MVP

- Generic resolver.
- Extra resolvertypes buiten partner_by_email en webinar_by_external_id.
- Branching of conditionele logica.
- Rule engine of expressies.
- Vrij configureerbare composite identifiers.
- Meer dan 2 targets per integratie.
- Per-veld update policy.
- Geavanceerde transformaties.
- Auto-suggest mappings.
- Volledige V1-import wizard.
- Cross-target rollbacktransacties.

## 9) Realistische implementatiefases (max 3)

### Fase 1: Foundation (week 1–2)
- Nieuwe V2 module-skelet en basis API-contracten.
- Minimalistisch datamodel en validatieregels.
- Basis UI met 5 blokken en marketeer-taal.

Exit criteria:
- Integratie kan aangemaakt en bewaard worden.
- Config-validatie geeft bruikbare foutmeldingen.

### Fase 2: Core flow (week 3–4)
- Webhook intake + idempotency key verwerking.
- Resolver-run + context-opbouw.
- Target-run met identifier lookup en create/update.
- Submission history en targetresultaten.

Exit criteria:
- Webinar en contactscenario werken end-to-end.
- Duplicates maken geen dubbele Odoo-records.

### Fase 3: Hardening (week 5–6)
- Retrylogica voor recoverable fouten.
- Partial failure status en duidelijke historyweergave.
- Replay vanuit history.
- Operationele monitoring op kern-KPI’s.

Exit criteria:
- Recoverable fouten worden stabiel hersteld.
- Support kan failures diagnosticeren en replayen zonder engineering-hulp.

## 10) Risicoanalyse

### Grootste technische risico’s
- Idempotency key te zwak, waardoor duplicates toch doorschieten.
- Odoo lookup-kwaliteit onvoldoende (identifier mismatch).
- Retry op verkeerde fouttypes veroorzaakt ruis of extra belasting.
- Incomplete foutclassificatie leidt tot foutieve permanent/recoverable beslissingen.

### Grootste productrisico’s
- MVP wordt alsnog overbelast met “nog één advanced feature”.
- Terminologie blijft te technisch voor marketeers.
- Verwachting dat V2 alle V1-specials meteen dekt.
- Onvoldoende duidelijke cutovercriteria tussen V1 en V2.

### Mitigaties
- Strikte change control: alleen features die binnen MVP-principes passen.
- UX-review met echte marketeers vóór livegang.
- Wekelijkse KPI review tijdens pilotfase.
- Heldere communicatie: V2 MVP dekt 80/20, niet alle edge cases.

## Open vragen
- Is tweede target in contactscenario standaard aan of optioneel per klant?
- Welke exacte timeout bepaalt wanneer een running submission als recoverable geldt?
- Welke drempel voor retry-falen triggert operationeel alert?
- Willen we activatie blokkeren zonder minstens één geslaagde testsimulatie?

## Next steps checklist
- Product owner bevestigt definitieve MVP-scope en expliciete non-MVP lijst.
- Engineering bevestigt idempotency key definitie en duplicate policy.
- UX finaliseert marketeer-terminologie op de 5-blokkenpagina.
- Team plant 6-weken roadmap op basis van 3 fases.
- Pilotklanten selecteren voor webinar- en contactscenario.
- Cutovercriteria V1→V2 schriftelijk vastleggen vóór start pilot.
