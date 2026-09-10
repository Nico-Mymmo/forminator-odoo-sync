/**
 * Koppelingen — de `send_mail`-stap.
 *
 * Zet één gewone (niet-marketing) mail klaar in Odoo. De Worker rendert de
 * HTML; Odoo's eigen mailqueue (cron 3, elke minuut) verstuurt. Dit bestand
 * staat los van `worker-handler.js` omdat die al 1901 regels is -- zie de
 * bewerkprocedure in CLAUDE.md voor waarom dat telt.
 *
 * DE IDEMPOTENTIE ZIT OP HET MAIL-RECORD, NIET OP EEN VLAG
 * -------------------------------------------------------
 * Zelfde afspraak als in event-operations-v2: de sleutel is een afgeleide
 * `message_id`,
 *
 *   <kop{integrationId}-t{targetId}-sub{submissionId}@om.mymmo.com>
 *
 * en de volgorde is zoeken → bestaat er al een, dan overslaan → anders
 * `create`. Er is geen boolean die "verzonden" onthoudt, want die kan
 * afwijken van de werkelijkheid; het `mail.mail`-record IS het bewijs.
 * `auto_delete` staat daarom expliciet op `false`: de oude Odoo-templates
 * zetten hem op `true`, waardoor een verzonden mail zichzelf opruimde en er
 * achteraf niets te controleren viel.
 *
 * WAT HIER BEWUST GEBEURT EN NIET IN ODOO
 * --------------------------------------
 * Een marketing-automation-mail respecteert `mail.blacklist` en de opt-out
 * automatisch. Een rauw `mail.mail`-record doet dat NIET. De blacklist-check
 * hieronder is dus geen nettigheid maar de vervanging van iets dat we
 * opgeven door Odoo's marketingmodule niet te gebruiken.
 */

import { searchRead, create } from '../../lib/odoo.js';
import { renderPlainMailHtml, renderPlainSubject, nietPlatteOpmaak } from '../../lib/mail/render-plain.js';
import { renderMailHtml, renderSubject } from '../../lib/mail/render-blocks.js';

/** Puur een identifier, geen adres. Zelfde domein als events gebruikt. */
const MESSAGE_ID_DOMAIN = 'om.mymmo.com';

export class MailStepError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MailStepError';
    this.permanent = options.permanent !== false;
  }
}

// ─── Sleutel ─────────────────────────────────────────────────────────────────

/**
 * De idempotentiesleutel. Eén mail per (koppeling, stap, indiening).
 *
 * Twee `send_mail`-stappen in dezelfde koppeling krijgen een eigen sleutel
 * (`t{targetId}` verschilt), dus een tweede mail met een andere vertraging of
 * conditie is géén duplicaat.
 *
 * @returns {string}
 */
export function buildMailMessageId({ integrationId, targetId, submissionId }) {
  const kort = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  return `<kop${kort(integrationId)}-t${kort(targetId)}-sub${kort(submissionId)}@${MESSAGE_ID_DOMAIN}>`;
}

// ─── Tijd ────────────────────────────────────────────────────────────────────

/**
 * Alle ontvangers zitten in België. Hard, en niet als kolom: een tijdzone per
 * stap is een extra plek waar iemand iets fout kan zetten, en er is geen geval
 * waarin dat hier moet kunnen.
 */
const MAIL_TIJDZONE = 'Europe/Brussels';

