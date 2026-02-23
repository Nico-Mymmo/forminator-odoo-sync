# Google Workspace Integration

## Purpose

The mail-signature module uses Google Workspace APIs to:

1. **Read** domain user profiles (name, photo) via the Admin Directory API — used to populate signature data at push time.
2. **Write** Gmail signatures via the Gmail Settings API — the end result of every push operation.

Both APIs are called from Cloudflare Workers using native `fetch` and the Web Crypto API. There is no dependency on the `googleapis` Node.js SDK.

---

## Architecture Overview

```
Cloudflare Worker (routes.js)
  │
  ├── fetchPushDataSources()
  │     ├── listUsers()           → directory-client.js  → Admin Directory API
  │     └── [Odoo + Supabase]
  │
  └── pushOneUser()
        ├── mergeSignatureLayers() → signature-merge-engine.js
        ├── compileSignature()     → signature-compiler.js
        └── updateSignature()     → gmail-signature-client.js → Gmail Settings API
```

Both `directory-client.js` and `gmail-signature-client.js` implement the same JWT flow independently, each scoped to their respective API.

---

## Google Cloud Configuration

### Project

- **Project ID:** `operations-signature-manager`
- **Project name:** operations-signature-manager

### APIs enabled

| API | Used for |
|---|---|
| Gmail API | `users.settings.sendAs.list` + `users.settings.sendAs.update` |
| Admin SDK API (Directory) | `users.list` + `users.get` (read-only) |

### Service account

- **Email:** `signature-manager@operations-signature-manager.iam.gserviceaccount.com`
- **Client ID:** `114736715876839968786`
- **Key type:** RSA 2048 (PKCS8 PEM, stored in JSON key file)

The service account has no GCP IAM roles. Its access to Google Workspace is governed entirely by **domain-wide delegation**, not by GCP IAM.

### Domain-wide delegation

Domain-wide delegation is configured in the Google Workspace Admin Console under:  
**Security → Access and data controls → API controls → Domain-wide delegation**

The service account client ID (`114736715876839968786`) is authorised with the following OAuth scopes:

| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/gmail.settings.basic` | Read and write Gmail send-as settings (signatures) |
| `https://www.googleapis.com/auth/admin.directory.user.readonly` | Read user profiles from the domain directory |

Domain-wide delegation allows the service account to impersonate any domain user. The scope list in the Admin Console must match exactly what is requested in the JWT.

---

## Environment Variables

### `GOOGLE_SERVICE_ACCOUNT_JSON`

- **Type:** Cloudflare Worker secret
- **Value:** The full contents of the service account JSON key file, as a single-line string (no newline wrapping).
- **Used in:** `src/modules/mail-signature-designer/lib/gmail-signature-client.js` and `src/modules/mail-signature-designer/lib/directory-client.js`, both via the `getServiceAccount(env)` helper:

```js
function getServiceAccount(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Missing env: GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
}
```

In local development the value is set in `.dev.vars`. In production it is stored as a Cloudflare secret and never appears in source code or `wrangler.jsonc`.

To upload or rotate:

```sh
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# paste the single-line JSON when prompted
```

No other Google-specific environment variables exist. All service account fields (private key, client email, token URI) are read from the parsed JSON object at runtime.

---

## Authentication Flow

Both clients use the same JWT → access token exchange. The implementation is in each client file rather than a shared helper, as the scopes and impersonation subject differ.

### Step 1 — Build a signed JWT

```
Header:  { alg: "RS256", typ: "JWT" }
Payload: {
  iss:   service_account.client_email,
  sub:   <email to impersonate>,
  scope: <required scope(s)>,
  aud:   "https://oauth2.googleapis.com/token",
  iat:   <now>,
  exp:   <now + 3600>
}
```

The JWT is signed with the service account private key (PKCS8 RSA) using `crypto.subtle.sign('RSASSA-PKCS1-v1_5', ...)`. This is the Web Crypto equivalent of what the googleapis SDK does internally.

