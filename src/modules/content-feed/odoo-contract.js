/**
 * Content Feed (nieuws & updates) — Odoo-contract
 *
 * DIT IS DE ENIGE PLEK IN DE MODULE WAAR `x_`-VELDNAMEN MOGEN STAAN.
 * De rest van de module kent alleen nette namen en DTO's.
 *
 * Pure module: geen I/O, geen env, geen fetch. Alles is in/uit te testen met
 * een gewoon object. Alles wat Odoo moet aanroepen staat in lib/.
 *
 * Geverifieerd tegen de live Odoo-instantie op 2026-09-17 en 2026-09-20 met
 * fields_get, ir.model.fields.selection en 49 echte records.
 * Onderbouwing en meetcijfers: docs/ontwerp-om-nieuws.md.
 */

import {
  STATUS,
  STATUSES,
  PUBLIC_VISIBLE_STATUSES,
  TIMELINE_COLOR,
  TIMELINE_COLORS,
  PUBLIC_PREFIX
} from './constants.js';

export const ODOO_MODELS = {
  SNIPPET: 'x_content_snippet',
  TYPE: 'x_content_snippet_type',
  TAG: 'x_content_snippet_tag',
  USER: 'res.users'
};

// ─── Veldnamen ────────────────────────────────────────────────────────────────

export const SNIPPET_FIELDS = {
  ID: 'id',
  TITLE: 'x_name',
  ACTIVE: 'x_active',
  STATUS: 'x_studio_article_status',
  // De ENIGE sorteersleutel van de tijdlijn. Zie SORT_ORDER hieronder.
  PUBLISHED_ON: 'x_studio_content_snippet_publication_date',
  TYPE: 'x_studio_content_snippet_type_id',
  TAGS: 'x_studio_tag_ids',
  // "bron: BRUZZ" -- vrije tekst, geen relatie. Bewust: het zijn externe
  // media die we niet beheren en waarvan er telkens nieuwe bijkomen.
  SOURCE: 'x_studio_content_snippet_outlet',
  URL: 'x_studio_content_link',
  CTA: 'x_studio_article_cta',
  SUMMARY: 'x_studio_article_summary',
  SUMMARY_TITLE: 'x_studio_article_summary_title',
  COLOR: 'x_studio_article_timeline_color',
  OWNER: 'x_studio_user_id',
  /**
   * OPTIONEEL veld -- bestaat pas als het in Studio is aangemaakt (Text).
   * OPTIONEEL veld: de module werkt door zolang het er niet is, en
   * `quoteFieldAvailable()` in lib/content-service.js beslist per schrijfactie
   * of het meegaat. Zonder dat zou het toevoegen van de artikel-analyse elke
   * bestaande installatie breken op een veld dat daar niet bestaat.
   */
  QUOTE: 'x_studio_quote',
  /**
   * OPTIONEEL veld (Selection) -- voor wie dit bericht bedoeld is.
   *
   * De WAARDEN staan bewust NIET in deze code: ze komen uit Odoo zelf via
   * `fields_get`, zodat een marketeer er in Studio een doelgroep bij kan
   * zetten zonder dat hier iets moet wijzigen. Een kopie van die lijst in de
   * Worker zou binnen het jaar achterlopen op Studio, en dat zie je niet --
   * je ziet enkel een doelgroep die niet in het keuzemenu staat.
   */
  AUDIENCE: 'x_studio_audience',
  /**
   * OPTIONEEL veld (Text) -- de subkop die zegt WAAROM wij dit gedeeld hebben.
   *
   * Dit is het enige veld op de kaart dat niet uit het artikel komt maar van
   * ONS: onze kijk erop. Het is wat het verschil maakt tussen een lijst links
   * en een gecureerd overzicht. Houd het daarom gescheiden van `summary` --
   * dat is de inhoud van het artikel, dit is het oordeel erover.
   */
  CURATOR_NOTE: 'x_studio_curator_note',
  /**
   * HET beeldveld. Geverifieerd 2026-09-20: 23 van de 49 records hebben dit
   * gevuld; `x_studio_image` heeft er exact EEN (record 85, dat dit veld
   * ook heeft). Dat tweede veld is dus dood -- zie FORBIDDEN_FIELDS.
   *
   * Dit is een BINAIR veld (base64). Het mag daarom NOOIT in een lijstquery
   * mee: dan gaat elke afbeelding als base64 door de JSON-RPC-respons. De
   * lijst vraagt enkel WELKE id's een beeld hebben (`IMAGE_ID_DOMAIN`) en de
   * bytes worden pas opgehaald als de browser de afbeelding effectief
   * opvraagt.
   */
  IMAGE: 'x_studio_content_image',
  WRITE_DATE: 'write_date',
  CREATE_DATE: 'create_date'
};

