/**
 * Event Operations v2 — Postmark open/klik-tracking op de reminder
 *
 * ALLEEN de reminder krijgt deze headers (zie queueMails in mail-service.js):
 * bevestiging en recap blijven ongewijzigd, tracking daarop is onnodig.
 *
 * GEEN X-PM-Metadata-*, in tegenstelling tot forminator-sync-v2's
 * buildPostmarkHeaders (mail-step.js). Daar is dat nodig omdat Odoo's
 * message_id op een koppelingsstap willekeurig is; hier is de message_id al
 * volledig zelfbeschrijvend (`<evt{id}-{kind}-reg{id}@om.mymmo.com>`, zie
 * buildMessageId in mail-service.js), dus is er niets te herleiden dat de
 * message_id niet al vertelt.
 *
 * `mail.mail.headers` is een tekstveld dat Odoo met `safe_eval` als
 * Python-dict inleest -- zelfde mechanisme, zelfde format als
 * buildPostmarkHeaders in forminator-sync-v2/mail-step.js.
 */

/**
 * @returns {string} een Python-dict-literal string voor mail.mail.headers
 */
export function buildReminderTrackingHeaders() {
  return "{'X-PM-TrackOpens': 'true', 'X-PM-TrackLinks': 'HtmlAndText'}";
}
