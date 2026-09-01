#!/usr/bin/env node
/**
 * Odoo mymmo — standalone MCP stdio-server
 * Geen externe dependencies — werkt met Node.js 18+
 *
 * Verbindingsgegevens komen uit environment-variabelen, nooit hardcoded —
 * zie CLAUDE.md: "Geen secrets/service-account keys in de repo". Zet
 * ODOO_KEY lokaal in je (gitignored) .env of exporteer hem in je shell;
 * commit hem nergens. Zie docs/odoo-mcp-setup.md voor de volledige uitleg.
 */

import { createInterface } from "readline";

// ── Verbindingsgegevens — uit env, met de bekende mymmo-defaults voor alles
// behalve de key, die verplicht is en nooit een default krijgt ─────────────
const ODOO_URL = process.env.ODOO_URL ?? "https://mymmo.odoo.com/jsonrpc";
const ODOO_DB  = process.env.ODOO_DB ?? "mymmo-main-11883993";
const ODOO_UID = Number(process.env.ODOO_UID ?? 2);
const ODOO_KEY = process.env.ODOO_KEY;

if (!ODOO_KEY) {
  process.stderr.write(
    "[odoo-mymmo] ODOO_KEY ontbreekt in de omgeving — zet hem in een gitignored " +
      ".env of exporteer hem in je shell voor je Claude Code start. Zie docs/odoo-mcp-setup.md.\n"
  );
  process.exit(1);
}
// ──────────────────────────────────────────────────────────────────────────

// ── Odoo RPC ──────────────────────────────────────────────────────────────
async function rpc(model, method, args = [], kwargs = {}) {
  const res = await fetch(ODOO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call",
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, ODOO_UID, ODOO_KEY, model, method, args, kwargs],
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message ?? JSON.stringify(json.error));
  return json.result;
}

// ── Tool-definities ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "odoo_models",
    description: "Lijst Odoo-modellen op. Optioneel gefilterd op naam. Geeft: model (technische naam), name (label).",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Gedeeltelijke modelnaam, bv. 'res' of 'crm'" },
        limit:  { type: "number", description: "Max resultaten (default 200)" },
      },
    },
  },
  {
    name: "odoo_fields",
    description: "Alle velden van een Odoo-model inclusief type, label, relatie en verplicht-status.",
    inputSchema: {
      type: "object",
      required: ["model"],
      properties: {
        model:  { type: "string", description: "Technische modelnaam, bv. 'res.partner'" },
        filter: { type: "string", description: "Filter op gedeeltelijke veldnaam, bv. 'x_studio'" },
      },
    },
  },
  {
    name: "odoo_search_read",
    description: "Records ophalen uit een Odoo-model met domain-filter, veldkeuze en paginering.",
    inputSchema: {
      type: "object",
      required: ["model"],
      properties: {
        model:  { type: "string", description: "Technische modelnaam, bv. 'crm.lead'" },
        domain: { type: "array",  description: "Odoo domain, bv. [[\"active\",\"=\",true]]. Leeg = alles.", items: {} },
        fields: { type: "array",  description: "Velden om op te halen. Leeg = alle.", items: { type: "string" } },
        limit:  { type: "number", description: "Max records (default 10)" },
        offset: { type: "number", description: "Sla N records over" },
        order:  { type: "string", description: "Sorteerveld, bv. 'create_date desc'" },
      },
    },
  },
  {
    name: "odoo_custom_fields",
    description: "Alle Studio-velden (x_studio_ prefix) gegroepeerd per model.",
    inputSchema: {
      type: "object",
      properties: {
        model_filter: { type: "string", description: "Filter op modelnaam, bv. 'res.partner'" },
      },
    },
  },
];

// ── Tool-handlers ──────────────────────────────────────────────────────────
async function handleTool(name, args) {
  switch (name) {
    case "odoo_models": {
      const { filter, limit = 200 } = args;
      const domain = filter ? [["model", "like", filter]] : [];
      const rows = await rpc("ir.model", "search_read", [domain], {
        fields: ["name", "model", "transient"], limit, order: "model asc",
      });
      return rows.map(r => `${r.model.padEnd(55)} ${r.name}${r.transient ? " [transient]" : ""}`).join("\n")
        + `\n\n→ ${rows.length} modellen`;
    }

    case "odoo_fields": {
      const { model, filter } = args;
      const obj = await rpc(model, "fields_get", [], { attributes: ["string", "type", "required", "relation"] });
      let entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
      if (filter) entries = entries.filter(([n]) => n.includes(filter));
      const lines = entries.map(([n, f]) =>
        `${(n + (f.required ? " *" : "")).padEnd(45)} ${f.type.padEnd(20)} ${f.string}${f.relation ? ` → ${f.relation}` : ""}`
      );
      return `Velden van ${model}:\n\n${"NAAM".padEnd(45)} ${"TYPE".padEnd(20)} LABEL\n${"─".repeat(90)}\n${lines.join("\n")}\n\n→ ${entries.length} velden (* = verplicht)`;
    }

    case "odoo_search_read": {
      const { model, domain = [], fields = [], limit = 10, offset = 0, order } = args;
      const rows = await rpc(model, "search_read", [domain], { fields, limit, offset, order });
      return JSON.stringify(rows, null, 2) + `\n\n→ ${rows.length} records`;
    }

    case "odoo_custom_fields": {
      const { model_filter } = args;
      const domain = model_filter
        ? [["name", "like", "x_studio_"], ["model", "=", model_filter]]
        : [["name", "like", "x_studio_"]];
      const fields = await rpc("ir.model.fields", "search_read", [domain], {
        fields: ["model_id", "name", "field_description", "ttype", "relation"],
        limit: 500, order: "model_id asc, name asc",
      });
      if (!fields.length) return "Geen x_studio_-velden gevonden.";
      const grouped = {};
      for (const f of fields) {
        const m = f.model_id[1];
        (grouped[m] ??= []).push(f);
      }
      const lines = [];
      for (const [m, flds] of Object.entries(grouped)) {
        lines.push(`\n${m}`);
        for (const f of flds)
          lines.push(`  ${f.name.padEnd(50)} ${f.ttype.padEnd(15)} ${f.field_description}${f.relation ? ` → ${f.relation}` : ""}`);
      }
      return `x_studio_-velden (${fields.length} totaal):` + lines.join("\n");
    }

    default:
      throw new Error(`Onbekende tool: ${name}`);
  }
}

// ── MCP stdio-protocol ─────────────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }

  const { id, method, params } = msg;

  // Notificaties (geen id) negeren
  if (id === undefined) return;

  try {
    switch (method) {
      case "initialize":
        send({ jsonrpc: "2.0", id, result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "odoo-mymmo", version: "0.1.0" },
        }});
        break;

      case "tools/list":
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        break;

      case "tools/call": {
        const text = await handleTool(params.name, params.arguments ?? {});
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
        break;
      }

      case "ping":
        send({ jsonrpc: "2.0", id, result: {} });
        break;

      default:
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (e) {
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } });
  }
});
