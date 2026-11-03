/**
 * Opvolging -- BERICHTTEKSTEN (macro's): de mails die een verkoper vanuit de
 * opvolging stuurt ("Ik probeerde je te bellen", "Heb je de offerte goed
 * ontvangen?", ...).
 *
 * Een bericht staat EEN keer in de OM (D1 om-core, opv_berichten) en wordt
 * altijd ingevuld met de gegevens van EEN kans: de contactpersoon, het gebouw,
 * de laatste offerte en de verkoper. Thomas schrijft en past ze aan in CX
 * Automations -> Opvolging -> Berichten.
 *
 * DE VORM IS DIE VAN DE MAILSTAP VAN KOPPELINGEN: platte tekst
 * (render-plain.js), en de handtekening van de VERKOPER (res.users.signature,
 * gepusht door de signature-designer) eronder. Geen opgemaakte mailing: een
 * bericht hoort te lezen als een mail die de verkoper zelf typte. Er is dus
 * ook geen tweede renderer: het voorbeeld en (straks) de verzending gaan door
 * renderPlainMailHtml().
 *
 * Wat hier NOG NIET gebeurt, bewust: versturen. Dat komt in een volgende stap
 * (vanuit de kans, eerst als klaargezet concept), zodat de teksten eerst
 * geschreven en nagelezen kunnen worden op echte kansen.
 */

import { searchRead, create } from '../../../lib/odoo.js';
import { getCoreDb } from '../../../lib/core-db.js';
import { medewerkerVoorOdooGebruiker, voornaamVan } from '../../../lib/medewerkers.js';
import { renderPlainMailHtml, renderPlainSubject, nietPlatteOpmaak } from '../../../lib/mail/render-plain.js';
import { fillPlaceholders } from '../../../lib/mail/render-blocks.js';
import { resolveSenderAfspraak, isBlacklisted, opAfzenderdomein, lijktOpEmail } from '../../forminator-sync-v2/mail-step.js';
import { leadMerk } from '../../dashboards/lib/sales/lead-rules.js';
import { heeftVelden } from './odoo-data.js';
import { werkPaneelBij } from './paneel.js';
import { OpvolgingError } from './constants.js';

const TABEL = 'opv_berichten';
// De groepen staan in een eigen lijst (zoals de mappen in Koppelingen), in de
// linkerkolom van het tabblad Berichten. groep_id leeg = "Zonder groep".
const GROEPEN_TABEL = 'opv_bericht_groepen';
export const MERKEN = { alle: 'Alle merken', syndicoach: 'Syndicoach', openvme: 'OpenVME' };
// De eerste taal is de standaard: die staat in onderwerp/tekst_html, de
// andere in `vertalingen` (migratie 0024).
export const TALEN = { nl: 'Nederlands', fr: 'Frans' };
const STANDAARD_TAAL = 'nl';
const MERK_DOMEIN = { syndicoach: 'syndicoach.be', openvme: 'openvme.be' };
const MERK_NAAM = { syndicoach: 'Syndicoach', openvme: 'OpenVME' };

/**
 * De placeholders, in de volgorde van de keuzelijst. `voorbeeld` is wat het
 * voorbeeld toont zonder gekozen kans. `afspraak.sender.standaard` is de
 * agenda van de verkoper (zelfde afspraaklinks als bij de koppelingen).
 */
