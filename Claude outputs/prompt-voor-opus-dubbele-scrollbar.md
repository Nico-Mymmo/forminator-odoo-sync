# Opdracht: los de aanhoudende dubbele scrollbar op in de Inschrijvingen-popup

## Context / project

Cloudflare Worker (Hono-achtige custom router) op de lokale Windows-machine
van de gebruiker, pad: `C:\Users\Nico Plinke\Documents\forminator-odoo-sync`.
Frontend voor de "events-v2" module:
- `public/events-v2.html` (markup)
- `public/events-v2-client.js` (alle client-side logica, vanilla JS IIFE,
  géén framework)

Styling: DaisyUI 4.12.14 via jsdelivr `<link>`, gevolgd door de Tailwind
Play-CDN `<script>` in de `<head>` (in die volgorde).

**Deploy is HANDMATIG**: `npm run deploy` (= `wrangler deploy`). Er is geen
CI/CD (geen `.github` workflows gevonden). Bestanden op schijf aanpassen
verandert dus NIETS aan wat live staat tot de gebruiker zelf deployt.
De live URL is `https://forminator-sync.openvme-odoo.workers.dev/events-v2`
(vereist login — geen credentials beschikbaar om zelf in te loggen).

**Belangrijke valkuil die al één keer is voorgevallen**: op een gegeven
moment bleek het bestand op schijf tussen twee commits in EXACT terug te
staan op een eerdere versie (mijn wijziging was spoorloos verdwenen, precies
teruggezet naar de vorige staat). Vermoeden: een editor (VS Code?) die het
bestand nog open had staan met oude inhoud en autosaved, of een andere
AI/Claude-sessie die in dezelfde repo werkt (er staat een `.claude`-map in
de repo), of een git-actie. **Voordat je een nieuwe fix probeert: vraag de
gebruiker om te bevestigen dat er geen ander proces (editor, andere
Claude/AI-sessie, git checkout/stash) tegelijk aan diezelfde bestanden zit,
en laat hem in de browser DevTools > Sources/Network tab controleren dat de
daadwerkelijk uitgeleverde `events-v2-client.js` ook echt de nieuwste
inhoud/timestamp heeft, VOORDAT je concludeert dat een fix niet werkt.**

## Het probleem

In de "Inschrijvingen"-dialoog (een native `<dialog>` element,
`id="registrationsDialog"`, geopend via `.showModal()`) toont de UI een
storende **dubbele verticale scrollbar**. Dit is al 7+ fixpogingen lang
gerapporteerd als NIET opgelost, ook na wijzigingen die via DevTools-
screenshots van de gebruiker bevestigd zijn als daadwerkelijk live/gedeployed.

### Wat de gebruiker met eigen DevTools-inspectie heeft vastgesteld (laatste ronde)

- `div#registrations-list.px-4.pb-4` — grootte 1009×901 — **heeft geen
  `overflow-y-auto` meer** (dat is al verwijderd in een eerdere fix).
- `div.overflow-x-auto.overflow-y-visible` (de tabel-wrapper binnenin) —
  977×885 — heeft expliciet `overflow-y: visible`, zou dus geen eigen
  verticale scroll mogen hebben.
- Toch zijn er nog steeds **twee scrollbars zichtbaar**: één duidelijk aan
  de rand van de popup zelf, én één die over het HELE browservenster loopt
  (dus van de achterliggende pagina/kalender, niet van de popup).

Dit wijst erop dat de achtergrondpagina (de kalenderweergave achter de
dialoog) blijft scrollen terwijl de dialoog open is — iets wat
`<dialog>.showModal()` in theorie zou moeten voorkomen voor kliks, maar niet
gegarandeerd voor scroll-gedrag in alle browsers.

### Wat al geprobeerd is (chronologisch, ALLEMAAL toegepast EN gecommit naar schijf)

1. `!overflow-hidden` Tailwind-class toegevoegd aan `.modal-box`.
2. Inline `style="overflow:hidden !important"` op zowel `<dialog>` als
   `.modal-box`.
3. JS-laag: `HTMLDialogElement.prototype.showModal` gepatcht om bij elke
   open een class `overflow-hidden` toe te voegen aan zowel
   `document.documentElement` als `document.body`, en te verwijderen bij het
   `close`-event. (IIFE bovenaan `events-v2-client.js`, genaamd
   `lockBodyScrollForDialogs`.)
