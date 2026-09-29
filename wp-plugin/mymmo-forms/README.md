# Mymmo Forms

Formulieren worden gebouwd in de **Operations Manager** (Koppelingen → tabblad
Formulier). Deze plugin toont ze op een WordPress-pagina en stuurt de
inzendingen door. Ze bewaart zelf **geen** formulierdefinities en **geen**
inzendingen.

## Waarom zo

Bij de vorige opzet (Forminator) stond het formulier in WordPress en had de
Operations Manager er een kopie van, die verouderde zodra iemand het formulier
aanpaste. Met deze plugin is er nog één bron. Wat hier lokaal staat is enkel
een cache in twee lagen: een korte transient voor de snelheid, plus een
last-known-good in een option als vangnet, zodat het formulier blijft staan als
de API even weg is.

## Instellen

**Instellingen → Mymmo Forms**

| Veld | Wat |
|---|---|
| Operations Manager | De basis-URL, https, zonder pad. Bijvoorbeeld `https://operations.openvme.be` |
| Sitesleutel | Komt uit de Cloudflare-secret `FORMS_PUBLIC_SITE_KEYS`. Blijft serverside en komt nooit in de HTML |
| Cacheduur | Standaard 300 seconden. 0 = niet cachen, enkel om te testen |

Een wijziging in de OM is meteen zichtbaar ook mét cache: het versienummer van
het formulier verandert dan, en de bewaarde versie wordt overgeslagen. De knop
**Cache legen** is er voor het uitzonderlijke geval dat er na een storing een
oude versie blijft hangen.

## Gebruik

Ga naar **Instellingen → Mymmo Forms**. Daar staat een shortcode-bouwer met een
**levend voorbeeld**: het venster staat bovenaan de pagina, open, zoals een
bezoeker het krijgt. De teksten typ je er rechtstreeks in — de kop, de zin
eronder, de opschriften van de tabbladen, de opsomming, de tekst op de knop.
Onderaan staat de shortcode, die meteen meeverandert.

Wat je niet kan typen staat als veld onder het voorbeeld: welk formulier, welke
agenda, de kleur, de afbeelding, en of de shortcode zelf een knop zet. Dat is
met opzet zo verdeeld — dezelfde regel als in de formulierbouwer van de
Operations Manager: **je bewerkt in het voorbeeld, niet in een lijst met velden
ernaast.**

Het voorbeeld is geen nabootsing. De HTML komt van de server, uit exact dezelfde
aanroep die de shortcode op een pagina doet, en ze wordt getoond in een iframe
met precies de stylesheets en het script van de website. Er is dus geen tweede
weergave die kan afdrijven van de echte. Met **Desktop / Telefoon** bovenaan
wissel je van schermbreedte; de telefoonweergave is een echte viewport van
390px, geen verkleinde desktop, dus de mediaquery's van het venster doen daar
precies wat ze op een toestel doen.

Zonder JavaScript is er geen voorbeeld. Dan blijven alle velden gewoon staan en
is de tabel onderaan — met van elk formulier de volledige shortcode — de weg.

### Opstellingen: één keer instellen, overal gebruiken

Wat je in de bouwer maakt, kan je onder een naam **bewaren** als opstelling:
"Offerte — homepage", "Contact — voettekst". Daarna zet je die op zoveel
pagina's als je wil:

```
[mymmo_form_button preset="offerte-homepage"]
[mymmo_form preset="contact-voettekst"]
```

Wijzig je de opstelling later, dan volgt **elke pagina die haar gebruikt**
vanzelf mee. Zonder opstellingen staat elke plaatsing als een lange shortcode in
een pagina, en moet je bij een wijziging elke pagina langs waar die staat — en je
weet niet welke dat zijn.

Wat je in de shortcode zélf typt, wint van de opstelling. Eén pagina met een
andere knoptekst vraagt dus geen tweede opstelling:

```
[mymmo_form_button preset="offerte-homepage" label="Vraag je gratis offerte"]
```

Een opstelling bevat alleen hoe **deze site** dat formulier toont — knoptekst,
agenda, kleur, zijkolom. De velden, labels, talen en bedanktekst blijven in de
Operations Manager staan. Dezelfde scheiding als in de rest van deze plugin: één
bron voor het formulier, en daarnaast wat bij de plaatsing hoort.

Met **Laden** zet je een bewaarde opstelling terug in de bouwer om ze aan te
passen. Bewaren onder dezelfde naam werkt haar bij; geef je een andere naam, dan
komt er een nieuwe bij en blijft de oude staan zoals ze was.

### Het blok "Mymmo formulier"

In de blok-editor voeg je het blok **Mymmo formulier** in en kies je in de
zijbalk welke opstelling er moet staan. Het blok toont meteen het echte
resultaat — het vraagt de server om dezelfde HTML die op de pagina komt, dus
geen nabootsing in de editor.

Het blok kent één keuze: welke opstelling. Bewust — de teksten en kleuren zet je
in de bouwer, waar het voorbeeld staat. Ze hier nóg eens als velden in de
zijbalk zetten zou betekenen dat dezelfde instelling op twee plekken staat en je
bij een wijziging moet raden welke van de twee gold.

Er staat **geen HTML van het blok in de pagina-inhoud** — alleen welke opstelling
gekozen is. Daardoor kan een opstelling nooit vastroesten in een oude pagina, en
bestaat er geen blokvalidatiefout als de opmaak van het venster wijzigt.

In Elementor, een sjabloon van je thema of een widget gebruik je de shortcode
met `preset="..."`; dat werkt daar precies hetzelfde.

Handmatig kan ook:

```
[mymmo_form slug="offerte-technisch-beheer"]
[mymmo_form slug="offerte-technisch-beheer" title="no"]
[mymmo_form slug="offerte-technisch-beheer" lang="fr"]
```

`title="no"` laat de titel van het formulier weg, voor als de pagina er zelf al
een heeft.

`lang` zet de taal vast. Laat je het weg, dan volgt het formulier de taal van de
pagina (WPML of Polylang als die er staan, anders de WordPress-locale) en anders
de standaardtaal van het formulier. Je hebt het dus alleen nodig als je een
formulier in een ANDERE taal wil dan de pagina.

Alleen **gepubliceerde** formulieren staan in de lijst. Een concept verschijnt er
niet, en toont op de website ook niets — dat zou anders een valstrik zijn: een
shortcode die je netjes kopieert en die vervolgens niets doet.

Staat het formulier in de OM nog op **concept**, dan toont de shortcode niets
(en voor een ingelogde beheerder de reden). Zo kan een half afgewerkt formulier
nooit per ongeluk live staan.

### Een knop met een venster

Soms hoort een formulier niet middenin de tekst te staan, maar achter een knop —
en wil je daarnaast de bezoeker de keuze geven om meteen een gesprek in te
plannen. Daarvoor is er een tweede shortcode:

```
[mymmo_form_button slug="offerte-technisch-beheer"
                   label="Vraag een offerte"
                   calendly="https://calendly.com/mymmo/kennismaking"]
```

Dat geeft een knop; een klik opent een venster met bovenaan de **titel over de
volle breedte**, daaronder links een **zijkolom** — wat je te wachten staat, de
keuze tussen formulier en agenda, een opsomming, een afbeelding — en rechts de
inhoud in een **eigen wit kaartje**. De zijkolom staat op dezelfde achtergrond
als dat kaartje; er loopt geen scheidingslijn tussen de twee. De verzendknop
staat rechtsonder, aan het einde van het formulier.

Op een telefoon klapt de zijkolom samen tot een kopbalk met dezelfde twee keuzes
naast elkaar en wordt het venster een vol scherm; de afbeelding en de opsomming
vallen daar weg, want daar is elke pixel voor het formulier zelf. Escape of een
klik naast het venster sluit het.

```
[mymmo_form_button slug="offerte-technisch-beheer"
                   label="Vraag een offerte"
                   calendly="https://calendly.com/mymmo/kennismaking"
                   intro="Laat je gegevens achter en we bellen je terug."
                   points="Antwoord binnen 1 werkdag|Volledig vrijblijvend"
                   image="https://link.openvme.be/assets/uploads/persoon.svg"
                   tab_form_sub="Laat je gegevens achter"
                   tab_calendly_sub="Kies zelf een moment"]
```

Laat je `intro`, `points`, `image` én `calendly` allemaal weg, dan is er niets
voor een zijkolom te doen en wordt het gewoon een venster met een kopbalk erboven
— een leeg gekleurd vlak naast een formulier van vier velden ziet eruit als een
fout.

| Attribuut | Wat |
|---|---|
| `slug` | Welk formulier. Verplicht |
| `label` | De tekst op de knop. Leeg = de naam van het formulier |
| `calendly` | De Calendly-pagina voor het tweede tabblad. **Laat je dit weg, dan is er geen tweede tabblad** en toont het venster enkel het formulier |
| `title` | De kop bovenaan het venster. Leeg = de naam van het formulier, `no` = geen kop |
| `intro` | De zin onder de titel, in de zijkolom. Leeg = de omschrijving van het formulier uit de OM, `no` = niets |
| `points` | De opsomming in de zijkolom, gescheiden met een `\|`. Maximaal zes |
| `image` | Afbeelding onderaan de zijkolom |
| `image_alt` | De beschrijving daarvan. Laat leeg als het sfeerbeeld is |
| `tab_form` / `tab_calendly` | De opschriften van de tabbladen |
| `tab_form_sub` / `tab_calendly_sub` | Het regeltje eronder |
| `tab` | `calendly` om meteen op de agenda te openen |
| `variant` | `primary` (gevuld, standaard) of `outline` (omlijnd) |
| `accent` | De kleur van de knoppen **hier**. Leeg = de accentkleur van het formulier uit de OM |
| `accent_text` | De tekstkleur op die knoppen (standaard wit) |
| `button` | `no` rendert geen eigen knop — zie hieronder |
| `trigger` | CSS-selector van bestaande knoppen die het venster openen |
| `class` | Eigen klassen op de wikkel, om de knop te plaatsen |
| `close` | Het opschrift van de sluitknop, voor schermlezers |
| `background` | De kleur van het vlak achter het formulier. Leeg = een lichte tint van de accentkleur |
| `icon_color` | De kleur van de vinkjes en de iconen in de tabbladen |
| `accent_text` | De tekstkleur op de knoppen (standaard wit) |
| `image_calendly` / `image_calendly_alt` | De tekening voor het tabblad agenda |
| `image_scale` / `image_x` / `image_y` | Schaal en verschuiving van de eerste tekening |
| `image_calendly_scale` / `_x` / `_y` | Idem voor de tweede. Leeg = dezelfde stand als de eerste |
| `watermark` | Een swoosh of krul áchter de tekening, verankerd linksonder |
| `watermark_scale` / `watermark_x` / `watermark_y` / `watermark_rotate` | Schaal, verschuiving en draaiing daarvan |
| `thanks_calendly` | De tekst in het venster nadat iemand een gesprek boekte |
| `goal_form` / `goal_calendly` | Het pad dat als conversie gemeld wordt — zie hieronder |
| `preset` | Een bewaarde opstelling als basis |
| `lang` | Zoals bij `[mymmo_form]` |

De opschriften staan in de shortcode en niet in de Operations Manager, want ze
horen bij DEZE knop op DEZE pagina en niet bij het formulier. Op een Franstalige
pagina typ je ze dus mee.

#### De kleur van de knop

De knop, de verzendknop in het venster en de gemarkeerde keuze volgen alle drie
dezelfde **accentkleur**. Die komt uit vier plekken, van zwak naar sterk:

| | Waar | Geldt voor |
|---|---|---|
| 1 | de standaard in de stylesheet | alles waar niets anders is gezet |
| 2 | **Operations Manager** → Koppelingen → Formulier → Stijl | elke site waar dat formulier staat |
| 3 | **het thema van deze site** | alles op deze site |
| 4 | `accent="#…"` op een shortcode | die ene plaatsing |

Nummer 3 is de gewone gang van zaken: de plugin leest de knopkleur uit het thema
van je site (Weergave → Ontwerp → Stijlen → Kleuren → Knop) en neemt die over,
zodat een formulierknop niet in een andere kleur naast de knoppen van je site
staat. Dat gebeurt automatisch; bij **Instellingen → Mymmo Forms → Verbinding**
staat wat er gevonden is, en een vinkje om het uit te zetten.

Alleen de **knop** wordt overgenomen: achtergrond, tekstkleur en hoeken. Bewust
niet de tekst- en achtergrondkleuren van de site — bij een donker thema levert
dat witte labels op witte invoervelden op, en dat merkt niemand aan onze kant.
Verwijzingen naar het palet (`var:preset|color|accent-1`) worden opgezocht en
als echte kleur doorgegeven: die variabele bestaat niet in het voorbeeld van de
bouwer, en dan zou de kleur daar stil wegvallen. Declareert je thema geen
knopkleur (een klassiek thema zonder `theme.json`), dan verandert er niets en
blijft de kleur uit de Operations Manager gelden.

Staat deze ene knop tussen knoppen van een andere kleur, dan zet je
`accent="#1d4ed8"` op de shortcode — dat geldt alleen voor dié plaatsing.
Alleen een hex of een `rgb()` komt erdoor; al de rest wordt genegeerd, want deze
waarde belandt in een `style`-attribuut op de pagina van een bezoeker. De
kalender van Calendly krijgt dezelfde kleur mee (`primary_color`), zodat die
niet het enige stuk in het venster is met een andere tint.

#### Aan een knop hangen die er al staat

Heb je al een knop in je thema, in Elementor of in een blok, dan hoef je die niet
te vervangen. Zet `button="no"` op de shortcode — ze rendert dan enkel het
venster, zonder eigen knop, en neemt geen plaats in. Zet de shortcode ergens op
de pagina (onderaan is prima) en zet de **link** van je bestaande knop op het id
van het venster:

```
[mymmo_form_button slug="offerte-technisch-beheer" button="no"
                   calendly="https://calendly.com/mymmo/kennismaking"]
```

De knop krijgt dan als link `#mymmo-modal-offerte-technisch-beheer` — dat id
staat ook in de shortcode-bouwer bij Instellingen, en anders in een HTML-
commentaar op de pagina zelf. Dit is de manier die de voorkeur heeft: ze werkt
ook als JavaScript niet laadt, want het venster opent dan via `:target`.

Kan je die link niet zetten, dan is er `trigger="..."` met een CSS-selector:

```
[mymmo_form_button slug="offerte-technisch-beheer" button="no"
                   trigger=".hero .elementor-button"]
```

Elke knop die daarop past opent het venster. Let op dat de selector niet
toevallig ook andere knoppen raakt — en dit is het enige stuk dat JavaScript
écht nodig heeft.

**Zonder JavaScript werkt dit ook.** De knop is een echte link naar het venster,
het venster staat gewoon in de pagina (het opent via `:target`), en de twee delen
staan dan onder elkaar met elk een eigen kopje in plaats van als tabbladen.
Alleen de agenda heeft JavaScript nodig — dat is een iframe van Calendly — en
daar staat een gewone link naar dezelfde agenda als terugval. Het script van
Calendly wordt opgehaald zodra iemand met de muis op de knop komt (of hem met het
toetsenbord bereikt), en de kalender wordt opgebouwd op het moment dat het
venster opengaat. Wie op "Plan een gesprek" klikt, kijkt dus naar een kalender
die er al staat. Bewust niet bij het laden van de pagina: dan zou elke bezoeker
een verzoek naar een derde partij sturen, ook wie nooit klikt.

Wie vanuit het venster verstuurt, komt terug op dezelfde pagina **met het venster
weer open** en de bevestiging erin. De pagina waar de bezoeker stond gaat mee in
de inzending (`page_url`, `page_title`), net als bij een formulier in de tekst.

### Ingangen: de manieren waarop een venster opengaat

Een **opstelling** is het venster: welk formulier, welke tabbladen, welke agenda,
welke dankjewelschermen. Die maak je één keer.

Een **ingang** is een manier om dat venster te openen. Je kan er zoveel maken als
je wil, van drie soorten. Je beheert ze bij **Instellingen → Mymmo Forms →
Ingangen**; elke ingang krijgt daar zijn eigen shortcode:

```
[mymmo_form_entry id="hero-knop"]
```

| Soort | Wat het doet |
|---|---|
| **Knop** | Een knop met een eigen opschrift, vorm en kleur. Twee knoppen met andere copy die hetzelfde venster openen is doodgewoon. |
| **Klasse** | Een CSS-klasse die je op iets zet dat er al staat: een knop van je thema, een afbeelding, een icoon. Zet de shortcode één keer op diezelfde pagina — ze toont niets, maar zonder haar staat het venster er niet. |
| **Callout** | Een blok in de pagina dat één onderdeel van het venster al toont. |

Ze kunnen allemaal tegelijk op één pagina staan, en allemaal naar hetzelfde
venster wijzen. Wijzig je dat venster, dan verandert het overal mee.

#### De callout

Een callout toont een **stap**, het **formulier** of de **agenda** uit het
venster al in de pagina. De bezoeker beantwoordt het daar; klikt hij op de knop,
dan gaat het venster open op precies dat onderdeel, met wat hij invulde.

Licht je een STAP uit, dan komt die ook vooraan in het venster te staan — de
andere stappen schuiven erachter aan, in hun eigen volgorde. Zo kan je op twee
pagina's twee callouts zetten die elk met een andere vraag beginnen en toch
hetzelfde venster openen. Komt er later een stap bij, dan maak je er een callout
voor bij; aan het venster verandert niets.

**Er wordt niets weggelaten.** Wat een stap meebrengt — de tekening van het gebouw
bij de schuifbalk — staat er volledig. Dat is de ervaring waarvoor een callout
bestaat.

**Twee indelingen, en er is geen derde:**

- **Twee kolommen.** De ene kolom draagt het uitgelichte onderdeel met de knop
  eronder, de andere de titel, de tekst en een afbeelding — het deel dat een
  marketeer opmaakt.
- **Volle breedte.** Titel en tekst bovenaan, het uitgelichte onderdeel eronder
  over de hele breedte, met de knop rechtsonder. Voor iets dat plaats vraagt:
  dertien keien passen niet in een halve callout. Staat er een afbeelding, dan
  komt die naast de titel.

**Een stap of het formulier VERHUIST, het wordt niet gekopieerd.** Het kaartje in
de pagina en het onderdeel in het venster zijn hetzelfde element: bij het openen
schuift het erin, bij het sluiten komt het terug. Een kopie zou de waarde kunnen
overdragen maar niet de stand van de bediening — een schuifbalk nog wel, een
vinkje dat een stap in zijn eigen script bijhoudt niet.

**De agenda verhuist niet.** Een iframe dat je verplaatst laadt opnieuw; het
kaartje krijgt dus zijn eigen kalender. Er is ook niets over te dragen zolang er
geen uur gekozen is.

**Geen schuifbalken.** Het kaartje heeft nergens een vaste hoogte en nergens een
`overflow`; het groeit mee met wat erin staat. Past een stap niet in twee
kolommen, kies dan de volle breedte. Past hij in het VENSTER niet, zet dan
**Ruimer venster** aan bij de opstelling.

**Zonder JavaScript** verhuist er niets: de stappen vallen weg en de knop is een
gewone link naar het venster, zoals overal.

## Stappen: een formulier in meerdere schermen

Een formulier kan voorafgegaan worden door **stappen**: eigen stukken HTML met
CSS en JavaScript, die elk een of enkele waarden verzamelen. Die waarden komen
terecht in de **verborgen velden** van het formulier uit de Operations Manager,
en het formulier zelf is de laatste stap. Bij het versturen gaat alles in
dezelfde POST — er is geen tweede verzendpad en niets wordt tussentijds
bewaard.

```
[mymmo_form slug="offerte" steps="gebouwgrootte,wat-speelt-er"]
[mymmo_form_button slug="offerte" steps="gebouwgrootte" label="Bereken je formule"]
```

Met het tweede loopt de reeks in de pop-up, op het tabblad "Formulier". De
agenda ernaast blijft gewoon wat ze was.

Je schrijft en bewaart de stappen bij **Instellingen → Mymmo Forms → Stappen**.
Daar staat ook een voorbeeldstap (een schuifbalk met een meegroeiende skyline)
die je met één knop in de editor zet.

### Waarom de HTML hier staat en niet in de Operations Manager

De OM serveert hetzelfde formulier aan meerdere sites. Daarom gaat het
`theme`-veld daar door een gesloten lijst: vrije CSS vanuit de OM zou een
injectiepad zijn naar elke site die het formulier toont. Vrije JavaScript is dat
in nog sterkere mate. Die vrijheid hoort dus thuis waar ze al bestaat: in
WordPress, bij iemand met `unfiltered_html` — hetzelfde recht dat WordPress
vraagt voor een Custom HTML-blok. Het **formulier** blijft in de OM; een stap
kent alleen de sleutel van het verborgen veld dat hij vult.

