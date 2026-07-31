# Nieuw in Koppelingen: Trackbare links & QR-codes

**Datum:** 28 juli 2026

We hebben een derde type koppeling toegevoegd aan de forminator-sync-v2-module (naast Forminator-formulieren en Zapier/generic webhooks): **Trackers**. Hiermee maak je een trackbare korte link en QR-code aan die naar een willekeurige webpagina doorsturen — ideaal voor brochures, flyers, advertenties of gedeelde links waarvan je wil weten hoe vaak ze gebruikt worden.

## Wat kan je er nu mee?

- Een korte, deelbare link + downloadbare QR-code aanmaken voor eender welke bestemmings-URL (bv. `https://openvme.be/prijzen`).
- Zien hoeveel keer een link gevolgd of een QR-code gescand is — totaal, per dag, en met onderscheid tussen QR-scan en rechtstreekse link-klik.
- De QR-code naar wens stylen: eigen kleur, eigen achtergrondkleur, een logo in het midden, en downloaden als PNG of SVG.
- Een link tijdelijk deactiveren zonder hem te verwijderen (bezoekers zien dan een nette "niet meer actief"-pagina in plaats van een foutmelding).

## Waar vind je het?

In de forminator-sync-v2-module ("Koppelingen"): klik op **Nieuwe koppeling** en kies **Tracker** als bron, naast de bestaande opties Forminator-formulier en Zapier/generic webhook.

## Let op — nog in opbouw

De korte links draaien standaard op het domein **link.openvme.be**. Dat domein wordt op dit moment nog verder afgewerkt door devops (een Cloudflare-redirect voor niet-tracker-bezoeken naar de hoofdwebsite moet nog actief gezet worden). Tot dat volledig rond is, kan je in de detailweergave van een tracker via een dropdown ook kiezen om de link op **operations.openvme.be** te tonen — die werkt vandaag al voor 100%.

Vragen of iets werkt niet zoals verwacht? Laat het weten.
