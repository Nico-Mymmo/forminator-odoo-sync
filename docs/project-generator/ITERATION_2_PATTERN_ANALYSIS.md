# Iteration 2: Pattern Analysis (STEP 0)

**Date**: 2026-01-28  
**Purpose**: Extract canonical module patterns from existing codebase before implementing Project Generator UI

---

## 1. MODULE STRUCTURE PATTERN

### Files Per Module

Extracted from `forminator-sync` and `sales-insight-explorer`:

```
src/modules/{module-name}/
├── module.js       # Module metadata and route registration
├── routes.js       # Route handler functions (optional, for complex modules)
└── ui.js           # HTML generation function(s)
```

**Pattern Rules:**
- Simple modules (like `project-generator`) can inline route handlers in `module.js`
- Complex modules extract handlers to `routes.js` for organization
- UI is ALWAYS a separate file (`ui.js`)
- Additional subdirectories (`lib/`, `components/`, `tests/`) are optional

---

## 2. MODULE REGISTRATION PATTERN

### File: `src/modules/registry.js`

**Pattern:**
```javascript
import projectGeneratorModule from './project-generator/module.js';

export const MODULES = [
  homeModule,
  forminatorSyncModule,
  projectGeneratorModule,  // Already registered in Iteration 1
  adminModule,
  profileModule,
  salesInsightExplorerModule
];
```

**Observations:**
- Module is imported and added to `MODULES` array
- No further code changes needed in `registry.js`
- Registry provides utility functions: `getModuleByRoute()`, `getUserModules()`, etc.

---

## 3. MODULE.JS METADATA PATTERN

### Canonical Structure (from `forminator-sync/module.js`)

```javascript
export default {
  // Module metadata
  code: 'forminator_sync',        // Must match database modules.code
  name: 'Forminator Admin',       // Display name in navigation
  description: 'Sync WordPress Forminator forms to Odoo',
  route: '/forminator',           // Base route path
  icon: 'workflow',               // Lucide icon name
  
  // Module status
  isActive: true,
  requiresAuth: true,             // Optional (default: true)
  requiresAdmin: false,           // Optional (default: false)
  
  // Route handlers
  routes: {
    'GET /': async (context) => {
      return new Response(uiFunction(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    'GET /api/something': handlerFunction,
    'POST /api/something': handlerFunction,
    // ...
  }
};
```

**Pattern Rules:**
- `code` MUST match database `modules.code` column
- `route` is the base URL path (e.g., `/projects`)
- `routes` object maps `METHOD /path` to handler functions
- `GET /` is the main UI entry point
- All API routes are relative to module's base `route`

---

## 4. ROUTE HANDLER CONTEXT PATTERN

### What Handlers Receive

From `src/modules/registry.js` and route handlers:

```javascript
async function handler(context) {
  const {
    request,  // Request object
    env,      // Environment variables (Cloudflare Worker env)
    user,     // User object (from session validation)
    params    // URL parameters (e.g., { id: '123' } for /api/items/:id)
  } = context;
  
  // Handler logic...
}
```

