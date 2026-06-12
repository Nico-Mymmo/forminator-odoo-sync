# Designsysteem — Operations Manager (mymmo.com)

> Definitieve UI-standaard voor alle modules. Gebaseerd op de UX-audit van juni 2026.
> Stack: daisyUI 4 + Tailwind (CDN) + Lucide. Geen build-stap.
> Referentie-implementaties: `public/forminator-sync-v2.html` (layout/views) en `src/modules/asset-manager/ui.js` (modals, lege staat, toolbar).

---

## 1. Knoppen (vier varianten)

| Variant | Klassen | Gebruik |
|---|---|---|
| **Primair** | `btn btn-primary btn-sm` | Hoofdactie. Max. 1 per kaart, rechtsonder geplaatst (in modals: eerste knop in `modal-action`). |
| **Secundair** | `btn btn-outline btn-sm` | Nevenactie (bv. "Meer laden", "Vernieuwen"). |
| **Ghost** | `btn btn-ghost btn-sm` | Navigatie/tertiair (terug-knoppen, "Annuleren", icoonknoppen, sluiten). |
| **Destructief** | `btn btn-error btn-sm` | Verwijderen e.d. — **altijd** met bevestigingsmodal (daisyUI `<dialog class="modal">`, nooit `window.confirm()`). |

Regels:
- Altijd `btn-sm` op pagina's; `btn-xs` alleen in tabelrijen en de navbar.
- Geen kale `btn` zonder variant (komt nu voor in project-generator).
- Icoon vóór de tekst: `<i data-lucide="..." class="w-4 h-4"></i>` (`w-3.5 h-3.5` bij `btn-xs`).
- Knopvolgorde in modals: primair eerst, daarna ghost-annuleren (asset-manager-patroon).

## 2. Kaarten

```html
<div class="card bg-base-100 border border-base-200 shadow-sm">
  <div class="card-body">...</div>
</div>
```

- **Geen `shadow-xl`** (nu nog op 25 plekken, o.a. profile, admin, project-generator, fsv2 empty state).
- Hover-kaarten (klikbaar, zoals home-grid): `hover:shadow-md hover:border-primary/30 transition-all`.
- Geen kaart-in-kaart (admin-dashboard nest nu `card shadow-xl` binnen `tab-content` — één laag volstaat).

## 3. Typografie

| Element | Klassen |
|---|---|
| Paginatitel | `text-2xl font-bold` |
| Subtitel (onder titel) | `text-sm text-base-content/60 mt-1` |
| Sectietitel | `text-base font-semibold` |
| Help-tekst | `text-xs text-base-content/50` |

- Eén `<h1>` per pagina. Huidige wildgroei (`text-4xl` in home/profile/project-gen/event-ops/mail-sig, `text-3xl` in fsv2/asset/SIE, `text-2xl` in cx-powerboard) convergeert naar `text-2xl`.
- Pagina-layout: `<div class="container mx-auto px-6 py-8 max-w-7xl">` onder de navbar (`padding-top: 48px`).
- `lang="nl"` op elke pagina (nu nog `lang="en"` in home, profile, project-generator, event-operations, mail-signature-designer, sales-insight-explorer, admin-dashboard.html).

## 4. Formulieren

```html
<label class="form-control w-full">
  <div class="label"><span class="label-text">Veldnaam</span></div>
  <input type="text" class="input input-bordered input-sm w-full" placeholder="…" />
  <div class="label"><span class="label-text-alt text-xs text-base-content/50">Help-tekst</span></div>
</label>
```

- Label **boven** het veld, help-tekst **eronder**.
- Inputs: `input input-bordered input-sm w-full`; selects: `select select-bordered select-sm`; textarea's: `textarea textarea-bordered textarea-sm`.
- Verplichte velden: ` <span class="text-error">*</span>` achter het label.
- Validatiefout: `input-error` op het veld + concrete melding eronder in `text-xs text-error`.

## 5. Feedback-patronen

