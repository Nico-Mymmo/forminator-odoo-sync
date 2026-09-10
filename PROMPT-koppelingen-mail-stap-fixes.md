# Koppelingen: 4 bugs/verbeteringen na toevoegen mailstap ("send_mail")

## Lees eerst
- `public/forminator-sync-v2-detail-add-target-wizard.js`
- `public/forminator-sync-v2.html` (dialog `#addTargetDialog`, regels ~563-601)
- `public/forminator-sync-v2-detail.js` (regels ~222-262, header-trail)
- `public/forminator-sync-v2-core.js` (regels ~675-700, kaart-trail in de lijst; regels ~432-516, filterbar + `getVisibleIntegrations`)
- `public/forminator-sync-v2-bootstrap.js` (regels ~1720-1795, filter-event-wiring)
- `public/forminator-sync-v2-detail-mapping-tab.js` (regels ~59-245, stap-kaart in de pipeline-detail)
- `src/modules/forminator-sync-v2/database.js` (functie `getIntegrationWarnings`, regels ~1299-1370)
- `CLAUDE.md`

## Context

We hebben recent een nieuw stap-type toegevoegd aan de koppelingenmodule (`/forminator-v2`): **`send_mail`** ("Mail versturen"), naast de bestaande `chatter_message`, `create_activity` en `mailing_list` stap-typen. Een mailstap hangt altijd aan een eerdere stap (bv. Contact/res.partner) — hij erft `odoo_model` van die parent-stap, maar schrijft zelf niets naar dat model; hij verstuurt enkel een mail naar het record uit die stap.

Bij het testen zijn 4 problemen naar boven gekomen. Alle vier hangen samen met het feit dat `send_mail` (en soms `mailing_list`) op een aantal plekken niet is meegenomen in logica die oorspronkelijk alleen rekening hield met `upsert`/`create`/`update_only`/`chatter_message`/`create_activity`.

### 1. Tekst valt uit de knoppen in de "Stap toevoegen" popup

In `renderAddTargetDialog()` (`forminator-sync-v2-detail-add-target-wizard.js`, regels ~29-67) worden de 4 "SPECIAL"-kaarten (Chatter-bericht, Activiteit, Mailinglijst, Mail versturen) gerenderd als knoppen met een titel + een beschrijving op een tweede regel:

```js
'<span class="text-left"><span class="font-semibold">' + esc(s.label) + '</span>' +
  '<span class="block text-xs font-normal opacity-70">' + esc(s.desc) + '</span></span>'
```

De knop zelf heeft alleen `btn btn-outline w-full justify-start gap-3` (zie ook `forminator-sync-v2.html` regel 570: container is `grid grid-cols-2 gap-2` zonder expliciete rij-hoogte). DaisyUI's `.btn`-klasse legt een vaste hoogte op die voor een label van één regel prima is, maar niet meegroeit met een label + subtekst op twee regels. Zolang er een oneven aantal special-kaarten was, kreeg de laatste kaart (Mailinglijst) `col-span-2` en dus meer breedte/minder de neiging om te clippen; nu er 4 kaarten zijn (even aantal, `isOrphan` triggert niet meer) staan Mailinglijst en Mail versturen naast elkaar in de knellende layout, en de tekst van vooral "Mail versturen" loopt over de rand van de knop heen (zie screenshot).

### 2. In de trail wordt de stap verkeerd benoemd ("Contact" i.p.v. "Mail")

Er zijn twee plekken waar de keten van stappen als badges/breadcrumb wordt getoond, en beide kennen wél een speciale label voor `chatter_message`/`create_activity`/`mailing_list`, maar niet voor `send_mail` — die valt dus terug op de kale modelnaam (bv. "Contact"):

- `forminator-sync-v2-detail.js`, in `renderDetail()` (regels ~242-254): de stappen-badges bovenaan het detailscherm van een koppeling.
  ```js
  if (t.operation_type === 'chatter_message') {
    stepLabel = 'Notitie bij ' + modelLabel;
  } else if (t.operation_type === 'create_activity') {
    stepLabel = 'Activiteit bij ' + modelLabel;
  } else if (t.operation_type === 'mailing_list') {
    stepLabel = 'Mailinglijst';
  } else {
    stepLabel = modelLabel;   // <-- send_mail valt hier ook in
  }
  ```