### Wat een stap kan

Zonder een regel JavaScript:

```html
<input type="range" min="1" max="50" data-mymmo-waarde="aantal_gebouwen">
```

De reeks leest die waarde mee en zet ze in het verborgen veld met dezelfde naam.

Voor een stap die iets anders is dan een invoerveld:

```html
<script>
MymmoStappen.stap(document.currentScript, function (api) {
  api.zet('aantal_gebouwen', 12);     // waarde afleveren
  api.lees('aantal_gebouwen');        // ook waarden uit eerdere stappen
  api.geldig(true);                   // zelf beslissen of "Volgende" mag
  api.volgende();                     // zelf doorgaan (nodig bij navigatie "zelf")
  api.bij('tonen', function () {});   // de stap komt in beeld — hier meet je
});
</script>
```

`api.el` is jouw stap; zoek daarbinnen met `api.el.querySelector(...)` en
gebruik **geen** `id=""`. Dezelfde stap kan twee keer op een pagina staan (in de
tekst én in een pop-up), en met vaste id's zou de tweede de eerste besturen.

Een stap staat bij het laden van de pagina op `hidden`, dus meten kan daar niet
— dat doe je in `api.bij('tonen', …)`. Gebruik voor je kleuren
`var(--mf-accent)`, `var(--mf-text)`, `var(--mf-muted)` en `var(--mf-border)`,
dan volgt je stap automatisch het thema van het formulier en van de site.

### Waar je op moet letten

**Het verborgen veld moet in de Operations Manager bestaan.** Bestaat het niet,
dan komt de waarde nergens aan. De reeks meldt dat in de console van de browser
en een beheerder ziet het boven het formulier staan; de bezoeker wordt
*niet* geblokkeerd — een ontbrekend veld is een beheerdersprobleem, geen
doodlopende straat.

**Zonder JavaScript vallen alle HTML-stappen weg** en ziet de bezoeker meteen
het formulier, met lege verborgen velden. Dat is de eerlijke terugval: stap 1
tonen waar je nooit voorbij komt, is erger. Maak van zo'n veld dus nooit een
verplicht veld in de OM.

**Na een mislukte inzending begint de bezoeker bij het formulier**, niet weer
vooraan. Zijn antwoorden staan dan nog in de verborgen velden, en hem opnieuw
door de schuifbalken sturen is het laatste wat hij wil.

**Van elke stap wordt één vorige versie bewaard.** Code kan stuk; de knop
"Vorige versie terugzetten" staat naast de editor en draait de wissel om, dus
je kan ook weer vooruit.

## Conversie meten zonder bedankpagina

Een bedankpagina is een echte URL, dus een pageview, dus een doel in Google
Analytics. In een pop-up gebeurt er geen paginawissel — niet na het versturen van
het formulier, en niet na het boeken van een gesprek. Er valt dan niets te meten
tenzij de plugin het zelf zegt, en dat doet ze:

| Wanneer | Gebeurtenis |
|---|---|
| Formulier verstuurd | `mymmo_formulier_verstuurd` |
| Gesprek geboekt in Calendly | `mymmo_calendly_geboekt` |

Ze worden op twee manieren afgevuurd:

```js
// 1. in de dataLayer, voor Google Tag Manager
window.dataLayer.push({
  event:        'mymmo_calendly_geboekt',
  mymmo_soort:  'calendly_geboekt',
  mymmo_doel:   '/bedankt/gesprek',   // uit goal_calendly
  page_path:    '/bedankt/gesprek'    // idem, voor een virtuele pageview
});

// 2. als gewone gebeurtenis op document, voor wie geen GTM heeft
document.addEventListener('mymmo:calendly_geboekt', function (e) { … e.detail … });
```

Zet met `goal_form` en `goal_calendly` het **pad** dat vroeger je bedankpagina
was. Er wordt niet naartoe genavigeerd; het reist mee in `page_path`, zodat je in
GTM een **virtuele pageview** kan afvuren en hetzelfde doel in GA blijft werken —
zonder dat de bezoeker je site verlaat. Laat je ze leeg, dan wordt de gebeurtenis
nog steeds afgevuurd, alleen zonder pad.

Bij een geboekt gesprek toont het venster **onze eigen bedanktekst**
(`thanks_calendly`) in plaats van de bevestigingspagina van Calendly. De bezoeker
blijft dus op je site. Dat werkt doordat de widget van Calendly een bericht naar
de pagina stuurt zodra de afspraak rond is; de plugin luistert daarnaar
(`calendly.event_scheduled`) en controleert daarbij de herkomst van dat bericht.

**Let op bij het uitrollen:** zolang je GA-doel op de URL van de bedankpagina
staat, telt het niets meer zodra het formulier in de pop-up staat. Zet eerst de
tag in GTM klaar, dan pas de pop-up live.

## Hoe een inzending loopt

```
bezoeker → POST admin-post.php (deze plugin, PHP)
         → POST {OM}/forminator-v2/public/v1/forms/{slug}/submit
         → Koppelingen-pipeline → Odoo
```

De browser praat nooit rechtstreeks met de Operations Manager. Dat is met opzet:
anders zou de sitesleutel in de HTML moeten staan.

Bevestigingsmails verstuurt deze plugin **niet**. Dat doet de `send_mail`-stap
in de koppeling — daar staat de editor, en daar staan ook de statistieken over
afgeleverd/geopend/geklikt.

## Herkomst en de bezoeker-UUID

Bij elke inzending gaat automatisch mee, zonder dat je er een veld voor moet
maken:

| Veld in de koppeling | Waar het vandaan komt |
|---|---|
| `meta_ovme_uuid` | de cookie `ovme_uuid` van het tracking-script |
| `meta_ovme_ref_uuid` | de cookie `ovme_ref_uuid` (bezoeker kwam van de andere site) |
| `meta_utm_source` … `meta_utm_content` | de URL van de pagina, anders de UTM-cookie |
| `meta_site` | de sitesleutel — de site kan hier niet over liegen |
| `meta_page_url`, `meta_page_title`, `meta_referrer`, `meta_submitted_at` | de pagina zelf |
| `meta_form_slug`, `meta_form_id` | het formulier, uit de OM (opvolger van `ovme_forminator_id`) |

Die eerste is de belangrijkste: `ovme_uuid` verbindt een inzending met alles wat
het tracking-script van die bezoeker weet — paginaweergaves, scrolldiepte,
kliks. Map hem in de koppeling naar het juiste Odoo-veld, anders staat een lead
los van zijn eigen voorgeschiedenis.

**Er is hiervoor GEEN JavaScript nodig.** Bij Forminator werd de UUID met een
scriptje als verborgen veld in het formulier geïnjecteerd; deze plugin leest de
cookie server-side bij het verwerken van de inzending. Dat werkt ook zonder
JavaScript, en het kan niet stukgaan op een gecachete pagina waarin de UUID van
de vorige bezoeker gebakken zou zitten.

De UUID kan leeg zijn, en dat is normaal: het tracking-script zet geen cookie
voor wie het als bot herkent, en ook niet in een browser zonder plugins of
taalinstelling. Daar zitten echte mensen tussen. Maak er dus nooit een verplicht
veld van.

### Safari en de cookie (1.18.5)

Safari houdt een cookie die door JavaScript gezet is hoogstens 7 dagen bij, ook
als er twee jaar op staat. Wie na een week terugkomt, is daar een nieuwe
bezoeker. De route `POST /wp-json/mymmo-forms/v1/bezoeker` (`class-visitor-cookie.php`)
zet dezelfde `ovme_uuid` opnieuw vanuit PHP; een cookie van de server valt niet
onder die grens. Het tracking-script (`/t.js` van de website-tracker) roept de
route hoogstens één keer per dag aan. Ze verzint geen UUID: ze zet enkel de
waarde opnieuw die de browser al had. Bewust een REST-route en niet bij het
renderen van een pagina: een gecachete pagina stuurt geen `Set-Cookie` mee.

## Antispam

Vier lagen, geen captcha:

1. honeypot — een veld dat een mens niet ziet en een bot invult;
2. minimale invultijd — sneller dan 3 seconden is geen mens. Het tijdstip is
   ondertekend met `wp_hash()`, dus een bot kan het niet terugzetten;
3. WordPress-nonce — vangt cross-site posts;
4. rate limit in de Worker, per sitesleutel.

Blijkt dit niet te volstaan, dan is Cloudflare Turnstile de volgende stap. Een
captcha kost inzendingen en staat er daarom bewust niet in.

## Vormgeving

Alles hangt aan CSS-variabelen op `.mymmo-form-wrap`, en er staat nergens
`!important`. Een thema kan dus winnen door dezelfde variabelen te zetten:

```css
.mymmo-form-wrap {
  --mf-accent: #0f766e;
  --mf-radius: 4px;
  --mf-max-width: 640px;
}
```

Per formulier kan de OM een paar van die variabelen meesturen (het `theme`-veld
in het schema). Alleen een gesloten lijst wordt doorgelaten, en enkel waarden
die eruitzien als een kleur of een lengte — vrije CSS vanuit de OM zou een
injectiepad zijn naar elke site die het formulier toont.

## Versies

**1.18.4** — de labels van de stappen gaan mee bij een inzending. Een stap zet de
WAARDE van een keuze in het verborgen veld (`lift,water_verwarming`), en dat
blijft zo: die sleutel ligt vast en een koppeling rekent erop. Maar wat de
bezoeker aanklikte ("Water en verwarming") stond enkel in de HTML van de stap,
dus in de notitie en de offerte in Odoo stonden de sleutels, met liggende
streepjes en zonder spatie na de komma. `Mymmo_Forms_Steps::waarde_labels()`
leest nu per `data-waarde` het label uit de stap (met de copy uit de bouwer
toegepast) en de inzending stuurt dat mee als `value_labels`. De OM gebruikt
die labels enkel voor tekst, nooit voor een Odoo-veld.

**1.18.3** — het venster van een afspraaklink sluit niet meer bij een klik
ernaast. Die persoonlijke agenda kwam uit een link in een mail; wie per ongeluk
naast het venster klikte, was ze kwijt en kon ze niet zelf terug openen. Sluiten
gaat nu met het kruisje (of Escape). Het gewone venster met de tabbladen sluit
wel nog bij wegklikken: dat opent de bezoeker gewoon opnieuw met de knop.

**1.18.2** — een afspraaklink opent een eigen venster, met de copy van die link.

- Waarom: `?afspraak=` opende het venster van de opstelling met al zijn
  tabbladen (formulier + agenda) en de copy van dat formulier. Wie een
  persoonlijke link krijgt, komt voor één ding: een gesprek met die persoon.
  De titel van de link (`tab_title`) kwam bovendien enkel op het tabbladknopje
  terecht, en met één tabblad wordt dat niet getekend.
- Nu: ENKEL het agendatabblad (`Mymmo_Forms_Shortcodes::render_agenda()`, geen
  shortcode). De kop krijgt de foto van de collega (zijn avatar in Odoo) en de
  titel van de link; de zijkolom de subtekst en de vinkjes die bij de link in de
  OM staan. Een lege subtekst wordt de omschrijving van het afspraaktype in
  Calendly; is die ook leeg, dan blijft de tekst van de opstelling. Met een
  foto valt de tekening van de opstelling weg.
- De server schrijft die plekken leeg en verborgen uit; `mymmo-forms-booking.js`
  vult ze. Zo blijft de pagina voor iedereen gelijk (paginacache, zie 1.18.1).
- De inleiding van het FORMULIER staat niet meer naast de agenda, tenzij de
  opstelling een eigen `intro` heeft.
- Op een telefoon blijft de kop (foto + titel) staan, anders dan bij een gewoon
  venster: daar zie je met wie je afspreekt.
- Vraagt de Worker-deploy met migratie `20260924150000_booking_links_copy.sql`.
  Een oudere Worker stuurt die velden niet mee; dan opent het venster gewoon
  met de copy van de opstelling.

**1.18.1** — afspraaklinks zijn veilig met een paginacache.

- Waarom: in 1.18.0 zette de SERVER de persoonlijke agenda in de pagina. Een
  paginacache die de query negeert, bewaart dan `/?afspraak=rob-demo` als `/`
  -- en daarna opent de homepage voor iedereen Robs agenda. De site heeft zo'n
  cache en die moet blijven.
- Nu hangt de HTML niet meer af van de URL: op elke pagina staat hetzelfde
  dichte venster van de opstelling, met de ALGEMENE agenda.
  `assets/js/mymmo-forms-booking.js` leest `?afspraak=`, vraagt de agenda op bij
  de nieuwe REST-route `/wp-json/mymmo-forms/v1/afspraak/<sleutel>` (sleutel in
  het PAD, dus een gecachet antwoord hoort altijd bij die sleutel), zet ze in het
  venster en opent het. Het verwisselen gebeurt vóór het openen, want de
  kalender wordt pas bij het openen opgebouwd.
- Geen antwoord binnen vier seconden, of onbekende sleutel: het venster opent
  met de algemene agenda.
- De opstelling voor afspraaklinks MOET een Calendly-link hebben; anders is er
  geen tabblad om een agenda in te zetten (melding in de console voor beheerders).
- Gevolg om te kennen: het venster staat nu op elke pagina in de HTML, ook voor
  wie geen `?afspraak=` heeft. Het blijft dicht en laadt niets van Calendly tot
  iemand het opent (enkel de verbinding wordt vooraf geopend, zoals bij elk
  venster met een agenda).

**1.18.0** — afspraaklinks: `?afspraak=<sleutel>` op elke pagina opent het
venster meteen op "Plan een gesprek", met de agenda van die collega.

- Waarom: een collega wil een link kunnen sturen ("maak een afspraak hier")
  die op ONZE site opent, met het venster en ons formulier één tabblad verder,
  in plaats van een kale Calendly-pagina. En een koppeling moet in een mail de
  agenda van de eigenaar van de lead kunnen zetten.
- De sleutel wordt server-side opgezocht bij de Operations Manager
  (`/forminator-v2/public/v1/booking-links/<sleutel>`, zelfde sitesleutel,
  120s bewaard). In de URL staat nooit een Calendly-link: dan kan iedereen op
  onze site de agenda van een vreemde tonen. Wat terugkomt moet met
  `https://calendly.com/` beginnen, anders wordt het genegeerd.
- Welk venster het wordt: nieuwe instelling "Afspraaklinks" op het tabblad
  Verbinding (een opstelling). Alles behalve de agenda komt uit die opstelling.
  Staat ze uit, dan doet `?afspraak=` niets (beheerders krijgen een melding in
  de console).
- Onbekend, gepauzeerd, `algemeen`, of de OM onbereikbaar: de agenda van de
  opstelling zelf. Wie op "maak een afspraak" klikte, kan altijd iets boeken.
- Nieuw shortcode-attribuut `open="yes"`: het venster opent bij het laden.
- Het venster wordt in `wp_footer` gerenderd (prioriteit 5) via
  `render_button()`, dus exact hetzelfde venster als een `[mymmo_form_button]`
  met die opstelling. Een paginacache mag URL's met `?afspraak=` niet cachen.

**1.17.29** — geen dubbele "verzonden" meer. Tijdens het versturen staat er
enkel de vlieger met "We maken je offerte op..." (geanimeerde puntjes, geen
spinner); na een geslaagde inzending gaat het METEEN naar het dankjewelscherm.
De tussenmelding "Verzonden. Kijk meteen in je mailbox!" en de sleutel
`sent_mailbox` zijn weg -- die stond er samen met het dankjewelscherm twee keer.

**1.17.28** — de wachtmelding staat op een vol wit vlak met afgeronde hoeken
(`#ffffff`, radius 16px), niet meer op `--mf-bg`. Het formulier eronder blijft
onzichtbaar tijdens het versturen, zoals in 1.17.27.

**1.17.27** — de wachtmelding in de pop-up dekt het formulier echt af.

- Tijdens het versturen schemerde de formuliertekst door de melding heen: het
  overlay was 85% dekkend op `--mf-bg`, en die staat in de pop-up vaak op
  transparant, dus dan dekte het niets. De inhoud van de wikkel krijgt nu
  `visibility: hidden` (klasse `mymmo-form-wrap--bezig`); het venster houdt zijn
  hoogte en springt niet in elkaar.
- Nieuwe copy: "Wij maken meteen je offerte" met geanimeerde puntjes, en na een
  geslaagde inzending 2,6 s "Verzonden. Kijk meteen in je mailbox!" met de
  vlieger (`thingies_vlieger.svg`), daarna het dankjewelscherm van het tabblad.
  De teksten staan als `busy` / `sent_mailbox` in MESSAGES (OM), met een
  terugval in de JS zolang de Worker ze nog niet meestuurt.

**1.17.26** — één venster per trigger, en ook knoppen die later verschijnen.

- Staan er meerdere vensters met dezelfde `trigger`, dan blijft bij het laden
  het eerste over en verdwijnt de rest. Nodig voor Mymmo Componenten 1.7.1, dat
  het venster bij elke knop meeschrijft omdat de server niet kan weten welke
  render op de pagina belandt.
- Een element met de trigger-klasse dat pas NA het laden in de pagina kwam
  (een menu dat voor mobiel opnieuw opgebouwd wordt, een blok dat later
  inlaadt), opent het venster nu ook: bij de klik wordt opnieuw gekeken.

**1.17.25** — het venster ligt altijd boven de hele pagina.

- Stond de knop in een blok van het thema met een transform, filter,
  `contain` of een eigen `z-index` (een kaart, een geanimeerde groep, een
  sectie), dan zat het venster in dat blok gevangen: de grijze laag bedekte
  enkel dat blok en de footer schoof eroverheen. `position: fixed` en een hoge
  `z-index` helpen daar niet -- een stapelcontext kan je van binnenuit niet
  verlaten.
- Het venster hangt nu zolang het openstaat rechtstreeks onder `<body>` en gaat
  na het sluiten terug naar zijn plek. De taal en de CSS-variabelen van het
  thema die het van de wikkel erfde, gaan mee.
- De stappenreeks van een callout luistert daarvoor ook op het venster zelf;
  anders zouden "Volgende" en de velden in het verhuisde venster niets meer
  doen.

**1.17.24** — kaal houdt het witte vak.

- Het vak rond het uitgelichte onderdeel (wit, dunne rand, hoeken, schaduw,
  opvulling) hoort bij het ONDERDEEL en niet bij de chrome van de callout: het
  is wat de bediening laat opvallen op een gekleurd vlak. In 1.17.23 viel het
  weg samen met de titel en de achtergrond, en dan zweeft een formulier los op
  de kaartkleur — tekst met een knop eronder in plaats van een bediening.
  `chrome="no"` houdt het vak nu. Het is exact hetzelfde element als in de
  callout (`.mymmo-callout-uitgelicht`), dus er is geen tweede opmaak die uit de
  pas kan lopen.
- Wie het écht zonder wil — een ingang die al op een wit vlak staat, want twee
  witte vlakken op elkaar leest als een fout — zet `chrome="bare"`, of in het
  blok "Mymmo ingang" de schakelaar **Met wit vak** uit.
- Een blok dat vóór deze versie op "kaal" stond, krijgt het vak vanzelf: het
  attribuut ontbreekt daar en de standaard is AAN.

**1.17.23** — een ingang kan KAAL, zodat ze in een kaart past.

- **`chrome="no"`, en het nieuwe blok "Mymmo ingang".** Kaal betekent: enkel het
  uitgelichte onderdeel (het formulier of een stap) plus de knop. Geen kaartje,
  geen titel, geen tekst, geen achtergrond, geen eigen opvulling en geen
  uitbraak uit de inhoudskolom.
  Waarvoor: een ingang die IN iets staat dat zelf al een kaart is — een kaart
  van **Mymmo Cards** bijvoorbeeld. Een callout is namelijk zelf een kaart, met
  haar eigen kop en opvulling. Staat ze tussen kaarten die uit core-blokken
  gebouwd zijn, dan moet elke eigenschap (lettergrootte, dikte, kleur,
  opvulling, hoeken) overgetypt worden om gelijk te lijken — en die waarden
  komen uit het THEMA, dus de plugin kent ze niet. Dat kostte een instelling per
  eigenschap, telkens met een release erbij, zonder dat het ooit helemaal klopte
  (zie 1.17.22 hieronder: die drie velden blijven bestaan voor een callout die
  wél zelf de kaart is).
  Kaal renderen haalt die vergelijking weg: de titel is dan een gewoon kopblok
  van de pagina en heeft dus vanzelf de letter van het thema.
  `chrome` hoort bij de PLAATSING en niet bij de ingang (het staat in
  `SHORTCODE_ATTS`): dezelfde ingang kan op de ene pagina een callout zijn en in
  een kaart op de andere.
