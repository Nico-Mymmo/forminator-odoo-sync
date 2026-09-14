/**
 * Gmail → chatter — de synchronisatieronde.
 *
 * Draait op de 5-minutencron (zie src/index.js#scheduled). Per medewerker:
 * ophalen wat er nieuw is, beslissen of het ergens bij hoort, en het als
 * bericht op de lead zetten.
 *
 * OPT-IN PER MEDEWERKER, GEEN "IEDEREEN". `GMAIL_CHATTER_USERS` is een
 * kommagescheiden lijst adressen. Leeg of afwezig = deze sync doet NIETS. Dat
 * is bewust dezelfde keuze als `EVENTS_V2_MAIL_OWNER`: een deploy op zich mag
 * nooit plots iemands mailbox gaan uitlezen. Uitrollen doe je door er een
 * adres bij te zetten.
 *
 * DE BODY WORDT PAS OPGEHAALD NA EEN MATCH. De hele ronde draait op headers.
 * Alleen wanneer vaststaat dat de tegenpartij een bekende lead of contact is,
 * wordt de inhoud opgevraagd. Een privémail aan een vriend wordt dus wel
 * geteld, maar nooit gelezen.
 *
 * ER WORDT MET `mail.mt_note` GEPOST, NOOIT MET `mt_comment`. Een comment laat
 * Odoo de volgers notificeren — dat zou betekenen dat het opvangen van een mail
 * van de klant er een nieuwe mail NAAR de klant van maakt. Precies de lus die
 * in augustus 2024 een helpdeskticket 24 uur lang elk uur liet mailen.
 */

import { executeKw } from '../../../lib/odoo.js';
import {
  getProfile, listHistory, listRecentMessageIds,
  getMessageMetadata, getMessageFull, headerMap, extractBody
} from './gmail-read-client.js';
import {
  eigenDomeinen, parseAddresses, parseMessageIds,
  bepaalRichting, skipReden, zoekLeadOpAdres
} from './matching.js';
import { stripQuotedHtml, stripQuotedText, textToHtml } from './quote-strip.js';
import {
  getSyncState, saveSyncState, reedsGezien, zoekDraadMatch, bewaarBericht, ruimOp,
  getContactLink
} from './store.js';

/** Hoeveel berichten we per medewerker per ronde maximaal verwerken. */
const MAX_PER_RONDE = 60;

