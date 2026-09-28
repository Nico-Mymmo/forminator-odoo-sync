/**
 * Events in de nieuwsfeed.
 *
 * DIT IS DE ENIGE PLEK die weet hoe een event een feed-item wordt. Er wordt
 * hier bewust GEEN eigen Odoo-query geschreven: `listEvents()` uit
 * event-operations-v2 is de motor van die module en kent haar eigen
 * eigenaardigheden (de stage IS de publicatiestatus, welke velden optioneel
 * zijn, hoe de inschrijvingen geteld worden). Een tweede query hier zou
 * dezelfde twee-motoren-fout zijn die deze repo al twee keer gemaakt heeft.
 *
 * WAT EEN EVENT IN DE FEED BEPAALT, staat op het event in Odoo -- vijf
 * optionele Studio-velden, zie EVENT_FIELDS.NEWS_* in de contract van
 * events-v2. Er komt hier geen tabel bij: Odoo is voor beide modules de enige
 * database, en een kopie van "welke events tonen we" veroudert zodra iemand
 * het event archiveert.
 */

import { listEvents } from '../../event-operations-v2/lib/events-service.js';
import { resolvePublicOrigin } from '../../event-operations-v2/lib/mail-service.js';
import { PUBLIC_EVENT_PATH, PUBLICATION_STATE } from '../../event-operations-v2/constants.js';
import { LOG_PREFIX } from '../constants.js';

/**
 * Het type waaronder events in de feed staan.
 *
 * Bewust een SYNTHETISCH type en geen rij in `x_content_snippet_type`: de
 * shortcode filtert op typeslugs (`categories="artikel,evenement"`), en dat is
 * precies het mechanisme waarmee een site kiest wat ze toont. Een echte rij
 * zou betekenen dat iemand hem kan hernoemen of weghalen, waarna events stil
 * uit elke feed verdwijnen.
 *
 * `id` is null: er is geen Odoo-record, en een verzonnen id zou vroeg of laat
 * in een domein belanden dat op snippets zoekt.
 */
export const EVENT_FEED_TYPE = { id: null, name: 'Evenement', slug: 'evenement' };

/*
 * De standaard knoptekst als er bij het event niets ingevuld staat. Twee
 * varianten, want een knop "Schrijf je in" op een event waar inschrijven
 * dicht staat, belooft iets wat de volgende pagina niet waarmaakt.
 */
const CTA_INSCHRIJVEN = 'Schrijf je in';
const CTA_BEKIJKEN = 'Bekijk het event';

/**
 * Vandaag in Europe/Brussels, als JJJJ-MM-DD.
 *
 * Bewust niet `new Date().toISOString()`: dat is UTC, en tussen 00:00 en 02:00
 * onze tijd is dat nog gisteren. Een venster dat "vanaf vandaag" heet zou dan
 * een dag te laat opengaan -- precies op de dag dat iemand het instelde en
 * meteen gaat kijken. `sv-SE` levert als enige locale de ISO-vorm.
 */
export function vandaagInBrussel(nu = new Date()) {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(nu);
  } catch (error) {
    return nu.toISOString().slice(0, 10);
  }
}

/**
 * De sorteersleutel van een event in de tijdlijn.
 *
 * "Vanaf"-datum als die er is, anders de dag waarop het event begint. Dat is
 * de enige sleutel die klopt in een omgekeerd-chronologische feed: het is het
 * moment waarop dit bericht verschijnt, net zoals de publicatiedatum dat voor
 * een snippet is.
 *
 * Gevolg dat je moet kennen: een aankomend event zonder vanaf-datum staat
 * bovenaan tot het geweest is. Dat is gewild -- je zet een event in de feed om
 * er inschrijvingen mee te halen, niet om het weg te stoppen tussen oud nieuws.
 */
export function feedDatumVan(event) {
  const vanaf = event?.news?.from;
  if (vanaf) return String(vanaf).slice(0, 10);
  const start = event?.starts_at;
  return start ? String(start).slice(0, 10) : null;
}