- **Het blok "Mymmo ingang"** (naast het bestaande "Mymmo formulier"): kies een
  ingang, zet eventueel "Kaal tonen" aan, klaar. Server-side gerenderd, dus een
  wijziging aan de ingang werkt meteen door op elke pagina waar ze staat.
- **De knop hangt niet langer aan `.mymmo-callout`.** De selectors gingen van
  `.mymmo-callout .mymmo-callout-knop` naar `.mymmo-callout-actie
  .mymmo-callout-knop` — even zwaar (0,2,0), maar werkt in beide standen. Zonder
  dat zou de knop in de kale modus ongestyled staan.
- Het dok en de knop worden nu één keer opgebouwd (in een buffer) en door beide
  standen gebruikt. Twee kopieën zouden uit elkaar lopen zodra iemand er een
  attribuut bij zet — en dan werkt het verhuizen naar het venster nog op de ene
  plek en niet meer op de andere, zonder foutmelding.
- Uitproberen zonder WordPress:
  `php wp-plugin/mymmo-forms-callout-preview.php gebouwgrootte kolommen callout kaal`

**1.17.22** — de titel van een callout mag de letter van de pagina dragen.

- **Drie instellingen erbij bij een callout: grootte, dikte en kleur van de
  titel** (Ingangen → "Letter van de titel"; `--mf-callout-titel-maat`,
  `-dikte`, `-kleur`). Ze bestaan om dezelfde reden als `pad` en `text_pad`:
  staat een callout tussen de kaarten van een pagina, dan hoort haar kop
  dezelfde te zijn als die van die kaarten. Op syndicoach.be zet het thema daar
  30px/400 in `neutral-950` op en de plugin standaard 22–32px/700 — de callout
  was dus de enige met een andere kop, en in een kaartenstapel waar de koppen
  onder elkaar staan valt dat meteen op. Die maten komen uit het THEMA; de
  plugin kent die tokens niet en kan ze dus niet zelf overnemen.
  De dikte gaat door een gesloten lijst (`300`…`900`, `normal`, `bold`) en de
  kleur door dezelfde vormcontrole als overal: deze waarden belanden in een
  style-attribuut op de pagina van een bezoeker.
  Leeg = precies wat er tot nu toe stond, dus deze versie verandert op zichzelf
  aan geen enkele callout iets.
  De REGELHOOGTE heeft bewust geen veld gekregen — ze volgt in de praktijk de
  grootte. Moet ze toch mee, dan is `--mf-callout-titel-lijn` de plek.

**1.17.21** — een eigen kop boven de agenda, en stap 3 leest rustiger.

- **`calendly_title` en `calendly_sub` op de shortcode.** Ze staan in het
  agenda-tabblad boven de kalender, om iemand die een uur moet kiezen op weg te
  helpen. Ze gebruiken dezelfde functie en dezelfde klassen als de kop boven het
  formulier (`mymmo_forms_kop_blok()`, nieuw in helpers.php): er hoort geen
  tweede stijl te bestaan die uit de pas kan lopen — zelfde afweging als bij
  `form_title`. Leeg = geen kop, en er is bewust GEEN standaardtekst: een kop die
  niemand geschreven heeft leest als opvulling en staat dan in elk venster.
  De kop staat BINNEN het paneel en niet in de agenda-div zelf: die wordt door
  mymmo-forms-modal.js leeggemaakt en met het iframe gevuld, dus een kop daarin
  zou verdwijnen zodra de kalender laadt.
  Ook in de shortcode-bouwer, onder "Boven de agenda", en alleen uitgeschreven
  als er ook een agenda is.
- **Stap 3 (`waarom-syndicoach`) leest rustiger.** De tekst van een vakje is een
  ZIN, geen label: op gewicht 500 stonden er tien halfvette regels onder elkaar
  en las het scherm als een opsomming van koppen. Nu 400, gekozen 500 in plaats
  van 600 (de KLEUR doet daar het werk), en een tik kleiner (.9rem, mobiel
  .85rem) zodat de langere zinnen op één regel blijven.

**1.17.20** — de kalenderblaadjes waren volledig verdwenen; dat is een aparte
bug die niets met de hertekening te maken had. Plus: "welk tabblad opent" staat
nu in de shortcode-bouwer.

- **`.mf-av-blad` mat 0 x 0**, gemeten in de browser. De regel was in een eerdere
  sessie van `width: clamp(112px, 30vw, 136px)` naar `flex: 0 1 136px;
  min-width: 0` gegaan — terecht bedoeld om de VIEWPORT-eenheid weg te krijgen,
  maar een kale flex-basis kan hier niet: door `container-type: inline-size` op
  datzelfde blaadje is de max-content-bijdrage NUL (de inhoud mag de inline-maat
  immers niet bepalen). De rij eromheen krijgt haar breedte van haar inhoud
  (`fit-content`) en werd dus zo breed als alleen het woordje "en"; daarna
  krompen beide blaadjes met `flex-shrink: 1` en `min-width: 0` netjes naar nul.
  Geen foutmelding, geen kapot plaatje — gewoon weg.
  Nu: `width: 136px; max-width: 100%; flex: 0 1 auto; min-width: 0`. Een
  definitieve breedte geeft wél een max-content-bijdrage, en krimpen in een
  smalle kolom blijft werken. Geen `vw`, dus de reden van die eerdere wijziging
  blijft overeind.
- **De getallen staan lager in het witte deel**: het vak loopt nu van 22% tot
  64,5% in plaats van vanaf 12%. De scheurrand en de ringetjes bovenaan vragen
  zelf al aandacht, dus een cijfer dat vlak onder de bovenrand hangt oogt hoog.
- **"Welk tabblad opent" staat in de shortcode-bouwer.** Het ATTRIBUUT `tab`
  bestond al en werkte (het wordt in class-shortcodes.php gevalideerd op
  form/calendly/extra), maar de bouwer schreef het nooit uit — je moest het met
  de hand achter de shortcode typen. Leeg blijft leeg: dan opent het bovenste
  tabblad uit `tab_order`, en dat is bijna altijd het goede antwoord. Een `tab`
  die hetzelfde zegt als de volgorde wordt dus niet uitgeschreven; dat attribuut
  zou anders blijven staan zodra iemand de volgorde wijzigt, en dan opent het
  venster stil op het verkeerde tabblad.

**1.17.19** — de hertekende kalenderblaadjes: juiste bestandsnaam, copy op de
nieuwe vlakken, en ze worden nooit meer gedimd.

- **`thingies-calendar2.svg` (met streepje) geeft 404.** Het tweede blaadje is
  opnieuw geupload als `thingies_calendar2.svg`, met underscore zoals de rest.
  Het rechterblaadje toonde dus niets meer op de site — dat is de belangrijkste
  regel van deze versie.
- **De copy staat op de nieuwe vlakken.** Het mintvlak is bij de hertekening naar
  beneden geschoven en dunner geworden: het begon rond y 162-170 (53,5% van de
  hoogte) en begint nu rond y 200-206. De maand gaat daarmee van
  `top: 53,5% / height: 33,5%` naar `top: 66,3% / height: 21%`. Die maten komen
  uit de mintpolygoon van de SVG's zelf; allebei de banden lopen SCHUIN
  (gescheurd papier), dus er is gerekend met de laagste bovenhoek en de hoogste
  onderhoek — anders steekt de tekst aan één kant boven het mint uit. De
  horizontale maten waren ongewijzigd en zijn dus blijven staan.
- **Het getal staat in een vak dat een derde hoger is** (12% tot 64% in plaats van
  tot 51%) en is mee gegroeid van 36 naar 40cqw. Anders zweeft een klein cijfer in
  een groot wit vlak. Die vergroting is een keuze en geen meting — makkelijk
  terug te draaien als ze te fors is.
- **De blaadjes worden NOOIT meer gedimd.**
  `.mf-av.is-open .mf-av-kop { opacity: .38 }` is weg. De gedachte was "dit is nog
  maar een voorstel, geen antwoord", maar een tekening op 38% leest als
  uitgeschakeld terwijl er niets uitgeschakeld is: de lijn staat er en je mag
  schuiven. De klasse `is-open` blijft bestaan (de JS zet en haalt ze), ze stuurt
  alleen geen stijl meer aan. Zet daar geen opacity en geen grijstint terug.
  "Nog geen idee" verbergt de blaadjes nog steeds volledig — dat is iets anders
  dan dimmen: er valt op dat moment niets te tonen.

**1.17.18** — "Meerdere ingangen" krijgt een deur in plaats van een trap.

- De kei gebruikt nu `thingies_deur.svg`; `thingies_traphal.svg` beeldde een
  traphal af, en dat leest als een verdieping en niet als een ingang. Enkel de
  tekening wijzigt — de waarde blijft `meerdere_ingangen`, dus bestaande
  inzendingen blijven kloppen.

**1.17.17** — de tekeningen nu wel merkbaar groter, en het label dat lelijk
afbrak is vervangen in plaats van omzeild.

- **Stap 2:** de tekening gaat van 58 (1.17.15) naar **78px**, de kei van 76 naar
  92 en het vak van 96x80 naar 104x96. De KOLOMRUIMTE gaat daarbij van 14 naar
  8px terug, zodat een kei samen 112px inneemt: het venster heeft ongeveer 570px
  inhoud, dus 5 x 112 past nog net. Bij de 118px van 1.17.16 pasten er maar vier
  meer en kwam er een derde rij bij voor één eenzame kei — dat vrat precies de
  hoogte op die de grotere tekeningen nodig hadden.
- **Stap 3:** de tekening gaat van 38 (1.17.15) naar **62px** en de kei van 52
  naar 76. Een vakje wordt daarmee 92px hoog in plaats van 72; met tien vakjes
  betekent dat dat het paneel op een lager scherm scrolt. Bewuste afweging — het
  paneel is `overflow-y: auto` en de tekeningen waren de reden van de wijziging.
- Mobiel schaalt in verhouding mee (stap 2: 50 → 66px, stap 3: 32 → 44px). In
  1.17.16 bleven die bewust staan, maar dan lopen de twee schermen te ver uiteen.
- **"Gemeenschappelijke verwarming" heet nu "Water en verwarming".** Dat ene
  woord was breder dan de kei zelf, dus het brak midden in het woord af onder de
  tekening. In 1.17.15 was daarvoor het LABELVAK verbreed (112px), wat het
  probleem verplaatste naar de ruimte tussen de keien; een korter label is het
  echte antwoord. Het labelvak staat weer op 102px — genoeg voor
  "fietsenstalling", het langste woord dat overblijft.
  De WAARDE heet mee `water_verwarming` in plaats van
  `gemeenschappelijke_verwarming`. Dat mocht omdat die waarde uit 1.17.15 komt en
  nog geen dag oud is; staan er al inzendingen mee, zet hem dan terug naar de
  oude naam en wijzig alleen het label.
- **De titel van stap 2** is "Welke voorzieningen zijn er aanwezig in de
  gemeenschap?". Die titel komt van het STAP-RECORD in wp-admin, niet uit de HTML
  — bij een stap die al bewaard staat moet je hem daar zelf aanpassen.

**1.17.16** — de tekeningen in stap 2 en stap 3 zijn groter op desktop.

- **Stap 2 (`gebouwkenmerken`):** de tekening gaat van 58 naar 70px, de kei van
  76 naar 84 en het vak eromheen van 96x80 naar 104x88. De KOLOMRUIMTE in de
  wolk gaat tegelijk van 20 naar 14px terug: samen blijft een kei 118px breed
  innemen, en dat is net smal genoeg om er nog altijd vijf naast elkaar te
  krijgen in het venster. Zonder die correctie sprong de rij naar vier en kwam er
  een derde rij met één eenzame kei bij. 118px is ook nog altijd meer dan de
  112px van een label, dus labels van buren raken elkaar niet.
- **Stap 3 (`waarom-syndicoach`):** de tekening gaat van 38 naar 48px en de kei
  van 52 naar 62. De verticale opvulling van een vakje gaat daarbij van 10 naar
  8px terug, zodat een vakje maar 6px hoger wordt in plaats van 20 — met tien
  vakjes onder elkaar in een venster van 88vh tikt dat anders meteen aan en zit
  je op een telefoon te scrollen voor iets dat cosmetisch is.
- De mobiele maten (onder 420px) zijn NIET gewijzigd: daar was de vraag niet, en
  daar is de ruimte het krapst.

**1.17.15** — stap 2 en stap 3 van de Syndicoach-reeks herwerkt: eerst welke
voorzieningen er ZIJN, daarna waarom iemand met ons praat — allebei meerkeuze.

- **Stap 2 (`gebouwkenmerken`) gaat nu over VOORZIENINGEN, niet over problemen.**
  De lijst is van dertien naar acht keien gegaan: lift, gemeenschappelijke
  verwarming, zonnepanelen, laadpalen, tuin met onderhoud, garages en
  fietsenstalling, afvallokaal, meerdere ingangen. De vrije ingave ("+") blijft.
  Reden: de helft van de oude keien waren klachten (moeilijke sfeer, ontbrekende
  verzekeringen, geen reserverekening) en die vraag stond dus twee keer in de
  reeks — hier als kei en in stap 3 als keuze. Nu vraagt stap 2 wat er IS en
  stap 3 waarom je belt.
- **Vijf waarden zijn daarmee weggevallen**: `verouderde_installaties`,
  `moeilijke_sfeer`, `ontbrekende_verzekeringen`, `geen_reserverekening` en
  `sleutels_badges`. Ze staan nog in bestaande inzendingen, dus hergebruik die
  namen nooit voor iets anders. `gemeenschappelijke_verwarming` is nieuw.
  `garages` en `onderhoud_tuin` zijn als WAARDE blijven staan en kregen alleen
  een ander label — bestaande inzendingen blijven zo leesbaar.
- **De labels kregen meer ruimte** (112px in plaats van 100px, en meer
  kolomruimte in de wolk). "Gemeenschappelijke verwarming" brak anders midden in
  het woord, want dat ene woord is breder dan een kei.
- **Stap 3 is een nieuw voorbeeld: `waarom-syndicoach`.** Vakjesstijl zoals
  `huidig-beheer`, maar MEERKEUZE, met een tekening per reden en in twee
  kolommen vanaf 560px. Tien redenen: te duur, te veel fouten, moeilijk
  bereikbaar, nog geen beheer, gebrek aan transparantie, niet meer zelf doen,
  extra ondersteuning, renovatieproject, moeilijke sfeer, administratieve
  achterstand.
- **`huidig-beheer` blijft gewoon bestaan** en staat nog in de keuzelijst van
  wp-admin. Het is nog steeds een geldige vraag; hij is alleen niet meer de
  derde stap van deze reeks.
- **LET OP — dit verandert wat er in Odoo aankomt.** `waarom_syndicoach` levert
  NUL TOT TIEN waarden af, komma-gescheiden, waar `huidig_beheer` er precies
  één gaf. Dat veld mag dus niet gemapt worden op een Odoo-selectieveld dat
  maar één waarde aankan — gebruik een tekstveld, of splits het in de
  veldkoppelingen naar meerdere vinkjes. Zonder die aanpassing komt er bij twee
  aangeduide redenen stil niets of een onbekende waarde in Odoo terecht. Ook
  `gebouw_kenmerken` was al meervoudig; daar verandert alleen de inhoud van de
  lijst.
- **Een stap die al in WordPress bewaard staat, is een kopie.** Deze versie
  wijzigt de VOORBEELDEN; de stappen die al onder Instellingen → Mymmo Forms
  → Stappen staan, veranderen niet vanzelf. Voeg het voorbeeld opnieuw in (of
  plak de HTML over de bestaande stap) om de nieuwe lijst te krijgen. Zelf
  getypte copy hangt aan de stap en blijft staan zolang de originele tekst
  hetzelfde is.

**1.17.14** — minder wit onder de knoppen, twee gelijke knoppen, en een stap
die nooit breder wordt dan het scherm.

- **De knoppen staan lager.** Onder de knoppenrij stond op een telefoon tot
  70px wit: 24px opvulling van het paneel, 12px van de rij zelf, en daar
  bovenop de veilige zone van de iPhone — die stond namelijk TWEE keer in de
  stapel (in de knoppenrij én in de strook met de overige tabbladen eronder).
  `.mymmo-modal-paneel` heeft op mobiel geen onderopvulling meer; de onderste
  rij van een paneel levert nu zelf 12px, en de veilige zone staat op één
  plek: het venster (`.mymmo-modal-panel`).
- Daarmee vervalt ook het afdekvlak uit 1.17.13: zonder die 24px opvulling is
  er geen band meer waar de inhoud doorheen kan scrollen — de knoppenrij sluit
  gewoon aan op de onderrand.
- **"Vorige" en "Versturen" zijn nu even breed**, net als Vorige/Volgende op de
  stappen ervoor. De verzendknop staat in `mymmo-forms.css` op `width: 100%`
  (een formulier zonder stappen heeft daar maar één knop); naast een "Vorige"
  die de helft van de rij neemt, gaf dat een smalle en een brede knop. Binnen
  een stappenreeks én met een "Vorige" ernaast deelt hij de rij nu half-om-half.
- **Het venster scrolt nooit meer zijwaarts.** `overflow-x: hidden` op de twee
  plekken die verticaal scrollen (`.mymmo-modal-body` en, met tabbladen, het
  paneel zelf). Steekt er iets uit, dan wordt het afgekapt in plaats van dat je
  op een telefoon opzij kan vegen en alles scheef staat. Een stap met een eigen
  zijwaarts scrollvlak (het jaarwiel) blijft gewoon werken.
- **Een stap is nooit breder dan haar kolom** (`min-width: 0` + `max-width:
  100%` op `.mymmo-stap`, `.mymmo-stap-inhoud` en de blokken die een stap
  meebrengt). Een flexitem mag standaard niet kleiner worden dan zijn inhoud;
  daardoor kon een stap met een vaste maat de kolom openduwen.
- **De stap met het jaarwiel gebruikt geen `vw` meer.** De twee
  scheurkalenderblaadjes stonden op `clamp(112px, 30vw, 136px)` — een maat van
  het SCHERM, terwijl de stap in een callout of naast een zijkolom in een veel
  smallere kolom staat. Ze delen nu de rij (`flex: 0 1 136px`) en krimpen mee;
  de tekst erin schaalde al mee (`cqw`). **Een stap die al in WordPress bewaard
  staat is een kopie**: die krijgt dit pas na opnieuw invoegen bij
  Instellingen → Mymmo Forms → Stappen.

**1.17.13** — en de derde kier: die zat niet in een marge maar in een
doorkijk.

- Op een telefoon stond er tussen de Vorige/Volgende-rij en de strook met de
  overige tabbladen ("Stuur een bericht" / "Plan een gesprek") nog steeds een
  band waar je de inhoud van de stap doorheen zag scrollen — de keien van
  "Wat speelt er in jullie gebouw" kwamen half onder de knoppen door.
- **Oorzaak:** met tabbladen is `.mymmo-modal-paneel` zelf de scrollcontainer
  (`overflow-y: auto`), en de onderste 24px daarvan is OPVULLING. Scrollende
  inhoud is in die band gewoon zichtbaar. De knoppenrij (sinds 1.17.9 sticky)
  kan ze niet zelf innemen: een sticky element blijft binnen zijn containing
  block, en dat eindigt op de contentrand van het paneel, 24px hoger.
- **Opgelost** met een vlak dat aan de knoppenrij hangt en die 24px afdekt
  (`::after`, `top: 100%`, tot beide zijranden). Bewust geen negatieve marge
  op de rij zelf: dat zou de knoppen verplaatsen en meerekenen in de
  sticky-berekening. Aan de layout verandert dus niets — enkel wat er te
  zien is.

**1.17.12** — de kier uit 1.17.11 zat niet waar de fix hem zocht.

- Er bleken TWEE aparte `@media (max-width: 640px)`-blokken in
  `mymmo-forms-modal.css` te bestaan die allebei `.mymmo-modal-main` en
  `.mymmo-modal-aside` beschrijven (dit stond al gedocumenteerd bovenaan het
  bestand: "bij gelijke specificiteit wint de laatste"). Het EERSTE, oudere
  blok zette `.mymmo-modal-main` op mobiel al op `margin: 0` — de
  `margin-bottom: 0` uit 1.17.11 deed dus niets, want die marge was al nul.
