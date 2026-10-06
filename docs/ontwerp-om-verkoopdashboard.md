# Ontwerp — het verkoopdashboard naar de OM

*Analyse 2026-10-05. Vervangt de keten Odoo → odoo-proxy → Apps Script → Google Sheet →
Looker Studio. Begint bij de pagina "Top KPIs" van het rapport
`cae11e96-3a02-4994-89c2-4d9d1df582a6`.*

## 0. In één alinea

De Looker-pagina "Top KPIs" is tot op de cent na te rekenen vanuit Odoo — de cijfers die
er vandaag staan, komen dus echt uit de code die hieronder beschreven staat. Maar die code
groepeert verlengingen op het **directe vorige contract** (`subscription_id`) in plaats van
op het **eerste contract** (`origin_order_id`). Vanaf de tweede verlenging valt een order
daardoor stil uit de dataset: 135 orders vandaag, waarvan 43 lopende abonnementen. De
totaalstand (262 abonnementen, € 123,8K ARR) klopt toevallig, omdat de vorige periode van
die abonnementen dan als "huidig" blijft staan; alles wat met tijd te maken heeft
(verlengingen dit jaar, dagen tot einde, de professionele maandabonnementen) klopt niet.
Odoo weet het zelf wél: `subscription_state`, `origin_order_id`, `recurring_monthly` en het
MRR-logboek `sale.order.log` geven zonder één transformatie dezelfde 262 / € 123,8K. Het
voorstel: de OM spiegelt de verkoopgegevens uit Odoo naar een eigen D1-database, leidt alles
af op één plek bij het lezen (zoals Webgedrag), en laat de browser filteren en doorklikken.

---

## 1. Wat vaststaat

1. Alles van deze keten verhuist naar Dashboards in de OM.
2. Er komt, net als bij de website-bezoeken, een tabel in Cloudflare (D1) met de
   verkoopgegevens uit Odoo: leads, abonnementen, facturen. Die voedt het dashboard.
3. Het dashboard wordt interactief: filteren, doorklikken tot op de order.
4. Wat er nu getoond wordt, is waar er vandaag naar gekeken wordt. Dat blijft de basis.

---

## 2. Hoe het vandaag werkt

### 2.1 De keten

```
Odoo (sale.order, sale.order.line, account.move, res.partner, crm.lead, ...)
   │  JSON-RPC, service-account
   ▼
odoo-proxy  (Worker, repo ~/Documents/odoo-proxy, POST + bearer)
   │  get_subscriptions · get_non_subscriptions · get_professional_product_usage
   │  get_professional_revenue · get_estates · get_leads · get_actionsheet_stats
   ▼
Apps Script (gebonden aan de Sheet, ~/Documents/google-odoo-dataset-sync, geen git)
   │  syncOdoo(): subscriptions, estates, actionsheets, leads, transactional usage
   │  apart:      syncPPU() (professionals), Professional Revenue, revenue_monthly
   ▼
Google Sheet  (tabbladen subscriptions_new, transactional_product_usage,
   │           professional_product_usage, Professional Revenue, revenue_monthly,
   │           estates_new, ActionSheets, Leads)
   ▼
Looker Studio "OpenVME Dashboard" (7 pagina's, 10 databronnen + een handmatige sheet
              "Datacheck 26-04-09 - Snapshot Professionele Syndici", plus blends
              churn_total_exvat_ltm / churn_totalArr_Exvat)
```

Twee kanttekeningen bij de bronnen zelf:

- **odoo-proxy heeft zes niet-gecommitte bestanden** (`get_subscriptions.js`,
  `get_non_subscriptions.js`, `get_professional_product_usage.js`, `exceptions.js`,
  `exceptions.json`, `modelMap.js`). De Apps Script leest `closeReason`, dat enkel in de
  werkboom staat, dus wat er draait is de werkboom en niet de laatste commit.
