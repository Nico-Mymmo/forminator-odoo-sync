# Event Operations - Architectuur Analyse

**Module:** Event Operations  
**Fase:** MVP Analyse & Implementatie  
**Datum:** 11 februari 2026  
**Status:** Analyse Complete - Ready for Implementation Proposal

---

## 🎯 Document Doel

Dit document analyseert **hoe de bestaande applicatie werkt** om Event Operations correct te integreren. Dit is **geen ontwerp** van een nieuwe architectuur, maar een **forensisch onderzoek** van bestaande patronen die gevolgd moeten worden.

**Principe:**
> Event Operations is een uitbreiding van een bestaand systeem, geen greenfield project.  
> Elke keuze moet gebaseerd zijn op bestaande code, niet op aannames.

---

## 📦 1. Bestaande Module Architectuur Analyse

### 1.1 Module Registry Patroon

**Locatie:** [src/modules/registry.js](../../src/modules/registry.js)

**Patroon:**
```javascript
// Alle modules worden geïmporteerd in registry.js
import homeModule from './home/module.js';
import forminatorSyncModule from './forminator-sync/module.js';
import projectGeneratorModule from './project-generator/module.js';
import adminModule from './admin/module.js';
import profileModule from './profile/module.js';
import salesInsightExplorerModule from './sales-insight-explorer/module.js';

export const MODULES = [
  homeModule,
  forminatorSyncModule,
  projectGeneratorModule,
  adminModule,
  profileModule,
  salesInsightExplorerModule
];
```

**Bevindingen:**
- ✅ Modules worden centraal geregistreerd in array
- ✅ Elke module exporteert een default object met metadata + routes
- ✅ Registry heeft helper functies: `getModuleByRoute()`, `getModuleByCode()`, `getUserModules()`
- ✅ Route resolution ondersteunt wildcards en parameter routes (`:id`)

**Voor Event Operations:**
```javascript
// ✅ Event Operations moet toegevoegd worden aan registry.js
import eventOperationsModule from './event-operations/module.js';

export const MODULES = [
  // ... bestaande modules
  eventOperationsModule  // Toevoegen aan array
];
```

---

### 1.2 Module Object Structuur

**Patroon Analyse:**

Alle modules volgen exact dezelfde structuur. Vergelijking van drie modules:

#### Home Module ([src/modules/home/module.js](../../src/modules/home/module.js))
```javascript
export default {
  code: 'home',
  name: 'Home',
  description: 'Module dashboard',
  route: '/',
  icon: 'home',
  isActive: true,
  requiresAdmin: false,
  routes: {
    'GET /': async (context) => { /* ... */ }
  }
};
```

#### Project Generator ([src/modules/project-generator/module.js](../../src/modules/project-generator/module.js))
```javascript
export default {
  code: 'project_generator',
  name: 'Project Generator',
  description: 'Manage project templates',
  route: '/projects',
  icon: 'folder-plus',
  isActive: true,
  routes: {
    'GET /': async (context) => { /* UI */ },
    'GET /api/templates': async (context) => { /* ... */ },
    'POST /api/templates': async (context) => { /* ... */ },
    'DELETE /api/templates/:id': async (context) => { /* ... */ }
  }
};
```

#### Sales Insight Explorer ([src/modules/sales-insight-explorer/module.js](../../src/modules/sales-insight-explorer/module.js))
```javascript
import { routes } from './routes.js';

export default {
  code: 'sales_insight_explorer',
  name: 'Sales Insight Explorer',
  description: 'Schema-driven query builder for Odoo data',
  route: '/insights',
  icon: 'database',
  isActive: true,
  routes  // Routes geïmporteerd uit apart bestand
};
```

**Bevindingen:**
- ✅ **Verplichte velden:** `code`, `name`, `description`, `route`, `icon`, `isActive`, `routes`
- ✅ **Optionele velden:** `requiresAdmin` (default: false), `requiresAuth` (default: true)
- ✅ **Code conventie:** snake_case (bijv. `project_generator`, `sales_insight_explorer`)
- ✅ **Route conventie:** kebab-case URL (bijv. `/projects`, `/insights`)
- ✅ **Routes kunnen:** inline object OF geïmporteerd uit `routes.js` (voor grote modules)