export const TOKENS = [
  { pad: 'contact.first_name', label: 'Voornaam klant', voorbeeld: 'Sofie' },
  { pad: 'contact.name', label: 'Naam klant', voorbeeld: 'Sofie Peeters' },
  { pad: 'contact.email', label: 'E-mailadres klant', voorbeeld: 'sofie@voorbeeld.be' },
  { pad: 'gebouw.naam', label: 'Gebouw', voorbeeld: 'Residentie Zonneveld' },
  { pad: 'gebouw.pakket', label: 'Pakket (Syndicoach)', voorbeeld: 'Assistant' },
  // Nummer en bedrag enkel bij een offerte in Odoo (OpenVME); bij Syndicoach is
  // de offerte een pdf van de OM en kennen we enkel de datum.
  { pad: 'offerte.nummer', label: 'Offertenummer (enkel OpenVME)', voorbeeld: 'S01450' },
  { pad: 'offerte.bedrag', label: 'Bedrag offerte (enkel OpenVME)', voorbeeld: '€ 1.234,00' },
  { pad: 'offerte.datum', label: 'Datum offerte', voorbeeld: '28 oktober 2026' },
  { pad: 'verkoper.first_name', label: 'Voornaam verkoper', voorbeeld: 'Thomas' },
  { pad: 'verkoper.name', label: 'Naam verkoper', voorbeeld: 'Thomas Janssens' },
  { pad: 'verkoper.job_title', label: 'Functie verkoper', voorbeeld: 'Syndicoach' },
  { pad: 'afspraak.sender.standaard', label: 'Afspraaklink verkoper', voorbeeld: 'https://syndicoach.be/?afspraak=thomas' },
];

const PAKKETTEN = { assistant: 'Assistant', captain: 'Captain', coach: 'Coach' };

function tekst(v, max) { return String(v ?? '').trim().slice(0, max); }
function m2o(v) { return Array.isArray(v) ? v[0] : (Number.isInteger(v) ? v : null); }

/** Een bericht van het scherm nakijken. Gooit (400) bij iets onbruikbaars. */
export function normaliseerBericht(invoer = {}) {
  const naam = tekst(invoer.naam, 80);
  if (!naam) throw new OpvolgingError('Geef het bericht een naam.', 400);
  const groepId = tekst(invoer.groep_id, 80) || null;
  const merk = Object.prototype.hasOwnProperty.call(MERKEN, invoer.merk) ? invoer.merk : 'alle';
  const onderwerp = tekst(invoer.onderwerp, 200).replace(/\s+/g, ' ');
  const tekstHtml = String(invoer.tekst_html ?? '').slice(0, 50000);
  controleerOpmaak(tekstHtml);
  // Vertalingen: enkel de gekende talen, en een lege vertaling bestaat niet.
  const vertalingen = {};
  const ruw = invoer.vertalingen && typeof invoer.vertalingen === 'object' ? invoer.vertalingen : {};
  for (const taal of Object.keys(TALEN)) {
    if (taal === STANDAARD_TAAL || !ruw[taal]) continue;
    const v = { onderwerp: tekst(ruw[taal].onderwerp, 200).replace(/\s+/g, ' '), tekst_html: String(ruw[taal].tekst_html ?? '').slice(0, 50000) };
    controleerOpmaak(v.tekst_html);
    if (v.onderwerp || heeftTekst(v.tekst_html)) vertalingen[taal] = v;
  }
  const actief = invoer.actief === true || invoer.actief === 1 || invoer.actief === 'true';
  if (actief && (!onderwerp || !tekstHtml.replace(/<[^>]*>/g, '').trim())) {
    throw new OpvolgingError('Een bericht dat aan staat, heeft een onderwerp en een tekst nodig.', 400);
  }
  const volgorde = Number.isInteger(Number(invoer.volgorde)) ? Number(invoer.volgorde) : 0;
  // `groep` (de naam als tekst, migratie 0022) is verplicht in de tabel maar
  // wordt niet meer gelezen: de groep is groep_id.
  return { naam, groep: '', groep_id: groepId, merk, taal: STANDAARD_TAAL, onderwerp, tekst_html: tekstHtml, vertalingen, actief, volgorde };
}

function heeftTekst(html) { return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== ''; }

function controleerOpmaak(html) {
  const verboden = nietPlatteOpmaak(html);
  if (verboden.length) {
    throw new OpvolgingError(`Dit is een gewone mail: haal ${verboden.map((x) => '<' + x + '>').join(', ')} uit de tekst.`, 400);
  }
}

