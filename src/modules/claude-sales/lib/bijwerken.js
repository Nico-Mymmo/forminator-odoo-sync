/**
 * Wegschrijven wat de salesmedewerker in Claude bevestigde.
 *
 * Eerst ALLES nakijken, dan pas schrijven: een fout in een veld betekent dat
 * er niets geschreven wordt, en Claude krijgt de reden terug om het voorstel
 * bij te sturen. Half bijgewerkte dossiers bestaan dus niet door een tikfout.
 *
 * Afspraken die bewust zo zijn:
 * - Enkel records van DIT dossier (het gebouw, zijn contacten, leads en
 *   actiebladen). Een id van elders wordt geweigerd.
 * - Enkel de velden uit BEWERKBAAR (velden.js).
 * - De interne notitie van de lead wordt VERVANGEN door een nieuwe volledige
 *   samenvatting, maar de vorige versie komt eerst als notitie in de chatter.
 *   Zo gaat er nooit iets verloren als Claude iets wegliet.
 * - In de chatter staat de medewerker als auteur, met "via Claude" erbij.
 */

import { executeKw } from '../../../lib/odoo.js';
import { odooOrigin } from '../../../lib/medewerkers.js';
import { laadKern } from './dossier.js';
import { MODELLEN, catalogus, naarOdoo } from './velden.js';
import { esc, htmlNaarTekst, tekstNaarHtml } from './tekst.js';
import { odooGebruiker } from './toegang.js';
import { SalesError } from './constants.js';

const SOORTEN = Object.keys(MODELLEN);

function kw(env, model, method, args, kwargs = {}) {
  return executeKw(env, { model, method, args, kwargs });
}

function link(env, model, id) {
  return `${odooOrigin(env)}/web#id=${id}&model=${model}&view_type=form`;
}

/** Een syndicus (of ander bedrijf) op naam: precies een treffer, anders een fout met kandidaten. */
async function zoekBedrijf(env, naam) {
  const rijen = await kw(env, 'res.partner', 'search_read',
    [[['is_company', '=', true], ['name', 'ilike', naam]]], { fields: ['name', 'city'], limit: 6 });
  const exact = rijen.filter((r) => r.name.toLowerCase() === naam.trim().toLowerCase());
  if (exact.length === 1) return exact[0].id;
  if (rijen.length === 1) return rijen[0].id;
  if (!rijen.length) throw new Error(`geen bedrijf "${naam}" gevonden in Odoo`);
  throw new Error(`meerdere bedrijven gevonden, geef het id: ${rijen.map((r) => `${r.id} ${r.name}${r.city ? ' (' + r.city + ')' : ''}`).join('; ')}`);
}

function kopRegel(gebruiker, bron) {
  return `<p><em>Via Claude · ${esc(gebruiker.naam)}${bron ? ' · ' + esc(bron) : ''}</em></p>`;
}

/**
 * @param {object} args  zie het schema van dossier_bijwerken in mcp.js
 * @returns {Promise<{tekst, details}>}
 */