- `forminator-sync-v2-core.js`, in de lijst-kaart rendering (regels ~688-697): dezelfde soort `_lbl`-berekening, ook zonder `send_mail`-tak.

Ter referentie: `forminator-sync-v2-detail-mapping-tab.js` (regels ~85-89) heeft dit voor de stap-kaart in de pipeline-detail *wel* al correct opgelost (`opTypeLbl = 'Mail naar ' + _mlLbl`, `stepName = 'Mail'`) — gebruik die aanpak als voorbeeld voor de twee plekken hierboven.

### 3. "Verplichte velden ontbreken" klopt niet voor mailstappen

`getIntegrationWarnings()` in `src/modules/forminator-sync-v2/database.js` (regels ~1305-1370) berekent per stap welke verplichte Odoo-velden nog niet gemapt zijn. De filter die stappen zonder "gewone" veldmappings moet overslaan, houdt alleen rekening met `chatter_message` en `create_activity`:

```js
const relevantTargets = (targets || []).filter(t =>
  requiredByModel[t.odoo_model] &&
  t.operation_type !== 'chatter_message' &&
  t.operation_type !== 'create_activity'
);
```

Een `send_mail`-stap erft `odoo_model` van zijn parent-stap (bv. `res.partner`), heeft dus vrijwel altijd verplichte velden in `requiredByModel`, maar heeft zelf nooit `mappings`-records (zijn configuratie zit in de `mail_*`-kolommen, niet in de `mappings`-tabel). Daardoor komt zo'n stap altijd 100% als "X verplichte velden ontbreken" naar boven, terwijl dat niet van toepassing is. Hetzelfde geldt vermoedelijk voor `mailing_list` (schrijft naar `mailing.contact` via een JSON-config in `chatter_template`, niet via `mappings`) — check dit en sluit ook dat type uit als het hetzelfde patroon volgt.

### 4. Extra: model-badge en link-icoon op de mailstap-kaart

Bij het reviewen van de stap-kaart zelf (`forminator-sync-v2-detail-mapping-tab.js`) zijn nog twee kleinere inconsistenties gevonden die je in dezelfde beurt kan meenemen:

- **Model-badge is overbodig/verwarrend voor `send_mail`.** Regel ~176 toont de rauwe `target.odoo_model` (bv. `res.partner`) vóór de `opTypeLbl`, behalve voor `chatter_message`:
  ```js
  if (target.operation_type !== 'chatter_message') {
    html += '<span class="font-mono">' + esc(target.odoo_model) + '</span>' + '<span>·</span>';
  }
  ```
  Voor `send_mail` is `opTypeLbl` al `"Mail naar <Model>"`, dus de losse modelbadge ernaast (`res.partner · Mail naar Contact`) herhaalt dezelfde info op een technische en een menselijke manier. Sluit `send_mail` hier uit, net als `chatter_message`.
- **Link-icoon (gekoppeld aan vorige stap) ontbreekt voor mailstappen.** Regels ~106-136 bouwen `chainDeps` op uit `mappingsByTarget`/`_extraRowsByTarget` (`previous_step_output`-mappings) en, specifiek voor `create_activity`, uit `target.activity_res_id_source`:
  ```js
  var _actResIdSrc = target.operation_type === 'create_activity' ? (target.activity_res_id_source || '') : '';
  ...
  if (_actResIdSrc && !chainSourceRows.includes(_actResIdSrc)) {
    chainSourceRows = chainSourceRows.concat([_actResIdSrc]);
  }
  ```
  Een mailstap heeft zijn eigen keten-koppeling in `target.mail_res_id_source` (zie `forminator-sync-v2-detail-add-target-wizard.js` regel ~307, `mail_res_id_source: 'step.' + mailParentOrder + '.record_id'`), maar dat veld wordt hier niet meegenomen. Daardoor toont een mailstap nooit het `link-2`-icoon ("Gekoppeld aan vorige stap"), ook al is hij wel degelijk aan een vorige stap gekoppeld. Voeg `mail_res_id_source` op dezelfde manier toe als `activity_res_id_source`.

### 5. Filterbar: filter op koppelingtype ontbreekt

