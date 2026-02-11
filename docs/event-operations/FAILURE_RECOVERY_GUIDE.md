# Event Operations – Failure Recovery Guide

**Module:** Event Operations  
**Basisdocument:** EVENT_OPERATIONS_ANALYSIS_V4.md  
**Master Plan:** IMPLEMENTATION_MASTER_PLAN.md

---

## Doel

Procedures voor het herstellen van fouten tijdens en na implementatie. Elke sectie is zelfstandig uitvoerbaar.

---

## 1. Migration Rollback

### 1.1 Volledig Terugdraaien (DROP)

**Wanneer:** Migration heeft fouten of tabel moet opnieuw.

```sql
-- Supabase SQL Editor (service role)

-- Stap 1: Verwijder user_modules koppelingen
DELETE FROM user_modules 
WHERE module_id = (
  SELECT id FROM modules WHERE code = 'event_operations'
);

-- Stap 2: Verwijder module registratie
DELETE FROM modules WHERE code = 'event_operations';

-- Stap 3: Verwijder tabel (CASCADE verwijdert trigger + policies)
DROP TABLE IF EXISTS webinar_snapshots CASCADE;
```

**Verificatie:**
```sql
-- Tabel bestaat niet meer
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'webinar_snapshots'
);
-- Verwacht: false

-- Module niet meer geregistreerd
SELECT COUNT(*) FROM modules WHERE code = 'event_operations';
-- Verwacht: 0
```

### 1.2 Supabase Migration History Opschonen

**Wanneer:** Migration is geregistreerd maar moet opnieuw gedraaid worden.

```sql
-- Verwijder migration record uit Supabase tracking
DELETE FROM supabase_migrations.schema_migrations 
WHERE version = '20260211000000';
```

**Daarna:** Voer `npx supabase db push` opnieuw uit.

### 1.3 Volledige Database Reset (DESTRUCTIEF)

**⚠️ WAARSCHUWING: Verwijdert ALLE data in ALLE tabellen.**

```bash
npx supabase db reset
```

**Alleen gebruiken als:**
- Lokale development database
- Geen productie data aanwezig
- Alle migrations opnieuw moeten draaien

---

## 2. Module Uitschakelen

### 2.1 Soft Disable (Database)

**Wanneer:** Module moet tijdelijk onzichtbaar zijn voor users.

```sql
-- Deactiveer module
UPDATE modules 
SET is_active = false 
WHERE code = 'event_operations';
```

**Effect:**
- Module verschijnt niet meer in navbar
- Bestaande routes geven 404
- Data blijft intact
- Heractiveren: `UPDATE modules SET is_active = true WHERE code = 'event_operations';`

### 2.2 Revoke User Access

**Wanneer:** Specifieke users moeten geen toegang hebben.

```sql
-- Alle users
UPDATE user_modules 
SET is_enabled = false 
WHERE module_id = (
  SELECT id FROM modules WHERE code = 'event_operations'
);

-- Specifieke user
UPDATE user_modules 
SET is_enabled = false 
WHERE module_id = (SELECT id FROM modules WHERE code = 'event_operations')
  AND user_id = 'USER_UUID_HERE';
```

### 2.3 Hard Disable (Code)

**Wanneer:** Module moet volledig uit de Worker verwijderd worden.

**Stap 1:** Verwijder import uit `src/modules/registry.js`:
```javascript
// VERWIJDER deze regel:
import eventOperationsModule from './event-operations/module.js';

// VERWIJDER uit MODULES array:
// eventOperationsModule
```

**Stap 2:** Deploy:
```bash
npx wrangler deploy
```

**Stap 3 (optioneel):** Verwijder module folder:
```bash
rm -rf src/modules/event-operations/
```

**Effect:** Module is volledig uit de Worker, geen routes meer actief.

---

## 3. WordPress Event Herstel

### 3.1 Handmatig Event Verwijderen

**Wanneer:** Test-event of foutief event moet weg.

**Via WP Admin:**
1. Login op WordPress admin panel
2. Navigeer naar Events → All Events
3. Hover over event → Trash
4. Events → Trash → Permanently Delete

**Via REST API:**
```bash
# Move to trash
curl -X DELETE \
  -H "Authorization: Bearer $WP_API_TOKEN" \
  "$WORDPRESS_URL/wp-json/tribe/events/v1/events/{EVENT_ID}"

# Permanently delete (force)
curl -X DELETE \
  -H "Authorization: Bearer $WP_API_TOKEN" \
  "$WORDPRESS_URL/wp-json/tribe/events/v1/events/{EVENT_ID}?force=true"
```

### 3.2 Event Meta Corrigeren

**Wanneer:** `odoo_webinar_id` meta is fout of ontbreekt.

```bash
# Update meta
curl -X POST \
  -H "Authorization: Bearer $WP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meta": {"odoo_webinar_id": "CORRECT_ID"}}' \
  "$WORDPRESS_URL/wp-json/wp/v2/tribe_events/{EVENT_ID}"
```

