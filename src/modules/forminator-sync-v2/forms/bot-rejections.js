/**
 * Koppelingen — wat de botcontrole (Turnstile) tegenhield.
 *
 * In FORMS_TURNSTILE_MODE = "on" krijgt een inzending zonder geldig token een
 * 403 nog voor er een koppeling opgezocht wordt (public-api.js). Zonder dit
 * bestand was ze daarmee weg. Nu wordt ze eerst hier bewaard, zodat iemand in
 * Koppelingen -> Instellingen -> Botcontrole kan zien wat er tegengehouden
 * werd, en een echte aanvraag ALSNOG kan doorlaten.
 *
 * Doorlaten is GEEN tweede pad naar Odoo: het geeft de bewaarde inzending aan
 * submitFormEntry(), dezelfde functie als een aanvaarde inzending. Validatie,
 * idempotentie, de stappen en het Indieningen-tabblad werken dus ongewijzigd.
 * Het enige verschil is meta_bot_check = 'vrijgegeven', zodat je in
 * Indieningen ziet dat een mens deze inzending doorliet.
 *
 * Geen enkele functie hier mag de 403 aan de bezoeker tegenhouden: mislukt het
 * bewaren, dan staat dat in de log en gaat de weigering gewoon door.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { getIntegrationById } from '../database.js';
import { getFormByIntegrationId } from './database.js';
import { META_KEYS } from './schema.js';
import { submitFormEntry } from './submit.js';

const TABEL = 'fs_v2_bot_rejections';
const INZENDINGEN = 'fs_v2_submissions';
const LOG_PREFIX = '[forms-botcontrole]';

export const BEWAARTERMIJN_DAGEN = 30;
export const VRIJGEGEVEN = 'vrijgegeven';
export const STATUSSEN = ['open', 'released', 'dismissed'];

const LIJST_LIMIET = 300;
const MAX_TEKST = 20000;
const MAX_META = 2000;
const MAX_ITEMS = 200;

export class BotRejectionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function db(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  return getSupabaseClient(env);
}

function wie(user) {
  return String(user?.email || user?.username || user?.full_name || '').slice(0, 200) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bewaren
// ─────────────────────────────────────────────────────────────────────────────

function compacteWaarde(waarde) {
  if (typeof waarde === 'string') return waarde.slice(0, MAX_TEKST);
  if (typeof waarde === 'number' && Number.isFinite(waarde)) return waarde;
  if (typeof waarde === 'boolean') return waarde;
  if (Array.isArray(waarde)) {
    return waarde
      .filter((x) => typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)))
      .slice(0, MAX_ITEMS)
      .map((x) => (typeof x === 'string' ? x.slice(0, MAX_META) : x));
  }
  return undefined;
}

/**
 * Wat er van een geweigerde inzending bewaard wordt. Enkel de veldsleutels van
 * DIT formulier en de gekende meta-sleutels, met een maximale lengte: de body
 * komt van een bot, en zonder filter kan die hier willekeurige JSON kwijt.
 * Meer is ook niet nodig -- submitFormEntry() gooit al de rest toch weg.
 * `bot_check` gaat er bewust uit: die zet de Worker, ook bij het doorlaten.
 */
export function compacteInzending(fields, inzending, meta) {
  const sleutels = new Set((fields || []).map((f) => String(f.field_key || '')).filter(Boolean));

  const bron = inzending?.form_data;
  const formData = {};
  if (bron && typeof bron === 'object' && !Array.isArray(bron)) {
    for (const sleutel of sleutels) {
      const waarde = compacteWaarde(bron[sleutel]);
      if (waarde !== undefined) formData[sleutel] = waarde;
    }
  }

  const schoneMeta = {};
  for (const sleutel of META_KEYS) {
    if (sleutel === 'bot_check') continue;
    const waarde = meta?.[sleutel];
    if (typeof waarde === 'string' && waarde) schoneMeta[sleutel] = waarde.slice(0, MAX_META);
  }

  const labels = {};
  const bronLabels = inzending?.value_labels;
  if (bronLabels && typeof bronLabels === 'object' && !Array.isArray(bronLabels)) {
    for (const [veld, kaart] of Object.entries(bronLabels)) {
      if (!sleutels.has(veld) || !kaart || typeof kaart !== 'object' || Array.isArray(kaart)) continue;
      const schoon = {};
      for (const [waarde, label] of Object.entries(kaart).slice(0, MAX_ITEMS)) {
        if (typeof label === 'string') schoon[String(waarde).slice(0, 200)] = label.slice(0, 500);
      }
      labels[veld] = schoon;
    }
  }

  return {
    form_data: formData,
    meta: schoneMeta,
    ...(Object.keys(labels).length ? { value_labels: labels } : {}),
  };
}

/**
 * Een geweigerde inzending bewaren. Faalt nooit naar buiten: de 403 aan de
 * bezoeker hangt hier niet van af.
 */
