/**
 * Nieuwsbrieven -- AI-hulp bij het schrijven.
 *
 * Via `askAI()` uit mini-apps met `{ id: null, source: 'newsletters' }` (Regel 7
 * in CLAUDE.md): platformlimiet, MODEL_ALLOWLIST, foutcontract en audit-regel
 * gelden ook hier. Het resultaat is altijd een VOORSTEL; het scherm laat de
 * schrijver het overnemen, er wordt nooit stil iets vervangen.
 *
 * Enkel wat de schrijver aanleverde is bron. Geen feiten, cijfers, data of
 * namen verzinnen -- dat staat in de prompt, en de lengtes worden in JS
 * afgeklemd (Anthropic kent geen maxLength in een schema).
 */

import { askAI } from '../../mini-apps/lib/ai.js';
import { AI_ERROR_CODES, AI_ERROR_PHASES, aiError } from '../../mini-apps/lib/ai-errors.js';
import { KINDS } from './constants.js';

const AI_SOURCE = 'newsletters';
const MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 1500;

// Een constante onder de 2000 tekens: askAI() weigert langer. Doelgroep en
// toon van de reeks staan in de prompt, niet hier.
const SYSTEM = [
  'Je schrijft mee aan de nieuwsbrieven van OpenVME en Syndicoach: twee merken van Mymmo,',
  'een Belgisch bedrijf dat (mede-)eigenaars van appartementsgebouwen helpt met het beheer',
  'van hun vereniging van mede-eigenaars (VME). OpenVME is het platform, Syndicoach is de',
  'syndicusdienst. Je schrijft in vlot, natuurlijk Nederlands zoals in Vlaanderen gesproken',
  'wordt, met je en jij. Korte zinnen, concreet, warm maar zonder verkooppraat, zonder',
  'superlatieven en zonder uitroeptekens.',
  '',
  'Harde regels:',
  '- Gebruik enkel wat de schrijver aanleverde. Verzin geen feiten, cijfers, data, namen,',
  '  citaten of beloftes. Ontbreekt iets, laat het weg in plaats van het in te vullen.',
  '- Geen emoji in de tekst.',
  '- Geen opsmuk zoals "In deze snel veranderende wereld".',
  '- Schrijf voor de lezer, niet over het bedrijf.',
].join('\n');

const ACTIES = {
  write: 'Schrijf het stukje op basis van de notities en wat er al staat.',
  shorter: 'Maak wat er staat korter, zonder iets wezenlijks te verliezen.',
  warmer: 'Maak wat er staat warmer en persoonlijker, zonder het langer te maken.',
  spelling: 'Verbeter enkel spelling, grammatica en zinsbouw. Verander de inhoud en de toon niet.',
};

function schemaVoor(kind) {
  if (KINDS[kind]?.interactive) {
    return {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'De stelling of vraag, kort en prikkelend, hoogstens 90 tekens.' },
        intro: { type: 'string', description: 'Eén of twee zinnen die de lezer uitnodigen om te antwoorden, hoogstens 220 tekens.' },
        options: { type: 'array', items: { type: 'string' }, description: 'Twee tot vijf korte antwoordopties, elk hoogstens 30 tekens.' },
      },
      required: ['question', 'intro', 'options'],
      additionalProperties: false,
    };
  }
  if (kind === 'quote') {
    return {
      type: 'object',
      properties: { quote: { type: 'string', description: 'Het citaat, hoogstens 280 tekens.' } },
      required: ['quote'],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Een titel van hoogstens 80 tekens.' },
      text: { type: 'string', description: 'De tekst, in alinea\'s gescheiden door een lege regel. Hoogstens 900 tekens.' },
    },
    required: ['title', 'text'],
    additionalProperties: false,
  };
}