| Situatie | Patroon |
|---|---|
| **Succes** | `alert alert-success` (toast rechtsboven of inline), verdwijnt automatisch na **3 s**. |
| **Fout** | `alert alert-error`, **blijft staan** tot de gebruiker hem sluit of een nieuwe actie start. |
| **Laden (actie)** | `loading loading-spinner loading-sm` inline in de knop + `disabled` op de knop. Knoptekst wordt bv. "Opslaan…". |
| **Laden (pagina/lijst)** | Gecentreerde `loading loading-spinner loading-md text-primary` met `py-20`. |
| **Leeg** | Gecentreerd Lucide-icoon (`w-12 h-12`) + tekst in `text-base-content/40` + optionele primaire CTA. Voorbeeld: asset-manager "Geen bestanden in deze categorie." en fsv2 "Nog geen integraties". |

Verboden: `window.alert()` en `window.confirm()` (nu nog in admin-dashboard.js, event-operations-client.js, semantic-wizard.js, mail-signature-designer-client.js, project-generator-client.js). Emoji's in meldingen (✅/❌/⚠️ in event-operations) vervallen — het alert-type draagt de betekenis al.

Standaard toast-helper (één implementatie per pagina, container `#toastContainer` met `toast toast-end z-50`):

```js
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
  const toast = document.createElement('div');
  toast.className = 'alert ' + cls + ' text-sm py-2 px-4';
  const span = document.createElement('span');
  span.textContent = message; // auto-escaped
  toast.appendChild(span);
  container.appendChild(toast);
  if (type !== 'error') setTimeout(() => toast.remove(), 3000);
}
```

## 6. Kleurgebruik

Uitsluitend daisyUI-semantische kleuren: `primary`, `secondary`, `accent`, `neutral`, `base-100/200/300`, `base-content` (met opacity-suffix), `info`, `success`, `warning`, `error`.

**Verboden:** hardcoded hex en Tailwind-paletkleuren (`text-gray-500`, `bg-red-500`, `text-slate-…`). Bekende overtredingen: project-generator milestone-kleurknoppen (`bg-red-500` t/m `bg-violet-500` — functionele Odoo-kleurcodes, mag via inline `style` of CSS-variabelen maar niet via Tailwind-klassen die het thema breken), `editor-controller.js` (`text-gray-500`), `event-operations-client.js` (`text-gray-400`).

## 7. Taal & tone of voice

- **Alles in het Nederlands**, jij/je-vorm.
- Actieknoppen als infinitief: **Opslaan, Annuleren, Verwijderen, Toevoegen, Uploaden, Sluiten, Aanmaken**.
- Lege staten: vriendelijk en actiegericht — "Nog geen integraties. Maak je eerste koppeling aan in drie stappen."
- Foutmeldingen: concreet wat er misging + wat de gebruiker kan doen — "Opslaan mislukt: de server is niet bereikbaar. Probeer het opnieuw."
- Bezig-toestanden met beletselteken: "Opslaan…", "Laden…".
- Placeholders zijn voorbeelden, geen instructies: `naam@bedrijf.com` i.p.v. "Enter email".

## 8. Thema-initialisatie (elke pagina)

```js
function initTheme() {
  const theme = localStorage.getItem('selectedTheme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const sel = document.getElementById('themeSelector');
  if (sel) sel.value = theme;
}
// Aanroepen vóór lucide.createIcons()
```

- Geen hardcoded `data-theme="light"` op de `<html>`-tag (nu nog in home, profile, project-generator, SIE, admin-dashboard.html, claude-settings.html).
- Voor flits-vrije laad: het "early theme init"-inline-script in `<head>` zoals in `public/forminator-sync-v2.html` / asset-manager mag aanvullend.
- `theme change`-listener schrijft naar `localStorage.selectedTheme`.

## 9. Module-overzicht (uit de audit)

