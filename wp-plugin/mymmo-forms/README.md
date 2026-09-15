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
| `padding_x` / `padding_y` | De ruimte rond de velden. Een lengte met eenheid |
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
- **`padding_x` en `padding_y`** zetten de ruimte rond de velden. Bij een knop met
  venster is dat de ruimte binnen het kaartje, bij een formulier op de pagina de
  ruimte eromheen — één paar knoppen voor allebei, want het is in beide gevallen
  "hoeveel lucht rond de velden". Ze staan ook in de bouwer en kunnen als
  `padding_x`/`padding_y` in het thema van het formulier in de Operations Manager.
  Alleen een lengte met eenheid komt erdoor (`28px`, `1.5rem`, `4%`) — dezelfde
  gesloten controle als bij de kleuren.
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
