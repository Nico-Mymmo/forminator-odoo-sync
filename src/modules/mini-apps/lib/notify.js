/**
 * Mini-Apps — Notify (gestuurde e-mail naar gebruikers)
 *
 * Laat een mini-app EEN mail sturen naar zichzelf ("self") of naar een
 * specifieke collega, aangeroepen via window.platform.notify(...) in de
 * iframe-shim (zie public/mini-apps.js) en POST /api/apps/:id/notify in
 * routes.js.
 *
 * Guardrails (dit is de kern van dit bestand -- niet enkel een dun laagje
 * rond gmail-send-client.js):
 *  - De ontvanger wordt ALTIJD server-side opgezocht via een user-id in de
 *    `users`-tabel (self, of een actieve collega) -- een mini-app kan NOOIT
 *    een vrij e-mailadres opgeven. Dit is de belangrijkste inperking: zonder
 *    dit zou elke mini-app een spam-/phishingvector namens de organisatie
 *    kunnen worden.
 *  - Onderwerp/bericht hebben een lengte-cap.
 *  - Rate-limits: max MAX_PER_APP_PER_DAY meldingen per app per dag, en max
 *    MAX_PER_RECIPIENT_PER_APP_PER_DAY per (app, ontvanger) per dag -- dit is
 *    dus geen bulk-mailtool.
 *  - Elke mail krijgt een automatische voettekst met de appnaam en wie de
 *    actie triggerde -- nooit anoniem/onherleidbaar voor de ontvanger.
 *  - Volledige audit-log in mini_app_notifications, ook bij een gefaalde send.
 *  - Elke gebruiker kan zich per app uitschrijven van mails (zie
 *    isSubscribed/setSubscription hieronder, tabel mini_app_mail_optouts).
 *    Geldt uniform, ook voor 'self' -- notifyUser() slaat de send dan
 *    gewoon over (status 'skipped', geen fout, geen retry-signaal).
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { sendEmail } from './gmail-send-client.js';

// ─── HTML-opmaak ─────────────────────────────────────────────────────────────
// Tabel-layout + inline styles (geen <style>-blok, geen externe CSS) -- de
// enige manier om er in Gmail/Outlook/etc. betrouwbaar hetzelfde te laten
// uitzien; klassen of losse stylesheets worden door veel mailclients
// genegeerd/gestript. Vaste kleuren (geen daisyUI-thema) -- een mail kan geen
// thema-voorkeur van de ontvanger volgen.

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Bouwt de opgemaakte HTML-versie van een notify-mail: header-blok (app-naam),
 * content-blok (onderwerp + bericht) en footer-blok (dezelfde
 * herleidbaarheids-tekst als de platte-tekst-versie). subject/message/
 * appTitle/senderName komen (deels) uit door de mini-app/gebruiker
 * aangeleverde tekst -- ALTIJD escapen, nooit ongefilterd in de HTML plakken.
 */
function buildNotifyHtml({ appTitle, subject, message, senderName, appLink }) {
  const safeAppTitle = escapeHtml(appTitle);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message);
  const safeSenderName = escapeHtml(senderName);
  const safeAppLink = escapeHtml(appLink);

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#4f46e5;padding:24px 28px;">
                <div style="font-size:12px;color:#c7d2fe;letter-spacing:0.6px;text-transform:uppercase;font-weight:600;">
                  Operations Manager &middot; Mini-app
                </div>
                <div style="font-size:20px;color:#ffffff;font-weight:700;padding-top:4px;">
                  ${safeAppTitle}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:17px;color:#0f172a;font-weight:600;margin:0 0 12px;line-height:1.4;">
                  ${safeSubject}
                </div>
                <div style="font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap;">${safeMessage}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <a href="${safeAppLink}" style="display:inline-block;background-color:#eef2ff;color:#4338ca;font-size:13px;font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;">
                  Open ${safeAppTitle} &rarr;
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;">
                <p style="font-size:12px;line-height:1.5;color:#94a3b8;margin:0;">
                  Automatisch bericht van de mini-app <strong style="color:#64748b;">${safeAppTitle}</strong>,
                  verstuurd via de Operations Manager op initiatief van ${safeSenderName}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_PER_APP_PER_DAY = 50;
export const MAX_PER_RECIPIENT_PER_APP_PER_DAY = 5;

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function notifyError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Zoekt de echte ontvanger op -- 'self' of een user-id, NOOIT een los
 * e-mailadres van de client. Faalt hard op een onbekende/inactieve user-id.
 */
async function resolveRecipient(env, sender, to) {
  if (to === 'self') {
    return { id: sender.id, email: sender.email, full_name: sender.username || sender.email };
  }

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('id, email, username, is_active')
    .eq('id', to)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw notifyError('Onbekende of inactieve ontvanger.', 'INVALID_RECIPIENT');
  }
  return { id: data.id, email: data.email, full_name: data.username || data.email };
}

