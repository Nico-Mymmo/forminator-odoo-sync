# Mymmo News

De nieuwsfeed uit de Operations Manager, op een WordPress-site.

**De plugin bewaart niets.** Geen custom post type, geen tabellen, geen kopie van
de berichten — enkel een cache in twee lagen. Alles staat in Odoo, de OM ontsluit
het, en deze plugin HAALT op. Er wordt nergens naar WordPress geduwd, dus er is
ook geen synchronisatiestap die kan mislukken. Terugzetten is één plugin
deactiveren.

## Installeren

1. Zip installeren via Plugins → Nieuwe plugin → Plugin uploaden.
2. Instellingen → Mymmo News: de basis-URL van de OM en de sitesleutel invullen.
   De sleutel blijft serverside en komt nooit in de HTML.
3. `[mymmo_news]` op een pagina zetten.

## De shortcode

```
[mymmo_news]
[mymmo_news categories="artikel,podcast" filters="both" limit="9" layout="grid"]
[mymmo_news tags="technisch-in-orde" heading="Technisch nieuws" autoload="no"]
```

| Attribuut | Wat het doet | Standaard |
|---|---|---|
| `categories` | Welke categorieën deze feed toont, komma-gescheiden. Leeg = alle. | *leeg* |
| `tags` | Vast voorfilter op labels. Die labels staan dan niet meer in de filterbalk. | *leeg* |
| `filters` | `tags`, `types`, `both` of `none`. | `tags` |
| `limit` | Berichten per pagina. | `12` |
| `layout` | `feed` (één kolom) of `grid` (kaartenraster). | `feed` |
| `heading` | Optionele kop boven de feed. | *leeg* |
| `autoload` | Bijladen bij scrollen. `no` = enkel de knop. | `yes` |

De beschikbare slugs staan op de instellingenpagina — die haalt ze live op bij de
OM, zodat je ze niet hoeft te onthouden of over te typen.

## Wat bewust zo is

- **De eerste pagina wordt SERVER-SIDE gerenderd.** Er staat inhoud in de HTML,
  dus zoekmachines zien ze en een bezoeker zonder werkende JavaScript krijgt een
  volwaardige lijst. JavaScript voegt alleen gedrag toe: filteren en bijladen.
  De plugin die we vervangen zette een leeg vlak neer en vulde dat pas achteraf.
- **De sitesleutel blijft serverside.** De browser praat met WordPress
  (`/wp-json/mymmo-news/v1/feed`), PHP praat server-naar-server met de OM.
  Zelfde opzet als mymmo-forms.
- **De REST-route geeft KLAARGEMAAKTE HTML terug, geen ruwe items.** Anders
  bestaat er een tweede renderer in JavaScript naast die in PHP, en die lopen
  uit elkaar zodra er een nieuw soort item bijkomt.
- **Bij een storing blijft de feed staan.** Een last-known-good in een option,
  zeven dagen houdbaar. Bijladen dat mislukt wist nooit wat er al staat.
- **De knop "Meer berichten" is de echte besturing**; autoload zit er alleen
  bovenop. Een lijst die enkel met scrollen groeit, is niet bedienbaar met een
  toetsenbord.
- **Klikken op de afbeelding opent het ARTIKEL**, geen lightbox. De plugin die
  we vervangen vergrootte de foto, en dat is niet waarvoor iemand op een
  nieuwskaart klikt.
- **De datum toont het jaar** zodra het bericht niet van dit jaar is.
- **Geen `mbstring` vereist.** WordPress polyfilt `mb_substr` en `mb_strlen`,
  maar niet `mb_strtolower`/`mb_strtoupper`. Die gaan hier door een eigen
  hulpje met terugval, zodat een host zonder de extensie geen witte pagina geeft.

## Nieuwe soorten inhoud toevoegen

De feed krijgt er later polls, reacties, video's en events uit het OM bij. Dat
haakt in op het **renderer-register**, niet op een `if`-tak in een template:

```php
add_action('mymmo_news_register_renderers', function () {
    Mymmo_News_Renderers::register('poll', function (array $item, array $context): string {
        return mymmo_news_template('partials/card-poll.php', ['item' => $item]);
    });
});

// Label en icoon voor die soort
add_filter('mymmo_news_kind_meta', function (array $meta): array {
    $meta['poll'] = ['label' => 'Poll', 'icon' => 'sparkles', 'media' => false];
    return $meta;
});

// Knoppen onderaan elke kaart -- hier komen reageren, delen en stemmen
add_filter('mymmo_news_card_actions', function (array $acties, array $item): array {
    $acties['reageer'] = '<button class="mymmo-news-action">Reageren</button>';
    return $acties;
}, 10, 2);
```

