# Dubbele velden: lead, actieblad en gebouw

Gemeten in Odoo op 2026-10-26: de velden zelf (`ir.model.fields`), de schermen
zoals een beheerder ze krijgt (`get_views`, dus met alle overerving), de
automatisaties en serveracties, en de koppelingen van de OM. Aantallen tellen
gearchiveerde records mee, tenzij er "actief" staat.

Woorden:
- **Eigen veld**: een eigen kopie die los kan gaan lopen.
- **Doorgeefveld**: toont en bewaart de waarde op een ander record (related). Er staat niets dubbel.
- **Zichtbaar als**: een voorwaarde op het RECORD (bv. enkel bij een VME). Iedereen met toegang ziet het dan.
- **Enkel beheerders**: een tabblad met `groups="base.group_system"` (Instellingen > beheerder).

---

## 1. Ondernemingsnummer, btw en Peppol (business critical)

### De afspraak

- **Het ondernemingsnummer van een VME staat op het BEDRIJF, in `x_studio_registration_number` ("Ondernemingsnummer").** Dat is de enige bron.
- **Het btw-veld (`vat`) blijft LEEG bij een VME.** Het getal is hetzelfde, maar een VME is niet btw-plichtig, en een ingevuld btw-nummer geeft problemen bij de jaarafsluiting.
- **Het Peppol-adres (`peppol_endpoint`) wordt gemaakt uit het ondernemingsnummer** (zie automatisatie 43). Dat mag niet stukgaan.
- Een professionele syndicus (type 2) is wél btw-plichtig: daar komt het Peppol-adres uit het btw-nummer (automatisatie 44).

### Alle plekken waar het nummer staat

| Model | Veld | Label | Soort | Waar op het scherm | Ingevuld | Oordeel |
|---|---|---|---|---|---|---|
| Bedrijf | `x_studio_registration_number` | Ondernemingsnummer | eigen | contact/bedrijf, bovenaan (altijd zichtbaar); ook in de lijst; "Bedrijf maken vanuit actieblad" | 1121 bedrijven; **972 van de 1609 actieve VME's hebben er GEEN** | **DE BRON** |
| Bedrijf | `vat` | Btw nr. ("VAT") | standaard Odoo | bovenaan, alleen lezen bij een contact onder een bedrijf; bij "Bedrijf maken vanuit actieblad" verborgen als het leeg is | 164 bedrijven; **0 actieve VME's** (goed) | leeg laten bij een VME |
| Bedrijf | `company_registry` | Bedrijfs ID | standaard Odoo | tabblad Verkoop & aankoop > Diversen (niet bij een contact onder een bedrijf) | 233 bedrijven, waarvan 109 actieve VME's | **tweede kopie**, zie hieronder |
| Bedrijf | `peppol_endpoint` | Eindpunt Peppol | standaard Odoo | tabblad Boekhouding > Elektronische facturatie (enkel bij Peppol-formaat) | 1237 bedrijven; 975 actieve VME's zonder | afgeleid, niet zelf typen |
| Bedrijf | `peppol_eas` | Peppol e-adres (EAS) | standaard Odoo | idem | 0208 (Belgisch ondernemingsnummer) bij bijna iedereen | goed |
| Contact (persoon) | `x_studio_registration_number` | Ondernemingsnummer | zelfde veld | bovenaan | 6 personen (Dirk Maes, Walter Beckers, Johan Van Bosch, Robbie Eyckmans, Liesbet Vermeulen, Frank De Wolf) | hoort op hun bedrijf |
| Contact (persoon) | `vat`, `company_registry`, `peppol_endpoint` | | zelfde velden | | 701 / 832 / 559 personen | Odoo kopieert dit van het bedrijf; ook losse personen (Karoline Scheers staat 15 keer met een btw-nummer en zonder bedrijf) |
| Lead | `x_vme_kbo` | KBO-nummer (op het scherm "Ondernemingsnummer") | **doorgeefveld** naar het bedrijf van de contactpersoon | tabblad Syndicoach > Gegevens VME; enkel te wijzigen als de contactpersoon een bedrijf heeft | = het gebouw | **houden**: schrijft rechtstreeks in de bron |
| Lead | `x_kbo_nummer` | [CHECK] KBO-nummer | eigen | nergens | 0 | weg |
| Lead | `x_studio_vat_known` | [CHECK] VAT (known) | eigen | leadformulier, groep klantgegevens, **enkel bij type "lead"** (niet bij een verkoopkans) | 572 leads, import van 16/10/2024 | weg (eventueel eerst overnemen naar het gebouw) |
| Lead | `x_studio_ondernemingsnummer_rel` | [DEPR] Ondernemingsnummer | doorgeefveld naar de KLANT van de lead (niet zijn bedrijf) | nergens | 69 | weg |
| Actieblad | `x_studio_has_registration_number` | Heeft Ondernemingsnummer | eigen (ja/nee/...) | tabblad "Van Niks Tot In Orde" > Over de oprichting | | houden: is een vraag, geen nummer |

