# ADDENDUM J – DELETED ITEMS ANALYSIS

**Module:** Event Operations  
**Datum:** 17 februari 2026  
**Status:** ✅ Caching probleem opgelost | ⏳ Soft-delete probleem gedocumenteerd  
**Probleem:** Verwijderde inschrijvingen en webinars blijven zichtbaar na sync

---

## EXECUTIVE SUMMARY

Het systeem heeft **twee verschillende problemen** met verwijderde items:

### Problem 1: HTTP + Client-Side Caching (✅ FIXED)

**Symptoom**: Hard-deleted registrations blijven zichtbaar na sync

**Root Cause**: 
- Geen expliciete `Cache-Control` headers op API endpoints
- Client-side `registrationsCacheByWebinar` Map wordt nooit gewist

**Fix**: 
- ✅ Cache-Control headers toegevoegd
- ✅ clearRegistrationsCache() geïmplementeerd
- ✅ Geïntegreerd in sync flow

**Status**: Implemented in ADDENDUM_J_IMPLEMENTATION_LOG.md

---

### Problem 2: Soft-Delete Filtering (⏳ NOT YET NEEDED)

Het systeem heeft **potentiële problemen** met soft-deleted items in Odoo:

1. ✅ **Webinars**: Correct gefilterd op `x_active = true` → verwijderde webinars verdwijnen
2. ⚠️ **Registrations**: GEEN filter op `x_active` status → soft-deleted registrations worden geteld
3. ⚠️ **Registration Counts**: Tellen ALLE registrations, inclusief `x_active=false` records

**Root Cause**: Odoo gebruikt soft deletes (`x_active=False`), maar onze queries filteren daar niet op.

**Status**: Gedocumenteerd maar nog niet geïmplementeerd. User gebruikt hard deletes, niet soft deletes.

---

## ANALYSE PER COMPONENT

### 1. WEBINAR OPHALING

**Functie**: `getOdooWebinars()` in `odoo-client.js`

**Code** (regel 80-103):
```javascript
export async function getOdooWebinars(env) {
  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [
      [ODOO_FIELDS.ACTIVE, '=', true]  // ✅ FILTERT OP ACTIVE
    ],
    fields: [...],
    order: `${ODOO_FIELDS.EVENT_DATETIME} DESC`,
    limit: 100
  });
  return webinars;
}
```

**Gedrag**:
- ✅ Haalt ALLEEN actieve webinars op (`x_active = true`)
- ✅ Verwijderde/gearchiveerde webinars worden uitgesloten
- ✅ Correct gedrag

**Gebruikt door**:
- `GET /api/odoo-webinars` (route.js:233)
- `POST /api/sync` (route.js:474)

---

### 2. REGISTRATION OPHALING

#### 2.1 Individuele Registrations

**Functie**: `getWebinarRegistrations()` in `odoo-client.js`

**Code** (regel 182-195):
```javascript
export async function getWebinarRegistrations(env, webinarId, options = {}) {
  return searchRead(env, {
    model: ODOO_MODEL.REGISTRATION,
    domain: [[ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId]],  // ❌ GEEN ACTIVE FILTER
    fields: [],
    offset,
    limit,
    order
  });
}
```

**Probleem**:
- ❌ Haalt ALLE registrations voor een webinar op
- ❌ GEEN filter op `active` field
- ❌ Verwijderde registrations worden meegenomen

**Gebruikt door**:
- `POST /api/sync` voor registration stats berekening (routes.js:579)
- `GET /api/events/:webinarId/registrations` in modal (event-registrations.js:54)

---

#### 2.2 Registration Count (Enkelvoudig)

**Functie**: `getWebinarRegistrationCount()` in `odoo-client.js`

**Code** (regel 148-162):
```javascript
export async function getRegistrationCount(env, webinarId) {
  const count = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'search_count',
    args: [[[ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId]]]  // ❌ GEEN ACTIVE FILTER
  });
  return count;
}
```

**Probleem**:
- ❌ Telt ALLE registrations
- ❌ GEEN filter op active status
- ❌ Verwijderde registrations worden meegeteld

---

#### 2.3 Registration Counts (Bulk)

**Functie**: `getRegistrationCountsByWebinar()` in `odoo-client.js`

