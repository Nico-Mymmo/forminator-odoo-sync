/**
 * Opvolging -- de SEQUENTIE: hoe een nieuwe aanvraag opgevolgd wordt.
 *
 * Een sequentie is een vaste reeks beltaken, ingesteld in CX Automations ->
 * Opvolging (opv_instellingen, sleutel 'sequentie'):
 *
 *   eerste    de beltaak bij elke nieuwe kans ("Nieuwe lead opvolgen", type
 *             "Syndicoach - Nieuwe aanvraag"), na X werkdagen (standaard 1)
 *   pogingen  na een oproep ZONDER contact (voicemail of nam niet op): de
 *             volgende beltaak, X werkdagen na die oproep; de eerste poging
 *             hoort bij de eerste rij, de tweede bij de tweede, ...
 *   einde     na de laatste poging zonder contact: een taak om te beslissen
 *
 * Contact (de klant nam op, belde zelf terug, mailde, had een meeting) stopt
 * de sequentie: wat daarna komt, plant de verkoper zelf. Belt hij later toch
 * opnieuw zonder antwoord, dan telt de sequentie vanaf dat contact opnieuw.
 *
 * De OM plant de taken zelf, op twee momenten: meteen na het registreren van
 * een oproep (in Odoo via de act_url van serveractie 1207, in Mijn taken via
 * gesprek.js), en als vangnet elke 5 minuten in de cron. Elke stap wordt EEN
 * keer gepland (vlag in KV): vinkt of verwijdert de verkoper een taak, dan
 * komt ze niet terug. Staat er al een beltaak open, dan plant de OM niets.
 */

import { executeKw } from '../../../lib/odoo.js';
import { getCoreDb } from '../../../lib/core-db.js';
import { UITKOMSTEN, LOG_PREFIX, vandaag, plusWerkdagen, korteDatum, esc, OpvolgingError } from './constants.js';

const KV = 'opvolging:seq:';
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

// Activiteitstypes in Odoo: 25 = "Syndicoach - Nieuwe aanvraag" (de taak
// "Nieuwe lead opvolgen" van de koppelingen), 2 = Call, 4 = To-Do.
export const STANDAARD = {
  actief: true,
  actief_vanaf: '2026-10-30',
  eerste: { titel: 'Nieuwe lead opvolgen', na_werkdagen: 1, type_id: 25 },
  pogingen: [
    { titel: 'Terugbellen (poging 2)', na_werkdagen: 1 },
    { titel: 'Terugbellen (poging 3)', na_werkdagen: 2 },
    { titel: 'Laatste keer bellen', na_werkdagen: 3 },
  ],
  poging_type_id: 2,
  einde: { aan: true, titel: 'Geen contact na alle pogingen: beslissen (mail sturen of verloren zetten)', na_werkdagen: 2, type_id: 4 },
};

function getal(v, min, max, terug) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : terug;
}
function tekst(v, terug) {
  const t = String(v ?? '').trim().slice(0, 120);
  return t || terug;
}

/** Een sequentie van een gebruiker nakijken en aanvullen. Gooit bij iets onbruikbaars. */
export function normaliseerSequentie(invoer = {}) {
  const s = STANDAARD;
  const pogingen = Array.isArray(invoer.pogingen) ? invoer.pogingen : s.pogingen;
  if (pogingen.length > 8) throw new OpvolgingError('Hoogstens 8 pogingen.');
  const vanaf = String(invoer.actief_vanaf || s.actief_vanaf);
  if (!DATUM_RE.test(vanaf)) throw new OpvolgingError('"Actief vanaf" is geen geldige datum.');
  const e = invoer.eerste || {};
  const ei = invoer.einde || {};
  return {
    actief: invoer.actief !== false,
    actief_vanaf: vanaf,
    eerste: {
      titel: tekst(e.titel, s.eerste.titel),
      na_werkdagen: getal(e.na_werkdagen, 0, 10, s.eerste.na_werkdagen),
      type_id: getal(e.type_id, 1, 100000, s.eerste.type_id),
    },
    pogingen: pogingen.map((p, i) => ({
      titel: tekst(p?.titel, `Terugbellen (poging ${i + 2})`),
      na_werkdagen: getal(p?.na_werkdagen, 0, 30, 1),
    })),
    poging_type_id: getal(invoer.poging_type_id, 1, 100000, s.poging_type_id),
    einde: {
      aan: ei.aan !== false,
      titel: tekst(ei.titel, s.einde.titel),
      na_werkdagen: getal(ei.na_werkdagen, 0, 30, s.einde.na_werkdagen),
      type_id: getal(ei.type_id, 1, 100000, s.einde.type_id),
    },
  };
}

