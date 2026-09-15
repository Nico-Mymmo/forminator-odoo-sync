/**
 * Koppelingen — Calendly: de payload plat slaan en de handtekening nakijken.
 *
 * PUUR. Geen env, geen fetch, geen database. Alles hier is te testen met een
 * stuk JSON en een sleutel.
 *
 * WAAROM DEZE LAAG BESTAAT
 * ------------------------
 * Een Calendly-boeking zou technisch ook via de bestaande generic_webhook
 * binnen kunnen komen, maar dan krijg je er niets uit. normalizeFormValues()
 * in worker-handler.js slaat exact ÉÉN niveau plat: een object onder een
 * sleutel wordt samengevoegd tot "waarde1 waarde2" met de subvelden erbij als
 * `sleutel.subsleutel`. Calendly zet het belangrijkste twee niveaus diep --
 * `payload.scheduled_event.start_time` -- en die tak bestaat alleen uit
 * objecten en arrays, dus hij valt volledig weg. `questions_and_answers` is een
 * array van objecten en wordt letterlijk `[object Object]`. Zonder deze laag
 * heb je dus geen start, geen einde, geen host en geen antwoorden: precies de
 * velden waarvoor je de koppeling maakt.
 *
 * De uitvoer is bewust PLAT en bewust TEKST: dat is de vorm die
 * normalizeFormValues() ongewijzigd doorlaat en die lookupFormValue() zonder
 * heuristiek terugvindt. De sleutels staan vast (zie CALENDLY_FIELDS) zodat het
 * koppelingsscherm ze kan tonen vóór de eerste boeking binnen is -- dezelfde
 * reden als META_KEYS bij de OM-formulieren.
 *
 * Vorm van wat Calendly stuurt (geverifieerd tegen hun OpenAPI-spec,
 * schema InviteePayload):
 *
 *   { event, created_at, created_by, payload: {
 *       uri, email, name, first_name, last_name, status, timezone,
 *       questions_and_answers: [{question, answer, position}],
 *       tracking: {utm_*, salesforce_uuid},
 *       cancel_url, reschedule_url, text_reminder_number,
 *       rescheduled, old_invitee, new_invitee, cancellation: {...},
 *       scheduled_event: { uri, name, status, start_time, end_time,
 *                          event_type, location, event_memberships: [...],
 *                          event_guests: [...], cancellation: {...} } } }
 */

/** De enige twee events waar een koppeling iets mee doet. */
export const HANDLED_EVENTS = ['invitee.created', 'invitee.canceled'];

/**
 * De velden die een Calendly-koppeling ALTIJD levert, met hun label voor het
 * koppelingsscherm. De `q_*`-velden komen daar bovenop en hangen af van de
 * vragen op de boekingspagina; die worden pas zichtbaar na de eerste boeking.
 *
 * Wijzig een sleutel hier NOOIT zodra er koppelingen op draaien: hij staat in
 * fs_v2_mappings.source_value van elke stap, en hernoemen laat een stap zonder
 * foutmelding een leeg veld naar Odoo schrijven. Zelfde regel als field_key bij
 * de OM-formulieren.
 */
