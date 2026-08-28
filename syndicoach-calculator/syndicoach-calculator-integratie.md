# Syndicoach formule-finder

Versie `2026.08-v24` bij `syndicoach-calculator.html`.

**v24: geen prijs meer op de resultaatstap, wel een pakket-vak en twee CTA's.** Zodra de laatste vraag beantwoord is, schuift alles naar boven en toont de kaart de gekozen formule met daaronder een apart kader "Wat zit er in dit pakket" (`.sc-pakket-box`, voorheen een losse lijst zonder kader), gevolgd door het contactformulier. Er staat geen bedrag meer op het scherm: `bereken()`/`S.prijs` draait nog gewoon door en de bedragen gaan nog altijd mee in de payload (zie §5), enkel de weergave (`prijsBlok()`) is niet meer aangeroepen — de functie blijft ongebruikt in de code staan, klaar om later weer ingeschakeld te worden. In plaats van één knop staan er nu twee CTA's naast/onder elkaar: **"Vraag offerte op maat"** (primair, `#sc-next`) en **"Plan liever een gesprek in"** (secundair, `#sc-gesprek`, `.sc-cta-secondary`). Beide sturen voorlopig hetzelfde formulier op, enkel met een ander intent-vlaggetje (`calc_gewenst_actie`: `offerte` of `gesprek`) — er hangt nog geen echte agenda/scheduler achter de tweede knop, dat is een latere uitbreiding. Het formulier vraagt nu ook een postcode (`#sc-postcode`, gedeeld met `S.extra.postcode` uit de detailstap) en een contactvoorkeur als radiobuttons (`E-mail` / `Telefoon` / `Beide`, `name="sc-contact"`, opgeslagen als `S.contact` en verstuurd als `calc_contactvoorkeur`). E-mail blijft verplicht ongeacht de gekozen voorkeur, want dat is het identificatieveld waarop de Odoo-upsert draait (`partner_by_email`) — de foutmelding bij een leeg e-mailveld legt dat nu ook uit. `submitLead(btn, actie)` herstelt bij een mislukte verzending voortaan de eigen knoptekst van de knop die is ingedrukt (`terug = btn.innerHTML`, vóór `busy()` vastgelegd) in plaats van een hardgecodeerde tekst, zodat dat ook voor de tweede CTA klopt.

**v24, tweede wijziging: het gebouw op stap 3/4 kreeg meer lucht rond de titel.** Bij het bouwen van v23 kwam de tekening soms tot tegen de titeltekst, vooral bij de nivo's met een compactere/lager geplaatste tekening binnen hun kader (de "ink"-verhouding verschilt per nivo). Drie tuningswaarden zijn aangepast: de bovenmarge van het gebouwslot (`.sc-recap-bldg`) ging van 2px naar 20px, `RECAP_BLDG_PAD` (de lucht tussen de tekening en de rand van haar kolom, gebruikt in de live ink-meting `bldgInkt()`) van 10 naar 16, en de maximale schaal die de recap-animatie aan het gebouw mag geven (`kRec`) is geplafonneerd op 0,85 in plaats van 1 — dat voorkomt dat de veer/bounce-animatie het gebouw tijdelijk groter dan zijn slot laat overschieten en zo alsnog tegen de titel aan botst. Dit is een gerichte, redeneerde fix op de bestaande ink-gebaseerde uitlijning (zie "Gebouw-uitlijning" verderop) — niet visueel geverifieerd op een render, enkel gecontroleerd op syntax en dat de waarden consistent zijn met de bestaande formules.

**v23: de strook bovenaan de vraagstappen is losgekoppeld en naar onderaan verhuisd — de vraag staat weer als eerste, zoals op elke andere stap.** Tot v22 stond de vak-samenvatting (uitdagingen + de twee beheervakken, met het gebouw ernaast) vóór de vraag, waardoor stap 3 en 4 als enige de titel niet bovenaan hadden staan — inconsistent met stap 1 en 2. Nu is de volgorde overal gelijk: vraag, dan gebouw, dan de antwoorden voor déze vraag, en pas onderaan een lichte samenvatting van wat je op de vorige stappen al aanduidde (`recapStrook()`, voorheen `topStrook()`).

Die samenvatting toont voortaan **enkel vakken die al een antwoord dragen** — geen lege plekhouders meer die enkel ruimte innamen (op stap 3 stond het "beheer nu"-vak bijvoorbeeld altijd leeg te wachten, want dat is nét de vraag die er gesteld wordt). Ze staat ook een stuk **smaller** dan voorheen (`max-width:440px`, gecentreerd) in plaats van de volle breedte van de kaart, en de ballonnetjes erin krijgen meer lucht: `VAK_PAD_X/TOP/BOT` gingen van 12/26/10px naar 20/36/18px en het maximale schaalpercentage (`VAK_K_MAX`) van 0,78 naar 0,60, zodat een ballonnetje niet langer tot tegen de rand van zijn vak komt. Het gebouw kreeg een eigen, kleiner slot (`topBldg()`, 210×180px, gecentreerd) vlak bij de vraag, los van de vak-samenvatting.

