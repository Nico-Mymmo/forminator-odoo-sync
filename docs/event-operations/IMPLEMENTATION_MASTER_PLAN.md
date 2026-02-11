# Event Operations – Implementation Master Plan

**Module:** Event Operations  
**Basisdocument:** EVENT_OPERATIONS_ANALYSIS_V4.md  
**Datum:** 11 februari 2026  
**Branch:** `events-operations`

---

## Principes

- Fase per fase, geen sprongen
- Elke STOPPOINT bevestigd vóór doorgaan
- Elke fase traceerbaar via git commit
- Rollback mogelijk per fase
- Geen architectuurwijzigingen, geen nieuwe features

---

## Phase 0 – Baseline Check

### Doel
Bevestig dat alle externe systemen bereikbaar zijn en environment variabelen correct geconfigureerd.

### Affected Files
Geen (alleen verificatie)

### Stappen

#### 0.1 Cloudflare Worker Environment Variables

Controleer dat de volgende secrets/vars geconfigureerd zijn in Cloudflare dashboard of `.dev.vars`:

| Variable | Type | Beschrijving |
|----------|------|-------------|
| `DB_NAME` | secret | Odoo database naam |
| `UID` | secret | Odoo user ID (numeriek) |
| `API_KEY` | secret | Odoo API key |
| `SUPABASE_URL` | secret | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Supabase service role key |
| `WORDPRESS_URL` | var | WordPress site URL (zonder trailing slash) |
| `WP_API_TOKEN` | secret | WordPress Application Password / JWT token |

**Command:**
```bash
npx wrangler secret list
```

**Verwacht:** Alle 7 variabelen aanwezig.

#### 0.2 Odoo Connectiviteit

Test dat `searchRead` op `x_webinar` werkt.

**Command:**
```bash
npx wrangler dev
```

**Manual Test (curl):**
```bash
# Gebruik een bestaand module-endpoint om Odoo connectiviteit te bevestigen
# Of gebruik het test-script:
node scripts/test-odoo-connection.mjs
```

**Verwacht:** Geen connection error, Odoo responds met JSON-RPC result.

#### 0.3 WordPress Connectiviteit

**Manual Test (curl):**
```bash
curl -s -H "Authorization: Bearer $WP_API_TOKEN" \
  "$WORDPRESS_URL/wp-json/tribe/events/v1/events?per_page=1"
```

**Verwacht:** HTTP 200, JSON array met events (of lege array).

#### 0.4 Supabase Connectiviteit

**Command:**
```bash
npx supabase db push --dry-run
```

**Verwacht:** Geen connection errors, migration status weergegeven.

#### 0.5 Supabase CLI Beschikbaar

**Command:**
```bash
npx supabase --version
```

**Verwacht:** Versie output (bijv. `1.x.x`).

### Verificatie Checklist

- [ ] Alle 7 env vars aanwezig
- [ ] Odoo `x_webinar` bereikbaar via searchRead
- [ ] WordPress Tribe Events endpoint bereikbaar
- [ ] WordPress Core REST endpoint bereikbaar
- [ ] Supabase CLI werkt
- [ ] `supabase db push --dry-run` succesvol

### Geen Commit

Phase 0 produceert geen code. Resultaten worden gelogd in IMPLEMENTATION_LOG.

---

## Phase 1 – Database Foundation

### Doel
Creëer `webinar_snapshots` tabel, RLS policies, indexen, en module registratie.

### Affected Files

| File | Actie |
|------|-------|
| `supabase/migrations/20260211000000_event_operations_v1.sql` | CREATE |

### Stappen

#### 1.1 Creëer Migration File

Maak `supabase/migrations/20260211000000_event_operations_v1.sql` exact zoals gespecificeerd in V4 sectie 7.1.

**Inhoud bevat:**
- `CREATE TABLE webinar_snapshots` (UUID PK, user_id, odoo_webinar_id, JSONB snapshots, computed_state)
- Index op user_id (GEEN foreign key)
- Unique index op (user_id, odoo_webinar_id)
- RLS policies TO public (SELECT, INSERT, UPDATE, DELETE)
- Trigger `update_updated_at()`
- Module registratie in `modules` tabel
- Auto-grant aan admin users

#### 1.2 Push Migration

**Command:**
```bash
npx supabase db push
```

**Verwacht:** Migration applied successfully.

#### 1.3 Test RLS Policies

