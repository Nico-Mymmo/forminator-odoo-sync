# Forminator to Odoo Sync

Cloudflare Worker that synchronizes WordPress Forminator form submissions to Odoo CRM.

## Features

- 🔄 Real-time form submission sync to Odoo
- 🔐 Secure webhook authentication
- 📝 Support for multiple form types (contact, newsletter, etc.)
- 🎯 Automatic lead creation in Odoo CRM
- 📊 Compact one-line logging for easy debugging
- ⚡ Built on Cloudflare Workers for global edge performance

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.dev.vars.example` to `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your values:

```env
DB_NAME=your-odoo-database-name
UID=your-odoo-user-id
API_KEY=your-odoo-api-key
AUTH_TOKEN=your-webhook-auth-token
```

### 3. Set Production Secrets

```bash
wrangler secret put DB_NAME
wrangler secret put UID
wrangler secret put API_KEY
wrangler secret put AUTH_TOKEN
```

### 4. Deploy

```bash
npm run deploy
```

## Usage

### Webhook Endpoint

**URL:** `https://your-worker.workers.dev/webhook?form_type=contact`

**Method:** `POST`

**Authentication:** Bearer token or query parameter `?token=your-auth-token`

**Headers:**
```
Authorization: Bearer your-auth-token
Content-Type: application/json
```

### Contact Form Example

```json
{
  "form_type": "contact",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+32 123 456 789",
  "company": "Example Corp",
  "message": "I'm interested in your services",
  "form_id": "123",
  "entry_id": "456"
}
```

### Newsletter Form Example

```json
{
  "form_type": "newsletter",
  "email": "subscriber@example.com",
  "name": "Jane Doe",
  "consent": true
}
```

## Development

### Local Development

```bash
npm run dev
```

### View Logs

```bash
npm run tail
```

### Test Webhook Locally

```bash
curl -X POST http://localhost:8787/webhook?form_type=contact \
  -H "Authorization: Bearer your-auth-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "message": "Test message"
  }'
```

## Adding New Form Types

1. Create a new handler in `src/actions/yourFormType.js`:

```javascript
import { create } from "../lib/odoo.js";

export async function handleYourForm({ env, data }) {
  // Your form processing logic
  const result = await create(env, {
    model: "your.model",
    values: { /* ... */ }
  });
  
  return { success: true, id: result };
}
```

2. Register handler in `src/index.js`:

```javascript
import { handleYourForm } from "./actions/yourFormType.js";

const FORM_HANDLERS = {
  // ...
  your_form: handleYourForm
};
```

## Odoo Custom Fields

Make sure these custom fields exist in your Odoo instance:

### crm.lead
- `x_studio_form_id` (Char)
- `x_studio_entry_id` (Char)
- `x_studio_source` (Char)

### res.partner
- `x_studio_newsletter_consent` (Boolean)
- `x_studio_newsletter_source` (Char)
- `x_studio_newsletter_date` (Date)

## Logging

The worker uses compact one-line logging:

```
🔵 14:32:15 | mymmo-main-11883993 | crm.lead.create | args: [{"name":"Contact form...
✅ 14:32:16 | mymmo-main-11883993 | crm.lead.create | 200 | 1234
❌ 14:32:20 | mymmo-main-11883993 | crm.lead.create | ERROR: Access denied
```

## License

MIT