/** Hoe laat is het op dat moment in Brussel, in minuten sinds middernacht? */
function minutenVanDeDag(datum) {
  const delen = new Intl.DateTimeFormat('nl-BE', {
    timeZone: MAIL_TIJDZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(datum);
  const uur = Number(delen.find((d) => d.type === 'hour')?.value || 0);
  const min = Number(delen.find((d) => d.type === 'minute')?.value || 0);
  return uur * 60 + min;
}

/**
 * Het verzendmoment binnen het venster schuiven.
 *
 * WAAROM DIT BESTAAT. De vertraging alleen is niet genoeg: wie om 01:30 een
 * aanvraag doet, krijgt met 90 minuten vertraging een "persoonlijke" mail om
 * 03:00. Dat bereikt het omgekeerde van wat de vertraging moet doen -- geen
 * mens typt dat dan, dus het leest juist als een machine.
 *
 * ALTIJD VOORUIT, NOOIT ACHTERUIT. Een mail vervroegen om hem in het venster
 * te krijgen zou de vertraging ongedaan maken, en dat is precies wat de
 * gebruiker instelde.
 *
 * `start === end` betekent: geen venster, altijd versturen.
 *
 * De lus loopt maximaal drie keer. Bij het verschuiven wordt er op de
 * UTC-tijdstempel geteld, dus een zomertijdovergang binnen de sprong kan er
 * een uur naast zitten; de volgende ronde corrigeert dat. Meer dan drie
 * rondes kan niet nodig zijn en beschermt tegen een oneindige lus bij een
 * onmogelijke instelling.
 *
 * @param {Date} moment @param {number} startMin @param {number} endMin @returns {Date}
 */
export function schuifNaarVenster(moment, startMin, endMin) {
  const start = Number(startMin);
  const eind = Number(endMin);
  if (!Number.isFinite(start) || !Number.isFinite(eind) || start === eind) return moment;
  if (start < 0 || start > 1440 || eind < 0 || eind > 1440) return moment;

  let dt = moment;
  for (let ronde = 0; ronde < 3; ronde += 1) {
    const nu = minutenVanDeDag(dt);
    let erbij = 0;
    if (nu < start) erbij = start - nu;                 // te vroeg op de dag
    else if (nu >= eind) erbij = 1440 - nu + start;     // te laat: morgen openen
    if (erbij === 0) return dt;
    dt = new Date(dt.getTime() + erbij * 60 * 1000);
  }
  return dt;
}

/**
 * `scheduled_date` voor Odoo: 'YYYY-MM-DD HH:MM:SS' in UTC.
 *
 * Bij 0 minuten vertraging EN geen venster geven we GEEN scheduled_date terug
 * (null): een leeg veld betekent voor Odoo "meteen". Staat er wel een venster
 * en valt "nu" erbuiten, dan krijgt ook een mail zonder vertraging een moment
 * mee -- anders zou de vertraging het venster kunnen omzeilen.
 *
 * @param {number} delayMinutes
 * @param {Date} [now]
 * @param {{startMin?: number, endMin?: number}} [venster]
 * @returns {string|null}
 */
export function computeScheduledDate(delayMinutes, now = new Date(), venster = {}) {
  const minuten = Number(delayMinutes);
  const vertraging = Number.isFinite(minuten) && minuten > 0 ? minuten : 0;
  const basis = new Date(now.getTime() + vertraging * 60 * 1000);
  const inVenster = schuifNaarVenster(basis, venster.startMin, venster.endMin);

  // Niets verschoven en geen vertraging: laat het veld leeg.
  if (vertraging === 0 && inVenster.getTime() === basis.getTime()) return null;
  return inVenster.toISOString().slice(0, 19).replace('T', ' ');
}

// ─── Headers voor Postmark ───────────────────────────────────────────────────

/** Postmark: metadatawaarden mogen maximaal 80 tekens zijn (naam max 20, max 10 velden). */
const PM_METADATA_MAX = 80;

/**
 * `mail.mail.headers` is een tekstveld dat Odoo met `safe_eval` als Python-dict
 * inleest. We bouwen die string dus zelf, en uitsluitend uit waarden die we
 * hebben gevalideerd -- een aanhalingsteken in een waarde zou de eval breken.
 *
 * GEEN `X-PM-Message-Stream`: de stream zit in het SMTP-token van
 * ir.mail_server 5 (PM-T-outbound-contact-...). Een header die iets anders
 * beweert dan het token is op zijn best overbodig.
 *
 * DRIE APARTE METADATAVELDEN, GEEN SAMENGESTELDE STRING.
 * -----------------------------------------------------
 * Dit stond eerst als één veld `om-mail` met de drie UUID's aan elkaar
 * geplakt: 36 + 1 + 36 + 1 + 36 = 110 tekens. Postmark staat 80 toe. Het
 * gevolg was het vervelendste soort fout: Odoo meldde `state: 'sent'` zonder
 * `failure_reason` -- de SMTP-overdracht slaagde dus -- en het bericht was
 * daarna in Postmark nergens te vinden (mail 95438, 2026-09-08). Er is geen
 * foutmelding waar je op kan zoeken; het bericht is er alleen niet.
 *
 * Eén UUID per veld is 36 tekens en dus ruim binnen de grens. `slice()`
 * hieronder is een vangnet, geen normale werking: een waarde die tegen de 80
 * aanloopt is een teken dat er iets anders in gaat dan een id.
 *
 * @returns {string|null} null als er niets te zetten valt
 */
export function buildPostmarkHeaders({ trackOpens, integrationId, targetId, submissionId }) {
  const paren = [];
  if (trackOpens) paren.push(['X-PM-TrackOpens', 'true']);

  const veilig = (v) => String(v || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, PM_METADATA_MAX);
  const meta = [
    ['om-int', veilig(integrationId)],
    ['om-tgt', veilig(targetId)],
    ['om-sub', veilig(submissionId)]
  ];
  for (const [naam, waarde] of meta) {
    if (waarde !== '') paren.push(['X-PM-Metadata-' + naam, waarde]);
  }

  if (paren.length === 0) return null;
  return '{' + paren.map(([k, v]) => `'${k}': '${v}'`).join(', ') + '}';
}

// ─── Ontvanger, afzender, blacklist ──────────────────────────────────────────

/** Heel losse e-mailcontrole: genoeg om onzin tegen te houden, niet om te keuren. */
export function lijktOpEmail(waarde) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(waarde || '').trim());
}

