/**
 * AV-slides -- weetjes: kandidaatzinnen voor het blok "Wist je dat…".
 *
 * Een LIJST die mag groeien. Elke bron is een functie die zinnen teruggeeft; de
 * redacteur kiest er in het scherm een of meer uit en mag ze herschrijven. Er
 * komt nooit automatisch iets op de slide dat niet in die lijst stond.
 *
 * Een nieuw weetje toevoegen = een functie in BRONNEN. Ze krijgt de AV-maand en
 * geeft `[{ id, group, label, text, note? }]`. Faalt ze, dan valt enkel zij weg.
 *
 * De cijfers gaan altijd over de VORIGE kalendermaand (een AV in oktober vertelt
 * over september), vergeleken met de maand daarvoor. De websitecijfers gebruiken
 * dezelfde sessies, kanaalindeling en uitsluitingen als het dashboard en
 * Webgedrag: prospecten (geen klanten, geen enkel-inloggen), zonder testpagina's
 * en zonder wie uitgesloten is. Er is geen tweede definitie van een bezoek.
 */

import { executeKw } from '../../../lib/odoo.js';
import { hasWebEvents } from '../../../lib/web-events.js';
import {
  readSessionRows, readFirstLogins, readReopenedClicks,
  channelOf, isLoginOnly, isCustomerSession, isTestPage,
} from '../../dashboards/lib/web-visits.js';
import { loadExclusions } from '../../web-story/lib/exclusions.js';

// Live meten begon op 29-09-2026; alles daarvoor is gesaneerde oude historiek.
const LIVE_SINDS = '2026-09-29';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
  'september', 'oktober', 'november', 'december'];

export function vorigeMaand(maand) {
  const [j, m] = maand.split('-').map(Number);
  return m === 1 ? `${j - 1}-12` : `${j}-${String(m - 1).padStart(2, '0')}`;
}