/** Onderwerp + tekst in een taal, of null als die versie (nog) niet volledig bestaat. */
export function versieVoor(bericht, taal) {
  const v = taal === STANDAARD_TAAL
    ? { onderwerp: bericht.onderwerp, tekst_html: bericht.tekst_html }
    : (bericht.vertalingen || {})[taal];
  if (!v || !String(v.onderwerp || '').trim() || !heeftTekst(v.tekst_html)) return null;
  return { onderwerp: v.onderwerp, tekst_html: v.tekst_html, taal };
}

/** De talen waarin een bericht volledig bestaat (onderwerp en tekst). */
export function talenVan(bericht) {
  return Object.keys(TALEN).filter((taal) => versieVoor(bericht, taal));
}

async function leesBericht(env, id) {
  const { data, error } = await getCoreDb(env).from(TABEL).select('*').eq('id', id).maybeSingle();
  if (error) throw new OpvolgingError(`Bericht lezen mislukt: ${error.message}`, 500);
  if (!data) throw new OpvolgingError('Dit bericht bestaat niet (meer).', 404);
  return data;
}

export async function lijstBerichten(env) {
  const { data, error } = await getCoreDb(env).from(TABEL).select('*')
    .order('volgorde', { ascending: true }).order('naam', { ascending: true });
  if (error) throw new OpvolgingError(`Berichten lezen mislukt: ${error.message}`, 500);
  return data || [];
}

/** Een bericht naar een andere groep (slepen in de lijst). Leeg = zonder groep. */
export async function verplaatsBericht(env, id, groepId) {
  const { error } = await getCoreDb(env).from(TABEL).update({ groep_id: tekst(groepId, 80) || null }).eq('id', id);
  if (error) throw new OpvolgingError(`Verplaatsen mislukt: ${error.message}`, 500);
  return { id, groep_id: tekst(groepId, 80) || null };
}

// ─── Groepen ─────────────────────────────────────────────────────────────────

export async function lijstGroepen(env) {
  const { data, error } = await getCoreDb(env).from(GROEPEN_TABEL).select('*')
    .order('volgorde', { ascending: true }).order('naam', { ascending: true });
  if (error) throw new OpvolgingError(`Groepen lezen mislukt: ${error.message}`, 500);
  return data || [];
}

function groepNaam(v) {
  const naam = tekst(v, 40);
  if (!naam) throw new OpvolgingError('Geef de groep een naam.', 400);
  return naam;
}

export async function maakGroep(env, invoer = {}) {
  const naam = groepNaam(invoer.naam);
  const bestaande = await lijstGroepen(env);
  if (bestaande.some((g) => g.naam.toLowerCase() === naam.toLowerCase())) {
    throw new OpvolgingError(`Er is al een groep "${naam}".`, 409);
  }
  const rij = { id: crypto.randomUUID(), naam, volgorde: (bestaande.reduce((m, g) => Math.max(m, g.volgorde || 0), 0) + 10) };
  const { error } = await getCoreDb(env).from(GROEPEN_TABEL).insert(rij);
  if (error) throw new OpvolgingError(`Groep maken mislukt: ${error.message}`, 500);
  return rij;
}

export async function hernoemGroep(env, id, invoer = {}) {
  const naam = groepNaam(invoer.naam);
  const bestaande = await lijstGroepen(env);
  if (bestaande.some((g) => g.id !== id && g.naam.toLowerCase() === naam.toLowerCase())) {
    throw new OpvolgingError(`Er is al een groep "${naam}".`, 409);
  }
  const { error } = await getCoreDb(env).from(GROEPEN_TABEL).update({ naam }).eq('id', id);
  if (error) throw new OpvolgingError(`Hernoemen mislukt: ${error.message}`, 500);
  return { id, naam };
}

