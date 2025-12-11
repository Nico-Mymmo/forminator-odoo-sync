# Cloudflare Worker Template - Odoo Integration

**Basissetup voor Cloudflare Workers met Odoo integratie**

Dit is een standaard template project voor het bouwen van Cloudflare Workers die integreren met Odoo. De structuur en setup is identiek aan `odoo-proxy` en vormt de basis voor alle Odoo-gerelateerde worker projecten.

## 📋 Projectstructuur

Dit project volgt de **standaard Cloudflare Worker structuur** zoals gebruikt in alle OpenVME worker projecten:

```
project/
├── package.json              # Dependencies & scripts (identiek aan odoo-proxy)
├── wrangler.jsonc            # Cloudflare Worker configuratie
├── vitest.config.js          # Test configuratie
├── .gitignore                # Git ignore (standaard template)
├── .dev.vars.example         # Template voor lokale environment variables
├── .dev.vars                 # Lokale environment variables (NIET COMMITTEN)
└── src/
    ├── index.js              # Main router met action mapping
    ├── actions/              # Action handlers (business logic)
    │   └── test_connection.js
    └── lib/                  # Gedeelde utilities
        ├── odoo.js           # Odoo API wrapper
        └── utils.js          # Helper functies
```

## 🎯 Gebruik als Template

### Dit project gebruiken voor nieuwe Odoo Workers:

1. **Kopieer de volledige folder structuur**
2. **Pas `wrangler.jsonc` aan**: Wijzig `name` naar je nieuwe project naam
3. **Pas `package.json` aan**: Wijzig `name` naar je nieuwe project naam  
4. **Verwijder bestaande actions** in `src/actions/` (behalve `test_connection.js`)
5. **Maak nieuwe actions** voor je specifieke use case
6. **Update `src/index.js`**: Registreer je nieuwe actions in het `ACTIONS` object

### Bestaande projecten uniformiseren:

Gebruik dit project als referentie om andere workers naar dezelfde structuur te migreren:
- Kopieer `package.json` dependencies en scripts
- Kopieer `wrangler.jsonc` structuur (pas `name` aan)
- Kopieer `vitest.config.js`
- Kopieer `.gitignore`
- Zorg dat `src/lib/odoo.js` en `src/lib/utils.js` identiek zijn
- Herstructureer `src/index.js` naar hetzelfde routing patroon

## 🚀 Setup & Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Lokale Development Environment

Kopieer `.dev.vars.example` naar `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

Vul `.dev.vars` in met je Odoo credentials:

```env
DB_NAME=mymmo-main-11883993
UID=2
API_KEY=your-odoo-api-key-here
AUTH_TOKEN=your-webhook-auth-token-here
```

### 3. Test Lokaal

```bash
npm run dev
```

De worker draait nu op `http://127.0.0.1:8787`

### 4. Test Connection

Test of de Odoo verbinding werkt (lokaal of production):

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8787?action=test_connection" `
    -Method Post `
    -Headers @{"Authorization"="Bearer your-auth-token"; "Content-Type"="application/json"} `
    -Body '{}'
```

**Postman:**
```
POST http://127.0.0.1:8787?action=test_connection
Authorization: Bearer your-auth-token
Content-Type: application/json

Body (raw JSON): {}
```

Als dit succesvol is, zie je 3 partners uit Odoo en een environment check.

### 5. Deploy naar Cloudflare

**Eerst:** Cloudflare authenticatie (eenmalig)

**Optie A - API Token (Aanbevolen):**
```powershell
$env:CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
wrangler deploy
```

**Optie B - OAuth Login:**
```bash
wrangler login
wrangler deploy
```

### 6. Secrets Configureren (Production)

Na eerste deploy, zet de secrets op Cloudflare:
## 📚 Hoe werkt het?

### Routing Systeem

Alle requests gaan via `src/index.js` die acties routeert op basis van de `action` parameter:

```javascript
// In src/index.js
const ACTIONS = {
  test_connection: testConnection,
  contact_form: handleContactForm,
  newsletter_form: handleNewsletterForm,
};
```

### Request Flow

```
POST https://worker.dev?action=test_connection
  ↓
1. Valideer Authorization header (Bearer token)
  ↓
2. Parse JSON body
  ↓
3. Zoek action handler in ACTIONS object
  ↓
4. Voer action uit → Odoo API call
  ↓
5. Return Response object met JSON
```

### Nieuwe Action Toevoegen

**1. Maak een nieuwe action file:** `src/actions/myAction.js`

```javascript
import { searchRead, create } from "../lib/odoo.js";