**Voor Event Operations:**
```javascript
export default {
  code: 'event_operations',              // ✅ snake_case
  name: 'Event Operations',              // ✅ Display name
  description: 'Manage Odoo event publication to WordPress',
  route: '/events',                      // ✅ kebab-case URL
  icon: 'calendar',                      // ✅ Lucide icon naam
  isActive: true,                        // ✅ Module enabled
  routes: {
    'GET /': async (context) => { /* UI */ },
    'GET /api/events': async (context) => { /* ... */ }
  }
};
```

---

### 1.3 Folder Structuur Patronen

**Analyse van bestaande modules:**

#### Pattern 1: Kleine Module (Home, Profile)
```
home/
  module.js
  ui.js
```

#### Pattern 2: Middelgrote Module (Forminator Sync, Admin)
```
forminator-sync/
  module.js
  routes.js    // API handlers apart
  ui.js        // UI apart
```

#### Pattern 3: Grote Module (Project Generator)
```
project-generator/
  module.js             // Entry point
  ui.js                 // UI rendering
  library.js            // Data access (templates)
  generate.js           // Core logic
  validation.js         // Validation
  permissions.js        // Permission checks
  generation-lifecycle.js
  odoo-creator.js
  color-constants.js
  editor.js
```

#### Pattern 4: Zeer Grote Module (Sales Insight Explorer)
```
sales-insight-explorer/
  module.js       // Entry point
  routes.js       // Route handlers
  ui.js           // UI rendering
  config/         // Configuration
  lib/            // Business logic
    schema-service.js
    query-validator.js
    query-executor.js
    preset-generator.js
    query-repository.js
    export/       // Export sub-module
  tests/          // Test suite
  examples/       // Example data
```

**Bevindingen:**
- ✅ **Kleine modules:** 2 bestanden (module.js + ui.js)
- ✅ **Middelgrote modules:** 3 bestanden (+ routes.js)
- ✅ **Grote modules:** Logische scheiding in meerdere bestanden
- ✅ **Zeer grote modules:** Sub-folders (lib/, config/, tests/)

**Voor Event Operations:**

Event Operations is **middelgroot**:
- Odoo events ophalen
- WordPress mapping
- Publicatie logica
- Discrepantie detectie
- Logging

**Aanbevolen structuur:**
```
event-operations/
  module.js           // Entry point + metadata
  routes.js           // API handlers
  ui.js               // UI rendering
  odoo-events.js      // Odoo event ophalen
  wordpress-sync.js   // WordPress publicatie
  discrepancy.js      // Discrepantie detectie
  logging.js          // Logging helpers (optioneel, kan ook console.log)
```

---

## 🛣️ 2. Routing & Request Flow Analyse

### 2.1 Worker Entry Point

**Locatie:** [src/index.js](../../src/index.js)

**Flow:**
```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 1. CORS preflight
    if (request.method === 'OPTIONS') { /* ... */ }
    
    // 2. Public endpoints (no auth)
    if (pathname === '/api/auth/login') { /* ... */ }
    if (pathname === '/api/auth/logout') { /* ... */ }
    
    // 3. Module routing
    const module = getModuleByRoute(pathname);
    if (module) {
      // Session extractie (cookie of Authorization header)
      let token = /* ... */;
      let user = await validateSession(env, token);
      
      // Auth check
      if (!user && module.requiresAuth !== false) {
        return Response.redirect('/', 302);
      }
      
      // Admin check
      if (module.requiresAdmin && user.role !== 'admin') {
        return 403 response;
      }
      
      // Module access check (via user_modules)
      if (!hasModuleAccess(user, module)) {
        return 403 response;
      }
      
      // Route resolution
      const result = resolveModuleRoute(module, request.method, pathname);
      if (result) {
        context.params = result.params;
        return await result.handler(context);
      }
    }
    
    // 4. Legacy routes (backwards compatibility)
    // ...
  }
}
```

