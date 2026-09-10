/**
 * Event Operations v2 — Postmark-tracking: headers heen, identificatie terug
 *
 * WAAROM DIT BESTAND OPNIEUW IS GESCHREVEN (2026-09-10).
 * ------------------------------------------------------
 * De vorige versie zette alleen `X-PM-TrackOpens`/`X-PM-TrackLinks` op de
 * reminder en ging ervan uit dat de webhook de mail kon terugvinden via
 * `payload.MessageID`, omdat "Postmark de Message-ID-header bewaart zoals
 * aangeleverd via SMTP". Dat is NIET zo. `MessageID` in een Postmark-webhook
 * is Postmark's EIGEN UUID (bv. `883953f4-6105-42a2-a16a-77a8eac79483`), niet
 * onze `<evt76-reminder-reg1079@om.mymmo.com>`. Gevolg: elke gebeurtenis
 * viel door de `parseEventsV2MessageId`-controle en werd genegeerd met
 * `not_events_v2_mail` -- de webhook stond correct ingesteld en gaf netjes
 * 200, en toch werd er niets bijgehouden.
 *
 * Het bewijs zit in Postmarks documentatie en in de code, NIET in de staat
 * van de bestaande mails: die zijn allemaal van dezelfde ochtend, dus dat er
 * nog geen enkele op `received` stond zei op zich niets. `MessageID` wordt in
 * de webhook-payload gedocumenteerd als Postmarks eigen UUID, en
 * `MESSAGE_ID_RE` eist een `evt<id>-<soort>-reg<id>@`-vorm -- een UUID kan
 * daar per definitie nooit op matchen.
 *
 * De koppelingen-module (forminator-sync-v2) had dit al goed en werkte
 * daarom wel: die hangt de gebeurtenis aan `X-PM-Metadata-*`, dat Postmark
 * ongewijzigd terugstuurt in `payload.Metadata`. Deze module doet nu
 * hetzelfde. De zelfbeschrijvende `message_id` blijft bestaan -- die is nog
 * altijd de idempotentiesleutel in Odoo -- maar hij is niet langer het
 * herkenningsmiddel aan de kant van Postmark.
 *
 * DRIE APARTE METADATAVELDEN, ELK KORT. Postmark staat per bericht maximaal
 * 10 metadatavelden toe, een veldNAAM van maximaal 20 tekens en een
 * WAARDE van maximaal 80 tekens. In forminator-sync-v2 is één te lange
 * samengestelde waarde de oorzaak geweest van berichten die stil verdwenen
 * (Odoo meldde `sent` zonder `failure_reason`, en in Postmark was het
 * bericht nergens te vinden). Hier zijn de waarden een event-id, een
 * mailsoort en een registratie-id: alle drie ruim binnen de grens. De
 * `beperk()` hieronder is een vangnet, geen normale werking.
 *
 * TRACKING OP ALLE DRIE DE SOORTEN. Voorheen kreeg alleen de reminder
 * trackingheaders, waardoor "geopend"/"geklikt" voor bevestiging en recap
 * per definitie leeg bleven. De Mails-kolom toont nu voor elke soort
 * dezelfde funnel, dus alle drie krijgen dezelfde headers.
 *
 * GEEN `X-PM-Message-Stream`. Exact dezelfde afspraak als
 * `buildPostmarkHeaders` in forminator-sync-v2/mail-step.js: de stream zit in
 * het SMTP-token van de `ir.mail_server` die de mail gebruikt, en een header
 * die iets anders beweert dan het token is op zijn best overbodig. De
 * mailserver wordt daarom meegegeven via `mail_server_id` (zie
 * EVENTS_V2_MAIL_SERVER_ID in mail-service.js) -- ook dat is wat de
 * koppelingen-module doet (`values.mail_server_id` uit `target.mail_server_id`).
 *
 * WEL `X-PM-TrackLinks`, en dat is het enige verschil met mail-step.js.
 * Daar staat alleen `X-PM-TrackOpens`, want een klik bepaalt daar niets. Hier
 * bepaalt een klik op de eventlink de AANWEZIGHEID (zie mail-webhook.js), dus
 * moet linktracking aan staan. Per bericht, niet als stream-instelling: een
 * vinkje in Postmark dat iemand later uitzet zou de aanwezigheidsdetectie
 * stil uitschakelen.
 *
 * `mail.mail.headers` is een tekstveld dat Odoo met `safe_eval` als
 * Python-dict inleest -- zelfde mechanisme en zelfde format als
 * `buildPostmarkHeaders` in forminator-sync-v2/mail-step.js.
 */

/** Postmark's grens voor een metadatawaarde. */
const PM_METADATA_MAX = 80;

