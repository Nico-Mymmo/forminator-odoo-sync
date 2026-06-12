#!/usr/bin/env node
/**
 * MCP-server: Odoo mymmo
 * Voegt deze tools toe aan Claude in Cowork:
 *   odoo_models        — lijst modellen (optioneel gefilterd)
 *   odoo_fields        — velden van een model
 *   odoo_search_read   — records ophalen met domain/fields/limit
 *   odoo_custom_fields — alle x_studio_-velden gegroepeerd per model
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── Verbindingsgegevens ────────────────────────────────────────────────────
const ODOO_URL = "https://mymmo.odoo.com/jsonrpc";
const ODOO_DB  = "mymmo-main-11883993";
const ODOO_UID = 2;
const ODOO_KEY = "c6c225cd1740456eb974abe3a5b18d016d12b2c4";
// ──────────────────────────────────────────────────────────────────────────

async function rpc(model, method, args = [], kwargs = {}) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, ODOO_UID, ODOO_KEY, model, method, args, kwargs],
    },
  });

  const res = await fetch(ODOO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const json = await res.json();
  if (json.error) {
    const msg = json.error.data?.message ?? JSON.stringify(json.error);
    throw new Error(`Odoo fout: ${msg}`);
  }
  return json.result;
}

// ── Tool-definities ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "odoo_models",
    description:
      "Lijst alle Odoo-modellen op. Optioneel gefilterd op naam. " +
      "Geeft: model (technische naam), name (label), transient.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            "Optioneel: gedeeltelijke modelnaam om op te filteren, bv. 'res' of 'crm'",
        },
        limit: {
          type: "number",
          description: "Max aantal resultaten (default 200)",
        },
      },
    },
  },
  {
    name: "odoo_fields",
    description:
      "Geeft alle velden van een Odoo-model, inclusief type, label, relatie en of het verplicht is.",
    inputSchema: {
      type: "object",
      required: ["model"],
      properties: {
        model: {
          type: "string",
          description: "Technische modelnaam, bv. 'res.partner' of 'crm.lead'",
        },
        filter: {
          type: "string",
          description:
            "Optioneel: filter veldnamen op gedeeltelijke naam, bv. 'x_studio'",
        },
      },
    },
  },
  {
    name: "odoo_search_read",
    description:
      "Haal records op uit een Odoo-model. Ondersteunt domain-filters, veldkeuze en paginering.",
    inputSchema: {
      type: "object",
      required: ["model"],
      properties: {
        model: {
          type: "string",
          description: "Technische modelnaam, bv. 'crm.lead'",
        },
        domain: {
          type: "array",
          description:
            "Odoo domain-filter als array, bv. [[\"stage_id.name\",\"=\",\"New\"]]. Leeg = alles.",
          items: {},
        },
        fields: {
          type: "array",
          description: "Velden om op te halen. Leeg = alle velden.",
          items: { type: "string" },
        },
        limit: {
          type: "number",
          description: "Max records (default 10)",
        },
        offset: {
          type: "number",
          description: "Sla N records over (voor paginering)",
        },
        order: {
          type: "string",
          description: "Sorteerveld, bv. 'create_date desc'",
        },
      },
    },
  },
  {
    name: "odoo_custom_fields",
    description:
      "Geeft alle Studio-/custom-velden (x_studio_ prefix) gegroepeerd per model. " +
      "Handig om te zien welke aanpassingen gedaan zijn in Odoo Studio.",
    inputSchema: {
      type: "object",
      properties: {
        model_filter: {
          type: "string",
          description:
            "Optioneel: filter op modelnaam, bv. 'res.partner' om alleen partner-velden te tonen",
        },
      },
    },
  },
];

// ── Tool-handlers ──────────────────────────────────────────────────────────
async function handleOdooModels({ filter, limit = 200 }) {
  const domain = filter ? [["model", "like", filter]] : [];
  const rows = await rpc("ir.model", "search_read", [domain], {
    fields: ["name", "model", "transient"],
    limit,
    order: "model asc",
  });
  return rows
    .map(
      (r) =>
        `${r.model.padEnd(55)} ${r.name}${r.transient ? " [transient]" : ""}`
    )
    .join("\n") + `\n\n→ ${rows.length} modellen`;
}

async function handleOdooFields({ model, filter }) {
  const fieldsObj = await rpc(model, "fields_get", [], {
    attributes: ["string", "type", "required", "relation"],
  });

  let entries = Object.entries(fieldsObj).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  if (filter) {
    entries = entries.filter(([name]) => name.includes(filter));
  }

  const lines = entries.map(([name, f]) => {
    const req = f.required ? " *" : "  ";
    const rel = f.relation ? ` → ${f.relation}` : "";
    return `${(name + req).padEnd(45)} ${f.type.padEnd(20)} ${f.string}${rel}`;
  });

  return (
    `Velden van ${model}:\n\n` +
    `${"NAAM".padEnd(45)} ${"TYPE".padEnd(20)} LABEL\n` +
    "─".repeat(90) +
    "\n" +
    lines.join("\n") +
    `\n\n→ ${entries.length} velden (* = verplicht)`
  );
}

async function handleOdooSearchRead({
  model,
  domain = [],
  fields = [],
  limit = 10,
  offset = 0,
  order,
}) {
  const rows = await rpc(model, "search_read", [domain], {
    fields,
    limit,
    offset,
    order,
  });
  return JSON.stringify(rows, null, 2) + `\n\n→ ${rows.length} records`;
}

async function handleOdooCustomFields({ model_filter }) {
  const domain = model_filter
    ? [["name", "like", "x_studio_"], ["model", "=", model_filter]]
    : [["name", "like", "x_studio_"]];

  const fields = await rpc("ir.model.fields", "search_read", [domain], {
    fields: ["model_id", "name", "field_description", "ttype", "relation"],
    limit: 500,
    order: "model_id asc, name asc",
  });

  if (fields.length === 0) return "Geen x_studio_-velden gevonden.";

  const grouped = {};
  for (const f of fields) {
    const modelName = f.model_id[1];
    if (!grouped[modelName]) grouped[modelName] = [];
    grouped[modelName].push(f);
  }

  const lines = [];
  for (const [modelName, flds] of Object.entries(grouped)) {
    lines.push(`\n${modelName}`);
    for (const f of flds) {
      const rel = f.relation ? ` → ${f.relation}` : "";
      lines.push(
        `  ${f.name.padEnd(50)} ${f.ttype.padEnd(15)} ${f.field_description}${rel}`
      );
    }
  }

  return `x_studio_-velden (${fields.length} totaal):` + lines.join("\n");
}

// ── Server opzetten ────────────────────────────────────────────────────────
const server = new Server(
  { name: "odoo-mymmo", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let text;
    switch (name) {
      case "odoo_models":
        text = await handleOdooModels(args);
        break;
      case "odoo_fields":
        text = await handleOdooFields(args);
        break;
      case "odoo_search_read":
        text = await handleOdooSearchRead(args);
        break;
      case "odoo_custom_fields":
        text = await handleOdooCustomFields(args);
        break;
      default:
        throw new Error(`Onbekende tool: ${name}`);
    }
    return { content: [{ type: "text", text }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Fout: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