**Verificatie:**
```bash
# Read meta
curl -s \
  -H "Authorization: Bearer $WP_API_TOKEN" \
  "$WORDPRESS_URL/wp-json/wp/v2/tribe_events/{EVENT_ID}" | jq '.meta'
```

### 3.3 Alle Test Events Opruimen

**Wanneer:** Na testing fase, alle test events verwijderen.

```bash
# Lijst alle events
curl -s \
  -H "Authorization: Bearer $WP_API_TOKEN" \
  "$WORDPRESS_URL/wp-json/tribe/events/v1/events?per_page=100" | jq '.[].id'

# Per event verwijderen (loop)
for ID in 101 102 103; do
  curl -X DELETE \
    -H "Authorization: Bearer $WP_API_TOKEN" \
    "$WORDPRESS_URL/wp-json/tribe/events/v1/events/$ID?force=true"
done
```

---

## 4. Snapshot Herstel

### 4.1 Alle Snapshots Verwijderen (Per User)

**Wanneer:** User snapshots zijn corrupt of inconsistent.

```sql
DELETE FROM webinar_snapshots 
WHERE user_id = 'USER_UUID_HERE';
```

### 4.2 Specifiek Snapshot Verwijderen

**Wanneer:** Één snapshot is fout.

```sql
DELETE FROM webinar_snapshots 
WHERE user_id = 'USER_UUID_HERE' 
  AND odoo_webinar_id = WEBINAR_ID;
```

### 4.3 Snapshot State Forceren

**Wanneer:** Computed state is verkeerd, moet handmatig gecorrigeerd worden.

```sql
UPDATE webinar_snapshots 
SET computed_state = 'not_published',
    wp_snapshot = NULL,
    updated_at = NOW()
WHERE user_id = 'USER_UUID_HERE' 
  AND odoo_webinar_id = WEBINAR_ID;
```

**Mogelijke states:** `not_published`, `published`, `out_of_sync`, `archived`, `deleted`

### 4.4 Alle Snapshots Reconstrueren

**Wanneer:** Snapshots moeten opnieuw opgebouwd worden vanuit live data.

**Procedure:**
1. Verwijder alle snapshots voor user
2. Login als user
3. Trigger sync: `POST /events/api/sync`
4. Controleer resultaten: `GET /events/api/snapshots`

```sql
-- Stap 1: Clean slate
DELETE FROM webinar_snapshots WHERE user_id = 'USER_UUID_HERE';
```

```javascript
// Stap 2-3: Via browser console (na login)
fetch('/events/api/sync', {
  method: 'POST',
  credentials: 'include'
}).then(r => r.json()).then(console.log)
```

---

## 5. Inconsistent State Detectie

### 5.1 Snapshot vs WordPress Mismatch

**Query: Snapshots die 'published' zijn maar WP event niet bestaat.**

```sql
SELECT 
  ws.odoo_webinar_id,
  ws.computed_state,
  ws.wp_snapshot->>'id' AS wp_event_id,
  ws.updated_at
FROM webinar_snapshots ws
WHERE ws.computed_state = 'published'
  AND ws.user_id = 'USER_UUID_HERE'
ORDER BY ws.updated_at DESC;
```

**Handmatig valideren:** Voor elke `wp_event_id`, check of event nog bestaat:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $WP_API_TOKEN" \
  "$WORDPRESS_URL/wp-json/wp/v2/tribe_events/{WP_EVENT_ID}"
```

- HTTP 200 → Event bestaat, snapshot correct
- HTTP 404 → Event verwijderd, snapshot update nodig

### 5.2 Orphaned Snapshots

**Query: Snapshots zonder corresponderend WP event.**

```sql
SELECT 
  ws.id,
  ws.odoo_webinar_id,
  ws.computed_state,
  ws.wp_snapshot->>'id' AS wp_event_id
FROM webinar_snapshots ws
WHERE ws.wp_snapshot IS NOT NULL
  AND ws.computed_state NOT IN ('deleted', 'archived')
ORDER BY ws.created_at;
```

**Actie:** Cross-reference met WordPress events. Verwijder orphans:
```sql
DELETE FROM webinar_snapshots 
WHERE id IN ('affected-uuid-1', 'affected-uuid-2');
```

### 5.3 Duplicate Snapshots

**Query: Meerdere snapshots voor dezelfde user+webinar combinatie.**

```sql
SELECT 
  user_id, 
  odoo_webinar_id, 
  COUNT(*) as count
FROM webinar_snapshots
GROUP BY user_id, odoo_webinar_id
HAVING COUNT(*) > 1;
```

**Verwacht:** 0 rijen (unique idx zou dit moeten voorkomen).

**Als duplicaten bestaan:**
```sql
-- Behoud nieuwste, verwijder rest
DELETE FROM webinar_snapshots ws1
USING webinar_snapshots ws2
WHERE ws1.user_id = ws2.user_id
  AND ws1.odoo_webinar_id = ws2.odoo_webinar_id
  AND ws1.created_at < ws2.created_at;