async function checkRateLimit(env, appId, recipientUserId) {
  const supabase = getSupabaseClient(env);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count: appCount, error: appErr } = await supabase
    .from('mini_app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('mini_app_id', appId)
    .gte('created_at', since);
  if (appErr) throw new Error(appErr.message);
  if ((appCount || 0) >= MAX_PER_APP_PER_DAY) {
    throw notifyError(`Deze app heeft de daglimiet van ${MAX_PER_APP_PER_DAY} meldingen bereikt.`, 'RATE_LIMIT_APP');
  }

  const { count: recipientCount, error: recErr } = await supabase
    .from('mini_app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('mini_app_id', appId)
    .eq('recipient_user_id', recipientUserId)
    .gte('created_at', since);
  if (recErr) throw new Error(recErr.message);
  if ((recipientCount || 0) >= MAX_PER_RECIPIENT_PER_APP_PER_DAY) {
    throw notifyError(
      `Deze app heeft de daglimiet van ${MAX_PER_RECIPIENT_PER_APP_PER_DAY} meldingen naar deze ontvanger bereikt.`,
      'RATE_LIMIT_RECIPIENT'
    );
  }
}

async function logNotification(env, { appId, senderUserId, recipientUserId, recipientEmail, subject, status, errorMessage }) {
  const supabase = getSupabaseClient(env);
  const { error } = await supabase.from('mini_app_notifications').insert({
    mini_app_id: appId,
    sender_user_id: senderUserId,
    recipient_user_id: recipientUserId,
    recipient_email: recipientEmail,
    subject,
    status,
    error_message: errorMessage || null
  });
  if (error) {
    // Loggen mag nooit de eigenlijke send-flow blokkeren -- enkel console.error.
    console.error('[mini-apps] notify audit-log insert failed:', error.message);
  }
}

/**
 * Is deze gebruiker ingeschreven voor mails van deze app? (default: ja --
 * enkel een expliciete opt-out-rij zet dit op false.)
 */
export async function isSubscribed(env, appId, userId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('mini_app_mail_optouts')
    .select('id')
    .eq('mini_app_id', appId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !data;
}

/**
 * Schrijft de huidige gebruiker in/uit voor mails van deze app.
 */
export async function setSubscription(env, appId, userId, subscribed) {
  const supabase = getSupabaseClient(env);
  if (subscribed) {
    const { error } = await supabase
      .from('mini_app_mail_optouts')
      .delete()
      .eq('mini_app_id', appId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('mini_app_mail_optouts')
      .upsert({ mini_app_id: appId, user_id: userId }, { onConflict: 'user_id,mini_app_id' });
    if (error) throw new Error(error.message);
  }
}

/**
 * @param {Object} env
 * @param {Object} app     Volledige mini_apps-rij (voor app.title in de voettekst)
 * @param {Object} sender  Huidige gebruiker (context.user) -- degene die de actie triggert
 * @param {string} to      'self' of een user-id uit de users-tabel
 * @param {string} subject
 * @param {string} message
 * @returns {Promise<{ recipientEmail: string }>}
 */
export async function notifyUser(env, app, sender, to, subject, message) {
  if (typeof subject !== 'string' || !subject.trim() || subject.length > MAX_SUBJECT_LENGTH) {
    throw notifyError(`Onderwerp is verplicht en max ${MAX_SUBJECT_LENGTH} tekens.`, 'INVALID_SUBJECT');
  }
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    throw notifyError(`Bericht is verplicht en max ${MAX_MESSAGE_LENGTH} tekens.`, 'INVALID_MESSAGE');
  }
  if (typeof to !== 'string' || !to.trim()) {
    throw notifyError(`to ('self' of een user-id) is verplicht.`, 'INVALID_RECIPIENT');
  }

  const recipient = await resolveRecipient(env, sender, to.trim());

  const subscribed = await isSubscribed(env, app.id, recipient.id);
  if (!subscribed) {
    await logNotification(env, {
      appId: app.id,
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      subject: `[Mini-app: ${app.title}] ${subject.trim()}`,
      status: 'skipped',
      errorMessage: 'Ontvanger is uitgeschreven voor mails van deze app.'
    });
    return { recipientEmail: recipient.email, skipped: true };
  }

  await checkRateLimit(env, app.id, recipient.id);

  const senderName = sender.username || sender.email;
  const appLink = `${env.APP_BASE_URL}/mini-apps?app=${app.id}`;
  const fullSubject = `[Mini-app: ${app.title}] ${subject.trim()}`;
  const fullBody =
    `${message.trim()}\n\n` +
    `---\n` +
    `Dit is een automatisch bericht van de mini-app "${app.title}", ` +
    `verstuurd via de Operations Manager op initiatief van ${senderName}.\n` +
    `Open de app: ${appLink}`;
  const htmlBody = buildNotifyHtml({
    appTitle: app.title,
    subject: subject.trim(),
    message: message.trim(),
    senderName,
    appLink
  });

  try {
    await sendEmail(env, recipient.email, fullSubject, fullBody, htmlBody);
  } catch (err) {
    await logNotification(env, {
      appId: app.id,
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      subject: fullSubject,
      status: 'failed',
      errorMessage: err.message
    });
    throw err;
  }

  await logNotification(env, {
    appId: app.id,
    senderUserId: sender.id,
    recipientUserId: recipient.id,
    recipientEmail: recipient.email,
    subject: fullSubject,
    status: 'sent'
  });

  return { recipientEmail: recipient.email };
}
