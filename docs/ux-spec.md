# UX-spec — navbar, home en admin

> Laag A van het herontwerp (juni 2026). De bijbehorende wireframes in `docs/wireframes/`
> (`navbar.html`, `home.html`, `admin.html`) zijn de bron van waarheid voor de implementatie.
> Conform `docs/design-system.md`: daisyUI 4 + Tailwind + Lucide via CDN, geen build-stap,
> alles Nederlands (jij/je), semantische daisyUI-kleuren, geen `alert()`/`confirm()`.

---

## 1. Navbar (`src/lib/components/navbar.js`)

### Gebruikerscontext

- **Wie:** iedere ingelogde gebruiker, op elke pagina, vele keren per dag. Rollen variëren van
  marketing (alleen mail-signatures) tot admins met alle modules. Omstandigheden: desktop op
  kantoor is de norm; incidenteel mobiel (event-medewerkers ter plaatse, snelle check onderweg).
- **Primair doel:** navigeren — naar een andere module of terug naar het startscherm.
- **Secundaire doelen:** uitloggen, profiel openen, thema wisselen (eenmalig, daarna zelden),
  zien dat je bent ingelogd (en als wie).
- **Mentale toestand:** routinematig en gehaast. De navbar moet onzichtbaar goed zijn: geen
  denkwerk, geen verrassingen, identiek op elke pagina.

### Informatiestructuur

- **Altijd nodig:** merknaam/home-link, toegang tot eigen modules, eigen identiteit + uitlog.
- **Hiërarchie:** links = waar ben ik / waar kan ik heen (logo → Modules → Beheer);
  rechts = wie ben ik / accountacties (avatar-menu). Het midden blijft leeg, gereserveerd voor
  het bestaande `#saveIndicator`-slot dat modules kunnen vullen.
- **Verbergen tot nodig:** themakeuze en profiel verhuizen naar het avatar-menu. Thema wisselen
  is een eenmalige instelling en verdient geen permanente 29-opties-select van 96px in de balk.
- **Acties bij informatie:** uitloggen hoort bij identiteit, dus in het avatar-menu — niet als
  losse rode knop die op elke pagina om aandacht schreeuwt (huidige situatie).

### Interactiepatronen

- **Happy path:** klik "Modules" → kies module → klaar. Eén dropdown, klik-gestuurd
  (`<details>`-patroon), niet hover-gestuurd: hover-dropdowns klappen onbedoeld open bij
  muisbewegingen en werken niet op touch.
- **Mobiel (<768px):** modules + beheer + accountacties achter één hamburger-menu
  (daisyUI dropdown, full-width menu). De merknaam kort in tot "Operations Manager".
- **Fouten/blokkades:** sessie verlopen → elke API-call op de pagina geeft 401 → redirect naar
  `/`. De navbar zelf heeft geen serverafhankelijkheid behalve het uitlog-endpoint.
- **Onomkeerbaar:** uitloggen is licht-onomkeerbaar (sessie weg). Geen bevestiging nodig —
  opnieuw inloggen is goedkoop — maar de actie staat bewust onderaan het menu, visueel
  gescheiden, zodat hij niet per ongeluk wordt geraakt.
- **Onboarding vs. dagelijks:** nieuwe gebruiker zonder modules ziet géén "Modules"-knop
  (huidig gedrag, behouden) — het startscherm legt uit waarom (zie home).

### Feedback & statussen

- Actieve module krijgt een visuele marker in het Modules-menu (vinkje/accent) zodat je weet
  waar je bent. Nieuw t.o.v. huidige implementatie.
- Uitloggen: knop toont "Uitloggen…" + spinner tijdens de fetch, daarna redirect.
- Het `#saveIndicator`-slot blijft bestaan (modules zoals fsv2 gebruiken het).
- Geen lege staat: zonder modules verdwijnt de Modules-knop simpelweg.

### Verbeterkansen t.o.v. huidige code

1. **Engels → Nederlands:** "Administration" → "Beheer", "Logout" → "Uitloggen", "Profile" →
   "Profiel" (merknaam blijft).
2. **Rode Logout-knop permanent in beeld** is visuele ruis met error-semantiek voor een
   routineactie → verplaatst naar avatar-menu, daar wél in error-kleur (destructief in context).
3. **Theme-select met 29 opties** domineert de balk → naar avatar-menu als compacte sub-lijst
   met een korte, gecureerde set + "Meer thema's…" (open vraag voor PO, zie onderaan).
