# Forminator Sync V2 — UX SPEC (MVP)
Datum: 2026-02-25

## UX doel
Lineaire, marketeer-first configuratie zonder technische overload.

## Paginaopbouw (5 blokken)

### 1) Basisinstellingen
Velden:
- Integratienaam (verplicht)
- Formulier ID (verplicht)
- Odoo verbinding ID (verplicht)
- Actief toggle

Regel:
- Actief toggle kan alleen slagen na geslaagde test.

### 2) Herkenning
Velden:
- Type (exact 2 keuzes)
- Formulier-veld (verplicht)
- Nieuw contact maken als niet gevonden (alleen zichtbaar bij `partner_by_email`)
- Opslaan als (read-only context key)

### 3) Schrijf naar Odoo
Velden:
- Doelmodel (3 keuzes)
- Recordherkenning (automatisch bepaald door model)
- Updatebeleid (2 keuzes)

Regel:
- Maximaal 2 schrijfdoelen.

### 4) Veldkoppelingen
Velden:
- Target (verplicht)
- Odoo veld (verplicht)
- Bron (formulier/herkende gegevens/vaste waarde)
- Bronwaarde (verplicht)
- Verplicht veld (checkbox)

### 5) Test en geschiedenis
Fase 1:
- Testknop gebruikt teststub.
- Status toont of activatie toegestaan is.

## Terminologie
Zichtbaar voor marketeer:
- Herkenning
- Herkende gegevens
- Schrijf naar Odoo
- Recordherkenning
- Veldkoppeling
- Test uitvoeren

Niet zichtbaar in UI labels:
- Resolver
- Target
- Context
- Idempotency
- Partial failure

## Foutfeedback
Voorbeelden:
- “Kies een formulier.”
- “MVP laat maximaal twee schrijfdoelen toe.”
- “Activatie geblokkeerd: voer eerst een geslaagde test uit.”
