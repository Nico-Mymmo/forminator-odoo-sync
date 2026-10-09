/**
 * Nieuwsbrieven -- naar Odoo: de testmail, de echte mailing, de cijfers.
 *
 * Odoo blijft de motor: mailing.mailing op mailing.list, via ir.mail_server 4
 * (Postmark broadcast). Lijsten, uitschrijvingen, blacklist, bounces en de
 * uitschrijflink per ontvanger regelt Odoo al; dat zelf nabouwen per mail.mail
 * zou een tweede motor zijn.
 *
 * VEILIGHEID, in twee lagen:
 *   1. Zolang NEWSLETTER_SEND_MODE niet 'live' is, bestaat enkel verstuurTest().
 *   2. Een test gaat naar een EIGEN lijst ("OM nieuwsbrief - testadressen") die
 *      enkel de adressen uit NEWSLETTER_TEST_EMAILS bevat. Staat er iemand anders
 *      op die lijst, dan wordt die eraf gehaald; lukt dat niet, dan vertrekt er
 *      niets.
 *
 * Een verstuurde mailing kan in Odoo niet opnieuw: elke test is een nieuwe
 * mailing.mailing, met "[OM-test]" in de naam. Bewerk die NOOIT in de editor
 * van Odoo -- die herschrijft body_arch.
 */

import { executeKw, searchRead, create, write } from '../../../lib/odoo.js';
import {
  TOKEN_FIELD, BROADCAST_MAIL_SERVER_ID, TEST_LIST_NAME, LOG_PREFIX, sendMode, testEmails,
} from './constants.js';
import { tokenVoor } from './answers.js';
import { NewsletterError } from './store.js';

let veldMemo = { at: 0, bestaat: null };

/** Bestaat het Studio-veld x_studio_om_token op mailing.contact? */
export async function tokenVeldBestaat(env) {
  if (veldMemo.bestaat !== null && Date.now() - veldMemo.at < 5 * 60 * 1000) return veldMemo.bestaat;
  try {
    const velden = await executeKw(env, {
      model: 'mailing.contact', method: 'fields_get', args: [[TOKEN_FIELD]], kwargs: { attributes: ['type'] },
    });
    veldMemo = { at: Date.now(), bestaat: Boolean(velden && velden[TOKEN_FIELD]) };
  } catch (error) {
    console.warn(`${LOG_PREFIX} fields_get mislukt:`, error?.message);
    veldMemo = { at: Date.now(), bestaat: false };
  }
  return veldMemo.bestaat;
}

async function modelId(env, model) {
  const rijen = await searchRead(env, { model: 'ir.model', domain: [['model', '=', model]], fields: ['id'], limit: 1 });
  if (!rijen?.[0]) throw new Error(`ir.model ${model} niet gevonden`);
  return rijen[0].id;
}

function odooTijd(date) {
  return new Date(date).toISOString().replace('T', ' ').slice(0, 19);
}

function afzender(series) {
  const naam = String(series.from_name || '').replace(/"/g, '');
  return naam ? `"${naam}" <${series.from_email}>` : series.from_email;
}

// ─── De testlijst ───────────────────────────────────────────────────────────

/**
 * De testlijst met EXACT de testadressen. Geeft de lijst-id en de contacten.
 */
export async function zorgVoorTestlijst(env) {
  const adressen = testEmails(env);
  if (!adressen.length) throw new NewsletterError('Er is geen testadres ingesteld (NEWSLETTER_TEST_EMAILS).', 409);

  let lijst = (await searchRead(env, {
    model: 'mailing.list', domain: [['name', '=', TEST_LIST_NAME]], fields: ['id'], limit: 1,
    context: { active_test: false },
  }))?.[0];
  if (!lijst) {
    const id = await create(env, { model: 'mailing.list', values: { name: TEST_LIST_NAME, is_public: false } });
    lijst = { id: Number(id) };
  }
  const listId = lijst.id;

  // Wie er nu op staat, en wie er niet hoort.
  const leden = await searchRead(env, {
    model: 'mailing.contact', domain: [['list_ids', 'in', [listId]]], fields: ['id', 'email_normalized'], limit: 200,
  });
  for (const l of leden || []) {
    if (!adressen.includes(String(l.email_normalized || '').toLowerCase())) {
      await write(env, { model: 'mailing.contact', ids: [l.id], values: { list_ids: [[3, listId]] } });
    }
  }

  const contacten = [];
  for (const email of adressen) {
    let c = (await searchRead(env, {
      model: 'mailing.contact', domain: [['email_normalized', '=', email]], fields: ['id', 'list_ids'], limit: 1,
    }))?.[0];
    if (!c) {
      const id = await create(env, {
        model: 'mailing.contact',
        values: { name: email.split('@')[0], email, list_ids: [[4, listId]] },
      });
      c = { id: Number(id), list_ids: [listId] };
    } else if (!(c.list_ids || []).includes(listId)) {
      await write(env, { model: 'mailing.contact', ids: [c.id], values: { list_ids: [[4, listId]] } });
    }
    contacten.push({ id: c.id, email });
  }

  // Nog eens nakijken: staat er toch iemand anders op, dan vertrekt er niets.
  const na = await searchRead(env, {
    model: 'mailing.contact', domain: [['list_ids', 'in', [listId]]], fields: ['email_normalized'], limit: 200,
  });
  const vreemd = (na || []).filter((l) => !adressen.includes(String(l.email_normalized || '').toLowerCase()));
  if (vreemd.length) {
    throw new NewsletterError(`De testlijst bevat ${vreemd.length} adres(sen) die er niet op horen. Er is niets verstuurd.`, 409);
  }
  return { listId, contacten };
}

/** Het token in het Studio-veld zetten, voor een handvol contacten. */
export async function zetTokens(env, contactIds) {
  if (!(await tokenVeldBestaat(env))) return 0;
  let n = 0;
  for (const id of contactIds) {
    await write(env, { model: 'mailing.contact', ids: [id], values: { [TOKEN_FIELD]: await tokenVoor(env, id) } });
    n += 1;
  }
  return n;
}

/**
 * Tokens vullen voor iedereen op de lijsten die er nog geen heeft, in stukken
 * (de cron roept dit herhaaldelijk aan). Geeft terug hoeveel er nog ontbreken.
 */
export async function vulTokens(env, listIds, { max = 150 } = {}) {
  if (!listIds.length || !(await tokenVeldBestaat(env))) return 0;
  const zonder = await searchRead(env, {
    model: 'mailing.contact', domain: [['list_ids', 'in', listIds], [TOKEN_FIELD, '=', false]], fields: ['id'], limit: max,
  });
  const ids = (zonder || []).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(async (id) =>
      write(env, { model: 'mailing.contact', ids: [id], values: { [TOKEN_FIELD]: await tokenVoor(env, id) } })));
  }
  const rest = await executeKw(env, {
    model: 'mailing.contact', method: 'search_count', args: [[['list_ids', 'in', listIds], [TOKEN_FIELD, '=', false]]],
  });
  return Number(rest) || 0;
}

