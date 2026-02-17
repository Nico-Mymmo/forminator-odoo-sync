# EVENT OPERATIONS – ADDENDUM I: STATUS COLOR ALIGNMENT & SYNC COMPARISON TIMEZONE FIX

**Module Code:** `event_operations`  
**Module Name:** Event Operations  
**Implementation Date:** February 17, 2026  
**Status:** Implemented  
**Scope Type:** UI behavior refinement (no schema changes)

---

## 1. Doel

Addendum I levert twee gerichte UX-correcties:

1. `Not Published` visueel sterker onderscheiden via DaisyUI `error` kleur.
2. Ctrl+Click sync-vergelijking corrigeren zodat starttijdvergelijking timezone-consistent is.

---

## 2. Wijziging 1 — Not Published kleur naar error

De status `not_published` is aangepast van info/ghost naar error-styling zodat het verschil met draft/published duidelijker is.

Doorgevoerd in:

- `src/modules/event-operations/ui.js`
  - `STATUS_BADGES.not_published.css` → `badge-error`
  - status legend chip `Not Published` → `legend-error`
- `public/detail-panel-controller.js`
  - detail panel status badge `not_published` → `badge-error`
- `public/calendar-controller.js`
  - kalender statusdot kleurmapping `not_published` → DaisyUI error (`--er`)

---

## 3. Wijziging 2 — Sync vergelijking timezone-fix

### Probleem

In de Ctrl+Click sync-vergelijking kon `Starttijd` fout als mismatch gemarkeerd worden door UTC/local interpretatieverschillen, ondanks correcte WordPress-opslag.

### Oplossing

Vergelijking en visualisatie zijn genormaliseerd op één consistente basis:

1. Parse Odoo datetime als UTC-bron.
2. Gebruik `wp.utc_start_date` (fallback `wp.start_date`) als UTC-bron.
3. Vergelijk op exact UTC timestampniveau.
4. Visualiseer zowel Odoo als WP datum/tijd in Brussels timezone voor gebruikers.

Doorgevoerd in:

- `public/detail-panel-controller.js`
  - discrepancy-check datum/tijd naar UTC-aware vergelijking
  - sync modal velden `Startdatum` en `Starttijd` renderen timezone-consistent

---

## 4. Niet gewijzigd

Addendum I wijzigt **niet**:

- sync-write flow
- snapshot schema
- mapping schema
- publish flow
- API contracten

---

## 5. Resultaat

1. `Not Published` is visueel consistent als error-status in badges, legend en kalenderdots.
2. Ctrl+Click sync-vergelijking toont geen foutieve tijd-mismatch door timezone-conversie.
3. Out-of-sync beoordeling voor datum/tijd volgt nu consistente UTC-logica.