Functioneel zit de logica nog altijd op dezelfde leest: `.sc-topbox`-elementen met `data-box` blijven het doelwit van de vliegende ballonnetjes (`vakRect()`), en een vak verschijnt nu exact op het moment dat de bijbehorende vraag ook echt beantwoord én gepasseerd is — dezelfde voorwaarde die de animatiecode al gebruikte om een ballonnetje al dan niet naar dat vak te laten vliegen, dus geen gedragswijziging daar, enkel minder rommel in de layout.

## 1. De funnel

4 vragen, elk op zijn eigen stap: kavelgrootte, assessment (wat speelt er), huidig beheer, gewenst beheer. Dan formule met richtprijs, dan e-mail, dan een optionele detailstap.

**De vraag "Hoe wil je samenwerken?" (digitaal/mix/persoonlijk) is geschrapt.** Die stond vroeger als vijfde vraag tussen "gewenst beheer" en het resultaat. `RITME_OPTS` en de state `S.ritme` bestaan niet meer, en `calc_samenwerking`/`calc_samenwerking_label` verdwenen uit de payload. De funnel gaat dus rechtstreeks van "gewenst beheer" naar het resultaat.

De oude vraag "Wie neemt het beheer op?" (4 opties: eigenaar, samen, professional, onbekend) is gesplitst in twee vragen: eerst de huidige situatie (`calc_beheer_nu`: geen syndicus, doen het zelf, of al een professional), dan de gewenste situatie (`calc_beheer_wens`: zelfbeheer met ondersteuning, of volledig professioneel beheer).

**De formulekeuze in `kiesFormule()` is niet langer een trapsgewijze als-dan-regeling maar een optelsom.** Voorheen bepaalde vooral `calc_beheer_wens` de formule, met `calc_beheer_nu` als tie-breaker. Nu telt alles mee in één score, opgebouwd uit vier bronnen — omvang (kavels), uitdagingen (het diagram), gebouw (commerciële kavels) en antwoorden (huidig/gewenst beheer) — met de opbouw en de drempels samen in één configuratie-object, `FORMULE_WEGING`, zodat je aan de verhoudingen kan draaien zonder de logica aan te raken:

| bron | regel | punten |
|---|---|---|
| kavels | trapsgewijs, hoogste trap die geldt | 0 vanaf 0 kavels, 1 vanaf 12, 2 vanaf 24, 4 vanaf 40, 5 vanaf 60 |
| uitdagingen | som van de aangevinkte gewichten uit `BEHOEFTEN_OPTS`, geplafonneerd | max 6 (`uitdagingMax`) |
| commercieel | toggle aan | +1 |
| beheer nu | `calc_beheer_nu` | geen: 3, zelf: 1, professional: 0 |
| beheer wens | `calc_beheer_wens` | zelf_ondersteund: 0, professioneel: 5 |

De vijf bronnen tellen op tot `d.totaal`; vanaf 5 punten wordt het Coach, vanaf 11 Captain, daaronder Assistant (`FORMULE_WEGING.drempel`). Het plafond op de uitdagingen-score is bewust: zonder die grens zou wie alles aanvinkt (samen 12 punten) automatisch bovenaan uitkomen, ongeacht de grootte van het gebouw. `formuleScore()` geeft de volledige opbouw terug (`kavels`, `uitdagingen`, `commercieel`, `beheerNu`, `beheerWens`, `totaal`, `formule`) en die opbouw gaat nu ook mee in de payload als `calc_score_totaal`, `calc_score_kavels`, `calc_score_uitdagingen`, `calc_score_commercieel`, `calc_score_beheer_nu` en `calc_score_beheer_wens` (zie §5) — zo kan je op echte inzendingen zien hoe de verdeling loopt en de drempels bijstellen met cijfers in de hand in plaats van op gevoel.

De oude complexiteitsvraag ("Wat speelt er in je gebouw?") is herschreven als een behoeften-assessment (`BEHOEFTEN_OPTS`) en staat op haar eigen stap, meteen na de kavel-slider: complexe technische installaties, lopende/geplande werken, betwiste dossiers, achterstallige boekhouding, VME op orde zetten, een minder goede onderlinge sfeer, en een slechte relatie met de huidige beheerder, plus "wij hebben andere uitdagingen". "Een lift" en "commerciële kavels" zijn daarbij bewust geschrapt als aparte factoren; ze wogen weinig door en pasten niet meer bij de "behoefte"-framing. **Het gewicht van `installaties` in `complexNiveau()` staat nu op `2`** (was `1`) — gelijk aan `werken`, `dossiers`, `boekhouding` en `orde`; enkel `sfeer` en `relatie` wegen nog `1`. De drempels voor laag/midden/hoog liggen ongewijzigd (score ≥3 = hoog, ≥1 = midden).

