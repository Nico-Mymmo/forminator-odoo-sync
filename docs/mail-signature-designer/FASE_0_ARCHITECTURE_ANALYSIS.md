# Mail Signature Designer – Fase 0: Architectuuranalyse

**Status:** Fase 0 compleet + Architecturale keuzes bevestigd
**Doel:** Volledig begrip opdoen van hoe modules werken in deze codebase + expliciete architecturale keuzes voor `mail_signature_designer` vastleggen.

---

## 1. Module Registratie

### Hoe het werkt

Modules worden geregistreerd op twee plekken:

**A. JavaScript registry** – `src/modules/registry.js`

Elke module is een plain JS-object met deze vaste shape:

```js
export default {
  code: 'event_operations',        // unieke identifier
  name: 'Event Operations',         // weergavenaam
  description: '...',               // beschrijving
  route: '/events',                  // basisroute
  icon: 'calendar',                  // lucide icon naam
  isActive: true,                    // globaal zichtbaar
  routes: { ... }                    // HTTP route handlers
}
```

Dit object wordt geïmporteerd in `registry.js` en toegevoegd aan de `MODULES` array. Routing, toegangscontrole en navigatie werken allemaal op basis van deze array.

**B. Supabase modules tabel** – via migratiescript

Elke module krijgt een rij in de `modules` tabel via een `INSERT ... ON CONFLICT DO NOTHING`. Dit is nodig voor het user access systeem. Het patroon per migratie:

```sql
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES ('event_operations', 'Event Operations', '...', '/events', 'calendar', true, false, 5)
ON CONFLICT (code) DO NOTHING;
```

Daarna volgt auto-grant aan admin:

```sql
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u CROSS JOIN modules m
WHERE u.role = 'admin' AND m.code = 'event_operations'
AND NOT EXISTS (SELECT 1 FROM user_modules um WHERE um.user_id = u.id AND um.module_id = m.id);
```

---

## 2. Routing

`src/index.js` (`fetch` handler) doet het volgende bij een request:

1. Publieke routes (login, favicon, test-db) — geen auth vereist
2. `getModuleByRoute(pathname)` zoekt een match in de `MODULES` array (langste route eerst)
3. Session token extractie uit `Authorization` header of `session` cookie
4. `validateSession(env, token)` → user object of null
5. Redirects als geen sessie maar module vereist auth
6. Check op `module.requiresAdmin` voor admin-only modules
7. Check op `getUserModules(user)` voor toegang non-admin users
8. `resolveModuleRoute(module, method, pathname)` → zoek exact, dan parameter-pattern, dan wildcard
9. Handler aanroepen met `context = { request, env, ctx, user, params }`

Reguliere API sub-routes binnen een module slaan `module.route` af en matchen op de sub-path. Bijv. voor `/events/api/sync` wordt het subpad `/api/sync` gematcht binnen `event_operations.routes`.

---

## 3. Toegangscontrole

Drie niveaus:

| Niveau | Mechansime |
|---|---|
| Niet ingelogd | Redirect naar `/` |
| Admin | Toegang tot alle modules, geen check op `user_modules` |
| Gewone gebruiker | Module moet in `user_modules` staan met `is_enabled = true` |

De `user_modules` junction tabel koppelt een user aan een module. De `getUserModules(user)` functie filtert actieve koppelingen en geeft de bijbehorende module-objecten terug. De navigatie rendered enkel de modules waarop de user toegang heeft.

---

## 4. UI Opbouw

### Layout patroon

Twee varianten in het project:

**A. Via `layoutHTML()` component** – `src/lib/components/layout.js`

```js
layoutHTML({ user, activeRoute, title, content, styles, scripts })
```

Wrapt content in volledige HTML-pagina met:
- DaisyUI CDN
- Tailwind CDN
- Lucide icons
- `navigationHTML(user, activeRoute)` bovenaan
- `<div class="pt-16 min-h-screen">` voor content

**B. Eigen full-page HTML string** (event-operations patroon)

`eventOperationsUI(user)` returnt een volledige `<!DOCTYPE html>`-string als template literal. Dit is handig wanneer de module extra CDN-dependencies vereist (FullCalendar, Quill.js etc.).

### Navigatie

`navigationHTML()` in `src/lib/components/navigation.js`:
- Toont `user.modules` als DaisyUI tabs bovenaan
- Admin krijgt automatisch een extra "Admin" tab
- Actieve tab bepaald via `activeRoute.startsWith(module.route)`
- Lucide icon + naam per tab

### UI Framework

- **DaisyUI 4.12.14** – component library bovenop Tailwind
- **Tailwind CSS** – via CDN
- **Lucide** – icon set via `data-lucide` attributen
- Alle JS is inline of via `public/` folder (client-side scripts)

---

## 5. Database Migraties

### Naamgeving

`supabase/migrations/YYYYMMDDHHMMSS_beschrijving.sql`

### Structuur per migratiebestand

1. Header commentaar: beschrijving, datum, patroon
2. Tabel aanmaken met `CREATE TABLE`
3. Commentaar per tabel en kolom
4. Indexen aanmaken (geen foreign keys – baseline patroon)
5. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
6. RLS policies (`TO public`-patroon, niet `TO authenticated`)
7. Trigger voor `updated_at` via `update_updated_at()` function
8. Module registratie INSERT
9. Auto-grant admin INSERT
10. Footer compliance notes

### Baseline constraints

