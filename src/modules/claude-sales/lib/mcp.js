/**
 * De connector zelf: een MCP-server (Streamable HTTP, zonder sessie) op
 * POST /mcp/sales.
 *
 * Claude doet het denkwerk op het account van de medewerker. Deze server
 * heeft vier functies: een gebouw zoeken, een overzicht van leads, het dossier geven, en
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
import { bouwDossier, ONDERDELEN } from './dossier.js';
import { mijnLeads } from './leads.js';
import { werkDossierBij } from './bijwerken.js';
import { SalesError, LOG_PREFIX } from './constants.js';

const VERSIES = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIES = `Je helpt een salesmedewerker van mymmo (OpenVME en Syndicoach) met een gebouw (een VME) waar hij mee bezig is. Antwoord in het Nederlands (Vlaams), kort en concreet.

Werkwijze:
1. Zoek het gebouw met zoek_gebouw (naam, adres, contactpersoon, e-mail, telefoon, lead). Bij meerdere treffers: vraag welk.
2. Haal het dossier met gebouw_dossier (zonder onderdelen: dan krijg je enkel "In het kort"). Toon dat blok: een tabel met de kern, hoogstens drie punten om na te kijken, wat er nog ontbreekt. Geen lap tekst, geen opsomming van alles wat je las. Eindig met een korte vraag wat de gebruiker nu wil doen. Details (de chatter, mails, website, de velden) vraag je pas op als hij erom vraagt, met enkel het onderdeel dat nodig is.
   Ontbreekt er een schakel van de keten contact - gebouw - lead - actieblad (zie de regel "Dossier:" in In het kort), zeg dat ALTIJD en stel voor om ze aan te maken: een gebouw met nieuw_gebouw, een contact met nieuwe_contacten, een actieblad met nieuw_actieblad. Een lead maak je niet zelf aan: zeg dat die in Odoo moet komen.
3. Geeft de gebruiker nieuwe info (een gespreksverslag, notities, een document): vraag eerst gebouw_dossier op met onderdelen ["gegevens", "ontbreekt"] (velden, interne notitie, pijnpunten, keuzes), en stel dan een wijziging voor en toon die eerst, met:
   - per record de velden die je invult of aanpast, met de oude en de nieuwe waarde;
   - de korte samenvatting die in de chatter komt, en op welke records (lead, gebouw, contact, actieblad: enkel waar het iets toevoegt);
   - de NIEUWE VOLLEDIGE interne notitie van de lead: een samenvatting van ALLES wat we over dit gebouw weten (de huidige notitie + het dossier + de nieuwe info), niet enkel het nieuwe. Houd ze gestructureerd (Situatie, Wie is wie, Noden en pijnpunten, Bezwaren, Afspraken en volgende stap).
   - eventueel een gesprek op het actieblad (type, datum, duur).
   - de pijnpunten die uit het gesprek blijken, met een score van 1 (speelt nauwelijks) tot 5 (speelt sterk). Enkel wat echt gezegd werd; de rest laat je open.
   - Hangt er nog geen gebouw aan (een nieuwe aanvraag van een persoon): stel voor om het aan te maken met nieuw_gebouw (naam van de VME, adres, type). Gegevens van het gebouw (kavels, mede-eigenaars, huidige syndicus, type beheer) gaan dan naar dat gebouw (record "gebouw", id 0), nooit naar de persoon.
4. Pas NA een uitdrukkelijk "ja" van de gebruiker roep je dossier_bijwerken aan met bevestigd: true. Geef daarna kort wat bewaard is en de links.

Zuinig zijn (het verbruik gaat van het Claude-account van de gebruiker):
- Een overzicht van meerdere leads of gebouwen ("wat moet ik opvolgen", "mijn leads", "wie bel ik vandaag") vraag je op met mijn_leads: EEN opvraging. Open NOOIT dossiers een voor een om een overzicht te maken.
- Hoogstens 3 dossiers per vraag van de gebruiker. Moet het er meer zijn, vraag dan eerst welk gebouw.
- Vraag een dossier niet opnieuw op als je het in dit gesprek al hebt, tenzij na een bewaring.
- Zoek met zoek_gebouw op de beste zoekterm; probeer niet tien varianten na elkaar.

Samenvatten is VERPLICHT bij elke bewaring: een korte samenvatting van wat er nu gebeurde in de chatter van de lead, en de nieuwe volledige interne notitie van de lead. Zonder die twee weigert dossier_bijwerken. Is er geen lead, dan een notitie in de chatter van het gebouw of het contact. De velden "AI samenvatting" en "AI suggestie" op het actieblad gebruik je niet.

Regels:
- Gewone taal, kort. Geen nummers (geen id's, geen "lead 11618", geen "#77") en geen technische veldnamen naar de gebruiker: noem een gebouw, lead, contact of offerte bij haar naam. Een link naar Odoo mag, met de naam als tekst. De id's in het dossier zijn enkel voor jou, om dossier_bijwerken aan te roepen.
- Ook in een voorstel: "Aantal kavels: leeg -> 6", niet "x_studio_number_of_plots".
- Stuur tekst als gewone tekst, nooit als HTML. Gebruik "### Kop" voor koppen in de interne notitie, "- " voor een lijstje.
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
    description: 'Het dossier van EEN gebouw. Zonder onderdelen: enkel "In het kort" (de kern, wat ontbreekt, wat na te kijken is) en de id\'s om bij te werken; dat is meestal genoeg. Vraag de rest per onderdeel op, enkel wat nodig is: gegevens (velden van gebouw, contacten, leads met hun interne notitie, actieblad met pijnpunten), ontbreekt (lege velden met hun keuzes, nodig voor een voorstel), chatter (mails en notities), geschiedenis (gesprekken, afspraken, taken, offertes en abonnementen, events, bijlagen), website, nakijken. Geef gebouw_id, of lead_id voor een lead zonder gebouw. Voor een overzicht van meerdere leads: mijn_leads.',
    inputSchema: {
      type: 'object',
      properties: {
        gebouw_id: { type: 'integer' },
        lead_id: { type: 'integer' },
        onderdelen: { type: 'array', items: { type: 'string', enum: ONDERDELEN }, description: 'Leeg = enkel In het kort.' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'mijn_leads',
    title: 'Mijn leads',
    description: 'Overzicht van leads in EEN tabel: lead, gebouw (met kavels), fase, volgende stap (over tijd eerst), laatst gewijzigd. Standaard de open leads van de gebruiker zelf. Gebruik dit voor elke vraag over meerdere leads ("wat moet ik opvolgen", "mijn leads", "wie bel ik vandaag"), in plaats van dossiers een voor een te openen.',
    inputSchema: {
      type: 'object',
      properties: {
        fase: { type: 'string', enum: ['open', 'gewonnen', 'verloren', 'alle'], description: 'Standaard open.' },
        verantwoordelijke: { type: 'string', description: '"ik" (standaard), "iedereen", of de naam van een collega.' },
        limiet: { type: 'integer', description: 'Hoogstens 50, standaard 30.' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'dossier_bijwerken',
    title: 'Dossier bijwerken in Odoo',
    description: 'Schrijft bevestigde wijzigingen naar Odoo: velden invullen, pijnpunten scoren, chatternotities, de interne notitie van de lead vervangen door een nieuwe volledige samenvatting (de vorige versie komt in de chatter), een gesprek op het actieblad, nieuwe contactpersonen, een nieuw gebouw of actieblad. Met een lead in het dossier zijn een notitie op de lead en interne_notitie VERPLICHT. ENKEL aanroepen nadat de gebruiker het voorstel gezien en uitdrukkelijk bevestigd heeft. Wordt een onderdeel geweigerd, dan wordt er niets geschreven en krijg je de reden.',
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
        nieuw_gebouw: {
          type: 'object',
          description: 'Enkel als er nog geen gebouw aan het dossier hangt: maak het aan. De persoon van de lead komt eronder en het actieblad eraan. Velden voor dit gebouw geef je in "velden" met record "gebouw" en id 0.',
          properties: {
            naam: { type: 'string', description: 'Naam van de VME, bv. "VME Residentie Zonneveld"' },
            straat: { type: 'string' }, postcode: { type: 'string' }, plaats: { type: 'string' },
            type: { type: 'string', description: 'VME, VME in beheer of Professioneel Syndicus' },
            ondernemingsnummer: { type: 'string' },
            contact_id: { type: 'integer', description: 'Het contact dat eronder komt; standaard de persoon van de lead.' },
          },
          required: ['naam'],
        },
        pijnpunten: {
          type: 'array',
          description: 'Pijnpunten op het actieblad scoren (de lijst en de huidige scores staan in het dossier). Score 1 = speelt nauwelijks, 5 = speelt sterk; null = wissen. Nieuw actieblad: actieblad_id 0.',
          items: {
            type: 'object',
            properties: {
              actieblad_id: { type: 'integer' },
              pijnpunt: { description: 'Het id van het pijnpunt uit het dossier, of zijn naam.' },
              score: { type: ['integer', 'null'], enum: [1, 2, 3, 4, 5, null] },
            },
            required: ['actieblad_id', 'pijnpunt', 'score'],
          },
        },
        nieuw_actieblad: {
          type: 'object',
          description: 'Enkel als er nog geen actieblad is: maak het aan (fase Discovery), gekoppeld aan de contactpersoon en de lead. Velden, pijnpunten, een gesprek of notitie voor dit actieblad geef je met id 0.',
          properties: {
            contact_id: { type: 'integer', description: 'Standaard de contactpersoon van de lead.' },
            lead_id: { type: 'integer', description: 'Standaard de open lead.' },
          },
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

// ── Rem ────────────────────────────────────────────────────────────────────

// Hoeveel opvragingen per gebruiker in 5 minuten. Daarboven weigert de connector: dan is
// Claude een overzicht aan het maken door dossiers een voor een te openen, en dat kost de
// gebruiker zijn Claude-tegoed (83 dossiers en 286 zoekopdrachten in een uur, 2026-10-26).
const REM = { gebouw_dossier: 10, zoek_gebouw: 20, mijn_leads: 10 };
const REM_MS = 5 * 60 * 1000;

async function teVeel(env, gebruiker, tool) {
  const max = REM[tool];
  if (!max) return false;
  try {
    const sinds = new Date(Date.now() - REM_MS).toISOString();
    const { data } = await getCoreDb(env).from('claude_sales_log').select('id')
      .eq('user_id', gebruiker.id).eq('tool', tool).gte('created_at', sinds).limit(max + 1);
    return (data || []).length >= max;
  } catch (err) {
    console.error(LOG_PREFIX, 'rem', err?.message);
    return false; // de rem mag de connector nooit tegenhouden als het logboek faalt
  }
}

const REM_TEKST = {
  gebouw_dossier: 'Gestopt: er zijn al 10 dossiers opgevraagd in 5 minuten. Open dossiers niet een voor een om een overzicht te maken: gebruik mijn_leads (EEN opvraging), of vraag de gebruiker welk gebouw hij bedoelt. Zeg de gebruiker kort dat dit zijn Claude-tegoed spaart.',
  zoek_gebouw: 'Gestopt: er is al 20 keer gezocht in 5 minuten. Gebruik mijn_leads voor een overzicht, of vraag de gebruiker naar de naam, het adres of het mailadres van het gebouw.',
  mijn_leads: 'Gestopt: het overzicht is al 10 keer opgevraagd in 5 minuten. Gebruik het overzicht dat je al hebt.',
};

// ── Functies ───────────────────────────────────────────────────────────────

async function roepAan(env, ctx, gebruiker, naam, args) {
  const t0 = Date.now();
  const a = args || {};
  try {
    if (await teVeel(env, gebruiker, naam)) {
      ctx?.waitUntil?.(log(env, gebruiker, naam, { samenvatting: 'tegengehouden door de rem', ok: false, ms: Date.now() - t0 }));
      return { tekst: REM_TEKST[naam], fout: true };
    }
    if (naam === 'mijn_leads') {
      const tekst = await mijnLeads(env, gebruiker, a);
      ctx?.waitUntil?.(log(env, gebruiker, naam, { samenvatting: [a.fase, a.verantwoordelijke].filter(Boolean).join(' ') || 'open, ik', ms: Date.now() - t0 }));
      return { tekst };
    }
    if (naam === 'zoek_gebouw') {
      const lijst = await zoekGebouw(env, a.zoekterm);
      ctx?.waitUntil?.(log(env, gebruiker, naam, { samenvatting: a.zoekterm, ms: Date.now() - t0 }));
      if (!lijst.length) return { tekst: `Niets gevonden voor "${a.zoekterm}". Probeer een stuk van het adres, de naam van een contactpersoon of een e-mailadres.` };
      return { tekst: JSON.stringify({ resultaten: lijst }) };
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