- De echte kier zat in de BOVENPADDING van `.mymmo-modal-aside` zelf (12px, op
  de eigen getinte achtergrond van die strook) uit het TWEEDE blok, dat wint
  omdat het verderop in het bestand staat. Die padding staat nu op 0.

**1.17.11** — Vorige/Volgende naast elkaar op mobiel, en drie strookjes die nu
tegen elkaar aan sluiten in plaats van ertussen een kier te laten.

- **Vorige/Volgende stonden sinds 1.17.9 onder elkaar** (column-reverse, met
  Volgende bovenaan) om te voorkomen dat je op een telefoon per ongeluk de
  verkeerde knop raakt. Op uitdrukkelijk verzoek staan ze nu weer NAAST
  elkaar, elk de helft van de rij (`flex: 1 1 0`) — dezelfde rijindeling als
  op desktop.
- **De "extra acties"-strook onderaan (de niet-gekozen tabbladen, bv.
  "Stuur een bericht" / "Plan een gesprek") had een eigen, kleinere
  zijopvulling (16px) dan de rest van het venster (24px op mobiel)**, waardoor
  die strook smaller oogde dan de Vorige/Volgende-rij erboven. Nu dezelfde
  24px als `.mymmo-modal-paneel`.
- **Tussen de kaart (met Vorige/Volgende) en die strook zat een zichtbare
  kier van 12px** — de normale `margin-bottom` van `.mymmo-modal-main` (de
  "los zwevende kaart"-look), die op mobiel niet hoort: de knoppenrij moet
  tegen de onderrand aansluiten. Op mobiel staat die marge nu op 0.

**1.17.10** — een zichtbaar "bezig"-scherm tijdens het versturen, i.p.v. enkel een veranderde knoptekst.

- Een indiening kan enkele seconden duren zodra de gekoppelde koppeling een
  pdf-stap heeft (een offerte wordt via een echte headless browser gerenderd,
  aan de kant van de Operations Manager) -- de knoptekst alleen
  ("Bezig met versturen...") gaf dan geen duidelijk signaal dat er iets
  gebeurt, en sommige bezoekers klikten opnieuw. `verstuurInVenster()` in
  mymmo-forms.js toont nu een overlay met een draaiende indicator boven het
  formulier zolang de aanvraag onderweg is, en verbergt die weer zodra het
  dankjewelscherm of een foutmelding verschijnt.
- Puur JS/CSS, dynamisch aangemaakt (zelfde patroon als de bestaande
  foutmelding) -- geen nieuwe PHP-template en geen nieuwe vertaalsleutel: de
  tekst hergebruikt het bestaande `submitting`-bericht dat al op de knop stond.
- Enkel van toepassing op de pop-up/tabblad-weg (`verstuurInVenster()`, met
  `fetch()`); een [mymmo_form] gewoon in een pagina doet nog steeds de
  klassieke POST met redirect en heeft dit overlay dus niet nodig -- de
  browser toont daar zijn eigen laadindicator tijdens het navigeren.

**1.17.9** — op een telefoon blijven Vorige/Volgende altijd in beeld, en een stapwissel springt terug naar boven.

- **De knoppenrij is nu STICKY, niet een gewone flexrij.** Bij een lange stap (een
  schuifbalk met een grote tekening, een reeks met veel keien) stond de rij pas
  onderaan als je helemaal naar beneden scrolde -- op een telefoon is dat precies
  het deel van het scherm dat je niet altijd ziet. Sticky reserveert gewoon zijn
  eigen plek in de flexketen (zie CLAUDE.md, "De stap vult het vlak"): past de
  stap, dan staat de rij waar ze al stond; past ze niet, dan klikt ze vast aan de
  onderrand van het scrollgebied terwijl de rest van de stap er nog voorbij
  scrolt. Fixed had daarvoor een handmatige `padding-bottom` per stap nodig gehad;
  sticky niet.
- **Een stapwissel scrolt het venster terug naar boven.** Dat gebeurde al buiten
  een venster (de wikkel zelf scrollt in beeld), maar in de pop-up werd dat
  bewust overgeslagen -- scrollen van de wikkel had daar de PAGINA onder het
  venster laten verspringen. Het echte scrollgebied van het venster (het paneel
  bij tabbladen, anders `.mymmo-modal-body`) bleef daardoor op zijn oude positie
  staan: wie van stap 3 naar stap 4 ging, kwam op de plek uit waar stap 3
  gescrold had gestaan, vaak halverwege stap 4. `scrollVensterNaarBoven()` in
  mymmo-forms-steps.js zoekt nu de eerste echt scrollende voorouder en zet die
  terug op 0.

**1.17.8** — een kaal getal in een maatveld betekent pixels.

- `mymmo_forms_length()` gooide alles weg wat geen eenheid had: **`35` werd ''**,
  `35px` werd `35px`. Gevolg bij een callout: "Hoeken" op `35` invullen zag er na
  het opslaan ingevuld uit, maar `--mf-callout-radius` werd nooit gezet en het
  blok hield stil zijn standaard van 18px — waarna je de oorzaak in de
  stylesheet gaat zoeken. Hetzelfde gold voor "Ruimte boven en onder", "Ruimte
  tussen titel en tekst" en elke lengte in het thema van een formulier.
- Een kaal getal is in CSS ongeldig (op `0` na), dus het kan niets anders
  bedoeld hebben dan pixels. Alles wat daarvoor geweigerd werd, wordt nog steeds
  geweigerd: enkel cijfers met een optionele decimale punt komen erdoor.

**1.17.7** — een callout die gestrekt wordt, verdeelt die ruimte nu zelf.

- **Het blok is een grid met één kind.** Zonder hoogte van buitenaf verandert dat
  niets. Maar staat de callout tussen kaarten die allemaal even hoog moeten zijn
  (een `min-height` van de pagina), dan bleef haar inhoud bovenaan plakken met een
  gat eronder, terwijl de kaarten ernaast hun inhoud centreren.
- **Twee kolommen: `align-content: center`** — de inhoud staat midden in de vrije
  ruimte.
- **Eén kolom (blok smaller dan 620px): `grid-template-rows: auto minmax(0, 1fr)`**
  — de titel en de tekst nemen wat ze nodig hebben, het witte vlak met het
  formulier krijgt de rest. Op een telefoon is dat gat namelijk geen lege ruimte
  maar ruimte die het formulier kan gebruiken; de knop komt daardoor tegen de
  onderrand te staan in plaats van vlak onder de laatste vraag.

**1.17.6** — de tekst van een callout kan inspringen zonder het formulier mee te
nemen.

- **`text_pad` en `text_pad_mobile`**: extra ruimte rond de titel en de tekst,
  bóvenop de opvulling van het blok. Nodig zodra een callout tussen andere
  kaarten staat: op syndicoach.be begint de tekst in die kaarten op 58px van de
  rand, en dat halen met de opvulling van het BLOK zou ook het witte vlak met het
  formulier 58px naar binnen duwen — op een telefoon blijft daar dan 219px van
  over. Twee waarden die optellen, maar geen twee antwoorden op dezelfde vraag:
  de ene is de rand van het blok, de andere de inspringing van een kolom
  daarbinnen.
- Een ingestelde waarde **vervangt** de standaarduitlijning van de tekstkolom met
  het witte vlak ernaast (`padding-top: clamp(18px, 2.4vw, 28px)`). Neem die
  ruimte bovenaan dus mee in je eigen waarde, anders begint de titel hoger dan
  het vlak ernaast.

**1.17.5** — een callout die zichzelf juist rendert naast andere kaarten, en
een kortere kop voor een smal blok.

- **De opvulling is instelbaar** (`pad`), en apart voor een telefoon
  (`pad_mobile`). Staat een callout tussen kaarten van een pagina, dan moet ze
  dezelfde opvulling kunnen krijgen als die kaarten. Dat kon alleen met CSS op
  de pagina, en zulke CSS breekt stil zodra de plugin haar eigen waarden
  bijstelt. Leeg = zoals voorheen, dus deze versie verandert op zichzelf niets.
- **De ingestelde `radius` gold niet op een telefoon.** De mobiele regel zette
  `border-radius` er hard overheen, waardoor het blok onder 600px als enige
  andere hoeken had dan de rest van de pagina — en dat zag je niet in een
  voorbeeld, alleen op een echt toestel. Nu leest ook die regel
  `--mf-callout-radius`.
- **De ruimte tussen de titel en de tekst staat op één plek** (`title_gap`,
  standaard 10px). Het was een marge op de titel naast de gap van de kolom: twee
  bronnen voor dezelfde afstand, en dus onvermijdelijk ooit twee antwoorden.
- **Een INGANG mag een korte titel meegeven** (`title_mobile`). "Eindelijk
  gebouwbeheer gemaakt voor jou" is op 375px vier regels. De korte kop verschijnt
  zodra het BLOK smaller is dan 620px — dezelfde maat waarop de kolommen
  omslaan, dus ook in een smalle kolom op een groot scherm. Beide koppen staan in
  de markup en de CSS kiest: server-side kiezen kan niet, want de pagina wordt
  gecachet en weet niet op welk scherm ze belandt.

**1.17.4** — kleur en hoeken per plaatsing, en een venster dat op een telefoon
meteen toont waar je voor kwam.

- **`bg` en `radius` mogen op de shortcode staan**, naast bij de ingang zelf:
  `[mymmo_form_entry id="hero" bg="transparent" radius="0"]`. Zo staat dezelfde
  callout op de ene pagina in een gekleurd vlak en op de andere los op de
  achtergrond. `transparent` is daarbij een geldige keuze en geen kleur.
- **Op MOBIEL vallen de kop, de inleiding en de rij tabbladen weg.** Ze stonden
  alle drie bovenaan en duwden samen het eigenlijke scherm een halve
  telefoonhoogte naar beneden — terwijl de bezoeker net geklikt had en dus al
  gezegd had wat hij wou. Nu krijgt hij dat tabblad over de volle hoogte.
- **De tabbladen die hij NIET koos staan onderaan**, op de tint van het venster,
  zodat ze lezen als "er kan hier ook nog dit" in plaats van als een keuze die
  hij eerst moet maken. Het actieve tabblad staat er niet bij — dat is waar hij
  al is.
- **Welk tabblad opengaat, kies je bij de ingang** (`tab`, ook op de shortcode).
  Een knop "Plan een gesprek" hoort op de agenda uit te komen, niet op het
  formulier dat toevallig bovenaan staat. Bij een callout volgt het tabblad al
  uit wat ze uitlicht.

**1.17.3** — een callout op de volle paginabreedte, en drie fouten in een venster
met drie tabbladen.

- **De callout breekt uit de inhoudskolom** en gaat tot 1200px, gecentreerd op de
  pagina. Een shortcode staat in een kolom van 650 à 800px; daar past een callout
  met twee kolommen niet in. `calc(100vw - 40px)` en niet `100vw`, want die laatste
  telt de schuifbalk mee en geeft dan een horizontale schuifbalk over de hele pagina.
- **Breedte, verdeling en ruimte zijn instelbaar** bij de ingang: tot hoever het
  blok gaat (1200px), de kolomverhouding (1:1, 2:3 of 1:2) en de ruimte boven en
  onder (48px). De verhouding gaat door een gesloten lijst — die waarde belandt in
  een style-attribuut op de pagina van een bezoeker.
- **Ruimte boven en onder.** Het blok plakte tegen het component erboven: een
  callout is iets op zichzelf, en de marges die een thema aan een alinea geeft
  gelden hier niet.
- **De linkerkolom lijnt bovenaan uit**, met dezelfde opvulling als het witte vlak
  ernaast, zodat de eerste regel links en rechts op één lijn staan.
- **FOUT: de callout hing altijd aan het formulier-tabblad.** Een venster kan twee
  reeksen hebben — `steps` op het formulier-tabblad en `extra_steps` op het derde.
  Lichtte je een stap van dat derde tabblad uit, dan werd de reeks bij het
  VERKEERDE formulier gerenderd: "Stuur een bericht" toonde de stappenreeks, en er
  stond een melding dat `aantal_kavels` nergens heen kon. De callout kijkt nu in
  welke van de twee lijsten de stap staat en hangt zich aan dat tabblad.
- **FOUT: de reeks pakte het verkeerde formulier.** `this.formulier` nam het eerste
  `.mymmo-form` in de wikkel, en die ligt bij een callout om het HELE venster heen —
  dus het formulier van een ander tabblad, waar die verborgen velden niet bestaan.
  Daardoor kwam wat je in de callout invulde nergens aan. De naakte reeks merkt nu
  haar eigen inhoud.

**1.17.2** — de linkerkolom van een callout lijnt bovenaan uit.

- De titel en de tekst stonden verticaal gecentreerd naast het witte vlak, dat
  meestal hoger is — dan lijkt de titel te zweven. Ze beginnen nu bovenaan, met
  dezelfde opvulling als dat vlak, zodat de eerste regel links en de eerste regel
  rechts op één lijn staan. Alleen in de indeling met twee kolommen; in de brede
  indeling staat de tekst er toch al boven.

**1.17.1** — ingangen: meerdere manieren om hetzelfde venster te openen.

(1.17.0 is nooit uitgerold; het nummer is opgehoogd zodat er geen twijfel kan
bestaan over welke build er draait.)

- **Een opstelling is het VENSTER, een ingang is een manier om het te openen.**
  Die twee stonden door elkaar: "hoe toon je het" was een keuze IN de opstelling,
  en dus had je per manier een kopie van het hele venster nodig — met bij elke
  wijziging de vraag welke kopie waar stond. Ingangen hebben nu een eigen lijst,
  een eigen tabblad en een eigen shortcode: `[mymmo_form_entry id="..."]`.
- **Drie soorten, zoveel als je wil.** Een **knop** met eigen opschrift en kleur
  (twee knoppen met andere copy naar hetzelfde venster mag), een **klasse** die je
  op een bestaande knop, afbeelding of icoon zet, en een **callout**.
- **Een callout licht één onderdeel uit:** een stap, het formulier of de agenda.
  Licht je een stap uit, dan komt die ook vooraan in het venster te staan en
  schuift de rest erachter aan. Eén callout per stap, en een nieuwe stap krijgt
  er later gewoon een bij.
- **Twee indelingen, en er is geen derde.** Twee kolommen (onderdeel naast titel,
  tekst en afbeelding) of volle breedte (titel en tekst boven, onderdeel eronder,
  knop rechtsonder).
- **Er wordt niets weggelaten uit een stap.** De tekening van het gebouw bij de
  schuifbalk hoort erbij — dat is de ervaring waarvoor een callout bestaat.
- **Het uitgelichte onderdeel VERHUIST** bij het openen naar het venster en komt
  bij het sluiten terug. Het is hetzelfde element, geen kopie: anders draag je de
  waarde wel over maar de stand van de bediening niet.
- **Geen schuifbalken**: het kaartje groeit mee met zijn inhoud. Nieuw op het
  VENSTER is **Ruimer venster** (`panel="breed"`), voor een stap die in de gewone
  breedte niet past en daar anders een schuifbalk van maakt.
- **De brug naar de stappenreeks** (`window.MymmoStappen`) hangt nu aan de
  stap-sectie in plaats van aan de reeks. Een callout schrijft zijn onderdeel
  eerder uit dan het venster eromheen; stond de brug nog in `templates/steps.php`,
  dan kwam ze te laat en deed het script van die stap niets — zonder dat er
  zichtbaar iets stukging, want de schuifbalk leest de reeks rechtstreeks uit.
- **De kolommen slaan om op de breedte van het BLOK, niet van het scherm**
  (container query). Een callout staat in de inhoudskolom van een pagina, en die
  is vaak smaller: met een gewone media query kreeg je één kolom op een plek waar
  er twee pasten. De verhouding is 1:2 — de tekst is een titel en twee regels,
  het uitgelichte onderdeel is waar de bezoeker iets doet.
- **`mymmo-forms-steps.js` staat nu in de KOP van de pagina.** Het script van een
  stap draait tijdens het parsen en verwacht dat `window.MymmoStappen` al
  bestaat; dat kwam uit een klein inline stukje, en dat is precies wat een cache-
  of optimalisatieplugin naar de voettekst verplaatst. Dan gooit het script van de
  stap en hangt er geen enkele luisteraar: de schuifbalk schuift wel, maar het
  getal en de tekening bewegen niet mee. In de kop kan die volgorde niet meer
  misgaan.
- **De reeks sorteert op stapnummer, niet op volgorde in het document.** Het
  kaartje staat vóór het venster, dus het formulier (de laatste stap) stond als
  eerste in de DOM; daardoor schoof elke index een plaats op en kwam de verkeerde
  sectie in het kaartje terecht.
- **De hardcoded regel onder de titel is uit de vier voorbeeldstappen gehaald.**
  Vulde je bij de stap ook "Regel eronder" in, dan stonden er twee zinnen onder
  elkaar. De zin is niet verloren: "Voorbeeld invoegen" vult er nu het veld mee.
  **Een stap die al bewaard staat is een kopie** en verandert hier niet van — haal
  die ene regel daar met de hand weg.

**1.16.2** — niets in de pop-up is nog selecteerbaar.

- Een sleepbeweging (het jaarwiel, een schuifbalk) of een dubbelklik kleurde de
  hele inhoud van het venster blauw. `user-select: none` op het paneel, met twee
  klassen zodat een thema niet wint. Invoervelden, tekstvakken, keuzelijsten en
  bewerkbare tekst in de bouwer blijven WEL selecteerbaar: je eigen typfout moet
  je kunnen aanduiden.

**1.16.1** — geen flits meer tussen versturen en het dankjewelscherm.

- **Oorzaak:** een formulier in de pop-up deed de klassieke POST met redirect. De
  pagina laadde opnieuw, het venster was even dicht, en JavaScript opende het
  daarna weer op het dankjewelscherm.
- **Nu:** in een tabblad van de pop-up verstuurt mymmo-forms.js het formulier met
  `fetch()` (extra veld `mymmo_ajax=1`) en toont het dankjewelscherm meteen, in
  hetzelfde venster, zonder herladen. De server doet exact dezelfde controles
  (nonce, honeypot, invultijd) en dezelfde inzending; alleen het antwoord is JSON
  in plaats van een redirect. De conversie (`mymmo_formulier_verstuurd` met
  `mymmo_tabblad`) vuurt op hetzelfde moment.
- **Mislukt het**, dan blijft het formulier met alles erin staan en komt de
  foutmelding erboven, zoals na een klassieke mislukte inzending. Een OM-formulier
  met "doorsturen naar een pagina" gaat gewoon naar die pagina.
- **Zonder JavaScript, en voor een formulier gewoon in een pagina**, blijft het de
  klassieke POST met redirect.
- Getest in de browser met een nagebootst antwoord: formulier-tabblad en
  stappen-tabblad tonen hun scherm zonder herladen, met de juiste dataLayer-regel;
  een fout laat het formulier en de ingevulde waarden staan.

**1.16.0** — een dankjewelscherm per tabblad.

- **Elk tabblad van de pop-up heeft zijn eigen dankjewelscherm**: een afbeelding
  (zonder afbeelding een vinkje in de accentkleur), een titel en een tekst. Het
  verschijnt in de plaats van het formulier na een geslaagde inzending, en in de
  plaats van de agenda na een geboekt gesprek.
- **Opmaken in het voorbeeld.** De knop "Dankjewelscherm" boven het voorbeeld
  toont het scherm van het tabblad dat openstaat; de titel en de tekst typ je er
  rechtstreeks in, en een klik op het vinkje of de afbeelding opent de
  mediabibliotheek. De velden staan ook onder "Na het versturen".
- **Standaarden.** Een lege tekst is de bedanktekst uit de OM (bij een formulier)
  of "Je gesprek staat ingepland..." (bij een gesprek); een lege titel blijft weg.
  Wie niets instelt, ziet dezelfde zin als tot 1.15, nu als scherm in plaats van
  als melding boven het formulier.
- **Google Analytics / GTM.** Dezelfde gebeurtenissen als voorheen, op het moment
  dat het scherm verschijnt, met een veld erbij:

  | event | wanneer | velden |
  |---|---|---|
  | `mymmo_formulier_verstuurd` | dankjewelscherm van `form` of `extra` | `mymmo_formulier`, `mymmo_doel`, `page_path`, **`mymmo_tabblad`** |
  | `mymmo_calendly_geboekt` | dankjewelscherm van `calendly` | `mymmo_calendly_event`, `mymmo_doel`, `page_path`, **`mymmo_tabblad`** |

  Het derde tabblad krijgt een eigen conversiepad (`goal_extra`, veld
  "Conversiepad — derde tabblad"); leeg = dat van het formulier.
