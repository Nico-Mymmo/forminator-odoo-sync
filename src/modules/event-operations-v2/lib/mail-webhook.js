/**
 * Event Operations v2 — Postmark-webhook voor de reminder
 *
 * WAAROM GEEN NIEUWE TABEL. De moduleregistratie-migratie
 * (20260831081157_event_operations_v2_module.sql) is uitdrukkelijk "DE ENIGE
 * MIGRATIE VOOR DEZE MODULE": Odoo blijft de enige database voor events,
 * inschrijvingen, contacten EN mails, en een latere migratie die daar een
 * tabel aan toevoegt is een architectuurfout. Er komt hier dus GEEN
 * events_v2_mail_events-tabel, in tegenstelling tot forminator-sync-v2's
 * fs_v2_mail_events. Wat Postmark meldt, landt in plaats daarvan:
 *
 *   - als chatter-notitie op de inschrijving (model x_webinarregistrations,
 *     res_id = de registratie uit de message_id) -- zichtbaar in Odoo zelf,
 *     zelfde plek als elk ander auditspoor van deze module;
 *   - als state-update op het mail.mail-record bij aflevering (`received`),
 *     zelfde afspraak als forminator-sync-v2's syncMailEventToOdoo;
 *   - als automatische aanwezigheid bij een klik op de reminder (zie onder).
 *
 * "Afgeleverd"/"geklikt" voor de UI (mail-status-endpoint in routes.js)
 * wordt dus NIET uit een eigen tabel gelezen maar live uit Odoo: state op
 * mail.mail voor "afgeleverd", en een chatter-notitie-zoekopdracht voor
 * "geklikt" (zie GET /api/events/:id/mail-status).
 *
 * ZELFBESCHRIJVENDE MESSAGE_ID, GEEN METADATA. forminator-sync-v2's
 * buildPostmarkHeaders zet X-PM-Metadata-* headers omdat Odoo's message_id
 * daar willekeurig is. Hier is de message_id die queueMails() meegeeft al
 * volledig zelfbeschrijvend (`<evt{eventId}-{kind}-reg{registrationId}@
 * om.mymmo.com>`, zie buildMessageId in mail-service.js) -- Postmark stuurt
 * die waarde terug in `MessageID` bij elk event (Postmark bewaart de
 * Message-ID header zoals aangeleverd via SMTP-relay, in tegenstelling tot
 * hun HTTP-API die zelf een id genereert). Matcht die niet op het
 * `evt...-reg...`-patroon, dan is het geen mail van deze module en wordt
 * de gebeurtenis genegeerd (200, geen fout) -- zelfde "nooit falen"-principe
 * als forminator-sync-v2's webhook.
 *
 * AUTOMATISCHE AANWEZIGHEID BIJ EEN KLIK. Uitsluitend bij `click` op de
 * REMINDER. De huidige `x_studio_attendance_update_origin` wordt eerst
 * gelezen: is die leeg, of staat er nog `reminder_click` (een eerdere
 * automatische klik), dan zet dit de aanwezigheid AAN met origin
 * `reminder_click`. Staat er al iets anders (bv. `events_v2_panel`, een
 * organisator zette het handmatig), dan wordt NIET aangeraakt -- een
 * automatische detectie mag een bewuste menselijke beslissing nooit
 * overschrijven.
 */

import { searchRead, write, messagePost } from '../../../lib/odoo.js';
import { ODOO_MODELS, MAIL_FIELDS, REGISTRATION_FIELDS } from '../odoo-contract.js';
import { MAIL_KIND } from './mail-blocks.js';
import { buildMessageId } from './mail-service.js';
import { setAttendance } from './registrations-service.js';
import { LOG_PREFIX } from '../constants.js';

const WEBHOOK_PATH = '/events-v2/api/webhooks/postmark';

/** Postmark's RecordType → wat wij ermee doen. Zelfde soorten als forminator-sync-v2. */
const RECORD_TYPES = {
  delivery: 'delivery',
  open: 'open',
  click: 'click',
  bounce: 'bounce',
  spamcomplaint: 'spamcomplaint',
  subscriptionchange: 'subscriptionchange'
};

/** Mailsoort (uit de message_id) → leesbaar label voor de chatter-tekst. */
const KIND_LABELS = {
  confirmation: 'Bevestiging',
  reminder: 'Reminder',
  recap: 'Recap'
};

