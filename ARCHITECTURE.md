# Operations Management Platform - Architecture

## 🎯 Vision

Transform the Forminator-Odoo sync application into a **modular operations platform** with:
- Invitation-based authentication
- Role-based access control
- Module-based navigation
- Scalable admin interface

## 🏗️ Architecture Overview

### High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer (Browser)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Auth Manager │  │   Router     │  │  UI State    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (Edge Runtime)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Auth Layer   │  │    Router    │  │   Modules    │      │
│  │  Middleware  │  │   Resolver   │  │   Registry   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Users     │  │User Modules  │  │Form Mappings │      │
│  │    Invites   │  │    Roles     │  │   History    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Models

### 1. Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  
  -- Authentication
  password_hash TEXT NOT NULL,           -- bcrypt hash
  is_active BOOLEAN DEFAULT false,       -- Activated on first login
  
  -- Profile
  full_name VARCHAR(255),
  avatar_url TEXT,
  
  -- Role
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'user')),
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_role ON users(role);
```

### 2. Invites Table

```sql
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  
  -- Token
  token VARCHAR(255) UNIQUE NOT NULL,    -- Secure random token
  expires_at TIMESTAMPTZ NOT NULL,       -- 7 days from creation
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT token_not_empty CHECK (token != '')
);

CREATE INDEX idx_invites_token ON invites(token) WHERE accepted_at IS NULL;
CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE accepted_at IS NULL;
```

### 3. Modules Table

```sql
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Module identification
  code VARCHAR(50) UNIQUE NOT NULL,      -- 'forminator_sync', 'project_generator'
  name VARCHAR(255) NOT NULL,            -- Display name
  description TEXT,
  
  -- Routing
  route VARCHAR(255) UNIQUE NOT NULL,    -- '/forminator', '/projects'
  icon VARCHAR(100),                     -- Lucide icon name
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,      -- Enabled for new users
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT code_lowercase CHECK (code = LOWER(code)),
  CONSTRAINT route_starts_slash CHECK (route LIKE '/%')
);

CREATE INDEX idx_modules_active ON modules(is_active, display_order);
CREATE UNIQUE INDEX idx_modules_default ON modules(is_default) WHERE is_default = true;
```

### 4. User Modules Table (Junction)

```sql
CREATE TABLE user_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  
  -- Access control
  is_enabled BOOLEAN DEFAULT true,
  
  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT user_module_unique UNIQUE(user_id, module_id)
);

CREATE INDEX idx_user_modules_user ON user_modules(user_id, is_enabled);
CREATE INDEX idx_user_modules_module ON user_modules(module_id);
```

### 5. Sessions Table

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Session token
  token VARCHAR(255) UNIQUE NOT NULL,
  
  -- Session data
  user_agent TEXT,
  ip_address INET,
  
  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,       -- 24 hours default
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT token_not_empty CHECK (token != '')
);

CREATE INDEX idx_sessions_token ON sessions(token) WHERE expires_at > NOW();
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at DESC);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
```

---

## 🔐 Authentication Flow

### Invite Flow

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│  Admin  │                    │  System │                    │  User   │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │ 1. Enter email               │                              │
     ├─────────────────────────────>│                              │
     │                              │                              │
     │ 2. Generate secure token     │                              │
     │    (crypto.randomUUID())     │                              │
     │ <────────────────────────────┤                              │
     │                              │                              │
     │ 3. Send email with link      │                              │
     │    /invite?token=xxx         │                              │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │ 4. Click invite link         │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │                              │ 5. Verify token              │
     │                              │    - Not expired?            │
     │                              │    - Not used?               │
     │                              │                              │
     │                              │ 6. Show setup form           │
     │                              ├─────────────────────────────>│
     │                              │    (name, password)          │
     │                              │                              │
     │                              │ 7. Submit setup              │
     │                              │<─────────────────────────────┤
     │                              │                              │
     │ 8. Create user account       │                              │
     │    - role: user              │                              │
     │    - is_active: true         │                              │
     │    - Grant default modules   │                              │
     │                              │                              │
     │                              │ 9. Auto-login                │
     │                              │    Create session            │
     │                              ├─────────────────────────────>│