| Module | Route | Complexiteit (1-5) | Prioriteit | Voornaamste issues |
|---|---|---|---|---|
| home (login + dashboard) | `/` | 2 | **Hoog** | Volledig Engels, `shadow-xl` login-kaart, inline `onclick`, hardcoded theme, `lang="en"` |
| profile | `/profile` | 2 | **Hoog** | Volledig Engels (behalve e-mailkoppelingen-kaart), 3× `shadow-xl`, gemengde NL/EN op één pagina, bug: `document.elementElement` in changeTheme |
| admin | `/admin` | 3 | **Hoog** | Volledig Engels, kaart-in-kaart in tabs, `shadow-xl`, `window.alert()` voor alle feedback, inline `onclick` in tabelrijen, geen initTheme in HTML zelf |
| project-generator | `/projects` | 4 | **Hoog** | Volledig Engels (UI + alle toasts), `shadow-xl` ×9, hardcoded Tailwind-kleuren, kale `btn` zonder variant, `confirm()` ×8, drie aparte pagina's in één ui.js (987 + 4750 regels client) |
| event-operations | `/events` | 4 | Middel | Half EN/half NL door elkaar ("Out of Sync", "Published" naast "Komend", "Aanmeldingen"), `alert()` met emoji's, `confirm()`, `lang="en"`, 1490 + 2008 + controllers |
| sales-insight-explorer | `/insights` | 3 | Middel | UI grotendeels NL maar toasts/lege staten Engels ("Saving query...", "Please select a base model"), `lang="en"`, hardcoded theme, string-concatenatie-HTML |
| mail-signature-designer | `/mail-signatures` | 2 | Middel | Vrijwel volledig NL en consistent; restjes EN ("Sync production data not available"), inline `onclick` ×28, `confirm()` ×1 |
| forminator-sync-v2 | `/forminator-v2` | 1 | Laag | Referentiemodule. Enkel: `shadow-xl` op empty-state-kaart, dode `ui.js` (DISABLED) opruimen, `confirm()` ×5 in detail.js |
| asset-manager | `/assets` | 1 | Laag | Referentiemodule voor modals/lege staat. Enkel: `text-base-content/30` i.p.v. /40 bij lege staat, paar `btn` zonder `btn-sm`-uitlijning |
| cx-powerboard | `/cx-powerboard` | 4 | Laag | Volledig NL, maar 3052 regels monoliet, 36× inline `onclick`, eigen stijlconventies (text-2xl titel — toevallig al conform) |
| wp-form-schemas | `/wp-sites` | 1 | Laag | Geen eigen UI (alleen JSON-API); foutmeldingen al NL. Niets te doen. |
| claude-integration | `/api/claude` + claude-settings.html | 2 | Laag | NL maar Title Case-koppen ("Nieuwe Koppeling Aanmaken"), hardcoded theme, geen initTheme, 12× inline `onclick` |

## 10. Vertaaltabel (Engels → Nederlands)

