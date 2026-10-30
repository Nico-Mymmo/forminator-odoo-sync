/**
 * Het controlepaneel bovenaan de kans in Odoo.
 *
 * De OM schrijft het als HTML in het Studio-veld PANEEL_VELD op crm.lead, net
 * zoals het webgedrag op lead en actieblad (web-story/lib/push.js). Bovenaan
 * staat waar de kans staat, daaronder enkel de knoppen die nu zin hebben. Een
 * knop is een link naar Mijn taken in Projecten (de takenlijst van de
 * medewerker): het venster daar doet het werk en schrijft terug.
 *
 * OPVOLGING_PANEEL_MODE (Worker-variabele) bepaalt wat er gebeurt -- leeg =
 * NIETS, dus een deploy op zich verandert nooit iets in Odoo:
 *   dry  berekenen en loggen wat er naar Odoo zou gaan
 *   on   echt schrijven
 *
 * Een kans wordt enkel geschreven als het paneel echt veranderde (hash in KV;
 * het tijdstip onderaan telt niet mee). Inline stijl: altijd `background-color`,
 * nooit de shorthand `background` (Odoo's sanitizer knipt die stil weg).
 */

import { write } from '../../../lib/odoo.js';
import { openKansen, leesLead, activiteiten, gesprekken, mails, meetings, heeftVelden } from './odoo-data.js';
import { UITKOMSTEN, LOG_PREFIX, vandaag, dagenTussen, korteDatum, geleden, brusselsStempel, esc } from './constants.js';

export const PANEEL_VELD = 'x_studio_om_paneel_html';
const KV = 'opvolging:paneel:';
const MAX_SCHRIJVEN = 200;

const KLEUR = {
  goed: { bg: '#ecfdf5', fg: '#047857' },
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  let: { bg: '#fffbeb', fg: '#b45309' },
  laat: { bg: '#fef2f2', fg: '#b91c1c' },
  stil: { bg: '#f3f4f6', fg: '#4b5563' },
};

// Het adres waarop collega's aangemeld zijn. NIET APP_BASE_URL: dat is het
// workers.dev-adres, en daar heeft niemand een sessie (dan eerst opnieuw aanmelden).
function basis(env) {
  return String(env.OM_PUBLIC_ORIGIN || 'https://operations.openvme.be').replace(/\/+$/, '');
}

function pil(tekst, toon, uitleg = '') {
  const k = KLEUR[toon] || KLEUR.stil;
  return `<span${uitleg ? ` title="${esc(uitleg)}"` : ''} style="display:inline-block;padding:2px 9px;margin:1px 4px 1px 0;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background-color:${k.bg};color:${k.fg};">${esc(tekst)}</span>`;
}

function knop(tekst, url, hoofd) {
  const stijl = hoofd
    ? 'background-color:#1d4ed8;color:#ffffff;border:1px solid #1d4ed8;'
    : 'background-color:#ffffff;color:#1d4ed8;border:1px solid #93c5fd;';
  return `<a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:3px 12px;margin-left:6px;border-radius:7px;font-size:12px;font-weight:600;white-space:nowrap;text-decoration:none;${stijl}">${esc(tekst)}</a>`;
}

/**
 * Alles wat het paneel van een reeks kansen nodig heeft, in bulk. Per kans:
 * { acts, gespr, mails, meet } (zie odoo-data.js).
 */
export async function laadContext(env, kansen) {
  const ids = kansen.map(k => k.id);
  const [acts, gespr, ml, meet] = await Promise.all([
    activiteiten(env, ids), gesprekken(env, ids), mails(env, ids), meetings(env, kansen),
  ]);
  return (id) => ({ acts: acts.get(id) || [], gespr: gespr.get(id) || [], mails: ml.get(id) || [], meet: meet.get(id) || [] });
}

/**
 * Elk contactmoment op een tijdlijn (puur). `contact` = er was echt contact
 * (de klant nam op, mailde zelf, had een meeting); anders was het een poging van ons.
 */
