/**
 * Gmail → chatter — een contact aan een lead hangen.
 *
 * WAAROM DIT EEN APART BESTAND IS. Twee plekken doen exact hetzelfde: het
 * beheerscherm in de OM en de Gmail-add-on. Zouden die elk hun eigen versie
 * hebben, dan lopen ze onvermijdelijk uit elkaar — de ene plaatst oude mail wel
 * terug, de andere niet, en dat merk je pas als iemand klaagt dat "het via
 * Gmail anders werkt". Eén implementatie, twee aanroepers.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { searchRead } from '../../../lib/odoo.js';
import { getMessageFull, extractBody } from './gmail-read-client.js';
import { stripQuotedHtml, stripQuotedText, textToHtml } from './quote-strip.js';
import { postNaarChatter, odooDatum } from './sync.js';
import { upsertContactLink, openstaandVoorContact } from './store.js';

/** Hoeveel al bewaarde berichten er maximaal alsnog geplaatst worden. */
export const TERUGPLAATS_PLAFOND = 50;

/** Bestaat deze lead? Geeft `{id, name}` of null. */
export async function haalLead(env, leadId) {
  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain: [['id', '=', Number(leadId)]],
    fields: ['id', 'name'],
    limit: 1,
    context: { active_test: false }
  });
  return leads[0] || null;
}

/**
 * Eén bewaard bericht alsnog in de chatter zetten.
 *
 * Gooit niet: het resultaat zegt wat er gebeurd is, zodat een reeks berichten
 * niet stilvalt op één probleemgeval.
 */
export async function plaatsBewaardBericht(env, rij, leadId) {
  try {
    const vol = await getMessageFull(env, rij.user_email, rij.gmail_message_id);
    const { html, text } = extractBody(vol);
    const schoon = html ? await stripQuotedHtml(html) : textToHtml(stripQuotedText(text || ''));

    if (!schoon || !schoon.trim()) return { ok: false, reden: 'geen tekst om te plaatsen' };

    const res = await postNaarChatter(env, {
      model: 'crm.lead',
      res_id: leadId,
      html: schoon,
      subject: rij.subject,
      emailFrom: rij.direction === 'incoming' ? rij.counterpart_email : rij.user_email,
      datum: vol.internalDate ? odooDatum(vol.internalDate) : null
    });

    const supabase = getSupabaseClient(env);
    await supabase
      .from('gmail_captured_messages')
      .update({
        status: 'posted',
        odoo_model: 'crm.lead',
        odoo_res_id: leadId,
        odoo_message_id: typeof res === 'number' ? res : null,
        match_method: 'handmatig',
        error_message: null
      })
      .eq('gmail_message_id', rij.gmail_message_id);

    return { ok: true };
  } catch (err) {
    return { ok: false, reden: String(err?.message || err).slice(0, 200) };
  }
}

/**
 * Een contact aan een lead hangen.
 *
 * De KOPPELING is globaal — "mail van dit adres hoort bij deze lead" is een
 * feit over die persoon, dus het geldt voor iedereen en voor alle toekomstige
 * mail. Het TERUGPLAATSEN van al bewaarde mail is dat niet: daarvoor moet de
 * inhoud bij Gmail opgehaald worden, en dat doen we niet in andermans postbus
 * op vraag van een collega. Een admin mag dat wel.
 *
 * @returns {Promise<{ok: boolean, error?: string, data?: Object}>}
 */
export async function koppelContact(env, { contact, leadId, actorEmail, isAdmin = false, source = 'om' }) {
  const email = String(contact || '').trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, error: 'Ongeldig adres' };

  const id = Number(leadId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'lead_id ontbreekt' };

  const lead = await haalLead(env, id);
  if (!lead) return { ok: false, error: 'Lead bestaat niet' };

  await upsertContactLink(env, {
    email,
    action: 'lead',
    odooModel: 'crm.lead',
    odooResId: id,
    createdBy: actorEmail || null,
    source
  });

  const openstaand = await openstaandVoorContact(env, email, TERUGPLAATS_PLAFOND);
  const vanMij = isAdmin
    ? openstaand
    : openstaand.filter(r => String(r.user_email).toLowerCase() === String(actorEmail || '').toLowerCase());

  let geplaatst = 0;
  let mislukt = 0;
  for (const rij of vanMij) {
    const res = await plaatsBewaardBericht(env, rij, id);
    if (res.ok) geplaatst++; else mislukt++;
  }

  return {
    ok: true,
    data: {
      lead_id: id,
      lead: lead.name,
      geplaatst,
      mislukt,
      vanCollega: openstaand.length - vanMij.length
    }
  };
}

/**
 * Een contact voorgoed negeren.
 *
 * Dit is wat de werklijst kort houdt: zonder deze mogelijkheid duikt een
 * leverancier die nooit een klant wordt bij elke nieuwe mail opnieuw op.
 */
export async function negeerContact(env, { contact, actorEmail, isAdmin = false, source = 'om' }) {
  const email = String(contact || '').trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, error: 'Ongeldig adres' };

  await upsertContactLink(env, {
    email,
    action: 'ignore',
    createdBy: actorEmail || null,
    source
  });

  // Wat er al van dit contact in de werklijst stond, hoeft er niet te blijven.
  const supabase = getSupabaseClient(env);
  let q = supabase
    .from('gmail_captured_messages')
    .update({ status: 'skipped', skip_reason: 'contact genegeerd' })
    .eq('counterpart_email', email)
    .in('status', ['unmatched', 'failed']);
  if (!isAdmin) q = q.eq('user_email', String(actorEmail || '').toLowerCase());

  const { error } = await q;
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { contact: email } };
}
