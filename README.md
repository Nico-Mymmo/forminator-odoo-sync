# Forminator Odoo Sync - Cloudflare Worker

**Cloudflare Worker voor synchronisatie van WordPress Forminator formulieren naar Odoo**

Deze worker ontvangt webhook calls van WordPress Forminator formulieren en synchroniseert de data automatisch naar Odoo. Elk formulier kan individueel geconfigureerd worden met custom field mappings en templates.

## 🎯 Functionaliteit

- ✅ **Webhook ontvanger** voor Forminator formulieren
- ✅ **Automatische field normalisatie** (`email-1`, `phone-3` → `email`, `phone`)
- ✅ **Configureerbare mappings** per formulier (JSON configuratie)
- ✅ **Template systeem** voor complexe veld combinaties
- ✅ **User-Agent verificatie** (alleen openvme.be Forminator webhooks)
- ✅ **Automatische reCAPTCHA filtering**
- ✅ **Contact check/create** in Odoo (res.partner)
- ✅ **Visual chip editor** voor field placeholders met drag & drop

## 📋 Projectstructuur

```
forminator-odoo-sync/
├── package.json              # Dependencies & scripts
├── wrangler.jsonc            # Cloudflare Worker configuratie
├── .dev.vars                 # Lokale environment variables (NIET COMMITTEN)
└── src/
    ├── index.js              # Main router met authentication
    ├── actions/              # Endpoint handlers
    │   ├── test_connection.js
    │   └── receive_forminator.js
    ├── config/               # Configuratie bestanden
    │   ├── mappings.json     # ⚙️ FORMULIER MAPPINGS (JSON - gemakkelijk te bewerken)
    │   └── form_mappings.js  # Mapping logic (niet aanpassen)
    └── lib/                  # Utilities
        ├── odoo.js           # Odoo API wrapper
        ├── utils.js          # Helper functies
        ├── log_request.js    # Request logging
        ├── forminator_mapper.js  # Field normalisatie
        └── check_create_contact.js  # Contact check/create logic
```

## ⚙️ Formulier Workflows Configureren

**Bestand: `src/config/mappings.json`** 🎯

Hier configureer je welke Forminator formulieren gesynchroniseerd moeten worden naar Odoo. Elk formulier heeft een **workflow** met één of meerdere stappen die sequentieel uitgevoerd worden.

### Workflow Structuur:

```json
{
  "11987": {
    "field_mapping": {
      "text_1": "first_name",
      "text_2": "last_name",
      "email_1": "email",
      "phone_1": "phone",
      "textarea_1": "message"
    },
    "workflow": [
      {
        "step": "contact",
        "model": "res.partner",
        "search": {
          "domain": [["email", "=", "${email}"]],
          "fields": ["id", "name", "email"]
        },
        "create": {
          "email": "${email}",
          "name": "${first_name} ${last_name}",
          "phone": "${phone}"
        },
        "update": {
          "enabled": true,
          "fields": {
            "phone": "${phone}"
          }
        }
      }
    ]
  }
}
```

### Workflow Combinaties:

De workflow bepaalt zelf wat er gebeurt op basis van wat je configureert:

**1. Alleen zoeken** (check only):
```json
{
  "step": "find_contact",
  "model": "res.partner",
  "search": {
    "domain": [["email", "=", "${email}"]],
    "fields": ["id", "name"]
  }
}
```
→ Zoekt contact, slaat ID op, skip als niet gevonden

**2. Zoeken en creëren** (check + create):
```json
{
  "step": "contact",
  "model": "res.partner",
  "search": {
    "domain": [["email", "=", "${email}"]],
    "fields": ["id", "name"]
  },
  "create": {
    "email": "${email}",
    "name": "${first_name} ${last_name}"
  }
}
```
→ Zoekt eerst, creëert alleen als niet gevonden

**3. Zoeken, creëren en updaten** (check + create + update):
```json
{
  "step": "contact",
  "model": "res.partner",
  "search": {
    "domain": [["email", "=", "${email}"]],
    "fields": ["id", "name"]
  },
  "create": {
    "email": "${email}",
    "name": "${first_name} ${last_name}"
  },
  "update": {
    "enabled": true,
    "fields": {
      "phone": "${phone}"
    }
  }
}
```
→ Zoekt eerst, creëert als niet gevonden, update als wel gevonden