**Pattern Rules:**
- `user` is pre-validated by routing system
- `user` includes `modules` array (user's enabled modules)
- `params` are extracted from parametric routes (e.g., `:id`)
- Return a `Response` object

---

## 5. UI GENERATION PATTERN

### Canonical HTML Structure (from `forminator-sync/ui.js`)

```javascript
import { navbar } from '../../lib/components/navbar.js';

export function myModuleUI(user) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Module</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
    \${navbar(user)}
    
    <div style="padding-top: 48px;">
      <div class="container mx-auto px-6 py-8">
        <!-- Content here -->
      </div>
    </div>

    <script>
      // Theme management (standard boilerplate)
      function changeTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('selectedTheme', theme);
      }
      
      function initTheme() {
        const savedTheme = localStorage.getItem('selectedTheme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const selector = document.getElementById('themeSelector');
        if (selector) selector.value = savedTheme;
      }
      
      async function logout() {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        localStorage.removeItem('adminToken');
        window.location.href = '/';
      }
      
      initTheme();
      lucide.createIcons();
    </script>
</body>
</html>\`;
}
```

**Pattern Rules:**
- Always use DaisyUI + Tailwind CSS (no custom frameworks)
- Always import and render `navbar(user)` component
- Add `padding-top: 48px` to account for fixed navbar
- Include standard theme management and logout functions
- Call `lucide.createIcons()` at end of script

---

## 6. DATA ACCESS PATTERN (USER-SCOPED)

### From `sales-insight-explorer/lib/query-repository.js`

**Pattern for user-scoped data:**

```javascript
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// Example: Get all user's records (RLS auto-enforces user_id)
async function getUserRecords(env, userId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('user_id', userId)  // Explicit filter (redundant with RLS, but clear)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[Repository] Fetch failed:', error);
    throw new Error(`Failed to fetch: ${error.message}`);
  }
  
  return data || [];
}

// Example: Insert new record
async function createRecord(env, userId, data) {
  const supabase = getSupabaseClient(env);
  
  const row = {
    user_id: userId,
    name: data.name,
    // ... other fields
  };
  
  const { data: inserted, error } = await supabase
    .from('table_name')
    .insert(row)
    .select()
    .single();
  
  if (error) {
    console.error('[Repository] Insert failed:', error);
    throw new Error(`Failed to insert: ${error.message}`);
  }
  
  return inserted;
}

// Example: Update record
async function updateRecord(env, recordId, updates) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('table_name')
    .update(updates)
    .eq('id', recordId)
    .select()
    .single();
  
  if (error) {
    console.error('[Repository] Update failed:', error);
    throw new Error(`Failed to update: ${error.message}`);
  }
  
  return data;
}

// Example: Delete record
async function deleteRecord(env, recordId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('table_name')
    .delete()
    .eq('id', recordId)
    .select();
  
  if (error) {
    console.error('[Repository] Delete failed:', error);
    throw new Error(`Failed to delete: ${error.message}`);
  }
  
  return data && data.length > 0;
}
```

**Pattern Rules:**
- Use `createClient` directly (NOT `getSupabaseClient` from `lib/database.js`, which bypasses RLS)
- Always use SERVICE_ROLE_KEY (enables RLS policies)
- Always filter by `user_id` explicitly (even though RLS does it)
- Always use `.select()` after insert/update to return the row
- Always use `.single()` when expecting one record
- Always log errors before throwing
- Return clean data types (arrays, objects, booleans)

---

## 7. ROUTE PATTERN (API ENDPOINTS)

### From `forminator-sync/routes.js`

**Handler Extraction Pattern:**

```javascript
export async function handleGetItems(context) {
  const { env, user } = context;
  
  try {
    const items = await getItems(env, user.id);
    
    return new Response(JSON.stringify({
      success: true,
      data: items
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[API] Get items failed:', error);
    
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

**Pattern Rules:**
- Handlers are async functions
- Extract `env` and `user` from context
- Wrap in try/catch
- Return JSON with `{ success, data }` on success
- Return JSON with `{ success, error }` on failure
- Set appropriate HTTP status codes
- Log errors before returning

---

## 8. FRONTEND DATA ACCESS PATTERN

### From Sales Insight Explorer UI

**Client-side CRUD Pattern:**

```javascript
// Fetch list
async function loadItems() {
  try {
    const response = await fetch('/projects/api/templates', {
      credentials: 'include'  // Include session cookie
    });
    
    const result = await response.json();
    
    if (result.success) {
      renderItems(result.data);
    } else {
      showError(result.error);
    }
  } catch (err) {
    showError('Failed to load items');
  }
}

// Create item
async function createItem(data) {
  try {
    const response = await fetch('/projects/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess('Item created');
      loadItems();  // Refresh list
    } else {
      showError(result.error);
    }
  } catch (err) {
    showError('Failed to create item');
  }
}

// Update item
async function updateItem(id, updates) {
  try {
    const response = await fetch(`/projects/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess('Item updated');
      loadItems();
    } else {
      showError(result.error);
    }
  } catch (err) {
    showError('Failed to update item');
  }
}

// Delete item
async function deleteItem(id) {
  if (!confirm('Are you sure?')) return;
  
  try {
    const response = await fetch(`/projects/api/templates/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess('Item deleted');
      loadItems();
    } else {
      showError(result.error);
    }
  } catch (err) {
    showError('Failed to delete item');
  }
}
```

**Pattern Rules:**
- Always use `credentials: 'include'` to send session cookie
- Always check `result.success` before proceeding
- Always refresh list after create/update/delete
- Always wrap in try/catch
- Use DaisyUI toast/alert components for feedback

---

## 9. EXISTING PROJECT GENERATOR STATE

### Current Files

**`src/modules/project-generator/module.js`** (PLACEHOLDER)
- Exports mock template list
- Exports placeholder `/api/generate` handler
- Returns "not yet implemented" messages
- **Status**: Needs complete replacement

**`src/modules/project-generator/ui.js`** (PLACEHOLDER)
- Shows hardcoded template cards
- No real CRUD functionality
- Shows "Coming Soon" buttons
- **Status**: Needs complete replacement

---

## 10. EXTRACTED CANONICAL PATTERN FOR PROJECT GENERATOR

### What We Will Build

**File Structure:**
```
src/modules/project-generator/
├── module.js       # Module metadata + route registration
├── library.js      # Data access layer (repository pattern)
└── ui.js           # Template library UI
```

**Module Routes** (`module.js`):
```javascript
routes: {
  'GET /': async (context) => {
    return new Response(templateLibraryUI(context.user), {
      headers: { 'Content-Type': 'text/html' }
    });
  },
  
  'GET /api/templates': async (context) => {
    // List user's templates
  },
  
  'POST /api/templates': async (context) => {
    // Create new template
  },
  
  'PUT /api/templates/:id': async (context) => {
    // Update template
  },
  
  'DELETE /api/templates/:id': async (context) => {
    // Delete template
  }
}
```

**Data Layer** (`library.js`):
```javascript
// Repository functions:
// - getTemplates(env, userId)
// - getTemplate(env, templateId)
// - createTemplate(env, userId, data)
// - updateTemplate(env, templateId, updates)
// - deleteTemplate(env, templateId)
```

**UI** (`ui.js`):
```javascript
export function templateLibraryUI(user) {
  // Returns HTML with:
  // - Navbar
  // - Template list/table
  // - Create button
  // - Edit/delete actions
  // - Modal for create/edit forms
  // - Client-side CRUD logic
}
```

---

## STEP 0 COMPLETE

**Findings Summary:**
1. ✅ Module registration: Already done in Iteration 1
2. ✅ Module structure: 3 files needed (module.js, library.js, ui.js)
3. ✅ Data access: Use `createClient` directly (NOT `getSupabaseClient`)
4. ✅ Route pattern: `METHOD /path` → async handler
5. ✅ UI pattern: DaisyUI + Tailwind + navbar + standard scripts
6. ✅ CRUD pattern: Standard REST endpoints + client-side fetch
7. ✅ RLS enforcement: Automatic via policies, explicit filter recommended

**Next Step:** STEP 1 - UI & Module Design (screen flows, no code yet)

---

## ADDENDUM: Template Literal Rejection

**Date**: 2026-01-28 (post-implementation)

### Why Template Literals Were Removed

During initial implementation, dynamic HTML was generated using template literals:

```javascript
// INITIAL IMPLEMENTATION (rejected):
tableBody.innerHTML = templates.map(t => `
  <td>${escapeHtml(t.name)}</td>
`).join('');
```

**Problems:**
1. **Security**: Required manual `escapeHtml()` - easy to forget → XSS
2. **Maintainability**: Large HTML strings, fragile, hard to debug
3. **Inconsistency**: Mixed with DOM API usage elsewhere
4. **Risk**: One missed escaping call exposes entire application

### Why DOM APIs Are Mandatory

**Refactored to:**
```javascript
function renderTemplateRow(template) {
  const td = document.createElement('td');
  td.textContent = template.name;  // Auto-escaped
  return td;
}
```

**Benefits:**
- ✅ Auto-escaping via `textContent` (safe by default)
- ✅ No manual escaping needed
- ✅ Explicit, boring, safe code
- ✅ Harder to introduce XSS

**Philosophy:** Safety and consistency matter more than elegance.

**Status:** Template literal HTML generation is **permanently rejected** for dynamic content in this project.
