/**
 * Content Feed — een opgehaald artikel door de AI laten analyseren
 *
 * Volgt de regels uit CLAUDE.md ("mini-apps AI — streamend, met een canoniek
 * foutcontract"):
 *
 *  - Regel 2: de foutcodes uit `mini-apps/lib/ai-errors.js` reizen ONGEWIJZIGD
 *    door naar de route en de browser. Nooit een code vertalen naar tekst en
 *    nooit een regex op een foutmelding.
 *  - Regel 3: gestructureerde output met een SCHEMA. Er wordt hier nergens
 *    JSON uit tekst gevist. Let op welke schema-keywords mogen: Anthropic's
 *    constrained decoding ondersteunt `maxLength`/`maxItems` niet (harde 400),
 *    dus grenzen worden in JS afgeklemd en gesloten keuzes staan als `enum`.
 *  - Regel 4: het model past bij de taak. Dit is samenvatten en beoordelen,
 *    dus Sonnet -- Haiku is voor classificatie met een gesloten antwoordruimte.
 *
 * DEZE AANROEP GAAT VIA `askAI()` uit mini-apps, met `{ id: null, source:
 * 'content_feed' }` als aanroeper. Niet omdat een nieuwsbericht een mini-app
 * is, maar omdat álles wat askAI() doet -- platform-daglimiet,
 * MODEL_ALLOWLIST, foutcontract, stall-timeout en de audit-regel -- voor elke
 * AI-aanroep moet gelden. Een eigen kopie ernaast zou precies de
 * twee-motoren-fout zijn die deze repo elders al eens gemaakt heeft: dan mist
 * de ene wat de andere wel doet, en merk je dat aan een kostenrapport dat niet
 * klopt.
 *
 * De aanroep verschijnt dus gewoon in het AI-gebruiksrapport van Beheer, onder
 * "Nieuws & updates" (zie SOURCE_LABELS in mini-apps/routes.js).
 */

import { askAI } from '../../mini-apps/lib/ai.js';
import { AI_ERROR_CODES, AI_ERROR_PHASES, aiError } from '../../mini-apps/lib/ai-errors.js';
import { LOG_PREFIX, TIMELINE_COLORS } from '../constants.js';

/** Waaronder deze aanroepen in het kostenrapport terechtkomen. */
const AI_SOURCE = 'content_feed';

/** Samenvatten en beoordelen, niet classificeren. Zie Regel 4. */
const MODEL = 'claude-sonnet-5';

/**
 * Ruim gevraagd. `max_tokens` is een PLAFOND, geen reservering: je betaalt wat
 * er werkelijk gegenereerd wordt. Krap vragen bespaart dus niets en levert
 * alleen AI_TRUNCATED op -- een volledig betaalde, weggegooide aanroep.
 */
const MAX_OUTPUT_TOKENS = 2000;

/**
 * De systeemprompt hangt af van de DOELGROEP: dezelfde subsidie leest anders
 * voor een mede-eigenaar dan voor een syndicus. De marketeer kiest die
 * doelgroep bij het invoeren van de link, en ze stuurt zowel de samenvatting
 * als de keuze van het citaat.
 *
 * Zonder doelgroep valt het terug op de brede lezer van de feed -- dat is wat
 * er stond voor deze keuze bestond, dus een bericht zonder doelgroep gedraagt
 * zich exact zoals vroeger.
 */
/**
 * De persona. BEWUST een constante zonder interpolatie: `askAI()` weigert
 * een system-prompt boven MAX_SYSTEM_LENGTH (2000 tekens), en de doelgroep
 * is een LABEL uit Odoo Studio -- dat kan iemand morgen drie regels lang
 * maken. Stond dat hier, dan kan een wijziging in Studio de analyse breken
 * met een foutmelding die niets met Studio te maken lijkt te hebben.
 *
 * Wat hier hoort: wie we zijn en hoe we klinken. De TAAKREGELS (wat er in
 * elk veld moet komen) staan in bouwPrompt, bij het artikel waarop ze
 * slaan -- daar is de grens 25000 tekens.
 */