- **Het Apps Script-project staat niet in git.** Dat de cijfers hieronder tot op de cent
  kloppen, bewijst dat de lokale kopie voor het abonnementenpad gelijk is aan wat draait.

### 2.2 Wat de abonnementenstap doet (`get_subscriptions` + `flattenSubscriptions`)

| Stap | Waar | Wat |
|---|---|---|
| Ophalen | proxy | `sale.order` met `subscription_state ∉ {1_draft, false}` en `state ≠ cancel` — dus ook upsell-**offertes** (15 stuks in draft/sent) |
| Uitzonderingen | proxy, `exceptions.json` | order 51 → `5_renewed`, order 218 → kind van 51 (VME Brutopia); twee factuurkoppelingen rechtgezet |
| Groeperen | proxy | ouder = order zonder `subscription_id`; kinderen = orders met `subscription_id = ouder` (**één niveau**) |
| Bedragen | proxy | som van `price_subtotal` over lijnen met een recurring product (`product.template.recurring_invoice`) |
| Einddatum | proxy | `next_invoice_date − 1 dag` per order |
| Klanttype | proxy | `x_studio_partner_company_type` van de **ouder**, anders 9 |
| Plan | proxy | `plan_id` van de **ouder** |
| Periodes sorteren | Apps Script | op `start_date`; laatste niet-upsell = `isCurrent` |
| Soort | Apps Script | Upsell / Lost (`6_churn`) / Afgelopen / Wachten op betaling (`2_renewal`) / Nieuw / Verlengd |
| MRR | Apps Script | Yearly: totaal/12, Monthly: totaal |
| Maand | Apps Script | Lost → einddatum, Verlengd/Wachten → start periode, anders start eerste contract |

### 2.3 Wanneer het draait

`syncOdoo()` haalt vijf stappen op. `syncPPU()` (professionals), `Professional Revenue` en
`buildRevenueMonthly()` zitten daar **niet** in; die hangen af van een eigen trigger of
van iemand die de knop indrukt. De triggers zelf staan niet in de code (open vraag V2).

---

## 3. De pagina "Top KPIs", nagerekend

Gereconstrueerd door de proxy en de Apps Script na te bootsen op Odoo-data van
2026-10-05 (830 abonnementsorders, 1.610 lijnen). Filters en metrics van Looker zijn
afgeleid uit de uitkomst; voor de tegels met ✓ klopt het tot op de cent of op de laatste
afgeronde decimaal.

