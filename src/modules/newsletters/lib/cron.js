/**
 * Nieuwsbrieven -- wat elk kwartier vanzelf gebeurt (15-min-tak in index.js).
 *
 *   - edities aanmaken volgens het ritme van elke reeks (elk uur)
 *   - een editie op "nalezen" zetten zodra de inleverdatum voorbij is
 *   - herinneringen in het chatkanaal van de reeks, 3 en 1 dag voor de deadline
 *     (enkel als er een kanaal ingesteld is -- standaard niet)
 *   - rijpe antwoorden op vragen in de mail naar de koppeling
 *   - bij een live mailing: tokens vullen en de cijfers bijhouden
 *
 * Verstuurt NOOIT een nieuwsbrief. Dat gebeurt enkel na een klik in de OM.
 */

import { sendSystemChannelMessage } from '../../mini-apps/lib/chat.js';
import {
  listSeries, listEditions, listContributions, updateEdition, logActivity, listUsers,
} from './store.js';
import { EDITION_STATUS, CONTRIBUTION_STATUS, KINDS, LOG_PREFIX, sendMode, appOrigin } from './constants.js';
import { zorgVoorEdities } from './editions.js';
import { zetAntwoordenDoor } from './answers.js';
import { vulTokens, leesCijfers } from './odoo-mailing.js';

const DAG_MS = 24 * 60 * 60 * 1000;