**4. Alleen updaten bestaande** (check + update):
```json
{
  "step": "update_lead",
  "model": "crm.lead",
  "search": {
    "domain": [["partner_id", "=", "$contact.id"]],
    "fields": ["id", "name"]
  },
  "update": {
    "enabled": true,
    "fields": {
      "description": "${message}"
    }
  }
}
```
→ Zoekt eerst, update alleen als gevonden, skip als niet gevonden

### Custom Field Mapping (Optioneel):

Met `field_mapping` kan je Forminator veldnamen hernoemen naar logische namen voor je workflow:

```json
{
  "11987": {
    "field_mapping": {
      "text_1": "first_name",
      "text_2": "last_name",
      "email_1": "email",
      "textarea_5": "detailed_message"
    },
    "workflow": [...]
  }
}
```

**Hoe het werkt:**
1. Forminator stuurt data met technische veldnamen: `text_1`, `email_1`, `radio_1`
2. Field mapping hernoemt naar logische namen: `first_name`, `email`, `priority`
3. In de workflow gebruik je de logische naam: `"name": "${first_name} ${last_name}"`

**Log output:**
```
🔀 Field mapping: text_1 → first_name
🔀 Field mapping: text_2 → last_name
🔀 Field mapping: email_1 → email
```

### Value Mapping voor Selection Fields:

Met `value_mapping` kan je formulier waarden vertalen naar Odoo selection field waarden:

```json
{
  "11987": {
    "field_mapping": {
      "radio_1": "priority",
      "select_1": "ownership_type"
    },
    "value_mapping": {
      "priority": {
        "low": "1",
        "medium": "2",
        "high": "3",
        "_default": "2",
        "_comment": "Unknown values default to medium priority"
      },
      "ownership_type": {
        "co-owner-syndic-neighbour": "co_owner_syndic_neighbour",
        "professional-syndic": "professional_syndic",
        "tenant": "tenant",
        "other": "other"
      },
      "status": {
        "active": "active",
        "inactive": "inactive",
        "_skip": true,
        "_comment": "Remove field if value not recognized"
      }
    },
    "workflow": [...]
  }
}
```

**Hoe het werkt:**
1. Forminator stuurt: `"radio_1": "low"`
2. Field mapping hernoemt: `"priority": "low"`
3. Value mapping vertaalt: `"priority": "1"` (Odoo selection waarde)
4. Workflow ontvangt: `${priority}` = `"1"`

**Mapping gedrag (left = Forminator, right = Odoo):**
- **Direct match**: `"low": "1"` → waarde wordt gemapped naar `"1"`
- **`_default`**: `"_default": "2"` → onbekende waarden krijgen `"2"`
- **`_skip`**: `"_skip": true` → onbekende waarden = veld wordt verwijderd
- **Geen match/default/skip**: originele waarde blijft behouden

**Log output voorbeelden:**
```
🔀 Field mapping: radio_1 → priority
🎯 Value mapping: priority: "low" → "1"
🎯 Value mapping (default): priority: "unknown-value" → "2"
⏭️ Value mapping (skip): status: "pending" removed
⚠️ No value mapping found for priority: "critical" (keeping original)
```

**Wanneer gebruiken?**
- Voor Odoo selection fields (dropdown velden met vaste opties)
- Wanneer Forminator opties niet exact matchen met Odoo's interne waarden
- Voor vertaling van user-friendly labels naar technische codes
- Bij radio buttons, select dropdowns, checkboxes met voorgedefinieerde waarden
- Use `_default` voor een fallback waarde bij onbekende input
- Use `_skip: true` om velden te verwijderen bij onbekende waarden

### Multi-step Workflow Voorbeeld:

