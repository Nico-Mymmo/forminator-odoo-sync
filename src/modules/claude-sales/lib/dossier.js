/**
 * Alles wat we weten over een gebouw, in twee rondes naar Odoo.
 *
 *   Ronde 1 (tegelijk): het gebouw, zijn contactpersonen, de leads, de
 *     actiebladen, en de velden van elk model (die zijn meestal al bewaard).
 *   Ronde 2 (tegelijk): de chatter van al die records, activiteiten,
 *     Calendly-afspraken, gesprekken op het actieblad, offertes en
 *     abonnementen, event-inschrijvingen en bijlagen.
 *
 * Gemeten op 2026-10-23: een ronde duurt ~0,1 s, dus een dossier staat er in
 * ongeveer een kwart seconde. Zet hier nooit een vraag NA een andere die er
 * niet van afhangt: elke ronde extra kost evenveel als alle vragen erin samen.
 *
 * Het resultaat is gewone tekst (Markdown) voor Claude, met de id's erbij,
 * zodat dossier_bijwerken weet welk record bedoeld is.
 */

import { executeKw } from '../../../lib/odoo.js';
import { odooOrigin } from '../../../lib/medewerkers.js';
import { BEWERKBAAR, MODELLEN, bestaande, catalogus, toonWaarde, isLeeg } from './velden.js';
import { htmlNaarTekst } from './tekst.js';
import { SalesError } from './constants.js';
import { webGedrag } from './web.js';
import { extraVragen, nakijkPunten } from './nakijken.js';
import { kortOverzicht } from './overzicht.js';

const m2oId = (v) => (Array.isArray(v) ? v[0] : (Number.isInteger(v) ? v : null));
const m2oNaam = (v) => (Array.isArray(v) ? v[1] : null);

function sr(env, model, domain, fields, extra = {}) {
  return executeKw(env, { model, method: 'search_read', args: [domain], kwargs: { fields, ...extra } });
}
/**
 * Zoals sr(), maar een fout maakt het dossier niet stuk: dat onderdeel valt
 * weg. Velden die het model niet (meer) heeft, worden eerst weggelaten
 * (fields_get is bewaard, dus dat kost meestal niets).
 */
function zacht(env, model, domain, fields, extra = {}) {
  return bestaande(env, model, fields).then((f) => sr(env, model, domain, f, extra)).catch((err) => {
    console.error('[claude-sales] dossier', model, err?.message);
    return null;
  });
}

const GEBOUW_EXTRA = ['name', 'is_company', 'active', 'comment', 'commercial_partner_id', 'x_studio_company_status',
  'x_studio_parent_expert', 'x_studio_invoiced_by_partner', 'x_syndicoach_pack', 'x_studio_soid', 'user_id'];
const CONTACT_EXTRA = ['name', 'parent_id', 'active', 'type'];
const LEAD_EXTRA = ['name', 'partner_id', 'stage_id', 'user_id', 'team_id', 'active', 'probability', 'type',
  'create_date', 'date_closed', 'lost_reason_id', 'description', 'tag_ids',
  'x_studio_lead_channel', 'x_studio_brand_origin', 'x_studio_hotness_label', 'x_studio_lifecycle',
  'x_studio_merged_kpi_html', 'x_studio_contact_message', 'x_studio_opportunity_actionsheet_ids'];
const BLAD_EXTRA = ['x_name', 'x_studio_for_company_id', 'x_studio_user_id', 'x_studio_stage_id',
  'x_studio_discovery_progress', 'x_flag_level', 'x_flag_reason', 'x_flag_custom_message',
  'x_studio_as_opportunity_ids'];

/**
 * Ronde 1: het gebouw en wat er direct aan hangt.
 * Met enkel een lead_id: eerst het gebouw van die lead zoeken.
 */
