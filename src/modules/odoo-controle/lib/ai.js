/**
 * Odoo-controle -- de drie Claude-functies, overgenomen uit de claude.ai-pagina
 * (reviewPrompt, caseReviewPrompt en patSearchPrompt in controle.html).
 *
 * Via `askAI()` uit mini-apps met `{ id: null, source: 'odoo_controle' }`
 * (Regel 7 in claude.md): platformlimiet, MODEL_ALLOWLIST, foutcontract en
 * audit-regel gelden ook hier. Elk antwoord is een VOORSTEL: het scherm toont
 * het naast de huidige tekst en de gebruiker kiest per veld. Hier wordt niets
 * bewaard.
 *
 * Het antwoord wordt met een JSON-schema afgedwongen (geen JSON uit tekst
 * vissen) en daarna nog eens server-side genormaliseerd: enkel de verwachte
 * velden, als tekst, afgeknipt.
 */

import { askAI } from '../../mini-apps/lib/ai.js';
import { AI_ERROR_CODES, AI_ERROR_PHASES, aiError } from '../../mini-apps/lib/ai-errors.js';
import { STATUS, MODEL_LABEL, statusVan, stapLabel } from './constants.js';

export const AI_SOURCE = 'odoo_controle';
const MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 4000;
const MAX_CASES_PER_PATROON = 25;

// Onder de 2000 tekens: askAI() weigert langer.
const SYSTEM = [
  'Je bent een nauwkeurige redacteur en Odoo-kenner (Odoo Subscriptions, Sales, Accounting, CRM) voor het Belgische bedrijf',
  'mymmo (OpenVME, Syndicoach). Je schrijft Nederlands zoals in Vlaanderen, kort en zakelijk. Je verzint nooit feiten, nummers,',
  'bedragen, datums of namen: wat niet uit de gegevens volgt, meld je als vraag of vermoeden. Je behoudt elke inhoudelijke',
  'bedoeling van de medewerker en schrapt niets inhoudelijks zonder het in de opmerkingen te zeggen. Een veld dat al goed is,',
  'geef je exact ongewijzigd terug.',
].join(' ');

const knip = (v, max) => String(v ?? '').trim().slice(0, max);
const refLabel = (r) => `${MODEL_LABEL[r.model] || r.model} ${r.label}`;
const refsTekst = (c) => (c.refs || []).map(refLabel).join(', ') || '(geen)';

function caseDigest(c) {
  return [
    `#${c.nr} ${c.klant || ''} (${STATUS[statusVan(c)]})`,
    c.titel && `Titel: ${c.titel}`, c.bevinding && `Bevinding: ${c.bevinding}`, c.voorstel && `Voorstel: ${c.voorstel}`,
    c.wat_gebeurde && `Wat er gebeurde: ${c.wat_gebeurde}`,
    c.actie && `Wat er gedaan werd${c.in_openvme ? ' (in OpenVME)' : ''}: ${c.actie}`,
    c.complicaties && `Complicaties: ${c.complicaties}`, c.les && `Les uit de case: ${c.les}`,
  ].filter(Boolean).join('\n').slice(0, 1800);
}

function caseFeiten(c) {
  return [
    `#${c.nr} ${c.klant || ''}${c.klanttype ? ` (${c.klanttype})` : ''}`,
    c.titel && `Titel: ${c.titel}`, c.bedrag && `Bedrag: ${c.bedrag}`, c.categorie && `Categorie: ${c.categorie}`,
    c.bevinding && `Bevinding: ${c.bevinding}`, c.voorstel && `Voorstel: ${c.voorstel}`,
    `Referenties in Odoo: ${refsTekst(c)}`,
    c.in_openvme && 'Wordt opgelost in OpenVME, niet in Odoo.',
  ].filter(Boolean).join('\n');
}

const sorteer = (patronen) => [...patronen].sort((a, b) => (a.nr || 99) - (b.nr || 99));

