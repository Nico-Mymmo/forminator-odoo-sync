# VME aanmaken vanuit Odoo: velden in de webhook

Een lead gaat naar het syndicusteam. Dat kijkt de gegevens na en
drukt op de knop **Maak in OpenVME** bovenaan de lead. Odoo kijkt eerst na of
alle **verplichte** velden ingevuld zijn. Daarna toont een venster wat er doorgaat en wat nog leeg is; pas na "Toch
doorsturen" gaat de webhook naar OpenVME en komt er een notitie op de lead
("Doorgestuurd naar OpenVME door ...").

## Wat er in Odoo klaarstaat

| Wat | Waar in Odoo |
|---|---|
| De knop "Maak in OpenVME" (op elke lead) | bovenaan het leadformulier |
| De controle + het versturen | serveractie "OpenVME: VME aanmaken" |
| De webhook zelf | serveractie "OpenVME: VME aanmaken (webhook)" (Instellingen > Technisch > Serveracties) |

**Nog te doen door OpenVME:** het adres (URL) van jullie endpoint invullen in
de webhook-actie, bij "URL". Tot dan zegt de knop dat het adres ontbreekt en
wordt er niets verstuurd.

## Vorm van de webhook

Eén POST met een JSON-object. Een leeg veld komt altijd als `false`, nooit
als `""` of `null`. Een echte levering (testlead, 23/10/2026):

```json
{
  "_action": "OpenVME: VME aanmaken (webhook)(#1214)",
  "_id": 11905,
  "_model": "crm.lead",
  "id": 11905,
  "x_vme_naam": "Test Nico",
  "x_vme_kbo": "0145258741",
  "x_vme_straat": "Teststraat",
  "x_vme_huisnummer": "36",
  "x_vme_postcode": "2150",
  "x_vme_plaats": "Lier",
  "x_vme_land": "BE",
  "x_vme_members": "[{\"firstname\":\"TEST\",\"lastname\":\"NICo\",\"email\":\"nico+testcreeer@mymmo.com\"}]",
  "partner_id": 938921,
  "contact_name": "TEST NICo",
  "email_from": "nico+testcreeer@mymmo.com",
  "phone": "+32 492 44 99 92",
  "mobile": false,
  "x_odoo_database": "mymmo-main-11883993"
}
```

`id` (en `_id`) is het nummer van de lead. `partner_id` is het nummer van de
contactpersoon (`res.partner`), als getal.

`x_odoo_database` is de naam van de Odoo-database waaruit de webhook komt
(berekend, niet bewaard). In productie: `mymmo-main-11883993`; in een sandbox
iets anders. Zo kan OpenVME een levering uit een sandbox weigeren.

## VME (het gebouw)

| Veld | Type | Verplicht | In de webhook |
|---|---|---|---|
| `x_vme_naam` | tekst | ja | `"VME Residentie Park"` |
| `x_vme_straat` | tekst | ja | `"Registratiestraat"` |
| `x_vme_huisnummer` | tekst | ja | `"25"` of `"25 bus 3"` |
| `x_vme_postcode` | tekst | ja | `"2100"` (NL: `"1011 AB"`) |
| `x_vme_plaats` | tekst | ja | `"Berchem"` |
| `x_vme_land` | keuze | ja | `"BE"` of `"NL"` |
| `x_vme_kbo` | tekst | ja | zoals getypt, bv. `"0637.852.501"` (punten, spaties of `BE` ervoor zijn mogelijk: normaliseren aan de kant van OpenVME), of `false` |

## Leden van de VME

| Veld | Type | Verplicht | In de webhook |
|---|---|---|---|
| `x_vme_members` | tekst met JSON | nee (mag leeg zijn) | een **string**, dus eerst `JSON.parse`; `false` als er geen leden zijn |

Na `JSON.parse`:

```json
[
  {"firstname": "Ans", "lastname": "De Wachter", "email": "ans@voorbeeld.be"},
  {"firstname": "", "lastname": "", "email": "info@voorbeeld.be"}
]
```

- `email` staat in kleine letters en komt per lijst één keer voor. Odoo laat
  de knop niet toe zolang er een ongeldig adres in de lijst staat.
- De contactpersoon van de lead staat er zelf ook in (als eerste rij, tenzij
  zijn adres er al stond).
- `firstname` / `lastname` kunnen `""` zijn (naam niet gevonden).
- De lijst wordt ingevuld op het tabblad Syndicoach van de lead of in het
  venster "Naar Syndicoach" op het actieblad. Het is altijd hetzelfde veld.

## Contactpersoon (de klant op de lead)

Wordt de eerste gebruiker van de omgeving.

| Veld | Type | Verplicht | In de webhook |
|---|---|---|---|
| `partner_id` | `res.partner` (persoon, `is_company = false`) | ja, en nog zonder `x_studio_soid` | het nummer van de partner |
| `contact_name` | tekst | | volledige naam |
| `email_from` | tekst | ja (geldig adres) | e-mailadres |
| `mobile` | tekst | nee | gsm-nummer |
| `phone` | tekst | nee | telefoonnummer |

`contact_name`, `email_from`, `phone` en `mobile` zijn velden van de lead die
Odoo gelijk houdt met de partner. De naam is één veld: voornaam en achternaam
moet OpenVME zelf afleiden (of de partner ophalen via de API).

## Om mee te geven

- **Odoo wacht niet op het antwoord.** Een webhook van Odoo wacht maar heel
  kort en meldt geen fout terug aan de gebruiker. Laat OpenVME daarom zelf
  een notitie op de lead zetten als het gelukt of mislukt is, en
  `x_studio_soid` op de partners schrijven.
- **Een lead die al in OpenVME staat,** herkent Odoo aan `x_studio_soid` op
  de contactpersoon: dan weigert de knop.
- **Odoo controleert vóór de knop, OpenVME controleert toch zelf.** Een
  e-mailadres of KBO-nummer kan de juiste vorm hebben maar toch niet kloppen.
- **Naam van de VME = `x_vme_naam`.** Het standaardveld "Company Name"
  (`partner_name`) staat er los van; niet gebruiken voor de VME.
