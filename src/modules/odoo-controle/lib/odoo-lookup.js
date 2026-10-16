/**
 * Odoo-controle -- "Nakijken in Odoo": de records uit de refs van een case
 * live lezen, met hun chatter (berichten, veldwijzigingen) en open
 * activiteiten. ALLEEN LEZEN, via src/lib/odoo.js (de gewone Odoo-gebruiker
 * van de Worker).
 *
 * Het resultaat dient twee doelen: tonen in het scherm, en als tekst meegeven
 * aan Claude bij "Verifieer en herschrijf" (odooDigest), zodat die ook ziet
 * wat er in Odoo echt gebeurde.
 */

import { searchRead, read } from '../../../lib/odoo.js';
import { MODEL_LABEL, odooUrl } from './constants.js';

const VELDEN = {
  'res.partner': ['name', 'display_name', 'is_company', 'parent_id', 'commercial_partner_id', 'email', 'phone', 'active',
    'x_studio_company_status', 'x_studio_company_type', 'child_ids', 'write_date'],
  'sale.order': ['name', 'state', 'subscription_state', 'partner_id', 'commercial_partner_id', 'plan_id', 'date_order', 'start_date',
    'end_date', 'next_invoice_date', 'first_contract_date', 'recurring_monthly', 'amount_untaxed', 'amount_total', 'invoice_status',
    'origin_order_id', 'subscription_id', 'close_reason_id', 'user_id', 'opportunity_id', 'write_date'],
  'account.move': ['name', 'state', 'move_type', 'partner_id', 'commercial_partner_id', 'invoice_date', 'invoice_date_due',
    'amount_untaxed', 'amount_total', 'amount_residual', 'payment_state', 'invoice_origin', 'ref', 'reversed_entry_id', 'write_date'],
  'crm.lead': ['name', 'partner_id', 'stage_id', 'probability', 'active', 'expected_revenue', 'user_id', 'team_id', 'date_closed',
    'lost_reason_id', 'write_date'],
};

/** Velden die Studio misschien niet (meer) heeft: valt het lezen daarop, dan zonder opnieuw. */
const OPTIONEEL = new Set(['x_studio_company_status', 'x_studio_company_type', 'subscription_state', 'plan_id', 'start_date', 'end_date',
  'next_invoice_date', 'first_contract_date', 'recurring_monthly', 'origin_order_id', 'subscription_id', 'close_reason_id']);

const MAX_BERICHTEN = 40;

const m2o = (v) => (Array.isArray(v) ? v[1] : v);
const strip = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

async function leesRecord(env, ref) {
  let velden = VELDEN[ref.model] || ['display_name', 'write_date'];
  for (let poging = 0; poging < 3; poging++) {
    try {
      const rows = await read(env, { model: ref.model, ids: [ref.id], fields: velden });
      return rows && rows[0] ? rows[0] : null;
    } catch (err) {
      // "Invalid field 'x' on model ..." -> dat veld weglaten en opnieuw.
      const m = /Invalid field '([^']+)'/.exec(err.message || '');
      if (m && OPTIONEEL.has(m[1])) { velden = velden.filter((f) => f !== m[1]); continue; }
      throw err;
    }
  }
  return null;
}