export function contactmomenten({ gespr = [], mails: ml = [], meet = [] }, nuMs = Date.now()) {
  const uit = [];
  for (const g of gespr) {
    const u = UITKOMSTEN[g.uitkomst];
    if (g.datum) uit.push({ datum: g.datum, contact: u.soort === 'contact', tekst: `${u.icoon} ${u.label}`, door: g.door });
  }
  for (const m of ml) {
    if (m.datum) uit.push({ datum: m.datum, contact: m.inkomend, tekst: m.inkomend ? '✉️ Klant mailde' : '✉️ Mail gestuurd', door: m.inkomend ? '' : m.van });
  }
  for (const m of meet) {
    if (m.start && m.start.getTime() <= nuMs) uit.push({ datum: m.start, contact: true, tekst: '📅 Meeting gehad', door: '' });
  }
  return uit.sort((a, b) => b.datum - a.datum);
}

/**
 * Wat het paneel zegt over een kans (puur): drie vakken op een balk.
 *   stap     (links)  de volgende stap: een komende Calendly-afspraak en de
 *                     eerste open BELTAAK, anders de eerste open activiteit
 *   gesprek  (midden) het laatste ECHTE contact (telefoon, mail of meeting), met
 *                     onze eigen pogingen daarna klein ernaast
 *   knoppen  (rechts) enkel wat nu zin heeft
 */
export function paneelInhoud(env, lead, ctx = {}, nu = vandaag(), nuMs = Date.now()) {
  const acts = ctx.acts || [];
  const bel = acts.filter(a => a.bellen).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0];
  const volgende = bel || acts[0];
  const komend = (ctx.meet || []).filter(m => m.start && m.start.getTime() > nuMs).sort((a, b) => a.start - b.start)[0];
  const stap = [];
  if (komend) stap.push(pil(`📅 Meeting ${korteDatum(vandaag(komend.start))}`, 'info', 'Komende Calendly-afspraak'));
  if (volgende) {
    const wat = volgende.bellen ? 'Bellen' : (volgende.typeNaam || 'Taak');
    const uitleg = `Eerstvolgende ${volgende.bellen ? 'beltaak' : 'taak'}${volgende.userNaam ? ` voor ${volgende.userNaam}` : ''}${volgende.samenvatting ? `: ${volgende.samenvatting}` : ''}`;
    const n = volgende.deadline ? dagenTussen(volgende.deadline, nu) : 0;
    if (!volgende.deadline || n === 0) stap.push(pil(`${wat}: vandaag`, 'info', uitleg));
    else if (n > 0) stap.push(pil(`${wat}: ${n === 1 ? '1 dag' : `${n} dagen`} te laat`, 'laat', uitleg));
    else stap.push(pil(`${wat}: ${korteDatum(volgende.deadline)}`, 'stil', uitleg));
  } else if (!komend) {
    stap.push(pil('Geen volgende stap', 'let', 'Er staat geen taak en geen afspraak op deze kans.'));
  }
  if (!lead.user_id) stap.push(pil('Geen verkoper', 'laat', 'Op deze kans staat geen verkoper.'));

  const momenten = contactmomenten(ctx, nuMs);
  const contact = momenten.find(m => m.contact);
  const poging = momenten.find(m => !m.contact && (!contact || m.datum > contact.datum));
  let gesprek = contact
    ? pil(`${contact.tekst} · ${geleden(vandaag(contact.datum), nu)}`, 'goed', `Laatste echte contact${contact.door ? `, door ${contact.door}` : ''}`)
    : pil('Nog geen contact', 'stil', 'Nog geen gesprek, mail van de klant of meeting.');
  if (poging) {
    gesprek += `<span title="Laatste poging van ons, nog zonder antwoord" style="font-size:11px;color:#6b7280;white-space:nowrap;">daarna: ${esc(poging.tekst)} · ${esc(geleden(vandaag(poging.datum), nu))}</span>`;
  }

  // "Telefoonactie registreren" is een ECHTE Odoo-knop naast het paneel (in de
  // overervende view "OM controlepaneel bovenaan de kans"), geen link naar de OM:
  // sales blijft in Odoo. In het paneel zelf staat enkel nog de knop om bij te werken.
  const knoppen = [];
  // Nu bijwerken: opent in HETZELFDE tabblad, de OM werkt het paneel bij en
  // stuurt terug naar de kans (GET /projecten/api/odoo-kansen/:id/vernieuw).
  knoppen.push(`<a href="${esc(`${basis(env)}/projecten/api/odoo-kansen/${lead.id}/vernieuw`)}" title="Paneel nu bijwerken" style="display:inline-block;padding:3px 8px;margin-left:6px;border-radius:7px;font-size:12px;text-decoration:none;background-color:#ffffff;border:1px solid #dbe4f0;color:#4b5563;">🔄</a>`);
  return { stap, gesprek, knoppen };
}

