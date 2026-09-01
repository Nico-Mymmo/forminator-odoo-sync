#!/usr/bin/env node
/**
 * Smoke test voor de odoo-mymmo MCP-koppeling. Draai dit lokaal, niet via
 * device_bash of enige andere cloud-shell — die hebben geen netwerktoegang
 * naar mymmo.odoo.com en kennen ODOO_KEY niet (aparte omgeving dan je
 * Windows-shell). Gebruik: node scripts/test-odoo-connection.mjs
 */

const ODOO_URL = process.env.ODOO_URL ?? "https://mymmo.odoo.com/jsonrpc";
const ODOO_DB = process.env.ODOO_DB ?? "mymmo-main-11883993";
const ODOO_UID = Number(process.env.ODOO_UID ?? 2);
const ODOO_KEY = process.env.ODOO_KEY;

if (!ODOO_KEY) {
  console.error("ODOO_KEY ontbreekt in de omgeving. Zie docs/odoo-mcp-setup.md — " +
    "en vergeet niet je terminal/VS Code te herstarten nadat je hem gezet hebt.");
  process.exit(1);
}

const res = await fetch(ODOO_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        ODOO_DB, ODOO_UID, ODOO_KEY,
        "crm.lead", "search_read",
        [[]],
        { fields: ["id", "name", "partner_name", "create_date"], limit: 3, order: "create_date desc" },
      ],
    },
  }),
});

const json = await res.json();

if (json.error) {
  console.error("Odoo gaf een fout terug:");
  console.error(JSON.stringify(json.error, null, 2));
  process.exit(1);
}

console.log(`Verbinding gelukt. Laatste ${json.result.length} leads:\n`);
for (const lead of json.result) {
  console.log(`#${lead.id}  ${lead.name}  (${lead.partner_name ?? "geen bedrijf"})  — ${lead.create_date}`);
}