function datumKort(iso) {
  try {
    return new Intl.DateTimeFormat('nl-BE', {
      timeZone: 'Europe/Brussels', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** De stand van een editie, in één zin voor het chatkanaal. */
export async function standVan(env, series, edition) {
  const [items, users] = await Promise.all([listContributions(env, edition.id), listUsers(env)]);
  const echt = items.filter((i) => !KINDS[i.kind]?.auto);
  const binnen = echt.filter((i) => [CONTRIBUTION_STATUS.SUBMITTED, CONTRIBUTION_STATUS.APPROVED].includes(i.status));
  const open = echt.filter((i) => ![CONTRIBUTION_STATUS.SUBMITTED, CONTRIBUTION_STATUS.APPROVED].includes(i.status));
  const naam = (id) => {
    const u = users.find((x) => x.id === id);
    return u ? String(u.full_name || u.email).split(/\s+/)[0] : 'nog niemand';
  };
  return {
    binnen: binnen.length,
    totaal: echt.length,
    open: open.map((i) => `${i.title} (${naam(i.owner_user_id)})`),
  };
}

export async function stuurHerinnering(env, series, edition, { dagen = null } = {}) {
  if (!series.chat_channel) return false;
  const stand = await standVan(env, series, edition);
  const kop = dagen === null
    ? `${series.name} ${edition.title}: inleveren tegen ${datumKort(edition.deadline_at)}.`
    : `${series.name} ${edition.title}: nog ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} tot inleveren (${datumKort(edition.deadline_at)}).`;
  const regels = [
    kop,
    `${stand.binnen} van ${stand.totaal} stukjes binnen.`,
    stand.open.length ? `Nog open: ${stand.open.join(', ')}.` : 'Alles is binnen.',
    `${appOrigin(env)}/nieuwsbrieven#/editie/${edition.id}`,
  ];
  await sendSystemChannelMessage(env, series.chat_channel, regels.join('\n'), { bron: 'Nieuwsbrieven' });
  return true;
}

async function herinneringen(env, reeksen, nu) {
  const actief = await listEditions(env, { statuses: [EDITION_STATUS.COLLECTING], limit: 50 });
  for (const editie of actief) {
    const series = reeksen.find((s) => s.id === editie.series_id);
    if (!series) continue;
    const rest = new Date(editie.deadline_at).getTime() - nu.getTime();

    if (rest <= 0) {
      await updateEdition(env, editie.id, { status: EDITION_STATUS.REVIEW });
      await logActivity(env, { editionId: editie.id, kind: 'deadline', text: 'Inleverdatum voorbij: klaar om na te lezen' });
      continue;
    }
    if (!series.chat_channel) continue;
    const verstuurd = editie.reminders || {};
    const moment = rest <= DAG_MS ? 'd1' : (rest <= 3 * DAG_MS ? 'd3' : null);
    if (!moment || verstuurd[moment]) continue;
    try {
      await stuurHerinnering(env, series, editie, { dagen: moment === 'd1' ? 1 : 3 });
      await updateEdition(env, editie.id, { reminders: { ...verstuurd, [moment]: nu.toISOString() } });
      await logActivity(env, { editionId: editie.id, kind: 'reminder', text: `Herinnering in het chatkanaal (${moment === 'd1' ? '1 dag' : '3 dagen'} voor de deadline)` });
    } catch (error) {
      console.error(`${LOG_PREFIX} herinnering ${editie.id} mislukt:`, error?.message);
    }
  }
}

async function liveOnderhoud(env, reeksen, nu) {
  // Ingeplande edities: tokens vullen tot ze er allemaal zijn, en zien of Odoo
  // ze verstuurd heeft.
  const ingepland = await listEditions(env, { statuses: [EDITION_STATUS.SCHEDULED], limit: 20 });
  for (const editie of ingepland) {
    const series = reeksen.find((s) => s.id === editie.series_id);
    if (!series) continue;
    try {
      if (new Date(editie.send_at).getTime() - nu.getTime() < 2 * DAG_MS) {
        await vulTokens(env, series.odoo_list_ids || [], { max: 150 });
      }
      const cijfers = await leesCijfers(env, editie.odoo_mailing_id);
      if (cijfers && cijfers.state === 'done') {
        await updateEdition(env, editie.id, { status: EDITION_STATUS.SENT, sent_at: cijfers.sent_date || nu.toISOString(), stats: cijfers });
        await logActivity(env, { editionId: editie.id, kind: 'sent', text: `Verstuurd naar ${cijfers.sent || 0} adressen` });
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} onderhoud ${editie.id} mislukt:`, error?.message);
    }
  }
  // Cijfers van verzonden edities, de eerste 30 dagen.
  const verzonden = await listEditions(env, { statuses: [EDITION_STATUS.SENT], limit: 10 });
  for (const editie of verzonden) {
    if (!editie.odoo_mailing_id || nu.getTime() - new Date(editie.sent_at || editie.send_at).getTime() > 30 * DAG_MS) continue;
    try {
      const cijfers = await leesCijfers(env, editie.odoo_mailing_id);
      if (cijfers) await updateEdition(env, editie.id, { stats: cijfers });
    } catch (error) {
      console.warn(`${LOG_PREFIX} cijfers ${editie.id} niet gelezen:`, error?.message);
    }
  }
}

export async function runNewsletterCron(env, { scheduledTime } = {}) {
  if (!env?.SUPABASE_URL) return;
  if (String(env.NEWSLETTER_CRON || '1') === '0') return;
  const nu = new Date(scheduledTime || Date.now());
  const eersteKwartier = nu.getUTCMinutes() < 15;

  const reeksen = await listSeries(env, { activeOnly: true });
  if (!reeksen.length) return;

  if (eersteKwartier) {
    try {
      await zorgVoorEdities(env, nu);
    } catch (error) {
      console.error(`${LOG_PREFIX} edities aanmaken mislukt:`, error?.message);
    }
  }
  try {
    await herinneringen(env, reeksen, nu);
  } catch (error) {
    console.error(`${LOG_PREFIX} herinneringen mislukt:`, error?.message);
  }
  try {
    await zetAntwoordenDoor(env);
  } catch (error) {
    console.error(`${LOG_PREFIX} antwoorden doorzetten mislukt:`, error?.message);
  }
  if (sendMode(env) === 'live' && eersteKwartier) {
    await liveOnderhoud(env, reeksen, nu);
  }
}