4. **`dropdown-hover`** → klik-dropdown via `<details class="dropdown">`; sluit na keuze.
5. **Inline `onchange`/`onclick`** → data-attributen + centrale listener (REGEL 3).
6. **Geen mobiele variant** in de huidige navbar → hamburger-patroon toegevoegd.
7. **Identiteit onzichtbaar:** je ziet nergens als wie je bent ingelogd → avatar met initialen
   + naam/e-mail in het menu, admin-badge voor admins.

---

## 2. Home — login + dashboard (`src/modules/home/ui.js`)

### Gebruikerscontext

- **Wie (login):** iedereen, maar zelden — sessies zijn langlopend. Vaak na sessieverloop,
  soms een gloednieuwe gebruiker met net gekregen inloggegevens. Mentale toestand: wil snel
  door naar de eigenlijke taak; nieuwe gebruiker is licht onzeker ("klopt mijn wachtwoord?").
- **Wie (dashboard):** iedereen na inloggen; ook als hub wanneer je via het logo terugkeert.
  Routinematig: 90% van de bezoeken is "klik door naar mijn module binnen 3 seconden".
- **Primair doel:** inloggen → de juiste module openen.
- **Secundair:** overzicht van wat je tot je beschikking hebt (vooral nieuwe gebruikers).

### Informatiestructuur

- **Login:** alleen e-mail, wachtwoord, knop. Geen afleidingen, geen emoji-slotje (huidig
  "🔐 Login"). Foutmelding direct onder de velden, vóór de knop, zodat hij in het oog springt
  zonder layout-sprong (vaste plek, verschijnt/verdwijnt).
- **Dashboard:** welkom met **naam** (username → full_name → e-mail-fallback), daaronder het
  module-grid. Per kaart: icoon, naam, korte omschrijving. Meer is er niet — utility-modules
  (admin, assets) blijven in de navbar, niet in het grid (huidig gedrag, behouden).
- **Hiërarchie:** grid is de pagina. Welkomstkop is `text-2xl` (design system), niet de huidige
  schreeuwende `text-4xl`.
- **Weglaten:** geen statistieken, geen activity feed — dit is een doorklikscherm.

### Interactiepatronen

- **Happy path login:** e-mail → tab → wachtwoord → Enter. Enter werkt op beide velden
  (form-submit i.p.v. losse `onkeypress`). Autocomplete-attributen behouden zodat
  wachtwoordmanagers werken.
- **Happy path dashboard:** scan grid → klik kaart. Kaarten zijn volledig klikbaar
  (hele `<a>`), met hover-lift (huidig patroon, behouden).
- **Fouten login:** lege velden (client-side, vóór de fetch), verkeerde gegevens (401 →
  "Inloggen mislukt. Controleer je gegevens en probeer opnieuw."), netwerkfout
  ("Verbindingsfout. Probeer het opnieuw."), gedeactiveerd account (server-melding tonen).
  Wachtwoordveld krijgt focus terug na een fout; waarde blijft staan bij netwerkfout, wordt
  geselecteerd bij 401.
- **Onboarding:** gebruiker zonder modules landt op een instructieve lege staat (zie onder)
  i.p.v. een kale info-alert.
- **Onomkeerbaar:** niets op deze pagina.

### Feedback & statussen

- **Login-knop tijdens submit:** `disabled` + spinner + "Inloggen…". Voorkomt dubbele submits
  (huidige code heeft geen loading state — dubbelklik = dubbele request).
- **Foutmelding:** `alert-error`, blijft staan tot nieuwe poging start (dan weg).
- **Dashboard eerste load:** het grid wordt server-side gerenderd (ui.js), dus geen
  laad-skeleton nodig; de wireframe toont voor de volledigheid een skeleton-variant voor het
  geval het grid ooit client-side wordt opgehaald.
- **Lege staat (0 modules):** gecentreerd icoon + "Je hebt nog geen modules. Vraag je
  beheerder om toegang." + naam van wie je moet hebben hoeft niet (privacy/onderhoud), maar
  de tekst is actiegericht.
- **Veel modules (9+):** grid blijft 3 kolommen op lg; kaarten zijn compact genoeg. Geen
  zoekveld nodig onder ~15 modules — niet bouwen tot het probleem bestaat.

### Verbeterkansen t.o.v. huidige code

