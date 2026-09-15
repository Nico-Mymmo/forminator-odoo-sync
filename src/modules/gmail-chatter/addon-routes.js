/**
 * Gmail-add-on — de endpoints die de add-on aanspreekt.
 *
 * Deze routes staan BUITEN de gewone auth-gate (zie src/router/public-routes.js)
 * omdat de add-on in Gmail draait en geen sessiecookie heeft. "Publiek" is hier
 * dus geen synoniem voor "open": elke route eist een door Google ondertekend
 * ID-token dat naar een actieve OM-gebruiker herleid wordt (lib/addon-auth.js).
 *
 * DE ADD-ON DOET ZELF NIETS AAN ODOO OF SUPABASE. Hij stuurt alleen "dit adres
 * hoort bij die lead" en krijgt terug wat de stand van zaken is. Alle logica
 * zit in lib/linking.js, gedeeld met het beheerscherm — zodat de twee niet uit
 * elkaar kunnen lopen.
 */

import { authenticeerAddon } from './lib/addon-auth.js';
import { koppelContact, negeerContact } from './lib/linking.js';
import { getContactLink } from './lib/store.js';
import { zoekLeadOpAdres } from './lib/matching.js';
import { searchRead } from '../../lib/odoo.js';
import { getSupabaseClient } from '../../lib/database.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

async function leesJson(request) {
  try { return await request.json(); } catch { return null; }
}

/**
 * Wat weten we over dit adres?
 *
 * Dit is wat de kaart in Gmail toont zodra je een mail opent. Drie mogelijke
 * antwoorden, in deze volgorde van zekerheid:
 *   1. er is een UITZONDERING vastgelegd voor dit adres
 *   2. het adres staat rechtstreeks op een lead (de automatische weg)
 *   3. we kennen het niet
 */
async function handleLookup(env, request, user) {
  const body = await leesJson(request);
  const adres = String(body?.email || '').trim().toLowerCase();
  if (!adres.includes('@')) return json({ success: false, error: 'Ongeldig adres' }, 400);

  const koppeling = await getContactLink(env, adres).catch(() => null);

  let lead = null;
  let herkomst = null;

  if (koppeling?.action === 'ignore') {
    herkomst = 'genegeerd';
  } else if (koppeling?.action === 'lead') {
    herkomst = 'uitzondering';
    lead = (await searchRead(env, {
      model: 'crm.lead',
      domain: [['id', '=', koppeling.odoo_res_id]],
      fields: ['id', 'name', 'contact_name', 'email_from'],
      limit: 1,
      context: { active_test: false }
    }))[0] || null;
  } else {
    const gevonden = await zoekLeadOpAdres(env, adres).catch(() => null);
    if (gevonden) {
      herkomst = 'automatisch';
      lead = (await searchRead(env, {
        model: 'crm.lead',
        domain: [['id', '=', gevonden.res_id]],
        fields: ['id', 'name', 'contact_name', 'email_from'],
        limit: 1,
        context: { active_test: false }
      }))[0] || null;
    }
  }

  // Hoeveel mail van dit adres staat er al in de chatter, en hoeveel wacht nog?
  const supabase = getSupabaseClient(env);
  const { data: rijen } = await supabase
    .from('gmail_captured_messages')
    .select('status')
    .eq('counterpart_email', adres)
    .eq('user_email', user.email);

  const tellingen = { posted: 0, unmatched: 0 };
  for (const r of rijen || []) if (tellingen[r.status] !== undefined) tellingen[r.status]++;

  return json({
    success: true,
    data: { email: adres, herkomst, lead, tellingen, gebruiker: user.email }
  });
}

/** Leads zoeken voor de kiezer in de add-on. */
async function handleLeads(env, request) {
  const url = new URL(request.url);
  const term = String(url.searchParams.get('q') || '').trim();
  if (term.length < 2) return json({ success: true, data: [] });

  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain: ['|', '|',
      ['name', 'ilike', term],
      ['contact_name', 'ilike', term],
      ['email_from', 'ilike', term]
    ],
    fields: ['id', 'name', 'contact_name', 'email_from'],
    order: 'write_date desc',
    limit: 15,
    context: { active_test: false }
  });
  return json({ success: true, data: leads });
}

/** De hoofdhandeling: dit adres hoort voortaan bij die lead. */
async function handleLink(env, request, user) {
  const body = await leesJson(request);
  const res = await koppelContact(env, {
    contact: body?.email,
    leadId: body?.lead_id,
    actorEmail: user.email,
    isAdmin: user.role === 'admin',
    source: 'gmail-addon'
  });
  if (!res.ok) return json({ success: false, error: res.error }, 400);
  return json({ success: true, data: res.data });
}

async function handleIgnore(env, request, user) {
  const body = await leesJson(request);
  const res = await negeerContact(env, {
    contact: body?.email,
    actorEmail: user.email,
    isAdmin: user.role === 'admin',
    source: 'gmail-addon'
  });
  if (!res.ok) return json({ success: false, error: res.error }, 400);
  return json({ success: true, data: res.data });
}

/**
 * De ingang vanuit public-routes.js.
 *
 * @returns {Promise<Response|null>} null als het pad niet voor ons is
 */
export async function handleGmailAddonRoutes(request, env) {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/gmail-addon/v1/')) return null;

  // Preflight — de add-on praat vanuit Google's infrastructuur.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    });
  }

  const { user, fout } = await authenticeerAddon(env, request);
  if (fout) return fout;

  try {
    if (pathname === '/gmail-addon/v1/lookup' && request.method === 'POST') {
      return await handleLookup(env, request, user);
    }
    if (pathname === '/gmail-addon/v1/leads' && request.method === 'GET') {
      return await handleLeads(env, request);
    }
    if (pathname === '/gmail-addon/v1/link' && request.method === 'POST') {
      return await handleLink(env, request, user);
    }
    if (pathname === '/gmail-addon/v1/ignore' && request.method === 'POST') {
      return await handleIgnore(env, request, user);
    }
  } catch (err) {
    console.error('[gmail-addon]', pathname, err?.message);
    return json({ success: false, error: String(err?.message || err) }, 500);
  }

  return json({ success: false, error: 'Onbekende route' }, 404);
}