Boven de kavel-slider (stap 1) staat een gebouw-illustratie die met het aantal kavels meegroeit/krimpt: 5 niveaus (`BOUW_ILL`), gekoppeld via `bouwNiveau()` aan vaste drempels — 2-5 kavels: niveau 1, 6-15: niveau 2, 16-25: niveau 3, 26-39: niveau 4, 40+: niveau 5. Bij een niveauwissel wisselt de svg en speelt een korte bounce/pop-animatie (`sc-bldg-pop`, met anticipatie-inzakking gevolgd door een overshoot), zodat het voelt alsof het gebouw letterlijk groter of kleiner "plopt". De animatie schaalt vanuit `transform-origin:bottom center` op `.sc-bldg-img`, dus de onderrand blijft vastzitten en het gebouw rekt enkel zijwaarts en naar boven uit. Illustraties zijn geoptimaliseerd met `svgo` (~35% kleiner, geen visueel verschil) maar blijven met ~470KB samen de grootste bijdrage aan de bestandsgrootte. Bij toekomstige performance-klachten: dit is de eerste plek om te knippen.

De brondbestanden delen dezelfde vierkante tekenruimte (2048×2048), maar het getekende gebouw zelf liet van nature ruimte vrij onder de tekening — een marge die per niveau lichtjes verschilde. Dat is opgelost door de `viewBox` van elke svg te bijsnijden tot net onder de werkelijke tekening en `preserveAspectRatio="xMidYMax meet"` toe te voegen: de tekening vult zo het kader optimaal en eventuele resterende letterbox-ruimte wordt altijd bovenaan geplaatst, nooit onderaan. Wordt een bestand vervangen, dan moet de bijsnede opnieuw gemeten worden.

**Opt-in "commerciële kavels"** — onder de titel/subtitel van stap 1 staat een subtiele toggle "Het gebouw heeft commerciële kavels (winkels, kantoren, ...)": een kleine `.sc-comm-check`, bewust géén los systeem-checkbox-element. Is de toggle aan, dan toont de illustratie de Comm-variant van hetzelfde niveau (`BOUW_ILL_COMM`, geselecteerd via `bouwIll(level, commercieel)`); bij elke kavel- of niveauwissel blijft de gekozen variant behouden. Dit is bewust **puur visueel**: `S.commercieel` telt op zichzelf niet mee in `complexNiveau()`, maar telt sinds de herschreven formulekeuze wél mee als losse `+1`-bron in `formuleScore()` (zie boven — dat is nieuw). De waarde wordt ook meegestuurd als `calc_commercieel` (`ja`/`nee`) in de payload.

Alle 10 illustraties (`App_level1.svg` t/m `App_level5.svg` en hun `...Comm.svg`-tegenhangers, aangeleverd door Nico) zijn verwerkt met dezelfde svgo-optimalisatie en bijsnede/`preserveAspectRatio`-behandeling. Geen enkele kleur is aangepast. Alle 10 varianten zijn geverifieerd op pixel-perfecte onderrand-uitlijning binnen hun kader.

**Stap 2 (behoeften-assessment) toont het gekozen gebouw centraal, met de items errond verbonden via lijntjes ("hotspot-diagram").**

Werking: in de brondbestanden (alle 10) zit een onzichtbare `<g id="Pins">`-groep met kleine `<ellipse>`-markeringen (`fill:none`, dus niet zichtbaar, maar wel reële DOM-elementen met een positie), één per behoefte-item: `pin-installaties`, `pin-werken`, `pin-dossiers`, `pin-boekhouding`, `pin-orde`, `pin-sfeer`, `pin-relatie`. `BEHOEFTEN_PIN_IDS` telt 7 ids. Deze pins overleven de svgo-optimalisatie en tellen niet mee bij de bijsnede-meting.

In de code (`svgHasPins()`, `stepAssessment()`) wordt bij het tonen van stap 2 gecontroleerd of de svg van het huidige niveau/commercieel alle 7 pins bevat. Zo ja: het gebouw komt groot en centraal onderaan te staan, en de 7 items worden getoond als organische "ballonnetjes" (`.sc-orbit-tile`, een blob-vorm via asymmetrische `border-radius`, met de eigen illustratie of anders het icoon erin) die op een hoefijzer boven het gebouw hangen, elk verbonden met een dun, gestippeld, licht gekromd lijntje naar hun exacte pin. "Wij hebben andere uitdagingen" krijgt geen lijntje en staat als aparte, rechts uitgelijnde uitweg onder het diagram (`geenBtn()`), functioneel exclusief met de rest.

