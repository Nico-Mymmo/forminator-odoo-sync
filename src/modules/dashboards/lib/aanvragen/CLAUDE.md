# Regelboek — Dashboards, tabblad Aanvragen

Voor wie het tabblad Aanvragen in Dashboards (`/dashboards?tab=instroom`) verder
bouwt. Claude Code leest dit vanzelf zodra er in deze map gewerkt wordt; de hoofdmap
(`claude.md`) verwijst ernaar voor de browserkant. De regels van de repo gelden ook, in
het bijzonder de **bestand-editingprocedure** bovenaan `claude.md`: `aanvragen.js` en
`instroom.js` zijn langer dan 150 regels, dus nooit de Edit-tool, altijd een
Python-script met de controle op bytes.

## Hoe dit werkt: de vangrails beslissen, niet een persoon

Je bouwt het tabblad zelf uit en voegt zelf samen. Wat tegenhoudt dat het uit de toon
valt naast Verkoop en Marketing, of dat het iets in Odoo verandert, zijn twee
vangrails:

1. **De dashboardcontrole**: `node scripts/vangrails/aanvragen.mjs`. Harde regels
   (geraamte, kolommen, kleuren, randen, grafieken, wat de server mag lezen). Rood =
   op GitHub geen samenvoegen.
2. **`.github/CODEOWNERS`**: je terrein is vrij, de rest wacht op Nico.

**Je terrein, twee mappen:**

| Wat | Waar |
|---|---|
| Wat er in de drie kolommen staat (browser) | `public/dashboard-aanvragen/aanvragen.js` |
| Wat de server leest en berekent | `src/modules/dashboards/lib/aanvragen/` — `index.js` (`getAanvragen(env, params)`, wat de route aanroept) en `instroom.js` |

**Wacht op Nico** (zet het in een APARTE pull request, zodat je eigen werk niet hoeft
te wachten):

- de bouwstenen en het geraamte: `public/dashboards-kit.js`;
- de pagina `public/dashboards.html` -- ook om een tweede `.js`-bestand te laden;
- de route `src/modules/dashboards/routes.js`;
- wat het tabblad mag lezen: `src/modules/dashboards/lib/aanvragen-bronnen.js` (een
  Odoo-model erbij, of een andere bron zoals Supabase of de website-tracker);
- de kanaalindeling `src/modules/dashboards/lib/lead-kanalen.js` -- die geldt ook voor
  "Kanaal (lead)" in Verkoop en Targets;
- de targets (`lib/targets.js`), de controle en dit regelboek.

Claude: raakt een taak iets buiten het terrein, zeg dat dan vooraf, in plaats van het
er stil bij te doen.

> **Nooit** de controle aanpassen om rood groen te krijgen. Pas het tabblad aan.
> Claude: zit een regel echt in de weg, stop dan en zeg welke en waarom -- werk er niet
> omheen.

## Werkwijze

**Werk op je eigen computer** (Claude Code in de desktopapp of in de terminal), niet in
de cloud: de proef draait lokaal en leest je eigen Odoo-sleutel, en die hoort nergens
anders te staan.

0. **Eenmalig**: `git clone` van de repo, `npm install`, en een bestand `.dev.vars` in
   de hoofdmap met twee regels:
   ```
   ODOO_LOGIN=jij@openvme.be
   API_KEY=<Odoo -> je naam rechtsboven -> Mijn profiel -> Accountbeveiliging -> Nieuwe API-sleutel>
   ```
   `.dev.vars` staat in `.gitignore`: het gaat nooit naar GitHub. Deel die sleutel met
   niemand; wie hem heeft, leest Odoo als jou.
1. Eigen branch vanaf de nieuwste `master`: `git switch master && git pull && git switch -c aanvragen/<wat>`.
2. Bouwen (zie hieronder) en **bekijken met de proef**: `npm run proef:aanvragen` en
   open http://localhost:8790 (in de desktopapp: de voorvertoning "aanvragen-proef" in
   `.claude/launch.json`). Dat is het echte tabblad met jouw code, tegen het echte Odoo
   met JOUW leesrechten: zie je minder leads dan in de OM, dan mag jouw Odoo-gebruiker
   ze niet allemaal lezen. Een wijziging in `aanvragen.js` zie je na een herlading,
   een wijziging aan de servercode herstart de proef vanzelf. Targets staan er niet in
   ("geen target"), en de andere tabbladen werken er niet: die hebben de Worker nodig.