| Module | Originele string | Nederlandse versie |
|---|---|---|
| home (login) | Login | Inloggen |
| home (login) | Email / Password | E-mailadres / Wachtwoord |
| home (login) | Please enter email and password | Vul je e-mailadres en wachtwoord in |
| home (login) | Login failed | Inloggen mislukt. Controleer je gegevens en probeer opnieuw |
| home (login) | Connection error: … | Verbindingsfout: … Probeer het opnieuw |
| home | Welcome, {naam} | Welkom, {naam} |
| home | Select a module to get started | Kies een module om te beginnen |
| home | No modules assigned yet. Contact your administrator. | Je hebt nog geen modules. Vraag je beheerder om toegang. |
| navbar | OpenVME Operations Manager | (merknaam — blijft) |
| navbar | Administration | Beheer |
| navbar | Modules | Modules |
| profile | Profile Settings | Profielinstellingen |
| profile | Manage your account settings | Beheer je accountgegevens |
| profile | Account Information | Accountgegevens |
| profile | Username | Gebruikersnaam |
| profile | This will be shown in the app instead of your email | Dit wordt in de app getoond in plaats van je e-mailadres |
| profile | Full Name / Role | Volledige naam / Rol |
| profile | Not set | Niet ingesteld |
| profile | Update Profile | Profiel opslaan |
| profile | Profile updated successfully! | Profiel opgeslagen |
| profile | Change Password | Wachtwoord wijzigen |
| profile | Current / New / Confirm New Password | Huidig wachtwoord / Nieuw wachtwoord / Bevestig nieuw wachtwoord |
| profile | Passwords do not match | De wachtwoorden komen niet overeen |
| profile | Password must be at least 8 characters | Het wachtwoord moet minstens 8 tekens lang zijn |
| profile | Password updated successfully! | Wachtwoord gewijzigd |
| profile | Failed to update profile / password | Profiel opslaan mislukt / Wachtwoord wijzigen mislukt. Probeer het opnieuw |
| admin | Administration | Beheer |
| admin | Manage users, invites, and module access | Beheer gebruikers, uitnodigingen en moduletoegang |
| admin | Total Users / Active accounts | Gebruikers / Actieve accounts |
| admin | Active Modules / Available modules | Actieve modules / Beschikbare modules |
| admin | Users / Create User / Modules (tabs) | Gebruikers / Gebruiker aanmaken / Modules |
| admin | User Management | Gebruikersbeheer |
| admin | Create New User | Nieuwe gebruiker aanmaken |
| admin | Email Address / Password / Role / Modules | E-mailadres / Wachtwoord / Rol / Modules |
| admin | Enter password (placeholder) | Minimaal 8 tekens |
| admin | Create User (knop) | Gebruiker aanmaken |
| admin | Available Modules | Beschikbare modules |
| admin | Active / Inactive | Actief / Inactief |
| admin | Edit Modules / Toggle Status (tooltips) | Modules bewerken / Status wisselen |
| admin | User created successfully! | Gebruiker aangemaakt |
| admin | Failed to create user | Gebruiker aanmaken mislukt. Probeer het opnieuw |
| admin | Failed to update user role / status / modules | Rol / status / modules bijwerken mislukt. Probeer het opnieuw |
| project-generator | Project Generator | Projectgenerator |
| project-generator | Manage your project templates | Beheer je projectsjablonen |
| project-generator | New Template | Nieuw sjabloon |
| project-generator | No templates yet | Nog geen sjablonen |
| project-generator | Create your first template to get started | Maak je eerste sjabloon aan om te beginnen |
| project-generator | Name / Created / Updated | Naam / Aangemaakt / Bijgewerkt |
| project-generator | Create Template | Sjabloon aanmaken |
| project-generator | Template Name | Sjabloonnaam |
| project-generator | My Project Template (placeholder) | Mijn projectsjabloon |
| project-generator | Optional description of your template | Optionele omschrijving van je sjabloon |
| project-generator | Template Visibility | Zichtbaarheid |
| project-generator | Anyone with access can edit this template | Iedereen met toegang kan dit sjabloon bewerken |
| project-generator | Cancel / Save | Annuleren / Opslaan |
| project-generator | Blueprint Editor | Blauwdruk-editor |
| project-generator | Task Stages / Milestones / Tags / Stakeholders | Taakfases / Mijlpalen / Tags / Belanghebbenden |
| project-generator | Add Stage / Add Milestone / Add Task | Fase toevoegen / Mijlpaal toevoegen / Taak toevoegen |
| project-generator | Stage Name / Milestone Name / Milestone Color | Fasenaam / Mijlpaalnaam / Mijlpaalkleur |
| project-generator | No grouping | Geen groepering |
| project-generator | Cancelled Stage / Backlog Stage | Geannuleerd-fase / Backlog-fase |
| project-generator | Required for task state automation | Vereist voor automatische taakstatussen |
| project-generator | No description | Geen omschrijving |
| project-generator | Failed to load templates: … | Sjablonen laden mislukt: … |
| project-generator | Network error. Please try again. | Netwerkfout. Probeer het opnieuw. |
| project-generator | Fetching Odoo users... | Odoo-gebruikers ophalen… |
| project-generator | Loading generation preview... | Voorbeeld laden… |
| project-generator | Please select a start date | Kies eerst een startdatum |
| project-generator | User already added | Deze gebruiker is al toegevoegd |
| event-operations | Out of Sync / Published / Draft / Not Published / Archived | Niet gesynchroniseerd / Gepubliceerd / Concept / Niet gepubliceerd / Gearchiveerd |
| event-operations | Events out of sync between Odoo and WordPress | Events die niet synchroon lopen tussen Odoo en WordPress |
| event-operations | Event Type / Status / Actions | Eventtype / Status / Acties |
| event-operations | Select an event from the calendar | Kies een event in de kalender |
| event-operations | New Mapping / Close | Nieuwe koppeling / Sluiten |
| event-operations | Select Odoo Event Type... / Select WP Tag... | Kies een Odoo-eventtype… / Kies een WP-tag… |
| event-operations | Odoo Event Type / WordPress Tag / Color | Odoo-eventtype / WordPress-tag / Kleur |
| event-operations | Confirmation / Reminder / Recap | Bevestiging / Herinnering / Nazending |
| event-operations | ✅ Event type mapping saved | Koppeling opgeslagen |
| event-operations | ❌ Failed to save mapping: … | Koppeling opslaan mislukt: … |
| event-operations | ⚠️ Select both an Odoo event type and a WP tag | Kies zowel een Odoo-eventtype als een WP-tag |
| event-operations | No blocks yet. Add a paragraph or registration form to start. | Nog geen blokken. Voeg een paragraaf of inschrijfformulier toe om te starten. |
| event-operations | ✅ Editorial content saved! Re-publish the webinar to apply changes | Inhoud opgeslagen. Publiceer de webinar opnieuw om de wijzigingen door te voeren. |
| event-operations | ⚠️ Failed to load forminator forms: … | Formulieren laden mislukt: … |
| sales-insight-explorer | Saving query... | Query opslaan… |
| sales-insight-explorer | Please save the query first | Sla de query eerst op |
| sales-insight-explorer | Please select a base model and at least one field | Kies een basismodel en minstens één veld |
| sales-insight-explorer | Failed to load saved queries: … | Opgeslagen query's laden mislukt: … |
| sales-insight-explorer | Failed to load query: … | Query laden mislukt: … |
| sales-insight-explorer | No capability info available | Geen capability-informatie beschikbaar |
| mail-signature-designer | Sync production data not available in this module | Productiedata synchroniseren is niet beschikbaar in deze module |
| claude-settings | (Title Case-koppen, bv. "Nieuwe Koppeling Aanmaken") | Sentence case: "Nieuwe koppeling aanmaken", "Gebruikslog", "Koppeling testen" |