*Plaatsing.* De posities komen uit een expliciete tabel, `ORBIT_ANCHORS` — een hoefijzer met twee ballonnetjes links, drie in een lichte zigzag bovenaan, twee rechts, elk als `kx` (fractie van de bruikbare halve breedte, schaalt dus mee met de kolombreedte) en `y` (px vanaf de bovenrand, diagramhoogte vast op 460px). `ORBIT_INSET` (34px) houdt de hele slinger van de rand van de kolom weg. Een botsingscontrole (rechthoekige toets) blijft als vangnet duwen langs de as die het snelst uit elkaar leidt, mocht een thema andere lettergroottes opleggen. Overlap met het gebouw zelf is geen constraint: ballonnetjes mogen over het kader van de tekening komen.

*Koppeling pin → ballon.* Een uitputtende zoektocht (alle 5040 volgordes van 7 pins naar 7 posities) kiest de kruisingsvrije koppeling die ook de meest "logische" waaier vormt: pins gerangschikt op hun hoek t.o.v. het zwaartepunt van alle pins, van linksonder met de klok mee naar rechtsonder. De zoektocht weegt ook de onderlinge afstand tussen lijnen: elk paar dat dichter dan `ORBIT_LINE_GAP` (26px) bij elkaar komt krijgt een kwadratisch oplopende boete (exacte segment-tot-segment-afstand). Een naregeling halveert bovendien de kromming van twee lijnen die elkaar door hun eigen uitbuiging tóch zouden kruisen.

*Formaat, hover en vorm.* Blob 112px met illustratie van 88px; op hover groeit de blob naar `scale(1.42)` (~159px). Titel in een chip van vaste 136px breedte (`.74rem`), subtekst in een apart zwevend paneeltje van 224px (`.7rem`) dat pas bij hover verschijnt — puur met `opacity`/`transform`, geen enkele geanimeerde afmeting meer, want dat gaf vroeger herbrekende tekst en verspringende chips. Elk item heeft een eigen `blob`-formule (acht radii, samen exact 100% per zijde), eigen `tilt` (−4,5° tot +4°) en eigen zweeftempo (`fdur`/`fdel`, 8,5–12s met negatieve delays). Buren wijken bij hover uit met een kracht die met de afstand afneemt en een vertraging die ermee oploopt, zodat het als een rimpeling leest.

*Copy.* De vraag is `Wat speelt er in jullie gebouw?` met als hulptekst `Vink aan wat er speelt. Dat bepaalt hoeveel opvolging jullie gebouw vraagt.` De titels zijn kort en feitelijk (`Technisch beheer`, `Werken en premies`, `Aanslepende dossiers`, `Boekhouding`, `VME op orde zetten`, `Sfeer in het gebouw`, `Relatie met de syndicus`), elk met een `sub`-toelichting die pas bij hover verschijnt en **geen belofte of marketing** is: ze gaat over de klant, nooit over "wij zorgen dat". De payload-waarden (`installaties`, `werken`, `dossiers`, `boekhouding`, `orde`, `sfeer`, `relatie`, `geen`) zijn ongewijzigd.

**Het gebouw en de gekozen ballonnetjes reizen mee door de funnel, via een podium.** `#sc-stage` is een absolute laag over de kaart die nooit opnieuw opgebouwd wordt; daarin leven het gebouw en alle veertien ballonnetjes (de 7 uit het diagram plus de antwoord-ballonnetjes van de twee beheervragen), van de eerste tot de laatste stap dezelfde DOM-elementen. Elke stap zet in zijn eigen body enkel lege **slots** (`<div class="sc-slot" data-slot="...">`) met de juiste hoogte; het podium meet die op en schuift zijn elementen ernaartoe met een transform-transitie (`--x`/`--y`/`--k`), dus verhuizen is een glijbeweging, geen sprong.

**Sinds v23 staat de vraag altijd bovenaan (`q()`), daaronder een eigen, klein gebouwslot (`topBldg()`, 210×180px, gecentreerd), en pas onderaan — als er al iets te tonen valt — een lichte samenvatting van de vorige antwoorden (`recapStrook()`, de opvolger van het oude `topStrook()`).** `recapStrook()` doorloopt `ANTW_GROEPEN` en rendert per groep enkel een vak (`recapVak()`) zodra die vraag beantwoord én gepasseerd is (`S.step > gr.stap && keuze`); is er nog niets te tonen, dan geeft de functie een lege string terug en verschijnt er niets. De vakken staan gecentreerd naast elkaar (`.sc-recap-row`, max. 210px breed elk) onder een klein label "Wat je eerder aangaf" (`.sc-recap-l`), in een kolom die zelf max. 440px breed is (`.sc-recap`) in plaats van de volle kaartbreedte. Op smalle schermen (≤640px) verdwijnt enkel het gebouwslot (`.sc-recap-bldg` heeft daar `display:none`); de recap-vakken blijven staan.