3. `npm run controle:aanvragen` tot er geen fouten meer zijn.
4. Een pull request naar `master`. GitHub draait dezelfde controle ("Dashboardcontrole");
   is die groen, dan voeg je zelf samen.
5. **Samenvoegen zet niets live.** De Worker gaat live met `npm run deploy`, en dat doet
   Nico. Meld hem dat er iets klaarstaat.

## Het geraamte: drie kolommen, en dat ligt vast

Hetzelfde geraamte als Verkoop, Targets en Marketing, uit de kit (`window.OMDash`, in
het bestand `K`):

- **links**, plakkend: "Je bekijkt" (een zin) en daaronder de filters;
- **in het midden**: de kaarten, de een onder de ander;
- **rechts**, plakkend: de kerncijfers (vanaf 2xl als smalle lijst, tussen lg en 2xl
  bovenaan het midden, op een telefoon alles onder elkaar).

```js
var P = 'av';
root.innerHTML = K.geraamte({ prefix: P, titel: '...', uitleg: '...',
  midden: K.kaart('avIets', 'Titel', 'Een zin: wat je ziet en wat een klik doet.', knoppen) + ...,
  vensters: '<dialog ...>...</dialog>' });
K.zin(P, 'Aanvragen van ... in ... (10 sep – 9 okt 2026), tegenover ...');
K.filters(P, [groep, groep]);   // elk: '<div>' + K.groupLabel(naam, uitleg) + K.pills(...) + '</div>'
K.kpis(P, [tegel, tegel]);      // elk: { label, value, delta, sub, series, help, drill, attr }
K.status(P, html); K.melding(P, html);
```

Nooit een eigen `<aside>`, kolomraster, `sticky` of kaart (`rounded-2xl`), en de
kolommen nooit rechtstreeks vullen (`getElementById('avKpis')`): de controle weigert
het. Binnen een kaart deel je vrij in.

### Links: je bekijkt en de filters

- **Eén zin** die zegt wat de cijfers zijn: welk merk, welke periode voluit met datums,
  en waarmee vergeleken wordt. Een actieve filter staat in die zin.
- Elke filter is een groep: `K.groupLabel(naam, uitleg)` (de uitleg verschijnt bij het
  i-icoontje) met `K.pills(A, actie, null, keuzes, huidig, true)` voor een handvol
  keuzes, of `K.select(...)` voor een lange lijst. Het laatste argument van `pills`
  (`true`) maakt ze passend voor de smalle kolom: hou opschriften kort ("30 d", niet
  "Laatste 30 dagen").
- De keuze blijft bewaard in `localStorage` onder `dashboards.aanvragen.*`.

### Midden: de kaarten

- Elke widget is een `K.kaart(id, titel, uitleg, knoppen)`. De uitleg is een zin: wat
  je ziet en wat een klik doet. Knoppen (een keuze voor die kaart alleen) staan
  rechtsboven in de kaart, niet in de filters.
- Grafieken met `K.chart(id, config)` en `K.baseOptions({...})`, reeksen met `K.bars`,
  `K.area` en `K.refLine` (vergelijking of target: grijs, gestippeld). Geen
  `new Chart(...)`.
- Het belangrijkste staat bovenaan.

### Rechts: de kerncijfers

- Altijd via `K.kpis(P, [...])`, nooit met eigen HTML.
- **Elk getal zegt waarmee het vergelijkt, voluit met datums**:
  `K.delta(nu, vorig, true, null, 't.o.v. 10 aug – 9 sep 2026')`. "vs vorige" alleen
  zegt niet of het een maand of een jaar is.
- Het mini-verloop (`series`) is exact dezelfde reeks als de grafiek in het midden.
- Zo weinig als kan: de kolom moet in een gewoon scherm passen (een handvol tegels).

## Huisstijl

