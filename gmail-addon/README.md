# OpenVME — mail bij een lead (Gmail-add-on)

Toont bij elke geopende mail of de afzender al bij een lead in Odoo hoort, en
laat je in één klik vastleggen dat dat zo is.

**Deze add-on vangt geen mail op.** Dat gebeurt automatisch, elke vijf minuten,
door de module `gmail-chatter` in de Operations Manager. De add-on bestaat voor
de *uitzonderingen*: iemand die schrijft vanaf een ander adres dan het adres dat
op de lead staat. Je legt dat hier één keer vast, en vanaf dan loopt zijn mail
weer automatisch mee — ook zijn oude mail wordt meteen alsnog geplaatst.

## Wat er gebeurt als je een mail opent

| situatie | wat de kaart toont |
|---|---|
| Het adres staat op een lead | *"Automatisch herkend"* + hoeveel mails er al in de chatter staan |
| Er is een uitzondering vastgelegd | *"Vastgelegd als uitzondering"* + de lead |
| Onbekend adres | *"Nog niet gekoppeld"* + knoppen **Aan een lead hangen** / **Nooit** |

## Installeren

### 1. Het script aanmaken

1. Ga naar [script.google.com](https://script.google.com) → **Nieuw project**
2. Noem het project bv. `OpenVME Gmail add-on`
3. Plak de inhoud van `Code.gs` in het codebestand
4. **Project­instellingen** (tandwiel links) → vink **"appsscript.json-manifestbestand weergeven in de editor"** aan
5. Terug naar de editor → open `appsscript.json` → plak de inhoud van dit bestand

> **Rol je sowieso uit naar het team? Doe dan eerst stap 5.**
> Bij het koppelen aan een eigen GCP-project verandert de client-id, en dan moet
> je stap 2 en 3 opnieuw doen. Wie het meteen goed wil, wisselt eerst van
> project en haalt de client-id daarna één keer op.

### 2. De client-id ophalen

De Worker moet weten welk script hij mag vertrouwen. Zonder die controle zou
élk Google-token van eender welke toepassing hier geldig zijn.

1. Kies in de editor de functie **`toonMijnClientId`** en klik **Uitvoeren**
2. Geef de gevraagde toestemmingen (dit is de eerste keer dat het script draait)
3. Open **Uitvoeringslogboek** onderaan — daar staat:
   `GMAIL_ADDON_CLIENT_ID = 1234...apps.googleusercontent.com`

### 3. De secret zetten in de Worker

```bash
npx wrangler secret put GMAIL_ADDON_CLIENT_ID
```

Plak de waarde uit stap 2. Daarna `npm run deploy`.

### 4. Testen op je eigen account

1. In de Apps Script-editor: **Implementeren → Implementaties testen**
2. Klik **Installeren** (en daarna **Gereed**)
3. Open Gmail, herlaad de pagina, en open een mail. Het OpenVME-icoon staat
   rechts in de zijbalk.

Werkt het niet meteen: Gmail cachet add-ons stevig. Hard herladen
(`Ctrl+Shift+R`) of Gmail in een nieuw tabblad openen.

### 5. Uitrollen naar het hele team

Testimplementaties gelden alleen voor jezelf. Voor de rest van het team moet het
script aan een **eigen GCP-project** hangen — een nieuw Apps Script-project
gebruikt standaard een door Apps Script beheerd project, en daarmee weigert
"Nieuwe implementatie → Add-on".

1. **console.cloud.google.com** → het project van het service-account
   (`operations-signature-manager`) → noteer het **projectnummer** (cijfers, op
   het dashboard — niet de project-id)
2. In dat project: **OAuth-toestemmingsscherm** instellen op **Intern**. Zonder
   dat weigert Apps Script de wissel.
3. Apps Script → **Projectinstellingen** → *Google Cloud Platform-project* →
   **Project wijzigen** → projectnummer plakken
4. **De client-id is nu veranderd.** Draai `toonMijnClientId` opnieuw en werk de
   secret `GMAIL_ADDON_CLIENT_ID` bij, anders krijgt iedereen
   `Token is niet voor deze toepassing`.
5. **Implementeren → Nieuwe implementatie** → type **Add-on** → implementeren
6. In het GCP-project: **Google Workspace Marketplace SDK** inschakelen →
   *App-configuratie* invullen, zichtbaarheid **Privé (alleen mijn domein)**
7. **Admin Console** → Apps → Google Workspace Marketplace-apps → de app
   installeren voor het domein of voor een specifieke organisatie-eenheid

**Je collega's installeren niets.** Na stap 7 verschijnt de add-on vanzelf in hun
Gmail-zijbalk (soms pas na een hard herladen; bij een domeinbrede uitrol kan het
tot 24 uur duren). Laat ze vooral géén eigen Apps Script-project maken: dan
krijg je een script per persoon met elk een eigen client-id, en past er geen
enkele waarde meer in `GMAIL_ADDON_CLIENT_ID`.

### Zien is niet hetzelfde als meedraaien

Twee losse knoppen, en dat is bewust:

| | bepaald door |
|---|---|
| De add-on **zien** in Gmail | de installatie in de Admin Console |
| Je mailbox wordt **gelezen** | de secret `GMAIL_CHATTER_USERS` |

Een collega die de add-on ziet maar niet in `GMAIL_CHATTER_USERS` staat, krijgt
een lege kaart. Per persoon die meedoet zet je zijn adres erbij:

```bash
npx wrangler secret put GMAIL_CHATTER_USERS
```

```
nico@mymmo.com,thomas@mymmo.com,elisa@mymmo.com
```

Die scheiding is er met opzet: de add-on uitrollen kan nooit per ongeluk
iemands mailbox laten uitlezen.

## Foutmeldingen

| melding | betekenis |
|---|---|
| `GMAIL_ADDON_CLIENT_ID is niet ingesteld` | Stap 3 overgeslagen |
| `Token is niet voor deze toepassing` | De secret bevat een andere client-id dan dit script |
| `Geen actieve OM-gebruiker` | Het Google-account hoort niet bij een actieve gebruiker in de Operations Manager |
| `Not Found` | De Worker draait nog zonder de add-on-routes — `npm run deploy` |
| `An explicit urlFetchWhitelist is required...` | Het `urlFetchWhitelist`-blok ontbreekt in `appsscript.json`. Een testimplementatie dwingt dat niet af, een echte wel — dus deze fout zie je pas bij het uitrollen. |

## Bestanden in de Worker

| wat | waar |
|---|---|
| Endpoints van de add-on | `src/modules/gmail-chatter/addon-routes.js` |
| Tokenverificatie | `src/modules/gmail-chatter/lib/addon-auth.js` |
| Koppelen (gedeeld met het OM-scherm) | `src/modules/gmail-chatter/lib/linking.js` |
| Aansluiting buiten de auth-gate | `src/router/public-routes.js` |