Er zijn dus **3 plekken met een echt nummer op het bedrijf** (ondernemingsnummer, btw, Bedrijfs ID), plus het Peppol-adres dat ervan afgeleid wordt, plus **3 kopieën op de lead**. Doel: één nummer (ondernemingsnummer), één afgeleide (Peppol), de rest leeg of weg.

### Hoe het Peppol-adres gemaakt wordt

- **Automatisatie 43** "format registrationnumber and copy to peppol_endpoint" (aan): bij elke wijziging van het ondernemingsnummer, voor alle bedrijven BEHALVE professionele syndici. Haalt de cijfers eruit en zet ze in `peppol_endpoint` als het precies 10 cijfers zijn.
- **Automatisatie 44** (PS): hetzelfde, maar uit het btw-nummer, enkel voor professionele syndici.
- **Zwak punt: beide schrijven ENKEL als het Peppol-adres nog leeg is.** Wordt een fout ondernemingsnummer later verbeterd, dan blijft het oude Peppol-adres staan, zonder melding. Vandaag klopt het overal waar beide ingevuld zijn (0 verschillen), maar dat is geluk, geen garantie. Voorstel: in beide acties `if not record.peppol_endpoint` weghalen (altijd gelijkzetten), of enkel gelijkzetten als het huidige adres het oude nummer was.
- Er zijn geen koppelingen in de OM die een van deze velden vullen.
- De OpenVME-knop (serveractie 1215) leest enkel het ondernemingsnummer van het bedrijf van de contactpersoon.

### Wat er vandaag niet klopt

- **13 bedrijven met iets anders dan een nummer** in Ondernemingsnummer: "IA", "I.A.", "geen", "Nihil", "geen = residentie", "Bruxelles", ".Mechelen", een Nederlands btw-nummer (Reddit Netherlands B.V.), te lange getallen (Bogiegebouw, VME Magnolia).
- **2 bedrijven met een Bedrijfs ID dat iets anders zegt dan het ondernemingsnummer**: Canterbeke (0885457174 tegenover 0476.950.087) en VME Rijnpoort (1017716278 tegenover 0661.744.589).
- **41 nummers staan bij meer dan één bedrijf** (dubbele gebouwen), bv. U.N.O.-Laan 84-86 (twee keer), Residentie Anversa en VME Blauwkasteelstraat 1, Koningin Astrid (twee keer), Biesthoevelaan 23 (twee keer), VME Rijnpoort en een bedrijf "test", en Syndicoach zelf (twee keer).
- **Schrijfwijzen door elkaar**: 1061 als `0123456789`, 45 met punten, 5 met "BE" ervoor. Het Peppol-adres haalt de cijfers eruit, dus dat werkt; maar zoeken op een nummer vindt de andere schrijfwijze niet. Voorstel: overal 10 cijfers zonder punten.

---

## 2. Aantal kavels en huidig beheer

### Op het bedrijf (de bron)

Tabblad **"VME"** op het contact/bedrijf. **Zichtbaar als**: het is een bedrijf van het type VME of VME in beheer (bij een persoon of een professionele syndicus is het hele tabblad weg). Voor iedereen met toegang tot contacten.

| Groep | Veld | Label | Ingevuld (bedrijven) |
|---|---|---|---|
| Informatie over het gebouw | `x_studio_number_of_plots` | Totaal Aantal Kavels | 1556 |
| Informatie over het gebouw | `x_studio_number_of_billable_plots` | Aantal Factureerbare kavels | 1334 (facturatie: de connector raakt dit bewust niet) |
| Informatie over het gebouw | `x_studio_has_commercial_plots` | Heeft Commerciële Kavels | |
| Informatie over het gebouw | `x_studio_number_of_apartments` | Aantal Bewoonbare Kavels | 480 |
| Informatie over VME | `x_studio_hoa_established` | VME opgericht (ja/nee) | |
| Informatie over VME | `x_studio_current_syndic_type` | Huidig Type Beheer | 597 |
| Informatie over VME | `x_studio_current_syndic` | Huidige Syndicus | 88; **enkel zichtbaar als type beheer = professionele syndicus** |

Op het bedrijf, maar **op geen enkel scherm van het bedrijf**:
- `x_studio_number_of_co_owners` "Aantal Mede-Eigenaars" (354 bedrijven): enkel te zien en te wijzigen via het actieblad.
- `x_studio_andere_kavels` "[CHECK] Andere kavels" en `x_studio_number_of_co_owners_char` "[CHECK] number of co owners": overal leeg. Weg.

Tabblad **"Professionals"** (zichtbaar als: een bedrijf dat GEEN VME is): `x_estates_managed` "Estates in Beheer" (30 bedrijven).

Verkeerde plek: 14 PERSONEN hebben kavels, 17 een type beheer (zoals Angelique Wilson). Die horen op hun gebouw.

### Op het actieblad (doorgeefvelden naar het gebouw)