```json
{
  "12345": {
    "workflow": [
      {
        "step": "contact",
        "model": "res.partner",
        "action": "check_create",
        "search": {
          "domain": [["email", "=", "${email}"]],
          "fields": ["id", "name", "email"]
        },
        "create": {
          "email": "${email}",
          "name": "${first_name} ${last_name}",
          "phone": "${phone}"
        },
        "update": {
          "enabled": false
        }
      },
      {
        "step": "lead",
        "model": "crm.lead",
        "action": "check_create",
        "search": {
          "domain": [["partner_id", "=", "$contact.id"], ["type", "=", "opportunity"]],
          "fields": ["id", "name", "partner_id"]
        },
        "create": {
          "name": "Lead: ${first_name} ${last_name} - ${entry_time}",
          "partner_id": "$contact.id",
          "email_from": "${email}",
          "phone": "${phone}",
          "description": "${message}"
        },
        "update": {
          "enabled": true,
          "fields": {
            "description": "${message}"
          }
        }
      },
      {
        "step": "mailing_contact",
        "model": "mailing.contact",
        "action": "check_create",
        "search": {
          "domain": [["email", "=", "${email}"]],
          "fields": ["id", "email"]
        },
        "create": {
          "email": "${email}",
          "name": "${first_name} ${last_name}"
        },
        "update": {
          "enabled": false
        }
      }
    ]
  }
}
```

### Workflow Configuratie Opties:

#### Per Stap:
- **`step`**: Unieke naam voor deze stap (gebruikt voor referenties in volgende stappen)
- **`model`**: Odoo model naam (bijv. `res.partner`, `crm.lead`, `mailing.contact`)
- **`search`** (optioneel): Zoek configuratie met `domain` en `fields`
- **`create`** (optioneel): Velden om aan te maken als niet gevonden
- **`update`** (optioneel): Update configuratie met `enabled` en `fields`

De stap bepaalt zelf wat er gebeurt op basis van wat je configureert!

#### Search Configuratie (optioneel):
- **`domain`**: Odoo search domain (array van conditions)
- **`fields`**: Welke velden op te halen (altijd inclusief `"id"`)
- Als search ontbreekt, wordt altijd een nieuwe record gecreëerd

#### Create Configuratie (optioneel):
- Object met velden om aan te maken als record niet bestaat (na search)
- Gebruikt template syntax (zie hieronder)
- Als create ontbreekt maar record niet gevonden, wordt stap geskipt

#### Update Configuratie (optioneel):
- **`enabled`**: `true` of `false` - Of bestaande records geüpdatet moeten worden
- **`fields`**: Object met velden om te updaten (alleen als `enabled: true`)
- Als update ontbreekt of `enabled: false`, wordt bestaand record niet gewijzigd

### Template Syntax:

#### 1. Formulier Velden - `${fieldname}` of `${field.fieldname}`
Vervangt de waarde uit het ingestuurde formulier. Beide formaten worden ondersteund:
```json
"email": "${email}",
"name": "${field.first_name} ${field.last_name}",
"comment": "Ontvangen op ${entry_time}"
```

**Visual Chip Editor:**
In de admin interface worden field placeholders weergegeven als visuele chips:
- Drag & drop chips vanuit het veldenpalet naar inputvelden
- Chips zijn visueel onderscheidbaar van gewone tekst (blauwe badges)
- Sleep chips binnen inputvelden om de volgorde te wijzigen
- Type gewoon tekst tussen en rond chips
- Backspace/Delete om chips te verwijderen
- Type `${veldnaam}` en het wordt automatisch omgezet naar een chip

#### 2. Vorige Stap Resultaten - `$stepname.field`
Vervangt met resultaat van een eerdere workflow stap:
```json
"partner_id": "$contact.id",
"lead_id": "$lead.id",
"related_name": "$contact.name"
```

#### 3. Combinaties
Je kan beide combineren:
```json
"description": "Lead voor $contact.name (${email}) - ${message}"
```

#### 4. Null References en Many2One Fields (M2O)

**Automatische Many2One ID Extractie:**
Many2One velden in Odoo worden geretourneerd als arrays: `[id, "Display Name"]`
De workflow extraheert automatisch de ID voor gebruik in templates:

```json
// Odoo retourneert: parent_id: [59646, "ACP Alexandre le Grand"]
// Template $contact.parent_id wordt automatisch: 59646
{
  "step": "company",
  "model": "res.partner",
  "search": {
    "domain": [["id", "=", "$contact.parent_id"]],  // Gebruikt automatisch 59646
    "fields": ["id", "name", "is_company"]
  }
}
```

**Null Reference Detection:**
De workflow detecteert automatisch wanneer een step reference naar een **null/false** waarde wijst en handelt dit slim af:

