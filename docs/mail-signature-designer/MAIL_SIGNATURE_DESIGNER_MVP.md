# Mail Signature Designer – MVP

**Branch:** `mail-signature`  
**Route:** `/mail-signatures`  
**Module code:** `mail_signature_designer`

---

## 1. Executive Summary

Mail Signature Designer is een interne OpenVME module waarmee beheerders een HTML e-mailhandtekening kunnen ontwerpen en in bulk kunnen pushen naar alle Google Workspace gebruikers via domain-wide delegation.

---

## 2. Scope

| In scope | Buiten scope |
|----------|-------------|
| Globale configuratie (één template per domein) | Gebruiker-specifieke templates |
| Realtime preview in iframe | WYSIWYG drag-and-drop editor |
| Bulk push via Gmail Settings API | Scheduled / automatische pushes |
| Push log met success/fail tracking | E-mail notificaties |
| Directory-zoeken via Admin SDK | Alias/group signaturemanagement |

---

## 3. Architectuur

```
src/modules/mail-signature-designer/
├── module.js                   # module metadata + routes import
├── routes.js                   # HTTP handlers (7 eindpunten)
├── ui.js                       # Full-page HTML (tabbed interface)
└── lib/
    ├── supabaseClient.js        # singleton Supabase admin client
    ├── signature-store.js       # DB access (config + logs)
    ├── signature-compiler.js    # pure compile engine → { html, warnings }
    ├── directory-client.js      # Google Admin Directory API
    └── gmail-signature-client.js # Gmail Settings API

supabase/migrations/
└── 20260220000000_mail_signature_designer_v1.sql
```

### Lagen

```
HTTP Request
    ↓
routes.js  (auth via validateSession in index.js)
    ↓
lib/*.js   (signature-store, compiler, directory-client, gmail-signature-client)
    ↓
Supabase DB  +  Google APIs
```

---

## 4. Database Schema

### `signature_config`

| Kolom | Type | Notitie |
|-------|------|---------|
| `id` | `uuid pk` default `gen_random_uuid()` | Vaste waarde: `GLOBAL_SIGNATURE_ID` |
| `config` | `jsonb not null` | Template-velden (zie §6) |
| `updated_at` | `timestamptz` | Auto-update trigger |
| `updated_by` | `uuid` | User UUID van de editor |

**Constraint:** `CREATE UNIQUE INDEX signature_config_singleton ON signature_config ((true))` — maximaal één rij.

**RLS:** permissive `FOR ALL TO public USING (true) WITH CHECK (true)`

### `signature_push_log`

| Kolom | Type | Notitie |
|-------|------|---------|
| `id` | `uuid pk` | |
| `actor_email` | `text` | Beheerder die de push uitvoerde |
| `pushed_at` | `timestamptz` | Auto-default NOW() |
| `target_user_email` | `text` | Google Workspace gebruiker |
| `sendas_email` | `text` | Primaire sendAs e-mail |
| `success` | `boolean` | |
| `error_message` | `text` | Null bij succes |
| `html_hash` | `text` | FNV-1a 32-bit hex hash van gegenereerde HTML |
| `metadata` | `jsonb` | Bijv. `{ warnings: [...] }` |

**RLS:** zelfde permissive policy.

---

## 5. API Eindpunten

| Methode | Pad | Omschrijving |
|---------|-----|--------------|
| `GET` | `/mail-signatures/` | UI (full-page HTML) |
| `GET` | `/mail-signatures/api/config` | Laad globale config |
| `PUT` | `/mail-signatures/api/config` | Sla globale config op |
| `GET` | `/mail-signatures/api/directory?search=` | Zoek workspace gebruikers |
| `POST` | `/mail-signatures/api/preview` | Compileer preview HTML |
| `POST` | `/mail-signatures/api/push` | Push naar een of meer gebruikers |
| `GET` | `/mail-signatures/api/logs?limit=` | Recente push logs |

Alle JSON-responses volgen het formaat: `{ success: boolean, data?: any, error?: string }`.

---

## 6. Compile Logic

`signature-compiler.js::compileSignature(config, userData)` → `{ html, warnings }`

### Config-velden

| Veld | Type | Beschrijving |
|------|------|-------------|
| `logoUrl` | string | URL van brandlogo |
| `brandName` | string | Weergegeven naam |
| `websiteUrl` | string | Link op merknaam |
| `primaryColor` | string | Kleur van naam/links |
| `showPhoto` | bool | Profielfoto tonen |
| `showCTA` | bool | CTA-knop tonen |
| `ctaText` | string | Knoptekst |
| `ctaUrl` | string | Knop-URL |
| `showBanner` | bool | Bannerafbeelding tonen |
| `bannerImageUrl` | string | Afbeelding-URL |
| `bannerLinkUrl` | string | Klikbare link van banner |
| `showDisclaimer` | bool | Disclaimer tonen |
| `disclaimerText` | string | Disclaimer HTML-tekst |

### UserData-placeholders

| Placeholder | Bron |
|-------------|------|
| `{{fullName}}` | `userData.fullName` |
| `{{roleTitle}}` | `userData.roleTitle` |
| `{{email}}` | `userData.email` |
| `{{phone}}` | `userData.phone` |
| `{{photoUrl}}` | `userData.photoUrl` |

Onbekende placeholders genereren een warning maar blokkeren de push niet.

---

## 7. Push Flow

```
POST /api/push
  { targetUserEmails: string[] | "all", userDataOverrides?: {...} }

1. Laad globale config (signature-store)
2. Als targetUserEmails === "all": haal alle gebruikers op via Directory API
3. Per batch van 5 (PUSH_CONCURRENCY):
   a. compileSignature(config, { email, ...overrides })
   b. getPrimarySendAs(env, email) → sendAsEmail
   c. gmail.sendAs.update(sendAsEmail, { signature: html })
   d. logPush(env, { success: true, html_hash, ... })
4. Retourneer resultaten per gebruiker
```

---

## 8. Securitymodel

| Aspect | Implementatie |
|--------|--------------|
| Module auth | `validateSession()` in `index.js` vóór routeafhandeling |
| Supabase RLS | Permissive `TO public` — beschermd door Workers auth layer |
| Google API | Service account met domain-wide delegation, scopes: `gmail.settings.basic` + `admin.directory.user.readonly` |
| Service account | Gitignored JSON-bestand, nooit in code of VCS |
| CF Secret | `GOOGLE_SERVICE_ACCOUNT_JSON` als Cloudflare Worker secret (stringified JSON) |

---

## 9. Benodigde Environment Variables

| Variabele | Beschrijving |
|-----------|-------------|
| `SUPABASE_URL` | Al aanwezig in wrangler.jsonc |
| `SUPABASE_SERVICE_ROLE_KEY` | Al aanwezig |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Nieuwe Cloudflare secret — stringified JSON van service account |

---

## 10. Acceptatiecriteria

- [ ] Admin kan een handtekening samenstellen en opslaan
- [ ] Preview toont realtime gegenereerde HTML in iframe
- [ ] Gebruikerslijst laadt via Directory API
- [ ] Push naar één gebruiker slaagt en is zichtbaar in logs
- [ ] Push naar alle gebruikers verwerkt in batches van 5
- [ ] Mislukte pushes registreren de foutmelding in `signature_push_log`
- [ ] Module zichtbaar in navigatie na DB-migratie
