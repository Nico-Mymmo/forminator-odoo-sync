# Nieuwsbrieven: nazicht en voorstel (2026-10-15)

Status: **voorstel, nog niets gebouwd.** Dit is een nazicht van de module
`/nieuwsbrieven` zoals ze op 15 oktober 2026 staat, met wat ik zou verbeteren
en in welke volgorde. Het ontwerp waarop de module gebouwd is:
`docs/ontwerp-om-nieuwsbrieven.md`. De afspraken die vastliggen: CLAUDE.md,
"Nieuwsbrieven -- de redactietafel".

De vraag: de module voelt onsamenhangend en weinig intuïtief. Hoe wordt dit
een sterke tool, met een ervaring die gelijkloopt met de rest van de OM, een
kalender zoals bij Events, en een nieuwsbrief die alles uit de andere modules
haalt wat de moeite is?

---

## 1. Wat goed zit en moet blijven

- **De brief zelf is het werkblad.** Je klikt op een blok in de mail en je typt
  erin. Dat is het sterkste idee van de module en de reden waarom collega's
  zonder opleiding iets kunnen bijdragen. Niet loslaten.
- **Eén renderer voor voorbeeld, test en echte mail.** Wat je ziet, is wat er
  vertrekt.
- **De veiligheden bij het versturen** (teststand, testlijst, "VERSTUREN"
  typen, elk beeld bij ons gehost).
- **Berichten uit Nieuws & updates** als blok, altijd de laatste versie, met
  label, vorm en "gedeeld door".
- **Vragen in de mail** met antwoorden via een koppeling naar Odoo.
- **Edities die zichzelf aanmaken** volgens het ritme van de reeks, met een
  opdracht per rubriek.

De bouwstenen zijn er. Wat ontbreekt, is de samenhang: één verhaal van
"wanneer vertrekt wat" tot "hoe deed het".

---

## 2. Waarom het onsamenhangend voelt

Dit zijn de oorzaken, niet de symptomen. Elk punt is nagekeken in de code.

### 2.1 Vier schakelaars op één scherm, die elkaar overlappen

Op de redactietafel staan:

| Schakelaar | Keuzes | Wat hij echt doet |
|---|---|---|
| Tabblad bovenaan | Redactie / Antwoorden | Toont de brief, of de antwoorden op vragen |
| Stand (hoofdredactie) | Inhoud / Opmaak | Opmaak = blokken slepen, kleur, toewijzen; zet het typen UIT |
| Werkblad / Zoals de lezer het ziet | Werkblad / Lezer | Lezer = alles verbergen wat nog leeg is; zet het typen ook UIT |
| Het paneel rechts | Overzicht / Blok / Plaatsen | Wisselt van gedaante naargelang wat je deed |

Twee schakelaars zetten het typen uit. Onderwerp, voorbeeldtekst, datums, de
voorraad en "wat er gebeurde" zitten enkel in de stand **Opmaak**, terwijl ze
niets met opmaak te maken hebben. Wie het onderwerp wil invullen, moet eerst
weten dat hij naar "Opmaak" moet. Dat is de kern van "weinig intuïtief".

### 2.2 Twee schrijfervaringen voor hetzelfde stukje

Een stukje in een editie schrijf je IN de brief. Een idee in de voorraad opent
een eigen pagina met een klassiek formulier links en een voorbeeld rechts.
Zelfde stukje, ander scherm, andere knoppen. Zodra het idee in een editie
komt, verandert alles van plaats.

### 2.3 Er is geen plek die het geheel toont

Het overzicht is reeks per reeks: drie kaarten met elk hun lopende editie.
Niemand ziet in één oogopslag:

- wat er deze maand allemaal vertrekt, over de drie reeksen heen;
- of een editie net voor, op of net na een event valt;
- wanneer de inleverdatums vallen en of die botsen met elkaar;
- wat er vorige maand vertrok en hoe het deed.

Dat is precies wat een kalender oplost, en waarom Events wel overzichtelijk
voelt.

### 2.4 De stappen van een editie zijn onzichtbaar

