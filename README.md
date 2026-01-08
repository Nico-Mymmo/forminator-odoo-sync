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
# Local development
npm run dev

# Run tests
npm test
```

## Project Structure

```
forminator-odoo-sync/
├── src/
│   ├── index.js              # Main worker entry point
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
├── package.json
├── wrangler.jsonc                 # Cloudflare Worker config
└── README.md
```

## License

Proprietary - OpenVME