```

### Login Flow

```
User submits email/password
         │
         ▼
Validate credentials (bcrypt)
         │
         ▼
Check is_active = true
         │
         ▼
Generate session token (JWT or UUID)
         │
         ▼
Store in sessions table
         │
         ▼
Return token + user data
         │
         ▼
Client stores in localStorage
```

### Session Validation (every request)

```
Client sends Authorization: Bearer <token>
         │
         ▼
Lookup session in DB
         │
         ├──> Not found? → 401 Unauthorized
         │
         ├──> Expired? → 401 Unauthorized
         │
         ├──> Valid? → Continue
         │
         ▼
Load user + modules
         │
         ▼
Attach to request.context
```

---

## 🧩 Module System

### Module Registry

Each module is a self-contained unit:

```javascript
// src/modules/forminator-sync/module.js
export default {
  code: 'forminator_sync',
  name: 'Forminator Sync',
  description: 'Sync Forminator forms to Odoo',
  route: '/forminator',
  icon: 'workflow',
  
  // Route handlers
  routes: {
    'GET /': handleFormMappingsView,
    'GET /api/mappings': handleGetMappings,
    'POST /api/mappings': handleSaveMapping,
    // ... more routes
  },
  
  // UI component
  renderUI: (context) => forminatorAdminHTML(context)
};
```

```javascript
// src/modules/project-generator/module.js
export default {
  code: 'project_generator',
  name: 'Project Generator',
  description: 'Generate project structures',
  route: '/projects',
  icon: 'folder-plus',
  
  routes: {
    'GET /': handleProjectsView,
    'POST /api/projects': handleCreateProject,
  },
  
  renderUI: (context) => projectGeneratorHTML(context)
};
```

### Module Loader

```javascript
// src/lib/module_loader.js
const MODULES = [
  forminatorSyncModule,
  projectGeneratorModule
];

export function getModulesForUser(user) {
  // Query user_modules to get enabled modules
  const enabledCodes = user.modules.map(m => m.code);
  
  return MODULES.filter(mod => 
    enabledCodes.includes(mod.code)
  );
}

