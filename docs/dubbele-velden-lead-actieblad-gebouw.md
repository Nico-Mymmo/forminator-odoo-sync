# Dubbele velden: lead, actieblad en gebouw (2026-10-26)

Gemeten in Odoo op 2026-10-26 (`ir.model.fields` van `crm.lead`,
`x_sales_action_sheet` en `res.partner`). "Doorgeefveld" = een related veld:
het toont en bewaart de waarde op een ander record, er staat dus niets dubbel.
"Eigen veld" = een eigen kopie die los kan gaan lopen.

Regel waar we naartoe gaan: **een gegeven over het gebouw staat EEN keer, op het
gebouw.** Lead en actieblad tonen het via een doorgeefveld.

## Echt dubbel (eigen kopieën die uit elkaar lopen)

| Gegeven | Lead | Actieblad | Gebouw | Voorstel |
|---|---|---|---|---|
| Aantal kavels | `x_studio_search_syndic_amount_plots` [CHECK] (eigen; gevuld door automatisatie 73 uit de chatter van een Syndicoach-offerteaanvraag, gebruikt voor de verwachte omzet) | `x_studio_number_of_plots` (doorgeef, gebouw) en `x_openvme_package_qty` "Aantal kavels" (eigen) | `x_studio_number_of_plots` | Formulier schrijft voortaan naar het gebouw; leadveld enkel nog tonen. `x_openvme_package_qty` hernoemen naar "Kavels in het pakket" als dat de bedoeling is. |
| Huidig beheer | `x_studio_search_syndic_current_admin` [CHECK] (eigen, 10 leads) | `x_studio_current_syndic_type` (doorgeef) | `x_studio_current_syndic_type` | Zelfde als kavels: formulier naar het gebouw. |
| Ondernemingsnummer | `x_kbo_nummer` [CHECK] (eigen, leeg, op geen scherm), `x_studio_vat_known` [CHECK] (eigen, 572 leads, import van 2024), `x_vme_kbo` (doorgeef, gebouw), `x_studio_ondernemingsnummer_rel` [DEPR] (doorgeef naar het CONTACT) | `x_studio_has_registration_number` (eigen, ja/nee) | `x_studio_registration_number` | Op de lead enkel `x_vme_kbo` houden; `x_kbo_nummer`, `x_studio_vat_known` en het [DEPR]-veld weg. Het ja/nee-veld op het actieblad mag blijven (het is een vraag: "heeft de VME er al een?"). |
| Land | `x_vme_land` (eigen keuzelijst, 10 leads) en `x_vme_land_id` (doorgeef, gebouw) | - | `country_id` | [CHECK]. De OpenVME-knop gebruikt sinds 26/10 het land van het gebouw; mag weg. |
| Huisnummer | `x_vme_huisnummer` (eigen, 1 lead) | - | zit in `street` | [CHECK]. De OpenVME-knop haalt het nummer sinds 26/10 uit de straat van het gebouw; mag weg. |
| VME opgericht | `x_studio_oprichting_vme` (eigen, een JAAR; op het leadformulier, op geen enkel websiteformulier, ~575 leads met een jaar, vooral van voor 2025) | `x_studio_hoa_established` (doorgeef, ja/nee) | `x_studio_hoa_established` (ja/nee) | Niet hetzelfde (jaar tegenover ja/nee). Het jaar hoort ook op het gebouw: veld "Opgericht in" op het gebouw, dan dit leadveld weg. |
| Noden | `x_studio_search_syndic_need_*` (5 vinkjes uit het formulier) | pijnpunten (score 1-5) | - | Overlappen in betekenis. Laten staan als "wat de klant zelf aanvinkte"; de pijnpunten zijn wat sales vaststelt. |
| Reden van contact | `x_studio_contact_message` (formulier) | `x_studio_open_question_reason_for_contact` | - | Bewust apart: het eerste is wat de klant schreef, het tweede wat sales hoorde. |

## Weg te halen (ongebruikt)

| Veld | Waarom |
|---|---|
| Actieblad: `x_studio_ai_insight_summary` (AI samenvatting), `x_studio_ai_suggested_next_step` (AI suggestie), `x_studio_ai_key_takeaways`, `x_studio_ai_analysis_date`, `x_studio_force_ai_analysis` | Laatste analyse 31/07/2026. De samenvatting staat voortaan in de interne notitie van de lead en in de chatter. **Eerst automatisatie 38 "Action Sheet - Send to CHATGPT for analysation" archiveren** (die stuurt nog bij elke wijziging aan de open vragen een webhook), dan de velden uit het formulier en weg. |
| Actieblad: `x_studio_entrypoint` [DEPR] | Staat zelf als verouderd. |
| Lead: `x_studio_timeline_refresh_requested` [DEPR], `x_studio_preferred_subscription_clicked` [DEPR?] | Staan zelf als verouderd. |

## In orde (doorgeefvelden, niets dubbel)

- Lead: `x_vme_naam`, `x_vme_straat`, `x_vme_postcode`, `x_vme_plaats` (naar het gebouw van het contact), `x_studio_mobile` (naar het contact), `x_syndicoach_pack` (naar het gebouw).
- Actieblad: kavels, bewoonbare kavels, mede-eigenaars, huidige syndicus, type beheer, commerciële kavels, VME opgericht, gemiddelde leeftijd, Syndicoach-pakket (naar het gebouw); e-mail, telefoon, leeftijdscategorie, vaardigheden, beroep (naar het contact).
- Let op: het GEBOUW van een actieblad (`x_studio_for_company_id`) is zelf een doorgeefveld naar het bedrijf van de contactpersoon. Zonder contactpersoon met een bedrijf heeft het actieblad dus geen gebouw.

## Wat de connector er nu al mee doet

- Naam, straat, postcode, plaats en KBO van de VME vult hij in op het gebouw, niet op de lead.
- Een vraag op het actieblad die op het gebouw of het contact bewaard wordt, weigert hij als dat record ontbreekt (in plaats van ze stil te verliezen).
- De AI-velden leest en schrijft hij niet meer.