- **Geen eigen kleur.** Geen hex, `rgb()`, `hsl()` of `oklch()` in het tabblad. Kanalen:
  `K.kanaalKleur(kanaal)`; de rest: `K.C.primary/good/bad/warn/muted(alpha)`,
  `K.palette(i)`, `K.REF`, of daisyUI-klassen (`text-success`, `bg-primary`, ...). Zo
  volgt alles het thema, ook het donkere. Een kleur erbij = in de kit, via Nico.
- **Randen**: `border-base-content/10`, nooit `border-base-200/-300` (claude.md, REGEL 7).
  Een lijntje tussen rijen: de klasse `om-lijnen`. Een licht vlak: `om-spoor`; oplichten
  bij aanwijzen: `om-hover`; arceren: `om-hatch` (dashboards.html).
- **Tabs** altijd `tabs-boxed` (REGEL 6).
- **Klikken**: `data-av-action="..."` en de ene `root.addEventListener('click', ...)`,
  nooit `onclick` en nooit een luisteraar op `document` (REGEL 3).
- **Tekst**: de groottes van Tailwind zoals in Verkoop; geen eigen lettertype, geen
  `<style>`. Iconen: `<i data-lucide="...">` en daarna `K.icons()`.
- **Data** enkel via `K.api('/dashboards/api/aanvragen?...')` (of `/dashboards/api/targets`):
  dat stuurt de sessie mee en stuurt bij 401 naar het aanmeldscherm.

## Cijfers: wat het tabblad belooft

- **Historiek wordt nooit weggelaten.** Een minder betrouwbare periode krijgt een
  arcering (`K.hatchPlugin`, `om-hatch`) en een zin, maar blijft in de cijfers.
- **Een onvolledige periode zegt dat ze onvolledig is** (een halve week aan de rand,
  de lopende maand): in de tooltip of als arcering, anders leest ze als een dip.
- **Een target staat per maand**, nooit per dag of per week: per dag schommelt het
  percentage tussen 0 en 400% en zegt het niets.
- **Merk en kanaal komen uit `lead-kanalen.js`.** Nooit een eigen indeling: dan zegt
  "Kanaal" hier iets anders dan in Verkoop.
- **Leeg is nooit stil.** Geen target, geen aanvragen, een fout: zeg het, met de reden.
- **Waar het kan, is een getal klikbaar** naar de leads erachter, met `K.drill(...)`
  (zoals in Verkoop en Targets). Daarvoor stuurt de server per lead een paar velden mee
  (`leesRecords`, met een veldenlijst).

## De serverkant

- `index.js` exporteert `getAanvragen(env, params)`. De route geeft ALLE
  queryparameters door, als tekst: valideer elke parameter en val terug op een
  standaard (`normalizePeriod`, `normalizeScope`). Een nieuwe filter vraagt dus geen
  wijziging aan de route.
- Lezen gaat enkel via `../aanvragen-bronnen.js`:
  - `leesGroepen(env, model, { domain, fields, groupBy, ookGearchiveerd })` --
    `read_group`. Kies dit eerst: tellen zonder elk record te laden.
  - `leesRecords(env, model, { domain, fields, order, limit, ookGearchiveerd })` --
    `search_read`, altijd met een veldenlijst, hoogstens 5000 records.
  - `tel(env, model, domain, { ookGearchiveerd })` -- `search_count`.
  - `getTargetsForMonths` / `buildTargetTrend` -- de aanvraagtargets.
  - Enkel de modellen in `MODELLEN`. `ookGearchiveerd: true` voor de instroom:
    verloren leads tellen mee, de aanvraag is binnengekomen.
- Merk en kanaal: `resolveChannel`, `scopeDomain`, `BRAND_LABELS` uit
  `../lead-kanalen.js`.
- Odoo-aanroepen parallel (`Promise.all`). Het antwoord wordt niet gecachet: elke
  lading is live, dus hou het aantal aanroepen klein.
- **Niets schrijven.** Geen Odoo, geen Supabase, geen KV, geen `fetch`, geen `env.IETS`:
  geef `env` enkel door. De controle weigert elke andere import.
- De vorm van het antwoord gebruikt enkel `aanvragen.js`: wijzig ze samen.

## Aanscherpen

Glipt er iets door dat niet had gemogen (een eigen kleur langs een omweg, een kolom die
toch anders oogt), dan wordt het een regel in `scripts/vangrails/aanvragen.mjs`. Dat
doet Nico; meld het hem.
