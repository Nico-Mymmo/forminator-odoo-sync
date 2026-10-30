/**
 * Het controlepaneel bovenaan de kans in Odoo.
 *
 * De OM schrijft het als HTML in het Studio-veld PANEEL_VELD op crm.lead, net
 * zoals het webgedrag op lead en actieblad (web-story/lib/push.js). Een smalle
 * balk met drie vakken:
 *   links   het VERLOOP als iconen (Font Awesome 4, dat Odoo zelf laadt): de
 *           aanvraag, elke oproep, mail van de klant en meeting, de volgende
 *           stap, en wat de sequentie nog voorziet. Kleur zegt of het lukte:
 *           groen = contact, oranje = voicemail, rood = nam niet op, blauw =
 *           gepland, grijs = nog te komen.
 *   midden  het laatste echte contact, en hoeveel pogingen er sindsdien waren
 *   rechts  de volgende stap (eerste open beltaak, anders eerste taak)
 *
 * OPVOLGING_PANEEL_MODE (Worker-variabele) bepaalt wat er gebeurt -- leeg =
 * NIETS, dus een deploy op zich verandert nooit iets in Odoo:
 *   dry  berekenen en loggen wat er naar Odoo zou gaan
 *   on   echt schrijven (en de sequentie echt laten plannen)
 *
 * Een kans wordt enkel geschreven als het paneel echt veranderde (hash in KV;
 * het tijdstip onderaan telt niet mee). Inline stijl: altijd `background-color`,
 * nooit de shorthand `background` (Odoo's sanitizer knipt die stil weg). Een
 * leeg <i class="fa ..."> laat de sanitizer staan (nagekeken 30/10/2026).
 */

import { write } from '../../../lib/odoo.js';
import { openKansen, leesLead, activiteiten, gesprekken, mails, meetings, heeftVelden } from './odoo-data.js';
import { LOG_PREFIX, vandaag, dagenTussen, korteDatum, geleden, brusselsStempel, esc } from './constants.js';
import { leesSequentie, sequentieStand, pasSequentieToe } from './sequentie.js';

export const PANEEL_VELD = 'x_studio_om_paneel_html';
const KV = 'opvolging:paneel:';
const MAX_SCHRIJVEN = 200;
const MAX_MOMENTEN = 7;

const KLEUR = {
  goed: { bg: '#ecfdf5', fg: '#047857' },
  info: { bg: '#eff6ff', fg: '#1d4ed8' },
  let: { bg: '#fffbeb', fg: '#b45309' },
  laat: { bg: '#fef2f2', fg: '#b91c1c' },
  stil: { bg: '#f3f4f6', fg: '#4b5563' },
};

function pil(tekst, toon, uitleg = '') {
  const k = KLEUR[toon] || KLEUR.stil;
  return `<span${uitleg ? ` title="${esc(uitleg)}"` : ''} style="display:inline-block;padding:2px 9px;margin:1px 4px 1px 0;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background-color:${k.bg};color:${k.fg};">${esc(tekst)}</span>`;
}

/** Een rond icoon. `gepland` = gestippelde rand (nog niet gebeurd). */
function icoon(fa, toon, uitleg, { gepland = false } = {}) {
  const k = KLEUR[toon] || KLEUR.stil;
  const rand = gepland ? `border:1px dashed ${k.fg};` : `border:1px solid ${k.bg};`;
  return `<span title="${esc(uitleg)}" style="display:inline-block;width:22px;height:22px;line-height:20px;text-align:center;border-radius:999px;font-size:11px;vertical-align:middle;box-sizing:border-box;${rand}background-color:${gepland ? '#ffffff' : k.bg};color:${k.fg};"><i class="fa ${fa}"></i></span>`;
}

const PIJL = '<i class="fa fa-angle-right" style="color:#cbd5e1;margin:0 3px;vertical-align:middle;"></i>';

// Per soort moment: icoon en kleur.
const MOMENT = {
  opgenomen: ['fa-phone', 'goed'],
  teruggebeld: ['fa-reply', 'goed'],
  ingesproken: ['fa-microphone', 'let'],
  niets: ['fa-phone', 'laat'],
  mail_in: ['fa-envelope', 'goed'],
  meeting: ['fa-calendar-check-o', 'goed'],
};