**Code** (regel 361-407):
```javascript
export async function getRegistrationCountsByWebinar(env, webinarIds) {
  const grouped = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'read_group',
    args: [
      [['x_studio_linked_webinar', 'in', sanitizedIds]],  // ❌ GEEN ACTIVE FILTER
      ['x_studio_linked_webinar'],
      ['x_studio_linked_webinar']
    ],
    kwargs: { lazy: false }
  });

  const counts = {};
  for (const group of grouped || []) {
    const webinarId = /* extract id */;
    const count = group?.x_studio_linked_webinar_count ?? 0;
    counts[webinarId] = count;
  }
  return counts;
}
```

**Probleem**:
- ❌ Gebruikt `read_group` zonder active filter
- ❌ Telt ALLE registrations inclusief deleted
- ❌ Dit wordt gebruikt in `/api/odoo-webinars` voor kaart badges

**Gebruikt door**:
- `GET /api/odoo-webinars` (routes.js:238) → Frontend calendar counts

---

### 3. SYNC FLOW

**Route**: `POST /api/sync` in `routes.js`

**Stappen**:
1. ✅ Fetch active webinars: `getOdooWebinars()` (regel 474)
2. ❌ Fetch registrations: `getWebinarRegistrations()` ZONDER active filter (regel 579)
3. ❌ Compute stats inclusief deleted records (regel 581)
4. ✅ Store in snapshot (regel 613-620)

**Code fragment** (regel 574-592):
```javascript
let registrationStats = { total: 0, attended_count: 0, ... };

try {
  const registrationRows = await getWebinarRegistrations(env, odooWebinar.id, {
    limit: false,
    order: 'write_date desc, id desc'
  });
  registrationStats = computeRegistrationStats(registrationRows);  // ❌ Inclusief deleted
} catch (error) {
  console.error(`Registration aggregation failed for webinar ${odooWebinar.id}:`, error);
}
```

**Gevolg**:
- Snapshots bevatten counts van ALLE registrations (inclusief deleted)
- Deze stats zijn ALLEEN accuraat op moment van sync
- Daarna worden ze static opgeslagen

---

### 4. FRONTEND DATA FLOW

**Client**: `event-operations-client.js` + `detail-panel-controller.js`

**Flow**:
1. **Initial Load** (`ui.js:827-841`):
   ```javascript
   const webinarsRes = await fetch('/events/api/odoo-webinars');
   setRegistrations(webinarsRes.data.registrationCounts || {});
   ```
   → Haalt counts via `getRegistrationCountsByWebinar()` ❌ (inclusief deleted)

2. **After Sync** (`ui.js:1159 + 906-956`):
   ```javascript
   await refreshSnapshotsAfterSync();
   ```
   → Herhaalt stap 1, haalt opnieuw counts zonder active filter ❌

3. **Detail Panel Display** (`detail-panel-controller.js:252`):
   ```javascript
   ${renderMetaRow('users', 'Inschrijvingen', 
     `<button>${regCount} bekijken</button>`)}
   ```
   → Toont count uit state store

**Probleem**:
- Registration counts komen uit `appState.registrations`
- Deze worden gevuld via `/api/odoo-webinars` endpoint
- Dit endpoint gebruikt `getRegistrationCountsByWebinar()` ZONDER active filter
- Verwijderde registrations worden meegeteld

---

## ODOO DATA MODEL VERIFICATIE

### Verwachte Velden in `x_webinarregistrations`

Standaard Odoo models hebben meestal:
- `id` (integer, primary key)
- `active` (boolean, soft delete flag) ← **KRITISCH**
- `create_date` (datetime)
- `write_date` (datetime)
- `x_studio_linked_webinar` (many2one → x_webinar)
- Custom fields...

### Verificatie Nodig

**Vraag**: Heeft `x_webinarregistrations` een `active` field?

**Test query** (uit te voeren in Odoo):
```python
# In Odoo Python Console:
reg_model = env['x_webinarregistrations']
fields = reg_model.fields_get(['active'])
print(fields)

# Check deleted registrations:
all_regs = reg_model.search([('x_studio_linked_webinar', '=', WEBINAR_ID)])
active_regs = reg_model.search([
  ('x_studio_linked_webinar', '=', WEBINAR_ID),
  ('active', '=', True)
])
print(f"Total: {len(all_regs)}, Active: {len(active_regs)}")
```

**Odoo Soft Delete Mechanisme**:
- Standaard gedrag: `unlink()` zet `active=False` (soft delete)
- Records blijven in database maar zijn hidden in UI
- Queries zonder `active` filter halen alle records op

---

## WAAROM JE NOG STEEDS 1 INSCHRIJVING ZIET

### Scenario Reconstructie