/**
 * Waarvoor postten we een chatter-notitie op de inschrijving? Functie i.p.v.
 * een vaste lijst -- delivery-events komen voor ELKE mailsoort binnen
 * (Postmark's delivery-event is niet aan trackingheaders gebonden), dus een
 * confirmation- of recap-mail kreeg voorheen altijd het label "Reminder
 * afgeleverd", ook al ging het om een heel andere mail.
 */
function chatterLabel(soort, kind) {
  const kindLabel = KIND_LABELS[kind] || 'Mail';
  const labels = {
    delivery: `${kindLabel} afgeleverd (Postmark)`,
    open: `${kindLabel} geopend`,
    click: `Link in ${kindLabel.toLowerCase()} geklikt`,
    bounce: `${kindLabel} kon niet afgeleverd worden (bounce)`,
    spamcomplaint: `Ontvanger markeerde de ${kindLabel.toLowerCase()} als spam`
  };
  return labels[soort];
}

const CHATTER_SOORTEN = ['delivery', 'open', 'click', 'bounce', 'spamcomplaint'];

/** `<evt76-reminder-reg1079@om.mymmo.com>` (met of zonder `<>`) → de drie delen. */
const MESSAGE_ID_RE = /^<?evt(\d+)-([a-z_]+)-reg(\d+)@/;

/**
 * @param {string} messageId
 * @returns {{ eventId: number, kind: string, registrationId: number }|null}
 */
export function parseEventsV2MessageId(messageId) {
  const match = MESSAGE_ID_RE.exec(String(messageId || '').trim());
  if (!match) return null;
  return {
    eventId: Number(match[1]),
    kind: match[2],
    registrationId: Number(match[3])
  };
}

/** Is dit event chatter-waardig? Heropeningen zijn ruis, net als bij forminator-sync-v2. */
function isChatterWorthy(soort, payload) {
  if (CHATTER_SOORTEN.indexOf(soort) === -1) return false;
  if (soort === 'open' && (!payload || payload.FirstOpen !== true)) return false;
  return true;
}

function ontvanger(payload) {
  const adres = payload.Recipient || payload.Email || payload.recipient || null;
  return adres ? String(adres).trim() : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Chatter-notitie op de inschrijving. Nooit fataal -- een mislukte notitie
 * mag het antwoord aan Postmark niet breken.
 */
async function postChatterNote(env, { soort, kind, payload, registrationId }, deps = {}) {
  const _messagePost = deps.messagePost || messagePost;
  try {
    const adres = ontvanger(payload) || '-';
    const detail = soort === 'click' && payload.OriginalLink ? ` (${escapeHtml(payload.OriginalLink)})` : '';
    const body = `<p>${chatterLabel(soort, kind)} — ${escapeHtml(adres)}${detail}</p>`;
    await _messagePost(env, { model: ODOO_MODELS.REGISTRATION, id: registrationId, body });
  } catch (error) {
    console.warn(`${LOG_PREFIX}[mail-webhook] chatternotitie mislukt (registratie ${registrationId}): ${error?.message}`);
  }
}

/**
 * Bij aflevering: state van het mail.mail-record op 'received' zetten.
 * Zelfde afspraak als forminator-sync-v2's syncMailEventToOdoo -- geen
 * nieuw Studio-veld, en nooit een gearchiveerde/geannuleerde mail
 * terugzetten.
 */
async function markDelivered(env, { eventId, kind, registrationId }, deps = {}) {
  const _searchRead = deps.searchRead || searchRead;
  const _write = deps.write || write;

  try {
    const messageId = buildMessageId(eventId, kind, registrationId);
    const rows = await _searchRead(env, {
      model: ODOO_MODELS.MAIL,
      domain: [[MAIL_FIELDS.MESSAGE_ID, '=', messageId]],
      fields: [MAIL_FIELDS.ID, MAIL_FIELDS.STATE],
      limit: 1
    });
    const mail = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!mail) return;
    if (mail[MAIL_FIELDS.STATE] === 'cancel' || mail[MAIL_FIELDS.STATE] === 'received') return;

    await _write(env, {
      model: ODOO_MODELS.MAIL,
      ids: [Number(mail.id)],
      values: { [MAIL_FIELDS.STATE]: 'received' }
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX}[mail-webhook] state-update naar received mislukt: ${error?.message}`);
  }
}

/**
 * Automatische aanwezigheid bij een klik op de reminder. Raakt NOOIT een
 * bestaande, bewust gezette waarde aan -- zie de doc-comment bovenaan dit
 * bestand.
 */
async function autoMarkAttendanceOnClick(env, registrationId, deps = {}) {
  const _searchRead = deps.searchRead || searchRead;
  const _setAttendance = deps.setAttendance || setAttendance;

  try {
    const rows = await _searchRead(env, {
      model: ODOO_MODELS.REGISTRATION,
      domain: [[REGISTRATION_FIELDS.ID, '=', registrationId]],
      fields: [REGISTRATION_FIELDS.ATTENDANCE_ORIGIN, REGISTRATION_FIELDS.ATTENDED],
      limit: 1
    });
    const record = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!record) return;

    const huidigeOrigin = String(record[REGISTRATION_FIELDS.ATTENDANCE_ORIGIN] || '').trim();
    const magOverschrijven = huidigeOrigin === '' || huidigeOrigin === 'reminder_click';
    if (!magOverschrijven) return; // een organisator zette dit al bewust -- niet aanraken
    if (record[REGISTRATION_FIELDS.ATTENDED] === true && huidigeOrigin === 'reminder_click') return; // al gezet

    await _setAttendance(env, registrationId, {
      attended: true,
      actor: { email: 'Postmark (automatische detectie via reminderlink)' },
      origin: 'reminder_click'
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX}[mail-webhook] automatische aanwezigheid mislukt (registratie ${registrationId}): ${error?.message}`);
  }
}