4. Expliciete `max-height: calc(85vh - 52px)` op de scroll-container in de
   popup (i.p.v. enkel op flex `flex-1 min-h-0` vertrouwen).
5. **Echte oorzaak #1 gevonden en gefixt**: de tabel-wrapper-div's
   (`renderQuestionsSection` en `renderRegistrations` in
   `events-v2-client.js`) hadden enkel de class `overflow-x-auto`. Een div
   met alléén `overflow-x-auto` (en `overflow-y` op de CSS-default
   `visible`) krijgt van de browser AUTOMATISCH `overflow-y: auto`
   toegewezen zodra zijn hoogte begrensd wordt door een omvattende
   flex-container — dat gaf een 2e, onafhankelijke verticale scrollbar
   bovenop die van de buitenste scroll-container. **Fix**: expliciet
   `overflow-y-visible` toegevoegd aan beide van die wrapper-divs. Deze fix
   is bevestigd live via DevTools-inspectie (zie hierboven).
6. HTML herstructureerd van één scrollende container naar twee blokken:
   `#registrations-toolbar` (tabs + actieknoppen, `shrink-0`, geen scroll)
   en `#registrations-list` (`overflow-y-auto flex-1 min-h-0`, enige
   scrollcontainer). — Dit is de ronde waarin het bestand-op-schijf-
   revert-probleem hierboven ontdekt werd; deze fix stond dus een tijd NIET
   live ook al dacht ik van wel.
