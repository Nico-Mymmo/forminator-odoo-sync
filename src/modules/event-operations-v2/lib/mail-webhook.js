/**
 * Event Operations v2 — Postmark-webhook: afgeleverd, geopend, geklikt, bounce
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
 *     res_id = de registratie uit de metadata) -- zichtbaar in Odoo zelf,
 *     zelfde plek als elk ander auditspoor van deze module;
 *   - als state-update op het mail.mail-record bij aflevering (`received`),
 *     zelfde afspraak als forminator-sync-v2's syncMailEventToOdoo;
 *   - als automatische aanwezigheid bij een klik op de eventlink rond het
 *     tijdstip van het event (zie onder).
 *
 * IDENTIFICATIE VIA METADATA, NIET VIA MessageID (gewijzigd 2026-09-10).
 * ---------------------------------------------------------------------
 * De vorige versie zocht de mail terug via `payload.MessageID`, in de
 * veronderstelling dat Postmark onze eigen `Message-ID`-header terugstuurt.
 * Dat doet Postmark niet: `MessageID` is Postmark's eigen UUID. Elke
 * gebeurtenis werd daardoor genegeerd met `not_events_v2_mail`, terwijl de
 * webhook zelf gewoon 200 gaf -- een fout die je alleen ziet door te merken
 * dat er nooit iets bijgehouden wordt. Het bewijs is Postmarks documentatie
 * plus `MESSAGE_ID_RE` hieronder, dat een `evt<id>-<soort>-reg<id>@`-vorm
 * eist: een UUID matcht daar per definitie nooit op.
 *
 * Nu leest hij `payload.Metadata` (`om-evt` / `om-kind` / `om-reg`), dat
 * Postmark ongewijzigd terugstuurt -- zelfde aanpak als de koppelingen-
 * module, die daardoor wél werkte. Het `MessageID`-patroon blijft als
 * FALLBACK bestaan voor het geval een mail ooit zonder metadata vertrekt
 * (bv. een mail die al klaarstond voor deze wijziging); het is niet langer
 * de hoofdweg. Kan een gebeurtenis langs geen van beide wegen geplaatst
 * worden, dan is het geen mail van deze module en wordt ze genegeerd (200,
 * geen fout) -- Postmark schakelt een webhook uit die blijft falen.
 *
 * AUTOMATISCHE AANWEZIGHEID BIJ EEN KLIK. Drie voorwaarden, alle drie
 * nodig, omdat elke losse voorwaarde op zich valse positieven geeft:
 *
 *   1. de mail is een BEVESTIGING of REMINDER (een recap gaat over een
 *      event dat al voorbij is);
 *   2. de geklikte link is de EVENTLINK -- de publieke eventpagina van dít
 *      event of de deelnamelink. Een klik op de aankondiging van een ánder
 *      event, op een uitschrijflink of op de afzender telt niet;
 *   3. de klik valt in het TIJDVENSTER rond het event: vanaf 30 minuten
 *      voor de start tot het einde (start + duur). Wie de dag ervoor de
 *      pagina bekijkt, is daarmee nog geen aanwezige.
 *
 * De huidige `x_studio_attendance_update_origin` wordt eerst gelezen: is die
 * leeg, of staat er nog een eerdere automatische klik in, dan zet dit de
 * aanwezigheid AAN met origin `mail_click`. Staat er al iets anders (bv.
 * `events_v2_panel`, een organisator zette het handmatig), dan wordt NIET
 * aangeraakt -- een automatische detectie mag een bewuste menselijke
 * beslissing nooit overschrijven.
 */

import { searchRead, write, messagePost } from '../../../lib/odoo.js';
import {
  ODOO_MODELS,
  MAIL_FIELDS,
  EVENT_FIELDS,
  REGISTRATION_FIELDS,
  fromOdooDatetime
} from '../odoo-contract.js';
import { MAIL_KIND } from './mail-blocks.js';
import { buildMessageId } from './mail-service.js';
import { setAttendance } from './registrations-service.js';
import { chatterLabel, readTrackingMetadata } from './postmark-tracking.js';
import { LOG_PREFIX, PUBLIC_EVENT_PATH, DEFAULT_DURATION_MINUTES } from '../constants.js';

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

const CHATTER_SOORTEN = ['delivery', 'open', 'click', 'bounce', 'spamcomplaint'];

/**
 * Hoeveel eerder dan de start een klik nog als "aanwezig" geldt.
 *
 * Bewust krap (30 minuten, keuze van 2026-09-10): dit is de tijd waarin
 * iemand de deelnamelink opzoekt om te beginnen. Een ruimer venster -- de
 * hele eventdag -- zet ook wie 's ochtends nieuwsgierig klikt en 's avonds
 * niet komt op aanwezig, en dat is precies het cijfer dat achteraf niet meer
 * te vertrouwen is.
 */
const ATTENDANCE_LEAD_MINUTES = 30;

/** Welke mailsoorten mogen aanwezigheid zetten. Een recap nooit: die komt na het event. */
const ATTENDANCE_KINDS = [MAIL_KIND.CONFIRMATION, MAIL_KIND.REMINDER];