export async function laadKern(env, { gebouw_id, lead_id } = {}) {
  let gebouwId = Number(gebouw_id) || null;
  const leadId = Number(lead_id) || null;
  if (!gebouwId && !leadId) throw new SalesError('Geef een gebouw_id of een lead_id (zoek eerst met zoek_gebouw).');

  const [vGebouw, vContact, vLead, vBlad] = await Promise.all([
    bestaande(env, 'res.partner', [...new Set([...GEBOUW_EXTRA, ...BEWERKBAAR.gebouw])]),
    bestaande(env, 'res.partner', [...new Set([...CONTACT_EXTRA, ...BEWERKBAAR.contact])]),
    bestaande(env, 'crm.lead', [...new Set([...LEAD_EXTRA, ...BEWERKBAAR.lead])]),
    bestaande(env, 'x_sales_action_sheet', [...new Set([...BLAD_EXTRA, ...BEWERKBAAR.actieblad])]),
  ]);

  if (!gebouwId) {
    const [lead] = await sr(env, 'crm.lead', [['id', '=', leadId]], ['partner_id'], { context: { active_test: false } });
    if (!lead) throw new SalesError(`Lead ${leadId} bestaat niet.`, 404);
    const pid = m2oId(lead.partner_id);
    if (pid) {
      const [p] = await sr(env, 'res.partner', [['id', '=', pid]], ['commercial_partner_id'], { context: { active_test: false } });
      gebouwId = p ? m2oId(p.commercial_partner_id) : null;
    }
  }

  const ctx = { context: { active_test: false } };
  const [gebouwen, contacten, leads, bladen] = await Promise.all([
    gebouwId ? sr(env, 'res.partner', [['id', '=', gebouwId]], vGebouw, ctx) : [],
    // De contacten van het gebouw, en de persoon zelf als de lead aan een persoon zonder gebouw hangt.
    gebouwId ? sr(env, 'res.partner', [['active', '=', true], ['is_company', '=', false], '|', ['parent_id', '=', gebouwId], ['id', '=', gebouwId]], vContact, { limit: 40 }) : [],
    sr(env, 'crm.lead', gebouwId
      ? (leadId ? ['|', ['id', '=', leadId], ['partner_id', 'child_of', gebouwId]] : [['partner_id', 'child_of', gebouwId]])
      : [['id', '=', leadId]], vLead, { ...ctx, order: 'create_date desc', limit: 15 }),
    gebouwId
      ? sr(env, 'x_sales_action_sheet', ['|', ['x_studio_for_company_id', '=', gebouwId], ['x_studio_contact_id', 'child_of', gebouwId]], vBlad, { limit: 10 })
      : (leadId ? sr(env, 'x_sales_action_sheet', [['x_studio_as_opportunity_ids', 'in', [leadId]]], vBlad, { limit: 10 }) : []),
  ]);
  let gebouw = gebouwen[0] || null;
  if (gebouwId && !gebouw) throw new SalesError(`Gebouw ${gebouwId} bestaat niet.`, 404);
  // Hangt de lead aan een PERSOON zonder bedrijf (nieuwe aanvraag), dan is er nog geen gebouw:
  // die persoon is een contact. Anders belanden kavels en syndicus op de fiche van een mens.
  const zonderGebouw = gebouw && gebouw.is_company === false ? gebouw : null;
  if (zonderGebouw) gebouw = null;
  return { gebouw, contacten, leads, actiebladen: bladen, basisId: gebouwId, zonderGebouw };
}