/** Hoort dit pad bij deze webhook? */
export function isEventsV2PostmarkWebhookPath(pathname, method) {
  return pathname === WEBHOOK_PATH && method === 'POST';
}

/**
 * Zelfde token als forminator-sync-v2's Postmark-webhook (POSTMARK_WEBHOOK_SECRET)
 * -- Nico hoeft daardoor maar één webhooksecret in te stellen, ook al
 * hangen er twee URL's aan (Postmark laat meerdere webhooks per server toe).
 * Zonder ingesteld secret is de route DICHT (403), niet open.
 */
export function isEventsV2PostmarkWebhookAuthorized(request, env) {
  const secret = env && env.POSTMARK_WEBHOOK_SECRET;
  if (!secret) return false;
  const token = new URL(request.url).searchParams.get('token');
  return Boolean(token) && token === secret;
}

/**
 * @param {Request} request
 * @param {Object} env
 * @param {Object} [ctx] - Cloudflare ctx (voor eventuele waitUntil, optioneel)
 * @param {Object} [deps] - injecteerbaar voor tests
 * @returns {Promise<Response>}
 */
export async function handleEventsV2PostmarkWebhook(request, env, ctx = null, deps = {}) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    console.warn('[events-v2][postmark] body niet te lezen:', error && error.message);
    return json({ ignored: true, reason: 'invalid_json' });
  }

  const soortRuw = String(payload.RecordType || '').toLowerCase();
  const soort = RECORD_TYPES[soortRuw];
  if (!soort) {
    console.log('[events-v2][postmark] onbekend RecordType:', payload.RecordType);
    return json({ ignored: true, reason: 'unknown_record_type' });
  }

  const parsed = parseEventsV2MessageId(payload.MessageID);
  if (!parsed) {
    // Geen (herkenbare) events-v2-mail -- normaal voor elke andere mail die
    // via dezelfde Postmark-server verstuurd wordt.
    return json({ ignored: true, reason: 'not_events_v2_mail' });
  }

  const { eventId, kind, registrationId } = parsed;

  if (isChatterWorthy(soort, payload)) {
    await postChatterNote(env, { soort, kind, payload, registrationId }, deps);
  }

  if (soort === 'delivery') {
    await markDelivered(env, { eventId, kind, registrationId }, deps);
  }

  if (soort === 'click' && kind === MAIL_KIND.REMINDER) {
    await autoMarkAttendanceOnClick(env, registrationId, deps);
  }

  console.log(
    `${LOG_PREFIX}[mail-webhook] ${soort} | event ${eventId} | ${kind} | registratie ${registrationId}`
  );
  return json({ ok: true, event_type: soort });
}
