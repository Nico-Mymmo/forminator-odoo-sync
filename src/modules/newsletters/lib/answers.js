/**
 * Nieuwsbrieven -- vragen in de mail: de links, het token, de antwoorden, en
 * het doorzetten naar een koppeling.
 *
 * Hoe een antwoord binnenkomt (docs/ontwerp-om-nieuwsbrieven.md §6):
 *
 *   1. Elke optie in de mail is een link naar
 *      https://link.<merk>/t/_v/<stukje>/<optie>?c=<contact>&t=<token>
 *   2. De GET bewaart NIETS. Hij toont een bedankpagina, en pas het script op
 *      die pagina post het antwoord. Beveiligingsscanners (Safe Links,
 *      Mimecast) openen elke link in een mail; bewaarde de GET het antwoord,
 *      dan antwoordde elke lezer achter zo'n scanner op alle opties tegelijk.
 *   3. Het token is HMAC(geheim, contact-id). Odoo zet het per ontvanger in de
 *      link via QWeb, uit het Studio-veld x_studio_om_token op mailing.contact,
 *      dat de OM vooraf vult. Klopt het token niet (doorgestuurde mail, oude
 *      link), dan telt het antwoord mee als ANONIEM en gaat het niet naar Odoo.
 *   4. Een antwoord RIJPT 10 minuten: wie van mening verandert of een
 *      toelichting toevoegt, levert één inzending op in de koppeling, niet drie.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { searchRead } from '../../../lib/odoo.js';
import { handleGenericWebhook } from '../../forminator-sync-v2/worker-handler.js';
import { getIntegrationById } from '../../forminator-sync-v2/database.js';
import { createIntegrationRecord } from '../../forminator-sync-v2/services/integration-service.js';
import { TABLES, BRAND, TOKEN_FIELD, KINDS, ANSWER_SETTLE_MS, LOG_PREFIX } from './constants.js';
import { getContribution, getEdition, getSeries, updateSeries, NewsletterError } from './store.js';
import { opties } from './render.js';

const db = (env) => getSupabaseClient(env);

// ─── Token ──────────────────────────────────────────────────────────────────

function geheim(env) {
  // Een eigen geheim als het er is. Anders de service-role-key: die is enkel
  // server-side bekend en verandert zelden. Wordt ze ooit geroteerd, dan
  // worden de links in oude mails anoniem -- niets breekt.
  return String(env?.NEWSLETTER_TOKEN_SECRET || env?.SUPABASE_SERVICE_ROLE_KEY || '');
}

export async function tokenVoor(env, contactId) {
  const sleutel = geheim(env);
  if (!sleutel) throw new Error('Geen geheim voor de antwoordtokens.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sleutel), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`nb:${Number(contactId)}`)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
}

function gelijk(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || x.length !== y.length) return false;
  let verschil = 0;
  for (let i = 0; i < x.length; i++) verschil |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return verschil === 0;
}

// ─── De links in de mail ────────────────────────────────────────────────────

/**
 * Een functie (stukje, optie) -> { href, tAtt } voor de renderer.
 *
 * `tAtt` is een QWeb-uitdrukking voor `t-att` (met een dict), zodat Odoo per
 * ontvanger contact-id en token invult. Bewust geen `t-attf-href`: Odoo's
 * linkverkorter zoekt `href=` en zou dat ook binnen `t-attf-href=` vinden,
 * waarna iedereen dezelfde, verkorte link krijgt. `href` blijft staan als
 * terugval zonder token (een anoniem antwoord), mocht de QWeb ooit wegvallen.
 *
 * @param {'preview'|'test'|'live'} mode
 * @param {boolean} tokenVeld  bestaat x_studio_om_token op mailing.contact?
 */
export function antwoordLinks(series, mode, tokenVeld) {
  const host = (BRAND[series.brand] || BRAND.openvme).linkHost;
  return (item, optie) => {
    const basis = `${host}/t/_v/${item.id}/${encodeURIComponent(optie.value)}`;
    if (mode === 'preview') return { href: `${basis}?voorbeeld=1` };
    const expr = tokenVeld
      ? `{'href': '${basis}?c=%s&t=%s' % (object.id, object.${TOKEN_FIELD} or '')}`
      : `{'href': '${basis}?c=%s' % (object.id,)}`;
    return { href: basis, tAtt: expr };
  };
}

// ─── Een antwoord bewaren (publiek) ─────────────────────────────────────────

function sleutel() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function vraagContext(env, cid) {
  if (!/^[0-9a-f-]{36}$/i.test(String(cid || ''))) throw new NewsletterError('Deze link klopt niet.', 404);
  const item = await getContribution(env, cid);
  if (!item || !KINDS[item.kind]?.interactive) throw new NewsletterError('Deze vraag bestaat niet (meer).', 404);
  const edition = item.edition_id ? await getEdition(env, item.edition_id) : null;
  const series = edition ? await getSeries(env, edition.series_id) : null;
  return { item, edition, series };
}