/**
 * Alles wat het paneel van een reeks kansen nodig heeft, in bulk. Per kans:
 * { acts, gespr, mails, meet } (zie odoo-data.js).
 */
export async function laadContext(env, kansen) {
  const ids = kansen.map(k => k.id);
  const [acts, gespr, ml, meet] = await Promise.all([
    activiteiten(env, ids), gesprekken(env, ids, { perLead: 15 }), mails(env, ids), meetings(env, kansen),
  ]);
  return (id) => ({ acts: acts.get(id) || [], gespr: gespr.get(id) || [], mails: ml.get(id) || [], meet: meet.get(id) || [] });
}

/** Wat het paneel zegt over een kans (puur): { verloop, contact, stap }. */
export function paneelInhoud(env, lead, ctx = {}, cfg, nu = vandaag(), nuMs = Date.now()) {
  const stand = sequentieStand(lead, ctx, cfg, nu, nuMs);
  const acts = ctx.acts || [];
  const bel = acts.filter(a => a.bellen).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0];
  const volgende = bel || acts[0];
  const komend = (ctx.meet || []).filter(m => m.start && m.start.getTime() > nuMs).sort((a, b) => a.start - b.start)[0];

  // ── Verloop ───────────────────────────────────────────────────────────
  const delen = [];
  const aangemaakt = String(lead.create_date || '').slice(0, 10);
  delen.push(icoon('fa-inbox', 'stil', aangemaakt ? `Aanvraag binnen op ${korteDatum(aangemaakt)}` : 'Aanvraag'));
  const momenten = stand.momenten.filter(m => m.soort !== 'mail_uit');
  if (momenten.length > MAX_MOMENTEN) delen.push(`<span title="${momenten.length - MAX_MOMENTEN} eerdere" style="font-size:11px;color:#9ca3af;vertical-align:middle;">+${momenten.length - MAX_MOMENTEN}</span>`);
  for (const m of momenten.slice(-MAX_MOMENTEN)) {
    const [fa, toon] = MOMENT[m.soort === 'oproep' ? m.uitkomst : m.soort] || ['fa-circle', 'stil'];
    delen.push(icoon(fa, toon, `${m.tekst} · ${korteDatum(vandaag(m.datum))}${m.door ? ` · ${m.door}` : ''}`));
  }
  if (komend) delen.push(icoon('fa-calendar', 'info', `Meeting gepland op ${korteDatum(vandaag(komend.start))}`, { gepland: true }));
  if (volgende) {
    const n = volgende.deadline ? dagenTussen(volgende.deadline, nu) : 0;
    delen.push(icoon(volgende.bellen ? 'fa-phone' : 'fa-check-square-o', n > 0 ? 'laat' : 'info',
      `Gepland: ${volgende.samenvatting || volgende.typeNaam || 'taak'}${volgende.deadline ? ` · ${korteDatum(volgende.deadline)}` : ''}${volgende.userNaam ? ` · ${volgende.userNaam}` : ''}`,
      { gepland: true }));
  }
  // Wat de sequentie nog voorziet, zolang er geen contact was.
  if (stand.in_seq && !(stand.contact && !stand.pogingen.length)) {
    const gedaan = stand.pogingen.length + (volgende && volgende.bellen ? 1 : 0);
    for (let i = gedaan; i < stand.totaal; i++) delen.push(icoon('fa-phone', 'stil', `Poging ${i + 1} van ${stand.totaal} (sequentie)`, { gepland: true }));
    if (cfg.einde.aan) delen.push(icoon('fa-flag-o', 'stil', `Na de laatste poging: ${cfg.einde.titel}`, { gepland: true }));
  }

  // ── Laatste contact ───────────────────────────────────────────────────
  const c = stand.contact;
  let contact = c
    ? pil(`${c.tekst} · ${geleden(vandaag(c.datum), nu)}`, 'goed', `Laatste echte contact${c.door ? `, door ${c.door}` : ''}`)
    : pil('Nog geen contact', 'stil', 'Nog geen gesprek, mail van de klant of meeting.');
  if (stand.pogingen.length) {
    const p = stand.pogingen.length;
    contact += `<span style="font-size:11px;color:#6b7280;white-space:nowrap;">${p === 1 ? '1 poging' : `${p} pogingen`} zonder antwoord${stand.in_seq ? ` (van ${stand.totaal})` : ''}</span>`;
  }

  // ── Volgende stap ─────────────────────────────────────────────────────
  const stap = [];
  if (komend) stap.push(pil(`Meeting ${korteDatum(vandaag(komend.start))}`, 'info', 'Komende Calendly-afspraak'));
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

  return { verloop: delen.join(PIJL), contact, stap };
}