**Voorbeeld: Check of contact al een bedrijf heeft (parent_id)**
```json
{
  "workflow": [
    {
      "step": "contact",
      "model": "res.partner",
      "search": {
        "domain": [
          ["email", "=", "${email}"],
          ["is_company", "=", false]  // ⚠️ Booleans blijven behouden (niet "false" als string)
        ],
        "fields": ["id", "name", "parent_id"]
      },
      "create": {
        "email": "${email}",
        "name": "${first_name} ${last_name}"
      }
    },
    {
      "step": "company",
      "model": "res.partner",
      "search": {
        "domain": [["id", "=", "$contact.parent_id"]],
        "fields": ["id", "name", "is_company"]
      },
      "create": {
        "name": "${company_name}",
        "is_company": true
      }
    },
    {
      "step": "link_contact",
      "model": "res.partner",
      "search": {
        "domain": [["id", "=", "$contact.id"]],
        "fields": ["id"]
      },
      "update": {
        "parent_id": "$company.id"
      }
    }
  ]
}
```

**Hoe het werkt:**
- Als `$contact.parent_id` **false** is (Odoo's representatie van geen relatie): 
  - Search wordt geskipt (log: `⏭️ Search skipped: domain contains null/unresolved references`)
  - Nieuw bedrijf wordt aangemaakt
  - Contact wordt gelinkt aan nieuw bedrijf
- Als `$contact.parent_id` **[59646, "Name"]** is (Many2One array):
  - ID wordt automatisch geëxtraheerd: `59646`
  - Bestaand bedrijf wordt gevonden
  - Link stap update parent_id met bestaande waarde (geen wijziging)

**Important: Boolean en Number Types in Domains:**
Booleans en numbers in search domains blijven behouden als native types (niet geconverteerd naar strings):
```json
["is_company", "=", false]      // ✅ Correct: false als boolean
["is_company", "=", "false"]    // ❌ Fout: "false" als string matcht niet
["priority", "=", 3]            // ✅ Correct: 3 als number
["priority", "=", "3"]          // ❌ Fout: "3" als string matcht niet
```

**Log output:**
```
📦 Retrieved data: {"id":59537,"name":"Tomas Raes","parent_id":[59646,"ACP Alexandre le Grand"]}
🔵 res.partner.search | args: [[["id","=",59646]]]  // ID automatisch geëxtraheerd
✅ Found existing res.partner: ID 59646
```

Of bij null reference:
```
📦 Retrieved data: {"id":123,"name":"John Doe","parent_id":false}
⏭️ Search skipped: domain contains null/unresolved references
➕ Creating new res.partner (company)
✅ Created res.partner: ID 456
📝 Updated res.partner ID 123 (parent_id: 456)
```

### Genormaliseerde Veldnamen:

De worker normaliseert automatisch Forminator veldnamen:
- `email-1`, `email_3` → `email`
- `phone-2`, `telephone-5` → `phone`
- `name-1`, `first_name-2`, `last_name-3` → `name`, `first_name`, `last_name`
- `company-1`, `company_name-2` → `company_name`
- `address-1`, `city-2`, `postal_code-3` → `address`, `city`, `postal_code`

**Je kan ook originele Forminator veldnamen gebruiken** (bv. `address_1_street_address`, `slider_1`)

### Form ID Vinden:

Het `ovme_forminator_id` veld wordt automatisch door Forminator meegestuurd. Check de logs:
```
📋 Normalized data: { "ovme_forminator_id": "11987", ... }
### Workflow Uitvoering:

1. **Sequentieel**: Stappen worden uitgevoerd in de volgorde zoals geconfigureerd
3. **Action afhankelijk**:
   - **`check_create`**: Als niet bestaat → create, als bestaat → update (indien enabled)
   - **`check_update`**: Als bestaat → update (indien enabled), als niet bestaat → skip
   - **`check_only`**: Zoek alleen, geen create/update, result beschikbaar voor volgende stappen
   - **`check_update`**: Als bestaat → update (indien enabled), als niet bestaat → skip (geen create)
### Log Output:

```
🚀 Starting workflow with 3 steps
🔧 Step: contact (res.partner) - Search:✓ Create:✓ Update:✗
✅ Found existing res.partner: ID 12345
✅ Step "contact" completed: EXISTING - ID: 12345
🔧 Step: lead (crm.lead) - Search:✓ Create:✓ Update:✓
❌ No existing crm.lead found
➕ Creating new crm.lead
✅ Created crm.lead: ID 67890
✅ Step "lead" completed: NEW - ID: 67890
🔧 Step: update_notes (some.model) - Search:✓ Create:✗ Update:✓
❌ No existing some.model found
⏭️ Step skipped - no record found and no create configured
🎉 Workflow completed successfully
```Step: lead (crm.lead) - Action: check_create
➕ Creating new crm.lead
✅ Created crm.lead: ID 67890
✅ Step "lead" completed: NEW - ID: 67890
🎉 Workflow completed successfully
```

## 🚀 Setup & Deployment

### 1. Install Dependencies

```bash
npm install
```

### Request Flow

```
1. Forminator stuurt webhook POST
   ↓
2. Authenticatie check (token + User-Agent)
   ↓
3. Parse JSON body
   ↓
4. Log incoming request (met redacted headers)
   ↓
5. Normaliseer Forminator veldnamen (email-1 → email)
   ↓
6. Check ovme_forminator_id in mappings.json
   ↓
7. Als geen mapping → Skip Odoo sync (alleen log)
   ↓
8. Als wel mapping → Start workflow
### 3. Configureer Formulier Workflows

**Open `src/config/mappings.json` en configureer je workflow:**

```json
{
  "11987": {
    "workflow": [
      {
        "step": "contact",
        "model": "res.partner",
        "action": "check_create",
        "search": {
          "domain": [["email", "=", "${email}"]],
          "fields": ["id", "name", "email"]
        },
        "create": {
          "email": "${email}",
          "name": "${email}",
          "phone": "${phone}",
          "comment": "VME Check - ${entry_time}"
        },
        "update": {
          "enabled": false
        }
      }
    ]
  }
}
```

**Na elke wijziging: deploy opnieuw** (`wrangler deploy`)

Forminator velden worden automatisch genormaliseerd:
- `email-1`, `email_3` → `email`
- `phone-2` → `phone`  
- `first_name-1`, `last_name-2` → `first_name`, `last_name`
- Speciale velden blijven origineel: `address_1_street_address`, `slider_1`, etc.
- `g-recaptcha-response` wordt automatisch gefilterd

### Template Processing

Templates gebruiken twee syntaxen:

**Formulier data** - `${fieldname}`:
```json
"comment": "Lead van ${first_name} ${last_name} op ${entry_time}"
```

**Vorige stappen** - `$stepname.field`:
```json
"partner_id": "$contact.id",
"description": "Contact $contact.name heeft interesse in ${product}"
```bash
npm run dev
```

De worker draait nu op `http://127.0.0.1:8787`

### 5. Deploy naar Cloudflare

```bash
wrangler deploy
```

### 6. Secrets Configureren (Production)

Na eerste deploy, zet de secrets op Cloudflare:

```powershell
echo "mymmo-main-11883993" | wrangler secret put DB_NAME
echo "2" | wrangler secret put UID
echo "your-api-key" | wrangler secret put API_KEY
echo "your-auth-token" | wrangler secret put AUTH_TOKEN
```

### 7. Configureer Forminator Webhook

In WordPress Forminator:
1. Open je formulier settings
2. Ga naar "Integrations" → "Webhook"
3. Vul in:
   - **URL**: `https://forminator-sync.openvme-odoo.workers.dev/?action=receive_forminator&token=openvmeform`
   - **Method**: POST
   - **Format**: JSON

### Live Logs Bekijken

```bash
wrangler tail
```

### Log Output

De worker logt uitgebreid elke workflow stap:
```
📨 Incoming request from: forminator
🔄 Mapped: email_1 → email
🗑️ Filtered out: g_recaptcha_response
📋 Normalized data: { "email": "...", ... }
🔧 Form 11987 has 3 workflow steps
🚀 Starting workflow with 3 steps
🔧 Step: contact (res.partner) - Action: check_create
✅ Found existing res.partner: ID 12345
✅ Step "contact" completed: EXISTING - ID: 12345
🔧 Step: lead (crm.lead) - Action: check_create
➕ Creating new crm.lead
✅ Created crm.lead: ID 67890
✅ Step "lead" completed: NEW - ID: 67890
🔧 Step: mailing_contact (mailing.contact) - Action: check_create
📝 Updated mailing.contact ID 99999
✅ Step "mailing_contact" completed: UPDATED - ID: 99999
🎉 Workflow completed successfully
```lleen toegang als User-Agent `openvme.be` bevat
- Geblokkeerd voor alle andere sources
- Gebruik deze in Forminator webhooks

### 2. Admin Token (Algemeen)

**Authorization header**: `Bearer <AUTH_TOKEN>`
- Algemene toegang zonder User-Agent check
- Gebruik dit voor testing en andere integraties

## 📊 Monitoring & Debugging

### Live Logs Bekijken

```bash
wrangler tail
```

### Log Output

De worker logt uitgebreid:
```
📨 Incoming request from: forminator
🔄 Mapped: email_1 → email
🗑️ Filtered out: g_recaptcha_response
📋 Normalized data: { "email": "...", ... }
🔧 Form 11987 mapped to model: res.partner
🔗 Template: comment = "VME Check - ${entry_time}" → "VME Check - 2025-12-12 09:24:26"
✅ Contact: NEW - ID: 12345 - John Doe
```

## 📚 Hoe werkt het?

### Request Flow

```
1. Forminator stuurt webhook POST
   ↓
### Nieuwe Formulier Toevoegen

1. **Vind Form ID**: Check wrangler tail logs na een test submission
   ```
   📋 Normalized data: { "ovme_forminator_id": "11987", ... }
   ```

2. **Bekijk beschikbare velden**: Zie welke genormaliseerde velden beschikbaar zijn in de logs

3. **Ontwerp je workflow**: Bepaal welke stappen nodig zijn
   - Welke Odoo models moet je aanmaken/updaten?
   - In welke volgorde?
   - Welke dependencies tussen stappen?

4. **Voeg workflow toe** in `src/config/mappings.json`:
   ```json
   {
     "11987": { ... },
     "12345": {
       "workflow": [
         {
           "step": "contact",
           "model": "res.partner",
           "action": "check_create",
           "search": {
             "domain": [["email", "=", "${email}"]],
             "fields": ["id", "name"]
           },
           "create": {
             "email": "${email}",
             "name": "${first_name} ${last_name}"
           },
           "update": { "enabled": false }
         }
       ]
     }
   }
   ```

5. **Deploy**: `wrangler deploy`

6. **Test**: Submit formulier en check logs met `wrangler tail`

Forminator velden worden automatisch genormaliseerd:
- `email-1`, `email_3` → `email`
- `phone-2` → `phone`  
- `first_name-1`, `last_name-2` → `first_name`, `last_name`
- Speciale velden blijven origineel: `address_1_street_address`, `slider_1`, etc.
- `g-recaptcha-response` wordt automatisch gefilterd

### Template Processing

Templates gebruiken `${fieldname}` syntax:
```javascript
"comment": "Lead van ${first_name} ${last_name} op ${entry_time}"
```
Wordt:
```
"comment": "Lead van John Doe op 2025-12-12 09:24:26"
```

### Nieuwe Formulier Toevoegen

1. **Vind Form ID**: Check wrangler tail logs na een test submission
2. **Bekijk velden**: Zie welke genormaliseerde velden beschikbaar zijn
3. **Voeg mapping toe** in `src/config/mappings.json`:
   ```json
   {
     "11987": { ... },
     "12345": {
       "model": "crm.lead",
       "fields": {
         "name": "Nieuwe lead: ${name}",
         "email_from": "${email}",
         "phone": "${phone}"
       }
     }
   }
   ```
4. **Deploy**: `wrangler deploy`
5. **Test**: Submit formulier en check logs
4. **Deploy**: `wrangler deploy`
5. **Test**: Submit formulier en check logs

### Test Connection

Test of de Odoo verbinding werkt:

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "https://forminator-sync.openvme-odoo.workers.dev?action=test_connection&token=your-auth-token" `
    -Method Post `
    -Headers @{"Content-Type"="application/json"} `
    -Body '{}'
```

**Response:**
```json
{
  "success": true,
  "message": "Odoo connection successful",
  "partners": [...],
  "environment": {
    "DB_NAME": "mymmo-main-11883993",
    "UID": "2"
  }
}
```

## 🔧 Odoo API Wrapper

De `src/lib/odoo.js` bevat helper functies voor Odoo API calls:
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