- Geen foreign keys (baseline patroon voor maximale flexibiliteit)
- RLS policies gebruiken expliciete permissive policies `TO public` (niet `TO authenticated`)
- User-scoped tabellen: isolatie via `auth.uid() = user_id`
- Globale tabellen (geen user scope): permissive `USING (true) WITH CHECK (true)` — toegangscontrole via module-auth laag in `src/index.js`
- JSONB voor flexibele config-data (zoals `blueprint_data`, `odoo_snapshot`)

---

## 6. Module Bestands- en Mapstructuur

### Standaard patroon (event-operations)

```
src/modules/event-operations/
├── module.js           → code, name, route, icon, isActive, routes{}
├── routes.js           → alle HTTP route handlers (GET/POST/PUT/DELETE)
├── ui.js               → HTML render functies
├── constants.js        → vaste waarden, enums
├── mapping.js          → data transformatie helpers
├── state-engine.js     → business logic
├── odoo-client.js      → externe API client (Odoo)
├── wp-client.js        → externe API client (WordPress)
├── tag-mapping.js      → specifieke business logic
├── editorial.js        → specifieke business logic
├── lib/
│   └── supabaseClient.js
├── routes/
│   └── event-registrations.js
├── services/
└── utils/
```

### Minimale variant (project-generator)

```
src/modules/project-generator/
├── module.js           → module metadata + routes inline
├── ui.js               → HTML render functies
├── library.js          → data access (Supabase)
├── generate.js         → business logic
├── validation.js       → input validatie
├── permissions.js      → toegangscontrole helpers
├── generation-lifecycle.js
└── odoo-creator.js
```

---

## 7. Documentatiepatroon

### Per module in `docs/[module-naam]/`

Bestanden:
- `README.md` – overzicht, locaties, status
- `[MODULE]_COMPLETE.md` – finale referentie na oplevering
- `ADDENDUM_A_*.md` t/m `ADDENDUM_N_*.md` – iteratieve uitbreidingen
- `[MODULE]_IMPLEMENTATION_LOG.md` – wat is gedaan, wanneer, waarom
- `iterations/` – logboek per iteratie
- `forensics/` – debugging analyses
- `analysis/` – functionele analyses

### Stijlconventies

- Nederlands of Engels, consistent per module
- Status badge bovenaan (In setup / Production-Ready / etc.)
- Executive summary, Scope, Architecture, Schema, API endpoints, Acceptance Criteria
- Addenda volgen alphanumeriek, per uitbreiding één bestand

---

## 8. Conclusie voor Fase 1

De `mail_signature_designer` module volgt exact het **event-operations patroon**:

| Onderdeel | Actie |
|---|---|
| `src/modules/mail-signature-designer/module.js` | code, route `/mail-signatures`, icon `mail`, routes{} |
| `src/modules/mail-signature-designer/routes.js` | alle HTTP handlers gesplit uit module.js |
| `src/modules/mail-signature-designer/ui.js` | full-page HTML (eigen template, niet layoutHTML) |
| `src/modules/mail-signature-designer/lib/` | signature-compiler.js, directory-client.js, gmail-signature-client.js, signature-store.js |
| `src/modules/registry.js` | import + toevoegen aan MODULES array |
| `supabase/migrations/20260220000000_mail_signature_designer_v1.sql` | tabellen, module insert, admin grant |
| `docs/mail-signature-designer/` | README, MVP doc, prerequisites, test |

---

## 9. Architecturale Keuzes (Mail Signature Designer)

### 9.1 UI Layout

**Keuze: full-page HTML template, zoals event-operations.**

`mailSignatureDesignerUI(user)` returnt een volledige `<!DOCTYPE html>` als template literal in `ui.js`. Geen `layoutHTML()`. De module heeft tabbed UI (Builder / Push / Logs) met iframe preview — dit past niet in de generieke layout-wrapper zonder conflict. Identiek patroon als `eventOperationsUI(user)`.

---

### 9.2 Supabase Admin Client

Hergebruik exact het patroon van event-operations:

```js
// src/modules/mail-signature-designer/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdminClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
```

`env` wordt altijd meegegeven via de route `context`. Geen singleton, geen module-level state (Cloudflare Workers zijn stateless per request).

---

### 9.3 Compile Engine

In `src/modules/mail-signature-designer/lib/signature-compiler.js`.

Verantwoording: pure business logic zonder HTTP-context — geen `request`, geen `env`, geen Supabase. Zit in `lib/` zodat zowel `routes.js` als andere lib-bestanden er direct uit kunnen importeren.

---

### 9.4 Singleton Garantie signature_config

**Beide:** database constraint + soft-enforced in code.

Database constraint via partial unique index:

```sql
CREATE UNIQUE INDEX signature_config_singleton ON signature_config ((true));
```

Dit garandeert technisch maximaal één rij. `signature-store.js` gebruikt altijd een upsert:

```js
// INSERT op conflict UPDATE
await supabase.from('signature_config').upsert({ ...config }, { onConflict: 'id' });
```

Geen tweede rij ooit mogelijk — constraint op DB niveau én upsert-gedrag in code.

---

### 9.5 RLS Policy Model

`signature_config` en `signature_push_log` zijn **globale tabellen** (geen `user_id`). Expliciete permissive policies `TO public`, identiek aan het event-operations baseline patroon:

```sql
ALTER TABLE signature_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on signature_config"
  ON signature_config FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

ALTER TABLE signature_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on signature_push_log"
  ON signature_push_log FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
```

Toegangscontrole wordt geënforced door de module-auth laag in `src/index.js`, niet door RLS op rijniveau.

---

*Fase 0 + architecturale keuzes volledig gedocumenteerd. Bevestigd. Gereed voor implementatie.*