Het opschrift van een vak is niet generiek (geen vaste kop als "Beheer nu"): het is het gegeven antwoord zelf als volzin, uit het `vak`-veld op elke optie (bv. `"Vandaag geen syndicus"`, `"Liefst zelf, met steun"` — `vakOpschrift()`). Bij "Volgende" vliegt het gekozen antwoord-ballonnetje als hetzelfde DOM-element naar zijn vak — het verdwijnt niet en duikt elders opnieuw op — en de niet-gekozen ballonnetjes reizen mee die richting uit en lossen onderweg op.

De antwoorden van de twee beheervragen zijn dus geen vierkante tegels meer maar dezelfde organische ballonnetjes als in het diagram — met een eigen `blob`/`tilt`/`fdur`/`fdel` en een altijd zichtbare `vak`-subtitel in de chip (`BEHEER_NU_OPTS`, `BEHEER_WENS_OPTS`).

*Gebouw-uitlijning.* De positie van het gebouw in zijn kader wordt live gemeten (`bldgInkt()`): over alle zichtbare, gevulde of omlijnde vormen in de svg wordt met `getBoundingClientRect()` bepaald waar de tekening werkelijk begint en eindigt (boven, onder, links, rechts), als fractie van het svg-element — schaal-onafhankelijk, dus geldig terwijl het gebouw nog aan het glijden of veren is. Lukt de meting niet (podium verborgen, geen svg gevonden), dan valt het terug op een vaste, opgemeten tabel (`BOUW_LINKS`) voor de horizontale herkomst bij het groeien/krimpen op de slider.

*Onder de motorkap.* De klikafhandeling voor de ballonnetjes hangt niet meer aan de stap-body maar eenmalig aan de kaart (`#sc-card`); een selectie doet nergens meer een volledige `render()` — `syncSel()` zet de `is-sel`-klasse op alle kopieën tegelijk (nu per vraag-groep afgebakend, zodat een klik in de herinnerde uitdagingen-strook niet de selectie van de huidige beheervraag overschrijft) en werkt de "Volgende"-knop bij.

**De "Vorige/Volgende"-balk onderaan is nu ook een blijvende node.** Vroeger tekende elke stap zijn eigen `<div class="sc-nav">` mee in de HTML die bij elke render vervangen werd; nu roept een stap enkel `nav(backLabel, nextLabel, enabled, solid)` aan, wat alleen een configuratie-object (`NAV_CFG`) klaarzet, en `navRender()` werkt daarna de blijvende host-node (`#sc-nav`) bij. De tekst op de knoppen wisselt met een kleine wip-weg-en-terug-animatie (`navLabel()`, `.is-swap`) in plaats van in te knippen. De stappen met afwijkende knoppen — het resultaat (e-mailgate + "Vergelijk de drie"), de detailstap (+ "Overslaan") — bouwen nog altijd hun eigen balk rechtstreeks in hun body-HTML; `nav()`/`navRender()` bedient alleen de vier vraagstappen en de formule-vergelijkstap.

**Nieuw: optionele redirect na de detailstap.** `CFG.REDIRECT_URL` staat standaard leeg; is hij ingevuld, dan stuurt `klaarRedirect()` de bezoeker 2,5 seconden na het tonen van de "Bedankt"-stap daarheen door.

Twee inzendingen per lead:

- `calc_fase = lead`, direct na de e-mailgate. Dit is de lead.
- `calc_fase = aanvulling`, als de detailstap wordt ingevuld.

Beide gaan naar dezelfde integratie. De targets upserten op e-mail, dus fase 2 **verrijkt** dezelfde `res.partner` en `crm.lead`. Idempotency blokkeert het niet, want de payload-hash verschilt. Gebruik `update_policy: only_if_incoming_non_empty`, anders wist fase 2 lege velden.

## 2. Resultaatstap: pakket + offerte-aanvraag (geen prijs meer)

Sinds v24 toont de resultaatstap geen prijs meer aan de bezoeker. In plaats daarvan:

1. De gekozen formule als titel/tagline (`F.naam`/`F.tagline`).
2. **"Wat zit er in dit pakket"** — de inclusielijst (`F.incl`) in een apart kader, `.sc-pakket-box`.
3. Het contactformulier: Naam, e-mail (verplicht), telefoon, postcode, en een contactvoorkeur (`E-mail` / `Telefoon` / `Beide`, radiobuttons).
4. Twee CTA's: **"Vraag offerte op maat"** (primair, `#sc-next`) en **"Plan liever een gesprek in"** (secundair, `#sc-gesprek`) — beide roepen `submitLead(btn, actie)` aan met een ander `actie`-vlaggetje, dat als `calc_gewenst_actie` meegaat in de payload. Er is nog geen echte scheduler/agenda achter de tweede knop; dat is een latere uitbreiding.