export async function recordBotRejection(env, { form, fields, inzending, meta, controle }) {
  try {
    const { error } = await db(env).from(TABEL).insert({
      form_id: form.id,
      integration_id: form.integration_id,
      form_slug: String(form.slug || ''),
      form_name: String(form.name || ''),
      site: meta?.site ? String(meta.site).slice(0, 100) : null,
      outcome: String(controle?.uitkomst || 'onbekend'),
      codes: (controle?.codes || []).map((c) => String(c).slice(0, 80)).slice(0, 10),
      hostname: controle?.hostname ? String(controle.hostname).slice(0, 200) : null,
      body: compacteInzending(fields, inzending, meta),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(`${LOG_PREFIX} geweigerde inzending voor "${form?.slug}" niet bewaard: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lezen
// ─────────────────────────────────────────────────────────────────────────────

export async function listBotRejections(env, { status = 'open' } = {}) {
  let query = db(env).from(TABEL).select('*').order('created_at', { ascending: false }).limit(LIJST_LIMIET);
  if (STATUSSEN.includes(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(`Kon de geweigerde inzendingen niet ophalen: ${error.message}`);
  return data || [];
}

export async function countBotRejections(env) {
  const tellingen = await Promise.all(STATUSSEN.map(async (status) => {
    const { count, error } = await db(env).from(TABEL).select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw new Error(`Kon de geweigerde inzendingen niet tellen: ${error.message}`);
    return [status, count || 0];
  }));
  return Object.fromEntries(tellingen);
}

/**
 * Per koppeling: naam, of ze aan staat, en de velden van haar formulier (voor
 * de labels en om het e-mailveld te herkennen). Een paar koppelingen per
 * lijst, dus een paar aanroepen.
 */
export async function formulierenVan(env, rijen) {
  const ids = [...new Set(rijen.map((r) => r.integration_id).filter(Boolean))];
  const paren = await Promise.all(ids.map(async (id) => {
    const [integration, gevonden] = await Promise.all([
      getIntegrationById(env, id).catch(() => null),
      getFormByIntegrationId(env, id).catch(() => null),
    ]);
    return [id, {
      name: integration?.name || '',
      is_active: integration ? integration.is_active !== false : false,
      bestaat: !!(integration && gevonden),
      fields: (gevonden?.fields || []).map((f) => ({
        key: f.field_key,
        label: f.label || f.field_key,
        type: f.field_type,
      })),
    }];
  }));
  return Object.fromEntries(paren);
}

function emailVan(rij, formulier) {
  const velden = (formulier?.fields || []).filter((f) => f.type === 'email');
  for (const veld of velden) {
    const waarde = rij.body?.form_data?.[veld.key];
    if (typeof waarde === 'string' && waarde.includes('@')) return waarde.trim().toLowerCase();
  }
  return '';
}

/**
 * Wie na de weigering toch nog binnenkwam. Een mens die "We konden niet nagaan
 * of je geen robot bent" ziet, probeert meestal meteen opnieuw -- en dan staat
 * zijn aanvraag er al. Die alsnog doorlaten maakt een tweede lead. Geeft per
 * open rij de inzending terug met hetzelfde e-mailadres, op dezelfde koppeling,
 * NA het tijdstip van de weigering.
 */
export async function laterVerstuurd(env, rijen, formulieren) {
  const kandidaten = rijen
    .filter((r) => r.status === 'open')
    .map((r) => ({ rij: r, email: emailVan(r, formulieren[r.integration_id]) }))
    .filter((k) => k.email);
  if (!kandidaten.length) return {};

  const ids = [...new Set(kandidaten.map((k) => k.rij.integration_id))];
  // Als TIJD vergelijken, niet als tekst: Postgres geeft een wisselend aantal
  // decimalen terug (".25+00:00" naast ".587+00:00").
  const ms = (iso) => Date.parse(iso) || 0;
  const vanaf = new Date(Math.min(...kandidaten.map((k) => ms(k.rij.created_at)))).toISOString();

  const { data, error } = await db(env)
    .from(INZENDINGEN)
    .select('id, integration_id, created_at, status, form_data:source_payload->form_data')
    .in('integration_id', ids)
    .gte('created_at', vanaf)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) {
    console.warn(`${LOG_PREFIX} latere inzendingen niet opgezocht: ${error.message}`);
    return {};
  }

  const resultaat = {};
  for (const { rij, email } of kandidaten) {
    const treffer = (data || []).find((s) => s.integration_id === rij.integration_id
      && ms(s.created_at) > ms(rij.created_at)
      && Object.values(s.form_data || {}).some((v) => typeof v === 'string' && v.trim().toLowerCase() === email));
    if (treffer) resultaat[rij.id] = { submission_id: treffer.id, created_at: treffer.created_at, status: treffer.status };
  }
  return resultaat;
}

// ─────────────────────────────────────────────────────────────────────────────
// Doorlaten en negeren
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Een geweigerde inzending alsnog door de koppeling laten lopen.
 *
 * Eerst CLAIMEN (open/dismissed -> released in één update), dan pas
 * verwerken: twee keer klikken, of twee mensen tegelijk, mag geen twee leads
 * opleveren. Mislukt het verwerken, dan gaat de rij terug naar open met de
 * reden erbij.
 */
export async function releaseBotRejection(env, id, { user, requestUrl }) {
  const { data: geclaimd, error } = await db(env)
    .from(TABEL)
    .update({ status: 'released', handled_at: new Date().toISOString(), handled_by: wie(user), release_error: null })
    .eq('id', id)
    .in('status', ['open', 'dismissed'])
    .select('*');
  if (error) throw new Error(`Kon de inzending niet claimen: ${error.message}`);

  const rij = geclaimd && geclaimd[0];
  if (!rij) {
    const { data: bestaand } = await db(env).from(TABEL).select('id, status').eq('id', id).maybeSingle();
    if (!bestaand) throw new BotRejectionError('Deze inzending bestaat niet meer.', 404);
    throw new BotRejectionError('Deze inzending is al doorgelaten.', 409);
  }

  const terugNaarOpen = async (melding) => {
    await db(env).from(TABEL)
      .update({ status: 'open', handled_at: null, handled_by: null, release_error: String(melding).slice(0, 1000) })
      .eq('id', id);
  };

  let integration;
  let gevonden;
  try {
    [integration, gevonden] = await Promise.all([
      getIntegrationById(env, rij.integration_id),
      getFormByIntegrationId(env, rij.integration_id),
    ]);
  } catch (err) {
    await terugNaarOpen(err.message);
    throw err;
  }
  if (!integration || !gevonden) {
    const melding = 'De koppeling of haar formulier bestaat niet meer.';
    await terugNaarOpen(melding);
    throw new BotRejectionError(melding, 410);
  }

  const body = {
    ...(rij.body || {}),
    meta: { ...(rij.body?.meta || {}), bot_check: VRIJGEGEVEN },
  };
  // submitFormEntry() gebruikt van het verzoek enkel de URL; dezelfde als die
  // van de publieke inzending, zodat het spoor er hetzelfde uitziet.
  const url = new URL(`/forminator-v2/public/v1/forms/${encodeURIComponent(gevonden.form.slug)}/submit`, requestUrl);

  let response;
  try {
    ({ response } = await submitFormEntry(env, {
      integration,
      form: gevonden.form,
      fields: gevonden.fields,
      body,
      request: new Request(url.toString(), { method: 'POST' }),
    }));
  } catch (err) {
    await terugNaarOpen(err.message);
    throw err;
  }

  const uitkomst = await response.json().catch(() => ({}));
  if (!response.ok || uitkomst?.success === false) {
    const melding = uitkomst?.error || `De koppeling weigerde de inzending (${response.status}).`;
    await terugNaarOpen(melding);
    throw new BotRejectionError(melding, response.status === 422 ? 422 : 502);
  }

  const submissionId = uitkomst?.data?.submission_id || null;
  if (submissionId) {
    const { error: koppelFout } = await db(env).from(TABEL).update({ submission_id: submissionId }).eq('id', id);
    if (koppelFout) console.warn(`${LOG_PREFIX} inzending ${submissionId} niet aan rij ${id} gehangen: ${koppelFout.message}`);
  }

  console.log(`${LOG_PREFIX} rij ${id} doorgelaten door ${wie(user) || '?'} -> inzending ${submissionId || '?'} (${uitkomst?.data?.status || '?'})`);
  return {
    submission_id: submissionId,
    status: uitkomst?.data?.status || null,
    integration_id: rij.integration_id,
    integration_active: integration.is_active !== false,
  };
}

/** Negeren, of het negeren ongedaan maken. Een doorgelaten rij blijft staan. */
export async function setDismissed(env, ids, { user, undo = false }) {
  const schoon = [...new Set((Array.isArray(ids) ? ids : []).map(String))]
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 500);
  if (!schoon.length) throw new BotRejectionError('Geen inzendingen gekozen.', 400);

  const { data, error } = await db(env)
    .from(TABEL)
    .update(undo
      ? { status: 'open', handled_at: null, handled_by: null }
      : { status: 'dismissed', handled_at: new Date().toISOString(), handled_by: wie(user) })
    .in('id', schoon)
    .eq('status', undo ? 'dismissed' : 'open')
    .select('id');
  if (error) throw new Error(`Kon de inzendingen niet bijwerken: ${error.message}`);
  return (data || []).length;
}

/** Ouder dan de bewaartermijn: weg. Draait in de 15-minutencron. */
export async function purgeOldBotRejections(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return;
  const grens = new Date(Date.now() - BEWAARTERMIJN_DAGEN * 86400000).toISOString();
  const { error } = await db(env).from(TABEL).delete().lt('created_at', grens);
  if (error) console.warn(`${LOG_PREFIX} opruimen mislukt: ${error.message}`);
}