export async function myAction({ env, data, request, ctx }) {
  // Je business logic hier
  const result = await searchRead(env, {
    model: "res.partner",
    domain: [["email", "=", data.email]],
    fields: ["id", "name"],
    limit: 1
  });

  return new Response(JSON.stringify({
    success: true,
    data: result
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
```

**2. Registreer in `src/index.js`:**

```javascript
import { myAction } from "./actions/myAction.js";

const ACTIONS = {
  // ...bestaande actions
  my_action: myAction,
};
```

**3. Test:**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8787?action=my_action" `
    -Method Post `
    -Headers @{"Authorization"="Bearer your-token"; "Content-Type"="application/json"} `
    -Body '{"email":"test@example.com"}'
```

## 🔧 Development

### Lokaal Testen

```bash
npm run dev
```

Worker draait op `http://127.0.0.1:8787`

### Live Logs Bekijken

```bash
wrangler tail
```

Of met pretty formatting:

```bash
wrangler tail --format pretty
```

### Secrets Beheren

```bash
# Lijst alle secrets
wrangler secret list

## 📖 Odoo Library Functies

Het `src/lib/odoo.js` bestand bevat alle Odoo API wrappers:

### `executeKw(env, options)`
Laag-niveau Odoo RPC call. Gebruikt door andere functies.

### `search(env, options)`
Zoek record IDs:
```javascript
const ids = await search(env, {
  model: "res.partner",
  domain: [["email", "=", "test@example.com"]],
  limit: 10
});
```

### `read(env, options)`
Lees specifieke record IDs:
```javascript
const records = await read(env, {
  model: "res.partner",
  ids: [1, 2, 3],
  fields: ["name", "email"]
});
```

### `searchRead(env, options)`
Zoek en lees in één call (meest gebruikt):
```javascript
const partners = await searchRead(env, {
  model: "res.partner",
  domain: [["is_company", "=", true]],
  fields: ["id", "name", "email", "phone"],
  limit: 50,
  order: "name asc"
});
```

### `searchReadAll(env, options)`
Fetch alle records (paginated, 500 per batch):
```javascript
const allPartners = await searchReadAll(env, {
  model: "res.partner",
  domain: [],
  fields: ["id", "name"],
  order: "id asc"
});
```

### `create(env, options)`
Maak nieuw record:
```javascript
const id = await create(env, {
  model: "crm.lead",
  values: {
    name: "New Lead",
    email_from: "lead@example.com",
    phone: "+32 123 456 789"
  }
});
```

### `update(env, options)`
Update bestaand record:
```javascript
await update(env, {
  model: "res.partner",
  ids: [123],
  values: {
    phone: "+32 987 654 321"
  }
});
```

### `unlink(env, options)`
Verwijder records:
```javascript
await unlink(env, {
  model: "crm.lead",
  ids: [456]
});
```

## 🔍 Utility Functies

In `src/lib/utils.js`:

- `stripHtml(html)` - Verwijder HTML tags uit string
- `m2oId(val)` - Extract ID uit many2one field (array of number)
- `toLocalTimestamp(date)` - UTC naar Brussels timezone
- `utcToLocalTimestamp(str)` - UTC string naar local string
- `localToUtcTimestamp(str)` - Local string naar UTC string

## 🚨 Logging Pattern

Alle Odoo calls gebruiken compact one-line logging:

```
🔵 14:32:15 | mymmo-main-11883993 | crm.lead.create | args: [{"name":"Contact form...
✅ 14:32:16 | mymmo-main-11883993 | crm.lead.create | 200 | 1234
❌ 14:32:20 | mymmo-main-11883993 | crm.lead.create | ERROR: Access denied
```

Format: `[emoji] [tijd] | [database] | [model.method] | [info]`

## 📋 Checklist: Nieuw Project Opzetten

- [ ] Kopieer folder structuur
- [ ] Wijzig `name` in `wrangler.jsonc`
- [ ] Wijzig `name` in `package.json`
- [ ] Run `npm install`
- [ ] Maak `.dev.vars` aan (kopieer uit `.dev.vars.example`)
- [ ] Vul Odoo credentials in `.dev.vars`
- [ ] Test lokaal: `npm run dev`
- [ ] Test connection: `?action=test_connection`
- [ ] Verwijder voorbeeld actions (behalve test_connection)
- [ ] Maak je eigen actions
- [ ] Registreer actions in `src/index.js`
- [ ] Deploy: `wrangler deploy`
- [ ] Zet secrets: zie "Secrets Configureren" sectie
- [ ] Test production endpoint

## 📋 Checklist: Bestaand Project Uniformiseren

- [ ] Backup maken van bestaand project
- [ ] Kopieer `package.json` (pas `name` aan)
- [ ] Run `npm install`
- [ ] Kopieer `wrangler.jsonc` (pas `name` aan)
- [ ] Kopieer `vitest.config.js`
- [ ] Kopieer `.gitignore`
- [ ] Vervang `src/lib/odoo.js` met template versie
- [ ] Vervang `src/lib/utils.js` met template versie
- [ ] Herstructureer `src/index.js` naar action-based routing
- [ ] Zet alle bestaande endpoints om naar actions in `src/actions/`
- [ ] Test lokaal: `npm run dev`
- [ ] Deploy: `wrangler deploy`
- [ ] Verifieer alle endpoints nog werken

---

**Template Version:** 1.0  
**Gebaseerd op:** odoo-proxy worker setup  
**Laatst bijgewerkt:** December 2025eturn { success: true, id: result };
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
