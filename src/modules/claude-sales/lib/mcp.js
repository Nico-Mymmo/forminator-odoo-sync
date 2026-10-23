/**
 * De connector zelf: een MCP-server (Streamable HTTP, zonder sessie) op
 * POST /mcp/sales.
 *
 * Claude doet het denkwerk op het account van de medewerker. Deze server
 * heeft precies drie functies: een gebouw zoeken, het dossier geven, en
 * wegschrijven wat de medewerker bevestigde. Er draait hier geen AI.
 *
 * Elke aanroep heeft een token (zie oauth.js). Zonder token: 401 met de
 * verwijzing waar Claude zich kan aanmelden -- zo start claude.ai zelf het
 * aanmelden wanneer iemand de connector toevoegt.
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { valideerBearer, resourceMetadataUrl } from './oauth.js';
import { gebruikerVoorConnector } from './toegang.js';
import { zoekGebouw } from './zoeken.js';
import { bouwDossier } from './dossier.js';
import { werkDossierBij } from './bijwerken.js';
import { SalesError, LOG_PREFIX } from './constants.js';

const VERSIES = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIES = `Je helpt een salesmedewerker van mymmo (OpenVME en Syndicoach) met een gebouw (een VME) waar hij mee bezig is. Antwoord in het Nederlands (Vlaams), kort en concreet.

Werkwijze:
1. Zoek het gebouw met zoek_gebouw (naam, adres, contactpersoon, e-mail, telefoon, lead). Bij meerdere treffers: vraag welk.
2. Haal het dossier met gebouw_dossier en geef een helder overzicht: wat er NAGEKEKEN moet worden (sectie "Na te kijken": dubbels, open offertes, taken over tijd, ... altijd bovenaan tonen), wat we weten (gebouw, contactpersonen, lead en fase, actieblad), hoe ze ons vonden en wat ze op de website deden (sectie "Website"), wat er recent gebeurde (chatter, mails, gesprekken, afspraken), wat er NOG NIET bekend is, en een voorstel voor de volgende stap. Een overzichtelijke pagina (artifact) mag, als de gebruiker dat wil.
3. Geeft de gebruiker nieuwe info (een gespreksverslag, notities, een document): stel een wijziging voor en toon die eerst, met:
   - per record de velden die je invult of aanpast, met de oude en de nieuwe waarde;
   - de korte samenvatting die in de chatter komt, en op welke records (lead, gebouw, contact, actieblad: enkel waar het iets toevoegt);
   - de NIEUWE VOLLEDIGE interne notitie van de lead: een samenvatting van ALLES wat we over dit gebouw weten (de huidige notitie + het dossier + de nieuwe info), niet enkel het nieuwe. Houd ze gestructureerd (Situatie, Wie is wie, Noden en pijnpunten, Bezwaren, Afspraken en volgende stap).
   - eventueel een gesprek op het actieblad (type, datum, duur).
4. Pas NA een uitdrukkelijk "ja" van de gebruiker roep je dossier_bijwerken aan met bevestigd: true. Geef daarna kort wat bewaard is en de links.

Regels:
- Vul enkel in wat echt gezegd of geschreven werd. Geen gokken; twijfel = vragen of weglaten.
- Spreekt nieuwe info iets in Odoo tegen, zeg dat en vraag wat juist is.
- Verzin nooit een id: gebruik enkel id's uit het dossier.
- Keuzevelden: gebruik een van de keuzes uit het dossier.
- Zet geen persoonlijke gevoelige gegevens (gezondheid, conflicten tussen bewoners met namen, ...) in Odoo tenzij de gebruiker dat uitdrukkelijk vraagt.`;

const RECORD = { type: 'string', enum: ['gebouw', 'contact', 'lead', 'actieblad'] };

const TOOLS = [
  {
    name: 'zoek_gebouw',
    title: 'Gebouw zoeken',
    description: 'Zoek een gebouw (VME) in Odoo op naam, adres, ondernemingsnummer, naam/e-mail/telefoon van een contactpersoon, of de naam van een lead of actieblad. Geeft gebouwen met hun leads; gebruik het gebouw_id (of lead_id) voor gebouw_dossier.',
    inputSchema: {
      type: 'object',
      properties: { zoekterm: { type: 'string', description: 'Wat je weet: naam, adres, e-mail, telefoon, ...' } },
      required: ['zoekterm'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'gebouw_dossier',
    title: 'Dossier van een gebouw',
    description: 'Alles wat we over een gebouw weten: gebouw, contactpersonen, leads met hun interne notitie, actieblad, chatter en mails, gesprekken, afspraken, offertes en abonnementen, events, bijlagen, websitebezoeken (hoe ze ons vonden, wat ze bekeken), wat er nagekeken moet worden, en welke velden nog niet ingevuld zijn (met hun technische naam en keuzes). Geef gebouw_id, of lead_id voor een lead zonder gebouw.',
    inputSchema: {
      type: 'object',
      properties: {
        gebouw_id: { type: 'integer' },
        lead_id: { type: 'integer' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'dossier_bijwerken',
    title: 'Dossier bijwerken in Odoo',
    description: 'Schrijft bevestigde wijzigingen naar Odoo: velden invullen, chatternotities, de interne notitie van de lead vervangen door een nieuwe volledige samenvatting (de vorige versie komt in de chatter), een gesprek op het actieblad, nieuwe contactpersonen. ENKEL aanroepen nadat de gebruiker het voorstel gezien en uitdrukkelijk bevestigd heeft. Wordt een onderdeel geweigerd, dan wordt er niets geschreven en krijg je de reden.',
    inputSchema: {
      type: 'object',
      properties: {
        gebouw_id: { type: 'integer' },
        lead_id: { type: 'integer', description: 'Enkel voor een lead zonder gebouw.' },
        bevestigd: { type: 'boolean', description: 'true: de gebruiker heeft dit voorstel uitdrukkelijk goedgekeurd.' },
        bron: { type: 'string', description: 'Kort waar de info vandaan komt, bv. "Telefoongesprek 23/10 met de voorzitter".' },
        velden: {
          type: 'array',
          description: 'Velden om in te vullen. Technische veldnaam uit het dossier. Leeg maken: waarde null.',
          items: {
            type: 'object',
            properties: {
              record: RECORD,
              id: { type: 'integer' },
              veld: { type: 'string' },
              waarde: { description: 'Tekst, getal, ja/nee, JJJJ-MM-DD, een keuze, een id, of een lijst id\'s (many2many: de volledige lijst).' },
            },
            required: ['record', 'id', 'veld', 'waarde'],
          },
        },
        notities: {
          type: 'array',
          description: 'Korte samenvattingen voor de chatter. Gewone tekst; "- " voor een lijstje, **vet** mag.',
          items: {
            type: 'object',
            properties: { record: RECORD, id: { type: 'integer' }, tekst: { type: 'string' } },
            required: ['record', 'id', 'tekst'],
          },
        },
        interne_notitie: {
          type: 'object',
          description: 'De NIEUWE VOLLEDIGE interne notitie van de lead: alles wat we weten, niet enkel het nieuwe.',
          properties: { lead_id: { type: 'integer' }, tekst: { type: 'string' } },
          required: ['lead_id', 'tekst'],
        },
        gesprek: {
          type: 'object',
          description: 'Een gevoerd gesprek vastleggen op het actieblad.',
          properties: {
            actieblad_id: { type: 'integer' },
            type: { type: 'string', description: 'Discovery Call, Demo, Discovery & Demo, Demo #2, Ondersteuningsgesprek, 1e AV of Opstartsessie' },
            datum: { type: 'string', description: 'JJJJ-MM-DD, standaard vandaag' },
            duur_minuten: { type: 'integer' },
            titel: { type: 'string' },
            notities: { type: 'string' },
          },
          required: ['actieblad_id'],
        },
        nieuwe_contacten: {
          type: 'array',
          description: 'Nieuwe contactpersonen bij dit gebouw.',
          items: {
            type: 'object',
            properties: {
              naam: { type: 'string' }, email: { type: 'string' }, telefoon: { type: 'string' },
              gsm: { type: 'string' }, functie: { type: 'string', description: 'bv. voorzitter, penningmeester' },
            },
            required: ['naam'],
          },
        },
      },
      required: ['bevestigd'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

// ── Antwoorden ─────────────────────────────────────────────────────────────

function jsonAntwoord(body, status = 200, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}

const rpcFout = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });

function nietAangemeld(env) {
  return jsonAntwoord({ error: 'invalid_token', error_description: 'Meld je aan via de connector.' }, 401, {
    'WWW-Authenticate': `Bearer realm="mymmo", resource_metadata="${resourceMetadataUrl(env)}"`,
  });
}

async function log(env, gebruiker, tool, { gebouw_id, lead_id, samenvatting, details, ok, ms }) {
  try {
    await getCoreDb(env).from('claude_sales_log').insert({
      id: crypto.randomUUID(), user_id: gebruiker.id, user_name: gebruiker.naam, tool,
      gebouw_id: Number(gebouw_id) || null, lead_id: Number(lead_id) || null,
      samenvatting: samenvatting ? String(samenvatting).slice(0, 500) : null,
      details: details || null, ok: ok !== false, ms: ms || null,
    });
  } catch (err) {
    console.error(LOG_PREFIX, 'logboek', err?.message);
  }
}

// ── Functies ───────────────────────────────────────────────────────────────

async function roepAan(env, ctx, gebruiker, naam, args) {
  const t0 = Date.now();
  const a = args || {};
  try {
    if (naam === 'zoek_gebouw') {
      const lijst = await zoekGebouw(env, a.zoekterm);
      ctx?.waitUntil?.(log(env, gebruiker, naam, { samenvatting: a.zoekterm, ms: Date.now() - t0 }));
      if (!lijst.length) return { tekst: `Niets gevonden voor "${a.zoekterm}". Probeer een stuk van het adres, de naam van een contactpersoon of een e-mailadres.` };
      return { tekst: JSON.stringify({ resultaten: lijst, ms: Date.now() - t0 }, null, 1) };
    }
    if (naam === 'gebouw_dossier') {
      const { tekst, kern } = await bouwDossier(env, a);
      ctx?.waitUntil?.(log(env, gebruiker, naam, { gebouw_id: kern.gebouw?.id, lead_id: a.lead_id, samenvatting: kern.gebouw?.name, ms: Date.now() - t0 }));
      return { tekst };
    }
    if (naam === 'dossier_bijwerken') {
      const res = await werkDossierBij(env, gebruiker, a);
      // Het logboek van een schrijfactie wachten we af: dat is het spoor.
      await log(env, gebruiker, naam, {
        gebouw_id: res.kern.gebouw?.id, lead_id: a.lead_id || a.interne_notitie?.lead_id,
        samenvatting: a.bron || res.kern.gebouw?.name, details: res.details, ok: res.ok, ms: Date.now() - t0,
      });
      return { tekst: res.tekst, fout: !res.ok };
    }
    return { tekst: `Onbekende functie ${naam}.`, fout: true };
  } catch (err) {
    const verwacht = err instanceof SalesError;
    if (!verwacht) console.error(LOG_PREFIX, naam, err);
    if (naam === 'dossier_bijwerken') {
      ctx?.waitUntil?.(log(env, gebruiker, naam, { gebouw_id: a.gebouw_id, samenvatting: err.message, ok: false, ms: Date.now() - t0 }));
    }
    return { tekst: verwacht ? err.message : `Er ging iets mis bij Odoo: ${err.message}`, fout: true };
  }
}

async function behandel(env, ctx, gebruiker, bericht) {
  if (!bericht || bericht.jsonrpc !== '2.0' || typeof bericht.method !== 'string') {
    return rpcFout(bericht?.id, -32600, 'Ongeldig verzoek');
  }
  const { id, method, params } = bericht;
  const isMelding = id === undefined || id === null;
  if (isMelding) return null; // notifications/initialized, cancelled, ...

  switch (method) {
    case 'initialize': {
      const gevraagd = params?.protocolVersion;
      return rpcOk(id, {
        protocolVersion: VERSIES.includes(gevraagd) ? gevraagd : VERSIES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mymmo-sales', title: 'mymmo - Claude voor sales', version: '1.0.0' },
        instructions: INSTRUCTIES,
      });
    }
    case 'ping': return rpcOk(id, {});
    case 'tools/list': return rpcOk(id, { tools: TOOLS });
    case 'tools/call': {
      const naam = params?.name;
      if (!TOOLS.some((t) => t.name === naam)) return rpcFout(id, -32602, `Onbekende functie ${naam}`);
      const { tekst, fout } = await roepAan(env, ctx, gebruiker, naam, params?.arguments);
      return rpcOk(id, { content: [{ type: 'text', text: tekst }], isError: !!fout });
    }
    case 'resources/list': return rpcOk(id, { resources: [] });
    case 'prompts/list': return rpcOk(id, { prompts: [] });
    default: return rpcFout(id, -32601, `Methode ${method} bestaat niet`);
  }
}

export async function handleMcp(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonAntwoord({ error: 'Gebruik POST.' }, 405, { Allow: 'POST' });
  }
  const token = await valideerBearer(env, request);
  if (!token) return nietAangemeld(env);
  const gebruiker = await gebruikerVoorConnector(env, token.userId);
  if (!gebruiker) return nietAangemeld(env);

  let body;
  try { body = await request.json(); } catch { return jsonAntwoord(rpcFout(null, -32700, 'Geen geldige JSON')); }

  if (!gebruiker.toegang) {
    const melding = 'Je hebt (niet langer) toegang tot "Claude voor sales". Vraag het aan een beheerder van de Operations Manager.';
    const lijst = Array.isArray(body) ? body : [body];
    const antwoorden = lijst.filter((b) => b && b.id !== undefined && b.id !== null).map((b) => rpcFout(b.id, -32001, melding));
    return antwoorden.length ? jsonAntwoord(Array.isArray(body) ? antwoorden : antwoorden[0]) : jsonAntwoord(null, 202);
  }

  if (Array.isArray(body)) {
    const antwoorden = (await Promise.all(body.map((b) => behandel(env, ctx, gebruiker, b)))).filter(Boolean);
    return antwoorden.length ? jsonAntwoord(antwoorden) : jsonAntwoord(null, 202);
  }
  const antwoord = await behandel(env, ctx, gebruiker, body);
  return antwoord ? jsonAntwoord(antwoord) : jsonAntwoord(null, 202);
}