let cache = null; // { t, cfg }

export async function leesSequentie(env, { vers = false } = {}) {
  if (!vers && cache && Date.now() - cache.t < 60 * 1000) return cache.cfg;
  let cfg = STANDAARD;
  try {
    const { data } = await getCoreDb(env).from('opv_instellingen').select('waarde').eq('sleutel', 'sequentie').maybeSingle();
    if (data?.waarde) cfg = normaliseerSequentie(data.waarde);
  } catch (err) {
    console.warn(LOG_PREFIX, 'sequentie niet gelezen, standaard gebruikt', err?.message);
  }
  cache = { t: Date.now(), cfg };
  return cfg;
}

export async function bewaarSequentie(env, invoer, doorNaam) {
  const cfg = normaliseerSequentie(invoer);
  const { error } = await getCoreDb(env).from('opv_instellingen')
    .upsert({ sleutel: 'sequentie', waarde: cfg, door_naam: doorNaam || null }, { onConflict: 'sleutel' });
  if (error) throw new OpvolgingError('Bewaren mislukt: ' + error.message, 500);
  cache = { t: Date.now(), cfg };
  return cfg;
}

/**
 * Elk contactmoment op een tijdlijn, oudste eerst (puur). `contact` = echt
 * contact (nam op, belde terug, mailde zelf, had een meeting); anders een
 * poging van ons. Gebruikt door de sequentie EN het paneel.
 */
export function contactmomenten({ gespr = [], mails: ml = [], meet = [] }, nuMs = Date.now()) {
  const uit = [];
  for (const g of gespr) {
    const u = UITKOMSTEN[g.uitkomst];
    if (g.datum) uit.push({ soort: 'oproep', uitkomst: g.uitkomst, id: g.id, datum: g.datum, contact: u.soort === 'contact', tekst: u.label, door: g.door });
  }
  for (const m of ml) {
    if (m.datum) uit.push({ soort: m.inkomend ? 'mail_in' : 'mail_uit', datum: m.datum, contact: m.inkomend, tekst: m.inkomend ? 'Klant mailde' : 'Mail gestuurd', door: m.inkomend ? '' : m.van });
  }
  for (const m of meet) {
    if (m.start && m.start.getTime() <= nuMs) uit.push({ soort: 'meeting', datum: m.start, contact: true, tekst: 'Meeting gehad', door: '' });
  }
  return uit.sort((a, b) => a.datum - b.datum);
}

/**
 * Waar staat deze kans in de sequentie? (puur)
 *   pogingen   de oproepen zonder contact sinds het laatste contact (oudste eerst)
 *   contact    het laatste echte contact, of null
 *   in_seq     hoort de kans bij de sequentie (nieuw genoeg, of al pogingen)
 *   stap       de taak die de OM nu zou plannen, of null: { sleutel, titel, type_id, deadline, nr, note }
 */
