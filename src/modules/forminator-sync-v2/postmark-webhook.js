/**
 * Koppelingen — Postmark-webhook: afgeleverd, geopend, geklikt, bounce.
 *
 * Postmark stuurt per gebeurtenis één JSON-object. Wij hangen het aan de
 * juiste indiening via de metadata die `mail-step.js` meestuurt:
 *
 *   X-PM-Metadata-om-int  koppeling-id
 *   X-PM-Metadata-om-tgt  stap-id
 *   X-PM-Metadata-om-sub  indiening-id
 *
 * WAAROM METADATA EN NIET DE ONTVANGER OF HET ONDERWERP. Dezelfde persoon kan
 * meerdere mails uit meerdere koppelingen krijgen, en een onderwerp is niet
 * uniek. Matchen op adres of tekst geeft dus stil de verkeerde toewijzing.
 * (En het was precies dit veld dat te lang was en de eerste mails deed
 * verdwijnen -- zie buildPostmarkHeaders in mail-step.js. Waarden blijven
 * onder 80 tekens.)
 *
 * ONBEKENDE GEBEURTENISSEN GEVEN 200, GEEN FOUT. Postmark schakelt een
 * webhook die blijft falen uit. Een event dat wij niet kunnen plaatsen is
 * geen reden om de hele stroom te verliezen, dus dat antwoorden we met
 * `{ ignored: true }` en verder niets.
 *
 * DE RUWE PAYLOAD WORDT BEWAARD. Velden die we vandaag niet gebruiken
 * (client, OS, geo, bouncetype) zijn morgen de reden dat we niet opnieuw
 * hoeven te instrumenteren.
 */

import { createMailEvent, getLatestSubmissionTargetResultByTarget } from './database.js';
import { searchRead, messagePost, write } from '../../lib/odoo.js';

/** Postmark's RecordType → wat wij in de kolom zetten. */
const SOORTEN = {
  delivery: 'delivery',
  open: 'open',
  click: 'click',
  bounce: 'bounce',
  spamcomplaint: 'spamcomplaint',
  subscriptionchange: 'subscriptionchange'
};

/**
 * De metadata uitlezen, ongeacht hoe Postmark de sleutels teruggeeft.
 *
 * Wij sturen `om-int`, maar een header kan onderweg van hoofdletter wisselen.
 * Vergelijken gebeurt daarom kleingeschreven.
 */
export function metaWaarde(metadata, sleutel) {
  if (!metadata || typeof metadata !== 'object') return null;
  const gezocht = String(sleutel).toLowerCase();
  for (const naam of Object.keys(metadata)) {
    if (String(naam).toLowerCase() === gezocht) {
      const waarde = String(metadata[naam] || '').trim();
      return waarde === '' ? null : waarde;
    }
  }
  return null;
}

/**
 * Het tijdstip. Postmark noemt dat veld per soort anders: `ReceivedAt` bij
 * open en klik, `DeliveredAt` bij aflevering, `BouncedAt` bij een bounce.
 * Ontbreekt het of is het onleesbaar, dan valt het terug op "nu" -- een
 * event zonder tijdstip weggooien zou erger zijn dan een minuut afwijking.
 */
