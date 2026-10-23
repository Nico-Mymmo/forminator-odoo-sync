# VME aanmaken vanuit Odoo: velden in de webhook

Webhook op `crm.lead` ("Webhook versturen"). Odoo stuurt één JSON-object met
`_id`, `_model` en `_action`, plus de velden die in de webhook aangevinkt
zijn. Een leeg veld komt altijd als `false` (nooit `""` of `null`).

## VME (het gebouw)

| Veld | Type | In de webhook |
|---|---|---|
| `x_vme_naam` | tekst | `"VME Residentie Park"` of `false` |
| `x_vme_kbo` | tekst | zoals getypt, bv. `"0637.852.501"` (punten, spaties of `BE` ervoor zijn mogelijk: zelf normaliseren) of `false` |
| `x_vme_straat` | tekst | `"Registratiestraat"` of `false` |
| `x_vme_huisnummer` | tekst | `"25"`, `"25 bus 3"` of `false` |
| `x_vme_postcode` | tekst | `"2100"` (NL: `"1011 AB"`) of `false` |
| `x_vme_plaats` | tekst | `"Berchem"` of `false` |
| `x_vme_land` | keuze | `"BE"` of `"NL"`, of `false` |

## Leden van de VME

| Veld | Type | In de webhook |
|---|---|---|
| `x_vme_members` | tekst met JSON | een **string**: eerst `JSON.parse`. `false` als er geen leden zijn |

Na `JSON.parse`:

```json
[
  {"firstname": "Ans", "lastname": "De Wachter", "email": "ans@voorbeeld.be"},
  {"firstname": "", "lastname": "", "email": "info@voorbeeld.be"}
]
```

- `email` staat in kleine letters en komt per lijst één keer voor.
- `firstname` / `lastname` kunnen `""` zijn (naam niet gevonden).
- Kijk zelf na of elk `email` geldig is: een gebruiker kan een foute rij bewaren.

## Contactpersoon (de klant op de lead)

| Veld | Type | In de webhook |
|---|---|---|
| `partner_id` | many2one naar `res.partner` (persoon, `is_company = false`) | het id van de partner |

Naam, e-mail en gsm staan op die partner (ophalen via de API; voornaam en
achternaam uit één naamveld afleiden). De lead heeft ook kopieën die Odoo
gelijk houdt met de partner en die je rechtstreeks kan meesturen:
`contact_name`, `email_from`, `phone`, `mobile`.

## Om mee te geven

- **Formaat van `partner_id`:** naar verwachting een id-getal (`123`), maar
  het kan `[123, "Naam"]` zijn. Nakijken bij de eerste testlevering en beide
  opvangen.
- **Odoo dwingt niets af:** een lead kan zonder leden, land of KBO-nummer
  doorgestuurd worden. Valideer aan jullie kant.
- **Naam van de VME = `x_vme_naam`.** Het standaardveld "Company Name"
  (`partner_name`) staat er los van; niet gebruiken voor de VME.
- **Eén lijst, twee invulplekken:** de leden worden ingevuld op het tabblad
  Syndicoach van de lead of in het venster "Naar Syndicoach" op het
  actieblad. Het is altijd hetzelfde veld, `x_vme_members` op de lead.
