/**
 * Content Feed (nieuws & updates) — Odoo-contract
 *
 * DIT IS DE ENIGE PLEK IN DE MODULE WAAR `x_`-VELDNAMEN MOGEN STAAN.
 * De rest van de module kent alleen nette namen en DTO's.
 *
 * Pure module: geen I/O, geen env, geen fetch. Alles is in/uit te testen met
 * een gewoon object. Alles wat Odoo moet aanroepen staat in lib/.
 *
 * Geverifieerd tegen de live Odoo-instantie op 2026-09-17 met fields_get,
 * ir.model.fields.selection en 49 echte records.
 * Onderbouwing en meetcijfers: docs/ontwerp-om-nieuws.md.
 */

import {
  STATUS,
  STATUSES,
  PUBLIC_VISIBLE_STATUSES,
  TIMELINE_COLOR,
  TIMELINE_COLORS,
  BRANDS
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
  // Optioneel: bestaat pas als het Studio-veld is aangemaakt. Zelfde patroon
  // als BRAND in events-v2 -- zie brandFieldAvailable().
  BRAND: 'x_studio_brand',
  // Optioneel, idem. De opvolger van de twee binaire velden; zie
  // FORBIDDEN_FIELDS.
  IMAGE_URL: 'x_studio_image_url',
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
    'Vuurt automation 27 naar een Zapier-hook. Buiten deze repo, niet te ' +
    'versioneren. Zie §7c van het ontwerp.',
  x_studio_ai_last_generated:
    'Hoort bij x_studio_generate_ai_content. Leeg op elk gecontroleerd record.',
  x_studio_image:
    'Binair veld. Base64 door elke JSON-RPC-respons heen; gebruik IMAGE_URL.',
  x_studio_content_image:
    'Tweede binair veld voor hetzelfde ding. Twee bronnen voor één afbeelding ' +
    'is een bug in wording; gebruik IMAGE_URL.',
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
  SNIPPET_FIELDS.WRITE_DATE
];

/**
 * De sorteersleutel van de tijdlijn, als Odoo-orderstring.
 *
 * `id desc` staat er alleen als TIEBREAK bij een gelijke datum -- zonder dat
 * is de volgorde van twee berichten van dezelfde dag willekeurig en wisselt
 * ze tussen twee verversingen, wat er op het scherm uitziet als een fout.
 */
export const SORT_ORDER = `${SNIPPET_FIELDS.PUBLISHED_ON} desc, id desc`;

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

/**
 * Bestaat het merkveld al in Odoo?
 *
 * Zelfde patroon als mailBlocksFieldAvailable() in events-v2: de module moet
 * blijven werken zolang het Studio-veld er niet is, anders is de volgorde van
 * uitrollen vastgeketend aan een handeling in Odoo.
 */
export function brandFieldAvailable(availableFieldNames) {
  return Array.isArray(availableFieldNames)
    && availableFieldNames.includes(SNIPPET_FIELDS.BRAND);
}

export function imageUrlFieldAvailable(availableFieldNames) {
  return Array.isArray(availableFieldNames)
    && availableFieldNames.includes(SNIPPET_FIELDS.IMAGE_URL);
}

/**
 * Hoort dit bericht op de feed van dit merk?
 *
 * LEEG = BEIDE. Zie de uitleg bij BRAND in constants.js: zou leeg "geen merk"
 * betekenen, dan maakt het aanmaken van het Studio-veld in één klap de hele
 * feed leeg, zonder foutmelding.
 */
export function matchesBrand(recordBrand, wantedBrand) {
  if (!wantedBrand) return true;
  const value = str(recordBrand);
  if (!value) return true;
  return value === wantedBrand;
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

// ─── DTO's ────────────────────────────────────────────────────────────────────

/**
 * Het interne DTO: alles wat het BEHEERSCHERM mag zien.
 * Dit is niet wat de website krijgt -- zie toPublicSnippetDto().
 */
export function toSnippetDto(record, { imageUrl = null } = {}) {
  if (!record) return null;
  const publishedOn = str(record[SNIPPET_FIELDS.PUBLISHED_ON]);
  return {
    id: Number(record[SNIPPET_FIELDS.ID]),
    title: str(record[SNIPPET_FIELDS.TITLE]),
    active: record[SNIPPET_FIELDS.ACTIVE] !== false,
    status: normalizeStatus(record[SNIPPET_FIELDS.STATUS]),
    // Mag null zijn: 6 van de 49 bestaande records hebben geen datum. Het
    // beheerscherm hoort dat te TONEN als iets dat ingevuld moet worden,
    // niet stil te verbergen achter een verzonnen datum.
    publishedOn,
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
    brand: str(record[SNIPPET_FIELDS.BRAND]),
    imageUrl: imageUrl ?? str(record[SNIPPET_FIELDS.IMAGE_URL]),
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
 * medewerker en de feed is een publieke pagina. En de status: wat niet
 * gepubliceerd is, komt er sowieso niet in, dus het veld zou enkel verklappen
 * dat er meer bestaat.
 */
export function toPublicSnippetDto(dto, { tagsById = new Map() } = {}) {
  if (!dto) return null;
  return {
    id: dto.id,
    title: dto.title,
    summaryTitle: dto.summaryTitle,
    summary: dto.summary,
    publishedOn: dto.publishedOn,
    type: dto.type ? dto.type.name : null,
    tags: dto.tagIds
      .map((id) => tagsById.get(id))
      .filter(Boolean)
      .map((tag) => ({ name: tag.name, slug: tag.slug })),
    source: dto.source,
    url: dto.url,
    cta: dto.cta,
    color: dto.color,
    imageUrl: dto.imageUrl
  };
}

export { STATUS, STATUSES, TIMELINE_COLOR, TIMELINE_COLORS, BRANDS };