| Tegel | Op het scherm | Definitie | Nagerekend |
|---|---|---|---|
| Abonnementen | 262 | `isCurrent = 1`, niet Lost, klanttype ≠ 2 (filters `f_Total_Active` + `f_non_prof`) | 262 ✓ |
| ES / PS | 243 / 19 | ES = type 1 "VME" + geen type (9); PS = type 3 "VME in beheer" | 243 / 19 ✓ |
| Waarde in ARR | 123.8K € | `SUM(totalExVat)` van die 262 (alle 262 zijn jaarlijks) | 123.768,69 ✓ |
| ARPA | 345 € | **gemiddelde `totalExVat` over álle rijen** (ook upsells, afgelopen en verloren periodes) | 344,63 ✓ |
| Nieuwe abonnementen LTM | 158 / 83.3K € | huidige periode = eerste periode ("Nieuw") | 158 / 83.273 ✓ |
| Nieuwe Y2D | 129 / 64.4K € | "Nieuw" met start eerste contract in 2026 | 129 / 64.428 ✓ |
| Deze maand / vorige maand | 1 / 119 € · 15 / 5.643 € | "Nieuw" met start in okt / sep 2026 | ✓ / ✓ |
| QoQ (Q-2, Q-1, Qrunning) | 29.1K +33,5% · 13.4K −54,1% · 119 € −99,1% | som "Nieuw" per kwartaal van de start | 29.127 / 13.365 / 119 ✓ |
| Totaal verlengde abonnementen | 98 / 36.9K € | huidige periode = "Verlengd" | 98 / 36.915 ✓ |
| Verlengd Y2D | 54 / 23.4K € | "Verlengd" met start periode in 2026 | 54 / 23.378 ✓ |
| Openstaande verlengingen < 30 dagen | 5 / 2.638 € | "Wachten op betaling" en minder dan 30 dagen over de einddatum | 5 / 2.638,02 ✓ |
| Lost LTM | 15 / 5.3K · churn 4,29% | blend `churn_total_exvat_ltm` | **niet exact** — dichtstbij: einde contract (reden 3) in de laatste 12 maanden = 16 / 5.149 |
| Credits | 82 / 2.5K € | som aantal, product 14, orders `state = sale`, orderdatum ≥ 2025-10-06 | 82 / 2.460 ✓ |
| Oplaadacties wallet | 14 · gem. 172,4 · 2.4K € | product 13, aantal lijnen | 14 / 172,4 / 2.413,75 ✓ |
| Opstarthulp | 51 / 9.3K € | product 37 | 51 / 9.297 ✓ |
| Import data | 3 / 413,2 € | product 30 | 3 / 413,22 ✓ |
| Uren in regie | 7,5 / 659,1 € | product 2 "Service on Timesheets" | 7,5 / 659,10 ✓ |
| Professionele abonnementen (kavels, bank, peppol) | No data / 0 | sheet `professional_product_usage` | grafieken stoppen in aug 2026 → zie §4.9 |
| Tabel Professional / vanaf / # / MRR / ARR | MCA, Flash Invest, Chris D'Haese | vermoedelijk de handmatige sheet "Datacheck 26-04-09" | niet nagerekend |

