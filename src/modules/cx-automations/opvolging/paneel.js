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
import { openKansen, leesLead, activiteiten, gesprekken, heeftVelden } from './odoo-data.js';
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

function basis(env) {
  return String(env.APP_BASE_URL || '').replace(/\/+$/, '');
}

function pil(tekst, toon) {
  const k = KLEUR[toon] || KLEUR.stil;
  return `<span style="display:inline-block;padding:3px 10px;margin:2px 6px 2px 0;border-radius:999px;font-size:12px;font-weight:600;background-color:${k.bg};color:${k.fg};">${esc(tekst)}</span>`;
}

function knop(tekst, url, hoofd) {
  const stijl = hoofd
    ? 'background-color:#1d4ed8;color:#ffffff;border:1px solid #1d4ed8;'
    : 'background-color:#ffffff;color:#1d4ed8;border:1px solid #93c5fd;';
  return `<a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 14px;margin:4px 8px 0 0;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;${stijl}">${esc(tekst)}</a>`;
}

/**
 * Wat het paneel zegt over een kans (puur). Geeft { zin, pillen, knoppen }.
 * `acts` = open activiteiten van de kans, `gespr` = gesprekken (nieuwste eerst).
 */
export function paneelInhoud(env, lead, acts = [], gespr = [], nu = vandaag()) {
  const pillen = [];
  const laatste = gespr[0];
  if (laatste) {
    const u = UITKOMSTEN[laatste.uitkomst];
    const dag = laatste.datum ? vandaag(laatste.datum) : nu;
    pillen.push(pil(`${u.icoon} ${u.label}, ${geleden(dag, nu)}${laatste.door ? ` (${laatste.door})` : ''}`,
      u.soort === 'contact' ? 'goed' : 'stil'));
  } else {
    pillen.push(pil('Nog geen gesprek', 'stil'));
  }

  const bel = acts.filter(a => a.bellen).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))[0];
  const volgende = bel || acts[0];
  let zin;
  if (!volgende) {
    pillen.push(pil('Geen volgende stap gepland', 'let'));
    zin = 'Er staat geen volgende stap op deze kans.';
  } else {
    const wat = volgende.bellen ? 'Bellen' : (volgende.typeNaam || 'Taak');
    const n = volgende.deadline ? dagenTussen(volgende.deadline, nu) : 0;
    if (!volgende.deadline || n === 0) {
      pillen.push(pil(`${wat}: vandaag`, 'info'));
      zin = volgende.bellen ? 'Vandaag bellen.' : `Vandaag: ${wat.toLowerCase()}.`;
    } else if (n > 0) {
      pillen.push(pil(`${wat}: ${n === 1 ? '1 dag' : `${n} dagen`} te laat`, 'laat'));
      zin = volgende.bellen ? 'Dit gesprek staat te laat.' : 'De volgende stap staat te laat.';
    } else {
      pillen.push(pil(`${wat}: ${korteDatum(volgende.deadline)}`, 'stil'));
      zin = `Volgende stap op ${korteDatum(volgende.deadline)}.`;
    }
  }
  if (!lead.user_id) pillen.push(pil('Geen verkoper', 'laat'));

  // De knoppen openen Mijn taken in Projecten, met het venster voor deze kans al open.
  const knoppen = [knop('Gesprek afronden', `${basis(env)}/projecten#/mijn?gesprek=${lead.id}`, !!bel)];
  if (!volgende) knoppen.push(knop('Volgende stap plannen', `${basis(env)}/projecten#/mijn?gesprek=${lead.id}&stap=volgende`, false));
  return { zin, pillen, knoppen };
}

export function paneelHtml(inhoud, stempel = '') {
  return `<div style="border:1px solid #dbe4f0;border-radius:10px;padding:10px 14px;background-color:#f8fafc;font-size:13px;line-height:1.45;">`
    + `<div style="font-weight:600;color:#111827;margin-bottom:4px;">${esc(inhoud.zin)}</div>`
    + `<div>${inhoud.pillen.join('')}</div>`
    + `<div>${inhoud.knoppen.join('')}</div>`
    + (stempel ? `<div style="margin-top:6px;font-size:11px;color:#9ca3af;">Operations Manager · stand van ${esc(stempel)}</div>` : '')
    + `</div>`;
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
    const [acts, gespr] = await Promise.all([activiteiten(env, [leadId]), gesprekken(env, [leadId])]);
    const r = await schrijfPaneel(env, lead, paneelInhoud(env, lead, acts.get(leadId), gespr.get(leadId)), { mode, force: true });
    return { ok: true, resultaat: r };
  } catch (err) {
    console.error(LOG_PREFIX, 'paneel', leadId, err?.message);
    return { ok: false, reden: err?.message };
  }
}

/** 15-minutencron: de panelen van alle open kansen bijwerken waar iets veranderde. */
export async function runOpvolgingCron(env) {
  const mode = env.OPVOLGING_PANEEL_MODE;
  if (!['dry', 'on'].includes(mode)) return null;
  if (!(await heeftVelden(env, 'crm.lead', [PANEEL_VELD]))) {
    console.warn(LOG_PREFIX, `veld ${PANEEL_VELD} bestaat nog niet op crm.lead: niets geschreven`);
    return null;
  }
  const kansen = await openKansen(env);
  const ids = kansen.map(k => k.id);
  const [acts, gespr] = await Promise.all([activiteiten(env, ids), gesprekken(env, ids)]);
  const nu = vandaag();
  const stats = { kansen: ids.length, geschreven: 0, zou_schrijven: 0, ongewijzigd: 0, fouten: 0 };
  let geschreven = 0;
  for (const lead of kansen) {
    if (geschreven >= MAX_SCHRIJVEN) break;
    try {
      const r = await schrijfPaneel(env, lead, paneelInhoud(env, lead, acts.get(lead.id), gespr.get(lead.id), nu), { mode });
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
