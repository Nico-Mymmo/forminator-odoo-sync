/**
 * Nieuwsbrieven -- de verzending blijft in de OM tot het moment zelf.
 *
 * "Verzenden" in de OM zet de editie op Ingepland met een verzendmoment. Er
 * wordt dan NIETS in Odoo klaargezet: tot dat moment kan marketing de editie
 * verplaatsen of terughalen. Pas op het moment zelf (de cron, elk kwartier)
 * maakt de OM de mailing in Odoo en laat ze meteen vertrekken. Dat is
 * bewust (2026-10-15): geen nieuwsbrieven die in Odoo "geplaatst" staan.
 */

import { listEditions, listSeries, updateEdition, claimVerzending, logActivity, NewsletterError } from './store.js';
import { EDITION_STATUS, LOG_PREFIX, sendMode, appOrigin } from './constants.js';
import { renderEdition } from './render.js';
import { verzamel, brussel } from './editions.js';
import { antwoordLinks } from './answers.js';
import { tokenVeldBestaat, vulTokens, verstuurEchteMailing } from './odoo-mailing.js';
import { hostBeelden } from './beelden-hosten.js';
import { sendSystemChannelMessage } from '../../mini-apps/lib/chat.js';

const MIN_MS = 60 * 1000;
const DAG_MS = 24 * 60 * MIN_MS;

/** Zo kort na de klik mag een verzending op zijn vroegst vertrekken. */
export const MINSTE_UITSTEL_MS = 15 * MIN_MS;

/** Een moment in gewone taal, in Brussel-tijd, voor meldingen. */
export function datumKort(iso) {
  try {
    return new Intl.DateTimeFormat('nl-BE', {
      timeZone: 'Europe/Brussels', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function brusselsDelen(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { y: Number(v.year), m: Number(v.month), d: Number(v.day) };
}

/**
 * Het voorgestelde verzendmoment: de verzenddag van de editie als die nog
 * minstens een uur weg is, anders morgen op het uur van de reeks. Zo is er
 * altijd een bedenktijd om nog iets terug te halen.
 */
export function voorgesteldMoment(series, edition, nu = new Date()) {
  const gepland = new Date(edition.send_at);
  if (gepland.getTime() - nu.getTime() >= 60 * MIN_MS) return gepland;
  const b = brusselsDelen(new Date(nu.getTime() + DAG_MS));
  return brussel(b.y, b.m, b.d, Number(series.send_hour) || 9, 0);
}

/** Een gekozen verzendmoment nakijken: geldig, en niet te kort na nu. */
export function controleerMoment(waarde, nu = new Date()) {
  const d = new Date(waarde);
  if (Number.isNaN(d.getTime())) throw new NewsletterError('Kies een geldig verzendmoment.');
  if (d.getTime() < nu.getTime() + MINSTE_UITSTEL_MS) {
    throw new NewsletterError('Het verzendmoment moet minstens een kwartier in de toekomst liggen, zodat je nog kan terughalen.');
  }
  return d;
}

async function meld(env, series, tekst) {
  if (!series?.chat_channel) return;
  try {
    await sendSystemChannelMessage(env, series.chat_channel, tekst, { bron: 'Nieuwsbrieven' });
  } catch (error) {
    console.warn(`${LOG_PREFIX} chatmelding mislukt:`, error?.message);
  }
}

/** De HTML van de echte mail, met elk beeld bij ons gehost. */
export async function bouwEchteMail(env, series, edition) {
  const v = await verzamel(env, series, edition, { png: true });
  const tokenVeld = await tokenVeldBestaat(env);
  const { html } = renderEdition({
    series, edition, items: v.items, mode: 'live',
    ctx: { ...v.ctx, answerLink: antwoordLinks(series, 'live', tokenVeld) },
  });
  const gehost = await hostBeelden(env, html, { series });
  return { html: gehost.html, problemen: gehost.problemen, items: v.items, ctx: v.ctx, tokenVeld };
}

/**
 * De cron: elke ingeplande editie waarvan het moment er is, naar Odoo en
 * meteen vertrekken. Lukt het niet, dan gaat de editie terug naar Nalezen
 * met de reden in het verloop en in de chat, en vertrekt er niets.
 */
export async function verzendKlaargezette(env, nu = new Date()) {
  if (sendMode(env) !== 'live') return 0;
  const reeksen = await listSeries(env);
  const ingepland = await listEditions(env, { statuses: [EDITION_STATUS.SCHEDULED], limit: 20 });
  let gedaan = 0;
  for (const editie of ingepland) {
    if (editie.odoo_mailing_id || new Date(editie.send_at).getTime() > nu.getTime()) continue;
    const series = reeksen.find((s) => s.id === editie.series_id);
    if (!series) continue;
    // Eerst claimen, zodat twee crons nooit twee keer versturen.
    if (!(await claimVerzending(env, editie.id))) continue;
    try {
      const { html, problemen } = await bouwEchteMail(env, series, editie);
      if (problemen.length) throw new NewsletterError(`Deze beelden konden niet klaargezet worden: ${problemen.join(', ')}.`);
      const ontbreekt = await vulTokens(env, series.odoo_list_ids || [], { max: 400 });
      if (ontbreekt > 0) throw new NewsletterError(`Nog ${ontbreekt} contacten zonder antwoordtoken.`);
      const r = await verstuurEchteMailing(env, {
        series, edition: editie, html, subject: editie.subject, preheader: editie.preheader,
      });
      await updateEdition(env, editie.id, { odoo_mailing_id: r.mailingId });
      await logActivity(env, { editionId: editie.id, kind: 'sending', text: r.queued ? 'Aan Odoo gegeven, vertrekt zo' : 'Vertrokken via Odoo' });
      await meld(env, series, `${series.name} ${editie.title} is vertrokken naar de lezers.\n${appOrigin(env)}/nieuwsbrieven#/editie/${editie.id}`);
      gedaan += 1;
      console.log(`${LOG_PREFIX} verstuurd: ${series.name} ${editie.title} (mailing ${r.mailingId})`);
    } catch (error) {
      const reden = String(error?.message || error).slice(0, 300);
      console.error(`${LOG_PREFIX} verzending ${editie.id} mislukt:`, reden);
      await updateEdition(env, editie.id, { odoo_mailing_id: null, status: EDITION_STATUS.REVIEW });
      await logActivity(env, { editionId: editie.id, kind: 'send_failed', text: `Verzending mislukt, terug naar Nalezen: ${reden}` });
      await meld(env, series, `${series.name} ${editie.title} is NIET vertrokken: ${reden}\n${appOrigin(env)}/nieuwsbrieven#/editie/${editie.id}`);
    }
  }
  return gedaan;
}