De oude prijsweergave (`prijsBlok()` — groot cijfer, jaar 1 naast vanaf jaar 2, uitsplitsing per formule, "Op maat" vanaf `CFG.GROOT_VANAF`) is **niet verwijderd**, enkel niet meer aangeroepen vanuit `stepResultaat()`. De onderliggende berekening (`bereken()`/`S.prijs`) draait nog altijd en de bedragen blijven meegaan in de payload voor sales/Odoo (zie §5) — enkel de weergave aan de bezoeker is uit. Wil je de prijs later weer tonen (bv. voor een A/B-test), dan volstaat het om `prijsBlok(p)` opnieuw in `stepResultaat()` op te nemen.

## 3. Plaatsen op WordPress

1. Verwijder de base44-embed en het losse Forminator-blok op `/offerte/`.
2. Custom HTML-blok (Gutenberg) of HTML-widget (Elementor).
3. Plak alles vanaf `<div id="sc-calc">` tot en met `</script>`. Dus zonder `<!DOCTYPE>`, `<html>`, `<head>` en `<body>`; de `<style>` hoort er wel bij.
4. Vul in `CFG` in: `WORKER_URL`, `WORKER_TOKEN`, `FORMINATOR_FORM_ID`. `REDIRECT_URL` is optioneel — laat leeg om na de detailstap gewoon op de bedankpagina te blijven staan.

Alle CSS is genest onder `#sc-calc`. Geen jQuery, geen externe requests, geen iframe. Icons zijn inline SVG met `stroke="currentColor"`, dus ze volgen je tekstkleur.

CORS: de Worker moet `POST` vanaf `https://syndicoach.be` toelaten (`src/router/cors.js`).

## 4. SUBMIT_MODE

| Waarde | Gedrag |
|---|---|
| `both` | Worker **en** Forminator. Eén succes is genoeg. **Start hier.** |
| `worker` | Alleen rechtstreeks. Pas als je in `fs_v2_submissions` ziet dat alles klopt. |
| `forminator` | Alleen via Forminator. Noodrem. |

**Dataverlies.** Zodra de POST de Worker haalt is de lead veilig: `fs_v2_submissions` bewaart de payload vóór de Odoo-write en `processDueRetries()` pikt een gefaalde write op. Het risico zit ervóór (netwerk, adblocker, CORS, Worker down). Daarom `keepalive:true` op de fetch, een `localStorage`-buffer die bij de volgende paginaweergave opnieuw probeert, en een expliciete foutmelding met je mailadres. Wat de buffer niet dekt is iemand die faalt en nooit terugkomt; daarvoor is `both` de verzekering.

## 5. Velden

Alles is geprefixt met `calc_`. Dat is nodig: de Worker matcht velden met een greedy prefix-regel, dus een veld dat `email` heet matcht ook `email_1`.

**Contact:** `calc_email` `calc_naam` `calc_telefoon` `calc_consent` `calc_contactvoorkeur` (`email` \| `telefoon` \| `beide`, sinds v24)

**Antwoorden:** `calc_kavels` `calc_commercieel` (`ja` \| `nee`) `calc_beheer_nu` (`geen` \| `zelf` \| `professional`) `calc_beheer_nu_label` `calc_beheer_wens` (`zelf_ondersteund` \| `professioneel`) `calc_beheer_wens_label` `calc_complexiteit_items` (`installaties`, `werken`, `dossiers`, `boekhouding`, `orde`, `sfeer`, `relatie`, `geen` — komma-gescheiden) `calc_complexiteit_score` `calc_complexiteit_niveau` (`laag` \| `midden` \| `hoog`)

*Geschrapt sinds deze update:* `calc_samenwerking` en `calc_samenwerking_label` bestaan niet meer — de bijhorende vraag ("Hoe wil je samenwerken?") is uit de funnel gehaald (zie §1).