/**
 * De metadata-veldnamen. Kort gehouden (Postmark's grens is 20 tekens voor
 * een naam) en met hetzelfde `om-`-voorvoegsel als de koppelingen-module,
 * zodat je in Postmark's UI meteen ziet dat het van de OM komt.
 */
export const TRACKING_META = {
  EVENT: 'om-evt',
  KIND: 'om-kind',
  REGISTRATION: 'om-reg'
};

/** Mailsoort → leesbaar label. Eén bron: ook de chatter-labels komen hieruit. */
const KIND_LABELS = {
  confirmation: 'Bevestiging',
  reminder: 'Reminder',
  recap: 'Recap'
};

/**
 * De tekst van een chatter-notitie per soort gebeurtenis.
 *
 * WAAROM DIT HIER STAAT EN NIET IN DE WEBHOOK. Deze module heeft geen eigen
 * tabel (Odoo is de enige database, zie lib/mail-webhook.js), dus "geopend"
 * en "geklikt" worden TERUGGELEZEN uit de chatter-notitie die de webhook
 * schreef -- door `getMailStatus()` in mail-service.js. Schrijver en lezer
 * moeten dus exact dezelfde tekst gebruiken. Stond die tekst op twee
 * plekken, dan is een spelwijziging aan één kant genoeg om de hele kolom
 * stil leeg te laten. Beide kanten importeren daarom deze ene functie.
 *
 * @param {string} kind - confirmation | reminder | recap
 * @param {string} soort - delivery | open | click | bounce | spamcomplaint
 * @returns {string|null} null bij een soort waarvoor we niets posten
 */
export function chatterLabel(kind, soort) {
  const label = KIND_LABELS[kind] || 'Mail';
  const laag = label.toLowerCase();
  const teksten = {
    delivery: `${label} afgeleverd (Postmark)`,
    open: `${label} geopend`,
    click: `Link in ${laag} geklikt`,
    bounce: `${label} kon niet afgeleverd worden (bounce)`,
    spamcomplaint: `Ontvanger markeerde de ${laag} als spam`
  };
  return teksten[soort] || null;
}

/**
 * De headers voor één mail.
 *
 * @param {Object} params
 * @param {number} params.eventId
 * @param {string} params.kind - confirmation | reminder | recap
 * @param {number} params.registrationId
 * @returns {string} een Python-dict-literal voor mail.mail.headers
 */
export function buildMailTrackingHeaders({ eventId, kind, registrationId } = {}) {
  const beperk = (waarde) =>
    String(waarde ?? '')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, PM_METADATA_MAX);

  const paren = [
    ['X-PM-TrackOpens', 'true'],
    ['X-PM-TrackLinks', 'HtmlAndText']
  ];

  const meta = [
    [TRACKING_META.EVENT, beperk(eventId)],
    [TRACKING_META.KIND, beperk(kind)],
    [TRACKING_META.REGISTRATION, beperk(registrationId)]
  ];
  for (const [naam, waarde] of meta) {
    if (waarde !== '') paren.push(['X-PM-Metadata-' + naam, waarde]);
  }

  return '{' + paren.map(([k, v]) => `'${k}': '${v}'`).join(', ') + '}';
}

/**
 * Eén metadataveld uitlezen, hoofdletterongevoelig.
 *
 * Wij sturen `om-evt`, maar een header kan onderweg van hoofdletter
 * wisselen -- zelfde voorzichtigheid als `metaWaarde` in
 * forminator-sync-v2/postmark-webhook.js.
 */
function metaWaarde(metadata, sleutel) {
  if (!metadata || typeof metadata !== 'object') return null;
  const gezocht = String(sleutel).toLowerCase();
  for (const naam of Object.keys(metadata)) {
    if (String(naam).toLowerCase() === gezocht) {
      const waarde = String(metadata[naam] ?? '').trim();
      return waarde === '' ? null : waarde;
    }
  }
  return null;
}

/**
 * De metadata van een webhook-payload terug naar event/soort/registratie.
 *
 * @param {Object} metadata - payload.Metadata
 * @returns {{ eventId: number, kind: string, registrationId: number }|null}
 */
export function readTrackingMetadata(metadata) {
  const eventId = Number(metaWaarde(metadata, TRACKING_META.EVENT));
  const registrationId = Number(metaWaarde(metadata, TRACKING_META.REGISTRATION));
  const kind = metaWaarde(metadata, TRACKING_META.KIND);

  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  if (!Number.isInteger(registrationId) || registrationId <= 0) return null;
  if (!kind || !Object.prototype.hasOwnProperty.call(KIND_LABELS, kind)) return null;

  return { eventId, kind, registrationId };
}