/**
 * Velden die deze module NOOIT leest of schrijft, met de reden erbij.
 *
 * Dit lijstje staat hier omdat elk van deze velden er uitziet alsof je het
 * zou moeten gebruiken. Zonder de reden erbij zet iemand ze binnen het jaar
 * terug -- dat is precies wat er bij events-v2 met x_studio_event_type
 * gebeurd is.
 */
export const FORBIDDEN_FIELDS = {
  x_studio_content:
    'Afgeleide HTML, gebouwd door serveractie 1014 uit vier andere velden en ' +
    'teruggeschreven in de database. Presentatie hoort in de plugin, niet in ' +
    'Odoo. Bovendien met de hand bijgewerkt op minstens één record (97), dus ' +
    'de actie opnieuw draaien zou dat stil wissen.',
  x_studio_article_wordpress_id:
    'Verwijst naar een news_article-post die na de migratie niet meer bestaat. ' +
    'Twee records (57 en 67) wijzen bovendien naar dezelfde post 1245, dus het ' +
    'is ook vandaag al geen betrouwbare sleutel.',
  x_studio_article_summary_old:
    'Oude kolom (char). x_studio_article_summary (text) is de echte.',
  x_studio_generate_ai_content:
    'Vuurt automation 27 naar een Zapier-hook. Op verzoek laten vallen ' +
    '(2026-09-20); de OM heeft een eigen AI-koppeling met een foutcontract.',
  x_studio_ai_last_generated:
    'Hoort bij x_studio_generate_ai_content. Gemeten 2026-09-20: 34 records ' +
    'hebben het gevuld (nieuwste 2026-07-14) en 10 wachten sindsdien op een ' +
    'samenvatting die nooit kwam. Het BEVAT dus echte historiek -- weghalen ' +
    'wist die. Wij lezen en schrijven het alleen niet.',
  x_studio_image:
    'Tweede binair veld voor hetzelfde ding, gevuld op EEN record (85) dat ' +
    'x_studio_content_image ook heeft. Twee bronnen voor één afbeelding is ' +
    'een bug in wording; IMAGE is de echte.',
  x_studio_sequence:
    'Staat op 10 bij álle 49 records en doet dus niets. Een tijdlijn met twee ' +
    'sorteervelden is een tijdlijn waarvan niemand de volgorde kan ' +
    'voorspellen; PUBLISHED_ON is de enige sleutel.'
};

/** De velden die een lijstweergave nodig heeft. Nooit alles ophalen. */
export const SNIPPET_LIST_FIELDS = [
  SNIPPET_FIELDS.ID,
  SNIPPET_FIELDS.TITLE,
  SNIPPET_FIELDS.ACTIVE,
  SNIPPET_FIELDS.STATUS,
  SNIPPET_FIELDS.PUBLISHED_ON,
  SNIPPET_FIELDS.TYPE,
  SNIPPET_FIELDS.TAGS,
  SNIPPET_FIELDS.SOURCE,
  SNIPPET_FIELDS.URL,
  SNIPPET_FIELDS.CTA,
  SNIPPET_FIELDS.SUMMARY,
  SNIPPET_FIELDS.SUMMARY_TITLE,
  SNIPPET_FIELDS.COLOR,
  SNIPPET_FIELDS.OWNER,
  // QUOTE en AUDIENCE staan bewust NIET in deze vaste lijst: die velden
  // bestaan mogelijk niet, en een onbekend veld in `fields` laat een
  // searchRead volledig falen. lijstVelden() voegt ze toe als ze er zijn.
  SNIPPET_FIELDS.WRITE_DATE,
  SNIPPET_FIELDS.CREATE_DATE
];