function toonWaarde(v) {
  if (v === false || v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length === 2 && typeof v[1] === 'string' ? v[1] : `${v.length} record(s)`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

async function trackingWaarden(env, ids) {
  if (!ids.length) return new Map();
  try {
    const rows = await read(env, {
      model: 'mail.tracking.value', ids,
      fields: ['mail_message_id', 'field_id', 'old_value_char', 'new_value_char', 'old_value_float', 'new_value_float',
        'old_value_integer', 'new_value_integer', 'old_value_datetime', 'new_value_datetime', 'old_value_text', 'new_value_text'],
    });
    const per = new Map();
    for (const t of rows || []) {
      const mid = Array.isArray(t.mail_message_id) ? t.mail_message_id[0] : t.mail_message_id;
      const pick = (a, b, c, d, e) => [a, b, c, d, e].find((x) => x !== false && x !== null && x !== undefined && x !== '' && x !== 0);
      const regel = {
        veld: m2o(t.field_id) || '?',
        oud: toonWaarde(pick(t.old_value_char, t.old_value_text, t.old_value_datetime, t.old_value_float, t.old_value_integer)),
        nieuw: toonWaarde(pick(t.new_value_char, t.new_value_text, t.new_value_datetime, t.new_value_float, t.new_value_integer)),
      };
      if (!per.has(mid)) per.set(mid, []);
      per.get(mid).push(regel);
    }
    return per;
  } catch {
    return new Map();
  }
}

async function chatter(env, ref) {
  const msgs = await searchRead(env, {
    model: 'mail.message',
    domain: [['model', '=', ref.model], ['res_id', '=', ref.id], ['message_type', 'in', ['comment', 'notification', 'email']]],
    fields: ['date', 'author_id', 'message_type', 'subtype_id', 'body', 'tracking_value_ids'],
    order: 'date desc', limit: MAX_BERICHTEN,
  });
  const trackIds = [];
  for (const m of msgs || []) for (const id of m.tracking_value_ids || []) trackIds.push(id);
  const tracks = await trackingWaarden(env, trackIds);
  return (msgs || []).map((m) => ({
    id: m.id,
    datum: m.date,
    auteur: m2o(m.author_id) || '',
    soort: m.message_type,
    subtype: m2o(m.subtype_id) || '',
    tekst: strip(m.body).slice(0, 1500),
    wijzigingen: tracks.get(m.id) || [],
  })).filter((m) => m.tekst || m.wijzigingen.length);
}

async function activiteiten(env, ref) {
  try {
    const rows = await searchRead(env, {
      model: 'mail.activity',
      domain: [['res_model', '=', ref.model], ['res_id', '=', ref.id]],
      fields: ['summary', 'activity_type_id', 'date_deadline', 'user_id', 'note'],
      order: 'date_deadline asc', limit: 20,
    });
    return (rows || []).map((a) => ({
      samenvatting: a.summary || '', type: m2o(a.activity_type_id) || '', deadline: a.date_deadline || '',
      wie: m2o(a.user_id) || '', nota: strip(a.note).slice(0, 400),
    }));
  } catch {
    return [];
  }
}

/** Alle refs van een case live uit Odoo, met chatter en activiteiten. */
export async function kijkNaInOdoo(env, c) {
  const refs = Array.isArray(c.refs) ? c.refs : [];
  const records = await Promise.all(refs.map(async (ref) => {
    const basis = { ref, label: ref.label, model: ref.model, soort: MODEL_LABEL[ref.model] || ref.model, url: odooUrl(ref) };
    try {
      const [rec, msgs, acts] = await Promise.all([leesRecord(env, ref), chatter(env, ref), activiteiten(env, ref)]);
      if (!rec) return { ...basis, fout: 'Niet gevonden in Odoo (verwijderd, of geen leesrecht).', velden: [], berichten: [], activiteiten: [] };
      const velden = Object.entries(rec).filter(([k]) => k !== 'id' && k !== 'child_ids').map(([k, v]) => ({ veld: k, waarde: toonWaarde(v) })).filter((x) => x.waarde !== '');
      if (Array.isArray(rec.child_ids) && rec.child_ids.length) velden.push({ veld: 'contacten', waarde: `${rec.child_ids.length}` });
      return { ...basis, velden, berichten: msgs, activiteiten: acts };
    } catch (err) {
      return { ...basis, fout: `Odoo gaf een fout: ${String(err.message || err).slice(0, 300)}`, velden: [], berichten: [], activiteiten: [] };
    }
  }));
  return { opgehaald: new Date().toISOString(), records };
}

/** Compacte tekst voor in een prompt: per record de kernvelden en de recentste berichten. */
export function odooDigest(resultaat, { maxTekens = 9000 } = {}) {
  if (!resultaat || !resultaat.records) return '';
  const L = [];
  for (const r of resultaat.records) {
    L.push(`### ${r.soort} ${r.label}`);
    if (r.fout) { L.push(r.fout); continue; }
    L.push(r.velden.map((v) => `${v.veld}: ${v.waarde}`).join(' | '));
    if (r.activiteiten.length) L.push('Open activiteiten: ' + r.activiteiten.map((a) => `${a.deadline} ${a.type} ${a.samenvatting} (${a.wie})`).join('; '));
    const msgs = r.berichten.slice(0, 15);
    if (msgs.length) {
      L.push('Chatter (recentste eerst):');
      for (const m of msgs) {
        const w = m.wijzigingen.map((x) => `${x.veld}: ${x.oud || '-'} -> ${x.nieuw || '-'}`).join('; ');
        L.push(`- ${m.datum} ${m.auteur}${m.subtype ? ` [${m.subtype}]` : ''}: ${[m.tekst.slice(0, 300), w].filter(Boolean).join(' | ')}`);
      }
    }
    L.push('');
  }
  return L.join('\n').slice(0, maxTekens);
}
