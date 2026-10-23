/**
 * Websitegedrag in het dossier: dezelfde gegevens en dezelfde lezing als het
 * tabblad Marketing in Dashboards (web-story/lib/story-data.js), geen tweede
 * definitie van een bezoek of een kanaal.
 *
 *   koppelingen lead <-> bezoeker   linksForLeads()       (D1, de tracker)
 *   bezoeken per browser            readVisitorSessions() (D1)
 *   hoe de lead bij ons kwam        buildJourney()        (eerste / laatste aanraking)
 *
 * Bots en afgewezen koppelingen tellen niet; een collega-browser (intern /
 * test) wel, met dat label erbij, zoals op de lead.
 */

import { linksForLeads } from '../../web-story/lib/story-data.js';
import { readVisitorSessions } from '../../dashboards/lib/web-visits.js';
import { buildJourney } from '../../web-story/lib/journey.js';

const MAX_BROWSERS = 20;

/** Pagina's die op koopintentie wijzen. */
const INTENTIE = [
  [/tarief|tarieven|prijs|prijzen|pricing|kost/i, 'prijzen'],
  [/offerte|devis|quote/i, 'offerte'],
  [/demo|kennismak|afspraak|rendez/i, 'demo / afspraak'],
  [/registr|inschrijv|aanmeld|signup|starten/i, 'registreren'],
];

const ACTIES = {
  forms: 'formulier', offerte: 'offerteaanvraag', calendly: 'afspraak', events: 'event',
  newsletter: 'nieuwsbrief', academy: 'academy', register: 'registratie gestart',
};

const dag = (s) => (s ? String(s).slice(0, 10) : '');
const kortDag = (s) => { const [j, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}/${m}${j !== String(new Date().getUTCFullYear()) ? '/' + j : ''}` : ''; };

function acties(s) {
  return Object.entries(ACTIES).filter(([k]) => (s.conversions?.[k] || 0) > 0).map(([, v]) => v);
}

/**
 * @returns {Promise<{regels: string[], signalen: string[]}|null>} null = geen koppeling met de website
 */
export async function webGedrag(env, leads) {
  if (!env.WEB_EVENTS || !leads.length) return null;
  const links = (await linksForLeads(env, leads.map((l) => l.id)))
    .filter((l) => l.status !== 'afgewezen' && !l.is_bot);
  const uuids = [...new Set(links.map((l) => l.visitor_uuid))].slice(0, MAX_BROWSERS);
  if (!uuids.length) return { regels: ['- Geen bezoeken op de website gekoppeld aan deze lead(s).'], signalen: [], samenvatting: 'geen bezoeken gekend' };

  const intern = new Set(links.filter((l) => l.is_internal).map((l) => l.visitor_uuid));
  const sessies = (await readVisitorSessions(env, uuids, { includeInternal: true }))
    .filter((s) => !s.loginOnly && !s.test);
  const eersteLead = leads.map((l) => l.create_date).filter(Boolean).sort()[0] || null;
  const j = buildJourney(sessies, { conversionAt: eersteLead });

  const regels = [];
  const signalen = [];
  const emails = [...new Set(links.map((l) => l.email).filter(Boolean))];
  regels.push(`- ${sessies.length} bezoek(en) van ${uuids.length} browser(s)${emails.length ? ' (' + emails.slice(0, 3).join(', ') + ')' : ''}`
    + (intern.size ? `, waarvan ${intern.size} browser(s) van een collega (intern / test)` : '') + '.');
  if (j) {
    regels.push(`- Eerste aanraking: ${dag(j.eerste.ts)} via ${j.eerste.channel}${j.eerste.detail ? ' (' + j.eerste.detail + ')' : ''}${j.eerste.historic && !/oude historiek/.test(j.eerste.channel) ? ', oude historiek: bron minder zeker' : ''}.`);
    if (j.laatste) regels.push(`- Laatste aanraking voor de aanvraag: ${dag(j.laatste.ts)} via ${j.laatste.channel}${j.laatste.detail ? ' (' + j.laatste.detail + ')' : ''}.`);
    regels.push(`- Weg naar ons: ${j.pad.map((p) => p.channel + (p.n > 1 ? ` ×${p.n}` : '')).join(' → ')}`
      + (j.dagen !== null ? `, ${j.dagen} dag(en) van eerste bezoek tot aanvraag` : '') + '.');
    if (j.na > 0) {
      regels.push(`- Na de aanvraag nog ${j.na} bezoek(en) teruggekomen.`);
    }
  }

  // Recente bezoeken, nieuwste eerst.
  const recent = [...sessies].sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 8);
  if (recent.length) {
    regels.push('- Recente bezoeken:');
    for (const s of recent) {
      const a = acties(s);
      const paginas = s.pages.slice(0, 6).map((p) => p.replace(/^https?:\/\/[^/]+/, '')).join(', ');
      regels.push(`  - ${s.start ? String(s.start).slice(0, 16).replace('T', ' ') : '?'} · ${s.site || ''} · ${s.channel}${s.detail ? ' (' + s.detail + ')' : ''}`
        + `${intern.has(s.uuid) ? ' · intern/test' : ''}${s.pages.length ? ` · ${s.pages.length} pagina('s): ${paginas}` : ''}${a.length ? ' · ACTIE: ' + a.join(', ') : ''}`);
    }
  }

  // Wat ze bekeken, over alle bezoeken.
  const teller = new Map();
  sessies.forEach((s) => s.pages.forEach((p) => {
    const pad = p.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '/';
    teller.set(pad, (teller.get(pad) || 0) + 1);
  }));
  const top = [...teller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) regels.push(`- Meest bekeken: ${top.map(([p, n]) => `${p} (${n}×)`).join(', ')}`);

  // Signalen voor sales: recent terug, en pagina's met koopintentie.
  const laatste = recent[0];
  if (laatste && !intern.has(laatste.uuid)) {
    const dagenGeleden = Math.round((Date.now() - Date.parse(laatste.start)) / 86400000);
    if (dagenGeleden <= 7 && j && j.na > 0) signalen.push(`Kwam ${dagenGeleden === 0 ? 'vandaag' : dagenGeleden + ' dag(en) geleden'} terug op de website, na de aanvraag.`);
    const bekeken = new Set();
    sessies.filter((s) => Date.now() - Date.parse(s.start) < 30 * 86400000 && !intern.has(s.uuid))
      .forEach((s) => s.pages.forEach((p) => INTENTIE.forEach(([re, label]) => { if (re.test(p)) bekeken.add(label); })));
    if (bekeken.size) signalen.push(`Bekeek de laatste 30 dagen: ${[...bekeken].join(', ')}.`);
  }
  // Een regel voor "In het kort": hoeveel, wanneer laatst, en hoe ze ons vonden.
  const extern = sessies.filter((s) => !intern.has(s.uuid));
  const laatsteBezoek = [...extern].sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  const samenvatting = extern.length
    ? [`${extern.length} bezoek${extern.length === 1 ? '' : 'en'}`,
      laatsteBezoek ? `laatst ${kortDag(laatsteBezoek.start)}` : null,
      j ? `vond ons via ${j.eerste.channel}` : null,
      j && j.na > 0 ? `${j.na} keer terug na de aanvraag` : null].filter(Boolean).join(' · ')
    : "enkel bezoeken van collega's (test)";
  return { regels, signalen, samenvatting };
}