**SQL (Supabase SQL Editor):**
```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'webinar_snapshots';
```

**Verwacht:** `rowsecurity = true`

```sql
-- Verify policies exist
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'webinar_snapshots';
```

**Verwacht:** 4 policies (SELECT, INSERT, UPDATE, DELETE), alle TO public.

#### 1.4 Test Insert/Select (Service Role)

**SQL (Supabase SQL Editor met service role):**
```sql
-- Test insert
INSERT INTO webinar_snapshots (user_id, odoo_webinar_id, odoo_snapshot, computed_state)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  999,
  '{"x_name": "Test Webinar", "x_active": true}'::jsonb,
  'not_published'
);

-- Test select
SELECT * FROM webinar_snapshots WHERE odoo_webinar_id = 999;

-- Cleanup
DELETE FROM webinar_snapshots WHERE odoo_webinar_id = 999;
```

**Verwacht:** Insert succeeds, select returns 1 row, delete succeeds.

#### 1.5 Verify Module Registratie

**SQL:**
```sql
SELECT code, name, route, is_active, display_order 
FROM modules 
WHERE code = 'event_operations';
```

**Verwacht:** 1 rij met `code='event_operations'`, `route='/events'`, `is_active=true`.

#### 1.6 Verify Admin Grant

**SQL:**
```sql
SELECT u.email, m.code, um.is_enabled
FROM user_modules um
JOIN users u ON u.id = um.user_id
JOIN modules m ON m.id = um.module_id
WHERE m.code = 'event_operations';
```

**Verwacht:** Admin users hebben `is_enabled=true`.

### Rollback Instructions

```bash
# Revert migration via Supabase SQL Editor:
DROP TABLE IF EXISTS webinar_snapshots CASCADE;
DELETE FROM user_modules WHERE module_id = (SELECT id FROM modules WHERE code = 'event_operations');
DELETE FROM modules WHERE code = 'event_operations';

# Of reset naar vorige migration:
# WAARSCHUWING: Dit reset ALLE data
npx supabase db reset
```

### Git Commit

```bash
git add supabase/migrations/20260211000000_event_operations_v1.sql
git commit -m "feat(event-operations): Phase 1 - Database foundation

- Create webinar_snapshots table with JSONB snapshots
- RLS policies TO public (user-scoped isolation)
- NO FK on user_id (index only, baseline compliance)
- Module registration: event_operations
- Auto-grant to admin users

STOPPOINT 1: Database verified"
```

### ⛔ STOPPOINT 1

**Bevestig vóór doorgaan:**
- [ ] Migration applied zonder errors
- [ ] RLS enabled + 4 policies actief
- [ ] Insert/Select/Delete werkt via service role
- [ ] Module geregistreerd in `modules` tabel
- [ ] Admin users hebben toegang
- [ ] Commit gemaakt

---

## Phase 2 – Module Skeleton

### Doel
Basisstructuur van de module: folderstructuur, module.js, registry update, UI skeleton (zonder data).

### Affected Files

| File | Actie |
|------|-------|
| `src/modules/event-operations/module.js` | CREATE |
| `src/modules/event-operations/routes.js` | CREATE (skeleton) |
| `src/modules/event-operations/ui.js` | CREATE (skeleton) |
| `src/modules/event-operations/constants.js` | CREATE |
| `src/modules/event-operations/utils/text.js` | CREATE |
| `src/modules/registry.js` | MODIFY (add import + MODULES entry) |

### Stappen

#### 2.1 Creëer Folderstructuur

```
src/modules/event-operations/
  module.js
  routes.js
  ui.js
  constants.js
  utils/
    text.js
  lib/
    (leeg, Phase 5)
```

#### 2.2 Creëer constants.js

Exact zoals V4 sectie 5.2. Bevat alle string literals: `WP_META_KEYS`, `SYNC_STATUS`, `ODOO_MODEL`, `ODOO_FIELDS`, `WP_ENDPOINTS`, `ROUTES`, `TIMEZONE`, `DEFAULT_DURATION_MINUTES`, `LOG_PREFIX`, `EMOJI`.

#### 2.3 Creëer utils/text.js

Exact zoals V4 sectie 5.3. Bevat `stripHtmlTags()` en `normalizeString()`.

#### 2.4 Creëer ui.js (Skeleton)

