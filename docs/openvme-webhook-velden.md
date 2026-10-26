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
als `""` of `null`. Voorbeeld:

```json
{
  "_action": "OpenVME: VME aanmaken (webhook)(#1214)",
  "_id": 11905,
  "_model": "crm.lead",
  "id": 11905,
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

De VME staat **niet** in de webhook. Ze is een bestaand bedrijf in Odoo: het
**Bedrijf** (`parent_id`) van de contactpersoon. OpenVME haalt ze op via
`partner_id` -> `parent_id` (`res.partner`, `is_company = true`).

| Veld op het bedrijf | Verplicht (Odoo laat de knop pas toe als het ingevuld is) | Voorbeeld |
|---|---|---|
| `name` | ja | `"VME Residentie Park"` |
| `street` | ja, met huisnummer | `"Teststraat 36"`, `"Teststraat 36 bus 3"` |
| `zip` | ja | `"2100"` (NL: `"1011 AB"`) |
| `city` | ja | `"Berchem"` |
| `country_id` | ja, België of Nederland | land met code `BE` of `NL` |
| `x_studio_registration_number` | ja (beslissing mymmo; voor OpenVME optioneel) | KBO/KvK zoals getypt, bv. `"0637.852.501"`: normaliseren aan de kant van OpenVME |

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
| `partner_id` | `res.partner` (persoon, `is_company = false`) | ja, nog zonder `x_studio_soid`, en met de VME als Bedrijf (`parent_id`) | het nummer van de partner |
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
- **Naam van de VME = `name` van het bedrijf** (`partner_id` -> `parent_id`).
  Het veld "Company Name" (`partner_name`) op de lead staat er los van; niet
  gebruiken voor de VME.
- **De velden `x_vme_naam`, `x_vme_straat`, ... `x_vme_kbo` op de lead worden
  niet meer gebruikt** en zitten niet meer in de webhook.