async function vraag(env, user, { prompt, schema }) {
  const result = await askAI(env, { id: null, source: AI_SOURCE }, user, {
    model: MODEL, system: SYSTEM, prompt, maxOutputTokens: MAX_OUTPUT_TOKENS, schema,
  });
  let json = result.json;
  if (!json || typeof json !== 'object') {
    try { json = JSON.parse(result.text); } catch {
      throw aiError(AI_ERROR_CODES.PROVIDER_ERROR, 'Het antwoord van Claude kon niet gelezen worden. Probeer opnieuw.', { phase: AI_ERROR_PHASES.PARSE });
    }
  }
  return json;
}

const opmerkingen = (v) => (Array.isArray(v) ? v.map((x) => knip(x, 400)).filter(Boolean).slice(0, 12) : []);

// ─── 1. Patroon: regel opstellen / verifiëren en herschrijven ───────────────

export function patroonPrompt(patroon, cases, andere) {
  const cs = [...cases].sort((a, b) => a.nr - b.nr).slice(0, MAX_CASES_PER_PATROON);
  const others = sorteer(andere).filter((x) => x.id !== patroon.id)
    .map((x) => `- ${x.titel} | Regel: ${x.regel || '-'} | Controle: ${x.controle || '-'}`).join('\n');
  return [
    'Een patroon is een fout die bij meerdere klanten terugkomt. De regel en de controle gelden voor het hele patroon, niet per case. Elk patroon wordt een stuk van een skill die collega\'s en Claude volgen bij offertes, abonnementen, facturen, creditnota\'s, bedrijven en leads in Odoo.',
    '',
    'Verifieer de huidige tekst van het patroon en herschrijf waar nodig. Is een veld leeg, stel het dan zelf op uit de cases. Weeg alle cases: de regel moet elke case voorkomen, en lessen die medewerkers bij een case noteerden horen erin als ze algemeen gelden. Let op:',
    '1. Inhoud: klopt het met hoe Odoo werkt en met de cases hieronder? Zijn er tegenspraken met zichzelf of met de andere patronen? Ontbreekt er iets wat de cases duidelijk tonen?',
    '2. Plaats: "Uitleg" beschrijft wat er misgaat en waarom. "Regel" zegt wat je voortaan doet (concrete handelingen in Odoo, in de gebiedende wijs). "Controle" is één of enkele toetsbare voorwaarden die je in Odoo kan nakijken (een lijst of filter dat leeg moet zijn, of een gelijkheid), geen handelingen. Verplaats zinnen naar het juiste veld.',
    '3. Vorm: Nederlands (Vlaams), kort en zakelijk, in dezelfde stijl als de andere patronen. Geen herhalingen, geen tikfouten, geen Engelse termen als er een Odoo-label in het Nederlands is (behalve vaste veldnamen tussen aanhalingstekens). Behoud elke inhoudelijke bedoeling van de medewerker; schrap niets inhoudelijks zonder het in de opmerkingen te zeggen. Verzin geen feiten, bedragen of datums.',
    '4. Laat een veld ongewijzigd als het al goed is (geef dan exact de huidige tekst terug).',
    '',
    'Antwoord met: oordeel ("ok" of "aanpassen"), opmerkingen (korte vaststelling per punt: wat je veranderde of wat de medewerker nog moet beslissen), en de drie velden uitleg, regel en controle.',
    '',
    '## Patroon',
    `Titel: ${patroon.titel || ''}`,
    `Uitleg: ${patroon.uitleg || '(leeg)'}`,
    `Regel: ${patroon.regel || '(leeg)'}`,
    `Controle: ${patroon.controle || '(leeg)'}`,
    '',
    `## Cases bij dit patroon (${cs.length})`,
    cs.length ? cs.map(caseDigest).join('\n\n') : '(geen)',
    '',
    '## Andere patronen (ter vergelijking, niet aanpassen)',
    others || '(geen)',
  ].join('\n');
}

const PATROON_SCHEMA = {
  type: 'object',
  properties: {
    oordeel: { type: 'string', enum: ['ok', 'aanpassen'] },
    opmerkingen: { type: 'array', items: { type: 'string' }, description: 'Korte vaststellingen: wat niet klopte, wat je veranderde, wat de medewerker nog moet beslissen.' },
    uitleg: { type: 'string', description: 'Wat er misgaat en waarom. Exact de huidige tekst als die goed is.' },
    regel: { type: 'string', description: 'Wat je voortaan doet, concrete handelingen in Odoo of OpenVME, gebiedende wijs.' },
    controle: { type: 'string', description: 'Toetsbare voorwaarde(n) die je in Odoo kan nakijken; geen handelingen.' },
  },
  required: ['oordeel', 'opmerkingen', 'uitleg', 'regel', 'controle'],
  additionalProperties: false,
};