export const CALENDLY_FIELDS = [
  ['event',                 'Soort gebeurtenis (invitee.created / invitee.canceled)'],
  ['event_uuid',            'Calendly-event-id (de sleutel waarop bijwerken matcht)'],
  ['event_name',            'Naam van het eventtype'],
  ['event_status',          'Status van de afspraak (active / canceled)'],
  ['event_type_uri',        'Calendly-eventtype (URI)'],
  ['event_type_uuid',       'Calendly-eventtype (id)'],
  ['start_time',            'Start (UTC)'],
  ['end_time',              'Einde (UTC)'],
  ['duration_minutes',      'Duur in minuten'],
  ['start_text',            'Start leesbaar (woensdag 30 september 2026 om 08:30)'],
  ['start_range_text',      'Start + einde leesbaar (… , 08:30 - 09:00)'],
  ['start_date_text',       'Startdatum leesbaar (30 september 2026)'],
  ['start_day_text',        'Dag van de week (woensdag)'],
  ['start_hour_text',       'Startuur (08:30)'],
  ['end_hour_text',         'Einduur (09:00)'],
  ['start_short_text',      'Start kort (30/09/2026 08:30)'],
  ['start_text_invitee',    'Start leesbaar in de tijdzone van de aanvrager'],
  ['booked_at_text',        'Moment van boeken, leesbaar'],
  ['canceled_at_text',      'Moment van annuleren, leesbaar'],
  ['name',                  'Naam van de aanvrager'],
  ['invitee_email',         'E-mail van de aanvrager'],
  ['invitee_first_name',    'Voornaam van de aanvrager'],
  ['invitee_last_name',     'Achternaam van de aanvrager'],
  ['invitee_uuid',          'Calendly-invitee-id'],
  ['invitee_status',        'Status van de aanvrager (active / canceled)'],
  ['invitee_timezone',      'Tijdzone van de aanvrager'],
  ['text_reminder_number',  'Telefoonnummer voor sms-herinnering'],
  ['host_name',             'Naam van de host'],
  ['host_email',            'E-mail van de host'],
  ['host_uri',              'Calendly-gebruiker van de host (URI)'],
  ['host_count',            'Aantal hosts op de afspraak'],
  ['guests',                'Extra genodigden (e-mails, komma-gescheiden)'],
  ['location_type',         'Soort locatie (google_conference, physical, ...)'],
  ['location_join_url',     'Deelnemen-link'],
  ['location_text',         'Locatie als tekst'],
  ['cancel_url',            'Annuleer-link'],
  ['reschedule_url',        'Verplaats-link'],
  ['canceled',              'Geannuleerd (true/false)'],
  ['cancel_reason',         'Reden van annulatie'],
  ['canceled_by',           'Wie annuleerde'],
  ['canceler_type',         'Wie annuleerde (host / invitee)'],
  ['canceled_at',           'Moment van annuleren'],
  ['rescheduled',           'Verplaatst (true/false) — bij annulatie wegens verplaatsing'],
  ['old_invitee_uuid',      'Vorige invitee-id (bij verplaatsing)'],
  ['new_invitee_uuid',      'Nieuwe invitee-id (bij verplaatsing)'],
  ['questions_html',        'Alle vragen en antwoorden als HTML'],
  ['questions_text',        'Alle vragen en antwoorden als platte tekst'],
  ['answers_text',          'Enkel de antwoorden, als platte tekst'],
  ['meeting_notes_plain',   'Notities bij de afspraak (tekst)'],
  ['meeting_notes_html',    'Notities bij de afspraak (HTML)'],
  ['utm_source',            'utm_source'],
  ['utm_medium',            'utm_medium'],
  ['utm_campaign',          'utm_campaign'],
  ['utm_content',           'utm_content'],
  ['utm_term',              'utm_term'],
  ['salesforce_uuid',       'salesforce_uuid (Calendly-trackingveld)'],
  ['booked_at',             'Moment van boeken'],
  ['created_by',            'Calendly-gebruiker die de gebeurtenis veroorzaakte'],
];

export const CALENDLY_FIELD_KEYS = CALENDLY_FIELDS.map(([key]) => key);

/** Laatste segment van een Calendly-URI. `.../scheduled_events/<uuid>` → `<uuid>`. */
export function uuidFromUri(uri) {
  const str = tekst(uri);
  if (!str) return '';
  const delen = str.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/');
  return delen[delen.length - 1] || '';
}

/**
 * Van een vraagtekst naar een veldsleutel: `q_waar_kunnen_we_je_mee_helpen`.
 *
 * Calendly geeft geen stabiel id mee bij een vraag — enkel de tekst en een
 * positie. De TEKST is de minst slechte sleutel: een vraag herschikken mag de
 * mapping niet omgooien, en dat zou met de positie wél gebeuren. Wie de vraag
 * herschrijft, verliest de mapping; daar is niets aan te doen zonder id, en het
 * is zichtbaar (het veld verschijnt gewoon onder een nieuwe naam).
 */
export function questionKey(question, positie) {
  const slug = tekst(question)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug ? `q_${slug}` : `q_${Number(positie) || 0}`;
}