De tekstvakken op de pagina bevatten zelf ook correcties ("VME Brutopia is een actieve en
een lost deal → is uit de losts en in actief"; "VME Boven: fout in registratie"). Die van
Brutopia is de uitzondering 51/218 in de proxy.

---

## 4. Wat er vandaag misloopt

Gerangschikt op impact. Elk punt is gemeten op de data van 2026-10-05.

### 4.1 Vanaf de tweede verlenging valt een order uit de dataset

Odoo zet bij een verlenging `subscription_id` op het **vorige** contract en
`origin_order_id` op het **eerste**. De proxy groepeert op `subscription_id` en kijkt maar
één niveau diep. Een keten A → B → C levert enkel A en B op; C bestaat niet voor het
dashboard.

- **135 orders** vallen weg: 47 verlengd, 43 lopend, 44 upsells, 1 verloren.
- Voor die abonnementen blijft de periode van vorig jaar als "huidig" staan. Bij 28 lopende
  abonnementen klopt daardoor de start, de einddatum en "dagen tot einde" niet (VME
  Pontrave: verlengd op 2026-09-18, dashboard toont 2025-09-18 en −18 dagen).
- **Verlengd Y2D telt er 54; Odoo heeft er 82.** De 28 ontbrekende zijn precies deze orders.
- Een stopzetting op de derde schakel is onzichtbaar: Immo Pauly (S00972, `6_churn`) staat
  als lopend "Verlengd" abonnement in de lijst.
- De **professionele maandabonnementen** maken elke maand een nieuwe order (S00730 →
  S00803 → S00911 → … → S01367). Bij hen staat bijna elke klant bevroren in maart–augustus
  2026.

Dat de totalen (262 / € 123,8K) toch kloppen, is toeval: verlengingen behouden meestal hun
prijs, dus de oude periode heeft (bijna) hetzelfde bedrag. Het verschil is vandaag € 30.

### 4.2 Een nog niet betaalde verlengingsofferte telt als huidige periode

Zes abonnementen hebben een verlengingsofferte (`2_renewal`, status `sent`). De pijplijn
neemt die als huidige periode, met de prijs van de offerte. Bij Res. Vremde 7 telt de ARR
daardoor € 942 in plaats van de € 803 die lopend is. Odoo houdt het lopende contract op
`3_progress` tot de offerte bevestigd is.

### 4.3 ARPA is geen gemiddelde per abonnement

"ARPA 345 €" is het gemiddelde bedrag over **alle rijen** van de sheet: upsell-lijnen,
afgelopen periodes en verloren abonnementen inbegrepen. Het gemiddelde per actief
abonnement is **€ 472,40** (ARR / 262). De mediaan is € 357.

### 4.4 Een planwissel of correctie telt als verloren én nieuw

Bij een planwissel ("vernieuwd met een nieuw plan", reden 7) of een correctie (13
migratie, 14 dubbel, 16 foutief) zet Odoo het oude contract op `6_churn` en maakt het
meestal een **nieuw, niet gekoppeld** contract voor dezelfde klant. Voorbeelden: VME
Stevoortpark S00755 → S01093 (zelfde € 873), VME Wenigerstraat S00909 (€ 446) → S01003
(€ 218, een verlaging), Beerse Kerkplein S01184 (€ 119) → S01228 (€ 317, een verhoging).
In de pijplijn is dat een "Lost" plus een "Nieuw". Van de 36 stopzettingen in de laatste
12 maanden bij niet-professionele klanten zijn er 19 zo'n wissel of correctie.

Vier VME's in beheer (ZAVELPAND II, MHEERSTRAAT, BETERVELD, Excelsior) stopten met reden 7
zonder opvolger — vermoedelijk omdat hun professionele syndicus ze voortaan factureert
(open vraag V6).

### 4.5 Een abonnement op een contactpersoon heeft geen klanttype

18 lopende abonnementen staan op een contactpersoon ("VME Gilmar, Maikel Beckers") in
plaats van op de VME. `x_studio_partner_company_type` is dan leeg, de proxy maakt er 9 van,
en Looker telt ze als "ES". De VME zelf staat in `commercial_partner_id`; daar hoort het
type vandaan te komen.

### 4.6 Uitzonderingen staan op vier plekken

`exceptions.json` in de proxy (Brutopia, twee facturen, order 619, Solvio), de tekstvakken
op de Looker-pagina, de handmatige sheet "Datacheck 26-04-09", en de Script Properties van
de Apps Script (product-id's en close-reasons voor de transactionele inkomsten, met de
code-standaard als terugval). Wie wil weten waarom een cijfer is wat het is, moet ze alle
vier kennen.

### 4.7 Solvio is maar op één plek uitgesloten

Solvio (`exclude: "Tijdelijk uitgesloten"`) valt weg uit `get_professional_product_usage`,
maar niet uit de abonnementen. Met € 7.320/maand is het **€ 87,8K van de € 109,5K
professionele ARR**.

### 4.8 Kleinere afwijkingen

- `kavelQty` telt álle lijnen op (ook bankkoppelingen en kortingslijnen) zodra het eerste
  product Basic of Smart is.
- `primaryProduct` is het eerste product op de order, niet de licentie.
- Het plan komt van het eerste contract. Vandaag wisselt geen enkele keten van plan, maar
  het zou de MRR verkeerd maken.
- Datums met een tijd (`date_order`) worden in Apps Script als lokale tijd gelezen terwijl
  Odoo UTC bewaart: een order na middernacht kan op de vorige dag vallen.
- "Transactionele inkomsten" zijn **verkochte** orders (`state = sale`), niet gefactureerd
  of betaald. Product 40 ("Opstarhulp", dubbel met 37) en 39 ("Syndicoach 5 uur") tellen
  niet mee; beide komen vandaag enkel in concepten voor.

### 4.9 De professionele sectie toont "No data"

De grafieken lopen tot augustus 2026 en de tegels "huidige stand" zijn leeg. `syncPPU()`
zit niet in `syncOdoo()`, dus de maandelijkse momentopname loopt niet mee met de rest.
Daarnaast: een professioneel interval blijft eeuwig open als er geen volgende order is —
een gestopte professional blijft in `get_professional_product_usage` actief.

---

## 5. Odoo kan het meeste zelf

| Vraag | Odoo-veld | Getest op 2026-10-05 |
|---|---|---|
| Welk abonnement is lopend? | `subscription_state = 3_progress` (+ `4_paused`), `state = sale` | 262 niet-professionele, dezelfde 262 als de pijplijn |
| Welke orders horen bij één abonnement? | `origin_order_id` (eerste contract) | gevuld op alle 392 vervolgorders |
| Wat is de MRR? | `recurring_monthly` (incl. kortingen en bevestigde upsells) | × 12 = € 123.797 (pijplijn € 123.769) |
| Wat veranderde wanneer? | `sale.order.log`: `0_creation`, `1_expansion`, `15_contraction`, `2_churn`, `3_transfer` met `amount_signed` | 1.024 regels sinds 2025-03-11; de som is de huidige MRR |
| Waarom gestopt? | `close_reason_id` (16 redenen) | — |
| Welk klanttype? | `commercial_partner_id.x_studio_company_type` | — |

`sale.order.log` is het ruggengraat-gegeven voor een MRR-brug (nieuw + uitbreiding −
verlaging − verloren = verschil). Het begint op **2025-03-11**: alles daarvoor is uit de
orders zelf af te leiden, maar minder fijn. Volgens de regel van Webgedrag wordt die
periode **gearceerd en niet weggelaten**.

---

## 6. De nieuwe opzet

```
Odoo  ──JSON-RPC──►  OM-cron (elk kwartier, incrementeel op write_date)
                       │  spiegelt ruwe records, één schrijver
                       ▼
                     D1 "om-sales"  (binding SALES_DB)
                       │
OM Dashboards  ──►  lib/sales/derive.js  (ENIGE plek met de regels van §6.4)
                       │  compacte feiten naar de browser
                       ▼
                     public/dashboards-sales.js  (filteren, doorklikken, geen nieuwe query per klik)
```

### 6.1 Wie bezit wat

| Gegeven | Bron van waarheid | Schrijver | Lezers |
|---|---|---|---|
| Orders, lijnen, facturen, MRR-log, partners, producten, leads | **Odoo** | — | sync |
| Kopie daarvan | D1 `om-sales`, tabellen per model | alleen de OM-sync | OM |
| Dagelijkse momentopname per abonnement | **D1 `subscription_snapshots`** — het enige wat Odoo niet bewaart | OM-sync, één keer per dag | OM |
| Afgeleide waarden (actief, ARR, nieuw, verlengd, verloren, wissel) | **nergens opgeslagen** — berekend in `lib/sales/derive.js` | — | dashboard |
| Uitzonderingen (Brutopia, Solvio, …) | D1 `sales_exceptions`, met reden en auteur, beheerbaar in het scherm | beheerder | derive.js |

Waarom de OM zelf schrijft en niet een aparte Worker: de OM is al de enige die met Odoo
praat (zelfde regel als Webgedrag), en er is maar één schrijver. Waarom D1 en niet live uit
Odoo: snelheid (de proxy doet nu tientallen RPC-rondes), de momentopnames (Odoo overschrijft
`subscription_state`), en filteren in de browser zonder Odoo te raken.

**Volume:** 830 abonnementsorders, 1.610 lijnen, 962 facturen, 1.024 logregels. Een volledige
sync is enkele seconden; D1-kosten zijn verwaarloosbaar.

### 6.2 D1-schema (eerste versie)

```sql
-- Spiegels: één rij per Odoo-record, kolommen zoals Odoo ze noemt. Niets afgeleid.
CREATE TABLE sale_orders (
  id INTEGER PRIMARY KEY, name TEXT, state TEXT, subscription_state TEXT,
  origin_order_id INTEGER, parent_order_id INTEGER,          -- origin_order_id / subscription_id
  partner_id INTEGER, commercial_partner_id INTEGER,
  plan_id INTEGER, start_date TEXT, end_date TEXT, next_invoice_date TEXT,
  first_contract_date TEXT, date_order TEXT, close_reason_id INTEGER,
  recurring_monthly REAL, amount_untaxed REAL, non_recurring_total REAL,
  user_id INTEGER, team_id INTEGER, opportunity_id INTEGER,
  create_date TEXT, write_date TEXT, synced_at TEXT
);
CREATE TABLE sale_order_lines (
  id INTEGER PRIMARY KEY, order_id INTEGER, product_id INTEGER, uom TEXT,
  qty REAL, price_unit REAL, discount REAL, price_subtotal REAL,
  is_recurring INTEGER, display_type TEXT, write_date TEXT
);
CREATE TABLE subscription_log (                  -- sale.order.log
  id INTEGER PRIMARY KEY, order_id INTEGER, origin_order_id INTEGER, event_type TEXT,
  event_date TEXT, amount_signed REAL, recurring_monthly REAL, subscription_state TEXT
);
CREATE TABLE invoices (                          -- account.move, out_invoice + out_refund
  id INTEGER PRIMARY KEY, name TEXT, move_type TEXT, state TEXT, payment_state TEXT,
  partner_id INTEGER, commercial_partner_id INTEGER, invoice_date TEXT, invoice_date_due TEXT,
  invoice_origin TEXT, amount_untaxed_signed REAL, amount_total_signed REAL,
  amount_residual REAL, payment_term_id INTEGER, write_date TEXT
);
CREATE TABLE invoice_lines (
  id INTEGER PRIMARY KEY, move_id INTEGER, product_id INTEGER, qty REAL,
  price_subtotal REAL, sale_line_ids TEXT, write_date TEXT
);
CREATE TABLE partners (                          -- enkel wie in een order/factuur/lead voorkomt
  id INTEGER PRIMARY KEY, name TEXT, is_company INTEGER, parent_id INTEGER,
  commercial_partner_id INTEGER, company_type_id INTEGER, company_status TEXT,
  lang TEXT, create_date TEXT, write_date TEXT
);
CREATE TABLE products (id INTEGER PRIMARY KEY, template_id INTEGER, name TEXT,
  is_recurring INTEGER, categ TEXT, default_code TEXT, active INTEGER);
CREATE TABLE leads (                             -- crm.lead, minimaal
  id INTEGER PRIMARY KEY, type TEXT, active INTEGER, stage_id INTEGER, won_status TEXT,
  lost_reason_id INTEGER, partner_id INTEGER, user_id INTEGER, source_id INTEGER,
  campaign_id INTEGER, expected_revenue REAL, create_date TEXT, date_closed TEXT,
  date_conversion TEXT, write_date TEXT
);
CREATE TABLE lookups (kind TEXT, id INTEGER, name TEXT, PRIMARY KEY (kind, id));
  -- close_reason, plan, company_type, stage, lost_reason, user, uom

-- Het enige wat niet uit Odoo te herbouwen is.
CREATE TABLE subscription_snapshots (
  day TEXT, origin_order_id INTEGER, current_order_id INTEGER, subscription_state TEXT,
  recurring_monthly REAL, company_type_id INTEGER, plan_id INTEGER,
  PRIMARY KEY (day, origin_order_id)
);

CREATE TABLE sales_exceptions (
  id INTEGER PRIMARY KEY, model TEXT, record_id INTEGER, rule TEXT, value TEXT,
  reason TEXT NOT NULL, created_by TEXT, created_at TEXT
);
CREATE TABLE sync_state (model TEXT PRIMARY KEY, last_write_date TEXT,
  last_full_sync TEXT, rows INTEGER, last_error TEXT);
```

### 6.3 De sync

- Elk kwartier (bestaande `*/15`-tak): per model `write_date > last_write_date`, upsert.
- **Eén keer per dag een volledige id-vergelijking per model.** Een verwijderd record in
  Odoo heeft geen `write_date` meer en zou anders eeuwig in D1 blijven staan.
- Na de dagelijkse ronde: de momentopname van de dag in `subscription_snapshots`.
- Een mislukte ronde schrijft `last_error` en het dashboard toont "gegevens van <tijdstip>"
  in plaats van stil oude cijfers.

### 6.4 De regels (`lib/sales/derive.js`, één bestand)

| Begrip | Regel |
|---|---|
| Abonnement | alle orders met hetzelfde `origin_order_id` (of het eigen id als eerste contract) |
| Klant | `commercial_partner_id`; klanttype van de klant, niet van de contactpersoon |
| Actief op dag D | een bevestigde, niet-upsell order in de keten met `start_date ≤ D < einde`; "nu" = `3_progress`/`4_paused` |
| ARR | `recurring_monthly × 12` van de lopende order |
| Nieuw | eerste contract met start in de periode, **ook als het intussen stopte** (de oude tegel telt enkel wie vandaag nog in jaar één zit) |
| Verlengd | bevestigde vervolgorder (geen upsell) met start in de periode |
| Wachten op betaling | lopend abonnement met een openstaande `2_renewal`-offerte; telt mee als actief tegen de lopende prijs |
| Verloren | `6_churn` met een reden die echt stoppen is (lijst in V3) |
| Wissel | stopzetting met reden 7/13/14/16 gevolgd door een nieuw contract bij dezelfde klant binnen N dagen → uitbreiding of verlaging, geen verloren + nieuw |
| ARPA | ARR / actieve abonnementen |
| Professionele kavels | lijnen van product "Professional" per eenheid (Appartementen, Commerciële units, Huizen); bankkoppeling = product 44, Peppol = 38 |
| Transactioneel | lijnen met een niet-recurring product; datumbasis zie V5 |

### 6.5 Interactief

Zelfde aanpak als `web-visits.js`: de server stuurt compacte feiten (per abonnement en per
periode, per factuurlijn), de browser telt. Filteren op klanttype, plan, product, verkoper,
merk en periode kost dan geen nieuwe aanvraag. Elke tegel opent de lijst van de records
erachter, met een link naar de order in Odoo — zo is elk cijfer narekenbaar zonder sheet.

### 6.6 Overgang

1. D1 + sync, zonder scherm. Controle: de tellingen in §3 en §5 komen terug.
2. Tab "Verkoop" in Dashboards met dezelfde tegels als "Top KPIs", en per tegel het oude
   cijfer ernaast tot de twee op elkaar afgestemd zijn (of het verschil verklaard is).
3. Pas daarna de Apps Script-triggers uitzetten. De proxy-endpoints blijven bestaan tot ook
   de andere zes pagina's over zijn.

---

## 7. Beslist op 2026-10-05

- **Meteen de juiste cijfers**, niet eerst een kopie van het oude dashboard. Wat
  afwijkt van Looker staat hierboven verklaard (§4).
- **Stopzettingsreden 14 (dubbel abonnement) telde in Looker niet mee**
  (`f_exclude_close_reason`). In de OM valt een dubbel abonnement vanzelf weg als
  wissel zolang de klant een ander abonnement heeft; zonder ander abonnement staat
  het bij "Na te kijken".
- **Transactionele inkomsten: de datumbasis is een knop** (verkocht / gefactureerd /
  betaald).
- **Reden 7 zonder opvolger: geen regel verzinnen.** Het staat bij "Na te kijken",
  met "facturatie via expert" erbij als die vlag op de partner staat.
- **Solvio eruit**, overal (Supabase `sales_exclusions`, partner 325).
- **De tabel "Professional / vanaf"** (sheet "Datacheck 26-04-09") komt mee als
  bewerkbare lijst "Gepland, nog niet in Odoo" (`sales_planned_professionals`).
  Faseert zich uit.
- **Odoo-dashboard 19 "Targets & Funnel 2026-2027" gaat mee**, als tabblad Targets:
  interactief, targets rechtstreeks in de tabel te wijzigen. De targets van het
  boekjaar en de handmatige ratio's zijn overgenomen.
- **Targets stromen over**: één tabel (`dashboard_targets`) voor alle tabbladen.
  Verkoop toont de target Assistant + OpenVME Professional bij de nieuwe
  abonnementen; Targets kan de benodigde MQL's als aanvraagtarget zetten (tabblad
  Aanvragen).