De filterbalk boven de lijst (`renderListToolbar()` in `forminator-sync-v2-core.js`, regels ~432-474) heeft nu: zoeken op naam, status (alle/actief/inactief), tags, en sortering. Er is geen manier om te filteren op het "koppelingtype" — d.w.z. het hoofddoel-model van de koppeling (Contact, Lead, Webinar Registratie, Website Visitor, Mailingcontact, Bedrijf — dezelfde labels als de model-kaarten in de "Stap toevoegen" popup, opgehaald via `getModelCfg`/`S.odooModelsCache`).

`S.filters` (regels ~51-56) en `getVisibleIntegrations()` (regels ~479-516) moeten een nieuw filterveld krijgen, en de wiring in `forminator-sync-v2-bootstrap.js` (regels ~1720-1795, naast de bestaande `listStatusFilter`/`listSortSelect`-handlers) moet worden uitgebreid.

## Wat je implementeert

1. **Popup-knoppen (issue 1):** Pas de knop-template voor de SPECIAL-kaarten in `renderAddTargetDialog()` aan zodat een label + beschrijving op twee regels niet meer wordt afgekapt door de vaste DaisyUI `.btn`-hoogte — bv. door `h-auto` (en voldoende verticale padding, bv. `py-2.5`) toe te voegen aan de knop-klasse voor deze kaarten. Test visueel met alle 4 special-kaarten zichtbaar (2×2-grid) en met de model-kaarten erboven.
2. **Trail-labels (issue 2):** Voeg in zowel `forminator-sync-v2-detail.js` (header-badges) als `forminator-sync-v2-core.js` (lijst-kaart-badges) een `else if (t.operation_type === 'send_mail')`-tak toe die `'Mail'` toont (of, indien je consistent wil zijn met de stap-kaart, `'Mail naar ' + modelLabel` — kies wat het beste past bij de bestaande stijl van die twee plekken; de header toont nu bijvoorbeeld ook gewoon `'Mailinglijst'` zonder modelnaam, dus een korte `'Mail'` past daar goed bij).
3. **Foutieve waarschuwing verplichte velden (issue 3):** Voeg in `getIntegrationWarnings()` (`src/modules/forminator-sync-v2/database.js`) `t.operation_type !== 'send_mail'` toe aan de `relevantTargets`-filter. Controleer of `mailing_list` hetzelfde probleem heeft (zijn configuratie zit ook niet in `mappings`) en sluit dat type dan ook uit.
4. **Model-badge en link-icoon op de stap-kaart (issue 4):** In `forminator-sync-v2-detail-mapping-tab.js`: (a) sluit `send_mail` uit van de losse model-badge naast `opTypeLbl` (zelfde behandeling als `chatter_message`), en (b) neem `target.mail_res_id_source` mee in de `chainSourceRows`-opbouw zodat het link-icoon ook verschijnt voor gekoppelde mailstappen.
5. **Filter op koppelingtype (issue 5):** Voeg een `odooModel: 'all'`-veld toe aan `S.filters`, render een extra `<select>` in `renderListToolbar()` met de mogelijke modellen (afgeleid uit de daadwerkelijk gebruikte `odoo_model`-waarden in `S.integrations`, gelabeld via `getModelCfg`), pas `getVisibleIntegrations()` aan om hierop te filteren (op het model van de eerste/hoofd-target van de koppeling — kijk hoe `actionModel`/`cfg` nu al per rij wordt bepaald in de kaart-rendering en hergebruik die logica), wire de nieuwe select in `forminator-sync-v2-bootstrap.js` net als `listStatusFilter`, en neem het filter mee in `hasActiveFilters` en de "Wis filters"-reset.

## Wat je NIET aanraakt

- De opbouw/creatie van een nieuwe mailstap zelf (`handleAddTargetWithType`, de `send_mail`-tak) — die logica werkt al correct, dit gaat alleen over weergave en validatie.
- De maileditor/composer (`forminator-sync-v2-detail-mail-composer.js`) en de server-side verzendlogica (`mail-step.js`, `postmark-webhook.js`).
- Bestaande gedrag voor `chatter_message`/`create_activity` — enkel `send_mail` (en waar van toepassing `mailing_list`) toevoegen aan bestaande uitzonderingslijsten, niet de bestaande takken herstructureren.
- Geen nieuwe wrapper-functies voor dingen die al bestaan (`getModelCfg`, `modelLabel`, `getTargetOrder`, etc.) — hergebruiken.

Lees ook `CLAUDE.md` voor de projectregels.
