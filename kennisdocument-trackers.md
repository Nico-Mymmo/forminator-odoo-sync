# Trackbare links & QR-codes

**Kennisdocument — Koppelingen-module, Operations Manager**
*Laatst bijgewerkt: 28 juli 2026*

## Wat is dit?

Bij "Koppelingen" bestond al de mogelijkheid om Forminator-formulieren en Zapier/generic webhooks te koppelen aan Odoo. Daar is nu een derde, ander soort koppeling bijgekomen: de **Tracker**.

Een tracker is geen koppeling naar Odoo, maar een trackbare korte link en QR-code die naar een willekeurige webpagina doorsturen — bijvoorbeeld een prijzenpagina, een landingspagina of een actie. Elke keer dat iemand de link volgt of de QR-code scant, wordt dat geregistreerd: je ziet hoeveel keer, wanneer, en of het via een QR-scan of een rechtstreekse link-klik gebeurde.

> Typische toepassing: een QR-code op een brochure, flyer of advertentie waarvan je het bereik wil meten, zonder dat de doelwebsite zelf aangepast moet worden.

## Snel overzicht

| Wat | Waar / hoe |
|---|---|
| Nieuwe tracker aanmaken | Koppelingen → Nieuwe koppeling → kies "Tracker" → vul naam + doel-URL in. |
| Korte link kopiëren | Op de kaart (kopieerknopje naast de link) of in de detailweergave. |
| QR-code downloaden | Detailweergave → "PNG downloaden" / "SVG downloaden". |
| QR-code stylen | Detailweergave → kleur, achtergrondkleur, logo uploaden. |
| Statistieken bekijken | Detailweergave → tab "Statistieken": totaal, tijdlijn per dag, QR vs. link, toestel. |
| Domein kiezen | Detailweergave → dropdown naast "Korte URL": link.openvme.be of operations.openvme.be. |
| Link deactiveren | "Actief"-schakelaar rechtsboven op de detailkaart. |

## Een tracker aanmaken

Ga naar Koppelingen → Nieuwe koppeling. Naast de bestaande opties "Forminator-formulier" en "Zapier / generic webhook" kies je nu "Tracker". Vul een naam in (voor intern gebruik, bv. "Brochure Eigenaar Syndicus | Prijzen") en de doel-URL waar bezoekers naartoe moeten (bv. `https://openvme.be/prijzen/`).

Na het aanmaken krijg je meteen de korte URL en QR-code te zien. Deze zijn ook later altijd terug te vinden in de detailweergave van de tracker.

## Korte link en domein

De korte link heeft de vorm `https://link.openvme.be/t/<code>` of `https://operations.openvme.be/t/<code>` — het stukje na `/t/` is een willekeurige, unieke code per tracker.

- **link.openvme.be** is het klant-gerichte domein, bedoeld om extern te delen (op flyers, in advertenties, aan klanten) — dit is het standaarddomein voor nieuwe trackers.
- **operations.openvme.be** is het domein waarmee collega's de Operations Manager zelf gebruiken. Een tracker-link werkt hier ook, en kan je gebruiken als link.openvme.be nog niet (volledig) opgezet is.

In de detailweergave kan je per tracker via een dropdown wisselen tussen beide domeinen — dit verandert enkel hoe de link/QR eruitziet, niet de registratie van kliks/scans.

> link.openvme.be is op het moment van schrijven nog in opbouw bij devops (zie het aparte devops-instructiedocument). Zolang dat niet volledig afgerond is, kies je best operations.openvme.be in de dropdown voor links die je nu al wil delen.

## QR-code aanpassen

In de detailweergave van een tracker, onder de QR-code, kan je:

- De kleur van de QR-stippen aanpassen (kleurkiezer "Kleur").
- De achtergrondkleur aanpassen (kleurkiezer "Achtergrond").
- Een logo uploaden dat in het midden van de QR-code verschijnt (bestandsveld "Logo (optioneel)") — verwijderbaar via het kruisje-knopje dat verschijnt zodra er een logo ingesteld is.
- De QR-code downloaden als PNG of als SVG (twee aparte downloadknoppen).

Kleur- en logo-keuzes worden bewaard per tracker — elke collega die dezelfde tracker opent, ziet dezelfde styling, niet enkel degene die ze heeft ingesteld.

## Statistieken

De detailweergave van een tracker heeft een eigen tab "Statistieken" (in plaats van de tabs Formuliervelden/Koppeling/Indieningen, die voor een tracker niet van toepassing zijn). Je ziet er:

- Totaal aantal kliks/scans (laatste 30 dagen en all-time).
- Een tijdlijn per dag.
- De verhouding QR-scan versus rechtstreekse link-klik.
- Een grove verdeling per toesteltype (mobiel/desktop/tablet), afgeleid uit de browser-informatie van de bezoeker.

Op de overzichtskaart zelf (in de lijst van alle koppelingen) zie je ook een mini-grafiekje met "Kliks" en "QR-scans" per dag, in hetzelfde stijl als bij de andere koppelingstypes.

## Een link deactiveren of verwijderen

Zet de "Actief"-schakelaar rechtsboven uit om een tracker tijdelijk te pauzeren zonder hem te verwijderen: bezoekers die de link dan volgen, zien een nette "deze link is niet meer actief"-pagina in plaats van een foutmelding of, erger, niets.

Verwijder je de koppeling volledig (prullenbak-icoon), dan wordt ook het bijhorende logo-bestand automatisch opgeruimd — daar hoef je zelf niets voor te doen.

## Wat ziet een bezoeker als een link niet (meer) werkt?

In plaats van een kale foutmelding tonen we altijd een nette pagina met duidelijke boodschap en een knop terug naar openvme.be, voor drie gevallen:

- Link bestaat niet (verkeerd overgetypt of nooit bestaan geweest).
- Link is gedeactiveerd ("Actief"-schakelaar staat uit).
- Een tijdelijk technisch probleem bij het opzoeken van de link.

Ditzelfde principe geldt trouwens voor eender welke onbekende pagina op link.openvme.be of operations.openvme.be: in plaats van een kale foutmelding zie je een nette "pagina niet gevonden"-pagina.

## Technische achtergrond (kort, voor wie het wil weten)

De koppeling leeft in de bestaande forminator-sync-v2-module, als een derde "source_type" ("tracker") naast "forminator" en "generic_webhook". Een klik/scan wordt gelogd in een aparte tabel (`fs_v2_tracker_hits`) en resulteert in een tijdelijke (302) doorverwijzing naar de doel-URL — er hoeft dus niets aangepast te worden aan de bestemmingswebsite zelf.

Zowel link.openvme.be als operations.openvme.be wijzen naar dezelfde Cloudflare Worker. Om technische redenen (een geproxyde DNS-koppeling tussen twee aparte Cloudflare-accounts) kan de Worker niet altijd betrouwbaar zien via welk van de twee domeinen een bezoek binnenkomt — vandaar dat de link altijd de vorm `/t/<code>` heeft: dat werkt betrouwbaar ongeacht het domein, in tegenstelling tot een aanpak die enkel op de domeinnaam zou vertrouwen.

## Vragen of problemen?

Klopt iets niet, of wil je een extra functie (bv. bulk-aanmaken van trackers, extra statistieken)? Laat het weten aan het team dat de Operations Manager beheert.
