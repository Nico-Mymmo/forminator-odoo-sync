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

import { searchRead } from '../../../lib/odoo.js';
import { getCoreDb } from '../../../lib/core-db.js';
import { medewerkerVoorOdooGebruiker, voornaamVan } from '../../../lib/medewerkers.js';
import { renderPlainMailHtml, renderPlainSubject, nietPlatteOpmaak } from '../../../lib/mail/render-plain.js';
import { resolveSenderAfspraak } from '../../forminator-sync-v2/mail-step.js';
import { heeftVelden } from './odoo-data.js';
import { OpvolgingError } from './constants.js';

const TABEL = 'opv_berichten';
// De groepen staan in een eigen lijst (zoals de mappen in Koppelingen), in de
// linkerkolom van het tabblad Berichten. groep_id leeg = "Zonder groep".
const GROEPEN_TABEL = 'opv_bericht_groepen';
export const MERKEN = { alle: 'Alle merken', syndicoach: 'Syndicoach', openvme: 'OpenVME' };
export const TALEN = { nl: 'Nederlands', fr: 'Frans' };

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
  const taal = Object.prototype.hasOwnProperty.call(TALEN, invoer.taal) ? invoer.taal : 'nl';
  const onderwerp = tekst(invoer.onderwerp, 200).replace(/\s+/g, ' ');
  const tekstHtml = String(invoer.tekst_html ?? '').slice(0, 50000);
  const verboden = nietPlatteOpmaak(tekstHtml);
  if (verboden.length) {
    throw new OpvolgingError(`Dit is een gewone mail: haal ${verboden.map((t) => '<' + t + '>').join(', ')} uit de tekst.`, 400);
  }
  const actief = invoer.actief === true || invoer.actief === 1 || invoer.actief === 'true';
  if (actief && (!onderwerp || !tekstHtml.replace(/<[^>]*>/g, '').trim())) {
    throw new OpvolgingError('Een bericht dat aan staat, heeft een onderwerp en een tekst nodig.', 400);
  }
  const volgorde = Number.isInteger(Number(invoer.volgorde)) ? Number(invoer.volgorde) : 0;
  // `groep` (de naam als tekst, migratie 0022) is verplicht in de tabel maar
  // wordt niet meer gelezen: de groep is groep_id.
  return { naam, groep: '', groep_id: groepId, merk, taal, onderwerp, tekst_html: tekstHtml, actief, volgorde };
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
function datumLang(odooDatum) {
  if (!odooDatum) return '';
  const d = new Date(String(odooDatum).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/**
 * De placeholdercontext van een kans. Ontbreekt iets (geen offerte, geen
 * gebouw), dan is die placeholder leeg: dat ziet de verkoper in het voorbeeld.
 * Geeft ook het Odoo-gebruikers-id van de verkoper terug (voor de handtekening).
 */
export async function contextVoorKans(env, leadId) {
  const [lead] = (await searchRead(env, {
    model: 'crm.lead', domain: [['id', '=', leadId]], context: { active_test: false },
    fields: ['id', 'name', 'partner_id', 'contact_name', 'partner_name', 'email_from', 'user_id'],
  })) || [];
  if (!lead) throw new OpvolgingError(`Kans ${leadId} niet gevonden in Odoo.`, 404);

  const partnerId = m2o(lead.partner_id);
  const pakVeld = await heeftVelden(env, 'res.partner', ['x_syndicoach_pack']);
  let partner = null;
  let gebouw = null;
  if (partnerId) {
    const velden = ['id', 'name', 'email', 'is_company', 'commercial_partner_id', 'x_studio_first_name'];
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
  return {
    leadNaam: lead.name || '',
    verkoperId,
    context: {
      contact: { name: contactNaam, first_name: contactVoornaam, email: String((isPersoon && partner.email) || lead.email_from || '').trim() },
      gebouw: { naam: String((gebouw && gebouw.name) || lead.partner_name || '').trim(), pakket },
      offerte: offerte
        ? { nummer: offerte.name || '', bedrag: euro(offerte.amount_total), datum: datumLang(offerte.date_order) }
        : { nummer: '', bedrag: '', datum: offertePdf ? datumLang(offertePdf.create_date) : '' },
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
export async function voorbeeldBericht(env, { onderwerp, tekst_html, leadId }) {
  const ruw = `${onderwerp || ''}\n${tekst_html || ''}`;
  let context;
  let leadNaam = '';
  let handtekening = '';
  let melding = '';
  const ontbreekt = [];

  if (leadId) {
    const kans = await contextVoorKans(env, leadId);
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