function volgendeMaand(maand) {
  const [j, m] = maand.split('-').map(Number);
  return m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, '0')}`;
}

function naam(maand) {
  return MAANDEN[Number(maand.slice(5, 7)) - 1];
}

function grenzen(maand) {
  return { start: `${maand}-01 00:00:00`, end: `${volgendeMaand(maand)}-01 00:00:00` };
}

function getal(n) {
  return Number(n).toLocaleString('nl-BE');
}

function verschil(n, p, vorige) {
  if (p === null || p === undefined) return '';
  if (n > p) return `, ${getal(n - p)} meer dan in ${naam(vorige)}`;
  if (n < p) return `, ${getal(p - n)} minder dan in ${naam(vorige)}`;
  return `, evenveel als in ${naam(vorige)}`;
}

function procent(n, p, vorige) {
  if (!p) return '';
  const pct = Math.round(((n - p) / p) * 100);
  if (pct === 0) return ` (evenveel als in ${naam(vorige)})`;
  return ` (${pct > 0 ? '+' : ''}${pct}% tegenover ${naam(vorige)})`;
}

async function tel(env, model, maand, extra = [], context) {
  const g = grenzen(maand);
  return executeKw(env, {
    model,
    method: 'search_count',
    args: [[['create_date', '>=', g.start], ['create_date', '<', g.end], ...extra]],
    kwargs: context ? { context } : {},
  });
}

// ── Bronnen ─────────────────────────────────────────────────────────────────

async function leads(env, m1, m0) {
  // Ook verloren en gearchiveerde leads: ze kwamen in die maand binnen.
  const [n, p] = await Promise.all([
    tel(env, 'crm.lead', m1, [], { active_test: false }),
    tel(env, 'crm.lead', m0, [], { active_test: false }),
  ]);
  return [{
    id: 'leads',
    group: 'cijfer',
    label: 'Nieuwe leads in Odoo',
    text: `In ${naam(m1)} kwamen er ${getal(n)} nieuwe leads binnen${verschil(n, p, m0)}.`,
  }];
}

async function inschrijvingen(env, m1, m0) {
  // Gearchiveerde inschrijvingen zijn verwijderde: die tellen niet.
  const [n, p] = await Promise.all([
    tel(env, 'x_webinarregistrations', m1),
    tel(env, 'x_webinarregistrations', m0),
  ]);
  if (!n) return [];
  return [{
    id: 'inschrijvingen',
    group: 'cijfer',
    label: 'Inschrijvingen voor events',
    text: `In ${naam(m1)} kwamen er ${getal(n)} inschrijvingen binnen voor onze events${verschil(n, p, m0)}.`,
  }];
}

function siteNaam(site) {
  return String(site || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

function telSessies(rows, firstLogins, reopened, excl, grens) {
  const leeg = () => ({ bezoeken: 0, aanvragen: 0, kanalen: {}, paginas: {}, zoek: {} });
  const per = { nu: leeg(), vorige: leeg() };
  for (const r of rows) {
    let pages = [];
    try { pages = JSON.parse(r.pg || '[]').filter(Boolean); } catch { pages = []; }
    if (pages.some(isTestPage)) continue;
    if (excl.uuids.has(r.u)) continue;
    if (isLoginOnly(r) || isCustomerSession(firstLogins, r)) continue;
    const b = r.st >= grens ? per.nu : per.vorige;
    b.bezoeken++;
    b.aanvragen += (Number(r.fs) || 0) + (Number(r.ca) || 0);
    const [kanaal] = channelOf(r, reopened);
    b.kanalen[kanaal] = (b.kanalen[kanaal] || 0) + 1;
    const site = siteNaam(r.site);
    for (const p of new Set(pages)) {
      if (p === '/') continue;
      const sleutel = `${site}${p}`;
      b.paginas[sleutel] = (b.paginas[sleutel] || 0) + 1;
    }
    let zoek = [];
    try { zoek = JSON.parse(r.zq || '[]').filter(Boolean); } catch { zoek = []; }
    for (const z of new Set(zoek.map((x) => String(x).trim().toLowerCase()).filter(Boolean))) {
      b.zoek[z] = (b.zoek[z] || 0) + 1;
    }
  }
  return per;
}

function grootste(obj) {
  let beste = null;
  for (const [k, v] of Object.entries(obj)) if (!beste || v > beste[1]) beste = [k, v];
  return beste;
}

async function website(env, m1, m0) {
  if (!hasWebEvents(env)) return [];
  const g1 = grenzen(m1);
  const g0 = grenzen(m0);
  const [{ rows }, firstLogins, reopened, excl] = await Promise.all([
    readSessionRows(env, g0.start, g1.end),
    readFirstLogins(env),
    readReopenedClicks(env),
    loadExclusions(env),
  ]);
  const { nu, vorige } = telSessies(rows, firstLogins, reopened, excl, g1.start);
  if (!nu.bezoeken) return [];

  const historiek = g1.start.slice(0, 10) < LIVE_SINDS || g0.start.slice(0, 10) < LIVE_SINDS;
  const noot = historiek
    ? 'Deels oude historiek (van voor 29-09-2026). Daarin zijn korte bezoeken gedeeltelijk weggesaneerd, dus lees de vergelijking met de vorige maand met voorzichtigheid.'
    : '';
  const uit = [];

  uit.push({
    id: 'bezoeken',
    group: 'website',
    label: 'Websitebezoeken door prospecten',
    text: `In ${naam(m1)} kregen onze websites ${getal(nu.bezoeken)} bezoeken van prospecten${procent(nu.bezoeken, vorige.bezoeken, m0)}.`,
    note: noot,
  });

  if (nu.aanvragen) {
    uit.push({
      id: 'aanvragen',
      group: 'website',
      label: 'Aanvragen via de websites',
      text: `In ${naam(m1)} vroegen bezoekers ${getal(nu.aanvragen)} keer iets aan via onze websites (formulier of afspraak)${verschil(nu.aanvragen, vorige.aanvragen, m0)}.`,
      note: 'Formulieren en Calendly-boekingen die aan een websitebezoek hangen.',
    });
  }

  const pagina = grootste(nu.paginas);
  if (pagina) {
    uit.push({
      id: 'pagina',
      group: 'website',
      label: 'Populairste pagina',
      text: `De populairste pagina in ${naam(m1)} (na de homepage) was ${pagina[0]}, in ${getal(pagina[1])} bezoeken.`,
    });
  }

  const kanaal = grootste(nu.kanalen);
  if (kanaal) {
    uit.push({
      id: 'kanaal',
      group: 'website',
      label: 'Grootste kanaal',
      text: `${Math.round((kanaal[1] / nu.bezoeken) * 100)}% van de websitebezoeken in ${naam(m1)} kwam via ${kanaal[0].toLowerCase()}.`,
    });
  }

  let groei = null;
  for (const [k, n] of Object.entries(nu.kanalen)) {
    const p = vorige.kanalen[k] || 0;
    if (n < 10 || p < 5 || k === 'Direct / onbekend') continue;
    const g = (n - p) / p;
    if (g > 0 && (!groei || g > groei.g)) groei = { k, n, p, g };
  }
  if (groei) {
    uit.push({
      id: 'groei',
      group: 'website',
      label: 'Snelst groeiend kanaal',
      text: `Het kanaal dat in ${naam(m1)} het hardst groeide: ${groei.k.toLowerCase()}, met ${getal(groei.n)} bezoeken${procent(groei.n, groei.p, m0)}.`,
      note: noot,
    });
  }

  const zoekterm = grootste(nu.zoek);
  if (zoekterm && zoekterm[1] >= 2) {
    uit.push({
      id: 'zoekterm',
      group: 'website',
      label: 'Meest gezocht op de site',
      text: `Waar zochten bezoekers in ${naam(m1)} het meest naar op onze sites? "${zoekterm[0]}" (${getal(zoekterm[1])} keer).`,
    });
  }
  return uit;
}

const BRONNEN = [leads, inschrijvingen, website];

/**
 * @param {object} env
 * @param {string} avMaand  JJJJ-MM van de AV
 * @returns {Promise<{ insights: Array, meldingen: string[] }>}
 */
export async function verzamelInzichten(env, avMaand) {
  const m1 = vorigeMaand(avMaand);
  const m0 = vorigeMaand(m1);
  const uitkomsten = await Promise.allSettled(BRONNEN.map((bron) => bron(env, m1, m0)));
  const insights = [];
  const meldingen = [];
  uitkomsten.forEach((u, i) => {
    if (u.status === 'fulfilled') insights.push(...u.value);
    else {
      console.warn('[av-slides] weetje mislukt:', BRONNEN[i].name, u.reason?.message);
      meldingen.push(`Weetjes uit "${BRONNEN[i].name}" niet gelezen: ${u.reason?.message || 'onbekende fout'}`);
    }
  });
  return { insights, meldingen };
}
