# Odoo MCP-server voor Cowork

Lokale MCP-server die Claude directe toegang geeft tot Odoo mymmo.

## Installatie

```bash
cd scripts/mcp-odoo
npm install
```

## Toevoegen aan Cowork

1. Open **Cowork** → **Settings** → **Capabilities** → **MCP Servers** → **Add custom server**
2. Vul in:
   - **Name:** `odoo-mymmo`
   - **Command:** `node`
   - **Args:** volledig pad naar `server.mjs`, bv.:
     ```
     C:\Users\Nico Plinke\Documents\forminator-odoo-sync\scripts\mcp-odoo\server.mjs
     ```
3. Sla op en herstart Cowork (of klik Reconnect).

## Beschikbare tools na installatie

| Tool | Wat het doet |
|---|---|
| `odoo_models` | Lijst alle modellen, optioneel gefilterd |
| `odoo_fields` | Alle velden van een model |
| `odoo_search_read` | Records ophalen met domain/fields/limit |
| `odoo_custom_fields` | Alle x_studio_-velden per model |

## Lokaal testen (zonder Cowork)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node server.mjs
```