async function telling(env, cid) {
  const { data, error } = await db(env).from(TABLES.answers).select('option_value').eq('contribution_id', cid).limit(20000);
  if (error) throw new Error(error.message);
  const uit = {};
  for (const r of data || []) uit[r.option_value] = (uit[r.option_value] || 0) + 1;
  return { counts: uit, total: (data || []).length };
}

function antwoordVorm(ctx, rij, results) {
  const { item, series } = ctx;
  return {
    question: String(item.content?.question || ''),
    kicker: item.title || '',
    options: opties(item),
    chosen: rij?.option_value || null,
    comment: rij?.comment || '',
    ask_comment: item.content?.ask_comment !== false,
    show_results: item.content?.show_results !== false,
    results: item.content?.show_results !== false ? results : null,
    answer_id: rij?.id || null,
    answer_key: rij?.answer_key || null,
    brand: series?.brand || 'openvme',
    series_name: series?.name || '',
    site: (BRAND[series?.brand] || BRAND.openvme).site,
    verified: Boolean(rij?.verified),
  };
}

/** Enkel lezen: wat de bedankpagina in de voorbeeldstand toont. */
export async function vraagVoorbeeld(env, { cid }) {
  const ctx = await vraagContext(env, cid);
  return antwoordVorm(ctx, null, await telling(env, cid));
}

export async function registreerAntwoord(env, { cid, opt, c, t, key }) {
  const ctx = await vraagContext(env, cid);
  const optie = opties(ctx.item).find((o) => o.value === String(opt || ''));
  if (!optie) throw new NewsletterError('Dat antwoord bestaat niet bij deze vraag.', 400);

  const contactId = Number.parseInt(String(c || ''), 10);
  let verified = false;
  if (Number.isInteger(contactId) && contactId > 0 && t) {
    verified = gelijk(t, await tokenVoor(env, contactId));
  }

  const tabel = db(env).from(TABLES.answers);
  let bestaand = null;
  if (verified) {
    const { data } = await db(env).from(TABLES.answers).select('*')
      .eq('contribution_id', cid).eq('contact_id', contactId).eq('verified', true).maybeSingle();
    bestaand = data || null;
  }
  if (!bestaand && key) {
    const { data } = await db(env).from(TABLES.answers).select('*')
      .eq('contribution_id', cid).eq('answer_key', String(key)).maybeSingle();
    bestaand = data || null;
  }

  let rij;
  const nu = new Date().toISOString();
  if (bestaand) {
    const wijzig = { option_value: optie.value, updated_at: nu };
    if (bestaand.option_value !== optie.value) { wijzig.pushed_at = null; wijzig.push_error = null; }
    const { data, error } = await db(env).from(TABLES.answers).update(wijzig).eq('id', bestaand.id).select('*').single();
    if (error) throw new Error(error.message);
    rij = data;
  } else {
    const { data, error } = await tabel.insert({
      contribution_id: cid,
      edition_id: ctx.item.edition_id,
      option_value: optie.value,
      contact_id: verified ? contactId : null,
      verified,
      answer_key: sleutel(),
    }).select('*').single();
    if (error) throw new Error(error.message);
    rij = data;
  }
  return antwoordVorm(ctx, rij, await telling(env, cid));
}