const SYSTEM = [
  'WIE JE BENT',
  'Je bent redacteur bij OpenVME en Syndicoach: twee merken van hetzelfde',
  'Belgische bedrijf dat software maakt voor het beheer van',
  'appartementsgebouwen en verenigingen van mede-eigenaars (VME).',
  'OpenVME richt zich op VME\'s die hun gebouw zelf of met een syndicus',
  'beheren; Syndicoach op professioneel beheer van kleinere en middelgrote',
  'gebouwen.',
  '',
  'WAAR JE AAN SCHRIJFT',
  'Een contentfeed: een doorlopende lijst nieuwsberichten op ons platform en',
  'op onze websites, voor klanten en voor bezoekers. Ze dient om te',
  'informeren en te inspireren -- niet om te verkopen. Lezers zullen er',
  'later ook op kunnen reageren.',
  '',
  'BELANGRIJK: wij zijn zelf een speler in deze markt.',
  'Gaat het artikel over OpenVME, Syndicoach, of over iets dat wij gemaakt,',
  'georganiseerd of gepubliceerd hebben, schrijf dan in de WIJ-vorm.',
  'Schrijf nooit over onszelf in de derde persoon ("een softwarebedrijf",',
  '"een aanbieder van syndicussoftware") -- dat leest alsof we over een',
  'ander berichten. Blijf ook dan nuchter: het is een nieuwsbericht, geen',
  'advertentie.',
  'Gaat het over een CONCURRENT, meld dat feitelijk en zonder oordeel.',
  '',
  'Je schrijft in het Nederlands, in de je-vorm, nuchter en concreet.',
].join('\n');

/**
 * Het schema. Alles verplicht, want een ontbrekend veld en een leeg veld zijn
 * voor de invuller twee verschillende dingen -- en een model dat velden mag
 * weglaten, laat er ook weg die het wel wist.
 */
function bouwSchema(tags, doelgroep) {
  const tagLijst = tags.map((t, i) => `${i}=${t.name}`).join(', ');
  const voor = doelgroep ? `voor ${doelgroep}` : 'voor een Belgische VME';
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'summaryTitle', 'curatorNote', 'summary', 'quote', 'source',
      'publishedOn', 'cta', 'color', 'tagIndices', 'relevance'
    ],
    properties: {
      summaryTitle: {
        type: 'string',
        description: 'De kop van het artikel zelf, LETTERLIJK overgenomen als die duidelijk is. Alleen zelf schrijven als er geen kop is, als de kop enkel de sitenaam bevat, of als hij niets over de inhoud zegt. Geen punt op het einde.'
      },
      summary: {
        type: 'string',
        description: `Twee tot vier zinnen: wat er gebeurd is en wat het ${voor} betekent. Vlot en wervend geschreven, maar eerlijk -- de lezer moet na het lezen weten waar het over gaat, en doorklikken uit interesse en niet omdat je iets achterhield. Richtlijn: maximaal 500 tekens.`
      },
      curatorNote: {
        type: 'string',
        description: `EEN zin in ONZE stem, niet die van het artikel: waarom wij dit gedeeld hebben en waarom het ${voor} de moeite is. Dit staat als subkop op de kaart. Begin niet met "Dit artikel" en herhaal de kop niet. Richtlijn: maximaal 160 tekens.`
      },
      quote: {
        type: 'string',
        description: `Een citaat dat LETTERLIJK in de aangeleverde tekst staat en dat ${voor} het meest ter zake doet. Lege string als er geen bruikbaar citaat is. Richtlijn: maximaal 300 tekens.`
      },
      source: {
        type: 'string',
        description: 'De naam van de publicatie zoals een lezer die kent, bv. "VRT NWS", "De Tijd", "HLN". Lege string als je het niet weet.'
      },
      publishedOn: {
        type: 'string',
        description: 'De publicatiedatum van het artikel als JJJJ-MM-DD. Lege string als de tekst geen datum noemt. Nooit de datum van vandaag gokken.'
      },
      cta: {
        type: 'string',
        description: 'Het opschrift van de leesverder-link, bv. "Lees verder" of iets specifieker zoals "Bekijk de premievoorwaarden". Maximaal vier woorden.'
      },
      color: {
        type: 'string',
        enum: TIMELINE_COLORS,
        description: 'Tijdlijnkleur. green = kans of goed nieuws (premie, subsidie), red = verplichting of deadline, yellow = opgelet of discussie, blue = achtergrond en uitleg, default = de rest.'
      },
      tagIndices: {
        type: 'array',
        items: { type: 'integer' },
        description: `Indices van de best passende labels uit deze lijst: ${tagLijst}. Nul, een of twee. Enkel als het label echt past.`
      },
      relevance: {
        type: 'string',
        enum: ['hoog', 'gemiddeld', 'laag'],
        description: `Hoe relevant dit ${voor} is. "laag" = deze lezer heeft er weinig aan.`
      }
    }
  };
}