### Step 2 — Exchange JWT for access token

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
assertion=<signed_jwt>
```

Returns `{ access_token, token_type: "Bearer", expires_in: 3600 }`.

Tokens are **not cached**. A new token is created per function call. This is acceptable given the low call volume; no token pool or KV caching has been added.

### Impersonation subjects

| Client | Subject (`sub`) | Why |
|---|---|---|
| `gmail-signature-client.js` | Target user email (e.g. `jan@mymmo.com`) | The Gmail API call runs as that user — `users/me` resolves to the impersonated address |
| `directory-client.js` | `nico@mymmo.com` (hardcoded as `ADMIN_EMAIL`) | Directory API requires a super admin subject to read the full user list |

---

## Gmail Signature Update Flow

Implemented in `src/modules/mail-signature-designer/lib/gmail-signature-client.js`.

### `updateSignature(env, userEmail, signatureHtml)`

1. Parse service account from `env.GOOGLE_SERVICE_ACCOUNT_JSON`.
2. Create a JWT with `sub = userEmail`, scope `gmail.settings.basic`.
3. Exchange JWT for access token.
4. Call `GET /gmail/v1/users/me/settings/sendAs` (impersonated as `userEmail`) to retrieve the list of send-as identities.
5. Select the primary send-as: `sendAsList.find(s => s.isPrimary) || sendAsList[0]`.
6. Call `PUT /gmail/v1/users/me/settings/sendAs/{sendAsEmail}` with `{ signature: signatureHtml }`.
7. Return `{ sendAsEmail, oldSignature }`.

The old signature is returned so the caller can compute a hash diff (`quickHash`) and record whether the signature actually changed.

### `getPrimarySendAs(env, userEmail)`

Same flow as above but stops after step 5. Used by the admin read endpoint to inspect a user's current signature without modifying it.

---

## Directory Integration

Implemented in `src/modules/mail-signature-designer/lib/directory-client.js`.

### Why `admin.directory.user.readonly` is required

The Gmail Settings API only exposes signature data, not user profile fields. Name and profile photo come from the Google Directory. Without this API, the signature compiler would have no source for `fullName` and `photoUrl` unless Odoo covers them (Odoo is a fallback, not the primary source for photos).

### `listUsers(env, search?)`

Calls `GET /admin/directory/v1/users` with `customer=my_customer`, `maxResults=100`, `projection=basic`.  
Returns an array of `{ email, fullName, givenName, familyName, photoUrl }`.

Used in `fetchPushDataSources()` (routes.js) to build the `directoryMap` keyed by primary email.

### `getUserByEmail(env, email)`

Calls `GET /admin/directory/v1/users/{email}?projection=basic`.  
Returns `{ email, fullName, photoUrl }` or `null` on 404.

Used in `GET /api/my-settings` (routes.js) to attach the Directory photo URL to the user's own settings response, so the preview iframe shows the actual profile photo.

### How directory data feeds template rendering

In `routes.js` → `fetchPushDataSources()`:

```js
const directoryMap = Object.fromEntries(directoryUsers.map(u => [u.email, u]));
```

In `pushOneUser()`:

```js
const dirUser = directoryMap[targetEmail] || {};
const { config, userData } = mergeSignatureLayers(userSettings, marketingConfig, odooUser, dirUser, targetEmail);
```

`mergeSignatureLayers` in `signature-merge-engine.js` reads `dirUser.fullName` and `dirUser.photoUrl` and places them in `userData`, which `compileSignature` then renders into the HTML.

---

## Integration with the Mail-Signature System

### Push entry points

| Route | Caller | Scope |
|---|---|---|
| `POST /api/push/self` | Any authenticated user | Own signature only |
| `POST /api/push/users` | admin / marketing_signature | Selected list of emails |
| `POST /api/push/all` | admin / marketing_signature | All directory users |

All three routes call `pushOneUser()` per target. The `push/all` route processes users in batches of `PUSH_CONCURRENCY = 5` concurrent pushes.

### Background push on marketing config change

When a marketing config save triggers an event change, `routes.js` calls `triggerPushAllBackground()` via `ctx.waitUntil()`. This runs after the HTTP response has been returned to the client and pushes the new signature to all directory users without blocking the save response.

```js
context.ctx.waitUntil(triggerPushAllBackground({ env, actorEmail }));
```

### Audit log

Every `pushOneUser()` call — success or failure — writes a record to Supabase via `logPush()` (from `src/modules/mail-signature-designer/lib/signature-store.js`):

```js
{
  actor_email, target_user_email, sendas_email,
  success, html_hash, push_scope,
  metadata: { warnings, old_hash, new_hash, changed }
}
```

`html_hash` is a `quickHash()` (djb2 over the compiled HTML string). The `changed` flag indicates whether the hash differed from the previous signature, allowing idempotency analysis without storing full HTML.

---

## Security Considerations

### Service account key storage

- The private key never appears in source code, `wrangler.jsonc`, or version control.
- Local: `.dev.vars` (git-ignored).
- Production: Cloudflare secret (encrypted at rest, injected at runtime as `env.GOOGLE_SERVICE_ACCOUNT_JSON`).

### Scope minimisation

The two scopes authorised for domain-wide delegation are the minimum required:

- `gmail.settings.basic` — sufficient for `sendAs` read/write; does not grant access to message content.
- `admin.directory.user.readonly` — read-only; cannot modify directory records.

No broader scopes (`gmail.modify`, `admin.directory.user`, etc.) are requested or authorised.

### Key rotation

1. Generate a new JSON key for the service account in Google Cloud Console → IAM & Admin → Service Accounts → Keys.
2. Upload the new key: `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`
3. Verify a push succeeds in production.
4. Delete the old key from Google Cloud Console.

No code changes are required during rotation.

---

## Operational Model

### Test flow (single user)

```
POST /mail-signatures/api/push/self
→ fetchPushDataSources()        [Directory + Odoo + Supabase]
→ pushOneUser(targetEmail = actorEmail)
  → mergeSignatureLayers()      [user + marketing + Odoo + Directory]
  → compileSignature()          [→ HTML string]
  → updateSignature()           [→ Gmail Settings API PUT]
  → logPush()                   [→ Supabase push_log]
← { success, email, changed, warnings }
```

### Bulk publish flow

```
POST /mail-signatures/api/push/all
→ fetchPushDataSources()
→ for each batch of 5 emails:
    await Promise.all(batch.map(email => pushOneUser(...)))
← { success_count, fail_count, results[] }
```

### Error handling

- `fetchPushDataSources()` catches Directory and Odoo fetch failures individually, logs a warning, and continues with empty maps. A push will still succeed for users whose data is available in the remaining sources.
- `pushOneUser()` catches all errors, logs them via `logPush()` with `success: false`, and returns `{ success: false, error }` rather than throwing. This ensures one failing user does not abort a bulk push.
- Both JWT creation and token exchange throw with the raw HTTP status and response body on failure, making the root cause visible in Cloudflare Workers logs.
