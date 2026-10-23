# VME aanmaken vanuit Odoo: velden in de webhook

Een gewonnen lead gaat naar het syndicusteam. Dat kijkt de gegevens na en
drukt op de knop op de lead, die een webhook naar OpenVME stuurt. Odoo laat
pas toe dat iemand op de knop drukt als alle **verplichte** velden ingevuld
zijn.

Wat verplicht is, staat hieronder als **voorstel**. Twee punten liggen nog
open en worden samen beslist (zie "Nog te beslissen").

## Vorm van de webhook

Een webhook op `crm.lead` ("Webhook versturen") stuurt één JSON-object met
`_id`, `_model` en `_action`, plus de velden die in de webhook aangevinkt
staan. Een leeg veld komt altijd als `false`, nooit als `""` of `null`.

## VME (het gebouw)

| Veld | Type | Verplicht | In de webhook |
|---|---|---|---|
| `x_vme_naam` | tekst | ja | `"VME Residentie Park"` |
| `x_vme_straat` | tekst | ja | `"Registratiestraat"` |
| `x_vme_huisnummer` | tekst | ja | `"25"` of `"25 bus 3"` |
| `x_vme_postcode` | tekst | ja | `"2100"` (NL: `"1011 AB"`) |
| `x_vme_plaats` | tekst | ja | `"Berchem"` |
| `x_vme_land` | keuze | ja | `"BE"` of `"NL"` |
| `x_vme_kbo` | tekst | **te beslissen** | zoals getypt, bv. `"0637.852.501"` (punten, spaties of `BE` ervoor zijn mogelijk: normaliseren aan de kant van OpenVME), of `false` |

## Leden van de VME

| Veld | Type | Verplicht | In de webhook |
|---|---|---|---|
| `x_vme_members` | tekst met JSON | **te beslissen** | een **string**, dus eerst `JSON.parse`; `false` als er geen leden zijn |

Na `JSON.parse`:

```json
[
  {"firstname": "Ans", "lastname": "De Wachter", "email": "ans@voorbeeld.be"},
  {"firstname": "", "lastname": "", "email": "info@voorbeeld.be"}
]
```

- `email` staat in kleine letters en komt per lijst één keer voor.
- `firstname` / `lastname` kunnen `""` zijn (naam niet gevonden).
- De lijst wordt ingevuld op het tabblad Syndicoach van de lead of in het
  venster "Naar Syndicoach" op het actieblad. Het is altijd hetzelfde veld.

## Contactpersoon (de klant op de lead)

Wordt de eerste gebruiker van de omgeving.

| Veld | Type | Verplicht | In de webhook |
|---|---|---|---|
| `partner_id` | many2one naar `res.partner` (persoon, `is_company = false`) | ja | het id van de partner |
| `contact_name` | tekst | ja | volledige naam |
| `email_from` | tekst | ja | e-mailadres |
| `mobile` | tekst | ja, `mobile` **of** `phone` | gsm-nummer |
| `phone` | tekst | zie `mobile` | telefoonnummer |

`contact_name`, `email_from`, `phone` en `mobile` zijn velden van de lead die
Odoo gelijk houdt met de partner. Ze kunnen rechtstreeks mee in de webhook.
De naam is één veld: voornaam en achternaam moet OpenVME zelf afleiden (of de
partner ophalen via de API).

## Nog te beslissen

1. **KBO-nummer verplicht?** Een nieuwe VME heeft vaak nog geen KBO-nummer.
   Verplicht betekent: geen omgeving tot het er is. Optioneel betekent:
   OpenVME moet een omgeving zonder KBO-nummer aankunnen, en het later
   aanvullen.
2. **Ledenlijst verplicht?** Bijvoorbeeld: minstens één lid, en elk e-mailadres
   in de lijst moet geldig zijn. Of: een lege lijst mag, de leden komen later
   in OpenVME.

## Om mee te geven

- **Formaat van `partner_id`:** naar verwachting een id-getal (`123`), maar het
  kan ook `[123, "Naam"]` zijn. Nakijken bij de eerste testlevering en beide
  opvangen.
- **Odoo controleert vóór de knop, OpenVME controleert toch zelf.** Een veld
  kan na de controle nog gewijzigd zijn, en een e-mailadres of KBO-nummer
  kan de juiste vorm hebben maar toch niet kloppen.
- **Naam van de VME = `x_vme_naam`.** Het standaardveld "Company Name"
  (`partner_name`) staat er los van; niet gebruiken voor de VME.