- **Filters zoals in Webgedrag**: filterkolom links, analyse in het midden,
  kerncijfers rechts. Klantkenmerken uit leads (merk, kanaal, herkomst), actiebladen
  (huidig beheer, kavels) en partner (adviserend expert, facturatie via expert).
- Niet beantwoord: de afkortingen ES/PS. Het dashboard gebruikt de namen uit Odoo
  (`x_company_type`): VME, VME in beheer, Professioneel Syndicus.

## 8. Gebouwd

| Wat | Waar |
|---|---|
| D1-schema | `d1/om-sales/migrations/0001_init.sql` (database `om-sales`, binding `SALES_DB`) |
| Toegang tot D1 (de OM is de enige schrijver) | `src/lib/sales-db.js` |
| Odoo -> D1, elk kwartier + dagelijks volledig | `src/modules/dashboards/lib/sales/sync.js` |
| De regels (keten, periode, wissel, klantkenmerken, na te kijken) | `src/modules/dashboards/lib/sales/derive.js` |
| Merk- en productregel voor leads (= Odoo-serveractie 1209/1210) | `src/modules/dashboards/lib/sales/lead-rules.js` |
| Targets, instellingen, uitsluitingen, geplande professionals | `src/modules/dashboards/lib/sales/settings.js` + migratie `20261005120000_sales_dashboard.sql` |
| Routes `/dashboards/api/sales*` | `src/modules/dashboards/lib/sales/routes.js` |
| Tabblad Verkoop | `public/dashboards-sales.js` |
| Tabblad Targets | `public/dashboards-targets.js` |
| Gedeelde UI-bouwstenen | `public/dashboards-kit.js` |