/** Een groep weghalen; haar berichten blijven, zonder groep. */
export async function verwijderGroep(env, id) {
  const db = getCoreDb(env);
  const { error: e1 } = await db.from(TABEL).update({ groep_id: null }).eq('groep_id', id);
  if (e1) throw new OpvolgingError(`Berichten losmaken mislukt: ${e1.message}`, 500);
  const { error } = await db.from(GROEPEN_TABEL).delete().eq('id', id);
  if (error) throw new OpvolgingError(`Verwijderen mislukt: ${error.message}`, 500);
  return { id };
}

export async function bewaarBericht(env, id, invoer, doorNaam) {
  const rij = normaliseerBericht(invoer);
  const db = getCoreDb(env);
  if (id) {
    const { error } = await db.from(TABEL).update({ ...rij, door_naam: doorNaam || null }).eq('id', id);
    if (error) throw new OpvolgingError(`Bewaren mislukt: ${error.message}`, 500);
    return { id, ...rij };
  }
  const nieuwId = crypto.randomUUID();
  const { error } = await db.from(TABEL).insert({ id: nieuwId, ...rij, door_naam: doorNaam || null });
  if (error) throw new OpvolgingError(`Bewaren mislukt: ${error.message}`, 500);
  return { id: nieuwId, ...rij };
}

export async function verwijderBericht(env, id) {
  const { error } = await getCoreDb(env).from(TABEL).delete().eq('id', id);
  if (error) throw new OpvolgingError(`Verwijderen mislukt: ${error.message}`, 500);
}

// ─── De gegevens van een kans ────────────────────────────────────────────────