export function resolveRoute(pathname, modules) {
  for (const module of modules) {
    if (pathname.startsWith(module.route)) {
      const subPath = pathname.slice(module.route.length) || '/';
      const handler = module.routes[`${method} ${subPath}`];
      if (handler) return handler;
    }
  }
  return null;
}
```

---

## 🎨 Navigation Structure

### Top Navbar (DaisyUI)

```html
<!-- Fixed top navbar -->
<div class="navbar bg-base-100 border-b border-base-300 fixed top-0 z-50">
  <!-- Left: Logo + Module Tabs -->
  <div class="navbar-start gap-2">
    <div class="text-xl font-bold px-4">Operations</div>
    
    <!-- Module Navigation (Tabs) -->
    <div role="tablist" class="tabs tabs-boxed">
      {{#each modules}}
      <a role="tab" class="tab {{#if active}}tab-active{{/if}}" 
         href="{{route}}">
        <i data-lucide="{{icon}}" class="w-4 h-4 mr-2"></i>
        {{name}}
      </a>
      {{/each}}
    </div>
  </div>
  
  <!-- Right: User Menu -->
  <div class="navbar-end">
    <div class="dropdown dropdown-end">
      <label tabindex="0" class="btn btn-ghost btn-circle avatar">
        <div class="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center">
          {{userInitials}}
        </div>
      </label>
      <ul tabindex="0" class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-52 mt-3">
        <li class="menu-title">
          <span>{{user.full_name}}</span>
          <span class="badge badge-sm badge-outline">{{user.role}}</span>
        </li>
        <li><a href="/profile"><i data-lucide="user" class="w-4 h-4"></i> Profile</a></li>
        {{#if isAdmin}}
        <li><a href="/admin"><i data-lucide="settings" class="w-4 h-4"></i> Admin</a></li>
        {{/if}}
        <li><a id="logoutBtn"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</a></li>
      </ul>
    </div>
  </div>
</div>
```

### Module Content Area

```html
<div class="pt-16"> <!-- Offset for fixed navbar -->
  <!-- Module-specific content renders here -->
  <div id="moduleContent"></div>
</div>
```

---

## 👔 Admin Interface

### Admin Dashboard

```html
<div class="container mx-auto p-6 max-w-7xl">
  <!-- Stats Cards -->
  <div class="stats shadow w-full mb-6">
    <div class="stat">
      <div class="stat-figure text-primary">
        <i data-lucide="users" class="w-8 h-8"></i>
      </div>
      <div class="stat-title">Total Users</div>
      <div class="stat-value text-primary">{{totalUsers}}</div>
    </div>
    
    <div class="stat">
      <div class="stat-figure text-secondary">
        <i data-lucide="user-plus" class="w-8 h-8"></i>
      </div>
      <div class="stat-title">Pending Invites</div>
      <div class="stat-value text-secondary">{{pendingInvites}}</div>
    </div>
    
    <div class="stat">
      <div class="stat-figure text-accent">
        <i data-lucide="package" class="w-8 h-8"></i>
      </div>
      <div class="stat-title">Active Modules</div>
      <div class="stat-value text-accent">{{activeModules}}</div>
    </div>
  </div>
  
  <!-- Tabs -->
  <div role="tablist" class="tabs tabs-lifted tabs-lg">
    <input type="radio" name="admin_tabs" role="tab" class="tab" aria-label="Users" checked />
    <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
      <!-- Users table -->
    </div>

    <input type="radio" name="admin_tabs" role="tab" class="tab" aria-label="Invites" />
    <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
      <!-- Invites table -->
    </div>

    <input type="radio" name="admin_tabs" role="tab" class="tab" aria-label="Modules" />
    <div role="tabpanel" class="tab-content bg-base-100 border-base-300 rounded-box p-6">
      <!-- Modules configuration -->
    </div>
  </div>
</div>
```

### Users Table

```html
<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <div class="flex justify-between items-center mb-4">
      <h2 class="card-title">Users</h2>
      <button class="btn btn-primary btn-sm gap-2" id="inviteUserBtn">
        <i data-lucide="user-plus" class="w-4 h-4"></i>
        Invite User
      </button>
    </div>
    
    <div class="overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Enabled Modules</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {{#each users}}
          <tr>
            <td>
              <div class="flex items-center gap-3">
                <div class="avatar placeholder">
                  <div class="bg-neutral-focus text-neutral-content rounded-full w-12">
                    <span>{{initials}}</span>
                  </div>
                </div>
                <div>
                  <div class="font-bold">{{full_name}}</div>
                  <div class="text-sm opacity-50">{{email}}</div>
                </div>
              </div>
            </td>
            <td>
              <select class="select select-sm select-bordered w-32" 
                      data-user-id="{{id}}" 
                      onchange="handleRoleChange(this)">
                <option value="user" {{#if isUser}}selected{{/if}}>User</option>
                <option value="manager" {{#if isManager}}selected{{/if}}>Manager</option>
                <option value="admin" {{#if isAdmin}}selected{{/if}}>Admin</option>
              </select>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="openModulesModal('{{id}}')">
                {{moduleCount}} modules
                <i data-lucide="chevron-right" class="w-4 h-4 ml-1"></i>
              </button>
            </td>
            <td>{{formatDate last_login_at}}</td>
            <td>
              <div class="dropdown dropdown-end">
                <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                  <i data-lucide="more-vertical" class="w-4 h-4"></i>
                </label>
                <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52">
                  <li><a onclick="editUser('{{id}}')">Edit</a></li>
                  <li><a onclick="resetPassword('{{id}}')">Reset Password</a></li>
                  <li><a onclick="deactivateUser('{{id}}')">Deactivate</a></li>
                </ul>
              </div>
            </td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
  </div>
</div>
```

### User Modules Modal

```html
<dialog id="userModulesModal" class="modal">
  <div class="modal-box w-11/12 max-w-2xl">
    <h3 class="font-bold text-lg mb-4">
      Manage Modules for <span id="modalUserName"></span>
    </h3>
    
    <div class="space-y-2">
      {{#each allModules}}
      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-4">
          <input type="checkbox" 
                 class="toggle toggle-primary" 
                 data-module-id="{{id}}"
                 {{#if enabled}}checked{{/if}} />
          <div class="flex items-center gap-3">
            <i data-lucide="{{icon}}" class="w-5 h-5 text-base-content/70"></i>
            <div>
              <div class="font-semibold">{{name}}</div>
              <div class="text-sm text-base-content/60">{{description}}</div>
            </div>
          </div>
        </label>
      </div>
      {{/each}}
    </div>
    
    <div class="modal-action">
      <button class="btn" onclick="closeModulesModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveUserModules()">Save</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
```

### Invite User Modal

```html
<dialog id="inviteModal" class="modal">
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-4">Invite New User</h3>
    
    <form id="inviteForm" class="space-y-4">
      <div class="form-control">
        <label class="label">
          <span class="label-text">Email Address</span>
        </label>
        <input type="email" 
               name="email" 
               placeholder="user@example.com" 
               class="input input-bordered input-primary w-full" 
               required />
      </div>
      
      <div class="alert alert-info">
        <i data-lucide="info" class="w-5 h-5"></i>
        <span>User will receive an email with a secure invite link valid for 7 days.</span>
      </div>
      
      <div class="modal-action">
        <button type="button" class="btn" onclick="closeInviteModal()">Cancel</button>
        <button type="submit" class="btn btn-primary gap-2">
          <i data-lucide="send" class="w-4 h-4"></i>
          Send Invite
        </button>
      </div>
    </form>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
```

---

## 🔌 API Endpoints

### Authentication

```
POST   /api/auth/login           - Login with email/password
POST   /api/auth/logout          - Invalidate session
GET    /api/auth/me              - Get current user + modules
POST   /api/auth/refresh         - Refresh session token
```

### Invites (Admin only)

```
GET    /api/admin/invites        - List all invites
POST   /api/admin/invites        - Create new invite
DELETE /api/admin/invites/:id    - Revoke invite
GET    /invite?token=xxx          - Accept invite page
POST   /api/invites/accept       - Complete invite signup
```

### Users (Admin only)

```
GET    /api/admin/users          - List all users
GET    /api/admin/users/:id      - Get user details
PATCH  /api/admin/users/:id      - Update user (role, etc.)
DELETE /api/admin/users/:id      - Deactivate user
```

### User Modules (Admin only)

```
GET    /api/admin/users/:id/modules      - Get user's modules
PUT    /api/admin/users/:id/modules      - Set user's modules
POST   /api/admin/users/:id/modules/:mid - Enable module
DELETE /api/admin/users/:id/modules/:mid - Disable module
```

### Modules

```
GET    /api/modules              - List all modules (for admin)
```

---

## 🚀 Refactoring Plan

### Phase 1: Database Schema (Week 1)

**Tasks:**
1. ✅ Create migration `002_auth_system.sql`
2. ✅ Add users, invites, sessions, modules, user_modules tables
3. ✅ Seed initial data:
   - Admin user
   - Forminator Sync module
   - Project Generator module
4. ✅ Test migrations locally

**Files:**
- `supabase/migrations/002_auth_system.sql`

---

### Phase 2: Backend - Auth Layer (Week 1)

**Tasks:**
1. Create authentication library
2. Implement session management
3. Create invite system
4. Add auth middleware

**Files to create:**
```
src/lib/auth/
  ├── session.js        - Session CRUD operations
  ├── password.js       - bcrypt hashing/verification
  ├── invite.js         - Invite generation/validation
  └── middleware.js     - requireAuth, requireAdmin
```

**Example: session.js**
```javascript
export async function createSession(supabase, userId) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt
    })
    .select()
    .single();
  
  return { token, session: data };
}

export async function validateSession(supabase, token) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      user:users (
        id,
        email,
        full_name,
        role,
        is_active,
        modules:user_modules (
          module:modules (*)
        )
      )
    `)
    .eq('token', token)
    .gt('expires_at', 'now()')
    .single();
  
  if (error || !data) return null;
  
  // Update last activity
  await supabase
    .from('sessions')
    .update({ last_activity_at: new Date() })
    .eq('id', data.id);
  
  return data.user;
}
```

---

### Phase 3: Backend - Module System (Week 2)

**Tasks:**
1. Extract existing admin interface into Forminator Sync module
2. Create module registry
3. Implement dynamic routing
4. Create Project Generator module scaffold

**Files to create:**
```
src/modules/
  ├── forminator-sync/
  │   ├── module.js
  │   ├── routes.js
  │   └── ui.js
  ├── project-generator/
  │   ├── module.js
  │   ├── routes.js
  │   └── ui.js
  └── registry.js
```

**Example: registry.js**
```javascript
import forminatorSync from './forminator-sync/module.js';
import projectGenerator from './project-generator/module.js';

export const MODULES = [
  forminatorSync,
  projectGenerator
];

export function getModuleByRoute(pathname) {
  return MODULES.find(m => pathname.startsWith(m.route));
}

export function getUserModules(user) {
  const enabledCodes = user.modules.map(m => m.module.code);
  return MODULES.filter(m => enabledCodes.includes(m.code));
}
```

---

### Phase 4: Backend - Router Refactor (Week 2)

**Tasks:**
1. Refactor `src/index.js` to use module routing
2. Add auth middleware to all routes
3. Implement role-based access control

**New structure for index.js:**
```javascript
import { validateSession } from './lib/auth/session.js';
import { requireAdmin } from './lib/auth/middleware.js';
import { MODULES, getModuleByRoute, getUserModules } from './modules/registry.js';
import { handleLogin, handleLogout, handleMe } from './api/auth.js';
import { adminRoutes } from './api/admin.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Public routes
    if (pathname === '/api/auth/login') return handleLogin({ request, env });
    if (pathname.startsWith('/invite')) return handleInvitePage({ request, env });
    
    // Authenticated routes
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const user = token ? await validateSession(getSupabaseClient(env), token) : null;
    
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Attach user to context
    const context = { request, env, ctx, user };
    
    // Auth API
    if (pathname === '/api/auth/logout') return handleLogout(context);
    if (pathname === '/api/auth/me') return handleMe(context);
    
    // Admin routes
    if (pathname.startsWith('/api/admin')) {
      if (user.role !== 'admin') {
        return new Response('Forbidden', { status: 403 });
      }
      return adminRoutes(context);
    }
    
    // Module routes
    const userModules = getUserModules(user);
    const module = getModuleByRoute(pathname);
    
    if (!module || !userModules.find(m => m.code === module.code)) {
      return new Response('Not Found', { status: 404 });
    }
    
    return module.handleRequest(context);
  }
};
```

---

### Phase 5: Frontend - Navigation & Layout (Week 3)

**Tasks:**
1. Create new top navigation component
2. Implement dynamic module tabs
3. Add user menu
4. Refactor existing admin UI to use new layout

**Files to create:**
```
src/lib/components/
  ├── navigation.js     - Top navbar with module tabs
  ├── user_menu.js      - User dropdown menu
  └── layout.js         - Main layout wrapper
```

**Example: navigation.js**
```javascript
export function navigationHTML(user, modules, activeRoute) {
  const modulesTabs = modules.map(m => `
    <a role="tab" 
       class="tab gap-2 ${activeRoute === m.route ? 'tab-active' : ''}" 
       href="${m.route}">
      <i data-lucide="${m.icon}" class="w-4 h-4"></i>
      ${m.name}
    </a>
  `).join('');
  
  return `
    <div class="navbar bg-base-100 border-b border-base-300 fixed top-0 z-50 px-4">
      <div class="navbar-start">
        <span class="text-xl font-bold mr-4">Operations</span>
        <div role="tablist" class="tabs tabs-boxed">
          ${modulesTabs}
        </div>
      </div>
      <div class="navbar-end">
        ${userMenuHTML(user)}
      </div>
    </div>
  `;
}
```

---

### Phase 6: Frontend - Auth UI (Week 3)

**Tasks:**
1. Create login page (replace existing)
2. Create invite acceptance page
3. Implement client-side session management
4. Add logout functionality

**Files to create:**
```
public/
  ├── auth.js           - Client-side auth logic
  ├── login.html        - Standalone login page (or component)
  └── invite.html       - Invite acceptance page
```

**Example: auth.js**
```javascript
class AuthManager {
  constructor() {
    this.token = localStorage.getItem('session_token');
    this.user = null;
  }
  
  async login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) throw new Error('Login failed');
    
    const { token, user } = await response.json();
    this.token = token;
    this.user = user;
    localStorage.setItem('session_token', token);
    
    return user;
  }
  
  async loadUser() {
    if (!this.token) return null;
    
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    if (!response.ok) {
      this.logout();
      return null;
    }
    
    this.user = await response.json();
    return this.user;
  }
  
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('session_token');
    window.location.href = '/login';
  }
  
  getAuthHeader() {
    return { 'Authorization': `Bearer ${this.token}` };
  }
}

window.auth = new AuthManager();
```

---

### Phase 7: Frontend - Admin Interface (Week 4)

**Tasks:**
1. Create admin dashboard
2. Implement user management UI
3. Implement invite management UI
4. Implement module assignment UI

**Files to create:**
```
src/modules/admin/
  ├── module.js
  ├── ui/
  │   ├── dashboard.js
  │   ├── users.js
  │   ├── invites.js
  │   └── modules.js
  └── api.js
```

---

### Phase 8: Migration & Testing (Week 4)

**Tasks:**
1. Create admin user with script
2. Migrate existing admin token to session-based auth
3. Test all flows end-to-end
4. Update documentation

---

## 📝 DaisyUI Component Examples

### Pill-style Form Controls

```html
<!-- Input -->
<input type="text" 
       placeholder="Search..." 
       class="input input-bordered input-primary w-full rounded-full" />

<!-- Button -->
<button class="btn btn-primary rounded-full px-6">
  <i data-lucide="plus" class="w-4 h-4 mr-2"></i>
  Add New
</button>

<!-- Select -->
<select class="select select-bordered rounded-full">
  <option>Option 1</option>
  <option>Option 2</option>
</select>

<!-- Toggle -->
<input type="checkbox" class="toggle toggle-primary" checked />
```

### Cards

```html
<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <h2 class="card-title">Card Title</h2>
    <p>Card content here</p>
    <div class="card-actions justify-end">
      <button class="btn btn-primary">Action</button>
    </div>
  </div>
</div>
```

### Badges

```html
<div class="badge badge-primary">Primary</div>
<div class="badge badge-secondary">Secondary</div>
<div class="badge badge-outline">Outline</div>
```

---

## 🎯 Success Criteria

- ✅ Invite-only authentication working
- ✅ Role-based access (admin, manager, user)
- ✅ Module-based navigation (only enabled modules visible)
- ✅ Admin can manage users, roles, and module access
- ✅ Existing Forminator functionality preserved
- ✅ Project Generator module created (scaffold)
- ✅ All UI uses DaisyUI components only
- ✅ No breaking changes to existing data
- ✅ Scalable architecture for future modules

---

## 📚 Next Steps

1. Review and approve this architecture
2. Set up local Supabase instance
3. Run migrations
4. Start Phase 1 implementation
5. Iterate weekly with demos

---

**Questions or feedback?** Let's discuss before implementation begins.