Tabblad **"Basisgegevens"** > groep **"Over het gebouw"**, voor iedereen met toegang tot actiebladen: Totaal Aantal Kavels, Aantal Bewoonbare Kavels, Heeft Commerciële Kavels, Aantal Mede-Eigenaars, VME reeds opgericht, Huidig Type Beheer, Huidige Syndicus (enkel bij type beheer = professioneel).
**Alleen lezen zolang er geen gebouw aan het actieblad hangt**: zonder gebouw kan niemand ze invullen (en de connector ook niet).

Eigen veld: `x_openvme_package_qty` "Aantal kavels" (158 actiebladen) = het aantal kavels in het OpenVME-PAKKET. Te zien in de bovenbalk als er pakket Basic of Smart gekozen is (alleen lezen), en te wijzigen op tabblad **"⚙️ Config"**: **enkel beheerders**. Het tabblad **"Datavelden"** is ook enkel voor beheerders; daar staan geen kavelvelden. Voorstel: hernoemen naar "Kavels in het pakket", zodat het niet met het totaal verward wordt.

### Op de lead (kopieën)

| Veld | Label | Waar | Wanneer zichtbaar | Ingevuld | Gevuld door |
|---|---|---|---|---|---|
| `x_studio_search_syndic_amount_plots` | [CHECK] Aantal Kavels | tabblad "🎯 Syndicus Zoeken" > Algemene Info (alleen lezen) | **enkel als het formulier "syndicus zoeken" ingevuld werd** (10 leads) | 78 leads | automatisatie 73 (Syndicoach-offerteaanvraag: leest "Aantal kavels:" uit de chatter en rekent er de verwachte omzet mee uit) |
| `x_studio_search_syndic_current_admin` | [CHECK] Huidig Beheer | idem | idem | 10 leads | het oude syndicus-zoeken-formulier |

Gevolg: **bij bijna alle 78 leads met een aantal kavels ziet NIEMAND dat getal**, want het tabblad is verborgen. Voorstel: automatisatie 73 de kavels laten schrijven op het gebouw van de contactpersoon (als er een is) en de verwachte omzet zo laten berekenen; daarna kunnen beide leadvelden weg.

Ook op de lead, groep klantgegevens, **enkel bij type "lead"** (niet bij een verkoopkans): `x_studio_oprichting_vme` "Oprichting VME" (een jaartal, 576 leads, op geen websiteformulier).

Elders: de inschrijving voor een event heeft een eigen tekstveld "Huidige syndicus" (`x_webinarregistrations.x_studio_current_syndic`); de kopieerwizard voor gebouwen (acties 1041/1042) en de Syndicoach Navigator (actie 1179) lezen de kavels van het gebouw.

---

## 3. Andere dubbels

| Gegeven | Lead | Actieblad | Gebouw | Oordeel |
|---|---|---|---|---|
| Land | `x_vme_land` [CHECK] (10 leads) | - | `country_id` | De OpenVME-knop neemt sinds 26/10 het land van het gebouw; weg. |
| Huisnummer | `x_vme_huisnummer` [CHECK] (1 lead) | - | in `street` | De OpenVME-knop neemt sinds 26/10 de straat van het gebouw; weg. |
| Noden | `x_studio_search_syndic_need_*` | pijnpunten | - | Apart houden: wat de klant aanvinkte tegenover wat sales vaststelt. |
| Reden van contact | `x_studio_contact_message` | open vraag "Reden voor contacteren" | - | Apart houden: wat de klant schreef tegenover wat sales hoorde. |

## 4. Weg te halen

| Veld | Label nu | Waarom |
|---|---|---|
| Actieblad: AI samenvatting, AI suggestie, ai key takeaways, Laatste Analyse, Analyse Forceren | [DELETE] | Niet meer gebruikt; automatisatie 38 staat uit. Mag verwijderd worden. |
| Lead: `x_kbo_nummer`, `x_studio_vat_known`, `x_vme_land`, `x_vme_huisnummer` | [CHECK] | Zie hierboven. |
| Lead: `x_studio_search_syndic_amount_plots`, `x_studio_search_syndic_current_admin` | [CHECK] | Pas na de aanpassing van automatisatie 73. |
| Bedrijf: `x_studio_andere_kavels`, `x_studio_number_of_co_owners_char` | [CHECK] | Leeg, op geen scherm. |

## 5. Wat de connector "Claude voor sales" invult

Hij vult de JUISTE velden, en enkel die: kavels, bewoonbare kavels, mede-eigenaars, commerciële kavels, VME opgericht, huidige syndicus, type beheer en het ondernemingsnummer op het **gebouw**; vaardigheden, leeftijd en beroep op het **contact**. De kopieën op de lead (de [CHECK]-velden hierboven) vult hij niet meer, zodat er geen tweede waarheid bijkomt. Het btw-veld, het Bedrijfs ID, het Peppol-adres en het aantal factureerbare kavels raakt hij nooit.