export function sequentieStand(lead, ctx, cfg, nu = vandaag(), nuMs = Date.now()) {
  const momenten = contactmomenten(ctx, nuMs);
  const contactIdx = momenten.map(m => m.contact).lastIndexOf(true);
  const contact = contactIdx >= 0 ? momenten[contactIdx] : null;
  const pogingen = momenten.slice(contactIdx + 1).filter(m => m.soort === 'oproep' && !m.contact);
  const aangemaakt = String(lead.create_date || '').slice(0, 10);
  const nieuw = aangemaakt && aangemaakt >= cfg.actief_vanaf;
  // Een oude kans doet enkel mee met een oproep van na de start: anders plant de
  // eerste ronde een taak op elke kans met een oude poging van de vroegere knoppen.
  const recent = pogingen.length > 0 && vandaag(pogingen[pogingen.length - 1].datum) >= cfg.actief_vanaf;
  const in_seq = cfg.actief && (nieuw || recent);
  const totaal = 1 + cfg.pogingen.length;
  const uit = { momenten, contact, pogingen, in_seq, totaal, stap: null };
  if (!in_seq || !lead.active || lead.type !== 'opportunity') return uit;

  if (!pogingen.length) {
    if (contact || !nieuw) return uit; // na contact plant de verkoper zelf
    uit.stap = {
      sleutel: 'eerste', nr: 1, titel: cfg.eerste.titel, type_id: cfg.eerste.type_id,
      deadline: plusWerkdagen(aangemaakt, cfg.eerste.na_werkdagen),
      note: '<p>Eerste stap van de opvolging: bel de klant.</p>',
    };
    return uit;
  }
  const laatste = pogingen[pogingen.length - 1];
  const dag = vandaag(laatste.datum);
  const vorige = `<p>Vorige poging: ${esc(laatste.tekst.toLowerCase())} op ${esc(korteDatum(dag))}${laatste.door ? ` (${esc(laatste.door)})` : ''}.</p>`;
  const i = pogingen.length - 1;
  if (i < cfg.pogingen.length) {
    const p = cfg.pogingen[i];
    uit.stap = {
      sleutel: `p:${laatste.id || dag}`, nr: i + 2, titel: p.titel, type_id: cfg.poging_type_id,
      deadline: plusWerkdagen(dag, p.na_werkdagen),
      note: `<p>Poging ${i + 2} van ${totaal} in de opvolging.</p>${vorige}`,
    };
  } else if (i === cfg.pogingen.length && cfg.einde.aan) {
    uit.stap = {
      sleutel: `e:${laatste.id || dag}`, nr: totaal + 1, titel: cfg.einde.titel, type_id: cfg.einde.type_id,
      deadline: plusWerkdagen(dag, cfg.einde.na_werkdagen),
      note: `<p>Alle ${totaal} pogingen zonder contact.</p>${vorige}`, einde: true,
    };
  }
  return uit;
}

/**
 * De sequentie toepassen op een reeks kansen: plant de stap die nog ontbreekt.
 * `ctx(id)` geeft { acts, gespr, mails, meet }. Geeft het aantal geplande taken.
 * mode 'on' = echt plannen, anders enkel loggen.
 */
export async function pasSequentieToe(env, kansen, ctx, { mode = env.OPVOLGING_PANEEL_MODE, cfg = null } = {}) {
  const c = cfg || (await leesSequentie(env));
  if (!c.actief) return 0;
  const nu = vandaag();
  let gepland = 0;
  for (const lead of kansen) {
    try {
      const k = ctx(lead.id);
      const { stap } = sequentieStand(lead, k, c, nu);
      if (!stap) continue;
      if ((k.acts || []).some(a => a.bellen || (stap.einde && a.type === stap.type_id))) continue; // er staat al iets open
      const vlag = `${KV}${lead.id}:${stap.sleutel}`;
      if (env.MAPPINGS_KV && (await env.MAPPINGS_KV.get(vlag))) continue; // al een keer gepland
      const voor = Array.isArray(lead.user_id) ? lead.user_id[0] : null;
      if (!voor) continue; // zonder verkoper: het paneel meldt "Geen verkoper"
      if (mode !== 'on') { console.log(LOG_PREFIX, 'sequentie zou plannen', lead.id, stap.titel, stap.deadline); continue; }
      await executeKw(env, {
        model: 'crm.lead', method: 'activity_schedule', args: [[lead.id]],
        kwargs: { activity_type_id: stap.type_id, date_deadline: stap.deadline, summary: stap.titel, note: stap.note, user_id: voor },
      });
      if (env.MAPPINGS_KV) await env.MAPPINGS_KV.put(vlag, nu, { expirationTtl: 400 * 86400 });
      gepland++;
    } catch (err) {
      console.error(LOG_PREFIX, 'sequentie', lead.id, err?.message);
    }
  }
  return gepland;
}