export async function registreerToelichting(env, { answer_id, key, comment }) {
  const tekst = String(comment || '').trim().slice(0, 1000);
  const { data: rij } = await db(env).from(TABLES.answers).select('*').eq('id', String(answer_id || '')).maybeSingle();
  if (!rij || !gelijk(rij.answer_key, key)) throw new NewsletterError('Dit antwoord kan niet aangepast worden.', 403);
  const { error } = await db(env).from(TABLES.answers)
    .update({ comment: tekst, updated_at: new Date().toISOString(), pushed_at: null, push_error: null })
    .eq('id', rij.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ─── Overzicht in de OM ─────────────────────────────────────────────────────

export async function antwoordenVanEditie(env, editionId) {
  const { data, error } = await db(env).from(TABLES.answers).select('*')
    .eq('edition_id', editionId).order('updated_at', { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  const rijen = data || [];
  const ids = [...new Set(rijen.filter((r) => r.contact_id).map((r) => r.contact_id))];
  const contacten = {};
  for (let i = 0; i < ids.length; i += 200) {
    try {
      const deel = await searchRead(env, {
        model: 'mailing.contact', domain: [['id', 'in', ids.slice(i, i + 200)]], fields: ['id', 'name', 'email'], limit: 200,
      });
      for (const r of deel || []) contacten[r.id] = { name: r.name || '', email: r.email || '' };
    } catch (error) {
      console.warn(`${LOG_PREFIX} contacten bij antwoorden niet gelezen:`, error?.message);
    }
  }
  return rijen.map((r) => ({ ...r, answer_key: undefined, contact: r.contact_id ? contacten[r.contact_id] || null : null }));
}

// ─── Doorzetten naar de koppeling ───────────────────────────────────────────

/**
 * De koppeling van een reeks, en anders er één aanmaken: generic_webhook,
 * INACTIEF. Een inactieve koppeling bewaart de inzendingen maar raakt Odoo
 * niet (skipPipeline) -- dezelfde veiligheidsklep als bij de formulieren.
 * Pas als iemand stappen toevoegt en ze aanzet, gebeurt er iets in Odoo.
 */
export async function koppelingVanReeks(env, series) {
  if (series.answers_integration_id) {
    const k = await getIntegrationById(env, series.answers_integration_id);
    if (k) return k;
  }
  const tokenBytes = new Uint8Array(24);
  crypto.getRandomValues(tokenBytes);
  const k = await createIntegrationRecord(env, {
    name: `Nieuwsbrief-antwoorden ${series.name}`,
    source_type: 'generic_webhook',
    odoo_connection_id: 'default',
    webhook_token: btoa(String.fromCharCode(...tokenBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
    forminator_form_id: 'generic-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
  });
  // Een antwoord op een nieuwsbriefvraag is geen aanvraag: niet meetellen in
  // Marketing (zie conversieSoort() in src/lib/web-conversions.js).
  try {
    await db(env).from('fs_v2_integrations').update({ web_action: 'geen' }).eq('id', k.id);
  } catch (error) {
    console.warn(`${LOG_PREFIX} web_action niet gezet:`, error?.message);
  }
  await updateSeries(env, series.id, { answers_integration_id: k.id });
  console.log(`${LOG_PREFIX} koppeling aangemaakt voor ${series.name}: ${k.id}`);
  return k;
}

/** Rijpe, geverifieerde antwoorden naar de koppeling van hun reeks. */
export async function zetAntwoordenDoor(env, { limit = 40 } = {}) {
  const grens = new Date(Date.now() - ANSWER_SETTLE_MS).toISOString();
  const { data, error } = await db(env).from(TABLES.answers).select('*')
    .is('pushed_at', null).eq('verified', true).lt('updated_at', grens)
    .order('updated_at').limit(limit);
  if (error) throw new Error(error.message);
  const rijen = data || [];
  if (!rijen.length) return 0;

  const cache = new Map();
  let gedaan = 0;
  for (const rij of rijen) {
    try {
      let ctx = cache.get(rij.contribution_id);
      if (!ctx) {
        ctx = await vraagContext(env, rij.contribution_id);
        ctx.integration = ctx.series ? await koppelingVanReeks(env, ctx.series) : null;
        cache.set(rij.contribution_id, ctx);
      }
      if (!ctx.integration) throw new Error('geen reeks of koppeling');
      const contact = (await searchRead(env, {
        model: 'mailing.contact', domain: [['id', '=', rij.contact_id]], fields: ['id', 'name', 'email'], limit: 1,
      }))?.[0];
      const optie = opties(ctx.item).find((o) => o.value === rij.option_value);
      const payload = {
        form_id: `nieuwsbrief-${ctx.series.code}`,
        form_data: {
          vraag: String(ctx.item.content?.question || ''),
          soort: ctx.item.kind,
          antwoord: rij.option_value,
          antwoord_label: optie?.label || rij.option_value,
          toelichting: rij.comment || '',
          email: contact?.email || '',
          naam: contact?.name || '',
          mailing_contact_id: rij.contact_id,
          reeks: ctx.series.name,
          editie: ctx.edition?.title || '',
          rubriek: ctx.item.title || '',
          beantwoord_op: rij.updated_at,
        },
      };
      const resp = await handleGenericWebhook({
        env,
        integration: ctx.integration,
        request: new Request('https://om.internal/nieuwsbrieven/antwoord', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        }),
        skipPipeline: !ctx.integration.is_active,
      });
      let submissionId = null;
      try { submissionId = (await resp.json())?.data?.submission_id || null; } catch { /* geen json */ }
      await db(env).from(TABLES.answers)
        .update({ pushed_at: new Date().toISOString(), push_error: null, submission_id: submissionId })
        .eq('id', rij.id);
      gedaan += 1;
    } catch (err) {
      console.error(`${LOG_PREFIX} antwoord ${rij.id} niet doorgezet:`, err?.message);
      await db(env).from(TABLES.answers)
        .update({ pushed_at: new Date().toISOString(), push_error: String(err?.message || err).slice(0, 300) })
        .eq('id', rij.id);
    }
  }
  return gedaan;
}
