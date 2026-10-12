# Nieuwsbrieven naar de OM — ontwerp

Status: **gebouwd, in teststand** (2026-10-09). Module `src/modules/newsletters/`,
scherm `/nieuwsbrieven`. Zolang `NEWSLETTER_SEND_MODE` niet `live` is, vertrekt er
enkel een testmail naar `NEWSLETTER_TEST_EMAILS`. De afspraken staan in CLAUDE.md
onder "Nieuwsbrieven"; nog niet gebouwd: kliks per stukje (§3), de nurture flows (§10).
Klikbaar voorbeeld (zeven schermen): https://claude.ai/artifact/4KzZk1KM5JWNg32Pa1WRgW

Doel: de drie nieuwsbrieven (Syndicoach, OpenVME, Professionals) worden in de OM
gemaakt, door het hele bedrijf samen, met marketing als hoofdredactie. Odoo blijft
de motor die verstuurt en de lijsten beheert. Daarna volgen de nurture flows op
dezelfde bouwstenen.

Het probleem is niet de mailbouwer. Het probleem is dat de nieuwsbrief bij één
persoon ligt en elke maand van een leeg blad begint, terwijl de inhoud er al is
(events, Nieuws & updates, LinkedIn, wat sales en support elke dag horen).

---

## 1. Wat er vandaag staat (gemeten 2026-10-09)

### Lijsten en ritme

| Lijst (Odoo `mailing.list`) | Contacten | Uitgeschreven | Ritme | Opent | Klikt |
|---|---|---|---|---|---|
| 19 Nieuwsbrief Syndicoach | 1.799 | 40 | sinds sept. de inhoudelijke maandmail | 52–61% | 5,6–8,5% |
| 1 Nieuwsbrief OpenVME | 308 | 17 | maandelijks jan–mei 2026, dan juli, dan enkel eventmails | 53–58% | 4–11% |
| 15 Nieuwsbrief Pro | 1.613 | 110 | om de 1 à 2 maanden | 45–57% | **1,1–1,6%** |
| 17 Professionele gebruikers | 111 | 1 | enkel productlanceringen | 50–67% | 0–13% |

- Juni en augustus 2026 ontbreken bij OpenVME: het "getrek en gesleur" staat in de data.
- Lijst 1 telt nu 308 contacten, terwijl de editie van mei naar 1.462 adressen ging.
  Vermoedelijk zijn de prospecten in juni naar lijst 19 verhuisd (aangemaakt
  2026-06-09). Niet nagegaan.
- Pro wordt goed geopend maar bijna niet aangeklikt, en 7% schreef zich uit.
- Elke editie is geschreven als Thomas, 250–520 woorden, 4–6 stukjes.

### Opmaak

- De huidige opmaak komt uit de Dynapps-module `openvme_mail_snippets`
  (geïnstalleerd 2025-11-03): hoofding blauw/wit, tekstblok, tekst + afbeelding,
  titel met icoon, eventkaarten, contactblok met handtekening, afsluiting.