/** Ronde 2: geschiedenis rond alle records uit de kern. */
async function laadGeschiedenis(env, kern) {
  const partnerIds = [kern.gebouw?.id, ...kern.contacten.map((c) => c.id)].filter(Boolean);
  const leadIds = kern.leads.map((l) => l.id);
  const bladIds = kern.actiebladen.map((b) => b.id);

  const groepen = [['res.partner', partnerIds], ['crm.lead', leadIds], ['x_sales_action_sheet', bladIds]].filter(([, ids]) => ids.length);
  const ofRecords = (veldModel, veldId) => {
    const delen = groepen.map(([m, ids]) => ['&', [veldModel, '=', m], [veldId, 'in', ids]]);
    return [...Array(Math.max(0, delen.length - 1)).fill('|'), ...delen.flat()];
  };
  const leeg = Promise.resolve([]);

  const [berichten, activiteiten, calendly, gesprekken, orders, events, bijlagen, pijnRijen, pijnpunten] = await Promise.all([
    groepen.length ? zacht(env, 'mail.message',
      [['message_type', 'in', ['comment', 'email', 'email_outgoing']], ...ofRecords('model', 'res_id')],
      ['date', 'model', 'res_id', 'author_id', 'email_from', 'subject', 'body', 'message_type', 'subtype_id', 'attachment_ids'],
      { order: 'date desc', limit: 60 }) : leeg,
    groepen.length ? zacht(env, 'mail.activity', ofRecords('res_model', 'res_id'),
      ['summary', 'note', 'date_deadline', 'user_id', 'activity_type_id', 'res_model', 'res_id'],
      { order: 'date_deadline asc', limit: 20 }) : leeg,
    partnerIds.length ? zacht(env, 'x_calendlymeeting', [['x_studio_cm_invitee', 'in', partnerIds]],
      ['x_name', 'x_studio_cm_start_time', 'x_studio_cm_event_type', 'x_studio_cm_host_name', 'x_studio_cm_iscancelled', 'x_studio_cm_extra_info', 'x_studio_cm_invitee'],
      { order: 'x_studio_cm_start_time desc', limit: 15 }) : leeg,
    bladIds.length ? zacht(env, 'x_as_meetings', [['x_studio_for_action_sheet', 'in', bladIds]],
      ['x_name', 'x_studio_date', 'x_studio_meeting_type', 'x_studio_duration', 'x_studio_notes', 'x_studio_user_id', 'x_studio_stage_id'],
      { order: 'x_studio_date desc', limit: 20 }) : leeg,
    (kern.gebouw || kern.basisId) ? zacht(env, 'sale.order', [['partner_id', 'child_of', kern.gebouw?.id || kern.basisId]],
      ['name', 'state', 'subscription_state', 'date_order', 'start_date', 'next_invoice_date', 'recurring_monthly', 'amount_untaxed', 'plan_id', 'user_id'],
      { order: 'date_order desc', limit: 15 }) : leeg,
    partnerIds.length ? zacht(env, 'x_webinarregistrations', [['x_studio_registered_by', 'in', partnerIds]],
      ['x_studio_linked_webinar', 'x_studio_webinar_attended', 'x_studio_registration_state', 'create_date', 'x_studio_registered_by'],
      { order: 'create_date desc', limit: 15 }) : leeg,
    groepen.length ? zacht(env, 'ir.attachment', ofRecords('res_model', 'res_id'),
      ['name', 'mimetype', 'create_date', 'res_model', 'res_id', 'file_size'],
      { order: 'create_date desc', limit: 25 }) : leeg,
    bladIds.length ? zacht(env, 'x_action_sheet_pain_po', [['x_studio_action_sheet_id', 'in', bladIds]],
      ['x_studio_action_sheet_id', 'x_studio_pain_point_id', 'x_studio_score'], { limit: 200 }) : leeg,
    allePijnpunten(env),
  ]);
  return { berichten, activiteiten, calendly, gesprekken, orders, events, bijlagen, pijnRijen, pijnpunten };
}

let pijnCache = { t: 0, lijst: null };
/** De pijnpunten zoals ze in Odoo staan (x_user_painpoints), 10 minuten bewaard. */
export async function allePijnpunten(env) {
  if (pijnCache.lijst && Date.now() - pijnCache.t < 10 * 60 * 1000) return pijnCache.lijst;
  const rijen = await zacht(env, 'x_user_painpoints', [['x_active', '=', true]], ['x_name', 'x_studio_short_description'], { order: 'x_studio_sequence, id' });
  if (rijen) pijnCache = { t: Date.now(), lijst: rijen };
  return rijen || [];
}

/** Per actieblad: elk pijnpunt met zijn score (null = nog niet gescoord). */
export function pijnpuntenVan(gesch, bladId) {
  const rijen = (gesch.pijnRijen || []).filter((r) => m2oId(r.x_studio_action_sheet_id) === bladId);
  return (gesch.pijnpunten || []).map((p) => {
    const r = rijen.find((x) => m2oId(x.x_studio_pain_point_id) === p.id);
    const score = r && r.x_studio_score ? Number(r.x_studio_score) : null;
    return { id: p.id, naam: p.x_name, uitleg: p.x_studio_short_description || '', score: score > 0 ? score : null };
  });
}

// ── Tekst opbouwen ─────────────────────────────────────────────────────────

const datum = (s) => (s ? String(s).slice(0, 10) : '');
const datumTijd = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');

function link(env, model, id) {
  return `${odooOrigin(env)}/web#id=${id}&model=${model}&view_type=form`;
}

/** De bewerkbare velden van een record: ingevuld en nog leeg. */
function veldenBlok(cat, rec) {
  const bekend = [];
  const onbekend = [];
  for (const item of cat) {
    const w = rec[item.naam];
    if (isLeeg(item, w)) onbekend.push(item);
    else bekend.push(`- ${item.label} (\`${item.naam}\`): ${toonWaarde(item, w)}`);
  }
  return { bekend, onbekend };
}