Het register werkt op `kind`, **niet** op de Odoo-categorie:

- `type` (Artikel, Release Notes, Podcast, …) is waarop je FILTERT. Komt er in
  Odoo een categorie bij die eruitziet als een artikel, dan hoeft hier niets te
  gebeuren.
- `kind` is WAARMEE je tekent. Alleen een echt nieuwe verschijningsvorm krijgt
  een eigen renderer.

Een onbekende `kind` valt terug op de artikelkaart. Een OM die iets nieuws
stuurt naar een plugin die het nog niet kent, toont dus iets bruikbaars in
plaats van niets.

Overige haken: `mymmo_news_card_html` (de volledige kaart).

## Bekijken zonder WordPress

```bash
php wp-plugin/mymmo-news-preview.php > feed.html
php wp-plugin/mymmo-news-preview.php grid > feed-grid.html
```

Rendert de kaarten met voorbeelditems, om de vormgeving te beoordelen. Let op:
daar is geen thema, dus specificiteitsproblemen met een blokthema zie je er
NIET — dat blijft de echte pagina op de site.

## Bouwen

```bash
bash wp-plugin/build-mymmo-news.sh 1.0.1
```

Controleert eerst of het versienummer op beide plekken in `mymmo-news.php`
gelijk staat, draait `php -l` en `node --check`, en bouwt in een schone kopie.
Oudere zips blijven staan.

## Versies

**1.2.0** — events staan in de feed.

Een event uit het eventbeheer kan nu gewoon tussen de nieuwsberichten staan,
met wanneer, waar, hoeveel plaatsen er nog zijn, en een inschrijfknop. Het is
een nieuwe `kind` (`event`) op het bestaande renderer-register -- precies
waarvoor dat register er was -- en het gebruikt dezelfde kaart, want wat een
event toevoegt hangt aan een apart `event`-blok in het item.

Welke events verschijnen en van wanneer tot wanneer, staat op het EVENT in
Odoo, niet in deze plugin en niet in een shortcode. De shortcode kiest alleen
of events meetellen: `categories="artikel,evenement"`. Laat je `categories`
leeg, dan staan ze er gewoon bij.

Twee dingen die bewust zo zijn. De knop heet "Schrijf je in" zolang inschrijven
openstaat en anders "Bekijk het event" -- een inschrijfknop op een gesloten
event belooft iets wat de volgende pagina niet waarmaakt. En een labelfilter
sluit events uit: een event draagt de labels van de nieuwsberichten niet, dus
het kan er per definitie nooit aan voldoen, en ze dan toch tonen zou betekenen
dat een filter meer teruggeeft dan het label belooft.

De payloadvorm staat hierdoor op 3. Een oudere plugin gaat niet stuk -- die
tekent een event als gewoon artikel, zonder datum en zonder knop -- maar meldt
in wp-admin wel dat er een nieuwere vorm is. Deze versie vraagt een
Worker-deploy: het samenvoegen gebeurt daar.

**1.1.1** — de helft van de kaarten kwam niet op het scherm.

`houder.children` is een LIVE HTMLCollection, en `appendChild` haalt de node uit
`houder`. Tijdens de lus schoof de collectie dus op en werd elk tweede element
overgeslagen: bij filteren en bijladen kwam de helft van de kaarten nooit in de
lijst, terwijl de teller wel gewoon doorliep. Met de maandopschriften ertussen
(kop, kaart, kaart) viel dat pas echt op. De collectie wordt nu eerst
gekopieerd met `slice()`.

Daaraan hing het uitblijven van het bijladen bij scrollen vast. Een
`IntersectionObserver` vuurt alleen bij een OVERGANG; duwden de te weinig
bijgeladen kaarten de sentinel niet uit beeld, dan bleef die onafgebroken
zichtbaar en kwam er nooit een tweede callback. Na elke geslaagde batch wordt
de sentinel daarom opnieuw geobserveerd, wat een verse callback afdwingt met de
huidige stand. Dat helpt ook op een groot scherm waar een batch simpelweg niet
genoeg hoogte oplevert.

**1.1.0** — maandopschriften, en het ontwerp gelijkgetrokken met de rest.