/**
 * Meerdere velden van één record lezen.
 *
 * `readRecordField` in odoo-client.js kan er maar één, en voor een mail hebben
 * we minstens e-mail plus eigenaar nodig -- twee losse calls voor hetzelfde
 * record is zonde van een RPC-ronde.
 */
export async function readRecordFields(env, { model, recordId, fields }) {
  const rows = await searchRead(env, {
    model,
    domain: [['id', '=', recordId]],
    fields,
    limit: 1
  });
  return rows && rows.length ? rows[0] : null;
}

/** Many2one komt als [id, naam] terug; wij willen meestal alleen het id. */
function m2oId(waarde) {
  return Array.isArray(waarde) ? (waarde[0] || null) : (waarde || null);
}

/**
 * Staat dit adres op de blacklist van Odoo?
 *
 * `mail.blacklist` is de lijst die de marketingmodule zelf respecteert. We
 * lezen hem hier expliciet, want een rauw `mail.mail`-record slaat hem over.
 * Alleen actieve rijen tellen: een gearchiveerde blacklist-rij is een
 * ingetrokken uitschrijving.
 *
 * @returns {Promise<boolean>}
 */
export async function isBlacklisted(env, email) {
  const adres = String(email || '').trim().toLowerCase();
  if (adres === '') return false;
  const rows = await searchRead(env, {
    model: 'mail.blacklist',
    domain: [['email', '=', adres], ['active', '=', true]],
    fields: ['id'],
    limit: 1
  });
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Wie stuurt deze mail?
 *
 * `record_user` leest de eigenaar (`user_id`) van het doelrecord -- bij een
 * lead is dat de toegewezen coach. De toewijzing gebeurt bij het AANMAKEN van
 * de lead, dus die staat er al op het moment dat deze stap loopt (beslissing
 * 2026-09-08); een cronronde om later opnieuw te kijken is daarom niet nodig.
 *
 * De terugvalketen is er voor het geval dat toch mislukt: eigenaar → vast
 * adres uit de stapconfiguratie. Nooit leeg: een mail zonder afzender is een
 * mail waarvan niemand weet wie hem stuurde.
 *
 * @returns {Promise<{ name: string, email: string, jobTitle: string }>}
 */
export async function resolveSender(env, { target, model, recordId }) {
  const vast = {
    name: String(target.mail_from_name || '').trim(),
    email: String(target.mail_from_email || '').trim(),
    jobTitle: ''
  };

  if (String(target.mail_from_source || 'record_user') !== 'record_user') return vast;
  if (!model || !recordId) return vast;

  const record = await readRecordFields(env, { model, recordId, fields: ['user_id'] });
  const userId = m2oId(record && record.user_id);
  if (!userId) return vast;

  const user = await readRecordFields(env, {
    model: 'res.users',
    recordId: userId,
    fields: ['name', 'email', 'job_title']
  });
  if (!user || !lijktOpEmail(user.email)) return vast;

  return {
    name: String(user.name || vast.name || '').trim(),
    email: String(user.email).trim(),
    jobTitle: String(user.job_title || '').trim()
  };
}

// ─── Placeholders ────────────────────────────────────────────────────────────

/**
 * De placeholdercontext van een koppelingsmail.
 *
 * Bewust NIET dezelfde als die van een event: daar bestaan `{{event.title}}`
 * en `{{host.name}}`, hier bestaan de VELDEN VAN HET FORMULIER. Vandaar
 * `form.<veld-id>`; de editor haalt de leesbare namen uit de veld-meta die de
 * koppeling toch al bewaart, zodat een gebruiker "Voornaam" ziet staan en
 * geen `{{form.text-1}}`.
 *
 * @returns {Object}
 */
export function buildKoppelingContext({ form = {}, ontvanger = {}, afzender = {}, now = new Date() }) {
  const naam = String(ontvanger.name || '').trim();
  const voornaam = naam === '' ? '' : naam.split(/\s+/)[0];
  return {
    form: { ...form },
    contact: {
      name: naam,
      first_name: voornaam,
      email: String(ontvanger.email || '').trim()
    },
    sender: {
      name: String(afzender.name || '').trim(),
      email: String(afzender.email || '').trim(),
      job_title: String(afzender.jobTitle || '').trim()
    },
    now: { year: String(now.getFullYear()) }
  };
}

// ─── De stap ─────────────────────────────────────────────────────────────────

/**
 * Eén `send_mail`-stap uitvoeren.
 *
 * Geeft altijd een object terug in plaats van te gooien bij een
 * VOORZIENE reden om niets te doen (geen adres, blacklist, al klaargezet):
 * dat is geen fout maar informatie die in het indieningsspoor hoort.
 *
 * @param {Object} env
 * @param {Object} args
 * @param {Object} args.target        - rij uit fs_v2_targets
 * @param {Object} args.integration   - rij uit fs_v2_integrations
 * @param {string} args.submissionId
 * @param {Object} args.form          - genormaliseerde formulierwaarden
 * @param {Function} args.lookupForm  - (form, sleutel) => waarde, met fuzzy matching
 * @param {Object} args.contextObject - uitvoer van eerdere stappen (step.N.record_id)
 * @param {Date}   [args.now]
 * @returns {Promise<{action: string, recordId: number|null, skipped: string|null, detail: string|null}>}
 */
export async function runSendMailStep(env, {
  target, integration, submissionId, form, lookupForm, contextObject, now = new Date()
}) {
  // ── 1. Waar hangt de mail aan? ─────────────────────────────────────────────
  const model = String(target.odoo_model || '').trim() || null;
  let recordId = null;
  if (target.mail_res_id_source) {
    const ruw = contextObject ? contextObject[target.mail_res_id_source] : null;
    const n = Number(ruw);
    recordId = Number.isInteger(n) && n > 0 ? n : null;
    if (!recordId) {
      throw new MailStepError(
        `send_mail: vorige stap gaf geen geldig record-ID (bron: "${target.mail_res_id_source}", waarde: "${String(ruw)}").`
      );
    }
  }

  // ── 2. Ontvanger ───────────────────────────────────────────────────────────
  const bron = String(target.mail_recipient_source || '').trim();
  if (bron === '') throw new MailStepError('send_mail: geen mail_recipient_source ingesteld.');

  let adres = '';
  if (bron.startsWith('step.') || (contextObject && contextObject[bron] !== undefined)) {
    adres = String((contextObject && contextObject[bron]) || '').trim();
  } else {
    const sleutel = bron.startsWith('field.') ? bron.slice('field.'.length) : bron;
    adres = String(lookupForm(form, sleutel) || '').trim();
  }
  // Laatste kans: het record zelf kent zijn e-mailadres.
  if (!lijktOpEmail(adres) && model && recordId) {
    const veld = model === 'crm.lead' ? 'email_from' : 'email';
    const rec = await readRecordFields(env, { model, recordId, fields: [veld] });
    if (rec && lijktOpEmail(rec[veld])) adres = String(rec[veld]).trim();
  }
  if (!lijktOpEmail(adres)) {
    return { action: 'mail_skipped', recordId: null, skipped: 'no_recipient',
             detail: `Geen geldig e-mailadres via "${bron}".` };
  }

  // ── 3. Blacklist ───────────────────────────────────────────────────────────
  if (target.mail_respect_blacklist !== false && await isBlacklisted(env, adres)) {
    return { action: 'mail_skipped', recordId: null, skipped: 'blacklisted',
             detail: `${adres} staat op mail.blacklist.` };
  }

  // ── 4. Al klaargezet? ──────────────────────────────────────────────────────
  const messageId = buildMailMessageId({
    integrationId: integration && integration.id,
    targetId: target.id,
    submissionId
  });
  const bestaand = await searchRead(env, {
    model: 'mail.mail',
    domain: [['message_id', '=', messageId]],
    fields: ['id', 'state'],
    limit: 1
  });
  if (Array.isArray(bestaand) && bestaand.length > 0) {
    return { action: 'mail_already_queued', recordId: bestaand[0].id, skipped: 'mail_already_queued',
             detail: `mail.mail ${bestaand[0].id} bestaat al (state: ${bestaand[0].state}).` };
  }

  // ── 5. Afzender en inhoud ──────────────────────────────────────────────────
  const afzender = await resolveSender(env, { target, model, recordId });
  if (!lijktOpEmail(afzender.email)) {
    throw new MailStepError('send_mail: geen afzenderadres. Zet mail_from_email als terugval.');
  }

  const context = buildKoppelingContext({
    form,
    ontvanger: { email: adres, name: String(lookupForm(form, 'name') || '').trim() },
    afzender,
    now
  });

  const layout = String(target.mail_layout || 'plain');
  let bodyHtml = '';
  let subject = '';
  if (layout === 'blocks') {
    const blocks = Array.isArray(target.mail_blocks) ? target.mail_blocks : [];
    bodyHtml = renderMailHtml({ blocks, context });
    subject = renderSubject(target.mail_subject_template, context);
  } else {
    const ruw = String(target.mail_body_html || '');
    const vuil = nietPlatteOpmaak(ruw);
    if (vuil.length) {
      throw new MailStepError(
        `send_mail: de tekst bevat opmaak die niet in een platte mail hoort (${vuil.join(', ')}). ` +
        'Haal die weg, of zet de stap op layout "blocks".'
      );
    }
    bodyHtml = renderPlainMailHtml({ html: ruw, context });
    subject = renderPlainSubject(target.mail_subject_template, context);
  }
  if (subject.trim() === '') throw new MailStepError('send_mail: het onderwerp is leeg.');
  if (bodyHtml.trim() === '') throw new MailStepError('send_mail: de mailtekst is leeg.');

  // ── 6. Klaarzetten ─────────────────────────────────────────────────────────
  const values = {
    subject,
    body_html: bodyHtml,
    email_to: adres,
    email_from: afzender.name ? `"${afzender.name.replace(/"/g, '')}" <${afzender.email}>` : afzender.email,
    reply_to: String(target.mail_reply_to || '').trim() || afzender.email,
    message_id: messageId,
    // Het bewijs moet blijven staan; Odoo's templates zetten dit op true.
    auto_delete: false,
    state: 'outgoing'
  };
  const scheduled = computeScheduledDate(target.mail_delay_minutes, now, {
    startMin: target.mail_window_start_min,
    endMin: target.mail_window_end_min
  });
  if (scheduled) values.scheduled_date = scheduled;
  if (target.mail_server_id) values.mail_server_id = Number(target.mail_server_id);
  if (model && recordId) {
    values.model = model;
    values.res_id = recordId;
  }
  const headers = buildPostmarkHeaders({
    trackOpens: target.mail_track_opens !== false,
    integrationId: integration && integration.id,
    targetId: target.id,
    submissionId
  });
  if (headers) values.headers = headers;

  const mailId = await create(env, { model: 'mail.mail', values });
  return {
    action: scheduled ? 'mail_scheduled' : 'mail_queued',
    recordId: mailId,
    skipped: null,
    detail: scheduled ? `Klaargezet voor ${scheduled} UTC.` : 'Klaargezet om meteen te vertrekken.'
  };
}