**Uitkomst:** `calc_formule` `calc_formule_label` `calc_formule_advies` `calc_formule_gewijzigd` `calc_licentie_tier` `calc_tool_pm` `calc_uren_opstart` `calc_uren_beheer_pm` `calc_uren_av` `calc_uren_coaching_pj` `calc_beheer_pj_excl` `calc_opstart_excl` `calc_jaar1` `calc_jaar2` `calc_prijs_kavel_pm` `calc_gewenst_actie` (`offerte` \| `gesprek`, sinds v24 — welke van de twee CTA's op de resultaatstap is ingedrukt; geen van beide toont nog een bedrag aan de bezoeker, zie §2, maar deze prijsvelden gaan wel nog mee in de payload)

*Nieuw:* `calc_score_totaal` `calc_score_kavels` `calc_score_uitdagingen` `calc_score_commercieel` `calc_score_beheer_nu` `calc_score_beheer_wens` — de volledige opbouw van de nieuwe puntenscore achter `kiesFormule()` (zie §1). Handig als losse kolommen in de chatter-samenvatting of als eigen `x_studio_*`-velden, zodat je op echte inzendingen kan zien of de drempels (5/11) nog kloppen.

**Detailstap:** `calc_vme_naam` `calc_adres` `calc_postcode` `calc_bouwjaar` `calc_rol` `calc_huidige_syndicus` `calc_overstap_termijn` `calc_opmerking`

*Let op:* `calc_postcode` kan sinds v24 ook al ingevuld zijn vóór de detailstap — het veld `#sc-postcode` op de resultaatstap schrijft naar dezelfde `S.extra.postcode`. Komt de bezoeker nooit bij de detailstap (die is optioneel), dan zit de postcode dus toch al in de eerste inzending (`calc_fase = lead`).

**Meta:** `calc_fase` `calc_versie` `calc_source_url` `calc_duur_sec` `form_id` `form_title`

Getallen gebruiken een punt als decimaalteken. `calc_formule_gewijzigd = ja` betekent dat de klant zelf een andere formule koos dan het advies; dat is de nuttigste vlag in de hele set.

## 6. Forminator-formulier (voor `both` en `forminator`)

Eén formulier, bijvoorbeeld "Offerte formule-finder", op de pagina in een `<div hidden>`. Geef het `data-sc-forminator` mee. Eén Hidden-veld per payload-key uit §5, met `name` exact gelijk aan de key. E-mail, naam en telefoon als echte velden, want Forminator wil een e-mailveld voor zijn notificaties. Werkt een `name` niet, zet dan `data-sc="calc_kavels"` op de input; de calculator kijkt daar eerst.

## 7. Worker-configuratie

**Integratie.** Bij `both` volstaat **één** integratie met `source_type: 'forminator'`: de directe post stuurt `form_id` en `form_fields` in exact hetzelfde formaat, dus `resolveFormId()` vindt in beide gevallen hetzelfde id. Vul `webhook_token`, `site_key: 'syndicoach'` en de bestaande `odoo_connection_id` in.

**Resolver.** `partner_by_email` op `calc_email`, `create_if_missing: true`, output `partner_id`.

**Targets.**

| # | label | model | operation | identifier | update_policy |
|---|---|---|---|---|---|
| 10 | Contact | `res.partner` | upsert | `single_email` | `only_if_incoming_non_empty` |
| 20 | Lead | `crm.lead` | upsert | `single_email` | `only_if_incoming_non_empty` |
| 30 | Samenvatting | `crm.lead` | `chatter_message` | | |
| 40 | Opvolgtaak | `crm.lead` | `create_activity` | | |

Target 30: `source_type: 'html_form_summary'` met leeg `source_value` geeft automatisch alle velden als HTML-tabel in de chatter, inclusief de nieuwe `calc_score_*`-velden — snelste weg naar "sales ziet alles" zonder 30 mappings.

Target 40: `condition_field: calc_fase`, `condition_values: ['lead']`, anders twee taken per lead.

**Mappings op target 20:**

| odoo_field | source_type | source_value |
|---|---|---|
| `email_from` | form | `calc_email` (required, identifier) |
| `name` | template | `Offerte {calc_formule_label} - {calc_kavels} kavels` |
| `contact_name` | form | `calc_naam` |
| `phone` | form | `calc_telefoon` |
| `partner_id` | context | `partner_id` |
| `expected_revenue` | form | `calc_jaar2` (float) |
| `description` | html_form_summary | leeg = alles |

Plus de `x_studio_*`-velden voor formule, kavels, complexiteit, en beheer (huidig én gewenst). Check de echte namen met `odoo_custom_fields` op `crm.lead`; bestaan ze niet, laat het dan via de HTML-samenvatting lopen. Voor elk selection-veld een field transform met `value_map` en `__catchall__`.

`name` via `template` in plaats van de hardcoded fallback in `worker-handler.js`, zodat je lead "Offerte Captain - 14 kavels" heet in plaats van "Lead".

**Testen:** `POST /api/integrations/<id>/test-stub`, dan `npm run logs`, dan het tabblad Indieningen (`resolved_context.target_actions`). Droog testen kan met `SC.cfg.WORKER_URL = 'https://webhook.site/<id>'` in de console.

## 8. Het prijsmodel

Geijkt op je Captain-template: bij 6 kavels reproduceert het model die offerte.

| | formule | 6 kavels | offerte |
|---|---|---|---|
| beheer/maand | `0,5 + 0,08 x kavels` | 0,98 u | 1 u |
| AV | `6 + 0,35 x kavels` | 8,1 u | 8 u |
| opstart | `12 + 0,85 x kavels` | 17,1 u | 17 u |
| beheer/jaar | | € 1.589 | € 1.600 |
| opstart | | € 1.368 | € 1.360 |

Coach: `4 + 0,35 x kavels` coaching, `3 + 0,35 x kavels` opstart (6,1 u en 5,1 u tegen 6 u en 5 u). Complexiteit is een factor op de uren: 1,00 / 1,15 / 1,30 recurrent en 1,00 / 1,20 / 1,40 op opstart. Alles staat in `CFG` bovenaan het bestand. Deze cijfers en formules zijn ongewijzigd sinds de vorige documentatie-stand — enkel de formulekeuze eromheen (§1) is herschreven, niet het prijsmodel zelf.

## 9. Vier fouten in de huidige aanpak

1. **Captain schaalde niet mee met de gebouwgrootte.** € 1.600 vast is € 22 per kavel per maand bij 6 kavels en € 6,70 bij 20. Je verkocht Captain dus aan Assistant-prijs zodra een gebouw groter werd.
2. **Captain en Coach staan op een verschillende btw-basis in dezelfde offerte.** Captain rekent € 80/u (1.360 gedeeld door 17), Coach € 108,90/u, en dat is exact 90 x 1,21.
3. **De banden op je website haal je bij kleine gebouwen niet.** Met je eigen offertecijfers komt Captain bij 8 kavels op € 28 per kavel per maand incl. btw en bij 4 kavels op € 40, terwijl de site € 20-30 belooft. Bij 40 kavels klopt het (€ 18). Kies: band per gebouwgrootte, of een minimumhonorarium en de band naar boven.
4. **"Wij willen digitaal werken" duwde de licentie van Basic naar Smart**, dus € 6 naar € 9 per kavel. Logisch qua kostprijs, verkeerd qua signaal. Overweeg Smart als standaard voor iedereen.

## 10. Wat ik van jou nodig heb

1. Uurtarief: € 80 of € 90, incl. of excl. btw? Eén tarief voor beide formules?
2. Communiceren we incl. of excl. btw? Staat nu op incl., want een VME kan de btw niet recupereren.
3. OpenVME: prijs per kavel per maand voor Basic, Smart en Unlimited. En waarom is het Captain-tarief € 4 en het Coach-tarief € 9?
4. Kloppen de urenformules? Vooral AV-uren en beheeruren bij 20 en 40 kavels. Geef me twee of drie echte offertes van verschillende grootte, dan ijk ik het model daarop in plaats van op één template.
5. Minimumhonorarium voor Captain en Coach? Onder 6 kavels wordt het per kavel anders onverkoopbaar duur.
6. Assistant rekent nu alleen licentie plus optionele opstarthulp. De offerte noemt € 250 voor 2 u opstarthulp, dat is € 125/u en past bij geen van beide tarieven.
7. Zit de gebouwscan ter plaatse in de 17 opstarturen? Bij 40 kavels wordt opstart 46 u, ofwel ruim € 4.400.
8. Nu de formulekeuze een puntenscore is (§1): kloppen de drempels 5/11 en de gewichten in `FORMULE_WEGING` met je onderbuikgevoel over wie Assistant/Coach/Captain zou moeten krijgen? Dat is nu makkelijk bij te stellen — geef gerust voorbeeldcombinaties waarvan je zeker weet welke formule erbij hoort.

## 11. Aanbevelingen

- **Zet één minimumhonorarium neer.** Kortste weg naar een model dat bij elke gebouwgrootte klopt.
- **Meet de afhaakpunten.** Drie regels in `go()`: `dataLayer.push({event:'sc_step', step:n})`. Binnen twee weken weet je welke vraag mensen wegjaagt — vier vragen ipv vijf zou dat sowieso al moeten verbeteren.
- **De oude complexiteitsvraag was het echte probleem.** "Hoe complex is je gebouw? Complex: lift, meerdere installaties" vraagt de bezoeker zichzelf als lastig geval te labelen. Nu vinkt hij feiten aan en labelt het model intern.
- **"Er is (nog) niemand bereid of geschikt"** was de scherpste zin op je site. *Inmiddels doorgevoerd:* de beheervraag is gesplitst in een feitelijke "hoe nu" (geen syndicus, doen het zelf, al een professional) en een aparte "hoe straks" (zelfbeheer met ondersteuning, volledig professioneel), zodat niemand zichzelf als lastig geval hoeft te framen.
- **"We doen het samen"** dekt nu expliciet meerdere mede-eigenaars die het werk verdelen, niet één vrijwilliger. Dat is een andere doelgroep dan de klassieke eigenaar-syndicus en verdient eigen copy op `/pakketten/`.