export function tijdstip(payload) {
  const ruw = payload.ReceivedAt || payload.DeliveredAt || payload.BouncedAt || payload.ChangedAt || null;
  if (!ruw) return new Date().toISOString();
  const dt = new Date(ruw);
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

/** De ontvanger heet `Recipient` bij open/klik/aflevering en `Email` bij een bounce. */
export function ontvanger(payload) {
  const adres = payload.Recipient || payload.Email || payload.recipient || null;
  return adres ? String(adres).trim() : null;
}

/**
 * Eén Postmark-event verwerken.
 *
 * @param {Request} request
 * @param {Object} env
 * @param {Object} [opties]
 * @param {Function} [opties.schrijf] - de schrijfactie; injecteerbaar zodat de
 *        test het parsen kan controleren zonder database.
 * @returns {Promise<Response>}
 */
/**
 * ODOO-SYNC. Naast het wegschrijven in `fs_v2_mail_events` (voor de statistiek-
 * tab en de mailstatus in Indieningen) zetten we voor een aantal betekenisvolle
 * events ook een chatter-notitie op het Odoo-record waar de mail aan hing --
 * zodat een coach dat in de lead/contactfiche zelf ziet, zonder de OM te
 * moeten openen. Dat was het tweede deel van "info komt niet terug in Odoo".
 *
 * NIET bij elke heropening. Postmark stuurt een event bij elke keer dat
 * iemand de mail opent, en dat in de chatter zetten zou die snel vervuilen --
 * alleen de EERSTE open is chatter-waardig (`FirstOpen`).
 *
 * Het aanknopingspunt is niet de mail zelf maar de indiening: we zoeken via
 * `getLatestSubmissionTargetResultByTarget` de rij op die de `send_mail`-stap
 * voor deze (indiening, stap) achterliet -- die bevat `odoo_record_id`, het
 * `mail.mail`-id. Van daaruit lezen we `model`/`res_id` van dat mail.mail-
 * record (niet uit de metadata: die kent alleen koppeling/stap/indiening, geen
 * Odoo-record). Zonder `model`/`res_id` (mail hing aan geen record) is er
 * nergens een notitie te zetten, en dat is geen fout.
 *
 * Injecteerbaar via `opties.syncOdoo`, zelfde patroon als `opties.schrijf`:
 * de tests draaien zonder Odoo-verbinding en stubben dit dus af.
 *
 * STATUS OP HET MAIL.MAIL-RECORD ZELF (2026-09). `mail.mail.state` blijft na
 * verzending altijd op "sent" staan -- Odoo's eigen mailmotor kent geen
 * fijnere waarde dan outgoing/sent/received/exception/cancel, en "received"
 * wordt door de kernmodule zelf zelden gezet. Op uitdrukkelijk verzoek zetten
 * we bij een DELIVERY-event (Postmark bevestigt dat de mail bij de ontvanger
 * is aangekomen) dat bestaande `received`-statuswaarde -- geen nieuw veld,
 * geen Studio-wijziging nodig. Fijnere status (geopend/geklikt) hoort NIET in
 * dit veld: dat zou Odoo's eigen mailfilters ("te verzenden", retry-logica)
 * kunnen verwarren. Die granulariteit vangen we voorlopig elders op (de
 * mail-funnel-iconen in Indieningen, zie mailFunnelIcon in de front-end) --
 * zie de projectnotitie hierboven bij "nog steeds geen statusupdate in Odoo".
 * We slaan de state-write over bij `cancel` (een gearchiveerde/geannuleerde
 * mail) -- alle andere waarden mogen naar `received` overschreven worden.
 */
const ODOO_SYNC_LABELS = {
  delivery: 'Mail afgeleverd (Postmark)',
  open: 'Mail geopend',
  click: 'Link in mail geklikt',
  bounce: 'Mail kon niet afgeleverd worden (bounce)',
  spamcomplaint: 'Ontvanger markeerde de mail als spam'
};

/**
 * Is dit event chatter-waardig? Losgetrokken van syncMailEventToOdoo() zodat
 * de aanroepkant (handlePostmarkWebhook) deze beslissing kan nemen VOORDAT
 * opties.syncOdoo aangeroepen wordt -- anders test een geinjecteerde stub in
 * de tests deze guard niet, want dan draait de functie-body nooit.
 */
export function isOdooSyncWorthy(soort, payload) {
  if (!ODOO_SYNC_LABELS[soort]) return false; // subscriptionchange e.d.: geen chatter-ruis
  if (soort === 'open' && (!payload || payload.FirstOpen !== true)) return false; // heropening: geen ruis
  return true;
}

export async function syncMailEventToOdoo(env, { soort, payload, submissionId, targetId }, deps = {}) {
  // deps: enkel voor tests -- injecteert de drie Odoo-lib-functies zodat dit
  // pad ook zonder netwerk getest kan worden, zelfde reden als opties.syncOdoo
  // op handlePostmarkWebhook zelf.
  const _searchRead = deps.searchRead || searchRead;
  const _messagePost = deps.messagePost || messagePost;
  const _write = deps.write || write;
  const _getRow = deps.getLatestSubmissionTargetResultByTarget || getLatestSubmissionTargetResultByTarget;

  if (!isOdooSyncWorthy(soort, payload)) return; // vangnet, zie isOdooSyncWorthy()
  if (!submissionId || !targetId) return; // geen aanknopingspunt

  const targetRow = await _getRow(env, submissionId, targetId);
  const mailId = targetRow && Number(targetRow.odoo_record_id);
  if (!Number.isInteger(mailId) || mailId <= 0) return;

  const mails = await _searchRead(env, {
    model: 'mail.mail',
    domain: [['id', '=', mailId]],
    fields: ['model', 'res_id', 'state'],
    limit: 1
  });
  const mail = Array.isArray(mails) && mails.length ? mails[0] : null;
  if (!mail) return; // geen mail.mail-record (meer) met dit id

  // Statusveld: alleen bij aflevering, en nooit een gearchiveerde/geannuleerde
  // mail terugzetten. Zie de doc-comment hierboven voor de "waarom received".
  if (soort === 'delivery' && mail.state !== 'cancel' && mail.state !== 'received') {
    try {
      await _write(env, { model: 'mail.mail', ids: [mailId], values: { state: 'received' } });
    } catch (error) {
      console.warn('[postmark] state-update naar received mislukt:', error && error.message);
    }
  }

  if (!mail.model || !mail.res_id) return; // mail hangt aan geen record -- geen chatter mogelijk

  const adres = ontvanger(payload) || '-';
  const detail = soort === 'click' && payload.OriginalLink ? ` (${payload.OriginalLink})` : '';
  const body = `<p>${ODOO_SYNC_LABELS[soort]} \u2014 ${adres}${detail}</p>`;

  await _messagePost(env, { model: mail.model, id: mail.res_id, body });
}

export async function handlePostmarkWebhook(request, env, opties = {}) {
  const schrijf = opties.schrijf || createMailEvent;
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    // Ook hier 200: een onleesbare body opnieuw laten aanbieden helpt niemand.
    console.warn('[postmark] body niet te lezen:', error && error.message);
    return json({ ignored: true, reason: 'invalid_json' });
  }

  const soortRuw = String(payload.RecordType || '').toLowerCase();
  const soort = SOORTEN[soortRuw];
  if (!soort) {
    console.log('[postmark] onbekend RecordType:', payload.RecordType);
    return json({ ignored: true, reason: 'unknown_record_type' });
  }

  const submissionId = metaWaarde(payload.Metadata, 'om-sub');
  const integrationId = metaWaarde(payload.Metadata, 'om-int');
  const targetId = metaWaarde(payload.Metadata, 'om-tgt');

  // Zonder koppeling-id kan de rij nergens aan hangen (de kolom is NOT NULL).
  // Dat gebeurt bij elke mail die NIET uit een koppelingsstap komt -- Postmark
  // stuurt zijn webhook voor de hele stream.
  if (!integrationId) {
    return json({ ignored: true, reason: 'no_om_metadata' });
  }

  try {
    await schrijf(env, {
      integration_id: integrationId,
      target_id: targetId,
      submission_id: submissionId,
      event_type: soort,
      occurred_at: tijdstip(payload),
      recipient: ontvanger(payload),
      // Alleen bij een open zegt Postmark of het de eerste was.
      first_open: soort === 'open' ? payload.FirstOpen === true : null,
      payload
    });
  } catch (error) {
    // Een onbekende id (stap verwijderd, andere omgeving) is geen storing.
    console.warn('[postmark] wegschrijven mislukt:', error && error.message);
    return json({ ignored: true, reason: 'not_stored' });
  }

  if (isOdooSyncWorthy(soort, payload)) {
    const syncOdoo = opties.syncOdoo || syncMailEventToOdoo;
    try {
      await syncOdoo(env, { soort, payload, submissionId, targetId });
    } catch (error) {
      // Dit mag het antwoord aan Postmark niet breken -- de gebeurtenis staat
      // hoe dan ook al in fs_v2_mail_events, de chatter-notitie is een extra.
      console.warn('[postmark] Odoo-sync mislukt:', error && error.message);
    }
  }

  console.log('[postmark]', soort, '| indiening:', submissionId || '-', '| ontvanger:', ontvanger(payload) || '-');
  return json({ ok: true, event_type: soort });
}

/**
 * Het token controleren. Query-parameter, zoals de bestaande
 * forminator-webhook: Postmark kan geen sessie-cookie sturen.
 *
 * Zonder ingesteld secret is de route DICHT (403), niet open -- een
 * vergeten `wrangler secret put` mag geen publiek schrijfpad opleveren.
 */
export function isPostmarkWebhookAuthorized(request, env) {
  const secret = env && env.POSTMARK_WEBHOOK_SECRET;
  if (!secret) return false;
  const token = new URL(request.url).searchParams.get('token');
  return Boolean(token) && token === secret;
}

/** Hoort dit pad bij deze webhook? */
export function isPostmarkWebhookPath(pathname, method) {
  return pathname === '/forminator-v2/api/webhooks/postmark' && method === 'POST';
}