```

### 5.4 State Consistency Check

**Query: Overzicht van state verdeling per user.**

```sql
SELECT 
  u.email,
  ws.computed_state,
  COUNT(*) as count,
  MAX(ws.updated_at) as last_update
FROM webinar_snapshots ws
JOIN users u ON u.id = ws.user_id
GROUP BY u.email, ws.computed_state
ORDER BY u.email, ws.computed_state;
```

### 5.5 Odoo vs Snapshot Mismatch

**Detectie:** Vergelijk Odoo live data met opgeslagen snapshot.

Geen directe SQL query mogelijk (Odoo is extern). Gebruik de applicatie:

```javascript
// Via browser console (na login)
// Stap 1: Haal live Odoo data
const odooResp = await fetch('/events/api/odoo-webinars', { credentials: 'include' });
const odooData = await odooResp.json();

// Stap 2: Haal snapshots
const snapResp = await fetch('/events/api/snapshots', { credentials: 'include' });
const snapData = await snapResp.json();

// Stap 3: Vergelijk
const odooIds = new Set(odooData.data.map(w => w.id));
const snapIds = new Set(snapData.data.map(s => s.odoo_webinar_id));

// Webinars in Odoo maar niet in snapshots
const missing = [...odooIds].filter(id => !snapIds.has(id));
console.log('Missing from snapshots:', missing);

// Snapshots zonder Odoo webinar (verwijderd?)
const orphaned = [...snapIds].filter(id => !odooIds.has(id));
console.log('Orphaned snapshots:', orphaned);
```

---

## 6. Git Recovery

### 6.1 Fase Terugdraaien (Soft)

**Wanneer:** Laatste fase moet ongedaan worden, maar behoud history.

```bash
# Revert laatste commit (maakt een nieuwe revert commit)
git revert HEAD
```

### 6.2 Fase Terugdraaien (Hard)

**Wanneer:** Laatste fase moet volledig weg.

```bash
# ⚠️ DESTRUCTIEF: Verwijdert commit uit history
git reset --hard HEAD~1
```

### 6.3 Naar Specifieke Stoppoint

**Wanneer:** Terug naar een specifieke fase.

```bash
# Zoek commit hash
git log --oneline

# Reset naar die commit
# ⚠️ DESTRUCTIEF: Alles na die commit verdwijnt
git reset --hard COMMIT_HASH
```

### 6.4 Specifiek Bestand Herstellen

**Wanneer:** Eén bestand moet terug naar vorige versie.

```bash
# Herstel naar vorige commit
git checkout HEAD~1 -- path/to/file.js

# Of naar specifieke commit
git checkout COMMIT_HASH -- path/to/file.js
```

### 6.5 Branch Recovery

**Wanneer:** Branch is corrupt, start opnieuw.

```bash
# Maak backup branch
git branch events-operations-backup

# Reset naar pre-implementatie (laatste analyse commit)
git reset --hard 3555180
```

---

## 7. Noodprocedure: Complete Rollback

### Wanneer
Alles is fout, module moet volledig weg, terug naar pre-implementatie staat.

### Stappen

**Stap 1: Supabase opruimen**
```sql
-- Verwijder data
DELETE FROM webinar_snapshots;

-- Verwijder user_modules koppelingen
DELETE FROM user_modules 
WHERE module_id = (SELECT id FROM modules WHERE code = 'event_operations');

-- Verwijder module registratie
DELETE FROM modules WHERE code = 'event_operations';

-- Verwijder tabel
DROP TABLE IF EXISTS webinar_snapshots CASCADE;

-- Verwijder migration record
DELETE FROM supabase_migrations.schema_migrations 
WHERE version = '20260211000000';
```

**Stap 2: WordPress opruimen**
```bash
# Verwijder alle events met odoo_webinar_id meta
# Handmatig via WP Admin, of script per event ID
```

**Stap 3: Code terugdraaien**
```bash
# Terug naar laatste analyse commit
git reset --hard 3555180

# Of revert alle implementatie commits
git revert HEAD~N..HEAD  # N = aantal implementatie commits
```

**Stap 4: Deploy clean Worker**
```bash
npx wrangler deploy
```

**Stap 5: Verificatie**
```sql
-- Geen Event Operations resten
SELECT COUNT(*) FROM modules WHERE code = 'event_operations';  -- 0
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webinar_snapshots');  -- false
```

```bash
# Worker draait zonder event-operations routes
curl -s http://localhost:8787/events  # 404
```

---

**Document Status:** ✅ Compleet  
**Scope:** Recovery procedures alleen, geen implementatie  
**Architectuur wijzigingen:** Geen