Statische HTML pagina met DaisyUI 4.12.14 layout. Geen data-fetching, alleen:
- Navbar placeholder
- Titel: "Event Operations"
- Beschrijving
- Lege card: "Module loaded. Data integration coming in Phase 3."

#### 2.5 Creëer routes.js (Skeleton)

Alleen `GET /` route die `eventOperationsUI()` rendert. Geen API routes nog.

#### 2.6 Creëer module.js

Exact zoals V4 sectie 8.2:
```javascript
export default {
  code: 'event_operations',
  name: 'Event Operations',
  description: 'Manage Odoo webinar publication to WordPress',
  route: '/events',
  icon: 'calendar',
  isActive: true,
  routes
};
```

#### 2.7 Update registry.js

Toevoegen aan `src/modules/registry.js`:
- Import: `import eventOperationsModule from './event-operations/module.js';`
- MODULES array: `eventOperationsModule` toevoegen

#### 2.8 Test: Module Laadt

**Command:**
```bash
npx wrangler dev
```

**Manual Test:**
1. Open browser: `http://localhost:8787/events`
2. Login als admin user

**Verwacht:**
- Pagina laadt zonder errors
- Navbar toont "Event Operations" icoon
- Card toont skeleton tekst
- Console: geen errors

### Rollback Instructions

```bash
# Verwijder module folder
rm -rf src/modules/event-operations/

# Revert registry.js naar vorige commit
git checkout HEAD -- src/modules/registry.js
```

### Git Commit

```bash
git add src/modules/event-operations/ src/modules/registry.js
git commit -m "feat(event-operations): Phase 2 - Module skeleton

- Folder structure: module.js, routes.js, ui.js, constants.js, utils/text.js
- Registry registration: event_operations in MODULES array
- DaisyUI skeleton UI (no data fetching)
- All constants centralized (no string literals)
- Text utilities: stripHtmlTags, normalizeString

STOPPOINT 2: Module loads, UI renders"
```

### ⛔ STOPPOINT 2

**Bevestig vóór doorgaan:**
- [ ] `GET /events` rendert HTML pagina
- [ ] Navbar toont Event Operations
- [ ] Geen console errors
- [ ] constants.js bevat alle string literals
- [ ] utils/text.js bevat stripHtmlTags + normalizeString
- [ ] Commit gemaakt

---

## Phase 3 – Odoo Fetch Integration

### Doel
Webinars ophalen uit Odoo via `searchRead` op `x_webinar` model.

### Affected Files

| File | Actie |
|------|-------|
| `src/modules/event-operations/odoo-client.js` | CREATE |
| `src/modules/event-operations/routes.js` | MODIFY (add GET /api/odoo-webinars) |

### Stappen

#### 3.1 Creëer odoo-client.js

Exact zoals V4 sectie 8.4:
- `getOdooWebinars(env)` – alle actieve webinars
- `getOdooWebinar(env, webinarId)` – single webinar
- Import vanuit `../../lib/odoo.js` (GEEN custom client)
- Gebruikt `ODOO_MODEL` en `ODOO_FIELDS` uit constants.js

#### 3.2 Voeg Route Toe: GET /api/odoo-webinars

Update `routes.js` met `GET /api/odoo-webinars` handler:
- Import `getOdooWebinars` from `./odoo-client.js`
- Logging met `LOG_PREFIX` en `EMOJI`
- Response: `{ success: true, data: [...] }`
- Error handling: `{ success: false, error: message }`

#### 3.3 Test: Fetch Webinars

**Command:**
```bash
npx wrangler dev
```

**Manual Test (browser/curl):**
```bash
# Na login, via browser console:
fetch('/events/api/odoo-webinars', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

**Verwacht:**
- `{ success: true, data: [...] }`
- Data bevat x_webinar records met velden: id, x_name, x_studio_date, x_studio_starting_time, x_studio_webinar_info, x_studio_stage_id
- Console log: `[Event Operations] 🎫 Fetching Odoo webinars...`
- Console log: `[Event Operations] ✅ Found N webinars`

#### 3.4 Test: Error Handling

**Test met verkeerde credentials (optioneel):**
- Tijdelijk verkeerde `API_KEY` → verwacht `{ success: false, error: "..." }`
- Herstel credentials na test

### Rollback Instructions

```bash
# Verwijder odoo-client.js
rm src/modules/event-operations/odoo-client.js

