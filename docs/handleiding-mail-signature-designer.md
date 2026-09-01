# Handleiding — Mail Signature Designer

*Voor gebruikers van de Operations Manager. Deze handleiding legt uit hoe je je e-mailhandtekening opmaakt, wat marketing kan aanvullen, hoe je aliassen een apart adres geeft, en hoe je een compacte versie maakt.*

> **Screenshots:** de schermafbeeldingen die hieronder aangeduid staan met **[Screenshot X]** zijn apart doorgestuurd in de chat. Sleep ze op de juiste plek in je Odoo Knowledge-artikel — ze konden niet automatisch in dit bestand ingevoegd worden.

---

## 1. Waar vind je dit?

Ga naar **Operations Manager → Signature Designer** (`/mail-signatures`). Je landt op het tabblad **"Mijn handtekening"** — dit is het enige tabblad dat je als gewone gebruiker ziet. De tabbladen "Marketing", "Push", "Logs" en "Administratie" zijn enkel zichtbaar voor de marketing-/adminrol.

**[Screenshot 1 — volledig overzicht "Mijn handtekening" met live preview rechts]**

Rechts zie je steeds een **live preview** die automatisch meebeweegt met wat je links invult. Bovenaan de preview kan je wisselen tussen desktop/mobiel-weergave en licht/donker, en met **"Kopiëren"** kopieer je de opgemaakte handtekening (klaar om te plakken in Gmail → Instellingen → Handtekening).

---

## 2. Hoe bouw je je handtekening op

Bovenaan staat een keuzelijst (standaard op **"Standaard"**) — dit is je **variant-selector**, waarover meer in punt 5. Daaronder vind je het blok **"Mijn gegevens"**:

- **Groet, Naam, Functietitel** — laat je dit leeg, dan wordt automatisch de waarde uit Odoo gebruikt (je krijgt dit te zien als grijze placeholder-tekst, bv. *"Nico Plinke (via Odoo)"*). Vul je zelf iets in, dan overschrijft dat de Odoo-waarde.
- Elk veld heeft een **"toon"-vinkje** ervoor. Zet je dit uit, dan verdwijnt dat onderdeel volledig uit je handtekening — ook als er een Odoo-waarde beschikbaar is.
- **E-mailadres**: leeg = je eigen Google-adres. Enkel invullen als je een handtekening voor een **alias** (ander verzendadres) instelt.
- **Profielfoto**: komt automatisch uit je Google Workspace-profiel; je kan ze enkel tonen/verbergen, niet vervangen via dit scherm.

Alles wat je hier instelt wordt automatisch en continu opgeslagen (zie het statuslampje boven de live preview: "Opgeslagen" / "niet-opgeslagen wijzigingen").

---

## 3. De aparte blokken

Onder "Mijn gegevens" vind je een reeks **inklapbare blokken** — elk optioneel, elk met een eigen aan/uit-schakelaar:

**[Screenshot 2 — de collapsed lijst van blokken: Meeting link, Mijn LinkedIn post, Marketing event, Inspirerende quote, Persoonlijke disclaimer, Aliassen]**

| Blok | Wat het doet |
|---|---|
| **Bedrijf** | Kies met de twee vinkjes (OpenVME / Syndicoach) voor welk bedrijf/bedrijven je een klikbaar logo-badge wil tonen (zie punt 4). |
| **Meeting link** | Voegt een klein tegeltje toe met een link naar je Calendly- of Google Meet-pagina ("Even sparren?"). |
| **Mijn LinkedIn post** | Toont je meest recente LinkedIn-post als visuele blok (auteur, tekst, likes) — haalt de data automatisch op als je een post-URL invult. |
| **Marketing event** | **Niet door jou instelbaar** — dit blok verschijnt automatisch zodra marketing een event actief zet (zie punt 4). Je kan het zelf enkel **verbergen** voor jouw handtekening met een toggle, niet aanpassen. |
| **Inspirerende quote** | Een citaat met auteur/datum, puur decoratief, jouw eigen tekst. |
| **Persoonlijke disclaimer** | Je eigen juridische tekst onderaan. Vul je niets in, dan wordt automatisch de standaard-disclaimer van marketing getoond (als die actief is — zie punt 4). |
| **Aliassen** | Koppel een variant van je handtekening aan een specifiek verzendadres. Zie punt 5. |