function bouwPrompt(artikel, doelgroep) {
  const lezer = doelgroep
    ? `${doelgroep}. Dat is je lezer: schrijf alsof je hem rechtstreeks aanspreekt.`
    : 'mede-eigenaars en bestuurders van een VME (vereniging van mede-eigenaars) '
      + 'in Belgie: mensen die samen een appartementsgebouw beheren.';

  return [
    'Je krijgt de tekst van een artikel. Maak er een korte kaart van voor de feed.',
    '',
    `Dit bericht is gericht op: ${lezer}`,
    '',
    'De lezer moet voelen dat WIJ dit gevonden, gelezen en samengevat hebben.',
    'Hij hoeft het artikel niet te openen om te weten waar het over gaat -- hij',
    'klikt door omdat jouw samenvatting hem nieuwsgierig maakte, niet omdat ze',
    'onvolledig was.',
    '',
    'Harde regels:',
    '- Verzin NIETS FEITELIJKS. Alles wat je als feit brengt moet in de',
    '  aangeleverde tekst staan. Een vlotte formulering mag; een verzonnen',
    '  cijfer, datum of citaat niet.',
    '- Weet je iets niet (datum, bron), geef dan een lege string terug.',
    '- HEEFT het artikel een duidelijke eigen kop? Neem die dan LETTERLIJK over',
    '  als summaryTitle. Herschrijf alleen als er geen kop is, als de kop enkel',
    '  uit de sitenaam bestaat, of als hij niets zegt over de inhoud.',
    '- De samenvatting zegt wat het voor DEZE LEZER betekent, niet wat het',
    '  artikel allemaal aanhaalt.',
    '- Het citaat moet LETTERLIJK in de tekst voorkomen, zonder aanhalingstekens',
    '  eromheen, en moet aansluiten bij wat voor DEZE LEZER het meest ter zake',
    '  doet. Staat er geen bruikbare zin in, geef dan een lege string.',
    '- De samenvatting mag vlot en wervend klinken, maar blijft eerlijk: geen',
    '  superlatieven, geen "must read", geen uitroeptekens.',
    '- De curatorsnoot is ONZE stem, niet die van het artikel. Daar staat',
    '  waarom wij dit de moeite vonden voor deze lezer.',
    '',
    `URL: ${artikel.url}`,
    artikel.siteName ? `Website: ${artikel.siteName}` : null,
    artikel.title ? `Paginatitel: ${artikel.title}` : null,
    artikel.description ? `Metabeschrijving: ${artikel.description}` : null,
    artikel.publishedOn ? `Datum uit de metagegevens: ${artikel.publishedOn}` : null,
    '',
    'Tekst van het artikel:',
    '---',
    artikel.text || '(geen lopende tekst gevonden; gebruik de metabeschrijving)',
    '---'
  ].filter((regel) => regel !== null).join('\n');
}

/** Grenzen klem je in JS af, niet in het schema. Zie de toelichting bovenaan. */
function knip(value, max) {
  const v = typeof value === 'string' ? value.trim() : '';
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
}

/**
 * Tekst vergelijkbaar maken.
 *
 * Wat we WEL gelijkschakelen: witruimte, krulletjes-aanhalingstekens en
 * -apostroffen, verschillende soorten streepjes, en hoofdletters. Dat zijn
 * verschillen die ontstaan bij het overnemen van een zin en die niets zeggen
 * over de herkomst.
 *
 * Wat we NIET gelijkschakelen: woorden. Een citaat dat andere woorden
 * gebruikt dan het artikel, is geen citaat.
 */
