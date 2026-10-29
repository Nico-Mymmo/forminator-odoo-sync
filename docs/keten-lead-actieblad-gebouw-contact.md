# De keten lead - actieblad - gebouw - contact (2026-10-26)

Gemeten in Odoo op 2026-10-26 (alle leads en actiebladen, ook gearchiveerde/verloren).
Enkel onderzocht: er is niets gewijzigd in Odoo.

## Hoe het vandaag in elkaar hangt

```
contactpersoon (res.partner, persoon)
  └─ parent_id → gebouw (res.partner, bedrijf/VME)

lead (crm.lead)
  └─ partner_id → soms de persoon, soms het gebouw, soms een persoon ZONDER gebouw

actieblad (x_sales_action_sheet)
  ├─ x_studio_contact_id → de persoon
  ├─ x_studio_for_company_id → GEEN eigen veld: = contact.parent_id
  └─ gekoppelde leads  ⇄  lead.x_studio_opportunity_actionsheet_ids
     (één gedeelde tabel; automatisaties 31 en 32 herberekenen ze)
```

Drie regels die de keten volledig bepalen, en die je nergens op het scherm ziet:

1. **Het gebouw van een actieblad is het bedrijf van zijn contactpersoon.** Geen
   contactpersoon, of een contactpersoon zonder bedrijf = geen gebouw.
2. **Lead en actieblad hangen aan elkaar als de klant van de lead EXACT de
   contactpersoon van het actieblad is** (automatisaties 31 en 32). Een lead op
   het gebouw, of op een andere persoon van dezelfde VME, wordt nooit gekoppeld,
   en wie het met de hand koppelt, ziet het bij het opslaan weer verdwijnen.
3. **Elk websiteformulier maakt een PERSOON aan (zonder gebouw) en zet de lead
   daarop.** Geen enkele koppeling in de OM zet een gebouw of een `parent_id`.

## Cijfers

### Leads (5.026 in totaal)

| Klant van de lead | 2024 | 2025 | 2026 | Open nu* |
|---|---|---|---|---|
| Persoon met gebouw | 350 | 736 | 642 | 92 |
| **Persoon zonder gebouw** | 265 | 585 | **550** | **97** |
| Het gebouw zelf | 50 | 59 | 37 | 2 |
| Geen klant | 635 | 14 | 9 | 0 |

\* Open = niet verloren en niet gewonnen, zonder de import van juni 2026 (zie onder).

- **De helft van de open leads hangt aan een persoon zonder gebouw.** Dat is de
  normale toestand na een websiteformulier; ze blijft zo tot iemand het gebouw
  met de hand aanmaakt.
- **1.094 leads "biv.be PS Verkoopkans ..."** (import van 4 juni 2026,
  professionele syndici) hebben geen klant en geen e-mailadres: 1.063 staan nog
  open als MQL. Dat is een prospectielijst, geen aanvraag; ze vertekent elke
  telling "leads zonder klant". Apart houden (eigen type of label) of opruimen.
- Van de 300 gewonnen leads hebben er 96 geen actieblad, bijna allemaal van 2024
  en 2025 (5 in 2026).

### Actiebladen (962 actief, 978 met gearchiveerde)

| Patroon | Aantal |
|---|---|
| Keten klopt (contact + gebouw + juist één lead op die persoon) | 642 (67%) |
| **Zonder gebouw** (contact zonder bedrijf: 206, geen contact: 18) | **224** |
| Zonder lead | 49 |
| Meer dan één lead (dezelfde persoon vroeg meermaals aan) | 86 |
| Lead op een andere persoon dan het contact | 9 |
| Lead van een ander gebouw | 2 |
| Gebouw met meerdere actiebladen (6 met verschillende contacten, 14 met hetzelfde) | 20 gebouwen, 40 actiebladen |
| Gebouw zonder bedrijfstype (vaak "VME ..." zonder type) | 201 |

- **Een actieblad zonder gebouw staat bijna altijd in Discovery** (223 van 224),
  en het aantal stijgt weer: 34 in augustus, 36 in september 2026. Dat is precies
  de stap waarin sales kavels, mede-eigenaars en huidige syndicus invult, en die
  vragen worden op het gebouw bewaard. Zonder gebouw gaan ze stil verloren (de
  connector "Claude voor sales" weigert dat sinds kort; het Odoo-scherm niet).
- 713 actiebladen hangen aan een VERLOREN lead: het actieblad wordt in Discovery
  gemaakt en de lead gaat daarna verloren. Dat is op zich geen fout, maar er is
  niets dat het actieblad dan afsluit.

## Waar de keten breekt

| # | Waar | Wat er gebeurt |
|---|---|---|
| 1 | Elke koppeling met een formulier (Contactaanvraag, VME Check, Offerte, Calculator, Meta, OpenVME contact, Kennismaking...) | Zoekt of maakt een persoon op e-mail, `is_company = False`, en zet de lead erop. Het VME-gedeelte van het formulier (naam, adres, kavels) belandt op de lead of in de chatter, nooit in een gebouw. Bestond de persoon al ONDER een gebouw, dan is het goed; is hij nieuw, dan staat hij los. |
| 2 | Actieblad aanmaken in Discovery (met de hand) | Kan met een contactpersoon zonder gebouw, of zonder contact. Odoo waarschuwt niet. Alle gebouwvragen op het scherm zijn dan leeg en wat je typt, wordt niet bewaard. |
| 3 | Automatisatie 31 (actieblad) en 32 (lead) | Herberekenen de koppeling volledig op "klant van de lead = contact van het actieblad". Gevolg: een lead op het gebouw of op een collega van dezelfde VME hangt nooit aan het actieblad; een lead met de hand koppelen wordt ongedaan gemaakt; het contact van een actieblad wijzigen ontkoppelt de leads. |
| 4 | Automatisatie 41 / serveractie 1039 (lead gewonnen) | Staat de lead op het gebouw, dan neemt ze het EERSTE contact van dat gebouw (willekeurig) en zet de lead daarop. Zoekt een bestaand actieblad enkel op contactpersoon, niet op gebouw: een tweede contact van hetzelfde gebouw krijgt een tweede actieblad. Zonder contact: rood bolletje op de lead, geen actieblad, geen melding aan iemand. |
| 5 | Automatisatie 28 (naam) | Geeft enkel een naam als er een gebouw is; een actieblad zonder gebouw blijft "Actieblad <persoon>". |
| 6 | Bedrijfstype | 201 gebouwen achter een actieblad hebben geen type (VME / VME in beheer / professionele syndicus). Daardoor tellen ze verkeerd in dashboards en kan een regel "enkel VME's" ze niet herkennen. |

