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
