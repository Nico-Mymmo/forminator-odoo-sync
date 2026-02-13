# Event Operations – Addendum C Implementation Log

**Module:** Event Operations  
**Addendum:** C – Event Type → WordPress Mapping Refactor  
**Date:** 2026-02-13  
**Status:** ✅ Implemented and documented

---

## Metadata

| Veld | Waarde |
|------|--------|
| Spec Document | `ADDENDUM_C_EVENT_TYPE_MAPPING.md` |
| Migration | `20260213090000_event_operations_addendum_c_event_type_mapping.sql` |
| Breaking Change | Yes |
| Final Commit | `b1c85c3` |

---

## Scope Locked

1. Sync source van taxonomy-beslissingen wijzigt van `x_studio_tag_ids` (many2many) naar Odoo event type many2one.
2. Nieuwe module-tabel: `event_type_wp_tag_mapping`.
3. Deterministische mapping: één event type → max één WP category mapping.
4. Meerdere event types mogen naar dezelfde WP category mappen.
5. Ontbrekende mapping geeft hard fail (geen silent fallback).

---

## Canonical Field Truth (Code as Source of Truth)

- **Canonical Odoo bronveld:** `x_event_type_id`
- **Interne genormaliseerde sleutel in codepad:** `x_webinar_event_type_id`
- **Implementatie-detail:** `odoo-client.js` doet runtime `fields_get` autodiscovery (met voorkeur voor `x_event_type_id`) en normaliseert daarna naar de interne sleutel zodat rest van de module stabiel blijft.

Dit betekent:
1. Documentatie verwijst voor Odoo-datamodel naar `x_event_type_id`.
2. Interne code- en foutmeldingen mogen `x_webinar_event_type_id` bevatten als genormaliseerde interne sleutel.

---

## Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/20260213090000_event_operations_addendum_c_event_type_mapping.sql` | CREATE |
| `src/modules/event-operations/constants.js` | MODIFY |
| `src/modules/event-operations/odoo-client.js` | MODIFY |
| `src/modules/event-operations/tag-mapping.js` | REPLACE |
| `src/modules/event-operations/wp-client.js` | MODIFY |
| `src/modules/event-operations/routes.js` | MODIFY |
| `src/modules/event-operations/ui.js` | MODIFY |
| `public/event-operations-client.js` | MODIFY |
| `docs/event-operations/ADDENDUM_C_EVENT_TYPE_MAPPING.md` | MODIFY |
| `docs/event-operations/ADDENDUM_A_EVENT_OPERATIONS.md` | MODIFY |

---

## Implemented Behavior

1. Publish taxonomy gebruikt event type mapping: event type → `event_type_wp_tag_mapping`.
2. `x_studio_tag_ids` wordt niet meer gebruikt voor WP taxonomy beslissingen.
3. Hard-fail validatie toegevoegd voor:
   - ontbrekend event type
   - ontbrekende mapping
4. Mapping UI gebruikt Event Type → WP Event Category flow.
5. WP categories worden live opgehaald via `tribe_events_cat` endpoint.
6. Tribe publish payload zet category via `categories = wp_tag_slug`.

---

## Endpoints (Addendum C)

- `GET /events/api/event-type-tag-mappings`
- `PUT /events/api/event-type-tag-mappings`
- `DELETE /events/api/event-type-tag-mappings/:id`
- `GET /events/api/odoo-event-types`
- `GET /events/api/wp-event-categories`

---

## Runtime Issues & Fixes

| # | Issue | Severity | Root Cause | Resolution |
|---|-------|----------|------------|------------|
| 1 | Odoo error: Invalid field `x_webinar_event_type_id` on `x_webinar` | Critical | Tenant gebruikt `x_event_type_id` als many2one veldnaam | `fields_get` autodiscovery + normalisatie toegevoegd |
| 2 | Mapping UI toonde globale WP tags i.p.v. TEC categories | High | Verkeerde bronendpoint gebruikt | Teruggezet naar `/api/wp-event-categories` (`tribe_events_cat`) |
| 3 | UI toonde HTML entities (`Q&amp;A`) | Low | Geen decode in rendering | Client-side entity decode toegevoegd |
| 4 | Mapping tabel toonde `Event Type #X` labels | Low | Geen naamresolutie op rows | Resolutie tegen live Odoo event type lijst toegevoegd |
| 5 | WP category werd niet toegewezen bij publish | High | Payload gebruikte geen correcte TEC category assignment | Publish payload hersteld naar `categories = wp_tag_slug` |

---

## Documentation Sync Deltas (Explicit)

Deze kleine maar kritieke wijzigingen zijn expliciet gedocumenteerd om discrepantie te voorkomen:

1. Odoo waarheid is `x_event_type_id` (niet `x_webinar_event_type_id`).
2. Interne sleutel `x_webinar_event_type_id` is een normalisatielaag en geen vereiste Odoo veldnaam.
3. Taxonomy bron is TEC category taxonomy (`tribe_events_cat`), niet globale WP tags.
4. Publish category assignment gebeurt via `categories` met slug uit mapping (`wp_tag_slug`).

---

## Validation

- ✅ Syntax/diagnostics checks op gewijzigde JS/MD bestanden zonder errors
- ⚠️ End-to-end integratie vereist runtime verificatie met echte Odoo/WP omgeving

### Manual Checklist

- [ ] 2 event types → 1 category mapping; verifieer deterministische publish
- [ ] Mapping verwijderen; verifieer expliciete hard fail
- [ ] Webinar zonder event type; verifieer expliciete hard fail
- [ ] Verifieer Addendum B datetime gedrag blijft correct
- [ ] Verifieer Addendum A editorial UI/editor blijft correct