## Voorstel: één vaste vorm

**Regel: een lead staat altijd op een PERSOON. Die persoon hangt altijd onder een
GEBOUW. Een actieblad heeft altijd een contactpersoon (dus een gebouw) en hangt
aan de leads van dat gebouw.**

```
gebouw (bedrijf, met type)
  ├─ persoon A  ← lead 1, lead 2
  ├─ persoon B  ← lead 3
  └─ actieblad (contact = A) → leads 1, 2, 3 (alle leads van het gebouw)
```

Waarom op de persoon en niet op het gebouw: de mail, de chatter, Calendly en de
ledenlijst (automatisatie 77) werken allemaal met de persoon, en serveractie 1039
zet een lead op een gebouw toch al om naar een persoon. Het gebouw volgt dan
vanzelf uit de persoon.

### Stappen

| # | Wat | Waar | Effect |
|---|---|---|---|
| 1 | **Koppelingen maken het gebouw mee aan.** Formulieren die een VME-naam of -adres vragen (welke dat precies zijn, is nog na te gaan; vermoedelijk VME Check, Offerte en Calculator): een stap "gebouw zoeken of aanmaken" (res.partner, `is_company = True`, type VME, op naam + postcode) vóór de persoon, en `parent_id` van de persoon = dat gebouw (enkel als de persoon nog geen gebouw heeft). | OM, Koppelingen (geen code nodig, bestaande stappen) | Nieuwe aanvragen komen meteen als persoon-onder-gebouw binnen. Lost het grootste deel van de 97 open "persoon zonder gebouw" vooruit op. |
| 2 | **Formulieren zonder VME-gegevens** (Meta, OpenVME contact, Kennismaking) blijven een losse persoon geven. Sales maakt het gebouw aan bij het eerste gesprek; de connector doet dat al (`nieuw_gebouw`). | Werkafspraak | Bewust: liever geen gebouw dan een verzonnen gebouw. |
| 3 | **Actieblad weigeren zonder gebouw.** In Studio op het actieblad: contactpersoon verplicht, en een filter op dat veld zodat je enkel personen MET een bedrijf kan kiezen (`[('parent_id','!=',False),('is_company','=',False)]`). | Studio | Geen nieuwe actiebladen zonder gebouw meer; geen stil verloren antwoorden. |
| 4 | **Koppeling lead ⇄ actieblad op het gebouw in plaats van op de persoon.** Serveracties 977 (autom. 31) en 979 (autom. 32) aanpassen: zoeken op "lead.partner_id.commercial_partner_id = actieblad.gebouw" i.p.v. "lead.partner_id = actieblad.contact". | Technische UI (serveractie-code, geen module) | Elke lead van het gebouw, ook van een collega of op het gebouw zelf, hangt aan het actieblad; met de hand koppelen blijft staan. |
| 5 | **Serveractie 1039 (gewonnen):** bestaand actieblad zoeken op gebouw, niet enkel op contact; zonder contact of gebouw een TAAK voor de verkoper ("maak het gebouw aan") in plaats van enkel een rood bolletje. | Technische UI | Geen tweede actieblad per gebouw; een gewonnen lead zonder gebouw valt op. |
| 6 | **Opkuis van wat er staat** (eenmalig, na akkoord): 206 actiebladen met een contact zonder gebouw → per stuk het gebouw aanmaken of zoeken (de connector of een lijst voor sales); 201 gebouwen een type geven; de 1.063 open biv.be-leads een eigen label geven of archiveren; dubbele actiebladen per gebouw samenvoegen. | Lijsten uit de OM, uitvoeren in Odoo | De bestaande cijfers kloppen. |
| 7 | (later) Een lead die verloren gaat terwijl zijn actieblad in Discovery staat: actieblad mee afsluiten of markeren. | Automatisatie | 713 actiebladen hangen nu aan een verloren lead. |

Volgorde: 3 en 1 eerst (stoppen dat er nieuwe gaten bijkomen), dan 4 en 5 (de
koppeling robuuster), dan de opkuis (6).

## Wat dit voor de connector "Claude voor sales" betekent

- Hij doet al wat de regel vraagt: gebouw aanmaken (`nieuw_gebouw`) en de persoon
  eronder zetten, contact aanmaken onder het gebouw, actieblad enkel met een
  contact, en een gebouwvraag weigeren zolang er geen gebouw is.
- Na stap 4 mag hij een actieblad koppelen aan elke lead van het gebouw, niet
  enkel aan die op het contact. Tot dan zou een koppeling met een lead op een
  andere persoon door automatisatie 31 weer weggehaald worden.
- De regel "Dossier:" bovenaan "In het kort" kan de patronen hierboven letterlijk
  overnemen (lead op persoon zonder gebouw, actieblad zonder gebouw, meerdere
  actiebladen op het gebouw).