/**
 * De volledige webhook-envelope omzetten naar platte veldsleutels.
 *
 * @param {object} envelope  wat Calendly POST'te, al geparsed
 * @returns {object} platte sleutel → tekstwaarde
 */
export function flattenCalendlyPayload(envelope) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const p = env.payload && typeof env.payload === 'object' ? env.payload : {};
  const se = p.scheduled_event && typeof p.scheduled_event === 'object' ? p.scheduled_event : {};
  const loc = se.location && typeof se.location === 'object' ? se.location : {};
  const tr = p.tracking && typeof p.tracking === 'object' ? p.tracking : {};
  // De annulatie staat op de invitee én op de afspraak. Bij een annulatie door
  // de host zijn ze gelijk; bij een invitee die zichzelf uitschrijft uit een
  // groepsafspraak staat er enkel iets op de invitee. Die van de invitee wint.
  const can = (p.cancellation && typeof p.cancellation === 'object')
    ? p.cancellation
    : (se.cancellation && typeof se.cancellation === 'object' ? se.cancellation : {});

  const memberships = Array.isArray(se.event_memberships) ? se.event_memberships : [];
  const host = memberships[0] && typeof memberships[0] === 'object' ? memberships[0] : {};
  const guests = Array.isArray(se.event_guests) ? se.event_guests : [];
  const qas = Array.isArray(p.questions_and_answers) ? p.questions_and_answers : [];

  const soort = tekst(env.event);
  const geannuleerd = soort === 'invitee.canceled'
    || tekst(p.status) === 'canceled'
    || tekst(se.status) === 'canceled';

  const plat = {
    event:                soort,
    booked_at:            tekst(p.created_at) || tekst(env.created_at),
    created_by:           tekst(env.created_by),

    event_uuid:           uuidFromUri(se.uri),
    event_name:           tekst(se.name),
    event_status:         tekst(se.status),
    event_type_uri:       tekst(se.event_type),
    event_type_uuid:      uuidFromUri(se.event_type),
    start_time:           tekst(se.start_time),
    end_time:             tekst(se.end_time),
    duration_minutes:     duurInMinuten(se.start_time, se.end_time),

    // `name` en niet `invitee_name`: de resolver partner_by_email leest bij het
    // aanmaken van een nieuw contact normalizedForm.name voor de naam. Heet dit
    // veld anders, dan krijgt elke nieuwe partner zijn e-mailadres als naam.
    name:                 tekst(p.name),
    invitee_email:        tekst(p.email),
    invitee_first_name:   tekst(p.first_name),
    invitee_last_name:    tekst(p.last_name),
    invitee_uuid:         uuidFromUri(p.uri),
    invitee_status:       tekst(p.status),
    invitee_timezone:     tekst(p.timezone),
    text_reminder_number: tekst(p.text_reminder_number),

    host_name:            tekst(host.user_name),
    host_email:           tekst(host.user_email),
    host_uri:             tekst(host.user),
    host_count:           String(memberships.length),
    guests:               guests.map((g) => tekst(g && g.email)).filter(Boolean).join(', '),

    location_type:        tekst(loc.type),
    location_join_url:    tekst(loc.join_url),
    location_text:        tekst(loc.location) || tekst(loc.text),

    cancel_url:           tekst(p.cancel_url),
    reschedule_url:       tekst(p.reschedule_url),

    canceled:             geannuleerd ? 'true' : 'false',
    cancel_reason:        tekst(can.reason),
    canceled_by:          tekst(can.canceled_by),
    canceler_type:        tekst(can.canceler_type),
    canceled_at:          tekst(can.created_at),

    rescheduled:          p.rescheduled === true ? 'true' : 'false',
    old_invitee_uuid:     uuidFromUri(p.old_invitee),
    new_invitee_uuid:     uuidFromUri(p.new_invitee),

    meeting_notes_plain:  tekst(se.meeting_notes_plain),
    meeting_notes_html:   tekst(se.meeting_notes_html),

    utm_source:           tekst(tr.utm_source),
    utm_medium:           tekst(tr.utm_medium),
    utm_campaign:         tekst(tr.utm_campaign),
    utm_content:          tekst(tr.utm_content),
    utm_term:             tekst(tr.utm_term),
    salesforce_uuid:      tekst(tr.salesforce_uuid),
  };

  // Leesbare datumvelden. Calendly levert uitsluitend ISO-tijdstippen in UTC
  // ("2026-09-30T06:30:00.000000Z"); die vorm hoort in een datumveld van Odoo
  // thuis en NERGENS anders. Zodra zo'n tijdstip in een tekst belandt -- de
  // naam van een lead, een chatter-notitie, een mail -- leest een mens er de
  // verkeerde dag en het verkeerde uur in: 06:30 UTC is hier 08:30. Daarom
  // staan de leesbare vormen hier als EIGEN velden, en niet als iets dat elke
  // stap opnieuw moet uitrekenen.
  //
  // De tijdzone is Europe/Brussels, want dit leest een collega. Enkel
  // start_text_invitee staat in de tijdzone van de aanvrager -- die is bedoeld
  // voor tekst die naar de aanvrager zelf gaat.
  const start  = datumDelen(plat.start_time);
  const eind   = datumDelen(plat.end_time);
  const geboekt = datumDelen(plat.booked_at);
  const geannuleerdOp = datumDelen(plat.canceled_at);
  const startInvitee = datumDelen(plat.start_time, plat.invitee_timezone);

  plat.start_text       = start ? start.volledig : '';
  plat.start_date_text  = start ? start.datum : '';
  plat.start_day_text   = start ? start.dag : '';
  plat.start_hour_text  = start ? start.uur : '';
  plat.end_hour_text    = eind ? eind.uur : '';
  plat.start_short_text = start ? `${start.kort} ${start.uur}` : '';
  plat.start_range_text = start
    ? (eind ? `${start.dag} ${start.datum}, ${start.uur} - ${eind.uur}` : start.volledig)
    : '';
  plat.start_text_invitee = startInvitee
    ? `${startInvitee.volledig}${plat.invitee_timezone ? ` (${plat.invitee_timezone})` : ''}`
    : '';
  plat.booked_at_text     = geboekt ? geboekt.volledig : '';
  plat.canceled_at_text   = geannuleerdOp ? geannuleerdOp.volledig : '';

  // Elke vraag apart mapbaar, plus drie samengestelde vormen. `questions_html`
  // is wat naar x_studio_cm_extra_info gaat -- dat veld is van het type html in
  // Odoo, dus platte tekst zou daar als één regel zonder witruimte belanden.
  const htmlDelen = [];
  const tekstDelen = [];
  const antwoordDelen = [];
  qas.forEach((qa, i) => {
    if (!qa || typeof qa !== 'object') return;
    const vraag = tekst(qa.question);
    const antwoord = tekst(qa.answer);
    const sleutel = questionKey(vraag, qa.position !== undefined ? qa.position : i);
    // Twee vragen kunnen naar dezelfde sleutel slugifyen ("Hoe gaat het?" en
    // "Hoe gaat het"). De eerste wint en de tweede krijgt een achtervoegsel --
    // stil overschrijven zou betekenen dat een antwoord verdwijnt.
    plat[Object.prototype.hasOwnProperty.call(plat, sleutel) ? `${sleutel}_${i}` : sleutel] = antwoord;
    if (!antwoord) return;
    htmlDelen.push(`<p><strong>${escapeHtml(vraag)}</strong><br/>${escapeHtml(antwoord).replace(/\n/g, '<br/>')}</p>`);
    tekstDelen.push(`${vraag}\n${antwoord}`);
    antwoordDelen.push(antwoord);
  });
  plat.questions_html = htmlDelen.join('');
  plat.questions_text = tekstDelen.join('\n\n');
  plat.answers_text = antwoordDelen.join('\n\n');

  return plat;
}