function euro(bedrag) {
  if (bedrag == null || bedrag === '') return '';
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(Number(bedrag));
}
function datumLang(odooDatum, taal = STANDAARD_TAAL) {
  if (!odooDatum) return '';
  const d = new Date(String(odooDatum).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(taal === 'fr' ? 'fr-BE' : 'nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** De taal van de contactpersoon (res.partner.lang), als sleutel uit TALEN. */
function taalVanPartner(lang) {
  const x = String(lang || '').slice(0, 2).toLowerCase();
  return Object.prototype.hasOwnProperty.call(TALEN, x) ? x : STANDAARD_TAAL;
}

/**
 * De placeholdercontext van een kans. Ontbreekt iets (geen offerte, geen
 * gebouw), dan is die placeholder leeg: dat ziet de verkoper in het voorbeeld.
 * Geeft ook het Odoo-gebruikers-id van de verkoper terug (voor de handtekening).
 */
export async function contextVoorKans(env, leadId, { taal: taalKeuze = null } = {}) {
  const [lead] = (await searchRead(env, {
    model: 'crm.lead', domain: [['id', '=', leadId]], context: { active_test: false },
    fields: ['id', 'name', 'partner_id', 'contact_name', 'partner_name', 'email_from', 'user_id',
      'x_studio_brand_origin', 'x_studio_lead_channel', 'tag_ids'],
  })) || [];
  if (!lead) throw new OpvolgingError(`Kans ${leadId} niet gevonden in Odoo.`, 404);

  const partnerId = m2o(lead.partner_id);
  const pakVeld = await heeftVelden(env, 'res.partner', ['x_syndicoach_pack']);
  let partner = null;
  let gebouw = null;
  if (partnerId) {
    const velden = ['id', 'name', 'email', 'lang', 'is_company', 'commercial_partner_id', 'x_studio_first_name'];
    [partner] = (await searchRead(env, { model: 'res.partner', domain: [['id', '=', partnerId]], fields: velden, context: { active_test: false } })) || [];
    const gebouwId = partner ? (partner.is_company ? partner.id : m2o(partner.commercial_partner_id)) : null;
    if (gebouwId && (gebouwId !== partner.id || partner.is_company)) {
      [gebouw] = (await searchRead(env, {
        model: 'res.partner', domain: [['id', '=', gebouwId]], context: { active_test: false },
        fields: ['id', 'name', ...(pakVeld ? ['x_syndicoach_pack'] : [])],
      })) || [];
    }
  }

  const [offerte] = (await searchRead(env, {
    model: 'sale.order', domain: [['opportunity_id', '=', leadId], ['state', '!=', 'cancel']],
    fields: ['name', 'amount_total', 'date_order'], order: 'create_date desc', limit: 1,
  })) || [];

  // Een offerte van Syndicoach is geen offerte in Odoo maar een pdf van de OM
  // (pdf-stap van de koppeling "Calculator Offerte"), als bijlage bij de mail
  // aan de contactpersoon. Daar is enkel de DATUM van te kennen; nummer en
  // bedrag blijven dan leeg (het voorbeeld zegt dat).
  let offertePdf = null;
  if (!offerte) {
    const hangtAan = [['res_model', '=', 'crm.lead'], ['res_id', '=', leadId]];
    const partnerIds = [partnerId, gebouw && gebouw.id].filter(Boolean);
    const domein = partnerIds.length
      ? ['&', ['name', '=ilike', 'offerte%.pdf'], '|', '&', ...hangtAan, '&', ['res_model', '=', 'res.partner'], ['res_id', 'in', partnerIds]]
      : ['&', ['name', '=ilike', 'offerte%.pdf'], '&', ...hangtAan];
    [offertePdf] = (await searchRead(env, {
      model: 'ir.attachment', domain: domein, fields: ['name', 'create_date'], order: 'create_date desc', limit: 1,
    }).catch(() => [])) || [];
  }

  const isPersoon = partner && !partner.is_company;
  const contactNaam = String((isPersoon ? partner.name : lead.contact_name) || lead.contact_name || '').trim();
  const contactVoornaam = String((isPersoon && partner.x_studio_first_name) || '').trim() || voornaamVan(contactNaam);

  const verkoperId = m2o(lead.user_id);
  const profiel = verkoperId ? await medewerkerVoorOdooGebruiker(env, verkoperId).catch(() => null) : null;
  const verkoperNaam = String((profiel && profiel.naam) || (Array.isArray(lead.user_id) ? lead.user_id[1] : '') || '').trim();
  const verkoper = {
    name: verkoperNaam,
    first_name: String((profiel && profiel.voornaam) || voornaamVan(verkoperNaam) || '').trim(),
    email: String((profiel && profiel.email) || '').trim(),
    job_title: String((profiel && profiel.functie) || '').trim(),
  };

  const pakket = gebouw && gebouw.x_syndicoach_pack ? (PAKKETTEN[gebouw.x_syndicoach_pack] || String(gebouw.x_syndicoach_pack)) : '';

  // Merk: dezelfde regel als de dashboards (lead-rules.js), met de labels van de kans.
  const tagIds = Array.isArray(lead.tag_ids) ? lead.tag_ids : [];
  const tags = tagIds.length ? ((await searchRead(env, { model: 'crm.tag', domain: [['id', 'in', tagIds]], fields: ['name'] }).catch(() => [])) || []) : [];
  const merk = leadMerk({ name: lead.name, brand_origin: lead.x_studio_brand_origin || null, lead_channel: lead.x_studio_lead_channel || null },
    tags.map((x) => String(x.name || '').toLowerCase()));
  const taal = taalVanPartner(partner && partner.lang);
  const datumTaal = taalKeuze || taal;

  return {
    leadNaam: lead.name || '',
    verkoperId,
    merk,
    taal,
    aan: String((isPersoon && partner.email) || lead.email_from || '').trim(),
    context: {
      contact: { name: contactNaam, first_name: contactVoornaam, email: String((isPersoon && partner.email) || lead.email_from || '').trim() },
      gebouw: { naam: String((gebouw && gebouw.name) || lead.partner_name || '').trim(), pakket },
      offerte: offerte
        ? { nummer: offerte.name || '', bedrag: euro(offerte.amount_total), datum: datumLang(offerte.date_order, datumTaal) }
        : { nummer: '', bedrag: '', datum: offertePdf ? datumLang(offertePdf.create_date, datumTaal) : '' },
      verkoper,
      sender: verkoper,
    },
  };
}

function voorbeeldContext() {
  const ctx = {};
  for (const t of TOKENS) {
    const delen = t.pad.split('.');
    let o = ctx;
    delen.slice(0, -1).forEach((d) => { o = o[d] = o[d] || {}; });
    o[delen[delen.length - 1]] = t.voorbeeld;
  }
  ctx.sender = ctx.verkoper;
  return ctx;
}

/** De afspraaklinks van de verkoper die in de tekst staan, genest in de context. */
async function vulAfspraak(env, context, tekstMetLinks, userId) {
  const plat = await resolveSenderAfspraak(env, { tekst: tekstMetLinks, userId });
  context.afspraak = context.afspraak || {};
  for (const [sleutel, url] of Object.entries(plat)) {
    const [, stap, soort] = sleutel.split('.');
    context.afspraak[stap] = context.afspraak[stap] || {};
    context.afspraak[stap][soort] = url;
  }
}

/**
 * Het voorbeeld: onderwerp + HTML zoals de klant het zou krijgen, met de
 * handtekening van de verkoper eronder. Zonder kans: met voorbeeldwaarden en
 * zonder handtekening.
 */
export async function voorbeeldBericht(env, { onderwerp, tekst_html, leadId, taal = null }) {
  const ruw = `${onderwerp || ''}\n${tekst_html || ''}`;
  let context;
  let leadNaam = '';
  let handtekening = '';
  let melding = '';
  const ontbreekt = [];

  if (leadId) {
    const kans = await contextVoorKans(env, leadId, { taal });
    context = kans.context;
    leadNaam = kans.leadNaam;
    await vulAfspraak(env, context, ruw, kans.verkoperId);
    if (kans.verkoperId) {
      const [u] = (await searchRead(env, { model: 'res.users', domain: [['id', '=', kans.verkoperId]], fields: ['signature'] })) || [];
      handtekening = String((u && u.signature) || '').trim();
      if (!handtekening.replace(/<[^>]*>/g, '').trim()) {
        handtekening = '';
        melding = 'De verkoper heeft nog geen handtekening (signature-designer): die komt er bij het versturen niet onder.';
      }
    } else {
      melding = 'Deze kans heeft geen verkoper: geen afzender en geen handtekening.';
    }
    // Welke gebruikte placeholders blijven leeg voor deze kans?
    for (const t of TOKENS) {
      if (!ruw.includes('{{' + t.pad + '}}')) continue;
      const waarde = t.pad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), context);
      if (waarde == null || String(waarde).trim() === '') ontbreekt.push(t.label);
    }
  } else {
    context = voorbeeldContext();
  }

  const body = renderPlainMailHtml({ html: tekst_html, context });
  return {
    onderwerp: renderPlainSubject(onderwerp, context),
    html: body + (handtekening ? '<br><br>' + handtekening : ''),
    kans: leadId ? { id: leadId, naam: leadNaam } : null,
    ontbreekt,
    melding,
  };
}

// ─── Versturen vanuit de kans ────────────────────────────────────────────────
//
// De verkoper kiest in Mijn taken een bericht voor een kans, leest het ingevuld
// na, past het eventueel aan, en verstuurt. De mail vertrekt op naam en adres
// van de VERKOPER van de kans (op het domein van het merk, zoals de mailstap van
// de koppelingen), met zijn handtekening, en staat in de chatter van de kans
// met de verkoper als auteur. Zo leest het controlepaneel ze als MANUEEL
// (message_type comment, subtype Discussions); een automatische mail van de
// sequentie krijgt later een message_id op @om.mymmo.com.
//
// Elke verzending heeft een SLEUTEL die het venster een keer maakt: twee keer
// op Versturen klikken geeft geen tweede mail (message_id op die sleutel).

const BERICHT_DOMEIN = 'opvolging.mymmo.com';

async function afzenderVoor(env, kans) {
  if (!kans.verkoperId) throw new OpvolgingError('Deze kans heeft geen verkoper: er is niemand om de mail van te sturen.', 400);
  const [u] = (await searchRead(env, { model: 'res.users', domain: [['id', '=', kans.verkoperId]], fields: ['name', 'email', 'partner_id', 'signature'] })) || [];
  if (!u || !lijktOpEmail(u.email)) throw new OpvolgingError('De verkoper van deze kans heeft geen e-mailadres in Odoo.', 400);
  const email = opAfzenderdomein(String(u.email).trim(), MERK_DOMEIN[kans.merk]);
  const voornaam = kans.context.verkoper.first_name || voornaamVan(u.name);
  const naam = (voornaam + (MERK_NAAM[kans.merk] ? ' van ' + MERK_NAAM[kans.merk] : '')).replace(/"/g, '');
  const handtekening = heeftTekst(u.signature) ? String(u.signature) : '';
  return { email, naam, van: `"${naam}" <${email}>`, partnerId: m2o(u.partner_id), handtekening };
}

/** De berichten die bij deze kans passen (merk), voor het venster in Mijn taken. */
export async function berichtenVoorKans(env, leadId) {
  const [kans, berichten, groepen] = await Promise.all([contextVoorKans(env, leadId), lijstBerichten(env), lijstGroepen(env)]);
  const groepNaam = new Map(groepen.map((g) => [g.id, g.naam]));
  const volgorde = new Map(groepen.map((g, i) => [g.id, i]));
  const lijst = berichten
    .filter((b) => b.actief && (b.merk === 'alle' || b.merk === kans.merk))
    .map((b) => ({ id: b.id, naam: b.naam, groep: groepNaam.get(b.groep_id) || '', talen: talenVan(b), v: volgorde.has(b.groep_id) ? volgorde.get(b.groep_id) : 999 }))
    .sort((a, b) => a.v - b.v || a.naam.localeCompare(b.naam))
    .map((b) => ({ id: b.id, naam: b.naam, groep: b.groep, talen: b.talen }));
  let van = '';
  let probleem = '';
  try { van = (await afzenderVoor(env, kans)).van; } catch (err) { probleem = err.message; }
  if (!probleem && !lijktOpEmail(kans.aan)) probleem = 'De contactpersoon van deze kans heeft geen e-mailadres.';
  return { merk: kans.merk, merk_naam: MERK_NAAM[kans.merk] || kans.merk, taal: kans.taal, talen: TALEN, aan: kans.aan, van, probleem, berichten: lijst };
}

/**
 * Een bericht ingevuld voor een kans: onderwerp en tekst met de gegevens van de
 * kans (de verkoper kan ze nog aanpassen), de handtekening apart.
 */
export async function berichtIngevuld(env, { leadId, berichtId, taal = null }) {
  const bericht = await leesBericht(env, berichtId);
  const kans0 = await contextVoorKans(env, leadId);
  const talen = talenVan(bericht);
  let gekozen = taal && talen.includes(taal) ? taal : kans0.taal;
  let melding = '';
  if (!talen.includes(gekozen)) {
    const terug = talen.includes(STANDAARD_TAAL) ? STANDAARD_TAAL : talen[0];
    if (terug) melding = `Dit bericht bestaat nog niet in het ${TALEN[gekozen].toLowerCase()}; je ziet de versie in het ${TALEN[terug].toLowerCase()}.`;
    gekozen = terug;
  }
  if (!gekozen) throw new OpvolgingError('Dit bericht heeft nog geen onderwerp of tekst.', 400);
  const kans = gekozen === kans0.taal ? kans0 : await contextVoorKans(env, leadId, { taal: gekozen });
  const versie = versieVoor(bericht, gekozen);
  const ruw = `${versie.onderwerp}\n${versie.tekst_html}`;
  await vulAfspraak(env, kans.context, ruw, kans.verkoperId);
  const ontbreekt = TOKENS.filter((x) => ruw.includes('{{' + x.pad + '}}'))
    .filter((x) => { const w = x.pad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), kans.context); return w == null || String(w).trim() === ''; })
    .map((x) => x.label);
  let afzender = null;
  try { afzender = await afzenderVoor(env, kans); } catch (_) { /* de reden staat al in berichtenVoorKans */ }
  return {
    taal: gekozen,
    talen,
    onderwerp: renderPlainSubject(versie.onderwerp, kans.context),
    tekst_html: fillPlaceholders(versie.tekst_html, kans.context),
    handtekening: afzender ? afzender.handtekening : '',
    melding: [melding, afzender && !afzender.handtekening ? 'De verkoper heeft nog geen handtekening: de mail vertrekt zonder.' : ''].filter(Boolean).join(' '),
    ontbreekt,
  };
}