# Revert routes.js naar Phase 2
git checkout HEAD~1 -- src/modules/event-operations/routes.js
```

### Git Commit

```bash
git add src/modules/event-operations/odoo-client.js src/modules/event-operations/routes.js
git commit -m "feat(event-operations): Phase 3 - Odoo fetch integration

- odoo-client.js: getOdooWebinars, getOdooWebinar
- Uses lib/odoo.js searchRead (no custom client)
- Route: GET /api/odoo-webinars
- Constants-based field references (no string literals)
- Structured logging with module prefix

STOPPOINT 3: Odoo webinars fetched successfully"
```

### ⛔ STOPPOINT 3

**Bevestig vóór doorgaan:**
- [ ] `GET /events/api/odoo-webinars` returns webinar data
- [ ] Response bevat x_webinar fields
- [ ] Logging correct: prefix + emoji
- [ ] Geen string literals in business logic
- [ ] Error handling werkt
- [ ] Commit gemaakt

---

## Phase 4 – WordPress Fetch Integration

### Doel
Events ophalen uit WordPress via Tribe Events REST API.

### Affected Files

| File | Actie |
|------|-------|
| `src/modules/event-operations/wp-client.js` | CREATE (partial: alleen getWordPressEvents) |
| `src/modules/event-operations/routes.js` | MODIFY (add GET /api/wp-events) |

### Stappen

#### 4.1 Creëer wp-client.js (Gedeeltelijk)

Alleen `getWordPressEvents(env)` functie:
- Fetch van `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}?per_page=100`
- Authorization header met `env.WP_API_TOKEN`
- Error handling bij non-200 response
- Import `WP_ENDPOINTS` uit constants.js

**NIET in deze fase:**
- `publishToWordPress()` → Phase 6
- `saveSnapshot()` → Phase 5/6

#### 4.2 Voeg Route Toe: GET /api/wp-events

Update `routes.js` met `GET /api/wp-events` handler:
- Import `getWordPressEvents` from `./wp-client.js`
- Logging met `LOG_PREFIX` en `EMOJI`
- Response: `{ success: true, data: [...] }`

#### 4.3 Test: Fetch WordPress Events

**Manual Test (browser/curl):**
```bash
fetch('/events/api/wp-events', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

**Verwacht:**
- `{ success: true, data: [...] }`
- Data bevat WordPress events met id, title, start_date, end_date
- Console log: `[Event Operations] 🎫 Fetching WordPress events...`
- Console log: `[Event Operations] ✅ Found N events`

#### 4.4 Test: WordPress Endpoint Variaties

Bevestig beide endpoints:
- Tribe Events: `GET /wp-json/tribe/events/v1/events` → event listing
- Core REST: `GET /wp-json/wp/v2/tribe_events/{id}` → event met meta

### Rollback Instructions

```bash
# Verwijder wp-client.js
rm src/modules/event-operations/wp-client.js

# Revert routes.js naar Phase 3
git checkout HEAD~1 -- src/modules/event-operations/routes.js
```

### Git Commit

```bash
git add src/modules/event-operations/wp-client.js src/modules/event-operations/routes.js
git commit -m "feat(event-operations): Phase 4 - WordPress fetch integration

- wp-client.js: getWordPressEvents (read-only)
- Route: GET /api/wp-events
- Uses Tribe Events REST API
- Authorization via WP_API_TOKEN
- Publish flow deferred to Phase 6

STOPPOINT 4: WordPress events fetched successfully"
```

### ⛔ STOPPOINT 4

**Bevestig vóór doorgaan:**
- [ ] `GET /events/api/wp-events` returns WordPress events
- [ ] Authorization werkt (Bearer token)
- [ ] Geen hardcoded URLs (alles via constants + env)
- [ ] Logging correct
- [ ] Commit gemaakt

---

## Phase 5 – Snapshot & State Engine

### Doel
State engine implementeren, Supabase helper creëren, snapshot CRUD via helper.

### Affected Files

| File | Actie |
|------|-------|
| `src/modules/event-operations/state-engine.js` | CREATE |
| `src/modules/event-operations/mapping.js` | CREATE |
| `src/modules/event-operations/lib/supabaseClient.js` | CREATE |
| `src/modules/event-operations/routes.js` | MODIFY (add GET /api/snapshots) |

### Stappen

#### 5.1 Creëer lib/supabaseClient.js

Exact zoals V4 sectie 5.5:
- Module-scoped singleton (per-isolate)
- Env validation (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- `getSupabaseAdminClient(env)` async function

#### 5.2 Creëer mapping.js

Exact zoals V4 sectie 5.4:
- `mapOdooToWordPress(odooWebinar)` – transformatie Odoo → WP payload
- `computeStartDateTime(dateStr, timeFloat)` – interne helper
- `computeEndDateTime(startDate, durationMinutes)` – interne helper
- `formatLocalDateTime(date)` – timezone-aware formatting (GEEN toISOString)
- `extractOdooWebinarId(metaObject)` – WP meta extractie
- Import `stripHtmlTags` van `./utils/text.js`

#### 5.3 Creëer state-engine.js

Exact zoals V4 sectie 6.2:
- `computeEventState(odooSnapshot, wpSnapshot)` – pure function
- `detectDiscrepancies(odooSnapshot, wpSnapshot)` – interne helper
- Import `stripHtmlTags`, `normalizeString` van `./utils/text.js`
- Import `SYNC_STATUS`, `ODOO_FIELDS` van `./constants.js`

#### 5.4 Voeg Route Toe: GET /api/snapshots

Update `routes.js` met `GET /api/snapshots` handler:
- Import `getSupabaseAdminClient` from `./lib/supabaseClient.js`
- Query: `webinar_snapshots` WHERE `user_id = user.id`, order by `created_at DESC`
- Response: `{ success: true, data: [...] }`

#### 5.5 Test: Supabase Helper

**Manual Test (browser console na login):**
```bash
fetch('/events/api/snapshots', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

**Verwacht:**
- `{ success: true, data: [] }` (lege array, nog geen snapshots)
- Geen errors in console
- Helper valideert env vars correct

#### 5.6 Test: State Engine (Unit-Level)

**Verificatie via code review:**
Bevestig dat `computeEventState`:
- Archived Odoo + WP aanwezig → `SYNC_STATUS.ARCHIVED`
- Archived Odoo + geen WP → `SYNC_STATUS.DELETED`
- Active Odoo + geen WP → `SYNC_STATUS.NOT_PUBLISHED`
- Active Odoo + WP trash → `SYNC_STATUS.DELETED`
- Active Odoo + WP match → `SYNC_STATUS.PUBLISHED`
- Active Odoo + WP mismatch → `SYNC_STATUS.OUT_OF_SYNC`

#### 5.7 Test: Mapping (Unit-Level)

**Verificatie via code review:**
Bevestig dat `formatLocalDateTime`:
- Gebruikt `getFullYear()`, `getMonth()`, `getDate()`, etc.
- NIET `toISOString()` (timezone bug)
- Output format: `YYYY-MM-DD HH:MM:SS`

### Rollback Instructions

```bash
# Verwijder nieuwe bestanden
rm src/modules/event-operations/state-engine.js
rm src/modules/event-operations/mapping.js
rm -rf src/modules/event-operations/lib/

# Revert routes.js naar Phase 4
git checkout HEAD~1 -- src/modules/event-operations/routes.js
```

### Git Commit

```bash
git add src/modules/event-operations/state-engine.js \
        src/modules/event-operations/mapping.js \
        src/modules/event-operations/lib/supabaseClient.js \
        src/modules/event-operations/routes.js
git commit -m "feat(event-operations): Phase 5 - Snapshot & state engine

- state-engine.js: computeEventState (pure function)
- mapping.js: mapOdooToWordPress, formatLocalDateTime (timezone-safe)
- lib/supabaseClient.js: getSupabaseAdminClient (per-isolate singleton)
- Route: GET /api/snapshots
- Text utils imported from utils/text.js (no duplication)

STOPPOINT 5: State engine and Supabase helper verified"
```

### ⛔ STOPPOINT 5

**Bevestig vóór doorgaan:**
- [ ] `GET /events/api/snapshots` returns lege array
- [ ] Supabase helper valideert env vars
- [ ] state-engine.js alle states correct
- [ ] mapping.js formatLocalDateTime NIET toISOString
- [ ] stripHtmlTags geïmporteerd van utils/text.js (geen duplicatie)
- [ ] Commit gemaakt

---

## Phase 6 – Publish Flow

### Doel
Two-step publicatie: Odoo → WordPress Tribe → WordPress Core Meta → Supabase Snapshot.

### Affected Files

| File | Actie |
|------|-------|
| `src/modules/event-operations/wp-client.js` | MODIFY (add publishToWordPress, saveSnapshot) |
| `src/modules/event-operations/routes.js` | MODIFY (add POST /api/publish) |

### Stappen

#### 6.1 Extend wp-client.js

Toevoegen aan bestaand wp-client.js (V4 sectie 8.5):
- `publishToWordPress(env, userId, odooWebinarId)` – complete two-step flow
- `saveSnapshot(env, userId, odooWebinar, wpEvent)` – upsert naar Supabase
- Import `mapOdooToWordPress` van `./mapping.js`
- Import `getOdooWebinar` van `./odoo-client.js`
- Import `getSupabaseAdminClient` van `./lib/supabaseClient.js`
- Import `WP_ENDPOINTS`, `WP_META_KEYS` van `./constants.js`

**Two-Step Flow:**
1. Fetch Odoo webinar via `getOdooWebinar()`
2. Map met `mapOdooToWordPress()`
3. POST naar Tribe Events endpoint → krijg `wpEventId`
4. POST meta naar Core endpoint (`/wp-json/wp/v2/tribe_events/{wpEventId}`)
5. Save snapshot naar Supabase via `getSupabaseAdminClient()`

#### 6.2 Voeg Route Toe: POST /api/publish

Update `routes.js`:
- Body: `{ odoo_webinar_id: number }`
- Validation: `odoo_webinar_id` verplicht
- Response: `{ success: true, data: { wp_event_id, computed_state } }`
- Logging: `[Event Operations] 📤 Publishing webinar X...`

#### 6.3 Test: Publicatie naar WordPress

**⚠️ VOORZICHTIG: Dit creëert een ECHT event op WordPress.**

**Manual Test (browser console):**
```javascript
fetch('/events/api/publish', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ odoo_webinar_id: KNOWN_WEBINAR_ID })
}).then(r => r.json()).then(console.log)
```

**Verwacht:**
- `{ success: true, data: { wp_event_id: N, computed_state: 'published' } }`
- WordPress event aangemaakt (controleer WP admin)
- Meta veld `odoo_webinar_id` aanwezig op WP event
- Snapshot opgeslagen in Supabase

**Verificatie stappen:**
1. Check WP Admin: Event bestaat met correcte titel, datum, beschrijving
2. Check WP meta: `odoo_webinar_id` bevat Odoo ID (string)
3. Check Supabase: `webinar_snapshots` bevat nieuwe rij
4. Check `GET /api/snapshots`: toont de nieuwe snapshot

#### 6.4 Test: Duplicate Publicatie

Publiceer dezelfde webinar opnieuw:

**Verwacht:** Upsert (update existing snapshot, geen duplicate rij) dankzij unique constraint op `(user_id, odoo_webinar_id)`.

#### 6.5 Test: Error Scenario

Test met ongeldig `odoo_webinar_id`:

```javascript
fetch('/events/api/publish', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ odoo_webinar_id: 999999 })
}).then(r => r.json()).then(console.log)
```

**Verwacht:** `{ success: false, error: "Webinar 999999 not found in Odoo" }`

### Rollback Instructions

```bash
# Revert wp-client.js en routes.js naar Phase 5
git checkout HEAD~1 -- src/modules/event-operations/wp-client.js
git checkout HEAD~1 -- src/modules/event-operations/routes.js