7. Nadat bevestigd was dat fix 6 wél live stond, alsnog gerapporteerd als
   nog steeds dubbel — herstructureerde daarom verder naar: toolbar + list
   ALLEBEI kind van één gezamenlijke scroll-wrapper
   (`class="flex-1 min-h-0 overflow-y-auto"`), met de toolbar `sticky
   top-0` binnenin zodat hij er visueel als vast blok uitziet zonder een
   eigen scrollcontext te zijn. Dit is de structuur die de gebruiker in de
   laatste DevTools-screenshots bevestigde als live (zie "Wat de gebruiker
   ... heeft vastgesteld" hierboven) — en de dubbele scrollbar was ALSNOG
   zichtbaar, nu duidelijk als "popup-scrollbar" + "hele-scherm-scrollbar".
8. Om die "hele-scherm-scrollbar" (achtergrondpagina) aan te pakken: de
   `lockBodyScrollForDialogs`-lock uit stap 3 vervangen van een Tailwind
   `classList.add('overflow-hidden')`-aanpak naar een INLINE
   `!important`-stijl via JS:
   ```js
   document.documentElement.style.setProperty('overflow', 'hidden', 'important');
   document.body.style.setProperty('overflow', 'hidden', 'important');
   ```
   (en `removeProperty('overflow')` bij het sluiten van de laatste open
   dialoog). Dit is de sterkst mogelijke manier om `overflow` via CSS af te
   dwingen (wint van élke stylesheet-regel, `!important` inbegrepen). **Ook
   deze fix is door de gebruiker gerapporteerd als NIET werkend** — dit is
   de meest recente, nog onbevestigde/mislukte poging.

### Huidige (laatst gecommitte) structuur van de dialoog in `events-v2.html`

```html
<dialog id="registrationsDialog" class="modal" style="overflow:hidden !important">
  <div class="modal-box max-w-5xl w-11/12 max-h-[85vh] p-0 !overflow-hidden flex flex-col" style="overflow:hidden !important">
    <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-base-200 shrink-0">
      <h3 class="font-semibold">Inschrijvingen</h3>
      <button class="btn btn-sm btn-ghost btn-square" data-action="registrations-close" aria-label="Sluiten">✕</button>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div id="registrations-toolbar" class="px-4 pt-4 pb-3 sticky top-0 z-10 bg-base-100 border-b border-base-200"></div>
      <div id="registrations-list" class="px-4 pb-4"></div>
    </div>
  </div>
</dialog>
```

`renderRegistrations(eventId)` in `events-v2-client.js` schrijft de tabs +
toolbar-knoppen naar `#registrations-toolbar`, en de tabel + paginering naar
`#registrations-list`. `renderQuestionsSection(eventId)` (vragen-tab)
gebruikt dezelfde twee hosts. Beide tabel-wrappers gebruiken
`class="overflow-x-auto overflow-y-visible"`.

De `lockBodyScrollForDialogs`-IIFE zit helemaal bovenaan
`events-v2-client.js`, patcht `HTMLDialogElement.prototype.showModal`, en
gebruikt sinds de laatste wijziging `style.setProperty('overflow','hidden','important')`
op zowel `document.documentElement` als `document.body`.

## Randvoorwaarden / wat je NIET kan

- **Geen shell-toegang op de machine van de gebruiker** via de gewone
  `device_bash`-route in deze sessie (foutmelding: "no Plan9 drive shares
  mounted"). Alle bestandstoegang moet via de remote-devices
  stage/read/edit/commit-tools. Check zelf of dit bij jou ook het geval is —
  zo niet, dan kan `npm run deploy`/`wrangler tail`/browser-DevTools-achtige
  inspectie via een shell wél sneller diagnosticeren dan blind CSS
  aanpassen.
- **Geen inloggegevens** voor de live deployed app — kan niet zelf inloggen
  of live DOM inspecteren via een browser-tool. Alle diagnose tot nu toe
  kwam van screenshots + DevTools element-info die de gebruiker zelf
  aanleverde.
- Elke fix moet ECHT gedeployed worden (`npm run deploy`) door de gebruiker
  voor hij zichtbaar is — vergeet dit niet te benadrukken, en verifieer waar
  mogelijk (vraag de gebruiker om in DevTools > Network de daadwerkelijk
  geladen `events-v2-client.js` te controleren) vóór je concludeert dat een
  fix niet werkt.

## Suggesties om mee te starten (niet uitputtend)

1. **Bevestig eerst dat er geen overschrijf-probleem meer speelt** (zie
   hierboven) — anders jaag je een fix na die nooit echt getest wordt.
2. **`overflow: hidden` op `html`/`body` is NIET waterdicht** in alle
   browsers (met name oudere iOS Safari-versies, en soms Chrome bij
   wheel-events die op een geneste scrollable/touch-target starten). De
   robuustere, industriestandaard techniek voor "scroll lock terwijl een
   modal open is" is de **scroll-position-freeze via `position: fixed`**:
   ```js
   function lockScroll() {
     var y = window.scrollY || document.documentElement.scrollTop;
     document.body.dataset.scrollY = y;
     document.body.style.position = 'fixed';
     document.body.style.top = '-' + y + 'px';
     document.body.style.left = '0';
     document.body.style.right = '0';
   }
   function unlockScroll() {
     var y = parseInt(document.body.dataset.scrollY || '0', 10);
     document.body.style.position = '';
     document.body.style.top = '';
     document.body.style.left = '';
     document.body.style.right = '';
     window.scrollTo(0, y);
   }
   ```
   Dit voorkomt scroll ONAFHANKELIJK van of `overflow: hidden` al dan niet
   ergens overruled wordt, omdat de body letterlijk niet langer deel
   uitmaakt van het scrollbare document. Overweeg dit i.p.v. (of naast) de
   huidige `overflow:hidden !important`-aanpak.
3. Overweeg dat de "hele-scherm-scrollbar" misschien HELEMAAL NIET van
   `<html>`/`<body>` komt, maar van een ander element met eigen hoogte +
   overflow (bv. een wrapper rond de FullCalendar-kalender, of een ander
   `position: fixed/sticky`-element op de pagina) dat buiten het bereik van
   de huidige lock valt. Zonder live DOM-toegang is dit gokwerk vanaf hier —
   vraag de gebruiker voor een DevTools-screenshot waarbij hij ZELF met de
   Elements-inspector op de tweede (buitenste) scrollbar klikt/hovert, zoals
   hij dat al eerder deed voor de binnenste elementen, zodat je exact weet
   welk element scrollt.
4. Wees expliciet naar de gebruiker toe over wat je verandert en waarom, en
   vraag na elke deploy om een DevTools-bevestiging (element + computed
   `overflow`-waarde) in plaats van enkel "werkt het nu" — dat heeft dit
   keer het meeste houvast gegeven.

## Wat de gebruiker wil

Eén scrollbar, en enkel op de plek waar dat hoort (de lijst/tabel in de
popup). Geen scroll van de achterliggende pagina terwijl de popup open
staat. De gebruiker is zichtbaar gefrustreerd na 7+ mislukte pogingen — wees
direct, leg kort uit wat je verandert, en verifieer voor je "opgelost"
claimt.