Een editie gaat van *verzamelen* naar *nalezen* (dat gebeurt stil, zodra de
inleverdatum voorbij is), naar *ingepland* en *verzonden*. In het scherm zie
je dat enkel aan een badge. Wat er nog moet gebeuren voor je mag versturen
(onderwerp, elk stukje bevestigd, test gestuurd, beelden in orde, het
Studio-veld voor de antwoorden) ontdek je pas als je op "Bevestigen en
inplannen" klikt en een foutmelding krijgt. Die controles zitten enkel op de
server.

### 2.5 Dezelfde dingen heten anders

- Een stukje dat binnen is: "Ingeleverd" in de badge, "Doorgegeven" in de
  knop en in de tekst, "ingeleverd" in de chat.
- Een stukje dat marketing goedkeurde: "Bevestigd" in het scherm,
  "goedgekeurd" in het ontwerp en in sommige foutmeldingen.
- Dezelfde datum heet "Verzenddag", "Verzenden", "verzendmoment".

Kleine dingen, maar samen maken ze dat niemand zeker weet wat een woord
betekent.

### 2.6 De reeksinstellingen zijn technisch

Odoo-lijsten vul je in als "19, 1" (nummers met komma's). Het logo is een
adres dat je plakt. Het chatkanaal is een naam die je overtypt uit Mini-apps.
Wie hoofdredactie is, kan je in het scherm niet instellen (open punt 6 in het
ontwerp). Een marketeer kan dit scherm niet zonder hulp invullen.

### 2.7 Inplannen is een datumveld, en daarna is de OM klaar

Het verzendmoment is een datum-en-uur-veld in het paneel. Eens ingepland, kan
je in de OM niets meer: verplaatsen of annuleren moet in Odoo ("Annuleer de
mailing daar eerst"). Een kalender waarop je een editie verschuift, vraagt dat
de OM dat zelf kan.

### 2.8 De rest van de OM weet niet dat de nieuwsbrief bestaat

- Het startscherm toont enkel moduletegels. Wie een stukje moet schrijven,
  ziet dat nergens, tenzij hij de module zelf opent.
- In Nieuws & updates en in Events staat geen knop "In de nieuwsbrief".
- De links in de mail dragen geen campagnecode (utm). Dashboards en Webgedrag
  kunnen een bezoek dus niet aan een editie of een stukje toewijzen; Odoo telt
  wel kliks, maar dat blijft in Odoo.
- Eventbeheer levert enkel een lijstje met data (de agenda). Een event met
  beeld, tekst en inschrijfknop, zoals op de site, bestaat niet als blok.
- Na verzending: één regel cijfers (verzonden, geopend, geklikt). Geen
  "hoe deed jouw stukje het", geen vergelijking met de vorige editie. Dat was
  in het ontwerp de reden voor collega's om volgende maand opnieuw te
  schrijven.

---

## 3. Het voorstel: één verhaal, van kalender tot cijfers

Eén module, vier schermen die logisch op elkaar volgen, en dezelfde taal als
Events.

```
Kalender (of lijst)  ->  Redactietafel  ->  Verzenden  ->  Cijfers
  wanneer wat vertrekt    de brief maken     checklist       wat het opbracht
  + events ernaast        één paneel         + inplannen     per editie en per stukje
```

### 3.1 De kalender als startpunt (zoals Events)

Het overzicht wordt een kalender met daarnaast een lijst, exact zoals Events:
dezelfde kop (titel met icoon, korte uitleg), dezelfde wissel **Kalender |
Lijst**, dezelfde maandnavigatie, dezelfde legende.

Op de kalender:

- **Elke editie is een blokje op haar verzenddag**, in de kleur van haar reeks
  (zoals een event de kleur van zijn type krijgt). Het bolletje erin is de
  stand: verzamelen, nalezen, ingepland, verzonden.
- **De inleverdatum staat er ook**, lichter, een paar dagen ervoor. Zo zie je
  meteen dat de deadline van Syndicoach op dezelfde dag valt als die van
  OpenVME, of in een vakantieweek.
- **De events uit Eventbeheer staan er als achtergrondlaag** (grijs, klikbaar
  naar Events). Marketing ziet in één blik dat een editie twee dagen voor een
  webinar vertrekt, en kan er het event in de kijker in zetten, of de editie
  een dag opschuiven.
- **Klik op een lege dag = nieuwe editie** met die dag als verzenddag (zoals
  "klik op een lege dag = nieuw event"). Je kiest enkel nog de reeks.
- **Klik op een editie = de redactietafel.**
- **Verslepen = verzenddag verplaatsen.** De inleverdatum schuift mee. Een
  ingeplande editie verplaatsen mag ook: de OM zet dan de mailing in Odoo op
  de nieuwe dag (zie 3.3). Verzonden edities staan vast.

Rechts naast de kalender (zoals het detailpaneel bij Events): "Deze maand"
met per reeks de volgende editie en haar voortgang, en "Voor jou" met je open
opdrachten en hun teller. De knop "Idee voor de nieuwsbrief" blijft daar.

De lijst toont alle edities chronologisch, over de reeksen heen, met stand,
"x van y binnen", verzenddag en, voor verzonden edities, de cijfers. Filter
op reeks met klikbare chips, zoals het typefilter bij Events.

Later, niet nu: ook de eventmails (aankondigingen) uit Events op de kalender,
zodat een lezer niet drie mails op één dag krijgt.

### 3.2 Eén redactietafel, één paneel met vaste tabbladen

De brief links blijft zoals hij is. Rechts komt één paneel met vaste
tabbladen in plaats van de wisselende gedaantes en de twee standen:

| Tabblad | Wat erin staat |
|---|---|
| **Blok** | Het gekozen blok: instellingen, wie schrijft het, stand, opmerkingen, bevestigen. Zonder gekozen blok: "Voor jou" en "Te bevestigen". |
| **Editie** | Onderwerp en voorbeeldtekst (met AI-voorstel), verzenddag en inleverdatum, ontvangers (de lijsten met hun aantal), en de **checklist** (3.3). |
| **Toevoegen** | De blokjes, gegroepeerd zoals nu, plus de **bronnen**: events in de periode, berichten sinds de vorige editie, ideeën uit de voorraad, de uitslag van de vorige stelling. Eén klik zet het in de brief. |
| **Verloop** | Wat er gebeurde, wie herinnerd werd, de testmails, en na verzending de antwoorden en cijfers. |

De stand "Opmaak" verdwijnt. Slepen aan het handvat, het kleurbolletje en
"in de inhoudstafel" blijven, maar staan altijd aan voor de hoofdredactie,
ook terwijl ze typt. "Zoals de lezer het ziet" wordt één knop met een oogje
boven de brief, die de brief tijdelijk toont zonder lege blokken en
markeringen. Geen stand meer, dus ook geen tweede manier om het typen uit te
zetten.

De aparte pagina voor een idee in de voorraad verdwijnt ook. Een idee is
enkel titel plus steekwoorden (het venster dat er al is). Het echte schrijven
gebeurt pas in de brief, altijd op dezelfde manier.

### 3.3 Verzenden: een checklist in plaats van een foutmelding

Bovenaan de redactietafel komt een stappenbalk, zoals een bestelling die je
volgt: **Verzamelen → Nalezen → Testen → Inplannen → Verzonden.** De actieve
stap toont wat er nog ontbreekt, in gewone woorden, met een knop ernaast:

- "Onderwerp ontbreekt" → naar het tabblad Editie
- "2 stukjes nog niet bevestigd: Stelling (Seppe), Tip (An)" → klik opent het blok
- "Nog geen testmail gestuurd" → knop Testmail
- "1 beeld kan niet in een mail (WebP)" → klik opent het beeld
- "Het Studio-veld voor de antwoorden ontbreekt in Odoo" → uitleg

Pas als alles groen is, staat "Inplannen" aan. Dezelfde controles die nu op
de server zitten, maar zichtbaar vooraf.

Inplannen zelf blijft zoals het is (teststand, "VERSTUREN" typen). Nieuw: een
ingeplande editie kan in de OM **verplaatst of teruggehaald** worden tot een
uur voor het verzendmoment. De OM annuleert dan de mailing in Odoo en zet ze
opnieuw klaar op de nieuwe dag. Zonder dit kan de kalender geen edities
verslepen.

### 3.4 Dezelfde woorden overal

Eén lijstje, gebruikt in badges, labels in de brief, knoppen, chat en de
kalender:

- Stukje: **Open · Bezig · Ingeleverd · Bevestigd**
- Editie: **Verzamelen · Nalezen · Ingepland · Verzonden**
- Datums: **Inleverdatum** en **Verzenddag**

"Doorgegeven" en "goedgekeurd" verdwijnen uit het scherm.

### 3.5 Reeksinstellingen in gewone taal

- Odoo-lijsten: kiezen uit een lijst met naam en aantal contacten, niet
  nummers typen.
- Logo: kiezen uit Assetbeheer.
- Chatkanaal: kiezen uit het kanaalregister.
- Hoofdredactie: collega's aanvinken.
- Kleur van de reeks: een merkkleur, dezelfde als op de kalender.
- Ritme: "Elke maand op de 15e om 9u, inleveren 3 werkdagen ervoor", als één
  zin met invulvakjes, met daaronder de eerstvolgende drie verzenddagen die
  daaruit volgen.

### 3.6 Inhaken op de andere modules

De nieuwsbrief moet de plek zijn waar alles samenkomt wat de OM al weet. Per
module, wat erin kan, en in welke richting:

| Module | Naar de nieuwsbrief | Vanuit de module |
|---|---|---|
| **Events** | Nieuw blok **Event in de kijker**: beeld, titel, datum, tekst en inschrijfknop, zoals de eventkaart op de site. De agenda-lijst blijft voor de rest. Bronnen in "Toevoegen": events tussen verzending en volgende editie, met inschrijvingsstand. Events als laag op de kalender. | Knop **In de nieuwsbrief** op een event: zet het in de voorraad van de reeks van dat merk, of meteen in de open editie. |
| **Nieuws & updates** | Zit al goed (Eén bericht, Kort nieuws). | Bij publiceren een vinkje **Voorstellen voor de nieuwsbrief**; de chatkaart die er al is krijgt een knop. |
| **Dashboards / Webgedrag** | In de module: "x nieuwe inschrijvingen sinds de vorige editie" per reeks, en de groei van de lijst. | Elke link in de mail krijgt een campagnecode (utm) per editie en per stukje. Zo tellen bezoeken, aanvragen en inschrijvingen per editie mee in Marketing, zonder dat iemand iets moet doen. Dit is één aanpassing in de renderer. |
| **Koppelingen (formulieren)** | Nieuw automatisch blok **Zo antwoordden jullie**: de uitslag van de stelling van vorige editie, kant-en-klaar (stond in het ontwerp, §8). | Antwoorden gaan al naar een koppeling. |
| **Boekingslinks** | Blok **Plan een gesprek**: foto en naam van een collega (uit Odoo, zoals de handtekening) met zijn boekingslink. | |
| **Handtekeningen** | | Naast "event in de kijker" in de handtekening ook "schrijf je in op de nieuwsbrief" of "lees de laatste editie". |
| **Startscherm** | | Kaart **Voor jou**: je open stukjes met hun teller, en voor marketing de volgende verzenddagen. Dezelfde kaart als in het paneel. |
| **Mini-apps (chat)** | Blijft: herinneringen in het kanaal van de reeks. | Nieuw: bij "Ingepland" en "Verzonden" een bericht met de cijfers na 48 uur. |
| **Academy** | Later: blok **Cursus**, met de knop naar de academy. | |
| **AV-slides** | Tekeningen zitten al in de mail. | |

### 3.7 Na verzending: leren

Tabblad Verloop na verzending: de cijfers uit Odoo (verzonden, geopend,
geklikt, uitgeschreven), de antwoorden op vragen, en **per stukje** de kliks
(dankzij de campagnecode) en de bezoeken op de site. In "Voor jou" op het
startscherm: "Jouw stukje in de oktober-editie: 84 kliks, het meest gelezen
van de brief." Een vergelijking met de vorige editie van dezelfde reeks
ernaast.

Een webversie ("bekijk in je browser") hoort hier ook bij: dezelfde renderer,
één publieke pagina per verzonden editie, en meteen een link om te delen op
LinkedIn.

---

## 4. Volgorde

Elke fase levert op zich iets op en kan apart live.

**Fase 1: samenhang (de redactietafel).** Checklist en stappenbalk; het
paneel met vaste tabbladen; de stand Opmaak weg en "Zoals de lezer het ziet"
als knop; dezelfde woorden overal; de aparte ideeënpagina weg;
reeksinstellingen met keuzelijsten. Geen nieuwe gegevens nodig. Dit haalt het
"weinig intuïtief" weg.

**Fase 2: de kalender.** Kalender en lijst over de reeksen heen, met
inleverdatums en events als laag; nieuwe editie vanaf een dag; verslepen;
een ingeplande editie verplaatsen of terughalen (ook in Odoo). Dit haalt het
"onsamenhangend" weg.

**Fase 3: inhaken.** Campagnecodes in elke link (eerst, klein en met het
grootste effect); Event in de kijker; knoppen "In de nieuwsbrief" in Events
en Nieuws & updates; de kaart op het startscherm; Zo antwoordden jullie; Plan
een gesprek; de handtekening.

**Fase 4: leren.** Cijfers per stukje, vergelijking tussen edities, de
webversie, de melding met cijfers in de chat.

De open punten uit het ontwerp (§12: doelgroep OpenVME, de twee Pro-lijsten,
wie hoofdredactie is per reeks) blijven beslissingen voor marketing. Fase 1
maakt ze wel instelbaar zonder hulp.

---

## 5. Wat ik nodig heb om te beginnen

1. Mag de OM een ingeplande mailing in Odoo annuleren en opnieuw klaarzetten
   wanneer iemand een editie op de kalender verschuift? Zonder dat kan de
   kalender enkel edities tonen, niet verplaatsen.
2. Een kleur per reeks (Syndicoach roze, OpenVME blauw, Pro: te kiezen).
3. Akkoord dat "Opmaak" als aparte stand verdwijnt en slepen altijd aan staat
   voor de hoofdredactie.

---

## 6. Voor wie het bouwt

Kort, zodat het bij de rest van de OM past.

- **Kalender**: dezelfde FullCalendar als `public/events-v2.html`
  (`dayGridMonth`, `firstDay: 1`, `locale: 'nl'`, `timeZone: Europe/Brussels`,
  `dateClick` voor een nieuwe editie, `eventDrop` voor verplaatsen). Dezelfde
  kop en wissel Kalender | Lijst als in Events; legende: vulkleur = reeks,
  bolletje = stand. Nieuwe route `GET /api/editions?from&to` over alle reeksen,
  met voortgang; de events komen via `eventsVoorEditie()`/`listEvents()` uit
  Eventbeheer, nooit een eigen Odoo-query.
- **Verplaatsen van een ingeplande editie**: in `odoo-mailing.js` een
  `verplaatsMailing()` die `action_cancel` doet op de `mailing.mailing`, de
  `schedule_date` zet en `action_put_in_queue` opnieuw uitvoert; enkel zolang
  de mailing in Odoo nog `in_queue` is. Het bestaande verbod "annuleer in
  Odoo eerst" in `POST /api/editions/:id/cancel` vervalt dan.
- **Checklist**: één functie `klaarVoorVerzending(env, series, edition)` die
  dezelfde controles doet als de schedule-route en een lijst
  `{ ok, items: [{ key, label, ok, actie }] }` teruggeeft; de route gebruikt
  ze ook, zodat scherm en server nooit uiteenlopen.
- **Campagnecodes**: in `render.js` één plek waar elke uitgaande link
  `utm_source=nieuwsbrief&utm_medium=email&utm_campaign=<reeks>-<editie>&utm_content=<stukje>`
  krijgt (niet op de uitschrijflink en niet op de antwoordlinks). Webgedrag
  herkent `utm_medium=email` al als kanaal "E-mail".
- **Event in de kijker**: een `kind` `event_card` met `event_id`; de inhoud
  komt bij elke weergave uit Eventbeheer (zoals `metActueleBerichten()` dat
  voor berichten doet), beeld gehost zoals de andere beelden.
- **Startscherm**: `listMine()` bestaat al; het startscherm (`home/ui.js`) is
  server-gerenderd en kan die kaart meteen tonen.
- **Woorden**: `NB.STATUS` en `NB.EDITIE_STATUS` in `newsletters-core.js`
  worden de enige bron; de knopteksten in `newsletters-contribution.js`
  ("Klaar, geef door aan marketing", "Doorgegeven") en de chat volgen die.
- **Designsysteem**: de drie `window.confirm()`-vensters (blok weghalen,
  editie annuleren, bericht vervangen) worden daisyUI-modals, zoals
  `docs/design-system.md` vraagt.
- Grote bestanden (`newsletters-edition.js`, `-contribution.js`, `render.js`,
  `routes.js`): enkel via de verplichte procedure uit CLAUDE.md
  (Python-script, byte-controle, `node --check`).