- **Welk tabblad verstuurde, reist mee.** Het formulier post `mymmo_tab`, de
  melding na de redirect onthoudt het, en het venster opent terug op DAT tabblad
  met DAT scherm. Twee tabbladen met hetzelfde formulier (formulier en een
  stappenreeks ervoor) krijgen zo elk hun eigen scherm. Een formulier op het
  derde tabblad met een ANDER formulier kreeg voorheen geen bevestiging in de
  pop-up (de melding werd enkel op het eerste formulier gezocht); nu wel.
- Nieuwe shortcode-attributen: `thanks_form_image`, `thanks_form_title`,
  `thanks_form_text`, `thanks_extra_image`, `thanks_extra_title`,
  `thanks_extra_text`, `thanks_calendly_image`, `thanks_calendly_title` en
  `goal_extra`. De tekst van het gesprek blijft `thanks_calendly`.
- Een [mymmo_form] gewoon in een pagina verandert niet: daar blijft de melding
  boven het formulier.

**1.15.21** — ook "Stuur een bericht" krijgt titel en regel uitleg.

- **De kop boven het formulier staat nu ook op een tabblad zonder stappen**, met
  exact dezelfde opmaak als de kop van een stap (dezelfde klassen, 1,3rem). Tekst:
  wat bij "Boven het formulier" staat, anders de naam en de inleiding uit de OM.
- **Uit te zetten** met het vinkje "Ook tonen boven een formulier zonder stappen"
  in de shortcode-bouwer, of `form_heading="no"` op de shortcode. Standaard aan.
- Een functie voor beide plekken: `mymmo_forms_form_kop()` (helpers.php). De kop
  staat binnen de wikkel van het formulier, zodat hij dezelfde letter en kleuren
  krijgt als de velden; het formulier toont zijn eigen titel en inleiding dan niet.
- De stijl van een stap-titel (`mymmo-forms-steps.css`) laadt nu in elke pop-up,
  ook zonder stappen. Het script van de reeks alleen als er een reeks is.
- Een [mymmo_form] gewoon in een pagina verandert niet.

**1.15.20** — de formulierstap krijgt zijn kop uit de OM; het wiel wordt meteen actief.

- **Titel en regel uitleg boven het formulier (de laatste stap) komen uit de OM**:
  de naam en de inleiding van het formulier, in de taal van de pagina. Wat je bij
  "Boven het formulier" invult (`form_title`/`form_sub`), wint nog steeds; leeg
  laten betekent nu "uit de OM" in plaats van "geen kop". Het formulier zet zijn
  eigen titel en inleiding dan uit, zodat ze er niet twee keer staan.
- **Vergaderstap: niet meer grijs zodra de bezoeker begint te schuiven.** Grijs
  bleef staan tot het loslaten; nu verdwijnt het bij de eerste wissel van het
  venster, met de vinger nog op het wiel. Bewaard wordt de keuze nog steeds pas
  bij het loslaten.

**1.15.19** — vergaderstap: de kalenderblaadjes zijn merktekeningen.

- **`thingies_calendar1.svg` (van) en `thingies-calendar2.svg` (tot)** -- let op,
  de eerste met underscore, de tweede met een streepje. Het getal staat in het
  witte vak bovenaan, de maand in het mintvlak.
- **De maand staat in het midden van het ZICHTBARE mintvlak**, opgemeten uit de
  SVG's: het mint loopt rechts onder de kaderlijn door, dus het midden van de
  polygoon is niet het midden dat je ziet (blad 1 op 53,8%, blad 2 op 51,5%,
  beide op 69,5% hoogte).
- **Tekst schaalt mee met het blaadje** (`container-type: inline-size`, eenheid
  `cqw`). De maand is vet; "september", de langste, beslaat 56% van het blaadje
  in een zichtbaar mintvlak van 66%, op elke schermbreedte.
- **Kleine anticipatie en plop op het getal** als de dag verspringt (eerst een
  tikje kleiner, dan voorbij de maat, terug). Het blaadje zelf beweegt niet, en
  er is geen geluid. Uit bij `prefers-reduced-motion`.

**1.15.18** — vergaderstap: scheurkalenderblaadjes, jaarloos en rondlopend.

- **Twee scheurkalenderblaadjes in plaats van een zin** ("MEESTAL TUSSEN" erboven,
  maand bovenaan het blaadje, dag groot eronder). Ze zijn altijd even groot, dus
  niets verspringt meer, ook niet als het venster over een maandgrens gaat.
  Bewust geen animatie bij het wisselen. De maandstrook staat in de accentkleur
  met `--mf-accent-text` erop (de inkt die de site zelf op die kleur zet).
- **Jaarloos.** Een algemene vergadering valt elk jaar rond dezelfde tijd: er
  staat nergens een jaartal, en `volgende_av_periode` is "tussen 10 en 25
  november" zonder jaar. `volgende_av_van`/`_tot`/`_datum` zijn de EERSTVOLGENDE
  keer dat dat venster voorkomt.
- **De lijn loopt rond.** Terug naar augustus kan net zo goed als vooruit naar
  januari: na december komt januari. Technisch vijf kopieen van een jaar; na elk
  schuiven springt de lijn onzichtbaar terug naar de middelste (getest: dertien
  maanden terug en twee jaar vooruit komen allebei netjes terecht).

**1.15.17** — vergaderstap: kader en lijn kloppen met elkaar, kop staat vast.

- **Het kader komt nu overeen met de periode op de lijn.** Een maand staat op de
  lijn altijd als 4,3 weken (30,1 dagen), en de zes ankers (5, 10, ... 30) liggen
  op gelijke afstand. Een venster van drie ankers is dus exact een halve maand, en
  het mintvlak van het kader is precies zo breed. Gemeten: bij "5 en 20 november"
  staat het begin van november 50px links van het kader (5/30 van een maand van
  301px), bij "15 en 30 november" valt het begin van december exact op de
  rechterrand.
- **Begin en einde van elke maand staan als streepje op de as.** De maandnaam
  staat in het midden van de maand; zonder streepje zag je niet waar ze begint.
- **De lijn is getekend en rafelig**: een naadloze tegel van 420px als CSS-masker
  (procent-gecodeerd, dus geen inline SVG en geen kleiner-/groter-dan-tekens), in
  de merkkleur.
- **De kop staat vast.** Altijd twee datumregels van vaste hoogte, elke regel
  gecentreerd op hetzelfde middelpunt: "10 en 25 / november" of "25 november /
  en 10 december". De lijn eronder verspringt niet meer (gemeten: zelfde
  positie en zelfde middelpunt voor elk venster).

**1.15.16** — de vergaderstap vereenvoudigd: een lijn, een kader, grote datums.

- **Vorm volgens de schets:** bovenaan "meestal tussen" met de datums in grote
  cijfers, daaronder een getekende lijn met maandnamen die onder een vast kader
  (`thingies/frame.svg`) door schuift. De maandnaam die in het kader valt, staat
  op het mintvlak van de tekening. Geen kaart, geen banden, geen dagnummers en
  geen Vroeger/Later-knoppen meer; "Nog geen idee" blijft als bescheiden link.
