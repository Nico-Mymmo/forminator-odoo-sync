# Mail Signature Designer

Module voor het lokaal testen en iteratief ontwikkelen van Gmail signature beheer via Google Workspace domain-wide delegation.

## Locaties

- Module folder: `src/modules/mail-signature-designer/`
- Tijdelijke testscript: `scripts/test-gmail-signature.js`

## Service Account JSON

Plaats de JSON key lokaal in:

`src/modules/mail-signature-designer/<bestand>.json`

Zet daarna in `.env`:

`GOOGLE_SERVICE_ACCOUNT_PATH=src/modules/mail-signature-designer/<bestand>.json`

## Uitvoeren

`node scripts/test-gmail-signature.js`