function normaliseerVoorVergelijking(value) {
  return String(value || '')
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Staat dit citaat LETTERLIJK in de tekst?
 *
 * Een te kort "citaat" telt niet: drie woorden staan bijna altijd wel ergens,
 * en dat zou de controle waardeloos maken zonder dat iemand het merkt.
 */
export function citaatKomtVoor(tekst, citaat) {
  const naald = normaliseerVoorVergelijking(citaat);
  if (naald.length < 25) return false;
  return normaliseerVoorVergelijking(tekst).includes(naald);
}

/**
 * Analyseer een opgehaald artikel.
 *
 * @param {Object} env
 * @param {Object} user - de ingelogde gebruiker; komt in de audit-regel
 * @param {Object} artikel - uit fetchArticle()
 * @param {Array<{id:number,name:string}>} tags - de bestaande labels
 * @param {Object} [opties]
 * @param {string} [opties.audience] - waarde van de gekozen doelgroep
 * @param {string} [opties.audienceLabel] - wat de marketeer las in het menu
 * @returns {Promise<Object>} voorstel voor het bewerkscherm
 */
export async function analyseerArtikel(env, user, artikel, tags = [], opties = {}) {
  // Het LABEL gaat naar de AI, niet de technische waarde: "Syndici en
  // vastgoedbeheerders" stuurt een samenvatting, "syndicus_pro" niet.
  const doelgroep = (opties.audienceLabel || '').trim() || null;
  const schema = bouwSchema(tags, doelgroep);

  const t0 = Date.now();
  const result = await askAI(
    env,
    // Geen mini-app, wel een bron. Zie de toelichting bovenaan.
    { id: null, source: AI_SOURCE },
    user,
    {
      model: MODEL,
      system: SYSTEM,
      prompt: bouwPrompt(artikel, doelgroep),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      schema
    }
  );

  // De provider levert bij een schema-aanroep al een GEPARST object in
  // `result.json` (zie het return-blok van ai-providers/anthropic.js). Zelf
  // nog eens JSON.parse doen zou een tweede plek zijn die kan falen; `text`
  // blijft enkel als terugval staan.
  let voorstel = result.json;
  if (!voorstel || typeof voorstel !== 'object') {
    try {
      voorstel = JSON.parse(result.text);
    } catch (error) {
      console.error(`${LOG_PREFIX} AI gaf geen geldige JSON terug:`, error?.message);
      throw aiError(
        AI_ERROR_CODES.PROVIDER_ERROR,
        'De AI gaf een onverwacht antwoord terug.',
        { phase: AI_ERROR_PHASES.RESPONSE }
      );
    }
  }

  const geldigeTagIds = new Set(tags.map((t) => t.id));
  const tagIds = Array.isArray(voorstel.tagIndices)
    ? voorstel.tagIndices
      .map((i) => tags[Number(i)]?.id)
      .filter((id) => geldigeTagIds.has(id))
      .slice(0, 2)
    : [];

  /* Het citaat NAMETEN tegen de opgehaalde tekst. Een verzonnen citaat is
     hier de ergste fout die dit scherm kan maken: het komt tussen
     aanhalingstekens op een publieke pagina te staan, toegeschreven aan een
     bron, en de lezer kan het niet narekenen. De prompt vraagt om een
     letterlijk citaat; dit controleert of dat ook gebeurd is. */
  const ruwCitaat = knip(voorstel.quote, 400);
  const citaatKlopt = ruwCitaat ? citaatKomtVoor(artikel.text, ruwCitaat) : true;
  if (ruwCitaat && !citaatKlopt) {
    console.warn(
      `${LOG_PREFIX} citaat kwam NIET letterlijk in het artikel voor en is `
      + `weggelaten (${artikel.url})`
    );
  }

  const kleur = TIMELINE_COLORS.includes(voorstel.color) ? voorstel.color : 'default';
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(voorstel.publishedOn || ''))
    ? voorstel.publishedOn
    : (artikel.publishedOn || null);

  console.log(
    `${LOG_PREFIX} artikel geanalyseerd in ${Date.now() - t0}ms `
    + `(${result.usage?.tokensIn || '?'} in / ${result.usage?.tokensOut || '?'} uit, `
    + `model ${result.model || MODEL}, stop ${result.stopReason || '?'})`
  );

  return {
    /* De TITEL is de interne naam: waarop je dit bericht terugvindt in de
       lijst. Dat is de KOP, niet de paginatitel -- die laatste is bij
       sociale media en veel nieuwssites de SITE-titel ("OpenVME | Syndicus
       software (@openvme) - Instagram-foto's en -video's"), en daar vind je
       niets mee terug. Sinds de AI een duidelijke kop letterlijk overneemt,
       IS summaryTitle de echte kop van het artikel; de paginatitel blijft
       enkel als terugval. */
    title: knip(voorstel.summaryTitle || artikel.title, 200),
    audience: opties.audience || null,
    summaryTitle: knip(voorstel.summaryTitle, 120),
    curatorNote: knip(voorstel.curatorNote, 200),
    summary: knip(voorstel.summary, 600),
    quote: citaatKlopt ? ruwCitaat : '',
    // Het scherm zegt dit erbij. Stil niets tonen zou lezen als een AI die
    // geen citaat vond, terwijl ze er wél een gaf -- alleen geen echt.
    quoteRejected: Boolean(ruwCitaat) && !citaatKlopt,
    source: knip(voorstel.source || artikel.siteName || '', 80),
    publishedOn: datum,
    cta: knip(voorstel.cta, 40) || 'Lees verder',
    url: artikel.url,
    color: kleur,
    tagIds,
    relevance: ['hoog', 'gemiddeld', 'laag'].includes(voorstel.relevance)
      ? voorstel.relevance
      : 'gemiddeld',
    // De afbeelding wordt NIET hier opgehaald: het voorstel gaat eerst naar
    // het scherm, en pas bij het bewaren halen we de bytes binnen. Anders
    // betaal je de download van elk artikel dat iemand toch niet plaatst.
    imageSourceUrl: artikel.imageUrl || null
  };
}