/** Origins die een automatische klik mag overschrijven (een mens nooit). */
const OVERSCHRIJFBARE_ORIGINS = ['', 'mail_click', 'reminder_click'];

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

/**
 * Welke mail hoort bij deze gebeurtenis? Metadata eerst, MessageID als
 * fallback -- zie de doc-comment bovenaan.
 *
 * @param {Object} payload
 * @returns {{ eventId: number, kind: string, registrationId: number }|null}
 */
export function identifyMail(payload) {
  return readTrackingMetadata(payload && payload.Metadata) || parseEventsV2MessageId(payload && payload.MessageID);
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

/**
 * Het tijdstip van de gebeurtenis. Postmark noemt dat veld per soort anders;
 * bij een klik is het `ReceivedAt`. Alles is absolute tijd (ISO met zone),
 * dus er komt hier geen tijdzone-omrekening bij kijken.
 *
 * @returns {Date|null}
 */
export function gebeurtenisTijdstip(payload) {
  const raw = payload?.ReceivedAt || payload?.ClickedAt || payload?.DeliveredAt || payload?.BouncedAt || null;
  if (!raw) return null;
  const datum = new Date(raw);
  return Number.isNaN(datum.getTime()) ? null : datum;
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
 *
 * De TEKST komt uit `chatterLabel()` in postmark-tracking.js en staat
 * bewust niet hier: `getMailStatus()` in mail-service.js leest "geopend" en
 * "geklikt" terug uit precies deze tekst. Twee kopieën betekent dat een
 * spelwijziging aan één kant de hele Mails-kolom stil leeg laat.
 */
async function postChatterNote(env, { soort, kind, payload, registrationId }, deps = {}) {
  const _messagePost = deps.messagePost || messagePost;
  try {
    const label = chatterLabel(kind, soort);
    if (!label) return;
    const adres = ontvanger(payload) || '-';
    const detail = soort === 'click' && payload.OriginalLink ? ` (${escapeHtml(payload.OriginalLink)})` : '';
    const body = `<p>${escapeHtml(label)} — ${escapeHtml(adres)}${detail}</p>`;
    // isHtml: zonder die kwarg escapet Odoo de body en leest de chatter
    // letterlijk "<p>Mail geopend - ...</p>" (zie messagePost in lib/odoo.js).
    // Alles wat hier in de body komt, is hierboven al geescaped.
    await _messagePost(env, { model: ODOO_MODELS.REGISTRATION, id: registrationId, body, isHtml: true });
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
 * Wijst deze geklikte link naar DIT event?
 *
 * Twee vormen tellen mee, en verder niets:
 *  - de publieke eventpagina. Die eindigt altijd op `?owid={eventId}` (zie
 *    buildPublicUrl in mail-service.js), en dát is de betrouwbaarste
 *    controle: een aankondigingsblok naar een ánder event heeft de owid van
 *    dat andere event, dus die valt hier automatisch af. Het slug-pad is
 *    een tweede kans voor het geval de owid ooit wegvalt;
 *  - de deelnamelink (`x_studio_webinar_link`), waar een online event op
 *    start.
 *
 * Alles wat de gebruiker verder in de mail kan aanklikken -- uitschrijven,
 * een route naar Maps, de afzender, een aankondiging -- geeft dus GEEN
 * aanwezigheid. Dat was de keuze van 2026-09-10: een klik op "een link"
 * bleek te ruim.
 *
 * @param {string} link - payload.OriginalLink
 * @param {Object} event - het Odoo-eventrecord
 * @param {number} eventId
 * @returns {boolean}
 */
export function isEventLink(link, event, eventId) {
  const url = String(link || '').trim();
  if (url === '') return false;

  if (new RegExp('[?&]owid=' + Number(eventId) + '(?:&|$)').test(url)) return true;

  const slug = String(event?.[EVENT_FIELDS.SLUG] || '').trim();
  if (slug !== '' && url.indexOf(`${PUBLIC_EVENT_PATH}/${slug}`) !== -1) return true;

  const online = String(event?.[EVENT_FIELDS.ONLINE_URL] || '').trim();
  if (online !== '' && url.indexOf(online) === 0) return true;

  return false;
}

/**
 * Valt dit tijdstip in het aanwezigheidsvenster van dit event?
 *
 * @param {Date} moment
 * @param {Object} event - het Odoo-eventrecord
 * @returns {boolean}
 */
export function isInAttendanceWindow(moment, event) {
  if (!(moment instanceof Date) || Number.isNaN(moment.getTime())) return false;

  // fromOdooDatetime geeft een ISO-STRING terug (niet een Date) -- die eerst
  // omzetten, anders faalt .getTime() stil op een string.
  const startIso = fromOdooDatetime(event?.[EVENT_FIELDS.STARTS_AT]);
  if (!startIso) return false;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return false;

  const duur = Number(event?.[EVENT_FIELDS.DURATION_MINUTES]);
  const minuten = Number.isFinite(duur) && duur > 0 ? duur : DEFAULT_DURATION_MINUTES;

  const van = start.getTime() - ATTENDANCE_LEAD_MINUTES * 60 * 1000;
  const tot = start.getTime() + minuten * 60 * 1000;

  return moment.getTime() >= van && moment.getTime() <= tot;
}

/**
 * Automatische aanwezigheid bij een klik. Raakt NOOIT een bestaande,
 * bewust gezette waarde aan -- zie de doc-comment bovenaan dit bestand.
 *
 * @returns {Promise<{gezet: boolean, reden: string}>}
 */
async function autoMarkAttendanceOnClick(env, { eventId, kind, registrationId, payload }, deps = {}) {
  const _searchRead = deps.searchRead || searchRead;
  const _setAttendance = deps.setAttendance || setAttendance;

  try {
    if (ATTENDANCE_KINDS.indexOf(kind) === -1) return { gezet: false, reden: 'soort_telt_niet' };

    const events = await _searchRead(env, {
      model: ODOO_MODELS.EVENT,
      domain: [[EVENT_FIELDS.ID, '=', Number(eventId)]],
      fields: [
        EVENT_FIELDS.ID,
        EVENT_FIELDS.STARTS_AT,
        EVENT_FIELDS.DURATION_MINUTES,
        EVENT_FIELDS.SLUG,
        EVENT_FIELDS.ONLINE_URL
      ],
      limit: 1
    });
    const event = Array.isArray(events) && events.length ? events[0] : null;
    if (!event) return { gezet: false, reden: 'event_niet_gevonden' };

    if (!isEventLink(payload?.OriginalLink, event, eventId)) return { gezet: false, reden: 'andere_link' };
    if (!isInAttendanceWindow(gebeurtenisTijdstip(payload), event)) return { gezet: false, reden: 'buiten_tijdvenster' };

    const rows = await _searchRead(env, {
      model: ODOO_MODELS.REGISTRATION,
      domain: [[REGISTRATION_FIELDS.ID, '=', Number(registrationId)]],
      fields: [REGISTRATION_FIELDS.ATTENDANCE_ORIGIN, REGISTRATION_FIELDS.ATTENDED],
      limit: 1
    });
    const record = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!record) return { gezet: false, reden: 'registratie_niet_gevonden' };

    const huidigeOrigin = String(record[REGISTRATION_FIELDS.ATTENDANCE_ORIGIN] || '').trim();
    if (OVERSCHRIJFBARE_ORIGINS.indexOf(huidigeOrigin) === -1) {
      return { gezet: false, reden: 'handmatig_gezet' };
    }
    if (record[REGISTRATION_FIELDS.ATTENDED] === true && huidigeOrigin !== '') {
      return { gezet: false, reden: 'al_aanwezig' };
    }

    await _setAttendance(env, Number(registrationId), {
      attended: true,
      actor: { email: 'Postmark (automatische detectie via klik op de eventlink)' },
      origin: 'mail_click'
    });
    return { gezet: true, reden: 'klik_op_eventlink' };
  } catch (error) {
    console.warn(`${LOG_PREFIX}[mail-webhook] automatische aanwezigheid mislukt (registratie ${registrationId}): ${error?.message}`);
    return { gezet: false, reden: 'fout' };
  }
}

/** Hoort dit pad bij deze webhook? */
export function isEventsV2PostmarkWebhookPath(pathname, method) {
  return pathname === WEBHOOK_PATH && method === 'POST';
}

/**
 * Zelfde token als forminator-sync-v2's Postmark-webhook (POSTMARK_WEBHOOK_SECRET)
 * -- Nico hoeft daardoor maar één webhooksecret in te stellen, ook al
 * hangen er meerdere URL's aan (Postmark laat meerdere webhooks per stream
 * toe, en webhooks staan per stream apart).
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

  const parsed = identifyMail(payload);
  if (!parsed) {
    // Geen (herkenbare) events-v2-mail -- normaal voor elke andere mail die
    // via dezelfde Postmark-stream verstuurd wordt.
    return json({ ignored: true, reason: 'not_events_v2_mail' });
  }

  const { eventId, kind, registrationId } = parsed;

  if (isChatterWorthy(soort, payload)) {
    await postChatterNote(env, { soort, kind, payload, registrationId }, deps);
  }

  if (soort === 'delivery') {
    await markDelivered(env, { eventId, kind, registrationId }, deps);
  }

  let aanwezigheid = null;
  if (soort === 'click') {
    aanwezigheid = await autoMarkAttendanceOnClick(env, { eventId, kind, registrationId, payload }, deps);
  }

  console.log(
    `${LOG_PREFIX}[mail-webhook] ${soort} | event ${eventId} | ${kind} | registratie ${registrationId}` +
      (aanwezigheid ? ` | aanwezigheid: ${aanwezigheid.gezet ? 'gezet' : 'niet gezet (' + aanwezigheid.reden + ')'}` : '')
  );
  return json({
    ok: true,
    event_type: soort,
    ...(aanwezigheid ? { attendance: aanwezigheid } : {})
  });
}
