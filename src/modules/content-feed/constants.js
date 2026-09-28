/**
 * Content Feed (nieuws & updates) — Constants
 *
 * ARCHITECTUURREGEL: Odoo is de enige database. Deze module bezit geen data.
 * Er mag geen enkele Supabase-tabel voor deze module bestaan en
 * `getSupabaseClient` mag hier nergens geimporteerd worden.
 * Cache (KV) en assets (R2) zijn wegwerpbaar: altijd herbouwbaar uit Odoo.
 *
 * Zelfde afspraak als event-operations-v2. Volledige onderbouwing:
 * docs/ontwerp-om-nieuws.md.
 */

export const LOG_PREFIX = '[content-feed]';

export const TIMEZONE = 'Europe/Brussels';
export const LOCALE = 'nl-BE';

/**
 * Publicatiestatus — komt uit `x_studio_article_status`, een SELECTION.
 *
 * Anders dan bij events (waar de stage de levenscyclus is) heeft dit model
 * geen stages. Geverifieerd op ir.model.fields.selection, 2026-09-17:
 * exact deze drie waarden bestaan, in deze volgorde.
 *
 * `private` betekent: bestaat, maar niet op de publieke feed. Het wordt
 * gebruikt voor webinars die enkel via hun eigen eventpagina lopen.
 */
export const STATUS = {
  CONCEPT: 'concept',
  PUBLISHED: 'published',
  PRIVATE: 'private'
};

export const STATUSES = Object.values(STATUS);

/** Alleen dit komt op de publieke feed. Eén plek, zodat het niet kan lekken. */
export const PUBLIC_VISIBLE_STATUSES = [STATUS.PUBLISHED];

/**
 * Tijdlijnkleur — `x_studio_article_timeline_color`.
 * Geverifieerd, 2026-09-17: precies deze vijf waarden bestaan.
 *
 * De kleur is een KEUZE van de redacteur, geen afgeleide van het type. Wie
 * daar ooit een automatische kleur per type van maakt, moet eerst de 49
 * bestaande records nakijken -- die zijn met de hand gekleurd.
 */
export const TIMELINE_COLOR = {
  DEFAULT: 'default',
  BLUE: 'blue',
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red'
};

export const TIMELINE_COLORS = Object.values(TIMELINE_COLOR);

/**
 * WAAR EEN BERICHT HEEN GAAT, staat NIET op het bericht.
 *
 * Er is geen merk- of kanaalveld in Odoo, en dat is een bewuste keuze. Een
 * enkelvoudig merk kon het niet (embed.openvme.be is een eigen site, geen
 * merk), en een many2many vraagt een eigen Odoo-model voor drie waarden
 * terwijl de TYPES en LABELS die selectie al kunnen maken.
 *
 * Elke site bepaalt in haar SHORTCODE wat ze ophaalt:
 *
 *     [mymmo_news categories="artikel,release-notes"]
 *     [mymmo_news tags="technisch-in-orde"]
 *
 * Gevolg dat je moet kennen: elke geldige sitesleutel kan elk GEPUBLICEERD
 * bericht ophalen. De sleutel is authenticatie ("mag deze site ons
 * bevragen"), geen autorisatie per bericht. Moet een bericht toch echt maar
 * op één site staan, dan is een LABEL daarvoor het bestaande gereedschap.
 */

/**
 * Cache. Zelfde drielagenaanpak als events-v2 (caches.default → geheugen van
 * de isolate → KV), en om dezelfde reden: KV is de duurste laag en hoort
 * laatst te komen. Zie de KV-afspraak in CLAUDE.md.
 */
export const CACHE_PREFIX = 'cfeed';

export const CACHE_NS = {
  ITEMS: 'items',
  TAXONOMY: 'taxonomy'
};

export const CACHE_TTL = {
  PUBLIC_LIST_SECONDS: 60,
  PUBLIC_DETAIL_SECONDS: 60,
  TAXONOMY_SECONDS: 300,
  ADMIN_LIST_SECONDS: 15,
  /**
   * Een afbeelding krijgt een LANGE cache omdat haar URL het versienummer
   * van het record bevat (zie imageVersion()). Wijzigt het beeld, dan
   * wijzigt de URL -- dus dit hoeft nooit korter.
   */
  IMAGE_SECONDS: 31536000
};

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

export const PUBLIC_RATE_LIMIT = {
  WINDOW_SECONDS: 60,
  MAX_REQUESTS: 120
};

/**
 * Versie van de publieke payloadvorm. Verhoog dit zodra de vorm wijzigt op
 * een manier die een oudere plugin niet aankan -- de plugin leest het en kan
 * dan zeggen dat ze bijgewerkt moet worden, in plaats van stil niets te tonen.
 */
/*
 * 3 sinds events in de feed staan: er is een `kind: 'event'` bijgekomen met
 * een eigen `event`-blok. De vorm is ADDITIEF, dus een oudere plugin gaat
 * niet stuk -- die tekent een event als gewoon artikel, zonder de datum en
 * zonder de inschrijfknop. Daarom hoort ze het wel te MELDEN, en dat doet
 * ze via dit nummer.
 */
export const PUBLIC_SHAPE_VERSION = 3;

/** De publieke API. De WordPress-plugin kent alleen dit pad. */
export const PUBLIC_PREFIX = '/content-feed/public/v1';

/** De beheerroute van de module. */
export const MODULE_ROUTE = '/content-feed';