function onbekendRegel(item) {
  let t = `\`${item.naam}\` ${item.label} [${item.type}`;
  if (item.keuzes && item.keuzes.length <= 25) t += ': ' + item.keuzes.map((k) => `${k.waarde}=${k.label}`).join(' | ');
  else if (item.keuzes) t += `: ${item.keuzes.length} keuzes, geef het label`;
  else if (item.relatie) t += `: id of naam (${item.relatie})`;
  return t + ']';
}

function recordNaam(kern, model, id) {
  if (model === 'res.partner') {
    if (kern.gebouw && kern.gebouw.id === id) return `gebouw ${kern.gebouw.name}`;
    const c = kern.contacten.find((x) => x.id === id);
    return c ? `contact ${c.name}` : `partner ${id}`;
  }
  if (model === 'crm.lead') return `lead ${id}`;
  if (model === 'x_sales_action_sheet') return `actieblad ${id}`;
  return `${model} ${id}`;
}

export async function bouwDossier(env, args) {
  const t0 = Date.now();
  const kern = await laadKern(env, args);
  const [geschiedenis, web, extra, cGebouw, cContact, cLead, cBlad] = await Promise.all([
    laadGeschiedenis(env, kern),
    webGedrag(env, kern.leads).catch((err) => { console.error('[claude-sales] web', err?.message); return { fout: true }; }),
    extraVragen(env, kern),
    catalogus(env, 'gebouw'), catalogus(env, 'contact'), catalogus(env, 'lead'), catalogus(env, 'actieblad'),
  ]);
  const { gebouw, contacten, leads, actiebladen } = kern;
  const r = [];
  const ontbreekt = []; // korte lijst voor het overzicht

  // Gebouw
  if (gebouw) {
    r.push(`# ${gebouw.name}  (gebouw_id ${gebouw.id})`);
    r.push(`Odoo: ${link(env, 'res.partner', gebouw.id)}`);
    const meta = [
      m2oNaam(gebouw.x_studio_company_type) && `type: ${m2oNaam(gebouw.x_studio_company_type)}`,
      gebouw.x_studio_company_status && `status: ${gebouw.x_studio_company_status}`,
      m2oNaam(gebouw.x_studio_parent_expert) && `adviserend expert: ${m2oNaam(gebouw.x_studio_parent_expert)}`,
      gebouw.x_studio_invoiced_by_partner && 'facturatie via expert',
      gebouw.x_syndicoach_pack && `Syndicoach-pakket: ${gebouw.x_syndicoach_pack}`,
      gebouw.x_studio_soid && `OpenVME-id: ${gebouw.x_studio_soid}`,
      gebouw.active === false && 'GEARCHIVEERD',
    ].filter(Boolean);
    if (meta.length) r.push(meta.join(' · '));
    const v = veldenBlok(cGebouw, gebouw);
    r.push('', '## Gebouw', ...(v.bekend.length ? v.bekend : ['- (nog niets ingevuld)']));
    if (gebouw.comment) r.push('', 'Notitie op het gebouw:', htmlNaarTekst(gebouw.comment, 1500));
    if (v.onbekend.length) ontbreekt.push(`gebouw ${gebouw.id}: ` + v.onbekend.map(onbekendRegel).join('; '));
  } else {
    const wie = kern.zonderGebouw?.name || leads[0]?.name || 'deze lead';
    r.push(`# ${wie}: nog geen gebouw in Odoo  (gebouw_id ${kern.basisId || '-'})`,
      'Er hangt nog geen gebouw aan. Gegevens van het gebouw (kavels, huidige syndicus, type beheer, ...) kunnen pas bewaard worden als het gebouw bestaat.',
      'Stel voor om het aan te maken met wat bekend is (nieuw_gebouw in dossier_bijwerken): naam van de VME, adres, type. De contactpersoon komt er dan vanzelf onder.');
  }

  // Contactpersonen
  r.push('', '## Contactpersonen');
  if (!contacten.length) r.push('- (geen)');
  for (const c of contacten) {
    const v = veldenBlok(cContact, c);
    r.push(`### ${c.name} (contact id ${c.id})`, ...v.bekend.filter((x) => !x.includes('(`name`)')));
    if (v.onbekend.length) ontbreekt.push(`contact ${c.id}: ` + v.onbekend.map(onbekendRegel).join('; '));
  }

  // Leads
  r.push('', '## Leads');
  if (!leads.length) r.push('- (geen)');
  for (const l of leads) {
    const fase = l.active === false ? (l.probability === 0 ? 'VERLOREN' : 'gearchiveerd') : m2oNaam(l.stage_id);
    r.push(`### ${l.name} (lead_id ${l.id})`,
      `Fase: ${fase || '-'} · verantwoordelijke: ${m2oNaam(l.user_id) || '-'} · aangemaakt ${datum(l.create_date)}`
        + (m2oNaam(l.lost_reason_id) ? ` · reden verloren: ${m2oNaam(l.lost_reason_id)}` : '')
        + (l.x_studio_lead_channel ? ` · kanaal: ${l.x_studio_lead_channel}` : '')
        + (l.x_studio_brand_origin ? ` · merk: ${l.x_studio_brand_origin}` : '')
        + (l.x_studio_hotness_label ? ` · hotness: ${l.x_studio_hotness_label}` : ''),
      `Odoo: ${link(env, 'crm.lead', l.id)}`);
    const v = veldenBlok(cLead, l);
    r.push(...v.bekend);
    if (l.x_studio_contact_message) r.push(`- Bericht uit het formulier: ${htmlNaarTekst(l.x_studio_contact_message, 800)}`);
    if (l.x_studio_merged_kpi_html) r.push(`- Websitegedrag: ${htmlNaarTekst(l.x_studio_merged_kpi_html, 500).replace(/\n+/g, ' · ')}`);
    r.push('', `**Interne notitie (lead ${l.id})**:`, htmlNaarTekst(l.description, 6000) || '(leeg)');
    if (v.onbekend.length) ontbreekt.push(`lead ${l.id}: ` + v.onbekend.map(onbekendRegel).join('; '));
  }

  // Actiebladen
  r.push('', '## Actieblad');
  if (!actiebladen.length) r.push('- (geen actieblad)');
  for (const b of actiebladen) {
    r.push(`### ${b.x_name || 'Actieblad'} (actieblad id ${b.id})`,
      `Fase: ${m2oNaam(b.x_studio_stage_id) || '-'} · sales: ${m2oNaam(b.x_studio_user_id) || '-'}`
        + (b.x_studio_discovery_progress ? ` · discovery ${Math.round(b.x_studio_discovery_progress)}%` : '')
        + (b.x_flag_level ? ` · vlag: ${b.x_flag_level}${b.x_flag_custom_message ? ' (' + b.x_flag_custom_message + ')' : ''}` : ''),
      `Odoo: ${link(env, 'x_sales_action_sheet', b.id)}`);
    const v = veldenBlok(cBlad, b);
    r.push(...v.bekend);
    const pp = pijnpuntenVan(geschiedenis, b.id);
    if (pp.length) {
      r.push('', `**Pijnpunten (actieblad ${b.id})**, score 1 = speelt nauwelijks, 5 = speelt sterk. Invullen met "pijnpunten" in dossier_bijwerken, enkel wat uit het gesprek blijkt:`);
      pp.forEach((p) => r.push(`- [pijnpunt ${p.id}] ${p.naam}: ${p.score ? 'score ' + p.score : 'nog niet gescoord'}${p.uitleg ? ' (' + p.uitleg.slice(0, 160) + ')' : ''}`));
    }
    if (v.onbekend.length) ontbreekt.push(`actieblad ${b.id}: ` + v.onbekend.map(onbekendRegel).join('; '));
  }

  const g = geschiedenis;
  const sectie = (titel, lijst, regel) => {
    r.push('', `## ${titel}`);
    if (lijst === null) { r.push('- (kon niet geladen worden)'); return; }
    if (!lijst.length) { r.push('- (geen)'); return; }
    lijst.forEach((x) => r.push(regel(x)));
  };

  sectie('Gesprekken op het actieblad', g.gesprekken, (m) =>
    `- ${datum(m.x_studio_date)} ${m2oNaam(m.x_studio_meeting_type) || ''} (${m.x_studio_duration || '?'} min, ${m2oNaam(m.x_studio_user_id) || '-'}): ${htmlNaarTekst(m.x_studio_notes, 600) || '(geen notities)'}`);
  sectie('Afspraken (Calendly)', g.calendly, (m) =>
    `- ${datumTijd(m.x_studio_cm_start_time)} ${m2oNaam(m.x_studio_cm_event_type) || m.x_name}, met ${m2oNaam(m.x_studio_cm_host_name) || '-'}`
      + (m.x_studio_cm_iscancelled ? ' (GEANNULEERD)' : '')
      + (m.x_studio_cm_extra_info ? ` · ${htmlNaarTekst(m.x_studio_cm_extra_info, 300)}` : ''));
  sectie('Open activiteiten', g.activiteiten, (a) =>
    `- ${datum(a.date_deadline)} ${m2oNaam(a.activity_type_id) || ''}: ${a.summary || htmlNaarTekst(a.note, 200) || '-'} (${m2oNaam(a.user_id) || '-'}, ${recordNaam(kern, a.res_model, a.res_id)})`);
  sectie('Offertes en abonnementen', g.orders, (o) =>
    `- ${o.name}: ${o.subscription_state || o.state}, ${datum(o.date_order)}`
      + (o.recurring_monthly ? `, € ${o.recurring_monthly}/maand` : o.amount_untaxed ? `, € ${o.amount_untaxed} excl.` : '')
      + (o.next_invoice_date ? `, volgende factuur ${datum(o.next_invoice_date)}` : ''));
  sectie('Events', g.events, (e) =>
    `- ${datum(e.create_date)} ${m2oNaam(e.x_studio_linked_webinar) || 'event'}: ${e.x_studio_webinar_attended ? 'aanwezig' : (e.x_studio_registration_state || 'ingeschreven')} (${m2oNaam(e.x_studio_registered_by) || ''})`);
  sectie('Bijlagen', g.bijlagen, (b) =>
    `- ${datum(b.create_date)} ${b.name} (${recordNaam(kern, b.res_model, b.res_id)})`);

  r.push('', '## Website (bezoeken van de mensen achter de leads)');
  if (!web) r.push('- (geen gegevens)');
  else if (web.fout) r.push('- (kon niet geladen worden)');
  else r.push(...web.regels);

  r.push('', '## Chatter en eerdere communicatie (nieuwste eerst)');
  if (g.berichten === null) r.push('- (kon niet geladen worden)');
  else if (!g.berichten.length) r.push('- (geen berichten)');
  else for (const m of g.berichten) {
    const soort = m.message_type === 'comment' ? (m2oNaam(m.subtype_id) === 'Note' || m2oNaam(m.subtype_id) === 'Notitie' ? 'notitie' : 'bericht') : 'mail';
    const wie = m2oNaam(m.author_id) || m.email_from || '?';
    // Compact: lege regels weg (mails hebben er tientallen in hun handtekening).
    const tekst = htmlNaarTekst(m.body, 1200).replace(/\n{2,}/g, '\n');
    r.push(`- ${datumTijd(m.date)} · ${soort} · ${wie} · ${recordNaam(kern, m.model, m.res_id)}${m.subject ? ' · ' + m.subject : ''}`
      + (tekst ? `\n  ${tekst.replace(/\n/g, '\n  ')}` : ''));
  }

  r.push('', '## Nog niet bekend (velden die je kan invullen)');
  if (!ontbreekt.length) r.push('- Alles is ingevuld.');
  else ontbreekt.forEach((x) => r.push('- ' + x));

  // Na te kijken komt bovenaan, onder de kop van het gebouw: dat moet eerst gezien worden.
  const punten = nakijkPunten(kern, geschiedenis, extra, web && !web.fout ? web : null);
  const plek = r.findIndex((x) => x.startsWith('## '));
  r.splice(plek < 0 ? r.length : plek, 0, '## Na te kijken', ...(punten.length ? punten.map((x) => '- ' + x) : ['- Niets opvallends.']), '');

  // "In het kort" helemaal bovenaan, klaar om zo te tonen (zie overzicht.js).
  const kort = kortOverzicht({
    kern, gesch: geschiedenis, web: web && !web.fout ? web : null, punten,
    catalogi: { gebouw: cGebouw, contact: cContact, lead: cLead, actieblad: cBlad },
  });
  r.unshift(
    '[Voor Claude] Toon de gebruiker EERST enkel het blok "In het kort" hieronder, in die vorm (inkorten mag, uitbreiden niet).',
    'Geen nummers of technische veldnamen naar de gebruiker: enkel namen, in gewone taal. De details eronder zijn voor jou, of voor als de gebruiker erom vraagt.',
    'Ontbreekt er een schakel (contact, gebouw, lead of actieblad), zeg dat altijd en stel voor om ze aan te maken.',
    'Eindig met een korte vraag wat hij nu wil doen (bv. een gesprek verwerken, de chatter bekijken, wat nog ontbreekt invullen).',
    '', '## In het kort', ...kort, '---', '# Details (niet tonen tenzij gevraagd)', '');

  r.push('', `_Opgehaald in ${Date.now() - t0} ms._`);
  return { tekst: r.join('\n'), kern };
}

export { MODELLEN };
