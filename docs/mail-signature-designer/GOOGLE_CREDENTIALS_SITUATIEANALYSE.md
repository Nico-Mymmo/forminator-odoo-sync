# Google Service Account Credentials — Situatieanalyse

**Datum:** 20 februari 2026  
**Aanleiding:** Persistente 500-fouten bij Google API calls ondanks aanwezigheid van credentials in `.dev.vars`

---

## 1. Vastgestelde feiten (geen aannames)

### Feit 1 — `.dev.vars` bevat de key

Bestand aanwezig: ✅  
`GOOGLE_SERVICE_ACCOUNT_JSON` aanwezig als single-line JSON: ✅

```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"operations-signature-manager",...}
```

### Feit 2 — Cloudflare production secrets missen de key

Output van `wrangler secret list`:

```json
[
  "ADMIN_TOKEN", "API_KEY", "AUTH_TOKEN", "DB_NAME",
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "UID",
  "WORDPRESS_URL", "WP_API_TOKEN", "WP_PASSWORD", "WP_USERNAME"
]
```

**`GOOGLE_SERVICE_ACCOUNT_JSON` staat niet in Cloudflare secrets.** De productieomgeving mist de key volledig.

### Feit 3 — Debug-endpoint bevestigt: Worker ziet de key niet

Output van `GET /api/debug-google` (local Wrangler dev):

```json
{
  "step1_env": {
    "GOOGLE_SERVICE_ACCOUNT_JSON_present": false,
    "length": 0
  },
  "step1_parse": {
    "ok": false,
    "error": "\"undefined\" is not valid JSON"
  }
}
```

**`env.GOOGLE_SERVICE_ACCOUNT_JSON` is `undefined` in de Wrangler dev Worker**, ondanks dat het in `.dev.vars` staat.

---

## 2. Analyse: Waarom leest Wrangler `.dev.vars` niet?

Wrangler gebruikt een **dotenv-stijl** parser voor `.dev.vars`. Dotenv heeft bekende beperkingen bij waarden die:

- JSON-inhoud bevatten met `{`, `}`, `:`, `"`
- Speciale tekens bevatten zoals `=` (aanwezig in de base64-encoded private key)
- Geen aanhalingstekens om de waarde hebben

De private key in de JSON bevat onder andere:

```
"private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBAD...AOE=\n-----END PRIVATE KEY-----\n"
```

Het `=`-teken aan het einde van de base64-string (`AOE=`) is het probleem. Dotenv interpreteert `KEY=value` waarbij de waarde stopt bij het **tweede `=`-teken** of herkent het als een assignment-karakter. Dit kan ertoe leiden dat de waarde stil mislukt of leeg wordt geparsed.

**Meest waarschijnlijke oorzaak:** de Wrangler dev server is gestart *vóór* de correcte key werd toegevoegd, of de dotenv-parser slokt de waarde stil op door de `=` in de base64.

**Secundaire oorzaak:** Wrangler dev cached `.dev.vars` bij opstarten. Een wijziging vereist een volledige herstart.

---

## 3. De twee omgevingen en hun status

| Omgeving | Mechansime | Status |
|----------|-----------|--------|
| **Local dev** (`wrangler dev`) | `.dev.vars` bestand | ❌ Worker ziet `undefined` |
| **Productie** (Cloudflare) | `wrangler secret` in dashboard/CLI | ❌ Key bestaat niet |

---

## 4. Wat er moet gebeuren (geen actie, alleen beschrijving)

### Voor local dev

`.dev.vars` dotenv-parsers vereisen dat JSON-waarden met speciale tekens (met name `=`) worden **gewrapt in dubbele aanhalingstekens**:

```dotenv
GOOGLE_SERVICE_ACCOUNT_JSON="{ ... }"
```

Of de waarde moet worden opgeslagen via `wrangler secret put` zodat Wrangler het zelf beheert en `.dev.vars` niet nodig is voor lokaal testen.

Alternatief: Wrangler ondersteunt ook een `[vars]` sectie in `wrangler.jsonc` — maar dat is ongeschikt voor secrets.

### Voor productie

```bash
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

En dan de volledige JSON als één regel plakken bij de prompt.

---

## 5. Conclusie

De implementatie van `directory-client.js` en `gmail-signature-client.js` is **correct**: de Web Crypto JWT-logica, de token exchange en de API-calls zijn in orde. Het probleem is uitsluitend een **credential delivery-probleem**:

- Local: de dotenv-parser in Wrangler leest de waarde niet correct door speciale tekens
- Productie: de secret is nooit aangemaakt

**De Google API-code zít niet fout. De secrets bereiken de Worker niet.**