**[Screenshot 3 — Meeting link-blok opengeklapt met de toggle]**

---

## 4. Wat marketing aanvult, en de regels

Marketing beheert een aantal instellingen op het tabblad **"Marketing"** (niet zichtbaar voor gewone gebruikers) die gelden voor **iedereen tegelijk**:

- **Merkkleur** (`brandColor`) — de accentkleur die overal in je handtekening gebruikt wordt (links, randjes, iconen).
- **Actieve event-promotie** — als marketing een event activeert (titel, datum, afbeelding, inschrijflink), verschijnt dat automatisch in ieders handtekening als apart blok.
- **Fallback-banner** — een vaste banner-afbeelding die getoond wordt als er geen actief event is.
- **Standaard-disclaimer** — de juridische tekst die gebruikt wordt als jij zelf geen persoonlijke disclaimer hebt ingevuld.

**De regels (belangrijkste eerst):**

1. **Jouw eigen invoer wint altijd.** Vul je zelf een disclaimertekst in, dan wordt die gebruikt — nooit de marketing-standaard.
2. **Een event van marketing kan je niet aanpassen, enkel verbergen** voor je eigen handtekening (toggle in het "Marketing event"-blok). Zodra marketing een ander/nieuw event activeert, wordt die "verberg"-keuze automatisch gereset — je ziet het nieuwe event dus opnieuw tenzij je het opnieuw verbergt.
3. **Bedrijf/logo is uitsluitend een keuze van jou**, niet van marketing: marketing bepaalt geen naam of website meer voor "je bedrijf" — jij vinkt zelf OpenVME en/of Syndicoach aan, en elk gekozen bedrijf toont een klikbaar logo-badge die naar de bijhorende homepage (openvme.be / syndicoach.be) linkt. Vink je niets aan (of heb je nog nooit iets gekozen), dan worden **standaard beide** getoond.
4. **LinkedIn-post, meeting link en quote zijn 100% van jou** — marketing kan en mag dit niet overschrijven.

---

## 5. Meerdere aliassen, elk met een eigen adres/variant (blijft gesynced)

Heb je in Gmail meerdere verzendadressen ("send as"/aliassen, bv. `nico@openvme.be` en `nico@syndicoach.be` naast je hoofdadres), dan kan je aan **elk van die adressen een eigen variant van je handtekening koppelen**. Dit is de eerste, blijvend-gekoppelde toepassing van varianten.

**Stap voor stap:**

1. Maak eerst de varianten die je nodig hebt via de keuzelijst bovenaan ("Standaard" → **"+ Nieuw variant…"**) — bv. een variant **"Openvme"** en een variant **"Syndicoach"**, elk met het bijhorende bedrijfsvinkje aangevinkt in het "Bedrijf"-blok.
2. Klap daarna het blok **"Aliassen"** open onderaan je instellingen. Je ziet een tabel met al je echte Gmail-verzendadressen (opgehaald live uit Gmail) en een kolom **"Variant"** per adres.
3. Kies per alias-rij welke variant gepusht moet worden — bv. variant "Openvme" bij `nico@openvme.be`, variant "Syndicoach" bij `nico@syndicoach.be`. Laat op **"— Standaard —"** staan voor adressen die gewoon je hoofdhandtekening moeten gebruiken.
4. Klik **"Toewijzingen opslaan"**.
5. Klik onderaan op **"Naar mijn Gmail pushen"** — dit stuurt voor elk adres de juiste, samengestelde handtekening apart naar Gmail.

**[Screenshot 4 — Aliassen-tabel met echte voorbeeldtoewijzing: hoofdadres op Standaard, twee aliassen elk op een eigen variant]**