/** Het domein dat zegt WELKE records een afbeelding hebben. Geeft enkel id's. */
export const IMAGE_ID_DOMAIN = [[SNIPPET_FIELDS.IMAGE, '!=', false]];

/**
 * De sorteersleutel van de tijdlijn, als Odoo-orderstring.
 *
 * `id desc` staat er alleen als TIEBREAK bij een gelijke datum -- zonder dat
 * is de volgorde van twee berichten van dezelfde dag willekeurig en wisselt
 * ze tussen twee verversingen, wat er op het scherm uitziet als een fout.
 *
 * `nulls last` is GEEN detail. PostgreSQL zet lege waarden bij een `DESC`
 * standaard BOVENAAN, dus de zes gepubliceerde berichten zonder datum voerden
 * de feed aan -- met het nieuwste echte bericht eronder. Dat leest als "de
 * tijdlijn sorteert op aanmaakdatum", terwijl er iets heel anders aan de hand
 * is. Odoo laat deze toevoeging gewoon door naar de ORDER BY (geverifieerd op
 * de echte database, 2026-09-21); ze is dus niet te vervangen door sorteren in
 * JavaScript, want dat zou pas NA het pagineren gebeuren.
 */
export const SORT_ORDER = `${SNIPPET_FIELDS.PUBLISHED_ON} desc nulls last, id desc`;

/** Velden die via de beheer-UI geschreven mogen worden. Gesloten lijst. */
export const WRITABLE_FIELDS = {
  title: SNIPPET_FIELDS.TITLE,
  status: SNIPPET_FIELDS.STATUS,
  publishedOn: SNIPPET_FIELDS.PUBLISHED_ON,
  typeId: SNIPPET_FIELDS.TYPE,
  tagIds: SNIPPET_FIELDS.TAGS,
  source: SNIPPET_FIELDS.SOURCE,
  url: SNIPPET_FIELDS.URL,
  cta: SNIPPET_FIELDS.CTA,
  summary: SNIPPET_FIELDS.SUMMARY,
  summaryTitle: SNIPPET_FIELDS.SUMMARY_TITLE,
  color: SNIPPET_FIELDS.COLOR,
  quote: SNIPPET_FIELDS.QUOTE,
  audience: SNIPPET_FIELDS.AUDIENCE,
  curatorNote: SNIPPET_FIELDS.CURATOR_NOTE,
  ownerId: SNIPPET_FIELDS.OWNER,
  active: SNIPPET_FIELDS.ACTIVE
};

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

/** Odoo geeft `false` voor leeg. Nooit rechtstreeks in een DTO laten komen. */
function str(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Een many2one is `[id, naam]` of `false`. */
function relation(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const id = Number(value[0]);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, name: str(value[1]) };
}

/** Onbekende waarden vallen terug op `default`, niet op een lege klasse. */
export function normalizeColor(value) {
  const colour = str(value);
  return TIMELINE_COLORS.includes(colour) ? colour : TIMELINE_COLOR.DEFAULT;
}

export function normalizeStatus(value) {
  const status = str(value);
  return STATUSES.includes(status) ? status : STATUS.CONCEPT;
}

/**
 * Mag dit record publiek getoond worden?
 *
 * Twee voorwaarden, en ze zijn allebei nodig: gearchiveerd (`x_active =
 * false`) moet net zo goed verdwijnen als een concept. Dit is de enige plek
 * waar die vraag beantwoord wordt.
 */
export function isPubliclyVisible(record) {
  if (!record) return false;
  if (record[SNIPPET_FIELDS.ACTIVE] === false) return false;
  return PUBLIC_VISIBLE_STATUSES.includes(
    normalizeStatus(record[SNIPPET_FIELDS.STATUS])
  );
}

