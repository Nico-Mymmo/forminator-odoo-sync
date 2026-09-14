/**
 * Gmail → Chatter — API.
 *
 * Alles wat hier binnenkomt wordt SERVER-SIDE afgebakend tot de mailbox van de
 * ingelogde gebruiker. De client stuurt nooit een `user_email` mee; die wordt
 * uit de sessie genomen. Een admin kan met `?all=1` over alle mailboxen kijken
 * en dat is de enige uitzondering.
 *
 * DRIE LAGEN, EN DIT BESTAAT VOOR DE DERDE.
 *   1. Automatisch — adres staat op een lead, mail komt er vanzelf bij.
 *   2. Uitzondering — iemand legt vast dat mail van dít adres bij dié lead
 *      hoort. Dat gebeurt bij voorkeur in Gmail zelf; deze routes zijn de
 *      opslag waar zowel de Gmail-add-on als dit scherm naartoe schrijven.
 *   3. Beheer — de uitzonderingen nakijken en bijstellen.
 *
 * EEN KOPPELING IS GLOBAAL, HET TERUGPLAATSEN NIET. "Mail van george@x.be hoort
 * bij lead 42" is een feit over die persoon, dus het geldt voor iedereen en
 * voor alle toekomstige mail. Maar het ALSNOG plaatsen van al bewaarde mail
 * gebeurt alleen voor je eigen mailbox: daarvoor moet de inhoud bij Gmail
 * opgehaald worden, en dat doen we niet in andermans postbus op vraag van een
 * collega. Een admin kan dat wel.
 *
 * WAAROM DE BODY PAS BIJ HET PLAATSEN WORDT OPGEHAALD. Van een niet-geplaatste
 * mail bewaren we alleen headers. Wordt hij geplaatst, dan halen we op dat
 * moment de inhoud bij Gmail, kuisen we de geciteerde staart eruit en zetten we
 * hem in de chatter. Zo staat de inhoud van mail die nergens bij hoort nooit in
 * onze database — ook niet tijdelijk.
 */

import { getSupabaseClient } from '../../lib/database.js';
import { searchRead } from '../../lib/odoo.js';
import { getMessageFull, extractBody } from './lib/gmail-read-client.js';
import { stripQuotedHtml, stripQuotedText, textToHtml } from './lib/quote-strip.js';
import { postNaarChatter, odooDatum } from './lib/sync.js';
import {
  getSyncState, listContactLinks, upsertContactLink, deleteContactLink,
  openstaandVoorContact, werklijstPerContact
} from './lib/store.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

/** `null` betekent "alle mailboxen" en kan alleen een admin krijgen. */
function bereik(user, url) {
  const wilAlles = url.searchParams.get('all') === '1';
  if (wilAlles && user?.role === 'admin') return null;
  return String(user?.email || '').toLowerCase();
}

/** Een rij ophalen én meteen controleren of ze van deze gebruiker is. */
async function haalEigenRij(env, user, gmailMessageId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('gmail_captured_messages')
    .select('*')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { fout: json({ success: false, error: 'Bericht niet gevonden' }, 404) };

  const eigen = String(data.user_email || '').toLowerCase() === String(user?.email || '').toLowerCase();
  if (!eigen && user?.role !== 'admin') {
    // Bewust 404 en geen 403: dat een bericht bestaat is zelf informatie.
    return { fout: json({ success: false, error: 'Bericht niet gevonden' }, 404) };
  }
  return { rij: data };
}

/** Bestaat deze lead? Geeft de naam terug, of null. */
async function haalLead(env, leadId) {
  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain: [['id', '=', leadId]],
    fields: ['id', 'name'],
    limit: 1,
    context: { active_test: false }
  });
  return leads[0] || null;
}

/**
 * Eén bewaard bericht alsnog in de chatter zetten.
 *
 * Haalt de inhoud bij Gmail, kuist de geciteerde staart eruit en werkt de rij
 * bij. Gooit niet: het resultaat zegt wat er gebeurd is, zodat een reeks
 * berichten niet stilvalt op één probleemgeval.
 */
