# Forminator Odoo Sync

Cloudflare Worker that synchronizes WordPress Forminator form submissions with Odoo ERP via JSON-RPC.

## Features

- ✅ **Multi-step workflows** - Chain multiple Odoo operations (search, create, update)
- ✅ **Template system** - Dynamic placeholders for form data and previous step results
- ✅ **Field mapping** - Automatic field name translation (Forminator → Odoo)
- ✅ **Type conversion** - Smart type coercion for Odoo field requirements
- ✅ **Visual admin interface** - Drag-and-drop workflow builder with live preview
- ✅ **History tracking** - Full audit log of all submissions in Supabase
- ✅ **Error handling** - Comprehensive logging and error recovery
- ✅ **Sales Insight Explorer** - Schema-driven query engine for Odoo analytics
- 🚧 **Project Generator** - Template library for project blueprints (Iteration 2 - Template CRUD available)

## Architecture

```
WordPress (Forminator)
    ↓ webhook
Cloudflare Worker
    ↓ processes
Odoo ERP (JSON-RPC)
    ↓ logs
Supabase (history)
```

## Template Syntax

### Field References
```json
{
  "name": "${field.name}",          // Form field: name
  "email": "${field.email}",        // Form field: email
  "description": "${field.message}" // Form field: message
}
```

### Step References
```json
{
  "partner_id": "${contact.id}",      // Result from "contact" step
  "lead_id": "${lead.partner_id}"     // Nested field from "lead" step
}
```

### Composite Fields
```json
{
  "name": "${name.first-name} ${name.last-name}"
}
```

## Workflow Steps

Each step can perform:
1. **Search** - Find existing Odoo record
2. **Create** - Create new record if not found
3. **Update** - Update existing record with new data

### Example Workflow

```javascript
[
  {
    "step": "contact",
    "model": "res.partner",
    "search": {
      "domain": [[["email","=","${field.email}"]]],
      "fields": ["id", "name", "email"]
    },
    "create": {
      "name": "${field.name}",
      "email": "${field.email}",
      "phone": "${field.phone}"
    },
    "update": {
      "phone": "${field.phone}"
    }
  },
  {
    "step": "lead",
    "model": "crm.lead",
    "search": {
      "domain": [[["partner_id","=","${contact.id}"]]],
      "fields": ["id", "partner_id"]
    },
    "create": {
      "name": "New Lead - ${field.name}",
      "partner_id": "${contact.id}",
      "description": "${field.message}"
    }
  }
]
```

## Admin Interface

Access at: `https://your-worker.workers.dev/`

Features:
- 📋 Form selection and configuration
- 🎨 Visual workflow builder with drag-and-drop
- 🔍 Live domain preview
- 📝 Field mapping editor
- 📊 Submission history viewer
- 🔐 Password protected

## Environment Variables

```bash
# Odoo Connection
ODOO_URL=https://your-odoo.com
ODOO_DB=your_database
ODOO_USERNAME=your_user
ODOO_PASSWORD=your_password

# Supabase (history logging)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_service_key

# Admin Authentication
ADMIN_PASSWORD=your_secure_password

# Forminator Webhook
FORMINATOR_TOKEN=your_webhook_token
```

## Deployment

```bash
# Install dependencies
npm install

# Deploy to Cloudflare
npx wrangler deploy

# View logs
npx wrangler tail
```

## Development

```bash
# Lokale dev-server (gebruikt echte R2 bucket)
npm run dev

# Deploy naar Cloudflare Workers
npm run deploy

# Live logs bekijken
npm run logs

# Run tests
npm test
```

> `wrangler dev` gebruikt de echte `openvme-assets` R2 bucket — geen lokale mock, geen aparte dev-bucket.
> Uploads tijdens lokale ontwikkeling raken de productie-bucket.

## Project Structure

```
forminator-odoo-sync/
├── src/
│   ├── index.js              # Main worker entry point
│   ├── modules/              # Feature modules
│   │   ├── registry.js       # Module registration system
│   │   ├── forminator-sync/  # Form → Odoo sync module
│   │   ├── admin/            # Admin interface module
│   │   ├── home/             # Dashboard module
│   │   ├── profile/          # User profile module
│   │   ├── project-generator/  # 🚧 Project template library (Iteration 2)
│   │   │   ├── module.js         # Module routes and handlers
│   │   │   ├── library.js        # Template CRUD data layer
│   │   │   └── ui.js             # Template library interface
│   │   └── sales-insight-explorer/  # ⭐ Analytics query engine
│   │       ├── module.js
│   │       ├── routes.js
│   │       ├── lib/
│   │       │   ├── schema-service.js         # Odoo schema introspection
│   │       │   ├── capability-detection.js   # Model capability detection
│   │       │   ├── query-models.js           # QueryDefinition structures
│   │       │   ├── query-validator.js        # Complete validation engine
│   │       │   ├── odoo-domain-translator.js # Filter → Odoo domain
│   │       │   ├── query-executor.js         # 3-path execution engine
│   │       │   └── preset-generator.js       # Schema-driven presets
│   │       └── examples/
│   │           ├── query-examples.js
│   │           └── preset-examples.js
│   ├── actions/
│   │   ├── receive_forminator.js  # Webhook handler
│   │   ├── mappings_api.js        # Admin API endpoints
│   │   ├── history_api.js         # History viewer API
│   │   └── test_connection.js     # Odoo connection test
│   ├── config/
│   │   ├── form_mappings.js       # Field mapping configurations
│   │   └── odoo_models.js         # Odoo model schemas
│   └── lib/
│       ├── odoo.js                # Odoo JSON-RPC client
│       ├── workflow.js            # Workflow execution engine
│       ├── forminator_mapper.js   # Field mapping logic
│       ├── admin_interface.js     # Admin HTML generator
│       ├── admin_auth.js          # Password authentication
│       └── components/            # UI components
│           ├── editor.js
│           ├── field_palette.js
│           ├── login.js
│           ├── modal.js
│           ├── navbar.js
│           └── sidebar.js
├── public/
│   ├── admin.js                   # Frontend JavaScript
│   ├── admin.css                  # Admin UI styles
│   └── tailwind.min.css          # Tailwind CSS
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql # Database schema
├── SALES_INSIGHT_COMPLETE.md      # ⭐ Sales Insight Explorer documentation
├── ITERATION_1_DELIVERY.md        # Schema + Validation details
├── ITERATION_2_DELIVERY.md        # Query Execution details
├── ITERATION_3_DELIVERY.md        # Preset Generation details
├── package.json
├── wrangler.jsonc                 # Cloudflare Worker config
└── README.md
```