1. Volledig Engels → Nederlands (vertaaltabel design system §10).
2. Geen loading state op de loginknop → toegevoegd; dubbele submits onmogelijk.
3. `onclick`/`onkeypress` inline → echte `<form>` met submit-handler (Enter gratis).
4. Hardcoded `data-theme="light"` → initTheme vóór first paint (geen themaflits).
5. `localStorage.setItem('adminToken', …)` bij login terwijl auth via cookie loopt —
   implementatieaandachtspunt: token-opslag in localStorage heroverwegen (buiten UI-scope,
   genoteerd voor de implementatie).
6. `shadow-xl` loginkaart → `border border-base-200 shadow-sm`.
7. Lege staat als alert → instructieve gecentreerde lege staat.

---

## 3. Admin (`public/admin-dashboard.html` + `.js`)

### Gebruikerscontext

- **Wie:** 1–3 admins (o.a. nico@mymmo.com). Frequentie: wekelijks tot dagelijks, in korte
  sessies: "nieuwe collega toegang geven", "module aanzetten voor X", "account van vertrokken
  collega uitzetten". Soms probleemoplossend: "waarom kan Y niet bij /events?" → snel de
  module-toewijzing van Y controleren.
- **Primair doel per bezoek:** één concrete mutatie op één gebruiker.
- **Secundair:** overzicht (wie heeft wat), module-inventaris.
- **Mentale toestand:** taakgericht; bij deactiveren/rolwijziging licht gespannen (gevolgen
  voor een collega). Fouten hier raken anderen — bevestiging en duidelijke feedback zijn
  belangrijker dan snelheid.

### Informatiestructuur

- **Statistieken-header:** gebruikers (actief) en modules (actief) — oriëntatie, geen
  stuurinformatie. Compact houden, met skeleton tijdens laden i.p.v. misleidende "0".
- **Tab Gebruikers (default):** tabel met e-mail, rol, modules, status, aangemaakt, acties.
  Zoekveld erboven (vanaf ±10 gebruikers onmisbaar bij "waarom kan Y niet bij…"-vragen).
  Module-badges tonen max. 3 + "+n" om rij-hoogte-explosie te voorkomen.
- **Tab Gebruiker aanmaken:** formulier met e-mail, wachtwoord, rol, modules. Rolkeuze met
  één regel uitleg per rol (de namen `marketing_signature`, `cx_powerboard_manager` zijn
  niet zelfverklarend; rollen auto-granten bovendien modules — dat moet zichtbaar zijn).
- **Tab Modules:** lijst met icoon, naam, omschrijving, code en actief-toggle. De code hoort
  erbij: admins refereren in support-gesprekken aan module-codes.
- **Verbergen tot nodig:** Odoo-UID en e-mail-overrides blijven in modals achter de
  rij-acties — randgevallen, niet in de tabel zelf.
- **Acties bij informatie:** alle per-gebruiker-acties in de rij van die gebruiker; alle
  per-module-acties in de rij van die module.

### Interactiepatronen

- **Happy path 1 (gebruiker aanmaken):** tab → e-mail → wachtwoord → rol → modules aanvinken
  → "Gebruiker aanmaken" → succes-toast + automatisch terug naar de Gebruikers-tab waar de
  nieuwe rij bovenaan staat. (Nu: `alert()` en je blijft op het lege formulier staan.)
- **Happy path 2 (module toewijzen):** Gebruikers-tab → zoek → pakket-icoon → modal met
  checkboxen → Opslaan → toast + bijgewerkte badges.
- **Happy path 3 (deactiveren):** rij-actie → **bevestigingsmodal** met naam en gevolg
  ("X kan direct niet meer inloggen; bestaande sessies vervallen bij de volgende check") →
  bevestigen → toast. Reactiveren: zelfde knop, lichtere modal-tekst.
- **Rolwijziging:** inline select, maar mét vangnet: wijziging → kleine bevestigingsmodal
  ("Rol van X wijzigen naar Admin? Deze rol geeft volledige beheerrechten." /
  auto-grant-melding bij marketing_signature en cx_powerboard_manager) → bij annuleren springt
  de select terug. Rolwijziging is té ingrijpend voor een ongevraagde directe mutatie bij een
  misklik in een dropdown.
- **Zelfbescherming:** de eigen rij kan zichzelf niet deactiveren en niet degraderen
  (acties disabled met tooltip "Je kunt je eigen account niet wijzigen"). De backend kent
  deze guard nog niet — implementatie-aandachtspunt.