// ─── Versturen ──────────────────────────────────────────────────────────────

async function maakMailing(env, { series, edition, html, subject, preheader, listIds, naam }) {
  const values = {
    name: naam,
    subject,
    preview: preheader || '',
    body_html: html,
    body_arch: html,
    email_from: afzender(series),
    reply_to_mode: 'new',
    reply_to: series.reply_to || series.from_email,
    mailing_type: 'mail',
    mailing_model_id: await modelId(env, 'mailing.list'),
    contact_list_ids: [[6, 0, listIds]],
    mail_server_id: BROADCAST_MAIL_SERVER_ID,
  };
  return Number(await create(env, { model: 'mailing.mailing', values }));
}

/**
 * Een test naar de testadressen. Gaat via exact dezelfde weg als de echte
 * mailing (QWeb per ontvanger, uitschrijflink, Postmark broadcast), zodat de
 * test ook bewijst dat Odoo de HTML ongeschonden laat.
 */
export async function verstuurTest(env, { series, edition, html, subject, preheader }) {
  const { listId, contacten } = await zorgVoorTestlijst(env);
  await zetTokens(env, contacten.map((c) => c.id));
  const stempel = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const mailingId = await maakMailing(env, {
    series, edition, html, preheader,
    subject: `[TEST] ${subject}`,
    listIds: [listId],
    naam: `[OM-test] ${series.name} ${edition.title} (${stempel})`,
  });
  try {
    await executeKw(env, { model: 'mailing.mailing', method: 'action_send_mail', args: [[mailingId]] });
    return { mailingId, queued: false, to: contacten.map((c) => c.email) };
  } catch (error) {
    // Lukt meteen versturen niet, dan in de wachtrij: Odoo's cron stuurt ze.
    console.warn(`${LOG_PREFIX} action_send_mail mislukt, in de wachtrij:`, error?.message);
    await executeKw(env, { model: 'mailing.mailing', method: 'action_launch', args: [[mailingId]] });
    return { mailingId, queued: true, to: contacten.map((c) => c.email) };
  }
}

/**
 * De ECHTE mailing naar de lijsten van de reeks, ingepland op het
 * verzendmoment. Kan enkel met NEWSLETTER_SEND_MODE=live; de route vraagt
 * daarnaast een expliciete bevestiging.
 */
export async function planEchteMailing(env, { series, edition, html, subject, preheader }) {
  if (sendMode(env) !== 'live') {
    throw new NewsletterError('Echte verzending staat uit (NEWSLETTER_SEND_MODE is niet "live"). Enkel testen kan.', 403);
  }
  const listIds = (series.odoo_list_ids || []).map(Number).filter((n) => n > 0);
  if (!listIds.length) throw new NewsletterError('Deze reeks heeft geen Odoo-lijst.', 409);

  const ontbreekt = await vulTokens(env, listIds, { max: 300 });
  if (ontbreekt > 0) {
    throw new NewsletterError(`Nog ${ontbreekt} contacten zonder antwoordtoken. Probeer over enkele minuten opnieuw (de OM vult ze aan).`, 409);
  }

  const mailingId = await maakMailing(env, {
    series, edition, html, subject, preheader, listIds,
    naam: `${series.name} ${edition.title}`,
  });
  const wanneer = new Date(edition.send_at) > new Date() ? edition.send_at : new Date().toISOString();
  await write(env, {
    model: 'mailing.mailing', ids: [mailingId],
    values: { schedule_type: 'scheduled', schedule_date: odooTijd(wanneer) },
  });
  try {
    await executeKw(env, { model: 'mailing.mailing', method: 'action_put_in_queue', args: [[mailingId]] });
  } catch (error) {
    console.warn(`${LOG_PREFIX} action_put_in_queue mislukt, state rechtstreeks:`, error?.message);
    await write(env, { model: 'mailing.mailing', ids: [mailingId], values: { state: 'in_queue' } });
  }
  return { mailingId };
}

export async function leesCijfers(env, mailingId) {
  if (!mailingId) return null;
  const r = (await searchRead(env, {
    model: 'mailing.mailing', domain: [['id', '=', Number(mailingId)]],
    fields: ['state', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'opened_ratio', 'clicks_ratio', 'sent_date'],
    limit: 1, context: { active_test: false },
  }))?.[0];
  return r || null;
}