## 11. Prioriteitenlijst (refactorvolgorde)

1. **`src/lib/components/navbar.js`** — op elke pagina zichtbaar; "Administration" → "Beheer". Kleinste ingreep, grootste bereik.
2. **`src/modules/home/ui.js`** — login + startscherm is het eerste wat iedereen ziet; volledig Engels, `shadow-xl`, hardcoded theme.
3. **`src/modules/profile/ui.js`** — gemengde taal op één pagina (EN-kaarten naast NL-kaart) is de meest zichtbare inconsistentie; bevat ook de `document.elementElement`-bug.
4. **`public/admin-dashboard.html` + `public/admin-dashboard.js`** — dagelijks beheerinstrument; `window.alert()`-feedback en kaart-in-kaart wijken het sterkst af van het systeem.
5. **`src/modules/project-generator/ui.js` + `public/project-generator-client.js`** — volledig Engelstalige module incl. alle toasts; meeste `shadow-xl` en enige module met Tailwind-paletkleuren.
6. **`src/modules/event-operations/ui.js` + `public/event-operations-client.js`** — halfslachtige tweetaligheid en emoji-alerts; veel gebruikt door marketing.
7. **`public/sales-insights-app.js` + `src/modules/sales-insight-explorer/ui-*.js`** — alleen toasts/lege staten vertalen + `lang`/theme fixen; migratie loopt al.
8. **`public/claude-settings.html`** — Title Case-koppen, theme-init en `onclick` opruimen.
9. **`src/modules/mail-signature-designer/ui.js` + client** — inhoudelijk al vrijwel conform; alleen event-delegatie en één EN-string.
10. **`public/forminator-sync-v2.html` + `src/modules/asset-manager/ui.js`** — referentiemodules; alleen `shadow-xl`-empty-state (fsv2), `confirm()`-vervangingen en dode `forminator-sync-v2/ui.js` verwijderen.
11. **`src/modules/cx_powerboard/ui.js`** — taal is in orde; structurele opsplitsing (3052 regels, 36× onclick) is een apart project, geen design-system-quick-win.