/**
 * De handtekening van Calendly nakijken.
 *
 * Header: `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`, waarbij v1 de
 * HMAC-SHA256 is over de tekst `"<t>.<ruwe body>"` met de signing key die wij
 * bij het aanmelden hebben meegegeven.
 *
 * LET OP: dit MOET op de ruwe body, niet op JSON.stringify(geparste body) --
 * die twee verschillen in sleutelvolgorde en witruimte en de handtekening
 * klopt dan nooit. De aanroeper leest dus eerst request.text().
 *
 * De ondergrens op de ouderdom is er tegen het opnieuw afspelen van een
 * onderschepte bezorging. Een échte herbezorging door Calendly is een nieuw
 * verzoek met een verse tijdstempel, dus die wordt hier niet geraakt.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function verifyCalendlySignature(header, rawBody, signingKey, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const ontleed = parseSignatureHeader(header);
  if (!ontleed) return { ok: false, reason: 'signature_header_malformed' };
  if (!signingKey) return { ok: false, reason: 'no_signing_key' };

  const leeftijd = Math.abs(Math.floor(now / 1000) - ontleed.t);
  if (!Number.isFinite(leeftijd) || leeftijd > toleranceSeconds) {
    return { ok: false, reason: 'signature_timestamp_stale' };
  }

  const sleutel = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const handtekening = await crypto.subtle.sign(
    'HMAC',
    sleutel,
    new TextEncoder().encode(`${ontleed.t}.${rawBody}`)
  );
  const verwacht = [...new Uint8Array(handtekening)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(verwacht, ontleed.v1.toLowerCase())
    ? { ok: true }
    : { ok: false, reason: 'signature_mismatch' };
}

export function parseSignatureHeader(header) {
  const str = tekst(header);
  if (!str) return null;
  let t = null;
  let v1 = null;
  for (const deel of str.split(',')) {
    const idx = deel.indexOf('=');
    if (idx === -1) continue;
    const naam = deel.slice(0, idx).trim();
    const waarde = deel.slice(idx + 1).trim();
    if (naam === 't') t = parseInt(waarde, 10);
    if (naam === 'v1') v1 = waarde;
  }
  if (!Number.isFinite(t) || !v1) return null;
  return { t, v1 };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

/**
 * Een ISO-tijdstip opdelen in leesbare stukken, in een bepaalde tijdzone.
 *
 * Geeft null terug bij een leeg of onleesbaar tijdstip -- de aanroepkant maakt
 * er dan een lege string van. Een half ingevulde datum ("om 08:30" zonder dag)
 * is erger dan geen datum: die lees je niet als ontbrekend maar als fout.
 *
 * @param {string} iso
 * @param {string} [tijdzone]  IANA-naam, standaard Europe/Brussels
 */
