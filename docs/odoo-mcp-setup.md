# Odoo mymmo — MCP-server voor lokale Claude Code (VS Code)

Dit is een **lokaal ontwikkelhulpmiddel**, geen onderdeel van de Worker. Het geeft
Claude Code (in VS Code, op jouw machine) vier tools om rechtstreeks met de
mymmo Odoo-instantie te praten via JSON-RPC: modellen opzoeken, velden opvragen,
records lezen, en Studio-velden (`x_studio_`) per model tonen. Alleen lezen —
er zit geen write-tool in.

Dit staat los van deze Cowork-sessie: MCP-servers worden bij het opstarten van
een sessie gekoppeld, dus dit wordt pas actief zodra je de repo lokaal opent in
Claude Code / VS Code.

## Bestanden

- `.claude/mcp/odoo-server.mjs` — de server zelf. Geen dependencies, Node.js 18+.
  Bevat **geen** hardcoded key — leest `ODOO_KEY`, `ODOO_URL`, `ODOO_DB`, `ODOO_UID`
  uit de omgeving. Stopt met een duidelijke foutmelding als `ODOO_KEY` ontbreekt.
- `.mcp.json` (repo-root) — registreert de server bij Claude Code onder de naam
  `odoo-mymmo`, en geeft `ODOO_KEY` door vanuit je eigen shell-omgeving
  (`${ODOO_KEY}`-expansie). Bevat zelf geen geheime waarde.

## Eenmalige lokale setup

1. Zet je Odoo API-key **lokaal**, nooit in een gecommit bestand:
   - **macOS/Linux**: voeg toe aan je shell-profiel (`~/.zshrc` of `~/.bashrc`):
     ```bash
     export ODOO_KEY="jouw-odoo-api-key"
     ```
     en herstart je terminal, of
   - **Windows (PowerShell)**:
     ```powershell
     [Environment]::SetEnvironmentVariable("ODOO_KEY", "jouw-odoo-api-key", "User")
     ```
     en open een nieuwe terminal.
2. Open de repo in VS Code met Claude Code. Bij het opstarten leest Claude Code
   `.mcp.json` in de repo-root en vraagt (eenmalig) toestemming om de
   `odoo-mymmo`-server te starten.
3. Controleer dat de tools verschijnen: vraag Claude iets als "welke Odoo-modellen
   bestaan er die met 'crm' beginnen?" — dat moet `odoo_models` aanroepen.

`ODOO_URL`, `ODOO_DB` en `ODOO_UID` hebben al de juiste mymmo-defaults in de
server zelf; die hoef je niet apart te zetten tenzij je tegen een andere Odoo-
omgeving wil praten.

**Niet doen:** de key in `.mcp.json`, `odoo-server.mjs`, `.env.example` of
ergens anders in de repo hardcoden. `.env` staat al in `.gitignore` — als je
liever met een `.env`-bestand werkt dan met een shell-export, zet `ODOO_KEY=...`
daarin (en laad het bv. met `direnv` of `dotenv-cli` vóór je VS Code start),
maar commit dat bestand nooit.

## Gebruik — instructies voor Claude

Wanneer je Odoo-data moet opzoeken, gebruik de MCP-tools van de `odoo-mymmo`
server:

- **odoo_models** — lijst modellen op, optioneel gefilterd. Gebruik dit als de
  gebruiker vraagt welke modellen bestaan of de datastructuur wil verkennen.
- **odoo_fields** — haal alle velden van een specifiek model op. Gebruik dit
  voordat je queries bouwt of als de gebruiker vraagt naar veldnamen/types.
- **odoo_search_read** — haal records op met optionele domain-filter,
  veldselectie, limit en volgorde. Geef altijd `fields` mee om grote objecten
  te vermijden.
- **odoo_custom_fields** — lijst alle `x_studio_`-velden gegroepeerd per model.
  Gebruik dit als de gebruiker vraagt naar Studio-aanpassingen of custom fields.

Tips:
- Roep altijd eerst `odoo_fields` aan als de gebruiker een model gebruikt
  waarmee je nog niet gewerkt hebt.
- Geef bij `odoo_search_read` een expliciete `fields`-lijst mee in plaats van
  een lege array, voor leesbare resultaten.
- Domain-syntax: `[["field", "operator", value]]` — operatoren: `=`, `!=`,
  `like`, `ilike`, `in`, `>`, `<`, `>=`, `<=`.
- Many-to-one velden geven `[id, name]`-tuples terug. Gebruik `[0]` voor id,
  `[1]` voor weergavenaam.
- Gebruik het `x_studio_`-prefix om Studio-velden te herkennen op
  standaardmodellen zoals `res.partner` of `crm.lead`.

## Verbinding (ter referentie)

- Instantie: `https://mymmo.odoo.com`
- Database: `mymmo-main-11883993`

Dit is dezelfde Odoo-instantie als waar de Worker (`src/lib/odoo.js`) tegen
praat, maar via een apart, alleen-lezen, lokaal kanaal — niet via de Worker's
eigen `ODOO_URL`/`API_KEY`-secrets uit `.dev.vars`.