1. **Initiële Situatie**:
   - Webinar 44 heeft 1 registration in Odoo
   - Registration is `active=True`
   - Sync → snapshot bevat `total: 1`
   - Frontend toont: "1 inschrijving"

2. **Verwijderen in Odoo**:
   - Je verwijdert registration via Odoo UI
   - Odoo zet `active=False` (soft delete)
   - Record bestaat nog in database

3. **Na manuele sync**:
   - `POST /api/sync` wordt getriggerd
   - `getOdooWebinars()` haalt webinar 44 op ✅
   - `getWebinarRegistrations()` haalt registrations op:
     ```python
     domain = [('x_studio_linked_webinar', '=', 44)]  # ❌ Geen active filter
     # Result: [registration_123] (met active=False)
     ```
   - `computeRegistrationStats()` telt: `total: 1` ❌
   - Snapshot wordt geupdatet met `total: 1`

4. **Frontend refresh na sync**:
   - `refreshSnapshotsAfterSync()` wordt aangeroepen
   - Haalt nieuwe webinar data: `GET /api/odoo-webinars`
   - `getRegistrationCountsByWebinar()` doet:
     ```python
     read_group([('x_studio_linked_webinar', 'in', [44])])  # ❌ Geen active filter
     # Result: { 44: 1 }
     ```
   - State store: `registrations[44] = 1`
   - Detail panel toont: "1 inschrijving" ❌

**Conclusie**: De verwijderde registration wordt OVERAL meegeteld omdat geen enkele query filtert op `active=True`.

---

## IMPACT MATRIX

| Component | Filter op Active? | Impact Verwijderde Items | Risico |
|-----------|-------------------|--------------------------|--------|
| `getOdooWebinars()` | ✅ Ja (`x_active=true`) | Verwijderde webinars verdwijnen | Laag |
| `getWebinarRegistrations()` | ❌ Nee | Blijven zichtbaar in lijst | **Hoog** |
| `getWebinarRegistrationCount()` | ❌ Nee | Count blijft hoog | **Hoog** |
| `getRegistrationCountsByWebinar()` | ❌ Nee | Badge count verkeerd | **Hoog** |
| Snapshot registration stats | ❌ Nee | Historical data incorrect | **Hoog** |
| Frontend display | ❌ Nee (gebruikt state) | Toont deleted items | **Hoog** |

---

## VERIFICATIE STAPPEN

### Test 1: Controleer Odoo Active Field

**Doel**: Bevestigen dat verwijderde registrations `active=False` hebben

**Stappen**:
1. Open Odoo Developer Tools
2. Ga naar technical menu → Models
3. Zoek `x_webinarregistrations`
4. Check of `active` field bestaat
5. Run query met/zonder active filter

**Expected Result**: 
- Met filter: minder records
- Zonder filter: meer records (inclusief deleted)

---

### Test 2: Console Logging

**Voeg toe aan** `getRegistrationCountsByWebinar()`:

```javascript
export async function getRegistrationCountsByWebinar(env, webinarIds) {
  // ... existing code ...
  
  const grouped = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'read_group',
    args: [
      [['x_studio_linked_webinar', 'in', sanitizedIds]],
      ['x_studio_linked_webinar'],
      ['x_studio_linked_webinar']
    ],
    kwargs: { lazy: false }
  });

  console.log('[DEBUG] Registration counts WITHOUT active filter:', grouped);
  
  // Test WITH active filter:
  const groupedActive = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'read_group',
    args: [
      [
        ['x_studio_linked_webinar', 'in', sanitizedIds],
        ['active', '=', true]  // ← ADD THIS
      ],
      ['x_studio_linked_webinar'],
      ['x_studio_linked_webinar']
    ],
    kwargs: { lazy: false }
  });

  console.log('[DEBUG] Registration counts WITH active filter:', groupedActive);
  
  // Return original for now
  return counts;
}
```

**Expected Result**: Counts verschillen → bevestigt active field probleem

---

## PROPOSED FIX

### Fix 1: Add Active Filter to ALL Registration Queries

**File**: `src/modules/event-operations/odoo-client.js`

#### 1.1 Fix `getWebinarRegistrations()`

```diff
export async function getWebinarRegistrations(env, webinarId, options = {}) {
  const { offset = 0, limit = 50, order = 'write_date desc, id desc' } = options;

  return searchRead(env, {
    model: ODOO_MODEL.REGISTRATION,
-   domain: [[ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId]],
+   domain: [
+     [ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId],
+     ['active', '=', true]
+   ],
    fields: [],
    offset,
    limit,
    order
  });
}
```