- **Alleen ankerdagen 5, 10, 15, 20, 25 en 30** (in februari de laatste dag), en
  de lijn springt per anker. Een venster loopt van een anker tot drie ankers
  verder: tussen 5 en 20, 10 en 25, 15 en 30, 20 en 5, 25 en 10, 30 en 15.
  Blijft het venster in een maand, dan staat de maand er een keer ("10 en 25
  november"); over een maandgrens staan beide ("25 november en 10 december").
- **`volgende_av_periode` volgt die zin** ("tussen 10 en 25 november 2026").
  `volgende_av_van`/`_tot` zijn de ankerdatums, `volgende_av_datum` het midden.
- Het kader is zo geschaald dat het mintvlak van de tekening (x 52,9-351,8 van
  367,7) exact vijftien dagen van de lijn beslaat.

**1.15.15** — nieuwe voorbeeldstap: wanneer is de volgende algemene vergadering?

- **`voorbeelden/algemene-vergadering.html`, een jaarwiel met een speld.** Het
  gevoel is "ik prik een datum, maar met een breed foutenvenster": de bezoeker
  schuift een jaarlijn onder een vaste speld door, en het venster van twee weken
  eromheen is de marge. Bovenaan staat meteen hoe dat leest ("Midden maart",
  "Eind maart", "Eind maart, begin april") met de datums eronder. Elke maand is
  in drie banden verdeeld (begin/midden/eind, met de maand erbij), zodat je ziet
  of het venster over een maandgrens valt.
- **Bediening:** swipen op een telefoon (gewoon horizontaal scrollen, met de
  vaart van het toestel), slepen of het muiswieltje op een computer, pijltjes
  (een dag) en Page Up/Down (een week) op het toetsenbord, tikken op een dag,
  en de knoppen Vroeger/Later. Na het loslaten klikt het wiel op een dag vast;
  zolang er een vinger op ligt niet.
- **Waarden:** `volgende_av_periode` ("midden maart 2027" of "onbekend"),
  `volgende_av_datum` (de speld), `volgende_av_van` en `volgende_av_tot` (het
  venster). "Voorbeeld invoegen" zet `volgende_av_periode` bij de verplichte
  sleutels: "Volgende" blijft uit tot er een periode of "Nog geen idee" gekozen is.
- **Het wiel opent zes weken vooruit, maar dat telt niet als antwoord.** Pas als
  de bezoeker het wiel beroert, staat er een waarde. Anders gaat een voorstel dat
  niemand bekeek als antwoord naar Odoo.
- **Gemeten, niet aangenomen:** de eerste versie mat het wiel terwijl de stap nog
  verborgen was (breedte 0) en opende daardoor op een verkeerde datum. Het wiel
  meet zich nu met een ResizeObserver zodra het echt breedte krijgt.
- Gebouwd volgens de regels van 1.15.12 en 1.15.14: het script is ASCII zonder
  en-teken, kleiner- of groter-dan (vergelijken met Math.min/Math.max, lussen met
  `!==`), geen inline SVG en geen leeg element in de markup. De maanden, banden en
  dagen maakt het script zelf in de browser.

**1.15.14** — stap 3 (huidig beheer) opnieuw opgebouwd.

- **Live stond stap 3 volledig door elkaar**: de teksten liepen in een smalle kolom
  over de knoppen heen. Oorzaak, gelezen uit de DOM op syndicoach.be: na elke
  inline SVG met een use-element ontbrak de sluit-tag van het icoonrondje, het
  (lege) vinkje-element was verdwenen en alle witruimte tussen de knoppen ook. De
  tekst zat daardoor BINNEN een rondje van 50px. Stap 2 op dezelfde pagina
  (afbeeldingen, geen inline SVG) kwam wel ongeschonden door.
- **Nieuw ontwerp zonder SVG en zonder lege elementen.** Vier kaarten, twee per rij
  (een per rij op een smal scherm), elk met een korte titel en een regel uitleg.
  Het keuzerondje en het vinkje zijn CSS op de knop zelf. Gekozen: zachte mint met
  rand en rondje in de leesbare merkkleur. De knop noemt zelf alles wat een thema
  op een knop kan zetten (display, richting, hoogte, opvulling, schaduw, tekst).
- **Copy:** Niet echt beheerd / Professionele syndicus / Vrijwillige syndicus /
  Nu geen syndicus meer, met een korte uitleg eronder. De WAARDEN zijn ongewijzigd.
- De zelfgetekende icoontjes zijn weg: er bestaat geen merktekening voor deze vier
  situaties, en zelf tekenen doen we niet.

**1.15.13** — labels van stap 2 herschreven, en het getal van stap 1 op de as.

- **Labels in stap 2.** "Gemeenschappelijke tuin" was te lang en wordt "Onderhoud
  tuin". De brandslang staat voor "Ontbrekende verzekeringen", het spaarvarken voor
  "Geen reserverekening". Die WAARDEN zijn mee gewijzigd (`onderhoud_tuin`,
  `ontbrekende_verzekeringen`, `geen_reserverekening`) -- kan nog, er zijn geen
  inzendingen. Een label is nu 100px breed met `text-wrap: balance`, zodat twee
  woorden netjes op twee regels vallen ("Meerdere / ingangen"); een vaste spatie
  houdt "of parkings" en "en badges" samen. Gemeten: het langste woord
  ("reserverekening") is 88px, dus niets steekt uit.
- **Stap 1: de tekening stond niet scheef, het getal wel.** Gemeten in de pop-up:
  vlak, tekening en schuifbalk hadden hetzelfde midden, en ook de GROEP
  "60 kavels of meer" -- maar daardoor stond het grote getal zelf 55px links van
  de as. Het oog neemt het getal als anker. Nu staat het getal in de middelste van
  drie kolommen en groeit de eenheid enkel naar rechts: getal, tekening en
  schuifbalk vallen op dezelfde x voor elke waarde. De tekeningen van niveau 1-4
  zijn exact gecentreerd in hun canvas; niveau 5 staat 7% rechts door de
  aanbouw, en dat is de tekening zelf.

**1.15.12** — de keien reageren weer, grotere gebouwen in stap 1, betere copy in stap 2.

- **Op syndicoach.be reageerde geen enkele kei.** De console gaf
  `SyntaxError: Invalid or unexpected token`: in de ruwe serveruitvoer stond
  `&&` als `&#038;&#038;` en elke letter met een accent als hex-entiteit
  (8x `&#038;`, 61 hex-entiteiten). Het script parste niet, dus er hing nooit een
  luisteraar aan de keien. Alleen de kenmerken-stap werd geraakt — stap 1 en 3
  bleven onaangeroerd — en dat is ook de enige stap met `loading="lazy"`-
  afbeeldingen, op een site waar een lazyload-plugin die afbeeldingen herschreef
  (`src` werd `data-src`). Die plugin is de waarschijnlijke oorzaak, maar dat is
  van buitenaf niet te bewijzen. Daarom op twee fronten:
  - **De stap-scripts bevatten uitsluitend ASCII en geen `&`, `<`, `>` of sluit-tag.**
    Dan valt er niets te herschrijven. Getest door de live verminking na te
    bootsen: de vorige versie parste daarna niet meer, de nieuwe wel.
  - **De afbeeldingen laden meteen**, zoals in stap 1, met de gangbare vlaggen
    om lazyload-plugins over te slaan (`skip-lazy`, `no-lazyload`,
    `data-no-lazy`, `data-skip-lazy`).
  Stap 3 (`huidig-beheer`) volgt dezelfde regel, al werkte die live nog.
- **De tekeningen in stap 1 zijn groter.** Alle tien delen een canvas van
  2048 x 2048, dus in dezelfde vierkante doos schalen ze samen. De grootste
  (`level5comm`) reikt tot 86% van de hoogte en heeft 11,8% lege ruimte onder de
  grondlijn. De doos neemt nu de vrije ruimte tussen het vinkje en het getal in
  (was vast max 210 px breed), en het canvas schuift 11,5% omlaag zodat het
  gebouw op het getal staat in plaats van erboven te zweven. Gemeten in de
  pop-up met 60 kavels + winkels:
  - 1280 x 900: grootste tekening **242 px** hoog (was max 180 px), geen schuifbalk;
  - 1280 x 720: 116 px, geen schuifbalk. De vorige versie was daar groter, maar
    liet het paneel 22 px scrollen — ze paste dus niet.
- **Copy van stap 2:** "Wat speelt er in jullie gebouw?" en "Duid aan wat klopt,
  of sla dit gewoon over." Korter dan de vorige, en "speelt" dekt zowel een lift
  als een moeilijke sfeer. De titel staat op het stap-record: een al ingevoegde
  stap houdt zijn oude titel tot je hem in het voorbeeld aanklikt en overtypt.

**1.15.11** — stap 2 met de tekeningen uit brand/thingies, en waarom de labels live onzichtbaar waren.

- **De labels van stap 2 en de teksten van stap 3 stonden live onzichtbaar.** Niet
  door een kleur: in de ruwe HTML die syndicoach.be uitstuurt, ontbraken ALLE
  sluit-tags die als string in het script van de stap stonden (`'</span>'`,
  `'</svg>'` kwamen aan als `''`). De elementen die het script bouwde nestten
  daardoor in elkaar, en elk label belandde in het vinkje, dat op `opacity: 0`
  staat. De markup BUITEN het script kwam wel ongeschonden door, en de
  tekst-vervanger van de plugin is uitgesloten (getest: die laat beide sluit-tags
  staan). Waar het in die WordPress-installatie gebeurt — een filter of een
  beveiligingsplugin — is van buitenaf niet te zien.
  De oplossing zit daarom in de stappen zelf: **de keien en de keuzes staan nu
  als gewone HTML in het bestand, en het script bevat geen enkele sluit-tag
  meer.** Het vinkje en de "+" zijn met CSS getekend. Een eigen kei van de
  bezoeker wordt met `createElement` + `textContent` gemaakt.
  Bijkomend voordeel: de labels zijn nu echte tekst en dus aanpasbaar in het
  voorbeeld van de bouwer. Zolang het script ze bouwde, kon de tekst-vervanger
  er niet bij.
- **Stap 2 gebruikt de tekeningen uit `brand/thingies`** in plaats van
  zelfgetekende icoontjes, via `https://link.openvme.be/assets/brand/thingies/`,
  op dezelfde manier als de gebouwen in stap 1. Alle dertien bestaan (gecontroleerd,
  HTTP 200). Let op: het afvallokaal heet `thingies_vuilniishok.svg` met dubbel i;
  `vuilnishok` geeft 404.

  | waarde | label | tekening |
  |---|---|---|
  | `lift` | Lift | lift |
  | `garages` | Garages of parking | parkeermeter |
  | `gemeenschappelijke_tuin` | Gemeenschappelijke tuin | tuin |
  | `meerdere_ingangen` | Meerdere ingangen | traphal |
  | `verouderde_installaties` | Verouderde installaties | verwarming |
  | `moeilijke_sfeer` | Moeilijke sfeer | sfeer |
  | `laadpalen` | Laadpalen | laadpaal |
  | `zonnepanelen` | Zonnepanelen | zonnepaneel |
  | `fietsenstalling` | Fietsenstalling | fietsenstalling |
  | `afvallokaal` | Afvallokaal | vuilniishok |
  | `brandveiligheid` | Brandveiligheid | brandslang |
  | `reservefonds` | Reservefonds | spaarvarken |
  | `sleutels_badges` | Sleutels en badges | sleutel |

  `dakterras` is weg: dat had ik er zelf bijgezet, en er is geen tekening voor.
- **Gedrag van een kei:** in rust alleen de tekening. Bij aanwijzen groeit hij
  met anticipatie (eerst een tikje in, dan voorbij zijn maat, dan terugveren) en
  verschijnt het label eronder. Gekozen blijft hij groot, met label, vinkje en
  een rand in de leesbare merkkleur. Op een scherm zonder muis staan de labels
  altijd — daar bestaat "aanwijzen" niet. Het gekozen vlak is een ZACHTE mint en
  geen volle: de tekeningen zijn zelf in mint en donkerblauw getekend.
- **De wolk staat verticaal gecentreerd** tussen de uitleg en de knoppen, en de
  keien zweven rond hun midden (−2 tot +2 px) in plaats van omhoog, zodat een rij
  recht blijft staan. Het label hangt onder de kei zonder zelf plaats in te nemen:
  verschijnen doet de wolk niet verspringen.
- **"Voorbeeld invoegen" vult nu ook de titel en de sleutels in** (als die velden
  nog leeg zijn). Een ingevoegde stap begon anders zonder titel, terwijl de stap
  ervoor er een had. Voorstellen: "Wat is er allemaal in jullie gebouw?" (geen
  sleutels — niets kiezen mag) en "Hoe wordt je appartement momenteel beheerd?"
  (`huidig_beheer`). Zie `Mymmo_Forms_Steps::example_meta()`.

**1.15.10** — de agenda en de schuifbalk in de donkere merkkleur, en geen streepjes meer.

- **Het kopblok van Calendly is weg** (logo, naam van het gesprek, duur):
  `hide_event_type_details=1`. Gemeten op hun eigen pagina: het verdwijnt
  volledig, zonder een leeg vlak achter te laten. Een beheerder die die
  parameter zelf in de link zet, wint nog steeds.
- **De agenda krijgt de LEESBARE merkkleur, niet de felle.** Gemeten met
  `primary_color=0369a1`: dagcijfer `rgb(3,105,161)`, vlak van een beschikbare
  dag `rgb(240,246,251)`, gekozen dag vol donkerblauw met wit cijfer, tijdstippen
  in donkerblauwe tekst en rand. De kleur wordt gekozen uit het PAAR van het merk
  — de accentkleur en de tekst die erop staat, elk uit dezelfde cascade als de
  rest van het venster — en daarvan wint de leesbaarste op wit. Bij Syndicoach
  `#99f6e4` + `#0369a1` → `#0369a1`. **Er wordt niets omgerekend**: de functie
  uit 1.15.7 die een kleur donkerder maakte (en `#0c846d` opleverde, een groen dat
  in geen palet stond) is weg.
- **Wat hier NIET kan, en waarom.** De agenda is Calendly's eigen iframe van
  calendly.com. Onze CSS komt daar niet in, dus `.booking-kit_*`-regels zijn niet
  vanaf de site te zetten. Concreet:
  - het dagcijfer kan niet **zwart** met een **mint** vlak: het cijfer ÍS
    `primary_color` (`text_color` raakt het niet — getest met `000000`), en het
    vlak is een tint die Calendly er zelf van afleidt;
  - de tijdstippen kunnen niet naast elkaar in een `flex-wrap` en niet breder:
    hun houder staat op `display:block` in dat iframe.
  Wil je die twee echt, dan is de enige weg een eigen datum- en tijdkiezer
  tegen de Calendly-API in plaats van hun widget. Dat is een apart bouwwerk.
- **`--mf-accent-ink`**: nieuwe CSS-variabele op de wikkel, met die leesbare
  merkkleur. Voor alles wat op een lichte achtergrond GELEZEN moet worden. De
  schuifbalk van `gebouwgrootte` gebruikt ze nu voor het getal en de knop — die
  stonden sinds 1.15.7 in mint (`--mf-accent`), een getal van 32px in mint op
  wit. **Een stap die al in WordPress bewaard staat, is een kopie**: plak het
  voorbeeld opnieuw, of zet in je eigen stap `--sc-blue:
  var(--mf-accent-ink, var(--mf-accent))`.
- **De streepjesbalk boven een stappenreeks is weg**, op vraag. De teller
  ("Stap 1 van 3") blijft. `mymmo-forms-steps.js` hoefde niet mee: het zoekt nog
  naar de bolletjes, vindt er geen, en slaat dat over.

**1.15.9** — een reeks is geordend, dus de bouwer laat je hem nu ook schikken.

- **Je kon in de bouwer maar één stap kiezen.** "Derde tabblad: stappen" was een
  gewone dropdown met daaronder de hint "Meerdere reeksen? Typ ze met een komma
  in de shortcode". De bouwer kon dus niet wat de shortcode wél kon, en wie het
  toch probeerde moest de namen uit het hoofd kennen — ze stonden nergens op dat
  scherm. Nu is het een lijst: kiezen uit een dropdown zet de stap onderaan, en
  met ↑ ↓ × schik je ze of haal je ze weg. Een stap die al in de reeks staat,
  verdwijnt uit de keuzelijst (twee keer dezelfde stap levert twee keer dezelfde
  veld-id's op en wordt toch overgeslagen).
- **Waarom geen `<select multiple>`:** `steps="a,b"` en `steps="b,a"` zijn twee
  verschillende formulieren. Een meervoudige keuzelijst geeft je de volgorde van
  de OPTIES terug, niet die van je keuzes — precies wat hier telt kan ze dus niet
  uitdrukken.
- **De stappen vóór HET formulier stonden helemaal niet in de bouwer.** Alleen het
  derde tabblad had een veld; `steps` moest je met de hand in de shortcode typen.
  Er staat nu een kiezer voor, in de groep "Formulier", en die geldt voor allebei
  de soorten — een reeks kan net zo goed gewoon op een pagina staan als in een
  venster.
- **Een stap die niet (meer) bestaat blijft in de lijst staan**, met de melding
  erbij en in het rood. Stil weghalen zou een reeks kapotmaken zonder dat iemand
  het ziet, en de shortcode kan van een andere site komen waar die stap wél
  bestaat.
- Bijkomend gevolg: een bewaarde **opstelling met meerdere stappen laadt nu
  correct terug**. Het veld was een `<select>`, en een waarde die niet als optie
  bestond (`"a,b"`) werd door de browser stil op leeg gezet.

**1.15.8** — twee nieuwe stappen, en de agenda-kleur is weer van jou.

- **De kleur van de agenda wordt niet meer omgerekend.** In 1.15.7 maakte de
  plugin de accentkleur donkerder tot ze 4,5:1 haalde. Dat leverde `#0c846d` op:
  een kleur die in géén enkel merkpalet staat. Weg. Er is nu een expliciet
  attribuut `calendly_color`; zet je niets, dan krijgt Calendly gewoon je
  accentkleur — dezelfde die de knoppen in het venster hebben.
- **Waarom "fel vlak met zwarte cijfers" niet kan** (gemeten op hun eigen
  boekingspagina, niet aangenomen). Met `primary_color=99f6e4`:

  | wat | waarde |
  |---|---|
  | beschikbare dag, achtergrond | `rgb(240,247,245)` — een tint die Calendly zelf afleidt |
  | beschikbare dag, cijfer | `rgb(153,246,228)` — **exact** `primary_color` |

  `text_color` raakt dat cijfer niet (getest met `000000`). Het cijfer Ís dus de
  kleur die je meegeeft, en de achtergrond is een lichte afgeleide daarvan. Een
  lichte merkkleur geeft daardoor een licht cijfer op een licht vlak. Wil je het
  leesbaar, zet dan met `calendly_color` een donkerdere kleur úit je eigen palet
  (bij Syndicoach bv. `14b8a6` of `0369a1`). Dat is een merkkeuze, geen formule
  — vandaar een attribuut en geen berekening.
- **Twee nieuwe voorbeeldstappen**, allebei in de keuzelijst bij Instellingen
  → Stappen:
  - **`gebouwkenmerken`** — een wolk zwevende keien met lijntekeningen: lift,
    garages, gemeenschappelijke tuin, meerdere ingangen, verouderde
    installaties, moeilijke sfeer, laadpalen, dakterras. Meerdere mag, niets
    aanduiden ook. De bezoeker kan er met de "+"-kei zelf een bijzetten; die komt
    als vrije tekst in dezelfde waarde. Levert `gebouw_kenmerken`
    (komma-gescheiden). **Laat "Levert deze sleutels" leeg** — niets aanduiden is
    een geldig antwoord, en anders blijft "Volgende" uit.
  - **`huidig-beheer`** — vier keuzes met een tekening: niet echt beheerd /
    professionele syndicus / vrijwillige syndicus / hadden er een, nu niet.
    Levert `huidig_beheer`. Deze is bedoeld als verplicht: zet `huidig_beheer`
    wél in "Levert deze sleutels".
  Allebei: bediening met het toetsenbord (de beheer-stap met de pijltjes, zoals
  keuzerondjes horen te werken), herstel van de keuze na een mislukte inzending,
  en beweging die uitgaat bij `prefers-reduced-motion`.
- **Wat er op de accentkleur staat, komt uit `--mf-accent-text`** — de inkt die
  de site zelf op haar knoppen zet. Een vaste kleur kiezen werkt op een site met
  een lichte accentkleur en op een site met een donkere niet, en dat merk je pas
  als die tweede site het meldt.
- Vergeet de **verborgen velden** niet in de Operations Manager: `gebouw_kenmerken`
  en `huidig_beheer`. Zonder die velden kan de bezoeker gewoon verder, maar
  bereikt de waarde Odoo niet — dat staat als melding boven het formulier voor
  wie is ingelogd als beheerder.

**1.15.7** — de agenda werd onleesbaar van onze eigen kleur.

- **De beschikbare dagen in Calendly waren niet te lezen.** Sinds 1.15.6 volgt de
  agenda de basiskleur van de site, en dat is hier een lichte turquoise
  (`#99f6e4`, contrast 1,26 op wit). Calendly gebruikt die ene kleur voor TWEE
  dingen tegelijk: het bolletje van een beschikbare dag — daar als lichte tint
  van — én het dagnummer erin. Die twee kan je in hun embed niet los instellen
  (`primary_color` is de enige knop, naast achtergrond en tekstkleur), en hun
  widget staat in een iframe van een ander domein, dus onze CSS komt er niet bij.
  Resultaat: een bijna-wit cijfer op een bijna-wit bolletje.
  De kleur die naar Calendly gaat wordt nu DONKER GENOEG gemaakt om tekst van te
  zijn: in HSL zakt alleen de lichtheid, tot ze op wit 4,5:1 haalt (WCAG AA). De
  tint blijft dus dezelfde turquoise. Voor deze site: `#99f6e4` → `#0c846d`
  (contrast 4,63). Een kleur die het al haalt, blijft ongewijzigd — `#2563eb` en
  `#0369a1` gaan er onveranderd door.
  Let op: dit geldt alleen voor de agenda. De knoppen en accenten in het venster
  houden de merkkleur zelf; die dragen geen tekst in die kleur.
- **De voorbeeldstap erft de kleuren van het formulier.** Hij had eigen waarden
  uit de rekenmodule waar hij uit komt, waardoor de hulpregel van stap 1 in
  `#6b8697` stond en dezelfde regel bij het formulier in `#6b7280` — net genoeg
  verschil om als slordig te lezen, en die eerste haalt op wit geen AA (3,83
  tegen 4,83). `--sc-ink`, `--sc-muted`, `--sc-blue` en `--sc-line` volgen nu
  `--mf-text`, `--mf-muted`, `--mf-accent` en `--mf-border`, met de oude waarde
  als terugval voor wie de stap los gebruikt.
- **`.mymmo-stap-tekst` is exact `.mymmo-form-help`** (0,85rem in plaats van
  0,87rem). Twee maten die een paar tienden van elkaar liggen, lezen als een
  slordige kopie en niet als een keuze.

**1.15.6** — stap 1 en stap 2 zien er hetzelfde uit, en je kan de copy typen waar je ze ziet.

- **Een stap sleepte zijn eigen lettertype mee.** De voorbeeldstap kwam uit een
  losstaande rekenmodule en had een systeemstack (`-apple-system, ... "Segoe UI"`)
  op zijn wikkel staan. Naast een formulier dat de letter van de site erft, zie je
  dat meteen: op syndicoach.be stond de tekst van stap 1 in Segoe UI en die van
  het formulier in Rethink Sans. De plugin dwingt nu `font-family: inherit` af op
  de wikkel van een stap (twee klassen, dus het wint ook van de `<style>` van de
  stap zelf). Wil een stap ergens echt een andere letter, dan wint ze met twee
  klassen — en dat is dan een bewuste keuze.
- **De laatste stap kan nu een titel en een regel eronder hebben**
  (`form_title` / `form_sub`). Zonder die kop begint stap 2 abrupt met een
  invoerveld terwijl stap 1 een titel had, en dan lijkt het alsof er iets
  ontbreekt. Ze gebruiken exact dezelfde klassen als de titel van een stap
  (`.mymmo-stap-titel` en het nieuwe `.mymmo-stap-tekst`), zodat er geen tweede
  stijl bestaat die uit de pas kan lopen. Een HTML-stap heeft die regel nu ook,
  als veld "Regel onder de titel" bij Stappen.
- **Teksten van een stap pas je aan IN het voorbeeld.** Klik in de bouwer op een
  titel, een regel uitleg of een label in een stap en typ. Het wordt meteen
  bewaard — niet in de HTML van de stap, maar ernaast, als `origineel => nieuw`.
  Gevolgen, en alle drie bedoeld:
  - **Laad je het bestand opnieuw in, dan grijpt je copy weer.** Dat was de reden
    om het zo te doen: de code van een stap wil je kunnen vervangen zonder je
    teksten kwijt te raken. Wijzigt het bestand die zin wél, dan valt de
    aanpassing vanzelf weg — de nieuwe tekst uit het bestand wint.
  - **De aanpassing hoort bij de STAP.** Staat dezelfde stap in een tweede
    formulier, dan staat je copy daar ook. Wil je per plaatsing iets anders, maak
    dan een tweede stap.
  - **Dezelfde zin die twee keer in de stap staat, verandert twee keer.** De
    sleutel ís de tekst.
  Wat er bewaard staat zie je bij Instellingen → Stappen, met een knop om alles
  in één keer weg te halen. Attributen, `<script>` en `<style>` worden nooit
  aangeraakt, en een getal (de teller naast een schuifbalk) is niet bewerkbaar —
  dat zou een zin opleveren die bij de volgende beweging weer weg is.
- **Calendly kreeg onze kleur niet mee als je de basiskleur gebruikte.** De
  kleur die de agenda meekrijgt kende twee lagen — wat er op de shortcode stond
  en het thema van het formulier uit de OM — maar niet de derde: het thema van
  DEZE site. Zette je `accent="#..."`, dan kleurden de bolletjes van de
  beschikbare dagen netjes mee; gebruikte je gewoon de basiskleur, dan kreeg
  Calendly niets door en viel het terug op zijn eigen lichtblauw. Nu dezelfde
  drie lagen in dezelfde volgorde als de rest van de stijl.

**1.15.5** — het thema van de site won van de plugin, op vier plekken.

Alle vier dezelfde oorzaak, en geen ervan was zichtbaar in een voorbeeld zonder
thema: een blokthema zet globale stijlen voor `ol`, `input` en knoppen, en die
selectors wegen zwaarder dan de losse klassenamen van deze plugin. `:not()` telt
mee voor de specificiteit — `ol:not(.wp-block-comment-template)` is (0,1,1) en
wint dus van `.mymmo-stappen-voortgang` (0,1,0) — en `[type="submit"]` is (0,1,0),
dus even zwaar, waarna de VOLGORDE beslist: WordPress drukt de stijlen van het
thema inline in de `<head>` af, ná de stylesheets van een plugin. Gemeten op
syndicoach.be.

- **De streepjes van de voortgangsbalk waren onzichtbaar.** Het thema zet
  `ol { display:flex; flex-direction:column }`. Wij zetten wél `display:flex`
  maar noemden de RICHTING nooit — en wat je niet noemt, kan een thema invullen.
  De segmenten groeiden daardoor in de hoogte (de balk heeft er geen, dus 0px) en
  stonden horizontaal gecentreerd op hun eigen breedte: ook 0. De balk zelf stond
  er wel, 4px hoog: dat was de `gap` tussen twee onzichtbare segmenten.
  `flex-direction: row` staat er nu bij.
- **De schuifbalk leek een langgerekte schakelaar.** De globale veldstijl van een
  thema zondert checkbox, radio, submit, reset en button uit — maar geen
  `range`. De schuifbalk kreeg dus de opvulling (9px 10px) en de rand van een
  tekstveld, en met `box-sizing: border-box` blies dat haar hoogte van 4px op tot
  20px. De plugin zet opvulling en rand nu terug voor elke schuifbalk in een
  stappenreeks; een stap-auteur kan niet elk thema kennen.
- **De verzendknop was kleiner dan de "Volgende" van een stap** (14px/700,
  10px 16px, radius 6) omdat `[type="submit"]` van het thema wint van
  `.mymmo-form-submit`. De "Volgende" is een `<button type="button">` en werd
  niet geraakt — vandaar twee knoppen van verschillende hoogte in hetzelfde
  venster. Allebei nu 16px/600, 12px 26px, radius 10, 50px hoog.
- **De invoervelden stonden op de lettergrootte van het thema** (14px) in plaats
  van die van het formulier (16px), terwijl een `<textarea>` — daar is de
  selector maar (0,0,1) — wel onze maat hield. Twee maten in hetzelfde
  formulier.

De aanpak is overal dezelfde: één klasse erbij (`.mymmo-form-wrap` resp.
`.mymmo-stappen`) zodat onze regel (0,2,0) weegt, en zetten wat we bedoelen in
plaats van het over te laten. Nog steeds nergens `!important`: wie deze velden
écht anders wil, wint nog altijd met een eigen regel of met de `--mf-`variabelen.

**1.15.4** — één opvulling in het venster, en ze staat vast.

- **Een stap stond verder van de rand dan een formulier.** Er waren TWEE
  opvullingen: die van het paneel (het tabblad) en die van de wikkel eronder
  (`--mf-pad-x/y`, uit `padding_x`/`padding_y` op de shortcode of uit het thema
  van het formulier in de OM). Voor een formulier haalde het venster die tweede
  er weer af, voor een stappenreeks niet — dus telde ze daar op. Met
  `padding_x="16px"` stond dezelfde inhoud op het ene tabblad 28px van de rand
  en op het andere 44px. Dat zie je niet zolang je één tabblad tegelijk bekijkt,
  en precies daarom bleef het staan.
- **Nu één waarde, op één plek, voor allebei**: `.mymmo-modal-paneel` in
  `mymmo-forms-modal.css`. 40px vanaf 900px, 32px daaronder, 24px op een telefoon
  (daar zou 40px aan elke kant op 375px geen 300px overlaten om in te typen).
  Formulieren zijn daarmee ruimer dan voorheen — dat is de bedoeling: ze zijn
  gelijkgetrokken met de stappen, niet omgekeerd.
- **`padding_x` / `padding_y` bestaan niet meer.** Niet op de shortcode, niet in
  de bouwer (de twee schuifjes en de twee tekstvelden zijn weg), niet in een
  bewaarde opstelling, en niet in het thema dat de OM meestuurt. Een bestaande
  shortcode met dat attribuut blijft gewoon werken; het doet alleen niets meer.
  `gap` (de ruimte TUSSEN de velden) blijft wel instelbaar — dat is een andere
  vraag, en ze telt nergens dubbel.
- **Een stap brengt geen eigen opvulling mee.** Dat stond al zo in de uitleg bij
  de voorbeelden ("geen eigen kaartje, geen eigen kop"), maar er stond nergens
  bij dat de RUIMTE ook van de plugin komt. Nu wel — zie de projectregels.

**1.15.3** — de stap vult het vlak van de pop-up.

- **De knop stond halverwege een half leeg vlak.** Met tabbladen heeft het
  venster een VASTE hoogte (780px), maar de stap erin was zo hoog als haar
  inhoud. Daaronder bleef een strook wit staan waar niets gebeurde, en de
  "Volgende" zweefde ergens in het midden. De ketting paneel → stappenwikkel
  → stap → inhoud is nu een kolom die de ruimte inneemt, en de knoppenrij
  staat tegen de onderrand — binnen de opvulling van het paneel, dus de marge
  blijft. Geldt ook voor de verzendknop van het formulier, met en zonder
  stappenreeks.
- **Past het niet, dan SCROLT het paneel** in plaats van de inhoud samen te
  persen: flex-shrink staat overal op 0. Op een laag venster wordt de
  `margin-top: auto` gewoon 0 en houdt een padding dezelfde minimumafstand.
- **In een PAGINA verandert er niets.** Daar groeit de reeks met haar inhoud
  mee, dus er is geen vrije ruimte te verdelen.
- **De voorbeeldstap zet zijn bediening onderaan.** De vraag en het vinkje
  blijven bovenaan bij de titel staan; de tekening, het aantal kavels en de
  schuifbalk zakken naar de knop toe. Een stap doet dat zelf, met
  `margin-top: auto` op het blok dat naar beneden moet — de plugin bepaalt
  alleen dat er ruimte te verdelen IS. Een stap die al in WordPress bewaard
  staat, krijgt dit dus niet vanzelf: voeg die regel toe, of voeg het
  voorbeeld opnieuw in.

**1.15.2** — de opvulling lekte naar het venster, en de voortgangsbalk.

- **`padding_x` / `padding_y` verzetten meer dan het formulier.** Dezelfde twee
  variabelen (`--mf-pad-x/y`) bedienden DRIE dingen: het formulier, de
  stappenwikkel en het PANEEL van de pop-up. Gaf je je formulier wat lucht, dan
  schoof het hele paneel mee — en erger: dat paneel heeft opvulling die met de
  schermbreedte meebeweegt (16 / 22 / 28 px), en die werd platgeslagen tot jouw
  ene waarde. Vandaar dat de opvulling bij een andere breedte of na een herlaad
  versprong. Het paneel heeft nu zijn eigen `--mf-panel-pad-x/y`;
  `padding_x`/`padding_y` gaan weer over het formulier, zoals de naam zegt.
- **Een tabkop zonder regeltje eronder wordt gecentreerd.** In de zijkolom stond
  het icoon uitgelijnd op de eerste regel — juist als er een regeltje volgt, maar
  zonder regeltje bleef er ruimte onder de titel open alsof er nog iets kwam.
- **De voortgangsbalk is een balk geworden.** Losse streepjes van 28 en 44 px
  lazen bij twee stappen als twee toevallige lijntjes. Het zijn nu even brede
  segmenten die samen de breedte vullen. Ze staan bovendien vast links: een thema
  dat `ul`'s centreert (`margin: auto`) zette ze eerder midden boven het paneel,
  los van de tekst eronder.
- **De schuifbalk van de voorbeeldstap is slanker** (spoor 6 → 4 px, knop 24 →
  16 px) en het getal erboven wat kleiner, zodat de stap minder hoog is.
- **`voorbeelden/aantal-gebouwen.html` is geschrapt.** Die stap was een
  bedachte demo die niemand nodig had; `gebouwgrootte.html` is het echte
  voorbeeld. Staat hij nog in je Stappen-lijst, dan blijft hij gewoon werken —
  de HTML zit in de database, niet in dit bestand.

**1.15.1** — de stap brengt geen eigen omlijsting meer mee.

- **De kop stond er twee keer.** De titel die je bij een stap typt komt al boven
  de stap te staan, in de stijl van de pop-up; de meegeleverde voorbeeldstap had
  daarnaast zijn eigen kop in de HTML. Die tweede was niet uit te zetten zonder
  de HTML te bewerken. De voorbeelden hebben nu geen eigen kop, geen eigen wit
  kaartje en geen eigen randen meer: de plugin levert de omlijsting, de stap
  levert de vraag en het bedieningselement.
- **Geen schuifbalk meer naast een stap die past.** De tekening had een vaste
  hoogte van 230px; samen met het kaartje eromheen duwde dat het paneel over
  zijn grens. Ze krimpt nu mee met de hoogte van het scherm.
- **Het tabblad dat bovenaan staat, is ook het tabblad dat openstaat.** `tab`
  stond vast op "form", dus zette je met `tab_order` de agenda vooraan, dan ging
  het venster alsnog open op het formulier — je zag een knoprij waarvan de
  tweede knop actief was. Leeg laten betekent nu: het bovenste. Wie wel een vast
  tabblad wil, typt `tab="..."` en dat wint nog steeds.

**1.15.0** — een derde tabblad in het venster, en de volgorde is instelbaar.

Het venster had twee vaste tabbladen (formulier en agenda). Er kan er nu een
DERDE bij, met een eigen formulier en een eigen stappenreeks: zo staat naast
"Stuur ons een bericht" en "Plan een gesprek" bijvoorbeeld "Bereken je offerte",
dat de bezoeker eerst door een paar schermen leidt. Het bestaat zodra je er een
stappenreeks of een eigen formulier voor kiest; tot dan verandert er niets.

De volgorde van de tabbladen zet je met pijltjes in de bouwer (attribuut
`tab_order`, bv. `tab_order="extra,form,calendly"`). Wat je niet noemt schuift
achteraan aan, en tabbladen die er niet zijn worden overgeslagen — een typefout
kan dus nooit een venster zonder tabbladen opleveren.

Nieuwe attributen: `extra_slug`, `extra_steps`, `tab_extra`, `tab_extra_sub`,
`tab_order`. Ze staan ook in de bouwer en in een bewaarde opstelling.

Verder in deze versie:

- **De tekening in de bouwer kan naar achteren.** Op een pagina staat ze achter
  de tekst en het witte kaartje; in de bouwer stond ze altijd vooraan, want
  anders kan je ze niet aanwijzen om ze te verplaatsen. Dat verschil zag je pas
  op de site. De knop "Tekening achteraan" naast Desktop/Telefoon zet ze op haar
  echte laag — en dan is ze, net als op een pagina, ook niet meer vast te pakken.
- **Onder water is het venster herschreven van twee vaste blokken HTML naar één
  lijst en één lus.** Met een derde tabblad erbij zou dezelfde knop anders drie
  keer in het sjabloon staan. Aan de HTML die een bezoeker krijgt is bij twee
  tabbladen niets veranderd; de rendertest klinkt dat vast.
- Elk paneel krijgt een eigen id-voorvoegsel, ook als er twee keer hetzelfde
  formulier in staat. Zonder dat wijst elk `<label>` in het tabblad dat je niet
  open hebt staan naar het verkeerde invoerveld — niet te zien, wel stuk.

**1.14.0** — stappen: een formulier kan meerdere schermen krijgen.

Een nieuw attribuut `steps="..."` op `[mymmo_form]` en `[mymmo_form_button]`.
Daarvoor komen eigen stukken HTML te staan — met CSS en JavaScript — die elk een
of enkele waarden verzamelen en in de **verborgen velden** van het formulier
zetten. Het formulier is de laatste stap; bij het versturen gaat alles in
dezelfde POST. Werkt in de pagina én in de pop-up.

Je schrijft ze op het nieuwe tabblad **Stappen**, achter `unfiltered_html` —
hetzelfde recht als voor een Custom HTML-blok. Dat is bewust: de Operations
Manager serveert hetzelfde formulier aan meerdere sites, dus vrije JavaScript
mag daar niet vandaan komen. Van elke stap blijft één vorige versie bewaard.

Verder in deze versie:

- Twee voorbeeldstappen die je met één knop in de editor zet. "Aantal gebouwen"
  is de kale demo van het contract: een schuifbalk met een meegroeiende skyline
  die `aantal_gebouwen` aflevert. "Grootte van het gebouw" is de eerste stap van
  de Syndicoach-calculator, uit dat bestand losgemaakt: dezelfde tekeningen, de
  squash-and-stretch bij een niveauwissel en het commercieel-vinkje, en levert
  `aantal_kavels` plus `commerciele_kavels` af. Wat er NIET in zit is het
  "podium" van de calculator — de zwevende laag waarop zeven stappen één
  tekening delen; hier staat de tekening gewoon in de stap.
- Een stap herstelt zijn eigen bediening na een MISLUKTE inzending. De waarden
  komen terug in de verborgen velden, maar de HTML van de stap is statisch en
  staat weer op haar beginstand — zonder herstel ziet een bezoeker 8 staan
  terwijl hij 42 koos, en verstuurt hij de verkeerde waarde. De meegeleverde
  voorbeelden doen dit; een eigen stap leest daarvoor `api.lees(sleutel)`.
- `data-mymmo-waarde="sleutel"` op een gewoon invoerveld volstaat; JavaScript is
  alleen nodig voor een stap die iets anders is dan invoervelden.
- Zonder JavaScript vallen de HTML-stappen weg en staat het formulier er meteen
  (via `<noscript><style>`, zodat er niets flikkert voor wie JS wél heeft).
- "Vorige" van de laatste stap staat IN de knoppenrij van het formulier, naast
  de verzendknop, en niet in een tweede rij eronder.
- De stijlcascade (thema van het formulier → thema van de site → wat er op de
  shortcode staat) zit nu in één functie, `mymmo_forms_wrap_style()`, omdat er
  twee wikkels zijn die ze nodig hebben. Aan de volgorde is niets veranderd.
- Drie nieuwe teksten in de berichtencatalogus van de Operations Manager
  (`back`, `next`, `step_of`), met een Nederlandse terugval in de plugin zodat
  de knoppen ook een naam hebben zolang die payload nog niet uitgerold is.

**1.13.1** — drie correcties op het slepen en de stapeling.

- **De tekening stond vóór de tekst en het witte kaartje, en hoort erachter.**
  In 1.13.0 had ik de zijkolom opgetild met een `z-index` om te voorkomen dat de
  tekening werd afgeknipt — maar dat afknippen kwam van `overflow-y: auto`, en
  dat was al apart opgelost. De optilling is weg en de figuur staat nu op
  `z-index: -1`: achter de tekst van de zijkolom en achter het kaartje, maar nog
  altijd vóór de achtergrond van het venster. In de bouwer wordt die laag
  tijdelijk naar voren gehaald, anders kan je ze niet vastpakken.
- **Het stippelkader bleef staan terwijl het beeld wegschoof.** De verschuiving
  zat op de `<img>`, de omlijning en de greep op de wikkel eromheen — en die
  wikkel draagt de overgang tussen de tabbladen, dus daar kon de verschuiving
  niet bij: twee transforms op één element overschrijven elkaar. Er zit nu een
  laag tussen die de verschuiving en de schaal draagt, en daar hangen de
  omlijning en de grepen aan. Gemeten: een sleep van 40,−10 verplaatst het kader
  precies mee.
- **Vier grepen in plaats van één.** Met er één in de rechterbenedenhoek viel die
  na een verplaatsing naar links of naar boven buiten beeld, en dan kon je niet
  meer schalen zonder eerst terug te slepen. Elke hoek schaalt nu, met de juiste
  richting: naar buiten is groter, ook aan de linkerkant.

**1.13.0** — de tekeningen versleep je in het voorbeeld, en ze verdwijnen niet
meer achter de rest.

- **De tekening stond achter de tekst en het formulier.** Twee oorzaken die
  samenvielen: de zijkolom was een scrollgebied (`overflow-y: auto`), en dat
  knipt ook horizontaal af — een tekening die je groter schaalde dan de kolom
  verdween aan de rand. En zonder `z-index` werd ze overschilderd door het witte
  kaartje ernaast, dat later in de HTML komt. De zijkolom knipt nu niet meer en
  ligt erboven; het venster zelf heeft nog altijd `overflow: hidden`, dus buiten
  het venster komt er niets.
- **Schaal en verschuiving werkten niet door in het voorbeeld.** Het live
  toepassen zat alleen in de afhandeling van de opvullingsschuifjes, dus aan de
  schaal van een tekening draaien deed zichtbaar niets — de shortcode veranderde
  wel. Elke wijziging past de variabelen nu meteen toe. Je kan niets precies
  positioneren wat je niet ziet bewegen.
- **Slepen in het voorbeeld.** Pak een tekening of het watermerk vast en
  verplaats het; de greep in de rechterbenedenhoek schaalt. Met de pijltjes gaat
  het per pixel, met Shift per tien. De invoervelden blijven de opslag — slepen
  schrijft daarin, zodat de shortcode en wat je ziet niet uit elkaar kunnen
  lopen.
  De coördinaten komen uit het iframe zelf: het voorbeeld is daar visueel
  verkleind, en een beweging gemeten in de ouderpagina zou de tekening trager
  laten lopen dan je hand.
- **`watermark_rotate`**: het watermerk kan draaien. Het zit daarvoor in een
  eigen wikkel, zodat schaal, verschuiving en draaiing in één transform staan —
  en zodat er een greep in kan; in een `<img>` kan dat niet, die heeft geen
  kinderen.

**1.12.0** — beweging bij het openen en sluiten, een tekening per tabblad, een
watermerk, en kleur voor de iconen.

- **Het venster ploft niet meer open.** Openen gebruikt een easing die licht
  doorschiet en start net iets te klein; daardoor leest het als iets dat naar je
  toe komt in plaats van iets dat verschijnt. Sluiten gaat sneller en zonder
  overschot — iets dat weggaat hoort niet te aarzelen. Op een telefoon schuift
  het venster van onder in beeld, zoals een blad; schalen ziet er op die maat uit
  als een haperende pagina.
  Het sluiten vroeg iets van het script: het venster blijft nu staan tot de
  beweging klaar is. Met een tijdslimiet ernaast, want `animationend` komt niet
  bij `prefers-reduced-motion` of op een tabblad op de achtergrond — en een
  venster dat dán open blijft staan is een veel ergere fout dan een sprongetje.
- **Een tekening per tabblad**, met een overgang ertussen. Ze liggen in dezelfde
  rastercel over elkaar, dus de hoogste bepaalt de hoogte en er springt niets bij
  het wisselen. Is er voor een tabblad geen eigen tekening, dan blijft staan wat
  er staat: wegfaden naar niets is geen overgang maar een gat.
- **Elke tekening heeft haar eigen schaal en verschuiving.** Ze zijn zelden even
  groot, en dan staat de ene te hoog zodra de andere goed staat. Stel je voor de
  tweede niets in, dan volgt ze die van de eerste.
- **Een watermerk achter de tekening**, verankerd linksonder, ook schaalbaar en
  te verschuiven. Het hangt aan het VLAK en niet aan een van de tekeningen: die
  twee delen dezelfde rastercel, dus het vlak houdt zijn maat en het watermerk
  blijft precies staan terwijl de tekening ervoor verwisselt.
- **`icon_color` en `accent_text`**: de kleur van de vinkjes en de tab-iconen, en
  de tekstkleur op de knoppen. Los van elkaar, want op een gekleurde achtergrond
  wil je de vinkjes soms lichter zonder daarvoor de knoppen mee te veranderen.
- De schaal en verschuiving worden in het voorbeeld **meteen toegepast**, zonder
  opnieuw te renderen — het zijn niets dan CSS-variabelen, en een ronde langs de
  server zou bij elke pijltjesklik het scherm laten flikkeren.
- Alle drie de afbeeldingen hebben een knop naar de **mediabibliotheek**, via één
  gedeelde afhandeling; bij drie losse kopieën zou de derde vroeg of laat net
  iets anders doen dan de eerste.

**1.11.0** — één scrollbalk, en het shortcode-blok ligt niet meer over de
instellingen.

- **Het shortcode-blok stond vast onderaan de rechterkolom (sticky).** Daardoor
  viel de groep die op dat moment openstond er half achter: je zag je eigen
  instellingen niet meer. Het staat nu gewoon ná de groepen.
- **Geen eigen scrollgebied per kolom meer.** Dat gaf drie scrollbalken op één
  scherm en kapte het voorbeeld onderaan af op de hoogte van het venster. De
  PAGINA scrolt nu, één keer, zoals elk ander beheerscherm.
- **En geen sticky voorbeeld.** Dat was de andere kant van dezelfde fout: de ene
  helft van het scherm bewoog, de andere niet, en het leek alsof je niet meer
  naar boven kon.

**1.10.0** — de bouwer geeft je de HERBRUIKBARE shortcode, en de instellingen
zijn een inspecteur geworden in plaats van een handleiding.

- **De belangrijkste fout zat in wat je kopieerde.** Het shortcode-veld toonde
  altijd de volledige versie met alle attributen erin. Wie die op vijf pagina's
  plakte, had vijf losse kopieën — een wijziging aan de opstelling deed daar
  niets meer. Dat is het omgekeerde van waarvoor opstellingen bestaan, en het
  verklaart ook waarom een gewijzigde `gap` of `padding` "niet werkte": de
  pagina droeg nog haar eigen oude attributen. De versie met `preset="..."` stond
  er wel, maar dichtgeklapt onder "Shortcodes en beheer" — precies waar je hem
  niet zoekt.
  Nu is `[… preset="…"]` wat je kopieert zodra er een opstelling open staat, met
  erbij wat dat betekent. De losse kopie blijft bereikbaar achter "Losse versie
  (volgt geen wijzigingen)".
- **Na het bewaren opent die opstelling meteen weer**, zodat het veld de
  herbruikbare vorm toont in plaats van de losse.
- **Vijf groepen in plaats van veertien tabelrijen**: Formulier, Knop, Venster,
  Zijkolom, Na het versturen. Alleen de eerste staat open. Per veld hoogstens één
  korte zin, en alleen waar die een fout voorkomt — de redenering staat hier in
  de README en hoort niet op het scherm van wie een knop maakt.
- **Allebei de kolommen scrollen in zichzelf**, de pagina eronder niet. Eerder
  stond het voorbeeld vast terwijl de pagina scrolde voor de rechterkolom: dan
  beweegt de ene helft wel en de andere niet, en raakt de kop uit beeld.
- **Het versienummer staat in de kop van de bouwer.** Bij een plugin die je met
  de hand bijwerkt is "welke versie draait hier" anders een vraag die pas opkomt
  wanneer iets zich anders gedraagt dan je verwacht.

**1.9.0** — de bouwer scrolt niet meer op en neer, en de velden staan dichter bij
elkaar.

- **Het voorbeeld staat links en blijft staan** terwijl je rechts de
  instellingen aanpast. Ook met de opstellingen bovenaan bleef het ongemak: het
  voorbeeld is hoog, de velden stonden eronder, dus scrolde je voor élke
  wijziging naar beneden om iets te zetten en weer omhoog om te zien wat het
  deed. Onder 1200px staat alles nog onder elkaar — twee kolommen zouden daar
  allebei te smal zijn.
- Het voorbeeld wordt daarvoor **geschaald, niet versmald**: het iframe blijft
  inwendig 1100px breed, want de mediaquery's van het venster kijken naar die
  breedte. Een kolom van 700px zou de smalle weergave tonen en dus liegen over
  hoe het er op een desktop uitziet. Het percentage staat in de werkbalk, zodat
  niemand denkt naar ware grootte te kijken.
- **De extra ruimte onder elk veld is weg.** Een thema zet vaak een marge onder
  élk invoerveld van de site (bij een blokthema
  `margin-block-end: var(--wp--style--block-gap)`), en die regel is specifieker
  dan de onze — in de devtools stonden onze eigen declaraties doorstreept. Onder
  elk veld kwam daardoor ruimte bij bovenop de afstand die het raster al zet.
  Twee keer ruimte dus. Er staat nu een gerichte reset op de verticale marges,
  nog steeds zonder `!important`: kleur, lettertype en randen laten we met rust,
  en wie het écht anders wil wint nog altijd met een eigen regel.
- **`gap="14px"`** zet de ruimte tussen de velden, met een derde schuifje in de
  werkbalk naast de twee voor de opvulling.
- **Een `accent`, `gap` of `padding` op de shortcode werkte niet door in het
  formulier ín het venster.** Die variabelen stonden op de wikkel van het
  venster, maar `.mymmo-form-wrap` declareert dezelfde variabelen zélf — en een
  eigen declaratie wint van een geërfde. De verzendknop hield dus de kleur uit de
  Operations Manager terwijl de knop van het venster wél meekleurde. De stijl van
  de plaatsing gaat nu ook naar het formulier.

**1.8.0** — een eigen bedankscherm met meetbare conversie, een instelbare
achtergrond, en een agenda die op tijd klaarstaat.

- **Conversie zonder bedankpagina.** De plugin vuurt nu zelf
  `mymmo_formulier_verstuurd` en `mymmo_calendly_geboekt` af, in de `dataLayer`
  én als gebeurtenis op `document`, met het pad dat vroeger je bedankpagina was
  in `page_path`. Daarmee blijft hetzelfde doel in GA werken via een virtuele
  pageview in GTM. Zie "Conversie meten zonder bedankpagina".
- **Na een geboekt gesprek blijft de bezoeker hier.** Het venster toont je eigen
  tekst (`thanks_calendly`) in plaats van de bevestigingspagina van Calendly. De
  plugin luistert daarvoor naar het bericht dat hun widget stuurt, en controleert
  de herkomst ervan — elke pagina mag zo'n bericht sturen.
- **De kalender valt niet meer in een scrollbalk.** Calendly meldt hoe hoog haar
  inhoud is (`calendly.page_height`); dat wordt nu overgenomen, zodat het vlak
  meegroeit in plaats van een eigen scrollbalk te krijgen waarin de knop
  "Bevestigen" net buiten beeld valt.
- **De agenda begint eerder te laden.** De verbinding met Calendly wordt geopend
  zodra de pagina rustig is (alleen DNS en TLS, geen gegevens), en het script
  wordt opgehaald zodra iemand de knop aanraakt of aanwijst — óók bij een
  aanraking, want op een telefoon bestaat "erover gaan" niet en begon het laden
  daar pas bij het openen van het venster.
- **`background="#…"`** zet de kleur van het vlak achter het formulier, per
  plaatsing of per opstelling. Leeg blijven betekent een lichte tint van de
  accentkleur, die dus vanzelf met je thema meegaat.
- **Geen scrollbalken meer in het voorbeeld.** Het iframe groeit mee met zijn
  inhoud. Op een pagina hoort het venster te scrollen — het is daar maar 88% van
  het scherm hoog — maar in een ontwerpweergave wil je alles in één keer zien.
- **De opvulling zit in de werkbalk van het voorbeeld**, als twee schuifjes die
  meteen effect hebben zonder te hertekenen. De tekstvelden eronder blijven
  bestaan voor een waarde met een andere eenheid (`1.5rem`, `4%`).
- **De opstellingen staan bovenaan**, met een knop per opstelling om ze te
  openen. Ze stonden onder de tabel met velden, waar je alleen komt als je
  toevallig doorscrolt. De shortcodes en de verwijderknop zitten eronder,
  dichtgeklapt.

**1.7.0** — de indeling van het venster volgt de aanvraagwizard, en de ruimte rond
de velden is instelbaar.

- **De titel staat over de volle breedte**, boven beide kolommen, in plaats van
  bovenaan de zijkolom. Ze zegt waar je bent; dat hoort niet in een van de twee
  kolommen thuis maar erboven.
- **De inhoud is een eigen wit kaartje** op de getinte achtergrond van het
  venster, met een eigen rand en schaduw. Daarmee verdwijnt de verticale
  scheidingslijn tussen de zijkolom en het formulier: de zijkolom staat gewoon op
  die achtergrond, zoals de stappenlijst in de wizard. Op een telefoon gaat het
  kaartje edge-to-edge — daar zou een randje tint rondom alleen ruimte kosten.
- **De verzendknop staat rechtsonder.** Daar kom je uit als je van boven naar
  beneden invult, en daar staat "volgende" in elke wizard. Onder 540px vult hij
  de breedte: uitlijnen is daar geen keuze maar een obstakel.
- **De ruimte tot de rand van het venster staat VAST** (40px op een groot scherm,
  32px daaronder, 24px op een telefoon) en is niet instelbaar. Ze was dat wel, met
  `padding_x`/`padding_y`; zie 1.15.4 hieronder voor waarom dat weg moest. Wat wel
  instelbaar blijft is `gap`: de ruimte TUSSEN de velden.
- **Een venster met zijkolom is nu 880px breed** in plaats van 660. De zijkolom
  nam er 280 van, en wat overbleef was de kolom waarin iemand zijn gegevens typt:
  bij 660px braken de velden daar van twee kolommen naar één terwijl er scherm
  genoeg was. Met een agenda erbij blijft het 1060px.
- De zijkolom wordt alleen nog gerenderd als ze iets te zeggen heeft. Tot nu toe
  stond de titel erin, dus was ze er altijd.

**1.6.0** — bewaarde opstellingen, en een blok voor de blok-editor.

- **Opstellingen.** Wat je in de bouwer maakt, bewaar je onder een naam en zet je
  met `preset="..."` op zoveel pagina's als je wil. Eén wijziging werkt overal
  door. Wat er in de shortcode zelf staat, wint van de opstelling — één pagina
  met een andere knoptekst vraagt dus geen tweede opstelling.
- **Het blok "Mymmo formulier".** Invoegen, opstelling kiezen in de zijbalk, en
  meteen het echte resultaat zien: het blok laat de server renderen, precies
  zoals op de pagina. Het blok bewaart geen HTML in de pagina-inhoud, alleen
  welke opstelling gekozen is — dus geen vastgeroeste kopie en geen
  blokvalidatiefouten bij een wijziging aan de opmaak.
- Het blok kent bewust maar één keuze. De teksten en kleuren horen in de bouwer,
  bij het voorbeeld; twee plekken voor dezelfde instelling betekent raden welke
  gold.
- Opslag in één option, geen custom post type: het zijn er een handvol, ze hebben
  geen revisies, geen auteur, geen permalink en geen zoekindex nodig.
- `preset` kan zelf niet in een opstelling bewaard worden — een opstelling die een
  andere oproept is een ketting die niemand meer kan volgen.
- **Hernoemen maakt een nieuwe opstelling**, bijwerken gebeurt onder dezelfde
  naam. In de eerste versie hiervan nam de bewaking het verkeerde ijkpunt
  (de naam bij de eerste toetsaanslag in plaats van bij het laden), waardoor
  hernoemen stil de geladen opstelling zou overschrijven — op elke pagina waar ze
  stond.

**1.5.0** — het formulier neemt de kleuren van je site over.

De knopkleur kwam uitsluitend uit het thema van het formulier in de Operations
Manager. Op een site met een eigen palet (een blokthema met `theme.json`) stond
de knop van het formulier daardoor in een andere kleur naast de knoppen van de
site — en dat ziet eruit als een fout, niet als een instelling.

- De plugin leest nu `wp_get_global_styles(['elements','button'])` en neemt
  daarvan de achtergrond, de tekstkleur en de hoeken over. Verwijzingen naar het
  palet (`var:preset|color|accent-1` en `var(--wp--preset--color--accent-1)`)
  worden **opgezocht** en als echte kleur doorgegeven: die variabele bestaat niet
  in het voorbeeld van de bouwer, dus doorgeven zou de kleur daar stil laten
  wegvallen. Het palet wordt daarbij in de volgorde default → theme → custom
  samengevoegd, zodat een kleur die in de site-editor is aangepast wint.
- **Het thema van de site wint van de Operations Manager**, en verliest van een
  `accent="#…"` op een losse shortcode. De OM-kleur blijft de terugval voor sites
  die zelf niets declareren.
- Alleen de knop, bewust: de tekst- en achtergrondkleuren van de site overnemen
  geeft bij een donker thema witte labels op witte invoervelden.
- Bij **Instellingen → Mymmo Forms → Verbinding** staat een vinkje om het uit te
  zetten, met daarbij **wat er gevonden is** als kleurstaal. Een vinkje zonder
  die terugkoppeling is een zwarte doos: staat de knop straks verkeerd, dan weet
  je niet of het thema niets declareert of dat wij iets verkeerds lezen.
- Waarden die niet op een kleur of een lengte lijken, komen er niet door —
  dezelfde gesloten controle als bij het thema uit de OM. Deze waarde belandt in
  een `style`-attribuut op de pagina van een bezoeker.

**1.4.0** — de bouwer is een levend voorbeeld geworden in plaats van een tabel
met invoervelden.

Waarom: om te zien wat je gemaakt had, moest je de shortcode kopiëren, op een
pagina plakken, publiceren en kijken — en bij elke correctie opnieuw. Dat is
geen bouwer, dat is een formulier waarvan je het resultaat pas elders ziet. Nu
staat het venster bovenaan het scherm, open, en typ je de teksten erin.

- **Het voorbeeld kan niet liegen.** De HTML komt uit dezelfde aanroep die de
  shortcode op een pagina doet (`wp_ajax_mymmo_forms_preview` →
  `render_button()`), en ze staat in een iframe met precies `mymmo-forms.css`,
  `mymmo-forms-modal.css` en `mymmo-forms-modal.js` — de bestanden van de
  bezoeker, niet een kopie ervan. Er is dus geen tweede weergave die kan
  afdrijven.
- **Typen hertekent het voorbeeld niet.** Een tekstwijziging past één tekstknoop
  aan; opnieuw renderen gebeurt alleen bij een structurele wijziging (ander
  formulier, agenda erbij of weg, afbeelding, kleur, een regel erbij of weg).
  Zou elke toetsaanslag hertekenen, dan springt de cursor weg en flikkert het
  scherm — dezelfde regel als in de mailstudio van de Operations Manager.
- **De invoervelden blijven de opslag.** Het canvas leest ze en schrijft erin
  terug; de shortcode wordt er onveranderd uit opgebouwd. Er is één plek die
  weet welk veld welk attribuut wordt (`attributen()` in
  `mymmo-forms-admin.js`), en zowel de shortcode als het voorbeeld gebruiken
  die. Zouden ze elk hun eigen vertaling maken, dan kan het voorbeeld iets tonen
  dat de shortcode niet oplevert — en dat is erger dan geen voorbeeld.
- **Desktop / Telefoon.** De telefoonweergave is een echte viewport van 390px,
  geen verkleinde desktop: de mediaquery's van het venster kijken naar de
  breedte van het iframe, dus dit is de enige manier waarop het voorbeeld ook
  over mobiel de waarheid vertelt.
- **De kop van het venster is nu in de bouwer te zetten.** Het `title`-attribuut
  kon dat allang, de bouwer kende alleen het vinkje aan/uit.
- **De afbeelding kies je uit de mediabibliotheek** in plaats van een URL over te
  typen.
- **Een lege agendalijst zegt nu waaróm ze leeg is.** Ze viel stil terug op een
  tekstvak, en dan lijkt het alsof de Operations Manager geen agenda's kent —
  terwijl er drie heel verschillende oorzaken zijn, en twee ervan los je daar op
  en niet hier: de koppeling heeft haar boekingspagina nog niet bewaard (open ze
  in de OM, tabblad Calendly, en klik Opslaan), de OM draait nog een versie die
  die lijst niet meestuurt, of de lijst hier is nog de bewaarde versie van
  daarvoor (opnieuw ophalen).
- De kalender van Calendly wordt in het voorbeeld **niet** opgehaald: dat zou een
  verzoek naar een derde partij zijn vanuit een beheerscherm, en wat je hier
  controleert is de indeling. Op die plek staat een regel uitleg.

**1.3.0** — de link naar de agenda is een keuzelijst van de afspraken die de
Operations Manager kent, in plaats van een URL die je overtypt.

Wat er verandert en waarom:

- **`[mymmo_form_button calendly="..."]` verandert NIET.** De shortcode blijft
  precies dezelfde; alleen de manier waarop je hem in wp-admin samenstelt is
  anders. Bestaande pagina’s hoeven dus niet aangepast te worden.
- **Waarom een keuzelijst.** Een getypte Calendly-link is onzichtbaar fout: een
  typfout, of een eventtype dat in Calendly hernoemd werd, geeft een leeg tweede
  tabblad zonder enige foutmelding. En niets garandeerde dat de geplakte pagina
  hoorde bij een afspraak die de Operations Manager ook echt opvangt — een
  boeking daarop belandt dan in het vangnet, of nergens.
- **De lijst komt uit de Operations Manager, niet uit Calendly.** Het zijn de
  Calendly-koppelingen bij Koppelingen, met hun bewaarde boekingspagina. Staat
  een afspraak er niet bij, dan heeft die koppeling nog geen boekingspagina
  bewaard: één keer openen in de Operations Manager en op “Opslaan” klikken
  volstaat.
- **Een koppeling die UITSTAAT blijft in de lijst**, met de vermelding erbij.
  Boeken op zo’n pagina werkt gewoon — er komt alleen niets in Odoo terecht.
  Verbergen zou betekenen dat een net ingestelde afspraak onvindbaar is.
- **Het tekstvak blijft bestaan**, achter de keuze *Andere link*. En is er geen
  enkele gekende afspraak, of was de Operations Manager onbereikbaar, dan staat
  het tekstvak er gewoon zoals vroeger — een knop met venster maken mag nooit
  afhangen van of Calendly hier bekend is.
- **Vraagt geen extra verzoek.** De afspraken komen mee in hetzelfde antwoord als
  de formulierenlijst: één cache, en “Lijst opnieuw ophalen” ververst allebei.

Vereist een Operations Manager die de afspraken meestuurt. Een oudere stuurt ze
niet mee; dan blijft het tekstvak staan en werkt alles zoals in 1.2.0.

**1.2.0** — de pop-up herzien: een zijkolom met een afbeelding, een instelbare
knopkleur, en een manier om het venster aan een bestaande knop te hangen.

Wat er verandert en waarom:

- **Een zijkolom in plaats van een tabbalk.** Het venster was een kopbalk met twee
  grijze tabbladen boven een lijst velden — functioneel, maar het zei een bezoeker
  niets over wat hem te wachten stond. Links staat nu een vaste kolom met de titel,
  een zin, de twee keuzes als kaarten mét een regeltje uitleg, een opsomming die
  geruststelt, en onderaan een afbeelding. Op een telefoon klapt die samen tot een
  kopbalk met dezelfde twee keuzes; afbeelding en opsomming vallen daar weg. Het
  volle scherm op mobiel blijft precies zoals het was.
- **`accent="#..."` op de shortcode.** De knopkleur kwam uitsluitend uit het thema
  van het formulier in de OM. Dat blijft de standaard — één kleur voor elke pagina
  waar dat formulier staat — maar een knop die tussen knoppen van een andere kleur
  terechtkomt kan nu ter plaatse overschreven worden. De kalender van Calendly
  krijgt diezelfde kleur mee (`primary_color`), zodat die niet uit de toon valt.
- **`button="no"` en `trigger="..."`.** Het venster kan nu achter een knop hangen
  die het thema of Elementor al maakte: zet de link van die knop op
  `#mymmo-modal-<slug>`. Dat werkt ook zonder JavaScript (`:target`), en is daarom
  de manier die de voorkeur heeft; `trigger` met een CSS-selector is er voor knoppen
  waarvan je de link niet kan zetten.
- **De kalender werd afgeknepen getoond, en dat had twee oorzaken.** Het venster
  was 640px breed; onder ongeveer 640px schakelt Calendly zelf naar zijn smalle
  weergave en staat de maand ónder de uren. En het tabblad stond op `hidden`, dus
  op het moment dat Calendly de breedte van haar vlak meet, was die nul. De panelen
  liggen nu over elkaar met `visibility:hidden` — dan blijven de afmetingen bestaan
  — en het venster is met een agenda erbij 1060px breed met een vaste hoogte.
- **De kalender laadt vooraf.** Het script wordt opgehaald zodra iemand op de knop
  komt, en de kalender wordt opgebouwd zodra het venster opengaat. Klikken op het
  tabblad toont dus iets dat er al staat, in plaats van een leeg vlak. Bewust niet
  bij het laden van de pagina: dan stuurt élke bezoeker een verzoek naar Calendly,
  ook wie nooit klikt.
- **De omschrijving van het formulier staat in de zijkolom** als je er geen eigen
  `intro` bij typt — en dan niet meer boven de velden, want twee keer dezelfde zin
  onder elkaar leest als een fout.
- `hide_gdpr_banner=1` gaat mee naar Calendly: die balk ging in een venster van
  deze hoogte over de knoppen van de kalender heen, en de site vraagt haar
  toestemming zelf al.
- De shortcode-bouwer bij **Instellingen → Mymmo Forms** kent al deze opties, toont
  het anker dat je in je eigen knop plakt, en houdt dat bij als je een ander
  formulier kiest.

**1.1.0** — een tweede shortcode: `[mymmo_form_button]`. Een knop in de tekst die
een venster opent met twee tabbladen — het formulier, en een Calendly-agenda om
meteen een gesprek te kiezen.

Waarom dit erbij komt: een formulier middenin een pagina is niet altijd de juiste
plek, en wie liever meteen belt of afspreekt had tot nu toe geen weg. De twee
staan nu naast elkaar achter dezelfde knop, zonder dat er een tweede formulier of
een tweede koppeling voor nodig is — het is precies hetzelfde formulier, met
dezelfde mappings naar Odoo.

Verder in deze versie:

- **De herkomst gaat ook naar Calendly.** Dezelfde `utm_*` (URL eerst, dan de
  cookie) plus de bezoeker-UUID. Die worden in de BROWSER opgehaald en niet
  server-side in de HTML gezet: deze pagina kan gecached zijn, en dan zou de UUID
  van de vorige bezoeker meegaan met het gesprek van de volgende. Dat geeft geen
  foutmelding — er komt gewoon een afspraak, aan de verkeerde persoon gehangen.
- **Terugkomen na het versturen.** Een inzending stuurt nu het id van het venster
  mee (`mymmo_anchor`), zodat de bezoeker na de redirect op dezelfde plek
  uitkomt met het venster open. Zonder dat staat hij op een gesloten venster en
  ziet hij zijn bevestiging nooit — terwijl de inzending gewoon binnen is.
- **Twee formulieren op één pagina tonen allebei hun melding.** De bevestiging
  werd tot nu toe opgevraagd door de eerste shortcode op de pagina en daarbij
  meteen verwijderd; een tweede shortcode kreeg niets meer. Ze wordt nu één keer
  gelezen en onthouden, en het anker bepaalt bij wie ze hoort.
- De shortcode-bouwer bij **Instellingen → Mymmo Forms** kan beide shortcodes
  samenstellen.

**1.0.6** — de eerste optie van een keuzegroep (radio/checkbox) sprong soms uit
het veld naar rechts, terwijl de andere opties er wel gewoon onder stonden.

Oorzaak: WordPress-blokthema's zetten in hun globale stijlen vaak
`legend { float: left; width: 100%; }`, zodat een legend als een kop oogt. Die
float haalt de legend uit de normale flow; de browser probeert de EERSTE
volgende rij (de eerste optie) dan nog op dezelfde regel te plaatsen, in wat er
van de regelbreedte overblijft — meestal 0px, waardoor die ene optie buiten het
veld terechtkomt. `public/mymmo-forms.css` zet nu expliciet `float: none` op de
legend (via `.mymmo-form-group .mymmo-form-label`, dat wint zonder
`!important` van de kale `legend`-selector van het thema).

**1.0.5** — (geen changelog-item geregistreerd bij deze release).

**1.0.4** — meertalige formulieren en eigen foutmeldingen.

Een formulier kan nu in het Nederlands, Frans en Engels bestaan. Eén formulier,
niet drie: de veldnamen en de keuzeWAARDEN blijven in alle talen identiek, dus
je houdt één koppeling en één set veldkoppelingen naar Odoo. Alleen wat een
bezoeker leest verschilt. Welke taal er op een pagina staat, bepaalt de shortcode
(`lang="fr"`) of anders de pagina zelf. De gekozen taal gaat als `meta_lang` mee
naar Odoo, zodat een Franstalige lead ook Franstalig opgevolgd kan worden.

Daarnaast: de browser toont zijn eigen foutballon niet meer. "Please fill out
this field." kwam uit de browser en volgde de taal van de BROWSER — een
Franstalige bezoeker met een Engelse Chrome kreeg Engels op een Nederlands
formulier, en die ballon is niet te vertalen, niet te stylen en niet te
verplaatsen. In de plaats komt een eigen melding onder het veld, in de taal van
het formulier, met `aria-invalid` en `role="alert"` zodat een schermlezer ze
aankondigt. De meldingen komen uit dezelfde catalogus die de Operations Manager
gebruikt voor haar 422-antwoorden, dus iemand met JavaScript leest exact dezelfde
zin als iemand zonder.

De instellingenpagina is gesplitst in twee tabbladen: **Shortcode maken** staat
vooraan, **Verbinding** (URL, sitesleutel, cache) erachter. Wie wekelijks een
shortcode komt halen, scrolde eerst elke keer langs een tekstveld dat bij een
verkeerde toetsaanslag elk formulier op de hele site tegelijk onderuithaalt.

**1.0.3** — shortcode-bouwer bij Instellingen → Mymmo Forms. De plugin haalt de
gepubliceerde formulieren op bij de Operations Manager (nieuw endpoint
`GET /forminator-v2/public/v1/forms`), toont ze in een keuzelijst en stelt de
shortcode samen. Daaronder staat een tabel met van elk formulier de volledige
shortcode; die werkt ook zonder JavaScript. De lijst wordt een minuut bewaard,
met een knop om 'm meteen opnieuw op te halen. Vervangt het oude lijstje met
"slugs die deze site ooit ophaalde", dat vooral toonde wat je toevallig al eens
bezocht had.

**1.0.2** — de bezoeker-UUID gaat mee met elke inzending. De cookies `ovme_uuid`
en `ovme_ref_uuid` worden server-side gelezen bij het verwerken, niet met
JavaScript in het formulier geïnjecteerd zoals bij Forminator: dat werkt ook
zonder JS en kan niet stukgaan op een gecachete pagina. Alleen een waarde die er
echt uitziet als een UUID wordt doorgelaten — de cookie kan iemand zelf zetten
en de waarde gaat naar Odoo. UTM's vallen nu terug op de cookie van het
tracking-script als ze niet in de URL staan, zodat iemand die vorige week via
een campagne binnenkwam zijn herkomst houdt.

**1.0.1** — de stylesheet komt nu uit `public/mymmo-forms.css` in plaats van uit
deze map. Reden: de formulierbouwer in de Operations Manager toont het formulier
in een iframe met precies die stylesheet, zodat het voorbeeld niet kan afwijken
van wat een bezoeker ziet. Twee kopieën zouden vroeg of laat uit elkaar lopen.
Bouw de plugin daarom met `bash wp-plugin/build-mymmo-forms.sh <versie>`; die
haalt de CSS op en controleert meteen of het versienummer op beide plekken in
`mymmo-forms.php` gelijk staat.

Verder één correctie in `templates/partials/field.php`: een tussentitel en een
tekstblok kregen als enige veldtypes geen `mymmo-form-field--<type>`-klasse op
hun wikkel. Gevonden door de nieuwe pariteitstest, die dezelfde velden door de
PHP- en de JS-renderer haalt en de structuur vergelijkt.

**1.0.0** — eerste versie. Shortcode, server-side rendering, inzending via
admin-post.php, cache in twee lagen, antispam zonder captcha. Veldtypes: tekst,
e-mail, telefoon, getal, datum, lange tekst, keuzelijst, keuzerondjes, vinkje,
meerkeuze, verborgen veld, tussentitel en tekstblok.

Nog niet ondersteund, bewust: bestandsupload, betalingen, meerstaps-formulieren,
berekeningen en voorwaardelijke velden. Voorwaardelijke velden zijn de meest
waarschijnlijke eerste uitbreiding.