*Maandopschriften in de tijdlijn.* Boven de eerste kaart van elke maand staat
nu "September 2026", met een lijntje ernaast, zodat je ziet hoe ver je al
teruggescrold bent. Ze worden gebouwd in `Mymmo_News_Renderers::render_list()`
en niet in een sjabloon: er zijn twee plekken die kaarten uitschrijven (de
shortcode en de REST-route), en die zouden anders uit elkaar lopen. Bijladen
geeft de maand van de laatste zichtbare kaart mee, zodat er geen tweede
opschrift midden in een open maand verschijnt. Berichten zonder publicatiedatum
staan onderaan onder "Eerder" — niet "Zonder datum": dat een redactie een veld
niet invulde, is niets wat een bezoeker hoort te lezen.

*De sortering klopte al, de lege datums niet.* De feed sorteert op
publicatiedatum, nieuwste eerst — maar PostgreSQL zet lege waarden bij `DESC`
standaard BOVENAAN, dus de zes gepubliceerde berichten zonder datum voerden de
lijst aan. Dat leest als "hij sorteert op aanmaakdatum". Opgelost in de Worker
(`SORT_ORDER` met `nulls last`), dus dat vraagt een deploy, geen plugin-update.

*Het gekleurde streepje links is weg.* De tijdlijnkleur uit Odoo is nu een heel
zachte vulling van de kaart. Als streepje van 3px las het in een lange lijst
als een statusbalk, terwijl het een thema-accent is. `default` krijgt geen
tint: de meeste berichten staan daarop, en een tint die bijna elke kaart raakt
zegt niets meer.

*Ontwerp in lijn met mymmo-forms.* Dezelfde tekst-, rand- en vlakkleuren als
`mymmo-forms.css`, dezelfde verhouding voor de radius (een kaart is een vlak,
geen bedieningselement), en het lettertype van de site wordt expliciet geerfd.
Een pagina met een formulier en een feed erop bestaat nu niet meer uit twee
ontwerpen.

**1.0.2** — een lege feed moet zichzelf kunnen verklaren.

Staat er niets, dan zegt de feed dat nu OOK tegen redacteuren: voor welke
categorieen en labels de Operations Manager 0 berichten teruggaf, en of dat
antwoord uit de noodcache kwam. Zonder die regel is "er staan hier nog geen
berichten" niet te onderscheiden van een verkeerde shortcode, een storing of
verouderde cache -- en dat kostte twee rondes blind zoeken. Bezoekers zien het
niet.

En een `304` waarvan de bewaarde body intussen verdwenen is, levert niet langer
een lege lijst op: de plugin vraagt het dan opnieuw zonder `If-None-Match`. De
ETag kan de inhoud overleven (de transient is kort, de noodcache zeven dagen),
en teruggeven wat we niet meer hebben is de stilste faalmodus die er is -- geen
fout, geen melding, gewoon niets.

**1.0.1** — drie dingen die pas op een echte pagina zichtbaar werden.

*Afbeeldingen laadden nooit.* De beeld-URL wees naar de publieke API van de OM,
en die eiste de sitesleutel als HEADER. Een `<img src>` stuurt geen headers mee,
dus elke afbeelding kreeg 401 -- en een gebroken beeld ziet er in een feed uit
als een bericht zonder foto, niet als een fout. De beeldroute in de Worker
vraagt die sleutel niet meer; de controle op "is dit bericht gepubliceerd"
blijft staan, dus een concept geeft nog altijd 404.

*De knop "Meer berichten" bleef staan bij een lege feed.* Het `hidden`-attribuut
is (0,0,1) en onze eigen `.mymmo-news .mymmo-news-knop` is (0,2,0) -- onze CSS
overrulede dus onze eigen HTML. Opgelost met een `.mymmo-news [hidden]`-regel
bovenaan de stylesheet. Dezelfde specificiteitsles als in de kop van dat
bestand, maar dan tegen onszelf in plaats van tegen een thema.

*De categorieknoppen stonden er niet.* `filters` stond standaard op `tags`, dus
je kreeg enkel de labelrij tenzij je expliciet `filters="both"` schreef. De
standaard is nu `both`; de typerij verschijnt nog steeds alleen als deze feed
meer dan een categorie toont, want een filterrij met een knop is geen keuze.

**1.0.0** — eerste versie. Vervangt Cool Timeline Pro op
`embed.openvme.be/content-feed`. Server-side eerste pagina, filterbalk op labels
en categorieën, bijladen, renderer-register voor toekomstige soorten inhoud.