/** Een balk, links/midden/rechts. Een tabel: Odoo's sanitizer laat flex-eigenschappen niet door. */
export function paneelHtml(inhoud, stempel = '') {
  const titel = stempel ? ` title="Operations Manager, stand van ${esc(stempel)}"` : '';
  const cel = 'padding:5px 10px;vertical-align:middle;';
  return `<table${titel} style="width:100%;border-collapse:separate;border:1px solid #dbe4f0;border-radius:8px;background-color:#f8fafc;font-size:12px;"><tr>`
    + `<td style="${cel}text-align:left;">${inhoud.stap.join('')}</td>`
    + `<td style="${cel}text-align:center;">${inhoud.gesprek}</td>`
    + `<td style="${cel}text-align:right;white-space:nowrap;">${inhoud.knoppen.join('')}</td>`
    + `</tr></table>`;
}

async function sha(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Een paneel schrijven als het veranderde. Geeft 'geschreven' | 'ongewijzigd' | 'zou_schrijven'. */
async function schrijfPaneel(env, lead, inhoud, { mode, force = false }) {
  const kern = paneelHtml(inhoud);
  const hash = await sha(kern);
  const sleutel = `${KV}${lead.id}`;
  if (!force && env.MAPPINGS_KV && (await env.MAPPINGS_KV.get(sleutel)) === hash) return 'ongewijzigd';
  if (mode !== 'on') return 'zou_schrijven';
  const s = brusselsStempel();
  await write(env, { model: 'crm.lead', ids: [lead.id], values: { [PANEEL_VELD]: paneelHtml(inhoud, `${s.datum} ${s.uur}`) } });
  if (env.MAPPINGS_KV) await env.MAPPINGS_KV.put(sleutel, hash);
  return 'geschreven';
}

/** Het paneel van een kans nu bijwerken (na een afgerond gesprek). Faalt nooit naar buiten. */
export async function werkPaneelBij(env, leadId) {
  const mode = env.OPVOLGING_PANEEL_MODE;
  if (mode !== 'on') return { ok: false, reden: `OPVOLGING_PANEEL_MODE staat op "${mode || ''}"` };
  try {
    if (!(await heeftVelden(env, 'crm.lead', [PANEEL_VELD]))) return { ok: false, reden: `veld ${PANEEL_VELD} bestaat nog niet` };
    const lead = await leesLead(env, leadId);
    if (!lead) return { ok: false, reden: 'kans niet gevonden' };
    const ctx = await laadContext(env, [lead]);
    const r = await schrijfPaneel(env, lead, paneelInhoud(env, lead, ctx(leadId)), { mode, force: true });
    return { ok: true, resultaat: r };
  } catch (err) {
    console.error(LOG_PREFIX, 'paneel', leadId, err?.message);
    return { ok: false, reden: err?.message };
  }
}

/**
 * 15-minutencron: de panelen van alle open kansen bijwerken waar iets veranderde.
 * `force` (knop in CX Automations) schrijft elk paneel opnieuw, ook als het gelijk bleef.
 */
export async function runOpvolgingCron(env, { force = false } = {}) {
  const mode = env.OPVOLGING_PANEEL_MODE;
  if (!['dry', 'on'].includes(mode)) return null;
  if (!(await heeftVelden(env, 'crm.lead', [PANEEL_VELD]))) {
    console.warn(LOG_PREFIX, `veld ${PANEEL_VELD} bestaat nog niet op crm.lead: niets geschreven`);
    return null;
  }
  const kansen = await openKansen(env);
  const ctx = await laadContext(env, kansen);
  const nu = vandaag();
  const stats = { kansen: kansen.length, geschreven: 0, zou_schrijven: 0, ongewijzigd: 0, fouten: 0 };
  let geschreven = 0;
  for (const lead of kansen) {
    if (geschreven >= MAX_SCHRIJVEN) break;
    try {
      const r = await schrijfPaneel(env, lead, paneelInhoud(env, lead, ctx(lead.id), nu), { mode, force });
      stats[r]++;
      if (r === 'geschreven') geschreven++;
    } catch (err) {
      stats.fouten++;
      console.error(LOG_PREFIX, 'paneel', lead.id, err?.message);
    }
  }
  console.log(LOG_PREFIX, JSON.stringify({ mode, ...stats }));
  return stats;
}