# Handmatig gepubliceerde WP events verwijderen via WP Admin
# Handmatig snapshots verwijderen:
# SQL: DELETE FROM webinar_snapshots WHERE user_id = 'YOUR_USER_ID';
```

### Git Commit

```bash
git add src/modules/event-operations/wp-client.js src/modules/event-operations/routes.js
git commit -m "feat(event-operations): Phase 6 - Publish flow

- publishToWordPress: Two-step REST (Tribe + Core meta)
- saveSnapshot: Upsert to Supabase via helper
- Route: POST /api/publish
- Mapping via mapOdooToWordPress (timezone-safe)
- Meta: odoo_webinar_id on WordPress event

STOPPOINT 6: End-to-end publish verified"
```

### ⛔ STOPPOINT 6

**Bevestig vóór doorgaan:**
- [ ] POST /api/publish creëert WP event
- [ ] Two-step flow: Tribe endpoint + Core meta endpoint
- [ ] Meta `odoo_webinar_id` aanwezig op WP event
- [ ] Snapshot opgeslagen in Supabase
- [ ] Upsert werkt (geen duplicaten)
- [ ] Error handling bij invalid webinar ID
- [ ] Commit gemaakt

---

## Phase 7 – Discrepancy Engine & UI

### Doel
Discrepancy detectie, sync status berekening, en visuele indicators in de UI.

### Affected Files

| File | Actie |
|------|-------|
| `src/modules/event-operations/routes.js` | MODIFY (add GET /api/discrepancies, POST /api/sync) |
| `src/modules/event-operations/ui.js` | MODIFY (full UI met data-fetching) |

### Stappen

#### 7.1 Voeg Route Toe: GET /api/discrepancies

Query `webinar_snapshots` WHERE `computed_state = 'out_of_sync'`, user-scoped.

#### 7.2 Voeg Route Toe: POST /api/sync

Implementeer sync logica:
1. Fetch alle Odoo webinars via `getOdooWebinars()`
2. Fetch alle WP events via `getWordPressEvents()`
3. Match op `odoo_webinar_id` in WP meta
4. Bereken `computeEventState()` voor elke match
5. Update snapshots in Supabase
6. Return: `{ synced_count, discrepancies: [...] }`

#### 7.3 Update UI

Vervang skeleton UI met functionele interface:
- Webinar lijst met sync status badges
- Status kleuren:
  - `not_published` → badge-ghost
  - `published` → badge-success
  - `out_of_sync` → badge-warning
  - `archived` → badge-info
  - `deleted` → badge-error
- Publish knop per webinar
- Sync knop (alle webinars)
- Discrepancy overzicht

#### 7.4 Test: Sync Flow

**Manual Test:**
1. Publiceer een webinar (Phase 6)
2. Wijzig de webinar titel in Odoo
3. Run sync: `POST /api/sync`
4. Check: webinar status → `out_of_sync`
5. Check: `GET /api/discrepancies` toont de webinar

#### 7.5 Test: UI Visual Indicators

1. Open `GET /events`
2. Controleer: badges tonen correcte status
3. Controleer: publish knop werkt
4. Controleer: sync knop werkt

### Rollback Instructions

```bash
# Revert routes.js en ui.js naar Phase 6
git checkout HEAD~1 -- src/modules/event-operations/routes.js
git checkout HEAD~1 -- src/modules/event-operations/ui.js
```

### Git Commit

```bash
git add src/modules/event-operations/routes.js src/modules/event-operations/ui.js
git commit -m "feat(event-operations): Phase 7 - Discrepancy engine & UI

