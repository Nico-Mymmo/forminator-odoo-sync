/**
 * "Mijn leads": een overzicht van de leads van een medewerker in EEN opvraging.
 *
 * Bestaat omdat Claude anders voor een vraag als "wat moet ik deze week
 * opvolgen?" elk dossier apart opent: 83 dossiers en 286 zoekopdrachten in een
 * uur (Thomas, 2026-10-26), en een dossier kost ~5.000 tokens van het
 * Claude-account van de medewerker. Dit antwoord is een compacte tabel van een
 * paar duizend tokens; een dossier open je daarna enkel voor het gebouw waar
 * het over gaat. Twee rondes naar Odoo: de leads, dan hun gebouwen.
 */

import { executeKw } from '../../../lib/odoo.js';
import { odooGebruiker } from './toegang.js';
import { SalesError } from './constants.js';

const m2oId = (v) => (Array.isArray(v) ? v[0] : null);
const m2oNaam = (v) => (Array.isArray(v) ? v[1] : null);
const cel = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '-';
const kortDatum = (s) => {
  const [j, m, d] = String(s || '').slice(0, 10).split('-');
  return d ? `${d}/${m}${j !== String(new Date().getUTCFullYear()) ? '/' + j : ''}` : '';
};

function sr(env, model, domain, fields, extra = {}) {
  return executeKw(env, { model, method: 'search_read', args: [domain], kwargs: { fields, ...extra } });
}

/**
 * @param {object} p { fase: open|gewonnen|verloren|alle, verantwoordelijke: 'ik'|'iedereen'|naam, limiet }
 */