- **Fouten:** elke mislukte mutatie → error-toast met concrete melding, UI rolt terug naar de
  servertoestand (herladen van de lijst).
- **Onomkeerbaar:** niets is hard-destructief (deactiveren is omkeerbaar; modules idem),
  maar alles raakt collega's → modals voor deactiveren en rolwijziging, gewone toasts voor
  module-mutaties.

### Feedback & statussen

- **Eerste load:** skeleton in de stats, gecentreerde spinner in tabellen.
- **Refresh na mutatie:** stil herladen; geen spinner over de hele tabel (flikkert), de toast
  is de bevestiging.
- **Actieknoppen tijdens mutatie:** `disabled` + spinner/„Opslaan…".
- **Succes:** toast rechtsboven, 3 s, `alert-success`. **Fout:** toast blijft staan met
  sluitknop, `alert-error`.
- **Lege staten:** geen gebruikers (vers systeem): "Nog geen gebruikers. Maak de eerste aan
  via het tabblad 'Gebruiker aanmaken'." Geen zoekresultaat: "Geen gebruikers gevonden voor
  '…'" + knop "Zoekopdracht wissen". Geen modules: informatief (modules komen uit de
  registry/DB, een admin kan ze hier niet aanmaken).
- **Foutstaat tabel:** error-alert met "Opnieuw proberen"-knop, niet alleen een dode melding.

### Verbeterkansen t.o.v. huidige code

1. **Alle `alert()`-feedback → toasts**, alle bevestigingen → daisyUI-modals (design system §5).
2. **Kaart-in-kaart** (`card shadow-xl` binnen `tab-content`) → één vlak per tab.
3. **Dubbele navbar-implementatie:** admin-dashboard.js bevat een eigen, afwijkende
   navbar-kopie (zonder utility-knoppen, met oude styling) → vervangen door het gedeelde
   navbar-patroon uit `navbar.html`.
4. **Rolwijziging zonder bevestiging** → bevestigingsmodal met uitleg van gevolgen.
5. **`cx_powerboard_manager` ontbreekt** in beide rol-selects van de frontend terwijl de
   backend hem accepteert → toegevoegd.
6. **Geen wachtwoord-eisen zichtbaar** bij aanmaken → "Minimaal 8 tekens" als help-tekst +
   client-side validatie met `input-error` + concrete melding.
7. **Geen zoekfunctie** in de gebruikerstabel → zoekveld op e-mail/rol.
8. **Stats tonen "0" tijdens laden** → skeleton.
9. **Na aanmaken blijf je op het formulier** zonder de nieuwe gebruiker te zien → succes-toast
   + spring naar Gebruikers-tab.
10. **Inline `onclick` overal** → data-attributen + centrale listener.
11. **Modules-tab is puur lezen** (badge Actief/Inactief) → toggle per module met directe
    visuele feedback. Let op: backend-endpoint (`PUT /admin/api/modules/:id/toggle` o.i.d.)
    bestaat nog niet — zie open vragen.
12. **Engels → Nederlands** (vertaaltabel §10), `lang="nl"`, theme-init zonder flits.

---

## Open vragen voor de producteigenaar

1. **Thema's:** terug naar een gecureerde set (bv. light, dark, corporate, business, winter,
   lofi) of alle 29 daisyUI-thema's behouden? De wireframe toont de gecureerde set met een
   uitklapbare "alle thema's"-lijst.
2. **Module activeren/deactiveren (admin → Modules-tab):** de wireframe ontwerpt een toggle,
   maar er is geen backend-endpoint voor. Bouwen, of de tab read-only laten?
3. **Invites:** de backend heeft een volledig invites-API (aanmaken, lijst, intrekken), maar
   de huidige UI gebruikt hem niet — gebruikers worden direct met wachtwoord aangemaakt.
   Invite-flow alsnog in de UI brengen (veiliger: gebruiker kiest eigen wachtwoord) of de
   API verwijderen? De wireframes gaan uit van de huidige directe flow.
4. **Zelfbescherming admin:** mag een admin zichzelf degraderen/deactiveren als er nog een
   andere actieve admin is, of nooit? Wireframe kiest: nooit via de UI (server-side guard
   aanbevolen).
5. **Wachtwoordbeleid:** minimum 8 tekens aangehouden (consistent met profile). Bevestigen,
   of strenger?
6. **`saveIndicator`-slot in de navbar:** blijft gereserveerd. Akkoord dat modules dit slot
   blijven gebruiken i.p.v. eigen toasts?