export async function beoordeelPatroon(env, user, { patroon, cases, andere }) {
  const r = await vraag(env, user, { prompt: patroonPrompt(patroon, cases, andere), schema: PATROON_SCHEMA });
  return {
    oordeel: r.oordeel === 'ok' ? 'ok' : 'aanpassen',
    opmerkingen: opmerkingen(r.opmerkingen),
    uitleg: knip(r.uitleg, 4000),
    regel: knip(r.regel, 4000),
    controle: knip(r.controle, 4000),
  };
}

// ─── 2. Case: verifiëren en herschrijven ────────────────────────────────────

export function casePrompt(c, waarden, patronen, odooTekst = '') {
  return [
    'Een medewerker heeft bij een case uit de factuur-, abonnement- en CRM-controle genoteerd wat er gebeurde, wat er gedaan werd, welke complicaties het rechtzetten heeft, en eventueel een les voor het patroon.',
    '',
    'Verifieer die notities op juistheid en herschrijf waar nodig. Let op:',
    '1. Juistheid: toets elke bewering aan de vaststaande gegevens hieronder (bevinding, voorstel, referenties, bedragen, datums' + (odooTekst ? ', en wat er live in Odoo staat' : '') + '). Komen nummers, datums of bedragen niet overeen, of zegt de tekst iets wat de gegevens tegenspreken, verbeter het dan als de gegevens het juiste antwoord geven; anders laat je het staan en meld je het in de opmerkingen. Klopt de uitleg met hoe Odoo werkt? Verzin geen feiten, nummers, datums of namen.',
    '2. "Wat er gebeurde": chronologisch, feitelijk: wie of wat deed wat, wanneer, met welk document, en waarom het misliep. Gissingen markeer je als vermoeden ("waarschijnlijk").',
    '3. "Wat we deden": enkel handelingen die echt gebeurd zijn, in de verleden tijd, met documentnummers en datums. Staat er een voornemen of een mening ("we zouden ...", "de skill moet ..."), dan hoort dat niet hier: zeg dat in de opmerkingen en verplaats een algemene les naar "Les voor het patroon". Is er nog niets gedaan, laat het veld dan leeg en zeg dat in de opmerkingen.',
    '3b. Staat de case op "oplossen in OpenVME", dan gebeurt de rechtzetting in het platform OpenVME en niet in Odoo: beoordeel "Wat we deden" daarnaar.',
    '3c. "Opmerkingen: complicaties": wat het rechtzetten moeilijk maakt (gevolgen voor de klant, boekhouding, afgesloten periodes, betalingen, rapporten) en waarop of op wiens goedkeuring gewacht wordt. Maak het concreet. Staat de case op "wacht op goedkeuring" maar zegt de tekst niet waarop of op wie, meld dat. Zie je uit de gegevens een duidelijke complicatie die ontbreekt, meld ze in de opmerkingen in plaats van ze te verzinnen.',
    '4. "Les voor het patroon": enkel wat algemeen geldt, kort, in de gebiedende wijs. Herhaalt het de regel van het patroon, zeg dat dan. Mag leeg blijven.',
    '5. Vorm: Nederlands (Vlaams), kort en zakelijk, zonder tikfouten. Behoud elke inhoudelijke bedoeling van de medewerker. Laat een veld dat al goed is exact zoals het is.',
    '6. Controleer ook de stappen: is "Rechtgezet" aangevinkt maar beschrijft de tekst geen rechtzetting (of omgekeerd), meld het.',
    '',
    'Antwoord met: oordeel ("ok" of "aanpassen"), opmerkingen (korte vaststelling per punt: wat niet klopte, wat je veranderde, of wat de medewerker nog moet nakijken), en de vier velden wat_gebeurde, actie, complicaties en les.',
    '',
    '## Vaststaande gegevens van de case',
    `#${c.nr} ${c.klant || ''}${c.klanttype ? ` (${c.klanttype})` : ''}`,
    c.titel && `Titel: ${c.titel}`, c.bedrag && `Bedrag: ${c.bedrag}`, c.categorie && `Categorie: ${c.categorie}`,
    c.deadline && `Deadline: ${c.deadline}`, c.vervaldag && `Vervaldag: ${c.vervaldag}`,
    c.bevinding && `Bevinding: ${c.bevinding}`, c.voorstel && `Voorstel: ${c.voorstel}`,
    `Referenties in Odoo: ${refsTekst(c)}`,
    `Stappen: onderzocht ${c.onderzocht ? 'ja' : 'nee'}, ${stapLabel(c).toLowerCase()} ${c.rechtgezet ? 'ja' : 'nee'}${c.geen_fout ? ', gemarkeerd als geen fout' : ''}`,
    `Waar rechtzetten: ${c.in_openvme ? 'in OpenVME (niet in Odoo)' : 'in Odoo'}${c.vasthouden ? '. Staat op: wacht op goedkeuring' : ''}`,
    patronen.length ? patronen.map((p) => `Patroon: ${p.titel}\nRegel van het patroon: ${p.regel || '(nog geen)'}`).join('\n') : 'Patroon: nog geen',
    odooTekst ? '\n## Wat er nu live in Odoo staat (opgehaald door de OM, alleen lezen)\n' + odooTekst : null,
    '',
    '## Notities van de medewerker',
    `Wat er gebeurde: ${waarden.wat_gebeurde || '(leeg)'}`,
    `Wat we deden: ${waarden.actie || '(leeg)'}`,
    `Opmerkingen: complicaties: ${waarden.complicaties || '(leeg)'}`,
    `Les voor het patroon: ${waarden.les || '(leeg)'}`,
  ].filter((x) => x !== null && x !== undefined && x !== false).join('\n');
}

