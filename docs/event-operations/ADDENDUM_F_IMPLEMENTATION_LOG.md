# ADDENDUM F – IMPLEMENTATION LOG

**Module:** Event Operations  
**Addendum:** F – Sync Performance Refactor  
**Implementation Date:** February 16, 2026  
**Status:** ✅ COMPLETE  
**Depends on:** Addendum F Analyse

---

## 1. IMPLEMENTATIE SAMENVATTING

Deze implementatie levert een gerichte performance-refactor op de bestaande Event Operations sync-flow, zonder functionele of UI-wijzigingen.

Doelstellingen die zijn opgeleverd:

1. Consistente sync stage-timing logs toegevoegd
2. Registratie-counts geoptimaliseerd van N calls naar 1 `read_group` call
3. Sequentiële sync-loop vervangen door bounded parallelism (max 5 workers)
4. Snapshot writes geoptimaliseerd via batch-upserts met partial-failure fallback

---

## 2. SCOPE EN GARANTIES

### 2.1 In scope

- Backend performance-optimalisatie van:
  - `POST /events/api/sync`
  - `GET /events/api/odoo-webinars`

### 2.2 Niet gewijzigd

- Geen wijzigingen aan `computeEventState` logica
- Geen wijzigingen aan UI gedrag of API contracten
- Geen nieuwe features (jobs, incremental sync, nieuwe endpoints)

### 2.3 Backward compatibility

- Response shape van `/events/api/odoo-webinars` blijft identiek:
  - `{ success, data: { webinars, registrationCounts } }`
- Response shape van `/events/api/sync` blijft identiek:
  - `{ success, data: { synced_count, discrepancies } }`

---

## 3. FILES GEWIJZIGD

| File | Type | Wijziging |
|------|------|-----------|
| `src/modules/event-operations/routes.js` | Modified | Instrumentatie, concurrency pool, batch upsert flow, read_group usage |
| `src/modules/event-operations/odoo-client.js` | Modified | Nieuwe bulk helper `getRegistrationCountsByWebinar()` via Odoo `read_group` |

### 3.1 Bewust niet gewijzigd

- `src/modules/event-operations/wp-client.js`
- `src/modules/event-operations/ui.js`

Reden: refactor is volledig backend-performance gericht en contract-compatibel.

---

## 4. FASE 1 — INSTRUMENTATIE

Toegevoegd in sync-route:

- `total_sync_ms`
- `fetch_odoo_ms`
- `fetch_wp_core_ms`
- `wp_detail_total_ms`
- `wp_detail_count`
- `snapshot_upsert_total_ms`
- `snapshot_upsert_count`

### 4.1 Technische implementatie

- Utility functies in `routes.js`:
  - `nowMs()` (gebruikt `performance.now()` met fallback)
  - `elapsedMs(start)`
- Structured logging op sync-einde:
  - `SYNC_TIMING { ...metrics }`

Voorbeeld log:

```text
[Event Operations] 📊 SYNC_TIMING {"total_sync_ms":1234,"fetch_odoo_ms":210,"fetch_wp_core_ms":180,"wp_detail_total_ms":420,"wp_detail_count":38,"snapshot_upsert_total_ms":150,"snapshot_upsert_count":40}
```

---

## 5. FASE 2 — REGISTRATIE-COUNTS OPTIMALISATIE

### 5.1 Oude situatie

- Per webinar: aparte `search_count` call op `x_webinarregistrations`
- Resultaat: veel Odoo RPC roundtrips

### 5.2 Nieuwe situatie

- Eén Odoo `read_group` call op `x_webinarregistrations`
- Group by: `x_studio_linked_webinar`
- Resultaat wordt in memory gemapt naar `registrationCounts`

### 5.3 Implementatiedetails

- Nieuwe helper in `odoo-client.js`:
  - `getRegistrationCountsByWebinar(env, webinarIds)`
- `GET /api/odoo-webinars` gebruikt nu deze helper
- Onbekende webinar IDs blijven fallbacken naar `0`

---

## 6. FASE 3 — BOUNDED PARALLELISM (SYNC LOOP)

### 6.1 Oude situatie

- `for...of` met sequentiële `await` per webinar:
  - `getWordPressEvent(...)`
  - snapshot upsert

### 6.2 Nieuwe situatie

- Generic concurrency pool toegevoegd: `runWithConcurrency(items, concurrency, worker)`
- Concurrency cap: `SYNC_WORKER_CONCURRENCY = 5`
- Toegepast op:
  1. WP detail-fetch fase
  2. Snapshot write fase

### 6.3 Foutafhandeling

- Per webinar blijft foutafhandeling individueel
- WP detail fetch fout -> fallback op WP Core event (bestaand gedrag behouden)
- Geen silent failures: errors blijven expliciet gelogd

---

## 7. FASE 4 — BATCH SNAPSHOT UPSERTS

### 7.1 Oude situatie

- Per webinar individuele `upsert(...)` call

### 7.2 Nieuwe situatie

- Eerst alle snapshot rows verzamelen in array
- Batchen via `SNAPSHOT_UPSERT_BATCH_SIZE = 25`
- Per batch één `upsert(batchRows, { onConflict: 'user_id,odoo_webinar_id' })`

### 7.3 Partial failure handling

- Als batch upsert faalt:
  - fout loggen op batchniveau
  - fallback naar row-by-row upsert binnen die batch
  - row errors expliciet loggen

### 7.4 Idempotentie

- Idempotent gedrag blijft behouden door bestaande `onConflict: 'user_id,odoo_webinar_id'`

---

## 8. VALIDATIE EN KWALITEITSCHECKS

Uitgevoerde checks:

- Syntax/errors gecontroleerd op gewijzigde bestanden
- Geen compile/lint errors in:
  - `src/modules/event-operations/routes.js`
  - `src/modules/event-operations/odoo-client.js`

Functionele compatibiliteit (te verifiëren in omgeving):

1. `/events/api/odoo-webinars` geeft nog steeds `webinars + registrationCounts`
2. `/events/api/sync` geeft nog steeds `synced_count + discrepancies`
3. State-computation blijft gelijk voor dezelfde inputdata

---

## 9. PERFORMANCE MEETPLAN (VOOR/NA)

### 9.1 Sync metingen

Voer 5–10 sync-runs uit op vergelijkbare dataset en vergelijk medianes van:

- `total_sync_ms`
- `wp_detail_total_ms`
- `snapshot_upsert_total_ms`

Bron: `SYNC_TIMING` logs.

### 9.2 Odoo RPC reductie

Controleer logs tijdens `GET /api/odoo-webinars`:

- Verwacht: 1x `read_group` op `x_webinarregistrations`
- Niet meer: Nx `search_count`

### 9.3 Behaviour-equivalentie

- Vergelijk sync-uitkomst vóór/na op:
  - `synced_count`
  - aantal/inhoud `discrepancies`
- Controleer snapshot tabel op duplicate-preventie via unieke conflict-key

---

## 10. VERWACHT RESULTAAT

Bij middelgrote dataset (bijv. 30+ webinars) wordt verwacht:

- duidelijke daling van sync-runtime
- stabielere runtimes door bounded parallelism
- sterk minder Odoo RPC roundtrips in webinar-load route

De doelwaarde uit de analyse blijft: significante runtime-daling (richting >40% bij hogere volumes), afhankelijk van externe API latency en omgeving.
