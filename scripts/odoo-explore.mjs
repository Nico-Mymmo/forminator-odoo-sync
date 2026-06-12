#!/usr/bin/env node
/**
 * odoo-explore.mjs — lokale Odoo verkenner
 * Gebruik: node scripts/odoo-explore.mjs [commando] [args]
 *
 * Commando's:
 *   models [filter]          — lijst alle modellen (optioneel filter op naam)
 *   fields <model>           — velden van een model
 *   search <model> [limit]   — eerste N records (default 5)
 *   custom                   — alleen x_studio_ / custom modellen
 *   menus                    — menuboom
 */

const URL  = "https://mymmo.odoo.com/jsonrpc";
const DB   = "mymmo-main-11883993";
const UID  = 2;
const KEY  = "c6c225cd1740456eb974abe3a5b18d016d12b2c4";

async function rpc(model, method, args = [], kwargs = {}) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: { service: "object", method: "execute_kw",
        args: [DB, UID, KEY, model, method, args, kwargs] }
    })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message ?? JSON.stringify(json.error));
  return json.result;
}

const [,, cmd, arg1, arg2] = process.argv;

switch (cmd) {

  case "models": {
    const domain = arg1 ? [["model", "like", arg1]] : [];
    const rows = await rpc("ir.model", "search_read", [domain],
      { fields: ["name", "model", "transient"], limit: 300, order: "model asc" });
    console.log(`\n${"MODEL".padEnd(55)} ${"NAAM"}`);
    console.log("─".repeat(90));
    for (const r of rows)
      console.log(`${r.model.padEnd(55)} ${r.name}${r.transient ? " [transient]" : ""}`);
    console.log(`\n→ ${rows.length} modellen`);
    break;
  }

  case "custom": {
    const rows = await rpc("ir.model", "search_read",
      [[["model", "like", "x_"]]],
      { fields: ["name", "model"], limit: 200, order: "model asc" });
    // ook standaardmodellen met x_studio_ velden
    const withStudio = await rpc("ir.model.fields", "search_read",
      [[["name", "like", "x_studio_"]]],
      { fields: ["model_id", "name", "field_description", "ttype"], limit: 500, order: "model_id asc" });
    console.log(`\n── Custom modellen (x_) ──`);
    for (const r of rows) console.log(`  ${r.model}  —  ${r.name}`);
    console.log(`\n── Studio-velden (x_studio_) ── ${withStudio.length} velden`);
    let lastModel = "";
    for (const f of withStudio) {
      const m = f.model_id[1];
      if (m !== lastModel) { console.log(`\n  ${m}`); lastModel = m; }
      console.log(`    ${f.name.padEnd(50)} ${f.ttype.padEnd(15)} ${f.field_description}`);
    }
    break;
  }

  case "fields": {
    if (!arg1) { console.error("Gebruik: fields <model>"); process.exit(1); }
    const fieldsObj = await rpc(arg1, "fields_get", [], { attributes: ["string", "type", "required", "relation"] });
    console.log(`\nVelden van ${arg1}:\n`);
    console.log(`${"NAAM".padEnd(45)} ${"TYPE".padEnd(20)} ${"LABEL".padEnd(35)} RELATIE`);
    console.log("─".repeat(110));
    for (const [name, f] of Object.entries(fieldsObj).sort(([a],[b]) => a.localeCompare(b))) {
      const req = f.required ? " *" : "  ";
      console.log(`${(name+req).padEnd(45)} ${f.type.padEnd(20)} ${f.string.padEnd(35)} ${f.relation ?? ""}`);
    }
    console.log(`\n→ ${Object.keys(fieldsObj).length} velden (* = verplicht)`);
    break;
  }

  case "search": {
    if (!arg1) { console.error("Gebruik: search <model> [limit]"); process.exit(1); }
    const limit = parseInt(arg2 ?? "5");
    const rows = await rpc(arg1, "search_read", [[]], { limit, fields: [] });
    console.log(`\nEerste ${limit} records van ${arg1}:\n`);
    for (const r of rows) console.log(JSON.stringify(r, null, 2));
    break;
  }

  case "menus": {
    const rows = await rpc("ir.ui.menu", "search_read", [[["parent_id", "=", false]]],
      { fields: ["name", "complete_name", "child_id"], limit: 100, order: "sequence asc" });
    console.log("\nHoofdmenu's:");
    for (const r of rows) console.log(`  ${r.name}`);
    break;
  }

  default:
    console.log(`
Gebruik: node scripts/odoo-explore.mjs <commando>

  models [filter]     Alle modellen, optioneel gefilterd  (bv. "res.partner")
  custom              Custom (x_) modellen + alle x_studio_ velden
  fields <model>      Alle velden van een model
  search <model> [N]  Eerste N records (default 5)
  menus               Hoofd-menuboom
`);
}