export async function mijnLeads(env, gebruiker, { fase = 'open', verantwoordelijke = 'ik', limiet = 30, planning = null } = {}) {
  const max = Math.min(Math.max(Number(limiet) || 30, 1), 50);
  const domein = [];
  if (fase === 'open') domein.push(['active', '=', true], ['probability', '<', 100]);
  else if (fase === 'gewonnen') domein.push(['probability', '=', 100]);
  else if (fase === 'verloren') domein.push(['active', '=', false], ['probability', '=', 0]);

  let wie = 'iedereen';
  const v = String(verantwoordelijke || 'ik').trim();
  if (v.toLowerCase() === 'ik') {
    const odoo = await odooGebruiker(env, gebruiker);
    if (!odoo?.uid) throw new SalesError(`${gebruiker.naam} is niet als gebruiker in Odoo gevonden. Vraag de leads van een collega op naam op, of van iedereen.`);
    domein.push(['user_id', '=', odoo.uid]);
    wie = odoo.naam;
  } else if (v.toLowerCase() !== 'iedereen') {
    domein.push(['user_id.name', 'ilike', v]);
    wie = v;
  }

  // Planning: op de datum van de eerstvolgende taak op de lead (Europe/Brussels).
  const dag = (plus = 0) => new Date(Date.now() + plus * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
  const vandaag = dag();
  const PLANNING = {
    vandaag: [['activity_date_deadline', '<=', vandaag]],
    deze_week: [['activity_date_deadline', '<=', dag(6)]],
    over_tijd: [['activity_date_deadline', '<', vandaag]],
    zonder_volgende_stap: [['activity_ids', '=', false]],
  };
  const lijstDomein = [...domein, ...(PLANNING[planning] || [])];
  const ctx = { context: { active_test: false } };
  const tel = (d) => executeKw(env, { model: 'crm.lead', method: 'search_count', args: [d], kwargs: ctx });

  const velden = ['name', 'partner_id', 'stage_id', 'user_id', 'expected_revenue', 'probability', 'active',
    'activity_date_deadline', 'activity_summary', 'activity_type_id', 'write_date', 'create_date'];
  // Een ronde: de lijst, en de totalen van de hele selectie (voor inzicht zonder dossiers te openen).
  const [leads, totaal, perFase, overTijd, zonderStap, vandaagN] = await Promise.all([
    // De datum van de volgende taak is niet sorteerbaar in Odoo: bij een planning ruimer ophalen en hier sorteren.
    sr(env, 'crm.lead', lijstDomein, velden, { order: 'write_date desc', limit: planning ? 200 : max, ...ctx }),
    tel(lijstDomein),
    executeKw(env, { model: 'crm.lead', method: 'read_group', args: [domein, ['expected_revenue:sum'], ['stage_id']], kwargs: { lazy: true, ...ctx } }).catch(() => []),
    tel([...domein, ...PLANNING.over_tijd]),
    tel([...domein, ...PLANNING.zonder_volgende_stap]),
    tel([...domein, ['activity_date_deadline', '=', vandaag]]),
  ]);
  const samen = [
    `Totaal (${fase}, ${wie}): ${perFase.reduce((s, g) => s + (g.stage_id_count || 0), 0)} leads`,
    perFase.length ? perFase.filter((g) => g.stage_id_count).map((g) => `${m2oNaam(g.stage_id) || 'zonder fase'} ${g.stage_id_count}${g.expected_revenue ? ` (€ ${Math.round(g.expected_revenue)})` : ''}`).join(', ') : null,
    `vandaag gepland ${vandaagN}`, `over tijd ${overTijd}`, `zonder volgende stap ${zonderStap}`,
  ].filter(Boolean).join(' · ');
  if (!leads.length) return `${samen}\n\nGeen leads gevonden voor deze selectie${planning ? ` (planning: ${planning})` : ''}.`;

  // Ronde 2: het gebouw achter elke lead (de klant, of het bedrijf van de contactpersoon).
  const pids = [...new Set(leads.map((l) => m2oId(l.partner_id)).filter(Boolean))];
  const partners = pids.length ? await sr(env, 'res.partner', [['id', 'in', pids]],
    ['name', 'is_company', 'parent_id', 'city'], { context: { active_test: false } }) : [];
  const ouders = [...new Set(partners.map((p) => m2oId(p.parent_id)).filter(Boolean))];
  const gebouwen = ouders.length || partners.some((p) => p.is_company)
    ? await sr(env, 'res.partner', [['id', 'in', [...ouders, ...partners.filter((p) => p.is_company).map((p) => p.id)]]],
      ['name', 'city', 'x_studio_number_of_plots'], { context: { active_test: false } }) : [];
  const gebouwVan = (l) => {
    const p = partners.find((x) => x.id === m2oId(l.partner_id));
    if (!p) return null;
    return gebouwen.find((g) => g.id === (p.is_company ? p.id : m2oId(p.parent_id))) || null;
  };

  // Eerst wat vandaag gepland staat, dan wat over tijd is, dan de eerstvolgende, dan zonder volgende stap.
  const rang = (l) => (!l.activity_date_deadline ? 3 : l.activity_date_deadline === vandaag ? 0 : l.activity_date_deadline < vandaag ? 1 : 2);
  leads.sort((a, b) => rang(a) - rang(b) || String(a.activity_date_deadline || '').localeCompare(String(b.activity_date_deadline || '')));
  leads.splice(max);

  const r = [
    samen, '',
    `**Leads van ${wie}** · ${fase}${planning ? ' · ' + planning.replace(/_/g, ' ') : ''} · ${leads.length}${totaal > leads.length ? ` van ${totaal} (${planning ? 'eerst vandaag, dan over tijd' : 'eerst vandaag en over tijd, dan de laatst gewijzigde'})` : ''}`, '',
    '| Lead | Gebouw | Fase | Volgende stap | Gewijzigd |', '|---|---|---|---|---|',
  ];
  for (const l of leads) {
    const g = gebouwVan(l);
    const fs = l.active === false ? (l.probability === 0 ? 'verloren' : 'gearchiveerd') : l.probability === 100 ? 'gewonnen' : m2oNaam(l.stage_id);
    const stap = l.activity_date_deadline
      ? `${kortDatum(l.activity_date_deadline)}${l.activity_date_deadline < vandaag ? ' (over tijd)' : ''} ${l.activity_summary || m2oNaam(l.activity_type_id) || ''}`
      : 'niets gepland';
    r.push(`| ${cel(l.name)} | ${g ? cel(g.name + (g.x_studio_number_of_plots ? ` (${g.x_studio_number_of_plots} kavels)` : '')) : 'geen gebouw'} | ${cel(fs)}${v.toLowerCase() === 'ik' ? '' : ' · ' + cel(m2oNaam(l.user_id))} | ${cel(stap)} | ${kortDatum(l.write_date)} |`);
  }
  r.push('', '[Voor Claude, niet tonen] Om een dossier te openen (enkel voor het gebouw waar de gebruiker naar vraagt): '
    + leads.map((l) => { const g = gebouwVan(l); return `"${cel(l.name)}" ${g ? 'gebouw_id ' + g.id : 'lead_id ' + l.id}`; }).join('; '));
  return r.join('\n');
}