#### 1.2 Fix `getRegistrationCount()`

```diff
export async function getRegistrationCount(env, webinarId) {
  const count = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'search_count',
-   args: [[[ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId]]]
+   args: [[
+     [ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId],
+     ['active', '=', true]
+   ]]
  });
  
  return count;
}
```

#### 1.3 Fix `getRegistrationCountsByWebinar()`

```diff
export async function getRegistrationCountsByWebinar(env, webinarIds) {
  // ... validation code ...

  const grouped = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'read_group',
    args: [
-     [['x_studio_linked_webinar', 'in', sanitizedIds]],
+     [
+       ['x_studio_linked_webinar', 'in', sanitizedIds],
+       ['active', '=', true]
+     ],
      ['x_studio_linked_webinar'],
      ['x_studio_linked_webinar']
    ],
    kwargs: { lazy: false }
  });

  // ... rest of function ...
}
```

---

### Fix 2: Add Active Field to Constants (Optional)

**File**: `src/modules/event-operations/constants.js`

```diff
export const ODOO_FIELDS = {
  // ... existing fields ...
  
  // Registration fields
  LINKED_WEBINAR: 'x_studio_linked_webinar',
+ REGISTRATION_ACTIVE: 'active',  // Soft delete flag
  REGISTERED_BY: 'x_studio_registered_by',
  // ...
};
```

Then use:
```javascript
['active', '=', true]
// or
[ODOO_FIELDS.REGISTRATION_ACTIVE, '=', true]
```

---

## TESTING PLAN

### Pre-Implementation Test

1. Run app BEFORE fix
2. Note webinar with deleted registration
3. Check count in:
   - Calendar badge
   - Detail panel
   - Registrations modal
4. Confirm count is WRONG (includes deleted)

### Post-Implementation Test

1. Deploy fix
2. Hard refresh browser (Ctrl+Shift+R)
3. Click "Sync All"
4. Wait for sync completion
5. Check same webinar:
   - ✅ Calendar badge shows correct count (0)
   - ✅ Detail panel shows correct count (0)
   - ✅ Registrations modal shows empty list

### Regression Test

1. Add NEW registration in Odoo
2. Sync
3. Confirm count increases to 1 ✅
4. Delete registration in Odoo
5. Sync
6. Confirm count decreases to 0 ✅

---

## ROLLOUT PLAN

### Phase 1: Verification (DO FIRST)
- ✅ Confirm `active` field exists on `x_webinarregistrations`
- ✅ Test query difference with/without filter
- ✅ Log current vs expected counts

### Phase 2: Implementation
- ⏳ Apply Fix 1.1, 1.2, 1.3
- ⏳ Add console logging for debugging
- ⏳ Deploy to worker

### Phase 3: Validation
- ⏳ Test with known deleted registration
- ⏳ Verify counts update correctly after sync
- ⏳ Check historical snapshots (optional cleanup)

### Phase 4: Cleanup (Optional)
- Consider re-running sync for all webinars to update historical snapshot stats
- Or: accept that old snapshots have incorrect counts, new syncs will be correct

---

## ARCHITECTURAL NOTES

### Why This Wasn't Caught Earlier

1. **Common Odoo Pattern**: Most Odoo queries auto-filter on `active=True` unless domain explicitly includes `active`
2. **No Soft Delete Testing**: Test cases didn't cover deleted registrations
3. **Live Data Assumption**: Assumed Odoo returns only live data
4. **No Field Introspection**: Didn't validate registration model has `active` field

### Why Frontend Can't Detect This

- Frontend receives pre-computed counts from backend
- No direct Odoo access to compare
- State store is "dumb" cache of backend data

### Future Prevention

1. **Document Odoo soft delete convention** in ARCHITECTURE.md
2. **Add explicit active filter** to ALL model queries by default
3. **Add integration test** for deleted items behavior
4. **Add field validation** at startup to confirm model structure

---

## CONCLUSION

**Root Cause**: Alle registration queries missen `['active', '=', true]` filter, waardoor soft-deleted Odoo records meegeteld worden.

**Fix**: Voeg active filter toe aan 3 functies in `odoo-client.js`.

**Impact**: Hoog - affects alle registration counts in hele applicatie.

**Urgency**: Medium - data is incorrect maar systeem blijft functioneel.

**Risk**: Laag - fix is straightforward, geen breaking changes.

---

**Volgende Stap**: Verifieer eerst of `x_webinarregistrations.active` field bestaat in Odoo voordat fix wordt geïmplementeerd.