/**
 * Het versiedeel van een afbeeldings-URL.
 *
 * De bytes zelf zitten niet in de lijstquery (te duur), dus we kunnen de
 * inhoud niet hashen. `write_date` is het eerstvolgende beste: wijzigt het
 * beeld, dan wijzigt de write_date, dus wijzigt de URL en haalt de browser
 * hem opnieuw op. Dat werkt ook de verkeerde kant op -- een titelwijziging
 * geeft een nieuwe URL voor een ongewijzigd beeld -- en dat is de goedkope
 * kant van de vergissing.
 */
export function imageVersion(record) {
  const raw = str(record?.[SNIPPET_FIELDS.WRITE_DATE]) || '0';
  return raw.replace(/[^0-9]/g, '').slice(0, 14) || '0';
}

/** De publieke URL van de afbeelding van een bericht, of null. */
export function imageUrlFor(id, version) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return `${PUBLIC_PREFIX}/items/${id}/image?v=${encodeURIComponent(version || '0')}`;
}

// ─── DTO's ────────────────────────────────────────────────────────────────────

/**
 * Het interne DTO: alles wat het BEHEERSCHERM mag zien.
 * Dit is niet wat de website krijgt -- zie toPublicSnippetDto().
 *
 * `hasImage` komt NIET uit het record zelf (dat zou de base64 meebrengen)
 * maar uit een aparte, goedkope id-query; zie IMAGE_ID_DOMAIN.
 */
export function toSnippetDto(record, { hasImage = false } = {}) {
  if (!record) return null;
  const id = Number(record[SNIPPET_FIELDS.ID]);
  return {
    id,
    title: str(record[SNIPPET_FIELDS.TITLE]),
    active: record[SNIPPET_FIELDS.ACTIVE] !== false,
    status: normalizeStatus(record[SNIPPET_FIELDS.STATUS]),
    // Mag null zijn: 6 van de 49 bestaande records hebben geen datum. Het
    // beheerscherm hoort dat te TONEN als iets dat ingevuld moet worden,
    // niet stil te verbergen achter een verzonnen datum.
    publishedOn: str(record[SNIPPET_FIELDS.PUBLISHED_ON]),
    type: relation(record[SNIPPET_FIELDS.TYPE]),
    tagIds: Array.isArray(record[SNIPPET_FIELDS.TAGS])
      ? record[SNIPPET_FIELDS.TAGS].map(Number).filter(Number.isInteger)
      : [],
    source: str(record[SNIPPET_FIELDS.SOURCE]),
    url: str(record[SNIPPET_FIELDS.URL]),
    cta: str(record[SNIPPET_FIELDS.CTA]),
    summary: str(record[SNIPPET_FIELDS.SUMMARY]),
    summaryTitle: str(record[SNIPPET_FIELDS.SUMMARY_TITLE]),
    color: normalizeColor(record[SNIPPET_FIELDS.COLOR]),
    quote: str(record[SNIPPET_FIELDS.QUOTE]),
    audience: str(record[SNIPPET_FIELDS.AUDIENCE]),
    curatorNote: str(record[SNIPPET_FIELDS.CURATOR_NOTE]),
    hasImage: Boolean(hasImage),
    // De versie staat APART in het DTO zodat het beheerscherm dezelfde
    // cachebuster kan gebruiken als de publieke URL, zonder die logica te
    // moeten overtypen in de browser-JS.
    imageVersion: hasImage ? imageVersion(record) : null,
    imageUrl: hasImage ? imageUrlFor(id, imageVersion(record)) : null,
    owner: relation(record[SNIPPET_FIELDS.OWNER]),
    updatedAt: str(record[SNIPPET_FIELDS.WRITE_DATE]),
    createdAt: str(record[SNIPPET_FIELDS.CREATE_DATE])
  };
}

