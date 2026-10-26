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
 * - Elke bewaring met een lead in het dossier bevat een nieuwe VOLLEDIGE
 *   interne notitie en een samenvatting in de chatter van de lead (Nico,
 *   2026-10-26: "dit is een must"). Zonder lead: een notitie in de chatter.
 *   De AI-velden op het actieblad gebruikt de connector niet.
 */

import { executeKw } from '../../../lib/odoo.js';
import { odooOrigin } from '../../../lib/medewerkers.js';
import { laadKern, allePijnpunten } from './dossier.js';
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
  // Een NIEUW gebouw (de lead hangt aan een persoon zonder gebouw). Velden voor dat gebouw
  // komen met record "gebouw" en id 0.
  const ng = args.nieuw_gebouw && !kern.gebouw ? args.nieuw_gebouw : null;
  if (args.nieuw_gebouw && kern.gebouw) fouten.push('nieuw_gebouw: er hangt al een gebouw aan dit dossier');
  // Een NIEUW actieblad (er is er nog geen). Velden, pijnpunten en een gesprek daarvoor komen met id 0.
  const na = args.nieuw_actieblad && !kern.actiebladen.length ? args.nieuw_actieblad : null;
  if (args.nieuw_actieblad && kern.actiebladen.length) fouten.push('nieuw_actieblad: er is al een actieblad, gebruik dat');
  const recordOk = (soort, id, waar) => {
    if (!SOORTEN.includes(soort)) { fouten.push(`${waar}: onbekend record "${soort}" (gebruik ${SOORTEN.join(', ')})`); return false; }
    if (soort === 'gebouw' && ng && !Number(id)) return true;
    if (soort === 'actieblad' && na && !Number(id)) return true;
    if (!toegelaten[soort].has(Number(id))) {
      fouten.push(soort === 'gebouw' && !kern.gebouw
        ? `${waar}: er is nog geen gebouw. Maak het aan met nieuw_gebouw (en gebruik dan id 0)`
        : soort === 'actieblad' && !kern.actiebladen.length
          ? `${waar}: er is nog geen actieblad. Maak het aan met nieuw_actieblad (en gebruik dan id 0)`
          : `${waar}: ${soort} ${id} hoort niet bij dit dossier`);
      return false;
    }
    return true;
  };

  // 1. Velden
  const catalogi = {};
  for (const s of SOORTEN) catalogi[s] = await catalogus(env, s);
  let ngVals = null;
  let ngContact = null;
  if (ng) {
    const naam = String(ng.naam || '').trim();
    if (!naam) fouten.push('nieuw_gebouw: naam ontbreekt (bv. "VME Residentie Zonneveld")');
    ngVals = { name: naam, is_company: true };
    if (ng.straat) ngVals.street = String(ng.straat).trim();
    if (ng.postcode) ngVals.zip = String(ng.postcode).trim();
    if (ng.plaats) ngVals.city = String(ng.plaats).trim();
    if (ng.ondernemingsnummer) ngVals.x_studio_registration_number = String(ng.ondernemingsnummer).trim();
    const typeItem = catalogi.gebouw.find((x) => x.naam === 'x_studio_company_type');
    if (ng.type && typeItem) {
      try { ngVals.x_studio_company_type = await naarOdoo(typeItem, ng.type, {}); }
      catch (err) { fouten.push(`nieuw_gebouw.type: ${err.message}`); }
    }
    // De persoon van de lead komt onder het nieuwe gebouw.
    const cid = Number(ng.contact_id) || kern.zonderGebouw?.id || null;
    ngContact = cid && kern.contacten.some((c) => c.id === cid) ? cid : null;
    if (ng.contact_id && !ngContact) fouten.push('nieuw_gebouw.contact_id: dat contact hoort niet bij dit dossier');
  }
  const hoofdLead = kern.leads.find((l) => l.active !== false) || kern.leads[0] || null;
  let naVals = null;
  if (na) {
    // Het gebouw van een actieblad volgt in Odoo uit zijn contactpersoon (parent_id), dus een contact is nodig.
    const leadPartner = Array.isArray(hoofdLead?.partner_id) ? hoofdLead.partner_id[0] : null;
    const cid = Number(na.contact_id) || (kern.contacten.some((c) => c.id === leadPartner) ? leadPartner : kern.contacten[0]?.id) || null;
    const contact = kern.contacten.find((c) => c.id === cid);
    if (!contact) fouten.push('nieuw_actieblad: er is geen contactpersoon (van dit gebouw) om het actieblad aan te hangen');
    const leadId = Number(na.lead_id) || hoofdLead?.id || null;
    if (na.lead_id && !kern.leads.some((l) => l.id === leadId)) fouten.push('nieuw_actieblad.lead_id: die lead hoort niet bij dit dossier');
    const gNaam = kern.gebouw?.name || ng?.naam || '';
    if (contact) {
      naVals = {
        x_name: `Actieblad voor ${gNaam ? gNaam + ', ' : ''}${String(contact.name).replace(/^.*?,\s*/, '')}`.slice(0, 200),
        x_studio_contact_id: contact.id,
        x_studio_stage_id: 1, // Discovery
        x_active: true,
        ...(leadId ? { x_studio_as_opportunity_ids: [[6, 0, [leadId]]] } : {}),
        ...(Array.isArray(hoofdLead?.user_id) ? { x_studio_user_id: hoofdLead.user_id[0] } : {}),
      };
    }
  }
  const schrijf = new Map(); // "soort:id" -> { model, id, vals }
  const wijzigingen = []; // leesbaar, voor het antwoord
  for (const [i, v] of (args.velden || []).entries()) {
    const waar = `velden[${i}] ${v?.veld || ''}`;
    if (!v || !recordOk(v.record, v.id, waar)) continue;
    const item = catalogi[v.record].find((x) => x.naam === v.veld);
    if (!item) { fouten.push(`${waar}: dit veld mag de connector niet invullen op een ${v.record}`); continue; }
    // Een vraag op het actieblad die Odoo op het gebouw of het contact bewaart.
    if (v.record === 'actieblad' && item.via) {
      const blad = kern.actiebladen.find((b) => b.id === Number(v.id));
      const nieuwBlad = !Number(v.id) && naVals;
      const heeft = item.via === 'gebouw'
        ? (blad && blad.x_studio_for_company_id) || ng || (nieuwBlad && kern.gebouw)
        : (blad && blad.x_studio_contact_id) || nieuwBlad;
      if (!heeft) {
        fouten.push(item.via === 'gebouw'
          ? `${waar} (${item.label}): wordt op het GEBOUW bewaard, en er hangt nog geen gebouw aan het actieblad. Maak eerst het gebouw aan (nieuw_gebouw).`
          : `${waar} (${item.label}): wordt op het CONTACT bewaard, en er staat geen contactpersoon op het actieblad. Vul eerst de contactpersoon in.`);
        continue;
      }
    }
    try {
      const waarde = await naarOdoo(item, v.waarde, {
        zoekPartner: (naam) => zoekBedrijf(env, naam),
        dossierContacten: kern.contacten,
      });
      const sleutel = `${v.record}:${Number(v.id) || 'nieuw'}`;
      if (!schrijf.has(sleutel)) schrijf.set(sleutel, { soort: v.record, model: MODELLEN[v.record], id: Number(v.id) || 'nieuw', vals: {} });
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
    if (!kern.gebouw && !ng) { fouten.push(`nieuwe_contacten[${i}]: er is geen gebouw om de contactpersoon aan te hangen (maak het aan met nieuw_gebouw)`); return false; }
    return true;
  });

  // Pijnpunten: score 1 (speelt nauwelijks) tot 5 (speelt sterk), null = wissen.
  const pijn = [];
  if ((args.pijnpunten || []).length) {
    const lijst = await allePijnpunten(env);
    for (const [i, p] of args.pijnpunten.entries()) {
      const waar = `pijnpunten[${i}]`;
      if (!p || !recordOk('actieblad', p.actieblad_id, waar)) continue;
      const pp = lijst.find((x) => x.id === Number(p.pijnpunt)) || lijst.find((x) => String(x.x_name).toLowerCase() === String(p.pijnpunt || '').trim().toLowerCase());
      if (!pp) { fouten.push(`${waar}: onbekend pijnpunt "${p.pijnpunt}" (kies uit: ${lijst.map((x) => `${x.id} ${x.x_name}`).join('; ')})`); continue; }
      const score = p.score === null || p.score === '' || p.score === 0 ? null : Number(p.score);
      if (score !== null && !(Number.isInteger(score) && score >= 1 && score <= 5)) { fouten.push(`${waar} (${pp.x_name}): score moet 1 tot 5 zijn, of null om te wissen`); continue; }
      pijn.push({ bladId: Number(p.actieblad_id) || 0, id: pp.id, naam: pp.x_name, score });
    }
  }

  const ietsTeBewaren = schrijf.size || notities.length || intern || gesprek || nieuwe.length || ng || na || pijn.length;
  // Samenvatten is verplicht: de interne notitie van de lead en de chatter zijn het geheugen van sales.
  if (ietsTeBewaren && hoofdLead) {
    if (!intern) fouten.push(`interne_notitie ontbreekt: geef de NIEUWE VOLLEDIGE interne notitie van de lead "${hoofdLead.name}" (lead_id ${hoofdLead.id}) mee, met alles wat we weten, ook wat nu verandert.`);
    if (!notities.some((n) => n.record === 'lead')) fouten.push(`notities ontbreekt: zet een korte samenvatting van wat er nu gebeurde in de chatter van de lead "${hoofdLead.name}" (record "lead", id ${hoofdLead.id}).`);
  } else if (ietsTeBewaren && !notities.length) {
    fouten.push('notities ontbreekt: zet een korte samenvatting van wat er nu gebeurde in de chatter (van het gebouw of het contact).');
  }

  if (fouten.length) {
    throw new SalesError('Er is NIETS geschreven. Pas het voorstel aan:\n- ' + fouten.join('\n- '));
  }
  if (!ietsTeBewaren) {
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

  // Eerst het nieuwe gebouw, dan de persoon eronder en het actieblad eraan: pas daarna
  // komen de doorgeefvelden van het actieblad op het gebouw terecht.
  let gebouwId = kern.gebouw?.id || null;
  if (ng) {
    gebouwId = await doe(`gebouw "${ngVals.name}" aangemaakt`, () => kw(env, 'res.partner', 'create', [ngVals]));
    if (!gebouwId) {
      throw new SalesError('Het gebouw kon niet aangemaakt worden, dus er is niets anders geschreven: ' + mislukt.join('; '));
    }
    if (ngContact) await doe('contactpersoon onder het gebouw gezet', () => kw(env, 'res.partner', 'write', [[ngContact], { parent_id: gebouwId }]));
    const losseBladen = kern.actiebladen.filter((b) => !b.x_studio_for_company_id).map((b) => b.id);
    if (losseBladen.length) await doe('actieblad aan het gebouw gehangen', () => kw(env, 'x_sales_action_sheet', 'write', [losseBladen, { x_studio_for_company_id: gebouwId }]));
    for (const w of schrijf.values()) if (w.id === 'nieuw' && w.soort === 'gebouw') w.id = gebouwId;
    notities.forEach((n) => { if (n.record === 'gebouw' && !Number(n.id)) n.id = gebouwId; });
  }

  let nieuwBladId = null;
  if (naVals) {
    nieuwBladId = await doe('actieblad aangemaakt', () => kw(env, 'x_sales_action_sheet', 'create', [naVals]));
    if (!nieuwBladId) {
      throw new SalesError(`Het actieblad kon niet aangemaakt worden (${mislukt.join('; ')}). ${gelukt.length ? 'Al gedaan: ' + gelukt.join(', ') + '. ' : ''}De rest is niet geschreven.`);
    }
    for (const w of schrijf.values()) if (w.id === 'nieuw' && w.soort === 'actieblad') w.id = nieuwBladId;
    notities.forEach((n) => { if (n.record === 'actieblad' && !Number(n.id)) n.id = nieuwBladId; });
    if (gesprek && !Number(gesprek.actieblad_id)) gesprek.actieblad_id = nieuwBladId;
    pijn.forEach((p) => { if (!p.bladId) p.bladId = nieuwBladId; });
  }

  await Promise.all([...schrijf.values()].map((w) =>
    doe(`${Object.keys(w.vals).length} veld(en) op ${w.model} ${w.id}`, () => kw(env, w.model, 'write', [[w.id], w.vals]))));

  const nieuweIds = await Promise.all(nieuwe.map((c) => doe(`contact ${c.naam} aangemaakt`, () => kw(env, 'res.partner', 'create', [{
    name: String(c.naam).trim(),
    parent_id: gebouwId,
    type: 'contact',
    is_company: false,
    ...(c.email ? { email: String(c.email).trim() } : {}),
    ...(c.telefoon ? { phone: String(c.telefoon).trim() } : {}),
    ...(c.gsm ? { mobile: String(c.gsm).trim() } : {}),
    ...(c.functie ? { function: String(c.functie).trim() } : {}),
  }]))));

  if (pijn.length) {
    // Odoo maakt bij een nieuw actieblad zelf een regel per pijnpunt (automatisatie 29); bestaat ze niet, dan maken we ze.
    const bladen = [...new Set(pijn.map((p) => p.bladId))];
    const rijen = await kw(env, 'x_action_sheet_pain_po', 'search_read',
      [[['x_studio_action_sheet_id', 'in', bladen]]], { fields: ['x_studio_action_sheet_id', 'x_studio_pain_point_id'] }).catch(() => []);
    await Promise.all(pijn.map((p) => {
      const r = rijen.find((x) => x.x_studio_action_sheet_id?.[0] === p.bladId && x.x_studio_pain_point_id?.[0] === p.id);
      const score = p.score === null ? false : String(p.score);
      return doe(`pijnpunt "${p.naam}" ${p.score === null ? 'gewist' : 'score ' + p.score}`, () => (r
        ? kw(env, 'x_action_sheet_pain_po', 'write', [[r.id], { x_studio_score: score }])
        : kw(env, 'x_action_sheet_pain_po', 'create', [{ x_studio_action_sheet_id: p.bladId, x_studio_pain_point_id: p.id, x_name: p.naam, x_studio_score: score, x_active: true }])));
    }));
  }

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
  if (gebouwId) links.push(`Gebouw${ng ? ' (nieuw)' : ''}: ${link(env, 'res.partner', gebouwId)}`);
  kern.leads.slice(0, 3).forEach((l) => links.push(`Lead ${l.name}: ${link(env, 'crm.lead', l.id)}`));
  kern.actiebladen.slice(0, 2).forEach((b) => links.push(`Actieblad: ${link(env, 'x_sales_action_sheet', b.id)}`));
  if (nieuwBladId) links.push(`Actieblad (nieuw): ${link(env, 'x_sales_action_sheet', nieuwBladId)}`);
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
    details: { gelukt, mislukt, wijzigingen, notities: notities.length, intern: !!intern, gesprek: !!gesprek, nieuwe_contacten: nieuwe.length, pijnpunten: pijn.length, nieuw_actieblad: !!nieuwBladId },
    kern,
  };
}