const CASE_SCHEMA = {
  type: 'object',
  properties: {
    oordeel: { type: 'string', enum: ['ok', 'aanpassen'] },
    opmerkingen: { type: 'array', items: { type: 'string' } },
    wat_gebeurde: { type: 'string', description: 'Chronologisch en feitelijk; exact de huidige tekst als die goed is.' },
    actie: { type: 'string', description: 'Enkel handelingen die echt gebeurd zijn, verleden tijd. Leeg als er nog niets gedaan is.' },
    complicaties: { type: 'string', description: 'Wat het rechtzetten moeilijk maakt en waarop of op wie gewacht wordt.' },
    les: { type: 'string', description: 'Algemene les voor het patroon, gebiedende wijs. Mag leeg zijn.' },
  },
  required: ['oordeel', 'opmerkingen', 'wat_gebeurde', 'actie', 'complicaties', 'les'],
  additionalProperties: false,
};

export async function beoordeelCase(env, user, { c, waarden, patronen, odooTekst = '' }) {
  const r = await vraag(env, user, { prompt: casePrompt(c, waarden, patronen, odooTekst), schema: CASE_SCHEMA });
  return {
    oordeel: r.oordeel === 'ok' ? 'ok' : 'aanpassen',
    opmerkingen: opmerkingen(r.opmerkingen),
    wat_gebeurde: knip(r.wat_gebeurde, 6000),
    actie: knip(r.actie, 6000),
    complicaties: knip(r.complicaties, 6000),
    les: knip(r.les, 3000),
  };
}

// ─── 3. Case: patroon zoeken of een nieuw maken ─────────────────────────────