- Fouten in de verstuurde mails: twee knopkleuren (#085294 en #0369a1), twee
  lettertypereeksen door elkaar, "© 2025" in bijna elke mail, mailing 193 zonder
  uitschrijflink, reply-to `team-cx@oipenvme.be` (tikfout) op 193 en 194, alle
  beelden op `mymmo.odoo.com/web/image`.
- **Die blokken worden NIET nagebouwd.** Het nieuwe ontwerp vertrekt van de
  huisstijl van de websites (§5).

### Verzending

- Odoo `mailing.mailing` op `mailing.list`, via `ir.mail_server` 4
  (Postmark broadcast, `PM-B-newsletter`). Uitschrijven via `/unsubscribe_from_list`,
  per ontvanger door Odoo herschreven.
- De nurture flows lopen in Odoo Marketing Automation (`marketing.campaign`,
  13 campagnes) met `x_dynamic_mail_block` voor tekst die van een veld afhangt.

### Wat de OM al heeft

| Wat | Waar |
|---|---|
| Gedeelde mailrenderer (blokken → HTML, tabellen, knopstijlen) | `src/lib/mail/render-blocks.js`, `block-types.js` |
| Bewerken in het voorbeeld zelf (srcdoc-iframe, `data-om-block`) | `public/events-v2-mail-studio.js` |
| Placeholder-chips en de "/"-kiezer | `public/mail-token-editor.js` |
| Linkvoorbeeld (pagina ophalen, metagegevens) | `src/modules/content-feed/lib/article-fetch.js` |
| LinkedIn-post lezen (OG/JSON-LD) | `GET /mail-signatures/api/linkedin-meta` |
| AI met foutcontract en audit | `askAI()` in `src/modules/mini-apps/lib/ai.js` |
| Events en nieuws | `listEvents()` (events-v2), `listSnippets()` (content-feed) |
| Inzendingen → Odoo | de koppelingen (`handleGenericWebhook()`) |
| Chatmeldingen naar collega's | `sendSystemChannelMessage()` (mini-apps/lib/chat.js) |

---

## 2. Het model: reeks, editie, bijdrage, voorraad

**Reeks** — Syndicoach-brief, OpenVME platform-update, Professionals. Ligt vast:
merk (huisstijl), doelgroep (Odoo-lijsten), afzender en reply-to, ritme, en
**vaste rubrieken met een eigenaar** (bv. "Woordje vooraf" = CEO, "Stelling" =
sales, "Tip van support" = support, "Agenda" = automatisch).

**Editie** — één nieuwsbrief. Maakt zichzelf aan volgens het ritme van de reeks,
met voor elke rubriek meteen een opdracht bij de eigenaar. Twee momenten:

- **inleverdatum**: daar telt de teller van de schrijvers naar af;
- **verzendmoment**: marketing leest na en bevestigt met de hand. Standaard 3
  werkdagen na de inleverdatum, zodat een deadline geen avondwerk wordt.

Status: `verzamelen` → `nalezen` → `ingepland` → `verzonden`.

**Bijdrage** — een stukje van één persoon in één vorm: tekst en foto, video,
link met voorbeeld, event, bericht uit Nieuws & updates, LinkedIn-post, stelling,
korte vraag, citaat/klantverhaal. Status: `open` → `bezig` → `ingeleverd` →
`goedgekeurd`. Een bijdrage draagt de naam en foto van wie ze schreef, ook in de
mail.

**Voorraad** — bijdragen en ideeën die nog in geen editie staan. Iedereen kan er
op elk moment iets in zetten, eventueel voor meerdere reeksen tegelijk. Per editie
stelt de OM er kandidaten bij voor uit de bronnen (§8).

### Opslag

Supabase, want dit is werkproces van de OM en geen CRM-gegeven. Odoo krijgt het
eindproduct (`mailing.mailing`) en de antwoorden (via een koppeling). Voorstel:

| Tabel | Inhoud |
|---|---|
| `newsletter_series` | merk, lijst-ids, afzender, reply-to, ritme, standaard-rubrieken (jsonb), hoofdredactie |
| `newsletter_editions` | reeks, titel, inleverdatum, verzendmoment, status, `odoo_mailing_id`, onderwerp, voorbeeldtekst |
| `newsletter_contributions` | editie (of null = voorraad), rubriek, volgorde, eigenaar (`users.id`), vorm, inhoud (jsonb blokken), status, bron (`event:88`, `snippet:97`, `linkedin:<url>`) |
| `newsletter_comments` | opmerkingen en reacties per bijdrage |
| `newsletter_questions` | vraag per bijdrage: soort, opties, koppeling, `toon_tussenstand` |
| `newsletter_answers` | antwoord per (vraag, ontvanger): optie, toelichting, tijdstip, contact-id of anoniem, `pushed_at` |

Elke nieuwe tabel met RLS aan, zonder policies (zie CLAUDE.md).

---

## 3. De redactietafel

Het scherm per editie (voorbeeld: "Redactietafel" in het artifact):

- **De teller** tot de inleverdatum, groot bovenaan, met het verzendmoment
  ernaast en de vermelding dat er pas verstuurd wordt na bevestiging.
- **De rubrieken in de volgorde van de mail**, elk met het gezicht van de
  schrijver en de stand. "6 van 8 binnen" als balk, gekleurd per stand.
- **Een live voorbeeld** dat zich vult terwijl de stukjes binnenkomen. Lege
  rubrieken staan er als stippellijn in, zodat je ziet wat er nog mist.
- **Voorraad** met kandidaten uit de bronnen: één klik zet ze in de editie,
  ingevuld.
- **Wat er gebeurde**: wie leverde in, wie keurde goed, wie kreeg een herinnering.

Wat het een gedeelde ervaring maakt in plaats van een opdracht:

- **Meldingen in het chatkanaal** van de reeks: bij elk ingeleverd stukje, en een
  stand van zaken drie en één dag voor de deadline ("4 van 6 binnen, open:
  korte vraag (Seppe)"). Persoonlijke herinnering op dezelfde momenten.
- **Opmerkingen per stukje**, in beide richtingen (de schrijver ziet ze op zijn
  scherm, de hoofdredactie op de tafel).
- **Naam en foto bij elk stukje in de mail**, en onderaan "Deze brief maakten we
  samen: …". De lezer ziet een bedrijf, de schrijver ziet zijn naam staan.
- **Na de verzending: hoe deed jouw stukje het?** Elke link krijgt de
  bijdrage-id mee (`utm_content=b<id>`), zodat kliks en antwoorden per stukje
  terugkomen bij wie het schreef. Dat is de reden om volgende maand opnieuw te
  schrijven.

### Het schrijfscherm

Voorbeeld: "Thomas schrijft zijn stukje".

- Kies de vorm; het formulier past zich aan (een stelling vraagt opties en een
  koppeling, een link vraagt enkel de URL).
- Typ ruw wat je kwijt wil. "Schrijf het voor me" maakt er een stukje van in de
  toon van die reeks; "Korter", "Warmer" en "Spelling nakijken" werken op wat er
  staat. Altijd een VOORSTEL dat je overneemt, nooit stil vervangen.
- Rechts het stukje zoals het in de mail komt, met dezelfde renderer.
- "Inleveren bij de redactie" of "Later verder" (automatisch bewaard).

---

## 4. Rechten

- **Schrijven**: iedereen met de module, op de eigen opdrachten en in de voorraad.
- **Hoofdredactie** (rubrieken beheren, goedkeuren, inplannen): een subrol, zoals
  `marketing_signature` bij de handtekeningen (`hasModuleSubRoleAccess()`).
- **Inplannen gebeurt altijd met de hand** en kan pas als elk stukje goedgekeurd
  is. Er bestaat geen automatische verzending.

---

## 5. De opmaak

Nieuw ontwerp, vertrekkend van de huisstijl van openvme.be en syndicoach.be
(gemeten op beide sites, 2026-10-09; de twee liggen bijna helemaal gelijk):

| Wat | Waarde |
|---|---|
| Titels | **Gelica** 400 (serif), in de mail met terugval `Georgia, serif` |
| Tekst | **Rethink Sans** 400/500/700, terugval `Helvetica, Arial, sans-serif` |
| Hoofdkleur | `#0369a1` (sky-700) |
| Knop | mint `#99f6e4` met tekst `#0369a1`, vet, radius 6–8 px |
| Tekstkleur | `#4b5563`, titels `#1f2937` / `#030712` |
| Tinten | sky `#f0f9ff` `#e0f2fe` `#bae6fd` · teal `#f0fdfa` `#ccfbf1` `#14b8a6` · roze `#fdf2f8` `#fce7f3` `#ec4899` · oranje `#fff7ed` `#fed7aa` `#f97316` |
| Tekeningen | de "thingies" op `link.openvme.be/assets/brand/thingies/` |

Per merk verschilt enkel de omgevingstint (Syndicoach roze-50, OpenVME sky-50) en
het logo. Professionals volgt OpenVME, met een eigen tint te kiezen.

**Lettertypes in mail.** Apple Mail, iOS en Outlook voor Mac tonen webfonts;
Gmail en Outlook voor Windows niet. Gelica en Rethink Sans worden dus via
`@font-face` aangeboden (vanaf R2) met een terugval die het gevoel bewaart:
Georgia voor de titels. Na te gaan: of de licentie van Gelica gebruik in e-mail
toelaat.

### Blokken (nieuwe set)

| Blok | Gebruik |
|---|---|
| Kop | logo + naam van de reeks + maand/editie |
| Opening | kicker, grote titel, intro, schrijver, tekening |
| In deze editie | genummerd, maakt zichzelf uit de titels |
| Stuk | kicker, titel, tekst, link, optioneel beeld of tekening, schrijver |
| Video | thumbnail met afspeelknop → link (Vimeo/YouTube) |
| Linkkaart | titel + "waarom we dit delen" + link (uit Nieuws & updates of een URL) |
| Agenda | events uit Eventbeheer als datumrijen |
| Stelling | donker blok, stelling in Gelica, 2–4 knoppen |
| Korte vraag / peiling | tint-blok met keuzes als knoppen of pillen |
| Citaat | uitspraak, naam, functie of gebouw |
| Afsluiting | gezichten van wie meeschreef, knop, reply-uitnodiging |
| Voettekst | waarom je dit krijgt, uitschrijven, voorkeuren, bedrijfsgegevens, jaartal |

Regels die de renderer afdwingt in plaats van een mens:

- **Zonder uitschrijflink kan er niet verstuurd worden.** De voettekst is geen
  blok dat je kan weghalen.
- Eén knopstijl en één lettertypereeks per merk; het jaartal is automatisch.
- Het antwoordadres wordt gecontroleerd (domein van het merk).
- Beelden komen uit de Asset Manager (R2), niet van Odoo.
- Tabellen met een `width`-attribuut, zoals in de eventmails (Outlook).
- De bestaande renderer krijgt een tweede **layout** ("marketing") naast die van
  de eventmails. Geen tweede renderer: dezelfde `render-blocks.js`, dezelfde
  bewerklaag.

---

## 6. Vragen in de mail

Een stelling, korte vraag of peiling in de mail. De antwoorden worden in de OM
verzameld en lopen via **een koppeling** naar Odoo.

### Een antwoord is een klik

Een mail kan geen formulier betrouwbaar versturen. Elke optie is daarom een link:

```
https://link.syndicoach.be/t/_v/<stukje>/<optie>?c=<contact-id>&t=<token>
```

Op het merkdomein (dezelfde Worker als de trackbare links). De link opent een
bedankpagina die het antwoord toont, optioneel de tussenstand, en een veld om
kort te zeggen waarom. Een ander antwoord aantikken mag; het laatste telt.

### Het antwoord wordt pas bewaard door de pagina, niet door de klik

Beveiligingsscanners van bedrijven (Microsoft Safe Links, Mimecast) openen
**elke** link in een mail voor de ontvanger dat doet. Zou de GET het antwoord
bewaren, dan heeft elke lezer achter zo'n scanner op alle opties tegelijk
geantwoord. Daarom: de GET toont de pagina, en de pagina zelf post het antwoord.
Scanners voeren die stap in de praktijk niet uit. Zonder JavaScript toont de
pagina een knop "Bevestig mijn antwoord".

### Wie antwoordde

- Odoo personaliseert de mail per ontvanger met QWeb. De OM zet vóór het
  inplannen een willekeurig token in een Studio-veld op `mailing.contact`
  (`x_studio_om_token`), en de link bevat `<t t-out="object.x_studio_om_token"/>`.
  Nooit het e-mailadres in de URL.
- Geen of onbekend token (doorgestuurde of oude mail): het antwoord telt mee als
  **anoniem**, maar gaat niet naar Odoo.
- Een doorgestuurde mail antwoordt in naam van de oorspronkelijke ontvanger. Dat
  is aanvaard en staat op de bedankpagina ("Je antwoord hoort bij je e-mailadres").

### Naar Odoo via een koppeling

- Een nieuwe bronsoort voor koppelingen: **nieuwsbriefvraag**. Elke vraag kiest
  een koppeling (standaard één per reeks, bv. "Nieuwsbrief-antwoorden Syndicoach").
- **Een antwoord rijpt 10 minuten** voor het naar de koppeling gaat: wie van
  antwoord verandert of een toelichting toevoegt, levert dan één inzending op en
  niet drie. Een cron zet rijpe antwoorden door (`pushed_at`).
- De payload heeft dezelfde vorm als bij de OM-formulieren:
  `{ form_id, form_data: { vraag, antwoord, toelichting, email, naam, reeks,
  editie, contact_id } }` → `handleGenericWebhook()`. Aan de pipeline verandert
  niets; alles wat een koppeling kan (notitie, label, lead, activiteit, mail)
  kan op een antwoord.
- De veldenlijst van het koppelingsscherm krijgt een vijfde tak in
  `-detail-lifecycle.js` (zie de regel over de vier bronnen in CLAUDE.md).

### De antwoorden in de OM

Tabblad "Antwoorden" per editie: verdeling per vraag, alle antwoorden met
toelichting, filters (met toelichting, vraagt contact), export, en per antwoord
wat er in Odoo gebeurde.

---

## 7. Verzenden via Odoo

1. De OM rendert de editie tot HTML en maakt een `mailing.mailing`:
   `mailing_model_id` = Mailing List, `contact_list_ids` uit de reeks,
   `body_html` (en `body_arch`, hetzelfde), `subject`, `preview`, `email_from`,
   `reply_to`, `mail_server_id` = 4, `campaign_id` per editie.
2. **Testmail** naar de hoofdredactie of lijst 2 "Test Inhouse".
3. **Bevestigen en inplannen**: `schedule_date` + inplannen in Odoo. Pas na
   een expliciete klik, en enkel als alles goedgekeurd is.
4. Na verzending leest de OM de cijfers terug (`mailing.mailing`, `link.tracker`).

De mailing wordt daarna **nooit meer in de editor van Odoo bewerkt**: die zou
`body_arch` herschrijven (zelfde regel als bij de eventmails).

Waarom niet zelf versturen per `mail.mail`, zoals de eventmails: lijsten,
uitschrijvingen, de blacklist, bounces en de uitschrijflink per ontvanger regelt
Odoo al. Dat zou allemaal nagebouwd moeten worden.

**Eerste technische proef**: één editie met de hand naar "Test Inhouse".
Nagaan:

- komt de HTML ongeschonden aan (sanitizer, `background`-shorthand);
- werkt de uitschrijflink;
- vult QWeb het token in de vraaglinks in;
- wat doet `link.tracker` met een link waarin een QWeb-expressie staat (mogelijk
  moeten die links uit Odoo's klikmeting blijven).

---

## 8. Bronnen voor de voorraad

| Bron | Wat de OM voorstelt |
|---|---|
| Eventbeheer | gepubliceerde events van het merk tussen dit verzendmoment en het volgende (`listEvents()`); een event dat al voorbij is bij verzending komt er niet in |
| Nieuws & updates | berichten gepubliceerd sinds de vorige editie (`listSnippets()`), met hun curatornoot als "waarom we dit delen" |
| LinkedIn | link plakken → titel, beeld en auteur via de bestaande LinkedIn-lezer (verhuist naar `src/lib/`). Geen API: die vraagt goedkeuring van LinkedIn |
| Ideeën | wat collega's zelf in de voorraad zetten |
| Vorige editie | de resultaten van de stelling ("Zo antwoordden jullie") als kant-en-klaar stukje |

Opnemen kopieert de inhoud naar een bijdrage. Een bericht dat daarna in Nieuws &
updates wijzigt, verandert de editie niet.

---

## 9. AI-hulp

- `askAI()` met `{ id: null, source: 'newsletter' }` en een label in
  `SOURCE_LABELS`; dus in het AI-gebruiksrapport.
- De `system`-prompt beschrijft wie we zijn; de toon en doelgroep van de reeks
  staan in de prompt (zelfde verdeling als `article-ai.js`).
- Enkel wat de schrijver aanleverde is bron. Bij een link: de opgehaalde tekst
  (`article-fetch.js`). Geen feiten of cijfers verzinnen.
- Ook voor de hoofdredactie: onderwerp en voorbeeldtekst voorstellen op basis van
  de stukjes, en de inleiding laten verwijzen naar wat erin staat.

---

## 10. Nurture flows (later)

Dezelfde blokken en huisstijl. Wat nu in `x_dynamic_mail_block` staat (tekst per
waarde van een veld, bv. `x_studio_meta_topic_preference`) wordt een variant op
een blok. Eerst de nieuwsbrieven, want die bewijzen de opmaak en de verzending.

---

## 11. Volgorde

1. **Opmaak en proef**: marketinglayout in de renderer, de blokken, de twee
   huisstijlen, één editie met de hand naar "Test Inhouse" via Odoo (§7).
2. **Redactietafel**: reeksen, edities, bijdragen, opdrachten, teller,
   meldingen, opmerkingen, AI-hulp.
3. **Vragen in de mail**: bedankpagina, token, de bronsoort in de koppelingen,
   het tabblad Antwoorden.
4. **Voorraad en bronnen**: events, Nieuws & updates, LinkedIn, ideeën.
5. **Cijfers per stukje** terug naar de schrijver.
6. **Nurture flows**.

Daarna kan de Dynapps-module `openvme_mail_snippets` weg.

---

## 12. Open punten

1. **Doelgroep OpenVME**: lijst 1 (308) of "alle actieve platformgebruikers",
   afgeleid uit Odoo? Bij het tweede kiest de OM de ontvangers en blijft de
   uitschrijving per lijst toch werken.
2. **Professionals**: lijst 15 (1.613, lijkt vooral prospecten), lijst 17 (111)
   of beide? Mogelijk zijn dit twee reeksen.
3. **Ritme per reeks**: maandelijks voor alle drie?
4. **Afzender**: blijft het "Thomas van …", of tekent de hoofdschrijver van de
   editie? In het ontwerp blijft Thomas de afzender en staat elke schrijver bij
   zijn eigen stukje.
5. **Gelica in mail**: licentie nagaan.
6. **Wie is hoofdredactie** per reeks (subrol of per reeks instelbaar).