## Sales Insight Explorer

**NEW:** Production-ready, schema-driven query engine for Odoo analytics.

### Features

- ✅ **Zero hardcoded assumptions** - 100% schema-driven across any Odoo database
- ✅ **Automatic schema introspection** - Discovers models, fields, and capabilities
- ✅ **3 execution paths** - read_group (fast), search_read (simple), multi_pass (complex)
- ✅ **RelationTraversal** - Step-by-step relation walking (not SQL joins)
- ✅ **Capability-aware** - Respects Odoo limitations automatically
- ✅ **Preset generation** - Algorithmic starter queries (overview, trend, segmentation, activity, risk)
- ✅ **Complete validation** - Every query validated before execution
- ✅ **Honest complexity** - Heuristic estimates with disclaimers

### API Endpoints

```bash
# Get schema + capabilities + presets
GET /api/sales-insights/schema

# Validate query without executing
POST /api/sales-insights/query/validate

# Execute query
POST /api/sales-insights/query/run

# Preview query (limited results)
POST /api/sales-insights/query/preview

# Refresh schema
POST /api/sales-insights/schema/refresh
```

### Documentation

- [SALES_INSIGHT_COMPLETE.md](SALES_INSIGHT_COMPLETE.md) - Complete implementation summary
- [ITERATION_1_DELIVERY.md](ITERATION_1_DELIVERY.md) - Schema + Validation
- [ITERATION_2_DELIVERY.md](ITERATION_2_DELIVERY.md) - Query Execution
- [ITERATION_3_DELIVERY.md](ITERATION_3_DELIVERY.md) - Preset Generation

### Architecture

```
User Query
    ↓
[Validator] ← Schema + Capabilities
    ↓
[Execution Path Selector]
    ├─→ read_group (aggregations)
    ├─→ search_read (simple)
    └─→ multi_pass (complex relations)
         ↓
    Odoo JSON-RPC
         ↓
    Results + Metadata
```

---

## Project Generator

**Status:** 🚧 **In Development** - Iteration 4 Complete (Project Generation)

### Current Capabilities (Iteration 4)

- ✅ **Template Library** - View, create, edit, delete project templates
- ✅ **Blueprint Editor** - Define stages, milestones, tasks, subtasks, dependencies
- ✅ **Blueprint Validation** - Real-time validation with error messages
- ✅ **Odoo Generation** - One-click project creation to Odoo
- ✅ **Generation Lifecycle** - Server-side tracking of generation attempts (Iteration 5)
- ❌ **Generation History UI** - Not yet implemented (Iteration 5, pending)

### What You Can Do Now

Navigate to `/projects` to:
- View your project templates
- Create new templates
- Edit blueprint (stages, milestones, tasks, dependencies)
- Generate Odoo projects from templates
- Track generation status (server-side only)

### Project Generation Lifecycle (Server-side)

**Iteration 5** adds generation observability and safety:

**Generation States:**
- `in_progress` - Generation currently executing
- `completed` - Successfully created in Odoo
- `failed` - Generation failed (see error details)

**Safety Rules:**
1. **Concurrent generation blocked** - Only one generation at a time per template
2. **Duplicate prevention** - Requires explicit confirmation to regenerate
3. **Retry enabled** - Failed generations can be retried
4. **Audit trail** - Full generation model and Odoo mappings stored

**API Endpoint:**
```bash
POST /api/generate/:templateId
{
  "confirmOverwrite": true  # Optional: allow re-generation
}
```

**Response (Success):**
```json
{
  "success": true,
  "generationId": "uuid",
  "odoo_project_id": 123,
  "odoo_project_url": "https://mymmo.odoo.com/web#id=123..."
}
```

**Response (Blocked):**
```json
{
  "success": false,
  "error": "Generation already in progress for this template",
  "existingGeneration": { /* record */ }
}
```

**Note:** Generation is one-way, non-transactional. Partial failures require manual cleanup in Odoo.

### Documentation

- [docs/project-generator/](docs/project-generator/) - Complete specification and implementation logs
- [ITERATION_4_SUMMARY.md](docs/project-generator/ITERATION_4_SUMMARY.md) - Project generation details
- [ITERATION_5_IMPLEMENTATION_LOG.md](docs/project-generator/ITERATION_5_IMPLEMENTATION_LOG.md) - Lifecycle tracking details

---

## License

Proprietary - OpenVME