/**
 * Het publieke DTO — de ENIGE vorm die de WordPress-plugin ooit te zien krijgt.
 *
 * HARDE REGEL, zelfde als toPublicEventDto() in events-v2: stel hier nooit
 * zelf een object samen in een route. Deze functie is de enige garantie dat
 * er geen interne sleutel meelekt. De sitesleutel is niet persoonsgebonden,
 * dus alles wat hier uit komt, geeft het aan iedereen die de sleutel van één
 * site heeft.
 *
 * Bewust NIET publiek: de eigenaar (`x_studio_user_id`) -- dat is een interne
 * medewerker en de feed is een publieke pagina. De status: wat niet
 * gepubliceerd is, komt er sowieso niet in, dus het veld zou enkel
 * verklappen dat er meer bestaat.
 */
export function toPublicSnippetDto(dto, {
  tagsById = new Map(), typesById = new Map(), origin = ''
} = {}) {
  if (!dto) return null;
  const type = dto.type ? typesById.get(dto.type.id) : null;
  const typeSlug = type ? type.slug : null;
  return {
    id: dto.id,
    // Waarmee de plugin tekent. Zie ITEM_KIND.
    kind: kindForTypeSlug(typeSlug),
    title: dto.title,
    summaryTitle: dto.summaryTitle,
    summary: dto.summary,
    publishedOn: dto.publishedOn,
    // Naam EN slug: de plugin filtert op slug en toont de naam. Alleen de
    // naam meegeven zou betekenen dat een hernoemd type in Odoo elke
    // shortcode op elke site stilletjes breekt.
    type: dto.type ? { name: type ? type.name : dto.type.name, slug: typeSlug } : null,
    tags: dto.tagIds
      .map((id) => tagsById.get(id))
      .filter(Boolean)
      .map((tag) => ({ name: tag.name, slug: tag.slug })),
    source: dto.source,
    url: dto.url,
    cta: dto.cta,
    quote: dto.quote,
    audience: dto.audience,
    curatorNote: dto.curatorNote,
    color: dto.color,
    imageUrl: dto.imageUrl ? `${origin}${dto.imageUrl}` : null
  };
}

/**
 * WAARMEE een item getekend wordt -- los van de CATEGORIE waarop je filtert.
 *
 * Het onderscheid is de hele reden dat de feed later polls, video's, events
 * en reacties kan tonen: de plugin kiest haar renderer op `kind`, niet op de
 * naam van een Odoo-type. Komt er een categorie bij die eruitziet als een
 * artikel, dan hoeft er in de plugin niets te gebeuren; komt er een echt
 * nieuwe SOORT bij, dan krijgt die hier een kind en in de plugin een renderer.
 */
export const ITEM_KIND = {
  ARTICLE: 'article',
  RELEASE: 'release',
  VIDEO: 'video',
  PODCAST: 'podcast',
  DOCUMENT: 'document'
};

/**
 * Van type-slug naar kind. Een onbekend type wordt een ARTIKEL: dat is de
 * vorm die altijd werkt (kop, tekst, link), dus een nieuw Odoo-type toont
 * meteen iets bruikbaars in plaats van niets.
 */
const KIND_PER_TYPE_SLUG = {
  artikel: ITEM_KIND.ARTICLE,
  'online-publicatie': ITEM_KIND.ARTICLE,
  'release-notes': ITEM_KIND.RELEASE,
  pdf: ITEM_KIND.DOCUMENT,
  webinar: ITEM_KIND.VIDEO,
  podcast: ITEM_KIND.PODCAST
};

export function kindForTypeSlug(slug) {
  return KIND_PER_TYPE_SLUG[String(slug || '')] || ITEM_KIND.ARTICLE;
}

/** Een type of label, in de vorm die zowel de UI als de plugin krijgt. */
export function toTaxonomyDto(record, { slugify }) {
  if (!record) return null;
  const name = str(record.x_name) || str(record.display_name);
  return {
    id: Number(record.id),
    name,
    slug: slugify(name || String(record.id))
  };
}

export { STATUS, STATUSES, TIMELINE_COLOR, TIMELINE_COLORS };