function datumDelen(iso, tijdzone) {
  const ms = Date.parse(tekst(iso));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  // Een tijdzone die Calendly meestuurt kan van alles zijn; een onbekende naam
  // laat Intl gooien. Dan valt hij terug op Brussel in plaats van de hele
  // indiening te laten falen op een sierlijk detail.
  let zone = tekst(tijdzone) || 'Europe/Brussels';
  const maak = (opties) => {
    try {
      return new Intl.DateTimeFormat('nl-BE', { timeZone: zone, ...opties }).format(d);
    } catch (_) {
      zone = 'Europe/Brussels';
      return new Intl.DateTimeFormat('nl-BE', { timeZone: zone, ...opties }).format(d);
    }
  };
  const dag   = maak({ weekday: 'long' });
  const datum = maak({ day: 'numeric', month: 'long', year: 'numeric' });
  const uur   = maak({ hour: '2-digit', minute: '2-digit', hour12: false });
  const kort  = maak({ day: '2-digit', month: '2-digit', year: 'numeric' });
  return { dag, datum, uur, kort, volledig: `${dag} ${datum} om ${uur}` };
}

function duurInMinuten(start, eind) {
  const s = Date.parse(tekst(start));
  const e = Date.parse(tekst(eind));
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return '';
  return String(Math.round((e - s) / 60000));
}

function tekst(waarde) {
  if (waarde === undefined || waarde === null) return '';
  if (typeof waarde === 'boolean') return waarde ? 'true' : 'false';
  if (typeof waarde === 'object') return '';
  return String(waarde).trim();
}

function escapeHtml(waarde) {
  return String(waarde)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