Wat nog niet over is: de zes andere pagina's van het Looker-rapport, en het
uitzetten van de Apps Script-triggers. Die laatste stap pas als de cijfers in de OM
een tijd naast Looker gelopen hebben.

## 9. Open vragen (oorspronkelijk)

- **V1** Looker: de formules van "Lost LTM", de churn-blend en de professionele tegels zijn
  nog niet uitgelezen, net als de zes andere pagina's.
- **V2** Welke Apps Script-triggers lopen er (frequentie van `syncOdoo`, `syncPPU`,
  `buildRevenueMonthly`)? Staan er overrides in de Script Properties (`TPU_PRODUCT_IDS`,
  `TPU_CLOSE_REASON_IDS`)?
- **V3** Welke stopzettingsredenen zijn echt verloren? Voorstel: 1, 2, 3, 4, 5, 8, 9, 10, 12
  wel; 7, 13, 14, 15, 16 niet.
- **V4** Nieuwe of foute definities overnemen (ARPA, Nieuw, Verlengd Y2D), of eerst
  identiek aan het oude dashboard?
- **V5** Transactionele inkomsten: op orderdatum (verkocht, zoals nu), factuurdatum of
  betaald?
- **V6** Reden 7 bij een VME in beheer zonder opvolger: verhuisd naar de facturatie van de
  professionele syndicus?
- **V7** Solvio: blijvend of tijdelijk uit de professionele cijfers, en ook uit de ARR?
- **V8** De tabel "Professional / vanaf" en de sheet "Datacheck 26-04-09": blijft dat een
  handmatige lijst, of moet het uit Odoo komen?