**Dit blijft gesynchroniseerd:** de koppeling (welke variant bij welk adres hoort) blijft staan tot je ze zelf wijzigt. Pas je later iets aan in de variant "Openvme" (tekst, blokken aan/uit, …) en klik je daarna gewoon opnieuw op **"Naar mijn Gmail pushen"**, dan wordt automatisch de bijgewerkte versie naar dat adres gestuurd — je moet niets opnieuw toewijzen.

> Let op: dit werkt enkel voor de **"nieuw bericht"-handtekening** in Gmail. Zie punt 6 voor de reply/forward-handtekening, die hier volledig los van staat.

---

## 6. Een compacte reply-handtekening maken (wordt NIET gesynced)

Dit is een **ander gebruik van varianten**, los van de aliassen hierboven: een korte versie van je handtekening — zonder telefoonnummer, LinkedIn-blok of quote — die je zelf plakt in Gmail's **"handtekening voor antwoorden/doorsturen"**-veld (het tweede tekstvak in Gmail's instellingen, naast het "nieuw bericht"-veld). Dat veld gebruik je meestal in reply's, waar je geen lange handtekening met logo's en blokken wil.

1. Klik op de keuzelijst bovenaan ("Standaard") en kies **"+ Nieuw variant…"**.
2. Geef de variant een herkenbare naam, bv. **"Short"** of **"Compact"**.
3. Schakel binnen die variant de blokken uit die je niet wil (telefoonnummer verbergen, LinkedIn-blok uit, quote uit, …).
4. De live preview toont meteen het resultaat — enkel naam, functie en eventueel de bedrijfsbadge, zonder de extra blokken:

**[Screenshot 5 — variant-selector open met Standaard/Syndicoach/Openvme/Short/+Nieuw variant, en de compacte "Short"-preview ernaast]**

5. Klik **"Kopiëren"** boven de live preview, en plak de HTML **handmatig** in Gmail → Instellingen → "handtekening voor antwoorden/doorsturen".

**Waarom dit niet gesynchroniseerd blijft:** in tegenstelling tot punt 5 (aliassen) is er hier **geen enkele koppeling**, ooit — dit is een eenmalige kopie-plak-actie. Pas je nadien iets aan in "Short", dan verandert er niets in Gmail; je moet zelf opnieuw kopiëren en opnieuw plakken. Reden: Gmail's eigen publieke API biedt (nog) geen manier om die aparte "antwoorden/doorsturen"-handtekening programmatisch te zetten — enkel de "nieuw bericht"-handtekening (met of zonder alias, zie punt 5) kan dit systeem automatisch pushen. Dit is een beperking langs Google's kant, niet van deze tool.

**Daarom:** behandel je reply-variant als een handtekening waar je liefst zo weinig mogelijk aan verandert — elke wijziging betekent immers een handmatige kopieer-en-plak-ronde in Gmail. Hou hem eenvoudig en stabiel.

> Basisgegevens (naam, functietitel, telefoonnummer, …) worden wel altijd gedeeld tussen alle varianten: wijzig je die in "Mijn gegevens", dan trekt dat automatisch door naar "Short" én naar "Openvme"/"Syndicoach". Enkel de blok-instellingen (aan/uit, teksten) binnen een variant blijven volledig apart per variant.

---

## Kort overzicht

| Wat | Waar | Automatisch gesynchroniseerd? |
|---|---|---|
| Naam, functie, telefoon, bedrijf, foto | "Mijn gegevens" | Ja, naar alle varianten en Gmail (nieuw bericht) |
| Marketing-branding, event, disclaimer-standaard | Marketing-tab (niet zichtbaar voor jou) | Ja, automatisch voor iedereen, tenzij je zelf overschrijft |
| Alias-variant, bv. "Openvme"/"Syndicoach" per adres | "Aliassen"-blok | **Ja, blijvend** — koppeling blijft staan; bewerk de variant en klik opnieuw op "pushen" |
| Reply-variant, bv. "Short" (handmatig in Gmail's reply-veld) | Variant-selector + handmatig kopiëren | **Nee, nooit** — puur handmatig kopiëren/plakken, geen koppeling mogelijk |