async function plaatsBewaardBericht(env, rij, leadId) {
  try {
    const vol = await getMessageFull(env, rij.user_email, rij.gmail_message_id);
    const { html, text } = extractBody(vol);
    const schoon = html ? await stripQuotedHtml(html) : textToHtml(stripQuotedText(text || ''));

    if (!schoon || !schoon.trim()) {
      return { ok: false, reden: 'geen tekst om te plaatsen' };
    }

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

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/gmail-chatter.html', context.request.url))),

  /** Kop van het scherm: wie ben ik, staat de sync aan, wanneer draaide ze. */
  'GET /api/overview': async ({ env, user }) => {
    const email = String(user?.email || '').toLowerCase();
    const supabase = getSupabaseClient(env);

    const stand = await getSyncState(env, email).catch(() => null);

    const { data: rijen, error } = await supabase
      .from('gmail_captured_messages')
      .select('status')
      .eq('user_email', email);
    if (error) return json({ success: false, error: error.message }, 500);

    const tellingen = { posted: 0, unmatched: 0, skipped: 0, failed: 0 };
    for (const r of rijen || []) tellingen[r.status] = (tellingen[r.status] || 0) + 1;

    const meedraaiend = String(env.GMAIL_CHATTER_USERS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    return json({
      success: true,
      data: {
        email,
        isAdmin: user?.role === 'admin',
        actief: meedraaiend.includes(email),
        sync: stand ? {
          laatst: stand.last_synced_at,
          fout: stand.last_error,
          bekeken: stand.messages_seen
        } : null,
        tellingen
      }
    });
  },

  /**
   * De werklijst, GEGROEPEERD PER CONTACT.
   *
   * Per mail beslissen betekent dat je bij elke nieuwe mail van dezelfde
   * persoon opnieuw hetzelfde doet. Per contact beslis je één keer.
   */
  'GET /api/contacts': async ({ env, request, user }) => {
    const url = new URL(request.url);
    try {
      const groepen = await werklijstPerContact(env, bereik(user, url));
      return json({ success: true, data: groepen });
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }
  },

  /** De losse berichten, voor wie wil zien wat er precies onder een contact zit. */
  'GET /api/messages': async ({ env, request, user }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'unmatched';
    const contact = String(url.searchParams.get('contact') || '').trim().toLowerCase();
    const limit = Math.min(200, Number(url.searchParams.get('limit')) || 100);
    const email = bereik(user, url);

    const supabase = getSupabaseClient(env);
    let q = supabase
      .from('gmail_captured_messages')
      .select('gmail_message_id, user_email, direction, counterpart_email, subject, internal_date, status, skip_reason, odoo_model, odoo_res_id, match_method, error_message')
      .order('internal_date', { ascending: false })
      .limit(limit);

    q = status === 'werklijst' ? q.in('status', ['unmatched', 'failed']) : q.eq('status', status);
    if (email) q = q.eq('user_email', email);
    if (contact) q = q.eq('counterpart_email', contact);

    const { data, error } = await q;
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: true, data });
  },

  /** De vastgelegde uitzonderingen. */
  'GET /api/links': async ({ env }) => {
    try {
      return json({ success: true, data: await listContactLinks(env) });
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }
  },

  /** Leads zoeken voor de kiezer. Op naam, contactnaam of e-mailadres. */
  'GET /api/leads': async ({ env, request }) => {
    const url = new URL(request.url);
    const term = String(url.searchParams.get('q') || '').trim();
    if (term.length < 2) return json({ success: true, data: [] });

    const domain = ['|', '|',
      ['name', 'ilike', term],
      ['contact_name', 'ilike', term],
      ['email_from', 'ilike', term]
    ];
    const leads = await searchRead(env, {
      model: 'crm.lead',
      domain,
      fields: ['id', 'name', 'contact_name', 'email_from', 'stage_id'],
      order: 'write_date desc',
      limit: 20,
      context: { active_test: false }
    });
    return json({ success: true, data: leads });
  },

  /**
   * Een CONTACT aan een lead hangen.
   *
   * Legt de uitzondering vast (geldt vanaf nu voor iedereen) en plaatst meteen
   * de openstaande mail van dit contact uit JOUW mailbox. Mail van collega's
   * blijft in hun eigen werklijst staan — daarvoor zouden we hun postbus moeten
   * openen op jouw vraag, en dat doen we niet.
   */
  'POST /api/contacts/:email/link': async ({ env, request, user, params }) => {
    const contact = String(params.email || '').trim().toLowerCase();
    if (!contact.includes('@')) return json({ success: false, error: 'Ongeldig adres' }, 400);

    let body;
    try { body = await request.json(); } catch { return json({ success: false, error: 'Ongeldige body' }, 400); }
    const leadId = Number(body?.lead_id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return json({ success: false, error: 'lead_id ontbreekt' }, 400);
    }

    const lead = await haalLead(env, leadId);
    if (!lead) return json({ success: false, error: 'Lead bestaat niet' }, 404);

    try {
      await upsertContactLink(env, {
        email: contact,
        action: 'lead',
        odooModel: 'crm.lead',
        odooResId: leadId,
        createdBy: user?.email || null,
        source: body?.source === 'gmail-addon' ? 'gmail-addon' : 'om'
      });
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }

    // Openstaande mail alsnog plaatsen — alleen uit je eigen mailbox.
    const openstaand = await openstaandVoorContact(env, contact, 50);
    const vanMij = user?.role === 'admin'
      ? openstaand
      : openstaand.filter(r => String(r.user_email).toLowerCase() === String(user?.email).toLowerCase());

    let geplaatst = 0;
    const mislukt = [];
    for (const rij of vanMij) {
      const res = await plaatsBewaardBericht(env, rij, leadId);
      if (res.ok) geplaatst++; else mislukt.push(res.reden);
    }

    return json({
      success: true,
      data: {
        lead_id: leadId,
        lead: lead.name,
        geplaatst,
        mislukt: mislukt.length,
        vanCollega: openstaand.length - vanMij.length
      }
    });
  },

  /** Een contact voorgoed negeren. Dit is wat de werklijst kort houdt. */
  'POST /api/contacts/:email/ignore': async ({ env, user, params }) => {
    const contact = String(params.email || '').trim().toLowerCase();
    if (!contact.includes('@')) return json({ success: false, error: 'Ongeldig adres' }, 400);

    try {
      await upsertContactLink(env, {
        email: contact,
        action: 'ignore',
        createdBy: user?.email || null,
        source: 'om'
      });
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }

    // Wat er al van dit contact in de werklijst stond, hoeft er niet te blijven.
    const supabase = getSupabaseClient(env);
    const email = bereik(user, new URL('http://x/'));
    let q = supabase
      .from('gmail_captured_messages')
      .update({ status: 'skipped', skip_reason: 'contact genegeerd' })
      .eq('counterpart_email', contact)
      .in('status', ['unmatched', 'failed']);
    if (email) q = q.eq('user_email', email);
    const { error } = await q;
    if (error) return json({ success: false, error: error.message }, 500);

    return json({ success: true });
  },

  /** Een uitzondering ongedaan maken. */
  'DELETE /api/links/:email': async ({ env, params }) => {
    try {
      await deleteContactLink(env, params.email);
      return json({ success: true });
    } catch (e) {
      return json({ success: false, error: e.message }, 500);
    }
  },

  /** Eén los bericht toewijzen — als uitzondering op de uitzondering. */
  'POST /api/messages/:id/assign': async ({ env, request, user, params }) => {
    const { rij, fout } = await haalEigenRij(env, user, params.id);
    if (fout) return fout;

    let body;
    try { body = await request.json(); } catch { return json({ success: false, error: 'Ongeldige body' }, 400); }
    const leadId = Number(body?.lead_id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return json({ success: false, error: 'lead_id ontbreekt' }, 400);
    }

    const lead = await haalLead(env, leadId);
    if (!lead) return json({ success: false, error: 'Lead bestaat niet' }, 404);

    const res = await plaatsBewaardBericht(env, rij, leadId);
    if (!res.ok) return json({ success: false, error: res.reden }, 502);

    return json({ success: true, data: { lead_id: leadId, lead: lead.name } });
  },

  /** Eén los bericht wegleggen, zonder het hele contact te negeren. */
  'POST /api/messages/:id/dismiss': async ({ env, user, params }) => {
    const { rij, fout } = await haalEigenRij(env, user, params.id);
    if (fout) return fout;

    const supabase = getSupabaseClient(env);
    const { error } = await supabase
      .from('gmail_captured_messages')
      .update({ status: 'skipped', skip_reason: 'handmatig weggelegd', error_message: null })
      .eq('gmail_message_id', rij.gmail_message_id);
    if (error) return json({ success: false, error: error.message }, 500);

    return json({ success: true });
  }
};