export function patroonZoekPrompt(c, patronen, { hint = '', forceNew = false } = {}) {
  const huidige = c.patterns || [];
  const kandidaten = sorteer(patronen).filter((p) => !huidige.includes(p.id));
  const list = kandidaten.map((p) => `- id: ${p.id}\n  Titel: ${p.titel}\n  Uitleg: ${p.uitleg || '-'}\n  Regel: ${p.regel || '-'}`).join('\n');
  const huidigeTitels = huidige.map((id) => { const q = patronen.find((p) => p.id === id); return q ? q.titel : id; });
  return [
    'Een medewerker zoekt een (bijkomend) patroon voor deze case: de patronen die er al aan hangen, dekken de case niet (volledig). Een case kan meerdere patronen hebben. Een patroon is een oorzaak van fouten die bij meerdere klanten terugkomt.',
    '',
    'Zoek of de case past bij een van de bestaande patronen hieronder. Kies een bestaand patroon alleen als de oorzaak echt dezelfde is; een gelijkaardig gevolg volstaat niet. Past er geen, stel dan een nieuw patroon op.',
    'Een nieuw patroon schrijf je algemeen (niet over deze ene klant), in het Nederlands (Vlaams), kort en zakelijk, in dezelfde stijl als de bestaande patronen:',
    '- titel: wat er misgaat, in een paar woorden;',
    '- uitleg: wat er gebeurt en waarom het een probleem is;',
    '- regel: wat je voortaan doet in Odoo of OpenVME, in de gebiedende wijs;',
    '- controle: een toetsbare voorwaarde die je in Odoo kan nakijken (een lijst die leeg moet zijn, of een gelijkheid).',
    'Verzin geen feiten die niet uit de case of de toelichting volgen.',
    '',
    'Antwoord met keuze "bestaand" (met id uit de lijst, reden, en alternatief: kort waarom een nieuw patroon toch zou kunnen, of leeg) of keuze "nieuw" (met reden, titel, uitleg, regel, controle). Velden die niet van toepassing zijn, laat je leeg.',
    forceNew ? '\nDe medewerker wil uitdrukkelijk een NIEUW patroon: kies "nieuw".' : null,
    '',
    '## Case',
    caseFeiten(c),
    `Patronen die al aan de case hangen (niet opnieuw voorstellen): ${huidigeTitels.length ? huidigeTitels.join('; ') : 'geen'}`,
    `Toelichting van de medewerker: ${hint || '(geen)'}`,
    c.wat_gebeurde && `Wat er gebeurde: ${c.wat_gebeurde}`, c.actie && `Wat er gedaan werd: ${c.actie}`, c.complicaties && `Complicaties: ${c.complicaties}`,
    '',
    '## Bestaande patronen',
    list || '(geen)',
  ].filter((x) => x !== null && x !== undefined && x !== false).join('\n');
}

const ZOEK_SCHEMA = {
  type: 'object',
  properties: {
    keuze: { type: 'string', enum: ['bestaand', 'nieuw'] },
    id: { type: 'string', description: 'Bij "bestaand": het id uit de lijst. Anders leeg.' },
    reden: { type: 'string' },
    alternatief: { type: 'string', description: 'Bij "bestaand": kort waarom een nieuw patroon toch zou kunnen, of leeg.' },
    titel: { type: 'string', description: 'Bij "nieuw". Anders leeg.' },
    uitleg: { type: 'string' },
    regel: { type: 'string' },
    controle: { type: 'string' },
  },
  required: ['keuze', 'id', 'reden', 'alternatief', 'titel', 'uitleg', 'regel', 'controle'],
  additionalProperties: false,
};

export async function zoekPatroon(env, user, { c, patronen, hint, forceNew }) {
  const r = await vraag(env, user, { prompt: patroonZoekPrompt(c, patronen, { hint, forceNew }), schema: ZOEK_SCHEMA });
  const id = knip(r.id, 80);
  const bestaat = patronen.some((p) => p.id === id) && !(c.patterns || []).includes(id);
  if (r.keuze === 'bestaand' && bestaat && !forceNew) {
    return { keuze: 'bestaand', id, reden: knip(r.reden, 1000), alternatief: knip(r.alternatief, 600) };
  }
  const titel = knip(r.titel, 200);
  if (!titel) {
    throw aiError(AI_ERROR_CODES.PROVIDER_ERROR, 'Claude gaf geen bruikbaar voorstel. Probeer opnieuw, eventueel met een toelichting.', { phase: AI_ERROR_PHASES.PARSE });
  }
  return { keuze: 'nieuw', reden: knip(r.reden, 1000), titel, uitleg: knip(r.uitleg, 3000), regel: knip(r.regel, 3000), controle: knip(r.controle, 2000) };
}
