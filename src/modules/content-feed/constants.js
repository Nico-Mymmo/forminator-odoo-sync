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
 * Merk. BESTAAT VANDAAG NIET in Odoo -- `x_studio_brand` moet nog in Studio
 * aangemaakt worden. Zelfde patroon als EVENT_BRAND in events-v2: de code
 * werkt door zolang het veld er niet is, zodat de uitrolvolgorde vrij blijft.
 *
 * LEEG betekent BEIDE, niet "geen". De 49 bestaande records hebben het veld
 * niet, en die horen gewoon op beide feeds te blijven staan. Zou leeg
 * "geen merk" betekenen, dan maakt het aanmaken van het Studio-veld in één
 * klap de hele feed leeg -- zonder foutmelding.
 */
export const BRAND = {
  OPENVME: 'openvme',
  SYNDICOACH: 'syndicoach'
};

export const BRANDS = Object.values(BRAND);

/**
 * Cache. Zelfde drielagenaanpak als events-v2 (caches.default → geheugen van
 * de isolate → KV), en om dezelfde reden: KV is de duurste laag en hoort
 * laatst te komen. Zie de KV-afspraak in CLAUDE.md.
 */
export const CACHE_NS = 'contentfeed';

export const CACHE_TTL = {
  LIST_SECONDS: 60,
  DETAIL_SECONDS: 60,
  TAGS_SECONDS: 300,
  TYPES_SECONDS: 300
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
export const PUBLIC_SHAPE_VERSION = 1;

/**
 * Het pad van de publieke API. De WordPress-plugin kent alleen dit.
 */
export const PUBLIC_PREFIX = '/content-feed/public/v1';