export function gmailChatterUsers(env) {
  return String(env?.GMAIL_CHATTER_USERS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Het bericht als notitie op de lead zetten.
 *
 * `author_id: false` in combinatie met `email_from` zorgt dat de chatter het
 * ECHTE afzenderadres toont in plaats van het API-account waarmee wij schrijven.
 */
export async function postNaarChatter(env, { model, res_id, html, subject, emailFrom, datum }) {
  const kop = subject ? `<div style="font-weight:600;margin-bottom:6px;">${escapeHtml(subject)}</div>` : '';
  return executeKw(env, {
    model,
    method: 'message_post',
    args: [[res_id]],
    kwargs: {
      body: kop + html,
      body_is_html: true,
      message_type: 'email',
      subtype_xmlid: 'mail.mt_note',
      subject: subject || false,
      email_from: emailFrom || false,
      author_id: false,
      ...(datum ? { date: datum } : {})
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Gmail geeft internalDate als milliseconden-string. Odoo wil 'YYYY-MM-DD HH:MM:SS' (UTC). */
export function odooDatum(internalDate) {
  const ms = Number(internalDate);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Eén medewerker synchroniseren.
 * @returns {Promise<Object>} telling voor de logregel
 */
export async function syncUser(env, userEmail, { dryRun = false } = {}) {
  const telling = { user: userEmail, bekeken: 0, geplaatst: 0, overgeslagen: 0, nietGeplaatst: 0, fouten: 0, rapport: [] };
  const onzeDomeinen = eigenDomeinen(env);

  // Bij een droogloop wordt er NIETS geschreven: geen chatterbericht, geen rij
  // in Supabase, en de cursor blijft staan. Zo levert een tweede droogloop
  // exact hetzelfde beeld op, en kan je hem zo vaak draaien als je wil voor je
  // hem echt loslaat.
  const bewaar = async (rij, extra = {}) => {
    telling.rapport.push({
      richting: rij.direction,
      tegenpartij: rij.counterpart_email,
      onderwerp: rij.subject,
      status: rij.status,
      reden: rij.skip_reason || null,
      lead: rij.odoo_res_id ? `${rij.odoo_model}/${rij.odoo_res_id}` : null,
      via: rij.match_method || null,
      ...extra
    });
    if (!dryRun) await bewaarBericht(env, rij);
  };

  const stand = await getSyncState(env, userEmail);
  let nieuweHistoryId = null;
  let ids = [];

  if (stand?.history_id) {
    const res = await listHistory(env, userEmail, stand.history_id);
    if (res.tooOld) {
      // Cursor verlopen: opnieuw beginnen bij de recente mail in plaats van
      // stilvallen. Wat er tussen uit valt is al oud nieuws.
      ids = await listRecentMessageIds(env, userEmail);
      nieuweHistoryId = (await getProfile(env, userEmail)).historyId;
    } else {
      ids = res.messageIds;
      nieuweHistoryId = res.historyId;
    }
  } else {
    // Eerste ronde: een kort venster, en meteen de cursor vastleggen.
    ids = await listRecentMessageIds(env, userEmail);
    nieuweHistoryId = (await getProfile(env, userEmail)).historyId;
  }

  const bekend = await reedsGezien(env, ids);
  const teDoen = ids.filter(id => !bekend.has(id)).slice(0, MAX_PER_RONDE);

  for (const id of teDoen) {
    try {
      telling.bekeken++;
      const meta = await getMessageMetadata(env, userEmail, id);
      const h = headerMap(meta);

      const richting = bepaalRichting(h, userEmail, onzeDomeinen);
      const rij = {
        gmail_message_id: id,
        user_email: userEmail,
        gmail_thread_id: meta.threadId || null,
        rfc822_message_id: (parseMessageIds(h['message-id'])[0]) || null,
        in_reply_to: (parseMessageIds(h['in-reply-to'])[0]) || null,
        direction: richting.direction,
        counterpart_email: richting.counterparts[0] || null,
        subject: h['subject'] || null,
        internal_date: meta.internalDate ? new Date(Number(meta.internalDate)).toISOString() : null,
        status: 'skipped',
        skip_reason: null,
        odoo_model: null, odoo_res_id: null, odoo_message_id: null,
        match_method: null, error_message: null
      };

      const reden = skipReden(h, richting);
      if (reden) {
        rij.skip_reason = reden;
        await bewaar(rij);
        telling.overgeslagen++;
        continue;
      }

      // Eerst de draad (exact), dan het adres (heuristiek).
      const draadIds = [
        ...parseMessageIds(h['in-reply-to']),
        ...parseMessageIds(h['references'])
      ];
      let match = await zoekDraadMatch(env, draadIds);

      // De UITZONDERINGEN gaan vóór de automatische opzoeking: als iemand
      // expliciet gezegd heeft waar de mail van dit adres hoort (of dat het
      // genegeerd moet worden), dan wint dat van wat wij zelf zouden vinden.
      let genegeerdContact = null;
      if (!match) {
        for (const adres of richting.counterparts) {
          const koppeling = await getContactLink(env, adres);
          if (!koppeling) continue;
          if (koppeling.action === 'ignore') { genegeerdContact = adres; break; }
          match = {
            model: koppeling.odoo_model || 'crm.lead',
            res_id: koppeling.odoo_res_id,
            method: 'contactkoppeling'
          };
          break;
        }
      }

      if (genegeerdContact) {
        rij.skip_reason = 'contact genegeerd';
        await bewaar(rij);
        telling.overgeslagen++;
        continue;
      }

      // Pas als er geen uitzondering is: het adres opzoeken bij een lead.
      if (!match) {
        for (const adres of richting.counterparts) {
          match = await zoekLeadOpAdres(env, adres);
          if (match) break;
        }
      }

      if (!match) {
        rij.status = 'unmatched';
        await bewaar(rij);
        telling.nietGeplaatst++;
        continue;
      }

      // Pas hier wordt de inhoud opgehaald.
      const vol = await getMessageFull(env, userEmail, id);
      const { html, text } = extractBody(vol);
      const schoon = html
        ? await stripQuotedHtml(html)
        : textToHtml(stripQuotedText(text || ''));

      if (!schoon.trim()) {
        rij.status = 'skipped';
        rij.skip_reason = 'lege inhoud na opkuisen';
        rij.odoo_model = match.model;
        rij.odoo_res_id = match.res_id;
        await bewaar(rij);
        telling.overgeslagen++;
        continue;
      }

      const bericht = dryRun ? null : await postNaarChatter(env, {
        model: match.model,
        res_id: match.res_id,
        html: schoon,
        subject: h['subject'],
        emailFrom: h['from'],
        datum: odooDatum(meta.internalDate)
      });

      rij.status = 'posted';
      rij.odoo_model = match.model;
      rij.odoo_res_id = match.res_id;
      rij.odoo_message_id = typeof bericht === 'number' ? bericht : null;
      rij.match_method = match.method;
      await bewaar(rij, { voorbeeld: schoon.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) });
      telling.geplaatst++;
    } catch (err) {
      telling.fouten++;
      console.error('[gmail-chatter] bericht', id, 'van', userEmail, 'mislukt:', err?.message);
      try {
        if (!dryRun) await bewaarBericht(env, {
          gmail_message_id: id,
          user_email: userEmail,
          direction: 'incoming',
          status: 'failed',
          error_message: String(err?.message || err).slice(0, 500)
        });
      } catch { /* de fout zelf bewaren mag de ronde niet stilleggen */ }
    }
  }

  if (!dryRun) await saveSyncState(env, userEmail, { historyId: nieuweHistoryId, extraSeen: telling.bekeken });
  return telling;
}

/**
 * De cron-ingang. Per medewerker geïsoleerd: één mislukte mailbox mag de rest
 * niet tegenhouden.
 */
export async function runGmailChatterSync(env, { dryRun = false } = {}) {
  const users = gmailChatterUsers(env);
  if (!users.length) return { skipped: 'GMAIL_CHATTER_USERS is leeg' };

  const resultaten = [];
  for (const user of users) {
    try {
      resultaten.push(await syncUser(env, user, { dryRun }));
    } catch (err) {
      console.error('[gmail-chatter] sync mislukt voor', user, '-', err?.message);
      resultaten.push({ user, fout: String(err?.message || err) });
      try {
        await saveSyncState(env, user, { historyId: null, error: String(err?.message || err).slice(0, 500) });
      } catch { /* niets */ }
    }
  }
  // Verlopen rijen weggooien. Bewust NA de ronde: een mislukte opruiming mag
  // nooit verhinderen dat er mail opgevangen wordt.
  let opgeruimd = {};
  try {
    opgeruimd = await ruimOp(env);
  } catch (err) {
    console.warn('[gmail-chatter] opruimen mislukt:', err?.message);
  }

  console.log('[gmail-chatter]', JSON.stringify({ resultaten, opgeruimd }));
  return { resultaten, opgeruimd };
}