export async function werkDossierBij(env, gebruiker, args) {
  if (args?.bevestigd !== true) {
    throw new SalesError('Toon eerst het volledige voorstel aan de gebruiker en vraag uitdrukkelijk bevestiging. Roep daarna opnieuw aan met bevestigd: true.');
  }
  const kern = await laadKern(env, args);
  const toegelaten = {
    gebouw: new Set(kern.gebouw ? [kern.gebouw.id] : []),
    contact: new Set(kern.contacten.map((c) => c.id)),
    lead: new Set(kern.leads.map((l) => l.id)),
    actieblad: new Set(kern.actiebladen.map((b) => b.id)),
  };
  const fouten = [];
  const recordOk = (soort, id, waar) => {
    if (!SOORTEN.includes(soort)) { fouten.push(`${waar}: onbekend record "${soort}" (gebruik ${SOORTEN.join(', ')})`); return false; }
    if (!toegelaten[soort].has(Number(id))) { fouten.push(`${waar}: ${soort} ${id} hoort niet bij dit dossier`); return false; }
    return true;
  };

  // 1. Velden
  const catalogi = {};
  for (const s of SOORTEN) catalogi[s] = await catalogus(env, s);
  const schrijf = new Map(); // "soort:id" -> { model, id, vals }
  const wijzigingen = []; // leesbaar, voor het antwoord
  for (const [i, v] of (args.velden || []).entries()) {
    const waar = `velden[${i}] ${v?.veld || ''}`;
    if (!v || !recordOk(v.record, v.id, waar)) continue;
    const item = catalogi[v.record].find((x) => x.naam === v.veld);
    if (!item) { fouten.push(`${waar}: dit veld mag de connector niet invullen op een ${v.record}`); continue; }
    try {
      const waarde = await naarOdoo(item, v.waarde, {
        zoekPartner: (naam) => zoekBedrijf(env, naam),
        dossierContacten: kern.contacten,
      });
      const sleutel = `${v.record}:${Number(v.id)}`;
      if (!schrijf.has(sleutel)) schrijf.set(sleutel, { model: MODELLEN[v.record], id: Number(v.id), vals: {} });
      schrijf.get(sleutel).vals[item.naam] = waarde;
      wijzigingen.push(`${v.record} ${v.id}: ${item.label} = ${v.waarde === null || v.waarde === '' ? '(leeg)' : JSON.stringify(v.waarde)}`);
    } catch (err) {
      fouten.push(`${waar} (${item.label}): ${err.message}`);
    }
  }

  // 2. Notities, interne notitie, gesprek, nieuwe contacten: nakijken
  const notities = (args.notities || []).filter((n, i) => {
    if (!n || !String(n.tekst || '').trim()) { fouten.push(`notities[${i}]: lege tekst`); return false; }
    return recordOk(n.record, n.id, `notities[${i}]`);
  });
  const intern = args.interne_notitie;
  if (intern) {
    if (!String(intern.tekst || '').trim()) fouten.push('interne_notitie: lege tekst');
    else recordOk('lead', intern.lead_id, 'interne_notitie');
  }
  const gesprek = args.gesprek;
  let gesprekType = null;
  if (gesprek) {
    if (recordOk('actieblad', gesprek.actieblad_id, 'gesprek') && gesprek.type) {
      const types = await kw(env, 'x_sales_meeting_type', 'search_read', [[]], { fields: ['x_name'] });
      const t = types.find((x) => x.id === Number(gesprek.type) || x.x_name.toLowerCase() === String(gesprek.type).toLowerCase());
      if (!t) fouten.push(`gesprek.type: kies uit ${types.map((x) => `${x.id} (${x.x_name})`).join(', ')}`);
      else gesprekType = t.id;
    }
    if (gesprek.datum && !/^\d{4}-\d{2}-\d{2}$/.test(String(gesprek.datum))) fouten.push('gesprek.datum: verwacht JJJJ-MM-DD');
  }
  const nieuwe = (args.nieuwe_contacten || []).filter((c, i) => {
    if (!c || !String(c.naam || '').trim()) { fouten.push(`nieuwe_contacten[${i}]: naam ontbreekt`); return false; }
    if (!kern.gebouw) { fouten.push(`nieuwe_contacten[${i}]: er is geen gebouw om de contactpersoon aan te hangen`); return false; }
    return true;
  });

  if (fouten.length) {
    throw new SalesError('Er is NIETS geschreven. Pas het voorstel aan:\n- ' + fouten.join('\n- '));
  }
  if (!schrijf.size && !notities.length && !intern && !gesprek && !nieuwe.length) {
    throw new SalesError('Er is niets om te bewaren.');
  }

  // 3. Schrijven
  const odoo = await odooGebruiker(env, gebruiker);
  const kop = kopRegel(gebruiker, args.bron);
  const post = (model, id, html) => kw(env, model, 'message_post', [[id]], {
    body: html, body_is_html: true, message_type: 'comment', subtype_xmlid: 'mail.mt_note',
    ...(odoo?.partner_id ? { author_id: odoo.partner_id } : {}),
  });
  const gelukt = [];
  const mislukt = [];
  const doe = async (wat, fn) => {
    try { const r = await fn(); gelukt.push(wat); return r; } catch (err) { mislukt.push(`${wat}: ${err.message}`); return null; }
  };

  await Promise.all([...schrijf.values()].map((w) =>
    doe(`${Object.keys(w.vals).length} veld(en) op ${w.model} ${w.id}`, () => kw(env, w.model, 'write', [[w.id], w.vals]))));

  const nieuweIds = await Promise.all(nieuwe.map((c) => doe(`contact ${c.naam} aangemaakt`, () => kw(env, 'res.partner', 'create', [{
    name: String(c.naam).trim(),
    parent_id: kern.gebouw.id,
    type: 'contact',
    is_company: false,
    ...(c.email ? { email: String(c.email).trim() } : {}),
    ...(c.telefoon ? { phone: String(c.telefoon).trim() } : {}),
    ...(c.gsm ? { mobile: String(c.gsm).trim() } : {}),
    ...(c.functie ? { function: String(c.functie).trim() } : {}),
  }]))));

  if (gesprek) {
    const dag = gesprek.datum || new Date().toISOString().slice(0, 10);
    await doe('gesprek op het actieblad', () => kw(env, 'x_as_meetings', 'create', [{
      x_name: String(gesprek.titel || `Gesprek op ${dag}`).slice(0, 200),
      x_studio_for_action_sheet: Number(gesprek.actieblad_id),
      x_studio_date: dag,
      x_studio_stage_id: 3, // Gereed: het gesprek heeft plaatsgevonden
      ...(gesprekType ? { x_studio_meeting_type: gesprekType } : {}),
      ...(Number(gesprek.duur_minuten) > 0 ? { x_studio_duration: Math.round(Number(gesprek.duur_minuten)) } : {}),
      ...(gesprek.notities ? { x_studio_notes: kop + tekstNaarHtml(gesprek.notities) } : {}),
      ...(odoo?.uid ? { x_studio_user_id: odoo.uid } : {}),
    }]));
  }

  if (intern) {
    const leadId = Number(intern.lead_id);
    const huidige = kern.leads.find((l) => l.id === leadId)?.description || '';
    const nieuw = tekstNaarHtml(intern.tekst);
    // Eerst de vorige versie veilig zetten; lukt dat niet, dan niet overschrijven.
    const vorigeBewaard = !htmlNaarTekst(huidige) || await doe('vorige interne notitie bewaard in de chatter', () =>
      post('crm.lead', leadId, `<p><strong>Vorige versie van de interne notitie</strong> (vervangen via Claude door ${esc(gebruiker.naam)})</p>${huidige}`)) !== null;
    if (vorigeBewaard) {
      await doe(`interne notitie van lead ${leadId} bijgewerkt`, () => kw(env, 'crm.lead', 'write', [[leadId], { description: nieuw }]));
    } else {
      mislukt.push(`interne notitie van lead ${leadId}: niet overschreven, omdat de vorige versie niet bewaard kon worden`);
    }
  }

  await Promise.all(notities.map((n) =>
    doe(`notitie op ${n.record} ${n.id}`, () => post(MODELLEN[n.record], Number(n.id), kop + tekstNaarHtml(n.tekst)))));

  // 4. Antwoord
  const links = [];
  if (kern.gebouw) links.push(`Gebouw: ${link(env, 'res.partner', kern.gebouw.id)}`);
  kern.leads.slice(0, 3).forEach((l) => links.push(`Lead ${l.name}: ${link(env, 'crm.lead', l.id)}`));
  kern.actiebladen.slice(0, 2).forEach((b) => links.push(`Actieblad: ${link(env, 'x_sales_action_sheet', b.id)}`));
  nieuweIds.filter(Boolean).forEach((id) => links.push(`Nieuwe contactpersoon: ${link(env, 'res.partner', id)}`));

  const tekst = [
    mislukt.length ? `Deels bewaard: ${gelukt.length} gelukt, ${mislukt.length} mislukt.` : `Bewaard in Odoo (${gelukt.length} acties).`,
    ...gelukt.map((x) => `- OK ${x}`),
    ...mislukt.map((x) => `- MISLUKT ${x}`),
    '', ...links,
    ...(odoo?.partner_id ? [] : ['', `Let op: ${gebruiker.naam} is niet als gebruiker in Odoo gevonden; de notities staan op naam van het systeemaccount, met de naam erbij.`]),
  ].join('\n');
  return {
    tekst,
    ok: !mislukt.length,
    details: { gelukt, mislukt, wijzigingen, notities: notities.length, intern: !!intern, gesprek: !!gesprek, nieuwe_contacten: nieuwe.length },
    kern,
  };
}