/** Het bericht versturen, zoals de verkoper het in het venster nalas. */
export async function verstuurBericht(env, { leadId, berichtId, onderwerp, tekst_html, sleutel }) {
  if (!/^[a-z0-9-]{8,64}$/i.test(String(sleutel || ''))) throw new OpvolgingError('Ongeldige verzending.', 400);
  const kans = await contextVoorKans(env, leadId);
  const afzender = await afzenderVoor(env, kans);
  if (!lijktOpEmail(kans.aan)) throw new OpvolgingError('De contactpersoon van deze kans heeft geen e-mailadres.', 400);
  if (await isBlacklisted(env, kans.aan)) throw new OpvolgingError(`${kans.aan} wil geen mails meer krijgen (blacklist in Odoo).`, 400);

  const messageId = `<opv${leadId}-${String(sleutel).toLowerCase()}@${BERICHT_DOMEIN}>`;
  const [bestaand] = (await searchRead(env, { model: 'mail.mail', domain: [['message_id', '=', messageId]], fields: ['id'], limit: 1 })) || [];
  if (bestaand) return { mail_id: bestaand.id, aan: kans.aan, van: afzender.van, al_verstuurd: true };

  const ruwOnderwerp = tekst(onderwerp, 200);
  const ruweTekst = String(tekst_html || '').slice(0, 50000);
  controleerOpmaak(ruweTekst);
  await vulAfspraak(env, kans.context, `${ruwOnderwerp}\n${ruweTekst}`, kans.verkoperId);
  const subject = renderPlainSubject(ruwOnderwerp, kans.context);
  const body = renderPlainMailHtml({ html: ruweTekst, context: kans.context });
  if (!subject) throw new OpvolgingError('Het onderwerp is leeg.', 400);
  if (!body) throw new OpvolgingError('De tekst is leeg.', 400);
  if (berichtId) await leesBericht(env, berichtId); // bestaat het nog?

  const values = {
    subject,
    body_html: body + (afzender.handtekening ? '<br><br>' + afzender.handtekening : ''),
    email_to: kans.aan,
    email_from: afzender.van,
    reply_to: afzender.email,
    message_id: messageId,
    auto_delete: false,
    state: 'outgoing',
    model: 'crm.lead',
    res_id: leadId,
    message_type: 'comment',
    subtype_id: 1,
    mail_server_id: Number(env.OPVOLGING_MAIL_SERVER_ID || 5),
  };
  if (afzender.partnerId) values.author_id = afzender.partnerId;
  const mailId = await create(env, { model: 'mail.mail', values });
  try { await werkPaneelBij(env, leadId); } catch (_) { /* het paneel volgt in de cron */ }
  return { mail_id: mailId, aan: kans.aan, van: afzender.van, al_verstuurd: false };
}
