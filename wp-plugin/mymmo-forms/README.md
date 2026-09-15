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

Ga naar **Instellingen → Mymmo Forms**. Daar staat een shortcode-bouwer die de
gepubliceerde formulieren rechtstreeks uit de Operations Manager haalt: kies er
een, zet de titel aan of uit, en kopieer de shortcode.

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

Dat geeft een knop; een klik opent een venster met links een **zijkolom** — waar
je bent, wat je te wachten staat, een afbeelding — en rechts de inhoud: het
formulier, of de agenda. De keuze tussen die twee staat in die zijkolom als twee
kaarten onder elkaar.

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
| `lang` | Zoals bij `[mymmo_form]` |

De opschriften staan in de shortcode en niet in de Operations Manager, want ze
horen bij DEZE knop op DEZE pagina en niet bij het formulier. Op een Franstalige
pagina typ je ze dus mee.

#### De kleur van de knop

De knop, de verzendknop in het venster en de gemarkeerde keuze volgen alle drie
dezelfde **accentkleur**. Die staat normaal in de Operations Manager bij het
formulier zelf (Koppelingen → Formulier → Stijl), en geldt dan op élke pagina
waar dit formulier staat. Dat is bijna altijd wat je wil: één plek.

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