/**
 * Een intern event-DTO naar de vorm die de WordPress-plugin kent.
 *
 * De sleutels zijn met opzet dezelfde als die van `toPublicSnippetDto()`:
 * dezelfde kaart, dezelfde filterbalk, dezelfde maandopschriften. Wat een
 * event extra heeft, staat gebundeld onder `event` -- zo kan een plugin die
 * dit blok nog niet kent het item gewoon als artikel tekenen in plaats van
 * stuk te gaan.
 */
export function toEventFeedDto(event, { origin = '' } = {}) {
  if (!event) return null;

  const slug = String(event.slug || '').trim();
  const url = slug ? `${origin}${PUBLIC_EVENT_PATH}/${slug}/` : null;
  const registratie = event.registration || {};

  return {
    // Een STRING-id met voorvoegsel: snippet 90 en event 90 bestaan allebei,
    // en in een samengevoegde lijst mogen die elkaar niet overschrijven.
    id: `evt-${event.id}`,
    kind: 'event',
    title: event.title,
    summaryTitle: event.title,
    summary: event.summary,
    publishedOn: feedDatumVan(event),
    type: { name: EVENT_FEED_TYPE.name, slug: EVENT_FEED_TYPE.slug },
    // Events dragen hun eigen Odoo-labels, maar die staan los van de labels
    // van de nieuwsberichten. Ze hier mengen zou de filterbalk vullen met
    // labels die op geen enkel artikel slaan.
    tags: [],
    source: '',
    url,
    cta: String(event.news?.cta || '').trim()
      || (registratie.status?.open ? CTA_INSCHRIJVEN : CTA_BEKIJKEN),
    quote: '',
    audience: null,
    curatorNote: '',
    color: 'default',
    imageUrl: event.hero_image_url || null,
    event: {
      starts_at: event.starts_at || null,
      ends_at: event.ends_at || null,
      timezone: event.timezone || null,
      format: event.format || null,
      location: event.location?.name || '',
      // Of de knop een INSCHRIJFknop is of enkel "bekijk", hangt hiervan af.
      // Staat inschrijven dicht, dan blijft de kaart staan met een link naar
      // de eventpagina -- een dode inschrijfknop is erger dan geen knop.
      registration_open: Boolean(registratie.status?.open),
      seats_left: Number.isFinite(registratie.seats_left) ? registratie.seats_left : null
    }
  };
}

/**
 * De events die vandaag in de feed horen te staan.
 *
 * `limit` is het aantal dat de samenvoeging nodig heeft (offset + limit), niet
 * het aantal dat de bezoeker ziet: twee gesorteerde bronnen samenvoegen en dan
 * pas snijden, is de enige manier om over beide correct te pagineren.
 */
export async function listFeedEvents(env, { limit = 20 } = {}) {
  const dag = vandaagInBrussel();

  try {
    const { events } = await listEvents(env, {
      filters: {
        // Een CONCEPT of GEANNULEERD event komt er nooit in. `done` wel: of
        // een afgelopen event nog zichtbaar is, hoort het VENSTER te
        // beslissen en niet de stage -- anders verdwijnt een event op de dag
        // zelf, terwijl iemand het bewust tot volgende week wou tonen.
        publication_states: [PUBLICATION_STATE.PUBLISHED, PUBLICATION_STATE.DONE],
        news_window: dag
      },
      limit,
      offset: 0,
      // De feed sorteert zelf na het samenvoegen; deze volgorde bepaalt enkel
      // WELKE events in het venster van `limit` vallen. Op startdatum
      // aflopend is daarvoor de beste benadering van "meest relevant".
      order: 'x_studio_event_datetime desc'
    });

    const origin = resolvePublicOrigin(env, null);
    return (events || [])
      .map((event) => toEventFeedDto(event, { origin }))
      .filter((dto) => dto && dto.publishedOn);
  } catch (error) {
    // Een storing in de events-module mag de NIEUWSFEED niet meeslepen: de
    // artikels staan er dan gewoon zonder de events, in plaats van dat de
    // hele pagina leeg blijft. Wel luid loggen -- stil minder tonen is
    // precies de faalmodus waar deze module al eens in gezeten heeft.
    console.error(`${LOG_PREFIX} events voor de feed ophalen mislukt:`, error?.message);
    return [];
  }
}
