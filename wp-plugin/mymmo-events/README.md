# Mymmo Events

Kalender, eventpagina's en inschrijvingen op WordPress, rechtstreeks uit de
OpenVME Operations Manager.

## Het uitgangspunt

Er wordt in WordPress **niets** over events bewaard: geen custom post type,
geen eigen tabellen, geen kopie van de records. De Operations Manager is de
enige bron, met Odoo als database daarachter.

Wat wel lokaal staat is een **cache in twee lagen**: een korte transient voor
de snelheid, plus een last-known-good in een option als vangnet. Valt de API
weg, dan blijft de kalender staan. Omdat er maar een bron is, kan er niets uit
elkaar lopen — dat was precies het probleem met de vorige opzet, waar events
in WordPress gedubbeld werden en hun eigen levenscyclus kregen.

## Installeren

1. Upload de map `mymmo-events` naar `wp-content/plugins/`, of upload de zip
   via Plugins → Nieuwe plugin.
2. Activeer de plugin. De rewrite rules worden meteen doorgespoeld.
3. Ga naar **Instellingen → Mymmo Events** en vul in:
   - **API-URL** — de basis-URL van de Operations Manager, zonder pad
   - **Sitesleutel** — moet overeenkomen met een waarde uit
     `EVENTS_PUBLIC_SITE_KEYS` in de Worker
4. Klik **Verbinding testen**.

Zet in de Worker ook `EVENTS_PUBLIC_ORIGINS` op het domein van de site.

## URL's

| Pad | Wat |
|---|---|
| `/events/` | archief, met de shortcodes op een gewone pagina |
| `/event/{slug}/` | eventpagina |
| `/event/{slug}/ics/` | agendabestand |

Dit is **exact de vorm die The Events Calendar vandaag gebruikt**, dus
bestaande links en zoekresultaten blijven werken. Oude links dragen
`?owid={odoo_id}` mee; vindt de slug niets, dan valt de plugin op dat id terug
en stuurt hij met een 301 door naar de actuele URL.

Laat het pad op `event` staan. Wijzig je het toch, sla dan de permalinks
opnieuw op (Instellingen → Permalinks).

### Gefaseerd omschakelen

De instelling **Detailpagina's overnemen** staat standaard **uit**. The Events
Calendar bezit `/event/{slug}/` vandaag; zou de plugin dat pad meteen
overnemen, dan geeft elke slug die de Operations Manager niet kent een 404 —
ook events die in WordPress nog wel bestaan.

Daardoor kan je in twee stappen omschakelen:

1. Plugin actief, schakelaar **uit**. De kalender en de lijst komen al uit de
   Operations Manager en linken naar de bestaande pagina's van The Events
   Calendar. Niets breekt.
2. Als alle events in de Operations Manager staan en gepubliceerd zijn:
   schakelaar **aan**, en The Events Calendar deactiveren. De rewrite rules
   worden automatisch doorgespoeld.

## Shortcodes

```
[mymmo_events_calendar]
[mymmo_events_calendar month="2026-09" type="3" format="online"]

[mymmo_events_list]
[mymmo_events_list limit="6" layout="cards" show_past="1"]

[mymmo_event]
[mymmo_event slug="q-and-a-syndicoach"]
```

`type` is het Odoo-id van het event type, `format` is `online`, `onsite` of
`hybrid`. `[mymmo_event]` zonder slug haalt die uit de URL, zodat dezelfde
shortcode op de detailpagina werkt.

De kalender werkt **zonder JavaScript**: de maandnavigatie zijn gewone links
met `?mymmo_month=`. Het JS voegt alleen comfort toe — pijltjestoetsen,
dubbel verzenden blokkeren, focus op de melding na een inschrijving.

## Vormgeving

Alle kleuren en maten staan als custom properties op `.mymmo-ev`. Overschrijf
ze in je thema, dan hoeft deze plugin niet aangepast te worden:

```css
.mymmo-ev {
  --mymmo-ev-accent: #0d9488;
  --mymmo-ev-accent-soft: #99f6e4;
  --mymmo-ev-accent-ink: #0369a1;
  --mymmo-ev-radius: 10px;
}
```

Typografie wordt **geërfd van het thema**. De plugin laadt zelf geen fonts, dus
de koppen blijven in Gelica en de tekst in Rethink Sans staan.

Elke template is overschrijfbaar vanuit het thema. Kopieer het bestand naar
`{jouw-thema}/mymmo-events/` en pas het daar aan:

```
templates/calendar.php
templates/list.php
templates/single.php
templates/registration-form.php
templates/partials/event-card.php
```

## Wat de plugin niet doet

- geen events schrijven of wijzigen; alleen lezen, plus inschrijvingen doorsturen
- geen rechtstreekse verbinding met Odoo of Supabase
- geen eigen accounts of login voor deelnemers
- de sitesleutel komt nooit in de HTML: het formulier post naar
  `admin-post.php` en PHP praat met de API

## Bij problemen

**De kalender is leeg.** Alleen gepubliceerde en afgeronde events zijn
publiek. Staat een event in de Operations Manager op Concept, dan hoort het er
niet te staan. Een event heeft ook een slug nodig.

**Een melding dat de kalender niet ververst is.** De plugin kon de API niet
bereiken en toont de laatst bekende versie. Controleer de API-URL en de
sitesleutel met **Verbinding testen**.

**Een gewijzigd event komt niet door.** De cacheduur staat standaard op 300
seconden. Klik **Cache leegmaken** om het meteen te zien.

**Een 404 op `/event/{slug}/`.** Sla de permalinks opnieuw op.

Zet `WP_DEBUG` aan om de fouten in `debug.log` te zien; alles wordt gelogd met
het voorvoegsel `[mymmo-events]`.

## Bijwerken

Upload de nieuwe zip via Plugins → Nieuwe plugin → Plugin uploaden. WordPress ziet dat de
plugin al bestaat en biedt **Vervang huidige met geüploade** aan. Je instellingen blijven
staan: die zitten in de database, niet in de bestanden.

Ga daarna één keer naar Instellingen → Permalinks en klik Opslaan. Dat is alleen nodig als
je *Detailpagina's overnemen* aan hebt staan, maar het kan nooit kwaad.

## Versies

**1.1.2**
- Opgelost: de kalender bleef leeg door een 503. `format('c')` gaf een `+` in de
  querystring, en daar betekent `+` een spatie; de API kreeg een onleesbare datum. De
  parameters gaan nu als `…Z` de deur uit, en de API negeert een onleesbare grens in
  plaats van te falen.
- Debugmodus: `?mymmo_debug=1` op een pagina met een shortcode toont, alleen voor
  beheerders, welk verzoek er ging, met welke parameters en waar het antwoord vandaan kwam.

**1.1.0**
- Merken: een event hoort bij openvme, syndicoach of beide. Het merk komt uit de
  sitesleutel (`merk:sleutel`), dus een site kan de events van het andere merk niet opvragen.
- Canonical voor gedeelde events, zodat twee sites geen dubbele content opleveren.
- De kalender opent op de eerstvolgende maand met events in plaats van op de huidige maand.
- Diagnosepaneel in de instellingen: wat de API echt teruggeeft, per maand geteld.
- Events zonder slug worden niet meer getoond — die hebben geen pagina.
- Gefaseerd omschakelen: `/event/{slug}/` overnemen is nu een expliciete instelling.

**1.0.0** — eerste versie.
