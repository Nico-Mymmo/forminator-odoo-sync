# Mail Signature Designer - Test

## Doel

Minimale test om de Gmail signature van `nico@mymmo.com` te lezen en te overschrijven met test HTML.

## Vereisten

- Domain-wide delegation correct geconfigureerd
- Scopes geautoriseerd:
  - `https://www.googleapis.com/auth/gmail.settings.basic`
  - `https://www.googleapis.com/auth/admin.directory.user.readonly`
- Service account JSON lokaal aanwezig
- `.env` bevat:
  - `GOOGLE_SERVICE_ACCOUNT_PATH=src/modules/mail-signature-designer/<bestand>.json`

## Run

`node scripts/test-gmail-signature.js`

## Verwachte output

- `primary sendAs email: ...`
- `oude signature lengte: ...`
- `success: signature updated`
