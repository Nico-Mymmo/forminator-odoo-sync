# Mail Signature Designer – Implementation Log

---

## Fase 0 · Voorbereiding (branch + test)

### Stap 1 – Branch aangemaakt

```
git checkout -b mail-signature
```

Branch: `mail-signature`  
Commit: `1849a73` (scaffold + docs)

### Stap 2 – Gmail test script

Bestand: `scripts/test-gmail-signature.js`  
Bevestigd werkend:

```
primary sendAs email: nico@mymmo.com
oude signature lengte: 116
success: signature updated
```

Pakket: `googleapis@171.4.0` geïnstalleerd.

### Stap 3 – Module folder scaffold

Aangemaakt: `src/modules/mail-signature-designer/`  
Docs scaffold in: `docs/mail-signature-designer/`  
`docs/README.md` bijgewerkt.

`.gitignore` uitgebreid: `src/modules/mail-signature-designer/*.json` (service account bescherming).

---

## Fase 1 · Architectuuranalyse

**Fase 0 analyse**: `docs/mail-signature-designer/FASE_0_ARCHITECTURE_ANALYSIS.md`

Gelezen bronbestanden:
- `src/index.js` (500 regels)
- `src/modules/registry.js`
- `src/modules/event-operations/module.js`
- `src/modules/event-operations/routes.js` (1425 regels)
- `src/modules/project-generator/module.js`
- `supabase/migrations/20260211000000_event_operations_v1.sql`
- `src/lib/components/layout.js`
- `src/lib/components/navigation.js`
- `src/modules/event-operations/ui.js`

**Architectuurbeslissingen** (goedgekeurd door gebruiker):

1. Full-page HTML template (geen `layoutHTML`-wrapper)
2. `getSupabaseAdminClient(env)` singleton uit `event-operations`
3. Compile engine in `lib/signature-compiler.js` (pure functie)
4. Singleton config via `UNIQUE INDEX` + vaste `GLOBAL_SIGNATURE_ID`
5. RLS: expliciete permissive policies `TO public`

---

## Fase 2 · Implementatie

### Stap 4 – Databasemigratie

Bestand: `supabase/migrations/20260220000000_mail_signature_designer_v1.sql`

Inhoud:
- `signature_config` tabel + singleton UNIQUE INDEX
- `signature_push_log` tabel
- `update_updated_at()` trigger
- RLS permissive policies (beide tabellen)
- Module INSERT (`code='mail_signature_designer'`, route `/mail-signatures`, icon `mail`, display_order 7)
- Auto-grant admin via CROSS JOIN pattern

### Stap 5 – lib/supabaseClient.js

Singleton Supabase admin client, identiek aan `event-operations`-patroon.

### Stap 6 – lib/signature-store.js

Exports: `GLOBAL_SIGNATURE_ID`, `getConfig`, `upsertConfig`, `logPush`, `getLogs`

### Stap 7 – lib/signature-compiler.js

Pure compile engine:
- Tabel-gebaseerde HTML, inline styles, max-width 600px
- Placeholders: `{{fullName}}`, `{{roleTitle}}`, `{{email}}`, `{{phone}}`, `{{photoUrl}}`
- Conditionele secties: foto, CTA, banner, disclaimer
- Retourneert `{ html, warnings }`

### Stap 8 – lib/directory-client.js

Google Admin Directory API wrapper:
- `listUsers(env, search?)` → `[{ email, fullName, givenName, familyName, photoUrl }]`
- Auth via `GOOGLE_SERVICE_ACCOUNT_JSON` (stringified) + domain-wide delegation
- Subject: `nico@mymmo.com` (domeinadmin)

### Stap 9 – lib/gmail-signature-client.js

Gmail Settings API wrapper:
- `getPrimarySendAs(env, userEmail)` → `{ sendAsEmail, currentSignature }`
- `updateSignature(env, userEmail, signatureHtml)` → `{ sendAsEmail }`
- Auth via JWT per geïmpersoneerd account

### Stap 10 – routes.js

7 HTTP handlers conform `event-operations`-patroon:
- `GET /` → UI
- `GET /api/config`, `PUT /api/config` — config CRUD
- `GET /api/directory?search=` — gebruikers zoeken
- `POST /api/preview` → `{ html, warnings }`
- `POST /api/push` → batch push (concurrency 5) + log
- `GET /api/logs` — push log

Push flow: config laden → gebruikers resolven → per batch compileren + pushen → alles loggen.

### Stap 11 – ui.js

Full-page HTML (`mailSignatureDesignerUI(user)`):
- **Builder tab**: configform links, iframe-preview rechts, sample user inputs, warnings
- **Push tab**: real-time gebruikerszoeken, checkboxes, select-all, push button + resultaattabel
- **Logs tab**: push log tabel met timestamp, actor, doelgebruiker, sendAs, status, fout

Afhankelijkheden: DaisyUI 4.12.14, Tailwind CDN, Lucide icons (CDN).

### Stap 12 – module.js

```js
export default {
  code: 'mail_signature_designer',
  name: 'Signature Designer',
  route: '/mail-signatures',
  icon: 'mail',
  isActive: true,
  routes
};
```

### Stap 13 – registry.js bijgewerkt

`import mailSignatureDesignerModule` toegevoegd en in `MODULES`-array geplaatst.

---

## Openstaande acties voor deployment

1. **CF Secret toevoegen**:
   ```
   wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
   ```
   Plak de volledige inhoud van `operations-signature-manager-fa6abb16c8ae.json`.

2. **Migratie uitvoeren** in Supabase (SQL Editor of via `supabase db push`).

3. **Service account** moet domain-wide delegation hebben voor scopes:
   - `https://www.googleapis.com/auth/gmail.settings.basic`
   - `https://www.googleapis.com/auth/admin.directory.user.readonly`

4. **Testen** via `GET /mail-signatures` in browser (na login).
