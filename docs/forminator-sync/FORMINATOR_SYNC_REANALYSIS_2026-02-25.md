# Forminator Sync — Reanalysis (2026-02-25)

## 1. Context en doel

Forminator Sync was de eerste module en heeft zichtbaar het fundament gelegd voor latere modules. De module werkt functioneel, maar draagt nu duidelijke sporen van snelle iteratie, legacy compat en mixed architectuur.

Doel van deze reanalyse:
- objectief beschrijven wat er nu staat,
- eerlijk benoemen waar de structurele problemen zitten,
- verklaren waarom bepaalde keuzes destijds logisch waren,
- een concrete revamp-richting vastleggen die past bij de huidige platformstandaard.

---

## 2. Huidige module-scope (as-is)

### 2.1 Functionele scope

Forminator Sync doet vandaag 3 kernzaken:
1. Forminator webhook-inname en workflow-executie naar Odoo
2. Mappingbeheer (field/value/workflow/html-card)
3. Geschiedenis/diagnostiek van verwerkte submissions

Belangrijke codepunten:
- Module entry: `src/modules/forminator-sync/module.js`
- Module routes: `src/modules/forminator-sync/routes.js`
- Module UI shell: `src/modules/forminator-sync/ui.js`
- Webhook action: `src/actions/receive_forminator.js`
- Workflow engine: `src/lib/workflow.js`
- Mapping API: `src/actions/mappings_api.js`
- History API: `src/actions/history_api.js`
- Database layer: `src/lib/database.js`
- Frontend logic (monolith): `public/admin.js`

### 2.2 Omvang (complexity signal)

Indicatieve code-omvang:
- `public/admin.js`: 4991 regels, ~134 functies
- `src/lib/workflow.js`: 637 regels
- `src/lib/database.js`: 499 regels
- `src/actions/mappings_api.js`: 375 regels
- `src/actions/receive_forminator.js`: 296 regels

Interpretatie: de module heeft een zware concentratie in enkele grote bestanden, vooral frontend en workflow.

---

## 3. Architectuurbeeld (realiteit)

### 3.1 Dataflow

1. WordPress/Forminator stuurt payload naar worker
2. Worker laadt mapping uit Supabase (met korte in-memory cache)
3. Worker normaliseert/expandeert form-data
4. Worker voert workflowstappen uit (search/create/update/chatter)
5. Worker logt resultaat in history

### 3.2 Routing-landschap (mixed)

Er bestaan meerdere ingangen voor vergelijkbare functionaliteit:
- Module routes onder `/forminator/*`
- Legacy API-rewrites vanuit root (`/api/mappings`, `/api/history`, `/api/test-connection`) in `src/index.js`
- Legacy action router via query/body action (`?action=receive_forminator`), ook in `src/index.js`

Conclusie: routing is niet meer eenduidig module-first; er is compatlaag op compatlaag.

### 3.3 Frontend-landschap

De module UI (`src/modules/forminator-sync/ui.js`) is vooral een shell die `public/admin.js` injecteert.
`public/admin.js` bevat zeer veel globale state en renderinglogica voor mapping/workflow/history.

Conclusie: de frontend is functioneel rijk, maar architecturaal monolithisch en moeilijk op te knippen.

---

## 4. Eerlijke technische schuldkaart

### 4.1 Kernproblemen

1. **Monolithische frontend**
   - `public/admin.js` combineert state, rendering, events, API-calls, serialization en editorlogica in één bestand.
   - Hoog regressierisico bij wijzigingen.

2. **Mixed routing en legacy ingangen**
   - Zelfde domeinfunctionaliteit loopt via module-router én root-level rewrites én action-dispatch.
   - Verhoogt mentale complexiteit en testlast.

3. **Inconsistente persistence-paden (historisch gegroeid)**
   - `handleHistoryGetAll` leest Supabase.
   - `handleHistoryGet` probeert nog KV (`MAPPINGS_KV`) per form.
   - Dit wijst op half-migratie en kans op afwijkend gedrag.

4. **Schema-/naam mismatch risico**
   - In code wordt `form_mapping_history` aangesproken in `src/lib/database.js`.
   - Baseline migraties definiëren `form_mappings_history`.
   - Dit is minstens een naming-risico dat expliciet gemitigeerd moet worden.

5. **Operationele security-smells in legacy pad**
   - Legacy token-flow met `openvmeform` + User-Agent check in `src/index.js`.
   - Praktisch werkbaar geweest, maar zwakker dan gesigneerde webhook-validatie.

6. **Veel backward-compat transformaties in API-laag**
   - Responses worden op meerdere plekken “oude frontend shape” gehouden.
   - Dit vertraagt opschoning en houdt historische contracten kunstmatig in leven.

### 4.2 Symptomen in dagelijkse werking

- Kleine UI-wijzigingen vereisen vaak grote context-kennis.
- Moeilijk te voorspellen welk endpoint exact gebruikt wordt.
- Migratie-/schemafouten kunnen laat opvallen (runtime).
- Nieuwe teamleden hebben lange inwerktijd.

---

## 5. Waarom dit zo gegroeid is (historisch eerlijk)