**Bevindingen:**
- ✅ **Authenticatie:** Cookie (`session=`) OF `Authorization: Bearer <token>`
- ✅ **Session validatie:** `validateSession(env, token)` → user object
- ✅ **User object bevat:** `id`, `email`, `role`, `modules` array
- ✅ **Module access:** Via `user.modules` (Supabase `user_modules` table)
- ✅ **Context object:** `{ request, env, ctx, user, params }`

**Voor Event Operations:**
- ✅ Event Operations volgt exact hetzelfde auth patroon
- ✅ Geen custom auth layer bouwen
- ✅ Gebruik bestaande `validateSession()` via context.user

---

### 2.2 Route Handler Patroon

**Analyse van bestaande handlers:**

#### Voorbeeld 1: Simple GET (Project Generator - Get Templates)
```javascript
'GET /api/templates': async (context) => {
  const { env, user } = context;
  
  try {
    const templates = await getTemplates(env, user.id);
    
    return new Response(JSON.stringify({
      success: true,
      data: templates
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Project Generator] Get templates failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

#### Voorbeeld 2: POST with Request Body
```javascript
'POST /api/templates': async (context) => {
  const { request, env, user } = context;
  
  try {
    const data = await request.json();
    
    // Validation
    if (!data.name || !data.blueprint_data) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Business logic
    const template = await createTemplate(env, user.id, data);
    
    return new Response(JSON.stringify({
      success: true,
      data: template
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Project Generator] Create template failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

#### Voorbeeld 3: DELETE with URL Parameter
```javascript
'DELETE /api/templates/:id': async (context) => {
  const { params, env, user } = context;
  const templateId = params.id;
  
  try {
    await deleteTemplate(env, user.id, templateId);
    
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[Project Generator] Delete template failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

**Bevindingen:**
- ✅ **Response format:** `{ success: true/false, data?: any, error?: string }`
- ✅ **Error handling:** try/catch met console.error logging
- ✅ **Status codes:** 200 (success), 400 (bad request), 403 (forbidden), 500 (error)
- ✅ **Headers:** Altijd `'Content-Type': 'application/json'`
- ✅ **Logging pattern:** `console.error('[Module Name] Action failed:', error)`

**Voor Event Operations:**
- ✅ Volg exact hetzelfde response patroon
- ✅ Gebruik try/catch in elke handler
- ✅ Log errors met module prefix: `[Event Operations]`

---

## 🗄️ 3. Supabase Database Patroon Analyse

### 3.1 Migration Naming Conventie

**Locatie:** [supabase/migrations/](../../supabase/migrations/)

**Bestaande migraties:**
```
20260128130000_baseline_schema.sql
20260128140000_project_generator_v1.sql
20260128150000_project_generations_v1.sql
20260130000000_addendum_n_visibility.sql
```

**Bevindingen:**
- ✅ **Naming:** `YYYYMMDDHHMMSS_descriptive_name.sql`
- ✅ **Timestamp:** Year, month, day, hour, minute, second
- ✅ **Description:** snake_case, versioned (v1, v2)
- ✅ **Sequential:** Chronological order

**Voor Event Operations:**
```
20260211000000_event_operations_v1.sql
20260211010000_event_sync_logs_v1.sql  (if needed)
```

---

### 3.2 Table Creation Patroon

**Analyse:** [supabase/migrations/20260128140000_project_generator_v1.sql](../../supabase/migrations/20260128140000_project_generator_v1.sql)

```sql
-- ============================================================================
-- Project Generator V1 - Database Foundation
-- ============================================================================
-- Migration: Create project_templates table with RLS and module registration
-- Date: 2026-01-28
-- Purpose: Store project blueprint templates
-- Pattern: User-scoped isolation, NO foreign keys
-- ============================================================================

-- TABLE
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_templates IS 'User-owned project blueprint templates';
COMMENT ON COLUMN project_templates.blueprint_data IS 'JSONB structure: {taskStages, milestones, tasks}';

-- INDEX
CREATE INDEX idx_project_templates_user_id ON project_templates(user_id);

-- RLS POLICIES
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON project_templates FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON project_templates FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON project_templates FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON project_templates FOR DELETE
  TO public
  USING (auth.uid() = user_id);

-- TRIGGER: Auto-update updated_at
CREATE TRIGGER project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- MODULE REGISTRATION
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'project_generator',
  'Project Generator',
  'Template-based Odoo project creation',
  '/project-generator',
  'folder-kanban',
  true,
  false,
  4
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT TO ADMIN
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'project_generator'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um 
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
```

**Bevindingen:**
- ✅ **NO FOREIGN KEYS** op user_id (alleen index)
- ✅ **RLS policies:** User-scoped (`auth.uid() = user_id`)
- ✅ **RLS target:** `TO public` (niet `TO authenticated`)
- ✅ **Timestamps:** `created_at`, `updated_at` met trigger
- ✅ **Comments:** Op table en JSONB kolommen
- ✅ **Module registration:** In dezelfde migratie
- ✅ **Auto-grant admins:** Via INSERT SELECT met NOT EXISTS

**Kritieke regels (NIET afwijken):**
```sql
-- ❌ NOOIT foreign key constraints op user_id
ALTER TABLE table_name ADD CONSTRAINT fk_user 
  FOREIGN KEY (user_id) REFERENCES users(id);  -- VERBODEN

-- ✅ WEL index voor performance
CREATE INDEX idx_table_user_id ON table_name(user_id);

-- ✅ RLS pattern (exact volgen)
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own records"
  ON table_name FOR SELECT
  TO public
  USING (auth.uid() = user_id);
```

---

### 3.3 JSONB Storage Patroon

**Bevindingen:**

Modules gebruiken JSONB voor flexibele data:

1. **Project Generator:** `blueprint_data JSONB` (complete blueprint)
2. **Forminator Sync:** Gebruikt GEEN aparte table, data in KV store
3. **Sales Insight Explorer:** `query_definition JSONB` (query structure)

**Pattern:**
- ✅ JSONB voor complexe, geneste structuren
- ✅ Comment op kolom met structuur beschrijving
- ✅ Geen schema validatie (applicatie-laag verantwoordelijkheid)

**Voor Event Operations:**

Event Operations zal **snapshot data** moeten opslaan:
- Odoo event state (voor discrepantie detectie)
- WordPress publication state

**Aanbevolen:**
```sql
CREATE TABLE event_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  odoo_event_id INTEGER NOT NULL,
  odoo_snapshot JSONB NOT NULL,
  wordpress_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN event_snapshots.odoo_snapshot IS 'Odoo event.event record snapshot';
COMMENT ON COLUMN event_snapshots.wordpress_snapshot IS 'WordPress Tribe Events meta snapshot';
```

---

## 🔌 4. Odoo Integratie Analyse

### 4.1 Odoo.js Helper Library

**Locatie:** [src/lib/odoo.js](../../src/lib/odoo.js)

**Beschikbare functies:**
```javascript
// Search
await search(env, { model, domain, limit, offset, order });

// Read
await read(env, { model, ids, fields });

// Search + Read (meest gebruikt)
await searchRead(env, { model, domain, fields, limit, offset, order, context });

// Create
await create(env, { model, values });

// Batch create (ADDENDUM L)
await batchCreate(env, { model, valuesArray });

// Update
await write(env, { model, ids, values });

// Low-level RPC
await executeKw(env, { model, method, args, kwargs });
```

**Bevindingen:**
- ✅ **Centralized helper:** Gebruik ALTIJD `odoo.js` functies
- ✅ **Throttle ingebouwd:** 200ms delay tussen calls (rate limit protection)
- ✅ **Logging ingebouwd:** Console logs met timestamps, model, method
- ✅ **Error handling:** Automatisch JSON parse + Odoo error unwrap
- ✅ **Staging support:** `staging: true` parameter voor test environment

**Logging output voorbeeld:**
```
🔵 12:34:56 | mymmo | event.event.search_read | args: [[]]
✅ 12:34:57 | mymmo | event.event.search_read | 200 | 15 items
```

**Voor Event Operations:**
```javascript
import { searchRead, write } from '../../lib/odoo.js';

// ✅ Odoo events ophalen
const events = await searchRead(env, {
  model: 'event.event',
  domain: [['state', 'in', ['draft', 'confirm', 'done']]],
  fields: ['name', 'date_begin', 'date_end', 'website_published'],
  order: 'date_begin DESC',
  limit: 100
});

// ❌ NIET DOEN: Custom Odoo client bouwen
const response = await fetch('https://mymmo.odoo.com/jsonrpc', {
  method: 'POST',
  // ... custom implementation
});
```

---

### 4.2 Odoo Model Conventions

**Analyse van bestaande Odoo calls:**

Project Generator gebruikt:
- `project.project` (projecten)
- `project.task` (taken)
- `project.task.type` (task stages)
- `res.users` (users)

Sales Insight Explorer introspect:
- `crm.lead` (leads)
- `res.partner` (contacts)
- `sale.order` (sales orders)
- Etc. (7 default models)

**Voor Event Operations:**

Odoo Event Management models:
- `event.event` (main events)
- `event.type` (event types/categorieën)
- `event.registration` (attendees)
- `event.tag` (tags)

**Velden introspection:**
```javascript
import { executeKw } from '../../lib/odoo.js';

// Discover beschikbare velden
const fields = await executeKw(env, {
  model: 'event.event',
  method: 'fields_get',
  args: [],
  kwargs: {}
});

console.log('Available fields:', Object.keys(fields));
```

---

## 🎨 5. UI & Navbar Integratie Analyse

### 5.1 Navbar Automatische Integratie

**Locatie:** [public/admin-dashboard.js](../../public/admin-dashboard.js) (voorbeeld)

**Patroon:**

Alle HTML pages hebben:
```html
<div id="navbar"></div>

<script>
// Navbar rendering
async function renderNavbar() {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  const data = await response.json();
  
  if (!data.user) {
    window.location.href = '/';
    return;
  }
  
  const userModules = data.user.modules || [];
  const modules = userModules.map(um => um.module || um);
  
  const navbar = document.getElementById('navbar');
  navbar.innerHTML = `
    <header class="flex items-center justify-between bg-base-100 shadow-sm px-4" 
            style="position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 50;">
      <!-- Logo -->
      <div class="flex items-center gap-4">
        <a href="/">OpenVME Operations Manager</a>
        
        <!-- Module dropdown -->
        ${modules.length > 0 ? `
          <div class="dropdown dropdown-hover">
            <div tabindex="0" role="button" class="btn btn-sm btn-ghost gap-2">
              Modules
            </div>
            <ul tabindex="0" class="dropdown-content menu">
              ${modules.map(m => 
                '<li><a href="' + m.route + '">' + m.name + '</a></li>'
              ).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
      
      <!-- Theme + Profile + Logout -->
      <div class="flex gap-2 items-center">
        <select id="themeSelector" class="select select-xs">...</select>
        <a href="/profile" class="btn btn-ghost btn-xs">Profile</a>
        <button onclick="logout()" class="btn btn-error btn-xs">Logout</button>
      </div>
    </header>
  `;
}

// Initialize
renderNavbar();
</script>
```

**Bevindingen:**
- ✅ Navbar is **dynamisch** gebaseerd op user modules
- ✅ Modules verschijnen automatisch in dropdown na `user_modules` grant
- ✅ Gebruik **DaisyUI components** (dropdown, btn, select)
- ✅ Geen custom navbar component nodig, kopieer bestaande pattern

**Voor Event Operations:**
- ✅ Kopieer exact navbar rendering code
- ✅ Event Operations verschijnt automatisch in dropdown zodra module geregistreerd is
- ✅ Geen custom integratie nodig

---

### 5.2 UI Layout Patroon

**Analyse van Project Generator UI:**

```javascript
export function templateLibraryUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Generator - OpenVME Operations Manager</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200" style="overflow-y: scroll;">
    <div id="navbar"></div>
    
    <!-- Content moet top padding hebben voor fixed navbar -->
    <div style="padding-top: 48px;">
      <div class="pb-8">
        <div class="container mx-auto px-6 max-w-7xl">
          
          <!-- Header -->
          <div class="mb-8">
            <h1 class="text-4xl font-bold mb-2">Project Generator</h1>
            <p class="text-base-content/60">Manage project templates</p>
          </div>

          <!-- Content cards -->
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <!-- ... -->
            </div>
          </div>
          
        </div>
      </div>
    </div>

    <script src="/project-generator-client.js"></script>
</body>
</html>
  `;
}
```

**Bevindingen:**
- ✅ **DaisyUI 4.12.14** + TailwindCSS CDN
- ✅ **Lucide icons** via CDN
- ✅ **Theme support:** `data-theme="light"` (theme selector in navbar)
- ✅ **Fixed navbar:** 48px height, content heeft `padding-top: 48px`
- ✅ **Container pattern:** `container mx-auto px-6 max-w-7xl`
- ✅ **Card pattern:** `card bg-base-100 shadow-xl` met `card-body`

**Voor Event Operations:**
```javascript
export function eventOperationsUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Operations - OpenVME Operations Manager</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200" style="overflow-y: scroll;">
    <div id="navbar"></div>
    
    <div style="padding-top: 48px;">
      <div class="pb-8">
        <div class="container mx-auto px-6 max-w-7xl">
          <div class="mb-8">
            <h1 class="text-4xl font-bold mb-2">Event Operations</h1>
            <p class="text-base-content/60">Manage Odoo event publication to WordPress</p>
          </div>

          <!-- Events table card -->
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <h2 class="card-title">Odoo Events</h2>
              <div id="eventsTable">Loading...</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script src="/event-operations-client.js"></script>
</body>
</html>
  `;
}
```

---

## 📝 6. Logging & Error Handling Analyse

### 6.1 Console Logging Patroon

**Bevindingen uit codebase scan:**

```javascript
// ✅ Module-prefixed logging
console.error('[Project Generator] Get templates failed:', error);
console.log('[Sales Insight] Schema introspection complete');
console.warn('[Permission Violation]', { userId, action, templateId });

// ✅ Emoji-based status indicators
console.log('🔵 12:34:56 | Starting operation');  // Info
console.log('✅ 12:34:57 | Operation complete');   // Success
console.log('❌ 12:34:58 | Operation failed');     // Error
console.log('🔄 Refreshing schema...');            // Progress
console.log('📦 Returning cached schema');         // Cache hit
console.log('🚀 Executing query...');              // Action
```

**Voor Event Operations:**
```javascript
// ✅ Module prefix
console.log('[Event Operations] Fetching Odoo events...');
console.error('[Event Operations] WordPress sync failed:', error);

// ✅ Emoji indicators
console.log('🎫 Fetching events from Odoo...');
console.log('📤 Publishing to WordPress...');
console.log('✅ Event published successfully');
console.log('⚠️ Discrepancy detected:', { odooId, wpId });
```

---

### 6.2 Error Response Patroon

**Standaard error response:**
```javascript
try {
  // ... logic
} catch (error) {
  console.error('[Module Name] Action failed:', error);
  
  return new Response(JSON.stringify({
    success: false,
    error: error.message
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Validation error:**
```javascript
if (!data.name) {
  return new Response(JSON.stringify({
    success: false,
    error: 'Missing required field: name'
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Authorization error:**
```javascript
if (!canEdit(user, template)) {
  return new Response(JSON.stringify({
    success: false,
    error: 'Forbidden',
    message: 'You do not have permission to edit this template'
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## 📚 7. Documentatie Patroon Analyse

### 7.1 Documentatie Structuur

**Bestaande documentatie folders:**

```
docs/
  project-generator/
    PROJECT_GENERATOR_COMPLETE_V1.md       # Complete reference
    MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md
    ADDENDUM_A_B.md ... ADDENDUM_P.md      # Feature addendums
    iterations/                             # Development iterations
    analysis/                               # Analysis documents
    
  sales-insight-explorer/
    SALES_INSIGHT_COMPLETE.md              # Complete reference
    SALES_INSIGHT_EXPLORER.md              # Original spec
    iterations/                             # 7 iterations
    
  crm-leads/
    CRM_LEADS_EXTENSION_COMPLETE.md
    CRM_LEADS_QUICK_START.md
```

**Bevindingen:**
- ✅ **Per module:** Eigen folder in `docs/`
- ✅ **Complete reference:** `MODULE_NAME_COMPLETE.md` (single source of truth)
- ✅ **Implementation log:** Chronological development record
- ✅ **Iterations folder:** Development iterations (optional)

---

### 7.2 Complete Reference Template

**Pattern van SALES_INSIGHT_COMPLETE.md:**

```markdown
# Module Name - Complete Implementation Summary

**Project:** Forminator-Odoo Sync  
**Module:** Module Name  
**Status:** ✅ Production-Ready  
**Date:** YYYY-MM-DD

---

## 🎯 Overview

[5-second summary]

---

## 📦 Complete Feature Set

### Feature 1
**Files:** file1.js, file2.js
**Capabilities:**
- ✅ Item 1
- ✅ Item 2

---

## 🗄️ Database Schema

[Table schemas, RLS policies]

---

## 🛣️ API Routes

[Complete route listing]

---

## 🎨 UI Components

[UI structure]

---

## 🔧 Configuration

[Env vars, settings]
```

---

### 7.3 Implementation Log Template

**Pattern van MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md:**

```markdown
# Module Name - Implementation Log

## Migration IDs

- 20260211000000_event_operations_v1.sql

## Files Created

- src/modules/event-operations/module.js
- src/modules/event-operations/routes.js
- src/modules/event-operations/ui.js
- ...

## Files Modified

- src/modules/registry.js (added eventOperationsModule)

## Routes Added

- GET /events
- GET /events/api/odoo-events
- POST /events/api/publish
- ...

## Test Cases

1. Fetch Odoo events
2. Detect discrepancies
3. Publish to WordPress
4. ...

## Results

[Test results, screenshots, notes]
```

---

## 🎯 8. Event Operations Integratie Plan

### 8.1 Functionele Context (WordPress Integratie)

**Gegeven (reeds operationeel):**
- ✅ WordPress Tribe Events endpoint werkt
- ✅ WP meta injection werkt
- ✅ Forminator runtime binding werkt

**Event Operations moet bouwen:**
- ✅ Controlekamer (UI)
- ✅ Odoo events ophalen
- ✅ Status vergelijken (Odoo vs WordPress)
- ✅ Publiceren naar WordPress
- ✅ Updaten van bestaande events
- ✅ Discrepanties detecteren
- ✅ Logging tonen

**Event Operations moet NIET bouwen:**
- ❌ WordPress helper plugin (bestaat al)
- ❌ Tribe endpoint modificatie
- ❌ Forminator configuratie

---

### 8.2 Implementatie Checklist

#### Database (Supabase)
```sql
-- ✅ Migration: 20260211000000_event_operations_v1.sql
-- ✅ Table: event_snapshots (Odoo + WP state)
-- ✅ RLS: User-scoped policies (auth.uid() = user_id)
-- ✅ Index: user_id, odoo_event_id
-- ✅ Module registration in modules table
-- ✅ Auto-grant to admin users
```

#### Module Structure
```
src/modules/event-operations/
  ✅ module.js           (metadata + route registration)
  ✅ routes.js           (API handlers)
  ✅ ui.js               (HTML rendering)
  ✅ odoo-events.js      (Odoo integration)
  ✅ wordpress-sync.js   (WordPress publish logic)
  ✅ discrepancy.js      (State comparison)
```

#### Registry
```javascript
// ✅ src/modules/registry.js
import eventOperationsModule from './event-operations/module.js';
export const MODULES = [
  // ...
  eventOperationsModule
];
```

#### Routes
```javascript
// ✅ module.js
routes: {
  'GET /': UI rendering,
  'GET /api/odoo-events': Fetch from Odoo,
  'GET /api/snapshots': User's snapshots,
  'POST /api/publish': Publish to WordPress,
  'POST /api/sync': Detect + update,
  'GET /api/discrepancies': Show differences
}
```

#### Odoo Integration
```javascript
// ✅ Use odoo.js helpers
import { searchRead, write } from '../../lib/odoo.js';

const events = await searchRead(env, {
  model: 'event.event',
  domain: [['state', '!=', 'cancel']],
  fields: ['name', 'date_begin', 'date_end', 'website_published'],
  order: 'date_begin DESC'
});
```

#### WordPress Integration
```javascript
// ✅ Use env.WORDPRESS_URL
const response = await fetch(`${env.WORDPRESS_URL}/wp-json/tribe/events/v1/events`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${env.WP_API_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: event.name,
    start_date: event.date_begin,
    end_date: event.date_end,
    meta: {
      odoo_event_id: event.id
    }
  })
});
```

#### Logging
```javascript
// ✅ Console logging pattern
console.log('[Event Operations] 🎫 Fetching events...');
console.log('[Event Operations] ✅ Found', events.length, 'events');
console.error('[Event Operations] ❌ Publish failed:', error);
```

---

### 8.3 Niet Doen (Afwijkingen Vermijden)

❌ **Eigen routing systeem** → Gebruik bestaande module registry  
❌ **Custom auth layer** → Gebruik bestaande validateSession  
❌ **Eigen Odoo client** → Gebruik odoo.js helpers  
❌ **Foreign keys op user_id** → Alleen index, geen FK  
❌ **Custom UI components** → Gebruik DaisyUI  
❌ **Nieuwe documentatie structuur** → Volg bestaand patroon  
❌ **Eigen logging systeem** → Gebruik console.log/error  
❌ **State management library** → Vanilla JS zoals andere modules  

---

## ✅ 9. Conclusie

### Bestaande Patronen (MANDATORY)

| Aspect | Patroon | Locatie |
|--------|---------|---------|
| **Module registratie** | Import + array push in registry.js | [registry.js](../../src/modules/registry.js) |
| **Module object** | code, name, description, route, icon, routes | Alle module.js files |
| **Routing** | Method + path in routes object | Alle modules |
| **Auth** | validateSession via context.user | [index.js](../../src/index.js) |
| **Supabase tables** | NO FK op user_id, RLS policies | Alle migrations |
| **Odoo calls** | odoo.js helpers (searchRead, create, write) | [lib/odoo.js](../../src/lib/odoo.js) |
| **UI** | DaisyUI + Tailwind + Lucide icons | Alle UI files |
| **Navbar** | renderNavbar() met /api/auth/me | Alle HTML pages |
| **Errors** | try/catch, console.error, JSON response | Alle route handlers |
| **Logging** | [Module Name] prefix + emoji | Alle modules |
| **Docs** | MODULE_COMPLETE.md + IMPLEMENTATION_LOG.md | docs/ folders |

---

### Volgende Stappen

1. ✅ **Analyse complete** (dit document)
2. ⏭️ **Implementation proposal** (volgende document)
   - Exacte database schema
   - API contract definitie
   - Discrepancy detection logica
   - WordPress sync flow
   - UI mockup (beschrijving)
3. ⏭️ **Implementation log** (tijdens development)
   - Migration ID
   - Files created/modified
   - Test results

---

**Document Status:** ✅ Complete  
**Ready for:** Implementation Proposal  
**Compliance:** 100% gebaseerd op bestaande code, 0% aannames
