# Nieuws & updates naar de OM — kernonderzoek en grondwerk

Status: **onderzoek af, ontwerp voorgesteld, nog niets gebouwd.**
Datum: 2026-09-17. Alle cijfers hieronder zijn gemeten, niet geschat — de
meetopdrachten staan erbij zodat je ze kan herhalen.

Doel: `x_content_snippet` ("contentsnippets" / "nieuws en updates") krijgt
hetzelfde model als events en formulieren. **Odoo blijft de database**, het
BEHEER verhuist naar de OM, en een eigen WordPress-plugin haalt op uit de OM in
plaats van dat er iets naar WordPress geduwd wordt.

---

## 1. Wat er vandaag staat

De keten, van achter naar voren:

```
x_content_snippet (Odoo, 49 records)
  │
  ├─ serveractie 1014 "Article WP build content"  ── schrijft x_studio_content
  │                                                   (HTML) terug IN Odoo
  ├─ serveractie 1010 "Send article to WP"  ──────→ odoo-proxy.openvme-odoo
  │                                                  .workers.dev  (?token=...)
  ├─ serveractie 1011 "Send WP article to Zap" ───→ hooks.zapier.com/.../u1boej7
  └─ serveractie  952 "Webhook notificatie"  ─────→ hooks.zapier.com/.../uu9svdw
                                                     (automation 27, AI-samenvatting)
  │
  ▼
embed.openvme.be  ──  CPT `news_article`
                      + taxonomie `news_article_category`
                      + ACF `article_link`, `timeline_color`
                      + uitgelichte afbeelding (media-upload)
  │
  ▼
Cool Timeline Pro  (betaalde plugin, shortcode)
  │
  ▼
https://embed.openvme.be/content-feed/   ── in een iFrame in de app
```

Drie dingen die hier meteen opvallen:

- **Er zijn DRIE uitgaande paden naast elkaar**, niet één. Twee Zapier-hooks en
  een Cloudflare Worker (`odoo-proxy`) die **niet in deze repo staat**
  (geverifieerd: `grep -rn "odoo-proxy\|sync_wordpress_article"` geeft niets).
  Die Worker is dus code die niemand hier kan lezen, versioneren of deployen,
  met een **token hardgecodeerd in de webhook-URL in Odoo**.
- **De drie serveracties zijn `usage: ir_actions_server`**, geen automation. Ze
  hangen als actie-menu onder de knop: iemand moet ze met de hand aanklikken.
  Wie dat vergeet, krijgt geen foutmelding — het bericht staat gewoon niet op
  de site. Dat is de directe oorzaak van de "syncissues".
- **`x_studio_content` is een AFGELEID veld dat in de database bewaard wordt.**
  Actie 1014 bouwt er HTML in (categorieën, bron, samenvatting, CTA-link) uit
  vier andere velden. Het is presentatie, opgeslagen als data — met alle
  gevolgen van dien, zie §2.

### Zapier is hier al eerder stil gestorven

Dit is exact de faalmodus van de Calendly-koppeling, die sinds 2026-07-24
maandenlang stillag zonder dat iemand het zag (zie CLAUDE.md). Het patroon is
hetzelfde: een externe dienst duwt data, niemand controleert de aankomst, en het
verschil merk je pas als je gaat tellen.

---

## 2. Bewijs van drift — gemeten, 2026-09-17

| Meting | Uitkomst |
|---|---|
| Records in Odoo | **49** |
| Waarvan status `published` | **43** |
| Unieke WordPress-id's bij die 43 | **42** |
| Gepubliceerde `news_article`-posts op de site | **46** |
| Items die de tijdlijn effectief toont | **47** |

Die getallen kloppen niet met elkaar, en elk verschil is een echt probleem:

**(a) Twee Odoo-records vechten om één WordPress-post.**
Record 57 en record 67 hebben allebei `x_studio_article_wordpress_id = 1245`.
Post 1245 heet op de site *"OpenVME x Verenigde Eigenaars"* — wat met GEEN van
beide `x_name` overeenkomt (record 67 heet *"OpenVME x 's GraevenHuys
Vastgoed"*). De laatste schrijver wint, de andere is stil weg. Niets in Odoo
laat zien dat dit gebeurd is.

**(b) Vier posts staan live zonder Odoo-record erachter.**

| WP-id | Titel | Datum |
|---|---|---|
| 1684 | Stekje voor je plekje: verras je buren met een stekje | 2026-04-22 |
| 1682 | Een stekje voor je plekje🌱 | 2026-04-22 |
| 807 | Nog niet op pensioen, maar nu al kleiner gaan wonen… | 2025-10-13 |
| 509 | Mechelen zoekt VME's die appartementen duurzaam willen verwarmen… | 2025-10-07 |

1682 en 1684 zijn bovendien **hetzelfde bericht, twee keer aangemaakt op
dezelfde dag** — een dubbele webhookvuring. Verwijderen in Odoo haalt niets weg
op de site; de enige weg terug is met de hand in wp-admin.

**(c) Zes gepubliceerde records hebben GEEN publicatiedatum.**
Records 85 t/m 90 hebben `x_studio_content_snippet_publication_date = false`
maar staan wel op de site. De tijdlijn sorteert dus op de datum die WordPress
zelf toekende bij het aanmaken. **De volgorde van de tijdlijn wordt vandaag niet
in Odoo bepaald** — en niemand kan aan Odoo zien op welke plek een bericht komt.

**(d) De afgeleide HTML is met de hand bijgewerkt.**
Record 97 heeft in `x_studio_content` een `style="margin-bottom: 0px"` en andere
aanhalingstekens dan actie 1014 produceert. Iemand heeft daar rechtstreeks in
getypt. Wie die actie opnieuw aanklikt, wist dat zonder te vragen.

**(e) De helft van de berichten heeft geen afbeelding.** 24 van de 46 posts
hebben geen uitgelichte afbeelding. Cool Timeline toont die dan als een
kaart zonder beeld, wat de tijdlijn ongelijk maakt.

Wat NIET misgaat, en dat is het vermelden waard: `concept` en `private` lekken
niet. De drie concepten (1562, 1795, 1831) en de twee privéberichten (1698,
1711) staan op de site als draft en zijn publiek onbereikbaar. De statussync
zelf werkt dus; het is het BESTAAN van records dat uit elkaar loopt.

---

## 3. Waar Cool Timeline Pro tegen de muur loopt

Gemeten op de gerenderde markup van `/content-feed/`:

- **Alles zit geplet in één `ctl-description`.** Categorie, bron, samenvatting en
  "Lees verder" komen als één blok HTML binnen, gebouwd door actie 1014 in
  Odoo. De plugin kent die onderdelen niet, dus je kan er niets mee: niet
  filteren, niet anders schikken, niet anders opmaken per soort.
- **De datum toont geen jaar** ("7 september"). In een tijdlijn die tot 2024
  teruggaat is dat niet te lezen.
- **Klikken op de afbeelding opent een lightbox** (glightbox), niet het artikel.
  Dat is de plugin die iets doet wat wij niet willen en niet kunnen uitzetten
  zonder aan de plugin te sleutelen.
- **Geen filter-UI.** De vier categorieën (`volgens de regels` 16, `goed
  samenleven` 13, `financiële gezondheid` 9, `technisch in orde` 8) staan wel in
  de taxonomie, maar er is niets om op te filteren.
- **Eén merk.** De feed is openvme. Voor syndicoach.be bestaat er geen
  tegenhanger, en in Odoo bestaat er geen veld om het onderscheid te maken.
- **Events staan er niet in**, terwijl dat de eerste vervolgwens is.

---

## 4. Het ontwerp

Precies het model van events-v2 en mymmo-forms, want dat is drie keer bewezen:

```
Odoo (x_content_snippet)          ← enige database
  ▲ lezen/schrijven via JSON-RPC
  │
OM-module  src/modules/content-feed/
  ├─ odoo-contract.js   ← ENIGE plek met x_-veldnamen, puur, geen I/O
  ├─ lib/…-service.js   ← leest/schrijft Odoo
  ├─ public-api.js      ← /content-feed/public/v1/*  (sitesleutel, ETag, cache)
  └─ public/content-feed.html + JS   ← het beheerscherm
  │
  ▼ HALEN (de site vraagt, wij duwen niet)
wp-plugin/mymmo-news/  ← eigen plugin, shortcode + blok
```

**De richting draait om.** Vandaag duwt Odoo naar WordPress en is elke gemiste
duw een onzichtbaar gat. Straks vraagt WordPress aan de OM, met cache in twee
lagen (transient + last-known-good) zoals mymmo-events en mymmo-forms al doen.
Een bericht dat in Odoo staat, staat daarmee per definitie op de site: er is
geen tussenstap meer die kan mislukken, en dus ook geen "syncissue" meer om op
te lossen. Dat is niet een betere sync — het is er géén.

### Wat daarmee vanzelf verdwijnt

| Verdwijnt | Waarom het kon bestaan |
|---|---|
| `x_studio_article_wordpress_id` | Er is geen tweede record meer om naar te wijzen |
| `x_studio_content` (afgeleide HTML) | De plugin rendert; Odoo bewaart velden, geen opmaak |
| Serveracties 1010, 1011, 1014, 952 | Geen duwen meer |
| De `odoo-proxy`-Worker + zijn token | idem |
| Twee Zapier-zaps | idem |
| Cool Timeline Pro (licentie) | Eigen plugin |
| `news_article` CPT + ACF-velden | De plugin bewaart niets |

### Wat de plugin WEL doet

Zelfde afspraak als mymmo-forms: **de plugin bewaart niets.** Geen custom post
type, geen tabellen. Enkel een cache in twee lagen en het renderen. Daardoor is
"terugzetten" één plugin deactiveren, en kan de site nooit een eigen waarheid
opbouwen die van Odoo afwijkt.

---

## 5. Het Odoo-contract

Geverifieerd tegen de live instantie op 2026-09-17 met `fields_get`.

### Velden die we gebruiken

| OM-naam | Odoo-veld | Type | Noot |
|---|---|---|---|
| `title` | `x_name` | char | |
| `active` | `x_active` | boolean | archiveren = uit de feed |
| `status` | `x_studio_article_status` | selection | `concept` / `published` / `private` |
| `publishedOn` | `x_studio_content_snippet_publication_date` | date | **sorteersleutel**, zie §7 |
| `type` | `x_studio_content_snippet_type_id` | m2o → `x_content_snippet_type` | Artikel / Release Notes / Online Publicatie / PDF / Webinar / Podcast |
| `tags` | `x_studio_tag_ids` | m2m → `x_content_snippet_tag` | 4 stuks |
| `source` | `x_studio_content_snippet_outlet` | char | "bron: BRUZZ" |
| `url` | `x_studio_content_link` | char | waar "Lees verder" heen gaat |
| `cta` | `x_studio_article_cta` | char | opschrift van die link |
| `summary` | `x_studio_article_summary` | text | de lopende tekst |
| `summaryTitle` | `x_studio_article_summary_title` | char | kop op de kaart |
| `color` | `x_studio_article_timeline_color` | selection | `default` / `blue` / `green` / `yellow` / `red` |
| `sequence` | `x_studio_sequence` | integer | staat op 10 bij álle 49 records — vandaag betekenisloos |
| `owner` | `x_studio_user_id` | m2o → `res.users` | |

### Velden die we NIET gebruiken (FORBIDDEN_FIELDS)

| Veld | Waarom niet |
|---|---|
| `x_studio_content` | Afgeleide HTML. De plugin rendert; wij bewaren geen opmaak. |
| `x_studio_article_wordpress_id` | Verwijst naar een record dat straks niet meer bestaat. |
| `x_studio_article_summary_old` | Oude kolom, `x_studio_article_summary` is de echte. |
| `x_studio_generate_ai_content` + `x_studio_ai_last_generated` | Hangen aan automation 27 → Zapier. Leeg op elk gecontroleerd record. Zie §7. |
| `x_studio_content_image` én `x_studio_image` | **Twee** binaire velden voor hetzelfde. Zie §7. |

Dezelfde regel als in events-v2: **`odoo-contract.js` is de enige plek waar een
`x_`-naam mag staan.** De rest van de module kent alleen nette namen.

---

## 6. Wat er in Studio bij moet

Beide volgens het `BRAND`-patroon van events-v2: de code werkt door als het veld
nog niet bestaat, zodat de volgorde van uitrollen vrij blijft.

1. **`x_studio_brand`** (selection: `openvme` / `syndicoach` / leeg = beide).
   Bestaat vandaag niet, en zonder dat veld kan syndicoach.be geen eigen feed
   krijgen. Leeg moet "beide" betekenen en niet "geen": de 49 bestaande records
   hebben het niet, en die horen gewoon te blijven staan.
2. **`x_studio_image_url`** (char). Zie §7.

Verder niets. Geen Python-module, geen XML — conform de repo-regel dat alle
Odoo-aanpassingen via Studio gaan.

---

## 7. Open beslissingen

Drie dingen die het ontwerp materieel veranderen en die jij moet kiezen. Ik heb
bij elk een voorkeur, met de reden.

### (a) Afbeeldingen: binair in Odoo of een URL?

Vandaag staan er twee binaire velden (`x_studio_image`,
`x_studio_content_image`) en gaat het beeld via de webhook naar de WP-mediaotheek
(bestandsnamen als `article-1789041680010.png` — een tijdstempel, dus
automatisch geüpload).

**Voorkeur: een URL naar de Asset Manager (R2), niet binair.** Binaire velden in
Odoo betekenen base64 door elke JSON-RPC-respons heen, en events-v2 doet het al
zo (`x_studio_hero_image_url`). De OM heeft de Asset Manager al, en die kan
vervangen zonder dat er iets in de koppeling bijgewerkt moet worden — dezelfde
redenering als bij de mailbijlagen. **Twee binaire velden voor hetzelfde ding
betekent sowieso dat er één moet sneuvelen**; welke van de twee gebruikt wordt,
heb ik niet nagemeten (dat vraagt de records één voor één uitlezen, wat zwaar is
op base64-velden).

### (b) De sorteersleutel

`x_studio_content_snippet_publication_date` ontbreekt op 6 gepubliceerde
records, en `x_studio_sequence` staat op 10 bij alle 49 — dus dat veld doet
vandaag niets.

**Voorkeur: publicatiedatum wordt verplicht, met `create_date` als eenmalige
terugval bij het invullen van de 6 gaten.** En de datum is de ENIGE sorteer-
sleutel: een tijdlijn met twee sorteervelden is een tijdlijn waarvan niemand de
volgorde kan voorspellen. `x_studio_sequence` gebruiken we niet.

### (c) De AI-samenvatting

Automation 27 vuurt bij `x_studio_generate_ai_content = True` naar een Zapier-
hook. `x_studio_ai_last_generated` was leeg op elk record dat ik bekeek, dus
waarschijnlijk werkt dit al een tijd niet.

**Voorkeur: niet meenemen in de eerste versie.** De OM heeft een eigen
AI-koppeling met een foutcontract (`lib/ai.js`, zie CLAUDE.md); de samenvatting
opnieuw opbouwen op Zapier zou een nieuwe stille afhankelijkheid zijn. Eerst de
feed laten werken, dan dit erbovenop — maar dan binnen de OM.

---

## 8. Uitrolvolgorde (niets aan de bestaande feed aanraken)

Zelfde voorzichtigheid als bij de formulieren en Calendly:

1. Odoo-contract + module + publieke API bouwen. **Niets in Odoo wijzigen.**
2. De publieke API met `curl` testen tegen de echte 49 records.
3. De vier weesposts en het dubbele record 57/67 opruimen — **met de hand, door
   een mens, na de vergelijking uit §2 opnieuw gedraaid te hebben.** Niet
   automatisch: bij 1682/1684 moet iemand kiezen welke van de twee blijft.
4. Plugin op één testpagina op embed.openvme.be, NAAST de bestaande feed.
5. Vergelijken: toont de nieuwe feed dezelfde berichten als de oude? Dat is de
   enige test die telt, en ze is met het oog te doen.
6. De shortcode op `/content-feed/` wisselen. De oude blijft staan.
7. Minstens twee weken wachten. Pas dan: serveracties 1010/1011/1014/952
   archiveren, de twee Zaps uitzetten, de `odoo-proxy`-Worker opruimen, en Cool
   Timeline Pro deactiveren.
8. Als laatste pas het `news_article`-CPT en de ACF-velden weghalen — dat is de
   enige onomkeerbare stap, en ze mag pas als de rest weken draait.

De iFrame-URL in de app blijft `https://embed.openvme.be/content-feed/` en
verandert in geen enkele stap. Dat is bewust: de app hoeft niets te weten.

---

## 9. Daarna pas: de diepere integratie

Deze staan hier om het ontwerp eerlijk te houden, niet om nu gebouwd te worden.

- **Events in dezelfde lijst.** Beide bronnen worden dan door één publieke API
  samengevoegd tot één gesorteerde feed. Let op: vandaag staan webinars AL als
  `x_content_snippet` van type "Webinar" (records 33, 57, 67, 81, 82) náást de
  echte `x_webinar`-records. Dat is dubbele invoer die de samenvoeging juist moet
  oplossen, niet verdubbelen.
- **De handtekeninggenerator pikt nieuwsberichten op.** Leest dezelfde publieke
  API.
- **Nieuwsbrieven automatisch vullen.** Het aankondigingsblok in de mailstudio
  van events-v2 kan hetzelfde voor nieuws: gesloten keuze (`laatste N`,
  `per tag`), geen vrij domein — zie de afspraak bij `announcement` in CLAUDE.md.

---

## 10. Hoe je dit onderzoek herhaalt

```
# Odoo
odoo_search_read  x_content_snippet   → 49 records
odoo_search_read  ir.actions.server   domain [["model_id.model","=","x_content_snippet"]]
odoo_search_read  base.automation     domain [["model_id.model","=","x_content_snippet"]]

# WordPress (publiek, geen sleutel nodig)
https://embed.openvme.be/wp-json/wp/v2/news_article?per_page=100&status=publish
https://embed.openvme.be/wp-json/wp/v2/news_article_category?per_page=50
```

Vergelijk `x_studio_article_wordpress_id` van de gepubliceerde Odoo-records met
de id's uit die eerste URL. Elk verschil is drift.