- Route: GET /api/discrepancies (out_of_sync filter)
- Route: POST /api/sync (full sync cycle)
- UI: webinar list with status badges
- UI: publish and sync buttons
- computeEventState integration
- DaisyUI 4.12.14 compliant layout

STOPPOINT 7: Full MVP complete"
```

### ⛔ STOPPOINT 7

**Bevestig vóór doorgaan:**
- [ ] UI toont webinar lijst met correcte status badges
- [ ] Publish knop werkt (two-step flow)
- [ ] Sync detecteert discrepancies
- [ ] `GET /api/discrepancies` filtert correct
- [ ] Visuele indicators per V4 specificatie
- [ ] Commit gemaakt

---

## Phase Overzicht

| Phase | Doel | Files | Stoppoint |
|-------|------|-------|-----------|
| 0 | Baseline Check | geen | — |
| 1 | Database Foundation | 1 migration | ⛔ SP1 |
| 2 | Module Skeleton | 6 files + registry | ⛔ SP2 |
| 3 | Odoo Fetch | 2 files | ⛔ SP3 |
| 4 | WordPress Fetch | 2 files | ⛔ SP4 |
| 5 | State Engine | 4 files | ⛔ SP5 |
| 6 | Publish Flow | 2 files | ⛔ SP6 |
| 7 | Discrepancy & UI | 2 files | ⛔ SP7 |

**Totaal commits:** 7 (Phase 1–7)
**Totaal nieuwe files:** 10
**Totaal gewijzigde bestaande files:** 1 (registry.js)

---

**Document Status:** ✅ Compleet  
**Basisdocument:** EVENT_OPERATIONS_ANALYSIS_V4.md  
**Architectuur wijzigingen:** Geen  
**Nieuwe features buiten V4:** Geen