function knip(t, max) {
  const s = String(t || '').trim();
  return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function hintVan(series, item) {
  return String((series.sections || []).find((s) => s.key === item.section_key)?.hint || '').trim();
}

function bouwPrompt({ series, item, action, notes }) {
  const c = item.content || {};
  const huidig = KINDS[item.kind]?.interactive
    ? `Vraag: ${c.question || '(leeg)'}\nUitleg: ${c.intro || '(leeg)'}\nOpties: ${(c.options || []).map((o) => o.label).join(' / ') || '(leeg)'}`
    : item.kind === 'quote'
      ? `Citaat: ${c.quote || '(leeg)'}`
      : `Titel: ${c.title || '(leeg)'}\nTekst:\n${c.text || '(leeg)'}`;
  return [
    `NIEUWSBRIEF: ${series.name}`,
    `DOELGROEP: ${series.audience || 'niet opgegeven'}`,
    `TOON: ${series.tone || 'niet opgegeven'}`,
    '',
    `RUBRIEK: ${item.title || ''} (${KINDS[item.kind]?.label || item.kind})`,
    hintVan(series, item) ? `BEDOELING VAN DE RUBRIEK: ${hintVan(series, item)}` : null,
    '',
    'NOTITIES VAN DE SCHRIJVER (de enige bron):',
    String(notes || item.raw_notes || '(geen notities)').slice(0, 6000),
    '',
    'WAT ER NU STAAT:',
    huidig,
    '',
    `OPDRACHT: ${ACTIES[action] || ACTIES.write}`,
  ].filter((r) => r !== null).join('\n');
}

async function vraag(env, user, { prompt, schema }) {
  const result = await askAI(env, { id: null, source: AI_SOURCE }, user, {
    model: MODEL, system: SYSTEM, prompt, maxOutputTokens: MAX_OUTPUT_TOKENS, schema,
  });
  let json = result.json;
  if (!json || typeof json !== 'object') {
    try {
      json = JSON.parse(result.text);
    } catch {
      throw aiError(AI_ERROR_CODES.PROVIDER_ERROR, 'De AI gaf een onverwacht antwoord terug.', { phase: AI_ERROR_PHASES.PARSE });
    }
  }
  return json;
}

/** Een voorstel voor een stukje. Wordt NIET bewaard. */
export async function stelStukjeVoor(env, user, { series, item, action = 'write', notes = '' }) {
  const json = await vraag(env, user, { prompt: bouwPrompt({ series, item, action, notes }), schema: schemaVoor(item.kind) });
  if (KINDS[item.kind]?.interactive) {
    const opties = (Array.isArray(json.options) ? json.options : []).map((o) => knip(o, 40)).filter(Boolean).slice(0, 5);
    return { question: knip(json.question, 120), intro: knip(json.intro, 300), options: opties };
  }
  if (item.kind === 'quote') return { quote: knip(json.quote, 320) };
  return { title: knip(json.title, 100), text: knip(json.text, 1400) };
}

/** Drie onderwerpregels en een voorbeeldtekst, uit de stukjes van de editie. */
export async function stelOnderwerpVoor(env, user, { series, edition, items }) {
  const inhoud = items.map((it) => {
    const c = it.content || {};
    const kern = c.title || c.question || c.quote || '';
    return kern ? `- ${it.title}: ${kern}` : null;
  }).filter(Boolean).join('\n');
  const prompt = [
    `NIEUWSBRIEF: ${series.name} (${edition.title})`,
    `DOELGROEP: ${series.audience || 'niet opgegeven'}`,
    `TOON: ${series.tone || 'niet opgegeven'}`,
    '',
    'DE STUKJES IN DEZE EDITIE:',
    inhoud || '(nog geen stukjes)',
    '',
    'OPDRACHT: stel drie onderwerpregels voor (elk hoogstens 70 tekens, mag één emoji vooraan bevatten)',
    'en één voorbeeldtekst (de grijze regel naast het onderwerp in de inbox, hoogstens 110 tekens).',
    'Haal de sterkste haak uit de stukjes; verzin niets wat er niet in staat.',
  ].join('\n');
  const json = await vraag(env, user, {
    prompt,
    schema: {
      type: 'object',
      properties: {
        subjects: { type: 'array', items: { type: 'string' }, description: 'Drie onderwerpregels.' },
        preheader: { type: 'string', description: 'De voorbeeldtekst.' },
      },
      required: ['subjects', 'preheader'],
      additionalProperties: false,
    },
  });
  return {
    subjects: (Array.isArray(json.subjects) ? json.subjects : []).map((s) => knip(s, 90)).filter(Boolean).slice(0, 3),
    preheader: knip(json.preheader, 140),
  };
}