Deze keuzes waren in de beginfase begrijpelijk:

1. **Snel waarde leveren boven perfectie**
   - Eén groot JS-bestand en directe globale functies versnellen prototyping.

2. **Compatibiliteit behouden tijdens migratie**
   - KV → Supabase overgang werd incrementeel gedaan om productie niet te breken.

3. **Productiedruk op webhook-flow**
   - Legacy action-routes bleven actief om Forminator integratie stabiel te houden.

4. **Platform was nog niet volwassen modulair**
   - Latere modules (zoals Event Operations) hebben pas strakkere patronen afgedwongen.

Belangrijk: dit is geen “foute” fase geweest; het is een typische eerste productfase. Maar de architectuurschuld is nu hoog genoeg om gericht af te bouwen.

---

## 6. Waar we vandaag staan

### 6.1 Wat is sterk

- Core businessflow bestaat en draait.
- Workflow-engine ondersteunt complexe use-cases.
- Mappingbeheer en audit trails zijn aanwezig.
- Er is al een module-registratiestructuur in het platform.

### 6.2 Wat blokkeert schaalbaarheid

- Frontend-onderhoudbaarheid (grootste bottleneck)
- Legacy routing en auth compatpaden
- Niet-volledig geharmoniseerde persistence-contracten
- Beperkte testbaarheid door sterke koppeling in grote bestanden

---

## 7. Revamp-richting (target architecture)

### 7.1 Doelbeeld

Forminator Sync moet naar hetzelfde patroon als de nieuwere modules:
- module-scoped routecontracten,
- duidelijke scheiding tussen UI-controller/service/data,
- één canonical persistencepad,
- expliciete en simpele webhook security.

### 7.2 Gewenste structuur

- `src/modules/forminator-sync/`
  - `module.js` (metadata + route wiring)
  - `routes.js` (alleen HTTP-contract + validatie + orchestration)
  - `services/` (workflow orchestration, mapping service, history service)
  - `odoo-client.js` (Odoo calls gecentraliseerd)
  - `ui.js` + `public/forminator-sync-client.js` (modulaire UI)

- Legacy `public/admin.js` opdelen in:
   - state store
   - mapping editor controller
  - workflow builder controller
  - history viewer controller
  - API client

### 7.3 UX vereenvoudiging (MVP-first)

- Minder open editors tegelijk; wizard per stap.
- Heldere “Save / Validate / Test Run” flow.
- Consistente foutweergave met direct hersteladvies.
- Verborgen geavanceerde opties achter een “Advanced” paneel.

---

## 8. Gefaseerd uitvoerplan

### Fase 0 — Stabiliseren (kort)
- Bevestig en fix table naming mismatch (`form_mapping_history` vs `form_mappings_history`).
- Maak history-ophaalpad 100% Supabase (KV-read elimineren).
- Documenteer en beperken van legacy routes (meet usage).

### Fase 1 — Contracten hard maken
- Definieer één canonical API-contract onder `/forminator/api/*`.
- Voeg inputvalidatie per endpoint toe (schema-first).
- Maak response-shapes consistent en typed.

### Fase 2 — Frontend de-monolitiseren
- Split `public/admin.js` in controllers/services, zonder functionaliteitswijziging.
- Introduceer module-scoped clientbestand.
- Behoud huidige UX eerst functioneel gelijk (strangler pattern).

### Fase 3 — UX vereenvoudigen
- Vereenvoudig workflow builder naar guided flow.
- Verminder free-form zones waar dat geen businesswaarde geeft.
- Voeg “preview before save” en “test payload replay” toe.

### Fase 4 — Legacy afbouwen
- Deactiveer root rewrites naar forminator endpoints.
- Verwijder `?action=receive_forminator` pad na gecontroleerde cutover.
- Sluit oude tokenvarianten af na monitoringperiode.

---

## 9. Beslissingen die we expliciet moeten nemen

1. Welke webhook-auth wordt de enige standaard (bijv. HMAC signature)?
2. Hoe lang houden we backward-compat endpoints actief?
3. Welke minimale subset van de huidige UI blijft in MVP revamp?
4. Willen we workflow JSON vrij bewerkbaar houden, of strikt guided?

---

## 10. Eerste concrete aanbevelingen (direct uitvoerbaar)

1. Maak een aparte `docs/forminator-sync/revamp-plan.md` met sprintbare tickets.
2. Voeg technische health-check endpoint toe voor Forminator Sync (schema + dependencies).
3. Zet runtime telemetry op endpointgebruik om legacy cutover veilig te plannen.
4. Start met pure refactor PR: `admin.js` opdelen zonder gedrag te wijzigen.

---

## 11. Samenvatting

Forminator Sync is inhoudelijk sterk maar architecturaal overbelast. De module heeft haar rol als pionier goed vervuld, maar de huidige vorm remt snelheid en betrouwbaarheid. Een revamp is geen cosmetische stap maar een noodzakelijke structurele investering.

De aanbevolen aanpak is incrementeel: eerst contract- en datapadstabiliteit, daarna gecontroleerde frontend-ontkoppeling, en pas dan UX-simplificatie + legacy shutdown.