/** Een balk, links/midden/rechts. Een tabel: Odoo's sanitizer laat flex-eigenschappen niet door. */
export function paneelHtml(inhoud, stempel = '') {
  const titel = stempel ? ` title="Operations Manager, stand van ${esc(stempel)}"` : '';
  const cel = 'padding:5px 10px;vertical-align:middle;';
  return `<table${titel} style="width:100%;border-collapse:separate;border:1px solid #dbe4f0;border-radius:8px;background-color:#f8fafc;font-size:12px;"><tr>`
    + `<td style="${cel}text-align:left;white-space:nowrap;">${inhoud.verloop}</td>`
    + `<td style="${cel}text-align:center;">${inhoud.contact}</td>`
    + `<td style="${cel}text-align:right;">${inhoud.stap.join('')}</td>`
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

/**
 * Een kans nu bijwerken (na een geregistreerde oproep): eerst de sequentie (de
 * volgende beltaak), dan het paneel. Faalt nooit naar buiten.
 */
export async function werkPaneelBij(env, leadId) {
  const mode = env.OPVOLGING_PANEEL_MODE;
  if (mode !== 'on') return { ok: false, reden: `OPVOLGING_PANEEL_MODE staat op "${mode || ''}"` };
  try {
    if (!(await heeftVelden(env, 'crm.lead', [PANEEL_VELD]))) return { ok: false, reden: `veld ${PANEEL_VELD} bestaat nog niet` };
    const lead = await leesLead(env, leadId);
    if (!lead) return { ok: false, reden: 'kans niet gevonden' };
    const cfg = await leesSequentie(env);
    let ctx = await laadContext(env, [lead]);
    const gepland = await pasSequentieToe(env, [lead], ctx, { mode, cfg });
    if (gepland) ctx = await laadContext(env, [lead]); // de nieuwe taak staat nu ook in de balk
    const r = await schrijfPaneel(env, lead, paneelInhoud(env, lead, ctx(leadId), cfg), { mode, force: true });
    return { ok: true, resultaat: r, gepland };
  } catch (err) {
    console.error(LOG_PREFIX, 'paneel', leadId, err?.message);
    return { ok: false, reden: err?.message };
  }
}

/**
 * 5-minutencron: eerst de sequentie (vangnet: elke stap die nog ontbreekt),
 * dan de panelen van alle open kansen waar iets veranderde. `force` (knop in
 * CX Automations) schrijft elk paneel opnieuw, ook als het gelijk bleef.
 */
export async function runOpvolgingCron(env, { force = false } = {}) {
  const mode = env.OPVOLGING_PANEEL_MODE;
  if (!['dry', 'on'].includes(mode)) return null;
  if (!(await heeftVelden(env, 'crm.lead', [PANEEL_VELD]))) {
    console.warn(LOG_PREFIX, `veld ${PANEEL_VELD} bestaat nog niet op crm.lead: niets geschreven`);
    return null;
  }
  const cfg = await leesSequentie(env);
  const kansen = await openKansen(env);
  let ctx = await laadContext(env, kansen);
  const gepland = await pasSequentieToe(env, kansen, ctx, { mode, cfg });
  if (gepland) ctx = await laadContext(env, kansen);
  const nu = vandaag();
  const stats = { kansen: kansen.length, gepland, geschreven: 0, zou_schrijven: 0, ongewijzigd: 0, fouten: 0 };
  let geschreven = 0;
  for (const lead of kansen) {
    if (geschreven >= MAX_SCHRIJVEN) break;
    try {
      const r = await schrijfPaneel(env, lead, paneelInhoud(env, lead, ctx(lead.id), cfg, nu), { mode, force });
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
